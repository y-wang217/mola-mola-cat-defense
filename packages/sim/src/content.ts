/**
 * Tuning values for M0.
 *
 * CLAUDE.md §10: design enemies first — enemy variety is what forces tower
 * diversity. The three enemies below each punish a different failure:
 *
 *   runner — fast, fragile. Outruns the cannon's slow cycle and slow shell.
 *            Wants the arrow tower's fire rate.
 *   swarm  — many, individually trivial. Drowns single-target damage.
 *            Wants the cannon's splash.
 *   brute  — slow, armoured. Armour is flat per hit, so the arrow tower's
 *            small, frequent hits are nearly worthless. Wants the cannon's
 *            big ones.
 *
 * Two towers is deliberate. A third tower is not the answer to "it feels
 * samey" — a fourth enemy is.
 */

import type { EnemyKind, TowerKind } from "./types.js";

export const TICKS_PER_SECOND = 30;

export type EnemySpec = {
  hp: number;
  /** Fixed-point units travelled per tick. */
  speed: number;
  /** Flat reduction applied to every hit. */
  armor: number;
  /** Gold paid on death under the kill-gold income model. */
  bounty: number;
  /** Lives lost if it reaches the end. */
  leak: number;
  /** Render radius, fixed-point. */
  radius: number;
};

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  runner: { hp: 75, speed: 95, armor: 0, bounty: 5, leak: 1, radius: 170 },
  swarm: { hp: 30, speed: 50, armor: 0, bounty: 2, leak: 1, radius: 130 },
  // Armour 10 vs the arrow tower's 12 damage is the point: unupgraded arrows
  // do 2 a hit to a brute. Bring a cannon.
  brute: { hp: 420, speed: 25, armor: 10, bounty: 18, leak: 2, radius: 260 },
};

export type TowerSpec = {
  cost: number;
  damage: number;
  /** Ticks between shots. Upgrades never change this. */
  cooldown: number;
  /** Fixed-point. */
  range: number;
  projectileSpeed: number;
  /** 0 for single-target. */
  splash: number;
};

export const TOWER_SPECS: Record<TowerKind, TowerSpec> = {
  arrow: { cost: 40, damage: 12, cooldown: 12, range: 2600, projectileSpeed: 400, splash: 0 },
  cannon: { cost: 90, damage: 45, cooldown: 45, range: 2200, projectileSpeed: 220, splash: 900 },
};

export const MAX_TOWER_LEVEL = 3;

/**
 * Integer percentage scaling per level, indexed by level (1-based).
 * Percentages keep upgrades exact — no float multipliers in the sim.
 */
export const DAMAGE_PCT_BY_LEVEL = [0, 100, 150, 200];
export const RANGE_PCT_BY_LEVEL = [0, 100, 110, 120];

export function towerDamage(kind: TowerKind, level: number): number {
  return Math.floor((TOWER_SPECS[kind].damage * DAMAGE_PCT_BY_LEVEL[level]) / 100);
}

export function towerRange(kind: TowerKind, level: number): number {
  return Math.floor((TOWER_SPECS[kind].range * RANGE_PCT_BY_LEVEL[level]) / 100);
}

/** Upgrading to `toLevel` costs this much. */
export function upgradeCost(kind: TowerKind, toLevel: number): number {
  return Math.floor((TOWER_SPECS[kind].cost * (toLevel + 1)) / 2);
}

export const SELL_REFUND_PCT = 60;

export const START_GOLD = 100;
export const START_LIVES = 15;

/**
 * CLAUDE.md §11 lists the income model as unresolved. M0 needs one to exist,
 * so both live here behind this constant and playtesting picks the winner.
 *
 * Current setting is "kill_gold" by explicit instruction. Note the charter's
 * stated lean is "regen": kill-gold can death-spiral (fewer kills -> less gold
 * -> fewer kills) and is asymmetric for the async PvP due at M4. Flip the
 * constant to compare rather than arguing about it.
 */
export const INCOME_MODEL: "kill_gold" | "regen" = "kill_gold";

/** regen model only: this much gold every REGEN_INTERVAL_TICKS. */
export const REGEN_AMOUNT = 3;
export const REGEN_INTERVAL_TICKS = 10;

export const SCORE_PER_KILL = 10;
export const SCORE_PER_WAVE = 250;
export const SCORE_PER_LIFE = 100;
