import type { Coord, GameState } from "@polytopia/shared";
/**
 * A* Pathfinding pour l'IA d'Epitopia.
 * Tient compte du type de terrain et de la capacité à naviguer.
 */
export declare function findPath(state: GameState, start: Coord, goal: Coord, canNavigate: boolean): Coord[] | null;
export declare function hasContinuousRoad(state: GameState, start: Coord, goal: Coord, maxDist: number): boolean;
//# sourceMappingURL=pathfinding.d.ts.map