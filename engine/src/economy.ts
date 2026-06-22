/**
 * Économie : production d'étoiles (cf. §6).
 * Fonctions PURES, sans effet de bord.
 */

import type { City, GameState, PlayerId } from "@polytopia/shared";
import { AUTO_TERRITORY_EXPANSIONS, CITY_HARVEST_RADIUS, WORKSHOP_STARS } from "@polytopia/shared";

/**
 * Étoiles produites par tour par une ville donnée selon son niveau.
 * Modèle de base figé : starsPerTurn = niveau + 1.
 */
export function computeStarsPerTurn(level: number): number {
  return level + 1;
}

/** Revenu total d'un joueur = somme des productions de ses villes. */
export function getPlayerIncome(state: GameState, playerId: PlayerId): number {
  let income = 0;
  for (const city of state.cities) {
    if (city.ownerId === playerId) income += city.starsPerTurn;
  }
  return income;
}

/** Production d'une ville = base (niveau + 1) + bonus des ateliers construits. */
export function cityStarsPerTurn(level: number, workshops = 0): number {
  return computeStarsPerTurn(level) + workshops * WORKSHOP_STARS;
}

/**
 * Ajoute de la population à une ville et applique les montées de niveau.
 * Seuil pour passer du niveau L à L+1 = (L + 1) population ; le surplus est conservé.
 * Chaque niveau gagné ajoute UNE récompense à choisir (rewardsToPick), ET agrandit
 * AUTOMATIQUEMENT le territoire pour les `AUTO_TERRITORY_EXPANSIONS` premières montées
 * (rayon jusqu'à 1 + 2 = 3). Au-delà, l'agrandissement devient une récompense au choix.
 */
export function levelUpCity(city: City, popGain: number): City {
  let population = city.population + popGain;
  let level = city.level;
  let gained = 0;
  while (population >= level + 1) {
    population -= level + 1;
    level += 1;
    gained += 1;
  }

  const autoCap = CITY_HARVEST_RADIUS + AUTO_TERRITORY_EXPANSIONS;
  let harvestRadius = city.harvestRadius ?? CITY_HARVEST_RADIUS;
  for (let i = 0; i < gained && harvestRadius < autoCap; i++) harvestRadius += 1;

  return {
    ...city,
    population,
    level,
    harvestRadius,
    rewardsToPick: (city.rewardsToPick ?? 0) + gained,
    starsPerTurn: cityStarsPerTurn(level, city.workshops),
  };
}
