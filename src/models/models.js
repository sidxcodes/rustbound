// Models built in code: buildings, furniture, containers and the fallback shapes used when the
// model files cannot be loaded. Surfaces use the photo textures from gfx/pbr.js (Poly Haven, CC0);
// if those are missing they fall back to the painted textures in textures.js.
// Convention: every model faces local +x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { pack, prop, packCharacter, packTruck, packWreck, realWreck, hasCharacter } from './pack.js';
import { surface, tileOf } from '../gfx/pbr.js';
import * as PR from './props.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + Object.entries(opts).map(([k, v]) => `${k}:${v && v.uuid ? v.uuid : v}`).join(',');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.04, ...opts }));
  return matCache.get(key);
}
// Colours from the old painted textures become a tint over the photo. The photos carry their own
// light and dark, so the tint is pulled toward white to keep the result from going muddy.
const WHITE = new THREE.Color(0xffffff), HSL = {};
// k: how far toward white; sat: how much of the colour's saturation to keep (weathered paint is dull)
export const soften = (hex, k = 0.45, sat = 0.75) => { const c = new THREE.Color(hex); c.getHSL(HSL); c.setHSL(HSL.h, HSL.s * sat, HSL.l); return c.lerp(WHITE, k).getHex(); };
export const woodMat = (base = 0x9a7648) => surface('planks', { tint: soften(base, 0.55) }) || mat(0xffffff, { map: TX.wood(base) });
export const paintMat = (base, rust = 0.4, opts = {}) => surface('paint', { tint: soften(base, 0.1, 0.42), metalness: 1, roughness: 1 }) || mat(0xffffff, { map: TX.paintedMetal(base, rust), ...opts });
export const concMat = () => surface('concrete', { tint: 0xd2cdc2, tile: true }) || mat(0xffffff, { map: TX.concrete() });
export const corrMat = (base = 0x8a9396) => surface('corrugated', { tint: soften(base, 0.4), metalness: 0.7 }) || mat(0xffffff, { map: TX.corrugated(base) });
export const barkMat = () => surface('bark', { tint: 0xc8bba8 }) || mat(0xffffff, { map: TX.bark() });
// Textured material, cached by key.
export function tmat(key, texture, opts = {}) {
  const k = 'T' + key;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0.04, ...opts }));
  return matCache.get(k);
}
const flat = (color, opts = {}) => mat(color, { flatShading: true, ...opts });
const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
  mesh.position.set(x, y, z);
  return mesh;
}
function rbox(w, h, d, m, x = 0, y = 0, z = 0, r = 0.08) {
  const mesh = shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), m));
  mesh.position.set(x, y, z);
  return mesh;
}
// Box whose texture repeats every `tile` metres instead of stretching over each face.
function tbox(w, h, d, m, x = 0, y = 0, z = 0, tile = 2.5) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile); }
  const mesh = shadow(new THREE.Mesh(geo, m));
  mesh.position.set(x, y, z);
  return mesh;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m));
  mesh.position.set(x, y, z);
  return mesh;
}
function capsule(r, len, m, x = 0, y = 0, z = 0) {
  const mesh = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m));
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------- truck
export const WHEEL_POS = {
  wheelFL: { x: 1.38, z: -0.92 }, wheelFR: { x: 1.38, z: 0.92 },
  wheelRL: { x: -1.38, z: -0.92 }, wheelRR: { x: -1.38, z: 0.92 },
};
const WHEEL_R = 0.43;

function buildWheel(offroad) {
  const spin = new THREE.Group();
  const w = offroad ? 0.36 : 0.27;
  const profile = [[0.25, -w / 2], [0.39, -w / 2], [WHEEL_R, -w / 2 + 0.05], [WHEEL_R, w / 2 - 0.05], [0.39, w / 2], [0.25, w / 2]].map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = shadow(new THREE.Mesh(new THREE.LatheGeometry(profile, 20), mat(0x1d1d1f, { roughness: 0.95 })));
  tyre.rotation.x = Math.PI / 2;
  const rim = cyl(0.26, 0.26, w * 0.82, mat(offroad ? 0xb65a2c : 0x9a9fa2, { metalness: 0.55, roughness: 0.5 }), 0, 0, 0, 16);
  rim.rotation.x = Math.PI / 2;
  const cap = cyl(0.09, 0.11, w * 0.9, mat(0x55585b, { metalness: 0.6 }), 0, 0, 0, 10);
  cap.rotation.x = Math.PI / 2;
  spin.add(tyre, rim, cap);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; spin.add(box(0.05, 0.05, w * 0.86, mat(0x2a2b2d), Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0)); }
  if (offroad) for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const t = box(0.1, 0.05, w * 0.96, mat(0x161617), Math.cos(a) * (WHEEL_R + 0.012), Math.sin(a) * (WHEEL_R + 0.012), 0); t.rotation.z = a + Math.PI / 2; spin.add(t); }
  return spin;
}

export function buildTruck() {
  if (pack.ready || pack.vehicles.truck) return packTruck();
  const root = new THREE.Group();
  const body = new THREE.Group(); // rolls and pitches on the "suspension"
  root.add(body);
  const paint = paintMat(0x7faaab, 0.45, { roughness: 0.7, metalness: 0.15 });
  const paintDark = paintMat(0x62898c, 0.7, { roughness: 0.75, metalness: 0.15 });
  const dark = mat(0x222527, { roughness: 0.9 }), chrome = mat(0xb9bdc0, { metalness: 0.8, roughness: 0.35 });
  const glass = mat(0x1e2f36, { roughness: 0.15, metalness: 0.6 }), woodM = woodMat();

  const tailMat = new THREE.MeshStandardMaterial({ color: 0xa02a20, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
  // chassis rails, axles, exhaust
  body.add(box(4.5, 0.16, 0.9, dark, 0, 0.5, 0), box(0.12, 0.12, 1.7, dark, 1.38, 0.44, 0), box(0.12, 0.12, 1.7, dark, -1.38, 0.44, 0));
  const pipe = cyl(0.05, 0.05, 1.6, mat(0x5a4636, { metalness: 0.5 }), -1.55, 0.42, 0.55, 8); pipe.rotation.z = Math.PI / 2; body.add(pipe);
  // nose: narrow engine cover between two separate rounded fenders
  body.add(rbox(1.36, 0.46, 1.16, paint, 1.56, 0.92, 0, 0.1));
  for (const s of [-1, 1]) {
    body.add(rbox(1.2, 0.36, 0.44, paint, 1.42, 0.86, s * 0.76, 0.16));      // front fender
    body.add(box(0.92, 0.3, 0.3, dark, 1.38, 0.62, s * 0.76));               // wheel arch shadow
    body.add(rbox(1.05, 0.3, 0.3, paintDark, -1.38, 0.9, s * 0.95, 0.12));   // rear fender bulge
    body.add(box(1.25, 0.05, 0.26, dark, 0.15, 0.5, s * 0.98));              // running board
    const mirror = box(0.05, 0.14, 0.2, dark, 0.7, 1.42, s * 1.02); body.add(mirror, box(0.04, 0.04, 0.14, dark, 0.7, 1.36, s * 0.93));
    body.add(box(0.14, 0.04, 0.03, chrome, -0.2, 1.08, s * 0.925));          // door handle
    body.add(box(0.02, 0.62, 0.02, dark, 0.78, 1.02, s * 0.918), box(0.02, 0.62, 0.02, dark, -0.5, 1.02, s * 0.918)); // door seams
    body.add(box(0.05, 0.12, 0.2, tailMat, -2.39, 0.98, s * 0.72)); // tail light
  }
  // grille and front detail
  body.add(box(0.06, 0.34, 0.9, dark, 2.25, 0.9, 0));
  for (let i = 0; i < 5; i++) body.add(box(0.07, 0.03, 0.86, chrome, 2.26, 0.78 + i * 0.065, 0));
  // cab
  body.add(rbox(1.5, 0.72, 1.82, paint, 0.15, 1.02, 0, 0.1));
  body.add(rbox(1.2, 0.66, 1.66, paint, 0.08, 1.68, 0, 0.16));
  body.add(box(0.05, 0.42, 1.36, glass, 0.685, 1.7, 0), box(0.05, 0.4, 1.3, glass, -0.525, 1.7, 0));
  body.add(box(0.86, 0.4, 0.04, glass, 0.08, 1.7, 0.815), box(0.86, 0.4, 0.04, glass, 0.08, 1.7, -0.815));
  body.add(box(0.04, 0.42, 1.68, paint, 0.08, 1.7, 0)); // B pillar seen through the glass
  // bed: plank floor, steel sides with a top rail, tailgate
  body.add(tbox(1.95, 0.08, 1.72, woodM, -1.4, 0.72, 0, 1.2));
  for (const s of [-1, 1]) { body.add(rbox(1.95, 0.46, 0.08, paint, -1.4, 0.98, s * 0.88, 0.03), box(1.95, 0.05, 0.11, dark, -1.4, 1.22, s * 0.88)); }
  body.add(rbox(0.08, 0.46, 1.8, paintDark, -2.34, 0.98, 0, 0.03), box(0.08, 0.46, 1.76, paint, -0.42, 0.98, 0));
  // cargo, tied down under a tarp
  body.add(rbox(0.62, 0.42, 0.62, woodM, -0.86, 1.0, 0.44, 0.02), rbox(0.5, 0.34, 0.5, woodM, -0.9, 0.94, -0.48, 0.02));
  const tarpM = mat(0xffffff, { map: TX.tarp() });
  const lump = rbox(0.95, 0.5, 1.5, tarpM, -1.68, 1.02, 0, 0.2); lump.rotation.y = 0.06; body.add(lump);
  body.add(rbox(0.26, 0.36, 0.16, mat(0x7a2e22, { metalness: 0.3 }), -1.2, 0.96, -0.02, 0.03)); // jerry can
  for (const x of [-1.5, -1.9]) body.add(box(0.03, 0.02, 1.8, mat(0xc9b88a), x, 1.28, 0)); // rope
  body.add(rbox(0.16, 0.16, 1.9, chrome, -2.4, 0.56, 0, 0.05)); // rear bumper

  // hood on a hinge at the windscreen; opens while the truck panel is up
  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0.9, 1.16, 0);
  hoodPivot.add(rbox(1.34, 0.07, 1.18, paint, 0.68, 0, 0, 0.03), box(1.2, 0.02, 0.03, chrome, 0.7, 0.045, 0));
  body.add(hoodPivot);
  // engine bay contents (seen with the hood up)
  const engine = new THREE.Group();
  engine.add(rbox(0.7, 0.26, 0.42, mat(0x4a4d50, { metalness: 0.55, roughness: 0.6 }), 1.5, 1.0, 0, 0.04), rbox(0.6, 0.07, 0.24, mat(0xa63c2e, { metalness: 0.3 }), 1.5, 1.15, 0, 0.02));
  for (let i = 0; i < 4; i++) engine.add(cyl(0.025, 0.025, 0.1, mat(0xd8d2c0), 1.28 + i * 0.15, 1.2, 0.06, 6));
  const fan = cyl(0.17, 0.17, 0.03, mat(0x2a2b2d), 1.92, 0.98, 0, 10); fan.rotation.z = Math.PI / 2; engine.add(fan);
  const battery = rbox(0.3, 0.2, 0.2, mat(0x1b2a34), 1.25, 1.03, 0.42, 0.02);
  battery.add(box(0.05, 0.05, 0.05, mat(0xc9a23a, { metalness: 0.6 }), -0.08, 0.12, 0), box(0.05, 0.05, 0.05, mat(0x9c2b22), 0.08, 0.12, 0));
  const radiator = box(0.08, 0.34, 0.86, mat(0x9aa0a3, { metalness: 0.65, roughness: 0.4 }), 2.14, 0.94, 0);
  body.add(engine, battery, radiator);

  // optional parts
  const steel = mat(0x34373a, { metalness: 0.6, roughness: 0.5 });
  const bullbar = new THREE.Group();
  bullbar.add(rbox(0.12, 0.12, 2.04, steel, 2.44, 0.6, 0, 0.04), rbox(0.1, 0.1, 1.5, steel, 2.44, 1.08, 0, 0.04));
  for (const z of [-0.7, -0.24, 0.24, 0.7]) bullbar.add(rbox(0.1, 0.56, 0.1, steel, 2.44, 0.84, z, 0.03));
  for (const z of [-0.95, 0.95]) bullbar.add(box(0.5, 0.08, 0.08, steel, 2.22, 0.6, z));
  const stockBumper = rbox(0.16, 0.16, 1.92, chrome, 2.36, 0.56, 0, 0.05);
  const rack = new THREE.Group();
  rack.add(box(1.3, 0.05, 0.05, steel, 0.08, 2.06, 0.74), box(1.3, 0.05, 0.05, steel, 0.08, 2.06, -0.74));
  for (const x of [-0.5, 0.08, 0.66]) rack.add(box(0.05, 0.05, 1.5, steel, x, 2.06, 0));
  for (const [x, z] of [[-0.5, 0.74], [-0.5, -0.74], [0.66, 0.74], [0.66, -0.74]]) rack.add(box(0.04, 0.1, 0.04, steel, x, 2.0, z));
  rack.add(rbox(0.7, 0.24, 0.5, woodM, -0.1, 2.2, 0.3, 0.02), rbox(0.5, 0.22, 0.5, tarpM, 0.3, 2.2, -0.34, 0.08));
  body.add(bullbar, stockBumper, rack);

  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe9a8, emissiveIntensity: 0, roughness: 0.3 });
  const lamps = new THREE.Group();
  for (const s of [-1, 1]) {
    const ring = cyl(0.15, 0.15, 0.08, chrome, 2.0, 0.9, s * 0.76, 14); ring.rotation.z = Math.PI / 2;
    const lens = cyl(0.12, 0.12, 0.09, lampMat, 2.005, 0.9, s * 0.76, 14); lens.rotation.z = Math.PI / 2;
    lamps.add(ring, lens);
  }
  body.add(lamps);
  const beam = new THREE.SpotLight(0xffe6b0, 0, 36, 0.52, 0.55, 1.2);
  beam.position.set(2.3, 1.0, 0);
  beam.target.position.set(12, 0, 0);
  root.add(beam, beam.target);

  // wheels: pivot (steer) > spin group, plus a block that shows when the wheel is missing
  const wheels = {};
  for (const id of Object.keys(WHEEL_POS)) {
    const p = WHEEL_POS[id];
    const pivot = new THREE.Group();
    pivot.position.set(p.x, WHEEL_R, p.z);
    const stub = new THREE.Group();
    const hub = cyl(0.14, 0.14, 0.12, mat(0x6a4028, { metalness: 0.4 }), p.x, WHEEL_R, p.z * 0.96, 10); hub.rotation.x = Math.PI / 2;
    stub.add(hub, tbox(0.52, 0.3, 0.36, concMat(), p.x, 0.15, p.z * 0.82, 0.6));
    root.add(pivot, stub);
    wheels[id] = { pivot, stub, spin: null, kind: null };
  }
  function setWheel(id, itemId) {
    const w = wheels[id];
    if (w.kind === itemId) return;
    if (w.spin) w.pivot.remove(w.spin);
    w.spin = itemId ? buildWheel(itemId === 'wheel_offroad') : null;
    if (w.spin) w.pivot.add(w.spin);
    w.kind = itemId;
    w.stub.visible = !itemId;
  }
  return { root, body, hoodPivot, engine, battery, radiator, bullbar, stockBumper, rack, lamps, lampMat, tailMat, beam, wheels, setWheel };
}

export function buildWreck(rng, name) {
  if (pack.ready) {
    // record the pack wreck's random draws: the realistic wreck reuses them instead of drawing new ones
    const draws = [], rec = () => { const v = rng(); draws.push(v); return v; };
    const old = packWreck(rec);
    return realWreck(draws, name) || old;
  }
  const g = new THREE.Group();
  const colors = [0x8a5a3a, 0x6f6456, 0x56646e, 0x86743e, 0x7c4a40];
  const paint = mat(0xffffff, { map: TX.paintedMetal(colors[Math.floor(rng() * colors.length)], 0.95), roughness: 0.9 });
  const dark = mat(0x1c1d1e), soot = mat(0x2a2623);
  g.add(rbox(4.0, 0.5, 1.7, paint, 0, 0.42, 0, 0.12), rbox(1.8, 0.14, 1.5, paint, -0.25, 1.24, 0, 0.06), box(4.0, 0.12, 1.4, dark, 0, 0.14, 0));
  for (const [x, z] of [[0.6, 0.72], [0.6, -0.72], [-1.1, 0.72], [-1.1, -0.72]]) g.add(box(0.07, 0.55, 0.07, paint, x, 0.92, z)); // bare window pillars
  g.add(box(1.6, 0.5, 1.4, soot, -0.25, 0.7, 0)); // burnt-out interior
  const hood = rbox(1.0, 0.06, 1.5, paint, 1.5, 0.92, 0, 0.02); hood.rotation.z = 0.5 + rng() * 0.4; hood.position.y = 1.0; g.add(hood);
  g.add(rbox(0.6, 0.3, 0.5, mat(0x3a3c3e, { metalness: 0.4 }), 1.4, 0.6, 0, 0.04));
  if (rng() < 0.7) { const flat = cyl(0.4, 0.4, 0.24, mat(0x1b1b1c), -1.3, 0.2, 0.86, 12); flat.rotation.x = Math.PI / 2; flat.scale.y = 1; g.add(flat); }
  if (rng() < 0.5) { const off = cyl(0.42, 0.42, 0.24, mat(0x1b1b1c), 1.9 + rng(), 0.12, 1.6, 12); g.add(off); }
  g.rotation.z = (rng() - 0.5) * 0.09; g.rotation.x = (rng() - 0.5) * 0.06;
  return g;
}

// ---------------------------------------------------------------- characters
export function buildCharacter({ shirt = 0x3f6a8a, pants = 0x3b3a36, skin = 0xd3a27c, pack: backpack = true, husk = false, fast = false } = {}) {
  const kind = husk ? (fast ? 'zombie_chubby' : 'zombie_basic') : 'survivor';
  if (hasCharacter(kind)) return packCharacter(kind);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirtM = mat(0xffffff, { map: TX.cloth(shirt) }), pantsM = mat(0xffffff, { map: TX.cloth(pants) }), skinM = mat(skin, { roughness: 0.75 });
  const boot = mat(0x2a221c);
  // torso and hips
  const torso = capsule(0.2, 0.32, shirtM, 0, 1.2, 0); torso.scale.set(0.85, 1, 1.18);
  const hips = capsule(0.17, 0.1, pantsM, 0, 0.9, 0); hips.scale.set(0.85, 1, 1.15);
  const neck = cyl(0.06, 0.07, 0.1, skinM, 0.01, 1.5, 0, 8);
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinM)); head.position.set(0.02, 1.64, 0); head.scale.set(1, 1.08, 0.95);
  body.add(torso, hips, neck, head);
  if (husk) {
    body.add(box(0.1, 0.03, 0.12, mat(0x1a1210), 0.13, 1.62, 0)); // hollow face
    body.add(box(0.2, 0.26, 0.04, mat(0x4a1a14), 0.16, 1.2, 0.08)); // old wound
  } else {
    const hair = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, 0, 7, 0, 1.7), mat(0x3a2c20))); hair.position.set(0, 1.66, 0); body.add(hair);
    body.add(rbox(0.3, 0.1, 0.3, mat(0x55606a), 0.02, 1.76, 0, 0.04), rbox(0.16, 0.03, 0.24, mat(0x444e57), 0.2, 1.73, 0, 0.01)); // cap
    body.add(box(0.33, 0.05, 0.42, mat(0x2a221c), 0, 0.98, 0)); // belt
  }
  if (backpack) {
    const canvas = mat(0xffffff, { map: TX.cloth(0x8a7a4a) });
    body.add(rbox(0.22, 0.44, 0.38, canvas, -0.26, 1.2, 0, 0.07), rbox(0.1, 0.16, 0.26, canvas, -0.38, 1.1, 0, 0.03));
    const roll = cyl(0.08, 0.08, 0.4, mat(0x5b6b3a), -0.24, 1.47, 0, 8); roll.rotation.x = Math.PI / 2; body.add(roll);
    for (const s of [-1, 1]) body.add(box(0.26, 0.3, 0.035, mat(0x4a3f2a), -0.04, 1.26, s * 0.17));
  }
  // jointed limbs: pivot at hip/shoulder, second pivot at knee/elbow
  const limb = (upperM, lowerM, r, upper, lower, x, y, z, endM, endSize) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    pivot.add(capsule(r, upper - r * 2, upperM, 0, -upper / 2, 0));
    const joint = new THREE.Group(); joint.position.set(0, -upper, 0);
    joint.add(capsule(r * 0.88, lower - r * 2, lowerM, 0, -lower / 2, 0));
    if (endM) joint.add(rbox(endSize[0], endSize[1], endSize[2], endM, endSize[0] * 0.2, -lower - 0.01, 0, 0.03));
    pivot.add(joint); body.add(pivot);
    return { pivot, joint };
  };
  const armSkin = husk ? skinM : shirtM;
  const lL = limb(pantsM, pantsM, 0.085, 0.42, 0.42, 0, 0.86, -0.12, boot, [0.26, 0.1, 0.13]);
  const lR = limb(pantsM, pantsM, 0.085, 0.42, 0.42, 0, 0.86, 0.12, boot, [0.26, 0.1, 0.13]);
  const aL = limb(armSkin, skinM, 0.065, 0.3, 0.3, 0, 1.42, -0.29, skinM, [0.09, 0.09, 0.08]);
  const aR = limb(armSkin, skinM, 0.065, 0.3, 0.3, 0, 1.42, 0.29, skinM, [0.09, 0.09, 0.08]);
  const hand = new THREE.Group();
  hand.position.set(0, -0.3, 0);
  aR.joint.add(hand);
  if (husk) { body.rotation.z = -0.2; aL.pivot.rotation.z = 1.15; aR.pivot.rotation.z = 1.3; aL.joint.rotation.z = 0.3; head.position.x = 0.07; head.rotation.z = -0.3; }
  return { root, body, legL: lL.pivot, legR: lR.pivot, kneeL: lL.joint, kneeR: lR.joint, armL: aL.pivot, armR: aR.pivot, elbowL: aL.joint, elbowR: aR.joint, hand, husk };
}

export function buildWeapon(id) {
  const g = new THREE.Group();
  if (id === 'wrench') {
    g.add(cyl(0.03, 0.03, 0.55, mat(0xb03a2e, { metalness: 0.5, roughness: 0.5 }), 0, -0.25, 0, 8), rbox(0.16, 0.13, 0.06, mat(0xa3a8ab, { metalness: 0.7, roughness: 0.4 }), 0.03, -0.56, 0, 0.02), box(0.08, 0.05, 0.065, mat(0x8a8f92, { metalness: 0.7 }), 0.06, -0.47, 0));
  } else if (id === 'nail_bat') {
    g.add(rbox(0.07, 0.85, 0.1, woodMat(), 0, -0.36, 0, 0.02));
    for (let i = 0; i < 5; i++) g.add(cyl(0.008, 0.008, 0.2, mat(0xb8bcc0, { metalness: 0.7 }), 0, -0.52 - i * 0.055, 0, 4).rotateX(i % 2 ? Math.PI / 2 : 0).rotateZ(i % 2 ? 0 : Math.PI / 2));
  }
  g.rotation.z = Math.PI / 2.4;
  return g;
}

// Walk cycle shared by player and husks. `t` is a running phase, `amount` 0..1.
export function animateWalk(ch, t, amount) {
  const s = Math.sin(t) * 0.75 * amount;
  ch.legL.rotation.z = s; ch.legR.rotation.z = -s;
  // knees bend on the back-swing so feet lift
  ch.kneeL.rotation.z = -Math.max(0, Math.sin(t + 1.2)) * 0.9 * amount;
  ch.kneeR.rotation.z = -Math.max(0, Math.sin(t + 1.2 + Math.PI)) * 0.9 * amount;
  if (!ch.husk) { ch.armL.rotation.z = -s * 0.8; ch.elbowL.rotation.z = 0.25 + Math.max(0, -s) * 0.5; ch.elbowR.rotation.z = 0.25; }
  ch.body.position.y = Math.abs(Math.cos(t)) * 0.045 * amount;
  ch.body.rotation.x = Math.sin(t) * 0.05 * amount;
}

// ---------------------------------------------------------------- props
function tyreMesh() {
  const profile = [[0.24, -0.13], [0.39, -0.13], [0.43, -0.08], [0.43, 0.08], [0.39, 0.13], [0.24, 0.13]].map(([r, y]) => new THREE.Vector2(r, y));
  return shadow(new THREE.Mesh(new THREE.LatheGeometry(profile, 16), mat(0x1d1d1f, { roughness: 0.95 })));
}
export { tyreMesh };

function crate(size = 0.9, h = 0.7) {
  const g = new THREE.Group(), woodM = woodMat(), frame = woodMat(0x6f5230);
  g.add(tbox(size, h, size, woodM, 0, h / 2, 0, 0.9));
  for (const s of [-1, 1]) {
    g.add(box(size + 0.05, 0.09, 0.09, frame, 0, h - 0.045, s * (size / 2)), box(size + 0.05, 0.09, 0.09, frame, 0, 0.045, s * (size / 2)));
    g.add(box(0.09, 0.09, size + 0.05, frame, s * (size / 2), h - 0.045, 0), box(0.09, h, 0.09, frame, s * (size / 2), h / 2, s * (size / 2)), box(0.09, h, 0.09, frame, s * (size / 2), h / 2, -s * (size / 2)));
  }
  return g;
}

export function buildContainer(kind, rng, name) {
  const g = new THREE.Group();
  let radius = 0.6, boxCol = null;
  // Poly Haven models first. The random draws match the older model-pack path exactly, so the rest of
  // the world (placed later from the same random sequence) does not move.
  if (PR.has('crate') && kind === 'crate') {
    const c = PR.propModel('crate', { size: 1.15 }); c.rotation.y = pack.ready ? rng() * 0.6 - 0.3 : 0.15; g.add(c);
    const lid = PR.propModel('box', { size: 0.42 }); lid.position.set(0.2, 0.43, 0.02); lid.rotation.y = 0.5; g.add(lid);
    radius = 0.55;
  } else if (PR.has('barrel') && kind === 'barrel') {
    g.add(PR.propModel('barrel_green', { height: 0.95 })); radius = 0.42;
  } else if (PR.has('tyre') && kind === 'tires') {
    for (let i = 0; i < 4; i++) { const { group: t, thickness: th } = PR.flatTyre(0.8); t.rotation.y = i * 0.7; t.position.set((i % 2) * 0.04 - 0.02, th * (i + 0.5), 0); g.add(t); }
    const lean = PR.propModel('tyre', { size: 0.72 }); lean.rotation.set(0, 0.3, -0.35); lean.position.set(0.62, 0.02, -0.05); g.add(lean);
    radius = 0.55;
  } else if (PR.has('shelf') && kind === 'shelf') {
    const s = PR.propModel('shelf'); s.scale.set(1.72, 0.95, 0.82); g.add(s);
    const top = PR.propModel('box', { size: 0.45 }); top.position.set(-0.4, 1.8, 0); g.add(top);
    const can = PR.propModel('jerrycan', { height: 0.45 }); can.position.set(0.5, 0.06, 0.02); can.rotation.y = 1.4; g.add(can);
    boxCol = [0.8, 0.26];
  } else if (PR.has('toolbox') && kind === 'toolbox') {
    const woodM = woodMat(0x7a5a38);
    g.add(tbox(1.5, 0.08, 0.7, woodM, 0, 0.8, 0, tileOf('planks', 0.8)));
    for (const [x, z] of [[-0.68, -0.28], [0.68, -0.28], [-0.68, 0.28], [0.68, 0.28]]) g.add(box(0.08, 0.78, 0.08, woodM, x, 0.39, z));
    g.add(box(1.4, 0.05, 0.6, woodM, 0, 0.3, 0));
    const tb = PR.propModel('toolbox', { size: 0.5 }); tb.position.set(0.25, 0.84, 0); tb.rotation.y = 0.15; g.add(tb);
    const can = PR.propModel('jerrycan', { height: 0.42 }); can.position.set(-0.35, 0.33, 0.05); can.rotation.y = 1.2; g.add(can);
    boxCol = [0.75, 0.38];
  } else if (pack.ready && kind === 'crate') { const c = prop('chest', 1.5); c.rotation.y = rng() * 0.6 - 0.3; g.add(c); radius = 0.55; }
  else if (pack.ready && kind === 'barrel') { g.add(prop('barrel', 0.95)); radius = 0.42; }
  else if (pack.ready && kind === 'tires') { g.add(prop('wheels_stack', 1.55)); radius = 0.55; }
  else if (kind === 'crate') {
    g.add(crate());
    const lid = box(0.96, 0.05, 0.96, woodMat(0x86683c), 0.06, 0.73, 0.04); lid.rotation.y = 0.12; g.add(lid);
  } else if (kind === 'barrel') {
    const m = paintMat(0x2f6e6a, 0.6, { metalness: 0.3 });
    g.add(cyl(0.37, 0.37, 0.95, m, 0, 0.475, 0, 18));
    for (const y of [0.04, 0.34, 0.64, 0.92]) g.add(cyl(0.385, 0.385, 0.04, mat(0x244c4a, { metalness: 0.4 }), 0, y, 0, 18));
    g.add(cyl(0.05, 0.05, 0.04, mat(0x2a2b2d), 0.2, 0.97, 0.05, 8));
    radius = 0.45;
  } else if (kind === 'toolbox') {
    const woodM = woodMat(0x7a5a38);
    g.add(tbox(1.5, 0.08, 0.7, woodM, 0, 0.8, 0, 0.8));
    for (const [x, z] of [[-0.68, -0.28], [0.68, -0.28], [-0.68, 0.28], [0.68, 0.28]]) g.add(box(0.08, 0.78, 0.08, woodM, x, 0.39, z));
    g.add(box(1.4, 0.05, 0.6, woodM, 0, 0.3, 0));
    g.add(rbox(0.62, 0.24, 0.3, paintMat(0xb03a2e, 0.3, { metalness: 0.3 }), 0.15, 0.96, 0, 0.03), box(0.3, 0.03, 0.05, mat(0x1c1c1c), 0.15, 1.11, 0));
    g.add(rbox(0.3, 0.12, 0.2, mat(0x55585b, { metalness: 0.5 }), -0.45, 0.9, 0.1, 0.02), cyl(0.07, 0.07, 0.16, mat(0x2f6e6a), -0.35, 0.41, 0.1, 10));
    boxCol = [0.75, 0.38];
  } else if (kind === 'shelf') {
    const steel = paintMat(0x5d676b, 0.5, { metalness: 0.4 });
    for (const [x, z] of [[-0.78, -0.2], [0.78, -0.2], [-0.78, 0.2], [0.78, 0.2]]) g.add(box(0.05, 1.75, 0.05, steel, x, 0.875, z));
    for (const y of [0.2, 0.75, 1.3, 1.72]) g.add(box(1.6, 0.04, 0.46, steel, 0, y, 0));
    g.add(crate(0.34, 0.26).translateX(-0.45).translateY(0.77), rbox(0.24, 0.3, 0.24, mat(0x2f6e6a, { metalness: 0.3 }), 0.4, 0.37, 0.02, 0.03));
    g.add(cyl(0.09, 0.09, 0.22, mat(0xb9a44a, { metalness: 0.4 }), 0.1, 0.88, 0, 10), cyl(0.09, 0.09, 0.22, mat(0x9c3a2e, { metalness: 0.4 }), 0.32, 0.88, 0.05, 10), rbox(0.5, 0.18, 0.3, mat(0xffffff, { map: TX.cloth(0x6a6050) }), -0.3, 1.41, 0, 0.05));
    boxCol = [0.8, 0.26];
  } else if (kind === 'locker') {
    const m = paintMat(0x58747e, 0.5, { metalness: 0.35 });
    g.add(rbox(0.5, 1.8, 0.9, m, 0, 0.9, 0, 0.03), box(0.02, 1.7, 0.02, mat(0x1c1c1c), 0.255, 0.9, 0));
    for (const z of [-0.22, 0.22]) { for (let i = 0; i < 3; i++) g.add(box(0.02, 0.02, 0.24, mat(0x1c1c1c), 0.255, 1.5 + i * 0.06, z)); g.add(box(0.03, 0.1, 0.03, mat(0xb9bdc0, { metalness: 0.7 }), 0.265, 0.95, z + (z < 0 ? 0.16 : -0.16))); }
    boxCol = [0.26, 0.46];
  } else if (kind === 'tires') {
    for (let i = 0; i < 4; i++) { const t = tyreMesh(); t.position.set((rng() - 0.5) * 0.12, 0.13 + i * 0.26, (rng() - 0.5) * 0.12); g.add(t); }
    const lean = tyreMesh(); lean.position.set(0.62, 0.4, 0.1); lean.rotation.z = 1.25; g.add(lean);
    radius = 0.5;
  } else if (kind === 'wreck') {
    g.add(buildWreck(rng, name));
    boxCol = [2.05, 0.9];
  }
  return { group: g, radius, boxCol };
}

export function buildPump() {
  const g = new THREE.Group();
  const red = paintMat(0xb23a2c, 0.5, { metalness: 0.3 });
  g.add(tbox(1.0, 0.14, 0.8, concMat(), 0, 0.07, 0, 1), rbox(0.6, 1.35, 0.44, red, 0, 0.85, 0, 0.06), rbox(0.66, 0.2, 0.5, mat(0xe6dcc0), 0, 1.62, 0, 0.05));
  g.add(box(0.44, 0.34, 0.03, mat(0x1a1f22, { roughness: 0.2 }), 0, 1.22, 0.225), box(0.44, 0.34, 0.03, mat(0x1a1f22, { roughness: 0.2 }), 0, 1.22, -0.225));
  g.add(cyl(0.025, 0.025, 0.8, mat(0x161616), 0.33, 0.95, 0, 6), rbox(0.08, 0.2, 0.08, mat(0x2a2b2d, { metalness: 0.5 }), 0.33, 0.62, 0, 0.02));
  return g;
}

// A building is four walls with a door gap, a floor and a roof that fades when you are inside.
const WALL_STYLE = { garage: 'metal', workshop: 'metal', cabin: 'wood' };
export function buildBuilding(b) {
  const g = new THREE.Group();
  const H = 2.7, T = 0.25;
  const style = WALL_STYLE[b.id] || 'plaster';
  const wallKind = { metal: 'corrugated', wood: 'siding', plaster: 'plaster' }[style];
  const wall = surface(wallKind, { tint: soften(b.color, style === 'wood' ? 0.6 : 0.3), metalness: style === 'metal' ? 0.7 : 0, tile: style === 'plaster' })
    || mat(0xffffff, { map: style === 'metal' ? TX.corrugated(b.color) : style === 'wood' ? TX.wood(b.color) : TX.plaster(b.color) });
  const wallTile = style === 'plaster' ? 3.2 : tileOf(wallKind, 2.7);
  const trim = woodMat(0x4a3a2c), base = concMat();
  const glass = mat(0x1a252b, { roughness: 0.2, metalness: 0.5 }), board = woodMat(0x8a6e48);
  const colliders = [];
  const addWall = (x, z, hw, hd) => {
    g.add(tbox(hw * 2, H, hd * 2, wall, x, H / 2, z, wallTile));
    g.add(tbox(hw * 2 + 0.06, 0.32, hd * 2 + 0.06, base, x, 0.16, z, tileOf('concrete', 1.5)));
    colliders.push({ x: b.x + x, z: b.z + z, hw, hd });
  };
  // a boarded-up window on the outside and inside faces of a wall
  const addWindow = (x, z, horiz) => {
    const w = 1.3, h = 1.0, y = 1.55;
    const pane = horiz ? box(w, h, T * 2 + 0.04, glass, x, y, z) : box(T * 2 + 0.04, h, w, glass, x, y, z);
    g.add(pane);
    for (const s of [-1, 1]) {
      const off = s * (T + 0.05);
      const frameH = horiz ? box(w + 0.16, 0.08, 0.05, trim, x, y + h / 2, z + off) : box(0.05, 0.08, w + 0.16, trim, x + off, y + h / 2, z);
      const sill = horiz ? box(w + 0.24, 0.07, 0.12, trim, x, y - h / 2, z + off) : box(0.12, 0.07, w + 0.24, trim, x + off, y - h / 2, z);
      g.add(frameH, sill);
      for (const [dy, tilt] of [[0.2, 0.12], [-0.18, -0.09]]) {
        const plank = horiz ? box(w + 0.3, 0.16, 0.04, board, x, y + dy, z + off * 1.15) : box(0.04, 0.16, w + 0.3, board, x + off * 1.15, y + dy, z);
        if (horiz) plank.rotation.z = tilt; else plank.rotation.x = tilt;
        g.add(plank);
      }
    }
  };
  const sides = { n: { horiz: true, z: -b.hd }, s: { horiz: true, z: b.hd }, w: { horiz: false, x: -b.hw }, e: { horiz: false, x: b.hw } };
  for (const [name, s] of Object.entries(sides)) {
    const len = s.horiz ? b.hw : b.hd;
    if (name === b.door) {
      const seg = (len - b.doorW / 2) / 2;
      for (const sign of [-1, 1]) {
        const c = sign * (b.doorW / 2 + seg);
        if (s.horiz) addWall(c, s.z, seg, T); else addWall(s.x, c, T, seg);
      }
      // door frame: lintel and two posts
      if (s.horiz) { g.add(box(b.doorW + 0.3, 0.36, T * 2 + 0.08, trim, 0, H - 0.18, s.z)); for (const sg of [-1, 1]) g.add(box(0.14, H, T * 2 + 0.08, trim, sg * (b.doorW / 2), H / 2, s.z)); }
      else { g.add(box(T * 2 + 0.08, 0.36, b.doorW + 0.3, trim, s.x, H - 0.18, 0)); for (const sg of [-1, 1]) g.add(box(T * 2 + 0.08, H, 0.14, trim, s.x, H / 2, sg * (b.doorW / 2))); }
      // a door hanging open on small buildings
      if (b.doorW < 3 && s.horiz) { const door = tbox(0.06, 2.2, b.doorW - 0.2, board, -b.doorW / 2 + 0.05, 1.1, s.z + Math.sign(s.z) * (b.doorW / 2 - 0.1), 1.2); door.rotation.y = 0.25; g.add(door); }
    } else {
      if (s.horiz) addWall(0, s.z, len + T, T); else addWall(s.x, 0, T, len + T);
      if (style !== 'metal') for (const c of len > 4.4 ? [-len / 2, len / 2] : [0]) { if (s.horiz) addWindow(c, s.z, true); else addWindow(s.x, c, false); }
    }
  }
  const floorKind = style === 'metal' ? 'concrete' : 'floor';
  const floorMat = surface(floorKind, { tint: style === 'metal' ? 0xbdb8ae : 0xc4b8a6 }) || mat(0xffffff, { map: style === 'metal' ? TX.concrete() : TX.wood(0x6e5a44) });
  const floor = tbox(b.hw * 2, 0.06, b.hd * 2, floorMat, 0, 0.03, 0, tileOf(floorKind, style === 'metal' ? 3 : 1.6));
  floor.castShadow = false;
  g.add(floor);

  // roof: one material instance per building so it can fade alone
  const roofKind = style === 'metal' ? 'rustroof' : 'roof';
  const roofMat = surface(roofKind, { unique: true, transparent: true, opacity: 1, tint: style === 'wood' ? 0xa89c8c : 0xb4bcc0, metalness: style === 'metal' ? 0.6 : 0 })
    || new THREE.MeshStandardMaterial({ map: style === 'metal' ? TX.corrugated(0x6d5a4e) : TX.roofing(style === 'wood' ? 0x4c4038 : 0x6a4438), roughness: 0.95, transparent: true, opacity: 1 });
  const rt = tileOf(roofKind, 2);
  const roof = new THREE.Group();
  if (style === 'metal') {
    const slab = tbox(b.hw * 2 + 1.0, 0.16, b.hd * 2 + 1.0, roofMat, 0, H + 0.2, 0, rt); slab.rotation.x = 0.045;
    roof.add(slab, tbox(b.hw * 2 + 1.1, 0.14, 0.14, roofMat, 0, H + 0.02, b.hd + 0.52, rt), tbox(1.1, 0.5, 0.9, roofMat, b.hw * 0.4, H + 0.5, -b.hd * 0.3, rt));
  } else {
    // gabled roof: two slopes meeting at a ridge along the long side
    const pitch = 0.42, run = b.hd + 0.55, slope = run / Math.cos(pitch);
    for (const s of [-1, 1]) {
      const half = tbox(b.hw * 2 + 0.9, 0.14, slope, roofMat, 0, H + 0.08 + (Math.sin(pitch) * slope) / 2, s * (run / 2), rt);
      half.rotation.x = s * pitch;
      roof.add(half);
    }
    roof.add(tbox(b.hw * 2 + 1.0, 0.12, 0.3, roofMat, 0, H + 0.16 + Math.sin(pitch) * slope, 0, rt));
    roof.add(tbox(0.5, 1.1, 0.5, roofMat, -b.hw * 0.5, H + 0.9, -b.hd * 0.35, 1)); // chimney
  }
  g.add(roof);
  g.position.set(b.x, 0, b.z);
  return { group: g, roof, roofMats: [roofMat], colliders };
}

export function buildCanopy() {
  const g = new THREE.Group();
  const white = paintMat(0xd8d2c0, 0.4), red = paintMat(0xb23a2c, 0.12);
  for (const [x, z] of [[-5, -2], [5, -2], [-5, 2.6], [5, 2.6]]) g.add(cyl(0.14, 0.16, 3.6, white, x, 1.8, z, 10), tbox(0.5, 0.3, 0.5, concMat(), x, 0.15, z, 1));
  g.add(tbox(12, 0.34, 6.4, red, 0, 3.78, 0.3, 3), tbox(12.2, 0.14, 6.6, white, 0, 3.56, 0.3, 3));
  g.add(tbox(11, 0.2, 2.2, concMat(), 0, 0.1, 0, 2)); // pump island
  // strip lights under the roof, switched on at dusk by the world
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e2, emissive: 0xfff1cf, emissiveIntensity: 0.1 });
  for (const x of [-3, 3]) g.add(box(2.4, 0.06, 0.3, lampMat, x, 3.46, 0.3));
  const light = new THREE.PointLight(0xfff0d0, 0, 26, 1.5);
  light.position.set(0, 3.2, 0.3);
  g.add(light);
  return { group: g, light, lampMat };
}

export function buildSign(text, bg, fg, height = 5) {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.11, height, mat(0x7d8286, { metalness: 0.5 }), 0, height / 2, 0, 8));
  const face = new THREE.MeshStandardMaterial({ map: TX.signText(text, bg, fg), roughness: 0.8 });
  const edge = mat(0x4a4d50);
  const board = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 2.8), [face, face, edge, edge, edge, edge]));
  board.position.y = height - 0.5;
  g.add(board);
  return g;
}

export function buildOutpost() {
  const g = new THREE.Group();
  const steel = paintMat(0x5d676b, 0.6, { metalness: 0.3 }), woodM = woodMat();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.09, 0.13, 9, steel, x, 4.5, z, 8));
  for (const y of [2.2, 4.6, 7]) for (const s of [-1, 1]) { const br = box(2.9, 0.06, 0.06, steel, 0, y, s); br.rotation.z = s * 0.5; g.add(br); const br2 = box(0.06, 0.06, 2.9, steel, s, y, 0); br2.rotation.x = s * 0.5; g.add(br2); }
  g.add(tbox(3.2, 0.16, 3.2, woodM, 0, 9, 0, 1.2));
  for (const s of [-1, 1]) g.add(tbox(3.2, 0.9, 0.08, corrMat(0x5b6b4a), 0, 9.55, s * 1.56, 1.6), tbox(0.08, 0.9, 3.2, corrMat(0x5b6b4a), s * 1.56, 9.55, 0, 1.6));
  g.add(tbox(3.6, 0.1, 3.6, corrMat(0x6d5a4e), 0, 11.3, 0, 1.6));
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) g.add(box(0.08, 1.3, 0.08, woodM, x, 10.65, z));
  g.add(cyl(0.04, 0.04, 3, steel, 1.5, 12.8, 1.5, 6), box(1.3, 0.8, 0.03, mat(0xd08a2e), 2.18, 13.8, 1.5));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffc46a, emissive: 0xffa53a, emissiveIntensity: 2.5 }));
  lamp.position.set(0, 10.9, 0);
  g.add(lamp);
  const light = new THREE.PointLight(0xffb45a, 70, 44, 1.6);
  light.position.set(0, 10.4, 0);
  g.add(light);
  // camp at the foot of the tower: tents, crates, sandbags
  for (const [x, z, r] of [[-6, 10, 0.3], [-11, 13, -0.4]]) {
    const tent = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 1.7, 1.6, 4), mat(0xffffff, { map: TX.tarp(0x6a6a4a) }))); tent.position.set(x, 0.8, z); tent.rotation.y = Math.PI / 4 + r; tent.scale.set(1, 1, 1.5); g.add(tent);
  }
  g.add(crate().translateX(-3).translateZ(8), crate(0.7, 0.5).translateX(-3.9).translateZ(8.3));
  for (let i = 0; i < 19; i++) { const bag = rbox(0.6, 0.22, 0.34, mat(0xffffff, { map: TX.cloth(0x9a8c6a) }), -7.9 + (i % 10) * 0.62 + (i > 9 ? 0.3 : 0), 0.11 + (i > 9 ? 0.22 : 0), 5, 0.09); g.add(bag); }
  return g;
}

export function buildBarricade() {
  const g = new THREE.Group();
  const pieces = [];
  const add = (m) => { g.add(m); pieces.push(m); return m; };
  for (let i = 0; i < 9; i++) {
    const z = -4 + i;
    const c = add(crate(0.9, 0.7)); c.position.set((i % 3) * 0.3 - 0.3, 0, z); c.rotation.y = (i * 0.7) % 0.5;
    if (i % 2 === 0) { const b = add(cyl(0.37, 0.37, 0.9, paintMat(0x8a4b2a, 0.9), 0.1, 1.1, z + 0.2, 14)); b.rotation.z = Math.PI / 2; }
    if (i % 3 === 0) { const t = add(tyreMesh()); t.position.set(-0.95, 0.13, z + 0.4); }
  }
  add(tbox(0.2, 0.2, 9.4, woodMat(0x6f5230), 0.25, 1.62, 0, 1.2));
  for (const z of [-3.5, 0, 3.5]) { const spike = add(box(1.8, 0.1, 0.1, woodMat(0x6f5230), 0.6, 0.7, z)); spike.rotation.z = -0.6; }
  return { group: g, pieces };
}

// ---------------------------------------------------------------- small set dressing
export const props = {
  rug(color = 0x6b3a30) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), mat(0xffffff, { map: TX.cloth(color) }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.075; m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m);
    return g;
  },
  bed() {
    if (PR.has('bed')) {
      // an old iron bed frame with a stained mattress and a blanket thrown over it
      const g = new THREE.Group(), b = PR.propModel('bed', { size: 2.0 }); b.rotation.y = Math.PI / 2; g.add(b);
      g.add(rbox(1.86, 0.16, 0.84, mat(0xffffff, { map: TX.cloth(0x8f8770) }), 0, 0.5, 0, 0.06));
      const blanket = rbox(1.0, 0.06, 0.9, mat(0xffffff, { map: TX.cloth(0x4f5c48) }), 0.4, 0.6, 0.02, 0.03); blanket.rotation.y = 0.07; g.add(blanket);
      return g;
    }
    const g = new THREE.Group(), frame = woodMat(0x5e4630);
    g.add(tbox(2.0, 0.26, 1.0, frame, 0, 0.2, 0, 1), box(0.08, 0.8, 1.0, frame, -0.98, 0.4, 0));
    g.add(rbox(1.9, 0.2, 0.92, mat(0xffffff, { map: TX.cloth(0x9a927c) }), 0, 0.42, 0, 0.07), rbox(0.44, 0.14, 0.7, mat(0xffffff, { map: TX.cloth(0xc9c2ae) }), -0.68, 0.56, 0, 0.06));
    const blanket = rbox(1.1, 0.08, 0.98, mat(0xffffff, { map: TX.cloth(0x5a6a54) }), 0.38, 0.54, 0, 0.03); blanket.rotation.y = 0.05; g.add(blanket);
    return g;
  },
  table() {
    if (PR.has('table')) {
      const g = new THREE.Group(); g.add(PR.propModel('table', { size: 1.3 }));
      if (PR.has('box')) { const b = PR.propModel('box', { size: 0.4 }); b.position.set(-0.3, 0.8, 0.05); b.rotation.y = 0.4; g.add(b); }
      return g;
    }
    const g = new THREE.Group(), woodM = woodMat(0x7a5c3a);
    g.add(tbox(1.3, 0.07, 0.8, woodM, 0, 0.78, 0, 0.9));
    for (const [x, z] of [[-0.58, -0.33], [0.58, -0.33], [-0.58, 0.33], [0.58, 0.33]]) g.add(box(0.07, 0.76, 0.07, woodM, x, 0.38, z));
    g.add(cyl(0.05, 0.06, 0.14, mat(0x8a8f92, { metalness: 0.6 }), 0.2, 0.89, 0.1, 8), cyl(0.12, 0.09, 0.03, mat(0xd8d2c0), -0.25, 0.83, -0.1, 12));
    const stool = cyl(0.2, 0.18, 0.46, woodM, 0.2, 0.23, 0.75, 10); g.add(stool);
    return g;
  },
  powerPole() {
    const g = new THREE.Group(), woodM = barkMat();
    g.add(cyl(0.11, 0.15, 8, woodM, 0, 4, 0, 8), box(0.12, 0.12, 2.4, woodM, 0, 7.4, 0), box(0.1, 0.1, 1.5, woodM, 0, 6.8, 0));
    for (const z of [-1, 1]) g.add(cyl(0.05, 0.05, 0.16, mat(0x6a8a8c), 0, 7.54, z, 6));
    g.add(cyl(0.05, 0.05, 0.16, mat(0x6a8a8c), 0, 6.94, 0.65, 6));
    return g;
  },
  streetLamp() {
    if (PR.has('lamp')) return PR.propModel('lamp', { height: 5.2 });
    if (pack.ready) return prop('streetlights', 0.82);
    const g = new THREE.Group(), steel = paintMat(0x5d676b, 0.6, { metalness: 0.4 });
    g.add(cyl(0.07, 0.1, 5.2, steel, 0, 2.6, 0, 8), box(0.07, 0.07, 1.5, steel, 0, 5.2, 0.7), rbox(0.2, 0.1, 0.5, steel, 0, 5.14, 1.4, 0.03));
    g.add(box(0.14, 0.03, 0.4, mat(0x20262a, { roughness: 0.2 }), 0, 5.08, 1.4)); // dead lamp glass
    return g;
  },
  barrier() {
    if (PR.has('barrier')) { const g = new THREE.Group(); g.add(PR.propModel('barrier', { size: 2.2 })); return g; }
    const g = new THREE.Group(), conc = concMat();
    g.add(tbox(2.2, 0.3, 0.54, conc, 0, 0.15, 0, 1.2), tbox(2.2, 0.55, 0.28, conc, 0, 0.56, 0, 1.2));
    g.add(box(0.5, 0.2, 0.3, mat(0xd08a2e), -0.6, 0.6, 0), box(0.5, 0.2, 0.3, mat(0xd08a2e), 0.5, 0.6, 0));
    return g;
  },
  // A rusty 20 ft shipping container, long side along x (fits a [2.85, 1.28] collider).
  shippingContainer(color = 0x4f6a4c) {
    const g = new THREE.Group(), L = 5.7, H = 2.55, W = 2.4;
    const side = surface('corrugated', { tint: soften(color, 0.18, 0.7), metalness: 0.6 }) || mat(0xffffff, { map: TX.corrugated(color) });
    const frame = paintMat(soften(color, 0, 0.6) & 0x7f7f7f, 0.8);
    g.add(tbox(L - 0.16, H - 0.16, W - 0.12, side, 0, H / 2, 0, tileOf('corrugated', 1.8)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.16, H, 0.16, frame, sx * (L / 2 - 0.08), H / 2, sz * (W / 2 - 0.08)));
    for (const y of [0.08, H - 0.08]) for (const sz of [-1, 1]) g.add(box(L, 0.16, 0.16, frame, 0, y, sz * (W / 2 - 0.08)));
    for (const y of [0.08, H - 0.08]) for (const sx of [-1, 1]) g.add(box(0.16, 0.16, W, frame, sx * (L / 2 - 0.08), y, 0));
    for (const z of [-0.45, 0.45]) g.add(box(0.05, H - 0.4, 0.05, frame, L / 2 + 0.01, H / 2, z)); // door bars
    return g;
  },
  pallet(broken = false) {
    const g = new THREE.Group(), w = woodMat(0x9a8462);
    for (const z of [-0.45, 0, 0.45]) g.add(box(1.2, 0.09, 0.1, w, 0, 0.045, z));
    for (let i = 0; i < 5; i++) {
      if (broken && (i === 1 || i === 3)) continue;
      const b = box(0.14, 0.022, 1.0, w, -0.5 + i * 0.25, 0.1, 0);
      if (broken && i === 4) { b.rotation.z = 0.25; b.position.y = 0.16; }
      g.add(b);
    }
    return g;
  },
  pipes() {
    const g = new THREE.Group(), m = paintMat(0x6a5a4a, 0.9);
    [[-0.17, 0.15], [0.17, 0.15], [0, 0.44], [-0.34, 0.15], [0.34, 0.15]].forEach(([x, y], i) => { const p = cyl(0.15, 0.15, 3.4 - i * 0.1, m, x, y, 0, 12); p.rotation.x = Math.PI / 2; g.add(p); }); // along z, like its collider
    return g;
  },
  cinderblock() {
    const g = new THREE.Group(), c = concMat();
    g.add(box(0.4, 0.2, 0.2, c, 0, 0.1, 0));
    return g;
  },
  waterTower() {
    const g = new THREE.Group(), steel = paintMat(0x6b6e66, 0.9);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = cyl(0.08, 0.1, 7.2, steel, x, 3.6, z, 8); leg.rotation.set(z * -0.04, 0, x * 0.04); g.add(leg); }
    for (const y of [2.2, 4.8]) for (const s of [-1, 1]) { g.add(box(2.1, 0.06, 0.06, steel, 0, y, s * 1.02)); g.add(box(0.06, 0.06, 2.1, steel, s * 1.02, y, 0)); }
    g.add(cyl(1.5, 1.5, 2.6, paintMat(0x8a8a7e, 0.95), 0, 8.5, 0, 20), cyl(1.55, 1.55, 0.12, steel, 0, 7.2, 0, 20));
    const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 20), paintMat(0x5e5a50, 0.95))); roof.position.y = 10.2; g.add(roof);
    return g;
  },
};
