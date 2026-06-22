/**
 * Rendu Canvas 2D ISOMÉTRIQUE et PUR (état + overlay).
 * La grille reste x,y (engine inchangé) ; l'iso n'est qu'une projection.
 * Utilise des images (AssetStore) si dispo, sinon un repli losange + emoji.
 * AUCUNE règle de jeu ici.
 */

import type { Coord, GameState, Resource, Terrain, UnitType } from "@polytopia/shared";
import type { AssetStore } from "./assets.js";

/** Largeur d'un losange (la hauteur vaut la moitié). Pilote l'échelle iso. */
export const DEFAULT_TILE_W = 64;
const MARGIN = 10;
/** Marge haute pour les sprites qui "dépassent" vers le haut. */
const liftFor = (tileW: number) => tileW * 0.5;

export interface Overlay {
  selected?: Coord | undefined;
  moves?: readonly Coord[] | undefined;
  attacks?: readonly Coord[] | undefined;
  harvests?: readonly Coord[] | undefined;
  /** Cible d'une action en attente de confirmation (anneau doré bien visible). */
  pending?: Coord | undefined;
}

/** Animations de la frame courante (progressions 0..1 calculées par le hook). */
export interface FrameAnims {
  /** unitId -> départ + progression du glissement. */
  glides: Map<string, { fromX: number; fromY: number; p: number }>;
  /** unitId -> direction (tile) d'un coup porté (aller-retour). */
  lunges: Map<string, { dx: number; dy: number; p: number }>;
  /** unitId -> apparition (pop) d'une unité recrutée. */
  spawns: Map<string, { p: number }>;
  /** unités en train de mourir (fondu). */
  ghosts: ReadonlyArray<{ x: number; y: number; type: UnitType; color: string; hp: number; p: number }>;
  /** impacts de combat (anneau rouge). */
  impacts: ReadonlyArray<{ x: number; y: number; p: number }>;
  /** captures de ville (éclat coloré). */
  captures: ReadonlyArray<{ x: number; y: number; color: string; p: number }>;
  /** textes flottants (dégâts, étoiles…). */
  pops: ReadonlyArray<{ x: number; y: number; text: string; color: string; p: number }>;
}

export const EMPTY_ANIMS: FrameAnims = {
  glides: new Map(),
  lunges: new Map(),
  spawns: new Map(),
  ghosts: [],
  impacts: [],
  captures: [],
  pops: [],
};

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

/** Géométrie iso pré-calculée pour un état + une taille de losange. */
export interface IsoLayout {
  tileW: number;
  hw: number; // demi-largeur
  hh: number; // demi-hauteur
  originX: number;
  originY: number;
  width: number; // taille CSS du canvas
  height: number;
}

export function isoLayout(state: GameState, tileW: number): IsoLayout {
  const hw = tileW / 2;
  const hh = tileW / 4; // losange 2:1
  const lift = liftFor(tileW);
  return {
    tileW,
    hw,
    hh,
    originX: MARGIN + state.height * hw,
    originY: MARGIN + lift + hh,
    width: 2 * MARGIN + (state.width + state.height) * hw,
    height: 2 * MARGIN + lift + (state.width + state.height) * hh,
  };
}

/** Centre écran (CSS px) d'une case. */
function tileCenter(layout: IsoLayout, x: number, y: number): Coord {
  return {
    x: layout.originX + (x - y) * layout.hw,
    y: layout.originY + (x + y) * layout.hh,
  };
}

/** Convertit un point écran (CSS px) en case de la grille. */
export function screenToTile(layout: IsoLayout, sx: number, sy: number): Coord {
  const u = (sx - layout.originX) / layout.hw;
  const v = (sy - layout.originY) / layout.hh;
  return { x: Math.round((u + v) / 2), y: Math.round((v - u) / 2) };
}

/** Caméra : zoom (scale) + translation (x,y) en pixels CSS. */
export interface Camera {
  scale: number;
  x: number;
  y: number;
}

const TERRAIN_COLORS: Record<Terrain, [string, string]> = {
  champ: ["#74c258", "#5aa03e"],
  foret: ["#3d8b4f", "#2c6238"],
  montagne: ["#9aa0a8", "#787d86"],
  eau: ["#4aa3df", "#3576ad"],
  ocean: ["#2f78a8", "#1f5176"],
};
const TERRAIN_DECOR: Partial<Record<Terrain, string>> = {
  foret: "🌲",
  montagne: "⛰️",
};
const RESOURCE_ICONS: Record<Resource, string> = {
  fruits: "🍎",
  gibier: "🦌",
  poisson: "🐟",
  cereales: "🌾",
  minerai: "⛏️",
  bois: "🪵",
  metal: "⚙️",
  luxe: "💎",
};
const UNIT_ICONS: Record<UnitType, string> = {
  guerrier: "⚔️",
  epeiste: "🗡️",
  archer: "🏹",
  catapulte: "🧨",
  cavalier: "🐎",
  chevalier: "🏇",
  defenseur: "🛡️",
  geant: "🗿",
};

function diamondPath(ctx: CanvasRenderingContext2D, c: Coord, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - hh);
  ctx.lineTo(c.x + hw, c.y);
  ctx.lineTo(c.x, c.y + hh);
  ctx.lineTo(c.x - hw, c.y);
  ctx.closePath();
}

function icon(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number): void {
  ctx.font = `${Math.round(px)}px "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

function shadow(ctx: CanvasRenderingContext2D, c: Coord, hw: number, hh: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + hh * 0.25, hw * 0.5, hh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Dessine TOUTE la carte dans un canvas hors-écran (coordonnées monde, à
 * l'échelle `scale`). Coûteux : à n'appeler que quand le contenu change, pas à
 * chaque mouvement de caméra.
 */
export function renderWorld(
  world: HTMLCanvasElement,
  state: GameState,
  overlay: Overlay,
  layout: IsoLayout,
  scale: number,
  assets?: AssetStore,
): void {
  const ctx = world.getContext("2d");
  if (!ctx) throw new Error("Contexte 2D indisponible");
  const dpr = window.devicePixelRatio || 1;
  const { hw, hh, tileW } = layout;

  const pxW = Math.max(1, Math.round(layout.width * scale * dpr));
  const pxH = Math.max(1, Math.round(layout.height * scale * dpr));
  if (world.width !== pxW) world.width = pxW;
  if (world.height !== pxH) world.height = pxH;

  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);

  // 1. Tuiles (losanges) — l'ordre n'importe pas (faces planes).
  for (const tile of state.tiles) {
    const c = tileCenter(layout, tile.x, tile.y);
    const timg = assets?.get(`terrain/${tile.terrain}`);
    if (timg) {
      ctx.drawImage(timg, c.x - hw, c.y - hh, tileW, tileW * 0.75);
    } else {
      const [a, b] = TERRAIN_COLORS[tile.terrain];
      const g = ctx.createLinearGradient(c.x, c.y - hh, c.x, c.y + hh);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      diamondPath(ctx, c, hw, hh);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 2. Surbrillances (déplacement / attaque / récolte).
  diamonds(ctx, layout, overlay.moves, "rgba(255,235,120,0.45)");
  diamonds(ctx, layout, overlay.attacks, "rgba(230,60,60,0.5)");
  diamonds(ctx, layout, overlay.harvests, "rgba(80,220,150,0.5)");

  // 3. Objets (décor terrain, ressources, villes, unités) triés en profondeur.
  interface Drawable { depth: number; order: number; run: () => void }
  const items: Drawable[] = [];
  for (const tile of state.tiles) {
    const c = tileCenter(layout, tile.x, tile.y);
    const depth = tile.x + tile.y;
    const decor = TERRAIN_DECOR[tile.terrain];
    if (decor && !assets?.get(`terrain/${tile.terrain}`)) {
      items.push({ depth, order: 0, run: () => icon(ctx, decor, c.x, c.y - hh * 0.35, tileW * 0.4) });
    }
    if (tile.resource) {
      const rimg = assets?.get(`resource/${tile.resource}`);
      items.push({
        depth,
        order: 1,
        run: () =>
          rimg
            ? ctx.drawImage(rimg, c.x - hw * 0.45, c.y - hh * 0.9, hw * 0.9, hw * 0.9)
            : icon(ctx, RESOURCE_ICONS[tile.resource!], c.x, c.y - hh * 0.35, tileW * 0.3),
      });
    }
    if (tile.village && tile.cityId === undefined) {
      items.push({
        depth,
        order: 2,
        run: () => drawVillage(ctx, c, hw, hh, tileW),
      });
    }
    if (tile.cityId !== undefined && tile.ownerId !== undefined) {
      const owner = state.players[tile.ownerId];
      const city = state.cities.find((cc) => cc.id === tile.cityId);
      if (owner) {
        const hasReward = (city?.rewardsToPick ?? 0) > 0;
        items.push({
          depth,
          order: 2,
          run: () =>
            drawCity(ctx, c, hw, hh, tileW, owner.color, city?.level ?? 1, hasReward, assets),
        });
      }
    }
  }
  // Les UNITÉS ne sont PAS dessinées ici : elles vivent dans la couche dynamique
  // (drawDynamic) pour pouvoir être animées sans re-rendre tout le monde.
  items.sort((a, b) => a.depth - b.depth || a.order - b.order);
  for (const it of items) it.run();

  // Cible en attente de confirmation : losange doré + anneau pulsé.
  if (overlay.pending) {
    const c = tileCenter(layout, overlay.pending.x, overlay.pending.y);
    ctx.save();
    diamondPath(ctx, c, hw, hh);
    ctx.fillStyle = "rgba(255,200,70,0.32)";
    ctx.fill();
    ctx.shadowColor = "rgba(255,200,70,0.95)";
    ctx.shadowBlur = tileW * 0.25;
    ctx.strokeStyle = "#ffce5a";
    ctx.lineWidth = Math.max(3, tileW * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  // Sélection (contour lumineux, bien visible au doigt).
  if (overlay.selected) {
    const c = tileCenter(layout, overlay.selected.x, overlay.selected.y);
    ctx.save();
    diamondPath(ctx, c, hw, hh);
    ctx.fillStyle = "rgba(120, 220, 255, 0.18)";
    ctx.fill();
    ctx.shadowColor = "rgba(120, 220, 255, 0.95)";
    ctx.shadowBlur = tileW * 0.22;
    ctx.strokeStyle = "#8fe3ff";
    ctx.lineWidth = Math.max(3, tileW * 0.07);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Recolle le calque monde (déjà dessiné) sur le canvas visible selon la caméra.
 * Très peu coûteux : c'est ce qu'on appelle à chaque frame de pan/zoom.
 * @param worldScale échelle à laquelle `world` a été rendu.
 */
export function blitWorld(
  canvas: HTMLCanvasElement,
  world: HTMLCanvasElement,
  camera: Camera,
  worldScale: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const f = camera.scale / worldScale;
  ctx.drawImage(world, camera.x * dpr, camera.y * dpr, world.width * f, world.height * f);
}

/**
 * Couche dynamique dessinée à chaque frame par-dessus le calque monde :
 * unités (avec glissement), impacts de combat, textes flottants.
 */
export function drawDynamic(
  canvas: HTMLCanvasElement,
  state: GameState,
  layout: IsoLayout,
  camera: Camera,
  anims: FrameAnims,
  assets?: AssetStore,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const s = dpr * camera.scale;
  ctx.setTransform(s, 0, 0, s, dpr * camera.x, dpr * camera.y);
  const { hw, hh, tileW } = layout;

  // Fantômes : unités en train de mourir (fondu + léger rétrécissement/élévation).
  for (const gh of anims.ghosts) {
    const c = tileCenter(layout, gh.x, gh.y - gh.p * 0.25);
    drawUnit(ctx, c, hw, hh, tileW, gh.color, gh.type, gh.hp, {
      alpha: 1 - gh.p,
      scale: 1 - 0.3 * gh.p,
      showHp: false,
    }, assets);
  }

  // Captures de ville : éclat coloré qui s'étend.
  for (const cap of anims.captures) {
    const c = tileCenter(layout, cap.x, cap.y);
    ctx.save();
    ctx.globalAlpha = 1 - cap.p;
    ctx.strokeStyle = cap.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c.x, c.y - tileW * 0.1, tileW * (0.2 + 0.6 * cap.p), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Unités (triées en profondeur, avec glissement / coup / apparition).
  const units = [...state.units].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const u of units) {
    const owner = state.players[u.ownerId];
    if (!owner) continue;
    let gx = u.x;
    let gy = u.y;
    const g = anims.glides.get(u.id);
    if (g) {
      const e = easeOut(g.p);
      gx = g.fromX + (u.x - g.fromX) * e;
      gy = g.fromY + (u.y - g.fromY) * e;
    }
    const lunge = anims.lunges.get(u.id);
    if (lunge) {
      const amt = Math.sin(lunge.p * Math.PI) * 0.32;
      gx += lunge.dx * amt;
      gy += lunge.dy * amt;
    }
    const spawn = anims.spawns.get(u.id);
    const scale = spawn ? 0.4 + 0.6 * easeOut(spawn.p) : 1;
    const alpha = spawn ? spawn.p : 1;
    drawUnit(ctx, tileCenter(layout, gx, gy), hw, hh, tileW, owner.color, u.type, u.hp, {
      spent: u.hasMoved && u.hasAttacked,
      scale,
      alpha,
    }, assets);
  }

  // Impacts de combat : anneau rouge qui grandit et s'estompe.
  for (const im of anims.impacts) {
    const c = tileCenter(layout, im.x, im.y);
    ctx.save();
    ctx.globalAlpha = 1 - im.p;
    ctx.strokeStyle = "#ff5a5a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y - tileW * 0.1, tileW * (0.15 + 0.45 * im.p), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Textes flottants (dégâts, étoiles…) : montent et s'estompent.
  for (const pop of anims.pops) {
    const c = tileCenter(layout, pop.x, pop.y);
    ctx.save();
    ctx.globalAlpha = 1 - pop.p;
    ctx.fillStyle = pop.color;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.font = `bold ${Math.round(tileW * 0.3)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = c.y - tileW * 0.4 - pop.p * tileW * 0.7;
    ctx.strokeText(pop.text, c.x, y);
    ctx.fillText(pop.text, c.x, y);
    ctx.restore();
  }
}

function diamonds(
  ctx: CanvasRenderingContext2D,
  layout: IsoLayout,
  cells: readonly Coord[] | undefined,
  color: string,
): void {
  if (!cells) return;
  ctx.fillStyle = color;
  for (const cell of cells) {
    diamondPath(ctx, tileCenter(layout, cell.x, cell.y), layout.hw, layout.hh);
    ctx.fill();
  }
}

/** Village neutre à conquérir : petite hutte grise sur un tertre. */
function drawVillage(
  ctx: CanvasRenderingContext2D,
  c: Coord,
  hw: number,
  hh: number,
  tileW: number,
): void {
  shadow(ctx, c, hw, hh);
  const top = c.y - hh * 0.1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, top - tileW * 0.04, tileW * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#cdb892";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.stroke();
  ctx.restore();
  icon(ctx, "🛖", c.x, top - tileW * 0.05, tileW * 0.26);
}

function drawCity(
  ctx: CanvasRenderingContext2D,
  c: Coord,
  hw: number,
  hh: number,
  tileW: number,
  color: string,
  level: number,
  hasReward: boolean,
  assets?: AssetStore,
): void {
  shadow(ctx, c, hw, hh);
  const top = c.y - hh * 0.15;
  const cimg = assets?.get("city/city");
  if (cimg) {
    ctx.drawImage(cimg, c.x - hw * 0.6, top - tileW * 0.55, hw * 1.2, tileW * 0.7);
  } else {
    ctx.beginPath();
    ctx.arc(c.x, top - tileW * 0.05, tileW * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.stroke();
    icon(ctx, "🏛️", c.x, top - tileW * 0.06, tileW * 0.26);
  }
  // badge niveau
  ctx.beginPath();
  ctx.arc(c.x + hw * 0.45, top - tileW * 0.18, tileW * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = "#10131a";
  ctx.fill();
  ctx.fillStyle = "#fff";
  icon(ctx, String(level), c.x + hw * 0.45, top - tileW * 0.17, tileW * 0.18);
  // Pastille "récompense à choisir" (clignote visuellement par sa position en hauteur).
  if (hasReward) icon(ctx, "🎁", c.x - hw * 0.45, top - tileW * 0.3, tileW * 0.26);
}

interface UnitDrawOpts {
  spent?: boolean;
  alpha?: number;
  scale?: number;
  showHp?: boolean;
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  c: Coord,
  hw: number,
  hh: number,
  tileW: number,
  color: string,
  type: UnitType,
  hp: number,
  opts: UnitDrawOpts = {},
  assets?: AssetStore,
): void {
  const { spent = false, alpha = 1, scale = 1, showHp = true } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (scale !== 1) {
    ctx.translate(c.x, c.y);
    ctx.scale(scale, scale);
    ctx.translate(-c.x, -c.y);
  }
  shadow(ctx, c, hw, hh);
  const top = c.y - tileW * 0.1;
  ctx.save();
  if (spent) ctx.globalAlpha *= 0.55;
  const uimg = assets?.get(`unit/${type}`);
  if (uimg) {
    ctx.drawImage(uimg, c.x - hw * 0.55, top - tileW * 0.55, hw * 1.1, tileW * 0.7);
  } else {
    ctx.beginPath();
    ctx.arc(c.x, top, tileW * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.stroke();
    icon(ctx, UNIT_ICONS[type], c.x, top, tileW * 0.24);
  }
  ctx.restore();
  if (showHp) {
    ctx.font = `bold ${Math.round(tileW * 0.16)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#10131a";
    ctx.fillStyle = "#fff";
    const hy = top + tileW * 0.26;
    ctx.strokeText(String(hp), c.x, hy);
    ctx.fillText(String(hp), c.x, hy);
  }
  ctx.restore();
}
