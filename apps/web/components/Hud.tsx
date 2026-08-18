"use client";

import type { Hud as HudModel } from "@/game/useGame";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`tabular-nums text-lg font-semibold ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

export default function Hud({ hud }: { hud: HudModel }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-900/70 px-4 py-2">
      <Stat
        label="Lives"
        value={String(hud.lives)}
        tone={hud.lives <= 5 ? "text-red-400" : "text-slate-100"}
      />
      <Stat label="Gold" value={String(hud.gold)} tone="text-amber-300" />
      <Stat label="Wave" value={`${hud.wave}/${hud.waveCount}`} />
      <Stat label="Score" value={hud.score.toLocaleString()} />
    </div>
  );
}
