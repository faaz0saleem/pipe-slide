/**
 * Characters — the little people waiting at the bottom of the board.
 *
 * They are drawn entirely with vectors so shop cosmetics (hats, outfit
 * colours) can restyle them with no extra art. Each one has two moods: the
 * "waiting" mood specific to their job (the coal customer shivers, the food
 * customer clutches their stomach) and a shared "happy" mood.
 */

import Phaser from 'phaser';
import { DEPTH, FONT } from '../config/GameConfig.js';
import { getItem } from '../config/ShopCatalog.js';
import { mix } from '../config/Palette.js';

const SKIN = [0xf3c9a0, 0xe0a878, 0xc98c5e, 0xa96e46, 0x7d4f30];

const SAD_LINES = ['Oh no!', 'Not again…', 'That was mine!', 'Aww…'];

/** Per-kind flavour: skin pick, accent and the idle mood. */
const KINDS = {
  shiverer: { mood: 'cold', accent: 0x9fd8ff, skin: 0 },
  hungry: { mood: 'hungry', accent: 0xffc98a, skin: 2 },
  jeweler: { mood: 'wow', accent: 0xd0a2ff, skin: 1 },
  merchant: { mood: 'wow', accent: 0xffd54a, skin: 3 },
};

export default class Character {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} kind key of KINDS
   * @param {number} x
   * @param {number} y feet position
   * @param {object} opts { scale, equipped:{hat,outfit} }
   */
  constructor(scene, kind, x, y, opts = {}) {
    this.scene = scene;
    this.kind = kind;
    this.spec = KINDS[kind] || KINDS.shiverer;
    this.happy = false;
    this.scaleBase = opts.scale ?? 1;

    const outfit = getItem(opts.outfit) || getItem('fit_default');
    const hat = getItem(opts.hat) || getItem('hat_none');
    this.outfit = outfit;
    this.hat = hat;

    this.root = scene.add.container(x, y);
    this.root.setDepth(opts.depth ?? DEPTH.character);
    this.root.setScale(this.scaleBase);

    this._build();
    this._startIdle();
  }

  /* ------------------------------- build ------------------------------ */

  _build() {
    const scene = this.scene;
    const skin = SKIN[this.spec.skin] ?? SKIN[0];
    const body = this.outfit.body;
    const limb = this.outfit.limb;

    // Ground shadow.
    this.shadow = scene.add.ellipse(0, 4, 78, 18, 0x000000, 0.32);

    // Legs.
    const legs = scene.add.graphics();
    legs.fillStyle(limb, 1);
    legs.fillRoundedRect(-22, -46, 17, 48, 8);
    legs.fillRoundedRect(6, -46, 17, 48, 8);
    legs.fillStyle(mix(limb, 0x000000, 0.45), 1);
    legs.fillRoundedRect(-26, -8, 24, 12, 6);
    legs.fillRoundedRect(3, -8, 24, 12, 6);

    // Torso.
    const torso = scene.add.graphics();
    torso.fillStyle(mix(body, 0x000000, 0.25), 1);
    torso.fillRoundedRect(-33, -108, 66, 68, 18);
    torso.fillStyle(body, 1);
    torso.fillRoundedRect(-33, -110, 66, 64, 18);
    torso.fillStyle(0xffffff, 0.16);
    torso.fillRoundedRect(-28, -105, 26, 40, 12);
    // Strap detail so plain colours still read as workwear.
    torso.fillStyle(mix(body, 0xffffff, 0.3), 0.9);
    torso.fillRect(-14, -110, 8, 64);

    // Arms — kept separate so moods can animate them.
    this.armL = scene.add.graphics();
    this.armL.fillStyle(limb, 1);
    this.armL.fillRoundedRect(-11, -8, 20, 46, 9);
    this.armL.fillStyle(skin, 1);
    this.armL.fillCircle(0, 40, 11);
    this.armL.setPosition(-36, -100);

    this.armR = scene.add.graphics();
    this.armR.fillStyle(limb, 1);
    this.armR.fillRoundedRect(-9, -8, 20, 46, 9);
    this.armR.fillStyle(skin, 1);
    this.armR.fillCircle(0, 40, 11);
    this.armR.setPosition(36, -100);

    // Head.
    this.head = scene.add.container(0, -140);
    const face = scene.add.graphics();
    face.fillStyle(mix(skin, 0x000000, 0.18), 1);
    face.fillCircle(0, 2, 34);
    face.fillStyle(skin, 1);
    face.fillCircle(0, 0, 34);
    face.fillStyle(0xffffff, 0.18);
    face.fillCircle(-11, -10, 14);
    // Ears.
    face.fillStyle(mix(skin, 0x000000, 0.1), 1);
    face.fillCircle(-33, 2, 8);
    face.fillCircle(33, 2, 8);

    this.eyes = scene.add.graphics();
    this.mouth = scene.add.graphics();
    this.blushGfx = scene.add.graphics();

    this.head.add([face, this.blushGfx, this.eyes, this.mouth]);

    this.hatGfx = scene.add.graphics();
    this.head.add(this.hatGfx);
    this._drawHat();

    this.root.add([this.shadow, this.armL, this.armR, legs, torso, this.head]);

    this._drawFace(false);
    this._buildMoodFx();
  }

  _drawFace(happy) {
    const e = this.eyes;
    const m = this.mouth;
    e.clear();
    m.clear();

    if (happy) {
      // Closed happy arcs.
      e.lineStyle(5, 0x2a2233, 1);
      e.beginPath();
      e.arc(-13, -4, 9, Math.PI * 1.15, Math.PI * 1.85);
      e.strokePath();
      e.beginPath();
      e.arc(13, -4, 9, Math.PI * 1.15, Math.PI * 1.85);
      e.strokePath();

      m.fillStyle(0x5c2733, 1);
      m.beginPath();
      m.arc(0, 8, 15, 0.1, Math.PI - 0.1);
      m.closePath();
      m.fillPath();
      m.fillStyle(0xff8fa3, 1);
      m.fillEllipse(0, 19, 14, 7);
    } else {
      // Open worried eyes.
      e.fillStyle(0xffffff, 1);
      e.fillEllipse(-13, -2, 17, 20);
      e.fillEllipse(13, -2, 17, 20);
      e.fillStyle(0x2a2233, 1);
      e.fillCircle(-13, 1, 6.5);
      e.fillCircle(13, 1, 6.5);
      e.fillStyle(0xffffff, 0.9);
      e.fillCircle(-15, -2, 2.4);
      e.fillCircle(11, -2, 2.4);
      // Brows tilted inward.
      e.lineStyle(4.5, 0x3a2f45, 1);
      e.beginPath();
      e.moveTo(-23, -18);
      e.lineTo(-6, -13);
      e.moveTo(23, -18);
      e.lineTo(6, -13);
      e.strokePath();

      m.lineStyle(5, 0x5c2733, 1);
      m.beginPath();
      m.arc(0, 22, 12, Math.PI * 1.15, Math.PI * 1.85);
      m.strokePath();
    }

    this.blushGfx.clear();
    if (this.spec.mood === 'cold' && !happy) {
      this.blushGfx.fillStyle(0x7fc4ff, 0.35);
      this.blushGfx.fillEllipse(-24, 10, 16, 10);
      this.blushGfx.fillEllipse(24, 10, 16, 10);
    } else if (happy) {
      this.blushGfx.fillStyle(0xff8fa3, 0.4);
      this.blushGfx.fillEllipse(-25, 10, 17, 10);
      this.blushGfx.fillEllipse(25, 10, 17, 10);
    }
  }

  _drawHat() {
    const g = this.hatGfx;
    g.clear();
    const art = this.hat.art;
    const tint = this.hat.tint ?? 0xffffff;
    if (!art || art === 'none') return;

    switch (art) {
      case 'beanie':
        g.fillStyle(tint, 1);
        g.slice(0, -14, 36, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(mix(tint, 0xffffff, 0.3), 1);
        g.fillRoundedRect(-38, -18, 76, 14, 7);
        g.fillStyle(mix(tint, 0xffffff, 0.55), 1);
        g.fillCircle(0, -50, 10);
        break;

      case 'cap':
        g.fillStyle(tint, 1);
        g.slice(0, -12, 34, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(mix(tint, 0x000000, 0.25), 1);
        g.fillEllipse(0, -12, 92, 16);
        g.fillStyle(mix(tint, 0xffffff, 0.35), 1);
        g.fillCircle(0, -44, 7);
        break;

      case 'helmet':
        g.fillStyle(tint, 1);
        g.slice(0, -10, 37, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(mix(tint, 0x000000, 0.3), 1);
        g.fillRoundedRect(-42, -14, 84, 10, 5);
        // Lamp.
        g.fillStyle(0xdfe7ff, 1);
        g.fillCircle(0, -34, 10);
        g.fillStyle(0xfff9c4, 1);
        g.fillCircle(0, -34, 6);
        break;

      case 'party':
        g.fillStyle(tint, 1);
        g.beginPath();
        g.moveTo(0, -78);
        g.lineTo(26, -10);
        g.lineTo(-26, -10);
        g.closePath();
        g.fillPath();
        g.fillStyle(0xffffff, 0.85);
        g.fillCircle(-8, -30, 5);
        g.fillCircle(9, -48, 4.5);
        g.fillStyle(0xfff2b0, 1);
        g.fillCircle(0, -80, 8);
        break;

      case 'top':
        g.fillStyle(mix(tint, 0x000000, 0.2), 1);
        g.fillEllipse(0, -16, 96, 18);
        g.fillStyle(tint, 1);
        g.fillRoundedRect(-27, -74, 54, 60, 6);
        g.fillStyle(0xd23b52, 1);
        g.fillRect(-27, -30, 54, 12);
        g.fillStyle(0xffffff, 0.18);
        g.fillRect(-22, -70, 12, 50);
        break;

      case 'crown':
        g.fillStyle(tint, 1);
        g.beginPath();
        g.moveTo(-32, -14);
        g.lineTo(-32, -44);
        g.lineTo(-16, -30);
        g.lineTo(0, -52);
        g.lineTo(16, -30);
        g.lineTo(32, -44);
        g.lineTo(32, -14);
        g.closePath();
        g.fillPath();
        g.fillStyle(0xff5d7e, 1);
        g.fillCircle(0, -24, 6);
        g.fillStyle(0x4cc9ff, 1);
        g.fillCircle(-19, -20, 4.5);
        g.fillCircle(19, -20, 4.5);
        break;

      case 'halo':
        g.lineStyle(8, tint, 0.95);
        g.strokeEllipse(0, -54, 60, 18);
        g.lineStyle(3, 0xffffff, 0.8);
        g.strokeEllipse(0, -56, 52, 12);
        break;

      default:
        break;
    }
  }

  /* ------------------------------- moods ------------------------------ */

  _buildMoodFx() {
    if (this.spec.mood === 'cold') {
      // Puffs of visible breath.
      this.breath = this.scene.add.particles(0, 0, 'fx_dot', {
        x: 26,
        y: -138,
        speedX: { min: 12, max: 34 },
        speedY: { min: -18, max: -4 },
        scale: { start: 0.18, end: 0.5 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 1100,
        frequency: 900,
        tint: 0xd8f0ff,
      });
      this.root.add(this.breath);
    }
  }

  _startIdle() {
    const t = this.scene.tweens;
    this._idleTweens = [];

    if (this.spec.mood === 'cold') {
      // Fast, small shivers.
      this._idleTweens.push(
        t.add({
          targets: this.root,
          x: this.root.x + 2.5,
          duration: 70,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        }),
        t.add({
          targets: [this.armL, this.armR],
          angle: { from: -14, to: -22 },
          duration: 320,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        })
      );
      this.armL.setAngle(-14);
      this.armR.setAngle(14);
      this.armL.x = -26;
      this.armR.x = 26;
    } else if (this.spec.mood === 'hungry') {
      // Slow sag with a hand on the belly.
      this.armL.setAngle(70);
      this.armL.setPosition(-30, -86);
      this._idleTweens.push(
        t.add({
          targets: this.head,
          y: { from: -140, to: -132 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        }),
        t.add({
          targets: this.armL,
          angle: { from: 70, to: 85 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        })
      );
    } else {
      this._idleTweens.push(
        t.add({
          targets: this.root,
          scaleY: this.scaleBase * 1.02,
          duration: 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        })
      );
    }
  }

  _stopIdle() {
    this._idleTweens?.forEach((tw) => tw.stop());
    this._idleTweens = [];
    this.root.setAngle(0);
    this.armL.setAngle(0);
    this.armR.setAngle(0);
    this.armL.setPosition(-36, -100);
    this.armR.setPosition(36, -100);
    this.head.y = -140;
  }

  /** Flip to the happy mood — arms up, jump, hearts. */
  cheer() {
    if (this.happy) {
      this.hop();
      return;
    }
    this.happy = true;
    this._stopIdle();
    this._drawFace(true);
    this.breath?.stop();

    const t = this.scene.tweens;
    // Arms thrown up.
    t.add({ targets: this.armL, angle: -150, x: -32, duration: 260, ease: 'Back.out' });
    t.add({ targets: this.armR, angle: 150, x: 32, duration: 260, ease: 'Back.out' });

    this.hop();

    this._joy = t.add({
      targets: this.root,
      y: this.root.y - 12,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Hearts.
    const hearts = this.scene.add.particles(this.root.x, this.root.y - 170, 'fx_heart', {
      speedY: { min: -70, max: -34 },
      speedX: { min: -26, max: 26 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 1200,
      frequency: 260,
      tint: [0xff5d7e, 0xffa0b6, 0xffd54a],
    });
    hearts.setDepth(DEPTH.fx);
    this.hearts = hearts;
    this.scene.time.delayedCall(2600, () => hearts.stop());
  }

  hop() {
    const y = this.root.y;
    this.scene.tweens.add({
      targets: this.root,
      scaleX: this.scaleBase * 1.12,
      scaleY: this.scaleBase * 0.88,
      duration: 110,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.root,
          y: y - 30,
          duration: 200,
          yoyo: true,
          ease: 'Quad.out',
        });
      },
    });
  }

  /**
   * A one-shot dejected reaction: something they were waiting for just got
   * wasted. Deliberately not a state change — they slump, protest, and go back
   * to waiting, because the level is still winnable.
   */
  disappoint() {
    if (this.happy || this._sulking) return;
    this._sulking = true;

    const t = this.scene.tweens;

    // Head shake and a slump.
    t.add({
      targets: this.head,
      x: { from: -5, to: 5 },
      duration: 80,
      yoyo: true,
      repeat: 3,
      onComplete: () => (this.head.x = 0),
    });
    t.add({
      targets: this.root,
      scaleY: this.scaleBase * 0.93,
      duration: 220,
      yoyo: true,
      hold: 420,
      ease: 'Quad.out',
    });
    // Hands to the face.
    t.add({ targets: this.armL, angle: -58, duration: 200, yoyo: true, hold: 520 });
    t.add({ targets: this.armR, angle: 58, duration: 200, yoyo: true, hold: 520 });

    // A little grey rain cloud.
    const cloud = this.scene.add.particles(this.root.x, this.root.y - 205, 'fx_dot', {
      speedY: { min: 20, max: 55 },
      speedX: { min: -14, max: 14 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.55, end: 0 },
      lifespan: 700,
      frequency: 90,
      tint: [0x8892be, 0x5a648f],
    });
    cloud.setDepth(DEPTH.fx);
    this.scene.time.delayedCall(700, () => cloud.stop());
    this.scene.time.delayedCall(1600, () => cloud.destroy());

    this.say(SAD_LINES[Math.floor(Math.random() * SAD_LINES.length)], 1100);

    this.scene.time.delayedCall(1000, () => {
      this._sulking = false;
      if (this.happy) return;
      this.armL.setAngle(this.spec.mood === 'cold' ? -14 : 0);
      this.armR.setAngle(this.spec.mood === 'cold' ? 14 : 0);
    });
  }

  /** Little speech bubble — used for tutorial nudges and reactions. */
  say(text, duration = 1600) {
    const c = this.scene.add.container(this.root.x, this.root.y - 210);
    c.setDepth(DEPTH.fx);

    const t = this.scene.add.text(0, 0, text, {
      fontFamily: FONT,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#20263f',
      align: 'center',
    });
    t.setOrigin(0.5);

    const w = t.width + 30;
    const h = t.height + 20;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 0.96);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.fillTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 14);

    c.add([g, t]);
    c.setScale(0.4);
    c.setAlpha(0);
    this.scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
    this.scene.time.delayedCall(duration, () => {
      this.scene.tweens.add({
        targets: c,
        alpha: 0,
        y: c.y - 20,
        duration: 260,
        onComplete: () => c.destroy(),
      });
    });
    return c;
  }

  setDepth(d) {
    this.root.setDepth(d);
    return this;
  }

  destroy() {
    this._idleTweens?.forEach((t) => t.stop());
    this._joy?.stop();
    this.hearts?.destroy();
    this.root.destroy();
  }
}
