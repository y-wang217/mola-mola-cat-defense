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
  BOUNTY_WEIGHT, KILL_MANA_SHARE, MANA_REGEN_AMOUNT, MANA_REGEN_INTERVAL,
  TARGET_MANA_PER_SECOND, TICKS_PER_SECOND, bountyTable,
} from "../src/economy.js";
import { BALANCED, DEFAULT_POLICY, MIXED, autoplay } from "./autoplay.js";

/** A fumbled opening that leaks part of waves 1-2 without ending the run. */
const SLOPPY = { ...DEFAULT_POLICY, summonFromTick: 800 };

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
    expect(perSecond).toBeGreaterThan(TARGET_MANA_PER_SECOND * 0.8);
    expect(perSecond).toBeLessThan(TARGET_MANA_PER_SECOND * 1.15);
  });

  it("derives the tick floor from the dial rather than hardcoding it", () => {
    const floorPerSecond = (MANA_REGEN_AMOUNT * TICKS_PER_SECOND) / MANA_REGEN_INTERVAL;
    const expected = TARGET_MANA_PER_SECOND * (1 - KILL_MANA_SHARE);
    expect(Math.abs(floorPerSecond - expected)).toBeLessThan(1);
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

describe("the opening is generous", () => {
  const untilWave3 = (s: { waveIndex: number }) => s.waveIndex >= 2;

  it("lets a player who summons NOTHING survive waves 1 and 2", () => {
    const r = autoplay(M0_LEVEL, BALANCED, { ...DEFAULT_POLICY, summonFromTick: 999999 },
      30 * 60 * 12, untilWave3);
    expect(r.final.status).not.toBe("lost");
    expect(r.final.lives).toBeGreaterThan(0);
  });

  it("lets two summons clear wave 2 comfortably whatever the draw", () => {
    for (const roster of [BALANCED, MIXED]) {
      const r = autoplay(M0_LEVEL, roster, { ...DEFAULT_POLICY, maxSummons: 2 },
        30 * 60 * 12, untilWave3);
      expect(r.final.status).not.toBe("lost");
      expect(r.final.lives).toBeGreaterThanOrEqual(10);
    }
  });

  it("enters wave 3 with a board that could plausibly defend it", () => {
    const r = autoplay(M0_LEVEL, BALANCED, DEFAULT_POLICY, 30 * 60 * 12, untilWave3);
    expect(r.final.towers.length).toBeGreaterThanOrEqual(4);
    expect(r.final.lives).toBeGreaterThanOrEqual(14);
  });
});
