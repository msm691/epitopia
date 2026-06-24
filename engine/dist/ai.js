/**
 * IA gloutonne (cf. §6) — PURE et DÉTERMINISTE (aucun RNG, aucun effet de bord).
 * Produit EXACTEMENT les mêmes Actions qu'un humain (même interface).
 *
 * Priorités : capturer une ville > attaquer si avantageux > récolter > recruter
 * > avancer vers l'ennemi (ou se replier si blessé) > chercher une tech > fin de tour.
 * Un peu de stratégie : cible les attaques rentables, replie les unités à bas PV.
 */
import { NAVAL_MOVEMENT, RESOURCE_POP_GAIN, TECHS, UNIT_STATS } from "@polytopia/shared";
import { isLegal } from "./isLegal.js";
import { applyAction } from "./applyAction.js";
import { chebyshev, freeSpawnTileFor, isWaterAt } from "./units.js";
import { computeCombat, getDefenseBonus, maxHp } from "./combat.js";
import { computeTechCost, getPlayerCityCount, playerHasTech, trainableUnitsFor } from "./tech.js";
/** Seuil de PV (fraction du max) en-dessous duquel une unité se replie. */
const RETREAT_HP_RATIO = 0.4;
/** Garde-fou : nb max d'actions IA par tour. */
const MAX_ACTIONS_PER_TURN = 200;
/** Coordonnées des cibles ennemies (unités + villes adverses). */
function enemyTargets(state, pid) {
    const targets = [];
    for (const u of state.units)
        if (u.ownerId !== pid)
            targets.push({ x: u.x, y: u.y });
    for (const c of state.cities)
        if (c.ownerId !== pid)
            targets.push({ x: c.x, y: c.y });
    return targets;
}
function nearestDist(from, targets) {
    let best = Infinity;
    for (const t of targets)
        best = Math.min(best, chebyshev(from, t));
    return best;
}
/**
 * Meilleur déplacement légal d'une unité vis-à-vis de `targets` :
 * - "toward" : se rapprocher (n'agit que si on fait strictement mieux) ;
 * - "away"   : s'éloigner (repli) ;
 * - "reposition" : n'importe quel pas légal, en privilégiant l'éloignement
 *   (sert à libérer une case-ville pour recruter, sans s'exposer).
 */
function bestMove(state, unit, targets, pref) {
    if (pref !== "reposition" && targets.length === 0)
        return null;
    const from = { x: unit.x, y: unit.y };
    const d0 = nearestDist(from, targets);
    let best = null;
    let bestScore = pref === "toward" ? d0 : pref === "away" ? d0 : -Infinity;
    // La vitesse navale ne vaut que si l'unité est DÉJÀ sur l'eau (embarquée) : on
    // n'explore la portée NAVALE que dans ce cas ; sur terre, portée terrestre
    // (embarquer = 1 case). isLegal écarte de toute façon les coups illégaux.
    const canNavigate = playerHasTech(state, unit.ownerId, "navigation");
    const onWater = isWaterAt(state, unit.x, unit.y);
    const mv = canNavigate && onWater ? Math.max(unit.movement, NAVAL_MOVEMENT) : unit.movement;
    for (let dy = -mv; dy <= mv; dy++) {
        for (let dx = -mv; dx <= mv; dx++) {
            if (dx === 0 && dy === 0)
                continue;
            const to = { x: unit.x + dx, y: unit.y + dy };
            const action = { type: "MOVE_UNIT", unitId: unit.id, to };
            if (!isLegal(state, action))
                continue;
            const d = targets.length > 0 ? nearestDist(to, targets) : 0;
            const better = pref === "toward" ? d < bestScore : pref === "away" ? d > bestScore : d > bestScore;
            if (better) {
                bestScore = d;
                best = action;
            }
        }
    }
    return best;
}
/**
 * Choix de récompense de niveau pour l'IA : une troupe gratuite si l'armée n'est
 * pas encore au plafond et qu'une case d'apparition est libre, sinon un atelier
 * (croissance économique, toujours encaissable).
 */
function chooseReward(state, pid, city, unitCount, cityCount) {
    const armyCap = Math.max(3, cityCount * 3 + 1);
    if (unitCount < armyCap && freeSpawnTileFor(state, city) !== null)
        return "troupe";
    return "atelier";
}
/** Coût de l'unité débloquée la moins chère (Infinity si aucune). */
function cheapestUnitCost(state, pid) {
    let min = Infinity;
    for (const t of trainableUnitsFor(state, pid))
        min = Math.min(min, UNIT_STATS[t].cost);
    return min;
}
/** Y a-t-il de l'eau dans le rayon `r` (Chebyshev) d'une case ? */
function nearWater(state, c, r) {
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (isWaterAt(state, c.x + dx, c.y + dy))
                return true;
        }
    }
    return false;
}
/**
 * L'IA gagnerait-elle à apprendre la Navigation ? Vrai si elle ne l'a pas encore
 * ET qu'une de ses unités/villes borde l'eau (carte maritime : sans la marine,
 * l'IA resterait coincée sur sa terre). Sert à prioriser la recherche.
 */
function aiWantsNavigation(state, pid) {
    if (playerHasTech(state, pid, "navigation"))
        return false;
    for (const u of state.units)
        if (u.ownerId === pid && nearWater(state, u, 2))
            return true;
    for (const c of state.cities)
        if (c.ownerId === pid && nearWater(state, c, 2))
            return true;
    return false;
}
/**
 * Calcule la PROCHAINE action de l'IA `pid` (qui doit être le joueur courant).
 * Toujours une action LÉGALE ; renvoie END_TURN quand il n'y a plus rien d'utile.
 */
export function nextAIAction(state, pid) {
    const myUnits = state.units.filter((u) => u.ownerId === pid);
    const myCities = state.cities.filter((c) => c.ownerId === pid);
    // 1. Capturer une ville ennemie (priorité absolue : condition de victoire).
    for (const u of myUnits) {
        const action = { type: "CAPTURE_CITY", unitId: u.id };
        if (isLegal(state, action))
            return action;
    }
    // 1b. Fonder une ville sur un village où l'on se tient (expansion = revenu + score).
    for (const u of myUnits) {
        const action = { type: "FOUND_CITY", unitId: u.id };
        if (isLegal(state, action))
            return action;
    }
    // 1c. Encaisser les récompenses de niveau en attente (valeur gratuite).
    for (const c of myCities) {
        if ((c.rewardsToPick ?? 0) <= 0)
            continue;
        const reward = chooseReward(state, pid, c, myUnits.length, myCities.length);
        const action = { type: "CLAIM_CITY_REWARD", cityId: c.id, reward };
        if (isLegal(state, action))
            return action;
    }
    // 2. Attaquer si avantageux (tue la cible, ou dégâts nets >= 0).
    let bestAtk = null;
    let bestAtkScore = -Infinity;
    for (const u of myUnits) {
        if (u.hasAttacked)
            continue;
        for (const t of state.units) {
            if (t.ownerId === pid)
                continue;
            const action = { type: "ATTACK", attackerId: u.id, targetId: t.id };
            if (!isLegal(state, action))
                continue;
            const melee = chebyshev(u, t) === 1;
            const r = computeCombat(u, t, melee, getDefenseBonus(state, t));
            if (r.attackerDies && !r.defenderDies)
                continue; // pas de suicide
            const score = r.defenderDies ? 1000 + r.defenderDamage : r.defenderDamage - r.attackerDamage;
            if (score >= 0 && score > bestAtkScore) {
                bestAtkScore = score;
                bestAtk = action;
            }
        }
    }
    if (bestAtk)
        return bestAtk;
    // 3. Récolter la meilleure ressource accessible (croissance économique).
    let bestHarvest = null;
    let bestGain = -1;
    for (const c of myCities) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const at = { x: c.x + dx, y: c.y + dy };
                const action = { type: "HARVEST_RESOURCE", cityId: c.id, at };
                if (!isLegal(state, action))
                    continue;
                const tile = state.tiles[at.y * state.width + at.x];
                const gain = tile?.resource ? RESOURCE_POP_GAIN[tile.resource] : 0;
                if (gain > bestGain) {
                    bestGain = gain;
                    bestHarvest = action;
                }
            }
        }
    }
    if (bestHarvest)
        return bestHarvest;
    // 4. Recruter l'unité la plus forte abordable. Le plafond doit rester AU-DESSUS
    //    du seuil offensif, sinon l'IA plafonne sans jamais pouvoir attaquer.
    const armyCap = Math.max(3, myCities.length * 3 + 1);
    const wantsArmy = myUnits.length < armyCap;
    if (wantsArmy) {
        const unlocked = trainableUnitsFor(state, pid);
        for (const c of myCities) {
            let bestUnit = null;
            let bestCost = -1;
            for (const ut of unlocked) {
                const action = { type: "TRAIN_UNIT", cityId: c.id, unitType: ut };
                if (isLegal(state, action) && UNIT_STATS[ut].cost > bestCost) {
                    bestCost = UNIT_STATS[ut].cost;
                    bestUnit = ut;
                }
            }
            if (bestUnit)
                return { type: "TRAIN_UNIT", cityId: c.id, unitType: bestUnit };
        }
    }
    // 5. Déplacement — POSTURE défensive par défaut (anti-rush) :
    //    on garde une garnison sur chaque ville ; on ne part à l'offensive que
    //    si on a une armée excédentaire (ou plus aucune ville à défendre).
    const enemies = enemyTargets(state, pid);
    const villages = state.tiles
        .filter((t) => t.village && t.cityId === undefined)
        .map((t) => ({ x: t.x, y: t.y }));
    const cityCoords = myCities.map((c) => ({ x: c.x, y: c.y }));
    const onMyCity = (u) => myCities.some((c) => c.x === u.x && c.y === u.y);
    // Offensive dès qu'on a ~2 unités au-delà des garnisons (1 / ville).
    const attackMode = myCities.length === 0 || myUnits.length >= myCities.length + 2;
    const player = state.players[pid];
    const canAffordUnit = wantsArmy && (player?.stars ?? 0) >= cheapestUnitCost(state, pid);
    for (const u of myUnits) {
        if (u.hasMoved)
            continue;
        const injured = u.hp < maxHp(u) * RETREAT_HP_RATIO;
        if (injured) {
            const m = bestMove(state, u, cityCoords.length ? cityCoords : enemies, "away");
            if (m)
                return m;
            continue;
        }
        if (onMyCity(u)) {
            // La garnison ne bouge QUE pour libérer la ville et permettre un recrutement.
            if (canAffordUnit) {
                const m = bestMove(state, u, enemies, "reposition");
                if (m)
                    return m;
            }
            continue; // sinon elle reste en défense
        }
        // Unité de campagne : on colonise les villages libres en priorité (expansion),
        // sinon à l'assaut en mode offensif, sinon on se regroupe à la maison.
        const m = villages.length > 0
            ? bestMove(state, u, villages, "toward")
            : attackMode
                ? bestMove(state, u, enemies, "toward")
                : bestMove(state, u, cityCoords, "toward");
        if (m)
            return m;
    }
    // 6a. Marine : sur une carte d'eau, viser la Navigation (et son prérequis
    //     Pêche) en priorité — sinon l'IA n'irait jamais coloniser/attaquer
    //     par-delà la mer. Si pas encore abordable, on retombe sur le choix générique.
    if (aiWantsNavigation(state, pid)) {
        for (const techId of ["navigation", "peche"]) {
            const action = { type: "RESEARCH_TECH", techId };
            if (isLegal(state, action))
                return action;
        }
    }
    // 6. Dépenser le surplus en recherche (tech légale la moins chère).
    let bestTech = null;
    let bestTechCost = Infinity;
    const cityCount = getPlayerCityCount(state, pid);
    for (const tech of Object.values(TECHS)) {
        const action = { type: "RESEARCH_TECH", techId: tech.id };
        if (!isLegal(state, action))
            continue;
        const cost = computeTechCost(tech.tier, cityCount);
        if (cost < bestTechCost) {
            bestTechCost = cost;
            bestTech = action;
        }
    }
    if (bestTech)
        return bestTech;
    // 7. Plus rien d'utile : fin de tour.
    return { type: "END_TURN" };
}
/**
 * Joue entièrement le tour de l'IA `pid` (utile pour tests et exécution serveur
 * sans délai). Applique les actions jusqu'à END_TURN inclus. Toujours terminant.
 */
export function runAITurn(state, pid) {
    const actions = [];
    let current = state;
    for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
        const action = nextAIAction(current, pid);
        actions.push(action);
        current = applyAction(current, action);
        if (action.type === "END_TURN")
            break;
    }
    return { state: current, actions };
}
//# sourceMappingURL=ai.js.map