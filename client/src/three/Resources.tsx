/**
 * Ressources récoltables en 3D cartoon (une silhouette par type).
 * Posées sur le dessus de la case ; `raycast=noop` pour ne pas bloquer le clic
 * (la case dessous reste sélectionnable pour la récolte). Aucune règle de jeu.
 */

import type { GameState, Resource } from "@polytopia/shared";
import { tileTop } from "./projection.js";

const noRaycast = () => null;

/** Petite rotation déterministe pour casser l'uniformité. */
function rot(x: number, y: number): number {
  return ((x * 31 + y * 17) % 12) * (Math.PI / 6);
}

function ResourceMesh({ type }: { type: Resource }) {
  switch (type) {
    case "fruits": // petit pommier (tronc + feuillage + pommes rouges bien visibles)
      return (
        <group>
          <mesh position={[0, 0.1, 0]} raycast={noRaycast} castShadow>
            <cylinderGeometry args={[0.035, 0.05, 0.2, 6]} />
            <meshStandardMaterial color="#7a5230" flatShading />
          </mesh>
          <mesh position={[0, 0.28, 0]} raycast={noRaycast} castShadow>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial color="#3f9a4d" flatShading />
          </mesh>
          {[
            [0.11, 0.24, 0.08],
            [-0.1, 0.3, -0.05],
            [0.03, 0.36, 0.1],
            [0.09, 0.34, -0.1],
          ].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} raycast={noRaycast}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial color="#ff2e2e" emissive="#7a0000" emissiveIntensity={0.25} flatShading />
            </mesh>
          ))}
        </group>
      );
    case "gibier": // cerf stylisé
      return (
        <group>
          <mesh position={[0, 0.2, 0]} raycast={noRaycast} castShadow>
            <boxGeometry args={[0.24, 0.12, 0.11]} />
            <meshStandardMaterial color="#9c6b3f" flatShading />
          </mesh>
          <mesh position={[0.13, 0.3, 0]} raycast={noRaycast} castShadow>
            <boxGeometry args={[0.08, 0.16, 0.08]} />
            <meshStandardMaterial color="#9c6b3f" flatShading />
          </mesh>
          {[-0.05, 0.05].map((dz) => (
            <mesh key={dz} position={[0.16, 0.42, dz]} rotation={[0, 0, -0.3]} raycast={noRaycast}>
              <coneGeometry args={[0.02, 0.12, 4]} />
              <meshStandardMaterial color="#d8c9a8" flatShading />
            </mesh>
          ))}
          {[
            [0.08, -0.04],
            [0.08, 0.04],
            [-0.08, -0.04],
            [-0.08, 0.04],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx as number, 0.08, lz as number]} raycast={noRaycast}>
              <cylinderGeometry args={[0.02, 0.02, 0.16, 6]} />
              <meshStandardMaterial color="#7a5230" flatShading />
            </mesh>
          ))}
        </group>
      );
    case "poisson": // poisson à fleur d'eau
      return (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.06, 0]} scale={[1.6, 1, 0.7]} raycast={noRaycast} castShadow>
            <sphereGeometry args={[0.1, 12, 10]} />
            <meshStandardMaterial color="#5fb6cf" flatShading metalness={0.2} roughness={0.4} />
          </mesh>
          <mesh position={[-0.18, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <coneGeometry args={[0.08, 0.12, 4]} />
            <meshStandardMaterial color="#4a9fb8" flatShading />
          </mesh>
        </group>
      );
    case "cereales": // gerbe de blé
      return (
        <group>
          {[
            [0, 0],
            [0.07, 0.04],
            [-0.06, 0.05],
            [0.04, -0.06],
            [-0.05, -0.05],
          ].map(([sx, sz], i) => (
            <group key={i} position={[sx as number, 0, sz as number]} rotation={[0, 0, (i - 2) * 0.08]}>
              <mesh position={[0, 0.16, 0]} raycast={noRaycast}>
                <cylinderGeometry args={[0.012, 0.012, 0.32, 5]} />
                <meshStandardMaterial color="#cdb55a" flatShading />
              </mesh>
              <mesh position={[0, 0.34, 0]} raycast={noRaycast} castShadow>
                <coneGeometry args={[0.035, 0.12, 6]} />
                <meshStandardMaterial color="#f0d264" flatShading />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "minerai": // roche minéralisée (cristaux dorés bien visibles)
      return (
        <group>
          <mesh position={[0, 0.15, 0]} raycast={noRaycast} castShadow>
            <icosahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#7e848f" flatShading />
          </mesh>
          {[
            [0.1, 0.22, 0.07],
            [-0.08, 0.24, -0.05],
            [0.02, 0.3, 0.0],
          ].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} raycast={noRaycast}>
              <octahedronGeometry args={[0.075, 0]} />
              <meshStandardMaterial color="#ffb13a" emissive="#b56a00" emissiveIntensity={0.7} flatShading />
            </mesh>
          ))}
        </group>
      );
    case "bois": // tas de rondins
      return (
        <group>
          {[
            [0, 0.06, -0.06],
            [0, 0.06, 0.06],
            [0, 0.17, 0],
          ].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 0.3, 10]} />
              <meshStandardMaterial color={i === 2 ? "#9c6b3f" : "#7d5230"} flatShading />
            </mesh>
          ))}
        </group>
      );
    case "metal": // lingots métalliques
      return (
        <group>
          {[
            [0, 0.05, 0],
            [0.1, 0.05, 0.04],
            [0.05, 0.15, 0.02],
          ].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} rotation={[0, (i * Math.PI) / 5, 0]} raycast={noRaycast} castShadow>
              <boxGeometry args={[0.16, 0.07, 0.09]} />
              <meshStandardMaterial color="#b9c0c9" metalness={0.7} roughness={0.3} flatShading />
            </mesh>
          ))}
        </group>
      );
    case "luxe": // gemme précieuse
      return (
        <group>
          <mesh position={[0, 0.06, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.12, 0.14, 0.06, 8]} />
            <meshStandardMaterial color="#6b6f78" flatShading />
          </mesh>
          <mesh position={[0, 0.22, 0]} raycast={noRaycast} castShadow>
            <octahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial
              color="#39d6c2"
              emissive="#0f7a6e"
              emissiveIntensity={0.5}
              metalness={0.3}
              roughness={0.15}
              flatShading
            />
          </mesh>
        </group>
      );
  }
}

export function Resources({ state }: { state: GameState }) {
  return (
    <group>
      {state.tiles.map((tile: any) => {
        if (!tile.resource) return null;
        const t = tileTop(state, tile.x, tile.y);
        // Case occupée (unité/ville/village) : on décale la ressource dans un coin
        // et on la réduit pour ne pas se superposer à ce qui s'y trouve.
        const occupied = tile.unitId !== undefined || tile.cityId !== undefined || tile.village === true;
        // Sur les montagnes (minerai/métal), le pic enneigé masquait la ressource :
        // on la pousse fermement sur le bord, on la remonte et on l'agrandit (#5).
        const onMountain = tile.terrain === "montagne";
        const off = onMountain ? 0.36 : occupied ? 0.3 : 0;
        const s = onMountain ? 1.18 : occupied ? 0.72 : 1;
        const lift = onMountain ? 0.06 : 0;
        return (
          <group
            key={`r${tile.x},${tile.y}`}
            position={[t.x + off, t.y + lift, t.z + off]}
            rotation={[0, rot(tile.x, tile.y), 0]}
            scale={s}
          >
            <ResourceMesh type={tile.resource} />
          </group>
        );
      })}
    </group>
  );
}
