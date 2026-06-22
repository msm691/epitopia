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
export function createRng(seed: number): Rng {
  // État interne sur 32 bits.
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`createRng.int: max(${max}) < min(${min})`);
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    next,
    int,
    get seed() {
      return seed;
    },
  };
}
