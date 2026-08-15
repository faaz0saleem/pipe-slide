/**
 * Level generator for Pipe Slide.
 *
 * Emits public/levels/levels.json — 100 deterministically generated levels.
 *
 * Shape of a level: two or three curved glass tubes enter from the top, each
 * holding a different payload behind a stack of pins. They all pour into a
 * curved collector bowl, down a shared neck, and onto removable diverter
 * blades that decide which pit the flow lands in. Pull the wrong pin and the
 * payload goes in the wrong pit and is wasted — every group spawns with a few
 * spare items so a mistake costs you rather than ends the run.
 *
 * The bottom sections (neck + blades + pits) are load-bearing geometry proven
 * by tools/simulate-levels.mjs; the curved tubes above them are free to vary.
 *
 * Run with:  npm run levels
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tube, smoothPath, pathLength, atDistance, atFraction, r1 } from './curves.mjs';

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
 * opening is 4.2 diameters even for the fattest payload. Narrowing this is
 * exactly the wrong instinct.
 */
const NECK_L = 268;
const NECK_R = 452;

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

/** Distinct payload types for one level. Bombs need a roomy bore. */
function distinctTypes(rng, level, n, bore) {
  const pool = ['coal', 'apple'];
  if (level >= 13) pool.push('gem');
  if (level >= 24) pool.push('coin');

  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
  }
  if (level >= 36 && bore >= 180 && n >= 2 && rng() < 0.42) out[out.length - 1] = 'bomb';
  return out;
}

/* ------------------------------------------------------------------ */
/* Chapters / names                                                     */
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
  flow: ['First Drop', 'Twin Spouts', 'The Diverter', 'Slide Away', 'Switchback', 'Two Ways Out', 'Bend and Drop', 'Crossflow', 'Siphon', 'Down the Loop'],
  sort: ['Triple Sort', 'Sorting Tower', 'Three Ramps', 'Cascade Control', 'Order of Operations', 'Master Sorter', 'The Manifold', 'Trident', 'Three Spouts'],
  vault: ['Coin Rush', 'Golden Hour', 'Vault Breaker', 'Jackpot', 'Treasure Cascade', 'Midas Drop', 'Bullion Run', 'Piggy Bank', 'Mint Condition', 'The Big Payout'],
};

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

function wall(points, t = WALL_T) {
  return { points: points.map(([x, y]) => [r1(x), r1(y)]), t };
}
const vwall = (x, y0, y1, t = WALL_T) => wall([[x, y0], [x, y1]], t);
const curveWall = (ctrl, t = WALL_T) => wall(smoothPath(ctrl), t);

function gatePin(id, x, y, len, opts = {}) {
  return {
    id,
    kind: 'gate',
    x: r1(x),
    y: r1(y),
    len: r1(len),
    thick: opts.thick || 18,
    angle: r1(opts.angle || 0),
    out: opts.out || [1, 0],
    requires: [],
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
    requires: [],
  };
}

/** A gate sitting square across a curved tube at `dist` along its centre-line. */
function gateAcross(id, path, dist, bore) {
  const { point, normal } = atDistance(path, dist);
  const angle = (Math.atan2(normal[1], normal[0]) * 180) / Math.PI;
  // Slide the rod out towards whichever screen edge is nearer.
  const sign = point[0] < W / 2 ? (normal[0] < 0 ? 1 : -1) : normal[0] > 0 ? 1 : -1;
  return gatePin(id, point[0], point[1], bore + 34, {
    angle,
    out: [r1(normal[0] * sign), r1(normal[1] * sign)],
  });
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

/** Shortest distance from a point to a line segment. */
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/** The two endpoints of a pin's rod. */
function pinSegment(pin) {
  const a = (pin.angle * Math.PI) / 180;
  const hx = (Math.cos(a) * pin.len) / 2;
  const hy = (Math.sin(a) * pin.len) / 2;
  return [pin.x - hx, pin.y - hy, pin.x + hx, pin.y + hy];
}

/**
 * Stack a payload group up the inside of a tube, resting on `gate`.
 *
 * Arc length alone is not enough clearance on a curve: the gate is square to
 * the centre-line, so an item pushed out towards the inside of a bend sits
 * closer to the rod than its arc distance suggests. Each row is therefore
 * nudged further up until it genuinely clears both the gate below and the
 * next gate above.
 */
function fillTube(rng, path, gate, gateDist, gateAbove, count, type, bore) {
  const r = PAYLOADS[type].radius;
  const rowStep = r * 2 + 9;
  const spacing = r * 2 + 8;
  const usable = bore - r * 2 - 28;
  const perRow = Math.max(1, Math.min(3, Math.floor(usable / spacing) + 1));

  const seg = pinSegment(gate);
  const clear = r + gate.thick / 2 + 4;
  const segAbove = gateAbove ? pinSegment(gateAbove) : null;
  const clearAbove = gateAbove ? r + gateAbove.thick / 2 + 4 : 0;
  const rowAt = (d, n) => {
    const { point, normal } = atDistance(path, d);
    const span = (n - 1) * spacing;
    return Array.from({ length: n }, (_, i) => {
      const off = -span / 2 + i * spacing;
      return [point[0] + normal[0] * off, point[1] + normal[1] * off];
    });
  };

  const items = [];
  let placed = 0;
  let d = gateDist - (r + 16);

  while (placed < count) {
    const n = Math.min(perRow, count - placed);
    let row = rowAt(d, n);
    // Push the row up until nothing in it is touching the gate rod.
    for (let guard = 0; guard < 24; guard++) {
      const worst = Math.min(...row.map((p) => distToSeg(p[0], p[1], ...seg)));
      if (worst >= clear) break;
      d -= 3;
      row = rowAt(d, n);
    }
    // Same story at the top of the stack: measure against the rod above, not
    // its arc distance, or a row leans into it on a bend.
    if (d < r + 12) break;
    if (segAbove && row.some((p) => distToSeg(p[0], p[1], ...segAbove) < clearAbove)) break;
    for (const p of row) {
      items.push([r1(p[0] + (rng() - 0.5) * 2), r1(p[1] + (rng() - 0.5) * 2)]);
      placed++;
    }
    d -= rowStep;
  }
  return { type, r, items };
}

/* ------------------------------------------------------------------ */
/* Bottom sections — proven geometry, do not nudge without simulating  */
/* ------------------------------------------------------------------ */

/**
 * One blade, two pits. With the blade in place the flow slides left; pull it
 * and the flow drops straight into the centre pit.
 */
function bottomOneBlade(types, walls, pins, receivers) {
  const [leftType, centreType] = types;

  // The left neck wall stops early so payloads leaving on the blade can duck
  // under it; the right one runs lower to swallow the blade's high end.
  walls.push(vwall(NECK_L, 830, 890));
  walls.push(vwall(NECK_R, 830, 910));

  pins.push(rampPin('blade1', 452, 916, 190, 1030));

  // The pits share a wall exactly. Any ledge between them is a perch, and a
  // payload parked on a perch gets knocked into the wrong pit by the next
  // group — which is how stage stragglers used to become wrong deliveries.
  receivers.push(receiver(leftType, 118, 1042, 196, { charSide: -1 }));
  receivers.push(receiver(centreType, 357, 1046, 250, { charSide: 1 }));

  return { bowlTop: 585, neckTop: 830, order: [leftType, centreType], blades: ['blade1'] };
}

/** Two stacked blades, three pits: right, then left, then centre. */
function bottomTwoBlades(types, walls, pins, receivers) {
  const [rightType, leftType, centreType] = types;


  walls.push(vwall(NECK_L, 740, 784));
  walls.push(vwall(NECK_R, 740, 790));

  pins.push(rampPin('blade1', 265, 810, 560, 940));
  pins.push(rampPin('blade2', 452, 905, 150, 1010));

  receivers.push(receiver(leftType, 112, 1030, 184, { charSide: -1 }));
  receivers.push(receiver(centreType, 356, 1035, 234, { charSide: 1 }));
  receivers.push(receiver(rightType, 600, 980, 190, { charSide: 1 }));

  return {
    bowlTop: 495,
    neckTop: 740,
    order: [rightType, leftType, centreType],
    blades: ['blade1', 'blade2'],
  };
}

/** The curved collector every tube empties into. */
function bowl(topY, neckTop) {
  const drop = neckTop - topY;
  return [
    curveWall([
      [70, topY],
      [96, topY + drop * 0.35],
      [160, topY + drop * 0.73],
      [NECK_L, neckTop],
    ]),
    curveWall([
      [650, topY],
      [624, topY + drop * 0.35],
      [560, topY + drop * 0.73],
      [NECK_R, neckTop],
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* Inlet tubes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Control points for the curved inlets. Exit points are fixed (they have to
 * clear each other and land inside the bowl); the middle points get a little
 * per-level jitter so no two levels trace the same curve.
 */
function inletControls(count, exitY, rng) {
  const j = () => (rng() - 0.5) * 16;

  if (count === 2) {
    return [
      [[150, CHUTE_TOP + 10], [146 + j(), 360], [180 + j(), 470], [235, exitY]],
      [[570, CHUTE_TOP + 10], [574 + j(), 360], [540 + j(), 470], [485, exitY]],
    ];
  }
  return [
    [[112, CHUTE_TOP + 10], [110 + j(), 330], [136 + j(), 440], [178, exitY]],
    // Gentle S only. tube() will relax anything tighter than the bore can
    // take, but authoring it close to legal keeps the curve as drawn.
    [[360, CHUTE_TOP + 10], [374 + j(), 345], [346 + j(), 455], [360, exitY]],
    [[608, CHUTE_TOP + 10], [610 + j(), 330], [586 + j(), 440], [542, exitY]],
  ];
}

/** Where the gates sit along a tube, top of the list nearest the outlet. */
function gateFractions(n) {
  if (n <= 1) return [0.9];
  if (n === 2) return [0.9, 0.55];
  return [0.92, 0.65, 0.38];
}

/**
 * A curve whose radius approaches the bore squeezes the inner wall across the
 * tube and seals it. Cheap guard: walk the two wall polylines and confirm the
 * bore never closes below three quarters of its nominal width.
 */
function assertBore(level, index, built, bore) {
  const [a, b] = built.walls;
  let worst = Infinity;
  for (let i = 0; i < a.points.length; i++) {
    const p = a.points[i];
    for (let k = Math.max(0, i - 4); k < Math.min(b.points.length, i + 5); k++) {
      const q = b.points[k];
      worst = Math.min(worst, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
  }
  if (worst < bore * 0.75) {
    throw new Error(
      `L${level} inlet ${index}: bend pinches the bore to ${worst.toFixed(0)}px of ${bore} — ` +
        'soften the control points in inletControls()'
    );
  }
}

/* ------------------------------------------------------------------ */
/* Level assembly                                                       */
/* ------------------------------------------------------------------ */

/** Spare items per group, so a wrong pull wastes rather than dead-ends. */
function slackFor(level) {
  if (level <= 5) return 0;
  if (level <= 30) return 1;
  if (level <= 70) return 2;
  return 3;
}

function groupSize(rng, level) {
  if (level <= 12) return irange(rng, 2, 3);
  if (level <= 45) return irange(rng, 3, 4);
  return irange(rng, 4, 5);
}

function gatesPerInlet(rng, level) {
  if (level <= 8) return 1;
  if (level <= 40) return 2;
  return rng() < 0.5 ? 2 : 3;
}

function buildPipeLevel(rng, level, threeWay) {
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  const inletCount = threeWay ? 3 : 2;
  const bore = threeWay ? 165 : 190;
  const types = distinctTypes(rng, level, inletCount, bore);

  const bottom = threeWay
    ? bottomTwoBlades(types, walls, pins, receivers)
    : bottomOneBlade(types, walls, pins, receivers);

  walls.push(...bowl(bottom.bowlTop, bottom.neckTop));

  const exitY = bottom.bowlTop - 12;
  const controls = inletControls(inletCount, exitY, rng);
  const gateCount = gatesPerInlet(rng, level);
  const fractions = gateFractions(gateCount);

  // Each inlet: a curved tube, its gates, and a payload group behind each gate.
  const gatesByType = {};
  for (let i = 0; i < inletCount; i++) {
    const t = types[i];
    const built = tube(controls[i], bore, WALL_T, 14);
    assertBore(level, i, built, bore);
    walls.push(...built.walls.map((w) => wall(w.points, w.t)));

    const len = pathLength(built.path);
    const gates = fractions.map((f, gi) => gateAcross(`g${i}_${gi}`, built.path, len * f, bore));
    pins.push(...gates);

    gates.forEach((gate, gi) => {
      spawns.push(
        fillTube(rng, built.path, gate, len * fractions[gi], gates[gi + 1] || null,
          groupSize(rng, level), t, bore)
      );
    });
    gatesByType[t] = gates.map((g) => g.id);
  }

  // Release one inlet per blade stage, pulling its gates bottom-up.
  const solution = [];
  bottom.order.forEach((t, stage) => {
    solution.push(...gatesByType[t]);
    if (bottom.blades[stage]) solution.push(bottom.blades[stage]);
  });

  return { family: threeWay ? 'sort' : 'flow', walls, pins, receivers, spawns, solution };
}

/** Bonus level: a hopper of coins tumbling through pegs into the vault. */
function buildVault(rng, level) {
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];
  const pegs = [];

  // Curved hopper shoulders funnelling into a straight neck.
  walls.push(curveWall([[64, CHUTE_TOP], [64, 430], [140, 590], [300, 690]]));
  walls.push(curveWall([[656, CHUTE_TOP], [656, 430], [580, 590], [420, 690]]));
  walls.push(vwall(300, 690, 760));
  walls.push(vwall(420, 690, 760));

  // Peg corridor, opening into a wide vault mouth so coins never bridge.
  walls.push(vwall(96, 760, 1000));
  walls.push(vwall(624, 760, 1000));
  walls.push(curveWall([[96, 1000], [130, 1046], [214, 1070]]));
  walls.push(curveWall([[624, 1000], [590, 1046], [506, 1070]]));

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
    items.push([r1(360 - rowW / 2 + col * step + (rng() - 0.5) * 2), r1(410 - row * step)]);
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

function buildLevel(level) {
  const rng = mulberry32(level * 7919 + 13);

  let core;
  if (level % 10 === 0) core = buildVault(rng, level);
  else if (level <= 6) core = buildPipeLevel(rng, level, false);
  else core = buildPipeLevel(rng, level, level >= 12 && rng() < 0.55);

  // Pits ask for everything that spawns, minus the spare items.
  const totals = {};
  for (const s of core.spawns) totals[s.type] = (totals[s.type] || 0) + s.items.length;

  const isBonus = core.family === 'vault';
  for (const r of core.receivers) {
    const available = totals[r.accepts] || 0;
    // Spare items are capped at a third of the group: enough to absorb a
    // mistake, never enough to make the pit trivial.
    const slack = isBonus ? 0 : Math.min(slackFor(level), Math.floor(available / 3));
    r.required = isBonus
      ? Math.max(1, Math.round(available * r.quota))
      : Math.max(2, available - slack);
    r.spare = available - r.required;
  }

  const chapter = CHAPTERS[Math.floor((level - 1) / 10)];
  const names = NAME_PARTS[core.family];
  const name = isBonus
    ? names[(level / 10 - 1) % names.length]
    : names[(level * 3) % names.length];

  const payloadCount = Object.values(totals).reduce((a, b) => a + b, 0);

  return {
    id: level,
    name,
    chapter: chapter.name,
    theme: chapter.theme,
    bonus: isBonus,
    noFail: isBonus,
    par: core.solution.length,
    parTime: isBonus ? 26 : 12 + core.solution.length * 5 + payloadCount,
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
  version: 2,
  world: { width: W, height: H, groundY: GROUND_Y, chuteTop: CHUTE_TOP },
  chapters: CHAPTERS,
  payloads: PAYLOADS,
  levels,
};
writeFileSync(OUT, JSON.stringify(doc));

const pins = levels.reduce((n, l) => n + l.pins.length, 0);
console.log(
  `Wrote ${levels.length} levels to ${OUT} (${(JSON.stringify(doc).length / 1024).toFixed(1)} KB)\n` +
    `pins: ${levels[0].pins.length} at L1 → ${levels[98].pins.length} at L99, ${pins} total`
);
