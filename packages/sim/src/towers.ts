/**
 * The tower pool. Every tower is a row in TOWER_POOL — adding one must mean
 * adding a row, never adding a branch. All behaviour differences are expressed
 * through three parameterised effect kinds:
 *
 *   shot         — ranged damage, on a platform tile
 *   block        — occupies a lane tile and physically stops enemies
 *   apply_status — little or no damage, applies timed modifiers
 *
 * Family contracts that must hold or the design collapses:
 *   - Melee is WEAK on damage and STRONG on control. If melee out-damages
 *     projectile, the family stops being a decision.
 *   - Status towers have no standalone value. A board of five status towers
 *     must lose, and losing that way should be legible within one run.
 *   - Fliers ignore blockers, which is what keeps projectile mandatory.
 *
 * On range shapes: `circle` and `lane` are implemented. `cone` was dropped
 * because a cone needs a facing, and choosing a facing is a placement decision
 * — exactly what the summon system exists to remove.
 */

import type { StatusKind } from "./status.js";
import type { TileClass, TowerFamily, TowerId } from "./types.js";

export type ShotEffect = {
  kind: "shot";
  /** single: one target. pierce: passes through. splash: area on impact.
   *  chain: jumps to a fresh target on impact. */
  targeting: "single" | "pierce" | "splash" | "chain";
  /** circle: radius around the tower. lane: a stretch of the lane, any width. */
  rangeShape: "circle" | "lane";
  priority: "first" | "last" | "strongest" | "weakest";
  damage: number;
  /** Ticks between shots. Tier never changes this. */
  cooldown: number;
  projectileSpeed: number;
  /** splash only, fixed-point radius. */
  splash: number;
  /** pierce only: how many enemies one shot may hit. */
  pierce: number;
  /** chain only: how many extra jumps one shot may make. */
  chain: number;
};

export type BlockEffect = {
  kind: "block";
  hp: number;
  /** How many enemies this tower holds at once. */
  blockCount: number;
  attackDamage: number;
  attackCooldown: number;
  /** hp regained every regenInterval ticks while alive. */
  regenAmount: number;
  regenInterval: number;
  deathEffect: "none" | "explode";
  deathDamage: number;
  deathRadius: number;
  /** Ticks of stun applied in deathRadius when it dies. */
  deathStunTicks: number;
};

export type StatusApplyEffect = {
  kind: "apply_status";
  status: StatusKind;
  magnitude: number;
  durationTicks: number;
  cooldown: number;
  /** aura: everything in range. targeted: up to maxTargets, first-along-lane. */
  mode: "aura" | "targeted";
  maxTargets: number;
  /** Status towers may carry a token amount of damage, or none at all. */
  damage: number;
};

export type TowerEffect = ShotEffect | BlockEffect | StatusApplyEffect;

export type TowerSpec = {
  id: TowerId;
  name: string;
  /**
   * PRE-ART PLACEHOLDER. Emoji stand in for real tower art so the board reads
   * as roles rather than coloured squares. They are not an art direction and
   * nothing cosmetic, skinnable or themeable should be built on top of them —
   * they exist to be deleted when real assets land.
   *
   * Each one is chosen from the tower's actual differentiating axis, not
   * decoratively: targeting mode for projectiles, control role for melee,
   * status kind for status.
   */
  icon: string;
  family: TowerFamily;
  tileClass: TileClass;
  /** Fixed-point. For `lane` shape this is the reach along the lane. */
  range: number;
  cost: number;
  effect: TowerEffect;
  /** Shown on the roster screen. The player picks on this. */
  blurb: string;
};

export const TOWER_POOL: TowerSpec[] = [
  // ---- Projectile: platform tiles, the damage baseline ------------------
  {
    id: "arrow", icon: "🏹", name: "Arrow", family: "projectile", tileClass: "platform",
    range: 2700, cost: 0,
    effect: {
      kind: "shot", targeting: "single", rangeShape: "circle", priority: "first",
      damage: 11, cooldown: 11, projectileSpeed: 420, splash: 0, pierce: 1, chain: 0,
    },
    blurb: "Fast, single target. Armour blunts it.",
  },
  {
    id: "mortar", icon: "💥", name: "Mortar", family: "projectile", tileClass: "platform",
    range: 2600, cost: 0,
    effect: {
      kind: "shot", targeting: "splash", rangeShape: "circle", priority: "strongest",
      damage: 54, cooldown: 48, projectileSpeed: 230, splash: 950, pierce: 1, chain: 0,
    },
    blurb: "Slow, heavy, splash. Beats armour and packs.",
  },
  {
    id: "lance", icon: "🔫", name: "Lance", family: "projectile", tileClass: "platform",
    range: 2900, cost: 0,
    effect: {
      kind: "shot", targeting: "pierce", rangeShape: "lane", priority: "first",
      damage: 30, cooldown: 27, projectileSpeed: 620, splash: 0, pierce: 3, chain: 0,
    },
    blurb: "Pierces three down the lane. Loves a queue.",
  },
  {
    id: "tesla", icon: "⚡", name: "Tesla", family: "projectile", tileClass: "platform",
    range: 2500, cost: 0,
    effect: {
      kind: "shot", targeting: "chain", rangeShape: "circle", priority: "weakest",
      damage: 17, cooldown: 24, projectileSpeed: 700, splash: 0, pierce: 1, chain: 3,
    },
    blurb: "Chains to three. Shreds swarms and fliers.",
  },

  // ---- Melee: lane tiles, control not damage ---------------------------
  {
    id: "bulwark", icon: "🗿", name: "Bulwark", family: "melee", tileClass: "path",
    range: 900, cost: 0,
    effect: {
      kind: "block", hp: 380, blockCount: 3, attackDamage: 5, attackCooldown: 22,
      regenAmount: 3, regenInterval: 30,
      deathEffect: "none", deathDamage: 0, deathRadius: 0, deathStunTicks: 0,
    },
    blurb: "Holds three. Deep pool, regenerates.",
  },
  {
    id: "warden", icon: "🛡️", name: "Warden", family: "melee", tileClass: "path",
    range: 900, cost: 0,
    effect: {
      kind: "block", hp: 270, blockCount: 3, attackDamage: 4, attackCooldown: 20,
      regenAmount: 0, regenInterval: 0,
      deathEffect: "none", deathDamage: 0, deathRadius: 0, deathStunTicks: 0,
    },
    blurb: "Holds three. Thinner, hits a touch faster.",
  },
  {
    id: "thorn", icon: "🧨", name: "Thorn", family: "melee", tileClass: "path",
    range: 900, cost: 0,
    effect: {
      kind: "block", hp: 200, blockCount: 2, attackDamage: 8, attackCooldown: 18,
      regenAmount: 0, regenInterval: 0,
      deathEffect: "explode", deathDamage: 70, deathRadius: 1150, deathStunTicks: 14,
    },
    blurb: "Holds two and detonates on death, stunning.",
  },

  // ---- Status: platform tiles, force multipliers ------------------------
  {
    id: "frost", icon: "❄️", name: "Frost", family: "status", tileClass: "platform",
    range: 2900, cost: 0,
    effect: {
      kind: "apply_status", status: "slow", magnitude: 30, durationTicks: 45,
      cooldown: 20, mode: "aura", maxTargets: 0, damage: 0,
    },
    blurb: "Aura. Slows everything nearby.",
  },
  {
    id: "venom", icon: "☠️", name: "Venom", family: "status", tileClass: "platform",
    range: 2900, cost: 0,
    effect: {
      kind: "apply_status", status: "poison", magnitude: 2, durationTicks: 90,
      // Single target, not two: poison is the only standalone damage in the
      // status family, and the generous range gives it far more uptime than it
      // used to have. Two targets made a status-only board self-sufficient,
      // which is exactly what this family must never be.
      cooldown: 30, mode: "targeted", maxTargets: 1, damage: 0,
    },
    blurb: "Poison stacks and ignores armour entirely.",
  },
  {
    id: "hex", icon: "🎯", name: "Hex", family: "status", tileClass: "platform",
    range: 2900, cost: 0,
    effect: {
      kind: "apply_status", status: "vulnerable", magnitude: 50, durationTicks: 60,
      cooldown: 28, mode: "targeted", maxTargets: 1, damage: 0,
    },
    blurb: "Marks one target to take 50% more damage.",
  },
  {
    id: "rasp", icon: "🔨", name: "Rasp", family: "status", tileClass: "platform",
    range: 2900, cost: 0,
    effect: {
      kind: "apply_status", status: "armor_shred", magnitude: 14, durationTicks: 55,
      cooldown: 24, mode: "aura", maxTargets: 0, damage: 0,
    },
    blurb: "Aura. Strips armour so everything else lands.",
  },
];

export const ROSTER_SIZE = 5;

/**
 * Tier scaling, indexed by tier (1-based). Deliberately modest: tier 3 should
 * be strong, not run-ending. Integer percentages keep it exact.
 */
export const TIER_POWER_PCT = [0, 100, 145, 195];
export const TIER_RANGE_PCT = [0, 100, 108, 116];
export const MAX_TIER = 3;

const BY_ID = new Map(TOWER_POOL.map((t) => [t.id, t]));

export function towerSpec(id: TowerId): TowerSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`unknown tower id: ${id}`);
  return spec;
}

/** Scale a base power number (damage, hp, status magnitude) by tier. */
export function atTier(base: number, tier: number): number {
  return Math.floor((base * TIER_POWER_PCT[tier]) / 100);
}

export function rangeAtTier(base: number, tier: number): number {
  return Math.floor((base * TIER_RANGE_PCT[tier]) / 100);
}

export function tileClassOf(id: TowerId): TileClass {
  return towerSpec(id).tileClass;
}

/**
 * Whether a family upgrade would do anything for this tower.
 *
 * Family upgrades scale damage and only damage, so a tower with no damage
 * number has nothing to scale. That is currently every status tower except
 * Venom: Frost, Hex and Rasp are pure control, and poison is the one status
 * that is damage. The sim refuses the upgrade rather than taking the mana, and
 * the UI marks the button inert — a button that charges for nothing is worse
 * than a button that is visibly unavailable.
 */
export function hasDamageAxis(id: TowerId): boolean {
  const effect = towerSpec(id).effect;
  switch (effect.kind) {
    case "shot":
      return effect.damage > 0;
    case "block":
      return effect.attackDamage > 0 || effect.deathDamage > 0;
    case "apply_status":
      return effect.damage > 0 || effect.status === "poison";
  }
}
