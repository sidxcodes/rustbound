// Runs inside a browser page (bundled by tools/convert-mixamo.mjs). Loads a Mixamo character FBX and its
// animation FBX files, cleans the clips up for the game and exports one binary glTF.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGroups } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const loader = new FBXLoader();
const hipsOf = (o) => { let h = null; o.traverse((b) => { if (!h && b.isBone && /Hips$/.test(b.name)) h = b; }); return h; };

// FBXLoader decodes embedded textures asynchronously; wait until every image has pixels.
async function texturesReady(obj) {
  const imgs = [];
  obj.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'specularMap', 'emissiveMap', 'alphaMap']) if (m[k] && m[k].image) imgs.push(m[k].image); });
  for (let i = 0; i < 200 && imgs.some((im) => !(im.width > 0 && (im.complete === undefined || im.complete))); i++) await new Promise((ok) => setTimeout(ok, 50));
}

window.convertMixamo = async ({ character, anims, retargetFrom, save }) => {
  const model = await loader.loadAsync(character);
  await texturesReady(model);
  model.updateMatrixWorld(true);
  // Phong materials from FBX -> standard PBR materials the game lights properly
  model.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => new THREE.MeshStandardMaterial({
      name: m.name, map: m.map || null, normalMap: m.normalMap || null, color: m.map ? 0xffffff : m.color,
      roughness: 0.82, metalness: 0, side: THREE.FrontSide, alphaTest: m.transparent || m.alphaMap ? 0.5 : 0,
    });
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    // FBX meshes come split at every material run; one piece per material keeps draw calls low
    if (o.geometry.groups.length > 1) mergeGroups(o.geometry);
  });
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const hips = hipsOf(model), unit = hips && hips.parent ? hips.parent.getWorldScale(new THREE.Vector3()).x : 1;
  // the dust husk borrows the husk's animations: scale hip movement by the ratio of hip heights
  let ratio = 1;
  if (retargetFrom) {
    const src = await loader.loadAsync(retargetFrom);
    src.updateMatrixWorld(true);
    const a = hipsOf(src), b = hips;
    if (a && b) ratio = b.position.y / a.position.y;
  }
  const clips = [], speeds = {};
  for (const { role, url, travel } of anims) {
    const a = await loader.loadAsync(url);
    const clip = a.animations[0];
    clip.name = role;
    // keep rotations everywhere, but position only on the hips (the rest are fixed bone lengths)
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || /Hips\.position$/.test(t.name)));
    const hp = clip.tracks.find((t) => /Hips\.position$/.test(t.name));
    if (hp) {
      const v = hp.values, n = v.length / 3;
      if (ratio !== 1) for (let i = 0; i < v.length; i++) v[i] *= ratio;
      if (travel) {
        // walks and runs: measure how fast the clip travels, then take the travel out (the game moves the body)
        const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2], T = hp.times[n - 1] - hp.times[0];
        speeds[role] = (Math.hypot(dx, dz) / T) * unit;
        for (let i = 0; i < n; i++) { const f = (hp.times[i] - hp.times[0]) / T; v[i * 3] -= dx * f; v[i * 3 + 2] -= dz * f; }
      }
    }
    clips.push(clip);
  }
  model.userData = { rustbound: { height, speeds, source: 'mixamo' } };
  const glb = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips, onlyVisible: true, maxTextureSize: 2048 });
  const r = await fetch(save, { method: 'POST', body: glb });
  return { height, unit, ratio, speeds, clips: clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s ${c.tracks.length}tr`), bytes: glb.byteLength, saved: r.status };
};
