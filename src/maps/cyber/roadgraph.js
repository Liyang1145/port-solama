// v4.4 road graph: polyline roads (src/mapdata.js ROADS + the axis-aligned Deco district streets) -> nodes + edges, split wherever
// roads cross or a road ends on another one. Pure JS (no three.js) so tools/mapgen.cjs draws the same graph the game drives on.
import { catmull } from './mapdata.js';

export const KIND = { ave: { hw: 7, rd: 0, lanes: 2, sw: 4.5 }, cw: { hw: 10.5, rd: 3, lanes: 3, sw: 0 }, res: { hw: 4.5, rd: 2, lanes: 1, sw: 3 }, rur: { hw: 4.2, rd: 2, lanes: 1, sw: 0 } }; // v4.5 rur = rural road through 草原 / 雨林 (no kerb, no sidewalk)

function segX(a, b, c, d) { // segment ab x cd -> [t,u] or null
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1]; const den = r0 * s1 - r1 * s0; if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qz = c[1] - a[1]; const t = (qx * s1 - qz * s0) / den, u = (qx * r1 - qz * r0) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? [t, u] : null;
}
function projSeg(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); const x = a[0] + dx * t, z = a[1] + dz * t; return { t, x, z, d: Math.hypot(p[0] - x, p[1] - z) }; }

export function buildGraph(defs, legacy = []) {
  const roads = [];
  for (const d of defs) {
    let pts = d.smooth ? catmull(d.pts, 8, !!d.closed) : d.pts.map((p) => p.slice());
    if (d.closed) pts.push(pts[0].slice());
    roads.push({ def: d, kind: d.kind, pts, closed: !!d.closed, cuts: [], legacy: false });
  }
  for (const s of legacy) {
    const pts = s.axis === 'z' ? [[s.c, s.a0], [s.c, s.a1]] : [[s.a0, s.c], [s.a1, s.c]];
    roads.push({ def: { id: 'L' + s.axis + s.c, name: s.name || '', kind: 'ave' }, kind: 'ave', pts, closed: false, cuts: [], legacy: true });
  }
  // endpoint snapping (T-junctions): an open end within 6 m of another road is moved onto it
  for (const r of roads) {
    if (r.closed) continue;
    for (const end of [0, r.pts.length - 1]) {
      const p = r.pts[end]; let best = null;
      for (const o of roads) { if (o === r) continue;
        for (let i = 0; i < o.pts.length - 1; i++) { const q = projSeg(p, o.pts[i], o.pts[i + 1]); if (q.d < 6 && (!best || q.d < best.d)) best = { ...q, o, i }; } }
      if (best) { p[0] = best.x; p[1] = best.z; best.o.cuts.push({ i: best.i, t: best.t, x: best.x, z: best.z }); }
      r.cuts.push({ i: end === 0 ? 0 : r.pts.length - 2, t: end === 0 ? 0 : 1, x: p[0], z: p[1] });
    }
  }
  // crossings (grid-bucketed segment pairs)
  const G = 60, grid = new Map(); const key = (x, z) => Math.floor(x / G) + ',' + Math.floor(z / G);
  roads.forEach((r, ri) => { for (let i = 0; i < r.pts.length - 1; i++) { const a = r.pts[i], b = r.pts[i + 1];
    const x0 = Math.floor(Math.min(a[0], b[0]) / G), x1 = Math.floor(Math.max(a[0], b[0]) / G), z0 = Math.floor(Math.min(a[1], b[1]) / G), z1 = Math.floor(Math.max(a[1], b[1]) / G);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([ri, i]); } } });
  const seen = new Set();
  for (const list of grid.values()) for (let m = 0; m < list.length; m++) for (let n = m + 1; n < list.length; n++) {
    const [ra, ia] = list[m], [rb, ib] = list[n]; if (ra === rb && Math.abs(ia - ib) <= 1) continue;
    const k = ra < rb || (ra === rb && ia < ib) ? `${ra}.${ia}|${rb}.${ib}` : `${rb}.${ib}|${ra}.${ia}`; if (seen.has(k)) continue; seen.add(k);
    const A = roads[ra], B = roads[rb]; const h = segX(A.pts[ia], A.pts[ia + 1], B.pts[ib], B.pts[ib + 1]); if (!h) continue;
    const x = A.pts[ia][0] + (A.pts[ia + 1][0] - A.pts[ia][0]) * h[0], z = A.pts[ia][1] + (A.pts[ia + 1][1] - A.pts[ia][1]) * h[0];
    A.cuts.push({ i: ia, t: h[0], x, z }); B.cuts.push({ i: ib, t: h[1], x, z });
  }
  // nodes (merge within 2.5 m)
  const nodes = []; const ngrid = new Map();
  const nodeAt = (x, z) => {
    const gx = Math.floor(x / 10), gz = Math.floor(z / 10);
    for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) { const l = ngrid.get(a + ',' + b); if (l) for (const n of l) if (Math.hypot(n.x - x, n.z - z) < 2.5) return n; }
    const n = { id: nodes.length, x, z, edges: [], legacy: false }; nodes.push(n); const k = gx + ',' + gz; if (!ngrid.has(k)) ngrid.set(k, []); ngrid.get(k).push(n); return n;
  };
  const edges = [];
  for (const r of roads) {
    const cuts = r.cuts.map((c) => ({ ...c, s: c.i + c.t })).sort((a, b) => a.s - b.s);
    const cc = []; for (const c of cuts) if (!cc.length || Math.hypot(c.x - cc[cc.length - 1].x, c.z - cc[cc.length - 1].z) > 3) cc.push(c);
    if (r.closed) { if (!cc.length) cc.push({ i: 0, t: 0, s: 0, x: r.pts[0][0], z: r.pts[0][1] }); }
    // walk the polyline, emitting edges between consecutive cuts
    const P = r.pts; const emit = (pts) => {
      if (pts.length < 2) return; let L = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
      if (L < 2) return; const K = KIND[r.kind];
      const e = { id: edges.length, road: r.def, name: r.def.name, kind: r.kind, hw: K.hw, rd: K.rd, lanes: K.lanes, sw: r.legacy ? 0 : K.sw, legacy: r.legacy, culdesac: !!r.def.culdesac, pts, cum, L };
      e.n0 = nodeAt(pts[0][0], pts[0][1]); e.n1 = nodeAt(pts[pts.length - 1][0], pts[pts.length - 1][1]); e.n0.edges.push(e); e.n1.edges.push(e);
      if (r.legacy) { e.n0.legacy = true; e.n1.legacy = true; e.axis = P[0][0] === P[1][0] ? 'z' : 'x'; }
      edges.push(e);
    };
    const at = (c) => [c.x, c.z];
    const span = (c0, c1) => { const o = [at(c0)]; for (let i = Math.floor(c0.s) + 1; i < c1.s - 1e-6; i++) o.push(P[i].slice()); o.push(at(c1)); return o; };
    if (!r.closed) {
      const all = [{ i: 0, t: 0, s: 0, x: P[0][0], z: P[0][1] }, ...cc, { i: P.length - 2, t: 1, s: P.length - 1, x: P[P.length - 1][0], z: P[P.length - 1][1] }];
      const uq = []; for (const c of all) if (!uq.length || c.s - uq[uq.length - 1].s > 1e-6 && Math.hypot(c.x - uq[uq.length - 1].x, c.z - uq[uq.length - 1].z) > 1) uq.push(c);
      for (let k = 0; k < uq.length - 1; k++) emit(span(uq[k], uq[k + 1]));
    } else {
      const N = P.length - 1; // last == first
      for (let k = 0; k < cc.length; k++) {
        const c0 = cc[k], c1 = k + 1 < cc.length ? cc[k + 1] : { ...cc[0], s: cc[0].s + N };
        const o = [at(c0)]; for (let i = Math.floor(c0.s) + 1; i < c1.s - 1e-6; i++) o.push(P[i % N].slice()); o.push(at(c1)); emit(o);
      }
    }
  }
  for (const n of nodes) {
    n.deg = n.edges.length;
    n.trim = n.deg >= 3 ? Math.max(...n.edges.map((e) => e.hw)) + 2 : 0;
    { const maj = n.edges.filter((e) => e.kind !== 'res' && e.kind !== 'rur').length; n.signal = n.deg >= 3 && (maj >= 3 || (n.deg >= 4 && maj >= 2)); }
    // signal phase frame: legacy = world axes (NS group 0, matches props.js signal heads); others: first avenue's heading
    if (n.legacy) n.rot = 0; else { const e = n.edges.find((q) => q.kind !== 'res' && q.kind !== 'rur') || n.edges[0]; const h = heading(e, n); n.rot = Math.atan2(h[1], h[0]) - Math.PI / 2; }
  }
  for (const e of edges) if (e.road.closed) { e.ring = true; e.n0.ring = true; e.n1.ring = true; }
  for (const n of nodes) if (n.ring) n.signal = false;
  return { nodes, edges, index: buildIndex(edges) };
}

// unit heading of edge e pointing AWAY from node n
export function heading(e, n) {
  const P = e.pts; const away = e.n0 === n && !(e.n1 === n && false);
  const a = away ? P[0] : P[P.length - 1], b = away ? P[Math.min(P.length - 1, 1)] : P[Math.max(0, P.length - 2)];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
}
export function pointAt(e, s, out = {}) {
  s = Math.max(0, Math.min(e.L, s)); const C = e.cum; let lo = 0, hi = C.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m] <= s) lo = m; else hi = m; }
  const a = e.pts[lo], b = e.pts[hi]; const l = C[hi] - C[lo] || 1; const t = (s - C[lo]) / l;
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t; out.tx = (b[0] - a[0]) / l; out.tz = (b[1] - a[1]) / l; return out;
}
export function project(e, x, z) { // -> {s, d}
  let best = { s: 0, d: 1e9 };
  for (let i = 0; i < e.pts.length - 1; i++) { const q = projSeg([x, z], e.pts[i], e.pts[i + 1]); if (q.d < best.d) best = { s: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * q.t, d: q.d }; }
  return best;
}
function buildIndex(edges) {
  const C = 25, map = new Map();
  for (const e of edges) for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i], b = e.pts[i + 1]; const pad = e.hw + e.sw + 1;
    for (let gx = Math.floor((Math.min(a[0], b[0]) - pad) / C); gx <= Math.floor((Math.max(a[0], b[0]) + pad) / C); gx++)
      for (let gz = Math.floor((Math.min(a[1], b[1]) - pad) / C); gz <= Math.floor((Math.max(a[1], b[1]) + pad) / C); gz++) { const k = gx * 100003 + gz; let l = map.get(k); if (!l) map.set(k, l = []); l.push([e, i]); }
  }
  // nearest road surface at (x,z): {e, d, s} with d = distance to the centre line (null when nothing within reach)
  const near = (x, z, legacyToo = true) => {
    const l = map.get(Math.floor(x / C) * 100003 + Math.floor(z / C)); if (!l) return null; let best = null;
    for (const [e, i] of l) { if (!legacyToo && e.legacy) continue; const q = projSeg([x, z], e.pts[i], e.pts[i + 1]); if (q.d < e.hw + e.sw + 1 && (!best || q.d - e.hw < best.d - best.e.hw)) best = { e, d: q.d, s: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * q.t }; }
    return best;
  };
  // wider lookup for routing / traffic attach (includes Deco sidewalks & POIs within maxD metres)
  const nearAny = (x, z, maxD = 80) => {
    const tight = near(x, z, true); if (tight) return tight;
    const gx0 = Math.floor(x / C), gz0 = Math.floor(z / C), R = Math.ceil(maxD / C);
    let best = null;
    for (let r = 0; r <= R; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (r > 0 && Math.abs(dx) < r && Math.abs(dz) < r) continue;
        const l = map.get((gx0 + dx) * 100003 + (gz0 + dz)); if (!l) continue;
        for (const [e, i] of l) {
          const q = projSeg([x, z], e.pts[i], e.pts[i + 1]);
          if (q.d <= maxD && (!best || q.d < best.d)) best = { e, d: q.d, s: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * q.t };
        }
      }
      if (best && best.d <= (r + 0.5) * C) break;
    }
    return best;
  };
  return { near, nearAny };
}
