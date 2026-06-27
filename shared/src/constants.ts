/**
 * Constantes de game design partagées.
 * Valeurs volontairement minimales à l'Étape 0 ; enrichies aux étapes suivantes.
 */

/** Tailles de carte selon le nombre de joueurs (cf. §6). */
export const MAP_SIZE_SMALL = 11; // peu de joueurs
export const MAP_SIZE_LARGE = 16; // jusqu'à 8 joueurs

/** Nombre maximum de joueurs (2 humains max + IA). */
export const MAX_PLAYERS = 8;

/** Tour limite par défaut pour la victoire au score (repli). */
export const DEFAULT_TURN_LIMIT = 30;

/** Réglages de partie par défaut (lobby). */
export const DEFAULT_GAME_SETTINGS: import("./protocol.js").GameSettings = {
  turnLimit: DEFAULT_TURN_LIMIT,
  turnSeconds: null, // pas de limite de temps par défaut
  mapSize: null, // taille auto selon le nombre de joueurs
  mapType: "continents", // ~50 % d'eau : la marine est un vrai enjeu
  weatherEnabled: false,
  bossesEnabled: false,
  rpgModeEnabled: false,
  wondersEnabled: false,
  navalCombatEnabled: false,
};

/** Types de carte proposés dans les réglages (lobby). */
export const MAP_TYPE_PRESETS: ReadonlyArray<{
  label: string;
  value: import("./types.js").MapType;
}> = [
  { label: "🌾 Terres", value: "terres" },
  { label: "🏝️ Continents", value: "continents" },
  { label: "🌊 Archipel", value: "archipel" },
];

/** Tailles de carte proposées dans les réglages (null = auto). */
export const MAP_SIZE_PRESETS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: "Auto", value: null },
  { label: "Petite", value: 12 },
  { label: "Moyenne", value: 16 },
  { label: "Grande", value: 20 },
];

/** Durées de tour proposées dans les réglages (secondes ; null = illimité). */
export const TURN_SECONDS_PRESETS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: "∞", value: null },
  { label: "30 s", value: 30 },
  { label: "60 s", value: 60 },
  { label: "90 s", value: 90 },
  { label: "2 min", value: 120 },
];

/** Pondérations du score de fin de partie. */
export const SCORE_WEIGHTS = {
  city: 10,
  cityLevel: 5,
  unit: 2,
  tech: 3,
  star: 1,
} as const;

/** Étoiles possédées par chaque joueur au début de la partie. */
export const STARTING_STARS = 5;

/** Niveau d'une capitale fraîchement fondée. */
export const CAPITAL_START_LEVEL = 1;

/** Rayon de récolte de base d'une ville neuve (Chebyshev). */
export const CITY_HARVEST_RADIUS = 1;

/** Agrandissements de territoire OFFERTS automatiquement (2 premières montées de niveau). */
export const AUTO_TERRITORY_EXPANSIONS = 2; // rayon auto jusqu'à 1 + 2 = 3
/** Rayon d'exploitation maximal (au-delà, plus d'agrandissement possible). */
export const MAX_HARVEST_RADIUS = 4;

/** Villages neutres : densité (≈ 1 village pour N cases de TERRE) et espacement minimal. */
export const VILLAGE_DENSITY = 1 / 23;
export const VILLAGE_MIN_SPACING = 3; // Chebyshev, vis-à-vis des départs et des autres villages

/** Niveau et population d'une ville fraîchement fondée sur un village. */
export const FOUNDED_CITY_LEVEL = 1;

/** Bonus de défense (anti-rush) : on garde le meilleur applicable, pas de cumul. */
export const DEFENSE_BONUS_CITY = 1.5;
export const DEFENSE_BONUS_TERRAIN = 1.5; // forêt / montagne
export const DEFENSE_BONUS_WALL = 2.0; // ville avec muraille (récompense de niveau)

/** Récompenses de montée de niveau d'une ville. */
export const TREASURE_STARS = 5; // 💰 Trésor : étoiles immédiates
export const WORKSHOP_STARS = 1; // 🔨 Atelier : +étoiles/tour permanent
export const REWARD_TROOP_UNIT = "guerrier" as const; // ⚔️ Troupe : unité gratuite

/** Libellés des récompenses (pour l'UI). */
export const CITY_REWARD_LABELS: Record<import("./types.js").CityReward, string> = {
  atelier: "🔨 Atelier (+1⭐/tour)",
  tresor: "💰 Trésor (+5⭐)",
  troupe: "⚔️ Troupe (guerrier)",
  muraille: "🧱 Muraille (+défense)",
  agrandir: "🗺️ Agrandir le territoire",
};

/** Toutes les récompenses, dans l'ordre d'affichage. */
export const ALL_CITY_REWARDS: readonly import("./types.js").CityReward[] = [
  "atelier",
  "tresor",
  "troupe",
  "muraille",
  "agrandir",
];

/** Améliorations à BÂTIR (tech Construction). Puits à étoiles. */
export const IMPROVEMENT_COSTS: Record<import("./types.js").ImprovementType, number> = {
  atelier: 5, // 🔨 +1⭐/tour permanent (coût de BASE ; croît à chaque atelier, cf. improvementCost)
  muraille: 8, // 🧱 rempart à PV (siège)
  pyramides: 30, // 🏛️ Merveille (+3⭐/tour global)
  colosse: 30, // 🏛️ Merveille (+1 Def global)
  grand_phare: 30, // 🗼 Merveille (+1 Mouvement naval)
  bibliotheque: 30, // 📚 Merveille (Tech aléatoire)
};
export const ALL_IMPROVEMENTS: readonly import("./types.js").ImprovementType[] = ["atelier", "muraille", "pyramides", "colosse", "grand_phare", "bibliotheque"];
export const IMPROVEMENT_LABELS: Record<import("./types.js").ImprovementType, string> = {
  atelier: "🔨 Atelier",
  muraille: "🧱 Rempart",
  pyramides: "🏛️ Pyramides",
  colosse: "🗽 Colosse",
  grand_phare: "🗼 Grand Phare",
  bibliotheque: "📚 Grande Bibliothèque",
};
/** Nombre maximal d'ateliers constructibles par ville. */
export const MAX_WORKSHOPS = 5;

/**
 * Coût d'une amélioration de ville. L'atelier coûte 5 + 2 par atelier DEJA CONSTRUIT (via action).
 */
export function improvementCost(type: import("./types.js").ImprovementType, builtWorkshops: number, player?: import("./types.js").Player): number {
  let cost = 0;
  if (type === "muraille") cost = 10;
  else if (type === "atelier") cost = 5 + builtWorkshops * 2;
  else cost = IMPROVEMENT_COSTS[type];
  
  if (player?.culturalDoctrines?.includes("batisseurs")) {
    cost = Math.max(1, cost - 2);
  }
  return cost;
}

/** Rempart : PV de départ, et échelle des dégâts qu'une unité lui inflige. */
export const WALL_MAX_HP = 12;
export const WALL_DAMAGE_SCALE = 2;

/** Mouvement d'une unité EMBARQUÉE (bateau) : la mer accélère le déplacement. */
export const NAVAL_MOVEMENT = 2;

/** Sages mystérieux (PNJ) semés sur la carte : noms, et facteur d'échelle des effets. */
export const SAGE_NAMES: readonly string[] = ["Stan", "Nico"];
/**
 * Effets d'étoiles d'un sage = max(SAGE_MIN_STARS, revenu/tour × SAGE_STAR_FACTOR),
 * PLAFONNÉ à SAGE_MAX_STARS (sinon en endgame le gros revenu donnait +150★ absurdes).
 */
export const SAGE_STAR_FACTOR = 4;
export const SAGE_MIN_STARS = 15;
export const SAGE_MAX_STARS = 50;

/** Population gagnée par récolte selon la ressource (avancées valent plus). */
export const RESOURCE_POP_GAIN: Record<import("./types.js").Resource, number> = {
  fruits: 1,
  gibier: 1,
  poisson: 1,
  cereales: 1,
  minerai: 2,
  bois: 2,
  metal: 2,
  luxe: 3,
  fer: 1,
  chevaux: 1,
};

/** Coût en étoiles d'une récolte selon la ressource. */
export const RESOURCE_HARVEST_COST: Record<import("./types.js").Resource, number> = {
  fruits: 2,
  gibier: 2,
  poisson: 2,
  cereales: 2,
  minerai: 5,
  bois: 5,
  metal: 5,
  luxe: 5,
  fer: 5,
  chevaux: 5,
};

/**
 * Stats provisoires des 8 unités (4 base + 4 évolutions).
 * À l'Étape 1c, seul le Guerrier est recrutable ; les autres valeurs seront
 * équilibrées à l'Étape 2. Les évolutions ne sont là que pour figer le type.
 */
export const UNIT_STATS = {
  // --- Base ---
  guerrier: { hp: 10, attack: 2, defense: 2, range: 1, movement: 1, cost: 2 },
  // Archer & cavalier : PV 11 (def 1) pour survivre tout juste à un coup d'une
  // unité atk 3 (sinon ils étaient « one-shot » pile à 10 dégâts).
  archer: { hp: 11, attack: 2, defense: 1, range: 2, movement: 1, cost: 3 },
  cavalier: { hp: 11, attack: 2, defense: 1, range: 1, movement: 2, cost: 3 },
  defenseur: { hp: 16, attack: 1, defense: 3, range: 1, movement: 1, cost: 3 },
  // --- Évolutions ---
  // Rééquilibrage « tactique » (agent 5) : la formule de combat fait croître les
  // dégâts en attaque² et frappe au MAXIMUM les défenses faibles. Donc on bannit
  // les def 0 et on plafonne les attaques, pour des duels en 2-3 coups (peu de
  // one-shot entre unités comparables).
  epeiste: { hp: 16, attack: 3, defense: 3, range: 1, movement: 1, cost: 5 },
  // Catapulte : artillerie de portée. def 0 -> 1 (n'est plus « one-shot » par
  // tout le monde) + hp 10 -> 12 ; reste fragile et à protéger.
  catapulte: { hp: 12, attack: 3, defense: 1, range: 3, movement: 1, cost: 8 },
  // Chevalier : frappeur MOBILE (movement 3). atk 5 -> 3 (ne « one-shot » plus
  // une unité de base), hp 18 -> 16. Sa force = la mobilité, pas le burst.
  chevalier: { hp: 16, attack: 3, defense: 2, range: 1, movement: 3, cost: 8 },
  // Géant : gros tank qui frappe fort mais lent. atk 5 -> 4, hp 30 -> 28.
  geant: { hp: 28, attack: 4, defense: 3, range: 1, movement: 1, cost: 10 },
  // Héros : unité d'élite polyvalente, chère et unique
  hero: { hp: 20, attack: 3, defense: 3, range: 1, movement: 2, cost: 20 },
  // --- V6 Unités ---
  espion: { hp: 10, attack: 1, defense: 1, range: 1, movement: 2, cost: 5 },
  caravane: { hp: 10, attack: 0, defense: 1, range: 1, movement: 2, cost: 5 },
  galion: { hp: 15, attack: 3, defense: 2, range: 2, movement: 3, cost: 8 },
  "sous-marin": { hp: 10, attack: 4, defense: 1, range: 2, movement: 2, cost: 8 },
  transport: { hp: 15, attack: 1, defense: 1, range: 1, movement: 3, cost: 5 },
  dragon: { hp: 60, attack: 5, defense: 3, range: 2, movement: 3, cost: 0 },
  kraken: { hp: 80, attack: 4, defense: 4, range: 1, movement: 2, cost: 0 },
} as const satisfies Record<import("./types.js").UnitType, import("./types.js").UnitStats>;

/**
 * Temps de PRODUCTION (en tours du propriétaire) des grosses unités : la ville
 * reste occupée pendant ce délai, puis l'unité apparaît. 0/absent = immédiat.
 */
export const UNIT_BUILD_TURNS: Partial<Record<import("./types.js").UnitType, number>> = {
  catapulte: 1,
  chevalier: 1,
  geant: 2,
};

/** Tours de production d'un type d'unité (0 si apparition immédiate). */
export function unitBuildTurns(type: import("./types.js").UnitType): number {
  return UNIT_BUILD_TURNS[type] ?? 0;
}

/** Tous les types d'unités, dans l'ordre base puis évolutions (pour l'UI). */
export const ALL_UNIT_TYPES: readonly import("./types.js").UnitType[] = [
  "guerrier",
  "archer",
  "cavalier",
  "defenseur",
  "epeiste",
  "catapulte",
  "chevalier",
  "geant",
  "hero",
  "espion",
  "caravane",
  "transport",
  "galion",
  "sous-marin",
  "dragon",
  "kraken",
];

/** Noms affichables des unités. */
export const UNIT_NAMES: Record<import("./types.js").UnitType, string> = {
  guerrier: "Guerrier",
  archer: "Archer",
  cavalier: "Cavalier",
  defenseur: "Défenseur",
  epeiste: "Épéiste",
  catapulte: "Catapulte",
  chevalier: "Chevalier",
  geant: "Géant",
  hero: "Héros",
  espion: "Espion",
  caravane: "Caravane",
  transport: "Transport",
  galion: "Galion",
  "sous-marin": "Sous-marin",
  dragon: "🐉 Dragon",
  kraken: "🦑 Kraken",
};

export const DEFAULT_CIV_COLORS: readonly string[] = [
  "#e23d3d", // rouge
  "#3d7fe2", // bleu
  "#3dbf57", // vert
  "#e2b53d", // jaune
  "#9b3de2", // violet
  "#3dd6e2", // cyan
  "#e23d9b", // rose
  "#e2843d", // orange
];

export interface DoctrineDef {
  id: string;
  name: string;
  description: string;
  cost: number;
}

export const DOCTRINES: Record<string, DoctrineDef> = {
  fanatisme: {
    id: "fanatisme",
    name: "Fanatisme",
    description: "+1 Attaque pour toutes vos unités.",
    cost: 50,
  },
  marchands: {
    id: "marchands",
    name: "Guilde des Marchands",
    description: "Les villes génèrent +1⭐ par niveau.",
    cost: 50,
  },
  erudition: {
    id: "erudition",
    name: "Érudition",
    description: "Le coût des technologies est réduit de 20%.",
    cost: 50,
  },
  batisseurs: {
    id: "batisseurs",
    name: "Bâtisseurs",
    description: "Les murailles et ateliers coûtent 2⭐ de moins.",
    cost: 50,
  },
};
