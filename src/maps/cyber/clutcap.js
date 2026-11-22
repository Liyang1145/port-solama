// r6.4 b_clutter (Hark modelling lane, map 霓港): capture helpers for the sidewalk clutter colliders (see clutter.js).
// ---------------------------------------------------------------- b_clutter ----
// Exact walking-height footprint of one sidewalk item group, read from the triangles it just appended to the parcel World
// (no rng use, geometry unchanged): every new triangle whose height range meets [y0 + 0.12, y0 + 1.75] (puddles / steam /
// flat cartons / canopies / signs overhead drop out) -> its vertices in the frontage frame (a along, d out) -> convex hull ->
// the smallest-area oriented rectangle (facade-aligned when within 3 %). Logged in the parcel frame; clutter.js turns it into
// one thin collider per group when the parcel is streamed in (Stream.onParcel / bldglayer side rows).
export const CLUTTER_LOG = [];
// set around a streamed parcel / corner side row (stream.js buildNear, bldglayer.js buildChunk): m = that frame -> world;
// col / graph by clutter.js. Off (m null) everywhere else (tests, the Deco core).
export const CLUT_CTX = { m: null, col: null, graph: null, off: false, stats: { moved: 0, moveSum: 0, moveMax: 0, hidden: 0, hiddenBy: {}, statLeft: 0 } };
const CLUT_SKIP = new Set(['steam', 'puddle']);
const STATIC_SKIP = new Set(['bld', 'shop', 'trim', 'gap', 'alley', 'clut', 'b']);
const CLUT_KEEP = () => globalThis.__CLUT_KEEP || (typeof location !== 'undefined' && /[?&]clutkeep\b/.test(location.search));
export function clutSnap(W) { const s = new Map(); for (const b of W.buckets.values()) s.set(b, [b.idx.length, b.vc]); return s; }
function hull2(P) { P.sort((p, q) => p[0] - q[0] || p[1] - q[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up); }
// walking-height hull (frontage frame a, d) of the triangles appended since snapshot s; top = highest such triangle
function bandHull(W, s, F, lo, hi) { const o = F.P(0, 0); const pts = []; let top = -1e9; const seen = new Set();
  for (const b of W.buckets.values()) { if (CLUT_SKIP.has(b.mat)) continue; const P = b.p, I = b.idx; for (let t = (s.get(b) || [0])[0]; t + 2 < I.length; t += 3) {
    const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3; const ya = Math.min(P[i0 + 1], P[i1 + 1], P[i2 + 1]), yb = Math.max(P[i0 + 1], P[i1 + 1], P[i2 + 1]);
    if (yb < lo || ya > hi) continue; if (yb > top) top = yb;
    for (const i of [i0, i1, i2]) { const key = Math.round(P[i] * 200) * 100003 + Math.round(P[i + 2] * 200); if (seen.has(key)) continue; seen.add(key);
      const dx = P[i] - o[0], dz = P[i + 2] - o[1]; pts.push([dx * F.dx + dz * F.dz, dx * F.ox + dz * F.oz]); } } }
  return pts.length < 3 ? null : { H: hull2(pts), top }; }
// how far (m) the hull, moved `sh` toward the facade, still overruns: the kerb (road edge + 0.25 m) and kerb furniture standing in
// it (lamp / palm / pole / sign / hydrant … colliders on its kerb side). F is in the lot frame, M = lot -> world.
function overrun(H, F, sh, M, kerb = 0.25) { const e = M.elements; const g = CLUT_CTX.graph, col = CLUT_CTX.col; let road = 0, stat = 0;
  const W2 = (a, d) => { const q = F.P(a, d); return [e[0] * q[0] + e[8] * q[1] + e[12], e[2] * q[0] + e[10] * q[1] + e[14]]; };
  let a0 = 1e9, a1 = -1e9, d0 = 1e9, d1 = -1e9; for (const [a, d] of H) { a0 = Math.min(a0, a); a1 = Math.max(a1, a); d0 = Math.min(d0, d - sh); d1 = Math.max(d1, d - sh);
    if (g) { const [x, z] = W2(a, d - sh); const n = g.index.near(x, z, false); if (n && n.d < n.e.hw + kerb) road = Math.max(road, n.e.hw + kerb - n.d); } }
  if (col && col.query) { const c = W2((a0 + a1) / 2, (d0 + d1) / 2); const cs = [e[0] * F.dx + e[8] * F.dz, e[2] * F.dx + e[10] * F.dz], cn = [e[0] * F.ox + e[8] * F.oz, e[2] * F.ox + e[10] * F.oz]; const w0 = W2(0, 0);
    for (const b of col.query(c[0], c[1], Math.hypot(a1 - a0, d1 - d0) / 2 + 1.5, [])) { if (STATIC_SKIP.has(b.tag) || b.h < 0.5) continue;
      const bx = (b.minX + b.maxX) / 2, bz = (b.minZ + b.maxZ) / 2, r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2; const rx = bx - w0[0], rz = bz - w0[1]; const ba = rx * cs[0] + rz * cs[1], bd = rx * cn[0] + rz * cn[1];
      if (ba + r < a0 - 0.05 || ba - r > a1 + 0.05) continue; if (bd + r < d0 - 0.05 || bd - r > d1 + 0.05) continue; // not touching
      if (bd < (d0 + d1) / 2) continue; // on the facade side: moving in would not help
      stat = Math.max(stat, d1 - (bd - r - 0.08)); } }
  return { road, stat }; }
export function clutGrab(W, s, F, y0, k, nomove = false) {
  const lo = y0 + 0.12, hi = y0 + 1.75; let B = bandHull(W, s, F, lo, hi); if (!B) return null; let H = B.H;
  // b_clutter: kerb overrun / kerb furniture -> move the whole group toward the facade (all the vertices it appended, any height),
  // keeping its back ≥ 0.4 m off the wall; a group still on the road after that is hidden (degenerate triangles) and gets no box
  let sh = 0; const M = CLUT_CTX.m;
  if (M && !nomove && !CLUT_CTX.off) { const dmin = Math.min(...H.map((p) => p[1])); const smax = Math.max(0, dmin - 0.4);
    const kerb = k === 'stall' || k === 'table' ? 1.75 : 0.25; // stalls / terraces leave a 1.5 m walking strip on the kerb side when the sidewalk allows
    for (let it = 0; it < 4; it++) { const ov = overrun(H, F, sh, M, kerb); const need = Math.max(ov.road, ov.stat); if (need < 0.02 || sh >= smax) break; sh = Math.min(smax, sh + need + 0.02); }
    const ov = overrun(H, F, sh, M); const st = CLUT_CTX.stats;
    if (ov.road > 0.1) { for (const b of W.buckets.values()) { const v0 = (s.get(b) || [0, 0])[1]; if (v0 >= b.vc) continue; const P = b.p; for (let i = v0 + 1; i < b.vc; i++) { P[i * 3] = P[v0 * 3]; P[i * 3 + 1] = P[v0 * 3 + 1]; P[i * 3 + 2] = P[v0 * 3 + 2]; } }
      st.hidden++; st.hiddenBy[k] = (st.hiddenBy[k] || 0) + 1; return { hid: 1 }; }
    if (ov.stat > 0.05) st.statLeft++;
    if (sh > 0.005) { const mx = -F.ox * sh, mz = -F.oz * sh; for (const b of W.buckets.values()) { const v0 = (s.get(b) || [0, 0])[1]; const P = b.p; for (let i = v0; i < b.vc; i++) { P[i * 3] += mx; P[i * 3 + 2] += mz; } }
      st.moved++; st.moveSum += sh; st.moveMax = Math.max(st.moveMax, sh); B = bandHull(W, s, F, lo, hi); H = B.H; } else sh = 0; }
  let best = null, zero = null;
  for (let i = -30; i < 30; i++) { const th = i * Math.PI / 120; const c = Math.cos(th), sn = Math.sin(th); let a0 = 1e9, a1 = -1e9, d0 = 1e9, d1 = -1e9;
    for (const [a, d] of H) { const u = a * c + d * sn, v = -a * sn + d * c; if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < d0) d0 = v; if (v > d1) d1 = v; }
    const q = { ar: (a1 - a0) * (d1 - d0), th, a0, a1, d0, d1 }; if (!best || q.ar < best.ar) best = q; if (i === 0) zero = q; }
  const r = zero.ar <= best.ar * 1.03 ? zero : best; const c = Math.cos(r.th), sn = Math.sin(r.th);
  const um = (r.a0 + r.a1) / 2, vm = (r.d0 + r.d1) / 2; const ca = um * c - vm * sn, cd = um * sn + vm * c; const q = F.P(ca, cd);
  const ux = F.dx * c + F.ox * sn, uz = F.dz * c + F.oz * sn;
  let tris = null; if (CLUT_KEEP()) { tris = []; for (const b of W.buckets.values()) { if (CLUT_SKIP.has(b.mat)) continue; const P = b.p, I = b.idx; for (let t = (s.get(b) || [0])[0]; t + 2 < I.length; t += 3) {
    const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3; const ya = Math.min(P[i0 + 1], P[i1 + 1], P[i2 + 1]), yb = Math.max(P[i0 + 1], P[i1 + 1], P[i2 + 1]); if (yb < lo || ya > hi) continue; tris.push(P[i0], P[i0 + 2], P[i1], P[i1 + 2], P[i2], P[i2 + 2]); } } }
  const rec = { k, x: q[0], z: q[1], ux, uz, hl: (r.a1 - r.a0) / 2, hw: (r.d1 - r.d0) / 2, h: Math.min(B.top, hi), y0, sh, dmin: Math.min(...H.map((p) => p[1])), dmax: Math.max(...H.map((p) => p[1])), tris };
  CLUTTER_LOG.push(rec); return rec;
}
