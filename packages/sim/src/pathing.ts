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
