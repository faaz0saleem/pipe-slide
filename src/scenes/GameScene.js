/**
 * GameScene — the level itself.
 *
 * Owns the Matter world, builds the level from its JSON definition and runs
 * the win/lose state machine. The HUD lives in a parallel scene so its text
 * never gets caught by the camera shake.
 */

import Phaser from 'phaser';
import { WIDTH, HEIGHT, GROUND_Y, DEPTH, ECONOMY } from '../config/GameConfig.js';
import { PAYLOAD_STYLE } from '../config/Palette.js';

import Levels from '../core/Levels.js';
import save from '../core/SaveManager.js';
import sound from '../core/SoundKit.js';
import crazy from '../core/CrazySDK.js';

import Backdrop from '../objects/Backdrop.js';
import PipeSystem from '../objects/Pipe.js';
import Pin from '../objects/Pin.js';
import Payload from '../objects/Payload.js';
import Receiver from '../objects/Receiver.js';
import Character from '../objects/Character.js';
import { floatText, label } from '../ui/Ui.js';

const { Sleeping } = Phaser.Physics.Matter.Matter;

const COMBO_WINDOW = 1100;
// Matter velocities are px per 60Hz step, so free-fall peaks around 18 and a
// payload gliding down a blade sits near 4. Anything above walking pace means
// the board is still resolving; 14 counted sliding payloads as settled and let
// the stuck detector end levels mid-flow.
const SETTLE_SPEED = 1.2;
const HINT_COST = ECONOMY.hintCost;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.levelId = data?.levelId ?? save.currentLevel;
    this.level = Levels.get(this.levelId);
    if (!this.level) {
      console.warn(`[game] no level ${this.levelId}, falling back to 1`);
      this.levelId = 1;
      this.level = Levels.get(1);
    }

    this.pins = [];
    this.payloads = [];
    this.receivers = [];
    this.characters = [];
    this.pulledIds = new Set();

    this.finished = false;
    this.perfect = true;
    this.lostCount = 0;
    this.deliveredCount = 0;
    this.coinsEarned = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastDeliveryAt = -9999;
    this.startedAt = 0;
    this.settleTimer = 0;
    this.lastClackAt = 0;
    this.hintPin = null;
  }

  /* ================================ build ============================== */

  create() {
    const lv = this.level;

    this.matter.world.autoUpdate = true;
    this.cameras.main.setBackgroundColor('#080b17');

    this.backdrop = new Backdrop(this, lv.theme);

    this._buildWorldBounds();

    this.pipes = new PipeSystem(this, lv.walls, lv.pegs, save.equippedId('pipe'), lv.tubes);

    this._buildReceivers();
    this._buildPins();
    this._spawnPayloads();

    this.matter.world.on('collisionstart', this._onCollisionStart, this);
    // collisionstart fires once, at the instant the payload's *edge* touches
    // the pit sensor — its centre is still above the lip, so the containment
    // check rejects it and no second chance ever arrives. Re-checking while
    // the overlap persists is what actually lands the delivery.
    this.matter.world.on('collisionactive', this._onCollisionActive, this);

    this.scene.launch('Hud', { levelId: this.levelId });
    this.hud = this.scene.get('Hud');
    this._wireHud();

    this._intro();

    save.recordPlay();
    crazy.gameplayStart();
    this.startedAt = this.time.now;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  _buildWorldBounds() {
    const opts = { isStatic: true, label: 'ground', friction: 0.4, restitution: 0 };
    // Floor across the whole stage: anything landing here missed its pit.
    this.groundBody = this.matter.add.rectangle(
      WIDTH / 2,
      GROUND_Y + 60,
      WIDTH + 600,
      120,
      opts
    );
    // Side walls keep strays on screen so the player can see what went wrong.
    this.matter.add.rectangle(-40, HEIGHT / 2, 60, HEIGHT * 2, {
      isStatic: true,
      label: 'wall',
    });
    this.matter.add.rectangle(WIDTH + 40, HEIGHT / 2, 60, HEIGHT * 2, {
      isStatic: true,
      label: 'wall',
    });
  }

  _buildReceivers() {
    const equipped = { hat: save.equippedId('hat'), outfit: save.equippedId('outfit') };

    for (const def of this.level.receivers) {
      const r = new Receiver(this, def);
      this.receivers.push(r);

      if (!def.character) continue;

      // Characters stand half-behind their pit so the composition stays tight
      // even when three pits share the bottom of the board.
      const offset = (def.charSide ?? 1) * (def.w / 2 + 6);
      const x = Phaser.Math.Clamp(def.x + offset, 62, WIDTH - 62);
      const scale = this.level.receivers.length >= 3 ? 0.62 : 0.78;

      const c = new Character(this, def.character, x, GROUND_Y + 22, {
        scale,
        hat: equipped.hat,
        outfit: equipped.outfit,
        depth: DEPTH.character,
      });
      c.receiverId = def.id;
      this.characters.push(c);
    }
  }

  _buildPins() {
    for (const def of this.level.pins) {
      this.pins.push(new Pin(this, def, (pin) => this._onPinPulled(pin)));
    }
  }

  _spawnPayloads() {
    const total = this.level.spawns.reduce((n, s) => n + s.items.length, 0);
    // Hundreds of coins with hundreds of particle emitters would melt the
    // frame rate, so trails are a low-count luxury.
    const trail = total <= 40 ? save.equippedId('trail') : 'trail_none';

    for (const group of this.level.spawns) {
      for (const [x, y] of group.items) {
        this.payloads.push(new Payload(this, group.type, x, y, group.r, trail));
      }
    }
    this.totalPayloads = total;
  }

  _wireHud() {
    // Wait a tick so the HUD scene has created its listeners.
    this.hud.events.once('create', () => {});
    this.events.on('hud-restart', () => this.restart());
    this.events.on('hud-hint', () => this.useHint());
    this.events.on('hud-quit', () => this.quitToMap());
    this.events.on('hud-pause', (paused) => this.setPaused(paused));
  }

  _intro() {
    const lv = this.level;
    const banner = this.add.container(WIDTH / 2, 300).setDepth(DEPTH.popup);

    const title = label(this, 0, 0, lv.bonus ? 'COIN RUSH!' : `LEVEL ${lv.id}`, {
      size: lv.bonus ? 68 : 60,
      color: lv.bonus ? '#ffd54a' : '#ffffff',
      stroke: '#101736',
      strokeWidth: 10,
    });
    const sub = label(this, 0, 56, lv.bonus ? 'Fill the vault' : lv.name, {
      size: 30,
      color: '#a9b6ea',
      stroke: '#101736',
      strokeWidth: 6,
    });
    banner.add([title, sub]);
    banner.setScale(0.6).setAlpha(0);

    this.tweens.add({
      targets: banner,
      scale: 1,
      alpha: 1,
      duration: 380,
      ease: 'Back.out',
    });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: 240,
      delay: 1300,
      duration: 420,
      ease: 'Cubic.in',
      onComplete: () => banner.destroy(),
    });

    if (lv.bonus) sound.play('sparkle');

    // First level gets a one-off nudge at the pin the solution wants.
    if (lv.id === 1 && save.data.stats.wins === 0) {
      this.time.delayedCall(1500, () => {
        const first = this.pins.find((p) => !p.pulled);
        first?.showHint();
      });
    }
  }

  /* =============================== events ============================== */

  _onPinPulled(pin) {
    this.pulledIds.add(pin.id);
    save.bumpStat('pinsPulled');

    // Matter does not wake a sleeping body when the thing holding it up is
    // removed, so a stack resting on a pulled pin would hang in mid-air.
    this._wakeAll();

    for (const p of this.pins) p.refreshLock(this.pulledIds);

    this.cameras.main.shake(90, 0.003);
    this._dustAt(pin.def.x, pin.def.y);

    this.hintPin = null;
    this.settleTimer = 0;
  }

  /** Wake every payload still in play. Cheap: pin pulls are rare. */
  _wakeAll() {
    for (const p of this.payloads) {
      if (!p.resolved && p.sprite?.body) Sleeping.set(p.sprite.body, false);
    }
  }

  /** Wake only what was resting on the payload that just left. */
  _wakeNear(x, y, radius = 150) {
    const r2 = radius * radius;
    for (const p of this.payloads) {
      if (p.resolved || !p.sprite?.body) continue;
      const dx = p.sprite.x - x;
      const dy = p.sprite.y - y;
      if (dx * dx + dy * dy <= r2) Sleeping.set(p.sprite.body, false);
    }
  }

  _dustAt(x, y) {
    const p = this.add.particles(x, y, 'fx_dot', {
      speed: { min: 40, max: 160 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 420,
      quantity: 8,
      tint: [0xffffff, 0xffe6a8],
      blendMode: 'ADD',
    });
    p.setDepth(DEPTH.fx);
    p.explode(8);
    this.time.delayedCall(600, () => p.destroy());
  }

  _onCollisionStart(event) {
    if (this.finished) return;

    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;

      const receiver = bodyA.receiverRef || bodyB.receiverRef;
      const payloadBody =
        bodyA.label === 'payload' ? bodyA : bodyB.label === 'payload' ? bodyB : null;
      if (!payloadBody) continue;

      const payload = payloadBody.gameObject?.getData?.('payload');
      if (!payload || payload.resolved) continue;

      if (receiver) {
        this._resolveDelivery(receiver, payload);
        continue;
      }

      const other = bodyA === payloadBody ? bodyB : bodyA;
      if (other.label === 'ground') {
        this._losePayload(payload);
      } else if (other.label === 'wall' || other.label === 'peg' || other.label === 'pin') {
        this._clack(payload);
      }
    }
  }

  /** Cheap pass over ongoing overlaps: pit sensors only. */
  _onCollisionActive(event) {
    if (this.finished) return;

    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const receiver = bodyA.receiverRef || bodyB.receiverRef;
      if (!receiver) continue;

      const payloadBody = bodyA.label === 'payload' ? bodyA : bodyB.label === 'payload' ? bodyB : null;
      if (!payloadBody) continue;

      const payload = payloadBody.gameObject?.getData?.('payload');
      if (payload && !payload.resolved) this._resolveDelivery(receiver, payload);
    }
  }

  /** Throttled impact tick so a coin avalanche does not become white noise. */
  _clack(payload) {
    const now = this.time.now;
    if (now - this.lastClackAt < 55) return;
    if (payload.speed < 90) return;
    this.lastClackAt = now;
    sound.play('clack');
  }

  /* ============================== delivery ============================= */

  _resolveDelivery(receiver, payload) {
    if (!receiver.contains(payload.x, payload.y)) return;

    if (receiver.accepts === payload.type) this._deliverCorrect(receiver, payload);
    else this._deliverWrong(receiver, payload);
  }

  _deliverCorrect(receiver, payload) {
    const x = payload.x;
    const y = payload.y;
    payload.consume();
    this.deliveredCount++;

    const wasSatisfied = receiver.isSatisfied;
    receiver.accept({ x, y });
    this._wakeNear(x, y);

    // Combo: chain deliveries quickly for bonus coins.
    const now = this.time.now;
    this.combo = now - this.lastDeliveryAt < COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastDeliveryAt = now;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    if (this.level.bonus) {
      this.coinsEarned += 1;
    } else {
      sound.play('deliver', { combo: this.combo });
      if (this.combo >= 3) {
        floatText(this, x, y - 30, `COMBO x${this.combo}`, {
          color: '#ffd54a',
          size: 30,
          depth: DEPTH.popup,
        });
      }
    }

    // The character reacts the moment their pit is happy.
    if (!wasSatisfied && receiver.isSatisfied) {
      const c = this.characters.find((ch) => ch.receiverId === receiver.def.id);
      if (c) {
        c.cheer();
        this.time.delayedCall(220, () => c.say(this._cheerLine(receiver.kind), 1500));
      }
      sound.play('sparkle');
    } else if (!this.level.bonus) {
      const c = this.characters.find((ch) => ch.receiverId === receiver.def.id);
      if (c && c.happy) c.hop();
    }

    this.hud?.events.emit('progress', this._progressRatio());
    this.settleTimer = 0;
    this._checkWin();
  }

  _cheerLine(kind) {
    return {
      firepit: 'So warm!',
      foodstall: 'Delicious!',
      gemstand: 'Stunning!',
      vault: 'Ka-ching!',
      lava: 'Disposed!',
    }[kind] ?? 'Thanks!';
  }

  _deliverWrong(receiver, payload) {
    const x = payload.x;
    const y = payload.y;
    payload.consume();
    receiver.reject(x, y);

    this.cameras.main.shake(180, 0.007);
    this._waste(payload.type, x, y, `Wrong pit!`);
  }

  _losePayload(payload) {
    if (payload.resolved) return;
    // A payload resting inside a pit is the pit's business, not a loss.
    if (this.receivers.some((r) => r.contains(payload.x, payload.y))) return;

    const x = payload.x;
    const y = payload.y;
    payload.resolved = true;
    payload.destroy();
    this._wakeNear(x, y);

    this._waste(payload.type, x, y, 'Missed!');
  }

  /**
   * A payload went somewhere it shouldn't have.
   *
   * Wasting is a cost, not an instant loss: every group spawns with spare
   * items, so a mistake burns slack and upsets the person who was waiting for
   * it. The level is only lost once a pit can no longer reach its quota.
   */
  _waste(type, x, y, reason) {
    this.lostCount++;
    this.perfect = false;

    const receiver = this.receivers.find((r) => r.accepts === type);
    receiver?.noteWaste();

    // The customer who was expecting this item is the one who reacts.
    const owner = this.characters.find((c) => c.receiverId === receiver?.def.id);
    owner?.disappoint();

    const puff = this.add.particles(x, y, 'fx_dot', {
      speed: { min: 40, max: 150 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 460,
      quantity: 10,
      tint: [0x8892be, 0x5a648f],
    });
    puff.setDepth(DEPTH.fx);
    puff.explode(10);
    this.time.delayedCall(700, () => puff.destroy());

    floatText(this, x, y - 26, reason, { color: '#ff8fa3', size: 26, depth: DEPTH.popup });
    sound.play('error');

    if (this.level.noFail) return;

    this.hud?.events.emit('progress', this._progressRatio());
    this.hud?.events.emit('wasted', this.lostCount);
    if (!this._checkRanOut()) this._checkWin();
  }

  /** How many of a type are still in play. */
  _aliveOf(type) {
    return this.payloads.filter((p) => !p.resolved && p.sprite && p.type === type).length;
  }

  /**
   * Fail only when a pit provably cannot be filled any more — that is the
   * moment the run is actually over, rather than the first mistake.
   * @returns {boolean} true if the level was failed.
   */
  _checkRanOut() {
    if (this.finished || this.level.noFail) return false;
    for (const r of this.receivers) {
      if (r.delivered + this._aliveOf(r.accepts) < r.required) {
        this._fail(`Not enough ${PAYLOAD_STYLE[r.accepts].label.toLowerCase()} left!`);
        return true;
      }
    }
    return false;
  }

  _progressRatio() {
    const need = this.receivers.reduce((n, r) => n + r.required, 0) || 1;
    const got = this.receivers.reduce((n, r) => n + Math.min(r.delivered, r.required), 0);
    return got / need;
  }

  /* ============================ win / lose ============================= */

  _checkWin() {
    if (this.finished) return;
    if (!this.receivers.every((r) => r.isSatisfied)) return;
    this._win();
  }

  _win() {
    if (this.finished) return;
    this.finished = true;
    crazy.gameplayStop();

    const elapsed = (this.time.now - this.startedAt) / 1000;
    const inTime = elapsed <= this.level.parTime;

    let stars = 1;
    if (this.perfect) stars++;
    if (this.perfect && inTime) stars++;
    if (this.level.bonus) stars = this.lostCount === 0 ? 3 : this.deliveredCount > 0 ? 2 : 1;

    // Payout.
    // Flat, small payout: coins are scarce on purpose.
    const coins = this.level.bonus
      ? Math.max(1, Math.round(this.coinsEarned * ECONOMY.bonusLevelPerCoin))
      : ECONOMY.perLevel + (stars - 1) * ECONOMY.perStar;

    for (const c of this.characters) c.cheer();
    this._winFx();

    sound.play('win');
    crazy.happytime();
    save.noteCombo(this.bestCombo);
    save.bumpStat('delivered', this.deliveredCount);

    const outcome = save.completeLevel(this.levelId, stars);
    save.addCoins(coins);
    save.flush();

    this.time.delayedCall(1100, () => {
      this.scene.stop('Hud');
      this.scene.pause();
      this.scene.launch('Result', {
        levelId: this.levelId,
        stars,
        coins,
        elapsed,
        delivered: this.deliveredCount,
        lost: this.lostCount,
        bestCombo: this.bestCombo,
        perfect: this.perfect,
        inTime,
        outcome,
        failed: false,
      });
    });
  }

  _winFx() {
    this.cameras.main.flash(260, 255, 240, 180);

    const confetti = this.add.particles(WIDTH / 2, -40, 'fx_confetti', {
      x: { min: 0, max: WIDTH },
      speedY: { min: 180, max: 460 },
      speedX: { min: -90, max: 90 },
      angle: { min: 0, max: 360 },
      rotate: { start: 0, end: 360 },
      scale: { min: 0.6, max: 1.2 },
      alpha: { start: 1, end: 0.9 },
      lifespan: 2600,
      frequency: 22,
      quantity: 3,
      tint: [0xffd54a, 0x4cc9ff, 0x53e6a8, 0xff5d7e, 0xb98bff],
      gravityY: 120,
    });
    confetti.setDepth(DEPTH.popup - 1);
    this.time.delayedCall(1600, () => confetti.stop());
    this.time.delayedCall(4200, () => confetti.destroy());

    const burst = this.add.particles(WIDTH / 2, HEIGHT * 0.6, 'fx_star', {
      speed: { min: 200, max: 520 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 900,
      quantity: 26,
      tint: [0xffd54a, 0xffffff],
      blendMode: 'ADD',
    });
    burst.setDepth(DEPTH.popup - 1);
    burst.explode(26);
    this.time.delayedCall(1200, () => burst.destroy());
  }

  _fail(reason) {
    if (this.finished) return;
    this.finished = true;
    crazy.gameplayStop();
    sound.play('fail');
    save.recordFail();

    const veil = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xff2d55, 0);
    veil.setDepth(DEPTH.overlay);
    this.tweens.add({ targets: veil, alpha: 0.18, duration: 200, yoyo: true, repeat: 1 });

    this.time.delayedCall(900, () => {
      this.scene.stop('Hud');
      this.scene.pause();
      this.scene.launch('Result', {
        levelId: this.levelId,
        failed: true,
        reason,
        delivered: this.deliveredCount,
        lost: this.lostCount,
      });
    });
  }

  /* ============================== controls ============================= */

  restart() {
    crazy.gameplayStop();
    this.scene.stop('Hud');
    this.scene.restart({ levelId: this.levelId });
  }

  startLevel(id) {
    crazy.gameplayStop();
    this.scene.stop('Hud');
    this.scene.restart({ levelId: id });
  }

  quitToMap() {
    crazy.gameplayStop();
    this.scene.stop('Hud');
    this.scene.stop('Result');
    this.scene.start('Map', { focus: this.levelId });
  }

  setPaused(paused) {
    if (paused) {
      this.matter.world.pause();
      this.tweens.pauseAll();
      crazy.gameplayStop();
    } else {
      this.matter.world.resume();
      this.tweens.resumeAll();
      crazy.gameplayStart();
    }
  }

  useHint() {
    if (this.finished) return;
    const next = (this.level.solution || []).find((id) => !this.pulledIds.has(id));
    if (!next) {
      this.hud?.events.emit('hint-result', 'none');
      return;
    }
    if (!save.spendCoins(HINT_COST)) {
      sound.play('error');
      this.hud?.events.emit('hint-result', 'poor');
      return;
    }
    const pin = this.pins.find((p) => p.id === next);
    pin?.showHint();
    sound.play('sparkle');
    this.hud?.events.emit('hint-result', 'ok');
  }

  /* =============================== update ============================== */

  update(time, delta) {
    this.pipes?.update(time, delta);
    this.backdrop?.update(this.input.activePointer.x);

    if (this.finished) return;

    // Anything that escapes below the stage counts as lost.
    for (const p of this.payloads) {
      if (!p.resolved && p.sprite && p.sprite.y > HEIGHT + 120) this._losePayload(p);
    }

    this._checkStuck(delta);
  }

  /**
   * If every pin is out and nothing is moving, the board can no longer change:
   * end the level rather than leaving the player staring at it.
   */
  _checkStuck(delta) {
    const allPinsPulled = this.pins.every((p) => p.pulled);
    if (!allPinsPulled) {
      this.settleTimer = 0;
      return;
    }

    const alive = this.payloads.filter((p) => !p.resolved && p.sprite);
    const moving = alive.some((p) => p.speed > SETTLE_SPEED);
    if (moving) {
      this.settleTimer = 0;
      return;
    }

    this.settleTimer += delta;
    if (this.settleTimer < 1600) return;

    if (this.receivers.every((r) => r.isSatisfied) || this.level.noFail) {
      this._win();
      return;
    }

    // Nothing can move again, so anything still wedged in the glass is spent.
    // Write it off as waste and see whether the quotas were met anyway.
    for (const p of alive) {
      const x = p.x;
      const y = p.y;
      const type = p.type;
      p.resolved = true;
      p.destroy();
      this._waste(type, x, y, 'Stuck!');
      if (this.finished) return;
    }

    if (this.receivers.every((r) => r.isSatisfied)) this._win();
    else this._fail('Not everything was delivered');
  }

  shutdown() {
    // Phaser destroys the Matter world and every display object on scene
    // shutdown, so no manual body/object teardown here — touching the world
    // at this point crashes. Only detach our own listeners.
    if (this.matter?.world) {
      this.matter.world.off('collisionstart', this._onCollisionStart, this);
      this.matter.world.off('collisionactive', this._onCollisionActive, this);
    }
    this.events.off('hud-restart');
    this.events.off('hud-hint');
    this.events.off('hud-quit');
    this.events.off('hud-pause');
  }
}
