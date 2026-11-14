// Realistic props and plants from Poly Haven (CC0), converted by tools/convert-models.mjs and
// tools/bake-impostors.mjs and embedded in the page. If they fail to load, `props.ready` stays false
// and the world uses the older model pack or the shapes built in models.js instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PROP_FILES } from '../assets/manifest.js';
import { trackTexture, trackMaterial } from '../gfx/pbr.js';

export const props = { ready: false, gltf: {} };

export async function loadProps() {
  try {
    const loader = new GLTFLoader();
    await Promise.all(Object.entries(PROP_FILES).map(async ([name, bytes]) => {
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) { m[k].anisotropy = 8; trackTexture(m[k]); }
        trackMaterial(m);
      });
      props.gltf[name] = gltf;
    }));
    props.ready = Object.keys(props.gltf).length > 0;
  } catch (err) {
    console.warn('Props failed to load; using simpler models instead.', err);
    props.ready = false;
  }
  return props.ready;
}
export const has = (name) => props.ready && !!props.gltf[name];

// A copy of a prop you can place freely. Its base sits at y = 0. Optional fitting:
// height: scale so it is this tall; size: scale so its larger footprint side is this long.
export function propModel(name, { height, size, scale = 1 } = {}) {
  const g = new THREE.Group();
  if (!has(name)) return g;
  const inner = props.gltf[name].scene.clone(true);
  const box = new THREE.Box3().setFromObject(inner), dim = box.getSize(new THREE.Vector3());
  let k = scale;
  if (height) k = height / dim.y;
  else if (size) k = size / Math.max(dim.x, dim.z);
  inner.scale.setScalar(k);
  g.add(inner);
  return g;
}

// A tyre lying flat, centred on the origin; returns { group, thickness } so they can be stacked.
export function flatTyre(diameter = 0.86) {
  const g = new THREE.Group(), t = propModel('tyre', { size: diameter });
  t.position.y = -diameter / 2; // centre of the upright tyre at the origin...
  const spin = new THREE.Group(); spin.add(t); spin.rotation.x = Math.PI / 2; // ...then laid on its side
  g.add(spin);
  const s = sizeOf('tyre');
  return { group: g, thickness: (s.z / Math.max(s.x, s.y)) * diameter };
}

// The pieces of a prop (geometry + material, already in the prop's own space) for instancing.
// For baked plants each variant is one node; `variant` picks which.
export function propParts(name, variant = null) {
  if (!has(name)) return [];
  const scene = props.gltf[name].scene;
  scene.updateMatrixWorld(true);
  const root = variant == null ? scene : scene.children[variant];
  const parts = [];
  root.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
  return parts;
}
// Baked plant variants: [{ index, height, radius }]
export function variants(name) {
  if (!has(name)) return [];
  return props.gltf[name].scene.children.map((n, index) => ({ index, height: n.userData.height || 1, radius: n.userData.radius || 1 }));
}
export function sizeOf(name) {
  if (!has(name)) return new THREE.Vector3(1, 1, 1);
  return new THREE.Box3().setFromObject(props.gltf[name].scene).getSize(new THREE.Vector3());
}

// Draw many copies of the same pieces as instanced meshes, split into square chunks so that chunks
// off screen (and outside the shadow camera) are skipped. items: [{ matrix }] in world space.
const CHUNK = 56;
export function scatter(parent, parts, items, { shadow = true, color = null } = {}) {
  if (!parts.length || !items.length) return [];
  const cells = new Map();
  for (const it of items) {
    const x = it.matrix.elements[12], z = it.matrix.elements[14];
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(it);
  }
  const out = [], m = new THREE.Matrix4();
  for (const list of cells.values()) {
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, list.length);
      list.forEach((it, i) => { im.setMatrixAt(i, m.multiplyMatrices(it.matrix, p.matrix)); if (color && it.color) im.setColorAt(i, it.color); });
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
      out.push(im);
    }
  }
  return out;
}
