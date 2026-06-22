/**
 * Types de données partagés entre engine / server / client.
 * AUCUNE logique ici — uniquement des structures.
 *
 * À l'Étape 0, le modèle reste volontairement minimal (carte + joueurs + tour).
 * Villes, unités, économie, techs seront enrichis aux étapes suivantes.
 */
/** Identifiant de joueur (index dans GameState.players). */
export type PlayerId = number;
/** Terrains possibles d'une tuile. */
export type Terrain = "champ" | "foret" | "montagne" | "eau" | "ocean";
/** Ressources récoltables sur la carte (4 de base + 4 avancées). */
export type Resource = "fruits" | "gibier" | "poisson" | "cereales" | "minerai" | "bois" | "metal" | "luxe";
/** Les 8 types d'unités (4 de base -> 4 évolutions). */
export type UnitType = "guerrier" | "epeiste" | "archer" | "catapulte" | "cavalier" | "chevalier" | "defenseur" | "geant";
/** Coordonnée sur la grille carrée. */
export interface Coord {
    x: number;
    y: number;
}
/** Une case de la carte. */
export interface Tile {
    x: number;
    y: number;
    terrain: Terrain;
    /** Ressource présente, le cas échéant. */
    resource?: Resource;
    /** Village neutre : une unité posée dessus peut y fonder une ville (FOUND_CITY). */
    village?: boolean;
    /** Propriétaire du territoire (ville rattachée), le cas échéant. */
    ownerId?: PlayerId;
    /** Id de la ville occupant cette case, le cas échéant. */
    cityId?: string;
    /** Id de l'unité présente sur cette case, le cas échéant. */
    unitId?: string;
}
/** Récompense au choix offerte à chaque montée de niveau d'une ville. */
export type CityReward = "atelier" | "tresor" | "troupe" | "muraille" | "agrandir";
/** Une ville. */
export interface City {
    id: string;
    ownerId: PlayerId;
    x: number;
    y: number;
    level: number;
    population: number;
    /** Étoiles produites par tour (= niveau + 1 + ateliers). */
    starsPerTurn: number;
    /** Nombre de récompenses de niveau en attente de choix (défaut 0). */
    rewardsToPick?: number;
    /** Ateliers construits (+1 étoile/tour chacun, défaut 0). */
    workshops?: number;
    /** Muraille : renforce le bonus de défense de la ville. */
    hasWall?: boolean;
    /** Rayon d'exploitation (récolte), en Chebyshev. Défaut 1 ; grandit avec le territoire. */
    harvestRadius?: number;
}
/** Statistiques de base d'un type d'unité. */
export interface UnitStats {
    hp: number;
    attack: number;
    defense: number;
    range: number;
    movement: number;
    /** Coût en étoiles pour recruter. */
    cost: number;
}
/** Une unité. */
export interface Unit {
    id: string;
    type: UnitType;
    ownerId: PlayerId;
    x: number;
    y: number;
    hp: number;
    attack: number;
    defense: number;
    range: number;
    movement: number;
    /** A déjà bougé ce tour. */
    hasMoved: boolean;
    /** A déjà attaqué ce tour. */
    hasAttacked: boolean;
}
/** Un joueur (humain ou IA). */
export interface Player {
    id: PlayerId;
    civName: string;
    /** Couleur d'affichage (hex, ex "#e23d3d"). */
    color: string;
    stars: number;
    unlockedTechs: string[];
    isAI: boolean;
}
/** État complet et autoritaire de la partie. */
export interface GameState {
    /** Dimensions de la grille carrée. */
    width: number;
    height: number;
    /** Tuiles en ligne (index = y * width + x). */
    tiles: Tile[];
    players: Player[];
    units: Unit[];
    cities: City[];
    /** Index du joueur dont c'est le tour. */
    currentPlayer: PlayerId;
    /** Numéro de tour (commence à 1). */
    turn: number;
    /** Tour limite déclenchant la victoire au score ; null = partie illimitée. */
    turnLimit: number | null;
    /** Compteur déterministe pour générer des id d'unités uniques. */
    nextUnitId: number;
    /** Compteur déterministe pour générer des id de villes fondées (hors capitales). */
    nextCityId: number;
    /** Seed du RNG, pour le déterminisme. */
    seed: number;
}
//# sourceMappingURL=types.d.ts.map