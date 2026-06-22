/**
 * Combat (cf. §6) — formule type Polytopia, PURE et DÉTERMINISTE (pas de RNG).
 *
 * Le HP courant module la force : une unité blessée frappe et défend moins fort.
 * Riposte uniquement au corps-à-corps (attaquant adjacent et défenseur survivant).
 */
import { DEFENSE_BONUS_CITY, DEFENSE_BONUS_TERRAIN, DEFENSE_BONUS_WALL, UNIT_STATS, } from "@polytopia/shared";
import { tileAt } from "./units.js";
/** Facteur d'échelle de la formule Polytopia. */
const FORCE_SCALE = 4.5;
/** PV maximum d'une unité (= stat de base de son type). */
export function maxHp(unit) {
    return UNIT_STATS[unit.type].hp;
}
/**
 * Bonus de défense d'une unité selon sa case : ville ou terrain (forêt/montagne).
 * On garde le MEILLEUR bonus applicable (pas de cumul). 1 = aucun bonus.
 */
export function getDefenseBonus(state, defender) {
    const tile = tileAt(state, defender.x, defender.y);
    if (!tile)
        return 1;
    let bonus = 1;
    if (tile.cityId !== undefined) {
        const city = state.cities.find((c) => c.id === tile.cityId);
        bonus = Math.max(bonus, city?.hasWall ? DEFENSE_BONUS_WALL : DEFENSE_BONUS_CITY);
    }
    if (tile.terrain === "foret" || tile.terrain === "montagne") {
        bonus = Math.max(bonus, DEFENSE_BONUS_TERRAIN);
    }
    return bonus;
}
/**
 * Calcule l'issue d'une attaque.
 * @param isMelee attaque au corps-à-corps (attaquant adjacent) -> riposte possible.
 */
export function computeCombat(attacker, defender, isMelee, defenseBonus = 1) {
    const attackForce = attacker.attack * (attacker.hp / maxHp(attacker));
    const defenseForce = defender.defense * (defender.hp / maxHp(defender)) * defenseBonus;
    const total = attackForce + defenseForce;
    if (total <= 0) {
        return { defenderDamage: 0, attackerDamage: 0, defenderDies: false, attackerDies: false };
    }
    const defenderDamage = Math.round((attackForce / total) * attacker.attack * FORCE_SCALE);
    const defenderDies = defender.hp - defenderDamage <= 0;
    // Riposte seulement si corps-à-corps ET défenseur survivant.
    let attackerDamage = 0;
    let attackerDies = false;
    if (!defenderDies && isMelee) {
        attackerDamage = Math.round((defenseForce / total) * defender.defense * FORCE_SCALE);
        attackerDies = attacker.hp - attackerDamage <= 0;
    }
    return { defenderDamage, attackerDamage, defenderDies, attackerDies };
}
//# sourceMappingURL=combat.js.map