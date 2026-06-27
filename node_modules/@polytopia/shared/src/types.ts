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

/**
 * Type de carte choisi au lancement (proportion de terre/eau) :
 * - "terres"     : 100 % terre, aucun combat naval ;
 * - "continents" : ~50 % eau, grandes masses séparées (la marine compte) ;
 * - "archipel"   : ~75 % eau, petites îles dispersées (la marine est reine).
 */
export type MapType = "terres" | "continents" | "archipel";

/** Ressources récoltables sur la carte (4 de base + 4 avancées). */
export type Resource =
  | "fruits"
  | "gibier"
  | "poisson"
  | "cereales"
  | "minerai"
  | "bois"
  | "metal"
  | "luxe"
  | "fer"
  | "chevaux";

/** Les 8 types d'unités (4 de base -> 4 évolutions). */
export type UnitType =
  | "guerrier"
  | "epeiste"
  | "archer"
  | "catapulte"
  | "cavalier"
  | "chevalier"
  | "defenseur"
  | "geant"
  | "hero"
  | "espion"
  | "caravane"
  | "galion"
  | "sous-marin"
  | "transport"
  | "dragon"
  | "kraken";

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
  /** Sage mystérieux (PNJ) sur cette case : nom affiché ("Stan"/"Nico"). Reste sur la carte. */
  sage?: string;
  /** Joueurs ayant déjà consulté ce sage : chacun ne peut accepter le marché qu'UNE fois. */
  sageUsedBy?: PlayerId[];
  /** Propriétaire du territoire (ville rattachée), le cas échéant. */
  ownerId?: PlayerId;
  /** Id de la ville occupant cette case, le cas échéant. */
  cityId?: string;
  /** Id de l'unité présente sur cette case, le cas échéant. */
  unitId?: string;
  /** Présence d'une ruine antique explorable. */
  ruin?: boolean;
  /** Présence d'un camp barbare hostile. */
  barbarianCamp?: boolean;
  /** Merveille Naturelle présente sur cette case. */
  naturalWonder?: "volcan" | "oasis";
  /** Présence d'une route physique. */
  hasRoad?: boolean;
}

/** Récompense au choix offerte à chaque montée de niveau d'une ville. */
export type CityReward = "atelier" | "tresor" | "troupe" | "muraille" | "agrandir";

/** Améliorations constructibles (action BUILD_IMPROVEMENT, débloquée par Construction). */
export type ImprovementType = "atelier" | "muraille" | "pyramides" | "colosse" | "grand_phare" | "bibliotheque";

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
  /** Ateliers TOTAUX (+1 étoile/tour chacun, défaut 0) : reçus en récompense de
   *  niveau ET bâtis via Construction. */
  workshops?: number;
  /** Ateliers BÂTIS via Construction uniquement (défaut 0). Sert au coût croissant
   *  des ateliers construits — les ateliers de récompense ne le font PAS monter. */
  builtWorkshops?: number;
  /** Muraille : renforce le bonus de défense de la ville. */
  hasWall?: boolean;
  /** PV du rempart : l'ennemi doit les réduire à 0 avant de pouvoir entrer/capturer. */
  wallHp?: number;
  /** Rayon d'exploitation (récolte), en Chebyshev. Défaut 1 ; grandit avec le territoire. */
  harvestRadius?: number;
  /** Unité en cours de production (grosses unités) : occupe la ville jusqu'à `turnsLeft` = 0. */
  production?: { unitType: UnitType; turnsLeft: number };
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
  /** L'unité est embarquée sur l'eau (Bateau). */
  isEmbarked?: boolean;
  /** Unité héroïque ? */
  isHero?: boolean;
  /** Expérience accumulée au combat. */
  xp?: number;
  /** Niveau de vétérance/héros. */
  level?: number;
  /** Compétences débloquées (Héros). */
  skills?: string[];
  /** Artéfacts équipés (Héros). */
  artifacts?: string[];
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
  /** Malus « Disette » d'un sage : saute le revenu du prochain tour de ce joueur. */
  skipIncome?: boolean;
  /** Le biome d'origine de cette civilisation (ex: "prairie", "neige", "desert"). */
  biome?: string;
  /** Statut du héros de ce joueur. */
  heroStatus?: "available" | "alive" | "dead";
  /** Ressources stratégiques possédées par le joueur. */
  strategicResources?: Resource[];
  /** Quête active donnée par un Sage. */
  activeQuest?: {
    type: "kill" | "harvest" | "tech";
    target: number;
    progress: number;
    reward: "tech" | "hero" | "stars";
    turnsLeft: number;
  };
  /** Points de culture accumulés. */
  culture?: number;
  /** Liste des ID de doctrines adoptées. */
  culturalDoctrines?: string[];
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
  /** Alliances actives entre joueurs [A, B] veut dire A et B sont alliés. */
  alliances: [PlayerId, PlayerId][];
  /** Propositions de paix en attente. */
  peaceProposals: { from: PlayerId; to: PlayerId }[];
  /** Merveilles mondiales déjà construites. */
  builtWonders: { type: ImprovementType; ownerId: PlayerId }[];
  /** Tour limite déclenchant la victoire au score ; null = partie illimitée. */
  turnLimit: number | null;
  /** Durée allouée pour le tour courant en millisecondes. null = infini */
  turnDurationMs: number | null;
  /** Timestamp de la fin du tour courant (géré par le serveur). null = infini */
  turnDeadline: number | null;
  /** Multiplicateur du coût des technologies (ex: 1.0 = normal, 0.7 = blitz) */
  techCostMultiplier: number;
  /** Le rythme de la partie tel que défini dans les options */
  pacingMode: "blitz" | "normal" | "long" | "custom";
  /** Compteur déterministe pour générer des id d'unités uniques. */
  nextUnitId: number;
  /** Compteur déterministe pour générer des id de villes fondées (hors capitales). */
  nextCityId: number;
  /** Seed du RNG, pour le déterminisme. */
  seed: number;
  /** Dernier résultat de consultation d'un sage (pour l'affichage client). Transitoire. */
  lastSage?: {
    /** Identifiant unique de l'événement (position@tour) pour n'afficher qu'une fois. */
    id: string;
    /** Joueur qui a consulté. */
    by: PlayerId;
    /** Issue bénéfique (true) ou néfaste (false). */
    good: boolean;
    /** Titre court de l'effet (ex. "Pactole"). */
    title: string;
    /** Description de l'effet appliqué. */
    detail: string;
  };
  /** Événements globaux ou locaux en cours. */
  activeEvents?: { type: string; msg: string; expiresAtTurn: number }[];
  /** Activation du système météo (Hiver, Été, Tempêtes). */
  weatherEnabled?: boolean;
  /** Activation des Boss de Carte mythologiques. */
  bossesEnabled?: boolean;
  /** Activation du Mode RPG (Héros et Équipements). */
  rpgModeEnabled?: boolean;
  /** Activation des Merveilles du Monde Exclusives. */
  wondersEnabled?: boolean;
  /** Activation des Batailles Navales Avancées. */
  navalCombatEnabled?: boolean;
  /** Météo actuelle du jeu (si weatherEnabled). */
  weather?: "normal" | "hiver" | "ete" | "tempete";
  /** Direction du vent global (si weatherEnabled). Affecte les voiliers. */
  windDirection?: { dx: number; dy: number };
}
