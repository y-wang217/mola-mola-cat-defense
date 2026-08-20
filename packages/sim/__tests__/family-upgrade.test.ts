/**
 * Family upgrades: the in-run spend sink added in M0.1 patch D.
 *
 * The properties worth guarding are the ones that would quietly rot: that the
 * input costs nothing when it is refused, that it consumes no randomness, that
 * the bonus reaches towers already on the board AND ones summoned later, and
 * that a merged tower reads the family it BECAME rather than the one it was.
 */

import { describe, expect, it } from "vitest";
import { M0_LEVEL } from "../src/level.js";
import {
  FAMILY_UPGRADE_BASE_COST, FAMILY_UPGRADE_COST_GROWTH, FAMILY_UPGRADE_MAX_LEVEL,
  familyDamagePct, familyUpgradeCost,
} from "../src/economy.js";
import { hasDamageAxis } from "../src/towers.js";
import { createInitialState, tick } from "../src/tick.js";
import { buildPath, nearestLaneDistance, tileCentre } from "../src/pathing.js";
import type { GameState, Input, TowerId } from "../src/types.js";

const ROSTER: TowerId[] = ["arrow", "mortar", "bulwark", "frost", "venom"];

function upgrade(s: GameState, towerId: TowerId): Input {
  return { tick: s.tick, kind: "family_upgrade", payload: { towerId } };
}

/** A state with mana to burn, one tick in so nothing is mid-initialisation. */
function rich(mana = 5000): GameState {
  const s = tick(createInitialState(M0_LEVEL, ROSTER), []);
  return { ...s, mana };
}

describe("the upgrade input", () => {
  it("starts every roster family at zero and nothing else", () => {
    const s = createInitialState(M0_LEVEL, ROSTER);
    expect(s.familyUpgradeLevels).toEqual({
      arrow: 0, mortar: 0, bulwark: 0, frost: 0, venom: 0,
    });
    // Insertion order is roster order, which is what keeps the hash stable.
    expect(Object.keys(s.familyUpgradeLevels)).toEqual(ROSTER);
  });

  it("raises the level and charges the escalating cost", () => {
    let s = rich(1000);
    const before = s.mana;
    s = tick(s, [upgrade(s, "arrow")]);
    expect(s.familyUpgradeLevels.arrow).toBe(1);
    expect(before - s.mana).toBe(FAMILY_UPGRADE_BASE_COST);

    const second = s.mana;
    s = tick(s, [upgrade(s, "arrow")]);
    expect(s.familyUpgradeLevels.arrow).toBe(2);
    expect(second - s.mana).toBe(Math.round(FAMILY_UPGRADE_BASE_COST * FAMILY_UPGRADE_COST_GROWTH));
  });

  it("stops at the ceiling", () => {
    let s = rich();
    for (let i = 0; i < FAMILY_UPGRADE_MAX_LEVEL + 3; i++) s = tick(s, [upgrade(s, "arrow")]);
    expect(s.familyUpgradeLevels.arrow).toBe(FAMILY_UPGRADE_MAX_LEVEL);

    const mana = s.mana;
    s = tick(s, [upgrade(s, "arrow")]);
    expect(s.mana).toBeGreaterThanOrEqual(mana); // refused, so nothing was taken
  });

  it("costs nothing when it is refused", () => {
    // Unaffordable, out of roster, and a family with no damage to scale. All
    // three are no-ops rather than errors, exactly like an unaffordable summon.
    for (const [family, mana] of [["arrow", 10], ["tesla", 5000], ["frost", 5000]] as const) {
      const s = rich(mana);
      const after = tick(s, [upgrade(s, family)]);
      expect(after.mana).toBe(s.mana);
      expect(after.familyUpgradeLevels[family] ?? 0).toBe(0);
    }
  });

  it("consumes no randomness — the summon and merge draw order is untouched", () => {
    const s = rich();
    const after = tick(s, [upgrade(s, "arrow")]);
    expect(after.rng).toEqual(s.rng);
  });

  it("refuses exactly the families with no damage number", () => {
    expect(hasDamageAxis("arrow")).toBe(true);
    expect(hasDamageAxis("bulwark")).toBe(true);
    // Poison is the one status that IS damage, so Venom has an axis and the
    // three pure-control towers do not.
    expect(hasDamageAxis("venom")).toBe(true);
    expect(hasDamageAxis("frost")).toBe(false);
    expect(hasDamageAxis("hex")).toBe(false);
    expect(hasDamageAxis("rasp")).toBe(false);
  });
});

describe("the cost curve", () => {
  it("escalates so spreading and committing are different decisions", () => {
    const costs = Array.from({ length: FAMILY_UPGRADE_MAX_LEVEL }, (_, i) => familyUpgradeCost(i));
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    // Maxing one family costs several times what its first level did.
    const total = costs.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(FAMILY_UPGRADE_BASE_COST * 8);
  });

  it("is integer arithmetic, so it reproduces across engines", () => {
    for (let i = 0; i < FAMILY_UPGRADE_MAX_LEVEL; i++) {
      expect(Number.isInteger(familyUpgradeCost(i))).toBe(true);
    }
  });
});

describe("the bonus reaches the board", () => {
  /**
   * The damage stamped on the first shot an Arrow tower fires, at a given
   * family level.
   *
   * Measured on the projectile rather than on dead enemies: a tower that
   * one-shots everything in wave 1 kills exactly as many runners at level 5 as
   * at level 0, so a body count saturates and measures nothing. The number on
   * the shot is the thing the upgrade changes.
   *
   * The tower is placed by hand and the upgrade applied AFTER it is standing,
   * which is also the retroactive half of the requirement: the bonus has to
   * reach towers that already exist, not only ones summoned later.
   */
  function firstShotDamage(levels: number): number {
    let s = createInitialState(M0_LEVEL, ROSTER);
    const tileIndex = M0_LEVEL.terrain.tiles.findIndex((t) => t.class === "platform");
    const centre = tileCentre(M0_LEVEL.terrain.tiles[tileIndex].pos);

    s = {
      ...s,
      mana: 20000,
      towers: [{
        id: 900, towerId: "arrow", tileIndex, x: centre.x, y: centre.y,
        tier: 1, cooldown: 0, hp: 0, maxHp: 0, blocking: [], invested: 40,
        laneDist: nearestLaneDistance(buildPath(M0_LEVEL.terrain), centre),
      }],
    };
    for (let i = 0; i < levels; i++) s = tick(s, [upgrade(s, "arrow")]);

    for (let i = 0; i < 900; i++) {
      s = tick(s, []);
      if (s.projectiles.length > 0) return s.projectiles[0].damage;
    }
    throw new Error("the tower never fired");
  }

  it("makes an upgraded family hit harder, including towers already standing", () => {
    const base = firstShotDamage(0);
    expect(base).toBeGreaterThan(0);
    expect(firstShotDamage(1)).toBeGreaterThan(base);
    expect(firstShotDamage(FAMILY_UPGRADE_MAX_LEVEL)).toBeGreaterThan(firstShotDamage(1));
  });

  it("applies the family bonus on top of the tier scaling, not instead of it", () => {
    const base = firstShotDamage(0);
    for (const level of [1, 3, FAMILY_UPGRADE_MAX_LEVEL]) {
      expect(firstShotDamage(level)).toBe(Math.floor((base * familyDamagePct(level)) / 100));
    }
  });

  it("scales damage by the documented percentage", () => {
    expect(familyDamagePct(0)).toBe(100);
    expect(familyDamagePct(1)).toBe(115);
    expect(familyDamagePct(FAMILY_UPGRADE_MAX_LEVEL)).toBe(175);
  });

  it("reaches towers summoned after the upgrade too", () => {
    let s = rich(20000);
    for (let i = 0; i < FAMILY_UPGRADE_MAX_LEVEL; i++) s = tick(s, [upgrade(s, "arrow")]);
    // Summon until an arrow lands, then check the level applies to it.
    for (let i = 0; i < 40 && !s.towers.some((t) => t.towerId === "arrow"); i++) {
      s = tick(s, [{ tick: s.tick, kind: "summon", payload: {} }]);
    }
    const arrow = s.towers.find((t) => t.towerId === "arrow");
    expect(arrow).toBeDefined();
    expect(s.familyUpgradeLevels[arrow!.towerId]).toBe(FAMILY_UPGRADE_MAX_LEVEL);
  });
});

describe("merge interaction", () => {
  /**
   * A merge re-rolls the tower's type, so a merged tower can land in a family
   * the player has not upgraded — and that tension is deliberate. What must not
   * happen is a tower carrying its OLD family's level into its new type.
   */
  it("a merged tower reads the family it became, not the one it was", () => {
    let s = rich(20000);
    // Two arrows on the board, an upgraded arrow family, and a mortar family
    // left at zero.
    s = tick(s, [upgrade(s, "arrow"), upgrade(s, "arrow")]);
    expect(s.familyUpgradeLevels.arrow).toBe(2);

    const twoArrows: GameState = {
      ...s,
      towers: [0, 1].map((i) => ({
        id: 900 + i,
        towerId: "arrow",
        tileIndex: M0_LEVEL.terrain.tiles.findIndex((t, k) => t.class === "platform" && k > i * 3),
        x: 0, y: 0, tier: 1, cooldown: 0, hp: 0, maxHp: 0,
        blocking: [], invested: 40, laneDist: 0,
      })),
    };

    const merged = tick(twoArrows, [
      { tick: twoArrows.tick, kind: "merge", payload: { sourceId: 900, targetId: 901 } },
    ]);

    expect(merged.towers).toHaveLength(1);
    const result = merged.towers[0];
    expect(result.tier).toBe(2);
    // Whatever it rolled into, the level that applies is that family's level —
    // the state carries no per-tower copy of it at all.
    expect(merged.familyUpgradeLevels[result.towerId]).toBe(result.towerId === "arrow" ? 2 : 0);
  });
});
