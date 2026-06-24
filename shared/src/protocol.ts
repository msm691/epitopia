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
  /** Taille de carte forcée ; null = automatique selon le nombre de joueurs. */
  mapSize: number | null;
  /** Type de carte (proportion terre/eau). */
  mapType: MapType;
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

/** Un joueur tel que vu dans le lobby (avant/pendant la partie). */
export interface LobbyPlayer {
  id: number;
  name: string;
  color: string;
  connected: boolean;
  isAI: boolean;
}

export interface LobbyState {
  players: LobbyPlayer[];
  /** Id de l'hôte (celui qui peut lancer la partie). */
  hostId: number | null;
  started: boolean;
  maxPlayers: number;
  /** Réglages de la partie (modifiables par l'hôte avant le lancement). */
  settings: GameSettings;
}

export interface JoinPayload {
  name: string;
  /** La couleur est désormais attribuée par le serveur (aléatoire + unique). */
}

/** Événements émis par le serveur vers les clients. */
export interface ServerToClientEvents {
  lobby: (lobby: LobbyState) => void;
  /** Indique au client quel joueur il contrôle (peut changer après réindexation). */
  assigned: (playerId: number) => void;
  state: (state: GameState) => void;
  errorMsg: (message: string) => void;
  /** Le joueur a été exclu du lobby par l'hôte. */
  kicked: (reason: string) => void;
  /** Secondes restantes au tour courant (null = pas de limite de temps). */
  turnTimer: (seconds: number | null) => void;
  /** État du vote de fin en cours (null = aucun vote actif). */
  endVote: (vote: EndVoteState | null) => void;
}

export interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
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
}
