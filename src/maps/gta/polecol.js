// a_polecol (map 索拉纳港 only): fitted colliders for the pole-like street furniture and the non-fabric trees / palms.
//  - one convex oriented box per object, fitted to the drawn cross-section at the collision test height (y 0.5 above the ground,
//    where col.resolve tests people and cars) with a_yardcol's single-box objective (least missed + 2 x excess area; constants from
//    a raster fit of the regular n-gon: pentagon 0.696 x 0.737 R shifted 0.079 R, 10-gon 0.772 x 0.832 R, 12-gon / round 0.806 R,
//    6-gon 0.868 x 0.668 R, 8-gon 0.784 R). Never two boxes per object (a notch wedges car circles, col.resolve does two passes).
//  - fabric street lights (mainland grid, 5-sided pole r 0.11 -> 0.07): fitted pentagon box turned with the light, instead of the
//    0.12 m square (a_edgewalls). Filed in the trunk grid like a_yardcol's boxes.
//  - city.lamps (island / region / dock cobra-head lights): 12-sided plinth (r 0.3 -> 0.24 over 0.55 m) -> its section at y 0.5.
//    The old 0.36 m squares were smaller than the plinth, and fixCityProps moved lamps with moveBox(.., 'lamp', ..) while the boxes
//    are tagged 'pole', so a slid lamp kept its box at the old spot and a dropped one left an orphan box. All 'pole' h 9 boxes are
//    replaced by one fitted box per lamp at its final position (dock lamps had none).
//  - city.palms (island streets, beach, dunes of the barrier island, artificial island, bay park, mainland region streets): the
//    veg.js trunk (12 sides, species radius + root flare, scaled, curved and leaned) cut at y 0.5 -> centre + radius, one box.
//    Replaces the 0.6 m axis squares. city.trees: veg.js tube trunk (r 0.3 at the root), same; only street.js trees had a 0.6 m
//    square, the park / dune / promenade trees had nothing. Canopies / fronds get nothing.
//  - signal masts (12-sided skirt + pole), pedestrian poles, wooden utility poles (10-sided butt), sign / bus-stop / name posts,
//    guide-gantry poles, downtown signal poles / hydrants / controller cabinets, island utility cabinets: their old squares were
//    larger than the drawn section; each is swapped for the fitted box at the same centre. Island hydrants keep their 0.36 m
//    square (drawn with a random yaw that is not kept, nozzles stick out in an unknown direction).
//  - runs in attachStreetColliders (after every layer is placed; the curbbake / parkbake hashes are long taken), reads the final
//    records only, draws no random numbers, changes no record. &nopolecol = the old boxes in the same build; &poleaudit keeps the
//    per-object footprint / old box / new box list on city.poleAudit for the census.
import * as THREE from 'three';
import { mulberry } from '../../util.js';
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const POLE_OFF = Q.has('nopolecol');
export const POLE_AUDIT = Q.has('poleaudit');
const YH = 0.5; // collision test height above the ground
// single-box fits of regular n-gons, vertex radius 1, first vertex on +z (three.js CylinderGeometry): [cx, cz, hl (x), hw (z)]
const FIT = { 5: [0, -0.0789, 0.6958, 0.7369], 6: [0, 0, 0.868, 0.668], 8: [0, 0, 0.784, 0.784], 10: [0, 0, 0.772, 0.832], 12: [0, 0, 0.806, 0.806], 0: [0, 0, 0.832, 0.832] };
// box record: [cx, cz, ux, uz, hl, hw]
function fitN(n, x, z, R, yaw) { const f = FIT[n]; const cb = Math.cos(yaw), sb = Math.sin(yaw); const px = f[0] * R, pz = f[1] * R;
  return [x + px * cb + pz * sb, z - px * sb + pz * cb, Math.cos(yaw), -Math.sin(yaw), f[2] * R, f[3] * R]; }
const rectB = (x, z, hx, hz) => [x, z, 1, 0, hx, hz];
// drawn footprint polygon(s) for the audit: list of convex polygons [[x, z], ...]
const ngon = (n, x, z, R, yaw = 0, ph = 0) => { const cb = Math.cos(yaw), sb = Math.sin(yaw); const o = []; for (let j = 0; j < n; j++) { const t = j / n * 2 * Math.PI + ph; const lx = R * Math.sin(t), lz = R * Math.cos(t); o.push([x + lx * cb + lz * sb, z - lx * sb + lz * cb]); } return o; };
const rectP = (x, z, hx, hz) => [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];

// ---- veg.js models (read-only copies of the shapes veg.js draws; keep in sync with palmGeometry / treeGeometry / buildVegetation)
const SP = { coco: { H: 11, curve: 1.4, shaft: 0 }, royal: { H: 13, curve: 0.08, shaft: 2.6 }, sabal: { H: 9, curve: 0.18, shaft: 0 } };
const PK = ['coco', 'coco', 'royal', 'royal', 'sabal'];
const palmRad = (k, t, H) => (k === 'royal' ? 0.24 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.3)) : k === 'coco' ? 0.16 + 0.07 * (1 - t) : 0.22 + 0.02 * (1 - t)) + 0.22 * Math.exp(-t * H * 1.6);
function palmKind(p) { const hsh = Math.abs(Math.sin(p.x * 12.9 + p.z * 78.2)) * 1000 % 1; const beach = p.x > 300 || p.lean > 0.04 || p.lean < -0.04 && !p.street;
  let vi; if (beach) vi = hsh < 0.5 ? 0 : 1; else if (p.street) vi = hsh < 0.55 ? (hsh < 0.27 ? 2 : 3) : hsh < 0.85 ? 4 : 1; else vi = Math.floor(hsh * 5) % 5; return PK[vi]; }
// palm trunk section at world y = ground + YH (Euler(lean k, rot, 0) XYZ, scale (s .95 ps, s, s .95 ps), base at ground - 0.05): the trunk
// is 16 rings of 12 sides, straight between rings; a leaning trunk cut level is an egg (the low side sits deeper in the root flare), so
// each of 24 surface lines is cut at its own height -> section points, extents (lean axis = world z after the X tilt) -> one box
export function palmSection(p, g) { const k = palmKind(p), sp = SP[k]; const H = sp.H, s = p.h / (H + sp.shaft), sx = s * 0.95 * (p.s || 1); const a = p.lean * (k === 'coco' ? 1.6 : 0.4), r = p.rot;
  const ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(r), sr = Math.sin(r); const cx = (t) => Math.sin(t * Math.PI * 0.5) * sp.curve * (0.6 + t);
  const at = (yl, ang) => { const u = Math.max(0, Math.min(16, yl / H * 16)), k0 = Math.min(15, Math.floor(u)), f = u - k0, t0 = k0 / 16, t1 = (k0 + 1) / 16; const rad = palmRad(k, t0, H) + (palmRad(k, t1, H) - palmRad(k, t0, H)) * f;
    const lx = (cx(t0) + (cx(t1) - cx(t0)) * f + Math.cos(ang) * rad) * sx, lz = Math.sin(ang) * rad * sx, ly = yl * s; const x1 = lx * cr + lz * sr, z1 = -lx * sr + lz * cr; return [x1, ly * ca - z1 * sa, ly * sa + z1 * ca]; };
  const P = []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let j = 0; j < 24; j++) { const ang = j / 24 * Math.PI * 2; let yl = (YH + 0.05) / s, q; for (let it = 0; it < 4; it++) { q = at(yl, ang); yl += (YH + 0.05 - q[1]) / (s * ca); } q = at(yl, ang);
    const x = p.x + q[0], z = p.z + q[2]; P.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, ex: (x1 - x0) / 2, ez: (z1 - z0) / 2, R: Math.max(x1 - x0, z1 - z0) / 2, poly: P, kind: k }; }
let TV = null; // tree variants: first two tube rings of the trunk (centre at arc-length 0 and 1/3, radius 0.3 -> 0.2667)
function treeVariants() { if (TV) return TV; TV = [[5, 'oak'], [9, 'grape'], [13, 'oak'], [21, 'grape']].map(([sd, kind]) => { const r = mulberry(sd);
    const trunkH = kind === 'oak' ? 2.2 + r() * 0.8 : 1.6 + r() * 0.6; const lean = new THREE.Vector3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4); const top = new THREE.Vector3(0, trunkH, 0).add(lean);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(lean.x * 0.3, trunkH * 0.5, lean.z * 0.3), top]); const p0 = c.getPointAt(0), p1 = c.getPointAt(1 / 3);
    return { p0, p1, r0: 0.3, r1: 0.3 - 0.1 / 3 }; }); return TV; }
export function treeSection(t, g) { const v = treeVariants()[Math.floor(Math.abs(Math.sin(t.x * 3.7 + t.z * 1.3)) * 997) % 4]; const s = t.s; const yl = YH / s;
  const f = Math.max(0, Math.min(1, (yl - v.p0.y) / (v.p1.y - v.p0.y))); const lx = (v.p0.x + (v.p1.x - v.p0.x) * f) * s, lz = (v.p0.z + (v.p1.z - v.p0.z) * f) * s; const R = (v.r0 + (v.r1 - v.r0) * f) * s;
  const yaw = t.x * 3.1, cb = Math.cos(yaw), sb = Math.sin(yaw); return { x: t.x + lx * cb + lz * sb, z: t.z - lx * sb + lz * cb, R, yaw }; }

// ---- fabric street lights (region.attach, same point as collectYardCol): flat array stride 7 [cx, cz, ux, uz, hl, hw, h]
export function collectPoleCol(fab) { if (POLE_OFF || !fab || !fab.chunks) return null; const T0 = performance.now(); const A = []; const R = 0.11 - 0.04 * YH / 8.2;
  for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue; for (const l of I.lamp) A.push(...fitN(5, l[0], l[1], R, l[2]), 8.2); }
  return { A: new Float32Array(A), n: A.length / 7, ms: Math.round(performance.now() - T0) }; }
export function filePoleBoxes(P, push) { const A = P.A; for (let i = 0; i < A.length; i += 7) { const cx = A[i], cz = A[i + 1], ux = A[i + 2], uz = A[i + 3], hl = A[i + 4], hw = A[i + 5];
    const ex = Math.abs(ux) * hl + Math.abs(uz) * hw, ez = Math.abs(uz) * hl + Math.abs(ux) * hw; push({ minX: cx - ex, minZ: cz - ez, maxX: cx + ex, maxZ: cz + ez, h: A[i + 6], tag: 'flamp', o: { cx, cz, ux, uz, hl, hw } }); } }
// audit view of the fabric lights (old square vs fitted pentagon box) without touching anything
export function auditFabricLamps(fab) { const out = []; if (!fab || !fab.chunks) return out; const R = 0.11 - 0.04 * YH / 8.2;
  for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue; for (const l of I.lamp) out.push({ c: 'flamp', fp: [ngon(5, l[0], l[1], R, l[2])], old: [l[0], l[1], 1, 0, 0.12, 0.12], nw: fitN(5, l[0], l[1], R, l[2]) }); }
  return out; }

// ---- island / city objects in the main grid
const cen = (b) => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
const oldOf = (b) => { if (b.o) return [b.o.cx, b.o.cz, b.o.ux, b.o.uz, b.o.hl, b.o.hw]; const [x, z] = cen(b); return [x, z, 1, 0, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2]; };
// classify an existing box by tag + size: returns [class, footprint fn(x, z), fit fn(x, z)] or null (left alone)
function boxClass(b) { const w = b.maxX - b.minX, d = b.maxZ - b.minZ, h = b.h; const sq = near(w, d);
  if (b.o) { const o = b.o; if (b.tag === 'dtown') { // downtown.js addCol (axis-aligned OBBs): signal pole 0.4 sq h 7, hydrant 0.4 x 0.5 h 0.8, cabinet 1.2 x 0.8 h 1.6
      if (near(o.hl, 0.2) && near(o.hw, 0.2) && near(h, 7)) return ['dsig', (x, z) => [rectP(x, z, 0.13, 0.13)], (x, z) => rectB(x, z, 0.13, 0.13)];
      if (near(o.hl, 0.2) && near(o.hw, 0.25) && near(h, 0.8)) return ['dhyd', (x, z) => [rectP(x, z, 0.15, 0.15), rectP(x, z, 0.06, 0.25)], (x, z) => rectB(x, z, 0.15, 0.15)]; // body only: covering the 0.12 m nozzle stub too costs more excess than it saves
      if (near(o.hl, 0.6) && near(o.hw, 0.4) && near(h, 1.6)) return ['dcab', (x, z) => [rectP(x, z, 0.5, 0.3)], (x, z) => rectB(x, z, 0.5, 0.3)]; }
    return null; }
  if (b.tag === 'pole' && sq && near(h, 6) && near(w, 0.4)) { const R = 0.152; return ['mast', (x, z) => [ngon(12, x, z, R)], (x, z) => fitN(12, x, z, R, 0)]; }
  if (b.tag === 'pole' && sq && near(h, 3.4) && near(w, 0.2)) { const R = 0.0735; return ['pedpole', (x, z) => [ngon(12, x, z, R)], (x, z) => fitN(12, x, z, R, 0)]; }
  if (b.tag === 'upole' && sq && near(w, 0.4)) { const R = 0.179; return ['upole', (x, z) => [ngon(10, x, z, R)], (x, z) => fitN(10, x, z, R, 0)]; }
  if (b.tag === 'sign' && sq && near(w, 0.16)) { const R = 0.035; return ['sign', (x, z) => [ngon(6, x, z, R)], (x, z) => fitN(6, x, z, R, 0)]; }
  if ((b.tag === 'busstop' || b.tag === 'namepost') && sq && near(w, 0.14)) { const R = 0.038; return [b.tag === 'busstop' ? 'bspost' : 'namepost', (x, z) => [ngon(8, x, z, R)], (x, z) => fitN(8, x, z, R, 0)]; }
  if (b.tag === 'gantry' && sq && near(w, 0.48)) { const R = 0.2 - 0.04 * YH / 7; return ['gantry', (x, z) => [ngon(12, x, z, R)], (x, z) => fitN(12, x, z, R, 0)]; }
  if (b.tag === 'cab' && near(w, 0.9) && near(d, 1.2)) return ['cab', (x, z) => [rectP(x, z, 0.275, 0.475)], (x, z) => rectB(x, z, 0.275, 0.475)];
  if (b.tag === 'hyd' && sq) return ['hyd', (x, z) => [ngon(16, x, z, 0.107)], null]; // kept (yaw unknown)
  return null; }

export function attachPoleCol(city) { const col = city.col; const S = { ms: 0, removed: 0, added: 0, byClass: {}, orphan: { lamp: 0, palm: 0, tree: 0 }, noBox: { lamp: 0, palm: 0, tree: 0 } };
  if (!col || (POLE_OFF && !POLE_AUDIT)) return S; const T0 = performance.now(); const AU = POLE_AUDIT ? [] : null; const kill = new Set(); const adds = []; const tmp = [];
  const bump = (c) => { S.byClass[c] = (S.byClass[c] || 0) + 1; };
  // 1) records with their own lists: lamps / palms / trees (old box = same-tag square centred on the record, if any)
  const own = (tag, x, z, pred) => { for (const b of col.query(x, z, 0.6, tmp)) { if (b.tag !== tag || b.o || kill.has(b) || (pred && !pred(b))) continue; const [cx, cz] = cen(b); if (near(cx, x) && near(cz, z)) return b; } return null; };
  const lampBox = (b) => near(b.h, 9) && near(b.maxX - b.minX, 0.36);
  for (const l of city.lamps || []) { const b = own('pole', l.x, l.z, lampBox); const Rl = 0.3 - 0.06 * YH / 0.55; // plinth r 0.3 -> 0.24 over 0.55 m, base on the walk / deck (l.y)
      const yaw = Math.atan2(l.dir[0], l.dir[1]); const nw = fitN(12, l.x, l.z, Rl, yaw);
      if (b) kill.add(b); else S.noBox.lamp++; adds.push([nw, b ? b.h : l.y + 8.85, 'pole', 'lamp']); bump('lamp');
      if (AU) AU.push({ c: 'lamp', fp: [ngon(12, l.x, l.z, Rl, yaw)], old: b ? oldOf(b) : null, nw }); }
  // lamp boxes left over: moved (fixCityProps slid the lamp, not its box) or dropped lamps -> orphans
  for (const b of col.boxes) if (b.tag === 'pole' && !b.o && lampBox(b) && !kill.has(b)) { kill.add(b); S.orphan.lamp++; if (AU) AU.push({ c: 'lampOrphan', fp: [], old: oldOf(b), nw: null }); }
  for (const p of city.palms || []) { const g = city.groundH(p.x, p.z); const s = palmSection(p, g); const b = own('palm', p.x, p.z); const nw = [s.x, s.z, 1, 0, FIT[0][2] * s.ex, FIT[0][3] * s.ez]; // round-section fit, stretched along the lean
    if (b) kill.add(b); else S.noBox.palm++; adds.push([nw, Math.max(b ? b.h : 6, g + 6), 'palm', 'palm']); bump('palm');
    if (AU) AU.push({ c: 'palm', k: s.kind, fp: [s.poly], old: b ? oldOf(b) : null, nw }); }
  for (const t of city.trees || []) { const g = city.groundH(t.x, t.z); const s = treeSection(t, g); const b = own('tree', t.x, t.z); const nw = fitN(0, s.x, s.z, s.R, 0);
    if (b) kill.add(b); else S.noBox.tree++; adds.push([nw, Math.max(b ? b.h : 6, g + 6), 'tree', 'tree']); bump('tree');
    if (AU) AU.push({ c: t.street ? 'streettree' : 'tree', fp: [ngon(24, s.x, s.z, s.R)], old: b ? oldOf(b) : null, nw }); }
  for (const b of col.boxes) if ((b.tag === 'palm' || b.tag === 'tree') && !b.o && !kill.has(b)) { S.orphan[b.tag]++; if (AU) AU.push({ c: b.tag + 'Orphan', fp: [], old: oldOf(b), nw: null }); } // kept (none expected)
  // 2) boxes that are the only record of their object (centre = object position)
  for (const b of col.boxes) { if (kill.has(b)) continue; const K = boxClass(b); if (!K) continue; const [x, z] = b.o ? [b.o.cx, b.o.cz] : cen(b); const nw = K[2] ? K[2](x, z) : null;
    if (nw) { kill.add(b); adds.push([nw, b.h, b.tag, K[0]]); } bump(K[0]); if (AU) AU.push({ c: K[0], fp: K[1](x, z), old: oldOf(b), nw: nw || oldOf(b) }); }
  if (POLE_OFF) { city.poleAudit = AU; S.ms = Math.round(performance.now() - T0); return S; }
  // 3) swap: batch removal (cell lists + one in-place compaction of col.boxes), then the fitted boxes
  const c = col.cell; for (const b of kill) for (let ix = Math.floor(b.minX / c); ix <= Math.floor(b.maxX / c); ix++) for (let iz = Math.floor(b.minZ / c); iz <= Math.floor(b.maxZ / c); iz++) { const l = col.map.get(col.key(ix, iz)); if (l) { const j = l.indexOf(b); if (j >= 0) l.splice(j, 1); } }
  { const B = col.boxes; let j = 0; for (let i = 0; i < B.length; i++) if (!kill.has(B[i])) B[j++] = B[i]; B.length = j; } S.removed = kill.size;
  for (const [f, h, tag, k] of adds) { const nb = col.addOBB(f[0], f[1], f[2], f[3], f[4], f[5], h, tag); nb.pc = k; } S.added = adds.length;
  if (AU) city.poleAudit = AU; S.ms = Math.round(performance.now() - T0); return S; }
