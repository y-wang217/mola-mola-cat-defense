/**
 * The single hardcoded M0 board.
 *
 * 9 wide by 12 tall, portrait, square cells. The playtest called the old
 * 9x16 board unreadable on a phone: the cells were the same shape, but there
 * were 144 of them and the board was letterboxed by its height, so a tile came
 * out around 37 CSS px and the tower glyph inside it around 26. At 12 rows the
 * board is width-bound instead, the tile lands near 42px and the glyph clears
 * the 28px floor.
 *
 * Deliberately tight: 5 lane tiles and 14 platforms, unchanged in count from
 * the 9x16 board. A sprawling board makes random placement feel weightless —
 * when almost every tile is free, where the summon lands stops mattering. Small
 * boards make each summon a real event and make selling a real decision.
 *
 * The five lane tiles are spread along the run so blockers stagger rather than
 * stacking into one chokepoint.
 */

import { buildPath, pathDistanceAt, tileCentre } from "./pathing.js";
import type { GridPos, LevelDef, Terrain, Tile } from "./types.js";

const WIDTH = 9;
const HEIGHT = 12;

/**
 * Enters off the top, exits off the bottom. Axis-aligned so lengths are exact.
 *
 * Re-authored for the smaller grid and kept in character: still a serpentine,
 * still six turns, still entering at column 1 and leaving at column 7. It is 31
 * tiles long against the old 35 — the shortest the character survives at this
 * height — so enemies reach the end about 11% sooner at the same speed.
 */
const PATH: GridPos[] = [
  { x: 1, y: -1 },
  { x: 1, y: 2 },
  { x: 7, y: 2 },
  { x: 7, y: 5 },
  { x: 1, y: 5 },
  { x: 1, y: 8 },
  { x: 7, y: 8 },
  { x: 7, y: 12 },
];

/** Melee-eligible lane tiles, spread along the run. */
const MELEE_TILES: GridPos[] = [
  { x: 1, y: 1 },
  { x: 4, y: 2 },
  { x: 7, y: 4 },
  { x: 4, y: 5 },
  { x: 4, y: 8 },
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
  { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 },   // cover (1,1) and (4,2)
  { x: 4, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 4 },   // cover (4,2) and (7,4)
  { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 6 },   // cover (4,5)
  { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 },   // cover (4,8)
  { x: 6, y: 9 }, { x: 6, y: 10 },                  // cover the final descent
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
    // 1 — runners, heavily softened. A player who summons NOTHING must survive
    // this, so the count is small enough that even a completely empty board
    // leaks only a fraction of the life pool.
    //
    // Counts ARE cut here, against the usual "keep the mana faucet flowing"
    // instinct, and that is safe only because killManaShare sits at 0.3: the
    // 6/s tick floor plus the starting grant funds the first several summons
    // without needing a single kill. If the dial ever moves toward 1.0 these
    // counts must come back up or the opening starves.
    {
      prepTicks: 300,
      scaling: { hpPct: 55, speedPct: 78, damagePct: 50 },
      spawns: [{ kind: "runner", count: 4, startTick: 30, intervalTicks: 34 }],
    },
    // 2 — swarm, still gentle. Two summons must clear this comfortably WHATEVER
    // the roster drew — including the ~36% case where both draws are support
    // towers that deal no damage at all. Sized so that board still survives.
    {
      prepTicks: 240,
      scaling: { hpPct: 70, speedPct: 88, damagePct: 60 },
      spawns: [
        { kind: "swarm", count: 7, startTick: 30, intervalTicks: 18 },
        { kind: "runner", count: 2, startTick: 260, intervalTicks: 28 },
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
