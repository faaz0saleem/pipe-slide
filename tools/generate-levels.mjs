/**
 * Level generator for Pipe Slide.
 *
 * Emits public/levels/levels.json — 100 deterministically generated levels
 * built from a small set of physically verified blueprints.
 *
 * Every blueprint is designed so that a valid pull order exists by
 * construction; the generator records that order as `solution`, which powers
 * the hint system and the level verifier.
 *
 * Run with:  npm run levels
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/levels/levels.json');

/* ------------------------------------------------------------------ */
/* World constants (must match src/config/GameConfig.js)               */
/* ------------------------------------------------------------------ */

const W = 720;
const H = 1280;
const CHUTE_TOP = 215;
const GROUND_Y = 1150;
const WALL_T = 15;

/**
 * The diverter neck.
 *
 * Hoppers arch when the outlet is narrower than roughly four particle
 * diameters, and payloads run up to 40px across — at 125px the neck jammed
 * constantly with three apples wedged shoulder to shoulder. 169px of clear
 * opening is 4.2 diameters even for the fattest payload, and nothing has
 * bridged it since. Narrowing this is exactly the wrong instinct.
 */
const NECK_L = 268;
const NECK_R = 452;
const NECK_INNER = 169;
const TRUNK_BOTTOM = 930;

/* ------------------------------------------------------------------ */
/* Deterministic RNG                                                    */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const irange = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/* ------------------------------------------------------------------ */
/* Payload catalogue                                                    */
/* ------------------------------------------------------------------ */

const PAYLOADS = {
  coal: { radius: 19, receiver: 'firepit', character: 'shiverer' },
  apple: { radius: 18, receiver: 'foodstall', character: 'hungry' },
  gem: { radius: 17, receiver: 'gemstand', character: 'jeweler' },
  coin: { radius: 14, receiver: 'vault', character: 'merchant' },
  bomb: { radius: 20, receiver: 'lava', character: null },
};

/** Distinct payload types for one level. Never more than one bomb group. */
function distinctTypes(rng, level, n, allowBomb = false) {
  const pool = ['coal', 'apple'];
  if (level >= 13) pool.push('gem');
  if (level >= 24) pool.push('coin');

  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(i, 1)[0]);
  }
  // A bomb group can replace the last slot once the player knows the ropes.
  if (allowBomb && level >= 36 && n >= 2 && rng() < 0.42) {
    out[out.length - 1] = 'bomb';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Chapters / themes                                                    */
/* ------------------------------------------------------------------ */

const CHAPTERS = [
  { name: 'Coal Hollow', theme: 'mine' },
  { name: 'Orchard Heights', theme: 'orchard' },
  { name: 'Crystal Caverns', theme: 'crystal' },
  { name: 'The Foundry', theme: 'foundry' },
  { name: 'Sky Docks', theme: 'sky' },
  { name: 'Frost Works', theme: 'frost' },
  { name: 'Neon Refinery', theme: 'neon' },
  { name: 'Lava Depths', theme: 'lava' },
  { name: 'Clockwork Vault', theme: 'clockwork' },
  { name: 'Aurora Summit', theme: 'aurora' },
];

const NAME_PARTS = {
  twin: ['First Drop', 'Twin Chutes', 'Side by Side', 'Straight Down', 'Double Trouble', 'Parallel Lines', 'Three of a Kind', 'Clean Split'],
  crossRamp: ['The Diverter', 'Slide Away', 'Left Then Down', 'Switchback', 'Two Ways Out', 'Ramp Runner'],
  stackGate: ['Stacked Deck', 'Layer Cake', 'Top Shelf', 'Under Pressure', 'One at a Time', 'Sandwiched'],
  towerSort: ['Triple Sort', 'Sorting Tower', 'Three Ramps', 'Cascade Control', 'Order of Operations', 'Master Sorter'],
  zigzag: ['Zig and Zag', 'The Long Way Down', 'Tumbledown', 'Bounce House', 'Pinball Alley'],
  vault: ['Coin Rush', 'Golden Hour', 'Vault Breaker', 'Jackpot', 'Treasure Cascade', 'Midas Drop', 'Bullion Run', 'Piggy Bank', 'Mint Condition', 'The Big Payout'],
};

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */

const r1 = (n) => Math.round(n * 10) / 10;

function wall(points, t = WALL_T) {
  return { points: points.map(([x, y]) => [r1(x), r1(y)]), t };
}
const vwall = (x, y0, y1, t = WALL_T) => wall([[x, y0], [x, y1]], t);
const seg = (x0, y0, x1, y1, t = WALL_T) => wall([[x0, y0], [x1, y1]], t);

function gatePin(id, x, y, len, opts = {}) {
  return {
    id,
    kind: 'gate',
    x: r1(x),
    y: r1(y),
    len: r1(len),
    thick: opts.thick || 18,
    angle: 0,
    out: opts.out || [1, 0],
    requires: opts.requires || [],
  };
}

function rampPin(id, x0, y0, x1, y1, opts = {}) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  return {
    id,
    kind: 'ramp',
    x: r1((x0 + x1) / 2),
    y: r1((y0 + y1) / 2),
    len: r1(len + 8),
    thick: opts.thick || 16,
    angle: r1((Math.atan2(dy, dx) * 180) / Math.PI),
    out: [r1(dx / len), r1(dy / len)],
    requires: opts.requires || [],
  };
}

function receiver(type, x, top, w, opts = {}) {
  const p = PAYLOADS[type];
  return {
    id: `r_${type}`,
    kind: p.receiver,
    accepts: type,
    x: r1(x),
    top: r1(top),
    w: r1(w),
    bottom: GROUND_Y,
    required: 0,
    quota: opts.quota ?? 1,
    character: p.character,
    charSide: opts.charSide === undefined ? 1 : opts.charSide,
  };
}

/**
 * Fill a chamber with a payload group, stacked bottom-up so nothing starts
 * overlapping (overlapping bodies make Matter explode on frame one).
 */
function fillChamber(rng, cx, halfW, yBottom, count, type) {
  const r = PAYLOADS[type].radius;
  const step = r * 2 + 5;
  const usable = halfW * 2 - 14;
  const perRow = Math.max(1, Math.floor(usable / step));
  const items = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowCount = Math.min(perRow, count - row * perRow);
    const rowW = (rowCount - 1) * step;
    items.push([
      r1(cx - rowW / 2 + col * step + (rng() - 0.5) * 3),
      r1(yBottom - r - 6 - row * step),
    ]);
  }
  return { type, r, items };
}

/* ------------------------------------------------------------------ */
/* Shared bottom section: trunk + diverter ramp + two receivers        */
/* ------------------------------------------------------------------ */

/**
 * A vertical trunk that empties either onto a removable ramp (throwing
 * payloads into the LEFT pit) or, once that ramp is pulled, straight down
 * into the CENTRE pit. `trunkTop` lets callers stack their own funnel above.
 */
function diverterBottom(leftType, centreType, walls, pins, receivers, trunkTop = 830) {
  // TRUNK_BOTTOM is load-bearing. The ramp descends to the left, so payloads
  // riding it must clear the LEFT wall's bottom edge, while the higher right
  // end must still be low enough to seal the trunk. Both constraints are
  // proven by tools/simulate-levels.mjs — do not nudge this without re-running it.
  // The left wall stops early: payloads leaving on the ramp have to duck under
  // it, and a tight gap here is where they used to wedge. The right wall runs
  // lower so it swallows the ramp's high end and seals the neck.
  walls.push(vwall(NECK_L, trunkTop, TRUNK_BOTTOM - 20));
  walls.push(vwall(NECK_R, trunkTop, TRUNK_BOTTOM));

  pins.push(rampPin('ramp', 452, 916, 190, 1030));

  // The pits butt up against each other. Any ledge between them is somewhere
  // a stray payload can perch and stall the level, so there isn't one.
  receivers.push(receiver(leftType, 118, 1042, 196, { charSide: -1 }));
  receivers.push(receiver(centreType, 360, 1046, 250, { charSide: 1 }));
}

/* ------------------------------------------------------------------ */
/* Blueprints                                                           */
/* ------------------------------------------------------------------ */

/** Straight lanes: each chamber drops into its own pit. Order-free. */
function buildTwin(rng, level, diff) {
  const lanes = diff < 1 ? 2 : rng() < 0.45 ? 2 : 3;
  const doubleGate = diff >= 1 && rng() < 0.5;
  const types = distinctTypes(rng, level, lanes);

  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];
  const solution = [];

  const laneW = W / lanes;
  const halfW = lanes === 2 ? 112 : 80;

  for (let i = 0; i < lanes; i++) {
    const cx = laneW * (i + 0.5);
    const type = types[i];
    walls.push(vwall(cx - halfW, CHUTE_TOP, 1046));
    walls.push(vwall(cx + halfW, CHUTE_TOP, 1046));

    const gateLen = halfW * 2 + 34;
    const outDir = cx < W / 2 ? [-1, 0] : [1, 0];
    const total = irange(rng, 3, Math.min(4 + diff, 7));

    if (!doubleGate) {
      pins.push(gatePin(`g${i}`, cx, 700, gateLen, { out: outDir }));
      solution.push(`g${i}`);
      spawns.push(fillChamber(rng, cx, halfW, 690, total, type));
    } else {
      pins.push(gatePin(`g${i}a`, cx, 790, gateLen, { out: outDir }));
      pins.push(gatePin(`g${i}b`, cx, 560, gateLen, { out: [-outDir[0], 0] }));
      solution.push(`g${i}a`, `g${i}b`);
      const lower = Math.max(2, Math.floor(total / 2));
      spawns.push(fillChamber(rng, cx, halfW, 780, lower, type));
      spawns.push(fillChamber(rng, cx, halfW, 550, total - lower, type));
    }

    receivers.push(
      receiver(type, cx, 1046, halfW * 2 - 4, { charSide: cx < W / 2 ? -1 : 1 })
    );
  }

  return { family: 'twin', walls, pins, receivers, spawns, solution };
}

/** Two chambers over a shared trunk with one diverter ramp. */
function buildCrossRamp(rng, level, diff) {
  const [tA, tB] = distinctTypes(rng, level, 2, true);
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  walls.push(vwall(96, CHUTE_TOP, 664));
  walls.push(vwall(310, CHUTE_TOP, 706));
  walls.push(vwall(410, CHUTE_TOP, 706));
  walls.push(vwall(624, CHUTE_TOP, 664));
  walls.push(seg(96, 664, NECK_L, 830));
  walls.push(seg(624, 664, NECK_R, 830));

  spawns.push(fillChamber(rng, 203, 107, 604, irange(rng, 3, Math.min(4 + diff, 7)), tA));
  spawns.push(fillChamber(rng, 517, 107, 604, irange(rng, 3, Math.min(4 + diff, 7)), tB));

  pins.push(gatePin('gA', 203, 618, 248, { out: [-1, 0] }));
  pins.push(gatePin('gB', 517, 618, 248, { out: [1, 0] }));

  // tA rides the ramp into the left pit; tB drops straight into the centre.
  diverterBottom(tA, tB, walls, pins, receivers);

  return { family: 'crossRamp', walls, pins, receivers, spawns, solution: ['gA', 'ramp', 'gB'] };
}

/** One tall chamber with groups stacked behind gates, diverter below. */
function buildStackGate(rng, level, diff) {
  const [tLow, tHigh] = distinctTypes(rng, level, 2, true);
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  walls.push(vwall(230, CHUTE_TOP, 714));
  walls.push(vwall(490, CHUTE_TOP, 714));
  walls.push(seg(230, 714, NECK_L, 830));
  walls.push(seg(490, 714, NECK_R, 830));

  spawns.push(fillChamber(rng, 360, 130, 690, irange(rng, 3, Math.min(4 + diff, 7)), tLow));
  spawns.push(fillChamber(rng, 360, 130, 452, irange(rng, 3, Math.min(4 + diff, 7)), tHigh));

  pins.push(gatePin('gLow', 360, 704, 296, { out: [1, 0] }));
  pins.push(gatePin('gMid', 360, 466, 296, { out: [-1, 0] }));

  diverterBottom(tLow, tHigh, walls, pins, receivers);

  return { family: 'stackGate', walls, pins, receivers, spawns, solution: ['gLow', 'ramp', 'gMid'] };
}

/** Three chambers, three pits, two stacked diverter ramps. Order is forced. */
function buildTowerSort(rng, level, diff) {
  const [tRight, tLeft, tCentre] = distinctTypes(rng, level, 3, true);

  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  // Four vertical walls => three 200px chambers. Everything sits higher than
  // the other families: two stacked ramps need real vertical room underneath.
  walls.push(vwall(60, CHUTE_TOP, 560));
  walls.push(vwall(260, CHUTE_TOP, 620));
  walls.push(vwall(460, CHUTE_TOP, 620));
  walls.push(vwall(660, CHUTE_TOP, 560));
  walls.push(seg(60, 560, NECK_L, 740));
  walls.push(seg(660, 560, NECK_R, 740));
  // The left neck wall stops just short of ramp 1 so nothing leaks left past
  // it; the right one runs lower to seal ramp 1's high end.
  walls.push(vwall(NECK_L, 740, 784));
  walls.push(vwall(NECK_R, 740, 790));

  const centres = [160, 360, 560];
  const contents = [tRight, tCentre, tLeft]; // left→right chamber contents
  const gateIds = {};

  for (let i = 0; i < 3; i++) {
    const t = contents[i];
    spawns.push(fillChamber(rng, centres[i], 92, 506, irange(rng, 3, Math.min(4 + diff, 6)), t));
    pins.push(gatePin(`g${i}`, centres[i], 520, 224, { out: i === 2 ? [1, 0] : [-1, 0] }));
    gateIds[t] = `g${i}`;
  }

  // Ramp 1 throws right; ramp 2 (below it) throws left; neither = centre.
  pins.push(rampPin('ramp1', 265, 810, 560, 940));
  pins.push(rampPin('ramp2', 452, 905, 150, 1010));

  // As with the diverter pits: no ledges between neighbours.
  receivers.push(receiver(tLeft, 112, 1030, 184, { charSide: -1 }));
  receivers.push(receiver(tCentre, 356, 1035, 234, { charSide: 1 }));
  receivers.push(receiver(tRight, 600, 980, 190, { charSide: 1 }));

  return {
    family: 'towerSort',
    walls,
    pins,
    receivers,
    spawns,
    solution: [gateIds[tRight], 'ramp1', gateIds[tLeft], 'ramp2', gateIds[tCentre]],
  };
}

/** Chamber over a wide bouncing corridor, then the standard diverter. */
function buildZigzag(rng, level, diff) {
  const [tLow, tHigh] = distinctTypes(rng, level, 2, true);
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  walls.push(vwall(240, CHUTE_TOP, 530));
  walls.push(vwall(480, CHUTE_TOP, 530));

  // Bounce corridor. The shelves sit at ~24 degrees (anything shallower and
  // settled polygons just park on them) and shelf 1 discharges a clear 90px
  // above shelf 2, so nothing can wedge in the gap between them.
  walls.push(vwall(180, 530, 800));
  walls.push(vwall(540, 530, 800));
  walls.push(seg(180, 570, 430, 682, 13));
  walls.push(seg(540, 724, 350, 820, 13));
  walls.push(seg(180, 800, NECK_L, 866));
  walls.push(seg(540, 800, NECK_R, 866));

  spawns.push(fillChamber(rng, 360, 120, 506, irange(rng, 3, Math.min(4 + diff, 6)), tLow));
  spawns.push(fillChamber(rng, 360, 120, 346, irange(rng, 3, Math.min(4 + diff, 6)), tHigh));

  pins.push(gatePin('gLow', 360, 520, 276, { out: [1, 0] }));
  pins.push(gatePin('gMid', 360, 360, 276, { out: [-1, 0] }));

  diverterBottom(tLow, tHigh, walls, pins, receivers, 866);

  return { family: 'zigzag', walls, pins, receivers, spawns, solution: ['gLow', 'ramp', 'gMid'] };
}

/** Bonus level: a hopper of coins tumbling through pegs into the vault. */
function buildVault(rng, level) {
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];
  const pegs = [];

  // Hopper
  walls.push(vwall(64, CHUTE_TOP, 520));
  walls.push(vwall(656, CHUTE_TOP, 520));
  walls.push(seg(64, 520, 300, 690));
  walls.push(seg(656, 520, 420, 690));
  walls.push(vwall(300, 690, 760));
  walls.push(vwall(420, 690, 760));

  // Peg corridor, opening into a wide vault mouth so coins never bridge.
  walls.push(vwall(96, 760, 1000));
  walls.push(vwall(624, 760, 1000));
  walls.push(seg(96, 1000, 214, 1070));
  walls.push(seg(624, 1000, 506, 1070));

  // Peg columns are kept well clear of the corridor walls: a coin wedged
  // between a peg and the wall would stall the whole cascade.
  for (let r = 0; r < 4; r++) {
    const y = 824 + r * 48;
    const xs = r % 2 === 0 ? [184, 272, 360, 448, 536] : [228, 316, 404, 492];
    for (const x of xs) pegs.push({ x, y, r: 11 });
  }

  const count = Math.min(260, 100 + level * 1.6) | 0;
  const r = PAYLOADS.coin.radius;
  const step = r * 2 + 3;
  const perRow = Math.floor((656 - 64 - 28) / step);
  const items = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowCount = Math.min(perRow, count - row * perRow);
    const rowW = (rowCount - 1) * step;
    items.push([r1(360 - rowW / 2 + col * step + (rng() - 0.5) * 2), r1(496 - row * step)]);
  }
  spawns.push({ type: 'coin', r, items });

  pins.push(gatePin('gHopper', 360, 700, 156, { out: [1, 0], thick: 16 }));
  const solution = ['gHopper'];
  if (level >= 30) {
    pins.push(gatePin('gChute', 360, 1062, 320, { out: [-1, 0], thick: 16 }));
    solution.push('gChute');
  }

  // Bonus rounds are a spectacle, not a precision test: banking most of the
  // cascade is enough, and every extra coin is still paid out.
  receivers.push(receiver('coin', 360, 1074, 300, { charSide: 1, quota: 0.55 }));

  return { family: 'vault', walls, pins, receivers, spawns, pegs, solution };
}

/* ------------------------------------------------------------------ */
/* Level assembly                                                       */
/* ------------------------------------------------------------------ */

function familyFor(level, rng) {
  if (level % 10 === 0) return 'vault';
  if (level <= 4) return 'twin';
  if (level <= 8) return rng() < 0.5 ? 'twin' : 'crossRamp';
  if (level <= 18) return pick(rng, ['twin', 'crossRamp', 'stackGate']);
  if (level <= 32) return pick(rng, ['crossRamp', 'stackGate', 'towerSort', 'twin']);
  if (level <= 55) return pick(rng, ['crossRamp', 'stackGate', 'towerSort', 'zigzag']);
  if (level <= 80) return pick(rng, ['towerSort', 'zigzag', 'stackGate', 'towerSort']);
  return pick(rng, ['towerSort', 'zigzag', 'towerSort', 'crossRamp']);
}

function buildLevel(level) {
  const rng = mulberry32(level * 7919 + 13);
  const diff = Math.min(3, Math.floor((level - 1) / 26));
  const family = familyFor(level, rng);

  const builders = {
    vault: () => buildVault(rng, level),
    crossRamp: () => buildCrossRamp(rng, level, diff),
    stackGate: () => buildStackGate(rng, level, diff),
    towerSort: () => buildTowerSort(rng, level, diff),
    zigzag: () => buildZigzag(rng, level, diff),
    twin: () => buildTwin(rng, level, diff),
  };
  const core = builders[family]();

  // Pits must know how many of their payload actually exist.
  const totals = {};
  for (const s of core.spawns) totals[s.type] = (totals[s.type] || 0) + s.items.length;
  for (const r of core.receivers) {
    r.required = Math.max(1, Math.round((totals[r.accepts] || 0) * r.quota));
  }

  const chapter = CHAPTERS[Math.floor((level - 1) / 10)];
  const names = NAME_PARTS[core.family];
  const name =
    core.family === 'vault'
      ? names[(level / 10 - 1) % names.length]
      : names[(level * 3) % names.length];

  const payloadCount = Object.values(totals).reduce((a, b) => a + b, 0);
  const isBonus = core.family === 'vault';

  return {
    id: level,
    name,
    chapter: chapter.name,
    theme: chapter.theme,
    bonus: isBonus,
    noFail: isBonus,
    par: core.solution.length,
    parTime: isBonus ? 26 : 9 + core.solution.length * 5 + payloadCount,
    reward: isBonus ? 0 : 18 + Math.floor(level / 4) * 4,
    family: core.family,
    walls: core.walls,
    pegs: core.pegs || [],
    pins: core.pins,
    spawns: core.spawns,
    receivers: core.receivers,
    solution: core.solution,
  };
}

const levels = [];
for (let i = 1; i <= 100; i++) levels.push(buildLevel(i));

mkdirSync(dirname(OUT), { recursive: true });
const doc = {
  version: 1,
  world: { width: W, height: H, groundY: GROUND_Y, chuteTop: CHUTE_TOP },
  chapters: CHAPTERS,
  payloads: PAYLOADS,
  levels,
};
writeFileSync(OUT, JSON.stringify(doc));

console.log(
  `Wrote ${levels.length} levels to ${OUT} (${(JSON.stringify(doc).length / 1024).toFixed(1)} KB)`
);
