/**
 * sfc32, seeded. CLAUDE.md §3: Math.random() is banned in this package —
 * every random draw pulls from run state so a replay reproduces it exactly.
 *
 * `nextU32` mutates the state object it is given. `tick()` only ever hands it
 * the RngState belonging to the cloned state it is about to return, so the
 * caller's state is never touched.
 */

export type RngState = { a: number; b: number; c: number; d: number };

/** Expand a single integer seed into a well-mixed sfc32 state. */
export function seedRng(seed: number): RngState {
  let h = seed >>> 0;
  const step = (): number => {
    h = (h + 0x6d2b79f5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return { a: step(), b: step(), c: step(), d: step() };
}

export function cloneRng(s: RngState): RngState {
  return { a: s.a, b: s.b, c: s.c, d: s.d };
}

/** Next unsigned 32-bit draw. Mutates `s`. */
export function nextU32(s: RngState): number {
  const t = (((s.a + s.b) | 0) + s.d) | 0;
  s.d = (s.d + 1) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.c = (s.c + t) | 0;
  return t >>> 0;
}

/** Uniform integer in [min, max). Mutates `s`. */
export function nextInt(s: RngState, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return min;
  return min + (nextU32(s) % span);
}
