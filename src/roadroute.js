// r6.2 police / chase routing for map 索拉纳港 (A): Dijkstra over one road graph that joins the Deco island grid
// (LAYOUT avenues + streets) with the r5 ribbon network (causeway, mainland, 星湾岛 link) from src/maps/gta/mapgeo.js.
// Replaces the old greedy "pick the axis that gets closer" rule, which sent cruisers down dead ends on the mainland and
// had them circle when the player was across a block. Pure JS (no three.js) so Node tests can run it.
import { buildRegionData } from './maps/gta/mapgeo.js';

const GRID = { ns: [50, 170, 290], ew: [-300, -150, 0, 150, 300], x0: -22, zEnd: 372 };
let G = null;
function build() {
  const D = buildRegionData(); const nodes = []; const edges = [];
  const node = (x, z, key) => { for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 4) { if (key) n.keys.push(key); return n; } const n = { id: nodes.length, x, z, keys: key ? [key] : [], adj: [] }; nodes.push(n); return n; };
  const link = (a, b, len, road, sa, sb) => { if (a === b) return; const e = { a, b, len, road, sa, sb }; edges.push(e); a.adj.push(e); b.adj.push(e); };
  // island grid (including Deco north/south/west stubs for precinct, depot, shipyard)
  const gn = {}; for (const x of GRID.ns) for (const z of GRID.ew) gn[x + ',' + z] = node(x, z);
  for (const x of GRID.ns) {
    for (let i = 0; i + 1 < GRID.ew.length; i++) link(gn[x + ',' + GRID.ew[i]], gn[x + ',' + GRID.ew[i + 1]], GRID.ew[i + 1] - GRID.ew[i], null);
    link(node(x, -GRID.zEnd), gn[x + ',' + GRID.ew[0]], GRID.zEnd + GRID.ew[0], null);
    link(gn[x + ',' + GRID.ew[GRID.ew.length - 1]], node(x, GRID.zEnd), GRID.zEnd - GRID.ew[GRID.ew.length - 1], null);
  }
  for (const z of GRID.ew) {
    for (let i = 0; i + 1 < GRID.ns.length; i++) link(gn[GRID.ns[i] + ',' + z], gn[GRID.ns[i + 1] + ',' + z], GRID.ns[i + 1] - GRID.ns[i], null);
    link(node(GRID.x0, z), gn[GRID.ns[0] + ',' + z], GRID.ns[0] - GRID.x0, null);
  }
  // ribbon network: junctions + road ends, pieces as edges (arc lengths kept so waypoints follow the curve)
  const J = {}; for (const j of D.junctions) J[j.id] = node(j.x, j.z, 'j' + j.id);
  const at = (r, s) => r.path.at(Math.max(0, Math.min(r.path.len, s)));
  const sOf = (r, n) => { const q = {}; r.path.nearest(n.x, n.z, q); return q.s; };
  for (const p of D.pieces) {
    const r = p.road;
    const na = typeof p.a === 'number' ? J[p.a] : (() => { const a = at(r, p.s0); return node(a.x, a.z, p.a); })();
    const nb = typeof p.b === 'number' ? J[p.b] : (() => { const b = at(r, p.s1); return node(b.x, b.z, p.b); })();
    const sa = typeof p.a === 'number' ? sOf(r, na) : p.s0, sb = typeof p.b === 'number' ? sOf(r, nb) : p.s1;
    if (na === nb && p.s1 - p.s0 > 20) { // closed ring road (e.g. Pearl Island pring): split into 3 arcs so graph has no parallel edges
      const s1 = p.s0 + (p.s1 - p.s0) / 3, s2 = p.s0 + (p.s1 - p.s0) * 2 / 3;
      const p1 = r.path.at(s1), p2 = r.path.at(s2);
      const n1 = node(p1.x, p1.z, r.id + '_m1'), n2 = node(p2.x, p2.z, r.id + '_m2');
      link(na, n1, s1 - p.s0, r, p.s0, s1); link(n1, n2, s2 - s1, r, s1, s2); link(n2, nb, p.s1 - s2, r, s2, p.s1);
    } else link(na, nb, Math.abs(sb - sa), r, sa, sb);
  }
  return (G = { D, nodes, edges });
}
const near = (x, z) => {
  const g = G || build(); let best = null;
  // grid axes (island + promenade/beach east of Tideline Dr)
  if (x > GRID.x0 - 40 && x < 345 && Math.abs(z) < GRID.zEnd + 40) {
    for (const e of g.edges) { if (e.road) continue; const ax = e.a.x, az = e.a.z, bx = e.b.x, bz = e.b.z; const L = Math.hypot(bx - ax, bz - az); const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
      const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)); if (!best || d < best.d) best = { e, d, f: t }; }
  }
  for (const e of g.edges) { if (!e.road) continue; const b = e.road.path.box; if (x < b[0] - 60 || x > b[2] + 60 || z < b[1] - 60 || z > b[3] + 60) continue;
    const q = {}; e.road.path.nearest(x, z, q);
    const lo = Math.min(e.sa, e.sb), hi = Math.max(e.sa, e.sb);
    let qs = q.s; if (hi > e.road.path.len && qs < lo - 12) qs += e.road.path.len;
    if (qs < lo - 12 || qs > hi + 12) continue;
    const d = q.dist; if (!best || d < best.d - 0.01) best = { e, d, f: (qs - e.sa) / ((e.sb - e.sa) || 1), s: qs }; }
  return best && best.d < 85 ? best : null;
};
// point `ahead` metres from the car's spot on edge e toward node n
function along(e, cur, n, ahead) {
  if (!e.road) {
    const ax = e.a.x, az = e.a.z, bx = e.b.x, bz = e.b.z, vx = bx - ax, vz = bz - az;
    const L2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((cur.x - ax) * vx + (cur.z - az) * vz) / L2));
    const px = ax + vx * t, pz = az + vz * t;
    const dx = n.x - px, dz = n.z - pz, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, ahead / d); return { x: px + dx * k, z: pz + dz * k };
  }
  const sN = n === e.a ? e.sa : e.sb; const s = cur.s; const ds = sN - s; const p = e.road.path.at(s + Math.sign(ds) * Math.min(Math.abs(ds), ahead)); return { x: p.x, z: p.z };
}
/** Next waypoint {x,z} on the shortest road route from (x, z) toward (tx, tz), or null when off the network. */
export function routeWaypoint(x, z, tx, tz, ahead = 35) {
  const g = G || build(); const a = near(x, z), b = near(tx, tz); if (!a || !b) return null;
  if (a.e === b.e) return null; // same road piece: caller drives straight at the target
  const ea = a.e, eb = b.e; const fa = Math.max(0, Math.min(1, a.f));
  const dist = new Map(), prev = new Map(); const open = [];
  const push = (n, d, p) => { if (d < (dist.has(n) ? dist.get(n) : Infinity)) { dist.set(n, d); prev.set(n, p); open.push(n); } };
  push(ea.a, ea.len * fa, null); push(ea.b, ea.len * (1 - fa), null);
  const fb = Math.max(0, Math.min(1, b.f)); const goal = new Map([[eb.a, eb.len * fb], [eb.b, eb.len * (1 - fb)]]);
  let bestEnd = null, bestCost = Infinity; const done = new Set();
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i; const n = open.splice(bi, 1)[0];
    if (done.has(n)) continue; done.add(n); const dn = dist.get(n); if (dn >= bestCost) break;
    if (goal.has(n) && dn + goal.get(n) < bestCost) { bestCost = dn + goal.get(n); bestEnd = n; }
    for (const e of n.adj) { if (e === ea || e === eb) continue; const m = e.a === n ? e.b : e.a; push(m, dn + e.len, n); }
  }
  if (!bestEnd) return null;
  let first = bestEnd; while (prev.get(first)) first = prev.get(first);
  const cur = { x, z, s: a.s };
  const dFirst = Math.hypot(first.x - x, first.z - z);
  if (dFirst > 14) return along(ea, cur, first, ahead);
  // at the junction: aim down the next edge of the route (or at the target's piece)
  let nxt = bestEnd; if (nxt !== first) { let k = bestEnd; while (prev.get(k) && prev.get(k) !== first) k = prev.get(k); nxt = k; }
  const e2 = nxt === first ? eb : first.adj.find((e) => (e.a === first && e.b === nxt) || (e.b === first && e.a === nxt));
  if (!e2) return { x: tx, z: tz };
  if (!e2.road) { const far = nxt === first ? { x: tx, z: tz } : (e2.a === first ? e2.b : e2.a); return along(e2, { x: first.x, z: first.z }, far, ahead); }
  const s0 = e2.a === first ? e2.sa : e2.sb, s1 = nxt === first ? b.s : (e2.a === first ? e2.sb : e2.sa);
  const p = e2.road.path.at(s0 + Math.sign(s1 - s0) * Math.min(Math.abs(s1 - s0), ahead)); return { x: p.x, z: p.z };
}
export const routeGraph = () => G || build();

// sample points along edge e from node/position s0 to s1 (ribbon: follow the curve)
function sampleEdge(e, sFrom, sTo, out) { if (!e.road) return; const n = Math.max(1, Math.ceil(Math.abs(sTo - sFrom) / 20)); for (let i = 1; i < n; i++) { const p = e.road.path.at(sFrom + (sTo - sFrom) * i / n); out.push([p.x, p.z]); } }
/** r6.2 GPS: the whole road route from (x, z) to (tx, tz) as [[x, z], ...] (straight line when off the network). */
export function routePath(x, z, tx, tz) {
  const g = G || build(); const a = near(x, z), b = near(tx, tz);
  if (!a || !b) return [[x, z], [tx, tz]];
  if (a.e === b.e) { const out = [[x, z]]; if (a.e.road) sampleEdge(a.e, a.s, b.s, out); out.push([tx, tz]); return out; }
  const ea = a.e, eb = b.e; const fa = Math.max(0, Math.min(1, a.f)), fb = Math.max(0, Math.min(1, b.f));
  const dist = new Map(), prev = new Map(), open = []; const push = (n, d, p) => { if (d < (dist.has(n) ? dist.get(n) : Infinity)) { dist.set(n, d); prev.set(n, p); open.push(n); } };
  push(ea.a, ea.len * fa, null); push(ea.b, ea.len * (1 - fa), null); const goal = new Map([[eb.a, eb.len * fb], [eb.b, eb.len * (1 - fb)]]);
  let end = null, cost = Infinity; const done = new Set();
  while (open.length) { let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i; const n = open.splice(bi, 1)[0]; if (done.has(n)) continue; done.add(n); const dn = dist.get(n); if (dn >= cost) break;
    if (goal.has(n) && dn + goal.get(n) < cost) { cost = dn + goal.get(n); end = n; } for (const e of n.adj) { if (e === ea || e === eb) continue; push(e.a === n ? e.b : e.a, dn + e.len, n); } }
  if (!end) return [[x, z], [tx, tz]];
  const nodes = []; for (let n = end; n; n = prev.get(n)) nodes.unshift(n);
  const out = [[x, z]]; const sAt = (e, n) => (n === e.a ? e.sa : e.sb);
  if (ea.road) sampleEdge(ea, a.s, sAt(ea, nodes[0]), out);
  for (let i = 0; i < nodes.length; i++) { out.push([nodes[i].x, nodes[i].z]); const n2 = nodes[i + 1]; if (!n2) break; const e = nodes[i].adj.find((q) => (q.a === nodes[i] && q.b === n2) || (q.b === nodes[i] && q.a === n2)); if (e && e.road) sampleEdge(e, sAt(e, nodes[i]), sAt(e, n2), out); }
  if (eb.road) sampleEdge(eb, sAt(eb, end), b.s, out);
  out.push([tx, tz]); return out;
}
