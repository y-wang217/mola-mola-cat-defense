"use client";

/**
 * The loop. CLAUDE.md §3: the sim runs at a fixed 30Hz and never sees a frame
 * duration. Real elapsed time is accumulated here, whole ticks are drained
 * from it, and the leftover becomes the interpolation alpha handed to the
 * renderer.
 *
 * Sim state lives in refs, never in React state (§10). React gets a small
 * derived snapshot, and only when something in it actually changed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInitialState,
  M0_LEVEL,
  MAX_TOWER_LEVEL,
  SELL_REFUND_PCT,
  TICKS_PER_SECOND,
  TOWER_SPECS,
  tick,
  upgradeCost,
} from "@siege/sim";
import type { GameState, Input, RunStatus, TowerKind } from "@siege/sim";
import { Renderer } from "./renderer";

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** If the tab was backgrounded, resume — don't simulate the missing minutes. */
const MAX_FRAME_MS = 250;

export type HudTower = {
  id: number;
  kind: TowerKind;
  level: number;
  slotIndex: number;
  upgradeCost: number;
  sellValue: number;
  canUpgrade: boolean;
};

export type Hud = {
  status: RunStatus;
  gold: number;
  lives: number;
  wave: number;
  waveCount: number;
  score: number;
  kills: number;
  leaks: number;
  towers: HudTower[];
};

function toHud(s: GameState): Hud {
  return {
    status: s.status,
    gold: s.gold,
    lives: s.lives,
    wave: Math.min(s.waveIndex + 1, s.level.waves.length),
    waveCount: s.level.waves.length,
    score: s.score,
    kills: s.kills,
    leaks: s.leaks,
    towers: s.towers.map((t) => ({
      id: t.id,
      kind: t.kind,
      level: t.level,
      slotIndex: t.slotIndex,
      upgradeCost: upgradeCost(t.kind, t.level + 1),
      sellValue: Math.floor((t.invested * SELL_REFUND_PCT) / 100),
      canUpgrade: t.level < MAX_TOWER_LEVEL,
    })),
  };
}

export function useGame(host: React.RefObject<HTMLDivElement | null>) {
  const stateRef = useRef<GameState>(createInitialState(M0_LEVEL));
  const prevRef = useRef<GameState>(stateRef.current);
  const pendingRef = useRef<Input[]>([]);
  const rendererRef = useRef<Renderer | null>(null);
  const hudJsonRef = useRef<string>("");

  const [hud, setHud] = useState<Hud>(() => toHud(stateRef.current));
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [selectedKind, setSelectedKind] = useState<TowerKind>("arrow");

  // --- renderer lifecycle ---
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let cancelled = false;
    const renderer = new Renderer();

    void renderer.init(el, stateRef.current).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      renderer.resize(el.clientWidth, el.clientHeight, stateRef.current);
    });

    const observer = new ResizeObserver(() => {
      rendererRef.current?.resize(el.clientWidth, el.clientHeight, stateRef.current);
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [host]);

  // --- the loop ---
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);

      const dt = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      acc += dt;

      while (acc >= TICK_MS) {
        prevRef.current = stateRef.current;
        stateRef.current = tick(stateRef.current, pendingRef.current);
        pendingRef.current = [];
        acc -= TICK_MS;
      }

      rendererRef.current?.draw(prevRef.current, stateRef.current, acc / TICK_MS);

      const next = toHud(stateRef.current);
      const json = JSON.stringify(next);
      if (json !== hudJsonRef.current) {
        hudJsonRef.current = json;
        setHud(next);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedTowerId);
  }, [selectedTowerId]);

  const enqueue = useCallback((make: (t: number) => Input) => {
    pendingRef.current.push(make(stateRef.current.tick));
  }, []);

  const tapSlot = useCallback(
    (slotIndex: number) => {
      const occupant = stateRef.current.towers.find((t) => t.slotIndex === slotIndex);
      if (occupant) {
        setSelectedTowerId((cur) => (cur === occupant.id ? null : occupant.id));
        return;
      }
      setSelectedTowerId(null);
      if (stateRef.current.gold < TOWER_SPECS[selectedKind].cost) return;
      enqueue((t) => ({ tick: t, kind: "place", payload: { slotIndex, tower: selectedKind } }));
    },
    [enqueue, selectedKind],
  );

  const upgradeSelected = useCallback(() => {
    const id = selectedTowerId;
    if (id === null) return;
    enqueue((t) => ({ tick: t, kind: "upgrade", payload: { towerId: id } }));
  }, [enqueue, selectedTowerId]);

  const sellSelected = useCallback(() => {
    const id = selectedTowerId;
    if (id === null) return;
    enqueue((t) => ({ tick: t, kind: "sell", payload: { towerId: id } }));
    setSelectedTowerId(null);
  }, [enqueue, selectedTowerId]);

  const startWave = useCallback(() => {
    enqueue((t) => ({ tick: t, kind: "start_wave", payload: {} }));
  }, [enqueue]);

  /**
   * The ten-seconds-after-a-loss retry is the loop M0 is testing, so restart
   * has to be one tap and instant.
   */
  const restart = useCallback(() => {
    const fresh = createInitialState(M0_LEVEL);
    stateRef.current = fresh;
    prevRef.current = fresh;
    pendingRef.current = [];
    setSelectedTowerId(null);
    hudJsonRef.current = "";
  }, []);

  return {
    hud,
    level: M0_LEVEL,
    selectedTowerId,
    selectedKind,
    setSelectedKind,
    tapSlot,
    upgradeSelected,
    sellSelected,
    startWave,
    restart,
  };
}
