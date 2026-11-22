// b_svccol (Hark modelling lane, 2026-11-23): colliders for the service frontage of 霓港 (B map) and its slots, map B only.
//
// Why: b_alleyface / b_alleyface2 gave the ground floor of the backs and slot sides a style-6 service face (shutters, steel doors,
// delivery hatches, meter cabinets, louvres) with a few real pieces, but no colliders: the delivery-hatch sill stands 0.34 m proud
// at 0.9–1.0 m (walkers and cars went through it), the meter cabinet 0.25 m at 1.1–2.3 m. And the slot baffles / wall clutter heap
// that b_alleyface2 slides clear of the openings only moved their colliders when the slot was first planned (both neighbours
// streamed in): until then the old boxes stood where nothing is drawn and the drawn pieces had none.
//
// How (startup, deterministic, no rng stream touched, geometry unchanged, no new mesh / material / shader):
//  * predict(p): the service openings of a streamed lot without building it. The lot's generator is replayed under its own seed
//    (withSeed isolates the draws) with SVC_CTX.dry set; city.js volume() throws at the first volume, which for every lot style
//    with a store band (deco / mid / tenement / downtown podium / megatower podium) is the store volume -> its polygon, y0, facade
//    seed and store width. svcEdgesLot() + svcBays() (the same functions the near build uses) then give the openings exactly as
//    svcFront() logs them; p.svcF is set in world space at startup. A lot whose first volume is not a store volume (none today) is
//    left to the near build as before (stats.miss). The near build checks the prediction against its own log (stats.mismatch).
//  * one oriented box per protruding piece that reaches into walking / car height (bottom < 2.2 m, ≥ 0.15 m proud): the delivery
//    hatch (sill 0.34 m + housing, box over the sill footprint up to the housing top) and the meter cabinet (0.25 m with its rain
//    lid). Shutter housings (2.7 m), door hoods (2.4 m), louvre drips (0.09 m) and the plinth (0.06 m) get none. Tag 'svc'.
//    Core (hand-built) service edges come from city.js SVC_CORE (logged while the core was built).
//  * slots: parcelgap.js svcRefit() (baffles + wall clutter heap clear of the openings) runs for every slot right here, with the
//    predicted openings, so their colliders are created in their final place; the first plan finds the slot already refitted.
// Test switch ?nosvccol: as before this lane (no prediction, no boxes, refit at the first plan).
import * as THREE from 'three';
import { withSeed } from '../../util.js';
import { SVC_CTX, svcBays, SVC, AF_OFF, svcPieceList, NF_MARGIN, NF_OFF, nfFace, nfPairs, inBox as inBoxNF, segFree, freeDepth, rayBox } from './svcface.js';
export { segFree, freeDepth, rayBox, inBoxNF as inBox };
import { SVC_CORE, svcEdgesLot, svcEdgeFrame, PARCEL_COLS } from './city.js';
import { genParcel } from './stream.js';

// b_canopycol: overhead pieces of the service face (shutter housing 2.55–2.86, door hood 2.28–2.36 above the band base, i.e. ≥ 2.4 m
// above the street) get one fitted box each when ≥ 0.15 m proud (same rule as b_svccol), spanning only their real height: in a grid
// of their own (util.js ColliderGrid.addOver), read by resolve() for a body whose head reaches the piece (a jumping walker; a vehicle
// by its body height, vehicles.js) — walkers pass under, the ground-up colliders, their queries and hashes are unchanged. The hatch
// housing (2.05–2.26) is already inside the hatch box. Test switch ?nocanopycol (also off with ?nosvccol / ?noalleyface).
export const CC_OFF = () => SC_OFF() || !!globalThis.__NOCANOPYCOL || (typeof location !== 'undefined' && /[?&]nocanopycol\b/.test(location.search));
export const OVER_K = { 'shutter housing': 'housing', 'door hood': 'hood' };
export function recOver(rec) { const out = [];
  for (const q of recPieces(rec)) { const k = OVER_K[q.k]; if (!k) continue; out.push({ u0: q.u0, u1: q.u1, d: q.d, ya: q.ya, yb: q.yb, k, ok: q.d >= 0.15 }); }
  return out; }
export const SC_OFF = () => AF_OFF || !!globalThis.__NOSVCCOL || (typeof location !== 'undefined' && /[?&]nosvccol\b/.test(location.search));
const STORE = new Set(['deco', 'mid', 'downtown']);
const nullCol = { add() {} };
const inBox = (b, x, z) => { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; return Math.abs(rx * o.ux + rz * o.uz) <= o.hl && Math.abs(-rx * o.uz + rz * o.ux) <= o.hw; } return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ; };
function parcelMatrix(p) { const th = Math.atan2(-Math.sin(p.ang), Math.cos(p.ang)); return new THREE.Matrix4().makeRotationY(th).setPosition(p.x, 0, p.z); }

// protruding pieces of one opening that need a box: wall frame u0..u1 along the edge, out to depth d, top h above the band base
// (city.js svcFront: hatch sill a0−0.12…a1+0.12 × 0.34 at 0.9–1.0 + housing to 2.26; meter cabinet a0…a1 × 0.2 at 1.1–2.22 + lid
// a0−0.04…a1+0.04 × 0.25 to 2.28)
export function svcPieces(o) {
  const a0 = o.c - o.hw, a1 = o.c + o.hw;
  if (o.t === SVC.HATCH) return { u0: a0 - 0.12, u1: a1 + 0.12, d: 0.34, h: 2.26, k: 'hatch' };
  if (o.t === SVC.METER) return { u0: a0 - 0.04, u1: a1 + 0.04, d: 0.25, h: 2.28, k: 'meter' };
  return null;
}
// the service edges with real pieces, exactly as city.js shopfront() calls svcFront (edges ≥ 2.5 m), in the frame of the polygon
export function svcEdgeRecs(poly, svc, y0) {
  const out = []; if (!svc) return out;
  for (let i = 0; i < poly.length; i++) { const E = svcEdgeFrame(poly, i); if (E.len < 2.5 || !svc[i]) continue; out.push({ p: poly[i], dx: E.dx, dz: E.dz, len: E.len, y0, ww: svc[i].ww, ps: svc[i].ps, i, fx: svc[i].fx || null }); }
  return out;
}

// b_narrowfix: the collider boxes of an edge record, from the drawn pieces: per hatch (sill + housing) / meter (cabinet + lid) one
// box over the union of its pieces, when it stands ≥ 0.15 m proud (b_svccol rule; full pieces -> the b_svccol boxes exactly)
export function recBoxes(rec) { const by = new Map();
  for (const q of recPieces(rec)) { if (q.i < 0 || (q.t !== SVC.HATCH && q.t !== SVC.METER)) continue; let g = by.get(q.i); if (!g) by.set(q.i, g = { u0: q.u0, u1: q.u1, d: q.d, h: q.t === SVC.HATCH ? 2.26 : 2.28, k: q.t === SVC.HATCH ? 'hatch' : 'meter' });
    g.u0 = Math.min(g.u0, q.u0); g.u1 = Math.max(g.u1, q.u1); g.d = Math.max(g.d, q.d); }
  return [...by.values()].filter((g) => g.d >= 0.15); }
export const recPieces = (rec) => svcPieceList(rec.len, rec.ww, rec.ps, rec.fx || null); // b_narrowfix: drawn pieces of an edge record
export const PW = (r, u, d) => [r.p[0] + r.dx * u - r.dz * d, r.p[1] + r.dz * u + r.dx * d]; PW.dir = (r) => [r.dx, r.dz]; // edge frame (u along, d out) -> polygon frame
// replay a streamed lot to its store volume -> { recs (edge records, parcel frame), bays [{ rec, o }], F (= the near build's p.svcF), PL (u, d -> world) } or null
export function predictLot(p, st = {}) {
  const D = { rec: null, miss: false }; const ctx = { W: null, col: nullCol, signs: [], awnings: [], lamps: [], alleys: [], yards: [] };
  SVC_CTX.dry = D; try { withSeed(p.seed, () => genParcel(ctx, p)); } catch (e) { if (e !== D) { st.err = (st.err || 0) + 1; if (!st.errs) st.errs = String(e && e.stack || e).slice(0, 300); } } finally { SVC_CTX.dry = null; }
  if (!D.rec) { st.miss = (st.miss || 0) + 1; return null; }
  SVC_CTX.p = p; let svc = null; try { svc = svcEdgesLot(D.rec.poly, D.rec.seed, D.rec.sw, D.rec.y0); } finally { SVC_CTX.p = null; }
  const recs = svcEdgeRecs(D.rec.poly, svc, D.rec.y0);
  const m = parcelMatrix(p).elements; const W2 = (q) => [m[0] * q[0] + m[8] * q[1] + m[12], m[2] * q[0] + m[10] * q[1] + m[14]];
  const PL = (r, u, d) => W2(PW(r, u, d)); PL.dir = (r) => { const a = W2([0, 0]), b = W2([r.dx, r.dz]); return [b[0] - a[0], b[1] - a[1]]; };
  const F = [], bays = [];
  for (const rec of recs) for (const o of svcBays(rec.len, rec.ww, rec.ps)) { bays.push({ rec, o }); // same record as svcFront's log (stream.js -> p.svcF)
    F.push({ a: PL(rec, o.c - o.hw, 0), b: PL(rec, o.c + o.hw, 0), lo: rec.y0 + o.bot, hi: rec.y0 + o.top, t: o.t, floor: !!o.floor }); }
  return { recs, bays, F, PL, poly: D.rec.poly };
}

export class SvcCol {
  constructor(city, gaps, fit = null) {
    this.city = city; this.gaps = gaps; const t0 = performance.now(); const off = SC_OFF();
    this.stats = { off, nf: { off: NF_OFF(), faces: 0, fixed: 0, bays: 0, pairs: 0, ms: 0 }, lots: 0, predicted: 0, miss: 0, err: 0, open: 0, boxes: { hatch: 0, meter: 0 }, core: 0, checked: 0, mismatch: 0, slots: 0, ms: 0, plane: { lots: 0, proudMax: 0, removed: 0, added: 0 } };
    this.recs = new Map(); // parcel -> edge records (parcel frame)
    this.nfSpots = []; // b_narrowfix: world spots of the bays that got flush pieces
    if (off) return;
    const col = city.col; const add = (P, rec, pc) => { // world box for one piece; P maps (u along, d out) -> world
      const um = (pc.u0 + pc.u1) / 2, dm = pc.d / 2; const [cx, cz] = P(rec, um, dm); const [ux, uz] = P.dir(rec);
      const b = col.addOBB(cx, cz, ux, uz, (pc.u1 - pc.u0) / 2, dm, rec.y0 + pc.h, 'svc'); b.svk = pc.k; this.stats.boxes[pc.k]++; return b; };
    const cc = !CC_OFF() && col && col.addOver; const SO = this.stats.over = { off: !cc, housing: 0, hood: 0, flush: { housing: 0, hood: 0 } }; this.over = [];
    const over = (P, rec) => { for (const q of recOver(rec)) { if (!q.ok) { SO.flush[q.k]++; continue; } const [cx, cz] = P(rec, (q.u0 + q.u1) / 2, q.d / 2); const [ux, uz] = P.dir(rec); const l = Math.hypot(ux, uz);
      const b = col.addOver(cx, cz, ux / l, uz / l, (q.u1 - q.u0) / 2, q.d / 2, rec.y0 + q.ya, rec.y0 + q.yb, 'svcup'); b.svk = q.k; SO[q.k]++; this.over.push(b); } };
    const boxes = (P, rec) => { if (!col || !col.addOBB) return; for (const pc of recBoxes(rec)) add(P, rec, pc); if (cc) over(P, rec); };
    // hand-built core: world-frame edges (b_narrowfix: city.js nfCore already gave them their flush pieces, rec.fx)
    for (const r of SVC_CORE) { this.stats.core++; this.stats.open += svcBays(r.len, r.ww, r.ps).length; boxes(PW, r); }
    // streamed lots: replay to the store volume
    const lots = [];
    for (const p of city.parcels || []) {
      if (p.far || !STORE.has(p.style) || p.svcRoad === undefined) continue; this.stats.lots++;
      const r = predictLot(p, this.stats); if (!r) continue; this.recs.set(p, r.recs); this.stats.predicted++; this.stats.open += r.bays.length;
      p.svcF = r.F; p.svcPred = r.F; lots.push([p, r]);
      if (fit && fit.fit) this.plane(p, r, fit);
    }
    // b_narrowfix: faces close to a neighbour wall (narrow slots) -> flush pieces (p.svcFix, read by city.js svcEdgesLot at the near build)
    if (!NF_OFF() && col) this.narrow(lots, fit);
    for (const [, r] of lots) for (const rec of r.recs) boxes(r.PL, rec);
    // slots: baffles / wall clutter heap clear of the openings now (colliders created in their final place)
    if (gaps && gaps.svcRefit) for (const g of gaps.gaps) { gaps.svcRefit(g); this.stats.slots++; }
    if (city.stream) { const prev = city.stream.onParcel; city.stream.onParcel = (c, p, m) => { this.check(p); if (prev) prev(c, p, m); }; }
    this.stats.ms = Math.round(performance.now() - t0);
  }
  // b_narrowfix: free depth in front of every lot service face (foreign 'bld' colliders and the neighbours' exact footprints), then the
  // facing-pairs pass with the core's pieces as fixed; result per lot edge index on p.svcFix and on the edge records (same object)
  narrow(lots, fit) { const t0 = performance.now(); const col = this.city.col; const S = this.stats.nf;
    const K = 40; const cell = new Map(); if (fit && fit.fit) for (const [p, f] of fit.fit) { const k = Math.floor(p.x / K) + ',' + Math.floor(p.z / K); let l = cell.get(k); if (!l) cell.set(k, l = []); l.push([p, f]); }
    const near = (x, z) => { const o = []; const cx = Math.floor(x / K), cz = Math.floor(z / K); for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const l = cell.get(i + ',' + j); if (l) for (const e of l) o.push(e); } return o; };
    const ents = [];
    for (const r of SVC_CORE) if (r.fx) ents.push({ F: { P: PW, rec: r, self: null }, fx: r.fx, fixed: true });
    for (const [p, r] of lots) { const own = new Set(PARCEL_COLS.get(p) || []); const ownF = (b) => own.has(b);
      for (const rec of r.recs) { S.faces++; const F = { P: r.PL, rec, own: ownF, self: p, near }; const fx = nfFace(col, F); if (!fx) continue; ents.push({ F, fx, fixed: false, p, rec }); } }
    S.pairs = nfPairs(ents);
    for (const e of ents) { if (e.fixed) continue; const fx = e.fx; const full = fx.cp == null && fx.c.every((v) => v == null || v >= 0.36); if (full) continue; // nothing changes
      S.fixed++; S.bays += fx.c.filter((v) => v != null && v < 0.36).length; (e.p.svcFix || (e.p.svcFix = {}))[e.rec.i] = fx; e.rec.fx = fx;
      const P = e.F.P, r = e.rec; const [ux, uz] = P.dir(r); svcBays(r.len, r.ww, r.ps).forEach((o, i) => { const c = fx.c[i]; if (c == null || c >= 0.36) return; const [x, z] = P(r, o.c, 0); // debug / screenshot spots (31 today)
        this.nfSpots.push({ x: +x.toFixed(3), z: +z.toFixed(3), ux: +ux.toFixed(4), uz: +uz.toFixed(4), c, t: o.t, hw: o.hw, y0: r.y0 }); }); }
    S.ms = Math.round(performance.now() - t0); }
  // the lot's collider must stop at the service-face plane: a kept parcel box (city.js obbCollider AABB of a near-axis lot, within
  // b_parcelfit's 0.3 m tolerance) can stand up to ~0.3 m proud of a back / slot wall -> that lot gets parcelfit's exact pieces
  plane(p, r, fit) {
    const f = fit.fit.get(p); if (!f || !f.boxes || !f.pieces) return; const own = f.boxes; let pr = 0;
    for (const rec of r.recs) { const n = Math.max(2, Math.round(rec.len)); for (let i = 1; i < n; i++) { const u = rec.len * i / n; if (u < 0.6 || u > rec.len - 0.6) continue;
      for (let d = 0.3; d > 0.05; d -= 0.025) { const [x, z] = r.PL(rec, u, d); if (own.some((b) => b.tag === 'bld' && b.h > 0.5 && inBox(b, x, z))) { if (d > pr) pr = d; break; } } } }
    if (pr <= 0.05) return; const S = this.stats.plane; S.lots++; S.proudMax = Math.max(S.proudMax, +pr.toFixed(3));
    const drop = new Set(own); fit.removeAll(drop); S.removed += drop.size;
    const nb = f.pieces.map((q) => fit.add(p, q, 'bld')); for (const q of [...f.band, ...f.extra]) nb.push(fit.add(p, q, 'bld')); S.added += nb.length;
    f.boxes = nb; PARCEL_COLS.set(p, nb);
  }
  // near build: stream.js just logged the lot's openings on p.svcF -> must equal the prediction
  check(p) {
    const A = p.svcPred; if (!A) return; this.stats.checked++; const B = p.svcF || [];
    const same = A.length === B.length && A.every((o, i) => { const q = B[i]; return q.t === o.t && q.floor === o.floor && Math.abs(q.lo - o.lo) < 1e-6 && Math.abs(q.hi - o.hi) < 1e-6 && Math.abs(q.a[0] - o.a[0]) < 1e-4 && Math.abs(q.a[1] - o.a[1]) < 1e-4 && Math.abs(q.b[0] - o.b[0]) < 1e-4 && Math.abs(q.b[1] - o.b[1]) < 1e-4; });
    if (!same) { this.stats.mismatch++; (this.mis || (this.mis = [])).length < 10 && this.mis.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), style: p.style, n: [A.length, B.length] }); }
  }
}
