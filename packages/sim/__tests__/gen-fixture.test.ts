import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { M0_LEVEL } from "../src/level.js";
import { GOLDEN_ROSTER, GOLDEN_TICKS, hashState, scriptedRun } from "./autoplay.js";

/**
 * Regeneration tool, not a test. Run it deliberately:
 *
 *   REGEN_FIXTURE=1 pnpm --filter @siege/sim exec vitest run gen-fixture
 *
 * Regenerating changes the recorded hash, which per CLAUDE.md §8 must be an
 * intentional, explained break committed alongside the sim change that caused it.
 */
it.skipIf(!process.env.REGEN_FIXTURE)("writes the golden fixture", () => {
  const run = scriptedRun(M0_LEVEL, GOLDEN_ROSTER, GOLDEN_TICKS);
  const dir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
  mkdirSync(dir, { recursive: true });
  const fixture = {
    note: "Regenerate with `vitest run gen-fixture` and explain the change in the commit.",
    levelId: M0_LEVEL.id,
    seed: M0_LEVEL.seed,
    roster: GOLDEN_ROSTER,
    ticks: run.ticks,
    coverage: {
      summons: run.summons, merges: run.merges, sells: run.sells,
      noRoom: run.noRoom, upgrades: run.upgrades,
    },
    inputLog: run.inputLog,
    hash: hashState(run.final),
  };
  writeFileSync(join(dir, "m0-rework.json"), JSON.stringify(fixture, null, 2) + "\n");
  console.log("coverage:", JSON.stringify(fixture.coverage), "hash:", fixture.hash);
});
