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
  for (const s of l) { const r = sub(p, s.A); const t = Math.max(0, Math.min(s.L, dot(r, s.d))); const dd = Math.hypot(r[0] - s.d[0] * t, r[1] - s.d[1] * t); if (dd < bd) { bd = dd; best = s; } }
  return best; }
// street-relative coordinates of a point: along t, across o (signed toward the lot side sg)
const frameOf = (s, sg) => ({ A: s.A, d: s.d, n: [s.n[0] * sg, s.n[1] * sg], L: s.L });
const loc = (F, p) => { const r = sub(p, F.A); return [dot(r, F.d), dot(r, F.n)]; };
const wpt = (F, t, o) => [F.A[0] + F.d[0] * t + F.n[0] * o, F.A[1] + F.d[1] * t + F.n[1] * o];
const angAlong = (F) => Math.atan2(-F.d[1], F.d[0]); // record angle whose local +x runs along the street (local +z = ±n)
// ray (origin O, unit dir n) into an oriented body record: entry distance or null
function rayBody(O, n, b) { const [u, v] = axes(b[6]); const r = sub(O, [b[0], b[2]]); const ox = dot(r, u), oz = dot(r, v), dx = dot(n, u), dz = dot(n, v); const hx = b[3] / 2, hz = b[5] / 2;
  let t0 = -Infinity, t1 = Infinity; for (const [o, dd, h] of [[ox, dx, hx], [oz, dz, hz]]) { if (Math.abs(dd) < 1e-9) { if (Math.abs(o) > h) return null; continue; } let a = (-h - o) / dd, c = (h - o) / dd; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
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
function walkEnds(m, s) { const P = m[2]; const out = []; const dir = (i, j) => { const e = sub(P[j], P[i]); const l = Math.hypot(e[0], e[1]) || 1; return [e[0] / l, e[1] / l]; };
  if (!s.jA) out.push({ k: [0, 3], v: [P[0], P[3]], e: [dir(0, 1), dir(3, 2)], c: [s.A[0] - s.d[0] * 0.6, s.A[1] - s.d[1] * 0.6] }); if (!s.jB) out.push({ k: [1, 2], v: [P[1], P[2]], e: [dir(1, 0), dir(2, 3)], c: [s.B[0] + s.d[0] * 0.6, s.B[1] + s.d[1] * 0.6] }); return out; }
// 0 fine, 1 the end stands on a carriageway (a corner 0.15 m inside is on the road), 2 short (0.3 m beyond a corner: no road / sidewalk / lot)
function endState(S, end, m) { let road = 0, shortN = 0; for (let i = 0; i < 2; i++) { const v = end.v[i], e = end.e[i];
    if (S.onRoad(v[0] + e[0] * 0.15, v[1] + e[1] * 0.15)) road++; else { const x = v[0] - e[0] * 0.3, z = v[1] - e[1] * 0.3; if (!S.onRoad(x, z) && !S.onWalkX(x, z, m) && !S.onLot(x, z)) shortN++; } }
  if (!road && shortN && !S.onRoad(end.c[0], end.c[1]) && !S.onWalk(end.c[0], end.c[1])) shortN = 0; // a dead-end street: the sidewalk stops where the carriageway stops
  return road ? 1 : shortN ? 2 : 0; }

// ---------------------------------------------------------------------------------------------------------------- census ----
const CATS = { apronRoad: '车道口压行车道', apronShort: '车道口离路缘有缝', apronGap: '车道口与人行道之间有缝', driveGap: '车道与人行道之间露草地', drivePoke: '车道穿过人行道伸进绿化带',
  driveSkew: '车道与街道法线偏角>3°', driveBreak: '车道口与车道错位>0.4m', houseWalk: '房屋压人行道/路面', hedgeWalk: '树篱压人行道/路面', wallWalk: '围墙压人行道/路面', boatWalk: '船压人行道', treeWalk: '前院树压人行道/路面',
  treeDrive: '前院树压车道', dockHang: '码头悬空(内沿在水上)', dockShort: '码头够不到水', jointGap: '弯街人行道接缝楔形缝>0.1m', walkRoad: '人行道端头压行车道', walkShort: '人行道端头够不到路缘/相邻人行道', kerbStep: '路缘高差需坡道' };
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
  // kerb: fabric sidewalks are flat plates 0.03 m over groundH 0 (no kerb face), so no ramp is ever needed; counted from groundH
  if (groundH) { let st = 0; for (let k = 0; k < SI.segs.length; k += 97) { const s = SI.segs[k]; const p = wpt(frameOf(s, 1), s.L / 2, LW - 0.3), q = wpt(frameOf(s, 1), s.L / 2, LW + LVG + 0.9); const a = groundH(p[0], p[1]), b = groundH(q[0], q[1]); if (a !== undefined && b !== undefined && Math.abs(b + 0.03 - a) > 0.05) st++; } C.kerbStep = st; }
  return { C, ex, lots: lots.length, drives: nDrive, segs: SI.segs.length, joints: nJoint, ms: Math.round(performance.now() - T0) };
}

// ---------------------------------------------------------------------------------------------------------------- fix ----
// move corner k of a sidewalk quad (fabric Acc vertex order: Acc.quad wrote P in order o; uv = world xz as laid)
function setV(m, k, p) { const [acc, v, P] = m; P[k] = p; const cr = (P[1][1] - P[0][1]) * (P[3][0] - P[0][0]) - (P[1][0] - P[0][0]) * (P[3][1] - P[0][1]); const o = cr < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
  for (let j = 0; j < 4; j++) { const q = P[o[j]]; acc.p[(v + j) * 3] = q[0]; acc.p[(v + j) * 3 + 2] = q[1]; acc.uv[(v + j) * 2] = q[0]; acc.uv[(v + j) * 2 + 1] = q[1]; } }
// pending collider edits (houses moved, walls cut): applied by applyCurbColliders after every layer is placed (main.js), so the
// backlot / later free-space checks see exactly the boxes they always saw
const pendCol = (fab, box, adds) => { (fab.curbCol = fab.curbCol || []).push({ box, adds }); };
export function applyCurbColliders(city) { const fab = city.fabric || (city.region && city.region.fabric); const L = (fab && fab.curbCol) || []; const col = city.col; let rm = 0, add = 0;
  for (const e of L) { if (e.box) { col.remove(e.box); rm++; } for (const [cx, cz, ang, hl, hw, h] of e.adds) { col.addOBB(cx, cz, Math.cos(ang), -Math.sin(ang), hl, hw, h, 'bld'); add++; } }
  if (fab) fab.curbCol = null; return { removed: rm, added: add }; }
export function fixCurbs(fab) {
  const T0 = performance.now(); const S = { drives: 0, aprons: 0, cars: 0, trees: { moved: 0, dropped: 0 }, docks: { moved: 0, dropped: 0, boats: 0 }, joints: 0 };
  if (!fab || !fab.lots) return S;
  const SI = segIndex(fab); const PR = fab.curbProbe = { walks: [], drives: [], mouths: [] }; // spots for the browser spot checks (small)
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
  S.t = S.t || {}; S.t.miter = Math.round(performance.now() - T0);
  const SF = surfaces(fab); const BG = bodyGrid(fab);
  // 1b) free sidewalk ends: each corner slides along its long edge onto the kerb line (off a carriageway it stood on, or out to the
  //     carriageway / sidewalk / lot it fell short of: ≤ 5 m back, ≤ 6 m out)
  S.t = S.t || {}; S.t.surf = Math.round(performance.now() - T0);
  S.walkEnds = { trimmed: 0, extended: 0 };
  for (const s of SI.segs) for (const sg of [-1, 1]) for (const m of s.w[sg] || []) for (const end of walkEnds(m, s)) { const st = endState(SF, end, m); if (!st) continue;
    for (let i = 0; i < 2; i++) { const v = end.v[i], e = end.e[i]; let p = null;
      // first hit of a 0.05 m march (a 0.5 m coarse march first, then 0.05 m steps back from it: same answer for strips wider than 0.5 m)
      const first = (f, max) => { let D = -1; for (let d = 0.5; d <= max + 0.5001; d += 0.5) if (f(Math.min(d, max))) { D = Math.min(d, max); break; } if (D < 0) return -1; let r = D; for (let d = Math.max(0.05, D - 0.5); d <= D + 1e-6; d += 0.05) if (f(d)) { r = d; break; } return r; };
      if (st === 1) { if (SF.onRoad(v[0] + e[0] * 0.15, v[1] + e[1] * 0.15)) { const d = first((d) => !SF.onRoad(v[0] + e[0] * (d + 0.1), v[1] + e[1] * (d + 0.1)), 5); if (d > 0) p = [v[0] + e[0] * d, v[1] + e[1] * d]; } }
      else { const d = first((d) => { const x = v[0] - e[0] * d, z = v[1] - e[1] * d; return SF.onRoad(x, z) || SF.onWalkX(x, z, m) || SF.onLot(x, z); }, 6); if (d > 0) p = [v[0] - e[0] * (d + 0.03), v[1] - e[1] * (d + 0.03)]; }
      if (p) { setV(m, end.k[i], p); end.v[i] = p; } }
    SF.reWalk(m);
    S.walkEnds[st === 1 ? 'trimmed' : 'extended']++; }
  S.t.surf2a = Math.round(performance.now() - T0);
  // 1c) houses on a sidewalk / carriageway: the smallest shift along their own axes (≤ 2.5 m) that clears it and every other building
  S.t = S.t || {}; S.t.surf2 = Math.round(performance.now() - T0);
  S.houses = { moved: 0, kept: 0 };
  for (const LT of fab.lots) { const H = LT.house; if (!bodyTouchesPaved(SF, H, 0.1)) continue; const [u, v] = axes(H[6]); const x0 = H[0], z0 = H[2]; let done = false;
    for (let d = 0.1; d <= 2.5001 && !done; d += 0.1) for (const dir of [v, [-v[0], -v[1]], u, [-u[0], -u[1]]]) { H[0] = x0 + dir[0] * d; H[2] = z0 + dir[1] * d;
      if (bodyTouchesPaved(SF, H, 0.1)) continue; let hit = false; for (const b of BG.near(H[0], H[2], Math.hypot(H[3], H[5]) / 2 + 2)) if (b !== H && b[10] !== 6 && obbOverlap(H, b, 0.2)) { hit = true; break; } if (hit) continue;
      done = true; break; }
    if (!done) { H[0] = x0; H[2] = z0; S.houses.kept++; continue; }
    if (LT.roof) { LT.roof[0] += H[0] - x0; LT.roof[2] += H[2] - z0; } if (LT.box) pendCol(fab, LT.box, [[H[0], H[2], H[6], H[3] / 2, H[5] / 2, H[1] + H[4]]]); S.houses.moved++; }
  // 1d) back hedges (no collider) on a sidewalk: pulled into the lot along their own depth axis (≤ 1.5 m), shortened if still needed, else dropped
  S.t = S.t || {}; S.t.houses = Math.round(performance.now() - T0);
  S.hedges = { moved: 0, shortened: 0, dropped: 0 };
  for (const LT of fab.lots) { const Hd = LT.hedge; if (!Hd || !bodyTouchesPaved(SF, Hd, 0.02)) continue; const [, v] = axes(Hd[6]); const toIn = dot(v, sub([LT.house[0], LT.house[2]], [Hd[0], Hd[2]])) > 0 ? v : [-v[0], -v[1]];
    const x0 = Hd[0], z0 = Hd[2], w0 = Hd[3]; let ok = false;
    for (const wf of [1, 0.9, 0.8, 0.7, 0.6]) { Hd[3] = w0 * wf; for (let d = 0; d <= 1.5001; d += 0.05) { Hd[0] = x0 + toIn[0] * d; Hd[2] = z0 + toIn[1] * d; if (!bodyTouchesPaved(SF, Hd, 0.02)) { ok = true; break; } } if (ok) { S.hedges[wf === 1 ? 'moved' : 'shortened']++; break; } }
    if (!ok) { Hd[0] = x0; Hd[2] = z0; Hd[3] = w0; Hd.gone = true; S.hedges.dropped++; } }
  // 1e) yard walls along the arterials (fabric.js wallRun, 2.1 m, collider): cut where a street / its sidewalks pass (0.3 m clear), pieces < 2 m dropped
  S.t = S.t || {}; S.t.hedges = Math.round(performance.now() - T0);
  S.walls = { cut: 0, pieces: 0, removed: 0 };
  for (const W of fab.walls || []) { const b = W.rec; if (!bodyTouchesPaved(SF, b, 0.02)) continue; const [u, v] = axes(b[6]); const hw = b[3] / 2; const hit = [];
    for (let x = -hw; x <= hw + 1e-6; x += 0.1) { let h = false; for (const dz of [-b[5] / 2 - 0.3, 0, b[5] / 2 + 0.3]) { const px = b[0] + u[0] * x + v[0] * dz, pz = b[2] + u[1] * x + v[1] * dz; if (SF.onWalk(px, pz) || SF.onRoad(px, pz)) { h = true; break; } } hit.push(h); }
    const free = hit.map((_, i) => { for (let j = Math.max(0, i - 3); j <= Math.min(hit.length - 1, i + 3); j++) if (hit[j]) return false; return true; }); // 0.3 m clear along the wall too
    const pieces = []; let st = -1; for (let i = 0; i <= free.length; i++) { if (i < free.length && free[i]) { if (st < 0) st = i; } else if (st >= 0) { const a = -hw + st * 0.1, c = Math.min(hw, -hw + (i - 1) * 0.1); if (c - a >= 2) pieces.push([a, c]); st = -1; } }
    const adds = []; const b0 = b.slice(); const recs = pieces.map(([a, c], k) => { const r = k === 0 ? b : b0.slice(); const m = (a + c) / 2; r[0] = b0[0] + u[0] * m; r[2] = b0[2] + u[1] * m; r[3] = c - a; adds.push([r[0], r[2], r[6], r[3] / 2, r[5] / 2, r[1] + r[4]]); return r; });
    // the first piece keeps the record (computed from the original centre before it changes)
    if (!recs.length) { b.gone = true; S.walls.removed++; } else for (let k = 1; k < recs.length; k++) W.list.push(recs[k]);
    pendCol(fab, W.box, adds); S.walls.cut++; S.walls.pieces += recs.length;
    { const ends = [-hw, ...pieces.flat(), hw]; for (let k = 0; k + 1 < ends.length; k += 2) { const a = ends[k], c = ends[k + 1]; if (c - a > 6) PR.mouths.push([b0[0] + u[0] * (a + c) / 2, b0[2] + u[1] * (a + c) / 2, v[0], v[1]]); } } }
  S.t = S.t || {}; S.t.walls = Math.round(performance.now() - T0);
  // 2) lot fronts
  for (const LT of fab.lots) { if (!LT.yard) continue;
    const s = nearestSeg(SI, LT.dfront); if (!s) continue; const sg = Math.sign(dot(sub(LT.dfront, s.A), s.n)) || 1; const F = frameOf(s, sg); const ang = angAlong(F);
    const Y = LT.yard, V = LT.verge, H = LT.house; const t = loc(F, [Y[0], Y[1]])[0];
    // drive: from 0.1 m under the sidewalk's outer edge to the house face it leads to (ray along the street normal)
    // (the nearest hit of three rays across the drive's width, so no corner of it runs under the house; none: the house's front along n)
    let hit = null; for (const w of [-Y[2] / 2 + 0.05, 0, Y[2] / 2 - 0.05]) { const h = rayBody(wpt(F, t + w, LIN - 0.1), F.n, H); if (h !== null && (hit === null || h < hit)) hit = h; }
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
      let best = null; for (const c of fab.canals) { const cd = c.d; const r = sub([D[0], D[1]], c.A); const o = Math.abs(r[0] * -cd[1] + r[1] * cd[0]); const tt = dot(r, cd); if (tt < 0 || tt > Math.hypot(c.B[0] - c.A[0], c.B[1] - c.A[1])) continue; if (!best || o < best[0]) best = [o, c]; }
      if (best && best[0] < 20) { const [o, c] = best; const cs = Math.abs(vn[0] * -c.d[1] + vn[1] * c.d[0]) || 1; const want = c.hw - D[3] / 2 + 0.15; // inner edge 0.15 m onto the bank coping, the rest over the water
        const shift = (want - o) / cs; if (Math.abs(shift) > 0.05 && Math.abs(shift) < 6) { D[0] -= vn[0] * shift; D[1] -= vn[1] * shift; S.docks.moved++;
          if (LT.boat) { LT.boat[0] -= vn[0] * shift; LT.boat[2] -= vn[1] * shift; } } }
      else { D.gone = true; S.docks.dropped++; if (LT.boat) { LT.boat.gone = true; S.docks.boats++; } } } // a back row on the arterial (no canal behind it): no dock / boat
  }
  S.t = S.t || {}; S.t.lots = Math.round(performance.now() - T0);
  // dropped trees leave their chunk lists (before propfix / parkfix read them)
  if (S.trees.dropped || S.docks.dropped || S.hedges.dropped || S.walls.removed) for (const ch of fab.chunks.values()) { ch.I.tree = ch.I.tree.filter((t) => !t.gone); ch.I.palm = ch.I.palm.filter((t) => !t.gone); ch.I.flat = ch.I.flat.filter((t) => !t.gone); ch.I.body = ch.I.body.filter((t) => !t.gone); }
  S.ms = Math.round(performance.now() - T0);
  return S;
}
// city.js: census before / after on request, the fix always; then the bookkeeping is freed
export function curbPass(fab, groundH) { const R = {}; if (AUDIT) R.pre = auditCurbs(fab, groundH); R.fix = fixCurbs(fab); if (AUDIT) R.post = auditCurbs(fab, groundH); fab.lots = null; fab.locSegs = null; return R; }
export { CATS as CURB_CATS };
