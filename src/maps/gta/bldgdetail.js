// r6.2 「建模一个个攻」: real geometric building detail for map A 索拉纳港, one archetype at a time.
// Everything here is STREAMED per 128 m chunk (built when the camera comes within LOAD m, disposed past FREE m), so the resident
// city keeps its triangle count; each building registers a job (a closure + a position-derived seed), so a chunk rebuilds
// identically after unloading. All randomness is local (mulb), the city's global rng sequence (= layout) is untouched.
// Strictly non-neon: painted sign boards, metal, stucco, glass — nothing emissive.
import * as THREE from 'three';
import { World, prismWalls, polyCap } from '../../geo.js';

export const DLOAD = 230, DFREE = 380;
export function mulb(seed) { let a = (seed | 0) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const seedOf = (x, z, k = 0) => Math.round(x * 73.13 + z * 131.71 + k * 7919) ^ 0x5bd1e995;

// ------------------------------------------------------------------------------------------------ streaming ----
export function detailStream(chunk = 128) {
  const cells = new Map();
  const S = {
    cells, stats: { loads: 0, unloads: 0, loaded: 0, jobs: 0 },
    add(x, z, r, fn) { const k = Math.floor(x / chunk) + ',' + Math.floor(z / chunk); let c = cells.get(k); if (!c) cells.set(k, c = { k, jobs: [], x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9, det: null });
      c.jobs.push(fn); c.x0 = Math.min(c.x0, x - r); c.z0 = Math.min(c.z0, z - r); c.x1 = Math.max(c.x1, x + r); c.z1 = Math.max(c.z1, z + r); S.stats.jobs++; },
    attach(scene, M) { S.scene = scene; S.M = M; },
    dist(c, p) { const dx = Math.max(c.x0 - p.x, 0, p.x - c.x1), dz = Math.max(c.z0 - p.z, 0, p.z - c.z1); return Math.hypot(dx, dz); },
    update(p, budget = 1) {
      if (!S.M) return;
      for (const c of cells.values()) { const d = S.dist(c, p);
        if (!c.det && d < DLOAD && budget > 0) { S.load(c); budget--; } else if (c.det && d > DFREE) S.unload(c); }
    },
    world() { const W = new World(128); W.attrs.building = { aWin: 4, aCol: 3, aGlass: 3, aUp: 3 }; return W; },
    load(c) { const W = S.world(); for (const fn of c.jobs) fn(W); c.det = W.build(S.scene, S.M, { glassRail: { cast: false }, dglass: { cast: false } }); S.mark(c.det); S.stats.loads++; S.stats.loaded++; },
    // A/B switch (tests / before-after shots): hides every r6.2 detail mesh, including the per-lot detail inside region chunks
    show: true, marked: new Set(),
    mark(ms) { for (const m of ms) { m.userData.r62 = true; m.visible = S.show; S.marked.add(m); } },
    setVisible(on) { S.show = !!on; for (const m of S.marked) { if (!m.parent) S.marked.delete(m); else m.visible = S.show; } return S.marked.size; },
    unload(c) { for (const m of c.det) { S.scene.remove(m); m.geometry.dispose(); S.marked.delete(m); } c.det = null; S.stats.unloads++; S.stats.loaded--; },
    // Node / test helper: triangles every job would add, grouped by job tag
    measure() { const by = {}; let tot = 0; for (const c of cells.values()) for (const fn of c.jobs) { const W = S.world(); fn(W); let t = 0; for (const b of W.buckets.values()) t += b.idx.length / 3; tot += t; by[fn.tag || '?'] = (by[fn.tag || '?'] || 0) + t; }
      return { tot: Math.round(tot), cells: cells.size, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v)])) }; },
  };
  return S;
}
export const job = (tag, fn) => { fn.tag = tag; return fn; };

// ------------------------------------------------------------------------------------------------ primitives ----
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
export const wind = (P) => (area2(P) > 0 ? P.slice().reverse() : P);
const UV = [0, 0, 1, 0, 1, 1, 0, 1];
// local frame: a along (ux, uz), b across (-uz, ux)
export const frame = (cx, cz, ux = 1, uz = 0) => ({ cx, cz, ux, uz, P: (a, b) => [cx + ux * a - uz * b, cz + uz * a + ux * b] });
// oriented box in a frame
export function fbox(bk, F, a0, a1, b0, b1, y0, y1, col, bottom = false) {
  const poly = wind([F.P(a0, b0), F.P(a1, b0), F.P(a1, b1), F.P(a0, b1)]);
  prismWalls(bk, poly, y0, y1, null, col); polyCap(bk, poly, y1, {}, col); if (bottom) polyCap(bk, poly, y0, {}, col, true);
}
// polygon edges with a guaranteed outward normal (checked against the centroid)
export function edgesOf(poly) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length; const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]; const len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 0.05) continue;
    const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len; let ox = -dz, oz = dx;
    if (((p[0] + q[0]) / 2 - cx) * ox + ((p[1] + q[1]) / 2 - cz) * oz < 0) { ox = -ox; oz = -oz; }
    out.push({ i, len, p, q, dx, dz, ox, oz, P: (a, d) => [p[0] + dx * a + ox * d, p[1] + dz * a + oz * d] });
  }
  return out;
}
// box in an edge frame: a along the wall, d outward from the wall face (d0 < 0 buries it), y up. Inner face skipped when buried.
export function lb(bk, E, a0, a1, d0, d1, y0, y1, col, bottom = false) {
  const poly = [E.P(a0, d1), E.P(a1, d1), E.P(a1, d0), E.P(a0, d0)];
  const pw = area2(poly) > 0 ? poly.slice().reverse() : poly; // CCW (geo.js convention) so prismWalls faces point out
  for (let k = 0; k < 4; k++) { const p = pw[k], q = pw[(k + 1) % 4];
    if (d0 <= 0 && d0 > -0.06 && Math.abs(((p[0] + q[0]) / 2 - E.p[0]) * E.ox + ((p[1] + q[1]) / 2 - E.p[1]) * E.oz - d0) < 1e-4) continue;
    bk.quad(V3(p[0], y0, p[1]), V3(q[0], y0, q[1]), V3(q[0], y1, q[1]), V3(p[0], y1, p[1]), UV, {}, col); }
  polyCap(bk, pw, y1, {}, col); if (bottom) polyCap(bk, pw, y0, {}, col, true);
}
// sloped plate (awning / canopy) in an edge frame: from (d0, ya) at the wall to (d1, yb) outward, thickness t
export function slope(bk, E, a0, a1, d0, d1, ya, yb, col) {
  const A = E.P(a0, d0), B = E.P(a1, d0), C = E.P(a1, d1), D = E.P(a0, d1);
  const q = (p1, y1, p2, y2, p3, y3, p4, y4) => { const v = [V3(p1[0], y1, p1[1]), V3(p2[0], y2, p2[1]), V3(p3[0], y3, p3[1]), V3(p4[0], y4, p4[1])];
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[3], v[0])); if (n.y < 0) v.reverse(); bk.quad(v[0], v[1], v[2], v[3], UV, {}, col); };
  q(A, ya, B, ya, C, yb, D, yb); // top
  { const v = [V3(A[0], ya - 0.03, A[1]), V3(B[0], ya - 0.03, B[1]), V3(C[0], yb - 0.03, C[1]), V3(D[0], yb - 0.03, D[1])]; // underside (seen from the sidewalk)
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[3], v[0])); if (n.y > 0) v.reverse(); bk.quad(v[0], v[1], v[2], v[3], UV, {}, col.map((c) => c * 0.72)); }
  for (const [P0, P1] of [[A, D], [B, C]]) { const v = [V3(P0[0], ya, P0[1]), V3(P1[0], yb, P1[1]), V3(P1[0], yb - 0.25, P1[1]), V3(P0[0], ya - 0.03, P0[1])]; // side cheeks, both faces
    bk.quad(v[0], v[1], v[2], v[3], UV, {}, col); bk.quad(v[3], v[2], v[1], v[0], UV, {}, col); }
  const v = [V3(D[0], yb - 0.25, D[1]), V3(C[0], yb - 0.25, C[1]), V3(C[0], yb, C[1]), V3(D[0], yb, D[1])]; // valance
  const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[3], v[0])); if (n.x * E.ox + n.z * E.oz < 0) { v.reverse(); }
  bk.quad(v[0], v[1], v[2], v[3], UV, {}, col);
}
const G = {};
export function geos() {
  if (G.cyl) return G;
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1); G.cyl.translate(0, 0.5, 0);
  G.cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); G.cyl6.translate(0, 0.5, 0);
  G.fan = new THREE.CylinderGeometry(1, 1, 1, 8, 1); G.fan.translate(0, 0.5, 0);
  G.cone = new THREE.ConeGeometry(1, 1, 12, 1); G.cone.translate(0, 0.5, 0);
  G.dome = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  G.dish = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.35); G.dish.rotateX(Math.PI / 2);
  return G;
}
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();
export function put(bk, g, x, y, z, col, sx = 1, sy = 1, sz = 1, ry = 0) { _m.makeRotationY(ry).scale(_s.set(sx, sy, sz)).setPosition(x, y, z); bk.geom(g, _m, {}, col); }
const mix = (c, k, add = 0) => c.map((v) => Math.min(1, v * k + add));

// ------------------------------------------------------------------------------------------------ elements ----
export const COL = { alu: [0.62, 0.64, 0.66], dkalu: [0.2, 0.21, 0.23], steel: [0.48, 0.5, 0.52], glass: [0.06, 0.09, 0.11], conc: [0.72, 0.71, 0.68], cap: [0.84, 0.83, 0.8],
  rubber: [0.14, 0.14, 0.15], white: [0.93, 0.93, 0.91], wood: [0.5, 0.36, 0.24], rust: [0.42, 0.28, 0.2], green: [0.16, 0.36, 0.2] };

// rainwater downspout on a wall: hopper head under the parapet, pipe, shoe at the foot
export function downspout(bk, E, a, y0, y1, col = COL.dkalu) {
  lb(bk, E, a - 0.07, a + 0.07, -0.01, 0.16, y0 + 0.25, y1 - 0.45, col);
  lb(bk, E, a - 0.17, a + 0.17, -0.01, 0.28, y1 - 0.45, y1 - 0.12, col, true);
  for (let y = y0 + 2.2; y < y1 - 1; y += 2.6) lb(bk, E, a - 0.1, a + 0.1, -0.01, 0.19, y, y + 0.05, col); // straps
  lb(bk, E, a - 0.08, a + 0.08, -0.01, 0.38, y0 + 0.02, y0 + 0.25, col);
}
// framed door (single / double), optional canopy and steps; y0 = sill level
export function door(bk, E, a, w, h, y0, o = {}) {
  const fr = o.frame || COL.dkalu, leaf = o.leaf || COL.glass, sur = o.surround;
  lb(bk, E, a - w / 2, a + w / 2, -0.02, 0.03, y0, y0 + h, leaf); // leaf (glass / painted)
  lb(bk, E, a - w / 2 - 0.09, a - w / 2, -0.02, 0.08, y0, y0 + h + 0.09, fr); lb(bk, E, a + w / 2, a + w / 2 + 0.09, -0.02, 0.08, y0, y0 + h + 0.09, fr);
  lb(bk, E, a - w / 2, a + w / 2, -0.02, 0.08, y0 + h, y0 + h + 0.09, fr);
  if (o.double) lb(bk, E, a - 0.03, a + 0.03, -0.02, 0.07, y0, y0 + h, fr);
  lb(bk, E, a - w * 0.18 - 0.02, a - w * 0.18 + 0.02, 0.03, 0.09, y0 + h * 0.45, y0 + h * 0.55, COL.steel); // pull handle
  if (o.transom) { lb(bk, E, a - w / 2, a + w / 2, -0.02, 0.06, y0 + h + 0.09, y0 + h + 0.15, fr); lb(bk, E, a - w / 2, a + w / 2, -0.02, 0.02, y0 + h + 0.15, y0 + h + 0.7, leaf); lb(bk, E, a - w / 2 - 0.09, a + w / 2 + 0.09, -0.02, 0.08, y0 + h + 0.7, y0 + h + 0.79, fr); }
  if (sur) { const ht = h + (o.transom ? 0.79 : 0.09); lb(bk, E, a - w / 2 - 0.35, a - w / 2 - 0.09, -0.02, 0.16, y0, y0 + ht + 0.3, sur); lb(bk, E, a + w / 2 + 0.09, a + w / 2 + 0.35, -0.02, 0.16, y0, y0 + ht + 0.3, sur); lb(bk, E, a - w / 2 - 0.45, a + w / 2 + 0.45, -0.02, 0.2, y0 + ht, y0 + ht + 0.32, sur, true); }
  if (o.canopy) { const ht = h + (o.transom ? 0.79 : 0.09) + 0.35; lb(bk, E, a - w / 2 - 0.5, a + w / 2 + 0.5, 0, o.canopy, y0 + ht, y0 + ht + 0.14, o.canopyCol || COL.dkalu, true);
    for (const s of [-1, 1]) lb(bk, E, a + s * (w / 2 + 0.3) - 0.02, a + s * (w / 2 + 0.3) + 0.02, 0.05, o.canopy - 0.1, y0 + ht + 0.14, y0 + ht + 0.14 + o.canopy * 0.55, COL.steel); }
  if (o.steps) for (let k = 0; k < o.steps; k++) lb(bk, E, a - w / 2 - 0.4 + k * 0.1, a + w / 2 + 0.4 - k * 0.1, 0, 0.35 * (o.steps - k) + 0.05, y0 - 0.15 * (o.steps - k), y0 - 0.15 * (o.steps - k - 1), o.stepCol || COL.cap);
}
// painted (non-lit) fascia sign board with a raised frame and two gooseneck spot lamps
export function signBoard(bk, E, a0, a1, y, h, board, trim) {
  lb(bk, E, a0, a1, -0.01, 0.1, y, y + h, board, true);
  lb(bk, E, a0 - 0.05, a1 + 0.05, -0.01, 0.16, y + h, y + h + 0.06, trim, true); lb(bk, E, a0 - 0.05, a1 + 0.05, -0.01, 0.16, y - 0.06, y, trim, true);
  lb(bk, E, a0 - 0.05, a0, -0.01, 0.16, y, y + h, trim); lb(bk, E, a1, a1 + 0.05, -0.01, 0.16, y, y + h, trim);
  // a painted stripe / logo block so the board does not read as a blank panel
  const w = a1 - a0; lb(bk, E, a0 + w * 0.08, a0 + w * 0.08 + Math.min(h * 0.7, w * 0.2), 0.1, 0.12, y + h * 0.15, y + h * 0.85, trim);
  lb(bk, E, a0 + w * 0.08 + Math.min(h * 0.7, w * 0.2) + 0.25, a1 - w * 0.08, 0.1, 0.115, y + h * 0.4, y + h * 0.6, trim);
  for (const a of [a0 + w * 0.22, a1 - w * 0.22]) { lb(bk, E, a - 0.02, a + 0.02, 0.1, 0.55, y + h + 0.25, y + h + 0.29, COL.dkalu); lb(bk, E, a - 0.07, a + 0.07, 0.48, 0.62, y + h + 0.16, y + h + 0.3, COL.dkalu, true); }
}
// projecting blade sign on a bracket (perpendicular to the wall)
export function bladeSign(bk, E, a, y, h, board, trim) {
  lb(bk, E, a - 0.03, a + 0.03, -0.01, 1.2, y + h + 0.05, y + h + 0.11, COL.dkalu, true); // bracket arm
  lb(bk, E, a - 0.1, a + 0.1, -0.01, 0.06, y + h - 0.2, y + h + 0.3, COL.dkalu); // wall plate
  lb(bk, E, a - 0.05, a + 0.05, 0.25, 1.1, y, y + h, board, true);
  lb(bk, E, a - 0.065, a + 0.065, 0.36, 0.99, y + h * 0.14, y + h * 0.86, trim); lb(bk, E, a - 0.07, a + 0.07, 0.45, 0.9, y + h * 0.3, y + h * 0.4, board); // painted lettering panel both faces (r6.2: blank dark boards read as black slabs)
  lb(bk, E, a - 0.07, a + 0.07, 0.22, 1.13, y - 0.05, y, trim, true); lb(bk, E, a - 0.07, a + 0.07, 0.22, 1.13, y + h, y + h + 0.05, trim, true);
}
// through-wall / window AC unit with a bracket and a drip stain block
export function wallAC(bk, E, a, y) {
  lb(bk, E, a - 0.36, a + 0.36, -0.01, 0.42, y, y + 0.44, [0.8, 0.8, 0.77], true);
  lb(bk, E, a - 0.3, a + 0.3, 0.42, 0.44, y + 0.06, y + 0.38, [0.3, 0.31, 0.32]); // grille
  for (const s of [-0.28, 0.28]) lb(bk, E, a + s - 0.02, a + s + 0.02, -0.01, 0.4, y - 0.25, y, COL.dkalu);
}
// security grille over a ground-floor opening (vertical bars + two rails)
export function grille(bk, E, a0, a1, y0, y1, col = COL.dkalu) {
  const n = Math.max(3, Math.round((a1 - a0) / 0.22));
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; lb(bk, E, a - 0.012, a + 0.012, 0.06, 0.09, y0, y1, col); }
  for (const y of [y0, y0 + (y1 - y0) * 0.5, y1 - 0.04]) lb(bk, E, a0, a1, 0.05, 0.1, y, y + 0.04, col);
}
// metal guard rail along a polyline (posts + top + mid rail) at height y
export function railing(bk, pts, y, h = 1.05, col = COL.steel, post = 1.5) {
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1]; const len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 0.2) continue;
    const E = { len, p, dx: (q[0] - p[0]) / len, dz: (q[1] - p[1]) / len }; E.ox = -E.dz; E.oz = E.dx; E.P = (a, d) => [p[0] + E.dx * a + E.ox * d, p[1] + E.dz * a + E.oz * d];
    const n = Math.max(1, Math.round(len / post)); for (let k = 0; k <= n; k++) { if (k === 0 && i > 0) continue; const a = len * k / n; lb(bk, E, a - 0.03, a + 0.03, -0.03, 0.03, y, y + h, col); }
    lb(bk, E, -0.03, len + 0.03, -0.035, 0.035, y + h - 0.05, y + h, col, true); lb(bk, E, 0, len, -0.015, 0.015, y + h * 0.5, y + h * 0.5 + 0.03, col, true);
  }
}
// rooftop kit in a frame F over [a0,a1] x [b0,b1] at roof level y. Places a stair bulkhead with a framed door, condensers with fan
// discs, vent stacks, a roof hatch, a satellite dish, an antenna mast and (sometimes) a water tank; avoids the rectangles in excl.
export function roofKit(bk, F, a0, a1, b0, b1, y, r, o = {}) {
  const Gm = geos(); const used = (o.excl || []).slice(); const W = a1 - a0, D = b1 - b0; if (W < 4 || D < 4) return;
  const R = (lo, hi) => lo + (hi - lo) * r();
  const free = (p0, q0, p1, q1) => !used.some((u) => p0 < u[2] && p1 > u[0] && q0 < u[3] && q1 > u[1]);
  const place = (w, d, m = 0.7) => { for (let i = 0; i < 14; i++) { const a = R(a0 + m, a1 - m - w), b = R(b0 + m, b1 - m - d); if (free(a - 0.5, b - 0.5, a + w + 0.5, b + d + 0.5)) { used.push([a, b, a + w, b + d]); return [a, b]; } } return null; };
  const C = (a, b) => F.P(a, b);
  // stair bulkhead with a door + parapet-height cap overhang
  if (o.stair !== false && W > 7 && D > 7) { const w = 2.6, d = 3.4; const s = place(w, d, 1.2); if (s) { const h = R(2.6, 3.0); const wc = o.wall || COL.conc;
    fbox(bk, F, s[0], s[0] + w, s[1], s[1] + d, y, y + h, wc); fbox(bk, F, s[0] - 0.15, s[0] + w + 0.15, s[1] - 0.15, s[1] + d + 0.15, y + h, y + h + 0.18, COL.cap);
    const E = edgesOf(wind([C(s[0], s[1]), C(s[0] + w, s[1]), C(s[0] + w, s[1] + d), C(s[0], s[1] + d)])).sort((p, q) => q.len - p.len)[1 + Math.floor(r() * 2) % 2] || null;
    if (E) door(bk, E, E.len / 2, 0.9, 2.05, y + 0.02, { leaf: [0.42, 0.44, 0.46], frame: COL.dkalu });
    put(bk, Gm.cyl6, ...centerY(C(s[0] + w * 0.3, s[1] + d * 0.5), y + h + 0.18), COL.steel, 0.07, 0.9, 0.07); } }
  // condensers (box + fan disc + guard)
  const nac = Math.min(o.maxAC ?? 7, Math.max(1, Math.floor(W * D / 55)));
  for (let i = 0; i < nac; i++) { const big = r() < 0.3; const w = big ? 2.2 : 1.2, d = big ? 1.2 : 1.0; const s = place(w, d); if (!s) break; fbox(bk, F, s[0], s[0] + w, s[1], s[1] + d, y + 0.15, y + (big ? 1.25 : 0.95), COL.alu);
    fbox(bk, F, s[0] + 0.1, s[0] + 0.25, s[1] - 0.05, s[1] + d + 0.05, y, y + 0.15, COL.dkalu); fbox(bk, F, s[0] + w - 0.25, s[0] + w - 0.1, s[1] - 0.05, s[1] + d + 0.05, y, y + 0.15, COL.dkalu);
    const nf = big ? 2 : 1; for (let k = 0; k < nf; k++) { const c = C(s[0] + w * (k + 0.5) / nf, s[1] + d / 2); put(bk, Gm.fan, c[0], y + (big ? 1.25 : 0.95), c[1], COL.rubber, 0.42, 0.03, 0.42); put(bk, Gm.fan, c[0], y + (big ? 1.28 : 0.98), c[1], COL.alu, 0.1, 0.03, 0.1); }
    if (r() < 0.6) { const c0 = C(s[0] + w / 2, s[1] + d / 2); const c1 = C(s[0] + w / 2, s[1] + d + 1.6); // refrigerant line set to the roof edge
      const E = { len: Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) }; E.dx = (c1[0] - c0[0]) / E.len; E.dz = (c1[1] - c0[1]) / E.len; E.ox = -E.dz; E.oz = E.dx; E.p = c0; E.P = (a, dd) => [c0[0] + E.dx * a + E.ox * dd, c0[1] + E.dz * a + E.oz * dd];
      lb(bk, E, d / 2, E.len, -0.04, 0.04, y + 0.12, y + 0.2, COL.rubber); } }
  // vent stacks + plumbing vents
  for (let i = 0; i < (o.vents ?? 3); i++) { const s = place(0.5, 0.5, 0.5); if (!s) break; const c = C(s[0] + 0.25, s[1] + 0.25); const big = r() < 0.4;
    put(bk, Gm.cyl, c[0], y, c[1], COL.steel, big ? 0.22 : 0.06, big ? 1.1 : 0.7, big ? 0.22 : 0.06); if (big) put(bk, Gm.cone, c[0], y + 1.2, c[1], COL.steel, 0.36, 0.25, 0.36); }
  // roof hatch
  if (r() < 0.5) { const s = place(1, 1); if (s) { fbox(bk, F, s[0], s[0] + 1, s[1], s[1] + 1, y, y + 0.45, COL.alu); fbox(bk, F, s[0] - 0.05, s[0] + 1.05, s[1] - 0.05, s[1] + 1.05, y + 0.45, y + 0.52, COL.steel); } }
  // water tank on a steel stand (Florida rooftops: white poly tank)
  if (o.tank !== false && r() < (o.tankP ?? 0.35) && W > 8 && D > 8) { const s = place(2.6, 2.6); if (s) { const c = C(s[0] + 1.3, s[1] + 1.3); const th = R(1.6, 2.4);
    for (const [la, lb2] of [[0.3, 0.3], [2.3, 0.3], [2.3, 2.3], [0.3, 2.3]]) { const p = C(s[0] + la, s[1] + lb2); put(bk, Gm.cyl6, p[0], y, p[1], COL.dkalu, 0.06, 1.3, 0.06); }
    fbox(bk, F, s[0] + 0.1, s[0] + 2.5, s[1] + 0.1, s[1] + 2.5, y + 1.3, y + 1.42, COL.dkalu);
    put(bk, Gm.cyl, c[0], y + 1.42, c[1], o.tankCol || COL.white, 1.05, th, 1.05); put(bk, Gm.dome, c[0], y + 1.42 + th, c[1], o.tankCol || COL.white, 1.05, 0.35, 1.05); } }
  // satellite dish on a short pole + antenna mast with cross arms
  if (r() < 0.6) { const s = place(1, 1); if (s) { const c = C(s[0] + 0.5, s[1] + 0.5); put(bk, Gm.cyl6, c[0], y, c[1], COL.steel, 0.04, 1.0, 0.04); put(bk, Gm.dish, c[0], y + 1.1, c[1], [0.9, 0.9, 0.88], 0.45, 0.45, 0.45, r() * 6.28); } }
  if (o.mast !== false && r() < 0.55) { const s = place(0.6, 0.6); if (s) { const c = C(s[0] + 0.3, s[1] + 0.3); const h = R(2.5, 5.5); put(bk, Gm.cyl6, c[0], y, c[1], COL.steel, 0.04, h, 0.04);
    for (let k = 1; k <= 2; k++) { const aa = s[0] + 0.3; fbox(bk, F, aa - 0.6 + k * 0.1, aa + 0.6 - k * 0.1, s[1] + 0.28, s[1] + 0.32, y + h * (0.55 + k * 0.18), y + h * (0.55 + k * 0.18) + 0.03, COL.steel); } } }
}
const centerY = (c, y) => [c[0], y, c[1]];

// parapet with coping on a polygon roof (for roofs that have none)
export function parapet(bk, poly, y, h, wallC, capC = COL.cap) {
  for (const E of edgesOf(poly)) { lb(bk, E, 0, E.len, -0.3, 0, y, y + h, wallC); lb(bk, E, -0.05, E.len + 0.05, -0.36, 0.06, y + h, y + h + 0.08, capC, true); }
}
// horizontal ledge / cornice band all round a polygon
export function cornice(bk, poly, y, h, dep, col) { for (const E of edgesOf(poly)) lb(bk, E, -dep, E.len + dep, -0.02, dep, y, y + h, col, true); }
export { mix };
