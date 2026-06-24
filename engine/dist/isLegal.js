/**
 * Validation des actions. AUCUNE action n'est appliquée sans passer isLegal.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 * Les autres (combat, ville, tech, récolte) arrivent aux étapes suivantes.
 */
import { ALL_CITY_REWARDS, ALL_IMPROVEMENTS, AUTO_TERRITORY_EXPANSIONS, CITY_HARVEST_RADIUS, improvementCost, MAX_HARVEST_RADIUS, MAX_WORKSHOPS, NAVAL_MOVEMENT, RESOURCE_HARVEST_COST, UNIT_STATS, unitBuildTurns, } from "@polytopia/shared";
import { canEnterTile, chebyshev, freeSpawnTileFor, isWaterAt, tileAt, unitById } from "./units.js";
import { computeTechCost, getPlayerCityCount, getTech, playerCanHarvest, playerCanTrain, playerHasTech, } from "./tech.js";
export function isLegal(state, action) {
    switch (action.type) {
        case "END_TURN":
            return state.players.length > 0;
        case "TRAIN_UNIT":
            return isLegalTrain(state, action);
        case "MOVE_UNIT":
            return isLegalMove(state, action);
        case "ATTACK":
            return isLegalAttack(state, action);
        case "CAPTURE_CITY":
            return isLegalCapture(state, action);
        case "RESEARCH_TECH":
            return isLegalResearch(state, action);
        case "HARVEST_RESOURCE":
            return isLegalHarvest(state, action);
        case "FOUND_CITY":
            return isLegalFound(state, action);
        case "CLAIM_CITY_REWARD":
            return isLegalClaimReward(state, action);
        case "BUILD_IMPROVEMENT":
            return isLegalBuildImprovement(state, action);
        case "ATTACK_WALL":
            return isLegalAttackWall(state, action);
        case "CONSULT_SAGE":
            return isLegalConsultSage(state, action);
    }
}
/** Consulter un sage : la case porte un sage, et une unité du joueur courant est adjacente. */
function isLegalConsultSage(state, action) {
    const tile = tileAt(state, action.at.x, action.at.y);
    if (!tile || !tile.sage)
        return false;
    // Chaque joueur ne peut accepter le marché qu'une seule fois par sage.
    if ((tile.sageUsedBy ?? []).includes(state.currentPlayer))
        return false;
    return state.units.some((u) => u.ownerId === state.currentPlayer && chebyshev(u, action.at) <= 1);
}
/** Bâtir une amélioration (tech Construction) : ville du joueur, étoiles, plafonds. */
function isLegalBuildImprovement(state, action) {
    if (!ALL_IMPROVEMENTS.includes(action.improvement))
        return false;
    const city = state.cities.find((c) => c.id === action.cityId);
    if (!city)
        return false;
    if (city.ownerId !== state.currentPlayer)
        return false;
    if (!playerHasTech(state, state.currentPlayer, "construction"))
        return false;
    const player = state.players[state.currentPlayer];
    if (!player)
        return false;
    if (player.stars < improvementCost(action.improvement, city.builtWorkshops ?? 0))
        return false;
    // Plafonds : un seul rempart, et un nombre limité d'ateliers.
    if (action.improvement === "muraille" && city.hasWall)
        return false;
    if (action.improvement === "atelier" && (city.workshops ?? 0) >= MAX_WORKSHOPS)
        return false;
    return true;
}
/** Attaquer le rempart d'une ville ennemie : unité du joueur, à portée, rempart debout. */
function isLegalAttackWall(state, action) {
    const attacker = unitById(state, action.attackerId);
    if (!attacker)
        return false;
    if (attacker.ownerId !== state.currentPlayer)
        return false;
    if (attacker.hasAttacked)
        return false;
    const city = state.cities.find((c) => c.id === action.cityId);
    if (!city)
        return false;
    if (city.ownerId === attacker.ownerId)
        return false; // doit être ennemie
    if ((city.wallHp ?? 0) <= 0)
        return false; // pas de rempart à abattre
    // À portée d'attaque (Chebyshev jusqu'à la case-ville).
    if (chebyshev({ x: attacker.x, y: attacker.y }, { x: city.x, y: city.y }) > attacker.range) {
        return false;
    }
    return true;
}
/** Encaisser une récompense de niveau : ville du joueur courant avec un choix en attente. */
function isLegalClaimReward(state, action) {
    if (!ALL_CITY_REWARDS.includes(action.reward))
        return false;
    const city = state.cities.find((c) => c.id === action.cityId);
    if (!city)
        return false;
    if (city.ownerId !== state.currentPlayer)
        return false;
    if ((city.rewardsToPick ?? 0) <= 0)
        return false;
    // La "troupe" exige une case libre pour faire apparaître l'unité.
    if (action.reward === "troupe" && freeSpawnTileFor(state, city) === null)
        return false;
    // "Agrandir" n'est proposé qu'APRÈS les agrandissements automatiques, et plafonné.
    if (action.reward === "agrandir") {
        const radius = city.harvestRadius ?? CITY_HARVEST_RADIUS;
        if (radius < CITY_HARVEST_RADIUS + AUTO_TERRITORY_EXPANSIONS)
            return false; // encore en phase auto
        if (radius >= MAX_HARVEST_RADIUS)
            return false; // plafond atteint
    }
    return true;
}
/** Fonder une ville : une unité du joueur courant se tient sur un village libre. */
function isLegalFound(state, action) {
    const unit = unitById(state, action.unitId);
    if (!unit)
        return false;
    if (unit.ownerId !== state.currentPlayer)
        return false;
    const tile = tileAt(state, unit.x, unit.y);
    if (!tile || !tile.village)
        return false;
    // Le village ne doit pas déjà porter une ville.
    return tile.cityId === undefined;
}
function isLegalHarvest(state, action) {
    const city = state.cities.find((c) => c.id === action.cityId);
    if (!city)
        return false;
    if (city.ownerId !== state.currentPlayer)
        return false;
    // La case visée est dans le rayon d'exploitation de la ville et porte une ressource.
    const radius = city.harvestRadius ?? CITY_HARVEST_RADIUS;
    if (chebyshev({ x: city.x, y: city.y }, action.at) > radius)
        return false;
    const tile = tileAt(state, action.at.x, action.at.y);
    if (!tile || tile.resource === undefined)
        return false;
    // Tech requise pour cette ressource.
    if (!playerCanHarvest(state, state.currentPlayer, tile.resource))
        return false;
    // Assez d'étoiles.
    const player = state.players[state.currentPlayer];
    if (!player)
        return false;
    if (player.stars < RESOURCE_HARVEST_COST[tile.resource])
        return false;
    return true;
}
function isLegalResearch(state, action) {
    const tech = getTech(action.techId);
    if (!tech)
        return false;
    const playerId = state.currentPlayer;
    const player = state.players[playerId];
    if (!player)
        return false;
    // Pas déjà connue.
    if (player.unlockedTechs.includes(tech.id))
        return false;
    // Prérequis satisfait.
    if (tech.requires && !playerHasTech(state, playerId, tech.requires))
        return false;
    // Assez d'étoiles (coût fonction du palier + nb de villes).
    const cost = computeTechCost(tech.tier, getPlayerCityCount(state, playerId));
    if (player.stars < cost)
        return false;
    return true;
}
function isLegalAttack(state, action) {
    const attacker = unitById(state, action.attackerId);
    const target = unitById(state, action.targetId);
    if (!attacker || !target)
        return false;
    // L'attaquant appartient au joueur courant et n'a pas encore attaqué.
    if (attacker.ownerId !== state.currentPlayer)
        return false;
    if (attacker.hasAttacked)
        return false;
    // La cible doit être ennemie.
    if (target.ownerId === attacker.ownerId)
        return false;
    // À portée d'attaque (Chebyshev).
    if (chebyshev(attacker, target) > attacker.range)
        return false;
    return true;
}
function isLegalCapture(state, action) {
    const unit = unitById(state, action.unitId);
    if (!unit)
        return false;
    if (unit.ownerId !== state.currentPlayer)
        return false;
    // L'unité doit se tenir sur la case d'une ville ennemie.
    const tile = tileAt(state, unit.x, unit.y);
    if (!tile || tile.cityId === undefined)
        return false;
    const city = state.cities.find((c) => c.id === tile.cityId);
    if (!city)
        return false;
    if (city.ownerId === unit.ownerId)
        return false;
    // Un rempart intact doit d'abord être détruit (sécurité ; le mouvement l'empêche déjà).
    if ((city.wallHp ?? 0) > 0)
        return false;
    return true;
}
function isLegalTrain(state, action) {
    // Unité débloquée (base ou via tech) pour le joueur courant ?
    if (!playerCanTrain(state, state.currentPlayer, action.unitType))
        return false;
    const city = state.cities.find((c) => c.id === action.cityId);
    if (!city)
        return false;
    // Ce doit être le tour du propriétaire de la ville.
    if (city.ownerId !== state.currentPlayer)
        return false;
    // Une ville déjà en production est occupée (une unité à la fois).
    if (city.production)
        return false;
    // Assez d'étoiles ?
    const player = state.players[state.currentPlayer];
    if (!player)
        return false;
    if (player.stars < UNIT_STATS[action.unitType].cost)
        return false;
    // Unité immédiate : la case de la ville doit être libre (pas d'empilement).
    // Unité à production : l'apparition est différée (case trouvée à la sortie),
    // on autorise donc à la lancer même avec la garnison encore en place.
    if (unitBuildTurns(action.unitType) === 0) {
        const tile = tileAt(state, city.x, city.y);
        if (!tile || tile.unitId !== undefined)
            return false;
    }
    return true;
}
function isLegalMove(state, action) {
    const unit = unitById(state, action.unitId);
    if (!unit)
        return false;
    // Appartient au joueur courant et n'a pas déjà bougé.
    if (unit.ownerId !== state.currentPlayer)
        return false;
    if (unit.hasMoved)
        return false;
    const from = { x: unit.x, y: unit.y };
    const to = action.to;
    // Destination valide, distincte.
    if (from.x === to.x && from.y === to.y)
        return false;
    // Embarquement : l'eau n'est franchissable que si le joueur a Navigation. La
    // vitesse navale (plus rapide) ne s'applique QUE si l'unité est DÉJÀ sur l'eau ;
    // embarquer depuis la terre coûte un déplacement terrestre normal (1 case).
    const canNavigate = playerHasTech(state, unit.ownerId, "navigation");
    const naval = isWaterAt(state, from.x, from.y);
    const reach = naval ? Math.max(unit.movement, NAVAL_MOVEMENT) : unit.movement;
    if (chebyshev(from, to) > reach)
        return false;
    // Case d'arrivée franchissable (terre, ou eau si Navigation ; et libre).
    if (!canEnterTile(state, to.x, to.y, canNavigate))
        return false;
    const destTile = tileAt(state, to.x, to.y);
    // Les montagnes ne se gravissent qu'avec la tech Escalade.
    if (destTile?.terrain === "montagne" && !playerHasTech(state, unit.ownerId, "escalade")) {
        return false;
    }
    // On ne peut pas entrer dans une ville ennemie tant que son rempart tient.
    if (destTile?.cityId !== undefined) {
        const city = state.cities.find((c) => c.id === destTile.cityId);
        if (city && city.ownerId !== unit.ownerId && (city.wallHp ?? 0) > 0)
            return false;
    }
    return true;
}
//# sourceMappingURL=isLegal.js.map