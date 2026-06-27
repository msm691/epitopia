/**
 * Arbre de technologie (cf. §6) : 6 branches de 2 paliers (>= 5 requis).
 * Données PURES (pas de logique) ; le coût et la validation vivent dans engine.
 *
 * Chaque tech débloque éventuellement des unités / ressources / améliorations,
 * consommés par TRAIN_UNIT (2b) et HARVEST_RESOURCE (2c).
 */
import type { Resource, UnitType } from "./types.js";
export type TechId = "chasse" | "archerie" | "peche" | "navigation" | "agriculture" | "construction" | "escalade" | "forge" | "equitation" | "chevalerie" | "strategie" | "tactique";
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
export declare const TECHS: Record<TechId, TechDef>;
/** Coût d'une tech : croît avec le palier ET le nombre de villes (anti rush). */
export declare const TECH_BASE_COST = 4;
//# sourceMappingURL=tech.d.ts.map