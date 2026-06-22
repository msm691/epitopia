/**
 * RNG seedé déterministe (mulberry32).
 * TOUT hasard du jeu (génération de carte, combat) DOIT passer par ici,
 * pour qu'un bug soit reproductible à partir d'une seed (cf. §0.7).
 */
export interface Rng {
    /** Prochain flottant dans [0, 1). */
    next(): number;
    /** Entier dans [min, max] inclus. */
    int(min: number, max: number): number;
    /** Seed courante (état interne), pour debug/reproduction. */
    readonly seed: number;
}
/**
 * Crée un générateur déterministe à partir d'une seed.
 * Deux RNG créés avec la même seed produisent exactement la même suite.
 */
export declare function createRng(seed: number): Rng;
//# sourceMappingURL=rng.d.ts.map