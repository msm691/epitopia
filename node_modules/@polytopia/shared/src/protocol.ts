/**
 * Protocole réseau partagé client <-> serveur (socket.io).
 * Le serveur est autoritaire : le client envoie des Actions, le serveur valide,
 * applique et diffuse le GameState. Aucune règle de jeu ici.
 */

import type { Action } from "./actions.js";
import type { GameState, MapType, PlayerId } from "./types.js";

/** Réglages de partie, modifiables par l'hôte dans le lobby. */
export interface GameSettings {
  /** Limite de tours (déclenche la victoire au score) ; null = illimité. */
  turnLimit: number | null;
  /** Temps maximum par tour et par joueur, en secondes ; null = pas de limite. */
  turnSeconds: number | null;
  /** Rythme de jeu (presets ou custom) */
  pacingMode: "blitz" | "normal" | "long" | "custom";
  /** Or de départ (uniquement si pacingMode === "custom") */
  customStartGold?: number;
  /** Multiplicateur de coût des technologies (uniquement si pacingMode === "custom") */
  customTechCostMultiplier?: number;
  /** Taille de carte forcée ; null = automatique selon le nombre de joueurs. */
  mapSize: number | null;
  /** Type de carte (proportion terre/eau). */
  mapType: MapType;
  /** Activation du système météo (Hiver, Été, Tempêtes). */
  weatherEnabled?: boolean;
  /** Activation des Boss de Carte mythologiques. */
  bossesEnabled?: boolean;
  /** Activation du Mode RPG (Héros et Équipements). */
  rpgModeEnabled?: boolean;
  /** Activation des Merveilles du Monde Exclusives. */
  wondersEnabled?: boolean;
  /** Activation des Batailles Navales Avancées (Galions, Sous-marins). */
  navalCombatEnabled?: boolean;
}

/** État d'un vote de fin de partie (mode infini). */
export interface EndVoteState {
  /** Joueurs ayant voté POUR. */
  approve: PlayerId[];
  /** Joueurs ayant voté CONTRE. */
  decline: PlayerId[];
  /** Nombre de voix POUR nécessaires (> 50% des humains connectés). */
  needed: number;
  /** Nombre d'humains connectés au lancement du vote. */
  humans: number;
}

/** Un message du chat (joueur ou système). */
export interface ChatMessage {
  id: string;
  senderId?: PlayerId; // undefined = système
  text: string;
  timestamp: number;
}

/** Un joueur tel que vu dans le lobby (avant/pendant la partie). */
export interface LobbyPlayer {
  id: number;
  name: string;
  color: string;
  connected: boolean;
  isAI: boolean;
}

export interface LobbyState {
  /** Identifiant unique du lobby. */
  id: string;
  /** Nom du lobby. */
  name: string;
  players: LobbyPlayer[];
  /** Id de l'hôte (celui qui peut lancer la partie). */
  hostId: number | null;
  started: boolean;
  maxPlayers: number;
  /** Réglages de la partie (modifiables par l'hôte avant le lancement). */
  settings: GameSettings;
}

export interface LobbyInfo {
  id: string;
  name: string;
  hasPassword: boolean;
  currentPlayers: number;
  maxPlayers: number;
  started: boolean;
}

export interface JoinPayload {
  name: string;
  /** Token de session généré par le client, utilisé pour la reconnexion. */
  sessionId: string;
}

export interface CreateLobbyPayload {
  name: string;
  password?: string | undefined;
}

export interface JoinLobbyPayload {
  lobbyId: string;
  password?: string | undefined;
}

/** Événements émis par le serveur vers les clients. */
export interface ServerToClientEvents {
  /** Liste des lobbys disponibles envoyée lors de la connexion. */
  lobbiesList: (lobbies: LobbyInfo[]) => void;
  /** Le joueur a rejoint ou créé avec succès un lobby. */
  joinedLobby: (lobbyId: string) => void;
  lobby: (lobby: LobbyState) => void;
  /** Indique au client quel joueur il contrôle (peut changer après réindexation). */
  assigned: (playerId: number) => void;
  state: (state: GameState) => void;
  errorMsg: (message: string) => void;
  /** Le joueur a été exclu du lobby par l'hôte ou a quitté la partie. */
  kicked: (reason: string) => void;
  /** Secondes restantes au tour courant (null = pas de limite de temps). */
  turnTimer: (seconds: number | null) => void;
  /** État du vote de fin en cours (null = aucun vote actif). */
  endVote: (vote: EndVoteState | null) => void;
  /** Un nouveau message dans le chat ou l'historique d'actions. */
  chatMessage: (msg: ChatMessage) => void;
}

export interface ClientToServerEvents {
  /** S'authentifie avec le nom de joueur et le sessionId. */
  join: (payload: JoinPayload) => void;
  /** Demande la liste mise à jour des lobbys. */
  getLobbies: () => void;
  /** Crée un nouveau lobby. */
  createLobby: (payload: CreateLobbyPayload) => void;
  /** Tente de rejoindre un lobby spécifique. */
  joinLobby: (payload: JoinLobbyPayload) => void;
  /** Quitte le lobby actuel. */
  leaveLobby: () => void;
  start: () => void;
  action: (action: Action) => void;
  /** L'hôte modifie les réglages de la partie (avant lancement). */
  setSettings: (settings: GameSettings) => void;
  /** L'hôte renvoie la partie au lobby (rejouer sans redémarrer le serveur). */
  reset: () => void;
  /** L'hôte ajoute un joueur IA au lobby. */
  addBot: () => void;
  /** L'hôte retire le dernier joueur IA du lobby. */
  removeBot: () => void;
  /** L'hôte exclut un joueur (humain ou IA) du lobby, avant lancement. */
  kick: (playerId: number) => void;
  /** Un humain lance un vote pour terminer la partie (mode infini). */
  endVoteStart: () => void;
  /** Un humain vote pour/contre la fin de partie. */
  endVoteCast: (approve: boolean) => void;
  /** Envoi d'un message dans le chat. */
  sendChat: (text: string) => void;
}
