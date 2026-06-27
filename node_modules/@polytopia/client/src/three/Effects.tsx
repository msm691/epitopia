/**
 * Animations & « juice » 3D. PUR rendu : on DIFFE l'état autoritaire (prev vs
 * courant) pour déclencher glissements, reculs d'attaque, apparitions, fantômes
 * de mort, anneaux d'impact, éclats de capture et textes flottants. Aucune règle.
 * (Même logique de diff que l'ancien renderer 2D useCanvas.ts, portée en 3D.)
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GameState, UnitType } from "@polytopia/shared";
import { isWater, terrainAt, tileTop, WATER_SURFACE_Y } from "./projection.js";
import { Boat, UnitMesh, HpBar, darken } from "./Units.js";

const GLIDE_MS = 240;
const LUNGE_MS = 320;
const SPAWN_MS = 320;
const GHOST_MS = 460;
const IMPACT_MS = 420;
const CAPTURE_MS = 620;
const TEXT_MS = 950;

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const clamp01 = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p);

// ---------------------------------------------------------------------------
// Hook : diff d'état -> animations
// ---------------------------------------------------------------------------

export type SceneEvent =
  | { id: number; kind: "impact"; x: number; y: number }
  | { id: number; kind: "capture"; x: number; y: number; color: string }
  | { id: number; kind: "ghost"; x: number; y: number; type: UnitType; color: string }
  | { id: number; kind: "text"; x: number; y: number; text: string; color: string }
  | { id: number; kind: "projectile"; fromX: number; fromY: number; toX: number; toY: number }
  | { id: number; kind: "confetti"; x: number; y: number; color: string };

export interface SceneAnim {
  glides: MutableRefObject<Map<string, { fromX: number; fromY: number; t0: number }>>;
  lunges: MutableRefObject<Map<string, { dx: number; dy: number; t0: number }>>;
  spawns: MutableRefObject<Map<string, { t0: number }>>;
  events: SceneEvent[];
  removeEvent: (id: number) => void;
}

export function useSceneAnimations(state: GameState): SceneAnim {
  const glides = useRef(new Map<string, { fromX: number; fromY: number; t0: number }>());
  const lunges = useRef(new Map<string, { dx: number; dy: number; t0: number }>());
  const spawns = useRef(new Map<string, { t0: number }>());
  const [events, setEvents] = useState<SceneEvent[]>([]);
  const idRef = useRef(0);
  const prevRef = useRef<GameState | null>(null);
  const fittedKey = useRef("");

  useEffect(() => {
    const key = `${state.width}x${state.height}`;
    if (fittedKey.current !== key) {
      // Nouvelle carte : pas d'animation de masse.
      fittedKey.current = key;
      prevRef.current = state;
      return;
    }
    const prev = prevRef.current;
    if (!prev || prev === state) {
      prevRef.current = state;
      return;
    }
    const now = performance.now();
    const hits: { x: number; y: number }[] = [];
    const fresh: SceneEvent[] = [];
    const nextId = () => idRef.current++;

    // Déplacements -> glissement.
    for (const u of state.units) {
      const pu = prev.units.find((x) => x.id === u.id);
      if (pu && (pu.x !== u.x || pu.y !== u.y)) {
        glides.current.set(u.id, { fromX: pu.x, fromY: pu.y, t0: now });
      }
    }
    // Apparitions (recrutement) -> pop.
    for (const u of state.units) {
      if (!prev.units.some((x) => x.id === u.id)) spawns.current.set(u.id, { t0: now });
    }
    // Pertes de PV / morts -> impact + dégâts / fantôme.
    for (const pu of prev.units) {
      const nu = state.units.find((x) => x.id === pu.id);
      const owner = prev.players[pu.ownerId];
      if (!nu) {
        fresh.push({ id: nextId(), kind: "impact", x: pu.x, y: pu.y });
        fresh.push({
          id: nextId(),
          kind: "ghost",
          x: pu.x,
          y: pu.y,
          type: pu.type,
          color: owner?.color ?? "#888888",
        });
        hits.push({ x: pu.x, y: pu.y });
      } else if (nu.hp < pu.hp) {
        fresh.push({ id: nextId(), kind: "impact", x: nu.x, y: nu.y });
        fresh.push({ id: nextId(), kind: "text", x: nu.x, y: nu.y, text: `-${pu.hp - nu.hp}`, color: "#ff8a8a" });
        hits.push({ x: nu.x, y: nu.y });
      }
    }
    // Attaquant -> recul vers la cible touchée la plus proche.
    for (const u of state.units) {
      const pu = prev.units.find((x) => x.id === u.id);
      const attacked = pu && !pu.hasAttacked && u.hasAttacked && pu.x === u.x && pu.y === u.y;
      if (attacked && hits.length > 0) {
        let best = hits[0]!;
        let bestD = Infinity;
        for (const h of hits) {
          const d = Math.hypot(h.x - u.x, h.y - u.y);
          if (d > 0 && d < bestD) {
            bestD = d;
            best = h;
          }
        }
        const len = Math.hypot(best.x - u.x, best.y - u.y) || 1;
        if (len > 1.5) {
          fresh.push({ id: nextId(), kind: "projectile", fromX: u.x, fromY: u.y, toX: best.x, toY: best.y });
        } else {
          lunges.current.set(u.id, { dx: (best.x - u.x) / len, dy: (best.y - u.y) / len, t0: now });
        }
      }
    }
    // Captures de ville -> éclat coloré.
    for (const nc of state.cities) {
      const pc = prev.cities.find((c) => c.id === nc.id);
      if (pc && pc.ownerId !== nc.ownerId) {
        const owner = state.players[nc.ownerId];
        fresh.push({ id: nextId(), kind: "capture", x: nc.x, y: nc.y, color: owner?.color ?? "#ffffff" });
        fresh.push({ id: nextId(), kind: "confetti", x: nc.x, y: nc.y, color: owner?.color ?? "#ffffff" });
      }
    }
    // Gains d'étoiles -> texte doré sur la capitale.
    for (const np of state.players) {
      const pp = prev.players.find((x) => x.id === np.id);
      if (pp && np.stars > pp.stars) {
        const cap = state.cities.find((c) => c.ownerId === np.id);
        if (cap) {
          fresh.push({ id: nextId(), kind: "text", x: cap.x, y: cap.y, text: `+${np.stars - pp.stars}★`, color: "#ffd86b" });
        }
      }
    }

    if (fresh.length > 0) setEvents((e) => [...e, ...fresh]);
    prevRef.current = state;
  }, [state]);

  const removeEvent = useMemo(
    () => (id: number) => setEvents((e) => e.filter((x) => x.id !== id)),
    [],
  );

  return { glides, lunges, spawns, events, removeEvent };
}

// ---------------------------------------------------------------------------
// Unités animées
// ---------------------------------------------------------------------------

export function AnimatedUnits({ state, anim }: { state: GameState; anim: SceneAnim }) {
  const groups = useRef(new Map<string, THREE.Group>());
  // Cap (rotation Y cible) de chaque unité, conservé entre les déplacements.
  const headings = useRef(new Map<string, number>());

  // Y posé : surface de l'eau si la case est de l'eau (bateau), sinon dessus du terrain.
  const surfaceY = (gx: number, gy: number) =>
    isWater(terrainAt(state, gx, gy)) ? WATER_SURFACE_Y : tileTop(state, gx, gy).y;

  useFrame(() => {
    const now = performance.now();
    for (const u of state.units) {
      const g = groups.current.get(u.id);
      if (!g) continue;
      const to = tileTop(state, u.x, u.y);
      let x = to.x;
      let y = surfaceY(u.x, u.y);
      let z = to.z;
      const glide = anim.glides.current.get(u.id);
      if (glide) {
        const p = clamp01((now - glide.t0) / GLIDE_MS);
        const e = easeOut(p);
        const from = tileTop(state, glide.fromX, glide.fromY);
        const fromY = surfaceY(glide.fromX, glide.fromY);
        const toY = y;
        x = from.x + (to.x - from.x) * e;
        y = fromY + (toY - fromY) * e + Math.sin(p * Math.PI) * 0.12; // petit saut
        z = from.z + (to.z - from.z) * e;
        if (p >= 1) anim.glides.current.delete(u.id);
      }
      const lunge = anim.lunges.current.get(u.id);
      if (lunge) {
        const p = clamp01((now - lunge.t0) / LUNGE_MS);
        const amt = Math.sin(p * Math.PI) * 0.3;
        x += lunge.dx * amt;
        z += lunge.dy * amt;
        if (p >= 1) anim.lunges.current.delete(u.id);
      }
      g.position.set(x, y, z);

      // Orientation : l'unité regarde dans la direction de son déplacement
      // (le modèle face à la caméra = +Z au cap 0). Lissé, et conservé à l'arrêt.
      let heading = headings.current.get(u.id);
      if (glide) {
        const hx = u.x - glide.fromX;
        const hz = u.y - glide.fromY;
        if (hx !== 0 || hz !== 0) {
          heading = Math.atan2(hx, hz);
          headings.current.set(u.id, heading);
        }
      }
      if (heading !== undefined) {
        let diff = heading - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // plus court chemin
        g.rotation.y += diff * 0.25;
      }

      const spawn = anim.spawns.current.get(u.id);
      if (spawn) {
        const p = clamp01((now - spawn.t0) / SPAWN_MS);
        g.scale.setScalar(0.4 + 0.6 * easeOut(p));
        if (p >= 1) anim.spawns.current.delete(u.id);
      } else {
        g.scale.setScalar(1);
      }
    }
  });

  return (
    <group>
      {state.units.map((u) => {
        const to = tileTop(state, u.x, u.y);
        const owner = state.players[u.ownerId];
        const base = new THREE.Color(owner?.color ?? "#cccccc");
        const spent = u.hasMoved && u.hasAttacked;
        const onWater = u.isEmbarked ?? false;
        return (
          <group
            key={u.id}
            position={[to.x, surfaceY(u.x, u.y), to.z]}
            ref={(el) => {
              if (el) groups.current.set(u.id, el);
              else groups.current.delete(u.id);
            }}
          >
            {onWater && <Boat color={base} />}
            {/* Sur l'eau, l'unité est ASSISE dans la coque : remontée au pont et
                un peu réduite pour tenir dans la barque (sinon elle a l'air
                plantée dans l'eau). Sur terre : pas d'offset, taille pleine. */}
            <group position={[0, onWater ? 0.1 : 0, 0]} scale={onWater ? 0.8 : 1}>
              <UnitMesh type={u.type} color={spent ? darken(base, 0.25) : base} onWater={onWater} />
            </group>
            <HpBar unit={u} />
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Effets transitoires
// ---------------------------------------------------------------------------

const noRaycast = () => null;

function setOpacity(root: THREE.Object3D, value: number) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.transparent = true;
        m.depthWrite = false;
        m.opacity = value;
      }
    }
  });
}

function GhostFx({ state, ev, onDone }: { state: GameState; ev: Extract<SceneEvent, { kind: "ghost" }>; onDone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const t0 = useRef(performance.now());
  const base = tileTop(state, ev.x, ev.y);
  const color = useMemo(() => new THREE.Color(ev.color), [ev.color]);
  useFrame(() => {
    const p = clamp01((performance.now() - t0.current) / GHOST_MS);
    const g = ref.current;
    if (g) {
      g.position.set(base.x, base.y + p * 0.4, base.z);
      g.scale.setScalar(Math.max(0.001, 1 - 0.5 * p));
      setOpacity(g, 1 - p);
    }
    if (p >= 1) onDone();
  });
  return (
    <group ref={ref} position={[base.x, base.y, base.z]}>
      <UnitMesh type={ev.type} color={color} />
    </group>
  );
}

function ImpactFx({ state, ev, onDone }: { state: GameState; ev: Extract<SceneEvent, { kind: "impact" }>; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const t0 = useRef(performance.now());
  const base = tileTop(state, ev.x, ev.y);
  useFrame(() => {
    const p = clamp01((performance.now() - t0.current) / IMPACT_MS);
    const s = 0.3 + 1.1 * p;
    if (ref.current) ref.current.scale.setScalar(s);
    if (matRef.current) matRef.current.opacity = 1 - p;
    if (p >= 1) onDone();
  });
  return (
    <mesh ref={ref} position={[base.x, base.y + 0.05, base.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <ringGeometry args={[0.28, 0.4, 24]} />
      <meshBasicMaterial ref={matRef} color="#ff6a5a" transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CaptureFx({ state, ev, onDone }: { state: GameState; ev: Extract<SceneEvent, { kind: "capture" }>; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const t0 = useRef(performance.now());
  const base = tileTop(state, ev.x, ev.y);
  useFrame(() => {
    const p = clamp01((performance.now() - t0.current) / CAPTURE_MS);
    const s = 0.3 + 1.7 * p;
    if (ref.current) ref.current.scale.setScalar(s);
    if (matRef.current) matRef.current.opacity = 0.9 * (1 - p);
    if (p >= 1) onDone();
  });
  return (
    <mesh ref={ref} position={[base.x, base.y + 0.06, base.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <ringGeometry args={[0.3, 0.46, 28]} />
      <meshBasicMaterial ref={matRef} color={ev.color} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Texte rendu sur un canvas -> texture (offline, pas de police réseau). */
function makeTextTexture(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const font = 52;
  const pad = 12;
  const probe = document.createElement("canvas").getContext("2d");
  const fontSpec = `bold ${font}px system-ui, -apple-system, sans-serif`;
  let w = 60;
  if (probe) {
    probe.font = fontSpec;
    w = probe.measureText(text).width;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w) + pad * 2;
  canvas.height = font + pad * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = fontSpec;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return { tex, aspect: canvas.width / canvas.height };
}

function TextFx({ state, ev, onDone }: { state: GameState; ev: Extract<SceneEvent, { kind: "text" }>; onDone: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const t0 = useRef(performance.now());
  const base = tileTop(state, ev.x, ev.y);
  const { tex, aspect } = useMemo(() => makeTextTexture(ev.text, ev.color), [ev.text, ev.color]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    const p = clamp01((performance.now() - t0.current) / TEXT_MS);
    if (groupRef.current) groupRef.current.position.set(base.x, base.y + 0.7 + p * 0.8, base.z);
    if (matRef.current) matRef.current.opacity = 1 - p * p;
    if (p >= 1) onDone();
  });
  const h = 0.42;
  return (
    <Billboard ref={groupRef} position={[base.x, base.y + 0.7, base.z]}>
      <mesh raycast={noRaycast}>
        <planeGeometry args={[h * aspect, h]} />
        <meshBasicMaterial ref={matRef} map={tex} transparent depthTest={false} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

export function Effects({ state, events, removeEvent }: { state: GameState; events: SceneEvent[]; removeEvent: (id: number) => void }) {
  return (
    <group>
      {events.map((ev) => {
        const done = () => removeEvent(ev.id);
        switch (ev.kind) {
          case "ghost":
            return <GhostFx key={ev.id} state={state} ev={ev} onDone={done} />;
          case "impact":
            return <ImpactFx key={ev.id} state={state} ev={ev} onDone={done} />;
          case "capture":
            return <CaptureFx key={ev.id} state={state} ev={ev} onDone={done} />;
          case "text":
            return <TextFx key={ev.id} state={state} ev={ev} onDone={done} />;
          case "projectile":
            return <ProjectileFx key={ev.id} state={state} ev={ev} onDone={done} />;
          case "confetti":
            return <ConfettiFx key={ev.id} state={state} ev={ev} onDone={done} />;
        }
      })}
    </group>
  );
}

const PROJECTILE_MS = 250;

function ProjectileFx({ state, ev, onDone }: { state: GameState; ev: Extract<SceneEvent, { kind: "projectile" }>; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const t0 = useRef(performance.now());
  const from = tileTop(state, ev.fromX, ev.fromY);
  const to = tileTop(state, ev.toX, ev.toY);

  useFrame(() => {
    const p = clamp01((performance.now() - t0.current) / PROJECTILE_MS);
    if (ref.current) {
      // Parabole légère
      const x = from.x + (to.x - from.x) * p;
      const z = from.z + (to.z - from.z) * p;
      const y = from.y + (to.y - from.y) * p + Math.sin(p * Math.PI) * 1.5;
      ref.current.position.set(x, y + 0.3, z);
    }
    if (p >= 1) onDone();
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.15, 8, 8]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

const CONFETTI_MS = 1200;

function ConfettiFx({ state, ev, onDone }: { state: GameState; ev: Extract<SceneEvent, { kind: "confetti" }>; onDone: () => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const t0 = useRef(performance.now());
  const base = tileTop(state, ev.x, ev.y);
  const count = 30;

  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        rx: Math.random(), ry: Math.random(), rz: Math.random()
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const t = clamp01((performance.now() - t0.current) / CONFETTI_MS);
    const dt = 1 / 60;
    if (ref.current) {
      for (let i = 0; i < count; i++) {
        const p = particles[i]!;
        p.vy -= 9.8 * dt * 0.5; // gravité légère
        dummy.position.set(base.x + p.vx * t, base.y + 0.5 + p.vy * t, base.z + p.vz * t);
        dummy.rotation.set(t * p.rx * 10, t * p.ry * 10, t * p.rz * 10);
        dummy.scale.setScalar(Math.max(0, 1 - t)); // Rétrécissement
        dummy.updateMatrix();
        ref.current.setMatrixAt(i, dummy.matrix);
      }
      ref.current.instanceMatrix.needsUpdate = true;
    }
    if (t >= 1) onDone();
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.1, 0.1]} />
      <meshBasicMaterial color={ev.color} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Anneau pulsé (sélection / confirmation)
// ---------------------------------------------------------------------------

export function PulseRing({ state, cell, color }: { state: GameState; cell: { x: number; y: number } | undefined; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
      ref.current.scale.set(s, s, 1);
    }
  });
  if (!cell) return null;
  const t = tileTop(state, cell.x, cell.y);
  // Sur l'eau, monter au-dessus des crêtes de vagues (sinon l'anneau est noyé).
  const y = (isWater(terrainAt(state, cell.x, cell.y)) ? WATER_SURFACE_Y + 0.13 : t.y) + 0.03;
  return (
    <mesh ref={ref} position={[t.x, y, t.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={noRaycast}>
      <ringGeometry args={[0.4, 0.5, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
