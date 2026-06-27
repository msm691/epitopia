# 🌍 Epitopia — Multiplayer 4X Strategy Game

Epitopia is a fully-featured, turn-based 4X multiplayer strategy game built from scratch with web technologies. Expand your empire, manage resources, research technologies, and conquer your opponents in a procedurally generated world.

## ✨ Key Features

### 🗺️ Dynamic World & Exploration
* **Procedural Generation**: Every match features a uniquely generated map using Perlin noise, complete with various biomes (Plains, Forests, Mountains, Sand, Water).
* **Fog of War**: Real-time visibility system. Unexplored areas remain dark until scouted.
* **Natural Wonders**: Discover and claim giant structures like the **Great Volcano** or **Sacred Oasis** to gain massive economic and cultural advantages.

### ⚔️ RPG Hero & Tactical Combat
* **Leveling System**: Your starting unit is a unique Hero that gains XP and levels up through combat.
* **Ancient Ruins & Artifacts**: Send your Hero to explore ruins and equip Legendary Artifacts (e.g., Fire Swords, Ancient Shields) for permanent stat boosts.
* **Advanced Combat Mechanics**: Features retaliation damage, terrain-based defensive bonuses, and veteran status.

### 🏛️ Empire Management
* **Strategic Resources**: Mine Iron and breed Horses to unlock advanced military units like Swordsmen and Knights.
* **Trade Routes**: Build physical roads to connect cities to your capital, halving movement costs and generating bonus gold.
* **Cultural Doctrines**: Generate Culture (🎭) to unlock powerful empire-wide passive Doctrines (e.g., Fanaticism, Builders).
* **Tech Tree**: Research new technologies to unlock buildings, units, and economic upgrades.

### 🤖 Smart AI Opponents
* **A* Pathfinding**: Bots intelligently navigate the terrain and bypass obstacles.
* **Dynamic Diplomacy**: AI players will propose peace, but won't hesitate to break alliances if they sense weakness.
* **Survival Instincts**: AI will construct emergency walls when enemy armies approach their borders and will rush strategic metal nodes.

### 🌐 Server Architecture & Multiplayer
* **Real-Time Networking**: Powered by `Socket.io` for instant state synchronization.
* **Multi-Lobby System**: A built-in server browser allows dozens of players to create, list, and join independent game sessions simultaneously.
* **Secure Private Rooms**: Support for password-protected lobbies using client-side SHA-256 Web Crypto hashing.
* **Seamless Reconnection**: `sessionId` caching via `localStorage` ensures players can refresh the page or recover from disconnects without losing their spot in an ongoing game.

## 🚀 Deployment
Epitopia is designed to run seamlessly on both HTTP and HTTPS environments (compatible with reverse proxies like Caddy or Nginx). Simply run the server on port `3001` and serve the built Vite client.