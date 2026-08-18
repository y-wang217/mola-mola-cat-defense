/**
 * Merge: two towers of the same type and tier become one at tier+1, on the
 * target tile, of a RE-ROLLED type drawn from the roster.
 *
 * The re-roll is the whole mechanic. It makes every merge a live risk: you may
 * lose the projectile tower you wanted and receive a status tower you did not.
 * Skilled play is holding merges until the board can absorb a bad outcome.
 *
 * The re-rolled type must be legal for the TARGET tile's class, so a roster
 * with a single melee tower makes lane merges deterministic. That is a real
 * roster-building consideration and is left in deliberately.
 *
 * There is no preview, here or in the UI. A preview turns the gamble into
 * arithmetic and removes the reason the mechanic exists.
 */

import { nextInt } from "./rng.js";
import { MAX_TIER, atTier, towerSpec } from "./towers.js";
import type { GameState } from "./types.js";

export function tryMerge(s: GameState, sourceId: number, targetId: number): void {
  if (sourceId === targetId) return;

  const source = s.towers.find((t) => t.id === sourceId);
  const target = s.towers.find((t) => t.id === targetId);
  if (!source || !target) return;
  if (source.towerId !== target.towerId) return;
  if (source.tier !== target.tier) return;
  if (target.tier >= MAX_TIER) return;

  // Draw only from roster entries legal for the target tile's class.
  const targetClass = s.level.terrain.tiles[target.tileIndex].class;
  const eligible = s.roster.filter((id) => towerSpec(id).tileClass === targetClass);
  if (eligible.length === 0) return;

  const rolled = eligible[nextInt(s.rng, 0, eligible.length)];

  // Both towers release whatever they were holding; blocked enemies resume and
  // are re-acquired next tick under the new tower's block count.
  releaseBlocked(s, source.id);
  releaseBlocked(s, target.id);

  target.towerId = rolled;
  target.tier += 1;
  target.invested += source.invested;
  target.cooldown = 0;
  target.blocking = [];

  const spec = towerSpec(rolled);
  if (spec.effect.kind === "block") {
    target.maxHp = atTier(spec.effect.hp, target.tier);
    target.hp = target.maxHp;
  } else {
    target.maxHp = 0;
    target.hp = 0;
  }

  s.towers = s.towers.filter((t) => t.id !== sourceId);
  s.events.push({ kind: "merged", towerId: rolled, tier: target.tier });
}

export function releaseBlocked(s: GameState, towerId: number): void {
  for (const e of s.enemies) {
    if (e.blockedBy === towerId) {
      e.blockedBy = 0;
      e.attackCooldown = 0;
    }
  }
}

/** Every tower the given tower may legally merge with right now. */
export function mergePartners(s: GameState, towerId: number): number[] {
  const t = s.towers.find((x) => x.id === towerId);
  if (!t || t.tier >= MAX_TIER) return [];
  return s.towers
    .filter((o) => o.id !== t.id && o.towerId === t.towerId && o.tier === t.tier)
    .map((o) => o.id);
}
