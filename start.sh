#!/usr/bin/env bash
#
# Lance le serveur autoritaire + le client (dev) en une commande.
# Ctrl+C arrête les deux. Affiche l'URL à partager sur le réseau local (LAN).
#
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3001}"

# IP locale (macOS d'abord, puis Linux en repli) pour jouer en LAN.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"

# Installe les dépendances au premier lancement.
if [ ! -d node_modules ]; then
  echo "📦 Installation des dépendances (premier lancement)…"
  npm install
fi

# Arrête le serveur (et tout le groupe) quand on quitte.
cleanup() {
  echo ""
  echo "🛑 Arrêt…"
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "🚀 Démarrage du serveur (port $PORT)…"
PORT="$PORT" npm run dev:server &
SERVER_PID=$!

# Laisse le serveur démarrer.
sleep 1

echo ""
echo "==================== Epitopia ===================="
echo "  Cet appareil  : http://localhost:5173"
echo "  Autres (LAN)  : http://$LAN_IP:5173"
echo "  Serveur       : http://$LAN_IP:$PORT"
echo "  (dans le client, champ Serveur = http://$LAN_IP:$PORT)"
echo "================================================="
echo ""

# Le client tourne au premier plan ; quitter (Ctrl+C) coupe aussi le serveur.
npm run dev
