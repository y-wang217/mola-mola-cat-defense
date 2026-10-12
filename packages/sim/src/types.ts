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

/**
 * Per-wave stat scaling, as integer percentages of the enemy's base spec.
 * Enemy stats are per-kind, so this is the only way to soften the opening
 * waves without weakening the same archetypes later in the run.
 */
export type WaveScaling = {
  hpPct: number;
  speedPct: number;
  /** Damage dealt to blocking towers. */
  damagePct: number;
};

export type WaveDef = {
  spawns: SpawnDef[];
  /** Omitted means 100% across the board. */
  scaling?: WaveScaling;
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
  /**
   * Raise one tower family's upgrade level by one. `towerId` is the FAMILY —
   * a row in TOWER_POOL, e.g. "arrow" — not an instance id, which is what the
   * sell and merge payloads carry.
   *
   * Handled in the same input phase and the same deterministic order as every
   * other input. It adds no tick phase.
   */
  | { tick: number; kind: "family_upgrade"; payload: { towerId: TowerId } }
  | { tick: number; kind: "ability"; payload: { abilityId: string } };

export type Enemy = {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /**
   * Resolved at spawn from the kind's spec times the wave's scaling, so a
   * softened opening wave does not weaken the archetype anywhere else.
   */
  speed: number;
  blockDamage: number;
  /** Mana paid to the player when this enemy dies. See economy.ts. */
  bounty: number;
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

/**
 * There is no "prep". The break phase between waves was deleted rather than
 * shortened in the tempo patch — a zero-length phase that still exists is a
 * source of off-by-one bugs in the wave counter and in replay. Wave N+1 begins
 * spawning the tick wave N finishes spawning, so a run is only ever running,
 * won or lost.
 */
export type RunStatus = "wave" | "won" | "lost";

/** Surfaced to the UI for one tick. Never drives sim logic. */
export type SimEvent =
  | { kind: "no_room"; towerId: TowerId }
  | { kind: "bounty"; amount: number; x: number; y: number; enemy: EnemyKind }
  | { kind: "summoned"; towerId: TowerId; tileIndex: number }
  | { kind: "merged"; towerId: TowerId; tier: number }
  /** A family upgrade landed. The render layer pulses every tower it affects,
   *  which is the only way the board-wide reach of it is visible. */
  | { kind: "family_upgraded"; towerId: TowerId; level: number }
  /** A new wave started spawning. With no break to mark the boundary, this is
   *  what the render layer hangs the wave-change cue on. */
  | { kind: "wave_start"; wave: number }
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
  /**
   * Lifetime income by source. Not used by any rule — they exist so the split
   * between the tick floor and kill bounties is measurable rather than
   * inferred, which is the whole question the income model has to answer.
   */
  manaFromTick: number;
  manaFromKills: number;
  /** What the next summon costs. Escalates per summon and never resets. */
  summonCost: number;
  summonsUsed: number;
  /**
   * Upgrade level per tower FAMILY, keyed by TowerId — one entry per roster
   * slot, built in roster order and never re-keyed, so serialization order is
   * fixed and the hash is stable (CLAUDE.md §3 on iteration order).
   *
   * IN-RUN ONLY. Initialised to zero at the start of every run and never read
   * from or written to anything outside the run.
   */
  familyUpgradeLevels: Record<TowerId, number>;
  lives: number;
  /**
   * Which wave is currently SPAWNING. It reaches level.waves.length once
   * everything has been sent, while enemies from earlier waves may still be
   * walking — the run is not over until the board is clear.
   */
  waveIndex: number;
  waveTick: number;
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
