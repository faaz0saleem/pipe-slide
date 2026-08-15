/**
 * Payloads — the dynamic bodies that fall: coal, apples, gems, coins, bombs.
 */

import Phaser from 'phaser';
import { DEPTH, PHYSICS } from '../config/GameConfig.js';
import { PAYLOAD_STYLE } from '../config/Palette.js';
import { payloadKey, ART_SCALE } from '../core/Art.js';
import { getItem } from '../config/ShopCatalog.js';

/**
 * Every payload uses a circular collider, whatever its sprite looks like.
 *
 * Polygons were tried first and they deadlock: a hexagon has to tip 30 degrees
 * past its resting face before it will roll, which is steeper than any ramp in
 * the game, so gems simply parked on the diverters. Circles always roll, the
 * faceted artwork spins with the body, and nobody can tell the difference.
 */
const COLLIDER_RADIUS = {
  coal: 0.97,
  gem: 0.94,
  apple: 1,
  coin: 1,
  bomb: 1,
};

const TRAIL_CONFIG = {
  spark: { key: 'fx_spark4', scale: 0.22, lifespan: 420, freq: 55, alpha: 0.9 },
  bubble: { key: 'fx_dot', scale: 0.5, lifespan: 620, freq: 70, alpha: 0.55 },
  fire: { key: 'fx_flame', scale: 0.5, lifespan: 380, freq: 32, alpha: 0.85 },
  void: { key: 'fx_star', scale: 0.3, lifespan: 700, freq: 48, alpha: 0.8 },
};

export default class Payload {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} type payload key
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {string} trailId equipped trail cosmetic
   */
  constructor(scene, type, x, y, radius, trailId) {
    this.scene = scene;
    this.type = type;
    this.radius = radius;
    this.resolved = false;
    this.lost = false;
    this.style = PAYLOAD_STYLE[type];

    // Payload art is drawn at ART_SCALE and displayed at 1/ART_SCALE, and on a
    // Matter game object setScale resizes the *body* as well as the sprite.
    // Pre-multiply the collider so the body ends up at its true radius —
    // without this every payload is silently half-size and slips through the
    // glass.
    const collider = radius * (COLLIDER_RADIUS[type] ?? 1) * ART_SCALE;

    this.sprite = scene.matter.add.image(x, y, payloadKey(type), null, {
      shape: { type: 'circle', radius: collider },
      friction: PHYSICS.payloadFriction,
      frictionStatic: PHYSICS.payloadFrictionStatic,
      frictionAir: PHYSICS.payloadAirFriction,
      restitution: PHYSICS.payloadRestitution,
      density: PHYSICS.payloadDensity,
      label: 'payload',
      slop: 0.02,
    });

    this.sprite.setScale(1 / ART_SCALE);
    this.sprite.setDepth(DEPTH.payload);
    this.sprite.setAngle(Phaser.Math.Between(0, 359));
    // Back-reference so collision handlers can find us from a Matter body.
    this.sprite.setData('payload', this);
    this.body = this.sprite.body;

    this._addTrail(trailId);
  }

  _addTrail(trailId) {
    const item = getItem(trailId);
    const cfg = item && TRAIL_CONFIG[item.fx];
    if (!cfg) return;

    this.emitter = this.scene.add.particles(0, 0, cfg.key, {
      speed: { min: 4, max: 26 },
      scale: { start: cfg.scale, end: 0 },
      alpha: { start: cfg.alpha, end: 0 },
      lifespan: cfg.lifespan,
      frequency: cfg.freq,
      blendMode: 'ADD',
      tint: item.tint,
      follow: this.sprite,
    });
    this.emitter.setDepth(DEPTH.payload - 1);
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  /** Speed in px/s — used for the impact sounds and the settle check. */
  get speed() {
    const v = this.sprite.body?.velocity;
    return v ? Math.hypot(v.x, v.y) : 0;
  }

  /** Delivered into the right pit. */
  consume() {
    if (this.resolved) return;
    this.resolved = true;
    this.destroy();
  }

  destroy() {
    if (this.emitter) {
      this.emitter.stop();
      const em = this.emitter;
      this.scene.time.delayedCall(700, () => em.destroy());
      this.emitter = null;
    }
    if (this.sprite && this.sprite.body) {
      this.scene.matter.world.remove(this.sprite.body);
    }
    this.sprite?.destroy();
    this.sprite = null;
  }
}
