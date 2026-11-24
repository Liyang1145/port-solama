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
let _rng = mulberry(20261119);
export const rng = () => _rng();
// v4.4 streaming (map 霓港): chunks reseed the shared generator so a chunk rebuilds identically after it was unloaded
export function withSeed(seed, fn) { const old = _rng; _rng = mulberry(seed); try { return fn(); } finally { _rng = old; } }
export const rand = (a, b) => a + (b - a) * rng();
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angWrap = (a) => (!Number.isFinite(a) ? 0 : ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Axis-aligned box colliders on a uniform grid (x/z), with height.
export class ColliderGrid {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); this.boxes = []; this._qseen = new Set(); this._rseen = new Set(); this._rtmp = []; }
  key(ix, iz) { return ((ix & 0xffff) << 16) | (iz & 0xffff); }
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
  remove(b) { // v4.4 (map 霓港 streaming)
    if (!b) return;
    if (b.y0 !== undefined && this.over) { this.over.remove(b); return; }
    const c = this.cell; const i = this.boxes.indexOf(b); if (i >= 0) this.boxes.splice(i, 1);
    for (let ix = Math.floor(b.minX / c); ix <= Math.floor(b.maxX / c); ix++)
      for (let iz = Math.floor(b.minZ / c); iz <= Math.floor(b.maxZ / c); iz++) { const l = this.map.get(this.key(ix, iz)); if (l) { const j = l.indexOf(b); if (j >= 0) l.splice(j, 1); } }
  }
  // r5.0 oriented box (mainland buildings / causeway): centre, unit axis u (along), half length / half width
  addOBB(cx, cz, ux, uz, hl, hw, h = 100, tag = 'b') {
    const ex = Math.abs(ux) * hl + Math.abs(uz) * hw, ez = Math.abs(uz) * hl + Math.abs(ux) * hw;
    const b = this.add(cx - ex, cz - ez, cx + ex, cz + ez, h, tag); b.o = { cx, cz, ux, uz, hl, hw }; return b;
  }
  // b_canopycol (map B): overhead box (bottom y0 > 0: shutter housings, door hoods over a service door) in a grid of its own, so every
  // query / boxes scan / hash of the ground-up colliders stays as it was. Only resolve() reads it, for a body reaching into y0..h.
  addOver(cx, cz, ux, uz, hl, hw, y0, h, tag = 'over') { const g = this.over || (this.over = new ColliderGrid(this.cell)); const b = g.addOBB(cx, cz, ux, uz, hl, hw, h, tag); b.y0 = y0; this.overY0 = Math.min(this.overY0 ?? Infinity, y0); return b; }
  query(x, z, r, out = []) {
    out.length = 0; const c = this.cell; const seen = this._qseen; seen.clear();
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const l = this.map.get(this.key(ix, iz)); if (!l) continue;
        for (const b of l) if (!seen.has(b)) { seen.add(b); out.push(b); }
      }
    return out;
  }
  // push a circle (x,z,r) out of boxes; returns {x,z,hit,nx,nz}
  // b_canopycol: bot / top = the body's feet / head (default: a walker, y = feet + 0.5, 1.8 m tall); used for overhead boxes only
  resolve(x, z, r, y = 0, res = {}, top = y + 1.3, bot = y - 0.5) {
    res.hit = false; res.nx = 0; res.nz = 0;
    const list = this.query(x, z, r + 1, this._tmp || (this._tmp = []));
    const O = this.over && top > this.overY0 ? this.over.query(x, z, r + 1, this._tmpO || (this._tmpO = [])) : null; const L2 = O && O.length ? (this._L2 || (this._L2 = [list, O])) : (this._L1 || (this._L1 = [list]));
    for (let it = 0; it < 2; it++) for (const L of L2) for (const b of L) {
      if (L === O ? (top <= b.y0 || bot >= b.h) : y > b.h) continue;
      if (b.o) { // oriented: work in the box frame
        const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux;
        const ca = clamp(la, -o.hl, o.hl), cw = clamp(lw, -o.hw, o.hw); let da = la - ca, dw = lw - cw; const q2 = da * da + dw * dw;
        if (q2 >= r * r) continue;
        if (q2 < 1e-8) { const m = Math.min(o.hl - Math.abs(la), o.hw - Math.abs(lw)); if (m === o.hl - Math.abs(la)) { da = Math.sign(la) || 1; dw = 0; } else { da = 0; dw = Math.sign(lw) || 1; } const pa = da ? (o.hl - Math.abs(la) + r) : (o.hw - Math.abs(lw) + r); const wx = da * o.ux - dw * o.uz, wz = da * o.uz + dw * o.ux; x += wx * pa; z += wz * pa; res.nx = wx; res.nz = wz; }
        else { const d = Math.sqrt(q2); const p = r - d; da /= d; dw /= d; const wx = da * o.ux - dw * o.uz, wz = da * o.uz + dw * o.ux; x += wx * p; z += wz * p; res.nx = wx; res.nz = wz; }
        res.hit = true; continue;
      }
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
    const seen = this._rseen; seen.clear(); const tmp = this._rtmp;
    const testList = (list) => {
      for (const b of list) {
        if (seen.has(b)) continue; seen.add(b);
        let t0 = 0, t1 = 1; let ok = true;
        const sl = (o, d, mn, mx) => {
          if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) ok = false; return; }
          let a = (mn - o) / d, c = (mx - o) / d; if (a > c) [a, c] = [c, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) ok = false;
        };
        if (b.o) { const o = b.o; const rx = ax - o.cx, rz = az - o.cz; sl(rx * o.ux + rz * o.uz, dx * o.ux + dz * o.uz, -o.hl, o.hl); if (ok) sl(-rx * o.uz + rz * o.ux, -dx * o.uz + dz * o.ux, -o.hw, o.hw); }
        else { sl(ax, dx, b.minX, b.maxX); if (ok) sl(az, dz, b.minZ, b.maxZ); }
        if (ok) sl(ay, dy, b.y0 !== undefined ? b.y0 : -1, b.h);
        if (ok && t0 < best) best = t0;
      }
    };
    const checkOver = this.over && Math.max(ay, by) > this.overY0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps; const px = ax + dx * t, pz = az + dz * t;
      this.query(px, pz, this.cell * 0.75, tmp); testList(tmp);
      if (checkOver) { this.over.query(px, pz, this.cell * 0.75, tmp); testList(tmp); }
    }
    return best;
  }
}
