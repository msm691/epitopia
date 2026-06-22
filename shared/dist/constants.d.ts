/**
 * Constantes de game design partagées.
 * Valeurs volontairement minimales à l'Étape 0 ; enrichies aux étapes suivantes.
 */
/** Tailles de carte selon le nombre de joueurs (cf. §6). */
export declare const MAP_SIZE_SMALL = 11;
export declare const MAP_SIZE_LARGE = 16;
/** Nombre maximum de joueurs (2 humains max + IA). */
export declare const MAX_PLAYERS = 8;
/** Tour limite par défaut pour la victoire au score (repli). */
export declare const DEFAULT_TURN_LIMIT = 30;
/** Pondérations du score de fin de partie. */
export declare const SCORE_WEIGHTS: {
    readonly city: 10;
    readonly cityLevel: 5;
    readonly unit: 2;
    readonly tech: 3;
    readonly star: 1;
};
/** Étoiles possédées par chaque joueur au début de la partie. */
export declare const STARTING_STARS = 5;
/** Niveau d'une capitale fraîchement fondée. */
export declare const CAPITAL_START_LEVEL = 1;
/** Rayon de récolte de base d'une ville neuve (Chebyshev). */
export declare const CITY_HARVEST_RADIUS = 1;
/** Agrandissements de territoire OFFERTS automatiquement (2 premières montées de niveau). */
export declare const AUTO_TERRITORY_EXPANSIONS = 2;
/** Rayon d'exploitation maximal (au-delà, plus d'agrandissement possible). */
export declare const MAX_HARVEST_RADIUS = 4;
/** Villages neutres : densité (≈ 1 village pour N cases) et espacement minimal. */
export declare const VILLAGE_DENSITY: number;
export declare const VILLAGE_MIN_SPACING = 3;
/** Niveau et population d'une ville fraîchement fondée sur un village. */
export declare const FOUNDED_CITY_LEVEL = 1;
/** Bonus de défense (anti-rush) : on garde le meilleur applicable, pas de cumul. */
export declare const DEFENSE_BONUS_CITY = 1.5;
export declare const DEFENSE_BONUS_TERRAIN = 1.5;
export declare const DEFENSE_BONUS_WALL = 2;
/** Récompenses de montée de niveau d'une ville. */
export declare const TREASURE_STARS = 5;
export declare const WORKSHOP_STARS = 1;
export declare const REWARD_TROOP_UNIT: "guerrier";
/** Libellés des récompenses (pour l'UI). */
export declare const CITY_REWARD_LABELS: Record<import("./types.js").CityReward, string>;
/** Toutes les récompenses, dans l'ordre d'affichage. */
export declare const ALL_CITY_REWARDS: readonly import("./types.js").CityReward[];
/** Population gagnée par récolte selon la ressource (avancées valent plus). */
export declare const RESOURCE_POP_GAIN: Record<import("./types.js").Resource, number>;
/** Coût en étoiles d'une récolte selon la ressource. */
export declare const RESOURCE_HARVEST_COST: Record<import("./types.js").Resource, number>;
/**
 * Stats provisoires des 8 unités (4 base + 4 évolutions).
 * À l'Étape 1c, seul le Guerrier est recrutable ; les autres valeurs seront
 * équilibrées à l'Étape 2. Les évolutions ne sont là que pour figer le type.
 */
export declare const UNIT_STATS: {
    readonly guerrier: {
        readonly hp: 10;
        readonly attack: 2;
        readonly defense: 2;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 2;
    };
    readonly archer: {
        readonly hp: 10;
        readonly attack: 2;
        readonly defense: 1;
        readonly range: 2;
        readonly movement: 1;
        readonly cost: 3;
    };
    readonly cavalier: {
        readonly hp: 10;
        readonly attack: 2;
        readonly defense: 1;
        readonly range: 1;
        readonly movement: 2;
        readonly cost: 3;
    };
    readonly defenseur: {
        readonly hp: 15;
        readonly attack: 1;
        readonly defense: 3;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 3;
    };
    readonly epeiste: {
        readonly hp: 15;
        readonly attack: 3;
        readonly defense: 3;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 5;
    };
    readonly catapulte: {
        readonly hp: 10;
        readonly attack: 4;
        readonly defense: 0;
        readonly range: 3;
        readonly movement: 1;
        readonly cost: 8;
    };
    readonly chevalier: {
        readonly hp: 15;
        readonly attack: 4;
        readonly defense: 1;
        readonly range: 1;
        readonly movement: 3;
        readonly cost: 8;
    };
    readonly geant: {
        readonly hp: 40;
        readonly attack: 5;
        readonly defense: 4;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 10;
    };
};
/** Tous les types d'unités, dans l'ordre base puis évolutions (pour l'UI). */
export declare const ALL_UNIT_TYPES: readonly import("./types.js").UnitType[];
/** Noms affichables des unités. */
export declare const UNIT_NAMES: Record<import("./types.js").UnitType, string>;
/** Couleurs de civilisation par défaut (index = ordre de join). */
export declare const DEFAULT_CIV_COLORS: readonly string[];
//# sourceMappingURL=constants.d.ts.map