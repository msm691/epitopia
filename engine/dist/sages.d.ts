/**
 * Sages mystérieux (Stan & Nico) — PURS et DÉTERMINISTES.
 * Consulter un sage = un dilemme : 50 % bonus / 50 % malus, tiré au RNG SEEDÉ
 * (rejouable, réseau-safe). Les effets sont ADAPTATIFS au revenu/tour du joueur,
 * pour rester marquants même en fin de partie. Le sage disparaît après usage.
 */
import type { Coord, GameState } from "@polytopia/shared";
/**
 * Résout la consultation d'un sage sur la case `at` par le joueur courant :
 * retire le sage, tire 50/50 bonus/malus au RNG seedé, applique l'effet et
 * enregistre le résultat dans `state.lastSage` (pour l'affichage client).
 */
export declare function resolveConsultSage(state: GameState, at: Coord): GameState;
//# sourceMappingURL=sages.d.ts.map