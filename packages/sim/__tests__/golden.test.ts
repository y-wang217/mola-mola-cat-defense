/**
 * Golden replay fixture. CLAUDE.md §8.
 *
 * The fixture records a scripted run's input log and a hash of its final state.
 * Any change to the sim — tuning, tick order, or the RNG draw order in
 * summon.ts / merge.ts — changes this hash. That is the point: it must be an
 * intentional, explained break, with the fixture regenerated in the same commit
 * and the reason in the message.
 *
 * Regenerate with:
 *   REGEN_FIXTURE=1 pnpm --filter @siege/sim exec vitest run gen-fixture
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { M0_LEVEL } from "../src/level.js";
import { GOLDEN_ROSTER, GOLDEN_TICKS, hashState, replay, scriptedRun } from "./autoplay.js";
import type { Input } from "../src/types.js";

type Fixture = {
  levelId: string;
  seed: number;
  roster: string[];
  ticks: number;
  coverage: { summons: number; merges: number; sells: number; noRoom: number; upgrades: number };
  inputLog: { tick: number; inputs: Input[] }[];
  hash: string;
};

const fixture = JSON.parse(
  readFileSync(
    join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "m0-rework.json"),
    "utf8",
  ),
) as Fixture;

describe("golden replay", () => {
  it("still describes this level and roster", () => {
    expect(fixture.levelId).toBe(M0_LEVEL.id);
    expect(fixture.seed).toBe(M0_LEVEL.seed);
    expect(fixture.roster).toEqual(GOLDEN_ROSTER);
  });

  it("covers the cases §8 requires", () => {
    expect(fixture.coverage.summons).toBeGreaterThanOrEqual(4);
    expect(fixture.coverage.merges).toBeGreaterThanOrEqual(2);
    expect(fixture.coverage.sells).toBeGreaterThanOrEqual(1);
    expect(fixture.coverage.noRoom).toBeGreaterThanOrEqual(1);
    expect(fixture.coverage.upgrades).toBeGreaterThanOrEqual(2);
  });

  it("reproduces the recorded hash from the scripted run", () => {
    const run = scriptedRun(M0_LEVEL, GOLDEN_ROSTER, GOLDEN_TICKS);
    expect(hashState(run.final)).toBe(fixture.hash);
  });

  it("reproduces the recorded hash from the input log alone", () => {
    const final = replay(M0_LEVEL, fixture.roster, fixture.inputLog, fixture.ticks);
    expect(hashState(final)).toBe(fixture.hash);
  });
});
