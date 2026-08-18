/**
 * Design invariants, not balance polish. CLAUDE.md §10 and the rework spec's
 * done-when (3): "A board that neglects any one family loses to the wave
 * designed to punish it."
 *
 * These are tuning tripwires. Expect to update them when tuning changes — that
 * is the point. A tuning change that flattens the decision space should fail
 * here rather than pass quietly.
 *
 * KNOWN GAP, asserted honestly below rather than papered over: neglecting MELEE
 * does not lose. §5 gives the runner two answers, "melee block OR slow", so a
 * roster carrying Frost answers runners without a blocker, and no other
 * archetype is melee-exclusive the way flier is projectile-exclusive. Melee
 * measures as break-even at equal damage density, not mandatory. Closing that
 * needs an enemy change, not a number change — see the note in enemies.ts.
 */

import { describe, expect, it } from "vitest";
import { M0_LEVEL } from "../src/level.js";
import {
  AB_NO_MELEE, AB_WITH_MELEE, BALANCED, NO_PROJECTILE, NO_STATUS, STATUS_HEAVY, autoplay,
} from "./autoplay.js";

/** Wave index (0-based) whose archetype punishes each neglected family. */
const FLIER_WAVE = 3;

describe("neglecting a family is punished", () => {
  it("a roster with no projectile tower cannot touch fliers and dies to them", () => {
    const { final } = autoplay(M0_LEVEL, NO_PROJECTILE);
    expect(final.status).toBe("lost");
    expect(final.waveIndex).toBeLessThanOrEqual(FLIER_WAVE);
  });

  it("a status-heavy board loses — force multipliers with nothing to multiply", () => {
    const { final } = autoplay(M0_LEVEL, STATUS_HEAVY);
    expect(final.status).toBe("lost");
  });

  it("a roster with no status tower is walled by armour and the boss", () => {
    const { final } = autoplay(M0_LEVEL, NO_STATUS);
    expect(final.status).toBe("lost");
  });
});

describe("a roster spanning all three families wins", () => {
  it("clears the run with lives to spare", () => {
    const { final } = autoplay(M0_LEVEL, BALANCED);
    expect(final.status).toBe("won");
    expect(final.lives).toBeGreaterThan(0);
  });

  it("lasts long enough to be a run and short enough to retry", () => {
    const { ticks } = autoplay(M0_LEVEL, BALANCED);
    const seconds = ticks / 30;
    expect(seconds).toBeGreaterThan(150);
    expect(seconds).toBeLessThan(400);
  });
});

describe("melee is viable, and measurably not mandatory", () => {
  // A fair A/B: identical rosters but for one slot, so damage density matches
  // and the only variable is whether a blocker is in the draw pool.
  it("trading a projectile slot for a blocker still clears the run", () => {
    const { final } = autoplay(M0_LEVEL, AB_WITH_MELEE);
    expect(final.status).toBe("won");
  });

  it("documents that dropping the blocker also clears it — melee is break-even", () => {
    const withMelee = autoplay(M0_LEVEL, AB_WITH_MELEE);
    const without = autoplay(M0_LEVEL, AB_NO_MELEE);
    expect(withMelee.final.status).toBe("won");
    // This assertion records the gap. If a future enemy change makes melee
    // mandatory, this flips to `toBe("lost")` and the note above comes out.
    expect(without.final.status).toBe("won");
  });
});

describe("the summon economy holds", () => {
  it("escalating cost keeps the board from being flooded", () => {
    const run = autoplay(M0_LEVEL, BALANCED);
    expect(run.summons).toBeLessThan(M0_LEVEL.terrain.tiles.length * 3);
    expect(run.merges).toBeGreaterThan(0);
  });
});
