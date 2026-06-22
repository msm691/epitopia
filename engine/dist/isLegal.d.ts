/**
 * Validation des actions. AUCUNE action n'est appliquée sans passer isLegal.
 *
 * Implémentées à l'Étape 1 : END_TURN, TRAIN_UNIT, MOVE_UNIT.
 * Les autres (combat, ville, tech, récolte) arrivent aux étapes suivantes.
 */
import type { Action, GameState } from "@polytopia/shared";
export declare function isLegal(state: GameState, action: Action): boolean;
//# sourceMappingURL=isLegal.d.ts.map