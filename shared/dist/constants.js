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
/** Pondérations du score de fin de partie. */
export const SCORE_WEIGHTS = {
    city: 10,
    cityLevel: 5,
    unit: 2,
    tech: 3,
    star: 1,
};
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
/** Villages neutres : densité (≈ 1 village pour N cases) et espacement minimal. */
export const VILLAGE_DENSITY = 1 / 20;
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
export const REWARD_TROOP_UNIT = "guerrier"; // ⚔️ Troupe : unité gratuite
/** Libellés des récompenses (pour l'UI). */
export const CITY_REWARD_LABELS = {
    atelier: "🔨 Atelier (+1⭐/tour)",
    tresor: "💰 Trésor (+5⭐)",
    troupe: "⚔️ Troupe (guerrier)",
    muraille: "🧱 Muraille (+défense)",
    agrandir: "🗺️ Agrandir le territoire",
};
/** Toutes les récompenses, dans l'ordre d'affichage. */
export const ALL_CITY_REWARDS = [
    "atelier",
    "tresor",
    "troupe",
    "muraille",
    "agrandir",
];
/** Population gagnée par récolte selon la ressource (avancées valent plus). */
export const RESOURCE_POP_GAIN = {
    fruits: 1,
    gibier: 1,
    poisson: 1,
    cereales: 1,
    minerai: 2,
    bois: 2,
    metal: 2,
    luxe: 3,
};
/** Coût en étoiles d'une récolte selon la ressource. */
export const RESOURCE_HARVEST_COST = {
    fruits: 2,
    gibier: 2,
    poisson: 2,
    cereales: 2,
    minerai: 5,
    bois: 5,
    metal: 5,
    luxe: 5,
};
/**
 * Stats provisoires des 8 unités (4 base + 4 évolutions).
 * À l'Étape 1c, seul le Guerrier est recrutable ; les autres valeurs seront
 * équilibrées à l'Étape 2. Les évolutions ne sont là que pour figer le type.
 */
export const UNIT_STATS = {
    // --- Base ---
    guerrier: { hp: 10, attack: 2, defense: 2, range: 1, movement: 1, cost: 2 },
    archer: { hp: 10, attack: 2, defense: 1, range: 2, movement: 1, cost: 3 },
    cavalier: { hp: 10, attack: 2, defense: 1, range: 1, movement: 2, cost: 3 },
    defenseur: { hp: 15, attack: 1, defense: 3, range: 1, movement: 1, cost: 3 },
    // --- Évolutions (Étape 2) ---
    epeiste: { hp: 15, attack: 3, defense: 3, range: 1, movement: 1, cost: 5 },
    catapulte: { hp: 10, attack: 4, defense: 0, range: 3, movement: 1, cost: 8 },
    chevalier: { hp: 15, attack: 4, defense: 1, range: 1, movement: 3, cost: 8 },
    geant: { hp: 40, attack: 5, defense: 4, range: 1, movement: 1, cost: 10 },
};
/** Tous les types d'unités, dans l'ordre base puis évolutions (pour l'UI). */
export const ALL_UNIT_TYPES = [
    "guerrier",
    "archer",
    "cavalier",
    "defenseur",
    "epeiste",
    "catapulte",
    "chevalier",
    "geant",
];
/** Noms affichables des unités. */
export const UNIT_NAMES = {
    guerrier: "Guerrier",
    archer: "Archer",
    cavalier: "Cavalier",
    defenseur: "Défenseur",
    epeiste: "Épéiste",
    catapulte: "Catapulte",
    chevalier: "Chevalier",
    geant: "Géant",
};
/** Couleurs de civilisation par défaut (index = ordre de join). */
export const DEFAULT_CIV_COLORS = [
    "#e23d3d", // rouge
    "#3d7fe2", // bleu
    "#3dbf57", // vert
    "#e2b53d", // jaune
    "#9b3de2", // violet
    "#3dd6e2", // cyan
    "#e23d9b", // rose
    "#e2843d", // orange
];
//# sourceMappingURL=constants.js.map