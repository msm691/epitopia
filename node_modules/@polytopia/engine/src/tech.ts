/**
 * Logique de technologie PURE : coût, possession, déblocages.
 */

import type { GameState, PlayerId, Resource, UnitType } from "@polytopia/shared";
import {
  ALL_UNIT_TYPES,
  TECHS,
  TECH_BASE_COST,
  type TechDef,
  type TechId,
} from "@polytopia/shared";

import type { Player } from "@polytopia/shared";

/** Coût d'une tech selon son palier et le nombre de villes du joueur. */
export function computeTechCost(tier: number, numCities: number, player?: Player): number {
  let cost = TECH_BASE_COST * tier + numCities;
  if (player?.culturalDoctrines?.includes("erudition")) {
    cost = Math.max(1, Math.floor(cost * 0.8));
  }
  return cost;
}

/** Définition de tech si l'id est valide, sinon undefined. */
export function getTech(techId: string): TechDef | undefined {
  return Object.prototype.hasOwnProperty.call(TECHS, techId)
    ? TECHS[techId as TechId]
    : undefined;
}

/** Nombre de villes possédées par un joueur. */
export function getPlayerCityCount(state: GameState, playerId: PlayerId): number {
  return state.cities.filter((c) => c.ownerId === playerId).length;
}

/** Le joueur possède-t-il cette tech ? */
export function playerHasTech(state: GameState, playerId: PlayerId, techId: string): boolean {
  return state.players[playerId]?.unlockedTechs.includes(techId) ?? false;
}

/** Unité recrutable par défaut (sans tech) : seul le Guerrier. */
const BASE_UNITS: readonly UnitType[] = ["guerrier"];

/** Le joueur peut-il recruter ce type d'unité (base ou débloqué par tech) ? */
export function playerCanTrain(
  state: GameState,
  playerId: PlayerId,
  unitType: UnitType,
): boolean {
  if (BASE_UNITS.includes(unitType)) return true;
  const techs = state.players[playerId]?.unlockedTechs ?? [];
  return techs.some((id) => getTech(id)?.unlocksUnits.includes(unitType) ?? false);
}

/** Liste des types d'unités recrutables par le joueur (base + débloqués). */
export function trainableUnitsFor(state: GameState, playerId: PlayerId): UnitType[] {
  return ALL_UNIT_TYPES.filter((t) => playerCanTrain(state, playerId, t));
}

/** Le joueur peut-il récolter cette ressource (selon ses techs) ? */
export function playerCanHarvest(
  state: GameState,
  playerId: PlayerId,
  resource: Resource,
): boolean {
  // Fruits & Luxe sont récoltables sans tech (gérés en 2c).
  if (resource === "fruits" || resource === "luxe") return true;
  const techs = state.players[playerId]?.unlockedTechs ?? [];
  return techs.some((id) => getTech(id)?.unlocksResources.includes(resource) ?? false);
}
