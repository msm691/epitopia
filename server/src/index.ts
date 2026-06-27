/**
 * Point d'entrée du serveur autoritaire.
 * L'hôte lance ce serveur ; les autres joueurs rejoignent via ws://<ip-locale>:<port>.
 */

import { createGameServer } from "./gameServer.js";

const PORT = Number(process.env.PORT ?? 3001);

createGameServer(PORT).then((server) => {
  console.log(`[server] Epitopia — en écoute sur le port ${server.port}`);
});
