// r6.4 b_tower2 霓港 tower crowns & roof plant (megatower tops, near) + cheap crown silhouettes on the far impostors.
//  * crownKind(seed): one choice per parcel seed shared by the near megatower and its far impostor, so the crown does not change
//    when a chunk streams in (heli / mast / bill / screen / spire).
//  * near (arch.js megatower, parcel frame, street facade at +x): roof plant deck (parapet, machine room with louvre doors + caged
//    ladder + roof rail, cooling-tower bank with fan stacks, water tank on braced legs, pipe runs on sleepers, condenser grid),
//    a stepped fin-screen crown (退台轮廓), a rooftop billboard on a steel lattice with catwalk + lamp arms, mast ladder / rest
//    platforms / guy wires, aviation lights (red steady on corners, white strobe on the highest point).
//  * LOD: masses go to 'vcol', small parts (louvres, rungs, rails, fan blades, sleepers, braces) to 'vcolD' which bldglayer.js
//    hides beyond DETAIL_R; far impostors get a handful of boxes + 'neon' light points per tower. No new materials / programs:
//    everything is vertex-coloured into the existing 'vcol' / 'neon' buckets.
import * as THREE from 'three';
import { box, polyCap, prismWalls } from '../../geo.js';
import { rng, rand, randi, pick, mulberry } from '../../util.js';
import { kg, beam, tube, put, NEONC, DARK, STEEL } from './kit.js';

export const RED = [1, 0.09, 0.06], STROBE = [1, 0.97, 0.9];
const LSTEEL = [0.55, 0.57, 0.6], YEL = [0.9, 0.7, 0.12], GRATE = [0.3, 0.31, 0.32];
const PLANT = [[0.62, 0.64, 0.63], [0.46, 0.53, 0.5], [0.7, 0.68, 0.62], [0.38, 0.42, 0.47]];

// deterministic crown choice per parcel seed (independent of the generator rng stream)
export function crownKind(seed) {
  const h = (Math.imul(seed >>> 0, 2654435761) >>> 0) / 4294967296;
  return h < 0.32 ? 'heli' : h < 0.56 ? 'mast' : h < 0.75 ? 'bill' : h < 0.88 ? 'screen' : 'spire';
}

// approximate top-tier half extents of the megatower built on a parcel (pw = p.d along the facing, pd = p.w; 3–5 m setbacks)
// -> [tx, tz, worst-case min]; the near tower and the far impostor both gate the helipad on the worst case so they agree
export function topEst(d, w, tall) { const nT = tall > 150 ? 4 : 3; const a = Math.min(d - 7, 46) / 2, b = Math.min(w - 7, 46) / 2; return [a - (nT - 1) * 4, b - (nT - 1) * 4, Math.min(a, b) - (nT - 1) * 5]; }
export const HELI_MIN = 6.5;

// r6.4 b_tower3: the parcel whose near geometry is being generated (stream.js sets it around genParcel), so crown pieces whose
// size / content must match the far impostor can be derived from the parcel seed instead of the generator rng stream.
let CP = null;
export function setCrownParcel(p) { CP = p || null; }
export const getCrownParcel = () => CP; // fix_pt8 #1 (stream.js ParcelTask context swap)
const hs = (s, k) => { let h = ((s >>> 0) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// smallest possible top-tier half extents (all setbacks 5 m) in the parcel frame [x (facing), z]; the near top is never smaller
export function topMin(d, w, tall) { const nT = tall > 150 ? 4 : 3; return [Math.min(d - 7, 46) / 2 - (nT - 1) * 5, Math.min(w - 7, 46) / 2 - (nT - 1) * 5]; }
// stepped fin-screen crown heights / inset from the seed (near + far agree)
export function screenSpec(seed) { return { h1: 5 + 3 * hs(seed, 11), h2: 4 + 3 * hs(seed, 12), ins: 2.5 + hs(seed, 13) }; }
// rooftop billboard placement from the seed + worst-case top: face x (from the centre), width, panel height, bottom height,
// frame depth, design / colours. Sized on the worst-case top so the near billboard (on the real top) and the far one are equal.
export function billSpec(seed, ax, az) {
  const bw = Math.min(34, Math.max(6, 2 * az - 2)), ph = Math.min(12, Math.max(7, bw * 0.38));
  return { seed, xf: Math.max(1.5, ax - 1.2), dep: Math.min(4.5, Math.max(2.4, ax * 0.6)), bw, ph, yb: 3 + 2 * hs(seed, 3), st: [[0.2, 0.21, 0.23], [0.42, 0.44, 0.46], [0.55, 0.12, 0.1]][Math.floor(hs(seed, 4) * 3)] };
}
// atlas cell planes (the hanging light-box sign atlas in dress.js: 4x4 cells, 'signface' material) — same layout, no new texture
const SC = 4, CELLG = [];
function cellPlane(k) {
  if (CELLG[k]) return CELLG[k];
  const g = new THREE.PlaneGeometry(1, 1); const u0 = (k % SC) / SC, v0 = 1 - (Math.floor(k / SC) + 1) / SC, dd = 1 / SC;
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * dd, v0 + uv.getY(i) * dd);
  return (CELLG[k] = g);
}
// billboard face content (local frame: face plane x = const, spans z0..z1 / yb..yt, viewed from +x). Five seeded layouts so the
// rooftop boards no longer all show the same hero block: 0 hero block + type bars, 1 big glyph row (atlas cells), 2 vertical glyph
// column + colour bands, 3 video-wall mosaic, 4 stepped two-tone split + round logo. D = { field, glyph, disc } draw callbacks.
// coarse = far impostor (bigger mosaic tiles).
export function billFace(D, z0, z1, yb, yt, seed, coarse = false) {
  const R = mulberry((seed >>> 0) * 7 + 11); const ri = (a, b) => a + Math.floor(R() * (b - a + 1)); const rf = (a, b) => a + R() * (b - a);
  const i1 = ri(0, NEONC.length - 1), c1 = NEONC[i1], c2 = NEONC[(i1 + ri(1, NEONC.length - 1)) % NEONC.length]; const des = Math.floor(hs(seed, 21) * 5);
  const L = (c, k, o = 0) => c.map((q) => q * k + o); const WH = [0.95, 0.95, 0.9]; const bw = z1 - z0, ph = yt - yb, m = 0.35; const zc = (z0 + z1) / 2;
  if (des === 0) { // hero colour block + type bars
    D.field(z0 + m, z1 - m, yb + m, yt - m, L(c2, 0.16, 0.02));
    const split = z0 + bw * rf(0.32, 0.45); const lhs = R() < 0.5; const [ha, hb] = lhs ? [z0 + m, split] : [z1 - (split - z0), z1 - m];
    D.field(ha, hb, yb + m, yt - m, L(c1, 0.55), 0.01); D.field(ha + 0.6, hb - 0.6, yb + ph * 0.25, yb + ph * 0.75, L(c1, 0.9, 0.08), 0.02);
    const ta = lhs ? hb + 1.0 : z0 + 1.0, tb = lhs ? z1 - 1.0 : ha - 1.0; const nl = ri(2, 4);
    for (let k = 0; k < nl; k++) { const yy = yt - m - 1.0 - k * (ph - 2 * m - 1.5) / nl; const hh = k === 0 ? Math.min(1.6, ph * 0.16) : 0.55; const len = (tb - ta) * (k === 0 ? rf(0.75, 1) : rf(0.4, 0.85));
      D.field(ta, ta + len, yy - hh, yy, k === 0 ? WH : L(c1, 0.7, 0.15), 0.01); }
  } else if (des === 1) { // big glyph row
    D.field(z0 + m, z1 - m, yb + m, yt - m, L(c1, 0.12, 0.02));
    const n = Math.max(2, Math.min(4, Math.round(bw / (ph * 0.85)))); const cs = Math.min(ph * 0.6, (bw - 2) / n * 0.92); const gap = (bw - n * cs) / (n + 1); const ya = yb + ph * 0.3;
    for (let k = 0; k < n; k++) { const za = z0 + gap + k * (cs + gap); D.glyph(za, za + cs, ya, ya + cs, L(k % 2 ? c2 : c1, 0.75, 0.12), ri(0, 15)); }
    D.field(z0 + bw * 0.15, z1 - bw * 0.15, yb + ph * 0.1, yb + ph * 0.2, L(c2, 0.85, 0.08), 0.01);
  } else if (des === 2) { // vertical glyph column + colour bands
    const lhs = R() < 0.5; const cw = Math.min(ph * 0.45, bw * 0.3); const [ga, gb] = lhs ? [z0 + m, z0 + m + cw] : [z1 - m - cw, z1 - m]; const [ba, bb] = lhs ? [gb + 0.3, z1 - m] : [z0 + m, ga - 0.3];
    for (let k = 0; k < 2; k++) D.glyph(ga, gb, yb + m + k * (ph - 2 * m) / 2, yb + m + (k + 1) * (ph - 2 * m) / 2 - 0.1, L(c1, 0.8, 0.12), ri(0, 15));
    for (let k = 0; k < 3; k++) { const t = k / 2; D.field(ba, bb, yb + m + k * (ph - 2 * m) / 3, yb + m + (k + 1) * (ph - 2 * m) / 3, c1.map((q, i) => (q * (1 - t) + c2[i] * t) * (0.3 + 0.2 * k) + 0.02)); }
    D.field(ba + 1, ba + (bb - ba) * rf(0.5, 0.85), yb + ph * 0.55, yb + ph * 0.55 + Math.min(1.5, ph * 0.14), WH, 0.01);
    D.field(ba + 1, ba + (bb - ba) * rf(0.3, 0.55), yb + ph * 0.36, yb + ph * 0.36 + 0.55, L(c2, 0.9, 0.1), 0.01);
  } else if (des === 3) { // video-wall mosaic: a soft blob picture in tiles + caption strip
    const ts = coarse ? 3.2 : 1.6; const nx = Math.max(2, Math.round((bw - 2 * m) / ts)), ny = Math.max(2, Math.round((ph - 2 * m) / ts)); const tw = (bw - 2 * m) / nx, th = (ph - 2 * m) / ny;
    const bx = rf(0.25, 0.75), by = rf(0.35, 0.7), br = rf(0.25, 0.45);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const u = (i + 0.5) / nx, w = (j + 0.5) / ny; const dd = Math.hypot((u - bx) * bw / ph, w - by) / br; const t = Math.min(1, dd);
      const k = (1 - t) * 0.85 + 0.12 + rf(-0.06, 0.06); const za = z0 + m + i * tw, ya = yb + m + j * th;
      D.field(za + 0.04, za + tw - 0.04, ya + 0.04, ya + th - 0.04, c1.map((q, ii) => (q * (1 - t) + c2[ii] * t) * k + 0.015)); }
    D.field(z0 + m, z1 - m, yb + m, yb + m + Math.min(1.2, th), L(c2, 0.2, 0.02), 0.01); D.field(z0 + 1.2, z0 + bw * rf(0.35, 0.6), yb + m + 0.3, yb + m + Math.min(0.9, th - 0.2), WH, 0.02);
  } else { // stepped two-tone split + round logo + small glyphs
    const n = ri(4, 6); const sw = (bw - 2 * m) / n;
    for (let k = 0; k < n; k++) { const za = z0 + m + k * sw; const hy = (ph - 2 * m) * (0.25 + 0.6 * k / (n - 1)); D.field(za, za + sw, yb + m, yb + m + hy, L(c1, 0.5, 0.02)); D.field(za, za + sw, yb + m + hy, yt - m, L(c2, 0.4, 0.02)); }
    const r = Math.min(ph * 0.24, bw * 0.12); const lz = R() < 0.5 ? z0 + m + r + 1 : z1 - m - r - 1, ly = yt - m - r - 0.6;
    D.disc(lz, ly, r, WH); D.disc(lz, ly, r * 0.62, L(c1, 0.9, 0.08), 0.02);
    const gz = lz < zc ? lz + r + 1 : lz - r - 1 - 2 * Math.min(2.4, r * 1.2); const gs = Math.min(2.4, r * 1.2);
    for (let k = 0; k < 2; k++) D.glyph(gz + k * gs, gz + (k + 1) * gs - 0.1, ly - gs / 2, ly + gs / 2, L(WH, 0.85), ri(0, 15));
  }
  const fc = des === 1 || des === 4 ? c2 : c1; // frame line
  for (const [za, zb, ya, yc] of [[z0, z1, yt - 0.12, yt], [z0, z1, yb, yb + 0.12], [z0, z0 + 0.12, yb, yt], [z1 - 0.12, z1, yb, yt]]) D.field(za, zb, ya, yc, fc, 0.03);
}

// ------------------------------------------------------------------ small kit ----
// vertical ladder at (x, z) from y0 to y1, rungs along (sx, sz); cage hoops above 2.4 m when cage
export function ladder(d, x, z, y0, y1, sx, sz, cage = false, ox = 0, oz = 0) {
  const hw = 0.23; const G = kg();
  for (const s of [-1, 1]) beam(d, [x + sx * hw * s, y0, z + sz * hw * s], [x + sx * hw * s, y1 + 1.0, z + sz * hw * s], 0.05, LSTEEL, null, G.tube4);
  const step = y1 - y0 > 12 ? 0.45 : 0.32;
  for (let y = y0 + 0.3; y < y1 + 0.1; y += step) beam(d, [x - sx * hw, y, z - sz * hw], [x + sx * hw, y, z + sz * hw], 0.03, LSTEEL);
  if (cage && y1 - y0 > 3) for (let y = y0 + 2.4; y < y1 + 0.9; y += 1.0) { // U hoops (three straight bars) out from the wall along (ox, oz)
    const a = [x - sx * 0.36, y, z - sz * 0.36], b = [x + sx * 0.36, y, z + sz * 0.36];
    const a2 = [a[0] + ox * 0.72, y, a[2] + oz * 0.72], b2 = [b[0] + ox * 0.72, y, b[2] + oz * 0.72];
    beam(d, a, a2, 0.04, LSTEEL); beam(d, b, b2, 0.04, LSTEEL); beam(d, a2, b2, 0.04, LSTEEL);
  }
}
// guard rail around a rectangle at y (posts + top + knee rail)
export function railRect(d, x0, z0, x1, z1, y, h = 1.05, col = YEL) {
  const C = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 1.8));
    for (const yy of [h, h * 0.5]) beam(d, [a[0], y + yy, a[1]], [b[0], y + yy, b[1]], 0.05, col);
    for (let k = 0; k < n; k++) { const t = k / n; const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t; beam(d, [px, y, pz], [px, y + h, pz], 0.05, col); } }
}
// cooling tower cell: casing, louvre bands, fan stack with dark opening, fan blades
function coolingTower(v, d, x, y, z, w, h, col) {
  const G = kg(); const hw = w / 2; const slat = col.map((q) => q * 0.55);
  box(v, x - hw, y, z - hw, x + hw, y + h, z + hw, {}, col);
  for (let yy = y + 0.35; yy < y + h * 0.62; yy += 0.3) {
    put(d, G.box, x, yy, z + hw + 0.05, w * 0.9, 0.07, 0.1, slat); put(d, G.box, x, yy, z - hw - 0.05, w * 0.9, 0.07, 0.1, slat);
    put(d, G.box, x + hw + 0.05, yy, z, 0.1, 0.07, w * 0.9, slat); put(d, G.box, x - hw - 0.05, yy, z, 0.1, 0.07, w * 0.9, slat); }
  put(v, G.cyl12, x, y + h + 0.55, z, hw * 0.86, 1.1, hw * 0.86, col.map((q) => q * 0.92));
  put(v, G.cyl12, x, y + h + 1.11, z, hw * 0.78, 0.02, hw * 0.78, [0.06, 0.065, 0.07]);
  put(d, G.cyl8, x, y + h + 1.0, z, 0.22, 0.2, 0.22, DARK); const r0 = rand(0, 3);
  for (let k = 0; k < 3; k++) put(d, G.box, x, y + h + 1.02, z, hw * 1.45, 0.03, 0.28, [0.2, 0.21, 0.22], r0 + k * Math.PI / 3);
  // fan guard ring
  for (let k = 0; k < 4; k++) put(d, G.box, x, y + h + 1.16, z, hw * 1.6, 0.03, 0.04, LSTEEL, k * Math.PI / 4);
}
// water tank on four braced legs + hoops + conical lid + ladder
function waterTank(v, d, x, y, z, r, th, legH) {
  const G = kg(); const col = pick([[0.78, 0.79, 0.8], [0.52, 0.4, 0.3], [0.6, 0.66, 0.62]]);
  const L = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + a * r * 0.68, z + b * r * 0.68]);
  for (const [lx, lz] of L) beam(v, [lx, y, lz], [lx, y + legH, lz], 0.18, DARK);
  for (let i = 0; i < 4; i++) { const a = L[i], b = L[(i + 1) % 4]; beam(d, [a[0], y + 0.2, a[1]], [b[0], y + legH - 0.1, b[1]], 0.06, DARK); beam(d, [b[0], y + 0.2, b[1]], [a[0], y + legH - 0.1, a[1]], 0.06, DARK); }
  put(v, G.box, x, y + legH, z, r * 1.6, 0.18, r * 1.6, DARK);
  put(v, G.cyl12, x, y + legH + th / 2 + 0.1, z, r, th, r, col);
  for (let k = 1; k < 4; k++) put(d, G.cyl12, x, y + legH + 0.1 + (th * k) / 4, z, r + 0.03, 0.08, r + 0.03, DARK);
  if (!_cone) { _cone = new THREE.ConeGeometry(1, 1, 12, 1); _cone.deleteAttribute('uv'); _cone.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(_cone.attributes.position.count * 2), 2)); }
  put(v, _cone, x, y + legH + th + 0.1 + 0.4, z, r * 1.05, 0.8, r * 1.05, col.map((q) => q * 0.7));
  ladder(d, x + r + 0.08, z, y, y + legH + th, 0, 1);
}
let _cone = null;
// pipe run along a polyline at height y on sleepers (2–3 parallel pipes), vertical drops at both ends
function pipeRun(v, d, pts, y, n, col, yr) {
  const G = kg();
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; const sx = -uz, sz = ux;
    for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 0.42; tube(v, [a[0] + sx * o - ux * 0.2, y, a[1] + sz * o - uz * 0.2], [b[0] + sx * o + ux * 0.2, y, b[1] + sz * o + uz * 0.2], k === 0 ? 0.17 : 0.12, k === 1 ? [0.7, 0.55, 0.15] : col, G.tube6); }
    for (let t = 1; t < L; t += 3) { const px = a[0] + ux * t, pz = a[1] + uz * t; beam(d, [px - sx * n * 0.3, y - 0.25, pz - sz * n * 0.3], [px + sx * n * 0.3, y - 0.25, pz + sz * n * 0.3], 0.14, DARK, 0.14);
      put(d, G.box, px, (yr + y - 0.32) / 2, pz, 0.12, y - 0.32 - yr, 0.12, DARK); } }
}

// ------------------------------------------------------------ roof plant deck ----
// vertical pipe shaft (竖向管井): louvred riser casing with an access door, a cap slab, 2–3 pipes coming out of the top and
// bending over (one gooseneck vent). Returns the anchor where the pipes leave the shaft.
function pipeShaft(v, d, x, y, z, w, dd, col) {
  const G = kg(); const h = rand(2.2, 2.9); const dk = col.map((q) => q * 0.8);
  box(v, x - w / 2, y, z - dd / 2, x + w / 2, y + h, z + dd / 2, {}, dk);
  box(v, x - w / 2 - 0.08, y + h, z - dd / 2 - 0.08, x + w / 2 + 0.08, y + h + 0.14, z + dd / 2 + 0.08, {}, [0.72, 0.71, 0.68]);
  box(v, x + w / 2, y, z - 0.38, x + w / 2 + 0.04, y + 1.9, z + 0.38, {}, [0.3, 0.32, 0.34]); // access door (+x)
  for (let yy = y + h - 0.85; yy < y + h - 0.15; yy += 0.17) put(d, G.box, x - w / 2 - 0.03, yy, z, 0.05, 0.05, dd * 0.75, [0.2, 0.21, 0.22]); // louvre (-x)
  const n = randi(2, 3); const pc = [[0.62, 0.64, 0.66], [0.7, 0.55, 0.15], [0.42, 0.48, 0.45]];
  for (let k = 0; k < n; k++) { const zz = z + (k - (n - 1) / 2) * Math.min(0.34, dd / (n + 0.5)); const r = k === 0 ? 0.13 : 0.09;
    tube(v, [x - w * 0.2, y + h + 0.1, zz], [x - w * 0.2, y + h + 0.75 + k * 0.12, zz], r, pc[k], G.tube6);
    tube(v, [x - w * 0.2 - r, y + h + 0.75 + k * 0.12, zz], [x + w / 2 + 0.25, y + h + 0.75 + k * 0.12, zz], r, pc[k], G.tube6); }
  tube(v, [x + w * 0.25, y + h + 0.1, z + dd * 0.3], [x + w * 0.25, y + h + 1.3, z + dd * 0.3], 0.07, LSTEEL, G.tube6); // gooseneck vent
  put(v, G.cyl8, x + w * 0.25, y + h + 1.36, z + dd * 0.3, 0.14, 0.12, 0.14, DARK);
  return [x + w / 2 + 0.25, z];
}
// fills the top roof [X0..X1]x[Z0..Z1] at y with plant, avoiding the excl rects ([a0, b0, a1, b1]); parapet included.
// r6.4 b_tower3: narrow tops (< 16 m, typical 11–15 m) get a compact set that always fits — one small cooling tower cell, a
// vertical pipe shaft and a single water tank (placed by an exhaustive scan after the random tries, shrinking if needed),
// plus a stair hut / condensers only where room is left. Wide tops keep the full set and use the same scan as a fallback.
export function plantDeck(W, X0, Z0, X1, Z1, y, excl = [], opt = {}) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; const v = W.b('vcol', cx, cz), d = W.b('vcolD', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  const conc = [0.6, 0.6, 0.58], cap = [0.75, 0.74, 0.71]; const t = 0.35, ph = 1.2;
  for (const [a0, b0, a1, b1] of [[X0, Z0, X1, Z0 + t], [X0, Z1 - t, X1, Z1], [X0, Z0, X0 + t, Z1], [X1 - t, Z0, X1, Z1]]) { box(v, a0, y, b0, a1, y + ph, b1, {}, conc); box(v, a0 - 0.06, y + ph, b0 - 0.06, a1 + 0.06, y + ph + 0.12, b1 + 0.06, {}, cap); }
  // aviation lights on the parapet corners
  for (const [px, pz] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) put(nb, G.ball, px + Math.sign(cx - px) * 0.3, y + ph + 0.35, pz + Math.sign(cz - pz) * 0.3, 0.2, 0.2, 0.2, RED);
  if (opt.parapetOnly) return;
  const compact = Math.min(X1 - X0, Z1 - Z0) < 16; const mg = compact ? 0.55 : 0.8, pad = compact ? 0.15 : 0.5;
  const used = excl.slice();
  if (compact) for (const [px, pz] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) used.push([Math.min(px, px + Math.sign(cx - px) * 1.9), Math.min(pz, pz + Math.sign(cz - pz) * 1.9), Math.max(px, px + Math.sign(cx - px) * 1.9), Math.max(pz, pz + Math.sign(cz - pz) * 1.9)]); // guy-wire anchors / corner lights
  const free = (a0, b0, a1, b1) => a0 > X0 + mg && a1 < X1 - mg && b0 > Z0 + mg && b1 < Z1 - mg && !used.some((u) => a0 < u[2] && a1 > u[0] && b0 < u[3] && b1 > u[1]);
  const take = (a, c, w, dd) => { used.push([a - pad * 0.6, c - pad * 0.6, a + w + pad * 0.6, c + dd + pad * 0.6]); return [a, c]; };
  const place = (w, dd, pref, scan = false) => {
    for (let i = 0; i < 16; i++) { const a = pref && i < 6 ? pref[0] + rand(-1.5, 1.5) : rand(X0 + 1, X1 - 1 - w), c = pref && i < 6 ? pref[1] + rand(-1.5, 1.5) : rand(Z0 + 1, Z1 - 1 - dd);
      if (free(a - pad, c - pad, a + w + pad, c + dd + pad)) return take(a, c, w, dd); }
    if (!scan) return null; // exhaustive 0.4 m scan from a random start, so a piece that fits anywhere is always placed
    const nx = Math.max(1, Math.floor((X1 - X0 - w) / 0.4)), nz = Math.max(1, Math.floor((Z1 - Z0 - dd) / 0.4)); const o = randi(0, nx * nz - 1);
    for (let k = 0; k < nx * nz; k++) { const q = (k + o) % (nx * nz); const a = X0 + (q % nx) * 0.4, c = Z0 + Math.floor(q / nx) * 0.4;
      if (free(a - pad, c - pad, a + w + pad, c + dd + pad)) return take(a, c, w, dd); }
    return null; };
  // required pieces on narrow tops: shrink until they fit
  const need = (w, dd, f) => { for (const k of [1, 0.85, 0.7, 0.58, 0.5]) { const s = place(w * k, dd * k, null, true); if (s) return f(s, k); } return null; };
  const pc = pick(PLANT); const anchors = [];
  if (compact) {
    const cw0 = rand(1.8, 2.2); need(cw0 + 0.3, cw0 + 0.3, (s, k) => { const cw = cw0 * k, ch = rand(2.2, 2.6) * k; // single small cooling tower cell on a base
      const x = s[0] + 0.15 + cw / 2, z = s[1] + 0.15 + cw / 2; box(v, s[0], y, s[1], s[0] + cw + 0.3, y + 0.3, s[1] + cw + 0.3, {}, DARK);
      coolingTower(v, d, x, y + 0.3, z, cw, ch, pc); ladder(d, s[0] - 0.12, z, y, y + ch + 0.3, 0, 1, false); anchors.push([x, z]); });
    need(1.3, 1.1, (s, k) => anchors.push(pipeShaft(v, d, s[0] + 0.65 * k, y, s[1] + 0.55 * k, 1.3 * k, 1.1 * k, pc)));
    const r = rand(0.8, 1.0); need(r * 2.2, r * 2.2, (s, k) => { const rr = r * k; waterTank(v, d, s[0] + rr * 1.1, y, s[1] + rr * 1.1, rr, rand(1.8, 2.4), rand(1.2, 1.8)); anchors.push([s[0] + rr * 1.1, s[1] + rr * 1.1]); });
    { const w = 3.0, dd = 2.6; const s = place(w, dd, null, true); // stair hut (roof access) where room is left
      if (s) { const [a, c] = s; const h = rand(2.8, 3.2); box(v, a, y, c, a + w, y + h, c + dd, {}, conc.map((q) => q * 0.95)); box(v, a - 0.12, y + h, c - 0.12, a + w + 0.12, y + h + 0.2, c + dd + 0.12, {}, cap);
        box(v, a + w, y, c + dd / 2 - 0.5, a + w + 0.06, y + 2.2, c + dd / 2 + 0.5, {}, [0.3, 0.32, 0.34]); put(nb, G.box, a + w + 0.1, y + 2.45, c + dd / 2, 0.08, 0.12, 0.3, [0.9, 0.85, 0.65]);
        put(d, G.box, a + w * 0.5, y + h + 0.5, c + dd * 0.5, 0.7, 0.6, 0.7, [0.55, 0.56, 0.57]); } }
  } else {
  // machine room (back half of the roof), louvre doors, caged ladder to its roof, roof rail + aviation light
  { const w = Math.min(rand(6, 10), (X1 - X0) * 0.4), dd = Math.min(rand(5, 8), (Z1 - Z0) * 0.4); const s = place(w, dd, [X0 + 1.4, cz - dd / 2]);
    if (s) { const h = rand(3.4, 4.6); const [a, c] = s; box(v, a, y, c, a + w, y + h, c + dd, {}, conc.map((q) => q * 0.95)); box(v, a - 0.15, y + h, c - 0.15, a + w + 0.15, y + h + 0.25, c + dd + 0.15, {}, cap);
      for (let k = 0; k < 2; k++) { const zz = c + dd * (0.3 + k * 0.4); // louvre doors on the +x face
        box(v, a + w, y, zz - 0.8, a + w + 0.06, y + 2.4, zz + 0.8, {}, [0.3, 0.32, 0.34]); for (let yy = y + 0.3; yy < y + 2.3; yy += 0.22) put(d, G.box, a + w + 0.1, yy, zz, 0.06, 0.06, 1.5, [0.2, 0.21, 0.22]);
        put(nb, G.box, a + w + 0.1, y + 2.7, zz, 0.08, 0.14, 0.4, [0.9, 0.85, 0.65]); }
      ladder(d, a + w * 0.15, c + dd + 0.18, y, y + h + 0.25, 1, 0, true, 0, 1);
      railRect(d, a + 0.2, c + 0.2, a + w - 0.2, c + dd - 0.2, y + h + 0.25);
      for (let k = 0; k < randi(2, 4); k++) put(d, G.box, a + rand(1, w - 1), y + h + 0.6, c + rand(1, dd - 1), 0.9, 0.7, 0.9, [0.55, 0.56, 0.57]); // roof fans
      put(nb, G.ball, a + w - 0.4, y + h + 1.6, c + 0.4, 0.2, 0.2, 0.2, RED); beam(d, [a + w - 0.4, y + h + 0.25, c + 0.4], [a + w - 0.4, y + h + 1.4, c + 0.4], 0.06, LSTEEL);
      anchors.push([a + w, c + dd / 2]); } }
  // cooling-tower bank (falls back to fewer cells / the scan so it is never dropped)
  { let n = randi(2, 3); const cw = rand(2.8, 3.6), ch = rand(2.6, 3.4); let s = place(n * (cw + 0.4), cw + 0.6); while (!s && n > 1) { n--; s = place(n * (cw + 0.4), cw + 0.6, null, true); }
    if (s) { for (let i = 0; i < n; i++) coolingTower(v, d, s[0] + cw / 2 + i * (cw + 0.4), y + 0.3, s[1] + cw / 2 + 0.3, cw, ch, pc);
      box(v, s[0] - 0.2, y, s[1], s[0] + n * (cw + 0.4), y + 0.3, s[1] + cw + 0.6, {}, DARK); // steel base frame
      ladder(d, s[0] - 0.15, s[1] + cw / 2, y, y + ch + 0.3, 0, 1, false);
      anchors.push([s[0] + n * (cw + 0.4) / 2, s[1] + cw + 0.6]); } }
  // water tank
  if (opt.tank !== false && rng() < 0.75) { const r = rand(1.4, 2.0); const s = place(r * 2.2, r * 2.2, null, true); if (s) { waterTank(v, d, s[0] + r * 1.1, y, s[1] + r * 1.1, r, rand(2.4, 3.6), rand(1.8, 2.8)); anchors.push([s[0] + r * 1.1, s[1] + r * 1.1]); } }
  }
  // pipe runs between the plant pieces (L-shaped, on sleepers), staying on the roof
  for (let i = 0; i + 1 < anchors.length; i++) { const a = anchors[i], b = anchors[i + 1]; const mid = [b[0], a[1]];
    const cl = (p) => [Math.min(X1 - 1.2, Math.max(X0 + 1.2, p[0])), Math.min(Z1 - 1.2, Math.max(Z0 + 1.2, p[1]))];
    pipeRun(v, d, [cl(a), cl(mid), cl(b)], y + 0.7, compact ? 2 : randi(2, 3), pick([[0.62, 0.64, 0.66], [0.42, 0.48, 0.45]]), y); }
  // condenser grid
  { const nc = compact ? randi(1, 3) : randi(2, 6); const s = place(Math.min(nc, 3) * 1.5, Math.ceil(nc / 3) * 1.5);
    if (s) for (let k = 0; k < nc; k++) { const x = s[0] + 0.7 + (k % 3) * 1.5, z = s[1] + 0.7 + Math.floor(k / 3) * 1.5; put(v, G.box, x, y + 0.55, z, 1.3, 1.1, 1.3, [0.66, 0.67, 0.68]); put(d, G.cyl8, x, y + 1.12, z, 0.48, 0.04, 0.48, DARK); } }
  return { compact, n: anchors.length };
}

// --------------------------------------------------------- stepped fin crown ----
// 退台轮廓: fin screen on the roof edge (h1), an inset chamfered frame above it (h2), neon reveal at both tops
export function crownScreen(W, X0, Z0, X1, Z1, y, col, glow) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; const v = W.b('vcol', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  let h1 = rand(5, 8), h2 = rand(4, 7), ins = rand(2.5, 3.5); if (CP) ({ h1, h2, ins } = screenSpec(CP.seed)); // b_tower3: seeded (= far)
  const ring = (a0, b0, a1, b1, yb, yt, finStep, finD) => {
    for (const [px, pz] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) box(v, px - 0.45, yb, pz - 0.45, px + 0.45, yt + 0.4, pz + 0.45, {}, col);
    for (const [p0, p1] of [[[a0, b0], [a1, b0]], [[a1, b0], [a1, b1]], [[a1, b1], [a0, b1]], [[a0, b1], [a0, b0]]]) {
      beam(v, [p0[0], yt + 0.2, p0[1]], [p1[0], yt + 0.2, p1[1]], 0.5, col, 0.5);
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); const n = Math.max(2, Math.round(L / finStep));
      const ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L; const ox = uz, oz = -ux; // outward for this CCW loop? use both signs safely
      for (let k = 1; k < n; k++) { const px = p0[0] + (p1[0] - p0[0]) * k / n, pz = p0[1] + (p1[1] - p0[1]) * k / n;
        put(v, G.box, px, (yb + yt) / 2, pz, Math.abs(ox) * finD + Math.abs(ux) * 0.16 + 0.01, yt - yb, Math.abs(oz) * finD + Math.abs(uz) * 0.16 + 0.01, col); }
      const q0 = [p0[0], p1[0]], q1 = [p0[1], p1[1]]; box(nb, Math.min(...q0) - 0.28, yt + 0.45, Math.min(...q1) - 0.28, Math.max(...q0) + 0.28, yt + 0.53, Math.max(...q1) + 0.28, {}, glow);
    }
  };
  ring(X0 + 0.2, Z0 + 0.2, X1 - 0.2, Z1 - 0.2, y, y + h1, 1.6, 0.9);
  ring(X0 + ins, Z0 + ins, X1 - ins, Z1 - ins, y + h1 + 0.6, y + h1 + h2, 2.4, 0.6);
  // a cross-braced ring beam tying the inner frame to the outer one at the corners
  for (const [a, b] of [[[X0 + 0.2, Z0 + 0.2], [X0 + ins, Z0 + ins]], [[X1 - 0.2, Z0 + 0.2], [X1 - ins, Z0 + ins]], [[X1 - 0.2, Z1 - 0.2], [X1 - ins, Z1 - ins]], [[X0 + 0.2, Z1 - 0.2], [X0 + ins, Z1 - ins]]])
    beam(v, [a[0], y + h1 + 0.4, a[1]], [b[0], y + h1 + 0.8, b[1]], 0.4, col);
  const top = y + h1 + h2 + 0.6;
  for (const [px, pz] of [[X0 + ins, Z0 + ins], [X1 - ins, Z0 + ins], [X1 - ins, Z1 - ins], [X0 + ins, Z1 - ins]]) put(nb, G.ball, px, top + 0.3, pz, 0.22, 0.22, 0.22, RED);
  return top;
}

// -------------------------------------------------------- rooftop billboard ----
// lattice-mounted billboard facing the street (+x) on the top roof: back columns + rakers, dark backing, lit face with colour
// fields and type bars, catwalk + rail along the bottom, lamp arms, aviation light on the top corners
export function roofBillboard(W, X0, Z0, X1, Z1, y) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; const v = W.b('vcol', cx, cz), d = W.b('vcolD', cx, cz), nb = W.b('neon', cx, cz), sb = W.b('signface', cx, cz); const G = kg();
  // b_tower3: size / position / content from the parcel seed on the worst-case top (= the far impostor's billboard), clamped to
  // the real roof; a few dummy rng draws keep the tower's rng sequence close to before
  void rand(3, 5); void pick([0, 1, 2]); void pick(NEONC); void pick(NEONC); void rand(0.32, 0.45); void rng(); void randi(2, 4);
  const [ax, az] = CP ? topMin(CP.d, CP.w, CP.h) : [(X1 - X0) / 2, (Z1 - Z0) / 2]; const B = billSpec(CP ? CP.seed : randi(1, 1e9), Math.min(ax, (X1 - X0) / 2), Math.min(az, (Z1 - Z0) / 2));
  const bw = Math.min(B.bw, Z1 - Z0 - 2), ph = B.ph; const xf = Math.min(cx + B.xf, X1 - 1.2), xb = xf - Math.min(B.dep, (X1 - X0) * 0.45);
  const z0 = cz - bw / 2, z1 = cz + bw / 2; const yb = y + B.yb, yt = yb + ph; const st = B.st;
  const nC = Math.max(3, Math.round(bw / 4.5));
  for (let i = 0; i <= nC; i++) { const z = z0 + (bw * i) / nC;
    beam(v, [xf - 0.5, y, z], [xf - 0.5, yt, z], 0.35, st); beam(v, [xb, y, z], [xb, yt - 1.5, z], 0.3, st); // front + back columns
    beam(d, [xb, y + 0.3, z], [xf - 0.5, yt - 0.5, z], 0.18, st); beam(d, [xb, yb, z], [xf - 0.5, yb, z], 0.2, st); // raker + strut
    put(v, G.box, xb, y + 0.15, z, 1.0, 0.3, 1.0, [0.4, 0.4, 0.41]); put(v, G.box, xf - 0.5, y + 0.15, z, 1.0, 0.3, 1.0, [0.4, 0.4, 0.41]); }
  for (let i = 0; i < nC; i++) { const za = z0 + (bw * i) / nC, zb = z0 + (bw * (i + 1)) / nC; // X braces in the back plane
    beam(d, [xb, y + 0.4, za], [xb, yt - 1.6, zb], 0.12, st); beam(d, [xb, y + 0.4, zb], [xb, yt - 1.6, za], 0.12, st); }
  box(v, xf - 0.4, yb, z0 - 0.3, xf, yt, z1 + 0.3, {}, [0.07, 0.07, 0.08]); // backing
  // lit face: seeded layout (neon fields + light-box atlas glyph cells)
  const F = xf + 0.03;
  billFace({
    field: (za, zb, ya, yc, col, dz = 0) => box(nb, F - 0.02 + dz, ya, Math.min(za, zb), F + 0.02 + dz, yc, Math.max(za, zb), {}, col),
    glyph: (za, zb, ya, yc, col, cell) => put(sb, cellPlane(cell), F + 0.06, (ya + yc) / 2, (za + zb) / 2, Math.abs(zb - za), yc - ya, 1, col, Math.PI / 2),
    disc: (zc, yc, r, col, dz = 0) => put(nb, G.ball, F + 0.03 + dz, yc, zc, 0.04, r, r, col),
  }, z0, z1, yb, yt, B.seed);
  // catwalk + rail + lamp arms
  box(v, xf, yb - 0.25, z0, xf + 1.2, yb - 0.1, z1, {}, GRATE);
  for (const yy of [yb + 0.45, yb + 0.95]) beam(d, [xf + 1.2, yy, z0], [xf + 1.2, yy, z1], 0.05, LSTEEL);
  for (let z = z0; z <= z1 + 0.01; z += 2) beam(d, [xf + 1.2, yb - 0.1, z], [xf + 1.2, yb + 0.95, z], 0.04, LSTEEL);
  for (let z = z0 + 2; z < z1 - 1; z += 4.5) { beam(d, [xf + 0.1, yb - 0.2, z], [xf + 2.3, yb + 0.5, z], 0.08, DARK); put(v, G.box, xf + 2.35, yb + 0.62, z, 0.45, 0.25, 0.7, DARK); put(nb, G.box, xf + 2.12, yb + 0.6, z, 0.05, 0.18, 0.55, [1, 0.92, 0.75]); }
  ladder(d, xf + 0.6, z0 - 0.5, y, yb - 0.1, 1, 0, true, 0, -1);
  for (const z of [z0, z1]) put(nb, G.ball, xf - 0.2, yt + 0.35, z, 0.22, 0.22, 0.22, RED);
  return [xb - 1, z0 - 1, Math.min(X1, xf + 2.6), z1 + 1];
}

// ---------------------------------------------------- mast extras (near) ----
// rest platforms with rails, a climbing ladder on one leg, guy wires to the roof corners, extra aviation lights (red steady at
// 1/3 + 2/3, white strobe on top of the whip)
export function mastExtras(W, cx, y0, cz, mh, r0, r1, T, H) {
  const v = W.b('vcol', cx, cz), d = W.b('vcolD', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  for (const t of [0.33, 0.66]) { const r = r0 + (r1 - r0) * t + 0.9; const yy = y0 + mh * t;
    box(v, cx - r, yy - 0.12, cz - r, cx + r, yy, cz + r, {}, GRATE); railRect(d, cx - r, cz - r, cx + r, cz + r, yy, 1.0, LSTEEL);
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(nb, G.ball, cx + sx * r, yy + 1.2, cz + sz * r, 0.16, 0.16, 0.16, RED); }
  // ladder up the +x face between the legs
  { const nn = 8; let prev = null; for (let i = 0; i <= nn; i++) { const t = i / nn; const r = r0 + (r1 - r0) * t; const p = [cx + r + 0.1, y0 + mh * t, cz]; if (prev) ladder(d, prev[0], prev[2], prev[1], p[1] - 0.6, 0, 1); prev = p; } }
  // guy wires from 0.6 height to the roof corners
  const ya = y0 + mh * 0.6; const ra = r0 + (r1 - r0) * 0.6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const gx = sx > 0 ? T.X1 - 1.5 : T.X0 + 1.5, gz = sz > 0 ? T.Z1 - 1.5 : T.Z0 + 1.5;
    tube(d, [cx + sx * ra, ya, cz + sz * ra], [gx, H + 1.2, gz], 0.025, DARK, G.tube4); put(v, G.box, gx, H + 0.6, gz, 0.8, 1.2, 0.8, [0.45, 0.45, 0.46]); }
  put(nb, G.ball, cx, y0 + mh + 10.8, cz, 0.34, 0.34, 0.34, STROBE);
}

// ---------------------------------------------------------- far crown ----
// cheap crown silhouette on a far impostor (world space through P(local a, local b) -> [x, z]); top = roof height, sx/sz = half
// extents of the top volume. A handful of prisms + neon light points.
export function farCrown(W, P, p, top, sx, sz) {
  const kind = crownKind(p.seed); const v = W.b('vcol', p.x, p.z), nb = W.b('neon', p.x, p.z);
  const ob = (b, a0, b0, a1, b1, y0, y1, col) => { const q = [P(a0, b1), P(a1, b1), P(a1, b0), P(a0, b0)]; prismWalls(b, q, y0, y1, null, col); polyCap(b, q, y1, {}, col); };
  const lt = (a, b, y, s, col) => ob(nb, a - s, b - s, a + s, b + s, y - s, y + s, col);
  const k = (p.seed >>> 4) % 97 / 97; const [ex0, ez0, emin] = topEst(p.d, p.w, p.h);
  // b_tower3: crowns sized on the near tower's top tier (expected setbacks, worst case for the billboard), not on the impostor's
  // wider upper box, so the crown does not shrink when the near chunk streams in
  const tx = Math.min(ex0, sx), tz = Math.min(ez0, sz), m = Math.min(tx, tz);
  for (const [a, b] of [[-tx, -tz], [tx, -tz], [tx, tz], [-tx, tz]]) lt(a - Math.sign(a) * 0.3, b - Math.sign(b) * 0.3, top + 1.55, 0.4, RED);
  if (kind === 'heli' && emin > HELI_MIN) { const r = Math.min(m - 0.5, 11); const y = top + 3.2; const oct = []; for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8 * Math.PI * 2; oct.push(P(Math.cos(t) * r, -Math.sin(t) * r)); }
    prismWalls(v, oct, y - 0.5, y, null, [0.3, 0.31, 0.32]); polyCap(v, oct, y, {}, [0.22, 0.23, 0.24]);
    for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8 * Math.PI * 2; lt(Math.cos(t) * r, -Math.sin(t) * r, y + 0.2, 0.45, [0.2, 1.0, 0.35]); }
    const hs2 = r * 0.3, mc = [0.92, 0.9, 0.82]; ob(v, -hs2, -hs2 * 0.8, -hs2 + 0.9, hs2 * 0.8, y, y + 0.06, mc); ob(v, hs2 - 0.9, -hs2 * 0.8, hs2, hs2 * 0.8, y, y + 0.06, mc); ob(v, -hs2, -0.45, hs2, 0.45, y, y + 0.06, mc);
    for (const s of [-1, 1]) ob(v, s * r * 0.45 - 0.3, -0.3, s * r * 0.45 + 0.3, 0.3, top, y - 0.5, STEEL); }
  else if (kind === 'mast' || kind === 'heli') { const mh = 28 + k * 24; ob(v, -2.6, -2.6, 2.6, 2.6, top, top + 3, [0.3, 0.31, 0.33]);
    ob(v, -0.9, -0.9, 0.9, 0.9, top + 3, top + 3 + mh * 0.5, [0.55, 0.57, 0.6]); ob(v, -0.45, -0.45, 0.45, 0.45, top + 3 + mh * 0.5, top + 3 + mh + 10, [0.6, 0.62, 0.64]);
    lt(0, 0, top + 3 + mh * 0.5, 0.6, RED); lt(0, 0, top + 3 + mh + 10.3, 0.75, STROBE); }
  else if (kind === 'bill') { const [ax, az] = topMin(p.d, p.w, p.h); const B = billSpec(p.seed, Math.min(ax, tx), Math.min(az, tz)); const bw = B.bw, ph = B.ph, xf = B.xf, yb = top + B.yb, yt = yb + ph;
    ob(v, xf - B.dep, -bw / 2, xf - 0.4, bw / 2, top, yb, B.st); ob(v, xf - 0.4, -bw / 2 - 0.3, xf, bw / 2 + 0.3, yb, yt, [0.07, 0.07, 0.08]);
    const sb = W.b('signface', p.x, p.z); const F = xf + 0.02; const ry = Math.PI / 2 - p.ang; const G = kg();
    billFace({
      field: (za, zb, ya, yc, col, dz = 0) => ob(nb, F + dz, Math.min(za, zb), F + 0.05 + dz, Math.max(za, zb), ya, yc, col),
      glyph: (za, zb, ya, yc, col, cell) => { const q = P(F + 0.1, (za + zb) / 2); put(sb, cellPlane(cell), q[0], (ya + yc) / 2, q[1], Math.abs(zb - za), yc - ya, 1, col, ry); },
      disc: (zc, yc, r, col, dz = 0) => { const q = P(F + 0.06 + dz, zc); put(nb, G.ball, q[0], yc, q[1], 0.05, r, r, col, -p.ang); },
    }, -bw / 2, bw / 2, yb, yt, p.seed, true);
    for (const z of [-bw / 2, bw / 2]) lt(xf - 0.2, z, yt + 0.35, 0.4, RED); }
  else if (kind === 'screen') { const S = screenSpec(p.seed); const glow = NEONC[(p.seed >>> 2) % NEONC.length]; const col = [0.3, 0.32, 0.35];
    const y1 = top + S.h1, y2 = top + S.h1 + S.h2; const ins = S.ins;
    ob(v, -tx + 0.2, -tz + 0.2, tx - 0.2, tz - 0.2, top, y1 + 0.6, col); ob(v, -tx + ins, -tz + ins, tx - ins, tz - ins, y1 + 0.6, y2 + 0.6, [0.28, 0.3, 0.33]);
    for (const [s0, s1, y] of [[tx - 0.2, tz - 0.2, y1 + 0.5], [tx - ins, tz - ins, y2 + 0.5]]) {
      ob(nb, -s0 - 0.28, s1, s0 + 0.28, s1 + 0.28, y - 0.05, y + 0.05, glow); ob(nb, -s0 - 0.28, -s1 - 0.28, s0 + 0.28, -s1, y - 0.05, y + 0.05, glow); ob(nb, s0, -s1, s0 + 0.28, s1, y - 0.05, y + 0.05, glow); ob(nb, -s0 - 0.28, -s1, -s0, s1, y - 0.05, y + 0.05, glow); }
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lt(a * (tx - ins), b * (tz - ins), y2 + 0.9, 0.35, RED);
    ob(v, -0.22, -0.22, 0.22, 0.22, y2 + 0.6, y2 + 14.6, STEEL); lt(0, 0, y2 + 14.9, 0.5, STROBE); }
  else { let s = m, yy = top; for (let i = 0; i < 3; i++) { const h = 5.5; ob(v, -s, -s, s, s, yy, yy + h, i % 2 ? [0.25, 0.26, 0.28] : [0.4, 0.42, 0.45]); yy += h; s *= 0.62; }
    ob(v, -0.35, -0.35, 0.35, 0.35, yy, yy + 24, STEEL); lt(0, 0, yy + 24.3, 0.7, RED); }
}
void THREE;
