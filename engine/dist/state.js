/**
 * Création de l'état initial.
 *
 * À l'Étape 1a : carte générée (terrains variés) + joueurs + cases de départ
 * marquées (futures capitales). Pas encore de villes/unités/économie (1b/1c).
 */
import { CAPITAL_START_LEVEL, DEFAULT_CIV_COLORS, DEFAULT_TURN_LIMIT, STARTING_STARS, UNIT_STATS, } from "@polytopia/shared";
import { generateMap, mapSizeForPlayers } from "./generateMap.js";
import { computeStarsPerTurn } from "./economy.js";
/** Index linéaire d'une case (y * width + x). */
export function tileIndex(width, x, y) {
    return y * width + x;
}
function createPlayers(count, infos) {
    const players = [];
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
export function capitalId(playerId) {
    return `cap-${playerId}`;
}
/**
 * Construit un GameState initial déterministe.
 * La même seed (+ mêmes dimensions/joueurs) produit toujours le même état.
 */
export function createInitialState(options) {
    const playerCount = options.playerInfos?.length ?? options.playerCount ?? 2;
    const size = mapSizeForPlayers(playerCount, options.mapType);
    const width = options.width ?? size;
    const height = options.height ?? size;
    const { tiles, starts } = generateMap(options.seed, width, height, playerCount, options.mapType ?? "terres");
    const players = createPlayers(playerCount, options.playerInfos);
    // Add Barbarians virtual player
    players.push({
        id: players.length,
        civName: "Barbares",
        color: "#444444",
        stars: 0,
        unlockedTechs: [],
        isAI: true,
    });
    // Capitale auto-fondée + 1 guerrier en garnison sur la case de départ.
    const cities = [];
    const units = [];
    let nextUnitId = 0;
    const warrior = UNIT_STATS.guerrier;
    starts.forEach((start, playerId) => {
        const tile = tiles[tileIndex(width, start.x, start.y)];
        if (!tile)
            return;
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
        const heroStats = UNIT_STATS.hero;
        units.push({
            id: unitId,
            type: "hero",
            ownerId: playerId,
            x: start.x,
            y: start.y,
            hp: heroStats.hp,
            attack: heroStats.attack,
            defense: heroStats.defense,
            range: heroStats.range,
            movement: heroStats.movement,
            hasMoved: false,
            hasAttacked: false,
            isHero: true,
            xp: 0,
            level: 1,
        });
        players[playerId].heroStatus = "alive";
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
        alliances: [],
        peaceProposals: [],
        builtWonders: [],
        turnLimit: options.turnLimit === undefined ? DEFAULT_TURN_LIMIT : options.turnLimit,
        nextUnitId,
        nextCityId: 0,
        seed: options.seed,
    };
}
export function areAllies(state, p1, p2) {
    if (p1 === p2)
        return true;
    return state.alliances.some(([a, b]) => (a === p1 && b === p2) || (a === p2 && b === p1));
}
//# sourceMappingURL=state.js.map