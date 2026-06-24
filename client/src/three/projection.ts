/**
 * Projection grille -> monde 3D (PURE, aucune règle de jeu, aucun DOM).
 * L'engine reste en (x,y) : la 3D n'est qu'une projection, comme l'isométrie l'était.
 * - x grille  -> X monde
 * - y grille  -> Z monde
 * - terrain   -> Y monde (hauteur de la colonne)
 * La carte est centrée autour de l'origine.
 */

import type { GameState, Terrain } from "@polytopia/shared";

/** Côté d'une tuile en unités monde. */
export const TILE = 1;
/** Petit interstice entre tuiles (définition visuelle façon Polytopia). */
export const TILE_GAP = 0.04;

/** Y de la SURFACE (haut) d'une tuile selon son terrain. */
export const TERRAIN_TOP: Record<Terrain, number> = {
  ocean: -0.06,
  eau: 0.06,
  champ: 0.34,
  foret: 0.34,
  montagne: 0.72,
};

/** Bas commun des colonnes (donne l'épaisseur/le relief de l'île). */
export const BASE_Y = -0.7;

/** Couleur cartoon du DESSUS d'une tuile. */
export const TERRAIN_COLOR: Record<Terrain, string> = {
  ocean: "#2f7cc0",
  eau: "#46b1e6",
  champ: "#6cc24a",
  foret: "#519a3e",
  montagne: "#9aa0ac",
};

/** Couleur des flancs (terre/falaise) — un peu plus chaud/sombre. */
export const SIDE_COLOR = "#9c6f47";
/** Couleur du flanc d'une tuile côtière (plus clair, façon sable/grès). */
export const BEACH_SIDE_COLOR = "#cbb074";
/** Couleur du dessus d'une plage (sable). */
export const BEACH_COLOR = "#e9d8a6";
/** Couleur du grand plan d'eau autour de l'île. */
export const WATER_COLOR = "#2a72b8";

/** Y de la surface de l'eau (le grand plan animé). */
export const WATER_SURFACE_Y = 0.05;

/** Un terrain est-il de l'eau (non constructible) ? */
export function isWater(terrain: Terrain): boolean {
  return terrain === "eau" || terrain === "ocean";
}

/** Convertit un point monde (X,Z) en case de la grille (arrondi + bornes). */
export function worldToTile(
  wx: number,
  wz: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const x = Math.round(wx + (width - 1) / 2);
  const y = Math.round(wz + (height - 1) / 2);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

/** Une case de terre est-elle côtière (au moins une voisine d'eau, 8 directions) ? */
export function isCoastalLand(state: GameState, x: number, y: number): boolean {
  if (isWater(terrainAt(state, x, y))) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (isWater(terrainAt(state, nx, ny))) return true;
    }
  }
  return false;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Terrain d'une case (ou champ par défaut si hors carte). */
export function terrainAt(state: GameState, x: number, y: number): Terrain {
  return state.tiles[y * state.width + x]?.terrain ?? "champ";
}

/** Centre monde (X,Z) d'une tuile, carte centrée sur l'origine. */
export function tileXZ(x: number, y: number, width: number, height: number): { x: number; z: number } {
  return { x: x - (width - 1) / 2, z: y - (height - 1) / 2 };
}

/** Position monde de la SURFACE d'une case (pour poser unités/villes/overlays). */
export function tileTop(state: GameState, x: number, y: number): Vec3 {
  const { x: wx, z } = tileXZ(x, y, state.width, state.height);
  return { x: wx, y: TERRAIN_TOP[terrainAt(state, x, y)], z };
}

/** Hauteur (épaisseur) de la colonne d'une tuile. */
export function columnHeight(terrain: Terrain): number {
  return TERRAIN_TOP[terrain] - BASE_Y;
}

/** Y du centre de la colonne (pour positionner une boîte). */
export function columnCenterY(terrain: Terrain): number {
  return (TERRAIN_TOP[terrain] + BASE_Y) / 2;
}
