// a_curbalign (map 索拉纳港 only): residential street-front fit-up — sidewalks vs lot fronts, run after placement (like colfix /
// propfix / parkfix: no builder draws another random number, so every layout and RNG stream stays as before; this pass only
// re-shapes / moves finished records). Why: the residential frames are bilinear (and ~45 % warped across b for the curvilinear
// streets), so a lot laid out "LIN metres from the street" in frame units lands 0.6–1.4× that far in the world, sheared, while the
// sidewalks are laid perpendicular to each real street piece in true metres. Census (&curbaudit, or node) of every house lot:
//  - driveway apron (verge piece) and drive (yard piece): skew vs the street normal, apron on the carriageway / short of it,
//    gap to the sidewalk, drive short of the sidewalk (grass strip) or poking through it into the verge, apron / drive out of line;
//  - houses / hedges / walls / boats overlapping a sidewalk or the carriageway; front-yard trees on a sidewalk / drive / road;
//  - canal docks hanging over the water or short of it; the joints of curved sidewalk runs (wedge gaps / spurs at each bend);
//  - kerb height (fabric sidewalks are 0.03 m flush plates on groundH 0: no kerb, so no ramp is needed anywhere).
// Fix (every lot, in placement order): apron + drive are re-laid square to the street piece the lot fronts (apron kerb -> sidewalk,
// drive sidewalk -> the house face it leads to), the driveway car rides along (same relative spot, square to the drive; parkfix.js
// then applies its own rules), a front-yard tree clear of the sidewalk / drive / house is nudged inside the yard (dropped if no
// spot), docks are slid along their axis onto the bank edge, curved sidewalk runs get mitred joints. Houses, walls and hedges
// keep their place (their colliders and the later layers' free-space checks are untouched).
import { CURB_BAKE } from './curbbake.js'; // a_curbbake: replay tape (tools/curbfix_bake.mjs)
import { inCanalWater } from './fabric.js';
const LW = 4.5, LVG = 1.8, LSW = 1.8, LIN = LW + LVG + LSW; // as fabric.js (local street half width, verge, sidewalk)
const AUDIT = typeof location !== 'undefined' && /[?&]curbaudit/.test(location.search);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const triIn = (px, pz, a, b, c) => { const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (pz - b[1]), d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (pz - c[1]), d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pz - a[1]);
  return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); };
const quadIn = (px, pz, q) => !(px < q.x0 || px > q.x1 || pz < q.z0 || pz > q.z1) && (triIn(px, pz, q[0], q[1], q[2]) || triIn(px, pz, q[0], q[2], q[3]));
class Grid { constructor(c) { this.c = c; this.m = new Map(); }
  add(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) { const key = i * 100003 + k; let l = this.m.get(key); if (!l) this.m.set(key, l = []); l.push(it); } }
  at(x, z) { return this.m.get(Math.floor(x / this.c) * 100003 + Math.floor(z / this.c)) || null; }
  near(x, z, r) { const out = new Set(), c = this.c; for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let k = Math.floor((z - r) / c); k <= Math.floor((z + r) / c); k++) { const l = this.m.get(i * 100003 + k); if (l) for (const it of l) out.add(it); } return out; } }
// keep (optional): bbox filter (the residential cells' extents) applied before a quad object is made
const quadsOf = (acc, keep) => { const out = []; if (!acc || !acc.p) return out; const P = acc.p; for (let v = 0; v + 3 < acc.n; v += 4) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < 4; k++) { const x = P[(v + k) * 3], z = P[(v + k) * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } if (keep && !keep(x0, z0, x1, z1)) continue;
  const q = []; q.acc = acc; q.v = v; for (let k = 0; k < 4; k++) q.push([P[(v + k) * 3], P[(v + k) * 3 + 2]]); q.x0 = x0; q.z0 = z0; q.x1 = x1; q.z1 = z1; out.push(q); } return out; };
// box corners of an instance record laid out like addFlat / addBody (local +x = (cos, -sin) * w/2, local +z = (sin, cos) * d/2)
const axes = (ang) => [[Math.cos(ang), -Math.sin(ang)], [Math.sin(ang), Math.cos(ang)]];
function rectPts(cx, cz, w, d, ang, shrink, step) { const [u, v] = axes(ang); const a = w / 2 - shrink, b = d / 2 - shrink; if (a <= 0 || b <= 0) return [[cx, cz]]; const pts = [[cx, cz]];
  const C = [[a, b], [-a, b], [-a, -b], [a, -b]]; for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < n; j++) { const s = j / n, x = p[0] + (q[0] - p[0]) * s, y = p[1] + (q[1] - p[1]) * s; pts.push([cx + u[0] * x + v[0] * y, cz + u[1] * x + v[1] * y]); } } return pts; }
const flatRect = (f, shrink = 0.05, step = 0.4) => rectPts(f[0], f[1], f[2], f[3], f[4], shrink, step);
const bodyRect = (b, shrink = 0.1, step = 0.4) => rectPts(b[0], b[2], b[3], b[5], b[6], shrink, step);

// the street pieces (fabric.js localSides records), nearest one to a point on its lot side
function segIndex(fab) { const g = new Grid(32); const segs = (fab.locSegs || []).filter((s) => s.res);
  for (const s of segs) { const d = sub(s.B, s.A), L = Math.hypot(d[0], d[1]); s.L = L; s.d = [d[0] / L, d[1] / L]; s.n = [-s.d[1], s.d[0]];
    g.add(s, Math.min(s.A[0], s.B[0]) - 12, Math.min(s.A[1], s.B[1]) - 12, Math.max(s.A[0], s.B[0]) + 12, Math.max(s.A[1], s.B[1]) + 12); }
  for (let k = 0; k + 1 < segs.length; k++) { const a = segs[k], b = segs[k + 1]; if (a.run && a.run === b.run && a.B[0] === b.A[0] && a.B[1] === b.A[1]) a.jB = b.jA = true; } // joints of a run (not free ends)
  return { g, segs }; }
function nearestSeg(SI, p) { let best = null, bd = 1e9; const l = SI.g.at(p[0], p[1]); if (!l) return null;
  for (let i = 0; i < l.length; i++) { const s = l[i]; const r0 = p[0] - s.A[0], r1 = p[1] - s.A[1]; const t = Math.max(0, Math.min(s.L, r0 * s.d[0] + r1 * s.d[1])); const dd = Math.hypot(r0 - s.d[0] * t, r1 - s.d[1] * t); if (dd < bd) { bd = dd; best = s; } } // a_curbbake: scalar, same arithmetic
  return best; }
// street-relative coordinates of a point: along t, across o (signed toward the lot side sg)
const frameOf = (s, sg) => ({ A: s.A, d: s.d, n: [s.n[0] * sg, s.n[1] * sg], L: s.L });
const loc = (F, p) => { const r = sub(p, F.A); return [dot(r, F.d), dot(r, F.n)]; };
const wpt = (F, t, o) => [F.A[0] + F.d[0] * t + F.n[0] * o, F.A[1] + F.d[1] * t + F.n[1] * o];
const angAlong = (F) => Math.atan2(-F.d[1], F.d[0]); // record angle whose local +x runs along the street (local +z = ±n)
// ray (origin O, unit dir n) into an oriented body record: entry distance or null
function rayBody(O, n, b) { const c = Math.cos(b[6]), sn = Math.sin(b[6]); const u0 = c, u1 = -sn, v0 = sn, v1 = c; const r0 = O[0] - b[0], r1 = O[1] - b[2];
  const ox = r0 * u0 + r1 * u1, oz = r0 * v0 + r1 * v1, dx = n[0] * u0 + n[1] * u1, dz = n[0] * v0 + n[1] * v1; const hx = b[3] / 2, hz = b[5] / 2; let t0 = -Infinity, t1 = Infinity; // a_curbbake: scalar (same arithmetic as before)
  if (Math.abs(dx) < 1e-9) { if (Math.abs(ox) > hx) return null; } else { let a = (-hx - ox) / dx, e = (hx - ox) / dx; if (a > e) { const q = a; a = e; e = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, e); }
  if (Math.abs(dz) < 1e-9) { if (Math.abs(oz) > hz) return null; } else { let a = (-hz - oz) / dz, e = (hz - oz) / dz; if (a > e) { const q = a; a = e; e = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, e); }
  return t1 >= Math.max(t0, 0) ? Math.max(t0, 0) : null; }
function rayXY(Ox, Oz, n0, n1, b, c, sn) { const u0 = c, u1 = -sn, v0 = sn, v1 = c; const r0 = Ox - b[0], r1 = Oz - b[2];
  const ox = r0 * u0 + r1 * u1, oz = r0 * v0 + r1 * v1, dx = n0 * u0 + n1 * u1, dz = n0 * v0 + n1 * v1; const hx = b[3] / 2, hz = b[5] / 2; let t0 = -Infinity, t1 = Infinity;
  if (Math.abs(dx) < 1e-9) { if (Math.abs(ox) > hx) return null; } else { let a = (-hx - ox) / dx, e = (hx - ox) / dx; if (a > e) { const q = a; a = e; e = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, e); }
  if (Math.abs(dz) < 1e-9) { if (Math.abs(oz) > hz) return null; } else { let a = (-hz - oz) / dz, e = (hz - oz) / dz; if (a > e) { const q = a; a = e; e = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, e); }
  return t1 >= Math.max(t0, 0) ? Math.max(t0, 0) : null; }
const circRect = (x, z, r, cx, cz, w, d, ang) => { const [u, v] = axes(ang); const p = [x - cx, z - cz]; const a = Math.max(0, Math.abs(dot(p, u)) - w / 2), b = Math.max(0, Math.abs(dot(p, v)) - d / 2); return a * a + b * b < r * r; };
const trunkR = (kind, rec) => (kind === 'tree' ? 0.24 * (0.75 + rec[2] * 0.12) : 0.24 * (rec[2] / 10) + 0.05);

function surfaces(fab, flats = false) { const gR = new Grid(24), gW = new Grid(24), gF = new Grid(16), gL = new Grid(24); let nW = 0;
  const RB = (fab.resCells || []).map((q) => [q.x0 - 24, q.z0 - 24, q.x1 + 24, q.z1 + 24]); const keep = (x0, z0, x1, z1) => { for (const b of RB) if (x1 >= b[0] && x0 <= b[2] && z1 >= b[1] && z0 <= b[3]) return true; return false; };
  for (const ch of fab.chunks.values()) { for (const q of quadsOf(ch.road, keep)) gR.add(q, q.x0, q.z0, q.x1, q.z1); for (const q of quadsOf(ch.walk, keep)) { gW.add(q, q.x0, q.z0, q.x1, q.z1); nW++; } for (const q of quadsOf(ch.plaza, keep)) gW.add(q, q.x0, q.z0, q.x1, q.z1); for (const q of quadsOf(ch.lot, keep)) gL.add(q, q.x0, q.z0, q.x1, q.z1);
    if (flats) for (const f of ch.I.flat) { if (f[8] > 0.02) continue; const e = Math.hypot(f[2], f[3]) / 2; gF.add(f, f[0] - e, f[1] - e, f[0] + e, f[1] + e); } }
  const inG = (g, x, z) => { const l = g.at(x, z); if (l) for (const q of l) if (!q.dead && quadIn(x, z, q)) return true; return false; };
  const inFlat = (x, z, skip) => { const l = gF.at(x, z); if (l) for (const f of l) { if (f === skip) continue; const [u, v] = axes(f[4]); const p = [x - f[0], z - f[1]]; if (Math.abs(dot(p, u)) <= f[2] / 2 && Math.abs(dot(p, v)) <= f[3] / 2) return true; } return false; };
  const onWalkX = (x, z, m) => { const l = gW.at(x, z); if (l) for (const q of l) if (!q.dead && !(q.acc === m[0] && q.v === m[1]) && quadIn(x, z, q)) return true; return false; };
  const wq = new Map(); for (const l of gW.m.values()) for (const q of l) if (q.acc) { let a = wq.get(q.acc); if (!a) wq.set(q.acc, a = new Map()); a.set(q.v, q); }
  const reWalk = (m) => { const a = wq.get(m[0]); const o = a && a.get(m[1]); if (o) o.dead = true; const P = m[2]; const q = P.map((p) => [p[0], p[1]]); q.acc = m[0]; q.v = m[1];
    q.x0 = Math.min(...q.map((p) => p[0])); q.x1 = Math.max(...q.map((p) => p[0])); q.z0 = Math.min(...q.map((p) => p[1])); q.z1 = Math.max(...q.map((p) => p[1])); gW.add(q, q.x0, q.z0, q.x1, q.z1); if (a) a.set(m[1], q); };
  return { onRoad: (x, z) => inG(gR, x, z), onWalk: (x, z) => inG(gW, x, z), onLot: (x, z) => inG(gL, x, z), onWalkX, onFlat: inFlat, nW, gW, gR, reWalk }; }
// body records as oriented boxes (for house moves: clear of the other buildings / walls)
function bodyGrid(fab) { const g = new Grid(32); for (const ch of fab.chunks.values()) for (const b of ch.I.body) { if (b[1] + b[4] < 0.3 || b[1] > 1) continue; const e = Math.hypot(b[3], b[5]) / 2; g.add(b, b[0] - e, b[2] - e, b[0] + e, b[2] + e); } return g; }
function obbOverlap(a, b, pad) { const A = axes(a[6]), B = axes(b[6]); const ha = [a[3] / 2, a[5] / 2], hb = [b[3] / 2, b[5] / 2]; const d = [b[0] - a[0], b[2] - a[2]];
  for (const ax of [A[0], A[1], B[0], B[1]]) { const ra = ha[0] * Math.abs(dot(A[0], ax)) + ha[1] * Math.abs(dot(A[1], ax)), rb = hb[0] * Math.abs(dot(B[0], ax)) + hb[1] * Math.abs(dot(B[1], ax)); if (Math.abs(dot(d, ax)) >= ra + rb + pad) return false; } return true; }
const bodyOnPaved = (S, b, shrink, step) => { for (const p of bodyRect(b, shrink, step)) if (S.onWalk(p[0], p[1]) || S.onRoad(p[0], p[1])) return true; return false; };
// separating-axis test of a body record (shrunk) against the sidewalk / road quads around it (fast pre-test for bodyOnPaved)
function bodyTouchesPaved(S, b, shrink) { const [u, v] = axes(b[6]); const a = b[3] / 2 - shrink, c = b[5] / 2 - shrink; if (a <= 0 || c <= 0) return false; const ex = Math.abs(u[0]) * a + Math.abs(v[0]) * c, ez = Math.abs(u[1]) * a + Math.abs(v[1]) * c;
  const x0 = b[0] - ex, x1 = b[0] + ex, z0 = b[2] - ez, z1 = b[2] + ez; const C = [[b[0] + u[0] * a + v[0] * c, b[2] + u[1] * a + v[1] * c], [b[0] - u[0] * a + v[0] * c, b[2] - u[1] * a + v[1] * c], [b[0] - u[0] * a - v[0] * c, b[2] - u[1] * a - v[1] * c], [b[0] + u[0] * a - v[0] * c, b[2] + u[1] * a - v[1] * c]];
  const sepAx = (q, ax, az) => { let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (let k = 0; k < 4; k++) { const d = C[k][0] * ax + C[k][1] * az; if (d < a0) a0 = d; if (d > a1) a1 = d; const e = q[k][0] * ax + q[k][1] * az; if (e < b0) b0 = e; if (e > b1) b1 = e; } return a1 <= b0 || b1 <= a0; };
  const sep = (q) => { if (sepAx(q, u[0], u[1]) || sepAx(q, v[0], v[1])) return true; for (let k = 0; k < 4; k++) { const p = q[k], r = q[(k + 1) & 3]; if (sepAx(q, p[1] - r[1], r[0] - p[0])) return true; } return false; };
  for (const g of [S.gW, S.gR]) { const c0 = g.c; for (let i = Math.floor(x0 / c0); i <= Math.floor(x1 / c0); i++) for (let k = Math.floor(z0 / c0); k <= Math.floor(z1 / c0); k++) { const l = g.m.get(i * 100003 + k); if (l) for (const q of l) { if (q.dead || q.x1 < x0 || q.x0 > x1 || q.z1 < z0 || q.z0 > z1) continue; if (!sep(q)) return true; } } }
  return false; }

// the two free ends of a sidewalk quad (walkSeg corners P0 (t0,o0) P1 (t1,o0) P2 (t1,o1) P3 (t0,o1)): per end its two corner
// indices and the unit direction from each corner along its long edge into the quad; joints of a mitred run are not free ends
function walkEnds(m, s, P = m[2]) { const out = []; const dir = (i, j) => { const e = sub(P[j], P[i]); const l = Math.hypot(e[0], e[1]) || 1; return [e[0] / l, e[1] / l]; };
  if (!s.jA) out.push({ k: [0, 3], v: [P[0], P[3]], e: [dir(0, 1), dir(3, 2)], c: [s.A[0] - s.d[0] * 0.6, s.A[1] - s.d[1] * 0.6] }); if (!s.jB) out.push({ k: [1, 2], v: [P[1], P[2]], e: [dir(1, 0), dir(2, 3)], c: [s.B[0] + s.d[0] * 0.6, s.B[1] + s.d[1] * 0.6] }); return out; }
// 0 fine, 1 the end stands on a carriageway (a corner 0.15 m inside is on the road), 2 short (0.3 m beyond a corner: no road / sidewalk / lot)
function endState(S, end, m) { let road = 0, shortN = 0; for (let i = 0; i < 2; i++) { const v = end.v[i], e = end.e[i];
    if (S.onRoad(v[0] + e[0] * 0.15, v[1] + e[1] * 0.15)) road++; else { const x = v[0] - e[0] * 0.3, z = v[1] - e[1] * 0.3; if (!S.onRoad(x, z) && !S.onWalkX(x, z, m) && !S.onLot(x, z)) shortN++; } }
  if (!road && shortN && !S.onRoad(end.c[0], end.c[1]) && !S.onWalk(end.c[0], end.c[1])) shortN = 0; // a dead-end street: the sidewalk stops where the carriageway stops
  return road ? 1 : shortN ? 2 : 0; }

// ---------------------------------------------------------------------------------------------------------------- census ----
const CATS = { apronRoad: '车道口压行车道', apronShort: '车道口离路缘有缝', apronGap: '车道口与人行道之间有缝', driveGap: '车道与人行道之间露草地', drivePoke: '车道穿过人行道伸进绿化带',
  driveSkew: '车道与街道法线偏角>3°', driveBreak: '车道口与车道错位>0.4m', houseWalk: '房屋压人行道/路面', hedgeWalk: '树篱压人行道/路面', wallWalk: '围墙压人行道/路面', boatWalk: '船压人行道', treeWalk: '前院树压人行道/路面',
  treeDrive: '前院树压车道', dockHang: '码头悬空(内沿在水上)', dockShort: '码头够不到水', jointGap: '弯街人行道接缝楔形缝>0.1m', walkRoad: '人行道端头压行车道', walkShort: '人行道端头够不到路缘/相邻人行道', kerbStep: '路缘高差需坡道',
  // a_curbbake: house orientation + back yards (fabric 住宅后院没有棚屋：house() 只放泳池+甲板、后院树/棕榈、后沿树篱、码头/船)
  houseSkew: '房屋与临街法线偏角>2°', poolHouse: '泳池甲板压房屋', poolWall: '泳池甲板压围墙/树篱/其他建筑', poolOut: '泳池甲板出地块边界', poolPaved: '泳池甲板压人行道/路面', poolPool: '泳池甲板压别家甲板',
  poolWet: '泳池甲板悬空(在运河水面上)', poolGround: '泳池甲板与地面高差>5cm(悬空/埋地)', btreeHouse: '后院树干压房屋', btreeWall: '后院树干压围墙/树篱', btreeOut: '后院树出地块边界', btreePool: '后院树压泳池/甲板', btreePaved: '后院树压人行道/路面', btreeWet: '后院树在水里' };
export function auditCurbs(fab, groundH) {
  const T0 = performance.now(); const C = {}; for (const k in CATS) C[k] = 0; const ex = {}; const note = (k, p) => { C[k]++; if (!ex[k]) ex[k] = []; if (ex[k].length < 6) ex[k].push([+p[0].toFixed(1), +p[1].toFixed(1)]); };
  const S = surfaces(fab, true), SI = segIndex(fab); const lots = fab.lots || []; const wet = (x, z) => groundH ? !(groundH(x, z) > -0.95) : false;
  let nDrive = 0;
  for (const LT of lots) { if (!LT.yard) continue; nDrive++;
    const s = nearestSeg(SI, LT.dfront); if (!s) continue; const sg = Math.sign(dot(sub(LT.dfront, s.A), s.n)) || 1; const F = frameOf(s, sg);
    const Y = LT.yard, V = LT.verge;
    // skew: drive axis (local z) vs street normal
    const zY = axes(Y[4])[1], zV = axes(V[4])[1]; const skY = Math.acos(Math.min(1, Math.abs(dot(zY, F.n)))), skV = Math.acos(Math.min(1, Math.abs(dot(zV, F.n))));
    if (Math.max(skY, skV) > (3 * Math.PI) / 180) note('driveSkew', LT.dfront);
    // across-street extents (o) of the apron / drive corners
    const ext = (f) => { let o0 = 1e9, o1 = -1e9, t = 0; for (const p of rectPts(f[0], f[1], f[2], f[3], f[4], 0, 1e9).slice(1)) { const l = loc(F, p); o0 = Math.min(o0, l[1]); o1 = Math.max(o1, l[1]); } t = loc(F, [f[0], f[1]])[0]; return [o0, o1, t]; };
    const [vo0, vo1, vt] = ext(V), [yo0, , yt] = ext(Y);
    if (vo0 < LW - 0.15) note('apronRoad', [V[0], V[1]]); else if (vo0 > LW + 0.15) note('apronShort', [V[0], V[1]]);
    if (vo1 < LW + LVG - 0.15) note('apronGap', [V[0], V[1]]);
    // drive near edge: its street-side corners / mid must reach under the sidewalk (o <= LIN + 0.15)
    { const [u, v] = axes(Y[4]); const sgn = dot(v, F.n) > 0 ? -1 : 1; let worst = -1e9, poke = 1e9; for (const a of [-Y[2] / 2, 0, Y[2] / 2]) { const p = [Y[0] + u[0] * a + v[0] * sgn * Y[3] / 2, Y[1] + u[1] * a + v[1] * sgn * Y[3] / 2]; const o = loc(F, p)[1]; worst = Math.max(worst, o); poke = Math.min(poke, o); }
      if (worst > LIN + 0.15) note('driveGap', [Y[0], Y[1]]); if (poke < LW + LVG - 0.1) note('drivePoke', [Y[0], Y[1]]); void yo0; }
    if (Math.abs(vt - yt) > 0.4) note('driveBreak', [Y[0], Y[1]]);
    // front tree
    if (LT.ftree && LT.ftree[1] && !LT.ftree[1].gone) { const [k, t] = LT.ftree; const r = trunkR(k, t); let w = false, dr = false;
      for (let a = 0; a < 8; a++) { const x = t[0] + Math.cos(a * 0.785) * r, z = t[1] + Math.sin(a * 0.785) * r; if (S.onWalk(x, z) || S.onRoad(x, z)) w = true; if (S.onFlat(x, z)) dr = true; }
      if (S.onWalk(t[0], t[1]) || S.onRoad(t[0], t[1])) w = true; if (w) note('treeWalk', t); else if (dr) note('treeDrive', t); }
    // dock: inner (land side) edge on land, outer edge over water
    if (LT.dock && !LT.dock.gone) { const D = LT.dock; const [, v] = axes(D[4]); const o = sub([D[0], D[1]], LT.front); const out = dot(v, o) > 0 ? 1 : -1; const hi = D[3] / 2 - 0.02, ho = D[3] / 2 - 0.15;
      if (wet(D[0] - v[0] * out * hi, D[1] - v[1] * out * hi)) note('dockHang', D); else if (!wet(D[0] + v[0] * out * ho, D[1] + v[1] * out * ho)) note('dockShort', D); }
  }
  // bodies in residential cells vs sidewalks / carriageways (perimeter samples 0.1 m inside the footprint)
  const inRes = (x, z) => (fab.resCells || []).some((q) => quadIn(x, z, q));
  const KC = { 0: 'houseWalk', 6: 'hedgeWalk', 7: 'wallWalk', 8: 'boatWalk' }; const WR = new Set((fab.walls || []).map((w) => w.rec)); // kind 7: the yard walls (bridge parapets / deck edge walls stand on their kerbs on purpose)
  for (const ch of fab.chunks.values()) for (const b of ch.I.body) { const k = KC[b[10]]; if (!k || b[1] < -0.5 && b[10] !== 8) continue; if (b[1] + b[4] < 0.1) continue; if (b[10] === 7 && !WR.has(b)) continue; // deck slabs / edge walls (a_bridgewalk) sit on purpose
    if (!inRes(b[0], b[2])) continue; for (const p of bodyRect(b)) if (S.onWalk(p[0], p[1]) || S.onRoad(p[0], p[1])) { note(k, [b[0], b[2]]); break; } }
  // curved sidewalk runs: wedge gap at the outer edge of each joint
  const runs = new Map(); for (const s of SI.segs) { if (!s.run) continue; let l = runs.get(s.run); if (!l) runs.set(s.run, l = []); l.push(s); }
  let nJoint = 0; for (const l of runs.values()) for (let k = 0; k + 1 < l.length; k++) { const a = l[k], b = l[k + 1]; if (a.B[0] !== b.A[0] || a.B[1] !== b.A[1]) continue; nJoint++;
    const cr = a.d[0] * b.d[1] - a.d[1] * b.d[0]; const th = Math.asin(Math.min(1, Math.abs(cr))); if (LIN * th > 0.1 && !(a.mitred && b.mitred)) note('jointGap', a.B); }
  // local sidewalk ends (not the mitred joints of a curved run): standing on a carriageway, or short of the kerb / sidewalk / lot they should meet
  for (const s of SI.segs) for (const sg of [-1, 1]) for (const m of s.w[sg] || []) for (const end of walkEnds(m, s)) { const r = endState(S, end, m);
    if (r === 1) note('walkRoad', end.v[0]); else if (r === 2) note('walkShort', end.v[0]); }
  // a_curbbake: house orientation vs the street it fronts; back-yard pools / decks and trees
  { const BG = bodyGrid(fab), DG = deckGrid(fab), Y = yardTests(fab, S, BG, DG); let sk = 0, skMax = 0;
    for (const LT of lots) { const a = Math.abs(houseTurn(SI, LT)); if (a > DEG2) { note('houseSkew', [LT.house[0], LT.house[2]]); sk += a; skMax = Math.max(skMax, a); }
      if (LT.deck && LT.pool && !LT.deck.gone) { const D = LT.deck; for (const k in Y.deckBad(LT, D)) note(k, D);
        if (groundH) { let off = 0; for (const p of rectPts(D[0], D[1], D[2], D[3], D[4], 0.05, 1.5)) { const h = groundH(p[0], p[1]); if (h === undefined || h <= -0.95) { off = 9; break; } off = Math.max(off, Math.abs(h)); } if (off > 0.05 && off < 9) note('poolGround', D); } }
      if (LT.btree && LT.btree[1] && !LT.btree[1].gone) { const [kind, Tr] = LT.btree; for (const k in Y.treeBad(LT, Tr[0], Tr[1], trunkR(kind, Tr))) note(k, Tr); } }
    C.skewMaxDeg = +(skMax * 57.2958).toFixed(2); C.skewMeanDeg = C.houseSkew ? +((sk / C.houseSkew) * 57.2958).toFixed(2) : 0;
    for (const LT of lots) LT._F = undefined; }
  // kerb: fabric sidewalks are flat plates 0.03 m over groundH 0 (no kerb face), so no ramp is ever needed; counted from groundH
  if (groundH) { let st = 0; for (let k = 0; k < SI.segs.length; k += 97) { const s = SI.segs[k]; const p = wpt(frameOf(s, 1), s.L / 2, LW - 0.3), q = wpt(frameOf(s, 1), s.L / 2, LW + LVG + 0.9); const a = groundH(p[0], p[1]), b = groundH(q[0], q[1]); if (a !== undefined && b !== undefined && Math.abs(b + 0.03 - a) > 0.05) st++; } C.kerbStep = st; }
  return { C, ex, lots: lots.length, drives: nDrive, segs: SI.segs.length, joints: nJoint, ms: Math.round(performance.now() - T0) };
}

// ---------------------------------------------------------------------------------------------------------------- fix ----
// move corner k of a sidewalk quad (fabric Acc vertex order: Acc.quad wrote P in order o; uv = world xz as laid)
function setV(m, k, p) { const [acc, v, P] = m; P[k] = p; const cr = (P[1][1] - P[0][1]) * (P[3][0] - P[0][0]) - (P[1][0] - P[0][0]) * (P[3][1] - P[0][1]); const o = cr < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
  for (let j = 0; j < 4; j++) { const q = P[o[j]]; acc.p[(v + j) * 3] = q[0]; acc.p[(v + j) * 3 + 2] = q[1]; acc.uv[(v + j) * 2] = q[0]; acc.uv[(v + j) * 2 + 1] = q[1]; } }
// pending collider edits (houses moved / turned, walls cut): applied by applyCurbColliders after every layer is placed (main.js), so the
// backlot / later free-space checks see exactly the boxes they always saw
const pendCol = (fab, box, adds) => { (fab.curbCol = fab.curbCol || []).push({ box, adds }); };
export function applyCurbColliders(city) { const fab = city.fabric || (city.region && city.region.fabric); const L = (fab && fab.curbCol) || []; const col = city.col; let rm = 0, add = 0;
  for (const e of L) { if (e.box) { col.remove(e.box); rm++; } for (const [cx, cz, ang, hl, hw, h] of e.adds) { col.addOBB(cx, cz, Math.cos(ang), -Math.sin(ang), hl, hw, h, 'bld'); add++; } }
  if (fab) fab.curbCol = null; return { removed: rm, added: add }; }

// a_curbbake: the replay tape. Every test fixCurbs makes against the surface / building grids (the expensive part: building the
// grids and sampling quads) goes through T.b(); in a full pass its answer is recorded, in a replay it is read back, so the replay
// runs the very same code path and arithmetic (same doubles) without building a grid. Tape = run lengths of the answer bits (varint,
// base64) in curbbake.js, guarded by a hash of every input the pass reads (hashCurb); a mismatch runs the full pass.
class Tape { constructor(BK) { this.rec = !BK; this.n = 0;
    if (this.rec) { this.bits = []; return; }
    const s = atob(BK.runs); const B = new Uint8Array(BK.nb); let i = 0, o = 0, v = 0; while (i < s.length) { let r = 0, sh = 0, c; do { c = s.charCodeAt(i++); r += (c & 127) * 2 ** sh; sh += 7; } while (c & 128); if (v) B.fill(1, o, o + r); o += r; v ^= 1; }
    this.B = B; this.nb = BK.nb; }
  b(f) { if (this.rec) { const v = !!f(); this.bits.push(v ? 1 : 0); return v; } return this.B[this.n++] === 1; }
  encode() { const out = []; const put = (r) => { while (r >= 128) { out.push((r & 127) | 128); r = Math.floor(r / 128); } out.push(r); }; let v = 0, r = 0;
    for (const b of this.bits) { if (b === v) r++; else { put(r); v ^= 1; r = 1; } } put(r); let s = ''; for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode.apply(null, out.slice(i, i + 8192)); return { nb: this.bits.length, runs: btoa(s) }; } }
// first hit of a 0.05 m march (a 0.5 m coarse march first, then 0.05 m steps back from it: same answer for strips wider than 0.5 m)
const first = (f, max) => { let D = -1; for (let d = 0.5; d <= max + 0.5001; d += 0.5) if (f(Math.min(d, max))) { D = Math.min(d, max); break; } if (D < 0) return -1; let r = D; for (let d = Math.max(0.05, D - 0.5); d <= D + 1e-6; d += 0.05) if (f(d)) { r = d; break; } return r; };
// lot outline (fabric.js LT.quad, 6 points) and point tests
const polyIn = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const outsideN = (pts, P) => { let n = 0; for (const p of pts) if (!polyIn(p[0], p[1], P)) n++; return n; };
const wrapHalf = (a) => { a = ((a % Math.PI) + Math.PI) % Math.PI; return a > Math.PI / 2 ? a - Math.PI : a; }; // box angles are equal mod pi
const DEG2 = (2 * Math.PI) / 180;
// the street piece a lot fronts and the turn that squares its house to it (null: no street piece found)
function lotStreet(SI, LT) { if (LT._F !== undefined) return LT._F; const s = nearestSeg(SI, LT.dfront); if (!s) return (LT._F = null); const sg = Math.sign(dot(sub(LT.dfront, s.A), s.n)) || 1; return (LT._F = frameOf(s, sg)); }
const houseTurn = (SI, LT) => { const F = lotStreet(SI, LT); return F ? wrapHalf(angAlong(F) - LT.house[6]) : 0; };
const flatBody = (f) => [f[0], 0, f[1], f[2], 1, f[3], f[4]]; // a flat record as a body-like box (x, y0, z, w, h, d, ang)
// back yard tests (full pass only; the answers go on the tape)
function yardTests(fab, SF, BG, DG) {
  const bodyHit = (b, pad, skip) => { for (const o of BG.near(b[0], b[2], Math.hypot(b[3], b[5]) / 2 + 3)) if (o !== b && o !== skip && !o.gone && o[10] !== 8 && obbOverlap(b, o, pad)) return o; return null; };
  const deckHit = (b, skip) => { for (const d of DG.near(b[0], b[2], Math.hypot(b[3], b[5]) / 2 + 3)) if (d !== skip && !d.gone && obbOverlap(b, flatBody(d), -0.05)) return d; return null; };
  const wet = (pts) => { for (const p of pts) if (inCanalWater(fab, p[0], p[1])) return true; return false; };
  const trunkPaved = (x, z, r) => { if (SF.onWalk(x, z) || SF.onRoad(x, z)) return true; for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r; if (SF.onWalk(px, pz) || SF.onRoad(px, pz)) return true; } return false; };
  const trunkBody = (x, z, r) => { for (const o of BG.near(x, z, r + 3)) if (!o.gone && o[10] !== 8 && circRect(x, z, r, o[0], o[2], o[3], o[5], o[6])) return o; return null; };
  const trunkDeck = (x, z, r) => { for (const d of DG.near(x, z, r + 3)) if (!d.gone && circRect(x, z, r, d[0], d[1], d[2], d[3], d[4])) return d; return null; };
  // deck (pool + 1.2 m surround) / back-yard trunk: per category for the census; quick (the fix) stops at the first failure, cheap tests first
  // (canal water only near canal lots: the other cells have no water); pad: clearance asked of the fix
  const deckBad = (LT, D, pad = 0, quick = false) => { const c = {}; const pts = rectPts(D[0], D[1], D[2], D[3], D[4], 0.05, 0.8); if (outsideN(pts, LT.quad)) { c.poolOut = 1; if (quick) return c; }
    const b = flatBody(D); const o = bodyHit(b, pad - 0.05, null); if (o) { c[o[10] === 0 || o[10] === 5 ? 'poolHouse' : 'poolWall'] = 1; if (quick) return c; }
    if (deckHit(b, D)) { c.poolPool = 1; if (quick) return c; } if (bodyTouchesPaved(SF, b, 0.05)) { c.poolPaved = 1; if (quick) return c; } if ((LT.canal || !quick) && wet(pts)) c.poolWet = 1; return c; };
  const treeBad = (LT, x, z, r, pad = 0, quick = false) => { const c = {}; if (!polyIn(x, z, LT.quad) || outsideN([[x + r, z], [x - r, z], [x, z + r], [x, z - r]], LT.quad)) { c.btreeOut = 1; if (quick) return c; }
    const o = trunkBody(x, z, r + pad); if (o) { c[o[10] === 0 || o[10] === 5 ? 'btreeHouse' : 'btreeWall'] = 1; if (quick) return c; } if (trunkDeck(x, z, r + pad)) { c.btreePool = 1; if (quick) return c; }
    if (trunkPaved(x, z, r)) { c.btreePaved = 1; if (quick) return c; } if ((LT.canal || !quick) && inCanalWater(fab, x, z)) c.btreeWet = 1; return c; };
  return { deckBad, treeBad, bodyHit };
}
const deckGrid = (fab) => { const g = new Grid(32); for (const LT of fab.lots || []) if (LT.deck) { const d = LT.deck, e = Math.hypot(d[2], d[3]) / 2; g.add(d, d[0] - e, d[1] - e, d[0] + e, d[1] + e); } return g; };
const any = (c) => { for (const k in c) return true; return false; };

const FULL = typeof location !== 'undefined' && /[?&]curbfull/.test(location.search); // force the full pass (bake check)
const BAKE = typeof location !== 'undefined' && /[?&]curbbake/.test(location.search); // full pass + tape on region.curbFix.fix.bake
export function fixCurbs(fab, opt = {}) {
  const T0 = performance.now(); const S = { drives: 0, aprons: 0, cars: 0, trees: { moved: 0, dropped: 0 }, docks: { moved: 0, dropped: 0, boats: 0 }, joints: 0, t: {} };
  if (!fab || !fab.lots) return S;
  const H0 = hashCurb(fab); S.hash = H0; S.t.hash = Math.round(performance.now() - T0);
  const BK = opt.bake || CURB_BAKE; const useBake = !AUDIT && !FULL && !BAKE && !opt.full && !opt.record && !!BK && BK.hash === H0;
  if (!useBake && !AUDIT && !FULL && !BAKE && !opt.full && !opt.record && BK && typeof console !== 'undefined') console.warn('curbfix: bake stale (fabric inputs changed), full pass; regenerate: node tools/parkfix_bake.cjs (writes curbbake.js + parkbake.js)');
  const T = new Tape(useBake ? BK : null); S.baked = useBake;
  const SI = segIndex(fab); const PR = fab.curbProbe = { walks: [], drives: [], mouths: [], turned: [] }; // spots for the browser spot checks (small)
  // 1) curved sidewalk runs: mitre each joint (both sides, inner and outer edge); uv = world xz as laid
  const runs = new Map(); for (const s of SI.segs) { if (!s.run) continue; let l = runs.get(s.run); if (!l) runs.set(s.run, l = []); l.push(s); }
  for (const l of runs.values()) for (let k = 0; k + 1 < l.length; k++) { const a = l[k], b = l[k + 1]; if (a.B[0] !== b.A[0] || a.B[1] !== b.A[1]) continue;
    const c = a.d[0] * b.d[0] + a.d[1] * b.d[1]; if (c > 1 - 1e-9 || c < 0.5) continue; // straight, or a bend sharper than 60° (none): leave
    const m = [a.n[0] + b.n[0], a.n[1] + b.n[1]]; const ml = Math.hypot(m[0], m[1]); const mu = [m[0] / ml, m[1] / ml]; const sc = 1 / dot(mu, a.n);
    for (const sg of [-1, 1]) { const qa = (a.w[sg] || [])[0], qb = (b.w[sg] || [])[0]; if (!qa || !qb) continue;
      // walkSeg corners: P0 (t0, o0) P1 (t1, o0) P2 (t1, o1) P3 (t0, o1), offsets along n*sg
      for (const [o, ka, kb] of [[LW + LVG, 1, 0], [LIN, 2, 3]]) { const p = [a.B[0] + mu[0] * sg * o * sc, a.B[1] + mu[1] * sg * o * sc]; setV(qa, ka, p); setV(qb, kb, p); } }
    a.mitred = b.mitred = true; S.joints++; }
  for (const l of runs.values()) { if (l.length < 6 || !l.every((q) => q.mitred || q === l[l.length - 1]) || PR.walks.length >= 300) continue; const o = (LW + LVG + LIN) / 2; // sidewalk centre line, side +1
    PR.walks.push(l.map((q) => [q.A[0] + q.n[0] * o, q.A[1] + q.n[1] * o]).concat([[l[l.length - 1].B[0] + l[l.length - 1].n[0] * o, l[l.length - 1].B[1] + l[l.length - 1].n[1] * o]])); }
  S.t.miter = Math.round(performance.now() - T0);
  // the grids only a full pass builds (a replay reads their answers off the tape)
  const SF = T.rec ? surfaces(fab) : null, BG = T.rec ? bodyGrid(fab) : null, DG = T.rec ? deckGrid(fab) : null; const Y = T.rec ? yardTests(fab, SF, BG, DG) : null;
  S.t.surf = Math.round(performance.now() - T0);
  // 1b) free sidewalk ends: each corner slides along its long edge onto the kerb line (off a carriageway it stood on, or out to the
  //     carriageway / sidewalk / lot it fell short of: ≤ 5 m back, ≤ 6 m out)
  S.walkEnds = { trimmed: 0, extended: 0 };
  // (a replay builds an end only when the tape says it moves, from the corners as they were when the quad was reached)
  for (const s of SI.segs) { const ne = (s.jA ? 0 : 1) + (s.jB ? 0 : 1); if (!ne) continue; for (const sg of [-1, 1]) for (const m of s.w[sg] || []) { const EL = T.rec ? walkEnds(m, s) : null; let P0 = null, EL2 = null; for (let ei = 0; ei < ne; ei++) {
    let end = EL && EL[ei]; if (!T.rec && ei === 0 && ne > 1) P0 = m[2].slice();
    const st = T.b(T.rec && (() => endState(SF, end, m) !== 0)) ? (T.b(T.rec && (() => endState(SF, end, m) === 1)) ? 1 : 2) : 0; if (!st) continue;
    if (!end) { if (!EL2) EL2 = walkEnds(m, s, P0 || m[2]); end = EL2[ei]; }
    for (let i = 0; i < 2; i++) { const v = end.v[i], e = end.e[i]; let p = null;
      if (st === 1) { if (T.b(T.rec && (() => SF.onRoad(v[0] + e[0] * 0.15, v[1] + e[1] * 0.15)))) { const d = first((d) => T.b(T.rec && (() => !SF.onRoad(v[0] + e[0] * (d + 0.1), v[1] + e[1] * (d + 0.1)))), 5); if (d > 0) p = [v[0] + e[0] * d, v[1] + e[1] * d]; } }
      else { const d = first((d) => T.b(T.rec && (() => { const x = v[0] - e[0] * d, z = v[1] - e[1] * d; return SF.onRoad(x, z) || SF.onWalkX(x, z, m) || SF.onLot(x, z); })), 6); if (d > 0) p = [v[0] - e[0] * (d + 0.03), v[1] - e[1] * (d + 0.03)]; }
      if (p) { setV(m, end.k[i], p); end.v[i] = p; } }
    if (T.rec) SF.reWalk(m);
    S.walkEnds[st === 1 ? 'trimmed' : 'extended']++; } } }
  S.t.ends = Math.round(performance.now() - T0);
  // 1c) houses on a sidewalk / carriageway: the smallest shift along their own axes (≤ 2.5 m) that clears it and every other building
  S.houses = { moved: 0, kept: 0, turned: 0, turnKept: 0, maxTurn: 0 }; const dirty = [];
  for (const LT of fab.lots) { const H = LT.house; if (!T.b(T.rec && (() => bodyTouchesPaved(SF, H, 0.1)))) continue; const [u, v] = axes(H[6]); const x0 = H[0], z0 = H[2]; let done = false;
    for (let d = 0.1; d <= 2.5001 && !done; d += 0.1) for (const dir of [v, [-v[0], -v[1]], u, [-u[0], -u[1]]]) { H[0] = x0 + dir[0] * d; H[2] = z0 + dir[1] * d;
      if (T.b(T.rec && (() => bodyTouchesPaved(SF, H, 0.1)))) continue; if (T.b(T.rec && (() => { for (const b of BG.near(H[0], H[2], Math.hypot(H[3], H[5]) / 2 + 2)) if (b !== H && b[10] !== 6 && obbOverlap(H, b, 0.2)) return true; return false; }))) continue;
      done = true; break; }
    if (!done) { H[0] = x0; H[2] = z0; S.houses.kept++; continue; }
    if (LT.roof) { LT.roof[0] += H[0] - x0; LT.roof[2] += H[2] - z0; } dirty.push(LT); LT._moved = true; S.houses.moved++; }
  S.t.houses = Math.round(performance.now() - T0);
  // 1c') a_curbbake: houses square to the street they front. The frames are bilinear, so a house laid at the frame angle stands
  //      a few degrees off the street normal (its drive is square to the street since a_curbalign). A house more than 2° off
  //      turns about its own centre (roof along) when the turned box stays off the sidewalk / road, clear of every other building
  //      (0.2 m), inside its lot outline (no more corners outside than before); its pool + deck turn with it (checked in 1f).
  //      Fallbacks, in order: the full turn with the house slid 0.2–1.0 m along its new depth axis, then half the turn (in place).
  for (const LT of fab.lots) { const H = LT.house; const dA = houseTurn(SI, LT); if (Math.abs(dA) <= DEG2) continue; const a0 = H[6], x0 = H[0], z0 = H[2];
    const tryPose = (ang, dv) => T.b(T.rec && (() => { const out0 = outsideN(rectPts(x0, z0, H[3], H[5], a0, 0, 2).slice(1), LT.quad); const v = axes(ang)[1]; H[6] = ang; H[0] = x0 + v[0] * dv; H[2] = z0 + v[1] * dv;
      let good = !bodyTouchesPaved(SF, H, 0.1) && outsideN(rectPts(H[0], H[2], H[3], H[5], H[6], 0, 2).slice(1), LT.quad) <= out0;
      if (good) for (const b of BG.near(H[0], H[2], Math.hypot(H[3], H[5]) / 2 + 3)) if (b !== H && !b.gone && b[10] !== 8 && obbOverlap(H, b, 0.2)) { good = false; break; } H[6] = a0; H[0] = x0; H[2] = z0; return good; }));
    let pose = null; const cands = [[dA, 0]]; for (let d = 0.2; d <= 1.0001; d += 0.2) cands.push([dA, d], [dA, -d]); cands.push([dA / 2, 0]);
    for (const [t, dv] of cands) if (tryPose(a0 + t, dv)) { pose = [t, dv]; break; }
    if (!pose) { S.houses.turnKept++; continue; }
    const [t, dv] = pose; const v = axes(a0 + t)[1]; H[6] = a0 + t; H[0] = x0 + v[0] * dv; H[2] = z0 + v[1] * dv;
    if (LT.roof) { LT.roof[6] = H[6]; LT.roof[0] += H[0] - x0; LT.roof[2] += H[2] - z0; } LT._turn = t; if (!LT._moved) dirty.push(LT); S.houses.turned++; if (dv) S.houses.turnSlid = (S.houses.turnSlid || 0) + 1; if (t !== dA) S.houses.turnHalf = (S.houses.turnHalf || 0) + 1;
    S.houses.maxTurn = Math.max(S.houses.maxTurn, Math.abs(t)); if (PR.turned.length < 200) PR.turned.push([H[0], H[2], +(t * 57.2958).toFixed(2)]); }
  for (const LT of dirty) { const H = LT.house; if (LT.box) pendCol(fab, LT.box, [[H[0], H[2], H[6], H[3] / 2, H[5] / 2, H[1] + H[4]]]); }
  S.houses.maxTurn = +(S.houses.maxTurn * 57.2958).toFixed(2); S.t.turn = Math.round(performance.now() - T0);
  // 1d) back hedges (no collider) on a sidewalk: pulled into the lot along their own depth axis (≤ 1.5 m), shortened if still needed, else dropped
  S.hedges = { moved: 0, shortened: 0, dropped: 0 };
  for (const LT of fab.lots) { const Hd = LT.hedge; if (!Hd || !T.b(T.rec && (() => bodyTouchesPaved(SF, Hd, 0.02)))) continue; const [, v] = axes(Hd[6]); const toIn = dot(v, sub([LT.house[0], LT.house[2]], [Hd[0], Hd[2]])) > 0 ? v : [-v[0], -v[1]];
    const x0 = Hd[0], z0 = Hd[2], w0 = Hd[3]; let ok = false;
    for (const wf of [1, 0.9, 0.8, 0.7, 0.6]) { Hd[3] = w0 * wf; for (let d = 0; d <= 1.5001; d += 0.05) { Hd[0] = x0 + toIn[0] * d; Hd[2] = z0 + toIn[1] * d; if (!T.b(T.rec && (() => bodyTouchesPaved(SF, Hd, 0.02)))) { ok = true; break; } } if (ok) { S.hedges[wf === 1 ? 'moved' : 'shortened']++; break; } }
    if (!ok) { Hd[0] = x0; Hd[2] = z0; Hd[3] = w0; Hd.gone = true; S.hedges.dropped++; } }
  S.t.hedges = Math.round(performance.now() - T0);
  // 1e) yard walls along the arterials (fabric.js wallRun, 2.1 m, collider): cut where a street / its sidewalks pass (0.3 m clear), pieces < 2 m dropped
  S.walls = { cut: 0, pieces: 0, removed: 0 };
  for (const W of fab.walls || []) { const b = W.rec; if (!T.b(T.rec && (() => bodyTouchesPaved(SF, b, 0.02)))) continue; const [u, v] = axes(b[6]); const hw = b[3] / 2;
    // the tape keeps the 0.3 m-clear mask (free) rather than the raw samples (hit): the replay skips the widening loop
    let free; if (T.rec) { const hit = []; for (let x = -hw; x <= hw + 1e-6; x += 0.1) hit.push(((() => { for (const dz of [-b[5] / 2 - 0.3, 0, b[5] / 2 + 0.3]) { const px = b[0] + u[0] * x + v[0] * dz, pz = b[2] + u[1] * x + v[1] * dz; if (SF.onWalk(px, pz) || SF.onRoad(px, pz)) return true; } return false; })()));
      free = hit.map((_, i) => { for (let j = Math.max(0, i - 3); j <= Math.min(hit.length - 1, i + 3); j++) if (hit[j]) return false; return true; }); // 0.3 m clear along the wall too
      for (const f of free) T.b(() => f); } else { free = []; for (let x = -hw; x <= hw + 1e-6; x += 0.1) free.push(T.b(false)); }
    const pieces = []; let st = -1; for (let i = 0; i <= free.length; i++) { if (i < free.length && free[i]) { if (st < 0) st = i; } else if (st >= 0) { const a = -hw + st * 0.1, c = Math.min(hw, -hw + (i - 1) * 0.1); if (c - a >= 2) pieces.push([a, c]); st = -1; } }
    const adds = []; const b0 = b.slice(); const recs = pieces.map(([a, c], k) => { const r = k === 0 ? b : b0.slice(); const m = (a + c) / 2; r[0] = b0[0] + u[0] * m; r[2] = b0[2] + u[1] * m; r[3] = c - a; adds.push([r[0], r[2], r[6], r[3] / 2, r[5] / 2, r[1] + r[4]]); return r; });
    // the first piece keeps the record (computed from the original centre before it changes)
    if (!recs.length) { b.gone = true; S.walls.removed++; } else for (let k = 1; k < recs.length; k++) { W.list.push(recs[k]); if (BG) { const r = recs[k], e = Math.hypot(r[3], r[5]) / 2; BG.add(r, r[0] - e, r[2] - e, r[0] + e, r[2] + e); } }
    pendCol(fab, W.box, adds); S.walls.cut++; S.walls.pieces += recs.length;
    { const ends = [-hw, ...pieces.flat(), hw]; for (let k = 0; k + 1 < ends.length; k += 2) { const a = ends[k], c = ends[k + 1]; if (c - a > 6) PR.mouths.push([b0[0] + u[0] * (a + c) / 2, b0[2] + u[1] * (a + c) / 2, v[0], v[1]]); } } }
  S.t.walls = Math.round(performance.now() - T0);
  // 1f) a_curbbake: back yards. Pool + deck: turned with its house; then, if the deck overlaps a house / wall / hedge / another
  //     deck, leaves the lot outline, reaches a sidewalk / road or hangs over canal water, it slides along the house axes (≤ 3 m back /
  //     forth, ≤ 2 m sideways), else shrinks (0.85, 0.7), else is dropped. Back-yard tree / palm: trunk (+0.3 m) clear of every
  //     building / wall / hedge / deck, inside the lot, off the paving and the water, else moved ≤ 4 m (8 directions), else dropped.
  S.pools = { turned: 0, moved: 0, shrunk: 0, dropped: 0 }; S.btrees = { moved: 0, dropped: 0 };
  const DV = [0]; for (let d = 0.3; d <= 3.0001; d += 0.3) DV.push(d, -d); const DU2 = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2];
  for (const LT of fab.lots) { const D = LT.deck, P = LT.pool; if (!D || !P) continue;
    if (LT._turn) { D[4] += LT._turn; P[4] = D[4]; S.pools.turned++; }
    if (!T.b(T.rec && (() => any(Y.deckBad(LT, D, 0, true))))) continue;
    const [u, v] = axes(LT.house[6]); const x0 = D[0], z0 = D[1], w0 = P[2], d0 = P[3]; let ok = false, sz = 0;
    for (const f of [1, 0.85, 0.7]) { P[2] = w0 * f; P[3] = d0 * f; D[2] = P[2] + 2.4; D[3] = P[3] + 2.4;
      for (const dv of DV) { for (const du of DU2) { D[0] = x0 + u[0] * du + v[0] * dv; D[1] = z0 + u[1] * du + v[1] * dv; if (!T.b(T.rec && (() => any(Y.deckBad(LT, D, 0.1, true))))) { ok = true; break; } } if (ok) break; }
      if (ok) { sz = f; break; } }
    if (!ok) { D[0] = x0; D[1] = z0; D.gone = P.gone = true; S.pools.dropped++; continue; }
    P[0] = D[0]; P[1] = D[1]; if (sz < 1) S.pools.shrunk++; else S.pools.moved++; }
  for (const LT of fab.lots) { if (!LT.btree || !LT.btree[1] || LT.btree[1].gone) continue; const [kind, Tr] = LT.btree; const r = trunkR(kind, Tr);
    if (!T.b(T.rec && (() => any(Y.treeBad(LT, Tr[0], Tr[1], r, 0.3, true))))) continue; const x0 = Tr[0], z0 = Tr[1]; let ok = false;
    for (let rad = 0.5; rad <= 4.0001 && !ok; rad += 0.5) for (let k = 0; k < 8; k++) { const x = x0 + Math.cos(k * 0.785398) * rad, z = z0 + Math.sin(k * 0.785398) * rad; if (!T.b(T.rec && (() => any(Y.treeBad(LT, x, z, r, 0.3, true))))) { Tr[0] = x; Tr[1] = z; ok = true; break; } }
    if (ok) S.btrees.moved++; else { Tr.gone = true; S.btrees.dropped++; } }
  S.t.yards = Math.round(performance.now() - T0);
  // 2) lot fronts
  for (const LT of fab.lots) { if (!LT.yard) continue;
    const F = lotStreet(SI, LT); if (!F) continue; const ang = angAlong(F);
    const Y = LT.yard, V = LT.verge, H = LT.house; const t = (Y[0] - F.A[0]) * F.d[0] + (Y[1] - F.A[1]) * F.d[1]; // = loc(F, [Y[0], Y[1]])[0]
    // drive: from 0.1 m under the sidewalk's outer edge to the house face it leads to (ray along the street normal)
    // (the nearest hit of three rays across the drive's width, so no corner of it runs under the house; none: the house's front along n)
    let hit = null; { const hc = Math.cos(H[6]), hs = Math.sin(H[6]); for (let q = 0; q < 3; q++) { const w = q === 0 ? -Y[2] / 2 + 0.05 : q === 1 ? 0 : Y[2] / 2 - 0.05; const tw = t + w, o = LIN - 0.1; const h = rayXY(F.A[0] + F.d[0] * tw + F.n[0] * o, F.A[1] + F.d[1] * tw + F.n[1] * o, F.n[0], F.n[1], H, hc, hs); if (h !== null && (hit === null || h < hit)) hit = h; } }
    if (hit === null) { const [u, v] = axes(H[6]); const hl = loc(F, [H[0], H[2]]); hit = Math.max(1, hl[1] - (LIN - 0.1) - (Math.abs(dot(u, F.n)) * H[3] + Math.abs(dot(v, F.n)) * H[5]) / 2); }
    hit = Math.max(1.0, Math.min(hit, 14)); const yo = LIN - 0.1 + hit / 2; const yc = wpt(F, t, yo);
    Y[0] = yc[0]; Y[1] = yc[1]; Y[3] = hit + 0.1; Y[4] = ang; S.drives++;
    if (!LT.car && hit > 6 && PR.drives.length < 400) { const a = wpt(F, t, LIN - 0.1 + hit - 3.2); PR.drives.push([a[0], a[1], -F.n[0], -F.n[1], +(LIN - 0.1 + hit - 3.2).toFixed(2)]); }
    // apron: kerb line (o = LW) to 0.1 m under the sidewalk's inner edge, same width as laid
    const vc = wpt(F, t, LW + (LVG + 0.1) / 2); V[0] = vc[0]; V[1] = vc[1]; V[3] = LVG + 0.1; V[4] = ang; S.aprons++;
    // the car on it: same relative spot along the drive (fabric.js: 0.45 of the setback), square to it, facing kept
    if (LT.car) { const c = LT.car; const fwd = [Math.cos(c[2]), -Math.sin(c[2])]; const out = dot(fwd, F.n) >= 0 ? 1 : -1; const p = wpt(F, t, LIN - 0.1 + hit * 0.45);
      c[0] = p[0]; c[1] = p[1]; c[2] = Math.atan2(-F.n[1] * out, F.n[0] * out); S.cars++; }
    // front-yard tree: keep it in the front yard, clear of the sidewalk (o >= LIN + r + 0.3), the drive (|t - t_drive| >= 1.7 + r + 0.3) and the house
    if (LT.ftree) { const [kind, T] = LT.ftree; const r = trunkR(kind, T); const l = loc(F, [T[0], T[1]]); let tt = l[0], oo = l[1];
      const houseFace = (tq) => { const h = rayBody(wpt(F, tq, LIN), F.n, H); return h === null ? null : LIN + h; };
      const bad = (tq, oq) => { if (oq < LIN + r + 0.3) return true; if (Math.abs(tq - t) < Y[2] / 2 + r + 0.3) return true; const p = wpt(F, tq, oq); return circRect(p[0], p[1], r + 0.3, H[0], H[2], H[3], H[5], H[6]); };
      if (bad(tt, oo)) { let ok = false; const hf = houseFace(tt); const oMax = hf === null ? oo : hf - r - 0.3;
        const cand = []; for (const dt of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, 3, -3]) for (const oq of [Math.max(oo, LIN + r + 0.3), LIN + r + 0.3, LIN + r + 0.8]) cand.push([tt + (Math.abs(tt + dt - t) < Y[2] / 2 + r + 0.3 ? (tt >= t ? 1 : -1) * (Y[2] / 2 + r + 0.3 - Math.abs(tt - t)) + dt : dt), oq]);
        for (const [tq, oq] of cand) { if (oq > oMax + 1e-6 && hf !== null) continue; if (bad(tq, oq)) continue; const p = wpt(F, tq, oq); T[0] = p[0]; T[1] = p[1]; ok = true; break; }
        if (ok) S.trees.moved++; else { T.gone = true; S.trees.dropped++; } } }
    // canal dock: slide along its own axis so it straddles the bank (inner 1.2 m on the coping, the rest over the water)
    if (LT.dock && fab.canals) { const D = LT.dock; const [, v] = axes(D[4]); const out = dot(v, sub([D[0], D[1]], LT.front)) > 0 ? 1 : -1; const vn = [v[0] * out, v[1] * out];
      let best = null; for (const c of fab.canals) { const cd = c.d; const r0 = D[0] - c.A[0], r1 = D[1] - c.A[1]; const o = Math.abs(r0 * -cd[1] + r1 * cd[0]); const tt = r0 * cd[0] + r1 * cd[1]; if (c._L === undefined) c._L = Math.hypot(c.B[0] - c.A[0], c.B[1] - c.A[1]); if (tt < 0 || tt > c._L) continue; if (!best || o < best[0]) best = [o, c]; }
      if (best && best[0] < 20) { const [o, c] = best; const cs = Math.abs(vn[0] * -c.d[1] + vn[1] * c.d[0]) || 1; const want = c.hw - D[3] / 2 + 0.15; // inner edge 0.15 m onto the bank coping, the rest over the water
        const shift = (want - o) / cs; if (Math.abs(shift) > 0.05 && Math.abs(shift) < 6) { D[0] -= vn[0] * shift; D[1] -= vn[1] * shift; S.docks.moved++;
          if (LT.boat) { LT.boat[0] -= vn[0] * shift; LT.boat[2] -= vn[1] * shift; } } }
      else { D.gone = true; S.docks.dropped++; if (LT.boat) { LT.boat.gone = true; S.docks.boats++; } } } // a back row on the arterial (no canal behind it): no dock / boat
  }
  S.t.lots = Math.round(performance.now() - T0);
  // dropped records leave their chunk lists (before propfix / parkfix read them)
  { const gT = S.trees.dropped || S.btrees.dropped, gF = S.docks.dropped || S.pools.dropped, gB = S.docks.boats || S.hedges.dropped || S.walls.removed, gP = S.pools.dropped; const ng = (t) => !t.gone; // a_curbbake: only the lists that lost a record
    if (gT || gF || gB || gP) for (const ch of fab.chunks.values()) { if (gT) { ch.I.tree = ch.I.tree.filter(ng); ch.I.palm = ch.I.palm.filter(ng); } if (gF) ch.I.flat = ch.I.flat.filter(ng); if (gB) ch.I.body = ch.I.body.filter(ng); if (gP) ch.I.pool = ch.I.pool.filter(ng); } }
  if (!T.rec && T.n !== T.nb && typeof console !== 'undefined') console.warn('curbfix: tape length mismatch', T.n, T.nb);
  if (T.rec && (BAKE || opt.record)) S.bake = { hash: H0, ...T.encode() };
  S.tape = T.rec ? T.bits.length : T.n; S.ms = Math.round(performance.now() - T0);
  return S;
}
// a_curbbake: 2 x 32-bit FNV-style lanes over the float64 bits of every value fixCurbs reads (surface quads, building / flat /
// tree / pool / car records, the lot / street-piece / wall / canal bookkeeping fabric.js leaves); colours and unread fields left out
function hashCurb(fab) {
  // values go through a small rolling Float64Array (no large allocation: a big one can set off a full GC of the loaded page's heap);
  // need(n) folds the buffer's 32-bit halves into the two lanes when n more values would not fit
  const CAP = 4096; const buf = new Float64Array(CAP), u32 = new Uint32Array(buf.buffer); let k = 0, h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
  const flush = () => { const n = k * 2; for (let i = 0; i < n; i += 2) { h1 = Math.imul(h1 ^ u32[i], 16777619); h2 = Math.imul(h2 ^ u32[i + 1], 2246822519); } k = 0; };
  const need = (n) => { if (k + n > CAP) flush(); };
  const pt = (p) => { if (!p) { buf[k++] = -3; return; } buf[k++] = p[0]; buf[k++] = p[1]; };
  const accs = new Map(); let ai = 0;
  // chunk surfaces (x, z of every vertex: y is never read) and bodies; flats / trees / palms / pools / cars are read only through the lots (below)
  for (const ch of fab.chunks.values()) { for (const a of [ch.road, ch.walk, ch.plaza, ch.lot]) { accs.set(a, ai++); need(1); if (!a || !a.p) { buf[k++] = -2; continue; } const P = a.p, n = a.n * 3; buf[k++] = n;
      for (let i = 0; i < n; i += 3) { if (k + 2 > CAP) flush(); buf[k++] = P[i]; buf[k++] = P[i + 2]; } }
    const I = ch.I, L = I.body; need(6); buf[k++] = L.length; buf[k++] = I.flat.length; buf[k++] = I.tree.length; buf[k++] = I.palm.length; buf[k++] = I.pool.length; buf[k++] = I.car.length;
    for (let j = 0; j < L.length; j++) { const r = L[j]; if (k + 8 > CAP) flush(); buf[k++] = r[0]; buf[k++] = r[1]; buf[k++] = r[2]; buf[k++] = r[3]; buf[k++] = r[4]; buf[k++] = r[5]; buf[k++] = r[6]; buf[k++] = r[10]; } }
  // lots: the house / hedge / boat bodies are hashed above with their chunk lists (+ one value here); the flats (verge, yard, dock, deck),
  // pool, car and trees are read only through the lots, so they are hashed here in full (the fields the pass reads)
  const LT = fab.lots || []; need(1); buf[k++] = LT.length; const fl = (r) => { buf[k++] = r[0]; buf[k++] = r[1]; buf[k++] = r[2]; buf[k++] = r[3]; buf[k++] = r[4]; buf[k++] = r[8]; };
  for (let i = 0; i < LT.length; i++) { const L = LT[i]; if (k + 80 > CAP) flush(); buf[k++] = L.s; buf[k++] = L.canal ? 1 : 0; buf[k++] = L.front[0]; buf[k++] = L.front[1]; buf[k++] = L.dfront[0]; buf[k++] = L.dfront[1];
    const Q = L.quad; if (Q) for (let j = 0; j < Q.length; j++) { buf[k++] = Q[j][0]; buf[k++] = Q[j][1]; } else buf[k++] = -5;
    buf[k++] = (L.box ? 1 : 0) + (L.roof ? 2 : 0) + (L.car ? 4 : 0) + (L.hedge ? 8 : 0) + (L.dock ? 16 : 0) + (L.boat ? 32 : 0) + (L.deck ? 64 : 0) + (L.pool ? 128 : 0) + (L.verge ? 256 : 0) + (L.yard ? 512 : 0) + (L.ftree ? 1024 : 0) + (L.btree ? 2048 : 0);
    buf[k++] = L.house[0]; if (L.hedge) buf[k++] = L.hedge[0]; if (L.boat) buf[k++] = L.boat[0]; if (L.roof) { buf[k++] = L.roof[0]; buf[k++] = L.roof[2]; buf[k++] = L.roof[6]; }
    if (L.verge) fl(L.verge); if (L.yard) fl(L.yard); if (L.dock) fl(L.dock); if (L.deck) fl(L.deck);
    if (L.pool) { const r = L.pool; buf[k++] = r[0]; buf[k++] = r[1]; buf[k++] = r[2]; buf[k++] = r[3]; buf[k++] = r[4]; } if (L.car) { const r = L.car; buf[k++] = r[0]; buf[k++] = r[1]; buf[k++] = r[2]; }
    if (L.ftree) { const r = L.ftree[1]; buf[k++] = L.ftree[0] === 'palm' ? 1 : 0; buf[k++] = r[0]; buf[k++] = r[1]; buf[k++] = r[2]; }
    if (L.btree) { const r = L.btree[1]; buf[k++] = L.btree[0] === 'palm' ? 1 : 0; buf[k++] = r[0]; buf[k++] = r[1]; buf[k++] = r[2]; } }
  const SG = fab.locSegs || []; need(1); buf[k++] = SG.length; for (const s of SG) { const l0 = s.w[-1] || [], l1 = s.w[1] || []; need(9 + 2 * (l0.length + l1.length)); pt(s.A); pt(s.B); buf[k++] = s.run; buf[k++] = s.res ? 1 : 0;
    for (const l of [l0, l1]) { buf[k++] = l.length; for (const m of l) { buf[k++] = accs.has(m[0]) ? accs.get(m[0]) : -7; buf[k++] = m[1]; } } }
  const WL = fab.walls || []; need(1); buf[k++] = WL.length; for (const w of WL) { const r = w.rec; need(9); for (const i of [0, 1, 2, 3, 4, 5, 6, 10]) buf[k++] = r[i]; buf[k++] = w.box ? 1 : 0; }
  const CN = fab.canals || []; need(1); buf[k++] = CN.length; for (const c of CN) { need(7 + 3 * (c.br || []).length); pt(c.A); pt(c.B); buf[k++] = c.hw; buf[k++] = (c.br || []).length; for (const b of c.br || []) for (const v of b) buf[k++] = v; }
  const RC = fab.resCells || []; need(1); buf[k++] = RC.length; for (const q of RC) { need(8); for (const p of q) pt(p); }
  flush();
  return ((h1 >>> 0).toString(16).padStart(8, '0')) + ((h2 >>> 0).toString(16).padStart(8, '0'));
}
// city.js: census before / after on request, the fix always; then the bookkeeping is freed
const OUTH = typeof location !== 'undefined' && /[?&]curbhash/.test(location.search);
// every value the pass can leave behind (chunk surfaces, every record list, the pending collider edits, the probe spots): full vs replay check
export function curbOutHash(fab) { let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0; const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const num = (v) => { f64[0] = typeof v === 'number' ? v : -9; h1 = Math.imul(h1 ^ u32[0], 16777619); h2 = Math.imul(h2 ^ u32[1], 2246822519); };
  for (const ch of fab.chunks.values()) { for (const a of [ch.road, ch.walk, ch.plaza, ch.lot]) { num(a.n); for (const v of a.p) num(v); for (const v of a.uv) num(v); }
    for (const k of Object.keys(ch.I).sort()) { num(ch.I[k].length); for (const r of ch.I[k]) { num(r.length); for (const v of r) num(v); } } }
  for (const e of fab.curbCol || []) { const b = e.box; num(b ? 1 : 0); if (b) { num(b.minX); num(b.minZ); num(b.maxX); num(b.maxZ); } for (const a of e.adds) for (const v of a) num(v); }
  const P = fab.curbProbe || {}; for (const k of Object.keys(P).sort()) { num(P[k].length); for (const r of P[k]) for (const v of r.flat ? r.flat(2) : []) num(v); }
  return ((h1 >>> 0).toString(16).padStart(8, '0')) + ((h2 >>> 0).toString(16).padStart(8, '0')); }
export function curbPass(fab, groundH) { const R = {}; if (AUDIT) R.pre = auditCurbs(fab, groundH); R.fix = fixCurbs(fab); if (OUTH) R.out = curbOutHash(fab); if (AUDIT) R.post = auditCurbs(fab, groundH); fab.lots = null; fab.locSegs = null; return R; }
export { CATS as CURB_CATS, hashCurb as _hashCurb, segIndex as _segIndex, nearestSeg as _nearestSeg };
