/**
 * Pixi render layer. CLAUDE.md §5: this reads sim state and draws it. It never
 * writes to sim state and the sim never imports anything from here.
 *
 * It is handed two consecutive sim states and an alpha, and interpolates
 * between them, which is why the sim can run at a fixed 30Hz while the screen
 * runs at whatever the display does.
 */

import { Application, Container, Graphics } from "pixi.js";
import { ENEMY_SPECS, TILE, tileCentre, towerRange, unfp } from "@siege/sim";
import type { GameState } from "@siege/sim";

const COLORS = {
  ground: 0x0d1117,
  tile: 0x161b22,
  path: 0x2b3441,
  pathEdge: 0x3d4857,
  slot: 0x1f6feb,
  slotFill: 0x11213a,
  arrow: 0x58d6ff,
  cannon: 0xff9f43,
  runner: 0xf5d547,
  swarm: 0x7ee787,
  brute: 0xff6b6b,
  hp: 0x3fb950,
  hpBack: 0x00000088,
  range: 0x58d6ff,
} as const;

const TOWER_COLOR = { arrow: COLORS.arrow, cannon: COLORS.cannon } as const;
const ENEMY_COLOR = { runner: COLORS.runner, swarm: COLORS.swarm, brute: COLORS.brute } as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Renderer {
  private app = new Application();
  private world = new Container();
  private staticLayer = new Graphics();
  private dynamicLayer = new Graphics();
  private selectedTowerId: number | null = null;
  private built = false;

  async init(canvasHost: HTMLElement, state: GameState): Promise<void> {
    await this.app.init({
      background: COLORS.ground,
      antialias: true,
      resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
      autoDensity: true,
      // We drive the loop ourselves — see useGame.ts.
      autoStart: false,
      width: 100,
      height: 100,
    });
    canvasHost.appendChild(this.app.canvas);
    this.world.addChild(this.staticLayer, this.dynamicLayer);
    this.app.stage.addChild(this.world);
    this.drawStatic(state);
    this.built = true;
  }

  get canvas(): HTMLCanvasElement | undefined {
    return this.built ? this.app.canvas : undefined;
  }

  setSelected(towerId: number | null): void {
    this.selectedTowerId = towerId;
  }

  resize(width: number, height: number, state: GameState): void {
    if (!this.built) return;
    this.app.renderer.resize(width, height);
    const { terrain } = state.level;
    const pxPerTile = Math.min(width / terrain.width, height / terrain.height);
    // Draw in fixed-point world units and let the container do the scaling,
    // so nothing in here has to know about pixels.
    this.world.scale.set(pxPerTile / TILE);
    this.world.position.set(
      (width - pxPerTile * terrain.width) / 2,
      (height - pxPerTile * terrain.height) / 2,
    );
  }

  /** Board furniture: tiles, the lane, the buildable slots. Drawn once. */
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

    // The lane, drawn as one thick polyline through the waypoints.
    const pts = terrain.path.map(tileCentre);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke({ width: TILE * 0.82, color: COLORS.path, cap: "round", join: "round" });

    for (const slot of terrain.slots) {
      const c = tileCentre(slot);
      g.roundRect(c.x - TILE * 0.36, c.y - TILE * 0.36, TILE * 0.72, TILE * 0.72, TILE * 0.16);
    }
    g.fill({ color: COLORS.slotFill });
    g.stroke({ width: 26, color: COLORS.slot, alpha: 0.65 });
  }

  /**
   * @param prev state at the last tick
   * @param cur  state at the current tick
   * @param alpha 0..1 progress between them
   */
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
        g.circle(t.x, t.y, towerRange(t.kind, t.level));
        g.fill({ color: COLORS.range, alpha: 0.07 });
        g.stroke({ width: 20, color: COLORS.range, alpha: 0.5 });
      }
    }

    for (const t of cur.towers) {
      const size = t.kind === "cannon" ? TILE * 0.56 : TILE * 0.46;
      g.roundRect(t.x - size / 2, t.y - size / 2, size, size, TILE * 0.1);
      g.fill({ color: TOWER_COLOR[t.kind] });
      // One pip per upgrade level above the first.
      for (let i = 1; i < t.level; i++) {
        g.circle(t.x - TILE * 0.16 + i * TILE * 0.16, t.y + size / 2 + TILE * 0.1, TILE * 0.05);
      }
      if (t.level > 1) g.fill({ color: 0xffffff, alpha: 0.85 });
    }

    for (const e of cur.enemies) {
      const p = prevEnemies.get(e.id);
      const x = p ? lerp(p.x, e.x, alpha) : e.x;
      const y = p ? lerp(p.y, e.y, alpha) : e.y;
      const spec = ENEMY_SPECS[e.kind];

      g.circle(x, y, spec.radius);
      g.fill({ color: ENEMY_COLOR[e.kind] });
      if (spec.armor > 0) {
        g.circle(x, y, spec.radius);
        g.stroke({ width: 40, color: 0xffffff, alpha: 0.7 });
      }

      if (e.hp < e.maxHp) {
        const w = spec.radius * 2.2;
        const h = 70;
        const top = y - spec.radius - 140;
        g.rect(x - w / 2, top, w, h);
        g.fill({ color: COLORS.hpBack });
        g.rect(x - w / 2, top, (w * e.hp) / e.maxHp, h);
        g.fill({ color: COLORS.hp });
      }
    }

    for (const proj of cur.projectiles) {
      const p = prevProjectiles.get(proj.id);
      const x = p ? lerp(p.x, proj.x, alpha) : proj.x;
      const y = p ? lerp(p.y, proj.y, alpha) : proj.y;
      g.circle(x, y, proj.kind === "cannon" ? 110 : 70);
      g.fill({ color: TOWER_COLOR[proj.kind] });
    }

    this.app.renderer.render(this.app.stage);
  }

  destroy(): void {
    if (!this.built) return;
    this.built = false;
    this.app.destroy(true, { children: true });
  }
}

/** Fixed-point world units -> tiles, for positioning DOM overlays. */
export function fpToTiles(n: number): number {
  return unfp(n);
}
