/**
 * THE SIM. CLAUDE.md §3:
 *
 *   tick(state, inputs) -> GameState
 *
 * Pure. No wall clock, no Math.random, no DOM, no variable delta time. The
 * tick counter is the only clock and the rate is fixed at 30Hz; the renderer
 * interpolates between two states and the sim never learns a frame duration.
 *
 * `tick` never mutates its argument — it clones first, then mutates the clone.
 * The level is shared by reference because nothing ever writes to it.
 */

import { dist2, isqrt, TILE } from "./fixed.js";
import { cloneRng, nextInt, seedRng } from "./rng.js";
import { buildPath, posAt, tileCentre, type PathGeometry } from "./pathing.js";
import {
  ENEMY_SPECS,
  INCOME_MODEL,
  MAX_TOWER_LEVEL,
  REGEN_AMOUNT,
  REGEN_INTERVAL_TICKS,
  SCORE_PER_KILL,
  SCORE_PER_LIFE,
  SCORE_PER_WAVE,
  SELL_REFUND_PCT,
  START_GOLD,
  START_LIVES,
  TOWER_SPECS,
  towerDamage,
  towerRange,
  upgradeCost,
} from "./content.js";
import type {
  Enemy,
  EnemyKind,
  GameState,
  Input,
  LevelDef,
  Projectile,
  TowerKind,
} from "./types.js";

export function createInitialState(level: LevelDef): GameState {
  const first = level.waves[0];
  return {
    tick: 0,
    rng: seedRng(level.seed),
    level,
    status: "building",
    gold: START_GOLD,
    lives: START_LIVES,
    waveIndex: 0,
    waveTick: 0,
    spawnCursors: first ? first.spawns.map(() => 0) : [],
    enemies: [],
    towers: [],
    projectiles: [],
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
    status: s.status,
    gold: s.gold,
    lives: s.lives,
    waveIndex: s.waveIndex,
    waveTick: s.waveTick,
    spawnCursors: s.spawnCursors.slice(),
    enemies: s.enemies.map((e) => ({ ...e })),
    towers: s.towers.map((t) => ({ ...t })),
    projectiles: s.projectiles.map((p) => ({ ...p })),
    nextId: s.nextId,
    score: s.score,
    kills: s.kills,
    leaks: s.leaks,
  };
}

/**
 * Advance one tick. `inputs` are the actions issued on this tick, in the order
 * the player issued them — that order is part of the replay and is preserved.
 */
export function tick(prev: GameState, inputs: Input[]): GameState {
  const s = cloneState(prev);
  if (s.status === "won" || s.status === "lost") return s;

  const path = buildPath(s.level.terrain);

  applyInputs(s, inputs);

  s.tick += 1;
  if (s.status === "wave") s.waveTick += 1;

  applyIncome(s);
  spawnDue(s, path);
  moveEnemies(s, path);
  fireTowers(s);
  stepProjectiles(s);

  s.enemies = s.enemies.filter((e) => e.alive);
  s.projectiles = s.projectiles.filter((p) => p.alive);

  resolveRunState(s);
  return s;
}

// --- inputs ---------------------------------------------------------------

function applyInputs(s: GameState, inputs: Input[]): void {
  for (const input of inputs) {
    switch (input.kind) {
      case "place":
        placeTower(s, input.payload.slotIndex, input.payload.tower);
        break;
      case "upgrade":
        upgradeTower(s, input.payload.towerId);
        break;
      case "sell":
        sellTower(s, input.payload.towerId);
        break;
      case "start_wave":
        if (s.status === "building") {
          s.status = "wave";
          s.waveTick = 0;
        }
        break;
      case "ability":
        // No abilities in M0. The kind exists because §6 defines it and the
        // replay format should not change when one is added.
        break;
    }
  }
}

function placeTower(s: GameState, slotIndex: number, kind: TowerKind): void {
  const slot = s.level.terrain.slots[slotIndex];
  if (!slot) return;
  if (s.towers.some((t) => t.slotIndex === slotIndex)) return;
  const cost = TOWER_SPECS[kind].cost;
  if (s.gold < cost) return;

  const centre = tileCentre(slot);
  s.gold -= cost;
  s.towers.push({
    id: s.nextId++,
    kind,
    slotIndex,
    x: centre.x,
    y: centre.y,
    level: 1,
    cooldown: 0,
    invested: cost,
  });
}

function upgradeTower(s: GameState, towerId: number): void {
  const t = s.towers.find((x) => x.id === towerId);
  if (!t || t.level >= MAX_TOWER_LEVEL) return;
  const cost = upgradeCost(t.kind, t.level + 1);
  if (s.gold < cost) return;
  s.gold -= cost;
  t.invested += cost;
  t.level += 1;
}

function sellTower(s: GameState, towerId: number): void {
  const i = s.towers.findIndex((x) => x.id === towerId);
  if (i < 0) return;
  const t = s.towers[i];
  s.gold += Math.floor((t.invested * SELL_REFUND_PCT) / 100);
  s.towers.splice(i, 1);
}

// --- systems --------------------------------------------------------------

function applyIncome(s: GameState): void {
  if (INCOME_MODEL !== "regen") return;
  if (s.tick % REGEN_INTERVAL_TICKS === 0) s.gold += REGEN_AMOUNT;
}

function makeEnemy(s: GameState, kind: EnemyKind, dist: number, path: PathGeometry): Enemy {
  const spec = ENEMY_SPECS[kind];
  const p = posAt(path, dist);
  return {
    id: s.nextId++,
    kind,
    hp: spec.hp,
    maxHp: spec.hp,
    dist,
    x: p.x,
    y: p.y,
    alive: true,
  };
}

function spawnDue(s: GameState, path: PathGeometry): void {
  if (s.status !== "wave") return;
  const wave = s.level.waves[s.waveIndex];
  if (!wave) return;

  for (let i = 0; i < wave.spawns.length; i++) {
    const group = wave.spawns[i];
    while (s.spawnCursors[i] < group.count) {
      const due = group.startTick + s.spawnCursors[i] * group.intervalTicks;
      if (s.waveTick < due) break;
      // Stagger identical enemies slightly so a pack reads as a pack rather
      // than one sprite. The only RNG draw in M0 — seeded, so it replays.
      const jitter = nextInt(s.rng, 0, TILE / 4);
      s.enemies.push(makeEnemy(s, group.kind, -jitter, path));
      s.spawnCursors[i] += 1;
    }
  }
}

function moveEnemies(s: GameState, path: PathGeometry): void {
  for (const e of s.enemies) {
    if (!e.alive) continue;
    e.dist += ENEMY_SPECS[e.kind].speed;
    if (e.dist >= path.total) {
      e.alive = false;
      s.leaks += 1;
      s.lives -= ENEMY_SPECS[e.kind].leak;
      continue;
    }
    const p = posAt(path, e.dist);
    e.x = p.x;
    e.y = p.y;
  }
}

function fireTowers(s: GameState): void {
  for (const t of s.towers) {
    if (t.cooldown > 0) {
      t.cooldown -= 1;
      continue;
    }

    // Target the enemy furthest along the path — the conventional "first"
    // targeting. Ties break on the lower id so the choice never depends on
    // anything but the state itself.
    const r = towerRange(t.kind, t.level);
    const r2 = r * r;
    let best = -1;
    let bestDist = -1;
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      if (!e.alive) continue;
      if (dist2(t.x, t.y, e.x, e.y) > r2) continue;
      if (e.dist > bestDist || (best >= 0 && e.dist === bestDist && e.id < s.enemies[best].id)) {
        best = i;
        bestDist = e.dist;
      }
    }
    if (best < 0) continue;

    const target = s.enemies[best];
    const spec = TOWER_SPECS[t.kind];
    s.projectiles.push({
      id: s.nextId++,
      x: t.x,
      y: t.y,
      tx: target.x,
      ty: target.y,
      targetId: target.id,
      damage: towerDamage(t.kind, t.level),
      speed: spec.projectileSpeed,
      splash: spec.splash,
      kind: t.kind,
      alive: true,
    });
    t.cooldown = spec.cooldown;
  }
}

function findEnemy(s: GameState, id: number): Enemy | undefined {
  return s.enemies.find((e) => e.id === id);
}

function stepProjectiles(s: GameState): void {
  for (const p of s.projectiles) {
    if (!p.alive) continue;

    // Track the target while it lives; once it dies the shot completes to
    // where it last was, so splash still lands where the player aimed it.
    const target = findEnemy(s, p.targetId);
    if (target && target.alive) {
      p.tx = target.x;
      p.ty = target.y;
    }

    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = isqrt(dx * dx + dy * dy);
    if (d <= p.speed) {
      p.x = p.tx;
      p.y = p.ty;
      p.alive = false;
      impact(s, p);
      continue;
    }
    p.x += Math.trunc((dx * p.speed) / d);
    p.y += Math.trunc((dy * p.speed) / d);
  }
}

function impact(s: GameState, p: Projectile): void {
  if (p.splash > 0) {
    const r2 = p.splash * p.splash;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) damageEnemy(s, e, p.damage);
    }
    return;
  }
  const target = findEnemy(s, p.targetId);
  if (target && target.alive) damageEnemy(s, target, p.damage);
}

function damageEnemy(s: GameState, e: Enemy, raw: number): void {
  // Armour is flat per hit, which is what makes the arrow tower bad against
  // brutes and the cannon good — see content.ts.
  const effective = Math.max(1, raw - ENEMY_SPECS[e.kind].armor);
  e.hp -= effective;
  if (e.hp > 0) return;

  e.alive = false;
  s.kills += 1;
  s.score += SCORE_PER_KILL;
  if (INCOME_MODEL === "kill_gold") s.gold += ENEMY_SPECS[e.kind].bounty;
}

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

  s.gold += wave.reward;
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
  s.status = "building";
  s.spawnCursors = next.spawns.map(() => 0);
}
