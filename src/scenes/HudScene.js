/**
 * HudScene — the in-game overlay.
 *
 * Runs in parallel with GameScene so camera shake never rattles the UI, and
 * so the pause menu can sit above a frozen physics world.
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, DEPTH, ECONOMY } from '../config/GameConfig.js';
import { UI } from '../config/Palette.js';
import Levels from '../core/Levels.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import { button, iconButton, coinPill, panel, label, progressBar, scrim, floatText } from '../ui/Ui.js';

const HINT_COST = ECONOMY.hintCost;

export default class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  init(data) {
    this.levelId = data?.levelId ?? save.currentLevel;
    this.level = Levels.get(this.levelId);
    this.paused = false;
    this.pauseUi = null;
  }

  create() {
    this.game_ = this.scene.get('Game');

    this._topBar();
    this._buttons();
    this._comboBadge();

    this.events.on('progress', (v) => this.bar.setValue(v));
    this.events.on('wasted', (n) => this._showWasted(n));
    this.events.on('coins-preview', (n) => this._previewCoins(n));
    this.events.on('hint-result', (r) => this._hintFeedback(r));

    this.input.keyboard?.on('keydown-ESC', () => this._togglePause());
    this.input.keyboard?.on('keydown-R', () => this._emit('hud-restart'));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('progress');
      this.events.off('coins-preview');
      this.events.off('hint-result');
      this.events.off('wasted');
    });
  }

  _emit(evt, ...args) {
    this.game_?.events.emit(evt, ...args);
  }

  /* ------------------------------ top bar ----------------------------- */

  _topBar() {
    const g = this.add.graphics().setDepth(DEPTH.hud);
    // Soft dark fade so white text always has something to sit on.
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x060a18, 0.5 * (1 - i / 12));
      g.fillRect(0, (200 / 12) * i, WIDTH, 200 / 12 + 1);
    }

    const chapter = Levels.chapterFor(this.levelId);

    this.titleText = label(
      this,
      WIDTH / 2,
      44,
      this.level?.bonus ? 'BONUS ROUND' : `LEVEL ${this.levelId}`,
      { size: 34, color: this.level?.bonus ? '#ffd54a' : '#ffffff', stroke: '#0a1024', strokeWidth: 6 }
    );
    this.titleText.setDepth(DEPTH.hud + 1);

    this.subText = label(this, WIDTH / 2, 76, `${chapter.name} · ${this.level?.name ?? ''}`, {
      size: 19,
      color: '#93a0d0',
      stroke: '#0a1024',
      strokeWidth: 4,
    });
    this.subText.setDepth(DEPTH.hud + 1);

    this.bar = progressBar(this, WIDTH / 2, 112, 380, 15, {
      color: this.level?.bonus ? UI.gold : UI.mint,
      value: 0,
    });
    this.bar.setDepth(DEPTH.hud + 1);

    this.coins = coinPill(this, WIDTH - 100, 44, save.coins);
    this.coins.setDepth(DEPTH.hud + 1);
  }

  _buttons() {
    this.pauseBtn = iconButton(this, 52, 44, {
      r: 26,
      glyph: '❚❚',
      size: 20,
      color: UI.slate,
      onClick: () => this._togglePause(),
    }).setDepth(DEPTH.hud + 1);

    this.restartBtn = iconButton(this, 52, 112, {
      r: 26,
      glyph: '↻',
      size: 26,
      color: UI.slate,
      onClick: () => this._emit('hud-restart'),
    }).setDepth(DEPTH.hud + 1);

    this.hintBtn = button(this, WIDTH - 100, 116, {
      w: 132,
      h: 50,
      text: `HINT  ${HINT_COST}`,
      size: 20,
      color: UI.grape,
      textColor: '#ffffff',
      radius: 16,
      onClick: () => this._emit('hud-hint'),
    });
    this.hintBtn.setDepth(DEPTH.hud + 1);
  }

  _comboBadge() {
    this.comboText = label(this, WIDTH / 2, 168, '', {
      size: 32,
      color: '#ffd54a',
      stroke: '#2a1a00',
      strokeWidth: 6,
    });
    this.comboText.setDepth(DEPTH.hud + 1).setAlpha(0);
  }

  _showWasted(n) {
    if (!this.wastedText) {
      this.wastedText = label(this, WIDTH / 2, 146, '', {
        size: 20,
        color: '#ff8fa3',
        stroke: '#2a0009',
        strokeWidth: 4,
      }).setDepth(DEPTH.hud + 1);
    }
    this.wastedText.setText(`${n} wasted`);
    this.wastedText.setScale(1.35);
    this.tweens.add({ targets: this.wastedText, scale: 1, duration: 260, ease: 'Back.out' });
  }

  _previewCoins(n) {
    this.coins.setValue(save.coins + n, false);
  }

  _hintFeedback(result) {
    if (result === 'ok') {
      this.coins.setValue(save.coins);
      floatText(this, WIDTH - 100, 150, `-${HINT_COST}`, {
        color: '#ff8fa3',
        size: 24,
        depth: DEPTH.hud + 2,
        rise: 40,
      });
    } else if (result === 'poor') {
      floatText(this, WIDTH - 100, 150, 'Not enough coins', {
        color: '#ff8fa3',
        size: 20,
        depth: DEPTH.hud + 2,
        rise: 40,
      });
    } else {
      floatText(this, WIDTH - 100, 150, 'All pulled!', {
        color: '#a9b6ea',
        size: 20,
        depth: DEPTH.hud + 2,
        rise: 40,
      });
    }
  }

  /* ------------------------------- pause ------------------------------ */

  _togglePause() {
    this.paused = !this.paused;
    this._emit('hud-pause', this.paused);
    if (this.paused) this._openPause();
    else this._closePause();
  }

  _openPause() {
    const c = this.add.container(0, 0).setDepth(DEPTH.overlay);
    const dim = scrim(this, 0.7);
    c.add(dim);

    const p = panel(this, WIDTH / 2, HEIGHT / 2, 520, 620);
    c.add(p);

    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 - 240, 'PAUSED', {
        size: 52,
        color: '#ffffff',
        stroke: '#0a1024',
        strokeWidth: 8,
      })
    );
    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 - 190, `Level ${this.levelId} · ${this.level?.name ?? ''}`, {
        size: 22,
        color: '#93a0d0',
      })
    );

    c.add(
      button(this, WIDTH / 2, HEIGHT / 2 - 100, {
        w: 380,
        h: 78,
        text: 'RESUME',
        color: UI.mint,
        textColor: '#08301f',
        onClick: () => this._togglePause(),
      })
    );
    c.add(
      button(this, WIDTH / 2, HEIGHT / 2 - 4, {
        w: 380,
        h: 70,
        text: 'RESTART',
        size: 26,
        color: UI.sky,
        textColor: '#062435',
        onClick: () => {
          this._closePause();
          this.paused = false;
          this._emit('hud-restart');
        },
      })
    );
    c.add(
      button(this, WIDTH / 2, HEIGHT / 2 + 84, {
        w: 380,
        h: 70,
        text: 'LEVEL MAP',
        size: 26,
        color: UI.grape,
        textColor: '#ffffff',
        onClick: () => {
          this._closePause();
          this.paused = false;
          this._emit('hud-quit');
        },
      })
    );

    // Sound toggles.
    const mkToggle = (x, key, onGlyph, offGlyph) => {
      const on = !!save.settings[key];
      const b = iconButton(this, x, HEIGHT / 2 + 190, {
        r: 38,
        glyph: on ? onGlyph : offGlyph,
        size: 30,
        color: on ? UI.slateLight : UI.slate,
        onClick: () => {
          const now = save.toggleSetting(key);
          sound.refreshSettings();
          b.destroy();
          c.add(mkToggle(x, key, onGlyph, offGlyph));
          if (now) sound.play('tap');
        },
      });
      return b;
    };
    c.add(mkToggle(WIDTH / 2 - 70, 'sfx', '🔊', '🔇'));
    c.add(mkToggle(WIDTH / 2 + 70, 'music', '♪', '♪̸'));

    c.add(
      label(this, WIDTH / 2, HEIGHT / 2 + 246, 'sound · music', {
        size: 17,
        color: '#6d78a8',
      })
    );

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this.pauseUi = c;
  }

  _closePause() {
    if (!this.pauseUi) return;
    const c = this.pauseUi;
    this.pauseUi = null;
    this.tweens.add({
      targets: c,
      alpha: 0,
      duration: 150,
      onComplete: () => c.destroy(),
    });
  }

  /* ------------------------------- update ----------------------------- */

  update() {
    const g = this.game_;
    if (!g || g.finished) return;

    // Mirror the live combo without the game scene needing to know about UI.
    const active = g.combo >= 3 && this.time.now - g.lastDeliveryAt < 1100;
    const wanted = active ? `COMBO  x${g.combo}` : '';
    if (this.comboText.text !== wanted) {
      this.comboText.setText(wanted);
      if (wanted) {
        this.comboText.setAlpha(1).setScale(0.6);
        this.tweens.add({
          targets: this.comboText,
          scale: 1,
          duration: 240,
          ease: 'Back.out',
        });
      } else {
        this.tweens.add({ targets: this.comboText, alpha: 0, duration: 200 });
      }
    }
  }
}
