/**
 * The data contracts from CLAUDE.md §6. Changes here are migrations — the
 * replay log and any stored run are shaped by these types.
 */

import type { RngState } from "./rng.js";

export type TowerKind = "arrow" | "cannon";
export type EnemyKind = "runner" | "swarm" | "brute";

/** A position in whole grid tiles. */
export type GridPos = { x: number; y: number };

export type Terrain = {
  /** Board size in tiles. */
  width: number;
  height: number;
  /** Ordered waypoints. Segments are axis-aligned so their lengths are exact. */
  path: GridPos[];
  /** Tiles a tower may be placed on. Index into this array is the slot id. */
  slots: GridPos[];
};

/** One group of identical enemies released on a schedule within a wave. */
export type SpawnDef = {
  kind: EnemyKind;
  count: number;
  /** Ticks after the wave starts before the first of the group appears. */
  startTick: number;
  /** Ticks between each member of the group. */
  intervalTicks: number;
};

export type WaveDef = {
  spawns: SpawnDef[];
  /** Gold paid out when the wave is cleared. */
  reward: number;
};

export type LevelDef = {
  /** "2026-08-19" once levels are daily. M0 uses a static id. */
  id: string;
  /** Drives all in-run randomness. */
  seed: number;
  terrain: Terrain;
  /** Fully authored, never random. */
  waves: WaveDef[];
  /** Risk contracts available for this day. Empty until M5. */
  modifiers: string[];
};

/**
 * A player action, stamped with the tick it was issued on. Ordering is
 * everything: the input log replayed in order is the run.
 */
export type Input =
  | { tick: number; kind: "place"; payload: { slotIndex: number; tower: TowerKind } }
  | { tick: number; kind: "upgrade"; payload: { towerId: number } }
  | { tick: number; kind: "sell"; payload: { towerId: number } }
  | { tick: number; kind: "ability"; payload: { abilityId: string } }
  | { tick: number; kind: "start_wave"; payload: Record<string, never> };

export type Enemy = {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** Distance travelled along the path, fixed-point. */
  dist: number;
  /** Cached world position, derived from `dist`. */
  x: number;
  y: number;
  alive: boolean;
};

export type Tower = {
  id: number;
  kind: TowerKind;
  slotIndex: number;
  x: number;
  y: number;
  /** 1-based. Upgrades raise damage and range, never fire rate. */
  level: number;
  /** Ticks until it may fire again. */
  cooldown: number;
  /** Total gold sunk in, for the sell refund. */
  invested: number;
};

export type Projectile = {
  id: number;
  x: number;
  y: number;
  /** Impact point. Tracks the target while it lives, then freezes. */
  tx: number;
  ty: number;
  targetId: number;
  damage: number;
  speed: number;
  /** 0 for single-target. */
  splash: number;
  kind: TowerKind;
  alive: boolean;
};

export type RunStatus = "building" | "wave" | "won" | "lost";

export type GameState = {
  /** The clock. There is no other one — see CLAUDE.md §3. */
  tick: number;
  rng: RngState;
  level: LevelDef;
  status: RunStatus;
  gold: number;
  lives: number;
  /** Index of the wave being fought, or the next one to start. */
  waveIndex: number;
  /** Ticks since the current wave started. */
  waveTick: number;
  /** How many of each spawn group in the current wave have been released. */
  spawnCursors: number[];
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  nextId: number;
  score: number;
  kills: number;
  leaks: number;
};

/** What the client submits and the server re-simulates. See CLAUDE.md §6. */
export type RunSubmission = {
  levelId: string;
  risk: string[];
  inputs: Input[];
  claimedScore: number;
};
