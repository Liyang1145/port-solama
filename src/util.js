// Small shared helpers: seeded RNG, math, spatial collision grid
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry(20261119);
export const rand = (a, b) => a + (b - a) * rng();
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angWrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Axis-aligned box colliders on a uniform grid (x/z), with height.
export class ColliderGrid {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); this.boxes = []; }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(minX, minZ, maxX, maxZ, h = 100, tag = 'b') {
    const b = { minX, minZ, maxX, maxZ, h, tag };
    this.boxes.push(b);
    const c = this.cell;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const k = this.key(ix, iz); let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(b);
      }
    return b;
  }
  query(x, z, r, out = []) {
    out.length = 0; const c = this.cell; const seen = new Set();
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const l = this.map.get(this.key(ix, iz)); if (!l) continue;
        for (const b of l) if (!seen.has(b)) { seen.add(b); out.push(b); }
      }
    return out;
  }
  // push a circle (x,z,r) out of boxes; returns {x,z,hit,nx,nz}
  resolve(x, z, r, y = 0, res = {}) {
    res.hit = false; res.nx = 0; res.nz = 0;
    const list = this.query(x, z, r + 1, this._tmp || (this._tmp = []));
    for (let it = 0; it < 2; it++) for (const b of list) {
      if (y > b.h) continue;
      const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
      let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-8) { // inside: push along the shallowest axis
          const l = x - b.minX, rr = b.maxX - x, t = z - b.minZ, bb = b.maxZ - z; const m = Math.min(l, rr, t, bb);
          if (m === l) { dx = -1; dz = 0; x = b.minX - r; } else if (m === rr) { dx = 1; dz = 0; x = b.maxX + r; }
          else if (m === t) { dx = 0; dz = -1; z = b.minZ - r; } else { dx = 0; dz = 1; z = b.maxZ + r; }
          res.nx = dx; res.nz = dz;
        } else {
          const d = Math.sqrt(d2); const p = r - d; dx /= d; dz /= d; x += dx * p; z += dz * p; res.nx = dx; res.nz = dz;
        }
        res.hit = true;
      }
    }
    res.x = x; res.z = z; return res;
  }
  // segment test (for camera / bullets / line of sight); returns t in [0,1] of first hit or 1
  raycast(ax, ay, az, bx, by, bz) {
    let best = 1; const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz); const steps = Math.max(1, Math.ceil(len / this.cell));
    const seen = new Set(); const tmp = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps; this.query(ax + dx * t, az + dz * t, this.cell * 0.75, tmp);
      for (const b of tmp) {
        if (seen.has(b)) continue; seen.add(b);
        // slab test in 3D (box from y=0 to b.h)
        let t0 = 0, t1 = 1; let ok = true;
        const sl = (o, d, mn, mx) => {
          if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) ok = false; return; }
          let a = (mn - o) / d, c = (mx - o) / d; if (a > c) [a, c] = [c, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) ok = false;
        };
        sl(ax, dx, b.minX, b.maxX); if (ok) sl(az, dz, b.minZ, b.maxZ); if (ok) sl(ay, dy, -1, b.h);
        if (ok && t0 < best) best = t0;
      }
    }
    return best;
  }
}
