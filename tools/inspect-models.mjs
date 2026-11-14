// Prints triangle count, node names, size and material variants of the downloaded Poly Haven models.
// Usage: node tools/inspect-models.mjs [key ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import { MODELS } from './assets.config.mjs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS);
for (const key of keys) {
  const { id } = MODELS[key];
  const doc = await io.read(`assets-src/polyhaven/models/${id}/${id}.gltf`);
  const root = doc.getRoot();
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  const scene = root.listScenes()[0], b = getBounds(scene);
  const size = b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join('x');
  const tops = scene.listChildren().map((n) => n.getName()).slice(0, 8).join(',');
  const variants = root.getExtras && doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(',');
  console.log(`${key.padEnd(13)} ${String(Math.round(tris)).padStart(8)} tris  size ${size.padEnd(18)} mats ${root.listMaterials().length} tex ${root.listTextures().length}  nodes[${scene.listChildren().length}]: ${tops}  ext: ${variants}`);
}
