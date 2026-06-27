import { chebyshev } from "./units.js";
import { isLandTerrain } from "./generateMap.js";
import { tileAt } from "./units.js";
/**
 * A* Pathfinding pour l'IA d'Epitopia.
 * Tient compte du type de terrain et de la capacité à naviguer.
 */
export function findPath(state, start, goal, canNavigate) {
    const width = state.width;
    const height = state.height;
    // Si le but est hors-limites, pas de chemin.
    if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height)
        return null;
    const toIndex = (x, y) => y * width + x;
    const openSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const startIdx = toIndex(start.x, start.y);
    const goalIdx = toIndex(goal.x, goal.y);
    openSet.add(startIdx);
    gScore.set(startIdx, 0);
    fScore.set(startIdx, chebyshev(start, goal));
    while (openSet.size > 0) {
        let currentIdx = -1;
        let minF = Infinity;
        for (const idx of openSet) {
            const f = fScore.get(idx) ?? Infinity;
            if (f < minF) {
                minF = f;
                currentIdx = idx;
            }
        }
        if (currentIdx === goalIdx) {
            // Reconstruct path
            const path = [];
            let curr = currentIdx;
            while (cameFrom.has(curr)) {
                path.unshift({ x: curr % width, y: Math.floor(curr / width) });
                curr = cameFrom.get(curr);
            }
            return path;
        }
        openSet.delete(currentIdx);
        const cx = currentIdx % width;
        const cy = Math.floor(currentIdx / width);
        // Neighbors (8-way Chebyshev)
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0)
                    continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                    continue;
                // Validation basique de déplacement (peut-on y aller ?)
                // Si la case cible contient une unité, l'algorithme A* l'évitera, 
                // sauf si on cible délibérément cette case (ex: attaque).
                const nIdx = toIndex(nx, ny);
                const tile = tileAt(state, nx, ny);
                if (!tile)
                    continue;
                // Coût du déplacement
                let cost = 1;
                // Routes commerciales divisaient le coût par deux
                const currTile = tileAt(state, cx, cy);
                if (currTile?.hasRoad && tile.hasRoad) {
                    cost = 0.5;
                }
                else if (tile.terrain === "montagne") {
                    cost = 2; // Montagne plus difficile
                }
                // Peut naviguer ?
                const isWater = !isLandTerrain(tile.terrain);
                if (isWater && !canNavigate)
                    continue;
                // Autoriser de s'arrêter sur la case d'arrivée même si elle est occupée
                // (utile pour cibler les ennemis), mais bloquer les cases intermédiaires occupées
                if (nIdx !== goalIdx && tile.unitId !== undefined) {
                    cost = 10; // Très pénalisé pour éviter de traverser les alliés ou se bloquer
                }
                const tentativeG = (gScore.get(currentIdx) ?? Infinity) + cost;
                if (tentativeG < (gScore.get(nIdx) ?? Infinity)) {
                    cameFrom.set(nIdx, currentIdx);
                    gScore.set(nIdx, tentativeG);
                    fScore.set(nIdx, tentativeG + chebyshev({ x: nx, y: ny }, goal));
                    openSet.add(nIdx);
                }
            }
        }
    }
    return null;
}
export function hasContinuousRoad(state, start, goal, maxDist) {
    if (chebyshev(start, goal) > maxDist)
        return false;
    const width = state.width;
    const toIndex = (x, y) => y * width + x;
    const startIdx = toIndex(start.x, start.y);
    const goalIdx = toIndex(goal.x, goal.y);
    const visited = new Set();
    const queue = [{ idx: startIdx, dist: 0 }];
    visited.add(startIdx);
    while (queue.length > 0) {
        const { idx, dist } = queue.shift();
        if (idx === goalIdx)
            return true;
        if (dist >= maxDist)
            continue;
        const cx = idx % width;
        const cy = Math.floor(idx / width);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0)
                    continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= state.height)
                    continue;
                const nIdx = toIndex(nx, ny);
                if (visited.has(nIdx))
                    continue;
                const tile = tileAt(state, nx, ny);
                if (tile && tile.hasRoad) {
                    visited.add(nIdx);
                    queue.push({ idx: nIdx, dist: dist + 1 });
                }
            }
        }
    }
    return false;
}
//# sourceMappingURL=pathfinding.js.map