// r5.0 「大地图第 1 期」: everything outside the original Deco district, built from src/mapgeo.js (same data as the minimap
// and tools/mapgen.cjs): natural island ends (dunes, mangroves), 日光堤道 causeway with a navigation-bridge hump, 星湾岛
// artificial island with villas, and the mainland 甘蔗区 / 湾畔 / 壁画仓库区 with curved and diagonal streets.
// Static ground / roads / kerbs / causeway go into the city World; buildings are STREAMED per 128 m chunk:
// a cheap far mesh (plain extruded volumes) is always there, the detailed chunk (relief, shopfronts, canopies, roof clutter,
// murals) is generated when the camera comes within ~320 m and disposed past ~460 m.
import * as THREE from 'three';
import { World, prismWalls, polyCap, box } from '../../geo.js';
import { buildRegionData, shoreX, beachOff, westCoast, ISLE, pearlPoly, pointInPoly, smooth } from './mapgeo.js';
import { REGION } from './mapdata.js';
import { rng, rand, randi, pick, clamp } from '../../util.js';
import { shopMural } from './shoppools.js'; // a_shopnight2

const SW = REGION.sw, DY = REGION.deckY;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
// geo.js convention (rect()): negative shoelace = "CCW seen from above"
const wind = (P) => (area2(P) > 0 ? P.slice().reverse() : P);
// quad with an upward normal; rd4 = per-vertex aRd values for the road shader
function quadUp(bk, P4, uv4, rd4, col) {
  const v = P4.map((p) => V3(p[0], p[1], p[2]));
  const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[3], v[0]));
  const o = n.y < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
  bk.quad(v[o[0]], v[o[1]], v[o[2]], v[o[3]], o.flatMap((i) => uv4[i]), {}, col || null);
  if (rd4) { const k = bk.custom.aRd; k.length -= 16; for (const i of o) k.push(...rd4[i]); }
}
// a_stripfix: the mainland ground caps were a few kilometre-long slivers (the coast fanned to the far corners). At eye height
// the triangle under the camera reaches kilometres sideways; once the near plane cuts it, its screen-space depth plane is
// built from vertices ~1e6 px off screen and SwiftShader's interpolated depth there was off by more than the 6.6 cm between the
// ground (y -0.06) and the lots / aprons / drives (y +0.006, polygon offset -1/-4): the grass won and covered the parking lots.
// The caps are now cut on a lattice (133 m cells over the modelled city, 400 m cells elsewhere, coarse cells that border fine ones
// carry the fine lattice points on that side so there are no T-junctions) and emitted as plain indexed triangles (polyCap wrote
// each triangle as a degenerate quad): same buckets / draw calls / material, a little more than double the triangles.
const GQ = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const GC = 400, GSUB = +(GQ.get('gsub') || 3), GF = GC / GSUB, GBOX = [-3600, -3200, -800, 3200]; // fine box (x0, z0, x1, z1), multiples of GC
export function gridCap(bk, poly, y) {
  if (GQ.has('nogrid')) { polyCap(bk, poly, y); return; }
  const n = poly.length; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const fineC = (i, j) => i * GC >= GBOX[0] && (i + 1) * GC <= GBOX[2] && j * GC >= GBOX[1] && (j + 1) * GC <= GBOX[3];
  const eg = new Map(); // poly edges bucketed by coarse cell
  for (let k = 0; k < n; k++) { const a = poly[k], b = poly[(k + 1) % n]; for (let i = Math.floor(Math.min(a[0], b[0]) / GC); i <= Math.floor(Math.max(a[0], b[0]) / GC); i++) for (let j = Math.floor(Math.min(a[1], b[1]) / GC); j <= Math.floor(Math.max(a[1], b[1]) / GC); j++) { const key = i * 65536 + j; let l = eg.get(key); if (!l) eg.set(key, l = []); l.push(k); } }
  const touches = (L, cx0, cz0, cx1, cz1) => { if (L) for (const k of L) { const a = poly[k], b = poly[(k + 1) % n]; if (Math.max(a[0], b[0]) >= cx0 - 1e-6 && Math.min(a[0], b[0]) <= cx1 + 1e-6 && Math.max(a[1], b[1]) >= cz0 - 1e-6 && Math.min(a[1], b[1]) <= cz1 + 1e-6) return true; } return false; };
  const clip = (P, ax, v, keepLess) => { const out = []; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; const ia = keepLess ? a[ax] <= v : a[ax] >= v, ib = keepLess ? b[ax] <= v : b[ax] >= v;
      if (ia) out.push(a); if (ia !== ib) { const t = (v - a[ax]) / (b[ax] - a[ax]); const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; q[ax] = v; out.push(q); } } return out; };
  const emit = (P) => { // polygon (xz) -> indexed triangles, normal up
    const m = []; for (const p of P) { const l = m[m.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 1e-4 || Math.abs(l[1] - p[1]) > 1e-4) m.push(p); }
    while (m.length > 1 && Math.abs(m[0][0] - m[m.length - 1][0]) < 1e-4 && Math.abs(m[0][1] - m[m.length - 1][1]) < 1e-4) m.pop(); if (m.length < 3) return;
    const tris = m.length === 4 ? [[0, 1, 2], [0, 2, 3]] : THREE.ShapeUtils.triangulateShape(m.map((p) => new THREE.Vector2(p[0], p[1])), []); const base = bk.vc;
    for (const p of m) { bk.p.push(p[0], y, p[1]); bk.n.push(0, 1, 0); bk.uv.push(p[0], p[1]); for (const k in bk.custom) for (let j = 0; j < bk.attrSizes[k]; j++) bk.custom[k].push(0); } bk.vc += m.length;
    for (const t of tris) { const a = m[t[0]], b = m[t[1]], c = m[t[2]]; const cr = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]); if (Math.abs(cr) < 1e-6) continue; // y-up normal: (b-a) x (c-a) .y > 0
      if (cr > 0) bk.idx.push(base + t[0], base + t[1], base + t[2]); else bk.idx.push(base + t[0], base + t[2], base + t[1]); } };
  // a cell [cx0,cx1]x[cz0,cz1]; sides: extra lattice spacing per side (0 = none) [z=cz0, x=cx1, z=cz1, x=cx0]
  const cell = (cx0, cz0, cx1, cz1, L, side) => {
    let P;
    if (!touches(L, cx0, cz0, cx1, cz1)) { if (!pointInPoly((cx0 + cx1) / 2, (cz0 + cz1) / 2, poly)) return; P = [[cx0, cz0], [cx1, cz0], [cx1, cz1], [cx0, cz1]]; }
    else { P = clip(clip(clip(clip(poly, 0, cx0, false), 0, cx1, true), 1, cz0, false), 1, cz1, true); if (P.length < 3) return; }
    if (!side) { emit(P); return; }
    const on = (p, k) => k === 0 ? Math.abs(p[1] - cz0) < 1e-4 : k === 1 ? Math.abs(p[0] - cx1) < 1e-4 : k === 2 ? Math.abs(p[1] - cz1) < 1e-4 : Math.abs(p[0] - cx0) < 1e-4;
    const Q = []; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; Q.push(a);
      for (let sd = 0; sd < 4; sd++) { const s = side[sd]; if (!s || !on(a, sd) || !on(b, sd)) continue; const ax = sd & 1 ? 1 : 0; const lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]); const pts = [];
        const o0 = ax ? cz0 : cx0; for (let q = Math.ceil((lo - o0 + 1e-4) / s); o0 + q * s < hi - 1e-4; q++) pts.push(o0 + q * s); if (a[ax] > b[ax]) pts.reverse(); for (const v of pts) { const q = [a[0], a[1]]; q[ax] = v; Q.push(q); } } }
    emit(Q); };
  for (let i = Math.floor(x0 / GC); i <= Math.floor(x1 / GC); i++) for (let j = Math.floor(z0 / GC); j <= Math.floor(z1 / GC); j++) {
    const X0 = i * GC, Z0 = j * GC, X1 = X0 + GC, Z1 = Z0 + GC; const L = eg.get(i * 65536 + j);
    if (fineC(i, j)) { const sub = !touches(L, X0, Z0, X1, Z1); if (sub && !pointInPoly(X0 + GC / 2, Z0 + GC / 2, poly)) continue;
      for (let qa = 0; qa < GSUB; qa++) for (let qb = 0; qb < GSUB; qb++) { const a = X0 + qa * GF, b = Z0 + qb * GF, a1 = X0 + (qa + 1) * GF, b1 = Z0 + (qb + 1) * GF;
        if (sub) emit([[a, b], [a1, b], [a1, b1], [a, b1]]); else cell(a, b, a1, b1, L, null); } continue; }
    const side = [fineC(i, j - 1) ? GF : 0, fineC(i + 1, j) ? GF : 0, fineC(i, j + 1) ? GF : 0, fineC(i - 1, j) ? GF : 0];
    cell(X0, Z0, X1, Z1, L, side.some((v) => v) ? side : null); }
}
// vertical/sloped quad facing (ox, oz)
function wallQ(bk, a, b, ya0, ya1, yb0, yb1, ox, oz, col, u0 = 0) {
  const A = V3(a[0], ya0, a[1]), B = V3(b[0], yb0, b[1]), C = V3(b[0], yb1, b[1]), D = V3(a[0], ya1, a[1]);
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(D, A));
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (n.x * ox + n.z * oz >= 0) bk.quad(A, B, C, D, [u0, ya0, u0 + len, yb0, u0 + len, yb1, u0, ya1], {}, col || null);
  else bk.quad(B, A, D, C, [u0 + len, yb0, u0, ya0, u0, ya1, u0 + len, yb1], {}, col || null);
}

// a_canaledge: canal bank wall + 0.12 m coping, cut at the bridge decks (fabric c.decks, [t0, t1] along the canal from c.A): the coping
// used to run straight across every deck (a 0.18 m vertical strip standing across the road / sidewalk / promenade); under a deck the
// bulkhead stops just below its top (-0.1) so the bank still reads as one wall from the water. Geometry only; no collider, no RNG.
const BANK_CUT = { cuts: 0 };
const PEARL_POLY = pearlPoly();
function bankWall(bk, e, c, ox, oz) {
  const dx = e.s[0] - e.w[0], dz = e.s[1] - e.w[1], L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L;
  const t0w = c ? (e.w[0] - c.A[0]) * c.d[0] + (e.w[1] - c.A[1]) * c.d[1] : 0; // bank start, along the canal from c.A
  const iv = ((c && c.decks) || []).map(([a, b]) => [Math.max(0, a - t0w), Math.min(L, b - t0w)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const P = (t) => [e.w[0] + ux * t, e.w[1] + uz * t]; let t = 0;
  for (const [a, b] of iv) { if (a > t) wallQ(bk, P(t), P(a), -3.2, 0.12, -3.2, 0.12, ox, oz, null, t); wallQ(bk, P(a), P(b), -3.2, -0.1, -3.2, -0.1, ox, oz, null, a); BANK_CUT.cuts++; t = Math.max(t, b); }
  if (L > t) wallQ(bk, P(t), P(L), -3.2, 0.12, -3.2, 0.12, ox, oz, null, t);
}
export const bankCutStats = BANK_CUT;

export function buildRegion(ctx, H) {
  const { W, col, lamps, palms, trees, shrubs } = ctx;
  const D = buildRegionData();
  const roads = D.roads, sun = D.byId.sun, B = REGION.bridge;
  const onWater = (x, z) => x > shoreX(z) - 1 && x < -22; // bay between the mainland and the island (causeway part)
  const inBridge = (x) => x > B.x0 + 4 && x < B.x1 - 4;
  const step = 3;
  // ------------------------------------------------------------------ road ribbons ----
  for (const pc of D.pieces) {
    const R = pc.road, L = pc.s1 - pc.s0; const n = Math.max(1, Math.ceil(L / step));
    const rd = W.b('road', R.path.at((pc.s0 + pc.s1) / 2).x, R.path.at((pc.s0 + pc.s1) / 2).z);
    for (let i = 0; i < n; i++) {
      const sa = pc.s0 + (L * i) / n, sb = pc.s0 + (L * (i + 1)) / n; const p = R.path.at(sa), q = R.path.at(sb);
      const ya = R.h(sa, p.x), yb = R.h(sb, q.x); const w = pc.hw;
      const A1 = [p.x + p.tz * w, ya, p.z - p.tx * w], A2 = [p.x - p.tz * w, ya, p.z + p.tx * w], B2 = [q.x - q.tz * w, yb, q.z + q.tx * w], B1 = [q.x + q.tz * w, yb, q.z - q.tx * w];
      const va = sa - pc.s0, vb = sb - pc.s0; const kind = pc.kind;
      // aRd u: lateral (+ on the n side), v along
      quadUp(rd, [A1, A2, B2, B1], [[A1[0] / 7, A1[2] / 7], [A2[0] / 7, A2[2] / 7], [B2[0] / 7, B2[2] / 7], [B1[0] / 7, B1[2] / 7]], [[-w, va, L, kind], [w, va, L, kind], [w, vb, L, kind], [-w, vb, L, kind]]);
    }
  }
  for (const J of D.junctions) {
    if (J.patch.length < 3) continue; const rd = W.b('road', J.x, J.z);
    const tris = THREE.ShapeUtils.triangulateShape(J.patch.map((p) => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tris) { const P = t.map((i) => [J.patch[i][0], J.y, J.patch[i][1]]); quadUp(rd, [P[0], P[1], P[2], P[2]], P.map((p) => [p[0] / 7, p[2] / 7]).concat([[P[2][0] / 7, P[2][2] / 7]]), [[0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1]]); }
  }
  // ------------------------------------------------------------------ sidewalks (raised kerb ribbons) ----
  const walks = [];
  for (const wk of D.walks) {
    const R = wk.road; const L = wk.s1 - wk.s0; if (L < 3) continue;
    const mid = R.path.at((wk.s0 + wk.s1) / 2); if (R.id === 'sun' && onWater(mid.x, mid.z)) continue; if (R.id === 'plink') continue;
    walks.push(wk);
    const n = Math.max(1, Math.ceil(L / step)); const s = W.b('sidewalk', mid.x, mid.z), kc = W.b('concrete', mid.x, mid.z);
    const o0 = wk.side * R.hw, o1 = wk.side * (R.hw + SW);
    const pt = (q, o, y) => [q.x - q.tz * o, y, q.z + q.tx * o];
    for (let i = 0; i < n; i++) {
      const sa = wk.s0 + (L * i) / n, sb = wk.s0 + (L * (i + 1)) / n; const p = R.path.at(sa), q = R.path.at(sb);
      const ya = R.h(sa, p.x), yb = R.h(sb, q.x);
      const a0 = pt(p, o0, ya + 0.15), a1 = pt(p, o1, ya + 0.15), b1 = pt(q, o1, yb + 0.15), b0 = pt(q, o0, yb + 0.15);
      quadUp(s, [a0, a1, b1, b0], [a0, a1, b1, b0].map((v) => [v[0], v[2]]));
      // kerb faces (road side + lot side) and ends
      const nx = -p.tz * wk.side, nz = p.tx * wk.side;
      wallQ(kc, [a0[0], a0[2]], [b0[0], b0[2]], ya, ya + 0.15, yb, yb + 0.15, -nx, -nz);
      wallQ(kc, [a1[0], a1[2]], [b1[0], b1[2]], ya - 0.05, ya + 0.15, yb - 0.05, yb + 0.15, nx, nz);
      if (i === 0) wallQ(kc, [a0[0], a0[2]], [a1[0], a1[2]], ya, ya + 0.15, ya, ya + 0.15, -p.tx, -p.tz);
      if (i === n - 1) wallQ(kc, [b0[0], b0[2]], [b1[0], b1[2]], yb, yb + 0.15, yb, yb + 0.15, q.tx, q.tz);
    }
  }
  // ------------------------------------------------------------------ mainland ground + bay park + seawall ----
  const ZE = 3000, XW = -2700; const shoreZs = []; for (let z = -ZE; z <= ZE; z += 10) shoreZs.push(z); // r6.3: seawall runs the whole fabric coast (was ±1500)
  // r6.3 (ground_a) finger canals of the fabric's waterfront cells: notches in the ground polygon (water shows), seawall gaps, bank walls
  const canals = (H.fab && H.fab.canals) || [];
  const ccut = canals.map((c) => { const n = [-c.d[1], c.d[0]]; const L0 = Math.hypot(c.B[0] - c.A[0], c.B[1] - c.A[1]);
    const E = (o) => { const P0 = [c.A[0] + n[0] * o, c.A[1] + n[1] * o]; let t = L0; for (let k = 0; k < 5; k++) { const x = P0[0] + c.d[0] * t, z = P0[1] + c.d[1] * t; t += (shoreX(z) - x) / (c.d[0] || 1); } return { w: P0, s: [P0[0] + c.d[0] * t, P0[1] + c.d[1] * t] }; };
    const e1 = E(c.hw), e2 = E(-c.hw); return e1.s[1] > e2.s[1] ? { hi: e1, lo: e2 } : { hi: e2, lo: e1 }; });
  const shoreRun = (z0, z1) => { const out = []; const used = new Set(); for (let z = z0; z >= z1; z -= 10) {
      const k = ccut.findIndex((q, i) => !used.has(i) && q.hi.s[1] <= z0 && q.lo.s[1] >= z1 && z < q.hi.s[1]);
      if (k >= 0) { const q = ccut[k]; used.add(k); out.push(q.hi.s, q.hi.w, q.lo.w, q.lo.s); }
      if (ccut.some((q) => z <= q.hi.s[1] + 0.01 && z >= q.lo.s[1] - 0.01)) continue; out.push([shoreX(z), z]); } return out; };
  const inMouth = (za, zb) => ccut.some((q) => zb > q.lo.s[1] - 1 && za < q.hi.s[1] + 1);
  {
    const district = [[-1380, -480], [-1380, 480]]; for (let z = 480; z >= -480; z -= 10) district.push([shoreX(z), z]);
    gridCap(W.b('mgroundC', -1100, 0), wind(district), -0.06);
    // vis-sweep: the ground slab used to stop at x=-2700 / z=±1500 -> a hard rectangular map edge in every aerial. It now runs
    // out to the far fade (env.js / water.js fade everything into the horizon haze at 2.3–4 km), the coast following shoreX.
    const XG = -4600, ZG = 4600;
    const north = [[XG, 480], [XG, ZG], ...shoreRun(ZG, 480)];
    const south = [[XG, -ZG], [XG, -480], ...shoreRun(-480, -ZG)];
    gridCap(W.b('mgroundG', -1500, 900), wind(north), -0.06); gridCap(W.b('mgroundG', -1500, -900), wind(south), -0.06);
    gridCap(W.b('mgroundG', -2000, 0), wind([[XG, -480], [XG, 480], [-1380, 480], [-1380, -480]]), -0.06);
    // bay park strip: from the outer sidewalk edge of 湾岸大道 to the seawall, raised 0.15, grass + palms
    const sh = D.byId.shore; const park = [];
    for (let s = 0; s <= sh.path.len; s += 6) { const q = sh.path.at(s); const sideBay = Math.sign(-q.tz) || 1; park.push([q.x - q.tz * sideBay * (sh.hw + SW + 0.01), q.z + q.tx * sideBay * (sh.hw + SW + 0.01)]); }
    const z0 = park[0][1], z1 = park[park.length - 1][1];
    for (let z = z1; z >= z0; z -= 6) park.push([shoreX(z) - 0.3, z]);
    // split around the causeway landing so the park does not cover the road
    const zc = 16; const P1 = park.filter((p) => p[1] < zc - 14), P2 = park.filter((p) => p[1] > zc + 14);
    for (const P of [P1, P2]) if (P.length > 3) { polyCap(W.b('grass', P[0][0], P[0][1]), wind(P), 0.15); }
    for (let s = 10; s < sh.path.len - 10; s += rand(11, 16)) { const q = sh.path.at(s); if (Math.abs(q.z - zc) < 20 || Math.abs(q.z + 120) < 10 || Math.abs(q.z - 318) < 10 || Math.abs(q.z + 310) < 10 || Math.abs(q.z + 388) < 10) continue;
      const x = (q.x + sh.hw + SW + shoreX(q.z)) / 2 + rand(-3, 3); palms.push({ x, z: q.z + rand(-2, 2), h: rand(9, 15), lean: rand(-0.12, 0.12), rot: rand(0, 6.28), s: rand(0.9, 1.1) });
      if (rng() < 0.5) shrubs.push({ x: x + rand(-4, 4), z: q.z + rand(-5, 5), s: rand(0.8, 1.4) }); }
    // seawall with coping + railing (gap where the causeway lands)
    const cw = W.b('concrete', -900, 0), m = W.b('metal', -900, 0);
    for (let i = 0; i < shoreZs.length - 1; i++) {
      const za = shoreZs[i], zb = shoreZs[i + 1]; if (zb > zc - 22 && za < zc + 22) continue; if (inMouth(za, zb)) continue;
      const a = [shoreX(za), za], b = [shoreX(zb), zb];
      wallQ(cw, a, b, -3.2, 0.0, -3.2, 0.0, 1, 0);
      box(cw, Math.min(a[0], b[0]) - 0.1, 0.0, za, Math.max(a[0], b[0]) + 0.35, 0.3, zb, {}, null);
      if (Math.abs(za) < 480) { box(m, a[0] - 0.3, 0.3, za - 0.04, a[0] - 0.22, 1.2, za + 0.04); for (const y of [1.15, 0.7]) box(m, Math.min(a[0], b[0]) - 0.3, y, za, Math.min(a[0], b[0]) - 0.24, y + 0.05, zb);
        const cx = (a[0] + b[0]) / 2 - 0.3, cz = (za + zb) / 2; const dx = b[0] - a[0], dz = zb - za, l = Math.hypot(dx, dz); col.addOBB(cx, cz, dx / l, dz / l, l / 2 + 0.2, 0.4, 1.2, 'rail'); }
    }
  }
  // canal banks: bulkhead walls + coping on both sides and across the head; short seawall stubs to the mouths
  // a_orphans: the bank boxes (0.8 m high, 0.6 m wide, the whole ~400 m bank from the inland head to the seawall) stand over a
  // 0.12 m coping with no railing, and run straight across the coastal boulevard / canal bridges -> invisible walls on the road
  // and a swimmer trap; registered as before (layout unchanged), removed by colfix (fit = [])
  { const cw = W.b('concrete', -900, 2000);
    ccut.forEach((q, qi) => { const mc = [(q.hi.w[0] + q.lo.w[0] + q.hi.s[0] + q.lo.s[0]) / 4, (q.hi.w[1] + q.lo.w[1] + q.hi.s[1] + q.lo.s[1]) / 4];
      for (const e of [q.hi, q.lo]) { const dx = e.s[0] - e.w[0], dz = e.s[1] - e.w[1]; const l = Math.hypot(dx, dz); const c = [(e.w[0] + e.s[0]) / 2, (e.w[1] + e.s[1]) / 2];
        bankWall(cw, e, canals[qi], mc[0] - c[0], mc[1] - c[1]); col.addOBB(c[0], c[1], dx / l, dz / l, l / 2, 0.3, 0.8, 'rail').fit = []; }
      wallQ(cw, q.hi.w, q.lo.w, -3.2, 0.12, -3.2, 0.12, 1, 0); }); }
  // ------------------------------------------------------------------ causeway: berm, rock revetment, guard rails, bridge ----
  {
    const R = sun; const sEnd = D.sunShoreS + 6; const g = W.b('grass', -400, 0), rk = W.b('vcol', -400, 0), m = W.b('metal', -400, 0), cn = W.b('concrete', -400, 0);
    const rockA = [0.34, 0.32, 0.29], rockB = [0.27, 0.26, 0.24], wet = [0.16, 0.16, 0.15];
    const boulder = new THREE.DodecahedronGeometry(1, 1); { const P = boulder.attributes.position; for (let i = 0; i < P.count; i++) { const k = 0.82 + 0.3 * Math.abs(Math.sin(P.getX(i) * 5.1 + P.getY(i) * 3.7 + P.getZ(i) * 4.3)); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k); } boulder.computeVertexNormals(); }
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
    let lastPalm = [-99, -99], lampI = 0; const sLink = (R.js.find((j) => j.other.id === 'plink') || { s: -999 }).s;
    for (let s = 8; s < sEnd; s += 4) {
      const p = R.path.at(s), q = R.path.at(s + 4); const ya = R.h(s, p.x) + 0.15, yb = R.h(s + 4, q.x) + 0.15;
      const br = inBridge(p.x) || inBridge(q.x); const land = !onWater(p.x, p.z) && !onWater(q.x, q.z); if (land) continue;
      const nearPier = (x, z) => Math.abs(z - 28) < 6 && x > -80; // keep the marina pier at z=28 clear
      for (const side of [-1, 1]) {
        if (side === 1 && Math.abs(s + 2 - sLink) < 13) continue; // r5.0: opening in the embankment where 星湾桥 branches off south
        const off = (o, Q, y) => [Q.x - Q.tz * side * o, y, Q.z + Q.tx * side * o]; const nx = -p.tz * side, nz = p.tx * side;
        const hw = R.hw;
        if (br) {
          // bridge: concrete edge beam + parapet; the deck slab is the road; underside + piers
          const a0 = off(hw, p, ya), a1 = off(hw + 1.6, p, ya), b1 = off(hw + 1.6, q, yb), b0 = off(hw, q, yb);
          quadUp(cn, [a0, a1, b1, b0], [[0, 0], [1.6, 0], [1.6, 4], [0, 4]]);
          wallQ(cn, [a1[0], a1[2]], [b1[0], b1[2]], ya - 1.4, ya + 0.95, yb - 1.4, yb + 0.95, nx, nz);
          wallQ(cn, off(hw + 1.35, p, 0).filter((_, i) => i !== 1), off(hw + 1.35, q, 0).filter((_, i) => i !== 1), ya, ya + 0.95, yb, yb + 0.95, -nx, -nz);
          quadUp(cn, [off(hw + 1.35, p, ya + 0.95), off(hw + 1.6, p, ya + 0.95), off(hw + 1.6, q, yb + 0.95), off(hw + 1.35, q, yb + 0.95)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
          if (side > 0) { const u0 = off(hw + 1.6, p, ya - 1.4), u1 = off(-(hw + 1.6), p, ya - 1.4), v1 = off(-(hw + 1.6), q, yb - 1.4), v0 = off(hw + 1.6, q, yb - 1.4);
            // underside (facing down)
            cn.quad(V3(...u0), V3(...v0), V3(...v1), V3(...u1), [0, 0, 0, 4, 20, 4, 20, 0]);
            if (Math.round(s / 4) % 6 === 0) for (const o of [-6, 6]) { const c = off(o, p, 0); box(cn, c[0] - 1.1, -6, c[2] - 1.1, c[0] + 1.1, ya - 1.4, c[2] + 1.1); col.add(c[0] - 1.1, c[2] - 1.1, c[0] + 1.1, c[2] + 1.1, ya - 1.6, 'pier'); } }
        } else {
          // shoulder + grass berm at deck+0.15, rock slope down to the bay floor
          const a0 = off(hw, p, ya), a1 = off(hw + 1.6, p, ya), b1 = off(hw + 1.6, q, yb), b0 = off(hw, q, yb);
          quadUp(cn, [a0, a1, b1, b0], [[a0[0], a0[2]], [a1[0], a1[2]], [b1[0], b1[2]], [b0[0], b0[2]]]);
          wallQ(cn, [a0[0], a0[2]], [b0[0], b0[2]], ya - 0.15, ya, yb - 0.15, yb, -nx, -nz);
          const c0 = off(hw + 5.2, p, ya), c1 = off(hw + 5.2, q, yb);
          quadUp(g, [a1, c0, c1, b1], [[a1[0], a1[2]], [c0[0], c0[2]], [c1[0], c1[2]], [b1[0], b1[2]]]);
          const j = (k) => 0.82 + 0.18 * Math.sin(s * 0.37 + k * 1.7 + side);
          const d0 = off(hw + 9, p, ya - 1.6 - 0.3 * Math.sin(s * 0.21)), d1 = off(hw + 9, q, yb - 1.6 - 0.3 * Math.sin((s + 4) * 0.21));
          const e0 = off(hw + 13.5, p, -3.4), e1 = off(hw + 13.5, q, -3.4);
          quadUp(rk, [c0, d0, d1, c1], [[0, 0], [1, 0], [1, 1], [0, 1]], null, rockA.map((c) => c * j(0)));
          quadUp(rk, [d0, e0, e1, d1], [[0, 0], [1, 0], [1, 1], [0, 1]], null, rockB.map((c) => c * j(1)));
          // boulders along the waterline (armour stone)
          if (!nearPier(p.x, p.z)) for (let k = 0; k < 4; k++) { const o = hw + rand(6.5, 12.5); const bp = off(o, R.path.at(s + rand(0, 4)), 0); const sc = rand(0.45, 1.1);
            _e.set(rand(0, 6), rand(0, 6), rand(0, 6)); _q.setFromEuler(_e); _m.compose(V3(bp[0], -1.2 - (o - hw - 7.5) * 0.25 + sc * 0.3, bp[2]), _q, V3(sc * 1.3, sc, sc * 1.1));
            rk.geom(boulder, _m, {}, (o > hw + 10.5 ? wet : rockA).map((c) => c * rand(0.8, 1.1))); }
          // palms on the berm, alternating sides
          if (side === (Math.floor(s / 26) % 2 ? 1 : -1) && Math.hypot(p.x - lastPalm[0], p.z - lastPalm[1]) > 22 && s > 40) { const pp = off(hw + 3.6, p, 0); palms.push({ x: pp[0], z: pp[2], h: rand(9, 14), lean: rand(-0.1, 0.1), rot: rand(0, 6.28), s: rand(0.9, 1.1) }); lastPalm = [p.x, p.z]; }
        }
        // guard rail (posts + two rails) on the shoulder edge, with colliders
        if (!br) { const r0 = off(hw + 1.45, p, ya), r1 = off(hw + 1.45, q, yb);
          box(m, r0[0] - 0.06, ya, r0[2] - 0.06, r0[0] + 0.06, ya + 0.85, r0[2] + 0.06);
          for (const y of [0.55, 0.78]) { const t0 = off(hw + 1.38, p, 0), t1 = off(hw + 1.38, q, 0); quadUp(m, [[t0[0], ya + y, t0[2]], [t1[0], yb + y, t1[2]], [t1[0], yb + y + 0.06, t1[2]], [t0[0], ya + y + 0.06, t0[2]]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
            wallQ(m, [t0[0], t0[2]], [t1[0], t1[2]], ya + y - 0.1, ya + y + 0.12, yb + y - 0.1, yb + y + 0.12, -nx, -nz); } }
        { const c = off(hw + 1.5, R.path.at(s + 2), 0); col.addOBB(c[0], c[2], p.tx, p.tz, 2.3, 0.25, Math.max(ya, yb) + 1.1, 'rail'); }
      }
      // lamps every ~44 m, staggered
      if (s % 44 < 4) { const side = lampI++ % 2 ? 1 : -1; const lp = [p.x - p.tz * side * (R.hw + 0.9), p.z + p.tx * side * (R.hw + 0.9)]; lamps.push({ x: lp[0], z: lp[1], y: ya, dir: [p.tz * side, -p.tx * side] }); }
    }
    // 星湾桥 (link bridge to the pearl island): deck slab edges, parapets, short piers
    const LR = D.byId.plink; for (const pc of LR.pieces) for (let s = pc.s0; s < pc.s1; s += 3) {
      const p = LR.path.at(s), q = LR.path.at(Math.min(pc.s1, s + 3)); if (Math.hypot(p.x - REGION.pearl.cx, p.z - REGION.pearl.cz) < REGION.pearl.r - 2) continue;
      for (const side of [-1, 1]) { const off = (o, Q, y) => [Q.x - Q.tz * side * o, y, Q.z + Q.tx * side * o]; const nx = -p.tz * side, nz = p.tx * side;
        const a0 = off(LR.hw, p, DY + 0.15), a1 = off(LR.hw + 1.4, p, DY + 0.15), b1 = off(LR.hw + 1.4, q, DY + 0.15), b0 = off(LR.hw, q, DY + 0.15);
        quadUp(cn, [a0, a1, b1, b0], [[0, 0], [1, 0], [1, 1], [0, 1]]); wallQ(cn, [a1[0], a1[2]], [b1[0], b1[2]], DY - 1.0, DY + 1.1, DY - 1.0, DY + 1.1, nx, nz);
        const c = off(LR.hw + 1.4, R.path.at(0), 0); void c; const cc = off(LR.hw + 1.3, LR.path.at(s + 1.5), 0); col.addOBB(cc[0], cc[2], p.tx, p.tz, 1.8, 0.2, DY + 1.1, 'rail'); }
      const u0 = [p.x + p.tz * (LR.hw + 1.4), DY - 1.0, p.z - p.tx * (LR.hw + 1.4)], u1 = [p.x - p.tz * (LR.hw + 1.4), DY - 1.0, p.z + p.tx * (LR.hw + 1.4)], v1 = [q.x - q.tz * (LR.hw + 1.4), DY - 1.0, q.z + q.tx * (LR.hw + 1.4)], v0 = [q.x + q.tz * (LR.hw + 1.4), DY - 1.0, q.z - q.tx * (LR.hw + 1.4)];
      quadUp(cn, [u0, u1, v1, v0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      box(cn, p.x - 0.8, -6, p.z - 0.8, p.x + 0.8, DY - 1.0, p.z + 0.8);
    }
  }
  // ------------------------------------------------------------------ 星湾岛 (artificial island) ----
  const pearl = REGION.pearl; const PP = pearlPoly();
  {
    polyCap(W.b('mgroundG', pearl.cx, pearl.cz), wind(PP), DY - 0.06);
    const cw = W.b('concrete', pearl.cx, pearl.cz), m = W.b('metal', pearl.cx, pearl.cz);
    for (let i = 0; i < PP.length; i++) { const a = PP[i], b = PP[(i + 1) % PP.length]; const ox = (a[0] + b[0]) / 2 - pearl.cx, oz = (a[1] + b[1]) / 2 - pearl.cz;
      // gap where the link bridge arrives (north side)
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const gap = Math.abs(mid[0] - (-424)) < 8 && mid[1] > pearl.cz;
      if (!gap) wallQ(cw, a, b, -3.2, DY, -3.2, DY, ox, oz);
      else wallQ(cw, a, b, -3.2, DY - 1.0, -3.2, DY - 1.0, ox, oz);
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l; const on = Math.hypot(ox, oz);
      quadUp(cw, [[a[0], DY + 0.12, a[1]], [b[0], DY + 0.12, b[1]], [b[0] - ox / on * 0.6, DY + 0.12, b[1] - oz / on * 0.6], [a[0] - ox / on * 0.6, DY + 0.12, a[1] - oz / on * 0.6]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      wallQ(cw, a, b, DY, DY + 0.12, DY, DY + 0.12, ox, oz);
      if (!gap) { box(m, a[0] - ox / on * 0.4 - 0.04, DY + 0.12, a[1] - oz / on * 0.4 - 0.04, a[0] - ox / on * 0.4 + 0.04, DY + 1.1, a[1] - oz / on * 0.4 + 0.04);
        col.addOBB(mid[0] - ox / on * 0.4, mid[1] - oz / on * 0.4, ux, uz, l / 2 + 0.2, 0.3, DY + 1.1, 'rail'); }
    }
    // central park: palms + shrubs, a fountain basin
    for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), r = rand(4, 36); palms.push({ x: pearl.cx + Math.cos(a) * r, z: pearl.cz + Math.sin(a) * r, h: rand(8, 14), lean: rand(-0.1, 0.1), rot: rand(0, 6), s: rand(0.9, 1.1) }); }
    for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), r = rand(6, 38); shrubs.push({ x: pearl.cx + Math.cos(a) * r, z: pearl.cz + Math.sin(a) * r, s: rand(0.8, 1.5) }); }
    const fv = W.b('vcol', pearl.cx, pearl.cz); const ring = new THREE.CylinderGeometry(5, 5.3, 0.6, 28, 1, true); H.gput(fv, ring, pearl.cx, DY + 0.3, pearl.cz, [0.86, 0.84, 0.8]);
    const pool = W.b('pool', pearl.cx, pearl.cz); const disc = new THREE.CircleGeometry(4.9, 28); disc.rotateX(-Math.PI / 2); H.gput(pool, disc, pearl.cx, DY + 0.45, pearl.cz, null);
    // a_orphans: the 8 x 8 m box sat inside the r 5.0-5.3 basin wall (player walked through the rim into the pool on the axes,
    // stopped 0.7 m short of it on the diagonals); colfix swaps it for 12 thin boxes on the rim
    col.add(pearl.cx - 4, pearl.cz - 4, pearl.cx + 4, pearl.cz + 4, DY + 0.6, 'fountain').fit = Array.from({ length: 12 }, (_, i) => { const a = (i + 0.5) * Math.PI / 6;
      return { obb: [pearl.cx + Math.cos(a) * 5.15, pearl.cz + Math.sin(a) * 5.15, -Math.sin(a), Math.cos(a), 5.3 * Math.tan(Math.PI / 12) + 0.05, 0.16], h: DY + 0.6 }; });
  }
  // ------------------------------------------------------------------ island natural ends (dunes N, mangroves S) ----
  {
    for (const sg of [1, -1]) {
      const P = []; for (let a = ISLE.z0; a <= ISLE.tip; a += 8) P.push([westCoast(sg * a), sg * a]); for (let a = ISLE.tip; a >= ISLE.z0; a -= 8) P.push([335 + beachOff(sg * a) + 0.5, sg * a]);
      polyCap(W.b('grass', 150, sg * 900), wind(P), 0.15);
      // natural shore skirt on the bay side: sand / mud slope into the water
      const sd = W.b('sand', 0, sg * 900);
      for (let a = ISLE.z0; a < ISLE.tip; a += 8) { const z0 = sg * a, z1 = sg * (a + 8); const x0 = westCoast(z0), x1 = westCoast(z1);
        const A0 = [x0, 0.15, z0], B0 = [x1, 0.15, z1], A1 = [x0 - 9, -2.4, z0], B1 = [x1 - 9, -2.4, z1]; quadUp(sd, [A0, B0, B1, A1], [[x0, z0], [x1, z1], [x1 - 9, z1], [x0 - 9, z0]]); }
      // vegetation: sea grape + palms on the dunes (north), mangrove thickets on the bay edge (south), mixed further out
      for (let a = ISLE.z0 + 10; a < ISLE.tip - 30; a += rand(5, 9)) {
        const z = sg * a; const xw = westCoast(z), xe = 335 + beachOff(z);
        if (sg < 0 || rng() < 0.5) for (let k = 0; k < (sg < 0 ? 3 : 1); k++) shrubs.push({ x: xw + rand(-1, 5), z: z + rand(-3, 3), s: rand(1.0, 1.9), mangrove: true });
        if (sg < 0 && rng() < 0.5) trees.push({ x: xw + rand(2, 9), z: z + rand(-3, 3), s: rand(0.7, 1.1) });
        if (a < 600) { // dune park: sea-grape clumps, palm groves, a few shade trees
          for (let k = 0; k < 5; k++) shrubs.push({ x: rand(xw + 10, xe - 4), z: z + rand(-3.5, 3.5), s: rand(0.8, 1.9) });
          if (rng() < 0.6) palms.push({ x: rand(xw + 12, xe - 6), z: z + rand(-3, 3), h: rand(8, 13), lean: rand(-0.15, 0.15), rot: rand(0, 6), s: rand(0.9, 1.1) });
          if (rng() < 0.4) trees.push({ x: rand(xw + 12, xe - 10), z: z + rand(-3, 3), s: rand(0.8, 1.15) }); }
        else { if (rng() < 0.5) palms.push({ x: rand(xw + 8, xe - 10), z: z + rand(-3, 3), h: rand(8, 13), lean: rand(-0.1, 0.1), rot: rand(0, 6), s: 1 });
          for (let k = 0; k < 2; k++) shrubs.push({ x: rand(xw + 6, xe - 6), z: z + rand(-3.5, 3.5), s: rand(0.8, 1.6) });
          if (rng() < 0.7) trees.push({ x: rand(xw + 8, xe - 12), z: z + rand(-3, 3), s: rand(0.75, 1.1) }); }
      }
      // boardwalk through the dunes (timber deck on posts), north end only
      if (sg > 0) { const v = W.b('vcol', 150, 470); let px = 300, pz = 380;
        for (let a = 384; a < 590; a += 3) { const x = 250 + 45 * Math.sin(a * 0.017) - 20 * Math.sin(a * 0.041), z = a; const dx = x - px, dz = z - pz; const l = Math.hypot(dx, dz) || 1;
          const ux = dx / l, uz = dz / l; const c = [(x + px) / 2, (z + pz) / 2]; const P4 = [[-1.2, -l / 2 - 0.1], [1.2, -l / 2 - 0.1], [1.2, l / 2 + 0.1], [-1.2, l / 2 + 0.1]].map(([w, a2]) => [c[0] + ux * a2 - uz * w, c[1] + uz * a2 + ux * w]);
          quadUp(v, P4.map((p) => [p[0], 0.42, p[1]]), [[0, 0], [1, 0], [1, 1], [0, 1]], null, [0.52, 0.4, 0.28]);
          for (let k = 0; k < 4; k++) wallQ(v, P4[k], P4[(k + 1) % 4], 0.1, 0.42, 0.1, 0.42, (P4[k][0] + P4[(k + 1) % 4][0]) / 2 - c[0], (P4[k][1] + P4[(k + 1) % 4][1]) / 2 - c[1], [0.38, 0.29, 0.2]);
          px = x; pz = z; } }
    }
  }
  // ------------------------------------------------------------------ mainland street lamps + street trees ----
  for (const pc of D.pieces) {
    const R = pc.road; if (R.id === 'sun' && R.path.at(pc.s0).x > -900) continue; // causeway has its own
    const L = pc.s1 - pc.s0; const n = Math.max(1, Math.floor(L / 36));
    for (let i = 0; i < n; i++) { const s = pc.s0 + ((i + 0.5) * L) / n; const p = R.path.at(s); const side = i % 2 ? 1 : -1; const o = R.hw + 0.8;
      lamps.push({ x: p.x - p.tz * side * o, z: p.z + p.tx * side * o, y: R.h(s, p.x) + 0.15, dir: [p.tz * side, -p.tx * side] }); }
    const tn = Math.floor(L / 19);
    for (let i = 1; i < tn; i++) { const s = pc.s0 + (i * L) / tn + rand(-1, 1); const p = R.path.at(s);
      for (const side of [-1, 1]) { if (R.id === 'pring' && side > 0) { if (rng() < 0.5) continue; }
        const o = R.hw + 2.7; const x = p.x - p.tz * side * o, z = p.z + p.tx * side * o;
        if (lamps.some((l) => Math.abs(l.x - x) < 3 && Math.abs(l.z - z) < 3)) continue;
        if (R.kind === 0 || rng() < 0.6) palms.push({ x, z, h: rand(7, 12), lean: rand(-0.07, 0.07), rot: rand(0, 6.28), s: rand(0.85, 1.05), street: true });
        else trees.push({ x, z, s: rand(0.75, 1.0) }); } }
  }
  // ------------------------------------------------------------------ building lots: colliders now, meshes streamed ----
  const LATIN = [[1.0, 0.72, 0.42], [0.42, 0.78, 0.74], [1.0, 0.86, 0.42], [0.95, 0.52, 0.52], [0.62, 0.85, 0.52], [0.55, 0.68, 0.95], [1.0, 0.95, 0.86], [0.88, 0.62, 0.86], [0.98, 0.6, 0.35]];
  for (const L of D.lots) {
    const z = L.zone; const r = mulberryLocal(L.id * 7919 + 13);
    L.fh = z === 'condo' ? 3.2 : 3.4; L.ground = z === 'mural' ? 0 : 4.6;
    L.top = (z === 'mansion' ? DY : 0) + (z === 'mural' ? 7 + r() * 3 : z === 'mansion' ? 7.6 : L.ground + (L.floors - 1) * L.fh + (z === 'condo' ? 0 : 0.6));
    L.wall = z === 'condo' ? (r() < 0.5 ? [0.94, 0.94, 0.92] : H.PASTEL[Math.floor(r() * H.PASTEL.length)]) : z === 'mural' ? [0.78, 0.76, 0.72].map((c) => c * (0.85 + r() * 0.2)) : z === 'mansion' ? [0.97, 0.97, 0.95] : LATIN[Math.floor(r() * LATIN.length)];
    L.glass = H.GLASS[Math.floor(r() * H.GLASS.length)];
    L.poly = wind(L.corners);
    L.y0 = z === 'mansion' ? DY : 0;
    if (!L.empty) col.addOBB(L.cx, L.cz, L.ux, L.uz, L.hl, L.hw, L.top, 'bld');
    else { for (let k = 0; k < 2; k++) palms.push({ x: L.cx + rand(-L.hl, L.hl) * 0.6, z: L.cz + rand(-L.hw, L.hw) * 0.6, h: rand(8, 12), lean: rand(-0.1, 0.1), rot: rand(0, 6), s: 1 }); }
    if (z === 'mansion') { // hedge along the street + palms by the water
      for (let a = -L.hl + 1; a < L.hl - 1; a += 2.2) shrubs.push({ x: L.cx + L.ux * a + L.face[0] * (L.hw + 2.2), z: L.cz + L.uz * a + L.face[1] * (L.hw + 2.2), s: 0.9 });
      for (let k = 0; k < 3; k++) { const a = rand(-L.hl, L.hl); palms.push({ x: L.cx + L.ux * a - L.face[0] * (L.hw + 2.5), z: L.cz + L.uz * a - L.face[1] * (L.hw + 2.5), h: rand(9, 14), lean: rand(-0.15, 0.15), rot: rand(0, 6), s: 1 }); }
    }
  }
  // ------------------------------------------------------------------ queries (ground height, land, nearest road) ----
  const cell = 40; const grid = new Map();
  for (const r of roads) for (let i = 0; i < r.path.n; i++) { const ix = Math.floor(r.path.X[i] / cell), iz = Math.floor(r.path.Z[i] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const k = (ix + dx) + ',' + (iz + dz); let l = grid.get(k); if (!l) grid.set(k, l = new Set()); l.add(r); } }
  const nq = {};
  const nearestRoad = (x, z, out = {}) => { const l = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)); out.road = null; out.dist = 1e9; if (!l) return out;
    for (const r of l) { r.path.nearest(x, z, nq); if (nq.dist - r.hw < out.dist - (out.road ? out.road.hw : 0)) { out.road = r; out.dist = nq.dist; out.s = nq.s; out.d = nq.d; out.tx = nq.tx; out.tz = nq.tz; } } return out; };
  const nr = {};
  const groundH = (x, z) => {
    if (x > -22 && Math.abs(z) <= ISLE.z0) return undefined; // original district (city.js)
    const az = Math.abs(z);
    // pearl island
    const dp = Math.hypot(x - pearl.cx, z - pearl.cz);
    // a_canaledge: the whole island polygon (its rim reaches 1.055 r; palms on the rim were planted 4 m down)
    if (dp < pearl.r * 0.97 || (dp < pearl.r * 1.06 && pointInPoly(x, z, PEARL_POLY))) { nearestRoad(x, z, nr); if (nr.road && (nr.road.id === 'pring' || nr.road.id === 'plink')) { const ad = nr.dist - nr.road.hw; if (ad < 0) return DY; if (ad < SW) return DY + 0.15; } return DY; }
    // a_canaledge: the natural island ends reach west of x = -22 (westCoast down to about -70); their grass + shore skirt used to be
    // read as open bay here (undefined -> -4 m), so the dune / mangrove vegetation there was planted 4 m under the grass and walkers swam on it
    const islandEnd = az > ISLE.z0 && az < ISLE.tip + 30 && x > -200 && x >= westCoast(z) - 9;
    if (x < -22 && x > shoreX(z) - 1 && !islandEnd) { // over the bay: causeway / link bridge
      nearestRoad(x, z, nr); if (!nr.road) return undefined; const r = nr.road;
      if (r.id === 'sun') { const h = r.h(nr.s, x); const ad = nr.dist - r.hw; if (ad < 0) return h; if (inBridge(x)) return ad < 1.6 ? h + 0.15 : undefined; if (ad < 5.2) return h + 0.15; if (ad < 9) return h + 0.15 - (ad - 5.2) * (1.75 + h) / 3.8; if (ad < 13.5) return -1.6 - (ad - 9) * 0.4; return undefined; }
      if (r.id === 'plink') return nr.dist - r.hw < 1.4 ? DY + (nr.dist > r.hw ? 0.15 : 0) : undefined;
      return undefined;
    }
    if (x <= shoreX(z) - 1) { // mainland
      if (H.inCanal && Math.abs(z) > 1000 && (H.inCanalWater || H.inCanal)(H.fab, x, z)) return undefined; // r6.3 finger canals (a_orphans: bridge decks stay dry)
      if (Math.abs(z) > 520 || x < -1420) return 0;
      nearestRoad(x, z, nr); const r = nr.road; if (r) { const ad = nr.dist - r.hw; const h = r.h(nr.s, x); if (ad < 0) return h; if (ad < SW) return h + 0.15; }
      const sh = D.byId.shore; if (x > -975) { sh.path.nearest(x, z, nq); if (nq.dist > sh.hw + SW && x > sh.path.at(nq.s).x && Math.abs(z - 16) > 14) return 0.15; } // bay park
      return 0;
    }
    if (az > ISLE.z0 && az < ISLE.tip + 30 && x > -200 && x < 335 + beachOff(z)) { // natural island ends
      const xw = westCoast(z); if (az > ISLE.tip) return undefined;
      if (x >= xw) return 0.15; if (x > xw - 9) return 0.15 - (xw - x) * (2.55 / 9); return undefined;
    }
    return undefined;
  };
  // ------------------------------------------------------------------ streaming (attach after the main World is built) ----
  const chunks = new Map();
  for (const L of D.lots) { let c = chunks.get(L.chunk); if (!c) chunks.set(L.chunk, c = { key: L.chunk, lots: [], x: 0, z: 0, far: [], det: null }); c.lots.push(L); }
  for (const c of chunks.values()) { c.x = c.lots.reduce((a, l) => a + l.cx, 0) / c.lots.length; c.z = c.lots.reduce((a, l) => a + l.cz, 0) / c.lots.length; c.r = Math.max(...c.lots.map((l) => Math.hypot(l.cx - c.x, l.cz - c.z) + l.hl + l.hw)); }
  const R5 = {
    data: D, walks, groundH, nearestRoad, chunks, inBridge, onWater,
    stats: { loads: 0, unloads: 0, loaded: 0 },
    attach(scene, M) {
      this.scene = scene; this.M = M; makeMurals(M);
      // far LOD: plain volumes, one World bucket per chunk so each chunk's far mesh can be hidden on its own
      const WF = new World(128); WF.attrs.building = { aWin: 4, aCol: 3, aGlass: 3, aUp: 3 };
      const fctx = { W: WF, col, signs: [], awnings: [], lamps: [], alleys: [], yards: [] };
      for (const L of D.lots) { if (L.empty) continue; const st = L.zone === 'condo' ? 1 : L.zone === 'mural' ? 4 : L.zone === 'mansion' ? 5 : 2;
        H.volume(fctx, L.poly, L.y0, L.top, { style: st, fh: L.fh, ww: 3.2, wall: L.wall, glass: L.glass, collide: false, relief: false }); }
      for (const m of WF.build(scene, M, {})) { const [, cx, cz] = m.name.split('|'); const k = cx + ',' + cz; let c = chunks.get(k); if (!c) continue; c.far.push(m); m.castShadow = true; }
      // orphan far meshes (a lot whose centroid chunk has no entry) stay visible permanently
    },
    // r6.2 hitch fix: a detailed chunk used to be generated AND built in one frame (the "near chunk pops in" stall). Now the
    // nearest wanted chunk is generated a few lots per frame under a ~3 ms budget and only built when complete; snapshot mode
    // (budget >= 99) still loads everything in range synchronously so tests and screenshots are deterministic.
    update(cam, budget = 1) {
      if (!this.M) return;
      let best = null, bd = 1e9;
      for (const c of chunks.values()) {
        const d = Math.hypot(cam.x - c.x, cam.z - c.z) - c.r;
        if (!c.det && d < 300) { if (budget >= 99) { if (this.job && this.job.c === c) this.job = null; this.load(c); } else if (d < bd) { bd = d; best = c; } }
        else if (c.det && d > 440) this.unload(c);
      }
      if (budget >= 99) return;
      this.pump(); // perf_debug5
      if (this.job && this.job.c !== best && (!best || bd < this.job.d - 60)) this.job = null; // a much nearer chunk wins
      if (!this.job && best) this.job = this.begin(best, bd);
      if (this.job && this.step(this.job, 3)) this.job = null;
    },
    begin(c, d) {
      const Wd = new World(128); Wd.attrs.building = { aWin: 4, aCol: 3, aGlass: 3, aUp: 3 };
      return { c, d, i: 0, Wd, dctx: { W: Wd, col, signs: [], awnings: [], lamps: [], alleys: [], yards: [] } };
    },
    step(j, ms) {
      const t0 = performance.now(); const L = j.c.lots;
      while (j.i < L.length) { if (!L[j.i].empty) detailedLot(j.dctx, L[j.i], H); j.i++; if (performance.now() - t0 > ms) return false; }
      this.finish(j.c, j.Wd); return true;
    },
    finish(c, Wd) {
      c.det = Wd.build(this.scene, this.M, { glassRail: { cast: false }, mural0: { cast: false }, mural1: { cast: false }, mural2: { cast: false }, mural3: { cast: false }, mural4: { cast: false }, mural5: { cast: false }, pool: { cast: false } });
      this.stats.loads++; this.stats.loaded++;
      // perf_debug5 (?oldtpwarm = old): the chunk's detailed meshes used to appear in the same frame they were built, so every
      // shader program they needed (new material variants first seen on that side of the map) was compiled and linked inside
      // that frame's draw (the 250-370 ms hitch after a teleport / respawn). Now they stay hidden behind the far LOD until
      // renderer.compileAsync says their programs are ready (non-blocking with KHR_parallel_shader_compile), then swap in.
      const A = this.async; if (!A || A.sync) { for (const m of c.far) m.visible = false; return; }
      const dets = c.det; for (const m of dets) m.visible = false; c.pend = true; this.stats.pend = (this.stats.pend || 0) + 1;
      this.gate(dets, () => { c.pend = false; this.stats.pend--; if (c.det !== dets) return; for (const m of dets) m.visible = true; for (const m of c.far) m.visible = false; });
    },
    // perf_debug5: call show() once every program the (hidden) meshes need is compiled: compileAsync with KHR_parallel_shader_compile,
    // otherwise queued for pump() (one new program linked per frame). Also used by the r6.2 detail stream (bldgdetail.js).
    gate(dets, show) { const A = this.async; if (!A || A.sync) { show(); return; }
      const R = A.renderer; if (A.par === undefined) A.par = !!R.extensions.get('KHR_parallel_shader_compile');
      if (A.par) { const fake = { traverse: (fn) => { for (const m of dets) fn(m); }, traverseVisible() {} }; try { R.compileAsync(fake, A.camera, A.scene).then(show, show); } catch (e) { show(); } return; }
      (A.q || (A.q = [])).push({ dets, i: 0, show });
    },
    pump() { const A = this.async; if (!A || !A.q || !A.q.length) return; const R = A.renderer, P = R.info.programs; const j = A.q[0];
      while (j.i < j.dets.length) { const m = j.dets[j.i++]; const n0 = P.length; let ms;
        try { ms = R.compile({ traverse: (fn) => fn(m), traverseVisible() {} }, A.camera, A.scene); } catch (e) { ms = null; }
        if (P.length > n0) { if (ms) for (const mt of ms) { const pr = R.properties.get(mt).currentProgram; if (pr) pr.getUniforms(); } return; } } // getUniforms: forces the link now
      A.q.shift(); j.show(); },
    load(c) { const A = this.async; const k = A && A.sync; if (A) A.sync = true; const j = this.begin(c, 0); this.step(j, 1e9); if (A) A.sync = k; },
    unload(c) { for (const m of c.det) { this.scene.remove(m); m.geometry.dispose(); } c.det = null; for (const m of c.far) m.visible = true; this.stats.unloads++; this.stats.loaded--; },
    // a road-following point ~35 m along the nearest region road that gets closer to (tx, tz); null if not on a region road
    waypoint(x, z, tx, tz) {
      nearestRoad(x, z, nr); if (!nr.road || nr.dist > nr.road.hw + 6) return null; const r = nr.road;
      const a = r.path.at(nr.s + 35), b = r.path.at(nr.s - 35);
      const da = Math.hypot(a.x - tx, a.z - tz), db = Math.hypot(b.x - tx, b.z - tz);
      return da < db ? { x: a.x, z: a.z } : { x: b.x, z: b.z };
    },
  };
  return R5;
}
function mulberryLocal(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ----------------------------------------------------------------------- detailed lot ----
// local box in the lot frame: along a (u axis), across b (w axis = (-uz, ux)), heights y0..y1
function obox(bk, L, a0, a1, b0, b1, y0, y1, col) {
  const P = (a, b) => [L.cx + L.ux * a - L.uz * b, L.cz + L.uz * a + L.ux * b];
  const poly = wind([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)]);
  prismWalls(bk, poly, y0, y1, null, col); polyCap(bk, poly, y1, {}, col);
}
function detailedLot(ctx, L, H) {
  const r = mulberryLocal(L.id * 104729 + 7); const R = (a, b) => a + (b - a) * r();
  const v = ctx.W.b('vcol', L.cx, L.cz);
  if (L.zone === 'mansion') {
    // modern villa: white two-storey volumes, ribbon glazing, cantilevered upper floor with a thin roof slab, pool + deck
    const y0 = L.y0; const main = L.hl * 0.9, dep = L.hw * 0.75;
    const P = (a, b) => [L.cx + L.ux * a - L.uz * b, L.cz + L.uz * a + L.ux * b];
    const rectL = (a0, a1, b0, b1) => wind([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)]);
    const fs = L.face[0] * -L.uz + L.face[1] * L.ux > 0 ? 1 : -1; // +b side faces the street?
    H.volume(ctx, rectL(-main, main * 0.35, -dep * fs, dep * 0.4 * fs), y0, y0 + 3.8, { style: 5, fh: 3.8, ww: 3, wall: L.wall, glass: [0.1, 0.16, 0.2], collide: false, relief: false });
    H.volume(ctx, rectL(-main * 0.55, main, -dep * 0.7 * fs, dep * 0.75 * fs), y0 + 3.8, y0 + 7.4, { style: 5, fh: 3.6, ww: 3, wall: L.wall, glass: [0.1, 0.16, 0.2], collide: false, relief: false });
    obox(v, L, -main * 0.6, main + 0.8, -dep * 0.75 - 0.9, dep * 0.8 + 0.9, y0 + 7.4, y0 + 7.65, [0.95, 0.95, 0.93]);
    obox(v, L, main * 0.95, main + 0.7, -dep * 0.75, -dep * 0.75 + 0.3, y0, y0 + 3.8, [0.3, 0.3, 0.3]);
    // pool on the water side + timber deck
    const pb = -fs * (dep + 2.5);
    obox(v, L, -main * 0.7, main * 0.6, pb - 3.2 * fs, pb + 0.6 * fs, y0, y0 + 0.08, [0.62, 0.48, 0.34]);
    const pool = ctx.W.b('pool', L.cx, L.cz); const pl = [P(-main * 0.55, pb - 2.6 * fs), P(main * 0.4, pb - 2.6 * fs), P(main * 0.4, pb), P(-main * 0.55, pb)];
    polyCap(pool, wind(pl), y0 + 0.1);
    for (let k = 0; k < 3; k++) obox(v, L, -main * 0.4 + k * 2.2, -main * 0.4 + k * 2.2 + 0.7, pb + 0.15 * fs, pb + 1.9 * fs, y0 + 0.08, y0 + 0.4, [0.92, 0.92, 0.9]);
    return;
  }
  if (L.zone === 'mural') {
    // warehouse: blank block walls (style 4) + roll-up doors on the street face + murals on the long faces
    H.volume(ctx, L.poly, 0, L.top, { style: 4, fh: L.top, ww: 8, wall: L.wall, glass: [0.2, 0.2, 0.2], collide: false, relief: false });
    obox(v, L, -L.hl - 0.15, L.hl + 0.15, -L.hw - 0.15, L.hw + 0.15, L.top, L.top + 0.5, L.wall.map((c) => c * 0.85));
    const fs = L.face[0] * -L.uz + L.face[1] * L.ux > 0 ? 1 : -1;
    for (let a = -L.hl + 4; a < L.hl - 4; a += 9) obox(v, L, a, a + 4.2, fs * L.hw - 0.04 * fs, fs * L.hw + 0.12 * fs, 0, 4.6, [0.55, 0.57, 0.6]);
    murals(ctx, L, 0.3, L.top - 0.4, r, true);
    roofClutter(ctx, L, L.top + 0.5, r, H);
    return;
  }
  const style = L.zone === 'condo' ? 1 : 2; const ww = R(2.6, 3.6);
  H.volume(ctx, L.poly, 0, L.top, { style, fh: L.fh, ww, wall: L.wall, glass: L.glass, store: true, storeW: R(3.8, 5.2), collide: false, relief: true, canopy: r() < 0.6 });
  if (L.zone === 'condo') { if (L.floors > 2) H.balconies(ctx, L.poly, 4.75, L.top, L.fh, ww, L.wall); }
  else if (L.floors > 1 && r() < 0.5) H.balconies(ctx, L.poly, 4.75, L.top, L.fh, ww, L.wall);
  // stucco parapet with a coloured coping band (Latin low-rise), striped awning over the shop door
  obox(v, L, -L.hl - 0.1, L.hl + 0.1, -L.hw - 0.1, L.hw + 0.1, L.top, L.top + 0.7, L.wall.map((c) => Math.min(1, c * 1.05)));
  obox(v, L, -L.hl - 0.18, L.hl + 0.18, -L.hw - 0.18, L.hw + 0.18, L.top + 0.7, L.top + 0.85, [0.95, 0.94, 0.9]);
  if (L.zone === 'latin') {
    const fs = L.face[0] * -L.uz + L.face[1] * L.ux > 0 ? 1 : -1; const cols = [[0.85, 0.15, 0.18], [0.1, 0.45, 0.35], [0.95, 0.75, 0.15], [0.15, 0.3, 0.7]];
    const c1 = cols[Math.floor(r() * cols.length)];
    const a0 = R(-L.hl + 1, -1), a1 = a0 + R(3, Math.min(8, L.hl * 1.4)); const b0 = fs * L.hw, b1 = fs * (L.hw + 1.6);
    const n = Math.max(2, Math.round((a1 - a0) / 0.5));
    for (let k = 0; k < n; k++) { const aa = a0 + (k * (a1 - a0)) / n, ab = a0 + ((k + 1) * (a1 - a0)) / n;
      const P = (a, b, y) => [L.cx + L.ux * a - L.uz * b, y, L.cz + L.uz * a + L.ux * b];
      quadUp(v, [P(aa, b0, 3.9), P(ab, b0, 3.9), P(ab, b1, 3.25), P(aa, b1, 3.25)], [[0, 0], [1, 0], [1, 1], [0, 1]], null, k % 2 ? [0.95, 0.94, 0.9] : c1);
      quadUp(v, [P(aa, b1, 3.25), P(ab, b1, 3.25), P(ab, b1, 2.95), P(aa, b1, 2.95)].map((p) => [p[0], p[1], p[2]]), [[0, 0], [1, 0], [1, 1], [0, 1]], null, k % 2 ? [0.95, 0.94, 0.9] : c1); }
    if (L.mural) murals(ctx, L, 0.4, L.top - 0.2, r, false);
  }
  roofClutter(ctx, L, L.top, r, H);
}
function roofClutter(ctx, L, y, r, H) {
  const v = ctx.W.b('vcol', L.cx, L.cz); const met = [0.62, 0.64, 0.66], dark = [0.16, 0.17, 0.18];
  const n = Math.min(6, Math.floor((L.hl * L.hw) / 25) + 1);
  for (let i = 0; i < n; i++) { const a = (r() * 2 - 1) * (L.hl - 2), b = (r() * 2 - 1) * (L.hw - 2); obox(v, L, a - 0.65, a + 0.65, b - 0.65, b + 0.65, y, y + 1.0, met);
    const c = [L.cx + L.ux * a - L.uz * b, L.cz + L.uz * a + L.ux * b]; H.gput(v, H.rgeo().fan, c[0], y + 1.0, c[1], dark, 0.48, 0.04, 0.48); }
  if (r() < 0.4 && L.hl > 5 && L.hw > 5) { const c = [L.cx + L.ux * (L.hl * 0.4), L.cz + L.uz * (L.hl * 0.4)]; const G = H.rgeo(); const wood = [0.5, 0.38, 0.28];
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) H.gput(v, G.thin, c[0] + lx, y, c[1] + lz, dark, 0.07, 2.2, 0.07);
    H.gput(v, G.cyl, c[0], y + 2.2, c[1], wood, 1.3, 2.4, 1.3); H.gput(v, G.cone, c[0], y + 4.6, c[1], dark, 1.35, 0.7, 1.35); }
}
// murals: painted canvas panels on the walls that do not face the street (or every wall of a warehouse)
function murals(ctx, L, y0, y1, r, all) {
  const P = L.poly;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 7) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len; let ox = -uz, oz = ux; // outward for geo.js winding
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if ((mx - L.cx) * ox + (mz - L.cz) * oz < 0) { ox = -ox; oz = -oz; }
    const facesStreet = ox * L.face[0] + oz * L.face[1] > 0.6; if (!all && facesStreet) continue; if (r() < (all ? 0.15 : 0.35)) continue;
    const m = 'mural' + Math.floor(r() * 6); const bk = ctx.W.b(m, mx, mz, {});
    const i0 = len * R01(r, 0.04, 0.18), i1 = len * R01(r, 0.82, 0.96); if (y0 < 1) shopMural(a, b, i0, i1); /* a_shopnight2: no shop-front pool under a mural */ const ya = y0, yb = Math.min(y1, y0 + (i1 - i0) * 0.62 + r() * 2);
    const A = [a[0] + ux * i0 + ox * 0.045, a[1] + uz * i0 + oz * 0.045], Bq = [a[0] + ux * i1 + ox * 0.045, a[1] + uz * i1 + oz * 0.045];
    const v0 = V3(A[0], ya, A[1]), v1 = V3(Bq[0], ya, Bq[1]), v2 = V3(Bq[0], yb, Bq[1]), v3 = V3(A[0], yb, A[1]);
    const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v3, v0));
    const ar = (i1 - i0) / (yb - ya); const u1 = Math.min(1, ar / 2.2); // texture is 2:1, keep the aspect
    if (n.x * ox + n.z * oz >= 0) bk.quad(v0, v1, v2, v3, [0, 0, u1, 0, u1, 1, 0, 1]); else bk.quad(v1, v0, v3, v2, [u1, 0, 0, 0, 0, 1, u1, 1]);
  }
}
const R01 = (r, a, b) => a + (b - a) * r();

// ----------------------------------------------------------------------- mural textures (original, procedural) ----
let MURALS_DONE = false;
function makeMurals(M) {
  if (MURALS_DONE) return; MURALS_DONE = true;
  const r = mulberryLocal(424242);
  const pal = [['#ff5a5f', '#ffb400', '#00a699', '#2b2d42', '#f7f7f2'], ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'], ['#3d348b', '#7678ed', '#f7b801', '#f18701', '#f35b04'],
    ['#06d6a0', '#118ab2', '#073b4c', '#ffd166', '#ef476f'], ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'], ['#0b132b', '#1c2541', '#3a506b', '#5bc0be', '#f2e94e']];
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'); const P = pal[k];
    g.fillStyle = P[4]; g.fillRect(0, 0, 1024, 512);
    if (k % 3 === 0) { // sunset bands + sun + palm silhouettes
      for (let i = 0; i < 6; i++) { g.fillStyle = P[i % 4]; g.fillRect(0, i * 60, 1024, 62); }
      g.fillStyle = P[1]; g.beginPath(); g.arc(512 + (r() - 0.5) * 300, 330, 140, Math.PI, 0); g.fill();
      g.fillStyle = P[3]; for (let w = 0; w < 5; w++) { g.beginPath(); g.moveTo(0, 360 + w * 30); for (let x = 0; x <= 1024; x += 16) g.lineTo(x, 360 + w * 30 + Math.sin(x * 0.02 + w) * 10); g.lineTo(1024, 512); g.lineTo(0, 512); g.globalAlpha = 0.5 + w * 0.1; g.fill(); } g.globalAlpha = 1;
      for (let p = 0; p < 3; p++) { const x = 120 + p * 380 + r() * 80; g.strokeStyle = '#111'; g.lineWidth = 10; g.beginPath(); g.moveTo(x, 512); g.quadraticCurveTo(x + 30, 330, x + 10, 180); g.stroke();
        g.fillStyle = '#111'; for (let f = 0; f < 7; f++) { const a = (f / 7) * Math.PI * 2; g.beginPath(); g.ellipse(x + 10 + Math.cos(a) * 55, 180 + Math.sin(a) * 22, 60, 10, a, 0, Math.PI * 2); g.fill(); } }
    } else if (k % 3 === 1) { // big tropical leaves + flowers
      for (let i = 0; i < 26; i++) { const x = r() * 1024, y = r() * 512, s = 50 + r() * 120, a = r() * 6.28; g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = P[Math.floor(r() * 4)];
        g.beginPath(); g.ellipse(0, 0, s, s * 0.38, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
        for (let v = -3; v <= 3; v++) { g.beginPath(); g.moveTo(v * s / 4, 0); g.lineTo(v * s / 4 + s / 5, -s * 0.3); g.stroke(); } g.restore(); }
      for (let i = 0; i < 12; i++) { const x = r() * 1024, y = r() * 512; g.fillStyle = P[(i + 2) % 5]; for (let p = 0; p < 5; p++) { const a = (p / 5) * 6.28; g.beginPath(); g.ellipse(x + Math.cos(a) * 18, y + Math.sin(a) * 18, 20, 11, a, 0, 6.28); g.fill(); } g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(x, y, 9, 0, 6.28); g.fill(); }
    } else { // geometric tiles + a stylised face of an original character (abstract)
      for (let y = 0; y < 512; y += 64) for (let x = 0; x < 1024; x += 64) { g.fillStyle = P[((x + y) / 64) % 4 | 0]; g.beginPath(); if (((x + y) / 64) % 2) { g.moveTo(x, y); g.lineTo(x + 64, y); g.lineTo(x, y + 64); } else { g.arc(x + 32, y + 32, 28, 0, 6.28); } g.fill(); }
      g.fillStyle = P[4]; g.beginPath(); g.ellipse(512, 260, 170, 210, 0, 0, 6.28); g.fill();
      g.fillStyle = P[0]; g.beginPath(); g.ellipse(450, 230, 26, 14, 0, 0, 6.28); g.ellipse(574, 230, 26, 14, 0, 0, 6.28); g.fill();
      g.strokeStyle = P[3]; g.lineWidth = 14; g.beginPath(); g.arc(512, 300, 70, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = P[1]; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(512 + (i - 4) * 50, 70); g.lineTo(512 + (i - 4) * 50 + 25, -10); g.lineTo(512 + (i - 4) * 50 + 50, 70); g.fill(); }
    }
    // weathering: grime gradient at the bottom, faded spots, paint drips
    const gr = g.createLinearGradient(0, 380, 0, 512); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`; g.beginPath(); g.arc(r() * 1024, r() * 512, 6 + r() * 40, 0, 6.28); g.fill(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = P[Math.floor(r() * 4)]; const x = r() * 1024, y = r() * 300; g.fillRect(x, y, 3, 20 + r() * 60); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
    M['mural' + k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  }
}
