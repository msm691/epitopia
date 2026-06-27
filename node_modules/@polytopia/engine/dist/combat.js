/**
 * Combat (cf. §6) — formule type Polytopia, PURE et DÉTERMINISTE (pas de RNG).
 *
 * Le HP courant module la force : une unité blessée frappe et défend moins fort.
 * Riposte uniquement au corps-à-corps (attaquant adjacent et défenseur survivant).
 */
import { DEFENSE_BONUS_CITY, DEFENSE_BONUS_TERRAIN, DEFENSE_BONUS_WALL, UNIT_STATS, WALL_DAMAGE_SCALE, } from "@polytopia/shared";
import { tileAt } from "./units.js";
/** Facteur d'échelle de la formule Polytopia. */
const FORCE_SCALE = 4.5;
/** PV maximum d'une unité (= stat de base de son type). */
export function maxHp(unit) {
    return UNIT_STATS[unit.type].hp;
}
export function getUnitAttack(state, unit) {
    let atk = unit.isEmbarked ? 1 : unit.attack;
    const player = state.players.find(p => p.id === unit.ownerId);
    if (player?.culturalDoctrines?.includes("fanatisme")) {
        atk += 1;
    }
    return atk;
}
export function getUnitDefense(unit) {
    return unit.isEmbarked ? 1 : unit.defense;
}
/**
 * Dégâts qu'une unité inflige à un REMPART (siège). Pas de riposte du rempart.
 * Force modulée par les PV de l'attaquant ; au moins 1. Catapulte/géant excellent.
 */
export function computeWallDamage(state, attacker) {
    const force = getUnitAttack(state, attacker) * (attacker.hp / maxHp(attacker)) * WALL_DAMAGE_SCALE;
    return Math.max(1, Math.round(force));
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
    if (state.builtWonders.some(w => w.type === "colosse" && w.ownerId === defender.ownerId)) {
        bonus += 1.0;
    }
    return bonus;
}
/**
 * Calcule l'issue d'une attaque.
 * @param isMelee attaque au corps-à-corps (attaquant adjacent) -> riposte possible.
 */
export function computeCombat(state, attacker, defender, isMelee, defenseBonus = 1) {
    const attStat = getUnitAttack(state, attacker);
    const defStat = getUnitDefense(defender);
    const attackForce = attStat * (attacker.hp / maxHp(attacker));
    const defenseForce = defStat * (defender.hp / maxHp(defender)) * defenseBonus;
    const total = attackForce + defenseForce;
    if (total <= 0) {
        return { defenderDamage: 0, attackerDamage: 0, defenderDies: false, attackerDies: false };
    }
    // Plancher : une attaque réelle inflige TOUJOURS au moins 1 dégât (jamais 0
    // « pour rien »). Sans force d'attaque, on laisse 0.
    const rawDamage = Math.round((attackForce / total) * attStat * FORCE_SCALE);
    const defenderDamage = attackForce > 0 ? Math.max(1, rawDamage) : rawDamage;
    const defenderDies = defender.hp - defenderDamage <= 0;
    // Riposte seulement si corps-à-corps ET défenseur survivant.
    let attackerDamage = 0;
    let attackerDies = false;
    if (!defenderDies && isMelee) {
        attackerDamage = Math.round((defenseForce / total) * defStat * FORCE_SCALE);
        attackerDies = attacker.hp - attackerDamage <= 0;
    }
    return { defenderDamage, attackerDamage, defenderDies, attackerDies };
}
//# sourceMappingURL=combat.js.map