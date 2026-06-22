/**
 * Combat (cf. §6) — formule type Polytopia, PURE et DÉTERMINISTE (pas de RNG).
 *
 * Le HP courant module la force : une unité blessée frappe et défend moins fort.
 * Riposte uniquement au corps-à-corps (attaquant adjacent et défenseur survivant).
 */
import type { GameState, Unit } from "@polytopia/shared";
/** PV maximum d'une unité (= stat de base de son type). */
export declare function maxHp(unit: Unit): number;
/**
 * Bonus de défense d'une unité selon sa case : ville ou terrain (forêt/montagne).
 * On garde le MEILLEUR bonus applicable (pas de cumul). 1 = aucun bonus.
 */
export declare function getDefenseBonus(state: GameState, defender: Unit): number;
export interface CombatResult {
    /** Dégâts infligés au défenseur. */
    defenderDamage: number;
    /** Dégâts de riposte infligés à l'attaquant (0 si pas de riposte). */
    attackerDamage: number;
    /** Le défenseur meurt-il ? */
    defenderDies: boolean;
    /** L'attaquant meurt-il (de la riposte) ? */
    attackerDies: boolean;
}
/**
 * Calcule l'issue d'une attaque.
 * @param isMelee attaque au corps-à-corps (attaquant adjacent) -> riposte possible.
 */
export declare function computeCombat(attacker: Unit, defender: Unit, isMelee: boolean, defenseBonus?: number): CombatResult;
//# sourceMappingURL=combat.d.ts.map