// 索拉纳港 (map A) mainland urban fabric — r6.3 (ground_a).
// Everything outside the hand-built 甘蔗区 / 湾畔 / 壁画 district (x > -1345, |z| < 504) used to be one flat lawn, with the
// downtown towers standing on bare grass. This lays a believable city around it, built for the aerial / mid-height read:
//   jittered arterial lattice (4-lane, junction patches) -> each cell gets a bilinear frame of its inset quad -> zoning:
//   downtown (paved blocks, the skyline towers snapped into blocks by city.js + generated mid-rises), residential (local
//   street grid with verges, houses with hip roofs, driveways, pools, hedges, street trees), commercial strips along the
//   arterials (strip malls, striped parking lots, parked cars), big-box retail, industrial (warehouses, truck yards,
//   trailers, containers), garden apartments, parks (ball fields, groves), a coastal boulevard + bay park, finger canals.
// Cost: roads / sidewalks / lots are merged per 640 m chunk (resident, flat, a few k tris per chunk); buildings, roofs, trees,
// cars, pools and decals are InstancedMeshes per chunk sharing one geometry each, shown by distance tier. No new textures.
// Deterministic: its own mulberry stream; never touches util.js's shared rng (the island / district layout is unchanged).
import * as THREE from 'three';
import { shoreX, mulberry } from './mapgeo.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';
import { OLDENV } from '../../envprog.js'; // b_envprog

export const XL = [-3560, -3180, -2800, -2420, -2040, -1740, -1345]; // x-lines (west -> east); index 7 = coastal boulevard
export const ZL = [-2856, -2408, -1960, -1512, -1064, -504, 56, 504, 1064, 1512, 1960, 2408, 2856];
const DT_XI = { 4: [-2040, -1870, -1740], 5: [-1740, -1620, -1497, -1410, -1345] }; // downtown street x-lines per cell column
const isDT = (i, j) => (i === 4 || i === 5) && j >= 4 && j <= 7;
// r6.3: each cell's type draws from its own seed, so detail edits elsewhere (which consume the shared stream) no longer reshuffle
// the land-use map (v3's lamp rows had silently turned the finger-canal cells back into plain suburbs)
export const CELL_SEED = 8; // chosen by scan: 4 canal cells (incl. the i=6,j=2 waterfront), 4 parks, 8 apartment cells
const isDistrict = (i, j) => i === 6 && (j === 5 || j === 6);
const AW = 7, ASW = 4.5, AIN = AW + ASW; // arterial half width, sidewalk, inset
const LW = 4.5, LVG = 1.8, LSW = 1.8, LIN = LW + LVG + LSW; // local street half width, verge, sidewalk
const CH = 640;
const coastX = (z) => shoreX(z) - 62;
export const FAB = { x0: XL[0] - 40, x1: -900, z0: ZL[0] - 40, z1: ZL[ZL.length - 1] + 40 };

// ------------------------------------------------------------------ small geometry helpers ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const len2 = (a) => Math.hypot(a[0], a[1]);
const norm2 = (a) => { const l = len2(a) || 1; return [a[0] / l, a[1] / l]; };
function lineX(p, d, q, e) { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; }
function hull(P) { const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); }

// flat merged geometry accumulator (y constant per quad, normal up), optional 4-float custom attribute
class Acc {
  constructor(extra) { this.p = []; this.uv = []; this.x = extra ? [] : null; this.i = []; this.n = 0; }
  // P: 4 corners [x,z]; uv: 4 [u,v]; ex: 4 [a,b,c,d] or null; front face made to point up
  quad(P, y, uv, ex) {
    const cr = (P[1][1] - P[0][1]) * (P[3][0] - P[0][0]) - (P[1][0] - P[0][0]) * (P[3][1] - P[0][1]);
    const o = cr < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3]; const b = this.n;
    for (const k of o) { this.p.push(P[k][0], y, P[k][1]); this.uv.push(uv[k][0], uv[k][1]); if (this.x) this.x.push(...(ex ? ex[k] : [0, 0, 0, 0])); }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3); this.n += 4;
  }
  poly(P, y, uvf, exv) { // convex polygon fan
    const c = [P.reduce((a, q) => a + q[0], 0) / P.length, P.reduce((a, q) => a + q[1], 0) / P.length];
    for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; this.quad([c, a, b, b], y, [uvf(c), uvf(a), uvf(b), uvf(b)], exv ? [exv, exv, exv, exv] : null); }
  }
  geometry(name) {
    if (!this.n) return null; const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    const nr = new Float32Array(this.n * 3); for (let k = 0; k < this.n; k++) nr[k * 3 + 1] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.x) g.setAttribute(name || 'aRd', new THREE.Float32BufferAttribute(this.x, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); this.p = this.uv = this.x = this.i = null; return g;
  }
}

// ------------------------------------------------------------------ plan ----
// planFabric(): lattice + downtown block list (needed by city.js skyline snapping). populate(col): everything else.
export function planFabric() {
  const R = mulberry(0x50a1a7a);
  const rr = (a, b) => a + (b - a) * R();
  // nodes
  const N = [];
  for (let i = 0; i <= 7; i++) { N.push([]); for (let j = 0; j < ZL.length; j++) {
    let x = i < 7 ? XL[i] : (j === 5 || j === 7 ? -957 : coastX(ZL[j])), z = ZL[j];
    const fixed = i === 7 || (i >= 4 && i <= 6 && j >= 4 && j <= 8) || (i === 6 && (j === 4 || j === 8));
    if (!fixed) { x += rr(-48, 48); z += rr(-48, 48); }
    N[i].push([x, z]); } }
  const fab = { N, R, rr, chunks: new Map(), dtBlocks: [], occupied: [], stats: {} };
  // downtown blocks (axis-aligned; street hw 7, the whole block is paved; buildings keep 4.5 m back from the kerb)
  for (const i of [4, 5]) for (let j = 4; j <= 7; j++) {
    const xs = DT_XI[i]; const z0 = ZL[j], z1 = ZL[j + 1]; const zs = [z0]; for (let k = -12; k <= 12; k++) { const z = 56 + 112 * k; if (z > z0 + 30 && z < z1 - 30) zs.push(z); } zs.push(z1);
    for (let a = 0; a < xs.length - 1; a++) for (let b = 0; b < zs.length - 1; b++) {
      const xa = xs[a], xb = xs[a + 1], za = zs[b], zb = zs[b + 1];
      const ea = a === 0 ? AIN - ASW : AW, eb = a === xs.length - 2 ? AIN - ASW : AW, fa = b === 0 ? AW : AW, fb = AW;
      fab.dtBlocks.push({ i, j, x0: xa + ea, x1: xb - eb, z0: za + fa, z1: zb - fb, ix0: xa + ea + ASW, ix1: xb - eb - ASW, iz0: za + fa + ASW, iz1: zb - fb - ASW, xs: [xa, xb], zs: [za, zb], towers: [] });
    }
    fab.dtLines = fab.dtLines || []; fab.dtLines.push({ i, j, xs, zs });
  }
  fab.blockAt = (x, z) => { let best = null, bd = 1e9; for (const b of fab.dtBlocks) { const dx = Math.max(b.ix0 - x, 0, x - b.ix1), dz = Math.max(b.iz0 - z, 0, z - b.iz1); const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = b; } } return bd < 60 ? best : null; };
  fab.populate = (col) => populate(fab, col);
  return fab;
}

function chunkOf(fab, x, z) {
  const kx = Math.floor(x / CH), kz = Math.floor(z / CH), k = kx + ',' + kz; let c = fab.chunks.get(k);
  if (!c) fab.chunks.set(k, c = { k, cx: (kx + 0.5) * CH, cz: (kz + 0.5) * CH, road: new Acc(true), walk: new Acc(false), lot: new Acc(true), plaza: new Acc(false), I: { body: [], roof: [], tree: [], palm: [], car: [], pool: [], flat: [], lamp: [] }, meshes: null });
  return c;
}

// instance records (plain arrays, turned into matrices at attach)
// body: [cx, y0, cz, w(along ang), h, d, ang, r, g, b, kind, seed]   kinds: 0 house 1 retail 2 warehouse 3 apartment 4 office 5 garage 6 hedge 7 wall 8 plain (trailer/container)
function addBody(fab, cx, cz, y0, w, d, h, ang, colr, kind, col, collide = true) {
  const c = chunkOf(fab, cx, cz); c.I.body.push([cx, y0, cz, w, h, d, ang, colr[0], colr[1], colr[2], kind, fab.R()]);
  fab._lastBox = collide && col ? col.addOBB(cx, cz, Math.cos(ang), -Math.sin(ang), w / 2, d / 2, y0 + h, 'bld') : null;
  fab.stats.bodies = (fab.stats.bodies || 0) + 1;
}
const addRoof = (fab, cx, cz, y0, w, d, h, ang, colr) => chunkOf(fab, cx, cz).I.roof.push([cx, y0, cz, w, h, d, ang, colr[0], colr[1], colr[2]]);
const addTree = (fab, x, z, r, h, colr) => chunkOf(fab, x, z).I.tree.push([x, z, r, h, colr[0], colr[1], colr[2], fab.R() * 6.28]);
const addPalm = (fab, x, z, h) => chunkOf(fab, x, z).I.palm.push([x, z, h, fab.R() * 6.28, (fab.R() - 0.5) * 0.16, (fab.R() - 0.5) * 0.16]);
const addCar = (fab, x, z, ang, colr) => chunkOf(fab, x, z).I.car.push([x, z, ang, colr[0], colr[1], colr[2]]);
const addPool = (fab, x, z, w, d, ang) => chunkOf(fab, x, z).I.pool.push([x, z, w, d, ang]);
const addLamp = (fab, x, z, ang) => chunkOf(fab, x, z).I.lamp.push([x, z, ang]);
// street lights along a segment A->B: every `step` m, offset o (signed, + = left of travel), arm pointing back over the road
function lampRow(fab, A, B, o, step, t0 = 10) { const d = sub(B, A), L = len2(d); if (L < 2 * t0) return; const tx = d[0] / L, tz = d[1] / L;
  for (let t = t0; t < L - t0 * 0.5; t += step) { const x = A[0] + tx * t - tz * o, z = A[1] + tz * t + tx * o; const sg = Math.sign(o); addLamp(fab, x, z, Math.atan2(sg * tx, sg * tz)); } }
const lastRec = (fab, p, key) => { const L = chunkOf(fab, p[0], p[1]).I[key]; return L[L.length - 1]; }; // a_curbalign
const addFlat = (fab, x, z, w, d, ang, colr, y = 0.012) => chunkOf(fab, x, z).I.flat.push([x, z, w, d, ang, colr[0], colr[1], colr[2], y]);

// road ribbon A->B (kind 0 4-lane hw 7 / 2 2-lane hw 4.5); aRd lateral sign convention as region.js
function roadSeg(fab, A, B, w, kind) {
  const d = sub(B, A), L = len2(d); if (L < 1) return; const tx = d[0] / L, tz = d[1] / L;
  const pt = (P, o) => [P[0] - tz * o, P[1] + tx * o];
  const P = [pt(A, -w), pt(A, w), pt(B, w), pt(B, -w)]; const c = chunkOf(fab, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
  c.road.quad(P, 0, P.map((q) => [q[0] / 7, q[1] / 7]), [[-w, 0, L, kind], [w, 0, L, kind], [w, L, L, kind], [-w, L, L, kind]]);
  fab.stats.roadKm = (fab.stats.roadKm || 0) + L / 1000;
}
function junction(fab, P) { if (P.length < 3) return; const H = hull(P); const c = chunkOf(fab, H[0][0], H[0][1]); c.road.poly(H, 0, (q) => [q[0] / 7, q[1] / 7], [0, 0, 1, 1]); }
// sidewalk strip along A->B on side s (+1 = left of travel), lateral o0..o1, along t0..t1 (m), with cut intervals [[c0,c1],...]
function walkSeg(fab, A, B, s, o0, o1, t0, t1, cuts = []) {
  const d = sub(B, A), L = len2(d); if (L < 1) return; const tx = d[0] / L, tz = d[1] / L; const nx = -tz * s, nz = tx * s;
  const pieces = []; let a = t0; for (const [c0, c1] of cuts.slice().sort((p, q) => p[0] - q[0])) { if (c1 < a) continue; if (c0 > a) pieces.push([a, Math.min(c0, t1)]); a = Math.max(a, c1); } if (a < t1) pieces.push([a, t1]);
  const made = []; // a_curbalign: [acc, first vertex, corners] of every quad (curbfix.js re-shapes the joints of curved runs)
  for (const [p0, p1] of pieces) { if (p1 - p0 < 0.5) continue; const Q = (t, o) => [A[0] + tx * t + nx * o, A[1] + tz * t + nz * o];
    const P = [Q(p0, o0), Q(p1, o0), Q(p1, o1), Q(p0, o1)]; const c = chunkOf(fab, (P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2); made.push([c.walk, c.walk.n, P]); c.walk.quad(P, 0.03, P.map((q) => [q[0], q[1]]), null); }
  return made;
}
// paved / parking surface quad in a local frame (uv = metres along/across for the stall shader), mode 0 stalls 1 concrete yard 2 asphalt 3 sports field 4 plaza
function lotQuad(fab, P, ua, va, mode, y = 0.006) { const c = chunkOf(fab, (P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2);
  c.lot.quad(P, y, [[ua[0], va[0]], [ua[1], va[0]], [ua[1], va[1]], [ua[0], va[1]]], [[mode, 0, 0, 0], [mode, 0, 0, 0], [mode, 0, 0, 0], [mode, 0, 0, 0]]); }

// palettes
const WALLS = [[0.96, 0.94, 0.88], [0.98, 0.92, 0.80], [0.94, 0.86, 0.74], [0.90, 0.92, 0.88], [0.98, 0.86, 0.78], [0.86, 0.90, 0.92], [0.95, 0.95, 0.95], [0.92, 0.84, 0.66], [0.82, 0.88, 0.80], [0.98, 0.80, 0.70], [0.80, 0.84, 0.90]];
const ROOFS = [[0.62, 0.34, 0.24], [0.66, 0.40, 0.28], [0.40, 0.40, 0.42], [0.50, 0.49, 0.48], [0.82, 0.80, 0.74], [0.90, 0.89, 0.86], [0.46, 0.36, 0.28], [0.34, 0.38, 0.42]];
const CARS = [[0.92, 0.92, 0.92], [0.08, 0.08, 0.09], [0.55, 0.56, 0.58], [0.35, 0.36, 0.38], [0.62, 0.08, 0.08], [0.10, 0.18, 0.42], [0.85, 0.85, 0.82], [0.20, 0.30, 0.22], [0.70, 0.62, 0.48], [0.12, 0.30, 0.55]];
const LEAF = [[0.20, 0.30, 0.12], [0.24, 0.34, 0.14], [0.17, 0.26, 0.11], [0.28, 0.36, 0.16], [0.22, 0.28, 0.13], [0.30, 0.34, 0.18]];
const pickR = (fab, a) => a[Math.floor(fab.R() * a.length)];

// ------------------------------------------------------------------ populate ----
function populate(fab, col) {
  const { N, rr } = fab; const R = fab.R;
  const node = (i, j) => N[i][j];
  // ---- arterial edges + junctions -------------------------------------------------------------------------------
  const inc = new Map(); // node key -> [{dir unit vector out of the node}]
  const edges = [];
  const addE = (i0, j0, i1, j1) => { const A = node(i0, j0), B = node(i1, j1); edges.push({ A, B, ka: i0 + ',' + j0, kb: i1 + ',' + j1 }); for (const [k, P, Q] of [[i0 + ',' + j0, A, B], [i1 + ',' + j1, B, A]]) { if (!inc.has(k)) inc.set(k, { P, d: [] }); inc.get(k).d.push(norm2(sub(Q, P))); } };
  for (let i = 0; i <= 7; i++) for (let j = 0; j < ZL.length - 1; j++) { if (i === 7 && (j === 5 || j === 6)) continue; addE(i, j, i, j + 1); }
  for (let j = 0; j < ZL.length; j++) for (let i = 0; i < 7; i++) { if (j === 6 && i === 6) continue; addE(i, j, i + 1, j); }
  for (const e of edges) { const d = norm2(sub(e.B, e.A)); const L = len2(sub(e.B, e.A)); const A = [e.A[0] + d[0] * AIN, e.A[1] + d[1] * AIN], B = [e.B[0] - d[0] * AIN, e.B[1] - d[1] * AIN]; roadSeg(fab, A, B, AW, 0); e.L = L; e.d = d;
    lampRow(fab, A, B, AW + 0.8, 46, 8); lampRow(fab, A, B, -(AW + 0.8), 46, 31); }
  for (const [, v] of inc) { const P = []; for (const d of v.d) { const c = [v.P[0] + d[0] * AIN, v.P[1] + d[1] * AIN]; P.push([c[0] - d[1] * AW, c[1] + d[0] * AW], [c[0] + d[1] * AW, c[1] - d[0] * AW]); }
    if (v.d.length === 2) { /* corner: close the gap with the kerb-line corners */ } junction(fab, P); }
  // connectors into the hand-built district (its road ends) + the causeway end
  const conn = (A, B, w, kind) => roadSeg(fab, A, B, w, kind);
  conn([-956, 430], [-957, 504 - AIN], AW, 0); conn([-958, -430], [-957, -504 + AIN], AW, 0);
  conn([-1296, 430], [-1296, 504 - AW], AW, 0); conn([-1296, -430], [-1296, -504 + AW], AW, 0);
  conn([-1316, 56], [-1345 + AIN, 56], AW, 0);
  const cutsDistrict = { n: [[-1296, 2 * AW]], s: [[-1296, 2 * AW]] };
  // ---- seawall-side bay park along the coastal boulevard (palms, a walkway) is handled per cell (east column) ----
  // ---- cells -----------------------------------------------------------------------------------------------------
  for (let i = 0; i < 7; i++) for (let j = 0; j < ZL.length - 1; j++) {
    if (isDistrict(i, j)) { districtEdgeWalks(fab, i, j, cutsDistrict); continue; }
    const C = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)]; // P00 P10 P11 P01 (u = x-ish, v = z-ish)
    const cell = makeCell(C);
    let type;
    if (isDT(i, j)) type = 'dt';
    else { const r = mulberry(CELL_SEED ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b))(); const coast = i === 6; const west = i <= 1; const nearDT = (i === 3 || i === 6) && j >= 3 && j <= 8;
      if (coast && (j <= 2 || j >= 9) && r < 0.55) type = 'canal';
      else if (nearDT && r < 0.3) type = 'apts';
      else if (r < (west ? 0.2 : 0.1)) type = 'industrial';
      else if (r < (west ? 0.28 : 0.2)) type = 'bigbox';
      else if (r < (west ? 0.36 : 0.27)) type = 'park';
      else if (r < 0.34) type = 'apts';
      else type = 'res'; }
    cell.i = i; cell.j = j; cell.type = type; fab.stats[type] = (fab.stats[type] || 0) + 1;
    const cuts = [[], [], [], []]; // per cell side (0 bottom P00-P10, 1 right P10-P11, 2 top P11-P01, 3 left P01-P00): along-distance intervals from the side's start node
    if (type === 'dt') downtownCell(fab, cell, cuts, col);
    else if (type === 'res' || type === 'canal') residentialCell(fab, cell, cuts, col, type === 'canal');
    else if (type === 'apts') apartmentCell(fab, cell, cuts, col);
    else if (type === 'industrial') industrialCell(fab, cell, cuts, col);
    else if (type === 'bigbox') bigboxCell(fab, cell, cuts, col);
    else parkCell(fab, cell, cuts, col);
    // arterial sidewalks on the inner side of the four cell sides (+ trees on the kerb line for most)
    for (let s = 0; s < 4; s++) { const A = C[s], B = C[(s + 1) % 4]; const L = len2(sub(B, A));
      const side = sideSign(A, B, cell.cen); walkSeg(fab, A, B, side, AW, AIN, AIN, L - AIN, cuts[s]);
      if (i === 6 && s === 1) bayPark(fab, A, B, side, L); }
  }
  // ---- downtown towers are snapped by city.js; generated mid-rises fill what is left ----
  for (const b of fab.dtBlocks) dtFill(fab, b, col);
  return fab;
}
const sideSign = (A, B, c) => { const d = sub(B, A); const nx = -d[1], nz = d[0]; return ((c[0] - A[0]) * nx + (c[1] - A[1]) * nz) > 0 ? 1 : -1; };

// a cell: its corner quad and the inset quad (each side pushed in by AIN) with a bilinear frame M(u,v), u along P00->P10
function makeCell(C) {
  const cen = [(C[0][0] + C[1][0] + C[2][0] + C[3][0]) / 4, (C[0][1] + C[1][1] + C[2][1] + C[3][1]) / 4];
  const lines = []; for (let s = 0; s < 4; s++) { const A = C[s], B = C[(s + 1) % 4]; const d = norm2(sub(B, A)); const sg = sideSign(A, B, cen); const n = [-d[1] * sg, d[0] * sg]; lines.push({ p: [A[0] + n[0] * AIN, A[1] + n[1] * AIN], d }); }
  const Q = []; for (let s = 0; s < 4; s++) { const a = lines[(s + 3) % 4], b = lines[s]; Q.push(lineX(a.p, a.d, b.p, b.d) || C[s]); } // Q[s] = corner s
  const Mf = (u, v) => { const a = lerp2(Q[0], Q[1], u), b = lerp2(Q[3], Q[2], u); return lerp2(a, b, v); };
  const Lu = (len2(sub(Q[1], Q[0])) + len2(sub(Q[2], Q[3]))) / 2, Lv = (len2(sub(Q[3], Q[0])) + len2(sub(Q[2], Q[1]))) / 2;
  return { C, Q, M: Mf, Lu, Lv, cen };
}
// frame in metres: along a (length La), across b (length Lb); orient picks which bilinear axis is "along"
function frame(cell, alongU) {
  const { M, Lu, Lv } = cell;
  if (alongU) return { La: Lu, Lb: Lv, P: (a, b) => M(a / Lu, b / Lv), sideA0: 3, sideA1: 1, sideB0: 0, sideB1: 2, alongU };
  return { La: Lv, Lb: Lu, P: (a, b) => M(b / Lu, a / Lv), sideA0: 0, sideA1: 2, sideB0: 3, sideB1: 1, alongU };
}
// where a frame line meets the cell side s: register a sidewalk cut there (distance along the side from its start node)
function cutAt(cell, cuts, s, P, hw) { const A = cell.C[s], B = cell.C[(s + 1) % 4]; const d = norm2(sub(B, A)); const t = (P[0] - A[0]) * d[0] + (P[1] - A[1]) * d[1]; cuts[s].push([t - hw, t + hw]); }
// a street along the frame at constant b (a from a0 to a1), extended through the arterial sidewalk where it meets a cell side
function fStreetA(fab, F, cell, cuts, b, a0, a1, hw, kind, ext0, ext1) {
  const n = F.curved ? Math.max(1, Math.ceil((a1 - a0) / 14)) : 1; const pts = []; for (let k = 0; k <= n; k++) pts.push(F.P(a0 + ((a1 - a0) * k) / n, b));
  return drawPolyRoad(fab, cell, cuts, pts, hw, kind, ext0 ? F.sideA0 : -1, ext1 ? F.sideA1 : -1);
}
function fStreetB(fab, F, cell, cuts, a, b0, b1, hw, kind, ext0, ext1) {
  const n = F.curved ? Math.max(1, Math.ceil((b1 - b0) / 14)) : 1; const pts = []; for (let k = 0; k <= n; k++) pts.push(F.P(a, b0 + ((b1 - b0) * k) / n));
  return drawPolyRoad(fab, cell, cuts, pts, hw, kind, ext0 ? F.sideB0 : -1, ext1 ? F.sideB1 : -1);
}
// polyline street; ends optionally pushed through the arterial sidewalk (side index s0 / s1 >= 0), pieces overlap 0.5 m (no gaps at bends)
function drawPolyRoad(fab, cell, cuts, pts, hw, kind, s0, s1) {
  const n = pts.length - 1;
  if (s0 >= 0) { const d = norm2(sub(pts[1], pts[0])); pts[0] = [pts[0][0] - d[0] * ASW, pts[0][1] - d[1] * ASW]; cutAt(cell, cuts, s0, pts[0], hw + 0.3); }
  if (s1 >= 0) { const d = norm2(sub(pts[n], pts[n - 1])); pts[n] = [pts[n][0] + d[0] * ASW, pts[n][1] + d[1] * ASW]; cutAt(cell, cuts, s1, pts[n], hw + 0.3); }
  for (let k = 0; k < n; k++) { const A = pts[k], B = pts[k + 1]; const d = norm2(sub(B, A)); const e0 = k > 0 ? 0.5 : 0, e1 = k < n - 1 ? 0.5 : 0;
    roadSeg(fab, [A[0] - d[0] * e0, A[1] - d[1] * e0], [B[0] + d[0] * e1, B[1] + d[1] * e1], hw, kind); }
  return [pts[0], pts[n]];
}
// sidewalks + verge trees along a frame line, piecewise when the frame is curved
function sidesA(fab, F, a0, a1, b, opts) { const n = F.curved ? Math.max(1, Math.ceil((a1 - a0) / 14)) : 1; const run = fab.nRun = (fab.nRun || 0) + 1; for (let k = 0; k < n; k++) localSides(fab, F.P(a0 + ((a1 - a0) * k) / n, b), F.P(a0 + ((a1 - a0) * (k + 1)) / n, b), opts, run); }
function sidesB(fab, F, a, b0, b1, opts) { const n = F.curved ? Math.max(1, Math.ceil((b1 - b0) / 14)) : 1; const run = fab.nRun = (fab.nRun || 0) + 1; for (let k = 0; k < n; k++) localSides(fab, F.P(a, b0 + ((b1 - b0) * k) / n), F.P(a, b0 + ((b1 - b0) * (k + 1)) / n), opts, run); }
// local-frame quad (a0..a1, b0..b1) in world
const fq = (F, a0, a1, b0, b1) => [F.P(a0, b0), F.P(a1, b0), F.P(a1, b1), F.P(a0, b1)];
// frame direction angle (box rotation about y so that local +x runs along a)
const fang = (F, a, b) => { const p = F.P(a, b), q = F.P(a + 1, b); return Math.atan2(-(q[1] - p[1]), q[0] - p[0]); };
// verge trees + sidewalks along a local street piece (both sides)
function localSides(fab, A, B, opts = {}, run = 0) {
  const L = len2(sub(B, A)); if (L < 4) return; const d = norm2(sub(B, A));
  const seg = { A, B, run, res: !!fab._res, w: {} }; (fab.locSegs = fab.locSegs || []).push(seg); // a_curbalign: the street piece every local sidewalk was laid along
  if (opts.lamps !== false && fab.R() < Math.min(1, L / 28)) lampRow(fab, A, B, LW + 0.5, 40, Math.min(L * 0.5, 4 + fab.R() * 20));
  for (const s of [-1, 1]) { seg.w[s] = walkSeg(fab, A, B, s, LW + LVG, LIN, 0, L, []);
    if (opts.trees !== false) for (let t = 6 + fab.R() * 5; t < L - 5; t += fab.rr(11, 17)) { if (fab.R() < 0.18) continue; const o = (LW + LVG * 0.5) * s; const x = A[0] + d[0] * t - d[1] * o, z = A[1] + d[1] * t + d[0] * o; if (fab.canals && inCanal(fab, x, z)) continue;
      if (opts.palms ? fab.R() < 0.75 : fab.R() < 0.18) addPalm(fab, x, z, fab.rr(7, 12)); else addTree(fab, x, z, fab.rr(2.4, 3.8), fab.rr(2.2, 3.2), pickR(fab, LEAF)); } }
}

// ------------------------------------------------------------------ residential ----
function residentialCell(fab, cell, cuts, col, canal) {
  fab._res = cell; // a_curbalign: local sidewalks laid while this is set belong to a residential cell
  { const q = cell.C.map((p) => [p[0], p[1]]); q.x0 = Math.min(...q.map((p) => p[0])); q.x1 = Math.max(...q.map((p) => p[0])); q.z0 = Math.min(...q.map((p) => p[1])); q.z1 = Math.max(...q.map((p) => p[1])); (fab.resCells = fab.resCells || []).push(q); }
  try { residentialCell0(fab, cell, cuts, col, canal); } finally { fab._res = null; }
}
function residentialCell0(fab, cell, cuts, col, canal) {
  const F = frame(cell, canal ? true : cell.Lu >= cell.Lv); const { La, Lb } = F; const R = fab.R, rr = fab.rr;
  // commercial frontage bands on the arterials at b = 0 / b = Lb
  let bs = 0, be = Lb;
  if (!canal && Lb > 230 && R() < 0.5) { stripBand(fab, F, 0, 1, La, col); bs = 72; }
  if (!canal && Lb > 300 && R() < 0.3) { stripBand(fab, F, Lb, -1, La, col); be = Lb - 72; }
  if (be - bs < 60) return;
  // ~45 % of plain residential cells get curvilinear streets: the frame is warped across b (zero at the band / arterial edges)
  if (!canal && R() < 0.45) { const base = F.P, amp = rr(18, 34) * (R() < 0.5 ? -1 : 1), ph = R() < 0.5 ? 1 : 2;
    F.P = (a, b) => base(a, b + amp * Math.sin((Math.PI * ph * a) / La) * Math.sin(Math.PI * Math.min(1, Math.max(0, (b - bs) / (be - bs))))); F.curved = true; }
  const ns = Math.max(1, Math.round((be - bs) / 86)); const pitch = (be - bs) / ns;
  const streets = []; for (let k = 0; k < ns; k++) streets.push(bs + pitch * (k + 0.5));
  const na = Math.max(1, Math.round(La / 250)); const cross = []; for (let m = 1; m < na; m++) cross.push((La * m) / na + rr(-12, 12));
  const aBreak = [0, ...cross, La];
  // canal cells: the water runs between back-to-back rows (b mid-way between streets) out to the bay; a=La is the coast side
  const canals = canal ? streets.slice(0, -1).map((b, k) => (b + streets[k + 1]) / 2) : [];
  const crossBr = new Map(); // a_orphans: canal b -> a of the local streets that bridge it
  // locals (constant b) split at the cross streets, junction patches at crossings
  for (const b of streets) for (let m = 0; m < aBreak.length - 1; m++) {
    const a0 = aBreak[m] + (m === 0 ? 0 : LW), a1 = aBreak[m + 1] - (m === aBreak.length - 2 ? 0 : LW);
    fStreetA(fab, F, cell, cuts, b, a0, a1, LW, 2, m === 0, m === aBreak.length - 2);
    sidesA(fab, F, m === 0 ? 0 : a0, m === aBreak.length - 2 ? La : a1, b);
  }
  for (const a of cross) {
    for (const b of streets) junction(fab, fq(F, a - LW, a + LW, b - LW, b + LW));
    const bl = [bs === 0 ? 0 : bs, ...streets, be === Lb ? Lb : be];
    for (let k = 0; k < bl.length - 1; k++) { const first = k === 0, last = k === bl.length - 2;
      const b0 = bl[k] + (first ? 0 : LW), b1 = bl[k + 1] - (last ? 0 : LW);
      if (canal && canals.some((c) => c > b0 && c < b1)) { // bridge over the canal: road continues (deck), side walls
        const c = canals.find((q) => q > b0 && q < b1); // a_orphans: was fang + PI/2, which laid both 26 m parapets ACROSS the street (two 1 m walls over the carriageway); now along its kerbs
        for (const sgn of [-1, 1]) addBody(fab, ...F.P(a + sgn * (LW + 0.25), c), 0, 0.5, 26, 1.0, fang(F, a, c), [0.82, 0.8, 0.76], 7, col, false);
        { const l = crossBr.get(c) || []; l.push(a); crossBr.set(c, l); for (const sgn of [-1, 1]) parapet(fab, ...F.P(a + sgn * (LW + 0.25), c), 0.5, 26, 1.0, fang(F, a, c)); }
        // a_bridgewalk: the verges + sidewalks outside the kerb parapets used to hang over the water (sidewalk quads, no deck):
        // a concrete deck slab under the whole street width (24.2 m = canal width, top -0.065 just under the -0.06 ground, 0.74 m fascia) and a low edge wall at
        // the outer sidewalk edge (same body instancing / material as the parapets: no new program; collider via parapet())
        { const ang = fang(F, a, c); deck(fab, ...F.P(a, c), -0.8, 2 * (LIN + 0.35), 24.2, 0.735, ang);
          for (const sgn of [-1, 1]) { const Q = F.P(a + sgn * (LIN + 0.12), c); edgeWall(fab, Q[0], Q[1], 0.24, 26, 0.95, ang); } } }
      fStreetB(fab, F, cell, cuts, a, b0, b1, LW, 2, first && bs === 0, last && be === Lb);
      sidesB(fab, F, a, b0, b1); }
  }
  // house rows: each street has a row on both sides
  const rowD = (pitch - 2 * LIN) / 2;
  for (const b of streets) for (const s of [-1, 1]) {
    const backC = canals.some((c) => Math.abs(c - (b + s * (LIN + rowD))) < 1); const rd = backC ? rowD - 12 : rowD; // a canal behind: stop at its bank
    const f0 = b + s * LIN, f1 = b + s * (LIN + rd); // lot front / back (b)
    for (let m = 0; m < aBreak.length - 1; m++) {
      const a0 = aBreak[m] + (m === 0 ? 1.5 : LIN + 1), a1 = aBreak[m + 1] - (m === aBreak.length - 2 ? 1.5 : LIN + 1); const run = a1 - a0; if (run < 14) continue;
      const n = Math.max(1, Math.round(run / rr(16.5, 21))); const fw = run / n;
      for (let q = 0; q < n; q++) house(fab, F, a0 + q * fw, a0 + (q + 1) * fw, f0, f1, s, col, canal);
    }
  }
  // masonry walls / hedges where back yards meet an arterial (b edges with no band) and along the a edges
  if (bs === 0) wallRun(fab, F, 0, La, 0.6, col); if (be === Lb) wallRun(fab, F, 0, La, Lb - 0.6, col);
  // canals: water cut is made in the ground (city.js reads fab.canals); seawall copings along both banks + docks/boats
  for (const c of canals) { const A = F.P(26, c), B0 = F.P(La, c), d = norm2(sub(B0, A)); let t = len2(sub(B0, A)); for (let k = 0; k < 4; k++) { const x = A[0] + d[0] * t, z = A[1] + d[1] * t; t += (shoreX(z) + 6 - x) / (d[0] || 1); }
    const B = [A[0] + d[0] * t, A[1] + d[1] * t];
    // a_orphans: bridge decks across the canal (coastal boulevard between its parapets, local streets between theirs), as
    // [along-canal distance from A, half width]; inCanalWater() keeps them dry so groundH gives the road, not the canal bed
    // a_bridgewalk: entries are [t, lo, hi] (dry for lo < t - tb < hi; -t = inland): the boulevard deck now also carries its
    // inland 4.5 m sidewalk out to the edge wall, local-street decks their verges + sidewalks, plus the bay-park promenade footbridge
    const pj = (Q) => (Q[0] - A[0]) * d[0] + (Q[1] - A[1]) * d[1]; const tBv = pj(F.P(La + AIN, c)); const br = [[tBv, -(AIN + 0.24), AW + 0.4]];
    // a_canaledge: deck slab extents along the canal [t0, t1] (region.js cuts the 0.12 m bank coping there, it used to stand across the deck)
    const decks = [[tBv - (AIN + 0.3), tBv + AW + 0.7]];
    for (const a of crossBr.get(c) || []) { const ta = pj(F.P(a, c)); br.push([ta, -(LIN + 0.24), LIN + 0.24]); decks.push([ta - (LIN + 0.35), ta + LIN + 0.35]); }
    { const Pm = F.P(La + AIN, c); const o = AW + 16; const x = Pm[0] + d[0] * o, z = Pm[1] + d[1] * o; // promenade walk (bayPark: AW+14..AW+18 on the water side)
      if (x <= shoreX(z) - 1.5) { br.push([tBv, AW + 13.8, AW + 18.2]); decks.push([tBv + AW + 13.6, tBv + AW + 18.4]); const ang = Math.atan2(-d[1], d[0]);
        deck(fab, x, z, -0.8, 4.8, 24.2, 0.735, ang); for (const e of [-2.2, 2.2]) edgeWall(fab, x + d[0] * e, z + d[1] * e, 0.2, 26, 0.95, ang); } }
    (fab.canals = fab.canals || []).push({ A, B, d, hw: 12, br, decks });
    // the coastal boulevard crosses on a short bridge: parapets either side of the canal
    const P = F.P(La + AIN, c); const n = [-d[1], d[0]]; for (const o of [-(AW + 0.4), AW + 0.4]) { addBody(fab, P[0] + d[0] * o, P[1] + d[1] * o, 0, 0.45, 2 * 12 + 2, 1.05, Math.atan2(-d[1], d[0]), [0.86, 0.84, 0.8], 7, null, false); parapet(fab, P[0] + d[0] * o, P[1] + d[1] * o, 0.45, 2 * 12 + 2, 1.05, Math.atan2(-d[1], d[0])); }
    // a_bridgewalk: boulevard deck slab (inland sidewalk edge to the outer face of the coast-side parapet) + inland edge wall
    { const ang = Math.atan2(-d[1], d[0]); const lo = -(AIN + 0.3), hi = AW + 0.7; const m = (lo + hi) / 2; deck(fab, P[0] + d[0] * m, P[1] + d[1] * m, -0.8, hi - lo, 24.2, 0.735, ang);
      const e = -(AIN + 0.12); edgeWall(fab, P[0] + d[0] * e, P[1] + d[1] * e, 0.24, 26, 0.95, ang); } void n; }
}
// a_orphans: canal-bridge parapets are drawn without colliders (addBody collide=false); colfix adds these boxes after every layer
// is placed (same OBB as addBody would make), so the fabric layout and every later layer's free-space checks stay unchanged
// a_bridgewalk: deck slabs / edge walls go straight into the body instances (addBody would draw fab.R() and shift every later
// placement); kind 7 = plain concrete like the parapets, so the existing body program draws them
function deck(fab, cx, cz, y0, w, d, h, ang) { chunkOf(fab, cx, cz).I.body.push([cx, y0, cz, w, h, d, ang, 0.74, 0.73, 0.70, 7, 0.37]); }
function edgeWall(fab, cx, cz, w, d, h, ang) { chunkOf(fab, cx, cz).I.body.push([cx, 0, cz, w, h, d, ang, 0.86, 0.84, 0.8, 7, 0.61]); parapet(fab, cx, cz, w, d, h, ang); }
function parapet(fab, cx, cz, w, d, h, ang) { (fab.parapets = fab.parapets || []).push([cx, cz, Math.cos(ang), -Math.sin(ang), w / 2, d / 2, h]); }
function wallRun(fab, F, a0, a1, b, col) { const ang = fang(F, (a0 + a1) / 2, b); for (let a = a0 + 2; a < a1 - 2; a += 40) { const ae = Math.min(a1 - 2, a + 40); const p = F.P((a + ae) / 2, b); addBody(fab, p[0], p[1], 0, ae - a, 0.35, 2.1, ang, [0.86, 0.82, 0.74], 7, col);
  (fab.walls = fab.walls || []).push({ rec: lastRec(fab, p, 'body'), list: chunkOf(fab, p[0], p[1]).I.body, box: fab._lastBox }); } } // a_curbalign: curbfix.js cuts them where streets pass
function house(fab, F, a0, a1, f0, f1, s, col, canal) {
  const R = fab.R, rr = fab.rr; const fw = a1 - a0, depth = Math.abs(f1 - f0); if (depth < 18) return;
  const setback = rr(5.5, 8.5), hd = Math.min(depth - setback - 6, rr(10, 14)), hw = Math.max(8, fw - rr(3.5, 6.5));
  const ac = (a0 + a1) / 2 + rr(-0.8, 0.8); const bc = f0 + s * (setback + hd / 2);
  const p = F.P(ac, bc); const ang = fang(F, ac, bc);
  const two = R() < (canal ? 0.5 : 0.28); const h = two ? rr(5.9, 6.6) : rr(3.2, 3.7);
  const wall = pickR(fab, WALLS); addBody(fab, p[0], p[1], 0, hw, hd, h, ang, wall, 0, col);
  // a_curbalign: what curbfix.js needs about this lot (record references; no random draws)
  const LT = { s, ang, canal, front: F.P(ac, f0), dfront: null, house: lastRec(fab, p, 'body'), box: fab._lastBox, roof: null, verge: null, yard: null, car: null, ftree: null, hedge: null, dock: null, boat: null };
  (fab.lots = fab.lots || []).push(LT);
  LT.quad = [F.P(a0, f0), F.P((a0 + a1) / 2, f0), F.P(a1, f0), F.P(a1, f1), F.P((a0 + a1) / 2, f1), F.P(a0, f1)]; LT.pool = null; LT.deck = null; LT.btree = null; // a_curbbake: lot outline + back-yard records (no random draws)
  const flat = R() < (canal ? 0.3 : 0.07);
  if (!flat) { addRoof(fab, p[0], p[1], h, hw + 0.9, hd + 0.9, Math.min(hw, hd) * rr(0.22, 0.3), ang, pickR(fab, ROOFS)); LT.roof = lastRec(fab, p, 'roof'); }
  // driveway (verge part + yard part, skipping the sidewalk) on one side, car on it half the time
  const ds = R() < 0.5 ? -1 : 1; const ad = ac + ds * (hw / 2 - 1.8);
  const yardA = f0, yardB = f0 + s * setback; const pv = F.P(ad, (f0 - s * (LSW + LVG * 0.5)));
  { const q = F.P(ad, f0 - s * (LSW + LVG / 2) + 0); addFlat(fab, ...q, 3.2, LVG + 0.2, ang, [0.66, 0.65, 0.62]); LT.verge = lastRec(fab, q, 'flat'); } void pv;
  const pm = F.P(ad, (yardA + yardB) / 2); addFlat(fab, pm[0], pm[1], 3.4, setback + 0.2, ang, [0.70, 0.69, 0.66]); LT.yard = lastRec(fab, pm, 'flat'); LT.dfront = F.P(ad, f0);
  if (R() < 0.55) { const q = F.P(ad, f0 + s * (setback * 0.45)); addCar(fab, ...q, ang + Math.PI / 2, pickR(fab, CARS)); LT.car = lastRec(fab, q, 'car'); }
  // back yard: pool + deck, trees, hedge on the back line
  const back0 = f0 + s * (setback + hd), yd = depth - setback - hd;
  if (yd > 8 && R() < (canal ? 0.75 : 0.42)) { const pb = back0 + s * (yd * 0.5); const pp = F.P(ac + rr(-2, 2), pb); const pw = rr(7, 10), pd = Math.min(yd - 4, rr(3.6, 5));
    addFlat(fab, pp[0], pp[1], pw + 2.4, pd + 2.4, ang, [0.84, 0.80, 0.72], 0.016); LT.deck = lastRec(fab, pp, 'flat'); addPool(fab, pp[0], pp[1], pw, pd, ang); LT.pool = lastRec(fab, pp, 'pool'); }
  if (R() < 0.6) { const t = F.P(a0 + rr(2, fw - 2), back0 + s * rr(2, yd - 1)); if (R() < 0.3) { addPalm(fab, t[0], t[1], rr(7, 11)); LT.btree = ['palm', lastRec(fab, t, 'palm')]; } else { addTree(fab, t[0], t[1], rr(2.6, 4.6), rr(2.5, 4), pickR(fab, LEAF)); LT.btree = ['tree', lastRec(fab, t, 'tree')]; } }
  if (R() < 0.35) { const t = F.P(a0 + rr(2, fw - 2), f0 + s * rr(2, setback - 1.5)); if (R() < 0.4) { addPalm(fab, t[0], t[1], rr(6, 10)); LT.ftree = ['palm', lastRec(fab, t, 'palm')]; } else { addTree(fab, t[0], t[1], rr(2, 3.4), rr(2, 3), pickR(fab, LEAF)); LT.ftree = ['tree', lastRec(fab, t, 'tree')]; } }
  if (!canal && R() < 0.5) { const hb = F.P(ac, f0 + s * (depth - 0.4)); addBody(fab, hb[0], hb[1], 0, fw - 0.4, 0.7, rr(1.4, 2.0), ang, [0.22, 0.32, 0.16], 6, null, false); LT.hedge = lastRec(fab, hb, 'body'); }
  if (canal) { const dk = F.P(ac, f0 + s * (depth + 1.2)); addFlat(fab, dk[0], dk[1], Math.min(10, fw - 4), 2.4, ang, [0.52, 0.42, 0.30], 0.35); LT.dock = lastRec(fab, dk, 'flat');
    if (R() < 0.45) { const bt = F.P(ac + rr(-2, 2), f0 + s * (depth + 4.2)); addBody(fab, bt[0], bt[1], -0.8, rr(7, 11), 2.6, 1.6, ang, [0.95, 0.95, 0.94], 8, null, false); LT.boat = lastRec(fab, bt, 'body'); } }
}
// strip-mall band facing the arterial at b = bEdge (dir +1 into the cell from b=0, -1 from b=Lb)
function stripBand(fab, F, bEdge, dir, La, col) {
  const R = fab.R, rr = fab.rr; const B = (x) => bEdge + dir * x;
  const SB = { P: F.P, bEdge, dir, La, shops: [], pad: null }; (fab.strips = fab.strips || []).push(SB); // a_strip: metadata only (no random draw)
  lotQuad(fab, fq(F, 2, La - 2, Math.min(B(0.5), B(42)), Math.max(B(0.5), B(42))), [0, La - 4], dir > 0 ? [0, 41.5] : [41.5, 0], 0);
  for (let a = 4; a < La - 4; a += rr(16, 22)) { const p = F.P(a, B(1.2)); addPalm(fab, p[0], p[1], rr(8, 12)); }
  let a = rr(6, 14);
  while (a < La - 30) { const L = Math.min(La - 6 - a, rr(45, 130)); if (L < 25) break; const dd = rr(17, 25), h = rr(5, 7.5);
    const p = F.P(a + L / 2, B(42 + dd / 2)); addBody(fab, p[0], p[1], 0, L, dd, h, fang(F, a + L / 2, B(42)), pickR(fab, WALLS), 1, col); SB.shops.push({ a, L, dd, h, rec: lastRec(fab, p, 'body') });
    lotQuad(fab, fq(F, a - 2, a + L + 2, Math.min(B(42 + dd), B(42 + dd + 7)), Math.max(B(42 + dd), B(42 + dd + 7))), [0, 1], [0, 1], 2);
    a += L + rr(10, 28); }
  // pad building (fast food / bank) out in the lot
  if (R() < 0.5 && La > 160) { const ap = rr(30, La - 30); const p = F.P(ap, B(15)); addBody(fab, p[0], p[1], 0, rr(14, 20), rr(11, 15), rr(4.5, 5.5), fang(F, ap, B(15)), pickR(fab, WALLS), 1, col); SB.pad = { ap, rec: lastRec(fab, p, 'body') }; }
  parkCars(fab, F, 2, La - 2, bEdge, dir, 41.5, 0.42);
}
// cars in stall rows of a striped lot (modules of 18 m across: stalls 0.6–5.9 and 12.4–17.8, 2.7 m wide along a)
function parkCars(fab, F, a0, a1, bEdge, dir, depth, occ, skip) {
  const R = fab.R;
  for (let m = 0; m + 18 <= depth + 0.5; m += 18) for (const sb of [m + 3.2, m + 15.1]) {
    if (sb > depth - 2.5) continue;
    for (let a = a0 + 1.35; a < a1 - 1.3; a += 2.7) { if (R() > occ) continue; const b = bEdge + dir * sb; if (skip && skip(a, b)) continue; const p = F.P(a, b); addCar(fab, p[0], p[1], fang(F, a, b) + Math.PI / 2 + (R() - 0.5) * 0.06, pickR(fab, CARS)); }
  }
}

// ------------------------------------------------------------------ garden apartments ----
function apartmentCell(fab, cell, cuts, col) {
  const F = frame(cell, cell.Lu >= cell.Lv); const { La, Lb } = F; const rr = fab.rr, R = fab.R;
  // a loop drive through the middle (constant b) with parking along it, 3–4 storey bars facing it, pool + clubhouse
  const bm = Lb / 2; fStreetA(fab, F, cell, cuts, bm, 0, La, LW, 2, true, true); localSides(fab, F.P(0, bm), F.P(La, bm), { palms: true });
  for (const s of [-1, 1]) {
    lotQuad(fab, fq(F, 6, La - 6, Math.min(bm + s * LIN, bm + s * (LIN + 18)), Math.max(bm + s * LIN, bm + s * (LIN + 18))), [0, La - 12], s > 0 ? [0, 18] : [18, 0], 0);
    parkCars(fab, F, 6, La - 6, bm + s * LIN, s, 18, 0.6);
    const b0 = bm + s * (LIN + 24); const room = s > 0 ? Lb - 6 - b0 : b0 - 6; if (room < 18) continue;
    const rows = Math.max(1, Math.floor(room / 48));
    for (let r = 0; r < rows; r++) { const bb = b0 + s * (r * 48 + 8); let a = 10;
      // front walk along the row, and (behind the first row) a striped lot between the rows
      { const P = fq(F, 8, La - 8, Math.min(bb - s * 8, bb - s * 10.5), Math.max(bb - s * 8, bb - s * 10.5)); chunkOf(fab, P[0][0], P[0][1]).walk.quad(P, 0.03, P.map((q) => [q[0], q[1]]), null); }
      if (r > 0) { const l0 = bb - s * 11.5, l1 = bb - s * 29.5; lotQuad(fab, fq(F, 10, La - 10, Math.min(l0, l1), Math.max(l0, l1)), [0, La - 20], s > 0 ? [18, 0] : [0, 18], 0); parkCars(fab, F, 10, La - 10, l1, s, 18, 0.55); }
      while (a < La - 40) { const L = rr(40, 70); if (a + L > La - 8) break; const fl = R() < 0.5 ? 3 : 4; const p = F.P(a + L / 2, bb); addBody(fab, p[0], p[1], 0, L, rr(14, 17), fl * 3.1 + 0.6, fang(F, a + L / 2, bb), pickR(fab, WALLS), 3, col);
        for (let k = 0; k < 3; k++) { const t = F.P(a + R() * L, bb + s * rr(12, 20)); addTree(fab, t[0], t[1], rr(2.6, 4.4), rr(2.5, 4), pickR(fab, LEAF)); }
        a += L + rr(18, 30); } }
  }
  const pc = F.P(La / 2, bm + LIN + 12); const ang = fang(F, La / 2, bm);
  addFlat(fab, pc[0], pc[1], 22, 14, ang, [0.84, 0.80, 0.72], 0.016); addPool(fab, pc[0], pc[1], 16, 8, ang);
}

// ------------------------------------------------------------------ industrial ----
function industrialCell(fab, cell, cuts, col) {
  const F = frame(cell, cell.Lu >= cell.Lv); const { La, Lb } = F; const rr = fab.rr, R = fab.R;
  const nr = Math.max(1, Math.round(Lb / 170)); const roads = []; for (let k = 0; k < nr; k++) roads.push((Lb * (k + 0.5)) / nr);
  for (const b of roads) { fStreetA(fab, F, cell, cuts, b, 0, La, LW, 2, true, true);
    for (const s of [-1, 1]) { let a = rr(8, 20); const room = Math.min((Lb / nr) / 2 - LW - 8, 95);
      while (a < La - 40) { const L = rr(60, 150); if (a + L > La - 8) break; const dd = Math.min(room - 22, rr(40, 75)); if (dd < 20) break;
        const yardD = rr(18, 26); const bc = b + s * (LW + yardD + dd / 2); const p = F.P(a + L / 2, bc); const ang = fang(F, a + L / 2, bc);
        addBody(fab, p[0], p[1], 0, L, dd, rr(8, 13), ang, [0.80, 0.79, 0.76].map((c) => c * rr(0.88, 1.08)), 2, col);
        lotQuad(fab, fq(F, a, a + L, Math.min(b + s * LW, b + s * (LW + yardD)), Math.max(b + s * LW, b + s * (LW + yardD))), [0, L], [0, yardD], 1);
        // trailers at the docks, a container stack now and then
        for (let t = a + 6; t < a + L - 6; t += rr(5, 9)) { if (R() < 0.45) continue; const q = F.P(t, b + s * (LW + yardD - 7)); addBody(fab, q[0], q[1], 0, 2.6, 13, 4.0, ang, [0.92, 0.92, 0.9], 8, col); }
        if (R() < 0.35) { const ca = a + L + 6; for (let k = 0; k < 8; k++) { const q = F.P(ca + (k % 2) * 6.4, b + s * (LW + 4 + Math.floor(k / 2) * 2.6)); addBody(fab, q[0], q[1], (k % 3 === 2) ? 2.6 : 0, 6.06, 2.44, 2.6, ang, pickR(fab, [[0.62, 0.18, 0.12], [0.12, 0.30, 0.52], [0.18, 0.42, 0.26], [0.82, 0.55, 0.14], [0.55, 0.56, 0.58]]), 8, col); } }
        a += L + rr(14, 30); } }
  }
  for (let k = 0; k < 18; k++) { const t = F.P(rr(5, La - 5), rr(3, 9)); addTree(fab, t[0], t[1], rr(2.4, 4), rr(2, 3.5), pickR(fab, LEAF)); }
}

// ------------------------------------------------------------------ big-box retail ----
function bigboxCell(fab, cell, cuts, col) {
  const F = frame(cell, cell.Lu >= cell.Lv); const { La, Lb } = F; const rr = fab.rr, R = fab.R;
  const back = Lb * 0.55; const boxes = [];
  let a = rr(15, 40);
  while (a < La - 70) { const L = Math.min(La - 20 - a, rr(80, 170)); if (L < 60) break; const dd = Math.min(Lb - back - 20, rr(60, 95)); const bc = back + dd / 2 + 8;
    const p = F.P(a + L / 2, bc); addBody(fab, p[0], p[1], 0, L, dd, rr(9, 12.5), fang(F, a + L / 2, bc), pickR(fab, WALLS), 1, col); boxes.push([a, a + L, back + 8, back + 8 + dd]); a += L + rr(12, 35); }
  const depth = back + 6; lotQuad(fab, fq(F, 4, La - 4, 1, depth), [0, La - 8], [0, depth - 1], 0);
  lotQuad(fab, fq(F, 4, La - 4, depth, Lb - 2), [0, 1], [0, 1], 2);
  const pads = [];
  for (let k = 0; k < 4; k++) { const ap = rr(25, La - 25); if (pads.some((q) => Math.abs(q - ap) < 40)) continue; pads.push(ap); const p = F.P(ap, 16); addBody(fab, p[0], p[1], 0, rr(16, 24), rr(12, 16), rr(4.5, 6), fang(F, ap, 16), pickR(fab, WALLS), 1, col); }
  parkCars(fab, F, 4, La - 4, 1, 1, depth - 6, 0.28, (aa, bb) => pads.some((q) => Math.abs(q - aa) < 14 && bb < 26));
  for (let x = 30; x < La - 20; x += 60) for (let m = 9; m < depth - 9; m += 18) { const p = F.P(x, m + 1); if (R() < 0.7) addTree(fab, p[0], p[1], rr(2.2, 3.2), rr(2, 3), pickR(fab, LEAF)); }
  for (let x = 4; x < La - 4; x += rr(16, 22)) { const p = F.P(x, 0.5); addPalm(fab, p[0], p[1], rr(8, 12)); }
}

// ------------------------------------------------------------------ park ----
function parkCell(fab, cell, cuts, col) {
  const F = frame(cell, cell.Lu >= cell.Lv); const { La, Lb } = F; const rr = fab.rr, R = fab.R;
  const fields = []; const nf = 2 + Math.floor(R() * 3);
  for (let k = 0; k < nf; k++) { const w = 105, d = 68; const ac = rr(70, La - 70), bc = rr(55, Lb - 55); if (fields.some((f) => Math.abs(f[0] - ac) < 120 && Math.abs(f[1] - bc) < 85)) continue; fields.push([ac, bc]);
    lotQuad(fab, fq(F, ac - w / 2, ac + w / 2, bc - d / 2, bc + d / 2), [0, w], [0, d], 3, 0.004); }
  lotQuad(fab, fq(F, 10, 70, 2, 38), [0, 60], [0, 36], 0); parkCars(fab, F, 10, 70, 2, 1, 36, 0.35);
  { const p = F.P(85, 14); addBody(fab, p[0], p[1], 0, 14, 8, 3.6, fang(F, 85, 14), [0.84, 0.78, 0.66], 1, col); }
  const groves = 6 + Math.floor(R() * 6);
  for (let g = 0; g < groves; g++) { const gc = [rr(20, La - 20), rr(20, Lb - 20)]; if (fields.some((f) => Math.abs(f[0] - gc[0]) < 70 && Math.abs(f[1] - gc[1]) < 50)) continue; const n = 12 + Math.floor(R() * 30);
    for (let k = 0; k < n; k++) { const a = gc[0] + (R() + R() + R() - 1.5) * 50, b = gc[1] + (R() + R() + R() - 1.5) * 40; if (a < 3 || a > La - 3 || b < 3 || b > Lb - 3) continue; const p = F.P(a, b);
      if (R() < 0.2) addPalm(fab, p[0], p[1], rr(8, 13)); else addTree(fab, p[0], p[1], rr(3, 5.5), rr(2.8, 4.5), pickR(fab, LEAF)); } }
  for (let a = 6; a < La - 6; a += rr(12, 18)) for (const b of [3, Lb - 3]) { const p = F.P(a, b); addTree(fab, p[0], p[1], rr(3, 4.5), rr(2.8, 4), pickR(fab, LEAF)); }
}

// ------------------------------------------------------------------ downtown ----
function downtownCell(fab, cell, cuts, col) {
  const L = fab.dtLines.find((q) => q.i === cell.i && q.j === cell.j); const { xs, zs } = L; const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1];
  const W = AW; // downtown streets are 4-lane
  // internal x-lines (constant x) and z-lines, split at every crossing; ends meet the arterials (sidewalk cuts)
  const ix = xs.slice(1, -1), iz = zs.slice(1, -1);
  const zb = [z0, ...iz, z1], xb = [x0, ...ix, x1];
  for (const x of ix) for (let k = 0; k < zb.length - 1; k++) { const a = zb[k] + (k === 0 ? AW : W), b = zb[k + 1] - (k === zb.length - 2 ? AW : W);
    roadSeg(fab, [x, a], [x, b], W, 0); lampRow(fab, [x, a], [x, b], W + 0.8, 32, 8); lampRow(fab, [x, a], [x, b], -(W + 0.8), 32, 24); if (k === 0) cuts[0].push([x - x0 - W - 0.3, x - x0 + W + 0.3]); if (k === zb.length - 2) cuts[2].push([x1 - x - W - 0.3, x1 - x + W + 0.3]); }
  for (const z of iz) for (let k = 0; k < xb.length - 1; k++) { const a = xb[k] + (k === 0 ? AW : W), b = xb[k + 1] - (k === xb.length - 2 ? AW : W);
    roadSeg(fab, [a, z], [b, z], W, 0); lampRow(fab, [a, z], [b, z], W + 0.8, 32, 8); lampRow(fab, [a, z], [b, z], -(W + 0.8), 32, 24); if (k === 0) cuts[3].push([z1 - z - W - 0.3, z1 - z + W + 0.3]); if (k === xb.length - 2) cuts[1].push([z - z0 - W - 0.3, z - z0 + W + 0.3]); }
  for (const x of ix) for (const z of iz) junction(fab, [[x - W, z - W], [x + W, z - W], [x + W, z + W], [x - W, z + W]]);
}
// paving + towers' plazas + generated mid-rises; called after city.js snapped the skyline towers into the blocks
function dtFill(fab, b, col) {
  const rr = fab.rr, R = fab.R;
  const c = chunkOf(fab, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); c.plaza.quad([[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]], 0.03, [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]], null);
  // kerb palms every ~12 m (Brickell-style avenues)
  for (const [p, q] of [[[b.x0 + 1.4, b.z0 + 1.4], [b.x1 - 1.4, b.z0 + 1.4]], [[b.x0 + 1.4, b.z1 - 1.4], [b.x1 - 1.4, b.z1 - 1.4]], [[b.x0 + 1.4, b.z0 + 1.4], [b.x0 + 1.4, b.z1 - 1.4]], [[b.x1 - 1.4, b.z0 + 1.4], [b.x1 - 1.4, b.z1 - 1.4]]]) {
    const L = len2(sub(q, p)); for (let t = 8; t < L - 8; t += rr(11, 14)) { const pt = lerp2(p, q, t / L); if (R() < 0.8) addPalm(fab, pt[0], pt[1], rr(8, 12)); } }
  // fill: grid of parcels, skip any touching a tower footprint (+4 m)
  const cxD = -1650, czD = -100; const dC = Math.hypot((b.ix0 + b.ix1) / 2 - cxD, ((b.iz0 + b.iz1) / 2 - czD) * 0.7); const tall = Math.exp(-Math.pow(dC / 650, 2));
  const W = b.ix1 - b.ix0, D = b.iz1 - b.iz0; const nx = Math.max(1, Math.round(W / 42)), nz = Math.max(1, Math.round(D / 42));
  const hit = (x0, z0, x1, z1) => b.towers.some((t) => x0 < t[2] + 4 && x1 > t[0] - 4 && z0 < t[3] + 4 && z1 > t[1] - 4);
  for (let a = 0; a < nx; a++) for (let k = 0; k < nz; k++) {
    const px0 = b.ix0 + (W * a) / nx + 2, px1 = b.ix0 + (W * (a + 1)) / nx - 2, pz0 = b.iz0 + (D * k) / nz + 2, pz1 = b.iz0 + (D * (k + 1)) / nz - 2;
    if (hit(px0, pz0, px1, pz1)) continue;
    const r = R(); const w = (px1 - px0) * rr(0.72, 0.95), d = (pz1 - pz0) * rr(0.72, 0.95); const cx = (px0 + px1) / 2, cz = (pz0 + pz1) / 2;
    if (r < 0.12) { for (let q = 0; q < 6; q++) { const x = rr(px0 + 2, px1 - 2), z = rr(pz0 + 2, pz1 - 2); if (R() < 0.6) addPalm(fab, x, z, rr(8, 13)); else addTree(fab, x, z, rr(3, 4.5), rr(3, 4), pickR(fab, LEAF)); } continue; } // pocket park
    const kind = r < 0.25 ? 5 : r < 0.6 ? 4 : 3; const h = kind === 5 ? rr(12, 21) : rr(14, 30) + tall * rr(15, 70);
    const wall = kind === 4 ? pickR(fab, [[0.78, 0.80, 0.82], [0.86, 0.86, 0.84], [0.70, 0.74, 0.78], [0.90, 0.88, 0.82]]) : kind === 5 ? [0.80, 0.79, 0.76] : pickR(fab, WALLS);
    addBody(fab, cx, cz, 0, w, d, h, 0, wall, kind, col);
    { const I = chunkOf(fab, cx, cz).I.body; (fab.dtBodies || (fab.dtBodies = [])).push({ rec: I[I.length - 1], cx, cz, w, d, h, kind, b }); } // a_downtown: podium pass (downtown.js) reads these after the bake hashes
    if (kind !== 5 && h > 25 && R() < 0.6) addBody(fab, cx + rr(-w * 0.15, w * 0.15), cz + rr(-d * 0.15, d * 0.15), h, w * rr(0.45, 0.7), d * rr(0.45, 0.7), rr(4, 12), 0, wall, kind, col);
  }
}
// the district cell: only the outer arterial sidewalks it owns (west edge / north / south boundary), cut where its roads join
function districtEdgeWalks(fab, i, j, cutsDistrict) {
  const N = fab.N; const A = N[6][j], B = N[6][j + 1]; const L = len2(sub(B, A)); const side = 1; // inner side of the west edge points east (+x)
  walkSeg(fab, A, B, sideSign(A, B, [-1100, (A[1] + B[1]) / 2]), AW, AIN, AIN, L - AIN, [[56 - A[1] - AW - 0.3, 56 - A[1] + AW + 0.3]]); void side;
  const zE = j === 5 ? ZL[5] : ZL[7]; const P = N[6][j === 5 ? 5 : 7], Q = N[7][j === 5 ? 5 : 7]; const LL = len2(sub(Q, P)); const sg = sideSign(P, Q, [-1100, 0]);
  const cut = (x) => [x - P[0] - AW - 0.3, x - P[0] + AW + 0.3]; void zE;
  walkSeg(fab, P, Q, sg, AW, AIN, AIN, LL - AIN, [cut(-1296), cut(-957)]); void cutsDistrict;
}
// bay park on the coast side of the coastal boulevard: palms + a promenade walk
function bayPark(fab, A, B, side, L) {
  const d = norm2(sub(B, A)); const s = -side; // water side
  walkSeg(fab, A, B, s, AW + 14, AW + 18, AIN, L - AIN, []);
  for (let t = AIN + 4; t < L - AIN; t += fab.rr(10, 16)) { const o = s * (AW + fab.rr(6, 12)); const x = A[0] + d[0] * t - d[1] * o, z = A[1] + d[1] * t + d[0] * o; if (fab.R() < 0.75) addPalm(fab, x, z, fab.rr(9, 14)); else addTree(fab, x, z, fab.rr(3, 4.5), fab.rr(3, 4), pickR(fab, LEAF)); }
}

// ------------------------------------------------------------------ meshes ----
const GEO = {};
function geos() {
  if (GEO.box) return GEO;
  GEO.box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  { // hip roof over a unit footprint, ridge along x
    const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.22, 1, 0], [0.22, 1, 0]];
    const f = [[0, 4, 5, 1], [2, 5, 4, 3], [1, 5, 2, -1], [3, 4, 0, -1]]; const p = [];
    for (const q of f) { p.push(...v[q[0]], ...v[q[1]], ...v[q[2]]); if (q[3] >= 0) p.push(...v[q[0]], ...v[q[2]], ...v[q[3]]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); GEO.roof = g; }
  GEO.tree0 = new THREE.IcosahedronGeometry(1, 0);
  { const g = new THREE.IcosahedronGeometry(1, 1); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = 0.82 + 0.26 * Math.abs(Math.sin(x * 4.1 + y * 2.7) * Math.cos(z * 3.3 - y)); P.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 1), z * k); } g.computeVertexNormals(); GEO.tree1 = g; }
  GEO.trunk = new THREE.CylinderGeometry(0.16, 0.24, 1, 5, 1, true).translate(0, 0.5, 0);
  { // r6.4 flora_a: mainland palm (unit = 10 m): slightly curved 6-sided trunk, leaf-base knob, 9 arching fronds with drooping
    // leaflet wings (inverted V cross-section, yellow-green rachis -> darker edges) + 2 dead hanging fronds. ~90 tris (was 38: 7 flat paddles)
    const parts = []; const tr = new THREE.CylinderGeometry(0.15, 0.25, 9.4, 6, 3, true).translate(0, 4.7, 0); { const P = tr.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i) / 9.4; P.setX(i, P.getX(i) + Math.sin(y * 1.4) * 0.35); } }
    parts.push([tr, [0.50, 0.44, 0.36]]); parts.push([new THREE.IcosahedronGeometry(0.34, 0).scale(1, 0.8, 1).translate(0.34, 9.55, 0), [0.40, 0.36, 0.22]]);
    const frond = (a, L, up, droop, wd, cMid, cEdge) => { const ca = Math.cos(a), sa = Math.sin(a); const p = [], c = [];
      const P = (t) => { const r = L * t; return [0.34 + ca * r, 9.6 + L * (up * t - droop * t * t), sa * r]; };
      const S = [0, 0.4, 0.75, 1]; const rows = S.map((t) => { const q = P(t); const w = wd * Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI) * (1 - 0.35 * t) + 0.04; const dr = w * (0.45 + 0.4 * t);
        return [[q[0] + sa * w, q[1] - dr, q[2] - ca * w], q, [q[0] - sa * w, q[1] - dr, q[2] + ca * w]]; });
      for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) { const A = rows[k][j], B = rows[k][j + 1], C = rows[k + 1][j], D = rows[k + 1][j + 1];
        p.push(...A, ...C, ...B, ...B, ...C, ...D); const e0 = j === 0 ? cEdge : cMid, e1 = j === 0 ? cMid : cEdge; c.push(...e0, ...e0, ...e1, ...e1, ...e0, ...e1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); g.userData.cols = c; return g; };
    const pal = []; for (let k = 0; k < 11; k++) { const dead = k >= 9; const a = k * 2.39996 + 0.3;
      const g = dead ? frond(a, 2.2, -1.1, 0.2, 0.32, [0.55, 0.42, 0.24], [0.45, 0.34, 0.2]) : frond(a, 3.3 + (k % 3) * 0.35, 0.75 - (k / 9) * 0.6, 1.1 + (k % 2) * 0.3, 0.85, [0.36, 0.44, 0.17], [0.17, 0.27, 0.10]);
      pal.push(g); }
    const P0 = [], N0 = [], C0 = []; for (const [g0, col] of parts) { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); const P = g.attributes.position, Nn = g.attributes.normal; for (let i = 0; i < P.count; i++) { P0.push(P.getX(i), P.getY(i), P.getZ(i)); N0.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); C0.push(...col); } }
    for (const g of pal) { const P = g.attributes.position, Nn = g.attributes.normal; for (let i = 0; i < P.count; i++) { P0.push(P.getX(i), P.getY(i), P.getZ(i)); N0.push(Nn.getX(i) * 0.4, Math.abs(Nn.getY(i)) * 0.6 + 0.6, Nn.getZ(i) * 0.4); } C0.push(...g.userData.cols); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P0, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N0, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C0, 3)); GEO.palm = g; }
  { const body = new THREE.BoxGeometry(4.4, 0.62, 1.78).translate(0, 0.68, 0); const skirt = new THREE.BoxGeometry(3.7, 0.42, 1.66).translate(0, 0.21, 0);
    const cab = new THREE.CylinderGeometry(0.62, 1.0, 0.55, 4, 1).rotateY(Math.PI / 4).scale(1.75, 1, 1.1).translate(-0.25, 1.265, 0);
    GEO.car = mergeColored([[body, [1, 1, 1]], [skirt, [0.07, 0.07, 0.08]], [cab, [0.16, 0.18, 0.2]]]); }
  GEO.flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  { const pole = new THREE.CylinderGeometry(0.07, 0.11, 8.2, 5, 1, true).translate(0, 4.1, 0); const arm = new THREE.BoxGeometry(2.2, 0.09, 0.09).translate(1.1, 8.0, 0); const head = new THREE.BoxGeometry(0.6, 0.12, 0.28).translate(2.1, 7.92, 0);
    GEO.lamp = mergeColored([[pole, [0.32, 0.33, 0.34]], [arm, [0.32, 0.33, 0.34]], [head, [1, 1, 1]]]); }
  return GEO;
}
function mergeColored(parts) {
  const p = [], n = [], c = [];
  for (const [g0, col] of parts) { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); const P = g.attributes.position, Nn = g.attributes.normal; for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); c.push(...col); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
}
const HASH = `
float fh12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh12(i),fh12(i+vec2(1,0)),f.x), mix(fh12(i+vec2(0,1)),fh12(i+vec2(1,1)),f.x), f.y); }
`;
// a_houses: seven-segment digit (house numbers) and a 4x4 ordered dither (pool screens), body program only
// a_shopnight: a shop room behind flat glazing, read along the view ray (same idea as the a_downtown2 lobby): ceiling with troffer rows at
// 3.0 m, a gondola-shelf line 2.2 m in (aisles every 2.6 m, packed shelves), a pale floor, the back wall 9 m in. Returns a light level
// (~0.6 average, troffers ~2.6) that scales the glass's night glow; it falls back to the average with the pixel footprint (no shimmer).
const SHOPIN = `
vec3 sTint = vec3(1.0); // colour of what the ray hit (muted packaging / a brand band on the back wall)
float shopIn(vec2 uv0, vec3 dV, vec3 fn, vec2 ft, float sd) {
  float dn = max(-dot(dV, fn), 0.12 * length(dV)); vec2 pr = vec2(dot(dV.xz, ft), dV.y) / dn;
  float tC = pr.y > 0.002 ? (3.0 - uv0.y) / pr.y : 99.0, tF = pr.y < -0.002 ? -uv0.y / pr.y : 99.0; float t = min(9.0, min(tC, tF)); float lv;
  vec2 s2 = uv0 + pr * 2.2; float sx = s2.x / 2.6 + sd * 7.0;
  if (t > 2.2 && s2.y < 1.65 && fract(sx) < 0.62) { vec2 g = floor(vec2(s2.x / 0.32, s2.y / 0.42)); lv = (0.45 + 0.5 * fh12(g + sd * 13.0)) * (1.0 - 0.6 * step(fract(s2.y / 0.42), 0.12)); t = 2.2; sTint = mix(vec3(1.0), 0.35 + 0.9 * vec3(fh12(g * 1.3 + 2.1), fh12(g + 7.7), fh12(g * 0.7 + sd)), 0.5); }
  else if (t == tC) { vec2 c = uv0 + pr * tC; lv = 0.42 + 2.2 * step(abs(fract(c.x / 2.4 + sd) - 0.5), 0.2) * step(abs(fract(tC / 2.1) - 0.5), 0.14); }
  else if (t == tF) { vec2 f = uv0 + pr * tF; lv = 0.62 + 0.12 * step(0.5, fract(f.x / 0.6) + 0.0 * f.y); }
  else { vec2 b = uv0 + pr * 9.0; lv = 0.78 - 0.3 * step(b.y, 1.9) * step(0.4, fract(b.x / 1.3 + sd)); sTint = mix(vec3(1.0), 0.3 + 0.8 * vec3(fh12(vec2(sd, 1.0)), fh12(vec2(sd, 2.0)), fh12(vec2(sd, 3.0))), step(abs(b.y - 2.35), 0.22)); }
  lv *= 1.0 - 0.28 * clamp(t / 9.0, 0.0, 1.0); float nr = 1.0 - smoothstep(0.06, 0.3, length(fwidth(vFW))); sTint = mix(vec3(1.0), sTint, nr);
  return mix(0.66, lv, nr); }
`;
const HKFN = `
float fsgD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); } // a_signals: segment distance (pedestrian symbols)
float hkSeg(vec2 p, int d){ int m = d==0?63: d==1?6: d==2?91: d==3?79: d==4?102: d==5?109: d==6?125: d==7?7: d==8?127:111; float t = 0.16; float s = 0.0;
  if (p.x < 0.0 || p.x > 1.0) return 0.0;
  if ((m & 1) != 0) s += step(1.0 - t, p.y) * step(t, p.x) * step(p.x, 1.0 - t);
  if ((m & 2) != 0) s += step(1.0 - t, p.x) * step(0.5, p.y);
  if ((m & 4) != 0) s += step(1.0 - t, p.x) * step(p.y, 0.5);
  if ((m & 8) != 0) s += step(p.y, t) * step(t, p.x) * step(p.x, 1.0 - t);
  if ((m & 16) != 0) s += step(p.x, t) * step(p.y, 0.5);
  if ((m & 32) != 0) s += step(p.x, t) * step(0.5, p.y);
  if ((m & 64) != 0) s += step(abs(p.y - 0.5), t * 0.5) * step(t, p.x) * step(p.x, 1.0 - t);
  return min(s, 1.0); }
float hkBayer(vec2 f){ ivec2 q = ivec2(mod(f, 4.0)); int i = q.x + q.y * 4; int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[i]) + 0.5) / 16.0; }
`;
const IVERT = `
  { vec4 wq = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq; vIB = instanceMatrix[3].xyz; vIH = length(instanceMatrix[1].xyz);
  #endif
    vFW = (modelMatrix * wq).xyz; }`;
let MATS = null;
function mats(M) {
  if (MATS) return MATS;
  const tPl = M.white && M.white.map;
  // buildings: facade drawn from world position on each face (u along the face, v height above the instance base)
  const body = prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), 'fabBody', (s) => {
    s.uniforms.tPl = { value: tPl }; s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aK; varying vec2 vK; varying vec3 vFW; varying vec3 vIB; varying float vIH; varying vec3 vFN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvK = aK; vFN = normalize((modelMatrix * vec4(normalize(mat3(instanceMatrix) * normal), 0.0)).xyz);' + IVERT);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tPl; uniform float uNight; varying vec2 vK; varying vec3 vFW; varying vec3 vIB; varying float vIH; varying vec3 vFN;' + HASH + HKFN + (OLD_ASHOP ? '' : SHOPIN))
      .replace('#include <color_fragment>', `#include <color_fragment>
  float fk = floor(vK.x + 0.5), fsd = vK.y;${OLD_ASHOP ? '' : ' float fOff = 0.0, fDr = 0.0; if (fsd > 1.5) { fDr = 1.0; fOff = step(3.5, fsd); fsd = fract(fsd); } vec3 fLC = vec3(1.0, 0.72, 0.42);'} if (vK.x < fk - 0.004 && hkBayer(gl_FragCoord.xy + vec2(2.0, 1.0)) < (fk - vK.x) / 0.45) discard; // a_housepolish: kit fade (fraction 0..-0.45)
  vec3 fn = normalize(vFN); float fy = vFW.y - vIB.y; float fGlass = 0.0, fLit = 0.0, fEm = 0.0, fStrip = -1.0; // a_strip: fEm = self-lit (light boxes / lenses), fStrip = shop face class
  vec2 ft = vec2(-fn.z, fn.x); float fu = dot(vFW.xz, ft) + fsd * 37.0;
  vec3 ftex = texture2D(tPl, (abs(fn.y) > 0.5 ? vFW.xz : vec2(fu, vFW.y)) * 0.25).rgb / 0.63;
  diffuseColor.rgb *= mix(vec3(1.0), clamp(ftex, 0.7, 1.2), 0.5) * (0.92 + 0.12 * fnoise(vFW.xz * 0.05 + fsd * 9.0));
  if (fn.y > 0.5) { // flat roofs: light membrane / gravel, darker patches, a few dark units
    if (fk > 0.5 && fk < 5.5) { float m = fnoise(vFW.xz * 0.21 + fsd * 5.0); diffuseColor.rgb = mix(vec3(0.74, 0.73, 0.70), vec3(0.88, 0.87, 0.84), fsd) * (0.82 + 0.25 * m);
      vec2 g = fract(vFW.xz / 9.0 + fsd * 3.0); float unitM = step(0.78, fh12(floor(vFW.xz / 9.0) + fsd)) * step(abs(g.x - 0.5), 0.17) * step(abs(g.y - 0.5), 0.17); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.44), unitM); }
    if (fk > 5.5 && fk < 6.5) diffuseColor.rgb *= 0.8 + 0.4 * fnoise(vFW.xz * 1.7);
    if (fk > 9.5 && fk < 10.5) { float r = length(vFW.xz - vIB.xz); float fan = step(r, 0.33) * (0.35 + 0.25 * step(0.5, fract(r / 0.045))); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09) + fan * 0.1, step(r, 0.33)); } // a_houses: AC fan grille
    if (fk > 11.5 && fk < 12.5) { if (hkBayer(gl_FragCoord.xy) < 0.68) discard; } // a_houses: screen roof
  } else if (fn.y > -0.5) {
    if (fk < 0.5) { // house: punched windows (1 or 2 floors), a darker plinth
      float fl = floor(fy / 3.0); float wy = fy - fl * 3.0; vec2 c = vec2(floor(fu / 3.4), fl); float wx = fract(fu / 3.4);
      float win = step(0.28, wx) * step(wx, 0.72) * step(0.95, wy) * step(wy, 2.25) * step(fy, vIH - 0.4) * step(0.25, fh12(c + fsd * 11.0));
      fGlass = win; fLit = win * step(0.55, fh12(c * 1.7 + fsd));
      diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.45, fy)) * 0.25;
      { // a_houses: close-range wall detail by look (1 地中海 2 牧场 3 海岸 4 现代), faded out with the pixel footprint (far view unchanged)
        float hst = floor((vK.x - fk) * 10.0 + 0.5); float hsub = floor((vK.x - fk) * 50.0 + 0.5) - hst * 5.0; // a_housepolish: 牧场 sub-style 0..2
        bool shL = hst > 2.5 && hst < 3.5 || hst > 1.5 && hst < 2.5 && hsub > 0.5 && hsub < 1.5, shA = hst > 1.5 && hst < 2.5 && hsub < 0.5, stoneW = hst > 1.5 && hst < 2.5 && hsub > 1.5;
        float fNr = (1.0 - smoothstep(0.05, 0.16, length(fwidth(vFW)))) * step(0.5, hst);
        if (fNr > 0.0) { vec3 base = diffuseColor.rgb; vec3 dc = base; float g = fGlass;
          float wOn = step(fy, vIH - 0.4) * step(0.25, fh12(c + fsd * 11.0)); float wm = wx * 3.4; float inX = step(0.952, wm) * step(wm, 2.448), inY = step(0.95, wy) * step(wy, 2.25);
          float fwid = hst > 3.5 ? 0.06 : hst < 1.5 ? 0.13 : 0.08; vec3 trimC = hst < 1.5 ? vec3(0.95, 0.92, 0.84) : hst > 3.5 || stoneW ? vec3(0.13, 0.11, 0.10) : vec3(0.96, 0.96, 0.94);
          dc *= 0.965 + 0.07 * fnoise(vec2(fu, fy) * 5.0); // stucco trowel
          if (hst > 2.5 && hst < 3.5) dc *= 0.9 + 0.1 * smoothstep(0.0, 0.22, fract(fy / 0.19)); // lap siding
          else { float vj = step(abs(fract(fu / 6.8 + 0.5) - 0.5) * 6.8, 0.012); dc *= 1.0 - 0.22 * vj; dc *= 1.0 - 0.25 * step(abs(fy - 3.0), 0.02) * step(4.5, vIH); } // control joints, floor reveal
          dc *= 1.0 - 0.3 * step(abs(fy - 0.42), 0.015); // water-table reveal
          if (stoneW) { float row = floor(fy / 0.17); float sx2 = fu / 0.42 + row * 0.5; float st = fh12(vec2(floor(sx2), row) + fsd * 13.0); // stone wainscot to 0.95 m, cap course
            float jn = max(step(fract(fy / 0.17), 0.08), step(fract(sx2), 0.05)); vec3 sc2 = mix(vec3(0.62, 0.58, 0.52), vec3(0.80, 0.76, 0.68), st) * (1.0 - 0.35 * jn);
            float inW = step(fy, 0.95); dc = mix(dc, sc2, inW); dc = mix(dc, vec3(0.84, 0.82, 0.77), step(0.95, fy) * step(fy, 1.02)); }
          float fr = step(0.952 - fwid, wm) * step(wm, 2.448 + fwid) * step(0.95 - fwid, wy) * step(wy, 2.25 + fwid) * (1.0 - inX * inY) * wOn;
          float sill = step(0.952 - fwid - 0.07, wm) * step(wm, 2.448 + fwid + 0.07) * step(0.95 - fwid - 0.07, wy) * step(wy, 0.95 - fwid) * wOn;
          dc = mix(dc, trimC, max(fr, sill)); dc *= 1.0 - 0.35 * sill * step(wy, 0.95 - fwid - 0.045);
          if (hst < 1.5 || shL) { float mun = (step(abs(wm - 1.7), 0.022) + step(abs(wy - 1.6), 0.022)) * inX * inY * wOn; g *= 1.0 - mun; dc = mix(dc, trimC, mun); }
          float sh = fh12(vec2(fsd * 17.0, 3.0)); vec3 shC = sh < 0.25 ? vec3(0.14, 0.36, 0.38) : sh < 0.5 ? vec3(0.13, 0.19, 0.30) : sh < 0.75 ? vec3(0.42, 0.50, 0.40) : vec3(0.94, 0.94, 0.92);
          if (shL) { // louvered shutters each side (海岸, 牧场 sub 1)
            float sx = step(0.952 - fwid - 0.62, wm) * step(wm, 0.952 - fwid - 0.04) + step(2.448 + fwid + 0.04, wm) * step(wm, 2.448 + fwid + 0.62); sx *= step(0.95 - fwid, wy) * step(wy, 2.25 + fwid) * wOn;
            float lv = 0.78 + 0.22 * smoothstep(0.0, 0.5, fract(wy / 0.055)); dc = mix(dc, shC * lv, sx); }
          else if (shA) { // accordion storm shutters stacked open (牧场 sub 0)
            float sx = step(0.952 - fwid - 0.2, wm) * step(wm, 0.952 - fwid - 0.01) + step(2.448 + fwid + 0.01, wm) * step(wm, 2.448 + fwid + 0.2); sx *= step(0.88, wy) * step(wy, 2.33) * wOn;
            dc = mix(dc, vec3(0.78, 0.77, 0.72) * (0.75 + 0.25 * abs(sin(wm * 70.0))), sx); }
          else if (hst < 1.5 && sh < 0.45) { // Bahama shutter propped over the upper window
            float sx = step(0.952 - fwid, wm) * step(wm, 2.448 + fwid) * step(1.45, wy) * step(wy, 2.25 + fwid) * wOn; float lv = 0.8 + 0.2 * smoothstep(0.0, 0.5, fract(wy / 0.06));
            dc = mix(dc, mix(shC, vec3(0.30, 0.42, 0.30), 0.5) * lv, sx); g *= 1.0 - sx; dc *= 1.0 - 0.3 * step(1.3, wy) * step(wy, 1.45) * inX * wOn; }
          diffuseColor.rgb = mix(base, dc, fNr); fGlass = mix(fGlass, g, fNr); fLit *= mix(1.0, step(0.5, g), fNr); }
      }
    } else if (fk > 8.5) { // a_houses kit (vertical faces): 9 sectional garage door, 10 AC condenser, 11 house-number plaque, 12 screen, 13 entry door, 14 fence / gate boards
      float lu = dot(vFW.xz - vIB.xz, ft); float fNr = 1.0 - smoothstep(0.04, 0.14, length(fwidth(vFW)));
      if (fk < 9.5) { float shH = vIH / 4.0; float sec = fract(fy / shH); float px = fract(lu / 0.66 + 0.5); float ed = min(min(px, 1.0 - px) * 0.66, min(sec, 1.0 - sec) * shH);
        float k = 0.86 + 0.14 * smoothstep(0.03, 0.08, ed); k *= 1.0 - 0.35 * (1.0 - step(0.012, min(sec, 1.0 - sec) * shH));
        float top = step(3.0 * shH + 0.1, fy) * step(fy, vIH - 0.1) * step(0.06, ed) * step(0.6, fh12(vec2(fsd * 7.0, 1.0)));
        diffuseColor.rgb *= mix(1.0, k, fNr); fGlass = top * fNr; }
      else if (fk < 10.5) { float gr = step(0.08, fy) * step(fy, vIH - 0.08) * step(0.5, fract(lu / 0.035)); diffuseColor.rgb *= 1.0 - 0.45 * gr * fNr; }
      else if (fk < 11.5) { vec2 dp = vec2(0.15 - lu, fy - 0.025) / vec2(0.1, 0.11); float n = floor(fsd * 900.0) + 100.0;
        float dg = dp.x < 1.0 ? floor(n / 100.0) : dp.x < 2.0 ? mod(floor(n / 10.0), 10.0) : mod(n, 10.0); vec2 cp = vec2(fract(dp.x) * 1.25, dp.y);
        float on = step(0.0, dp.x) * step(dp.x, 3.0) * step(0.0, dp.y) * step(dp.y, 1.0) * hkSeg(cp, int(dg)) * step(abs(fn.y), 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0) - diffuseColor.rgb * 0.85, on * fNr); }
      else if (fk < 12.5) { if (hkBayer(gl_FragCoord.xy) < 0.68) discard; }
      else if (fk < 13.5) { float lp = mod(lu + 40.0, 0.825) - 0.4125; float pa = step(0.07, abs(lp)) * step(abs(lp), 0.33); float py = step(0.25, fy) * step(fy, 0.95) + step(1.15, fy) * step(fy, 1.95);
        float ed = pa * py; float rim = ed * (1.0 - step(0.1, abs(lp)) * 0.0); float bd = (1.0 - step(0.03, abs(abs(lp) - 0.07))) * py + (1.0 - step(0.03, abs(abs(lp) - 0.33))) * py;
        diffuseColor.rgb *= mix(1.0, (0.92 + 0.08 * rim) * (1.0 - 0.3 * bd), fNr); float lite = step(1.95, fy) * step(fy, 2.08) * step(abs(lp), 0.33) * step(0.5, fh12(vec2(fsd * 5.0, 2.0))); fGlass = lite * fNr;
        float knob = step(abs(abs(lp) - 0.36), 0.03) * step(abs(fy - 1.0), 0.05); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.62, 0.36), knob * fNr); }
      else if (fk > 14.5) { // a_strip kit: 15 shop entrance (3.0 m: double glass door + sidelites + transom, frame = instance colour), 16 light-box face, 17 lens (below)
        if (fk < 15.5 && vIH < 2.0) { // a_stripfix: drive-through pickup window (1.5 x 1.35, frame = instance colour): fixed right half, left sash slid open over it, transom light
          float ax = abs(lu); float fw = 0.055; float frm = max(max(step(0.75 - fw, ax), step(fy, fw)), step(vIH - fw, fy)); float tb = step(abs(fy - (vIH - 0.36)), 0.022);
          float meet = step(abs(lu - 0.02), 0.024) * step(fy, vIH - 0.36); float st2 = step(abs(lu + 0.33), 0.024) * step(fy, vIH - 0.36); // meeting stile, stile of the slid sash
          float opn = step(lu, -0.36) * step(fw, fy) * step(fy, vIH - 0.38) * (1.0 - frm); float bars = max(max(frm, tb), max(meet, st2));
          float glz = (1.0 - bars) * (1.0 - opn); float pull = step(abs(lu + 0.06), 0.012) * step(abs(fy - 0.62), 0.09);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.52, 0.40) * (0.85 + 0.15 * step(0.5, fract(fy * 3.0))), opn); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2), pull);
          fGlass = glz * (1.0 - pull); fLit = max(fGlass * 0.9, opn * 0.6); }
        else if (fk < 15.5) { float ax = abs(lu); float inD = step(ax, 0.9); float leaf = abs(ax - 0.45);
          float g1 = inD * step(leaf, 0.39) * step(0.24, fy) * step(fy, 2.2); float g2 = (1.0 - inD) * step(0.95, ax) * step(ax, 1.44) * step(0.47, fy) * step(fy, 2.2);
          float g3 = step(2.3, fy) * step(fy, vIH - 0.06) * step(ax, 1.44) * step(0.04, abs(ax - 0.9)); float g = max(max(g1, g2), g3);
          float bar = inD * step(abs(fy - 1.05), 0.025) * step(leaf, 0.3); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.81, 0.82), bar);
          float hrs = inD * step(abs(ax - 0.62), 0.12) * step(abs(fy - 1.5), 0.1) * step(0.5, fract(fy * 22.0)); // vinyl opening-hours lines
          fGlass = g * (1.0 - bar) * (1.0 - hrs); fLit = fGlass;${OLD_ASHOP ? '' : ' if (fDr > 0.5) { fLit = fGlass * mix(0.40 * mix(0.8, 1.1, smoothstep(0.3, 2.6, fy)), 0.03, fOff); fLC = vec3(0.97, 0.88, 0.76); } /* a_shopnight: door lit with its tenant (open / closed) */'} diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), hrs * g); }
        else if (fk < 16.5) { float e = min(1.0, step(fy, 0.045) + step(vIH - 0.045, fy)); diffuseColor.rgb *= 1.0 - 0.5 * e; fEm = 1.0 - e; }${OLD_ASHOP ? '' : `
        else if (fk > 20.5 && fk < 21.5) { // a_shopnight: strip tenant glazing panel (night only, dithered in with uNight), seed = mullion parity 0.5 + open 0.25 + 0.2 * tone
          if (hkBayer(gl_FragCoord.xy) > uNight * 1.8 - 0.05) discard;
          float pPar = step(0.5, fsd), pS = fsd - 0.5 * pPar, pOpen = step(0.25, pS), pT = clamp((pS - 0.25 * pOpen) / 0.2, 0.0, 1.0); float gy = fy + 0.45;
          float m = fract(lu / 1.5 + 0.5 * pPar); float mul = 1.0 - step(0.022, m) * step(m, 0.978); float tb = step(abs(gy - 2.36), 0.03);
          float frm = max(mul, tb); fGlass = 1.0 - frm; diffuseColor.rgb = mix(vec3(0.20, 0.20, 0.21), vec3(0.08, 0.11, 0.14), fGlass);
          float lev = (0.24 + 0.12 * pT) * shopIn(vec2(lu, gy), vFW - cameraPosition, fn, ft, pT);
          fLit = mix(0.035 * smoothstep(2.9, 1.2, gy), lev, pOpen); // closed: only a dim back-of-house light
          fLC = mix(vec3(0.90, 0.93, 0.97), vec3(1.0, 0.80, 0.58), step(0.58, fract(pT * 7.13))) * mix(vec3(1.0), sTint, pOpen); }`} }
      else { float bd = 1.0 - step(0.012, abs(fract(lu / 0.15 + 0.5) - 0.5) * 0.15); float rail = step(vIH - 0.12, fy) + step(abs(fy - 0.3), 0.05); diffuseColor.rgb *= mix(1.0, (1.0 - 0.3 * bd) * (1.0 - 0.12 * clamp(rail, 0.0, 1.0)), fNr); }
    } else if (fk < 1.5 && vK.x - fk > 0.02) { // a_strip: strip-mall shop, the lot-side normal angle rides in the fraction (0.05..0.45)
      float th = (vK.x - fk - 0.05) / 0.4 * 6.2831853; float fr = dot(fn.xz, vec2(cos(th), sin(th))); float lu = dot(vFW.xz - vIB.xz, ft);
      float jt = step(abs(fract(lu / 6.0 + 0.5) - 0.5) * 6.0, 0.012); float cap = step(vIH - 0.18, fy), rev = step(abs(fy - (vIH - 0.62)), 0.03);
      if (fr > 0.7) { fStrip = 1.0; // storefront: tile bulkhead, glass 0.45-3.0 m on a 1.5 m mullion grid (the kit's piers / doors sit on it), transom bar, stucco above the canopy
        float m = fract(lu / 1.5); float mul = 1.0 - step(0.022, m) * step(m, 0.978); float tb = step(abs(fy - 2.36), 0.03);
        float gl = step(0.45, fy) * step(fy, 3.0) * (1.0 - mul) * (1.0 - tb); fGlass = gl; ${OLD_ASHOP ? 'fLit = gl * 0.85 * step(0.25, fh12(vec2(floor(lu / 4.5), fsd)));' : 'fLit = gl * 0.28 * shopIn(vec2(lu, fy), vFW - cameraPosition, fn, ft, fsd) * step(0.3, fh12(vec2(floor(lu / 4.5), fsd))); fLC = mix(vec3(0.90, 0.93, 0.97), vec3(1.0, 0.80, 0.58), step(0.5, fh12(vec2(floor(lu / 4.5), fsd * 3.0)))) * sTint;'} // a_shopnight: level ~ island shop rooms, brighter under the ceiling, cool / warm (near: the tenant panels cover it)
        float frm = step(0.42, fy) * step(fy, 3.04) * max(mul, tb); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.20, 0.21), frm);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.32, 0.30) * (0.9 + 0.1 * step(0.5, fract(lu / 0.3))), step(fy, 0.42));
        diffuseColor.rgb *= (1.0 - 0.25 * rev) * (1.0 + 0.06 * cap); }
      else if (fr < -0.7) { fStrip = 2.0; // service wall: steel doors every 12 m, control joints, a darker splash band
        float dz = step(abs(fract(lu / 12.0 + 0.31) - 0.5) * 12.0, 0.48) * step(fy, 2.12); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.53, 0.52), dz);
        diffuseColor.rgb *= (1.0 - 0.2 * jt) * (1.0 - 0.15 * (1.0 - smoothstep(0.0, 0.6, fy))) * (1.0 - 0.25 * rev); }
      else { fStrip = 3.0; diffuseColor.rgb *= (1.0 - 0.2 * jt) * (1.0 - 0.25 * rev) * (1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.45, fy))); }
    } else if (fk < 1.5) { // retail: storefront glazing band with mullions, painted sign band, parapet line
      float mull = step(0.06, fract(fu / 3.0)); float gl = step(0.35, fy) * step(fy, 3.3) * mull; fGlass = gl; ${OLD_ASHOP ? 'fLit = gl * 0.8;' : 'float rb = floor(fu / 9.0); fLit = gl * (0.24 + 0.1 * fh12(vec2(rb, fsd * 7.0))) * shopIn(vec2(fu, fy), vFW - cameraPosition, fn, ft, fsd + rb * 0.37) * step(0.3, fh12(vec2(rb, fsd * 5.0 + 1.7))); fLC = mix(vec3(0.90, 0.93, 0.97), vec3(1.0, 0.80, 0.58), step(0.5, fh12(vec2(rb, fsd * 3.0)))) * sTint;'} // a_shopnight: 9 m shop bays, ~70 % open at night
      float sb = step(3.65, fy) * step(fy, 4.75) * step(0.35, fract(fu / 47.0 + fsd));
      vec3 sc = mix(vec3(0.62, 0.16, 0.12), vec3(0.14, 0.34, 0.52), step(0.5, fh12(vec2(floor(fu / 47.0 + fsd), fsd))));
      diffuseColor.rgb = mix(diffuseColor.rgb, sc, sb * 0.85); diffuseColor.rgb *= 1.0 - step(vIH - 0.35, fy) * 0.18;
    } else if (fk < 2.5) { // warehouse: tilt-up panel joints, roll-up doors, clerestory strip
      float j = 1.0 - step(0.012, fract(fu / 7.5)) * step(fract(fu / 7.5), 0.988); diffuseColor.rgb *= 1.0 - j * 0.35;
      float bay = floor(fu / 14.0); float door = step(fract(fu / 14.0), 0.32) * step(fy, 4.6) * step(fh12(vec2(bay, fsd * 7.0)), 0.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.52, 0.54) * (0.85 + 0.15 * step(0.5, fract(fy * 3.3))), door);
      fGlass = step(vIH - 2.1, fy) * step(fy, vIH - 1.3) * step(0.5, fract(fu / 4.0)); diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 1.2, fy)) * 0.2;
    } else if (fk < 3.5) { // garden apartment / mid-rise residential: window grid, balcony slab lines
      float fl = floor((fy - 0.6) / 3.1); float wy = fy - 0.6 - fl * 3.1; vec2 c = vec2(floor(fu / 3.4), fl); float wx = fract(fu / 3.4);
      float win = step(0.2, wx) * step(wx, 0.8) * step(0.8, wy) * step(wy, 2.5) * step(0.6, fy) * step(fy, vIH - 0.5); fGlass = win; fLit = win * step(0.6, fh12(c + fsd * 3.0));
      diffuseColor.rgb *= 1.0 - step(abs(wy - 0.1), 0.12) * 0.22;
    } else if (fk < 4.5) { // office: ribbon glazing + mullions
      float fl = floor(fy / 3.8); float wy = fy - fl * 3.8; vec2 c = vec2(floor(fu / 1.6), fl);
      float win = step(1.0, wy) * step(wy, 3.4) * step(0.08, fract(fu / 1.6)) * step(fy, vIH - 0.8); fGlass = win; fLit = win * step(0.62, fh12(vec2(floor(fu / 6.4), fl) + fsd));
    } else if (fk < 5.5) { // parking garage: open decks between slab edges, columns every 8 m
      float wy = mod(fy, 3.0); float open = step(1.0, wy) * step(wy, 2.6) * step(0.1, fract(fu / 8.0)) * step(fy, vIH - 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.085, 0.09), open);
    } else if (fk < 6.5) { // hedge (r6.4 flora_a): leaf clumps at two scales, shaded base, sunlit clipped crown edge, a few gaps
      float lc = fnoise(vec2(fu, fy) * 3.1 + fsd * 5.0) * 0.6 + fnoise(vec2(fu, fy) * 9.0) * 0.4; diffuseColor.rgb *= 0.62 + 0.62 * lc;
      diffuseColor.rgb *= 0.7 + 0.35 * smoothstep(0.0, vIH, fy); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.2, 0.95), smoothstep(vIH - 0.25, vIH, fy) * 0.6);
      diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(0.78, 0.86, fnoise(vec2(fu, fy) * 1.3 + 7.0)); }
  }
  float dtCov = -1.0; // a_downtown: downtown podium coverage for the far-view average (-1 = not a podium pixel)
  if (fn.y > -0.5 && fn.y < 0.5) {
    float dtF = vK.x - fk; bool dtM = fk > 2.5 && fk < 5.5 && dtF > 0.1; float lu = dot(vFW.xz - vIB.xz, ft);
    // dtM: generated downtown mid-rise (3 residential 4 office 5 garage, street face in the fraction); 18 lobby glazing panel (towers)
    float GF = dtM ? (fk < 3.5 ? 4.4 : fk < 4.5 ? 4.8 : 3.8) : vIH;
    if ((dtM || (fk > 17.5 && fk < 18.5)) && fy < GF) {
      float sF = floor((dtF - 0.15) / 0.07 + 0.5); vec2 sN = !dtM || sF > 3.5 ? vec2(0.0) : sF < 0.5 ? vec2(-1.0, 0.0) : sF < 1.5 ? vec2(1.0, 0.0) : sF < 2.5 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
      float ent = step(0.9, dot(fn.xz, sN)) * step(abs(lu), 1.75); // double entrance door at the middle of the street face
      float pl = step(fy, 0.55), fas = step(GF - 0.9, fy); float jn = step(fract(lu / 1.2 + 0.5), 0.025);
      vec3 gran = mix(vec3(0.24, 0.235, 0.23), vec3(0.37, 0.355, 0.34), fh12(vec2(floor(lu / 1.2 + 0.5), fsd * 9.0))) * (1.0 - 0.45 * jn) * (1.0 - 0.3 * step(abs(fy - 0.53), 0.02));
      vec3 fasC = vec3(0.72, 0.69, 0.63) * (1.0 - 0.35 * step(abs(fy - (GF - 0.45)), 0.018)) * (1.0 - 0.25 * step(GF - 0.06, fy)) * (1.0 - 0.3 * step(abs(fy - (GF - 0.9)), 0.03));
      vec3 frmC = vec3(0.16, 0.15, 0.14);
      if (dtM && fk > 4.5) { // garage base: board-formed concrete, a vehicle entry on the street face (striped header, clearance bar), louvre bands
        float op = step(0.9, dot(fn.xz, sN)) * step(abs(lu), 3.1) * step(fy, 3.0); float hd = step(0.9, dot(fn.xz, sN)) * step(abs(lu), 3.4) * step(3.0, fy) * step(fy, 3.38);
        vec3 conc = vec3(0.60, 0.59, 0.56) * (0.92 + 0.08 * step(0.5, fract(fy / 0.3))) * (1.0 - 0.3 * step(fract(lu / 4.0 + 0.5), 0.012));
        float lv = (1.0 - op) * step(1.2, fy) * step(fy, 2.9) * step(0.12, fract(lu / 4.0 + 0.5)) * step(fract(lu / 4.0 + 0.5), 0.88) * step(0.45, fract(fy / 0.12));
        vec3 c = mix(conc, vec3(0.13, 0.135, 0.14), lv); c = mix(c, gran, pl * (1.0 - op));
        c = mix(c, mix(vec3(0.08), vec3(0.88, 0.70, 0.10), step(0.5, fract((lu + fy) / 0.5))), hd);
        float bar = op * step(abs(fy - 2.45), 0.06) * step(abs(lu), 2.6); c = mix(c, mix(vec3(0.85, 0.66, 0.10), vec3(0.1), step(0.5, fract(lu / 0.6))), bar);
        c = mix(c, vec3(0.045, 0.047, 0.05) * (1.0 + 2.0 * step(2.6, fy)), op * (1.0 - bar));
        diffuseColor.rgb = c; fGlass = 0.0; fLit = 0.0; fEm = op * (1.0 - bar) * step(2.75, fy) * step(fy, 2.85) * step(0.5, fract(lu / 1.6)) * 0.6; dtCov = 0.0; }
      else {
        float m = fract(lu / 1.5 + 0.5); float mul = 1.0 - step(0.022, m) * step(m, 0.978); float tr = step(abs(fy - 3.2), 0.035) * step(4.0, GF);
        float dr = ent * step(fy, 2.55); float ax = abs(lu); float dfr = ent * max(step(abs(fy - 2.55), 0.04), step(abs(ax - 0.875), 0.03) * step(fy, 2.55) + step(1.7, ax));
        float bar = dr * step(abs(fy - 1.05), 0.022) * step(0.15, abs(ax - 0.875)) * step(abs(ax - 0.875), 0.62);
        float pq = abs(fract(lu / 6.0 + 0.5) - 0.5) * 6.0; float pier = step(2.65, pq) * (1.0 - step(0.5, ent + step(abs(lu), 2.3) * step(0.9, dot(fn.xz, sN)))) * (1.0 - fas); // limestone pier every 6 m
        float gl = (1.0 - pl) * (1.0 - fas) * (1.0 - max(mul * (1.0 - ent), tr)) * (1.0 - dfr) * (1.0 - bar) * (1.0 - pier);
        vec3 lime = vec3(0.74, 0.71, 0.65) * (0.94 + 0.06 * fnoise(vec2(lu, fy) * 3.0)) * (1.0 - 0.3 * step(fract(fy / 0.9), 0.02));
        vec3 room = mix(vec3(0.46, 0.42, 0.36), vec3(0.80, 0.75, 0.66), smoothstep(0.6, GF - 1.0, fy)) * (1.0 + 0.2 * step(GF - 1.35, fy)); // lobby seen through the glass
        // a_downtown2: lobby depth behind the glass (view-ray parallax on the same program): pendant lights 2.4 m in, stone columns 3.6 m in
        // (on the 6 m pier rhythm), a reception desk 5 m in on the entrance face, a polished floor and a washed back wall 7.5 m in
        float iL = 1.0; { vec3 dV = vFW - cameraPosition; float dn = max(-dot(dV, fn), 0.12 * length(dV)); vec2 pr = vec2(dot(dV.xz, ft), dV.y) / dn; vec2 uv0 = vec2(lu, fy);
          float tF = pr.y < -0.002 ? -fy / pr.y : 99.0; float tB = min(7.5, tF); vec2 bw = uv0 + pr * tB;
          float wash = 0.62 + 0.5 * smoothstep(1.3, 0.0, abs(fract(bw.x / 3.0) - 0.5) * 3.0) * smoothstep(0.4, GF - 1.0, bw.y);
          vec3 ic = tF < 7.5 ? mix(vec3(0.50, 0.47, 0.42), vec3(0.66, 0.62, 0.55), abs(step(0.5, fract(bw.x / 1.2)) - step(0.5, fract(tB / 1.2)))) : room * (0.85 + 0.15 * wash); iL = tF < 7.5 ? 0.62 + 0.25 * smoothstep(0.3, 0.0, abs(fract(bw.x / 3.0) - 0.5)) : wash;
          float dsk = (dtM ? step(0.9, dot(fn.xz, sN)) : step(fh12(vec2(fsd * 7.0, 3.0)), 0.55)) * step(5.0, tF); vec2 d5 = uv0 + pr * 5.0;
          float dk = dsk * step(abs(d5.x), 2.3) * step(d5.y, 1.08); ic = mix(ic, mix(vec3(0.34, 0.24, 0.17), vec3(0.82, 0.78, 0.70), step(0.98, d5.y)), dk); iL = mix(iL, 0.55 + 0.9 * step(0.98, d5.y), dk);
          vec2 c3 = uv0 + pr * 3.6; float cl = step(abs(fract((c3.x - 3.0) / 6.0 + 0.5) - 0.5) * 6.0, 0.32) * step(c3.y, GF - 0.9) * step(3.6, tF);
          ic = mix(ic, vec3(0.70, 0.67, 0.61) * (0.85 + 0.15 * step(0.0, (fract((c3.x - 3.0) / 6.0 + 0.5) - 0.5))), cl); iL = mix(iL, 0.45, cl);
          vec2 p2 = uv0 + pr * 2.4; float pd = smoothstep(0.30, 0.10, length(vec2((fract(p2.x / 3.0) - 0.5) * 3.0, (p2.y - (GF - 1.75)) * 1.6))) * step(2.4, tF);
          float cord = step(abs((fract(p2.x / 3.0) - 0.5) * 3.0), 0.012) * step(GF - 1.75, p2.y); ic = mix(ic, vec3(0.2), cord); ic = mix(ic, vec3(1.0, 0.93, 0.78), pd); iL = mix(iL, 2.4, pd);
          room = ic; }
        vec3 c = mix(mix(frmC, gran, pl * (1.0 - dr)), fasC, fas); c = mix(c, lime, pier * (1.0 - pl)); c = mix(c, vec3(0.78, 0.76, 0.72), bar); c = mix(c, vec3(0.12), dfr); c = mix(c, room, gl);
        diffuseColor.rgb = c; fGlass = gl * 0.5; fLit = (0.62 + 0.38 * step(GF - 1.35, fy) + 0.25 * dr) * (0.8 + 0.2 * fh12(vec2(floor(lu / 6.0), fsd))) * 1.45 * mix(1.0, iL, gl); // lighter tint by day so the lit lobby reads through; fLit scaled so the night glow stays
        dtCov = 0.6 * step(0.55, fy) * step(fy, GF - 0.9); } }
    else if (fk > 18.5 && fk < 19.5) { // signal head: housing = instance colour, three lenses on the face the seed points at (seed = (lit + angle / 2pi) / 4, lit 0 red 1 amber 2 green)
      float lt = floor(fsd * 4.0); float th = fract(fsd * 4.0) * 6.2831853; vec2 dv = vec2(cos(th), sin(th));
      if (lt > 2.5) { // a_signals: pedestrian head, two cells (hand above, walking figure below), fraction = (quarter + state / 4 + 0.04) / 4
        float pg = fract(fsd * 4.0) * 4.0; float pq = floor(pg); float pst = floor(fract(pg) * 4.0); th = pq * 1.5707963; dv = vec2(cos(th), sin(th));
        if (dot(fn.xz, dv) > 0.7) { float cell = vIH * 0.5; float k = step(cell, fy); vec2 q = vec2(lu, fy - (k + 0.5) * cell) / cell; // q in cell units, -0.5..0.5
          float frame = step(0.40, max(abs(q.x * 1.36), abs(q.y))); float vis = step(0.30, q.y) * step(abs(q.x), 0.36) * (1.0 - step(0.47, q.y));
          float sym; vec3 lc; float on;
          if (k > 0.5) { // raised hand (orange): palm + four fingers + thumb
            vec2 h = q * 0.6; float palm = step(abs(h.x), 0.13) * step(-0.20, h.y) * step(h.y, 0.04);
            float fg = 0.0; for (int i = 0; i < 4; i++) { float fx = -0.105 + float(i) * 0.07; float ft2 = 0.20 + 0.04 * (1.0 - abs(float(i) - 1.5) / 1.5); fg = max(fg, step(abs(h.x - fx), 0.026) * step(0.0, h.y) * step(h.y, ft2)); }
            float th2 = step(fsgD(h, vec2(-0.13, -0.08), vec2(-0.22, 0.04)), 0.032);
            sym = max(max(palm, fg), th2); lc = vec3(1.0, 0.46, 0.08); on = step(pst, 0.5); }
          else { // walking figure (white): head, torso, arms, legs mid-stride
            vec2 w = q * 0.6; float hd = step(length(w - vec2(0.03, 0.24)), 0.055);
            float bd = min(fsgD(w, vec2(0.02, 0.15), vec2(-0.01, -0.04)), min(fsgD(w, vec2(-0.01, -0.04), vec2(-0.11, -0.24)), fsgD(w, vec2(-0.01, -0.04), vec2(0.09, -0.24))));
            bd = min(bd, min(fsgD(w, vec2(0.02, 0.12), vec2(-0.09, 0.0)), fsgD(w, vec2(0.02, 0.12), vec2(0.11, 0.03))));
            sym = max(hd, step(bd, 0.036)); lc = vec3(0.95, 0.96, 0.92); on = step(0.5, pst) * step(pst, 1.5); }
          sym *= 1.0 - frame; diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, mix(lc * 0.07, lc, on), sym); diffuseColor.rgb *= 1.0 - 0.5 * vis; fEm = sym * on * 1.25; } }
      else if (dot(fn.xz, dv) > 0.7) { float cell = vIH / 3.0; float k = floor(fy / cell); vec2 q = vec2(lu, fy - (k + 0.5) * cell); float rr = length(q);
        vec3 lc = k > 1.5 ? vec3(0.95, 0.10, 0.06) : k > 0.5 ? vec3(1.0, 0.62, 0.05) : vec3(0.10, 0.95, 0.55); float on = step(abs(k - (2.0 - lt)), 0.1);
        float lens = step(rr, cell * 0.36); float vis = step(cell * 0.36, rr) * step(rr, cell * 0.44) * step(0.0, q.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(lc * 0.12, lc, on), lens); diffuseColor.rgb *= 1.0 - 0.6 * vis; fEm = lens * on * 1.4; } }
    else if (fk > 19.5 && fk < 20.5) { // lobby vestibule: glass box, revolving door (drum + wings) in the middle of the street face, swing doors each side
      float th = fsd * 6.2831853; vec2 dv = vec2(cos(th), sin(th)); float fr = dot(fn.xz, dv); // seed = street-side normal angle / 2pi
      float ax = abs(lu); float top = step(vIH - 0.42, fy); float m = fract(lu / 1.1 + 0.5); float mul = 1.0 - step(0.03, m) * step(m, 0.97);
      float g = (1.0 - top) * step(0.06, fy); vec3 c = vec3(0.17, 0.16, 0.15);
      if (fr > 0.7) { float drum = step(ax, 1.15); float post = drum * step(ax, 0.035); float wing = drum * step(abs(ax - 0.6), 0.025) * step(fy, 2.3);
        float sw = (1.0 - drum) * step(ax, 2.1) * (step(abs(ax - 1.18), 0.05) + step(abs(fy - 1.0), 0.025) * step(abs(ax - 1.6), 0.25)); mul *= 1.0 - drum;
        g *= (1.0 - post) * (1.0 - wing) * (1.0 - sw) * (1.0 - mul); c = mix(c, vec3(0.62, 0.58, 0.50), drum * step(abs(fy - 2.36), 0.05)); }
      else g *= 1.0 - mul;
      c = mix(c, vec3(0.56, 0.53, 0.48) * (1.0 - 0.3 * step(abs(fy - (vIH - 0.2)), 0.02)), top);
      c = mix(c, mix(vec3(0.50, 0.46, 0.40), vec3(0.78, 0.73, 0.64), smoothstep(0.3, 2.4, fy)), g); diffuseColor.rgb = c; fGlass = g * 0.5; fLit = g * (0.8 + 0.5 * smoothstep(0.4, 2.6, fy)); dtCov = 0.6; } // a_downtown2: vestibule lit from above (was a flat 1.4 glow)
  }
  if (fk > 16.5 && fk < 17.5 && fn.y < -0.5) { diffuseColor.rgb = vec3(0.95, 0.93, 0.86); fEm = 1.6; } // a_strip: lot-light lens
  { // footprint anti-aliasing: past ~0.5 m per pixel the window grid becomes its average coverage (aerials sparkled white/black)
    float fAA = smoothstep(0.3, 1.1, length(fwidth(vFW))) * step(fn.y, 0.5) * step(-0.5, fn.y);
    float cov = fk < 0.5 ? 0.13 : fStrip > 1.5 ? 0.0 : fStrip > 0.5 ? step(0.45, fy) * step(fy, 3.0) * 0.9 : fk < 1.5 ? step(0.35, fy) * step(fy, 3.3) * 0.92 : fk < 2.5 ? step(vIH - 2.1, fy) * step(fy, vIH - 1.3) * 0.5 : fk < 3.5 ? 0.3 * step(0.6, fy) : fk < 4.5 ? 0.58 : 0.0;
    if (dtCov >= 0.0) cov = dtCov; // a_downtown
    fGlass = mix(fGlass, cov, fAA); fLit = mix(fLit, 0.12, fAA); }
  vec3 fglassC = mix(vec3(0.07, 0.10, 0.13), vec3(0.14, 0.18, 0.22), fh12(vec2(fsd, fk)));
  diffuseColor.rgb = mix(diffuseColor.rgb, fglassC, fGlass);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.12, fGlass); if (fk > 5.5 && fk < 6.5) roughnessFactor = 1.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += fLit * fGlass * uNight * ' + (OLD_ASHOP ? 'vec3(1.0, 0.72, 0.42)' : 'fLC') + ' * 1.6 + fEm * uNight * diffuseColor.rgb * 1.1;');
  });
  // b_envprog: roof / tree / flat differed only in one colour line -> one program, branch picked by uniform uFS (?oldenvmat: 3 programs)
  const fabSmall = (kind) => (s) => { s.uniforms.uFS = { value: kind };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + IVERT);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFS; varying vec3 vFW; varying vec3 vIB; varying float vIH;' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (uFS < 0.5) { float rows = fract((vFW.y - vIB.y) * 3.2); diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 0.25, rows); diffuseColor.rgb *= 0.88 + 0.2 * fnoise(vFW.xz * 0.9 + vIB.xz); }
  else if (uFS < 1.5) { float n = fnoise(vFW.xz * 1.3 + vFW.y * 1.1) * 0.6 + fnoise(vFW.xy * 3.1 + vFW.zz) * 0.4; diffuseColor.rgb *= 0.62 + 0.62 * n; diffuseColor.rgb *= 0.8 + 0.35 * clamp((vFW.y - vIB.y) / 4.0, 0.0, 1.0); }
  else { diffuseColor.rgb *= 0.86 + 0.2 * fnoise(vFW.xz * 0.8) ; }`); };
  const roof = !OLDENV ? prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'fabS', fabSmall(0)) :
  prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'fabRoof', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + IVERT);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float rows = fract((vFW.y - vIB.y) * 3.2); vec3 rc = diffuseColor.rgb; float warm = step(0.25, rc.r - rc.b), light = step(0.78, rc.r) * (1.0 - warm);
    diffuseColor.rgb *= mix(0.86 + 0.14 * smoothstep(0.0, 0.25, rows), 1.0, light * 0.7); diffuseColor.rgb *= 0.88 + 0.2 * fnoise(vFW.xz * 0.9 + vIB.xz);
    // a_houses: close range tile by roof colour: barrel (terracotta), staggered flat tile (grey / brown), standing seam (light metal)
    float rNr = 1.0 - smoothstep(0.03, 0.11, length(fwidth(vFW)));
    if (rNr > 0.0) { vec3 rn = cross(dFdx(vFW), dFdy(vFW)); vec2 rt = normalize(vec2(-rn.z, rn.x) + vec2(1e-6, 0.0)); float ru = dot(vFW.xz, rt); float row = floor((vFW.y - vIB.y) * 3.2); float k = 1.0;
      if (warm > 0.5) { float b = sin(ru * 24.166 + row * 3.1416); k = (0.9 + 0.2 * b * b) * (0.9 + 0.2 * fh12(vec2(floor(ru / 0.26 + 0.5 * row), row) + vIB.xz)); }
      else if (light > 0.5) { float sm = fract(ru / 0.45); k = 1.0 - 0.18 * (1.0 - step(0.025, sm)) + 0.08 * step(0.025, sm) * step(sm, 0.06); }
      else { float j = fract(ru / 0.33 + 0.5 * mod(row, 2.0)); k = (1.0 - 0.25 * (1.0 - step(0.03, j))) * (0.94 + 0.12 * fh12(vec2(floor(ru / 0.33 + 0.5 * mod(row, 2.0)), row) + vIB.xz)); }
      diffuseColor.rgb *= mix(1.0, k, rNr); } }`);
  });
  const tree = !OLDENV ? prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), 'fabS', fabSmall(1)) :
  prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), 'fabTree', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + IVERT);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float n = fnoise(vFW.xz * 1.3 + vFW.y * 1.1) * 0.6 + fnoise(vFW.xy * 3.1 + vFW.zz) * 0.4; diffuseColor.rgb *= 0.62 + 0.62 * n; diffuseColor.rgb *= 0.8 + 0.35 * clamp((vFW.y - vIB.y) / 4.0, 0.0, 1.0); }`);
  });
  const palm = prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 'fabPalm');
  const trunk = prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), 'fabTrunk');
  const car = prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.4 }), 'fabCar');
  const flat = !OLDENV ? prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), 'fabS', fabSmall(2)) :
  prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), 'fabFlat', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + IVERT);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vIB; varying float vIH;' + HASH).replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 0.86 + 0.2 * fnoise(vFW.xz * 0.8) ;');
  });
  const pool = prep(new THREE.MeshStandardMaterial({ color: 0x2aa9bd, roughness: 0.06, metalness: 0.0, emissive: 0x0a3a44, emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }), 'pool');
  // striped lots: uv = metres (a along, b across), aP.x = mode
  const asph = M.road && M.road.map;
  const lot = prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), 'fabLot', (s) => {
    s.uniforms.tAs = { value: asph };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aP; varying vec4 vP; varying vec2 vLU; varying vec3 vFW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvP = aP; vLU = uv; vFW = (modelMatrix * vec4(position, 1.0)).xyz;');
    s.uniforms.uLzA = { value: LOTZ.a }; s.uniforms.uLzB = { value: LOTZ.b };
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tAs; uniform vec4 uLzA[28]; uniform vec4 uLzB[28]; varying vec4 vP; varying vec2 vLU; varying vec3 vFW;' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float mode = floor(vP.x + 0.5); vec3 as = texture2D(tAs, vFW.xz / 3.5).rgb; float n = fnoise(vFW.xz * 0.15) * 0.6 + fnoise(vFW.xz * 1.1) * 0.4;
    vec3 c = as * (0.82 + 0.3 * n);
    if (mode < 0.5) { float m = mod(vLU.y, 18.0); float inSt = step(0.6, m) * step(m, 5.9) + step(12.4, m) * step(m, 17.8);
      float ln = step(abs(fract(vLU.x / 2.7) - 0.5), 0.022 * 2.7 / 2.7 * 1.0) ; float lnX = (1.0 - step(0.06, abs(fract(vLU.x / 2.7)))) ;
      float line = inSt * (1.0 - step(0.045, abs(fract(vLU.x / 2.7 + 0.5) - 0.5))) + (step(abs(m - 5.9), 0.06) + step(abs(m - 12.4), 0.06)) * 0.0;
      c = mix(c, vec3(0.86, 0.86, 0.82), line * 0.85); c *= 1.0 - inSt * 0.06 * fnoise(vFW.xz * 0.7); }
    else if (mode < 1.5) { c = vec3(0.66, 0.65, 0.62) * (0.84 + 0.25 * n); vec2 g = abs(fract(vFW.xz / 6.0) - 0.5); c *= 1.0 - 0.18 * step(0.48, max(g.x, g.y)); }
    else if (mode < 2.5) { c = as * (0.78 + 0.28 * n); }
    else if (mode < 3.5) { // sports field: mown stripes + white lines (outline, half line, centre circle)
      vec2 q = vLU; vec2 sz = vec2(105.0, 68.0); c = vec3(0.30, 0.46, 0.18) * (0.9 + 0.12 * step(0.5, fract(q.x / 10.0))) * (0.9 + 0.15 * n);
      float ln = 0.0; ln += step(min(min(q.x, sz.x - q.x), min(q.y, sz.y - q.y)), 0.18) * step(0.0, q.x) ; ln += step(abs(q.x - 52.5), 0.09);
      ln += step(abs(length(q - sz * 0.5) - 9.15), 0.09); ln += step(abs(q.x - 16.5), 0.09) * step(abs(q.y - 34.0), 20.2) + step(abs(q.x - 88.5), 0.09) * step(abs(q.y - 34.0), 20.2);
      ln += step(abs(abs(q.y - 34.0) - 20.15), 0.09) * (step(q.x, 16.5) + step(88.5, q.x));
      c = mix(c, vec3(0.9), clamp(ln, 0.0, 1.0) * 0.9); }
    else { c = vec3(0.78, 0.76, 0.72) * (0.85 + 0.2 * n); }
    for (int i = 0; i < 28; i++) { vec4 zA = uLzA[i], zB = uLzB[i]; if (zB.z < 0.5) break; vec2 d = vFW.xz - zA.xy; float la = d.x * zA.z - d.y * zA.w, lw = d.x * zA.w + d.y * zA.z; // a_strip zones (strip.js)
      if (abs(la) < zB.x && abs(lw) < zB.y) {
        if (zB.z < 1.5) { c = vec3(0.70, 0.69, 0.66) * (0.86 + 0.2 * n); vec2 g = abs(fract(vec2(la, lw) / 4.5) - 0.5); c *= 1.0 - 0.2 * step(0.485, max(g.x, g.y)); // filling-station apron: concrete slabs, oil stains, kerb band
          c *= 1.0 - 0.22 * smoothstep(0.62, 0.85, fnoise(vFW.xz * 0.55)) * step(abs(lw), 6.0); c = mix(c, vec3(0.62, 0.61, 0.58), step(zB.x - 0.3, abs(la)) + step(zB.y - 0.3, abs(lw))); }
        else { c = as * (0.80 + 0.28 * n); float e = step(zB.y - 0.15, abs(lw)) * step(0.5, fract(la / 3.0 + 0.25)) * zB.w + step(zB.y - 0.15, abs(lw)) * (1.0 - zB.w); // drive-through lane: no stalls, edge lines, arrows
          float q = fract(la / 9.0) * 9.0 - 4.5; float ar = step(abs(lw), 0.11) * step(-1.8, q) * step(q, 0.2) + step(0.2, q) * step(q, 1.3) * step(abs(lw), (1.3 - q) * 0.62);
          c = mix(c, vec3(0.90, 0.89, 0.84), clamp(e + ar, 0.0, 1.0) * 0.88); }
        break; } }
    diffuseColor.rgb = c; }`);
  });
  const roadF = M.road.clone(); roadF.onBeforeCompile = M.road.onBeforeCompile; roadF.customProgramCacheKey = M.road.customProgramCacheKey; roadF.polygonOffset = true; roadF.polygonOffsetFactor = -1; roadF.polygonOffsetUnits = -4;
  const walkF = M.sidewalk.clone(); walkF.onBeforeCompile = M.sidewalk.onBeforeCompile; walkF.customProgramCacheKey = M.sidewalk.customProgramCacheKey; walkF.polygonOffset = true; walkF.polygonOffsetFactor = -1; walkF.polygonOffsetUnits = -5;
  // b_envprog: lamp-head glow in the shared environment program (uEK = 2); ?oldenvmat keeps the 'fabLamp' patch
  const lampM = !OLDENV ? prep(Object.assign(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.5 }), { userData: { envEK: 2 } }), 'fabLamp') : prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.5 }), 'fabLamp', (s) => {
    s.uniforms.uNight = U.uNight; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += step(0.9, vColor.r) * uNight * vec3(1.0, 0.72, 0.42) * 6.0;'); });
  const glow = prep(new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -10 }), 'fabGlow', (s) => {
    s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position.xz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec2 vLP;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  { float r = length(vLP) * 2.0; diffuseColor.rgb *= uNight * 0.62 * pow(max(0.0, 1.0 - r), 1.4); /* g3: pools read at street level */ }'); });
  if (FAB_GLOW.c) glow.color.setRGB(...FAB_GLOW.c); // a_nightcheck (uniform only: same fabGlow program)
  MATS = { body, roof, tree, palm, trunk, car, lamp: lampM, glow, flat, pool, lot, road: roadF, walk: walkF };
  return MATS;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
function inst(geo, mat, n, fill, extra) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  for (let i = 0; i < n; i++) { const col = fill(i, _m); m.setMatrixAt(i, _m); if (col) m.setColorAt(i, _c.setRGB(col[0], col[1], col[2])); }
  if (extra) for (const k in extra) geo === null || m.geometry.setAttribute(k, extra[k]);
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); m.frustumCulled = true; return m;
}
// a_houses: the house kit draws on the existing fabBody program (same box geometry, same material object -> no new program)
// a_strip: up to 28 oriented zones painted by the lot shader (strip.js fills them before the lot material exists): A = cx, cz, cos, sin; B = hl, hw, kind (1 apron 2 lane, 0 = end), dashed
// a_nightcheck: night tuning of the map-A light pools (?oldanight = values before this pass). FAB_GLOW: fabric street-lamp pool decal
// diameter (m) and linear colour (the fabGlow shader multiplies it by uNight * 0.62 * falloff); the old 24 m 0xffb070 pools overlapped
// into one saturated orange carpet on the dense downtown / arterial grid.
const _QN = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const OLD_ANIGHT = _QN.has('oldanight');
// a_shopnight: storefront night pass (strip-mall tenants open / closed, glass level + colour, walk / canopy light pools); ?oldashop = before
export const OLD_ASHOP = _QN.has('oldashop');
export const FAB_GLOW = OLD_ANIGHT ? { d: 24, c: null } : { d: 17, c: [0.92, 0.57, 0.29] };
export const LOTZ = { a: new Float32Array(28 * 4), b: new Float32Array(28 * 4) };
export function fabKit() { return { box: geos().box, body: MATS && MATS.body, flat: geos().flat, glow: MATS && MATS.glow }; }
// attach: build every chunk's meshes once (resident; tiers toggle visibility), returns triangle counts
export function attachFabric(fab, scene, M) {
  const G = geos(), MT = mats(M); let tris = 0, inst0 = 0;
  for (const c of fab.chunks.values()) {
    const ms = { always: [], bld: [], near: [], mid: [], t1: [], t0: [], night: [] };
    const add = (m, tier, cast) => { if (!m) return; m.castShadow = !!cast; m.receiveShadow = true; m.userData.fab = tier; scene.add(m); ms[tier].push(m); };
    const rg = c.road.geometry('aRd'); if (rg) { add(new THREE.Mesh(rg, MT.road), 'always'); tris += rg.index.count / 3; }
    const wg = c.walk.geometry(); if (wg) { add(new THREE.Mesh(wg, MT.walk), 'always'); tris += wg.index.count / 3; }
    const pg = c.plaza.geometry(); if (pg) { add(new THREE.Mesh(pg, MT.walk), 'always'); tris += pg.index.count / 3; }
    const lg = c.lot.geometry('aP'); if (lg) { add(new THREE.Mesh(lg, MT.lot), 'always'); tris += lg.index.count / 3; }
    const I = c.I;
    if (I.body.length) { const n = I.body.length; const ak = new Float32Array(n * 2); I.body.forEach((b, i) => { ak[i * 2] = b[10] + (b.hs || 0); ak[i * 2 + 1] = b[11]; }); // a_houses: house look in the fraction (0.1..0.4)
      const g = G.box.clone(); g.setAttribute('aK', new THREE.InstancedBufferAttribute(ak, 2));
      add(inst(g, MT.body, n, (i, m) => { const b = I.body[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), b[6]); m.compose(_v.set(b[0], b[1], b[2]), _q, _s.set(b[3], b[4], b[5])); return [b[7], b[8], b[9]]; }), 'bld', true); tris += n * 12; inst0 += n; }
    if (I.roof.length) { add(inst(G.roof, MT.roof, I.roof.length, (i, m) => { const b = I.roof[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), b[6]); m.compose(_v.set(b[0], b[1], b[2]), _q, _s.set(b[3], b[4], b[5])); return [b[7], b[8], b[9]]; }), 'bld', true); tris += I.roof.length * 6; }
    if (I.tree.length) { const n = I.tree.length; const fill = (i, m) => { const t = I.tree[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), t[7]); m.compose(_v.set(t[0], t[3] + t[2] * 0.55, t[1]), _q, _s.set(t[2], t[2] * 0.82, t[2])); return [t[4], t[5], t[6]]; };
      const t0 = inst(G.tree0, MT.tree, n, fill), t1 = new THREE.InstancedMesh(G.tree1, MT.tree, n); t1.instanceMatrix = t0.instanceMatrix; t1.instanceColor = t0.instanceColor; t1.boundingSphere = t0.boundingSphere;
      add(t0, 't0'); add(t1, 't1', true);
      add(inst(G.trunk, MT.trunk, n, (i, m) => { const t = I.tree[i]; m.compose(_v.set(t[0], 0, t[1]), _q.identity(), _s.set(0.75 + t[2] * 0.12, t[3] + t[2] * 0.4, 0.75 + t[2] * 0.12)); return [0.36, 0.30, 0.24]; }), 'near'); tris += n * 20; inst0 += n; }
    if (I.palm.length) { add(inst(G.palm, MT.palm, I.palm.length, (i, m) => { const p = I.palm[i]; _e.set(p[4], p[3], p[5]); _q.setFromEuler(_e); const s = p[2] / 10; m.compose(_v.set(p[0], 0, p[1]), _q, _s.set(s, s, s)); return null; }), 'mid', true); tris += I.palm.length * 38; inst0 += I.palm.length; }
    if (I.car.length) { add(inst(G.car, MT.car, I.car.length, (i, m) => { const p = I.car[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), p[2]); m.compose(_v.set(p[0], 0, p[1]), _q, _s.set(1, 1, 1)); return [p[3], p[4], p[5]]; }), 'mid'); tris += I.car.length * 24; }
    if (I.flat.length) { add(inst(G.flat, MT.flat, I.flat.length, (i, m) => { const p = I.flat[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), p[4]); m.compose(_v.set(p[0], p[8], p[1]), _q, _s.set(p[2], 1, p[3])); return [p[5], p[6], p[7]]; }), 'mid'); }
    if (I.lamp.length) { const n = I.lamp.length; const fillL = (sc, y) => (i, m) => { const p = I.lamp[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), p[2]); m.compose(_v.set(p[0], y, p[1]), _q, _s.set(sc, 1, sc)); return null; };
      add(inst(G.lamp, MT.lamp, n, fillL(1, 0)), 'near', false);
      const gl = inst(G.flat, MT.glow, n, (i, m) => { const p = I.lamp[i]; const ox = Math.cos(p[2]) * 2.1, oz = -Math.sin(p[2]) * 2.1; m.compose(_v.set(p[0] + ox, 0.06, p[1] + oz), _q.identity(), _s.set(FAB_GLOW.d, 1, FAB_GLOW.d)); return null; });
      gl.renderOrder = 2; add(gl, 'night', false); }
    if (I.pool.length) { add(inst(G.flat, MT.pool, I.pool.length, (i, m) => { const p = I.pool[i]; _q.setFromAxisAngle(_v.set(0, 1, 0), p[4]); m.compose(_v.set(p[0], 0.03, p[1]), _q, _s.set(p[2], 1, p[3])); return null; }), 'mid'); }
    c.meshes = ms; c.I = null; c.road = c.walk = c.plaza = c.lot = null;
  }
  fab.tris = tris; fab.instances = inst0; fab.attached = true;
  return { tris, instances: inst0 };
}
// distance tiers (camera xz to chunk centre, minus half the chunk diagonal): buildings 3 km, mid (palms/cars/decals) 1.5 km,
// detailed canopies 700 m (coarse beyond, out to 2.2 km), trunks 500 m; shadows only near
export function updateFabric(fab, cam) {
  if (!fab.attached) return; const R = CH * 0.71;
  for (const c of fab.chunks.values()) { const d = Math.max(0, Math.hypot(cam.x - c.cx, cam.z - c.cz) - R); const ms = c.meshes; const hy = Math.max(0, cam.y - 60) * 0.5; const de = Math.max(0, d - hy);
    for (const m of ms.bld) { m.visible = d < 3200; m.castShadow = d < 500; }
    for (const m of ms.mid) m.visible = de < 1500;
    for (const m of ms.t1) { m.visible = d < 650; m.castShadow = d < 300; }
    for (const m of ms.t0) m.visible = d >= 650 && d < 2400;
    for (const m of ms.near) m.visible = d < 600;
    for (const m of ms.night) { m.visible = U.uNight.value > 0.03 && d < 3200; m.receiveShadow = false; } }
}
// ground under the canals: notch polygons for city.js / region.js (water shows through), and a land query
// a_orphans: inCanal() minus the bridge decks (region groundH only; inCanal itself is unchanged so the tree pass keeps its RNG order)
export function inCanalWater(fab, x, z) { if (!fab.canals) return false; for (const c of fab.canals) { const d = sub(c.B, c.A), L = len2(d); const t = ((x - c.A[0]) * d[0] + (z - c.A[1]) * d[1]) / L; if (t < 0 || t > L) continue; const o = Math.abs((x - c.A[0]) * -d[1] + (z - c.A[1]) * d[0]) / L; if (o < c.hw && !(c.br && c.br.some(([tb, lo, hi]) => t - tb > lo && t - tb < hi))) return true; } return false; }
export function inCanal(fab, x, z) { if (!fab.canals) return false; for (const c of fab.canals) { const d = sub(c.B, c.A), L = len2(d); const t = ((x - c.A[0]) * d[0] + (z - c.A[1]) * d[1]) / L; if (t < 0 || t > L) continue; const o = Math.abs((x - c.A[0]) * -d[1] + (z - c.A[1]) * d[0]) / L; if (o < c.hw) return true; } return false; }
