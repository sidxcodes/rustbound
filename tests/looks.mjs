import { chromium } from 'playwright';
import { resolve } from 'node:path';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, w, h] of [['title-desktop', 1280, 720], ['title-phone', 400, 800]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('file://' + resolve('dist/index.html'));
  await page.waitForFunction(() => window.__rustbound);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  if (w === 400) console.log('phone overflow px:', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  if (w === 1280) {
    await page.click('[data-act="new"]');
    await page.evaluate(() => { const g = window.__rustbound; g.env.time = 0.92; g.player.x = 196; g.player.z = 6; g.vehicle.x = 200; g.vehicle.z = 9; g.cameraRig.update(0, true); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/night-town.png` });
  }
  await page.close();
}
await browser.close();
