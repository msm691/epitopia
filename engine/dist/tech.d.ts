/**
 * Logique de technologie PURE : coût, possession, déblocages.
 */
import type { GameState, PlayerId, Resource, UnitType } from "@polytopia/shared";
import { type TechDef } from "@polytopia/shared";
/** Coût d'une tech selon son palier et le nombre de villes du joueur. */
export declare function computeTechCost(tier: number, numCities: number): number;
/** Définition de tech si l'id est valide, sinon undefined. */
export declare function getTech(techId: string): TechDef | undefined;
/** Nombre de villes possédées par un joueur. */
export declare function getPlayerCityCount(state: GameState, playerId: PlayerId): number;
/** Le joueur possède-t-il cette tech ? */
export declare function playerHasTech(state: GameState, playerId: PlayerId, techId: string): boolean;
/** Le joueur peut-il recruter ce type d'unité (base ou débloqué par tech) ? */
export declare function playerCanTrain(state: GameState, playerId: PlayerId, unitType: UnitType): boolean;
/** Liste des types d'unités recrutables par le joueur (base + débloqués). */
export declare function trainableUnitsFor(state: GameState, playerId: PlayerId): UnitType[];
/** Le joueur peut-il récolter cette ressource (selon ses techs) ? */
export declare function playerCanHarvest(state: GameState, playerId: PlayerId, resource: Resource): boolean;
//# sourceMappingURL=tech.d.ts.map