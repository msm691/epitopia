import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import type {
  ClientToServerEvents,
  EndVoteState,
  GameSettings,
  GameState,
  LobbyPlayer,
  LobbyState,
  PlayerId,
  ServerToClientEvents,
  ChatMessage,
  LobbyInfo,
} from "@polytopia/shared";
import {
  MAX_PLAYERS,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_CIV_COLORS,
} from "@polytopia/shared";
import {
  applyAction,
  isLegal,
  createInitialState,
  nextAIAction,
  checkVictory,
  mapSizeForPlayers,
} from "@polytopia/engine";

const DEFAULT_AI_STEP_MS = 350;
const DEFAULT_SKIP_MS = 30000;

export interface GameServerOptions {
  aiStepMs?: number;
  skipMs?: number;
}

export interface GameServer {
  port: number;
  close: () => Promise<void>;
}

// Représente une session de jeu (Lobby)
class LobbySession {
  id: string;
  name: string;
  password?: string | undefined;
  players: LobbyPlayer[] = [];
  started: boolean = false;
  state: GameState | null = null;
  aiTimer: ReturnType<typeof setTimeout> | null = null;
  settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  endVote: { approve: Set<PlayerId>; decline: Set<PlayerId>; needed: number; humans: number } | null = null;
  // Associe un sessionId (client) à un PlayerId dans ce lobby
  sessionToPlayerId = new Map<string, number>();

  constructor(id: string, name: string, password?: string) {
    this.id = id;
    this.name = name;
    this.password = password;
  }
}

export function createGameServer(port = 3001, opts: GameServerOptions = {}): Promise<GameServer> {
  const aiStepMs = opts.aiStepMs ?? DEFAULT_AI_STEP_MS;
  const skipMs = opts.skipMs ?? DEFAULT_SKIP_MS;
  const http: HttpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin: "*" },
  });

  const lobbies = new Map<string, LobbySession>();
  
  const socketSessions = new Map<string, { sessionId: string; name: string; lobbyId?: string | undefined }>();

  const getLobbyInfoList = (): LobbyInfo[] => {
    const list: LobbyInfo[] = [];
    for (const [id, lobby] of lobbies.entries()) {
      // On peut n'afficher que les lobbys non commencés
      list.push({
        id,
        name: lobby.name,
        hasPassword: !!lobby.password,
        currentPlayers: lobby.players.length,
        maxPlayers: MAX_PLAYERS,
        started: lobby.started,
      });
    }
    return list;
  };

  const pickColor = (lobby: LobbySession): string => {
    const used = new Set(lobby.players.map((p) => p.color));
    const free = DEFAULT_CIV_COLORS.filter((c) => !used.has(c));
    const pool = free.length > 0 ? free : DEFAULT_CIV_COLORS;
    return pool[Math.floor(Math.random() * pool.length)] ?? "#ffffff";
  };

  const lobbySnapshot = (lobby: LobbySession): LobbyState => ({
    id: lobby.id,
    name: lobby.name,
    players: lobby.players.map((p) => ({ ...p })),
    hostId: lobby.players[0]?.id ?? null,
    started: lobby.started,
    maxPlayers: MAX_PLAYERS,
    settings: lobby.settings,
  });

  const broadcastLobby = (lobby: LobbySession) => io.to(lobby.id).emit("lobby", lobbySnapshot(lobby));
  const broadcastState = (lobby: LobbySession) => {
    if (lobby.state) io.to(lobby.id).emit("state", lobby.state);
  };
  const broadcastLobbiesList = () => io.emit("lobbiesList", getLobbyInfoList());

  const reassignIds = (lobby: LobbySession) => {
    lobby.players.forEach((p, i) => (p.id = i));
    // Reconstruire sessionToPlayerId
    lobby.sessionToPlayerId.clear();
    // Nous devons associer chaque socketId au nouveau playerId
    for (const [sid, session] of socketSessions) {
      if (session.lobbyId === lobby.id) {
        const player = lobby.players.find(p => p.name === session.name);
        if (player) {
          lobby.sessionToPlayerId.set(session.sessionId, player.id);
          io.to(sid).emit("assigned", player.id);
        }
      }
    }
  };

  const isHost = (lobby: LobbySession, sid: string) => {
    const sess = socketSessions.get(sid);
    if (!sess) return false;
    const pid = lobby.sessionToPlayerId.get(sess.sessionId);
    return pid === lobby.players[0]?.id && lobby.players.length > 0;
  };

  const connectedHumanCount = (lobby: LobbySession): number =>
    lobby.players.filter((p) => !p.isAI && p.connected).length;

  const endVoteSnapshot = (lobby: LobbySession): EndVoteState | null =>
    lobby.endVote
      ? {
          approve: [...lobby.endVote.approve],
          decline: [...lobby.endVote.decline],
          needed: lobby.endVote.needed,
          humans: lobby.endVote.humans,
        }
      : null;
  const broadcastEndVote = (lobby: LobbySession) => io.to(lobby.id).emit("endVote", endVoteSnapshot(lobby));

  function evaluateEndVote(lobby: LobbySession): void {
    if (!lobby.endVote || !lobby.state) return;
    if (lobby.endVote.approve.size >= lobby.endVote.needed) {
      lobby.state = { ...lobby.state, turnLimit: lobby.state.turn - 1 };
      lobby.endVote = null;
      clearTurnTimer(lobby);
      broadcastState(lobby);
      broadcastEndVote(lobby);
      io.to(lobby.id).emit("turnTimer", null);
      return;
    }
    if (lobby.endVote.approve.size + lobby.endVote.decline.size >= lobby.endVote.humans) {
      lobby.endVote = null;
    }
    broadcastEndVote(lobby);
  }

  const clearTurnTimer = (lobby: LobbySession) => {
    if (lobby.aiTimer) clearTimeout(lobby.aiTimer);
    lobby.aiTimer = null;
  };

  function forceEndTurn(lobby: LobbySession): void {
    if (!lobby.started || !lobby.state) return;
    try {
      if (isLegal(lobby.state, { type: "END_TURN" })) {
        lobby.state = applyAction(lobby.state, { type: "END_TURN" });
      }
    } catch (e) {
      console.error("[server] END_TURN forcé en échec", e);
    }
    broadcastState(lobby);
    driveTurn(lobby);
  }

  function broadcastActionLog(lobby: LobbySession, action: any, playerId: number) {
    let text = null;
    if (action.type === "FOUND_CITY") text = "A fondé une nouvelle ville.";
    else if (action.type === "CAPTURE_CITY") text = "A capturé une ville.";
    else if (action.type === "RESEARCH_TECH") text = "A débloqué une nouvelle technologie.";
    
    if (text) {
      io.to(lobby.id).emit("chatMessage", {
        id: `sys-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        senderId: playerId,
        text,
        timestamp: Date.now(),
      });
    }
  }

  function stepAI(lobby: LobbySession): void {
    if (!lobby.started || !lobby.state) return;
    const p = lobby.state.players[lobby.state.currentPlayer];
    if (!p?.isAI || checkVictory(lobby.state).over) return;
    try {
      const action = nextAIAction(lobby.state, lobby.state.currentPlayer);
      lobby.state = applyAction(lobby.state, action);
      broadcastActionLog(lobby, action, lobby.state.currentPlayer);
    } catch (e) {
      console.error("[server] erreur IA, on saute le tour", e);
      forceEndTurn(lobby);
      return;
    }
    broadcastState(lobby);
    driveTurn(lobby);
  }

  function driveTurn(lobby: LobbySession): void {
    clearTurnTimer(lobby);
    if (!lobby.started || !lobby.state || checkVictory(lobby.state).over) {
      io.to(lobby.id).emit("turnTimer", null);
      return;
    }
    const cur = lobby.state.players[lobby.state.currentPlayer];
    if (!cur) return;
    if (cur.isAI) {
      lobby.aiTimer = setTimeout(() => stepAI(lobby), aiStepMs);
      io.to(lobby.id).emit("turnTimer", null);
      return;
    }
    const slot = lobby.players.find((p) => p.id === cur.id);
    if (slot && !slot.connected) {
      lobby.aiTimer = setTimeout(() => forceEndTurn(lobby), skipMs);
      io.to(lobby.id).emit("turnTimer", null);
    } else if (lobby.settings.turnSeconds != null) {
      lobby.aiTimer = setTimeout(() => forceEndTurn(lobby), lobby.settings.turnSeconds! * 1000);
      io.to(lobby.id).emit("turnTimer", lobby.settings.turnSeconds);
    } else {
      io.to(lobby.id).emit("turnTimer", null);
    }
  }

  function resetGame(lobby: LobbySession): void {
    clearTurnTimer(lobby);
    lobby.started = false;
    lobby.state = null;
    lobby.endVote = null;
    io.to(lobby.id).emit("endVote", null);
    io.to(lobby.id).emit("turnTimer", null);
  }

  io.on("connection", (socket) => {
    socket.on("join", ({ name, sessionId }) => {
      socketSessions.set(socket.id, { sessionId, name: name || "Joueur" });
      
      // Chercher si le joueur était déjà dans un lobby avec ce sessionId
      let foundLobby: LobbySession | null = null;
      let foundPlayer: LobbyPlayer | null = null;

      for (const lobby of lobbies.values()) {
        const pid = lobby.sessionToPlayerId.get(sessionId);
        if (pid !== undefined) {
          foundLobby = lobby;
          foundPlayer = lobby.players.find(p => p.id === pid) || null;
          break;
        }
      }

      if (foundLobby && foundPlayer) {
        socketSessions.set(socket.id, { sessionId, name: foundPlayer.name, lobbyId: foundLobby.id });
        socket.join(foundLobby.id);
        foundPlayer.connected = true;
        socket.emit("joinedLobby", foundLobby.id);
        socket.emit("assigned", foundPlayer.id);
        if (foundLobby.state) socket.emit("state", foundLobby.state);
        socket.emit("lobbyUpdate", foundLobby.toInfo());
        broadcastLobby(foundLobby);
        driveTurn(foundLobby);
      } else {
        socket.emit("lobbiesList", getLobbyInfoList());
      }
    });

    socket.on("getLobbies", () => {
      socket.emit("lobbiesList", getLobbyInfoList());
    });

    socket.on("createLobby", ({ name, password }) => {
      const sess = socketSessions.get(socket.id);
      if (!sess) return;
      const lobbyId = randomUUID().substring(0, 8);
      const lobby = new LobbySession(lobbyId, name || "Partie de " + sess.name, password);
      lobbies.set(lobbyId, lobby);
      
      sess.lobbyId = lobbyId;
      socket.join(lobbyId);

      const player: LobbyPlayer = {
        id: 0,
        name: sess.name,
        color: pickColor(lobby),
        connected: true,
        isAI: false,
      };
      lobby.players.push(player);
      lobby.sessionToPlayerId.set(sess.sessionId, player.id);

      socket.emit("joinedLobby", lobbyId);
      socket.emit("assigned", player.id);
      broadcastLobby(lobby);
      broadcastLobbiesList();
    });

    socket.on("joinLobby", ({ lobbyId, password }) => {
      const sess = socketSessions.get(socket.id);
      if (!sess) return;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit("errorMsg", "Lobby introuvable.");
        return;
      }
      if (lobby.password && lobby.password !== password) {
        socket.emit("errorMsg", "Mot de passe incorrect.");
        return;
      }
      if (lobby.started) {
        socket.emit("errorMsg", "Partie déjà lancée.");
        return;
      }
      if (lobby.players.length >= MAX_PLAYERS) {
        socket.emit("errorMsg", "Lobby plein.");
        return;
      }

      sess.lobbyId = lobbyId;
      socket.join(lobbyId);

      const player: LobbyPlayer = {
        id: lobby.players.length,
        name: sess.name,
        color: pickColor(lobby),
        connected: true,
        isAI: false,
      };
      lobby.players.push(player);
      lobby.sessionToPlayerId.set(sess.sessionId, player.id);

      socket.emit("joinedLobby", lobbyId);
      socket.emit("assigned", player.id);
      broadcastLobby(lobby);
      broadcastLobbiesList();
    });

    socket.on("leaveLobby", () => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby) return;

      const pid = lobby.sessionToPlayerId.get(sess.sessionId);
      if (pid !== undefined) {
        const player = lobby.players.find(p => p.id === pid);
        if (player) {
          if (lobby.started) {
            player.connected = false;
            // On libère le slot session pour que le joueur puisse rejoindre d'autres parties
            lobby.sessionToPlayerId.delete(sess.sessionId);
          } else {
            const idx = lobby.players.indexOf(player);
            if (idx >= 0) lobby.players.splice(idx, 1);
            lobby.sessionToPlayerId.delete(sess.sessionId);
            reassignIds(lobby);
          }
        }
      }

      socket.leave(sess.lobbyId);
      sess.lobbyId = undefined;
      socket.emit("lobbiesList", getLobbyInfoList());

      const connectedHumans = lobby.players.filter((p) => !p.isAI && p.connected);
      if (connectedHumans.length === 0) {
        lobbies.delete(lobby.id);
        broadcastLobbiesList();
      } else {
        broadcastLobby(lobby);
        driveTurn(lobby);
      }
    });

    socket.on("addBot", () => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !isHost(lobby, socket.id) || lobby.started || lobby.players.length >= MAX_PLAYERS) return;

      const id = lobby.players.length;
      lobby.players.push({
        id,
        name: `IA ${id + 1}`,
        color: pickColor(lobby),
        connected: true,
        isAI: true,
      });
      broadcastLobby(lobby);
    });

    socket.on("removeBot", () => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !isHost(lobby, socket.id) || lobby.started) return;

      if (lobby.players.at(-1)?.isAI) {
        lobby.players.pop();
        broadcastLobby(lobby);
      }
    });

    socket.on("kick", (playerId) => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !isHost(lobby, socket.id) || lobby.started) return;

      const target = lobby.players[playerId];
      if (!target || target === lobby.players[0]) return;
      
      // Trouver la session du joueur kick
      let targetSid: string | null = null;
      let targetSessionId: string | null = null;
      for (const [sId, pid] of lobby.sessionToPlayerId.entries()) {
        if (pid === playerId) {
          targetSessionId = sId;
          break;
        }
      }
      if (targetSessionId) {
        for (const [sid, session] of socketSessions.entries()) {
          if (session.sessionId === targetSessionId) {
            targetSid = sid;
            break;
          }
        }
      }

      lobby.players.splice(playerId, 1);
      if (targetSessionId) lobby.sessionToPlayerId.delete(targetSessionId);

      if (targetSid) {
        io.to(targetSid).emit("kicked", "Vous avez été exclu par l'hôte.");
        const targetSess = socketSessions.get(targetSid);
        if (targetSess) {
          io.sockets.sockets.get(targetSid)?.leave(lobby.id);
          targetSess.lobbyId = undefined;
          io.to(targetSid).emit("lobbiesList", getLobbyInfoList());
        }
      }

      reassignIds(lobby);
      broadcastLobby(lobby);
    });

    socket.on("setSettings", (s) => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !isHost(lobby, socket.id) || lobby.started) return;

      const mapType: GameSettings["mapType"] =
        s.mapType === "continents" || s.mapType === "archipel" ? s.mapType : "terres";
      lobby.settings = {
        turnLimit: s.turnLimit == null ? null : Math.max(1, Math.floor(s.turnLimit)),
        turnSeconds: s.turnSeconds == null ? null : Math.max(5, Math.floor(s.turnSeconds)),
        mapSize: s.mapSize == null ? null : Math.max(8, Math.min(28, Math.floor(s.mapSize))),
        mapType,
        weatherEnabled: !!s.weatherEnabled,
        bossesEnabled: !!s.bossesEnabled,
        rpgModeEnabled: !!s.rpgModeEnabled,
        wondersEnabled: !!s.wondersEnabled,
        navalCombatEnabled: !!s.navalCombatEnabled,
      };
      broadcastLobby(lobby);
    });

    socket.on("start", () => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !isHost(lobby, socket.id)) return;
      if (lobby.started || lobby.players.length < 2) return;

      reassignIds(lobby);
      lobby.started = true;
      lobby.endVote = null;
      const size = lobby.settings.mapSize ?? mapSizeForPlayers(lobby.players.length, lobby.settings.mapType);
      lobby.state = createInitialState({
        seed: Date.now() & 0xffffffff,
        width: size,
        height: size,
        turnLimit: lobby.settings.turnLimit,
        mapType: lobby.settings.mapType,
        playerInfos: lobby.players.map((p) => ({ name: p.name, color: p.color, isAI: p.isAI })),
      });
      broadcastLobby(lobby);
      broadcastState(lobby);
      io.to(lobby.id).emit("endVote", null);
      driveTurn(lobby);
      broadcastLobbiesList();
    });

    socket.on("action", (action) => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !lobby.started || !lobby.state) return;

      const pid = lobby.sessionToPlayerId.get(sess.sessionId);
      if (pid === undefined || pid !== lobby.state.currentPlayer) {
        socket.emit("errorMsg", "Ce n'est pas votre tour.");
        return;
      }
      if (!isLegal(lobby.state, action)) {
        socket.emit("errorMsg", `Action illégale : ${action.type}`);
        return;
      }
      try {
        lobby.state = applyAction(lobby.state, action);
        broadcastActionLog(lobby, action, pid);
      } catch (e) {
        console.error("[server] applyAction a échoué", e);
        socket.emit("errorMsg", "Erreur interne sur l'action.");
        return;
      }
      broadcastState(lobby);
      driveTurn(lobby);
    });

    socket.on("reset", () => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !isHost(lobby, socket.id)) return;
      resetGame(lobby);
      broadcastLobby(lobby);
      broadcastLobbiesList();
    });

    socket.on("endVoteStart", () => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !lobby.started || !lobby.state) return;

      const pid = lobby.sessionToPlayerId.get(sess.sessionId);
      if (pid === undefined) return;
      const player = lobby.players.find(p => p.id === pid);
      if (!player || player.isAI) return;

      if (lobby.state.turnLimit !== null) return;
      if (checkVictory(lobby.state).over || lobby.endVote) return;
      const humans = connectedHumanCount(lobby);
      const needed = Math.floor(humans / 2) + 1;
      lobby.endVote = { approve: new Set([player.id]), decline: new Set(), needed, humans };
      evaluateEndVote(lobby);
    });

    socket.on("endVoteCast", (approve) => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !lobby.started || !lobby.endVote) return;

      const pid = lobby.sessionToPlayerId.get(sess.sessionId);
      if (pid === undefined) return;

      lobby.endVote.approve.delete(pid);
      lobby.endVote.decline.delete(pid);
      if (approve) lobby.endVote.approve.add(pid);
      else lobby.endVote.decline.add(pid);
      evaluateEndVote(lobby);
    });

    socket.on("sendChat", (text) => {
      const sess = socketSessions.get(socket.id);
      if (!sess || !sess.lobbyId) return;
      const lobby = lobbies.get(sess.lobbyId);
      if (!lobby || !lobby.started) return;

      const pid = lobby.sessionToPlayerId.get(sess.sessionId);
      if (pid === undefined) return;

      io.to(lobby.id).emit("chatMessage", {
        id: `chat-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        senderId: pid,
        text,
        timestamp: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      const sess = socketSessions.get(socket.id);
      socketSessions.delete(socket.id);

      if (sess && sess.lobbyId) {
        const lobby = lobbies.get(sess.lobbyId);
        if (lobby) {
          const pid = lobby.sessionToPlayerId.get(sess.sessionId);

          let stillConnected = false;
          for (const s of socketSessions.values()) {
            if (s.sessionId === sess.sessionId) {
              stillConnected = true;
              break;
            }
          }

          if (lobby.started) {
            if (!stillConnected) {
              const player = lobby.players.find((p) => p.id === pid);
              if (player) {
                player.connected = false;
                broadcastLobby(lobby);
                driveTurn(lobby);
              }
            }
          } else {
            if (!stillConnected) {
              const player = lobby.players.find(p => p.id === pid);
              if (player) {
                const idx = lobby.players.indexOf(player);
                if (idx >= 0) lobby.players.splice(idx, 1);
                lobby.sessionToPlayerId.delete(sess.sessionId);
                reassignIds(lobby);
              }
            }
          }

          const connectedHumans = lobby.players.filter((p) => !p.isAI && p.connected);
          if (connectedHumans.length === 0) {
            lobbies.delete(lobby.id);
            broadcastLobbiesList();
          } else {
            broadcastLobby(lobby);
            driveTurn(lobby);
          }
        }
      }
    });
  });

  return new Promise((resolve) => {
    http.listen(port, () => {
      const addr = http.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: boundPort,
        close: () =>
          new Promise<void>((res) => {
            io.close(() => http.close(() => res()));
          }),
      });
    });
  });
}
