/**
 * Fixed-point integer math. See CLAUDE.md §3: no floating point where an
 * integer works. Every position and speed in the sim is an integer number of
 * 1/FP_SCALE units, so the arithmetic below is exact and reproducible.
 */

export const FP_SCALE = 1000;

/** One grid tile, in fixed-point units. */
export const TILE = FP_SCALE;

/** Whole number -> fixed-point. */
export function fp(n: number): number {
  return Math.round(n * FP_SCALE);
}

/** Fixed-point -> float. Render layer only; never feed this back into the sim. */
export function unfp(n: number): number {
  return n / FP_SCALE;
}

/** Multiply two fixed-point numbers, truncating toward zero. */
export function fpMul(a: number, b: number): number {
  return Math.trunc((a * b) / FP_SCALE);
}

/** Divide two fixed-point numbers, truncating toward zero. */
export function fpDiv(a: number, b: number): number {
  return Math.trunc((a * FP_SCALE) / b);
}

/**
 * Integer square root by Newton's method.
 *
 * Deliberately not Math.sqrt: ECMAScript only requires Math.sqrt to be
 * implementation-approximated, so it is not guaranteed to agree bit-for-bit
 * across engines. Integer division and Math.floor are exact below 2^53, so
 * this is.
 */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  if (n < 4) return 1;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** Squared distance. Prefer this to `dist` for range checks — it skips the sqrt. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Exact integer distance between two fixed-point points. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return isqrt(dist2(ax, ay, bx, by));
}
