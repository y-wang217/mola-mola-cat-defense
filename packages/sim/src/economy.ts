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
 * The global timescale. "Faster everything" from the playtest, as one number.
 *
 * It is deliberately NOT applied inside the sim. The sim's tick rate stays a
 * fixed 30Hz and every stat stays denominated in ticks; what changes is how
 * fast the driver DRAINS ticks — apps/web/game/useGame.ts advances the sim
 * GAME_SPEED_MULTIPLIER ticks per 1/30s of wall clock. A tick is still a tick,
 * the fixed-point arithmetic is untouched, and a replay is bit-identical
 * whatever this is set to. Scattering a 2x across dozens of stats would have
 * changed every constant, broken every fixture, and made future tuning a
 * search-and-replace.
 *
 * The only place the sim needs to know about it is documentation: it is the
 * bridge between a sim-second (30 ticks) and a wall-clock second, and the mana
 * formula below is stated in both.
 */
export const GAME_SPEED_MULTIPLIER = 2.0;

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

/**
 * Mana income above the timescale. This is the most important number in the
 * tempo patch and the first one to reach for if the game feels wrong.
 *
 * A uniform 2x makes the game twice as fast but produces no extra decisions:
 * the player gets the same summons per wave, compressed into half the wall
 * clock. Decisions per second rise, decisions per WAVE stay flat. The playtest
 * asked for both, so income needs a multiplier on top of the timescale:
 *
 *   manaRate(wall clock) = baseManaRate * GAME_SPEED_MULTIPLIER * MANA_ACTION_DENSITY
 *
 * The GAME_SPEED_MULTIPLIER half of that is free — sim-seconds elapse twice as
 * fast, so a per-tick income already doubles per wall-clock second. Only the
 * density factor has to be paid for here, and it is what makes summons roughly
 * 40% more frequent RELATIVE TO WAVE CONTENT than they were.
 *
 * Both halves of the hybrid model scale by it: the tick floor below and the
 * kill-bounty pool. KILL_MANA_SHARE is untouched.
 */
export const MANA_ACTION_DENSITY = 1.4;

/** Income per SIM second after the density multiplier. Double it for wall clock. */
export const EFFECTIVE_MANA_PER_SECOND = TARGET_MANA_PER_SECOND * MANA_ACTION_DENSITY;

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
  Math.round((EFFECTIVE_MANA_PER_SECOND * (1 - KILL_MANA_SHARE) * MANA_REGEN_INTERVAL) / TICKS_PER_SECOND),
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
 * Ticks allowed AFTER the last spawn of the whole level, for the run-length
 * estimate. One trailing allowance, not one per wave: with the break phase gone
 * waves no longer wait for a clear, so the only slack in a run is the time the
 * final stragglers spend walking the lane. Calibrated against measured clean
 * clears — too short and the bounty pool is sized for a briefer run than the
 * one actually played, and total income lands under target.
 */
const CLEAR_ALLOWANCE_TICKS = 1300;

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
    // Wave N+1 starts spawning the tick wave N finishes spawning, so a wave
    // costs exactly its own spawn span.
    total += lastSpawn;
  }
  return total + CLEAR_ALLOWANCE_TICKS;
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
  const pool = (EFFECTIVE_MANA_PER_SECOND * KILL_MANA_SHARE * seconds) / EXPECTED_KILL_RATE;
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
