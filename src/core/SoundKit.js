/**
 * Procedural audio.
 *
 * The whole soundtrack and every effect is synthesised with WebAudio, so the
 * build ships zero audio bytes — which keeps the CrazyGames bundle small and
 * the first load instant.
 */

import save from './SaveManager.js';

const NOTE = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

/** A gentle 4-chord loop in A minor pentatonic territory. */
const PROGRESSION = [
  { root: -12, scale: [0, 3, 7, 10, 12] }, // Am
  { root: -7, scale: [0, 4, 7, 11, 12] }, // Cmaj-ish
  { root: -9, scale: [0, 3, 7, 10, 12] }, // F
  { root: -5, scale: [0, 4, 7, 9, 12] }, // G
];

class SoundKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.ready = false;
    this.ducked = false;
    this._noiseBuffer = null;
    this._musicTimer = null;
    this._step = 0;
  }

  /* --------------------------- boot / gating -------------------------- */

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (!this.ready) this._build();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ready;
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(this.master);

    // Shared white-noise buffer for whooshes, fire and impacts.
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;

    this.ready = true;
  }

  get sfxOn() {
    return !!save.settings.sfx && !this.ducked;
  }

  get musicOn() {
    return !!save.settings.music && !this.ducked;
  }

  /** Ads and tab-blur mute everything without touching player preferences. */
  duck(on) {
    this.ducked = on;
    if (!this.ready) return;
    const target = on ? 0 : 0.9;
    this._ramp(this.master.gain, target, 0.15);
    if (!on) this._applyMusicGain();
  }

  refreshSettings() {
    if (!this.ready) return;
    this._applyMusicGain();
    if (save.settings.music) this.startMusic();
    else this.stopMusic();
  }

  _applyMusicGain() {
    if (!this.ready) return;
    this._ramp(this.musicBus.gain, this.musicOn ? 0.16 : 0, 0.5);
  }

  _ramp(param, value, time) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + time);
  }

  /* ------------------------------ voices ------------------------------ */

  _tone({ freq = 440, dur = 0.18, type = 'sine', gain = 0.3, slideTo = null, delay = 0, bus }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.25, gain = 0.25, filter = 900, q = 1, sweepTo = null, delay = 0 }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(filter, t0);
    bp.Q.value = q;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* ------------------------------- sfx -------------------------------- */

  play(name, opts = {}) {
    if (!this.ready || !this.sfxOn) return;
    switch (name) {
      case 'tap':
        this._tone({ freq: 660, slideTo: 880, dur: 0.08, type: 'triangle', gain: 0.22 });
        break;

      case 'pull':
        this._noise({ dur: 0.3, gain: 0.3, filter: 1800, sweepTo: 320, q: 0.8 });
        this._tone({ freq: 300, slideTo: 120, dur: 0.22, type: 'sawtooth', gain: 0.12 });
        break;

      case 'locked':
        this._tone({ freq: 180, slideTo: 140, dur: 0.14, type: 'square', gain: 0.16 });
        break;

      case 'clack':
        this._noise({ dur: 0.07, gain: 0.14, filter: 2600, q: 2 });
        break;

      case 'coin': {
        const n = opts.pitch || 0;
        this._tone({ freq: NOTE(12 + n), dur: 0.08, type: 'square', gain: 0.16 });
        this._tone({ freq: NOTE(19 + n), dur: 0.12, type: 'square', gain: 0.13, delay: 0.05 });
        break;
      }

      case 'deliver': {
        const n = Math.min(12, (opts.combo || 1) - 1) * 2;
        this._tone({ freq: NOTE(4 + n), dur: 0.12, type: 'triangle', gain: 0.24 });
        this._tone({ freq: NOTE(11 + n), dur: 0.2, type: 'sine', gain: 0.2, delay: 0.06 });
        break;
      }

      case 'fire':
        this._noise({ dur: 0.55, gain: 0.3, filter: 420, sweepTo: 140, q: 0.6 });
        this._tone({ freq: 90, slideTo: 40, dur: 0.4, type: 'sawtooth', gain: 0.1 });
        break;

      case 'chomp':
        this._tone({ freq: 220, slideTo: 90, dur: 0.1, type: 'square', gain: 0.18 });
        this._noise({ dur: 0.12, gain: 0.12, filter: 700, delay: 0.04 });
        break;

      case 'sparkle':
        [0, 7, 12, 16].forEach((s, i) =>
          this._tone({ freq: NOTE(24 + s), dur: 0.14, type: 'sine', gain: 0.12, delay: i * 0.045 })
        );
        break;

      case 'win':
        [0, 4, 7, 12, 16, 19].forEach((s, i) =>
          this._tone({
            freq: NOTE(s),
            dur: 0.5,
            type: 'triangle',
            gain: 0.2,
            delay: i * 0.09,
          })
        );
        break;

      case 'star':
        this._tone({
          freq: NOTE(12 + (opts.index || 0) * 4),
          slideTo: NOTE(24 + (opts.index || 0) * 4),
          dur: 0.35,
          type: 'sine',
          gain: 0.26,
        });
        break;

      case 'fail':
        this._tone({ freq: 300, slideTo: 90, dur: 0.55, type: 'sawtooth', gain: 0.2 });
        this._noise({ dur: 0.4, gain: 0.15, filter: 500, sweepTo: 120 });
        break;

      case 'buy':
        [0, 5, 9].forEach((s, i) =>
          this._tone({ freq: NOTE(12 + s), dur: 0.22, type: 'triangle', gain: 0.2, delay: i * 0.07 })
        );
        break;

      case 'error':
        this._tone({ freq: 200, dur: 0.1, type: 'square', gain: 0.16 });
        this._tone({ freq: 150, dur: 0.14, type: 'square', gain: 0.16, delay: 0.11 });
        break;

      case 'chest':
        this._noise({ dur: 0.5, gain: 0.2, filter: 1200, sweepTo: 3000 });
        [0, 7, 12, 19, 24].forEach((s, i) =>
          this._tone({ freq: NOTE(s), dur: 0.4, type: 'sine', gain: 0.18, delay: 0.1 + i * 0.06 })
        );
        break;

      case 'whoosh':
        this._noise({ dur: 0.35, gain: 0.18, filter: 300, sweepTo: 2400, q: 0.7 });
        break;

      default:
        break;
    }
  }

  /* ------------------------------ music ------------------------------- */

  startMusic() {
    if (!this.ready || this._musicTimer) return;
    this._applyMusicGain();
    this._step = 0;
    // 8 steps per chord, ~150 BPM feel.
    this._musicTimer = setInterval(() => this._musicStep(), 300);
  }

  stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    if (this.ready) this._ramp(this.musicBus.gain, 0, 0.4);
  }

  _musicStep() {
    if (!this.ready || !this.musicOn) return;
    const chordIndex = Math.floor(this._step / 8) % PROGRESSION.length;
    const chord = PROGRESSION[chordIndex];
    const beat = this._step % 8;

    // Bass on the downbeat and the half bar.
    if (beat === 0 || beat === 4) {
      this._tone({
        freq: NOTE(chord.root - 12),
        dur: 0.9,
        type: 'sine',
        gain: 0.5,
        bus: this.musicBus,
      });
    }

    // Sparse arpeggio that skips a step now and then so it breathes.
    if (beat % 2 === 0 || Math.random() < 0.35) {
      const step = chord.scale[(beat + chordIndex) % chord.scale.length];
      this._tone({
        freq: NOTE(chord.root + step + 12),
        dur: 0.5,
        type: 'triangle',
        gain: 0.28,
        bus: this.musicBus,
      });
    }

    this._step++;
  }
}

export const sound = new SoundKit();
export default sound;
