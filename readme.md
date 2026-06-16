# 🌍 EpiTopia - Web 4X Strategy Game

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)

EpiTopia est un jeu vidéo de stratégie au tour par tour (4X : eXploration, eXpansion, eXploitation, eXtermination) entièrement jouable sur navigateur. Fortement inspiré du jeu Polytopia, ce projet a été développé dans le cadre d'un projet académique (Projet HUB).

Il propose des parties multijoueurs en temps réel ainsi qu'une intelligence artificielle pour compléter les parties jusqu'à 8 joueurs sur une carte générée aléatoirement.

---

## ✨ Fonctionnalités Principales

*   **Multijoueur Temps Réel :** Affrontez un autre joueur en LAN ou en ligne grâce à une synchronisation ultra-rapide via WebSockets (`Socket.io`).
*   **Intelligence Artificielle :** Un système de machine à états finis contrôle jusqu'à 6 adversaires (bots) capables d'explorer, de récolter et d'attaquer.
*   **Génération Procédurale :** Chaque partie génère une nouvelle grille isométrique/2D avec des biomes variés (plaines, montagnes, eau) et un brouillard de guerre.
*   **Économie et Évolution :** 
    *   4 ressources de base (Pommes, Bois, Poisson, Minerai) et 4 avancées.
    *   Un arbre technologique à 5 branches pour débloquer de nouvelles compétences.
*   **Armée :** 4 types d'unités de base (Guerrier, Archer, Cavalier, Défenseur) pouvant évoluer vers des classes supérieures avec des statistiques propres.

---

## 🛠️ Stack Technique & Architecture

Le projet est structuré en **Monorepo** via `npm workspaces`, permettant de partager facilement la logique métier et le typage strict entre le client et le serveur.

*   **Frontend :** React + TypeScript (Interface utilisateur) & HTML5 Canvas (Moteur de rendu 2D).
*   **Backend :** Node.js + Socket.io (Serveur de jeu, validation des actions, WebSockets).
*   **Shared :** Modèles de données (GameState), logique de jeu pure et interfaces TypeScript communes.

### Arborescence du projet

```text
/
├── packages/
│   ├── client/       # Application React (UI + Canvas)
│   ├── server/       # Serveur Node.js / Socket.io
│   └── shared/       # Logique de jeu, algorithmes et interfaces TS
├── package.json      # Configuration du workspace npm
└── README.md
```

---

## 🚀 Installation et Lancement

### Prérequis
*   [Node.js](https://nodejs.org/) (version 16 ou supérieure recommandée)
*   npm (inclus avec Node.js)

### 1. Cloner le dépôt

```bash
git clone [https://github.com/msm691/epitopia.git](https://github.com/msm691/epitopia.git)
cd epitopia
```

### 2. Installer les dépendances
Grâce aux workspaces npm, une seule commande permet d'installer les dépendances du client, du serveur et du dossier partagé :

```bash
npm install
```

### 3. Lancer l'environnement de développement
Pour lancer simultanément le serveur Node.js et l'application React :

```bash
npm run dev
```

*   Le client sera accessible sur : `http://localhost:3000` (ou port spécifié par Vite/Create React App).
*   Le serveur écoutera sur : `http://localhost:4000`.

---

## 🎮 Comment jouer ?

1.  Ouvrez le jeu dans votre navigateur (PC ou Mobile).
2.  Créez une partie ou rejoignez la salle d'un ami.
3.  **À votre tour :** Cliquez sur l'une de vos unités pour la déplacer ou attaquer. Cliquez sur une case ressource pour la récolter si vous avez la technologie requise.
4.  Gérez vos points pour débloquer des technologies et faire évoluer votre civilisation.
5.  Cliquez sur **Fin de Tour** pour passer la main (aux autres joueurs ou à l'IA).
6.  Le dernier empire en vie remporte la partie !

---

## 👨‍💻 Auteurs

*   **Marley Sedlak-Martin** - *Développement & Architecture* - [GitHub](https://github.com/msm691)
*   **Sacha Bonnet** - *Développement & Architecture* - [GitHub](https://github.com/jezybuz)

*Projet réalisé pour le Hub Epitech.*
