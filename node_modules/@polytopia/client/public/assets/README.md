# Assets graphiques

Le rendu est en **vraie 3D** (React-Three-Fiber). Les unités sont aujourd'hui
dessinées par des **formes géométriques procédurales** ; tu peux les remplacer,
**une par une**, par de vrais **modèles 3D** (`.glb`). Tant qu'un modèle est
absent ou non enregistré, l'unité garde son rendu procédural — donc aucun risque,
tu peux avancer au fur et à mesure.

## Modèles d'unités (.glb) — recommandé

1. Dépose le fichier ici : `client/public/assets/units/<type>.glb`
   (types : `guerrier archer cavalier defenseur epeiste catapulte chevalier geant`).
2. Enregistre-le dans **`client/src/three/models.ts`** :

   ```ts
   export const UNIT_MODELS = {
     guerrier: { url: "/assets/units/guerrier.glb", scale: 0.4, y: 0, rotationY: 0 },
   };
   ```

   - `scale` : l'unité doit « tenir » dans ~0,5 unité de large (ajuste à l'œil).
   - `y` : remonte/descend pour poser les pieds au sol.
   - `rotationY` : oriente le modèle (radians) pour qu'il regarde « vers l'avant ».

3. C'est tout : le disque à la **couleur du joueur** et la **barre de vie** restent
   gérés par le jeu, par-dessus ton modèle. Si le fichier est introuvable/cassé,
   le rendu retombe automatiquement sur le procédural.

**Format conseillé :** `.glb` (binaire, tout-en-un), **sans compression Draco**
(sinon il faut configurer un décodeur), low-poly, style cartoon, échelle ~1 unité
de haut, origine aux pieds, +Z vers l'avant. Garde des fichiers légers (< ~1–2 Mo).

## Où trouver / générer des modèles

- **Bibliothèques gratuites (CC0 / libres)** : [Kenney](https://kenney.nl/assets)
  (packs « low-poly » parfaits pour ce style), [Poly Pizza](https://poly.pizza),
  [Quaternius](https://quaternius.com). Télécharge en `.glb`/`.gltf`.
- **Sketchfab** : énormément de modèles (filtre licence « downloadable » + compatible).
- **Créer soi-même** : [Blender](https://www.blender.org) (gratuit) → *File ▸ Export ▸
  glTF 2.0 (.glb)*. Coche « +Y up », applique les transforms (Ctrl+A) avant export.
- **Génération assistée** : outils text-to-3D (ex. Meshy, Luma Genie, Rodin) — exporte
  en `.glb`, puis allège le maillage dans Blender si besoin.
- **Optimiser** : `gltf-transform` ou `gltfpack` (CLI) pour réduire le poids.

> Astuce : commence par **1 ou 2 unités** (guerrier, géant), vérifie l'échelle/orientation
> en jeu, puis complète. Garde un style et une palette cohérents entre les 8 unités.

## (Hérité) Système PNG 2D

L'ancien rendu isométrique 2D (dossier `client/src/canvas/`) n'est plus utilisé.
Les PNG `terrain/ units/ resources/ city/` ne sont donc pas chargés par la 3D.
