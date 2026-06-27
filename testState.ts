import { createInitialState } from "@polytopia/engine";

const state = createInitialState({
  seed: 12345,
  width: 12,
  height: 12,
  turnLimit: 30,
  turnDurationMs: null,
  pacingMode: "custom",
  techCostMultiplier: 1.0,
  customStartGold: 15,
  mapType: "terres",
  playerInfos: [
    { name: "P1", color: "red", isAI: false },
    { name: "P2", color: "blue", isAI: false },
  ]
});

console.log("Pacing Mode:", state.pacingMode);
console.log("Player 0 stars:", state.players[0].stars);
console.log("Player 1 stars:", state.players[1].stars);
console.log("Player 2 stars:", state.players[2].stars); // Barbarians
console.log("City count:", state.cities.length);
