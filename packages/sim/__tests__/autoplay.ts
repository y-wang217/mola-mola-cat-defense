/**
 * A scripted player, used by the tests to drive whole runs. Not part of the
 * sim — it only produces Inputs, exactly as a human would.
 */

import { createInitialState, tick } from "../src/tick.js";
import { TOWER_SPECS, upgradeCost } from "../src/content.js";
import type { GameState, Input, LevelDef, TowerKind } from "../src/types.js";

export type Buy = { slot: number; tower: TowerKind };

export type PlayResult = {
  final: GameState;
  inputLog: { tick: number; inputs: Input[] }[];
  ticks: number;
};

/**
 * Play a level to completion with a fixed build order, buying what is
 * affordable between waves and spending the surplus on upgrades.
 */
export function autoplay(level: LevelDef, plan: Buy[], maxTicks = 30 * 60 * 12): PlayResult {
  let s = createInitialState(level);
  const inputLog: { tick: number; inputs: Input[] }[] = [];
  let planIdx = 0;
  let ticks = 0;

  while (s.status !== "won" && s.status !== "lost" && ticks < maxTicks) {
    const inputs: Input[] = [];

    if (s.status === "building") {
      let budget = s.gold;
      while (planIdx < plan.length && budget >= TOWER_SPECS[plan[planIdx].tower].cost) {
        const b = plan[planIdx];
        inputs.push({ tick: s.tick, kind: "place", payload: { slotIndex: b.slot, tower: b.tower } });
        budget -= TOWER_SPECS[b.tower].cost;
        planIdx++;
      }
      for (const t of s.towers) {
        const cost = upgradeCost(t.kind, t.level + 1);
        // Hold back enough for one more tower before upgrading.
        if (t.level < 3 && budget >= cost + 90) {
          inputs.push({ tick: s.tick, kind: "upgrade", payload: { towerId: t.id } });
          budget -= cost;
        }
      }
      inputs.push({ tick: s.tick, kind: "start_wave", payload: {} });
    }

    if (inputs.length > 0) inputLog.push({ tick: s.tick, inputs });
    s = tick(s, inputs);
    ticks++;
  }

  return { final: s, inputLog, ticks };
}

/** Replay a recorded input log from a fresh initial state. */
export function replay(level: LevelDef, log: { tick: number; inputs: Input[] }[], ticks: number): GameState {
  let s = createInitialState(level);
  for (let i = 0; i < ticks; i++) {
    const entry = log.find((e) => e.tick === s.tick);
    s = tick(s, entry ? entry.inputs : []);
  }
  return s;
}

export const MIXED: Buy[] = [
  { slot: 4, tower: "arrow" }, { slot: 7, tower: "arrow" },
  { slot: 5, tower: "cannon" }, { slot: 8, tower: "cannon" },
  { slot: 10, tower: "arrow" }, { slot: 1, tower: "arrow" },
  { slot: 11, tower: "cannon" }, { slot: 0, tower: "arrow" },
];

export const ALL_ARROW: Buy[] = [4, 7, 5, 8, 10, 1, 11, 0].map((slot) => ({ slot, tower: "arrow" as const }));
export const ALL_CANNON: Buy[] = [4, 7, 5, 8, 10, 11].map((slot) => ({ slot, tower: "cannon" as const }));
