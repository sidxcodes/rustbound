// Dev helper: screenshots of chosen spots. node tests/probe.mjs <outdir> '[[x,z,"name",time,zoom]]' [quality]
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ERR_|Failed to load resource|fonts/.test(m.text())) errs.push(m.text().slice(0, 300)); }); page.on('pageerror', (e) => errs.push('PE ' + e.message));
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForFunction(() => window.__rustbound, null, { timeout: 60000 });
await page.evaluate(() => { const g = window.__rustbound; g.autoRun = false; g.newGame(); });
const q = process.argv[4] || 'high';
for (const [x, z, name, t, zoom, setup] of JSON.parse(process.argv[3])) {
  await page.evaluate(([x, z, q, t, zoom, setup]) => { const g = window.__rustbound; g.qualityLocked = true; g.setQuality(q); g.resize(); g.player.x = x; g.player.z = z; if (t != null) g.env.time = t; if (zoom) g.cameraRig.zoom = zoom; if (setup) new Function('g', setup)(g); g.survival.health = 100;
    for (let i = 0; i < 20; i++) g.tick(0.016); g.player.x = x; g.player.z = z; g.cameraRig.update(0, true); g.tick(0.016); }, [x, z, q, t ?? null, zoom ?? null, setup ?? null]);
  await page.screenshot({ path: `${out}/p-${name}.png` });
}
console.log(await page.evaluate(() => JSON.stringify({ pack: !!window.__rustbound.player.model.pack, q: window.__rustbound.quality })));
console.log([...new Set(errs)].slice(0, 8).join('\n'));
await browser.close();
