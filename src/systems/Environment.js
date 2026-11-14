// Day and night, sun and sky colour, sky light, and the dust haze over the Dead Stretch.
// Reflections and soft ambient light come from a photographed sky (Poly Haven HDRI, CC0) when it is
// available; without it a stronger hemisphere light stands in.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { clamp, damp } from '../core/util.js';
import { regionAt } from '../data/layout.js';
import { ENV_FILES } from '../assets/manifest.js';

export const DAY_SECONDS = 480;
const mix = (a, b, t) => a + (b - a) * t;

export class Environment {
  constructor(game) {
    this.game = game;
    this.time = 0.3; // fraction of a day: 0 midnight, 0.5 noon
    this.day = 1;
    this.darkness = 0;
    this.haze = 0;
    const scene = game.scene;
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a4c38, 1);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04; this.sun.shadow.radius = 3;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xb0b8ba, 55, 210);
    scene.background = new THREE.Color(0xb0b8ba);
    // muted, slightly grey sky tones: day haze, dusk, night, and the yellow dust of the Stretch
    this.cDay = new THREE.Color(0xaeb9bd); this.cDusk = new THREE.Color(0xb98e6c); this.cNight = new THREE.Color(0x121925); this.cHaze = new THREE.Color(0xae9668);
    this.tmp = new THREE.Color();
    this.hasSky = false; this.skyOn = false; this.skyMap = null;
    try {
      const b = ENV_FILES.sky;
      if (b) {
        const d = new RGBELoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
        t.colorSpace = THREE.LinearSRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
        t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; t.needsUpdate = true;
        const pmrem = new THREE.PMREMGenerator(game.renderer);
        this.skyMap = pmrem.fromEquirectangular(t).texture;
        scene.environment = this.skyMap;
        pmrem.dispose(); t.dispose();
        this.hasSky = true; this.skyOn = true;
      }
    } catch (err) { console.warn('Sky lighting unavailable; using a plain sky light.', err); }
  }
  // Low graphics leaves the sky reflections out (they cost a few texture reads on every pixel).
  setSky(on) {
    this.skyOn = on && this.hasSky;
    this.game.scene.environment = this.skyOn ? this.skyMap : null;
  }
  clock() {
    const mins = Math.floor(this.time * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  update(dt) {
    this.time += dt / DAY_SECONDS;
    if (this.time >= 1) { this.time -= 1; this.day++; }
    const angle = (this.time - 0.25) * Math.PI * 2; // sunrise at 06:00
    const elev = Math.sin(angle);
    const dayness = clamp(elev * 3 + 0.25, 0, 1), night = 1 - dayness;
    this.darkness = night;
    const dusk = clamp(1 - Math.abs(elev) * 3.2, 0, 1) * (elev > -0.25 ? 1 : 0);

    const focus = this.game.focusPoint();
    this.haze = damp(this.haze, regionAt(focus.x, focus.z) === 'stretch' ? 1 : 0, 1.5, dt);
    const scene = this.game.scene;
    this.tmp.copy(this.cNight).lerp(this.cDay, dayness).lerp(this.cDusk, dusk * 0.55).lerp(this.cHaze, this.haze * 0.75 * (0.25 + 0.75 * dayness));
    scene.background.copy(this.tmp);
    scene.fog.color.copy(this.tmp);
    scene.fog.near = 55 - this.haze * 38;
    scene.fog.far = 210 - this.haze * 135;

    // the sun by day; a weak, cool moon by night so shapes still read
    this.sun.intensity = 2.7 * dayness + 0.65 * night;
    this.sun.color.setHSL(mix(0.1 - dusk * 0.045, 0.6, night), mix(0.5 + dusk * 0.35, 0.35, night), mix(0.86 - dusk * 0.14, 0.72, night));
    // sky light: the photographed sky by day, a dim blue fill at night (stronger without the sky map)
    const k = this.skyOn ? 1 : 1.9;
    scene.environmentIntensity = this.skyOn ? 0.5 * dayness + 0.05 + dusk * 0.08 : 0;
    this.hemi.intensity = 0.5 * dayness * k + (this.skyOn ? 1.3 : 1.05) * night;
    this.hemi.color.setHSL(0.6, 0.22 + 0.25 * night, 0.72 - 0.18 * night);
    this.hemi.groundColor.setHSL(0.09, 0.25, 0.3 - 0.15 * night);
    const sx = Math.cos(angle) * 70, sy = Math.max(26, elev * 110), sz = 52;
    this.sun.position.set(focus.x + sx, sy, focus.z + sz);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();
  }
}
