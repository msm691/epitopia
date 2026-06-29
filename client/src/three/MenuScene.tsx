/**
 * Décor 3D du menu : une petite île flottante cartoon qui tourne lentement
 * (panorama façon Minecraft), avec eau animée, arbres, pics enneigés, ciel et
 * nuages. Scène AUTONOME et légère (pas d'ombres, dpr plafonné) ; aucune règle
 * de jeu. Posée en fond derrière la carte du menu (pointer-events: none).
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";

const noRaycast = () => null;

/** Pseudo-aléatoire déterministe 0..1. */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(s, 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
}

const COL = {
  champ: "#6cc24a",
  foret: "#519a3e",
  montagne: "#9aa0ac",
  side: "#9c6f47",
} as const;

interface Tile {
  x: number;
  z: number;
  terrain: "champ" | "foret" | "montagne";
  top: number;
}

function Tree({ x, z, top, s, r }: { x: number; z: number; top: number; s: number; r: number }) {
  return (
    <group position={[x, top, z]} rotation={[0, r, 0]} scale={s}>
      <mesh position={[0, 0.12, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.07, 0.26, 6]} />
        <meshStandardMaterial color="#7a5230" flatShading />
      </mesh>
      <mesh position={[0, 0.36, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.22, 0.36, 7]} />
        <meshStandardMaterial color="#2f7d3f" flatShading />
      </mesh>
      <mesh position={[0, 0.58, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.15, 0.26, 7]} />
        <meshStandardMaterial color="#3a9a4d" flatShading />
      </mesh>
    </group>
  );
}

function Peak({ x, z, top }: { x: number; z: number; top: number }) {
  return (
    <group position={[x, top, z]}>
      <mesh position={[0, 0.24, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.4, 0.66, 5]} />
        <meshStandardMaterial color="#8d929c" flatShading />
      </mesh>
      <mesh position={[0, 0.56, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.17, 0.22, 5]} />
        <meshStandardMaterial color="#f1f5f9" flatShading />
      </mesh>
    </group>
  );
}

/** L'île qui tourne lentement (colonnes de terre + décor). */
function Island({ perfMode }: { perfMode?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (perfMode) return;
    if (ref.current) ref.current.rotation.y += dt * 0.08;
  });

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    const R = 3.1;
    for (let gx = -4; gx <= 4; gx++) {
      for (let gz = -4; gz <= 4; gz++) {
        const d = Math.hypot(gx, gz) + (hash(gx, gz, 1) - 0.5) * 1.3;
        if (d > R) continue;
        const h = hash(gx, gz, 2);
        const terrain = h > 0.84 ? "montagne" : h > 0.5 ? "foret" : "champ";
        const top = terrain === "montagne" ? 0.85 : terrain === "foret" ? 0.42 : 0.36;
        out.push({ x: gx, z: gz, terrain, top });
      }
    }
    return out;
  }, []);

  const base = -1.2;
  return (
    <group ref={ref}>
      {tiles.map((t) => {
        const h = t.top - base;
        return (
          <group key={`${t.x},${t.z}`}>
            <mesh position={[t.x, base + h / 2, t.z]} raycast={noRaycast}>
              <boxGeometry args={[0.96, h, 0.96]} />
              <meshStandardMaterial color={COL[t.terrain]} flatShading />
            </mesh>
            {/* flanc plus chaud sur les bords visibles : on ajoute une jupe brune */}
            <mesh position={[t.x, base + h / 2 - 0.02, t.z]} raycast={noRaycast}>
              <boxGeometry args={[0.9, h * 0.7, 0.9]} />
              <meshStandardMaterial color={COL.side} flatShading />
            </mesh>
            {t.terrain === "foret" && (
              <Tree
                x={t.x}
                z={t.z}
                top={t.top}
                s={0.8 + hash(t.x, t.z, 7) * 0.4}
                r={hash(t.x, t.z, 9) * Math.PI * 2}
              />
            )}
            {t.terrain === "montagne" && <Peak x={t.x} z={t.z} top={t.top} />}
          </group>
        );
      })}
    </group>
  );
}

/** Mer animée (vagues douces) entourant l'île. */
function Sea({ perfMode }: { perfMode?: boolean }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(60, 60, 40, 40), []);
  const original = useMemo(
    () => (geo.attributes.position ? Float32Array.from(geo.attributes.position.array) : new Float32Array(0)),
    [geo],
  );
  useFrame(({ clock }) => {
    if (perfMode) return;
    const pos = geo.attributes.position;
    if (!pos) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const ox = original[i * 3] ?? 0;
      const oy = original[i * 3 + 1] ?? 0;
      pos.setZ(i, Math.sin(ox * 0.5 + t * 0.8) * 0.08 + Math.cos(oy * 0.4 + t * 0.6) * 0.08);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh geometry={geo} position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <meshStandardMaterial
        color="#355a93"
        flatShading
        transparent
        opacity={0.95}
        roughness={0.28}
        metalness={0.3}
      />
    </mesh>
  );
}

/** Quelques nuages qui dérivent. */
function Clouds({ perfMode }: { perfMode?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (perfMode) return;
    const g = ref.current;
    if (g) g.position.x = Math.sin(clock.elapsedTime * 0.05) * 2;
  });
  const puffs = useMemo(
    () =>
      [
        [-5, 3.4, -3, 1.1],
        [4.5, 4, -2, 1.3],
        [1, 4.6, -6, 1],
        [-3, 5, 2, 0.9],
      ] as const,
    [],
  );
  return (
    <group ref={ref}>
      {puffs.map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]} scale={s}>
          {(
            [
              [0, 0, 0, 0.7],
              [0.6, -0.05, 0.1, 0.5],
              [-0.6, -0.05, -0.1, 0.55],
              [0.2, 0.15, -0.2, 0.45],
            ] as [number, number, number, number][]
          ).map(([px, py, pz, ps], j) => (
            <mesh key={j} position={[px, py, pz]} scale={[ps * 1.6, ps, ps * 1.4]} raycast={noRaycast}>
              <sphereGeometry args={[0.5, 12, 10]} />
              <meshStandardMaterial color="#ffe2cf" emissive="#ffb98a" emissiveIntensity={0.25} flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Dôme de ciel dégradé « coucher de soleil » (violet en haut -> or à l'horizon). */
function SunsetSky() {
  const geo = useMemo(() => {
    const R = 60;
    const g = new THREE.SphereGeometry(R, 24, 18);
    const top = new THREE.Color("#3b2b63"); // violet profond
    const mid = new THREE.Color("#e7714e"); // orange chaud
    const bot = new THREE.Color("#ffd79a"); // or doux (horizon)
    const pos = g.attributes.position;
    const count = pos ? pos.count : 0;
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count && pos; i++) {
      const yv = THREE.MathUtils.clamp((pos.getY(i) / R + 1) / 2, 0, 1); // 0 bas -> 1 haut
      if (yv < 0.5) c.copy(bot).lerp(mid, yv / 0.5);
      else c.copy(mid).lerp(top, (yv - 0.5) / 0.5);
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

/** Soleil bas sur l'horizon (sphère lumineuse + halo) — le bloom le fait rayonner. */
function Sun() {
  return (
    <group position={[-9, 2.2, -20]}>
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[2.1, 24, 24]} />
        <meshBasicMaterial color="#fff3c4" toneMapped={false} fog={false} />
      </mesh>
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[3.2, 24, 24]} />
        <meshBasicMaterial color="#ffcf86" transparent opacity={0.35} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

export function MenuBackground({ perfMode }: { perfMode?: boolean }) {
  return (
    <div className="menu-bg" aria-hidden>
      <Canvas
        dpr={perfMode ? [0.75, 1] : [1, 1.4]}
        camera={{ fov: 42, position: [0, 3.6, 9], near: 0.1, far: 100 }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15, antialias: !perfMode }}
      >
        <color attach="background" args={["#f3b07a"]} />
        <fog attach="fog" args={["#f0a878", 14, 42]} />
        <SunsetSky />
        <Sun />
        {/* Lumière chaude rasante (golden hour) depuis le soleil + appoint froid */}
        <ambientLight intensity={0.45} color="#ffd9b0" />
        <hemisphereLight args={["#ffd9a8", "#5a4b6e", 0.6]} />
        <directionalLight color="#ffb877" position={[-8, 4, -10]} intensity={1.5} />
        <directionalLight color="#8aa0d6" position={[8, 6, 8]} intensity={0.4} />
        {!perfMode && (
          <Environment resolution={64} environmentIntensity={0.55}>
            <Lightformer intensity={1.6} color="#ffd9a0" position={[-9, 3, -12]} scale={[14, 10, 1]} />
            <Lightformer intensity={0.5} color="#9fb6ec" position={[10, 8, 6]} scale={[12, 12, 1]} />
          </Environment>
        )}
        <Island perfMode={!!perfMode} />
        <Sea perfMode={!!perfMode} />
        <Clouds perfMode={!!perfMode} />
        {!perfMode && (
          <EffectComposer>
            <Bloom intensity={0.9} luminanceThreshold={0.6} luminanceSmoothing={0.3} mipmapBlur />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
