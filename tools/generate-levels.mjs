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
import { vesselProfiled, PROFILES, smoothPath, pathLength, atDistance, r1 } from './curves.mjs';
import { simulateLevel } from './solver.mjs';

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

/**
 * Distinct payload types for one level. Bombs need a roomy bore.
 *
 * The catalogue opens early on purpose. With only coal and apples there are
 * two pits, two ways for a blade to throw and therefore just four possible
 * machines, so the opening levels *had* to repeat each other — which is what
 * made 2 and 4 the same board, and 3 and 5 with them. A third item by level 6
 * triples that space, and it is not too much to ask of a player who has
 * already sorted two.
 */
function distinctTypes(rng, level, n, bore) {
  const pool = ['coal', 'apple'];
  if (level >= 6) pool.push('gem');
  if (level >= 16) pool.push('coin');

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
    const usable = boreAt(d / total) - r * 2 - 44;
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
  let d = gateDist - (r + 26);

  while (placed < count) {
    const n = Math.min(perRowAt(d), count - placed);
    let row = rowAt(d, n);
    // Push the row up until nothing in it is touching the gate rod.
    for (let guard = 0; guard < 44; guard++) {
      const worst = Math.min(...row.map((p) => distToSeg(p[0], p[1], ...seg)));
      if (worst >= clear) break;
      d -= 4;
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
 * Slide a built bottom section sideways.
 *
 * Everything below the bowl — neck, blades, pits — is one rigid assembly, so
 * translating it is physics-neutral but changes the macro composition of the
 * board completely: the flow funnels hard left on one level and hard right on
 * the next, instead of every level draining down the middle.
 */
function shiftBottom(dx, walls, pins, receivers, fromWall, fromPin, fromRecv) {
  if (!dx) return;
  // Mutate the point arrays in place: the render-time tube pairs hold the very
  // same arrays, so replacing them would leave the drawn glass behind.
  for (let i = fromWall; i < walls.length; i++) {
    for (const pt of walls[i].points) pt[0] = r1(pt[0] + dx);
  }
  for (let i = fromPin; i < pins.length; i++) pins[i].x = r1(pins[i].x + dx);
  for (let i = fromRecv; i < receivers.length; i++) receivers[i].x = r1(receivers[i].x + dx);
}

/**
 * The routing machine: a collector neck, a stack of diverter blades, and the
 * pits they feed.
 *
 * Each blade is a ramp hanging off one edge of the neck and throwing the flow
 * across to a pit on the far side. Pulling it drops the flow onto the next
 * blade down, so the pits are served in blade order and the last one is always
 * the straight drop through the middle.
 *
 * Every dimension here used to be a literal, in two hand-tuned variants. That
 * made the part of the board the player actually operates identical on all
 * ninety levels, whatever the glass above it was doing — the deepest of the
 * "every level is the same" complaints, and the last one left. It is now laid
 * out from the ground upward from jittered parameters, so the neck bore, how
 * deep it hangs, which way the first blade throws, how steep each ramp is, how
 * far apart they stack, and how wide and deep each pit sits all change level
 * to level. The rules the old literals were encoding are kept as constraints
 * rather than as constants, and the solver rejects any board that does not
 * play, so this can vary without going quietly wrong.
 */
function bottomCascade(rng, types, channel, pins, receivers) {
  const blades = types.length - 1;
  const jit = (base, range) => base + Math.round((rng() - 0.5) * range);
  const cx = W / 2;

  // Hoppers arch below roughly four payload diameters, and NECK_L..NECK_R is
  // the width proven to clear the fattest payload. Jitter upward from it only.
  const neckHalf = (NECK_R - NECK_L) / 2 + Math.round(rng() * 16);
  const neckL = cx - neckHalf;
  const neckR = cx + neckHalf;

  // Which way the first blade throws, alternating down the stack. A machine
  // that sends the flow right, then left, then straight down is a different
  // machine to operate from one that goes left, then right.
  let dir = rng() < 0.5 ? -1 : 1;

  // Laid out from the ground up: the straight-drop pit sets the bottom, the
  // blades stack above it, and the neck hangs above the topmost blade.
  const dropTop = jit(1040, 18);
  const step = jit(95, 18);
  const rise = jit(124, 26);
  const topBladeY = dropTop - rise + 10 - (blades - 1) * step;

  const ramps = [];
  for (let k = 0; k < blades; k++) {
    const y0 = topBladeY + k * step;
    // The high end tucks just past the neck edge on the far side from the
    // throw, so flow lands on the ramp rather than beside it.
    const x0 = dir > 0 ? neckL - jit(4, 8) : neckR + jit(4, 8);
    const x1 = dir > 0 ? jit(566, 30) : jit(154, 30);
    ramps.push({ id: `blade${k + 1}`, x0, y0, x1, y1: y0 + rise, dir });
    dir = -dir;
  }

  // Neck walls stop above the topmost blade's high end. The wall on the side
  // the flow leaves towards is the shorter of the two, so a payload riding the
  // ramp ducks under it instead of catching on it.
  const neckTop = ramps[0].y0 - jit(64, 16);
  const shortSide = ramps[0].dir;
  channel(
    vwall(neckL, neckTop, ramps[0].y0 - (shortSide < 0 ? jit(30, 10) : jit(8, 6))),
    vwall(neckR, neckTop, ramps[0].y0 - (shortSide > 0 ? jit(30, 10) : jit(8, 6)))
  );

  for (const r of ramps) pins.push(rampPin(r.id, r.x0, r.y0, r.x1, r.y1));

  // A pit sits under the end of its ramp, pulled a little further out so the
  // payload rolls in rather than stalling on the near lip.
  ramps.forEach((r, k) => {
    const w = jit(198, 44);
    const x =
      r.dir > 0
        ? Math.min(W - 14 - w / 2, r.x1 + jit(32, 22))
        : Math.max(14 + w / 2, r.x1 - jit(32, 22));
    receivers.push(receiver(types[k], x, jit(1016, 48), w, { charSide: x < cx ? -1 : 1 }));
  });
  receivers.push(
    receiver(types[blades], cx, jit(1042, 14), jit(254, 42), { charSide: rng() < 0.5 ? -1 : 1 })
  );

  return {
    bowlTop: neckTop - jit(132, 28),
    neckTop,
    neckL,
    neckR,
    order: types.slice(),
    blades: ramps.map((r) => r.id),
  };
}

/** The curved collector every tube empties into. */
function bowl(topY, neckTop, outer, shift, neckL, neckR) {
  const drop = neckTop - topY;
  const left = neckL + shift;
  const right = neckR + shift;
  // Asymmetric on a shifted drain, which is exactly the point: the flow leans.
  return [
    curveWall([
      [outer, topY],
      [outer + (left - outer) * 0.16, topY + drop * 0.38],
      [outer + (left - outer) * 0.62, topY + drop * 0.76],
      [left, neckTop],
    ]),
    curveWall([
      [W - outer, topY],
      [W - outer + (right - (W - outer)) * 0.16, topY + drop * 0.38],
      [W - outer + (right - (W - outer)) * 0.62, topY + drop * 0.76],
      [right, neckTop],
    ]),
  ];
}

/* ------------------------------------------------------------------ */
/* Inlet tubes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Control points for the curved inlets.
 *
 * The mouths and the outlets are fixed: the mouths span the board so the
 * reservoirs sit side by side, and the outlets have to clear each other and
 * land inside the bowl. Everything between them is free, and the trick to
 * spending that freedom is to move the pipes *in phase*.
 *
 * A pipe bowing on its own is limited by the gap to its neighbour, which on a
 * four-pipe board is barely a dozen pixels — hence the near-straight chutes
 * this replaces. A bundle that all swings the same way at the same depth keeps
 * its spacing no matter how far it travels, so the shared wave can be as wide
 * as the board edges and the bore allow. On top of it each pipe gets its own
 * smaller wave, of its own frequency and phase, using whatever clearance the
 * shared one has not spent — so the channels read as individual glassware
 * rather than a comb.
 *
 * Both waves vanish at t=0 and t=1, which is what keeps the endpoints exact.
 */

/**
 * Widest swing a wave can carry before the bend guard starts straightening it.
 *
 * Measured, not guessed: sweep amplitude against the bore and see where the
 * built path stops keeping most of the bow it was asked for. Two things drive
 * it. More half-periods in the same drop means a tighter radius, so a
 * serpentine has to travel far less than one long bow. And skew compresses the
 * bend into part of the descent, which tightens it again — so pushing the
 * curve down into the roomy half is not free, and asking for both a hard skew
 * and a big amplitude gets you a straight pipe.
 */
const WAVE_CEILING = {
  1: (skew) => 240 - 100 * (skew - 1),
  2: (skew) => 80 - 60 * (skew - 1),
  3: () => 34,
};

/** How far the belly of the curve may be pushed down the tube, per shape. */
const WAVE_SKEW = { 1: [1.0, 2.2], 2: [1.0, 1.7], 3: [1.0, 1.0] };

const smoothstep = (u) => u * u * (3 - 2 * u);

function inletControls(count, exitY, rng, halves) {
  // Where each pipe starts across the top and where it has to arrive.
  // Four reservoirs already sit twenty pixels apart, so they get almost no
  // room to shuffle; two have the whole board.
  const spread = count === 4 ? 8 : 26;
  const tops = {
    2: [150, 570],
    3: [112, 360, 608],
    4: [92, 266, 454, 628],
  }[count].map((x, i) => {
    // Nudge the mouths apart unevenly so the reservoirs are not a regular comb.
    const h = halves[i](0);
    return Math.max(h + 8, Math.min(W - h - 8, x + Math.round((rng() - 0.5) * spread * 2)));
  });
  const exits = {
    2: [235, 485],
    3: [178, 360, 542],
    4: [150, 290, 430, 570],
  }[count].map((x) => x + Math.round((rng() - 0.5) * (count === 4 ? 16 : 40)));

  // Mouth heights stagger a long way now: a reservoir that starts 100px below
  // its neighbour frees the lateral room its neighbour is using.
  const mouthY = tops.map(() => TUBE_TOP + Math.round(rng() * 96));

  /*
   * And the outlets stagger too, which is what stops a board being a comb.
   *
   * Every channel used to run the full drop and stop at the same height, so
   * whatever the glass did in between, the silhouette was always N tubes of
   * one length in a row. A lifted outlet ends the vessel early and drops its
   * payload the rest of the way into the bowl mouth — short stubby flasks
   * beside long snaking ones, and a cascade where there used to be a row.
   */
  const exitYs = tops.map(() => exitY - Math.round(rng() * rng() * 190));

  /*
   * Wave shape.
   *
   * `k` half-periods over the descent: one is a long C-bow, two an S, three a
   * serpentine. `skew` decides *where* the bow happens. That matters more than
   * the amplitude does, because the room is not spread evenly down the board:
   * up top the reservoirs already span it edge to edge, and only once the
   * spouts have narrowed is there anywhere to go. A plain sine peaks halfway
   * down, at the worst possible depth; skewing it past 1 pushes the belly of
   * the curve into the lower half where the space is, which is also where the
   * reference boards do their hooking.
   */
  const rollWave = (gain) => {
    // Long bows twice as often as S-curves, serpentines rarest: they are the
    // ones that have to stay small, and a board of timid squiggles reads as
    // less curved than a board of two confident hooks.
    const k = [1, 1, 1, 2, 2, 3][Math.floor(rng() * 6) % 6];
    const [lo, hi] = WAVE_SKEW[k];
    const skew = lo + rng() * (hi - lo);
    const flip = rng() < 0.5 ? -1 : 1;
    return {
      at: (t) => flip * Math.sin(Math.PI * k * Math.pow(t, skew)),
      amp: WAVE_CEILING[k](skew),
      gain,
    };
  };

  const shared = rollWave(0.72 + rng() * 0.28);
  const solo = tops.map(() => rollWave(0.5 + rng() * 0.5));

  // Straight-line lane of pipe i at depth t, before any wave is applied. Eased
  // so a pipe leaves its mouth vertically and arrives at the bowl vertically.
  const lane = (i, t) => tops[i] + (exits[i] - tops[i]) * smoothstep(t);
  const yAt = (i, t) => mouthY[i] + (exitYs[i] - mouthY[i]) * t;
  // Neighbours are compared at a shared *depth*, not a shared path fraction:
  // with the mouths and the outlets both staggered the two are no longer the
  // same thing, and a pipe's fat reservoir can sit beside its neighbour's
  // spout — or beside nothing at all, where the neighbour has already ended.
  const tAtY = (i, y) =>
    Math.max(0, Math.min(1, (y - mouthY[i]) / ((exitYs[i] - mouthY[i]) || 1)));
  const half = (i, t) => halves[i](t);

  // Sample the wave finely enough that the spline follows it. At eight steps
  // the control points sit 60px apart and Catmull-Rom overshoots between them,
  // manufacturing bends the wave never asked for.
  const STEPS = 12;
  const pts = tops.map((topX, i) => [[topX, mouthY[i]]]);

  /*
   * How much of a wave actually fits.
   *
   * Trimming depth by depth is the obvious approach and the wrong one: the
   * curve then hugs the sine where there is room and goes flat where there is
   * not, leaving a corner at every changeover. Those corners have a tiny
   * radius, the bend guard sees them and eases the whole curve off towards a
   * straight chord, and the result is the near-straight chute this set out to
   * replace. So ask for the full wave, find the single tightest point, and
   * scale the whole thing by that one factor — a smaller sine is still a sine.
   */
  const fit = (at, amp, budgetAt) => {
    let scale = 1;
    for (let s = 1; s < STEPS; s++) {
      const t = s / STEPS;
      const need = Math.abs(at(t)) * amp;
      if (need < 1) continue;
      scale = Math.min(scale, Math.max(0, budgetAt(t, at(t) < 0)) / need);
    }
    return scale;
  };

  // Room the bundle has to move as one before its outermost wall leaves the
  // board. Measured at each depth, so a bundle whose spouts have narrowed gets
  // the room its reservoirs could not have.
  const bundleRoom = (t, toLeft) => {
    let room = Infinity;
    for (let i = 0; i < count; i++) {
      room = Math.min(room, (toLeft ? lane(i, t) : W - lane(i, t)) - half(i, t) - 10);
    }
    return room * shared.gain;
  };
  const sharedScale = fit(shared.at, shared.amp, bundleRoom);
  const swingAt = (t) => shared.at(t) * shared.amp * sharedScale;

  // Then each pipe's own bow, in whatever the shared swing has left over.
  const soloScale = solo.map((sv, i) =>
    fit(sv.at, sv.amp, (t, toLeft) => {
      const y = yAt(i, t);
      // Half the leftover gap to the nearer neighbour: if both lean towards
      // each other they still meet with clearance to spare.
      let gap = Infinity;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= count) continue;
        const tj = tAtY(j, y);
        gap = Math.min(gap, Math.abs(lane(j, tj) - lane(i, t)) - half(i, t) - half(j, tj) - 18);
      }
      const x = lane(i, t) + swingAt(t);
      const toEdge = (toLeft ? x : W - x) - half(i, t) - 10;
      return Math.min(gap === Infinity ? 120 : gap / 2, toEdge) * sv.gain;
    })
  );

  for (let s = 1; s < STEPS; s++) {
    const t = s / STEPS;
    for (let i = 0; i < count; i++) {
      const x = lane(i, t) + swingAt(t) + solo[i].at(t) * solo[i].amp * soloScale[i];
      pts[i].push([x, yAt(i, t)]);
    }
  }

  for (let i = 0; i < count; i++) pts[i].push([exits[i], exitYs[i]]);
  return pts;
}

/**
 * Where the gates sit along a tube, nearest the outlet first.
 *
 * Kept high on purpose: a group stacks *up* from its gate, so a low gate
 * leaves the reservoir empty and the vessel reads as a plain funnel. High
 * gates fill the bulb and leave a clean run of channel below it.
 */
function gateFractions(n, rng) {
  const j = () => (rng() - 0.5) * 0.08;
  if (n <= 1) return [0.46 + j()];
  if (n === 2) return [0.6 + j(), 0.34 + j()];
  if (n === 3) return [0.72 + j(), 0.5 + j(), 0.28 + j()];
  return [0.79 + j(), 0.61 + j(), 0.43 + j(), 0.23 + j()];
}

/**
 * A curve whose radius approaches the bore squeezes the inner wall across the
 * tube and seals it. Cheap guard: walk the two wall polylines and confirm the
 * bore never closes below three quarters of its nominal width.
 *
 * A failure is a re-roll, not a crash. The bend guard eases curves off until
 * they fit, but a hard enough shape still occasionally slips past it, and the
 * right answer is to draw another one rather than to ship a sealed pipe.
 */
function boreIsOpen(built, bore) {
  const [a, b] = built.walls;
  let worst = Infinity;
  for (let i = 0; i < a.points.length; i++) {
    const p = a.points[i];
    for (let k = Math.max(0, i - 4); k < Math.min(b.points.length, i + 5); k++) {
      const q = b.points[k];
      worst = Math.min(worst, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
  }
  return worst >= bore * 0.75;
}

/** Horizontal extent of a pipe at depth `y`, or null if it does not reach it. */
function xSpanAt(walls, y) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const pts of walls) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      if (y0 === y1 || y < Math.min(y0, y1) || y > Math.max(y0, y1)) continue;
      const x = x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

/**
 * Two pipes may not pass through each other.
 *
 * A tolerance, not a clearance. On a four-pipe board the reservoirs are packed
 * with only a few pixels of glass between them and occasionally graze, which
 * has always looked fine; what must never happen is one channel swinging
 * straight through another. So this rejects real overlap and ignores contact.
 */
function channelsAreClear(pipes, tol = 14) {
  for (let y = TUBE_TOP; y < 700; y += 18) {
    for (let a = 0; a < pipes.length; a++) {
      const A = xSpanAt(pipes[a], y);
      if (!A) continue;
      for (let b = a + 1; b < pipes.length; b++) {
        const B = xSpanAt(pipes[b], y);
        if (!B) continue;
        if (Math.min(A[1], B[1]) - Math.max(A[0], B[0]) > tol) return false;
      }
    }
  }
  return true;
}

/**
 * Flip a level left-to-right.
 *
 * Free variety, and safe: mirroring swaps which side each blade throws to and
 * which side each pit sits on at the same time, so the recorded solution —
 * which is an order of payload *types*, not of directions — still holds.
 */
function mirrorLevel(lv) {
  const fx = (x) => r1(W - x);
  const flipPts = (pts) => pts.map(([x, y]) => [fx(x), y]);

  for (const w of lv.walls) w.points = flipPts(w.points);
  for (const t of lv.tubes) {
    // Mirroring reverses the handedness, so the two edges swap roles.
    const left = flipPts(t.left);
    t.left = flipPts(t.right);
    t.right = left;
  }
  for (const p of lv.pins) {
    p.x = fx(p.x);
    p.angle = r1(180 - p.angle);
    p.out = [r1(-p.out[0]), p.out[1]];
  }
  for (const r of lv.receivers) {
    r.x = fx(r.x);
    r.charSide = -r.charSide;
  }
  for (const sp of lv.spawns) sp.items = sp.items.map(([x, y]) => [fx(x), y]);
  for (const peg of lv.pegs) peg.x = fx(peg.x);
  lv.mirrored = true;
  return lv;
}

/* ------------------------------------------------------------------ */
/* Level assembly                                                       */
/* ------------------------------------------------------------------ */

/** Spare items per group, so a wrong pull wastes rather than dead-ends. */
function slackFor(level) {
  // Forgiveness runs the *other* way to difficulty, which is the opposite of
  // what this used to do. The opening levels absorb a slip while the player is
  // still working out what a blade does; the late boards, where a mistake is an
  // informed one, hold back two spare items and no more. Measuring it settled
  // the question: a random pull order already fails outright from level 22 on,
  // so the puzzles are tight and the only thing left to tighten is the margin.
  return level <= 20 ? 3 : 2;
}

function groupSize(rng, level, gates) {
  const [lo, hi] = level <= 12 ? [2, 3] : level <= 45 ? [3, 4] : [4, 5];
  // A tube carrying four stacks has to fit them all below its mouth; the more
  // gates it has, the smaller each group must be.
  return Math.max(2, irange(rng, lo, hi) - (gates >= 4 ? 2 : gates >= 3 ? 1 : 0));
}

/**
 * How many pins the board should hold. This is the difficulty ladder, and it
 * is the only thing tied to the level number: three at the start, eighteen by
 * the end, climbing a step at a time with a one-pin wobble so consecutive
 * levels rarely match. The wobble can cost a single pin against the level
 * before, never more, so the run never feels like it went backwards.
 */
function targetPins(level) {
  return Math.min(18, 3 + Math.round(((level - 1) / 98) * 14) + ((level * 7) % 3 === 0 ? 1 : 0));
}

/**
 * Pick a board that holds that many pins.
 *
 * Pipe count used to be pinned to the level too, which is why forty-six
 * levels in a row were four-pipe boards — the single biggest reason one level
 * looks like the last. Difficulty rides on the pin count instead, so the same
 * target can be met by three fat channels or four thin ones and the layout is
 * free to change underneath it. `pins = gates + blades`, so the arithmetic
 * settles which counts are even possible.
 *
 * Three pits need three payload types, so a third pipe has to wait for the
 * catalogue to open — before that a third pit would be handed no type at all.
 */
function difficultyFor(level, rng) {
  const pins = targetPins(level);
  const options = [];
  for (const pipes of [2, 3, 4]) {
    if (pipes > 2 && level < 6) continue;
    const gates = pins - (pipes === 2 ? 1 : 2);
    if (gates >= pipes && gates <= pipes * 4) options.push({ pipes, gates });
  }
  if (!options.length) return { pipes: 4, gates: Math.max(4, Math.min(16, pins - 2)) };
  return options[Math.floor(rng() * options.length) % options.length];
}

/**
 * Which delivery stage each group in a tube belongs to, from the outlet up.
 *
 * This is what stops every level being the same job. A pipe used to carry one
 * payload type, so the pipe *was* the stage, and the answer to all ninety
 * boards was the same routine: drain a pipe, flip a blade, drain the next
 * pipe, flip. Nothing about the glass changed that.
 *
 * Mixing types inside a tube breaks the equivalence. The ordering is forced,
 * not searched: a tube empties bottom-first and the blades only flip one way,
 * so the stages a tube serves must run in order from its outlet upward —
 * whatever sits lowest has to be whatever the machine is ready to catch first.
 * Within that rule a tube may serve any run of stages, so one holds coal over
 * apples while its neighbour holds apples alone, and the player has to read
 * the stack in every tube to work out the schedule.
 *
 * @returns {number[]} stage index per group, lowest group first
 */
function stackStages(rng, gates, stages) {
  const most = Math.min(gates, stages);
  // Biased towards serving more stages, because a tube that serves exactly one
  // is a tube the player can empty and forget — the old behaviour.
  const span = most - (Math.floor(rng() * rng() * most) % most);
  const start = Math.floor(rng() * (stages - span + 1)) % (stages - span + 1);
  const per = new Array(span).fill(1);
  for (let left = gates - span; left > 0; left--) per[Math.floor(rng() * span) % span]++;
  return per.flatMap((n, i) => new Array(n).fill(start + i));
}

/**
 * Stage assignments for every tube, with every pit guaranteed a delivery and
 * at least one tube spanning a blade flip.
 *
 * A pit nobody fills can never meet its quota, so that level would be dead on
 * arrival — cheaper to redraw here than to build the whole board and have the
 * solver reject it. The second rule is what keeps the player reading: if every
 * tube serves exactly one stage then the tube is the stage again, and the
 * answer collapses back to "drain a pipe, flip, drain the next". Boards too
 * small to afford it — one gate per pipe — are exempt, and should be: they are
 * the opening levels, where that routine is the thing being taught.
 */
function stackPlan(rng, perPipe, stages) {
  const canSpan = stages > 1 && perPipe.some((g) => g > 1);
  for (let attempt = 0; attempt < 40; attempt++) {
    const plan = perPipe.map((gates) => stackStages(rng, gates, stages));
    if (new Set(plan.flat()).size !== stages) continue;
    if (canSpan && !plan.some((p) => p[0] !== p[p.length - 1])) continue;
    return plan;
  }
  return null;
}

/**
 * Hand a gate budget out across the pipes, unevenly.
 *
 * Every pipe used to carry the same count, which is why four channels read as
 * four copies of one channel. An uneven split lets one tube be crammed with
 * four stacks while its neighbour holds a single one, so the boards differ
 * from each other *and* internally. Every pipe keeps at least one gate — a
 * pipe with none holds no payload and is just scenery.
 */
function shareGates(rng, pipes, budget, max = 4) {
  const out = new Array(pipes).fill(1);
  let left = Math.max(0, Math.min(budget, pipes * max) - pipes);
  while (left > 0 && out.some((n) => n < max)) {
    const i = Math.floor(rng() * pipes) % pipes;
    if (out[i] >= max) continue;
    out[i]++;
    left--;
  }
  return out;
}

function buildPipeLevel(rng, level, pipes, gateCount) {
  const walls = [];
  const tubes = [];
  const pins = [];
  const receivers = [];
  const spawns = [];

  /**
   * Register a channel: both edges become physics walls and one render pair.
   *
   * `cap` closes the top of the channel with a rim. Inlets want it — a
   * reservoir is a sealed vessel, and now that the mouths stagger up to 96px
   * they no longer all hide behind the HUD fade, so an uncapped one reads as a
   * tube sliced off mid-air. The collector bowl must stay open: everything
   * above it pours in through its mouth.
   */
  const channel = (left, right, cap = false) => {
    walls.push(left, right);
    tubes.push({ left: left.points, right: right.points, t: left.t, cap });
  };

  const inletCount = pipes;
  // A wide reservoir up top narrowing into a channel — the flask silhouette.
  const wobble = (base, range) => base + Math.round((rng() - 0.5) * range);
  const bulbHalf = wobble({ 2: 106, 3: 93, 4: 77 }[inletCount], 14);
  const spoutHalf = wobble(inletCount === 4 ? 57 : 65, 12);

  // Two pits or three. With four pipes one pit is fed by two of them, which
  // is what keeps the routing on the proven bottom geometry.
  const pitCount = inletCount === 2 ? 2 : 3;
  const pitTypes = distinctTypes(rng, level, pitCount, bulbHalf * 2);

  // How far the whole drain assembly slides off centre. Clamped so the outer
  // pit never leaves the board.
  const shift = [-96, -48, 0, 0, 48, 96][Math.floor(rng() * 6) % 6];

  const bottom = bottomCascade(rng, pitTypes, channel, pins, receivers);

  // Clamp so the outermost pit never leaves the board.
  const minX = Math.min(...receivers.map((r) => r.x - r.w / 2));
  const maxX = Math.max(...receivers.map((r) => r.x + r.w / 2));
  const clamped = Math.max(-(minX - 6), Math.min(W - 6 - maxX, shift));
  shiftBottom(clamped, walls, pins, receivers, 0, 0, 0);

  // The bowl has to follow the *clamped* shift. Handing it the raw one left the
  // funnel's throat offset from the neck walls it feeds whenever the clamp bit.
  const [bowlL, bowlR] = bowl(
    bottom.bowlTop,
    bottom.neckTop,
    wobble({ 2: 150, 3: 100, 4: 82 }[inletCount], 34),
    clamped,
    bottom.neckL,
    bottom.neckR
  );
  channel(bowlL, bowlR);

  // Bore profile is picked per *pipe*, and no two pipes on a board may share
  // one: a flask standing next to an hourglass next to a gourd is what makes
  // two boards read as different pieces of apparatus rather than the same one
  // nudged around. Drawing with replacement put two identical vessels side by
  // side often enough to undo the effect, so the pool empties as it is used.
  const pool = Object.keys(PROFILES);
  const pipeProfile = () => {
    const name = pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0];
    // Each pipe also gets its own proportions, so even two flasks would differ.
    const wide = bulbHalf + Math.round((rng() - 0.5) * 12);
    const narrow = Math.min(wide - 14, spoutHalf + Math.round((rng() - 0.5) * 10));
    return { fn: PROFILES[name](wide, narrow), narrow, name };
  };

  const exitY = bottom.bowlTop - 12;
  // Profiles are settled before the curves are drawn: how far a pipe may swing
  // depends on how fat it is at that depth, and a narrowed spout has room a
  // reservoir does not.
  const shapes = Array.from({ length: inletCount }, pipeProfile);
  const controls = inletControls(inletCount, exitY, rng, shapes.map((s) => s.fn));
  const perPipe = shareGates(rng, inletCount, gateCount);
  // Which stage each group serves. `bottom.order` is the sequence the machine
  // presents its pits in, so a stage index is a position in that sequence.
  const plan = stackPlan(rng, perPipe, bottom.order.length);
  if (!plan) return null;

  // Each inlet: a curved tube, its gates, and a payload group behind each gate.
  const gatesByStage = bottom.order.map(() => []);
  const bores = [];
  for (let i = 0; i < inletCount; i++) {
    const shape = shapes[i];
    const built = vesselProfiled(controls[i], shape.fn, shape.narrow, WALL_T, 9);
    if (!boreIsOpen(built, spoutHalf * 2)) return null;
    bores.push([built.walls[0].points, built.walls[1].points]);
    channel(wall(built.walls[0].points, WALL_T), wall(built.walls[1].points, WALL_T), true);

    const len = pathLength(built.path);
    const boreAt = (f) => built.halfAt(f) * 2;
    // Each pipe has its own share of the board's gate budget, so one channel
    // can be stacked four deep next to one holding a single group.
    const fractions = gateFractions(perPipe[i], rng);
    const gates = fractions.map((f, gi) =>
      gateAcross(`g${i}_${gi}`, built.path, len * f, boreAt(f))
    );
    pins.push(...gates);

    gates.forEach((gate, gi) => {
      const stage = plan[i][gi];
      spawns.push(
        fillTube(rng, built.path, gate, len * fractions[gi], gates[gi + 1] || null,
          groupSize(rng, level, perPipe[i]), bottom.order[stage], boreAt)
      );
      // Appending in gate order keeps each tube's own groups bottom-up, which
      // is the only order they can physically leave in.
      gatesByStage[stage].push(gate.id);
    });
  }

  // Bundled swings keep their spacing in theory; confirm it in the geometry,
  // because a solo bow and a mouth stagger can conspire to close the gap. The
  // floor is deliberately just under the 20px the reservoirs are packed at on
  // a four-pipe board: this is a crossing detector, not a spacing preference.
  if (!channelsAreClear(bores, 17)) return null;

  // Empty everything the current pit wants — wherever it happens to sit —
  // then flip the blade. That is no longer "one pipe per stage": a stage may
  // take the bottom group from three different tubes and leave a fourth alone.
  const solution = [];
  gatesByStage.forEach((ids, stage) => {
    solution.push(...ids);
    if (bottom.blades[stage]) solution.push(bottom.blades[stage]);
  });

  const family = inletCount === 2 ? 'flow' : inletCount === 3 ? 'sort' : 'manifold';
  return { family, walls, tubes, pins, receivers, spawns, solution };
}

/**
 * Bonus level: a hopper of coins tumbling through pegs into the vault.
 *
 * Every knob here varies with the level — hopper width and depth, how far the
 * neck drops, the peg grid, the corridor walls and the vault mouth — because
 * ten identical coin rushes spaced ten levels apart is the most obvious kind
 * of repetition there is.
 */
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

  const tier = level / 10; // 1..10

  // --- hopper: width, shoulder depth and neck bore all shift per level ---
  const hopHalf = 268 + Math.round(rng() * 34); // outer wall x-offset
  const shoulderY = 380 + Math.round(rng() * 90);
  const neckHalf = 52 + Math.round(rng() * 22);
  const neckTop = 660 + Math.round(rng() * 50);
  const neckBot = neckTop + 60 + Math.round(rng() * 40);

  channel(
    curveWall([[360 - hopHalf, CHUTE_TOP], [360 - hopHalf, shoulderY], [360 - neckHalf - 70, shoulderY + 130], [360 - neckHalf, neckTop]]),
    curveWall([[360 + hopHalf, CHUTE_TOP], [360 + hopHalf, shoulderY], [360 + neckHalf + 70, shoulderY + 130], [360 + neckHalf, neckTop]])
  );
  channel(vwall(360 - neckHalf, neckTop, neckBot), vwall(360 + neckHalf, neckTop, neckBot));

  // --- peg corridor: width, row count and spacing vary ---
  const corrHalf = 250 + Math.round(rng() * 40);
  const corrBot = 990 + Math.round(rng() * 30);
  channel(vwall(360 - corrHalf, neckBot, corrBot), vwall(360 + corrHalf, neckBot, corrBot));

  const mouthHalf = 130 + Math.round(rng() * 40);
  channel(
    curveWall([[360 - corrHalf, corrBot], [360 - corrHalf + 40, corrBot + 46], [360 - mouthHalf, corrBot + 70]]),
    curveWall([[360 + corrHalf, corrBot], [360 + corrHalf - 40, corrBot + 46], [360 + mouthHalf, corrBot + 70]])
  );

  const rows = 3 + (tier % 3 | 0);
  const colGap = 82 + Math.round(rng() * 16);
  const rowGap = 44 + Math.round(rng() * 12);
  const pegR = 10 + Math.round(rng() * 3);
  for (let r = 0; r < rows; r++) {
    const y = neckBot + 60 + r * rowGap;
    if (y > corrBot - 30) break;
    const stagger = r % 2 === 0 ? 0 : colGap / 2;
    // Keep pegs well clear of the corridor walls: a coin wedged between a peg
    // and the wall stalls the whole cascade.
    for (let x = 360 - corrHalf + 88 + stagger; x <= 360 + corrHalf - 88; x += colGap) {
      pegs.push({ x: r1(x), y, r: pegR });
    }
  }

  // --- the cascade itself ---
  const count = Math.min(260, 90 + level * 1.7) | 0;
  const r = PAYLOADS.coin.radius;
  const step = r * 2 + 3;
  const perRow = Math.floor((hopHalf * 2 - 34) / step);
  const items = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowCount = Math.min(perRow, count - row * perRow);
    const rowW = (rowCount - 1) * step;
    items.push([r1(360 - rowW / 2 + col * step + (rng() - 0.5) * 2), r1(shoulderY - 40 - row * step)]);
  }
  spawns.push({ type: 'coin', r, items });

  pins.push(gatePin('gHopper', 360, neckTop + 16, neckHalf * 2 + 40, { out: [1, 0], thick: 16 }));
  const solution = ['gHopper'];
  if (level >= 30) {
    pins.push(gatePin('gChute', 360, corrBot + 58, mouthHalf * 2 + 40, { out: [-1, 0], thick: 16 }));
    solution.push('gChute');
  }

  // Bonus rounds are a spectacle, not a precision test: banking most of the
  // cascade is enough, and every extra coin is still paid out.
  receivers.push(receiver('coin', 360, corrBot + 74, mouthHalf * 2, { charSide: 1, quota: 0.55 }));

  return { family: 'vault', walls, tubes, pins, receivers, spawns, pegs, solution };
}

function attemptLevel(level, attempt) {
  const rng = mulberry32(level * 7919 + 13 + attempt * 104729);

  let core;
  if (level % 10 === 0) {
    core = buildVault(rng, level);
  } else {
    // Drawn from the level's rng, so a re-roll can try a different shape of
    // board rather than the same one with the numbers nudged.
    const { pipes, gates } = difficultyFor(level, rng);
    core = buildPipeLevel(rng, level, pipes, gates);
    if (!core) return null; // geometry rejected itself; the caller re-rolls
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

  const out = {
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

  return rng() < 0.5 ? mirrorLevel(out) : out;
}

/** No payload may start inside the glass or inside a pin. */
function spawnsAreClear(lv) {
  for (const sp of lv.spawns) {
    for (const [x, y] of sp.items) {
      for (const w of lv.walls) {
        for (let i = 0; i < w.points.length - 1; i++) {
          const [x0, y0] = w.points[i];
          const [x1, y1] = w.points[i + 1];
          if (distToSeg(x, y, x0, y0, x1, y1) < sp.r + w.t / 2) return false;
        }
      }
      for (const p of lv.pins) {
        if (distToSeg(x, y, ...pinSegment(p)) < sp.r + p.thick / 2) return false;
      }
    }
  }
  // Nor inside each other. Rows are laid square to the centre-line and pushed
  // up until they clear the gate; on a hard bend the pushing bunches them, and
  // two rows on the inside of the curve can end up sharing space.
  const all = lv.spawns.flatMap((sp) => sp.items.map(([x, y]) => [x, y, sp.r]));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [x0, y0, r0] = all[i];
      const [x1, y1, r1v] = all[j];
      if (Math.hypot(x0 - x1, y0 - y1) < r0 + r1v) return false;
    }
  }
  return true;
}

/** Coarse silhouette, used to keep consecutive levels from looking alike. */
function silhouette(lv, cell = 40) {
  const cells = new Set();
  for (const w of lv.walls) {
    for (const [x, y] of w.points) cells.add(`${Math.round(x / cell)},${Math.round(y / cell)}`);
  }
  return cells;
}

function overlap(a, b) {
  let shared = 0;
  for (const v of a) if (b.has(v)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

/**
 * What a board *is*, coarsely — the things a player registers as sameness.
 *
 * Deliberately structure only, with no geometric jitter in it. Jitter cannot
 * rescue two boards that hold the same number of pins, want the same pull
 * order, throw the flow the same way and feed the same pits in the same order:
 * those play identically however differently their glass is bent. That is
 * exactly how levels 2 and 4 came out the same to play while every geometric
 * measure I had called them distinct.
 */
function playSignature(lv) {
  const steps = lv.solution.map((id) => /^g(\d+)_/.exec(id)?.[1] ?? 'B');
  /*
   * Which pit holds which item is deliberately *not* part of this.
   *
   * It was, and it let boards through that a player reads as identical: 1 and
   * 2 wanted the same pull order and threw the flow the same way, differing
   * only in whether the coal sat left or right. Swapping the cast is not a new
   * level. What has to differ is the number of channels, how many pins, the
   * order they come out in, and which way each blade throws.
   */
  return [
    lv.tubes.filter((t) => t.cap).length,
    lv.pins.length,
    steps.filter((s, i) => s !== steps[i - 1]).join('-'),
    // A ramp pointing right throws the flow right; mirroring the board flips
    // this, which is correct — a mirrored machine is operated the other way.
    lv.pins.filter((p) => p.kind === 'ramp').map((p) => (Math.abs(p.angle) < 90 ? 'R' : 'L')).join(''),
  ].join('|');
}

/**
 * Build a level, then prove it before keeping it.
 *
 * Level shapes vary a lot now — bore profiles, curve motifs, mirroring,
 * jittered proportions — and some combinations simply do not play: a payload
 * parks on a bend, or a straggler crosses a blade flip. Rather than pinning
 * the variety back down to the handful of shapes known to be safe, every
 * candidate is played by the solver and re-rolled if it fails. A level only
 * reaches the JSON if it is winnable, and preferably winnable without waste.
 */
function buildLevel(level, recent) {
  let fallback = null;
  let lookalike = null;

  for (let attempt = 0; attempt < 44; attempt++) {
    const candidate = attemptLevel(level, attempt);

    // Cheap rejections first: no point simulating a broken board.
    if (!candidate || !spawnsAreClear(candidate)) continue;

    const report = simulateLevel(candidate);
    if (!report.solved) continue;

    const shape = silhouette(candidate);
    const sig = playSignature(candidate);
    /*
     * Compared against a window of recent levels, not just the one before.
     * Checking only the immediately previous level is what let 2 and 4 come out
     * identical, and 3 and 5 with them: nothing ever compared a level to the
     * one two places back, so alternating between two designs passed every
     * check. A player notices that immediately.
     */
    const seen = recent.some((r) => r.sig === sig || overlap(r.shape, shape) > 0.75);

    if (report.clean && !seen) return { level: candidate, attempt, quality: 'clean', shape, sig };
    if (report.clean && !lookalike) lookalike = { level: candidate, attempt, quality: 'lookalike', shape, sig };
    // When nothing comes out clean, keep the *least* wasteful board rather than
    // the first one that merely worked. The player is shown this order as the
    // paid hint, so every item it throws away is the hint lying to them.
    const waste = report.wrong + report.lost;
    if (!fallback || waste < fallback.waste) {
      fallback = { level: candidate, attempt, quality: 'messy', shape, sig, waste };
    }
  }

  if (lookalike) return lookalike;

  if (fallback) return fallback;
  // Nothing played. Hand back the first candidate that at least built, so the
  // build fails loudly downstream rather than silently shipping a level nobody
  // can finish.
  for (let attempt = 0; attempt < 44; attempt++) {
    const last = attemptLevel(level, attempt);
    if (last) {
      return { level: last, attempt, quality: 'unsolved', shape: silhouette(last), sig: playSignature(last) };
    }
  }
  throw new Error(`L${level}: no candidate geometry built at all`);
}

const levels = [];
const quality = { clean: 0, lookalike: 0, messy: 0, unsolved: 0 };
let totalAttempts = 0;
/*
 * A rolling window of what has just been played, so no board repeats one the
 * player still remembers. Six is enough to cover a sitting; bonus rounds stay
 * out of it because they are all one design on purpose.
 */
const RECALL = 6;
const recent = [];
for (let i = 1; i <= 100; i++) {
  const built = buildLevel(i, recent);
  if (!built.level.bonus) {
    recent.push({ shape: built.shape, sig: built.sig });
    if (recent.length > RECALL) recent.shift();
  }
  quality[built.quality]++;
  totalAttempts += built.attempt + 1;
  levels.push(built.level);
  if (built.quality === 'unsolved') console.warn(`  ! L${i} could not be made solvable`);
}

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
    `pins: ${levels[0].pins.length} at L1 → ${levels[98].pins.length} at L99, ${pins} total\n` +
    `solver: ${quality.clean} clean, ${quality.lookalike} clean-but-similar, ` +
    `${quality.messy} playable-but-messy, ${quality.unsolved} unsolved ` +
    `(${(totalAttempts / levels.length).toFixed(1)} attempts/level)`
);
