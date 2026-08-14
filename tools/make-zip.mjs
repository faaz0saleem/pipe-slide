/** Zip dist/ into pipe-slide.zip for the CrazyGames upload form. */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('dist')) {
  console.error('dist/ missing — run `npm run build` first');
  process.exit(1);
}
execSync('cd dist && zip -qr ../pipe-slide.zip .', { stdio: 'inherit' });
console.log('Wrote pipe-slide.zip');
