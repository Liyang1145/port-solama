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
import { SVC_CTX, svcBays, SVC, AF_OFF } from './svcface.js';
import { SVC_CORE, svcEdgesLot, svcEdgeFrame, PARCEL_COLS } from './city.js';
import { genParcel } from './stream.js';

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
  for (let i = 0; i < poly.length; i++) { const E = svcEdgeFrame(poly, i); if (E.len < 2.5 || !svc[i]) continue; out.push({ p: poly[i], dx: E.dx, dz: E.dz, len: E.len, y0, ww: svc[i].ww, ps: svc[i].ps }); }
  return out;
}

const PW = (r, u, d) => [r.p[0] + r.dx * u - r.dz * d, r.p[1] + r.dz * u + r.dx * d]; PW.dir = (r) => [r.dx, r.dz]; // edge frame (u along, d out) -> polygon frame
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
    this.stats = { off, lots: 0, predicted: 0, miss: 0, err: 0, open: 0, boxes: { hatch: 0, meter: 0 }, core: 0, checked: 0, mismatch: 0, slots: 0, ms: 0, plane: { lots: 0, proudMax: 0, removed: 0, added: 0 } };
    this.recs = new Map(); // parcel -> edge records (parcel frame)
    if (off) return;
    const col = city.col; const add = (P, rec, o, pc) => { // world box for one piece; P maps (u along, d out) -> world
      const um = (pc.u0 + pc.u1) / 2, dm = pc.d / 2; const [cx, cz] = P(rec, um, dm); const [ux, uz] = P.dir(rec);
      const b = col.addOBB(cx, cz, ux, uz, (pc.u1 - pc.u0) / 2, dm, rec.y0 + pc.h, 'svc'); b.svk = pc.k; this.stats.boxes[pc.k]++; return b; };
    // hand-built core: world-frame edges
    if (col && col.addOBB) for (const r of SVC_CORE) { this.stats.core++; for (const o of svcBays(r.len, r.ww, r.ps)) { this.stats.open++; const pc = svcPieces(o); if (pc) add(PW, r, o, pc); } }
    // streamed lots: replay to the store volume
    for (const p of city.parcels || []) {
      if (p.far || !STORE.has(p.style) || p.svcRoad === undefined) continue; this.stats.lots++;
      const r = predictLot(p, this.stats); if (!r) continue; this.recs.set(p, r.recs); this.stats.predicted++;
      for (const { rec, o } of r.bays) { this.stats.open++; const pc = svcPieces(o); if (pc && col && col.addOBB) add(r.PL, rec, o, pc); }
      p.svcF = r.F; p.svcPred = r.F;
      if (fit && fit.fit) this.plane(p, r, fit);
    }
    // slots: baffles / wall clutter heap clear of the openings now (colliders created in their final place)
    if (gaps && gaps.svcRefit) for (const g of gaps.gaps) { gaps.svcRefit(g); this.stats.slots++; }
    if (city.stream) { const prev = city.stream.onParcel; city.stream.onParcel = (c, p, m) => { this.check(p); if (prev) prev(c, p, m); }; }
    this.stats.ms = Math.round(performance.now() - t0);
  }
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
