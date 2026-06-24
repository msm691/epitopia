/**
 * applyAction : SEULE fonction autorisée à produire un nouvel état.
 * Immutable : ne mute jamais l'état reçu, renvoie un nouvel objet.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 */
import { CITY_HARVEST_RADIUS, FOUNDED_CITY_LEVEL, improvementCost, REWARD_TROOP_UNIT, RESOURCE_HARVEST_COST, RESOURCE_POP_GAIN, TREASURE_STARS, UNIT_STATS, unitBuildTurns, WALL_MAX_HP, } from "@polytopia/shared";
import { isLegal } from "./isLegal.js";
import { cityStarsPerTurn, computeStarsPerTurn, getPlayerIncome, levelUpCity } from "./economy.js";
import { freeSpawnTileFor, makeUnit, tileAt, chebyshev } from "./units.js";
import { computeCombat, computeWallDamage, getDefenseBonus } from "./combat.js";
import { computeTechCost, getPlayerCityCount, getTech } from "./tech.js";
import { resolveConsultSage } from "./sages.js";
import { tileIndex } from "./state.js";
/** Erreur levée quand on tente d'appliquer une action illégale. */
export class IllegalActionError extends Error {
    action;
    constructor(action) {
        super(`Action illégale: ${action.type}`);
        this.action = action;
        this.name = "IllegalActionError";
    }
}
export function applyAction(state, action) {
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
    }
}
/** Consulter un sage : délègue au module pur (RNG seedé, effet adaptatif). */
function consultSage(state, action) {
    return resolveConsultSage(state, action.at);
}
/** Bâtir une amélioration en dépensant des étoiles (tech Construction). */
function buildImprovement(state, action) {
    const city = state.cities.find((c) => c.id === action.cityId);
    const cost = improvementCost(action.improvement, city.builtWorkshops ?? 0);
    const players = state.players.map((p) => p.id === city.ownerId ? { ...p, stars: p.stars - cost } : p);
    let updated = city;
    if (action.improvement === "atelier") {
        const workshops = (city.workshops ?? 0) + 1;
        const builtWorkshops = (city.builtWorkshops ?? 0) + 1; // compteur de coût (hors récompenses)
        updated = { ...city, workshops, builtWorkshops, starsPerTurn: cityStarsPerTurn(city.level, workshops) };
    }
    else {
        updated = { ...city, hasWall: true, wallHp: WALL_MAX_HP };
    }
    const cities = state.cities.map((c) => (c.id === city.id ? updated : c));
    return { ...state, players, cities };
}
/** Attaquer un rempart : réduit ses PV ; à 0 il tombe (la ville devient prenable). */
function attackWall(state, action) {
    const attacker = state.units.find((u) => u.id === action.attackerId);
    const city = state.cities.find((c) => c.id === action.cityId);
    const wallHp = (city.wallHp ?? 0) - computeWallDamage(attacker);
    const updated = wallHp <= 0 ? { ...city, hasWall: false, wallHp: 0 } : { ...city, wallHp };
    const cities = state.cities.map((c) => (c.id === city.id ? updated : c));
    // L'attaquant a agi : il ne peut plus bouger ni attaquer ce tour.
    const units = state.units.map((u) => u.id === attacker.id ? { ...u, hasAttacked: true, hasMoved: true } : u);
    return { ...state, cities, units };
}
/**
 * Applique une récompense de montée de niveau choisie pour une ville, et décrémente
 * son compteur de récompenses en attente.
 * - atelier : +1 atelier (= +1★/tour permanent) ; tresor : +5★ immédiats au joueur ;
 * - troupe : un guerrier gratuit (sur la ville ou une case voisine libre) ;
 * - muraille : pose une muraille (renforce la défense de la ville).
 */
function claimCityReward(state, action) {
    const city = state.cities.find((c) => c.id === action.cityId);
    let updated = { ...city, rewardsToPick: (city.rewardsToPick ?? 0) - 1 };
    let players = state.players;
    let units = state.units;
    let tiles = state.tiles;
    let nextUnitId = state.nextUnitId;
    switch (action.reward) {
        case "tresor":
            players = players.map((p) => p.id === city.ownerId ? { ...p, stars: p.stars + TREASURE_STARS } : p);
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
            const spot = freeSpawnTileFor(state, city); // garanti par isLegal
            const id = `u${nextUnitId++}`;
            units = [...units, makeUnit(id, REWARD_TROOP_UNIT, city.ownerId, spot.x, spot.y, true)];
            const tile = tileAt(state, spot.x, spot.y);
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
function foundCity(state, action) {
    const unit = state.units.find((u) => u.id === action.unitId);
    const id = `city-${state.nextCityId}`;
    const level = FOUNDED_CITY_LEVEL;
    const city = {
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
    const here = tiles[tileIndex(state.width, unit.x, unit.y)];
    const { village: _v, ...rest } = here;
    tiles[tileIndex(state.width, unit.x, unit.y)] = {
        ...rest,
        cityId: id,
        ownerId: unit.ownerId,
    };
    // Territoire : revendique les cases voisines encore neutres (rayon 1).
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0)
                continue;
            const nx = unit.x + dx;
            const ny = unit.y + dy;
            if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height)
                continue;
            const idx = tileIndex(state.width, nx, ny);
            const t = tiles[idx];
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
function harvestResource(state, action) {
    const city = state.cities.find((c) => c.id === action.cityId);
    const tile = tileAt(state, action.at.x, action.at.y);
    const resource = tile.resource;
    const cost = RESOURCE_HARVEST_COST[resource];
    const popGain = RESOURCE_POP_GAIN[resource];
    // Déduit le coût au propriétaire de la ville.
    const players = state.players.map((p) => p.id === city.ownerId ? { ...p, stars: p.stars - cost } : p);
    // Population + montée de niveau.
    const cities = state.cities.map((c) => (c.id === city.id ? levelUpCity(c, popGain) : c));
    // Ressource consommée (retirée de la case).
    const { resource: _consumed, ...clearedTile } = tile;
    const tiles = withTile(state.tiles, state.width, clearedTile);
    return { ...state, players, cities, tiles };
}
function researchTech(state, action) {
    const tech = getTech(action.techId);
    const playerId = state.currentPlayer;
    const cost = computeTechCost(tech.tier, getPlayerCityCount(state, playerId));
    const players = state.players.map((p) => p.id === playerId
        ? { ...p, stars: p.stars - cost, unlockedTechs: [...p.unlockedTechs, tech.id] }
        : p);
    return { ...state, players };
}
/** Retire une unité du plateau (liste + case occupée). */
function removeUnit(units, tiles, width, dead) {
    const remaining = units.filter((u) => u.id !== dead.id);
    const tile = tiles[tileIndex(width, dead.x, dead.y)];
    let nextTiles = tiles;
    if (tile && tile.unitId === dead.id) {
        const { unitId: _removed, ...cleared } = tile;
        nextTiles = withTile(tiles, width, cleared);
    }
    return { units: remaining, tiles: nextTiles };
}
function attack(state, action) {
    const attacker = state.units.find((u) => u.id === action.attackerId);
    const defender = state.units.find((u) => u.id === action.targetId);
    const isMelee = chebyshev(attacker, defender) === 1;
    const result = computeCombat(attacker, defender, isMelee, getDefenseBonus(state, defender));
    // L'attaquant a agi : il ne peut plus bouger ni attaquer ce tour.
    let attackerNow = { ...attacker, hasAttacked: true, hasMoved: true };
    let units = state.units.map((u) => (u.id === attacker.id ? attackerNow : u));
    let tiles = state.tiles;
    if (result.defenderDies) {
        ({ units, tiles } = removeUnit(units, tiles, state.width, defender));
        return { ...state, units, tiles };
    }
    // Défenseur survit -> on lui applique les dégâts.
    const defenderNow = { ...defender, hp: defender.hp - result.defenderDamage };
    units = units.map((u) => (u.id === defender.id ? defenderNow : u));
    // Riposte éventuelle sur l'attaquant.
    if (result.attackerDamage > 0) {
        if (result.attackerDies) {
            ({ units, tiles } = removeUnit(units, tiles, state.width, attackerNow));
        }
        else {
            attackerNow = { ...attackerNow, hp: attackerNow.hp - result.attackerDamage };
            units = units.map((u) => (u.id === attacker.id ? attackerNow : u));
        }
    }
    return { ...state, units, tiles };
}
function captureCity(state, action) {
    const unit = state.units.find((u) => u.id === action.unitId);
    const tile = tileAt(state, unit.x, unit.y);
    const cities = state.cities.map((c) => c.id === tile.cityId ? { ...c, ownerId: unit.ownerId } : c);
    const tiles = withTile(state.tiles, state.width, { ...tile, ownerId: unit.ownerId });
    return { ...state, cities, tiles };
}
/** Remplace une tuile dans le tableau (copie immutable). */
function withTile(tiles, width, tile) {
    const copy = tiles.slice();
    copy[tileIndex(width, tile.x, tile.y)] = tile;
    return copy;
}
function trainUnit(state, action) {
    const city = state.cities.find((c) => c.id === action.cityId);
    const cost = UNIT_STATS[action.unitType].cost;
    // Le coût est payé tout de suite dans tous les cas.
    const players = state.players.map((p) => p.id === city.ownerId ? { ...p, stars: p.stars - cost } : p);
    // Grosses unités : mises en PRODUCTION (la ville reste occupée, l'unité
    // apparaîtra au début d'un futur tour du propriétaire).
    const buildTurns = unitBuildTurns(action.unitType);
    if (buildTurns > 0) {
        const cities = state.cities.map((c) => c.id === city.id
            ? { ...c, production: { unitType: action.unitType, turnsLeft: buildTurns } }
            : c);
        return { ...state, players, cities };
    }
    // Unité immédiate : créée inactive (ne joue pas le tour de son recrutement).
    const id = `u${state.nextUnitId}`;
    const unit = makeUnit(id, action.unitType, city.ownerId, city.x, city.y, true);
    const tile = tileAt(state, city.x, city.y);
    const tiles = withTile(state.tiles, state.width, { ...tile, unitId: id });
    return {
        ...state,
        players,
        units: [...state.units, unit],
        tiles,
        nextUnitId: state.nextUnitId + 1,
    };
}
function moveUnit(state, action) {
    const unit = state.units.find((u) => u.id === action.unitId);
    const { to } = action;
    const moved = { ...unit, x: to.x, y: to.y, hasMoved: true };
    const units = state.units.map((u) => (u.id === unit.id ? moved : u));
    // Libère l'ancienne case (on retire unitId), occupe la nouvelle.
    const oldTile = tileAt(state, unit.x, unit.y);
    const newTile = tileAt(state, to.x, to.y);
    const { unitId: _removed, ...clearedOld } = oldTile;
    let tiles = withTile(state.tiles, state.width, clearedOld);
    tiles = withTile(tiles, state.width, { ...newTile, unitId: unit.id });
    return { ...state, units, tiles };
}
/** Un joueur est encore en jeu tant qu'il possède au moins une ville. */
function isAlive(state, pid) {
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
function endTurn(state) {
    const n = state.players.length;
    let nextPlayer = state.currentPlayer;
    let turn = state.turn;
    for (let i = 0; i < n; i++) {
        nextPlayer = (nextPlayer + 1) % n;
        if (nextPlayer === 0)
            turn += 1; // on a bouclé : nouvelle manche
        if (isAlive(state, nextPlayer))
            break; // sinon on saute cet éliminé
    }
    // Malus « Disette » : le joueur qui commence saute son revenu (puis le flag se consomme).
    const skip = state.players[nextPlayer]?.skipIncome === true;
    const income = skip ? 0 : getPlayerIncome(state, nextPlayer);
    const players = state.players.map((p) => {
        if (p.id !== nextPlayer)
            return p;
        const next = { ...p, stars: p.stars + income };
        if (skip)
            next.skipIncome = false; // consommé
        return next;
    });
    let units = state.units.map((u) => u.ownerId === nextPlayer ? { ...u, hasMoved: false, hasAttacked: false } : u);
    // Production des grosses unités : on décrémente le compteur des villes du joueur
    // qui COMMENCE son tour ; à 0, l'unité apparaît (prête à agir) sur la ville ou
    // une case voisine libre. Si aucune place, la production reste prête et réessaie.
    let tiles = state.tiles;
    let nextUnitId = state.nextUnitId;
    const cities = state.cities.map((c) => {
        if (c.ownerId !== nextPlayer || !c.production)
            return c;
        const turnsLeft = c.production.turnsLeft - 1;
        if (turnsLeft > 0)
            return { ...c, production: { ...c.production, turnsLeft } };
        const spot = freeSpawnTileFor({ ...state, tiles, units }, c);
        if (!spot)
            return { ...c, production: { ...c.production, turnsLeft: 0 } };
        const id = `u${nextUnitId++}`;
        units = [...units, makeUnit(id, c.production.unitType, nextPlayer, spot.x, spot.y, false)];
        const tile = tileAt({ ...state, tiles }, spot.x, spot.y);
        tiles = withTile(tiles, state.width, { ...tile, unitId: id });
        const { production: _done, ...rest } = c;
        return rest;
    });
    return { ...state, players, units, cities, tiles, currentPlayer: nextPlayer, turn, nextUnitId };
}
//# sourceMappingURL=applyAction.js.map