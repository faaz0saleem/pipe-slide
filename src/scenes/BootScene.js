/**
 * Boot: paint the procedural textures, load the level book, bring up the SDK
 * and the save file, then hand over to the menu.
 */

import Phaser from 'phaser';
import { buildTextures } from '../core/Art.js';
import crazy from '../core/CrazySDK.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import Levels from '../core/Levels.js';

const TIPS = [
  'Pins can only be pulled once — think before you tug.',
  'Coal warms the shivering folk. Apples feed the hungry ones.',
  'Ramps redirect the flow. Pull one and everything below changes.',
  'The glowing pit is the one the flow reaches right now.',
  // The trap rule, in the words a player would use. It is the only rule they
  // cannot work out from watching, so it has to be said somewhere.
  'A tube empties from the bottom up. Nothing leaves before what is under it.',
  'Some items are stacked too high to ever reach their pit. Leave those pins.',
  'Every tenth level is a coin rush. Fill that vault.',
  'Deliver every last item for the second star.',
  'Beat the target time for the third star.',
];

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this._setTip();
    this._progress(0.08);

    // The standalone single-file build embeds the level book directly: a
    // file:// page cannot fetch a sibling JSON, so there is nothing to load.
    if (window.__LEVELS__) return;

    this.load.json('levels', 'levels/levels.json');
    this.load.on('progress', (v) => this._progress(0.08 + v * 0.62));
  }

  async create() {
    // Textures are cheap but not free; do them after the JSON is in flight.
    buildTextures(this);
    this._progress(0.8);

    crazy.loadingStart();

    const ok = await crazy.init();
    this._progress(0.9);

    save.load();
    Levels.init(window.__LEVELS__ || this.cache.json.get('levels'));

    if (ok && crazy.user?.username) {
      console.info(`[CrazyGames] welcome back, ${crazy.user.username}`);
    }

    this._progress(1);
    crazy.loadingStop();

    // Let the CSS splash finish its fade before the canvas takes over.
    const boot = document.getElementById('boot');
    if (boot) {
      boot.classList.add('gone');
      setTimeout(() => boot.remove(), 500);
    }

    sound.unlock();

    this.time.delayedCall(120, () => {
      this.scene.start('Menu', { firstBoot: true });
    });
  }

  _progress(v) {
    const bar = document.getElementById('boot-bar');
    if (bar) bar.style.width = `${Math.round(Phaser.Math.Clamp(v, 0, 1) * 100)}%`;
  }

  _setTip() {
    const el = document.getElementById('boot-tip');
    if (el) el.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }
}
