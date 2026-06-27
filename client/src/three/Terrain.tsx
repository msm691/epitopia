/**
 * Terrain 3D cartoon : colonnes de terre avec flancs de falaise (dessus vs côtés
 * via couleurs de sommets), plages sur les cases côtières, et décor en relief
 * (arbres sur les forêts, pics enneigés sur les montagnes).
 * Les cases d'EAU ne sont PAS dessinées ici : le grand plan d'eau les couvre.
 * Aucune règle de jeu ici. Picking : un clic sur une colonne -> onPick(case).
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Coord, GameState } from "@polytopia/shared";
import {
  BEACH_COLOR,
  BEACH_SIDE_COLOR,
  columnCenterY,
  columnHeight,
  isCoastalLand,
  isWater,
  SIDE_COLOR,
  TERRAIN_COLOR,
  TERRAIN_TOP,
  TILE_GAP,
  tileXZ,
} from "./projection.js";

/** Le décor ne doit pas bloquer le clic : la case dessous reste pickable. */
const noRaycast = () => null;

/** Pseudo-aléatoire déterministe (stable entre rendus) à partir de (x,y,salt). */
function rnd(x: number, y: number, salt: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt, 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
}

/** BoxGeometry avec couleurs de sommets : dessus = topColor, flancs = sideColor. */
function buildGeo(height: number, topColor: string, sideColor: string): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(1 - TILE_GAP, height, 1 - TILE_GAP);
  const top = new THREE.Color(topColor);
  const side = new THREE.Color(sideColor);
  const pos = g.attributes.position;
  const count = pos ? pos.count : 0; // 24 sommets (4 par face)
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Ordre des faces d'une BoxGeometry : +X,-X,+Y,-Y,+Z,-Z -> +Y (dessus) = 8..11.
    const c = i >= 8 && i <= 11 ? top : side;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Une occurrence de décor : position monde de la base + échelle + rotation. */
interface Decor {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
  /** Variation 0..1 (teinte du feuillage). */
  t: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Pose les matrices d'instance d'une « partie » de décor (à hauteur locale `localY`). */
function useInstanceLayout(
  ref: React.RefObject<THREE.InstancedMesh>,
  items: readonly Decor[],
  localY: number,
  tint?: { base: string; amount: number },
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _e.set(0, it.r, 0);
      _q.setFromEuler(_e);
      _p.set(it.x, it.y + localY * it.s, it.z);
      _s.set(it.s, it.s, it.s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (tint) {
        _c.set(tint.base).offsetHSL(0, 0, (it.t - 0.5) * tint.amount);
        mesh.setColorAt(i, _c);
      }
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (tint && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, items, localY, tint]);
}

/** Forêts : 3 parties (tronc + 2 cônes de feuillage) en InstancedMesh. */
function InstancedTrees({ items }: { items: readonly Decor[] }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const mid = useRef<THREE.InstancedMesh>(null);
  const top = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(1, items.length);
  useInstanceLayout(trunk, items, 0.12);
  useInstanceLayout(mid, items, 0.34, { base: "#2f7d3f", amount: 0.16 });
  useInstanceLayout(top, items, 0.54, { base: "#3a9a4d", amount: 0.16 });
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, n]} raycast={noRaycast} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.055, 0.24, 6]} />
        <meshStandardMaterial color="#7a5230" flatShading />
      </instancedMesh>
      <instancedMesh ref={mid} args={[undefined, undefined, n]} raycast={noRaycast} castShadow frustumCulled={false}>
        <coneGeometry args={[0.19, 0.32, 7]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </instancedMesh>
      <instancedMesh ref={top} args={[undefined, undefined, n]} raycast={noRaycast} castShadow frustumCulled={false}>
        <coneGeometry args={[0.13, 0.24, 7]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </instancedMesh>
    </group>
  );
}

/** Montagnes : pic rocheux + sommet enneigé en InstancedMesh. */
function InstancedPeaks({ items }: { items: readonly Decor[] }) {
  const rock = useRef<THREE.InstancedMesh>(null);
  const snow = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(1, items.length);
  useInstanceLayout(rock, items, 0.22);
  useInstanceLayout(snow, items, 0.5);
  return (
    <group>
      <instancedMesh ref={rock} args={[undefined, undefined, n]} raycast={noRaycast} castShadow receiveShadow frustumCulled={false}>
        <coneGeometry args={[0.36, 0.6, 5]} />
        <meshStandardMaterial color="#8d929c" flatShading />
      </instancedMesh>
      <instancedMesh ref={snow} args={[undefined, undefined, n]} raycast={noRaycast} castShadow frustumCulled={false}>
        <coneGeometry args={[0.15, 0.2, 5]} />
        <meshStandardMaterial color="#f1f5f9" flatShading />
      </instancedMesh>
    </group>
  );
}

export interface TerrainProps {
  state: GameState;
  onPick: (e: ThreeEvent<MouseEvent>, coord: Coord) => void;
}

const BIOMES: Record<string, { champ: string; foret: string; montagne: string }> = {
  prairie: { champ: "#6cc24a", foret: "#519a3e", montagne: "#9aa0ac" },
  neige: { champ: "#d1e1eb", foret: "#b3cddf", montagne: "#ffffff" },
  desert: { champ: "#edd38c", foret: "#d1b56a", montagne: "#c79f58" },
  automne: { champ: "#d69847", foret: "#a85c2c", montagne: "#8a573b" },
};

function getBiome(state: GameState, x: number, y: number): string {
  const t = state.tiles.find(tile => tile.x === x && tile.y === y);
  if (t && t.ownerId !== undefined) {
    return state.players.find(p => p.id === t.ownerId)?.biome ?? "prairie";
  }
  let nearestCity = null;
  let minDist = Infinity;
  for (const c of state.cities) {
    const d = Math.max(Math.abs(c.x - x), Math.abs(c.y - y));
    if (d < minDist) { minDist = d; nearestCity = c; }
  }
  if (nearestCity) {
    return state.players.find(p => p.id === nearestCity.ownerId)?.biome ?? "prairie";
  }
  return "prairie";
}

export function Terrain({ state, onPick }: TerrainProps) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
    [],
  );

  const geoCache = useRef(new Map<string, THREE.BoxGeometry>());
  const getGeo = (terrain: GameState["tiles"][number]["terrain"], isCoastal: boolean, biome: string, wonder?: string) => {
    const key = `${terrain}-${isCoastal ? "beach" : "land"}-${biome}-${wonder ?? "none"}`;
    if (!geoCache.current.has(key)) {
      const b = BIOMES[biome] || BIOMES.prairie;
      let g: THREE.BoxGeometry;
      if (wonder === "volcan") g = buildGeo(columnHeight("montagne"), "#b04444", "#703030");
      else if (wonder === "oasis") g = buildGeo(columnHeight("champ"), "#44b0b0", "#307070");
      else if (terrain === "montagne") g = buildGeo(columnHeight("montagne"), b!.montagne, SIDE_COLOR);
      else if (terrain === "foret") g = buildGeo(columnHeight("foret"), b!.foret, SIDE_COLOR);
      else if (isCoastal) g = buildGeo(columnHeight("champ"), BEACH_COLOR, BEACH_SIDE_COLOR);
      else g = buildGeo(columnHeight("champ"), b!.champ, SIDE_COLOR);
      geoCache.current.set(key, g);
    }
    return geoCache.current.get(key)!;
  };

  // Décor INSTANCIÉ (déterministe) : 3 arbres par forêt, 1 pic par montagne.
  // Collecté une fois par carte -> tout le décor en ~5 draw calls (fluide).
  const { trees, peaks } = useMemo(() => {
    const trees: Decor[] = [];
    const peaks: Decor[] = [];
    for (const tile of state.tiles) {
      if (isWater(tile.terrain)) continue;
      const { x: wx, z } = tileXZ(tile.x, tile.y, state.width, state.height);
      const topY = TERRAIN_TOP[tile.terrain];
      if (tile.terrain === "foret") {
        for (let k = 0; k < 3; k++) {
          const ox = (rnd(tile.x, tile.y, k * 2 + 1) - 0.5) * 0.5;
          const oz = (rnd(tile.x, tile.y, k * 2 + 2) - 0.5) * 0.5;
          const s = 0.7 + rnd(tile.x, tile.y, k + 7) * 0.45;
          const r = rnd(tile.x, tile.y, k + 11) * Math.PI * 2;
          trees.push({ x: wx + ox, y: topY, z: z + oz, s, r, t: rnd(tile.x, tile.y, k + 5) });
        }
      } else if (tile.terrain === "montagne") {
        const s = 0.85 + rnd(tile.x, tile.y, 3) * 0.3;
        const r = rnd(tile.x, tile.y, 5) * Math.PI * 2;
        peaks.push({ x: wx, y: topY, z, s, r, t: 0 });
      }
    }
    return { trees, peaks };
  }, [state]);

  return (
    <group>
      {state.tiles.map((tile) => {
        if (isWater(tile.terrain)) return null; // l'eau est gérée par le plan animé
        const { x: wx, z } = tileXZ(tile.x, tile.y, state.width, state.height);
        const cy = columnCenterY(tile.terrain);
        const biome = getBiome(state, tile.x, tile.y);
        const isCoastal = isCoastalLand(state, tile.x, tile.y);
        const geo = getGeo(tile.terrain, isCoastal, biome, tile.naturalWonder);

        return (
          <group key={`${tile.x},${tile.y}`} position={[wx, cy, z]}>
            <mesh
              geometry={geo}
              material={mat}
              castShadow
              receiveShadow
              onClick={(e) => onPick(e, { x: tile.x, y: tile.y })}
            />
            {tile.hasRoad && (
              <mesh position={[0, columnHeight(tile.terrain) / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.5, 0.5]} />
                <meshStandardMaterial color="#8b5a2b" />
              </mesh>
            )}
          </group>
        );
      })}
      <InstancedTrees items={trees} />
      <InstancedPeaks items={peaks} />
    </group>
  );
}
