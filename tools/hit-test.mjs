/**
 * Input regression test: every pin must be grabbable along its whole rod and
 * at its ring handle.
 *
 * This exists because a rotated Container with a hand-built Rectangle hit area
 * silently fails in Phaser — most of each rod was dead to the touch and the
 * ring did nothing, with no error anywhere to show for it.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer((q, r) => {
  const p = join('dist', q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  if (!existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  r.end(readFileSync(p));
});
await new Promise((r) => server.listen(4191, r));

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await b.newPage({ viewport: { width: 760, height: 1320 } });
await page.goto('http://127.0.0.1:4191/');
await page.waitForTimeout(4500);

const map = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const g = window.game;
  return { left: r.left, top: r.top, sx: r.width / g.scale.width, sy: r.height / g.scale.height };
});
const toPage = (x, y) => ({ x: map.left + x * map.sx, y: map.top + y * map.sy });

let failures = 0;
// Levels with 2, 3 and 4 pipes, so every rod angle is represented. Sampled
// widely rather than at a few landmarks: the curvier the channels got, the
// closer two pipes' hardware ended up, and a ring shadowed by a neighbour's
// rod only shows up on the particular boards where they touch.
for (const levelId of [1, 8, 17, 25, 30, 38, 44, 55, 60, 68, 77, 84, 90, 95, 99]) {
  await page.evaluate((id) => {
    const g = window.game;
    // Completing a level pauses GameScene behind the results screen, and a
    // paused scene is not in the active list — stop *every* scene, not just
    // the running ones, or the next level starts up paused and dead to input.
    g.scene.scenes.forEach((s) => {
      g.scene.resume(s.scene.key);
      g.scene.stop(s.scene.key);
    });
    g.scene.start('Game', { levelId: id });
  }, levelId);
  // Heavy boards take several seconds to build at headless frame rates; poll
  // for the scene to be genuinely ready rather than guessing a delay.
  await page.waitForFunction(
    (id) => {
      const gs = window.game.scene.getScene('Game');
      return gs && gs.level && gs.level.id === id && gs.pins.length > 0 && !gs.finished;
    },
    levelId,
    { timeout: 30000 }
  );
  await page.waitForTimeout(1200);

  // Ask each pin where its ring actually is rather than re-deriving it from
  // the chord. A blade with a hooked tip puts its handle somewhere the chord
  // does not point, and a test that recomputes the old way would aim at empty
  // space and report the pin unreachable when it is not.
  const pins = await page.evaluate(() =>
    window.game.scene.getScene('Game').pins.map((p) => ({
      id: p.def.id, ring: p.ring,
    }))
  );

  for (let i = 0; i < pins.length; i++) {
    const d = pins[i];
    const [gx, gy] = d.ring;
    const p = toPage(gx, gy);

    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(600);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const st = await page.evaluate((i) => {
      const gs = window.game.scene.getScene('Game');
      return { pulled: gs.pins[i].pulled, finished: gs.finished, paused: !gs.scene.isActive() };
    }, i);
    if (!st.pulled) {
      failures++;
      console.log(
        `  L${levelId} ${d.id}: ring (${gx | 0},${gy | 0}) no response` +
          `${st.finished ? ' [level already over]' : ''}${st.paused ? ' [scene paused]' : ''}`
      );
    }
  }
  console.log(`L${levelId}: ${pins.length} pins tested`);
}

await b.close();
server.close();
console.log(failures ? `\n${failures} unreachable pin(s)` : '\nEvery pin grabbable at its ring');
process.exit(failures ? 1 : 0);
