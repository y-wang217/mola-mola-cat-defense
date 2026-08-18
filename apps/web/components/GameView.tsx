"use client";

import { useEffect, useRef, useState } from "react";
import { TOWER_SPECS } from "@siege/sim";
import type { TowerKind } from "@siege/sim";
import { useGame } from "@/game/useGame";
import Hud from "./Hud";

const TOWER_LABEL: Record<TowerKind, string> = { arrow: "Arrow", cannon: "Cannon" };
const TOWER_BLURB: Record<TowerKind, string> = {
  arrow: "Fast, single target. Struggles against armour.",
  cannon: "Slow, splash, big hits. Struggles against speed.",
};

/** Track an element's pixel size so the slot overlay can match the canvas. */
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export default function GameView() {
  const host = useRef<HTMLDivElement | null>(null);
  const game = useGame(host);
  const { hud, level } = game;
  const { width, height } = useElementSize(host);

  const occupiedBySlot = new Map(hud.towers.map((t) => [t.slotIndex, t]));

  // The renderer letterboxes the board inside whatever space it is given
  // (see Renderer.resize). Repeat that math here so the DOM hit targets land
  // exactly on the drawn slots at any viewport size.
  const pxPerTile = Math.min(width / level.terrain.width, height / level.terrain.height);
  const offsetX = (width - pxPerTile * level.terrain.width) / 2;
  const offsetY = (height - pxPerTile * level.terrain.height) / 2;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <Hud hud={hud} />

      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0 overflow-hidden rounded-xl" />

        {/* Slot hit targets are DOM, not canvas: real tap targets, focusable,
            and positioned by the same grid the sim uses. */}
        <div className="absolute inset-0">
          {level.terrain.slots.map((slot, i) => {
            const tower = occupiedBySlot.get(i);
            const selected = tower && tower.id === game.selectedTowerId;
            const affordable = hud.gold >= TOWER_SPECS[game.selectedKind].cost;
            return (
              <button
                key={i}
                onClick={() => game.tapSlot(i)}
                aria-label={
                  tower
                    ? `${TOWER_LABEL[tower.kind]} level ${tower.level}`
                    : `Empty slot ${i + 1}`
                }
                className={[
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg transition",
                  selected ? "ring-2 ring-sky-300" : "",
                  !tower && !affordable ? "opacity-40" : "",
                ].join(" ")}
                style={{
                  left: offsetX + (slot.x + 0.5) * pxPerTile,
                  top: offsetY + (slot.y + 0.5) * pxPerTile,
                  width: pxPerTile * 0.86,
                  height: pxPerTile * 0.86,
                }}
              />
            );
          })}
        </div>

        {(hud.status === "won" || hud.status === "lost") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl bg-slate-950/85 backdrop-blur-sm">
            <p className="text-3xl font-semibold">
              {hud.status === "won" ? "Held the line" : "Overrun"}
            </p>
            <p className="text-sm text-slate-400">
              Wave {hud.wave}/{hud.waveCount} · {hud.kills} killed · {hud.leaks} leaked
            </p>
            <p className="text-2xl tabular-nums">{hud.score.toLocaleString()}</p>
            <button
              onClick={game.restart}
              className="rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-slate-950 active:bg-sky-400"
            >
              Again
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(TOWER_SPECS) as TowerKind[]).map((kind) => {
            const active = game.selectedKind === kind;
            const affordable = hud.gold >= TOWER_SPECS[kind].cost;
            return (
              <button
                key={kind}
                onClick={() => game.setSelectedKind(kind)}
                className={[
                  "rounded-lg border px-3 py-2 text-left transition",
                  active ? "border-sky-400 bg-sky-500/10" : "border-slate-700 bg-slate-900",
                  affordable ? "" : "opacity-50",
                ].join(" ")}
              >
                <span className="flex items-baseline justify-between">
                  <span className="font-semibold">{TOWER_LABEL[kind]}</span>
                  <span className="tabular-nums text-amber-300">{TOWER_SPECS[kind].cost}g</span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                  {TOWER_BLURB[kind]}
                </span>
              </button>
            );
          })}
        </div>

        {game.selectedTowerId !== null &&
          (() => {
            const t = hud.towers.find((x) => x.id === game.selectedTowerId);
            if (!t) return null;
            return (
              <div className="flex gap-2">
                <button
                  disabled={!t.canUpgrade || hud.gold < t.upgradeCost}
                  onClick={game.upgradeSelected}
                  className="flex-1 rounded-lg bg-slate-800 px-3 py-3 font-medium disabled:opacity-40"
                >
                  {t.canUpgrade ? `Upgrade → L${t.level + 1} · ${t.upgradeCost}g` : "Max level"}
                </button>
                <button
                  onClick={game.sellSelected}
                  className="rounded-lg bg-slate-800 px-4 py-3 font-medium text-slate-300"
                >
                  Sell {t.sellValue}g
                </button>
              </div>
            );
          })()}

        {hud.status === "building" && (
          <button
            onClick={game.startWave}
            className="rounded-lg bg-emerald-500 px-4 py-3.5 text-base font-semibold text-slate-950 active:bg-emerald-400"
          >
            Start wave {hud.wave}
          </button>
        )}
        {hud.status === "wave" && (
          <p className="py-3 text-center text-sm text-slate-500">
            Wave {hud.wave} incoming — you can still build
          </p>
        )}
      </div>
    </div>
  );
}
