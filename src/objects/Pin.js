/**
 * Pins — the thing you actually pull.
 *
 * A pin is a static Matter rectangle plus an independent visual container.
 * Keeping the two apart matters: on release the body is removed on the very
 * first frame (so payloads start falling instantly and the game feels
 * responsive) while the container keeps tweening out of the wall afterwards.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config/GameConfig.js';
import { UI, mix } from '../config/Palette.js';
import sound from '../core/SoundKit.js';

const METAL = 0x9aa6c4;
const METAL_DARK = 0x4d5878;
const METAL_LIGHT = 0xe4ecff;

export default class Pin {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} def level pin definition
   * @param {(pin:Pin)=>void} onPull
   */
  constructor(scene, def, onPull) {
    this.scene = scene;
    this.def = def;
    this.id = def.id;
    this.onPull = onPull;
    this.pulled = false;
    this.locked = (def.requires || []).length > 0;

    const rad = Phaser.Math.DegToRad(def.angle);

    this.body = scene.matter.add.rectangle(def.x, def.y, def.len, def.thick, {
      isStatic: true,
      angle: rad,
      friction: 0.04,
      restitution: 0.02,
      label: 'pin',
      chamfer: { radius: Math.min(def.thick / 2, 8) },
    });

    this.container = scene.add.container(def.x, def.y);
    this.container.setRotation(rad);
    this.container.setDepth(DEPTH.pin);

    // Which end of the rod sticks out of the wall, in local space.
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    this.knobSide = Math.sign(def.out[0] * cos + def.out[1] * sin) || 1;

    this._draw();
    this._attachInput();
    this._idleAnim();
  }

  /* ------------------------------ visuals ----------------------------- */

  /** Paint the rod itself; re-run whenever the lock state changes. */
  _paintRod(g) {
    const { len, thick } = this.def;
    const half = len / 2;
    const halfT = thick / 2;

    g.clear();

    // Body: three horizontal bands read as a turned metal rod.
    g.fillStyle(METAL_DARK, 1);
    g.fillRoundedRect(-half, -halfT, len, thick, halfT);
    g.fillStyle(METAL, 1);
    g.fillRoundedRect(-half, -halfT, len, thick * 0.72, halfT);
    g.fillStyle(METAL_LIGHT, 0.85);
    g.fillRoundedRect(-half + 4, -halfT + 2, len - 8, thick * 0.26, thick * 0.13);

    // Rivets along the shaft.
    g.fillStyle(mix(METAL_DARK, 0x000000, 0.3), 0.75);
    const step = Math.max(26, len / 7);
    for (let x = -half + step * 0.6; x < half - 6; x += step) {
      g.fillCircle(x, halfT * 0.35, thick * 0.11);
    }

    // Ring handle on the exposed end — the thing you actually grab.
    const ringR = thick * 1.05;
    const kx = this.knobSide * (half + ringR * 0.9);
    const ink = this.locked ? UI.slateLight : METAL_LIGHT;

    g.lineStyle(thick * 0.42, METAL_DARK, 1);
    g.strokeCircle(kx, 2, ringR);
    g.lineStyle(thick * 0.32, ink, 1);
    g.strokeCircle(kx, 0, ringR);
    // Highlight along the upper-left of the ring.
    g.lineStyle(thick * 0.14, 0xffffff, 0.7);
    g.beginPath();
    g.arc(kx, 0, ringR, Math.PI * 1.05, Math.PI * 1.75);
    g.strokePath();
  }

  _draw() {
    const { len, thick } = this.def;
    const half = len / 2;
    const halfT = thick / 2;

    const glow = this.scene.add.graphics();
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(UI.gold, 0.3);
    glow.fillRoundedRect(-half - 6, -halfT - 6, len + 12, thick + 12, halfT + 6);
    this.glow = glow;

    const g = this.scene.add.graphics();
    this._paintRod(g);

    this.gfx = g;
    this.container.add([glow, g]);
    const ringR = thick * 1.05;
    const kx = this.knobSide * (half + ringR * 0.9);

    if (this.locked) {
      this.lockIcon = this.scene.add.image(kx, 0, 'ui_lock').setScale(0.42).setTint(0xffffff);
      this.container.add(this.lockIcon);
      glow.setAlpha(0.25);
    }

    // Generous hit area: the rod, both ring ends, and finger-friendly padding.
    const padY = 24;
    const padX = ringR * 2.2;
    this.container.setSize(len + padX * 2, thick + padY * 2);
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-half - padX, -halfT - padY, len + padX * 2, thick + padY * 2),
      Phaser.Geom.Rectangle.Contains
    );
    this.container.input.cursor = 'pointer';
  }

  _attachInput() {
    const c = this.container;
    c.on('pointerover', () => {
      if (this.pulled) return;
      this.scene.tweens.add({ targets: this.glow, alpha: 1, duration: 140 });
    });
    c.on('pointerout', () => {
      if (this.pulled) return;
      this.scene.tweens.add({ targets: this.glow, alpha: this.locked ? 0.25 : 0.6, duration: 180 });
    });
    c.on('pointerdown', () => this.tryPull());
  }

  _idleAnim() {
    // A slow breathing glow keeps the eye on what is clickable.
    this.glow.setAlpha(this.locked ? 0.25 : 0.6);
    this._idle = this.scene.tweens.add({
      targets: this.glow,
      alpha: this.locked ? { from: 0.18, to: 0.4 } : { from: 0.35, to: 0.85 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  /* ------------------------------ behaviour --------------------------- */

  /** Unlock once every prerequisite pin has been pulled. */
  refreshLock(pulledIds) {
    if (!this.locked || this.pulled) return;
    const ready = (this.def.requires || []).every((id) => pulledIds.has(id));
    if (!ready) return;

    this.locked = false;
    if (this.lockIcon) {
      this.scene.tweens.add({
        targets: this.lockIcon,
        alpha: 0,
        scale: 0.8,
        duration: 220,
        onComplete: () => this.lockIcon?.destroy(),
      });
      this.lockIcon = null;
    }
    this._paintRod(this.gfx);
    sound.play('sparkle');
  }

  tryPull() {
    if (this.pulled) return false;
    if (this.locked) {
      sound.play('locked');
      this.scene.tweens.add({
        targets: this.container,
        x: this.def.x + 6,
        duration: 60,
        yoyo: true,
        repeat: 2,
        onComplete: () => (this.container.x = this.def.x),
      });
      this.scene.events.emit('pin-locked', this);
      return false;
    }
    this.pull();
    return true;
  }

  pull() {
    if (this.pulled) return;
    this.pulled = true;

    // Physics first: the payload must start moving on this very frame.
    this.scene.matter.world.remove(this.body);
    this.body = null;

    this.container.disableInteractive();
    this._idle?.stop();

    const { out, len } = this.def;
    const dist = len * 0.6 + 130;

    this.scene.tweens.add({
      targets: this.container,
      x: this.def.x + out[0] * dist,
      y: this.def.y + out[1] * dist,
      alpha: 0,
      duration: 300,
      ease: 'Back.in',
      onComplete: () => this.container.destroy(),
    });
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0,
      duration: 140,
    });

    sound.play('pull');
    this.onPull?.(this);
  }

  /** Bounce a hint arrow at the pin the solution wants next. */
  showHint() {
    if (this.pulled) return null;
    const { out } = this.def;
    const arrow = this.scene.add.image(
      this.def.x + out[0] * 52,
      this.def.y + out[1] * 52,
      'ui_arrow'
    );
    arrow.setDepth(DEPTH.fx);
    arrow.setRotation(Math.atan2(out[1], out[0]));
    arrow.setTint(UI.gold);
    arrow.setScale(1.1);

    this.scene.tweens.add({
      targets: arrow,
      x: this.def.x + out[0] * 92,
      y: this.def.y + out[1] * 92,
      alpha: { from: 1, to: 0.2 },
      duration: 620,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.inOut',
      onComplete: () => arrow.destroy(),
    });

    const ring = this.scene.add.image(this.def.x, this.def.y, 'fx_ring');
    ring.setDepth(DEPTH.fx).setTint(UI.gold).setScale(0.4);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: { from: 0.9, to: 0 },
      duration: 900,
      repeat: 2,
      onComplete: () => ring.destroy(),
    });
    return arrow;
  }

  destroy() {
    if (this.body) this.scene.matter.world.remove(this.body);
    this._idle?.stop();
    this.container.destroy();
  }
}
