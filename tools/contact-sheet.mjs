/**
 * Draw all 100 levels onto one page.
 *
 * Booting the game once per level takes twenty-five minutes and cannot render
 * a bonus round at all in headless software GL, which makes it useless as a
 * review tool. Drawing straight from the level data instead is instant, works
 * for every level including the coin rushes, and shows the thing under review
 * exactly: the glassware, where the rods sit, and where the payload starts.
 *
 * It is a plate, not a screenshot — no backdrop, no characters, no lighting.
 * If a level looks wrong here it is wrong in the game.
 *
 * Run with:  npm run sheet
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(__dirname, '../public/levels/levels.json'), 'utf8'));
const OUT = resolve(__dirname, '../level-sheet.html');

const W = doc.world.width;
const H = doc.world.height;

const TYPE_COLOR = {
  coal: '#46505f',
  apple: '#d8524d',
  gem: '#3fb2d6',
  coin: '#d99a1b',
  bomb: '#7c5cd6',
};

const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

/** One channel: tinted bore between two rims, capped if it is a sealed vessel. */
function channel(t) {
  const ring = [...t.left, ...t.right.slice().reverse()];
  const rims = [t.left, t.right].map(
    (side) => `<polyline points="${side.map(pt).join(' ')}" class="rim"/>`
  );
  if (t.cap) rims.push(`<polyline points="${pt(t.left[0])} ${pt(t.right[0])}" class="rim"/>`);
  return `<polygon points="${ring.map(pt).join(' ')}" class="bore"/>${rims.join('')}`;
}

/**
 * A rod with its ring handle, so gate placement is reviewable at a glance.
 *
 * A blade carries a spine and is stroked along it — the whole point of this
 * plate is to be able to see, across ninety levels at once, that the machine
 * at the bottom is a different shape every time.
 */
function pin(p) {
  const a = (p.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hx = (cos * p.len) / 2;
  const hy = (sin * p.len) / 2;
  const r = p.thick * 1.05;
  const side = Math.sign(p.out[0] * cos + p.out[1] * sin) || 1;
  const reach = side * (p.len / 2 + r * 0.9);
  const ramp = p.kind === 'ramp' ? ' ramp' : '';
  const body =
    p.spine && p.spine.length > 1
      ? `<polyline points="${p.spine.map(pt).join(' ')}" class="rod${ramp}" ` +
        `stroke-width="${p.thick}" fill="none"/>`
      : `<line x1="${(p.x - hx).toFixed(1)}" y1="${(p.y - hy).toFixed(1)}" ` +
        `x2="${(p.x + hx).toFixed(1)}" y2="${(p.y + hy).toFixed(1)}" ` +
        `class="rod${ramp}" stroke-width="${p.thick}"/>`;
  return (
    body +
    `<circle cx="${(p.x + cos * reach).toFixed(1)}" cy="${(p.y + sin * reach).toFixed(1)}" ` +
    `r="${r.toFixed(1)}" class="ring${ramp}"/>`
  );
}

function plate(lv) {
  const paired = new Set(lv.tubes.flatMap((t) => [t.left, t.right]));
  const bars = lv.walls
    .filter((w) => !paired.has(w.points))
    .map((w) => `<polyline points="${w.points.map(pt).join(' ')}" class="bar" stroke-width="${w.t}"/>`)
    .join('');
  const walls = lv.tubes.map(channel).join('');
  const pegs = (lv.pegs || [])
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" class="peg"/>`)
    .join('');
  const pits = lv.receivers
    .map((r) =>
      r.hazard
        ? `<rect x="${(r.x - r.w / 2).toFixed(1)}" y="${r.top}" width="${r.w}" ` +
          `height="${(r.bottom - r.top).toFixed(1)}" class="lava"/>`
        : `<rect x="${(r.x - r.w / 2).toFixed(1)}" y="${r.top}" width="${r.w}" ` +
          `height="${(r.bottom - r.top).toFixed(1)}" class="pit" ` +
          `stroke="${TYPE_COLOR[r.accepts] || '#888'}"/>`
    )
    .join('');
  // Decoys are drawn hollow: they are the groups the player must recognise and
  // leave alone, so a sheet that draws them the same as everything else hides
  // the one thing worth reviewing.
  const items = lv.spawns
    .map((s) =>
      s.items
        .map(([x, y]) =>
          s.trap
            ? `<circle cx="${x}" cy="${y}" r="${s.r - 2}" fill="none" stroke-width="4" stroke="${TYPE_COLOR[s.type] || '#888'}"/>`
            : `<circle cx="${x}" cy="${y}" r="${s.r}" fill="${TYPE_COLOR[s.type] || '#888'}"/>`
        )
        .join('')
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Level ${lv.id} layout">
${bars}${walls}${pegs}${pits}${items}${lv.pins.map(pin).join('')}</svg>`;
}

/**
 * The numbers worth scanning when hunting repeats, and the composition key two
 * levels have to share before they read as the same board.
 */
function readout(lv) {
  const inlets = lv.tubes.filter((t) => t.cap);
  const per = {};
  for (const p of lv.pins) {
    const m = /^g(\d+)_/.exec(p.id);
    if (m) per[m[1]] = (per[m[1]] || 0) + 1;
  }
  const lens = inlets.map((t) => {
    const ys = t.left.map((p) => p[1]);
    return Math.round(Math.max(...ys) - Math.min(...ys));
  });
  const ends = inlets.map((t) => Math.round(t.left.at(-1)[1] / 60) * 60);
  return {
    pipes: inlets.length,
    gates: Object.values(per),
    lens,
    key: `${inlets.length}|${lens.map((n) => Math.round(n / 60) * 60).sort().join()}|${ends.slice().sort().join()}`,
  };
}

const rows = doc.levels.map((lv) => ({ lv, ...readout(lv) }));

// Levels that share a composition are the ones most likely to read as repeats,
// so the sheet says which twin to compare against rather than making the
// reviewer find it. Bonus rounds are all one composition by design.
const byKey = new Map();
for (const r of rows) {
  if (r.lv.bonus) continue;
  if (!byKey.has(r.key)) byKey.set(r.key, []);
  byKey.get(r.key).push(r.lv.id);
}

const cards = rows
  .map(({ lv, pipes, gates, key }) => {
    const twins = (byKey.get(key) || []).filter((id) => id !== lv.id);
    const tag = lv.bonus
      ? '<span class="tag bonus">bonus</span>'
      : twins.length
        ? `<span class="tag twin">like ${twins.join(', ')}</span>`
        : '';
    const traps = lv.spawns.filter((s) => s.trap).length;
    const hasLava = lv.receivers.some((r) => r.hazard);
    const extras = [
      traps ? `${traps} decoy${traps > 1 ? 's' : ''}` : null,
      hasLava ? 'lava' : null,
    ].filter(Boolean);
    const data = lv.bonus
      ? `${lv.pins.length} pins`
      : `${pipes} pipes · ${lv.pins.length} pins · ${gates.join('/')} gates` +
        (extras.length ? ` · ${extras.join(' · ')}` : '');
    return `<figure${lv.bonus ? ' class="is-bonus"' : ''}>
  <div class="plate"><span class="no">${lv.id}</span>${plate(lv)}</div>
  <figcaption>
    <span class="name">${lv.name}</span>${tag}
    <span class="data">${data}</span>
  </figcaption>
</figure>`;
  })
  .join('\n');

const dupes = [...byKey.values()].filter((v) => v.length > 1).length;
const nonBonus = rows.filter((r) => !r.lv.bonus).length;

const html = `<title>Pipe Slide Level Sheet</title>
<style>
  /* Palette taken from the glass itself: a cool petrol ink on paper with a
     faint cyan cast, so the neutrals belong to the subject rather than being
     inherited greys. */
  :root {
    --paper: #eef4f7;
    --plate: #ffffff;
    --ink: #0f2231;
    --muted: #5b7385;
    --rule: #d2e0e8;
    --glass: #1a94c4;
    --bore: #dcedf5;
    --rod: #7d8ea0;
    --ramp: #b07a30;
    --amber: #9a6b12;
    --amber-bg: #f7edd6;
    --grid: rgba(15, 34, 49, .05);
    --lift: 0 1px 2px rgba(15, 34, 49, .07);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #08111a;
      --plate: #0f1c26;
      --ink: #dfeaf1;
      --muted: #86a0b2;
      --rule: #1d2f3d;
      --glass: #40a8d0;
      --bore: #12303f;
      --rod: #8d9dae;
      --ramp: #c08c3e;
      --amber: #d3a349;
      --amber-bg: #2a2113;
      --grid: rgba(223, 234, 241, .05);
      --lift: 0 1px 2px rgba(0, 0, 0, .5);
    }
  }
  :root[data-theme="dark"] {
    --paper: #08111a;
    --plate: #0f1c26;
    --ink: #dfeaf1;
    --muted: #86a0b2;
    --rule: #1d2f3d;
    --glass: #40a8d0;
    --bore: #12303f;
    --rod: #8d9dae;
    --ramp: #c08c3e;
    --amber: #d3a349;
    --amber-bg: #2a2113;
    --grid: rgba(223, 234, 241, .05);
    --lift: 0 1px 2px rgba(0, 0, 0, .5);
  }

  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1480px; margin: 0 auto; padding: 28px 24px 64px; }

  header { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px 32px; margin-bottom: 8px; }
  h1 { font-size: 21px; font-weight: 650; letter-spacing: -.015em; margin: 0; text-wrap: balance; }
  .lede { margin: 6px 0 0; color: var(--muted); max-width: 60ch; font-size: 14px; }
  .counts { display: flex; gap: 26px; margin-left: auto; }
  .counts div { display: flex; flex-direction: column; }
  .counts b {
    font: 600 19px/1.2 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }
  .counts span { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }

  .legend {
    display: flex; flex-wrap: wrap; gap: 6px 18px;
    margin: 22px 0 20px; padding: 12px 0;
    border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
    font-size: 12px; color: var(--muted);
  }
  .legend i { display: inline-flex; align-items: center; gap: 7px; font-style: normal; }
  .swatch { width: 11px; height: 11px; border-radius: 50%; }
  .stroke { width: 16px; height: 0; border-top: 3px solid; border-radius: 2px; }

  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); }

  figure {
    margin: 0; background: var(--plate);
    border: 1px solid var(--rule); border-radius: 5px;
    overflow: hidden; box-shadow: var(--lift);
  }
  figure.is-bonus { border-color: var(--amber); }

  /* Graph ground under each drawing: it reads as a plate and gives the eye a
     fixed scale to compare one board's channels against another's. */
  .plate {
    position: relative;
    background:
      repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 24px),
      repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 24px);
  }
  .no {
    position: absolute; top: 6px; left: 8px;
    font: 600 11px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  svg { display: block; width: 100%; height: auto; }

  figcaption { padding: 9px 10px 10px; border-top: 1px solid var(--rule); }
  .name { display: block; font-size: 12.5px; font-weight: 550; line-height: 1.3; }
  .data {
    display: block; margin-top: 3px;
    font: 10.5px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .tag {
    display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 3px;
    font: 600 10px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    letter-spacing: .04em;
  }
  .tag.bonus { background: var(--amber-bg); color: var(--amber); }
  .tag.twin { background: var(--bore); color: var(--glass); }

  .bore { fill: var(--bore); }
  .rim { fill: none; stroke: var(--glass); stroke-width: 7; stroke-linejoin: round; stroke-linecap: round; }
  .bar { fill: none; stroke: var(--glass); stroke-linejoin: round; stroke-linecap: round; opacity: .5; }
  .peg { fill: none; stroke: var(--glass); stroke-width: 4; }
  .pit { fill: none; stroke-width: 7; opacity: .5; }
  .lava { fill: #e2571f; opacity: .45; stroke: #b03a10; stroke-width: 6; }
  .rod { stroke: var(--rod); stroke-linecap: round; stroke-linejoin: round; fill: none; }
  .rod.ramp { stroke: var(--ramp); }
  .ring { fill: none; stroke: var(--rod); stroke-width: 6; }
  .ring.ramp { stroke: var(--ramp); }
</style>
<div class="wrap">
  <header>
    <div>
      <h1>Pipe Slide &mdash; every level</h1>
      <p class="lede">Drawn from the level data rather than screenshotted, so bonus
      rounds appear too. Glass channels, rods with their ring handles, payload start
      positions and pit mouths &mdash; if a board looks wrong here it is wrong in the game.</p>
    </div>
    <div class="counts">
      <div><b>${doc.levels.length}</b><span>levels</span></div>
      <div><b>${byKey.size}</b><span>compositions</span></div>
      <div><b>${dupes}</b><span>shared</span></div>
    </div>
  </header>

  <div class="legend">
    <i><span class="stroke" style="border-color:var(--glass)"></span>glass channel</i>
    <i><span class="stroke" style="border-color:var(--rod)"></span>gate rod</i>
    <i><span class="stroke" style="border-color:var(--ramp)"></span>diverter blade</i>
    <i><span class="swatch" style="background:${TYPE_COLOR.coal}"></span>coal</i>
    <i><span class="swatch" style="background:${TYPE_COLOR.apple}"></span>apples</i>
    <i><span class="swatch" style="background:${TYPE_COLOR.gem}"></span>gems</i>
    <i><span class="swatch" style="background:${TYPE_COLOR.coin}"></span>coins</i>
    <i><span class="swatch" style="background:${TYPE_COLOR.bomb}"></span>bombs</i>
    <i><span class="swatch" style="background:#e2571f"></span>lava &mdash; destroys anything that lands in it</i>
    <i><span class="swatch" style="background:transparent;border:3px solid #5b7385"></span>decoy: stacked too high to ever reach its pit</i>
    <i><span class="tag twin">like&nbsp;n</span>shares a composition with level n &mdash; check these first</i>
  </div>

  <div class="grid">
${cards}
  </div>
</div>`;

writeFileSync(OUT, html);
console.log(
  `Wrote ${OUT} (${(html.length / 1024 / 1024).toFixed(1)} MB)\n` +
    `${byKey.size} distinct compositions across ${nonBonus} non-bonus levels, ` +
    `${dupes} shared by more than one`
);
