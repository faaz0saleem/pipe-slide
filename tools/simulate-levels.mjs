/**
 * Headless playthrough of every level — the build gate.
 *
 * Run with:  npm run simulate            (all levels)
 *            npm run simulate -- 7 12    (just those)
 *            TRACE=1 npm run simulate -- 7
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateLevel } from './solver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(__dirname, '../public/levels/levels.json'), 'utf8'));

const args = process.argv.slice(2).map(Number).filter(Boolean);
const targets = args.length ? doc.levels.filter((l) => args.includes(l.id)) : doc.levels;

const failures = [];
const messy = [];
const t0 = Date.now();

for (const lv of targets) {
  const r = simulateLevel(lv, { verbose: args.length === 1 });
  if (!r.solved) {
    failures.push(r);
    const pits = r.receivers.map((p) => `${p.accepts} ${p.got}/${p.need}`).join(', ');
    console.log(
      `L${String(r.id).padStart(3)} ${r.family.padEnd(10)} FAIL  ${pits}` +
        `${r.wrong ? `  wrong:${r.wrongDetail.join(',')}` : ''}` +
        `${r.lost ? `  lost:${r.lost}` : ''}${r.stuck ? `  stuck:${r.stuck}` : ''}`
    );
  } else {
    if (!r.clean) messy.push(r);
    if (args.length) console.log(`L${r.id} ${r.family} OK${r.clean ? ' (clean)' : ''}`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `\n${targets.length - failures.length}/${targets.length} levels solved by their recorded hint order (${secs}s)`
);
if (messy.length) {
  console.log(`${messy.length} solved but wasted something following their own hint`);
}
if (failures.length) process.exit(1);
