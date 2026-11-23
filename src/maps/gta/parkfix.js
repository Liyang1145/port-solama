// a_parking (map 索拉纳港 only): parked-car census + fix-up, run after placement (like colfix / propfix: no builder draws another
// random number, every layout and RNG stream stays as before; this pass only moves or drops finished records).
//  1) mainland fabric (fabric.js I.car: driveway cars + stall rows of strip-mall / apartment / big-box / park lots). The chunk
//     records are freed by attachFabric, so this runs just before it (city.js region.attach) and leaves a read-only snapshot
//     fab.parked = Float32Array [x, z, ang, kind] (kind 0 lot stall, 1 driveway, 2 other) for later audits.
//     Rules: a parked car stands wholly on a stall lot or a driveway (not on the carriageway, a sidewalk, grass or water), clear
//     of buildings / walls / hedges / trailers / parapets, tree / palm / lamp trunks and the other cars, square to the
//     painted stall lines (≤ 5°) and centred in a stall (≤ 0.3 m along the row, ≤ 0.45 m in depth), on level ground (fabric surfaces are y 0; groundH within 0.1 m).
//     Fix: a lot car is snapped into the nearest painted stall (centred, square to the separators) or the nearest free one
//     beside it in the row (≤ 3 stalls); a driveway car slides along its own axis (≤ 2 m); otherwise dropped. a_parkcol: their colliders are built afterwards from fab.parked (attachParkedColliders).
//  2) 海潮大道 (Tideline Drive, x 290) west kerb lane: the parallel-parking slots of props.js (city.parking, spawned by game.js).
//     Florida rules (F.S. 316.1945) + the bus-stop sign the map shows (公交车站前后 30 米): a slot faces the traffic of its lane
//     (west lane runs +z -> yaw 0; half of them faced -z), not within 20 ft (6.1 m) of a crosswalk at an intersection (zebra
//     1.0–4.2 m from the cross street's kerb line), not within 30 ft (9.1 m) of the signal mast on the approach, not within
//     15 ft (4.6 m) of a hydrant, not within 30 m of a bus stop, not across a lane / driveway mouth or on a bridge.
//     Fix: each kerb run is re-packed (slot order and fill draws kept, 6.8 m pitch as laid out, first legal spot after the
//     previous slot); slots that no longer fit are removed. Game-spawned cars carry their
//     own dynamic collider, so no static box to sync.
import { PARK_BAKE } from './parkbake.js';
const FULL = typeof location !== 'undefined' && /[?&]parkfull/.test(location.search); // force the full pass (bake check)
const BAKE = typeof location !== 'undefined' && /[?&]parkbake/.test(location.search); // full pass + replay table on region.parkFix.bake (tools/parkfix_bake.cjs)
const AUDIT = typeof location !== 'undefined' && /[?&]parkaudit/.test(location.search); // full pre / post tallies + diagnostics only on request (load time)
const CAR_HL = 2.2, CAR_HW = 0.89; // fabric car box (GEO.car 4.4 × 1.78)
const DEG5 = Math.sin((5 * Math.PI) / 180);
const CATS = ['road', 'walk', 'offlot', 'body', 'trunk', 'car', 'water', 'ground', 'angle', 'stall'];

// ---- 2D helpers -------------------------------------------------------------------------------------------------------------
// a_parkcol: one fixed object shape (bbox, kind, stall and grid stamp set up front) so every test reads monomorphic fields
class OBB { constructor(cx, cz, ux, uz, hl, hw) { this.cx = cx; this.cz = cz; this.ux = ux; this.uz = uz; this.hl = hl; this.hw = hw;
  const ex = Math.abs(ux) * hl + Math.abs(uz) * hw, ez = Math.abs(uz) * hl + Math.abs(ux) * hw; this.x0 = cx - ex; this.x1 = cx + ex; this.z0 = cz - ez; this.z1 = cz + ez; this.kind = -1; this.stall = null; this._g = 0; } }
const obbOf = (x, z, ang, hl = CAR_HL, hw = CAR_HW) => new OBB(x, z, Math.cos(ang), -Math.sin(ang), hl, hw); // local +x = (cos, -sin)
const GE = 1e-6; // grid cells of a box: its bbox grown by GE (a superset of the cells its corners span)
function corners(o, s = 0) { const vx = -o.uz, vz = o.ux; const a = o.hl - s, b = o.hw - s; return [[o.cx + o.ux * a + vx * b, o.cz + o.uz * a + vz * b], [o.cx + o.ux * a - vx * b, o.cz + o.uz * a - vz * b], [o.cx - o.ux * a - vx * b, o.cz - o.uz * a - vz * b], [o.cx - o.ux * a + vx * b, o.cz - o.uz * a + vz * b]]; }
function samples(o, s) { const c = corners(o, s); const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return [[o.cx, o.cz], ...c, m(c[0], c[1]), m(c[1], c[2]), m(c[2], c[3]), m(c[3], c[0])]; }
function obbHit(A, B, pad = 0) { // separating axis, 2D boxes
  for (const [ax, az] of [[A.ux, A.uz], [-A.uz, A.ux], [B.ux, B.uz], [-B.uz, B.ux]]) {
    const ra = A.hl * Math.abs(A.ux * ax + A.uz * az) + A.hw * Math.abs(-A.uz * ax + A.ux * az);
    const rb = B.hl * Math.abs(B.ux * ax + B.uz * az) + B.hw * Math.abs(-B.uz * ax + B.ux * az);
    if (Math.abs((B.cx - A.cx) * ax + (B.cz - A.cz) * az) >= ra + rb + pad) return false; }
  return true;
}
function circHit(o, x, z, r) { const dx = x - o.cx, dz = z - o.cz; const a = dx * o.ux + dz * o.uz, b = -dx * o.uz + dz * o.ux; const qa = Math.max(0, Math.abs(a) - o.hl), qb = Math.max(0, Math.abs(b) - o.hw); return qa * qa + qb * qb < r * r; }
const triIn = (px, pz, a, b, c) => { const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (pz - b[1]), d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (pz - c[1]), d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pz - a[1]);
  return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); };
const quadIn = (px, pz, q) => triIn(px, pz, q[0], q[1], q[2]) || triIn(px, pz, q[0], q[2], q[3]);

// uniform grid of items with a bbox (a_parkcol: near() dedupes with a generation stamp instead of out.includes, into a caller buffer)
class Grid {
  // a_parkcol: dense cell array over the fabric's extent (Map fallback outside it); same cells, same insertion order as before
  constructor(cell, ext) { this.c = cell; this.m = new Map(); this.gen = 0;
    if (ext) { this.I0 = Math.floor(ext[0] / cell); this.K0 = Math.floor(ext[1] / cell); this.NI = Math.floor(ext[2] / cell) - this.I0 + 1; this.NK = Math.floor(ext[3] / cell) - this.K0 + 1; this.d = new Array(this.NI * this.NK).fill(null); } else this.d = null; }
  L(i, k, mk) { const a = i - this.I0, b = k - this.K0; if (this.d && a >= 0 && b >= 0 && a < this.NI && b < this.NK) { const j = a * this.NK + b; let l = this.d[j]; if (!l && mk) l = this.d[j] = []; return l; }
    const key = i * 100003 + k; let l = this.m.get(key); if (!l && mk) this.m.set(key, l = []); return l; }
  add(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) this.L(i, k, true).push(it); }
  remove(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) { const l = this.L(i, k, false); if (l) { const j = l.indexOf(it); if (j >= 0) l.splice(j, 1); } } }
  cells(x, z, r, out) { out.length = 0; const c = this.c; const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), k0 = Math.floor((z - r) / c), k1 = Math.floor((z + r) / c); // the cell lists themselves (an item may repeat): for yes / no tests
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const l = this.L(i, k, false); if (l && l.length) out.push(l); } return out; }
  near(x, z, r, out) { out.length = 0; const c = this.c; const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), k0 = Math.floor((z - r) / c), k1 = Math.floor((z + r) / c);
    if (i0 === i1 && k0 === k1) { const l = this.L(i0, k0, false); if (l) for (let j = 0; j < l.length; j++) out.push(l[j]); return out; }
    const g = ++this.gen; for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const l = this.L(i, k, false); if (l) for (let j = 0; j < l.length; j++) { const it = l[j]; if (it._g !== g) { it._g = g; out.push(it); } } } return out; }
}
// quads carry their bbox (cheap reject before the two triangle tests; inside it the original test decides)
const quadsOf = (acc, mode) => { const out = []; if (!acc || !acc.p) return out; const P = acc.p, X = acc.x, UV = acc.uv; for (let v = 0; v + 3 < acc.n; v += 4) { if (mode !== undefined && X && X[v * 4] !== mode) continue; const q = []; q.uv = []; q.mode = X ? X[v * 4] : -1;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < 4; k++) { const x = P[(v + k) * 3], z = P[(v + k) * 3 + 2]; q.push([x, z]); q.uv.push([UV[(v + k) * 2], UV[(v + k) * 2 + 1]]); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  q.x0 = x0; q.z0 = z0; q.x1 = x1; q.z1 = z1; q._g = 0; out.push(q); } return out; };
const quadInB = (px, pz, q) => !(px < q.x0 || px > q.x1 || pz < q.z0 || pz > q.z1) && quadIn(px, pz, q);
// affine (per triangle, as the GPU interpolates it) world <-> uv of a lot quad; tri 0 = (0,1,2), tri 1 = (0,2,3)
const TRI = [[0, 1, 2], [0, 2, 3]];
function bary(p, a, b, c) { const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) return null; const l1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d, l2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d; return [l1, l2, 1 - l1 - l2]; }
const inB = (l, e = 1e-6) => l && l[0] >= -e && l[1] >= -e && l[2] >= -e;
function toUV(q, x, z) { for (const t of TRI) { const l = bary([x, z], q[t[0]], q[t[1]], q[t[2]]); if (inB(l)) return { t, u: l[0] * q.uv[t[0]][0] + l[1] * q.uv[t[1]][0] + l[2] * q.uv[t[2]][0], v: l[0] * q.uv[t[0]][1] + l[1] * q.uv[t[1]][1] + l[2] * q.uv[t[2]][1] }; } return null; }
function toW(q, u, v) { for (const t of TRI) { const l = bary([u, v], q.uv[t[0]], q.uv[t[1]], q.uv[t[2]]); if (inB(l)) return [l[0] * q[t[0]][0] + l[1] * q[t[1]][0] + l[2] * q[t[2]][0], l[0] * q[t[0]][1] + l[1] * q[t[1]][1] + l[2] * q[t[2]][1]]; } return null; }
function isoU(q, t) { // world direction along which u stays constant (the painted stall separators) in triangle t
  const [A, B, C] = t.map((i) => q[i]), [a, b, c] = t.map((i) => q.uv[i][0]); const e1 = [B[0] - A[0], B[1] - A[1]], e2 = [C[0] - A[0], C[1] - A[1]], du1 = b - a, du2 = c - a;
  const det = e1[0] * e2[1] - e1[1] * e2[0]; if (Math.abs(det) < 1e-12) return null; const gx = (du1 * e2[1] - du2 * e1[1]) / det, gz = (du2 * e1[0] - du1 * e2[0]) / det; const l = Math.hypot(gx, gz) || 1; return [-gz / l, gx / l]; }
const STALL_V = [3.25, 15.1]; // stall band centres in each 18 m module (bands 0.6–5.9, 12.4–17.8: fabric.js lot shader)
const stallAt = (u, v) => { const m = Math.floor(v / 18) * 18; const vb = STALL_V.map((c) => m + c).concat([m - 18 + 15.1, m + 18 + 3.25]).reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p)); return [Math.floor(u / 2.7) * 2.7 + 1.35, vb]; };
const bbox = (pts) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; };

// ---- 1) mainland fabric cars ------------------------------------------------------------------------------------------------
// a_parkcol: same rules, same order of decisions, same results car for car as a_parking (diffed: position / heading 0); the
// checks now bbox-reject before every exact test, reuse their buffers and return a bit mask (load time 0.49 s -> see a_parkcol.md).
const B = {}; CATS.forEach((k, i) => { B[k] = 1 << i; });
const maskSet = (m) => { const s = new Set(); for (let i = 0; i < CATS.length; i++) if (m & (1 << i)) s.add(CATS[i]); return s; };
const aabb = (o) => o; // OBB carries its bbox
const EPS = 1e-6;
export function fixFabricCars(fab, groundH, opt = {}) {
  const T0 = performance.now(); const S = { pre: {}, post: {}, moved: 0, dropped: 0, byCat: {}, ex: {} }; if (!fab || !fab.chunks) return S;
  // a_parkcol: the decisions are baked (parkbake.js) against a hash of every input this pass reads; a match replays them exactly
  // (same arithmetic, same doubles), anything else (layout changed, &parkfull, &parkaudit) runs the full pass below
  const H = hashFab(fab); S.hash = H; S.tHash = Math.round(performance.now() - T0);
  if (!AUDIT && !FULL && !BAKE && !opt.full && PARK_BAKE && PARK_BAKE.hash === H) { const ok = applyBake(fab, PARK_BAKE, S); if (ok) { S.baked = true; S.ms = Math.round(performance.now() - T0); return S; } }
  if (!BAKE && PARK_BAKE && PARK_BAKE.hash !== H && typeof console !== 'undefined') console.warn('parkfix: bake stale (fabric inputs changed), full pass; regenerate: node tools/parkfix_bake.cjs');
  const EXT = extOf(fab);
  const gRoad = new Grid(16, EXT), gWalk = new Grid(16, EXT), gLot = new Grid(16, EXT), gFlat = new Grid(16, EXT), gBody = new Grid(16, EXT), gTrunk = new Grid(8, EXT), gCar = new Grid(8, EXT);
  const cars = [];
  for (const ch of fab.chunks.values()) {
    for (const q of quadsOf(ch.road)) gRoad.add(q, q.x0, q.z0, q.x1, q.z1);
    for (const q of quadsOf(ch.walk)) gWalk.add(q, q.x0, q.z0, q.x1, q.z1);
    for (const q of quadsOf(ch.plaza)) gWalk.add(q, q.x0, q.z0, q.x1, q.z1);
    for (const q of quadsOf(ch.lot, 0)) { q.lot = true; gLot.add(q, q.x0, q.z0, q.x1, q.z1); }
    for (const q of quadsOf(ch.lot, 2)) { q.lot = true; gLot.add(q, q.x0, q.z0, q.x1, q.z1); }
    const I = ch.I;
    for (const f of I.flat) { if (f[8] > 0.02) continue; const o = obbOf(f[0], f[1], f[4], f[2] / 2, f[3] / 2); gFlat.add(o, o.x0 - GE, o.z0 - GE, o.x1 + GE, o.z1 + GE); // driveways / pads (decks at 0.35, pool decks 0.016 excluded)
      const e = 0.08; o.x0 -= e; o.x1 += e; o.z0 -= e; o.z1 += e; } // reject box for the +0.05 point test
    for (const b of I.body) { if (b[1] + b[4] < 0.1 || b[1] > 1.5) continue; const o = obbOf(b[0], b[2], b[6], b[3] / 2, b[5] / 2); o.kind = b[10]; gBody.add(o, o.x0 - GE, o.z0 - GE, o.x1 + GE, o.z1 + GE); }
    for (const t of I.tree) { const r = 0.24 * (0.75 + t[2] * 0.12); const it = [t[0], t[1], r, 'tree']; it._g = 0; gTrunk.add(it, t[0] - r, t[1] - r, t[0] + r, t[1] + r); }
    for (const p of I.palm) { const r = 0.24 * (p[2] / 10) + 0.05; const it = [p[0], p[1], r, 'palm']; it._g = 0; gTrunk.add(it, p[0] - r, p[1] - r, p[0] + r, p[1] + r); }
    for (const l of I.lamp) { const it = [l[0], l[1], 0.12, 'lamp']; it._g = 0; gTrunk.add(it, l[0] - 0.12, l[1] - 0.12, l[0] + 0.12, l[1] + 0.12); }
    for (const p of I.car) { const it = { p, ch, o: obbOf(p[0], p[1], p[2]), alive: true, _g: 0, code: 0 }; cars.push(it); gCar.add(it, it.o.x0 - GE, it.o.z0 - GE, it.o.x1 + GE, it.o.z1 + GE); }
  }
  S.tGrid = Math.round(performance.now() - T0);
  const tmp = [], LR = [], LW = [], LL = [], LF = [], SP = new Float64Array(18);
  const inAny = (g, x, z) => { const l = g.near(x, z, 0, tmp); for (let j = 0; j < l.length; j++) if (quadInB(x, z, l[j])) return l[j]; return null; };
  const inL = (L, x, z) => { for (let j = 0; j < L.length; j++) if (quadInB(x, z, L[j])) return L[j]; return null; };
    // classify one car box (it excluded from the car-car test); returns the failed categories as a bit mask (B[cat]).
  // full = false (a candidate spot): stops at the first failure (only "any failure?" is used then; a passing spot is always fully checked)
  const CR = [], CW = [], CF = [], CB = [], CT = [], CC = [];
  const inCells = (C, x, z) => { for (let a = 0; a < C.length; a++) { const L = C[a]; for (let j = 0; j < L.length; j++) if (quadInB(x, z, L[j])) return true; } return false; };
  const inF = (x, z) => { for (let a = 0; a < CF.length; a++) { const L = CF[a]; for (let j = 0; j < L.length; j++) { const f = L[j]; if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue; const dx = x - f.cx, dz = z - f.cz; if (Math.abs(dx * f.ux + dz * f.uz) <= f.hl + 0.05 && Math.abs(-dx * f.uz + dz * f.ux) <= f.hw + 0.05) return true; } } return false; };
  const check = (o, it, full = true) => {
    let bad = 0;
    const r = o.hl + 0.5; const X0 = o.x0 - EPS, X1 = o.x1 + EPS, Z0 = o.z0 - EPS, Z1 = o.z1 + EPS;
    gCar.cells(o.cx, o.cz, r, CC); out: for (let a = 0; a < CC.length; a++) { const L = CC[a]; for (let j = 0; j < L.length; j++) { const c = L[j]; if (c === it || !c.alive) continue; const co = c.o; if (co.x1 < X0 || co.x0 > X1 || co.z1 < Z0 || co.z0 > Z1) continue; if (obbHit(o, co, -0.05)) { bad |= 32; break out; } } }
    if (bad && !full) return bad;
    gTrunk.cells(o.cx, o.cz, r, CT); out: for (let a = 0; a < CT.length; a++) { const L = CT[a]; for (let j = 0; j < L.length; j++) { const t = L[j], tr = t[2]; if (t[0] < X0 - tr || t[0] > X1 + tr || t[1] < Z0 - tr || t[1] > Z1 + tr) continue; if (circHit(o, t[0], t[1], tr)) { bad |= 16; break out; } } }
    if (bad && !full) return bad;
    gBody.cells(o.cx, o.cz, r, CB); out: for (let a = 0; a < CB.length; a++) { const L = CB[a]; for (let j = 0; j < L.length; j++) { const b = L[j]; if (b.x1 < X0 || b.x0 > X1 || b.z1 < Z0 || b.z0 > Z1) continue; if (obbHit(o, b, -0.05)) { bad |= 8; break out; } } }
    if (bad && !full) return bad;
    { const vx = -o.uz, vz = o.ux; const a = o.hl - 0.12, b = o.hw - 0.12; // samples(o, 0.12): centre, 4 corners, 4 edge midpoints
      const c0x = o.cx + o.ux * a + vx * b, c0z = o.cz + o.uz * a + vz * b, c1x = o.cx + o.ux * a - vx * b, c1z = o.cz + o.uz * a - vz * b, c2x = o.cx - o.ux * a - vx * b, c2z = o.cz - o.uz * a - vz * b, c3x = o.cx - o.ux * a + vx * b, c3z = o.cz - o.uz * a + vz * b;
      SP[0] = o.cx; SP[1] = o.cz; SP[2] = c0x; SP[3] = c0z; SP[4] = c1x; SP[5] = c1z; SP[6] = c2x; SP[7] = c2z; SP[8] = c3x; SP[9] = c3z;
      SP[10] = (c0x + c1x) / 2; SP[11] = (c0z + c1z) / 2; SP[12] = (c1x + c2x) / 2; SP[13] = (c1z + c2z) / 2; SP[14] = (c2x + c3x) / 2; SP[15] = (c2z + c3z) / 2; SP[16] = (c3x + c0x) / 2; SP[17] = (c3z + c0z) / 2; }
    const R0 = o.hl + 0.2; gRoad.cells(o.cx, o.cz, R0, CR); gWalk.cells(o.cx, o.cz, R0, CW); gLot.near(o.cx, o.cz, R0, LL); gFlat.cells(o.cx, o.cz, R0, CF);
    let lotQ = null, onFlat = 0;
    for (let j = 0; j < 18; j += 2) { const x = SP[j], z = SP[j + 1];
      if (!(bad & 1) && CR.length && inCells(CR, x, z)) bad |= 1; if (!(bad & 2) && CW.length && inCells(CW, x, z)) bad |= 2;
      const q = inL(LL, x, z); if (q) lotQ = lotQ || q; else if (inF(x, z)) onFlat++; else bad |= 4;
      if (bad && !full) return bad; }
    let wet = false, off = 0; for (let j = 0; j < 10; j += 2) { const h = groundH(SP[j], SP[j + 1]); if (h === undefined || h <= -0.95) wet = true; else off = Math.max(off, Math.abs(h)); }
    if (wet) bad |= 64; else if (off > 0.1) bad |= 128;
    if (bad && !full) return bad;
    const cq = inL(LL, o.cx, o.cz); o.stall = null;
    if (cq && cq.mode === 0) { const w = toUV(cq, o.cx, o.cz), d = w && isoU(cq, w.t); // square to the painted stall lines and centred in a stall
      if (w && d) { if (Math.abs(o.ux * d[1] - o.uz * d[0]) > DEG5) bad |= 256; const [su, sv] = stallAt(w.u, w.v); o.stall = { q: cq, su, sv, d };
        if (Math.abs(w.u - su) > 0.3 || Math.abs(w.v - sv) > 0.45) bad |= 512; } }
    o.kind = lotQ ? 0 : onFlat ? 1 : 2; return bad;
  };
  const checkSet = (o, it) => maskSet(check(o, it));
  const tally = () => { const o = { n: 0 }; for (const k of CATS) o[k] = 0; let any = 0; for (const it of cars) { if (!it.alive) continue; o.n++; const b = checkSet(it.o, it); if (b.size) any++; for (const k of b) o[k]++; } o.any = any; return o; };
  if (AUDIT) S.pre = tally();
  if (AUDIT) { const D = { byKind: {}, angDeg: [0, 0, 0, 0, 0], du: [0, 0, 0, 0], dv: [0, 0, 0, 0], bodyKind: {} }; // pre-fix diagnostics: category x kind (0 lot 1 driveway 2 other), stall-line angle (<2,2-5,5-10,10-20,>20 deg), stall offsets (<.15,<.3,<.6,>=.6 m)
    for (const it of cars) { const b = checkSet(it.o, it); for (const k of b) { const e = D.byKind[k] || (D.byKind[k] = [0, 0, 0]); e[it.o.kind]++; }
      const st = it.o.stall; if (st) { const w = toUV(st.q, it.o.cx, it.o.cz); const a = Math.asin(Math.min(1, Math.abs(it.o.ux * st.d[1] - it.o.uz * st.d[0]))) * 57.3; D.angDeg[a < 2 ? 0 : a < 5 ? 1 : a < 10 ? 2 : a < 20 ? 3 : 4]++;
        const bin = (x) => (x < 0.15 ? 0 : x < 0.3 ? 1 : x < 0.6 ? 2 : 3); D.du[bin(Math.abs(w.u - st.su))]++; D.dv[bin(Math.abs(w.v - st.sv))]++; }
      if (b.has('body')) for (const bo of gBody.near(it.o.cx, it.o.cz, 12, [])) if (obbHit(it.o, bo, -0.05)) { D.bodyKind[bo.kind] = (D.bodyKind[bo.kind] || 0) + 1; break; } }
    S.diag = D; }
  // cheap stall test (no full check) so the common case, a lot car off its painted stall, goes straight to the snap
  const stallOff = (o) => { const cq = inAny(gLot, o.cx, o.cz); if (!cq || cq.mode !== 0) return false; const w = toUV(cq, o.cx, o.cz), d = w && isoU(cq, w.t); if (!d) return false;
    const [su, sv] = stallAt(w.u, w.v); o.stall = { q: cq, su, sv, d }; return Math.abs(o.ux * d[1] - o.uz * d[0]) > DEG5 || Math.abs(w.u - su) > 0.3 || Math.abs(w.v - sv) > 0.45; };
  for (const it of cars) {
    const viaA = !AUDIT && stallOff(it.o); const m = viaA ? B.stall : check(it.o, it); if (!m) continue; const bad = maskSet(m);
    for (const k of bad) { S.byCat[k] = (S.byCat[k] || 0) + 1; const e = S.ex[k] || (S.ex[k] = []); if (e.length < 4) e.push([+it.p[0].toFixed(1), +it.p[1].toFixed(1)]); }
    const p = it.p; const o0 = it.o; const vx = -o0.uz, vz = o0.ux; let best = null;
    if (o0.stall) { const { q, su, sv } = o0.stall; // lot car: into the nearest painted stall (centred, along its separators), else a free stall beside it in the row
      for (let k = 0; k < DU.length; k++) { const W = toW(q, su + DU[k], sv); if (!W) continue; const w = toUV(q, W[0], W[1]); const d = w && isoU(q, w.t); if (!d) continue;
        const sg = o0.ux * d[0] + o0.uz * d[1] < 0 ? -1 : 1; const ang = Math.atan2(-d[1] * sg, d[0] * sg); const o = aabb(obbOf(W[0], W[1], ang)); if (!check(o, it, false)) { best = o; p[2] = ang; it.code = (viaA ? 2 : 9) + k; break; } } }
    if (!best && !o0.stall) { const tries = triesOf(o0);
      for (let t = 0; t < tries.length; t++) { const [dx, dz] = tries[t]; const o = aabb(obbOf(p[0] + dx, p[1] + dz, p[2])); if (!check(o, it, false)) { best = o; it.code = 16 + t; break; } } }
    gCar.remove(it, o0.x0 - GE, o0.z0 - GE, o0.x1 + GE, o0.z1 + GE);
    const how = best ? 'moved' : 'dropped'; for (const k of bad) S.byCat[k + '_' + how] = (S.byCat[k + '_' + how] || 0) + 1;
    if (best) { p[0] = best.cx; p[1] = best.cz; it.o = best; gCar.add(it, best.x0 - GE, best.z0 - GE, best.x1 + GE, best.z1 + GE); S.moved++; }
    else { it.alive = false; it.code = 1; S.dropped++; }
  }
  const dead = new Set(cars.filter((c) => !c.alive).map((c) => c.p)); if (dead.size) for (const ch of fab.chunks.values()) ch.I.car = ch.I.car.filter((p) => !dead.has(p));
  if (AUDIT) S.post = tally();
  // read-only snapshot for later audits and the parked-car colliders (the chunk records are freed by attachFabric)
  const live = cars.filter((c) => c.alive); const A = new Float32Array(live.length * 4);
  live.forEach((c, i) => { if (c.o.kind < 0) check(c.o, c); A[i * 4] = c.p[0]; A[i * 4 + 1] = c.p[1]; A[i * 4 + 2] = c.p[2]; A[i * 4 + 3] = c.o.kind; });
  fab.parked = A; S.ms = Math.round(performance.now() - T0);
  if (opt.record || BAKE) { const C = new Uint8Array(cars.length); cars.forEach((c, i) => { C[i] = c.code * 3 + (c.alive ? c.o.kind : 0); }); S.codes = C; S.n = cars.length;
    let b = ''; for (let i = 0; i < C.length; i += 8192) b += String.fromCharCode.apply(null, C.subarray(i, i + 8192)); S.bake = { hash: S.hash, n: C.length, moved: S.moved, dropped: S.dropped, codes: btoa(b) }; }
  return S;
}
function extOf(fab) { let ex0 = Infinity, ez0 = Infinity, ex1 = -Infinity, ez1 = -Infinity; for (const ch of fab.chunks.values()) { ex0 = Math.min(ex0, ch.cx - 400); ex1 = Math.max(ex1, ch.cx + 400); ez0 = Math.min(ez0, ch.cz - 400); ez1 = Math.max(ez1, ch.cz + 400); } // chunks are 640 m
  return isFinite(ex0) ? [ex0, ez0, ex1, ez1] : null; }
// ---- bake: input hash + replay --------------------------------------------------------------------------------------------
const DU = [0, 2.7, -2.7, 5.4, -5.4, 8.1, -8.1]; // snap: the painted stall, then free stalls beside it in the row
function triesOf(o0) { const vx = -o0.uz, vz = o0.ux; const tries = []; for (let s = 0.2; s <= 2.0 + 1e-6; s += 0.2) for (const g of [1, -1]) tries.push([o0.ux * s * g, o0.uz * s * g]); // along its own axis (in / out of the stall)
  for (let k = 1; k <= 3; k++) for (const g of [1, -1]) tries.push([vx * 2.7 * k * g, vz * 2.7 * k * g]); // along the stall row
  return tries; }
// 2 x 32-bit FNV-style lanes over the float64 bits of every value the pass reads (surface quad corners, lot uv + stripe mode,
// flat / body footprints, trunk / lamp positions and sizes, car poses); colours and other unread fields are left out
function hashFab(fab) {
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer); let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
  const num = (v) => { f64[0] = v; h1 = Math.imul(h1 ^ u32[0], 16777619); h2 = Math.imul(h2 ^ u32[1], 2246822519); };
  const arr = (a) => { if (!a) { num(-1); return; } num(a.length); for (let i = 0; i < a.length; i++) num(a[i]); };
  const recs = (L, F) => { num(L.length); for (const r of L) for (let i = 0; i < F.length; i++) { const v = r[F[i]]; num(typeof v === 'number' ? v : 0); } };
  for (const ch of fab.chunks.values()) { for (const a of [ch.road, ch.walk, ch.plaza]) { if (!a || !a.p) { num(-2); continue; } num(a.n); arr(a.p); }
    if (ch.lot && ch.lot.p) { num(ch.lot.n); arr(ch.lot.p); arr(ch.lot.uv); arr(ch.lot.x); } else num(-2);
    const I = ch.I; recs(I.flat, [0, 1, 2, 3, 4, 8]); recs(I.body, [0, 1, 2, 3, 4, 5, 6]); recs(I.tree, [0, 1, 2]); recs(I.palm, [0, 1, 2]); recs(I.lamp, [0, 1]); recs(I.car, [0, 1, 2]); }
  return ((h1 >>> 0).toString(16).padStart(8, '0')) + ((h2 >>> 0).toString(16).padStart(8, '0'));
}
// replay: per car (fabric order) code = decision * 3 + kind; decision 0 keep, 1 drop, 2+k / 9+k snap to DU[k] (stall found as the
// cheap stall test does / as the full check does), 16+t slide by triesOf()[t]; all positions recomputed with the full pass's arithmetic
function applyBake(fab, BK, S) {
  const bin = atob(BK.codes), codes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) codes[i] = bin.charCodeAt(i); let n = 0; for (const ch of fab.chunks.values()) n += ch.I.car.length; if (n !== codes.length || n !== BK.n) return false;
  const gLot = new Grid(16, extOf(fab)); for (const ch of fab.chunks.values()) { for (const q of quadsOf(ch.lot, 0)) gLot.add(q, q.x0, q.z0, q.x1, q.z1); for (const q of quadsOf(ch.lot, 2)) gLot.add(q, q.x0, q.z0, q.x1, q.z1); }
  const tmp = [], LL = []; const live = []; let i = 0;
  for (const ch of fab.chunks.values()) { const keep = [];
    for (const p of ch.I.car) { const c = codes[i++], dec = (c / 3) | 0, kind = c % 3;
      if (dec === 1) { S.dropped++; continue; }
      if (dec >= 2) { const o0 = obbOf(p[0], p[1], p[2]);
        if (dec < 16) { let cq = null; if (dec < 9) { for (const q of gLot.near(o0.cx, o0.cz, 0, tmp)) if (quadInB(o0.cx, o0.cz, q)) { cq = q; break; } }
          else { gLot.near(o0.cx, o0.cz, o0.hl + 0.2, LL); for (const q of LL) if (quadInB(o0.cx, o0.cz, q)) { cq = q; break; } }
          if (!cq) return false; const w0 = toUV(cq, o0.cx, o0.cz); if (!w0) return false; const [su, sv] = stallAt(w0.u, w0.v);
          const W = toW(cq, su + DU[(dec - 2) % 7], sv); if (!W) return false; const w = toUV(cq, W[0], W[1]); const d = w && isoU(cq, w.t); if (!d) return false;
          const sg = o0.ux * d[0] + o0.uz * d[1] < 0 ? -1 : 1; const ang = Math.atan2(-d[1] * sg, d[0] * sg); const o = obbOf(W[0], W[1], ang); p[0] = o.cx; p[1] = o.cz; p[2] = ang; }
        else { const t = triesOf(o0)[dec - 16]; if (!t) return false; const o = obbOf(p[0] + t[0], p[1] + t[1], p[2]); p[0] = o.cx; p[1] = o.cz; }
        S.moved++; }
      keep.push(p); live.push(p[0], p[1], p[2], kind); }
    ch.I.car = keep; }
  fab.parked = Float32Array.from(live); return true;
}

// ---- 2) Tideline Drive kerb-lane slots -------------------------------------------------------------------------------------
const HL = 2.75; // longest spawnable parked type (pickup 5.45 m)
const FT20 = 6.1, FT30 = 9.14, FT15 = 4.57, BUS = 30, MINGAP = 6.0;
export function fixStreetParking(city) {
  const S = { pre: {}, post: {}, flipped: 0, moved: 0, dropped: 0 }; const P = city.parking; if (!P || !P.length) return S;
  const RHW = 7, C = 290;
  const segs = city.segs.filter((s) => s.axis === 'z' && Math.abs(s.c - C) < 0.1);
  const hyd = city.col.boxes.filter((b) => b.tag === 'hyd').map((b) => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]).filter(([x]) => x > C - RHW - 3 && x < C - RHW + 1.5);
  const masts = city.col.boxes.filter((b) => b.tag === 'pole' && b.h >= 5.9).map((b) => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]).filter(([x]) => Math.abs(x - (C - RHW - 1.2)) < 0.6);
  const stops = ((city.signage && city.signage.stops) || []).filter((s) => s.c === C && s.sd < 0);
  let lanes = []; try { lanes = (city._svcLanes || []).filter((L) => L.x - L.hw < C - RHW + 2.5 && L.x + L.hw > C - RHW - 0.5); } catch (e) { lanes = []; }
  // reasons a car centred at z (west kerb lane, facing +z: rear z - HL, front z + HL) is illegal
  const why = (z) => { const r = [], z0 = z - HL, z1 = z + HL;
    const s = segs.find((g) => z >= g.a0 - 0.5 && z <= g.a1 + 0.5);
    if (!s) r.push('corner'); else {
      if (s.bridge) r.push('bridge');
      if (z0 < s.a0 + 5 || z1 > s.a1 - 5) r.push('corner'); // brief: < 5 m from the intersection (cross street kerb line)
      if (z0 < s.a0 + 4.2 + FT20 || z1 > s.a1 - 4.2 - FT20) r.push('crosswalk'); // within 20 ft of the zebra (1.0–4.2 m off the kerb line) at either end
    }
    for (const [, mz] of masts) if (mz > z1 && mz - z1 < FT30) r.push('signal'); // signal on the approach (traffic runs +z)
    for (const [, hz] of hyd) if (hz > z0 - FT15 && hz < z1 + FT15) { r.push('hydrant'); break; }
    for (const st of stops) if (z1 > st.z - BUS && z0 < st.z + BUS) { r.push('busstop'); break; }
    for (const L of lanes) if (z1 > L.z0 && z0 < L.z1) { r.push('lane'); break; }
    return r; };
  const tally = () => { const o = { n: P.length, filled: P.filter((p) => p.fill).length, wrongWay: 0, any: 0 }; for (const k of ['corner', 'crosswalk', 'signal', 'hydrant', 'busstop', 'lane', 'bridge', 'overlap']) o[k] = 0;
    const zs = P.map((p) => p.z).sort((a, b) => a - b);
    for (const p of P) { const w = why(p.z); if (Math.abs(Math.sin(p.yaw)) > 0.2 || Math.cos(p.yaw) < 0) w.push('wrongWay'); if (zs.some((z) => z !== p.z && Math.abs(z - p.z) < MINGAP)) w.push('overlap');
      if (w.length) o.any++; for (const k of new Set(w)) o[k] = (o[k] || 0) + 1; } return o; };
  S.pre = tally();
  for (const p of P) if (Math.cos(p.yaw) < 0.99) { p.yaw = 0; S.flipped++; } // west kerb lane traffic runs +z (vehicles.js lanePoint)
  // re-pack each kerb run: the slots keep their order (and their fill draw), each goes to the first legal spot at least one
  // slot pitch (6.8 m, as laid out) past the previous one; slots that no longer fit are removed
  P.sort((a, b) => a.z - b.z); const keep = [];
  for (const g of segs) { const run = P.filter((p) => p.z >= g.a0 && p.z <= g.a1); let z = g.a0 - 1e9; let i = 0;
    for (let q = g.a0 + HL; q <= g.a1 - HL && i < run.length; q = Math.round((q + 0.1) * 10) / 10) { if (q - z < 6.8 - 1e-6 || why(q).length) continue;
      const p = run[i++]; if (Math.abs(p.z - q) > 0.05) S.moved++; p.z = q; z = q; keep.push(p); }
    S.dropped += run.length - i; }
  P.splice(0, P.length, ...keep);
  S.post = tally(); S.hydrants = hyd.length; S.masts = masts.length; S.stops = stops.length; S.lanes = lanes.length;
  return S;
}

// ---- 3) a_parkcol: colliders for the mainland fabric parked cars ------------------------------------------------------------
// One oriented box per car of fab.parked, fitted to the fabric car model (GEO.car: body 4.4 x 1.78, roof 1.54 -> h 1.5; resolve()
// callers test at y 0.5, so walkers and vehicles are stopped, a jump does not clear it). The ~23k boxes live in their own fine
// grid (8 m cells, dense over the parked extent; each box filed once by its centre, kept when its bbox meets the query square)
// instead of the city grid (32 m cells: a lot cell would add 40-70 boxes to every query there). city.col.query (used by resolve /
// raycast / spawn checks) appends the boxes it touches; measured +0.6 boxes per query in lots, +0.03 elsewhere.
// The city box list (col.boxes) is not grown, so builders / audits that scan it are unaffected. Not pushable / breakable.
export const PARKED_H = 1.5;
export function attachParkedColliders(city) {
  const col = city.col, A = city.fabric && city.fabric.parked; const S = { n: 0, cells: 0, ms: 0 }; if (!col || !A || !A.length || col._parked) return S;
  const T0 = performance.now(); const C = 8; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < A.length; i += 4) { if (A[i] < x0) x0 = A[i]; if (A[i] > x1) x1 = A[i]; if (A[i + 1] < z0) z0 = A[i + 1]; if (A[i + 1] > z1) z1 = A[i + 1]; }
  const E = Math.hypot(CAR_HL, CAR_HW) + 0.01; // each box is filed once, in the cell of its centre; a query widens by its largest half extent (no dedupe)
  const I0 = Math.floor(x0 / C), K0 = Math.floor(z0 / C), NI = Math.floor(x1 / C) - I0 + 1, NK = Math.floor(z1 / C) - K0 + 1;
  const cells = new Array(NI * NK).fill(null); const boxes = [];
  for (let i = 0; i < A.length; i += 4) { const cx = A[i], cz = A[i + 1], ang = A[i + 2]; const ux = Math.cos(ang), uz = -Math.sin(ang), hl = CAR_HL, hw = CAR_HW;
    const ex = Math.abs(ux) * hl + Math.abs(uz) * hw, ez = Math.abs(uz) * hl + Math.abs(ux) * hw;
    const b = { minX: cx - ex, minZ: cz - ez, maxX: cx + ex, maxZ: cz + ez, h: PARKED_H, tag: 'parked' }; b.o = { cx, cz, ux, uz, hl, hw }; boxes.push(b); // same object shape as ColliderGrid.addOBB boxes (monomorphic resolve)
    const j = (Math.floor(cx / C) - I0) * NK + (Math.floor(cz / C) - K0); (cells[j] || (cells[j] = [])).push(b); }
  const q0 = col.query; // the grid's own query (prototype method)
  col.query = function (x, z, r, out = []) {
    q0.call(this, x, z, r, out); const R = r + E; const a0 = Math.max(0, Math.floor((x - R) / C) - I0), a1 = Math.min(NI - 1, Math.floor((x + R) / C) - I0), k0 = Math.max(0, Math.floor((z - R) / C) - K0), k1 = Math.min(NK - 1, Math.floor((z + R) / C) - K0);
    for (let a = a0; a <= a1; a++) for (let k = k0; k <= k1; k++) { const l = cells[a * NK + k]; if (l) for (let j = 0; j < l.length; j++) { const b = l[j]; if (b.maxX >= x - r && b.minX <= x + r && b.maxZ >= z - r && b.minZ <= z + r) out.push(b); } }
    return out; };
  col._parked = { boxes, cells, C, I0, K0, NI, NK, q0 }; S.n = boxes.length; S.cells = cells.reduce((n, l) => n + (l ? 1 : 0), 0); S.ms = Math.round(performance.now() - T0);
  return S;
}
export { hashFab as _hashFab, applyBake as _applyBake }; // node checks (lp / tools)
