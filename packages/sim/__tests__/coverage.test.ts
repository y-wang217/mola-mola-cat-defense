/**
 * Range coverage readout. Diagnosis tool, not a balance assertion.
 *
 * Units, established by reading the code rather than guessing:
 *   - `range` in the tower table is fixed-point world units, TILE = FP_SCALE =
 *     1000, so `range: 2100` means 2.1 tiles.
 *   - the comparison in tick.ts `inRange` uses the same units: dist2 over
 *     tileCentre()-derived tower coords and posAt()-derived enemy coords.
 *   - they match, and both are tile-centre to lane-centreline. No units bug.
 */

import { it } from "vitest";
import { M0_LEVEL } from "../src/level.js";
import { TILE } from "../src/fixed.js";
import { buildPath, tileCentre } from "../src/pathing.js";
import { TOWER_POOL, rangeAtTier } from "../src/towers.js";

/** Every grid cell the lane passes through. */
function laneCells(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const path = M0_LEVEL.terrain.path;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    for (let s = 0; s < steps; s++) {
      const c = { x: a.x + dx * s, y: a.y + dy * s };
      if (c.y < 0 || c.y >= M0_LEVEL.terrain.height) continue;
      if (!out.some((o) => o.x === c.x && o.y === c.y)) out.push(c);
    }
  }
  return out;
}

it("prints coverage per platform tile", () => {
  const lane = laneCells();
  const platforms = M0_LEVEL.terrain.tiles.filter((t) => t.class === "platform");
  const projectiles = TOWER_POOL.filter((t) => t.family === "projectile");

  console.log(`lane cells: ${lane.length}, platform tiles: ${platforms.length}`);
  console.log("tier-1 ranges (tiles): " +
    projectiles.map((t) => `${t.name}=${(rangeAtTier(t.range, 1) / TILE).toFixed(2)}`).join(" "));

  // Grid: for each platform tile, lane cells inside a tier-1 ARROW circle.
  const arrow = TOWER_POOL.find((t) => t.id === "arrow")!;
  const r = rangeAtTier(arrow.range, 1);
  const counts = new Map<string, number>();
  let totalCovered = 0;

  for (const p of platforms) {
    const c = tileCentre(p.pos);
    let n = 0;
    for (const cell of lane) {
      const lc = tileCentre(cell);
      const dx = lc.x - c.x;
      const dy = lc.y - c.y;
      if (dx * dx + dy * dy <= r * r) n++;
    }
    counts.set(`${p.pos.x},${p.pos.y}`, n);
    totalCovered += n;
  }

  console.log(`\n  grid — lane cells covered by a tier-1 ${arrow.name} (range ${(r / TILE).toFixed(2)} tiles)`);
  console.log("  '#' = lane, '.' = empty, digit = platform tile w/ coverage count\n");
  for (let y = 0; y < M0_LEVEL.terrain.height; y++) {
    let row = "  ";
    for (let x = 0; x < M0_LEVEL.terrain.width; x++) {
      const key = `${x},${y}`;
      if (counts.has(key)) row += ` ${counts.get(key)}`;
      else if (lane.some((c) => c.x === x && c.y === y)) row += " #";
      else row += " .";
    }
    console.log(row);
  }

  const values = [...counts.values()];
  console.log(`\n  coverage per platform: min=${Math.min(...values)} max=${Math.max(...values)} ` +
    `mean=${(totalCovered / platforms.length).toFixed(1)} of ${lane.length} lane cells`);
  console.log(`  platforms covering nothing: ${values.filter((v) => v === 0).length}`);
  void buildPath;
});
