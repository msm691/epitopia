/**
 * Conditions de victoire (cf. §6) — fonctions PURES.
 * Garantit qu'une partie se termine TOUJOURS : domination, ou repli au score
 * une fois le tour limite dépassé (sauf partie illimitée : turnLimit = null).
 */
import type { GameState, PlayerId } from "@polytopia/shared";
export type VictoryReason = "domination" | "score";
export interface VictoryStatus {
    over: boolean;
    reason: VictoryReason | null;
    /** Vainqueur unique, ou null si partie en cours / égalité. */
    winnerId: PlayerId | null;
    /** Tous les vainqueurs (>1 = égalité / match nul). */
    winners: PlayerId[];
}
/** Score pondéré d'un joueur (expansion + économie + armée + science). */
export declare function computeScore(state: GameState, playerId: PlayerId): number;
/** Évalue l'état de victoire de la partie. */
export declare function checkVictory(state: GameState): VictoryStatus;
//# sourceMappingURL=victory.d.ts.map