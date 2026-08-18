/**
 * Path geometry. The terrain's waypoints are axis-aligned, so every segment
 * length is an exact integer of fixed-point units and no rounding creeps into
 * enemy movement.
 *
 * Geometry is derived from the LevelDef on demand rather than stored in
 * GameState: it is a pure function of the level, and keeping it out of state
 * keeps state serializable and small.
 */

import { TILE } from "./fixed.js";
import type { GridPos, Terrain } from "./types.js";

export type Point = { x: number; y: number };

export type PathGeometry = {
  pts: Point[];
  /** cum[i] is the distance along the path at pts[i]. */
  cum: number[];
  total: number;
};

/** Centre of a grid tile, in fixed-point world units. */
export function tileCentre(p: GridPos): Point {
  return { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 };
}

export function buildPath(terrain: Terrain): PathGeometry {
  const pts = terrain.path.map(tileCentre);
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    // Axis-aligned: exactly one of these is non-zero.
    total += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    cum.push(total);
  }
  return { pts, cum, total };
}

/** World position at `d` units along the path, clamped to both ends. */
export function posAt(path: PathGeometry, d: number): Point {
  if (d <= 0) return { x: path.pts[0].x, y: path.pts[0].y };
  const last = path.pts.length - 1;
  if (d >= path.total) return { x: path.pts[last].x, y: path.pts[last].y };

  // Linear scan: paths are a handful of waypoints, and a scan has no
  // ordering ambiguity to get wrong.
  let i = 1;
  while (i < path.cum.length && path.cum[i] < d) i++;

  const a = path.pts[i - 1];
  const b = path.pts[i];
  const segStart = path.cum[i - 1];
  const segLen = path.cum[i] - segStart;
  if (segLen <= 0) return { x: a.x, y: a.y };
  const along = d - segStart;

  return {
    x: a.x + Math.trunc(((b.x - a.x) * along) / segLen),
    y: a.y + Math.trunc(((b.y - a.y) * along) / segLen),
  };
}

/**
 * Distance along the lane at a point that lies on it, or -1 if it does not.
 *
 * Used to give each melee-eligible path tile a `pathDist`, which is what makes
 * blocking a 1-D comparison against `enemy.dist` instead of a geometry problem.
 * Segments are axis-aligned, so this is exact integer arithmetic.
 */
export function pathDistanceAt(path: PathGeometry, p: Point): number {
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1];
    const b = path.pts[i];

    if (a.x === b.x && p.x === a.x) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (p.y >= lo && p.y <= hi) return path.cum[i - 1] + Math.abs(p.y - a.y);
    }
    if (a.y === b.y && p.y === a.y) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (p.x >= lo && p.x <= hi) return path.cum[i - 1] + Math.abs(p.x - a.x);
    }
  }
  return -1;
}

/**
 * Nearest distance along the lane to an arbitrary point.
 *
 * Segments are axis-aligned, so projecting onto one is a clamp on a single
 * coordinate — exact integer arithmetic, no trigonometry.
 */
export function nearestLaneDistance(path: PathGeometry, p: Point): number {
  let bestDist = 0;
  let bestSquared = Infinity;

  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1];
    const b = path.pts[i];

    let cx: number;
    let cy: number;
    if (a.x === b.x) {
      cx = a.x;
      cy = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y));
    } else {
      cy = a.y;
      cx = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x));
    }

    const dx = p.x - cx;
    const dy = p.y - cy;
    const squared = dx * dx + dy * dy;
    if (squared < bestSquared) {
      bestSquared = squared;
      bestDist = path.cum[i - 1] + Math.abs(cx - a.x) + Math.abs(cy - a.y);
    }
  }
  return bestDist;
}
