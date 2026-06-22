/**
 * Validation des actions. AUCUNE action n'est appliquée sans passer isLegal.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 * Les autres (combat, ville, tech, récolte) arrivent aux étapes suivantes.
 */

import type {
  Action,
  AttackAction,
  CaptureCityAction,
  ClaimCityRewardAction,
  FoundCityAction,
  GameState,
  HarvestResourceAction,
  MoveUnitAction,
  ResearchTechAction,
  TrainUnitAction,
} from "@polytopia/shared";
import {
  ALL_CITY_REWARDS,
  AUTO_TERRITORY_EXPANSIONS,
  CITY_HARVEST_RADIUS,
  MAX_HARVEST_RADIUS,
  RESOURCE_HARVEST_COST,
  UNIT_STATS,
} from "@polytopia/shared";
import { chebyshev, freeSpawnTileFor, isWalkable, tileAt, unitById } from "./units.js";
import {
  computeTechCost,
  getPlayerCityCount,
  getTech,
  playerCanHarvest,
  playerCanTrain,
  playerHasTech,
} from "./tech.js";

export function isLegal(state: GameState, action: Action): boolean {
  switch (action.type) {
    case "END_TURN":
      return state.players.length > 0;

    case "TRAIN_UNIT":
      return isLegalTrain(state, action);

    case "MOVE_UNIT":
      return isLegalMove(state, action);

    case "ATTACK":
      return isLegalAttack(state, action);

    case "CAPTURE_CITY":
      return isLegalCapture(state, action);

    case "RESEARCH_TECH":
      return isLegalResearch(state, action);

    case "HARVEST_RESOURCE":
      return isLegalHarvest(state, action);

    case "FOUND_CITY":
      return isLegalFound(state, action);

    case "CLAIM_CITY_REWARD":
      return isLegalClaimReward(state, action);

    case "BUILD_IMPROVEMENT":
      return false;
  }
}

/** Encaisser une récompense de niveau : ville du joueur courant avec un choix en attente. */
function isLegalClaimReward(state: GameState, action: ClaimCityRewardAction): boolean {
  if (!ALL_CITY_REWARDS.includes(action.reward)) return false;
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city) return false;
  if (city.ownerId !== state.currentPlayer) return false;
  if ((city.rewardsToPick ?? 0) <= 0) return false;
  // La "troupe" exige une case libre pour faire apparaître l'unité.
  if (action.reward === "troupe" && freeSpawnTileFor(state, city) === null) return false;
  // "Agrandir" n'est proposé qu'APRÈS les agrandissements automatiques, et plafonné.
  if (action.reward === "agrandir") {
    const radius = city.harvestRadius ?? CITY_HARVEST_RADIUS;
    if (radius < CITY_HARVEST_RADIUS + AUTO_TERRITORY_EXPANSIONS) return false; // encore en phase auto
    if (radius >= MAX_HARVEST_RADIUS) return false; // plafond atteint
  }
  return true;
}

/** Fonder une ville : une unité du joueur courant se tient sur un village libre. */
function isLegalFound(state: GameState, action: FoundCityAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit) return false;
  if (unit.ownerId !== state.currentPlayer) return false;

  const tile = tileAt(state, unit.x, unit.y);
  if (!tile || !tile.village) return false;
  // Le village ne doit pas déjà porter une ville.
  return tile.cityId === undefined;
}

function isLegalHarvest(state: GameState, action: HarvestResourceAction): boolean {
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city) return false;
  if (city.ownerId !== state.currentPlayer) return false;

  // La case visée est dans le rayon d'exploitation de la ville et porte une ressource.
  const radius = city.harvestRadius ?? CITY_HARVEST_RADIUS;
  if (chebyshev({ x: city.x, y: city.y }, action.at) > radius) return false;
  const tile = tileAt(state, action.at.x, action.at.y);
  if (!tile || tile.resource === undefined) return false;

  // Tech requise pour cette ressource.
  if (!playerCanHarvest(state, state.currentPlayer, tile.resource)) return false;

  // Assez d'étoiles.
  const player = state.players[state.currentPlayer];
  if (!player) return false;
  if (player.stars < RESOURCE_HARVEST_COST[tile.resource]) return false;

  return true;
}

function isLegalResearch(state: GameState, action: ResearchTechAction): boolean {
  const tech = getTech(action.techId);
  if (!tech) return false;

  const playerId = state.currentPlayer;
  const player = state.players[playerId];
  if (!player) return false;

  // Pas déjà connue.
  if (player.unlockedTechs.includes(tech.id)) return false;

  // Prérequis satisfait.
  if (tech.requires && !playerHasTech(state, playerId, tech.requires)) return false;

  // Assez d'étoiles (coût fonction du palier + nb de villes).
  const cost = computeTechCost(tech.tier, getPlayerCityCount(state, playerId));
  if (player.stars < cost) return false;

  return true;
}

function isLegalAttack(state: GameState, action: AttackAction): boolean {
  const attacker = unitById(state, action.attackerId);
  const target = unitById(state, action.targetId);
  if (!attacker || !target) return false;

  // L'attaquant appartient au joueur courant et n'a pas encore attaqué.
  if (attacker.ownerId !== state.currentPlayer) return false;
  if (attacker.hasAttacked) return false;

  // La cible doit être ennemie.
  if (target.ownerId === attacker.ownerId) return false;

  // À portée d'attaque (Chebyshev).
  if (chebyshev(attacker, target) > attacker.range) return false;

  return true;
}

function isLegalCapture(state: GameState, action: CaptureCityAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit) return false;
  if (unit.ownerId !== state.currentPlayer) return false;

  // L'unité doit se tenir sur la case d'une ville ennemie.
  const tile = tileAt(state, unit.x, unit.y);
  if (!tile || tile.cityId === undefined) return false;
  const city = state.cities.find((c) => c.id === tile.cityId);
  if (!city) return false;

  return city.ownerId !== unit.ownerId;
}

function isLegalTrain(state: GameState, action: TrainUnitAction): boolean {
  // Unité débloquée (base ou via tech) pour le joueur courant ?
  if (!playerCanTrain(state, state.currentPlayer, action.unitType)) return false;

  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city) return false;

  // Ce doit être le tour du propriétaire de la ville.
  if (city.ownerId !== state.currentPlayer) return false;

  // Assez d'étoiles ?
  const player = state.players[state.currentPlayer];
  if (!player) return false;
  if (player.stars < UNIT_STATS[action.unitType].cost) return false;

  // La case de la ville doit être libre (pas d'empilement d'unités).
  const tile = tileAt(state, city.x, city.y);
  if (!tile || tile.unitId !== undefined) return false;

  return true;
}

function isLegalMove(state: GameState, action: MoveUnitAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit) return false;

  // Appartient au joueur courant et n'a pas déjà bougé.
  if (unit.ownerId !== state.currentPlayer) return false;
  if (unit.hasMoved) return false;

  const from = { x: unit.x, y: unit.y };
  const to = action.to;

  // Destination valide, distincte, à portée de mouvement.
  if (from.x === to.x && from.y === to.y) return false;
  if (chebyshev(from, to) > unit.movement) return false;

  // Case d'arrivée franchissable (terre + libre).
  if (!isWalkable(state, to.x, to.y)) return false;

  return true;
}
