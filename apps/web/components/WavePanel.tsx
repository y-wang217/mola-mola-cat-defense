"use client";

/**
 * What is coming next, and from where. ALWAYS ON.
 *
 * This is the cheapest agency in the genre: a player thinking about the next
 * wave is playing the game rather than watching it, and it is what makes the
 * enemy variety worth having at all. Without it the archetypes are a surprise
 * rather than a decision.
 *
 * It used to double as the break-window readout, counting down to the next
 * wave. The tempo patch deleted the break, so the information needed a
 * permanent home rather than a pause to live in: the strip now shows the
 * composition of the wave AFTER the one currently spawning, at all times.
 *
 * Written as glyphs, not sentences. The old version spelled out "enters top,
 * column 2" and prefixed every reading with a word; both are now an arrow and a
 * number, which is faster to read and survives a small screen.
 */

import { ENEMY_SPECS, M0_LEVEL } from "@siege/sim";
import type { EnemyKind } from "@siege/sim";

/** The lane enters off-board. An arrow plus a column is the whole message. */
function entryGlyph(): string {
  const [first, second] = M0_LEVEL.terrain.path;
  if (!first || !second) return "";
  if (first.y < 0) return `⬇${first.x + 1}`;
  if (first.y >= M0_LEVEL.terrain.height) return `⬆${first.x + 1}`;
  if (first.x < 0) return `➡${first.y + 1}`;
  return `⬅${first.y + 1}`;
}

export default function WavePanel({ waveIndex }: { waveIndex: number }) {
  // Waves are continuous, so "next" is always the one after the one spawning.
  const upcoming = waveIndex + 1;
  const wave = M0_LEVEL.waves[upcoming];

  if (!wave) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-950/90 px-3 py-1.5 ring-1 ring-slate-700">
        <span className="text-base" aria-label="final wave">
          🏁
        </span>
      </div>
    );
  }

  // Collapse spawn groups into one count per archetype.
  const counts = new Map<EnemyKind, number>();
  for (const g of wave.spawns) counts.set(g.kind, (counts.get(g.kind) ?? 0) + g.count);

  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-950/90 px-3 py-1.5 ring-1 ring-slate-700"
      aria-label={`wave ${upcoming + 1} incoming`}
    >
      <span className="num shrink-0 text-base font-bold text-slate-200">{upcoming + 1}▸</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {[...counts.entries()].map(([kind, n]) => (
          <span key={kind} className="whitespace-nowrap text-base text-slate-100">
            {ENEMY_SPECS[kind].icon}
            <span className="num text-slate-300">{n}</span>
          </span>
        ))}
      </span>
      <span className="num shrink-0 text-base text-slate-300">{entryGlyph()}</span>
    </div>
  );
}
