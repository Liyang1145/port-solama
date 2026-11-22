// r6.4 b_portyard (Hark modelling lane, 2026-11-22): 霓港 (B map) harbour container yards, close-up pass. Original content only.
//
// What (only the container-yard port lots; warehouses, every other lot and every rng stream untouched):
//  * containers (stream.js port(), same draws in the same order — randi(1, 4) stack height, pick() colour per tier — just
//    collected first so a stack knows its neighbours):
//      - door ends: corner posts, header / sill, door seam, four locking bars with cam handles, hinges, corner castings, a
//        CSC-style plate and a stencilled code band; the blank end gets its corner posts + castings. Upper tiers (k ≥ 2) a lighter set.
//      - twist locks at every tier seam (galvanised slivers at the end corners), lashing bars + turnbuckles on the stack ends
//        that face the yard's open strips.
//      - variation without new draws (hash of lot seed / column / row / tier): per-box tint and fade, one in five 40 ft slots
//        holds a pair of 20 ft boxes (second colour from the same palette, doors at both outer ends), door end on either side.
//      - corrugation ribs only on the sides you can see (outermost column, or a neighbour stack lower than this tier): the hidden
//        rib boxes between columns (0.56 m gaps) paid for the detail above.
//      - ground: yellow aisle lines at every row end, two-digit bay numbers per column, a row letter on the back strip, apron line.
//  * yard furniture (bldglayer.js portExtras, no rng — positions from planYards):
//      - perimeter fence (concrete plinth, posts with cranked barbed-wire arms, rails, welded-mesh verticals, barbed strands),
//        trimmed clear of the sidewalk and the light masts;
//      - gate (闸口) on the open end: portal frame with a lit header panel and beacons, a raised boom barrier, a guard booth with
//        a lit window band; painted stop line;
//      - straddle carriers parked over single-high stacks (legs + wheels in the 0.56 m column gaps, frame, cab, spreader holding a
//        box), a terminal tractor + skeletal chassis trailer with a box on the apron, a reach stacker on the widest apron;
//      - two more high-mast lights inside the fence (lamp heads in the shared 'neon' material + 'cone' light shafts — the same
//        mechanism as the existing masts, no lights added to any lighting loop).
//  * colliders: parcelfit.js predict() adds every new walking-height piece (fence runs, gate posts, booth, boom post, vehicles,
//    masts, lashing bands) from yardExtras(p); straddle carriers stand inside their row's box.
//  * parcelgap.js: the slots that border a yard lost their yard-side wall fixtures (the yard has container rows, not a wall) — see
//    there.
// Test switch ?noportyard: everything above off (port(), portExtras, predict, parcelgap behave exactly as before this lane).
import * as THREE from 'three';
import { box } from '../../geo.js';
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { PL_OFF } from './portlight.js'; // b_portlight (fence density)

export const PY_OFF = typeof location !== 'undefined' && /[?&]noportyard\b/.test(location.search);
export const PY = { stats: null };
export const CC = [[0.62, 0.16, 0.12], [0.12, 0.32, 0.55], [0.85, 0.55, 0.12], [0.2, 0.45, 0.3], [0.55, 0.55, 0.55], [0.75, 0.75, 0.72], [0.45, 0.2, 0.35]];
export const CW = 2.44, CH2 = 2.6, CL = 12.2;
export function hsh(...a) { let h = 2166136261 >>> 0; for (const v of a) { h ^= Math.imul(v | 0, 0x9e3779b1) >>> 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; } return (h >>> 0) / 4294967296; }
// same loops (and float steps) as stream.js port()
export function yardGrid(p) { const hx = p.d / 2, hz = p.w / 2; const xs = [], zs = []; for (let x = -hx + 2; x < hx - 2.4; x += 3) xs.push(x); for (let z = -hz + 1; z < hz - 12; z += 13.2) zs.push(z); return { xs, zs }; }
export const isYard = (p) => p.style === 'port' && !withSeed(p.seed, () => rng() < 0.45);

// ---------------------------------------------------------------- small geometry helpers (vertex-coloured quads) ----
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UV = [0, 0, 1, 0, 1, 1, 0, 1];
// quad on a vertical face: origin o, across axis r (unit, horizontal), normal n (unit, horizontal); a0..a1 across, y0..y1 up, off along n
function fq(v, o, r, n, a0, y0, a1, y1, off, col) {
  const P = (a, y) => V3(o[0] + r[0] * a + n[0] * off, y, o[2] + r[2] * a + n[2] * off);
  // winding: (b − a) × (d − a) must be n
  const cx = r[1] * 0 - r[2] * 1, cz = r[0] * 1 - r[1] * 0; // r × up
  if (cx * n[0] + cz * n[2] > 0) v.quad(P(a0, y0), P(a1, y0), P(a1, y1), P(a0, y1), UV, {}, col); else v.quad(P(a1, y0), P(a0, y0), P(a0, y1), P(a1, y1), UV, {}, col);
}
// flat ground quad from 4 (x, z) corners in any order around, facing up
function gq(v, pts, y, col) { const [a, b, c, d] = pts.map((q) => V3(q[0], y, q[1])); const ny = (b.z - a.z) * (d.x - a.x) - (b.x - a.x) * (d.z - a.z);
  if (ny > 0) v.quad(a, b, c, d, UV, {}, col); else v.quad(d, c, b, a, UV, {}, col); }
const grect = (v, x0, z0, x1, z1, y, col) => gq(v, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, col);
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
const YEL = [0.86, 0.64, 0.1], WHT = [0.8, 0.8, 0.77], GALV = [0.66, 0.67, 0.64], GY = 0.035;

// one container end: o = the end face's corner at (box min across, ground of the tier), r across (2.44), n outward
// kind 'door' | 'door2' (upper tiers) | 'blank'; tl: twist locks at the bottom seam
function boxEnd(v, o, r, n, y0, c, kind, tl, h) {
  const dark = mul(c, 0.52), vdark = mul(c, 0.3), cast = [0.16, 0.15, 0.14]; const H = CH2;
  const Q = (a0, ya, a1, yb, off, col) => fq(v, o, r, n, a0, y0 + ya, a1, y0 + yb, off, col);
  for (const [a0, a1] of [[0, 0.17], [CW - 0.17, CW]]) for (const [ya, yb] of [[0, 0.12], [H - 0.12, H]]) Q(a0, ya, a1, yb, 0.016, cast); // corner castings
  if (tl && kind !== 'blank' && kind !== 'blank2') for (const [a0, a1] of [[0.02, 0.19], [CW - 0.19, CW - 0.02]]) Q(a0, -0.035, a1, 0.025, 0.024, GALV); // twist locks at the seam
  if (kind === 'blank2') return;
  if (kind === 'blank') { Q(0, 0.12, 0.13, H - 0.12, 0.012, dark); Q(CW - 0.13, 0.12, CW, H - 0.12, 0.012, dark); return; }
  const code = lum(c) > 0.5 ? [0.12, 0.12, 0.13] : [0.88, 0.88, 0.85];
  Q(CW / 2 - 0.016, 0.1, CW / 2 + 0.016, H - 0.16, 0.013, vdark); // door seam
  Q(1.42, H - 0.5, 2.18, H - 0.38, 0.013, code); // stencilled box code
  if (kind === 'door2') return;
  const steel = mix(c, [0.6, 0.61, 0.62], 0.6); const bars = [0.36, 0.8, 1.64, 2.08];
  if (kind === 'door1') { for (const ax of bars) Q(ax - 0.022, 0.13, ax + 0.022, H - 0.2, 0.032, steel); return; }
  Q(0, 0.12, 0.13, H - 0.12, 0.012, dark); Q(CW - 0.13, 0.12, CW, H - 0.12, 0.012, dark); // corner posts
  Q(0.13, H - 0.17, CW - 0.13, H, 0.012, dark); Q(0.13, 0, CW - 0.13, 0.1, 0.012, dark); // header / sill
  for (const ax of bars) { Q(ax - 0.022, 0.13, ax + 0.022, H - 0.2, 0.032, steel); // locking bars
    const d = ax < CW / 2 ? 0.26 : -0.26; Q(Math.min(ax, ax + d), 1.1, Math.max(ax, ax + d), 1.16, 0.042, steel); } // cam handles
  for (const hy of [0.42, 2.02]) { Q(0.11, hy, 0.21, hy + 0.13, 0.02, vdark); Q(CW - 0.21, hy, CW - 0.11, hy + 0.13, 0.02, vdark); } // hinges
  Q(0.95, 1.52, 1.15, 1.66, 0.014, [0.74, 0.73, 0.68]); // CSC plate
  if (h > 0.55) Q(1.42, H - 0.66, 1.92, H - 0.58, 0.013, code); // check digit / type code line
}

// ---------------------------------------------------------------- stream.js port(): container rows ----
// b_portlight: per-box colour (tint / fade by hash, 20 ft pair + its second colour) — C[i][j][k] = the stack's pick(CC) draws
const tint = (c, s) => { const t = 0.84 + 0.26 * hsh(s, 1); return [c[0] * t * (0.95 + 0.1 * hsh(s, 2)), c[1] * t * (0.95 + 0.1 * hsh(s, 3)), c[2] * t * (0.95 + 0.1 * hsh(s, 4))]; };
export function yardBoxCol(p, C, i, j, k) { const c = tint(C[i][j][k], p.seed ^ (i * 977 + j * 131 + k * 17)); const pair = hsh(p.seed, i, j, k, 7) < 0.2;
  return { c, pair, c2: pair ? tint(CC[Math.floor(hsh(p.seed, i, j, k, 8) * CC.length)], p.seed ^ (i * 991 + j * 137 + k * 19 + 5)) : null }; }
// v: the lot's 'vcol' bucket. Draws exactly what the old loop drew from the rng (same calls, same order), then lays the boxes.
export function yardContainers(v, p) {
  const hx = p.d / 2, hz = p.w / 2; const { xs, zs } = yardGrid(p); const nc = xs.length, nr = zs.length;
  const N = [], C = []; for (let i = 0; i < nc; i++) { N.push([]); C.push([]); for (let j = 0; j < nr; j++) { const n = randi(1, 4); const cs = []; for (let k = 0; k < n; k++) cs.push(pick(CC)); N[i].push(n); C[i].push(cs); } }
  const st = PY.stats || (PY.stats = {}); const S = st.cont || (st.cont = { boxes: 0, pairs: 0, ribsFull: 0, ribsHalf: 0, ribsHidden: 0, lash: 0 });
  const ribs = (x, y0, z0, z1, rc, L, R, skip) => { for (let r = 1; r < 12; r++) { const zr = z0 + r * 1.0; if (zr + 0.08 > z1 || skip(zr)) continue;
    if (L && R) { box(v, x - 0.05, y0 + 0.1, zr, x + CW + 0.05, y0 + 2.45, zr + 0.08, {}, rc); S.ribsFull++; }
    else if (L) { box(v, x - 0.05, y0 + 0.1, zr, x + 0.3, y0 + 2.45, zr + 0.08, {}, rc); S.ribsHalf++; }
    else if (R) { box(v, x + CW - 0.3, y0 + 0.1, zr, x + CW + 0.05, y0 + 2.45, zr + 0.08, {}, rc); S.ribsHalf++; }
    else S.ribsHidden++; } };
  for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) { const x = xs[i], z = zs[j]; const n = N[i][j];
    for (let k = 0; k < n; k++) { S.boxes++; const y0 = 0.05 + k * CH2; const h = hsh(p.seed, i, j, k);
      const L = i === 0 || N[i - 1][j] <= k, R = i === nc - 1 || N[i + 1][j] <= k;
      const { c, pair, c2 } = yardBoxCol(p, C, i, j, k); const tl = k > 0; // b_portlight: colour helper shared with portlight.js (same math)
      const zN = [z, 0, -1], zP = [z + CL, 0, 1]; // end faces: (z, normal)
      const end = (zf, s, kind, cc) => boxEnd(v, s < 0 ? [x + CW, 0, zf] : [x, 0, zf], s < 0 ? [-1, 0, 0] : [1, 0, 0], [0, 0, s], y0, cc, kind, tl, hsh(p.seed, i, j, k, s + 9));
      const dk = k === 0 ? 'door' : k === 1 ? 'door1' : 'door2', bk = k <= 1 ? 'blank' : 'blank2';
      if (!pair) { box(v, x, y0, z, x + CW, y0 + CH2, z + CL, {}, c, false); ribs(x, y0, z, z + CL, mul(c, 0.72), L, R, () => false);
        const dz = h < 0.5 ? -1 : 1; end(dz < 0 ? zN[0] : zP[0], -1 === dz ? -1 : 1, dk, c); end(dz < 0 ? zP[0] : zN[0], dz < 0 ? 1 : -1, bk, c); }
      else { S.pairs++; const zm = z + 6.05, zm2 = z + 6.15;
        box(v, x, y0, z, x + CW, y0 + CH2, zm, {}, c, false); box(v, x, y0, zm2, x + CW, y0 + CH2, z + CL, {}, c2, false);
        ribs(x, y0, z, zm, mul(c, 0.72), L, R, () => false); ribs(x, y0, zm2 - 1.0 + 0.0, z + CL, mul(c2, 0.72), L, R, (zr) => zr < zm2 + 0.4);
        end(z, -1, dk, c); end(zm, 1, 'blank2', c); end(zm2, -1, 'blank2', c2); end(z + CL, 1, dk, c2); } } }
  // lashing bars + turnbuckles on the stack ends facing the open strips (row 0 at −z, last row at +z), stacks ≥ 2 high
  const lashEnd = (x, zf, s) => { for (const side of [0, 1]) { const ax = side ? x + CW - 0.55 : x + 0.55, tx = side ? x + CW - 0.1 : x + 0.1;
    const g = [ax, 0.05, zf + s * 0.27], t = [tx, 0.05 + CH2 + 0.03, zf + s * 0.04]; const m = [g[0] + (t[0] - g[0]) * 0.28, g[1] + (t[1] - g[1]) * 0.28, g[2] + (t[2] - g[2]) * 0.28];
    seg(v, g, t, 0.022, side ? GALV : [0.78, 0.6, 0.12]); } S.lash++; };
  for (let i = 0; i < nc; i++) { if (N[i][0] >= 2) lashEnd(xs[i], zs[0], -1); if (N[i][nr - 1] >= 2) lashEnd(xs[i], zs[nr - 1] + CL, 1); }
  // ground: aisle lines at the row ends, bay numbers per column, row letter on the back strip, apron line
  const xE = xs[nc - 1] + CW + 0.05, x0 = xs[0] - 0.05;
  for (let j = 0; j < nr; j++) { const z = zs[j];
    grect(v, x0, z - 0.22, xE, z - 0.1, GY, YEL); grect(v, x0, z + CL + 0.1, xE, z + CL + 0.22, GY, YEL);
    for (let i = 0; i < nc; i++) digits(v, String(i + 1).padStart(2, '0'), xs[i] + CW / 2, z - 0.52, 0.36, WHT, 'z');
    glyph(v, 'ABCDEFHJLP'[j % 10], -hx + 0.95, z + CL / 2, 1.1, YEL, 'x'); }
  const zEnd = zs[nr - 1] + CL; if (hz - zEnd > 2) grect(v, x0, zEnd + 0.62, xE, zEnd + 0.74, GY, YEL);
  return { N, xs, zs };
}
// thin open tube segment (4 sides) as a vertex-coloured prism
const _d = new THREE.Vector3(), _X = new THREE.Vector3(), _Z = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function seg(v, a, c, w, col) { _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const L = _d.length(); if (L < 1e-4) return; _d.multiplyScalar(1 / L);
  if (Math.abs(_d.y) > 0.999) _X.set(1, 0, 0); else _X.crossVectors(UP, _d).normalize(); _Z.crossVectors(_X, _d).normalize();
  const P = (sx, sz, t) => V3(a[0] + _d.x * L * t + (_X.x * sx + _Z.x * sz) * w / 2, a[1] + _d.y * L * t + (_X.y * sx + _Z.y * sz) * w / 2, a[2] + _d.z * L * t + (_X.z * sx + _Z.z * sz) * w / 2);
  const R = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) { const p0 = R[i], p1 = R[(i + 1) % 4]; v.quad(P(p0[0], p0[1], 0), P(p0[0], p0[1], 1), P(p1[0], p1[1], 1), P(p1[0], p1[1], 0), UV, {}, col); } }
// seven-segment painted digits / letters on the ground. Cell centred at (cx, cz), height hgt; 'z' = text up along −z (read from
// the aisle), 'x' = up along −x (read from the back strip)
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', A: 'abcefg', B: 'cdefg', C: 'adef', D: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg', J: 'bcde', L: 'def', P: 'abefg' };
function glyph(v, ch, cx, cz, hgt, col, ax) { const w = hgt * 0.55, t = hgt * 0.13; const S = SEG7[ch] || ''; const hw = w / 2, hh = hgt / 2;
  const R = { a: [-hw, hh - t, hw, hh], b: [hw - t, 0, hw, hh], c: [hw - t, -hh, hw, 0], d: [-hw, -hh, hw, -hh + t], e: [-hw, -hh, -hw + t, 0], f: [-hw, 0, -hw + t, hh], g: [-hw, -t / 2, hw, t / 2] };
  for (const s of S) { const [u0, w0, u1, w1] = R[s]; // u = right, w = up
    const P = (u, ww) => (ax === 'z' ? [cx - u, cz - ww] : [cx - ww, cz - u]);
    gq(v, [P(u0, w0), P(u1, w0), P(u1, w1), P(u0, w1)], GY + 0.002, col); } }
function digits(v, s, cx, cz, hgt, col, ax) { const gap = hgt * 0.72; for (let i = 0; i < s.length; i++) { const o = (i - (s.length - 1) / 2) * gap; glyph(v, s[i], ax === 'z' ? cx - o : cx, ax === 'z' ? cz : cz - o, hgt, col, ax); } }

// ---------------------------------------------------------------- startup plan (pure; no rng stream consumed) ----
const MARGIN = 0.1;
function depthAt(G, p, lx, lz) { const c = Math.cos(p.ang), s = Math.sin(p.ang); const x = p.x + lx * c - lz * s, z = p.z + lx * s + lz * c; const n = G.index.near(x, z, false); return n ? n.e.hw + n.e.sw - n.d : -9; }
export function planYards(parcels, G) {
  const st = PY.stats || (PY.stats = {}); st.plan = { yards: 0, fenceRuns: 0, fenceLen: 0, fenceCut: 0, gates: 0, booths: 0, sc: 0, tt: 0, rs: 0, masts: 0, off: PY_OFF };
  if (PY_OFF || !G || !G.index) return st.plan;
  for (const p of parcels) { if (p.far || p.style !== 'port') continue;
    const Cc = []; const N = withSeed(p.seed, () => { if (rng() < 0.45) return null; const { xs, zs } = yardGrid(p); const o = []; for (let i = 0; i < xs.length; i++) { o.push([]); Cc.push([]); for (let j = 0; j < zs.length; j++) { const n = randi(1, 4); const cs = []; for (let k = 0; k < n; k++) cs.push(pick(CC)); o[i].push(n); Cc[i].push(cs); } } return o; }); // b_portlight: keep the colours (same draws)
    if (!N) continue; st.plan.yards++;
    const hx = p.d / 2, hz = p.w / 2; const { xs, zs } = yardGrid(p); const nc = xs.length, nr = zs.length; const zEnd = zs[nr - 1] + CL, m = hz - zEnd; const xEnd = xs[nc - 1] + CW + 0.05;
    const gy = p.gf && p.gf.yard; const xL = -hx - 1.4, xR = hx + 1.4;
    const cr = withSeed((p.seed ^ 0x9e37) >>> 0, () => { pick([0, 1, 2]); const zc = rand(-hz + 9, hz - 9); const tx = rand(xL + 4, xR - 4); return { zc, tx }; }); if (gy && gy.zc !== null) cr.zc = gy.zc;
    const masts0 = gy ? gy.mast : [[xL - 1.5, -hz + 1], [xR + 1.5, hz - 1]];
    const y = { N, C: Cc, xs, zs, zEnd, m, xEnd, runs: [], gate: null, booth: null, boom: null, sc: [], tt: null, rs: null, masts: [], lash: [] };
    const X0 = -hx - 0.5, X1 = hx + 0.3, Z0 = -hz + 0.1, Z1 = hz - 0.1;
    if (m >= 5.5) { const g1 = m >= 6.5 ? hz - 2.55 : hz - 0.6; y.gate = { z0: zEnd + 0.6, z1: g1 }; st.plan.gates++;
      if (m >= 6.5) { y.booth = { x0: hx - 2.0, z0: hz - 2.3, x1: hx - 0.35, z1: hz - 0.55 }; y.boom = { x: hx - 0.05, z: g1 + 0.22 }; st.plan.booths++; } }
    // fence runs (axis-aligned lines in the lot frame) trimmed clear of the sidewalk / masts; the front run skips the gate opening
    const okAt = (x, z) => depthAt(G, p, x, z) < -(0.15 + MARGIN) && masts0.every(([mx, mz]) => Math.hypot(mx - x, mz - z) > 0.7);
    const addRun = (ax, a0, a1, c, out) => { // ax 'z': x = c, z from a0 to a1; ax 'x': z = c, x from a0 to a1
      const step = 0.25; let s0 = null; const n = Math.ceil((a1 - a0) / step); const pt = (a) => (ax === 'z' ? [c, a] : [a, c]);
      for (let i = 0; i <= n; i++) { const a = Math.min(a1, a0 + i * step); const ok = okAt(...pt(a)); if (!ok) st.plan.fenceCut++;
        if (ok && s0 === null) s0 = a; if ((!ok || i === n) && s0 !== null) { const e = ok ? a : a - step; if (e - s0 >= 1.0) { y.runs.push({ ax, a0: s0, a1: e, c, out }); st.plan.fenceRuns++; st.plan.fenceLen += e - s0; } s0 = null; } } };
    addRun('z', Z0, Z1, X0, -1); addRun('x', X0, X1, Z0, -1); addRun('x', X0, X1, Z1, 1);
    if (y.gate) { addRun('z', Z0, y.gate.z0 - 0.15, X1, 1); addRun('z', y.gate.z1 + 0.15, Z1, X1, 1);
      const has = (z) => y.runs.some((r) => r.ax === 'z' && r.c === X1 && Math.abs(r.a1 - z) < 0.3 || r.ax === 'z' && r.c === X1 && Math.abs(r.a0 - z) < 0.3);
      if (!has(y.gate.z0 - 0.15) || !has(y.gate.z1 + 0.15)) { y.gate.portal = false; } else y.gate.portal = true; }
    else addRun('z', Z0, Z1, X1, 1);
    // vehicles on the apron (+z open end), inside the fence
    if (m >= 5.5) { y.tt = { x0: hx - 0.6 - 18.4, x1: hx - 0.6, z0: zEnd + 0.8, z1: zEnd + 3.4, c: CC[Math.floor(hsh(p.seed, 41) * CC.length)] }; st.plan.tt++; }
    if (m >= 10.5) { const ax = -hx + 5.0; y.rs = { ax, z0: zEnd + 4.1, z1: zEnd + 7.9 }; st.plan.rs++; }
    // straddle carriers over single-high interior stacks, clear of the gantry crane's spreader
    const cand = []; for (let i = 1; i < nc - 1; i++) for (let j = 0; j < nr; j++) { if (N[i][j] !== 1) continue; const x = xs[i], z = zs[j];
      if (x + CW + 0.6 > cr.tx - 1.5 && x - 0.6 < cr.tx + 1.5 && z + CL > cr.zc - 6.6 && z < cr.zc + 6.6) continue;
      cand.push([hsh(p.seed, i, j, 55) - (j === nr - 1 || j === 0 ? 0.5 : 0), i, j]); }
    cand.sort((a, b) => a[0] - b[0]); const want = nc * nr > 30 ? 2 : 1; const used = new Set();
    for (const [, i, j] of cand) { if (y.sc.length >= want) break; if (used.has(j + ':' + (i - 1)) || used.has(j + ':' + (i + 1))) continue; used.add(j + ':' + i); y.sc.push({ i, j, x: xs[i], z: zs[j], c: [[0.86, 0.86, 0.82], [0.9, 0.68, 0.1], [0.2, 0.42, 0.7]][Math.floor(hsh(p.seed, i, j, 56) * 3)], lc: CC[Math.floor(hsh(p.seed, i, j, 57) * CC.length)] }); st.plan.sc++; }
    // inner high masts: back strip at the middle aisle, back strip on the apron
    if (nr >= 2) { const a = Math.floor((nr - 1) / 2); y.masts.push([-hx + 0.55, zs[a] + CL + 0.5]); }
    if (m >= 4.5) y.masts.push([-hx + 0.55, Math.min(hz - 0.7, zEnd + Math.max(m / 2, 4.0))]); st.plan.masts += y.masts.length;
    // lashing bands (colliders over the rods on the open-strip ends)
    for (const [j, zf, s] of [[0, zs[0], -1], [nr - 1, zs[nr - 1] + CL, 1]]) { const is = []; for (let i = 0; i < nc; i++) if (N[i][j] >= 2) is.push(i); if (!is.length) continue;
      y.lash.push({ x0: xs[is[0]] + 0.05, x1: xs[is[is.length - 1]] + CW - 0.05, z0: s < 0 ? zf - 0.32 : zf, z1: s < 0 ? zf : zf + 0.32 }); }
    p.py = y;
  }
  return st.plan;
}

// ---------------------------------------------------------------- colliders (parcelfit.js predict) ----
export function yardExtras(p, rp) { const y = p.py; if (!y || PY_OFF) return []; const o = []; const hx = p.d / 2;
  for (const r of y.runs) o.push(r.ax === 'z' ? rp(r.c - 0.13, r.a0, r.c + 0.13, r.a1, 2.6) : rp(r.a0, r.c - 0.13, r.a1, r.c + 0.13, 2.6));
  if (y.gate && y.gate.portal) for (const z of [y.gate.z0 - 0.15, y.gate.z1 + 0.15]) o.push(rp(hx + 0.3 - 0.17, z - 0.17, hx + 0.3 + 0.17, z + 0.17, 5.6));
  if (y.booth) { const b = y.booth; o.push(rp(b.x0 - 0.12, b.z0 - 0.12, b.x1 + 0.12, b.z1 + 0.12, 2.9)); }
  if (y.boom) o.push(rp(y.boom.x - 0.18, y.boom.z - 0.4, y.boom.x + 0.18, y.boom.z + 0.18, 2.0)); // post + the raised arm up to head height
  if (y.tt) { const t = y.tt; o.push(rp(t.x0, t.z0, t.x1, t.z1, 4.0)); }
  if (y.rs) { const r = y.rs; o.push(rp(r.ax - 3.3, r.z0, r.ax + 6.0, r.z1, 3.4)); }
  for (const [x, z] of y.masts) o.push(rp(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 25));
  for (const l of y.lash) o.push(rp(l.x0, l.z0, l.x1, l.z1, 2.7));
  return o; }

// ---------------------------------------------------------------- bldglayer.js portExtras: yard furniture ----
// v 'vcol', nb 'neon', cb 'cone' buckets of the lot; K = kit (kg, beam, tube, put); cone(cb, x, y, z, h, r, col)
export function yardFurniture(v, nb, cb, p, K, cone) {
  const y = p.py; if (!y || PY_OFF) return; const { put, tube, beam } = K; const G = K.kg(); const hx = p.d / 2, hz = p.w / 2;
  const t4 = G.tube4; const DK = [0.1, 0.105, 0.115], CONC = [0.5, 0.49, 0.46], POST = [0.46, 0.48, 0.49], MESH = [0.36, 0.38, 0.39], SOD = [0.95, 0.66, 0.32];
  // fence
  for (const r of y.runs) { const P = (a, yy, o = 0) => (r.ax === 'z' ? [r.c + r.out * o, yy, a] : [a, yy, r.c + r.out * o]); const L = r.a1 - r.a0;
    beam(v, P(r.a0, 0.15), P(r.a1, 0.15), 0.22, CONC, 0.3);
    for (const yy of [0.36, 1.25, 2.22]) tube(v, P(r.a0, yy), P(r.a1, yy), yy > 2 ? 0.028 : 0.012, POST, t4);
    for (const [yy, o] of [[2.4, 0.16], [2.52, 0.27], [2.64, 0.38]]) tube(v, P(r.a0, yy, o), P(r.a1, yy, o), 0.008, DK, t4); // barbed strands
    const np = Math.max(1, Math.round(L / 3.5)); for (let i = 0; i <= np; i++) { const a = r.a0 + L * i / np; tube(v, P(a, 0.3), P(a, 2.3), 0.04, POST, t4); if (i % 2 === 0 || i === np) tube(v, P(a, 2.25), P(a, 2.7, 0.42), 0.025, POST, t4); }
    const o0 = r.ax === 'z' ? [r.c, 0, 0] : [0, 0, r.c]; const ra = r.ax === 'z' ? [0, 0, 1] : [1, 0, 0]; const n1 = r.ax === 'z' ? [r.out, 0, 0] : [0, 0, r.out]; const n2 = [-n1[0], 0, -n1[2]];
    if (PL_OFF) { const nm = Math.max(1, Math.round(L / 1.0)); for (let i = 1; i < nm; i++) { const a = r.a0 + L * i / nm; // welded mesh verticals (street face)
      const o = r.ax === 'z' ? [r.c, 0, a] : [a, 0, r.c]; fq(v, o, ra, n1, -0.014, 0.3, 0.014, 2.22, 0.03, MESH); } }
    else { // b_portlight: denser mesh read from afar — verticals every 0.6 m, a touch wider, on both faces (the yard side was invisible:
      // back-face culled), plus two thin mid wires; the run reads as a fence line at 100–300 m instead of dotted posts
      const nm = Math.max(2, Math.round(L / 0.6)); for (let i = 1; i < nm; i++) { const a = r.a0 + L * i / nm; const w = i % 2 ? 0.017 : 0.021;
        fq(v, o0, ra, n1, a - w, 0.3, a + w, 2.22, 0.03, MESH); fq(v, o0, ra, n2, a - w, 0.3, a + w, 2.22, 0.03, MESH); }
      for (const yy of [0.82, 1.72]) for (const nn of [n1, n2]) fq(v, o0, ra, nn, r.a0, yy - 0.012, r.a1, yy + 0.012, 0.034, MESH); } }
  // gate: portal with a lit header panel + beacons, raised boom barrier, guard booth with a lit window band, stop line
  if (y.gate) { const g = y.gate; const xf = hx + 0.3;
    if (g.portal) { for (const z of [g.z0 - 0.15, g.z1 + 0.15]) { put(v, G.box, xf, 2.8, z, 0.3, 5.6, 0.3, [0.85, 0.62, 0.1]); put(nb, G.ball, xf, 5.75, z, 0.16, 0.16, 0.16, [1, 0.55, 0.05]); }
      put(v, G.box, xf, 5.35, (g.z0 + g.z1) / 2, 0.36, 0.5, g.z1 - g.z0 + 0.6, [0.18, 0.19, 0.2]);
      put(nb, G.box, xf + 0.19, 5.35, (g.z0 + g.z1) / 2, 0.02, 0.32, (g.z1 - g.z0) * 0.72, [0.15, 0.85, 0.95]); }
    grect(v, hx - 0.35, g.z0 + 0.1, hx - 0.15, g.z1 - 0.1, GY, WHT); // stop line
    for (let i = 0; i < 5; i++) { const z = g.z0 + 0.3 + i * (g.z1 - g.z0 - 0.6) / 4; grect(v, hx - 1.6, z - 0.12, hx - 0.7, z + 0.12, GY, YEL); } // hatched lane mark
  }
  if (y.boom) { const b = y.boom; put(v, G.box, b.x, 0.55, b.z, 0.3, 1.1, 0.3, [0.85, 0.85, 0.82]); const a = 1.35; // ~77° up
    const e = [b.x, 1.0 + 3.6 * Math.sin(a), b.z - 3.6 * Math.cos(a)]; const m = [b.x, 1.0 + 1.8 * Math.sin(a), b.z - 1.8 * Math.cos(a)];
    beam(v, [b.x, 1.0, b.z], m, 0.08, [0.85, 0.12, 0.1], 0.1); beam(v, m, e, 0.08, [0.9, 0.9, 0.88], 0.1); put(nb, G.ball, b.x, 1.18, b.z, 0.08, 0.08, 0.08, [1, 0.1, 0.05]); }
  if (y.booth) { const b = y.booth; box(v, b.x0, 0.0, b.z0, b.x1, 2.6, b.z1, {}, [0.78, 0.79, 0.77]); box(v, b.x0 - 0.15, 2.6, b.z0 - 0.15, b.x1 + 0.15, 2.8, b.z1 + 0.15, {}, [0.22, 0.23, 0.25]);
    put(nb, G.box, (b.x0 + b.x1) / 2, 1.55, (b.z0 + b.z1) / 2, b.x1 - b.x0 + 0.03, 0.7, b.z1 - b.z0 + 0.03, [0.55, 0.78, 0.82]); // window band (lit)
    fq(v, [b.x0, 0, b.z0], [1, 0, 0], [0, 0, -1], 0.4, 0.05, 1.2, 2.1, 0.02, [0.2, 0.21, 0.22]); put(nb, G.ball, b.x1 - 0.2, 2.95, b.z1 - 0.2, 0.12, 0.12, 0.12, [1, 0.55, 0.05]); }
  // terminal tractor + skeletal chassis trailer carrying a box (nose toward the gate, +x)
  const wheel = (x, yy, z, r, w, ax = 'z') => { if (ax === 'z') _m4.makeRotationX(Math.PI / 2); else _m4.makeRotationZ(Math.PI / 2); _m4.scale(_s3.set(r, w, r)); _m4.setPosition(x, yy, z); v.geom(G.disc6, _m4, {}, [0.07, 0.07, 0.075]); };
  if (y.tt) { const t = y.tt; const zc = (t.z0 + t.z1) / 2; const xc0 = t.x1 - 5.6; // tractor x ∈ [xc0, t.x1]
    box(v, xc0, 0.55, zc - 1.1, t.x1, 1.05, zc + 1.1, {}, [0.14, 0.14, 0.15]); box(v, t.x1 - 2.4, 1.05, zc - 1.25, t.x1, 3.3, zc + 1.25, {}, [0.85, 0.3, 0.1]); // chassis, cab
    put(v, G.box, t.x1 + 0.02, 2.55, zc, 0.04, 0.9, 2.1, [0.08, 0.1, 0.12]); box(v, xc0 + 0.8, 1.05, zc - 1.0, xc0 + 2.4, 1.3, zc + 1.0, {}, [0.3, 0.3, 0.32]); // windscreen, fifth wheel plate
    tube(v, [t.x1 - 2.6, 1.0, zc + 1.2], [t.x1 - 2.6, 3.7, zc + 1.2], 0.09, [0.55, 0.56, 0.57], G.tube6); // exhaust stack
    put(nb, G.box, t.x1 + 0.03, 1.05, zc - 0.85, 0.02, 0.18, 0.3, [1, 0.95, 0.8]); put(nb, G.box, t.x1 + 0.03, 1.05, zc + 0.85, 0.02, 0.18, 0.3, [1, 0.95, 0.8]); // headlamps
    for (const x of [t.x1 - 1.2, xc0 + 1.0, xc0 + 2.3]) for (const s of [-1, 1]) wheel(x, 0.52, zc + s * 1.0, 0.52, 0.32);
    const tx0 = t.x0, tx1 = xc0 + 1.6; for (const s of [-0.45, 0.45]) beam(v, [tx0, 1.15, zc + s], [tx1, 1.15, zc + s], 0.18, [0.16, 0.16, 0.17], 0.32); // chassis rails
    for (let x = tx0 + 0.5; x < tx1; x += 2.4) beam(v, [x, 1.2, zc - 1.2], [x, 1.2, zc + 1.2], 0.12, [0.16, 0.16, 0.17], 0.15);
    for (const x of [tx0 + 1.0, tx0 + 2.3, tx0 + 3.6]) for (const s of [-1, 1]) wheel(x, 0.5, zc + s * 0.95, 0.5, 0.3);
    put(v, G.box, tx1 - 3.5, 0.75, zc + 0.9, 0.08, 0.7, 0.08, DK); put(v, G.box, tx1 - 3.5, 0.75, zc - 0.9, 0.08, 0.7, 0.08, DK); // landing legs
    put(nb, G.box, tx0 - 0.02, 0.95, zc - 1.0, 0.02, 0.12, 0.25, [1, 0.08, 0.05]); put(nb, G.box, tx0 - 0.02, 0.95, zc + 1.0, 0.02, 0.12, 0.25, [1, 0.08, 0.05]); // tail lamps
    const cx0 = tx0 + 0.1, cy0 = 1.34; box(v, cx0, cy0, zc - CW / 2, cx0 + CL, cy0 + CH2, zc + CW / 2, {}, t.c, false); // the box (along x), doors at the rear
    for (let r = 1; r < 12; r++) box(v, cx0 + r * 1.0, cy0 + 0.1, zc - CW / 2 - 0.05, cx0 + r * 1.0 + 0.08, cy0 + 2.45, zc + CW / 2 + 0.05, {}, mul(t.c, 0.72));
    boxEnd(v, [cx0, 0, zc - CW / 2], [0, 0, 1], [-1, 0, 0], cy0, t.c, 'door', false, 0.8); boxEnd(v, [cx0 + CL, 0, zc + CW / 2], [0, 0, -1], [1, 0, 0], cy0, t.c, 'blank', false, 0); }
  // reach stacker (along x, boom down toward −x)
  if (y.rs) { const r = y.rs; const zc = (r.z0 + r.z1) / 2; const ax = r.ax; const YC = [0.9, 0.66, 0.08];
    box(v, ax, 0.6, zc - 1.7, ax + 5.6, 1.9, zc + 1.7, {}, YC); box(v, ax + 4.6, 0.6, zc - 1.6, ax + 5.9, 2.6, zc + 1.6, {}, [0.2, 0.2, 0.21]); // body, counterweight
    box(v, ax + 1.6, 1.9, zc + 0.2, ax + 3.3, 3.8, zc + 1.6, {}, [0.3, 0.32, 0.34]); put(nb, G.box, ax + 1.58, 3.0, zc + 0.9, 0.02, 1.0, 1.2, [0.35, 0.55, 0.6]); // cab + lit glazing
    for (const x of [ax + 0.8, ax + 4.7]) for (const s of [-1, 1]) wheel(x, 0.82, zc + s * 1.45, 0.82, 0.55);
    beam(v, [ax + 4.8, 2.4, zc - 0.5], [ax - 2.6, 3.3, zc - 0.5], 0.7, YC, 0.9); // telescopic boom
    beam(v, [ax + 2.2, 1.8, zc - 0.5], [ax + 0.6, 2.85, zc - 0.5], 0.3, [0.5, 0.52, 0.54], 0.3); // lift ram
    box(v, ax - 3.3, 2.3, zc - 1.6, ax - 2.2, 2.9, zc + 1.6, {}, [0.2, 0.2, 0.22]); put(nb, G.ball, ax + 3.3, 4.0, zc + 0.9, 0.12, 0.12, 0.12, [1, 0.55, 0.05]); }
  // straddle carriers: legs + wheels in the column gaps, frame over the stack, cab, spreader holding a box
  for (const s of y.sc) { const x = s.x, z = s.z, c = s.c; const xa = x - 0.28, xb = x + CW + 0.28, za = z + 1.8, zb = z + 10.4, top = 9.0;
    for (const xx of [xa, xb]) { for (const zz of [za, zb]) { beam(v, [xx, 1.0, zz], [xx, top, zz], 0.26, c, 0.5); wheel(xx, 0.55, zz, 0.55, 0.26, 'x'); }
      beam(v, [xx, 1.0, za - 0.9], [xx, 1.0, zb + 0.9], 0.26, mul(c, 0.8), 0.45); beam(v, [xx, top, za - 0.4], [xx, top, zb + 0.4], 0.3, c, 0.7); } // bogie beams, top girders
    for (const zz of [za, zb]) beam(v, [xa, top + 0.2, zz], [xb, top + 0.2, zz], 0.4, c, 0.5);
    box(v, xb - 1.1, top + 0.45, zb - 1.5, xb + 0.1, top + 2.3, zb + 0.4, {}, [0.85, 0.85, 0.83]); put(nb, G.box, xb - 0.5, top + 1.5, zb + 0.42, 1.0, 0.8, 0.02, [0.45, 0.6, 0.62]);
    put(nb, G.ball, xa, top + 0.6, za, 0.12, 0.12, 0.12, [1, 0.55, 0.05]); put(nb, G.ball, xb, top + 0.6, zb, 0.12, 0.12, 0.12, [1, 0.55, 0.05]);
    const ys = 5.95 + 0.4; for (const [ox, oz] of [[0.3, 1.0], [CW - 0.3, 1.0], [0.3, CL - 1.0], [CW - 0.3, CL - 1.0]]) tube(v, [x + ox, top, z + oz], [x + ox, ys + 0.3, z + oz], 0.025, DK, t4);
    box(v, x - 0.05, ys, z, x + CW + 0.05, ys + 0.3, z + CL, {}, mul(c, 0.85)); // spreader
    box(v, x, ys - CH2 - 0.02, z, x + CW, ys - 0.02, z + CL, {}, s.lc, false); boxEnd(v, [x, 0, z + CL], [1, 0, 0], [0, 0, 1], ys - CH2 - 0.02, s.lc, 'door2', false, 0.7); }
  // inner high masts (same lamp / cone kit as the existing yard masts)
  for (const [x, z] of y.masts) { put(v, G.cyl8, x, 12.5, z, 0.24, 25, 0.24, [0.36, 0.38, 0.41]); put(v, G.box, x + 0.4, 24.6, z, 0.9, 0.3, 3.4, DK);
    for (const o of [-0.8, 0.8]) put(nb, G.box, x + 0.75, 24.4, z + o, 0.45, 0.12, 1.3, SOD.map((q) => q * 1.6)); put(nb, G.box, x, 25.0, z, 0.25, 0.25, 0.25, [1, 0.08, 0.05]);
    cone(cb, x + 0.8, 24.3, z, 24.2, 8.5, SOD); }
}
const _m4 = new THREE.Matrix4(), _s3 = new THREE.Vector3();
