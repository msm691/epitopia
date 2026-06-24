/**
 * Serveur autoritaire (socket.io) — une partie unique.
 * Détient le GameState officiel : valide les Actions reçues (isLegal + c'est
 * bien ton tour), les applique (applyAction) et diffuse le nouvel état.
 * AUCUNE règle de jeu ici : tout passe par l'engine.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  EndVoteState,
  GameSettings,
  GameState,
  LobbyPlayer,
  LobbyState,
  PlayerId,
  ServerToClientEvents,
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

/** Délai entre deux actions d'IA (lisibilité côté joueurs). */
const DEFAULT_AI_STEP_MS = 350;
/** Délai avant de sauter le tour d'un humain déconnecté (anti-blocage). */
const DEFAULT_SKIP_MS = 8000;

export interface GameServerOptions {
  aiStepMs?: number;
  skipMs?: number;
}

export interface GameServer {
  port: number;
  close: () => Promise<void>;
}

export function createGameServer(port = 3001, opts: GameServerOptions = {}): Promise<GameServer> {
  const aiStepMs = opts.aiStepMs ?? DEFAULT_AI_STEP_MS;
  const skipMs = opts.skipMs ?? DEFAULT_SKIP_MS;
  const http: HttpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin: "*" },
  });

  // État du lobby / de la partie. socketToPlayer pointe vers l'OBJET joueur,
  // stable même si les indices changent (kick/déconnexion).
  const lobby: LobbyPlayer[] = [];
  const socketToPlayer = new Map<string, LobbyPlayer>();
  let started = false;
  let state: GameState | null = null;
  let aiTimer: ReturnType<typeof setTimeout> | null = null;
  let settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  /** Vote de fin en cours (mode infini), ou null. */
  let endVote: { approve: Set<PlayerId>; decline: Set<PlayerId>; needed: number; humans: number } | null = null;

  /** Couleur attribuée par le serveur : tirée au hasard parmi les couleurs LIBRES
   *  (jamais deux joueurs de la même couleur tant qu'il en reste). */
  const pickColor = (): string => {
    const used = new Set(lobby.map((p) => p.color));
    const free = DEFAULT_CIV_COLORS.filter((c) => !used.has(c));
    const pool = free.length > 0 ? free : DEFAULT_CIV_COLORS;
    return pool[Math.floor(Math.random() * pool.length)] ?? "#ffffff";
  };

  const lobbySnapshot = (): LobbyState => ({
    players: lobby.map((p) => ({ ...p })),
    hostId: lobby[0]?.id ?? null,
    started,
    maxPlayers: MAX_PLAYERS,
    settings,
  });

  const isHost = (sid: string) => socketToPlayer.get(sid) === lobby[0] && lobby.length > 0;
  const socketIdOf = (player: LobbyPlayer): string | undefined => {
    for (const [sid, p] of socketToPlayer) if (p === player) return sid;
    return undefined;
  };
  /** Recale les id sur l'index et prévient chaque client de son (nouvel) id. */
  const reassignIds = () => {
    lobby.forEach((p, i) => (p.id = i));
    for (const [sid, p] of socketToPlayer) io.to(sid).emit("assigned", p.id);
  };

  const broadcastLobby = () => io.emit("lobby", lobbySnapshot());
  const broadcastState = () => {
    if (state) io.emit("state", state);
  };

  const connectedHumanCount = (): number =>
    lobby.filter((p) => !p.isAI && p.connected).length;

  const endVoteSnapshot = (): EndVoteState | null =>
    endVote
      ? {
          approve: [...endVote.approve],
          decline: [...endVote.decline],
          needed: endVote.needed,
          humans: endVote.humans,
        }
      : null;
  const broadcastEndVote = () => io.emit("endVote", endVoteSnapshot());

  /** Évalue le vote : assez de POUR -> fin au score ; tout le monde a voté -> rejet. */
  function evaluateEndVote(): void {
    if (!endVote || !state) return;
    if (endVote.approve.size >= endVote.needed) {
      // Fin de partie au score : on place la limite juste avant le tour courant
      // (réutilise la victoire au score de l'engine, sans règle nouvelle).
      state = { ...state, turnLimit: state.turn - 1 };
      endVote = null;
      clearTurnTimer();
      broadcastState();
      broadcastEndVote();
      io.emit("turnTimer", null);
      return;
    }
    if (endVote.approve.size + endVote.decline.size >= endVote.humans) {
      endVote = null; // vote rejeté (tout le monde a répondu)
    }
    broadcastEndVote();
  }

  const clearTurnTimer = () => {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = null;
  };

  /** Force la fin du tour courant (IA en échec ou humain déconnecté). */
  function forceEndTurn(): void {
    if (!started || !state) return;
    try {
      if (isLegal(state, { type: "END_TURN" })) state = applyAction(state, { type: "END_TURN" });
    } catch (e) {
      console.error("[server] END_TURN forcé en échec", e);
    }
    broadcastState();
    driveTurn();
  }

  /** Joue une action d'IA, en protégeant le serveur de toute exception. */
  function stepAI(): void {
    if (!started || !state) return;
    const p = state.players[state.currentPlayer];
    if (!p?.isAI || checkVictory(state).over) return;
    try {
      state = applyAction(state, nextAIAction(state, state.currentPlayer));
    } catch (e) {
      console.error("[server] erreur IA, on saute le tour", e);
      forceEndTurn();
      return;
    }
    broadcastState();
    driveTurn();
  }

  /**
   * Pilote le tour courant : programme l'IA si c'est un bot, ou un saut
   * automatique si c'est un humain déconnecté. Garantit que la partie avance.
   */
  function driveTurn(): void {
    clearTurnTimer();
    if (!started || !state || checkVictory(state).over) {
      io.emit("turnTimer", null);
      return;
    }
    const cur = state.players[state.currentPlayer];
    if (!cur) return;
    if (cur.isAI) {
      aiTimer = setTimeout(stepAI, aiStepMs);
      io.emit("turnTimer", null);
      return;
    }
    const slot = lobby.find((p) => p.id === cur.id);
    if (slot && !slot.connected) {
      // Humain déconnecté : saut automatique (anti-blocage).
      aiTimer = setTimeout(forceEndTurn, skipMs);
      io.emit("turnTimer", null);
    } else if (settings.turnSeconds != null) {
      // Humain connecté avec limite de temps : fin de tour auto à l'expiration.
      aiTimer = setTimeout(forceEndTurn, settings.turnSeconds * 1000);
      io.emit("turnTimer", settings.turnSeconds);
    } else {
      io.emit("turnTimer", null);
    }
  }

  function resetGame(): void {
    clearTurnTimer();
    started = false;
    state = null;
    endVote = null;
    io.emit("endVote", null);
    io.emit("turnTimer", null);
  }

  io.on("connection", (socket) => {
    socket.on("join", ({ name }) => {
      if (started) {
        // Reconnexion : reprendre un slot déconnecté de même nom.
        const slot = lobby.find((p) => p.name === name && !p.connected);
        if (slot) {
          slot.connected = true;
          socketToPlayer.set(socket.id, slot);
          socket.emit("assigned", slot.id);
          if (state) socket.emit("state", state);
          broadcastLobby();
          driveTurn(); // annule un éventuel saut auto si le revenant est de tour
        } else {
          socket.emit("errorMsg", "Partie déjà lancée.");
        }
        return;
      }
      if (lobby.length >= MAX_PLAYERS) {
        socket.emit("errorMsg", "Lobby plein.");
        return;
      }
      const player: LobbyPlayer = {
        id: lobby.length,
        name: name || `Joueur ${lobby.length + 1}`,
        color: pickColor(),
        connected: true,
        isAI: false,
      };
      lobby.push(player);
      socketToPlayer.set(socket.id, player);
      socket.emit("assigned", player.id);
      broadcastLobby();
    });

    socket.on("addBot", () => {
      if (!isHost(socket.id) || started || lobby.length >= MAX_PLAYERS) return;
      const id = lobby.length;
      lobby.push({
        id,
        name: `IA ${id + 1}`,
        color: pickColor(),
        connected: true,
        isAI: true,
      });
      broadcastLobby();
    });

    socket.on("removeBot", () => {
      if (!isHost(socket.id) || started) return;
      if (lobby.at(-1)?.isAI) {
        lobby.pop();
        broadcastLobby();
      }
    });

    socket.on("kick", (playerId) => {
      if (!isHost(socket.id) || started) return;
      const target = lobby[playerId];
      if (!target || target === lobby[0]) return; // ni inconnu, ni l'hôte lui-même
      const sid = socketIdOf(target);
      lobby.splice(playerId, 1);
      if (sid) {
        socketToPlayer.delete(sid);
        io.to(sid).emit("kicked", "Vous avez été exclu par l'hôte.");
      }
      reassignIds();
      broadcastLobby();
    });

    socket.on("setSettings", (s) => {
      if (!isHost(socket.id) || started) return; // seul l'hôte, avant lancement
      const mapType: GameSettings["mapType"] =
        s.mapType === "continents" || s.mapType === "archipel" ? s.mapType : "terres";
      settings = {
        turnLimit: s.turnLimit == null ? null : Math.max(1, Math.floor(s.turnLimit)),
        turnSeconds: s.turnSeconds == null ? null : Math.max(5, Math.floor(s.turnSeconds)),
        mapSize: s.mapSize == null ? null : Math.max(8, Math.min(28, Math.floor(s.mapSize))),
        mapType,
      };
      broadcastLobby();
    });

    socket.on("start", () => {
      if (!isHost(socket.id)) return; // seul l'hôte lance
      if (started || lobby.length < 2) return; // au moins 2 joueurs (humains + IA)

      reassignIds();
      started = true;
      endVote = null;
      const size = settings.mapSize ?? mapSizeForPlayers(lobby.length, settings.mapType);
      state = createInitialState({
        seed: Date.now() & 0xffffffff,
        width: size,
        height: size,
        turnLimit: settings.turnLimit,
        mapType: settings.mapType,
        playerInfos: lobby.map((p) => ({ name: p.name, color: p.color, isAI: p.isAI })),
      });
      broadcastLobby();
      broadcastState();
      io.emit("endVote", null);
      driveTurn(); // si le joueur 0 est une IA / démarre le minuteur de tour
    });

    socket.on("action", (action) => {
      const player = socketToPlayer.get(socket.id);
      if (!started || !state || !player) {
        socket.emit("errorMsg", "Partie non démarrée.");
        return;
      }
      if (player.id !== state.currentPlayer) {
        socket.emit("errorMsg", "Ce n'est pas votre tour.");
        return;
      }
      if (!isLegal(state, action)) {
        socket.emit("errorMsg", `Action illégale : ${action.type}`);
        return;
      }
      try {
        state = applyAction(state, action);
      } catch (e) {
        console.error("[server] applyAction a échoué", e);
        socket.emit("errorMsg", "Erreur interne sur l'action.");
        return;
      }
      broadcastState();
      driveTurn(); // le tour peut être passé à une IA
    });

    socket.on("reset", () => {
      if (!isHost(socket.id)) return; // seul l'hôte
      resetGame();
      broadcastLobby();
    });

    socket.on("endVoteStart", () => {
      const player = socketToPlayer.get(socket.id);
      if (!started || !state || !player || player.isAI) return;
      if (state.turnLimit !== null) return; // vote réservé au mode infini
      if (checkVictory(state).over || endVote) return;
      const humans = connectedHumanCount();
      const needed = Math.floor(humans / 2) + 1; // strictement plus de la moitié
      endVote = { approve: new Set([player.id]), decline: new Set(), needed, humans };
      evaluateEndVote();
    });

    socket.on("endVoteCast", (approve) => {
      const player = socketToPlayer.get(socket.id);
      if (!started || !player || player.isAI || !endVote) return;
      endVote.approve.delete(player.id);
      endVote.decline.delete(player.id);
      if (approve) endVote.approve.add(player.id);
      else endVote.decline.add(player.id);
      evaluateEndVote();
    });

    socket.on("disconnect", () => {
      const player = socketToPlayer.get(socket.id);
      socketToPlayer.delete(socket.id);
      if (player) {
        if (started) {
          player.connected = false; // garde le slot pour reconnexion
        } else {
          const idx = lobby.indexOf(player);
          if (idx >= 0) lobby.splice(idx, 1); // avant lancement : on libère la place
          reassignIds();
        }
      }
      // Reset complet quand plus aucun humain n'est connecté (les bots ne comptent pas).
      const connectedHumans = lobby.filter((p) => !p.isAI && p.connected);
      if (connectedHumans.length === 0) {
        lobby.length = 0;
        socketToPlayer.clear();
        settings = { ...DEFAULT_GAME_SETTINGS };
        resetGame();
      } else {
        broadcastLobby();
        driveTurn(); // si le déconnecté était de tour, programme le saut auto
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
