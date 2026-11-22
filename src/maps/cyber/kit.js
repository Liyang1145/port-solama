// r6.2 霓港 building kit (user 2026-11-21: 「建模要一个个攻」). Small, real-geometry pieces shared by the archetypes in arch.js and
// the street layer in bldglayer.js: oriented beams / tubes, sagging cable bundles, neon signs with actual glass-tube strokes on a
// backing box with mounting brackets, window AC units, cage balconies with clutter, fire escapes, roll-up shutters, awnings,
// signboards and vending machines. Everything is appended into World buckets (merged per streamed chunk, freed with the chunk).
// Bucket colour rule (GeoBucket.append needs it): 'vcol', 'vcolD' and 'neon' ALWAYS get a vertex colour; 'glassRail' never does.
// LOD: small clutter (AC units, balcony clutter, shutters, vending machines, facade cables) goes to 'vcolD' (same material as
// 'vcol', aliased in bldglayer.js); its meshes are hidden when the chunk is > DETAIL_R from the camera.
import * as THREE from 'three';
import { box, prismWalls, polyCap } from '../../geo.js';
import { rng, rand, randi, pick } from '../../util.js';
import { tubeCircuit, roundPath, haloQuad, reflQuad } from './neontube.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0); const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const KG = {};
export function kg() {
  if (KG.box) return KG;
  KG.box = new THREE.BoxGeometry(1, 1, 1);
  KG.tube6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  KG.tube4 = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
  KG.cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1); KG.disc6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1); KG.cyl12 = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
  KG.ball = new THREE.SphereGeometry(1, 6, 4);
  for (const k of ['box', 'tube6', 'tube4', 'cyl8', 'disc6', 'cyl12', 'ball']) { KG[k].deleteAttribute('uv'); KG[k].setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(KG[k].attributes.position.count * 2), 2)); }
  return KG;
}
export const NEONC = [[1.0, 0.16, 0.62], [0.12, 0.9, 1.0], [0.62, 0.26, 1.0], [1.0, 0.48, 0.12], [0.22, 1.0, 0.55], [1.0, 0.86, 0.25], [1.0, 0.22, 0.25]];
export const RUST = [0.32, 0.2, 0.14], STEEL = [0.36, 0.38, 0.41], DARK = [0.1, 0.105, 0.115];

// ---------------------------------------------------------------- primitives ----
// segment a→c (3-vectors as arrays) with a unit geometry whose axis is +y: scaled (w, len, h)
export function seg(b, g, a, c, w, h, col) {
  _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const len = _d.length(); if (len < 1e-4) return; _d.multiplyScalar(1 / len);
  // basis: Y = axis, X = horizontal perpendicular (so a horizontal beam's w is its width and h its depth), Z = X × Y
  if (Math.abs(_d.y) > 0.999) _X.set(1, 0, 0); else _X.crossVectors(UP, _d).normalize();
  _Z.crossVectors(_X, _d);
  _m.makeBasis(_X.multiplyScalar(w), _Y.copy(_d).multiplyScalar(len), _Z.multiplyScalar(h ?? w));
  _m.setPosition((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2); b.geom(g, _m, {}, col);
}
export const beam = (b, a, c, w, col, h, g) => seg(b, g || kg().box, a, c, w, h ?? w, col);
export const tube = (b, a, c, r, col, g) => seg(b, g || kg().tube6, a, c, r, r, col);
// axis-aligned unit geometry placed at centre with scale
export function put(b, g, x, y, z, sx, sy, sz, col, ry = 0) { _q.setFromAxisAngle(UP, ry); _s.set(sx, sy, sz); _p.set(x, y, z); _m.compose(_p, _q, _s); b.geom(g, _m, {}, col); }
// a sagging cable a→c (parabolic sag in metres), n segments, thin 4-sided tube
export function cable(b, a, c, sag, r, col, n = 10) {
  let prev = a;
  for (let i = 1; i <= n; i++) { const t = i / n; const q = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t]; tube(b, prev, q, r, col, kg().tube4); prev = q; }
}
// a bundle of 2-5 cables with slightly different sags + a clamp near each end
export function cableBundle(b, a, c, sag, col = DARK) {
  const n = randi(2, 5);
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.07; cable(b, [a[0], a[1] + o, a[2]], [c[0], c[1] + o * 0.5, c[2]], sag * (1 + i * 0.12) + rand(0, 0.25), rand(0.018, 0.035), i === 1 && rng() < 0.3 ? [0.55, 0.12, 0.08] : col, 10); }
}

// ---------------------------------------------------------- neon tube glyphs ----
// original stroke sets in a unit cell (x right, y up). Simple CJK-like characters + pictograms; never a real brand mark.
const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const RING = (cx, cy, r, n = 12) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; o.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return o; };
export const GLYPHS = [
  [R(0.18, 0.15, 0.82, 0.85)],                                                                 // 口
  [R(0.25, 0.08, 0.75, 0.92), [[0.25, 0.5], [0.75, 0.5]]],                                       // 日
  [R(0.15, 0.32, 0.85, 0.72), [[0.5, 0.04], [0.5, 0.96]]],                                       // 中
  [[[0.1, 0.55], [0.9, 0.55]], [[0.5, 0.06], [0.5, 0.94]]],                                      // 十
  [[[0.15, 0.88], [0.85, 0.88]], [[0.5, 0.88], [0.5, 0.12]], [[0.08, 0.12], [0.92, 0.12]]],     // 工
  [[[0.15, 0.88], [0.85, 0.88]], [[0.2, 0.5], [0.8, 0.5]], [[0.5, 0.88], [0.5, 0.1]], [[0.08, 0.1], [0.92, 0.1]]], // 王
  [[[0.12, 0.85], [0.12, 0.12], [0.88, 0.12], [0.88, 0.85]], [[0.5, 0.95], [0.5, 0.12]]],      // 山
  [[[0.2, 0.9], [0.18, 0.1]], [[0.5, 0.85], [0.5, 0.15]], [[0.8, 0.92], [0.82, 0.08]]],         // 川
  [[[0.1, 0.62], [0.9, 0.62]], [[0.5, 0.95], [0.48, 0.55], [0.12, 0.06]], [[0.5, 0.55], [0.88, 0.06]]], // 大
  [R(0.15, 0.1, 0.85, 0.9), [[0.15, 0.5], [0.85, 0.5]], [[0.5, 0.9], [0.5, 0.1]]],              // 田
  [RING(0.5, 0.5, 0.38), RING(0.5, 0.5, 0.18, 8)],                                              // ◎ ring
  [[[0.1, 0.5], [0.9, 0.5]], [[0.6, 0.78], [0.9, 0.5], [0.6, 0.22]]],                           // → arrow
  [[[0.1, 0.88], [0.9, 0.88], [0.5, 0.42], [0.1, 0.88]], [[0.5, 0.42], [0.5, 0.1]], [[0.3, 0.1], [0.7, 0.1]]], // cocktail glass
  [[[0.08, 0.55], [0.92, 0.55], [0.78, 0.15], [0.22, 0.15], [0.08, 0.55]], [[0.35, 0.95], [0.55, 0.58]], [[0.55, 0.98], [0.72, 0.6]]], // noodle bowl + chopsticks
  [[[0.08, 0.5], [0.22, 0.75], [0.36, 0.5], [0.5, 0.25], [0.64, 0.5], [0.78, 0.75], [0.92, 0.5]]], // wave
];
// one glyph in a sign plane: origin o (bottom-left of the cell), e1 = right, e2 = up (unit 3-vectors), size s.
// b_neon_sign: a real tube circuit (neontube.js) — bent glass, black-out jumpers, electrodes, supports; n = face normal, back =
// tube axis → backer distance; dk = bucket for the unlit / hardware parts
function glyph(nb, dk, gl, o, e1, e2, s, r, col, n, back) {
  const P = (q) => [o[0] + (e1[0] * q[0] + e2[0] * q[1]) * s, o[1] + (e1[1] * q[0] + e2[1] * q[1]) * s, o[2] + (e1[2] * q[0] + e2[2] * q[1]) * s];
  tubeCircuit(nb, dk, gl.map((line) => line.map(P)), r, col, n, back);
}
// A neon sign: backing box (dark, centred at c, w wide along e1, h tall, t thick along n), glass-tube glyphs on the face(s),
// a tube border, and mounting hardware. blade=true: sign stands out from the wall (n = along the wall), with two arms + a strut
// back to the wall (wall point = c − e1 * (w/2 + gap)); otherwise four stand-off brackets behind the box (wall at c − n * (t/2+gap)).
export function neonSign(W, c, e1, w, h, opts = {}) {
  const n = [-e1[2], 0, e1[0]];
  const v = W.b('vcol', c[0], c[2]), nb = W.b('neon', c[0], c[2]); const G = kg();
  const col = opts.col || pick(NEONC), col2 = opts.col2 || pick(NEONC); const t = opts.t ?? 0.22, gap = opts.gap ?? 0.35;
  const e2 = [0, 1, 0]; const blade = !!opts.blade;
  const at = (a, bb, d) => [c[0] + e1[0] * a + n[0] * d, c[1] + bb, c[2] + e1[2] * a + n[2] * d];
  // backing box: oriented by e1 / n
  _q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...e1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n)));
  _s.set(w, h, t); _p.set(c[0], c[1], c[2]); _m.compose(_p, _q, _s); v.geom(G.box, _m, {}, opts.back || [0.05, 0.05, 0.06]);
  // frame lip around the face(s)
  const lip = [0.16, 0.17, 0.19];
  for (const s of blade ? [1, -1] : [1]) {
    const d = s * (t / 2 + 0.02);
    beam(v, at(-w / 2, h / 2, d), at(w / 2, h / 2, d), 0.06, lip); beam(v, at(-w / 2, -h / 2, d), at(w / 2, -h / 2, d), 0.06, lip);
  }
  // glyph tubes
  const glyphs = opts.glyphs || [pick(GLYPHS)]; const vert = h > w * 1.3; const k = glyphs.length; const r = opts.r ?? 0.035;
  const cell = vert ? Math.min(w * 0.82, (h * 0.88) / k) : Math.min(h * 0.8, (w * 0.9) / k);
  const dk = W.b('vcolD', c[0], c[2]), gb = W.b('nglow', c[0], c[2]); const back = Math.max(0.07, r * 1.9);
  for (const s of blade ? [1, -1] : [1]) {
    const d = s * (t / 2 + back); const f1 = s > 0 ? e1 : e1.map((q) => -q); // the back face reads mirrored -> flip e1
    const nf = n.map((q) => q * s);
    for (let i = 0; i < k; i++) {
      let a0, b0;
      if (vert) { a0 = -cell / 2; b0 = h / 2 - (h - cell * k) / 2 - cell * (i + 1); } else { a0 = -cell * k / 2 + cell * i; b0 = -cell / 2; }
      const o = at(s > 0 ? a0 : a0 + cell, b0, d);
      glyph(nb, dk, glyphs[i], o, f1, e2, cell, r, i % 2 && opts.alt ? col2 : col, nf, back);
    }
    // border tube inset from the edge: one open loop with its electrodes in a gap at the bottom middle (real signs do this)
    const bi = 0.12, gp = Math.min(0.12, w * 0.08); const ax = s > 0 ? 1 : -1;
    const B = [at(ax * gp, -h / 2 + bi, d), at(ax * (w / 2 - bi), -h / 2 + bi, d), at(ax * (w / 2 - bi), h / 2 - bi, d), at(-ax * (w / 2 - bi), h / 2 - bi, d), at(-ax * (w / 2 - bi), -h / 2 + bi, d), at(-ax * gp, -h / 2 + bi, d)];
    tubeCircuit(nb, dk, [B], r * 0.8, col2, nf, back, { dead: -1 });
    // near-range halo on the face (additive, night only, LOD-hidden)
    haloQuad(gb, at(0, 0, s * (t / 2 + 0.012)), f1, e2, nf, w / 2, h / 2, col.map((q, j) => (q + col2[j]) * 0.5));
    // wet-pavement reflection under the sign when the ground height is known (shop-front signs)
    if (opts.gy != null && c[1] - opts.gy < 14) { const rbk = W.b('nrefl', c[0], c[2]); const L = Math.min(10, 3 + (c[1] - opts.gy) * 0.9);
      const f = blade ? [c[0], opts.gy + 0.03, c[2]] : [c[0] + n[0] * (t / 2 + 0.1), opts.gy + 0.03, c[2] + n[2] * (t / 2 + 0.1)];
      reflQuad(rbk, f, nf, f1, w / 2 + 0.5, L, col); }
  }
  // hardware
  const met = [0.22, 0.23, 0.25];
  if (blade) {
    const wa = -w / 2 - gap; // wall side
    for (const yy of [h / 2 - 0.15, -h / 2 + 0.15]) { beam(v, at(wa, yy, 0), at(-w / 2, yy, 0), 0.08, met); put(v, G.box, ...at(wa + 0.04, yy, 0), 0.08, 0.3, 0.3, met); }
    beam(v, at(wa, -h / 2 + 0.15 - Math.min(1.2, h * 0.3), 0), at(-w / 2, -h / 2 + 0.15, 0), 0.05, met); // diagonal strut
    put(v, G.box, ...at(wa + 0.04, -h / 2 + 0.15 - Math.min(1.2, h * 0.3), 0), 0.08, 0.25, 0.25, met);
    // transformer box + conduit up the arm
    put(v, G.box, ...at(wa + 0.25, h / 2 + 0.25, 0), 0.4, 0.3, 0.25, [0.3, 0.3, 0.32]);
  } else {
    for (const a of [-w / 2 + 0.3, w / 2 - 0.3]) for (const yy of [-h / 2 + 0.2, h / 2 - 0.2]) beam(v, at(a, yy, -t / 2), at(a, yy, -t / 2 - gap), 0.07, met);
    put(v, G.box, ...at(w / 2 - 0.4, -h / 2 - 0.25, -t / 2 - gap + 0.15), 0.45, 0.3, 0.25, [0.3, 0.3, 0.32]);
  }
}
export function randGlyphs(n) { const o = []; for (let i = 0; i < n; i++) o.push(GLYPHS[randi(0, 9)]); return o; }

// ------------------------------------------------------------ facade pieces ----
// all take a facade frame F = { P(a, d) -> [x, z], len } (along the wall a, outward d) like city.js edgeFrame
const V3 = (F, a, d, y) => { const q = F.P(a, d); return [q[0], y, q[1]]; };
// window split AC unit hung on brackets: centred at a, bottom at y
export function acUnit(W, F, a, y, side = 0) {
  const v = W.b('vcolD', F.P(a, 0)[0], F.P(a, 0)[1]); const G = kg();
  const body = pick([[0.78, 0.78, 0.74], [0.7, 0.71, 0.68], [0.82, 0.8, 0.72], [0.6, 0.6, 0.58]]);
  const w = rand(0.75, 0.9), h = 0.56, dep = 0.32, d0 = 0.22;
  const c = V3(F, a, d0 + dep / 2, y + h / 2); const ang = Math.atan2(F.ox, F.oz);
  put(v, G.box, c[0], c[1], c[2], w, h, dep, body, ang);
  // fan grille: dark disc + hub on the face
  const fc = V3(F, a + w * 0.12, d0 + dep + 0.01, y + h / 2);
  _q.setFromUnitVectors(UP, new THREE.Vector3(F.ox, 0, F.oz)); _s.set(0.21, 0.03, 0.21); _p.set(...fc); _m.compose(_p, _q, _s); v.geom(G.disc6, _m, {}, [0.08, 0.08, 0.09]);
  // L brackets (rail + diagonal) + drip pipe
  for (const s of [-1, 1]) beam(v, V3(F, a + s * w * 0.35, 0.18, y - 0.3), V3(F, a + s * w * 0.35, d0 + dep * 0.8, y - 0.02), 0.035, RUST, null, G.tube4);
  if (side >= 0) tube(v, V3(F, a - w * 0.45, d0 + 0.05, y), V3(F, a - w * 0.45, d0 + 0.05, y - rand(0.5, 2.5)), 0.012, [0.85, 0.85, 0.85], kg().tube4);
}
// cage balcony (welded bars) with clutter; floor at y, width w centred at a
export function cageBalcony(W, F, a, y, w, fh) {
  const v = W.b('vcolD', F.P(a, 0)[0], F.P(a, 0)[1]); const G = kg();
  const dep = rand(0.8, 1.1); const bar = pick([[0.2, 0.22, 0.24], [0.42, 0.25, 0.18], [0.55, 0.58, 0.6], [0.18, 0.3, 0.28]]);
  const a0 = a - w / 2, a1 = a + w / 2; const top = y + Math.min(fh - 0.25, 2.5); const full = rng() < 0.55;
  // slab
  const sl = [F.P(a0, dep), F.P(a1, dep), F.P(a1, 0), F.P(a0, 0)];
  prismWalls(v, sl, y - 0.12, y + 0.06, null, [0.55, 0.54, 0.52]); polyCap(v, sl, y + 0.06, {}, [0.5, 0.49, 0.47]); polyCap(v, sl, y - 0.12, {}, [0.4, 0.4, 0.39], true);
  const yr = full ? top : y + 1.05;
  // rails + bars
  for (const yy of [y + 0.08, y + 1.05, yr]) { beam(v, V3(F, a0, dep, yy), V3(F, a1, dep, yy), 0.04, bar); beam(v, V3(F, a0, 0.05, yy), V3(F, a0, dep, yy), 0.04, bar); beam(v, V3(F, a1, 0.05, yy), V3(F, a1, dep, yy), 0.04, bar); }
  const nb = Math.max(3, Math.round(w / 0.45));
  for (let i = 0; i <= nb; i++) { const aa = a0 + (w * i) / nb; beam(v, V3(F, aa, dep, y + 0.06), V3(F, aa, dep, yr), 0.025, bar, null, kg().tube4); }
  for (const s of [a0, a1]) for (let i = 1; i < 3; i++) { const dd = (dep * i) / 3; beam(v, V3(F, s, dd, y + 0.06), V3(F, s, dd, yr), 0.025, bar, null, kg().tube4); }
  if (full) { // rusty awning roof on top of the cage
    const r = [F.P(a0 - 0.1, dep + 0.25), F.P(a1 + 0.1, dep + 0.25), F.P(a1 + 0.1, 0), F.P(a0 - 0.1, 0)];
    const Vt = (q, yy) => new THREE.Vector3(q[0], yy, q[1]); const rc = pick([[0.45, 0.3, 0.22], [0.3, 0.42, 0.5], [0.55, 0.55, 0.52], [0.2, 0.45, 0.35]]);
    v.quad(Vt(r[3], top + 0.35), Vt(r[2], top + 0.35), Vt(r[1], top + 0.08), Vt(r[0], top + 0.08), [0, 0, 1, 0, 1, 1, 0, 1], {}, rc);
    v.quad(Vt(r[0], top + 0.08), Vt(r[1], top + 0.08), Vt(r[2], top + 0.35), Vt(r[3], top + 0.35), [0, 0, 1, 0, 1, 1, 0, 1], {}, rc.map((q) => q * 0.6));
  }
  // clutter: laundry pole with clothes, potted plants, boxes, a bucket
  if (rng() < 0.6) { const yl = y + rand(1.6, 1.95); const pa = V3(F, a0 + 0.1, dep + 0.35, yl), pb = V3(F, a1 - 0.1, dep + 0.35, yl); tube(v, pa, pb, 0.015, [0.7, 0.7, 0.72], kg().tube4);
    beam(v, V3(F, a0 + 0.1, dep, yl), pa, 0.02, bar); beam(v, V3(F, a1 - 0.1, dep, yl), pb, 0.02, bar);
    const nc = randi(1, 4); for (let i = 0; i < nc; i++) { const aa = a0 + 0.3 + (w - 0.6) * (i + rand(0.2, 0.8)) / nc; const hh = rand(0.45, 0.85); const c = V3(F, aa, dep + 0.35, yl - hh / 2);
      put(v, G.box, c[0], c[1], c[2], rand(0.35, 0.6), hh, 0.02, pick([[0.85, 0.85, 0.82], [0.2, 0.3, 0.6], [0.7, 0.2, 0.25], [0.95, 0.75, 0.2], [0.3, 0.3, 0.32], [0.55, 0.7, 0.85]]), Math.atan2(F.ox, F.oz)); } }
  const np = randi(0, 3); for (let i = 0; i < np; i++) { const aa = rand(a0 + 0.3, a1 - 0.3); const c = V3(F, aa, dep - 0.25, y + 0.06);
    put(v, G.cyl8, c[0], c[1] + 0.15, c[2], 0.16, 0.3, 0.16, [0.5, 0.28, 0.18]); put(v, G.ball, c[0], c[1] + 0.5, c[2], rand(0.2, 0.32), rand(0.2, 0.4), rand(0.2, 0.32), pick([[0.16, 0.35, 0.12], [0.22, 0.42, 0.16], [0.12, 0.28, 0.1]])); }
  if (rng() < 0.5) { const c = V3(F, rand(a0 + 0.4, a1 - 0.4), 0.35, y + 0.06); const s = rand(0.35, 0.55); put(v, G.box, c[0], c[1] + s / 2, c[2], s, s, s, [0.62, 0.48, 0.3]); if (rng() < 0.5) put(v, G.box, c[0], c[1] + s + 0.15, c[2], 0.3, 0.3, 0.3, [0.66, 0.52, 0.34], 0.4); }
}
// zig-zag fire escape on a facade from y0 (first platform) up to y1, platforms every fh, width w centred at a
export function fireEscape(W, F, a, y0, y1, fh, w = 3.6) {
  const v = W.b('vcol', F.P(a, 0)[0], F.P(a, 0)[1]); const col = pick([[0.12, 0.13, 0.14], [0.3, 0.16, 0.12], [0.18, 0.24, 0.22]]); const dep = 1.25;
  const a0 = a - w / 2, a1 = a + w / 2; let k = 0;
  for (let y = y0; y < y1 - 0.5; y += fh, k++) {
    const pl = [F.P(a0, dep), F.P(a1, dep), F.P(a1, 0.1), F.P(a0, 0.1)];
    prismWalls(v, pl, y - 0.06, y, null, col); polyCap(v, pl, y, {}, col); polyCap(v, pl, y - 0.06, {}, col, true);
    for (const yy of [y + 0.5, y + 1.0]) { beam(v, V3(F, a0, dep, yy), V3(F, a1, dep, yy), 0.035, col); beam(v, V3(F, a0, 0.1, yy), V3(F, a0, dep, yy), 0.035, col); beam(v, V3(F, a1, 0.1, yy), V3(F, a1, dep, yy), 0.035, col); }
    for (let i = 0; i <= 6; i++) beam(v, V3(F, a0 + (w * i) / 6, dep, y), V3(F, a0 + (w * i) / 6, dep, y + 1.0), 0.025, col, null, kg().tube4);
    for (const s of [a0 + 0.15, a1 - 0.15]) beam(v, V3(F, s, 0.1, y - 0.05), V3(F, s, dep, y - 0.55), 0.05, col); // knee braces
    // stair to the next platform (alternating direction): two stringers + treads
    if (y + fh < y1 - 0.5) { const s0 = k % 2 ? a1 - 0.3 : a0 + 0.3, s1 = k % 2 ? a0 + 1.1 : a1 - 1.1; const dd0 = 0.35, dd1 = 0.95;
      for (const dd of [dd0, dd1]) beam(v, V3(F, s0, dd, y), V3(F, s1, dd, y + fh), 0.05, col);
      const nt = 8; for (let i = 1; i < nt; i++) { const t = i / nt; const aa = s0 + (s1 - s0) * t, yy = y + fh * t; beam(v, V3(F, aa, dd0, yy), V3(F, aa, dd1, yy), 0.24, col, 0.04); }
      beam(v, V3(F, s0, dd1 + 0.05, y + 0.9), V3(F, s1, dd1 + 0.05, y + fh + 0.9), 0.03, col); }
    else if (k === 0) break;
  }
  // drop ladder under the first platform
  for (const s of [a0 + 0.4, a0 + 0.85]) beam(v, V3(F, s, dep - 0.15, y0 - 2.3), V3(F, s, dep - 0.15, y0), 0.035, col);
  for (let yy = y0 - 2.1; yy < y0; yy += 0.3) beam(v, V3(F, a0 + 0.4, dep - 0.15, yy), V3(F, a0 + 0.85, dep - 0.15, yy), 0.025, col);
}
// roll-up shutter door over a shop bay [a0, a1], from y0 to the housing at yt; open = 0 closed .. 1 fully up
export function rollShutter(W, F, a0, a1, y0, yt, open) {
  const v = W.b('vcolD', F.P(a0, 0)[0], F.P(a0, 0)[1]); const G = kg();
  const metal = pick([[0.55, 0.56, 0.57], [0.42, 0.44, 0.46], [0.5, 0.42, 0.36], [0.35, 0.4, 0.45]]);
  const yb = y0 + (yt - y0) * open; const d = 0.24;
  // housing + guide rails
  beam(v, V3(F, a0 - 0.1, d + 0.12, yt + 0.22), V3(F, a1 + 0.1, d + 0.12, yt + 0.22), 0.42, metal.map((q) => q * 0.8), 0.44);
  for (const a of [a0, a1]) beam(v, V3(F, a, d, y0), V3(F, a, d, yt), 0.09, metal.map((q) => q * 0.7));
  if (yt - yb > 0.15) { // curtain: a slab + horizontal ribs + bottom bar with a handle
    const q = [F.P(a0, d + 0.02), F.P(a1, d + 0.02), F.P(a1, d - 0.02), F.P(a0, d - 0.02)]; prismWalls(v, q, yb, yt, null, metal);
    for (let y = yb + 0.15; y < yt - 0.05; y += 0.3) beam(v, V3(F, a0, d + 0.035, y), V3(F, a1, d + 0.035, y), 0.035, metal.map((c) => c * 0.82), 0.04);
    beam(v, V3(F, a0, d + 0.04, yb + 0.04), V3(F, a1, d + 0.04, yb + 0.04), 0.07, [0.2, 0.2, 0.21], 0.08);
    put(v, G.box, ...V3(F, (a0 + a1) / 2, d + 0.09, yb + 0.12), 0.12, 0.06, 0.06, [0.15, 0.15, 0.15]);
  }
}
// sloped fabric awning with valance and support arms over [a0, a1] at height y
export function awning(W, F, a0, a1, y, out = 1.6, col) {
  const v = W.b('vcol', F.P(a0, 0)[0], F.P(a0, 0)[1]); col = col || pick([[0.7, 0.12, 0.18], [0.1, 0.35, 0.45], [0.85, 0.55, 0.12], [0.2, 0.2, 0.22], [0.35, 0.18, 0.5], [0.15, 0.45, 0.25]]);
  const Vt = (a, d, yy) => { const q = F.P(a, d); return new THREE.Vector3(q[0], yy, q[1]); };
  const yl = y - out * 0.45;
  v.quad(Vt(a0, 0.2, y), Vt(a0, out, yl), Vt(a1, out, yl), Vt(a1, 0.2, y), [0, 0, 1, 0, 1, 1, 0, 1], {}, col);
  v.quad(Vt(a1, 0.2, y - 0.02), Vt(a1, out, yl - 0.02), Vt(a0, out, yl - 0.02), Vt(a0, 0.2, y - 0.02), [0, 0, 1, 0, 1, 1, 0, 1], {}, col.map((q) => q * 0.5));
  // valance (front drop) + side cheeks
  v.quad(Vt(a0, out, yl - 0.32), Vt(a1, out, yl - 0.32), Vt(a1, out, yl), Vt(a0, out, yl), [0, 0, 1, 0, 1, 1, 0, 1], {}, col.map((q) => q * 0.85));
  v.quad(Vt(a1, out, yl - 0.32), Vt(a0, out, yl - 0.32), Vt(a0, out, yl), Vt(a1, out, yl), [0, 0, 1, 0, 1, 1, 0, 1], {}, col.map((q) => q * 0.4));
  for (const a of [a0 + 0.1, a1 - 0.1]) beam(v, [Vt(a, 0.2, yl - 0.3).x, yl - 0.3, Vt(a, 0.2, yl - 0.3).z], [Vt(a, out - 0.05, yl).x, yl, Vt(a, out - 0.05, yl).z], 0.03, [0.25, 0.25, 0.27]);
}
// shop signboard: dark box across the bay at y with a lit face (neon panel) and a tube glyph line
export function signboard(W, F, a0, a1, y, h = 0.75, gy) {
  const w = a1 - a0; const c = V3(F, (a0 + a1) / 2, 0.42, y + h / 2); const e1 = [F.dx, 0, F.dz];
  if (rng() < 0.55) neonSign(W, c, e1, w, h, { glyphs: randGlyphs(Math.max(1, Math.min(4, Math.floor(w / (h * 1.2))))), gap: 0.2, t: 0.2, r: 0.03, g: kg().tube4, gy });
  else { // light-box sign: emissive panel face (dimmed so bloom stays sane) in a metal frame
    const v = W.b('vcol', c[0], c[2]), nb = W.b('neon', c[0], c[2]); const lc = pick(NEONC).map((q) => q * 0.22 + 0.04);
    const q = [F.P(a0, 0.5), F.P(a1, 0.5), F.P(a1, 0.18), F.P(a0, 0.18)]; prismWalls(v, q, y, y + h, null, [0.12, 0.12, 0.13]); polyCap(v, q, y + h, {}, [0.12, 0.12, 0.13]);
    const f = [F.P(a0 + 0.08, 0.52), F.P(a1 - 0.08, 0.52), F.P(a1 - 0.08, 0.5), F.P(a0 + 0.08, 0.5)]; prismWalls(nb, f.slice(0, 2).concat(f.slice(2)), y + 0.08, y + h - 0.08, null, lc);
  }
}
// vending machine standing against the wall at a (facing out)
export function vending(W, F, a, y0) {
  const v = W.b('vcolD', F.P(a, 0)[0], F.P(a, 0)[1]), nb = W.b('neon', F.P(a, 0)[0], F.P(a, 0)[1]); const G = kg();
  const body = pick([[0.85, 0.1, 0.12], [0.1, 0.25, 0.65], [0.92, 0.92, 0.9], [0.12, 0.12, 0.13], [0.95, 0.6, 0.1], [0.15, 0.55, 0.35]]);
  const w = 0.95, h = 1.85, dep = 0.75; const ang = Math.atan2(F.ox, F.oz);
  const c = V3(F, a, 0.3 + dep / 2, y0 + h / 2); put(v, G.box, c[0], c[1], c[2], w, h, dep, body, ang);
  // lit display window (upper 55 %), button column, coin panel, dispensing slot, top header light
  const lc = pick([[0.35, 0.4, 0.45], [0.42, 0.38, 0.3], [0.3, 0.42, 0.4]]);
  const p1 = V3(F, a - 0.1, 0.3 + dep + 0.005, y0 + 1.25); put(nb, G.box, p1[0], p1[1], p1[2], 0.62, 0.8, 0.02, lc, ang);
  const p2 = V3(F, a + 0.36, 0.3 + dep + 0.01, y0 + 1.15); put(v, G.box, p2[0], p2[1], p2[2], 0.14, 0.7, 0.03, [0.15, 0.15, 0.16], ang);
  const p3 = V3(F, a - 0.05, 0.3 + dep + 0.01, y0 + 0.35); put(v, G.box, p3[0], p3[1], p3[2], 0.7, 0.22, 0.04, [0.04, 0.04, 0.05], ang);
  const p4 = V3(F, a, 0.3 + dep + 0.005, y0 + h - 0.1); put(nb, G.box, p4[0], p4[1], p4[2], 0.85, 0.12, 0.02, pick(NEONC).map((q) => q * 0.3), ang);
}
// facade frame for the polygon edge p→q (CCW as geo.rect): a along the edge, d outward
export function edge(p, q) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]); const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len; const ox = -dz, oz = dx;
  return { len, dx, dz, ox, oz, P: (a, d) => [p[0] + dx * a + ox * d, p[1] + dz * a + oz * d] };
}

// r6.2b: aluminium storefront over a shop bay [a0, a1] (sill / head / transom + mullions, a door with push bar, a tinted glass
// pane in front of the facade shader's store window so it reads as glass instead of a flat bright band), plus sidewalk clutter.
export function storefront(W, F, a0, a1, y0, yt) {
  const v = W.b('vcol', F.P(a0, 0)[0], F.P(a0, 0)[1]), g = W.b('glassRail', F.P(a0, 0)[0], F.P(a0, 0)[1]);
  const fr = pick([[0.12, 0.12, 0.13], [0.45, 0.46, 0.47], [0.3, 0.22, 0.15], [0.62, 0.6, 0.56]]); const d = 0.22, w = a1 - a0;
  const ys = y0 + 0.45, yh = yt - 0.06, ytr = Math.min(yh - 0.35, y0 + 2.6);
  for (const yy of [ys, ytr, yh]) beam(v, V3(F, a0, d, yy), V3(F, a1, d, yy), 0.08, fr, 0.1);
  beam(v, V3(F, a0, d - 0.04, y0 + 0.22), V3(F, a1, d - 0.04, y0 + 0.22), 0.06, [0.25, 0.25, 0.26], 0.44); // kickplate
  const nm = Math.max(1, Math.round(w / 1.4)); for (let i = 0; i <= nm; i++) { const a = a0 + (w * i) / nm; beam(v, V3(F, a, d, y0 + 0.02), V3(F, a, d, yh), 0.07, fr, 0.1); }
  const da = rng() < 0.5 ? a0 + 0.15 : a1 - 1.15; // door leaf: frame + push bar + handle
  beam(v, V3(F, da, d + 0.02, y0 + 0.02), V3(F, da, d + 0.02, ytr), 0.09, fr, 0.08); beam(v, V3(F, da + 1.0, d + 0.02, y0 + 0.02), V3(F, da + 1.0, d + 0.02, ytr), 0.09, fr, 0.08);
  beam(v, V3(F, da + 0.1, d + 0.06, y0 + 1.05), V3(F, da + 0.9, d + 0.06, y0 + 1.05), 0.04, [0.7, 0.7, 0.72]);
  const q = [F.P(a0, d + 0.01), F.P(a1, d + 0.01), F.P(a1, d - 0.01), F.P(a0, d - 0.01)]; prismWalls(g, q, ys, yh, null);
  // sidewalk clutter in front of the bay
  const c = W.b('vcolD', F.P(a0, 0)[0], F.P(a0, 0)[1]); const G = kg(); const r = rng(); let cl = null; // b_storefront: report the clutter span
  if (r < 0.3) { const cc = pick([[0.15, 0.35, 0.6], [0.7, 0.2, 0.15], [0.85, 0.65, 0.1], [0.2, 0.5, 0.3]]); const a = rand(a0 + 0.5, a1 - 0.5); const k = randi(2, 4); cl = [a - 0.3, a + 0.85]; // crate stack
    for (let i = 0; i < k; i++) { const p = V3(F, a + (i % 2) * 0.55, 0.7, y0 + 0.17 + Math.floor(i / 2) * 0.32); put(c, G.box, p[0], p[1], p[2], 0.5, 0.3, 0.38, cc, Math.atan2(F.ox, F.oz) + rand(-0.1, 0.1)); } }
  else if (r < 0.5) { const a = rand(a0 + 0.4, a1 - 0.4); cl = [a - 0.25, a + 0.85]; const p = V3(F, a, 0.75, y0 + 0.45); put(c, G.cyl8, p[0], p[1], p[2], 0.17, 0.9, 0.17, pick([[0.15, 0.3, 0.6], [0.9, 0.45, 0.1], [0.75, 0.75, 0.72]])); // gas bottle + stool
    const s = V3(F, a + 0.6, 0.9, y0 + 0.25); put(c, G.cyl8, s[0], s[1], s[2], 0.17, 0.5, 0.17, [0.75, 0.15, 0.15]); }
  else if (r < 0.65) { const a = rand(a0 + 0.6, a1 - 0.6); cl = [a - 0.4, a + 0.4]; const p = V3(F, a, 1.2, y0 + 0.55); // A-frame menu board
    put(c, G.box, p[0], p[1], p[2], 0.6, 0.85, 0.08, [0.08, 0.08, 0.09], Math.atan2(F.ox, F.oz)); const p2 = V3(F, a, 1.32, y0 + 0.62); put(W.b('neon', p2[0], p2[2]), G.box, p2[0], p2[1], p2[2], 0.45, 0.55, 0.02, pick(NEONC).map((x) => x * 0.25), Math.atan2(F.ox, F.oz)); }
  return { cl, da };
}
