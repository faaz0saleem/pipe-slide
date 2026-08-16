/**
 * Capture PNGs of a few scenes so the art can be reviewed without playing.
 *
 * The waits are generous on purpose: headless chromium runs on software GL at
 * a few frames a second, and a heavy scene will screenshot blank if you grab
 * it before its first frame lands.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css' };
const server = createServer((req,res)=>{
  const p = join('dist', req.url==='/'?'index.html':req.url.split('?')[0]);
  if(!existsSync(p)){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});
  res.end(readFileSync(p));
});
await new Promise(r=>server.listen(4199,r));
mkdirSync('shots',{recursive:true});

const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1280,height:800}, deviceScaleFactor:1 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log('CONSOLE:', m.text()); });
await page.goto('http://127.0.0.1:4199/');
await page.waitForTimeout(3000);

const shot = async (name, setup, settleSteps=0) => {
  /*
   * Reload before every capture.
   *
   * Restarting scenes in the same page eventually stops painting: after a few
   * cycles the Game scene builds correctly — right number of children, camera
   * untouched — and renders nothing at all, while the HUD scene beside it
   * still draws. A level that comes out blank in a batch renders in full when
   * it is the first scene of a session, so this is the headless software-GL
   * context giving up on repeated teardowns, not the level. Reloading costs a
   * few seconds each and makes the captures deterministic.
   *
   * It does not rescue a bonus round: a hundred and fifty coins is more than
   * this renderer will paint however long you wait, which thinning the same
   * scene to twenty sprites confirms. Shoot those in a real browser.
   */
  await page.goto('http://127.0.0.1:4199/');
  await page.waitForFunction(() => !!window.game?.scene?.getScene('Menu'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  await page.evaluate(setup, name.startsWith('level-') ? Number(name.split('-')[1]) : 0);
  // Wait for the scene to be built and *then* for frames to be drawn. A fixed
  // delay captured half-built stages; counting frames alone is not enough
  // either, because game.loop.frame is global and keeps ticking while the new
  // scene is still booting, so it can clear before anything has been painted.
  if (name.startsWith('level-')) {
    await page.waitForFunction(() => {
      const gs = window.game?.scene?.getScene('Game');
      return !!(gs && gs.pipes && gs.pins?.length);
    }, null, { timeout: 60000, polling: 250 });
  }
  const drawn = await page.evaluate(() => window.game.loop.frame);
  await page.waitForFunction((f0) => window.game.loop.frame > f0 + 6, drawn, {
    timeout: 90000,
    polling: 250,
  });
  await page.waitForTimeout(1500);
  if (settleSteps) {
    await page.evaluate((n)=>{ const gs=window.game.scene.getScene('Game');
      if (!gs || !gs.matter || !gs.matter.world) return;
      for(let i=0;i<n;i++) gs.matter.world.step(1000/60); }, settleSteps);
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path:`shots/${name}.png` });
  console.log('shot', name);
};


// Two, three and four pipes across the difficulty range. No bonus rounds:
// see the note in shot() — they cannot be captured here.
for (const id of [4, 12, 22, 44, 55, 78, 99]) {
  await shot(`level-${id}`, (lv)=>{ const g=window.game;
    g.scene.getScenes(true).forEach(s=>s.scene.stop()); g.scene.start('Game',{levelId:lv}); }, 90);
}
if (0) await shot('map', ()=>{ const g=window.game; g.scene.getScenes(true).forEach(s=>s.scene.stop()); g.scene.start('Map',{focus:1}); });
if (0) await shot('shop', ()=>{ const g=window.game; g.scene.getScenes(true).forEach(s=>s.scene.stop()); g.scene.start('Shop',{from:'Menu'}); });

await browser.close(); server.close(); process.exit(0);
