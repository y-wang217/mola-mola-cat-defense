"use client";

/**
 * What is coming next, and from where.
 *
 * This is the cheapest agency in the genre: a player thinking about the next
 * wave is playing the game rather than watching it, and it is what makes the
 * enemy variety worth having at all. Without it the archetypes are a surprise
 * rather than a decision.
 */

import { ENEMY_SPECS, M0_LEVEL } from "@siege/sim";
import type { EnemyKind } from "@siege/sim";

/** The lane enters off-board; say which edge so the player knows where to look. */
function entryLabel(): string {
  const [first, second] = M0_LEVEL.terrain.path;
  if (!first || !second) return "";
  if (first.y < 0) return `enters top, column ${first.x + 1}`;
  if (first.y >= M0_LEVEL.terrain.height) return `enters bottom, column ${first.x + 1}`;
  if (first.x < 0) return `enters left, row ${first.y + 1}`;
  return `enters right, row ${first.y + 1}`;
}

export default function WavePanel({
  waveIndex,
  status,
  prepSeconds,
}: {
  waveIndex: number;
  status: string;
  prepSeconds: number;
}) {
  // In prep the upcoming wave is the current index; mid-wave, look one ahead.
  const upcoming = status === "prep" ? waveIndex : waveIndex + 1;
  const wave = M0_LEVEL.waves[upcoming];
  if (!wave) {
    return (
      <div className="rounded-lg bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-500">
        Final wave — nothing further incoming.
      </div>
    );
  }

  // Collapse spawn groups into one count per archetype.
  const counts = new Map<EnemyKind, number>();
  for (const g of wave.spawns) counts.set(g.kind, (counts.get(g.kind) ?? 0) + g.count);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-1.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
        {status === "prep" ? `In ${prepSeconds}s` : "Next"}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        {[...counts.entries()].map(([kind, n]) => (
          <span key={kind} className="whitespace-nowrap text-xs text-slate-300">
            {ENEMY_SPECS[kind].icon}
            <span className="tabular-nums text-slate-400">×{n}</span>
          </span>
        ))}
      </span>
      <span className="shrink-0 text-[10px] text-slate-500">{entryLabel()}</span>
    </div>
  );
}
