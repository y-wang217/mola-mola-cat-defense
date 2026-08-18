/**
 * The economy, in one place. Combat resolution must contain no mana numbers —
 * everything it needs comes from here.
 *
 * Mana has two sources and one dial:
 *
 *   - a guaranteed TICK FLOOR, paid regardless of performance
 *   - a KILL BOUNTY, paid on enemy death and scaled by how big the enemy was
 *
 * Going fully kill-funded would be a death spiral: leaking cuts income, which
 * guarantees leaking worse, and the run is decided several waves before it
 * ends. It also makes income asymmetric, and symmetric income is what makes PvP
 * balance tractable — which is the next milestone. So the floor stays.
 *
 * `KILL_MANA_SHARE` controls the split at expected-clear performance:
 *   0.0 -> today's behaviour, all floor
 *   1.0 -> pure kill-gold, no floor
 * Total income at a clean clear is roughly constant across the dial. We are
 * changing WHERE mana comes from, not how much there is.
 */

import { ENEMY_SPECS, type EnemyKind } from "./enemies.js";
import type { LevelDef } from "./types.js";

export const TICKS_PER_SECOND = 30;

/**
 * The dial. See the module comment.
 *
 * Set to 0.3 rather than the 0.6 originally specified, on measured evidence —
 * flip it back with one edit if you disagree, the model is identical either way:
 *
 *   at 0.6  BALANCED (mortar/tesla/warden/hex/rasp) goes from an 11-life win to
 *           a wave-4 LOSS, and the family-necessity suite fails. Kill-funding
 *           pays for damage, so a roster carrying three low-damage support
 *           towers earns less, fields fewer towers, and earns less again. It
 *           penalises exactly the family diversity the design exists to reward.
 *           Sloppy runs SPIRAL: income falls to 4.8/s against 8.2/s clean.
 *   at 0.3  every family-spanning roster still clears, income holds at 8.0-8.6/s
 *           whatever happens, and a fumbled opening RECOVERS (two of three
 *           sloppy rosters still won).
 */
export const KILL_MANA_SHARE = 0.3;

/** Total income rate at a clean clear, held constant across the dial. */
export const TARGET_MANA_PER_SECOND = 9;

/** Enough for two summons, since the first has no kills to fund it. */
export const STARTING_MANA = 90;

export const BASE_SUMMON_COST = 40;
export const SUMMON_COST_STEP = 4;

/** Summon cost escalates every summon and never resets. */
export function summonCostFor(summonsUsed: number): number {
  return BASE_SUMMON_COST + summonsUsed * SUMMON_COST_STEP;
}

/** Merging is free. Selling returns a fraction of everything sunk into a tile. */
export const SELL_REFUND_PCT = 55;

// --- the tick floor -------------------------------------------------------

export const MANA_REGEN_INTERVAL = 25;

/**
 * Derived, not authored: the floor is whatever share of the target the dial has
 * not handed to kills.
 */
export const MANA_REGEN_AMOUNT = Math.max(
  0,
  Math.round((TARGET_MANA_PER_SECOND * (1 - KILL_MANA_SHARE) * MANA_REGEN_INTERVAL) / TICKS_PER_SECOND),
);

// --- kill bounties --------------------------------------------------------

/**
 * Authored RELATIVE weights, deliberately not linear in HP. A brute should feel
 * like a payout and a swarm member should feel like small change; linear-in-HP
 * flattens exactly that difference.
 */
export const BOUNTY_WEIGHT: Record<EnemyKind, number> = {
  swarm: 1,
  runner: 2,
  flier: 3,
  armoured: 4,
  brute: 10,
  boss: 40,
};

/**
 * Ticks allowed per wave beyond its last spawn, for the run-length estimate.
 * Calibrated against measured clean clears (~260s), not guessed: too short and
 * the bounty pool is sized for a run briefer than the one actually played, and
 * total income lands under target.
 */
const CLEAR_ALLOWANCE_TICKS = 760;

/**
 * Not every enemy dies — some leak, and leaked enemies pay nothing. Sizing the
 * pool as if every enemy were killed would systematically underpay a real run,
 * so the pool is grossed up by the share that actually dies on a clean clear.
 */
const EXPECTED_KILL_RATE = 0.9;

/** Total weight of every enemy the level will ever send. */
function totalWeight(level: LevelDef): number {
  let sum = 0;
  for (const wave of level.waves) {
    for (const group of wave.spawns) sum += group.count * BOUNTY_WEIGHT[group.kind];
  }
  return sum;
}

/**
 * Estimated length of a clean clear, in ticks. Only used to set the bounty
 * scale — it does not need to be exact, and the economy test asserts the
 * measured split rather than trusting this.
 */
export function estimatedRunTicks(level: LevelDef): number {
  let total = 0;
  for (const wave of level.waves) {
    let lastSpawn = 0;
    for (const group of wave.spawns) {
      lastSpawn = Math.max(lastSpawn, group.startTick + (group.count - 1) * group.intervalTicks);
    }
    total += wave.prepTicks + lastSpawn + CLEAR_ALLOWANCE_TICKS;
  }
  return total;
}

/**
 * Mana paid for killing one enemy of this kind, derived so that clearing the
 * whole level pays out `KILL_MANA_SHARE` of the target income.
 */
export function bountyFor(level: LevelDef, kind: EnemyKind): number {
  // At share 0 the model must reduce EXACTLY to the old flat tick, so no
  // minimum-of-one sneaks a bounty in.
  if (KILL_MANA_SHARE <= 0) return 0;
  const weight = totalWeight(level);
  if (weight <= 0) return 0;
  const seconds = estimatedRunTicks(level) / TICKS_PER_SECOND;
  const pool = (TARGET_MANA_PER_SECOND * KILL_MANA_SHARE * seconds) / EXPECTED_KILL_RATE;
  return Math.max(1, Math.round((pool * BOUNTY_WEIGHT[kind]) / weight));
}

/** Every bounty at once, for tests and tooling. */
export function bountyTable(level: LevelDef): Record<EnemyKind, number> {
  const out = {} as Record<EnemyKind, number>;
  for (const kind of Object.keys(ENEMY_SPECS) as EnemyKind[]) {
    out[kind] = bountyFor(level, kind);
  }
  return out;
}
