/**
 * Glass pipes: the static boundaries payloads slide through.
 *
 * A wall is a polyline plus a thickness. Physics-wise it becomes one static
 * rectangle per segment with a circle capping every joint, so nothing snags
 * on a corner and nothing tunnels through a seam.
 *
 * Visually a channel is built up in layers: an outer glow, a tinted bore you
 * can still read the level through, banding *inside* that bore, and thin bright
 * rims down each edge. The banding is what actually sells thick glass — a
 * translucent fill between two outlines is only a tube diagram.
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
  constructor(scene, walls, pegs, skinId, tubes) {
    this.scene = scene;
    this.walls = walls;
    this.tubes = tubes || [];
    // Wall polylines that belong to a channel are drawn as part of it, not as
    // standalone bars — otherwise every tube reads as two fat glowing noodles
    // with a gap down the middle instead of one piece of glassware.
    this.pairedWalls = new Set();
    for (const t of this.tubes) {
      this.pairedWalls.add(t.left);
      this.pairedWalls.add(t.right);
    }
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

      // Joint caps stop payloads catching on the mitre between segments — but
      // only where the polyline actually turns. On a smoothed curve almost
      // every joint is near-straight, and capping them all costs hundreds of
      // bodies per level for no benefit.
      for (let i = 1; i < w.points.length - 1; i++) {
        const [px, py] = w.points[i - 1];
        const [x, y] = w.points[i];
        const [nx, ny] = w.points[i + 1];
        const a1 = Math.atan2(y - py, x - px);
        const a2 = Math.atan2(ny - y, nx - x);
        let turn = Math.abs(a2 - a1);
        if (turn > Math.PI) turn = Math.PI * 2 - turn;
        if (turn < 0.14) continue; // ~8 degrees

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

  /**
   * Stroke a polyline. `dots` rounds the joints by dotting every vertex, which
   * a sparse polyline needs and a dense curve must not have — on a smoothed
   * curve it beads the whole edge into a caterpillar.
   */
  _strokePoly(g, points, width, color, alpha, dots = true) {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokePath();

    if (!dots) return;
    g.fillStyle(color, alpha);
    for (const [x, y] of points) g.fillCircle(x, y, width / 2);
  }

  /**
   * Draw a stroke as a single filled ribbon.
   *
   * Phaser strokes a polyline segment by segment, so on a smoothed curve —
   * where segments are shorter than the line is wide — every joint overlaps
   * and a translucent edge beads into a caterpillar. One polygon has no
   * joints to overlap.
   */
  _fillStroke(g, points, width, color, alpha) {
    const half = width / 2;
    const last = points.length - 1;
    const side = (sign) =>
      points.map((p, i) => {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(last, i + 1)];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        return { x: p[0] - (dy / len) * half * sign, y: p[1] + (dx / len) * half * sign };
      });

    const poly = [...side(1), ...side(-1).reverse()];
    g.fillStyle(color, alpha);
    g.fillPoints(poly, true);
    // Round the two ends so the glass does not stop square.
    g.fillCircle(points[0][0], points[0][1], half);
    g.fillCircle(points[last][0], points[last][1], half);
  }

  /** Fill the ribbon between a channel's two edges. */
  _fillChannel(g, left, right, color, alpha) {
    const pts = [];
    for (const [x, y] of left) pts.push({ x, y });
    for (let i = right.length - 1; i >= 0; i--) pts.push({ x: right[i][0], y: right[i][1] });
    g.fillStyle(color, alpha);
    g.fillPoints(pts, true);
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

    // --- channels: transparent glass body between two bright rims ---
    for (const tube of this.tubes) {
      const { left, right } = tube;

      // The bore: a pane of tinted glass you can still read the level through.
      this._fillChannel(g, left, right, 0xcfeeff, 0.17);
      this._fillChannel(g, left, right, glowColor, 0.07);
      this._glassInterior(g, left, right);

      // Thin bright rims, the way real glassware reads — not fat bars.
      const edges = [left, right];
      // A capped channel is a sealed vessel: bridge the two walls across the
      // top so the reservoir closes instead of ending in mid-air. Bowls stay
      // open, because everything above them pours in through the mouth.
      if (tube.cap) edges.push([left[0], right[0]]);
      for (const side of edges) {
        this._fillStroke(glow, side, 18, glowColor, 0.14);
        this._fillStroke(g, side, 10, 0xdff6ff, 0.22);
        this._fillStroke(g, side, 4.5, stroke, 0.95);
        this._fillStroke(g, side, 1.5, 0xffffff, 0.7);
      }

      // A tint of the skin's rim colour along the near wall, so a gold or neon
      // pipe reads as that material rather than as white glass with a stripe.
      this._fillStroke(g, this._alongBore(left, right, 0.06), 4, rim, 0.3);
    }

    // --- standalone walls (shelves, dividers) keep the solid-bar treatment ---
    for (const w of this.walls) {
      if (this.pairedWalls.has(w.points)) continue;
      const t = w.t;
      const pts = w.points;
      this._fillStroke(glow, pts, t + 16, glowColor, 0.16);
      this._fillStroke(g, pts, t, 0xdff6ff, 0.15);
      this._fillStroke(g, pts, 4, stroke, 0.95);
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

  /**
   * A line running down the bore at a fixed fraction of its width.
   *
   * `f` of 0 hugs the left wall and 1 the right, so the same helper places the
   * specular streak, its narrow companion and the shading near the far wall.
   */
  _alongBore(left, right, f) {
    const n = Math.min(left.length, right.length);
    const line = [];
    for (let i = 0; i < n; i++) {
      line.push([
        left[i][0] + (right[i][0] - left[i][0]) * f,
        left[i][1] + (right[i][1] - left[i][1]) * f,
      ]);
    }
    return line;
  }

  /**
   * What makes the glass read as glass.
   *
   * A translucent fill between two rims is only a tube outline; thick glass is
   * sold by what happens *inside* the bore. Light from the upper left puts a
   * bright streak just in from the near wall with a thin companion beside it,
   * and the far side of the bore darkens where the wall's thickness is seen
   * edge-on. Both follow the curve, so a bend shows the same banding a real
   * bent tube would.
   */
  _glassInterior(g, left, right) {
    // Shading against the far wall first, so the highlights sit on top of it.
    this._fillStroke(g, this._alongBore(left, right, 0.87), 13, 0x0b1a2c, 0.13);

    this._fillStroke(g, this._alongBore(left, right, 0.2), 7, 0xffffff, 0.16);
    this._fillStroke(g, this._alongBore(left, right, 0.12), 2.5, 0xffffff, 0.34);
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
