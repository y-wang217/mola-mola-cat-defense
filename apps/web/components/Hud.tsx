"use client";

/**
 * The in-play HUD. Glyph + number, never a word.
 *
 * The playtest could not read this on a phone in daylight, so every rule here
 * is a legibility rule rather than a style choice:
 *   - nothing below 16px
 *   - tabular figures, so a counter ticking 9 -> 10 does not shove the row
 *   - lives are segments (see LivesBar), not a numeral
 *   - the merge counter hides itself at zero rather than showing "0"
 *
 * Score is deliberately absent: it is not actionable mid-run and it is shown in
 * full on the end screen.
 */

import { useEffect, useRef, useState } from "react";
import LivesBar from "./LivesBar";
import type { Hud as HudModel } from "@/game/useGame";

function Readout({
  glyph,
  value,
  tone,
  label,
  pop,
}: {
  glyph: string;
  value: string;
  tone: string;
  label: string;
  pop?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <span aria-hidden className="text-base leading-none">
        {glyph}
      </span>
      <span className={`num text-base font-bold leading-none ${tone} ${pop ? "animate-count-pop" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/** True for one animation's worth of time after `value` changes. */
function usePop(value: number, ms = 420): boolean {
  const [on, setOn] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    prev.current = value;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return on;
}

export default function Hud({ hud }: { hud: HudModel }) {
  const wavePop = usePop(hud.wave);

  return (
    <div className="shrink-0 space-y-1.5 rounded-xl bg-slate-950/90 px-3 py-2 ring-1 ring-slate-700">
      <LivesBar lives={hud.lives} maxLives={hud.maxLives} />

      <div className="flex items-center justify-between gap-3">
        <Readout glyph="💧" value={String(hud.mana)} tone="text-sky-200" label="mana" />
        <Readout
          glyph="🌊"
          value={`${hud.wave}/${hud.waveCount}`}
          tone="text-slate-50"
          label="wave"
          pop={wavePop}
        />
        {hud.mergesAvailable > 0 ? (
          <Readout
            glyph="🔁"
            value={String(hud.mergesAvailable)}
            tone="text-emerald-300"
            label="merges available"
          />
        ) : (
          // Zero-state hides entirely rather than showing a 0 — an empty
          // counter is a thing to read for no reason.
          <span aria-hidden />
        )}
      </div>
    </div>
  );
}
