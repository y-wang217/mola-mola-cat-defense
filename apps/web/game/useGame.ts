"use client";

/**
 * The loop. CLAUDE.md §3: the sim runs at a fixed 30Hz and never sees a frame
 * duration. Real elapsed time is accumulated here, whole ticks are drained from
 * it, and the leftover becomes the interpolation alpha handed to the renderer.
 *
 * Sim state lives in refs, never in React state (§10). React gets a small
 * derived snapshot, and only when something in it actually changed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FAMILY_UPGRADE_MAX_LEVEL,
  GAME_SPEED_MULTIPLIER,
  MAX_LIVES,
  MAX_TIER,
  M0_LEVEL,
  ROSTER_SIZE,
  SELL_REFUND_PCT,
  TICKS_PER_SECOND,
  createInitialState,
  familyUpgradeCost,
  hasDamageAxis,
  mergePartners,
  tick,
  towerSpec,
} from "@siege/sim";
import type { GameState, Input, RunStatus, TowerId } from "@siege/sim";
import { Renderer } from "./renderer";
import { play } from "./audio";

/**
 * Wall-clock milliseconds per sim tick.
 *
 * This is where the global 2x lives. The sim's tick rate is still a fixed 30Hz
 * and every stat in it is still denominated in ticks; the driver simply drains
 * GAME_SPEED_MULTIPLIER ticks per 1/30s of real time. Nothing inside the sim
 * knows, determinism is untouched, and a replay recorded at one speed
 * reproduces byte-identically at another.
 */
const TICK_MS = 1000 / (TICKS_PER_SECOND * GAME_SPEED_MULTIPLIER);
/** If the tab was backgrounded, resume — don't simulate the missing minutes. */
const MAX_FRAME_MS = 250;
const MESSAGE_MS = 1800;

export type HudTower = {
  id: number;
  towerId: TowerId;
  name: string;
  icon: string;
  family: string;
  tileIndex: number;
  tier: number;
  hp: number;
  maxHp: number;
  blocking: number;
  sellValue: number;
  canMerge: boolean;
  /** Has a legal merge partner on the board right now. Drives the tile badge. */
  hasPartner: boolean;
};

/**
 * One roster slot, as the upgrade row needs it.
 *
 * "Family" here means the tower TYPE — the brief's sense, one per roster slot.
 * `upgradable` is false for the pure-control towers, which have no damage
 * number for the bonus to scale: the button is shown but visibly inert rather
 * than charging for nothing.
 */
export type HudFamily = {
  towerId: TowerId;
  icon: string;
  family: string;
  level: number;
  maxLevel: number;
  cost: number;
  affordable: boolean;
  upgradable: boolean;
  /** Towers of this type on the board right now. Nothing to multiply at zero. */
  onBoard: number;
};

export type Hud = {
  status: RunStatus;
  mana: number;
  summonCost: number;
  canAfford: boolean;
  lives: number;
  maxLives: number;
  wave: number;
  waveCount: number;
  score: number;
  kills: number;
  leaks: number;
  summonsUsed: number;
  towers: HudTower[];
  /** Ids the currently selected tower may merge with. Drives the highlight. */
  partners: number[];
  /** Every tower with a partner, whether or not anything is selected. */
  mergeableIds: number[];
  /** How many merges could be performed right now. Zero hides the counter. */
  mergesAvailable: number;
  /** The five roster slots, with their upgrade state. */
  families: HudFamily[];
};

/**
 * Merge availability, computed once per snapshot rather than per tower.
 *
 * A "merge available" is a PAIR, so three identical tier-1 towers are one
 * merge, not three. Counting partners instead would tell the player they have
 * more moves than they do.
 */
function mergeability(s: GameState): { ids: number[]; count: number } {
  const groups = new Map<string, number[]>();
  for (const t of s.towers) {
    if (t.tier >= MAX_TIER) continue;
    const key = `${t.towerId}:${t.tier}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(t.id);
    else groups.set(key, [t.id]);
  }

  const ids: number[] = [];
  let count = 0;
  // Iterated in insertion order, which is tower order — this is render-side, so
  // it only has to be stable, not part of the replay contract.
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    ids.push(...bucket);
    count += Math.floor(bucket.length / 2);
  }
  return { ids, count };
}

function toHud(s: GameState, selectedId: number | null): Hud {
  const { ids: mergeableIds, count: mergesAvailable } = mergeability(s);
  return {
    status: s.status,
    mana: s.mana,
    summonCost: s.summonCost,
    canAfford: s.mana >= s.summonCost,
    lives: s.lives,
    maxLives: MAX_LIVES,
    wave: Math.min(s.waveIndex + 1, s.level.waves.length),
    waveCount: s.level.waves.length,
    score: s.score,
    kills: s.kills,
    leaks: s.leaks,
    summonsUsed: s.summonsUsed,
    towers: s.towers.map((t) => {
      const spec = towerSpec(t.towerId);
      return {
        id: t.id,
        towerId: t.towerId,
        name: spec.name,
        icon: spec.icon,
        family: spec.family,
        tileIndex: t.tileIndex,
        tier: t.tier,
        hp: t.hp,
        maxHp: t.maxHp,
        blocking: t.blocking.length,
        sellValue: Math.floor((t.invested * SELL_REFUND_PCT) / 100),
        canMerge: t.tier < MAX_TIER,
        hasPartner: mergeableIds.includes(t.id),
      };
    }),
    partners: selectedId === null ? [] : mergePartners(s, selectedId),
    mergeableIds,
    mergesAvailable,
    families: s.roster.map((id) => {
      const level = s.familyUpgradeLevels[id] ?? 0;
      const maxed = level >= FAMILY_UPGRADE_MAX_LEVEL;
      const cost = familyUpgradeCost(level);
      return {
        towerId: id,
        icon: towerSpec(id).icon,
        family: towerSpec(id).family,
        level,
        maxLevel: FAMILY_UPGRADE_MAX_LEVEL,
        cost,
        affordable: s.mana >= cost,
        upgradable: hasDamageAxis(id) && !maxed,
        onBoard: s.towers.filter((t) => t.towerId === id).length,
      };
    }),
  };
}

export function useGame(host: React.RefObject<HTMLDivElement | null>) {
  const [phase, setPhase] = useState<"roster" | "run">("roster");
  const [roster, setRoster] = useState<TowerId[]>([]);

  const stateRef = useRef<GameState | null>(null);
  const prevRef = useRef<GameState | null>(null);
  const pendingRef = useRef<Input[]>([]);
  const rendererRef = useRef<Renderer | null>(null);
  const hudJsonRef = useRef<string>("");
  const floatersRef = useRef<{ amount: number; x: number; y: number; age: number; life: number }[]>([]);
  const selectedRef = useRef<number | null>(null);
  /**
   * Merges we asked for, oldest first. The sim's `merged` event says what the
   * result rolled into but not which two towers made it, and the render needs
   * both source positions to converge them. Pairing our own requests with the
   * events they produced is cheaper than widening the event.
   */
  const mergeQueueRef = useRef<{ sourceId: number; targetId: number }[]>([]);

  const [hud, setHud] = useState<Hud | null>(null);
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    selectedRef.current = selectedTowerId;
    rendererRef.current?.setSelected(selectedTowerId);
  }, [selectedTowerId]);

  /** Leave the roster screen and start a run. */
  const startRun = useCallback((chosen: TowerId[]) => {
    if (chosen.length !== ROSTER_SIZE) return;
    const fresh = createInitialState(M0_LEVEL, chosen);
    stateRef.current = fresh;
    prevRef.current = fresh;
    pendingRef.current = [];
    floatersRef.current = [];
    mergeQueueRef.current = [];
    hudJsonRef.current = "";
    setRoster(chosen);
    setSelectedTowerId(null);
    setMessage(null);
    setHud(toHud(fresh, null));
    setPhase("run");
  }, []);

  /** Back to the roster screen with the previous picks kept. This is the retry
   *  loop: one tap to replay the same plan, or change it. */
  const backToRoster = useCallback(() => {
    setPhase("roster");
    setSelectedTowerId(null);
    setMessage(null);
  }, []);

  // --- renderer lifecycle ---
  useEffect(() => {
    if (phase !== "run") return;
    const el = host.current;
    if (!el) return;

    let cancelled = false;
    const renderer = new Renderer();
    const state = stateRef.current;
    if (!state) return;

    void renderer.init(el, state).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      renderer.setSelected(selectedRef.current);
      renderer.resize(el.clientWidth, el.clientHeight, state);
    });

    const observer = new ResizeObserver(() => {
      const s = stateRef.current;
      if (s) rendererRef.current?.resize(el.clientWidth, el.clientHeight, s);
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [phase, host]);

  // --- the loop ---
  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let messageTimer: ReturnType<typeof setTimeout> | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const state = stateRef.current;
      if (!state) return;

      const dt = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      acc += dt;

      while (acc >= TICK_MS) {
        prevRef.current = stateRef.current;
        stateRef.current = tick(stateRef.current!, pendingRef.current);
        pendingRef.current = [];
        acc -= TICK_MS;

        const before = prevRef.current!;
        const after = stateRef.current!;

        // A leak is the single most important event in the game and it used to
        // be invisible. The bar shakes and shatters on its own (LivesBar reads
        // the number); the cue is fired here so it happens once per tick that
        // cost lives, not once per re-render.
        if (after.lives < before.lives) {
          play(after.lives <= 0 ? "leak_fatal" : "leak");
        }

        // Bounty floaters are collected per drained tick, so a slow frame that
        // advances the sim twice never swallows one.
        for (const ev of after.events) {
          if (ev.kind === "bounty") {
            floatersRef.current.push({ amount: ev.amount, x: ev.x, y: ev.y, age: 0, life: 1.4 });
          } else if (ev.kind === "wave_start") {
            // With no break to mark it, the wave boundary needs its own
            // signalling or it passes unnoticed: the counter pops (Hud), the
            // spawn edge sweeps (Renderer), and this is the cue.
            play("wave");
            rendererRef.current?.playWaveStart();
          } else if (ev.kind === "family_upgraded") {
            // Every tower of the family pulses at once. Without the board-wide
            // reaction this is indistinguishable from upgrading one tower.
            play("upgrade");
            rendererRef.current?.playFamilyPulse(ev.towerId);
          } else if (ev.kind === "summoned") {
            play("summon");
          } else if (ev.kind === "merged") {
            const pair = mergeQueueRef.current.shift();
            const source = pair && before.towers.find((t) => t.id === pair.sourceId);
            const target = pair && before.towers.find((t) => t.id === pair.targetId);
            if (source && target) {
              rendererRef.current?.playMerge({
                fromX: source.x,
                fromY: source.y,
                toX: target.x,
                toY: target.y,
                icon: towerSpec(ev.towerId).icon,
                tier: ev.tier,
              });
            }
            play("merge");
          }
        }

        const noRoom = after.events.find((e) => e.kind === "no_room");
        if (noRoom && noRoom.kind === "no_room") {
          play("denied");
          setMessage(`${towerSpec(noRoom.towerId).icon}🚫`);
          if (messageTimer) clearTimeout(messageTimer);
          messageTimer = setTimeout(() => setMessage(null), MESSAGE_MS);
        }
      }

      const dtSeconds = dt / 1000;
      for (const f of floatersRef.current) f.age += dtSeconds;
      floatersRef.current = floatersRef.current.filter((f) => f.age < f.life);

      // Floaters first: draw() issues the actual render call, so updating them
      // afterwards would show them one frame stale.
      rendererRef.current?.drawFloaters(floatersRef.current);
      rendererRef.current?.draw(prevRef.current!, stateRef.current!, acc / TICK_MS);

      const next = toHud(stateRef.current!, selectedRef.current);
      rendererRef.current?.setPartners(next.partners);
      rendererRef.current?.setMergeable(next.mergeableIds);
      const json = JSON.stringify(next);
      if (json !== hudJsonRef.current) {
        hudJsonRef.current = json;
        setHud(next);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (messageTimer) clearTimeout(messageTimer);
    };
  }, [phase]);

  const enqueue = useCallback((make: (t: number) => Input) => {
    const s = stateRef.current;
    if (s) pendingRef.current.push(make(s.tick));
  }, []);

  const summon = useCallback(() => {
    enqueue((t) => ({ tick: t, kind: "summon", payload: {} }));
  }, [enqueue]);

  /**
   * Tapping a tower selects it and lights up every legal merge partner; tapping
   * a lit partner performs the merge. Chosen over drag because it reuses the
   * DOM hit targets and works properly on touch.
   */
  const tapTower = useCallback(
    (towerId: number) => {
      const s = stateRef.current;
      if (!s) return;
      const selected = selectedRef.current;
      if (selected !== null && selected !== towerId) {
        if (mergePartners(s, selected).includes(towerId)) {
          mergeQueueRef.current.push({ sourceId: selected, targetId: towerId });
          enqueue((t) => ({
            tick: t,
            kind: "merge",
            payload: { sourceId: selected, targetId: towerId },
          }));
          setSelectedTowerId(null);
          return;
        }
      }
      setSelectedTowerId((cur) => (cur === towerId ? null : towerId));
    },
    [enqueue],
  );

  const upgradeFamily = useCallback(
    (towerId: TowerId) => {
      enqueue((t) => ({ tick: t, kind: "family_upgrade", payload: { towerId } }));
    },
    [enqueue],
  );

  const sellSelected = useCallback(() => {
    const id = selectedRef.current;
    if (id === null) return;
    enqueue((t) => ({ tick: t, kind: "sell", payload: { towerId: id } }));
    setSelectedTowerId(null);
  }, [enqueue]);

  return {
    phase,
    roster,
    level: M0_LEVEL,
    hud,
    message,
    selectedTowerId,
    startRun,
    backToRoster,
    summon,
    tapTower,
    sellSelected,
    upgradeFamily,
  };
}
