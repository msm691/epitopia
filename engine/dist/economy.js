/**
 * Économie : production d'étoiles (cf. §6).
 * Fonctions PURES, sans effet de bord.
 */
import { AUTO_TERRITORY_EXPANSIONS, CITY_HARVEST_RADIUS, WORKSHOP_STARS } from "@polytopia/shared";
import { chebyshev } from "./units.js";
import { areAllies } from "./state.js";
import { hasContinuousRoad } from "./pathfinding.js";
/**
 * Étoiles produites par tour par une ville donnée selon son niveau.
 * Modèle de base figé : starsPerTurn = niveau + 1.
 */
export function computeStarsPerTurn(level) {
    return level + 1;
}
export function getPlayerIncome(state, playerId) {
    let income = 0;
    let hasPyramids = false;
    const player = state.players.find((p) => p.id === playerId);
    const hasMarchands = player?.culturalDoctrines?.includes("marchands");
    for (const city of state.cities) {
        if (city.ownerId === playerId) {
            let cityIncome = city.starsPerTurn;
            if (hasMarchands) {
                cityIncome += city.level; // +1 star per level
            }
            // Bonus Merveille Naturelle (Volcan)
            const isNearVolcano = state.tiles.some(t => t.naturalWonder === "volcan" && chebyshev(t, city) <= 2);
            if (isNearVolcano)
                cityIncome += 5;
            income += cityIncome;
        }
    }
    // Bonus Pyramides (+3 étoiles par tour)
    if (state.builtWonders.some(w => w.type === "pyramids" && w.ownerId === playerId)) {
        income += 3;
    }
    // Trade Routes: +2 stars for each allied player whose city radius overlaps with ours
    const myCities = state.cities.filter(c => c.ownerId === playerId);
    const alliedCities = state.cities.filter(c => c.ownerId !== playerId && areAllies(state, playerId, c.ownerId));
    for (const allyCity of alliedCities) {
        const allyRadius = allyCity.harvestRadius ?? CITY_HARVEST_RADIUS;
        for (const myCity of myCities) {
            const myRadius = myCity.harvestRadius ?? CITY_HARVEST_RADIUS;
            if (chebyshev(myCity, allyCity) <= myRadius + allyRadius) {
                income += 2;
                break; // Only +2 per ally city connected
            }
        }
    }
    // Routes commerciales internes (V5) : +2 étoiles par ville connectée à la capitale par une route.
    if (myCities.length > 1) {
        const capital = myCities[0];
        for (let i = 1; i < myCities.length; i++) {
            if (hasContinuousRoad(state, capital, myCities[i], 50)) { // 50 is a large enough max dist
                income += 2;
            }
        }
    }
    return income;
}
/** Production d'une ville = base (niveau + 1) + bonus des ateliers construits. */
export function cityStarsPerTurn(level, workshops = 0) {
    return computeStarsPerTurn(level) + workshops * WORKSHOP_STARS;
}
/**
 * Ajoute de la population à une ville et applique les montées de niveau.
 * Seuil pour passer du niveau L à L+1 = (L + 1) population ; le surplus est conservé.
 * Chaque niveau gagné ajoute UNE récompense à choisir (rewardsToPick), ET agrandit
 * AUTOMATIQUEMENT le territoire pour les `AUTO_TERRITORY_EXPANSIONS` premières montées
 * (rayon jusqu'à 1 + 2 = 3). Au-delà, l'agrandissement devient une récompense au choix.
 */
export function levelUpCity(city, popGain) {
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
    for (let i = 0; i < gained && harvestRadius < autoCap; i++)
        harvestRadius += 1;
    return {
        ...city,
        population,
        level,
        harvestRadius,
        rewardsToPick: (city.rewardsToPick ?? 0) + gained,
        starsPerTurn: cityStarsPerTurn(level, city.workshops),
    };
}
//# sourceMappingURL=economy.js.map