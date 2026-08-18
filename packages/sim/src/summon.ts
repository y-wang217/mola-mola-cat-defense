/**
 * The summon verb, and the RNG draw order that is part of the replay contract.
 *
 * ORDER MATTERS AND IS LOAD-BEARING. Changing it changes every golden fixture
 * hash, which must be an intentional, explained break. See CLAUDE.md §8.
 *
 *   1. Check mana. Insufficient -> no-op, consuming NO RNG.
 *   2. Draw a tower type uniformly from the roster's 5 entries.
 *   3. Compute the legal tile set for that type. No RNG.
 *   4. Empty set -> refund the mana, emit `no_room`, consume NO further RNG.
 *   5. Draw a tile uniformly from the legal set.
 *   6. Place at tier 1.
 *
 * Type is drawn BEFORE tile on purpose: a board with free platforms but no free
 * lane tile can still fail a melee draw. That is strategic pressure, not a bug,
 * and swapping the two steps would quietly delete it.
 */

import { summonCostFor } from "./economy.js";
import { nextInt } from "./rng.js";
import { atTier, towerSpec } from "./towers.js";
import type { GameState, TileClass, TowerId } from "./types.js";

/** Indices of empty tiles of the given class, in tile order. */
export function legalTileIndices(s: GameState, cls: TileClass): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.level.terrain.tiles.length; i++) {
    if (s.level.terrain.tiles[i].class !== cls) continue;
    if (s.towers.some((t) => t.tileIndex === i)) continue;
    out.push(i);
  }
  return out;
}

/**
 * Create a tower on a tile. `laneDist` is supplied by the caller because only
 * tick.ts holds the path geometry.
 */
export function placeTower(
  s: GameState,
  towerId: TowerId,
  tileIndex: number,
  invested: number,
  x: number,
  y: number,
  laneDist: number,
): void {
  const spec = towerSpec(towerId);
  const hp = spec.effect.kind === "block" ? atTier(spec.effect.hp, 1) : 0;

  s.towers.push({
    id: s.nextId++,
    towerId,
    tileIndex,
    x,
    y,
    tier: 1,
    cooldown: 0,
    hp,
    maxHp: hp,
    blocking: [],
    invested,
    laneDist,
  });
}

export type TileGeometry = (tileIndex: number) => { x: number; y: number; laneDist: number };

export function trySummon(s: GameState, geometry: TileGeometry): void {
  // 1. Mana. No RNG consumed on failure — an unaffordable tap must not shift
  //    the stream, or the same inputs would diverge on a slower device.
  if (s.mana < s.summonCost) return;
  s.mana -= s.summonCost;

  // 2. Type.
  const towerId = s.roster[nextInt(s.rng, 0, s.roster.length)];

  // 3. Legal tiles for that type.
  const legal = legalTileIndices(s, towerSpec(towerId).tileClass);

  // 4. No room: refund and stop. Surfaced, never silently swallowed.
  if (legal.length === 0) {
    s.mana += s.summonCost;
    s.events.push({ kind: "no_room", towerId });
    return;
  }

  // 5. Tile.
  const tileIndex = legal[nextInt(s.rng, 0, legal.length)];

  // 6. Place, then escalate the cost for next time.
  const { x, y, laneDist } = geometry(tileIndex);
  placeTower(s, towerId, tileIndex, s.summonCost, x, y, laneDist);
  s.summonsUsed += 1;
  s.summonCost = summonCostFor(s.summonsUsed);
  s.events.push({ kind: "summoned", towerId, tileIndex });
}
