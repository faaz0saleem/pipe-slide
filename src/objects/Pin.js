/**
 * Pins — the thing you actually pull.
 *
 * A pin is static Matter geometry plus an independent visual container.
 * Keeping the two apart matters: on release the bodies are removed on the very
 * first frame (so payloads start falling instantly and the game feels
 * responsive) while the container keeps tweening out of the wall afterwards.
 *
 * Two kinds, drawn as two different pieces of hardware, because they are two
 * different things to a player. A **gate** is a rod driven through a tube: a
 * shaft, a gland where it enters the glass, and a ring on the end you grab. A
 * **blade** is the diverter plate at the bottom of the board — a tapered vane
 * bolted to a pivot, with chevrons down its face showing which way it throws.
 * They used to be the same grey stick, which is why the bottom of every level
 * looked like the bottom of every other one.
 *
 * A blade also follows a **spine**: a polyline, so the plate can be a knee, a
 * bow, a hooked lip or a plank. Physics walks it segment by segment exactly
 * the way a pipe wall is built, and tools/solver.mjs must build the same
 * bodies or the generator will prove levels that do not play.
 */

import Phaser from 'phaser';
import { DEPTH } from '../config/GameConfig.js';
import { UI, PIN_METAL, mix } from '../config/Palette.js';
import sound from '../core/SoundKit.js';

/** Fallback finish, used before a theme is known. */
const STEEL = PIN_METAL.mine;

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
    this.isBlade = def.kind === 'ramp';
    this.metal = PIN_METAL[scene.level?.theme] || STEEL;

    const rad = Phaser.Math.DegToRad(def.angle);
    this.rad = rad;

    // A blade's spine is world geometry; everything drawn lives in the
    // container's rotated frame, so bring it across once here.
    this.local = (def.spine || []).map(([x, y]) => {
      const dx = x - def.x;
      const dy = y - def.y;
      return {
        x: dx * Math.cos(-rad) - dy * Math.sin(-rad),
        y: dx * Math.sin(-rad) + dy * Math.cos(-rad),
      };
    });
    /*
     * How far along the plate each spine point sits, 0 at the pivot and 1 at
     * the tip — measured, not counted.
     *
     * Spine points are not evenly spaced: a rib puts three of its five within
     * a sixth of the run, so treating the index as the fraction tapers the
     * whole plate away across the bump and leaves the rest of it parallel.
     */
    const run = [0];
    for (let i = 1; i < this.local.length; i++) {
      const a = this.local[i - 1];
      const b = this.local[i];
      run.push(run[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = run.at(-1) || 1;
    this.localT = run.map((d) => d / total);

    this._buildBodies();

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

  /* ------------------------------ physics ----------------------------- */

  /**
   * One rectangle per spine segment with a disc at each interior joint, or a
   * single rectangle when there is no spine. Mirrors the pin section of
   * tools/solver.mjs.
   */
  _buildBodies() {
    const { def } = this;
    const { matter } = this.scene;
    this.bodies = [];

    if (def.spine && def.spine.length > 1) {
      for (let i = 0; i < def.spine.length - 1; i++) {
        const [x0, y0] = def.spine[i];
        const [x1, y1] = def.spine[i + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        this.bodies.push(
          matter.add.rectangle((x0 + x1) / 2, (y0 + y1) / 2, len + def.thick, def.thick, {
            isStatic: true,
            angle: Math.atan2(dy, dx),
            friction: 0.04,
            restitution: 0.02,
            label: 'pin',
            chamfer: { radius: Math.min(def.thick / 2, 8) },
          })
        );
      }
      for (let i = 1; i < def.spine.length - 1; i++) {
        this.bodies.push(
          matter.add.circle(def.spine[i][0], def.spine[i][1], def.thick / 2, {
            isStatic: true,
            friction: 0.04,
            restitution: 0.02,
            label: 'pin',
          })
        );
      }
      return;
    }

    this.bodies.push(
      matter.add.rectangle(def.x, def.y, def.len, def.thick, {
        isStatic: true,
        angle: this.rad,
        friction: 0.04,
        restitution: 0.02,
        label: 'pin',
        chamfer: { radius: Math.min(def.thick / 2, 8) },
      })
    );
  }

  /* ------------------------ ribbon geometry --------------------------- */

  /**
   * A polyline running parallel to the spine at `f` of its half-thickness.
   *
   * `f` of -1 is the face the payload slides along, +1 the underside, 0 the
   * spine itself. Everything on a blade — the plate, the shaded underside, the
   * bright top face, the specular line — is a band between two of these.
   */
  _edge(pts, f, taper) {
    const last = pts.length - 1;
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(last, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const h = taper(this.localT[i] ?? 0) * f;
      return { x: p.x - (dy / len) * h, y: p.y + (dx / len) * h };
    });
  }

  /** Fill the band between two parallel offsets of the spine. */
  _band(g, pts, from, to, taper, color, alpha) {
    g.fillStyle(color, alpha);
    g.fillPoints([...this._edge(pts, from, taper), ...this._edge(pts, to, taper).reverse()], true);
  }

  /** Position and unit tangent at a fraction of the way along the plate. */
  _at(pts, f) {
    const last = pts.length - 1;
    const t = Math.max(0, Math.min(1, f));
    let i = 0;
    while (i < last - 1 && this.localT[i + 1] < t) i++;
    const span = (this.localT[i + 1] ?? 1) - this.localT[i];
    const k = span > 0 ? (t - this.localT[i]) / span : 0;
    const a = pts[i];
    const b = pts[Math.min(last, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * k, y: a.y + dy * k, nx: dx / len, ny: dy / len };
  }

  /* ------------------------------ visuals ----------------------------- */

  /**
   * Where the ring handle sits, in the container's own frame.
   *
   * One answer for both the painting and the tap routing. They were computed
   * separately at first and drifted apart on a hooked blade, whose tip points
   * somewhere the straight chord does not — so the ring was drawn in one place
   * and grabbable in another.
   */
  _ringAt() {
    const ringR = this.def.thick * 1.05;
    if (this.isBlade && this.local.length > 1) {
      const tip = this._at(this.local, 1);
      return { x: tip.x + tip.nx * ringR * 1.15, y: tip.y + tip.ny * ringR * 1.15, r: ringR };
    }
    return { x: this.knobSide * (this.def.len / 2 + ringR * 0.9), y: 0, r: ringR };
  }

  /** The ring handle, on whichever end sticks out. Shared by both kinds. */
  _paintRing(g, kx, ky, ringR) {
    const m = this.metal;
    const ink = this.locked ? UI.slateLight : m.light;
    const w = ringR * 0.42;

    // Cast shadow, then the ring proper, then the light down its upper left.
    g.lineStyle(w * 1.15, mix(m.dark, 0x000000, 0.45), 0.55);
    g.strokeCircle(kx, ky + 3, ringR);
    g.lineStyle(w, m.dark, 1);
    g.strokeCircle(kx, ky, ringR);
    g.lineStyle(w * 0.62, ink, 1);
    g.strokeCircle(kx, ky, ringR);
    g.lineStyle(w * 0.26, 0xffffff, 0.8);
    g.beginPath();
    g.arc(kx, ky, ringR, Math.PI * 1.02, Math.PI * 1.72);
    g.strokePath();

    // Four knurls, so the ring reads as something a hand closes around.
    g.fillStyle(mix(m.dark, 0xffffff, 0.25), 0.9);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
      g.fillCircle(kx + Math.cos(a) * ringR, ky + Math.sin(a) * ringR, w * 0.34);
    }
  }

  /**
   * A gate: a rod driven across a tube.
   *
   * Read from the glass outwards — a gland collar where the shaft enters, the
   * shaft itself lit from above, rivets down its length, and the ring.
   */
  _paintGate(g) {
    const { len, thick } = this.def;
    const m = this.metal;
    const half = len / 2;
    const halfT = thick / 2;

    // Shadow first, so the rod sits above the glass rather than inside it.
    g.fillStyle(0x05070f, 0.32);
    g.fillRoundedRect(-half, -halfT + 4, len, thick, halfT);

    // Shaft: dark outline, lit band, specular stripe, dark underside.
    g.fillStyle(0x080c14, 0.8);
    g.fillRoundedRect(-half - 1.5, -halfT - 1.5, len + 3, thick + 3, halfT + 1.5);
    g.fillStyle(m.dark, 1);
    g.fillRoundedRect(-half, -halfT, len, thick, halfT);
    g.fillStyle(m.base, 1);
    g.fillRoundedRect(-half + 1.5, -halfT + 1.5, len - 3, thick * 0.6, halfT);
    g.fillStyle(m.light, 0.9);
    g.fillRoundedRect(-half + 4, -halfT + 2, len - 8, thick * 0.24, thick * 0.12);
    g.fillStyle(mix(m.dark, 0x000000, 0.4), 0.55);
    g.fillRoundedRect(-half + 4, halfT - thick * 0.2, len - 8, thick * 0.16, thick * 0.08);

    // Rivets along the shaft.
    g.fillStyle(mix(m.dark, 0x000000, 0.3), 0.75);
    const step = Math.max(26, len / 7);
    for (let x = -half + step * 0.6; x < half - 6; x += step) {
      g.fillCircle(x, halfT * 0.4, thick * 0.11);
    }

    // The gland: the fitting the shaft is driven through, on the buried end.
    const gx = -this.knobSide * (half - 5);
    g.fillStyle(mix(m.dark, 0x000000, 0.2), 1);
    g.fillRoundedRect(gx - 7, -thick * 0.86, 14, thick * 1.72, 5);
    g.fillStyle(m.base, 1);
    g.fillRoundedRect(gx - 5, -thick * 0.78, 6, thick * 1.56, 3);
    g.fillStyle(m.trim, 0.55);
    g.fillRoundedRect(gx - 5, -thick * 0.78, 6, thick * 0.3, 3);

    const k = this._ringAt();
    this._paintRing(g, k.x, k.y, k.r);
  }

  /**
   * A blade: the diverter plate the flow lands on.
   *
   * Tapered from the pivot to the tip, lit along the face the payload rides,
   * shaded underneath, and marked with chevrons pointing the way it throws —
   * which is a readability win as much as a decorative one, because the whole
   * puzzle is knowing which pit the next blade serves.
   */
  _paintBlade(g) {
    const { thick } = this.def;
    const m = this.metal;
    const pts = this.local;
    const halfT = thick / 2;
    // Thick at the pivot, thinner at the tip: a plate that has to hold a pile
    // at one end and shed it at the other.
    const taper = (t) => halfT * (1 - 0.3 * t);

    g.fillStyle(0x05070f, 0.34);
    g.fillPoints(
      [...this._edge(pts, -1, taper), ...this._edge(pts, 1, taper).reverse()].map((p) => ({
        x: p.x,
        y: p.y + 5,
      })),
      true
    );

    // A dark silhouette a shade wider than the plate, so a pale blade still
    // has an edge against a pale sky.
    this._band(g, pts, -1.2, 1.2, taper, 0x080c14, 0.7);
    this._band(g, pts, -1, 1, taper, m.dark, 1);
    this._band(g, pts, 0.15, 1, taper, mix(m.dark, 0x000000, 0.45), 0.85);
    this._band(g, pts, -1, 0.15, taper, m.base, 1);
    this._band(g, pts, -1, -0.35, taper, m.light, 0.92);
    this._band(g, pts, -0.98, -0.72, taper, 0xffffff, 0.75);
    // The very lip of the sliding face, in the chapter's accent — a painted
    // edge, and the line the eye follows to see where the plate ends.
    this._band(g, pts, -1.02, -0.88, taper, m.trim, 0.6);

    /*
     * Chevrons down the face, pointing at the pit this blade serves.
     *
     * Readability first, decoration second: the whole puzzle is knowing which
     * pit the next blade throws into, and a plate with arrows on it answers
     * that at a glance from across the board. They are painted in the
     * chapter's accent over a dark backing so they hold up against both a pale
     * top face and the shaded underside.
     */
    const ink = this.locked ? UI.slateLight : m.trim;
    const chevron = (p, s, color, alpha, drop) => {
      g.fillStyle(color, alpha);
      g.fillPoints(
        [
          { x: p.x + p.nx * s * 1.6, y: p.y + p.ny * s * 1.6 + drop },
          { x: p.x - p.nx * s * 0.5 - p.ny * s, y: p.y - p.ny * s * 0.5 + p.nx * s + drop },
          { x: p.x - p.nx * s * 0.5 + p.ny * s, y: p.y - p.ny * s * 0.5 - p.nx * s + drop },
        ],
        true
      );
    };
    for (const f of [0.26, 0.44, 0.62, 0.8]) {
      const p = this._at(pts, f);
      const s = taper(f) * 0.9;
      chevron(p, s, 0x0a1018, 0.5, 1.5);
      chevron(p, s, ink, 0.95, 0);
    }

    // Pivot hub at the buried end: what the plate swings on.
    const hub = this._at(pts, 0);
    const hubR = thick * 0.82;
    g.fillStyle(mix(m.dark, 0x000000, 0.25), 1);
    g.fillCircle(hub.x, hub.y, hubR);
    g.fillStyle(m.base, 1);
    g.fillCircle(hub.x, hub.y, hubR * 0.72);
    g.fillStyle(m.light, 0.85);
    g.fillCircle(hub.x - hubR * 0.2, hub.y - hubR * 0.24, hubR * 0.3);

    const k = this._ringAt();
    this._paintRing(g, k.x, k.y, k.r);
  }

  /** Re-run whenever the lock state changes. */
  _paintRod(g) {
    g.clear();
    if (this.isBlade && this.local.length > 1) this._paintBlade(g);
    else this._paintGate(g);
  }

  /** The breathing halo that marks a pin as grabbable. */
  _paintGlow(g) {
    const { len, thick } = this.def;
    g.clear();
    g.fillStyle(UI.gold, 0.3);
    if (this.isBlade && this.local.length > 1) {
      const grow = (t) => thick / 2 + 7 - 2 * t;
      g.fillPoints(
        [
          ...this._edge(this.local, -1, grow),
          ...this._edge(this.local, 1, grow).reverse(),
        ],
        true
      );
      return;
    }
    g.fillRoundedRect(-len / 2 - 6, -thick / 2 - 6, len + 12, thick + 12, thick / 2 + 6);
  }

  _draw() {
    const { len, thick } = this.def;
    const half = len / 2;

    const glow = this.scene.add.graphics();
    glow.setBlendMode(Phaser.BlendModes.ADD);
    this.glow = glow;
    this._paintGlow(glow);

    const g = this.scene.add.graphics();
    this.gfx = g;
    this._paintRod(g);

    this.container.add([glow, g]);
    const k = this._ringAt();

    if (this.locked) {
      this.lockIcon = this.scene.add.image(k.x, k.y, 'ui_lock').setScale(0.42).setTint(0xffffff);
      this.container.add(this.lockIcon);
      glow.setAlpha(0.25);
    }

    /*
     * Hit area.
     *
     * A rotated Container with a hand-built Rectangle hit area does not work:
     * Phaser normalises the pointer against the object's display origin, which
     * a Container does not define, so the test silently fails and most of the
     * rod is dead to the touch. An interactive Zone *inside* the container has
     * a real origin and inherits the container's rotation, so the whole rod —
     * and the ring you actually reach for — is grabbable.
     */
    /*
     * Keep the zone hugging the rod. A generous pad sounds friendlier but on a
     * four-pipe board the gates are longer than the gap between pipes, so fat
     * zones blanket their neighbours and — because Phaser delivers to the
     * top-most object only — leave whole rods unclickable.
     *
     * A blade bows away from its chord, so its zone is padded by however far
     * the plate actually strays; otherwise the belly of a bow hangs outside
     * the box that is meant to cover it.
     */
    const padY = 13 + this._bulge();
    const padX = k.r * 1.5;
    this.hit = this.scene.add.zone(0, 0, len + padX * 2, thick + padY * 2);
    this.hit.setInteractive({ useHandCursor: true });
    this.container.add(this.hit);

    // World-space geometry for the scene's tap routing: the rod as a segment,
    // and the ring on its own because that is what a player aims at.
    const rad = this.rad;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ex = cos * (half + k.r);
    const ey = sin * (half + k.r);
    this.segment = [this.def.x - ex, this.def.y - ey, this.def.x + ex, this.def.y + ey];
    this.ring = [
      this.def.x + k.x * cos - k.y * sin,
      this.def.y + k.x * sin + k.y * cos,
    ];
    this.ringRadius = k.r + 14;
    this.grabRadius = thick / 2 + 24 + this._bulge();
  }

  /** How far the spine strays from the straight chord between its ends. */
  _bulge() {
    if (!this.isBlade) return 0;
    return this.local.reduce((most, p) => Math.max(most, Math.abs(p.y)), 0);
  }

  _attachInput() {
    const c = this.hit;
    c.on('pointerover', () => {
      if (this.pulled) return;
      this.scene.tweens.add({ targets: this.glow, alpha: 1, duration: 140 });
    });
    c.on('pointerout', () => {
      if (this.pulled) return;
      this.scene.tweens.add({ targets: this.glow, alpha: this.locked ? 0.25 : 0.6, duration: 180 });
    });
    // Deliberately no pointerdown here: pulls are routed by GameScene, which
    // picks the nearest rod. Overlapping zones would otherwise make whichever
    // pin happens to sit on top the only one you can grab.
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
    for (const body of this.bodies) this.scene.matter.world.remove(body);
    this.bodies.length = 0;

    this.hit.disableInteractive();
    this._idle?.stop();

    if (this.isBlade && this.local.length > 1) this._swingOut();
    else this._slideOut();

    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0,
      duration: 140,
    });

    sound.play('pull');
    this.onPull?.(this);
  }

  /** A gate leaves the way it was driven in: straight out along `out`. */
  _slideOut() {
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
  }

  /**
   * A blade drops away on its hinge instead.
   *
   * It has a pivot hub drawn at one end, so sliding the whole plate sideways
   * contradicted its own art. Swinging it explains the hub, and it reads as
   * the mechanism doing what it is for: the plate lets go and the flow falls
   * through to whatever is below.
   *
   * The container spins about its own centre, so the position is corrected
   * every frame to hold the pivot still.
   */
  _swingOut() {
    const [px, py] = this.def.spine[0];
    const dx = px - this.def.x;
    const dy = py - this.def.y;
    // Whichever way sends the tip downwards, out of the payload's path.
    const sweep = (Math.sign(this.def.out[0]) || 1) * 1.5;
    const state = { t: 0 };

    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: 420,
      ease: 'Back.in',
      onUpdate: () => {
        const a = state.t * sweep;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        this.container.setRotation(this.rad + a);
        this.container.x = px - (dx * cos - dy * sin);
        this.container.y = py - (dx * sin + dy * cos);
        this.container.alpha = 1 - state.t * state.t;
      },
      onComplete: () => this.container.destroy(),
    });
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
    for (const body of this.bodies) this.scene.matter.world.remove(body);
    this.bodies.length = 0;
    this._idle?.stop();
    this.container.destroy();
  }
}
