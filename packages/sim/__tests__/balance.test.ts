/**
 * Design invariants, not balance polish.
 *
 * CLAUDE.md §10: "New tower types as the answer to 'the game feels samey'" is
 * an anti-pattern — enemy variety is what forces tower diversity. These tests
 * assert that the enemy set actually does that: if a single-tower build ever
 * starts clearing the board, the two towers have stopped being a decision and
 * the level needs a new enemy, not a new tower.
 *
 * Expect to update these when tuning changes. That is the point — they make a
 * tuning change that flattens the decision space visible instead of silent.
 */

import { describe, expect, it } from "vitest";
import { M0_LEVEL } from "../src/level.js";
import { ALL_ARROW, ALL_CANNON, MIXED, autoplay } from "./autoplay.js";

describe("the two towers are a real decision", () => {
  it("rewards a mixed build with a win", () => {
    const { final } = autoplay(M0_LEVEL, MIXED);
    expect(final.status).toBe("won");
  });

  it("punishes an all-arrow build — armoured brutes blunt small, frequent hits", () => {
    const { final } = autoplay(M0_LEVEL, ALL_ARROW);
    expect(final.status).toBe("lost");
  });

  it("punishes an all-cannon build — runners outpace a slow firing cycle", () => {
    const { final } = autoplay(M0_LEVEL, ALL_CANNON);
    expect(final.status).toBe("lost");
  });
});

describe("run shape", () => {
  it("lasts about four minutes, which is the M0 question being asked", () => {
    const { ticks } = autoplay(M0_LEVEL, MIXED);
    const seconds = ticks / 30;
    expect(seconds).toBeGreaterThan(150);
    expect(seconds).toBeLessThan(360);
  });

  it("ends decisively rather than stalling out", () => {
    const { final } = autoplay(M0_LEVEL, MIXED);
    expect(["won", "lost"]).toContain(final.status);
    expect(final.enemies.length).toBe(0);
  });
});
