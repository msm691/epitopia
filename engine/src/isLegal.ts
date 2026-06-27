/**
 * Validation des actions. AUCUNE action n'est appliquée sans passer isLegal.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 * Les autres (combat, ville, tech, récolte) arrivent aux étapes suivantes.
 */

import type {
  Action,
  AttackAction,
  AttackWallAction,
  BuildImprovementAction,
  CaptureCityAction,
  ClaimCityRewardAction,
  ConsultSageAction,
  FoundCityAction,
  GameState,
  HarvestResourceAction,
  MoveUnitAction,
  ResearchTechAction,
  TrainUnitAction,
  ProposePeaceAction,
  AcceptPeaceAction,
  BreakPeaceAction,
  ExploreRuinAction,
  AdoptDoctrineAction,
  BuildRoadAction,
  UpgradeHeroAction,
  SabotageWallAction,
  StealTechAction,
  PoisonCityAction,
  EstablishTradeRouteAction,
} from "@polytopia/shared";
import {
  ALL_CITY_REWARDS,
  ALL_IMPROVEMENTS,
  AUTO_TERRITORY_EXPANSIONS,
  CITY_HARVEST_RADIUS,
  improvementCost,
  MAX_HARVEST_RADIUS,
  MAX_WORKSHOPS,
  NAVAL_MOVEMENT,
  RESOURCE_HARVEST_COST,
  UNIT_STATS,
  unitBuildTurns,
  DOCTRINES,
} from "@polytopia/shared";
import { hasContinuousRoad } from "./pathfinding.js";
import { canEnterTile, chebyshev, freeSpawnTileFor, isWaterAt, tileAt, unitById } from "./units.js";
import {
  computeTechCost,
  getPlayerCityCount,
  getTech,
  playerCanHarvest,
  playerCanTrain,
  playerHasTech,
} from "./tech.js";
import { areAllies } from "./state.js";

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
      return isLegalBuildImprovement(state, action);

    case "ATTACK_WALL":
      return isLegalAttackWall(state, action);

    case "CONSULT_SAGE":
      return isLegalConsultSage(state, action);

    case "PROPOSE_PEACE":
      return isLegalProposePeace(state, action);

    case "ACCEPT_PEACE":
      return isLegalAcceptPeace(state, action);

    case "BREAK_PEACE":
      return isLegalBreakPeace(state, action);

    case "EXPLORE_RUIN":
      return isLegalExploreRuin(state, action);

    case "ADOPT_DOCTRINE":
      return isLegalAdoptDoctrine(state, action as any);

    case "BUILD_ROAD":
      return isLegalBuildRoad(state, action);

    case "UPGRADE_HERO":
      return isLegalUpgradeHero(state, action);

    case "SABOTAGE_WALL":
      return isLegalSabotageWall(state, action);

    case "STEAL_TECH":
      return isLegalStealTech(state, action);

    case "POISON_CITY":
      return isLegalPoisonCity(state, action);

    case "ESTABLISH_TRADE_ROUTE":
      return isLegalEstablishTradeRoute(state, action);

    default:
      return false;
  }
}

function isLegalBuildRoad(state: GameState, action: BuildRoadAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit) return false;
  if (unit.ownerId !== state.currentPlayer) return false;
  
  const tile = tileAt(state, unit.x, unit.y);
  if (!tile || tile.hasRoad || isWaterAt(state, unit.x, unit.y)) return false;

  const player = state.players[state.currentPlayer];
  if (!player || player.stars < 1) return false;

  return true;
}

function isLegalUpgradeHero(state: GameState, action: UpgradeHeroAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit || unit.ownerId !== state.currentPlayer || !unit.isHero) return false;
  return true; // Simplifié pour le moment
}

function isLegalAdoptDoctrine(state: GameState, action: AdoptDoctrineAction): boolean {
  const player = state.players[state.currentPlayer];
  if (!player) return false;
  if (player.culturalDoctrines?.includes(action.doctrineId)) return false; // Already adopted
  const doctrine = DOCTRINES[action.doctrineId];
  if (!doctrine) return false;
  if ((player.culture ?? 0) < doctrine.cost) return false;
  return true;
}

function isLegalProposePeace(state: GameState, action: ProposePeaceAction): boolean {
  if (state.currentPlayer === action.to) return false;
  if (!state.players.find(p => p.id === action.to)) return false;
  if (areAllies(state, state.currentPlayer, action.to)) return false;
  if (state.peaceProposals.some(p => p.from === state.currentPlayer && p.to === action.to)) return false;
  return true;
}

function isLegalAcceptPeace(state: GameState, action: AcceptPeaceAction): boolean {
  return state.peaceProposals.some(p => p.from === action.with && p.to === state.currentPlayer);
}

function isLegalBreakPeace(state: GameState, action: BreakPeaceAction): boolean {
  return areAllies(state, state.currentPlayer, action.with);
}

function isLegalExploreRuin(state: GameState, action: ExploreRuinAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit || unit.ownerId !== state.currentPlayer || unit.hasMoved) return false;
  const tile = tileAt(state, unit.x, unit.y);
  if (!tile || !tile.ruin) return false;
  return true;
}

/** Consulter un sage : la case porte un sage, et une unité du joueur courant est adjacente. */
function isLegalConsultSage(state: GameState, action: ConsultSageAction): boolean {
  const tile = tileAt(state, action.at.x, action.at.y);
  if (!tile || !tile.sage) return false;
  // Chaque joueur ne peut accepter le marché qu'une seule fois par sage.
  if ((tile.sageUsedBy ?? []).includes(state.currentPlayer)) return false;
  return state.units.some(
    (u) => u.ownerId === state.currentPlayer && chebyshev(u, action.at) <= 1,
  );
}

/** Bâtir une amélioration (tech Construction) : ville du joueur, étoiles, plafonds. */
function isLegalBuildImprovement(state: GameState, action: BuildImprovementAction): boolean {
  if (!ALL_IMPROVEMENTS.includes(action.improvement)) return false;
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city) return false;
  if (city.ownerId !== state.currentPlayer) return false;
  if (!playerHasTech(state, state.currentPlayer, "construction")) return false;

  const player = state.players[state.currentPlayer];
  if (!player) return false;
  if (player.stars < improvementCost(action.improvement, city.builtWorkshops ?? 0, player)) return false;

  // Plafonds : un seul rempart, et un nombre limité d'ateliers.
  if (action.improvement === "muraille" && city.hasWall) return false;
  if (action.improvement === "atelier" && (city.workshops ?? 0) >= MAX_WORKSHOPS) return false;

  // Merveilles : une seule fois par partie (tous joueurs confondus)
  if (["pyramides", "colosse", "grand_phare", "bibliotheque"].includes(action.improvement)) {
    if (state.builtWonders.some(w => w.type === action.improvement)) return false;
    
    if (["grand_phare", "bibliotheque"].includes(action.improvement)) {
      if (!state.wondersEnabled) return false;
    }
  }
  return true;
}

/** Attaquer le rempart d'une ville ennemie : unité du joueur, à portée, rempart debout. */
function isLegalAttackWall(state: GameState, action: AttackWallAction): boolean {
  const attacker = unitById(state, action.attackerId);
  if (!attacker) return false;
  if (attacker.ownerId !== state.currentPlayer) return false;
  if (attacker.hasAttacked) return false;

  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city) return false;
  if (city.ownerId === attacker.ownerId) return false; // doit être ennemie
  if (areAllies(state, attacker.ownerId, city.ownerId)) return false; // ne pas attaquer un allié
  if ((city.wallHp ?? 0) <= 0) return false; // pas de rempart à abattre

  // À portée d'attaque (Chebyshev jusqu'à la case-ville).
  if (chebyshev({ x: attacker.x, y: attacker.y }, { x: city.x, y: city.y }) > attacker.range) {
    return false;
  }
  return true;
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
  const cost = computeTechCost(state, tech.tier, getPlayerCityCount(state, playerId), player);
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
  if (areAllies(state, attacker.ownerId, target.ownerId)) return false;

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
  if (city.ownerId === unit.ownerId) return false;
  if (areAllies(state, unit.ownerId, city.ownerId)) return false;

  // Un rempart intact doit d'abord être détruit (sécurité ; le mouvement l'empêche déjà).
  if ((city.wallHp ?? 0) > 0) return false;
  return true;
}

function isLegalTrain(state: GameState, action: TrainUnitAction): boolean {
  // Unité débloquée (base ou via tech) pour le joueur courant ?
  if (!playerCanTrain(state, state.currentPlayer, action.unitType)) return false;

  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city) return false;

  // Ce doit être le tour du propriétaire de la ville.
  if (city.ownerId !== state.currentPlayer) return false;

  // Une ville déjà en production est occupée (une unité à la fois).
  if (city.production) return false;

  const player = state.players[state.currentPlayer];
  if (!player) return false;

  // Un seul héros par joueur, ne peut être ressuscité
  if (action.unitType === "hero") {
    if (player.heroStatus === "alive" || player.heroStatus === "dead") {
      return false;
    }
  }

  // Assez d'étoiles ?
  if (player.stars < UNIT_STATS[action.unitType].cost) return false;

  // Unité immédiate : la case de la ville doit être libre (pas d'empilement).
  // Unité à production : l'apparition est différée (case trouvée à la sortie),
  // on autorise donc à la lancer même avec la garnison encore en place.
  if (unitBuildTurns(action.unitType) === 0) {
    const tile = tileAt(state, city.x, city.y);
    if (!tile || tile.unitId !== undefined) return false;
  }

  // Ressources stratégiques supprimées pour la V5 (simplification)

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

  // Destination valide, distincte.
  if (from.x === to.x && from.y === to.y) return false;

  // Embarquement : l'eau n'est franchissable que si le joueur a Navigation. La
  // vitesse navale (plus rapide) ne s'applique QUE si l'unité est DÉJÀ sur l'eau ;
  // embarquer depuis la terre coûte un déplacement terrestre normal (1 case).
  const canNavigate = playerHasTech(state, unit.ownerId, "navigation");
  const naval = isWaterAt(state, from.x, from.y);
  
  if (state.weather === "hiver" && (unit.type === "transport" || unit.type === "galion" || unit.type === "sous-marin" || unit.isEmbarked)) {
    return false; // Les bateaux sont bloqués dans les glaces
  }
  
  let baseMovement = unit.movement;
  if (naval && state.builtWonders.some(w => w.type === "grand_phare" && w.ownerId === unit.ownerId)) {
    baseMovement += 1;
  }
  let reach = naval ? Math.max(baseMovement, NAVAL_MOVEMENT + (baseMovement - unit.movement)) : baseMovement;
  
  if (state.windDirection && unit.type === "galion") {
    const dirX = Math.sign(to.x - from.x);
    const dirY = Math.sign(to.y - from.y);
    if (dirX === state.windDirection.dx && dirY === state.windDirection.dy && (dirX !== 0 || dirY !== 0)) {
      reach += 1; // Vent favorable
    } else if (dirX === -state.windDirection.dx && dirY === -state.windDirection.dy && (dirX !== 0 || dirY !== 0)) {
      reach = Math.max(1, reach - 1); // Vent de face
    }
  }
  
  if (chebyshev(from, to) > reach) {
    if (!naval && hasContinuousRoad(state, from, to, reach * 2)) {
      reach *= 2;
    } else {
      return false;
    }
  }

  // En hiver, la glace permet de marcher sur l'eau sans navigation
  const isWinter = state.weather === "hiver";
  if (!canEnterTile(state, to.x, to.y, canNavigate || isWinter)) return false;

  const destTile = tileAt(state, to.x, to.y);

  // Les montagnes ne se gravissent qu'avec la tech Escalade.
  if (destTile?.terrain === "montagne" && !playerHasTech(state, unit.ownerId, "escalade")) {
    return false;
  }

  // On ne peut pas entrer dans une ville ennemie tant que son rempart tient.
  if (destTile?.cityId !== undefined) {
    const city = state.cities.find((c) => c.id === destTile.cityId);
    if (city && city.ownerId !== unit.ownerId && (city.wallHp ?? 0) > 0) return false;
  }

  return true;
}


function isLegalSabotageWall(state: GameState, action: SabotageWallAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit || unit.ownerId !== state.currentPlayer || unit.type !== "espion" || unit.hasMoved) return false;
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city || city.ownerId === state.currentPlayer || areAllies(state, state.currentPlayer, city.ownerId)) return false;
  if ((city.wallHp ?? 0) <= 0) return false;
  return chebyshev(unit, city) <= 1;
}

function isLegalStealTech(state: GameState, action: StealTechAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit || unit.ownerId !== state.currentPlayer || unit.type !== "espion" || unit.hasMoved) return false;
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city || city.ownerId === state.currentPlayer || areAllies(state, state.currentPlayer, city.ownerId)) return false;
  // Can only steal if the enemy has techs we don't have
  const myTechs = state.players[state.currentPlayer]?.unlockedTechs || [];
  const enemyTechs = state.players[city.ownerId]?.unlockedTechs || [];
  if (!enemyTechs.some((t) => !myTechs.includes(t))) return false;
  return chebyshev(unit, city) <= 1;
}

function isLegalPoisonCity(state: GameState, action: PoisonCityAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit || unit.ownerId !== state.currentPlayer || unit.type !== "espion" || unit.hasMoved) return false;
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city || city.ownerId === state.currentPlayer || areAllies(state, state.currentPlayer, city.ownerId)) return false;
  if (city.population <= 1 && city.level <= 1) return false; // Too small to poison effectively
  return chebyshev(unit, city) <= 1;
}

function isLegalEstablishTradeRoute(state: GameState, action: EstablishTradeRouteAction): boolean {
  const unit = unitById(state, action.unitId);
  if (!unit || unit.ownerId !== state.currentPlayer || unit.type !== "caravane" || unit.hasMoved) return false;
  const city = state.cities.find((c) => c.id === action.cityId);
  if (!city || city.ownerId === state.currentPlayer || !areAllies(state, state.currentPlayer, city.ownerId)) return false;
  return chebyshev(unit, city) <= 1;
}
