/**
 * Génération de carte déterministe (cf. §6 : grille carrée, ressources/joueurs
 * répartis équitablement, le tout seedé).
 *
 * À l'Étape 1a : terrains variés + placement équilibré des départs.
 * Les ressources sur les cases seront ajoutées plus tard (1b/2).
 */
import { VILLAGE_DENSITY, VILLAGE_MIN_SPACING } from "@polytopia/shared";
import { createRng } from "./rng.js";
/** Distance Chebyshev locale (évite un cycle d'import avec units.ts). */
function chebyshevLocal(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
/** Poids des terrains (somme = 1). "ocean" est réservé pour plus tard. */
const TERRAIN_WEIGHTS = [
    ["champ", 0.5],
    ["foret", 0.22],
    ["montagne", 0.16],
    ["eau", 0.12],
];
/** Nombre de candidats évalués pour chaque départ (best-candidate sampling). */
const CANDIDATES_PER_START = 64;
/**
 * Taille de carte conseillée selon le nombre de joueurs : plus de monde = plus
 * grand, mais surtout assez d'espace pour que traverser prenne du temps (anti-rush).
 */
export function mapSizeForPlayers(count) {
    if (count <= 2)
        return 14;
    if (count <= 4)
        return 16;
    if (count <= 6)
        return 18;
    return 20;
}
function rollTerrain(rng) {
    const r = rng.next();
    let acc = 0;
    for (const [terrain, weight] of TERRAIN_WEIGHTS) {
        acc += weight;
        if (r < acc)
            return terrain;
    }
    return "champ";
}
/** Une case est "terre" si on peut y poser une capitale (pas d'eau). */
export function isLandTerrain(terrain) {
    return terrain !== "eau" && terrain !== "ocean";
}
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
/**
 * Choisit `count` cases de départ bien espacées (best-candidate de Mitchell) :
 * le 1er point est aléatoire, chaque point suivant est, parmi N candidats
 * aléatoires, celui le plus éloigné des points déjà placés.
 */
function pickStarts(rng, land, count) {
    if (count <= 0)
        return [];
    if (land.length < count) {
        throw new Error(`generateMap: pas assez de terre (${land.length}) pour ${count} joueurs`);
    }
    const starts = [land[rng.int(0, land.length - 1)]];
    for (let i = 1; i < count; i++) {
        let best = null;
        let bestDist = -1;
        for (let c = 0; c < CANDIDATES_PER_START; c++) {
            const cand = land[rng.int(0, land.length - 1)];
            let minD = Infinity;
            for (const s of starts)
                minD = Math.min(minD, distance(cand, s));
            if (minD > bestDist) {
                bestDist = minD;
                best = cand;
            }
        }
        starts.push(best);
    }
    return starts;
}
/** Probabilité qu'une case d'un terrain donné porte une ressource. */
const RESOURCE_CHANCE = {
    champ: 0.25,
    foret: 0.3,
    montagne: 0.35,
    eau: 0.3,
};
/** Probabilité qu'une case terrestre vide porte du Luxe (rare). */
const LUXE_CHANCE = 0.02;
/** Tire la ressource d'une case selon son terrain (ou undefined). */
function rollResource(rng, terrain) {
    const chance = RESOURCE_CHANCE[terrain] ?? 0;
    if (rng.next() >= chance)
        return undefined;
    switch (terrain) {
        case "champ":
            return rng.next() < 0.5 ? "fruits" : "cereales";
        case "foret":
            return rng.next() < 0.5 ? "gibier" : "bois";
        case "montagne":
            return rng.next() < 0.5 ? "minerai" : "metal";
        case "eau":
            return "poisson";
        default:
            return undefined;
    }
}
/** Ressource de base imposable sur un terrain (pour garantir l'équité). */
function baseResourceFor(terrain) {
    switch (terrain) {
        case "champ":
            return "fruits";
        case "foret":
            return "gibier";
        case "eau":
            return "poisson";
        case "montagne":
            return "minerai";
        default:
            return undefined;
    }
}
/** Garantit au moins `min` ressources dans le rayon 1 d'un départ. */
function ensureStartResources(tiles, width, height, start, startKeys, min) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0)
                continue;
            const nx = start.x + dx;
            const ny = start.y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                continue;
            if (startKeys.has(`${nx},${ny}`))
                continue;
            const t = tiles[ny * width + nx];
            if (t)
                neighbors.push(t);
        }
    }
    let count = neighbors.filter((t) => t.resource !== undefined).length;
    for (const t of neighbors) {
        if (count >= min)
            break;
        if (t.resource !== undefined)
            continue;
        // On privilégie les champs (fruits récoltables sans tech).
        const res = baseResourceFor(t.terrain);
        if (res) {
            t.resource = res;
            count++;
        }
    }
}
/** Construit une carte complète (terrains + ressources + départs) déterministe. */
export function generateMap(seed, width, height, playerCount) {
    const rng = createRng(seed);
    const tiles = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            tiles.push({ x, y, terrain: rollTerrain(rng) });
        }
    }
    const land = tiles
        .filter((t) => isLandTerrain(t.terrain))
        .map((t) => ({ x: t.x, y: t.y }));
    const starts = pickStarts(rng, land, playerCount);
    const startKeys = new Set(starts.map((s) => `${s.x},${s.y}`));
    // La capitale doit reposer sur de la terre "propre" : on force le départ en champ.
    for (const s of starts) {
        const tile = tiles[s.y * width + s.x];
        if (tile)
            tile.terrain = "champ";
    }
    // Ressources par terrain (hors cases de départ).
    for (const tile of tiles) {
        if (startKeys.has(`${tile.x},${tile.y}`))
            continue;
        const res = rollResource(rng, tile.terrain);
        if (res)
            tile.resource = res;
    }
    // Luxe rare sur la terre encore vide.
    for (const tile of tiles) {
        if (startKeys.has(`${tile.x},${tile.y}`))
            continue;
        if (tile.resource !== undefined)
            continue;
        if (isLandTerrain(tile.terrain) && rng.next() < LUXE_CHANCE)
            tile.resource = "luxe";
    }
    // Équité : au moins 2 ressources dans le voisinage de chaque départ.
    for (const s of starts)
        ensureStartResources(tiles, width, height, s, startKeys, 2);
    // Villages neutres à conquérir (moteur d'expansion).
    placeVillages(rng, tiles, width, height, starts);
    return { tiles, starts };
}
/**
 * Sème des villages neutres sur la terre libre (hors départs, sans ressource),
 * espacés des départs et entre eux. Déterministe (échantillonnage seedé).
 * Un village pose une terre "propre" (champ) prête à accueillir une ville.
 */
function placeVillages(rng, tiles, width, height, starts) {
    const startKeys = new Set(starts.map((s) => `${s.x},${s.y}`));
    const land = tiles.filter((t) => isLandTerrain(t.terrain) &&
        t.resource === undefined &&
        !startKeys.has(`${t.x},${t.y}`));
    if (land.length === 0)
        return;
    const target = Math.max(0, Math.round(width * height * VILLAGE_DENSITY));
    const placed = [];
    const farEnough = (c) => {
        for (const s of starts)
            if (chebyshevLocal(c, s) < VILLAGE_MIN_SPACING)
                return false;
        for (const p of placed)
            if (chebyshevLocal(c, p) < VILLAGE_MIN_SPACING)
                return false;
        return true;
    };
    const maxAttempts = target * 40;
    for (let i = 0; i < maxAttempts && placed.length < target; i++) {
        const cand = land[rng.int(0, land.length - 1)];
        const c = { x: cand.x, y: cand.y };
        if (cand.village || !farEnough(c))
            continue;
        cand.terrain = "champ";
        cand.village = true;
        placed.push(c);
    }
}
//# sourceMappingURL=generateMap.js.map