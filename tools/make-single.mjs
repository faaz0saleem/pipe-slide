/**
 * Produce pipe-slide-standalone.html: the whole game in one file that runs
 * from a double-click, with no server and no network.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('npx vite build --config vite.single.config.js', { stdio: 'inherit' });

const js = readFileSync('dist-single/game.js', 'utf8');
const levels = readFileSync('public/levels/levels.json', 'utf8');
let html = readFileSync('dist-single/index.html', 'utf8');

/**
 * Splice by index rather than String.replace: a minified bundle is full of
 * `$&` and `$'` sequences, which replace() would treat as substitution
 * patterns and silently corrupt the output.
 */
function spliceTag(source, startMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`could not find ${startMarker} in index.html`);
  const end = source.indexOf('</script>', start);
  if (end === -1) throw new Error(`unterminated ${startMarker}`);
  return source.slice(0, start) + replacement + source.slice(end + '</script>'.length);
}

// The CrazyGames SDK is a no-op offline and its request just fails noisily.
html = spliceTag(html, '<script src="https://sdk.crazygames.com', '');
// Swap the module bundle reference for the inlined classic script.
html = spliceTag(
  html,
  '<script type="module"',
  `<script>window.__LEVELS__ = ${levels};</script>\n<script>${js}</script>`
);

if (html.includes('<script type="module"')) throw new Error('module script left in output');
if (!html.includes('window.__LEVELS__')) throw new Error('level data was not inlined');

writeFileSync('pipe-slide-standalone.html', html);
console.log(`Wrote pipe-slide-standalone.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
