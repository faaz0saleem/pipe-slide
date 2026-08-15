/**
 * Curve maths for the level generator.
 *
 * Levels are authored as centre-lines through a handful of control points;
 * everything here turns those into the dense polylines the game's wall format
 * expects. A "tube" is two polylines offset either side of a smoothed
 * centre-line, which is what gives the glass pipes their curved bore.
 */

export const r1 = (n) => Math.round(n * 10) / 10;

/** Catmull-Rom passes through every control point, which makes levels easy to author. */
function catmullRom(p0, p1, p2, p3, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  const axis = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
  return [axis(p0[0], p1[0], p2[0], p3[0]), axis(p0[1], p1[1], p2[1], p3[1])];
}

/** Smooth a control polygon into a dense polyline. */
export function smoothPath(ctrl, stepsPerSpan = 9) {
  if (ctrl.length < 2) return ctrl.slice();
  const ext = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const out = [];
  for (let i = 0; i < ext.length - 3; i++) {
    for (let s = 0; s < stepsPerSpan; s++) {
      out.push(catmullRom(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], s / stepsPerSpan));
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out;
}

/** Cumulative arc length for each vertex of a polyline. */
export function arcTable(path) {
  const acc = [0];
  for (let i = 1; i < path.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  return acc;
}

export const pathLength = (path) => arcTable(path).at(-1);

/** Point at a distance along the path, plus the unit tangent there. */
export function atDistance(path, dist) {
  const acc = arcTable(path);
  const total = acc.at(-1);
  const d = Math.max(0, Math.min(total, dist));
  let i = 1;
  while (i < acc.length - 1 && acc[i] < d) i++;
  const seg = acc[i] - acc[i - 1] || 1;
  const t = (d - acc[i - 1]) / seg;
  const a = path[i - 1];
  const b = path[i];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return {
    point: [a[0] + dx * t, a[1] + dy * t],
    tangent: [dx / len, dy / len],
    normal: [-dy / len, dx / len],
  };
}

/** Point at a 0..1 fraction of the path. */
export const atFraction = (path, f) => atDistance(path, pathLength(path) * f);

/**
 * Offset a polyline sideways by a distance that varies along its length.
 * `halfAt(t)` receives the 0..1 position and returns the half-bore there,
 * which is what turns a plain channel into a flask: a wide reservoir up top
 * easing into a narrow spout.
 */
export function offsetProfiled(path, halfAt, sign) {
  const last = path.length - 1;
  const acc = arcTable(path);
  const total = acc[last] || 1;
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(last, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const d = halfAt(acc[i] / total) * sign;
    return [r1(p[0] - (dy / len) * d), r1(p[1] + (dx / len) * d)];
  });
}

/**
 * Offset a polyline sideways. Positive `d` moves along the left-hand normal.
 * Curvature must stay gentler than `d` or the offset self-intersects — level
 * control points are authored with that in mind.
 */
export function offsetPath(path, d) {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [r1(p[0] - (dy / len) * d), r1(p[1] + (dx / len) * d)];
  });
}

/** Radius of the circle through three consecutive vertices. */
function radiusAt(path, i) {
  const [ax, ay] = path[i - 1];
  const [bx, by] = path[i];
  const [cx, cy] = path[i + 1];
  const A = Math.hypot(bx - ax, by - ay);
  const B = Math.hypot(cx - bx, cy - by);
  const C = Math.hypot(cx - ax, cy - ay);
  const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  if (area < 1e-6) return Infinity; // collinear
  return (A * B * C) / (4 * area);
}

/** Smallest radius of curvature anywhere along a polyline. */
export function minRadius(path) {
  let best = Infinity;
  for (let i = 1; i < path.length - 1; i++) best = Math.min(best, radiusAt(path, i));
  return best;
}

/**
 * How badly a bend outruns the bore it has to carry, in pixels.
 *
 * Offsetting a curve by more than its radius folds the inner wall back through
 * itself. The limit is therefore local: what matters is the half-bore *at the
 * bend*, not the tube's narrowest point somewhere else. Judging every vessel
 * by its narrowest bore forbids hooks in the spout — the one place a glass
 * channel can genuinely hook — while quietly allowing pinches up in the fat
 * reservoir, where the wall is offset nearly twice as far.
 *
 * @returns {number} 0 when every bend is safe, otherwise the worst shortfall
 */
export function bendStrain(path, halfAt, slack = 1.1) {
  const acc = arcTable(path);
  const total = acc.at(-1) || 1;
  let worst = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const need = halfAt(acc[i] / total) * slack;
    worst = Math.max(worst, need - radiusAt(path, i));
  }
  return worst;
}

/** Ease interior control points towards the straight chord. */
function relax(ctrl, k) {
  const first = ctrl[0];
  const last = ctrl[ctrl.length - 1];
  return ctrl.map((p, i) => {
    if (i === 0 || i === ctrl.length - 1) return p.slice();
    const f = i / (ctrl.length - 1);
    return [
      p[0] + (first[0] + (last[0] - first[0]) * f - p[0]) * k,
      p[1] + (first[1] + (last[1] - first[1]) * f - p[1]) * k,
    ];
  });
}

/**
 * A curved tube: a smoothed centre-line plus the two wall polylines that form
 * its bore.
 *
 * Offsetting a curve by more than its radius of curvature makes the inner wall
 * fold back through itself, which reads as a kink and physically seals the
 * tube. Rather than trusting authored control points to stay clear of that,
 * the bend is relaxed towards a straight chord until the radius is safe — so
 * a level is always as curvy as it can be without breaking.
 *
 * @returns {{ path: number[][], walls: {points:number[][], t:number}[], relaxed:number }}
 */
export function tube(ctrl, bore, t, stepsPerSpan = 9) {
  const half = bore / 2;
  const safeRadius = half * 1.25;

  let control = ctrl.map((p) => p.slice());
  let path = smoothPath(control, stepsPerSpan);
  let relaxed = 0;
  while (minRadius(path) < safeRadius && relaxed < 14) {
    control = relax(control, 0.18);
    path = smoothPath(control, stepsPerSpan);
    relaxed++;
  }

  return {
    path,
    relaxed,
    walls: [
      { points: offsetPath(path, half), t },
      { points: offsetPath(path, -half), t },
    ],
  };
}

/**
 * Bore profiles: how a vessel's width changes down its length. These are what
 * give levels distinct silhouettes rather than all reading as the same funnel.
 *
 *   flask  wide reservoir up top, easing into a narrow spout
 *   belly  narrow neck, a bulge in the middle, narrow again
 *   taper  a steady cone from top to bottom
 *   pill   near-constant narrow bore with a slight swell
 */
const ease = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

export const PROFILES = {
  flask: (wide, narrow, shoulder = 0.42) => (f) =>
    f <= shoulder ? wide : wide + (narrow - wide) * ease(clamp01((f - shoulder) / 0.22)),

  belly: (wide, narrow) => (f) => {
    const swell = Math.sin(clamp01(f) * Math.PI); // 0 at both ends, 1 mid
    return narrow + (wide - narrow) * ease(swell);
  },

  taper: (wide, narrow) => (f) => wide + (narrow - wide) * ease(clamp01(f)),

  pill: (wide, narrow) => (f) => {
    const swell = Math.sin(clamp01(f) * Math.PI);
    return narrow + (wide - narrow) * 0.45 * ease(swell);
  },

  /** Two reservoirs stacked with a waist between them. */
  double: (wide, narrow) => (f) => {
    const swell = Math.abs(Math.sin(clamp01(f) * Math.PI * 2));
    return narrow + (wide - narrow) * ease(swell);
  },

  /** Small head, fat body — a gourd. */
  gourd: (wide, narrow) => (f) => {
    const u = clamp01(f);
    const head = Math.sin(u * Math.PI * 2) > 0 ? 0.45 : 1;
    const swell = Math.abs(Math.sin(u * Math.PI * 2));
    return narrow + (wide - narrow) * ease(swell) * head;
  },

  /** Inverted: pinched at the mouth, opening out lower down. */
  cone: (wide, narrow) => (f) => narrow + (wide - narrow) * ease(clamp01(f)),

  /** Wide, pinched at the waist, wide again. */
  hourglass: (wide, narrow) => (f) => {
    const waist = Math.abs(Math.cos(clamp01(f) * Math.PI));
    return narrow + (wide - narrow) * ease(waist);
  },
};

/**
 * A vessel: a tube whose bore varies down its length, like glassware.
 * `profile` is a function of the 0..1 arc position returning the half-bore
 * there. Bends are eased off only until they clear the bore *where they
 * happen*, so a narrow spout keeps its hook.
 */
export function vesselProfiled(ctrl, profile, narrowest, t, stepsPerSpan = 9) {
  let control = ctrl.map((p) => p.slice());
  let path = smoothPath(control, stepsPerSpan);
  let relaxed = 0;
  // Small steps: one big relax straightens a serpentine into a plain chute,
  // and the whole point of the exercise is to keep as much bend as will fit.
  while (bendStrain(path, profile) > 0 && relaxed < 26) {
    control = relax(control, 0.09);
    path = smoothPath(control, stepsPerSpan);
    relaxed++;
  }

  return {
    path,
    halfAt: profile,
    relaxed,
    walls: [
      { points: offsetProfiled(path, profile, 1), t },
      { points: offsetProfiled(path, profile, -1), t },
    ],
  };
}

/** Back-compat wrapper: the original flask-only vessel. */
export function vessel(ctrl, bulbHalf, spoutHalf, shoulder, t, stepsPerSpan = 12) {
  const safeRadius = spoutHalf * 1.25;

  let control = ctrl.map((p) => p.slice());
  let path = smoothPath(control, stepsPerSpan);
  let relaxed = 0;
  while (minRadius(path) < safeRadius && relaxed < 14) {
    control = relax(control, 0.18);
    path = smoothPath(control, stepsPerSpan);
    relaxed++;
  }

  const halfAt = PROFILES.flask(bulbHalf, spoutHalf, shoulder);

  return {
    path,
    halfAt,
    relaxed,
    walls: [
      { points: offsetProfiled(path, halfAt, 1), t },
      { points: offsetProfiled(path, halfAt, -1), t },
    ],
  };
}
