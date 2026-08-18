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
    <div className="shrink-0 rounded-xl bg-slate-900/70 px-4 py-2">
      <div className="flex items-center justify-between">
        <Stat
          label="Lives"
          value={String(hud.lives)}
          tone={hud.lives <= 5 ? "text-red-400" : "text-slate-100"}
        />
        <Stat label="Mana" value={String(hud.mana)} tone="text-sky-300" />
        <Stat
          label={hud.status === "prep" ? "Next wave" : "Wave"}
          value={hud.status === "prep" ? `${hud.prepSeconds}s` : `${hud.wave}/${hud.waveCount}`}
          tone={hud.status === "prep" ? "text-emerald-300" : undefined}
        />
        <Stat label="Score" value={hud.score.toLocaleString()} />
      </div>
    </div>
  );
}
