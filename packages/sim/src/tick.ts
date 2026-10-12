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

import { MAX_LIVES, SCORE_PER_LIFE, SCORE_PER_WAVE, leakDamageFor, spawnIntervalFor } from "./content.js";
import {
  FAMILY_UPGRADE_MAX_LEVEL,
  MANA_REGEN_AMOUNT,
  MANA_REGEN_INTERVAL,
  SELL_REFUND_PCT,
  STARTING_MANA,
  bountyFor,
  familyDamagePct,
  familyUpgradeCost,
  summonCostFor,
} from "./economy.js";
import { ENEMY_SPECS, effectiveDamage } from "./enemies.js";
import { dist2, isqrt } from "./fixed.js";
import { mergePartners, releaseBlocked, tryMerge } from "./merge.js";
import { buildPath, nearestLaneDistance, posAt, tileCentre, type PathGeometry } from "./pathing.js";
import { cloneRng, seedRng } from "./rng.js";
import { applyStatus, expireStatuses, hasStatus, magnitudeOf } from "./status.js";
import { trySummon } from "./summon.js";
import {
  atTier, hasDamageAxis, rangeAtTier, towerSpec,
  type ShotEffect, type StatusApplyEffect,
} from "./towers.js";
import type {
  Enemy, GameState, Input, LevelDef, Projectile, Tower, TowerId, WaveScaling,
} from "./types.js";
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
    // Wave 1 is already running at tick 0. There is no opening pause: the
    // break phase is gone and its lead-in lives in each group's startTick.
    status: "wave",
    mana: STARTING_MANA,
    manaFromTick: 0,
    manaFromKills: 0,
    summonCost: summonCostFor(0),
    summonsUsed: 0,
    // One entry per roster slot, in roster order. Nothing outside the roster
    // can ever be summoned or rolled into, so nothing else needs a key.
    familyUpgradeLevels: Object.fromEntries(roster.map((id) => [id, 0])),
    lives: MAX_LIVES,
    waveIndex: 0,
    waveTick: 0,
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
    manaFromTick: s.manaFromTick,
    manaFromKills: s.manaFromKills,
    summonCost: s.summonCost,
    summonsUsed: s.summonsUsed,
    // Spread preserves insertion order, so the serialized order — and the
    // fixture hash — does not depend on how the record was built.
    familyUpgradeLevels: { ...s.familyUpgradeLevels },
    lives: s.lives,
    waveIndex: s.waveIndex,
    waveTick: s.waveTick,
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
      case "family_upgrade":
        tryFamilyUpgrade(s, input.payload.towerId);
        break;
      case "ability":
        // No abilities in M0. The kind exists because §6 defines it and the
        // replay format should not change when one is added.
        break;
    }
  }
}

/**
 * Raise one family's upgrade level. Every check is a no-op rather than an
 * error, exactly like an unaffordable summon: an input the sim will not honour
 * must cost nothing, or the same replay would diverge.
 *
 * Consumes no RNG. The draw order documented in summon.ts and merge.ts is
 * unaffected by this input existing.
 */
function tryFamilyUpgrade(s: GameState, family: TowerId): void {
  const level = s.familyUpgradeLevels[family];
  if (level === undefined) return; // not in this run's roster
  if (level >= FAMILY_UPGRADE_MAX_LEVEL) return;
  // Refuse rather than charge for nothing: pure-control towers have no damage
  // number for the upgrade to scale. See hasDamageAxis.
  if (!hasDamageAxis(family)) return;

  const cost = familyUpgradeCost(level);
  if (s.mana < cost) return;

  s.mana -= cost;
  s.familyUpgradeLevels[family] = level + 1;
  s.events.push({ kind: "family_upgraded", towerId: family, level: level + 1 });
}

/**
 * Damage for one tower, tier and family upgrade applied in that order.
 *
 * Every damage number in the sim goes through here. A merged tower re-rolls
 * its type, so it reads the level of the family it BECAME — which is looked up
 * from `towerId` at the moment of the hit, not cached on the tower.
 */
function towerDamage(s: GameState, towerId: TowerId, base: number, tier: number): number {
  const scaled = atTier(base, tier);
  const level = s.familyUpgradeLevels[towerId] ?? 0;
  if (level === 0) return scaled;
  return Math.floor((scaled * familyDamagePct(level)) / 100);
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
  if (s.tick % MANA_REGEN_INTERVAL !== 0) return;
  s.mana += MANA_REGEN_AMOUNT;
  s.manaFromTick += MANA_REGEN_AMOUNT;
}

/**
 * Waves run continuously. There is no break, no prep phase and no start button:
 * wave N+1 begins spawning the tick wave N finishes spawning, so enemies from
 * two waves can be walking the lane at once.
 *
 * Two reasons, in order. The playtest asked for a faster game and the breaks
 * were dead air. And with time-regenerating mana, any pause the player controls
 * lets them idle and bank, which is exactly the tension the mana model exists
 * to create.
 *
 * The wave counter advances on SPAWN completion, not on a clear. Waiting for a
 * clear would reintroduce the pause by the back door — the board would idle
 * while the last straggler walked.
 */
function advanceWaves(s: GameState, path: PathGeometry): void {
  s.waveTick += 1;
  const wave = s.level.waves[s.waveIndex];
  if (!wave) return;

  for (let i = 0; i < wave.spawns.length; i++) {
    const group = wave.spawns[i];
    const interval = spawnIntervalFor(group.intervalTicks);
    while (s.spawnCursors[i] < group.count) {
      const due = group.startTick + s.spawnCursors[i] * interval;
      if (s.waveTick < due) break;
      s.enemies.push(makeEnemy(s, group.kind, path, wave.scaling));
      s.spawnCursors[i] += 1;
    }
  }

  const allSpawned = wave.spawns.every((g, i) => s.spawnCursors[i] >= g.count);
  if (!allSpawned) return;

  // Wave sent in full: score it and hand straight over to the next one.
  s.score += SCORE_PER_WAVE;
  s.waveIndex += 1;
  s.waveTick = 0;

  const next = s.level.waves[s.waveIndex];
  s.spawnCursors = next ? next.spawns.map(() => 0) : [];
  if (next) s.events.push({ kind: "wave_start", wave: s.waveIndex + 1 });
}

function makeEnemy(
  s: GameState,
  kind: EnemyKind,
  path: PathGeometry,
  scaling: WaveScaling | undefined,
): Enemy {
  const spec = ENEMY_SPECS[kind];
  const p = posAt(path, 0);
  const hpPct = scaling ? scaling.hpPct : 100;
  const speedPct = scaling ? scaling.speedPct : 100;
  const damagePct = scaling ? scaling.damagePct : 100;
  const hp = Math.max(1, Math.floor((spec.hp * hpPct) / 100));

  return {
    id: s.nextId++,
    kind,
    hp,
    maxHp: hp,
    speed: Math.max(1, Math.floor((spec.speed * speedPct) / 100)),
    blockDamage: Math.max(0, Math.floor((spec.blockDamage * damagePct) / 100)),
    bounty: bountyFor(s.level, kind),
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
  return Math.floor((e.speed * (100 - slow)) / 100);
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
  if (e.bounty > 0) {
    s.mana += e.bounty;
    s.manaFromKills += e.bounty;
    s.events.push({ kind: "bounty", amount: e.bounty, x: e.x, y: e.y, enemy: e.kind });
  }
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
      s.lives -= leakDamageFor(e.kind);
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
        damageEnemy(s, victim, towerDamage(s, t.towerId, effect.attackDamage, t.tier));
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
    blocker.hp -= e.blockDamage;
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
        damageEnemy(s, e, towerDamage(s, t.towerId, effect.deathDamage, t.tier));
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
    damage: towerDamage(s, t.towerId, effect.damage, t.tier),
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
    // Poison magnitude IS damage — it is the one status that deals it, and it
    // is what a Venom family upgrade buys. Slow, vulnerable and armour shred
    // are control, so they scale with tier only.
    const magnitude =
      effect.status === "poison"
        ? towerDamage(s, t.towerId, effect.magnitude, t.tier)
        : atTier(effect.magnitude, t.tier);

    applyStatus(
      e.statuses,
      {
        kind: effect.status,
        magnitude,
        remainingTicks: effect.durationTicks,
        sourceId: t.towerId,
      },
      ENEMY_SPECS[e.kind].armor,
    );
    if (effect.damage > 0) {
      damageEnemy(s, e, towerDamage(s, t.towerId, effect.damage, t.tier));
    }
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

  // Wave advancement happens in advanceWaves, on spawn completion. All that is
  // left to decide here is whether the level has run out of waves AND the board
  // has emptied — the last stragglers still have to be dealt with.
  if (s.waveIndex < s.level.waves.length || s.enemies.length > 0) return;

  s.status = "won";
  s.score += s.lives * SCORE_PER_LIFE;
}
