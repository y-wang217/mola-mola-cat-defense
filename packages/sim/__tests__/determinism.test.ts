/**
 * CLAUDE.md §3 and §8. The full golden-replay and browser/Node isomorphism
 * suites are M1 work; these are the sanity checks that keep the sim honest
 * while M0 is being built, so M1 is an extraction rather than a rewrite.
 */

import { describe, expect, it } from "vitest";
import { createInitialState, tick } from "../src/tick.js";
import { M0_LEVEL } from "../src/level.js";
import { isqrt, dist } from "../src/fixed.js";
import { nextU32, seedRng } from "../src/rng.js";
import { autoplay, replay, MIXED } from "./autoplay.js";

describe("determinism", () => {
  it("produces an identical final state from identical inputs", () => {
    const a = autoplay(M0_LEVEL, MIXED);
    const b = autoplay(M0_LEVEL, MIXED);
    expect(JSON.stringify(b.final)).toBe(JSON.stringify(a.final));
    expect(b.ticks).toBe(a.ticks);
  });

  it("reproduces a run from its input log alone", () => {
    const run = autoplay(M0_LEVEL, MIXED);
    const replayed = replay(M0_LEVEL, run.inputLog, run.ticks);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(run.final));
  });

  it("never mutates the state it is given", () => {
    let s = createInitialState(M0_LEVEL);
    s = tick(s, [{ tick: 0, kind: "place", payload: { slotIndex: 4, tower: "arrow" } }]);
    s = tick(s, [{ tick: 1, kind: "start_wave", payload: {} }]);

    const before = JSON.stringify(s);
    for (let i = 0; i < 200; i++) tick(s, []);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("seeds the PRNG reproducibly and does not repeat trivially", () => {
    const a = seedRng(20260818);
    const b = seedRng(20260818);
    const drawsA = Array.from({ length: 64 }, () => nextU32(a));
    const drawsB = Array.from({ length: 64 }, () => nextU32(b));
    expect(drawsA).toEqual(drawsB);
    expect(new Set(drawsA).size).toBeGreaterThan(60);
    expect(seedRng(1).a).not.toBe(seedRng(2).a);
  });
});

describe("fixed-point math", () => {
  it("computes exact integer square roots", () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(1)).toBe(1);
    expect(isqrt(16)).toBe(4);
    expect(isqrt(15)).toBe(3);
    expect(isqrt(1_000_000)).toBe(1000);
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
  });

  it("measures distance in whole fixed-point units", () => {
    expect(dist(0, 0, 3000, 4000)).toBe(5000);
  });
});
