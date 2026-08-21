/**
 * Receivers — the pits at the bottom of the board.
 *
 * Each one owns three things: static walls that physically contain what lands
 * in it, a sensor body that reports arrivals, and a bespoke bit of art per
 * kind (fire pit, food stall, gem stand, vault, slag pit).
 */

import Phaser from 'phaser';
import { DEPTH, GROUND_Y, FONT } from '../config/GameConfig.js';
import { RECEIVER_STYLE, PAYLOAD_STYLE, UI, mix } from '../config/Palette.js';
import sound from '../core/SoundKit.js';

const WALL_T = 16;

export default class Receiver {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.kind = def.kind;
    this.accepts = def.accepts;
    this.required = def.required;
    this.delivered = 0;
    this.wasted = 0;
    this.style = RECEIVER_STYLE[def.kind];
    // A hazard destroys instead of receiving: nothing is owed to it, so it has
    // no quota and no meter, and it must never hold up the win.
    this.hazard = !!def.hazard;

    this.x = def.x;
    this.top = def.top;
    this.w = def.w;
    this.bottom = def.bottom ?? GROUND_Y;
    this.h = this.bottom - this.top;

    this._buildBodies();
    this._draw();
    if (!this.hazard) this._buildMeter();
  }

  /* ------------------------------ physics ----------------------------- */

  _buildBodies() {
    const { matter } = this.scene;
    const halfW = this.w / 2;
    const h = this.h;

    // A hazard destroys on contact, so it needs no walls to hold anything —
    // and a lava pool sitting inside a glass channel must not have a floor, or
    // it plugs the bore it is supposed to be a danger in.
    const opts = { isStatic: true, friction: 0.2, restitution: 0.02, label: 'wall' };
    this.walls = this.hazard
      ? []
      : [
          matter.add.rectangle(this.x - halfW - WALL_T / 2, this.top + h / 2, WALL_T, h, opts),
          matter.add.rectangle(this.x + halfW + WALL_T / 2, this.top + h / 2, WALL_T, h, opts),
          matter.add.rectangle(this.x, this.bottom + WALL_T / 2, this.w + WALL_T * 2, WALL_T, opts),
        ];

    // Sensor sits just inside the mouth so it fires before anything lands.
    const sensorH = Math.min(74, h - 10);
    this.sensor = matter.add.rectangle(this.x, this.top + sensorH / 2 + 6, this.w - 10, sensorH, {
      isStatic: true,
      isSensor: true,
      label: 'receiver',
    });
    this.sensor.receiverRef = this;
  }

  /** True when a payload's centre is genuinely inside the mouth. */
  contains(px, py) {
    return Math.abs(px - this.x) < this.w / 2 - 2 && py > this.top - 6;
  }

  /* ------------------------------ visuals ----------------------------- */

  _draw() {
    const back = this.scene.add.graphics().setDepth(DEPTH.receiver);
    const front = this.scene.add.graphics().setDepth(DEPTH.receiverFront);
    this.backGfx = back;
    this.frontGfx = front;

    const painter = {
      firepit: () => this._drawFirePit(back, front),
      foodstall: () => this._drawFoodStall(back, front),
      gemstand: () => this._drawGemStand(back, front),
      vault: () => this._drawVault(back, front),
      lava: () => this._drawLava(back, front),
    }[this.kind];

    painter?.();
    this._buildIdleFx();
  }

  /** Shared: the tub walls every pit sits inside. */
  _tub(g, colorDark, colorLight, radius = 10) {
    const x = this.x - this.w / 2;
    const y = this.top;
    const w = this.w;
    const h = this.h;

    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x - WALL_T + 4, y + 8, w + WALL_T * 2, h, radius);

    g.fillStyle(colorDark, 1);
    g.fillRoundedRect(x - WALL_T, y, WALL_T, h + WALL_T, radius);
    g.fillRoundedRect(x + w, y, WALL_T, h + WALL_T, radius);
    g.fillRoundedRect(x - WALL_T, y + h, w + WALL_T * 2, WALL_T, radius);

    g.fillStyle(colorLight, 1);
    g.fillRect(x - WALL_T + 3, y + 3, WALL_T - 6, h - 4);
    g.fillRect(x + w + 3, y + 3, WALL_T - 6, h - 4);

    // Inner shadow so the mouth reads as a hole.
    g.fillStyle(0x000000, 0.34);
    g.fillRect(x, y, w, h);
  }

  _drawFirePit(back, front) {
    const s = this.style;
    this._tub(back, s.stone, s.stoneHi, 12);

    const cx = this.x;
    const baseY = this.bottom - 6;

    // Log pile at the bottom of the pit.
    back.fillStyle(0x5a3a22, 1);
    for (let i = 0; i < 3; i++) {
      const w = this.w * (0.62 - i * 0.08);
      back.fillRoundedRect(cx - w / 2, baseY - 16 - i * 11, w, 13, 6);
      back.fillStyle(i % 2 ? 0x6d4728 : 0x4a2f1c, 1);
    }

    // Ember bed glow.
    back.fillStyle(s.ember, 0.35);
    back.fillEllipse(cx, baseY - 12, this.w * 0.7, 22);

    // Front lip of stone, drawn over anything that lands.
    front.fillStyle(mix(s.stone, 0x000000, 0.25), 1);
    front.fillRoundedRect(cx - this.w / 2 - WALL_T, this.bottom - 26, this.w + WALL_T * 2, 30, 10);
    front.fillStyle(s.stoneHi, 0.55);
    front.fillRoundedRect(cx - this.w / 2 - WALL_T + 4, this.bottom - 24, this.w + WALL_T * 2 - 8, 8, 4);
  }

  _drawFoodStall(back, front) {
    const s = this.style;
    this._tub(back, s.wood, s.woodHi, 8);

    const cx = this.x;
    // Woven basket lines.
    back.lineStyle(3, mix(s.wood, 0x000000, 0.35), 0.6);
    for (let y = this.top + 16; y < this.bottom - 8; y += 16) {
      back.beginPath();
      back.moveTo(cx - this.w / 2 + 4, y);
      back.lineTo(cx + this.w / 2 - 4, y);
      back.strokePath();
    }

    // Striped awning across the mouth — the stall's signature.
    const aw = this.w + WALL_T * 2 + 16;
    const ax = cx - aw / 2;
    const ay = this.top - 30;
    front.fillStyle(0x6b4423, 1);
    front.fillRoundedRect(ax, ay, aw, 14, 6);
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      front.fillStyle(i % 2 ? 0xfff1e0 : s.cloth, 1);
      front.beginPath();
      const sw = aw / stripes;
      front.moveTo(ax + i * sw, ay + 12);
      front.lineTo(ax + (i + 1) * sw, ay + 12);
      front.lineTo(ax + (i + 1) * sw - sw * 0.15, ay + 30);
      front.lineTo(ax + i * sw + sw * 0.15, ay + 30);
      front.closePath();
      front.fillPath();
    }
  }

  _drawGemStand(back, front) {
    const s = this.style;
    this._tub(back, s.metal, s.metalHi, 14);

    const cx = this.x;
    // Velvet cushion in the bottom of the case.
    back.fillStyle(s.velvet, 1);
    back.fillRoundedRect(cx - this.w / 2 + 8, this.bottom - 34, this.w - 16, 32, 10);
    back.fillStyle(mix(s.velvet, 0xffffff, 0.28), 0.7);
    back.fillRoundedRect(cx - this.w / 2 + 14, this.bottom - 30, this.w - 28, 8, 4);

    // Glass display posts.
    front.fillStyle(0xbfe6ff, 0.28);
    front.fillRoundedRect(cx - this.w / 2 - 4, this.top - 26, 8, 30, 4);
    front.fillRoundedRect(cx + this.w / 2 - 4, this.top - 26, 8, 30, 4);
  }

  _drawVault(back, front) {
    const s = this.style;
    this._tub(back, s.metal, s.metalHi, 10);

    const cx = this.x;
    // Riveted plate + dial on the back wall of the vault.
    back.fillStyle(mix(s.metal, 0x000000, 0.2), 1);
    back.fillRoundedRect(cx - this.w / 2 + 10, this.top + 12, this.w - 20, this.h - 24, 8);
    back.fillStyle(s.metalHi, 0.4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      back.fillCircle(cx + Math.cos(a) * (this.w * 0.3), this.top + 60 + Math.sin(a) * 34, 4);
    }
    back.lineStyle(6, s.trim, 0.9);
    back.strokeCircle(cx, this.top + 60, 26);
    back.lineStyle(4, s.trim, 1);
    back.beginPath();
    back.moveTo(cx, this.top + 60);
    back.lineTo(cx + 18, this.top + 48);
    back.strokePath();

    front.fillStyle(s.trim, 1);
    front.fillRoundedRect(cx - this.w / 2 - WALL_T, this.top - 14, this.w + WALL_T * 2, 16, 8);
  }

  _drawLava(back, front) {
    const s = this.style;
    // Lava inside a channel is a pool suspended in the glass, not a pit in the
    // ground: no rock tub around it, just molten material filling the bore.
    if (this.hazard) return this._drawMoltenPool(back);
    this._tub(back, s.rock, s.rockHi, 12);

    const cx = this.x;
    back.fillStyle(s.lava, 0.85);
    back.fillRoundedRect(cx - this.w / 2 + 6, this.bottom - 40, this.w - 12, 38, 10);
    back.fillStyle(0xffb066, 0.6);
    back.fillRoundedRect(cx - this.w / 2 + 14, this.bottom - 36, this.w - 28, 10, 5);

    front.fillStyle(mix(s.rock, 0x000000, 0.3), 1);
    front.beginPath();
    front.moveTo(cx - this.w / 2 - WALL_T, this.bottom - 20);
    for (let i = 0; i <= 6; i++) {
      const x = cx - this.w / 2 - WALL_T + ((this.w + WALL_T * 2) / 6) * i;
      front.lineTo(x, this.bottom - 20 - (i % 2 ? 12 : 0));
    }
    front.lineTo(cx + this.w / 2 + WALL_T, this.bottom + 8);
    front.lineTo(cx - this.w / 2 - WALL_T, this.bottom + 8);
    front.closePath();
    front.fillPath();
  }

  /* --------------------------- ambient effects ------------------------ */

  /** A glowing pool of lava filling a section of a glass channel. */
  _drawMoltenPool(g) {
    const s = this.style;
    const x = this.x - this.w / 2;
    const h = this.h;

    g.fillStyle(0xff7a2f, 0.22);
    g.fillRoundedRect(x - 8, this.top - 8, this.w + 16, h + 16, 14);
    g.fillStyle(s.lava, 0.92);
    g.fillRoundedRect(x, this.top, this.w, h, 10);
    g.fillStyle(0xffc46b, 0.85);
    g.fillRoundedRect(x + 5, this.top + 4, this.w - 10, Math.max(6, h * 0.24), 6);
    // A darker crust across the surface so it reads as molten, not as paint.
    g.fillStyle(0x8a2408, 0.5);
    for (let i = 0; i < 4; i++) {
      const cw = this.w * (0.16 + ((i * 7) % 5) / 22);
      g.fillEllipse(x + 14 + ((i * 37) % Math.max(1, this.w - 28)), this.top + h * 0.55, cw, 7);
    }
  }

  _buildIdleFx() {
    const cx = this.x;
    const y = this.bottom - 24;

    if (this.kind === 'firepit') {
      this.flames = this.scene.add.particles(cx, y, 'fx_flame', {
        speedY: { min: -110, max: -50 },
        speedX: { min: -22, max: 22 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.75, end: 0 },
        lifespan: { min: 420, max: 760 },
        frequency: 90,
        quantity: 1,
        tint: [0xffd24a, 0xff8a2e, 0xff4d1a],
        blendMode: 'ADD',
        emitZone: {
          type: 'random',
          source: new Phaser.Geom.Rectangle(-this.w * 0.28, -6, this.w * 0.56, 10),
        },
      });
      this.flames.setDepth(DEPTH.receiverFront + 1);

      this.embers = this.scene.add.particles(cx, y, 'fx_dot', {
        speedY: { min: -90, max: -30 },
        speedX: { min: -30, max: 30 },
        scale: { start: 0.22, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: { min: 700, max: 1400 },
        frequency: 260,
        tint: 0xffc06a,
        blendMode: 'ADD',
      });
      this.embers.setDepth(DEPTH.receiverFront + 1);
    }

    if (this.kind === 'lava') {
      this.bubbles = this.scene.add.particles(cx, this.bottom - 30, 'fx_dot', {
        speedY: { min: -40, max: -12 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 900,
        frequency: 200,
        tint: [0xff6a2a, 0xffb066],
        blendMode: 'ADD',
        emitZone: {
          type: 'random',
          source: new Phaser.Geom.Rectangle(-this.w * 0.35, 0, this.w * 0.7, 8),
        },
      });
      this.bubbles.setDepth(DEPTH.receiverFront + 1);
    }

    if (this.kind === 'gemstand' || this.kind === 'vault') {
      this.shine = this.scene.add.particles(cx, this.top + 40, 'fx_spark4', {
        speed: { min: 4, max: 18 },
        scale: { start: 0.24, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 1000,
        frequency: 420,
        tint: this.kind === 'vault' ? 0xffd54a : 0x9fe8ff,
        blendMode: 'ADD',
        emitZone: {
          type: 'random',
          source: new Phaser.Geom.Rectangle(-this.w * 0.4, -10, this.w * 0.8, this.h * 0.5),
        },
      });
      this.shine.setDepth(DEPTH.receiverFront + 1);
    }
  }

  /* ------------------------------- meter ------------------------------ */

  _buildMeter() {
    const y = this.top - (this.kind === 'foodstall' ? 52 : 34);
    this.meter = this.scene.add.container(this.x, y).setDepth(DEPTH.fx);

    const w = Math.min(this.w + 20, 150);
    const g = this.scene.add.graphics();
    g.fillStyle(0x0a0f22, 0.72);
    g.fillRoundedRect(-w / 2, -17, w, 34, 17);
    g.lineStyle(2.5, PAYLOAD_STYLE[this.accepts].icon, 0.9);
    g.strokeRoundedRect(-w / 2, -17, w, 34, 17);

    const icon = this.scene.add.image(-w / 2 + 19, 0, `p_${this.accepts}`).setScale(0.42);

    this.meterText = this.scene.add.text(6, 0, `0/${this.required}`, {
      fontFamily: FONT,
      fontSize: '21px',
      fontStyle: 'bold',
      color: '#ffffff',
    });
    this.meterText.setOrigin(0.5);
    this.meterText.setShadow(0, 2, 'rgba(0,0,0,0.7)', 3);

    this.wasteText = this.scene.add.text(w / 2 - 16, 0, '', {
      fontFamily: FONT,
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ff8fa3',
    });
    this.wasteText.setOrigin(0.5).setVisible(false);
    this.wasteText.setShadow(0, 2, 'rgba(0,0,0,0.7)', 3);

    /*
     * A ring that lights up while this is the pit the flow currently reaches.
     *
     * The board is only worth thinking about if it can be reasoned out. Which
     * pit is live depends on how many blades are still in place, which is
     * readable but easy to get wrong, and a puzzle you have to guess at is
     * frustrating rather than interesting. Showing it moves the difficulty
     * where it belongs: not "which pit is open now" but "given the order these
     * open in, which pins can I afford to pull".
     */
    this.liveRing = this.scene.add.graphics();
    this.liveRing.lineStyle(3, PAYLOAD_STYLE[this.accepts].icon, 1);
    this.liveRing.strokeRoundedRect(-w / 2 - 5, -22, w + 10, 44, 22);
    this.liveRing.setAlpha(0);

    this.meter.add([g, icon, this.meterText, this.wasteText, this.liveRing]);
  }

  /** Called by the scene whenever a blade comes out and the target changes. */
  setLive(live) {
    if (this.isLive === live) return;
    this.isLive = live;
    this.scene.tweens.killTweensOf(this.liveRing);
    if (!live) {
      this.scene.tweens.add({ targets: this.liveRing, alpha: 0, duration: 200 });
      return;
    }
    this.liveRing.setAlpha(1);
    this.scene.tweens.add({
      targets: this.liveRing,
      alpha: { from: 1, to: 0.35 },
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  _refreshMeter() {
    this.meterText.setText(`${this.delivered}/${this.required}`);
    if (this.wasted) {
      this.wasteText.setText(`-${this.wasted}`);
      this.wasteText.setVisible(true);
    }
    if (this.isSatisfied) {
      this.meterText.setColor('#7cf6b0');
      this.scene.tweens.add({
        targets: this.meter,
        scale: { from: 1.3, to: 1 },
        duration: 320,
        ease: 'Back.out',
      });
    } else {
      this.scene.tweens.add({
        targets: this.meter,
        scale: { from: 1.18, to: 1 },
        duration: 200,
        ease: 'Back.out',
      });
    }
  }

  get isSatisfied() {
    return this.hazard || this.delivered >= this.required;
  }

  /**
   * One of ours was wasted. The quota does not move — groups spawn with spare
   * items precisely so this is survivable — but the meter shows the damage so
   * the player can see their margin shrinking.
   */
  noteWaste() {
    this.wasted++;
    this._refreshMeter();
    this.scene.tweens.add({
      targets: this.meter,
      angle: { from: -6, to: 6 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.meter.setAngle(0),
    });
    return true;
  }

  /* ------------------------------ delivery ---------------------------- */

  /** Called when the right payload arrives. */
  accept(payload) {
    this.delivered++;
    this._refreshMeter();
    this._celebrate(payload.x, payload.y);
    return this.delivered;
  }

  _celebrate(x, y) {
    const scene = this.scene;

    if (this.kind === 'firepit') {
      sound.play('fire');
      // A big flare-up: the fire visibly grows with every lump of coal.
      const burst = scene.add.particles(x, y, 'fx_flame', {
        speedY: { min: -300, max: -120 },
        speedX: { min: -120, max: 120 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 500, max: 900 },
        tint: [0xfff0a0, 0xffb03a, 0xff5a1f],
        blendMode: 'ADD',
        quantity: 18,
      });
      burst.setDepth(DEPTH.fx);
      burst.explode(18);
      scene.time.delayedCall(1100, () => burst.destroy());

      if (this.flames) {
        this.flames.setFrequency(Math.max(24, 90 - this.delivered * 14));
        const grow = 0.5 + Math.min(0.5, this.delivered * 0.09);
        this.flames.setParticleScale(grow, grow);
      }
    } else if (this.kind === 'foodstall') {
      sound.play('chomp');
      this._puff(x, y, [0xffe0a0, 0xef5f6b, 0x7bd66a], 'fx_dot');
    } else if (this.kind === 'lava') {
      sound.play('fire');
      this._puff(x, y, [0xff6a2a, 0x3a1e18, 0xffb066], 'fx_dot');
    } else {
      sound.play('coin', { pitch: Math.min(12, this.delivered) });
      this._puff(x, y, [0xfff2b0, 0xffd54a, 0xffffff], 'fx_spark4');
    }

    const ring = scene.add.image(x, y, 'fx_ring').setDepth(DEPTH.fx);
    ring.setTint(PAYLOAD_STYLE[this.accepts].spark).setScale(0.25).setAlpha(0.9);
    scene.tweens.add({
      targets: ring,
      scale: 1.1,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.out',
      onComplete: () => ring.destroy(),
    });
  }

  _puff(x, y, tints, key) {
    const p = this.scene.add.particles(x, y, key, {
      speed: { min: 60, max: 220 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 350, max: 700 },
      gravityY: 300,
      tint: tints,
      blendMode: 'ADD',
      quantity: 12,
    });
    p.setDepth(DEPTH.fx);
    p.explode(12);
    this.scene.time.delayedCall(900, () => p.destroy());
  }

  /** Wrong payload: flash red so the mistake is unmistakable. */
  reject(x, y) {
    const p = this.scene.add.particles(x, y, 'fx_dot', {
      speed: { min: 80, max: 240 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      tint: [0xff3b5c, 0xffffff],
      blendMode: 'ADD',
      quantity: 16,
    });
    p.setDepth(DEPTH.fx);
    p.explode(16);
    this.scene.time.delayedCall(700, () => p.destroy());

    const cross = this.scene.add.text(this.x, this.top - 70, '✕', {
      fontFamily: FONT,
      fontSize: '72px',
      fontStyle: 'bold',
      color: '#ff3b5c',
    });
    cross.setOrigin(0.5).setDepth(DEPTH.fx);
    cross.setStroke('#2a0009', 8);
    this.scene.tweens.add({
      targets: cross,
      scale: { from: 0.4, to: 1.2 },
      alpha: { from: 1, to: 0 },
      duration: 800,
      ease: 'Back.out',
      onComplete: () => cross.destroy(),
    });
  }

  destroy() {
    // The live-pit ring holds a looping tween; destroying its container is not
    // enough to stop the tween from touching a dead target.
    this.scene.tweens.killTweensOf(this.liveRing);
    for (const b of this.walls) this.scene.matter.world.remove(b);
    this.scene.matter.world.remove(this.sensor);
    this.backGfx.destroy();
    this.frontGfx.destroy();
    this.meter.destroy();
    this.flames?.destroy();
    this.embers?.destroy();
    this.bubbles?.destroy();
    this.shine?.destroy();
  }
}
