"use client";

import { useEffect, useRef, useState } from "react";
import { TOWER_POOL, towerSpec } from "@siege/sim";
import type { TowerId } from "@siege/sim";
import { useGame } from "@/game/useGame";
import Hud from "./Hud";
import RosterSelect from "./RosterSelect";

const FAMILY_DOT: Record<string, string> = {
  projectile: "bg-sky-400",
  melee: "bg-amber-400",
  status: "bg-violet-400",
};

/**
 * Track an element's pixel size so the tower overlay can match the canvas.
 *
 * `key` re-runs the effect when the element is mounted or replaced. Without it
 * the observer attaches once at mount — when the roster screen is showing and
 * the board does not exist — so it never measures and every hit target is
 * sized zero.
 */
function useElementSize(ref: React.RefObject<HTMLElement | null>, key: string) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, key]);
  return size;
}

export default function GameView() {
  const host = useRef<HTMLDivElement | null>(null);
  const game = useGame(host);
  const { width, height } = useElementSize(host, game.phase);
  const { hud, level } = game;

  if (game.phase === "roster") {
    return <RosterSelect initial={game.roster} onStart={game.startRun} />;
  }
  if (!hud) return <div className="flex-1" />;

  // The renderer letterboxes the board inside whatever space it is given (see
  // Renderer.resize). Repeat that math so DOM hit targets land on the drawn
  // towers at any viewport size.
  const pxPerTile = Math.min(width / level.terrain.width, height / level.terrain.height);
  const offsetX = (width - pxPerTile * level.terrain.width) / 2;
  const offsetY = (height - pxPerTile * level.terrain.height) / 2;

  const selected = hud.towers.find((t) => t.id === game.selectedTowerId);
  const over = hud.status === "won" || hud.status === "lost";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <Hud hud={hud} />

      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0 overflow-hidden rounded-xl" />

        {/* Only towers are tappable. There are deliberately no empty-tile
            targets: the player cannot choose where a summon lands. */}
        <div className="absolute inset-0">
          {hud.towers.map((t) => {
            const tile = level.terrain.tiles[t.tileIndex];
            const isPartner = hud.partners.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => game.tapTower(t.id)}
                aria-label={`${t.name} tier ${t.tier}${isPartner ? ", can merge" : ""}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg"
                style={{
                  left: offsetX + (tile.pos.x + 0.5) * pxPerTile,
                  top: offsetY + (tile.pos.y + 0.5) * pxPerTile,
                  width: pxPerTile * 0.9,
                  height: pxPerTile * 0.9,
                }}
              />
            );
          })}
        </div>

        {game.message && (
          <div className="pointer-events-none absolute inset-x-2 top-2 rounded-lg bg-slate-800/95 px-3 py-2 text-center text-sm text-amber-200">
            {game.message}
          </div>
        )}

        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl bg-slate-950/85 backdrop-blur-sm">
            <p className="text-3xl font-semibold">
              {hud.status === "won" ? "Held the line" : "Overrun"}
            </p>
            <p className="text-sm text-slate-400">
              Wave {hud.wave}/{hud.waveCount} · {hud.kills} killed · {hud.leaks} leaked ·{" "}
              {hud.summonsUsed} summons
            </p>
            <p className="text-2xl tabular-nums">{hud.score.toLocaleString()}</p>
            <button
              onClick={game.backToRoster}
              className="rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-slate-950 active:bg-sky-400"
            >
              Again
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        {/* The roster stays on screen: the player has to be able to reason
            about what the next summon might be. */}
        <div className="flex gap-1">
          {game.roster.map((id: TowerId) => {
            const spec = TOWER_POOL.find((t) => t.id === id);
            if (!spec) return null;
            return (
              <div
                key={id}
                className="flex flex-1 items-center gap-1 rounded-md bg-slate-900 px-1.5 py-1"
                title={spec.blurb}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${FAMILY_DOT[spec.family]}`} />
                <span className="truncate text-[11px] text-slate-300">{spec.name}</span>
              </div>
            );
          })}
        </div>

        {selected ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg bg-slate-900 px-3 py-2">
              <p className="truncate text-sm font-semibold">
                {selected.name} · tier {selected.tier}
              </p>
              <p className="text-[11px] text-slate-400">
                {hud.partners.length > 0
                  ? `Tap a highlighted tower to merge — the result re-rolls`
                  : selected.family === "melee"
                    ? `Holding ${selected.blocking} · ${selected.hp}/${selected.maxHp} hp`
                    : towerSpec(selected.towerId).blurb}
              </p>
            </div>
            <button
              onClick={game.sellSelected}
              className="shrink-0 rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300"
            >
              Sell {selected.sellValue}
            </button>
          </div>
        ) : (
          <p className="px-1 py-1 text-[11px] leading-snug text-slate-500">
            Tap a tower to select it. Two of the same type and tier can merge —
            tier goes up, the type re-rolls.
          </p>
        )}

        <button
          onClick={game.summon}
          disabled={!hud.canAfford || over}
          className="flex items-center justify-between rounded-lg bg-emerald-500 px-5 py-3.5 text-base font-semibold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
        >
          <span>Summon</span>
          <span className="tabular-nums">{hud.summonCost} mana</span>
        </button>
      </div>
    </div>
  );
}
