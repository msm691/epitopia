/**
 * Scène 3D (React-Three-Fiber).
 * Consomme le MÊME GameState / overlay / onTileClick que l'ancien renderer iso.
 * Aucune règle de jeu ici (rendu pur). Picking au clic -> onTileClick({x,y}).
 *
 * Étape 1 : socle jouable. Étape 2 : vraie île (terrain falaises + plages,
 * eau animée, relief, ciel dégradé, éclairage cartoon).
 */

import { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, MapControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Coord, GameState } from "@polytopia/shared";
import {
  isWater,
  terrainAt,
  TERRAIN_TOP,
  tileTop,
  tileXZ,
  WATER_SURFACE_Y,
  worldToTile,
} from "./projection.js";
import { Terrain } from "./Terrain.js";
import { Water } from "./Water.js";
import { Resources } from "./Resources.js";
import { Cities, Sages, Villages } from "./Buildings.js";
import { AnimatedUnits, Effects, PulseRing, useSceneAnimations } from "./Effects.js";

/** Surbrillances (même forme que l'overlay du renderer iso). */
export interface Overlay {
  selected?: Coord | undefined;
  moves?: readonly Coord[] | undefined;
  attacks?: readonly Coord[] | undefined;
  /** Zone de portée d'attaque (carré de portée) : centre + rayon. */
  attackZone?: { x: number; y: number; radius: number } | undefined;
  harvests?: readonly Coord[] | undefined;
  pending?: Coord | undefined;
}

export interface Scene3DHandle {
  /** Recentre/recadre la caméra sur la carte (ou sur `focus`). */
  recenter: () => void;
  /** Fait pivoter la caméra autour de la carte (radians ; +/- = sens). */
  rotate: (deltaRad: number) => void;
}

export interface Scene3DProps {
  state: GameState;
  overlay: Overlay;
  onTileClick: (coord: Coord) => void;
  focus?: Coord | undefined;
  perfMode?: boolean;
}

const noRaycast = () => null;

/** Distance caméra par défaut selon la taille de la carte. */
function defaultDistance(state: GameState): number {
  return Math.max(state.width, state.height) * 0.95 + 4;
}

// ---------------------------------------------------------------------------
// Ciel dégradé
// ---------------------------------------------------------------------------

function SkyDome() {
  const geo = useMemo(() => {
    const R = 120;
    const g = new THREE.SphereGeometry(R, 24, 16);
    const top = new THREE.Color("#7cc1ec");
    const bot = new THREE.Color("#bcdcf0");
    const pos = g.attributes.position;
    const count = pos ? pos.count : 0;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count && pos; i++) {
      const yv = THREE.MathUtils.clamp((pos.getY(i) / R + 1) / 2, 0, 1);
      const c = bot.clone().lerp(top, yv);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  return (
    <mesh geometry={geo} raycast={noRaycast}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Overlays (surbrillances posées sur le dessus des tuiles)
// ---------------------------------------------------------------------------

/** Surbrillances d'action : remplissage vif + contour, opacité PULSÉE. */
/**
 * Y d'un overlay au sol posé sur la case (x,y). Sur l'EAU, on monte au-dessus de
 * la crête des vagues (cf. Water.tsx : amplitude ≈ 0.10) pour que la surbrillance
 * ne soit pas recouverte par l'eau animée. `lift` = petit décalage anti-z-fighting.
 */
const WATER_OVERLAY_Y = WATER_SURFACE_Y + 0.13;
function overlayY(state: GameState, x: number, y: number, lift: number): number {
  return (isWater(terrainAt(state, x, y)) ? WATER_OVERLAY_Y : tileTop(state, x, y).y) + lift;
}

function HighlightPlanes({
  state,
  cells,
  color,
  base,
  phase = 0,
  lift = 0.016,
  size = 0.92,
  pulse = 0.18,
  perfMode,
}: {
  state: GameState;
  cells: readonly Coord[] | undefined;
  color: string;
  base: number;
  phase?: number;
  lift?: number;
  size?: number;
  pulse?: number;
  perfMode?: boolean;
}) {
  const fill = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: base, depthWrite: false, toneMapped: false }),
    [color, base],
  );
  useFrame(({ clock }) => {
    if (perfMode) {
      fill.opacity = base;
      return;
    }
    const p = base + Math.sin(clock.elapsedTime * 4 + phase) * pulse;
    fill.opacity = Math.max(0, p);
  });
  const list = cells ?? [];
  return (
    <group>
      {list.map((c) => {
        const t = tileTop(state, c.x, c.y);
        return (
          <mesh
            key={`${color}-${c.x},${c.y}`}
            position={[t.x, overlayY(state, c.x, c.y, lift), t.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={fill}
            renderOrder={2}
            raycast={noRaycast}
          >
            <planeGeometry args={[size, size]} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Contour délimitant un ENSEMBLE de cases : un segment de liseré sur chaque arête
 * donnant vers une case HORS de l'ensemble. Donne un seul contour propre (au lieu
 * d'un cadre par case), réutilisé pour la zone d'attaque et la zone d'exploitation.
 * Suit le relief par case et passe au-dessus des vagues (overlayY). Opacité pulsée.
 */
const OUTLINE_TH = 0.13; // épaisseur du liseré
function RegionOutline({
  state,
  cells,
  color,
  lift = 0.02,
  perfMode,
}: {
  state: GameState;
  cells: readonly Coord[] | undefined;
  color: string;
  lift?: number;
  perfMode?: boolean;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [color],
  );
  useFrame(({ clock }) => {
    if (perfMode) {
      mat.opacity = 0.8;
      return;
    }
    mat.opacity = 0.72 + Math.sin(clock.elapsedTime * 3.5) * 0.22;
  });
  const list = cells ?? [];
  const set = useMemo(() => new Set(list.map((c) => `${c.x},${c.y}`)), [list]);
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  const segs: React.ReactNode[] = [];
  for (const c of list) {
    const { x: wx, z } = tileXZ(c.x, c.y, state.width, state.height);
    const y = overlayY(state, c.x, c.y, lift);
    const edge = (k: string, ex: number, ez: number, w: number, h: number) =>
      segs.push(
        <mesh key={`${c.x},${c.y}${k}`} material={mat} position={[ex, y, ez]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} raycast={noRaycast}>
          <planeGeometry args={[w, h]} />
        </mesh>,
      );
    if (!has(c.x, c.y - 1)) edge("t", wx, z - 0.5, 1 + OUTLINE_TH, OUTLINE_TH);
    if (!has(c.x, c.y + 1)) edge("b", wx, z + 0.5, 1 + OUTLINE_TH, OUTLINE_TH);
    if (!has(c.x - 1, c.y)) edge("l", wx - 0.5, z, OUTLINE_TH, 1 + OUTLINE_TH);
    if (!has(c.x + 1, c.y)) edge("r", wx + 0.5, z, OUTLINE_TH, 1 + OUTLINE_TH);
  }
  return <group>{segs}</group>;
}

/**
 * Zone d'EXPLOITATION (rayon de récolte) de la ville sélectionnée. Volontairement
 * différente des surbrillances d'action (carrés pleins / cadres / anneaux) : un
 * CONTOUR délimité façon « champ borné » + de petits PIQUETS aux 4 coins, en ambre
 * terreux. N'apparaît qu'à la sélection d'une ville. Suit le relief et passe
 * au-dessus des vagues (overlayY) comme les autres overlays.
 */
/** Cases d'un carré de Chebyshev (centre cx,cy, rayon r), bornées à la carte. */
function squareCells(state: GameState, zone: { x: number; y: number; radius: number } | undefined): Coord[] {
  if (!zone) return [];
  const cells: Coord[] = [];
  for (let ty = zone.y - zone.radius; ty <= zone.y + zone.radius; ty++) {
    for (let tx = zone.x - zone.radius; tx <= zone.x + zone.radius; tx++) {
      if (tx >= 0 && ty >= 0 && tx < state.width && ty < state.height) cells.push({ x: tx, y: ty });
    }
  }
  return cells;
}

/** Contour d'un carré de portée PLEIN (juste sa limite extérieure, net et clair). */
function SquareZone({ state, zone, color, perfMode }: { state: GameState; zone: { x: number; y: number; radius: number } | undefined; color: string; perfMode?: boolean }) {
  return <RegionOutline state={state} cells={squareCells(state, zone)} color={color} perfMode={!!perfMode} />;
}

/**
 * Aide au clic sur l'eau (#12) : une boîte INVISIBLE par case d'eau, montant
 * jusqu'au niveau de la terre. Comme le volume cliquable s'élève à la hauteur des
 * cases voisines, l'eau reste sélectionnable même vue de biais (sinon la falaise
 * d'une case de terre voisine interceptait le rayon avant la surface enfoncée).
 */
function WaterPickLayer({
  state,
  onPick,
}: {
  state: GameState;
  onPick: (e: ThreeEvent<MouseEvent>, coord: Coord) => void;
}) {
  const geo = useMemo(() => new THREE.BoxGeometry(0.92, 0.5, 0.92), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), []);
  
  const tiles = useMemo(() => {
    return state.tiles.filter((t: GameState["tiles"][0]) => isWater(t.terrain)).map((t: GameState["tiles"][0]) => {
      const { x, z } = tileXZ(t.x, t.y, state.width, state.height);
      return { x: t.x, y: t.y, wx: x, cy: 0.18, z };
    });
  }, [state]);

  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    tiles.forEach((t: any, i: number) => {
      dummy.position.set(t.wx, t.cy, t.z);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [tiles]);

  if (tiles.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, tiles.length]}
      onClick={(e) => {
        if (e.instanceId !== undefined) {
          const t = tiles[e.instanceId];
          if (t) {
            e.stopPropagation();
            onPick(e, { x: t.x, y: t.y });
          }
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Caméra / contrôles
// ---------------------------------------------------------------------------

const CameraRig = forwardRef<Scene3DHandle, { state: GameState; focus?: Coord | undefined }>(
  function CameraRig({ state, focus }, ref) {
    const controls = useRef<OrbitControlsImpl | null>(null);
    const { camera } = useThree();

    const place = useMemo(() => {
      const dist = defaultDistance(state);
      const target = focus ? { ...tileTop(state, focus.x, focus.y) } : { x: 0, y: 0.2, z: 0 };
      return { dist, target };
    }, [state, focus]);

    const recenter = useMemo(
      () => () => {
        const { dist, target } = place;
        camera.position.set(target.x, target.y + dist * 0.85, target.z + dist * 0.65);
        if (controls.current) {
          controls.current.target.set(target.x, target.y, target.z);
          controls.current.update();
        }
        camera.lookAt(target.x, target.y, target.z);
      },
      [camera, place],
    );

    const rotate = useMemo(
      () => (delta: number) => {
        const c = controls.current;
        if (!c) return;
        const t = c.target;
        const ox = camera.position.x - t.x;
        const oz = camera.position.z - t.z;
        const r = Math.hypot(ox, oz);
        const angle = Math.atan2(ox, oz) + delta;
        camera.position.x = t.x + Math.sin(angle) * r;
        camera.position.z = t.z + Math.cos(angle) * r;
        c.update();
      },
      [camera],
    );

    useImperativeHandle(ref, () => ({ recenter, rotate }), [recenter, rotate]);

    const fittedKey = useRef("");
    useEffect(() => {
      const key = `${state.width}x${state.height}`;
      if (fittedKey.current !== key) {
        fittedKey.current = key;
        recenter();
      }
    }, [state.width, state.height, recenter]);

    return (
      <MapControls
        ref={controls}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning={false}
        minDistance={3}
        maxDistance={defaultDistance(state) * 1.8}
        maxPolarAngle={Math.PI / 2.25}
        minPolarAngle={0.15}
      />
    );
  },
);

// ---------------------------------------------------------------------------
// Scène
// ---------------------------------------------------------------------------

export const Scene3D = forwardRef<Scene3DHandle, Scene3DProps>(function Scene3D(
  { state, overlay, onTileClick, focus, perfMode },
  ref,
) {
  // Détection clic vs glissement (le drag pilote la caméra, le tap sélectionne).
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const isTap = (e: { clientX: number; clientY: number }) => {
    const d = downPos.current;
    return !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 8;
  };

  const handlePick = (e: ThreeEvent<MouseEvent>, coord: Coord) => {
    e.stopPropagation();
    if (isTap(e)) onTileClick(coord);
  };

  // Clic sur l'eau : on retrouve la case via le point d'impact monde.
  const handleWaterPick = (e: ThreeEvent<MouseEvent>) => {
    if (!isTap(e)) return;
    const c = worldToTile(e.point.x, e.point.z, state.width, state.height);
    if (c) onTileClick(c);
  };

  // Plan d'eau largement plus grand que le champ visible (même au zoom max) :
  // son bord reste hors écran -> plus de "halo blanc" en dézoomant.
  const span = Math.max(state.width, state.height) * 6 + 20;
  const anim = useSceneAnimations(state);

  return (
    <Canvas
      shadows={!perfMode}
      // DPR plafonné à 1.5 : sur écrans Retina/mobile, 2x = 4x de pixels à
      // calculer. 1.5 reste net et réduit fortement la charge GPU (fluidité).
      dpr={perfMode ? [0.75, 1] : [1, 1.5]}
      camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 18, 14] }}
      // Rendu plus riche : ACES + exposition. Les overlays/HUD restent en
      // toneMapped={false} pour garder des couleurs vives.
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, antialias: !perfMode }}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <color attach="background" args={["#bcdcf0"]} />
      <fog attach="fog" args={["#bcdcf0", 34, 88]} />
      <SkyDome />

      {/* Environment map PROCÉDURALE (offline, pas de téléchargement) : donne des
          reflets/une lumière douce aux matériaux PBR des modèles. Faible coût. */}
      {!perfMode && (
        <Environment resolution={64} environmentIntensity={0.5}>
          <Lightformer intensity={1.3} color="#fff3d6" position={[10, 10, 6]} scale={[12, 12, 1]} />
          <Lightformer intensity={0.6} color="#cfe6fb" position={[-10, 6, -6]} scale={[12, 12, 1]} />
          <Lightformer
            intensity={0.35}
            color="#6f8a55"
            position={[0, -6, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[14, 14, 1]}
          />
        </Environment>
      )}

      {/* Éclairage cartoon : soleil chaud + ciel/ambiance doux (réduits car
          l'environment apporte déjà de l'ambiance) */}
      <ambientLight intensity={0.32} />
      <hemisphereLight args={["#dbeeff", "#6f8a55", 0.4]} />
      <directionalLight
        color="#fff3d6"
        position={[14, 22, 9]}
        intensity={1.25}
        castShadow={!perfMode}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />

      <Water size={span} y={WATER_SURFACE_Y} onPick={handleWaterPick} perfMode={!!perfMode} />
      <WaterPickLayer state={state} onPick={handlePick} />
      <Terrain state={state} onPick={handlePick} />
      <Resources state={state} />
      <Villages state={state} perfMode={!!perfMode} />
      <Sages state={state} perfMode={!!perfMode} />
      <Cities state={state} perfMode={!!perfMode} />
      <AnimatedUnits state={state} anim={anim} />
      <Effects state={state} events={anim.events} removeEvent={anim.removeEvent} />

      {/* Zone d'attaque : CONTOUR orange net du carré de portée (limite extérieure) */}
      <SquareZone state={state} zone={overlay.attackZone} color="#ff7a1a" perfMode={!!perfMode} />
      <HighlightPlanes state={state} cells={overlay.moves} color="#ffe14d" base={0.55} perfMode={!!perfMode} />
      <HighlightPlanes state={state} cells={overlay.attacks} color="#ff4d4d" base={0.58} phase={1} perfMode={!!perfMode} />
      <HighlightPlanes state={state} cells={overlay.harvests} color="#3df0a0" base={0.55} phase={2} perfMode={!!perfMode} />
      <PulseRing state={state} cell={overlay.selected} color="#8fe3ff" perfMode={!!perfMode} />
      <PulseRing state={state} cell={overlay.pending} color="#ffce5a" perfMode={!!perfMode} />

      <CameraRig ref={ref} state={state} focus={focus} />

      {/* Bloom doux : fait « briller » les zones lumineuses (orbes des sages,
          récompenses, gemmes) sans alourdir le rendu (mipmapBlur = cheap). */}
      {!perfMode && (
        <EffectComposer>
          <Bloom
            intensity={0.55}
            luminanceThreshold={0.9}
            luminanceSmoothing={0.2}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
});

// Réexports pour les étapes suivantes.
export { TERRAIN_TOP, terrainAt };
