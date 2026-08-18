/**
 * Run constants. Tower and enemy tuning live in towers.ts and enemies.ts;
 * this file is only the economy and the run frame.
 */

export const TICKS_PER_SECOND = 30;

// --- Mana -----------------------------------------------------------------
// Time-regenerating, fixed rate, completely independent of performance. No
// death spiral, symmetric for the async PvP due at M4, and it makes *timing*
// the resource decision rather than efficiency.

export const START_MANA = 120;
export const MANA_REGEN_AMOUNT = 3;
export const MANA_REGEN_INTERVAL = 10; // -> 9 mana/second

/**
 * Summon cost escalates every summon and never resets. This is what pushes the
 * player toward merging up rather than flooding the board — flooding gets
 * priced out, merging stays free.
 */
export const BASE_SUMMON_COST = 40;
export const SUMMON_COST_STEP = 4;

export function summonCostFor(summonsUsed: number): number {
  return BASE_SUMMON_COST + summonsUsed * SUMMON_COST_STEP;
}

/** Merging is free. Selling returns a fraction of everything sunk into a tile. */
export const SELL_REFUND_PCT = 55;

// --- Run frame ------------------------------------------------------------

export const START_LIVES = 18;
export const SCORE_PER_WAVE = 200;
export const SCORE_PER_LIFE = 100;
