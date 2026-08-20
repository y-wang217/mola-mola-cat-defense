/**
 * Run frame constants. The economy lives in economy.ts; tower and enemy tuning
 * live in towers.ts and enemies.ts.
 */

import type { EnemyKind } from "./enemies.js";

export { TICKS_PER_SECOND, GAME_SPEED_MULTIPLIER } from "./economy.js";

/**
 * Lives, as segments on the bar rather than a number.
 *
 * Down from 18. Eighteen lives made a leak a rounding error — the playtest
 * leaked repeatedly without noticing and without consequence. Five makes every
 * leak a real event, which is the whole point of the segmented bar in the HUD.
 *
 * The other half of that decision lives in level.ts: the opening waves are cut
 * back so an early mistake is unlikely, rather than absorbed. Handing the
 * player more health to soak early errors is exactly what makes leaks feel
 * meaningless, so it is not how the opening is made safe.
 */
export const MAX_LIVES = 5;

/**
 * Segments lost per leak, by how big the thing that got through was.
 *
 * One ordinary leak is one segment; the boss is two. Nothing costs more than
 * two — at five lives, a three-segment leak would end a run in two mistakes and
 * the bar would stop being a countdown the player can reason about.
 */
export type LeakTier = "normal" | "boss";

export const LEAK_DAMAGE_BY_TIER: Record<LeakTier, number> = {
  normal: 1,
  boss: 2,
};

/**
 * Widening applied to every authored spawn interval, as an integer percentage.
 * (The tempo brief calls this SPAWN_INTERVAL.)
 *
 * With the break phase gone, wave N+1 starts spawning the moment wave N stops,
 * so two waves' worth of enemies can be walking the lane at once. This is the
 * global dial for thinning that out if the handover ever reads as one
 * undifferentiated mass. It is at 100 because the measured overlap does not
 * need it — the wave data is authored with the handover in mind — and it is
 * here so the fix is one number rather than an edit to every spawn group.
 */
export const SPAWN_INTERVAL_PCT = 100;

/** Ticks between an authored spawn and the next one of the same group. */
export function spawnIntervalFor(authored: number): number {
  return Math.max(1, Math.floor((authored * SPAWN_INTERVAL_PCT) / 100));
}

export const SCORE_PER_WAVE = 200;
export const SCORE_PER_LIFE = 100;

/** Lives lost when one of these reaches the end. */
export function leakDamageFor(kind: EnemyKind): number {
  return LEAK_DAMAGE_BY_TIER[kind === "boss" ? "boss" : "normal"];
}
