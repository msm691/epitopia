/**
 * Logique de technologie PURE : coût, possession, déblocages.
 */
import { ALL_UNIT_TYPES, TECHS, TECH_BASE_COST, } from "@polytopia/shared";
/** Coût d'une tech selon son palier et le nombre de villes du joueur. */
export function computeTechCost(tier, numCities) {
    return TECH_BASE_COST * tier + numCities;
}
/** Définition de tech si l'id est valide, sinon undefined. */
export function getTech(techId) {
    return Object.prototype.hasOwnProperty.call(TECHS, techId)
        ? TECHS[techId]
        : undefined;
}
/** Nombre de villes possédées par un joueur. */
export function getPlayerCityCount(state, playerId) {
    return state.cities.filter((c) => c.ownerId === playerId).length;
}
/** Le joueur possède-t-il cette tech ? */
export function playerHasTech(state, playerId, techId) {
    return state.players[playerId]?.unlockedTechs.includes(techId) ?? false;
}
/** Unité recrutable par défaut (sans tech) : seul le Guerrier. */
const BASE_UNITS = ["guerrier"];
/** Le joueur peut-il recruter ce type d'unité (base ou débloqué par tech) ? */
export function playerCanTrain(state, playerId, unitType) {
    if (BASE_UNITS.includes(unitType))
        return true;
    const techs = state.players[playerId]?.unlockedTechs ?? [];
    return techs.some((id) => getTech(id)?.unlocksUnits.includes(unitType) ?? false);
}
/** Liste des types d'unités recrutables par le joueur (base + débloqués). */
export function trainableUnitsFor(state, playerId) {
    return ALL_UNIT_TYPES.filter((t) => playerCanTrain(state, playerId, t));
}
/** Le joueur peut-il récolter cette ressource (selon ses techs) ? */
export function playerCanHarvest(state, playerId, resource) {
    // Fruits & Luxe sont récoltables sans tech (gérés en 2c).
    if (resource === "fruits" || resource === "luxe")
        return true;
    const techs = state.players[playerId]?.unlockedTechs ?? [];
    return techs.some((id) => getTech(id)?.unlocksResources.includes(resource) ?? false);
}
//# sourceMappingURL=tech.js.map