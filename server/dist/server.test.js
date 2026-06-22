import { describe, it, expect, afterEach } from "vitest";
import { io } from "socket.io-client";
import { createGameServer } from "./gameServer.js";
let server = null;
const clients = [];
afterEach(async () => {
    for (const c of clients)
        c.disconnect();
    clients.length = 0;
    if (server)
        await server.close();
    server = null;
});
function connect(port) {
    const socket = io(`http://localhost:${port}`, {
        transports: ["websocket"],
        forceNew: true,
    });
    clients.push(socket);
    return socket;
}
/** Attend le prochain événement `event` (avec timeout). */
function waitFor(socket, event) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout: ${String(event)}`)), 2000);
        // @ts-expect-error - signature dynamique d'événement
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}
describe("serveur autoritaire (intégration socket.io)", () => {
    it("lobby : deux joueurs rejoignent et reçoivent leur id", async () => {
        server = await createGameServer(0);
        const host = connect(server.port);
        const idHost = await waitForJoin(host, "Alice", "#e23d3d");
        expect(idHost).toBe(0);
        const guest = connect(server.port);
        const lobbyP = waitFor(host, "lobby");
        const idGuest = await waitForJoin(guest, "Bob", "#3d7fe2");
        expect(idGuest).toBe(1);
        const lobby = await lobbyP;
        expect(lobby.players.map((p) => p.name)).toContain("Bob");
        expect(lobby.hostId).toBe(0);
    });
    it("partie : l'hôte lance, les tours s'enchaînent, hors-tour rejeté", async () => {
        server = await createGameServer(0);
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        const guest = connect(server.port);
        await waitForJoin(guest, "Bob", "#3d7fe2");
        // Lancement par l'hôte.
        const hostState = waitFor(host, "state");
        const guestState = waitFor(guest, "state");
        host.emit("start");
        const s0 = await hostState;
        await guestState;
        expect(s0.players).toHaveLength(2);
        expect(s0.currentPlayer).toBe(0);
        // Le joueur 0 (hôte) finit son tour -> joueur 1.
        const afterEnd = waitFor(guest, "state");
        host.emit("action", { type: "END_TURN" });
        const s1 = await afterEnd;
        expect(s1.currentPlayer).toBe(1);
        // L'hôte rejoue hors de son tour -> erreur.
        const err = waitFor(host, "errorMsg");
        host.emit("action", { type: "END_TURN" });
        expect(await err).toMatch(/tour/i);
    });
    it("refuse de lancer à un seul joueur", async () => {
        server = await createGameServer(0);
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        host.emit("start");
        const outcome = await Promise.race([
            waitFor(host, "state").then(() => "started"),
            delay(300).then(() => "blocked"),
        ]);
        expect(outcome).toBe("blocked");
    });
    it("l'hôte peut relancer : reset renvoie au lobby", async () => {
        server = await createGameServer(0);
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        const guest = connect(server.port);
        await waitForJoin(guest, "Bob", "#3d7fe2");
        host.emit("start");
        await waitFor(host, "state");
        // Attend précisément un lobby revenu à started=false (évite la course
        // avec le lobby started=true émis au lancement).
        const lobby = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("timeout reset")), 2000);
            const handler = (l) => {
                if (!l.started) {
                    clearTimeout(timer);
                    guest.off("lobby", handler);
                    resolve(l);
                }
            };
            guest.on("lobby", handler);
            host.emit("reset");
        });
        expect(lobby.started).toBe(false);
    });
    it("l'hôte ajoute une IA, qui joue automatiquement son tour", async () => {
        server = await createGameServer(0);
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        // Ajoute un bot -> 2 joueurs.
        const lobbyWithBot = waitForLobby(host, (l) => l.players.some((p) => p.isAI));
        host.emit("addBot");
        const lobby = await lobbyWithBot;
        expect(lobby.players.some((p) => p.isAI)).toBe(true);
        // Lance, puis l'humain (joueur 0) finit son tour -> l'IA (joueur 1) joue seule
        // et rend la main au joueur 0 sans intervention humaine.
        host.emit("start");
        await waitFor(host, "state");
        const backToHuman = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("timeout IA")), 4000);
            const handler = (s) => {
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
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        const guest = connect(server.port);
        await waitForJoin(guest, "Bob", "#3d7fe2");
        host.emit("start");
        await waitFor(host, "state");
        // Le joueur 0 (hôte) finit -> tour du joueur 1 (Bob).
        const toBob = waitFor(host, "state");
        host.emit("action", { type: "END_TURN" });
        expect((await toBob).currentPlayer).toBe(1);
        // Bob se déconnecte pendant son tour -> le serveur saute après skipMs.
        const backToAlice = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("timeout skip")), 3000);
            const handler = (s) => {
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
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        const guest = connect(server.port);
        await waitForJoin(guest, "Bob", "#3d7fe2");
        // Bob est prévenu de son exclusion ; le lobby ne contient plus que l'hôte.
        const kicked = waitFor(guest, "kicked");
        const lobbyAfter = waitForLobby(host, (l) => l.players.length === 1);
        host.emit("kick", 1);
        await kicked;
        const lobby = await lobbyAfter;
        expect(lobby.players[0].name).toBe("Alice");
    });
    it("réindexe les id après exclusion (le joueur restant devient 0)", async () => {
        server = await createGameServer(0);
        const host = connect(server.port);
        await waitForJoin(host, "Alice", "#e23d3d");
        const mid = connect(server.port);
        await waitForJoin(mid, "Bob", "#3d7fe2");
        const last = connect(server.port);
        const lastId = await waitForJoin(last, "Carol", "#3dbf57");
        expect(lastId).toBe(2);
        // L'hôte exclut Bob (id 1) -> Carol passe de l'id 2 à 1.
        const reassigned = waitFor(last, "assigned");
        host.emit("kick", 1);
        expect(await reassigned).toBe(1);
    });
});
function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
/** Attend un événement `lobby` satisfaisant `pred` (évite les courses). */
function waitForLobby(socket, pred) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout lobby")), 2000);
        const handler = (l) => {
            if (pred(l)) {
                clearTimeout(timer);
                socket.off("lobby", handler);
                resolve(l);
            }
        };
        socket.on("lobby", handler);
    });
}
/** Émet `join` et résout l'id assigné. */
function waitForJoin(socket, name, color) {
    const assigned = waitFor(socket, "assigned");
    socket.emit("join", { name, color });
    return assigned;
}
//# sourceMappingURL=server.test.js.map