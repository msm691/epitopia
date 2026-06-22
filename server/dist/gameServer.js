/**
 * Serveur autoritaire (socket.io) — une partie unique.
 * Détient le GameState officiel : valide les Actions reçues (isLegal + c'est
 * bien ton tour), les applique (applyAction) et diffuse le nouvel état.
 * AUCUNE règle de jeu ici : tout passe par l'engine.
 */
import { createServer } from "node:http";
import { Server } from "socket.io";
import { MAX_PLAYERS, DEFAULT_TURN_LIMIT, DEFAULT_CIV_COLORS, } from "@polytopia/shared";
import { applyAction, isLegal, createInitialState, nextAIAction, checkVictory, mapSizeForPlayers, } from "@polytopia/engine";
/** Délai entre deux actions d'IA (lisibilité côté joueurs). */
const DEFAULT_AI_STEP_MS = 350;
/** Délai avant de sauter le tour d'un humain déconnecté (anti-blocage). */
const DEFAULT_SKIP_MS = 8000;
export function createGameServer(port = 3001, opts = {}) {
    const aiStepMs = opts.aiStepMs ?? DEFAULT_AI_STEP_MS;
    const skipMs = opts.skipMs ?? DEFAULT_SKIP_MS;
    const http = createServer();
    const io = new Server(http, {
        cors: { origin: "*" },
    });
    // État du lobby / de la partie. socketToPlayer pointe vers l'OBJET joueur,
    // stable même si les indices changent (kick/déconnexion).
    const lobby = [];
    const socketToPlayer = new Map();
    let started = false;
    let state = null;
    let aiTimer = null;
    const lobbySnapshot = () => ({
        players: lobby.map((p) => ({ ...p })),
        hostId: lobby[0]?.id ?? null,
        started,
        maxPlayers: MAX_PLAYERS,
    });
    const isHost = (sid) => socketToPlayer.get(sid) === lobby[0] && lobby.length > 0;
    const socketIdOf = (player) => {
        for (const [sid, p] of socketToPlayer)
            if (p === player)
                return sid;
        return undefined;
    };
    /** Recale les id sur l'index et prévient chaque client de son (nouvel) id. */
    const reassignIds = () => {
        lobby.forEach((p, i) => (p.id = i));
        for (const [sid, p] of socketToPlayer)
            io.to(sid).emit("assigned", p.id);
    };
    const broadcastLobby = () => io.emit("lobby", lobbySnapshot());
    const broadcastState = () => {
        if (state)
            io.emit("state", state);
    };
    const clearTurnTimer = () => {
        if (aiTimer)
            clearTimeout(aiTimer);
        aiTimer = null;
    };
    /** Force la fin du tour courant (IA en échec ou humain déconnecté). */
    function forceEndTurn() {
        if (!started || !state)
            return;
        try {
            if (isLegal(state, { type: "END_TURN" }))
                state = applyAction(state, { type: "END_TURN" });
        }
        catch (e) {
            console.error("[server] END_TURN forcé en échec", e);
        }
        broadcastState();
        driveTurn();
    }
    /** Joue une action d'IA, en protégeant le serveur de toute exception. */
    function stepAI() {
        if (!started || !state)
            return;
        const p = state.players[state.currentPlayer];
        if (!p?.isAI || checkVictory(state).over)
            return;
        try {
            state = applyAction(state, nextAIAction(state, state.currentPlayer));
        }
        catch (e) {
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
    function driveTurn() {
        clearTurnTimer();
        if (!started || !state || checkVictory(state).over)
            return;
        const cur = state.players[state.currentPlayer];
        if (!cur)
            return;
        if (cur.isAI) {
            aiTimer = setTimeout(stepAI, aiStepMs);
        }
        else {
            const slot = lobby.find((p) => p.id === cur.id);
            if (slot && !slot.connected)
                aiTimer = setTimeout(forceEndTurn, skipMs);
        }
    }
    function resetGame() {
        clearTurnTimer();
        started = false;
        state = null;
    }
    io.on("connection", (socket) => {
        socket.on("join", ({ name, color }) => {
            if (started) {
                // Reconnexion : reprendre un slot déconnecté de même nom.
                const slot = lobby.find((p) => p.name === name && !p.connected);
                if (slot) {
                    slot.connected = true;
                    socketToPlayer.set(socket.id, slot);
                    socket.emit("assigned", slot.id);
                    if (state)
                        socket.emit("state", state);
                    broadcastLobby();
                    driveTurn(); // annule un éventuel saut auto si le revenant est de tour
                }
                else {
                    socket.emit("errorMsg", "Partie déjà lancée.");
                }
                return;
            }
            if (lobby.length >= MAX_PLAYERS) {
                socket.emit("errorMsg", "Lobby plein.");
                return;
            }
            const player = {
                id: lobby.length,
                name: name || `Joueur ${lobby.length + 1}`,
                color,
                connected: true,
                isAI: false,
            };
            lobby.push(player);
            socketToPlayer.set(socket.id, player);
            socket.emit("assigned", player.id);
            broadcastLobby();
        });
        socket.on("addBot", () => {
            if (!isHost(socket.id) || started || lobby.length >= MAX_PLAYERS)
                return;
            const id = lobby.length;
            lobby.push({
                id,
                name: `IA ${id + 1}`,
                color: DEFAULT_CIV_COLORS[id] ?? "#ffffff",
                connected: true,
                isAI: true,
            });
            broadcastLobby();
        });
        socket.on("removeBot", () => {
            if (!isHost(socket.id) || started)
                return;
            if (lobby.at(-1)?.isAI) {
                lobby.pop();
                broadcastLobby();
            }
        });
        socket.on("kick", (playerId) => {
            if (!isHost(socket.id) || started)
                return;
            const target = lobby[playerId];
            if (!target || target === lobby[0])
                return; // ni inconnu, ni l'hôte lui-même
            const sid = socketIdOf(target);
            lobby.splice(playerId, 1);
            if (sid) {
                socketToPlayer.delete(sid);
                io.to(sid).emit("kicked", "Vous avez été exclu par l'hôte.");
            }
            reassignIds();
            broadcastLobby();
        });
        socket.on("start", (opts) => {
            if (!isHost(socket.id))
                return; // seul l'hôte lance
            if (started || lobby.length < 2)
                return; // au moins 2 joueurs (humains + IA)
            reassignIds();
            started = true;
            const size = mapSizeForPlayers(lobby.length);
            const turnLimit = opts?.turnLimit === undefined ? DEFAULT_TURN_LIMIT : opts.turnLimit;
            state = createInitialState({
                seed: Date.now() & 0xffffffff,
                width: size,
                height: size,
                turnLimit,
                playerInfos: lobby.map((p) => ({ name: p.name, color: p.color, isAI: p.isAI })),
            });
            broadcastLobby();
            broadcastState();
            driveTurn(); // si le joueur 0 est une IA
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
            }
            catch (e) {
                console.error("[server] applyAction a échoué", e);
                socket.emit("errorMsg", "Erreur interne sur l'action.");
                return;
            }
            broadcastState();
            driveTurn(); // le tour peut être passé à une IA
        });
        socket.on("reset", () => {
            if (!isHost(socket.id))
                return; // seul l'hôte
            resetGame();
            broadcastLobby();
        });
        socket.on("disconnect", () => {
            const player = socketToPlayer.get(socket.id);
            socketToPlayer.delete(socket.id);
            if (player) {
                if (started) {
                    player.connected = false; // garde le slot pour reconnexion
                }
                else {
                    const idx = lobby.indexOf(player);
                    if (idx >= 0)
                        lobby.splice(idx, 1); // avant lancement : on libère la place
                    reassignIds();
                }
            }
            // Reset complet quand plus aucun humain n'est connecté (les bots ne comptent pas).
            const connectedHumans = lobby.filter((p) => !p.isAI && p.connected);
            if (connectedHumans.length === 0) {
                lobby.length = 0;
                socketToPlayer.clear();
                resetGame();
            }
            else {
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
                close: () => new Promise((res) => {
                    io.close(() => http.close(() => res()));
                }),
            });
        });
    });
}
//# sourceMappingURL=gameServer.js.map