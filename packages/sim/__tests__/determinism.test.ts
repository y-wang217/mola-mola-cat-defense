/**
 * CLAUDE.md §3 and §8. The summon and merge draws made randomness load-bearing,
 * so these assert the draw-order contract itself, not just that runs repeat.
 */

import { describe, expect, it } from "vitest";
import { createInitialState, tick } from "../src/tick.js";
import { M0_LEVEL } from "../src/level.js";
import { legalTileIndices } from "../src/summon.js";
import { towerSpec } from "../src/towers.js";
import { dist, isqrt } from "../src/fixed.js";
import { MANA_REGEN_AMOUNT, MANA_REGEN_INTERVAL } from "../src/content.js";
import { nextU32, seedRng } from "../src/rng.js";
import { autoplay, replay, hashState, BALANCED, MIXED } from "./autoplay.js";
import type { GameState, Input } from "../src/types.js";

describe("determinism", () => {
  it("produces an identical final state from identical inputs", () => {
    const a = autoplay(M0_LEVEL, BALANCED);
    const b = autoplay(M0_LEVEL, BALANCED);
    expect(hashState(b.final)).toBe(hashState(a.final));
    expect(b.ticks).toBe(a.ticks);
  });

  it("reproduces a run from its input log alone", () => {
    const run = autoplay(M0_LEVEL, MIXED);
    const replayed = replay(M0_LEVEL, MIXED, run.inputLog, run.ticks);
    expect(hashState(replayed)).toBe(hashState(run.final));
  });

  it("never mutates the state it is given", () => {
    let s = createInitialState(M0_LEVEL, BALANCED);
    for (let i = 0; i < 400; i++) s = tick(s, i === 10 ? [summon(s)] : []);

    const before = JSON.stringify(s);
    for (let i = 0; i < 200; i++) tick(s, [summon(s)]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("seeds the PRNG reproducibly", () => {
    const a = seedRng(M0_LEVEL.seed);
    const b = seedRng(M0_LEVEL.seed);
    const drawsA = Array.from({ length: 64 }, () => nextU32(a));
    const drawsB = Array.from({ length: 64 }, () => nextU32(b));
    expect(drawsA).toEqual(drawsB);
    expect(new Set(drawsA).size).toBeGreaterThan(60);
  });
});

describe("the summon draw-order contract (summon.ts)", () => {
  it("consumes no RNG when mana is short", () => {
    let s = createInitialState(M0_LEVEL, BALANCED);
    s = tick(s, []);
    s = { ...s, mana: 0 };

    const before = { ...s.rng };
    const after = tick(s, [summon(s)]);
    expect(after.rng).toEqual(before);
    expect(after.towers).toHaveLength(0);
    expect(after.events).toHaveLength(0);
  });

  it("refunds mana and consumes only the type draw when there is no room", () => {
    // A roster whose only melee entry has nowhere to go: fill every lane tile.
    let s = createInitialState(M0_LEVEL, ["bulwark", "bulwark", "bulwark", "bulwark", "bulwark"]);
    s = tick(s, []);
    const laneTiles = legalTileIndices(s, "path");
    s = {
      ...s,
      mana: 5000,
      towers: laneTiles.map((tileIndex, i) => ({
        id: 1000 + i, towerId: "bulwark", tileIndex, x: 0, y: 0, tier: 1,
        cooldown: 0, hp: 100, maxHp: 100, blocking: [], invested: 40, laneDist: 0,
      })),
    };

    const manaBefore = s.mana;
    const rngBefore = { ...s.rng };
    const after = tick(s, [summon(s)]);

    expect(after.events).toEqual([{ kind: "no_room", towerId: "bulwark" }]);
    // Mana is untouched apart from this tick's scheduled regen: the cost was
    // taken and given straight back.
    const regen = after.tick % MANA_REGEN_INTERVAL === 0 ? MANA_REGEN_AMOUNT : 0;
    expect(after.mana).toBe(manaBefore + regen);
    expect(after.summonsUsed).toBe(0);
    // Exactly one draw was taken (the type); the tile draw never happened.
    const oneDraw = { ...rngBefore };
    nextU32(oneDraw);
    expect(after.rng).toEqual(oneDraw);
  });

  it("only ever places a tower on a tile of its own class", () => {
    const run = autoplay(M0_LEVEL, MIXED);
    for (const t of run.final.towers) {
      const tile = M0_LEVEL.terrain.tiles[t.tileIndex];
      expect(towerSpec(t.towerId).tileClass).toBe(tile.class);
    }
  });
});

describe("fixed-point math", () => {
  it("computes exact integer square roots", () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(16)).toBe(4);
    expect(isqrt(15)).toBe(3);
    for (let n = 0; n < 3000; n++) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
  });

  it("measures distance in whole fixed-point units", () => {
    expect(dist(0, 0, 3000, 4000)).toBe(5000);
  });
});

function summon(s: GameState): Input {
  return { tick: s.tick, kind: "summon", payload: {} };
}
