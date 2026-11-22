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
// a_housepolish: kit dissolves (ordered dither) over the last 12 m before RAD and the last 7 m before NEAR instead of popping;
//    牧场平房 split into three sub-styles + per-look wall palettes, picked per house to not repeat the neighbours (mixStreet);
//    door centred on a painted window cell (frame + sidelights cover it), number plaque above the door / on the canopy beam and
//    reading left-to-right, lantern on the wall gap, canopy cap and pool-cage top kept under the fascia, mailbox at the walk.
import * as THREE from 'three';
import { fabKit } from './fabric.js';
import { U } from '../../env.js';
import { mulberry } from '../../util.js';
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
    Hr.hs = (look + 1) * 0.1; S.looks[look]++; // sub-style added in mixStreet
    const L = { house: Hr, roof, yard: LT.yard, verge: LT.verge, dock: LT.dock, quad: LT.quad, ftree: LT.ftree, btree: LT.btree, deck: LT.deck && !LT.deck.gone ? LT.deck : null, canal: LT.canal, front: LT.front };
    const sc = srcAt(Hr[0], Hr[2]); if (sc) sc.lots.push(L);
    const i = K.H.length; K.H.push({ LT: L, look, sub: 0 }); K.hg.add(i, Hr[0], Hr[2], Hr[0], Hr[2]); S.houses++; }
  { const t = performance.now(); mixStreet(K); S.mixMs = +(performance.now() - t).toFixed(1); } S.ms = Math.round(performance.now() - T0); return K; }
// a_housepolish: street mix. The look stays tied to the roof (far roof colours unchanged); 牧场平房 (46 %) splits into three
// sub-styles (0 storm-shutter ranch, 1 louvered-shutter ranch, 2 stone-wainscot ranch with dark frames) and every house gets a wall
// colour from its look's palette. Each house picks the (sub, colour) that least repeats its already-placed neighbours (< 26 m),
// scanning the candidates from a seed-hashed start: deterministic, no random draws, no record any bake hashes is read after this.
const PAL = [
  [[0.96, 0.90, 0.78], [0.98, 0.86, 0.72], [0.94, 0.84, 0.66], [0.97, 0.93, 0.84], [0.93, 0.81, 0.69], [0.95, 0.88, 0.80]], // 地中海
  [[0.90, 0.88, 0.82], [0.86, 0.88, 0.84], [0.94, 0.92, 0.86], [0.84, 0.81, 0.73], [0.80, 0.84, 0.88], [0.90, 0.86, 0.74], [0.82, 0.86, 0.78]], // 牧场
  [[0.95, 0.95, 0.93], [0.80, 0.88, 0.92], [0.82, 0.90, 0.84], [0.97, 0.92, 0.76], [0.94, 0.85, 0.80]], // 海岸
  [[0.95, 0.95, 0.94], [0.84, 0.84, 0.83], [0.92, 0.90, 0.86], [0.76, 0.77, 0.78]]]; // 现代
const NSUB = [1, 3, 1, 1];
const keyOf = (D) => D.look * 100 + D.sub * 10 + D.col;
const ND = new Float64Array(64), NJ = new Int32Array(64);
// neighbours of house i within R m, nearest first, into ND / NJ (shared buffers, no allocation); returns the count
function nbrs(K, i, R = 26) { const H = K.H[i].LT.house, x = H[0], z = H[2], C = K.hg.C, m = K.hg.m; let n = 0; // points sit in one cell each: no dedupe needed
  for (let a = Math.floor((x - R) / C); a <= Math.floor((x + R) / C); a++) for (let b = Math.floor((z - R) / C); b <= Math.floor((z + R) / C); b++) { const l = m.get(a * 65536 + b); if (!l) continue;
    for (let k = 0; k < l.length && n < 64; k++) { const j = l[k]; if (j === i) continue; const G = K.H[j].LT.house; const dx = G[0] - x, dz = G[2] - z, d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
      const d = Math.sqrt(d2); let p = n++; while (p > 0 && ND[p - 1] > d) { ND[p] = ND[p - 1]; NJ[p] = NJ[p - 1]; p--; } ND[p] = d; NJ[p] = j; } }
  return n; }
// houses whose two nearest neighbours (< 26 m) share their look + sub-style + wall colour (key: function of a house -> key)
function triples(K, key) { let n = 0; for (let i = 0; i < K.H.length; i++) { if (nbrs(K, i) < 2) continue; const k = key(i); if (key(NJ[0]) === k && key(NJ[1]) === k) n++; } return n; }
function mixStreet(K) { const S = K.stats; const cq = (c) => Math.round(c[0] * 20) * 441 + Math.round(c[1] * 20) * 21 + Math.round(c[2] * 20);
  if (AUDIT) S.triplesBefore = { look: triples(K, (i) => K.H[i].look), lookColour: triples(K, (i) => K.H[i].look * 1e6 + cq(K.H[i].LT.house.slice(7, 10))) };
  const done = new Uint8Array(K.H.length); S.subs = [0, 0, 0];
  for (let i = 0; i < K.H.length; i++) { const D = K.H[i], H = D.LT.house, P = PAL[D.look], ns = NSUB[D.look]; let nn = 0; const cnt = nbrs(K, i); for (let k = 0; k < cnt; k++) if (done[NJ[k]]) { ND[nn] = ND[k]; NJ[nn] = NJ[k]; nn++; }
    const nc = ns * P.length, h0 = Math.floor(hh(H[11], 41) * nc); let best = 1e9, bs = 0, bc = 0;
    for (let k = 0; k < nc; k++) { const c = (h0 + k) % nc, sub = c % ns, col = Math.floor(c / ns) % P.length; let cost = 0;
      for (let q = 0; q < nn; q++) { const d = ND[q], E = K.H[NJ[q]]; const w = d < 18 ? 1 : 0.5; const same = E.look === D.look && E.sub === sub; if (same) cost += w; if (E.look === D.look && E.col === col) cost += 0.6 * w; if (same && E.col === col) cost += 4 * w; }
      if (cost < best - 1e-6) { best = cost; bs = sub; bc = col; } }
    D.sub = bs; D.col = bc; done[i] = 1; const c = P[bc]; H[7] = c[0]; H[8] = c[1]; H[9] = c[2]; H.hs = (D.look + 1) * 0.1 + bs * 0.02; if (D.look === 1) S.subs[bs]++; }
  if (AUDIT) S.triplesAfter = { lookSub: triples(K, (i) => K.H[i].look * 10 + K.H[i].sub), lookSubColour: triples(K, (i) => keyOf(K.H[i])) }; }
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
  const C = [H[0], H[2]], w = H[3], h = H[4], d = H[5], ang = H[6]; const [U, V] = axes(ang); const wall = [H[7], H[8], H[9]]; const sub = D.sub || 0;
  const trim = look === 1 && sub === 1 ? TRIM[2] : look === 1 && sub === 2 ? [0.20, 0.17, 0.15] : TRIM[look]; // a_housepolish: 牧场 sub 1 white trim, sub 2 dark bronze
  const own = H; const quad = LT.quad; const mine = []; let porch = null;
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
  if (R0) { const rw = R0[3], rd = R0[5], ra = R0[6], y = R0[1]; const [ru, rv] = axes(ra); const gc = look === 1 && sub !== 1 ? (sub === 2 ? [0.20, 0.17, 0.15] : [0.36, 0.30, 0.24]) : [0.95, 0.95, 0.93];
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
  if (tg !== null) { const gh = h > 5 ? 2.3 : 2.15; const gc = GDOOR[look === 0 ? (r(6) < 0.5 ? 0 : 2) : look === 3 ? 3 : look === 1 && sub === 2 ? (r(6) < 0.5 ? 2 : 3) : r(6) < 0.7 ? 0 : 1];
    bx(tF, tg, 0.025, 0.02, gw + 0.26, gh + 0.14, 0.05, trim, 7); bx(tF, tg, 0.06, 0.03, gw, gh, 0.06, gc, 9); near(true); bx(tF, tg, 0.1, 0.42, 0.32, 0.05, 0.05, [0.3, 0.3, 0.31], 7); near(false);
    bx(tF, tg, 0.03, gh + 0.32, gw + 0.6, 0.18, 0.08, trim, 7); } // header band
  // ---- front door, frame, plaque, lantern; porch slab + step; columns + canopy (地中海 / 海岸 / some 牧场)
  const sgd = tg === null ? (r(7) < 0.5 ? -1 : 1) : -Math.sign(tg || 1); const dw = look === 0 && r(8) < 0.45 ? 1.65 : 0.95; const pw = dw + 1.5;
  let td = tg === null ? sgd * Math.min(Lf * 0.3, Math.max(0, Lf - pw / 2 - 0.3)) : tg + sgd * (gw / 2 + 0.9 + pw / 2);
  if (Math.abs(td) > Lf - pw / 2 - 0.15) td = sgd * (Lf - pw / 2 - 0.15); if (tg !== null && Math.abs(td - tg) < gw / 2 + pw / 2 + 0.3) td = null;
  // a_housepolish: slide the door onto the centre of a painted window cell (fabBody: cells 3.4 m along fu = xz . (-n.z, n.x) + seed * 37,
  // glass 0.952..2.448 m of the cell, frame to ~0.83 m either side of the centre): the 1.86-1.97 m door assembly covers that window
  // (shutters, if any, then flank the door) instead of the frame / lantern cutting half a window; keep the old spot if it does not fit
  if (td !== null) { const ft = [-N[1], N[0]], tf = T[0] * ft[0] + T[1] * ft[1]; const fu = (t) => (C[0] + T[0] * t + N[0] * Df) * ft[0] + (C[1] + T[1] * t + N[1] * Df) * ft[1] + Math.fround(seed) * 37;
    const f0 = fu(td), base = td + (3.4 * Math.round((f0 - 1.7) / 3.4) + 1.7 - f0) / tf; let best = null;
    for (const k of [0, 1, -1]) { const t2 = base + k * 3.4 / tf; if (Math.abs(t2) > Lf - pw / 2 - 0.15) continue; if (tg !== null && (Math.abs(t2 - tg) < gw / 2 + pw / 2 + 0.3 || Math.sign(t2 - tg) !== sgd)) continue; if (blocked(K, rect(t2, 0.75, pw, 1.5), { own, quad, mine, pave: false })) continue; if (best === null || Math.abs(t2 - td) < Math.abs(best - td)) best = t2; }
    if (best !== null) td = best; else refuse('doorsnap'); }
  if (td === null) refuse('door');
  if (td !== null) { const dc = DOORS[Math.floor(r(9) * DOORS.length)];
    const fw = dw < 1.2 ? 1.86 : dw + 0.32; bx(tF, td, 0.03, 0.18, fw, 2.38, 0.06, trim, 7); bx(tF, td, 0.06, 0.2, dw, 2.15, 0.08, dc, 13);
    if (dw < 1.2) { near(true); for (const sg of [-1, 1]) bx(tF, td + sg * (dw / 2 + 0.235), 0.05, 0.3, 0.37, 1.95, 0.07, [0.10, 0.12, 0.14], 7); near(false); } // sidelights
    const plC = look === 3 ? [0.9, 0.9, 0.88] : [0.08, 0.08, 0.09]; let plaque = false; let porchT = null; // placed above the door unless a canopy takes it
    { const tl = porchSpot(seed, P, N, T, Lf, td, tg, gw, sgd, fw, ghalfOf(look, sub)); // lantern on the wall gap past the cell (a_porchlamp: snapped onto a painted gap when the door could not be)
      if (tl !== null) { if (PORCH_OFF || !porchLit(K, i)) { near(true); bx(tF, tl, 0.12, 1.78, 0.18, 0.34, 0.16, [0.12, 0.11, 0.10], 7); near(false); }
        else { porchT = tl; bx(tF, tl, 0.015, 1.75, 0.13, 0.34, 0.03, LMET, 7); bx(tF, tl, 0.11, 1.79, 0.15, 0.25, 0.14, LGLASS, 16); bx(tF, tl, 0.11, 2.04, 0.19, 0.045, 0.17, LMET, 7); } } } // a_porchlamp: lit = plate + self-lit lens (kind 16) + cap, far tier (to RAD)
    let pd = look === 2 ? 2.0 : look === 0 ? 1.7 : 1.4; let Rp = null;
    for (const dd of [pd, 1.1]) { const R = rect(td, dd / 2 + 0.2, pw, dd + 0.4); if (!blocked(K, R, { own, quad, mine, pave: false })) { Rp = R; pd = dd; break; } }
    if (!Rp) { refuse('porch'); near(true); bx(tF, td, 0.05, 2.62, 0.44, 0.16, 0.04, plC, 11); near(false); } else { mine.push(Rp);
      bx(tF, td, pd / 2, 0, pw, 0.17, pd, [0.80, 0.78, 0.74], 7); bx(tF, td, pd + 0.18, 0, pw - 0.3, 0.09, 0.38, [0.78, 0.76, 0.72], 7);
      const cols3 = look === 0 || look === 2 || (look === 1 && (sub === 1 ? r(10) < 0.85 : sub === 0 ? r(10) < 0.3 : false));
      if (cols3 && pd > 1.3) { plaque = true; const cy = Math.min(2.75, R0 ? R0[1] - 0.66 : h - 0.35); /* a_housepolish: cap top <= fascia bottom - 0.02 (was h - 0.5: the cap ran through fascia + gutter) */ const cc = look === 2 ? [0.96, 0.96, 0.94] : look === 0 ? mul(wall, 1.02) : trim; const cw = look === 0 ? 0.32 : 0.2;
        for (const sg of [-1, 1]) { const t = td + sg * (pw / 2 - 0.2); bx(tS, t, pd - 0.2, 0.17, cw, cy - 0.17, cw, cc, 7); col(rect(t, pd - 0.2, cw, cw), cy, 'column'); }
        bx(tS, td, (pd + 0.15) / 2, cy, pw + 0.3, 0.2, pd + 0.15, look === 0 ? mul(wall, 0.97) : trim, 7);
        if (R0 && look !== 3) bx(tS, td, (pd + 0.15) / 2, cy + 0.2, pw + 0.4, 0.22, pd + 0.3, [R0[7] * 0.95, R0[8] * 0.95, R0[9] * 0.95], 7);
        near(true); bx(tF, td, pd + 0.17, cy + 0.02, 0.44, 0.16, 0.04, plC, 11); near(false); }
      if (!plaque) { near(true); bx(tF, td, 0.05, 2.62, 0.44, 0.16, 0.04, plC, 11); near(false); plaque = true; } }
    if (porchT !== null) { const q = P(porchT + Math.sign(td - porchT) * 0.7, 1.15); porch = [q[0], q[1], 4.6, 4.6, fa, Rp ? 0.19 : 0.075]; } // a_porchlamp: pool on the porch slab / walk
    if (Rp) {
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
  // ---- mailbox beside the street end of the driveway, on the lawn 0.45 m behind the sidewalk's inner edge (a_housepolish)
  if (Y) { const [yu] = axes(Y[4]); const Ns = [Y[0] - nIn[0] * Y[3] / 2, Y[1] - nIn[1] * Y[3] / 2]; let done = false;
    const along = (yu[0] * T[0] + yu[1] * T[1]) >= 0 ? 1 : -1;
    for (const sg of [sideG, -sideG]) { const s = sg * along; const bx0 = Ns[0] + yu[0] * s * (Y[2] / 2 + 0.55), bz0 = Ns[1] + yu[1] * s * (Y[2] / 2 + 0.55);
      // a_housepolish: stand it 0.45 m behind the re-laid sidewalk's actual inner edge (probe from 1.5 m inside the yard end out to
      // 2.5 m beyond it), so it sits at the walk on the lawn strip instead of up to ~1.6 m back; no walk found -> the old 0.6 m spot
      let eo = null; for (let o = 1.5; o >= -2.5; o -= 0.1) if (walkHit(K, bx0 + nIn[0] * o, bz0 + nIn[1] * o)) { eo = o + 0.05; break; }
      const mo = eo === null ? 0.6 : eo + 0.45; K.stats.mailEdge = K.stats.mailEdge || [0, 0]; K.stats.mailEdge[eo === null ? 1 : 0]++;
      const x = bx0 + nIn[0] * mo, z = bz0 + nIn[1] * mo;
      const pil = look === 0 && r(13) < 0.6; const R = { x, z, a: fa, hl: pil ? 0.25 : 0.16, hw: pil ? 0.25 : 0.28 }; if (!inPoly(quad, x, z) && !inPoly(quad, x + nIn[0] * 1.6, z + nIn[1] * 1.6)) { refuse('mail:lot'); continue; } if (!tryPlace(R, { quad: null }, 'mail')) continue; // the frame-built lot outline can sit up to ~1 m behind the re-laid sidewalk: the strip in between is this lot's lawn
      if (pil) { box(tS, x, 0, z, 0.46, 1.25, 0.46, fa, mul(wall, 0.98), 7, seed); box(tS, x, 1.25, z, 0.54, 0.08, 0.54, fa, trim, 7, seed); box(tS, x - nIn[0] * 0.2, 0.85, z - nIn[1] * 0.2, 0.3, 0.06, 0.08, fa, [0.12, 0.12, 0.12], 7, seed); }
      else { const mc = MAILC[Math.floor(r(14) * 3)]; box(tS, x, 0, z, 0.09, 1.02, 0.09, fa, look === 2 ? [0.95, 0.95, 0.93] : [0.14, 0.14, 0.15], 7, seed); box(tS, x, 1.0, z, 0.24, 0.26, 0.52, fa, mc, 7, seed); near(true); box(tS, x + T[0] * 0.13, 1.12, z + T[1] * 0.13, 0.02, 0.16, 0.05, fa, [0.75, 0.12, 0.1], 7, seed); near(false); }
      col(R, 1.25, 'mailbox'); done = true; break; }
    if (!done) refuse('mailbox'); }
  // ---- pool screen enclosure (some pools): flat-top aluminium frame, dithered screens (no shadow)
  if (LT.deck && r(15) < (LT.canal ? 0.55 : 0.42)) { const Dk = LT.deck; const da = Dk[4]; const [du, dv] = axes(da); const hl = Dk[2] / 2 - 0.05, hw = Dk[3] / 2 - 0.05; const Rc = { x: Dk[0], z: Dk[1], a: da, hl, hw };
    const houseGap = (() => { let g = 1e9; for (const [x, z] of corners(Rc)) { const rx = x - C[0], rz = z - C[1]; const la = Math.abs(rx * U[0] + rz * U[1]) - w / 2, lw = Math.abs(rx * V[0] + rz * V[1]) - d / 2; g = Math.min(g, Math.max(la, lw)); } return g; })();
    let ht = 3.2; if (houseGap < 0.7 && R0) ht = Math.min(ht, R0[1] - 0.25); else if (houseGap < 0.7) ht = Math.min(ht, h - 0.15); let ok = ht >= 2.6; // a_housepolish: top beam under the fascia
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
  const out = pack(S, S1, F, F1, FS, cols, why); out.porch = porch; return out;
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
  K.mesh = m; K.last = null; K.info = { houses: 0, boxes: 0, tris: 0 }; attachLights(K, scene); K.stats.attachMs = Math.round(performance.now() - T0); return K; }
const CAP = 1000, NEAR = 42, FADE = 12, FADE1 = 7; // a_housepolish: dissolve bands [RAD - FADE, RAD] and [NEAR - FADE1, NEAR] (house distance)
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// writes each kit box's dissolve into the fraction of aK.x (kind - 0.45 * fade; fabBody discards by an ordered dither); aK only
function fadeHouses(K, p, fresh = false) { const m = K.mesh, A = m.geometry.attributes.aK.array, sg = K.segs; let lo = 1e9, hi = -1; K.lastF = [p.x, p.z]; let nf = 0;
  for (let k = 0; k < sg.length; k += 5) { const dd = Math.hypot(sg[k + 2] - p.x, sg[k + 3] - p.z); const f = Math.max(sstep(RAD - FADE, RAD, dd), sg[k + 4] ? sstep(NEAR - FADE1, NEAR, dd) : 0); if (f > 0) nf += sg[k + 1];
    for (let j = sg[k], e = sg[k] + sg[k + 1]; j < e; j++) { const v = Math.round(A[j * 2]) - 0.45 * f; if (fresh || v !== A[j * 2]) { A[j * 2] = v; if (j < lo) lo = j; if (j > hi) hi = j; } } }
  K.fading = nf; if (hi >= lo && !fresh) { const ga = m.geometry.attributes.aK; ga.clearUpdateRanges(); ga.addUpdateRange(lo * 2, (hi - lo + 1) * 2); ga.needsUpdate = true; } }
export function updateHouses(K, cam) { if (!K || !K.mesh) return; const p = cam && cam.isObject3D ? cam.position : cam; if (!p) return; const m = K.mesh;
  if (K.NL) updateLights(K, p); // a_nightfix
  if ((m.userData.warm & 3) !== 3) return; // until the warm-up instance has been drawn in the shadow and main passes
  if (p.y > 140) { if (m.visible) { m.visible = false; K.last = null; } return; }
  const mv = K.last ? Math.hypot(p.x - K.last[0], p.z - K.last[1]) : 1e9;
  if (mv < 2.5) { if (K.segs && Math.hypot(p.x - K.lastF[0], p.z - K.lastF[1]) >= 0.3) fadeHouses(K, p); return; } K.last = [p.x, p.z]; const T0 = performance.now();
  const near = []; const R = RAD; K.hg.near(p.x - R, p.z - R, p.x + R, p.z + R, (i) => { const H = K.H[i].LT.house; const dd = Math.hypot(H[0] - p.x, H[2] - p.z); if (dd < R) near.push([dd, i]); return false; });
  near.sort((a, b) => a[0] - b[0]); const list = near.map(([dd, i]) => { const b = getBuilt(K, i); if (!b._filed && K.col) { fileCols(K, b.cols); b._filed = true; } const H = K.H[i].LT.house; b.hx = H[0]; b.hz = H[2]; return [dd, b]; });
  const segs = []; const seg = (n0, b, tier) => { if (n > n0) segs.push(n0, n - n0, b.hx, b.hz, tier); };
  const M = m.instanceMatrix.array, Cc = m.instanceColor.array, A = m.geometry.attributes.aK.array; let n = 0; const cnt = [0, 0, 0];
  const put = (a) => { const k = a.length / NF; if (n + k > CAP) return false; for (let j = 0; j < k; j++, n++) { const o = j * NF; M.set(a.subarray(o, o + 16), n * 16); Cc[n * 3] = a[o + 16]; Cc[n * 3 + 1] = a[o + 17]; Cc[n * 3 + 2] = a[o + 18]; A[n * 2] = a[o + 19]; A[n * 2 + 1] = a[o + 20]; } return true; };
  // budget split so the far houses keep their big pieces: casters first (nearest first), then fine pieces, then screens
  // segments [start, count, house x, house z, tier] -> fadeHouses dissolves each one by its house's distance (no hard pop at RAD / NEAR)
  const n0 = n; for (const [dd, b] of list) { let q = n; if (!put(b.S)) break; seg(q, b, 0); if (dd < NEAR) { q = n; put(b.S1); seg(q, b, 1); } } cnt[0] = n - n0;
  const n1 = n; for (const [dd, b] of list) { let q = n; if (!put(b.F)) break; seg(q, b, 0); if (dd < NEAR) { q = n; put(b.F1); seg(q, b, 1); } } cnt[1] = n - n1;
  const n2 = n; for (const [, b] of list) { const q = n; if (!put(b.FS)) break; seg(q, b, 0); } cnt[2] = n - n2;
  K.segs = segs; fadeHouses(K, p, true); if (!PORCH_OFF) { K.porchB = []; for (const [, b] of list) if (b.porch) K.porchB.push(b.porch); porchPools(K); } // a_porchlamp
  m.count = n; m.userData.n = cnt; m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
  m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, n * 3); m.instanceColor.needsUpdate = true; const ga = m.geometry.attributes.aK; ga.clearUpdateRanges(); ga.addUpdateRange(0, n * 2); ga.needsUpdate = true; m.visible = n > 0;
  K.info = { houses: near.length, boxes: n, casters: cnt[0], fine: cnt[1], screens: cnt[2], tris: n * 12, built: K.built.size, ms: +(performance.now() - T0).toFixed(2) };
  // drop far visual caches (colliders stay filed)
  if (K.built.size > 600) for (const [i, b] of K.built) { const H = K.H[i].LT.house; if (Math.hypot(H[0] - p.x, H[2] - p.z) > 260) { K.built.delete(i); K.keptCols = K.keptCols || new Map(); K.keptCols.set(i, b.cols); } } }
// &houseaudit: build every house now and count what was placed / refused, and check every kit box against the paving / buildings
export function auditHouses(K) { if (!K) return null; const T0 = performance.now(); PSPOT.onWindow = PSPOT.moved = 0; const R = { houses: K.H.length, looks: K.stats.looks, items: {}, refused: {}, boxesS: 0, boxesF: 0, maxBoxes: 0, colOnWalk: 0, colOnPave: 0, colOnBody: 0, colOnTrunk: 0, colOutLot: 0 };
  for (let i = 0; i < K.H.length; i++) { const b = buildHouse(K, i); const n = (b.S.length + b.S1.length + b.F.length + b.F1.length + b.FS.length) / NF; R.boxesS += (b.S.length + b.S1.length) / NF; R.boxesF += (b.F.length + b.F1.length + b.FS.length) / NF; R.boxesFar = (R.boxesFar || 0) + (b.S.length + b.F.length + b.FS.length) / NF; if (n > R.maxBoxes) R.maxBoxes = n;
    for (const k in b.why) R.refused[k] = (R.refused[k] || 0) + b.why[k]; if (b.porch) R.porchLit = (R.porchLit || 0) + 1;
    const own = K.H[i].LT.house, quad = K.H[i].LT.quad;
    for (const c of b.cols) { R.items[c.k] = (R.items[c.k] || 0) + 1; const Rc = { x: c.x, z: c.z, a: c.a, hl: c.hl, hw: c.hw }; if (rectOnWalk(K, { ...Rc, hl: Rc.hl - 0.1, hw: Math.max(0.01, Rc.hw - 0.1) })) R.colOnWalk++;
      if (K.pave.near(...ext(Rc), (P) => obbOverlap(Rc, P, 0))) R.colOnPave++; if (K.bodies.near(...ext(Rc, 0.5), (B) => B.rec !== own && obbOverlap(Rc, B, -0.01))) R.colOnBody++;
      if (K.trunks.near(...ext(Rc, 0.5), (t) => circRect(t.x, t.z, t.r, Rc))) R.colOnTrunk++; if (c.k !== 'mailbox') for (const [x, z] of corners(Rc)) if (!inPoly(quad, x, z)) { R.colOutLot++; break; } } }
  R.porchSpot = { onWindow: PSPOT.onWindow, moved: PSPOT.moved }; R.lights = prepLights(K) && K.lightStats; R.avgBoxes = +((R.boxesS + R.boxesF) / K.H.length).toFixed(1); R.avgFar = +(R.boxesFar / K.H.length).toFixed(1); R.ms = Math.round(performance.now() - T0); return R; }

// ---------------------------------------------------------------- a_nightfix: house night lights ----
// Garage-side wall lantern on the front face of every house that has a garage door (same spot rule as buildHouse: driveway end
// projected on the front face, the side away from the entry door, so it never meets the door lantern / frame / header band), plus
// on canal lots a lanai lantern on the back wall and a slim dock-light post on the dock. Each is lit or dark per house from its own
// stream mulberry(7421) (three draws per house in K.H order; no existing stream is touched): ~55 % of the garage lanterns, 60 % of the
// back-wall lanterns and 45 % of the dock posts are on. Lit lanterns are kit kind 16 (self-lit lens box on the fabBody program),
// dark ones kind 7; each lit one gets a small pool on the fabric street-lamp pool material (fabKit().glow: same object, same program).
// Two instanced meshes refilled around the camera (every 20 m moved / at dusk): fixtures within LR (dark ones within LRD), pools
// within LR at night only -> +2 draw calls near the houses at night, 0 shader programs, no colliders (wall-mounted; dock posts 0.12 m).
// ?oldanight2 (and ?oldanight): not built.
const NIGHT2_OFF = Q.has('oldanight2') || Q.has('oldanight');
// a_porchlamp: entry-door lantern lit at night (kit kind 16 + a small pool) and garage lanterns in three styles. ?oldporch -> a_nightfix.
const PORCH_OFF = NIGHT2_OFF || Q.has('oldporch');
// the draws, made once in K.H order: mulberry(7421) three per house exactly as a_nightfix drew them (same values, same order), and a
// separate stream mulberry(7431) two per house (porch lantern on/off, garage lantern style); no other stream is touched
function lightDraws(K) { if (K._ld) return K._ld; const n = K.H.length, a = mulberry(7421), b = mulberry(7431); const u = new Float64Array(n * 3), v = new Float64Array(n * 2);
  for (let k = 0; k < n * 3; k++) u[k] = a(); for (let k = 0; k < n * 2; k++) v[k] = b(); return (K._ld = { u, v }); }
// same household, same habit: the porch lantern is on for 85 % of the houses whose garage lantern draw is on, 30 % of the others
function porchLit(K, i) { const { u, v } = lightDraws(K); return u[i * 3] < 0.55 ? v[i * 2] < 0.85 : v[i * 2] < 0.3; }
const LR = 200, LRD = 60, LCAP = 1600, PCAP = 480, LBX = 8; // per light: 2-3 boxes; record: x, z, lit, nBoxes, box[4][LBX], pool [x, z, sx, sz, a, y]
const LGLASS = [1.55, 1.24, 0.86], LOFF = [0.30, 0.29, 0.27], LMET = [0.10, 0.09, 0.08];
function frontFrame(LT) { const H = LT.house, C = [H[0], H[2]], w = H[3], d = H[5]; const [U, V] = axes(H[6]); const Y = LT.yard; let nIn = null, E = null;
  if (Y && !Y.gone) { const [, z] = axes(Y[4]); const sg = (C[0] - Y[0]) * z[0] + (C[1] - Y[1]) * z[1] >= 0 ? 1 : -1; nIn = [z[0] * sg, z[1] * sg]; E = [Y[0] + nIn[0] * Y[3] / 2, Y[1] + nIn[1] * Y[3] / 2]; }
  else if (LT.front) { const dx = C[0] - LT.front[0], dz = C[1] - LT.front[1], l = Math.hypot(dx, dz) || 1; nIn = [dx / l, dz / l]; }
  if (!nIn) return null;
  const faces = [[V, U, d / 2, w / 2], [[-V[0], -V[1]], [-U[0], -U[1]], d / 2, w / 2], [U, [-V[0], -V[1]], w / 2, d / 2], [[-U[0], -U[1]], V, w / 2, d / 2]];
  let fi = 0, best = -2; faces.forEach((f, k) => { const s = -(f[0][0] * nIn[0] + f[0][1] * nIn[1]); if (s > best) { best = s; fi = k; } });
  const [N, T, Df, Lf] = faces[fi]; return { C, N, T, Df, Lf, fa: Math.atan2(-T[1], T[0]), E }; }
// a wall lantern goes on the gap between two painted window cells (fabBody: cells 3.4 m along fu = xz . (-n.z, n.x) + seed * 37, glass
// 0.952..2.448 m of the cell -> the gap is centred on fu = 0 mod 3.4, 1.9 m wide), the nearest gap to t0 that ok() accepts, else none
function gapSnap(seed, Pw, Nw, Tw, t0, ok) { const ft = [-Nw[1], Nw[0]], tf = Tw[0] * ft[0] + Tw[1] * ft[1]; if (Math.abs(tf) < 0.5) return null;
  const fu = (t) => { const p = Pw(t); return p[0] * ft[0] + p[1] * ft[1] + Math.fround(seed) * 37; }; const f0 = fu(t0); const base = t0 + (3.4 * Math.round(f0 / 3.4) - f0) / tf; let best = null;
  for (const k of [0, 1, -1, 2, -2]) { const t = base + k * 3.4 / tf; if (ok(t) && (best === null || Math.abs(t - t0) < Math.abs(best - t0))) best = t; } return best; }
// a_porchlamp: garage lanterns in three styles, picked per house (v2 of mulberry(7431)) among the ones that fit:
//  over  - over the header band (needs eave room): one centred coach lantern, or (40 % of these, the rest of the same draw)
//          a pair at +-0.3 door widths                                                                             weight 0.35
//  twin  - a pair flanking the door, 0.27-0.95 m past the trim on each side                                 weight 0.40
//  wall  - one lantern on the nearest painted window gap beside the door (away side first, then door side)  weight 0.25
// a wall-mounted lantern (0.19 m wide, 1.77-2.13 m up) must sit in a painted window gap with room for its width (gap half-width by
// look: louvred shutters 0.125 m, accordion shutters 0.55 m, plain 0.6 m around fu = 0 mod 3.4, same cells as fabBody), stay 0.37 m
// inside the wall end (downspout), clear of the garage trim, and clear of every spot the entry door can take in buildHouse (its
// unsnapped spot and each snap candidate, since the porch test that picks between them needs the full lot index): door frame,
// both possible entry-lantern spots (+0.5 m), and a low canopy (cap under 2.2 m).
// half-width of the painted window gap (around fu = 0 mod 3.4) a 0.19 m lantern centre may use, by look: louvred shutters (海岸,
// 牧场 sub 1) leave 0.25 m of wall, accordion shutters (牧场 sub 0) 0.67 m, plain frames + sills 0.75-0.82 m
function ghalfOf(look, sub) { return look === 2 || (look === 1 && sub === 1) ? 0.125 : look === 1 && sub === 0 ? 0.55 : 0.6; }
// the entry lantern's spot (a_housepolish rule: 1.62 m past the door centre, the side away from the garage unless the wall ends);
// a_porchlamp: when that lands on a painted window (the door could not be snapped onto a cell, ~200 houses) slide it to the nearest
// painted gap nearest to it within 4 m of the door centre (either side), clear of the door frame and the garage trim; ?oldporch keeps the old spot
function porchSpot(seed, P, N, T, Lf, td, tg, gw, sgd, fw, ghalf) {
  const tl = Math.abs(td + sgd * 1.62) < Lf - 0.15 ? td + sgd * 1.62 : Math.abs(td - sgd * 1.62) < Lf - 0.15 && (tg === null || Math.abs(td - sgd * 1.62 - tg) > gw / 2 + 0.3) ? td - sgd * 1.62 : null;
  if (tl === null || PORCH_OFF) return tl; const ft = [-N[1], N[0]], tf = T[0] * ft[0] + T[1] * ft[1]; if (Math.abs(tf) < 0.5) return tl;
  const p = P(tl, 0), f = p[0] * ft[0] + p[1] * ft[1] + Math.fround(seed) * 37; if (Math.abs(f - 3.4 * Math.round(f / 3.4)) <= ghalf) return tl; 
  const t2 = gapSnap(seed, (t) => P(t, 0), N, T, tl, (t) => Math.abs(t - td) <= 4.0 && Math.abs(t - td) >= fw / 2 + 0.25 && Math.abs(t) <= Lf - 0.37 && (tg === null || Math.abs(t - tg) > gw / 2 + 0.3));
  PSPOT.onWindow++; if (t2 !== null) PSPOT.moved++; return t2 === null ? tl : t2; }
const PSPOT = { onWindow: 0, moved: 0 }; // counts (only the audit reads them)
function garageStyles(K, D, H, LT, seed, P, N, T, Lf, tg, gw, s, u1, v2, S, lantern, add) {
  const look = D.look, sub = D.sub || 0, h = H[4], gh = h > 5 ? 2.3 : 2.15; const R0 = LT.roof && !LT.roof.gone ? LT.roof : null, Rb = LT.roof;
  const fa = Math.atan2(-T[1], T[0]); const top = R0 ? R0[1] - 0.22 : h - 0.05;
  const ft = [-N[1], N[0]], tf = T[0] * ft[0] + T[1] * ft[1]; if (Math.abs(tf) < 0.5) return;
  const fu = (t) => { const p = P(t, 0); return p[0] * ft[0] + p[1] * ft[1] + Math.fround(seed) * 37; };
  const ghalf = ghalfOf(look, sub);
  const inGap = (t) => { const f = fu(t); return Math.abs(f - 3.4 * Math.round(f / 3.4)) <= ghalf; };
  // entry door spots (buildHouse: sgd, dw, pw, td, snap candidates)
  const sgd = -s, dw = look === 0 && hh(seed, 8) < 0.45 ? 1.65 : 0.95, pw = dw + 1.5, fw = dw < 1.2 ? 1.86 : dw + 0.32; const busy = [];
  let td0 = tg + sgd * (gw / 2 + 0.9 + pw / 2); if (Math.abs(td0) > Lf - pw / 2 - 0.15) td0 = sgd * (Lf - pw / 2 - 0.15); if (Math.abs(td0 - tg) < gw / 2 + pw / 2 + 0.3) td0 = null;
  if (td0 !== null) { const TD = [td0]; const f0 = fu(td0), base = td0 + (3.4 * Math.round((f0 - 1.7) / 3.4) + 1.7 - f0) / tf;
    for (const k of [0, 1, -1]) { const t2 = base + k * 3.4 / tf; if (Math.abs(t2) > Lf - pw / 2 - 0.15) continue; if (Math.abs(t2 - tg) < gw / 2 + pw / 2 + 0.3 || Math.sign(t2 - tg) !== sgd) continue; TD.push(t2); }
    const cy = Math.min(2.75, Rb ? Rb[1] - 0.66 : h - 0.35);
    for (const td of TD) { busy.push([td - fw / 2 - 0.03, td + fw / 2 + 0.03]); const tl = porchSpot(seed, P, N, T, Lf, td, tg, gw, sgd, fw, ghalf); if (tl !== null) busy.push([tl - 0.45, tl + 0.45]); if (cy < 2.2) busy.push([td - pw / 2 - 0.2, td + pw / 2 + 0.2]); } }
  const okAt = (t, side) => Math.abs(t) <= Lf - 0.37 && side * (t - tg) >= gw / 2 + 0.27 && inGap(t) && !busy.some(([a, b]) => t + 0.15 > a && t - 0.15 < b);
  // twin: first spot outward from the trim on each side
  const twinAt = (side) => { for (let d = gw / 2 + 0.27; d <= gw / 2 + 0.95 + 1e-6; d += 0.02) { const t = tg + side * d; if (okAt(t, side)) return t; } return null; };
  const tA = twinAt(s), tB = twinAt(-s); const twin = tA !== null && tB !== null;
  // wall: nearest painted-gap centre (as a_nightfix's gapSnap), away side first, door side second
  let wall = null, wallSide = 0; for (const side of [s, -s]) { const t = gapSnap(seed, (t) => P(t, 0), N, T, tg + side * (gw / 2 + 0.42), (t) => side * (t - tg) <= gw / 2 + 3.2 && okAt(t, side)); if (t !== null) { wall = t; wallSide = side; break; } }
  const over = top >= gh + 0.52 + 0.33;
  const opts = []; if (over) opts.push(['over', 0.35]); if (twin) opts.push(['twin', 0.40]); if (wall !== null) opts.push(['wall', 0.25]); if (!opts.length) return;
  let tw = 0; for (const o of opts) tw += o[1]; let x = v2 * tw, pick = opts[opts.length - 1][0]; let rx = 0.5; for (const o of opts) { if (x < o[1]) { pick = o[0]; rx = x / o[1]; break; } x -= o[1]; }
  const lit = u1 < 0.55; S.garage++; if (lit) S.garageLit++; if (twin && wall !== null && over) S.garageBoth++;
  if (pick === 'over' && rx < 0.4) { S.garageOver2++; const p = P(tg, 0), q = P(tg, 1.45), dx = gw * 0.3; add(p[0], p[1], lit, lantern(tg - dx, 0.07, 1, gh + 0.54, lit, fa).concat(lantern(tg + dx, 0.07, 1, gh + 0.54, lit, fa)), lit ? [q[0], q[1], 7.4, 6.6, fa, 0.075] : null); }
  else if (pick === 'over') { S.garageOver++; const p = P(tg, 0), q = P(tg, 1.45); add(p[0], p[1], lit, lantern(tg, 0.07, 1, gh + 0.54, lit, fa), lit ? [q[0], q[1], 6.4, 6.4, fa, 0.075] : null); }
  else if (pick === 'twin') { S.garageTwin++; const p = P(tg, 0), q = P(tg, 1.45); add(p[0], p[1], lit, lantern(tA, 0, 1, 1.84, lit, fa).concat(lantern(tB, 0, 1, 1.84, lit, fa)), lit ? [q[0], q[1], 7.4, 6.6, fa, 0.075] : null); }
  else { S.garageWall++; if (wallSide !== s) S.garageWallDoor++; const p = P(wall, 0), q = P(wall - wallSide * 0.5, 1.45); add(p[0], p[1], lit, lantern(wall, 0, 1, 1.84, lit, fa), lit ? [q[0], q[1], 6.4, 6.4, fa, 0.075] : null); } }
function prepLights(K) { const { u: UD, v: VD } = lightDraws(K); const L = []; const S = { garage: 0, garageLit: 0, garageOver: 0, garageOver2: 0, garageTwin: 0, garageWall: 0, garageWallDoor: 0, garageBoth: 0, rear: 0, rearLit: 0, dock: 0, dockLit: 0, porchLitDraw: 0 };
  const grid = new Grid(64);
  for (let hi = 0; hi < K.H.length; hi++) { const D = K.H[hi]; const u1 = UD[hi * 3], u2 = UD[hi * 3 + 1], u3 = UD[hi * 3 + 2], v2 = VD[hi * 2 + 1]; if (!PORCH_OFF && porchLit(K, hi)) S.porchLitDraw++; const LT = D.LT, H = LT.house; if (!H || H.gone) continue; const seed = H[11]; const F = frontFrame(LT); if (!F) continue;
    const { C, N, T, Df, Lf, fa, E } = F; const P = (t, o) => [C[0] + T[0] * t + N[0] * (Df + o), C[1] + T[1] * t + N[1] * (Df + o)];
    // lantern on a wall: o = outward offset of the wall plane from the front plane (0 front, -2 Df back), og = +1 front / -1 back
    const lantern = (t, ow, og, y, lit, yaw) => { const B = []; const bx = (o, y0, st, sy, so, c, kind) => { const p = P(t, ow + og * o); B.push([p[0], y0, p[1], st, sy, so, yaw, c, kind]); };
      if (lit) bx(0.015, y - 0.03, 0.13, 0.32, 0.03, LMET, 7); bx(0.095, y, 0.15, 0.24, 0.13, lit ? LGLASS : LOFF, lit ? 16 : 7); bx(0.095, y + 0.24, 0.19, 0.045, 0.17, LMET, 7); return B; }; // lit: plate + lens + cap; dark: lens + cap
    const add = (x, z, lit, B, pool) => { const r = { x, z, lit, B, pool }; L.push(r); grid.add(r, x, z, x, z); };
    // garage-side lantern (front)
    if (E) { const et = (E[0] - C[0]) * T[0] + (E[1] - C[1]) * T[1], eo = (E[0] - C[0]) * N[0] + (E[1] - C[1]) * N[1] - Df; const gw = hh(seed, 5) < 0.3 ? 2.9 : 2.6;
      if (Math.abs(eo) < 1.2 && Math.abs(et) <= Lf - 0.4) { const tg = Math.max(-Lf + gw / 2 + 0.25, Math.min(Lf - gw / 2 - 0.25, et)); const s = Math.sign(tg || 1); const ts = tg + s * (gw / 2 + 0.42);
        const tsn = gapSnap(seed, (t) => P(t, 0), N, T, ts, (t) => Math.abs(t) <= Lf - 0.4 && s * (t - tg) >= gw / 2 + 0.3 && s * (t - tg) <= gw / 2 + 3.2);
        if (!PORCH_OFF) { garageStyles(K, D, H, LT, seed, P, N, T, Lf, tg, gw, s, u1, v2, S, lantern, add); }
        else {
        // no free wall gap beside the door (garage close to the corner): a coach lantern centred over the header band if the eave leaves room
        const gh = H[4] > 5 ? 2.3 : 2.15, R0 = LT.roof && !LT.roof.gone ? LT.roof : null, top = R0 ? R0[1] - 0.22 : H[4] - 0.05, over = tsn === null && top >= gh + 0.52 + 0.33;
        if (tsn !== null || over) { const ts = tsn !== null ? tsn : tg; const lit = u1 < 0.55; S.garage++; if (lit) S.garageLit++; if (over) S.garageOver++; const p = P(ts, 0); const q = P(tsn !== null ? ts - s * 0.5 : ts, 1.45);
          add(p[0], p[1], lit, lantern(ts, over ? 0.07 : 0, 1, over ? gh + 0.54 : 1.84, lit, fa), lit ? [q[0], q[1], 6.4, 6.4, fa, 0.075] : null); } } } }
    if (LT.canal) { // back-wall (lanai) lantern facing the canal
      const tr0 = (hh(seed, 63) - 0.5) * Math.max(0, Lf - 0.9) * 1.6; const tr = gapSnap(seed, (t) => P(t, -2 * Df), [-N[0], -N[1]], T, tr0, (t) => Math.abs(t) <= Lf - 0.8);
      if (tr !== null) { const lit = u2 < 0.6; S.rear++; if (lit) S.rearLit++; const p = P(tr, -2 * Df); const q = P(tr, -2 * Df - 1.6);
      add(p[0], p[1], lit, lantern(tr, -2 * Df, -1, 2.05, lit, fa + Math.PI), lit ? [q[0], q[1], 6.8, 6.8, fa, 0.08] : null); }
      const Dk = LT.dock; if (Dk && !Dk.gone) { const [du, dv] = axes(Dk[4]); const hl = Dk[2] / 2, hwd = Dk[3] / 2, yd = Dk[8] || 0.35;
        const toH = (C[0] - Dk[0]) * dv[0] + (C[1] - Dk[1]) * dv[1] >= 0 ? 1 : -1; const se = hh(seed, 64) < 0.5 ? -1 : 1; const lit2 = u3 < 0.45; S.dock++; if (lit2) S.dockLit++;
        const x = Dk[0] + du[0] * se * (hl - 0.35) + dv[0] * toH * (hwd - 0.22), z = Dk[1] + du[1] * se * (hl - 0.35) + dv[1] * toH * (hwd - 0.22); const a = Math.atan2(-du[1], du[0]);
        const B = [[x, yd, z, 0.12, 0.62, 0.12, a, [0.55, 0.55, 0.53], 7], [x, yd + 0.62, z, 0.11, 0.13, 0.11, a, lit2 ? LGLASS : LOFF, lit2 ? 16 : 7], [x, yd + 0.75, z, 0.15, 0.035, 0.15, a, LMET, 7]];
        add(x, z, lit2, B, lit2 ? [Dk[0] + du[0] * se * (hl * 0.45), Dk[1] + du[1] * se * (hl * 0.45), Math.min(9, hl * 2 + 1), Dk[3] + 0.6, a, yd + 0.03] : null); } } }
  K.lightStats = S; return { L, grid }; }
function attachLights(K, scene) { if (NIGHT2_OFF) return; const { box: G, body: MAT, flat: GF, glow: GM } = fabKit(); if (!G || !MAT || !GF || !GM) return; const T0 = performance.now();
  const NL = prepLights(K); const g = G.clone(); const ak = new THREE.InstancedBufferAttribute(new Float32Array(LCAP * 2), 2); ak.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aK', ak);
  const fm = new THREE.InstancedMesh(g, MAT, LCAP); fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fm.setColorAt(0, new THREE.Color(1, 1, 1)); fm.instanceColor.setUsage(THREE.DynamicDrawUsage);
  fm.castShadow = false; fm.receiveShadow = true; fm.count = 0; fm.visible = false; fm.layers.set(KIT_LAYER); scene.add(fm);
  const pm = new THREE.InstancedMesh(GF, GM, PCAP); pm.renderOrder = 2; pm.castShadow = false; pm.receiveShadow = false; pm.count = 0; pm.visible = false; scene.add(pm);
  NL.fm = fm; NL.pm = pm; NL.at = null; K.NL = NL; K.lightStats.attachMs = +(performance.now() - T0).toFixed(1); K.lightStats.n = NL.L.length; }
const _lm = new THREE.Matrix4(), _lq = new THREE.Quaternion(), _lv = new THREE.Vector3(), _ls = new THREE.Vector3();
function updateLights(K, p) { const NL = K.NL, fm = NL.fm, pm = NL.pm; const night = U.uNight.value > 0.03; const at = NL.at;
  if (p.y > 140) { fm.visible = pm.visible = false; NL.at = null; return; }
  if (at && at[2] === night && Math.hypot(p.x - at[0], p.z - at[1]) < 20) return; NL.at = [p.x, p.z, night];
  const M = fm.instanceMatrix.array, Cc = fm.instanceColor.array, A = fm.geometry.attributes.aK.array, PM = pm.instanceMatrix.array; let n = 0, np = 0, nl = 0;
  NL.grid.near(p.x - LR, p.z - LR, p.x + LR, p.z + LR, (r) => { const dd = Math.hypot(r.x - p.x, r.z - p.z); if (dd > LR || (!(r.lit && night) && dd > LRD)) return false;
    if (n + r.B.length > LCAP) return false; nl++;
    for (const b of r.B) { _lq.setFromAxisAngle(_Y, b[6]); _lm.compose(_lv.set(b[0], b[1], b[2]), _lq, _ls.set(b[3], b[4], b[5])); _lm.toArray(M, n * 16); Cc[n * 3] = b[7][0]; Cc[n * 3 + 1] = b[7][1]; Cc[n * 3 + 2] = b[7][2]; A[n * 2] = b[8]; A[n * 2 + 1] = 0.5; n++; }
    if (night && r.pool && np < PCAP) { const q = r.pool, c = Math.cos(q[4]), s = Math.sin(q[4]), j = np * 16; PM.fill(0, j, j + 16); PM[j] = c * q[2]; PM[j + 2] = -s * q[2]; PM[j + 5] = 1; PM[j + 8] = s * q[3]; PM[j + 10] = c * q[3]; PM[j + 12] = q[0]; PM[j + 13] = q[5]; PM[j + 14] = q[1]; PM[j + 15] = 1; np++; }
    return false; });
  fm.count = n; fm.visible = n > 0; if (n) { fm.instanceMatrix.needsUpdate = true; fm.instanceColor.needsUpdate = true; fm.geometry.attributes.aK.needsUpdate = true; fm.computeBoundingSphere(); }
  pm.count = np; pm.visible = night && np > 0; if (np) { pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere(); }
  NL.info = { lights: nl, boxes: n, pools: np, tris: n * 12 + np * 2 }; NL.np0 = np; if (!PORCH_OFF) porchPools(K); }
// a_porchlamp: the lit entry lanterns' pools ride after the a_nightfix pools in the same instanced mesh (same object, same program),
// for the houses the kit holds (within RAD); rewritten when the kit refills (every 2.5 m) or the a_nightfix pools do
function porchPools(K) { const NL = K.NL; if (!NL || !NL.pm || NL.np0 === undefined) return; const pm = NL.pm, PM = pm.instanceMatrix.array; const night = U.uNight.value > 0.03; const n0 = NL.np0; let np = n0;
  if (night && K.porchB) for (const q of K.porchB) { if (np >= PCAP) break; const c = Math.cos(q[4]), s = Math.sin(q[4]), j = np * 16; PM.fill(0, j, j + 16); PM[j] = c * q[2]; PM[j + 2] = -s * q[2]; PM[j + 5] = 1; PM[j + 8] = s * q[3]; PM[j + 10] = c * q[3]; PM[j + 12] = q[0]; PM[j + 13] = q[5]; PM[j + 14] = q[1]; PM[j + 15] = 1; np++; }
  pm.count = np; pm.visible = night && np > 0; if (np > n0) { pm.instanceMatrix.clearUpdateRanges(); pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere(); }
  if (NL.info) NL.info.porch = np - n0; }
