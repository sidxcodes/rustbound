// Converts the downloaded Poly Haven texture sets (assets-src/polyhaven/textures) into small WebP files
// in src/assets/tex: <key>_c (colour), <key>_n (OpenGL normal), <key>_a (AO, roughness, metalness).
// Usage: node tools/convert-textures.mjs   (run tools/fetch-polyhaven.mjs first)
import sharp from 'sharp';
import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEXTURES, ARM_SIZE } from './assets.config.mjs';

const SRC = 'assets-src/polyhaven/textures', OUT = 'src/assets/tex';
mkdirSync(OUT, { recursive: true });
const credits = JSON.parse(readFileSync('assets-src/polyhaven/credits.json', 'utf8'));
const meta = {};
let total = 0;
for (const [key, { id, size }] of Object.entries(TEXTURES)) {
  const parts = [['diff', 'c', size, { quality: 80 }], ['nor_gl', 'n', size, { quality: 86 }], ['arm', 'a', ARM_SIZE, { quality: 78 }]];
  let kb = 0;
  for (const [src, suffix, px, opts] of parts) {
    const from = join(SRC, id, `${src}.jpg`);
    if (!existsSync(from)) { console.warn(`missing ${from}`); continue; }
    const to = join(OUT, `${key}_${suffix}.webp`);
    await sharp(from).resize(px, px, { fit: 'inside', withoutEnlargement: true }).webp({ ...opts, effort: 6 }).toFile(to);
    kb += statSync(to).size / 1024;
  }
  const dims = credits[id] && credits[id].dimensions;
  meta[key] = { id, metres: dims ? dims[0] / 1000 : 2 };
  total += kb;
  console.log(`${key.padEnd(11)} ${id.padEnd(24)} ${kb.toFixed(0).padStart(5)} KB`);
}
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
console.log(`total ${(total / 1024).toFixed(2)} MB`);
