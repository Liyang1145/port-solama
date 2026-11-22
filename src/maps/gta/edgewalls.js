// a_edgewalls (map 索拉纳港 only): two post-placement fixes, run after every earlier pass (curbfix -> propfix -> parkfix), so the
// curbbake / parkbake tapes keep their inputs (their hashes are taken before this runs) and every layer's free-space checks are
// unchanged.
//  1) back-row lots that back onto an arterial: fabric.js house() puts a hedge on the lot's back line (b ≈ ±0.4, kind 6, no
//     collider) and wallRun() a 2.1 m masonry yard wall on the cell edge (b = 0.6 / Lb - 0.6, kind 7, collider 'bld') -> the two
//     slabs interpenetrate (z-fighting green poking through the wall faces). Rule: the wall stays (continuous along the arterial,
//     taller than every hedge, owns the collider, already cut at the street mouths by curbfix); the hedge loses every stretch
//     whose cross-section touches a wall (0.1 m clear), pieces < 1.5 m are dropped. Colliders: nothing to sync (hedges never had
//     one, the wall boxes are untouched).
//  2) sidewalk clutter with visible geometry and no collider (census, &edgeaudit): fabric street lights and street / lot trees +
//     palms (mainland grid) get trunk boxes in their own fine grid appended to col.query (like a_parkcol's parked cars); the
//     island kerb clutter that never had a box (corner litter bins, promenade bins beside the benches, promenade crossing
//     bollards, seawall bollards) gets fitted oriented boxes, queued by the builders in city.clutAdd and applied here after
//     every layer is placed. Yard trees (front / back yards of the houses) are left alone: not on a sidewalk.
// &noedgewalls switches both off (census "before" in the same build).
import { fileYardBoxes } from './yardcol.js'; // a_yardcol
import { filePoleBoxes, attachPoleCol } from './polecol.js'; // a_polecol
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const EDGE_OFF = Q.has('noedgewalls');
const axes = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
// fabric.js wallRun record: [cx, 0, cz, len, 2.1, 0.35, ang, 0.86, 0.82, 0.74, 7, seed]
export const isYardWall = (b) => b[10] === 7 && b[4] === 2.1 && b[5] === 0.35 && b[7] === 0.86 && b[8] === 0.82 && b[9] === 0.74;
// one pass over the body records: yard walls filed in a 32 m grid with a margin covering any hedge half-length (one lookup per hedge)
function scan(fab) { const C = 32, g = new Map(), hedges = [], hch = []; let n = 0;
  for (const ch of fab.chunks.values()) { if (!ch.I) continue; for (const b of ch.I.body) { const k = b[10]; if (k === 6) { hedges.push(b); hch.push(ch); continue; } if (k !== 7 || !isYardWall(b)) continue; n++; const e = b[3] / 2 + 14;
    for (let i = Math.floor((b[0] - e) / C); i <= Math.floor((b[0] + e) / C); i++) for (let j = Math.floor((b[2] - e) / C); j <= Math.floor((b[2] + e) / C); j++) { const key = i * 65536 + j; let l = g.get(key); if (!l) g.set(key, l = []); l.push(b); } } }
  return { n, hedges, hch, near: (x, z) => g.get(Math.floor(x / C) * 65536 + Math.floor(z / C)) || [] }; }
// per hedge: the stretches of its length that touch a wall (intervals on its own axis)
function obbHit(a, b, pad) { const A = axes(a[6]), B = axes(b[6]); const ha = [a[3] / 2, a[5] / 2], hb = [b[3] / 2, b[5] / 2]; const dx = b[0] - a[0], dz = b[2] - a[2];
  for (const n of [A[0], A[1], B[0], B[1]]) { const pa = ha[0] * Math.abs(n[0] * A[0][0] + n[1] * A[0][1]) + ha[1] * Math.abs(n[0] * A[1][0] + n[1] * A[1][1]), pb = hb[0] * Math.abs(n[0] * B[0][0] + n[1] * B[0][1]) + hb[1] * Math.abs(n[0] * B[1][0] + n[1] * B[1][1]);
    if (Math.abs(dx * n[0] + dz * n[1]) > pa + pb + pad) return false; } return true; }
function hedgeCover(WG, h) { let cand = null; // walls whose box comes within 0.1 m (SAT)
  for (const w of WG.near(h[0], h[2])) if (Math.abs(w[0] - h[0]) < (w[3] + h[3]) / 2 + 1 && Math.abs(w[2] - h[2]) < (w[3] + h[3]) / 2 + 1 && obbHit(h, w, 0.1)) (cand = cand || []).push(w);
  if (!cand) return null; const [u] = axes(h[6]); const hw = h[3] / 2; const iv = []; // covered stretch = the padded wall rectangle projected on the hedge axis
  for (const w of cand) { const [wu, wv] = axes(w[6]); let lo = Infinity, hi = -Infinity; for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const px = w[0] + wu[0] * sa * (w[3] / 2 + 0.1) + wv[0] * sb * (w[5] / 2 + 0.1), pz = w[2] + wu[1] * sa * (w[3] / 2 + 0.1) + wv[1] * sb * (w[5] / 2 + 0.1);
      const x = (px - h[0]) * u[0] + (pz - h[2]) * u[1]; if (x < lo) lo = x; if (x > hi) hi = x; }
    lo = Math.max(lo, -hw); hi = Math.min(hi, hw); if (hi > lo) iv.push([lo, hi]); }
  return iv.length ? iv : null; }

// census only (also in the &edgeaudit post check): hedge / wall pairs whose footprints overlap (SAT), hedges within 0.3 m of a wall
export function auditEdgeWalls(fab) { const WG = scan(fab); const R = { walls: WG.n, hedges: 0, hedgesOnWall: 0, coveredM: 0, pts: [] };
  { for (const h of WG.hedges) { R.hedges++; const m = hedgeCover(WG, h); if (!m) continue;
    R.hedgesOnWall++; for (const [a, c] of m) R.coveredM += c - a; if (R.pts.length < 400) R.pts.push([+h[0].toFixed(2), +h[2].toFixed(2)]); } }
  R.coveredM = Math.round(R.coveredM); return R; }
export function fixEdgeHedges(fab) { const S = { hedges: 0, onWall: 0, trimmed: 0, dropped: 0, pieces: 0, ms: 0 }; if (EDGE_OFF || !fab || !fab.chunks) return S;
  const T0 = performance.now(); const WG = scan(fab); const touched = new Set();
  for (let i = 0; i < WG.hedges.length; i++) { const h = WG.hedges[i]; S.hedges++; const m = hedgeCover(WG, h); if (!m) continue; S.onWall++; const ch = WG.hch[i]; touched.add(ch);
    const hw = h[3] / 2; const runs = []; let a = -hw; // uncovered stretches, 0.1 m clear of the covered ones, >= 1.5 m kept
    for (const [c0, c1] of m.sort((p, q) => p[0] - q[0])) { const e = c0 - 0.1; if (e - a >= 1.5) runs.push([a, e]); a = Math.max(a, c1 + 0.1); } if (hw - a >= 1.5) runs.push([a, hw]);
    if (!runs.length) { h.gone = true; S.dropped++; continue; }
    const [u] = axes(h[6]); const h0 = h.slice();
    runs.forEach(([a0, c], k) => { const r = k === 0 ? h : h0.slice(); const mid = (a0 + c) / 2; r[0] = h0[0] + u[0] * mid; r[2] = h0[2] + u[1] * mid; r[3] = c - a0; if (k) ch.I.body.push(r); });
    S.trimmed++; S.pieces += runs.length; }
  if (S.dropped) for (const ch of touched) ch.I.body = ch.I.body.filter((b) => !b.gone);
  S.ms = Math.round(performance.now() - T0); return S; }

// ---- 2a) fabric street lights + non-yard trees / palms: trunk records, collected before the chunks are built (attachFabric frees I)
// yard = Set of tree / palm records the house lots own (fab.lots, read before curbPass releases it)
export function yardTrees(fab) { const s = new Set(); for (const LT of fab.lots || []) { if (LT.ftree) s.add(LT.ftree[1]); if (LT.btree) s.add(LT.btree[1]); } return s; }
// &edgeaudit: also tag each trunk "street" (trunk on a fabric sidewalk quad, or within 1.2 m of one: verge / kerb line) for the census
const triIn = (px, pz, ax, az, bx, bz, cx, cz) => { const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az); return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); };
function walkTest(fab) { const C = 16, g = new Map();
  for (const ch of fab.chunks.values()) { const A = ch.walk; if (!A || !A.p) continue; const P = A.p; for (let v = 0; v + 3 < A.n; v += 4) { const q = []; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 4; k++) { const x = P[(v + k) * 3], z = P[(v + k) * 3 + 2]; q.push(x, z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } q.push(x0, z0, x1, z1);
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const key = i * 65536 + j; let l = g.get(key); if (!l) g.set(key, l = []); l.push(q); } } }
  return (x, z) => { for (const q of g.get(Math.floor(x / C) * 65536 + Math.floor(z / C)) || []) { if (x < q[8] || x > q[10] || z < q[9] || z > q[11]) continue; if (triIn(x, z, q[0], q[1], q[2], q[3], q[4], q[5]) || triIn(x, z, q[0], q[1], q[4], q[5], q[6], q[7])) return true; } return false; }; }
export function collectTrunks(fab, yard, audit) { if ((EDGE_OFF && !audit) || !fab || !fab.chunks) return null; const A = []; // [x, z, half, h, kind 0 lamp 1 tree 2 palm]
  for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue;
    for (const l of I.lamp) A.push(l[0], l[1], 0.12, 8.2, 0);
    for (const t of I.tree) if (!yard || !yard.has(t)) A.push(t[0], t[1], 0.24 * (0.75 + t[2] * 0.12), t[3] + t[2] * 0.4, 1);
    for (const p of I.palm) if (!yard || !yard.has(p)) A.push(p[0], p[1], 0.24 * (p[2] / 10) + 0.02, p[2] * 0.94, 2); }
  const T = new Float32Array(A);
  if (audit) { const onW = walkTest(fab); const st = new Uint8Array(T.length / 5); for (let i = 0, k = 0; i < T.length; i += 5, k++) { const x = T[i], z = T[i + 1]; let w = onW(x, z) ? 2 : 0;
      if (!w) for (let a = 0; a < 8 && !w; a++) if (onW(x + Math.cos(a * 0.785) * 1.2, z + Math.sin(a * 0.785) * 1.2)) w = 1; st[k] = w; }
    fab._trunkAudit = { T, st }; }
  return EDGE_OFF ? null : T; }
const KT = ['flamp', 'ftree', 'fpalm'];
// own 8 m grid, every box filed once in the cell of its centre; a query widens by the largest half size (same shape as a_parkcol)
export function attachStreetColliders(city) { const S = { trunks: 0, clut: 0, byKind: {}, ms: 0 }; const col = city.col; if (EDGE_OFF || !col) return S; const T0 = performance.now();
  for (const c of city.clutAdd || []) { const b = col.addOBB(c.x, c.z, Math.cos(c.ang), -Math.sin(c.ang), c.hl, c.hw, c.h, 'clut'); b.k = c.k; S.clut++; S.byKind[c.k] = (S.byKind[c.k] || 0) + 1; }
  const fab = city.fabric || (city.region && city.region.fabric); const A = fab && fab._trunks; const Y = fab && fab._ycol; // a_yardcol: fitted trunk shapes + yard trees + hedges
  const P = fab && fab._pcol; // a_polecol: fitted pentagon boxes for the fabric street lights
  if (((A && A.length) || Y) && !col._trunks) { const C = 8; const boxes = [];
    // a_yardcol: with Y the street trees / palms come from Y (two fitted boxes each), only the lamps keep their 0.12 m square
    if (A) for (let i = 0; i < A.length; i += 5) { if (Y && A[i + 4] !== 0) continue; if (P && A[i + 4] === 0) continue; const x = A[i], z = A[i + 1], r = A[i + 2]; boxes.push({ minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r, h: A[i + 3], tag: KT[A[i + 4]], o: { cx: x, cz: z, ux: 1, uz: 0, hl: r, hw: r } }); }
    if (Y) fileYardBoxes(Y, (b) => boxes.push(b));
    if (P) filePoleBoxes(P, (b) => boxes.push(b));
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const b of boxes) { if (b.minX < x0) x0 = b.minX; if (b.maxX > x1) x1 = b.maxX; if (b.minZ < z0) z0 = b.minZ; if (b.maxZ > z1) z1 = b.maxZ; }
    const I0 = Math.floor(x0 / C), K0 = Math.floor(z0 / C), NI = Math.floor(x1 / C) - I0 + 1, NK = Math.floor(z1 / C) - K0 + 1; const cells = new Array(NI * NK).fill(null);
    // a_yardcol: every box filed in each cell its AABB touches (hedges are up to ~20 m long); a per-query stamp returns it once
    for (const b of boxes) { b._s = 0; for (let a = Math.floor(b.minX / C) - I0; a <= Math.floor(b.maxX / C) - I0; a++) for (let k = Math.floor(b.minZ / C) - K0; k <= Math.floor(b.maxZ / C) - K0; k++) { const j = a * NK + k; (cells[j] || (cells[j] = [])).push(b); } S.byKind[b.tag] = (S.byKind[b.tag] || 0) + 1; }
    const q0 = col.query; let stamp = 0;
    col.query = function (x, z, r, out = []) { q0.call(this, x, z, r, out); const st = ++stamp; const a0 = Math.max(0, Math.floor((x - r) / C) - I0), a1 = Math.min(NI - 1, Math.floor((x + r) / C) - I0), k0 = Math.max(0, Math.floor((z - r) / C) - K0), k1 = Math.min(NK - 1, Math.floor((z + r) / C) - K0);
      for (let a = a0; a <= a1; a++) for (let k = k0; k <= k1; k++) { const l = cells[a * NK + k]; if (l) for (let j = 0; j < l.length; j++) { const b = l[j]; if (b._s !== st && b.maxX >= x - r && b.minX <= x + r && b.maxZ >= z - r && b.minZ <= z + r) { b._s = st; out.push(b); } } }
      return out; };
    col._trunks = { boxes, cells, C, I0, K0, NI, NK }; S.trunks = boxes.length; if (fab) { fab._trunks = null; fab._ycol = null; fab._pcol = null; } }
  S.pole = attachPoleCol(city); // a_polecol: island / city pole furniture, palms and trees (main grid, swapped in place)
  S.ms = Math.round(performance.now() - T0); return S; }
// queue a fitted oriented box for an island kerb item (applied by attachStreetColliders after every layer is placed)
export function queueClut(city, k, x, z, ang, hl, hw, h) { (city.clutAdd = city.clutAdd || []).push({ k, x, z, ang, hl, hw, h }); }
