// r6.4 b_parcelfit (Hark modelling lane): streamed-parcel building colliders fitted to the visible footprint (map 霓港 only).
//
// Why: city.js obbCollider() gives every streamed parcel its collider from the parcel rectangle — near-axis lots as one AABB that
// grows by up to ~|sin ang|·half-width per side, rotated lots as square slices that poke past the corners — while the building the
// generator actually lays is often smaller: Deco hotels round their front corners (R ≤ 3.2 m), downtown podiums / megatowers sit
// 1 m inside the lot, container yards leave margins and 1 m aisles between rows. The result was invisible walls on sidewalks
// (e.g. a residential corner at (−1686, −109) whose box reached 2.2 m into a 3 m sidewalk). b_parcelgap fixed the slot-adjacent
// lots with one exact parcel OBB; b_coreflow fixed the hand-built core hotels. This layer does the rest of the streamed parcels.
//
// How (startup, deterministic, after every other layer has planned — no rng stream touched, placements unchanged):
//  * predict(p): the ground footprint the parcel's generator will lay, from the same first draws under the parcel seed
//    (genParcel / decoHotel / port() / portExtras() order; withSeed isolates them, nothing else is consumed). In the parcel frame
//    (x toward the street, z along it): full rect (tenement, mid-rise, condo plinth, villa, warehouse), rounded front
//    (Deco hotel R), rect inset 1 m (downtown podium / megatower), container rows (yard).
//  * pieces: rect -> 1 OBB; rounded front -> body + front strip + one OBB per arc chord (outer face = the chord, reaching to the
//    arc centre; together exactly the drawn polygon, nothing outside it); yard -> one OBB per container row.
//    Walking-height parts drawn outside the footprint that never had a collider are added too (villa porch columns + garden wall
//    piers/walls, warehouse drop pipes + ladder, yard crane sill beams + light masts).
//  * replace the parcel's old boxes (PARCEL_COLS: obbCollider slices or b_parcelgap's OBB) when they reach > 0.3 m outside the
//    footprint or leave > 0.3 m of it uncovered. Same tag 'bld' and height.
//  * streaming: colliders stay static (physics never depends on what is loaded). When a near chunk builds a parcel
//    (Stream.onParcel, chained) the volume() footprints it logged (city.js FOOT_LOG) are compared with the prediction; a mismatch
//    (a future generator change) refits that parcel from the logged footprint on the spot and counts stats.mismatch.
// Test switch ?noparcelfit: nothing replaced or added (the log is still drained).
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { PARCEL_COLS, FOOT_LOG } from './city.js';
import { yardExtras } from './portyard.js'; // r6.4 b_portyard

const OFF = typeof location !== 'undefined' && /[?&]noparcelfit\b/.test(location.search);
const TOL = 0.3, SHOP = 0.3;

// rounded front polygon exactly as city.js roundFront(x0, z0, x1, z1, +1, R, 6)
function roundPoly(x0, z0, x1, z1, R, seg = 6) {
  const arc = (cx, cz, a0, a1) => { const o = []; for (let k = 0; k <= seg; k++) { const a = a0 + (a1 - a0) * k / seg; o.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); } return o; };
  return [[x0, z1], ...arc(x1 - R, z1 - R, Math.PI / 2, 0), ...arc(x1 - R, z0 + R, 0, -Math.PI / 2), [x0, z0]];
}
const rectPoly = (x0, z0, x1, z1) => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]; // geo.js rect()
// local piece: centre (x, z), unit axis (ux, uz), half length hl along it, half width hw across, height h
const rp = (x0, z0, x1, z1, h) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, ux: 1, uz: 0, hl: (x1 - x0) / 2, hw: (z1 - z0) / 2, h });

// Deco hotel draws before its corner radius (city.js decoHotel): floors, wall, accent, seed, [up], dStyle, dWw, then R
function decoR(hz2, small) { randi(0, 1); rng(); rng(); rng(); if (!small) rng(); rng(); rng(); return (hz2 > 14 && rng() < (small ? 0.35 : 0.7)) ? Math.min(3.2, hz2 / 5) : 0; }

// bldglayer.js side shop row on a lot side facing a road (sd = ±1): same frames on the side wall (downtown: podium inset 1 m)
export function sideBand(p, sd) { const hx = p.d / 2, hz = p.w / 2; const ins = p.style === 'downtown' ? 1 : 0; const z0 = hz - ins - 0.05, z1 = hz - ins + SHOP;
  return rp(-hx + ins + 0.5, sd > 0 ? z0 : -z1, hx - ins - 0.5, sd > 0 ? z1 : -z0, 4.0); }
export function predict(p) {
  const hx = p.d / 2, hz = p.w / 2; const o = { kind: 'rect', polys: [rectPoly(-hx, -hz, hx, hz)], R: 0, rows: null, extra: [], band: [] };
  const st = p.style;
  if (st === 'deco' || st === 'mid') {
    const R = withSeed(p.seed, () => (st === 'deco' ? decoR(2 * hz, false) : (rng() < 0.5 ? decoR(2 * hz, true) : -1)));
    if (R > 0) { o.kind = 'round'; o.R = R; o.polys = [roundPoly(-hx, -hz, hx, hz, R)]; }
  } else if (st === 'downtown') { o.kind = 'inset'; o.polys = [rectPoly(-hx + 1, -hz + 1, hx - 1, hz - 1)]; }
  // street shop row on the front (arch.js shopStreet: aluminium frames / door leaves / shutter rails stand ≤ 0.3 m proud of the
  // wall at walking height): a 0.3 m band so the body stops at the frames, not inside them. Deco hotels run the row over their
  // rounded corners (z0 + 1 … z1 − 1): the band reaches back to the start of the curve.
  if (st === 'deco' || st === 'mid') o.band.push(o.R ? rp(hx - o.R, -hz + 1, hx + SHOP, hz - 1, 4.0) : rp(hx - 0.05, -hz, hx + SHOP, hz, 4.0));
  else if (st === 'downtown') o.band.push(rp(hx - 1.05, -hz + 1, hx - 1 + SHOP, hz - 1, 4.0));
  else if (st === 'canal' || st === 'villa' || st === 'mansion') { // villa(): porch columns, garden wall + gate piers (no colliders before)
    const pw = Math.min(5, hz); const fx = hx + 5.2; const g = p.gf && p.gf.villa; // b_genfit: kerb-fitted walls / piers (genfit.js)
    [-pw / 2 + 0.2, pw / 2 - 0.2].forEach((zz, i) => { if (!(g && g.porch.includes(i))) o.extra.push(rp(hx + 2.0, zz - 0.15, hx + 2.3, zz + 0.15, 2.9)); });
    const za = g ? g.za : -hz, zb = g ? g.zb : hz - 6.5;
    if (za !== null) o.extra.push(rp(fx - 0.15, za, fx + 0.15, -pw / 2 - 1.2, 1.0)); if (zb > pw / 2 + 1.2) o.extra.push(rp(fx - 0.15, pw / 2 + 1.2, fx + 0.15, zb, 1.0));
    [-pw / 2 - 1.2, pw / 2 + 1.2, zb].forEach((zz, i) => { if (!(g && g.drop.includes(i))) o.extra.push(rp(fx - 0.25, zz - 0.25, fx + 0.25, zz + 0.25, 1.35)); });
    if (g && g.endPier !== null) o.extra.push(rp(fx - 0.25, g.endPier - 0.25, fx + 0.25, g.endPier + 0.25, 1.35));
  } else if (st === 'port') {
    const wh = withSeed(p.seed, () => rng() < 0.45); // same draw as port() / bldglayer.js portExtras
    if (wh) { const yp = p.h - 2.2; // portExtras: two drop pipes on the front + the ground-to-catwalk ladder
      for (const z of [-hz + 3, hz - 5]) o.extra.push(rp(hx + 0.18, z - 0.32, hx + 0.82, z + 0.32, yp));
      const lz = hz - 1.2; o.extra.push(rp(hx + 1.45, lz - 0.27, hx + 1.55, lz + 0.27, 7.2));
    } else { o.kind = 'yard'; o.polys = []; o.rows = [];
      let xl = null; for (let x = -hx + 2; x < hx - 2.4; x += 3) xl = x; // container columns (port())
      for (let z = -hz + 1; z < hz - 12; z += 13.2) o.rows.push(rp(-hx + 2 - 0.05, z, xl + 2.49, z + 12.2, p.h));
      const gy = p.gf && p.gf.yard; // b_genfit: kerb-fitted crane position / masts (genfit.js)
      let zc = withSeed((p.seed ^ 0x9e37) >>> 0, () => { rng(); return rand(-hz + 9, hz - 9); }); if (gy && gy.zc !== null) zc = gy.zc; const xL = -hx - 1.4, xR = hx + 1.4;
      for (const x of [xL, xR]) o.extra.push(rp(x - 0.7, zc - 6, x + 0.7, zc + 6, 1.2)); // crane sill beams / bogies
      for (const [x, z] of (gy ? gy.mast : [[xL - 1.5, -hz + 1], [xR + 1.5, hz - 1]])) o.extra.push(rp(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 22)); // light masts
      for (const q of yardExtras(p, rp)) o.extra.push(q); // b_portyard: fence runs, gate, booth, vehicles, inner masts, lashing bands
    }
  }
  return o;
}
// footprint pieces (parcel frame) from a polygon list: rectangles as one piece; rounded fronts as body + strip + chord pieces;
// any other polygon by its bounding box (fallback, never hit by the current generators)
function piecesOf(polys, h) {
  const out = [];
  for (const P of polys) {
    const xs = P.map((q) => q[0]), zs = P.map((q) => q[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (P.length === 4) { out.push(rp(x0, z0, x1, z1, h)); continue; }
    const R = x1 - P[1][0]; // roundPoly: P[1] = top of the first arc = (x1 − R, z1)
    if (P.length === 16 && R > 0.05 && Math.abs(P[1][1] - z1) < 1e-6) {
      out.push(rp(x0, z0, x1 - R, z1, h), rp(x1 - R, z0 + R, x1, z1 - R, h));
      for (const [c0, k0] of [[[x1 - R, z1 - R], 1], [[x1 - R, z0 + R], 8]]) for (let k = k0; k < k0 + 6; k++) {
        const a = P[k], b = P[k + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const D = Math.hypot(mx - c0[0], mz - c0[1]); const nx = (c0[0] - mx) / D, nz = (c0[1] - mz) / D;
        out.push({ x: mx + nx * D / 2, z: mz + nz * D / 2, ux, uz, hl: L / 2, hw: D / 2, h }); }
      continue;
    }
    out.push(rp(x0, z0, x1, z1, h));
  }
  return out;
}
const samePolys = (A, B) => A.length === B.length && A.every((P, i) => P.length === B[i].length && P.every((q, j) => Math.abs(q[0] - B[i][j][0]) < 1e-4 && Math.abs(q[1] - B[i][j][1]) < 1e-4));

export class ParcelFit {
  constructor(city, sides = []) {
    this.city = city; this.stream = city.stream; const t0 = performance.now();
    this.stats = { parcels: 0, replaced: 0, kept: 0, removed: 0, pieces: 0, band: 0, extra: 0, byKind: {}, protrOld: 0, underOld: 0, checked: 0, mismatch: 0, ms: 0, off: OFF };
    this.fit = new Map(); // parcel -> { kind, polys, pieces (local), boxes (world colliders it owns) }
    const col = city.col; if (!col || !col.addOBB) return;
    const P = (city.parcels || []).filter((p) => !p.far && PARCEL_COLS.has(p)); const drop = new Set();
    const sideOf = new Map(); for (const it of sides) { let l = sideOf.get(it.p); if (!l) sideOf.set(it.p, l = []); l.push(it.sd); }
    for (const p of P) {
      const f = predict(p); const pieces = f.rows || piecesOf(f.polys, p.h); f.pieces = pieces; this.fit.set(p, f); this.stats.parcels++;
      for (const sd of sideOf.get(p) || []) f.band.push(sideBand(p, sd));
      const k = this.stats.byKind[f.kind] || (this.stats.byKind[f.kind] = { n: 0, fit: 0 }); k.n++;
      if (OFF) continue;
      const old = PARCEL_COLS.get(p); const [pr, un] = this.misfit(p, old, pieces); p._pf = { protr: +pr.toFixed(2), under: +un.toFixed(2) };
      if (pr > TOL) this.stats.protrOld++; if (un > TOL) this.stats.underOld++;
      let own = [];
      if (pr > TOL || un > TOL) { for (const b of old) drop.add(b); this.stats.removed += old.length; own = pieces.map((q) => this.add(p, q, 'bld')); this.stats.replaced++; k.fit++; this.stats.pieces += pieces.length;
      }
      else { own = old.slice(); this.stats.kept++; }
      for (const q of f.band) { own.push(this.add(p, q, 'bld')); this.stats.band++; }
      for (const q of f.extra) { own.push(this.add(p, q, 'bld')); this.stats.extra++; }
      PARCEL_COLS.set(p, own); f.boxes = own;
    }
    this.removeAll(drop);
    if (this.stream) { const prev = this.stream.onParcel; this.stream.onParcel = (c, p, m) => { if (prev) prev(c, p, m); this.check(p); }; }
    this.stats.ms = Math.round(performance.now() - t0);
  }
  toW(p, x, z) { const c = Math.cos(p.ang), s = Math.sin(p.ang); return [p.x + x * c - z * s, p.z + x * s + z * c]; }
  add(p, q, tag) { const c = Math.cos(p.ang), s = Math.sin(p.ang); const [cx, cz] = this.toW(p, q.x, q.z);
    const b = this.city.col.addOBB(cx, cz, q.ux * c - q.uz * s, q.ux * s + q.uz * c, q.hl, q.hw, q.h, tag); b.pf = p; return b; }
  // world point -> distance outside the union of the parcel-frame pieces
  dPieces(p, pieces, x, z) { const c = Math.cos(p.ang), s = Math.sin(p.ang); const dx = x - p.x, dz = z - p.z; const lx = dx * c + dz * s, lz = -dx * s + dz * c; let m = 1e9;
    for (const q of pieces) { const rx = lx - q.x, rz = lz - q.z; const a = rx * q.ux + rz * q.uz, w = -rx * q.uz + rz * q.ux; const d = Math.hypot(Math.max(0, Math.abs(a) - q.hl), Math.max(0, Math.abs(w) - q.hw)); if (d < m) m = d; } return m; }
  static dBox(b, x, z) { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)); }
  static corners(b) { if (b.o) { const o = b.o; const r = []; for (const [sa, sw] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) r.push([o.cx + o.ux * o.hl * sa - o.uz * o.hw * sw, o.cz + o.uz * o.hl * sa + o.ux * o.hw * sw]); return r; }
    return [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]]; }
  // [how far the old boxes reach outside the fitted footprint, how much of the footprint they leave uncovered]
  misfit(p, old, pieces) {
    let pr = 0; for (const b of old) { const C = ParcelFit.corners(b); for (let i = 0; i < 4; i++) { const a = C[i], q = C[(i + 1) % 4];
      for (let t = 0; t <= 1.0001; t += 0.25) { const d = this.dPieces(p, pieces, a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t); if (d > pr) pr = d; } } }
    let un = 0; for (const q of pieces) { const n = Math.max(2, Math.ceil(q.hl)), m = Math.max(2, Math.ceil(q.hw));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { if (i > 0 && i < n && j > 0 && j < m) continue; // piece outline, every ≤ 1 m
        const a = (-1 + 2 * i / n) * (q.hl - 0.02), w = (-1 + 2 * j / m) * (q.hw - 0.02); const [x, z] = this.toW(p, q.x + a * q.ux - w * q.uz, q.z + a * q.uz + w * q.ux);
        if (this.dPieces(p, pieces, x, z) > 0.001) continue; let d = 1e9; for (const b of old) d = Math.min(d, ParcelFit.dBox(b, x, z)); if (d > un) un = d; } }
    return [pr, un];
  }
  // batch removal (ColliderGrid.remove() is O(boxes) per call)
  removeAll(set) { if (!set.size) return; const col = this.city.col; const c = col.cell;
    for (const b of set) for (let ix = Math.floor(b.minX / c); ix <= Math.floor(b.maxX / c); ix++) for (let iz = Math.floor(b.minZ / c); iz <= Math.floor(b.maxZ / c); iz++) {
      const l = col.map.get(col.key(ix, iz)); if (l) { const j = l.indexOf(b); if (j >= 0) l.splice(j, 1); } }
    let w = 0; const B = col.boxes; for (let i = 0; i < B.length; i++) if (!set.has(B[i])) B[w++] = B[i]; B.length = w; }
  // near build of a parcel: its generator just logged the walking-height volume footprints -> confirm the startup prediction
  check(p) {
    const logged = FOOT_LOG.splice(0); const f = this.fit.get(p); if (!f) return; this.stats.checked++;
    if (samePolys(logged, f.polys)) return;
    this.stats.mismatch++; (this.mis || (this.mis = [])).length < 20 && this.mis.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), style: p.style, kind: f.kind, n: logged.length });
    if (OFF || !logged.length) return; // yard predicted but a volume logged (or the reverse) -> refit from the log
    const pieces = piecesOf(logged, p.h);
    const drop = new Set(PARCEL_COLS.get(p) || []); this.removeAll(drop);
    const own = pieces.map((q) => this.add(p, q, 'bld')); for (const q of [...f.band, ...f.extra]) own.push(this.add(p, q, 'bld'));
    f.polys = logged; f.pieces = pieces; f.boxes = own; PARCEL_COLS.set(p, own);
  }
}
