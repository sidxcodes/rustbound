// Converts the downloaded Poly Haven models (assets-src/polyhaven/models) into small .glb files in
// src/assets/props: keeps the wanted nodes, swaps in a colour variant, simplifies the meshes to a
// triangle budget, shrinks textures to WebP, drops costly material extensions (glass transmission
// adds a whole extra render pass), puts the base at y = 0 and quantizes the vertex data.
// Usage: node tools/convert-models.mjs [key ...]      (run tools/fetch-polyhaven.mjs first)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, quantize, center, flatten, join as joinMeshes } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS } from './assets.config.mjs';

const SRC = 'assets-src/polyhaven/models', OUT = 'src/assets/props';
mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const DROP_EXT = ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_clearcoat', 'KHR_materials_sheen', 'KHR_materials_iridescence'];
const countTris = (doc) => doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

const only = process.argv.slice(2);
let total = 0;
for (const [key, cfg] of Object.entries(MODELS)) {
  if (cfg.impostor || (only.length && !only.includes(key))) continue;
  const { id, tex = 512, tris = 1500, keep, variant, error = 0.02 } = cfg;
  const doc = await io.read(join(SRC, id, `${id}.gltf`));
  const root = doc.getRoot();
  for (const ext of root.listExtensionsUsed()) if (DROP_EXT.includes(ext.extensionName)) ext.dispose();
  // keep only the wanted nodes (some files hold a clean and a worn copy side by side)
  if (keep) for (const n of root.listNodes()) if (n.getMesh() && !keep.test(n.getName())) n.dispose();
  // colour variant: replace the colour, normal and ORM images with the variant's
  if (variant) {
    const v = (m) => join(SRC, id, 'variants', `${variant}_${m}.jpg`);
    for (const mat of root.listMaterials()) {
      for (const [slot, file] of [['getBaseColorTexture', v('diff')], ['getNormalTexture', v('nor_gl')], ['getOcclusionTexture', v('arm')], ['getMetallicRoughnessTexture', v('arm')]]) {
        const t = mat[slot]();
        if (t && existsSync(file)) t.setImage(readFileSync(file)).setMimeType('image/jpeg');
      }
    }
  }
  await doc.transform(prune(), flatten(), joinMeshes(), weld({ tolerance: 0.0001 }), dedup());
  const before = countTris(doc);
  if (before > tris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: tris / before, error, lockBorder: false }));
  await doc.transform(
    center({ pivot: 'below' }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 80 }),
    prune(), dedup(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  const file = join(OUT, `${key}.glb`);
  await io.write(file, doc);
  const kb = statSync(file).size / 1024; total += kb;
  console.log(`${key.padEnd(13)} ${id.padEnd(24)} ${String(Math.round(before)).padStart(7)} -> ${String(Math.round(countTris(doc))).padStart(5)} tris  ${kb.toFixed(0).padStart(5)} KB`);
}
console.log(`total ${(total / 1024).toFixed(2)} MB`);
