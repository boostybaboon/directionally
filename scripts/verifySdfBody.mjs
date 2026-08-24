/**
 * Smoke-check the body modes in the real /character page: load, toggle
 * "Loft", and confirm the scene renders (screenshot byte-size heuristic)
 * with no runtime/shader errors. Run: node scripts/verifySdfBody.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 5190;
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) return resolve();
      } catch { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('Dev server did not start in time'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function main() {
  const devServer = spawn('yarn', ['dev', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: 'pipe', detached: true,
  });
  devServer.stdout.on('data', (d) => process.stdout.write(`[dev] ${d}`));
  devServer.stderr.on('data', (d) => process.stderr.write(`[dev] ${d}`));

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await page.goto(`${BASE_URL}/character`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const tubes = await page.screenshot({ type: 'png' });

    await page.click('button:has-text("Loft")', { force: true });
    await page.waitForTimeout(2500);
    const loft = await page.screenshot({ type: 'png' });

    console.log('tubes.png bytes:', tubes.length);
    console.log('loft.png  bytes:', loft.length);
    console.log('errors:', errors.length ? errors.join('\n') : 'none');
    await browser.close();
  } finally {
    try { process.kill(-devServer.pid, 'SIGTERM'); } catch { devServer.kill('SIGTERM'); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

