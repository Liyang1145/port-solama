// r6.0 map query API for map 霓港 (same signatures as src/maps/gta/mapapi.js; select through src/mapapi.js).
// Pure JS, no three.js. Roads = the v4.4 road graph (mapdata ROADS + the Deco grid streets), districts = mapdata DISTRICTS.
import { POI, MISSION_STARTS, ROADS, landAt, districtAt as _districtAt, beachX, BEACH_Z, DECO_CORE } from './mapdata.js';
import { buildGraph, pointAt, project } from './roadgraph.js';
import { cyName } from './names.js';

const GRID = { ns: [50, 170, 290], ew: [-300, -150, 0, 150, 300], hw: 7, x0: -22, x1: 290, z0: -372, z1: 372 };
const NS_NAME = { 50: '霓影大道', 170: '电路大街', 290: '脉冲大道' };
let _G = null;
function graph() {
  if (_G) return _G;
  const legacy = [...GRID.ns.map((c) => ({ axis: 'z', c, a0: GRID.z0, a1: GRID.z1, name: NS_NAME[c] })), ...GRID.ew.map((c) => ({ axis: 'x', c, a0: GRID.x0, a1: GRID.x1, name: '横街' }))];
  _G = buildGraph(ROADS, legacy); return _G;
}
const nameOf = (e) => (e.def && e.def.name) || e.name || (e.road && e.road.def && e.road.def.name) || '';

export function getPOIs() { return { ...POI, missionStarts: MISSION_STARTS }; }
export function nearestRoad(x, z) {
  const G = graph(); let best = null;
  for (const e of G.edges) { const b = e._box || (e._box = e.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [1e9, 1e9, -1e9, -1e9]));
    if (x < b[0] - 400 || x > b[2] + 400 || z < b[1] - 400 || z > b[3] + 400) continue;
    const q = project(e, x, z); if (!best || q.d - e.hw < best.dist - best.hw) { const p = pointAt(e, q.s); best = { id: e.id, name: nameOf(e), kind: e.legacy ? 'grid' : 'graph', x: p.x, z: p.z, tx: p.tx, tz: p.tz, hw: e.hw, dist: q.d, s: q.s, _e: e }; } }
  if (!best || best.dist > 400) return null;
  best.onRoad = best.dist <= best.hw; const e = best._e; delete best._e; Object.defineProperty(best, 'edge', { value: e, enumerable: false }); return best;
}
export function roadPointAhead(x, z, tx, tz, ahead = 35) {
  const r = nearestRoad(x, z); if (!r) return null; const e = r.edge;
  const pa = pointAt(e, r.s + ahead), pb = pointAt(e, r.s - ahead); const a = { x: pa.x, z: pa.z }, b = { x: pb.x, z: pb.z };
  return Math.hypot(a.x - tx, a.z - tz) < Math.hypot(b.x - tx, b.z - tz) ? a : b;
}
export function districtAt(x, z) {
  const d = _districtAt(x, z, true); if (d) return { id: d.id, name: d.name, sub: '霓港' };
  if (x >= DECO_CORE.x0 && x <= DECO_CORE.x1 + 80 && Math.abs(z) <= DECO_CORE.z1) return { id: 'deco', name: cyName('棕榈岛'), sub: '霓港' };
  return null;
}
export function isOnLand(x, z) {
  if (landAt(x, z)) return true;
  if (z > BEACH_Z[0] && z < BEACH_Z[1] && x >= beachX(z) && x < beachX(z) + 80) return true;
  const n = graph().index.near(x, z); return !!(n && n.d < n.e.hw + 1.5);
}
export function randomRoadPoint(rand = Math.random, nx = null, nz = null, minD = 0, maxD = 1e9) {
  const E = graph().edges.filter((e) => e.L > 20);
  for (let t = 0; t < 80; t++) { const e = E[Math.floor(rand() * E.length)]; const s = 5 + rand() * (e.L - 10); const p = pointAt(e, s); const off = e.kind === 'res' || e.kind === 'rur' ? 2.1 : 1.75;
    const x = p.x - p.tz * off, z = p.z + p.tx * off; if (nx !== null) { const d = Math.hypot(x - nx, z - nz); if (d < minD || d > maxD) continue; }
    return { x, z, yaw: Math.atan2(p.tx, p.tz), road: nameOf(e), id: e.id }; }
  return null;
}
export function roadNetwork() {
  const G = graph(); const idx = new Map(G.nodes.map((n, i) => [n, i]));
  return { roads: G.edges.map((e) => ({ id: e.id, name: nameOf(e), kind: e.kind, hw: e.hw, length: e.L, legacy: !!e.legacy, pts: e.pts })),
    junctions: G.nodes.map((n, i) => ({ id: i, x: n.x, z: n.z, deg: n.deg, signal: !!n.signal, roads: n.edges.map((e) => e.id) })),
    pieces: G.edges.map((e) => ({ road: e.id, s0: 0, s1: e.L, a: idx.get(e.n0), b: idx.get(e.n1) })), grid: GRID };
}
