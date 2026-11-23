// r6.4 b_genfit (Hark modelling lane, 2026-11-22): generator-level kerb fit of the streamed parcels' walking-height parts (map 霓港 only).
//
// Why: a census of every streamed parcel's near detail (genParcel + bldglayer port extras / corner side rows; walking-height
// triangles 0.15–2.0 m that are not sidewalk clutter, edges sampled every 0.1 m against the road graph) found two lots whose
// drawn parts stand on the sidewalk: the mansion at (−540, −199) — its front garden wall runs out to the lot corner, where the
// side street's sidewalk curves in (0.99 m deep) — and the container yard at (−1326, −896) — the crane rails run the full lot
// length and the flood-light mast stands 1.5 m outside the lot corner, both on the curved sidewalk of the crossing street (2.07 m).
// (The downtown lot at (−1633, −760) on road-graph edge 113 is a parcels.js / road-graph issue, left alone here.)
//
// How (startup, deterministic, no rng use at all; runs once in buildCity right after genParcels):
//  * planGenfit() checks, per streamed lot, the walking-height parts its generator draws near the lot edge, in the lot frame
//    (x toward the street, z along it), against the sidewalk outer edge (road graph: hw + sw of the nearest edge, 0.1 m margin):
//      villa / canal / mansion: the two front garden-wall runs, the three gate / driveway piers, porch columns, the house body;
//      port yard: both crane rails, the crane sill beams (at the drawn zc), the two flood-light masts;
//      warehouse: drop pipes + ladder; every other lot: its body rectangle (downtown: podium inset 1 m) + street shop band.
//  * only a lot with a part over the edge gets a fix record p.gf (every other lot keeps p.gf undefined and its generator takes
//    exactly the old code path, so its geometry is bit-identical — proven by a per-lot geometry hash census):
//      garden wall: the outer run is cut back to where it clears (an end pier closes it, like the gate piers);
//      a pier / porch column over the edge is dropped;
//      crane rails: trimmed at the end that runs onto the sidewalk; masts: slid along the yard edge toward the lot centre, then
//      in toward the lot, to the first clear spot; crane: zc clamped to the nearest clear position (the rand() draw is still made).
//    Parts with no fix rule (house body, warehouse pipes, other lots' bodies) are only counted (stats.unfixed) — 0 on this map.
//  * stream.js villa(), bldglayer.js portExtras() read p.gf; parcelfit.js predict() reads the same record, so the colliders it
//    builds at startup match the drawn parts (near-build FOOT_LOG check unchanged: building bodies are not moved).
// Test switch ?nogenfit: no records (old geometry everywhere).
import { withSeed, rng, rand } from '../../util.js';

const OFF = typeof location !== 'undefined' && /[?&]nogenfit\b/.test(location.search);
const MARGIN = 0.1;
export const GENFIT = { stats: null };

// how deep (m) a lot-frame point stands inside the sidewalk band of the nearest road (negative = clear by that much)
function depthAt(G, p, lx, lz) { const c = Math.cos(p.ang), s = Math.sin(p.ang); const x = p.x + lx * c - lz * s, z = p.z + lx * s + lz * c;
  const n = G.index.near(x, z, false); return n ? n.e.hw + n.e.sw - n.d : -9; }
// max depth over the outline of the lot-frame rectangle [x0, x1] × [z0, z1] (every ≤ 0.1 m)
function boxDepth(G, p, x0, z0, x1, z1) { let m = -9; const nx = Math.max(1, Math.ceil((x1 - x0) / 0.1)), nz = Math.max(1, Math.ceil((z1 - z0) / 0.1));
  for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; m = Math.max(m, depthAt(G, p, x, z0), depthAt(G, p, x, z1)); }
  for (let j = 1; j < nz; j++) { const z = z0 + (z1 - z0) * j / nz; m = Math.max(m, depthAt(G, p, x0, z), depthAt(G, p, x1, z)); }
  return m; }
const clear = (G, p, x0, z0, x1, z1) => boxDepth(G, p, x0, z0, x1, z1) < -MARGIN;

export function planGenfit(parcels, G) {
  const st = { lots: 0, checked: 0, fixed: 0, byStyle: {}, parts: { wallCut: 0, pierDrop: 0, porchDrop: 0, railTrim: 0, mastMove: 0, craneClamp: 0 }, unfixed: [], before: [], off: OFF };
  GENFIT.stats = st; if (!G || !G.index) return st;
  for (const p of parcels) {
    if (p.far) continue; st.lots++; const hx = p.d / 2, hz = p.w / 2; const sty = p.style; let gf = null; const over = [];
    const note = (what, x0, z0, x1, z1) => { const d = boxDepth(G, p, x0, z0, x1, z1); if (d >= -MARGIN) over.push([what, +d.toFixed(2)]); return d < -MARGIN; };
    if (sty === 'canal' || sty === 'villa' || sty === 'mansion') { st.checked++;
      const pw = Math.min(5, hz); const fx = hx + 5.2; const g = { za: -hz, zb: hz - 6.5, drop: [], porch: [], endPier: null };
      // outer wall run: lot corner -> gate pier (−pw/2 − 1.2); cut back from the corner until it (and its new end pier) clear
      const zg = -pw / 2 - 1.2;
      if (!note('wallA', fx - 0.15, -hz, fx + 0.15, zg)) { let za = -hz; while (za < zg - 0.6 && !(clear(G, p, fx - 0.15, za, fx + 0.15, zg) && clear(G, p, fx - 0.25, za, fx + 0.25, za + 0.5))) za += 0.05;
        if (za < zg - 0.6) { g.za = za; g.endPier = za + 0.25; } else g.za = null; /* no room: run dropped */ st.parts.wallCut++; gf = g; }
      if (hz - 6.5 > pw / 2 + 1.2 && !note('wallB', fx - 0.15, pw / 2 + 1.2, fx + 0.15, hz - 6.5)) { let zb = hz - 6.5; const z0 = pw / 2 + 1.2;
        while (zb > z0 + 0.6 && !clear(G, p, fx - 0.15, z0, fx + 0.15, zb)) zb -= 0.05; g.zb = zb; st.parts.wallCut++; gf = g; }
      [zg, pw / 2 + 1.2, hz - 6.5].forEach((zz, i) => { const z = i === 2 ? g.zb : zz; if (!note('pier' + i, fx - 0.25, z - 0.25, fx + 0.25, z + 0.25)) { g.drop.push(i); st.parts.pierDrop++; gf = g; } });
      [-pw / 2 + 0.2, pw / 2 - 0.2].forEach((zz, i) => { if (!note('porch' + i, hx + 2.0, zz - 0.15, hx + 2.3, zz + 0.15)) { g.porch.push(i); st.parts.porchDrop++; gf = g; } });
      if (!note('body', -hx, -hz, hx, hz)) st.unfixed.push({ x: p.x, z: p.z, style: sty, part: 'body' });
      if (gf) gf = { villa: g };
    } else if (sty === 'port') { st.checked++;
      const wh = withSeed(p.seed, () => rng() < 0.45); // port() / portExtras / parcelfit.js predict: same first draw
      if (wh) { for (const z of [-hz + 3, hz - 5]) if (!note('pipe', hx + 0.18, z - 0.32, hx + 0.82, z + 0.32)) st.unfixed.push({ x: p.x, z: p.z, style: 'warehouse', part: 'pipe' });
        if (!note('ladder', hx + 1.45, hz - 1.47, hx + 1.55, hz - 0.93)) st.unfixed.push({ x: p.x, z: p.z, style: 'warehouse', part: 'ladder' });
        if (!note('body', -hx, -hz, hx, hz)) st.unfixed.push({ x: p.x, z: p.z, style: 'warehouse', part: 'body' }); }
      else { const xL = -hx - 1.4, xR = hx + 1.4; const g = { rail: [[-hz, hz], [-hz, hz]], mast: [[xL - 1.5, -hz + 1], [xR + 1.5, hz - 1]], zc: null }; let fix = false;
        [xL, xR].forEach((x, i) => { if (note('rail' + i, x - 0.25, -hz, x + 0.25, hz)) return; let z0 = -hz, z1 = hz;
          while (z0 < 0 && !clear(G, p, x - 0.25, z0, x + 0.25, 0)) z0 += 0.05; while (z1 > 0 && !clear(G, p, x - 0.25, 0, x + 0.25, z1)) z1 -= 0.05;
          g.rail[i] = [z0, z1]; st.parts.railTrim++; fix = true; });
        g.mast.forEach((m, i) => { const [x, z] = m; if (note('mast' + i, x - 0.4, z - 0.4, x + 0.4, z + 0.4)) return; const sz = i ? -1 : 1, sx = i ? -1 : 1; let ok = null;
          for (let k = 1; k <= 40 && !ok; k++) { const zz = z + sz * k * 0.25; if (clear(G, p, x - 0.4, zz - 0.4, x + 0.4, zz + 0.4)) ok = [x, zz]; } // along the yard edge
          for (let k = 1; k <= 20 && !ok; k++) { const xx = x + sx * k * 0.25; if (clear(G, p, xx - 0.4, z - 0.4, xx + 0.4, z + 0.4)) ok = [xx, z]; } // in toward the lot
          if (ok) { g.mast[i] = ok; st.parts.mastMove++; fix = true; } else st.unfixed.push({ x: p.x, z: p.z, style: 'yard', part: 'mast' }); });
        const zc = withSeed((p.seed ^ 0x9e37) >>> 0, () => { rng(); return rand(-hz + 9, hz - 9); }); // portExtras: pick(cy), then zc
        const ok = (z) => [xL, xR].every((x) => clear(G, p, x - 0.7, z - 6, x + 0.7, z + 6));
        if (!note('crane', xL - 0.7, zc - 6, xL + 0.7, zc + 6) || !note('crane', xR - 0.7, zc - 6, xR + 0.7, zc + 6)) { let best = null;
          for (let k = 1; k <= 200 && best === null; k++) for (const s of [-1, 1]) { const z = zc + s * k * 0.1; if (z < -hz + 6 || z > hz - 6) continue; if (ok(z)) { best = z; break; } }
          if (best !== null) { g.zc = best; st.parts.craneClamp++; fix = true; } else st.unfixed.push({ x: p.x, z: p.z, style: 'yard', part: 'crane' }); }
        if (fix) gf = { yard: g }; }
    } else if (sty !== 'far') { // every other lot: body (downtown podium inset 1 m) + 0.3 m street shop band — counted only
      const ins = sty === 'downtown' ? 1 : 0; st.checked++;
      if (!note('body', -hx + ins, -hz + ins, hx - ins + (sty === 'condo' ? 0 : 0.3), hz - ins)) st.unfixed.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), style: sty, part: 'body', d: over[over.length - 1][1] });
    }
    if (over.length) st.before.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), style: sty, over });
    const k = st.byStyle[sty] || (st.byStyle[sty] = { n: 0, over: 0, fixed: 0 }); k.n++; if (over.length) k.over++;
    if (gf && !OFF) { p.gf = gf; st.fixed++; k.fixed++; }
  }
  return st;
}
