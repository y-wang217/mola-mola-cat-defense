/**
 * Data contracts. CLAUDE.md §6: changes here are migrations — the replay log
 * and any stored run are shaped by these types.
 *
 * M0-rework changes from the original M0 contract:
 *   - Terrain.slots -> Terrain.tiles, with a path/platform class per tile.
 *   - Input loses place/upgrade/start_wave, gains summon/merge.
 *   - GameState.gold -> mana, plus the escalating summon cost.
 *   - RunSubmission gains the roster, since it is chosen before the run and a
 *     replay cannot be reproduced without it.
 */

import type { RngState } from "./rng.js";
import type { StatusEffect } from "./status.js";
import type { EnemyKind } from "./enemies.js";

/** Identifies a row in TOWER_POOL. Kept as a string so data drives everything. */
export type TowerId = string;

export type TowerFamily = "projectile" | "melee" | "status";

/**
 * Path tiles are on the lane and only melee may stand there. Platform tiles are
 * beside it and take projectile and status towers.
 */
export type TileClass = "path" | "platform";

export type GridPos = { x: number; y: number };

export type Tile = {
  pos: GridPos;
  class: TileClass;
  /**
   * Distance along the lane at this tile's centre, fixed-point. Only meaningful
   * for path tiles — it is what turns blocking into a 1-D comparison against
   * `enemy.dist`. Zero for platform tiles.
   */
  pathDist: number;
};

export type Terrain = {
  width: number;
  height: number;
  /** Ordered lane waypoints. Segments are axis-aligned so lengths are exact. */
  path: GridPos[];
  /** One index space for both classes; legality is a filter, not a union. */
  tiles: Tile[];
};

export type SpawnDef = {
  kind: EnemyKind;
  count: number;
  startTick: number;
  intervalTicks: number;
};

export type WaveDef = {
  spawns: SpawnDef[];
  /** Ticks of breathing room before this wave auto-starts. */
  prepTicks: number;
};

export type LevelDef = {
  id: string;
  seed: number;
  terrain: Terrain;
  waves: WaveDef[];
  modifiers: string[];
};

/**
 * A player action stamped with the tick it was issued on. Ordering is the
 * replay. Note there is no `place`: the player cannot choose a tile, which is
 * the entire point of the rework.
 */
export type Input =
  | { tick: number; kind: "summon"; payload: Record<string, never> }
  | { tick: number; kind: "merge"; payload: { sourceId: number; targetId: number } }
  | { tick: number; kind: "sell"; payload: { towerId: number } }
  | { tick: number; kind: "ability"; payload: { abilityId: string } };

export type Enemy = {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** Distance travelled along the lane, fixed-point. */
  dist: number;
  x: number;
  y: number;
  /** Tower id this enemy is stopped and fighting, or 0 when walking. */
  blockedBy: number;
  /** Ticks until it may hit its blocker again. */
  attackCooldown: number;
  statuses: StatusEffect[];
  alive: boolean;
};

export type Tower = {
  id: number;
  towerId: TowerId;
  tileIndex: number;
  x: number;
  y: number;
  /** 1-based. Merging raises it. */
  tier: number;
  cooldown: number;
  /** Melee only: current and max hit points. Zero for other families. */
  hp: number;
  maxHp: number;
  /** Enemy ids currently held by this tower. Melee only. */
  blocking: number[];
  /** Cumulative mana sunk in, for the sell refund. */
  invested: number;
  /**
   * Nearest distance along the lane to this tower. For path tiles it is the
   * tile's own pathDist; for platforms it is the projection. Lane-shaped range
   * and "first along the lane" targeting both read it.
   */
  laneDist: number;
};

export type Projectile = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetId: number;
  damage: number;
  speed: number;
  splash: number;
  /**
   * Pierce and chain are the same mechanic with a different next-target rule,
   * so they share one field pair. "lane" continues to the next enemy further
   * along the lane; "nearest" jumps to the closest untouched one.
   */
  hopsLeft: number;
  hopMode: "none" | "lane" | "nearest";
  /** Enemies already hit by this shot, so a hop never double-dips. */
  hitIds: number[];
  ownerTowerId: TowerId;
  alive: boolean;
};

export type RunStatus = "prep" | "wave" | "won" | "lost";

/** Surfaced to the UI for one tick. Never drives sim logic. */
export type SimEvent =
  | { kind: "no_room"; towerId: TowerId }
  | { kind: "summoned"; towerId: TowerId; tileIndex: number }
  | { kind: "merged"; towerId: TowerId; tier: number }
  | { kind: "blocker_died"; tileIndex: number };

export type GameState = {
  /** The clock. There is no other one — CLAUDE.md §3. */
  tick: number;
  rng: RngState;
  level: LevelDef;
  /** The 5 distinct towers chosen before the run. Draw pool for every roll. */
  roster: TowerId[];
  status: RunStatus;
  mana: number;
  /** What the next summon costs. Escalates per summon and never resets. */
  summonCost: number;
  summonsUsed: number;
  lives: number;
  waveIndex: number;
  waveTick: number;
  /** Ticks until the next wave auto-starts. Only meaningful in "prep". */
  prepRemaining: number;
  spawnCursors: number[];
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  /** Cleared at the start of every tick; the UI reads it after. */
  events: SimEvent[];
  nextId: number;
  score: number;
  kills: number;
  leaks: number;
};

/** What the client submits and the server re-simulates. CLAUDE.md §6. */
export type RunSubmission = {
  levelId: string;
  roster: TowerId[];
  risk: string[];
  inputs: Input[];
  claimedScore: number;
};
