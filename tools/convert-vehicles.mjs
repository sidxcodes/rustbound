// Converts the Sketchfab vehicles (assets-src/sketchfab/*.glb, CC BY 4.0, see credits.json there) into
// src/assets/vehicles: textures re-encoded as WebP, meshes quantized, and the parts the game moves given
// clear names. The truck's four wheels become wheel_FL/FR/RL/RR and its front bumper bumper_front.
// Usage: node tools/convert-vehicles.mjs
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import { mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets-src/sketchfab', OUT = 'src/assets/vehicles';
mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const JOBS = [
  { file: 'truck', tex: 1024 },
  { file: 'crashed_truck', tex: 512 },
  { file: 'crashed_car', tex: 512 },
  { file: 'sedan', tex: 512 },
  { file: 'burned_cars', tex: 512 },
];

for (const { file, tex } of JOBS) {
  if (!existsSync(join(SRC, `${file}.glb`))) { console.log(`${file}: missing, skipped`); continue; }
  const doc = await io.read(join(SRC, `${file}.glb`));
  const scene = doc.getRoot().listScenes()[0];
  if (file === 'truck') {
    // Name the moving parts. The model faces +z with +x on its left side; wheels are the four
    // wheel-sized parts touching the ground, the front bumper is the low wide part at the very front.
    const parts = [];
    scene.traverse((n) => { if (n.getMesh()) { const b = getBounds(n); parts.push({ n, c: b.min.map((v, i) => (v + b.max[i]) / 2), s: b.max.map((v, i) => v - b.min[i]), min: b.min, max: b.max }); } });
    const wheels = parts.filter((p) => p.min[1] < 0.2 && p.s[1] > 3 && p.s[0] < 3 && Math.abs(p.s[1] - p.s[2]) < 0.6);
    const zMid = wheels.reduce((t, w) => t + w.c[2], 0) / wheels.length;
    for (const w of wheels) w.n.setName(`wheel_${w.c[2] > zMid ? 'F' : 'R'}${w.c[0] > 0 ? 'L' : 'R'}`);
    const zMax = Math.max(...parts.map((p) => p.max[2]));
    const bumper = parts.filter((p) => p.c[1] < 5 && p.s[0] > 10 && p.max[2] > zMax - 2.5).sort((a, b) => b.c[2] - a.c[2])[0];
    if (bumper) bumper.n.setName('bumper_front');
    console.log(`truck parts: ${wheels.map((w) => w.n.getName()).join(' ')} ${bumper ? 'bumper_front' : 'no bumper found'}`);
  }
  await doc.transform(
    dedup(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 80 }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  const out = join(OUT, `${file}.glb`);
  await io.write(out, doc);
  const b = getBounds(scene);
  console.log(`${file.padEnd(14)} ${(statSync(out).size / 1048576).toFixed(2)} MB  size ${b.max.map((v, i) => (v - b.min[i]).toFixed(1)).join(' x ')}`);
}
