/**
 * ShopScene — spend the coins.
 *
 * Four categories, a live mannequin that wears whatever is selected, and a
 * pipe sample that restyles itself so pipe skins can be judged before buying.
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, DEPTH } from '../config/GameConfig.js';
import { UI } from '../config/Palette.js';
import { CATEGORIES, itemsIn, getItem } from '../config/ShopCatalog.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import Backdrop from '../objects/Backdrop.js';
import Character from '../objects/Character.js';
import { button, iconButton, coinPill, label, floatText } from '../ui/Ui.js';

const GRID_TOP = 596;
const GRID_BOTTOM = 1196;
const CARD_W = 316;
const CARD_H = 176;
const COLS = 2;
const GUTTER = 18;

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  init(data) {
    this.from = data?.from || 'Menu';
    this.focus = data?.focus;
    this.cat = data?.cat || 'hat';
    this.scrollY = 0;
    this.cards = [];
  }

  create() {
    this.backdrop = new Backdrop(this, 'neon', { ground: false, parallax: false });

    this._chrome();
    this._preview();
    this._tabs();
    this._makeGridMask();
    this._grid();
    this._scrolling();

    this.cameras.main.fadeIn(260, 0, 0, 0);
  }

  /* ------------------------------- chrome ----------------------------- */

  _chrome() {
    const bar = this.add.graphics().setDepth(DEPTH.hud);
    for (let i = 0; i < 10; i++) {
      bar.fillStyle(0x060a18, 0.7 * (1 - i / 10));
      bar.fillRect(0, (130 / 10) * i, WIDTH, 130 / 10 + 1);
    }

    iconButton(this, 58, 56, {
      r: 30,
      glyph: '←',
      size: 32,
      color: UI.slate,
      onClick: () => this._back(),
    }).setDepth(DEPTH.hud + 1);

    label(this, WIDTH / 2, 56, 'SHOP', {
      size: 38,
      color: '#ffffff',
      stroke: '#0a1024',
      strokeWidth: 7,
    }).setDepth(DEPTH.hud + 1);

    this.coinPill = coinPill(this, WIDTH - 100, 56, save.coins).setDepth(DEPTH.hud + 1);

    this.input.keyboard?.on('keydown-ESC', () => this._back());
  }

  /* ------------------------------ preview ----------------------------- */

  _preview() {
    const y = 132;
    const h = 300;

    const g = this.add.graphics().setDepth(DEPTH.receiver);
    g.fillStyle(0x0d1330, 0.72);
    g.fillRoundedRect(24, y, WIDTH - 48, h, 26);
    g.lineStyle(3, 0x3d4a7a, 0.8);
    g.strokeRoundedRect(24, y, WIDTH - 48, h, 26);

    // Stage light behind the mannequin.
    const glow = this.add.image(210, y + 170, 'fx_glow').setScale(2.6).setTint(0x8b5cf6);
    glow.setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.receiver + 1);

    this.previewChar = new Character(this, 'shiverer', 210, y + 268, {
      scale: 0.82,
      hat: save.equippedId('hat'),
      outfit: save.equippedId('outfit'),
      depth: DEPTH.character + 5,
    });

    // Pipe sample on the right of the stage.
    this.pipeGfx = this.add.graphics().setDepth(DEPTH.pipe);
    this.pipeGlowGfx = this.add.graphics().setDepth(DEPTH.pipeGlow);
    this.pipeGlowGfx.setBlendMode(Phaser.BlendModes.ADD);
    this._drawPipeSample();

    // A payload endlessly sliding down the sample so trails can be previewed.
    this.sampleItem = this.add.image(500, y + 40, 'p_coin').setScale(0.5);
    this.sampleItem.setDepth(DEPTH.payload);
    this._restartSample();

    label(this, WIDTH / 2 + 150, y + 24, 'LIVE PREVIEW', {
      size: 16,
      color: '#6d78a8',
    }).setDepth(DEPTH.hud);
  }

  _drawPipeSample() {
    const skin = getItem(save.equippedId('pipe')) || getItem('pipe_glass');
    const pts = [
      [500, 168],
      [500, 300],
      [560, 356],
      [640, 356],
    ];

    const stroke = (gfx, width, color, alpha) => {
      gfx.lineStyle(width, color, alpha);
      gfx.beginPath();
      pts.forEach(([x, y], i) => (i ? gfx.lineTo(x, y) : gfx.moveTo(x, y)));
      gfx.strokePath();
      gfx.fillStyle(color, alpha);
      for (const [x, y] of pts) gfx.fillCircle(x, y, width / 2);
    };

    this.pipeGfx.clear();
    this.pipeGlowGfx.clear();
    stroke(this.pipeGlowGfx, 74, skin.glow, 0.16);
    stroke(this.pipeGfx, 58, 0xdff6ff, 0.12);
    stroke(this.pipeGfx, 4, skin.stroke, 0.95);
    this.samplePath = pts;
  }

  _restartSample() {
    this.sampleTween?.stop();
    const trail = getItem(save.equippedId('trail'));

    this.sampleEmitter?.destroy();
    this.sampleEmitter = null;

    const fxMap = {
      spark: { key: 'fx_spark4', scale: 0.24 },
      bubble: { key: 'fx_dot', scale: 0.5 },
      fire: { key: 'fx_flame', scale: 0.5 },
      void: { key: 'fx_star', scale: 0.3 },
    };
    const fx = trail && fxMap[trail.fx];
    if (fx) {
      this.sampleEmitter = this.add.particles(0, 0, fx.key, {
        speed: { min: 4, max: 24 },
        scale: { start: fx.scale, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 500,
        frequency: 45,
        blendMode: 'ADD',
        tint: trail.tint,
        follow: this.sampleItem,
      });
      this.sampleEmitter.setDepth(DEPTH.payload - 1);
    }

    this.sampleItem.setPosition(500, 168);
    this.sampleTween = this.tweens.chain({
      targets: this.sampleItem,
      loop: -1,
      tweens: [
        { x: 500, y: 300, duration: 900, ease: 'Quad.in' },
        { x: 640, y: 356, duration: 700, ease: 'Quad.out' },
        { alpha: 0, duration: 200 },
        { x: 500, y: 168, alpha: 1, duration: 10 },
        { alpha: 1, duration: 300 },
      ],
    });
  }

  /* -------------------------------- tabs ------------------------------ */

  _tabs() {
    this.tabButtons = {};
    const w = 164;
    const y = 490;
    CATEGORIES.forEach((cat, i) => {
      const x = 26 + w / 2 + i * (w + 8);
      const active = cat.id === this.cat;
      const b = button(this, x, y, {
        w,
        h: 64,
        text: cat.name.toUpperCase(),
        size: 19,
        color: active ? UI.gold : UI.slate,
        textColor: active ? '#3a2400' : '#c9d2f5',
        radius: 18,
        onClick: () => this._setCat(cat.id),
      });
      b.setDepth(DEPTH.hud);
      this.tabButtons[cat.id] = b;
    });

    this.blurb = label(this, WIDTH / 2, 546, this._catBlurb(), {
      size: 18,
      color: '#8892be',
    }).setDepth(DEPTH.hud);
  }

  _catBlurb() {
    return CATEGORIES.find((c) => c.id === this.cat)?.blurb ?? '';
  }

  _setCat(id) {
    if (this.cat === id) return;
    this.cat = id;
    this.scrollY = 0;
    for (const [key, btn] of Object.entries(this.tabButtons)) {
      const active = key === id;
      btn.destroy();
      const i = CATEGORIES.findIndex((c) => c.id === key);
      const w = 164;
      const b = button(this, 26 + w / 2 + i * (w + 8), 490, {
        w,
        h: 64,
        text: CATEGORIES[i].name.toUpperCase(),
        size: 19,
        color: active ? UI.gold : UI.slate,
        textColor: active ? '#3a2400' : '#c9d2f5',
        radius: 18,
        onClick: () => this._setCat(key),
      });
      b.setDepth(DEPTH.hud);
      this.tabButtons[key] = b;
    }
    this.blurb.setText(this._catBlurb());
    this._grid();
  }

  /* -------------------------------- grid ------------------------------ */

  /** Clip the card list so rows never spill over the tabs or the screen edge. */
  _makeGridMask() {
    const shape = this.make.graphics({ x: 0, y: 0 }, false);
    shape.fillStyle(0xffffff);
    shape.fillRect(0, GRID_TOP - 10, WIDTH, GRID_BOTTOM - GRID_TOP + 20);
    this.gridMask = shape.createGeometryMask();
  }

  _grid() {
    for (const c of this.cards) c.destroy();
    this.cards = [];

    const items = itemsIn(this.cat);
    this.contentH = Math.ceil(items.length / COLS) * (CARD_H + GUTTER);

    items.forEach((item, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = 26 + CARD_W / 2 + col * (CARD_W + GUTTER);
      const y = GRID_TOP + CARD_H / 2 + row * (CARD_H + GUTTER);
      this.cards.push(this._card(item, x, y));
    });

    this._applyScroll();
  }

  _card(item, x, y) {
    const owned = save.owns(item.id);
    const equipped = save.equippedId(item.cat) === item.id;
    const affordable = save.coins >= item.price;

    const c = this.add.container(x, y).setDepth(DEPTH.hud);
    c.baseY = y;
    c.item = item;
    if (this.gridMask) c.setMask(this.gridMask);

    const accent = equipped ? UI.mint : owned ? UI.sky : affordable ? UI.gold : UI.slateLight;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2 + 6, CARD_W, CARD_H, 20);
    g.fillStyle(equipped ? 0x18304a : 0x131a35, 0.96);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 20);
    g.lineStyle(3, accent, equipped ? 1 : 0.7);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 20);
    c.add(g);

    // Swatch.
    const swatch = this._swatch(item);
    swatch.setPosition(-CARD_W / 2 + 60, -6);
    c.add(swatch);

    c.add(
      label(this, -CARD_W / 2 + 112, -46, item.name, {
        size: 22,
        color: '#ffffff',
      }).setOrigin(0, 0.5)
    );

    // Status line.
    let statusText;
    let statusColor;
    if (equipped) {
      statusText = 'EQUIPPED';
      statusColor = '#7cf6b0';
    } else if (owned) {
      statusText = 'TAP TO EQUIP';
      statusColor = '#9fe8ff';
    } else {
      statusText = `${item.price}`;
      statusColor = affordable ? '#ffd54a' : '#ff8fa3';
    }

    if (!owned) {
      const coin = this.add.image(-CARD_W / 2 + 122, -6, 'p_coin').setScale(0.45);
      c.add(coin);
      c.add(
        label(this, -CARD_W / 2 + 146, -6, statusText, {
          size: 26,
          color: statusColor,
        }).setOrigin(0, 0.5)
      );
    } else {
      c.add(
        label(this, -CARD_W / 2 + 112, -6, statusText, {
          size: 20,
          color: statusColor,
        }).setOrigin(0, 0.5)
      );
    }

    // Action.
    const actionText = equipped ? 'ON' : owned ? 'EQUIP' : 'BUY';
    const actionColor = equipped ? UI.slate : owned ? UI.sky : affordable ? UI.mint : UI.slate;
    const actionInk = equipped ? '#8892be' : owned ? '#062435' : affordable ? '#08301f' : '#6d78a8';

    const act = button(this, 0, CARD_H / 2 - 40, {
      w: CARD_W - 40,
      h: 54,
      text: actionText,
      size: 22,
      color: actionColor,
      textColor: actionInk,
      radius: 16,
      onClick: () => this._act(item),
    });
    c.add(act);
    if (equipped) act.setEnabled(false);

    return c;
  }

  /** A little preview of the item itself, drawn per category. */
  _swatch(item) {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();

    g.fillStyle(0x0a0f24, 0.9);
    g.fillRoundedRect(-42, -42, 84, 84, 16);
    g.lineStyle(2, 0x3d4a7a, 0.8);
    g.strokeRoundedRect(-42, -42, 84, 84, 16);
    c.add(g);

    const art = this.add.graphics();
    c.add(art);

    if (item.cat === 'hat') {
      // Head + hat, scaled into the swatch.
      art.fillStyle(0xf3c9a0, 1);
      art.fillCircle(0, 12, 22);
      art.setScale(0.72);
      const head = this._miniHat(item);
      head.setScale(0.62);
      head.setPosition(0, 12);
      c.add(head);
    } else if (item.cat === 'outfit') {
      art.fillStyle(item.body, 1);
      art.fillRoundedRect(-24, -22, 48, 46, 12);
      art.fillStyle(item.limb, 1);
      art.fillRoundedRect(-22, 20, 18, 18, 6);
      art.fillRoundedRect(4, 20, 18, 18, 6);
      art.fillStyle(0xffffff, 0.18);
      art.fillRoundedRect(-20, -18, 18, 28, 8);
    } else if (item.cat === 'pipe') {
      art.lineStyle(26, 0xdff6ff, 0.14);
      art.beginPath();
      art.moveTo(-4, -30);
      art.lineTo(-4, 8);
      art.lineTo(24, 30);
      art.strokePath();
      art.lineStyle(3.5, item.stroke, 0.95);
      art.beginPath();
      art.moveTo(-4, -30);
      art.lineTo(-4, 8);
      art.lineTo(24, 30);
      art.strokePath();
      const glow = this.add.image(0, 0, 'fx_glow').setScale(0.9).setTint(item.glow).setAlpha(0.35);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      c.addAt(glow, 1);
    } else {
      // Trail: a dotted comet.
      const tint = item.tint ?? 0x8892be;
      for (let i = 0; i < 6; i++) {
        art.fillStyle(tint, 0.9 - i * 0.14);
        art.fillCircle(-24 + i * 9, 22 - i * 8, 9 - i * 1.2);
      }
      if (item.fx === 'none') {
        art.fillStyle(0x39406a, 1);
        art.fillCircle(0, 0, 14);
      }
    }

    return c;
  }

  /** Reuse the character hat vectors at swatch scale. */
  _miniHat(item) {
    const tmp = this.add.container(0, 0);
    const g = this.add.graphics();
    tmp.add(g);
    // Character._drawHat draws around a head centred at (0,0) with r=34.
    const fake = { hatGfx: g, hat: item };
    Character.prototype._drawHat.call(fake);
    return tmp;
  }

  /* ------------------------------ actions ----------------------------- */

  _act(item) {
    const owned = save.owns(item.id);

    if (!owned) {
      const result = save.buy(item);
      if (result === 'poor') {
        sound.play('error');
        floatText(this, WIDTH / 2, 460, 'Not enough coins', {
          color: '#ff8fa3',
          size: 26,
          depth: DEPTH.popup,
        });
        this._shakeCoins();
        return;
      }
      sound.play('buy');
      this._celebrate(item);
    } else {
      save.equip(item);
      sound.play('tap');
    }

    save.flush();
    this._refresh();
  }

  _celebrate(item) {
    const p = this.add.particles(WIDTH / 2, 420, 'fx_spark4', {
      speed: { min: 120, max: 380 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 800,
      quantity: 22,
      tint: [0xffd54a, 0xffffff, 0x9fe8ff],
      blendMode: 'ADD',
    });
    p.setDepth(DEPTH.popup);
    p.explode(22);
    this.time.delayedCall(1100, () => p.destroy());

    floatText(this, WIDTH / 2, 430, `${item.name} unlocked!`, {
      color: '#ffd54a',
      size: 30,
      depth: DEPTH.popup,
    });
  }

  _shakeCoins() {
    this.tweens.add({
      targets: this.coinPill,
      x: WIDTH - 100 + 8,
      duration: 60,
      yoyo: true,
      repeat: 3,
      onComplete: () => (this.coinPill.x = WIDTH - 100),
    });
  }

  _refresh() {
    this.coinPill.setValue(save.coins);

    // Rebuild the mannequin so hats and outfits update together.
    this.previewChar.destroy();
    this.previewChar = new Character(this, 'shiverer', 210, 400, {
      scale: 0.82,
      hat: save.equippedId('hat'),
      outfit: save.equippedId('outfit'),
      depth: DEPTH.character + 5,
    });
    this.previewChar.cheer();

    this._drawPipeSample();
    this._restartSample();
    this._grid();
  }

  /* ----------------------------- scrolling ---------------------------- */

  _scrolling() {
    let dragging = false;
    let lastY = 0;
    this.dragged = false;

    const maxScroll = () => Math.max(0, this.contentH - (GRID_BOTTOM - GRID_TOP));

    this.input.on('pointerdown', (p) => {
      if (p.y < GRID_TOP - 20) return;
      dragging = true;
      lastY = p.y;
    });
    this.input.on('pointermove', (p) => {
      if (!dragging) return;
      const dy = p.y - lastY;
      lastY = p.y;
      this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, 0, maxScroll());
      this._applyScroll();
    });
    const end = () => (dragging = false);
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);

    this.input.on('wheel', (p, _o, _dx, dy) => {
      if (p.y < GRID_TOP - 20) return;
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.8, 0, maxScroll());
      this._applyScroll();
    });
  }

  _applyScroll() {
    for (const c of this.cards) {
      c.y = c.baseY - this.scrollY;
      // Hide anything scrolled out of the window so it cannot be clicked.
      const visible = c.y > GRID_TOP - CARD_H && c.y < GRID_BOTTOM + CARD_H * 0.5;
      c.setVisible(visible);
    }
  }

  _back() {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.from === 'Map') this.scene.start('Map', { focus: this.focus });
      else this.scene.start('Menu');
    });
  }

  update() {
    this.backdrop?.update(this.input.activePointer.x);
  }
}
