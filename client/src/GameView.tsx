import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  Action,
  Coord,
  EndVoteState,
  GameState,
  Unit,
  City,
  TechId,
  UnitType,
  Resource,
  TechDef,
} from "@polytopia/shared";
import {
  TECHS,
  UNIT_STATS,
  UNIT_NAMES,
  ALL_CITY_REWARDS,
  CITY_REWARD_LABELS,
  ALL_IMPROVEMENTS,
  improvementCost,
  IMPROVEMENT_LABELS,
  WALL_MAX_HP,
  RESOURCE_HARVEST_COST,
  RESOURCE_POP_GAIN,
  unitBuildTurns,
} from "@polytopia/shared";
import {
  isLegal,
  computeTechCost,
  getPlayerCityCount,
  trainableUnitsFor,
  checkVictory,
  computeScore,
  computeCombat,
  computeWallDamage,
  getDefenseBonus,
  maxHp,
  chebyshev,
  playerCanHarvest,
} from "@polytopia/engine";
import { Scene3D, type Scene3DHandle } from "./three/Scene3D.js";
import { SagePortrait } from "./three/Buildings.js";

const TECH_LIST = Object.values(TECHS).sort((a, b) => a.branch - b.branch || a.tier - b.tier);

/** Icône par technologie (identité visuelle de chaque nœud de l'arbre). */
const TECH_ICONS: Record<TechId, string> = {
  chasse: "🏹",
  archerie: "🎯",
  peche: "🎣",
  navigation: "⚓",
  agriculture: "🌾",
  construction: "🏗️",
  escalade: "⛰️",
  forge: "⚒️",
  equitation: "🐴",
  chevalerie: "🛡️",
  strategie: "♟️",
  tactique: "⚔️",
};

const RESOURCE_LABELS: Record<Resource, string> = {
  fruits: "🍎 Fruits",
  gibier: "🦌 Gibier",
  poisson: "🐟 Poisson",
  cereales: "🌾 Céréales",
  minerai: "⛏️ Minerai",
  bois: "🌲 Bois",
  metal: "⚙️ Métal",
  luxe: "💎 Luxe",
};

const TERRAIN_LABELS: Record<GameState["tiles"][number]["terrain"], string> = {
  champ: "🌱 Champ",
  foret: "🌲 Forêt (+défense)",
  montagne: "⛰️ Montagne (+défense)",
  eau: "🌊 Eau",
  ocean: "🌊 Océan",
};

/** Action sélectionnée par le joueur, en attente de confirmation. */
type Pending =
  | { kind: "move"; to: Coord }
  | { kind: "attack"; target: Unit }
  | { kind: "harvest"; at: Coord }
  | { kind: "attackWall"; city: City };

/** Décrit ce qu'une tech débloque (unités, ressources, améliorations). */
function describeUnlocks(tech: TechDef): string {
  const parts: string[] = [];
  for (const u of tech.unlocksUnits) parts.push(UNIT_NAMES[u]);
  for (const r of tech.unlocksResources) parts.push(RESOURCE_LABELS[r]);
  if (tech.unlocksImprovements) parts.push("Améliorations");
  return parts.join(", ");
}

function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}
function unitAt(state: GameState, c: Coord): Unit | undefined {
  return state.units.find((u) => u.x === c.x && u.y === c.y);
}
function cityAt(state: GameState, c: Coord): City | undefined {
  return state.cities.find((ci) => ci.x === c.x && ci.y === c.y);
}
function legalMovesFor(state: GameState, unit: Unit): Coord[] {
  const moves: Coord[] = [];
  for (const tile of state.tiles) {
    const to = { x: tile.x, y: tile.y };
    if (isLegal(state, { type: "MOVE_UNIT", unitId: unit.id, to })) moves.push(to);
  }
  return moves;
}
function attackTargetsFor(state: GameState, unit: Unit): Unit[] {
  return state.units.filter((t) =>
    isLegal(state, { type: "ATTACK", attackerId: unit.id, targetId: t.id }),
  );
}
function harvestTargetsFor(state: GameState, city: City): Coord[] {
  const targets: Coord[] = [];
  for (const tile of state.tiles) {
    const at = { x: tile.x, y: tile.y };
    if (isLegal(state, { type: "HARVEST_RESOURCE", cityId: city.id, at })) targets.push(at);
  }
  return targets;
}
/** Toutes les cases (dans la carte) à distance d'attaque <= range d'une origine. */
export interface GameViewProps {
  state: GameState;
  myId: number;
  /** Envoie une action au serveur autoritaire. */
  send: (action: Action) => void;
  /** Le joueur local est-il l'hôte (peut relancer) ? */
  isHost: boolean;
  /** Renvoie la partie au lobby (hôte uniquement). */
  onNewGame: () => void;
  /** Limite de temps du tour courant (secondes ; null = aucune). */
  turnSeconds: number | null;
  /** Vote de fin de partie en cours (null = aucun). */
  endVote: EndVoteState | null;
  /** Lance un vote pour terminer la partie (mode infini). */
  onEndVoteStart: () => void;
  /** Vote pour/contre la fin de partie. */
  onEndVoteCast: (approve: boolean) => void;
}

export function GameView({
  state,
  myId,
  send,
  isHost,
  onNewGame,
  turnSeconds,
  endVote,
  onEndVoteStart,
  onEndVoteCast,
}: GameViewProps) {
  const [selected, setSelected] = useState<Coord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [techOpen, setTechOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Dilemme d'un sage en cours (case du sage), et dernier résultat à afficher.
  const [sageAt, setSageAt] = useState<Coord | null>(null);
  const [sageResult, setSageResult] = useState<GameState["lastSage"] | null>(null);
  const lastSageIdRef = useRef<string | null>(null);

  // Toute mise à jour autoritaire de l'état annule une confirmation en suspens
  // (la situation a pu changer : l'action ne serait plus forcément la même).
  useEffect(() => setPending(null), [state]);

  // Affiche le résultat d'une consultation de sage (une seule fois, pour moi).
  useEffect(() => {
    const ls = state.lastSage;
    if (ls && ls.id !== lastSageIdRef.current) {
      lastSageIdRef.current = ls.id;
      if (ls.by === myId) setSageResult(ls);
    }
  }, [state, myId]);

  const current = state.players[state.currentPlayer];
  const me = state.players[myId];
  const victory = useMemo(() => checkVictory(state), [state]);
  const isMyTurn = state.currentPlayer === myId && !victory.over;

  // Compte à rebours du tour courant : repart à chaque changement de tour.
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (turnSeconds == null || victory.over) {
      setRemaining(null);
      return;
    }
    setRemaining(turnSeconds);
    const id = setInterval(() => {
      setRemaining((r) => (r == null ? null : Math.max(0, r - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [state.turn, state.currentPlayer, turnSeconds, victory.over]);

  // Vote de fin : disponible en mode infini (pas de limite de tours).
  const canVoteEnd = state.turnLimit === null && !victory.over;
  const hasVotedEnd =
    !!endVote && (endVote.approve.includes(myId) || endVote.decline.includes(myId));

  // Sélection de mes pièces (possible même hors de mon tour, pour inspecter).
  // Les surbrillances/actions restent vides hors-tour car isLegal teste le joueur courant.
  const selectedUnit =
    selected && unitAt(state, selected)?.ownerId === myId ? unitAt(state, selected) : undefined;
  const selectedCity =
    selected && cityAt(state, selected)?.ownerId === myId ? cityAt(state, selected) : undefined;

  const legalMoves = useMemo(
    () => (selectedUnit && !selectedUnit.hasMoved ? legalMovesFor(state, selectedUnit) : []),
    [state, selectedUnit],
  );
  const attackTargets = useMemo(
    () => (selectedUnit ? attackTargetsFor(state, selectedUnit) : []),
    [state, selectedUnit],
  );
  const harvestTargets = useMemo(
    () => (selectedCity ? harvestTargetsFor(state, selectedCity) : []),
    [state, selectedCity],
  );
  // Remparts ennemis attaquables par l'unité sélectionnée (à portée).
  const wallTargets = useMemo(
    () =>
      selectedUnit
        ? state.cities.filter((c) =>
            isLegal(state, { type: "ATTACK_WALL", attackerId: selectedUnit.id, cityId: c.id }),
          )
        : [],
    [state, selectedUnit],
  );

  const hasConstruction = me?.unlockedTechs.includes("construction") ?? false;
  const hasNavigation = me?.unlockedTechs.includes("navigation") ?? false;
  const hasEscalade = me?.unlockedTechs.includes("escalade") ?? false;

  const pendingCoord: Coord | undefined =
    pending?.kind === "move"
      ? pending.to
      : pending?.kind === "attack"
        ? { x: pending.target.x, y: pending.target.y }
        : pending?.kind === "harvest"
          ? pending.at
          : pending?.kind === "attackWall"
            ? { x: pending.city.x, y: pending.city.y }
            : undefined;

  // Prévision de portée d'attaque (#7) : pour les unités à distance (portée >= 2),
  // on montre la zone atteignable AVANT de bouger — depuis la position actuelle,
  // ou depuis la destination d'un déplacement en attente (pour ne plus « avancer
  // d'une case de trop »). Les unités au corps-à-corps n'en ont pas besoin.
  // Zone d'attaque = carré PLEIN de portée (juste sa limite extérieure sera
  // tracée en 3D). Centrée sur l'unité, ou sur la destination d'un déplacement en
  // attente. Seules les unités à distance (portée >= 2) en ont besoin.
  const attackZone = useMemo<{ x: number; y: number; radius: number } | undefined>(() => {
    if (!selectedUnit || selectedUnit.hasAttacked || selectedUnit.range < 2) return undefined;
    const origin =
      pending?.kind === "move" ? pending.to : { x: selectedUnit.x, y: selectedUnit.y };
    return { x: origin.x, y: origin.y, radius: selectedUnit.range };
  }, [selectedUnit, pending]);

  const overlay = useMemo(
    () => ({
      selected: selected ?? undefined,
      moves: legalMoves,
      attacks: [
        ...attackTargets.map((u) => ({ x: u.x, y: u.y })),
        ...wallTargets.map((c) => ({ x: c.x, y: c.y })),
      ],
      attackZone,
      harvests: harvestTargets,
      pending: pendingCoord,
    }),
    [selected, legalMoves, attackTargets, wallTargets, attackZone, harvestTargets, pendingCoord],
  );

  // Aperçu de combat (dégâts prévus) pour une attaque en attente de confirmation.
  const combatPreview = useMemo(() => {
    if (pending?.kind !== "attack" || !selectedUnit) return null;
    const melee = chebyshev(selectedUnit, pending.target) === 1;
    return computeCombat(selectedUnit, pending.target, melee, getDefenseBonus(state, pending.target));
  }, [pending, selectedUnit, state]);

  // Aperçu des dégâts infligés à un rempart.
  const wallPreview = useMemo(
    () => (pending?.kind === "attackWall" && selectedUnit ? computeWallDamage(selectedUnit) : null),
    [pending, selectedUnit],
  );

  const onTileClick = (coord: Coord) => {
    // Sage : si une unité à moi est adjacente, le clic ouvre le dilemme.
    const tileHere = state.tiles[coord.y * state.width + coord.x];
    if (isMyTurn && tileHere?.sage && isLegal(state, { type: "CONSULT_SAGE", at: coord })) {
      setSageAt(coord);
      return;
    }
    // À son tour, un clic sur une case d'action ARME l'action (confirmation requise).
    if (isMyTurn && selectedUnit) {
      const target = attackTargets.find((t) => sameCoord(t, coord));
      if (target) {
        setPending({ kind: "attack", target });
        return;
      }
      const wallCity = wallTargets.find((c) => c.x === coord.x && c.y === coord.y);
      if (wallCity) {
        setPending({ kind: "attackWall", city: wallCity });
        return;
      }
      if (legalMoves.some((m) => sameCoord(m, coord))) {
        setPending({ kind: "move", to: coord });
        return;
      }
    }
    if (isMyTurn && selectedCity && harvestTargets.some((h) => sameCoord(h, coord))) {
      setPending({ kind: "harvest", at: coord });
      return;
    }
    // Sinon : simple inspection de la case (et on annule une action en attente).
    setPending(null);
    setSelected(coord);
  };

  /** Valide l'action en attente : c'est SEULEMENT ici qu'on envoie au serveur. */
  const confirmPending = () => {
    if (!pending || !isMyTurn) return;
    if (pending.kind === "move" && selectedUnit) {
      send({ type: "MOVE_UNIT", unitId: selectedUnit.id, to: pending.to });
      setSelected(pending.to); // on garde l'unité sélectionnée pour enchaîner
    } else if (pending.kind === "attack" && selectedUnit) {
      send({ type: "ATTACK", attackerId: selectedUnit.id, targetId: pending.target.id });
      setSelected(null);
    } else if (pending.kind === "harvest" && selectedCity) {
      send({ type: "HARVEST_RESOURCE", cityId: selectedCity.id, at: pending.at });
    } else if (pending.kind === "attackWall" && selectedUnit) {
      send({ type: "ATTACK_WALL", attackerId: selectedUnit.id, cityId: pending.city.id });
      setSelected(null);
    }
    setPending(null);
  };

  const myCapital = state.cities.find((c) => c.ownerId === myId);
  const focus = myCapital ? { x: myCapital.x, y: myCapital.y } : undefined;
  const sceneRef = useRef<Scene3DHandle>(null);
  const fitCamera = () => sceneRef.current?.recenter();
  const rotateCamera = (d: number) => sceneRef.current?.rotate(d);

  const trainable = selectedCity ? trainableUnitsFor(state, myId) : [];
  const cityCount = getPlayerCityCount(state, myId);

  const canCapture =
    selectedUnit !== undefined &&
    isLegal(state, { type: "CAPTURE_CITY", unitId: selectedUnit.id });

  const canFound =
    selectedUnit !== undefined &&
    isLegal(state, { type: "FOUND_CITY", unitId: selectedUnit.id });

  const hasAction = Boolean(selectedUnit || selectedCity);

  return (
    <div className="game">
      {/* Carte plein écran (rendu 3D) — clic droit réservé à la rotation caméra */}
      <div className="viewport" onContextMenu={(e) => e.preventDefault()}>
        <Scene3D
          ref={sceneRef}
          state={state}
          overlay={overlay}
          onTileClick={onTileClick}
          focus={focus}
        />
      </div>

      {/* Bannière de tour (rejouée à chaque changement de tour) */}
      <div className="turn-banner" key={`${state.turn}-${state.currentPlayer}`}>
        {isMyTurn
          ? "À vous de jouer"
          : current?.isAI
            ? `🤖 ${current?.civName}`
            : `Tour de ${current?.civName}`}
      </div>

      {/* Panneau de vote de fin de partie (mode infini) */}
      {endVote && (
        <div className="votebar floating">
          <span className="confirm-text">
            🏁 Terminer la partie ? <b>{endVote.approve.length}</b>/{endVote.needed} voix requises
            {endVote.decline.length > 0 ? ` · ${endVote.decline.length} contre` : ""}
          </span>
          {hasVotedEnd ? (
            <span className="hint">Ton vote est enregistré…</span>
          ) : (
            <>
              <button className="primary" onClick={() => onEndVoteCast(true)}>
                ✓ Pour
              </button>
              <button className="close-btn" title="Contre" onClick={() => onEndVoteCast(false)}>
                ✕
              </button>
            </>
          )}
        </div>
      )}

      {/* Barre du haut flottante */}
      <header className="topbar floating">
        <span className="brand">⬡ Epitopia</span>
        <span className="pill">
          Tour {state.turn}
          {state.turnLimit !== null ? ` / ${state.turnLimit}` : " ∞"}
        </span>
        <span className={`pill${current?.isAI ? " ai-turn" : ""}`}>
          <span className="dot" style={{ background: current?.color }} />
          {isMyTurn
            ? "À vous"
            : current?.isAI
              ? `🤖 ${current.civName}…`
              : `Tour de ${current?.civName}`}
        </span>
        <span className="pill stars">⭐ {me?.stars}</span>
        {remaining != null && (
          <span className={`pill timer${remaining <= 5 ? " low" : ""}`}>⏱ {remaining}s</span>
        )}
        <span className="spacer" />
        {canVoteEnd && !endVote && (
          <button
            className="icon-btn"
            title="Proposer de terminer la partie (vote à la majorité)"
            onClick={onEndVoteStart}
          >
            🏁
          </button>
        )}
        <button className="icon-btn" title="Pivoter à gauche" onClick={() => rotateCamera(-0.4)}>
          ↺
        </button>
        <button className="icon-btn" title="Pivoter à droite" onClick={() => rotateCamera(0.4)}>
          ↻
        </button>
        <button className="icon-btn" title="Recentrer la carte" onClick={fitCamera}>
          🎯
        </button>
        <button
          className="icon-btn help-btn"
          title="Aide & règles"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
        <button className="primary" onClick={() => send({ type: "END_TURN" })} disabled={!isMyTurn}>
          Fin de tour
        </button>
      </header>

      {/* Bouton flottant : ouvre l'arbre de compétences */}
      <button className="fab tech-fab" onClick={() => setTechOpen(true)}>
        🔬 Technologies
      </button>

      {/* Barre de CONFIRMATION : aucune action n'est envoyée sans passer ici. */}
      {pending && (
        <div className="confirmbar floating">
          {pending.kind === "move" && selectedUnit && (
            <span className="confirm-text">
              Déplacer {UNIT_NAMES[selectedUnit.type]} en ({pending.to.x}, {pending.to.y}) ?
            </span>
          )}
          {pending.kind === "attack" && selectedUnit && combatPreview && (
            <span className="confirm-text">
              ⚔️ Attaquer {UNIT_NAMES[pending.target.type]} (PV {pending.target.hp}/
              {maxHp(pending.target)}) — tu infliges{" "}
              <b className="dmg-out">~{combatPreview.defenderDamage}</b>
              {combatPreview.defenderDies ? (
                <b className="kill"> (élimine !)</b>
              ) : combatPreview.attackerDamage > 0 ? (
                <>
                  , riposte <b className="dmg-in">~{combatPreview.attackerDamage}</b>
                  {combatPreview.attackerDies ? <b className="kill"> (tu meurs !)</b> : null}
                </>
              ) : (
                <> (pas de riposte)</>
              )}
            </span>
          )}
          {pending.kind === "harvest" &&
            (() => {
              const res = state.tiles[pending.at.y * state.width + pending.at.x]?.resource;
              return res ? (
                <span className="confirm-text">
                  Récolter {RESOURCE_LABELS[res]} ? Coût {RESOURCE_HARVEST_COST[res]}⭐, +
                  {RESOURCE_POP_GAIN[res]} pop
                </span>
              ) : null;
            })()}
          {pending.kind === "attackWall" && (
            <span className="confirm-text">
              🧱 Attaquer le rempart (PV {pending.city.wallHp ?? 0}/{WALL_MAX_HP}) — inflige{" "}
              <b className="dmg-out">~{wallPreview ?? 0}</b>
              {(pending.city.wallHp ?? 0) - (wallPreview ?? 0) <= 0 ? (
                <b className="kill"> (rempart détruit !)</b>
              ) : null}
            </span>
          )}
          <button className="primary" onClick={confirmPending} disabled={!isMyTurn}>
            ✓ Confirmer
          </button>
          <button className="close-btn" onClick={() => setPending(null)} title="Annuler">
            ✕
          </button>
        </div>
      )}

      {/* Barre d'action contextuelle (apparaît à la sélection) */}
      {!pending && hasAction && (
        <div className="actionbar floating">
          {selectedCity && (selectedCity.rewardsToPick ?? 0) > 0 && (
            <>
              <span className="reward-label">
                🎁 Récompense ×{selectedCity.rewardsToPick} — choisis :
              </span>
              {ALL_CITY_REWARDS.filter((reward) => {
                // "Agrandir" n'apparaît qu'une fois réellement disponible (après les
                // agrandissements automatiques) ; les autres récompenses restent visibles.
                if (reward !== "agrandir") return true;
                return isLegal(state, {
                  type: "CLAIM_CITY_REWARD",
                  cityId: selectedCity.id,
                  reward,
                });
              }).map((reward) => {
                const legal = isLegal(state, {
                  type: "CLAIM_CITY_REWARD",
                  cityId: selectedCity.id,
                  reward,
                });
                return (
                  <button
                    key={reward}
                    className="reward"
                    disabled={!isMyTurn || !legal}
                    onClick={() =>
                      send({ type: "CLAIM_CITY_REWARD", cityId: selectedCity.id, reward })
                    }
                  >
                    {CITY_REWARD_LABELS[reward]}
                  </button>
                );
              })}
            </>
          )}
          {selectedCity && selectedCity.production && (
            <span className="reward-label">
              🔧 Production : {UNIT_NAMES[selectedCity.production.unitType]} — encore{" "}
              {selectedCity.production.turnsLeft} tour
              {selectedCity.production.turnsLeft > 1 ? "s" : ""}
            </span>
          )}
          {selectedCity &&
            (selectedCity.rewardsToPick ?? 0) === 0 &&
            !selectedCity.production &&
            trainable.map((type: UnitType) => {
              const legal = isLegal(state, {
                type: "TRAIN_UNIT",
                cityId: selectedCity.id,
                unitType: type,
              });
              const build = unitBuildTurns(type);
              return (
                <button
                  key={type}
                  onClick={() =>
                    send({ type: "TRAIN_UNIT", cityId: selectedCity.id, unitType: type })
                  }
                  disabled={!legal}
                  title={
                    build > 0
                      ? `Production : ${build} tour${build > 1 ? "s" : ""} (la ville reste occupée)`
                      : "Apparition immédiate"
                  }
                >
                  {UNIT_NAMES[type]} ({UNIT_STATS[type].cost}⭐{build > 0 ? ` · ⏳${build}` : ""})
                </button>
              );
            })}
          {selectedCity &&
            (selectedCity.rewardsToPick ?? 0) === 0 &&
            hasConstruction &&
            ALL_IMPROVEMENTS.map((imp) => {
              const legal = isLegal(state, {
                type: "BUILD_IMPROVEMENT",
                cityId: selectedCity.id,
                improvement: imp,
              });
              return (
                <button
                  key={imp}
                  className="reward"
                  disabled={!isMyTurn || !legal}
                  title={
                    imp === "muraille"
                      ? `Rempart de ${WALL_MAX_HP} PV — l'ennemi devra le détruire avant de pouvoir vous capturer`
                      : "Atelier : +1⭐/tour permanent"
                  }
                  onClick={() =>
                    send({ type: "BUILD_IMPROVEMENT", cityId: selectedCity.id, improvement: imp })
                  }
                >
                  {IMPROVEMENT_LABELS[imp]} ({improvementCost(imp, selectedCity.builtWorkshops ?? 0)}⭐)
                </button>
              );
            })}
          {canFound && selectedUnit && (
            <button
              className="capture"
              onClick={() => {
                send({ type: "FOUND_CITY", unitId: selectedUnit.id });
                setSelected(null);
              }}
            >
              🏗️ Fonder une ville
            </button>
          )}
          {canCapture && selectedUnit && (
            <button
              className="capture"
              onClick={() => {
                send({ type: "CAPTURE_CITY", unitId: selectedUnit.id });
                setSelected(null);
              }}
            >
              Capturer la ville
            </button>
          )}
          {selectedUnit && (
            <span className="hint">
              PV {selectedUnit.hp} — 🟨 plein = déplacer, 🟥 = cible
              {selectedUnit.range >= 2 ? ", 🟧 contour = portée d'attaque" : ""}
            </span>
          )}
          {selectedCity && (
            <span className="hint">
              🏛️ Niv. {selectedCity.level} · pop {selectedCity.population}/{selectedCity.level + 1}{" "}
              · ⭐{selectedCity.starsPerTurn}/tour
              {(selectedCity.workshops ?? 0) > 0
                ? ` (base ${selectedCity.level + 1} + ${selectedCity.workshops}🔨)`
                : ""}{" "}
              · territoire {selectedCity.harvestRadius ?? 1}
              {selectedCity.hasWall ? ` · 🧱 ${selectedCity.wallHp ?? 0}/${WALL_MAX_HP} PV` : ""} —{" "}
              {harvestTargets.length > 0 ? "case verte = récolter" : "rien à récolter à portée"}
            </span>
          )}
          <button className="close-btn" onClick={() => setSelected(null)} title="Fermer">
            ✕
          </button>
        </div>
      )}

      {/* Barre d'INSPECTION : clic sur une case sans action -> ce qu'on y voit. */}
      {!pending &&
        !hasAction &&
        selected &&
        (() => {
          const tile = state.tiles[selected.y * state.width + selected.x];
          if (!tile) return null;
          const unitHere = unitAt(state, selected);
          const cityHere = cityAt(state, selected);
          const isVillage = tile.village && tile.cityId === undefined;
          const isSage = !!tile.sage;
          return (
            <div className="infobar floating">
              <span className="info-title">{TERRAIN_LABELS[tile.terrain]}</span>
              {(tile.terrain === "eau" || tile.terrain === "ocean") && (
                <span className="info-line">
                  {hasNavigation
                    ? "🚢 Navigable — amène une unité ici pour embarquer"
                    : "🌊 Recherche Navigation pour traverser la mer"}
                </span>
              )}
              {tile.terrain === "montagne" && (
                <span className="info-line">
                  {hasEscalade
                    ? "⛰️ Franchissable (Escalade) — +défense pour l'unité dessus"
                    : "⛰️ Recherche Escalade pour gravir les montagnes"}
                </span>
              )}
              {tile.resource &&
                (() => {
                  const res = tile.resource;
                  const cost = RESOURCE_HARVEST_COST[res];
                  const canTech = playerCanHarvest(state, myId, res);
                  const affordable = (me?.stars ?? 0) >= cost;
                  return (
                    <span className="info-line">
                      {RESOURCE_LABELS[res]} — coût {cost}⭐, +{RESOURCE_POP_GAIN[res]} pop (récolte
                      depuis une ville à portée)
                      {!canTech
                        ? " · 🔒 technologie requise"
                        : !affordable
                          ? " · ⭐ étoiles insuffisantes"
                          : ""}
                    </span>
                  );
                })()}
              {isVillage && (
                <span className="info-line village">
                  🛖 Village neutre — amène une unité ici puis « 🏗️ Fonder une ville »
                </span>
              )}
              {isSage && (
                <span className="info-line village">
                  🧙 {tile.sage} —{" "}
                  {(tile.sageUsedBy ?? []).includes(myId)
                    ? "tu as déjà tenté le destin avec lui"
                    : "amène une unité à côté puis clique pour le consulter"}
                </span>
              )}
              {cityHere && (
                <span className="info-line">
                  🏛️ Ville de {state.players[cityHere.ownerId]?.civName}
                  {cityHere.ownerId === myId ? " (toi)" : " (ennemie — capture avec une unité dessus)"} — niv.{" "}
                  {cityHere.level}
                </span>
              )}
              {cityHere && (cityHere.wallHp ?? 0) > 0 && (
                <span className="info-line village">
                  🧱 Rempart {cityHere.wallHp}/{WALL_MAX_HP} PV —{" "}
                  {cityHere.ownerId === myId
                    ? "protège ta ville (l'ennemi doit le détruire d'abord)"
                    : "détruis-le avec une unité à portée avant de pouvoir entrer/capturer"}
                </span>
              )}
              {unitHere && (
                <span className="info-line">
                  {unitHere.ownerId === myId ? "Ton" : "Unité ennemie :"} {UNIT_NAMES[unitHere.type]} — PV{" "}
                  {unitHere.hp}/{maxHp(unitHere)}
                  {unitHere.ownerId !== myId ? " (sélectionne une de tes unités à portée pour l'attaquer)" : ""}
                </span>
              )}
              {!tile.resource && !unitHere && !cityHere && !isVillage && !isSage && (
                <span className="info-line muted">Rien à faire ici.</span>
              )}
              <button className="close-btn" onClick={() => setSelected(null)} title="Fermer">
                ✕
              </button>
            </div>
          );
        })()}

      {/* Arbre de compétences (modale) */}
      {techOpen && (
        <TechTree
          state={state}
          me={myId}
          cityCount={cityCount}
          canResearch={isMyTurn}
          onResearch={(id) => send({ type: "RESEARCH_TECH", techId: id })}
          onClose={() => setTechOpen(false)}
        />
      )}

      {/* Aide & règles (modale à onglets) */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Dilemme d'un sage (Stan / Nico) */}
      {sageAt &&
        (() => {
          const name = state.tiles[sageAt.y * state.width + sageAt.x]?.sage ?? "Sage";
          return (
            <div className="modal-backdrop" onClick={() => setSageAt(null)}>
              <div className="modal sage-modal" onClick={(e) => e.stopPropagation()}>
                <div className="sage-modal-body">
                  <div className="sage-portrait">
                    <SagePortrait name={name} />
                  </div>
                  <div className="sage-modal-text">
                    <div className="modal-head">
                      <h2>🧙 {name}</h2>
                    </div>
                    <p className="sage-flavor">
                      « Voyageur… je tiens entre mes mains un présent, ou une malédiction. Le sort
                      décidera. Oseras-tu me faire confiance ? »
                    </p>
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() => {
                          send({ type: "CONSULT_SAGE", at: sageAt });
                          setSageAt(null);
                        }}
                      >
                        🤝 Faire confiance
                      </button>
                      <button onClick={() => setSageAt(null)}>Ignorer</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Résultat de la consultation */}
      {sageResult && (
        <div className="modal-backdrop" onClick={() => setSageResult(null)}>
          <div
            className={`modal sage-result ${sageResult.good ? "good" : "bad"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>
                {sageResult.good ? "✨ " : "💀 "}
                {sageResult.title}
              </h2>
            </div>
            <p>{sageResult.detail}</p>
            <button className="primary" onClick={() => setSageResult(null)}>
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* Écran de fin */}
      {victory.over && (
        <div className="endscreen">
          <div className="endcard">
            <h2>Partie terminée</h2>
            <p>
              {victory.winnerId !== null
                ? `Victoire de ${state.players[victory.winnerId]?.civName} (${
                    victory.reason === "domination" ? "domination" : "score"
                  })`
                : `Match nul`}
            </p>
            <ol className="scores">
              {[...state.players]
                .map((p) => ({ p, score: computeScore(state, p.id) }))
                .sort((a, b) => b.score - a.score)
                .map(({ p, score }) => {
                  const dead = getPlayerCityCount(state, p.id) === 0;
                  return (
                    <li key={p.id} className={dead ? "dead" : ""}>
                      <span className="dot" style={{ background: p.color }} />
                      {p.civName}
                      {p.isAI ? " (IA)" : ""} — {score} pts
                      {dead && (
                        <span className="skull" title="Éliminé pendant la partie">
                          {" "}
                          💀
                        </span>
                      )}
                    </li>
                  );
                })}
            </ol>
            {isHost ? (
              <button className="primary" onClick={onNewGame}>
                Nouvelle partie
              </button>
            ) : (
              <p className="hint">En attente d'une nouvelle partie lancée par l'hôte…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Onglets de l'écran d'aide : contenu PUREMENT descriptif (aucune règle de jeu ici). */
const HELP_TABS: ReadonlyArray<{ id: string; label: string; body: ReactNode }> = [
  {
    id: "bases",
    label: "🏁 Bases",
    body: (
      <ul>
        <li>
          À ton tour : tu gagnes des <b>⭐ étoiles</b>, tu joues tes unités et tes villes, puis{" "}
          <b>« Fin de tour »</b>.
        </li>
        <li>
          Les ⭐ servent à <b>recruter</b> des unités et <b>rechercher</b> des technologies.
        </li>
        <li>Plus tes villes sont grandes, plus elles te rapportent d'⭐.</li>
      </ul>
    ),
  },
  {
    id: "villes",
    label: "🏙️ Villes",
    body: (
      <ul>
        <li>
          <b>Récolte</b> les ressources autour d'une ville pour la faire <b>grandir</b> et monter de
          niveau.
        </li>
        <li>
          Chaque niveau te laisse choisir une <b>récompense</b> (or, troupe, atelier, muraille…).
        </li>
        <li>
          Pour t'agrandir : pose une unité sur un 🛖 <b>village</b> et fonde une ville, ou{" "}
          <b>capture</b> une ville ennemie.
        </li>
      </ul>
    ),
  },
  {
    id: "combat",
    label: "⚔️ Combat",
    body: (
      <ul>
        <li>Au corps-à-corps, le défenseur survivant te riposte : attaque quand tu es favorisé.</li>
        <li>
          On défend mieux <b>en ville, en forêt ou en montagne</b>. Une <b>muraille</b> protège
          encore plus.
        </li>
        <li>
          Une ville <b>murée</b> doit être assiégée : casse le rempart <b>avant</b> de la capturer.
        </li>
      </ul>
    ),
  },
  {
    id: "tech",
    label: "🔬 Tech",
    body: (
      <ul>
        <li>Les technologies débloquent de nouvelles unités, ressources et actions.</li>
        <li>
          Quelques clés : <b>Escalade</b> (montagnes), <b>Navigation</b> (mer),{" "}
          <b>Construction</b> (bâtir).
        </li>
      </ul>
    ),
  },
  {
    id: "sages",
    label: "🧙 Sages",
    body: (
      <ul>
        <li>
          <b>Stan</b> et <b>Nico</b> errent sur la carte. Mets une unité à côté pour les consulter.
        </li>
        <li>C'est un pari : ça peut t'aider… ou te coûter cher. Une seule tentative par sage.</li>
      </ul>
    ),
  },
  {
    id: "victoire",
    label: "🏆 Victoire",
    body: (
      <ul>
        <li>
          <b>Domination</b> : sois le dernier à posséder des villes.
        </li>
        <li>
          Sinon, au dernier tour, c'est le <b>meilleur score</b> qui gagne.
        </li>
      </ul>
    ),
  },
];

function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(HELP_TABS[0]!.id);
  const active = HELP_TABS.find((t) => t.id === tab) ?? HELP_TABS[0]!;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>❔ Aide & règles</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="help-tabs">
          {HELP_TABS.map((t) => (
            <button
              key={t.id}
              className={`help-tab${t.id === tab ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="help-body">{active.body}</div>
      </div>
    </div>
  );
}

interface TechTreeProps {
  state: GameState;
  me: number;
  cityCount: number;
  canResearch: boolean;
  onResearch: (id: TechId) => void;
  onClose: () => void;
}

/** Arbre de compétences : grille de 6 branches (palier 1 -> palier 2 en cartes). */
function TechTree({ state, me, cityCount, canResearch, onResearch, onClose }: TechTreeProps) {
  const player = state.players[me];
  const owns = (id: string) => player?.unlockedTechs.includes(id) ?? false;
  const stars = player?.stars ?? 0;

  // Regroupe les techs par branche, chaque branche triée palier 1 -> 2.
  const branches = new Map<number, TechDef[]>();
  for (const t of TECH_LIST) {
    const arr = branches.get(t.branch) ?? [];
    arr.push(t);
    branches.set(t.branch, arr);
  }
  const branchList = [...branches.values()]
    .sort((a, b) => a[0]!.branch - b[0]!.branch)
    .map((arr) => [...arr].sort((x, y) => x.tier - y.tier));

  const node = (tech: TechDef) => {
    const owned = owns(tech.id);
    const cost = computeTechCost(tech.tier, cityCount);
    const prereqMet = !tech.requires || owns(tech.requires);
    const affordable = stars >= cost;
    const legal = canResearch && isLegal(state, { type: "RESEARCH_TECH", techId: tech.id });
    const unlocks = describeUnlocks(tech);
    const cls = owned ? "owned" : !prereqMet ? "locked" : legal ? "legal" : "avail";
    const reqName = tech.requires ? TECHS[tech.requires].name : "";
    const title = owned
      ? `${tech.name} — acquise`
      : !prereqMet
        ? `${tech.name} — nécessite ${reqName}`
        : `${tech.name} — ${cost}⭐${affordable ? "" : " (étoiles insuffisantes)"}${
            unlocks ? `\nDébloque : ${unlocks}` : ""
          }`;
    return (
      <button
        className={`tech-card ${cls}`}
        disabled={!legal}
        onClick={() => onResearch(tech.id)}
        title={title}
      >
        <span className="tech-ic">{TECH_ICONS[tech.id as TechId]}</span>
        <span className="tech-main">
          <span className="tech-name">{tech.name}</span>
          {unlocks && <span className="tech-unlocks">{unlocks}</span>}
        </span>
        <span className="tech-state">
          {owned ? "✓" : !prereqMet ? "🔒" : `${cost}⭐`}
        </span>
      </button>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tech-tree" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🔬 Technologies</h2>
          <span className="tech-stars">⭐ {stars}</span>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tech-grid">
          {branchList.map((techs) => (
            <div className="tech-branch" key={techs[0]!.branch}>
              {techs.map((t, i) => (
                <Fragment key={t.id}>
                  {i > 0 && (
                    <div className={`tech-link${owns(techs[i - 1]!.id) ? " on" : ""}`}>▾</div>
                  )}
                  {node(t)}
                </Fragment>
              ))}
            </div>
          ))}
        </div>
        {!canResearch && <p className="hint">Tu pourras rechercher à ton tour.</p>}
      </div>
    </div>
  );
}
