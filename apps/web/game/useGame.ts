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
  M0_LEVEL,
  MAX_TIER,
  ROSTER_SIZE,
  SELL_REFUND_PCT,
  TICKS_PER_SECOND,
  createInitialState,
  mergePartners,
  tick,
  towerSpec,
} from "@siege/sim";
import type { GameState, Input, RunStatus, TowerId } from "@siege/sim";
import { Renderer } from "./renderer";

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** If the tab was backgrounded, resume — don't simulate the missing minutes. */
const MAX_FRAME_MS = 250;
const MESSAGE_MS = 1800;

export type HudTower = {
  id: number;
  towerId: TowerId;
  name: string;
  family: string;
  tileIndex: number;
  tier: number;
  hp: number;
  maxHp: number;
  blocking: number;
  sellValue: number;
  canMerge: boolean;
};

export type Hud = {
  status: RunStatus;
  mana: number;
  summonCost: number;
  canAfford: boolean;
  lives: number;
  wave: number;
  waveCount: number;
  prepSeconds: number;
  score: number;
  kills: number;
  leaks: number;
  summonsUsed: number;
  towers: HudTower[];
  /** Ids the currently selected tower may merge with. Drives the highlight. */
  partners: number[];
};

function toHud(s: GameState, selectedId: number | null): Hud {
  return {
    status: s.status,
    mana: s.mana,
    summonCost: s.summonCost,
    canAfford: s.mana >= s.summonCost,
    lives: s.lives,
    wave: Math.min(s.waveIndex + 1, s.level.waves.length),
    waveCount: s.level.waves.length,
    prepSeconds: s.status === "prep" ? Math.ceil(s.prepRemaining / TICKS_PER_SECOND) : 0,
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
        family: spec.family,
        tileIndex: t.tileIndex,
        tier: t.tier,
        hp: t.hp,
        maxHp: t.maxHp,
        blocking: t.blocking.length,
        sellValue: Math.floor((t.invested * SELL_REFUND_PCT) / 100),
        canMerge: t.tier < MAX_TIER,
      };
    }),
    partners: selectedId === null ? [] : mergePartners(s, selectedId),
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
  const selectedRef = useRef<number | null>(null);

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

        const noRoom = stateRef.current.events.find((e) => e.kind === "no_room");
        if (noRoom && noRoom.kind === "no_room") {
          setMessage(`No room for ${towerSpec(noRoom.towerId).name} — sell something`);
          if (messageTimer) clearTimeout(messageTimer);
          messageTimer = setTimeout(() => setMessage(null), MESSAGE_MS);
        }
      }

      rendererRef.current?.draw(prevRef.current!, stateRef.current!, acc / TICK_MS);

      const next = toHud(stateRef.current!, selectedRef.current);
      rendererRef.current?.setPartners(next.partners);
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
  };
}
