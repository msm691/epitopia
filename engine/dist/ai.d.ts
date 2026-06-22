/**
 * IA gloutonne (cf. §6) — PURE et DÉTERMINISTE (aucun RNG, aucun effet de bord).
 * Produit EXACTEMENT les mêmes Actions qu'un humain (même interface).
 *
 * Priorités : capturer une ville > attaquer si avantageux > récolter > recruter
 * > avancer vers l'ennemi (ou se replier si blessé) > chercher une tech > fin de tour.
 * Un peu de stratégie : cible les attaques rentables, replie les unités à bas PV.
 */
import type { Action, GameState, PlayerId } from "@polytopia/shared";
/**
 * Calcule la PROCHAINE action de l'IA `pid` (qui doit être le joueur courant).
 * Toujours une action LÉGALE ; renvoie END_TURN quand il n'y a plus rien d'utile.
 */
export declare function nextAIAction(state: GameState, pid: PlayerId): Action;
export interface AITurnResult {
    state: GameState;
    actions: Action[];
}
/**
 * Joue entièrement le tour de l'IA `pid` (utile pour tests et exécution serveur
 * sans délai). Applique les actions jusqu'à END_TURN inclus. Toujours terminant.
 */
export declare function runAITurn(state: GameState, pid: PlayerId): AITurnResult;
//# sourceMappingURL=ai.d.ts.map