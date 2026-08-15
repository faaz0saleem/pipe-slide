/**
 * How hard are the levels, really?
 *
 * A board is only a puzzle if getting the order wrong costs you something. If
 * every sequence of pulls delivers the goods, the pins are decoration and the
 * player is pressing buttons. So this plays each sampled level the way a
 * confused player would — in a random order — and reports how often that still
 * wins.
 *
 * A high pass rate means a forgiving board; the number should fall as the run
 * goes on. Random order is a harsh stand-in for a human, who reasons rather
 * than guesses, so treat the figures as a trend to compare against itself
 * rather than as a prediction of how many players will fail.
 *
 * Run with:  npm run difficulty
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateLevel } from './solver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(__dirname, '../public/levels/levels.json'), 'utf8'));

const TRIALS = Number(process.env.TRIALS || 6);
const STEP = Number(process.env.STEP || 7); // sample every Nth level

/** Deterministic shuffle, so two runs of the report are comparable. */
function shuffled(list, seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const rows = [];
for (const lv of doc.levels) {
  if (lv.bonus || (lv.id - 1) % STEP !== 0) continue;

  const intended = simulateLevel(lv);
  let won = 0;
  let waste = 0;
  for (let t = 0; t < TRIALS; t++) {
    const scrambled = { ...lv, solution: shuffled(lv.solution, lv.id * 7717 + t * 104729) };
    const r = simulateLevel(scrambled);
    if (r.solved) won++;
    waste += r.wrong + r.lost;
  }
  rows.push({
    id: lv.id,
    family: lv.family,
    pins: lv.pins.length,
    intended: intended.clean ? 'clean' : intended.solved ? 'messy' : 'FAILS',
    pass: won / TRIALS,
    waste: waste / TRIALS,
  });
  process.stdout.write('.');
}
process.stdout.write('\n\n');

console.log('level  family     pins  intended  random-order pass  avg waste');
for (const r of rows) {
  console.log(
    `${String(r.id).padStart(5)}  ${r.family.padEnd(9)}  ${String(r.pins).padStart(4)}  ` +
      `${r.intended.padEnd(8)}  ${`${Math.round(r.pass * 100)}%`.padStart(17)}  ${r.waste.toFixed(1).padStart(9)}`
  );
}

const half = Math.ceil(rows.length / 2);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const early = rows.slice(0, half);
const late = rows.slice(half);
console.log(
  `\nrandom-order pass rate   first half ${(mean(early.map((r) => r.pass)) * 100).toFixed(0)}%  ` +
    `second half ${(mean(late.map((r) => r.pass)) * 100).toFixed(0)}%`
);
console.log(
  `waste from a wrong order first half ${mean(early.map((r) => r.waste)).toFixed(1)}  ` +
    `second half ${mean(late.map((r) => r.waste)).toFixed(1)}`
);
const broken = rows.filter((r) => r.intended === 'FAILS');
if (broken.length) console.log(`\n! ${broken.length} level(s) fail their own hint: ${broken.map((r) => r.id).join(', ')}`);
