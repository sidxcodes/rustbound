// Builds the static world from data/layout.js: ground, road, props, buildings, containers, plants.
import * as THREE from 'three';
import { mulberry32, clamp } from '../core/util.js';
import { mat, tmat, paintMat, barkMat, buildBuilding, buildContainer, buildPump, buildWreck, buildCanopy, buildOutpost, buildBarricade, props } from '../models/models.js';
import { pack, prop } from '../models/pack.js';
import { TEX, fbm } from '../gfx/textures.js';
import { PBR, surface, tileOf } from '../gfx/pbr.js';
import * as PR from '../models/props.js';
import * as L from '../data/layout.js';
import { LOOT_TABLES } from '../data/items.js';
import { Physics } from './Physics.js';

const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// How much bare dirt (0..1) and sand (0..1) the ground has at a point. Grass is the rest.
function groundMix(x, z) {
  const sand = smooth(268, L.STRETCH.from + 4, x);
  let dirt = 0;
  const yard = Math.min(x + 50, 48 - x, z + 24, 34 - z);                       // inside the scrapyard fence
  dirt = Math.max(dirt, smooth(-3, 3, yard) * 0.9);
  if (z > -57 && z < -18) dirt = Math.max(dirt, 1 - smooth(1.1, 2.4, Math.abs(x - 40))); // footpath to the cabin
  dirt = Math.max(dirt, (1 - smooth(13, 19, Math.hypot(x - L.STATION.x, z - L.STATION.z))) * 0.75);
  dirt = Math.max(dirt, (1 - smooth(30, 48, Math.hypot(x - L.TOWN.x, z - L.TOWN.z))) * 0.45);
  if (x > -14) dirt = Math.max(dirt, (1 - smooth(L.ROAD_HALF, L.ROAD_HALF + 3.2, Math.abs(z - L.ROAD_Z))) * 0.8); // road shoulders
  for (const b of L.BUILDINGS) { const d = Math.max(Math.abs(x - b.x) - b.hw, Math.abs(z - b.z) - b.hd); dirt = Math.max(dirt, (1 - smooth(0.5, 3.5, d)) * 0.85); }
  dirt = Math.max(dirt, smooth(0.6, 0.72, fbm(x * 0.06 + 40, z * 0.06 + 11, 3)) * 0.7);   // scattered bare patches
  return { dirt: dirt * (1 - sand), sand };
}

export class World {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.rng = mulberry32(20261112);
    this.containers = [];
    this.buildings = [];
    this.pumps = [];
    this.pumpReserve = L.PUMP_RESERVE;
    this.barricade = null;
    this.debris = [];
    this.time = { value: 0 };
    this.aoHidden = [];
    this.plantMeshes = []; // trees and bushes: on Low they stop casting shadows
    this.build();
  }

  build() {
    const { physics } = this.game, rng = this.rng;
    this.buildGround();

    for (const b of L.BUILDINGS) {
      const built = buildBuilding(b);
      this.group.add(built.group);
      for (const c of built.colliders) physics.addBox(c.x, c.z, c.hw, c.hd, 0, 'wall');
      this.buildings.push({ def: b, ...built, fade: 1 });
      this.furnish(b, built.group);
    }
    this.canopy = buildCanopy();
    this.canopy.group.position.set(112, 0, 0.5);
    this.group.add(this.canopy.group);
    for (const [x, z] of [[-5, -2], [5, -2], [-5, 2.6], [5, 2.6]]) physics.addCircle(112 + x, 0.5 + z, 0.28, 'post');

    for (const p of L.PUMPS) {
      const m = buildPump();
      m.position.set(p.x, 0, p.z);
      this.group.add(m);
      physics.addBox(p.x, p.z, 0.4, 0.3, 0, 'pump');
      this.pumps.push({ ...p });
    }

    for (const def of L.CONTAINERS) {
      const built = buildContainer(def.kind, rng, def.name);
      built.group.position.set(def.x, 0, def.z);
      if (def.rot != null || built.boxCol) built.group.rotation.y = def.rot || 0;
      this.group.add(built.group);
      const collider = built.boxCol ? physics.addBox(def.x, def.z, built.boxCol[0], built.boxCol[1], def.rot || 0, 'container') : physics.addCircle(def.x, def.z, built.radius, 'container');
      this.containers.push({ id: def.id, def, name: def.name, x: def.x, z: def.z, collider, items: [], searched: false, mesh: built.group });
    }
    this.fillContainers();

    for (const w of L.DECOR_WRECKS) {
      const m = buildWreck(rng);
      m.position.set(w.x, 0, w.z); m.rotation.y = w.rot;
      this.group.add(m);
      physics.addBox(w.x, w.z, 2.05, 0.9, w.rot, 'wreck');
    }

    this.buildFence();
    this.buildRidge();
    this.buildProps();
    this.buildPackDecor();
    this.buildVegetation();

    const outpost = buildOutpost();
    outpost.position.set(L.OUTPOST.x + 6, 0, L.OUTPOST.z - 9);
    this.group.add(outpost);
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) physics.addCircle(L.OUTPOST.x + 6 + dx, L.OUTPOST.z - 9 + dz, 0.2, 'post');
    physics.addBox(L.OUTPOST.x + 6 - 5.3, L.OUTPOST.z - 9 + 5, 3.2, 0.3, 0, 'prop');

    const bar = buildBarricade();
    bar.group.position.set(L.RIDGE_X, 0, L.ROAD_Z);
    this.group.add(bar.group);
    this.barricade = { ...bar, collider: physics.addBox(L.RIDGE_X, L.ROAD_Z, 1.3, 5.2, 0, 'barricade'), broken: false, home: bar.pieces.map((p) => ({ p: p.position.clone(), r: p.rotation.clone() })) };

    // ring drawn on the ground under whatever E would use
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.ring(), color: 0x8fe0d8, transparent: true, depthWrite: false, opacity: 0.9, fog: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06; this.ring.visible = false; this.ring.renderOrder = 2;
    this.group.add(this.ring);
  }

  // Loot is rolled from a fixed seed, so every new game has the same world.
  fillContainers() {
    const rng = mulberry32(4711);
    for (const c of this.containers) {
      const items = c.def.items.map(([id, qty, cond]) => (cond != null ? { id, qty: 1, cond } : { id, qty }));
      if (c.def.table) for (const [id, lo, hi, chance] of LOOT_TABLES[c.def.table]) if (rng() < chance) items.push({ id, qty: lo + Math.floor(rng() * (hi - lo + 1)) });
      c.items = items; c.searched = false;
    }
  }
  // Back to the starting state (new game, or before applying a save).
  reset() {
    this.fillContainers();
    this.pumpReserve = L.PUMP_RESERVE;
    const b = this.barricade;
    if (b.broken) this.game.physics.statics.push(b.collider);
    b.broken = false; b.group.visible = true; this.debris = [];
    b.pieces.forEach((p, i) => { p.position.copy(b.home[i].p); p.rotation.copy(b.home[i].r); });
  }

  buildGround() {
    const W = L.MAP.maxX - L.MAP.minX + 160, D = L.MAP.maxZ - L.MAP.minZ + 160;
    const cx = (L.MAP.maxX + L.MAP.minX) / 2, cz = (L.MAP.maxZ + L.MAP.minZ) / 2;
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / 2.2), Math.round(D / 2.2));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, splat = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { const m = groundMix(pos.getX(i) + cx, pos.getZ(i) + cz); splat[i * 2] = m.dirt; splat[i * 2 + 1] = m.sand; }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 2));
    // Standard lit material, but the colour comes from three textures blended by the splat weights.
    const ground = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    this.groundMat = ground;
    if (PBR.ready && PBR.sets.grass && PBR.sets.dirt && PBR.sets.sand) ground.onBeforeCompile = (sh) => this.photoGround(sh);
    else ground.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tGrass: { value: TEX.grass() }, tDirt: { value: TEX.dirt() }, tSand: { value: TEX.sand() }, tNoise: { value: TEX.noise() } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 splat;\nvarying vec2 vSplat;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tDirt, tSand, tNoise;\nvarying vec2 vSplat;\nvarying vec3 vWPos;')
        .replace('#include <map_fragment>', `
          vec2 gp = vWPos.xz;
          vec2 nz = texture2D(tNoise, gp * 0.021).rg;
          float macro = texture2D(tNoise, gp * 0.0043).r;
          vec3 cg = texture2D(tGrass, gp * 0.16).rgb * mix(0.7, 1.25, macro) * mix(0.9, 1.1, nz.g);
          vec3 cd = texture2D(tDirt, gp * 0.12).rgb * mix(0.85, 1.12, macro);
          vec3 cs = texture2D(tSand, gp * 0.09).rgb * mix(0.68, 0.84, macro);
          float wd = smoothstep(0.38, 0.6, vSplat.x + (nz.r - 0.5) * 0.75);
          float ws = smoothstep(0.35, 0.65, vSplat.y + (nz.g - 0.5) * 0.5);
          diffuseColor.rgb *= mix(mix(cg, cd, wd), cs, ws);`);
    };
    const mesh = new THREE.Mesh(geo, ground);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const flat = (w, d, material, x, z, y = 0.02, rot = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
      m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y, z); m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    // the road: one strip. Photo asphalt tiles every 4 m; the worn paint lines repeat every 24 m on top.
    const len = L.MAP.maxX + 80 + 12, roadW = L.ROAD_HALF * 2 + 0.8;
    const asphalt = surface('asphalt', { repeat: [len / 6, roadW / 6], roughness: 1, tint: 0xd0cecb, tile: true });
    if (asphalt) {
      flat(len, roadW, asphalt, -12 + len / 2, L.ROAD_Z);
      const mt = TEX.roadMarks(); mt.repeat.set(len / 24, 1);
      const marks = flat(len, roadW, new THREE.MeshStandardMaterial({ map: mt, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), -12 + len / 2, L.ROAD_Z, 0.024);
      marks.renderOrder = 1;
      this.aoHidden.push(marks);
    } else {
      const rt = TEX.road();
      rt.repeat.set(len / 24, 1);
      flat(len, roadW, new THREE.MeshStandardMaterial({ map: rt, roughness: 0.92 }), -12 + len / 2, L.ROAD_Z);
    }
    // concrete aprons
    const slab = (w, d, x, z) => {
      const m = surface('concrete', { repeat: [w / 5, d / 5], tint: 0xcfcac0, tile: true });
      if (m) { flat(w, d, m, x, z, 0.025); return; }
      const t = TEX.concrete().clone(); t.needsUpdate = true; t.repeat.set(w / 3, d / 3); flat(w, d, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), x, z, 0.025);
    };
    slab(26, 12.6, 112, -2.6); slab(10, 9.2, 240, -1.0); slab(15, 5.6, -15, 0.9);
    // oil stains and scorch marks
    const stain = new THREE.MeshBasicMaterial({ map: TEX.dot(), color: 0x0c0a08, transparent: true, opacity: 0.55, depthWrite: false });
    for (const [x, z, s] of [[1, -1.5, 3.4], [-13, 1, 2.6], [-30, 13, 4], [110, 1.8, 3], [115, 2.2, 2.2], [238, -2, 3], [60, 13, 4.5], [160, 4, 4], [252, 23, 4.5], [-38, -11, 4.2], [340, 8, 5], [200, 9, 3]]) {
      const m = flat(s, s * 0.8, stain, x, z, 0.035, this.rng() * 3); m.renderOrder = 1;
    }
  }

  // Ground shader with the photo textures: grass, cracked dirt and sand, blended by the same splat
  // weights and noise as before. High also blends their normal and roughness maps for relief.
  photoGround(sh) {
    const S = PBR.sets;
    Object.assign(sh.uniforms, {
      tNoise: { value: TEX.noise() },
      tGrass: { value: S.grass.c }, tDirt: { value: S.dirt.c }, tSand: { value: S.sand.c }, tCracked: { value: (S.cracked || S.dirt).c }, nCracked: { value: (S.cracked || S.dirt).n },
      nGrass: { value: S.grass.n }, nDirt: { value: S.dirt.n }, nSand: { value: S.sand.n },
      aGrass: { value: S.grass.a }, aDirt: { value: S.dirt.a }, aSand: { value: S.sand.a },
      // colour tints keep the photos in the game's muted olive/brown palette
      cGrass: { value: new THREE.Color(0.66, 0.76, 0.5) }, cDirt: { value: new THREE.Color(1.2, 1.12, 1.0) }, cCracked: { value: new THREE.Color(1.0, 0.9, 0.74) }, cSand: { value: new THREE.Color(1.0, 0.93, 0.8) },
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 splat;\nvarying vec2 vSplat;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tNoise, tGrass, tDirt, tSand, tCracked, nGrass, nDirt, nSand, nCracked, aGrass, aDirt, aSand;
      uniform vec3 cGrass, cDirt, cCracked, cSand;
      varying vec2 vSplat; varying vec3 vWPos;`)
      .replace('#include <map_fragment>', `
        vec2 gp = vWPos.xz;
        vec2 nz = texture2D(tNoise, gp * 0.021).rg;
        float macro = texture2D(tNoise, gp * 0.0043).r;
        // tile sizes in metres: grass 4, dirt 5, cracked earth 7, sand 4.5; a second, rotated grass sample hides repeats
        vec2 uvG = gp / 4.0, uvD = gp / 5.0, uvS = gp / 4.5;
        vec3 cg = texture2D(tGrass, uvG).rgb;
        #ifdef GROUND_HQ
          cg = mix(cg, texture2D(tGrass, mat2(0.8, 0.6, -0.6, 0.8) * gp / 7.3).rgb, 0.45 * smoothstep(0.25, 0.75, nz.g));
        #endif
        cg *= cGrass * mix(0.72, 1.18, macro);
        vec3 cd = texture2D(tDirt, uvD).rgb * cDirt * mix(0.85, 1.1, macro);
        // patches of dry, cracked earth inside the dirt areas
        vec2 uvC = gp / 7.0;
        float crackMask = smoothstep(0.54, 0.7, texture2D(tNoise, gp * 0.0105 + 0.31).g);
        cd = mix(cd, texture2D(tCracked, uvC).rgb * cCracked * mix(0.85, 1.05, macro), crackMask);
        vec3 cs = texture2D(tSand, uvS).rgb * cSand * mix(0.8, 0.95, macro);
        float wd = smoothstep(0.34, 0.66, vSplat.x + (nz.r - 0.5) * 0.75);
        float ws = smoothstep(0.35, 0.65, vSplat.y + (nz.g - 0.5) * 0.5);
        diffuseColor.rgb *= mix(mix(cg, cd, wd), cs, ws);
        #ifdef GROUND_HQ
          vec3 arm = mix(mix(texture2D(aGrass, uvG).rgb, texture2D(aDirt, uvD).rgb, wd), texture2D(aSand, uvS).rgb, ws);
          diffuseColor.rgb *= mix(1.0, arm.r, 0.6);
        #endif`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        #ifdef GROUND_HQ
          roughnessFactor *= mix(0.75, 1.0, arm.g);
        #endif`)
      .replace('#include <normal_fragment_maps>', `
        #ifdef GROUND_HQ
          vec3 nd = mix(texture2D(nDirt, uvD).xyz, texture2D(nCracked, uvC).xyz, crackMask);
          vec3 tn = mix(mix(texture2D(nGrass, uvG).xyz, nd, wd), texture2D(nSand, uvS).xyz, ws) * 2.0 - 1.0;
          tn.xy *= 1.1;
          // the ground is flat: tangent = +x, bitangent = +z (the uv directions), normal = +y
          normal = normalize((viewMatrix * vec4(normalize(vec3(tn.x, tn.z, tn.y)), 0.0)).xyz);
        #endif`);
  }
  setGroundDetail(high) {
    if (!this.groundMat) return;
    const on = !!(this.groundMat.defines && 'GROUND_HQ' in this.groundMat.defines);
    if (on === high) return;
    this.groundMat.defines = high ? { GROUND_HQ: '' } : {};
    this.groundMat.needsUpdate = true;
  }

  // Beds, tables and rugs so the houses do not feel empty.
  furnish(b, group) {
    if (!b.id.startsWith('house') && b.id !== 'cabin') return;
    const { physics } = this.game;
    const back = b.door === 's' ? -1 : 1, side = b.door === 's' ? 1 : -1; // bed goes in the back corner away from the loot
    const rug = props.rug(b.id === 'cabin' ? 0x6b3a30 : 0x4a5a66);
    rug.position.x = 0; rug.position.z = 0;
    group.add(rug);
    if (b.id === 'cabin') return;
    const bed = props.bed();
    bed.position.set(side * (b.hw - 1.35), 0.1, back * (b.hd - 0.85));
    group.add(bed);
    physics.addBox(b.x + bed.position.x, b.z + bed.position.z, 1.0, 0.5, 0, 'prop');
    const table = props.table();
    table.position.set(-side * (b.hw - 1.0), 0.1, -back * (b.hd - 1.3));
    table.rotation.y = Math.PI / 2;
    group.add(table);
    physics.addBox(b.x + table.position.x, b.z + table.position.z, 0.42, 0.66, 0, 'prop');
  }

  buildFence() {
    const { physics } = this.game;
    const postM = mat(0x6a7074, { metalness: 0.6, roughness: 0.5 });
    const seg = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), rot = -Math.atan2(z2 - z1, x2 - x1);
      const geo = new THREE.PlaneGeometry(len, 1.6);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 0.5), uv.getY(i) * 3.2);
      const m = new THREE.Mesh(geo, tmat('chainlink', TEX.chainlink(), { transparent: false, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }));
      m.position.set((x1 + x2) / 2, 0.85, (z1 + z2) / 2); m.rotation.y = rot; m.castShadow = true;
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), postM);
      rail.rotation.z = Math.PI / 2; rail.position.y = 0.82;
      this.group.add(m);
      this.aoHidden.push(m);
      const railW = rail; railW.position.set(m.position.x, 1.67, m.position.z); railW.rotation.y = rot; this.group.add(railW);
      for (let d = 0; d <= len + 0.01; d += len / Math.max(1, Math.round(len / 3.5))) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8), postM);
        p.position.set(x1 + ((x2 - x1) * d) / len, 0.95, z1 + ((z2 - z1) * d) / len); p.castShadow = true;
        this.group.add(p);
      }
      physics.addBox((x1 + x2) / 2, (z1 + z2) / 2, len / 2, 0.15, rot, 'fence');
    };
    // scrapyard yard fence; gaps: road gate on the east side, footpath to the forest on the north side
    seg(-48, -22, 37, -22); seg(43, -22, 46, -22);
    seg(-48, -22, -48, 32); seg(-48, 32, 46, 32);
    seg(46, 32, 46, 13.5); seg(46, 2.5, 46, -22);
  }

  rockGeometry(seed) {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, rng = mulberry32(seed), moved = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!moved.has(key)) moved.set(key, 0.78 + rng() * 0.45);
      const k = moved.get(key);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }

  buildRidge() {
    const { physics } = this.game, rng = this.rng;
    const list = [];
    for (let z = L.MAP.minZ - 30; z <= L.MAP.maxZ + 30; z += 4.2) {
      if (Math.abs(z - L.ROAD_Z) < 6.6) continue;
      const x = L.RIDGE_X + (rng() - 0.5) * 3, s = 3.4 + rng() * 1.6;
      list.push({ x, z, s, h: 1.1 + rng() * 0.9 });
      physics.addCircle(x, z, s * 0.82, 'rock');
      if (rng() < 0.6) list.push({ x: x + (rng() - 0.5) * 7, z: z + (rng() - 0.5) * 3, s: 1 + rng() * 1.4, h: 0.8 + rng() * 0.5, loose: true });
    }
    // Photo-scanned boulders when available, else lumpy code rocks. The random draws below happen in
    // the same order either way, so everything placed after the ridge stays where it was.
    const model = PR.has('rock2') ? PR.sizeOf('rock2') : null, items = [];
    const t = TEX.rock().clone(); t.needsUpdate = true; t.repeat.set(2, 2);
    const inst = model ? null : new THREE.InstancedMesh(this.rockGeometry(5), surface('rock', { tint: 0xe2d6c4, flatShading: true }) || new THREE.MeshStandardMaterial({ map: t, roughness: 1, flatShading: true }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    list.forEach((r, i) => {
      e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e);
      const tone = 0.62 + rng() * 0.25;
      if (model) {
        // upright-ish, stretched to the ridge's height, sunk a little into the ground
        q.setFromEuler(e.set((e.x - 1.5) * 0.1, e.y * 2.1, (e.z - 1.5) * 0.1));
        const k = (2 * r.s * 0.95) / model.x, ky = (r.s * (0.3 + r.h) * 0.85) / model.y;
        items.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(r.x, -0.12 * ky * model.y, r.z), q, new THREE.Vector3(k, ky, k)), color: new THREE.Color().setScalar(0.62 + tone * 0.42) });
      } else {
        m.compose(new THREE.Vector3(r.x, r.s * 0.3, r.z), q, new THREE.Vector3(r.s, r.s * r.h, r.s));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, col.setHSL(0.09, 0.12, tone, THREE.SRGBColorSpace));
      }
      if (r.loose && Math.abs(r.z - L.ROAD_Z) > 8) physics.addCircle(r.x, r.z, r.s * 0.8, 'rock');
    });
    if (model) { PR.scatter(this.group, PR.propParts('rock2'), items, { color: true }); return; }
    inst.castShadow = inst.receiveShadow = true;
    this.group.add(inst);
  }

  buildProps() {
    const { physics } = this.game, rng = this.rng;
    // tyre stacks around the yard
    const tyre = new THREE.CylinderGeometry(0.43, 0.43, 0.28, 18), hole = new THREE.CylinderGeometry(0.25, 0.25, 0.285, 12);
    for (const [x, z, n] of [[-42, 4, 4], [-41, 6, 2], [6, 26, 3], [22, -16, 4], [-28, -18, 3], [-2, -16, 2], [30, 24, 3], [246, -3.5, 3]]) {
      for (let i = 0; i < n; i++) {
        const ox = (rng() - 0.5) * 0.15, oz = (rng() - 0.5) * 0.15;
        if (PR.has('tyre')) { const { group: t, thickness: th } = PR.flatTyre(0.86); t.rotation.y = i * 1.3; t.position.set(x + ox, th * (i + 0.5), z + oz); this.group.add(t); continue; }
        const t = new THREE.Mesh(tyre, mat(0x18181a, { roughness: 0.95 })); t.position.set(x + ox, 0.14 + i * 0.28, z + oz); t.castShadow = true; t.receiveShadow = true;
        const h = new THREE.Mesh(hole, mat(0x0a0a0b)); h.position.copy(t.position);
        this.group.add(t, h);
      }
      physics.addCircle(x, z, 0.5, 'prop');
    }
    // scrap heaps: piles of rusty sheet and junk in the yard
    for (const [x, z, s] of [[-40, 24, 2.6], [4, -19, 2.2], [39, 27, 2.4], [-8, 27, 2]]) {
      const g = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const tints = [0x6b5a4c, 0x7a4a32, 0x55606a];
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.6 + rng() * 1.4, 0.06 + rng() * 0.3, 0.5 + rng() * 1.1), surface('paint', { tint: tints[i % 3], metalness: 1 }) || tmat(`scrap${i % 3}`, TEX.metal(tints[i % 3], 0.85)));
        m.position.set((rng() - 0.5) * s, 0.15 + rng() * 0.8, (rng() - 0.5) * s); m.rotation.set(rng() * 0.8, rng() * 3, rng() * 0.8); m.castShadow = true; m.receiveShadow = true;
        g.add(m);
      }
      g.position.set(x, 0, z);
      this.group.add(g);
      physics.addCircle(x, z, s * 0.62, 'prop');
    }
    // signs
    const sign = (x, z, color, wide = 2.6) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5, 8), mat(0x8d9296, { metalness: 0.5 })); pole.position.y = 2.5; pole.castShadow = true;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, wide), paintMat(color)); board.position.y = 4.6; board.castShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, wide * 0.8), mat(0xe9e3d2)); stripe.position.y = 4.6;
      g.add(pole, board, stripe); g.position.set(x, 0, z);
      this.group.add(g);
      physics.addCircle(x, z, 0.2, 'post');
    };
    sign(98, 2.5, 0xb03a2e); sign(178, 14.5, 0x5b6b3a); sign(L.OUTPOST.x - 12, L.ROAD_Z - 6, 0xd08a2e);
    // power line along the south side of the road
    const poles = [];
    for (let x = 56; x <= 250; x += 37.6) poles.push(x);
    const wireM = mat(0x121212);
    poles.forEach((x, i) => {
      const p = props.powerPole(); p.position.set(x, 0, 16); p.rotation.x = (rng() - 0.5) * 0.06;
      this.group.add(p);
      physics.addCircle(x, 16, 0.22, 'post');
      if (i) for (const z of [-1, 1, 0]) {
        const span = x - poles[i - 1], w = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, span, 4), wireM);
        w.rotation.z = Math.PI / 2; w.position.set(x - span / 2, z ? 7.5 : 6.9, 16 + z * (z ? 1 : 0.65));
        this.group.add(w);
      }
    });
    for (const x of [196, 224, 250]) { const l = props.streetLamp(); l.position.set(x, 0, 2.2); this.group.add(l); physics.addCircle(x, 2.2, 0.14, 'post'); }
    // concrete barriers funnel the road into the barricade
    for (const [x, z, r] of [[284.5, 1.6, 0.5], [284.5, 14.4, -0.5], [280.4, 0.2, 0.25], [280.4, 15.8, -0.25]]) {
      const b = props.barrier(); b.position.set(x, 0, z); b.rotation.y = r;
      this.group.add(b);
      physics.addBox(x, z, 1.1, 0.27, r, 'prop');
    }
    // dead trees in the Stretch
    const bark = surface('bark', { tint: 0x9a8f80 }) || tmat('deadwood', TEX.bark(), { color: 0x9a8f80 });
    for (let i = 0; i < 30; i++) {
      const x = L.STRETCH.from + 4 + rng() * (L.STRETCH.to - L.STRETCH.from - 8), z = (rng() - 0.5) * 150;
      if (Math.abs(z - L.ROAD_Z) < 7) continue;
      const g = new THREE.Group(), h = 2.6 + rng() * 1.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, h, 6), bark); trunk.position.y = h / 2; trunk.castShadow = true;
      g.add(trunk);
      for (let k = 0; k < 3; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.07, 1 + rng(), 5), bark); br.position.set(0, h * (0.5 + k * 0.17), 0); br.rotation.set(0, k * 2.1 + rng(), 0.7 + rng() * 0.5); br.translateY(0.5); br.castShadow = true; g.add(br); }
      g.position.set(x, 0, z); g.rotation.y = rng() * 6; g.rotation.z = (rng() - 0.5) * 0.2;
      this.group.add(g);
      physics.addCircle(x, z, 0.25, 'tree');
    }
  }

  // Set dressing from the model pack: shipping containers, pallets, cones, barriers and so on.
  // Each entry: [model, x, z, rotation, scale, collider]. A collider is a radius, or [halfWidth, halfDepth].
  buildPackDecor() {
    if (!pack.ready) return;
    const { physics } = this.game;
    const list = [
      // scrapyard
      ['container_green', 33, 24, 0.04, 1, [2.85, 1.28]], ['container_red', -41.5, 24, Math.PI / 2, 1, [2.85, 1.28]],
      ['pallet', 10, 14.5, 0.3, 1.2], ['pallet_broken', 11.4, 15.6, 1.1, 1.2], ['pipes', 24, -17, 0.2, 1, [0.4, 1.7]],
      ['trashbag_1', -22.6, -1, 0, 1.2], ['trashbag_2', -23, 3.2, 0.8, 1.1], ['cinderblock', -9, 3.4, 0.4, 1.2], ['cinderblock', -8.4, 3.9, 1.3, 1.2],
      ['trafficcone_1', 20, 3, 0, 1.1], ['trafficcone_1', 24.5, 12.8, 0, 1.1],
      // fuel station
      ['container_red', 131, -15, 0.02, 1, [2.85, 1.28]], ['trashbag_2', 121, -8.6, 0.3, 1.1], ['plasticbarrier', 100, 13.3, 0.1, 1.3, [0.68, 0.24]],
      ['plasticbarrier', 102, 13.5, -0.15, 1.3, [0.68, 0.24]], ['trafficcone_2', 119.6, 3.3, 0, 1.1], ['pallet', 103, -9, 0.6, 1.2], ['barrel', 104.5, -8.4, 0, 0.95, 0.42],
      // Harlow
      ['watertower', 170, -19, 0.3, 1, 1.35], ['firehydrant', 201, 13.4, 0, 1.15, 0.26], ['trafficlight_1', 227, 13.2, Math.PI, 1, 0.2],
      ['couch', 197.6, 19.5, 0.4, 1, [1.5, 0.6]], ['trashbag_1', 216, -3.6, 0, 1.2], ['trashbag_2', 229, 19.4, 1, 1.1], ['pallet', 246.5, -2.6, 0.2, 1.2],
      ['container_green', 263, -15, 1.2, 1, [2.85, 1.28]], ['trafficbarrier_1', 262, 13.1, 0.2, 1.1, [0.85, 0.45]], ['trafficbarrier_2', 266, 3, -0.3, 1.1, [0.85, 0.3]],
      ['trafficcone_1', 270, 3.2, 0, 1.1], ['trafficcone_2', 274, 12.9, 0, 1.1], ['trafficbarrier_1', 285.5, 1.6, Math.PI / 2, 1.1, [0.85, 0.45]], ['trafficbarrier_1', 285.5, 14.4, Math.PI / 2, 1.1, [0.85, 0.45]],
      // Ridge Outpost
      ['watertower', 408, -7, 0, 1, 1.35], ['container_green', 407, 23, 0.1, 1, [2.85, 1.28]], ['barrel', 427, 15, 0, 0.95, 0.42], ['barrel', 428, 15.6, 0, 0.95, 0.42],
      ['pallet', 425, 17.5, 0.4, 1.2], ['chest_special', 423.4, 16.2, 0.3, 1.5, 0.5],
    ];
    for (const [name, x, z, rot, scale, col] of list) {
      const r = Array.isArray(col) ? Math.max(col[0], col[1]) : col || 0.5;
      if (physics.blocked(x, z, Math.min(r, 1.2))) continue; // something is already there
      const m = this.decorModel(name, scale);
      m.position.set(x, 0, z); m.rotation.y = rot;
      this.group.add(m);
      if (Array.isArray(col)) physics.addBox(x, z, col[0], col[1], rot, 'decor');
      else if (col) physics.addCircle(x, z, col, 'decor');
    }
  }

  // A set-dressing prop: a Poly Haven model or a photo-textured code model where there is one, else the
  // older model pack. Same spot, rotation and collider either way.
  decorModel(name, scale) {
    const SCANNED = { trashbag_1: ['trashbag', { height: 0.62 }], trashbag_2: ['trashbag', { height: 0.5 }], barrel: ['barrel', { height: 0.95 }], firehydrant: ['hydrant', { height: 0.85 }],
      couch: ['sofa', { size: 2.3 }], trafficbarrier_1: ['barrier', { size: 1.8 }], trafficbarrier_2: ['barrier', { size: 1.8 }], chest_special: ['crate2', { size: 1.1 }] };
    if (SCANNED[name] && PR.has(SCANNED[name][0])) return PR.propModel(...SCANNED[name]);
    const BUILT = { container_green: () => props.shippingContainer(0x4f6a4c), container_red: () => props.shippingContainer(0x8a3c2e), pallet: () => props.pallet(), pallet_broken: () => props.pallet(true),
      pipes: () => props.pipes(), cinderblock: () => props.cinderblock(), watertower: () => props.waterTower() };
    if (PBR.ready && BUILT[name]) return BUILT[name]();
    return prop(name, scale);
  }

  buildVegetation() {
    const { physics } = this.game, rng = this.rng;
    const pines = [], leafy = [], rocks = [], bushes = [], tufts = [], stumps = [];
    const clear = (x, z, pad) => {
      if (L.onRoad(x, z) || Math.abs(z - L.ROAD_Z) < L.ROAD_HALF + pad) return false;
      if (x > -50 && x < 48 && z > -24 && z < 34) return false; // scrapyard yard
      if (Math.abs(x - 40) < 3 && z > -56 && z < 4) return false; // footpath to cabin
      if (Math.hypot(x - L.STATION.x, z - L.STATION.z) < 17) return false;
      for (const b of L.BUILDINGS) if (Math.abs(x - b.x) < b.hw + 2.5 + pad && Math.abs(z - b.z) < b.hd + 4 + pad) return false;
      for (const c of L.CONTAINERS) if (Math.hypot(x - c.x, z - c.z) < 3.5) return false;
      for (const e of L.ENEMY_SPAWNS) if (Math.hypot(x - e.x, z - e.z) < 2) return false;
      if (Math.abs(x - L.RIDGE_X) < 7 || (Math.abs(z - 16) < 1.2 && x > 50 && x < 290)) return false;
      return true;
    };
    for (let i = 0; i < 3000 && pines.length + leafy.length < 460; i++) {
      const x = L.MAP.minX - 20 + rng() * (290 - L.MAP.minX), z = L.MAP.minZ - 20 + rng() * (L.MAP.maxZ - L.MAP.minZ + 40);
      const region = L.regionAt(x, z);
      const edge = x < L.MAP.minX + 4 || z < L.MAP.minZ + 4 || z > L.MAP.maxZ - 4;
      const density = edge ? 1 : region === 'forest' ? 0.75 : region === 'town' ? 0.07 : region === 'scrapyard' ? 0 : 0.2;
      if (rng() > density || !clear(x, z, 1.5)) continue;
      if ([...pines, ...leafy].some((t) => Math.abs(t.x - x) < 1.9 && Math.abs(t.z - z) < 1.9)) continue;
      const t = { x, z, s: 0.8 + rng() * 0.75, r: rng() * 6, tone: rng() };
      (region === 'forest' || edge || rng() < 0.45 ? pines : leafy).push(t);
      physics.addCircle(x, z, 0.42, 'tree');
    }
    for (let i = 0; i < 110; i++) {
      const x = L.MAP.minX + rng() * (L.MAP.maxX - L.MAP.minX), z = L.MAP.minZ + rng() * (L.MAP.maxZ - L.MAP.minZ);
      if (!clear(x, z, 2.5)) continue;
      const s = 0.45 + rng() * 1.1;
      rocks.push({ x, z, s, r: rng() * 6, tone: rng() });
      physics.addCircle(x, z, s * 0.78, 'rock');
    }
    for (let i = 0; i < 520; i++) {
      const x = L.MAP.minX + rng() * (284 - L.MAP.minX), z = L.MAP.minZ + rng() * (L.MAP.maxZ - L.MAP.minZ);
      if (!clear(x, z, 0.8) || groundMix(x, z).dirt > 0.5) continue;
      if (rng() < 0.12) stumps.push({ x, z, s: 0.7 + rng() * 0.6, r: rng() * 6 }); else bushes.push({ x, z, s: 0.5 + rng() * 0.8, r: rng() * 6, tone: rng() });
    }
    // grass clumps: thick where the ground is grass, none on dirt, sand, road or floors
    for (let i = 0; i < 26000 && tufts.length < 11000; i++) {
      const x = L.MAP.minX - 10 + rng() * (300 - L.MAP.minX), z = L.MAP.minZ - 10 + rng() * (L.MAP.maxZ - L.MAP.minZ + 20);
      const g = groundMix(x, z);
      if (rng() < g.dirt * 1.5 + g.sand * 1.2 || L.onRoad(x, z) || Math.abs(z - L.ROAD_Z) < L.ROAD_HALF + 0.6) continue;
      if (L.BUILDINGS.some((b) => Math.abs(x - b.x) < b.hw + 0.6 && Math.abs(z - b.z) < b.hd + 0.6)) continue;
      tufts.push({ x, z, s: 0.6 + rng() * 0.9, r: rng() * 3.14, tone: rng() });
    }

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const inst = (geo, material, list, fn, color, shadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((o, i) => { fn(o); im.setMatrixAt(i, m); if (color) im.setColorAt(i, color(o)); });
      im.castShadow = shadow; im.receiveShadow = true;
      this.group.add(im);
      return im;
    };
    const upright = (y, sy = 1) => (t) => { e.set(0, t.r, 0); m.compose(v.set(t.x, y * t.s, t.z), q.setFromEuler(e), sc.set(t.s, t.s * sy, t.s)); };
    const bark = surface('bark', { tint: 0xc8bba8 }) || tmat('bark', TEX.bark());
    if (PR.has('fir')) this.plantModels(pines, leafy, rocks, bushes, stumps);
    else {
    const leafM = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    const pineTone = (t) => col.setHSL(0.27 + t.tone * 0.06, 0.24 + t.tone * 0.08, 0.2 + t.tone * 0.09, THREE.SRGBColorSpace);
    // pines: trunk plus four stacked, slightly ragged cones
    inst(new THREE.CylinderGeometry(0.13, 0.26, 2.4, 7), bark, pines, upright(1.2));
    [[1.75, 2.3, 2.2], [1.4, 2.1, 3.4], [1.05, 1.9, 4.5], [0.65, 1.6, 5.5]].forEach(([r, h, y], k) => {
      const cone = new THREE.ConeGeometry(r, h, 8, 1), p = cone.attributes.position, jr = mulberry32(k + 3);
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { const j = 0.82 + jr() * 0.36; p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j); p.setY(i, p.getY(i) - jr() * 0.25); }
      cone.computeVertexNormals();
      inst(cone, leafM, pines, (t) => { e.set(0, t.r + k, 0); m.compose(v.set(t.x, y * t.s, t.z), q.setFromEuler(e), sc.set(t.s, t.s, t.s)); }, pineTone);
    });
    // leafy trees: trunk plus three lumpy crowns
    const leafTone = (t) => col.setHSL(0.2 + t.tone * 0.07, 0.27, 0.27 + t.tone * 0.11, THREE.SRGBColorSpace);
    inst(new THREE.CylinderGeometry(0.16, 0.3, 2.8, 7), bark, leafy, upright(1.4));
    [[0, 3.9, 0, 1.9], [0.9, 3.3, 0.5, 1.35], [-0.8, 3.4, -0.6, 1.3]].forEach(([ox, y, oz, r], k) => {
      inst(this.rockGeometry(20 + k), leafM, leafy, (t) => { e.set(0, t.r, 0); q.setFromEuler(e); v.set(ox, 0, oz).applyQuaternion(q); m.compose(v.set(t.x + v.x * t.s, y * t.s, t.z + v.z * t.s), q, sc.set(r * t.s, r * 0.82 * t.s, r * t.s)); }, leafTone);
    });
    const rt = TEX.rock();
    inst(this.rockGeometry(9), surface('rock', { tint: 0xe2d6c4, flatShading: true }) || new THREE.MeshStandardMaterial({ map: rt, roughness: 1, flatShading: true }), rocks, (r) => { e.set(r.r, r.r * 2, 0.3); m.compose(v.set(r.x, r.s * 0.22, r.z), q.setFromEuler(e), sc.set(r.s, r.s * 0.7, r.s)); }, (r) => col.setHSL(0.1, 0.1, 0.6 + r.tone * 0.3, THREE.SRGBColorSpace));
    inst(this.rockGeometry(31), leafM, bushes, (b) => { e.set(0, b.r, 0); m.compose(v.set(b.x, b.s * 0.42, b.z), q.setFromEuler(e), sc.set(b.s * 1.1, b.s * 0.75, b.s * 1.1)); }, (b) => col.setHSL(0.21 + b.tone * 0.08, 0.25, 0.22 + b.tone * 0.11, THREE.SRGBColorSpace));
    inst(new THREE.CylinderGeometry(0.3, 0.38, 0.5, 9), bark, stumps, upright(0.25));
    }

    // grass: two crossed cards per clump, lit like the ground, swaying in the wind
    // With the Poly Haven models loaded, the cards show a baked picture of a real grass clump (its two
    // side views, one per card); otherwise the painted tuft texture.
    const baked = PR.has('grass') ? PR.variants('grass')[1] || PR.variants('grass')[0] : null;
    const bakedMap = baked ? PR.propParts('grass', baked.index)[0].material.map : null;
    const cardH = baked ? Math.min(1.1, baked.height / (2 * baked.radius)) : 0.62;
    const card = new THREE.PlaneGeometry(1, cardH); card.translate(0, cardH / 2, 0);
    const card2 = card.clone(); card2.rotateY(Math.PI / 2);
    const bakedUv = (a, right) => Array.from(a, (val, i) => (i % 2 === 0 ? val * 0.5 + (right ? 0.5 : 0) : 1 - val)); // glTF images are not flipped
    const pos = [...card.attributes.position.array, ...card2.attributes.position.array];
    const uv = baked ? [...bakedUv(card.attributes.uv.array, false), ...bakedUv(card2.attributes.uv.array, true)] : [...card.attributes.uv.array, ...card2.attributes.uv.array];
    const idx = [...card.index.array, ...Array.from(card.index.array, (i) => i + 4)];
    const tuftGeo = new THREE.BufferGeometry();
    tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tuftGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
    tuftGeo.setIndex(idx);
    const grassM = new THREE.MeshStandardMaterial({ map: bakedMap || TEX.tuft(), alphaTest: baked ? 0.4 : 0.5, side: THREE.DoubleSide, roughness: 1 });
    grassM.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      // light both sides of a blade as if it faced up, so the backs of the cards are not black
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;');
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.27;\nfloat sway = (sin(uTime * 1.6 + ph) + 0.5 * sin(uTime * 3.1 + ph * 1.7)) * 0.1 * clamp(position.y / ' + cardH.toFixed(3) + ', 0.0, 1.0);\ntransformed.x += sway; transformed.z += sway * 0.6;\n#endif');
    };
    this.grass = inst(tuftGeo, grassM, tufts, (t) => { e.set(0, t.r, 0); m.compose(v.set(t.x, 0, t.z), q.setFromEuler(e), sc.set(t.s, t.s, t.s)); }, (t) => (baked ? col.setRGB(1.25 + t.tone * 0.5, 1.25 + t.tone * 0.45, 1.0 + t.tone * 0.3) : col.setHSL(0.2 + t.tone * 0.06, 0.28 + t.tone * 0.08, 0.3 + t.tone * 0.14, THREE.SRGBColorSpace)), false);
    this.grassCount = tufts.length;
  }

  // Plants and rocks from the Poly Haven models: firs, leafy and olive trees and bushes are baked
  // impostors (see tools/bake-impostors.mjs), stumps and rocks are scanned models. Same spots and
  // colliders as before; only the look changes. Variants and tints come from each item's own `tone`.
  plantModels(pines, leafy, rocks, bushes, stumps) {
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const place = (x, y, z, rot, k) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(k, k, k));
    // the baked pictures already hold their own light and shadow, so the game lights them a bit brighter
    const shade = (tone, lo = 1.3, hi = 1.65) => new THREE.Color().setScalar(lo + (hi - lo) * tone);
    // spread a list over a model's variants; fit(variant, item) gives the scale
    const plant = (name, list, fit, pick = (t, n) => Math.floor(t.tone * 7.31) % n) => {
      const vs = PR.variants(name);
      if (!vs.length) return;
      vs.forEach((vr, i) => {
        const mine = list.filter((t) => pick(t, vs.length) === i);
        this.plantMeshes.push(...PR.scatter(this.group, PR.propParts(name, vr.index), mine.map((t) => ({ matrix: place(t.x, 0, t.z, t.r, fit(vr, t)), color: shade(t.tone) })), { color: true }));
      });
    };
    plant('fir', pines, (vr, t) => (7.4 * t.s) / vr.height);
    plant('leafy', leafy.filter((t) => t.tone < 0.5), (vr, t) => (5.6 * t.s) / vr.height);
    plant('olive', leafy.filter((t) => t.tone >= 0.5), (vr, t) => (5.2 * t.s) / vr.height);
    plant('fern', bushes.filter((b) => b.tone < 0.55), (vr, b) => (b.s * 1.05) / vr.radius);
    plant('shrub', bushes.filter((b) => b.tone >= 0.55), (vr, b) => (0.7 + b.s * 0.75) / vr.height);
    const one = (name, list, fit, y = 0) => {
      if (!PR.has(name)) return;
      const size = PR.sizeOf(name);
      PR.scatter(this.group, PR.propParts(name), list.map((t) => { const k = fit(size, t); return { matrix: place(t.x, y * k * size.y, t.z, t.r, k), color: shade(t.tone ?? 0.5, 0.8, 1) }; }), { color: true });
    };
    one('stump', stumps, (s, t) => (0.95 * t.s) / Math.max(s.x, s.z));
    // big rocks are scanned boulders; small ones the little rock, both sunk a bit into the ground
    one('rock2', rocks.filter((r) => r.s > 0.9), (s, r) => (2 * r.s * 0.92) / Math.max(s.x, s.z), -0.15);
    one('rock', rocks.filter((r) => r.s <= 0.9), (s, r) => (2 * r.s * 0.92) / Math.max(s.x, s.z), -0.12);
  }

  setQuality(high) {
    if (this.grass) this.grass.count = high ? this.grassCount : Math.floor(this.grassCount * 0.35);
    for (const m of this.plantMeshes) m.castShadow = high;
    this.setGroundDetail(high);
  }

  // Show or hide the ground ring under the thing E would use.
  setRing(x, z, size) {
    if (x == null) { this.ring.visible = false; return; }
    this.ring.visible = true;
    this.ring.position.x = x; this.ring.position.z = z;
    const s = size * (1 + Math.sin(this.time.value * 4) * 0.04);
    this.ring.scale.set(s, s, 1);
  }

  breakBarricade(dirX) {
    const b = this.barricade;
    if (b.broken) return;
    b.broken = true;
    this.game.physics.remove(b.collider);
    for (const p of b.pieces) this.debris.push({ mesh: p, vx: dirX * (4 + Math.random() * 7), vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 8, spin: (Math.random() - 0.5) * 8, life: 0 });
    this.game.particles?.burst(L.RIDGE_X, 1, L.ROAD_Z, 40, { color: 0x9a8566, speed: 6, size: 2.2, life: 1.4, spreadZ: 5 });
  }
  setBarricadeBroken() {
    const b = this.barricade;
    if (b.broken) return;
    b.broken = true;
    this.game.physics.remove(b.collider);
    b.group.visible = false;
  }

  update(dt) {
    this.time.value += dt;
    // fade roofs when the player (or the truck) is inside a building
    const t = this.game.focusPoint();
    for (const b of this.buildings) {
      const inside = Math.abs(t.x - b.def.x) < b.def.hw + 0.6 && Math.abs(t.z - b.def.z) < b.def.hd + 0.6;
      b.fade = clamp(b.fade + (inside ? -1 : 1) * dt * 3.5, 0, 1);
      b.roof.visible = b.fade > 0.02;
      for (const m of b.roofMats) m.opacity = b.fade;
      for (const m of b.roof.children) m.castShadow = b.fade > 0.5;
    }
    // station lights come on at dusk
    const dark = this.game.env.darkness;
    this.canopy.light.intensity = dark * 55;
    this.canopy.lampMat.emissiveIntensity = 0.1 + dark * 2.4;
    for (const d of this.debris) {
      if (d.life > 2.5) continue;
      d.life += dt;
      d.vy -= 18 * dt;
      d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.spin * dt; d.mesh.rotation.z += d.spin * dt;
      if (d.mesh.position.y < 0.2) { d.mesh.position.y = 0.2; d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; d.spin *= 0.7; }
    }
  }

  // The closest container whose surface is within arm's reach.
  nearestContainer(x, z, reach = 1.7) {
    let best = null, bd = Infinity;
    for (const c of this.containers) {
      const hit = Physics.contact(c.collider, x, z, reach);
      if (hit && -hit.depth < bd) { best = c; bd = -hit.depth; }
    }
    return best;
  }
  nearestPump(x, z, range = 2.4) {
    return this.pumps.find((p) => Math.hypot(p.x - x, p.z - z) < range) || null;
  }
}
