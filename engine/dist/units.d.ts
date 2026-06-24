/**
 * Helpers PURS autour des unités et de la grille (déplacement Chebyshev).
 */
import type { City, Coord, GameState, Tile, Unit, UnitType } from "@polytopia/shared";
/** Distance Chebyshev (8 directions) entre deux cases. */
export declare function chebyshev(a: Coord, b: Coord): number;
/** Vrai si (x, y) est dans les limites de la carte. */
export declare function inBounds(state: GameState, x: number, y: number): boolean;
/** Récupère la tuile (x, y) ou undefined si hors limites. */
export declare function tileAt(state: GameState, x: number, y: number): Tile | undefined;
/** Récupère une unité par id. */
export declare function unitById(state: GameState, id: string): Unit | undefined;
/**
 * Crée une unité aux stats du catalogue. `inactive` => l'unité a déjà "agi"
 * ce tour (utilisé pour le recrutement : pas de déplacement le tour de sortie).
 */
export declare function makeUnit(id: string, type: UnitType, ownerId: number, x: number, y: number, inactive: boolean, hp?: number): Unit;
/** Une case est-elle franchissable pour s'y arrêter (terre + libre d'unité) ? */
export declare function isWalkable(state: GameState, x: number, y: number): boolean;
/** La case (x, y) est-elle de l'eau (lac / océan) ? */
export declare function isWaterAt(state: GameState, x: number, y: number): boolean;
/**
 * Case où une unité peut s'arrêter : libre d'unité, et soit de la terre, soit de
 * l'eau SI le joueur sait naviguer (tech Navigation -> embarquement).
 */
export declare function canEnterTile(state: GameState, x: number, y: number, canNavigate: boolean): boolean;
/**
 * Case libre où faire apparaître une unité produite par une ville : la case-ville
 * si elle est vide, sinon la première case voisine franchissable (ordre déterministe),
 * sinon null (aucune place — la récompense "troupe" devient alors illégale).
 */
export declare function freeSpawnTileFor(state: GameState, city: City): Coord | null;
//# sourceMappingURL=units.d.ts.map