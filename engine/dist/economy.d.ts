/**
 * Économie : production d'étoiles (cf. §6).
 * Fonctions PURES, sans effet de bord.
 */
import type { City, GameState, PlayerId } from "@polytopia/shared";
/**
 * Étoiles produites par tour par une ville donnée selon son niveau.
 * Modèle de base figé : starsPerTurn = niveau + 1.
 */
export declare function computeStarsPerTurn(level: number): number;
/** Revenu total d'un joueur = somme des productions de ses villes. */
export declare function getPlayerIncome(state: GameState, playerId: PlayerId): number;
/** Production d'une ville = base (niveau + 1) + bonus des ateliers construits. */
export declare function cityStarsPerTurn(level: number, workshops?: number): number;
/**
 * Ajoute de la population à une ville et applique les montées de niveau.
 * Seuil pour passer du niveau L à L+1 = (L + 1) population ; le surplus est conservé.
 * Chaque niveau gagné ajoute UNE récompense à choisir (rewardsToPick), ET agrandit
 * AUTOMATIQUEMENT le territoire pour les `AUTO_TERRITORY_EXPANSIONS` premières montées
 * (rayon jusqu'à 1 + 2 = 3). Au-delà, l'agrandissement devient une récompense au choix.
 */
export declare function levelUpCity(city: City, popGain: number): City;
//# sourceMappingURL=economy.d.ts.map