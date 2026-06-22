/**
 * applyAction : SEULE fonction autorisée à produire un nouvel état.
 * Immutable : ne mute jamais l'état reçu, renvoie un nouvel objet.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 */
import type { Action, GameState } from "@polytopia/shared";
/** Erreur levée quand on tente d'appliquer une action illégale. */
export declare class IllegalActionError extends Error {
    readonly action: Action;
    constructor(action: Action);
}
export declare function applyAction(state: GameState, action: Action): GameState;
//# sourceMappingURL=applyAction.d.ts.map