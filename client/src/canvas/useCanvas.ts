/**
 * Hook React : renderer ISO plein écran, caméra fluide, et ANIMATIONS.
 * - Calque monde hors-écran (renderWorld) : terrain/ressources/villes/sélection.
 * - Couche dynamique (drawDynamic) redessinée chaque frame : unités (glissement),
 *   impacts de combat, textes flottants.
 * Le pan/zoom ne fait que recoller le monde + redessiner la couche dynamique.
 * Aucune règle de jeu ici.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Coord, GameState } from "@polytopia/shared";
import {
  blitWorld,
  drawDynamic,
  EMPTY_ANIMS,
  isoLayout,
  renderWorld,
  screenToTile,
  type Camera,
  type FrameAnims,
  type IsoLayout,
  type Overlay,
} from "./GridRenderer.js";
import { createAssetStore, type AssetStore } from "./assets.js";

const BASE_TILE_W = 64;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
/** Zoom initial : viser ~10 tuiles visibles, sans dépasser ce facteur. */
const TARGET_TILES = 10;
const INIT_MAX_SCALE = 1.6;
const TAP_THRESHOLD = 12; // tolérance tactile (doigt) en px
const RERENDER_DEBOUNCE_MS = 140;
const GLIDE_MS = 220;
const LUNGE_MS = 320;
const SPAWN_MS = 320;
const GHOST_MS = 420;
const IMPACT_MS = 380;
const CAPTURE_MS = 550;
const POP_MS = 850;

interface GlideRaw { fromX: number; fromY: number; t0: number }
interface LungeRaw { dx: number; dy: number; t0: number }
interface TimedRaw { x: number; y: number; t0: number }
interface GhostRaw extends TimedRaw { type: GameState["units"][number]["type"]; color: string; hp: number }
interface CaptureRaw extends TimedRaw { color: string }
interface PopRaw extends TimedRaw { text: string; color: string }

export function useGridCanvas(
  state: GameState,
  overlay: Overlay,
  onTileClick: (coord: Coord) => void,
  focus?: Coord,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const clickRef = useRef(onTileClick);
  clickRef.current = onTileClick;

  const layout = useMemo(() => isoLayout(state, BASE_TILE_W), [state]);
  const layoutRef = useRef<IsoLayout>(layout);
  layoutRef.current = layout;
  const stateRef = useRef(state);
  stateRef.current = state;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const prevStateRef = useRef<GameState | null>(null);

  const cameraRef = useRef<Camera>({ scale: 1, x: 0, y: 0 });
  const fittedForRef = useRef<string>("");
  const focusRef = useRef<Coord | undefined>(focus);
  focusRef.current = focus;

  const assetsRef = useRef<AssetStore | null>(null);
  if (!assetsRef.current) assetsRef.current = createAssetStore();

  const worldRef = useRef<HTMLCanvasElement | null>(null);
  if (!worldRef.current) worldRef.current = document.createElement("canvas");
  const worldScaleRef = useRef(1);

  // Animations en cours.
  const glides = useRef(new Map<string, GlideRaw>());
  const lunges = useRef(new Map<string, LungeRaw>());
  const spawns = useRef(new Map<string, { t0: number }>());
  const ghosts = useRef<GhostRaw[]>([]);
  const impacts = useRef<TimedRaw[]>([]);
  const captures = useRef<CaptureRaw[]>([]);
  const pops = useRef<PopRaw[]>([]);
  const animsRef = useRef<FrameAnims>(EMPTY_ANIMS);
  const animRunning = useRef(false);
  const anyAnim = () =>
    glides.current.size ||
    lunges.current.size ||
    spawns.current.size ||
    ghosts.current.length ||
    impacts.current.length ||
    captures.current.length ||
    pops.current.length;

  // ----- Dessin -----
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const world = worldRef.current;
    if (!canvas || !world) return;
    blitWorld(canvas, world, cameraRef.current, worldScaleRef.current);
    drawDynamic(canvas, stateRef.current, layoutRef.current, cameraRef.current, animsRef.current, assetsRef.current ?? undefined);
  }, []);

  const drawScheduled = useRef(false);
  const scheduleDraw = useCallback(() => {
    if (drawScheduled.current) return;
    drawScheduled.current = true;
    requestAnimationFrame(() => {
      drawScheduled.current = false;
      drawFrame();
    });
  }, [drawFrame]);

  const renderWorldNow = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    worldScaleRef.current = cameraRef.current.scale;
    renderWorld(world, stateRef.current, overlayRef.current, layoutRef.current, worldScaleRef.current, assetsRef.current ?? undefined);
    drawFrame();
  }, [drawFrame]);

  const startAnim = useCallback(() => {
    if (animRunning.current) return;
    animRunning.current = true;
    const tick = () => {
      const now = performance.now();
      const g = new Map<string, { fromX: number; fromY: number; p: number }>();
      for (const [id, raw] of glides.current) {
        const p = Math.min(1, (now - raw.t0) / GLIDE_MS);
        g.set(id, { fromX: raw.fromX, fromY: raw.fromY, p });
        if (p >= 1) glides.current.delete(id);
      }
      const lu = new Map<string, { dx: number; dy: number; p: number }>();
      for (const [id, raw] of lunges.current) {
        const p = Math.min(1, (now - raw.t0) / LUNGE_MS);
        lu.set(id, { dx: raw.dx, dy: raw.dy, p });
        if (p >= 1) lunges.current.delete(id);
      }
      const sp = new Map<string, { p: number }>();
      for (const [id, raw] of spawns.current) {
        const p = Math.min(1, (now - raw.t0) / SPAWN_MS);
        sp.set(id, { p });
        if (p >= 1) spawns.current.delete(id);
      }
      const gh: { x: number; y: number; type: GhostRaw["type"]; color: string; hp: number; p: number }[] = [];
      ghosts.current = ghosts.current.filter((r) => {
        const p = Math.min(1, (now - r.t0) / GHOST_MS);
        gh.push({ x: r.x, y: r.y, type: r.type, color: r.color, hp: r.hp, p });
        return p < 1;
      });
      const im: { x: number; y: number; p: number }[] = [];
      impacts.current = impacts.current.filter((r) => {
        const p = Math.min(1, (now - r.t0) / IMPACT_MS);
        im.push({ x: r.x, y: r.y, p });
        return p < 1;
      });
      const cap: { x: number; y: number; color: string; p: number }[] = [];
      captures.current = captures.current.filter((r) => {
        const p = Math.min(1, (now - r.t0) / CAPTURE_MS);
        cap.push({ x: r.x, y: r.y, color: r.color, p });
        return p < 1;
      });
      const po: { x: number; y: number; text: string; color: string; p: number }[] = [];
      pops.current = pops.current.filter((r) => {
        const p = Math.min(1, (now - r.t0) / POP_MS);
        po.push({ x: r.x, y: r.y, text: r.text, color: r.color, p });
        return p < 1;
      });
      animsRef.current = { glides: g, lunges: lu, spawns: sp, ghosts: gh, impacts: im, captures: cap, pops: po };
      drawFrame();
      if (anyAnim()) {
        requestAnimationFrame(tick);
      } else {
        animRunning.current = false;
        animsRef.current = EMPTY_ANIMS;
        drawFrame();
      }
    };
    requestAnimationFrame(tick);
  }, [drawFrame]);

  const rerenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRerender = useCallback(() => {
    if (rerenderTimer.current) clearTimeout(rerenderTimer.current);
    rerenderTimer.current = setTimeout(renderWorldNow, RERENDER_DEBOUNCE_MS);
  }, [renderWorldNow]);

  const fitCamera = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const l = layoutRef.current;
    const focusAt = focusRef.current;
    if (focusAt) {
      // Centre sur la capitale, zoom confortable (cases assez grosses au doigt).
      const scale = Math.max(MIN_SCALE, Math.min(INIT_MAX_SCALE, Math.min(cw, ch) / (TARGET_TILES * l.hw)));
      const fx = l.originX + (focusAt.x - focusAt.y) * l.hw;
      const fy = l.originY + (focusAt.x + focusAt.y) * l.hh;
      // Capitale un peu au-dessus du centre (place pour la barre d'action en bas).
      cameraRef.current = { scale, x: cw / 2 - fx * scale, y: ch * 0.42 - fy * scale };
    } else {
      const scale = Math.min(cw / l.width, ch / l.height) * 0.92;
      cameraRef.current = { scale, x: (cw - l.width * scale) / 2, y: (ch - l.height * scale) / 2 };
    }
    renderWorldNow();
  }, [renderWorldNow]);

  // Canvas plein conteneur.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${wrapper.clientWidth}px`;
      canvas.style.height = `${wrapper.clientHeight}px`;
      canvas.width = Math.round(wrapper.clientWidth * dpr);
      canvas.height = Math.round(wrapper.clientHeight * dpr);
      drawFrame();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [drawFrame]);

  // Changement d'état/overlay : calcule les animations puis redessine.
  useEffect(() => {
    const key = `${state.width}x${state.height}`;
    if (fittedForRef.current !== key) {
      fittedForRef.current = key;
      prevStateRef.current = state;
      fitCamera();
      return;
    }
    const prev = prevStateRef.current;
    if (prev && prev !== state) {
      const now = performance.now();
      const hitTiles: Coord[] = []; // cases touchées ce diff (pour orienter le coup)

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
      // Pertes de PV / morts -> impact + dégâts ou fantôme.
      for (const pu of prev.units) {
        const nu = state.units.find((x) => x.id === pu.id);
        if (!nu) {
          impacts.current.push({ x: pu.x, y: pu.y, t0: now });
          const owner = prev.players[pu.ownerId];
          ghosts.current.push({
            x: pu.x,
            y: pu.y,
            type: pu.type,
            color: owner?.color ?? "#888",
            hp: pu.hp,
            t0: now,
          });
          hitTiles.push({ x: pu.x, y: pu.y });
        } else if (nu.hp < pu.hp) {
          impacts.current.push({ x: nu.x, y: nu.y, t0: now });
          pops.current.push({
            x: nu.x,
            y: nu.y,
            text: `-${pu.hp - nu.hp}`,
            color: "#ff7b7b",
            t0: now,
          });
          hitTiles.push({ x: nu.x, y: nu.y });
        }
      }
      // Attaquant -> coup (lunge) vers la cible la plus proche touchée.
      for (const u of state.units) {
        const pu = prev.units.find((x) => x.id === u.id);
        const attacked = pu && !pu.hasAttacked && u.hasAttacked && pu.x === u.x && pu.y === u.y;
        if (attacked && hitTiles.length > 0) {
          let best = hitTiles[0]!;
          let bestD = Infinity;
          for (const h of hitTiles) {
            const d = Math.hypot(h.x - u.x, h.y - u.y);
            if (d > 0 && d < bestD) {
              bestD = d;
              best = h;
            }
          }
          const len = Math.hypot(best.x - u.x, best.y - u.y) || 1;
          lunges.current.set(u.id, { dx: (best.x - u.x) / len, dy: (best.y - u.y) / len, t0: now });
        }
      }
      // Captures de ville -> éclat.
      for (const nc of state.cities) {
        const pc = prev.cities.find((c) => c.id === nc.id);
        if (pc && pc.ownerId !== nc.ownerId) {
          const owner = state.players[nc.ownerId];
          captures.current.push({ x: nc.x, y: nc.y, color: owner?.color ?? "#fff", t0: now });
        }
      }
      // Gains d'étoiles -> pop doré sur la capitale.
      for (const np of state.players) {
        const pp = prev.players.find((x) => x.id === np.id);
        if (pp && np.stars > pp.stars) {
          const cap = state.cities.find((c) => c.ownerId === np.id);
          if (cap) {
            pops.current.push({
              x: cap.x,
              y: cap.y,
              text: `+${np.stars - pp.stars}⭐`,
              color: "#ffd86b",
              t0: now,
            });
          }
        }
      }
    }
    prevStateRef.current = state;
    renderWorldNow();
    if (anyAnim()) startAnim();
  }, [state, overlay, fitCamera, renderWorldNow, startAnim]);

  // Redessine le monde quand un PNG se charge.
  useEffect(() => {
    const off = assetsRef.current?.onChange(renderWorldNow);
    return off;
  }, [renderWorldNow]);

  // ----- Caméra (pan / zoom / pinch) -----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef(false);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const pinchDist = useRef(0);

  const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  const zoomAt = (factor: number, px: number, py: number) => {
    const cam = cameraRef.current;
    const ns = clampScale(cam.scale * factor);
    const k = ns / cam.scale;
    cameraRef.current = { scale: ns, x: px - (px - cam.x) * k, y: py - (py - cam.y) * k };
    scheduleDraw();
    scheduleRerender();
  };
  const localPoint = (e: PointerEvent | WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e.nativeEvent);
    // On enregistre le pointeur AVANT la capture (qui peut échouer sur mobile).
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      dragging.current = true;
      downPos.current = p;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinchDist.current = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* certains navigateurs tactiles refusent la capture : sans gravité */
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      const prev = pointers.current.get(e.pointerId)!;
      const p = localPoint(e.nativeEvent);
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        if (pinchDist.current > 0) {
          const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
          zoomAt(dist / pinchDist.current, mid.x, mid.y);
        }
        pinchDist.current = dist;
        return;
      }
      if (dragging.current) {
        cameraRef.current.x += p.x - prev.x;
        cameraRef.current.y += p.y - prev.y;
        scheduleDraw();
      }
    },
    [scheduleDraw],
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasSingle = pointers.current.size === 1;
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    dragging.current = pointers.current.size > 0;
    // Tap = lever du doigt près du point d'appui (distance NETTE, robuste au jitter).
    const start = downPos.current;
    if (wasSingle && p && start) {
      const net = Math.hypot(p.x - start.x, p.y - start.y);
      if (net < TAP_THRESHOLD) {
        const cam = cameraRef.current;
        const wx = (p.x - cam.x) / cam.scale;
        const wy = (p.y - cam.y) / cam.scale;
        clickRef.current(screenToTile(layoutRef.current, wx, wy));
      }
    }
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      const p = localPoint(e.nativeEvent);
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduleDraw, scheduleRerender],
  );

  return {
    wrapperRef,
    canvasRef,
    fitCamera,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer, onWheel },
  };
}
