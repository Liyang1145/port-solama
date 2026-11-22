// a_parking (map 索拉纳港 only): parked-car census + fix-up, run after placement (like colfix / propfix: no builder draws another
// random number, every layout and RNG stream stays as before; this pass only moves or drops finished records).
//  1) mainland fabric (fabric.js I.car: driveway cars + stall rows of strip-mall / apartment / big-box / park lots). The chunk
//     records are freed by attachFabric, so this runs just before it (city.js region.attach) and leaves a read-only snapshot
//     fab.parked = Float32Array [x, z, ang, kind] (kind 0 lot stall, 1 driveway, 2 other) for later audits.
//     Rules: a parked car stands wholly on a stall lot or a driveway (not on the carriageway, a sidewalk, grass or water), clear
//     of buildings / walls / hedges / trailers / parapets, tree / palm / lamp trunks and the other cars, square to the
//     painted stall lines (≤ 5°) and centred in a stall (≤ 0.3 m along the row, ≤ 0.45 m in depth), on level ground (fabric surfaces are y 0; groundH within 0.1 m).
//     Fix: a lot car is snapped into the nearest painted stall (centred, square to the separators) or the nearest free one
//     beside it in the row (≤ 3 stalls); a driveway car slides along its own axis (≤ 2 m); otherwise dropped. Fabric cars have no colliders (nothing to sync).
//  2) 海潮大道 (Tideline Drive, x 290) west kerb lane: the parallel-parking slots of props.js (city.parking, spawned by game.js).
//     Florida rules (F.S. 316.1945) + the bus-stop sign the map shows (公交车站前后 30 米): a slot faces the traffic of its lane
//     (west lane runs +z -> yaw 0; half of them faced -z), not within 20 ft (6.1 m) of a crosswalk at an intersection (zebra
//     1.0–4.2 m from the cross street's kerb line), not within 30 ft (9.1 m) of the signal mast on the approach, not within
//     15 ft (4.6 m) of a hydrant, not within 30 m of a bus stop, not across a lane / driveway mouth or on a bridge.
//     Fix: each kerb run is re-packed (slot order and fill draws kept, 6.8 m pitch as laid out, first legal spot after the
//     previous slot); slots that no longer fit are removed. Game-spawned cars carry their
//     own dynamic collider, so no static box to sync.
const AUDIT = typeof location !== 'undefined' && /[?&]parkaudit/.test(location.search); // full pre / post tallies + diagnostics only on request (load time)
const CAR_HL = 2.2, CAR_HW = 0.89; // fabric car box (GEO.car 4.4 × 1.78)
const DEG5 = Math.sin((5 * Math.PI) / 180);
const CATS = ['road', 'walk', 'offlot', 'body', 'trunk', 'car', 'water', 'ground', 'angle', 'stall'];

// ---- 2D helpers -------------------------------------------------------------------------------------------------------------
const obbOf = (x, z, ang, hl = CAR_HL, hw = CAR_HW) => ({ cx: x, cz: z, ux: Math.cos(ang), uz: -Math.sin(ang), hl, hw }); // local +x = (cos, -sin)
function corners(o, s = 0) { const vx = -o.uz, vz = o.ux; const a = o.hl - s, b = o.hw - s; return [[o.cx + o.ux * a + vx * b, o.cz + o.uz * a + vz * b], [o.cx + o.ux * a - vx * b, o.cz + o.uz * a - vz * b], [o.cx - o.ux * a - vx * b, o.cz - o.uz * a - vz * b], [o.cx - o.ux * a + vx * b, o.cz - o.uz * a + vz * b]]; }
function samples(o, s) { const c = corners(o, s); const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return [[o.cx, o.cz], ...c, m(c[0], c[1]), m(c[1], c[2]), m(c[2], c[3]), m(c[3], c[0])]; }
function obbHit(A, B, pad = 0) { // separating axis, 2D boxes
  for (const [ax, az] of [[A.ux, A.uz], [-A.uz, A.ux], [B.ux, B.uz], [-B.uz, B.ux]]) {
    const ra = A.hl * Math.abs(A.ux * ax + A.uz * az) + A.hw * Math.abs(-A.uz * ax + A.ux * az);
    const rb = B.hl * Math.abs(B.ux * ax + B.uz * az) + B.hw * Math.abs(-B.uz * ax + B.ux * az);
    if (Math.abs((B.cx - A.cx) * ax + (B.cz - A.cz) * az) >= ra + rb + pad) return false; }
  return true;
}
function circHit(o, x, z, r) { const dx = x - o.cx, dz = z - o.cz; const a = dx * o.ux + dz * o.uz, b = -dx * o.uz + dz * o.ux; const qa = Math.max(0, Math.abs(a) - o.hl), qb = Math.max(0, Math.abs(b) - o.hw); return qa * qa + qb * qb < r * r; }
const triIn = (px, pz, a, b, c) => { const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (pz - b[1]), d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (pz - c[1]), d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pz - a[1]);
  return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); };
const quadIn = (px, pz, q) => triIn(px, pz, q[0], q[1], q[2]) || triIn(px, pz, q[0], q[2], q[3]);

// uniform grid of items with a bbox
class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); this.gen = 0; }
  add(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) { const key = i * 100003 + k; let l = this.m.get(key); if (!l) this.m.set(key, l = []); l.push(it); } }
  remove(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) { const l = this.m.get(i * 100003 + k); if (l) { const j = l.indexOf(it); if (j >= 0) l.splice(j, 1); } } }
  near(x, z, r, out) { out.length = 0; const c = this.c; const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), k0 = Math.floor((z - r) / c), k1 = Math.floor((z + r) / c);
    if (i0 === i1 && k0 === k1) { const l = this.m.get(i0 * 100003 + k0); if (l) for (const it of l) out.push(it); return out; }
    const g = ++this.gen; for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const l = this.m.get(i * 100003 + k); if (l) for (const it of l) if (!out.includes(it)) out.push(it); } void g; return out; }
}
const quadsOf = (acc, mode) => { const out = []; if (!acc || !acc.p) return out; const P = acc.p, X = acc.x, UV = acc.uv; for (let v = 0; v + 3 < acc.n; v += 4) { if (mode !== undefined && X && X[v * 4] !== mode) continue; const q = []; q.uv = []; q.mode = X ? X[v * 4] : -1; for (let k = 0; k < 4; k++) { q.push([P[(v + k) * 3], P[(v + k) * 3 + 2]]); q.uv.push([UV[(v + k) * 2], UV[(v + k) * 2 + 1]]); } out.push(q); } return out; };
// affine (per triangle, as the GPU interpolates it) world <-> uv of a lot quad; tri 0 = (0,1,2), tri 1 = (0,2,3)
const TRI = [[0, 1, 2], [0, 2, 3]];
function bary(p, a, b, c) { const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) return null; const l1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d, l2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d; return [l1, l2, 1 - l1 - l2]; }
const inB = (l, e = 1e-6) => l && l[0] >= -e && l[1] >= -e && l[2] >= -e;
function toUV(q, x, z) { for (const t of TRI) { const l = bary([x, z], q[t[0]], q[t[1]], q[t[2]]); if (inB(l)) return { t, u: l[0] * q.uv[t[0]][0] + l[1] * q.uv[t[1]][0] + l[2] * q.uv[t[2]][0], v: l[0] * q.uv[t[0]][1] + l[1] * q.uv[t[1]][1] + l[2] * q.uv[t[2]][1] }; } return null; }
function toW(q, u, v) { for (const t of TRI) { const l = bary([u, v], q.uv[t[0]], q.uv[t[1]], q.uv[t[2]]); if (inB(l)) return [l[0] * q[t[0]][0] + l[1] * q[t[1]][0] + l[2] * q[t[2]][0], l[0] * q[t[0]][1] + l[1] * q[t[1]][1] + l[2] * q[t[2]][1]]; } return null; }
function isoU(q, t) { // world direction along which u stays constant (the painted stall separators) in triangle t
  const [A, B, C] = t.map((i) => q[i]), [a, b, c] = t.map((i) => q.uv[i][0]); const e1 = [B[0] - A[0], B[1] - A[1]], e2 = [C[0] - A[0], C[1] - A[1]], du1 = b - a, du2 = c - a;
  const det = e1[0] * e2[1] - e1[1] * e2[0]; if (Math.abs(det) < 1e-12) return null; const gx = (du1 * e2[1] - du2 * e1[1]) / det, gz = (du2 * e1[0] - du1 * e2[0]) / det; const l = Math.hypot(gx, gz) || 1; return [-gz / l, gx / l]; }
const STALL_V = [3.25, 15.1]; // stall band centres in each 18 m module (bands 0.6–5.9, 12.4–17.8: fabric.js lot shader)
const stallAt = (u, v) => { const m = Math.floor(v / 18) * 18; const vb = STALL_V.map((c) => m + c).concat([m - 18 + 15.1, m + 18 + 3.25]).reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p)); return [Math.floor(u / 2.7) * 2.7 + 1.35, vb]; };
const bbox = (pts) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; };

// ---- 1) mainland fabric cars ------------------------------------------------------------------------------------------------
export function fixFabricCars(fab, groundH) {
  const T0 = performance.now(); const S = { pre: {}, post: {}, moved: 0, dropped: 0, byCat: {}, ex: {} }; if (!fab || !fab.chunks) return S;
  const gRoad = new Grid(16), gWalk = new Grid(16), gLot = new Grid(16), gFlat = new Grid(16), gBody = new Grid(16), gTrunk = new Grid(8), gCar = new Grid(8);
  const cars = [];
  for (const ch of fab.chunks.values()) {
    for (const q of quadsOf(ch.road)) gRoad.add(q, ...bbox(q));
    for (const q of quadsOf(ch.walk)) gWalk.add(q, ...bbox(q));
    for (const q of quadsOf(ch.plaza)) gWalk.add(q, ...bbox(q));
    for (const q of quadsOf(ch.lot, 0)) { q.lot = true; gLot.add(q, ...bbox(q)); }
    for (const q of quadsOf(ch.lot, 2)) { q.lot = true; gLot.add(q, ...bbox(q)); }
    const I = ch.I;
    for (const f of I.flat) { if (f[8] > 0.02) continue; const o = obbOf(f[0], f[1], f[4], f[2] / 2, f[3] / 2); o.flat = true; const c = corners(o); gFlat.add(o, ...bbox(c)); } // driveways / pads (decks at 0.35, pool decks 0.016 excluded)
    for (const b of I.body) { if (b[1] + b[4] < 0.1 || b[1] > 1.5) continue; const o = obbOf(b[0], b[2], b[6], b[3] / 2, b[5] / 2); o.kind = b[10]; gBody.add(o, ...bbox(corners(o))); }
    for (const t of I.tree) { const r = 0.24 * (0.75 + t[2] * 0.12); gTrunk.add([t[0], t[1], r, 'tree'], t[0] - r, t[1] - r, t[0] + r, t[1] + r); }
    for (const p of I.palm) { const r = 0.24 * (p[2] / 10) + 0.05; gTrunk.add([p[0], p[1], r, 'palm'], p[0] - r, p[1] - r, p[0] + r, p[1] + r); }
    for (const l of I.lamp) gTrunk.add([l[0], l[1], 0.12, 'lamp'], l[0] - 0.12, l[1] - 0.12, l[0] + 0.12, l[1] + 0.12);
    for (const p of I.car) { const it = { p, ch, o: obbOf(p[0], p[1], p[2]), alive: true }; cars.push(it); gCar.add(it, ...bbox(corners(it.o))); }
  }
  S.tGrid = Math.round(performance.now() - T0);
  const tmp = [];
  const inAny = (g, x, z) => { for (const q of g.near(x, z, 0, tmp)) if (quadIn(x, z, q)) return q; return null; };
  const inFlat = (x, z) => { for (const o of gFlat.near(x, z, 0, tmp)) { const dx = x - o.cx, dz = z - o.cz; if (Math.abs(dx * o.ux + dz * o.uz) <= o.hl + 0.05 && Math.abs(-dx * o.uz + dz * o.ux) <= o.hw + 0.05) return o; } return null; };
  // classify one car box (it excluded from the car-car test); returns the set of failed categories
  const check = (o, it) => {
    const bad = new Set(); const sp = samples(o, 0.12); const R0 = o.hl + 0.2;
    const LR = gRoad.near(o.cx, o.cz, R0, []), LW = gWalk.near(o.cx, o.cz, R0, []), LL = gLot.near(o.cx, o.cz, R0, []), LF = gFlat.near(o.cx, o.cz, R0, []);
    const inL = (L, x, z) => { for (const q of L) if (quadIn(x, z, q)) return q; return null; };
    const inF = (x, z) => { for (const f of LF) { const dx = x - f.cx, dz = z - f.cz; if (Math.abs(dx * f.ux + dz * f.uz) <= f.hl + 0.05 && Math.abs(-dx * f.uz + dz * f.ux) <= f.hw + 0.05) return f; } return null; };
    for (const [x, z] of sp) { if (LR.length && inL(LR, x, z)) bad.add('road'); if (LW.length && inL(LW, x, z)) bad.add('walk'); }
    let lotQ = null, onFlat = 0; for (const [x, z] of sp) { const q = inL(LL, x, z); if (q) lotQ = lotQ || q; else if (inF(x, z)) onFlat++; else { bad.add('offlot'); } }
    const r = o.hl + 0.5; for (const b of gBody.near(o.cx, o.cz, r, tmp)) if (obbHit(o, b, -0.05)) { bad.add('body'); break; }
    for (const t of gTrunk.near(o.cx, o.cz, r, tmp)) if (circHit(o, t[0], t[1], t[2])) { bad.add('trunk'); break; }
    for (const c of gCar.near(o.cx, o.cz, r, tmp)) if (c !== it && c.alive && obbHit(o, c.o, -0.05)) { bad.add('car'); break; }
    let wet = false, off = 0; for (let j = 0; j < 5; j++) { const [x, z] = sp[j]; const h = groundH(x, z); if (h === undefined || h <= -0.95) wet = true; else off = Math.max(off, Math.abs(h)); }
    if (wet) bad.add('water'); else if (off > 0.1) bad.add('ground');
    const cq = inL(LL, o.cx, o.cz); o.stall = null;
    if (cq && cq.mode === 0) { const w = toUV(cq, o.cx, o.cz), d = w && isoU(cq, w.t); // square to the painted stall lines and centred in a stall
      if (w && d) { if (Math.abs(o.ux * d[1] - o.uz * d[0]) > DEG5) bad.add('angle'); const [su, sv] = stallAt(w.u, w.v); o.stall = { q: cq, su, sv, d };
        if (Math.abs(w.u - su) > 0.3 || Math.abs(w.v - sv) > 0.45) bad.add('stall'); } }
    o.kind = lotQ ? 0 : onFlat ? 1 : 2; return bad;
  };
  const tally = (T) => { const o = { n: 0 }; for (const k of CATS) o[k] = 0; let any = 0; for (const it of cars) { if (!it.alive) continue; o.n++; const b = check(it.o, it); if (b.size) any++; for (const k of b) o[k]++; } o.any = any; return o; };
  if (AUDIT) S.pre = tally();
  if (AUDIT) { const D = { byKind: {}, angDeg: [0, 0, 0, 0, 0], du: [0, 0, 0, 0], dv: [0, 0, 0, 0], bodyKind: {} }; // pre-fix diagnostics: category x kind (0 lot 1 driveway 2 other), stall-line angle (<2,2-5,5-10,10-20,>20 deg), stall offsets (<.15,<.3,<.6,>=.6 m)
    for (const it of cars) { const b = check(it.o, it); for (const k of b) { const e = D.byKind[k] || (D.byKind[k] = [0, 0, 0]); e[it.o.kind]++; }
      const st = it.o.stall; if (st) { const w = toUV(st.q, it.o.cx, it.o.cz); const a = Math.asin(Math.min(1, Math.abs(it.o.ux * st.d[1] - it.o.uz * st.d[0]))) * 57.3; D.angDeg[a < 2 ? 0 : a < 5 ? 1 : a < 10 ? 2 : a < 20 ? 3 : 4]++;
        const bin = (x) => (x < 0.15 ? 0 : x < 0.3 ? 1 : x < 0.6 ? 2 : 3); D.du[bin(Math.abs(w.u - st.su))]++; D.dv[bin(Math.abs(w.v - st.sv))]++; }
      if (b.has('body')) for (const bo of gBody.near(it.o.cx, it.o.cz, 12, tmp)) if (obbHit(it.o, bo, -0.05)) { D.bodyKind[bo.kind] = (D.bodyKind[bo.kind] || 0) + 1; break; } }
    S.diag = D; }
  // cheap stall test (no full check) so the common case, a lot car off its painted stall, goes straight to the snap
  const stallOff = (o) => { const cq = inAny(gLot, o.cx, o.cz); if (!cq || cq.mode !== 0) return false; const w = toUV(cq, o.cx, o.cz), d = w && isoU(cq, w.t); if (!d) return false;
    const [su, sv] = stallAt(w.u, w.v); o.stall = { q: cq, su, sv, d }; return Math.abs(o.ux * d[1] - o.uz * d[0]) > DEG5 || Math.abs(w.u - su) > 0.3 || Math.abs(w.v - sv) > 0.45; };
  for (const it of cars) {
    const bad = !AUDIT && stallOff(it.o) ? new Set(['stall']) : check(it.o, it); if (!bad.size) continue;
    for (const k of bad) { S.byCat[k] = (S.byCat[k] || 0) + 1; const e = S.ex[k] || (S.ex[k] = []); if (e.length < 4) e.push([+it.p[0].toFixed(1), +it.p[1].toFixed(1)]); }
    const p = it.p; const o0 = it.o; const vx = -o0.uz, vz = o0.ux; let best = null;
    if (o0.stall) { const { q, su, sv } = o0.stall; // lot car: into the nearest painted stall (centred, along its separators), else a free stall beside it in the row
      for (const du of [0, 2.7, -2.7, 5.4, -5.4, 8.1, -8.1]) { const W = toW(q, su + du, sv); if (!W) continue; const w = toUV(q, W[0], W[1]); const d = w && isoU(q, w.t); if (!d) continue;
        const sg = o0.ux * d[0] + o0.uz * d[1] < 0 ? -1 : 1; const ang = Math.atan2(-d[1] * sg, d[0] * sg); const o = obbOf(W[0], W[1], ang); if (!check(o, it).size) { best = o; p[2] = ang; break; } } }
    const tries = []; for (let s = 0.2; s <= 2.0 + 1e-6; s += 0.2) for (const g of [1, -1]) tries.push([o0.ux * s * g, o0.uz * s * g]); // along its own axis (in / out of the stall)
    for (let k = 1; k <= 3 && !best; k++) for (const g of [1, -1]) tries.push([vx * 2.7 * k * g, vz * 2.7 * k * g]); // along the stall row
    if (!best && !o0.stall) for (const [dx, dz] of tries) { const o = obbOf(p[0] + dx, p[1] + dz, p[2]); if (!check(o, it).size) { best = o; break; } }
    gCar.remove(it, ...bbox(corners(o0)));
    const how = best ? 'moved' : 'dropped'; for (const k of bad) { const b = S.byCat[k + '_' + how] = (S.byCat[k + '_' + how] || 0) + 1; void b; }
    if (best) { p[0] = best.cx; p[1] = best.cz; it.o = best; gCar.add(it, ...bbox(corners(best))); S.moved++; }
    else { it.alive = false; S.dropped++; }
  }
  const dead = new Set(cars.filter((c) => !c.alive).map((c) => c.p)); for (const ch of fab.chunks.values()) ch.I.car = ch.I.car.filter((p) => !dead.has(p));
  if (AUDIT) S.post = tally();
  // read-only snapshot for later audits (the chunk records are freed by attachFabric)
  const live = cars.filter((c) => c.alive); const A = new Float32Array(live.length * 4);
  live.forEach((c, i) => { if (c.o.kind === undefined) check(c.o, c); A[i * 4] = c.p[0]; A[i * 4 + 1] = c.p[1]; A[i * 4 + 2] = c.p[2]; A[i * 4 + 3] = c.o.kind; });
  fab.parked = A; S.ms = Math.round(performance.now() - T0);
  return S;
}

// ---- 2) Tideline Drive kerb-lane slots -------------------------------------------------------------------------------------
const HL = 2.75; // longest spawnable parked type (pickup 5.45 m)
const FT20 = 6.1, FT30 = 9.14, FT15 = 4.57, BUS = 30, MINGAP = 6.0;
export function fixStreetParking(city) {
  const S = { pre: {}, post: {}, flipped: 0, moved: 0, dropped: 0 }; const P = city.parking; if (!P || !P.length) return S;
  const RHW = 7, C = 290;
  const segs = city.segs.filter((s) => s.axis === 'z' && Math.abs(s.c - C) < 0.1);
  const hyd = city.col.boxes.filter((b) => b.tag === 'hyd').map((b) => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]).filter(([x]) => x > C - RHW - 3 && x < C - RHW + 1.5);
  const masts = city.col.boxes.filter((b) => b.tag === 'pole' && b.h >= 5.9).map((b) => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]).filter(([x]) => Math.abs(x - (C - RHW - 1.2)) < 0.6);
  const stops = ((city.signage && city.signage.stops) || []).filter((s) => s.c === C && s.sd < 0);
  let lanes = []; try { lanes = (city._svcLanes || []).filter((L) => L.x - L.hw < C - RHW + 2.5 && L.x + L.hw > C - RHW - 0.5); } catch (e) { lanes = []; }
  // reasons a car centred at z (west kerb lane, facing +z: rear z - HL, front z + HL) is illegal
  const why = (z) => { const r = [], z0 = z - HL, z1 = z + HL;
    const s = segs.find((g) => z >= g.a0 - 0.5 && z <= g.a1 + 0.5);
    if (!s) r.push('corner'); else {
      if (s.bridge) r.push('bridge');
      if (z0 < s.a0 + 5 || z1 > s.a1 - 5) r.push('corner'); // brief: < 5 m from the intersection (cross street kerb line)
      if (z0 < s.a0 + 4.2 + FT20 || z1 > s.a1 - 4.2 - FT20) r.push('crosswalk'); // within 20 ft of the zebra (1.0–4.2 m off the kerb line) at either end
    }
    for (const [, mz] of masts) if (mz > z1 && mz - z1 < FT30) r.push('signal'); // signal on the approach (traffic runs +z)
    for (const [, hz] of hyd) if (hz > z0 - FT15 && hz < z1 + FT15) { r.push('hydrant'); break; }
    for (const st of stops) if (z1 > st.z - BUS && z0 < st.z + BUS) { r.push('busstop'); break; }
    for (const L of lanes) if (z1 > L.z0 && z0 < L.z1) { r.push('lane'); break; }
    return r; };
  const tally = () => { const o = { n: P.length, filled: P.filter((p) => p.fill).length, wrongWay: 0, any: 0 }; for (const k of ['corner', 'crosswalk', 'signal', 'hydrant', 'busstop', 'lane', 'bridge', 'overlap']) o[k] = 0;
    const zs = P.map((p) => p.z).sort((a, b) => a - b);
    for (const p of P) { const w = why(p.z); if (Math.abs(Math.sin(p.yaw)) > 0.2 || Math.cos(p.yaw) < 0) w.push('wrongWay'); if (zs.some((z) => z !== p.z && Math.abs(z - p.z) < MINGAP)) w.push('overlap');
      if (w.length) o.any++; for (const k of new Set(w)) o[k] = (o[k] || 0) + 1; } return o; };
  S.pre = tally();
  for (const p of P) if (Math.cos(p.yaw) < 0.99) { p.yaw = 0; S.flipped++; } // west kerb lane traffic runs +z (vehicles.js lanePoint)
  // re-pack each kerb run: the slots keep their order (and their fill draw), each goes to the first legal spot at least one
  // slot pitch (6.8 m, as laid out) past the previous one; slots that no longer fit are removed
  P.sort((a, b) => a.z - b.z); const keep = [];
  for (const g of segs) { const run = P.filter((p) => p.z >= g.a0 && p.z <= g.a1); let z = g.a0 - 1e9; let i = 0;
    for (let q = g.a0 + HL; q <= g.a1 - HL && i < run.length; q = Math.round((q + 0.1) * 10) / 10) { if (q - z < 6.8 - 1e-6 || why(q).length) continue;
      const p = run[i++]; if (Math.abs(p.z - q) > 0.05) S.moved++; p.z = q; z = q; keep.push(p); }
    S.dropped += run.length - i; }
  P.splice(0, P.length, ...keep);
  S.post = tally(); S.hydrants = hyd.length; S.masts = masts.length; S.stops = stops.length; S.lanes = lanes.length;
  return S;
}
