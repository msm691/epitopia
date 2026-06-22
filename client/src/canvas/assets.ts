/**
 * Chargeur d'assets images (PNG) avec repli gracieux.
 * Les images vivent dans client/public/assets/. Si un fichier est absent, le
 * renderer dessine un repli (emoji / forme), donc le jeu reste joli sans assets.
 */

import type { Resource, Terrain, UnitType } from "@polytopia/shared";
import { ALL_UNIT_TYPES } from "@polytopia/shared";

const BASE = "/assets";

const TERRAINS: Terrain[] = ["champ", "foret", "montagne", "eau", "ocean"];
const RESOURCES: Resource[] = [
  "fruits",
  "gibier",
  "poisson",
  "cereales",
  "minerai",
  "bois",
  "metal",
  "luxe",
];

/** Construit la liste des assets attendus (clé -> URL). */
function manifest(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const t of TERRAINS) m[`terrain/${t}`] = `${BASE}/terrain/${t}.png`;
  for (const u of ALL_UNIT_TYPES) m[`unit/${u}`] = `${BASE}/units/${u}.png`;
  for (const r of RESOURCES) m[`resource/${r}`] = `${BASE}/resources/${r}.png`;
  m["city/city"] = `${BASE}/city/city.png`;
  return m;
}

export type TerrainKey = `terrain/${Terrain}`;
export type UnitKey = `unit/${UnitType}`;
export type ResourceKey = `resource/${Resource}`;
export type AssetKey = TerrainKey | UnitKey | ResourceKey | "city/city";

export interface AssetStore {
  /** Image prête à dessiner, ou null si absente (=> repli). */
  get(key: AssetKey): HTMLImageElement | null;
  /** S'abonne aux chargements d'images (pour redessiner). Renvoie un dé-abonnement. */
  onChange(cb: () => void): () => void;
}

export function createAssetStore(): AssetStore {
  const images = new Map<string, HTMLImageElement>();
  const ready = new Set<string>();
  const listeners = new Set<() => void>();

  for (const [key, url] of Object.entries(manifest())) {
    const img = new Image();
    img.onload = () => {
      ready.add(key);
      listeners.forEach((l) => l());
    };
    img.onerror = () => {
      /* absent -> repli, on ignore */
    };
    img.src = url;
    images.set(key, img);
  }

  return {
    get(key) {
      return ready.has(key) ? (images.get(key) ?? null) : null;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
