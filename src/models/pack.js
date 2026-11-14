// Hand-made models from the Quaternius "Zombie Apocalypse Kit" (CC0), embedded in the build.
// This file loads them once and hands out ready-to-use copies: animated characters, the pickup,
// wrecks and props. If loading fails, `pack.ready` stays false and the game falls back to the
// code-made models in models.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSETS } from '../assets/index.js';
import { CHAR_FILES, VEHICLE_FILES } from '../assets/manifest.js';
import * as PR from './props.js';
import { trackTexture, surface } from '../gfx/pbr.js';

// chars: realistic Mixamo characters (survivor, husk, dusthusk), used instead of the pack's when present
// vehicles: realistic truck and wrecks, used instead of the pack's when present
export const pack = { ready: false, models: {}, chars: {}, vehicles: {} };
const FACE_X = Math.PI / 2; // pack models face +z; the game's convention is +x

// The pack uses one small colour-palette texture. Pull its colours toward the game's dusty look.
const muted = new Map();
function muteTexture(tex) {
  const img = tex.image;
  if (!img || !img.width) return tex;
  const key = (tex.source ? tex.source.uuid : tex.uuid) + '|' + tex.offset.toArray() + tex.repeat.toArray();
  if (muted.has(key)) return muted.get(key);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    const sat = 0.86; // take a little of the cartoon brightness out, keep the colours readable
    d[i] = (l + (d[i] - l) * sat) * 0.95;
    d[i + 1] = (l + (d[i + 1] - l) * sat) * 0.94;
    d[i + 2] = (l + (d[i + 2] - l) * sat) * 0.9;
  }
  g.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.flipY = tex.flipY; out.colorSpace = tex.colorSpace;
  // quantized models carry a UV transform on the texture; keep it or every face samples one colour
  out.offset.copy(tex.offset); out.repeat.copy(tex.repeat); out.center.copy(tex.center); out.rotation = tex.rotation; out.channel = tex.channel; out.name = tex.name;
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT; // it is a palette: each colour is a small block, so never blend neighbouring blocks together
  out.magFilter = THREE.NearestFilter; out.minFilter = THREE.NearestFilter; out.generateMipmaps = false;
  muted.set(key, out);
  return out;
}

const TINT = { zombie_basic: 0xb4bca0, zombie_chubby: 0xb9b2a4 }; // sickly, less cartoon

export async function loadPack() {
  try {
    const loader = new GLTFLoader();
    await Promise.all(Object.entries(ASSETS).map(async ([name, bytes]) => {
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material;
        if (m.map) m.map = muteTexture(m.map);
        m.roughness = 0.88; m.metalness = 0.02;
        if (TINT[name]) m.color.setHex(TINT[name]);
        if (m.name === 'Light') { m.emissive = new THREE.Color(0xfff0c8); m.emissiveIntensity = 0.25; }
      });
      pack.models[name] = gltf;
    }));
    pack.ready = true;
  } catch (err) {
    console.warn('Model pack failed to load; using built-in shapes instead.', err);
    pack.ready = false;
  }
  // Mixamo characters load on their own, so a problem there only falls back for the characters
  try {
    const loader = new GLTFLoader();
    await Promise.all(Object.entries(CHAR_FILES).map(async ([name, bytes]) => {
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        for (const k of ['map', 'normalMap']) if (o.material[k]) trackTexture(o.material[k]);
      });
      pack.chars[name] = gltf;
    }));
  } catch (err) {
    console.warn('Characters failed to load; using the pack characters instead.', err);
    pack.chars = {};
  }
  // realistic truck and wrecks (Sketchfab, CC BY 4.0), also loaded on their own
  try {
    const loader = new GLTFLoader();
    await Promise.all(Object.entries(VEHICLE_FILES).map(async ([name, bytes]) => {
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        o.material.roughness = Math.max(o.material.roughness, 0.75);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (o.material[k]) trackTexture(o.material[k]);
      });
      pack.vehicles[name] = gltf;
    }));
  } catch (err) {
    console.warn('Vehicles failed to load; using the pack vehicles instead.', err);
    pack.vehicles = {};
  }
  return pack.ready;
}

// A static prop. Returns a group you can position, rotate and scale freely.
export function prop(name, scale = 1, faceX = false) {
  const g = new THREE.Group();
  const inner = pack.models[name].scene.clone(true);
  inner.scale.setScalar(scale);
  if (faceX) inner.rotation.y = FACE_X;
  g.add(inner);
  return g;
}

// ---------------------------------------------------------------- characters
const HEIGHT_SCALE = { survivor: 1.14, zombie_basic: 1.26, zombie_chubby: 1.12 };
// which Mixamo character stands in for each pack character, and how tall it is (m)
const MIXAMO = { survivor: ['survivor', 1.8], zombie_basic: ['husk', 1.78], zombie_chubby: ['dusthusk', 1.84] };
export const hasCharacter = (kind) => !!(MIXAMO[kind] && pack.chars[MIXAMO[kind][0]]) || (pack.ready && !!pack.models[kind]);

export function packCharacter(kind) {
  if (MIXAMO[kind] && pack.chars[MIXAMO[kind][0]]) return mixamoCharacter(...MIXAMO[kind]);
  const src = pack.models[kind];
  const inner = cloneSkinned(src.scene);
  inner.scale.setScalar(HEIGHT_SCALE[kind] || 1);
  inner.rotation.y = FACE_X;
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
  // the survivor carries every weapon mesh in one hand; show only the equipped one
  const weapons = {};
  inner.traverse((o) => {
    if (o.isSkinnedMesh) o.frustumCulled = false;
    else if (o.isMesh || (o.isGroup && o.parent && o.parent.isBone)) { weapons[o.name] = o; o.visible = false; }
  });
  let current = null, custom = null;
  const api = {
    root, inner, mixer, pack: true,
    // Switch animation. `once` plays it a single time and holds the last frame; `duration` stretches it to fit.
    play(name, { once = false, duration = 0, fade = 0.14, restart = false } = {}) {
      const a = actions[name] || actions.Idle;
      if (!a || (current === a && !restart)) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.timeScale = duration ? a.getClip().duration / duration : 1;
      a.fadeIn(fade).play();
      if (current && current !== a) current.fadeOut(fade);
      current = a;
    },
    setSpeed(scale) { if (current) current.timeScale = scale; },
    update(dt) { mixer.update(dt); },
    setWeapon(id) {
      for (const w of Object.values(weapons)) w.visible = false;
      if (custom) custom.visible = false;
      if (id === 'nail_bat' && weapons.WoodenBat_Barbed) weapons.WoodenBat_Barbed.visible = true;
      else if (id === 'wrench' && weapons.Axe) {
        if (!custom) {
          // a pipe wrench, held where the pack's axe sits
          custom = new THREE.Group();
          const red = new THREE.MeshStandardMaterial({ color: 0x9c3528, metalness: 0.5, roughness: 0.5 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, metalness: 0.7, roughness: 0.4 });
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), red); handle.rotation.x = Math.PI / 2; handle.position.z = 0.26;
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.16), steel); jaw.position.set(0.04, 0, 0.62);
          const jaw2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.07), steel); jaw2.position.set(0.09, 0, 0.5);
          custom.add(handle, jaw, jaw2);
          custom.traverse((o) => { o.castShadow = true; });
          custom.position.copy(weapons.Axe.position); custom.quaternion.copy(weapons.Axe.quaternion);
          weapons.Axe.parent.add(custom);
        }
        custom.visible = true;
      }
    },
  };
  api.play('Idle');
  return api;
}

// ---------------------------------------------------------------- realistic characters
// A Mixamo character with the same interface as packCharacter. Walks and runs are matched to how fast
// the body really moves: the clip (walk or run) is picked by speed and its rate stretched to fit, so
// feet do not slide. `update` measures the speed from the root's movement between frames.
const TRAVEL = { Walk: 'Walk', Run: 'Run', Run_Arms: 'Run' };
const v3 = new THREE.Vector3();
function mixamoCharacter(name, height) {
  const src = pack.chars[name];
  const info = (src.scene.children[0] && src.scene.children[0].userData.rustbound) || { speeds: {} };
  const inner = cloneSkinned(src.scene);
  inner.updateMatrixWorld(true);
  let top = 0;
  inner.traverse((o) => {
    if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; }
    if (o.isBone && /HeadTop_End$/.test(o.name)) top = o.getWorldPosition(v3).y;
  });
  const k = height / (top || info.height || 180);
  inner.scale.setScalar(k);
  inner.rotation.y = FACE_X; // Mixamo characters face +z; the game's convention is +x
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {}, natural = {};
  for (const clip of src.animations) { actions[clip.name] = mixer.clipAction(clip); natural[clip.name] = (info.speeds[clip.name] || 0) * k; }
  let hand = null;
  inner.traverse((o) => { if (!hand && o.isBone && /RightHand$/.test(o.name)) hand = o; });
  const weapons = {};
  let current = null, travel = null, speed = 0;
  const last = new THREE.Vector3(NaN, 0, 0);
  const fadeTo = (a, fade) => {
    if (current === a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = a;
  };
  const api = {
    root, inner, mixer, pack: true, realistic: true,
    play(clipName, { once = false, duration = 0, fade = 0.18, restart = false } = {}) {
      if (TRAVEL[clipName]) {
        if (travel && !restart) return; // already moving: update() keeps walk/run matched to the speed
        travel = clipName;
        fadeTo(actions[TRAVEL[clipName]] || actions.Walk || actions.Idle, fade);
        return;
      }
      travel = null;
      const a = actions[clipName] || actions.Idle;
      if (!a || (current === a && !restart)) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.timeScale = duration ? a.getClip().duration / duration : 1;
      a.fadeIn(fade).play();
      if (current && current !== a) current.fadeOut(fade);
      current = a;
    },
    setSpeed(scale) { if (current) current.timeScale = scale; },
    update(dt) {
      const p = root.position;
      const moved = Number.isNaN(last.x) || dt <= 0 ? 0 : Math.hypot(p.x - last.x, p.z - last.z) / dt;
      last.set(p.x, 0, p.z);
      speed += (Math.min(moved, 12) - speed) * Math.min(1, dt * 8);
      if (travel) {
        // a fast "walk" is really a jog: use the run cycle above ~2.6 m/s
        const want = speed > 2.6 && actions.Run ? actions.Run : actions.Walk || actions.Run;
        if (want && want !== current) fadeTo(want, 0.22);
        const nat = natural[current.getClip().name] || 0;
        if (nat > 0.05) current.timeScale = THREE.MathUtils.clamp(speed / nat, 0.55, 2.3);
      }
      mixer.update(dt);
    },
    setWeapon(id) {
      for (const w of Object.values(weapons)) w.visible = false;
      if (!id || !hand) return;
      if (!weapons[id]) weapons[id] = handWeapon(id, hand);
      if (weapons[id]) weapons[id].visible = true;
    },
  };
  api.play('Idle');
  return api;
}
// A weapon held in the right hand bone: the scanned bat or pipe wrench, else a simple stand-in.
function handWeapon(id, hand) {
  const g = new THREE.Group();
  const model = id === 'nail_bat' ? 'bat' : id === 'wrench' ? 'wrench' : null;
  if (model && PR.has(model)) {
    const m = PR.propModel(model, { height: id === 'nail_bat' ? 0.86 : 0.42 });
    m.position.y = -0.08; // grip near the end of the handle
    g.add(m);
    if (id === 'nail_bat') {
      // a few nails through the top of the bat
      const steel = new THREE.MeshStandardMaterial({ color: 0x9a9c9e, metalness: 0.8, roughness: 0.4 });
      for (let i = 0; i < 6; i++) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), steel); n.position.set(0, 0.55 + i * 0.045, 0); n.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, i % 2 ? 0 : Math.PI / 2); g.add(n); }
    }
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: id === 'wrench' ? 0x9c3528 : 0x8a6a44, roughness: 0.6, metalness: id === 'wrench' ? 0.5 : 0 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, id === 'wrench' ? 0.4 : 0.8, 8), mat);
    stick.position.y = id === 'wrench' ? 0.12 : 0.32; g.add(stick);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // The bone lives inside the scaled skeleton: undo that scale so the weapon is life-size. A fist holds
  // a handle along the line of the knuckles, so aim the weapon from the little finger toward the index
  // finger, and put the grip just past the knuckles.
  hand.updateWorldMatrix(true, false);
  const s = hand.getWorldScale(v3).x;
  g.scale.setScalar(1 / s);
  const bone = (re) => hand.children.find((c) => c.isBone && re.test(c.name));
  const index = bone(/Index1$/), pinky = bone(/Pinky1$/), middle = bone(/Middle1$/);
  if (index && pinky && middle) {
    const along = middle.position.clone().normalize();
    // tipped a little toward the fingers, so a hanging arm holds the weapon angled down
    const axis = index.position.clone().sub(pinky.position).normalize().addScaledVector(along, 0.45).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    g.position.copy(index.position).add(pinky.position).multiplyScalar(0.5).addScaledVector(along, 0.035 / s);
  } else {
    g.position.set(0, 0.075 / s, 0.035 / s);
    g.rotation.set(Math.PI / 2, 0, 0);
  }
  hand.add(g);
  return g;
}

// ---------------------------------------------------------------- the pickup
const TRUCK_SCALE = 0.86, TRUCK_SHIFT = -0.33; // shift puts the middle of the wheelbase at the origin
export const PACK_WHEEL_POS = {
  wheelFL: { x: 1.34, z: -0.81 }, wheelFR: { x: 1.34, z: 0.81 },
  wheelRL: { x: -1.34, z: -0.81 }, wheelRR: { x: -1.34, z: 0.81 },
};
const PACK_WHEEL_R = 0.375;

// Put a pack vehicle part into game space: facing +x, scaled, wheelbase centred.
function vehiclePart(node, scale, shift) {
  const wrap = new THREE.Group();
  const n = node.clone(true);
  n.position.z += shift;
  wrap.add(n);
  wrap.rotation.y = FACE_X; wrap.scale.setScalar(scale);
  return wrap;
}
// A wheel on its own, with its origin at the hub so it can spin and steer.
function wheelUnit(model, side, scale) {
  const wrap = vehiclePart(pack.models[model].scene.getObjectByName(`FrontWheel_${side}`), scale, 0);
  const holder = new THREE.Group();
  holder.add(wrap);
  holder.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(holder).getCenter(new THREE.Vector3());
  wrap.position.sub(c);
  return holder;
}

// ---------------------------------------------------------------- the realistic pickup
// The Sketchfab truck (model units, faces +z, its +x is the driver's left). Same parts and interface
// as the pack pickup: four wheels on steerable, spinning pivots that can be removed one by one, glass
// lenses over the painted headlights and tail lights that light up, a bull bar shown in place of the
// front bumper, and the roof rack. Sized so its wheelbase matches the driving physics (2.76 m).
const LAMPS = { head: [[4.5, 5.92, 16.32], [-4.5, 5.92, 16.32]], tail: [[5.3, 6.56, -14.14], [-5.3, 6.56, -14.14]] };
function realTruck() {
  const src = pack.vehicles.truck.scene;
  src.updateMatrixWorld(true);
  const hubs = {};
  src.traverse((o) => { const m = /^wheel_([FR][LR])$/.exec(o.name); if (m) hubs[m[1]] = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); });
  if (Object.keys(hubs).length < 4) return null;
  const zMid = (hubs.FL.z + hubs.RL.z) / 2, k = 2.76 / (hubs.FL.z - hubs.RL.z);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // body: the model without its wheels, wheelbase centred on the origin, facing +x
  const wrap = new THREE.Group(), model = src.clone(true);
  model.traverse((o) => { if (/^wheel_/.test(o.name)) o.visible = false; });
  model.position.z = -zMid;
  wrap.add(model); wrap.rotation.y = FACE_X; wrap.scale.setScalar(k);
  body.add(wrap);
  const stockBumper = model.getObjectByName('bumper_front') || new THREE.Group();
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd4, emissive: 0xffe9a8, emissiveIntensity: 0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a2018, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.25, transparent: true, opacity: 0.6 });
  const lamps = new THREE.Group(), tails = new THREE.Group();
  for (const p of LAMPS.head) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.9, 0.12), lampMat); m.position.set(p[0], p[1], p[2] - zMid); lamps.add(m); }
  for (const p of LAMPS.tail) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.75, 0.12), tailMat); m.position.set(p[0], p[1], p[2] - zMid); tails.add(m); }
  wrap.add(lamps, tails);
  // bull bar: welded steel tubes in front of the bumper (model units)
  const steel = surface('paint', { tint: 0x55595b, metalness: 1 }) || new THREE.MeshStandardMaterial({ color: 0x34373a, metalness: 0.6, roughness: 0.5 });
  const bullbar = new THREE.Group();
  const tube = (x1, y1, z1, x2, y2, z2, r = 0.32) => {
    const a = new THREE.Vector3(x1, y1, z1 - zMid), b = new THREE.Vector3(x2, y2, z2 - zMid), len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), steel);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true; bullbar.add(m);
  };
  tube(-6.4, 3.4, 18.2, 6.4, 3.4, 18.2, 0.42); tube(-4.4, 7.6, 18.0, 4.4, 7.6, 18.0);
  for (const x of [-4.4, 4.4]) { tube(x, 2.6, 18.2, x, 7.6, 18.0); tube(x, 7.6, 18.0, x * 1.25, 3.4, 18.2); }
  for (const x of [-1.6, 1.6]) tube(x, 3.4, 18.2, x, 7.6, 18.0, 0.26);
  for (const x of [-4.4, 4.4]) tube(x, 3.0, 18.2, x, 3.0, 15.4, 0.36); // brackets back to the chassis
  const plate = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.25, 2.6), steel); plate.position.set(0, 2.5, 17.2 - zMid); plate.castShadow = true; bullbar.add(plate);
  wrap.add(bullbar);
  // roof rack (game units), on the cab roof
  const rackSteel = new THREE.MeshStandardMaterial({ color: 0x34373a, metalness: 0.6, roughness: 0.5 });
  const rack = new THREE.Group();
  const bar = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rackSteel); m.position.set(x, y, z); m.castShadow = true; rack.add(m); };
  bar(1.1, 0.05, 0.05, 0, 0, 0.6); bar(1.1, 0.05, 0.05, 0, 0, -0.6);
  for (const x of [-0.45, 0, 0.45]) bar(0.05, 0.05, 1.24, x, 0, 0);
  if (PR.has('crate')) { const c = PR.propModel('crate', { size: 0.9 }); c.position.set(-0.05, 0.03, 0.12); c.rotation.y = 0.2; rack.add(c); }
  else if (pack.ready) { const load = prop('chest', 1.0); load.position.set(-0.1, 0.03, 0.1); load.rotation.y = 0.3; rack.add(load); }
  const top = new THREE.Box3().setFromObject(wrap).max.y;
  rack.position.set((4.1 - zMid) * k, top + 0.02, 0);
  body.add(rack);
  const beam = new THREE.SpotLight(0xffe6b0, 0, 36, 0.52, 0.55, 1.2);
  beam.position.set((16.4 - zMid) * k, 0.9, 0);
  beam.target.position.set(12, 0, 0);
  root.add(beam, beam.target);
  // wheels: a pivot at each hub (steers) holding a spin group (rolls about the axle, game z)
  const wheelUnit = (side) => {
    const node = src.getObjectByName(`wheel_${side}`), c = hubs[side];
    // the wheel sits under the file's rotated, scaled root nodes: keep that whole transform, then centre the hub
    const n = node.clone(true);
    n.matrix.copy(node.matrixWorld); n.matrix.decompose(n.position, n.quaternion, n.scale);
    const centred = new THREE.Group(); centred.position.copy(c).negate(); centred.add(n);
    const w = new THREE.Group();
    w.add(centred); w.rotation.y = FACE_X; w.scale.setScalar(k);
    const spin = new THREE.Group(); spin.add(w);
    return spin;
  };
  const wheels = {};
  for (const [id, side] of [['wheelFL', 'FL'], ['wheelFR', 'FR'], ['wheelRL', 'RL'], ['wheelRR', 'RR']]) {
    const c = hubs[side];
    const pivot = new THREE.Group();
    pivot.position.set((c.z - zMid) * k, c.y * k, -c.x * k);
    const stub = new THREE.Group(); // blocks hold the axle up while the wheel is missing
    for (let i = 0; i < 2; i++) {
      const b = pack.ready ? prop('cinderblock', 1.15) : new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), steel);
      if (b.isMesh) b.position.y = 0.1;
      const g = new THREE.Group(); g.add(b); g.position.set(pivot.position.x + (i ? 0.03 : 0), i * 0.26, pivot.position.z * 0.86); g.rotation.y = i * 0.5 + 1.2;
      stub.add(g);
    }
    root.add(pivot, stub);
    wheels[id] = { pivot, stub, spin: null, kind: null, side };
  }
  function setWheel(id, itemId) {
    const w = wheels[id];
    if (w.kind === itemId) return;
    if (w.spin) w.pivot.remove(w.spin);
    w.spin = null;
    if (itemId) {
      w.spin = wheelUnit(w.side);
      if (itemId === 'wheel_offroad') { w.spin.children[0].scale.multiply(new THREE.Vector3(1.07, 1.07, 1.07)); w.spin.scale.set(1, 1, 1.22); } // chunkier off-road tyre
      w.pivot.add(w.spin);
    }
    w.kind = itemId;
    w.stub.visible = !itemId;
  }
  const blank = () => new THREE.Group();
  // lamps: the headlight lenses (shown when headlights are fitted); tail lenses are always there
  return { root, body, hoodPivot: blank(), engine: blank(), battery: blank(), radiator: blank(), bullbar, stockBumper, rack, lamps, lampMat, tailMat, beam, wheels, setWheel };
}

export function packTruck() {
  if (pack.vehicles.truck) { const t = realTruck(); if (t) return t; }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe9a8, emissiveIntensity: 0, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xa02a20, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
  const makeBody = (model, meshName) => {
    const part = vehiclePart(pack.models[model].scene.getObjectByName(meshName), TRUCK_SCALE, TRUCK_SHIFT);
    part.traverse((o) => { if (!o.isMesh) return; if (o.material.name === 'Headlights') o.material = lampMat; else if (o.material.name === 'BrakeLight') o.material = tailMat; });
    return part;
  };
  // Two bodies share one truck: the stock pickup, and the armoured one shown once a bull bar is fitted.
  const stockBumper = makeBody('pickup', 'Pickup'), bullbar = makeBody('pickup_armored', 'Pickup_Armored');
  body.add(stockBumper, bullbar);

  const steel = new THREE.MeshStandardMaterial({ color: 0x34373a, metalness: 0.6, roughness: 0.5 });
  const rack = new THREE.Group();
  const bar = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel); m.position.set(x, y, z); m.castShadow = true; rack.add(m); };
  bar(1.2, 0.05, 0.05, 0, 0, 0.62); bar(1.2, 0.05, 0.05, 0, 0, -0.62);
  for (const x of [-0.5, 0, 0.5]) bar(0.05, 0.05, 1.28, x, 0, 0);
  const load = prop('chest', 1.1); load.position.set(-0.1, 0.03, 0.1); load.rotation.y = 0.3; rack.add(load);
  rack.position.set(0.35, 1.66, 0);
  body.add(rack);

  const beam = new THREE.SpotLight(0xffe6b0, 0, 36, 0.52, 0.55, 1.2);
  beam.position.set(2.2, 0.9, 0);
  beam.target.position.set(12, 0, 0);
  root.add(beam, beam.target);

  const wheels = {};
  for (const id of Object.keys(PACK_WHEEL_POS)) {
    const p = PACK_WHEEL_POS[id];
    const pivot = new THREE.Group();
    pivot.position.set(p.x, PACK_WHEEL_R, p.z);
    const stub = new THREE.Group(); // cinder blocks hold the axle up while the wheel is missing
    for (let i = 0; i < 2; i++) { const b = prop('cinderblock', 1.15); b.position.set(p.x + (i ? 0.03 : 0), i * 0.26, p.z * 0.86); b.rotation.y = i * 0.5 + 1.2; stub.add(b); }
    root.add(pivot, stub);
    wheels[id] = { pivot, stub, spin: null, kind: null };
  }
  function setWheel(id, itemId) {
    const w = wheels[id];
    if (w.kind === itemId) return;
    if (w.spin) w.pivot.remove(w.spin);
    w.spin = null;
    if (itemId) {
      // off-road tyres use the chunkier wheels from the armoured model
      const offroad = itemId === 'wheel_offroad';
      w.spin = wheelUnit(offroad ? 'pickup_armored' : 'pickup', id.endsWith('L') ? 'L' : 'R', TRUCK_SCALE * (offroad ? 1.08 : 1));
      w.pivot.add(w.spin);
    }
    w.kind = itemId;
    w.stub.visible = !itemId;
  }
  const blank = () => new THREE.Group();
  return { root, body, hoodPivot: blank(), engine: blank(), battery: blank(), radiator: blank(), bullbar, stockBumper, rack, lamps: blank(), lampMat, tailMat, beam, wheels, setWheel };
}

// ---------------------------------------------------------------- realistic wrecks
// Sketchfab wrecks, about 4.4 m long, facing +x, centred on their footprint like the pack wrecks.
// `draws` are the random numbers the pack wreck used, so picking and tilting cost no extra draws
// (the world after this point is placed from the same random sequence and must not move).
const WRECK_BY_NAME = { 'Rolled pickup': ['crashed_truck', 0], 'Wrecked sedan': ['sedan', 0], 'Burnt-out van': ['burned_cars', 0], 'Abandoned hatchback': ['crashed_car', 0] };
const WRECK_POOL = [['crashed_car', 0], ['sedan', 0], ['burned_cars', 0], ['burned_cars', 1], ['crashed_truck', 0]];
export function realWreck(draws, name) {
  const pick = (name && WRECK_BY_NAME[name]) || WRECK_POOL[Math.floor((draws[0] ?? 0.5) * WRECK_POOL.length) % WRECK_POOL.length];
  const gltf = pack.vehicles[pick[0]];
  if (!gltf) return null;
  let node = gltf.scene;
  if (pick[0] === 'burned_cars') { const cars = []; gltf.scene.traverse((o) => { if (o.isMesh) cars.push(o); }); node = cars[pick[1]] || cars[0]; }
  const inner = node.clone(true);
  if (node !== gltf.scene) { node.updateWorldMatrix(true, false); inner.matrix.copy(node.matrixWorld); inner.matrix.decompose(inner.position, inner.quaternion, inner.scale); }
  const wrap = new THREE.Group(); wrap.add(inner);
  const size = new THREE.Box3().setFromObject(wrap).getSize(new THREE.Vector3());
  const length = pick[0] === 'crashed_truck' ? 4.8 : 4.4;
  wrap.scale.setScalar(length / size.z); wrap.rotation.y = FACE_X;
  const g = new THREE.Group(); g.add(wrap);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
  wrap.position.set(-c.x, -box.min.y - 0.04, -c.z);
  const n = draws.length;
  g.rotation.z = ((draws[n - 2] ?? 0.5) - 0.5) * 0.06; g.rotation.x = ((draws[n - 1] ?? 0.5) - 0.5) * 0.05;
  return g;
}

// ---------------------------------------------------------------- wrecks
const rusted = new Map();
function rustMaterial(m) {
  if (!rusted.has(m.uuid)) { const r = m.clone(); r.color.setHex(0x8f6548); r.roughness = 1; if (r.emissive) r.emissiveIntensity = 0; rusted.set(m.uuid, r); }
  return rusted.get(m.uuid);
}
const WRECKS = [['car_sports', 0.74], ['car_truck', 0.76], ['pickup', 0.8], ['car_sports', 0.74]];
export function packWreck(rng) {
  const [model, scale] = WRECKS[Math.floor(rng() * WRECKS.length)];
  const g = new THREE.Group();
  const wrap = vehiclePart(pack.models[model].scene, scale, 0);
  wrap.traverse((o) => {
    if (o.isMesh) o.material = rustMaterial(o.material);
    if ((o.name === 'FrontWheel_R' && rng() < 0.6) || (o.name === 'FrontWheel_L' && rng() < 0.4) || (o.name === 'BackWheels' && rng() < 0.35)) o.visible = false;
  });
  // centre it on its own footprint and sink it a little into the dirt
  g.add(wrap);
  g.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  wrap.position.x -= c.x; wrap.position.z -= c.z; wrap.position.y = -0.08;
  g.rotation.z = (rng() - 0.5) * 0.1; g.rotation.x = (rng() - 0.5) * 0.07;
  return g;
}
