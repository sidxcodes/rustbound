// Trees and bushes from Poly Haven are photo-scanned with every leaf and needle as real geometry
// (up to 4 million triangles per tree), far too heavy for a game that draws hundreds of them.
// This bakes each one into an "impostor": two crossed upright cards showing the plant from the side
// and one flat card showing it from above, each textured with a picture rendered from the real model.
// Output: src/assets/props/<key>.glb with one node per variant (extras: height, radius).
// Usage: node tools/bake-impostors.mjs [key ...]   (needs Microsoft Edge for GPU rendering; falls back
// to Playwright's software renderer, which is much slower)
import { chromium } from 'playwright';
import { build } from 'esbuild';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { mkdirSync, statSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { MODELS } from './assets.config.mjs';

const only = process.argv.slice(2);
const jobs = Object.entries(MODELS).filter(([k, m]) => m.impostor && (!only.length || only.includes(k)));
const page$ = (await build({ entryPoints: ['tools/bake/page.js'], bundle: true, format: 'iife', write: false, minify: true })).outputFiles[0].text;
mkdirSync('assets-src/impostors', { recursive: true });

let browser;
try { browser = await chromium.launch({ channel: 'msedge', args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--force_high_performance_gpu'] }); } catch { browser = await chromium.launch(); }
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error', e.message));
page.on('crash', () => console.log('page crashed'));
page.on('console', (m) => console.log('page:', m.text().slice(0, 200)));
page.on('requestfailed', (r) => console.log('request failed', r.url(), r.failure() && r.failure().errorText));
// A throwaway local web server streams the (very large) model files to the page. It serves only
// assets-src/polyhaven and listens on the loopback address only.
const ALLOWED = resolve('assets-src/polyhaven');
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
  if (p === 'index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0;background:#888"></body>'); return; }
  const file = resolve(p);
  if (!file.startsWith(ALLOWED) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-length': statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
await page.goto(`${origin}/index.html`);
await page.addScriptTag({ content: page$ });

const io = new NodeIO().registerExtensions([EXTTextureWebP]);
const dataUrl = (u) => Buffer.from(u.split(',')[1], 'base64');
for (const [key, { id, impostor, px = key === 'shrub' || key === 'fern' ? 512 : 1024 }] of jobs) {
  const t0 = Date.now();
  const results = await page.evaluate(([url, names, px]) => window.bakeImpostors(url, names, { px }), [`${origin}/assets-src/polyhaven/models/${id}/${id}.gltf`, impostor, px]);
  const doc = new Document(), buffer = doc.createBuffer();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const scene = doc.createScene(key);
  const accessor = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
  let kb = 0;
  for (const [i, r] of results.entries()) {
    if (r.error) { console.warn(`${key} ${r.name}: ${r.error}`); continue; }
    // side atlas: the two side views next to each other, at half the render size (smooths the edges)
    const s0 = await sharp(dataUrl(r.side0)).png().toBuffer(), meta = await sharp(s0).metadata();
    const w = Math.round(meta.width / 2), h = Math.round(meta.height / 2);
    const half = (b) => sharp(b).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    const side = await sharp({ create: { width: w * 2, height: h, channels: 4, background: { r: 60, g: 70, b: 48, alpha: 0 } } })
      .composite([{ input: await half(s0), left: 0, top: 0 }, { input: await half(dataUrl(r.side90)), left: w, top: 0 }]).png().toBuffer();
    const top = await sharp(dataUrl(r.top)).resize(px / 2, px / 2, { kernel: 'lanczos3' }).png().toBuffer();
    writeFileSync(`assets-src/impostors/${key}_${i}_side.png`, side);
    writeFileSync(`assets-src/impostors/${key}_${i}_top.png`, top);
    const webp = (b) => sharp(b).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
    const sideTex = doc.createTexture(`${key}_${i}_side`).setImage(await webp(side)).setMimeType('image/webp');
    const topTex = doc.createTexture(`${key}_${i}_top`).setImage(await webp(top)).setMimeType('image/webp');
    const mat = (name, tex) => doc.createMaterial(name).setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(0.45).setRoughnessFactor(1).setMetallicFactor(0);

    // Geometry. Each card is a 3x3 grid drawn front and back (single-sided, so the normals are not
    // flipped on the back). Normals lean outward and up, so the foliage shades like a rounded canopy.
    const R = r.radius, H = r.height;
    const P = [], N = [], U = [], I = [];
    const quad = (pt, nm, uv) => {
      const base = P.length / 3;
      for (let gy = 0; gy <= 2; gy++) for (let gx = 0; gx <= 2; gx++) { const a = gx / 2, b = gy / 2; P.push(...pt(a, b)); N.push(...nm(a, b)); U.push(...uv(a, b)); }
      for (const back of [false, true]) for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
        const q = base + gy * 3 + gx, t = [q, q + 1, q + 4, q, q + 4, q + 3];
        I.push(...(back ? [t[0], t[2], t[1], t[3], t[5], t[4]] : t));
      }
    };
    const norm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    // card A in the XY plane (seen from +z), card B in the ZY plane (seen from +x; its right is -z)
    quad((a, b) => [-R + 2 * R * a, H * b, 0], (a, b) => norm((a * 2 - 1) * 0.8, 0.5 + 0.4 * b, 0), (a, b) => [a * 0.5, 1 - b]);
    quad((a, b) => [0, H * b, R - 2 * R * a], (a, b) => norm(0, 0.5 + 0.4 * b, -(a * 2 - 1) * 0.8), (a, b) => [0.5 + a * 0.5, 1 - b]);
    const sidePrim = doc.createPrimitive().setMaterial(mat(`${key}_${i}_side`, sideTex))
      .setAttribute('POSITION', accessor(new Float32Array(P), 'VEC3')).setAttribute('NORMAL', accessor(new Float32Array(N), 'VEC3'))
      .setAttribute('TEXCOORD_0', accessor(new Float32Array(U), 'VEC2')).setIndices(accessor(new Uint16Array(I), 'SCALAR'));
    P.length = N.length = U.length = I.length = 0;
    // the view from above, laid flat a little above the middle of the canopy
    const yTop = H * (key === 'shrub' || key === 'fern' ? 0.62 : 0.58);
    quad((a, b) => [-R + 2 * R * a, yTop, -R + 2 * R * b], (a, b) => norm((a * 2 - 1) * 0.55, 1, (b * 2 - 1) * 0.55), (a, b) => [a, b]);
    I.splice(I.length / 2); // only the upper face of the flat card
    const topPrim = doc.createPrimitive().setMaterial(mat(`${key}_${i}_top`, topTex))
      .setAttribute('POSITION', accessor(new Float32Array(P), 'VEC3')).setAttribute('NORMAL', accessor(new Float32Array(N), 'VEC3'))
      .setAttribute('TEXCOORD_0', accessor(new Float32Array(U), 'VEC2')).setIndices(accessor(new Uint16Array(I), 'SCALAR'));
    const mesh = doc.createMesh(`${key}_${i}`).addPrimitive(sidePrim).addPrimitive(topPrim);
    scene.addChild(doc.createNode(`${key}_${i}`).setMesh(mesh).setExtras({ height: H, radius: R }));
  }
  const file = join('src/assets/props', `${key}.glb`);
  await io.write(file, doc);
  kb = statSync(file).size / 1024;
  console.log(`${key.padEnd(7)} ${id.padEnd(16)} ${results.length} variants  ${results.map((r) => `${(r.height || 0).toFixed(1)}m`).join(' ')}  ${kb.toFixed(0)} KB  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
server.close();
