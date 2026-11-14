// A small pooled particle system for dust, exhaust smoke and impact puffs.
import * as THREE from 'three';
import { TEX } from './textures.js';

const MAX = 500;

export class Particles {
  constructor(game) {
    this.game = game;
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 4); this.size = new Float32Array(MAX);
    this.p = Array.from({ length: MAX }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, r: 1, g: 1, b: 1, a: 1 }));
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDot: { value: TEX.dot() }, uScale: { value: 600 } },
      vertexShader: 'attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float uScale;\nvoid main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D tDot; varying vec4 vColor;\nvoid main() { float a = texture2D(tDot, gl_PointCoord).a * vColor.a; if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a); }',
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    game.scene.add(this.points);
    this.tmp = new THREE.Color();
  }
  emit(x, y, z, o = {}) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    const p = this.p[i];
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    p.vx = o.vx || 0; p.vy = o.vy ?? 0.6; p.vz = o.vz || 0;
    p.life = p.max = o.life || 1; p.size = o.size || 1; p.grow = o.grow ?? 1.2; p.a = o.alpha ?? 0.5;
    this.tmp.set(o.color ?? 0x9a8a6a);
    // tint by daylight so dust is not bright at night
    const k = 0.25 + 0.75 * (1 - this.game.env.darkness);
    p.r = this.tmp.r * k; p.g = this.tmp.g * k; p.b = this.tmp.b * k;
  }
  burst(x, y, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = (o.speed || 2) * (0.3 + Math.random() * 0.7);
      this.emit(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.6, z + (Math.random() - 0.5) * (o.spreadZ || 0.6), { ...o, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 0.5 + Math.random() * (o.speed || 2) * 0.5, life: (o.life || 1) * (0.6 + Math.random() * 0.6) });
    }
  }
  update(dt, viewHeight) {
    this.material.uniforms.uScale.value = viewHeight * 0.9;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      p.life -= dt;
      const t = 1 - Math.max(0, p.life) / p.max, drag = Math.exp(-2 * dt);
      p.vx *= drag; p.vz *= drag; p.vy *= drag;
      this.pos[i * 3] += p.vx * dt; this.pos[i * 3 + 1] += p.vy * dt; this.pos[i * 3 + 2] += p.vz * dt;
      this.col[i * 4] = p.r; this.col[i * 4 + 1] = p.g; this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = p.a * Math.min(1, t * 8) * (1 - t);
      this.size[i] = p.size * (1 + p.grow * t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}
