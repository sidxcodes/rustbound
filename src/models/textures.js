// Hand-painted style textures, drawn in code on canvases (no image files).
// Each function returns a cached THREE texture.
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

const cache = new Map();
function make(key, size, draw, repeat = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, mulberry32(key.length * 7919 + key.charCodeAt(0) * 31 + key.charCodeAt(key.length - 1)));
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
function shade(n, f) {
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
// soft irregular blotch
function blotch(g, x, y, r, color, alpha) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha; g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.globalAlpha = 1;
}
// draw something so that it wraps at the edges (keeps tiles seamless)
function wrap(size, x, y, r, fn) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
    fn(x + ox, y + oy);
  }
}
function crack(g, rng, x, y, len, width, color) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
  let a = rng() * 7;
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < len; i++) {
    a += (rng() - 0.5) * 1.3;
    x += Math.cos(a) * (5 + rng() * 7); y += Math.sin(a) * (5 + rng() * 7);
    g.lineTo(x, y);
    if (rng() < 0.18) { const bx = x, by = y; let ba = a + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.7), cx = bx, cy = by; for (let j = 0; j < 4; j++) { ba += (rng() - 0.5); cx += Math.cos(ba) * 6; cy += Math.sin(ba) * 6; g.lineTo(cx, cy); } g.moveTo(bx, by); }
  }
  g.stroke();
}

// Neutral ground detail: it multiplies the region colours painted on the terrain mesh.
export const ground = () => make('ground', 1024, (g, S, rng) => {
  g.fillStyle = '#b9b6ad'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) { const x = rng() * S, y = rng() * S, r = 30 + rng() * 110, light = rng() < 0.5; wrap(S, x, y, r, (px, py) => blotch(g, px, py, r, light ? '#e2dfd2' : '#7d7a70', 0.18 + rng() * 0.14)); }
  // dry cracked-earth plates
  for (let i = 0; i < 46; i++) { const x = rng() * S, y = rng() * S; wrap(S, x, y, 120, (px, py) => crack(g, mulberry32(i * 97 + 5), px, py, 8 + (i % 7), 1.3 + (i % 3) * 0.5, 'rgba(52,46,38,0.42)')); }
  // pebbles and grit
  for (let i = 0; i < 2200; i++) {
    const x = rng() * S, y = rng() * S, s = 0.8 + rng() * 2.6, v = rng();
    g.fillStyle = v < 0.5 ? 'rgba(60,56,48,0.35)' : 'rgba(235,232,220,0.4)';
    g.beginPath(); g.ellipse(x, y, s, s * (0.5 + rng() * 0.5), rng() * 3, 0, 7); g.fill();
  }
  // short grass strokes
  for (let i = 0; i < 5200; i++) {
    const x = rng() * S, y = rng() * S, l = 3 + rng() * 7;
    g.strokeStyle = rng() < 0.5 ? 'rgba(70,84,48,0.28)' : 'rgba(214,220,170,0.22)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 3, y - l); g.stroke();
  }
});

export const asphalt = () => make('asphalt', 512, (g, S, rng) => {
  g.fillStyle = '#47474a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { const x = rng() * S, y = rng() * S, r = 20 + rng() * 70; wrap(S, x, y, r, (px, py) => blotch(g, px, py, r, rng() < 0.5 ? '#5d5c5c' : '#313135', 0.3)); }
  for (let i = 0; i < 4000; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(20,20,22,0.35)' : 'rgba(150,148,140,0.25)'; g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  for (let i = 0; i < 9; i++) crack(g, rng, rng() * S, rng() * S, 14, 1.6, 'rgba(18,18,20,0.7)');
  // tar repair patches
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(30,30,33,0.55)'; const x = rng() * S, y = rng() * S; g.beginPath(); g.ellipse(x, y, 18 + rng() * 30, 8 + rng() * 12, rng() * 3, 0, 7); g.fill(); }
  // worn lane markings: edge lines top and bottom, broken centre line
  g.fillStyle = 'rgba(205,200,180,0.75)'; g.fillRect(0, 22, S, 9); g.fillRect(0, S - 31, S, 9);
  g.fillStyle = 'rgba(214,180,84,0.85)'; g.fillRect(60, S / 2 - 6, 230, 12);
  for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(62,62,65,0.8)'; const y = [22, S - 31, S / 2 - 6][i % 3] + rng() * 12; g.fillRect(rng() * S, y, 2 + rng() * 9, 1 + rng() * 3); }
});

export const dirt = () => make('dirt', 512, (g, S, rng) => {
  g.fillStyle = '#857660'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 120; i++) { const x = rng() * S, y = rng() * S, r = 20 + rng() * 60; wrap(S, x, y, r, (px, py) => blotch(g, px, py, r, rng() < 0.5 ? '#9c8c72' : '#62563f', 0.3)); }
  for (let i = 0; i < 14; i++) crack(g, rng, rng() * S, rng() * S, 10, 1.4, 'rgba(50,40,28,0.5)');
  for (let i = 0; i < 1500; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(50,42,30,0.4)' : 'rgba(200,188,160,0.35)'; g.beginPath(); g.arc(rng() * S, rng() * S, 0.6 + rng() * 2, 0, 7); g.fill(); }
});

// Painted metal with rust, chips and streaks. `base` is the paint colour, `rust` 0..1 how far gone it is.
export const paintedMetal = (base, rust = 0.4) => make(`metal${base}_${rust}`, 256, (g, S, rng) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) blotch(g, rng() * S, rng() * S, 20 + rng() * 60, rng() < 0.5 ? shade(base, 1.25) : shade(base, 0.72), 0.3);
  const n = Math.round(4 + rust * 26);
  for (let i = 0; i < n; i++) {
    const x = rng() * S, y = rng() < 0.6 ? S - rng() * S * 0.45 : rng() * S, r = 8 + rng() * 34 * (0.5 + rust);
    blotch(g, x, y, r, '#8a4a22', 0.75); blotch(g, x + rng() * 6, y + rng() * 6, r * 0.55, '#4f2a14', 0.7);
    // rust runs downward
    g.fillStyle = 'rgba(122,62,28,0.35)'; g.fillRect(x - 1.5, y, 3 + rng() * 3, 16 + rng() * 44);
  }
  for (let i = 0; i < 60 + rust * 160; i++) { g.fillStyle = rng() < 0.6 ? 'rgba(110,56,26,0.7)' : 'rgba(225,225,215,0.5)'; g.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 2); }
  for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(240,240,230,0.22)'; g.lineWidth = 0.8; const x = rng() * S, y = rng() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + rng() * 40, y + (rng() - 0.5) * 8); g.stroke(); }
  const grad = g.createLinearGradient(0, S * 0.7, 0, S);
  grad.addColorStop(0, 'rgba(60,45,30,0)'); grad.addColorStop(1, 'rgba(60,45,30,0.4)'); // road dirt along the bottom
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
});

export const wood = (base = 0x9a7648) => make(`wood${base}`, 256, (g, S, rng) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
  const planks = 4, w = S / planks;
  for (let p = 0; p < planks; p++) {
    g.fillStyle = shade(base, 0.82 + rng() * 0.36); g.fillRect(p * w, 0, w, S);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(60,38,18,${0.1 + rng() * 0.25})`; g.lineWidth = 0.6 + rng(); const x = p * w + rng() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rng() - 0.5) * 8, S * 0.3, x + (rng() - 0.5) * 8, S * 0.7, x + (rng() - 0.5) * 6, S); g.stroke(); }
    if (rng() < 0.7) { const kx = p * w + w * (0.3 + rng() * 0.4), ky = rng() * S; g.fillStyle = 'rgba(58,36,18,0.7)'; g.beginPath(); g.ellipse(kx, ky, 4, 7, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(30,20,10,0.75)'; g.fillRect(p * w, 0, 2.5, S);
    for (const y of [10, S - 14]) { g.fillStyle = 'rgba(40,40,42,0.8)'; g.beginPath(); g.arc(p * w + w / 2, y, 2.2, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 20; i++) blotch(g, rng() * S, rng() * S, 16 + rng() * 40, '#3c2a18', 0.14);
});

export const corrugated = (base = 0x8a9396) => make(`corr${base}`, 256, (g, S, rng) => {
  const ribs = 12, w = S / ribs;
  for (let i = 0; i < ribs; i++) {
    const grad = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    grad.addColorStop(0, shade(base, 0.62)); grad.addColorStop(0.5, shade(base, 1.18)); grad.addColorStop(1, shade(base, 0.62));
    g.fillStyle = grad; g.fillRect(i * w, 0, w + 1, S);
  }
  for (let i = 0; i < 26; i++) { const x = rng() * S, y = rng() * S; blotch(g, x, y, 8 + rng() * 26, '#7d4424', 0.6); g.fillStyle = 'rgba(112,58,28,0.3)'; g.fillRect(x - 2, y, 4, 20 + rng() * 60); }
  g.fillStyle = 'rgba(30,30,30,0.4)'; g.fillRect(0, S / 2 - 1, S, 2);
  const grad = g.createLinearGradient(0, S * 0.6, 0, S); grad.addColorStop(0, 'rgba(50,38,26,0)'); grad.addColorStop(1, 'rgba(50,38,26,0.45)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
});

export const plaster = (base = 0xa69c86) => make(`plaster${base}`, 256, (g, S, rng) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) blotch(g, rng() * S, rng() * S, 14 + rng() * 60, rng() < 0.5 ? shade(base, 1.2) : shade(base, 0.74), 0.28);
  // plaster fallen away near the bottom, showing bricks
  for (let i = 0; i < 5; i++) {
    const x = rng() * S, y = S - 20 - rng() * 70, r = 16 + rng() * 22;
    g.save(); g.beginPath(); g.ellipse(x, y, r * 1.3, r, rng(), 0, 7); g.clip();
    g.fillStyle = '#8a5540'; g.fillRect(x - 60, y - 60, 120, 120);
    g.strokeStyle = 'rgba(210,200,185,0.7)'; g.lineWidth = 1.5;
    for (let by = y - 60; by < y + 60; by += 9) { g.beginPath(); g.moveTo(x - 60, by); g.lineTo(x + 60, by); g.stroke(); for (let bx = x - 60 + ((by / 9) % 2) * 10; bx < x + 60; bx += 20) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by + 9); g.stroke(); } }
    g.restore();
  }
  for (let i = 0; i < 7; i++) crack(g, rng, rng() * S, rng() * S * 0.7, 9, 1, 'rgba(40,34,28,0.5)');
  for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(46,52,38,0.16)'; g.fillRect(rng() * S, 0, 5 + rng() * 12, 40 + rng() * 150); } // water stains from the roof
  const grad = g.createLinearGradient(0, S * 0.72, 0, S); grad.addColorStop(0, 'rgba(48,40,30,0)'); grad.addColorStop(1, 'rgba(48,40,30,0.5)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
});

export const concrete = () => make('concrete', 256, (g, S, rng) => {
  g.fillStyle = '#86837c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { const x = rng() * S, y = rng() * S, r = 14 + rng() * 50; wrap(S, x, y, r, (px, py) => blotch(g, px, py, r, rng() < 0.5 ? '#a19d94' : '#63605a', 0.3)); }
  g.strokeStyle = 'rgba(50,48,44,0.6)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2); // slab joint
  for (let i = 0; i < 5; i++) crack(g, rng, rng() * S, rng() * S, 9, 1.1, 'rgba(40,38,34,0.55)');
  for (let i = 0; i < 3; i++) blotch(g, 50 + rng() * (S - 100), 50 + rng() * (S - 100), 14 + rng() * 22, '#1e1c1a', 0.25); // oil
});

export const tarp = (base = 0x4c5a3a) => make(`tarp${base}`, 256, (g, S, rng) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) { const x = rng() * S; const grad = g.createLinearGradient(x, 0, x + 14 + rng() * 26, 0); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, rng() < 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,235,0.16)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grad; g.save(); g.translate(S / 2, S / 2); g.rotate((rng() - 0.5) * 1.2); g.fillRect(x - S, -S, 50, S * 2); g.restore(); }
  for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(20,24,14,0.22)'; g.fillRect(rng() * S, rng() * S, 2, 2); }
});

export const roofing = (base = 0x5a4038) => make(`roof${base}`, 256, (g, S, rng) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 22) {
    for (let x = -20 + ((y / 22) % 2) * 16; x < S; x += 32) { g.fillStyle = shade(base, 0.72 + rng() * 0.5); g.fillRect(x + 1, y + 1, 30, 20); }
    g.fillStyle = 'rgba(15,10,8,0.55)'; g.fillRect(0, y + 20, S, 2.5);
  }
  for (let i = 0; i < 26; i++) blotch(g, rng() * S, rng() * S, 12 + rng() * 34, rng() < 0.6 ? '#5d6a44' : '#221a16', 0.3); // moss and soot
});

export const bark = () => make('bark', 128, (g, S, rng) => {
  g.fillStyle = '#5b4632'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 80; i++) { g.strokeStyle = rng() < 0.5 ? 'rgba(34,24,14,0.6)' : 'rgba(140,112,80,0.4)'; g.lineWidth = 1 + rng() * 2; const x = rng() * S; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rng() - 0.5) * 12, S); g.stroke(); }
});

export const rock = () => make('rock', 256, (g, S, rng) => {
  g.fillStyle = '#8a857a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const x = rng() * S, y = rng() * S, r = 10 + rng() * 44; wrap(S, x, y, r, (px, py) => blotch(g, px, py, r, rng() < 0.5 ? '#aaa598' : '#5f5b52', 0.35)); }
  for (let i = 0; i < 12; i++) crack(g, rng, rng() * S, rng() * S, 8, 1.2, 'rgba(34,32,28,0.5)');
  for (let i = 0; i < 16; i++) blotch(g, rng() * S, rng() * S, 8 + rng() * 22, '#6a7646', 0.4); // lichen
});

export const cloth = (base) => make(`cloth${base}`, 128, (g, S, rng) => {
  g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 20; i++) blotch(g, rng() * S, rng() * S, 10 + rng() * 34, rng() < 0.5 ? shade(base, 1.3) : shade(base, 0.6), 0.3);
  for (let i = 0; i < S; i += 3) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, i, S, 1); }
  for (let i = 0; i < 10; i++) blotch(g, rng() * S, S * 0.6 + rng() * S * 0.4, 8 + rng() * 16, '#3a3024', 0.4); // dirt
});

// ---------- sprites (not tiled) ----------
export const grassSprite = () => make('grassSprite', 128, (g, S, rng) => {
  for (let i = 0; i < 34; i++) {
    const x = S / 2 + (rng() - 0.5) * S * 0.7, lean = (rng() - 0.5) * 40, h = S * (0.45 + rng() * 0.5), w = 3 + rng() * 4;
    const v = 150 + rng() * 105;
    g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    g.beginPath(); g.moveTo(x - w, S); g.quadraticCurveTo(x + lean * 0.3, S - h * 0.6, x + lean, S - h); g.quadraticCurveTo(x + lean * 0.3 + w, S - h * 0.5, x + w, S); g.fill();
  }
}, false);

export const blobShadow = () => make('blob', 128, (g, S) => {
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.38)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
}, false);

export const stain = (kind) => make(`stain${kind}`, 128, (g, S, rng) => {
  const color = kind === 'oil' ? '18,16,15' : kind === 'rust' ? '110,60,28' : '70,62,48';
  for (let i = 0; i < 9; i++) { const x = S / 2 + (rng() - 0.5) * S * 0.45, y = S / 2 + (rng() - 0.5) * S * 0.45, r = 10 + rng() * 26; const grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `rgba(${color},0.75)`); grad.addColorStop(1, `rgba(${color},0)`); g.fillStyle = grad; g.fillRect(0, 0, S, S); }
}, false);

export const softDot = () => make('softDot', 64, (g, S) => {
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
}, false);

// A sign board with text.
export const signText = (text, bg, fg) => make(`sign${text}`, 256, (g, S, rng) => {
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, S - 20, S - 20);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 110; do { g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`; size -= 6; } while (g.measureText(text).width > S - 44);
  g.fillText(text, S / 2, S / 2 + 4);
  for (let i = 0; i < 14; i++) blotch(g, rng() * S, rng() * S, 8 + rng() * 26, '#7a4424', 0.5);
  for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(40,30,22,0.5)'; g.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 2); }
}, false);
