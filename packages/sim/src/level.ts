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
 * Ten waves, run back to back with no break between them.
 *
 * Six waves plus breaks used to take about four minutes of wall clock. Removing
 * the breaks and doubling the timescale would have collapsed the same content
 * into well under a minute, which is not a run — so the level is longer in
 * content and shorter in wall clock. Measured numbers are in the commit message.
 *
 * Each wave leans on one archetype so a missing family shows up as a specific,
 * comprehensible failure rather than a slow bleed. Waves 1-3 are the safety
 * band; the boss lands on wave 10 and no single family can beat it.
 *
 * Authoring rules for the continuous handover, learned by measuring it:
 *   - a wave's span is its own spawn schedule, since the next one starts the
 *     tick this one finishes. Total run length is the sum of the spans plus the
 *     walk time of the last stragglers.
 *   - the first group of a wave starts 20-60 ticks in, which is the only
 *     breathing room in the handover. Keep it: at zero the two waves' fronts
 *     arrive on the same tick and read as one mass.
 *   - spread groups across a wave rather than stacking them at tick 20. An
 *     archetype arriving on its own is legible; four at once is noise.
 */
export const M0_LEVEL: LevelDef = {
  id: "m0-rework",
  seed: 20260818,
  terrain: buildTerrain(),
  waves: [
    // 1 — runners, heavily softened. THE SAFETY BAND STARTS HERE. With five
    // lives instead of eighteen a leak is no longer absorbable, so waves 1-3
    // are cut in count and in HP until a player making reasonable summons does
    // not leak at all. This is early safety bought with wave content, not with
    // a bigger life pool — more lives is what made leaks meaningless.
    {
      scaling: { hpPct: 55, speedPct: 78, damagePct: 50 },
      spawns: [{ kind: "runner", count: 5, startTick: 90, intervalTicks: 105 }],
    },
    // 2 — swarm, still gentle. Two summons must clear this WHATEVER the roster
    // drew, including the case where both draws are support towers that deal no
    // damage at all.
    {
      scaling: { hpPct: 60, speedPct: 85, damagePct: 60 },
      spawns: [
        { kind: "swarm", count: 10, startTick: 30, intervalTicks: 45 },
        { kind: "runner", count: 3, startTick: 400, intervalTicks: 60 },
      ],
    },
    // 3 — volume, with a TASTE of armour rather than a wall of it. Armour is
    // a flat reduction, so a wave's hpPct cannot soften it: two armoured here
    // teach the lesson, and wave 5 is where it is charged for. The safety band
    // ends with this wave.
    {
      scaling: { hpPct: 85, speedPct: 95, damagePct: 80 },
      spawns: [
        { kind: "swarm", count: 10, startTick: 30, intervalTicks: 45 },
        { kind: "armoured", count: 2, startTick: 120, intervalTicks: 140 },
        { kind: "runner", count: 4, startTick: 250, intervalTicks: 70 },
      ],
    },
    // 4 — full strength, and fliers. Blockers are irrelevant; projectile or you
    // leak. From here a bad board is punished.
    {
      spawns: [
        { kind: "flier", count: 7, startTick: 20, intervalTicks: 60 },
        { kind: "runner", count: 4, startTick: 300, intervalTicks: 50 },
      ],
    },
    // 5 — armour proper, at full strength, with volume behind it. Fast-and-weak
    // towers hit the 1-damage floor; shred it, poison it, or hit it heavy.
    {
      spawns: [
        { kind: "armoured", count: 5, startTick: 20, intervalTicks: 100 },
        { kind: "swarm", count: 10, startTick: 140, intervalTicks: 40 },
        { kind: "runner", count: 3, startTick: 440, intervalTicks: 55 },
      ],
    },
    // 6 — brutes. A lone tier-1 blocker dies; needs vulnerable plus sustain.
    {
      spawns: [
        { kind: "brute", count: 2, startTick: 20, intervalTicks: 290 },
        { kind: "armoured", count: 2, startTick: 90, intervalTicks: 140 },
        { kind: "flier", count: 4, startTick: 220, intervalTicks: 85 },
        { kind: "runner", count: 3, startTick: 420, intervalTicks: 55 },
      ],
    },
    // 7 — air and speed. Punishes a board that answered wave 6 with blockers.
    {
      spawns: [
        { kind: "flier", count: 9, startTick: 20, intervalTicks: 65 },
        { kind: "runner", count: 7, startTick: 170, intervalTicks: 55 },
        { kind: "swarm", count: 9, startTick: 340, intervalTicks: 38 },
      ],
    },
    // 8 — everything at once, at full strength. This is where a board that has
    // been coasting on one family should come apart.
    {
      spawns: [
        { kind: "brute", count: 2, startTick: 20, intervalTicks: 270 },
        { kind: "armoured", count: 4, startTick: 70, intervalTicks: 115 },
        { kind: "flier", count: 5, startTick: 220, intervalTicks: 70 },
        { kind: "swarm", count: 8, startTick: 390, intervalTicks: 38 },
      ],
    },
    // 9 — the pre-boss squeeze. Three brutes plus volume.
    {
      spawns: [
        { kind: "brute", count: 2, startTick: 20, intervalTicks: 250 },
        { kind: "flier", count: 7, startTick: 110, intervalTicks: 65 },
        { kind: "runner", count: 6, startTick: 230, intervalTicks: 55 },
        { kind: "swarm", count: 8, startTick: 340, intervalTicks: 42 },
      ],
    },
    // 10 — boss, escorted, and it arrives while wave 9's tail is still walking.
    // Two families minimum.
    {
      spawns: [
        { kind: "brute", count: 2, startTick: 20, intervalTicks: 250 },
        { kind: "boss", count: 1, startTick: 60, intervalTicks: 1 },
        { kind: "armoured", count: 2, startTick: 120, intervalTicks: 100 },
        { kind: "flier", count: 5, startTick: 180, intervalTicks: 70 },
        { kind: "swarm", count: 8, startTick: 250, intervalTicks: 36 },
        { kind: "runner", count: 4, startTick: 450, intervalTicks: 45 },
      ],
    },
  ],
  modifiers: [],
};
