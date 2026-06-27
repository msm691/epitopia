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