/**
 * Les Actions sont le SEUL moyen de modifier l'état (cf. §5 du cahier des charges).
 * Humains et IA produisent exactement les mêmes Actions.
 *
 * À l'Étape 0, seul END_TURN est réellement implémenté côté engine ; les autres
 * actions sont définies ici pour figer l'interface, et seront branchées ensuite.
 */

import type { CityReward, Coord, ImprovementType, PlayerId, UnitType } from "./types.js";

export interface MoveUnitAction {
  type: "MOVE_UNIT";
  unitId: string;
  to: Coord;
}

export interface AttackAction {
  type: "ATTACK";
  attackerId: string;
  targetId: string;
}

export interface FoundCityAction {
  type: "FOUND_CITY";
  unitId: string;
}

export interface CaptureCityAction {
  type: "CAPTURE_CITY";
  /** Unité (du joueur courant) présente sur la case d'une ville ennemie. */
  unitId: string;
}

export interface TrainUnitAction {
  type: "TRAIN_UNIT";
  cityId: string;
  unitType: UnitType;
}

export interface ResearchTechAction {
  type: "RESEARCH_TECH";
  techId: string;
}

export interface HarvestResourceAction {
  type: "HARVEST_RESOURCE";
  cityId: string;
  at: Coord;
}

export interface BuildImprovementAction {
  type: "BUILD_IMPROVEMENT";
  cityId: string;
  improvement: ImprovementType;
}

/** Attaquer le rempart d'une ville ennemie (le réduire avant de pouvoir entrer). */
export interface AttackWallAction {
  type: "ATTACK_WALL";
  attackerId: string;
  cityId: string;
}

export interface ClaimCityRewardAction {
  type: "CLAIM_CITY_REWARD";
  cityId: string;
  reward: CityReward;
}

/** Consulter un sage (PNJ) : une unité du joueur courant est adjacente à la case du sage. */
export interface ConsultSageAction {
  type: "CONSULT_SAGE";
  /** Case portant le sage. */
  at: Coord;
}

export interface EndTurnAction {
  type: "END_TURN";
}

/** Union de toutes les actions possibles. */
export type Action =
  | MoveUnitAction
  | AttackAction
  | FoundCityAction
  | CaptureCityAction
  | TrainUnitAction
  | ResearchTechAction
  | HarvestResourceAction
  | BuildImprovementAction
  | AttackWallAction
  | ClaimCityRewardAction
  | ConsultSageAction
  | EndTurnAction;

export type ActionType = Action["type"];

/**
 * Enveloppe réseau : une action est toujours émise par un joueur donné.
 * Utilisée à l'Étape 3 (serveur autoritaire).
 */
export interface PlayerAction {
  playerId: PlayerId;
  action: Action;
}
