/**
 * Création de l'état initial.
 *
 * À l'Étape 1a : carte générée (terrains variés) + joueurs + cases de départ
 * marquées (futures capitales). Pas encore de villes/unités/économie (1b/1c).
 */
import type { GameState } from "@polytopia/shared";
export interface CreateStateOptions {
    seed: number;
    width?: number;
    height?: number;
    /** Nombre de joueurs à placer (défaut 2). Ignoré si `playerInfos` est fourni. */
    playerCount?: number;
    /** Infos joueurs (nom/couleur/IA), p.ex. issues du lobby réseau. */
    playerInfos?: readonly PlayerInfo[];
    /** Tour limite (défaut 30) ; null pour une partie illimitée. */
    turnLimit?: number | null;
}
export interface PlayerInfo {
    name: string;
    color: string;
    isAI: boolean;
}
/** Index linéaire d'une case (y * width + x). */
export declare function tileIndex(width: number, x: number, y: number): number;
/** Identifiant déterministe de la capitale d'un joueur. */
export declare function capitalId(playerId: number): string;
/**
 * Construit un GameState initial déterministe.
 * La même seed (+ mêmes dimensions/joueurs) produit toujours le même état.
 */
export declare function createInitialState(options: CreateStateOptions): GameState;
//# sourceMappingURL=state.d.ts.map