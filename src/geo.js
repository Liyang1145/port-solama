// Geometry accumulation helpers: per-material, per-chunk merged buffers with custom attributes
import * as THREE from 'three';
import { CYBER } from './mapsel.js';
// v4.4 (map 霓港): drop JS-side geometry arrays after upload (heap was ~2x GPU data). r6.0: map 索拉纳港 keeps r5.0 behaviour.
const DROP_JS = CYBER;
// perf_debug5 (?keepjs = old): 索拉纳港 kept every World bucket's JS arrays (plain Number arrays, ~8+ bytes per float) after the
// meshes were built: heap sampling put ~210 MB live in GeoBucket.geom / quad. Now the gta map resets them after build too, but to
// fresh EMPTY arrays (vc = 0) and keeps the bucket in its map, so a bucket reference someone still holds stays usable.
const RESET_JS = !CYBER && !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('keepjs'));

const OLDQUAD = typeof location !== 'undefined' && /[?&]oldquad\b/.test(location.search); const ZERO4 = [0, 0, 0, 0];
export class GeoBucket {
  constructor(attrs = {}) { this.p = []; this.n = []; this.uv = []; this.idx = []; this.c = []; this.custom = {}; this.attrSizes = attrs; for (const k in attrs) this.custom[k] = []; this.vc = 0; }
  // add a quad given 4 corners (counter-clockwise when viewed from the front), uv per corner, attribute values constant
  quad(a, b, c, d, uvs, at = {}, col = null) {
    if (OLDQUAD) return this.quadOld(a, b, c, d, uvs, at, col);
    // fix_pt7 #1 (?oldquad = old): same arithmetic as subVectors / cross / normalize, without the two Vector3 + four [a,b,c,d]
    // arrays + a [0,0,0,0] per vertex per missing custom key that every quad allocated (young-gen churn of the generators)
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = d.x - a.x, wy = d.y - a.y, wz = d.z - a.z;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const ln = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; const il = 1 / ln; nx *= il; ny *= il; nz *= il;
    const base = this.vc; const P = this.p, N = this.n, U = this.uv;
    P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z); N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    U.push(uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5], uvs[6], uvs[7]);
    for (const k in this.custom) { const val = at[k] || ZERO4; const n = this.attrSizes[k]; const C = this.custom[k]; for (let i = 0; i < 4; i++) for (let j = 0; j < n; j++) C.push(val[j] ?? 0); }
    if (col) this.c.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vc += 4;
  }
  quadOld(a, b, c, d, uvs, at = {}, col = null) {
    const nx = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const base = this.vc;
    for (let i = 0; i < 4; i++) {
      const v = [a, b, c, d][i]; this.p.push(v.x, v.y, v.z); this.n.push(nx.x, nx.y, nx.z); this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      for (const k in this.custom) { const val = at[k] || [0, 0, 0, 0]; for (let j = 0; j < this.attrSizes[k]; j++) this.custom[k].push(val[j] ?? 0); }
      if (col) this.c.push(col[0], col[1], col[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vc += 4;
  }
  // append a THREE.BufferGeometry (non-indexed or indexed) transformed by matrix, with constant attrs/colour
  geom(g, m, at = {}, col = null) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const base = this.vc;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); this.n.push(n.x, n.y, n.z); } else this.n.push(0, 1, 0);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
      for (const k in this.custom) { const val = at[k] || [0, 0, 0, 0]; for (let j = 0; j < this.attrSizes[k]; j++) this.custom[k].push(val[j] ?? 0); }
      if (col) this.c.push(col[0], col[1], col[2]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    this.vc += pos.count;
  }
  // v4.4: append another bucket (all per-vertex attributes kept) transformed by a matrix (rotated streamed buildings)
  append(o, m) {
    const nm = new THREE.Matrix3().getNormalMatrix(m); const v = new THREE.Vector3(), n = new THREE.Vector3(); const base = this.vc;
    for (let i = 0; i < o.vc; i++) {
      v.set(o.p[i * 3], o.p[i * 3 + 1], o.p[i * 3 + 2]).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      n.set(o.n[i * 3], o.n[i * 3 + 1], o.n[i * 3 + 2]).applyMatrix3(nm).normalize(); this.n.push(n.x, n.y, n.z);
      this.uv.push(o.uv[i * 2], o.uv[i * 2 + 1]);
    }
    if (o.c.length) for (const q of o.c) this.c.push(q); else if (this.c.length) for (let i = 0; i < o.vc; i++) this.c.push(1, 1, 1);
    for (const k in this.custom) { const src = o.custom[k]; if (src && src.length) for (const q of src) this.custom[k].push(q); else for (let i = 0; i < o.vc * this.attrSizes[k]; i++) this.custom[k].push(0); }
    for (const i of o.idx) this.idx.push(base + i);
    this.vc += o.vc;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    for (const k in this.custom) g.setAttribute(k, new THREE.Float32BufferAttribute(this.custom[k], this.attrSizes[k]));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// Chunked collection: key = material name + chunk id
// perf_debug5: same reset for a standalone bucket after its mesh is built (a closure returned from the builder kept the whole
// builder scope, so its buckets' JS arrays stayed live: buildStreet ~77 MB). ?keepjs = old
export function dropJS(...bs) { if (!RESET_JS && !DROP_JS) return; for (const b of bs) { if (!b) continue; b.p = []; b.n = []; b.uv = []; b.idx = []; b.c = []; for (const k in b.custom) b.custom[k] = []; b.vc = 0; } }
export class World {
  constructor(chunk = 250) { this.chunk = chunk; this.buckets = new Map(); this.attrs = {}; }
  b(mat, x, z, attrs) {
    const cx = Math.floor(x / this.chunk), cz = Math.floor(z / this.chunk);
    const key = mat + '|' + cx + '|' + cz;
    let b = this.buckets.get(key); if (!b) { b = new GeoBucket(attrs || this.attrs[mat] || {}); b.mat = mat; this.buckets.set(key, b); }
    return b;
  }
  build(scene, mats, opts = {}) { const it = this.buildIter(scene, mats, opts); it.step(1e9); return it.meshes; }
  // perf_debug6: the same build spread over frames: step(ms) builds buckets until ms is spent (at least one per call), returns true when done
  buildIter(scene, mats, opts = {}) { const W = this, ents = [...this.buckets]; let i = 0; const meshes = [];
    return { meshes, step(ms) { const t0 = performance.now();
      while (i < ents.length) { W._one(ents[i++], scene, mats, opts, meshes); if (performance.now() - t0 > ms) break; }
      if (i < ents.length) return false; if (!opts.keep && DROP_JS) W.buckets.clear(); return true; } };
  }
  _one([key, b], scene, mats, opts, meshes) {
    {
      if (!b.vc) return;
      const m = new THREE.Mesh(b.build(), mats[b.mat]);
      const o = opts[b.mat] || {};
      m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
      m.name = key; if (opts.hidden) m.visible = false; scene.add(m); meshes.push(m);
      if (!opts.keep && DROP_JS) { b.p = b.n = b.uv = b.idx = b.c = null; b.custom = {}; } // v4.4: drop the JS-side arrays (heap was ~2x the GPU data)
      else if (!opts.keep && RESET_JS) { b.p = []; b.n = []; b.uv = []; b.idx = []; b.c = []; for (const k in b.custom) b.custom[k] = []; b.vc = 0; }
    }
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// vertical prism walls along a closed polygon (xz points, CCW seen from above), facade uv in metres.
export function prismWalls(bucket, poly, y0, y1, atFn, col = null, uOff = 0, perEdge = false) {
  let u = uOff;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const at = atFn ? atFn(i, len) : {};
    // outward normal for CCW (seen from +y, x right, z down) polygon
    bucket.quad(V(p[0], y0, p[1]), V(q[0], y0, q[1]), V(q[0], y1, q[1]), V(p[0], y1, p[1]), [u, y0, u + len, y0, u + len, y1, u, y1], at, col);
    u = perEdge ? 0 : u + len;
  }
}
export function polyCap(bucket, poly, y, at = {}, col = null, down = false) {
  const pts = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  for (const t of tris) {
    const [a, b, c] = t.map((i) => V(poly[i][0], y, poly[i][1]));
    // ensure normal up (or down)
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const tri = (n.y > 0) !== down ? [a, b, c] : [a, c, b];
    // emit degenerate quad (tri + repeated vertex) to reuse quad()
    bucket.quad(tri[0], tri[1], tri[2], tri[2], [tri[0].x, tri[0].z, tri[1].x, tri[1].z, tri[2].x, tri[2].z, tri[2].x, tri[2].z], at, col);
  }
}
export function rect(x0, z0, x1, z1) { return [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]; }
// a closed box with uv in metres on every face
export function box(bucket, x0, y0, z0, x1, y1, z1, at = {}, col = null, skipBottom = true) {
  prismWalls(bucket, rect(x0, z0, x1, z1), y0, y1, () => at, col);
  polyCap(bucket, rect(x0, z0, x1, z1), y1, at, col);
  if (!skipBottom) polyCap(bucket, rect(x0, z0, x1, z1), y0, at, col, true);
}
