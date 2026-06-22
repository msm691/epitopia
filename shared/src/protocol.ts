/**
 * Protocole réseau partagé client <-> serveur (socket.io).
 * Le serveur est autoritaire : le client envoie des Actions, le serveur valide,
 * applique et diffuse le GameState. Aucune règle de jeu ici.
 */

import type { Action } from "./actions.js";
import type { GameState } from "./types.js";

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
}

export interface JoinPayload {
  name: string;
  color: string;
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
}

/** Événements émis par les clients vers le serveur. */
export interface StartOptions {
  /** Tour limite ; null = partie illimitée. Défaut serveur si omis. */
  turnLimit?: number | null | undefined;
}

export interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
  start: (opts?: StartOptions) => void;
  action: (action: Action) => void;
  /** L'hôte renvoie la partie au lobby (rejouer sans redémarrer le serveur). */
  reset: () => void;
  /** L'hôte ajoute un joueur IA au lobby. */
  addBot: () => void;
  /** L'hôte retire le dernier joueur IA du lobby. */
  removeBot: () => void;
  /** L'hôte exclut un joueur (humain ou IA) du lobby, avant lancement. */
  kick: (playerId: number) => void;
}
