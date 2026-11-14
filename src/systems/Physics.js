// Flat-world collision. The game is top-down on level ground, so collision is solved
// in 2D (x, z): moving things are circles, static things are circles or rotated boxes.
export class Physics {
  constructor() { this.statics = []; }

  addCircle(x, z, r, tag = '') {
    const c = { type: 'circle', x, z, r, tag };
    this.statics.push(c);
    return c;
  }
  addBox(x, z, hw, hd, rot = 0, tag = '') {
    const c = { type: 'box', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), tag, reach: Math.hypot(hw, hd) };
    this.statics.push(c);
    return c;
  }
  remove(c) {
    const i = this.statics.indexOf(c);
    if (i >= 0) this.statics.splice(i, 1);
  }

  // Test one circle against one collider. Returns null or { nx, nz, depth } pointing out of the collider.
  static contact(c, x, z, r) {
    if (c.type === 'circle') {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return null;
      const d = Math.sqrt(d2) || 0.0001;
      return { nx: dx / d, nz: dz / d, depth: rr - d };
    }
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > c.reach + r || Math.abs(dz) > c.reach + r) return null;
    // into box space (matches three.js rotation.y)
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const cx = Math.max(-c.hw, Math.min(c.hw, lx));
    const cz = Math.max(-c.hd, Math.min(c.hd, lz));
    let nx, nz, depth;
    if (cx === lx && cz === lz) {
      // centre is inside the box: leave by the nearest face
      const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
      if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; depth = px + r; }
      else { nx = 0; nz = Math.sign(lz) || 1; depth = pz + r; }
    } else {
      const ex = lx - cx, ez = lz - cz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) return null;
      const d = Math.sqrt(d2);
      nx = ex / d; nz = ez / d; depth = r - d;
    }
    return { nx: nx * c.cos + nz * c.sin, nz: -nx * c.sin + nz * c.cos, depth };
  }

  // Push a circle out of all statics. Mutates and returns `p` ({x, z}); calls onHit for each contact.
  resolve(p, r, onHit) {
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      for (const c of this.statics) {
        const h = Physics.contact(c, p.x, p.z, r);
        if (!h) continue;
        p.x += h.nx * h.depth;
        p.z += h.nz * h.depth;
        any = true;
        if (onHit) onHit(h, c);
      }
      if (!any) break;
    }
    return p;
  }

  blocked(x, z, r) {
    for (const c of this.statics) if (Physics.contact(c, x, z, r)) return true;
    return false;
  }
}
