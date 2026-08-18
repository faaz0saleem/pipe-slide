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

/* --- composition: what the player actually reads as "a different level" --
 * The silhouette fingerprint above counts squiggles, and squiggles are cheap
 * to vary while every board stays N tubes of one length in a row emptying
 * into one bowl. This coarser signature — how many channels, how long they
 * are, where they end — is the thing that makes two levels look alike. */
const composition = new Map();
for (const l of nonBonus) {
  const inlets = l.tubes.filter((t) => t.cap);
  const bucket = (v, n) => Math.round(v / n) * n;
  const lens = inlets.map((t) => {
    const ys = t.left.map((p) => p[1]);
    return bucket(Math.max(...ys) - Math.min(...ys), 60);
  });
  const ends = inlets.map((t) => bucket(t.left.at(-1)[1], 60));
  const key = `${inlets.length}|${lens.slice().sort().join()}|${ends.slice().sort().join()}`;
  composition.set(key, (composition.get(key) || 0) + 1);
}
const worstComp = [...composition.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(`distinct compositions      ${composition.size}/${nonBonus.length} levels`);
console.log(`commonest composition      ${worstComp[1]} levels share "${worstComp[0]}"`);

const pipeMix = {};
for (const l of nonBonus) {
  const n = l.tubes.filter((t) => t.cap).length;
  pipeMix[n] = (pipeMix[n] || 0) + 1;
}
console.log('channels per board        ', pipeMix);

/* --- the thing the player actually does --------------------------------
 * Geometry variety counts for nothing if the job is identical every time.
 * When each pipe carried a single payload type the pipe *was* the delivery
 * stage, so the answer to all ninety boards was one routine — drain a pipe,
 * flip a blade, drain the next. That is measurable: does any pipe get
 * revisited after the solution has moved on from it? */
let oneRunPerPipe = 0;
const shapes = new Set();
for (const l of nonBonus) {
  const steps = l.solution.map((id) => /^g(\d+)_/.exec(id)?.[1] ?? 'B');
  const runs = steps.filter((s, i) => s !== steps[i - 1]);
  const pipesOnly = runs.filter((s) => s !== 'B');
  if (pipesOnly.length === new Set(pipesOnly).size) oneRunPerPipe++;
  shapes.add(runs.join('-'));
}
console.log(`solutions "drain a pipe, flip" ${oneRunPerPipe}/${nonBonus.length}`);
console.log(`distinct solution shapes   ${shapes.size}/${nonBonus.length}`);

/* --- is there anything to think about? ---------------------------------
 * A trap group is one stacked too high to ever reach its pit, so working out
 * which pins to leave alone is the puzzle. Without them a board is read off
 * rather than solved: the stack order gives the answer and there is exactly
 * one legal move at each step. */
const trapped = nonBonus.filter((l) => l.spawns.some((s) => s.trap));
const trapGroups = nonBonus.reduce((n, l) => n + l.spawns.filter((s) => s.trap).length, 0);
const decisions = nonBonus.map((l) => l.pins.length - l.solution.length);
console.log(`levels with a trap         ${trapped.length}/${nonBonus.length}  (${trapGroups} groups)`);
console.log(
  `pins to leave alone        ${Math.min(...decisions)}..${Math.max(...decisions)} per level`
);

/* --- boards that play the same ----------------------------------------
 * Structure only: how many channels, how many pins, the pull order, and which
 * way each blade throws. Two levels matching on all of that play identically
 * however differently their glass is bent — which is how 2 and 4 shipped as
 * the same level while every geometric measure passed. Which pit holds which
 * item is left out on purpose: swapping the cast is not a new level. */
const play = new Map();
for (const l of nonBonus) {
  const steps = l.solution.map((id) => /^g(\d+)_/.exec(id)?.[1] ?? 'B');
  const sig = [
    l.tubes.filter((t) => t.cap).length,
    l.pins.length,
    steps.filter((s, i) => s !== steps[i - 1]).join('-'),
    l.pins.filter((p) => p.kind === 'ramp').map((p) => (Math.abs(p.angle) < 90 ? 'R' : 'L')).join(''),
  ].join('|');
  if (!play.has(sig)) play.set(sig, []);
  play.get(sig).push(l.id);
}
const twins = [...play.values()].filter((v) => v.length > 1);
// Only a repeat close enough to still be in the player's memory matters.
const nearTwins = twins.flatMap((ids) =>
  ids.flatMap((a, i) => ids.slice(i + 1).filter((b) => b - a <= 6).map((b) => `${a}~${b}`))
);
console.log(`distinct play signatures   ${play.size}/${nonBonus.length} levels`);
console.log(
  `repeats within 6 levels    ${nearTwins.length}${nearTwins.length ? '  ' + nearTwins.slice(0, 10).join(' ') : ''}`
);

/* --- the machine at the bottom ----------------------------------------
 * The blades and pits are what the player actually operates, so two boards
 * with the same one play the same however differently the glass above them is
 * bent. Both variants used to be hand-written literals, which made this the
 * most-shared thing in the game. */
const machines = new Set();
for (const l of nonBonus) {
  const blades = l.pins
    .filter((p) => p.kind === 'ramp')
    .map((p) => `${Math.round(p.x / 20)},${Math.round(p.y / 20)},${Math.round(p.angle / 5)}`);
  const pits = l.receivers.map((r) => `${Math.round(r.x / 20)}w${Math.round(r.w / 20)}t${Math.round(r.top / 20)}`);
  machines.add(`${blades.join('|')}/${pits.join('|')}`);
}
console.log(`distinct bottom machines   ${machines.size}/${nonBonus.length} levels`);

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
