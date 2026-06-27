/**
 * Arbre de technologie (cf. §6) : 6 branches de 2 paliers (>= 5 requis).
 * Données PURES (pas de logique) ; le coût et la validation vivent dans engine.
 *
 * Chaque tech débloque éventuellement des unités / ressources / améliorations,
 * consommés par TRAIN_UNIT (2b) et HARVEST_RESOURCE (2c).
 */

import type { Resource, UnitType } from "./types.js";

export type TechId =
  | "chasse"
  | "archerie"
  | "peche"
  | "navigation"
  | "agriculture"
  | "construction"
  | "escalade"
  | "forge"
  | "equitation"
  | "chevalerie"
  | "strategie"
  | "tactique";

export interface TechDef {
  id: TechId;
  name: string;
  /** Palier (1 = base, 2 = avancé). */
  tier: 1 | 2;
  /** Numéro de branche (1..6), pour l'affichage. */
  branch: number;
  /** Tech prérequise (même branche, palier inférieur) ou null. */
  requires: TechId | null;
  unlocksUnits: readonly UnitType[];
  unlocksResources: readonly Resource[];
  /** Débloque les améliorations de ville (Construction). */
  unlocksImprovements: boolean;
}

export const TECHS: Record<TechId, TechDef> = {
  // Branche 1 — Chasse -> Archerie
  chasse: { id: "chasse", name: "Chasse", tier: 1, branch: 1, requires: null, unlocksUnits: ["archer"], unlocksResources: ["gibier"], unlocksImprovements: false },
  archerie: { id: "archerie", name: "Archerie", tier: 2, branch: 1, requires: "chasse", unlocksUnits: ["catapulte"], unlocksResources: ["bois"], unlocksImprovements: false },
  // Branche 2 — Pêche -> Navigation
  peche: { id: "peche", name: "Pêche", tier: 1, branch: 2, requires: null, unlocksUnits: [], unlocksResources: ["poisson"], unlocksImprovements: false },
  navigation: { id: "navigation", name: "Navigation", tier: 2, branch: 2, requires: "peche", unlocksUnits: [], unlocksResources: [], unlocksImprovements: false },
  // Branche 3 — Agriculture -> Construction
  agriculture: { id: "agriculture", name: "Agriculture", tier: 1, branch: 3, requires: null, unlocksUnits: [], unlocksResources: ["cereales"], unlocksImprovements: false },
  construction: { id: "construction", name: "Construction", tier: 2, branch: 3, requires: "agriculture", unlocksUnits: [], unlocksResources: [], unlocksImprovements: true },
  // Branche 4 — Escalade -> Forge
  escalade: { id: "escalade", name: "Escalade", tier: 1, branch: 4, requires: null, unlocksUnits: [], unlocksResources: ["minerai"], unlocksImprovements: false },
  forge: { id: "forge", name: "Forge", tier: 2, branch: 4, requires: "escalade", unlocksUnits: ["epeiste"], unlocksResources: ["metal"], unlocksImprovements: false },
  // Branche 5 — Équitation -> Chevalerie
  equitation: { id: "equitation", name: "Équitation", tier: 1, branch: 5, requires: null, unlocksUnits: ["cavalier"], unlocksResources: [], unlocksImprovements: false },
  chevalerie: { id: "chevalerie", name: "Chevalerie", tier: 2, branch: 5, requires: "equitation", unlocksUnits: ["chevalier"], unlocksResources: [], unlocksImprovements: false },
  // Branche 6 — Stratégie -> Tactique
  strategie: { id: "strategie", name: "Stratégie", tier: 1, branch: 6, requires: null, unlocksUnits: ["defenseur"], unlocksResources: [], unlocksImprovements: false },
  tactique: { id: "tactique", name: "Tactique", tier: 2, branch: 6, requires: "strategie", unlocksUnits: ["geant"], unlocksResources: [], unlocksImprovements: false },
};

/** Coût d'une tech : croît avec le palier ET le nombre de villes (anti rush). */
export const TECH_BASE_COST = 4;
