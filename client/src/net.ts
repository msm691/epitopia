/**
 * Couche réseau client (socket.io). Aucune règle de jeu : transport pur.
 */

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@polytopia/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function connect(url: string): GameSocket {
  // polling + websocket (défaut socket.io) : plus compatible que websocket seul
  // sur certains réseaux mobiles ; upgrade automatique vers ws si possible.
  return io(url, { transports: ["polling", "websocket"], forceNew: true });
}

/** URL de serveur par défaut (même hôte que la page, port 3001). */
export function defaultServerUrl(): string {
  const host = window.location.hostname || "localhost";
  return `http://${host}:3001`;
}
