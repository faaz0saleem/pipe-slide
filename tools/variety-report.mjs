/**
 * How different are the levels, really?
 *
 * "They all look the same" is a claim you can measure, so this does. It
 * fingerprints each level's geometry, counts how many genuinely distinct
 * layouts exist, and scores how similar each level is to the one before it —
 * which is what a player actually notices as they play through in order.
 *
 * Run with:  npm run variety
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(__dirname, '../public/levels/levels.json'), 'utf8'));

/** Coarse geometric fingerprint: what the silhouette looks like on a grid. */
function silhouette(lv, cell = 40) {
  const cells = new Set();
  for (const w of lv.walls) {
    for (const [x, y] of w.points) {
      cells.add(`${Math.round(x / cell)},${Math.round(y / cell)}`);
    }
  }
  return cells;
}

/** Pin layout fingerprint: where the interactive bits sit. */
function pinPrint(lv, cell = 30) {
  return new Set(lv.pins.map((p) => `${Math.round(p.x / cell)},${Math.round(p.y / cell)}`));
}

const jaccard = (a, b) => {
  let shared = 0;
  for (const v of a) if (b.has(v)) shared++;
  return shared / (a.size + b.size - shared || 1);
};

const prints = doc.levels.map((lv) => ({
  id: lv.id,
  family: lv.family,
  pins: lv.pins.length,
  sil: silhouette(lv),
  pin: pinPrint(lv),
  key: [...silhouette(lv)].sort().join('|'),
}));

/* --- exact duplicates ------------------------------------------------- */
const byKey = new Map();
for (const p of prints) {
  if (!byKey.has(p.key)) byKey.set(p.key, []);
  byKey.get(p.key).push(p.id);
}
const dupes = [...byKey.values()].filter((ids) => ids.length > 1);

/* --- neighbour similarity --------------------------------------------- */
const neighbour = [];
for (let i = 1; i < prints.length; i++) {
  neighbour.push({
    pair: `${prints[i - 1].id}->${prints[i].id}`,
    sil: jaccard(prints[i - 1].sil, prints[i].sil),
    pin: jaccard(prints[i - 1].pin, prints[i].pin),
  });
}
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const avgSil = avg(neighbour.map((n) => n.sil));
const avgPin = avg(neighbour.map((n) => n.pin));

/* --- worst offenders (most alike, anywhere in the run) ---------------- */
const pairs = [];
for (let i = 0; i < prints.length; i++) {
  for (let j = i + 1; j < prints.length; j++) {
    const s = jaccard(prints[i].sil, prints[j].sil);
    if (s > 0.8) pairs.push({ a: prints[i].id, b: prints[j].id, s });
  }
}
pairs.sort((x, y) => y.s - x.s);

/* --- difficulty monotonicity ------------------------------------------ */
const nonBonus = doc.levels.filter((l) => !l.bonus);
let regressions = 0;
for (let i = 1; i < nonBonus.length; i++) {
  if (nonBonus[i].pins.length < nonBonus[i - 1].pins.length - 1) regressions++;
}

console.log(`levels                     ${doc.levels.length}`);
console.log(`distinct silhouettes       ${byKey.size}/${doc.levels.length}`);
console.log(`exact duplicate groups     ${dupes.length}${dupes.length ? ' -> ' + dupes.slice(0, 5).map((d) => d.join('=')).join(', ') : ''}`);
console.log(`avg neighbour similarity   shape ${(avgSil * 100).toFixed(1)}%  pins ${(avgPin * 100).toFixed(1)}%`);
console.log(`pairs >80% alike           ${pairs.length}${pairs.length ? '  worst: ' + pairs.slice(0, 6).map((p) => `${p.a}~${p.b} ${(p.s * 100) | 0}%`).join(', ') : ''}`);
console.log(`pin count                  ${nonBonus[0].pins.length} -> ${nonBonus.at(-1).pins.length}, ${regressions} backward steps`);

/* --- board size variety ------------------------------------------------
 * "Every level is the same" is often really "every level is the same size".
 * A run of thirty levels that all hold fourteen pins reads as one level no
 * matter how differently its glass is bent, so count the sizes and the
 * longest stretch that never changes. */
const sizes = nonBonus.map((l) => l.pins.length);
let run = 1;
let longest = 1;
let longestAt = nonBonus[0].id;
for (let i = 1; i < sizes.length; i++) {
  if (sizes[i] === sizes[i - 1]) {
    run++;
    if (run > longest) {
      longest = run;
      longestAt = nonBonus[i].id;
    }
  } else run = 1;
}
console.log(`distinct pin counts        ${new Set(sizes).size}/${sizes.length} levels`);
console.log(`longest same-size run      ${longest} (through L${longestAt})`);

/* --- gates per pipe: do the channels on one board differ? -------------- */
let evenBoards = 0;
let pipeBoards = 0;
for (const l of nonBonus) {
  const per = {};
  for (const p of l.pins) {
    const m = /^g(\d+)_/.exec(p.id);
    if (m) per[m[1]] = (per[m[1]] || 0) + 1;
  }
  const counts = Object.values(per);
  if (counts.length < 2) continue;
  pipeBoards++;
  if (new Set(counts).size === 1) evenBoards++;
}
console.log(`boards with every pipe alike ${evenBoards}/${pipeBoards}`);

const byFamily = {};
for (const l of doc.levels) byFamily[l.family] = (byFamily[l.family] || 0) + 1;
console.log('families                  ', byFamily);
