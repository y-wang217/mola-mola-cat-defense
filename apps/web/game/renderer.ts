/**
 * Pixi render layer. CLAUDE.md §5: this reads sim state and draws it. It never
 * writes to sim state and the sim never imports anything from here.
 *
 * Conveyance the design depends on, not decoration:
 *   - blocked enemies must visibly stop and engage — it is the clearest readout
 *     in the game and the reason a leak is comprehensible rather than arithmetic
 *   - status effects must be visible, or status towers feel broken rather than
 *     subtle
 */

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { ENEMY_SPECS, TILE, rangeAtTier, tileCentre, towerSpec } from "@siege/sim";
import type { Enemy, GameState, StatusKind } from "@siege/sim";

const COLORS = {
  ground: 0x0d1117,
  tile: 0x161b22,
  lane: 0x2b3441,
  platform: 0x11213a,
  platformEdge: 0x1f6feb,
  laneTile: 0x3a2f1b,
  laneTileEdge: 0xd29922,
  projectile: 0x58d6ff,
  melee: 0xf0a04b,
  status: 0xc084fc,
  range: 0x58d6ff,
  merge: 0x3fb950,
  hp: 0x3fb950,
  hpBack: 0x00000088,
  engaged: 0xff6b6b,
} as const;

const FAMILY_COLOR: Record<string, number> = {
  projectile: COLORS.projectile,
  melee: COLORS.melee,
  status: COLORS.status,
};

const ENEMY_COLOR: Record<string, number> = {
  runner: 0xf5d547,
  armoured: 0x9aa5b1,
  swarm: 0x7ee787,
  flier: 0x8be9fd,
  brute: 0xff6b6b,
  boss: 0xff2e63,
};

const STATUS_COLOR: Record<StatusKind, number> = {
  slow: 0x58d6ff,
  poison: 0x7ee787,
  vulnerable: 0xff79c6,
  armor_shred: 0xffb86c,
  mark: 0xffffff,
  stun: 0xf1fa8c,
};

const STATUS_ORDER: StatusKind[] = ["slow", "poison", "vulnerable", "armor_shred", "mark", "stun"];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Renderer {
  private app = new Application();
  private world = new Container();
  private staticLayer = new Graphics();
  private dynamicLayer = new Graphics();
  private iconLayer = new Container();
  private iconPool: Text[] = [];
  private iconUsed = 0;
  private floaterLayer = new Container();
  private floaterPool: Text[] = [];
  private selectedTowerId: number | null = null;
  private partnerIds: number[] = [];
  private built = false;

  async init(canvasHost: HTMLElement, state: GameState): Promise<void> {
    await this.app.init({
      background: COLORS.ground,
      antialias: true,
      resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
      autoDensity: true,
      autoStart: false, // we drive the loop — see useGame.ts
      width: 100,
      height: 100,
    });
    canvasHost.appendChild(this.app.canvas);
    this.world.addChild(this.staticLayer, this.dynamicLayer, this.iconLayer, this.floaterLayer);
    this.app.stage.addChild(this.world);
    this.drawStatic(state);
    this.built = true;
  }

  setSelected(towerId: number | null): void {
    this.selectedTowerId = towerId;
  }

  setPartners(ids: number[]): void {
    this.partnerIds = ids;
  }

  resize(width: number, height: number, state: GameState): void {
    if (!this.built) return;
    this.app.renderer.resize(width, height);
    const { terrain } = state.level;
    const pxPerTile = Math.min(width / terrain.width, height / terrain.height);
    // Draw in fixed-point world units and let the container scale, so nothing
    // in here has to know about pixels.
    this.world.scale.set(pxPerTile / TILE);
    this.world.position.set(
      (width - pxPerTile * terrain.width) / 2,
      (height - pxPerTile * terrain.height) / 2,
    );
  }

  /** Board furniture: grid, lane, and the two classes of buildable tile. */
  private drawStatic(state: GameState): void {
    const g = this.staticLayer;
    const { terrain } = state.level;
    g.clear();

    for (let y = 0; y < terrain.height; y++) {
      for (let x = 0; x < terrain.width; x++) {
        g.rect(x * TILE + 20, y * TILE + 20, TILE - 40, TILE - 40);
      }
    }
    g.fill({ color: COLORS.tile });

    const pts = terrain.path.map(tileCentre);
    for (let i = 1; i < pts.length; i++) {
      g.moveTo(pts[i - 1].x, pts[i - 1].y);
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.stroke({ width: TILE * 0.82, color: COLORS.lane, cap: "round", join: "round" });

    // Lane tiles read warm, platforms read cool — the class is the placement
    // rule, so it has to be legible at a glance.
    for (const tile of terrain.tiles) {
      if (tile.class !== "path") continue;
      const c = tileCentre(tile.pos);
      g.roundRect(c.x - TILE * 0.38, c.y - TILE * 0.38, TILE * 0.76, TILE * 0.76, TILE * 0.14);
    }
    g.fill({ color: COLORS.laneTile });
    g.stroke({ width: 30, color: COLORS.laneTileEdge, alpha: 0.8 });

    for (const tile of terrain.tiles) {
      if (tile.class !== "platform") continue;
      const c = tileCentre(tile.pos);
      g.roundRect(c.x - TILE * 0.34, c.y - TILE * 0.34, TILE * 0.68, TILE * 0.68, TILE * 0.14);
    }
    g.fill({ color: COLORS.platform });
    g.stroke({ width: 26, color: COLORS.platformEdge, alpha: 0.6 });
  }

  draw(prev: GameState, cur: GameState, alpha: number): void {
    if (!this.built) return;
    const g = this.dynamicLayer;
    g.clear();

    const prevEnemies = new Map(prev.enemies.map((e) => [e.id, e]));
    const prevProjectiles = new Map(prev.projectiles.map((p) => [p.id, p]));

    // Range ring for the selected tower, under everything else.
    if (this.selectedTowerId !== null) {
      const t = cur.towers.find((x) => x.id === this.selectedTowerId);
      if (t) {
        const spec = towerSpec(t.towerId);
        const melee = spec.effect.kind === "block";
        g.circle(t.x, t.y, rangeAtTier(spec.range, t.tier));
        g.fill({ color: melee ? COLORS.melee : COLORS.range, alpha: 0.07 });
        g.stroke({ width: 20, color: melee ? COLORS.melee : COLORS.range, alpha: 0.45 });
      }
    }

    for (const t of cur.towers) {
      const spec = towerSpec(t.towerId);
      const selected = t.id === this.selectedTowerId;
      const partner = this.partnerIds.includes(t.id);
      const size = spec.family === "melee" ? TILE * 0.58 : TILE * 0.5;

      // Family is the plate colour; the glyph on top carries the role.
      g.roundRect(t.x - size / 2, t.y - size / 2, size, size, TILE * 0.1);
      g.fill({ color: FAMILY_COLOR[spec.family] ?? 0xffffff, alpha: 0.22 });
      g.stroke({ width: 34, color: FAMILY_COLOR[spec.family] ?? 0xffffff, alpha: 0.9 });

      if (partner || selected) {
        g.roundRect(t.x - size * 0.72, t.y - size * 0.72, size * 1.44, size * 1.44, TILE * 0.14);
        g.stroke({ width: 46, color: partner ? COLORS.merge : 0xffffff, alpha: 0.95 });
      }

      // Tier needs its own indicator: emoji cannot be tinted, so tier cannot
      // ride on the glyph's colour. Pips below the plate.
      for (let i = 1; i < t.tier; i++) {
        g.circle(t.x - TILE * 0.14 + i * TILE * 0.14, t.y + size / 2 + TILE * 0.11, TILE * 0.05);
      }
      if (t.tier > 1) g.fill({ color: 0xffffff, alpha: 0.95 });

      // Blockers carry a health bar — watching it fall is the warning that a
      // leak is coming.
      if (t.maxHp > 0) {
        const w = TILE * 0.7;
        const top = t.y - size / 2 - 130;
        g.rect(t.x - w / 2, top, w, 65);
        g.fill({ color: COLORS.hpBack });
        g.rect(t.x - w / 2, top, (w * Math.max(0, t.hp)) / t.maxHp, 65);
        g.fill({ color: COLORS.hp });
      }
    }

    for (const e of cur.enemies) {
      const p = prevEnemies.get(e.id);
      const off = engagedOffset(e);
      const x = (p ? lerp(p.x, e.x, alpha) : e.x) + off.x;
      const y = (p ? lerp(p.y, e.y, alpha) : e.y) + off.y;
      const spec = ENEMY_SPECS[e.kind];

      g.circle(x, y, spec.radius);
      g.fill({ color: ENEMY_COLOR[e.kind] ?? 0xffffff, alpha: 0.28 });
      g.stroke({ width: 34, color: ENEMY_COLOR[e.kind] ?? 0xffffff, alpha: 0.95 });

      if (spec.flying) {
        // Fliers get a halo: they are the enemy blockers cannot touch.
        g.circle(x, y, spec.radius + 90);
        g.stroke({ width: 26, color: 0xffffff, alpha: 0.55 });
      }
      if (spec.armor > 0) {
        g.circle(x, y, spec.radius);
        g.stroke({ width: 44, color: 0xffffff, alpha: 0.65 });
      }

      // Engaged: stopped and fighting a blocker. Drawn as a hard ring so it is
      // obvious the enemy is being held rather than stuck.
      if (e.blockedBy !== 0) {
        g.circle(x, y, spec.radius + 150);
        g.stroke({ width: 44, color: COLORS.engaged, alpha: 0.9 });
      }

      // Status conveyance is an OUTLINE plus pips, never a tint on the glyph.
      if (e.statuses.length > 0) {
        const top = e.statuses[0].kind;
        g.circle(x, y, spec.radius + 60);
        g.stroke({ width: 50, color: STATUS_COLOR[top], alpha: 0.9 });
      }
      drawStatusPips(g, e, x, y, spec.radius);

      // Trash tier gets no bar — at that size it is noise, not information.
      if (!spec.trash && e.hp < e.maxHp) {
        const w = spec.radius * 2.2;
        const top = y - spec.radius - 150;
        g.rect(x - w / 2, top, w, 70);
        g.fill({ color: COLORS.hpBack });
        g.rect(x - w / 2, top, (w * Math.max(0, e.hp)) / e.maxHp, 70);
        g.fill({ color: COLORS.hp });
      }
    }

    // Glyphs last so they sit above the geometry.
    this.iconUsed = 0;
    for (const t of cur.towers) {
      this.glyph(towerSpec(t.towerId).icon, t.x, t.y, TILE * 0.34);
    }
    for (const e of cur.enemies) {
      const p = prevEnemies.get(e.id);
      const spec = ENEMY_SPECS[e.kind];
      const off = engagedOffset(e);
      this.glyph(
        spec.icon,
        (p ? lerp(p.x, e.x, alpha) : e.x) + off.x,
        (p ? lerp(p.y, e.y, alpha) : e.y) + off.y,
        spec.radius * 1.5,
      );
    }
    for (let i = this.iconUsed; i < this.iconPool.length; i++) this.iconPool[i].visible = false;

    for (const proj of cur.projectiles) {
      const p = prevProjectiles.get(proj.id);
      const x = p ? lerp(p.x, proj.x, alpha) : proj.x;
      const y = p ? lerp(p.y, proj.y, alpha) : proj.y;
      g.circle(x, y, proj.splash > 0 ? 110 : 70);
      g.fill({ color: COLORS.projectile });
    }

    this.app.renderer.render(this.app.stage);
  }

  /**
   * Pooled emoji glyph. Emoji cannot be reliably tinted, so every colour cue —
   * family, tier, status — is drawn as geometry around the glyph rather than
   * applied to it.
   */
  private glyph(text: string, x: number, y: number, size: number): void {
    let t = this.iconPool[this.iconUsed];
    if (!t) {
      t = new Text({ text: "", style: new TextStyle({ fontSize: 400 }) });
      t.anchor.set(0.5);
      this.iconPool.push(t);
      this.iconLayer.addChild(t);
    }
    t.visible = true;
    t.text = text;
    t.style.fontSize = size;
    t.x = x;
    t.y = y;
    this.iconUsed++;
  }

  /**
   * Floating mana numbers on kill. Sized and coloured by how big the bounty was,
   * so a brute reads as a payout without the player parsing the digits.
   *
   * Lifetimes are owned here, not in the sim — this is presentation.
   */
  drawFloaters(floaters: { amount: number; x: number; y: number; age: number; life: number }[]): void {
    if (!this.built) return;

    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      let text = this.floaterPool[i];
      if (!text) {
        text = new Text({ text: "", style: new TextStyle({ fontSize: 320, fontWeight: "700" }) });
        text.anchor.set(0.5, 1);
        this.floaterPool.push(text);
        this.floaterLayer.addChild(text);
      }

      const t = f.age / f.life;
      const big = f.amount >= 50;
      const mid = f.amount >= 15;
      text.visible = true;
      text.text = `+${f.amount}`;
      text.style.fontSize = big ? 460 : mid ? 380 : 300;
      text.style.fill = big ? 0xffd166 : mid ? 0xffe9a8 : 0xc9d4e3;
      text.x = f.x;
      // Drift upward and fade as it ages.
      text.y = f.y - 200 - t * 700;
      text.alpha = 1 - t * t;
    }

    for (let i = floaters.length; i < this.floaterPool.length; i++) {
      this.floaterPool[i].visible = false;
    }
  }

  destroy(): void {
    if (!this.built) return;
    this.built = false;
    this.app.destroy(true, { children: true });
  }
}

/**
 * Blocked enemies stop AT the blocker's tile centre, which in the sim is the
 * same point the tower occupies — so drawn literally they vanish underneath it
 * and the single clearest readout in the game becomes a smudge. Fan them around
 * the tile instead. Render-only: the sim position is untouched.
 */
function engagedOffset(e: Enemy): { x: number; y: number } {
  if (e.blockedBy === 0) return { x: 0, y: 0 };
  const slot = e.id % 3;
  const angle = (slot / 3) * Math.PI * 2 + Math.PI / 2;
  const radius = 430;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** A small stack of coloured dots under the enemy, one per active status. */
function drawStatusPips(g: Graphics, e: Enemy, x: number, y: number, radius: number): void {
  const active = STATUS_ORDER.filter((k) => e.statuses.some((s) => s.kind === k));
  if (active.length === 0) return;

  const spacing = 150;
  const startX = x - ((active.length - 1) * spacing) / 2;
  for (let i = 0; i < active.length; i++) {
    g.circle(startX + i * spacing, y + radius + 150, 62);
    g.fill({ color: STATUS_COLOR[active[i]] });
  }
}
