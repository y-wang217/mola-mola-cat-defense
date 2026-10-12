"use client";

/**
 * Cues, not music. WebAudio only — no dependency, no asset pipeline.
 *
 * These exist because the playtest could not tell when something happened.
 * A segment of the life bar draining is the single most important event in the
 * game and it was silent; a merge re-rolled the tower type and was silent too.
 *
 * Render layer, like everything else in /game: the sim emits events, this reads
 * them. Nothing here feeds back into sim state.
 *
 * The context is created lazily on the first cue, because browsers refuse to
 * start one outside a user gesture, and every cue here is downstream of a tap.
 */

type Voice = {
  /** Start and end frequency, Hz. Equal values mean a flat tone. */
  from: number;
  to: number;
  /** Seconds. */
  duration: number;
  type: OscillatorType;
  gain: number;
  /** Seconds to wait before this voice starts. */
  delay?: number;
};

export type Cue = "leak" | "leak_fatal" | "merge" | "summon" | "wave" | "upgrade" | "denied";

/**
 * One entry per cue. Leak is deliberately the harshest and lowest thing in the
 * set — it must be unmistakable against everything else.
 */
const CUES: Record<Cue, Voice[]> = {
  leak: [
    { from: 320, to: 90, duration: 0.36, type: "sawtooth", gain: 0.3 },
    { from: 160, to: 60, duration: 0.42, type: "square", gain: 0.16, delay: 0.02 },
  ],
  leak_fatal: [
    { from: 240, to: 50, duration: 0.9, type: "sawtooth", gain: 0.34 },
    { from: 120, to: 40, duration: 1.1, type: "square", gain: 0.2, delay: 0.05 },
  ],
  merge: [
    { from: 520, to: 780, duration: 0.14, type: "triangle", gain: 0.18 },
    { from: 780, to: 1180, duration: 0.22, type: "triangle", gain: 0.16, delay: 0.1 },
  ],
  summon: [{ from: 420, to: 620, duration: 0.12, type: "triangle", gain: 0.14 }],
  wave: [
    { from: 300, to: 300, duration: 0.1, type: "square", gain: 0.12 },
    { from: 450, to: 450, duration: 0.16, type: "square", gain: 0.14, delay: 0.11 },
  ],
  upgrade: [
    { from: 300, to: 300, duration: 0.09, type: "triangle", gain: 0.15 },
    { from: 400, to: 400, duration: 0.09, type: "triangle", gain: 0.15, delay: 0.07 },
    { from: 600, to: 600, duration: 0.2, type: "triangle", gain: 0.17, delay: 0.14 },
  ],
  denied: [{ from: 200, to: 140, duration: 0.12, type: "square", gain: 0.12 }],
};

let ctx: AudioContext | null = null;
let muted = false;

function context(): AudioContext | null {
  if (muted) return null;
  if (ctx) return ctx;
  const Ctor =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    // A browser that will not give us a context is not an error worth surfacing
    // — the game is fully playable silent.
    muted = true;
    return null;
  }
  return ctx;
}

export function play(cue: Cue): void {
  const ac = context();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();

  const now = ac.currentTime;
  for (const v of CUES[cue]) {
    const start = now + (v.delay ?? 0);
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.from, start);
    if (v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(v.to, start + v.duration);
    // A short attack and an exponential tail: a raw gate on a square wave
    // clicks, and the click is louder than the cue.
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(v.gain, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + v.duration);
    osc.connect(amp).connect(ac.destination);
    osc.start(start);
    osc.stop(start + v.duration + 0.02);
  }
}

export function setMuted(next: boolean): void {
  muted = next;
  if (next && ctx) void ctx.suspend();
  if (!next && ctx) void ctx.resume();
}

export function isMuted(): boolean {
  return muted;
}
