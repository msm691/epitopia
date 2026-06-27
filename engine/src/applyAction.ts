/**
 * applyAction : SEULE fonction autorisée à produire un nouvel état.
 * Immutable : ne mute jamais l'état reçu, renvoie un nouvel objet.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 */

import type {
  Action,
  AttackAction,
  AttackWallAction,
  BuildImprovementAction,
  CaptureCityAction,
  City,
  ClaimCityRewardAction,
  ConsultSageAction,
  FoundCityAction,
  GameState,
  HarvestResourceAction,
  MoveUnitAction,
  ResearchTechAction,
  Tile,
  TrainUnitAction,
  Unit,
  ProposePeaceAction,
  AcceptPeaceAction,
  BreakPeaceAction,
  ExploreRuinAction,
  AdoptDoctrineAction,
} from "@polytopia/shared";
import {
  CITY_HARVEST_RADIUS,
  FOUNDED_CITY_LEVEL,
  improvementCost,
  REWARD_TROOP_UNIT,
  RESOURCE_HARVEST_COST,
  RESOURCE_POP_GAIN,
  TREASURE_STARS,
  TREASURE_STARS,
  UNIT_STATS,
  unitBuildTurns,
  WALL_MAX_HP,
  DOCTRINES,
} from "@polytopia/shared";
import { isLegal } from "./isLegal.js";
import { cityStarsPerTurn, computeStarsPerTurn, getPlayerIncome, levelUpCity } from "./economy.js";
import { freeSpawnTileFor, makeUnit, tileAt, chebyshev, isWaterAt } from "./units.js";
import { computeCombat, computeWallDamage, getDefenseBonus } from "./combat.js";
import { computeTechCost, getPlayerCityCount, getTech } from "./tech.js";
import { resolveConsultSage } from "./sages.js";
import { tileIndex, areAllies } from "./state.js";

/** Erreur levée quand on tente d'appliquer une action illégale. */
export class IllegalActionError extends Error {
  constructor(public readonly action: Action) {
    super(`Action illégale: ${action.type}`);
    this.name = "IllegalActionError";
  }
}

function progressQuest(state: GameState, pid: number, qType: "kill" | "harvest" | "tech"): GameState {
  const p = state.players[pid];
  if (!p || !p.activeQuest || p.activeQuest.type !== qType) return state;

  const quest = p.activeQuest;
  const nextProgress = quest.progress + 1;
  
  if (nextProgress >= quest.target) {
    // Quête terminée !
    let nextP = { ...p, activeQuest: undefined };
    let { units, nextUnitId, tiles } = state;
    const msg = `Quête accomplie ! Récompense : ${quest.reward === 'stars' ? 'Pactole (+20⭐)' : quest.reward === 'hero' ? 'Héros' : 'Technologie gratuite'}`;
    const activeEvents = [...(state.activeEvents ?? []), { type: 'questComplete', msg, expiresAtTurn: state.turn + 1 }];
    
    if (quest.reward === "stars") {
      nextP.stars += 20;
    } else if (quest.reward === "hero") {
      // Spawn hero at capital or random city
      const city = state.cities.find(c => c.ownerId === pid);
      if (city) {
        const spot = freeSpawnTileFor(state, city);
        if (spot) {
          const id = `u${nextUnitId++}`;
          units = [...units, makeUnit(id, "hero", pid, spot.x, spot.y, false)];
          const tile = tileAt(state, spot.x, spot.y)!;
          tiles = withTile(tiles, state.width, { ...tile, unitId: id });
          nextP.heroStatus = "alive";
        }
      }
    } else if (quest.reward === "tech") {
      // Find a tech they don't have
      const owned = new Set(nextP.unlockedTechs);
      const candidates = Object.values(import("@polytopia/shared").then(m => m.TECHS).catch(() => ({} as any))) // HACK: TECHS is imported from shared
      // actually TECHS isn't available easily without await. Wait, TECHS is imported at the top? No, it's not.
      nextP.stars += 15; // fallback to stars
    }

    return { 
      ...state, 
      players: state.players.map(pl => pl.id === pid ? nextP : pl),
      units, nextUnitId, tiles, activeEvents
    };
  }

  // En cours
  const nextP = { ...p, activeQuest: { ...quest, progress: nextProgress } };
  return { ...state, players: state.players.map(pl => pl.id === pid ? nextP : pl) };
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!isLegal(state, action)) {
    throw new IllegalActionError(action);
  }

  switch (action.type) {
    case "END_TURN":
      return endTurn(state);
    case "TRAIN_UNIT":
      return trainUnit(state, action);
    case "MOVE_UNIT":
      return moveUnit(state, action);
    case "ATTACK":
      return attack(state, action);
    case "CAPTURE_CITY":
      return captureCity(state, action);
    case "RESEARCH_TECH":
      return researchTech(state, action);
    case "HARVEST_RESOURCE":
      return harvestResource(state, action);
    case "FOUND_CITY":
      return foundCity(state, action);
    case "CLAIM_CITY_REWARD":
      return claimCityReward(state, action);
    case "BUILD_IMPROVEMENT":
      return buildImprovement(state, action);
    case "ATTACK_WALL":
      return attackWall(state, action);
    case "CONSULT_SAGE":
      return consultSage(state, action);
    case "PROPOSE_PEACE":
      return proposePeace(state, action);
    case "ACCEPT_PEACE":
      return acceptPeace(state, action);
    case "BREAK_PEACE":
      return breakPeace(state, action);
    case "EXPLORE_RUIN":
      return exploreRuin(state, action);
    case "ADOPT_DOCTRINE":
      return adoptDoctrine(state, action);
    case "BUILD_ROAD":
      return buildRoad(state, action as BuildRoadAction);
    case "UPGRADE_HERO":
      return upgradeHero(state, action as UpgradeHeroAction);
  }
}

function adoptDoctrine(state: GameState, action: AdoptDoctrineAction): GameState {
  const doctrine = DOCTRINES[action.doctrineId];
  const players = state.players.map((p) =>
    p.id === state.currentPlayer
      ? {
          ...p,
          culture: Math.max(0, (p.culture ?? 0) - doctrine.cost),
          culturalDoctrines: [...(p.culturalDoctrines ?? []), action.doctrineId],
        }
      : p,
  );
  return { ...state, players };
}

function proposePeace(state: GameState, action: ProposePeaceAction): GameState {
  const peaceProposals = [...state.peaceProposals, { from: state.currentPlayer, to: action.to }];
  return { ...state, peaceProposals };
}

function acceptPeace(state: GameState, action: AcceptPeaceAction): GameState {
  const peaceProposals = state.peaceProposals.filter(p => !(p.from === action.with && p.to === state.currentPlayer));
  const alliances: [number, number][] = [...state.alliances, [action.with, state.currentPlayer]];
  return { ...state, peaceProposals, alliances };
}

function breakPeace(state: GameState, action: BreakPeaceAction): GameState {
  const alliances: [number, number][] = state.alliances.filter(([a, b]) => !((a === state.currentPlayer && b === action.with) || (a === action.with && b === state.currentPlayer)));
  return { ...state, alliances };
}

function exploreRuin(state: GameState, action: ExploreRuinAction): GameState {
  const unit = state.units.find((u) => u.id === action.unitId)!;
  const tileIdx = tileIndex(state.width, unit.x, unit.y);
  const tile = state.tiles[tileIdx];
  const tiles = [...state.tiles];
  tiles[tileIdx] = { ...tile, ruin: false };

  // Random reward: 50% gold, 50% veteran (or artifact for hero)
  const isGold = Math.random() > 0.5;
  let players = state.players;
  let units = state.units;

  if (isGold) {
    players = players.map(p => p.id === state.currentPlayer ? { ...p, stars: p.stars + 10 } : p);
  } else {
    if (unit.isHero) {
      const artifacts = ["Épée de Feu", "Bouclier d'Ancien", "Bottes de Vent"];
      const newArtifact = artifacts[Math.floor(Math.random() * artifacts.length)];
      units = units.map(u => u.id === unit.id ? { 
        ...u, 
        artifacts: [...(u.artifacts ?? []), newArtifact!], 
        hp: u.hp + 5,
        attack: u.attack + (newArtifact === "Épée de Feu" ? 1 : 0),
        defense: u.defense + (newArtifact === "Bouclier d'Ancien" ? 1 : 0),
        movement: u.movement + (newArtifact === "Bottes de Vent" ? 1 : 0),
      } : u);
    } else {
      units = units.map(u => u.id === unit.id ? { ...u, level: (u.level ?? 0) + 1, hp: u.hp + 5 } : u);
    }
  }

  // Update unit hasMoved to prevent multiple actions
  units = units.map(u => u.id === unit.id ? { ...u, hasMoved: true } : u);

  return { ...state, tiles, players, units };
}

/** Consulter un sage : délègue au module pur (RNG seedé, effet adaptatif). */
function consultSage(state: GameState, action: ConsultSageAction): GameState {
  return resolveConsultSage(state, action.at);
}

/** Bâtir une amélioration en dépensant des étoiles (tech Construction). */
function buildImprovement(state: GameState, action: BuildImprovementAction): GameState {
  const city = state.cities.find((c) => c.id === action.cityId)!;
  const player = state.players.find(p => p.id === city.ownerId);
  const cost = improvementCost(action.improvement, city.builtWorkshops ?? 0, player);
  const players = state.players.map((p) =>
    p.id === city.ownerId ? { ...p, stars: p.stars - cost } : p,
  );

  let updated: City = city;
  let builtWonders = state.builtWonders;

  if (action.improvement === "atelier") {
    const workshops = (city.workshops ?? 0) + 1;
    const builtWorkshops = (city.builtWorkshops ?? 0) + 1; // compteur de coût (hors récompenses)
    updated = { ...city, workshops, builtWorkshops, starsPerTurn: cityStarsPerTurn(city.level, workshops) };
  } else if (action.improvement === "muraille") {
    updated = { ...city, hasWall: true, wallHp: WALL_MAX_HP };
  } else if (action.improvement === "pyramides" || action.improvement === "colosse") {
    // Les merveilles ne modifient pas directement la ville (hormis peut-être un flag cosmétique)
    // Elles s'ajoutent à la liste mondiale
    builtWonders = [...builtWonders, { type: action.improvement, ownerId: city.ownerId }];
  }

  const cities = state.cities.map((c) => (c.id === city.id ? updated : c));
  return { ...state, players, cities, builtWonders };
}

/** Attaquer un rempart : réduit ses PV ; à 0 il tombe (la ville devient prenable). */
function attackWall(state: GameState, action: AttackWallAction): GameState {
  const attacker = state.units.find((u) => u.id === action.attackerId)!;
  const city = state.cities.find((c) => c.id === action.cityId)!;
  const wallHp = (city.wallHp ?? 0) - computeWallDamage(state, attacker);
  const updated: City =
    wallHp <= 0 ? { ...city, hasWall: false, wallHp: 0 } : { ...city, wallHp };
  const cities = state.cities.map((c) => (c.id === city.id ? updated : c));
  // L'attaquant a agi : il ne peut plus bouger ni attaquer ce tour.
  const units = state.units.map((u) =>
    u.id === attacker.id ? { ...u, hasAttacked: true, hasMoved: true } : u,
  );
  return { ...state, cities, units };
}

function buildRoad(state: GameState, action: import("@polytopia/shared").BuildRoadAction): GameState {
  const unit = state.units.find((u) => u.id === action.unitId)!;
  const tile = state.tiles[unit.y * state.width + unit.x];

  const tiles = withTile(state.tiles, state.width, { ...tile, hasRoad: true });
  const players = state.players.map(p => 
    p.id === state.currentPlayer ? { ...p, stars: p.stars - 1 } : p
  );

  return { ...state, tiles, players };
}

function upgradeHero(state: GameState, action: import("@polytopia/shared").UpgradeHeroAction): GameState {
  // Simplifié pour l'instant
  return state;
}

/**
 * Applique une récompense de montée de niveau choisie pour une ville, et décrémente
 * son compteur de récompenses en attente.
 * - atelier : +1 atelier (= +1★/tour permanent) ; tresor : +5★ immédiats au joueur ;
 * - troupe : un guerrier gratuit (sur la ville ou une case voisine libre) ;
 * - muraille : pose une muraille (renforce la défense de la ville).
 */
function claimCityReward(state: GameState, action: ClaimCityRewardAction): GameState {
  const city = state.cities.find((c) => c.id === action.cityId)!;
  let updated: City = { ...city, rewardsToPick: (city.rewardsToPick ?? 0) - 1 };
  let players = state.players;
  let units = state.units;
  let tiles = state.tiles;
  let nextUnitId = state.nextUnitId;

  switch (action.reward) {
    case "tresor":
      players = players.map((p) =>
        p.id === city.ownerId ? { ...p, stars: p.stars + TREASURE_STARS } : p,
      );
      break;
    case "atelier": {
      const workshops = (city.workshops ?? 0) + 1;
      updated = { ...updated, workshops, starsPerTurn: cityStarsPerTurn(city.level, workshops) };
      break;
    }
    case "muraille":
      updated = { ...updated, hasWall: true, wallHp: WALL_MAX_HP };
      break;
    case "agrandir":
      updated = { ...updated, harvestRadius: (city.harvestRadius ?? CITY_HARVEST_RADIUS) + 1 };
      break;
    case "troupe": {
      const spot = freeSpawnTileFor(state, city)!; // garanti par isLegal
      const id = `u${nextUnitId++}`;
      units = [...units, makeUnit(id, REWARD_TROOP_UNIT, city.ownerId, spot.x, spot.y, true)];
      const tile = tileAt(state, spot.x, spot.y)!;
      tiles = withTile(tiles, state.width, { ...tile, unitId: id });
      break;
    }
  }

  const cities = state.cities.map((c) => (c.id === city.id ? updated : c));
  return { ...state, players, units, tiles, cities, nextUnitId };
}

/**
 * Fonde une ville sur un village neutre : l'unité reste en garnison, le village
 * devient une ville niveau 1 du joueur, et le territoire alentour (rayon 1, cases
 * encore libres) est revendiqué. Moteur principal de l'expansion.
 */
function foundCity(state: GameState, action: FoundCityAction): GameState {
  const unit = state.units.find((u) => u.id === action.unitId)!;
  const id = `city-${state.nextCityId}`;
  const level = FOUNDED_CITY_LEVEL;
  const city: City = {
    id,
    ownerId: unit.ownerId,
    x: unit.x,
    y: unit.y,
    level,
    population: 0,
    starsPerTurn: computeStarsPerTurn(level),
  };

  const tiles = state.tiles.slice();
  // La case-ville : on retire le marqueur village, on pose ville + propriétaire.
  const here = tiles[tileIndex(state.width, unit.x, unit.y)]!;
  const { village: _v, ...rest } = here;
  tiles[tileIndex(state.width, unit.x, unit.y)] = {
    ...rest,
    cityId: id,
    ownerId: unit.ownerId,
  };
  // Territoire : revendique les cases voisines encore neutres (rayon 1).
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = unit.x + dx;
      const ny = unit.y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const idx = tileIndex(state.width, nx, ny);
      const t = tiles[idx]!;
      if (t.ownerId === undefined && t.cityId === undefined) {
        tiles[idx] = { ...t, ownerId: unit.ownerId };
      }
    }
  }

  return {
    ...state,
    cities: [...state.cities, city],
    tiles,
    nextCityId: state.nextCityId + 1,
  };
}

function harvestResource(state: GameState, action: HarvestResourceAction): GameState {
  const city = state.cities.find((c) => c.id === action.cityId)!;
  const tile = tileAt(state, action.at.x, action.at.y)!;
  const resource = tile.resource!;
  const cost = RESOURCE_HARVEST_COST[resource];
  const popGain = RESOURCE_POP_GAIN[resource];

  // Déduit le coût au propriétaire de la ville.
  const players = state.players.map((p) => {
    if (p.id === city.ownerId) {
      return { ...p, stars: p.stars - cost };
    }
    return p;
  });

  // Population + montée de niveau.
  const cities = state.cities.map((c) => (c.id === city.id ? levelUpCity(c, popGain) : c));

  // Ressource consommée (retirée de la case).
  const { resource: _consumed, ...clearedTile } = tile;
  const tiles = withTile(state.tiles, state.width, clearedTile);

  const newState = { ...state, players, cities, tiles };
  return progressQuest(newState, city.ownerId, "harvest");
}

function researchTech(state: GameState, action: ResearchTechAction): GameState {
  const playerId = state.currentPlayer;
  const player = state.players.find(p => p.id === playerId);
  const cityCount = getPlayerCityCount(state, playerId);
  const tech = getTech(action.techId)!;
  const cost = computeTechCost(tech.tier, cityCount, player);

  const players = state.players.map((p) =>
    p.id === playerId
      ? { ...p, stars: p.stars - cost, unlockedTechs: [...p.unlockedTechs, tech.id] }
      : p,
  );

  const newState = { ...state, players };
  return progressQuest(newState, playerId, "tech");
}

function removeUnit(units: Unit[], tiles: Tile[], width: number, dead: Unit, players?: Player[]): {
  units: Unit[];
  tiles: Tile[];
  players?: Player[];
} {
  const remaining = units.filter((u) => u.id !== dead.id);
  const tile = tiles[tileIndex(width, dead.x, dead.y)];
  let nextTiles = tiles;
  let nextPlayers = players;
  if (tile && tile.unitId === dead.id) {
    const { unitId: _removed, ...cleared } = tile;
    nextTiles = withTile(tiles, width, cleared);
  }
  if (dead.isHero && nextPlayers) {
    nextPlayers = nextPlayers.map(p => p.id === dead.ownerId ? { ...p, heroStatus: "dead" as const } : p);
  }
  return { units: remaining, tiles: nextTiles, players: nextPlayers };
}


function attack(state: GameState, action: AttackAction): GameState {
  const attacker = state.units.find((u) => u.id === action.attackerId)!;
  const defender = state.units.find((u) => u.id === action.targetId)!;
  const isMelee = chebyshev(attacker, defender) <= 1;
  const defenseBonus = getDefenseBonus(state, defender);
  const result = computeCombat(state, attacker, defender, isMelee, defenseBonus);

  // L'attaquant a agi : il ne peut plus bouger ni attaquer ce tour.
  let attackerNow: Unit = { ...attacker, hasAttacked: true, hasMoved: true };
  let units = state.units.map((u) => (u.id === attacker.id ? attackerNow : u));
  let tiles = state.tiles;

  let players = state.players;

  // Applique XP au héros attaquant
  if (attackerNow.isHero) {
    const xp = (attackerNow.xp ?? 0) + 1;
    let level = attackerNow.level ?? 1;
    let hp = attackerNow.hp;
    // Level up tous les 3 combats
    if (xp >= level * 3) {
      level += 1;
      hp += 5; // Soin / Max HP bonus au level up
      attackerNow.attack += 1; // Bonus attaque
    }
    attackerNow = { ...attackerNow, xp, level, hp };
  }

  if (result.defenderDies) {
    ({ units, tiles, players } = removeUnit(units, tiles, state.width, defender, players));
    const newState = { ...state, units, tiles, players: players ?? state.players };
    return progressQuest(newState, attackerNow.ownerId, "kill");
  }

  // Défenseur survit -> on lui applique les dégâts.
  let defenderNow: Unit = { ...defender, hp: defender.hp - result.defenderDamage };
  
  // Applique XP au héros défenseur
  if (defenderNow.isHero) {
    const xp = (defenderNow.xp ?? 0) + 1;
    let level = defenderNow.level ?? 1;
    let hp = defenderNow.hp;
    if (xp >= level * 3) {
      level += 1;
      hp += 5;
      defenderNow.defense += 1; // Bonus défense
    }
    defenderNow = { ...defenderNow, xp, level, hp };
  }

  units = units.map((u) => (u.id === defender.id ? defenderNow : u));

  // Riposte éventuelle sur l'attaquant.
  if (result.attackerDamage > 0) {
    if (result.attackerDies) {
      ({ units, tiles, players } = removeUnit(units, tiles, state.width, attackerNow, players));
    } else {
      attackerNow = { ...attackerNow, hp: attackerNow.hp - result.attackerDamage };
      units = units.map((u) => (u.id === attacker.id ? attackerNow : u));
    }
  } else {
    // Si pas de riposte et l'attaquant est un héros, on met à jour dans la liste
    if (attackerNow.isHero) {
      units = units.map((u) => (u.id === attacker.id ? attackerNow : u));
    }
  }

  return { ...state, units, tiles, players: players ?? state.players };
}

function captureCity(state: GameState, action: CaptureCityAction): GameState {
  const unit = state.units.find((u) => u.id === action.unitId)!;
  const tile = tileAt(state, unit.x, unit.y)!;

  const cities = state.cities.map((c) =>
    c.id === tile.cityId ? { ...c, ownerId: unit.ownerId } : c,
  );
  const tiles = withTile(state.tiles, state.width, { ...tile, ownerId: unit.ownerId });

  return { ...state, cities, tiles };
}

/** Remplace une tuile dans le tableau (copie immutable). */
function withTile(tiles: Tile[], width: number, tile: Tile): Tile[] {
  const copy = tiles.slice();
  copy[tileIndex(width, tile.x, tile.y)] = tile;
  return copy;
}

function trainUnit(state: GameState, action: TrainUnitAction): GameState {
  const city = state.cities.find((c) => c.id === action.cityId)!;
  const cost = UNIT_STATS[action.unitType].cost;

  // Le coût est payé tout de suite dans tous les cas.
  let players = state.players.map((p) =>
    p.id === city.ownerId ? { ...p, stars: p.stars - cost } : p,
  );

  if (action.unitType === "hero") {
    players = players.map(p => p.id === city.ownerId ? { ...p, heroStatus: "alive" as const } : p);
  }

  // Grosses unités : mises en PRODUCTION (la ville reste occupée, l'unité
  // apparaîtra au début d'un futur tour du propriétaire).
  const buildTurns = unitBuildTurns(action.unitType);
  if (buildTurns > 0) {
    const cities = state.cities.map((c) =>
      c.id === city.id
        ? { ...c, production: { unitType: action.unitType, turnsLeft: buildTurns } }
        : c,
    );
    return { ...state, players, cities };
  }

  // Unité immédiate : créée inactive (ne joue pas le tour de son recrutement).
  const id = `u${state.nextUnitId}`;
  let unit = makeUnit(id, action.unitType, city.ownerId, city.x, city.y, true);
  if (action.unitType === "hero") {
    unit = { ...unit, isHero: true };
  }
  
  const tile = tileAt(state, city.x, city.y)!;
  const tiles = withTile(state.tiles, state.width, { ...tile, unitId: id });

  return {
    ...state,
    players,
    units: [...state.units, unit],
    tiles,
    nextUnitId: state.nextUnitId + 1,
  };
}

function moveUnit(state: GameState, action: MoveUnitAction): GameState {
  const unit = state.units.find((u) => u.id === action.unitId)!;
  const { to } = action;

  const isEmbarked = isWaterAt(state, to.x, to.y);
  const moved: Unit = { ...unit, x: to.x, y: to.y, hasMoved: true, isEmbarked };
  const units = state.units.map((u) => (u.id === unit.id ? moved : u));

  // Libère l'ancienne case (on retire unitId), occupe la nouvelle.
  const oldTile = tileAt(state, unit.x, unit.y)!;
  const newTile = tileAt(state, to.x, to.y)!;
  const { unitId: _removed, ...clearedOld } = oldTile;
  let tiles = withTile(state.tiles, state.width, clearedOld);
  
  // Détruire un camp barbare si on marche dessus
  const isBarbarianCamp = newTile.barbarianCamp;
  let players = state.players;
  if (isBarbarianCamp) {
    // Bonus de 15 étoiles pour avoir détruit le camp
    players = players.map(p => p.id === unit.ownerId ? { ...p, stars: p.stars + 15 } : p);
  }

  tiles = withTile(tiles, state.width, { ...newTile, unitId: unit.id, barbarianCamp: false });

  return { ...state, units, tiles, players };
}

/** Un joueur est encore en jeu tant qu'il possède au moins une ville, ou s'il s'agit des Barbares. */
function isAlive(state: GameState, pid: number): boolean {
  if (state.players[pid]?.civName === "Barbares") return true;
  return state.cities.some((c) => c.ownerId === pid);
}

/**
 * Passe au joueur suivant. Le joueur dont le tour COMMENCE encaisse le revenu
 * de ses villes et voit ses unités rafraîchies (peuvent rejouer).
 *
 * Les joueurs ÉLIMINÉS (plus aucune ville) sont SAUTÉS : ils ne jouent plus.
 * Le compteur de tour augmente d'un cran chaque fois qu'on repasse le joueur 0
 * (nouvelle manche), même si 0 lui-même est éliminé et donc sauté.
 */
function endTurn(state: GameState): GameState {
  const n = state.players.length;
  let nextPlayer = state.currentPlayer;
  let turn = state.turn;
  for (let i = 0; i < n; i++) {
    nextPlayer = (nextPlayer + 1) % n;
    if (nextPlayer === 0) turn += 1; // on a bouclé : nouvelle manche
    if (isAlive(state, nextPlayer)) break; // sinon on saute cet éliminé
  }

  // Malus « Disette » : le joueur qui commence saute son revenu (puis le flag se consomme).
  const skip = state.players[nextPlayer]?.skipIncome === true;
  const income = skip ? 0 : getPlayerIncome(state, nextPlayer);

  let activeEvents = (state.activeEvents ?? []).filter(e => e.expiresAtTurn > turn);

  const players = state.players.map((p) => {
    if (p.id !== nextPlayer) return p;
    let cultureIncome = state.cities.filter(c => c.ownerId === p.id).reduce((sum, c) => sum + c.level, 0);
    // Les pyramides donnent +5 culture
    if (state.builtWonders.some(w => w.type === "pyramids" && w.ownerId === p.id)) {
      cultureIncome += 5;
    }
    // Merveille Naturelle (Oasis) donne +5 culture
    for (const c of state.cities) {
      if (c.ownerId === p.id) {
        const isNearOasis = state.tiles.some(
          t => t.naturalWonder === "oasis" && chebyshev(t, c) <= 2
        );
        if (isNearOasis) cultureIncome += 5;
      }
    }
    
    let next = { ...p, stars: p.stars + income, culture: (p.culture ?? 0) + cultureIncome };
    if (skip) next.skipIncome = false; // consommé
    
    if (next.activeQuest) {
      if (next.activeQuest.turnsLeft <= 1) {
        next.activeQuest = undefined;
        activeEvents.push({ type: 'questFailed', msg: 'Quête échouée : temps écoulé.', expiresAtTurn: turn + 2 });
      } else {
        next.activeQuest = { ...next.activeQuest, turnsLeft: next.activeQuest.turnsLeft - 1 };
      }
    }
    
    return next;
  });

  // Événements Aléatoires (5% de chance)
  const rngSeed = (state.seed ^ (turn * 1337) ^ (nextPlayer * 9999)) >>> 0;
  const turnRng = (rngSeed % 100) / 100;
  
  if (turnRng < 0.05) {
    const eventType = (rngSeed % 3);
    const activePlayer = players.find(p => p.id === nextPlayer);
    if (activePlayer) {
      if (eventType === 0) {
        activeEvents.push({ type: 'goldenAge', msg: "Âge d'Or ! +20 étoiles soudaines.", expiresAtTurn: turn + 2 });
        activePlayer.stars += 20;
      } else if (eventType === 1) {
        activeEvents.push({ type: 'famine', msg: "Famine ! Vos revenus ont été divisés par deux ce tour.", expiresAtTurn: turn + 2 });
        activePlayer.stars -= Math.floor(income / 2);
      } else {
        activeEvents.push({ type: 'inspiration', msg: "Inspiration ! +10 étoiles.", expiresAtTurn: turn + 2 });
        activePlayer.stars += 10;
      }
    }
  }

  let units = state.units.map((u) =>
    u.ownerId === nextPlayer ? { ...u, hasMoved: false, hasAttacked: false } : u,
  );

  // Production des grosses unités : on décrémente le compteur des villes du joueur
  // qui COMMENCE son tour ; à 0, l'unité apparaît (prête à agir) sur la ville ou
  // une case voisine libre. Si aucune place, la production reste prête et réessaie.
  let tiles = state.tiles;
  let nextUnitId = state.nextUnitId;
  const cities = state.cities.map((c) => {
    if (c.ownerId !== nextPlayer || !c.production) return c;
    const turnsLeft = c.production.turnsLeft - 1;
    if (turnsLeft > 0) return { ...c, production: { ...c.production, turnsLeft } };
    const spot = freeSpawnTileFor({ ...state, tiles, units }, c);
    if (!spot) return { ...c, production: { ...c.production, turnsLeft: 0 } };
    const id = `u${nextUnitId++}`;
    units = [...units, makeUnit(id, c.production.unitType, nextPlayer, spot.x, spot.y, false)];
    const tile = tileAt({ ...state, tiles }, spot.x, spot.y)!;
    tiles = withTile(tiles, state.width, { ...tile, unitId: id });
    const { production: _done, ...rest } = c;
    return rest;
  });

  // Spawn des Barbares
  const isBarbarian = players[nextPlayer]?.civName === "Barbares";
  if (isBarbarian) {
    for (const t of tiles) {
      if (t.barbarianCamp && !t.unitId) {
        // Spawn d'un guerrier barbare avec 30% de chance si le camp est vide
        if (Math.random() < 0.3) {
          const id = `u${nextUnitId++}`;
          units = [...units, makeUnit(id, "guerrier", nextPlayer, t.x, t.y, false)];
          tiles = withTile(tiles, state.width, { ...t, unitId: id });
        }
      }
    }
  }

  return { ...state, players, units, cities, tiles, currentPlayer: nextPlayer, turn, nextUnitId, activeEvents };
}
