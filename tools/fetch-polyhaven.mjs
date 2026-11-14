// Downloads the Poly Haven (CC0) textures, models and sky listed in tools/assets.config.mjs into
// assets-src/polyhaven/, and records name, authors and size of each in assets-src/polyhaven/credits.json.
// Usage: node tools/fetch-polyhaven.mjs        (files already downloaded are skipped)
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as CONFIG from './assets.config.mjs';

const ROOT = 'assets-src/polyhaven';
const UA = { 'User-Agent': 'rustbound-asset-fetch/1.0' };
const creditsFile = join(ROOT, 'credits.json');
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : {};

async function json(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function download(url, file) {
  if (existsSync(file)) return false;
  mkdirSync(dirname(file), { recursive: true });
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return true;
}
async function credit(id, kind) {
  if (credits[id]) return;
  const info = await json(`https://api.polyhaven.com/info/${id}`);
  credits[id] = { name: info.name, authors: Object.keys(info.authors || {}), dimensions: info.dimensions || null, kind, url: `https://polyhaven.com/a/${id}`, licence: 'CC0 1.0' };
}

let fetched = 0;
for (const { id } of Object.values(CONFIG.TEXTURES || {})) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  for (const [map, short] of [['Diffuse', 'diff'], ['nor_gl', 'nor_gl'], ['arm', 'arm']]) {
    const entry = files[map] && files[map]['1k'] && files[map]['1k'].jpg;
    if (!entry) { console.warn(`${id}: no 1k ${map}`); continue; }
    if (await download(entry.url, join(ROOT, 'textures', id, `${short}.jpg`))) fetched++;
  }
  await credit(id, 'texture');
  console.log(`texture ${id}`);
}
for (const { id, res = '1k', variant } of Object.values(CONFIG.MODELS || {})) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const g = files.gltf && (files.gltf[res] || files.gltf['1k']);
  if (!g) { console.warn(`${id}: no glTF`); continue; }
  const base = join(ROOT, 'models', id);
  if (await download(g.gltf.url, join(base, `${id}.gltf`))) fetched++;
  for (const [rel, f] of Object.entries(g.gltf.include || {})) if (await download(f.url, join(base, rel))) fetched++;
  // other colour variants of the same model ship as separate texture sets
  if (variant) for (const map of ['diff', 'nor_gl', 'arm']) {
    const e = files[`${variant}_${map}`] && files[`${variant}_${map}`]['1k'] && files[`${variant}_${map}`]['1k'].jpg;
    if (e && (await download(e.url, join(base, 'variants', `${variant}_${map}.jpg`)))) fetched++;
  }
  await credit(id, 'model');
  console.log(`model ${id}`);
}
for (const { id, res = '1k' } of Object.values(CONFIG.HDRIS || {})) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const h = files.hdri && files.hdri[res] && files.hdri[res].hdr;
  if (!h) { console.warn(`${id}: no ${res} hdr`); continue; }
  if (await download(h.url, join(ROOT, 'hdri', `${id}_${res}.hdr`))) fetched++;
  await credit(id, 'hdri');
  console.log(`hdri ${id}`);
}
writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
console.log(`${fetched} new files`);
