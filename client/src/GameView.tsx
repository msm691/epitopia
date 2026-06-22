import { useEffect, useMemo, useState } from "react";
import type {
  Action,
  Coord,
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
  RESOURCE_HARVEST_COST,
  RESOURCE_POP_GAIN,
} from "@polytopia/shared";
import {
  isLegal,
  computeTechCost,
  getPlayerCityCount,
  trainableUnitsFor,
  checkVictory,
  computeScore,
  computeCombat,
  getDefenseBonus,
  maxHp,
  chebyshev,
} from "@polytopia/engine";
import { useGridCanvas } from "./canvas/useCanvas.js";

const TECH_LIST = Object.values(TECHS).sort((a, b) => a.branch - b.branch || a.tier - b.tier);

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
  eau: "🌊 Eau — infranchissable",
  ocean: "🌊 Océan — infranchissable",
};

/** Action sélectionnée par le joueur, en attente de confirmation. */
type Pending =
  | { kind: "move"; to: Coord }
  | { kind: "attack"; target: Unit }
  | { kind: "harvest"; at: Coord };

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

export interface GameViewProps {
  state: GameState;
  myId: number;
  /** Envoie une action au serveur autoritaire. */
  send: (action: Action) => void;
  /** Le joueur local est-il l'hôte (peut relancer) ? */
  isHost: boolean;
  /** Renvoie la partie au lobby (hôte uniquement). */
  onNewGame: () => void;
}

export function GameView({ state, myId, send, isHost, onNewGame }: GameViewProps) {
  const [selected, setSelected] = useState<Coord | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [techOpen, setTechOpen] = useState(false);

  // Toute mise à jour autoritaire de l'état annule une confirmation en suspens
  // (la situation a pu changer : l'action ne serait plus forcément la même).
  useEffect(() => setPending(null), [state]);

  const current = state.players[state.currentPlayer];
  const me = state.players[myId];
  const victory = useMemo(() => checkVictory(state), [state]);
  const isMyTurn = state.currentPlayer === myId && !victory.over;

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

  const pendingCoord: Coord | undefined =
    pending?.kind === "move"
      ? pending.to
      : pending?.kind === "attack"
        ? { x: pending.target.x, y: pending.target.y }
        : pending?.kind === "harvest"
          ? pending.at
          : undefined;

  const overlay = useMemo(
    () => ({
      selected: selected ?? undefined,
      moves: legalMoves,
      attacks: attackTargets.map((u) => ({ x: u.x, y: u.y })),
      harvests: harvestTargets,
      pending: pendingCoord,
    }),
    [selected, legalMoves, attackTargets, harvestTargets, pendingCoord],
  );

  // Aperçu de combat (dégâts prévus) pour une attaque en attente de confirmation.
  const combatPreview = useMemo(() => {
    if (pending?.kind !== "attack" || !selectedUnit) return null;
    const melee = chebyshev(selectedUnit, pending.target) === 1;
    return computeCombat(selectedUnit, pending.target, melee, getDefenseBonus(state, pending.target));
  }, [pending, selectedUnit, state]);

  const onTileClick = (coord: Coord) => {
    // À son tour, un clic sur une case d'action ARME l'action (confirmation requise).
    if (isMyTurn && selectedUnit) {
      const target = attackTargets.find((t) => sameCoord(t, coord));
      if (target) {
        setPending({ kind: "attack", target });
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
    }
    setPending(null);
  };

  const myCapital = state.cities.find((c) => c.ownerId === myId);
  const focus = myCapital ? { x: myCapital.x, y: myCapital.y } : undefined;
  const { wrapperRef, canvasRef, fitCamera, handlers } = useGridCanvas(
    state,
    overlay,
    onTileClick,
    focus,
  );

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
      {/* Carte plein écran */}
      <div className="viewport" ref={wrapperRef}>
        <canvas ref={canvasRef} {...handlers} />
      </div>

      {/* Bannière de tour (rejouée à chaque changement de tour) */}
      <div className="turn-banner" key={`${state.turn}-${state.currentPlayer}`}>
        {isMyTurn
          ? "À vous de jouer"
          : current?.isAI
            ? `🤖 ${current?.civName}`
            : `Tour de ${current?.civName}`}
      </div>

      {/* Barre du haut flottante */}
      <header className="topbar floating">
        <span className="brand">⬡ Polytopia</span>
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
        <span className="spacer" />
        <button className="icon-btn" title="Recentrer la carte" onClick={fitCamera}>
          🎯
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
          {selectedCity &&
            trainable.map((type: UnitType) => {
              const legal = isLegal(state, {
                type: "TRAIN_UNIT",
                cityId: selectedCity.id,
                unitType: type,
              });
              return (
                <button
                  key={type}
                  onClick={() =>
                    send({ type: "TRAIN_UNIT", cityId: selectedCity.id, unitType: type })
                  }
                  disabled={!legal}
                >
                  {UNIT_NAMES[type]} ({UNIT_STATS[type].cost}⭐)
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
            <span className="hint">PV {selectedUnit.hp} — jaune = déplacer, rouge = attaquer</span>
          )}
          {selectedCity && (
            <span className="hint">
              Ville niv. {selectedCity.level} (pop {selectedCity.population}, territoire{" "}
              {selectedCity.harvestRadius ?? 1}) —{" "}
              {harvestTargets.length > 0 ? "case verte = récolter" : "rien à récolter ici"}
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
          return (
            <div className="infobar floating">
              <span className="info-title">{TERRAIN_LABELS[tile.terrain]}</span>
              {tile.resource && (
                <span className="info-line">{RESOURCE_LABELS[tile.resource]} — récoltable depuis une ville voisine</span>
              )}
              {isVillage && (
                <span className="info-line village">
                  🛖 Village neutre — amène une unité ici puis « 🏗️ Fonder une ville »
                </span>
              )}
              {cityHere && (
                <span className="info-line">
                  🏛️ Ville de {state.players[cityHere.ownerId]?.civName}
                  {cityHere.ownerId === myId ? " (toi)" : " (ennemie — capture avec une unité dessus)"} — niv.{" "}
                  {cityHere.level}
                </span>
              )}
              {unitHere && (
                <span className="info-line">
                  {unitHere.ownerId === myId ? "Ton" : "Unité ennemie :"} {UNIT_NAMES[unitHere.type]} — PV{" "}
                  {unitHere.hp}/{maxHp(unitHere)}
                  {unitHere.ownerId !== myId ? " (sélectionne une de tes unités à portée pour l'attaquer)" : ""}
                </span>
              )}
              {!tile.resource && !unitHere && !cityHere && !isVillage && (
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
                .map(({ p, score }) => (
                  <li key={p.id}>
                    <span className="dot" style={{ background: p.color }} />
                    {p.civName}
                    {p.isAI ? " (IA)" : ""} — {score} pts
                  </li>
                ))}
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

interface TechTreeProps {
  state: GameState;
  me: number;
  cityCount: number;
  canResearch: boolean;
  onResearch: (id: TechId) => void;
  onClose: () => void;
}

/** Arbre de compétences : 6 branches (palier 1 -> palier 2) avec connecteurs. */
function TechTree({ state, me, cityCount, canResearch, onResearch, onClose }: TechTreeProps) {
  const player = state.players[me];
  const branches = new Map<number, TechDef[]>();
  for (const t of TECH_LIST) {
    const arr = branches.get(t.branch) ?? [];
    arr.push(t);
    branches.set(t.branch, arr);
  }

  const node = (tech: TechDef) => {
    const owned = player?.unlockedTechs.includes(tech.id) ?? false;
    const cost = computeTechCost(tech.tier, cityCount);
    const legal = canResearch && isLegal(state, { type: "RESEARCH_TECH", techId: tech.id });
    return (
      <button
        key={tech.id}
        className={`tech-node tier${tech.tier}${owned ? " owned" : ""}${legal ? " legal" : ""}`}
        disabled={owned || !legal}
        onClick={() => onResearch(tech.id)}
        title={owned ? "Recherchée" : legal ? `Rechercher (${cost}⭐)` : "Indisponible"}
      >
        <span className="tech-name">{tech.name}</span>
        <span className="tech-cost">{owned ? "✓ acquise" : `${cost}⭐`}</span>
        <span className="tech-unlocks">{describeUnlocks(tech) || "—"}</span>
      </button>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tech-tree" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Arbre de compétences</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="branches">
          {[...branches.values()].map((techs) => (
            <div className="branch" key={techs[0]!.branch}>
              {node(techs[0]!)}
              <span className="link" />
              {techs[1] && node(techs[1])}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
