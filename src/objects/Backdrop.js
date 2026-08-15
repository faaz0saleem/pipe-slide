/**
 * Themed backdrop: gradient sky, a soft light behind the pipes, two layers of
 * parallax silhouettes and drifting motes. Every chapter gets its own palette
 * and silhouette shape, so the game visibly changes as the player climbs.
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, GROUND_Y, DEPTH } from '../config/GameConfig.js';
import { CHAPTER_THEMES, mix } from '../config/Palette.js';
import { ensureBackdrop } from '../core/Art.js';

export default class Backdrop {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} themeKey chapter theme id
   * @param {object} opts { motes:boolean, parallax:boolean }
   */
  constructor(scene, themeKey, opts = {}) {
    this.scene = scene;
    this.theme = CHAPTER_THEMES[themeKey] || CHAPTER_THEMES.mine;
    this.layers = [];

    const w = scene.scale.width || WIDTH;
    const h = scene.scale.height || HEIGHT;
    this.w = w;
    this.h = h;

    this._sky(themeKey, w, h);
    this._glow(w, h);
    if (opts.parallax !== false) this._ridges(w, h);
    if (opts.ground !== false) this._ground(w, h);
    if (opts.motes !== false) this._motes(w, h);
    this._vignette(w, h);
  }

  _sky(themeKey, w, h) {
    const [top, bottom] = this.theme.sky;
    const key = ensureBackdrop(this.scene, `sky_${themeKey}_${w}x${h}`, 64, h, [
      [0, mix(top, 0xffffff, 0.12)],
      [0.35, top],
      [1, bottom],
    ]);
    const img = this.scene.add.image(w / 2, h / 2, key);
    img.setDisplaySize(w, h);
    img.setDepth(DEPTH.bg);
    this.layers.push(img);
  }

  _glow(w, h) {
    const g = this.scene.add.image(w / 2, h * 0.42, 'fx_glow');
    g.setDisplaySize(w * 1.5, h * 0.8);
    g.setTint(this.theme.glow);
    g.setAlpha(0.2);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.setDepth(DEPTH.bg + 1);
    this.glowImg = g;
    this.layers.push(g);

    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0.14, to: 0.26 },
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  /** Two silhouette bands behind the play field. */
  _ridges(w, h) {
    const shapes = {
      rock: (g, y, color, alpha, scale) => this._jagged(g, y, color, alpha, scale, 7, 120),
      hill: (g, y, color, alpha, scale) => this._rolling(g, y, color, alpha, scale),
      crystal: (g, y, color, alpha, scale) => this._jagged(g, y, color, alpha, scale, 11, 180),
      ice: (g, y, color, alpha, scale) => this._jagged(g, y, color, alpha, scale, 9, 150),
      gear: (g, y, color, alpha, scale) => this._gears(g, y, color, alpha, scale),
      cloud: (g, y, color, alpha, scale) => this._rolling(g, y, color, alpha, scale),
      city: (g, y, color, alpha, scale) => this._city(g, y, color, alpha, scale),
    };
    const draw = shapes[this.theme.shape] || shapes.rock;

    const far = this.scene.add.graphics().setDepth(DEPTH.parallax);
    draw(far, h * 0.62, this.theme.ridge[0], 0.55, 1.0);
    const near = this.scene.add.graphics().setDepth(DEPTH.parallax + 1);
    draw(near, h * 0.74, this.theme.ridge[1], 0.8, 1.35);

    this.layers.push(far, near);
    this.parallax = [
      { obj: far, factor: 0.02 },
      { obj: near, factor: 0.045 },
    ];
  }

  _jagged(g, baseY, color, alpha, scale, teeth, height) {
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(-40, this.h);
    g.lineTo(-40, baseY);
    const step = (this.w + 80) / teeth;
    for (let i = 0; i <= teeth; i++) {
      const x = -40 + i * step;
      const peak = baseY - (i % 2 === 0 ? height : height * 0.55) * scale * (0.7 + ((i * 13) % 7) / 12);
      g.lineTo(x, peak);
      g.lineTo(x + step / 2, baseY - 10);
    }
    g.lineTo(this.w + 40, this.h);
    g.closePath();
    g.fillPath();
  }

  _rolling(g, baseY, color, alpha, scale) {
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(-40, this.h);
    g.lineTo(-40, baseY);
    const bumps = 4;
    const step = (this.w + 80) / bumps;
    for (let i = 0; i < bumps; i++) {
      const x = -40 + i * step;
      g.arc(x + step / 2, baseY, (step / 2) * scale * 0.62, Math.PI, 0);
      g.lineTo(x + step, baseY);
    }
    g.lineTo(this.w + 40, this.h);
    g.closePath();
    g.fillPath();
  }

  _gears(g, baseY, color, alpha, scale) {
    g.fillStyle(color, alpha);
    g.fillRect(-40, baseY, this.w + 80, this.h - baseY);
    const cogs = [
      [90, baseY - 40, 78],
      [300, baseY - 78, 110],
      [560, baseY - 30, 88],
      [680, baseY - 96, 62],
    ];
    for (const [cx, cy, r0] of cogs) {
      const r = r0 * scale * 0.7;
      g.fillCircle(cx, cy, r);
      const teeth = 10;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        g.fillRect(
          cx + Math.cos(a) * r - r * 0.13,
          cy + Math.sin(a) * r - r * 0.13,
          r * 0.26,
          r * 0.26
        );
      }
    }
  }

  _city(g, baseY, color, alpha, scale) {
    g.fillStyle(color, alpha);
    let x = -40;
    let i = 0;
    while (x < this.w + 40) {
      const w = 46 + ((i * 37) % 60);
      const h = (90 + ((i * 53) % 200)) * scale * 0.8;
      g.fillRect(x, baseY - h, w, this.h - baseY + h);
      // Lit windows.
      g.fillStyle(mix(color, 0xffffff, 0.5), alpha * 0.5);
      for (let wy = baseY - h + 14; wy < baseY - 12; wy += 26) {
        for (let wx = x + 8; wx < x + w - 12; wx += 20) {
          if ((wx + wy) % 3 === 0) g.fillRect(wx, wy, 8, 12);
        }
      }
      g.fillStyle(color, alpha);
      x += w + 12;
      i++;
    }
  }

  _ground(w, h) {
    const g = this.scene.add.graphics().setDepth(DEPTH.ground);
    const top = GROUND_Y;

    g.fillStyle(mix(this.theme.ridge[1], 0x000000, 0.35), 1);
    g.fillRect(0, top, w, h - top);
    g.fillStyle(mix(this.theme.ridge[0], 0xffffff, 0.08), 1);
    g.fillRect(0, top, w, 10);
    g.fillStyle(this.theme.accent, 0.25);
    g.fillRect(0, top, w, 3);

    // Waste drains: anything that misses a pit lands here, so a lost payload
    // has somewhere visible to go instead of just vanishing on bare ground.
    for (const dx of [-1, 1]) {
      const cx = w / 2 + dx * (w / 2 - 74);
      g.fillStyle(0x05070f, 0.9);
      g.fillRoundedRect(cx - 52, top + 6, 104, 26, 8);
      g.fillStyle(mix(this.theme.ridge[0], 0x000000, 0.5), 1);
      g.fillRoundedRect(cx - 56, top + 2, 112, 10, 5);
      g.lineStyle(4, mix(this.theme.ridge[0], 0xffffff, 0.22), 0.9);
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * 20, top + 9);
        g.lineTo(cx + i * 20, top + 30);
        g.strokePath();
      }
    }

    // Scattered pebbles so the floor is not a flat band.
    g.fillStyle(mix(this.theme.ridge[0], 0x000000, 0.15), 0.9);
    for (let i = 0; i < 26; i++) {
      const x = ((i * 149) % w) + 6;
      const y = top + 18 + ((i * 61) % Math.max(20, h - top - 26));
      g.fillEllipse(x, y, 10 + ((i * 7) % 14), 6 + ((i * 5) % 6));
    }

    this.layers.push(g);
  }

  _motes(w, h) {
    const p = this.scene.add.particles(0, 0, 'fx_dot', {
      x: { min: 0, max: w },
      y: { min: h * 0.15, max: h },
      speedY: { min: -18, max: -5 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.16, end: 0 },
      alpha: { start: 0.55, end: 0 },
      lifespan: { min: 3200, max: 6200 },
      frequency: 260,
      tint: this.theme.dust,
      blendMode: 'ADD',
    });
    p.setDepth(DEPTH.parallax + 2);
    this.motes = p;
    this.layers.push(p);
  }

  _vignette(w, h) {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx + 1);
    // Four soft edges beat a radial gradient here: no extra texture needed.
    const band = 130;
    const steps = 10;
    const step = band / steps;
    for (let i = 0; i < steps; i++) {
      g.fillStyle(0x000000, 0.05 * (1 - i / steps));
      g.fillRect(0, i * step, w, step + 1); // top
      g.fillRect(0, h - (i + 1) * step, w, step + 1); // bottom
      g.fillRect(i * step, 0, step + 1, h); // left
      g.fillRect(w - (i + 1) * step, 0, step + 1, h); // right
    }
    g.setScrollFactor(0);
    this.layers.push(g);
  }

  /** Gentle drift in response to pointer position — cheap depth cue. */
  update(pointerX = 0) {
    if (!this.parallax) return;
    const dx = (pointerX - this.w / 2) / this.w;
    for (const { obj, factor } of this.parallax) {
      obj.x = -dx * this.w * factor;
    }
  }

  destroy() {
    for (const l of this.layers) l.destroy();
    this.layers.length = 0;
  }
}
