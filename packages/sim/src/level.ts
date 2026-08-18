/**
 * The single hardcoded M0 board.
 *
 * Deliberately tight: 5 lane tiles and 14 platforms. A sprawling board makes
 * random placement feel weightless — when almost every tile is free, where the
 * summon lands stops mattering. Small boards make each summon a real event and
 * make selling a real decision.
 *
 * The five lane tiles are spread along the run so blockers stagger rather than
 * stacking into one chokepoint.
 */

import { buildPath, pathDistanceAt, tileCentre } from "./pathing.js";
import type { GridPos, LevelDef, Terrain, Tile } from "./types.js";

const WIDTH = 9;
const HEIGHT = 16;

// Enters off the top, exits off the bottom. Axis-aligned so lengths are exact.
const PATH: GridPos[] = [
  { x: 1, y: -1 },
  { x: 1, y: 3 },
  { x: 7, y: 3 },
  { x: 7, y: 7 },
  { x: 1, y: 7 },
  { x: 1, y: 11 },
  { x: 7, y: 11 },
  { x: 7, y: 16 },
];

/** Melee-eligible lane tiles, spread along the run. */
const MELEE_TILES: GridPos[] = [
  { x: 1, y: 2 },
  { x: 4, y: 3 },
  { x: 7, y: 5 },
  { x: 4, y: 7 },
  { x: 4, y: 11 },
];

/**
 * Platform tiles, deliberately CLUSTERED around the five lane tiles.
 *
 * This is the load-bearing part of the board. A blocker's whole job is to hold
 * enemies inside somebody's range; if the lane tiles sit outside platform
 * coverage then blocking parks the enemy in a dead zone and melee becomes a
 * liability rather than a family. Every lane tile below has at least two
 * platforms within roughly two tiles of it.
 */
const PLATFORM_TILES: GridPos[] = [
  { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 2 },   // cover (1,2) and (4,3)
  { x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 },   // cover (4,3) and (7,5)
  { x: 4, y: 6 }, { x: 4, y: 8 }, { x: 3, y: 9 },   // cover (4,7)
  { x: 5, y: 9 }, { x: 4, y: 10 }, { x: 4, y: 12 }, // cover (4,11)
  { x: 0, y: 5 }, { x: 0, y: 9 },                   // flanks
];

function buildTerrain(): Terrain {
  const geometry = buildPath({ width: WIDTH, height: HEIGHT, path: PATH, tiles: [] });

  const tiles: Tile[] = [];
  for (const pos of MELEE_TILES) {
    const dist = pathDistanceAt(geometry, tileCentre(pos));
    if (dist < 0) throw new Error(`melee tile ${pos.x},${pos.y} is not on the lane`);
    tiles.push({ pos, class: "path", pathDist: dist });
  }
  for (const pos of PLATFORM_TILES) {
    tiles.push({ pos, class: "platform", pathDist: 0 });
  }

  return { width: WIDTH, height: HEIGHT, path: PATH, tiles };
}

/**
 * Six waves, roughly three and a half to four minutes.
 *
 * Each wave leans on one archetype so a missing family shows up as a specific,
 * comprehensible failure rather than a slow bleed. Wave 6 carries the boss,
 * which no single family can beat.
 */
export const M0_LEVEL: LevelDef = {
  id: "m0-rework",
  seed: 20260818,
  terrain: buildTerrain(),
  waves: [
    // 1 — runners. Teaches that range alone does not stop something this fast.
    {
      prepTicks: 300,
      spawns: [{ kind: "runner", count: 7, startTick: 20, intervalTicks: 26 }],
    },
    // 2 — swarm. Drowns single-target, drains blocker HP.
    {
      prepTicks: 240,
      spawns: [
        { kind: "swarm", count: 13, startTick: 20, intervalTicks: 14 },
        { kind: "runner", count: 4, startTick: 260, intervalTicks: 24 },
      ],
    },
    // 3 — armoured. Fast-and-weak towers hit the 1-damage floor here.
    {
      prepTicks: 240,
      spawns: [
        { kind: "armoured", count: 6, startTick: 20, intervalTicks: 42 },
        { kind: "swarm", count: 10, startTick: 120, intervalTicks: 15 },
      ],
    },
    // 4 — fliers. Blockers are irrelevant; projectile or you leak.
    {
      prepTicks: 240,
      spawns: [
        { kind: "flier", count: 8, startTick: 20, intervalTicks: 28 },
        { kind: "runner", count: 7, startTick: 190, intervalTicks: 20 },
      ],
    },
    // 5 — brutes. A lone tier-1 blocker dies; needs vulnerable plus sustain.
    {
      prepTicks: 270,
      spawns: [
        { kind: "brute", count: 3, startTick: 20, intervalTicks: 90 },
        { kind: "armoured", count: 5, startTick: 60, intervalTicks: 46 },
        { kind: "flier", count: 6, startTick: 150, intervalTicks: 30 },
        { kind: "runner", count: 6, startTick: 240, intervalTicks: 20 },
      ],
    },
    // 6 — boss, escorted. Two families minimum.
    {
      prepTicks: 300,
      spawns: [
        { kind: "boss", count: 1, startTick: 20, intervalTicks: 1 },
        { kind: "swarm", count: 15, startTick: 60, intervalTicks: 13 },
        { kind: "flier", count: 8, startTick: 180, intervalTicks: 22 },
        { kind: "armoured", count: 5, startTick: 260, intervalTicks: 36 },
      ],
    },
  ],
  modifiers: [],
};
