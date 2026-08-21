/**
 * MenuScene — the front door.
 *
 * Themed to whichever chapter the player is currently on, so the title screen
 * visibly evolves as they progress. Decorative payloads rain down the
 * background (tweened, not simulated — this screen must never drop frames).
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, DEPTH, TOTAL_LEVELS, FONT } from '../config/GameConfig.js';
import { UI, PAYLOAD_STYLE } from '../config/Palette.js';
import Levels from '../core/Levels.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import crazy from '../core/CrazySDK.js';
import Backdrop from '../objects/Backdrop.js';
import Character from '../objects/Character.js';
import {
  button,
  iconButton,
  coinPill,
  panel,
  label,
  scrim,
  gradientText,
  progressBar,
  floatText,
} from '../ui/Ui.js';

const RAIN_TYPES = ['coal', 'apple', 'gem', 'coin'];

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  init(data) {
    this.firstBoot = !!data?.firstBoot;
    this.modal = null;
  }

  create() {
    const chapter = Levels.chapterFor(save.currentLevel);
    this.backdrop = new Backdrop(this, chapter.theme, { ground: false, seed: 7 });

    this._rain();
    this._title();
    this._pipeArt();
    this._buttons();
    this._topBar();
    this._footer();
    this._greeter();

    if (save.settings.music) {
      sound.unlock();
      sound.startMusic();
    }

    this.cameras.main.fadeIn(320, 0, 0, 0);
  }

  /* ------------------------------ decoration -------------------------- */

  /** Payloads drifting down behind the title. */
  _rain() {
    this.rainItems = [];
    for (let i = 0; i < 16; i++) this._spawnRainItem(true);

    this.time.addEvent({
      delay: 520,
      loop: true,
      callback: () => {
        if (this.rainItems.length < 22) this._spawnRainItem(false);
      },
    });
  }

  _spawnRainItem(seeded) {
    const type = RAIN_TYPES[Math.floor(Math.random() * RAIN_TYPES.length)];
    const x = Phaser.Math.Between(30, WIDTH - 30);
    const y = seeded ? Phaser.Math.Between(-100, HEIGHT) : Phaser.Math.Between(-220, -60);

    const img = this.add.image(x, y, `p_${type}`);
    img.setScale(Phaser.Math.FloatBetween(0.3, 0.62));
    img.setAlpha(Phaser.Math.FloatBetween(0.22, 0.5));
    img.setDepth(DEPTH.parallax + 3);
    this.rainItems.push(img);

    const duration = Phaser.Math.Between(7000, 14000);
    this.tweens.add({
      targets: img,
      y: HEIGHT + 120,
      x: x + Phaser.Math.Between(-70, 70),
      angle: Phaser.Math.Between(-360, 360),
      duration: duration * ((HEIGHT + 120 - y) / (HEIGHT + 240)),
      ease: 'Linear',
      onComplete: () => {
        this.rainItems = this.rainItems.filter((o) => o !== img);
        img.destroy();
      },
    });
  }

  /** A decorative glass pipe behind the title with coins sliding through. */
  _pipeArt() {
    const g = this.add.graphics().setDepth(DEPTH.parallax + 2);
    const pts = [
      [110, 150],
      [110, 330],
      [200, 420],
      [520, 420],
      [610, 330],
      [610, 150],
    ];
    g.lineStyle(46, 0xdff6ff, 0.07);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokePath();
    g.lineStyle(3, 0x9fe8ff, 0.35);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokePath();
  }

  _title() {
    const t = label(this, WIDTH / 2, 300, 'PIPE', {
      size: 128,
      color: '#ffffff',
      stroke: '#141a35',
      strokeWidth: 16,
    });
    gradientText(t, [
      [0, '#fffbe6'],
      [0.45, '#ffd54a'],
      [1, '#ff8a2e'],
    ]);

    const t2 = label(this, WIDTH / 2, 404, 'SLIDE', {
      size: 108,
      color: '#ffffff',
      stroke: '#141a35',
      strokeWidth: 15,
    });
    gradientText(t2, [
      [0, '#e6fbff'],
      [0.5, '#4cc9ff'],
      [1, '#8b5cf6'],
    ]);

    t.setDepth(DEPTH.hud);
    t2.setDepth(DEPTH.hud);

    this.tweens.add({
      targets: t,
      y: 294,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.tweens.add({
      targets: t2,
      y: 410,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: 180,
    });

    const tag = label(this, WIDTH / 2, 476, 'PULL  ·  DROP  ·  DELIVER', {
      size: 24,
      color: '#a9b6ea',
      stroke: '#0f1430',
      strokeWidth: 5,
    });
    tag.setDepth(DEPTH.hud);
    tag.setAlpha(0);
    this.tweens.add({ targets: tag, alpha: 1, duration: 800, delay: 300 });

    // Sparkles orbiting the title.
    const sparks = this.add.particles(WIDTH / 2, 350, 'fx_spark4', {
      speed: { min: 10, max: 40 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 1500,
      frequency: 220,
      tint: [0xffd54a, 0xffffff, 0x9fe8ff],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-300, -90, 600, 200),
      },
    });
    sparks.setDepth(DEPTH.hud - 1);
  }

  /* -------------------------------- ui -------------------------------- */

  _buttons() {
    const cx = WIDTH / 2;
    const lv = save.currentLevel;

    this.playBtn = button(this, cx, 620, {
      w: 440,
      h: 116,
      text: lv > 1 ? `CONTINUE · ${lv}` : 'PLAY',
      size: 42,
      color: UI.mint,
      textColor: '#08301f',
      onClick: () => this._play(lv),
    });
    this.playBtn.setDepth(DEPTH.hud);
    this.playBtn.pulse();

    button(this, cx - 118, 748, {
      w: 216,
      h: 82,
      text: 'LEVELS',
      size: 28,
      color: UI.sky,
      textColor: '#062435',
      onClick: () => this._goto('Map', { focus: lv }),
    }).setDepth(DEPTH.hud);

    button(this, cx + 118, 748, {
      w: 216,
      h: 82,
      text: 'SHOP',
      size: 28,
      color: UI.rose,
      textColor: '#3a0713',
      onClick: () => this._goto('Shop', { from: 'Menu' }),
    }).setDepth(DEPTH.hud);

    // Daily reward.
    const daily = save.dailyStatus();
    this.dailyBtn = button(this, cx, 856, {
      w: 340,
      h: 68,
      text: daily.available ? `DAILY GIFT  +${daily.reward}` : 'DAILY CLAIMED',
      size: 24,
      color: daily.available ? UI.gold : UI.slate,
      textColor: daily.available ? '#3a2400' : '#8892be',
      radius: 20,
      onClick: () => this._claimDaily(),
    });
    this.dailyBtn.setDepth(DEPTH.hud);
    if (daily.available) {
      this.dailyBtn.pulse();
      const glow = this.add.image(cx, 856, 'fx_glow').setScale(3.2).setTint(UI.gold).setAlpha(0.28);
      glow.setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.hud - 1);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.16, to: 0.4 },
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
      this.dailyGlow = glow;
    }
  }

  _topBar() {
    this.coins = coinPill(this, WIDTH - 100, 56, save.coins).setDepth(DEPTH.hud);

    iconButton(this, 60, 56, {
      r: 30,
      glyph: '⚙',
      size: 28,
      color: UI.slate,
      onClick: () => this._openSettings(),
    }).setDepth(DEPTH.hud);

    // Star total.
    const starChip = this.add.container(WIDTH / 2, 56).setDepth(DEPTH.hud);
    const g = this.add.graphics();
    g.fillStyle(0x1c2445, 0.9);
    g.fillRoundedRect(-78, -24, 156, 48, 24);
    g.lineStyle(3, UI.gold, 0.7);
    g.strokeRoundedRect(-78, -24, 156, 48, 24);
    const star = this.add.image(-46, 0, 'fx_star').setScale(0.5).setTint(UI.gold);
    const txt = label(this, 8, 0, `${save.totalStars}/${TOTAL_LEVELS * 3}`, {
      size: 21,
      color: '#ffe9a8',
    });
    starChip.add([g, star, txt]);
  }

  _footer() {
    const cleared = Math.max(0, save.currentLevel - 1);
    const pct = cleared / TOTAL_LEVELS;

    label(this, WIDTH / 2, 966, `${cleared} of ${TOTAL_LEVELS} levels cleared`, {
      size: 20,
      color: '#8892be',
    }).setDepth(DEPTH.hud);

    progressBar(this, WIDTH / 2, 998, 420, 16, { color: UI.grape, value: pct }).setDepth(DEPTH.hud);

    const chapter = Levels.chapterFor(save.currentLevel);
    label(this, WIDTH / 2, 1032, `Chapter ${Levels.chapterIndex(save.currentLevel) + 1} · ${chapter.name}`, {
      size: 19,
      color: '#6d78a8',
    }).setDepth(DEPTH.hud);

    if (crazy.user?.username) {
      label(this, WIDTH / 2, 1240, `Playing as ${crazy.user.username}`, {
        size: 17,
        color: '#5a648f',
      }).setDepth(DEPTH.hud);
    }
  }

  /** A shivering mascot down in the corner to set the tone. */
  _greeter() {
    const c = new Character(this, 'shiverer', 92, 1210, {
      scale: 0.52,
      hat: save.equippedId('hat'),
      outfit: save.equippedId('outfit'),
      depth: DEPTH.hud - 1,
    });
    this.greeter = c;

    const c2 = new Character(this, 'hungry', WIDTH - 92, 1210, {
      scale: 0.52,
      hat: save.equippedId('hat'),
      outfit: save.equippedId('outfit'),
      depth: DEPTH.hud - 1,
    });
    this.greeter2 = c2;

    if (this.firstBoot && save.currentLevel === 1) {
      this.time.delayedCall(900, () => c.say('Warm us up?', 2600));
    }
  }

  /* ------------------------------ actions ----------------------------- */

  _claimDaily() {
    const claimed = save.claimDaily();
    if (!claimed) {
      sound.play('error');
      return;
    }
    sound.play('chest');
    this.coins.setValue(save.coins);
    this.dailyBtn.setEnabled(false).setLabel('DAILY CLAIMED');
    this.dailyGlow?.destroy();

    floatText(this, WIDTH / 2, 800, `+${claimed.reward}`, { size: 54, depth: DEPTH.popup });
    label(this, WIDTH / 2, 906, `Day ${claimed.streak} streak!`, {
      size: 22,
      color: '#ffd54a',
    }).setDepth(DEPTH.popup);

    const p = this.add.particles(WIDTH / 2, 856, 'p_coin', {
      speed: { min: 180, max: 460 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.7, end: 0.25 },
      lifespan: 1200,
      quantity: 26,
      gravityY: 760,
    });
    p.setDepth(DEPTH.popup);
    p.explode(26);
    this.time.delayedCall(1700, () => p.destroy());
  }

  _openSettings() {
    if (this.modal) return;
    const c = this.add.container(0, 0).setDepth(DEPTH.overlay);
    this.modal = c;

    c.add(scrim(this, 0.72, () => this._closeModal()));
    c.add(panel(this, WIDTH / 2, HEIGHT / 2, 540, 640));
    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 - 250, 'SETTINGS', {
        size: 46,
        color: '#ffffff',
        stroke: '#0a1024',
        strokeWidth: 8,
      })
    );

    const rowY = [-140, -50];
    const keys = [
      ['sfx', 'Sound effects'],
      ['music', 'Music'],
    ];
    keys.forEach(([key, name], i) => {
      const y = HEIGHT / 2 + rowY[i];
      c.add(label(this, WIDTH / 2 - 200, y, name, { size: 26, color: '#c9d2f5' }).setOrigin(0, 0.5));
      const mk = () => {
        const on = !!save.settings[key];
        const b = button(this, WIDTH / 2 + 150, y, {
          w: 130,
          h: 58,
          text: on ? 'ON' : 'OFF',
          size: 24,
          color: on ? UI.mint : UI.slate,
          textColor: on ? '#08301f' : '#8892be',
          radius: 18,
          onClick: () => {
            save.toggleSetting(key);
            sound.refreshSettings();
            b.destroy();
            c.add(mk());
          },
        });
        return b;
      };
      c.add(mk());
    });

    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 + 40, `Best combo x${save.data.stats.bestCombo || 1}  ·  ${save.data.stats.wins} wins`, {
        size: 20,
        color: '#8892be',
      })
    );
    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 + 72, `${save.data.stats.delivered} items delivered`, {
        size: 20,
        color: '#8892be',
      })
    );

    c.add(
      button(this, WIDTH / 2, HEIGHT / 2 + 150, {
        w: 380,
        h: 70,
        text: 'RESET PROGRESS',
        size: 22,
        color: UI.rose,
        textColor: '#ffffff',
        radius: 18,
        onClick: () => this._confirmReset(),
      })
    );

    c.add(
      button(this, WIDTH / 2, HEIGHT / 2 + 244, {
        w: 260,
        h: 72,
        text: 'CLOSE',
        size: 26,
        color: UI.slateLight,
        textColor: '#ffffff',
        onClick: () => this._closeModal(),
      })
    );

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  _confirmReset() {
    this._closeModal();
    const c = this.add.container(0, 0).setDepth(DEPTH.overlay + 1);
    this.modal = c;
    c.add(scrim(this, 0.8));
    c.add(panel(this, WIDTH / 2, HEIGHT / 2, 520, 340, { stroke: UI.rose }));
    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 - 90, 'Erase everything?', {
        size: 34,
        color: '#ffffff',
      })
    );
    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 - 40, 'Levels, coins and cosmetics.\nThis cannot be undone.', {
        size: 20,
        color: '#c9a0b0',
        align: 'center',
      })
    );
    c.add(
      button(this, WIDTH / 2 - 110, HEIGHT / 2 + 70, {
        w: 190,
        h: 66,
        text: 'CANCEL',
        size: 22,
        color: UI.slateLight,
        textColor: '#ffffff',
        onClick: () => this._closeModal(),
      })
    );
    c.add(
      button(this, WIDTH / 2 + 110, HEIGHT / 2 + 70, {
        w: 190,
        h: 66,
        text: 'ERASE',
        size: 22,
        color: UI.rose,
        textColor: '#ffffff',
        onClick: () => {
          save.reset();
          sound.play('error');
          this.scene.restart({ firstBoot: false });
        },
      })
    );
  }

  _closeModal() {
    if (!this.modal) return;
    const c = this.modal;
    this.modal = null;
    this.tweens.add({ targets: c, alpha: 0, duration: 140, onComplete: () => c.destroy() });
  }

  _play(levelId) {
    this._goto('Game', { levelId });
  }

  _goto(scene, data) {
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(scene, data);
    });
  }

  update() {
    this.backdrop?.update(this.input.activePointer.x);
  }
}
