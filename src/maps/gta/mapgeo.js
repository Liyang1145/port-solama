// r5.0 map geometry (pure JS, no three.js): shared by the game (src/region.js, hud.js) and tools/mapgen.cjs.
// Turns the REGION control points of src/mapdata.js into dense road paths, junctions (trimmed carriageways + crossing
// patches), sidewalks, natural coastlines and deterministic building lots. Same input -> same map everywhere.
import { REGION } from './mapdata.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ coastlines ----
// mainland bay shore (x of the seawall as a function of z)
export const shoreX = (z) => -900 + 14 * Math.sin(z * 0.0105 + 0.4) + 8 * Math.sin(z * 0.031 + 1.7);
// barrier island: east beach line offset (0 inside the Deco district so the beachfront is unchanged)
export const beachOff = (z) => smooth(380, 540, Math.abs(z)) * (18 * Math.sin(z * 0.0047) + 10 * Math.sin(z * 0.013 + 1.3) - 6);
export const ISLE = { z0: 372, tip: 1480, core: [-22, 335] };
// west (bay) coast of the natural island ends, x as a function of z (|z| >= 372); tapers into the beach at the tips
export function westCoast(z) {
  const a = Math.abs(z), sg = z > 0 ? 1 : -1;
  const wav = -34 - 22 * Math.sin((a - 372) * 0.0068 + (sg > 0 ? 0 : 2.1)) - 11 * Math.sin(a * 0.023 + sg) + 12 * smooth(372, 330, a);
  const x = -22 + (wav + 22) * smooth(372, 470, a);
  return x + (330 + beachOff(z) - 40 - x) * smooth(1180, ISLE.tip, a);
}
// polygon (x,z) of one natural island end (sg = +1 north, -1 south); the beach mesh covers x > 335 + beachOff
export function islandEndPoly(sg) {
  const P = []; const z0 = ISLE.z0, z1 = ISLE.tip;
  for (let a = z0; a <= z1; a += 8) P.push([westCoast(sg * a), sg * a]);
  for (let a = z1; a >= z0; a -= 8) P.push([335 + beachOff(sg * a), sg * a]);
  return P;
}
export function pearlPoly(n = 72) {
  const { cx, cz, r } = REGION.pearl; const P = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; const rr = r * (1 + 0.035 * Math.sin(t * 3 + 0.5) + 0.02 * Math.sin(t * 5)); P.push([cx + Math.cos(t) * rr, cz + Math.sin(t) * rr]); }
  return P;
}
export function pointInPoly(x, z, P) {
  let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c;
}

// ------------------------------------------------------------------ paths ----
export function catmull(pts, step = 3, closed = false) {
  const out = []; const n = pts.length; const P = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}
export class Path {
  constructor(pts, closed = false) {
    this.closed = closed; if (closed) pts = [...pts, pts[0]];
    const n = pts.length; this.n = n; this.X = new Float64Array(n); this.Z = new Float64Array(n); this.S = new Float64Array(n);
    for (let i = 0; i < n; i++) { this.X[i] = pts[i][0]; this.Z[i] = pts[i][1]; if (i) this.S[i] = this.S[i - 1] + Math.hypot(this.X[i] - this.X[i - 1], this.Z[i] - this.Z[i - 1]); }
    this.len = this.S[n - 1];
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < n; i++) { x0 = Math.min(x0, this.X[i]); x1 = Math.max(x1, this.X[i]); z0 = Math.min(z0, this.Z[i]); z1 = Math.max(z1, this.Z[i]); }
    this.box = [x0, z0, x1, z1];
  }
  wrap(s) { if (this.closed) { s %= this.len; if (s < 0) s += this.len; return s; } return clamp(s, 0, this.len); }
  idx(s) { let lo = 0, hi = this.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.S[m] <= s) lo = m; else hi = m; } return lo; }
  at(s, out = {}) {
    s = this.wrap(s); const i = Math.min(this.idx(s), this.n - 2); const L = this.S[i + 1] - this.S[i] || 1; const t = clamp((s - this.S[i]) / L, 0, 1);
    const dx = this.X[i + 1] - this.X[i], dz = this.Z[i + 1] - this.Z[i]; const dl = Math.hypot(dx, dz) || 1;
    out.x = this.X[i] + dx * t; out.z = this.Z[i] + dz * t; out.tx = dx / dl; out.tz = dz / dl; out.s = s; return out;
  }
  // nearest point: s, dist, signed lateral d (positive on the n = (-tz, tx) side); optional window around s0 (cheap local search)
  nearest(x, z, out = {}, s0 = null, win = 25) {
    let best = 1e18, bi = 0, bt = 0;
    let i0 = 0, i1 = this.n - 1;
    if (s0 !== null && !this.closed) { i0 = Math.max(0, this.idx(clamp(s0 - win, 0, this.len)) - 1); i1 = Math.min(this.n - 1, this.idx(clamp(s0 + win, 0, this.len)) + 2); }
    for (let i = i0; i < i1; i++) {
      const ax = this.X[i], az = this.Z[i], dx = this.X[i + 1] - ax, dz = this.Z[i + 1] - az; const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); const px = ax + dx * t - x, pz = az + dz * t - z; const d2 = px * px + pz * pz;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    const dx = this.X[bi + 1] - this.X[bi], dz = this.Z[bi + 1] - this.Z[bi]; const dl = Math.hypot(dx, dz) || 1; const tx = dx / dl, tz = dz / dl;
    const px = this.X[bi] + dx * bt, pz = this.Z[bi] + dz * bt;
    out.s = this.S[bi] + dl * bt; out.dist = Math.sqrt(best); out.d = (x - px) * -tz + (z - pz) * tx; out.tx = tx; out.tz = tz; out.i = bi; return out;
  }
}
function segX(ax, az, bx, bz, cx, cz, dx, dz) {
  const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz; const den = r1x * r2z - r1z * r2x; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den, u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null; return { t, u, x: ax + r1x * t, z: az + r1z * t };
}

// ------------------------------------------------------------------ region build ----
let CACHE = null;
export function buildRegionData() {
  if (CACHE) return CACHE;
  const SW = REGION.sw;
  const roads = REGION.roads.map((r) => {
    let pts, closed = false;
    if (r.ring) { closed = true; pts = []; const N = 96; for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2; pts.push([r.ring.cx + Math.cos(t) * r.ring.r, r.ring.cz + Math.sin(t) * r.ring.r]); } }
    else pts = catmull(r.pts, 3);
    return { ...r, path: new Path(pts, closed), closed, js: [] };
  });
  const byId = Object.fromEntries(roads.map((r) => [r.id, r]));
  // height of the deck along a road (causeway embankment + bridge hump; pearl roads; mainland 0)
  const B = REGION.bridge, DY = REGION.deckY;
  const sunShoreS = (() => { const p = byId.sun.path; for (let s = 0; s < p.len; s += 1) { const q = p.at(s); if (q.x < shoreX(q.z)) return s; } return p.len; })();
  byId.sun.shoreS = sunShoreS;
  for (const r of roads) {
    if (r.id === 'sun') r.h = (s, x) => { if (x === undefined) x = r.path.at(s).x; const hump = B.rise * Math.pow(Math.sin(Math.PI * clamp((x - B.x0) / (B.x1 - B.x0), 0, 1)), 2); return DY * smooth(0, 30, s) * (1 - smooth(sunShoreS - 12, sunShoreS + 22, s)) + hump; };
    else if (r.id === 'plink' || r.id === 'pring') r.h = () => DY;
    else r.h = () => 0;
  }
  // junctions
  const junctions = [];
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    const A = roads[a].path, Bp = roads[b].path;
    if (A.box[0] > Bp.box[2] + 1 || Bp.box[0] > A.box[2] + 1 || A.box[1] > Bp.box[3] + 1 || Bp.box[1] > A.box[3] + 1) continue;
    for (let i = 0; i < A.n - 1; i++) for (let j = 0; j < Bp.n - 1; j++) {
      const h = segX(A.X[i], A.Z[i], A.X[i + 1], A.Z[i + 1], Bp.X[j], Bp.Z[j], Bp.X[j + 1], Bp.Z[j + 1]); if (!h) continue;
      if (junctions.some((J) => Math.hypot(J.x - h.x, J.z - h.z) < 4)) continue;
      const sA = A.S[i] + (A.S[i + 1] - A.S[i]) * h.t, sB = Bp.S[j] + (Bp.S[j + 1] - Bp.S[j]) * h.u;
      const J = { id: junctions.length, x: h.x, z: h.z, roads: [{ r: roads[a], s: sA }, { r: roads[b], s: sB }], y: Math.max(roads[a].h(sA), roads[b].h(sB)) };
      junctions.push(J); roads[a].js.push({ J, s: sA, other: roads[b] }); roads[b].js.push({ J, s: sB, other: roads[a] });
    }
  }
  const nq = {};
  // distance of a point outside another road's band (o lateral offset)
  const trimTo = (R, s0, dir, other, band, offs) => {
    for (let a = 0; a < 60; a += 0.5) {
      let ok = true; const p = R.path.at(s0 + dir * a);
      for (const o of offs) { const x = p.x - p.tz * o, z = p.z + p.tx * o; if (other.path.nearest(x, z, nq).dist < other.hw + band) { ok = false; break; } }
      if (ok) return a;
    }
    return 60;
  };
  // carriageway pieces + sidewalk pieces between junctions
  const pieces = [], walks = [];
  let endId = 0;
  for (const R of roads) {
    R.js.sort((p, q) => p.s - q.s);
    const cuts = []; // {s, node, trimF (forward side), trimB, swF:{l,r}, swB}
    for (const j of R.js) {
      const o = j.other;
      cuts.push({ s: j.s, node: j.J.id, tF: trimTo(R, j.s, 1, o, 0.3, [-R.hw, R.hw]) + 0.4, tB: trimTo(R, j.s, -1, o, 0.3, [-R.hw, R.hw]) + 0.4,
        wF: [trimTo(R, j.s, 1, o, SW, [-R.hw, -R.hw - SW]), trimTo(R, j.s, 1, o, SW, [R.hw, R.hw + SW])],
        wB: [trimTo(R, j.s, -1, o, SW, [-R.hw, -R.hw - SW]), trimTo(R, j.s, -1, o, SW, [R.hw, R.hw + SW])] });
    }
    const L = R.path.len; R.pieces = [];
    const spans = [];
    if (R.closed) { for (let i = 0; i < cuts.length; i++) { const c0 = cuts[i], c1 = cuts[(i + 1) % cuts.length]; spans.push([c0, c1, i === cuts.length - 1 ? L : 0]); } if (!cuts.length) spans.push([null, null, 0]); }
    else { const all = [null, ...cuts, null]; for (let i = 0; i < all.length - 1; i++) spans.push([all[i], all[i + 1], 0]); }
    for (const [c0, c1, wrapAdd] of spans) {
      const s0 = c0 ? c0.s + c0.tF : 0, s1 = c1 ? c1.s + wrapAdd - c1.tB : (R.closed && !c0 ? L : L);
      if (s1 - s0 < 6) continue;
      if ((!c0 || !c1) && !R.closed && s1 - s0 < 14) continue; // stub past the last crossing
      const pc = { id: pieces.length, road: R, s0, s1, a: c0 ? c0.node : 'e' + endId++, b: c1 ? c1.node : 'e' + endId++, kind: R.kind, hw: R.hw };
      pieces.push(pc); R.pieces.push(pc);
      for (const side of [-1, 1]) {
        const k = side < 0 ? 0 : 1;
        const w0 = c0 ? c0.s + c0.wF[k] : 0, w1 = c1 ? c1.s + wrapAdd - c1.wB[k] : L;
        if (w1 - w0 > 4) walks.push({ road: R, side, s0: w0, s1: w1, piece: pc });
      }
    }
  }
  // junction patches: convex hull of the trimmed carriageway end edges around each crossing
  for (const J of junctions) {
    const P = [];
    for (const pc of pieces) for (const [node, s] of [[pc.a, pc.s0], [pc.b, pc.s1]]) if (node === J.id) { const q = pc.road.path.at(s); P.push([q.x - q.tz * pc.hw, q.z + q.tx * pc.hw], [q.x + q.tz * pc.hw, q.z - q.tx * pc.hw]); }
    J.patch = hull(P); J.pieces = pieces.filter((pc) => pc.a === J.id || pc.b === J.id);
  }
  // --------------------------------------------------------------- lots ----
  const rnd = mulberry(5050);
  const R = (a, b) => a + (b - a) * rnd();
  const lots = [];
  const nearRoads = (x, z) => { let m = 1e9; for (const r of roads) { if (x < r.path.box[0] - 60 || x > r.path.box[2] + 60 || z < r.path.box[1] - 60 || z > r.path.box[3] + 60) continue; m = Math.min(m, r.path.nearest(x, z, nq).dist - r.hw - SW); } return m; };
  const obbOverlap = (A, Bb) => {
    const ax = [[A.ux, A.uz], [-A.uz, A.ux], [Bb.ux, Bb.uz], [-Bb.uz, Bb.ux]];
    for (const [nx, nz] of ax) {
      const pr = (O) => Math.abs(O.ux * nx + O.uz * nz) * O.hl + Math.abs(-O.uz * nx + O.ux * nz) * O.hw;
      if (Math.abs((A.cx - Bb.cx) * nx + (A.cz - Bb.cz) * nz) > pr(A) + pr(Bb) + 0.6) return false;
    }
    return true;
  };
  const corners = (L) => { const c = []; for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.push([L.cx + L.ux * L.hl * a - L.uz * L.hw * b, L.cz + L.uz * L.hl * a + L.ux * L.hw * b]); return c; };
  const pearl = REGION.pearl;
  const zone = (x, z) => {
    if (Math.hypot(x - pearl.cx, z - pearl.cz) < pearl.r + 10) return 'mansion';
    if (z > 236 && x > -1240) return 'mural';
    if (x > -1015) return 'condo';
    return 'latin';
  };
  // reserved: store C building on 第八街 (axis-aligned, facade at x = -1061.5)
  { const st = { cx: -1070.5, cz: -40, ux: 0, uz: 1, hl: 9, hw: 9, zone: 'latin', floors: 2, reserved: 'storeC', id: 9999, store: true, face: [1, 0], side: 1, road: 'eighth', seed: 0.5, empty: false, mural: true }; lots.push(st); }
  const okLot = (L, zn) => {
    for (const [x, z] of [...corners(L), [L.cx, L.cz]]) {
      if (zn === 'mansion') { const dc = Math.hypot(x - pearl.cx, z - pearl.cz); if (dc > pearl.r - 4) return false; }
      else { if (x > shoreX(z) - 14) return false; if (x < -1372 || Math.abs(z) > 470) return false; }
      if (nearRoads(x, z) < 0.6) return false;
    }
    for (const o of lots) if (Math.abs(o.cx - L.cx) < 60 && Math.abs(o.cz - L.cz) < 60 && obbOverlap(o, L)) return false;
    return true;
  };
  for (const r of roads) {
    if (r.id === 'sun') { /* only the mainland part fronts lots */ }
    for (const pc of r.pieces) for (const side of [-1, 1]) {
      let s = pc.s0 + 4;
      while (s < pc.s1 - 4) {
        const q = r.path.at(s + 6); const zn = zone(q.x - q.tz * side * 20, q.z + q.tx * side * 20);
        if (r.id === 'sun' && q.x > shoreX(q.z) - 10) { s += 6; continue; }
        if (r.id === 'plink') break;
        if (r.id === 'shore' && side === (Math.sign(-q.tz) || 1)) break; // bay side of 湾岸大道 stays a waterfront park
        if (r.id === 'pring' && side > 0) break; // only the outer side of the ring (toward the water) has villas; inside is the park
        const w = zn === 'mural' ? R(22, 40) : zn === 'condo' ? R(18, 30) : zn === 'mansion' ? R(20, 26) : R(8, 18);
        const dep = zn === 'mural' ? R(18, 28) : zn === 'condo' ? R(16, 24) : zn === 'mansion' ? R(13, 16) : R(11, 20);
        const m = r.path.at(s + w / 2); const off = r.hw + SW + (zn === 'mansion' ? 5 : 0.8) + dep / 2;
        const L = { cx: m.x - m.tz * side * off, cz: m.z + m.tx * side * off, ux: m.tx, uz: m.tz, hl: w / 2, hw: dep / 2, zone: zn, side, face: [-(-m.tz * side), -(m.tx * side)], road: r.id };
        if (okLot(L, zn)) {
          L.id = lots.length; L.seed = rnd();
          L.floors = zn === 'condo' ? Math.floor(R(5, 13)) : zn === 'mural' ? 1 : zn === 'mansion' ? 2 : (rnd() < 0.55 ? 1 : rnd() < 0.7 ? 2 : 3);
          L.empty = zn !== 'mansion' && zn !== 'condo' && rnd() < 0.08; // small parking lot / garden
          L.mural = zn === 'mural' || (zn === 'latin' && rnd() < 0.3);
          lots.push(L); s += w + (zn === 'mansion' ? R(8, 14) : R(0.4, 3.5));
        } else s += 2.5;
      }
    }
  }
  for (const L of lots) { L.corners = corners(L); L.chunk = Math.floor(L.cx / 128) + ',' + Math.floor(L.cz / 128); }
  CACHE = { roads, byId, junctions, pieces, walks, lots, sunShoreS, nearRoads };
  return CACHE;
}
export function hull(P) {
  const pts = P.map((p) => p.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// district name for the HUD (r5 areas; returns null inside the original Deco district)
export function districtAt(x, z) {
  const D = Object.fromEntries(REGION.districts.map((d) => [d.id, d]));
  const p = REGION.pearl;
  if (Math.hypot(x - p.cx, z - p.cz) < p.r + 6) return D.pearl;
  if (x < shoreX(z) + 2) { if (z > 236 && x > -1240) return D.mural; if (x > -1015) return D.bayside; return D.cane; }
  if (x < -40 && x > -900 && Math.abs(z) < 120) return D.causeway;
  if (z > 372) return z < 600 ? D.dunes : D.north;
  if (z < -372) return z > -600 ? D.mangrove : D.south;
  return null;
}
