/**
 * THE SIM. CLAUDE.md §3:
 *
 *   tick(state, inputs) -> GameState
 *
 * Pure. No wall clock, no Math.random, no DOM, no variable delta time. The
 * tick counter is the only clock, the rate is fixed at 30Hz, and the renderer
 * interpolates between two states.
 *
 * `tick` never mutates its argument — it clones, mutates the clone, returns it.
 * The level is shared by reference because nothing ever writes to it.
 *
 * Every RNG draw in the run happens in summon.ts or merge.ts, in the order
 * documented there. Nothing in this file consumes randomness.
 */

import {
  MANA_REGEN_AMOUNT,
  MANA_REGEN_INTERVAL,
  SCORE_PER_LIFE,
  SCORE_PER_WAVE,
  SELL_REFUND_PCT,
  START_LIVES,
  START_MANA,
  summonCostFor,
} from "./content.js";
import { ENEMY_SPECS, effectiveDamage } from "./enemies.js";
import { dist2, isqrt } from "./fixed.js";
import { mergePartners, releaseBlocked, tryMerge } from "./merge.js";
import { buildPath, nearestLaneDistance, posAt, tileCentre, type PathGeometry } from "./pathing.js";
import { cloneRng, seedRng } from "./rng.js";
import { applyStatus, expireStatuses, hasStatus, magnitudeOf } from "./status.js";
import { trySummon } from "./summon.js";
import { atTier, rangeAtTier, towerSpec, type ShotEffect, type StatusApplyEffect } from "./towers.js";
import type { Enemy, GameState, Input, LevelDef, Projectile, Tower, TowerId } from "./types.js";
import type { EnemyKind } from "./enemies.js";

/** Poison ticks on this cadence rather than every frame, so it reads as pulses. */
const POISON_INTERVAL = 6;
/** Slow can never fully stop something — that is stun's job. */
const MAX_SLOW_PCT = 60;
/** How far a pierce or chain shot may reach for its next target. */
const HOP_RADIUS = 1900;

export function createInitialState(level: LevelDef, roster: TowerId[]): GameState {
  const first = level.waves[0];
  return {
    tick: 0,
    rng: seedRng(level.seed),
    level,
    roster: roster.slice(),
    status: "prep",
    mana: START_MANA,
    summonCost: summonCostFor(0),
    summonsUsed: 0,
    lives: START_LIVES,
    waveIndex: 0,
    waveTick: 0,
    prepRemaining: first ? first.prepTicks : 0,
    spawnCursors: first ? first.spawns.map(() => 0) : [],
    enemies: [],
    towers: [],
    projectiles: [],
    events: [],
    nextId: 1,
    score: 0,
    kills: 0,
    leaks: 0,
  };
}

function cloneState(s: GameState): GameState {
  return {
    tick: s.tick,
    rng: cloneRng(s.rng),
    level: s.level,
    roster: s.roster,
    status: s.status,
    mana: s.mana,
    summonCost: s.summonCost,
    summonsUsed: s.summonsUsed,
    lives: s.lives,
    waveIndex: s.waveIndex,
    waveTick: s.waveTick,
    prepRemaining: s.prepRemaining,
    spawnCursors: s.spawnCursors.slice(),
    enemies: s.enemies.map((e) => ({
      ...e,
      statuses: e.statuses.map((x) => ({ ...x })),
    })),
    towers: s.towers.map((t) => ({ ...t, blocking: t.blocking.slice() })),
    projectiles: s.projectiles.map((p) => ({ ...p, hitIds: p.hitIds.slice() })),
    events: [],
    nextId: s.nextId,
    score: s.score,
    kills: s.kills,
    leaks: s.leaks,
  };
}

export function tick(prev: GameState, inputs: Input[]): GameState {
  const s = cloneState(prev);
  if (s.status === "won" || s.status === "lost") return s;

  const path = buildPath(s.level.terrain);

  applyInputs(s, inputs, path);

  s.tick += 1;
  regenMana(s);
  advanceWaves(s, path);
  tickStatuses(s);
  moveEnemies(s, path);
  resolveMelee(s);
  fireTowers(s);
  stepProjectiles(s);

  s.enemies = s.enemies.filter((e) => e.alive);
  s.projectiles = s.projectiles.filter((p) => p.alive);

  resolveRunState(s);
  return s;
}

// --- inputs ---------------------------------------------------------------

function applyInputs(s: GameState, inputs: Input[], path: PathGeometry): void {
  for (const input of inputs) {
    switch (input.kind) {
      case "summon":
        trySummon(s, (tileIndex) => {
          const tile = s.level.terrain.tiles[tileIndex];
          const c = tileCentre(tile.pos);
          return {
            x: c.x,
            y: c.y,
            laneDist: tile.class === "path" ? tile.pathDist : nearestLaneDistance(path, c),
          };
        });
        break;
      case "merge":
        tryMerge(s, input.payload.sourceId, input.payload.targetId);
        break;
      case "sell":
        sellTower(s, input.payload.towerId);
        break;
      case "ability":
        // No abilities in M0. The kind exists because §6 defines it and the
        // replay format should not change when one is added.
        break;
    }
  }
}

function sellTower(s: GameState, towerId: number): void {
  const i = s.towers.findIndex((t) => t.id === towerId);
  if (i < 0) return;
  const t = s.towers[i];
  s.mana += Math.floor((t.invested * SELL_REFUND_PCT) / 100);
  releaseBlocked(s, t.id);
  s.towers.splice(i, 1);
}

export { mergePartners };

// --- economy and wave frame ----------------------------------------------

function regenMana(s: GameState): void {
  if (s.tick % MANA_REGEN_INTERVAL === 0) s.mana += MANA_REGEN_AMOUNT;
}

/**
 * Waves auto-advance. With time-regenerating mana a manual start button would
 * let the player idle and bank unlimited mana, which is exactly the tension the
 * mana model exists to create.
 */
function advanceWaves(s: GameState, path: PathGeometry): void {
  if (s.status === "prep") {
    s.prepRemaining -= 1;
    if (s.prepRemaining > 0) return;
    s.status = "wave";
    s.waveTick = 0;
    return;
  }

  s.waveTick += 1;
  const wave = s.level.waves[s.waveIndex];
  if (!wave) return;

  for (let i = 0; i < wave.spawns.length; i++) {
    const group = wave.spawns[i];
    while (s.spawnCursors[i] < group.count) {
      const due = group.startTick + s.spawnCursors[i] * group.intervalTicks;
      if (s.waveTick < due) break;
      s.enemies.push(makeEnemy(s, group.kind, path));
      s.spawnCursors[i] += 1;
    }
  }
}

function makeEnemy(s: GameState, kind: EnemyKind, path: PathGeometry): Enemy {
  const spec = ENEMY_SPECS[kind];
  const p = posAt(path, 0);
  return {
    id: s.nextId++,
    kind,
    hp: spec.hp,
    maxHp: spec.hp,
    dist: 0,
    x: p.x,
    y: p.y,
    blockedBy: 0,
    attackCooldown: 0,
    statuses: [],
    alive: true,
  };
}

// --- statuses -------------------------------------------------------------

function tickStatuses(s: GameState): void {
  const poisonPulse = s.tick % POISON_INTERVAL === 0;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (poisonPulse) {
      const poison = magnitudeOf(e.statuses, "poison");
      // Poison ignores armour entirely — that is what makes it the answer to
      // the armoured archetype.
      if (poison > 0) damageEnemy(s, e, poison, true);
    }
    e.statuses = expireStatuses(e.statuses);
  }
}

function enemySpeed(e: Enemy): number {
  if (hasStatus(e.statuses, "stun")) return 0;
  const slow = Math.min(magnitudeOf(e.statuses, "slow"), MAX_SLOW_PCT);
  return Math.floor((ENEMY_SPECS[e.kind].speed * (100 - slow)) / 100);
}

function damageEnemy(s: GameState, e: Enemy, raw: number, ignoreArmor = false): void {
  if (!e.alive) return;
  const spec = ENEMY_SPECS[e.kind];
  const vulnerable = magnitudeOf(e.statuses, "vulnerable");
  const boosted = Math.floor((raw * (100 + vulnerable)) / 100);
  const shred = magnitudeOf(e.statuses, "armor_shred");
  e.hp -= ignoreArmor ? Math.max(1, boosted) : effectiveDamage(boosted, spec.armor, shred);
  if (e.hp > 0) return;

  e.alive = false;
  e.blockedBy = 0;
  s.kills += 1;
  s.score += spec.score;
}

// --- movement and blocking ------------------------------------------------

function isBlocker(t: Tower): boolean {
  return towerSpec(t.towerId).effect.kind === "block";
}

/** The first blocker with free capacity whose lane position we cross this tick. */
function blockerCrossed(s: GameState, from: number, to: number): Tower | undefined {
  let best: Tower | undefined;
  for (const t of s.towers) {
    if (!isBlocker(t) || t.hp <= 0) continue;
    const effect = towerSpec(t.towerId).effect;
    if (effect.kind !== "block") continue;
    if (t.blocking.length >= effect.blockCount) continue;
    if (t.laneDist <= from || t.laneDist > to) continue;
    if (!best || t.laneDist < best.laneDist) best = t;
  }
  return best;
}

function moveEnemies(s: GameState, path: PathGeometry): void {
  for (const e of s.enemies) {
    if (!e.alive) continue;

    if (e.blockedBy !== 0) {
      const blocker = s.towers.find((t) => t.id === e.blockedBy);
      if (blocker && blocker.hp > 0) continue; // held, does not advance
      e.blockedBy = 0;
    }

    const speed = enemySpeed(e);
    if (speed <= 0) continue;

    const to = e.dist + speed;

    // Fliers follow the lane but can never be stopped or engaged. That is the
    // lever that keeps projectile towers mandatory.
    if (!ENEMY_SPECS[e.kind].flying) {
      const blocker = blockerCrossed(s, e.dist, to);
      if (blocker) {
        e.dist = blocker.laneDist;
        e.blockedBy = blocker.id;
        e.attackCooldown = ENEMY_SPECS[e.kind].attackCooldown;
        blocker.blocking.push(e.id);
        const at = posAt(path, e.dist);
        e.x = at.x;
        e.y = at.y;
        continue;
      }
    }

    e.dist = to;
    if (e.dist >= path.total) {
      e.alive = false;
      s.leaks += 1;
      s.lives -= ENEMY_SPECS[e.kind].leak;
      continue;
    }
    const at = posAt(path, e.dist);
    e.x = at.x;
    e.y = at.y;
  }
}

// --- melee ----------------------------------------------------------------

function findEnemy(s: GameState, id: number): Enemy | undefined {
  return s.enemies.find((e) => e.id === id);
}

function resolveMelee(s: GameState): void {
  for (const t of s.towers) {
    const effect = towerSpec(t.towerId).effect;
    if (effect.kind !== "block") continue;

    if (effect.regenInterval > 0 && s.tick % effect.regenInterval === 0) {
      t.hp = Math.min(t.maxHp, t.hp + effect.regenAmount);
    }

    t.blocking = t.blocking.filter((id) => {
      const e = findEnemy(s, id);
      return !!e && e.alive && e.blockedBy === t.id;
    });

    if (t.cooldown > 0) {
      t.cooldown -= 1;
    } else if (t.blocking.length > 0) {
      const victim = findEnemy(s, t.blocking[0]);
      if (victim) {
        damageEnemy(s, victim, atTier(effect.attackDamage, t.tier));
        t.cooldown = effect.attackCooldown;
      }
    }
  }

  for (const e of s.enemies) {
    if (!e.alive || e.blockedBy === 0) continue;
    if (e.attackCooldown > 0) {
      e.attackCooldown -= 1;
      continue;
    }
    const blocker = s.towers.find((t) => t.id === e.blockedBy);
    if (!blocker) {
      e.blockedBy = 0;
      continue;
    }
    blocker.hp -= ENEMY_SPECS[e.kind].blockDamage;
    e.attackCooldown = ENEMY_SPECS[e.kind].attackCooldown;
  }

  const dying = s.towers.filter((t) => isBlocker(t) && t.hp <= 0);
  for (const t of dying) {
    const effect = towerSpec(t.towerId).effect;
    if (effect.kind === "block" && effect.deathEffect === "explode") {
      const r2 = effect.deathRadius * effect.deathRadius;
      for (const e of s.enemies) {
        if (!e.alive) continue;
        if (dist2(t.x, t.y, e.x, e.y) > r2) continue;
        damageEnemy(s, e, atTier(effect.deathDamage, t.tier));
        if (e.alive && effect.deathStunTicks > 0) {
          applyStatus(
            e.statuses,
            { kind: "stun", magnitude: 1, remainingTicks: effect.deathStunTicks, sourceId: t.towerId },
            ENEMY_SPECS[e.kind].armor,
          );
        }
      }
    }
    releaseBlocked(s, t.id);
    s.events.push({ kind: "blocker_died", tileIndex: t.tileIndex });
  }
  if (dying.length > 0) {
    s.towers = s.towers.filter((t) => !(isBlocker(t) && t.hp <= 0));
  }
}

// --- towers that shoot or apply statuses ----------------------------------

function inRange(s: GameState, t: Tower, shape: "circle" | "lane", range: number): Enemy[] {
  const out: Enemy[] = [];
  const r2 = range * range;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (shape === "lane") {
      if (Math.abs(e.dist - t.laneDist) <= range) out.push(e);
    } else if (dist2(t.x, t.y, e.x, e.y) <= r2) {
      out.push(e);
    }
  }
  return out;
}

/** Ties always break on the lower id, so selection never depends on anything
 *  but the state itself. */
function pickByPriority(candidates: Enemy[], priority: ShotEffect["priority"]): Enemy {
  let best = candidates[0];
  for (const e of candidates) {
    let better = false;
    switch (priority) {
      case "first": better = e.dist > best.dist; break;
      case "last": better = e.dist < best.dist; break;
      case "strongest": better = e.hp > best.hp; break;
      case "weakest": better = e.hp < best.hp; break;
    }
    if (better || (!better && e.dist === best.dist && e.hp === best.hp && e.id < best.id)) {
      best = e;
    }
  }
  return best;
}

function fireTowers(s: GameState): void {
  for (const t of s.towers) {
    const spec = towerSpec(t.towerId);
    if (spec.effect.kind === "block") continue;

    if (t.cooldown > 0) {
      t.cooldown -= 1;
      continue;
    }

    const range = rangeAtTier(spec.range, t.tier);
    const shape = spec.effect.kind === "shot" ? spec.effect.rangeShape : "circle";
    const candidates = inRange(s, t, shape, range);
    if (candidates.length === 0) continue;

    if (spec.effect.kind === "shot") {
      fireShot(s, t, spec.effect, candidates);
    } else {
      applyStatusEffect(s, t, spec.effect, candidates);
    }
  }
}

function fireShot(s: GameState, t: Tower, effect: ShotEffect, candidates: Enemy[]): void {
  const target = pickByPriority(candidates, effect.priority);
  const hopMode = effect.targeting === "pierce" ? "lane" : effect.targeting === "chain" ? "nearest" : "none";
  const hopsLeft =
    effect.targeting === "pierce" ? Math.max(0, effect.pierce - 1)
    : effect.targeting === "chain" ? effect.chain
    : 0;

  s.projectiles.push({
    id: s.nextId++,
    x: t.x,
    y: t.y,
    tx: target.x,
    ty: target.y,
    targetId: target.id,
    damage: atTier(effect.damage, t.tier),
    speed: effect.projectileSpeed,
    splash: effect.splash,
    hopsLeft,
    hopMode,
    hitIds: [],
    ownerTowerId: t.towerId,
    alive: true,
  });
  t.cooldown = effect.cooldown;
}

function applyStatusEffect(
  s: GameState,
  t: Tower,
  effect: StatusApplyEffect,
  candidates: Enemy[],
): void {
  // Aura hits everything in range; targeted takes the leaders along the lane.
  const targets =
    effect.mode === "aura"
      ? candidates
      : candidates
          .slice()
          .sort((a, b) => (b.dist - a.dist) || (a.id - b.id))
          .slice(0, effect.maxTargets);

  for (const e of targets) {
    applyStatus(
      e.statuses,
      {
        kind: effect.status,
        magnitude: atTier(effect.magnitude, t.tier),
        remainingTicks: effect.durationTicks,
        sourceId: t.towerId,
      },
      ENEMY_SPECS[e.kind].armor,
    );
    if (effect.damage > 0) damageEnemy(s, e, atTier(effect.damage, t.tier));
  }
  t.cooldown = effect.cooldown;
}

// --- projectiles ----------------------------------------------------------

function nextHopTarget(s: GameState, p: Projectile, from: Enemy): Enemy | undefined {
  let best: Enemy | undefined;
  const r2 = HOP_RADIUS * HOP_RADIUS;
  for (const e of s.enemies) {
    if (!e.alive || p.hitIds.includes(e.id)) continue;
    if (dist2(from.x, from.y, e.x, e.y) > r2) continue;

    if (p.hopMode === "lane") {
      // Pierce continues along the lane, to whatever is next in the queue.
      if (e.dist >= from.dist) continue;
      if (!best || e.dist > best.dist || (e.dist === best.dist && e.id < best.id)) best = e;
    } else {
      const d = dist2(from.x, from.y, e.x, e.y);
      const bd = best ? dist2(from.x, from.y, best.x, best.y) : Infinity;
      if (!best || d < bd || (d === bd && e.id < best.id)) best = e;
    }
  }
  return best;
}

function stepProjectiles(s: GameState): void {
  for (const p of s.projectiles) {
    if (!p.alive) continue;

    const target = findEnemy(s, p.targetId);
    if (target && target.alive) {
      p.tx = target.x;
      p.ty = target.y;
    }

    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = isqrt(dx * dx + dy * dy);

    if (d > p.speed) {
      p.x += Math.trunc((dx * p.speed) / d);
      p.y += Math.trunc((dy * p.speed) / d);
      continue;
    }

    p.x = p.tx;
    p.y = p.ty;
    impact(s, p, target);
  }
}

function impact(s: GameState, p: Projectile, target: Enemy | undefined): void {
  if (p.splash > 0) {
    const r2 = p.splash * p.splash;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) damageEnemy(s, e, p.damage);
    }
    p.alive = false;
    return;
  }

  if (!target || !target.alive) {
    p.alive = false;
    return;
  }

  p.hitIds.push(target.id);
  damageEnemy(s, target, p.damage);

  // Pierce and chain keep going. The hop is taken from where the shot landed,
  // so a pierce that runs out of queue simply stops.
  if (p.hopsLeft > 0 && p.hopMode !== "none") {
    const next = nextHopTarget(s, p, target);
    if (next) {
      p.hopsLeft -= 1;
      p.targetId = next.id;
      p.tx = next.x;
      p.ty = next.y;
      return;
    }
  }
  p.alive = false;
}

// --- run state ------------------------------------------------------------

function resolveRunState(s: GameState): void {
  if (s.lives <= 0) {
    s.lives = 0;
    s.status = "lost";
    return;
  }
  if (s.status !== "wave") return;

  const wave = s.level.waves[s.waveIndex];
  if (!wave) return;

  const allSpawned = wave.spawns.every((g, i) => s.spawnCursors[i] >= g.count);
  if (!allSpawned || s.enemies.length > 0) return;

  s.score += SCORE_PER_WAVE;
  s.waveIndex += 1;
  s.waveTick = 0;

  const next = s.level.waves[s.waveIndex];
  if (!next) {
    s.status = "won";
    s.score += s.lives * SCORE_PER_LIFE;
    s.spawnCursors = [];
    return;
  }
  s.status = "prep";
  s.prepRemaining = next.prepTicks;
  s.spawnCursors = next.spawns.map(() => 0);
}
