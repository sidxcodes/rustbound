// Every texture is painted in code on a canvas at start-up: no image files.
// All of them tile, so they can repeat across big surfaces.
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

const cache = new Map();
const P = 64; // noise lattice period

function makeNoise(seed) {
  const rng = mulberry32(seed), g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  // fractal noise 0..1 that repeats every P units
  return (x, y, oct = 4) => {
    let v = 0, amp = 0.5, f = 1, sum = 0;
    for (let i = 0; i < oct; i++) { v += amp * n(x * f, y * f); sum += amp; amp *= 0.5; f *= 2; }
    return v / sum;
  };
}
export const fbm = makeNoise(99);

function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return c;
}
function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// Fill a canvas per pixel. fn(u, v) gets noise-space coords (0..P) and returns [r, g, b].
function paint(c, fn) {
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const [r, gg, b] = fn((x / c.width) * P, (y / c.height) * P, x, y);
    const i = (y * c.width + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return g;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
// Draw something at (x, y) and at its wrapped copies so the texture still tiles.
function wrapDraw(c, x, y, pad, draw) {
  for (const ox of x < pad ? [0, c.width] : x > c.width - pad ? [0, -c.width] : [0]) for (const oy of y < pad ? [0, c.height] : y > c.height - pad ? [0, -c.height] : [0]) draw(x + ox, y + oy);
}
function cracks(c, g, rng, count, color, width = 1) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rng() * c.width, y = rng() * c.height, a = rng() * 6.28;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6 + rng() * 10; s++) { a += (rng() - 0.5) * 1.3; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
  }
}
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export const TEX = {
  grass: () => cached('grass', () => {
    const c = canvas(512), rng = mulberry32(1);
    const g = paint(c, (u, v) => {
      const n = fbm(u, v, 5), m = fbm(u * 4 + 9, v * 4, 2);
      return mix(mix([56, 66, 40], [98, 104, 60], n), [130, 124, 78], Math.max(0, m - 0.62) * 1.6);
    });
    const tones = [[76, 92, 50], [108, 118, 66], [48, 58, 36], [136, 132, 82], [90, 104, 56]];
    g.lineCap = 'round';
    for (let i = 0; i < 5200; i++) {
      const x = rng() * 512, y = rng() * 512, len = 4 + rng() * 8, a = -1.57 + (rng() - 0.5) * 1.4;
      g.strokeStyle = css(tones[(rng() * tones.length) | 0], 0.55 + rng() * 0.4); g.lineWidth = 1 + rng() * 1.2;
      wrapDraw(c, x, y, 12, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
    }
    return finish(c);
  }),
  dirt: () => cached('dirt', () => {
    const c = canvas(512), rng = mulberry32(2);
    const g = paint(c, (u, v) => {
      const n = fbm(u, v, 5), grain = fbm(u * 8, v * 8, 2);
      return mix(mix([92, 74, 52], [138, 114, 82], n), [70, 56, 40], Math.max(0, 0.45 - grain) * 1.4);
    });
    for (let i = 0; i < 700; i++) {
      const x = rng() * 512, y = rng() * 512, r = 0.8 + rng() * 2.6, light = rng() < 0.5;
      wrapDraw(c, x, y, 6, (px, py) => {
        g.fillStyle = light ? css([168, 150, 122], 0.8) : css([60, 48, 36], 0.7);
        g.beginPath(); g.ellipse(px, py, r, r * 0.75, rng() * 3, 0, 6.3); g.fill();
      });
    }
    cracks(c, g, rng, 7, 'rgba(50,38,26,0.45)');
    return finish(c);
  }),
  sand: () => cached('sand', () => {
    const c = canvas(512), rng = mulberry32(3);
    const g = paint(c, (u, v) => {
      const n = fbm(u, v, 4), ripple = Math.sin((v + fbm(u * 0.5, v * 0.5, 2) * 10) * ((Math.PI * 2 * 12) / P)) * 0.5 + 0.5;
      return mix(mix([170, 142, 96], [206, 180, 130], n), [150, 124, 84], ripple * 0.22);
    });
    for (let i = 0; i < 260; i++) { const x = rng() * 512, y = rng() * 512; g.fillStyle = css([120, 100, 74], 0.7); wrapDraw(c, x, y, 4, (px, py) => g.fillRect(px, py, 1 + rng() * 2, 1 + rng() * 2)); }
    return finish(c);
  }),
  // The road is one long strip: asphalt with worn lane paint, cracks and dirty edges.
  road: () => cached('road', () => {
    const c = canvas(1024, 512), rng = mulberry32(4);
    const g = paint(c, (u, v, x, y) => {
      const n = fbm(u * 2, v, 4), grain = fbm(u * 16, v * 8, 2), edge = Math.min(y, 511 - y) / 60;
      let col = mix([44, 45, 48], [70, 70, 72], n * 0.7 + grain * 0.3);
      if (edge < 1) col = mix([104, 90, 66], col, Math.min(1, edge + fbm(u * 3, 1.5, 2) * 0.7));
      return col;
    });
    cracks(c, g, rng, 16, 'rgba(18,18,20,0.7)', 1.6);
    // soft tar and oil patches
    for (let i = 0; i < 7; i++) { const x = rng() * 1024, y = 90 + rng() * 330, r = 24 + rng() * 46, grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `rgba(26,26,28,${0.22 + rng() * 0.2})`); grad.addColorStop(1, 'rgba(26,26,28,0)'); g.fillStyle = grad; g.save(); g.translate(x, y); g.scale(1.8, 0.7); g.translate(-x, -y); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    const worn = (x, y, w, h, color) => { for (let i = 0; i < w; i += 3) { g.fillStyle = css(color, 0.45 + rng() * 0.5); g.fillRect(x + i, y + (rng() - 0.5) * 1.5, 3, h * (0.8 + rng() * 0.25)); } };
    worn(0, 34, 1024, 9, [196, 196, 186]); worn(0, 468, 1024, 9, [196, 196, 186]);
    worn(80, 250, 360, 12, [206, 176, 86]); worn(592, 250, 360, 12, [206, 176, 86]);
    const t = finish(c); t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }),
  // Only the worn lane paint and the dusty road edges, on a transparent canvas, to lay over photo asphalt.
  roadMarks: () => cached('roadMarks', () => {
    const c = canvas(1024, 512), rng = mulberry32(4), g = c.getContext('2d');
    for (let y = 0; y < 512; y++) {
      const edge = Math.min(y, 511 - y) / 46;
      if (edge >= 1) continue;
      for (let x = 0; x < 1024; x += 4) { const a = (1 - Math.min(1, edge + fbm((x / 1024) * P * 3, 1.5 + y * 0.01, 2) * 0.8)) * 0.85; if (a > 0.02) { g.fillStyle = css([112, 96, 70], a); g.fillRect(x, y, 4, 1); } }
    }
    const worn = (x, y, w, h, color) => { for (let i = 0; i < w; i += 3) { const f = fbm((x + i) * 0.03, y * 0.1, 2); if (f < 0.24) continue; g.fillStyle = css(color, Math.min(0.8, 0.3 + f * 0.6) * (0.85 + rng() * 0.15)); g.fillRect(x + i, y + (rng() - 0.5) * 1.5, 3, h * (0.8 + rng() * 0.25)); } };
    worn(0, 34, 1024, 9, [196, 196, 186]); worn(0, 468, 1024, 9, [196, 196, 186]);
    worn(80, 250, 360, 12, [200, 170, 84]); worn(592, 250, 360, 12, [200, 170, 84]);
    const t = finish(c); t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }),
  concrete: () => cached('concrete', () => {
    const c = canvas(256), rng = mulberry32(5);
    const g = paint(c, (u, v) => mix([112, 110, 104], [152, 150, 142], fbm(u, v, 5)));
    g.strokeStyle = 'rgba(60,58,54,0.55)'; g.lineWidth = 2;
    for (const p of [0, 128]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); }
    cracks(c, g, rng, 4, 'rgba(50,48,44,0.5)');
    for (let i = 0; i < 4; i++) { const x = 40 + rng() * 176, y = 40 + rng() * 176, r = 14 + rng() * 24, grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `rgba(40,36,30,${0.1 + rng() * 0.12})`); grad.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2); }
    return finish(c);
  }),
  planks: (tint = 0x7a5a3c, horizontal = false) => cached(`planks${tint}${horizontal}`, () => {
    const c = canvas(256), rng = mulberry32(tint), base = hex(tint), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const k = 0.78 + rng() * 0.4;
      g.fillStyle = css(base.map((v) => v * k));
      if (horizontal) g.fillRect(0, i * 32, 256, 32); else g.fillRect(i * 32, 0, 32, 256);
      for (let j = 0; j < 14; j++) { g.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.1})`; const o = i * 32 + rng() * 30; if (horizontal) g.fillRect(0, o, 256, 1); else g.fillRect(o, 0, 1, 256); }
      g.fillStyle = 'rgba(20,12,6,0.75)';
      if (horizontal) g.fillRect(0, i * 32, 256, 2); else g.fillRect(i * 32, 0, 2, 256);
      g.fillStyle = 'rgba(30,30,30,0.7)';
      for (const e of [10, 246]) { if (horizontal) g.fillRect(e, i * 32 + 14, 3, 3); else g.fillRect(i * 32 + 14, e, 3, 3); }
    }
    return finish(c);
  }),
  corrugated: (tint = 0x7f8b8e, rust = 0.35) => cached(`corr${tint}${rust}`, () => {
    const c = canvas(256), base = hex(tint);
    paint(c, (u, v, x) => {
      const ridge = Math.sin((x / 256) * Math.PI * 2 * 12) * 0.5 + 0.5;
      let col = base.map((b) => b * (0.72 + ridge * 0.4));
      const r = fbm(u, v * 0.6, 5) + (v / P) * 0.12;
      if (r > 1 - rust * 0.9) col = mix(col, [118, 62, 30], Math.min(1, (r - (1 - rust * 0.9)) * 6) * (0.6 + ridge * 0.3));
      return col;
    });
    return finish(c);
  }),
  plaster: (tint = 0xa39a84) => cached(`plaster${tint}`, () => {
    const c = canvas(256), rng = mulberry32(tint + 7), base = hex(tint);
    const g = paint(c, (u, v, x, y) => {
      const n = fbm(u, v, 5);
      let col = base.map((b) => b * (0.8 + n * 0.35));
      const grime = (y / 256) * 0.5 + fbm(u * 2, v * 2, 3) * 0.6; // darker toward the bottom
      if (grime > 0.72) col = mix(col, [70, 62, 50], Math.min(0.6, (grime - 0.72) * 2.4));
      return col;
    });
    // a patch of exposed brick
    const bx = 30 + rng() * 120, by = 120 + rng() * 60;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { g.fillStyle = css([128 + rng() * 30, 66 + rng() * 16, 48], 0.9); g.fillRect(bx + k * 20 + (r % 2) * 10, by + r * 9, 18, 7); }
    cracks(c, g, rng, 3, 'rgba(40,34,28,0.5)');
    return finish(c);
  }),
  shingles: (tint = 0x5a4038) => cached(`shingles${tint}`, () => {
    const c = canvas(256), rng = mulberry32(tint + 3), base = hex(tint), g = c.getContext('2d');
    for (let r = 0; r < 8; r++) for (let k = -1; k < 8; k++) {
      const v = 0.7 + rng() * 0.5;
      g.fillStyle = css(base.map((b) => b * v)); g.fillRect(k * 32 + (r % 2) * 16, r * 32, 32, 32);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(k * 32 + (r % 2) * 16, r * 32 + 29, 32, 3); g.fillRect(k * 32 + (r % 2) * 16, r * 32, 1.5, 32);
    }
    return finish(c);
  }),
  crate: () => cached('crate', () => {
    const c = canvas(128), g = c.getContext('2d'), rng = mulberry32(8);
    for (let i = 0; i < 4; i++) { const k = 0.85 + rng() * 0.3; g.fillStyle = css([154 * k, 118 * k, 70 * k]); g.fillRect(0, i * 32, 128, 32); g.fillStyle = 'rgba(40,24,10,0.6)'; g.fillRect(0, i * 32, 128, 2); }
    g.strokeStyle = '#6e4f2a'; g.lineWidth = 14; g.strokeRect(7, 7, 114, 114);
    g.beginPath(); g.moveTo(10, 10); g.lineTo(118, 118); g.stroke();
    g.fillStyle = '#2c2c2c'; for (const [x, y] of [[8, 8], [116, 8], [8, 116], [116, 116]]) g.fillRect(x, y, 4, 4);
    return finish(c);
  }),
  // Painted metal with rust blooms and scratches. Used on the truck and on wrecks.
  metal: (tint = 0x7fa5a6, rust = 0.3) => cached(`metal${tint}${rust}`, () => {
    const c = canvas(256), rng = mulberry32(tint + 11), base = hex(tint);
    const g = paint(c, (u, v) => {
      const n = fbm(u, v, 5), fine = fbm(u * 6, v * 6, 2);
      let col = base.map((b) => b * (0.86 + fine * 0.22));
      const t = 1 - rust * 0.75;
      if (n > t) col = mix(col, mix([132, 70, 34], [84, 44, 24], fine), Math.min(1, (n - t) * 9));
      return col;
    });
    g.strokeStyle = 'rgba(230,230,220,0.22)'; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) { const x = rng() * 256, y = rng() * 256, a = rng() * 0.5 - 0.25; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (10 + rng() * 40), y + Math.sin(a) * 30); g.stroke(); }
    return finish(c);
  }),
  // plain noise (not a colour), used by the ground shader to break up blend edges
  noise: () => cached('noise', () => {
    const c = canvas(256);
    paint(c, (u, v) => { const a = fbm(u, v, 5) * 255, b = fbm(u * 3 + 20, v * 3 + 7, 3) * 255; return [a, b, 0]; });
    return finish(c, { srgb: false });
  }),
  rock: () => cached('rock', () => {
    const c = canvas(256), rng = mulberry32(12);
    const g = paint(c, (u, v) => mix([92, 88, 78], [150, 144, 130], fbm(u, v, 5) * 0.75 + fbm(u * 7, v * 7, 2) * 0.25));
    cracks(c, g, rng, 6, 'rgba(40,38,34,0.5)');
    return finish(c);
  }),
  bark: () => cached('bark', () => {
    const c = canvas(64, 128);
    paint(c, (u, v, x) => { const s = Math.sin(x * 0.9 + fbm(u, v * 0.3, 3) * 14) * 0.5 + 0.5; return mix([52, 38, 26], [98, 74, 50], s * 0.7 + fbm(u, v, 3) * 0.3); });
    return finish(c);
  }),
  chainlink: () => cached('chainlink', () => {
    const c = canvas(64), g = c.getContext('2d');
    g.strokeStyle = 'rgba(190,196,198,0.95)'; g.lineWidth = 2.2;
    for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    return finish(c);
  }),
  // a clump of grass blades on a transparent background
  tuft: () => cached('tuft', () => {
    const c = canvas(128), g = c.getContext('2d'), rng = mulberry32(13);
    for (let i = 0; i < 16; i++) {
      const x = 22 + rng() * 84, lean = (rng() - 0.5) * 46, h = 60 + rng() * 62, w = 5 + rng() * 5;
      const grad = g.createLinearGradient(0, 128, 0, 128 - h);
      grad.addColorStop(0, '#6f6f6f'); grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x - w / 2, 128); g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); g.quadraticCurveTo(x + lean * 0.4 + w, 128 - h * 0.5, x + w / 2, 128); g.fill();
    }
    return finish(c, { repeat: false });
  }),
  dot: () => cached('dot', () => {
    const c = canvas(64), g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return finish(c, { repeat: false });
  }),
  ring: () => cached('ring', () => {
    const c = canvas(128), g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 56, 0, 6.3); g.stroke();
    const grad = g.createRadialGradient(64, 64, 20, 64, 64, 56);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,0.28)');
    g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 56, 0, 6.3); g.fill();
    return finish(c, { repeat: false });
  }),
};
