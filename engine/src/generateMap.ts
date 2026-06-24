/**
 * Génération de carte déterministe (cf. §6 : grille carrée, ressources/joueurs
 * répartis équitablement, le tout seedé).
 *
 * À l'Étape 1a : terrains variés + placement équilibré des départs.
 * Les ressources sur les cases seront ajoutées plus tard (1b/2).
 */

import type { Coord, MapType, Resource, Terrain, Tile } from "@polytopia/shared";
import {
  FOUNDED_CITY_LEVEL,
  RESOURCE_POP_GAIN,
  SAGE_NAMES,
  VILLAGE_DENSITY,
  VILLAGE_MIN_SPACING,
} from "@polytopia/shared";
import { createRng, type Rng } from "./rng.js";

/** Distance Chebyshev locale (évite un cycle d'import avec units.ts). */
function chebyshevLocal(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export interface GeneratedMap {
  tiles: Tile[];
  /** Cases de départ (futures capitales), une par joueur. */
  starts: Coord[];
}

/**
 * Proportion de la terre couverte par chaque biome non-champ. Le reste est du
 * champ. Posés en petits CLUSTERS organiques (cf. growBiomeClusters), pas case
 * par case, pour un terrain naturel sans grands blocs homogènes.
 */
const FOREST_LAND_FRACTION = 0.3;
const MOUNTAIN_LAND_FRACTION = 0.22;
/**
 * Taille (en cases) d'un cluster de biome : petites taches de 1 à 3 cases, pour
 * un terrain TRÈS mélangé (poivre-et-sel) plutôt que de gros blocs homogènes.
 */
const CLUSTER_MIN_SIZE = 1;
const CLUSTER_MAX_SIZE = 3;

/** Voisinage à 4 directions (croissance compacte des clusters de biome). */
const NEIGHBORS4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Nombre de candidats évalués pour chaque départ (best-candidate sampling). */
const CANDIDATES_PER_START = 64;

/**
 * Taille de carte conseillée selon le nombre de joueurs : plus de monde = plus
 * grand, mais surtout assez d'espace pour que traverser prenne du temps (anti-rush).
 */
/** Agrandissement de la carte Auto selon le type : plus il y a d'eau, plus on
 *  agrandit (sinon la terre, devenue minoritaire, donne une carte qui paraît
 *  vide en ressources/villages). Terres = 0. */
const MAP_SIZE_BONUS: Record<MapType, number> = {
  terres: 0,
  continents: 2,
  archipel: 4,
};

export function mapSizeForPlayers(count: number, mapType?: MapType): number {
  let base: number;
  if (count <= 2) base = 16;
  else if (count <= 4) base = 18;
  else if (count <= 6) base = 20;
  else base = 22;
  return base + MAP_SIZE_BONUS[mapType ?? "terres"];
}

/** Part de terre visée selon le type de carte (le reste = eau). */
const CONTINENTS_LAND_FRACTION = 0.5; // ~50 % d'eau
const ARCHIPEL_LAND_FRACTION = 0.24; // ~76 % d'eau

/**
 * Densité de villages PAR CASE DE TERRE, plus riche quand l'eau domine : la
 * terre étant minoritaire, on y met proportionnellement plus de villages pour
 * que la carte ne paraisse pas vide. (Terres garde le `VILLAGE_DENSITY` standard.)
 */
const CONTINENTS_VILLAGE_DENSITY = 1 / 16;
const ARCHIPEL_VILLAGE_DENSITY = 1 / 12;
/** Voisinage minimal de terre (sur 8) pour qu'une case porte une capitale. */
const MAINLAND_MIN_LAND_NEIGHBORS = 4;

/** Résultat du masque : la grille terre/eau, et d'éventuels départs IMPOSÉS
 *  (cas archipel : 1 capitale par île, le masque sait où elles sont). */
interface LandMaskResult {
  mask: boolean[];
  /** Départs imposés (sinon `pickStarts` choisit librement sur la terre). */
  starts?: Coord[];
}

/**
 * Masque terre/eau selon le type de carte (true = terre). Déterministe.
 * - "terres"     : 100 % terre.
 * - "continents" : grandes masses par accrétion + côtes lissées + petites îles.
 * - "archipel"   : 1 île-capitale par joueur + grandes îles centrales + îlots.
 */
function buildLandMask(
  rng: Rng,
  width: number,
  height: number,
  playerCount: number,
  mapType: MapType,
): LandMaskResult {
  switch (mapType) {
    case "continents":
      return { mask: buildContinentsMask(rng, width, height, CONTINENTS_LAND_FRACTION) };
    case "archipel":
      return buildArchipelagoMask(rng, width, height, playerCount, ARCHIPEL_LAND_FRACTION);
    case "terres":
    default: {
      // 100 % terre, agrémentée de QUELQUES PETITS LACS (charme + l'embarquement
      // sert à les traverser) — sans morceler la masse continentale.
      const mask = new Array<boolean>(width * height).fill(true);
      carveLakes(rng, mask, width, height);
      return { mask };
    }
  }
}

/** Densité de petits lacs sur la carte Terres (≈ 1 lac pour N cases). */
const LAKE_DENSITY = 1 / 65;
const LAKE_MIN_SIZE = 2;
const LAKE_MAX_SIZE = 6;

/**
 * Creuse quelques petits lacs (cases d'eau) dans une masse de terre, à l'écart
 * des bords (lacs intérieurs). Petits et peu nombreux : la terre reste connectée.
 * Déterministe.
 */
function carveLakes(rng: Rng, mask: boolean[], width: number, height: number): void {
  const count = Math.max(4, Math.round(width * height * LAKE_DENSITY));
  for (let l = 0; l < count; l++) {
    const size = rng.int(LAKE_MIN_SIZE, LAKE_MAX_SIZE);
    const frontier: number[] = [rng.int(1, height - 2) * width + rng.int(1, width - 2)];
    let carved = 0;
    while (frontier.length > 0 && carved < size) {
      const k = rng.int(0, frontier.length - 1);
      const i = frontier[k]!;
      frontier[k] = frontier[frontier.length - 1]!;
      frontier.pop();
      const x = i % width;
      const y = (i / width) | 0;
      // On garde les lacs strictement intérieurs (pas sur le bord de carte).
      if (!mask[i] || x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) continue;
      mask[i] = false;
      carved++;
      for (const [dx, dy] of NEIGHBORS4) frontier.push((y + dy) * width + (x + dx));
    }
  }
}

/**
 * Fait croître une île compacte et organique de `size` cases depuis (cx,cy)
 * (accrétion frontière seedée). Renvoie les indices des cases de cette île.
 */
function growBlobAt(
  rng: Rng,
  land: boolean[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
): number[] {
  const cells: number[] = [];
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return cells;
  const frontier: number[] = [];
  const add = (i: number): void => {
    if (land[i]) return;
    land[i] = true;
    cells.push(i);
    const x = i % width;
    const y = (i / width) | 0;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      frontier.push(ny * width + nx);
    }
  };
  add(cy * width + cx);
  let guard = size * 8 + 8;
  while (cells.length < size && frontier.length > 0 && guard-- > 0) {
    const k = rng.int(0, frontier.length - 1);
    const i = frontier[k]!;
    frontier[k] = frontier[frontier.length - 1]!;
    frontier.pop();
    if (!land[i]) add(i);
  }
  return cells;
}

/**
 * Archipel : majorité d'eau, terre fragmentée. Une île-capitale viable par
 * joueur (départ imposé sur sa case la mieux entourée de terre), 1-2 grandes
 * îles centrales (points de conflit) puis une myriade d'îlots jusqu'à la part
 * de terre voulue. Déterministe.
 */
function buildArchipelagoMask(
  rng: Rng,
  width: number,
  height: number,
  playerCount: number,
  landFraction: number,
): LandMaskResult {
  const n = width * height;
  const land = new Array<boolean>(n).fill(false);
  const targetLand = Math.round(n * landFraction);
  const margin = Math.max(1, Math.round(Math.min(width, height) * 0.14));

  // 1. Une île-capitale par joueur, autour d'ancres bien espacées.
  const anchors = pickSpreadAnchors(rng, width, height, playerCount, margin);
  const starts: Coord[] = [];
  for (const a of anchors) {
    const island = growBlobAt(rng, land, width, height, a.x, a.y, rng.int(7, 10));
    // Départ = la case de l'île la mieux entourée de terre (capitale viable).
    let bestI = a.y * width + a.x;
    let bestN = -1;
    for (const i of island) {
      const nb = landNeighbors8(land, width, height, i % width, (i / width) | 0);
      if (nb > bestN) {
        bestN = nb;
        bestI = i;
      }
    }
    starts.push({ x: bestI % width, y: (bestI / width) | 0 });
  }

  // 2. Grandes îles centrales (terrain de conflit), proches du centre.
  const bigIslands = width >= 18 ? 2 : 1;
  for (let b = 0; b < bigIslands; b++) {
    const cx = clamp(Math.round(width / 2) + rng.int(-2, 2), margin, width - 1 - margin);
    const cy = clamp(Math.round(height / 2) + rng.int(-2, 2), margin, height - 1 - margin);
    growBlobAt(rng, land, width, height, cx, cy, rng.int(12, 18));
  }

  // 3. Îlots épars (1-3 cases) jusqu'à atteindre la part de terre voulue.
  let count = land.reduce((s, v) => s + (v ? 1 : 0), 0);
  let guard = n * 4;
  while (count < targetLand && guard-- > 0) {
    const x = rng.int(1, width - 2);
    const y = rng.int(1, height - 2);
    if (land[y * width + x] || landNeighbors8(land, width, height, x, y) > 0) continue;
    count += growBlobAt(rng, land, width, height, x, y, rng.int(1, 3)).length;
  }

  return { mask: land, starts };
}

/** Borne une valeur dans [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Compte les cases de terre (true) dans le voisinage 8 d'une case du masque. */
function landNeighbors8(mask: readonly boolean[], width: number, height: number, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (mask[ny * width + nx] === true) n++;
    }
  }
  return n;
}

/**
 * Points d'ancrage bien espacés (best-candidate de Mitchell), à l'écart des
 * bords (`margin`) pour que les continents soient entourés d'eau, pas rognés.
 */
function pickSpreadAnchors(
  rng: Rng,
  width: number,
  height: number,
  count: number,
  margin: number,
): Coord[] {
  const inset = (v: number, max: number) => Math.min(Math.max(v, margin), max - 1 - margin);
  const rand = (): Coord => ({
    x: inset(rng.int(0, width - 1), width),
    y: inset(rng.int(0, height - 1), height),
  });
  const anchors: Coord[] = [rand()];
  for (let i = 1; i < count; i++) {
    let best: Coord | null = null;
    let bestDist = -1;
    for (let c = 0; c < 48; c++) {
      const cand = rand();
      let minD = Infinity;
      for (const a of anchors) minD = Math.min(minD, distance(cand, a));
      if (minD > bestDist) {
        bestDist = minD;
        best = cand;
      }
    }
    anchors.push(best!);
  }
  return anchors;
}

/**
 * Croissance de masses de terre par accrétion aléatoire depuis des ancres
 * espacées : on convertit des cases d'eau adjacentes à la terre, tirées au
 * hasard dans la frontière, jusqu'à atteindre la part de terre voulue. Donne
 * des continents organiques aux côtes irrégulières. Puis lissage + petites îles.
 */
function buildContinentsMask(rng: Rng, width: number, height: number, landFraction: number): boolean[] {
  const n = width * height;
  const targetLand = Math.round(n * landFraction);
  const land = new Array<boolean>(n).fill(false);
  const frontier: number[] = [];
  let count = 0;

  const pushNeighbors = (i: number): void => {
    const x = i % width;
    const y = (i / width) | 0;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (!land[j]) frontier.push(j);
    }
  };
  const makeLand = (i: number): void => {
    if (land[i]) return;
    land[i] = true;
    count++;
    pushNeighbors(i);
  };

  // Une ancre par futur continent : croissance multi-source = masses séparées.
  const numSeeds = Math.max(2, width >= 18 ? 4 : 3);
  const margin = Math.max(1, Math.round(Math.min(width, height) * 0.12));
  for (const a of pickSpreadAnchors(rng, width, height, numSeeds, margin)) {
    makeLand(a.y * width + a.x);
  }

  let guard = n * 8;
  while (count < targetLand && frontier.length > 0 && guard-- > 0) {
    const k = rng.int(0, frontier.length - 1);
    const i = frontier[k]!;
    frontier[k] = frontier[frontier.length - 1]!;
    frontier.pop();
    makeLand(i);
  }

  smoothCoasts(land, width, height);
  addSmallIslands(rng, land, width, height);
  return land;
}

/**
 * Lisse les côtes en une passe (règle de majorité, déterministe) : comble les
 * trous d'eau isolés dans la terre et gomme les pointes de terre trop fines.
 */
function smoothCoasts(land: boolean[], width: number, height: number): void {
  const src = land.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const ln = landNeighbors8(src, width, height, x, y);
      if (!src[i] && ln >= 5) land[i] = true; // trou d'eau cerné de terre -> terre
      else if (src[i] && ln <= 1) land[i] = false; // pointe de terre isolée -> eau
    }
  }
}

/** Sème quelques petites îles (2-3 cases) en pleine eau (points de conflit / villages). */
function addSmallIslands(rng: Rng, land: boolean[], width: number, height: number): void {
  const target = Math.max(1, Math.round((width * height) / 90));
  let placed = 0;
  const maxAttempts = target * 60 + 30;
  for (let a = 0; a < maxAttempts && placed < target; a++) {
    const x = rng.int(1, width - 2);
    const y = rng.int(1, height - 2);
    const i = y * width + x;
    if (land[i] || landNeighbors8(land, width, height, x, y) > 0) continue; // pleine eau
    land[i] = true;
    const extra = rng.int(1, 2);
    for (let e = 0; e < extra; e++) {
      const [dx, dy] = NEIGHBORS4[rng.int(0, NEIGHBORS4.length - 1)]!;
      const nx = x + dx;
      const ny = y + dy;
      if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue;
      land[ny * width + nx] = true;
    }
    placed++;
  }
}

/**
 * Pose des biomes (forêt, montagne) en petits CLUSTERS organiques sur la terre.
 * Toute la terre commence en champ ; on fait croître des paquets de 4-5 cases
 * de forme aléatoire (marche sur le voisinage à 4) jusqu'à atteindre la part
 * voulue de chaque biome. Déterministe (RNG seedé). Modifie `tiles` en place.
 */
function placeBiomeClusters(
  rng: Rng,
  tiles: Tile[],
  width: number,
  height: number,
  landIndices: readonly number[],
  terrain: Terrain,
  targetTiles: number,
): void {
  if (targetTiles <= 0 || landIndices.length === 0) return;
  let converted = 0;
  const maxAttempts = targetTiles * 40 + 50;
  for (let a = 0; a < maxAttempts && converted < targetTiles; a++) {
    const seed = tiles[landIndices[rng.int(0, landIndices.length - 1)]!];
    if (!seed || seed.terrain !== "champ") continue;
    const clusterSize = rng.int(CLUSTER_MIN_SIZE, CLUSTER_MAX_SIZE);
    // Croissance par frontière : on tire au hasard dans la frontière courante
    // pour obtenir des contours irréguliers (pas de blocs carrés).
    const frontier: Tile[] = [seed];
    let grown = 0;
    while (frontier.length > 0 && grown < clusterSize && converted < targetTiles) {
      const t = frontier.splice(rng.int(0, frontier.length - 1), 1)[0]!;
      if (t.terrain !== "champ") continue;
      t.terrain = terrain;
      grown++;
      converted++;
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = tiles[ny * width + nx];
        if (n && n.terrain === "champ") frontier.push(n);
      }
    }
  }
}

/** Une case est "terre" si on peut y poser une capitale (pas d'eau). */
export function isLandTerrain(terrain: Terrain): boolean {
  return terrain !== "eau" && terrain !== "ocean";
}

function distance(a: Coord, b: Coord): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Choisit `count` cases de départ bien espacées (best-candidate de Mitchell) :
 * le 1er point est aléatoire, chaque point suivant est, parmi N candidats
 * aléatoires, celui le plus éloigné des points déjà placés.
 */
function pickStarts(rng: Rng, land: Coord[], count: number): Coord[] {
  if (count <= 0) return [];
  if (land.length < count) {
    throw new Error(
      `generateMap: pas assez de terre (${land.length}) pour ${count} joueurs`,
    );
  }

  const starts: Coord[] = [land[rng.int(0, land.length - 1)]!];

  for (let i = 1; i < count; i++) {
    let best: Coord | null = null;
    let bestDist = -1;
    for (let c = 0; c < CANDIDATES_PER_START; c++) {
      const cand = land[rng.int(0, land.length - 1)]!;
      let minD = Infinity;
      for (const s of starts) minD = Math.min(minD, distance(cand, s));
      if (minD > bestDist) {
        bestDist = minD;
        best = cand;
      }
    }
    starts.push(best!);
  }

  return starts;
}

/** Probabilité qu'une case d'un terrain donné porte une ressource. */
const RESOURCE_CHANCE: Partial<Record<Terrain, number>> = {
  champ: 0.25,
  foret: 0.3,
  montagne: 0.35,
  // Le poisson reste rare en mer (sinon les océans en sont saturés sur les
  // cartes maritimes) : bancs épars plutôt qu'un tapis continu.
  eau: 0.13,
};

/** Probabilité qu'une case terrestre vide porte du Luxe (rare). */
const LUXE_CHANCE = 0.02;

/** Tire la ressource d'une case selon son terrain (ou undefined). */
function rollResource(rng: Rng, terrain: Terrain): Resource | undefined {
  const chance = RESOURCE_CHANCE[terrain] ?? 0;
  if (rng.next() >= chance) return undefined;
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
function baseResourceFor(terrain: Terrain): Resource | undefined {
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
function ensureStartResources(
  tiles: Tile[],
  width: number,
  height: number,
  start: Coord,
  startKeys: Set<string>,
  min: number,
): void {
  const neighbors: Tile[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = start.x + dx;
      const ny = start.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (startKeys.has(`${nx},${ny}`)) continue;
      const t = tiles[ny * width + nx];
      if (t) neighbors.push(t);
    }
  }

  let count = neighbors.filter((t) => t.resource !== undefined).length;
  // On complète sur de la TERRE uniquement (le poisson serait inexploitable sans
  // la tech Pêche), champs d'abord (fruits récoltables sans aucune tech).
  const fillable = neighbors
    .filter((t) => t.resource === undefined && isLandTerrain(t.terrain))
    .sort((a, b) => (a.terrain === "champ" ? 0 : 1) - (b.terrain === "champ" ? 0 : 1));
  for (const t of fillable) {
    if (count >= min) break;
    const res = baseResourceFor(t.terrain);
    if (res) {
      t.resource = res;
      count++;
    }
  }
}

/** Construit une carte complète (terrains + ressources + départs) déterministe. */
export function generateMap(
  seed: number,
  width: number,
  height: number,
  playerCount: number,
  mapType: MapType = "terres",
): GeneratedMap {
  const rng = createRng(seed);

  // 1. Masque terre/eau, puis terrain : terre = champ (biomes posés ensuite),
  //    eau = "eau". Le masque décide la forme des continents/îles selon le type,
  //    et peut imposer les départs (archipel : 1 capitale par île).
  const { mask: landMask, starts: forcedStarts } = buildLandMask(
    rng, width, height, playerCount, mapType,
  );
  const tiles: Tile[] = [];
  const landIndices: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const isLand = landMask[i] === true;
      tiles.push({ x, y, terrain: isLand ? "champ" : "eau" });
      if (isLand) landIndices.push(i);
    }
  }

  // 2. Biomes en clusters organiques sur la terre (forêt puis montagne).
  placeBiomeClusters(
    rng, tiles, width, height, landIndices, "foret",
    Math.round(landIndices.length * FOREST_LAND_FRACTION),
  );
  placeBiomeClusters(
    rng, tiles, width, height, landIndices, "montagne",
    Math.round(landIndices.length * MOUNTAIN_LAND_FRACTION),
  );

  const land: Coord[] = tiles
    .filter((t) => isLandTerrain(t.terrain))
    .map((t) => ({ x: t.x, y: t.y }));

  // Départs : imposés par le masque (archipel = 1 capitale/île), sinon choisis
  // sur de la VRAIE terre (cases bien entourées de terre, pas un caillou isolé).
  const landMaskNow = tiles.map((t) => isLandTerrain(t.terrain));
  const mainland = land.filter(
    (c) => landNeighbors8(landMaskNow, width, height, c.x, c.y) >= MAINLAND_MIN_LAND_NEIGHBORS,
  );
  const startPool = mainland.length >= playerCount ? mainland : land;

  const starts = forcedStarts ?? pickStarts(rng, startPool, playerCount);
  const startKeys = new Set(starts.map((s) => `${s.x},${s.y}`));

  // La capitale doit reposer sur de la terre "propre" : on force le départ en champ.
  for (const s of starts) {
    const tile = tiles[s.y * width + s.x];
    if (tile) tile.terrain = "champ";
  }

  // Ressources par terrain (hors cases de départ).
  for (const tile of tiles) {
    if (startKeys.has(`${tile.x},${tile.y}`)) continue;
    const res = rollResource(rng, tile.terrain);
    if (res) tile.resource = res;
  }
  // Luxe rare sur la terre encore vide.
  for (const tile of tiles) {
    if (startKeys.has(`${tile.x},${tile.y}`)) continue;
    if (tile.resource !== undefined) continue;
    if (isLandTerrain(tile.terrain) && rng.next() < LUXE_CHANCE) tile.resource = "luxe";
  }

  // Équité : au moins 2 ressources dans le voisinage de chaque départ.
  for (const s of starts) ensureStartResources(tiles, width, height, s, startKeys, 2);

  // Villages neutres à conquérir (moteur d'expansion). On base le nombre sur la
  // SURFACE DE TERRE (pas la grille entière) pour ne pas compter l'océan ; et on
  // enrichit l'archipel, où conquérir les îles est tout l'intérêt du mode.
  const landCount = landMaskNow.reduce((s, v) => s + (v ? 1 : 0), 0);
  const villageDensity =
    mapType === "archipel"
      ? ARCHIPEL_VILLAGE_DENSITY
      : mapType === "continents"
        ? CONTINENTS_VILLAGE_DENSITY
        : VILLAGE_DENSITY;
  const villageTarget = Math.max(0, Math.round(landCount * villageDensity));
  const villages = placeVillages(rng, tiles, width, height, starts, villageTarget);
  // Chaque village doit pouvoir atteindre le niveau 2 une fois fondé (sinon il
  // « plafonne » faute de ressources autour). On complète au strict minimum.
  ensureVillageResources(tiles, width, height, villages, startKeys);

  // Sages mystérieux (PNJ) à dilemme, espacés des départs.
  placeSages(rng, tiles, width, height, starts);

  return { tiles, starts };
}

/**
 * Sème les sages (Stan, Nico) sur des cases champ vides, espacés des départs,
 * des villages ET entre eux (jamais « collés » à un autre élément). Déterministe.
 */
function placeSages(
  rng: Rng,
  tiles: Tile[],
  width: number,
  height: number,
  starts: readonly Coord[],
): void {
  const startKeys = new Set(starts.map((s) => `${s.x},${s.y}`));
  // Uniquement des cases CHAMP vides (pas de forêt/montagne avec décor, pas de
  // ressource, pas de village) : le sage est ainsi bien dégagé et visible.
  const candidates = tiles.filter(
    (t) =>
      t.terrain === "champ" &&
      t.resource === undefined &&
      !t.village &&
      !startKeys.has(`${t.x},${t.y}`),
  );
  if (candidates.length === 0) return;

  // Coordonnées des villages déjà posés (pour ne pas coller un sage dessus).
  const villages: Coord[] = tiles.filter((t) => t.village).map((t) => ({ x: t.x, y: t.y }));

  const placed: Coord[] = [];
  const farEnough = (c: Coord): boolean => {
    for (const s of starts) if (chebyshevLocal(c, s) < VILLAGE_MIN_SPACING) return false;
    for (const v of villages) if (chebyshevLocal(c, v) < VILLAGE_MIN_SPACING) return false;
    for (const p of placed) if (chebyshevLocal(c, p) < VILLAGE_MIN_SPACING) return false;
    return true;
  };

  const maxAttempts = SAGE_NAMES.length * 200;
  for (let i = 0; i < maxAttempts && placed.length < SAGE_NAMES.length; i++) {
    const cand = candidates[rng.int(0, candidates.length - 1)]!;
    const c: Coord = { x: cand.x, y: cand.y };
    if (cand.sage || cand.village || !farEnough(c)) continue;
    cand.sage = SAGE_NAMES[placed.length]!;
    placed.push(c);
  }
}

/** Population nécessaire pour qu'une ville fondée (niveau 1) passe au niveau 2. */
const VILLAGE_TARGET_POP = FOUNDED_CITY_LEVEL + 1;

/**
 * Garantit, dans le rayon 1 de chaque village, de quoi récolter assez de
 * population pour atteindre le niveau 2 — et PAS plus (pas d'inondation) : on
 * compte d'abord les ressources déjà présentes, puis on complète le manque sur
 * les cases de terre libres, en privilégiant les champs (fruits, sans tech).
 */
function ensureVillageResources(
  tiles: Tile[],
  width: number,
  height: number,
  villages: readonly Coord[],
  startKeys: Set<string>,
): void {
  for (const v of villages) {
    const ring: Tile[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = v.x + dx;
        const ny = v.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const t = tiles[ny * width + nx];
        if (t) ring.push(t);
      }
    }

    let pop = ring.reduce((s, t) => s + (t.resource ? RESOURCE_POP_GAIN[t.resource] : 0), 0);
    if (pop >= VILLAGE_TARGET_POP) continue;

    // Cases où ajouter une ressource : terre libre, hors départ et hors village.
    // Champs en premier (fruits = récoltables sans technologie).
    const empties = ring
      .filter(
        (t) =>
          t.resource === undefined &&
          isLandTerrain(t.terrain) &&
          !t.village &&
          !startKeys.has(`${t.x},${t.y}`),
      )
      .sort((a, b) => (a.terrain === "champ" ? 0 : 1) - (b.terrain === "champ" ? 0 : 1));

    for (const t of empties) {
      if (pop >= VILLAGE_TARGET_POP) break;
      const res = baseResourceFor(t.terrain);
      if (!res) continue;
      t.resource = res;
      pop += RESOURCE_POP_GAIN[res];
    }
  }
}

/**
 * Sème des villages neutres sur la terre libre (hors départs, sans ressource),
 * espacés des départs et entre eux. ÉQUILIBRÉ PAR RÉGION (fairness de spawn) :
 * à chaque pose, on sert le départ qui a LE MOINS de villages, et on choisit la
 * case valide la plus proche de LUI (et dont il est le départ le plus proche) —
 * ainsi chaque joueur reçoit ~autant de villages, proches, en 1v1 comme à 8.
 * Déterministe (aucun RNG : balayage et choix du plus proche stables).
 * Un village pose une terre "propre" (champ) prête à accueillir une ville.
 */
function placeVillages(
  _rng: Rng,
  tiles: Tile[],
  width: number,
  height: number,
  starts: readonly Coord[],
  target: number,
): Coord[] {
  const startKeys = new Set(starts.map((s) => `${s.x},${s.y}`));
  const land = tiles.filter(
    (t) =>
      isLandTerrain(t.terrain) &&
      t.resource === undefined &&
      !startKeys.has(`${t.x},${t.y}`),
  );
  if (land.length === 0 || target <= 0 || starts.length === 0) return [];

  const placed: Coord[] = [];
  const counts = starts.map(() => 0);
  const farEnough = (c: Coord): boolean => {
    for (const s of starts) if (chebyshevLocal(c, s) < VILLAGE_MIN_SPACING) return false;
    for (const p of placed) if (chebyshevLocal(c, p) < VILLAGE_MIN_SPACING) return false;
    return true;
  };
  // Nombre de cases de terre dans le rayon 1 (un village sans terre autour
  // plafonnerait faute de ressources récoltables).
  const ringLand = (c: Coord): number => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const t = tiles[ny * width + nx];
        if (t && isLandTerrain(t.terrain)) n++;
      }
    }
    return n;
  };
  const nearestStart = (c: Coord): number => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < starts.length; i++) {
      const d = chebyshevLocal(c, starts[i]!);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  };
  const isValid = (cand: Tile): boolean =>
    !cand.village && farEnough(cand) && ringLand(cand) >= VILLAGE_TARGET_POP;
  const mark = (cand: Tile, owner: number) => {
    cand.terrain = "champ";
    cand.village = true;
    placed.push({ x: cand.x, y: cand.y });
    counts[owner] = (counts[owner] ?? 0) + 1;
  };

  for (let n = 0; n < target; n++) {
    // Départ le moins servi (égalité -> plus petit indice).
    let si = 0;
    for (let i = 1; i < counts.length; i++) if ((counts[i] ?? 0) < (counts[si] ?? 0)) si = i;
    const start = starts[si]!;

    // Meilleure case DANS la région de `si` : la plus proche de lui, et dont il
    // est bien le départ le plus proche (reste « chez lui »).
    let best: Tile | null = null;
    let bestD = Infinity;
    for (const cand of land) {
      if (!isValid(cand)) continue;
      if (nearestStart(cand) !== si) continue;
      const d = chebyshevLocal(cand, start);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
    if (best) {
      mark(best, si);
      continue;
    }
    // Repli : région saturée -> n'importe quelle case valide (rare).
    const any = land.find((cand) => isValid(cand));
    if (!any) break; // plus rien de plaçable
    mark(any, nearestStart(any));
  }

  return placed;
}
