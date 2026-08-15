import Phaser from 'phaser';

import { WIDTH, HEIGHT, PHYSICS } from './config/GameConfig.js';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import MapScene from './scenes/MapScene.js';
import GameScene from './scenes/GameScene.js';
import HudScene from './scenes/HudScene.js';
import ResultScene from './scenes/ResultScene.js';
import ShopScene from './scenes/ShopScene.js';

import crazy from './core/CrazySDK.js';
import sound from './core/SoundKit.js';
import save from './core/SaveManager.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#080b17',
  antialias: true,
  roundPixels: false,
  powerPreference: 'high-performance',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WIDTH,
    height: HEIGHT,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: PHYSICS.gravity },
      enableSleeping: true,
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 3,
      debug: false,
      // A variable timestep makes the simulation depend on the device's frame
      // rate: on a slow machine payloads tunnel through the glass and levels
      // become unsolvable. Stepping a fixed 60Hz means a slow device runs the
      // puzzle in slow motion instead of running it wrong.
      runner: { isFixed: true, fps: 60, maxUpdates: 2 },
    },
  },
  fps: { target: 60, forceSetTimeOut: false },
  scene: [BootScene, MenuScene, MapScene, GameScene, HudScene, ResultScene, ShopScene],
});

/* ------------------------------------------------------------------ */
/* Global lifecycle glue                                               */
/* ------------------------------------------------------------------ */

// The first gesture anywhere unlocks WebAudio (browser autoplay policy).
const unlockAudio = () => {
  sound.unlock();
  sound.refreshSettings();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Ads must not play over the game's own audio.
crazy.onAdStateChange((playing) => {
  sound.duck(playing);
  if (playing) game.loop.sleep();
  else game.loop.wake();
});

// Never lose progress on a background tab or a closed window.
const flush = () => save.flush();
window.addEventListener('pagehide', flush);
window.addEventListener('beforeunload', flush);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flush();
    sound.duck(true);
  } else {
    sound.duck(false);
  }
});

// Handy for debugging and for the headless smoke test.
window.game = game;

export default game;
