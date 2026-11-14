// Screenshots of every region (day and night) plus a frame-rate measurement on High and Low.
// Run after a build:  node tests/shots.mjs <out-folder> [soft|igpu|dgpu] [high|low|both]
//   soft = SwiftShader (no GPU, like the playthrough test), igpu = integrated GPU, dgpu = discrete GPU.
//   igpu and dgpu drive Microsoft Edge, because Playwright's own Chromium has no GPU in headless mode.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'tests/shots';
const gpu = process.argv[3] || 'soft';
const which = process.argv[4] || 'both';
mkdirSync(out, { recursive: true });
const launch = gpu === 'soft'
  ? { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
  : { channel: 'msedge', args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', ...(gpu === 'dgpu' ? ['--force_high_performance_gpu'] : [])] };

// A truck with every part fitted, engine running, parked next to the player (for the night shot).
const TRUCK = (x, z, yaw) => `const v=g.vehicle; v.slots.battery={id:'battery',cond:80}; v.slots.wheelFR={id:'wheel_worn',cond:60}; v.slots.wheelRL={id:'wheel_worn',cond:60};
  if (v.slots.engine) v.slots.engine.cond=70; v.fuel=20; v.x=${x}; v.z=${z}; v.yaw=${yaw}; v.vx=v.vz=0; v.syncParts(); v.engineOn=true;`;
// name, player x, z, time of day (0.5 = noon), extra setup
const SPOTS = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [
  ['scrapyard', -6, 4, 0.42, TRUCK(2, -2.5, 0) + 'v.engineOn=false;'],
  ['forest', 40, -50, 0.45],
  ['fuel-station', 112, -3, 0.5],
  ['town-day', 212, 0, 0.52],
  ['town-night', 212, 0, 0.93, TRUCK(217, 7.5, Math.PI)],
  ['dead-stretch', 336, 9, 0.56],
];

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ERR_|Failed to load resource|fonts|GPU stall|GL Driver Message/.test(m.text())) errs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('PE ' + e.message));
const t0 = Date.now();
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForFunction(() => window.__rustbound, null, { timeout: 120000 });
const loadMs = Date.now() - t0;
const info = await page.evaluate(() => {
  const g = window.__rustbound; g.autoRun = false; g.newGame(); g.qualityLocked = true;
  const gl = g.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?', pack: !!g.player.model.pack };
});
const report = { gpu, renderer: info.renderer, pack: info.pack, loadMs, fps: {} };
console.log(`renderer: ${info.renderer}\nmodels loaded: ${info.pack}  page ready in ${(loadMs / 1000).toFixed(1)} s`);

for (const q of which === 'both' ? ['high', 'low'] : [which]) {
  report.fps[q] = {};
  for (const [name, x, z, t, setup] of SPOTS) {
    await page.evaluate(([x, z, q, t, setup]) => {
      const g = window.__rustbound;
      g.setQuality(q); g.resize();
      g.vehicle.reset?.(); g.player.driving = false;
      if (setup) new Function('g', setup)(g);
      const hold = () => { g.player.x = x; g.player.z = z; g.survival.health = 100; g.env.time = t; };
      hold(); g.cameraRig.update(0, true);
      for (let i = 0; i < 200; i++) { hold(); g.tick(1 / 60); } // let haze, lights and animations settle
      hold(); g.cameraRig.update(0, true); g.tick(1 / 60);
    }, [x, z, q, t, setup ?? null]);
    await page.screenshot({ path: `${out}/${name}-${q}.png` });
    // Frame time with the GPU work included (gl.finish waits for it). Not capped by the display.
    const ms = await page.evaluate(([x, z, t]) => {
      const g = window.__rustbound, gl = g.renderer.getContext();
      const hold = () => { g.player.x = x; g.player.z = z; g.survival.health = 100; g.env.time = t; };
      for (let i = 0; i < 20; i++) { hold(); g.tick(1 / 60); }
      gl.finish();
      const n = 120, s = performance.now();
      for (let i = 0; i < n; i++) { hold(); g.tick(1 / 60); gl.finish(); }
      return (performance.now() - s) / n;
    }, [x, z, t]);
    report.fps[q][name] = Math.round(1000 / ms);
    console.log(`${q.padEnd(4)} ${name.padEnd(13)} ${ms.toFixed(1).padStart(6)} ms/frame  = ${Math.round(1000 / ms)} fps uncapped`);
  }
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
if (errs.length) console.log('console errors:\n' + [...new Set(errs)].slice(0, 10).join('\n'));
await browser.close();
