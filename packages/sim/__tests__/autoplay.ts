/**
 * A scripted player. Not part of the sim — it only produces Inputs, exactly as
 * a human would, and every decision is a pure function of sim state so a run is
 * reproducible.
 *
 * Note on rosters: the pool holds 4 projectile, 3 melee and 4 status towers and
 * a roster is 5 DISTINCT entries, so a single-family roster is impossible by
 * construction. The suites therefore test *neglect* — a roster missing a family
 * entirely — which is the failure the enemy design is built to punish.
 */

import { createInitialState, tick } from "../src/tick.js";
import { mergePartners } from "../src/merge.js";
import { towerSpec } from "../src/towers.js";
import type { GameState, Input, LevelDef, TowerId } from "../src/types.js";

export type Policy = {
  /** Merge whenever a legal pair exists. Off = hoard, which tests the other side. */
  merge: boolean;
  /** Sell the weakest tower when the board is full and mana is piling up. */
  sellWhenFull: boolean;
};

export const DEFAULT_POLICY: Policy = { merge: true, sellWhenFull: true };

export type PlayResult = {
  final: GameState;
  inputLog: { tick: number; inputs: Input[] }[];
  ticks: number;
  summons: number;
  merges: number;
  sells: number;
  noRoom: number;
};

export function autoplay(
  level: LevelDef,
  roster: TowerId[],
  policy: Policy = DEFAULT_POLICY,
  maxTicks = 30 * 60 * 12,
): PlayResult {
  let s = createInitialState(level, roster);
  const inputLog: { tick: number; inputs: Input[] }[] = [];
  let ticks = 0;
  let summons = 0;
  let merges = 0;
  let sells = 0;
  let noRoom = 0;

  while (s.status !== "won" && s.status !== "lost" && ticks < maxTicks) {
    const inputs: Input[] = [];

    if (policy.merge) {
      for (const t of s.towers) {
        const partners = mergePartners(s, t.id);
        if (partners.length > 0) {
          inputs.push({
            tick: s.tick,
            kind: "merge",
            payload: { sourceId: partners[0], targetId: t.id },
          });
          merges++;
          break;
        }
      }
    }

    if (s.mana >= s.summonCost) {
      inputs.push({ tick: s.tick, kind: "summon", payload: {} });
      summons++;
    }

    if (
      policy.sellWhenFull &&
      s.towers.length >= s.level.terrain.tiles.length &&
      s.mana > s.summonCost * 2
    ) {
      const weakest = s.towers.slice().sort((a, b) => a.tier - b.tier || a.id - b.id)[0];
      if (weakest) {
        inputs.push({ tick: s.tick, kind: "sell", payload: { towerId: weakest.id } });
        sells++;
      }
    }

    if (inputs.length > 0) inputLog.push({ tick: s.tick, inputs });
    s = tick(s, inputs);
    noRoom += s.events.filter((e) => e.kind === "no_room").length;
    ticks++;
  }

  return { final: s, inputLog, ticks, summons, merges, sells, noRoom };
}

/** Replay a recorded input log from a fresh initial state. */
export function replay(
  level: LevelDef,
  roster: TowerId[],
  log: { tick: number; inputs: Input[] }[],
  ticks: number,
): GameState {
  let s = createInitialState(level, roster);
  for (let i = 0; i < ticks; i++) {
    const entry = log.find((e) => e.tick === s.tick);
    s = tick(s, entry ? entry.inputs : []);
  }
  return s;
}

/**
 * FNV-1a over the serialized state, excluding the level (constant per fixture)
 * and events (a per-tick UI channel, not run state).
 */
export function hashState(s: GameState): string {
  const { level: _level, events: _events, ...rest } = s;
  const json = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function familyOf(id: TowerId): string {
  return towerSpec(id).family;
}

// All rosters below are exactly 5 distinct entries.
export const MIXED: TowerId[] = ["arrow", "mortar", "bulwark", "frost", "rasp"];
export const BALANCED: TowerId[] = ["mortar", "tesla", "warden", "hex", "rasp"];
/** No melee at all — nothing stops a runner, nothing survives a brute rush. */
export const NO_MELEE: TowerId[] = ["arrow", "mortar", "lance", "tesla", "frost"];
/** No projectile at all — fliers cannot be touched. */
export const NO_PROJECTILE: TowerId[] = ["bulwark", "warden", "thorn", "frost", "rasp"];
/** Fair A/B against WITH_MELEE below: same damage density, melee swapped out. */
export const AB_NO_MELEE: TowerId[] = ["arrow", "mortar", "lance", "tesla", "rasp"];
/** Fair A/B against AB_NO_MELEE: one projectile slot traded for a blocker. */
export const AB_WITH_MELEE: TowerId[] = ["arrow", "mortar", "lance", "bulwark", "rasp"];
/** No status at all — armour and the boss go unanswered. */
export const NO_STATUS: TowerId[] = ["arrow", "mortar", "lance", "tesla", "bulwark"];
/** Four status towers and one blocker: force multipliers with nothing to multiply. */
export const STATUS_HEAVY: TowerId[] = ["frost", "venom", "hex", "rasp", "bulwark"];

/**
 * A fixed, scripted run used for the golden fixture. Unlike autoplay it makes
 * no decisions from state beyond legality, so the input log is stable and the
 * only thing that can change its hash is the sim itself.
 *
 * The roster is status-heavy on purpose. Status towers occupy platform tiles
 * and never die, so the 14 platforms fill and stay filled — after which further
 * platform draws fail with `no_room`, which is one of the cases §8 requires the
 * fixture to cover. A melee-heavy roster cannot do this reliably: blockers die
 * during waves and keep freeing their lane tiles.
 *
 * Counts come from emitted events, not from intent, so a summon that the sim
 * rejected is never counted as one that happened.
 */
export const GOLDEN_ROSTER: TowerId[] = ["frost", "venom", "hex", "rasp", "bulwark"];
export const GOLDEN_TICKS = 6000;

export function scriptedRun(level: LevelDef, roster: TowerId[], totalTicks: number) {
  let s = createInitialState(level, roster);
  const inputLog: { tick: number; inputs: Input[] }[] = [];
  let summons = 0;
  let merges = 0;
  let sells = 0;
  let noRoom = 0;
  let sold = false;
  let ticks = 0;

  for (let i = 0; i < totalTicks; i++) {
    if (s.status === "won" || s.status === "lost") break;
    const inputs: Input[] = [];

    if (s.tick % 40 === 0 && s.mana >= s.summonCost) {
      inputs.push({ tick: s.tick, kind: "summon", payload: {} });
    }
    if ((s.tick === 800 || s.tick === 1400) && s.towers.length > 1) {
      for (const t of s.towers) {
        const partners = mergePartners(s, t.id);
        if (partners.length > 0) {
          inputs.push({ tick: s.tick, kind: "merge", payload: { sourceId: partners[0], targetId: t.id } });
          break;
        }
      }
    }
    if (!sold && s.tick === 1100 && s.towers.length > 0) {
      inputs.push({ tick: s.tick, kind: "sell", payload: { towerId: s.towers[0].id } });
      sells++;
      sold = true;
    }

    if (inputs.length > 0) inputLog.push({ tick: s.tick, inputs });
    s = tick(s, inputs);
    ticks++;

    for (const e of s.events) {
      if (e.kind === "summoned") summons++;
      else if (e.kind === "no_room") noRoom++;
      else if (e.kind === "merged") merges++;
    }
  }

  return { final: s, inputLog, ticks, summons, merges, sells, noRoom };
}
