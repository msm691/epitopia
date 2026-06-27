/**
 * Conditions de victoire (cf. §6) — fonctions PURES.
 * Garantit qu'une partie se termine TOUJOURS : domination, ou repli au score
 * une fois le tour limite dépassé (sauf partie illimitée : turnLimit = null).
 */

import type { GameState, PlayerId } from "@polytopia/shared";
import { SCORE_WEIGHTS } from "@polytopia/shared";
import { getPlayerCityCount } from "./tech.js";

export type VictoryReason = "domination" | "score";

export interface VictoryStatus {
  over: boolean;
  reason: VictoryReason | null;
  /** Vainqueur unique, ou null si partie en cours / égalité. */
  winnerId: PlayerId | null;
  /** Tous les vainqueurs (>1 = égalité / match nul). */
  winners: PlayerId[];
}

const ONGOING: VictoryStatus = { over: false, reason: null, winnerId: null, winners: [] };

/** Score pondéré d'un joueur (expansion + économie + armée + science). */
export function computeScore(state: GameState, playerId: PlayerId): number {
  let cities = 0;
  let levels = 0;
  for (const c of state.cities) {
    if (c.ownerId === playerId) {
      cities += 1;
      levels += c.level;
    }
  }
  const units = state.units.filter((u) => u.ownerId === playerId).length;
  const player = state.players[playerId];
  const techs = player?.unlockedTechs.length ?? 0;
  const stars = player?.stars ?? 0;

  return (
    cities * SCORE_WEIGHTS.city +
    levels * SCORE_WEIGHTS.cityLevel +
    units * SCORE_WEIGHTS.unit +
    techs * SCORE_WEIGHTS.tech +
    stars * SCORE_WEIGHTS.star
  );
}

/** Joueurs encore en jeu = possédant au moins une ville. */
function alivePlayers(state: GameState): PlayerId[] {
  return state.players
    .filter((p) => getPlayerCityCount(state, p.id) > 0)
    .map((p) => p.id);
}

/** Évalue l'état de victoire de la partie. */
export function checkVictory(state: GameState): VictoryStatus {
  // Domination : un seul (ou zéro) joueur possède encore des villes.
  const alive = alivePlayers(state);
  if (alive.length <= 1) {
    const winnerId = alive[0] ?? null;
    return { over: true, reason: "domination", winnerId, winners: alive };
  }

  // Repli au score une fois le tour limite dépassé.
  if (state.turnLimit !== null && state.turn > state.turnLimit) {
    let best = -Infinity;
    let winners: PlayerId[] = [];
    for (const p of state.players) {
      const score = computeScore(state, p.id);
      if (score > best) {
        best = score;
        winners = [p.id];
      } else if (score === best) {
        winners.push(p.id);
      }
    }
    return {
      over: true,
      reason: "score",
      winnerId: winners.length === 1 ? winners[0]! : null,
      winners,
    };
  }

  return ONGOING;
}
