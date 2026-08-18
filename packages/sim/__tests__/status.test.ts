/**
 * The stacking rule table in status.ts, asserted row by row.
 *
 * Ambiguous stacking is where TD balance goes to die, so each rule gets a test
 * rather than a comment alone.
 */

import { describe, expect, it } from "vitest";
import { STACK_RULES, applyStatus, expireStatuses, magnitudeOf } from "../src/status.js";
import type { StatusEffect, StatusKind } from "../src/status.js";

function effect(kind: StatusKind, magnitude: number, ticks = 30): StatusEffect {
  return { kind, magnitude, remainingTicks: ticks, sourceId: "test" };
}

describe("status stacking", () => {
  it("takes the max for slow, so two sources cannot freeze the board", () => {
    expect(STACK_RULES.slow).toBe("max");
    const statuses: StatusEffect[] = [];
    applyStatus(statuses, effect("slow", 30, 20), 0);
    applyStatus(statuses, effect("slow", 45, 10), 0);
    expect(magnitudeOf(statuses, "slow")).toBe(45);
    expect(statuses[0].remainingTicks).toBe(20); // duration takes the longer
  });

  it("stacks poison additively — that is the reward for committing to it", () => {
    expect(STACK_RULES.poison).toBe("additive");
    const statuses: StatusEffect[] = [];
    applyStatus(statuses, effect("poison", 3), 0);
    applyStatus(statuses, effect("poison", 4), 0);
    expect(magnitudeOf(statuses, "poison")).toBe(7);
  });

  it("takes the max for vulnerable, which would otherwise explode", () => {
    expect(STACK_RULES.vulnerable).toBe("max");
    const statuses: StatusEffect[] = [];
    applyStatus(statuses, effect("vulnerable", 50), 0);
    applyStatus(statuses, effect("vulnerable", 30), 0);
    expect(magnitudeOf(statuses, "vulnerable")).toBe(50);
  });

  it("stacks armor_shred additively but never past the target's base armour", () => {
    expect(STACK_RULES.armor_shred).toBe("additive");
    const statuses: StatusEffect[] = [];
    applyStatus(statuses, effect("armor_shred", 14), 20);
    applyStatus(statuses, effect("armor_shred", 14), 20);
    // Clamped to the cap, so shred can strip armour but never invert it.
    expect(magnitudeOf(statuses, "armor_shred")).toBe(20);
  });

  it("refreshes stun rather than stacking it", () => {
    expect(STACK_RULES.stun).toBe("refresh");
    const statuses: StatusEffect[] = [];
    applyStatus(statuses, effect("stun", 1, 10), 0);
    applyStatus(statuses, effect("stun", 1, 25), 0);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].remainingTicks).toBe(25);
  });

  it("keeps the array in a fixed order regardless of application order", () => {
    const a: StatusEffect[] = [];
    applyStatus(a, effect("stun", 1), 0);
    applyStatus(a, effect("slow", 1), 0);
    applyStatus(a, effect("poison", 1), 0);

    const b: StatusEffect[] = [];
    applyStatus(b, effect("poison", 1), 0);
    applyStatus(b, effect("stun", 1), 0);
    applyStatus(b, effect("slow", 1), 0);

    expect(a.map((s) => s.kind)).toEqual(b.map((s) => s.kind));
  });

  it("expires effects when their duration runs out", () => {
    let statuses: StatusEffect[] = [];
    applyStatus(statuses, effect("slow", 30, 2), 0);
    statuses = expireStatuses(statuses);
    expect(statuses).toHaveLength(1);
    statuses = expireStatuses(statuses);
    expect(statuses).toHaveLength(0);
  });
});
