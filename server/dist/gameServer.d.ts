/**
 * Serveur autoritaire (socket.io) — une partie unique.
 * Détient le GameState officiel : valide les Actions reçues (isLegal + c'est
 * bien ton tour), les applique (applyAction) et diffuse le nouvel état.
 * AUCUNE règle de jeu ici : tout passe par l'engine.
 */
export interface GameServerOptions {
    aiStepMs?: number;
    skipMs?: number;
}
export interface GameServer {
    port: number;
    close: () => Promise<void>;
}
export declare function createGameServer(port?: number, opts?: GameServerOptions): Promise<GameServer>;
//# sourceMappingURL=gameServer.d.ts.map