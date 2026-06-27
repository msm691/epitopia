/**
 * Modèles 3D (.glb/.gltf) des unités — système de REPLI.
 *
 * Par défaut cette table est VIDE : chaque unité est rendue par ses formes
 * procédurales (Units.tsx). Dès que tu déposes un modèle dans
 * `client/public/assets/units/` ET que tu l'enregistres ici, l'unité concernée
 * utilise ce modèle ; les autres restent procédurales. Si le fichier est
 * introuvable ou invalide, le rendu retombe automatiquement sur le procédural
 * (Suspense + garde d'erreur dans Units.tsx) — donc jamais de crash.
 *
 * Réglages par type :
 *  - `url`       : chemin public du modèle (sous client/public/).
 *  - `scale`     : facteur d'échelle (l'unité « tient » dans ~0.5 unité de large).
 *  - `y`         : décalage vertical (pour poser les pieds au sol).
 *  - `rotationY` : rotation autour de l'axe vertical (orienter le modèle).
 */

import { useGLTF } from "@react-three/drei";
import type { UnitType } from "@polytopia/shared";

export interface UnitModelConfig {
  url: string;
  scale?: number;
  y?: number;
  rotationY?: number;
}

export const UNIT_MODELS: Partial<Record<UnitType, UnitModelConfig>> = {
  // Test : modèle Meshy du guerrier. Ajuste scale/y/rotationY à l'œil en jeu.
  guerrier: { url: "/assets/units/guerrier.glb", scale: 0.32, y: 0.34, rotationY: 0 },
  archer: { url: "/assets/units/archer.glb", scale: 0.32, y: 0.34, rotationY: 0 },
  epeiste: { url: "/assets/units/epeiste.glb", scale: 0.32, y: 0.34, rotationY: 0 },
  defenseur: { url: "/assets/units/defenseur.glb", scale: 0.32, y: 0.34, rotationY: 0 },
  cavalier: { url: "/assets/units/cavalier.glb", scale: 0.34, y: 0.36, rotationY: 0 },
  chevalier: { url: "/assets/units/chevalier.glb", scale: 0.36, y: 0.38, rotationY: 0 },
  catapulte: { url: "/assets/units/catapulte.glb", scale: 0.34, y: 0.18, rotationY: 0 },
  geant: { url: "/assets/units/geant.glb", scale: 0.5, y: 0.52, rotationY: 0 },
};

/**
 * Modèles 3D des sages (PNJ), indexés par NOM de sage (cf. SAGE_NAMES côté shared :
 * "Stan", "Nico"). Vide => silhouette procédurale. Mêmes réglages que les unités.
 */
export const SAGE_MODELS: Record<string, UnitModelConfig> = {
  Stan: { url: "/assets/sages/stan.glb", scale: 0.4, y: 0.42, rotationY: 0 },
  Nico: { url: "/assets/sages/nico.glb", scale: 0.4, y: 0.42, rotationY: 0 },
};

/**
 * Modèles de VILLE par palier de niveau (ex. hameau → bourg → cité) : on prend
 * le plus haut `minLevel` ≤ niveau de la ville. Vide => bâtiments procéduraux.
 * Le drapeau, les murailles, marqueurs et le pseudo restent gérés par le jeu.
 */
export interface CityModelTier extends UnitModelConfig {
  minLevel: number;
}
export const CITY_MODELS: CityModelTier[] = [
  // { minLevel: 1, url: "/assets/buildings/hameau.glb", scale: 0.4, y: 0 },
  // { minLevel: 3, url: "/assets/buildings/bourg.glb",  scale: 0.45, y: 0 },
  // { minLevel: 5, url: "/assets/buildings/cite.glb",   scale: 0.5, y: 0 },
];

/** Modèle de ville adapté au niveau (ou undefined => procédural). */
export function cityModelFor(level: number): UnitModelConfig | undefined {
  let best: CityModelTier | undefined;
  for (const t of CITY_MODELS) {
    if (level >= t.minLevel && (!best || t.minLevel > best.minLevel)) best = t;
  }
  return best;
}

/** Modèle du VILLAGE neutre à capturer. Vide => huttes procédurales. */
export const VILLAGE_MODEL: UnitModelConfig | undefined = undefined;
// ex : { url: "/assets/buildings/village.glb", scale: 0.4, y: 0 };

/** Modèle de la BARQUE (unité embarquée sur l'eau). Vide => coque procédurale. */
export const BOAT_MODEL: UnitModelConfig | undefined = {
  url: "/assets/units/bateau.glb",
  scale: 0.4,
  y: 0.12,
  rotationY: 0,
};

/** Pré-charge les modèles enregistrés (à appeler une fois, ex. au montage). */
export function preloadUnitModels(): void {
  const all: (UnitModelConfig | undefined)[] = [
    ...Object.values(UNIT_MODELS),
    ...Object.values(SAGE_MODELS),
    ...CITY_MODELS,
    VILLAGE_MODEL,
    BOAT_MODEL,
  ];
  for (const cfg of all) if (cfg) useGLTF.preload(cfg.url);
}
