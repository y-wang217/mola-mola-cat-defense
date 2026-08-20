"use client";

/**
 * Roster construction, before the run.
 *
 * This is where the strategy lives. Placement and type are random once the run
 * starts, so choosing these five is the player's real decision — and the five
 * are the entire draw pool, which is why they stay on screen during the run.
 *
 * This screen is the one place prose survives the language cull. It is a
 * deliberation screen, not a HUD: nothing is moving, the player is reading to
 * decide, and a tower's blurb is the only thing distinguishing two glyphs from
 * the same family. Everything here is 16px or larger.
 */

import { useState } from "react";
import { ROSTER_SIZE, TOWER_POOL } from "@siege/sim";
import type { TowerId } from "@siege/sim";

const FAMILY_ORDER = ["projectile", "melee", "status"] as const;

/** Glyph plus the family word. The old labels spelled out the tile rule too;
 *  the tile rule is visible on the board and did not need saying twice. */
const FAMILY_GLYPH: Record<string, string> = {
  projectile: "🎯",
  melee: "🛡️",
  status: "🧪",
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
        <h1 className="text-xl font-bold">Pick {ROSTER_SIZE}</h1>
        <p className="mt-1 text-base leading-snug text-slate-300">
          Every summon and every merge draws at random from these five.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {FAMILY_ORDER.map((family) => (
          <section key={family}>
            <h2 className="mb-1.5 text-base font-semibold text-slate-300">
              <span aria-hidden>{FAMILY_GLYPH[family]}</span> {family}
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
                      "min-h-[44px] rounded-lg border px-3 py-2 text-left transition",
                      on ? FAMILY_ACCENT[family] : "border-slate-700 bg-slate-900",
                      blocked ? "opacity-40" : "",
                    ].join(" ")}
                  >
                    <span className="block text-base font-semibold">
                      <span aria-hidden>{t.icon}</span> {t.name}
                    </span>
                    <span className="mt-0.5 block text-base leading-snug text-slate-300">
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
        <p className="num flex justify-center gap-4 text-base text-slate-300">
          {counts.map((c) => (
            <span key={c.family}>
              <span aria-hidden>{FAMILY_GLYPH[c.family]}</span>
              {c.n}
            </span>
          ))}
        </p>
        <button
          disabled={!full}
          onClick={() => onStart(picked)}
          aria-label={full ? "begin run" : `${picked.length} of ${ROSTER_SIZE} picked`}
          className="num min-h-[56px] w-full rounded-lg bg-emerald-500 px-4 text-2xl font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
        >
          {full ? "▶" : `${picked.length}/${ROSTER_SIZE}`}
        </button>
      </footer>
    </div>
  );
}
