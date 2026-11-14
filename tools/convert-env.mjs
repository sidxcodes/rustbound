// Shrinks the Poly Haven sky (assets-src/polyhaven/hdri/*.hdr, Radiance RGBE) to 512 x 256 for the
// game's reflections and ambient light, written as a plain (unpacked) .hdr to src/assets/env/sky.hdr.
// Sky light is soft and blurry anyway, so the small size loses nothing visible.
// Usage: node tools/convert-env.mjs
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { HDRIS } from './assets.config.mjs';

function readHDR(buf) {
  let p = 0; const line = () => { let s = ''; while (buf[p] !== 10) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('not a Radiance file');
  while (line() !== '');
  const [, h, , w] = line().split(' ').map((v, i) => (i % 2 ? +v : v));
  const px = new Float32Array(w * h * 3), scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (buf[p] === 2 && buf[p + 1] === 2 && ((buf[p + 2] << 8) | buf[p + 3]) === w) {
      p += 4; // run-length encoded scanline, one channel at a time
      for (let c = 0; c < 4; c++) for (let x = 0; x < w;) {
        let n = buf[p++];
        if (n > 128) { n -= 128; const v = buf[p++]; while (n--) scan[(x++) * 4 + c] = v; } else while (n--) scan[(x++) * 4 + c] = buf[p++];
      }
    } else { for (let i = 0; i < w * 4; i++) scan[i] = buf[p++]; }
    for (let x = 0; x < w; x++) {
      const e = scan[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0;
      for (let c = 0; c < 3; c++) px[(y * w + x) * 3 + c] = scan[x * 4 + c] * f;
    }
  }
  return { w, h, px };
}
function writeHDR({ w, h, px }) {
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`);
  const body = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2], m = Math.max(r, g, b);
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m) + 1e-9), f = 256 / Math.pow(2, e);
    body[i * 4] = Math.min(255, r * f); body[i * 4 + 1] = Math.min(255, g * f); body[i * 4 + 2] = Math.min(255, b * f); body[i * 4 + 3] = e + 128;
  }
  return Buffer.concat([head, body]);
}
function half({ w, h, px }) {
  const W = w >> 1, H = h >> 1, out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++)
    out[(y * W + x) * 3 + c] = (px[(2 * y * w + 2 * x) * 3 + c] + px[(2 * y * w + 2 * x + 1) * 3 + c] + px[((2 * y + 1) * w + 2 * x) * 3 + c] + px[((2 * y + 1) * w + 2 * x + 1) * 3 + c]) / 4;
  return { w: W, h: H, px: out };
}

mkdirSync('src/assets/env', { recursive: true });
for (const [key, { id, res = '1k' }] of Object.entries(HDRIS)) {
  let img = readHDR(readFileSync(`assets-src/polyhaven/hdri/${id}_${res}.hdr`));
  while (img.w > 512) img = half(img);
  const file = `src/assets/env/${key}.hdr`;
  writeFileSync(file, writeHDR(img));
  console.log(`${key}: ${id} -> ${img.w}x${img.h}, ${(statSync(file).size / 1024).toFixed(0)} KB`);
}
