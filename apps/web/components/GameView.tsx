"use client";

import { useEffect, useRef, useState } from "react";
import { TOWER_POOL } from "@siege/sim";
import type { TowerId } from "@siege/sim";
import { useGame } from "@/game/useGame";
import Hud from "./Hud";
import RosterSelect from "./RosterSelect";
import WavePanel from "./WavePanel";

/** Family stays a colour cue, but as a border — emoji cannot be tinted. */
const FAMILY_DOT: Record<string, string> = {
  projectile: "border-sky-400",
  melee: "border-amber-400",
  status: "border-violet-400",
};

/**
 * Every interactive target is at least this many CSS px on both axes.
 *
 * The board's tiles are smaller than this on a phone, so tower targets are
 * deliberately allowed to exceed their tile and overlap slightly. A tap landing
 * on a neighbour is a smaller problem than a tap landing on nothing.
 */
const MIN_TARGET_PX = 44;

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
  const targetPx = Math.max(MIN_TARGET_PX, pxPerTile * 0.92);

  const selected = hud.towers.find((t) => t.id === game.selectedTowerId);
  const over = hud.status === "won" || hud.status === "lost";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <Hud hud={hud} />
      <WavePanel waveIndex={hud.wave - 1} />

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
                  width: targetPx,
                  height: targetPx,
                }}
              />
            );
          })}
        </div>

        {game.message && (
          <div className="pointer-events-none absolute inset-x-2 top-2 rounded-lg bg-slate-950/95 px-3 py-2 text-center text-2xl ring-1 ring-amber-400/60">
            {game.message}
          </div>
        )}

        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl bg-slate-950/90 backdrop-blur-sm">
            <p className="text-6xl" aria-label={hud.status === "won" ? "run won" : "run lost"}>
              {hud.status === "won" ? "🏆" : "💀"}
            </p>
            <p className="num flex flex-wrap justify-center gap-x-4 text-base text-slate-200">
              <span>🌊{hud.wave}</span>
              <span>💀{hud.kills}</span>
              <span>💔{hud.leaks}</span>
              <span>✨{hud.summonsUsed}</span>
            </p>
            <p className="num text-3xl font-bold">{hud.score.toLocaleString()}</p>
            <button
              onClick={game.backToRoster}
              aria-label="play again"
              className="min-h-[56px] min-w-[96px] rounded-lg bg-sky-500 px-6 text-3xl text-slate-950 active:bg-sky-400"
            >
              🔄
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        {/* The roster stays on screen: the player has to be able to reason
            about what the next summon might be. Emoji only — the names were
            unreadable at this size and carried nothing the glyph does not. */}
        <div className="flex gap-1">
          {game.roster.map((id: TowerId) => {
            const spec = TOWER_POOL.find((t) => t.id === id);
            if (!spec) return null;
            return (
              <div
                key={id}
                aria-label={spec.name}
                className={`flex min-h-[44px] flex-1 items-center justify-center rounded-md border-b-2 bg-slate-900 text-2xl ${FAMILY_DOT[spec.family]}`}
              >
                {spec.icon}
              </div>
            );
          })}
        </div>

        {selected && (
          <div className="flex items-center gap-2">
            <div className="num flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg bg-slate-900 px-3 text-base ring-1 ring-slate-700">
              <span className="text-2xl" aria-label={selected.name}>
                {selected.icon}
              </span>
              <span className="font-bold text-slate-50" aria-label="tier">
                ★{selected.tier}
              </span>
              {selected.maxHp > 0 && (
                <span className="text-emerald-300" aria-label="hit points">
                  ❤{selected.hp}
                </span>
              )}
              {selected.blocking > 0 && (
                <span className="text-amber-300" aria-label="blocking">
                  🛑{selected.blocking}
                </span>
              )}
              {hud.partners.length > 0 && (
                <span className="ml-auto text-emerald-300" aria-label="merge partners">
                  🔁{hud.partners.length}
                </span>
              )}
            </div>
            <button
              onClick={game.sellSelected}
              aria-label={`sell for ${selected.sellValue} mana`}
              className="num flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-4 text-base font-semibold text-slate-100 ring-1 ring-slate-600"
            >
              💰{selected.sellValue}
            </button>
          </div>
        )}

        <button
          onClick={game.summon}
          disabled={!hud.canAfford || over}
          aria-label={`summon for ${hud.summonCost} mana`}
          className="num flex min-h-[56px] items-center justify-between rounded-lg bg-emerald-500 px-5 text-2xl font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
        >
          <span aria-hidden>✨</span>
          <span aria-hidden>💧{hud.summonCost}</span>
        </button>
      </div>
    </div>
  );
}
