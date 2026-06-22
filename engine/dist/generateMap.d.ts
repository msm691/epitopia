/**
 * Génération de carte déterministe (cf. §6 : grille carrée, ressources/joueurs
 * répartis équitablement, le tout seedé).
 *
 * À l'Étape 1a : terrains variés + placement équilibré des départs.
 * Les ressources sur les cases seront ajoutées plus tard (1b/2).
 */
import type { Coord, Terrain, Tile } from "@polytopia/shared";
export interface GeneratedMap {
    tiles: Tile[];
    /** Cases de départ (futures capitales), une par joueur. */
    starts: Coord[];
}
/**
 * Taille de carte conseillée selon le nombre de joueurs : plus de monde = plus
 * grand, mais surtout assez d'espace pour que traverser prenne du temps (anti-rush).
 */
export declare function mapSizeForPlayers(count: number): number;
/** Une case est "terre" si on peut y poser une capitale (pas d'eau). */
export declare function isLandTerrain(terrain: Terrain): boolean;
/** Construit une carte complète (terrains + ressources + départs) déterministe. */
export declare function generateMap(seed: number, width: number, height: number, playerCount: number): GeneratedMap;
//# sourceMappingURL=generateMap.d.ts.map