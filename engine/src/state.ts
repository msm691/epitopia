/**
 * Création de l'état initial.
 *
 * À l'Étape 1a : carte générée (terrains variés) + joueurs + cases de départ
 * marquées (futures capitales). Pas encore de villes/unités/économie (1b/1c).
 */

import type { City, GameState, MapType, Player, Tile, Unit } from "@polytopia/shared";
import {
  CAPITAL_START_LEVEL,
  DEFAULT_CIV_COLORS,
  DEFAULT_TURN_LIMIT,
  STARTING_STARS,
  UNIT_STATS,
} from "@polytopia/shared";
import { generateMap, mapSizeForPlayers } from "./generateMap.js";
import { computeStarsPerTurn } from "./economy.js";

export interface CreateStateOptions {
  seed: number;
  width?: number;
  height?: number;
  /** Nombre de joueurs à placer (défaut 2). Ignoré si `playerInfos` est fourni. */
  playerCount?: number;
  /** Infos joueurs (nom/couleur/IA), p.ex. issues du lobby réseau. */
  playerInfos?: readonly PlayerInfo[];
  /** Tour limite (défaut 30) ; null pour une partie illimitée. */
  turnLimit?: number | null;
  /** Type de carte (proportion terre/eau ; défaut "terres"). */
  mapType?: MapType;
}

export interface PlayerInfo {
  name: string;
  color: string;
  isAI: boolean;
}

/** Index linéaire d'une case (y * width + x). */
export function tileIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function createPlayers(count: number, infos?: readonly PlayerInfo[]): Player[] {
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const info = infos?.[i];
    players.push({
      id: i,
      civName: info?.name ?? `Civ ${i + 1}`,
      color: info?.color ?? DEFAULT_CIV_COLORS[i] ?? "#ffffff",
      stars: STARTING_STARS,
      unlockedTechs: [],
      isAI: info?.isAI ?? false,
    });
  }
  return players;
}

/** Identifiant déterministe de la capitale d'un joueur. */
export function capitalId(playerId: number): string {
  return `cap-${playerId}`;
}

/**
 * Construit un GameState initial déterministe.
 * La même seed (+ mêmes dimensions/joueurs) produit toujours le même état.
 */
export function createInitialState(options: CreateStateOptions): GameState {
  const playerCount = options.playerInfos?.length ?? options.playerCount ?? 2;
  const size = mapSizeForPlayers(playerCount, options.mapType);
  const width = options.width ?? size;
  const height = options.height ?? size;

  const { tiles, starts } = generateMap(
    options.seed,
    width,
    height,
    playerCount,
    options.mapType ?? "terres",
  );
  const players = createPlayers(playerCount, options.playerInfos);

  // Capitale auto-fondée + 1 guerrier en garnison sur la case de départ.
  const cities: City[] = [];
  const units: Unit[] = [];
  let nextUnitId = 0;
  const warrior = UNIT_STATS.guerrier;
  starts.forEach((start, playerId) => {
    const tile: Tile | undefined = tiles[tileIndex(width, start.x, start.y)];
    if (!tile) return;
    const id = capitalId(playerId);
    tile.ownerId = playerId;
    tile.cityId = id;
    cities.push({
      id,
      ownerId: playerId,
      x: start.x,
      y: start.y,
      level: CAPITAL_START_LEVEL,
      population: 0,
      starsPerTurn: computeStarsPerTurn(CAPITAL_START_LEVEL),
    });

    // Garnison de départ : 1 guerrier actif sur la capitale (la défend, et
    // l'envoyer ailleurs expose sa ville). Anti-rush.
    const unitId = `u${nextUnitId++}`;
    tile.unitId = unitId;
    units.push({
      id: unitId,
      type: "guerrier",
      ownerId: playerId,
      x: start.x,
      y: start.y,
      hp: warrior.hp,
      attack: warrior.attack,
      defense: warrior.defense,
      range: warrior.range,
      movement: warrior.movement,
      hasMoved: false,
      hasAttacked: false,
    });
  });

  return {
    width,
    height,
    tiles,
    players,
    units,
    cities,
    currentPlayer: 0,
    turn: 1,
    turnLimit: options.turnLimit === undefined ? DEFAULT_TURN_LIMIT : options.turnLimit,
    nextUnitId,
    nextCityId: 0,
    seed: options.seed,
  };
}
