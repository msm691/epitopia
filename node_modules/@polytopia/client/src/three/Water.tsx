/**
 * Eau cartoon animée (vagues douces) qui entoure l'île.
 * Plan unique, facettes toon (flatShading) + léger miroitement par la lumière.
 * Pickable : un clic renvoie le point monde (Scene3D en déduit la case).
 * Aucune règle de jeu ici.
 */

import { useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { WATER_COLOR } from "./projection.js";

export interface WaterProps {
  /** Côté du plan (couvre largement la carte). */
  size: number;
  /** Hauteur (Y monde) de la surface. */
  y: number;
  /** Clic sur l'eau -> point monde (pour retrouver la case). */
  onPick: (e: ThreeEvent<MouseEvent>) => void;
  /** Mode performance : fige l'eau. */
  perfMode?: boolean;
}

export function Water({ size, y, onPick, perfMode }: WaterProps) {
  // Densité de vagues proportionnelle à la taille (les vagues ont une longueur
  // d'onde fixe en unités monde -> il faut plus de segments quand le plan grandit).
  const seg = Math.min(72, Math.max(24, Math.round(size / 1.6)));
  const geo = useMemo(() => new THREE.PlaneGeometry(size, size, seg, seg), [size, seg]);
  const original = useMemo(() => {
    const pos = geo.attributes.position;
    return pos ? Float32Array.from(pos.array) : new Float32Array(0);
  }, [geo]);

  useFrame(({ clock }) => {
    if (perfMode) return; // Désactive l'animation CPU-intensive en mode perf
    const pos = geo.attributes.position;
    if (!pos) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const ox = original[i * 3] ?? 0;
      const oy = original[i * 3 + 1] ?? 0;
      const z = Math.sin(ox * 0.55 + t * 0.9) * 0.05 + Math.cos(oy * 0.45 + t * 0.65) * 0.05;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={!perfMode} onClick={onPick}>
      <meshStandardMaterial
        color={WATER_COLOR}
        flatShading
        transparent
        opacity={0.94}
        roughness={0.35}
        metalness={0.05}
      />
    </mesh>
  );
}
