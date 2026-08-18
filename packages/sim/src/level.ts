/**
 * The single hardcoded M0 board. CLAUDE.md §9: M0 is one map, local only —
 * the generator and vetted daily JSON are M2 and live in packages/levels.
 *
 * Portrait 9x16 for a phone. The path serpentines so a tower placed in the
 * middle columns can cover two lanes, which is the placement decision the
 * board is built around.
 */

import type { LevelDef } from "./types.js";

export const M0_LEVEL: LevelDef = {
  id: "m0-static",
  seed: 20260818,
  terrain: {
    width: 9,
    height: 16,
    // Axis-aligned waypoints. Enters off the top, exits off the bottom.
    path: [
      { x: 1, y: -1 },
      { x: 1, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 1, y: 7 },
      { x: 1, y: 11 },
      { x: 7, y: 11 },
      { x: 7, y: 16 },
    ],
    // The four middle-column slots each cover two lanes; the edge slots cover
    // one. That asymmetry is the whole placement puzzle in M0.
    slots: [
      { x: 3, y: 1 },
      { x: 5, y: 1 },
      { x: 6, y: 1 },
      { x: 0, y: 5 },
      { x: 3, y: 5 },
      { x: 5, y: 5 },
      { x: 0, y: 9 },
      { x: 3, y: 9 },
      { x: 5, y: 9 },
      { x: 0, y: 13 },
      { x: 3, y: 13 },
      { x: 5, y: 13 },
    ],
  },
  // Authored, never random (§6). Roughly four minutes end to end.
  waves: [
    // 1 — swarm alone: learn to place and that one tower is not enough.
    { spawns: [{ kind: "swarm", count: 8, startTick: 30, intervalTicks: 24 }], reward: 20 },
    // 2 — runners: fire rate starts to matter.
    { spawns: [{ kind: "runner", count: 6, startTick: 30, intervalTicks: 30 }], reward: 22 },
    // 3 — mixed, still forgiving.
    {
      spawns: [
        { kind: "swarm", count: 12, startTick: 30, intervalTicks: 18 },
        { kind: "runner", count: 3, startTick: 240, intervalTicks: 30 },
      ],
      reward: 25,
    },
    // 4 — first brute. Arrow towers alone will not chew through armour.
    {
      spawns: [
        { kind: "brute", count: 1, startTick: 30, intervalTicks: 1 },
        { kind: "swarm", count: 8, startTick: 60, intervalTicks: 20 },
      ],
      reward: 30,
    },
    // 5 — runner pressure: punishes going all-cannon after wave 4.
    { spawns: [{ kind: "runner", count: 10, startTick: 30, intervalTicks: 20 }], reward: 32 },
    {
      spawns: [
        { kind: "brute", count: 3, startTick: 30, intervalTicks: 70 },
        { kind: "swarm", count: 16, startTick: 60, intervalTicks: 14 },
      ],
      reward: 38,
    },
    {
      spawns: [
        { kind: "runner", count: 16, startTick: 30, intervalTicks: 14 },
        { kind: "swarm", count: 10, startTick: 150, intervalTicks: 12 },
      ],
      reward: 45,
    },
    // 8 — everything at once.
    {
      spawns: [
        { kind: "brute", count: 5, startTick: 30, intervalTicks: 60 },
        { kind: "swarm", count: 20, startTick: 60, intervalTicks: 11 },
        { kind: "runner", count: 12, startTick: 300, intervalTicks: 15 },
      ],
      reward: 60,
    },
  ],
  modifiers: [],
};
