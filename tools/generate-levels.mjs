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
import { vessel, smoothPath, pathLength, atDistance, r1 } from './curves.mjs';

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

/** Tubes start behind the HUD fade so their open mouths never show. */
const TUBE_TOP = 168;

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
  manifold: ['The Manifold', 'Four Spouts', 'Quad Sort', 'Crossroads', 'Grand Junction', 'Full House', 'Four Ways Down', 'The Refinery'],
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
const curveWall = (ctrl, t = WALL_T) => wall(smoothPath(ctrl, 8), t);

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

/**
 * A gate sitting square across a curved tube at `dist` along its centre-line.
 *
 * The rod's ring handle is what the player grabs, so it has to stay on screen:
 * on the outermost pipes the natural "point at the nearer edge" choice hangs
 * the ring off the side of the board where it cannot be seen or clicked.
 */
function gateAcross(id, path, dist, bore) {
  const { point, normal } = atDistance(path, dist);
  const angle = (Math.atan2(normal[1], normal[0]) * 180) / Math.PI;
  const len = bore + 34;

  // Where the ring ends up for each choice of pull direction.
  const reach = len / 2 + 26;
  const ringX = (sign) => point[0] + normal[0] * sign * reach;
  const onScreen = (x) => x > 22 && x < W - 22;

  let sign = point[0] < W / 2 ? (normal[0] < 0 ? 1 : -1) : normal[0] > 0 ? 1 : -1;
  if (!onScreen(ringX(sign)) && onScreen(ringX(-sign))) sign = -sign;

  return gatePin(id, point[0], point[1], len, {
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
function fillTube(rng, path, gate, gateDist, gateAbove, count, type, boreAt) {
  const r = PAYLOADS[type].radius;
  const rowStep = r * 2 + 9;
  const spacing = r * 2 + 8;
  const total = pathLength(path);
  const perRowAt = (d) => {
    const usable = boreAt(d / total) - r * 2 - 28;
    return Math.max(1, Math.min(3, Math.floor(usable / spacing) + 1));
  };

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
    const n = Math.min(perRowAt(d), count - placed);
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
function bottomOneBlade(types, channel, pins, receivers) {
  const [leftType, centreType] = types;

  // The left neck wall stops early so payloads leaving on the blade can duck
  // under it; the right one runs lower to swallow the blade's high end.
  channel(vwall(NECK_L, 830, 890), vwall(NECK_R, 830, 910));

  pins.push(rampPin('blade1', 452, 916, 190, 1030));

  // The pits share a wall exactly. Any ledge between them is a perch, and a
  // payload parked on a perch gets knocked into the wrong pit by the next
  // group — which is how stage stragglers used to become wrong deliveries.
  receivers.push(receiver(leftType, 118, 1042, 196, { charSide: -1 }));
  receivers.push(receiver(centreType, 357, 1046, 250, { charSide: 1 }));

  return { bowlTop: 700, neckTop: 830, order: [leftType, centreType], blades: ['blade1'] };
}

/** Two stacked blades, three pits: right, then left, then centre. */
function bottomTwoBlades(types, channel, pins, receivers) {
  const [rightType, leftType, centreType] = types;

  channel(vwall(NECK_L, 740, 784), vwall(NECK_R, 740, 790));

  pins.push(rampPin('blade1', 265, 810, 560, 940));
  pins.push(rampPin('blade2', 452, 905, 150, 1010));

  // Centre pit spans wall-to-wall between its neighbours: no perch ledges.
  receivers.push(receiver(leftType, 112, 1030, 184, { charSide: -1 }));
  receivers.push(receiver(centreType, 354.5, 1035, 269, { charSide: 1 }));
  receivers.push(receiver(rightType, 600, 980, 190, { charSide: 1 }));

  return {
    bowlTop: 610,
    neckTop: 740,
    order: [rightType, leftType, centreType],
    blades: ['blade1', 'blade2'],
  };
}

/** The curved collector every tube empties into. */
function bowl(topY, neckTop, outer) {
  const drop = neckTop - topY;
  const span = outer - NECK_L;
  return [
    curveWall([
      [outer, topY],
      [outer - span * 0.12, topY + drop * 0.38],
      [outer - span * 0.55, topY + drop * 0.76],
      [NECK_L, neckTop],
    ]),
    curveWall([
      [W - outer, topY],
      [W - outer + span * 0.12, topY + drop * 0.38],
      [W - outer + span * 0.55, topY + drop * 0.76],
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
      [[150, TUBE_TOP], [146 + j(), 380], [186 + j(), 540], [235, exitY]],
      [[570, TUBE_TOP], [574 + j(), 380], [534 + j(), 540], [485, exitY]],
    ];
  }
  if (count === 3) {
    return [
      [[112, TUBE_TOP], [110 + j(), 350], [136 + j(), 500], [178, exitY]],
      // Gentle S only. vessel() will relax anything tighter than the bore can
      // take, but authoring it close to legal keeps the curve as drawn.
      [[360, TUBE_TOP], [376 + j(), 360], [344 + j(), 505], [360, exitY]],
      [[608, TUBE_TOP], [610 + j(), 350], [584 + j(), 500], [542, exitY]],
    ];
  }
  // Four is the ceiling: any more and the reservoirs cannot stay wide enough
  // to keep payloads from arching across them.
  return [
    [[92, TUBE_TOP], [92 + j(), 350], [116 + j(), 500], [150, exitY]],
    [[266, TUBE_TOP], [274 + j(), 360], [258 + j(), 505], [290, exitY]],
    [[454, TUBE_TOP], [446 + j(), 360], [462 + j(), 505], [430, exitY]],
    [[628, TUBE_TOP], [628 + j(), 350], [604 + j(), 500], [570, exitY]],
  ];
}

/** Where the gates sit along a tube, top of the list nearest the outlet. */
/**
 * Where the gates sit along a tube, nearest the outlet first.
 *
 * Kept high on purpose: a group stacks *up* from its gate, so a low gate
 * leaves the reservoir empty and the vessel reads as a plain funnel. High
 * gates fill the bulb and leave a clean run of channel below it.
 */
function gateFractions(n) {
  if (n <= 1) return [0.46];
  if (n === 2) return [0.6, 0.34];
  return [0.72, 0.5, 0.28];
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
  return 4;
}

function groupSize(rng, level) {
  if (level <= 12) return irange(rng, 2, 3);
  if (level <= 45) return irange(rng, 3, 4);
  return irange(rng, 4, 5);
}

/**
 * The difficulty ladder. Pipes and gates both climb with the level, so the
 * pin count rises monotonically from 3 to 11 across the run.
 */
function difficultyFor(level, rng) {
  if (level <= 6) return { pipes: 2, gates: 1 };
  if (level <= 15) return { pipes: 2, gates: 2 };
  if (level <= 26) return { pipes: 3, gates: rng() < 0.4 ? 1 : 2 };
  if (level <= 42) return { pipes: 3, gates: 2 };
  if (level <= 58) return { pipes: 3, gates: rng() < 0.5 ? 2 : 3 };
  if (level <= 74) return { pipes: 4, gates: 2 };
  if (level <= 88) return { pipes: 4, gates: rng() < 0.5 ? 2 : 3 };
  return { pipes: 4, gates: 3 };
}

function buildPipeLevel(rng, level, pipes, gateCount) {
  const walls = [];
  const tubes = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  /** Register a channel: both edges become physics walls and one render pair. */
  const channel = (left, right) => {
    walls.push(left, right);
    tubes.push({ left: left.points, right: right.points, t: left.t });
  };

  const inletCount = pipes;
  // A wide reservoir up top narrowing into a channel — the flask silhouette.
  const bulbHalf = { 2: 108, 3: 95, 4: 78 }[inletCount];
  const spoutHalf = inletCount === 4 ? 56 : 65;

  // Two pits or three. With four pipes one pit is fed by two of them, which
  // is what keeps the routing on the proven bottom geometry.
  const pitCount = inletCount === 2 ? 2 : 3;
  const pitTypes = distinctTypes(rng, level, pitCount, bulbHalf * 2);

  // Which type each pipe carries. When a type is doubled up, its two pipes sit
  // side by side so they drain at the same rate — split them across the board
  // and the far one lags behind the blade flip and misroutes.
  const carried = [];
  const doubled = inletCount > pitCount ? Math.floor(rng() * pitCount) % pitCount : -1;
  pitTypes.forEach((t, i) => {
    carried.push(t);
    if (i === doubled) carried.push(t);
  });

  const bottom =
    pitCount === 2
      ? bottomOneBlade(pitTypes, channel, pins, receivers)
      : bottomTwoBlades(pitTypes, channel, pins, receivers);

  const [bowlL, bowlR] = bowl(
    bottom.bowlTop,
    bottom.neckTop,
    { 2: 150, 3: 100, 4: 80 }[inletCount]
  );
  channel(bowlL, bowlR);

  const exitY = bottom.bowlTop - 12;
  const controls = inletControls(inletCount, exitY, rng);
  const fractions = gateFractions(gateCount);

  // Each inlet: a curved tube, its gates, and a payload group behind each gate.
  const gatesByType = {};
  for (let i = 0; i < inletCount; i++) {
    const t = carried[i];
    const built = vessel(controls[i], bulbHalf, spoutHalf, 0.42, WALL_T, 9);
    assertBore(level, i, built, spoutHalf * 2);
    channel(wall(built.walls[0].points, WALL_T), wall(built.walls[1].points, WALL_T));

    const len = pathLength(built.path);
    const boreAt = (f) => built.halfAt(f) * 2;
    const gates = fractions.map((f, gi) =>
      gateAcross(`g${i}_${gi}`, built.path, len * f, boreAt(f))
    );
    pins.push(...gates);

    gates.forEach((gate, gi) => {
      spawns.push(
        fillTube(rng, built.path, gate, len * fractions[gi], gates[gi + 1] || null,
          groupSize(rng, level), t, boreAt)
      );
    });
    // Two pipes can feed the same pit, so append rather than replace.
    gatesByType[t] = (gatesByType[t] || []).concat(gates.map((g) => g.id));
  }

  // Release one inlet per blade stage, pulling its gates bottom-up.
  const solution = [];
  bottom.order.forEach((t, stage) => {
    solution.push(...gatesByType[t]);
    if (bottom.blades[stage]) solution.push(bottom.blades[stage]);
  });

  const family = inletCount === 2 ? 'flow' : inletCount === 3 ? 'sort' : 'manifold';
  return { family, walls, tubes, pins, receivers, spawns, solution };
}

/** Bonus level: a hopper of coins tumbling through pegs into the vault. */
function buildVault(rng, level) {
  const walls = [];
  const pins = [];
  const receivers = [];
  const spawns = [];
  const pegs = [];

  const tubes = [];
  const channel = (left, right) => {
    walls.push(left, right);
    tubes.push({ left: left.points, right: right.points, t: left.t });
  };

  // Curved hopper shoulders funnelling into a straight neck.
  channel(
    curveWall([[64, CHUTE_TOP], [64, 430], [140, 590], [300, 690]]),
    curveWall([[656, CHUTE_TOP], [656, 430], [580, 590], [420, 690]])
  );
  channel(vwall(300, 690, 760), vwall(420, 690, 760));

  // Peg corridor, opening into a wide vault mouth so coins never bridge.
  channel(vwall(96, 760, 1000), vwall(624, 760, 1000));
  channel(
    curveWall([[96, 1000], [130, 1046], [214, 1070]]),
    curveWall([[624, 1000], [590, 1046], [506, 1070]])
  );

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

  return { family: 'vault', walls, tubes, pins, receivers, spawns, pegs, solution };
}

function buildLevel(level) {
  const rng = mulberry32(level * 7919 + 13);

  let core;
  if (level % 10 === 0) {
    core = buildVault(rng, level);
  } else {
    const { pipes, gates } = difficultyFor(level, rng);
    core = buildPipeLevel(rng, level, pipes, gates);
  }

  // Pits ask for everything that spawns, minus the spare items.
  const totals = {};
  for (const s of core.spawns) totals[s.type] = (totals[s.type] || 0) + s.items.length;

  const isBonus = core.family === 'vault';
  for (const r of core.receivers) {
    const available = totals[r.accepts] || 0;
    // Spare items are capped as a fraction of the group: enough to absorb a
    // mistake, never enough to make the pit trivial. Four-pipe levels move a
    // lot more material through one bowl, so stragglers are likelier and the
    // allowance is a little wider.
    const cap = core.family === 'manifold' ? available / 2 : available / 3;
    const slack = isBonus ? 0 : Math.min(slackFor(level), Math.floor(cap));
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
    tubes: core.tubes || [],
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
