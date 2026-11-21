// r6.2 霓港 building archetypes, one at a time (user 2026-11-21: 「建模要一个个攻」). Each builds in the parcel frame used by
// stream.js (footprint x ∈ [x0, x1], z ∈ [z0, z1], street facade at x = x1) with the same World buckets, so they are merged per
// streamed chunk and freed with it (chunk LOD = stream.js near/far). Called from city.js downtownBlock / midrise.
//  * megatower: podium with shop street, 3-4 setback tiers, corner exoskeleton columns + edge ribs + X mega-braces, louvred
//    mechanical floors with neon reveal at each setback, crown = helipad / lattice antenna mast / spire with aviation lights.
//  * tenement: punched-window walk-up with stacked window AC units, cage balconies with laundry / plants / boxes, a zig-zag fire
//    escape, conduit + cable bundles sagging across the facade, roll-up shutters / awnings / signboards / vending machines below,
//    blade neon signs with glass-tube glyphs on brackets.
//  * shopStreet: the ground-floor dressing shared by both (and by the Deco hotels when streamed).
import * as THREE from 'three';
import { box, polyCap, prismWalls, rect } from '../../geo.js';
import { rng, rand, randi, pick } from '../../util.js';
import { kg, beam, tube, put, cable, cableBundle, neonSign, randGlyphs, acUnit, cageBalcony, fireEscape, rollShutter, awning, signboard, vending, edge, storefront, NEONC, DARK, STEEL, RUST } from './kit.js';
import { grime, sidewalk, hangingSign, laundryLine, streak } from './dress.js';
import { cnSignboard, shopBits } from './street2.js';

// --------------------------------------------------------------- shop street ----
// ground-floor bays along the street face x = fx (z0..z1), storefront band height `ground` starting at y0
export function shopStreet(ctx, fx, z0, z1, y0, ground, sw, opts = {}) {
  const W = ctx.W; const F = edge([fx, z1], [fx, z0]); // runs from z1 to z0 -> outward +x
  const n = Math.max(1, Math.round(F.len / sw)); const cw = F.len / n; let vend = 0;
  for (let i = 0; i < n; i++) {
    const a0 = i * cw + 0.2, a1 = (i + 1) * cw - 0.2; const r = rng();
    const yt = y0 + ground * 0.78;
    if (r < 0.32) { const o = pick([0, 0, 0.35, 0.6]); if (o > 0) storefront(W, F, a0, a1, y0, yt); rollShutter(W, F, a0, a1, y0, yt, o); }
    else if (r < 0.62) { storefront(W, F, a0, a1, y0, yt); awning(W, F, a0, a1, yt + 0.05, rand(1.3, 2.0)); }
    else if (r < 0.75) { storefront(W, F, a0, a1, y0, yt); rollShutter(W, F, a0, a1, y0, yt, 0.92); } // open shop: shutter rolled up into the housing
    else storefront(W, F, a0, a1, y0, yt);
    // r6.4 b_street2: about half the shop boards are Chinese light boxes (invented names); stickers / condensers / wiring per bay
    if (opts.signs !== false && rng() < 0.75) { if (rng() < 0.5) cnSignboard(W, F, a0 + 0.1, a1 - 0.1, y0 + ground * 0.8 + 0.18, rand(0.7, 0.95)); else signboard(W, F, a0 + 0.1, a1 - 0.1, y0 + ground * 0.8 + 0.18, rand(0.6, 0.9)); }
    if (opts.dress !== false) shopBits(W, F, a0, a1, y0, yt, opts.grit ?? 0.5, i === n - 1);
    if (vend < 3 && rng() < 0.22 && cw > 3.2) { const k = randi(1, 3); for (let j = 0; j < k && vend < 3; j++, vend++) vending(W, F, a0 + 0.6 + j * 1.0, y0); }
  }
  // r6.3: hanging light-box signs on wall arms over the pavement (every couple of bays) + sidewalk dressing (bins, trash, crates,
  // food stalls, umbrella tables, puddles, ground pipes) weighted by how gritty the street is
  for (let i = 0; i < n; i++) if (rng() < (opts.hang ?? 0.45)) hangingSign(W, F, i * cw + rand(0.4, 0.9), y0 + ground + rand(0.2, 1.4));
  if (opts.dress !== false) sidewalk(W, F, y0, opts.grit ?? 0.5);
  // blade sign at one end of the frontage
  if (opts.blade !== false && rng() < 0.85) {
    const a = rng() < 0.5 ? 0.6 : F.len - 0.6; const h = rand(2.4, 4.2), w = rand(0.8, 1.2); const yc = y0 + ground + 0.6 + h / 2;
    const q = F.P(a, 0.35 + w / 2); neonSign(W, [q[0], yc, q[1]], [F.ox, 0, F.oz], w, h, { blade: true, glyphs: randGlyphs(Math.max(2, Math.min(4, Math.floor(h / (w * 0.95))))), alt: rng() < 0.5 });
  }
}

// ----------------------------------------------------------------- megatower ----
// x0..z1: parcel interior; tall: tower height above the podium; deps: { volume, rooftop } from city.js (avoids an import cycle)
export function megatower(ctx, x0, z0, x1, z1, tall, deps) {
  const { volume, rooftop } = deps; const W = ctx.W; const G = kg();
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const pw = x1 - x0, pd = z1 - z0;
  const fam = randi(0, 3); // 0 dark glass + steel exo, 1 white concrete + bronze ribs, 2 black stone + red ribs, 3 teal glass + white exo
  const WALL = [[0.3, 0.33, 0.36], [0.86, 0.85, 0.82], [0.2, 0.2, 0.22], [0.5, 0.6, 0.62]][fam];
  const GL = [[0.06, 0.1, 0.14], [0.14, 0.18, 0.2], [0.05, 0.06, 0.08], [0.06, 0.18, 0.2]][fam];
  const RIB = [[0.2, 0.21, 0.23], [0.5, 0.38, 0.24], [0.42, 0.08, 0.08], [0.82, 0.84, 0.86]][fam];
  const style = [0, 2, 5, 0][fam]; const fh = 3.9; const ww = style === 0 ? rand(1.5, 2.0) : rand(2.0, 2.6);
  const glow = pick(NEONC);
  const ALT = [[5, 2], [0, 5], [0, 2], [5, 2]];
  // r6.2b variety: X mega-braces on ~half the towers (always on the steel-exo family 0); the rest get vertical mullion fins
  const xb = fam === 0 || rng() < 0.4;
  // podium with the shop street on the front
  const podH = 0.15 + rand(10, 15);
  volume(ctx, rect(x0 + 1, z0 + 1, x1 - 1, z1 - 1), 0.15, podH, { style: 2, fh: 4.6, ww: 3.6, wall: [0.36, 0.36, 0.38], glass: GL, store: true, ground: 5.0, storeW: 4.6, canopy: false });
  shopStreet(ctx, x1 - 1, z0 + 1, z1 - 1, 0.15, 5.0, 4.6, { grit: 0.25 });
  // tiers
  const nT = tall > 150 ? 4 : 3; const FR = nT === 4 ? [0.42, 0.68, 0.88, 1.0] : [0.5, 0.8, 1.0];
  let tx = Math.min(pw - 7, 46) / 2, tz = Math.min(pd - 7, 46) / 2; let y = podH; const tiers = [];
  rooftop(ctx, x0 + 1, z0 + 1, x1 - 1, z1 - 1, podH, 'pod', [[cx - tx - 2, cz - tz - 2, cx + tx + 2, cz + tz + 2]]);
  for (let k = 0; k < nT; k++) {
    const yT = podH + tall * FR[k]; const X0 = cx - tx, X1 = cx + tx, Z0 = cz - tz, Z1 = cz + tz;
    // r6.3 per-tier facade variation: alternate panel type / bay width / glass tint so one tower no longer repeats a single pattern
    const tSt = k > 0 && rng() < 0.5 ? pick(ALT[fam]) : style; const tWw = tSt === style ? ww * rand(0.85, 1.2) : (tSt === 0 ? rand(1.4, 1.9) : rand(2.0, 2.8));
    const tGl = GL.map((q) => Math.max(0, q + rand(-0.03, 0.05))); const tWall = WALL.map((q) => q * rand(0.9, 1.08));
    volume(ctx, rect(X0, Z0, X1, Z1), y, yT, { style: tSt, fh, ww: tWw, wall: tWall, glass: tGl, collide: false, lite: true });
    tiers.push({ X0, X1, Z0, Z1, y0: y, y1: yT });
    const v = W.b('vcol', cx, cz), nb = W.b('neon', cx, cz);
    towerSkin(W, v, nb, X0, Z0, X1, Z1, y, yT, fh, tWw, RIB, tWall, k, fam, ctx, deps);
    // exoskeleton: corner columns (L-section read as 1.3 m square), edge ribs every ~8 m
    for (const [px, pz] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) box(v, px - 0.65, y, pz - 0.65, px + 0.65, yT + 0.6, pz + 0.65, {}, RIB);
    const ribs = (ax, a0, a1, c, s) => { const L = a1 - a0; const nr = Math.max(1, Math.round(L / 8)); const pts = [];
      for (let i = 1; i < nr; i++) { const a = a0 + (L * i) / nr; pts.push(a);
        if (ax === 'x') box(v, a - 0.28, y, s > 0 ? c : c - 0.7, a + 0.28, yT, s > 0 ? c + 0.7 : c, {}, RIB); else box(v, s > 0 ? c : c - 0.7, y, a - 0.28, s > 0 ? c + 0.7 : c, yT, a + 0.28, {}, RIB); }
      return [a0, ...pts, a1]; };
    const rx1 = ribs('z', Z0, Z1, X1, 1), rx0 = ribs('z', Z0, Z1, X0, -1); ribs('x', X0, X1, Z1, 1); ribs('x', X0, X1, Z0, -1);
    // X mega-braces on the street face and the back face of the lower two tiers (panels of ~5 floors)
    if (k < 2 && xb) for (const [xf, rs, s] of [[X1 + 0.35, rx1, 1], [X0 - 0.35, rx0, -1]]) {
      const ph = fh * 5; for (let yb = y + 1; yb + ph <= yT - 1; yb += ph) for (let i = 0; i < rs.length - 1; i++) {
        beam(v, [xf, yb, rs[i]], [xf, yb + ph, rs[i + 1]], 0.45, RIB, 0.5); beam(v, [xf, yb, rs[i + 1]], [xf, yb + ph, rs[i]], 0.45, RIB, 0.5); } void s;
    }
    if (!xb) for (const [xf, s] of [[X1, 1], [X0, -1]]) { const nf = Math.max(2, Math.round((Z1 - Z0) / 2.4)); // slim vertical fins
      for (let i = 1; i < nf; i++) { const a = Z0 + ((Z1 - Z0) * i) / nf; box(v, s > 0 ? xf : xf - 0.45, y + 0.5, a - 0.07, s > 0 ? xf + 0.45 : xf, yT - 3.2, a + 0.07, {}, RIB); } }
    if (!xb) for (const [zf, s] of [[Z1, 1], [Z0, -1]]) { const nf = Math.max(2, Math.round((X1 - X0) / 2.4));
      for (let i = 1; i < nf; i++) { const a = X0 + ((X1 - X0) * i) / nf; box(v, a - 0.07, y + 0.5, s > 0 ? zf : zf - 0.45, a + 0.07, yT - 3.2, s > 0 ? zf + 0.45 : zf, {}, RIB); } }
    // mechanical floor + setback terrace at the tier top: louvre band, neon reveal under the cornice, parapet
    const yl = yT - 3.0; const Lc = [0.24, 0.25, 0.27];
    for (const [a0, b0, a1, b1] of [[X0 - 0.15, Z1, X1 + 0.15, Z1 + 0.15], [X0 - 0.15, Z0 - 0.15, X1 + 0.15, Z0], [X1, Z0, X1 + 0.15, Z1], [X0 - 0.15, Z0, X0, Z1]]) box(v, a0, yl, b0, a1, yT, b1, {}, Lc);
    for (let yy = yl + 0.3; yy < yT - 0.2; yy += 0.42) { // louvre blades
      box(v, X0 - 0.35, yy, Z1 + 0.15, X1 + 0.35, yy + 0.08, Z1 + 0.35, {}, Lc); box(v, X0 - 0.35, yy, Z0 - 0.35, X1 + 0.35, yy + 0.08, Z0 - 0.15, {}, Lc);
      box(v, X1 + 0.15, yy, Z0 - 0.35, X1 + 0.35, yy + 0.08, Z1 + 0.35, {}, Lc); box(v, X0 - 0.35, yy, Z0 - 0.35, X0 - 0.15, yy + 0.08, Z1 + 0.35, {}, Lc); }
    for (const [a0, b0, a1, b1] of [[X0 - 0.4, Z1 + 0.3, X1 + 0.4, Z1 + 0.42], [X0 - 0.4, Z0 - 0.42, X1 + 0.4, Z0 - 0.3], [X1 + 0.3, Z0 - 0.4, X1 + 0.42, Z1 + 0.4], [X0 - 0.42, Z0 - 0.4, X0 - 0.3, Z1 + 0.4]]) box(nb, a0, yl - 0.25, b0, a1, yl - 0.12, b1, {}, glow);
    y = yT;
    if (k < nT - 1) { // next tier inset; this terrace gets parapet, plant and (wide ones) a drone pad
      const s = rand(3, 5); const ntx = tx - s, ntz = tz - s;
      rooftop(ctx, X0, Z0, X1, Z1, yT, 'pod', [[cx - ntx - 1.5, cz - ntz - 1.5, cx + ntx + 1.5, cz + ntz + 1.5]]);
      if (s > 4 && rng() < 0.5) dronePad(W, X1 - s / 2, yT + 1.2, cz, Math.min(1.6, s / 2 - 0.3), nb, v);
      tx = ntx; tz = ntz;
    }
  }
  // crown
  const T = tiers[tiers.length - 1]; const H = T.y1; const v = W.b('vcol', cx, cz), nb = W.b('neon', cx, cz);
  const crown = rng();
  if (crown < 0.4 && tx > 9 && tz > 9) helipad(W, cx, H, cz, Math.min(tx, tz) - 0.5, v, nb, rooftop, ctx, T);
  else if (crown < 0.68) { rooftop(ctx, T.X0, T.Z0, T.X1, T.Z1, H, 'any', [[cx - 3, cz - 3, cx + 3, cz + 3]]); mast(v, nb, cx, H, cz, rand(28, 52)); }
  else { // stepped spire crown with neon edges
    let s = Math.min(tx, tz); let yy = H;
    for (let i = 0; i < 3; i++) { const h = rand(4, 7); box(v, cx - s, yy, cz - s, cx + s, yy + h, cz + s, {}, i % 2 ? RIB : WALL); for (const [px, pz] of [[cx - s, cz - s], [cx + s, cz - s], [cx + s, cz + s], [cx - s, cz + s]]) box(nb, px - 0.1, yy, pz - 0.1, px + 0.1, yy + h, pz + 0.1, {}, glow); yy += h; s *= 0.62; }
    put(v, G.cyl8, cx, yy + 12, cz, 0.35, 24, 0.35, STEEL); put(nb, G.ball, cx, yy + 24.3, cz, 0.35, 0.35, 0.35, [1, 0.1, 0.08]);
  }
  // antennas / aviation lights on the tier corners
  for (const t of tiers) put(nb, G.ball, t.X1, t.y1 + 0.8, t.Z1, 0.18, 0.18, 0.18, [1, 0.12, 0.08]);
  // r6.3 building-maintenance unit on the top tier: roof rail ring, slewing jib, cables down to a cradle on one face
  if (rng() < 0.6) bmu(v, nb, T, H);
  return tiers;
}
// r6.3 tower skin pieces for one tier [X0..X1]x[Z0..Z1], y..yT:
//  * spandrel / panel bands every few floors (opaque, protruding) in rib or darker wall colour
//  * lit window clusters (emissive panes over whole office floors: warm / cool / teal) and dark vacant clusters
//  * a renovation patch: scaffold grid + netting with work lamps (some towers)
//  * a cantilevered sky-lobby pod on the street face (some towers)
//  * terrace clutter on the setback below (HVAC units, cooling towers)
const LITC = [[0.17, 0.13, 0.08], [0.15, 0.12, 0.09], [0.09, 0.12, 0.15], [0.05, 0.14, 0.13], [0.14, 0.14, 0.13]];
function towerSkin(W, v, nb, X0, Z0, X1, Z1, y, yT, fh, ww, RIB, WALL, k, fam, ctx, deps) {
  const G = kg(); const H = yT - y; const faces = [
    { F: edge([X1, Z1], [X1, Z0]) }, { F: edge([X0, Z0], [X0, Z1]) }, { F: edge([X1, Z0], [X0, Z0]) }, { F: edge([X0, Z1], [X1, Z1]) }];
  // spandrel bands
  if (rng() < 0.65) { const every = randi(5, 10), bh = rand(0.5, 1.1), dep = rand(0.18, 0.35); const bc = rng() < 0.5 ? RIB : WALL.map((q) => q * 0.7);
    for (let yy = y + every * fh; yy < yT - 4; yy += every * fh) { box(v, X0 - dep, yy, Z0 - dep, X1 + dep, yy + bh, Z0, {}, bc); box(v, X0 - dep, yy, Z1, X1 + dep, yy + bh, Z1 + dep, {}, bc);
      box(v, X0 - dep, yy, Z0, X0, yy + bh, Z1, {}, bc); box(v, X1, yy, Z0, X1 + dep, yy + bh, Z1, {}, bc); } }
  // window clusters
  for (const { F } of faces) {
    const n = Math.max(1, Math.round(F.len / ww)), bw = F.len / n; const nf = Math.floor((H - 3.2) / fh); if (nf < 3) continue;
    const nc = randi(1, 3) + (k === 0 ? 1 : 0);
    for (let i = 0; i < nc; i++) {
      const f0 = randi(0, Math.max(0, nf - 3)), f1 = Math.min(nf, f0 + randi(2, 7)), c0 = randi(0, Math.max(0, n - 3)), c1 = Math.min(n, c0 + randi(3, 10));
      const lit = rng() < 0.72; const base = pick(LITC); const b = lit ? nb : v;
      for (let f = f0; f < f1; f++) for (let c = c0; c < c1; c++) { if (rng() < 0.12) continue; const yy = y + f * fh + fh * 0.15, a0 = c * bw + bw * 0.12, a1 = (c + 1) * bw - bw * 0.12;
        const kk = lit ? rand(0.65, 1.25) : 1; const col = lit ? base.map((q) => q * kk) : [0.035, 0.038, 0.042];
        const A = F.P(a0, 0.06), B = F.P(a1, 0.06); b.quad(new THREE.Vector3(A[0], yy, A[1]), new THREE.Vector3(B[0], yy, B[1]), new THREE.Vector3(B[0], yy + fh * 0.66, B[1]), new THREE.Vector3(A[0], yy + fh * 0.66, A[1]), [0, 0, 1, 0, 1, 1, 0, 1], {}, col); }
    }
  }
  // renovation patch with scaffold + netting on one face
  if (k < 2 && rng() < 0.3) { const F = pick(faces).F; const n = Math.max(1, Math.round(F.len / ww)), bw = F.len / n; const nf = Math.floor((H - 3) / fh);
    if (nf > 6) { const f0 = randi(1, nf - 6), f1 = f0 + randi(4, 6), a0 = randi(0, Math.max(0, n - 6)) * bw, a1 = Math.min(F.len, a0 + randi(4, 7) * bw); const y0 = y + f0 * fh, y1 = y + f1 * fh; const d = 1.1, sc = [0.55, 0.56, 0.58];
      const net = [0.24, 0.33, 0.3]; const P = (a, dd, yy) => { const q = F.P(a, dd); return new THREE.Vector3(q[0], yy, q[1]); };
      v.quad(P(a0, d + 0.05, y0), P(a1, d + 0.05, y0), P(a1, d + 0.05, y1 + 1), P(a0, d + 0.05, y1 + 1), [0, 0, 1, 0, 1, 1, 0, 1], {}, net);
      for (let a = a0; a <= a1 + 0.01; a += 2.0) { const q = F.P(a, d), q2 = F.P(a, 0.3); beam(v, [q[0], y0 - 0.2, q[1]], [q[0], y1 + 1.2, q[1]], 0.06, sc, null, G.tube6); beam(v, [q2[0], y0 - 0.2, q2[1]], [q2[0], y1 + 1.2, q2[1]], 0.06, sc, null, G.tube6); }
      for (let yy = y0; yy <= y1 + 0.5; yy += 2.0) { const q = F.P(a0, d + 0.12), q2 = F.P(a1, d + 0.12); beam(v, [q[0], yy, q[1]], [q2[0], yy, q2[1]], 0.06, sc, null, G.tube6);
        const p0 = F.P(a0, 0.3), p1 = F.P(a1, 0.3); beam(v, [p0[0], yy - 0.1, p0[1]], [p1[0], yy - 0.1, p1[1]], 0.6, [0.5, 0.42, 0.3], 0.05); } // boards
      for (let i = 0; i < 4; i++) { const q = F.P(rand(a0, a1), d + 0.2); put(nb, G.box, q[0], rand(y0, y1), q[1], 0.25, 0.18, 0.12, [0.6, 0.6, 0.55]); } } }
  // sky-lobby pod cantilevered off the street face
  if (k < 2 && rng() < 0.3 && H > 30) { const ph = fh * randi(3, 5), py = y + rand(0.3, 0.7) * (H - ph); const pz = (Z0 + Z1) / 2 + rand(-0.2, 0.2) * (Z1 - Z0), pw = Math.min(Z1 - Z0 - 4, rand(10, 18)); const out = rand(2.5, 4.5);
    deps.volume(ctx, rect(X1, pz - pw / 2, X1 + out, pz + pw / 2), py, py + ph, { style: fam === 0 ? 2 : 0, fh, ww: rand(1.6, 2.2), wall: RIB.map((q) => q * 1.1 + 0.05), glass: [0.08, 0.14, 0.18], collide: false, lite: true, relief: false });
    box(v, X1, py - 0.6, pz - pw / 2 - 0.2, X1 + out + 0.2, py, pz + pw / 2 + 0.2, {}, RIB, false);
    for (const s of [-1, 1]) beam(v, [X1, py - fh * 2, pz + s * (pw / 2 - 0.5)], [X1 + out, py - 0.6, pz + s * (pw / 2 - 0.5)], 0.35, RIB);
    box(nb, X1 + 0.2, py - 0.68, pz - pw / 2, X1 + out, py - 0.62, pz + pw / 2, {}, pick(NEONC)); }
  // clutter on the terrace this tier stands on (k > 0: setback of the tier below)
  if (k > 0) { const n = randi(3, 8); for (let i = 0; i < n; i++) { const side = randi(0, 3); const t = rand(0.1, 0.9); const o = rand(1.2, 2.4);
    const x = side === 0 ? X1 + o : side === 1 ? X0 - o : X0 + (X1 - X0) * t, z = side === 2 ? Z0 - o : side === 3 ? Z1 + o : Z0 + (Z1 - Z0) * t;
    if (rng() < 0.6) { box(v, x - 0.7, y, z - 0.6, x + 0.7, y + 1.1, z + 0.6, {}, [0.6, 0.62, 0.64]); put(v, G.disc6, x, y + 1.12, z, 0.45, 0.04, 0.45, DARK); }
    else { put(v, G.cyl12, x, y + 1.2, z, 1.0, 2.4, 1.0, [0.7, 0.71, 0.7]); put(v, G.cyl12, x, y + 2.45, z, 0.85, 0.1, 0.85, DARK); } } }
}
// building-maintenance unit: rail ring inset from the roof edge, a slewing carriage with a jib over one face, hoist cables and a cradle
function bmu(v, nb, T, H) {
  const G = kg(); const ins = 1.6; const x0 = T.X0 + ins, x1 = T.X1 - ins, z0 = T.Z0 + ins, z1 = T.Z1 - ins; const rc = [0.45, 0.46, 0.48]; const y = H + 0.15;
  for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]]) beam(v, [a[0], y + 0.15, a[1]], [b[0], y + 0.15, b[1]], 0.25, rc, 0.3);
  const face = randi(0, 3); const t = rand(0.25, 0.75);
  const P = [[x1, z0 + (z1 - z0) * t, 1, 0], [x0, z0 + (z1 - z0) * t, -1, 0], [x0 + (x1 - x0) * t, z0, 0, -1], [x0 + (x1 - x0) * t, z1, 0, 1]][face];
  const [cx, cz, ox, oz] = P; const yc = y + 0.3; const bc = pick([[0.85, 0.85, 0.82], [0.9, 0.62, 0.1], [0.2, 0.22, 0.25]]);
  put(v, G.box, cx - ox * 1.6, yc + 1.0, cz - oz * 1.6, oz ? 2.4 : 4.2, 2.0, oz ? 4.2 : 2.4, bc); // carriage + counterweight
  put(v, G.box, cx - ox * 3.4, yc + 0.8, cz - oz * 3.4, oz ? 1.8 : 1.2, 1.4, oz ? 1.2 : 1.8, [0.3, 0.3, 0.32]);
  const mast = [cx - ox * 0.8, yc + 5.5, cz - oz * 0.8]; beam(v, [mast[0], yc + 2, mast[2]], mast, 0.5, bc);
  const tip = [cx + ox * (ins + 2.2), yc + 5.2, cz + oz * (ins + 2.2)]; beam(v, [cx - ox * 3.2, yc + 5.6, cz - oz * 3.2], tip, 0.45, bc, 0.6);
  beam(v, [cx - ox * 3.2, yc + 2.2, cz - oz * 3.2], mast, 0.12, bc); // backstay
  put(nb, G.ball, tip[0], tip[1] + 0.4, tip[2], 0.15, 0.15, 0.15, [1, 0.5, 0.05]);
  const drop = rand(18, Math.min(90, H * 0.6)); const cy = H - drop; const sx = oz, sz = -ox; const fx = tip[0], fz = tip[2];
  for (const s of [-1.6, 1.6]) tube(v, [fx + sx * s * 0.3, tip[1] - 0.2, fz + sz * s * 0.3], [fx + sx * s, cy + 1.2, fz + sz * s], 0.02, DARK, G.tube4);
  put(v, G.box, fx, cy, fz, sx ? 4.0 : 0.8, 0.15, sz ? 4.0 : 0.8, [0.6, 0.6, 0.62]); // cradle floor
  for (const yy of [cy + 0.55, cy + 1.1]) { put(v, G.box, fx + ox * 0.4, yy, fz + oz * 0.4, sx ? 4.0 : 0.05, 0.05, sz ? 4.0 : 0.05, bc); put(v, G.box, fx - ox * 0.4, yy, fz - oz * 0.4, sx ? 4.0 : 0.05, 0.05, sz ? 4.0 : 0.05, bc); }
  put(nb, G.box, fx + ox * 0.45, cy + 1.3, fz + oz * 0.45, 0.2, 0.12, 0.2, [0.9, 0.85, 0.6]);
}
function dronePad(W, x, y, z, r, nb, v) {
  const G = kg(); put(v, G.cyl12, x, y - 0.6, z, r, 1.2, r, [0.28, 0.29, 0.3]);
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; put(nb, G.box, x + Math.cos(t) * r * 0.9, y + 0.03, z + Math.sin(t) * r * 0.9, 0.12, 0.05, 0.12, [0.2, 1.0, 0.7]); }
}
function helipad(W, cx, H, cz, R, v, nb, rooftop, ctx, T) {
  const G = kg(); rooftop(ctx, T.X0, T.Z0, T.X1, T.Z1, H, 'pod', [[cx - R, cz - R, cx + R, cz + R]]);
  const r = Math.min(R, 11); const y = H + 3.2; const oct = []; for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8 * Math.PI * 2; oct.push([cx + Math.cos(t) * r, cz - Math.sin(t) * r]); }
  prismWalls(v, oct, y - 0.45, y, null, [0.3, 0.31, 0.32]); polyCap(v, oct, y, {}, [0.22, 0.23, 0.24]); polyCap(v, oct, y - 0.45, {}, [0.18, 0.18, 0.19], true);
  // struts from the roof to the deck rim + safety net frame
  for (let i = 0; i < 8; i++) { const [px, pz] = oct[i]; beam(v, [cx + (px - cx) * 0.45, H, cz + (pz - cz) * 0.45], [px, y - 0.45, pz], 0.3, STEEL); }
  for (let i = 0; i < 8; i++) { const a = oct[i], b = oct[(i + 1) % 8]; const oa = [cx + (a[0] - cx) * 1.12, cz + (a[1] - cz) * 1.12], ob = [cx + (b[0] - cx) * 1.12, cz + (b[1] - cz) * 1.12];
    beam(v, [oa[0], y - 0.3, oa[1]], [ob[0], y - 0.3, ob[1]], 0.06, STEEL); beam(v, [a[0], y - 0.3, a[1]], [oa[0], y - 0.3, oa[1]], 0.06, STEEL);
    put(nb, G.box, a[0], y + 0.06, a[1], 0.25, 0.1, 0.25, [0.2, 1.0, 0.35]); }
  // markings: touchdown circle (16 dashes) + H
  const mc = [0.92, 0.9, 0.82], yc = [0.95, 0.75, 0.1]; const rc = r * 0.62;
  for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; put(v, G.box, cx + Math.cos(t) * rc, y + 0.02, cz + Math.sin(t) * rc, 0.35, 0.04, rc * 0.28, yc, -t); }
  const hs = r * 0.3; box(v, cx - hs, y, cz - hs * 0.8, cx - hs + 0.6, y + 0.04, cz + hs * 0.8, {}, mc); box(v, cx + hs - 0.6, y, cz - hs * 0.8, cx + hs, y + 0.04, cz + hs * 0.8, {}, mc); box(v, cx - hs, y, cz - 0.3, cx + hs, y + 0.04, cz + 0.3, {}, mc);
  // windsock mast
  put(v, G.cyl8, cx + r * 0.95, H + 4, cz, 0.06, 8, 0.06, STEEL); put(v, G.cyl8, cx + r * 0.95 + 0.5, H + 7.6, cz, 0.18, 1.0, 0.18, [0.95, 0.4, 0.1], 0);
}
// lattice antenna mast: 4 tapering legs + ring and diagonal braces + whips, aviation lights
function mast(v, nb, cx, H, cz, mh) {
  const G = kg(); box(v, cx - 2.6, H, cz - 2.6, cx + 2.6, H + 3, cz + 2.6, {}, [0.3, 0.31, 0.33]);
  const y0 = H + 3; const r0 = 1.8, r1 = 0.3; const leg = (t, sx, sz) => { const r = r0 + (r1 - r0) * t; return [cx + sx * r, y0 + mh * t, cz + sz * r]; };
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; const met = [0.62, 0.64, 0.66];
  for (const [sx, sz] of C) beam(v, leg(0, sx, sz), leg(1, sx, sz), 0.16, met);
  const n = Math.round(mh / 4);
  for (let i = 1; i <= n; i++) { const t0 = (i - 1) / n, t1 = i / n;
    for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4]; beam(v, leg(t1, ...a), leg(t1, ...b), 0.07, met); beam(v, leg(t0, ...(i % 2 ? a : b)), leg(t1, ...(i % 2 ? b : a)), 0.05, met); } }
  put(v, G.cyl8, cx, y0 + mh + 5, cz, 0.12, 10, 0.12, met);
  for (const t of [0.5, 1.0]) put(nb, G.ball, cx + r1, y0 + mh * t, cz, 0.25, 0.25, 0.25, [1, 0.1, 0.08]);
  put(nb, G.ball, cx, y0 + mh + 10.2, cz, 0.3, 0.3, 0.3, [1, 0.1, 0.08]);
  // dish antennas on two legs + two whip antennas on the base
  for (const [t, sx, sz] of [[0.3, 1, 1], [0.55, -1, 1]]) { const p = leg(t, sx, sz); _dish(v, p[0] + sx * 0.8, p[1], p[2] + sz * 0.8, Math.atan2(sx, sz)); }
  for (const [ox, oz] of [[2.2, -2.2], [-2.2, 2.2]]) put(v, G.cyl8, cx + ox, H + 3 + 5, cz + oz, 0.05, 10, 0.05, met);
}
const _dg = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.32); _dg.rotateX(Math.PI / 2);
function _dish(v, x, y, z, ry) { put(v, _dg, x, y, z, 1.1, 1.1, 1.1, [0.85, 0.86, 0.86], ry); }

// ------------------------------------------------------------------ tenement ----
// deps: { volume, rooftop }. Returns nothing; everything goes into ctx.W.
export function tenement(ctx, x0, z0, x1, z1, deps) {
  const { volume, rooftop } = deps; const W = ctx.W;
  const floors = randi(4, 9); const fh = 3.1, ground = 4.4; const top = 0.15 + ground + (floors - 1) * fh;
  const wall = pick([[0.62, 0.58, 0.52], [0.55, 0.6, 0.58], [0.7, 0.62, 0.55], [0.5, 0.52, 0.56], [0.66, 0.5, 0.46], [0.74, 0.72, 0.66], [0.45, 0.5, 0.42]]);
  const ww = rand(2.6, 3.2); const sw = rand(3.6, 4.6);
  volume(ctx, rect(x0, z0, x1, z1), 0.15, top, { style: 2, fh, ww, wall, glass: [0.1, 0.12, 0.13], store: true, storeW: sw, ground, canopy: false });
  shopStreet(ctx, x1, z0, z1, 0.15, ground, sw, { grit: 0.9, hang: 0.6 });
  // facades: front (x1, full dressing) + both sides (lighter); window bays line up with the facade shader (n = round(len / ww))
  const yF0 = 0.15 + ground; const poly = rect(x0, z0, x1, z1);
  const faces = [{ F: edge(poly[1], poly[2]), main: true }, { F: edge(poly[0], poly[1]), main: false }, { F: edge(poly[2], poly[3]), main: false }];
  const fe = rng() < 0.55 ? 0 : (rng() < 0.5 ? 1 : 2); // fire escape on the front or a side
  for (let fi = 0; fi < faces.length; fi++) {
    const { F, main } = faces[fi]; if (F.len < 6) continue; const n = Math.max(1, Math.round(F.len / ww)); const cw = F.len / n;
    let skip0 = -1, skip1 = -1; const br = []; // r6.3 bracket points -> drip / rust streaks below them
    if (fi === fe && floors > 2) { const nb = Math.max(1, Math.round(3.6 / cw)); const c0 = Math.max(0, Math.floor(n / 2 - nb / 2) + (rng() < 0.5 ? -1 : 1) * randi(0, Math.max(0, Math.floor(n / 2) - nb)));
      skip0 = c0; skip1 = c0 + nb; fireEscape(W, F, (c0 + nb / 2) * cw, yF0 + fh * 0.0 + 0.05, top - 0.5, fh, nb * cw - 0.3);
      for (let y = yF0; y < top - 1; y += fh) for (const s of [-1, 1]) br.push({ a: (c0 + nb / 2) * cw + s * (nb * cw / 2 - 0.3), y: y - 0.5, rust: 0.9, p: 0.8 }); }
    for (let k = 0; k < floors - 1; k++) {
      const yf = yF0 + k * fh;
      for (let c = 0; c < n; c++) {
        if (c >= skip0 && c < skip1) continue; const ac = (c + 0.5) * cw; const r = rng();
        if (r < (main ? 0.14 : 0.04)) { cageBalcony(W, F, ac, yf + 0.02, Math.min(cw * 0.95, 3.2), fh); br.push({ a: ac - cw * 0.4, y: yf - 0.12, rust: 0.6 }, { a: ac + cw * 0.4, y: yf - 0.12, rust: 0.6 }); }
        else if (r < (main ? 0.5 : 0.24)) { const aa = ac + (rng() < 0.5 ? 0 : (rng() < 0.5 ? -1 : 1) * cw * 0.3); acUnit(W, F, aa, yf + fh * 0.04 + 0.05); br.push({ a: aa, y: yf + fh * 0.04 - 0.25, rust: 0.25 }); }
      }
    }
    grime(W, F, yF0, top, wall, br, { k: main ? 1.2 : 1, cw });
    // laundry strung along the front between window brackets on a few floors
    if (main && floors > 3) for (let i = 0; i < randi(1, 3); i++) { const k = randi(0, floors - 3); const yl = yF0 + k * fh + rand(1.9, 2.3); const c0 = randi(0, Math.max(0, n - 3)); const c1 = Math.min(n, c0 + randi(2, 3));
      const A = F.P(c0 * cw + 0.3, rand(0.55, 0.8)), B = F.P(c1 * cw - 0.3, rand(0.55, 0.8));
      for (const [q, aa] of [[A, c0 * cw + 0.3], [B, c1 * cw - 0.3]]) beam(W.b('vcolD', q[0], q[1]), [F.P(aa, 0)[0], yl, F.P(aa, 0)[1]], [q[0], yl, q[1]], 0.025, RUST);
      laundryLine(W, [A[0], yl, A[1]], [B[0], yl, B[1]], rand(0.12, 0.3)); }
    // conduits + cable bundles sagging along the facade between brackets
    const v = W.b('vcolD', F.P(0, 0)[0], F.P(0, 0)[1]);
    if (main || rng() < 0.5) {
      const nCab = main ? randi(2, 4) : 1;
      for (let i = 0; i < nCab; i++) { const yy = yF0 + rand(0.2, Math.max(0.3, (floors - 2) * fh)); const a0 = rand(0.2, F.len * 0.3), a1 = rand(F.len * 0.6, F.len - 0.2);
        const A = F.P(a0, 0.25), B = F.P(a1, 0.25); cableBundle(v, [A[0], yy, A[1]], [B[0], yy + rand(-1.5, 1.5), B[1]], rand(0.4, 1.4));
        for (const [q, yq] of [[A, yy], [B, yy]]) put(v, kg().box, q[0], yq + 0.05, q[1], 0.12, 0.18, 0.12, DARK); }
      // vertical conduit / drain pipe runs from the roof to the shop band
      for (let i = 0; i < (main ? 2 : 1); i++) { const a = rand(0.3, F.len - 0.3); const A = F.P(a, 0.12); tube(v, [A[0], 0.6, A[1]], [A[0], top, A[1]], rand(0.04, 0.07), pick([[0.3, 0.3, 0.3], [0.5, 0.5, 0.48], [0.25, 0.3, 0.28]]), kg().tube6); }
    }
  }
  // a big vertical neon blade on the upper floors of tall tenements (hotel / karaoke / clinic style)
  if (floors >= 6 && rng() < 0.6) { const F = faces[0].F; const a = rng() < 0.5 ? 0.5 : F.len - 0.5; const h = Math.min((floors - 2) * fh, rand(6, 12)); const w = rand(1.2, 1.8);
    const q = F.P(a, 0.4 + w / 2); neonSign(W, [q[0], top - 1.2 - h / 2, q[1]], [F.ox, 0, F.oz], w, h, { blade: true, glyphs: randGlyphs(Math.max(3, Math.min(5, Math.floor(h / (w * 1.05))))), r: 0.05, t: 0.3, alt: true }); }
  rooftop(ctx, x0, z0, x1, z1, top, 'mid');
  // rooftop shanty additions: a corrugated shack + antenna forest + a billboard frame
  const v = W.b('vcol', (x0 + x1) / 2, (z0 + z1) / 2); const G = kg();
  if (rng() < 0.6 && x1 - x0 > 9) { const sx = rand(x0 + 1, x1 - 6), sz = rand(z0 + 1, z1 - 5); const sc = pick([[0.45, 0.42, 0.38], [0.35, 0.42, 0.45], [0.5, 0.35, 0.28]]);
    box(v, sx, top, sz, sx + 4.5, top + 2.4, sz + 3.5, {}, sc); const Vt = (x, y, z) => new THREE.Vector3(x, y, z);
    v.quad(Vt(sx - 0.3, top + 2.8, sz - 0.3), Vt(sx - 0.3, top + 2.8, sz + 3.8), Vt(sx + 4.8, top + 2.35, sz + 3.8), Vt(sx + 4.8, top + 2.35, sz - 0.3), [0, 0, 1, 0, 1, 1, 0, 1], {}, [0.38, 0.3, 0.26]);
    v.quad(Vt(sx + 4.8, top + 2.33, sz - 0.3), Vt(sx + 4.8, top + 2.33, sz + 3.8), Vt(sx - 0.3, top + 2.78, sz + 3.8), Vt(sx - 0.3, top + 2.78, sz - 0.3), [0, 0, 1, 0, 1, 1, 0, 1], {}, [0.2, 0.18, 0.16]); }
  for (let i = 0; i < randi(1, 4); i++) { const ax = rand(x0 + 1, x1 - 1), az = rand(z0 + 1, z1 - 1), ah = rand(3, 7); put(v, G.cyl8, ax, top + ah / 2, az, 0.04, ah, 0.04, STEEL);
    for (let k = 0; k < 3; k++) put(v, G.box, ax, top + ah * (0.55 + k * 0.15), az, rand(0.8, 1.6), 0.03, 0.03, STEEL, rand(0, 3)); }
  for (let i = 0; i < randi(0, 3); i++) { // r6.3 solar water heaters: tilted collector + horizontal tank on a steel frame
    const sx = rand(x0 + 1.5, x1 - 3), sz = rand(z0 + 1.5, z1 - 2.5); const Vt = (x, y, z) => new THREE.Vector3(x, y, z);
    v.quad(Vt(sx, top + 0.3, sz), Vt(sx, top + 0.3, sz + 2), Vt(sx + 1.4, top + 1.3, sz + 2), Vt(sx + 1.4, top + 1.3, sz), [0, 0, 1, 0, 1, 1, 0, 1], {}, [0.1, 0.12, 0.16]);
    v.geom(G.cyl8, new THREE.Matrix4().makeTranslation(sx + 1.6, top + 1.55, sz + 1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(0.28, 2.2, 0.28)), {}, [0.8, 0.8, 0.78]);
    for (const zz of [sz + 0.2, sz + 1.8]) { beam(v, [sx + 1.4, top, zz], [sx + 1.4, top + 1.3, zz], 0.05, STEEL); beam(v, [sx + 1.6, top, zz], [sx + 1.6, top + 1.4, zz], 0.05, STEEL); } }
  if (rng() < 0.45) { // rooftop billboard frame facing the street with a tube-neon face
    const zc = (z0 + z1) / 2, bw = Math.min(z1 - z0 - 2, rand(7, 11)), bh = bw * 0.38, by = top + 2.2;
    for (const zz of [zc - bw * 0.4, zc + bw * 0.4]) { beam(v, [x1 - 1.2, top, zz], [x1 - 1.2, by + bh, zz], 0.18, DARK); beam(v, [x1 - 3.2, top, zz], [x1 - 1.2, by + bh * 0.6, zz], 0.12, DARK); }
    neonSign(W, [x1 - 0.95, by + bh / 2, zc], [0, 0, -1], bw, bh, { glyphs: randGlyphs(Math.max(2, Math.min(4, Math.floor(bw / bh)))), r: 0.07, t: 0.35, gap: 0.1, alt: true });
  }
}
void cable;
