// r5.0 map query API for the logic layer (game / missions / police / economy). Pure JS, no three.js: works in the browser
// and in Node tests. Owned by the map/rendering side; logic code should read the map ONLY through these functions, so the
// map can be rebuilt without touching gameplay files.
//
//   import { getPOIs, nearestRoad, roadPointAhead, districtAt, isOnLand, randomRoadPoint, roadNetwork } from './mapapi.js';
import { POI, MISSION_STARTS, REGION } from './mapdata.js';
import { NS_NAME, EW_NAME } from './streetnames.js'; // a_streetnames: same table as the signs
import { buildRegionData, districtAt as _districtAt, shoreX, westCoast, beachOff, ISLE } from './mapgeo.js';

// Original Deco-district grid (mirrors LAYOUT in city.js): NS avenues x = 50/170/290, EW streets z = ±300/±150/0, half width 7
const GRID = { ns: [50, 170, 290], ew: [-300, -150, 0, 150, 300], hw: 7, x0: -22, x1: 290, z0: -372, z1: 372 };

/** All points of interest: { gunshop, stores[], clothes, modshop, atms[], hospital, precinct, valet, depot, shipyard, debt,
 *  lighthouse, wheel, restaurants[], missionStarts[] } — the same objects the game uses (do not mutate). */
export function getPOIs() { return { ...POI, missionStarts: MISSION_STARTS }; }

/** Nearest road centreline to (x, z), over the island grid AND the r5 ribbon network.
 *  Returns { name, id, kind ('grid'|'ribbon'), dist (m to centreline), onRoad (inside the carriageway), x, z (closest
 *  centreline point), tx, tz (unit direction along the road), hw (half width) } or null when nothing within 400 m. */
export function nearestRoad(x, z) {
  let best = null;
  const consider = (r) => { if (!best || r.dist - r.hw < best.dist - best.hw) best = r; };
  for (const c of GRID.ns) { const zz = Math.max(GRID.z0, Math.min(GRID.z1, z)); consider({ id: 'ns' + c, name: NS_NAME[c], kind: 'grid', x: c, z: zz, tx: 0, tz: 1, hw: GRID.hw, dist: Math.hypot(x - c, z - zz) }); }
  for (const c of GRID.ew) { const xx = Math.max(GRID.x0, Math.min(GRID.x1, x)); consider({ id: 'ew' + c, name: EW_NAME[c] || '横街', kind: 'grid', x: xx, z: c, tx: 1, tz: 0, hw: GRID.hw, dist: Math.hypot(x - xx, z - c) }); }
  const D = buildRegionData(); const q = {};
  for (const r of D.roads) { const b = r.path.box; if (x < b[0] - 400 || x > b[2] + 400 || z < b[1] - 400 || z > b[3] + 400) continue;
    r.path.nearest(x, z, q); const p = r.path.at(q.s); consider({ id: r.id, name: r.name, kind: 'ribbon', x: p.x, z: p.z, tx: p.tx, tz: p.tz, hw: r.hw, dist: q.dist, s: q.s, deckY: r.h(q.s, p.x) }); }
  if (!best || best.dist > 400) return null;
  best.onRoad = best.dist <= best.hw; return best;
}
/** Point `ahead` metres further along the nearest road from (x, z), in the direction that gets closer to (tx, tz). */
export function roadPointAhead(x, z, tx, tz, ahead = 35) {
  const r = nearestRoad(x, z); if (!r) return null;
  const a = { x: r.x + r.tx * ahead, z: r.z + r.tz * ahead }, b = { x: r.x - r.tx * ahead, z: r.z - r.tz * ahead };
  if (r.kind === 'ribbon') { const R = buildRegionData().byId[r.id]; const pa = R.path.at(r.s + ahead), pb = R.path.at(r.s - ahead); a.x = pa.x; a.z = pa.z; b.x = pb.x; b.z = pb.z; }
  return Math.hypot(a.x - tx, a.z - tz) < Math.hypot(b.x - tx, b.z - tz) ? a : b;
}
/** { id, name, sub } of the r5 district at (x, z), or { id:'deco', name:'棕榈岛', sub:'海潮大道' } inside the original district. */
export function districtAt(x, z) { return _districtAt(x, z) || { id: 'deco', name: '棕榈岛', sub: '海潮大道一带' }; }
/** true on walkable land / decks (approximate, no three.js needed). */
export function isOnLand(x, z) {
  const az = Math.abs(z);
  if (x > -22 && x < 335 + beachOff(z) + 60 && az <= ISLE.z0) return true;
  if (az > ISLE.z0 && az < ISLE.tip && x > westCoast(z) && x < 335 + beachOff(z) + 60) return true;
  if (x < shoreX(z)) return true;
  const p = REGION.pearl; if (Math.hypot(x - p.cx, z - p.cz) < p.r) return true;
  const r = nearestRoad(x, z); return !!(r && r.kind === 'ribbon' && r.dist < r.hw + 1.5);
}
/** A random point on a road lane (ribbon network), optionally within [minD, maxD] of (nx, nz). For spawns / mission targets. */
export function randomRoadPoint(rand = Math.random, nx = null, nz = null, minD = 0, maxD = 1e9) {
  const D = buildRegionData();
  for (let t = 0; t < 60; t++) { const pc = D.pieces[Math.floor(rand() * D.pieces.length)]; if (pc.s1 - pc.s0 < 12) continue;
    const s = pc.s0 + 5 + rand() * (pc.s1 - pc.s0 - 10); const p = pc.road.path.at(s); const off = pc.kind === 0 ? 5.25 : 2.2;
    const x = p.x - p.tz * off, z = p.z + p.tx * off; if (nx !== null) { const d = Math.hypot(x - nx, z - nz); if (d < minD || d > maxD) continue; }
    return { x, z, yaw: Math.atan2(p.tx, p.tz), road: pc.road.name, id: pc.road.id }; }
  return null;
}
/** The raw ribbon road network: roads [{id,name,kind,hw}], junctions [{id,x,z,roads:[id]}], pieces [{road, s0, s1, a, b}]. */
export function roadNetwork() {
  const D = buildRegionData();
  return { roads: D.roads.map((r) => ({ id: r.id, name: r.name, kind: r.kind, hw: r.hw, length: r.path.len })),
    junctions: D.junctions.map((J) => ({ id: J.id, x: J.x, z: J.z, roads: J.roads.map((q) => q.r.id) })),
    pieces: D.pieces.map((p) => ({ road: p.road.id, s0: p.s0, s1: p.s1, a: p.a, b: p.b })), grid: GRID };
}
