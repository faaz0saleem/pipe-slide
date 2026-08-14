/**
 * Glass pipes: the static boundaries payloads slide through.
 *
 * A wall is a polyline plus a thickness. Physics-wise it becomes one static
 * rectangle per segment with a circle capping every joint, so nothing snags
 * on a corner and nothing tunnels through a seam. Visually it is stroked four
 * times — outer glow, transparent glass body, bright rim, specular streak —
 * which is what sells the "thick glass" read while the fill stays see-through.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config/GameConfig.js';
import { getItem } from '../config/ShopCatalog.js';

export default class PipeSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {Array} walls level.walls
   * @param {Array} pegs  level.pegs
   * @param {string} skinId equipped pipe cosmetic
   */
  constructor(scene, walls, pegs, skinId) {
    this.scene = scene;
    this.walls = walls;
    this.pegs = pegs || [];
    this.skin = getItem(skinId) || getItem('pipe_glass');
    this.bodies = [];

    this.glowGfx = scene.add.graphics().setDepth(DEPTH.pipeGlow);
    this.glowGfx.setBlendMode(Phaser.BlendModes.ADD);
    this.gfx = scene.add.graphics().setDepth(DEPTH.pipe);

    this._hue = 0;
    this._buildBodies();
    this.redraw();
  }

  /* ----------------------------- physics ----------------------------- */

  _buildBodies() {
    const { matter } = this.scene;

    for (const w of this.walls) {
      const t = w.t;
      for (let i = 0; i < w.points.length - 1; i++) {
        const [x0, y0] = w.points[i];
        const [x1, y1] = w.points[i + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;

        const body = matter.add.rectangle((x0 + x1) / 2, (y0 + y1) / 2, len + t, t, {
          isStatic: true,
          angle: Math.atan2(dy, dx),
          friction: 0.08,
          restitution: 0.05,
          label: 'wall',
          chamfer: { radius: Math.min(t / 2, 6) },
        });
        this.bodies.push(body);
      }

      // Joint caps stop payloads catching on the mitre between segments.
      if (w.points.length > 2) {
        for (let i = 1; i < w.points.length - 1; i++) {
          const [x, y] = w.points[i];
          this.bodies.push(
            matter.add.circle(x, y, t / 2, {
              isStatic: true,
              friction: 0.08,
              restitution: 0.05,
              label: 'wall',
            })
          );
        }
      }
    }

    for (const peg of this.pegs) {
      this.bodies.push(
        this.scene.matter.add.circle(peg.x, peg.y, peg.r, {
          isStatic: true,
          friction: 0.02,
          restitution: 0.42,
          label: 'peg',
        })
      );
    }
  }

  /* ----------------------------- rendering ---------------------------- */

  /** Stroke `points` with round joints by also dotting every vertex. */
  _strokePoly(g, points, width, color, alpha) {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokePath();

    g.fillStyle(color, alpha);
    for (const [x, y] of points) g.fillCircle(x, y, width / 2);
  }

  redraw() {
    const g = this.gfx;
    const glow = this.glowGfx;
    g.clear();
    glow.clear();

    const skin = this.skin;
    const stroke = skin.rainbow ? this._rainbow(0) : skin.stroke;
    const glowColor = skin.rainbow ? this._rainbow(0.25) : skin.glow;
    const rim = skin.rainbow ? this._rainbow(0.5) : skin.rim;

    for (const w of this.walls) {
      const t = w.t;
      const pts = w.points;

      // 1. Outer bloom.
      this._strokePoly(glow, pts, t + 16, glowColor, 0.16);
      this._strokePoly(glow, pts, t + 6, glowColor, 0.2);

      // 2. Glass body — deliberately near-transparent so the level reads through it.
      this._strokePoly(g, pts, t, 0xdff6ff, 0.13);
      this._strokePoly(g, pts, t * 0.72, 0xffffff, 0.06);

      // 3. Bright rim.
      this._strokePoly(g, pts, 3.5, stroke, 0.95);

      // 4. Specular streak, offset along each segment's normal.
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * (t * 0.24);
        const ny = (dx / len) * (t * 0.24);
        g.lineStyle(2, rim, 0.5);
        g.beginPath();
        g.moveTo(x0 + nx + (dx / len) * 6, y0 + ny + (dy / len) * 6);
        g.lineTo(x1 + nx - (dx / len) * 6, y1 + ny - (dy / len) * 6);
        g.strokePath();
      }
    }

    // Pegs share the pipe skin so bonus levels feel of a piece.
    for (const peg of this.pegs) {
      glow.fillStyle(glowColor, 0.22);
      glow.fillCircle(peg.x, peg.y, peg.r + 8);
      g.fillStyle(0xdff6ff, 0.16);
      g.fillCircle(peg.x, peg.y, peg.r);
      g.lineStyle(3, stroke, 0.95);
      g.strokeCircle(peg.x, peg.y, peg.r);
      g.fillStyle(rim, 0.5);
      g.fillCircle(peg.x - peg.r * 0.3, peg.y - peg.r * 0.35, peg.r * 0.26);
    }
  }

  _rainbow(offset) {
    const h = (this._hue + offset) % 1;
    const c = Phaser.Display.Color.HSVToRGB(h, 0.75, 1);
    return (c.r << 16) | (c.g << 8) | c.b;
  }

  /** Only the Prism skin animates, so this is a no-op for everyone else. */
  update(_time, delta) {
    if (!this.skin.rainbow) return;
    this._hue = (this._hue + delta * 0.00012) % 1;
    this.redraw();
  }

  destroy() {
    for (const b of this.bodies) this.scene.matter.world.remove(b);
    this.bodies.length = 0;
    this.gfx.destroy();
    this.glowGfx.destroy();
  }
}
