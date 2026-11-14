// Converts the Mixamo downloads (assets-src/mixamo, see assets-src/DOWNLOADS.md) into game-ready .glb files in
// src/assets/mixamo: one per character, with its animations renamed to what Player.js and Enemies.js play.
// The FBX files are read with three.js's FBXLoader inside a headless browser, then compressed here.
// Mixamo's terms allow these inside the game but not as standalone files: both folders are git-ignored.
// Usage: node tools/convert-mixamo.mjs
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, quantize, join as joinPrims, weld } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = resolve('assets-src/mixamo'), TMP = join(SRC, 'out'), OUT = 'src/assets/mixamo';
mkdirSync(TMP, { recursive: true }); mkdirSync(OUT, { recursive: true });
// file name -> clip name the game plays; travel: walks and runs whose forward motion is measured and removed
const SURVIVOR = [['idle', 'Idle'], ['walk', 'Walk', true], ['run', 'Run', true], ['punch', 'Punch'], ['slash', 'Slash'], ['hit', 'HitReact'], ['death', 'Death']];
const ZOMBIE = [['idle', 'Idle'], ['walk', 'Walk', true], ['run', 'Run', true], ['attack', 'Punch'], ['hit', 'HitReact'], ['death', 'Death']];
const JOBS = [
  { name: 'survivor', dir: 'survivor', anims: SURVIVOR },
  { name: 'husk', dir: 'husk', anims: ZOMBIE },
  { name: 'dusthusk', dir: 'dusthusk', animDir: 'husk', anims: ZOMBIE, retarget: 'husk' },
];

const page$ = (await build({ entryPoints: ['tools/mixamo/page.js'], bundle: true, format: 'iife', write: false, minify: true })).outputFiles[0].text;
// loopback-only server: serves the FBX files to the page and takes the exported .glb back
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname.slice(1));
  if (p === 'index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body></body>'); return; }
  if (req.method === 'POST' && p === 'save') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const file = resolve(TMP, `${u.searchParams.get('name')}.glb`);
    if (!file.startsWith(TMP)) { res.writeHead(400); res.end(); return; }
    writeFileSync(file, Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); return;
  }
  const file = resolve(SRC, p);
  if (!file.startsWith(SRC) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-length': statSync(file).size }); createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text().slice(0, 200)); });
await page.goto(`${origin}/index.html`);
await page.addScriptTag({ content: page$ });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const job of JOBS) {
  const animDir = job.animDir || job.dir;
  if (!existsSync(join(SRC, job.dir, 'character.fbx'))) { console.log(`${job.name}: no character.fbx, skipped`); continue; }
  const anims = job.anims.filter(([f]) => existsSync(join(SRC, animDir, `${f}.fbx`))).map(([f, role, travel]) => ({ role, url: `${origin}/${animDir}/${f}.fbx`, travel: !!travel }));
  const info = await page.evaluate((a) => window.convertMixamo(a), {
    character: `${origin}/${job.dir}/character.fbx`, anims, retargetFrom: job.retarget ? `${origin}/${job.retarget}/character.fbx` : null, save: `${origin}/save?name=${job.name}`,
  });
  // merge the pieces that share a material (the exporter splits a mesh at every material run, which
  // would cost a draw call each), compress: colour maps 1024 px, the rest 512 px, as WebP; tidy
  // animation keys; quantize
  const doc = await io.read(join(TMP, `${job.name}.glb`));
  await doc.transform(
    resample({ tolerance: 0.0005 }), dedup(), weld({ tolerance: 0.0001 }), joinPrims({ keepMeshes: true, keepNamed: false }), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /baseColor/, resize: [1024, 1024], quality: 82 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!baseColor)/, resize: [512, 512], quality: 85 }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  const file = join(OUT, `${job.name}.glb`);
  await io.write(file, doc);
  const prims = doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives().length, 0);
  const tris = doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  console.log(`${job.name.padEnd(9)} ${(statSync(file).size / 1048576).toFixed(2)} MB  ${Math.round(tris)} tris  ${prims} parts  height ${info.height.toFixed(1)}  hip ratio ${info.ratio.toFixed(2)}  speeds ${JSON.stringify(Object.fromEntries(Object.entries(info.speeds).map(([k, v]) => [k, +v.toFixed(1)])))}`);
  console.log(`          ${info.clips.join(' | ')}`);
}
await browser.close();
server.close();
