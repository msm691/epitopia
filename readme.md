# Polytopia Clone

Clone web simplifié de *The Battle of Polytopia* — jeu tour par tour, 2 joueurs LAN + IA (jusqu'à 8).

## Architecture

Monorepo npm workspaces. Frontières strictes :

| Package   | Rôle                                                              | Dépend de        |
| --------- | ---------------------------------------------------------------- | ---------------- |
| `shared`  | Types & constantes partagés (Tile, Unit, GameState, Action…)     | —                |
| `engine`  | Logique de jeu **PURE** : `applyAction` / `isLegal`, carte, RNG  | `shared`         |
| `server`  | Autorité réseau (WebSocket), valide/applique les actions         | `shared`,`engine`|
| `client`  | Rendu Canvas 2D + UI React + lobby                               | `shared`,`engine`|

`engine` ne touche **jamais** au DOM ni au réseau. Tout changement d'état passe par
`applyAction(state, action)`, validé par `isLegal(state, action)`. Tout hasard passe par un RNG seedé.

## Prérequis

- Node.js >= 20

## Commandes

```bash
npm install        # installe tous les workspaces
npm run dev        # lance le client (Vite) -> http://localhost:5173
npm test           # lance les tests Vitest
npm run typecheck  # vérifie le typage TS strict de tous les packages
```
