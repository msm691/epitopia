/**
 * Bâtiments 3D cartoon : villes qui grossissent avec le niveau (toits à la
 * couleur du joueur, drapeau, muraille si hasWall, marqueur de récompense),
 * et villages neutres à conquérir. Aucune règle de jeu ici.
 */

import { useEffect, useMemo, useRef } from "react";
import { Billboard, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { City, GameState } from "@polytopia/shared";
import { WALL_MAX_HP } from "@polytopia/shared";
import { tileTop } from "./projection.js";
import { cityModelFor, SAGE_MODELS, VILLAGE_MODEL } from "./models.js";
import { ModelOr } from "./Units.js";

const noRaycast = () => null;

/** Barre de vie du rempart (billboard, par-dessus tout comme celle des unités). */
function WallHpBar({ hp }: { hp: number }) {
  const ratio = Math.max(0, Math.min(1, hp / WALL_MAX_HP));
  const w = 0.62;
  const h = 0.1;
  return (
    <Billboard position={[0, 1.0, 0]}>
      <mesh raycast={noRaycast} renderOrder={900}>
        <planeGeometry args={[w + 0.07, h + 0.07]} />
        <meshBasicMaterial color="#f4f8fb" transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.001]} raycast={noRaycast} renderOrder={901}>
        <planeGeometry args={[w + 0.02, h + 0.02]} />
        <meshBasicMaterial color="#11151c" transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[-w / 2 + (w * ratio) / 2, 0, 0.002]} raycast={noRaycast} renderOrder={902}>
        <planeGeometry args={[Math.max(0.001, w * ratio), h]} />
        <meshBasicMaterial color="#c9b48a" transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/** Engrenage (tore) qui tourne au-dessus d'une ville : « unité en production ». */
function ProductionMarker({ perfMode }: { perfMode?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (perfMode) return;
    const m = ref.current;
    if (m) {
      m.rotation.z = clock.elapsedTime * 2;
      m.position.y = 0.95 + Math.sin(clock.elapsedTime * 2.2) * 0.05;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <torusGeometry args={[0.11, 0.04, 8, 12]} />
      <meshStandardMaterial color="#cfd6df" emissive="#3a4250" emissiveIntensity={0.4} metalness={0.6} roughness={0.4} flatShading />
    </mesh>
  );
}

/** Octaèdre doré flottant + tournant : « récompense à choisir ». */
function RewardMarker({ perfMode }: { perfMode?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (perfMode) return;
    const m = ref.current;
    if (m) {
      m.rotation.y = clock.elapsedTime * 1.6;
      m.position.y = 0.85 + Math.sin(clock.elapsedTime * 2.4) * 0.06;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0.85, 0]} raycast={noRaycast}>
      <octahedronGeometry args={[0.1, 0]} />
      <meshStandardMaterial color="#ffd24a" emissive="#a87b00" emissiveIntensity={0.5} flatShading />
    </mesh>
  );
}
const WALL_COLOR = "#ece3cd";
const STONE = "#b7b0a1";

/** Petite maison : murs crème + toit en pointe à la couleur du joueur. */
function House({ roof, w = 0.17, h = 0.16 }: { roof: THREE.Color; w?: number; h?: number }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} raycast={noRaycast} castShadow receiveShadow>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial color={WALL_COLOR} flatShading />
      </mesh>
      <mesh position={[0, h + 0.055, 0]} rotation={[0, Math.PI / 4, 0]} raycast={noRaycast} castShadow>
        <coneGeometry args={[w * 0.82, 0.13, 4]} />
        <meshStandardMaterial color={roof} flatShading />
      </mesh>
    </group>
  );
}

/** Mât + drapeau à la couleur du joueur (planté sur le donjon). */
function Flag({ color }: { color: THREE.Color }) {
  return (
    <group position={[0, 0.3, 0]}>
      <mesh position={[0, 0.12, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.008, 0.008, 0.26, 6]} />
        <meshStandardMaterial color="#5a4632" flatShading />
      </mesh>
      <mesh position={[0.07, 0.2, 0]} raycast={noRaycast}>
        <planeGeometry args={[0.13, 0.08]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} flatShading />
      </mesh>
    </group>
  );
}

/** Texture de texte (pseudo) via canvas — offline, pas de police réseau. */
function makeLabelTexture(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const font = 44;
  const pad = 10;
  const spec = `600 ${font}px system-ui, -apple-system, sans-serif`;
  const probe = document.createElement("canvas").getContext("2d");
  let w = 60;
  if (probe) {
    probe.font = spec;
    w = probe.measureText(text).width;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w) + pad * 2;
  canvas.height = font + pad * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = spec;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return { tex, aspect: canvas.width / canvas.height };
}

/** Petit pseudo flottant (billboard) au-dessus de la ville, à la couleur du joueur. */
function NameTag({ text, color, y }: { text: string; color: string; y: number }) {
  const { tex, aspect } = useMemo(() => makeLabelTexture(text, color), [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const h = 0.2;
  return (
    <Billboard position={[0, y, 0]}>
      <mesh raycast={noRaycast} renderOrder={950}>
        <planeGeometry args={[h * aspect, h]} />
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={0.9}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}

/** Bâtiments PROCÉDURAUX d'une ville (donjon + drapeau + maisons satellites). */
function ProceduralCityHouses({ city, color }: { city: City; color: THREE.Color }) {
  const roof = color;
  const level = Math.max(1, city.level);
  const extra = Math.min(level - 1, 5); // maisons autour, en plus du donjon
  const ring = Array.from({ length: extra }, (_, i) => {
    const a = (i / Math.max(1, extra)) * Math.PI * 2 + 0.4;
    return { x: Math.cos(a) * 0.27, z: Math.sin(a) * 0.27, s: 0.7 + ((i * 37) % 3) * 0.12 };
  });
  return (
    <group>
      {/* Donjon central, un peu plus haut avec le niveau */}
      <group>
        <House roof={roof} w={0.22} h={0.2 + level * 0.03} />
        <Flag color={color} />
      </group>
      {/* Maisons satellites (apparaissent avec le niveau) */}
      {ring.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
          <House roof={roof} />
        </group>
      ))}
    </group>
  );
}

function CityBuildings({ city, color, perfMode }: { city: City; color: THREE.Color; perfMode?: boolean }) {
  return (
    <group>
      {/* Bâtiments : modèle 3D si enregistré, sinon procédural. Le drapeau/murs/
          marqueurs/pseudo restent gérés par le jeu, par-dessus. */}
      <ModelOr
        cfg={cityModelFor(city.level)}
        fallback={<ProceduralCityHouses city={city} color={color} />}
      />

      {/* Muraille de pierre */}
      {city.hasWall && (
        <group>
          {[
            { p: [0, 0.07, 0.42] as [number, number, number], r: 0 },
            { p: [0, 0.07, -0.42] as [number, number, number], r: 0 },
            { p: [0.42, 0.07, 0] as [number, number, number], r: Math.PI / 2 },
            { p: [-0.42, 0.07, 0] as [number, number, number], r: Math.PI / 2 },
          ].map((s, i) => (
            <mesh key={i} position={s.p} rotation={[0, s.r, 0]} raycast={noRaycast} castShadow>
              <boxGeometry args={[0.86, 0.14, 0.08]} />
              <meshStandardMaterial color={STONE} flatShading />
            </mesh>
          ))}
        </group>
      )}

      {/* Barre de vie du rempart */}
      {(city.wallHp ?? 0) > 0 && <WallHpBar hp={city.wallHp ?? 0} />}

      {/* Marqueur de récompense à choisir */}
      {(city.rewardsToPick ?? 0) > 0 && <RewardMarker perfMode={!!perfMode} />}

      {/* Marqueur de production en cours (grosse unité) */}
      {city.production && <ProductionMarker perfMode={!!perfMode} />}
    </group>
  );
}

export function Cities({ state, perfMode }: { state: GameState; perfMode?: boolean }) {
  return (
    <group>
      {state.cities.map((c: any) => {
        const t = tileTop(state, c.x, c.y);
        const owner = state.players[c.ownerId];
        const color = new THREE.Color(owner?.color ?? "#dddddd");
        return (
          <group key={c.id} position={[t.x, t.y, t.z]}>
            <CityBuildings city={c} color={color} perfMode={!!perfMode} />
            {owner && <NameTag text={owner.civName} color={owner.color} y={1.35} />}
          </group>
        );
      })}
    </group>
  );
}

/** Hutte : murs en pisé + toit de chaume débordant + porte. */
function Hut({ scale = 1, rot = 0 }: { scale?: number; rot?: number }) {
  return (
    <group scale={scale} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.15, 0]} raycast={noRaycast} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.19, 0.3, 8]} />
        <meshStandardMaterial color="#e6cfa0" flatShading />
      </mesh>
      {/* toit de chaume qui déborde */}
      <mesh position={[0, 0.4, 0]} raycast={noRaycast} castShadow>
        <coneGeometry args={[0.27, 0.26, 8]} />
        <meshStandardMaterial color="#a9733e" flatShading />
      </mesh>
      {/* porte */}
      <mesh position={[0, 0.11, 0.18]} raycast={noRaycast}>
        <boxGeometry args={[0.09, 0.16, 0.03]} />
        <meshStandardMaterial color="#5a3d22" flatShading />
      </mesh>
    </group>
  );
}

/** Fanion neutre flottant : signale « village à capturer ». */
function VillageBanner({ perfMode }: { perfMode?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (perfMode) return;
    if (ref.current) ref.current.position.y = 0.78 + Math.sin(clock.elapsedTime * 2.2) * 0.05;
  });
  return (
    <group ref={ref} position={[0, 0.78, 0]}>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[0.008, 0.008, 0.22, 6]} />
        <meshStandardMaterial color="#5a4632" flatShading />
      </mesh>
      <mesh position={[0.075, 0.07, 0]} raycast={noRaycast}>
        <planeGeometry args={[0.14, 0.09]} />
        <meshStandardMaterial color="#f2efe6" side={THREE.DoubleSide} flatShading />
      </mesh>
    </group>
  );
}

/** Sage mystérieux (PNJ) : silhouette encapuchonnée + orbe magique flottant. */
function ProceduralSage({ perfMode }: { perfMode?: boolean }) {
  const orb = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (perfMode) return;
    const m = orb.current;
    if (m) {
      m.position.y = 0.62 + Math.sin(clock.elapsedTime * 2) * 0.06;
      m.rotation.y = clock.elapsedTime * 1.5;
    }
  });
  return (
    <group>
      {/* robe */}
      <mesh position={[0, 0.2, 0]} raycast={noRaycast} castShadow>
        <coneGeometry args={[0.18, 0.42, 10]} />
        <meshStandardMaterial color="#5b4b9b" flatShading />
      </mesh>
      {/* tête encapuchonnée */}
      <mesh position={[0, 0.44, 0]} raycast={noRaycast} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#473c7d" flatShading />
      </mesh>
      {/* bâton */}
      <mesh position={[0.16, 0.26, 0]} rotation={[0, 0, -0.12]} raycast={noRaycast}>
        <cylinderGeometry args={[0.012, 0.012, 0.5, 6]} />
        <meshStandardMaterial color="#6b4a2f" flatShading />
      </mesh>
      {/* orbe magique flottant */}
      <mesh ref={orb} position={[0, 0.62, 0]} raycast={noRaycast}>
        <icosahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial
          color="#c9a3ff"
          emissive="#7b3ff2"
          emissiveIntensity={0.9}
          flatShading
        />
      </mesh>
    </group>
  );
}

export function Sages({ state, perfMode }: { state: GameState; perfMode?: boolean }) {
  const sages = state.tiles.filter((t: any) => t.sage);
  return (
    <group>
      {sages.map((tile: any) => {
        const t = tileTop(state, tile.x, tile.y);
        return (
          <group key={`s${tile.x},${tile.y}`} position={[t.x, t.y, t.z]}>
            <ModelOr cfg={tile.sage ? SAGE_MODELS[tile.sage] : undefined} fallback={<ProceduralSage perfMode={!!perfMode} />} />
          </group>
        );
      })}
    </group>
  );
}

/**
 * Portrait 3D d'un sage pour le pop-up de dilemme : mini-scène autonome (Canvas
 * dédié) montrant le VRAI modèle, agrandi, en auto-rotation (l'utilisateur peut
 * aussi le tourner à la souris). Repli sur la silhouette procédurale.
 */
export function SagePortrait({ name }: { name: string }) {
  const cfg = SAGE_MODELS[name];
  // Agrandi et recentré sur l'origine (origine du modèle ≈ son centre).
  const big = cfg ? { ...cfg, scale: (cfg.scale ?? 1) * 3, y: 0 } : undefined;
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 35, position: [0, 0, 4.2] }}>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#dbeeff", "#6f8a55", 0.5]} />
      <directionalLight position={[2, 4, 3]} intensity={1.1} />
      <group position={[0, -0.1, 0]}>
        <ModelOr
          cfg={big}
          fallback={
            <group scale={2.2} position={[0, -0.6, 0]}>
              <ProceduralSage />
            </group>
          }
        />
      </group>
      <OrbitControls
        autoRotate
        autoRotateSpeed={2.5}
        enablePan={false}
        target={[0, 0, 0]}
        minDistance={1.6}
        maxDistance={5}
      />
    </Canvas>
  );
}

/** Village neutre PROCÉDURAL : clairière de terre battue + grappe de huttes. */
function ProceduralVillage() {
  return (
    <group>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} receiveShadow>
        <circleGeometry args={[0.42, 20]} />
        <meshStandardMaterial color="#c1a878" flatShading />
      </mesh>
      <group position={[-0.14, 0, 0.06]}>
        <Hut scale={1} rot={0.3} />
      </group>
      <group position={[0.15, 0, -0.04]}>
        <Hut scale={0.82} rot={-0.5} />
      </group>
      <group position={[0.03, 0, 0.2]}>
        <Hut scale={0.66} rot={1.1} />
      </group>
    </group>
  );
}

export function Villages({ state, perfMode }: { state: GameState; perfMode?: boolean }) {
  const huts = state.tiles.filter((t: any) => t.village && t.cityId === undefined);
  return (
    <group>
      {huts.map((tile: any) => {
        const t = tileTop(state, tile.x, tile.y);
        return (
          <group key={`v${tile.x},${tile.y}`} position={[t.x, t.y, t.z]}>
            {/* Village : modèle 3D si enregistré, sinon huttes procédurales.
                Le fanion « à capturer » reste affiché par-dessus. */}
            <ModelOr cfg={VILLAGE_MODEL} fallback={<ProceduralVillage />} />
            <VillageBanner perfMode={!!perfMode} />
          </group>
        );
      })}
    </group>
  );
}
