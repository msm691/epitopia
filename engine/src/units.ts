/**
 * Helpers PURS autour des unités et de la grille (déplacement Chebyshev).
 */

import type { City, Coord, GameState, Tile, Unit, UnitType } from "@polytopia/shared";
import { UNIT_STATS } from "@polytopia/shared";
import { isLandTerrain } from "./generateMap.js";
import { tileIndex } from "./state.js";

/** Distance Chebyshev (8 directions) entre deux cases. */
export function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Vrai si (x, y) est dans les limites de la carte. */
export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

/** Récupère la tuile (x, y) ou undefined si hors limites. */
export function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  if (!inBounds(state, x, y)) return undefined;
  return state.tiles[tileIndex(state.width, x, y)];
}

/** Récupère une unité par id. */
export function unitById(state: GameState, id: string): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

/**
 * Crée une unité aux stats du catalogue. `inactive` => l'unité a déjà "agi"
 * ce tour (utilisé pour le recrutement : pas de déplacement le tour de sortie).
 */
export function makeUnit(
  id: string,
  type: UnitType,
  ownerId: number,
  x: number,
  y: number,
  inactive: boolean,
  hp?: number,
): Unit {
  const stats = UNIT_STATS[type];
  return {
    id,
    type,
    ownerId,
    x,
    y,
    hp: hp ?? stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    range: stats.range,
    movement: stats.movement,
    hasMoved: inactive,
    hasAttacked: inactive,
  };
}

/** Une case est-elle franchissable pour s'y arrêter (terre + libre d'unité) ? */
export function isWalkable(state: GameState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  if (!tile) return false;
  if (!isLandTerrain(tile.terrain)) return false;
  return tile.unitId === undefined;
}

/** La case (x, y) est-elle de l'eau (lac / océan) ? */
export function isWaterAt(state: GameState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  return tile ? !isLandTerrain(tile.terrain) : false;
}

/**
 * Case où une unité peut s'arrêter : libre d'unité, et soit de la terre, soit de
 * l'eau SI le joueur sait naviguer (tech Navigation -> embarquement).
 */
export function canEnterTile(
  state: GameState,
  x: number,
  y: number,
  canNavigate: boolean,
): boolean {
  const tile = tileAt(state, x, y);
  if (!tile) return false;
  if (tile.unitId !== undefined) return false;
  return isLandTerrain(tile.terrain) || canNavigate;
}

/**
 * Case libre où faire apparaître une unité produite par une ville : la case-ville
 * si elle est vide, sinon la première case voisine franchissable (ordre déterministe),
 * sinon null (aucune place — la récompense "troupe" devient alors illégale).
 */
export function freeSpawnTileFor(state: GameState, city: City): Coord | null {
  const here = tileAt(state, city.x, city.y);
  if (here && here.unitId === undefined) return { x: city.x, y: city.y };
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = city.x + dx;
      const ny = city.y + dy;
      if (isWalkable(state, nx, ny)) return { x: nx, y: ny };
    }
  }
  return null;
}
