/**
 * IA gloutonne (cf. §6) — PURE et DÉTERMINISTE (aucun RNG, aucun effet de bord).
 * Produit EXACTEMENT les mêmes Actions qu'un humain (même interface).
 *
 * Priorités : capturer une ville > attaquer si avantageux > récolter > recruter
 * > avancer vers l'ennemi (ou se replier si blessé) > chercher une tech > fin de tour.
 * Un peu de stratégie : cible les attaques rentables, replie les unités à bas PV.
 */

import type {
  Action,
  City,
  CityReward,
  Coord,
  GameState,
  MoveUnitAction,
  PlayerId,
  Unit,
  UnitType,
} from "@polytopia/shared";
import { NAVAL_MOVEMENT, RESOURCE_POP_GAIN, TECHS, UNIT_STATS } from "@polytopia/shared";
import { isLegal } from "./isLegal.js";
import { applyAction } from "./applyAction.js";
import { chebyshev, freeSpawnTileFor, isWaterAt } from "./units.js";
import { computeCombat, getDefenseBonus, maxHp } from "./combat.js";
import { computeTechCost, getPlayerCityCount, playerHasTech, trainableUnitsFor } from "./tech.js";
import { areAllies } from "./state.js";
import { findPath } from "./pathfinding.js";

/** Seuil de PV (fraction du max) en-dessous duquel une unité se replie. */
const RETREAT_HP_RATIO = 0.4;
/** Garde-fou : nb max d'actions IA par tour. */
const MAX_ACTIONS_PER_TURN = 200;

/** Coordonnées des cibles ennemies (unités + villes adverses). */
function enemyTargets(state: GameState, pid: PlayerId): Coord[] {
  const targets: Coord[] = [];
  for (const u of state.units) if (u.ownerId !== pid) targets.push({ x: u.x, y: u.y });
  for (const c of state.cities) if (c.ownerId !== pid) targets.push({ x: c.x, y: c.y });
  return targets;
}

function nearestDist(from: Coord, targets: readonly Coord[]): number {
  let best = Infinity;
  for (const t of targets) best = Math.min(best, chebyshev(from, t));
  return best;
}

type MovePref = "toward" | "away" | "reposition";

/**
 * Meilleur déplacement légal d'une unité vis-à-vis de `targets` :
 * - "toward" : se rapprocher (n'agit que si on fait strictement mieux) ;
 * - "away"   : s'éloigner (repli) ;
 * - "reposition" : n'importe quel pas légal, en privilégiant l'éloignement
 *   (sert à libérer une case-ville pour recruter, sans s'exposer).
 */
function bestMove(
  state: GameState,
  unit: Unit,
  targets: readonly Coord[],
  pref: MovePref,
): MoveUnitAction | null {
  if (pref !== "reposition" && targets.length === 0) return null;
  const from = { x: unit.x, y: unit.y };
  const d0 = nearestDist(from, targets);
  let best: MoveUnitAction | null = null;
  let bestScore = pref === "toward" ? d0 : pref === "away" ? d0 : -Infinity;
  // La vitesse navale ne vaut que si l'unité est DÉJÀ sur l'eau (embarquée) : on
  // n'explore la portée NAVALE que dans ce cas ; sur terre, portée terrestre
  // (embarquer = 1 case). isLegal écarte de toute façon les coups illégaux.
  const canNavigate = playerHasTech(state, unit.ownerId, "navigation");
  const onWater = isWaterAt(state, unit.x, unit.y);
  const mv = canNavigate && onWater ? Math.max(unit.movement, NAVAL_MOVEMENT) : unit.movement;
  // Si "toward", on utilise l'algorithme A* pour trouver la vraie distance (prenant en compte montagnes/eau).
  const getDist = (startCoord: Coord) => {
    if (pref !== "toward") return targets.length > 0 ? nearestDist(startCoord, targets) : 0;
    let minPathLen = Infinity;
    for (const t of targets) {
      const path = findPath(state, startCoord, t, canNavigate);
      if (path && path.length < minPathLen) minPathLen = path.length;
    }
    return minPathLen;
  };

  for (let dy = -mv; dy <= mv; dy++) {
    for (let dx = -mv; dx <= mv; dx++) {
      if (dx === 0 && dy === 0) continue;
      const to = { x: unit.x + dx, y: unit.y + dy };
      const action: MoveUnitAction = { type: "MOVE_UNIT", unitId: unit.id, to };
      if (!isLegal(state, action)) continue;
      const d = getDist(to);
      const better =
        pref === "toward" ? d < bestScore : pref === "away" ? d > bestScore : d > bestScore;
      if (better) {
        bestScore = d;
        best = action;
      }
    }
  }
  return best;
}

/**
 * Choix de récompense de niveau pour l'IA : une troupe gratuite si l'armée n'est
 * pas encore au plafond et qu'une case d'apparition est libre, sinon un atelier
 * (croissance économique, toujours encaissable).
 */
function chooseReward(
  state: GameState,
  pid: PlayerId,
  city: City,
  unitCount: number,
  cityCount: number,
): CityReward {
  const armyCap = Math.max(3, cityCount * 3 + 1);
  if (unitCount < armyCap && freeSpawnTileFor(state, city) !== null) return "troupe";
  return "atelier";
}

/** Coût de l'unité débloquée la moins chère (Infinity si aucune). */
function cheapestUnitCost(state: GameState, pid: PlayerId): number {
  let min = Infinity;
  for (const t of trainableUnitsFor(state, pid)) min = Math.min(min, UNIT_STATS[t].cost);
  return min;
}

/** Y a-t-il de l'eau dans le rayon `r` (Chebyshev) d'une case ? */
function nearWater(state: GameState, c: Coord, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (isWaterAt(state, c.x + dx, c.y + dy)) return true;
    }
  }
  return false;
}

/**
 * L'IA gagnerait-elle à apprendre la Navigation ? Vrai si elle ne l'a pas encore
 * ET qu'une de ses unités/villes borde l'eau (carte maritime : sans la marine,
 * l'IA resterait coincée sur sa terre). Sert à prioriser la recherche.
 */
function aiWantsNavigation(state: GameState, pid: PlayerId): boolean {
  if (playerHasTech(state, pid, "navigation")) return false;
  for (const u of state.units) if (u.ownerId === pid && nearWater(state, u, 2)) return true;
  for (const c of state.cities) if (c.ownerId === pid && nearWater(state, c, 2)) return true;
  return false;
}

/**
 * Calcule la PROCHAINE action de l'IA `pid` (qui doit être le joueur courant).
 * Toujours une action LÉGALE ; renvoie END_TURN quand il n'y a plus rien d'utile.
 */
export function nextAIAction(state: GameState, pid: PlayerId): Action {
  const player = state.players[pid];
  const myUnits = state.units.filter((u) => u.ownerId === pid);
  const myCities = state.cities.filter((c) => c.ownerId === pid);

  const isBarbarian = player?.civName === "Barbares";

  // --- COMPORTEMENT BARBARE ---
  if (isBarbarian) {
    // 1. Attaquer
    let bestAtk: Action | null = null;
    let bestAtkScore = -Infinity;
    for (const u of myUnits) {
      if (u.hasAttacked) continue;
      for (const t of state.units) {
        if (t.ownerId === pid) continue;
        const action: Action = { type: "ATTACK", attackerId: u.id, targetId: t.id };
        if (!isLegal(state, action)) continue;
        const melee = chebyshev(u, t) === 1;
        const r = computeCombat(u, t, melee, getDefenseBonus(state, t));
        if (r.attackerDies && !r.defenderDies) continue; 
        const score = r.defenderDies ? 1000 + r.defenderDamage : r.defenderDamage - r.attackerDamage;
        if (score >= 0 && score > bestAtkScore) {
          bestAtkScore = score;
          bestAtk = action;
        }
      }
    }
    if (bestAtk) return bestAtk;

    // 2. Se déplacer (vers le plus proche, n'importe qui)
    const enemies = enemyTargets(state, pid);
    for (const u of myUnits) {
      if (u.hasMoved) continue;
      const m = bestMove(state, u, enemies, "toward");
      if (m) return m;
    }

    return { type: "END_TURN" };
  }
  // --- FIN COMPORTEMENT BARBARE ---


  // 0a. Trahison et Opportunisme (Briser la paix)
  // Si un allié est très faible (2x moins de villes), on le trahit.
  for (const p of state.players) {
    if (p.id === pid || p.civName === "Barbares") continue;
    if (areAllies(state, pid, p.id)) {
      const hisCities = getPlayerCityCount(state, p.id);
      if (hisCities > 0 && hisCities < myCities.length / 2) {
        const action: Action = { type: "BREAK_PEACE", with: p.id };
        if (isLegal(state, action)) return action;
      }
    }
  }

  // 0b. Supplication (Proposer la paix)
  // Si on est très faible (1 ville) et qu'un joueur non-allié est très fort (>3 villes).
  if (myCities.length <= 1) {
    for (const p of state.players) {
      if (p.id === pid || p.civName === "Barbares") continue;
      if (!areAllies(state, pid, p.id) && getPlayerCityCount(state, p.id) >= 3) {
        const action: Action = { type: "PROPOSE_PEACE", to: p.id };
        if (isLegal(state, action)) return action;
      }
    }
  }

  // 0c. Urgence Défensive : Muraille
  // Si une unité ennemie est à 2 cases d'une ville sans défense, construire un rempart.
  for (const c of myCities) {
    if (c.hasWall) continue;
    const isThreatened = state.units.some(u => u.ownerId !== pid && chebyshev(u, c) <= 2);
    if (isThreatened) {
      const action: Action = { type: "BUILD_IMPROVEMENT", cityId: c.id, improvement: "muraille" };
      if (isLegal(state, action)) return action;
    }
  }

  // 1. Capturer une ville ennemie (priorité absolue : condition de victoire).
  for (const u of myUnits) {
    const action: Action = { type: "CAPTURE_CITY", unitId: u.id };
    if (isLegal(state, action)) return action;
  }

  // 1b. Fonder une ville sur un village où l'on se tient (expansion = revenu + score).
  for (const u of myUnits) {
    const action: Action = { type: "FOUND_CITY", unitId: u.id };
    if (isLegal(state, action)) return action;
  }

  // 1c. Encaisser les récompenses de niveau en attente (valeur gratuite).
  for (const c of myCities) {
    if ((c.rewardsToPick ?? 0) <= 0) continue;
    const reward = chooseReward(state, pid, c, myUnits.length, myCities.length);
    const action: Action = { type: "CLAIM_CITY_REWARD", cityId: c.id, reward };
    if (isLegal(state, action)) return action;
  }

  // 2. Attaquer si avantageux (tue la cible, ou dégâts nets >= 0).
  let bestAtk: Action | null = null;
  let bestAtkScore = -Infinity;
  for (const u of myUnits) {
    if (u.hasAttacked) continue;
    for (const t of state.units) {
      if (t.ownerId === pid) continue;
      const action: Action = { type: "ATTACK", attackerId: u.id, targetId: t.id };
      if (!isLegal(state, action)) continue;
      const melee = chebyshev(u, t) === 1;
      const r = computeCombat(u, t, melee, getDefenseBonus(state, t));
      if (r.attackerDies && !r.defenderDies) continue; // pas de suicide
      const score = r.defenderDies ? 1000 + r.defenderDamage : r.defenderDamage - r.attackerDamage;
      if (score >= 0 && score > bestAtkScore) {
        bestAtkScore = score;
        bestAtk = action;
      }
    }
  }
  if (bestAtk) return bestAtk;

  // 3. Récolter la meilleure ressource accessible (croissance économique).
  //    Les ressources stratégiques (fer, chevaux) ont une priorité ABSOLUE.
  let bestHarvest: Action | null = null;
  let bestGain = -1;
  for (const c of myCities) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const at = { x: c.x + dx, y: c.y + dy };
        const action: Action = { type: "HARVEST_RESOURCE", cityId: c.id, at };
        if (!isLegal(state, action)) continue;
        const tile = state.tiles[at.y * state.width + at.x];
        let gain = tile?.resource ? RESOURCE_POP_GAIN[tile.resource] : 0;
        if (tile?.resource === "fer" || tile?.resource === "chevaux") {
          gain += 100; // Priorité absolue
        }
        if (gain > bestGain) {
          bestGain = gain;
          bestHarvest = action;
        }
      }
    }
  }
  if (bestHarvest) return bestHarvest;

  // 4. Recruter l'unité la plus forte abordable. Le plafond doit rester AU-DESSUS
  //    du seuil offensif, sinon l'IA plafonne sans jamais pouvoir attaquer.
  const armyCap = Math.max(3, myCities.length * 3 + 1);
  const wantsArmy = myUnits.length < armyCap;
  if (wantsArmy) {
    const unlocked = trainableUnitsFor(state, pid);
    for (const c of myCities) {
      let bestUnit: UnitType | null = null;
      let bestCost = -1;
      for (const ut of unlocked) {
        const action: Action = { type: "TRAIN_UNIT", cityId: c.id, unitType: ut };
        if (isLegal(state, action) && UNIT_STATS[ut].cost > bestCost) {
          bestCost = UNIT_STATS[ut].cost;
          bestUnit = ut;
        }
      }
      if (bestUnit) return { type: "TRAIN_UNIT", cityId: c.id, unitType: bestUnit };
    }
  }

  // 5. Déplacement — POSTURE défensive par défaut (anti-rush) :
  //    on garde une garnison sur chaque ville ; on ne part à l'offensive que
  //    si on a une armée excédentaire (ou plus aucune ville à défendre).
  const enemies = enemyTargets(state, pid);
  const villages: Coord[] = state.tiles
    .filter((t) => t.village && t.cityId === undefined)
    .map((t) => ({ x: t.x, y: t.y }));
  const cityCoords: Coord[] = myCities.map((c) => ({ x: c.x, y: c.y }));
  const onMyCity = (u: Unit) => myCities.some((c) => c.x === u.x && c.y === u.y);
  // Offensive dès qu'on a ~2 unités au-delà des garnisons (1 / ville).
  const attackMode = myCities.length === 0 || myUnits.length >= myCities.length + 2;
  const canAffordUnit = wantsArmy && (player?.stars ?? 0) >= cheapestUnitCost(state, pid);

  for (const u of myUnits) {
    if (u.hasMoved) continue;
    const injured = u.hp < maxHp(u) * RETREAT_HP_RATIO;

    if (injured) {
      const m = bestMove(state, u, cityCoords.length ? cityCoords : enemies, "away");
      if (m) return m;
      continue;
    }
    if (onMyCity(u)) {
      // La garnison ne bouge QUE pour libérer la ville et permettre un recrutement.
      if (canAffordUnit) {
        const m = bestMove(state, u, enemies, "reposition");
        if (m) return m;
      }
      continue; // sinon elle reste en défense
    }
    // Unité de campagne : on colonise les villages libres en priorité (expansion),
    // sinon à l'assaut en mode offensif, sinon on se regroupe à la maison.
    const m =
      villages.length > 0
        ? bestMove(state, u, villages, "toward")
        : attackMode
          ? bestMove(state, u, enemies, "toward")
          : bestMove(state, u, cityCoords, "toward");
    if (m) return m;
  }

  // 6a. Marine : sur une carte d'eau, viser la Navigation (et son prérequis
  //     Pêche) en priorité — sinon l'IA n'irait jamais coloniser/attaquer
  //     par-delà la mer. Si pas encore abordable, on retombe sur le choix générique.
  if (aiWantsNavigation(state, pid)) {
    for (const techId of ["navigation", "peche"]) {
      const action: Action = { type: "RESEARCH_TECH", techId };
      if (isLegal(state, action)) return action;
    }
  }

  // 6. Dépenser le surplus en recherche (tech légale la moins chère).
  let bestTech: Action | null = null;
  let bestTechCost = Infinity;
  const cityCount = getPlayerCityCount(state, pid);
  for (const tech of Object.values(TECHS)) {
    const action: Action = { type: "RESEARCH_TECH", techId: tech.id };
    if (!isLegal(state, action)) continue;
    const cost = computeTechCost(tech.tier, cityCount);
    if (cost < bestTechCost) {
      bestTechCost = cost;
      bestTech = action;
    }
  }
  if (bestTech) return bestTech;

  // 7. Plus rien d'utile : fin de tour.
  return { type: "END_TURN" };
}

export interface AITurnResult {
  state: GameState;
  actions: Action[];
}

/**
 * Joue entièrement le tour de l'IA `pid` (utile pour tests et exécution serveur
 * sans délai). Applique les actions jusqu'à END_TURN inclus. Toujours terminant.
 */
export function runAITurn(state: GameState, pid: PlayerId): AITurnResult {
  const actions: Action[] = [];
  let current = state;
  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    const action = nextAIAction(current, pid);
    actions.push(action);
    current = applyAction(current, action);
    if (action.type === "END_TURN") break;
  }
  return { state: current, actions };
}
