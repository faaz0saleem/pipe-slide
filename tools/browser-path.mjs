/**
 * Where this container keeps its Chromium.
 *
 * The path carries a build number that changes when the image is rebuilt —
 * /opt/pw-browsers/chromium-1194/chrome-linux/chrome became
 * /opt/pw-browsers/chromium-1243/chrome-linux64/chrome across one restart,
 * which broke every tool that had it written in. Look it up instead.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/opt/pw-browsers';

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dirs = existsSync(ROOT)
    ? readdirSync(ROOT).filter((d) => d.startsWith('chromium')).sort().reverse()
    : [];
  for (const d of dirs) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(ROOT, d, sub);
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`no Chromium found under ${ROOT} — set CHROME_PATH`);
}
