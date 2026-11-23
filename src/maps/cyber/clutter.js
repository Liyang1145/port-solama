// r6.4 b_clutter (Hark modelling lane, 2026-11-22): colliders for the sidewalk clutter of 霓港's streamed blocks (map B only).
//
// Why: dress.js / street2.js / arch.js lay sidewalk dressing in front of every streamed shop frontage — wheelie bins, plastic
// crates on pallets, gas bottles, food / noodle / bbq / repair stalls with their folding tables and stools, umbrella tables with
// stools, vending machines, ground AC condensers, trash piles — all drawn without a collider. Part of it used to hide inside the
// 1 m invisible margin of the downtown lot boxes; b_parcelfit fitted those boxes to the drawn podium, so you could walk through
// the clutter in front of it (and everywhere else you always could).
//
// How (no rng use, geometry and placement unchanged):
//  * clutcap.js clutGrab(): the generator call of each item group is bracketed; the triangles it appended at walking height give
//    the group's exact footprint -> one thin oriented box (smallest-area rectangle of the hull). One box per GROUP (a stall with
//    its seating, an umbrella table with its stools, a pair of bins, a row of gas bottles / vending machines), as b_coreflow does
//    for terrace furniture: per-stool boxes catch walkers in the gaps between stools. Trash bags are soft (no box); the standing
//    carton in a pile gets its own.
//  * streaming: the log is drained per parcel when its near detail is built (Stream.onParcel, chained) and per corner side row
//    (bldglayer.js, after its shopStreet). Boxes are added once per parcel / row and kept (cached like storefront.js outside
//    clutter): a reloaded chunk adds nothing, an unloaded one keeps its boxes (the generator gives the same result again).
//  * pedestrians: the new boxes (tag 'clut') are not in pedlane.js SKIP, so road-graph sidewalk lanes plan around them; lanes
//    solved before the parcel streamed in are queued for a re-solve (pedlane.js clutDirty) and eased over in 0.7 s.
// Test switches: ?noclutter (log drained, nothing added), ?clutkeep (keep the captured triangles for the census).
import { CLUTTER_LOG, CLUT_CTX } from './clutcap.js';

const OFF = typeof location !== 'undefined' && /[?&]noclutter\b/.test(location.search);
export const CLUT_BOX = new Set(['bin', 'crates', 'gas', 'stall', 'table', 'vend', 'carton', 'cond']);

export class ClutterCols {
  constructor(city) {
    this.city = city; this.stream = city.stream; this.cache = new WeakMap(); this.recs = []; this.keep = false;
    this.stats = { parcels: 0, sides: 0, recs: 0, boxes: 0, byKind: {}, reload: 0, off: OFF };
    CLUT_CTX.col = city.col; CLUT_CTX.graph = city.graph; CLUT_CTX.off = OFF; this.stats.move = CLUT_CTX.stats;
    CLUTTER_LOG.length = 0; // nothing logged before the layer existed belongs to a parcel we will see again
    if (this.stream) { const prev = this.stream.onParcel; this.stream.onParcel = (c, p, m) => { this.take(p, m, 0); if (prev) prev(c, p, m); }; }
  }
  // drain the log of one parcel (src 0) / corner side row (src 1); m = parcel (row) frame -> world
  take(key, m, src) {
    const recs = CLUTTER_LOG.splice(0); if (this.cache.has(key)) { this.stats.reload++; return; }
    const own = []; this.cache.set(key, own); if (src) this.stats.sides++; else this.stats.parcels++;
    const col = this.city.col; const e = m.elements;
    for (const r of recs) {
      this.stats.recs++; const k = this.stats.byKind[r.k] || (this.stats.byKind[r.k] = { n: 0, box: 0 }); k.n++;
      const x = e[0] * r.x + e[8] * r.z + e[12], z = e[2] * r.x + e[10] * r.z + e[14]; const ux = e[0] * r.ux + e[8] * r.uz, uz = e[2] * r.ux + e[10] * r.uz;
      const w = { k: r.k, x, z, ux, uz, hl: r.hl, hw: r.hw, h: r.h, dmin: r.dmin, dmax: r.dmax, box: null };
      if (r.tris) { const t = r.tris, o = new Float32Array(t.length); for (let i = 0; i < t.length; i += 2) { o[i] = e[0] * t[i] + e[8] * t[i + 1] + e[12]; o[i + 1] = e[2] * t[i] + e[10] * t[i + 1] + e[14]; } w.tris = o; }
      if (!OFF && CLUT_BOX.has(r.k) && col && col.addOBB) { w.box = col.addOBB(x, z, ux, uz, r.hl, r.hw, r.h, 'clut'); w.box.ck = r.k; w.box.pk = key; /* b_overlayfit: owner (parcel / side row) */ own.push(w.box); k.box++; this.stats.boxes++; }
      if (this.keep || r.tris) this.recs.push(w);
    }
    if (own.length) (this.city._clutNew || (this.city._clutNew = [])).push(...own); // pedlane.js: re-plan lanes solved before these existed
  }
}
