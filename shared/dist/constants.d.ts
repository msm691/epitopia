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
/** Réglages de partie par défaut (lobby). */
export declare const DEFAULT_GAME_SETTINGS: import("./protocol.js").GameSettings;
/** Types de carte proposés dans les réglages (lobby). */
export declare const MAP_TYPE_PRESETS: ReadonlyArray<{
    label: string;
    value: import("./types.js").MapType;
}>;
/** Tailles de carte proposées dans les réglages (null = auto). */
export declare const MAP_SIZE_PRESETS: ReadonlyArray<{
    label: string;
    value: number | null;
}>;
/** Durées de tour proposées dans les réglages (secondes ; null = illimité). */
export declare const TURN_SECONDS_PRESETS: ReadonlyArray<{
    label: string;
    value: number | null;
}>;
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
/** Villages neutres : densité (≈ 1 village pour N cases de TERRE) et espacement minimal. */
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
/** Améliorations à BÂTIR (tech Construction). Puits à étoiles. */
export declare const IMPROVEMENT_COSTS: Record<import("./types.js").ImprovementType, number>;
export declare const ALL_IMPROVEMENTS: readonly import("./types.js").ImprovementType[];
export declare const IMPROVEMENT_LABELS: Record<import("./types.js").ImprovementType, string>;
/** Nombre maximal d'ateliers constructibles par ville. */
export declare const MAX_WORKSHOPS = 5;
/**
 * Coût du PROCHAIN atelier à BÂTIR, selon le nombre d'ateliers déjà BÂTIS
 * (`builtWorkshops`, hors ateliers reçus en récompense) : croît linéairement
 * (5, 10, 15, …) pour que stacker reste possible mais de plus en plus cher.
 * La muraille garde un coût fixe.
 */
export declare function improvementCost(improvement: import("./types.js").ImprovementType, builtWorkshops: number): number;
/** Rempart : PV de départ, et échelle des dégâts qu'une unité lui inflige. */
export declare const WALL_MAX_HP = 12;
export declare const WALL_DAMAGE_SCALE = 2;
/** Mouvement d'une unité EMBARQUÉE (bateau) : la mer accélère le déplacement. */
export declare const NAVAL_MOVEMENT = 2;
/** Sages mystérieux (PNJ) semés sur la carte : noms, et facteur d'échelle des effets. */
export declare const SAGE_NAMES: readonly string[];
/**
 * Effets d'étoiles d'un sage = max(SAGE_MIN_STARS, revenu/tour × SAGE_STAR_FACTOR),
 * PLAFONNÉ à SAGE_MAX_STARS (sinon en endgame le gros revenu donnait +150★ absurdes).
 */
export declare const SAGE_STAR_FACTOR = 4;
export declare const SAGE_MIN_STARS = 15;
export declare const SAGE_MAX_STARS = 50;
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
        readonly hp: 11;
        readonly attack: 2;
        readonly defense: 1;
        readonly range: 2;
        readonly movement: 1;
        readonly cost: 3;
    };
    readonly cavalier: {
        readonly hp: 11;
        readonly attack: 2;
        readonly defense: 1;
        readonly range: 1;
        readonly movement: 2;
        readonly cost: 3;
    };
    readonly defenseur: {
        readonly hp: 16;
        readonly attack: 1;
        readonly defense: 3;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 3;
    };
    readonly epeiste: {
        readonly hp: 16;
        readonly attack: 3;
        readonly defense: 3;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 5;
    };
    readonly catapulte: {
        readonly hp: 12;
        readonly attack: 3;
        readonly defense: 1;
        readonly range: 3;
        readonly movement: 1;
        readonly cost: 8;
    };
    readonly chevalier: {
        readonly hp: 16;
        readonly attack: 3;
        readonly defense: 2;
        readonly range: 1;
        readonly movement: 3;
        readonly cost: 8;
    };
    readonly geant: {
        readonly hp: 28;
        readonly attack: 4;
        readonly defense: 3;
        readonly range: 1;
        readonly movement: 1;
        readonly cost: 10;
    };
};
/**
 * Temps de PRODUCTION (en tours du propriétaire) des grosses unités : la ville
 * reste occupée pendant ce délai, puis l'unité apparaît. 0/absent = immédiat.
 */
export declare const UNIT_BUILD_TURNS: Partial<Record<import("./types.js").UnitType, number>>;
/** Tours de production d'un type d'unité (0 si apparition immédiate). */
export declare function unitBuildTurns(type: import("./types.js").UnitType): number;
/** Tous les types d'unités, dans l'ordre base puis évolutions (pour l'UI). */
export declare const ALL_UNIT_TYPES: readonly import("./types.js").UnitType[];
/** Noms affichables des unités. */
export declare const UNIT_NAMES: Record<import("./types.js").UnitType, string>;
/** Couleurs de civilisation par défaut (index = ordre de join). */
export declare const DEFAULT_CIV_COLORS: readonly string[];
//# sourceMappingURL=constants.d.ts.map