/**
 * CAT-0: generates static/models/gltf/generic-human.glb by driving the real
 * /character Export-to-Catalogue flow in a headless browser (Playwright).
 *
 * This exercises the actual production code path (ProceduralHumanoid with
 * default params → exportCharacterGLB → GLTFExporter) rather than
 * reimplementing the export logic in Node, so the bundled asset is guaranteed
 * to match what a user gets from a fresh /character session with zero tuning.
 *
 * Usage:
 *   node scripts/exportGenericHuman.mjs
 *
 * Requires the dev server NOT already running on the target port (this script
 * starts and stops its own instance).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'static/models/gltf/generic-human.glb');
const PORT = 5183;
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('Dev server did not start in time'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function main() {
  console.log('Starting dev server...');
  const devServer = spawn('yarn', ['dev', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
    detached: true,
  });
  devServer.stdout.on('data', (d) => process.stdout.write(`[dev] ${d}`));
  devServer.stderr.on('data', (d) => process.stderr.write(`[dev] ${d}`));

  try {
    await waitForServer(BASE_URL);
    console.log('Dev server up. Launching headless Chromium...');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', (msg) => console.log(`[page] ${msg.text()}`));
    page.on('pageerror', (err) => console.error(`[page error] ${err}`));

    await page.goto(`${BASE_URL}/character`, { waitUntil: 'networkidle' });

    console.log('Waiting for humanoid to finish loading...');
    await page.waitForSelector('.overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
    // Give the render loop and clip wiring a moment to settle.
    await page.waitForTimeout(1000);

    console.log('Clicking Export to Catalogue...');
    await page.click('button.export-btn');

    // Wait for the status message to confirm the export completed.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.status-msg');
        return el && /exported|updated/i.test(el.textContent ?? '');
      },
      { timeout: 15000 },
    );
    console.log('Export confirmed by status message.');

    // Pull the newly-written GLB straight out of OPFS as base64.
    const base64 = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const assetsDir = await root.getDirectoryHandle('assets');
      const metaFile = await (await assetsDir.getFileHandle('assets-meta.json')).getFile();
      const meta = JSON.parse(await metaFile.text());
      if (meta.length === 0) throw new Error('No entries in assets-meta.json after export');
      // Most recently added entry is the one we just exported.
      const latest = meta.reduce((a, b) => (a.addedAt > b.addedAt ? a : b));
      const glbFile = await (await assetsDir.getFileHandle(latest.filename)).getFile();
      const buf = await glbFile.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    });

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, Buffer.from(base64, 'base64'));
    console.log(`Wrote ${OUT_PATH} (${fs.statSync(OUT_PATH).size} bytes)`);

    await browser.close();
  } finally {
    console.log('Stopping dev server...');
    try {
      process.kill(-devServer.pid, 'SIGTERM');
    } catch {
      devServer.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
