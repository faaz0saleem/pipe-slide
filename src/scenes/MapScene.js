/**
 * MapScene — the level select.
 *
 * Deliberately not a candy path: the route is one continuous glass pipeline
 * climbing from the bottom of the screen to the summit, with valve wheels for
 * levels and pressure gauges for the chapter gates. The pipeline is drawn in
 * whichever pipe skin the player has equipped, so cosmetics show up here too.
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, DEPTH, TOTAL_LEVELS } from '../config/GameConfig.js';
import { UI, CHAPTER_THEMES, mix } from '../config/Palette.js';
import { getItem } from '../config/ShopCatalog.js';
import Levels from '../core/Levels.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import { button, iconButton, coinPill, label, starRow } from '../ui/Ui.js';

const SPACING = 158;
const BOTTOM_PAD = 260;
const TOP_PAD = 340;
const SWAY = 176;

export default class MapScene extends Phaser.Scene {
  constructor() {
    super('Map');
  }

  init(data) {
    this.focusLevel = Phaser.Math.Clamp(data?.focus ?? save.currentLevel, 1, TOTAL_LEVELS);
    this.nodes = [];
  }

  create() {
    this.totalH = TOP_PAD + (TOTAL_LEVELS - 1) * SPACING + BOTTOM_PAD;
    this.cameras.main.setBounds(0, 0, WIDTH, Math.max(this.totalH, HEIGHT));

    this._background();
    this._pipeline();
    this._nodes();
    this._chapterMarkers();
    this._chrome();
    this._enableScroll();

    // Land on the level the player came here for.
    const y = this._nodeY(this.focusLevel);
    this.cameras.main.scrollY = Phaser.Math.Clamp(
      y - HEIGHT * 0.58,
      0,
      Math.max(0, this.totalH - HEIGHT)
    );

    this.cameras.main.fadeIn(280, 0, 0, 0);
  }

  /* ------------------------------ geometry ---------------------------- */

  _nodeY(id) {
    return this.totalH - BOTTOM_PAD - (id - 1) * SPACING;
  }

  _nodeX(id) {
    // A long, lazy S so the pipe never doubles back on itself.
    return WIDTH / 2 + Math.sin((id - 1) * 0.62) * SWAY;
  }

  /* ---------------------------- presentation -------------------------- */

  _background() {
    const g = this.add.graphics().setDepth(DEPTH.bg);

    // One vertical band per chapter, blended into its neighbours.
    const chapters = Levels.chapters;
    for (let i = 0; i < chapters.length; i++) {
      const theme = CHAPTER_THEMES[chapters[i].theme] || CHAPTER_THEMES.mine;
      const yTop = this._nodeY((i + 1) * 10) - SPACING * 5.5;
      const yBottom = this._nodeY(i * 10 + 1) + SPACING * 5.5;
      const bandH = yBottom - yTop;

      // Cheap vertical blend: a stack of thin rects.
      const steps = 16;
      for (let s = 0; s < steps; s++) {
        const t = s / (steps - 1);
        g.fillStyle(mix(theme.sky[1], theme.sky[0], 1 - t), 1);
        g.fillRect(-4, yTop + (bandH / steps) * s, WIDTH + 8, bandH / steps + 1);
      }
    }

    // Star/mote field over the whole run.
    const dots = this.add.graphics().setDepth(DEPTH.bg + 1);
    for (let i = 0; i < 340; i++) {
      const x = (i * 197) % WIDTH;
      const y = (i * 613) % this.totalH;
      dots.fillStyle(0xffffff, 0.05 + ((i * 7) % 10) / 80);
      dots.fillCircle(x, y, 1 + ((i * 3) % 3) * 0.6);
    }
  }

  /** The pipeline itself, drawn through every node. */
  _pipeline() {
    const skin = getItem(save.equippedId('pipe')) || getItem('pipe_glass');
    const pts = [];
    for (let i = 1; i <= TOTAL_LEVELS; i++) pts.push([this._nodeX(i), this._nodeY(i)]);
    // Extend past both ends so the pipe runs off-screen instead of stopping.
    pts.unshift([this._nodeX(1), this._nodeY(1) + BOTTOM_PAD]);
    pts.push([this._nodeX(TOTAL_LEVELS), this._nodeY(TOTAL_LEVELS) - TOP_PAD]);

    const glow = this.add.graphics().setDepth(DEPTH.pipeGlow);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    const g = this.add.graphics().setDepth(DEPTH.pipe - 4);

    const stroke = (gfx, width, color, alpha) => {
      gfx.lineStyle(width, color, alpha);
      gfx.beginPath();
      pts.forEach(([x, y], i) => (i ? gfx.lineTo(x, y) : gfx.moveTo(x, y)));
      gfx.strokePath();
      gfx.fillStyle(color, alpha);
      for (const [x, y] of pts) gfx.fillCircle(x, y, width / 2);
    };

    stroke(glow, 66, skin.glow, 0.12);
    stroke(g, 52, 0xdff6ff, 0.1);
    stroke(g, 4, skin.stroke, 0.75);

    // The completed stretch is lit up.
    const done = Math.min(save.currentLevel, TOTAL_LEVELS);
    const litPts = pts.slice(0, done + 1);
    if (litPts.length > 1) {
      const lit = this.add.graphics().setDepth(DEPTH.pipe - 3);
      lit.setBlendMode(Phaser.BlendModes.ADD);
      lit.lineStyle(16, skin.glow, 0.3);
      lit.beginPath();
      litPts.forEach(([x, y], i) => (i ? lit.lineTo(x, y) : lit.moveTo(x, y)));
      lit.strokePath();
    }
  }

  _nodes() {
    for (let id = 1; id <= TOTAL_LEVELS; id++) {
      this.nodes.push(this._makeNode(id));
    }
  }

  _makeNode(id) {
    const x = this._nodeX(id);
    const y = this._nodeY(id);
    const unlocked = save.isUnlocked(id);
    const stars = save.starsFor(id);
    const bonus = Levels.isBonus(id);
    const isCurrent = id === save.currentLevel;

    const c = this.add.container(x, y).setDepth(DEPTH.pin);
    const r = bonus ? 50 : 42;

    const g = this.add.graphics();

    // Valve wheel: outer ring, spokes, hub.
    const base = !unlocked ? 0x2a3050 : bonus ? UI.gold : stars > 0 ? UI.mint : UI.sky;
    const dark = mix(base, 0x000000, 0.45);

    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, 7, r);

    g.fillStyle(dark, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(base, 1);
    g.fillCircle(0, 0, r - 5);
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(0, -r * 0.22, r - 12);

    // Spokes make it read as a valve rather than a bubble.
    g.lineStyle(5, dark, 0.9);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.beginPath();
      g.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
      g.lineTo(Math.cos(a) * (r * 0.3), Math.sin(a) * (r * 0.3));
      g.strokePath();
    }
    g.fillStyle(dark, 1);
    g.fillCircle(0, 0, r * 0.3);

    c.add(g);

    if (!unlocked) {
      const lock = this.add.image(0, 0, 'ui_lock').setScale(0.62).setTint(0x707aa5);
      c.add(lock);
    } else if (bonus) {
      const coin = this.add.image(0, 0, 'p_coin').setScale(0.9);
      c.add(coin);
      this.tweens.add({
        targets: coin,
        scaleX: { from: 0.9, to: 0.2 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    } else {
      const num = label(this, 0, 1, String(id), {
        size: id >= 100 ? 28 : 34,
        color: '#0b1226',
        shadow: false,
      });
      c.add(num);
    }

    // Earned stars ride under the wheel.
    if (unlocked && stars > 0) {
      const row = starRow(this, 0, r + 16, stars, { scale: 0.52, gap: 22, drop: 4 });
      c.add(row);
    }

    if (isCurrent && unlocked) {
      const ring = this.add.image(0, 0, 'fx_ring').setScale(1.1).setTint(0xffffff);
      ring.setBlendMode(Phaser.BlendModes.ADD);
      c.addAt(ring, 0);
      this.tweens.add({
        targets: ring,
        scale: 1.9,
        alpha: { from: 0.85, to: 0 },
        duration: 1500,
        repeat: -1,
      });

      const pointer = label(this, 0, -r - 40, '▼', { size: 34, color: '#ffffff' });
      c.add(pointer);
      this.tweens.add({
        targets: pointer,
        y: -r - 28,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    if (unlocked) {
      c.setSize(r * 2.4, r * 2.4);
      c.setInteractive(
        new Phaser.Geom.Circle(0, 0, r + 14),
        Phaser.Geom.Circle.Contains
      );
      c.input.cursor = 'pointer';
      c.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.12, duration: 120 }));
      c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 120 }));
      c.on('pointerup', () => {
        if (this.dragged) return;
        sound.play('tap');
        this._start(id);
      });
    } else {
      c.setAlpha(0.72);
    }

    return c;
  }

  /** Chapter name plates at every tenth level. */
  _chapterMarkers() {
    const chapters = Levels.chapters;
    for (let i = 0; i < chapters.length; i++) {
      const firstId = i * 10 + 1;
      const y = this._nodeY(firstId) + SPACING * 0.55;
      const theme = CHAPTER_THEMES[chapters[i].theme] || CHAPTER_THEMES.mine;
      const unlocked = save.currentLevel >= firstId;

      const c = this.add.container(WIDTH / 2, y).setDepth(DEPTH.parallax + 3);

      const g = this.add.graphics();
      g.fillStyle(0x080c1c, 0.55);
      g.fillRoundedRect(-WIDTH / 2 + 20, -26, WIDTH - 40, 52, 26);
      g.lineStyle(2.5, unlocked ? theme.accent : 0x39406a, 0.85);
      g.strokeRoundedRect(-WIDTH / 2 + 20, -26, WIDTH - 40, 52, 26);
      c.add(g);

      c.add(
        label(this, 0, 0, `${unlocked ? '' : '🔒  '}CHAPTER ${i + 1}  ·  ${chapters[i].name.toUpperCase()}`, {
          size: 21,
          color: unlocked ? '#ffffff' : '#6d78a8',
        })
      );
    }
  }

  /* ------------------------------- chrome ----------------------------- */

  _chrome() {
    const bar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    for (let i = 0; i < 10; i++) {
      bar.fillStyle(0x060a18, 0.62 * (1 - i / 10));
      bar.fillRect(0, (120 / 10) * i, WIDTH, 120 / 10 + 1);
    }

    iconButton(this, 58, 54, {
      r: 30,
      glyph: '←',
      size: 32,
      color: UI.slate,
      onClick: () => this._back(),
    })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);

    label(this, WIDTH / 2, 54, 'THE PIPELINE', {
      size: 32,
      color: '#ffffff',
      stroke: '#0a1024',
      strokeWidth: 6,
    })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);

    coinPill(this, WIDTH - 100, 54, save.coins)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);

    // Jump-to-current button, only when the player has scrolled away.
    this.jumpBtn = button(this, WIDTH / 2, HEIGHT - 70, {
      w: 300,
      h: 66,
      text: `JUMP TO LEVEL ${save.currentLevel}`,
      size: 22,
      color: UI.grape,
      textColor: '#ffffff',
      radius: 20,
      onClick: () => this._scrollTo(save.currentLevel),
    });
    this.jumpBtn.setScrollFactor(0).setDepth(DEPTH.hud + 1).setAlpha(0).setVisible(false);
    this._jumpShown = false;

    this.shopBtn = iconButton(this, WIDTH - 62, HEIGHT - 70, {
      r: 34,
      glyph: '🛒',
      size: 30,
      color: UI.rose,
      onClick: () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () =>
          this.scene.start('Shop', { from: 'Map', focus: this.focusLevel })
        );
      },
    })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1);
  }

  /* ------------------------------ scrolling --------------------------- */

  _enableScroll() {
    const cam = this.cameras.main;
    const maxScroll = Math.max(0, this.totalH - HEIGHT);
    this.dragged = false;
    let dragging = false;
    let lastY = 0;
    this.velocity = 0;

    this.input.on('pointerdown', (p) => {
      dragging = true;
      this.dragged = false;
      lastY = p.y;
      this.velocity = 0;
    });

    this.input.on('pointermove', (p) => {
      if (!dragging) return;
      const dy = p.y - lastY;
      lastY = p.y;
      if (Math.abs(dy) > 2) this.dragged = true;
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY - dy, 0, maxScroll);
      this.velocity = -dy;
    });

    const endDrag = () => {
      dragging = false;
      // Clear the drag flag a frame later so the node's pointerup can read it.
      this.time.delayedCall(30, () => (this.dragged = false));
    };
    this.input.on('pointerup', endDrag);
    this.input.on('pointerupoutside', endDrag);

    this.input.on('wheel', (_p, _o, _dx, dy) => {
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + dy * 0.9, 0, maxScroll);
    });

    this.input.keyboard?.on('keydown-ESC', () => this._back());
  }

  _scrollTo(id) {
    const maxScroll = Math.max(0, this.totalH - HEIGHT);
    const target = Phaser.Math.Clamp(this._nodeY(id) - HEIGHT * 0.58, 0, maxScroll);
    this.tweens.add({
      targets: this.cameras.main,
      scrollY: target,
      duration: 620,
      ease: 'Cubic.inOut',
    });
  }

  _start(id) {
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', { levelId: id });
    });
  }

  _back() {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
  }

  update() {
    const cam = this.cameras.main;
    const maxScroll = Math.max(0, this.totalH - HEIGHT);

    // Inertia after a flick.
    if (Math.abs(this.velocity) > 0.4 && !this.input.activePointer.isDown) {
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + this.velocity, 0, maxScroll);
      this.velocity *= 0.92;
    }

    // Surface the jump button only when the current level is off-screen.
    if (!this.jumpBtn) return;
    const currentY = this._nodeY(save.currentLevel) - cam.scrollY;
    const off = currentY < 80 || currentY > HEIGHT - 150;
    if (off && !this._jumpShown) {
      this._jumpShown = true;
      this.jumpBtn.setVisible(true);
      this.tweens.add({ targets: this.jumpBtn, alpha: 1, duration: 200 });
    } else if (!off && this._jumpShown) {
      this._jumpShown = false;
      this.tweens.add({
        targets: this.jumpBtn,
        alpha: 0,
        duration: 200,
        onComplete: () => this.jumpBtn.setVisible(false),
      });
    }
  }
}
