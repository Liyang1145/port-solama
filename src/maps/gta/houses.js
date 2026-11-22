// a_houses (map 索拉纳港 only): close-range detail kit for the mainland fabric houses (South-Florida suburb read at street level).
// Runs after every earlier pass (curbfix -> propfix -> parkfix -> edgewalls), reads only the final records, draws no random
// numbers (variation comes from each house's own seed / roof colour), so the curbbake / parkbake tapes keep their inputs.
//  - four looks from what the house already is: terracotta roof -> 地中海 (barrel tile, cream trim, stucco pillar mailbox),
//    grey / brown / slate roof -> 牧场平房 (flat tile, accordion storm shutters, bronze trim), light roof -> 海岸木屋 (standing-seam
//    metal, lap siding, louvered shutters, column porch), flat roof -> 现代平顶 (parapet + coping, dark frames, rooftop unit).
//    Wall / roof surface detail (window frames, sills, shutters, stucco joints, water table, siding, barrel tile, metal seams) lives
//    in the existing fabBody / fabRoof programs and fades out with the pixel footprint (far view unchanged).
//  - geometry kit per house (boxes on the existing fabBody program, InstancedMesh pool around the camera, <= RAD m, nothing far):
//    eave fascia + gutters + downspouts (or parapet + coping + scupper), stucco base, sectional garage door + trim + handle at the
//    end of the driveway, front door + frame + house-number plaque + wall lantern, porch slab + step (+ columns + canopy), front
//    walk, driveway edge bands + control joints, AC condenser on a pad, mailbox, side-yard fence + gate, a pair of roll-out bins,
//    screen enclosure over some pools (frame casts shadows, the screens are dithered and cast none).
//  - two draw calls in the main pass (shadow-casting kit + fine/no-shadow kit) and one in the near shadow cascade; the far cascade
//    skips the kit (layer 29 is on the main camera only; the far cascade's shadow camera lists its own layers).
//  - colliders (mailbox, AC, bins, fence + gate, porch columns, screen walls) in an own 8 m grid appended to col.query, built per
//    house on first query near it; every item is checked: inside its lot, off every sidewalk / driveway / apron, clear of every
//    building / wall / hedge / trunk / pool deck. &nohouses switches the whole layer off, &houseaudit runs the census eagerly.
import * as THREE from 'three';
import { fabKit } from './fabric.js';
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const HOUSES_OFF = Q.has('nohouses');
const AUDIT = Q.has('houseaudit');
export const KIT_LAYER = 29;
const RAD = 78, NF = 21; // per box: matrix 16, colour 3, aK 2
const axes = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
const fr = Math.fround;
// deterministic per-house hash from its seed (no rng draws)
const hh = (s, k) => { const x = Math.sin(s * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- geometry tests ----
function obbOverlap(a, b, pad) { // a/b: {x, z, a, hl, hw}
  const A = axes(a.a), B = axes(b.a); const dx = b.x - a.x, dz = b.z - a.z;
  for (const n of [A[0], A[1], B[0], B[1]]) { const pa = a.hl * Math.abs(n[0] * A[0][0] + n[1] * A[0][1]) + a.hw * Math.abs(n[0] * A[1][0] + n[1] * A[1][1]);
    const pb = b.hl * Math.abs(n[0] * B[0][0] + n[1] * B[0][1]) + b.hw * Math.abs(n[0] * B[1][0] + n[1] * B[1][1]); if (Math.abs(dx * n[0] + dz * n[1]) >= pa + pb + pad) return false; }
  return true; }
function circRect(px, pz, r, R) { const [u, v] = axes(R.a); const rx = px - R.x, rz = pz - R.z; const la = rx * u[0] + rz * u[1], lw = rx * v[0] + rz * v[1];
  const da = Math.max(0, Math.abs(la) - R.hl), dw = Math.max(0, Math.abs(lw) - R.hw); return da * da + dw * dw < r * r; }
const corners = (R, e = 0) => { const [u, v] = axes(R.a); const o = []; for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.push([R.x + u[0] * sa * (R.hl + e) + v[0] * sb * (R.hw + e), R.z + u[1] * sa * (R.hl + e) + v[1] * sb * (R.hw + e)]); return o; };
function inPoly(P, x, z) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// distance along a ray from (px,pz) dir (dx,dz) to the polygon boundary (first exit), null if none
function rayPoly(P, px, pz, dx, dz) { let best = null; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i]; const ex = b[0] - a[0], ez = b[1] - a[1]; const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
  const t = ((a[0] - px) * ez - (a[1] - pz) * ex) / den, s = ((a[0] - px) * dz - (a[1] - pz) * dx) / den; if (t > 1e-6 && s >= 0 && s <= 1 && (best === null || t < best)) best = t; } return best; }
const triIn = (px, pz, ax, az, bx, bz, cx, cz) => { const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az); return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); };

class Grid { constructor(C) { this.C = C; this.m = new Map(); }
  add(o, x0, z0, x1, z1) { const C = this.C; for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const k = i * 65536 + j; let l = this.m.get(k); if (!l) this.m.set(k, l = []); l.push(o); } }
  near(x0, z0, x1, z1, f) { const C = this.C; const seen = new Set(); for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const l = this.m.get(i * 65536 + j); if (l) for (const o of l) { if (seen.has(o)) continue; seen.add(o); if (f(o)) return true; } } return false; } }
const ext = (R, e = 0) => { const ex = Math.abs(Math.cos(R.a)) * R.hl + Math.abs(Math.sin(R.a)) * R.hw + e, ez = Math.abs(Math.sin(R.a)) * R.hl + Math.abs(Math.cos(R.a)) * R.hw + e; return [R.x - ex, R.z - ez, R.x + ex, R.z + ez]; };
const recRect = (b) => ({ x: b[0], z: b[2], a: b[6], hl: b[3] / 2, hw: b[5] / 2 }); // body record
const flatRect = (f) => ({ x: f[0], z: f[1], a: f[4], hl: f[2] / 2, hw: f[3] / 2 }); // flat record (drive / apron / deck)

// ---------------------------------------------------------------- prep (before attachFabric frees the chunk records) ----
// lots: fab.lots captured before curbPass released it. Marks each house record with its look (rec.hs, read by attachFabric as
// the fractional part of aK.x) and keeps only what the lazy per-house build needs.
export function prepHouses(fab, lots) {
  const S = { houses: 0, looks: [0, 0, 0, 0], ms: 0 }; if (HOUSES_OFF || !fab || !lots || !lots.length) return null; const T0 = performance.now();
  const K = { fab, H: [], hg: new Grid(32), bodies: new Grid(32), trunks: new Grid(16), pave: new Grid(32), decks: new Grid(32), walk: new Grid(16), built: new Map(), colCells: new Map(), cellDone: new Set(), stats: S, src: new Map() };
  // the chunk record arrays are only referenced here (attachFabric drops the chunk's handle, not the arrays); each 640 m chunk is
  // filed into the test grids the first time a house near it is built (load cost: this loop only)
  for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue; const kx = Math.floor(ch.cx / 640), kz = Math.floor(ch.cz / 640);
    K.src.set(kx * 65536 + kz, { body: I.body, tree: I.tree, palm: I.palm, lamp: I.lamp, walk: ch.walk && ch.walk.p ? ch.walk.p : null, wn: ch.walk ? ch.walk.n : 0, lots: [], done: false }); }
  const srcAt = (x, z) => K.src.get(Math.floor(x / 640) * 65536 + Math.floor(z / 640));
  for (const LT of lots) { const Hr = LT.house; if (!Hr || Hr.gone) continue;
    const roof = LT.roof && !LT.roof.gone ? LT.roof : null; let look;
    if (!roof) look = 3; else { const c = roof; look = c[7] - c[9] > 0.25 ? 0 : c[7] > 0.78 ? 2 : 1; }
    Hr.hs = (look + 1) * 0.1; S.looks[look]++;
    const L = { house: Hr, roof, yard: LT.yard, verge: LT.verge, dock: LT.dock, quad: LT.quad, ftree: LT.ftree, btree: LT.btree, deck: LT.deck && !LT.deck.gone ? LT.deck : null, canal: LT.canal, front: LT.front };
    const sc = srcAt(Hr[0], Hr[2]); if (sc) sc.lots.push(L);
    const i = K.H.length; K.H.push({ LT: L, look }); K.hg.add(i, Hr[0], Hr[2], Hr[0], Hr[2]); S.houses++; }
  S.ms = Math.round(performance.now() - T0); return K; }
function indexChunk(K, c) { c.done = true;
  for (const b of c.body) { if (b.gone) continue; const R = recRect(b); R.rec = b; const e = ext(R); K.bodies.add(R, ...e); }
  for (const t of c.tree) { if (t.gone) continue; const r = 0.24 * (0.75 + t[2] * 0.12) + 0.05; const o = { x: t[0], z: t[1], r, canopy: t[2], top: t[3] }; K.trunks.add(o, t[0] - r, t[1] - r, t[0] + r, t[1] + r); }
  for (const p of c.palm) { if (p.gone) continue; const r = 0.24 * (p[2] / 10) + 0.07; const o = { x: p[0], z: p[1], r, palm: true }; K.trunks.add(o, p[0] - r, p[1] - r, p[0] + r, p[1] + r); }
  for (const l of c.lamp) { const o = { x: l[0], z: l[1], r: 0.14 }; K.trunks.add(o, l[0] - 0.14, l[1] - 0.14, l[0] + 0.14, l[1] + 0.14); }
  if (c.walk) { const P = c.walk; for (let v = 0; v + 3 < c.wn; v += 4) { const q = new Float32Array(12); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 4; k++) { const x = P[(v + k) * 3], z = P[(v + k) * 3 + 2]; q[k * 2] = x; q[k * 2 + 1] = z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } q[8] = x0; q[9] = z0; q[10] = x1; q[11] = z1; K.walk.add(q, x0, z0, x1, z1); } }
  for (const L of c.lots) { for (const f of [L.yard, L.verge, L.dock]) if (f && !f.gone) { const R = flatRect(f); K.pave.add(R, ...ext(R)); }
    if (L.deck) { const R = flatRect(L.deck); K.decks.add(R, ...ext(R)); } }
  c.body = c.tree = c.palm = c.lamp = c.walk = c.lots = null; }
// file every chunk within 60 m of (x, z) (records near a chunk border reach into the next one; lot items stay < 30 m from the house)
function ensureIdx(K, x, z) { const M = 60; for (let i = Math.floor((x - M) / 640); i <= Math.floor((x + M) / 640); i++) for (let j = Math.floor((z - M) / 640); j <= Math.floor((z + M) / 640); j++) { const c = K.src.get(i * 65536 + j); if (c && !c.done) indexChunk(K, c); } }

// ---------------------------------------------------------------- placement tests ----
function walkHit(K, x, z) { let hit = false; K.walk.near(x, z, x, z, (q) => { if (x < q[8] || x > q[10] || z < q[9] || z > q[11]) return false; if (triIn(x, z, q[0], q[1], q[2], q[3], q[4], q[5]) || triIn(x, z, q[0], q[1], q[4], q[5], q[6], q[7])) { hit = true; return true; } return false; }); return hit; }
function rectOnWalk(K, R) { const [u, v] = axes(R.a); for (let a = -1; a <= 1.0001; a += 0.5) for (let b = -1; b <= 1.0001; b += 1) { const x = R.x + u[0] * a * (R.hl + 0.1) + v[0] * b * (R.hw + 0.1), z = R.z + u[1] * a * (R.hl + 0.1) + v[1] * b * (R.hw + 0.1); if (walkHit(K, x, z)) return true; } return false; }
// why a footprint is refused (null = free). opt: { own: house record allowed to touch, pave, deck, quad: lot outline }
function blocked(K, R, opt) {
  if (opt.quad) for (const [x, z] of corners(R, 0.05)) if (!inPoly(opt.quad, x, z)) return 'lot';
  const e = ext(R, 0.6);
  if (K.bodies.near(...e, (B) => B.rec !== opt.own && obbOverlap(R, B, 0.05))) return 'body';
  if (K.trunks.near(...e, (t) => circRect(t.x, t.z, t.r + 0.15, R))) return 'trunk';
  if (!opt.pave && K.pave.near(...e, (P) => obbOverlap(R, P, 0.15))) return 'pave';
  if (!opt.deck && K.decks.near(...e, (P) => obbOverlap(R, P, 0.1))) return 'deck';
  if (rectOnWalk(K, R)) return 'walk';
  if (opt.mine) for (const M of opt.mine) if (obbOverlap(R, M, 0.05)) return 'self';
  return null; }

// ---------------------------------------------------------------- per-house build ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function box(out, x, y0, z, sx, sy, sz, a, c, kind, seed) { _q.setFromAxisAngle(_Y, a); _m.compose(_v.set(x, y0, z), _q, _s.set(sx, sy, sz)); const e = _m.elements; for (let k = 0; k < 16; k++) out.push(e[k]); out.push(c[0], c[1], c[2], kind, seed); }
const TRIM = { 0: [0.95, 0.92, 0.84], 1: [0.42, 0.33, 0.24], 2: [0.97, 0.97, 0.95], 3: [0.16, 0.16, 0.17] };
const DOORS = [[0.14, 0.32, 0.34], [0.12, 0.17, 0.30], [0.40, 0.25, 0.15], [0.10, 0.10, 0.11], [0.55, 0.14, 0.12], [0.93, 0.93, 0.90], [0.28, 0.40, 0.30]];
const GDOOR = [[0.96, 0.95, 0.92], [0.90, 0.88, 0.82], [0.46, 0.32, 0.21], [0.22, 0.22, 0.23]];
const BINS = [[0.16, 0.30, 0.20], [0.22, 0.23, 0.24], [0.12, 0.26, 0.52], [0.30, 0.31, 0.33]];
const MAILC = [[0.08, 0.08, 0.09], [0.93, 0.93, 0.92], [0.62, 0.63, 0.64]];
const FENCE = { 0: [0.88, 0.84, 0.76], 1: [0.62, 0.50, 0.36], 2: [0.96, 0.96, 0.94], 3: [0.13, 0.13, 0.14] };
const CAGE = [0.24, 0.22, 0.20], SCREEN = [0.18, 0.19, 0.20];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

const pack = (S, S1, F, F1, FS, cols, why) => ({ S: new Float32Array(S), S1: new Float32Array(S1), F: new Float32Array(F), F1: new Float32Array(F1), FS: new Float32Array(FS), cols, why });
function buildHouse(K, i) {
  const D = K.H[i]; const LT = D.LT; ensureIdx(K, LT.house[0], LT.house[2]); const H = LT.house, look = D.look; const S = [], F = [], S1 = [], F1 = [], FS = [], cols = [], why = {}; let tS = S, tF = F; const near = (on) => { tS = on ? S1 : S; tF = on ? F1 : F; }; const seed = H[11]; const r = (k) => hh(seed, k); // lod 1 (near(true)): only within NEAR m
  const C = [H[0], H[2]], w = H[3], h = H[4], d = H[5], ang = H[6]; const [U, V] = axes(ang); const wall = [H[7], H[8], H[9]]; const trim = TRIM[look];
  const own = H; const quad = LT.quad; const mine = [];
  const refuse = (k) => { why[k] = (why[k] || 0) + 1; return null; };
  const tryPlace = (R, opt = {}, tag = '') => { const b = blocked(K, R, { own, quad, mine, ...opt }); if (b) return refuse(tag + ':' + b); mine.push(R); return R; };
  // front face: the one the driveway leads to (outward normal closest to the street)
  const Y = LT.yard; let nIn = null, E = null;
  if (Y) { const [, z] = axes(Y[4]); const sg = (C[0] - Y[0]) * z[0] + (C[1] - Y[1]) * z[1] >= 0 ? 1 : -1; nIn = [z[0] * sg, z[1] * sg]; E = [Y[0] + nIn[0] * Y[3] / 2, Y[1] + nIn[1] * Y[3] / 2]; }
  else if (LT.front) { const dx = C[0] - LT.front[0], dz = C[1] - LT.front[1], l = Math.hypot(dx, dz) || 1; nIn = [dx / l, dz / l]; }
  if (!nIn) return pack(S, S1, F, F1, FS, cols, why);
  const faces = [[V, U, d / 2, w / 2], [[-V[0], -V[1]], [-U[0], -U[1]], d / 2, w / 2], [U, [-V[0], -V[1]], w / 2, d / 2], [[-U[0], -U[1]], V, w / 2, d / 2]];
  let fi = 0, best = -2; faces.forEach((f, k) => { const s = -(f[0][0] * nIn[0] + f[0][1] * nIn[1]); if (s > best) { best = s; fi = k; } });
  const [N, T, Df, Lf] = faces[fi]; const fa = Math.atan2(-T[1], T[0]); // box yaw whose local x runs along T
  const P = (t, o) => [C[0] + T[0] * t + N[0] * (Df + o), C[1] + T[1] * t + N[1] * (Df + o)];
  const bx = (out, t, o, y0, st, sy, so, c, kind, sd = seed) => { const p = P(t, o); box(out, p[0], y0, p[1], st, sy, so, fa, c, kind, sd); };
  const rect = (t, o, st, so) => { const p = P(t, o); return { x: p[0], z: p[1], a: fa, hl: st / 2, hw: so / 2 }; };
  const col = (R, hgt, k) => cols.push({ x: R.x, z: R.z, a: R.a, hl: R.hl, hw: R.hw, h: hgt, k });

  // ---- roof edge: fascia + gutters + downspouts (hip) / parapet + coping + scupper (flat)
  const R0 = LT.roof;
  if (R0) { const rw = R0[3], rd = R0[5], ra = R0[6], y = R0[1]; const [ru, rv] = axes(ra); const gc = look === 1 ? [0.36, 0.30, 0.24] : [0.95, 0.95, 0.93];
    for (const sg of [-1, 1]) { box(tF, R0[0] + rv[0] * sg * (rd / 2 - 0.02), y - 0.2, R0[2] + rv[1] * sg * (rd / 2 - 0.02), rw, 0.22, 0.05, ra, trim, 7, seed);
      box(tF, R0[0] + ru[0] * sg * (rw / 2 - 0.02), y - 0.2, R0[2] + ru[1] * sg * (rw / 2 - 0.02), 0.05, 0.22, rd - 0.02, ra, trim, 7, seed);
      box(tF, R0[0] + rv[0] * sg * (rd / 2 + 0.07), y - 0.2, R0[2] + rv[1] * sg * (rd / 2 + 0.07), rw + 0.1, 0.13, 0.13, ra, gc, 7, seed); }
    // downspouts at the two front corners: elbow from the gutter back to the wall, then down the wall
    near(true); for (const sg of [-1, 1]) { const t = sg * (Lf - 0.18); const over = Math.max(0.1, (fi < 2 ? rd - d : rw - w) / 2);
      bx(tF, t, over / 2 - 0.02, y - 0.42, 0.09, 0.09, over + 0.05, gc, 7); bx(tF, t, 0.06, 0.05, 0.09, y - 0.42, 0.09, gc, 7); } near(false);
  } else { const pc = mul(wall, 1.03), cap = look === 3 ? [0.86, 0.86, 0.84] : trim;
    for (const sg of [-1, 1]) { box(tS, C[0] + V[0] * sg * (d / 2 - 0.1), h, C[1] + V[1] * sg * (d / 2 - 0.1), w, 0.55, 0.2, ang, pc, 7, seed); box(tS, C[0] + U[0] * sg * (w / 2 - 0.1), h, C[1] + U[1] * sg * (w / 2 - 0.1), 0.2, 0.55, d - 0.4, ang, pc, 7, seed);
      box(tF, C[0] + V[0] * sg * (d / 2 - 0.1), h + 0.55, C[1] + V[1] * sg * (d / 2 - 0.1), w + 0.1, 0.07, 0.3, ang, cap, 7, seed); box(tF, C[0] + U[0] * sg * (w / 2 - 0.1), h + 0.55, C[1] + U[1] * sg * (w / 2 - 0.1), 0.3, 0.07, d - 0.1, ang, cap, 7, seed); }
    // scupper + leader on the back corner, and a packaged rooftop unit (modern)
    near(true); { const t = (r(3) < 0.5 ? -1 : 1) * (Lf - 0.3); bx(tF, t, -2 * Df + -0.12, h - 0.3, 0.3, 0.22, 0.3, cap, 7); bx(tF, t, -2 * Df - 0.08, 0.05, 0.1, h - 0.3, 0.1, [0.6, 0.6, 0.6], 7); } near(false);
    { const p = [C[0] + T[0] * (r(4) - 0.5) * Lf * 0.6 - N[0] * Df * 0.3, C[1] + T[1] * (r(4) - 0.5) * Lf * 0.6 - N[1] * Df * 0.3]; box(tS, p[0], h, p[1], 1.5, 0.9, 1.1, fa, [0.74, 0.75, 0.76], 10, seed); }
  }
  // ---- stucco base (water table), slightly proud of the wall
  box(tF, C[0], 0, C[1], w + 0.07, 0.4, d + 0.07, ang, mul(wall, 0.8), 7, seed);

  // ---- garage door at the end of the driveway
  let tg = null, gw = 0;
  if (E) { const et = (E[0] - C[0]) * T[0] + (E[1] - C[1]) * T[1], eo = (E[0] - C[0]) * N[0] + (E[1] - C[1]) * N[1] - Df;
    gw = r(5) < 0.3 ? 2.9 : 2.6; if (Math.abs(eo) < 1.2 && Math.abs(et) <= Lf - 0.4) { tg = Math.max(-Lf + gw / 2 + 0.25, Math.min(Lf - gw / 2 - 0.25, et)); } else refuse('garage'); }
  if (tg !== null) { const gh = h > 5 ? 2.3 : 2.15; const gc = GDOOR[look === 0 ? (r(6) < 0.5 ? 0 : 2) : look === 3 ? 3 : r(6) < 0.7 ? 0 : 1];
    bx(tF, tg, 0.025, 0.02, gw + 0.26, gh + 0.14, 0.05, trim, 7); bx(tF, tg, 0.06, 0.03, gw, gh, 0.06, gc, 9); near(true); bx(tF, tg, 0.1, 0.42, 0.32, 0.05, 0.05, [0.3, 0.3, 0.31], 7); near(false);
    bx(tF, tg, 0.03, gh + 0.32, gw + 0.6, 0.18, 0.08, trim, 7); } // header band
  // ---- front door, frame, plaque, lantern; porch slab + step; columns + canopy (地中海 / 海岸 / some 牧场)
  const sgd = tg === null ? (r(7) < 0.5 ? -1 : 1) : -Math.sign(tg || 1); const dw = look === 0 && r(8) < 0.45 ? 1.65 : 0.95; const pw = dw + 1.5;
  let td = tg === null ? sgd * Math.min(Lf * 0.3, Math.max(0, Lf - pw / 2 - 0.3)) : tg + sgd * (gw / 2 + 0.9 + pw / 2);
  if (Math.abs(td) > Lf - pw / 2 - 0.15) td = sgd * (Lf - pw / 2 - 0.15); if (tg !== null && Math.abs(td - tg) < gw / 2 + pw / 2 + 0.3) td = null;
  if (td === null) refuse('door');
  if (td !== null) { const dc = DOORS[Math.floor(r(9) * DOORS.length)];
    bx(tF, td, 0.03, 0.18, dw + 0.32, 2.38, 0.06, trim, 7); bx(tF, td, 0.06, 0.2, dw, 2.15, 0.08, dc, 13);
    near(true); bx(tF, td + sgd * -1 * (dw / 2 + 0.42), 0.05, 1.62, 0.44, 0.16, 0.04, look === 3 ? [0.9, 0.9, 0.88] : [0.08, 0.08, 0.09], 11);
    bx(tF, td + sgd * (dw / 2 + 0.36), 0.12, 1.78, 0.18, 0.34, 0.16, [0.12, 0.11, 0.10], 7); near(false);
    let pd = look === 2 ? 2.0 : look === 0 ? 1.7 : 1.4; let Rp = null;
    for (const dd of [pd, 1.1]) { const R = rect(td, dd / 2 + 0.2, pw, dd + 0.4); if (!blocked(K, R, { own, quad, mine, pave: false })) { Rp = R; pd = dd; break; } }
    if (!Rp) refuse('porch'); else { mine.push(Rp);
      bx(tF, td, pd / 2, 0, pw, 0.17, pd, [0.80, 0.78, 0.74], 7); bx(tF, td, pd + 0.18, 0, pw - 0.3, 0.09, 0.38, [0.78, 0.76, 0.72], 7);
      const cols3 = look === 0 || look === 2 || (look === 1 && r(10) < 0.4);
      if (cols3 && pd > 1.3) { const cy = Math.min(2.75, h - (R0 ? 0.5 : 0.35)); const cc = look === 2 ? [0.96, 0.96, 0.94] : look === 0 ? mul(wall, 1.02) : trim; const cw = look === 0 ? 0.32 : 0.2;
        for (const sg of [-1, 1]) { const t = td + sg * (pw / 2 - 0.2); bx(tS, t, pd - 0.2, 0.17, cw, cy - 0.17, cw, cc, 7); col(rect(t, pd - 0.2, cw, cw), cy, 'column'); }
        bx(tS, td, (pd + 0.15) / 2, cy, pw + 0.3, 0.2, pd + 0.15, look === 0 ? mul(wall, 0.97) : trim, 7);
        if (R0 && look !== 3) bx(tS, td, (pd + 0.15) / 2, cy + 0.2, pw + 0.4, 0.22, pd + 0.3, [R0[7] * 0.95, R0[8] * 0.95, R0[9] * 0.95], 7); }
      // front walk: from the step to the driveway edge (L-free: straight along the face)
      if (tg !== null && Y) { const tEdge = tg + sgd * (Y[2] / 2 - 0.05); const tFrom = td - sgd * 0.0; const L = Math.abs(tFrom - tEdge); const o = pd + 0.37 + 0.55;
        if (L > 0.6) { const Rw = rect((tFrom + tEdge) / 2, o, L, 0.9); if (!blocked(K, Rw, { own, quad, mine: [], pave: true, deck: false })) { near(true); bx(tF, (tFrom + tEdge) / 2, o, 0, L, 0.035, 0.9, [0.82, 0.80, 0.76], 7); near(false); } else refuse('walkpath'); } } } }
  // ---- driveway edge bands + saw-cut joints
  if (Y) { near(true); const [yu, yv] = axes(Y[4]); for (const sg of [-1, 1]) box(tF, Y[0] + yu[0] * sg * (Y[2] / 2 - 0.07), 0, Y[1] + yu[1] * sg * (Y[2] / 2 - 0.07), 0.14, 0.035, Y[3] - 0.15, Y[4], [0.83, 0.82, 0.78], 7, seed);
    for (let s = -Y[3] / 2 + 3; s < Y[3] / 2 - 1; s += 3) box(tF, Y[0] + yv[0] * s, 0, Y[1] + yv[1] * s, Y[2] - 0.3, 0.022, 0.03, Y[4], [0.42, 0.42, 0.41], 7, seed); near(false); }
  // ---- side yards: fence + gate (behind the front plane), bins in front of it on the garage side, AC unit behind it
  const sideG = tg === null ? -sgd : Math.sign(tg || 1); const gap = {};
  for (const sg of [-1, 1]) { const p0 = P(sg * Lf, -2.2); const g = rayPoly(quad, p0[0] + T[0] * sg * 0.02, p0[1] + T[1] * sg * 0.02, T[0] * sg, T[1] * sg); gap[sg] = g === null ? 0 : g; }
  for (const sg of [-1, 1]) { const g = gap[sg] - 0.12; if (g < 0.9 || g > 9) { refuse('fencegap'); continue; }
    const t0 = sg * (Lf + 0.03), t1 = sg * (Lf + 0.03 + g); const R = rect((t0 + t1) / 2, -2.2, g, 0.08); if (!tryPlace(R, {}, 'fence')) continue;
    const fc = FENCE[look]; const fh = look === 3 ? 1.5 : 1.6;
    if (g >= 1.6) { const gwd = Math.min(1.1, g - 0.4); const tg0 = t0 + sg * 0.05, tg1 = tg0 + sg * gwd; bx(tS, (tg0 + tg1) / 2, -2.2, 0, gwd, fh - 0.05, 0.06, mul(fc, 0.9), 14, seed + 0.37);
      bx(tS, (tg1 + t1) / 2, -2.2, 0, Math.abs(t1 - tg1), fh, 0.08, fc, 14); bx(tS, tg1 + sg * 0.05, -2.2, 0, 0.1, fh + 0.08, 0.1, fc, 7); }
    else bx(tS, (t0 + t1) / 2, -2.2, 0, g, fh, 0.08, fc, 14);
    col(R, fh, 'fence'); }
  if (gap[sideG] - 0.1 >= 0.95) { // two roll-out carts against the wall, in front of the fence
    const t = sideG * (Lf + 0.05 + 0.4); const R = rect(t, -1.2, 0.72, 1.42);
    if (tryPlace(R, {}, 'bins')) { for (const [k, o] of [[0, -0.85], [1, -1.55]]) { const bc = BINS[(Math.floor(r(11) * 2) * 2 + k) % 4]; bx(tS, t, o, 0, 0.58, 0.96, 0.66, bc, 7, seed + k); bx(tS, t, o + 0.02, 0.96, 0.62, 0.06, 0.72, mul(bc, 0.85), 7, seed + k); }
      col(R, 1.05, 'bins'); } }
  { let placed = false; for (const sg of [-sideG, sideG]) { if (gap[sg] - 0.1 < 1.25) continue; for (const o of [-2 * Df * 0.55, -2 * Df * 0.75, -2 * Df * 0.35]) { const t = sg * (Lf + 0.08 + 0.55); const R = rect(t, o, 1.0, 1.0);
      if (!tryPlace(R, {}, 'ac')) continue; near(true); bx(tF, t, o, 0, 1.1, 0.08, 1.1, [0.72, 0.71, 0.68], 7); near(false); bx(tS, t, o, 0.08, 0.86, 0.78, 0.86, [0.80, 0.80, 0.78], 10); col(R, 0.86, 'ac'); placed = true; break; } if (placed) break; }
    if (!placed && R0) { // back wall
      const t = (r(12) - 0.5) * Lf; const R = rect(t, -2 * Df - 0.6, 1.0, 1.0); if (tryPlace(R, {}, 'ac')) { near(true); bx(tF, t, -2 * Df - 0.6, 0, 1.1, 0.08, 1.1, [0.72, 0.71, 0.68], 7); near(false); bx(tS, t, -2 * Df - 0.6, 0.08, 0.86, 0.78, 0.86, [0.80, 0.80, 0.78], 10); col(R, 0.86, 'ac'); placed = true; } }
    if (!placed && R0) refuse('ac'); }
  // ---- mailbox at the street end of the driveway, on the lawn (0.55 m inside the sidewalk's inner edge)
  if (Y) { const [yu] = axes(Y[4]); const Ns = [Y[0] - nIn[0] * Y[3] / 2, Y[1] - nIn[1] * Y[3] / 2]; let done = false;
    const along = (yu[0] * T[0] + yu[1] * T[1]) >= 0 ? 1 : -1;
    for (const sg of [sideG, -sideG]) { const s = sg * along; const x = Ns[0] + nIn[0] * 0.6 + yu[0] * s * (Y[2] / 2 + 0.55), z = Ns[1] + nIn[1] * 0.6 + yu[1] * s * (Y[2] / 2 + 0.55);
      const pil = look === 0 && r(13) < 0.6; const R = { x, z, a: fa, hl: pil ? 0.25 : 0.16, hw: pil ? 0.25 : 0.28 }; if (!inPoly(quad, x - nIn[0] * 0.6, z - nIn[1] * 0.6) && !inPoly(quad, x, z)) { refuse('mail:lot'); continue; } if (!tryPlace(R, { quad: null }, 'mail')) continue; // the frame-built lot outline can sit up to ~1 m behind the re-laid sidewalk: the strip in between is this lot's lawn
      if (pil) { box(tS, x, 0, z, 0.46, 1.25, 0.46, fa, mul(wall, 0.98), 7, seed); box(tS, x, 1.25, z, 0.54, 0.08, 0.54, fa, trim, 7, seed); box(tS, x - nIn[0] * 0.2, 0.85, z - nIn[1] * 0.2, 0.3, 0.06, 0.08, fa, [0.12, 0.12, 0.12], 7, seed); }
      else { const mc = MAILC[Math.floor(r(14) * 3)]; box(tS, x, 0, z, 0.09, 1.02, 0.09, fa, look === 2 ? [0.95, 0.95, 0.93] : [0.14, 0.14, 0.15], 7, seed); box(tS, x, 1.0, z, 0.24, 0.26, 0.52, fa, mc, 7, seed); near(true); box(tS, x + T[0] * 0.13, 1.12, z + T[1] * 0.13, 0.02, 0.16, 0.05, fa, [0.75, 0.12, 0.1], 7, seed); near(false); }
      col(R, 1.25, 'mailbox'); done = true; break; }
    if (!done) refuse('mailbox'); }
  // ---- pool screen enclosure (some pools): flat-top aluminium frame, dithered screens (no shadow)
  if (LT.deck && r(15) < (LT.canal ? 0.55 : 0.42)) { const Dk = LT.deck; const da = Dk[4]; const [du, dv] = axes(da); const hl = Dk[2] / 2 - 0.05, hw = Dk[3] / 2 - 0.05; const Rc = { x: Dk[0], z: Dk[1], a: da, hl, hw };
    const houseGap = (() => { let g = 1e9; for (const [x, z] of corners(Rc)) { const rx = x - C[0], rz = z - C[1]; const la = Math.abs(rx * U[0] + rz * U[1]) - w / 2, lw = Math.abs(rx * V[0] + rz * V[1]) - d / 2; g = Math.min(g, Math.max(la, lw)); } return g; })();
    let ht = 3.2; if (houseGap < 0.7 && R0) ht = Math.min(ht, h - 0.15); let ok = ht >= 2.6;
    if (ok) { const e = ext(Rc, 0.6); if (K.bodies.near(...e, (B) => B.rec !== own && obbOverlap(Rc, B, 0.05))) { ok = false; refuse('cage:body'); }
      else if (K.trunks.near(...ext(Rc, 6), (t) => circRect(t.x, t.z, t.palm ? t.r + 0.4 : (t.top - 0.27 * t.canopy < ht + 0.3 ? t.canopy + 0.3 : t.r + 0.3), Rc))) { ok = false; refuse('cage:tree'); }
      else if (rectOnWalk(K, Rc)) { ok = false; refuse('cage:walk'); } else for (const [x, z] of corners(Rc, 0.0)) if (!inPoly(quad, x, z)) { ok = false; refuse('cage:lot'); break; } }
    if (ok) { mine.push(Rc); const cp = (a, b) => [Dk[0] + du[0] * a + dv[0] * b, Dk[1] + du[1] * a + dv[1] * b]; const cb = (out, a, b, y0, sa, sy, sb, c, k = 7) => { const p = cp(a, b); box(out, p[0], y0, p[1], sa, sy, sb, da, c, k, seed); };
      // the side facing the house gets the door
      const toH = [C[0] - Dk[0], C[1] - Dk[1]]; const hu = toH[0] * du[0] + toH[1] * du[1], hv = toH[0] * dv[0] + toH[1] * dv[1]; const doorOnB = Math.abs(hv) / hw > Math.abs(hu) / hl; const doorS = doorOnB ? Math.sign(hv) : Math.sign(hu);
      const na = Math.max(1, Math.round(2 * hl / 2.6)), nb = Math.max(1, Math.round(2 * hw / 2.6));
      for (let k = 0; k <= na; k++) for (const sb of [-1, 1]) cb(tS, -hl + 2 * hl * k / na, sb * hw, 0, 0.1, ht, 0.1, CAGE);
      for (let k = 1; k < nb; k++) for (const sa of [-1, 1]) cb(tS, sa * hl, -hw + 2 * hw * k / nb, 0, 0.1, ht, 0.1, CAGE);
      for (const sb of [-1, 1]) { cb(tS, 0, sb * hw, ht - 0.12, 2 * hl, 0.14, 0.12, CAGE); near(true); cb(tS, 0, sb * hw, 0.5, 2 * hl, 0.08, 0.06, CAGE); near(false); }
      for (const sa of [-1, 1]) { cb(tS, sa * hl, 0, ht - 0.12, 0.12, 0.14, 2 * hw, CAGE); near(true); cb(tS, sa * hl, 0, 0.5, 0.06, 0.08, 2 * hw, CAGE); near(false); }
      near(true); for (let k = 1; k < na; k++) cb(tS, -hl + 2 * hl * k / na, 0, ht - 0.1, 0.08, 0.1, 2 * hw, CAGE); near(false);
      // screens (fine mesh: no shadow) on the four sides + top
      for (const sb of [-1, 1]) cb(FS, 0, sb * hw, 0.02, 2 * hl, ht - 0.04, 0.02, SCREEN, 12); for (const sa of [-1, 1]) cb(FS, sa * hl, 0, 0.02, 0.02, ht - 0.04, 2 * hw, SCREEN, 12);
      cb(FS, 0, 0, ht - 0.03, 2 * hl, 0.02, 2 * hw, SCREEN, 12);
      // colliders: four thin walls, a 1 m door gap in the middle of the house side
      for (const sb of [-1, 1]) { if (doorOnB && sb === doorS) { for (const s2 of [-1, 1]) { const L = hl - 0.5; const p = cp(s2 * (0.5 + L / 2), sb * hw); cols.push({ x: p[0], z: p[1], a: da, hl: L / 2, hw: 0.05, h: ht, k: 'cage' }); } }
        else { const p = cp(0, sb * hw); cols.push({ x: p[0], z: p[1], a: da, hl, hw: 0.05, h: ht, k: 'cage' }); } }
      for (const sa of [-1, 1]) { if (!doorOnB && sa === doorS) { for (const s2 of [-1, 1]) { const L = hw - 0.5; const p = cp(sa * hl, s2 * (0.5 + L / 2)); cols.push({ x: p[0], z: p[1], a: da, hl: 0.05, hw: L / 2, h: ht, k: 'cage' }); } }
        else { const p = cp(sa * hl, 0); cols.push({ x: p[0], z: p[1], a: da, hl: 0.05, hw, h: ht, k: 'cage' }); } }
      if (doorOnB) { for (const s2 of [-1, 1]) cb(tS, s2 * 0.5, doorS * hw, 0, 0.1, ht, 0.1, CAGE); cb(tS, 0, doorS * hw, 2.1, 1.0, 0.08, 0.08, CAGE); }
      else { for (const s2 of [-1, 1]) cb(tS, doorS * hl, s2 * 0.5, 0, 0.1, ht, 0.1, CAGE); cb(tS, doorS * hl, 0, 2.1, 0.08, 0.08, 1.0, CAGE); } } }
  return pack(S, S1, F, F1, FS, cols, why);
}

// ---------------------------------------------------------------- colliders (lazy per 32 m house cell) ----
function ensureCell(K, ci, cj) { const key = ci * 65536 + cj; if (K.cellDone.has(key)) return; K.cellDone.add(key); const l = K.hg.m.get(key); if (!l) return;
  for (const i of l) { const b = getBuilt(K, i); fileCols(K, b.cols); } }
function getBuilt(K, i) { let b = K.built.get(i); if (!b) { b = buildHouse(K, i); const kc = K.keptCols && K.keptCols.get(i); if (kc) { b.cols = kc; b._filed = true; } K.built.set(i, b); K.nBuilt = (K.nBuilt || 0) + 1; } return b; }
function fileCols(K, cols) { if (!K.col) return; const C = 8;
  for (const c of cols) { if (c.filed) continue; c.filed = true; const [u] = axes(c.a); const o = { cx: c.x, cz: c.z, ux: u[0], uz: u[1], hl: c.hl, hw: c.hw }; const ex = Math.abs(u[0]) * c.hl + Math.abs(u[1]) * c.hw, ez = Math.abs(u[1]) * c.hl + Math.abs(u[0]) * c.hw;
    const b = { minX: c.x - ex, minZ: c.z - ez, maxX: c.x + ex, maxZ: c.z + ez, h: c.h, tag: 'hkit', k: c.k, o }; const key = Math.floor(c.x / C) * 65536 + Math.floor(c.z / C); let l = K.colCells.get(key); if (!l) K.colCells.set(key, l = []); l.push(b); K.nCols = (K.nCols || 0) + 1; } }
// hook col.query: build the houses of every 32 m cell the query can reach (items stay inside their lot, < 30 m from the house)
export function attachHouseColliders(city) { const fab = city.fabric || (city.region && city.region.fabric); const K = fab && fab.houseKit; const col = city.col; if (!K || !col || col._hkit) return null;
  K.col = col; const q0 = col.query; const E = 3.0, C = 8, HC = 32, REACH = 30; let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const D of K.H) { const H = D.LT.house; bx0 = Math.min(bx0, H[0]); bx1 = Math.max(bx1, H[0]); bz0 = Math.min(bz0, H[2]); bz1 = Math.max(bz1, H[2]); } bx0 -= 70; bz0 -= 70; bx1 += 70; bz1 += 70;
  col.query = function (x, z, r, out = []) { q0.call(this, x, z, r, out); if (x + r < bx0 || x - r > bx1 || z + r < bz0 || z - r > bz1) return out;
    const a0 = Math.floor((x - r - REACH) / HC), a1 = Math.floor((x + r + REACH) / HC), k0 = Math.floor((z - r - REACH) / HC), k1 = Math.floor((z + r + REACH) / HC);
    for (let a = a0; a <= a1; a++) for (let k = k0; k <= k1; k++) if (!K.cellDone.has(a * 65536 + k)) ensureCell(K, a, k);
    const R = r + E; for (let a = Math.floor((x - R) / C); a <= Math.floor((x + R) / C); a++) for (let k = Math.floor((z - R) / C); k <= Math.floor((z + R) / C); k++) { const l = K.colCells.get(a * 65536 + k); if (l) for (let j = 0; j < l.length; j++) { const b = l[j]; if (b.maxX >= x - r && b.minX <= x + r && b.maxZ >= z - r && b.minZ <= z + r) out.push(b); } }
    return out; };
  col._hkit = K; return { lazy: true }; }

// ---------------------------------------------------------------- mesh: one pool refilled around the camera ----
// instance order: [shadow casters | non-casters | screens]. The near shadow cascade draws the casters only (count cut in
// onBeforeShadow), GTAO's normal pass skips the screens (count cut when the override material is in use), the main pass draws all.
// Far cascade: the mesh sits on KIT_LAYER, which the far cascade's shadow camera does not list (main.js) -> 3 draw calls in all.
export function attachHouses(K, scene) { if (!K) return null; const { box: G, body: MAT } = fabKit(); const T0 = performance.now(); const cap = CAP;
  const g = G.clone(); const ak = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2); ak.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aK', ak);
  const m = new THREE.InstancedMesh(g, MAT, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.customDepthMaterial = new THREE.MeshDepthMaterial(); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.userData.hkit = true; m.layers.set(KIT_LAYER); scene.add(m);
  // one zero-scale instance from the first frame on, so its programs (main, GTAO normal, shadow depth) are built with every other
  // program in the first frames (a depth program first built later carries that frame's light counts in its key -> a new program)
  m.instanceMatrix.array.fill(0, 0, 16); m.count = 1; m.visible = true; m.userData.n = [1, 0, 0]; m.userData.warm = 0; let keep = 0;
  m.onBeforeShadow = function () { keep = this.count; this.count = scene.overrideMaterial ? 0 : this.userData.n[0]; this.userData.warm |= 1; }; m.onAfterShadow = function () { this.count = keep; }; // the shadow maps redrawn inside GTAO's normal pass are thrown away: skip
  m.onBeforeRender = function (r, sc, cam, geo, mat) { keep = this.count; if (mat !== MAT) this.count = this.userData.n[0] + this.userData.n[1]; this.userData.warm |= mat === MAT ? 2 : 4; }; m.onAfterRender = function () { this.count = keep; };
  K.mesh = m; K.last = null; K.info = { houses: 0, boxes: 0, tris: 0 }; K.stats.attachMs = Math.round(performance.now() - T0); return K; }
const CAP = 1000, NEAR = 42;
export function updateHouses(K, cam) { if (!K || !K.mesh) return; const p = cam && cam.isObject3D ? cam.position : cam; if (!p) return; const m = K.mesh;
  if ((m.userData.warm & 3) !== 3) return; // until the warm-up instance has been drawn in the shadow and main passes
  if (p.y > 140) { if (m.visible) { m.visible = false; K.last = null; } return; }
  if (K.last && Math.hypot(p.x - K.last[0], p.z - K.last[1]) < 2.5) return; K.last = [p.x, p.z]; const T0 = performance.now();
  const near = []; const R = RAD; K.hg.near(p.x - R, p.z - R, p.x + R, p.z + R, (i) => { const H = K.H[i].LT.house; const dd = Math.hypot(H[0] - p.x, H[2] - p.z); if (dd < R) near.push([dd, i]); return false; });
  near.sort((a, b) => a[0] - b[0]); const list = near.map(([dd, i]) => { const b = getBuilt(K, i); if (!b._filed && K.col) { fileCols(K, b.cols); b._filed = true; } return [dd, b]; });
  const M = m.instanceMatrix.array, Cc = m.instanceColor.array, A = m.geometry.attributes.aK.array; let n = 0; const cnt = [0, 0, 0];
  const put = (a) => { const k = a.length / NF; if (n + k > CAP) return false; for (let j = 0; j < k; j++, n++) { const o = j * NF; M.set(a.subarray(o, o + 16), n * 16); Cc[n * 3] = a[o + 16]; Cc[n * 3 + 1] = a[o + 17]; Cc[n * 3 + 2] = a[o + 18]; A[n * 2] = a[o + 19]; A[n * 2 + 1] = a[o + 20]; } return true; };
  // budget split so the far houses keep their big pieces: casters first (nearest first), then fine pieces, then screens
  const n0 = n; for (const [dd, b] of list) { if (!put(b.S)) break; if (dd < NEAR) put(b.S1); } cnt[0] = n - n0;
  const n1 = n; for (const [dd, b] of list) { if (!put(b.F)) break; if (dd < NEAR) put(b.F1); } cnt[1] = n - n1;
  const n2 = n; for (const [, b] of list) if (!put(b.FS)) break; cnt[2] = n - n2;
  m.count = n; m.userData.n = cnt; m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
  m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, n * 3); m.instanceColor.needsUpdate = true; const ga = m.geometry.attributes.aK; ga.clearUpdateRanges(); ga.addUpdateRange(0, n * 2); ga.needsUpdate = true; m.visible = n > 0;
  K.info = { houses: near.length, boxes: n, casters: cnt[0], fine: cnt[1], screens: cnt[2], tris: n * 12, built: K.built.size, ms: +(performance.now() - T0).toFixed(2) };
  // drop far visual caches (colliders stay filed)
  if (K.built.size > 600) for (const [i, b] of K.built) { const H = K.H[i].LT.house; if (Math.hypot(H[0] - p.x, H[2] - p.z) > 260) { K.built.delete(i); K.keptCols = K.keptCols || new Map(); K.keptCols.set(i, b.cols); } } }
// &houseaudit: build every house now and count what was placed / refused, and check every kit box against the paving / buildings
export function auditHouses(K) { if (!K) return null; const T0 = performance.now(); const R = { houses: K.H.length, looks: K.stats.looks, items: {}, refused: {}, boxesS: 0, boxesF: 0, maxBoxes: 0, colOnWalk: 0, colOnPave: 0, colOnBody: 0, colOnTrunk: 0, colOutLot: 0 };
  for (let i = 0; i < K.H.length; i++) { const b = buildHouse(K, i); const n = (b.S.length + b.S1.length + b.F.length + b.F1.length + b.FS.length) / NF; R.boxesS += (b.S.length + b.S1.length) / NF; R.boxesF += (b.F.length + b.F1.length + b.FS.length) / NF; R.boxesFar = (R.boxesFar || 0) + (b.S.length + b.F.length + b.FS.length) / NF; if (n > R.maxBoxes) R.maxBoxes = n;
    for (const k in b.why) R.refused[k] = (R.refused[k] || 0) + b.why[k];
    const own = K.H[i].LT.house, quad = K.H[i].LT.quad;
    for (const c of b.cols) { R.items[c.k] = (R.items[c.k] || 0) + 1; const Rc = { x: c.x, z: c.z, a: c.a, hl: c.hl, hw: c.hw }; if (rectOnWalk(K, { ...Rc, hl: Rc.hl - 0.1, hw: Math.max(0.01, Rc.hw - 0.1) })) R.colOnWalk++;
      if (K.pave.near(...ext(Rc), (P) => obbOverlap(Rc, P, 0))) R.colOnPave++; if (K.bodies.near(...ext(Rc, 0.5), (B) => B.rec !== own && obbOverlap(Rc, B, -0.01))) R.colOnBody++;
      if (K.trunks.near(...ext(Rc, 0.5), (t) => circRect(t.x, t.z, t.r, Rc))) R.colOnTrunk++; if (c.k !== 'mailbox') for (const [x, z] of corners(Rc)) if (!inPoly(quad, x, z)) { R.colOutLot++; break; } } }
  R.avgBoxes = +((R.boxesS + R.boxesF) / K.H.length).toFixed(1); R.avgFar = +(R.boxesFar / K.H.length).toFixed(1); R.ms = Math.round(performance.now() - T0); return R; }
