// Photo-based surface textures (Poly Haven, CC0), embedded in the page as WebP and decoded once at
// start-up. Each set has a colour map, an OpenGL normal map and a packed AO/roughness/metalness map.
// If anything fails to decode, PBR.ready stays false and every caller falls back to the textures
// painted in code (gfx/textures.js and models/textures.js), so the game still runs.
// The Low graphics setting swaps every texture made here for a half-size copy.
import * as THREE from 'three';
import { TEX } from './textures.js';
import { TEX_FILES } from '../assets/manifest.js';
import META from '../assets/tex/meta.json';

export const PBR = { ready: false, low: false, sets: {} };
const registry = []; // { tex, full, half }

async function decode(bytes) {
  const blob = new Blob([bytes], { type: 'image/webp' });
  // decode upside down, as WebGL expects; ImageBitmaps ignore texture.flipY
  try { return { img: await createImageBitmap(blob, { imageOrientation: 'flipY' }), flipped: true }; } catch { /* older browser */ }
  const url = URL.createObjectURL(blob), img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  return { img, flipped: false };
}

// Make a texture from a decoded image and remember it so Low can shrink it later.
export function trackTexture(tex) {
  if (!tex || !tex.image || registry.some((r) => r.tex.source === tex.source)) return tex;
  registry.push({ tex, full: tex.image, half: null });
  if (PBR.low) swap(registry[registry.length - 1], true);
  return tex;
}
function makeTexture({ img, flipped }, srgb) {
  const t = new THREE.Texture(img);
  t.flipY = !flipped;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return trackTexture(t);
}
function swap(r, low) {
  const w = r.full.width, h = r.full.height;
  if (low && !r.half && w > 256) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w >> 1); c.height = Math.max(1, h >> 1);
    c.getContext('2d').drawImage(r.full, 0, 0, c.width, c.height);
    r.half = c;
  }
  const img = low && r.half ? r.half : r.full;
  if (r.tex.image !== img) { r.tex.image = img; r.tex.needsUpdate = true; }
}
// Materials with normal maps: Low drops the normal map (saves texture reads on every pixel).
const materials = [];
export function trackMaterial(m) {
  if (!m || !m.normalMap || materials.some((e) => e.m === m)) return m;
  materials.push({ m, normalMap: m.normalMap });
  if (PBR.low) { m.normalMap = null; m.needsUpdate = true; }
  return m;
}
// Low graphics: half-size textures (a quarter of the memory and bandwidth) and no normal maps.
export function setLowTextures(low) {
  PBR.low = low;
  for (const r of registry) swap(r, low);
  for (const e of materials) {
    const want = low ? null : e.normalMap;
    if (e.m.normalMap !== want) { e.m.normalMap = want; e.m.needsUpdate = true; }
  }
}

export async function loadTextures() {
  try {
    const keys = Object.keys(META).filter((k) => TEX_FILES[`${k}_c`]);
    await Promise.all(keys.map(async (k) => {
      const [c, n, a] = await Promise.all(['c', 'n', 'a'].map((s) => (TEX_FILES[`${k}_${s}`] ? decode(TEX_FILES[`${k}_${s}`]) : null)));
      PBR.sets[k] = { c: makeTexture(c, true), n: n && makeTexture(n, false), a: a && makeTexture(a, false), metres: META[k].metres };
    }));
    PBR.ready = keys.length > 0;
  } catch (err) {
    console.warn('Surface textures failed to load; using painted textures instead.', err);
    PBR.ready = false;
  }
  return PBR.ready;
}

// Real-world size of one tile of a set, in metres (for UVs measured in metres).
export const tileOf = (key, fallback = 2.5) => (PBR.ready && PBR.sets[key] ? PBR.sets[key].metres : fallback);

// A shared textured material for a surface kind, or null if the photo textures are not available.
// tint multiplies the colour map; repeat scales UVs that are already in tile units.
const cache = new Map();
// Hide the grid a repeating photo makes on big surfaces: blend in a second, rotated and rescaled
// sample of the colour map wherever a low-frequency noise says so.
export function antiTile(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tAntiTile = { value: TEX.noise() };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tAntiTile;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          float atMix = smoothstep(0.32, 0.68, texture2D(tAntiTile, vMapUv * 0.083).r);
          vec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(map, vec2(-vMapUv.y, vMapUv.x) * 0.61 + 0.37), atMix);
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  m.customProgramCacheKey = () => 'antiTile';
  return m;
}

// unique: true makes a material of its own (for one that fades by itself, like a roof).
// tile: true hides repeats on big surfaces (see antiTile).
export function surface(key, { tint = 0xffffff, repeat = 1, roughness = 1, metalness = 0, normalScale = 1, aoIntensity = 0.8, unique = false, tile = false, ...extra } = {}) {
  const set = PBR.ready && PBR.sets[key];
  if (!set) return null;
  const ck = `${key}|${tint}|${repeat}|${roughness}|${metalness}|${normalScale}|${aoIntensity}|${tile}|${JSON.stringify(extra)}`;
  if (!unique && cache.has(ck)) return cache.get(ck);
  const tx = (t) => { if (!t || repeat === 1) return t; const c = t.clone(); if (Array.isArray(repeat)) c.repeat.set(repeat[0], repeat[1]); else c.repeat.setScalar(repeat); return c; };
  const m = new THREE.MeshStandardMaterial({
    map: tx(set.c), normalMap: tx(set.n), roughnessMap: tx(set.a), aoMap: tx(set.a), aoMapIntensity: aoIntensity,
    metalnessMap: metalness > 0 ? tx(set.a) : null, color: tint, roughness, metalness, normalScale: new THREE.Vector2(normalScale, normalScale), ...extra,
  });
  m.name = `pbr_${key}`;
  if (tile) antiTile(m);
  trackMaterial(m);
  if (!unique) cache.set(ck, m);
  return m;
}
