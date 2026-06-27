/**
 * Sages mystérieux (Stan & Nico) — PURS et DÉTERMINISTES.
 * Consulter un sage = un dilemme : 50 % bonus / 50 % malus, tiré au RNG SEEDÉ
 * (rejouable, réseau-safe). Les effets sont ADAPTATIFS au revenu/tour du joueur,
 * pour rester marquants même en fin de partie. Le sage disparaît après usage.
 */

import type { Coord, GameState, UnitType } from "@polytopia/shared";
import {
  SAGE_MAX_STARS,
  SAGE_MIN_STARS,
  SAGE_STAR_FACTOR,
  TECHS,
  UNIT_NAMES,
  UNIT_STATS,
  WALL_MAX_HP,
} from "@polytopia/shared";
import { createRng } from "./rng.js";
import { cityStarsPerTurn, getPlayerIncome } from "./economy.js";
import { tileIndex } from "./state.js";
import { chebyshev, isWalkable, makeUnit, tileAt } from "./units.js";
import { trainableUnitsFor } from "./tech.js";

interface SageEffect {
  state: GameState;
  title: string;
  detail: string;
}

/** Étoiles en jeu (adaptatif) : ≥ minimum, sinon revenu × facteur, plafonné au max. */
function sageStars(state: GameState, pid: number): number {
  const adaptive = Math.max(SAGE_MIN_STARS, getPlayerIncome(state, pid) * SAGE_STAR_FACTOR);
  return Math.min(SAGE_MAX_STARS, adaptive);
}

function addStars(state: GameState, pid: number, delta: number): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === pid ? { ...p, stars: Math.max(0, p.stars + delta) } : p,
    ),
  };
}

/** Case libre où faire apparaître un renfort : la case du sage, sinon une voisine. */
function freeAround(state: GameState, at: Coord): Coord | null {
  if (isWalkable(state, at.x, at.y)) return { x: at.x, y: at.y };
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = at.x + dx;
      const ny = at.y + dy;
      if (isWalkable(state, nx, ny)) return { x: nx, y: ny };
    }
  }
  return null;
}

// --- BONUS -----------------------------------------------------------------

function pactole(state: GameState, pid: number, amount: number): SageEffect {
  return { state: addStars(state, pid, amount), title: "Pactole", detail: `+${amount}⭐ offertes.` };
}

function renfort(state: GameState, pid: number, at: Coord): SageEffect | null {
  const types = trainableUnitsFor(state, pid);
  if (types.length === 0) return null;
  let best: UnitType = types[0]!;
  for (const t of types) if (UNIT_STATS[t].cost > UNIT_STATS[best].cost) best = t;

  const spot = freeAround(state, at);
  if (!spot) return null;

  const id = `u${state.nextUnitId}`;
  const unit = makeUnit(id, best, pid, spot.x, spot.y, true); // inactive ce tour
  const tiles = state.tiles.slice();
  const tile = tileAt(state, spot.x, spot.y)!;
  tiles[tileIndex(state.width, spot.x, spot.y)] = { ...tile, unitId: id };

  return {
    state: { ...state, units: [...state.units, unit], tiles, nextUnitId: state.nextUnitId + 1 },
    title: "Renfort d'élite",
    detail: `Un ${UNIT_NAMES[best]} rejoint ton armée.`,
  };
}

function illumination(state: GameState, pid: number): SageEffect | null {
  const owned = new Set(state.players[pid]?.unlockedTechs ?? []);
  const candidates = Object.values(TECHS).filter(
    (t) => !owned.has(t.id) && (t.requires === null || owned.has(t.requires)),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
  const tech = candidates[0]!;
  return {
    state: {
      ...state,
      players: state.players.map((p) =>
        p.id === pid ? { ...p, unlockedTechs: [...p.unlockedTechs, tech.id] } : p,
      ),
    },
    title: "Illumination",
    detail: `Technologie « ${tech.name} » offerte.`,
  };
}

function fortification(state: GameState, pid: number, at: Coord): SageEffect | null {
  const mine = state.cities.filter((c) => c.ownerId === pid && !c.hasWall);
  if (mine.length === 0) return null;
  let best = mine[0]!;
  for (const c of mine) if (chebyshev(at, c) < chebyshev(at, best)) best = c;
  return {
    state: {
      ...state,
      cities: state.cities.map((c) =>
        c.id === best.id ? { ...c, hasWall: true, wallHp: WALL_MAX_HP } : c,
      ),
    },
    title: "Fortification",
    detail: `Un rempart s'élève sur ta ville la plus proche.`,
  };
}

/** Applique un bonus (choix tiré, repli sur Pactole si l'effet est impossible). */
function applyBonus(
  state: GameState,
  pid: number,
  pick: number,
  amount: number,
  at: Coord,
): SageEffect {
  for (const k of [pick, 0, 1, 2, 3]) {
    const e =
      k === 1
        ? renfort(state, pid, at)
        : k === 2
          ? illumination(state, pid)
          : k === 3
            ? fortification(state, pid, at)
            : pactole(state, pid, amount);
    if (e) return e;
  }
  return pactole(state, pid, amount);
}

// --- MALUS ------------------------------------------------------------------

function desertion(state: GameState, pid: number): SageEffect | null {
  const mine = state.units.filter((u) => u.ownerId === pid);
  if (mine.length === 0) return null;
  let best = mine[0]!;
  for (const u of mine) if (UNIT_STATS[u.type].cost > UNIT_STATS[best.type].cost) best = u;

  const units = state.units.filter((u) => u.id !== best.id);
  const tiles = state.tiles.slice();
  const ti = tileIndex(state.width, best.x, best.y);
  const t = tiles[ti];
  if (t && t.unitId === best.id) {
    const { unitId: _removed, ...rest } = t;
    tiles[ti] = rest;
  }
  return {
    state: { ...state, units, tiles },
    title: "Désertion",
    detail: `Ton ${UNIT_NAMES[best.type]} t'abandonne.`,
  };
}

function sabotage(state: GameState, pid: number): SageEffect | null {
  const mine = state.cities.filter((c) => c.ownerId === pid && c.level > 1);
  if (mine.length === 0) return null;
  let best = mine[0]!;
  for (const c of mine) if (c.level > best.level) best = c;
  const level = best.level - 1;
  const updated = {
    ...best,
    level,
    population: 0,
    starsPerTurn: cityStarsPerTurn(level, best.workshops),
  };
  return {
    state: { ...state, cities: state.cities.map((c) => (c.id === best.id ? updated : c)) },
    title: "Sabotage",
    detail: `Une de tes villes retombe au niveau ${level}.`,
  };
}

function disette(state: GameState, pid: number): SageEffect {
  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === pid ? { ...p, skipIncome: true } : p)),
    },
    title: "Disette",
    detail: `Tes villes ne produiront rien au prochain tour.`,
  };
}

function racket(state: GameState, pid: number, amount: number): SageEffect {
  const loss = Math.min(state.players[pid]?.stars ?? 0, amount);
  return { state: addStars(state, pid, -loss), title: "Racket", detail: `−${loss}⭐ extorquées.` };
}

/** Applique un malus (choix tiré, repli sur Racket si l'effet est impossible). */
function applyMalus(state: GameState, pid: number, pick: number, amount: number): SageEffect {
  for (const k of [pick, 3, 2, 1, 0]) {
    const e =
      k === 0
        ? desertion(state, pid)
        : k === 1
          ? sabotage(state, pid)
          : k === 2
            ? disette(state, pid)
            : racket(state, pid, amount);
    if (e) return e;
  }
  return racket(state, pid, amount);
}

export function resolveConsultSage(state: GameState, at: Coord): GameState {
  const pid = state.currentPlayer;

  const idx = tileIndex(state.width, at.x, at.y);
  const here = state.tiles[idx]!;
  const tiles = state.tiles.slice();
  tiles[idx] = { ...here, sageUsedBy: [...(here.sageUsedBy ?? []), pid] };
  let base: GameState = { ...state, tiles };

  const seed = (state.seed ^ (at.x * 73856093) ^ (at.y * 19349663) ^ (state.turn * 83492791) ^ (pid * 2654435761)) >>> 0;
  const rng = createRng(seed);
  
  // Type de quête (0: kill, 1: harvest, 2: tech)
  const questTypeR = rng.int(0, 2);
  const qType = questTypeR === 0 ? "kill" : questTypeR === 1 ? "harvest" : "tech";
  
  const target = qType === "kill" ? 2 : qType === "harvest" ? 3 : 1;
  const turnsLeft = qType === "kill" ? 3 : qType === "harvest" ? 4 : 5;
  
  const rewardTypeR = rng.int(0, 2);
  const reward = rewardTypeR === 0 ? "tech" : rewardTypeR === 1 ? "hero" : "stars";

  const quest = {
    type: qType,
    target,
    progress: 0,
    reward,
    turnsLeft
  };

  const players = base.players.map(p => p.id === pid ? { ...p, activeQuest: quest } : p);
  
  const title = "Nouvelle Quête !";
  const detail = `Le sage t'a donné une mission : ${qType === 'kill' ? 'Éliminer 2 unités' : qType === 'harvest' ? 'Récolter 3 ressources' : 'Rechercher 1 tech'} en ${turnsLeft} tours pour obtenir une récompense (${reward === 'stars' ? 'Pactole' : reward === 'hero' ? 'Héros' : 'Technologie'}).`;
  
  const id = `${at.x},${at.y}@${state.turn}#${pid}`;
  return { ...base, players, lastSage: { id, by: pid, good: true, title, detail } };
}
