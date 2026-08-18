/**
 * Static sanity checks for public/levels/levels.json.
 *
 * Catches the mistakes that are expensive to find by playing: payloads with
 * no matching pit, pits that expect more items than exist, geometry that
 * escapes the world, spawn groups that start life overlapping a wall, and
 * hint sequences that name pins which do not exist.
 *
 * Run with:  npm run verify
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(__dirname, '../public/levels/levels.json'), 'utf8'));

const errors = [];
const warnings = [];

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Shortest distance from a point to a segment. */
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

for (const lv of doc.levels) {
  const at = (msg) => `L${lv.id} (${lv.family}): ${msg}`;

  /* --- structure ------------------------------------------------- */
  if (!lv.walls.length) errors.push(at('no walls'));
  if (!lv.pins.length) errors.push(at('no pins'));
  if (!lv.receivers.length) errors.push(at('no receivers'));
  if (!lv.spawns.length) errors.push(at('no spawns'));

  /* --- pins ------------------------------------------------------- */
  const pinIds = new Set();
  for (const p of lv.pins) {
    if (pinIds.has(p.id)) errors.push(at(`duplicate pin id ${p.id}`));
    pinIds.add(p.id);
    if (![p.x, p.y, p.len, p.thick, p.angle].every(num)) errors.push(at(`pin ${p.id} has bad numbers`));
    if (p.len < 40) errors.push(at(`pin ${p.id} is absurdly short (${p.len})`));
    if (!Array.isArray(p.out) || p.out.length !== 2) errors.push(at(`pin ${p.id} has no pull direction`));
    for (const req of p.requires) {
      if (!lv.pins.some((q) => q.id === req)) errors.push(at(`pin ${p.id} requires missing pin ${req}`));
    }
  }

  /* --- hint sequence ---------------------------------------------- */
  if (!lv.solution.length) errors.push(at('empty solution'));
  for (const id of lv.solution) {
    if (!pinIds.has(id)) errors.push(at(`solution names missing pin ${id}`));
  }
  const solSet = new Set(lv.solution);
  if (solSet.size !== lv.solution.length) errors.push(at('solution repeats a pin'));
  /*
   * A gate the solution never pulls should be a trap, and every trap should be
   * such a gate. Both halves matter: a trap the hint order pulls teaches the
   * player the opposite of the lesson, and a gate omitted with a *deliverable*
   * group behind it means those items can never arrive and the pit will be
   * short through no fault of the player.
   *
   * The generator emits one spawn group per gate, in gate order, so the two
   * lists line up index for index. Bonus rounds do not follow that shape.
   */
  if (!lv.bonus) {
    const gates = lv.pins.filter((p) => p.kind === 'gate');
    if (gates.length !== lv.spawns.length) {
      errors.push(at(`${gates.length} gates but ${lv.spawns.length} payload groups`));
    } else {
      gates.forEach((g, i) => {
        const isTrap = !!lv.spawns[i].trap;
        if (isTrap && solSet.has(g.id)) errors.push(at(`solution pulls trap gate ${g.id}`));
        if (!isTrap && !solSet.has(g.id)) {
          errors.push(at(`gate ${g.id} is never pulled but its group is deliverable`));
        }
      });
    }
  }
  for (const p of lv.pins) {
    if (!solSet.has(p.id) && p.kind !== 'gate') {
      warnings.push(at(`pin ${p.id} is never used by the solution`));
    }
  }

  /* --- receivers vs spawns ---------------------------------------- */
  // Trap groups are stacked too high to ever reach their pit, so they are not
  // part of what a pit could be asked for. Counting them made every trap level
  // look as though its quotas were far too generous.
  const totals = {};
  const decoys = {};
  for (const s of lv.spawns) {
    // A gate with nothing behind it is a pin that does nothing, which teaches
    // the player that pins may be meaningless.
    if (!s.items.length) errors.push(at(`empty ${s.type} group — its gate does nothing`));
    const bucket = s.trap ? decoys : totals;
    bucket[s.type] = (bucket[s.type] || 0) + s.items.length;
    if (!doc.payloads[s.type]) errors.push(at(`unknown payload type ${s.type}`));
  }
  const accepted = new Set();
  for (const r of lv.receivers) {
    // A lava trough accepts nothing on purpose: it destroys what lands in it,
    // so none of the quota checks below apply to it.
    if (r.hazard) {
      if (r.required !== 0) errors.push(at('lava trough has a quota'));
      continue;
    }
    if (accepted.has(r.accepts)) errors.push(at(`two pits both accept ${r.accepts}`));
    accepted.add(r.accepts);
    const available = totals[r.accepts] || 0;
    if (r.required > available) {
      errors.push(at(`pit ${r.kind} wants ${r.required} but only ${available} spawn`));
    }
    // Non-bonus pits leave a few spare items so a wrong pull wastes rather
    // than dead-ends, but they must still ask for most of the group.
    // Decoys must stay the minority of any item, or the board reads as a pile
    // of things you cannot use rather than a puzzle with a trap in it.
    const decoy = decoys[r.accepts] || 0;
    if (decoy >= available) {
      errors.push(at(`pit ${r.kind}: ${decoy} decoy ${r.accepts} vs only ${available} reachable`));
    }
    if (!lv.bonus && r.required < Math.ceil(available * 0.45)) {
      errors.push(at(`pit ${r.kind} only wants ${r.required} of ${available} — too generous`));
    }
    if (r.required === 0) errors.push(at(`pit ${r.kind} has nothing to catch`));
    if (r.x - r.w / 2 < -4 || r.x + r.w / 2 > doc.world.width + 4) {
      errors.push(at(`pit ${r.kind} is off-screen (${r.x} ± ${r.w / 2})`));
    }
    if (r.top >= r.bottom) errors.push(at(`pit ${r.kind} is inside-out`));
  }
  for (const type of Object.keys(totals)) {
    if (!accepted.has(type)) errors.push(at(`payload ${type} has nowhere to go`));
  }

  /* --- geometry in bounds ------------------------------------------ */
  for (const w of lv.walls) {
    for (const [x, y] of w.points) {
      if (!num(x) || !num(y)) errors.push(at('wall has bad coordinates'));
      if (x < -60 || x > doc.world.width + 60 || y < 0 || y > doc.world.height + 60) {
        errors.push(at(`wall point out of world (${x}, ${y})`));
      }
    }
    if (w.points.length < 2) errors.push(at('wall with fewer than 2 points'));
  }

  /* --- spawns are clear of walls and each other -------------------- */
  const placed = [];
  for (const s of lv.spawns) {
    for (const [x, y] of s.items) {
      if (x - s.r < -2 || x + s.r > doc.world.width + 2) {
        errors.push(at(`${s.type} spawns outside the world at x=${x}`));
      }
      for (const w of lv.walls) {
        for (let i = 0; i < w.points.length - 1; i++) {
          const [x0, y0] = w.points[i];
          const [x1, y1] = w.points[i + 1];
          const d = distToSeg(x, y, x0, y0, x1, y1);
          if (d < s.r + w.t / 2 - 1) {
            errors.push(at(`${s.type} at (${x},${y}) starts inside a wall (gap ${d.toFixed(1)})`));
          }
        }
      }
      for (const p of lv.pins) {
        const a = (p.angle * Math.PI) / 180;
        const hx = (Math.cos(a) * p.len) / 2;
        const hy = (Math.sin(a) * p.len) / 2;
        const d = distToSeg(x, y, p.x - hx, p.y - hy, p.x + hx, p.y + hy);
        if (d < s.r + p.thick / 2 - 1) {
          errors.push(at(`${s.type} at (${x},${y}) starts inside pin ${p.id}`));
        }
      }
      for (const [px, py, pr] of placed) {
        if (Math.hypot(px - x, py - y) < pr + s.r - 1) {
          errors.push(at(`${s.type} at (${x},${y}) overlaps another payload`));
        }
      }
      placed.push([x, y, s.r]);
    }
  }

  /* --- pegs (bonus levels) ------------------------------------------ */
  for (const peg of lv.pegs) {
    if (!num(peg.x) || !num(peg.y) || !num(peg.r)) errors.push(at('peg has bad numbers'));
  }
}

/* --- progression shape ---------------------------------------------- */
const bonusIds = doc.levels.filter((l) => l.bonus).map((l) => l.id);
const expected = Array.from({ length: 10 }, (_, i) => (i + 1) * 10);
if (bonusIds.join(',') !== expected.join(',')) {
  errors.push(`bonus levels are ${bonusIds.join(',')}, expected ${expected.join(',')}`);
}
if (doc.levels.length !== 100) errors.push(`expected 100 levels, got ${doc.levels.length}`);

/* --- report ---------------------------------------------------------- */
const byFamily = {};
for (const l of doc.levels) byFamily[l.family] = (byFamily[l.family] || 0) + 1;

console.log('Family mix:', byFamily);
console.log(
  'Payload totals:',
  doc.levels.reduce((n, l) => n + l.spawns.reduce((m, s) => m + s.items.length, 0), 0)
);

const uniqWarn = [...new Set(warnings)];
if (uniqWarn.length) {
  console.log(`\n${uniqWarn.length} warning(s):`);
  uniqWarn.slice(0, 20).forEach((w) => console.log('  ! ' + w));
}

if (errors.length) {
  const uniq = [...new Set(errors)];
  console.error(`\n${uniq.length} error(s):`);
  uniq.slice(0, 40).forEach((e) => console.error('  x ' + e));
  process.exit(1);
}
console.log('\nAll 100 levels verified.');
