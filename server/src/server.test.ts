import { describe, it, expect, afterEach } from "vitest";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameState,
  LobbyState,
  ServerToClientEvents,
  LobbyInfo,
} from "@polytopia/shared";
import { createGameServer, type GameServer } from "./gameServer.js";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer | null = null;
const clients: ClientSocket[] = [];

afterEach(async () => {
  for (const c of clients) c.disconnect();
  clients.length = 0;
  if (server) await server.close();
  server = null;
});

function connect(port: number): ClientSocket {
  const socket: ClientSocket = io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}

function waitFor<T>(socket: ClientSocket, event: keyof ServerToClientEvents): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${String(event)}`)), 2000);
    // @ts-expect-error - signature dynamique d'événement
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe("serveur autoritaire (intégration socket.io)", () => {
  it("lobby : deux joueurs rejoignent et reçoivent leur id", async () => {
    server = await createGameServer(0);
    const host = connect(server.port);
    const hostSession = Math.random().toString();
    host.emit("join", { name: "Alice", sessionId: hostSession });
    await waitFor(host, "lobbiesList");
    
    const hostAssigned = waitFor<number>(host, "assigned");
    const hostJoined = waitFor<string>(host, "joinedLobby");
    host.emit("createLobby", { name: "Partie de test" });
    const idHost = await hostAssigned;
    const lobbyId = await hostJoined;
    expect(idHost).toBe(0);

    const guest = connect(server.port);
    const guestSession = Math.random().toString();
    guest.emit("join", { name: "Bob", sessionId: guestSession });
    await waitFor(guest, "lobbiesList");

    const lobbyP = waitFor<LobbyState>(host, "lobby");
    const guestAssigned = waitFor<number>(guest, "assigned");
    guest.emit("joinLobby", { lobbyId });
    const idGuest = await guestAssigned;
    expect(idGuest).toBe(1);

    const lobby = await lobbyP;
    expect(lobby.players.map((p) => p.name)).toContain("Bob");
    expect(lobby.hostId).toBe(0);
  });

  // Pour simplifier les tests, on va abstraire la création/rejoindre le lobby
  async function setupLobbyAndJoinTwoPlayers(port: number) {
    const host = connect(port);
    host.emit("join", { name: "Alice", sessionId: Math.random().toString() });
    await waitFor(host, "lobbiesList");
    
    host.emit("createLobby", { name: "Test" });
    const lobbyId = await waitFor<string>(host, "joinedLobby");
    await waitFor<number>(host, "assigned");

    const guest = connect(port);
    guest.emit("join", { name: "Bob", sessionId: Math.random().toString() });
    await waitFor(guest, "lobbiesList");
    
    guest.emit("joinLobby", { lobbyId });
    await waitFor<string>(guest, "joinedLobby");
    await waitFor<number>(guest, "assigned");

    return { host, guest };
  }

  it("partie : l'hôte lance, les tours s'enchaînent, hors-tour rejeté", async () => {
    server = await createGameServer(0);
    const { host, guest } = await setupLobbyAndJoinTwoPlayers(server.port);

    const hostState = waitFor<GameState>(host, "state");
    const guestState = waitFor<GameState>(guest, "state");
    host.emit("start");
    const s0 = await hostState;
    await guestState;
    expect(s0.players).toHaveLength(2);
    expect(s0.currentPlayer).toBe(0);

    const afterEnd = waitFor<GameState>(guest, "state");
    host.emit("action", { type: "END_TURN" });
    const s1 = await afterEnd;
    expect(s1.currentPlayer).toBe(1);

    const err = waitFor<string>(host, "errorMsg");
    host.emit("action", { type: "END_TURN" });
    expect(await err).toMatch(/tour/i);
  });

  it("refuse de lancer à un seul joueur", async () => {
    server = await createGameServer(0);
    const host = connect(server.port);
    host.emit("join", { name: "Alice", sessionId: Math.random().toString() });
    await waitFor(host, "lobbiesList");
    host.emit("createLobby", { name: "Test" });
    await waitFor(host, "joinedLobby");

    host.emit("start");
    const outcome = await Promise.race([
      waitFor<GameState>(host, "state").then(() => "started"),
      delay(300).then(() => "blocked"),
    ]);
    expect(outcome).toBe("blocked");
  });

  it("l'hôte ajoute une IA, qui joue automatiquement son tour", async () => {
    server = await createGameServer(0);
    const host = connect(server.port);
    host.emit("join", { name: "Alice", sessionId: Math.random().toString() });
    await waitFor(host, "lobbiesList");
    host.emit("createLobby", { name: "Test" });
    await waitFor(host, "joinedLobby");

    const lobbyWithBot = waitForLobby(host, (l) => l.players.some((p) => p.isAI));
    host.emit("addBot");
    const lobby = await lobbyWithBot;
    expect(lobby.players.some((p) => p.isAI)).toBe(true);

    host.emit("start");
    await waitFor<GameState>(host, "state");

    const backToHuman = await new Promise<GameState>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout IA")), 4000);
      const handler = (s: GameState) => {
        if (s.currentPlayer === 0 && s.turn >= 2) {
          clearTimeout(timer);
          host.off("state", handler);
          resolve(s);
        }
      };
      host.on("state", handler);
      host.emit("action", { type: "END_TURN" });
    });
    expect(backToHuman.currentPlayer).toBe(0);
  });

  it("saute automatiquement le tour d'un humain déconnecté (anti-blocage)", async () => {
    server = await createGameServer(0, { skipMs: 150 });
    const { host, guest } = await setupLobbyAndJoinTwoPlayers(server.port);

    host.emit("start");
    await waitFor<GameState>(host, "state");

    const toBob = waitFor<GameState>(host, "state");
    host.emit("action", { type: "END_TURN" });
    expect((await toBob).currentPlayer).toBe(1);

    const backToAlice = new Promise<GameState>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout skip")), 3000);
      const handler = (s: GameState) => {
        if (s.currentPlayer === 0) {
          clearTimeout(timer);
          host.off("state", handler);
          resolve(s);
        }
      };
      host.on("state", handler);
    });
    guest.disconnect();
    clients.splice(clients.indexOf(guest), 1);
    expect((await backToAlice).currentPlayer).toBe(0);
  });

  it("l'hôte peut exclure un joueur avant le lancement", async () => {
    server = await createGameServer(0);
    const { host, guest } = await setupLobbyAndJoinTwoPlayers(server.port);

    const kicked = waitFor<string>(guest, "kicked");
    const lobbyAfter = waitForLobby(host, (l) => l.players.length === 1);
    host.emit("kick", 1);
    await kicked;
    const lobby = await lobbyAfter;
    expect(lobby.players[0]!.name).toBe("Alice");
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function waitForLobby(socket: ClientSocket, pred: (l: LobbyState) => boolean): Promise<LobbyState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout lobby")), 2000);
    const handler = (l: LobbyState) => {
      if (pred(l)) {
        clearTimeout(timer);
        socket.off("lobby", handler);
        resolve(l);
      }
    };
    socket.on("lobby", handler);
  });
}
