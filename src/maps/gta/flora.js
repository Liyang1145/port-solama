// r6.4 flora_a — map A「索拉纳港」coastal vegetation layer (South-Florida barrier island look; original, procedural).
//   * dune band on the upper beach: sand hummocks + sea-oat clumps with seed heads + low dune grass / beach-vine mats
//   * natural island ends: coastal hammock (sea grape, saw palmetto understory, sabal / coconut groves, live oaks)
//   * south end bay edge: red mangroves on arching prop roots standing in the water, cordgrass / sawgrass marsh fringe
//   * coastal rock: weathered limestone boulders (wet / algae band at the waterline) at the bay shores, island tips and
//     shallow rocky reef heads off both beach ends
//   * clipped hedges (sea grape / clusia) along the Deco promenade
// Everything is instanced; every species has a near and a far mesh and a cull distance, distributed around the camera by a
// bucketed grid (rebuilt only after the camera moved > 10 m). Own RNG streams: the city RNG sequence is untouched.
import * as THREE from 'three';
import { prep, M } from '../../mats.js';
import { U } from '../../env.js';
import { foliagePatch, swayDepth, canvasTex } from '../../veg.js';
import { mulberry, westCoast, beachOff, ISLE, smooth } from './mapgeo.js';

const TAU = Math.PI * 2;
// ---------------------------------------------------------------- deterministic value noise (placement masks) ----
const hh = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vn(x, z) { const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hh(ix, iz), b = hh(ix + 1, iz), c = hh(ix, iz + 1), d = hh(ix + 1, iz + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }
const fbm = (x, z) => vn(x, z) * 0.6 + vn(x * 2.3 + 7.1, z * 2.3 - 3.7) * 0.3 + vn(x * 5.1 - 2.2, z * 5.1 + 9.4) * 0.1;

// ---------------------------------------------------------------- geometry accumulator ----
function GA() { return { p: [], n: [], c: [], uv: [], s: [], i: [] }; }
// bake both faces of every triangle (each copy wound to agree with its own normal) so a front-sided material can stand in for DoubleSide
function twoSided(g) { const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array; const idx = []; const nv = P.length / 3; const attrs = {};
  for (const k in g.attributes) { const a = g.attributes[k]; const src = a.array, sz = a.itemSize; const d = new Float32Array(src.length * 2); d.set(src); d.set(src, src.length); if (k === 'normal') for (let i = src.length; i < d.length; i++) d[i] = -d[i]; attrs[k] = new THREE.Float32BufferAttribute(d, sz); }
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx; const ok = gx * N[a * 3] + gy * N[a * 3 + 1] + gz * N[a * 3 + 2] >= 0;
    if (ok) idx.push(a, b, c, a + nv, c + nv, b + nv); else idx.push(a, c, b, a + nv, b + nv, c + nv); }
  const o = new THREE.BufferGeometry(); for (const k in attrs) o.setAttribute(k, attrs[k]); o.setIndex(idx); o.computeBoundingSphere(); return o; }
function gaBuild(o, normals = true) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  if (o.n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(o.s, 1)); g.setIndex(o.i); if (!o.n.length && normals) g.computeVertexNormals();
  g.computeBoundingSphere(); return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// grass clump: curved tapered blades (ribbons), optional drooping seed panicles (sea oats)
function grassClump(seed, o) {
  const r = mulberry(seed); const G = GA();
  const { n, H, segs, R0, base, tip, heads = 0, lean = 0.5, wid = 0.035 } = o;
  for (let b = 0; b < n; b++) {
    const a = r() * TAU, rr = Math.sqrt(r()) * R0; const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const az = a + (r() - 0.5) * 1.2; const dx = Math.cos(az), dz = Math.sin(az); const sx = -dz, sz = dx;
    const h = H * (0.55 + r() * 0.6); const ln = lean * (0.5 + r()); const w0 = wid * (0.7 + r() * 0.6);
    const tb = 0.8 + r() * 0.35; const st = G.p.length / 3; let last = null;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs; const y = h * (t - ln * 0.35 * t * t); const out = h * ln * t * t;
      const x = bx + dx * out, z = bz + dz * out; const w = w0 * (1 - t * 0.92);
      const nx = -dx * 0.4, nz = -dz * 0.4; // normals bent toward the sky in the shader anyway
      for (const sg of [-1, 1]) { G.p.push(x + sx * w * sg, y, z + sz * w * sg); G.n.push(nx, 0.9, nz);
        const cc = base.map((v, j) => (v + (tip[j] - v) * t) * tb); G.c.push(...cc); G.uv.push(0.5, 0.5); G.s.push(t * t * (h / H)); }
      last = [x, y, z];
    }
    for (let k = 0; k < segs; k++) { const q = st + k * 2; G.i.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    if (heads && r() < heads && last) { // panicle: two crossed narrow quads hanging from the tip
      const L = 0.22 + r() * 0.12; const hc = [0.78, 0.66, 0.42].map((v) => v * (0.85 + r() * 0.3));
      for (const [ax, az2] of [[sx, sz], [dx, dz]]) { const q = G.p.length / 3; const [x, y, z] = last; const ww = 0.035;
        const pts = [[x - ax * ww, y, z - az2 * ww], [x + ax * ww, y, z + az2 * ww], [x + ax * ww * 0.4 + dx * 0.06, y - L, z + az2 * ww * 0.4 + dz * 0.06], [x - ax * ww * 0.4 + dx * 0.06, y - L, z - az2 * ww * 0.4 + dz * 0.06]];
        for (const pp of pts) { G.p.push(...pp); G.n.push(0, 1, 0); G.c.push(...hc); G.uv.push(0.5, 0.5); G.s.push(1.1); }
        G.i.push(q, q + 1, q + 2, q, q + 2, q + 3); }
    }
  }
  return gaBuild(G);
}
// card clump: leaf cards on a dome (shrubs / sea grape / hedges / mangrove canopy)
function cardDome(G, r, C, R, ry, nCards, size, tint, sway = 0.15, flat = 0) {
  for (let k = 0; k < nCards; k++) {
    const u = r() * TAU, v = Math.acos(1 - r() * 1.15); const rr = Math.pow(r(), 0.4) * R;
    const p = V(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * ry, Math.sin(v) * Math.sin(u) * rr).add(C);
    const nrm = p.clone().sub(C).add(V(0, R * 0.6, 0)).normalize(); if (flat) nrm.lerp(V(0, 1, 0), flat).normalize();
    const a = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(); const t1 = V().crossVectors(nrm, a).normalize(), t2 = V().crossVectors(nrm, t1).normalize();
    const s = size * (0.75 + r() * 0.5); const st = G.p.length / 3; const g = (0.82 + r() * 0.3) * (0.78 + 0.32 * Math.max(0, nrm.y));
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = p.clone().addScaledVector(t1, i * s).addScaledVector(t2, j * s);
      G.p.push(q.x, Math.max(0.03, q.y), q.z); G.n.push(nrm.x, nrm.y, nrm.z); G.uv.push((i + 1) / 2, (j + 1) / 2); G.s.push(sway); G.c.push(tint[0] * g, tint[1] * g, tint[2] * g); }
    G.i.push(st, st + 1, st + 2, st, st + 2, st + 3);
  }
}
// tapered tube along a curve into the accumulator (stems, prop roots)
function tubeInto(G, pts, r0, r1, radial, segs, col, sway = 0) {
  const curve = new THREE.CatmullRomCurve3(pts); const fr = curve.computeFrenetFrames(segs, false); const st = G.p.length / 3;
  for (let k = 0; k <= segs; k++) { const t = k / segs; const c = curve.getPointAt(t); const rad = r0 + (r1 - r0) * t; const N = fr.normals[k], B = fr.binormals[k];
    for (let j = 0; j <= radial; j++) { const a = (j / radial) * TAU; const nx = Math.cos(a) * N.x + Math.sin(a) * B.x, ny = Math.cos(a) * N.y + Math.sin(a) * B.y, nz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      G.p.push(c.x + nx * rad, c.y + ny * rad, c.z + nz * rad); G.n.push(nx, ny, nz); G.uv.push(j / radial, t); G.c.push(...col); G.s.push(sway * Math.max(0, c.y - 1.5) * 0.15); } }
  for (let k = 0; k < segs; k++) for (let j = 0; j < radial; j++) { const a = st + k * (radial + 1) + j, b = a + radial + 1; G.i.push(a, b, a + 1, b, b + 1, a + 1); }
}
// red mangrove: 2-4 crooked stems on a root crown, 7-12 arching prop roots into the mud/water, dense dark glossy canopy
function mangroveGeo(seed, lod) {
  const r = mulberry(seed); const W = GA(), L = GA(); const bark = [0.36, 0.30, 0.24];
  const crownY = 1.0 + r() * 0.4; const nS = 2 + Math.floor(r() * 3); const tops = [];
  for (let s = 0; s < nS; s++) { const a = r() * TAU, d = 0.25 + r() * 0.35; const top = V(Math.cos(a) * (0.6 + r() * 1.2), 2.6 + r() * 1.4, Math.sin(a) * (0.6 + r() * 1.2));
    tubeInto(W, [V(Math.cos(a) * d * 0.4, crownY - 0.2, Math.sin(a) * d * 0.4), V(Math.cos(a) * d, crownY + 0.9, Math.sin(a) * d), top], 0.11, 0.05, lod ? 3 : 5, lod ? 2 : 4, bark, 1); tops.push(top); }
  const nR = lod ? 4 : 8 + Math.floor(r() * 5);
  for (let k = 0; k < nR; k++) { const a = (k / nR) * TAU + r() * 0.5; const out = 1.2 + r() * 1.3; const y0 = crownY + r() * 0.8;
    const ca = Math.cos(a), sa = Math.sin(a); const p0 = V(ca * 0.15, y0, sa * 0.15);
    tubeInto(W, [p0, V(ca * out * 0.45, y0 + 0.35, sa * out * 0.45), V(ca * out * 0.85, y0 * 0.45, sa * out * 0.85), V(ca * out, -0.6, sa * out)], 0.045, 0.06, lod ? 3 : 4, lod ? 2 : 5, [0.40, 0.33, 0.26]); }
  // aerial drop roots from the higher limbs (thin, straight)
  if (!lod) for (let k = 0; k < 4; k++) { const t = tops[k % tops.length]; const p = t.clone().multiplyScalar(0.6 + r() * 0.2); tubeInto(W, [p, V(p.x * 1.05, p.y * 0.5, p.z * 1.05), V(p.x * 1.1, -0.5, p.z * 1.1)], 0.02, 0.025, 3, 2, [0.42, 0.35, 0.27]); }
  const tint = [0.55, 0.72, 0.42];
  for (const t of tops) cardDome(L, r, t.clone().add(V(0, 0.2, 0)), 1.5 + r() * 0.6, 0.55, lod ? 9 : 22, lod ? 0.85 : 0.55, tint, 0.18);
  cardDome(L, r, V(0, 3.3, 0), 2.3, 0.5, lod ? 10 : 26, lod ? 0.95 : 0.6, tint, 0.2);
  return { wood: gaBuild(W), leaves: gaBuild(L) };
}
// sea grape: low spreading multi-stem shrub-tree with big round leaves
function seagrapeGeo(seed, lod) {
  const r = mulberry(seed); const W = GA(), L = GA(); const n = 3 + Math.floor(r() * 3); const Hc = 1.4 + r() * 1.4;
  for (let k = 0; k < n; k++) { const a = r() * TAU, d = 0.6 + r() * 1.4; const C = V(Math.cos(a) * d, Hc * (0.6 + r() * 0.5), Math.sin(a) * d);
    if (!lod) tubeInto(W, [V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), V(C.x * 0.5, C.y * 0.6, C.z * 0.5), C.clone().multiplyScalar(0.9)], 0.07, 0.035, 4, 2, [0.42, 0.36, 0.3]);
    cardDome(L, r, C, 1.0 + r() * 0.5, 0.6, lod ? 7 : 16, lod ? 0.75 : 0.5, [0.78, 0.86, 0.5], 0.14); }
  return { wood: lod ? null : gaBuild(W), leaves: gaBuild(L) };
}
// saw palmetto: ground-level fans on short petioles (fan alpha texture), uv polar like veg.js fanTex
function palmettoGeo(seed, lod) {
  const r = mulberry(seed); const G = GA(); const nF = lod ? 6 : 11; const NA = lod ? 5 : 8, NR = lod ? 1 : 2;
  for (let f = 0; f < nF; f++) {
    const az = f * 2.39996 + r() * 0.4; const dir = V(Math.cos(az), 0, Math.sin(az)); const side = V(-dir.z, 0, dir.x);
    const Lp = 0.35 + r() * 0.5, up = 0.5 + r() * 1.0, R = 0.55 + r() * 0.3; const top = V(dir.x * 0.15, 0.05, dir.z * 0.15);
    const c = top.clone().addScaledVector(dir, Lp).add(V(0, Lp * up, 0));
    const fdir = dir.clone().add(V(0, up * 0.7 + 0.25, 0)).normalize(); const fn = V().crossVectors(side, fdir).normalize(); if (fn.y < 0) fn.negate();
    const st = G.p.length / 3; const tint = [0.62 + r() * 0.12, 0.80 + r() * 0.1, 0.70 + r() * 0.12]; // silver-blue green
    for (let ir = 0; ir <= NR; ir++) for (let ia = 0; ia <= NA; ia++) { const rr = ir / NR; const a = (ia / NA - 0.5) * Math.PI * 0.95;
      const fold = (ia % 2 ? 1 : -1) * 0.06 * R * rr; const sag = -rr * rr * R * 0.25;
      const q = c.clone().addScaledVector(side, Math.sin(a) * R * rr).addScaledVector(fdir, Math.cos(a) * R * rr).addScaledVector(fn, fold + sag);
      G.p.push(q.x, Math.max(0.02, q.y), q.z); G.n.push(fn.x, fn.y, fn.z); G.uv.push(0.5 + Math.sin(a) * rr * 0.48, 0.012 + Math.cos(a) * rr * 0.97); G.c.push(...tint); G.s.push(0.15 + rr * 0.5); }
    for (let ir = 0; ir < NR; ir++) for (let ia = 0; ia < NA; ia++) { const a = st + ir * (NA + 1) + ia, b = a + NA + 1; G.i.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  return gaBuild(G);
}
// sand hummock (metres, uv = metres so the beach sand texture keeps its scale), edge sunk 6 cm into the beach
function moundGeo(seed, R, h) {
  const r = mulberry(seed); const NR = 6, NA = 20; const p = [], uv = [], idx = []; const ph = r() * TAU, ph2 = r() * TAU;
  for (let ir = 0; ir <= NR; ir++) for (let ia = 0; ia <= NA; ia++) { const t = ir / NR, a = (ia / NA) * TAU;
    const rad = R * (1 + 0.22 * Math.sin(2 * a + ph) + 0.1 * Math.sin(3 * a + ph2)) * t; const x = Math.cos(a) * rad * 1.5, z = Math.sin(a) * rad;
    const y = h * Math.pow(1 - t * t, 2) * (0.85 + 0.15 * Math.sin(a * 3 + ph)) - 0.06 * t; p.push(x, y, z); uv.push(x, z); }
  for (let ir = 0; ir < NR; ir++) for (let ia = 0; ia < NA; ia++) { const a = ir * (NA + 1) + ia, b = a + NA + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// limestone boulder: displaced, flattened icosahedron (displacement is a function of direction -> shared verts stay closed)
function rockGeo(seed, detail) {
  const r = mulberry(seed); const g = new THREE.IcosahedronGeometry(1, detail); const P = g.attributes.position; const k1 = r() * 9, k2 = r() * 9;
  const sx = 1 + r() * 0.6, sy = 0.45 + r() * 0.35, sz = 0.8 + r() * 0.5; const col = [];
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    let d = 1 + 0.22 * Math.sin(x * 3.1 + k1) * Math.cos(z * 2.7 + k2) + 0.12 * Math.sin(y * 5.3 + x * 4.1 + k2) + 0.06 * Math.sin(z * 9.1 + y * 7.7);
    if (y < -0.2) d *= 0.9; const yy = y * d * sy; P.setXYZ(i, x * d * sx, yy < -0.35 * sy ? -0.35 * sy + (yy + 0.35 * sy) * 0.3 : yy, z * d * sz);
    const v = 0.78 + 0.22 * Math.sin(x * 6 + z * 5 + k1); col.push(v * 0.92, v * 0.88, v * 0.78); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}

// ---------------------------------------------------------------- textures ----
// round leaves (sea grape / mangrove / clusia): overlapping ovals with a pale midrib, alpha gaps between them
function roundLeafTex(seed, glossy) {
  const r = mulberry(seed);
  return canvasTex(256, 256, (g, W, H) => { g.clearRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { const x = 28 + r() * 200, y = 28 + r() * 200, rx = glossy ? 16 + r() * 8 : 22 + r() * 12, ry = glossy ? 26 + r() * 10 : 20 + r() * 12; const a = r() * TAU;
      const red = !glossy && r() < 0.12; const c = red ? [150 + r() * 40, 70 + r() * 30, 40] : [70 + r() * 40, 110 + r() * 40, 40 + r() * 25];
      g.fillStyle = `rgb(${c.map((v) => v | 0).join(',')})`; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); g.fill();
      g.strokeStyle = glossy ? 'rgba(200,220,150,0.35)' : 'rgba(230,200,150,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - Math.sin(a) * ry * 0.9, y + Math.cos(a) * ry * 0.9); g.lineTo(x + Math.sin(a) * ry * 0.9, y - Math.cos(a) * ry * 0.9); g.stroke();
      if (!glossy) for (let v = 0; v < 4; v++) { const t = (v - 1.5) / 2; g.beginPath(); g.moveTo(x + Math.sin(a) * ry * t, y - Math.cos(a) * ry * t); g.lineTo(x + Math.sin(a) * ry * t + Math.cos(a) * rx * 0.8, y - Math.cos(a) * ry * t + Math.sin(a) * rx * 0.8); g.stroke(); } } });
}

// ---------------------------------------------------------------- LOD field (bucketed instancing) ----
// tiers: [{ parts: [[geo, mat, depthMat|null, cast]], d: max distance }] nearest first; items: [{x, z, m: Matrix4}]
class Field {
  constructor(scene, out, name, tiers, items) {
    this.name = name; this.tiers = tiers; this.items = items; this.B = new Map(); this.last = [1e9, 1e9]; this.ims = [];
    for (const it of items) { const k = Math.floor(it.x / 64) + ',' + Math.floor(it.z / 64); let b = this.B.get(k); if (!b) this.B.set(k, b = { cx: (Math.floor(it.x / 64) + 0.5) * 64, cz: (Math.floor(it.z / 64) + 0.5) * 64, l: [] }); b.l.push(it); }
    for (const t of tiers) { t.ims = t.parts.filter((p) => p[0]).map(([geo, mat, dm, cast]) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)); im.count = 0;
      im.castShadow = !!cast; im.receiveShadow = true; if (dm) im.customDepthMaterial = dm; im.frustumCulled = false; im.userData.flora = name; scene.add(im); out.push(im); this.ims.push(im); return im; }); }
    this.maxD = tiers[tiers.length - 1].d;
  }
  update(cx, cz, force) {
    if (!force && Math.hypot(cx - this.last[0], cz - this.last[1]) < 10) return; this.last = [cx, cz];
    const T = this.tiers; const cnt = T.map(() => 0); const lim = T.map((t) => t.d * t.d);
    for (const b of this.B.values()) { if (Math.hypot(b.cx - cx, b.cz - cz) > this.maxD + 46) continue;
      for (const it of b.l) { const d = (it.x - cx) ** 2 + (it.z - cz) ** 2; let ti = 0; while (ti < T.length && d > lim[ti]) ti++; if (ti >= T.length) continue;
        const idx = cnt[ti]++; for (const im of T[ti].ims) im.setMatrixAt(idx, it.m); } }
    T.forEach((t, ti) => { for (const im of t.ims) { im.count = cnt[ti]; im.instanceMatrix.needsUpdate = true; } });
    this.counts = cnt;
  }
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const mat4 = (x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };

// ---------------------------------------------------------------- placement helpers ----
// free of buildings / walls / props (collider grid), palms & trees only block their own trunk
function freeAt(city, x, z, m) { const l = city.col.query(x, z, m + 1, []); for (const b of l) { if (b.tag === 'palm' || b.tag === 'tree') { if (x > b.minX - 0.6 && x < b.maxX + 0.6 && z > b.minZ - 0.6 && z < b.maxZ + 0.6) return false; continue; }
  if (x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m) return false; } return true; }
const boardwalkX = (a) => 250 + 45 * Math.sin(a * 0.017) - 20 * Math.sin(a * 0.041); // north dune boardwalk (region.js)
const nearBoardwalk = (x, z) => z > 380 && z < 594 && Math.abs(x - boardwalkX(z)) < 3.2;
// beach stair landings of the promenade blocks (archdetail.beachDetail at x1 = 335, z = block mid + 22)
function stairZs(city) { const zs = []; for (const b of city.blocks || []) if (b.area === 'promenade') zs.push((b.z0 + b.z1) / 2 + 22); return zs; }

// hammock palms / trees for the natural island ends: returned to veg.js, which renders them with its palm / tree LODs
let XCACHE = null;
export function floraExtras(city) {
  if (XCACHE) return XCACHE; const r = mulberry(6401); const palms = [], trees = [];
  for (const sg of [1, -1]) for (let a = ISLE.z0 + 30; a < ISLE.tip - 40; a += 6) {
    const z0 = sg * a; const xw = westCoast(z0), xe = 335 + beachOff(z0); if (xe - xw < 40) continue;
    for (let x = xw + 10; x < xe - 14; x += 6) {
      const z = z0 + (r() - 0.5) * 5, xx = x + (r() - 0.5) * 5; const grove = fbm(xx * 0.012 + sg * 40, z * 0.012); const u = r();
      if (grove < 0.5 || nearBoardwalk(xx, z)) continue; if (!freeAt(city, xx, z, 4)) continue;
      const dens = (grove - 0.5) * 2; // 0..1 inside the hammock patches
      if (u < 0.05 * dens) { const coco = (xe - xx) < 50 && r() < 0.6; palms.push({ x: xx, z, h: coco ? 8 + r() * 5 : 7 + r() * 6, lean: coco ? r() * 0.18 : (r() - 0.5) * 0.08, rot: r() * TAU, s: 0.85 + r() * 0.25, hammock: true, far2: 1300 * 1300 }); }
      else if (u < 0.05 * dens + 0.035 * dens) trees.push({ x: xx, z, s: 0.8 + r() * 0.5, far2: 1300 * 1300 });
    }
  }
  for (const p of palms) city.col.add(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3, 6, 'palm');
  for (const t of trees) city.col.add(t.x - 0.35, t.z - 0.35, t.x + 0.35, t.z + 0.35, 6, 'tree');
  XCACHE = { palms, trees }; return XCACHE;
}


// ---------------------------------------------------------------- r6.5 a_palms: foredune ridges + crossover boardwalks ----
// The natural island ends get a continuous, wind-shaped foredune ridge along the upper beach (crest height / position vary,
// blowouts cut through it) and a vegetated apron mesh over the whole dune band: vertex colours carry sea-oat / dune-grass
// cover patches, straw-dry patches and bare sand, so the band reads from the 190 m aerial. Wooden crossover boardwalks
// (posts, handrails, a ramp down to the beach) cross the dunes every ~120-190 m. Static, chunked meshes (frustum culled).
const NAT = (z) => Math.abs(z) > 400 && Math.abs(z) < ISLE.tip - 70;
const DECO = (z) => Math.abs(z) < 372;
const bandW = (z) => DECO(z) ? 11 : 16 + 9 * vn(z * 0.01, 3.3);
let WALKZ = null;
function walkZs() { if (WALKZ) return WALKZ; const rw = mulberry(7301); WALKZ = []; for (const sg of [1, -1]) for (let a = 470 + rw() * 40; a < ISLE.tip - 130; a += 120 + rw() * 70) WALKZ.push(sg * a); return WALKZ; }
const walkDip = (z) => { let d = 1; for (const wz of walkZs()) d = Math.min(d, 1 - 0.7 * Math.exp(-(((z - wz) / 5) ** 2))); return d; };
function ridgeHc(z) { if (!NAT(z)) return 0; const a = Math.abs(z); const ramp = Math.max(0, Math.min(1, (a - 400) / 60, (ISLE.tip - 70 - a) / 80));
  return ramp * (0.4 + 0.65 * fbm(z * 0.017, 7.7)) * (1 - 0.8 * smooth(0.68, 0.8, vn(z * 0.028, 2.2))) * walkDip(z); }
// dune height above the beach surface (0 outside the natural ends)
export function duneH(x, z) {
  const hc = ridgeHc(z); if (!hc) return 0; const x0 = 335 + beachOff(z); const b = bandW(z); const u = (x - x0) / b; if (u <= 0 || u >= 1.25) return 0;
  const c = 0.42 + 0.22 * (vn(z * 0.021, 1.1) - 0.5); const d = (u - c) / 0.3;
  let h = Math.exp(-d * d * (d > 0 ? 1.7 : 1.0)) + 0.4 * Math.exp(-(((u - c - 0.42) / 0.16) ** 2)) * vn(z * 0.05, 9.1); // crest + seaward hummocks
  h *= hc * (1 + 0.3 * (vn(x * 0.22, z * 0.11) - 0.5)); return h * smooth(0, 0.14, u) * smooth(1.25, 1.02, u);
}
// vegetation cover 0..1 on the dune band (shared by the apron colours and the grass clump placement)
function duneCover(x, z, h) { const x0 = 335 + beachOff(z); const u = (x - x0) / bandW(z);
  return smooth(0.42, 0.64, fbm(x * 0.06, z * 0.035) + h * 0.16 + (u < 0.5 ? 0.08 : -0.04)) * smooth(1.2, 0.9, u); }
function duneApron(city, sg) {
  const gH = (x, z) => city.groundH(x, z); const chunks = []; const NX = 20, DZ = 2.0;
  const a0 = 404, a1 = ISLE.tip - 72; const rows = Math.floor((a1 - a0) / DZ);
  for (let c0 = 0; c0 < rows; c0 += 30) {
    const p = [], col = [], uv = [], idx = []; const nr = Math.min(30, rows - c0);
    for (let rI = 0; rI <= nr; rI++) { const z = sg * (a0 + (c0 + rI) * DZ); const x0 = 335 + beachOff(z), b = bandW(z);
      for (let i = 0; i <= NX; i++) { const u = 0.02 + 1.2 * i / NX; const x = x0 + u * b; const h = duneH(x, z); const edge = i === 0 || i === NX;
        const y = gH(x, z) + (edge ? -0.14 : 0.035 + h); p.push(x, y, z); uv.push(x, z);
        const cv = duneCover(x, z, h); const dry = smooth(0.55, 0.75, vn(x * 0.045 + 3.0, z * 0.02)); const t = 0.85 + 0.25 * vn(x * 0.3, z * 0.3);
        const veg = [0.50 * t, 0.60 * t, 0.33 * t], straw = [0.90, 0.82, 0.60]; const vc = veg.map((v, j) => v + (straw[j] - v) * dry * 0.7);
        const bare = 1 - 0.06 * smooth(0.3, 0.9, h); col.push(...vc.map((v) => bare + (v - bare) * cv)); } }
    for (let rI = 0; rI < nr; rI++) for (let i = 0; i < NX; i++) { const a = rI * (NX + 1) + i, b = a + NX + 1; if (sg < 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere(); chunks.push(g);
  }
  return chunks;
}
// plank texture: one board per v-repeat (weathered grey-brown, dark gap), u = across the walkway
function plankTex() { const r = mulberry(5151); return canvasTex(128, 32, (g) => { g.fillStyle = '#8a7a66'; g.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 400; i++) { const v = (r() - 0.5) * 50; g.fillStyle = `rgba(${150 + v},${134 + v},${112 + v},0.35)`; g.fillRect(r() * 128, r() * 27, 4 + r() * 30, 1); }
  for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(60,50,40,0.6)'; g.beginPath(); g.arc(r() * 128, 4 + r() * 20, 0.8, 0, TAU); g.fill(); } // nail heads
  g.fillStyle = '#2b2520'; g.fillRect(0, 27, 128, 5); }); }
function boardwalks(city) {
  const G = GA(); const gH = (x, z) => city.groundH(x, z); const WOOD = [0.78, 0.72, 0.64];
  const quad = (a, b, c, d, n, uvs, col = WOOD) => { const st = G.p.length / 3; for (const q of [a, b, c, d]) { G.p.push(...q); G.n.push(...n); G.c.push(...col); G.s.push(0); }
    G.uv.push(...uvs); G.i.push(st, st + 1, st + 2, st, st + 2, st + 3); };
  // oriented box from p0 to p1 (centre line), width w (horizontal), height h (vertical extent below the line)
  const beam = (p0, p1, w, h) => { const dx = p1[0] - p0[0], dz = p1[2] - p0[2]; const L = Math.hypot(dx, dz) || 1; const sx = -dz / L * w / 2, sz = dx / L * w / 2;
    const A = (p, s, dy) => [p[0] + sx * s, p[1] + dy, p[2] + sz * s]; const U = [0.1, 0.4, 0.9, 0.4, 0.9, 0.6, 0.1, 0.6];
    quad(A(p0, -1, 0), A(p0, 1, 0), A(p1, 1, 0), A(p1, -1, 0), [0, 1, 0], U); quad(A(p0, 1, 0), A(p0, 1, -h), A(p1, 1, -h), A(p1, 1, 0), [sx, 0, sz], U); quad(A(p0, -1, -h), A(p0, -1, 0), A(p1, -1, 0), A(p1, -1, -h), [-sx, 0, -sz], U); };
  const post = (x, y0, y1, z, w) => { const h = w / 2; const U = [0.2, 0.4, 0.3, 0.4, 0.3, 0.6, 0.2, 0.6];
    quad([x - h, y0, z + h], [x + h, y0, z + h], [x + h, y1, z + h], [x - h, y1, z + h], [0, 0, 1], U); quad([x + h, y0, z - h], [x - h, y0, z - h], [x - h, y1, z - h], [x + h, y1, z - h], [0, 0, -1], U);
    quad([x + h, y0, z + h], [x + h, y0, z - h], [x + h, y1, z - h], [x + h, y1, z + h], [1, 0, 0], U); quad([x - h, y0, z - h], [x - h, y0, z + h], [x - h, y1, z + h], [x - h, y1, z - h], [-1, 0, 0], U);
    quad([x - h, y1, z + h], [x + h, y1, z + h], [x + h, y1, z - h], [x - h, y1, z - h], [0, 1, 0], U); };
  const spans = [];
  for (const wz of walkZs()) {
    const x0 = 335 + beachOff(wz), b = bandW(wz); const xe = x0 + b * 1.12 + 2; let xs = x0 - 12;
    for (let x = x0 + 2; x > x0 - 12; x -= 1.5) if (!freeAt(city, x, wz, 1.2) || !freeAt(city, x, wz - 1.1, 0.6) || !freeAt(city, x, wz + 1.1, 0.6)) { xs = x + 1.5; break; }
    if (xe - xs < 10) continue; const n = Math.ceil(xe - xs); const xsArr = [], gr = [];
    for (let i = 0; i <= n; i++) { const x = xs + (xe - xs) * i / n; xsArr.push(x); gr.push(Math.max(gH(x, wz), gH(x, wz - 1), gH(x, wz + 1)) + Math.max(duneH(x, wz - 1), duneH(x, wz), duneH(x, wz + 1))); }
    const dk = gr.map((_, i) => { let m = -1e9; for (let j = Math.max(0, i - 3); j <= Math.min(n, i + 3); j++) m = Math.max(m, gr[j]); return m + 0.45; });
    for (let i = 0; i <= n; i++) { const fa = Math.min(1, i / 3), fb = Math.min(1, (n - i) / 4); dk[i] = gr[i] + 0.12 + (dk[i] - gr[i] - 0.12) * Math.min(fa, fb); }
    spans.push([wz, xs, xe]); const W = 1.9, hw = W / 2;
    for (let i = 0; i < n; i++) { const xa = xsArr[i], xb = xsArr[i + 1], ya = dk[i], yb = dk[i + 1]; const sa = i * (xe - xs) / n, sb = (i + 1) * (xe - xs) / n;
      quad([xa, ya, wz + hw], [xb, yb, wz + hw], [xb, yb, wz - hw], [xa, ya, wz - hw], [0, 1, 0], [0, sa / 0.16, 0, sb / 0.16, 1, sb / 0.16, 1, sa / 0.16]);
      for (const s of [1, -1]) quad([xa, ya - 0.22, wz + s * hw], [xb, yb - 0.22, wz + s * hw], [xb, yb, wz + s * hw], [xa, ya, wz + s * hw], [0, 0, s], [0.1, 0.4, 0.9, 0.4, 0.9, 0.6, 0.1, 0.6]); }
    // posts every ~2.4 m (support + handrail), rails between them; no rails on the ramp ends
    const step = Math.max(1, Math.round(2.4 / ((xe - xs) / n)));
    let prev = null;
    for (let i = 0; i <= n; i += step) { const x = xsArr[i], y = dk[i], ramp = i < 3 || i > n - 4;
      for (const s of [1, -1]) post(x, gr[i] - 0.4, y + (ramp ? -0.05 : 0.95), wz + s * (hw - 0.06), 0.12);
      if (prev && !ramp && !prev.ramp) for (const s of [1, -1]) for (const dy of [0.95, 0.5]) beam([prev.x, prev.y + dy, wz + s * (hw - 0.06)], [x, y + dy, wz + s * (hw - 0.06)], 0.09, 0.07);
      prev = { x, y, ramp }; }
  }
  return { geo: G.p.length ? gaBuild(G) : null, spans };
}

// ---------------------------------------------------------------- build ----
export function buildFloraA(scene, city, ctx) {
  const { T, leafMat, fanMat } = ctx; const out = []; const fields = []; const stats = {};
  const gH = (x, z) => city.groundH(x, z);
  // materials (unique program keys: prep() caches programs by key)
  const grassMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), 'flGrass', (s) => foliagePatch(s, 0.7, 0.8, 2.6));
  const grassDepth = swayDepth({ map: null, alphaTest: 0 }, 2.6, 'flGrass');
  const sgTex = roundLeafTex(71, false), mgTex = roundLeafTex(83, true);
  const sgMat = prep(new THREE.MeshStandardMaterial({ map: sgTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, vertexColors: true, color: new THREE.Color().setRGB(1.25, 1.25, 1.1) }), 'flSG', (s) => foliagePatch(s, 0.5, 1, 1.5));
  const mgMat = prep(new THREE.MeshStandardMaterial({ map: mgTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.4, vertexColors: true, color: new THREE.Color().setRGB(1.05, 1.1, 0.95) }), 'flMG', (s) => foliagePatch(s, 0.5, 1, 1.3));
  const sgDepth = swayDepth(sgMat, 1.5, 'flSG'), mgDepth = swayDepth(mgMat, 1.3, 'flMG');
  const woodMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: T.bark_d || null }), 'flWood', (s) => foliagePatch(s, 0.0));
  const palmettoMat = prep(new THREE.MeshStandardMaterial({ map: fanMat.map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true, color: new THREE.Color().setRGB(1.2, 1.2, 1.1) }), 'flPalmetto', (s) => foliagePatch(s, 0.35, 1, 1.4));
  const palmettoDepth = swayDepth(palmettoMat, 1.4, 'flPalmetto');
  const hedgeMat = prep(new THREE.MeshStandardMaterial({ map: sgTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true, color: new THREE.Color().setRGB(1.05, 1.15, 0.95) }), 'flHedge', (s) => foliagePatch(s, 0.45, 0.6, 0.6));
  const rockMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, color: new THREE.Color().setRGB(0.92, 0.89, 0.82) }), 'flRock', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  { vec4 rw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n  rw = instanceMatrix * rw;\n#endif\n  vRW = (modelMatrix * rw).xyz; }');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRW;
float rkh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float rkn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkh(i), rkh(i + vec3(1,0,0)), f.x), mix(rkh(i + vec3(0,1,0)), rkh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rkh(i + vec3(0,0,1)), rkh(i + vec3(1,0,1)), f.x), mix(rkh(i + vec3(0,1,1)), rkh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gRkWet = 0.0;`).replace('#include <color_fragment>', `#include <color_fragment>
  { float n = rkn(vRW * 1.7) * 0.55 + rkn(vRW * 6.3) * 0.3 + rkn(vRW * 19.0) * 0.15;
    diffuseColor.rgb *= 0.72 + 0.5 * n;                                         // pitted limestone
    diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(0.62, 0.8, rkn(vRW * 4.1 + 3.0)); // solution holes / dark pits
    float y = vRW.y + (rkn(vRW * 0.9) - 0.5) * 0.25;
    float wet = smoothstep(-0.25, -0.75, y); float alg = smoothstep(-0.55, -0.95, y);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.42, 0.36), wet);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.20, 0.10) * (0.7 + 0.6 * n), alg * 0.85);   // algae / barnacle band
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.06, 1.0), smoothstep(0.4, 1.4, y) * 0.5); // sun-bleached tops
    gRkWet = wet; }`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.28, gRkWet);');
  });
  const sandMat = M.sand;

  // ---------- 1. dune band on the upper beach --------------------------------------------------------------------
  // flora_a iter2: first pass read as stray pale strokes on the bright sand -> fuller clumps, wider blades, deeper green bases
  const oats = [grassClump(11, { n: 30, H: 1.35, segs: 4, R0: 0.42, base: [0.22, 0.32, 0.10], tip: [0.66, 0.60, 0.30], heads: 0.45, lean: 0.45, wid: 0.05 }),
    grassClump(13, { n: 34, H: 1.1, segs: 4, R0: 0.5, base: [0.20, 0.30, 0.09], tip: [0.60, 0.58, 0.28], heads: 0.3, lean: 0.55, wid: 0.052 })];
  const oatsFar = grassClump(17, { n: 10, H: 1.25, segs: 2, R0: 0.4, base: [0.24, 0.32, 0.12], tip: [0.58, 0.54, 0.30], heads: 0, lean: 0.4, wid: 0.11 });
  const oatsTuft = grassClump(18, { n: 4, H: 1.2, segs: 1, R0: 0.35, base: [0.26, 0.33, 0.13], tip: [0.55, 0.52, 0.30], heads: 0, lean: 0.35, wid: 0.24 }); // a_palms: 3rd tier for the aerials
  const duneLow = grassClump(19, { n: 34, H: 0.5, segs: 3, R0: 0.75, base: [0.16, 0.28, 0.08], tip: [0.42, 0.52, 0.20], lean: 0.8, wid: 0.06 });
  const duneLowFar = grassClump(23, { n: 10, H: 0.5, segs: 1, R0: 0.7, base: [0.18, 0.28, 0.10], tip: [0.40, 0.48, 0.22], lean: 0.6, wid: 0.13 });
  const duneLowTuft = grassClump(24, { n: 4, H: 0.45, segs: 1, R0: 0.7, base: [0.20, 0.30, 0.11], tip: [0.40, 0.47, 0.22], lean: 0.6, wid: 0.32 });
  const mounds = [moundGeo(3, 3.2, 0.7), moundGeo(5, 4.5, 1.05), moundGeo(7, 2.4, 0.5)];
  const rd = mulberry(7001); const stairs = stairZs(city);
  const oatI = [[], []], lowI = [], mI = [[], [], []];
  const dist = (zz) => Math.abs(zz) < 372; // Deco district: narrower strip, umbrellas start at x≈354
  const BW = boardwalks(city); const onWalk = (x, z) => BW.spans.some(([wz, xs, xe]) => Math.abs(z - wz) < 1.7 && x > xs - 1 && x < xe + 1);
  for (let z = -ISLE.tip + 60; z < ISLE.tip - 60; z += 1.6) {
    const x0 = 335 + beachOff(z); const band = dist(z) ? 11 : 16 + 9 * vn(z * 0.01, 3.3); // iter2: wider foredune on the natural ends (read from the air)
    if (stairs.some((s) => Math.abs(z - s) < 4.5)) continue; // keep the beach stairs / showers clear
    const nat = NAT(z); // a_palms: natural ends follow the vegetated foredune ridge (denser, patchy, on top of the dune surface)
    for (let k = 0; k < (nat ? 10 : 6); k++) {
      const x = x0 + 1.2 + rd() * band * (nat ? 1.12 : 1), zz = z + (rd() - 0.5) * 1.6; const m = fbm(x * 0.09, zz * 0.05); const edge = (x - x0) / band;
      const dh = nat ? duneH(x, zz) : 0;
      if (nat ? duneCover(x, zz, dh) < 0.25 + rd() * 0.5 : m < 0.30 + edge * 0.30) continue; if (onWalk(x, zz) || !freeAt(city, x, zz, 0.8)) continue;
      const y = gH(x, zz) + dh; const rot = rd() * TAU; const s = 0.75 + rd() * 0.55;
      if (rd() < (nat ? 0.55 + 0.3 * smooth(0.2, 1.0, dh) : 0.62)) oatI[rd() < 0.5 ? 0 : 1].push({ x, z: zz, m: mat4(x, y - 0.04, zz, rot, s, s * (0.8 + m * 0.5), s) });
      else lowI.push({ x, z: zz, m: mat4(x, y - 0.03, zz, rot, s * 1.3, s, s * 1.3) });
    }
    if (!nat && rd() < (dist(z) ? 0.1 : 0.22)) { const x = x0 + 2.5 + rd() * (band - 4); if (freeAt(city, x, z, 3)) { const mi = Math.floor(rd() * 3); mI[mi].push({ x, z, m: mat4(x, gH(x, z) - 0.02, z, rd() * 0.5 - 0.25 + Math.PI / 2 * 0, 0.9 + rd() * 0.3, 0.8 + rd() * 0.5, 0.9 + rd() * 0.3) }); } }
  }
  { // a_palms: dune apron meshes (sand material + vertex-colour cover patches) and the crossover boardwalks
    const sm = M.sand; const duneMat = prep(new THREE.MeshStandardMaterial({ map: sm.map, normalMap: sm.normalMap, roughnessMap: sm.roughnessMap, color: sm.color.clone(), roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'flDune', (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvDW = (modelMatrix * vec4(position, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vDW;\nfloat dh2(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }')
        .replace('#include <color_fragment>', `{ vec2 cI = floor(vDW * 3.0); float n = dh2(cI) * 0.5 + dh2(floor(vDW * 0.9)) * 0.5; // clumpy cover: tint breaks into tufts up close
  float fw = length(fwidth(vDW)); float k = mix(clamp(0.35 + n * 1.1, 0.0, 1.0), 1.0, smoothstep(0.15, 0.8, fw));
  diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, k); }`);
    });
    for (const sg of [1, -1]) for (const g of duneApron(city, sg)) { const me = new THREE.Mesh(g, duneMat); me.receiveShadow = true; me.castShadow = true; me.userData.flora = 'duneApron'; scene.add(me); out.push(me); stats.duneApron = (stats.duneApron || 0) + g.index.count / 3; }
    if (BW.geo) { // program reuse: front-sided + instanced (1 identity instance) + 'flWood' key = same program as the hammock wood; both faces are baked into the geometry instead of DoubleSide
      const bwMat = prep(new THREE.MeshStandardMaterial({ map: plankTex(), vertexColors: true, roughness: 0.85 }), 'flWood', (s) => foliagePatch(s, 0.0));
      const me = new THREE.InstancedMesh(twoSided(BW.geo), bwMat, 1); me.setMatrixAt(0, new THREE.Matrix4()); me.frustumCulled = false; me.castShadow = true; me.receiveShadow = true; me.userData.flora = 'boardwalk'; scene.add(me); out.push(me); stats.boardwalk = BW.spans.length; stats.boardwalkTris = BW.geo.index.count / 3; }
  }
  // ---------- 2. island ends: coastal hammock understory, bay-edge sea grape (north) / mangroves + marsh (south) ----
  const sgNear = [seagrapeGeo(31, false), seagrapeGeo(37, false)], sgFar = [seagrapeGeo(31, true), seagrapeGeo(37, true)];
  const pmNear = [palmettoGeo(41, false), palmettoGeo(43, false)], pmFar = palmettoGeo(41, true);
  const sgI = [[], []], pmI = [[], []], marshI = [], mgI = [[], [], []], rockI = [[], []];
  const rh = mulberry(7101);
  for (const sg of [1, -1]) for (let a = ISLE.z0 + 8; a < ISLE.tip - 10; a += 3.2) {
    const z0 = sg * a; const xw = westCoast(z0), xe = 335 + beachOff(z0); const wid = xe - xw; if (wid < 12) continue;
    // interior understory (hammock patches + scattered palmetto in the open)
    for (let x = xw + 6; x < xe - 6; x += 3.2) {
      const xx = x + (rh() - 0.5) * 3, z = z0 + (rh() - 0.5) * 3; const grove = fbm(xx * 0.012 + sg * 40, z * 0.012); const u = rh();
      const near = (xe - xx) < 30; // back-dune: sea grape thicket along the beach side
      const pS = near ? 0.10 : grove > 0.5 ? 0.06 : 0.008, pP = grove > 0.46 ? 0.10 : 0.018;
      if (u > pS + pP) continue; if (nearBoardwalk(xx, z) || !freeAt(city, xx, z, 2)) continue;
      const y = gH(xx, z); const rot = rh() * TAU;
      if (u < pS) { const s = 0.75 + rh() * 0.6; sgI[rh() < 0.5 ? 0 : 1].push({ x: xx, z, m: mat4(xx, y, z, rot, s, s * (0.8 + rh() * 0.4), s) }); }
      else { const s = 0.8 + rh() * 0.6; pmI[rh() < 0.5 ? 0 : 1].push({ x: xx, z, m: mat4(xx, y, z, rot, s) }); }
    }
    // bay edge
    if (sg < 0) { // south: mangrove fringe in the water + marsh grass at the waterline
      for (let k = 0; k < 2; k++) { const off = -6.5 + rh() * 8; const x = xw + off, z = z0 + (rh() - 0.5) * 3; if (fbm(x * 0.03, z * 0.03) < 0.28) continue;
        const yb = Math.max(-1.05, Math.min(0.15, 0.15 - (xw - x) * 0.28)); const s = 0.8 + rh() * 0.55; mgI[Math.floor(rh() * 3)].push({ x, z, m: mat4(x, yb, z, rh() * TAU, s, s * (0.85 + rh() * 0.3), s) }); }
      for (let k = 0; k < 3; k++) { const x = xw - 2 + rh() * 9, z = z0 + (rh() - 0.5) * 3.2; const yb = Math.max(-1.0, Math.min(0.15, 0.15 - (xw - x) * 0.28)); const s = 0.8 + rh() * 0.5;
        marshI.push({ x, z, m: mat4(x, yb - 0.02, z, rh() * TAU, s, s * (0.8 + rh() * 0.5), s) }); }
    } else { // north: sea grape hedge along the bay bank, scattered limestone at the waterline
      if (rh() < 0.5) { const x = xw + 1 + rh() * 5, z = z0; if (freeAt(city, x, z, 2)) { const s = 0.8 + rh() * 0.5; sgI[rh() < 0.5 ? 0 : 1].push({ x, z, m: mat4(x, gH(x, z), z, rh() * TAU, s) }); } }
    }
    if (rh() < (a > ISLE.tip - 160 ? 0.9 : 0.16)) { const n = 1 + Math.floor(rh() * 3); for (let k = 0; k < n; k++) { const x = xw - 1 - rh() * 7, z = z0 + (rh() - 0.5) * 4; const yb = Math.max(-1.6, 0.15 - (xw - x) * 0.28);
      const s = 0.5 + rh() * 1.1; rockI[rh() < 0.5 ? 0 : 1].push({ x, z, m: mat4(x, yb + s * 0.15, z, rh() * TAU, s, s, s, (rh() - 0.5) * 0.4, (rh() - 0.5) * 0.4) }); } }
  }
  // existing bay-edge thickets flagged as mangroves by region.js (positions kept; city RNG untouched)
  for (const t of ctx.mangroves || []) { const xw = westCoast(t.z); const yb = Math.max(-1.05, Math.min(0.15, 0.15 - (xw - t.x) * 0.28)); const s = 0.45 + t.s * 0.35;
    mgI[Math.floor(hh(t.x, t.z) * 3) % 3].push({ x: t.x, z: t.z, m: mat4(t.x, Math.min(yb, gH(t.x, t.z)), t.z, t.x * 1.7, s) }); }
  // island tips: limestone points
  for (const sg of [1, -1]) { const zt = sg * (ISLE.tip + 30); for (let k = 0; k < 70; k++) { const a = rh() * Math.PI - Math.PI / 2; const R = 40 + rh() * 45;
    const x = 335 + beachOff(zt) - 60 + Math.cos(a) * R * 1.4, z = zt + sg * Math.sin(a + Math.PI / 2) * R * 0.7; const yb = Math.max(-1.7, gH(x, z)); const s = 0.6 + rh() * 1.6;
    rockI[rh() < 0.5 ? 0 : 1].push({ x, z, m: mat4(x, yb + s * 0.1, z, rh() * TAU, s, s, s, (rh() - 0.5) * 0.5, (rh() - 0.5) * 0.5) }); } }
  // shallow reef heads off the beach ends and around the lighthouse point (break the water line, read from the air)
  for (const [cz, n, xr] of [[-1150, 26, [520, 600]], [1150, 26, [520, 600]], [-374, 22, [540, 585]], [820, 14, [515, 560]]]) {
    for (let k = 0; k < n; k++) { const x = xr[0] + rh() * (xr[1] - xr[0]) + beachOff(cz), z = cz + (rh() - 0.5) * 120; const s = 0.8 + rh() * 1.8;
      rockI[rh() < 0.5 ? 0 : 1].push({ x, z, m: mat4(x, -1.35 + rh() * 0.35, z, rh() * TAU, s * 1.3, s * 0.7, s, (rh() - 0.5) * 0.3, 0) }); } }
  // ---------- 3. promenade hedges (clipped sea grape / clusia), Deco district ----------------------------------------
  const hedgeG = (() => { const G = GA(); const r = mulberry(91); // 4 m long clipped hedge segment: box-ish card shell
    for (let k = 0; k < 120; k++) { const side = Math.floor(r() * 5); let x = (r() - 0.5) * 4, y = 0.15 + r() * 0.85, z = (r() - 0.5) * 0.9, n = [0, 1, 0];
      if (side === 0) { y = 1.0 + r() * 0.08; n = [0, 1, 0]; } else if (side === 1) { z = 0.45 + r() * 0.06; n = [0, 0.3, 1]; } else if (side === 2) { z = -0.45 - r() * 0.06; n = [0, 0.3, -1]; } else if (side === 3) { y = 1.0; z = (r() - 0.5) * 0.9; n = [0, 1, 0]; }
      const nn = V(...n).normalize(); const a = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(); const t1 = V().crossVectors(nn, a).normalize(), t2 = V().crossVectors(nn, t1).normalize(); const s = 0.32 + r() * 0.12; const st = G.p.length / 3; const g = 0.8 + r() * 0.3;
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = V(x, y, z).addScaledVector(t1, i * s).addScaledVector(t2, j * s); G.p.push(q.x, Math.max(0.05, q.y), q.z); G.n.push(nn.x, nn.y, nn.z); G.uv.push((i + 1) / 2, (j + 1) / 2); G.s.push(0.05); G.c.push(0.7 * g, 0.85 * g, 0.55 * g); }
      G.i.push(st, st + 1, st + 2, st, st + 2, st + 3); }
    // dense core so the hedge never reads hollow
    const core = new THREE.BoxGeometry(3.9, 0.95, 0.8).translate(0, 0.55, 0); const cp = core.attributes.position, cn = core.attributes.normal, cuv = core.attributes.uv; const st = G.p.length / 3;
    for (let i = 0; i < cp.count; i++) { G.p.push(cp.getX(i), cp.getY(i), cp.getZ(i)); G.n.push(cn.getX(i), cn.getY(i), cn.getZ(i)); G.uv.push(0.3 + cuv.getX(i) * 0.05, 0.4 + cuv.getY(i) * 0.05); G.s.push(0); G.c.push(0.42, 0.55, 0.3); }
    for (let i = 0; i < core.index.count; i++) G.i.push(st + core.index.getX(i)); return gaBuild(G); })();
  const hedgeI = [];
  for (const b of city.blocks || []) { if (b.area !== 'promenade') continue; const xh = b.x1 - 6.2; // just inside the coral-stone wall
    for (let z = b.z0 + 5; z < b.z1 - 5; z += 4.1) { if (stairs.some((s) => Math.abs(z - s) < 6)) continue; if (!freeAt(city, xh, z, 0.6)) continue;
      hedgeI.push({ x: xh, z, m: mat4(xh, gH(xh, z), z, Math.PI / 2, 1, 0.9 + hh(xh, z) * 0.25, 1) }); } }

  // ---------- fields ----------
  const F = (name, tiers, items) => { if (!items.length) return; const f = new Field(scene, out, name, tiers, items); fields.push(f); stats[name] = items.length; };
  F('oats0', [{ parts: [[oats[0], grassMat, grassDepth, true]], d: 70 }, { parts: [[oatsFar, grassMat, null, false]], d: 240 }, { parts: [[oatsTuft, grassMat, null, false]], d: 650 }], oatI[0]);
  F('oats1', [{ parts: [[oats[1], grassMat, grassDepth, true]], d: 70 }, { parts: [[oatsFar, grassMat, null, false]], d: 240 }, { parts: [[oatsTuft, grassMat, null, false]], d: 650 }], oatI[1]);
  F('duneLow', [{ parts: [[duneLow, grassMat, null, false]], d: 60 }, { parts: [[duneLowFar, grassMat, null, false]], d: 200 }, { parts: [[duneLowTuft, grassMat, null, false]], d: 520 }], lowI);
  mounds.forEach((g, i) => F('mound' + i, [{ parts: [[g, sandMat, null, false]], d: 1600 }], mI[i]));
  sgNear.forEach((g, i) => F('seagrape' + i, [{ parts: [[g.wood, woodMat, null, true], [g.leaves, sgMat, sgDepth, true]], d: 90 }, { parts: [[sgFar[i].leaves, sgMat, null, false]], d: 1200 }], sgI[i]));
  pmNear.forEach((g, i) => F('palmetto' + i, [{ parts: [[g, palmettoMat, palmettoDepth, true]], d: 60 }, { parts: [[pmFar, palmettoMat, null, false]], d: 420 }], pmI[i]));
  F('marsh', [{ parts: [[grassClump(29, { n: 30, H: 1.2, segs: 3, R0: 0.7, base: [0.30, 0.40, 0.16], tip: [0.66, 0.66, 0.36], lean: 0.35, wid: 0.03 }), grassMat, grassDepth, true]], d: 80 },
    { parts: [[grassClump(31, { n: 9, H: 1.1, segs: 1, R0: 0.6, base: [0.32, 0.40, 0.18], tip: [0.62, 0.62, 0.36], lean: 0.3, wid: 0.08 }), grassMat, null, false]], d: 500 }], marshI);
  const mgV = [mangroveGeo(51, false), mangroveGeo(53, false), mangroveGeo(57, false)], mgF = [mangroveGeo(51, true), mangroveGeo(53, true), mangroveGeo(57, true)];
  mgV.forEach((g, i) => F('mangrove' + i, [{ parts: [[g.wood, woodMat, null, true], [g.leaves, mgMat, mgDepth, true]], d: 110 }, { parts: [[mgF[i].wood, woodMat, null, false], [mgF[i].leaves, mgMat, null, false]], d: 1600 }], mgI[i]));
  const rk = [[rockGeo(61, 2), rockGeo(61, 0)], [rockGeo(67, 2), rockGeo(67, 0)]];
  rk.forEach(([n, f], i) => F('rock' + i, [{ parts: [[n, rockMat, null, true]], d: 140 }, { parts: [[f, rockMat, null, false]], d: 2000 }], rockI[i]));
  F('hedge', [{ parts: [[hedgeG, hedgeMat, null, true]], d: 220 }], hedgeI);

  const update = (cam, force) => { for (const f of fields) f.update(cam.x, cam.z, force); };
  update({ x: 280, z: 30 }, true);
  return { meshes: out, fields, stats, update: (cam) => update(cam, false), tris: () => { let t = 0; for (const f of fields) f.tiers.forEach((tr, ti) => { for (const im of tr.ims) t += (im.geometry.index ? im.geometry.index.count / 3 : 0) * (f.counts ? f.counts[ti] : 0); }); return t; } };
}
