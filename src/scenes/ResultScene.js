/**
 * ResultScene — the celebration (or the commiseration).
 *
 * Overlays the paused GameScene. Everything the player might want next lives
 * on this one screen: continue, replay, the shop, the map, a rewarded double-up
 * and the chest meter that keeps the next reward visible.
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, DEPTH, TOTAL_LEVELS } from '../config/GameConfig.js';
import { UI } from '../config/Palette.js';
import Levels from '../core/Levels.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import crazy from '../core/CrazySDK.js';
import { button, panel, label, scrim, starRow, progressBar, floatText, gradientText } from '../ui/Ui.js';

const AD_EVERY = 3;

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.result = data || {};
    this.levelId = this.result.levelId ?? save.currentLevel;
    this.doubled = false;
    this.busy = false;
  }

  create() {
    scrim(this, 0.74).setDepth(DEPTH.overlay);
    if (this.result.failed) this._buildFail();
    else this._buildWin();
  }

  /* ================================= win =============================== */

  _buildWin() {
    const r = this.result;
    const cx = WIDTH / 2;
    const isLast = this.levelId >= TOTAL_LEVELS;
    const lv = Levels.get(this.levelId);

    const root = this.add.container(0, 0).setDepth(DEPTH.popup);
    this.root = root;

    root.add(panel(this, cx, 640, 640, 980, { fill: 0x141b3c, stroke: UI.gold, strokeAlpha: 0.55 }));

    // --- title ---
    const title = label(this, cx, 250, lv?.bonus ? 'VAULT FILLED!' : 'LEVEL CLEAR!', {
      size: 62,
      color: '#ffffff',
      stroke: '#20160a',
      strokeWidth: 10,
    });
    gradientText(title, [
      [0, '#fff7cf'],
      [0.55, '#ffcf3d'],
      [1, '#ff9a2e'],
    ]);
    root.add(title);
    title.setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, ease: 'Back.out' });

    root.add(
      label(this, cx, 302, `${Levels.chapterFor(this.levelId).name} · ${lv?.name ?? ''}`, {
        size: 22,
        color: '#93a0d0',
      })
    );

    // --- stars ---
    const stars = starRow(this, cx, 392, 0, { scale: 1.7, gap: 96, drop: 18 });
    root.add(stars);
    this._animateStars(stars, r.stars ?? 1);

    // --- stat rows ---
    const rows = [
      ['Time', `${(r.elapsed ?? 0).toFixed(1)}s`, (r.inTime ? '#7cf6b0' : '#ff8fa3')],
      ['Delivered', `${r.delivered ?? 0}${r.lost ? `  (−${r.lost} lost)` : ''}`, r.lost ? '#ff8fa3' : '#7cf6b0'],
      ['Best combo', `x${Math.max(1, r.bestCombo ?? 1)}`, '#9fe8ff'],
    ];
    rows.forEach(([k, v, color], i) => {
      const y = 500 + i * 44;
      const key = label(this, cx - 240, y, k, { size: 24, color: '#8892be' });
      key.setOrigin(0, 0.5);
      const val = label(this, cx + 240, y, v, { size: 24, color });
      val.setOrigin(1, 0.5);
      root.add(key);
      root.add(val);
    });

    // --- coins ---
    const coinRow = this.add.container(cx, 668);
    const coinIcon = this.add.image(-86, 0, 'p_coin').setScale(1.0);
    this.coinLabel = label(this, -34, 0, '+0', {
      size: 46,
      color: '#ffd54a',
      stroke: '#241505',
      strokeWidth: 7,
    });
    this.coinLabel.setOrigin(0, 0.5);
    coinRow.add([coinIcon, this.coinLabel]);
    root.add(coinRow);

    this.earned = r.coins ?? 0;
    this._rollCoins(0, this.earned, 900);
    this.tweens.add({
      targets: coinIcon,
      angle: 360,
      duration: 900,
      ease: 'Cubic.out',
    });

    // --- chest meter ---
    const progress = save.data.chestProgress;
    root.add(
      label(this, cx, 726, `Next chest in ${5 - progress} level${5 - progress === 1 ? '' : 's'}`, {
        size: 19,
        color: '#8892be',
      })
    );
    const chestBar = progressBar(this, cx, 754, 340, 14, { color: UI.grape, value: progress / 5 });
    root.add(chestBar);

    // --- rewarded double-up ---
    if (this.earned > 0) {
      this.doubleBtn = button(this, cx, 826, {
        w: 440,
        h: 66,
        text: `WATCH AD · DOUBLE +${this.earned}`,
        size: 22,
        color: UI.gold,
        textColor: '#3a2400',
        radius: 20,
        onClick: () => this._doubleCoins(),
      });
      root.add(this.doubleBtn);
    }

    // --- primary action ---
    const nextId = Math.min(TOTAL_LEVELS, this.levelId + 1);
    const nextIsBonus = Levels.isBonus(nextId);
    this.nextBtn = button(this, cx, 918, {
      w: 460,
      h: 96,
      text: isLast ? 'YOU BEAT THE GAME' : nextIsBonus ? 'BONUS LEVEL →' : 'NEXT LEVEL →',
      size: 32,
      color: isLast ? UI.grape : UI.mint,
      textColor: isLast ? '#ffffff' : '#08301f',
      onClick: () => (isLast ? this._toMap() : this._next()),
    });
    this.nextBtn.pulse();
    root.add(this.nextBtn);

    // --- secondary actions ---
    const small = [
      ['REPLAY', UI.sky, '#062435', () => this._replay()],
      ['SHOP', UI.rose, '#3a0713', () => this._toShop()],
      ['MAP', UI.slateLight, '#ffffff', () => this._toMap()],
    ];
    small.forEach(([text, color, tc, fn], i) => {
      root.add(
        button(this, cx + (i - 1) * 152, 1024, {
          w: 140,
          h: 62,
          text,
          size: 21,
          color,
          textColor: tc,
          radius: 18,
          onClick: fn,
        })
      );
    });

    if (this.result.outcome?.chest) this.time.delayedCall(1400, () => this._openChest());
  }

  _animateStars(row, count) {
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(420 + i * 260, () => {
        const s = row.stars[i];
        s.setTint(UI.gold).setAlpha(1);
        this.tweens.add({
          targets: s,
          scale: { from: 1.9, to: 1.06 },
          angle: { from: -40, to: 0 },
          duration: 420,
          ease: 'Back.out',
        });
        sound.play('star', { index: i });

        const burst = this.add.particles(row.x + s.x, row.y + s.y, 'fx_spark4', {
          speed: { min: 90, max: 260 },
          scale: { start: 0.5, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: 620,
          quantity: 12,
          tint: [0xffd54a, 0xffffff],
          blendMode: 'ADD',
        });
        burst.setDepth(DEPTH.popup + 1);
        burst.explode(12);
        this.time.delayedCall(800, () => burst.destroy());
      });
    }
  }

  _rollCoins(from, to, duration) {
    this.tweens.addCounter({
      from,
      to,
      duration,
      ease: 'Cubic.out',
      onUpdate: (tw) => this.coinLabel.setText(`+${Math.round(tw.getValue())}`),
    });
  }

  async _doubleCoins() {
    if (this.busy || this.doubled) return;
    this.busy = true;
    this.doubleBtn.setEnabled(false).setLabel('LOADING…');

    const { shown } = await crazy.requestAd('rewarded');
    this.busy = false;

    if (!shown) {
      this.doubleBtn.setLabel('AD UNAVAILABLE');
      this.time.delayedCall(1400, () => {
        this.doubleBtn?.setEnabled(true).setLabel(`WATCH AD · DOUBLE +${this.earned}`);
      });
      sound.play('error');
      return;
    }

    this.doubled = true;
    save.addCoins(this.earned);
    save.flush();
    sound.play('chest');
    this._rollCoins(this.earned, this.earned * 2, 700);
    this.doubleBtn.setLabel('DOUBLED!');
    floatText(this, WIDTH / 2, 760, `+${this.earned}`, { size: 46, depth: DEPTH.popup + 2 });

    const p = this.add.particles(WIDTH / 2, 700, 'p_coin', {
      speed: { min: 160, max: 420 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.7, end: 0.2 },
      lifespan: 1100,
      quantity: 24,
      gravityY: 700,
    });
    p.setDepth(DEPTH.popup + 1);
    p.explode(24);
    this.time.delayedCall(1600, () => p.destroy());
  }

  _openChest() {
    const cx = WIDTH / 2;
    const reward = 120 + save.data.level * 6;

    const c = this.add.container(cx, 640).setDepth(DEPTH.popup + 5);
    const glow = this.add.image(0, 0, 'fx_glow').setScale(4).setTint(UI.gold).setAlpha(0.7);
    glow.setBlendMode(Phaser.BlendModes.ADD);

    const box = this.add.graphics();
    box.fillStyle(0x8a5a34, 1);
    box.fillRoundedRect(-90, -60, 180, 120, 14);
    box.fillStyle(0x6b4423, 1);
    box.fillRoundedRect(-90, -60, 180, 44, 14);
    box.fillStyle(UI.gold, 1);
    box.fillRoundedRect(-16, -22, 32, 42, 8);
    box.fillCircle(0, -20, 14);

    const txt = label(this, 0, 110, 'CHEST UNLOCKED!', {
      size: 34,
      color: '#ffd54a',
      stroke: '#241505',
      strokeWidth: 8,
    });

    c.add([glow, box, txt]);
    c.setScale(0.2).setAlpha(0);

    sound.play('chest');
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 420, ease: 'Back.out' });
    this.tweens.add({
      targets: glow,
      angle: 360,
      duration: 6000,
      repeat: -1,
    });

    save.addCoins(reward);
    save.flush();

    this.time.delayedCall(700, () => {
      const p = this.add.particles(cx, 620, 'p_coin', {
        speed: { min: 180, max: 480 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.8, end: 0.3 },
        lifespan: 1300,
        quantity: 30,
        gravityY: 800,
      });
      p.setDepth(DEPTH.popup + 6);
      p.explode(30);
      this.time.delayedCall(1800, () => p.destroy());
      floatText(this, cx, 560, `+${reward}`, { size: 54, depth: DEPTH.popup + 7 });
    });

    this.time.delayedCall(2600, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        y: 560,
        duration: 400,
        onComplete: () => c.destroy(),
      });
    });
  }

  /* ================================ fail =============================== */

  _buildFail() {
    const cx = WIDTH / 2;
    const root = this.add.container(0, 0).setDepth(DEPTH.popup);

    root.add(panel(this, cx, 640, 600, 620, { fill: 0x2a1230, stroke: UI.rose, strokeAlpha: 0.6 }));

    const title = label(this, cx, 430, 'NOT QUITE!', {
      size: 58,
      color: '#ffffff',
      stroke: '#2a0009',
      strokeWidth: 10,
    });
    gradientText(title, [
      [0, '#ffd6de'],
      [1, '#ff5d7e'],
    ]);
    root.add(title);
    title.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 320, ease: 'Back.out' });

    root.add(
      label(this, cx, 492, this.result.reason || 'Something went to the wrong place.', {
        size: 24,
        color: '#e8b8c6',
        wrap: 480,
      })
    );

    root.add(
      label(this, cx, 560, 'Pins can only be pulled once — plan the order.', {
        size: 19,
        color: '#a48fb0',
        wrap: 460,
      })
    );

    root.add(
      button(this, cx, 668, {
        w: 420,
        h: 96,
        text: 'TRY AGAIN',
        size: 34,
        color: UI.mint,
        textColor: '#08301f',
        onClick: () => this._replay(),
      }).pulse()
    );

    const small = [
      ['SHOP', UI.gold, '#3a2400', () => this._toShop()],
      ['MAP', UI.slateLight, '#ffffff', () => this._toMap()],
    ];
    small.forEach(([text, color, tc, fn], i) => {
      root.add(
        button(this, cx + (i - 0.5) * 200, 782, {
          w: 180,
          h: 64,
          text,
          size: 23,
          color,
          textColor: tc,
          radius: 18,
          onClick: fn,
        })
      );
    });

    root.add(
      label(this, cx, 872, `Delivered ${this.result.delivered ?? 0} · Lost ${this.result.lost ?? 0}`, {
        size: 19,
        color: '#8892be',
      })
    );
  }

  /* =============================== actions ============================= */

  _leave(fn) {
    if (this.busy) return;
    this.busy = true;
    save.flush();
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', fn);
  }

  async _next() {
    if (this.busy) return;
    const nextId = Math.min(TOTAL_LEVELS, this.levelId + 1);

    // A short ad between levels, but never on the very first few.
    const wins = save.data.stats.wins;
    if (wins > 2 && wins % AD_EVERY === 0) {
      this.busy = true;
      this.nextBtn?.setEnabled(false);
      await crazy.requestAd('midgame');
      this.busy = false;
    }

    this._leave(() => {
      this.scene.stop('Result');
      this.scene.stop('Game');
      this.scene.start('Game', { levelId: nextId });
    });
  }

  _replay() {
    this._leave(() => {
      this.scene.stop('Result');
      this.scene.stop('Game');
      this.scene.start('Game', { levelId: this.levelId });
    });
  }

  _toShop() {
    this._leave(() => {
      this.scene.stop('Result');
      this.scene.stop('Game');
      this.scene.start('Shop', { from: 'Map', focus: this.levelId });
    });
  }

  _toMap() {
    this._leave(() => {
      this.scene.stop('Result');
      this.scene.stop('Game');
      this.scene.start('Map', { focus: Math.min(TOTAL_LEVELS, this.levelId + 1) });
    });
  }
}
