/**
 * Unités 3D cartoon procédurales. Chaque type a une silhouette distincte
 * (arme/monture), posée sur un disque à la couleur du joueur, surmontée d'une
 * barre de vie en billboard. Aucune règle de jeu (maxHp = simple helper d'affichage).
 */

import { Component, Suspense, useMemo, type ReactNode } from "react";
import { Billboard, useGLTF, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Unit, UnitType } from "@polytopia/shared";
import { maxHp } from "@polytopia/engine";
import { BOAT_MODEL, UNIT_MODELS, type UnitModelConfig } from "./models.js";

const noRaycast = () => null;

const STEEL = "#cdd2da";
const WOOD = "#7d5230";
const STONE = "#9aa0aa";
const HORSE = "#6b4a2f";
const HORSE_DARK = "#553a25";

export function lighten(c: THREE.Color, amt: number): THREE.Color {
  return c.clone().lerp(new THREE.Color("#ffffff"), amt);
}
export function darken(c: THREE.Color, amt: number): THREE.Color {
  return c.clone().lerp(new THREE.Color("#000000"), amt);
}

/** Disque de sol à la couleur du joueur (identité d'équipe toujours visible). */
function TeamDisc({ color }: { color: THREE.Color }) {
  return (
    <mesh position={[0, 0.03, 0]} raycast={noRaycast} receiveShadow>
      <cylinderGeometry args={[0.27, 0.29, 0.05, 18]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/** Corps humanoïde générique (torse + tête). */
function Humanoid({ color, skin, scale = 1 }: { color: THREE.Color; skin: THREE.Color; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.24, 0]} raycast={noRaycast} castShadow>
        <capsuleGeometry args={[0.1, 0.18, 4, 10]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, 0.46, 0]} raycast={noRaycast} castShadow>
        <sphereGeometry args={[0.092, 12, 12]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
    </group>
  );
}

function Spear() {
  return (
    <group position={[0.17, 0.28, 0.02]} rotation={[0, 0, -0.18]}>
      <mesh raycast={noRaycast} castShadow>
        <cylinderGeometry args={[0.013, 0.013, 0.5, 6]} />
        <meshStandardMaterial color={WOOD} flatShading />
      </mesh>
      <mesh position={[0, 0.29, 0]} raycast={noRaycast} castShadow>
        <coneGeometry args={[0.035, 0.1, 6]} />
        <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.4} flatShading />
      </mesh>
    </group>
  );
}

/** Monture (cheval stylisé) pour cavalier / chevalier. */
function Horse() {
  return (
    <group position={[0, 0.14, 0]}>
      <mesh position={[0, 0.12, 0]} raycast={noRaycast} castShadow>
        <boxGeometry args={[0.18, 0.14, 0.36]} />
        <meshStandardMaterial color={HORSE} flatShading />
      </mesh>
      <mesh position={[0, 0.24, 0.18]} raycast={noRaycast} castShadow>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshStandardMaterial color={HORSE} flatShading />
      </mesh>
      {[
        [0.07, 0.14],
        [-0.07, 0.14],
        [0.07, -0.14],
        [-0.07, -0.14],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx as number, -0.02, lz as number]} raycast={noRaycast}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 6]} />
          <meshStandardMaterial color={HORSE_DARK} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Coque de bateau (unité embarquée) : pont en bois + liseré couleur joueur. */
/** Coque PROCÉDURALE (repli si aucun modèle de bateau n'est fourni). */
function ProceduralBoat({ color }: { color: THREE.Color }) {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} raycast={noRaycast} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.13, 0.32]} />
        <meshStandardMaterial color="#7a5230" flatShading />
      </mesh>
      <mesh position={[0.3, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast} castShadow>
        <coneGeometry args={[0.16, 0.16, 4]} />
        <meshStandardMaterial color="#8a6038" flatShading />
      </mesh>
      <mesh position={[0, 0.13, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.52, 0.04, 0.34]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

/** Barque de l'unité embarquée : modèle .glb si fourni, sinon coque procédurale. */
export function Boat({ color }: { color: THREE.Color }) {
  return <ModelOr cfg={BOAT_MODEL} fallback={<ProceduralBoat color={color} />} />;
}

/** Corps PROCÉDURAL d'un type d'unité (formes géométriques), hors disque d'équipe. */
function ProceduralUnit({ type, color }: { type: UnitType; color: THREE.Color }) {
  const skin = lighten(color, 0.55);

  switch (type) {
    case "guerrier":
      return (
        <group>
          <Humanoid color={color} skin={skin} />
          <Spear />
        </group>
      );
    case "epeiste":
      return (
        <group>
          <Humanoid color={color} skin={skin} />
          <mesh position={[0.18, 0.3, 0.04]} rotation={[0, 0, 0.12]} raycast={noRaycast} castShadow>
            <boxGeometry args={[0.035, 0.34, 0.012]} />
            <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.35} flatShading />
          </mesh>
          <mesh position={[0.18, 0.16, 0.04]} raycast={noRaycast}>
            <boxGeometry args={[0.12, 0.025, 0.025]} />
            <meshStandardMaterial color={WOOD} flatShading />
          </mesh>
        </group>
      );
    case "hero":
      return (
        <group scale={1.15}>
          <Humanoid color={color} skin={skin} />
          <group position={[0.17, 0.28, 0.02]} rotation={[0, 0, -0.18]}>
            <mesh raycast={noRaycast} castShadow>
              <cylinderGeometry args={[0.013, 0.013, 0.5, 6]} />
              <meshStandardMaterial color={WOOD} flatShading />
            </mesh>
            <mesh position={[0, 0.29, 0]} raycast={noRaycast} castShadow>
              <coneGeometry args={[0.05, 0.15, 6]} />
              <meshStandardMaterial color={"#ffd700"} metalness={0.6} roughness={0.3} flatShading />
            </mesh>
          </group>
        </group>
      );
    case "archer":
      return (
        <group>
          <Humanoid color={color} skin={skin} />
          <mesh position={[0.18, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} castShadow>
            <torusGeometry args={[0.16, 0.016, 8, 16, Math.PI * 1.2]} />
            <meshStandardMaterial color={WOOD} flatShading />
          </mesh>
        </group>
      );
    case "defenseur":
      return (
        <group>
          <Humanoid color={color} skin={skin} scale={1.05} />
          <mesh position={[0.2, 0.28, 0.04]} raycast={noRaycast} castShadow>
            <boxGeometry args={[0.04, 0.34, 0.26]} />
            <meshStandardMaterial color={STEEL} metalness={0.3} roughness={0.5} flatShading />
          </mesh>
          <mesh position={[0.225, 0.28, 0.04]} raycast={noRaycast}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial color={lighten(color, 0.2)} flatShading />
          </mesh>
        </group>
      );
    case "geant":
      return (
        <group>
          <Humanoid color={color} skin={skin} scale={1.7} />
          <mesh position={[0.34, 0.5, 0.05]} rotation={[0, 0, -0.4]} raycast={noRaycast} castShadow>
            <cylinderGeometry args={[0.05, 0.09, 0.5, 8]} />
            <meshStandardMaterial color={WOOD} flatShading />
          </mesh>
        </group>
      );
    case "cavalier":
    case "chevalier": {
      const knight = type === "chevalier";
      return (
        <group>
          <Horse />
          <group position={[0, 0.34, -0.02]} scale={0.78}>
            <Humanoid color={color} skin={skin} />
          </group>
          {knight ? (
            <group position={[0.2, 0.52, 0.05]} rotation={[0, 0, -0.1]}>
              <mesh raycast={noRaycast} castShadow>
                <cylinderGeometry args={[0.014, 0.014, 0.6, 6]} />
                <meshStandardMaterial color={WOOD} flatShading />
              </mesh>
              <mesh position={[0, 0.34, 0]} raycast={noRaycast}>
                <coneGeometry args={[0.03, 0.1, 6]} />
                <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.3} flatShading />
              </mesh>
            </group>
          ) : (
            <mesh position={[0.18, 0.5, 0.04]} rotation={[0, 0, 0.2]} raycast={noRaycast} castShadow>
              <boxGeometry args={[0.03, 0.26, 0.01]} />
              <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.35} flatShading />
            </mesh>
          )}
        </group>
      );
    }
    case "catapulte":
      return (
        <group>
          <mesh position={[0, 0.16, 0]} raycast={noRaycast} castShadow>
            <boxGeometry args={[0.34, 0.1, 0.22]} />
            <meshStandardMaterial color={WOOD} flatShading />
          </mesh>
          {[-0.13, 0.13].map((zx) => (
            <mesh key={zx} position={[zx, 0.1, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast} castShadow>
              <cylinderGeometry args={[0.1, 0.1, 0.26, 12]} />
              <meshStandardMaterial color={darken(new THREE.Color(WOOD), 0.3)} flatShading />
            </mesh>
          ))}
          <group position={[-0.05, 0.22, 0]} rotation={[0, 0, 0.7]}>
            <mesh raycast={noRaycast} castShadow>
              <cylinderGeometry args={[0.018, 0.018, 0.34, 6]} />
              <meshStandardMaterial color={WOOD} flatShading />
            </mesh>
            <mesh position={[0, 0.18, 0]} raycast={noRaycast} castShadow>
              <boxGeometry args={[0.09, 0.06, 0.09]} />
              <meshStandardMaterial color={STONE} flatShading />
            </mesh>
          </group>
        </group>
      );
    default:
      return (
        <group>
          <Humanoid color={color} skin={skin} />
        </group>
      );
  }
}

/** Charge un modèle glTF (.glb) et l'instancie. Chaque instance clone aussi ses
 *  MATÉRIAUX : sinon les unités d'un même type partagent le même matériau, et un
 *  effet (fantôme de mort qui baisse l'opacité) les rendrait toutes invisibles.
 *  (Les textures restent partagées : clone() ne les duplique pas.) */
export function GltfModel({ cfg }: { cfg: UnitModelConfig }) {
  const { scene } = useGLTF(cfg.url);
  const obj = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
    });
    return root;
  }, [scene]);
  return (
    <primitive
      object={obj}
      scale={cfg.scale ?? 1}
      position={[0, cfg.y ?? 0, 0]}
      rotation={[0, cfg.rotationY ?? 0, 0]}
    />
  );
}

/** Garde d'erreur : si le modèle échoue à charger, on retombe sur le procédural. */
class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Rend le modèle `cfg` (avec repli `fallback` pendant le chargement ou en cas
 * d'erreur), ou directement le `fallback` si aucun modèle n'est configuré.
 * Réutilisable pour les unités ET les sages.
 */
export function ModelOr({
  cfg,
  fallback,
}: {
  cfg: UnitModelConfig | undefined;
  fallback: ReactNode;
}) {
  if (!cfg) return <>{fallback}</>;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfModel cfg={cfg} />
      </Suspense>
    </ModelBoundary>
  );
}

/**
 * Le « mesh » 3D d'un type d'unité (hors barre de vie). Si un modèle .glb est
 * enregistré dans UNIT_MODELS, on l'utilise (avec repli procédural en cas de
 * chargement/erreur) ; sinon, formes procédurales. Le disque d'équipe (couleur
 * du joueur) est dessiné une seule fois ici, modèle ou pas.
 */
export function UnitMesh({
  type,
  color,
  onWater = false,
}: {
  type: UnitType;
  color: THREE.Color;
  onWater?: boolean;
}) {
  const dark = darken(color, 0.35);
  return (
    <group>
      {!onWater && <TeamDisc color={dark} />}
      <ModelOr cfg={UNIT_MODELS[type]} fallback={<ProceduralUnit type={type} color={color} />} />
    </group>
  );
}

function hpColor(ratio: number): string {
  if (ratio > 0.5) return "#46e06a";
  if (ratio > 0.25) return "#ffb02e";
  return "#ff4d4d";
}

/** Hauteur du billboard de vie selon le type. */
export function barHeight(type: UnitType): number {
  if (type === "geant") return 1.15;
  if (type === "cavalier" || type === "chevalier") return 0.95;
  return 0.78;
}

/** Barre de vie en billboard (toujours face caméra), couleur selon les PV.
 *  Tous les matériaux sont OPAQUES (depthTest=false) pour respecter l'ordre de
 *  dessin : contour clair -> fond sombre -> jauge colorée (sinon le fond
 *  semi-transparent recouvrait la jauge et la grisait). */
export function HpBar({ unit }: { unit: Unit }) {
  const ratio = THREE.MathUtils.clamp(unit.hp / Math.max(1, maxHp(unit)), 0, 1);
  const w = 0.6;
  const h = 0.12;
  // Tous transparents + depthTest=false + renderOrder élevé : la barre passe
  // dans la phase transparente APRÈS l'eau et au-dessus de tout (sinon l'eau,
  // transparente, se dessinait par-dessus). L'ordre des renderOrder garantit
  // contour < fond < jauge (donc la jauge n'est jamais regrisée par le fond).
  return (
    <Billboard position={[0, barHeight(unit.type), 0]}>
      {/* contour clair */}
      <mesh raycast={noRaycast} renderOrder={900}>
        <planeGeometry args={[w + 0.07, h + 0.07]} />
        <meshBasicMaterial color="#f4f8fb" transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* fond sombre */}
      <mesh position={[0, 0, 0.001]} raycast={noRaycast} renderOrder={901}>
        <planeGeometry args={[w + 0.02, h + 0.02]} />
        <meshBasicMaterial color="#11151c" transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* jauge colorée (ancrée à gauche) */}
      <mesh position={[-w / 2 + (w * ratio) / 2, 0, 0.002]} raycast={noRaycast} renderOrder={902}>
        <planeGeometry args={[Math.max(0.001, w * ratio), h]} />
        <meshBasicMaterial color={hpColor(ratio)} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Texte des PV */}
      <Text
        position={[0, 0, 0.004]}
        fontSize={0.09}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        renderOrder={903}
      >
        {`${unit.hp} / ${maxHp(unit)}`}
      </Text>
    </Billboard>
  );
}
