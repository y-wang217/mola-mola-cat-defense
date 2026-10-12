"use client";

/**
 * Lives as discrete segments, not a numeral and not a continuous fill.
 *
 * The distinction is the whole point. A continuous bar reads as "some amount of
 * health left"; segments read as "I have exactly four mistakes left". The
 * playtest could not tell that a leak had cost anything, so losing a segment is
 * built to be the loudest thing on the screen: the lost segment flashes white,
 * shatters, and the whole bar shakes. At one segment the bar pulses until the
 * run ends.
 *
 * Presentation only — `lives` comes straight from sim state.
 */

import { useEffect, useRef, useState } from "react";

/** How long the shatter on a lost segment runs. Matches --shatter in globals.css. */
const SHATTER_MS = 620;

export default function LivesBar({ lives, maxLives }: { lives: number; maxLives: number }) {
  // Indices of segments that were filled a moment ago and are not any more.
  const [breaking, setBreaking] = useState<number[]>([]);
  const [shake, setShake] = useState(0);
  const prev = useRef(lives);

  useEffect(() => {
    const before = prev.current;
    prev.current = lives;
    if (lives >= before) return;

    const lost: number[] = [];
    for (let i = lives; i < before; i++) lost.push(i);
    setBreaking((cur) => [...cur, ...lost]);
    setShake((n) => n + 1);

    const timer = setTimeout(() => {
      setBreaking((cur) => cur.filter((i) => !lost.includes(i)));
    }, SHATTER_MS);
    return () => clearTimeout(timer);
  }, [lives]);

  const critical = lives === 1;

  return (
    <div
      key={shake}
      className={`flex flex-1 items-center gap-1 ${shake > 0 ? "animate-bar-shake" : ""}`}
      role="img"
      aria-label={`${lives} of ${maxLives} lives`}
    >
      {Array.from({ length: maxLives }, (_, i) => {
        const filled = i < lives;
        const shattering = breaking.includes(i);
        return (
          <span
            key={i}
            className={[
              "h-5 min-w-1.5 flex-1 rounded-[3px] border",
              filled
                ? critical
                  ? "animate-life-pulse border-red-300 bg-red-400"
                  : "border-emerald-200 bg-emerald-400"
                : shattering
                  ? "animate-life-shatter border-white bg-white"
                  : "border-slate-600 bg-slate-800",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
