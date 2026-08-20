/**
 * The income model, asserted rather than eyeballed.
 *
 * The design question this file exists to guard: kill-funded income creates a
 * death spiral, where leaking cuts income which guarantees leaking worse. The
 * tick floor is what prevents that, and `KILL_MANA_SHARE` is how much of the
 * income is exposed to performance. These tests fail if that protection erodes.
 */

import { describe, expect, it } from "vitest";
import { M0_LEVEL } from "../src/level.js";
import {
  BOUNTY_WEIGHT, EFFECTIVE_MANA_PER_SECOND, KILL_MANA_SHARE, MANA_ACTION_DENSITY,
  MANA_REGEN_AMOUNT, MANA_REGEN_INTERVAL, TARGET_MANA_PER_SECOND, TICKS_PER_SECOND,
  bountyTable,
} from "../src/economy.js";
import { MAX_LIVES } from "../src/content.js";
import { BALANCED, DEFAULT_POLICY, MIXED, autoplay } from "./autoplay.js";

/**
 * A fumbled opening: no summon for the first 500 ticks, which is most of wave 1
 * and costs real lives.
 *
 * Recalibrated from 800 in the tempo patch. At five lives instead of eighteen,
 * 800 ticks of doing nothing leaks the whole of wave 1 and the run is simply
 * over — that measures the life count, not the income model. 500 is the largest
 * fumble that still leaves a run to recover, which is what these tests are for.
 */
const SLOPPY = { ...DEFAULT_POLICY, summonFromTick: 500 };

function income(roster: string[], policy = DEFAULT_POLICY) {
  const r = autoplay(M0_LEVEL, roster, policy);
  const total = r.final.manaFromTick + r.final.manaFromKills;
  return {
    status: r.final.status,
    lives: r.final.lives,
    total,
    killShare: total > 0 ? r.final.manaFromKills / total : 0,
    perSecond: total / (r.ticks / TICKS_PER_SECOND),
  };
}

describe("the dial", () => {
  it("splits income near KILL_MANA_SHARE at a clean clear", () => {
    const { killShare } = income(BALANCED);
    expect(killShare).toBeGreaterThan(KILL_MANA_SHARE - 0.15);
    expect(killShare).toBeLessThan(KILL_MANA_SHARE + 0.15);
  });

  it("keeps total income near target — we moved where mana comes from, not how much", () => {
    const { perSecond } = income(BALANCED);
    expect(perSecond).toBeGreaterThan(EFFECTIVE_MANA_PER_SECOND * 0.8);
    expect(perSecond).toBeLessThan(EFFECTIVE_MANA_PER_SECOND * 1.15);
  });

  it("derives the tick floor from the dial rather than hardcoding it", () => {
    const floorPerSecond = (MANA_REGEN_AMOUNT * TICKS_PER_SECOND) / MANA_REGEN_INTERVAL;
    const expected = EFFECTIVE_MANA_PER_SECOND * (1 - KILL_MANA_SHARE);
    expect(Math.abs(floorPerSecond - expected)).toBeLessThan(1);
  });
});

describe("action density sits on top of the timescale", () => {
  // The tempo patch's central claim: a uniform 2x gives the same number of
  // summons per wave in half the time, so income needs its own multiplier for
  // "more actions" to mean anything. Both halves of the hybrid model carry it.
  it("scales the whole income target, floor and bounties alike", () => {
    expect(EFFECTIVE_MANA_PER_SECOND).toBeCloseTo(TARGET_MANA_PER_SECOND * MANA_ACTION_DENSITY, 6);
    const floorPerSecond = (MANA_REGEN_AMOUNT * TICKS_PER_SECOND) / MANA_REGEN_INTERVAL;
    const undensified = TARGET_MANA_PER_SECOND * (1 - KILL_MANA_SHARE);
    expect(floorPerSecond / undensified).toBeGreaterThan(1.3);
  });

  it("delivers more mana per sim second than the undensified target", () => {
    const { perSecond } = income(BALANCED);
    expect(perSecond).toBeGreaterThan(TARGET_MANA_PER_SECOND * 1.2);
  });
});

describe("a sloppy run recovers rather than spiralling", () => {
  // This is the whole reason the floor exists. If these flip to "lost", the
  // dial has been pushed too far toward kill-funding.
  it("still clears the run after a fumbled opening", () => {
    expect(income(MIXED, SLOPPY).status).toBe("won");
  });

  it("does not let income collapse with performance", () => {
    const clean = income(MIXED);
    const sloppy = income(MIXED, SLOPPY);
    // A sloppy run may earn less, but not catastrophically less — that gap is
    // the spiral, and it must stay narrow.
    expect(sloppy.perSecond).toBeGreaterThan(clean.perSecond * 0.8);
  });
});

describe("bounties are legible", () => {
  it("pays noticeably more for bigger, tankier enemies", () => {
    const b = bountyTable(M0_LEVEL);
    expect(b.boss).toBeGreaterThan(b.brute);
    expect(b.brute).toBeGreaterThan(b.armoured);
    expect(b.armoured).toBeGreaterThan(b.flier);
    expect(b.flier).toBeGreaterThan(b.runner);
    expect(b.runner).toBeGreaterThan(b.swarm);
    // Killing a brute should feel like a payout, not a rounding difference.
    expect(b.brute).toBeGreaterThan(b.swarm * 6);
  });

  it("keeps the weights non-linear in HP so size reads as value", () => {
    expect(BOUNTY_WEIGHT.boss / BOUNTY_WEIGHT.swarm).toBeGreaterThan(20);
  });
});

describe("the opening is safe, and safe through wave content", () => {
  const untilWave4 = (s: { waveIndex: number }) => s.waveIndex >= 3;
  const untilWave5 = (s: { waveIndex: number }) => s.waveIndex >= 4;

  /**
   * These replaced the old "a player who summons NOTHING survives waves 1-2"
   * and "two summons clear wave 2" properties, which cannot hold at five lives:
   * wave 1 alone sends five runners, so an idle board loses the run. That is
   * the deliberate trade — early safety now comes from what the opening waves
   * SEND rather than from a life pool deep enough to absorb the leaks. Handing
   * the player more health to soak early mistakes is exactly what made a leak
   * feel like nothing.
   */
  it("does not cost a single life before wave 4 under reasonable play", () => {
    for (const roster of [BALANCED, MIXED]) {
      const r = autoplay(M0_LEVEL, roster, DEFAULT_POLICY, 30 * 60 * 12, untilWave4);
      expect(r.final.status).not.toBe("lost");
      expect(r.final.lives).toBe(MAX_LIVES);
    }
  });

  it("still has the full bar entering wave 5", () => {
    const r = autoplay(M0_LEVEL, BALANCED, DEFAULT_POLICY, 30 * 60 * 12, untilWave5);
    expect(r.final.lives).toBe(MAX_LIVES);
  });

  it("enters wave 4 with a board that could plausibly defend it", () => {
    const r = autoplay(M0_LEVEL, BALANCED, DEFAULT_POLICY, 30 * 60 * 12, untilWave4);
    expect(r.final.towers.length).toBeGreaterThanOrEqual(4);
  });
});
