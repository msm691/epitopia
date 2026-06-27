<div align="center">
  <h1>👑 Epitopia</h1>
  <p><b>Jeu de stratégie 4X Multijoueur au tour par tour, jouable directement sur navigateur !</b></p>
  
  [![Jouer à Epitopia](https://img.shields.io/badge/Jouer%20maintenant%20sur-epitopia.fr-blue?style=for-the-badge&logo=google-chrome)](https://epitopia.fr)
</div>

---

## 🌍 Présentation

**Epitopia** est un jeu de stratégie 4X (eXplore, eXpand, eXploit, eXterminate) complet, développé avec les technologies web modernes. Prenez le contrôle d'une civilisation, explorez un monde généré procéduralement, gérez vos ressources, développez vos technologies et menez vos armées à la victoire contre des intelligences artificielles ou d'autres joueurs en temps réel.

Découvrez des merveilles naturelles, fouillez des ruines antiques avec votre Héros, fondez de nouvelles villes, et nouez des alliances diplomatiques dans un univers 3D vibrant !

---

## ✨ Fonctionnalités Principales

### 🗺️ Monde Dynamique & Exploration
* **Génération Procédurale** : Chaque partie se déroule sur une carte unique (Bruit de Perlin) avec divers biomes (plaines, forêts, montagnes, sable, eau).
* **Brouillard de Guerre** : Système de vision en temps réel. Les zones inexplorées restent cachées jusqu'à ce que vos troupes les découvrent.
* **Merveilles Naturelles** : Découvrez des structures uniques (Grand Volcan, Oasis Sacrée) offrant des bonus massifs d'économie et de culture.

### ⚔️ Combats Tactiques & Héros RPG
* **Héros & Niveau** : Vous commencez avec une unité Héroïque unique qui gagne de l'XP et monte de niveau au fil des combats.
* **Ruines Antiques & Artefacts** : Envoyez votre Héros explorer des ruines pour trouver des artefacts légendaires (Épée de Feu, Bouclier Ancien) offrant des bonus de statistiques permanents.
* **Combats Avancés** : Gestion des dégâts de riposte, des bonus défensifs liés au terrain (montagnes, forêts, murs) et des grades de vétéran.

### 🏛️ Gestion d'Empire
* **Arbre des Technologies** : Investissez vos étoiles pour débloquer de nouvelles troupes, bâtiments et améliorations économiques.
* **Ressources Stratégiques** : Exploitez le Fer et élevez des Chevaux pour recruter des unités militaires avancées (Épéistes, Chevaliers).
* **Routes Commerciales** : Reliez vos villes à la capitale pour réduire les coûts de déplacement et générer de l'or supplémentaire.
* **Doctrines Culturelles** : Générez de la Culture (🎭) pour débloquer de puissantes doctrines passives (ex: Bâtisseurs, Fanatisme).

### 🤝 Diplomatie & IA Intelligente
* **Système de Diplomatie** : Envoyez des requêtes d'alliance aux autres joueurs. Trahissez-les ou gagnez ensemble !
* **IA Implacable** : Des bots capables de naviguer intelligemment, de construire des remparts en urgence si menacés, et de sécuriser les ressources stratégiques.

### ⚡ Mode Performance Inclus
Pour que le jeu soit accessible à **tous les PC**, Epitopia intègre un **bouton "Mode Performance"**. En un clic, l'environnement 3D bascule dans une version ultra-allégée :
* Désactivation de l'éclairage complexe et du post-processing (Bloom).
* Animations désactivées (eau, interface, troupes au repos).
* Permet aux très vieux ordinateurs et aux PC portables sans carte graphique de jouer de manière totalement fluide à 60 FPS !

---

## 🛠️ Stack Technique

Epitopia a été conçu de A à Z avec un moteur développé sur mesure pour le web :
* **Frontend 3D** : React, React-Three-Fiber (Three.js), Vite.
* **Backend** : Node.js, TypeScript.
* **Multijoueur Temps Réel** : `Socket.io` pour une synchronisation instantanée de l'état du jeu.
* **Lobby & Sécurité** : Navigateur de serveurs intégré, support de salles privées par mot de passe crypté côté client (SHA-256). Reconnexion automatique et transparente en cas de rafraîchissement de page.

---

## 🚀 Lancer le jeu en local

Vous souhaitez héberger votre propre serveur ou contribuer au code ?
Epitopia est conçu pour tourner très facilement.

**Prérequis** : Node.js 18+ installé.

1. **Cloner le projet**
   ```bash
   git clone https://github.com/msm691/epitopia.git
   cd epitopia
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Lancer le backend (Serveur)**
   ```bash
   npm run dev --workspace server
   ```
   *Le serveur écoutera sur le port 3001.*

4. **Lancer le frontend (Client)**
   ```bash
   npm run dev --workspace client
   ```
   *Le jeu sera accessible sur `http://localhost:5173`.*

---

<div align="center">
  <b>Développé avec ❤️ pour la communauté de stratégie.</b><br>
  👉 <a href="https://epitopia.fr">Rejoignez l'aventure sur epitopia.fr</a>
</div>