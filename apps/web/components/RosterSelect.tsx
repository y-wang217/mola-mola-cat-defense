"use client";

/**
 * Roster construction, before the run.
 *
 * This is where the strategy lives. Placement and type are random once the run
 * starts, so choosing these five is the player's real decision — and the five
 * are the entire draw pool, which is why they stay on screen during the run.
 */

import { useState } from "react";
import { ROSTER_SIZE, TOWER_POOL } from "@siege/sim";
import type { TowerId } from "@siege/sim";

const FAMILY_ORDER = ["projectile", "melee", "status"] as const;

const FAMILY_LABEL: Record<string, string> = {
  projectile: "Projectile · platform tiles",
  melee: "Melee · lane tiles, blocks",
  status: "Status · platform tiles, no damage",
};

const FAMILY_ACCENT: Record<string, string> = {
  projectile: "border-sky-400 bg-sky-500/10",
  melee: "border-amber-400 bg-amber-500/10",
  status: "border-violet-400 bg-violet-500/10",
};

export default function RosterSelect({
  initial,
  onStart,
}: {
  initial: TowerId[];
  onStart: (roster: TowerId[]) => void;
}) {
  const [picked, setPicked] = useState<TowerId[]>(initial);

  const toggle = (id: TowerId) => {
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < ROSTER_SIZE
          ? [...cur, id]
          : cur,
    );
  };

  const full = picked.length === ROSTER_SIZE;
  const counts = FAMILY_ORDER.map((f) => ({
    family: f,
    n: picked.filter((id) => TOWER_POOL.find((t) => t.id === id)?.family === f).length,
  }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <header className="shrink-0">
        <h1 className="text-xl font-semibold">Choose your roster</h1>
        <p className="mt-1 text-sm leading-snug text-slate-400">
          Pick {ROSTER_SIZE}. Every summon and every merge draws at random from
          these five — so this is the strategy, and the odds are yours to set.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {FAMILY_ORDER.map((family) => (
          <section key={family}>
            <h2 className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">
              {FAMILY_LABEL[family]}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {TOWER_POOL.filter((t) => t.family === family).map((t) => {
                const on = picked.includes(t.id);
                const blocked = !on && full;
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    aria-pressed={on}
                    className={[
                      "rounded-lg border px-3 py-2 text-left transition",
                      on ? FAMILY_ACCENT[family] : "border-slate-700 bg-slate-900",
                      blocked ? "opacity-40" : "",
                    ].join(" ")}
                  >
                    <span className="block text-sm font-semibold">{t.name}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                      {t.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="shrink-0 space-y-2">
        <p className="text-center text-xs text-slate-500">
          {counts.map((c) => `${c.n} ${c.family}`).join(" · ")}
        </p>
        <button
          disabled={!full}
          onClick={() => onStart(picked)}
          className="w-full rounded-lg bg-emerald-500 px-4 py-3.5 text-base font-semibold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
        >
          {full ? "Begin run" : `Pick ${ROSTER_SIZE - picked.length} more`}
        </button>
      </footer>
    </div>
  );
}
