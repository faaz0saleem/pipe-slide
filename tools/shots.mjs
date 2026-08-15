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
  await page.evaluate(setup, name.startsWith('level-') ? Number(name.split('-')[1]) : 0);
  await page.waitForTimeout(6000);
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


for (const id of [4, 12, 22, 40, 55, 78]) {
  await shot(`level-${id}`, (lv)=>{ const g=window.game;
    g.scene.getScenes(true).forEach(s=>s.scene.stop()); g.scene.start('Game',{levelId:lv}); }, 90);
}
if (0) await shot('map', ()=>{ const g=window.game; g.scene.getScenes(true).forEach(s=>s.scene.stop()); g.scene.start('Map',{focus:1}); });
if (0) await shot('shop', ()=>{ const g=window.game; g.scene.getScenes(true).forEach(s=>s.scene.stop()); g.scene.start('Shop',{from:'Menu'}); });

await browser.close(); server.close(); process.exit(0);
