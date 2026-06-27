/**
 * Mini-carte stylisée d'un type de carte pour le lobby : la VRAIE génération
 * rendue en tuiles CARRÉES (comme la grille du jeu), façon minimap — net,
 * instantané, sans 3D. Mer, plages carrées sur les côtes, léger relief, grille.
 */

import { useMemo } from "react";
import type { MapType, Terrain } from "@polytopia/shared";
import { generateMap } from "@polytopia/engine";

/** Côté de la mini-carte (en tuiles). Petit = tuiles lisibles. */
const N = 12;
/** Côté d'une tuile dans le viewBox SVG. */
const S = 10;

const COLOR: Record<Terrain, string> = {
  ocean: "#3f93cf",
  eau: "#48a6df",
  champ: "#76c64d",
  foret: "#4f9c3b",
  montagne: "#9aa3ab",
};
const SAND = "#ead7a0";
const GRID = "rgba(18, 40, 58, 0.10)";

function isWaterT(t: Terrain): boolean {
  return t === "eau" || t === "ocean";
}

export function MapPreview({ type }: { type: MapType }) {
  const tiles = useMemo(() => generateMap(7, N, N, 3, type).tiles, [type]);
  const terr = (x: number, y: number): Terrain => tiles[y * N + x]?.terrain ?? "champ";

  const TH = 2.2; // épaisseur de la plage sur un bord côtier
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = terr(x, y);
      const px = x * S;
      const py = y * S;
      const key = `${x},${y}`;
      if (isWaterT(t)) {
        cells.push(<rect key={key} x={px} y={py} width={S} height={S} fill={COLOR[t]} />);
        continue;
      }
      // Tuile de terre + léger relief (ourlet d'ombre en bas).
      cells.push(<rect key={key} x={px} y={py} width={S} height={S} fill={COLOR[t]} />);
      cells.push(
        <rect key={`${key}-b`} x={px} y={py + S - 1.4} width={S} height={1.4} fill="rgba(0,0,0,0.10)" />,
      );
      // Plage SEULEMENT sur les bords qui touchent la mer (vraie ligne de côte).
      const isW = (nx: number, ny: number) =>
        nx >= 0 && ny >= 0 && nx < N && ny < N && isWaterT(terr(nx, ny));
      if (isW(x, y - 1)) cells.push(<rect key={`${key}-st`} x={px} y={py} width={S} height={TH} fill={SAND} />);
      if (isW(x, y + 1)) cells.push(<rect key={`${key}-sb`} x={px} y={py + S - TH} width={S} height={TH} fill={SAND} />);
      if (isW(x - 1, y)) cells.push(<rect key={`${key}-sl`} x={px} y={py} width={TH} height={S} fill={SAND} />);
      if (isW(x + 1, y)) cells.push(<rect key={`${key}-sr`} x={px + S - TH} y={py} width={TH} height={S} fill={SAND} />);
    }
  }

  return (
    <svg className="map-preview-svg" viewBox={`0 0 ${N * S} ${N * S}`} preserveAspectRatio="xMidYMid slice">
      {/* Fond mer (sous les tuiles d'eau, garantit l'absence de trous) */}
      <rect x="0" y="0" width={N * S} height={N * S} fill={COLOR.eau} />
      {cells}
      {/* Grille discrète façon plateau */}
      <g stroke={GRID} strokeWidth="0.4">
        {Array.from({ length: N - 1 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * S} y1="0" x2={(i + 1) * S} y2={N * S} />
        ))}
        {Array.from({ length: N - 1 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={(i + 1) * S} x2={N * S} y2={(i + 1) * S} />
        ))}
      </g>
    </svg>
  );
}
