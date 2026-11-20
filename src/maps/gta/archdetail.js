// r6.2 per-archetype geometric detail for map A 索拉纳港 (see bldgdetail.js for the primitives and the streaming).
// Each function draws into a World W (one streamed chunk) and is deterministic for its arguments + local seed.
import * as THREE from 'three';
import { prismWalls, polyCap, rect } from '../../geo.js';
import { mulb, seedOf, frame, fbox, edgesOf, lb, wind, geos, put, COL, mix, downspout, door, signBoard, bladeSign, wallAC, grille, railing, roofKit, slope } from './bldgdetail.js';

const BOARD = [[0.12, 0.28, 0.2], [0.1, 0.16, 0.3], [0.45, 0.1, 0.12], [0.93, 0.9, 0.82], [0.1, 0.1, 0.11], [0.75, 0.5, 0.16], [0.2, 0.42, 0.48], [0.55, 0.2, 0.3]];
const TRIM = [[0.95, 0.92, 0.84], [0.82, 0.68, 0.34], [0.12, 0.12, 0.13], [0.9, 0.9, 0.9]];
const CANVAS = [[0.16, 0.34, 0.3], [0.62, 0.16, 0.14], [0.14, 0.2, 0.36], [0.86, 0.82, 0.72], [0.2, 0.22, 0.24], [0.78, 0.52, 0.2]];
const pk = (r, a) => a[Math.floor(r() * a.length) % a.length];
// window rows of the facade shader on a wall spanning [ya, yb]: absolute rows k*fh, opening f.y in [0.28, 0.80]
function rows(ya, yb, fh) { const o = []; for (let k = Math.floor(ya / fh); k * fh < yb; k++) { const w0 = k * fh + fh * 0.28, w1 = k * fh + fh * 0.8; if (w0 >= ya + 0.05 && w1 <= yb - 0.05) o.push([w0, w1]); } return o; }
const cells = (len, ww) => { const n = Math.max(1, Math.round(len / ww)); return { n, cw: len / n }; };

// punched (style 2) or ribbon (style 5) window trim on one wall: projecting sill + drip hood, or sill band + mullion fins
export function windowTrim(bk, E, ya, yb, fh, ww, style, wall, r, acP = 0) {
  const { n, cw } = cells(E.len, ww); const light = mix(wall, 1.08, 0.04);
  for (const [w0, w1] of rows(ya, yb, fh)) {
    if (style === 5) {
      lb(bk, E, 0.05, E.len - 0.05, -0.02, 0.14, w0 - 0.09, w0, light, true);
      for (let k = 1; k < n; k++) lb(bk, E, k * cw - 0.05, k * cw + 0.05, -0.02, 0.09, w0, w1, COL.dkalu);
      for (let k = 0; k < n; k++) for (const t of [1 / 3, 2 / 3]) lb(bk, E, (k + t) * cw - 0.025, (k + t) * cw + 0.025, -0.13, -0.08, w0, w1, COL.dkalu); // glazing bars in the reveal
    } else for (let k = 0; k < n; k++) {
      const a0 = (k + 0.2) * cw, a1 = (k + 0.8) * cw;
      lb(bk, E, a0 - 0.1, a1 + 0.1, -0.02, 0.15, w0 - 0.08, w0, light, true);
      lb(bk, E, a0 - 0.14, a1 + 0.14, -0.02, 0.2, w1, w1 + 0.1, light, true);
      if (acP && r() < acP) wallAC(bk, E, (a0 + a1) / 2, w0 - 0.62);
    }
  }
}

// ======================================================================== 1. Art Deco hotel =====
// p: {x0,z0,x1,z1,facing,poly,top,ground,floors,fh,style,ww,wall,accent,R,pylon:{z,w}|null,small}
export function decoHotelDetail(W, p) {
  const r = mulb(seedOf(p.x0, p.z0, 11)); const bk = W.b('vcol', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
  const s = p.facing; const fx = s > 0 ? p.x1 : p.x0; const yG = 0.15 + p.ground; const light = mix(p.wall, 1.06);
  const E = edgesOf(p.poly);
  for (const e of E) {
    if (e.len < 3) continue; // rounded-corner facets
    const front = e.ox * s > 0.9, back = e.ox * s < -0.9;
    // window trim: front only for ribbon windows (style 2 fronts have facadeDetail jambs/sills already), sides + back always
    if (!front || p.style === 5) windowTrim(bk, e, yG, p.top, p.fh, p.ww, p.style, p.wall, r, front ? 0 : 0.14);
    if (back || (!front && e.len > 15)) { downspout(bk, e, 0.7, 0.15, p.top + 1.2); if (e.len > 22) downspout(bk, e, e.len - 0.7, 0.15, p.top + 1.2); }
    if (!front && !back && e.len > 9 && r() < 0.7) door(bk, e, e.len * (0.55 + r() * 0.3), 0.95, 2.15, 0.15, { leaf: mix(p.wall, 0.7), frame: COL.dkalu, canopy: 0.8, canopyCol: light }); // service door
    if (front && e.len > 8) {
      // Deco entrance portal: stepped surround, double glass doors with a transom, terrazzo landing
      const zc = p.pylon ? p.pylon.z : (p.z0 + p.z1) / 2; const a = (zc - e.p[1]) * e.dz + (fx - e.p[0]) * e.dx;
      if (a > 2 && a < e.len - 2) {
        door(bk, e, a, 1.9, 2.4, 0.15, { double: true, transom: true, frame: [0.78, 0.66, 0.4], leaf: COL.glass });
        for (const sg of [-1, 1]) { const ax = a + sg * 1.45; lb(bk, e, ax - 0.28, ax + 0.28, -0.02, 0.32, 0.15, 3.85, light); lb(bk, e, ax - 0.2, ax + 0.2, 0.32, 0.36, 0.5, 3.6, p.accent); }
        lb(bk, e, a - 1.85, a + 1.85, -0.02, 0.4, 3.45, 3.85, light, true); lb(bk, e, a - 1.4, a + 1.4, -0.02, 0.36, 3.85, 4.1, light, true); lb(bk, e, a - 0.9, a + 0.9, -0.02, 0.32, 4.1, 4.3, p.accent, true);
        lb(bk, e, a - 1.6, a + 1.6, 0, 1.6, 0.15, 0.19, [0.82, 0.78, 0.72]); // terrazzo landing
      }
    }
  }
  // rooftop behind the parapet (keep the front 3 m clear for the pylon / ziggurats)
  const F = frame(0, 0); const ax0 = s > 0 ? p.x0 + 0.6 : p.x0 + 3.2, ax1 = s > 0 ? p.x1 - 3.2 : p.x1 - 0.6;
  roofKit(bk, F, ax0, ax1, p.z0 + 0.8 + p.R * 0.5, p.z1 - 0.8 - p.R * 0.5, p.top, r, { wall: p.wall, tankP: 0.4, maxAC: 6, excl: p.pylon ? [[fx - 2.5, p.pylon.z - p.pylon.w, fx + 2.5, p.pylon.z + p.pylon.w]] : [] });
}

// ======================================================================== 2. stucco / modern midrise =====
// p: {x0,z0,x1,z1,floors,fh,top,modern,wall,ww,frontX}
export function midriseDetail(W, p) {
  const r = mulb(seedOf(p.x0, p.z0, 12)); const bk = W.b('vcol', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
  const poly = rect(p.x0, p.z0, p.x1, p.z1); const E = edgesOf(poly);
  for (const e of E) {
    const frontX = Math.abs(e.ox) > 0.9 && Math.abs((e.ox > 0 ? p.x1 : p.x0) - p.frontX) < 0.1;
    if (!p.modern) { downspout(bk, e, 0.5, 0.15, p.top + 1.05); if (r() < 0.5) for (const [w0] of rows(4.75, p.top, p.fh)) { const { n, cw } = cells(e.len, p.ww); for (let k = 0; k < n; k++) if (r() < 0.1) wallAC(bk, e, (k + 0.5) * cw, w0 - 0.62); } }
    if (e.len < 6) continue;
    // shops: one painted fascia board per bay on the street face(s), a blade sign at the corner
    if (frontX || (e.len > 14 && r() < 0.5)) {
      const sw = 4.5; const n = Math.max(1, Math.round(e.len / sw)); const cw = e.len / n; const brd = pk(r, BOARD), trim = pk(r, TRIM);
      let k = 0; while (k < n) { const span = Math.min(n - k, 1 + Math.floor(r() * 2)); const a0 = k * cw + 0.3, a1 = (k + span) * cw - 0.3; const bc = r() < 0.5 ? brd : pk(r, BOARD); signBoard(bk, e, a0, a1, 3.95, 0.5, bc, trim);
        if (!p.modern && r() < 0.65) slope(bk, e, a0 + 0.1, a1 - 0.1, 0.02, 1.35, 3.8, 3.05, pk(r, CANVAS)); // canvas shop awning under the fascia
        k += span; }
      if (frontX) { const a = cw * (Math.floor(r() * n) + 0.5); door(bk, e, a, 1.2, 2.3, 0.15, { frame: COL.dkalu, leaf: COL.glass, canopy: p.modern ? 1.4 : 0, canopyCol: COL.dkalu });
        if (p.floors > 2 && !p.modern) bladeSign(bk, e, e.len - 0.8, 5.0, 2.2, pk(r, BOARD), pk(r, TRIM)); }
    }
  }
  // roof: stair core + hatch / vents / dish / mast, kept clear of the base rooftop()'s penthouse, condensers and tank (p.rused)
  roofKit(bk, frame(0, 0), p.x0 + 0.4, p.x1 - 0.4, p.z0 + 0.4, p.z1 - 0.4, p.top, r, { wall: p.wall, maxAC: 2, tank: false, mast: false, excl: p.rused || [] });
}

// ======================================================================== 3. bay condo tower (island) =====
// p: {x0,x1,z,hz, sx0,sx1,sz0,sz1, top, fh}
export function condoTowerDetail(W, p) {
  const r = mulb(seedOf(p.x0, p.z, 13)); const bk = W.b('vcol', (p.x0 + p.x1) / 2, p.z); const Gm = geos();
  const pod = rect(p.x0, p.z - p.hz, p.x1, p.z + p.hz);
  // porte-cochère on the street (east) side: slab on four round columns, lobby doors
  const e = edgesOf(pod).find((q) => q.ox > 0.9); if (e) { const a = e.len / 2;
    lb(bk, e, a - 5, a + 5, 0, 7.5, 4.0, 4.45, [0.93, 0.93, 0.91], true); lb(bk, e, a - 5.05, a + 5.05, 7.45, 7.6, 3.85, 4.6, COL.dkalu, true);
    for (const da of [-4.4, 4.4]) { const c = e.P(a + da, 6.9); put(bk, Gm.cyl, c[0], 0.15, c[1], [0.9, 0.9, 0.88], 0.22, 3.85, 0.22); }
    door(bk, e, a, 2.4, 2.6, 0.15, { double: true, transom: true, frame: COL.dkalu, leaf: COL.glass });
    lb(bk, e, a - 4.5, a + 4.5, 0, 7.5, 0.15, 0.19, [0.7, 0.68, 0.64]); }
  // podium roof: glass guard + planters around the tower
  { const g = W.b('glassRail', (p.x0 + p.x1) / 2, p.z); prismWalls(g, rect(p.x0 + 0.2, p.z - p.hz + 0.2, p.x1 - 0.2, p.z + p.hz - 0.2), 5.15, 6.2, null);
    railing(bk, [[p.x0 + 0.15, p.z + p.hz - 0.15], [p.x1 - 0.15, p.z + p.hz - 0.15], [p.x1 - 0.15, p.z - p.hz + 0.15], [p.x0 + 0.15, p.z - p.hz + 0.15], [p.x0 + 0.15, p.z + p.hz - 0.15]], 6.15, 0.08, COL.dkalu, 40);
    for (let x = p.x0 + 2; x < p.x1 - 2; x += 4) for (const z of [p.z - p.hz + 1.2, p.z + p.hz - 1.2]) { if (z > p.sz0 - 1.8 && z < p.sz1 + 1.8) continue; fbox(bk, frame(0, 0), x - 1.2, x + 1.2, z - 0.5, z + 0.5, 5.15, 5.75, [0.6, 0.58, 0.55]); fbox(bk, frame(0, 0), x - 1.1, x + 1.1, z - 0.4, z + 0.4, 5.75, 5.95, COL.green); } }
  // crown: building-maintenance unit on a track + lightning rods at the corners
  const F = frame(0, 0); const y = p.top;
  fbox(bk, F, p.sx0 + 1.5, p.sx1 - 1.5, p.sz0 + 1.2, p.sz0 + 1.5, y + 0.1, y + 0.3, COL.steel); fbox(bk, F, p.sx0 + 1.5, p.sx1 - 1.5, p.sz1 - 1.5, p.sz1 - 1.2, y + 0.1, y + 0.3, COL.steel);
  const bx = p.sx0 + (p.sx1 - p.sx0) * (0.25 + r() * 0.5); fbox(bk, F, bx - 1.2, bx + 1.2, p.sz0 + 1, p.sz1 - 1, y + 1.2, y + 2.4, [0.88, 0.88, 0.86]); fbox(bk, F, bx - 0.4, bx + 0.4, p.sz0 + 1.6, p.sz0 + 2.4, y + 2.4, y + 4.6, [0.88, 0.88, 0.86]);
  fbox(bk, F, bx - 0.25, bx + 0.25, p.sz0 - 1.8, p.sz0 + 2.4, y + 4.3, y + 4.75, [0.88, 0.88, 0.86]);
  for (const [cx, cz] of [[p.sx0 + 0.4, p.sz0 + 0.4], [p.sx1 - 0.4, p.sz0 + 0.4], [p.sx1 - 0.4, p.sz1 - 0.4], [p.sx0 + 0.4, p.sz1 - 0.4]]) put(bk, Gm.cyl6, cx, y + 1.0, cz, COL.steel, 0.025, 2.2, 0.025);
}

// ======================================================================== 4. skyline glass / condo / office tower =====
// p: {kind, poly, cx, cz, w, d, h}
export function towerDetail(W, p) {
  const r = mulb(seedOf(p.cx, p.cz, 14)); const bk = W.b('vcol', p.cx, p.cz); const Gm = geos(); const E = edgesOf(p.poly);
  const mull = [0.42, 0.45, 0.48], band = [0.5, 0.52, 0.55];
  if (p.kind === 0 || p.kind === 1) { // curtain wall: deep vertical mullion fins every module, spandrel caps every 2nd floor, base canopy
    for (const e of E) { const { n, cw } = cells(e.len, p.kind === 1 ? 99 : 2);
      if (p.kind === 1) { lb(bk, e, -0.06, 0.06, -0.02, 0.35, 0, p.h, mull); } else for (let k = 0; k <= n; k += 2) lb(bk, e, k * cw - 0.06, k * cw + 0.06, -0.02, k % 4 ? 0.22 : 0.42, 0.15, p.h, mull);
      for (let y = 3.8 * 2; y < p.h - 2; y += 3.8 * 2) lb(bk, e, 0, e.len, -0.02, 0.1, y, y + 0.22, band, true);
      if (e.len > 10) { lb(bk, e, e.len * 0.2, e.len * 0.8, 0, 3.2, 4.6, 4.9, COL.dkalu, true); door(bk, e, e.len / 2, 2.4, 2.7, 0.15, { double: true, frame: COL.dkalu, leaf: COL.glass }); }
    }
  } else if (p.kind === 2) { // residential: balcony slab every floor on the two long faces + glass guards
    const g = W.b('glassRail', p.cx, p.cz);
    for (const e of E) { if (e.len < 12) continue; for (let y = 3.2 + 0.15 + 4; y < p.h - 3; y += 3.2) { lb(bk, e, 0.6, e.len - 0.6, -0.02, 1.4, y - 0.2, y, [0.94, 0.94, 0.92], true);
        prismWalls(g, wind([e.P(0.65, 1.35), e.P(e.len - 0.65, 1.35), e.P(e.len - 0.65, 1.3), e.P(0.65, 1.3)]), y, y + 1.0, null); } }
  } else { // office: piers on every 2nd window column + projecting floor slabs every 3rd floor
    for (const e of E) { const { n, cw } = cells(e.len, 2.2); for (let k = 0; k <= n; k += 2) lb(bk, e, k * cw - 0.18, k * cw + 0.18, -0.02, 0.3, 0.15, p.h, mix(p.wall || [0.85, 0.82, 0.78], 1.04));
      for (let y = 3.6 * 3; y < p.h - 2; y += 3.6 * 3) lb(bk, e, -0.3, e.len + 0.3, -0.02, 0.35, y - 0.3, y, mix(p.wall || [0.85, 0.82, 0.78], 1.08), true); }
  }
  // crown: parapet + louvred plant screen + BMU / spire
  const xs = p.poly.map((q) => q[0]), zs = p.poly.map((q) => q[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const F = frame(0, 0); const sx = (x1 - x0) * 0.28, sz = (z1 - z0) * 0.28; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const e of E) lb(bk, e, 0, e.len, -0.25, 0, p.h, p.h + 1.1, p.kind === 2 || p.kind === 3 ? [0.9, 0.88, 0.85] : mull);
  fbox(bk, F, cx - sx, cx + sx, cz - sz, cz + sz, p.h, p.h + 3.6, [0.55, 0.57, 0.58]);
  for (const e of edgesOf(rect(cx - sx, cz - sz, cx + sx, cz + sz))) for (let y = p.h + 0.4; y < p.h + 3.4; y += 0.35) lb(bk, e, 0, e.len, -0.02, 0.12, y, y + 0.08, COL.alu);
  roofKit(bk, F, x0 + 0.8, x1 - 0.8, z0 + 0.8, z1 - 0.8, p.h, r, { stair: false, maxAC: 4, tank: false, excl: [[cx - sx - 0.5, cz - sz - 0.5, cx + sx + 0.5, cz + sz + 0.5]] });
  if (r() < 0.35 && p.h > 70) { put(bk, Gm.cyl, cx, p.h + 3.6, cz, COL.steel, 0.35, 6, 0.35); put(bk, Gm.cone, cx, p.h + 9.6, cz, COL.steel, 0.35, 10, 0.35); }
}

// ======================================================================== 5/6/7. mainland lots (villa, warehouse, Latin shops, condos) =====
export function lotDetail(W, L) {
  if (L.empty) return; const r = mulb(L.id * 2654435761 + 99); const bk = W.b('vcol', L.cx, L.cz); const F = frame(L.cx, L.cz, L.ux, L.uz);
  const fs = L.face[0] * -L.uz + L.face[1] * L.ux > 0 ? 1 : -1; const Gm = geos();
  if (L.zone === 'mansion') return villa(W, L, r, bk, F, fs, Gm);
  if (L.zone === 'mural') return warehouse(W, L, r, bk, F, fs, Gm);
  const E = edgesOf(L.poly); const street = (e) => e.ox * L.face[0] + e.oz * L.face[1] > 0.7;
  for (const e of E) {
    if (e.len < 4) continue;
    windowTrimRegion(bk, e, L, r);
    if (street(e)) {
      const sw = 4.5; const n = Math.max(1, Math.round(e.len / sw)); const cw = e.len / n; const brd = pk(r, BOARD), trim = pk(r, TRIM);
      signBoard(bk, e, 0.4, e.len - 0.4, 3.95, 0.55, brd, trim);
      const da = cw * (Math.floor(r() * n) + 0.5); door(bk, e, da, 1.1, 2.3, 0, { frame: COL.dkalu, leaf: COL.glass });
      for (let k = 0; k < n; k++) if (Math.abs((k + 0.5) * cw - da) > 1 && r() < 0.25) grille(bk, e, k * cw + 0.35, (k + 1) * cw - 0.35, 0.45, 3.5);
      if (L.floors > 1 && r() < 0.6) bladeSign(bk, e, r() < 0.5 ? 0.7 : e.len - 0.7, 4.9, 1.8, pk(r, BOARD), trim);
      downspout(bk, e, 0.3, 0, L.top + 0.7);
    } else if (e.len > 8 && r() < 0.6) downspout(bk, e, e.len - 0.3, 0, L.top + 0.7);
  }
  // roof: vents, hatch, dish, mast on top of the existing condensers / tank (no stair core on 1–3 storey shops)
  roofKit(bk, F, -L.hl + 0.6, L.hl - 0.6, -L.hw + 0.6, L.hw - 0.6, L.top, r, { stair: L.zone === 'condo' && L.floors > 4, maxAC: 0, tank: false, vents: 3 });
}
function windowTrimRegion(bk, e, L, r) {
  // region lots already get piers / spandrels / sills from H.volume(relief) -> only through-wall AC units under some windows.
  // ww is re-derived exactly as region.js detailedLot did (first draw of its mulberry(L.id*104729+7) stream), so units sit under real windows
  if (L.zone === 'condo') return; const ww = 2.6 + mulb(L.id * 104729 + 7)();
  const { n, cw } = cells(e.len, ww); for (const [w0] of rows(4.6, L.top, L.fh)) for (let k = 0; k < n; k++) if (r() < 0.12) wallAC(bk, e, (k + 0.5) * cw, w0 - 0.62);
}

function villa(W, L, r, bk, F, fs, Gm) {
  const y0 = L.y0; const main = L.hl * 0.9, dep = L.hw * 0.75; const white = [0.95, 0.95, 0.93]; const g = W.b('glassRail', L.cx, L.cz);
  // ribbon-window mullions + aluminium sill/head on both volumes
  const vols = [[-main, main * 0.35, -dep * fs, dep * 0.4 * fs, y0, y0 + 3.8, 3.8], [-main * 0.55, main, -dep * 0.7 * fs, dep * 0.75 * fs, y0 + 3.8, y0 + 7.4, 3.6]];
  for (const [a0, a1, b0, b1, ya, yb, fh] of vols) {
    const poly = wind([F.P(a0, b0), F.P(a1, b0), F.P(a1, b1), F.P(a0, b1)]);
    for (const e of edgesOf(poly)) { const { n, cw } = cells(e.len, 3);
      for (const [w0, w1] of rows(ya, yb, fh)) { lb(bk, e, 0, e.len, -0.02, 0.1, w0 - 0.06, w0, COL.dkalu, true); lb(bk, e, 0, e.len, -0.02, 0.1, w1, w1 + 0.06, COL.dkalu, true);
        for (let k = 0; k <= n; k++) lb(bk, e, Math.max(0, k * cw - 0.05), Math.min(e.len, k * cw + 0.05), -0.02, 0.08, w0, w1, COL.dkalu); } }
  }
  // upper-floor terrace over the lower volume (a < -0.55 main): glass guard with a slim top rail
  { const ya = y0 + 3.8; const P = [F.P(-main + 0.1, -dep * fs + 0.1 * fs), F.P(-main + 0.1, dep * 0.4 * fs - 0.1 * fs), F.P(-main * 0.55, dep * 0.4 * fs - 0.1 * fs)];
    const P2 = [F.P(-main + 0.1, -dep * fs + 0.1 * fs), F.P(-main * 0.55, -dep * fs + 0.1 * fs)];
    for (const pts of [P, P2]) { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const nx = -(b[1] - a[1]) / l * 0.02, nz = (b[0] - a[0]) / l * 0.02;
      prismWalls(g, wind([[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]]), ya, ya + 1.05, null); }
      railing(bk, pts, ya + 1.0, 0.06, COL.dkalu, 50); } }
  // cantilever: slim steel column under the far corner, carport slab finish
  { const c = F.P(main - 0.3, dep * 0.75 * fs - 0.3 * fs); put(bk, Gm.cyl, c[0], y0, c[1], COL.dkalu, 0.12, 3.8, 0.12); }
  // entrance: tall timber pivot door on the street face of the lower volume, step + canopy fin
  { const poly = wind([F.P(-main, -dep * fs), F.P(main * 0.35, -dep * fs), F.P(main * 0.35, dep * 0.4 * fs), F.P(-main, dep * 0.4 * fs)]);
    const e = edgesOf(poly).find((q) => q.ox * (-L.uz * fs) + q.oz * (L.ux * fs) > 0.9); if (e) { const a = e.len * 0.32; door(bk, e, a, 1.3, 2.7, y0, { leaf: COL.wood, frame: COL.dkalu, steps: 1, stepCol: [0.82, 0.8, 0.76] });
      lb(bk, e, a - 1.6, a + 1.6, 0, 1.6, y0 + 3.05, y0 + 3.2, white, true); } }
  // roof: thin parapet edge, a few condensers, solar array (tilted panels on low frames)
  { const yR = y0 + 7.65; const a0 = -main * 0.6, a1 = main + 0.8, b0 = -dep * 0.75 - 0.9, b1 = dep * 0.8 + 0.9;
    const rp = wind([F.P(a0, b0), F.P(a1, b0), F.P(a1, b1), F.P(a0, b1)]); for (const e of edgesOf(rp)) lb(bk, e, 0, e.len, -0.18, 0, yR, yR + 0.35, white);
    const pv = [0.08, 0.1, 0.18]; const nA = Math.floor((a1 - a0 - 3) / 1.15); const tilt = 0.45;
    for (let row = 0; row < 2; row++) { const bb = b0 + 1.2 + row * 2.4; for (let k = 0; k < nA; k++) { const aa = a0 + 1.0 + k * 1.15; if (aa > a1 - 4.5 && row === 1) continue;
      const A = F.P(aa, bb), B = F.P(aa + 1.05, bb), C = F.P(aa + 1.05, bb + 1.7), D = F.P(aa, bb + 1.7); const v = (p, y) => new THREE.Vector3(p[0], y, p[1]);
      const q = [v(A, yR + 0.25), v(B, yR + 0.25), v(C, yR + 0.25 + tilt), v(D, yR + 0.25 + tilt)]; const nn = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[3], q[0])); if (nn.y < 0) q.reverse();
      bk.quad(q[0], q[1], q[2], q[3], [0, 0, 1, 0, 1, 1, 0, 1], {}, pv); fbox(bk, F, aa + 0.1, aa + 0.95, bb + 1.55, bb + 1.65, yR, yR + 0.25 + tilt, COL.alu); } }
    for (let i = 0; i < 2; i++) { const aa = a1 - 2.5, bb = b1 - 2.2 - i * 1.6; fbox(bk, F, aa, aa + 1.2, bb, bb + 1.0, yR, yR + 0.9, COL.alu); const c = F.P(aa + 0.6, bb + 0.5); put(bk, Gm.fan, c[0], yR + 0.9, c[1], COL.rubber, 0.4, 0.03, 0.4); } }
  // pool coping, pergola over the deck, garden wall with gate piers along the street
  { const pb = -fs * (dep + 2.5); const pa0 = -main * 0.55, pa1 = main * 0.4; const pz0 = Math.min(pb - 2.6 * fs, pb), pz1 = Math.max(pb - 2.6 * fs, pb); const stone = [0.88, 0.86, 0.82];
    fbox(bk, F, pa0 - 0.35, pa1 + 0.35, pz0 - 0.35, pz0, y0, y0 + 0.16, stone); fbox(bk, F, pa0 - 0.35, pa1 + 0.35, pz1, pz1 + 0.35, y0, y0 + 0.16, stone);
    fbox(bk, F, pa0 - 0.35, pa0, pz0, pz1, y0, y0 + 0.16, stone); fbox(bk, F, pa1, pa1 + 0.35, pz0, pz1, y0, y0 + 0.16, stone);
    const ga0 = -main * 0.98, ga1 = -main * 0.6, gb0 = -dep * fs, gb1 = -(dep + 2.6) * fs; const lo = Math.min(gb0, gb1), hi = Math.max(gb0, gb1);
    for (const aa of [ga0, ga1]) fbox(bk, F, aa - 0.1, aa + 0.1, gb1 - 0.1, gb1 + 0.1, y0, y0 + 2.8, COL.dkalu);
    fbox(bk, F, ga0 - 0.2, ga1 + 0.2, gb1 - 0.12 * fs - 0.06, gb1 + 0.06, y0 + 2.8, y0 + 2.95, COL.dkalu);
    for (let bb = lo + 0.2; bb < hi; bb += 0.45) fbox(bk, F, ga0 - 0.1, ga1 + 0.1, bb - 0.04, bb + 0.04, y0 + 2.95, y0 + 3.15, COL.wood);
    const wb = fs * (L.hw + 0.55); const gate = main * 0.55; const wh = 1.1;
    for (const [s0, s1] of [[-L.hl + 0.3, gate - 2.2], [gate + 2.2, L.hl - 0.3]]) { if (s1 - s0 < 1) continue; fbox(bk, F, s0, s1, wb - 0.12, wb + 0.12, y0, y0 + wh, white); fbox(bk, F, s0 - 0.03, s1 + 0.03, wb - 0.16, wb + 0.16, y0 + wh, y0 + wh + 0.06, [0.8, 0.79, 0.76]); }
    for (const aa of [gate - 2.2, gate + 2.2]) fbox(bk, F, aa - 0.3, aa + 0.3, wb - 0.3, wb + 0.3, y0, y0 + 1.6, white); }
}

function warehouse(W, L, r, bk, F, fs, Gm) {
  const E = edgesOf(L.poly); const street = (e) => e.ox * L.face[0] + e.oz * L.face[1] > 0.7; const wallD = mix(L.wall, 0.86); const ylw = [0.92, 0.72, 0.1];
  for (const e of E) {
    // tilt-up panel joints: pilasters at the corners on every face, every 6 m on the street face (murals live on the others)
    lb(bk, e, 0, 0.45, -0.02, 0.18, 0, L.top + 0.5, wallD); lb(bk, e, e.len - 0.45, e.len, -0.02, 0.18, 0, L.top + 0.5, wallD);
    if (!street(e)) { if (e.len > 10) { downspout(bk, e, 0.9, 0, L.top + 0.5); downspout(bk, e, e.len - 0.9, 0, L.top + 0.5); } continue; }
    // the street face holds the roll-up doors (region.js: every 9 m from -hl+4, 4.2 m wide, 4.6 m tall): add frames, roller hoods,
    // slats, dock bumpers, bollards; a man door + painted company board between them
    const doors = []; for (let a = -L.hl + 4; a < L.hl - 4; a += 9) doors.push(a + 2.1); // centres in lot coords (along u)
    for (const dc of doors) {
      const c = F.P(dc, 0); const a = (c[0] - e.p[0]) * e.dx + (c[1] - e.p[1]) * e.dz; if (a < 2 || a > e.len - 2) continue;
      lb(bk, e, a - 2.35, a - 2.1, -0.02, 0.22, 0, 4.75, COL.steel); lb(bk, e, a + 2.1, a + 2.35, -0.02, 0.22, 0, 4.75, COL.steel);
      lb(bk, e, a - 2.4, a + 2.4, -0.02, 0.6, 4.65, 5.25, [0.58, 0.6, 0.62], true); // roller hood
      for (let y = 0.35; y < 4.5; y += 0.38) lb(bk, e, a - 2.08, a + 2.08, 0.12, 0.15, y, y + 0.05, [0.48, 0.5, 0.53]);
      lb(bk, e, a - 2.1, a + 2.1, 0.11, 0.17, 0.02, 0.18, COL.rubber);
      for (const s of [-1, 1]) { const b = e.P(a + s * 2.9, 0.9); put(bk, Gm.cyl, b[0], 0, b[1], ylw, 0.11, 1.1, 0.11); put(bk, Gm.dome, b[0], 1.1, b[1], ylw, 0.11, 0.08, 0.11); }
    }
    const md = doors.length > 1 ? (() => { const c0 = F.P(doors[0], 0), c1 = F.P(doors[1], 0); return ((c0[0] + c1[0]) / 2 - e.p[0]) * e.dx + ((c0[1] + c1[1]) / 2 - e.p[1]) * e.dz; })() : e.len - 1.5;
    if (md > 1.2 && md < e.len - 1.2) { door(bk, e, md, 0.95, 2.15, 0, { leaf: [0.4, 0.42, 0.44], frame: COL.dkalu, canopy: 0.9 }); lb(bk, e, md - 0.09, md + 0.09, 0.02, 0.18, 2.65, 2.85, [0.9, 0.88, 0.8]); }
    const bw = Math.min(10, e.len * 0.45); signBoard(bk, e, e.len / 2 - bw / 2, e.len / 2 + bw / 2, L.top - 2.0, 1.1, pk(r, BOARD), pk(r, TRIM));
    downspout(bk, e, 0.9, 0, L.top + 0.5); downspout(bk, e, e.len - 0.9, 0, L.top + 0.5);
  }
  // roof access ladder with a hoop cage on one side wall
  { const e = E.find((q) => !street(q) && q.len > 8); if (e) { const a = 0.9 + 0.8; for (const s of [-0.22, 0.22]) lb(bk, e, a + s - 0.03, a + s + 0.03, 0.12, 0.2, 0.6, L.top + 1.5, COL.steel);
    for (let y = 0.9; y < L.top + 1.4; y += 0.3) lb(bk, e, a - 0.22, a + 0.22, 0.15, 0.18, y, y + 0.025, COL.steel);
    for (let y = 2.6; y < L.top + 1.4; y += 0.9) { lb(bk, e, a - 0.38, a + 0.38, 0.85, 0.89, y, y + 0.04, COL.steel); lb(bk, e, a - 0.38, a - 0.34, 0.2, 0.89, y, y + 0.04, COL.steel); lb(bk, e, a + 0.34, a + 0.38, 0.2, 0.89, y, y + 0.04, COL.steel); } } }
  // roof: skylight rows + turbine ventilators
  const y = L.top + 0.5; const sk = [0.55, 0.62, 0.66];
  for (let a = -L.hl + 3; a < L.hl - 4; a += 6) { fbox(bk, F, a, a + 2.4, -L.hw * 0.5, L.hw * 0.5, L.top, y + 0.35, [0.7, 0.7, 0.68]); fbox(bk, F, a + 0.1, a + 2.3, -L.hw * 0.5 + 0.1, L.hw * 0.5 - 0.1, y + 0.35, y + 0.45, sk); }
  for (let k = 0; k < 3; k++) { const a = -L.hl + 6 + k * (2 * L.hl - 12) / 2 + 3, b = (k % 2 ? 1 : -1) * L.hw * 0.72; const c = F.P(a, b); put(bk, Gm.cyl, c[0], L.top, c[1], COL.alu, 0.18, 0.9 + 0.5, 0.18); put(bk, Gm.dome, c[0], y + 0.9, c[1], COL.alu, 0.38, 0.45, 0.38); put(bk, Gm.cyl6, c[0], y + 0.55, c[1], COL.steel, 0.36, 0.35, 0.36); }
  void r;
}

// ======================================================================== 8. 日光堤道 navigation bridge =====
// sloped box beam from a to b (plan points), top at ya / yb, half width hw, depth dep (no top face: it sits under a slab)
function beam(bk, a, b, ya, yb, hw, dep, col) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.01) return; const nx = -(b[1] - a[1]) / len * hw, nz = (b[0] - a[0]) / len * hw;
  const V = (p, y) => new THREE.Vector3(p[0], y, p[1]); const L = [a[0] + nx, a[1] + nz], R = [a[0] - nx, a[1] - nz], L2 = [b[0] + nx, b[1] + nz], R2 = [b[0] - nx, b[1] - nz];
  const q = (v0, v1, v2, v3, out) => { const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v3, v0)); if (n.dot(out) < 0) bk.quad(v3, v2, v1, v0, [0, 0, 1, 0, 1, 1, 0, 1], {}, col); else bk.quad(v0, v1, v2, v3, [0, 0, 1, 0, 1, 1, 0, 1], {}, col); };
  const side = new THREE.Vector3(nx, 0, nz);
  q(V(L, ya - dep), V(L2, yb - dep), V(L2, yb), V(L, ya), side); q(V(R, ya - dep), V(R2, yb - dep), V(R2, yb), V(R, ya), side.clone().negate());
  q(V(L, ya - dep), V(R, ya - dep), V(R2, yb - dep), V(L2, yb - dep), new THREE.Vector3(0, -1, 0));
}
// sun: region road (path.at(s) -> {x,z,tx,tz}, h(s, x)), inBridge(x), s range
export function bridgeDetail(W, sun, inBridge, s0, s1) {
  const bk = W.b('vcol', sun.path.at((s0 + s1) / 2).x, sun.path.at((s0 + s1) / 2).z); const conc = [0.66, 0.65, 0.62], gir = [0.6, 0.6, 0.58];
  const hw = sun.hw + 1.6;
  for (let s = s0; s < s1; s += 4) {
    const p = sun.path.at(s), q = sun.path.at(s + 4); if (!inBridge(p.x) && !inBridge(q.x)) continue;
    const ya = sun.h(s, p.x) + 0.15, yb = sun.h(s + 4, q.x) + 0.15;
    const off = (Q, o) => [Q.x - Q.tz * o, Q.z + Q.tx * o];
    // four longitudinal girders under the deck slab, inside the edge beams (|o| <= hw-1, hw+1.6 is the fascia), over the piers (±6),
    // each a sloped prism following the deck (r6.2 fix: were per-4 m blocks at ±8.5 that stuck out under the fascia as a staircase)
    for (const o of [-6, -2, 2, 6]) beam(bk, off(p, o), off(q, o), ya - 1.4, yb - 1.4, 0.35, 1.1, gir);
    // metal rail on top of the concrete parapets
    for (const side of [-1, 1]) { const a = off(p, side * (hw - 0.12)), b = off(q, side * (hw - 0.12)); const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const E = { p: a, len, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len }; E.ox = -E.dz; E.oz = E.dx; E.P = (aa, d) => [a[0] + E.dx * aa + E.ox * d, a[1] + E.dz * aa + E.oz * d];
      lb(bk, E, 0, 0.08, -0.04, 0.04, ya + 0.95, ya + 1.55, COL.steel); lb(bk, E, 0, len + 0.02, -0.05, 0.05, ya + 1.5, ya + 1.58, COL.steel, true); lb(bk, E, 0, len + 0.02, -0.03, 0.03, ya + 1.2, ya + 1.25, COL.steel, true); }
    // hammerhead pier cap over each pier pair (region.js puts piers at +-6 m every 24 m)
    if (Math.round(s / 4) % 6 === 0) { const a = off(p, -hw), b = off(p, hw); const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const E = { p: a, len, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len }; E.ox = -E.dz; E.oz = E.dx; E.P = (aa, d) => [a[0] + E.dx * aa + E.ox * d, a[1] + E.dz * aa + E.oz * d];
      const yl = ya - 1.4 - 1.1; lb(bk, E, 1.5, len - 1.5, -0.9, 0.9, yl - 1.3, yl, conc, true);
      for (const o of [-6, 6]) { const c = off(p, o); fbox(bk, frame(c[0], c[1], p.tx, p.tz), -1.35, 1.35, -1.35, 1.35, -0.9, -0.3, [0.5, 0.48, 0.44]); } } // pier footing collar at the waterline
  }
  // expansion joints at both bridge ends (steel finger plates across the deck)
  for (let s = s0; s < s1; s += 2) { const p = sun.path.at(s), q = sun.path.at(s + 2); if (inBridge(p.x) === inBridge(q.x)) continue; const y = sun.h(s, p.x) + 0.012;
    const a = [p.x + p.tz * sun.hw, p.z - p.tx * sun.hw], b = [p.x - p.tz * sun.hw, p.z + p.tx * sun.hw]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const E = { p: a, len, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len }; E.ox = -E.dz; E.oz = E.dx; E.P = (aa, d) => [a[0] + E.dx * aa + E.ox * d, a[1] + E.dz * aa + E.oz * d];
    lb(bk, E, 0, len, -0.25, 0.25, y - 0.05, y + 0.012, [0.3, 0.3, 0.31], false); }
}

// ======================================================================== 9. beach structures =====
// promenade-to-sand access: timber steps over the coral-stone wall with handrails, outdoor shower posts, bike rack
export function beachDetail(W, x1, z, r) {
  const bk = W.b('vcol', x1, z); const Gm = geos(); const F = frame(0, 0); const wood = [0.55, 0.42, 0.3], wdk = [0.4, 0.3, 0.21];
  // steps up over the 0.6 m wall then a ramp down onto the sand
  for (let k = 0; k < 3; k++) fbox(bk, F, x1 - 2.4 + k * 0.6, x1 - 1.8 + k * 0.6, z - 1.2, z + 1.2, 0.15, 0.32 + k * 0.17, wood);
  fbox(bk, F, x1 - 0.6, x1 + 1.2, z - 1.2, z + 1.2, 0.68, 0.8, wood); fbox(bk, F, x1 - 0.55, x1 + 1.15, z - 1.15, z + 1.15, -0.6, 0.68, wdk); // landing on a boxed-in timber base
  for (let k = 0; k < 5; k++) { fbox(bk, F, x1 + 1.2 + k * 0.9, x1 + 2.1 + k * 0.9, z - 1.2, z + 1.2, 0.6 - k * 0.16, 0.72 - k * 0.16, wood); // solid treads down onto the sand (r6.2 fix: were floating planks)
    fbox(bk, F, x1 + 1.25 + k * 0.9, x1 + 2.05 + k * 0.9, z - 1.15, z + 1.15, -0.6, 0.6 - k * 0.16, wdk); }
  for (const sz of [-1.2, 1.2]) { railing(bk, [[x1 - 2.4, z + sz], [x1 + 1.2, z + sz], [x1 + 5.6, z + sz]], 0.8, 0.95, wdk, 1.4); for (let x = x1 - 2.2; x < x1 + 5.6; x += 1.4) fbox(bk, F, x - 0.06, x + 0.06, z + sz - 0.06, z + sz + 0.06, -0.6, 0.8, wdk); }
  // shower tower: stainless post, two heads, foot tap, drain grate on a pad
  const sx = x1 - 4.5, sz = z + 3.2; fbox(bk, F, sx - 0.8, sx + 0.8, sz - 0.8, sz + 0.8, 0.15, 0.2, [0.78, 0.76, 0.72]);
  put(bk, Gm.cyl, sx, 0.2, sz, [0.75, 0.77, 0.79], 0.06, 2.4, 0.06);
  for (const s of [-1, 1]) { fbox(bk, F, sx - 0.02, sx + 0.02, sz, sz + s * 0.45, 2.35, 2.4, [0.75, 0.77, 0.79]); put(bk, Gm.cone, sx, 2.22, sz + s * 0.45, [0.75, 0.77, 0.79], 0.08, 0.14, 0.08); }
  fbox(bk, F, sx - 0.25, sx + 0.25, sz - 0.25, sz + 0.25, 0.2, 0.22, [0.3, 0.3, 0.31]);
  // bike rack (inverted U hoops)
  if (r() < 0.6) for (let k = 0; k < 4; k++) { const bz = z - 5 - k * 0.9; for (const dx of [-0.35, 0.35]) fbox(bk, F, x1 - 4.5 + dx - 0.03, x1 - 4.5 + dx + 0.03, bz - 0.03, bz + 0.03, 0.15, 0.95, COL.steel); fbox(bk, F, x1 - 4.88, x1 - 4.12, bz - 0.03, bz + 0.03, 0.9, 0.96, COL.steel); }
}
