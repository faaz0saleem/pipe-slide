/**
 * Procedural texture factory.
 *
 * Every sprite in the game is painted into a canvas texture at boot: no image
 * files ship in the bundle, which keeps the CrazyGames upload tiny and means
 * there is never a missing-asset frame.
 *
 * Payload art is rendered at 2x and drawn at scale 0.5 so it stays crisp on
 * high-DPI screens.
 */

import { PAYLOAD_STYLE } from '../config/Palette.js';

export const ART_SCALE = 2;

const css = (n, a = 1) =>
  `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;

function canvasFor(scene, key, w, h) {
  if (scene.textures.exists(key)) return null;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  return tex;
}

function finish(tex) {
  if (tex) tex.refresh();
}

/* ------------------------------------------------------------------ */
/* Payloads                                                            */
/* ------------------------------------------------------------------ */

function drawCoal(ctx, s, style, rnd) {
  const c = s / 2;
  const r = s / 2 - 3;

  // Irregular lump silhouette. The corner count and every radius come from the
  // variant's own rng, so a hopper of coal is a heap of distinct lumps rather
  // than one lump printed nine times.
  const pts = [];
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.24;
    const rr = r * (0.72 + rnd() * 0.34);
    pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
  }

  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();

  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, css(style.hi));
  g.addColorStop(0.45, css(style.base));
  g.addColorStop(1, css(0x15171c));
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = css(0x0a0b0e, 0.8);
  ctx.lineWidth = s * 0.05;
  ctx.stroke();

  // Facets catch the light.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = css(style.hi);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.lineTo(c, c);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Glint.
  ctx.fillStyle = css(0xffffff, 0.85);
  ctx.beginPath();
  ctx.arc(c - r * 0.3, c - r * 0.35, s * 0.045, 0, Math.PI * 2);
  ctx.fill();

  rimLight(ctx, pts, s);
}

/**
 * A cool highlight along the lower-right of a silhouette.
 *
 * Everything in this game falls through backlit glass, and a lump with light
 * on its top face only reads as a sticker on the background. One bounce
 * light along the opposite edge is what separates it.
 */
function rimLight(ctx, pts, s) {
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = css(0xbfe6ff, 0.55);
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.translate(-s * 0.03, -s * 0.03);
  ctx.stroke();
  ctx.restore();
}

function drawApple(ctx, s, style, rnd) {
  const c = s / 2;
  const r = s / 2 - 4;
  // Lean, lobe spread and which way the stem bends all shift per variant, so
  // a stack of apples in a tube is a crate of fruit rather than a pattern.
  const lean = (rnd() - 0.5) * 0.5;
  const side = rnd() < 0.5 ? -1 : 1;
  const spread = 0.18 + rnd() * 0.1;

  ctx.save();
  ctx.translate(c, c + s * 0.04);
  ctx.rotate(lean);
  ctx.translate(-c, -c);

  // Body: two overlapping lobes for the classic apple silhouette.
  const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r * 1.15);
  g.addColorStop(0, css(style.hi));
  g.addColorStop(0.45, css(style.base));
  g.addColorStop(1, css(0x8e1f2c));
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.arc(c - r * spread, c, r * 0.82, 0, Math.PI * 2);
  ctx.arc(c + r * spread, c, r * 0.82, 0, Math.PI * 2);
  ctx.fill();

  // Bounce light along the shaded flank.
  ctx.strokeStyle = css(0xffd0c0, 0.4);
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(c, c + r * 0.06, r * 0.84, Math.PI * 0.1, Math.PI * 0.62);
  ctx.stroke();

  // Stem.
  ctx.strokeStyle = css(0x6b4326);
  ctx.lineWidth = s * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c, c - r * 0.72);
  ctx.quadraticCurveTo(c + side * s * 0.04, c - r * 0.95, c + side * s * 0.02, c - r * 1.05);
  ctx.stroke();

  // Leaf.
  ctx.fillStyle = css(style.spark);
  ctx.beginPath();
  ctx.ellipse(c + side * r * 0.32, c - r * 0.86, r * 0.3, r * 0.15, side * -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Specular.
  ctx.fillStyle = css(0xffffff, 0.55);
  ctx.beginPath();
  ctx.ellipse(c - r * 0.34, c - r * 0.3, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGem(ctx, s, style, rnd) {
  const c = s / 2;
  const r = s / 2 - 3;
  const top = c - r * 0.85;
  const shoulder = c - r * (0.24 + rnd() * 0.18);
  // A wider or narrower cut per variant: the same stone, cut by a different
  // hand. The crown facets follow, because they are struck from the shoulder.
  const waist = 0.72 + rnd() * 0.22;
  const point = 0.4 + rnd() * 0.2;

  const face = [
    [c, top],
    [c + r * waist, shoulder],
    [c + r * point, c + r * 0.9],
    [c - r * point, c + r * 0.9],
    [c - r * waist, shoulder],
  ];

  const g = ctx.createLinearGradient(0, top, 0, c + r);
  g.addColorStop(0, css(style.hi));
  g.addColorStop(0.5, css(style.base));
  g.addColorStop(1, css(0x1173a8));
  ctx.fillStyle = g;
  ctx.beginPath();
  face.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();

  // Facet lines from the crown.
  ctx.strokeStyle = css(0xffffff, 0.5);
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  face.forEach(([x, y]) => {
    ctx.moveTo(c, shoulder);
    ctx.lineTo(x, y);
  });
  ctx.moveTo(c - r * waist, shoulder);
  ctx.lineTo(c + r * waist, shoulder);
  ctx.stroke();

  ctx.strokeStyle = css(0xffffff, 0.85);
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  face.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();

  // Sparkle.
  ctx.fillStyle = css(0xffffff, 0.9);
  ctx.beginPath();
  ctx.arc(c - r * 0.28, c - r * 0.1, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(ctx, s, style, rnd) {
  const c = s / 2;
  const r = s / 2 - 2;
  const milled = 18 + Math.floor(rnd() * 10);

  ctx.fillStyle = css(0xb2700f);
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();

  // Milled edge: the notches around the rim of a struck coin.
  ctx.strokeStyle = css(0x8a5408, 0.9);
  ctx.lineWidth = s * 0.035;
  for (let i = 0; i < milled; i++) {
    const a = (i / milled) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r * 0.9, c + Math.sin(a) * r * 0.9);
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.stroke();
  }

  const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
  g.addColorStop(0, css(style.hi));
  g.addColorStop(0.55, css(style.base));
  g.addColorStop(1, css(0xd9911c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.86, 0, Math.PI * 2);
  ctx.fill();

  // Embossed four-point sparkle.
  ctx.fillStyle = css(0xfff6cc, 0.95);
  ctx.beginPath();
  const k = r * 0.42;
  ctx.moveTo(c, c - k);
  ctx.quadraticCurveTo(c + k * 0.22, c - k * 0.22, c + k, c);
  ctx.quadraticCurveTo(c + k * 0.22, c + k * 0.22, c, c + k);
  ctx.quadraticCurveTo(c - k * 0.22, c + k * 0.22, c - k, c);
  ctx.quadraticCurveTo(c - k * 0.22, c - k * 0.22, c, c - k);
  ctx.fill();

  ctx.strokeStyle = css(0xffffff, 0.55);
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(c - r * 0.12, c - r * 0.12, r * 0.66, Math.PI * 1.05, Math.PI * 1.65);
  ctx.stroke();
}

function drawBomb(ctx, s, style, rnd) {
  const c = s / 2;
  const r = s / 2 - 5;

  const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.38, r * 0.1, c, c, r);
  g.addColorStop(0, css(style.hi));
  g.addColorStop(0.5, css(style.base));
  g.addColorStop(1, css(0x0c0d12));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c + s * 0.05, r, 0, Math.PI * 2);
  ctx.fill();

  // Cap + fuse.
  ctx.fillStyle = css(0x5a5f6d);
  ctx.fillRect(c - r * 0.24, c - r * 0.95, r * 0.48, r * 0.28);

  // Band around the shell, at a slightly different height per variant.
  ctx.strokeStyle = css(0x40444f, 0.9);
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.ellipse(c, c + s * 0.05, r * 0.94, r * (0.2 + rnd() * 0.14), 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = css(0xc8a06a);
  ctx.lineWidth = s * 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c, c - r * 0.9);
  ctx.quadraticCurveTo(c + r * 0.5, c - r * 1.25, c + r * 0.32, c - r * 1.5);
  ctx.stroke();

  // Lit tip.
  const sp = ctx.createRadialGradient(c + r * 0.32, c - r * 1.5, 0, c + r * 0.32, c - r * 1.5, r * 0.4);
  sp.addColorStop(0, css(0xffffff, 1));
  sp.addColorStop(0.4, css(style.spark, 0.9));
  sp.addColorStop(1, css(style.spark, 0));
  ctx.fillStyle = sp;
  ctx.beginPath();
  ctx.arc(c + r * 0.32, c - r * 1.5, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = css(0xffffff, 0.4);
  ctx.beginPath();
  ctx.ellipse(c - r * 0.36, c - r * 0.2, r * 0.2, r * 0.28, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** A small deterministic rng, seeded from a payload type and variant index. */
function seeded(type, variant) {
  let a = variant * 0x9e3779b1 + 1;
  for (let i = 0; i < type.length; i++) a = (a * 31 + type.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAYLOAD_PAINTERS = {
  coal: drawCoal,
  apple: drawApple,
  gem: drawGem,
  coin: drawCoin,
  bomb: drawBomb,
};

/**
 * How many cuts of each payload are painted.
 *
 * Three is the point where a tube full of coal stops reading as a repeating
 * tile and starts reading as a heap, and it costs three small canvases per
 * type at boot. Variant 0 keeps the plain `p_<type>` key, because the menus,
 * the shop and the results screen all reach for `p_coin` directly.
 */
export const PAYLOAD_VARIANTS = 3;

export const payloadKey = (type, variant = 0) =>
  variant ? `p_${type}_${variant}` : `p_${type}`;

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

function drawGlow(ctx, s) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

function drawSoftDot(ctx, s) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

function drawStar(ctx, s, points = 5, innerRatio = 0.45) {
  const c = s / 2;
  const R = c - 2;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? R : R * innerRatio;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawFourStar(ctx, s) {
  const c = s / 2;
  const R = c - 1;
  const k = R * 0.18;
  ctx.beginPath();
  ctx.moveTo(c, c - R);
  ctx.quadraticCurveTo(c + k, c - k, c + R, c);
  ctx.quadraticCurveTo(c + k, c + k, c, c + R);
  ctx.quadraticCurveTo(c - k, c + k, c - R, c);
  ctx.quadraticCurveTo(c - k, c - k, c, c - R);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawHeart(ctx, s) {
  const c = s / 2;
  const r = s * 0.26;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c - r * 0.62, c - r * 0.35, r * 0.72, 0, Math.PI * 2);
  ctx.arc(c + r * 0.62, c - r * 0.35, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c - r * 1.3, c - r * 0.08);
  ctx.quadraticCurveTo(c, c + r * 1.9, c + r * 1.3, c - r * 0.08);
  ctx.quadraticCurveTo(c, c + r * 0.5, c - r * 1.3, c - r * 0.08);
  ctx.fill();
}

function drawFlame(ctx, s) {
  const c = s / 2;
  const g = ctx.createLinearGradient(0, s, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(c, 1);
  ctx.quadraticCurveTo(s * 0.95, s * 0.55, c, s - 1);
  ctx.quadraticCurveTo(s * 0.05, s * 0.55, c, 1);
  ctx.fill();
}

function drawRing(ctx, s) {
  const c = s / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.arc(c, c, c - s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
}

function drawChunk(ctx, w, h) {
  ctx.fillStyle = '#ffffff';
  const r = Math.min(w, h) * 0.35;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();
}

function drawLock(ctx, s) {
  const c = s / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.11;
  ctx.beginPath();
  ctx.arc(c, c - s * 0.12, s * 0.22, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const bw = s * 0.62;
  const bh = s * 0.44;
  const r = s * 0.09;
  const x = c - bw / 2;
  const y = c - s * 0.06;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + bw - r, y);
  ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
  ctx.lineTo(x + bw, y + bh - r);
  ctx.quadraticCurveTo(x + bw, y + bh, x + bw - r, y + bh);
  ctx.lineTo(x + r, y + bh);
  ctx.quadraticCurveTo(x, y + bh, x, y + bh - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

function drawArrow(ctx, s) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.5);
  ctx.lineTo(s * 0.62, s * 0.5);
  ctx.lineTo(s * 0.62, s * 0.2);
  ctx.lineTo(s * 0.92, s * 0.5);
  ctx.lineTo(s * 0.62, s * 0.8);
  ctx.lineTo(s * 0.62, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(s * 0.15, s * 0.38, s * 0.3, s * 0.24);
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/** Paint every shared texture. Safe to call more than once. */
export function buildTextures(scene) {
  // --- payloads ---
  for (const [type, style] of Object.entries(PAYLOAD_STYLE)) {
    const r = { coal: 19, apple: 18, gem: 17, coin: 14, bomb: 20 }[type] || 18;
    const size = Math.ceil(r * 2 * ART_SCALE) + 8;
    for (let v = 0; v < PAYLOAD_VARIANTS; v++) {
      const tex = canvasFor(scene, payloadKey(type, v), size, size);
      if (tex) {
        // Seeded per type and variant, so the same lump of coal is painted the
        // same way in every session — worth having when a screenshot or a
        // smoke test is being compared against the last one.
        PAYLOAD_PAINTERS[type](tex.getContext(), size, style, seeded(type, v));
        finish(tex);
      }
    }
  }

  // --- effect sprites (all white; tinted at runtime) ---
  const fx = [
    ['fx_glow', 128, 128, (c, w) => drawGlow(c, w)],
    ['fx_dot', 32, 32, (c, w) => drawSoftDot(c, w)],
    ['fx_star', 48, 48, (c, w) => drawStar(c, w)],
    ['fx_spark4', 48, 48, (c, w) => drawFourStar(c, w)],
    ['fx_heart', 40, 40, (c, w) => drawHeart(c, w)],
    ['fx_flame', 40, 56, (c, w, h) => drawFlame(c, Math.max(w, h))],
    ['fx_ring', 96, 96, (c, w) => drawRing(c, w)],
    ['fx_confetti', 14, 22, (c, w, h) => drawChunk(c, w, h)],
    ['ui_lock', 56, 56, (c, w) => drawLock(c, w)],
    ['ui_arrow', 56, 56, (c, w) => drawArrow(c, w)],
  ];

  for (const [key, w, h, paint] of fx) {
    const tex = canvasFor(scene, key, w, h);
    if (tex) {
      paint(tex.getContext(), w, h);
      finish(tex);
    }
  }

  // --- a 1x1 white pixel for cheap rectangles/flashes ---
  if (!scene.textures.exists('px')) {
    const tex = scene.textures.createCanvas('px', 2, 2);
    const c = tex.getContext();
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 2, 2);
    tex.refresh();
  }
}

/**
 * A vertical gradient the size of the play field, cached per theme. Cheaper
 * than a shader and it survives the WebGL context being lost.
 */
export function ensureBackdrop(scene, key, w, h, stops) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach(([pos, color, alpha = 1]) => g.addColorStop(pos, css(color, alpha)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
}
