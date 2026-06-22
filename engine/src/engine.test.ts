import { describe, it, expect } from "vitest";
import type { City, GameState, Player, Resource, Terrain, Tile, Unit } from "@polytopia/shared";
import { createInitialState, capitalId, tileIndex } from "./state.js";
import { generateMap, isLandTerrain, mapSizeForPlayers } from "./generateMap.js";
import { computeStarsPerTurn, cityStarsPerTurn, getPlayerIncome, levelUpCity } from "./economy.js";
import { computeCombat, getDefenseBonus } from "./combat.js";
import { DEFENSE_BONUS_CITY, DEFENSE_BONUS_WALL, TREASURE_STARS } from "@polytopia/shared";
import { computeTechCost, playerCanTrain, trainableUnitsFor } from "./tech.js";
import { checkVictory, computeScore } from "./victory.js";
import { nextAIAction, runAITurn } from "./ai.js";
import { makeUnit } from "./units.js";
import { createRng } from "./rng.js";
import { applyAction, IllegalActionError } from "./applyAction.js";
import { isLegal } from "./isLegal.js";

function makePlayer(id: number): Player {
  return {
    id,
    civName: `Civ ${id}`,
    color: "#000000",
    stars: 0,
    unlockedTechs: [],
    isAI: false,
  };
}

/** State de base avec N joueurs, pour tester les tours. */
function stateWithPlayers(n: number): GameState {
  const base = createInitialState({ seed: 1 });
  return {
    ...base,
    players: Array.from({ length: n }, (_, i) => makePlayer(i)),
  };
}

/** Grille NxN entièrement en champ, `playerCount` joueurs, sans unités. */
function gridState(size: number, playerCount: number): GameState {
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) tiles.push({ x, y, terrain: "champ" });
  }
  return {
    width: size,
    height: size,
    tiles,
    players: Array.from({ length: playerCount }, (_, i) => makePlayer(i)),
    units: [],
    cities: [],
    currentPlayer: 0,
    turn: 1,
    turnLimit: null,
    nextUnitId: 0,
    nextCityId: 0,
    seed: 0,
  };
}

/** Place une unité (mutation locale du state de test avant applyAction). */
function placeUnit(state: GameState, unit: Unit): void {
  state.units.push(unit);
  state.tiles[tileIndex(state.width, unit.x, unit.y)]!.unitId = unit.id;
}

function activeWarrior(state: GameState, id: string, owner: number, x: number, y: number) {
  placeUnit(state, makeUnit(id, "guerrier", owner, x, y, false));
}

/** Grille 5x5 avec une ville LIBRE du joueur 0 en (2,2) et `stars` étoiles. */
function freeCityState(stars: number): GameState {
  const s = gridState(5, 2);
  s.cities.push({ id: "c0", ownerId: 0, x: 2, y: 2, level: 1, population: 0, starsPerTurn: 2 });
  s.tiles[tileIndex(5, 2, 2)]!.cityId = "c0";
  s.tiles[tileIndex(5, 2, 2)]!.ownerId = 0;
  s.players = s.players.map((p) => (p.id === 0 ? { ...p, stars } : p));
  return s;
}

describe("RNG seedé", () => {
  it("est déterministe pour une même seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("produit des suites différentes pour des seeds différentes", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("int reste dans les bornes inclusives", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe("createInitialState", () => {
  it("crée une grille dimensionnée pour 2 joueurs par défaut (14x14)", () => {
    const s = createInitialState({ seed: 1 });
    expect(s.width).toBe(mapSizeForPlayers(2));
    expect(s.height).toBe(mapSizeForPlayers(2));
    expect(s.tiles).toHaveLength(s.width * s.height);
  });

  it("génère des terrains variés (pas une grille uniforme)", () => {
    const s = createInitialState({ seed: 1 });
    const kinds = new Set(s.tiles.map((t) => t.terrain));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("respecte tileIndex (y * width + x)", () => {
    const s = createInitialState({ seed: 1 });
    const tile = s.tiles[tileIndex(s.width, 3, 2)];
    expect(tile).toMatchObject({ x: 3, y: 2 });
  });

  it("est déterministe : même seed => même état", () => {
    const a = createInitialState({ seed: 99 });
    const b = createInitialState({ seed: 99 });
    expect(a).toEqual(b);
  });

  it("crée 2 joueurs par défaut, avec des couleurs distinctes", () => {
    const s = createInitialState({ seed: 1 });
    expect(s.players).toHaveLength(2);
    const colors = new Set(s.players.map((p) => p.color));
    expect(colors.size).toBe(2);
  });

  it("marque une case de départ par joueur, sur sa propre couleur", () => {
    const s = createInitialState({ seed: 1, playerCount: 3 });
    const owned = s.tiles.filter((t) => t.ownerId !== undefined);
    expect(owned).toHaveLength(3);
    // chaque joueur possède exactement une case de départ
    const ownerIds = owned.map((t) => t.ownerId).sort();
    expect(ownerIds).toEqual([0, 1, 2]);
  });

  it("commence au tour 1, joueur 0", () => {
    const s = createInitialState({ seed: 1 });
    expect(s.turn).toBe(1);
    expect(s.currentPlayer).toBe(0);
  });

  it("donne 5 étoiles de départ à chaque joueur", () => {
    const s = createInitialState({ seed: 1 });
    expect(s.players.every((p) => p.stars === 5)).toBe(true);
  });

  it("place 1 guerrier de départ en garnison sur chaque capitale (Étape C)", () => {
    const s = createInitialState({ seed: 1, playerCount: 3 });
    expect(s.units).toHaveLength(3);
    expect(s.nextUnitId).toBe(3);
    for (const player of s.players) {
      const cap = s.cities.find((c) => c.ownerId === player.id)!;
      const garrison = s.units.find((u) => u.x === cap.x && u.y === cap.y)!;
      expect(garrison.type).toBe("guerrier");
      expect(garrison.ownerId).toBe(player.id);
      expect(garrison.hasMoved).toBe(false); // actif dès le tour 1
      expect(s.tiles[tileIndex(s.width, cap.x, cap.y)]!.unitId).toBe(garrison.id);
    }
  });
});

describe("capitales (1b)", () => {
  it("auto-fonde une capitale niveau 1 par joueur, sur sa case de départ", () => {
    const s = createInitialState({ seed: 1, playerCount: 3 });
    expect(s.cities).toHaveLength(3);
    for (const player of s.players) {
      const cap = s.cities.find((c) => c.id === capitalId(player.id));
      expect(cap).toBeDefined();
      expect(cap!.ownerId).toBe(player.id);
      expect(cap!.level).toBe(1);
      expect(cap!.population).toBe(0);
      // la tuile sous la capitale référence bien la ville
      const tile = s.tiles[tileIndex(s.width, cap!.x, cap!.y)];
      expect(tile!.cityId).toBe(cap!.id);
      expect(tile!.ownerId).toBe(player.id);
    }
  });

  it("starsPerTurn d'une capitale niveau 1 = 2 (niveau + 1)", () => {
    const s = createInitialState({ seed: 1 });
    expect(s.cities[0]!.starsPerTurn).toBe(2);
    expect(computeStarsPerTurn(1)).toBe(2);
    expect(computeStarsPerTurn(3)).toBe(4);
  });
});

describe("économie (revenu / END_TURN)", () => {
  it("getPlayerIncome somme la production des villes du joueur", () => {
    const s = createInitialState({ seed: 1 });
    expect(getPlayerIncome(s, 0)).toBe(2); // 1 capitale niveau 1
    expect(getPlayerIncome(s, 1)).toBe(2);
  });

  it("crédite le revenu au joueur dont le tour commence", () => {
    const s = createInitialState({ seed: 1 }); // 2 joueurs, 5 étoiles chacun
    // Fin de tour du joueur 0 -> tour du joueur 1 qui encaisse +2
    const afterP0 = applyAction(s, { type: "END_TURN" });
    expect(afterP0.currentPlayer).toBe(1);
    expect(afterP0.players[1]!.stars).toBe(7);
    expect(afterP0.players[0]!.stars).toBe(5); // inchangé

    // Fin de tour du joueur 1 -> retour joueur 0 (tour 2) qui encaisse +2
    const afterP1 = applyAction(afterP0, { type: "END_TURN" });
    expect(afterP1.currentPlayer).toBe(0);
    expect(afterP1.turn).toBe(2);
    expect(afterP1.players[0]!.stars).toBe(7);
  });
});

describe("generateMap (génération & placement)", () => {
  it("est déterministe : même seed => mêmes tuiles et mêmes départs", () => {
    const a = generateMap(12345, 11, 11, 4);
    const b = generateMap(12345, 11, 11, 4);
    expect(a).toEqual(b);
  });

  it("produit des cartes différentes pour des seeds différentes", () => {
    const a = generateMap(1, 11, 11, 2);
    const b = generateMap(2, 11, 11, 2);
    expect(a.tiles).not.toEqual(b.tiles);
  });

  it("place exactement un départ par joueur, tous distincts et sur la terre", () => {
    const { tiles, starts } = generateMap(7, 16, 16, 8);
    expect(starts).toHaveLength(8);
    const keys = new Set(starts.map((s) => `${s.x},${s.y}`));
    expect(keys.size).toBe(8); // tous distincts
    for (const s of starts) {
      const tile = tiles[tileIndex(16, s.x, s.y)];
      expect(tile).toBeDefined();
      expect(isLandTerrain(tile!.terrain)).toBe(true);
    }
  });

  it("force chaque case de départ en champ (capitale fondable)", () => {
    const { tiles, starts } = generateMap(3, 11, 11, 2);
    for (const s of starts) {
      expect(tiles[tileIndex(11, s.x, s.y)]!.terrain).toBe("champ");
    }
  });

  it("espace les 2 joueurs (distance euclidienne suffisante sur 50 seeds)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { starts } = generateMap(seed, 11, 11, 2);
      const [a, b] = starts as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      expect(dist).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("END_TURN", () => {
  it("passe au joueur suivant sans changer de tour", () => {
    const s = stateWithPlayers(2);
    const next = applyAction(s, { type: "END_TURN" });
    expect(next.currentPlayer).toBe(1);
    expect(next.turn).toBe(1);
  });

  it("incrémente le tour quand on revient au joueur 0", () => {
    let s = stateWithPlayers(2);
    s = applyAction(s, { type: "END_TURN" }); // -> joueur 1, tour 1
    s = applyAction(s, { type: "END_TURN" }); // -> joueur 0, tour 2
    expect(s.currentPlayer).toBe(0);
    expect(s.turn).toBe(2);
  });

  it("ne mute pas l'état d'origine (immutabilité)", () => {
    const s = stateWithPlayers(2);
    const snapshot: GameState = JSON.parse(JSON.stringify(s));
    applyAction(s, { type: "END_TURN" });
    expect(s).toEqual(snapshot);
  });

  it("est illégal sans joueurs", () => {
    const s = createInitialState({ seed: 1, playerCount: 0 });
    expect(isLegal(s, { type: "END_TURN" })).toBe(false);
    expect(() => applyAction(s, { type: "END_TURN" })).toThrow(IllegalActionError);
  });
});

describe("actions non implémentées", () => {
  it("FOUND_CITY est illégal pour l'instant", () => {
    const s = stateWithPlayers(2);
    expect(isLegal(s, { type: "FOUND_CITY", unitId: "u1" })).toBe(false);
    expect(() => applyAction(s, { type: "FOUND_CITY", unitId: "u1" })).toThrow(
      IllegalActionError,
    );
  });
});

describe("TRAIN_UNIT (1c)", () => {
  it("recrute un guerrier sur une ville libre, déduit le coût, unité inactive ce tour", () => {
    const s = freeCityState(5);
    const next = applyAction(s, { type: "TRAIN_UNIT", cityId: "c0", unitType: "guerrier" });

    expect(next.units).toHaveLength(1);
    const u = next.units[0]!;
    expect(u.type).toBe("guerrier");
    expect(u.ownerId).toBe(0);
    expect(u.hasMoved).toBe(true); // ne joue pas le tour de son recrutement
    expect(u.hasAttacked).toBe(true);
    expect({ x: u.x, y: u.y }).toEqual({ x: 2, y: 2 });
    expect(next.tiles[tileIndex(5, 2, 2)]!.unitId).toBe(u.id);
    expect(next.players[0]!.stars).toBe(3); // 5 - 2
    expect(next.nextUnitId).toBe(1);
  });

  it("est illégal : pas assez d'étoiles", () => {
    const s = freeCityState(1);
    expect(isLegal(s, { type: "TRAIN_UNIT", cityId: "c0", unitType: "guerrier" })).toBe(false);
  });

  it("est illégal : ce n'est pas le tour du propriétaire de la ville", () => {
    const s = freeCityState(20);
    s.cities.push({ id: "c1", ownerId: 1, x: 0, y: 4, level: 1, population: 0, starsPerTurn: 2 });
    s.tiles[tileIndex(5, 0, 4)]!.cityId = "c1";
    expect(isLegal(s, { type: "TRAIN_UNIT", cityId: "c1", unitType: "guerrier" })).toBe(false);
  });

  it("est illégal : unité non recrutable à ce stade", () => {
    const s = freeCityState(20);
    expect(isLegal(s, { type: "TRAIN_UNIT", cityId: "c0", unitType: "archer" })).toBe(false);
  });

  it("est illégal : case de la ville déjà occupée", () => {
    const s = freeCityState(20);
    const after = applyAction(s, { type: "TRAIN_UNIT", cityId: "c0", unitType: "guerrier" });
    expect(isLegal(after, { type: "TRAIN_UNIT", cityId: "c0", unitType: "guerrier" })).toBe(false);
  });

  it("une unité recrutée redevient active au tour suivant du joueur", () => {
    let s = freeCityState(20);
    s = applyAction(s, { type: "TRAIN_UNIT", cityId: "c0", unitType: "guerrier" });
    const id = s.units[0]!.id;
    s = applyAction(s, { type: "END_TURN" }); // -> joueur 1
    s = applyAction(s, { type: "END_TURN" }); // -> retour joueur 0
    const u = s.units.find((x) => x.id === id)!;
    expect(u.hasMoved).toBe(false);
    expect(u.hasAttacked).toBe(false);
  });
});

describe("MOVE_UNIT (1c)", () => {
  it("déplace une unité d'une case et met à jour les tuiles", () => {
    const s = gridState(5, 1);
    activeWarrior(s, "u0", 0, 2, 2);
    const next = applyAction(s, { type: "MOVE_UNIT", unitId: "u0", to: { x: 3, y: 3 } });

    const u = next.units[0]!;
    expect({ x: u.x, y: u.y }).toEqual({ x: 3, y: 3 });
    expect(u.hasMoved).toBe(true);
    expect(next.tiles[tileIndex(5, 2, 2)]!.unitId).toBeUndefined(); // ancienne libérée
    expect(next.tiles[tileIndex(5, 3, 3)]!.unitId).toBe("u0"); // nouvelle occupée
  });

  it("est illégal : au-delà de la portée de mouvement", () => {
    const s = gridState(5, 1);
    activeWarrior(s, "u0", 0, 2, 2); // mouvement 1
    expect(isLegal(s, { type: "MOVE_UNIT", unitId: "u0", to: { x: 4, y: 2 } })).toBe(false);
  });

  it("est illégal : destination sur l'eau", () => {
    const s = gridState(5, 1);
    activeWarrior(s, "u0", 0, 2, 2);
    s.tiles[tileIndex(5, 2, 3)]!.terrain = "eau";
    expect(isLegal(s, { type: "MOVE_UNIT", unitId: "u0", to: { x: 2, y: 3 } })).toBe(false);
  });

  it("est illégal : destination occupée par une autre unité", () => {
    const s = gridState(5, 1);
    activeWarrior(s, "u0", 0, 2, 2);
    activeWarrior(s, "u1", 0, 3, 2);
    expect(isLegal(s, { type: "MOVE_UNIT", unitId: "u0", to: { x: 3, y: 2 } })).toBe(false);
  });

  it("est illégal : l'unité a déjà bougé ce tour", () => {
    const s = gridState(5, 1);
    placeUnit(s, makeUnit("u0", "guerrier", 0, 2, 2, true)); // hasMoved = true
    expect(isLegal(s, { type: "MOVE_UNIT", unitId: "u0", to: { x: 3, y: 2 } })).toBe(false);
  });

  it("est illégal : l'unité n'appartient pas au joueur courant", () => {
    const s = gridState(5, 2);
    activeWarrior(s, "u0", 1, 2, 2); // appartient au joueur 1, tour du joueur 0
    expect(isLegal(s, { type: "MOVE_UNIT", unitId: "u0", to: { x: 3, y: 2 } })).toBe(false);
  });
});

describe("computeCombat (formule Polytopia)", () => {
  const guerrier = (hp: number) => makeUnit("g", "guerrier", 0, 0, 0, false, hp);
  const archer = (hp: number) => makeUnit("a", "archer", 0, 0, 0, false, hp);

  it("guerrier vs guerrier (pleine vie, mêlée) : 5 dégâts de part et d'autre", () => {
    const r = computeCombat(guerrier(10), guerrier(10), true);
    expect(r.defenderDamage).toBe(5);
    expect(r.attackerDamage).toBe(5);
    expect(r.defenderDies).toBe(false);
    expect(r.attackerDies).toBe(false);
  });

  it("attaque à distance : aucune riposte", () => {
    const r = computeCombat(archer(10), guerrier(10), false);
    expect(r.defenderDamage).toBeGreaterThan(0);
    expect(r.attackerDamage).toBe(0);
  });

  it("le HP réduit la force d'attaque (unité blessée frappe moins fort)", () => {
    const fort = computeCombat(guerrier(10), guerrier(10), false).defenderDamage;
    const blesse = computeCombat(guerrier(2), guerrier(10), false).defenderDamage;
    expect(blesse).toBeLessThan(fort);
  });

  it("pas de riposte si le défenseur meurt", () => {
    const r = computeCombat(guerrier(10), guerrier(2), true);
    expect(r.defenderDies).toBe(true);
    expect(r.attackerDamage).toBe(0);
  });
});

describe("ATTACK (2a)", () => {
  it("attaque en mêlée : dégâts des deux côtés, attaquant marqué comme ayant agi", () => {
    const s = gridState(5, 2);
    activeWarrior(s, "u0", 0, 2, 2);
    activeWarrior(s, "u1", 1, 3, 2); // adjacent, ennemi
    const next = applyAction(s, { type: "ATTACK", attackerId: "u0", targetId: "u1" });

    const a = next.units.find((u) => u.id === "u0")!;
    const d = next.units.find((u) => u.id === "u1")!;
    expect(d.hp).toBe(5);
    expect(a.hp).toBe(5);
    expect(a.hasAttacked).toBe(true);
    expect(a.hasMoved).toBe(true); // ne peut plus bouger après avoir attaqué
  });

  it("tue le défenseur : retiré du plateau et case libérée", () => {
    const s = gridState(5, 2);
    activeWarrior(s, "u0", 0, 2, 2);
    placeUnit(s, makeUnit("u1", "guerrier", 1, 3, 2, false, 2)); // défenseur à 2 PV
    const next = applyAction(s, { type: "ATTACK", attackerId: "u0", targetId: "u1" });

    expect(next.units.find((u) => u.id === "u1")).toBeUndefined();
    expect(next.tiles[tileIndex(5, 3, 2)]!.unitId).toBeUndefined();
  });

  it("la riposte peut tuer l'attaquant (mêlée)", () => {
    const s = gridState(5, 2);
    placeUnit(s, makeUnit("u0", "guerrier", 0, 2, 2, false, 2)); // attaquant fragile
    placeUnit(s, makeUnit("u1", "geant", 1, 3, 2, false)); // gros tank
    const next = applyAction(s, { type: "ATTACK", attackerId: "u0", targetId: "u1" });

    expect(next.units.find((u) => u.id === "u0")).toBeUndefined(); // attaquant mort
    expect(next.units.find((u) => u.id === "u1")).toBeDefined(); // défenseur survit
    expect(next.tiles[tileIndex(5, 2, 2)]!.unitId).toBeUndefined();
  });

  it("est illégal : cible alliée, hors de portée, ou déjà attaqué", () => {
    const s = gridState(5, 2);
    activeWarrior(s, "u0", 0, 1, 1);
    activeWarrior(s, "ally", 0, 1, 2); // allié adjacent
    activeWarrior(s, "far", 1, 4, 4); // ennemi hors de portée
    expect(isLegal(s, { type: "ATTACK", attackerId: "u0", targetId: "ally" })).toBe(false);
    expect(isLegal(s, { type: "ATTACK", attackerId: "u0", targetId: "far" })).toBe(false);

    placeUnit(s, makeUnit("spent", "guerrier", 0, 2, 1, false));
    s.units.find((u) => u.id === "spent")!.hasAttacked = true;
    placeUnit(s, makeUnit("foe", "guerrier", 1, 2, 2, false));
    expect(isLegal(s, { type: "ATTACK", attackerId: "spent", targetId: "foe" })).toBe(false);
  });
});

describe("CAPTURE_CITY (2a)", () => {
  function withEnemyCity(): GameState {
    const s = gridState(5, 2);
    s.cities.push({
      id: "c1",
      ownerId: 1,
      x: 2,
      y: 2,
      level: 1,
      population: 0,
      starsPerTurn: 2,
    });
    s.tiles[tileIndex(5, 2, 2)]!.cityId = "c1";
    s.tiles[tileIndex(5, 2, 2)]!.ownerId = 1;
    return s;
  }

  it("capture une ville ennemie quand on s'y tient", () => {
    const s = withEnemyCity();
    activeWarrior(s, "u0", 0, 2, 2); // joueur 0 sur la ville du joueur 1
    expect(isLegal(s, { type: "CAPTURE_CITY", unitId: "u0" })).toBe(true);

    const next = applyAction(s, { type: "CAPTURE_CITY", unitId: "u0" });
    expect(next.cities.find((c) => c.id === "c1")!.ownerId).toBe(0);
    expect(next.tiles[tileIndex(5, 2, 2)]!.ownerId).toBe(0);
  });

  it("est illégal : ville déjà à soi, ou unité hors d'une ville", () => {
    const own = withEnemyCity();
    own.cities[0]!.ownerId = 0;
    own.tiles[tileIndex(5, 2, 2)]!.ownerId = 0;
    activeWarrior(own, "u0", 0, 2, 2);
    expect(isLegal(own, { type: "CAPTURE_CITY", unitId: "u0" })).toBe(false);

    const off = withEnemyCity();
    activeWarrior(off, "u0", 0, 0, 0); // pas sur une ville
    expect(isLegal(off, { type: "CAPTURE_CITY", unitId: "u0" })).toBe(false);
  });
});

describe("RESEARCH_TECH (arbre de tech)", () => {
  /** Donne `stars` étoiles au joueur courant. */
  function withStars(stars: number): GameState {
    const base = createInitialState({ seed: 1 });
    return { ...base, players: base.players.map((p) => (p.id === 0 ? { ...p, stars } : p)) };
  }

  it("coût = base*palier + nb de villes (anti rush)", () => {
    expect(computeTechCost(1, 1)).toBe(5);
    expect(computeTechCost(2, 1)).toBe(9);
    expect(computeTechCost(1, 3)).toBe(7);
    expect(computeTechCost(2, 2)).toBe(10);
  });

  it("recherche une tech de palier 1 : déduit le coût et la débloque", () => {
    const s = withStars(5); // 1 ville -> chasse coûte 5
    const next = applyAction(s, { type: "RESEARCH_TECH", techId: "chasse" });
    expect(next.players[0]!.stars).toBe(0);
    expect(next.players[0]!.unlockedTechs).toContain("chasse");
  });

  it("est illégal : pas assez d'étoiles", () => {
    const s = withStars(4);
    expect(isLegal(s, { type: "RESEARCH_TECH", techId: "chasse" })).toBe(false);
  });

  it("est illégal : prérequis manquant (palier 2 sans palier 1)", () => {
    const s = withStars(20);
    expect(isLegal(s, { type: "RESEARCH_TECH", techId: "archerie" })).toBe(false);
  });

  it("débloque le palier 2 une fois le prérequis acquis", () => {
    let s = withStars(20);
    s = applyAction(s, { type: "RESEARCH_TECH", techId: "chasse" }); // 20 - 5 = 15
    expect(isLegal(s, { type: "RESEARCH_TECH", techId: "archerie" })).toBe(true);
    s = applyAction(s, { type: "RESEARCH_TECH", techId: "archerie" }); // 15 - 9 = 6
    expect(s.players[0]!.stars).toBe(6);
    expect(s.players[0]!.unlockedTechs).toEqual(["chasse", "archerie"]);
  });

  it("est illégal : tech déjà connue ou id inconnu", () => {
    let s = withStars(20);
    s = applyAction(s, { type: "RESEARCH_TECH", techId: "chasse" });
    expect(isLegal(s, { type: "RESEARCH_TECH", techId: "chasse" })).toBe(false);
    expect(isLegal(s, { type: "RESEARCH_TECH", techId: "inexistante" })).toBe(false);
  });

  it("une tech débloque le recrutement de son unité", () => {
    let s = withStars(20);
    expect(playerCanTrain(s, 0, "cavalier")).toBe(false);
    s = applyAction(s, { type: "RESEARCH_TECH", techId: "equitation" });
    expect(playerCanTrain(s, 0, "cavalier")).toBe(true);
  });
});

describe("recrutement des 8 unités via tech (2b)", () => {
  /** Ville libre + techs débloquées directement pour le joueur 0. */
  function withTechs(techIds: string[]): GameState {
    const s = freeCityState(99);
    s.players = s.players.map((p) => (p.id === 0 ? { ...p, unlockedTechs: [...techIds] } : p));
    return s;
  }

  it("au départ, seul le Guerrier est recrutable", () => {
    expect(trainableUnitsFor(createInitialState({ seed: 1 }), 0)).toEqual(["guerrier"]);
  });

  it.each([
    ["archer", ["chasse"], { range: 2 }],
    ["cavalier", ["equitation"], { movement: 2 }],
    ["defenseur", ["strategie"], { defense: 3 }],
    ["catapulte", ["chasse", "archerie"], { range: 3 }],
    ["epeiste", ["escalade", "forge"], { attack: 3 }],
    ["chevalier", ["equitation", "chevalerie"], { movement: 3 }],
    ["geant", ["strategie", "tactique"], { hp: 40 }],
  ])("recrute le %s après ses techs, avec ses stats", (unitType, techs, expectedStats) => {
    const s = withTechs(techs as string[]);
    const next = applyAction(s, {
      type: "TRAIN_UNIT",
      cityId: "c0",
      unitType: unitType as GameState["units"][number]["type"],
    });
    const unit = next.units.at(-1)!;
    expect(unit.type).toBe(unitType);
    expect(unit).toMatchObject(expectedStats);
  });

  it("trainableUnitsFor s'étend avec les techs débloquées", () => {
    const s = withTechs(["chasse", "equitation"]);
    expect(trainableUnitsFor(s, 0)).toEqual(["guerrier", "archer", "cavalier"]);
  });
});

describe("levelUpCity (économie)", () => {
  const cap = (): City => ({
    id: "c",
    ownerId: 0,
    x: 0,
    y: 0,
    level: 1,
    population: 0,
    starsPerTurn: 2,
  });

  it("niveau 1 -> 2 à 2 population, production = niveau + 1", () => {
    const c = levelUpCity(levelUpCity(cap(), 1), 1);
    expect(c.level).toBe(2);
    expect(c.population).toBe(0);
    expect(c.starsPerTurn).toBe(3);
  });

  it("conserve le surplus de population", () => {
    // +5 d'un coup : 2 (->niv2) puis 3 (->niv3), reste 0
    const c = levelUpCity(cap(), 5);
    expect(c.level).toBe(3);
    expect(c.population).toBe(0);
    // +1 supplémentaire reste en surplus (seuil niv3->4 = 4)
    expect(levelUpCity(c, 1).level).toBe(3);
    expect(levelUpCity(c, 1).population).toBe(1);
  });
});

describe("génération de ressources (2c)", () => {
  const TERRAIN_OF: Record<Resource, readonly Terrain[]> = {
    fruits: ["champ"],
    cereales: ["champ"],
    gibier: ["foret"],
    bois: ["foret"],
    minerai: ["montagne"],
    metal: ["montagne"],
    poisson: ["eau"],
    luxe: ["champ", "foret", "montagne"],
  };

  it("place des ressources cohérentes avec le terrain", () => {
    const { tiles } = generateMap(1, 16, 16, 4);
    const withRes = tiles.filter((t) => t.resource !== undefined);
    expect(withRes.length).toBeGreaterThan(0);
    for (const t of withRes) {
      expect(TERRAIN_OF[t.resource!]).toContain(t.terrain);
    }
  });

  it("garantit au moins 2 ressources autour de chaque départ (équité)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { tiles, starts } = generateMap(seed, 11, 11, 2);
      for (const s of starts) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const t = tiles[tileIndex(11, s.x + dx, s.y + dy)];
            if (t && s.x + dx >= 0 && s.y + dy >= 0 && s.x + dx < 11 && s.y + dy < 11) {
              if (t.resource !== undefined) count++;
            }
          }
        }
        expect(count).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("HARVEST_RESOURCE (2c)", () => {
  /** Ville du joueur 0 au centre d'une grille en champ, joueur riche. */
  function harvestState(): GameState {
    const s = gridState(5, 2);
    s.cities.push({
      id: "c0",
      ownerId: 0,
      x: 2,
      y: 2,
      level: 1,
      population: 0,
      starsPerTurn: 2,
    });
    s.tiles[tileIndex(5, 2, 2)]!.cityId = "c0";
    s.tiles[tileIndex(5, 2, 2)]!.ownerId = 0;
    s.players = s.players.map((p) => (p.id === 0 ? { ...p, stars: 20 } : p));
    return s;
  }

  it("récolte une ressource voisine : -coût, +population, ressource consommée", () => {
    const s = harvestState();
    s.tiles[tileIndex(5, 3, 2)]!.resource = "fruits";
    const next = applyAction(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 3, y: 2 } });

    expect(next.players[0]!.stars).toBe(18); // -2
    expect(next.cities[0]!.population).toBe(1);
    expect(next.tiles[tileIndex(5, 3, 2)]!.resource).toBeUndefined();
  });

  it("deux récoltes font monter la ville au niveau 2", () => {
    let s = harvestState();
    s.tiles[tileIndex(5, 3, 2)]!.resource = "fruits";
    s.tiles[tileIndex(5, 1, 2)]!.resource = "fruits";
    s = applyAction(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 3, y: 2 } });
    s = applyAction(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 1, y: 2 } });
    expect(s.cities[0]!.level).toBe(2);
    expect(s.cities[0]!.starsPerTurn).toBe(3);
  });

  it("est illégal : ressource nécessitant une tech non possédée", () => {
    const s = harvestState();
    s.tiles[tileIndex(5, 3, 2)]!.resource = "gibier"; // requiert Chasse
    expect(
      isLegal(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 3, y: 2 } }),
    ).toBe(false);
  });

  it("est illégal : hors du rayon, sans ressource, ou trop pauvre", () => {
    const s = harvestState();
    s.tiles[tileIndex(5, 4, 4)]!.resource = "fruits"; // hors rayon 1
    expect(
      isLegal(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 4, y: 4 } }),
    ).toBe(false);
    // case voisine sans ressource
    expect(
      isLegal(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 3, y: 2 } }),
    ).toBe(false);
    // ressource présente mais joueur sans étoiles
    const poor = harvestState();
    poor.tiles[tileIndex(5, 3, 2)]!.resource = "fruits";
    poor.players = poor.players.map((p) => (p.id === 0 ? { ...p, stars: 1 } : p));
    expect(
      isLegal(poor, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 3, y: 2 } }),
    ).toBe(false);
  });
});

describe("checkVictory (2e)", () => {
  it("partie en cours au départ", () => {
    expect(checkVictory(createInitialState({ seed: 1 })).over).toBe(false);
  });

  it("domination : un seul propriétaire de ville restant", () => {
    const base = createInitialState({ seed: 1 });
    const s = { ...base, cities: base.cities.map((c) => ({ ...c, ownerId: 0 })) };
    const v = checkVictory(s);
    expect(v.over).toBe(true);
    expect(v.reason).toBe("domination");
    expect(v.winnerId).toBe(0);
  });

  it("computeScore pondère villes, niveaux et étoiles", () => {
    const s = createInitialState({ seed: 1 });
    expect(computeScore(s, 0)).toBe(22); // ville 10 + niveau 5 + 1 unité 2 + 5 étoiles
  });

  it("tour limite atteint : match nul si égalité de score", () => {
    const base = createInitialState({ seed: 1 });
    const s = { ...base, turn: base.turnLimit! + 1 };
    const v = checkVictory(s);
    expect(v.over).toBe(true);
    expect(v.reason).toBe("score");
    expect(v.winnerId).toBeNull();
    expect(v.winners).toEqual([0, 1]);
  });

  it("tour limite atteint : vainqueur au plus haut score", () => {
    const base = createInitialState({ seed: 1 });
    const s = {
      ...base,
      turn: base.turnLimit! + 1,
      players: base.players.map((p) => (p.id === 0 ? { ...p, stars: 50 } : p)),
    };
    expect(checkVictory(s).winnerId).toBe(0);
  });

  it("partie illimitée : pas d'arrêt au score même très tard", () => {
    const s = { ...createInitialState({ seed: 1, turnLimit: null }), turn: 999 };
    expect(checkVictory(s).over).toBe(false);
  });
});

describe("IA gloutonne (4a)", () => {
  /** Grille NxN en champ avec villes/joueurs riches pour tester l'IA. */
  function aiState(size: number): GameState {
    const s = gridState(size, 2);
    s.players = s.players.map((p) => ({ ...p, stars: 20, isAI: true }));
    return s;
  }
  function addCity(s: GameState, id: string, owner: number, x: number, y: number): void {
    s.cities.push({ id, ownerId: owner, x, y, level: 1, population: 0, starsPerTurn: 2 });
    s.tiles[tileIndex(s.width, x, y)]!.cityId = id;
    s.tiles[tileIndex(s.width, x, y)]!.ownerId = owner;
  }

  it("capture une ville ennemie sur laquelle elle se tient (priorité max)", () => {
    const s = aiState(5);
    addCity(s, "enemy", 1, 2, 2);
    activeWarrior(s, "u0", 0, 2, 2);
    expect(nextAIAction(s, 0)).toEqual({ type: "CAPTURE_CITY", unitId: "u0" });
  });

  it("attaque une cible affaiblie adjacente", () => {
    const s = aiState(5);
    activeWarrior(s, "u0", 0, 2, 2);
    placeUnit(s, makeUnit("foe", "guerrier", 1, 3, 2, false, 2)); // ennemi à 2 PV
    expect(nextAIAction(s, 0)).toEqual({ type: "ATTACK", attackerId: "u0", targetId: "foe" });
  });

  it("récolte une ressource voisine de sa ville", () => {
    const s = aiState(5);
    addCity(s, "c0", 0, 2, 2);
    s.tiles[tileIndex(5, 3, 2)]!.resource = "fruits";
    expect(nextAIAction(s, 0)).toEqual({
      type: "HARVEST_RESOURCE",
      cityId: "c0",
      at: { x: 3, y: 2 },
    });
  });

  it("recrute quand rien à récolter et pas d'ennemi proche", () => {
    const s = aiState(5);
    addCity(s, "c0", 0, 2, 2); // aucune ressource autour, aucun ennemi
    const action = nextAIAction(s, 0);
    expect(action.type).toBe("TRAIN_UNIT");
  });

  it("avance vers l'ennemi quand il n'y a rien d'autre à faire", () => {
    const s = aiState(7);
    activeWarrior(s, "u0", 0, 0, 0);
    placeUnit(s, makeUnit("foe", "guerrier", 1, 6, 6, false));
    s.players = s.players.map((p) => (p.id === 0 ? { ...p, stars: 0 } : p)); // pas de tech
    const action = nextAIAction(s, 0);
    expect(action.type).toBe("MOVE_UNIT");
    if (action.type === "MOVE_UNIT") {
      const before = Math.max(6, 6);
      const after = Math.max(Math.abs(action.to.x - 6), Math.abs(action.to.y - 6));
      expect(after).toBeLessThan(before); // se rapproche
    }
  });

  it("finit son tour quand rien n'est possible", () => {
    const s = gridState(5, 2); // joueurs à 0 étoile, aucune ville, aucun ennemi
    activeWarrior(s, "u0", 0, 2, 2);
    expect(nextAIAction(s, 0)).toEqual({ type: "END_TURN" });
  });

  it("runAITurn termine toujours par END_TURN (et ne plante pas)", () => {
    const base = createInitialState({ seed: 3 });
    const { actions } = runAITurn(base, 0);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.at(-1)).toEqual({ type: "END_TURN" });
    expect(actions.length).toBeLessThan(200);
  });

  it("une partie 100% IA se termine toujours (anti-blocage)", () => {
    let s = createInitialState({ seed: 5, turnLimit: 30 });
    let guard = 0;
    while (!checkVictory(s).over && guard < 2000) {
      s = runAITurn(s, s.currentPlayer).state;
      guard++;
    }
    expect(checkVictory(s).over).toBe(true);
  });
});

describe("bonus défensif (anti-rush, Étape A)", () => {
  it("getDefenseBonus : ville et terrain donnent 1.5, plaine 1", () => {
    const s = gridState(5, 2);
    // ville en (2,2)
    s.cities.push({ id: "c", ownerId: 1, x: 2, y: 2, level: 1, population: 0, starsPerTurn: 2 });
    s.tiles[tileIndex(5, 2, 2)]!.cityId = "c";
    s.tiles[tileIndex(5, 3, 3)]!.terrain = "montagne";
    const onCity = makeUnit("a", "guerrier", 1, 2, 2, false);
    const onMtn = makeUnit("b", "guerrier", 1, 3, 3, false);
    const onPlain = makeUnit("c2", "guerrier", 1, 0, 0, false);
    expect(getDefenseBonus(s, onCity)).toBe(1.5);
    expect(getDefenseBonus(s, onMtn)).toBe(1.5);
    expect(getDefenseBonus(s, onPlain)).toBe(1);
  });

  it("computeCombat : un défenseur bonifié encaisse moins et riposte plus fort", () => {
    const att = makeUnit("a", "guerrier", 0, 0, 0, false);
    const def = makeUnit("d", "guerrier", 1, 0, 0, false);
    const plain = computeCombat(att, def, true, 1);
    const fortified = computeCombat(att, def, true, 1.5);
    expect(fortified.defenderDamage).toBeLessThan(plain.defenderDamage);
    expect(fortified.attackerDamage).toBeGreaterThanOrEqual(plain.attackerDamage);
  });

  it("l'IA n'attaque PAS un défenseur retranché dans une ville (échange perdant)", () => {
    const s = gridState(5, 2);
    // défenseur ennemi dans sa ville
    s.cities.push({ id: "enemy", ownerId: 1, x: 3, y: 2, level: 1, population: 0, starsPerTurn: 2 });
    s.tiles[tileIndex(5, 3, 2)]!.cityId = "enemy";
    s.tiles[tileIndex(5, 3, 2)]!.ownerId = 1;
    placeUnit(s, makeUnit("def", "guerrier", 1, 3, 2, false));
    activeWarrior(s, "att", 0, 2, 2); // mon guerrier adjacent
    // Sans bonus l'échange serait neutre (5/5) -> attaque ; avec bonus ville c'est perdant.
    const action = nextAIAction(s, 0);
    expect(action.type).not.toBe("ATTACK");
  });
});

describe("distance & taille de carte (anti-rush, Étape B)", () => {
  it("mapSizeForPlayers grandit avec le nombre de joueurs", () => {
    expect(mapSizeForPlayers(2)).toBe(14);
    expect(mapSizeForPlayers(4)).toBe(16);
    expect(mapSizeForPlayers(8)).toBe(20);
  });

  it("les 2 joueurs spawn loin (traverser prend de nombreux tours)", () => {
    // Sur la carte par défaut (14x14), la distance Chebyshev doit être grande
    // => avec mouvement 1, il faut beaucoup de tours pour atteindre l'ennemi.
    for (let seed = 1; seed <= 30; seed++) {
      const s = createInitialState({ seed });
      const a = s.cities[0]!;
      const b = s.cities[1]!;
      const cheb = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      expect(cheb).toBeGreaterThanOrEqual(8); // >= ~8 tours de marche
    }
  });
});

describe("posture IA (anti-rush, Étape D)", () => {
  function withCity(s: GameState, id: string, owner: number, x: number, y: number): void {
    s.cities.push({ id, ownerId: owner, x, y, level: 1, population: 0, starsPerTurn: 2 });
    s.tiles[tileIndex(s.width, x, y)]!.cityId = id;
    s.tiles[tileIndex(s.width, x, y)]!.ownerId = owner;
  }
  function richP0(s: GameState, stars: number): void {
    s.players = s.players.map((p) => (p.id === 0 ? { ...p, stars } : p));
  }

  it("garde sa garnison : ne fonce pas vers un ennemi lointain sans armée ni moyens", () => {
    const s = gridState(9, 2);
    withCity(s, "c0", 0, 1, 1);
    placeUnit(s, makeUnit("u0", "guerrier", 0, 1, 1, false)); // garnison sur la ville
    placeUnit(s, makeUnit("e0", "guerrier", 1, 7, 7, false)); // ennemi à l'autre bout
    richP0(s, 0); // pas d'étoiles -> ne peut pas recruter
    expect(nextAIAction(s, 0)).toEqual({ type: "END_TURN" }); // elle reste, pas de rush
  });

  it("se développe (récolte) plutôt que d'envoyer sa garnison à l'assaut", () => {
    const s = gridState(9, 2);
    withCity(s, "c0", 0, 1, 1);
    placeUnit(s, makeUnit("u0", "guerrier", 0, 1, 1, false));
    placeUnit(s, makeUnit("e0", "guerrier", 1, 7, 7, false));
    s.tiles[tileIndex(9, 2, 1)]!.resource = "fruits";
    richP0(s, 5);
    expect(nextAIAction(s, 0).type).toBe("HARVEST_RESOURCE");
  });

  it("passe à l'offensive seulement avec une armée excédentaire", () => {
    const s = gridState(9, 2);
    withCity(s, "c0", 0, 1, 1);
    placeUnit(s, makeUnit("u0", "guerrier", 0, 1, 1, false)); // garnison
    placeUnit(s, makeUnit("u1", "guerrier", 0, 1, 2, false)); // surplus
    placeUnit(s, makeUnit("u2", "guerrier", 0, 2, 1, false)); // surplus
    placeUnit(s, makeUnit("e0", "guerrier", 1, 7, 7, false));
    richP0(s, 0); // pas de recrutement, pour observer le déplacement
    const action = nextAIAction(s, 0);
    expect(action.type).toBe("MOVE_UNIT");
    if (action.type === "MOVE_UNIT") {
      const before = Math.max(Math.abs(1 - 7), Math.abs(2 - 7)); // ~5-6
      const after = Math.max(Math.abs(action.to.x - 7), Math.abs(action.to.y - 7));
      expect(after).toBeLessThan(before); // une unité de campagne avance vers l'ennemi
    }
  });
});

describe("IA ne se bloque pas (régression : plafond < seuil offensif)", () => {
  it("monte son armée : sort la garnison pour recruter, ne reste pas figée à 2 unités", () => {
    const s = gridState(9, 2);
    s.cities.push({ id: "c0", ownerId: 0, x: 1, y: 1, level: 1, population: 0, starsPerTurn: 2 });
    s.tiles[tileIndex(9, 1, 1)]!.cityId = "c0";
    s.tiles[tileIndex(9, 1, 1)]!.ownerId = 0;
    placeUnit(s, makeUnit("g", "guerrier", 0, 1, 1, false)); // garnison sur la ville
    placeUnit(s, makeUnit("e", "guerrier", 1, 7, 7, false)); // ennemi lointain
    s.players = s.players.map((p) => (p.id === 0 ? { ...p, stars: 5 } : p));

    // 1) elle libère la ville (déplace la garnison) au lieu de rester bloquée
    const a1 = nextAIAction(s, 0);
    expect(a1.type).toBe("MOVE_UNIT");

    // 2) la ville libérée, elle recrute -> l'armée grandit (pas de turtle)
    const s2 = applyAction(s, a1);
    expect(nextAIAction(s2, 0).type).toBe("TRAIN_UNIT");
  });
});

describe("Villages neutres & expansion (FOUND_CITY)", () => {
  it("generateMap sème des villages sur de la terre libre, espacés des départs", () => {
    const { tiles, starts } = generateMap(123, 16, 16, 2);
    const villages = tiles.filter((t) => t.village);
    expect(villages.length).toBeGreaterThan(0);
    for (const v of villages) {
      expect(isLandTerrain(v.terrain)).toBe(true);
      expect(v.resource).toBeUndefined();
      for (const s of starts) {
        const cheb = Math.max(Math.abs(v.x - s.x), Math.abs(v.y - s.y));
        expect(cheb).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("villages déterministes : même seed => mêmes positions", () => {
    const key = (t: Tile) => `${t.x},${t.y}`;
    const a = generateMap(7, 14, 14, 2).tiles.filter((t) => t.village).map(key);
    const b = generateMap(7, 14, 14, 2).tiles.filter((t) => t.village).map(key);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("FOUND_CITY n'est légal que sur un village, avec une unité du joueur courant", () => {
    const s = gridState(5, 2);
    s.tiles[tileIndex(5, 2, 2)]!.village = true;
    expect(isLegal(s, { type: "FOUND_CITY", unitId: "absent" })).toBe(false);
    activeWarrior(s, "g", 0, 2, 2); // unité du joueur courant sur le village
    expect(isLegal(s, { type: "FOUND_CITY", unitId: "g" })).toBe(true);
    activeWarrior(s, "h", 0, 0, 0); // hors village
    expect(isLegal(s, { type: "FOUND_CITY", unitId: "h" })).toBe(false);
  });

  it("fonder crée une ville niv.1, retire le village, garde la garnison et rapporte du revenu", () => {
    const s = gridState(5, 2);
    s.tiles[tileIndex(5, 2, 2)]!.village = true;
    activeWarrior(s, "g", 0, 2, 2);
    const next = applyAction(s, { type: "FOUND_CITY", unitId: "g" });

    expect(next.cities).toHaveLength(1);
    const city = next.cities[0]!;
    expect(city.ownerId).toBe(0);
    expect(city.level).toBe(1);
    expect(city.starsPerTurn).toBe(computeStarsPerTurn(1));

    const tile = next.tiles[tileIndex(5, 2, 2)]!;
    expect(tile.village).toBeUndefined();
    expect(tile.cityId).toBe(city.id);
    expect(tile.ownerId).toBe(0);
    expect(tile.unitId).toBe("g"); // l'unité reste en garnison
    expect(next.tiles[tileIndex(5, 1, 1)]!.ownerId).toBe(0); // territoire revendiqué
    expect(next.nextCityId).toBe(1);
    expect(getPlayerIncome(next, 0)).toBe(computeStarsPerTurn(1));
  });

  it("la fondation ne vole pas une case déjà possédée par autrui", () => {
    const s = gridState(5, 2);
    s.tiles[tileIndex(5, 1, 1)]!.ownerId = 1; // déjà au joueur 1
    s.tiles[tileIndex(5, 2, 2)]!.village = true;
    activeWarrior(s, "g", 0, 2, 2);
    const next = applyAction(s, { type: "FOUND_CITY", unitId: "g" });
    expect(next.tiles[tileIndex(5, 1, 1)]!.ownerId).toBe(1);
  });

  it("l'IA fonde une ville quand une de ses unités se tient sur un village", () => {
    const s = gridState(7, 2);
    s.tiles[tileIndex(7, 3, 3)]!.village = true;
    activeWarrior(s, "g", 0, 3, 3);
    expect(nextAIAction(s, 0).type).toBe("FOUND_CITY");
  });
});

describe("Récompenses de montée de niveau", () => {
  it("levelUpCity accorde une récompense par niveau gagné et conserve les ateliers", () => {
    const base = { id: "c", ownerId: 0, x: 0, y: 0, population: 0, starsPerTurn: 2 };
    const one = levelUpCity({ ...base, level: 1 }, 2); // 1 niveau gagné
    expect(one.level).toBe(2);
    expect(one.rewardsToPick).toBe(1);

    const two = levelUpCity({ ...base, level: 1 }, 5); // 2 niveaux gagnés (2 puis 3)
    expect(two.level).toBe(3);
    expect(two.rewardsToPick).toBe(2);

    // Les ateliers existants restent dans la production après une montée de niveau.
    const withWorkshops = levelUpCity({ ...base, level: 1, workshops: 2 }, 2);
    expect(withWorkshops.starsPerTurn).toBe(cityStarsPerTurn(2, 2));
  });

  function rewardCity(reward: number): GameState {
    const s = freeCityState(0);
    s.cities[0]!.rewardsToPick = reward;
    return s;
  }

  it("atelier : +1 atelier, +1★/tour permanent, et consomme un choix", () => {
    const s = rewardCity(1);
    const next = applyAction(s, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "atelier" });
    const city = next.cities[0]!;
    expect(city.workshops).toBe(1);
    expect(city.starsPerTurn).toBe(cityStarsPerTurn(city.level, 1));
    expect(city.rewardsToPick).toBe(0);
  });

  it("trésor : +5★ au propriétaire", () => {
    const s = rewardCity(1);
    const before = s.players[0]!.stars;
    const next = applyAction(s, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "tresor" });
    expect(next.players[0]!.stars).toBe(before + TREASURE_STARS);
  });

  it("troupe : un guerrier gratuit apparaît sur la ville libre", () => {
    const s = rewardCity(1);
    const next = applyAction(s, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "troupe" });
    expect(next.units).toHaveLength(1);
    expect(next.units[0]!.x).toBe(2);
    expect(next.units[0]!.y).toBe(2);
    expect(next.nextUnitId).toBe(s.nextUnitId + 1);
    expect(next.tiles[tileIndex(5, 2, 2)]!.unitId).toBe(next.units[0]!.id);
  });

  it("troupe : si la ville est occupée, la nouvelle unité apparaît à côté", () => {
    const s = rewardCity(1);
    activeWarrior(s, "garn", 0, 2, 2); // garnison occupe la ville
    const next = applyAction(s, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "troupe" });
    expect(next.units).toHaveLength(2);
    const fresh = next.units.find((u) => u.id !== "garn")!;
    expect(Math.max(Math.abs(fresh.x - 2), Math.abs(fresh.y - 2))).toBe(1);
  });

  it("muraille : pose une muraille qui renforce la défense de la ville", () => {
    const s = rewardCity(1);
    activeWarrior(s, "def", 0, 2, 2);
    const defender = s.units[0]!;
    expect(getDefenseBonus(s, defender)).toBe(DEFENSE_BONUS_CITY);
    const next = applyAction(s, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "muraille" });
    expect(next.cities[0]!.hasWall).toBe(true);
    expect(getDefenseBonus(next, next.units[0]!)).toBe(DEFENSE_BONUS_WALL);
  });

  it("illégal sans choix en attente, pour un non-propriétaire, ou troupe sans place", () => {
    expect(
      isLegal(rewardCity(0), { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "atelier" }),
    ).toBe(false);

    const notMine = rewardCity(1);
    notMine.cities[0]!.ownerId = 1;
    expect(
      isLegal(notMine, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "atelier" }),
    ).toBe(false);

    // Ville + tout le voisinage occupés -> "troupe" sans case d'apparition.
    const packed = rewardCity(1);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        activeWarrior(packed, `p${n++}`, 0, 2 + dx, 2 + dy);
      }
    }
    expect(
      isLegal(packed, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "troupe" }),
    ).toBe(false);
    // ...mais l'atelier reste encaissable.
    expect(
      isLegal(packed, { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "atelier" }),
    ).toBe(true);
  });

  it("récolter une ressource qui fait monter la ville accorde une récompense", () => {
    const s = freeCityState(10);
    s.cities[0]!.level = 1;
    s.cities[0]!.population = 0;
    // fruits adjacents : pop +1 par récolte, seuil niveau1->2 = 2 pop.
    s.tiles[tileIndex(5, 2, 1)]!.resource = "fruits";
    s.tiles[tileIndex(5, 3, 2)]!.resource = "fruits";
    const a = applyAction(s, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 2, y: 1 } });
    const b = applyAction(a, { type: "HARVEST_RESOURCE", cityId: "c0", at: { x: 3, y: 2 } });
    expect(b.cities[0]!.level).toBe(2);
    expect(b.cities[0]!.rewardsToPick).toBe(1);
  });

  it("l'IA encaisse une récompense de niveau en attente", () => {
    const s = freeCityState(0);
    s.cities[0]!.rewardsToPick = 1;
    const action = nextAIAction(s, 0);
    expect(action.type).toBe("CLAIM_CITY_REWARD");
  });
});

describe("Territoire d'exploitation (agrandissement auto puis au choix)", () => {
  it("les 2 premières montées de niveau agrandissent le territoire, puis ça plafonne (auto)", () => {
    const base = { id: "c", ownerId: 0, x: 0, y: 0, population: 0, starsPerTurn: 2, level: 1 };
    const lvl2 = levelUpCity(base, 2); // 1re montée
    expect(lvl2.level).toBe(2);
    expect(lvl2.harvestRadius).toBe(2);
    const lvl3 = levelUpCity(lvl2, 3); // 2e montée
    expect(lvl3.level).toBe(3);
    expect(lvl3.harvestRadius).toBe(3);
    const lvl4 = levelUpCity(lvl3, 4); // 3e montée : plus d'agrandissement auto
    expect(lvl4.level).toBe(4);
    expect(lvl4.harvestRadius).toBe(3);
  });

  it("la récolte respecte le rayon propre à la ville", () => {
    const s = freeCityState(10);
    s.tiles[tileIndex(5, 2, 4)]!.resource = "fruits"; // distance 2 de la ville (2,2)
    const at = { x: 2, y: 4 };
    expect(isLegal(s, { type: "HARVEST_RESOURCE", cityId: "c0", at })).toBe(false); // rayon 1
    s.cities[0]!.harvestRadius = 2;
    expect(isLegal(s, { type: "HARVEST_RESOURCE", cityId: "c0", at })).toBe(true); // rayon 2
  });

  it("la récompense « agrandir » n'est dispo qu'après l'auto, et plafonne", () => {
    const s = freeCityState(0);
    s.cities[0]!.rewardsToPick = 1;
    const claim = { type: "CLAIM_CITY_REWARD", cityId: "c0", reward: "agrandir" } as const;

    s.cities[0]!.harvestRadius = 1; // encore en phase auto
    expect(isLegal(s, claim)).toBe(false);

    s.cities[0]!.harvestRadius = 3; // auto terminé -> agrandissement au choix
    expect(isLegal(s, claim)).toBe(true);
    const next = applyAction(s, claim);
    expect(next.cities[0]!.harvestRadius).toBe(4);

    next.cities[0]!.rewardsToPick = 1;
    expect(isLegal(next, claim)).toBe(false); // plafond (MAX_HARVEST_RADIUS) atteint
  });
});
