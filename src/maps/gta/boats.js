// marina_a: original procedural boats for map A 索拉纳港 (no external assets). Five hull types, each built twice (near / far LOD)
// as one vertex-coloured BufferGeometry with a per-vertex part code aK:
//   0 plain   1 hull topside (takes the per-instance tint aTint)   2 glass   3 chrome / stainless   4 nav / anchor light   5 cabin glass that may be lit at night
// Local frame: +x = bow, +y up, z = beam, origin at the waterline amidships. Instances bob / roll on the water in the vertex shader.
import * as THREE from 'three';
import { prep } from '../../mats.js';
import { U } from '../../env.js';

const C = {
  white: [0.93, 0.93, 0.91], offw: [0.86, 0.85, 0.80], deck: [0.82, 0.81, 0.77], teak: [0.52, 0.36, 0.22], glass: [0.05, 0.07, 0.09],
  steel: [0.78, 0.79, 0.80], black: [0.07, 0.07, 0.08], grey: [0.35, 0.36, 0.38], navy: [0.08, 0.13, 0.26], bottomR: [0.42, 0.10, 0.08],
  bottomB: [0.10, 0.14, 0.26], canvas: [0.12, 0.22, 0.40], cush: [0.88, 0.84, 0.74], tan: [0.70, 0.62, 0.48], red: [0.70, 0.12, 0.10],
};

// ------------------------------------------------------------------------------------------------- geometry builder ----
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; }
  // append a three.js geometry (any) transformed by m, one colour, one part code
  geo(g, m, col, k = 0) {
    const ng = (g.index ? g.toNonIndexed() : g.clone()); if (m) ng.applyMatrix4(m); if (!ng.attributes.normal) ng.computeVertexNormals();
    const P = ng.attributes.position, N = ng.attributes.normal;
    for (let i = 0; i < P.count; i++) { this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i)); this.c.push(col[0], col[1], col[2]); this.k.push(k); }
    ng.dispose();
  }
  box(x0, x1, y0, y1, z0, z1, col, k = 0) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); this.geo(g, null, col, k); g.dispose(); }
  // round rod between two points
  rod(a, b, r, col, k = 3, seg = 5) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const d = new THREE.Vector3().subVectors(B, A); const L = d.length(); if (L < 1e-3) return;
    const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)); this.geo(g, m, col, k); g.dispose();
  }
  // flat-shaded quad (a,b,c,d CCW seen from the front)
  quad(a, b, c, d, col, k = 0, both = false) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n[0] /= l; n[1] /= l; n[2] /= l;
    for (const v of [a, b, c, a, c, d]) { this.p.push(...v); this.n.push(...n); this.c.push(...col); this.k.push(k); }
    if (both) this.quad(d, c, b, a, col, k);
  }
  // loft between a bottom polygon (xz, y0) and the same polygon shrunk toward its centroid by `ins` (and shifted by dx) at y1
  prism(poly, y0, y1, col, k = 0, ins = 0, dx = 0, top = true) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const T = poly.map((p) => { const vx = p[0] - cx, vz = p[1] - cz, l = Math.hypot(vx, vz) || 1; const s = Math.max(0, 1 - ins / l); return [cx + vx * s + dx, cz + vz * s]; });
    let a2 = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const ccw = a2 < 0; // in (x, z) with y up, outward faces need this order
    for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; const a = [poly[i][0], y0, poly[i][1]], b = [poly[j][0], y0, poly[j][1]], c = [T[j][0], y1, T[j][1]], d = [T[i][0], y1, T[i][1]];
      if (ccw) this.quad(a, b, c, d, col, k); else this.quad(b, a, d, c, col, k); }
    if (top) for (let i = 1; i < T.length - 1; i++) { const a = [T[0][0], y1, T[0][1]], b = [T[i][0], y1, T[i][1]], c = [T[i + 1][0], y1, T[i + 1][1]]; const tri = ccw ? [a, b, c] : [a, c, b]; this.quad(tri[0], tri[1], tri[2], tri[2], col, k); }
  }
  // smooth strip grid rows x cols (P[i][j] = [x,y,z]); flip reverses the winding
  grid(P, col, k, flip) {
    const R = P.length, Cn = P[0].length; const pos = new Float32Array(R * Cn * 3); let o = 0; for (const row of P) for (const v of row) { pos[o++] = v[0]; pos[o++] = v[1]; pos[o++] = v[2]; }
    const idx = []; for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cn - 1; j++) { const a = i * Cn + j, b = (i + 1) * Cn + j, c = (i + 1) * Cn + j + 1, d = i * Cn + j + 1; if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); this.geo(g, null, col, k); g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(this.k, 1)); g.computeBoundingSphere(); return g;
  }
}

// --------------------------------------------------------------------------------------------------------- hull ----
// planing / displacement hull lofted from cross-sections: topside band (tinted), boot stripe, antifouling bottom, transom, deck.
function hull(gb, o, lod) {
  const { L, B, fb, rise = 0.3, dk = 0.5, rake = 1.0, boot = C.navy, bottom = C.bottomB, deck = C.deck } = o;
  const N = lod ? 9 : 24;
  const hbf = (t) => (t < 0.5 ? 0.88 + 0.12 * (t / 0.5) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2.1))));
  const hb = (t) => Math.max(0.015, (B / 2) * hbf(t)), ys = (t) => fb * (1 + rise * t * t), yk = (t) => -dk * (t < 0.72 ? 1 : Math.max(0.12, 1 - (t - 0.72) / 0.28));
  const X = (t, y) => { const r = Math.max(0, (t - 0.68) / 0.32); const hk = yk(t), hs = ys(t); return -L / 2 + t * L + rake * r * r * ((y - hk) / (hs - hk) - 1); };
  // section (half, z >= 0): [z, y] from the gunwale down to the keel, split into bands
  const sec = (t) => { const b = hb(t), s = ys(t), k = yk(t); const cb = b * (t < 0.6 ? 0.86 : 0.86 * (1 - (t - 0.6) / 0.4 * 0.75));
    return { top: [[b, s], [b * 0.99, s * 0.55 + 0.1], [b * 0.975, 0.16]], boot: [[b * 0.975, 0.16], [b * 0.965, 0.02]], bot: [[b * 0.965, 0.02], [cb, k * 0.35], [0, k]] }; };
  const T = []; for (let i = 0; i < N; i++) T.push(i / (N - 1));
  for (const sz of [1, -1]) for (const band of ['top', 'boot', 'bot']) {
    const P = T.map((t) => sec(t)[band].map(([z, y]) => [X(t, y), y, z * sz]));
    gb.grid(P, band === 'top' ? C.white : band === 'boot' ? boot : bottom, band === 'top' ? 1 : 0, sz > 0);
  }
  // transom (t = 0): fan over the whole section, tinted like the topsides above the boot stripe
  { const s = sec(0); const pts = [...s.top, ...s.boot.slice(1), ...s.bot.slice(1)]; const x = X(0, 0) ;
    for (let j = 0; j < pts.length - 1; j++) for (const sz of [1, -1]) { const a = [x, pts[j][1], pts[j][0] * sz], b = [x, pts[j + 1][1], pts[j + 1][0] * sz], c = [x, pts[j + 1][1], 0], d = [x, pts[j][1], 0];
      const col = pts[j][1] > 0.15 ? C.white : pts[j][1] > 0.0 ? boot : bottom; const kk = pts[j][1] > 0.15 ? 1 : 0; if (sz > 0) gb.quad(d, c, b, a, col, kk); else gb.quad(a, b, c, d, col, kk); } }
  // deck at the sheer
  { const P = T.map((t) => [[X(t, ys(t)), ys(t), hb(t)], [X(t, ys(t)), ys(t), -hb(t)]]);
    for (let i = 0; i < N - 1; i++) { const a = P[i][0], b = P[i][1], c = P[i + 1][1], d = P[i + 1][0]; gb.quad(a, d, c, b, deck, 0); } }
  // rub rail / toe rail along the sheer (dark / stainless)
  if (!lod) for (let i = 0; i < N - 1; i++) for (const sz of [1, -1]) { const t0 = T[i], t1 = T[i + 1];
    gb.rod([X(t0, ys(t0) - 0.06), ys(t0) - 0.06, (hb(t0) + 0.02) * sz], [X(t1, ys(t1) - 0.06), ys(t1) - 0.06, (hb(t1) + 0.02) * sz], 0.035, o.rub || C.grey, 0, 4); }
  const at = (x) => { const t = Math.min(1, Math.max(0, (x + L / 2) / L)); return { hb: hb(t), ys: ys(t) }; };
  return { at, X, ys, hb, sternX: -L / 2, bowX: L / 2 + 0 };
}
// rails along the bow (stanchions + top rail) from x0 forward
function bowRail(gb, H, x0, x1, h, n = 5) {
  for (const sz of [1, -1]) { let prev = null;
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * (i / n); const a = H.at(x); const z = Math.max(0.05, a.hb - 0.08) * sz; const p = [x, a.ys, z], q = [x, a.ys + h, z];
      gb.rod(p, q, 0.016, C.steel, 3, 4); if (prev) gb.rod(prev, q, 0.018, C.steel, 3, 4); prev = q; } }
}
const rectP = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// a cabin outline following the hull's half-beam between x0 and x1, inset w from the gunwale, nose pointed when x1 nears the bow
function cabinPoly(H, x0, x1, w, n = 6) { const L = [], R = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; const b = Math.max(0.12, H.at(x).hb - w); L.push([x, b]); R.push([x, -b]); } return [...L, ...R.reverse()]; }
function outboard(gb, x, z, y, s = 1) {
  gb.box(x - 0.55 * s, x, y - 0.1, y + 0.62 * s, z - 0.26 * s, z + 0.26 * s, C.black); gb.box(x - 0.5 * s, x - 0.05, y + 0.62 * s, y + 0.7 * s, z - 0.22 * s, z + 0.22 * s, C.black);
  gb.box(x - 0.34 * s, x - 0.16 * s, y - 0.95, y - 0.1, z - 0.07, z + 0.07, C.grey); gb.box(x - 0.42 * s, x - 0.04, y - 1.0, y - 0.9, z - 0.1, z + 0.1, C.grey);
}

// ------------------------------------------------------------------------------------------------------ types ----
// 0 bowrider 6.6 m · 1 centre console 8.4 m with T-top · 2 express cruiser 11.5 m · 3 flybridge motor yacht 16 m · 4 sloop 10.5 m
export const TYPES = [
  { name: 'bowrider', L: 6.6, B: 2.5 }, { name: 'console', L: 8.4, B: 2.7 }, { name: 'express', L: 11.5, B: 3.5 }, { name: 'flybridge', L: 16, B: 4.6 }, { name: 'sloop', L: 10.5, B: 3.4 },
];
export function boatGeometry(type, lod) {
  const gb = new GB(); const T = TYPES[type]; const L = T.L, B = T.B;
  if (type === 0) { // bowrider: open bow seating, wrap windshield, outboard
    const H = hull(gb, { L, B, fb: 0.72, rise: 0.35, dk: 0.45, rake: 0.9, boot: C.navy, bottom: C.bottomB }, lod);
    const xw = 0.35; const a = H.at(xw);
    gb.prism([[xw, a.hb - 0.1], [xw + 0.25, a.hb - 0.25], [xw + 0.25, -(a.hb - 0.25)], [xw, -(a.hb - 0.1)]], a.ys, a.ys + 0.42, C.glass, 2, 0.12, -0.25);
    gb.box(xw - 1.0, xw - 0.1, a.ys, a.ys + 0.42, 0.25, a.hb - 0.15, C.white, 0); gb.box(xw - 1.0, xw - 0.1, a.ys, a.ys + 0.42, -(a.hb - 0.15), -0.25, C.white, 0); // consoles
    if (!lod) { gb.box(xw - 0.65, xw - 0.35, a.ys + 0.42, a.ys + 0.48, a.hb - 0.85, a.hb - 0.45, C.black); // wheel housing
      gb.box(-L / 2 + 0.6, -L / 2 + 1.5, a.ys - 0.1, a.ys + 0.35, -(a.hb - 0.2), a.hb - 0.2, C.cush); gb.box(-L / 2 + 0.6, -L / 2 + 0.85, a.ys + 0.35, a.ys + 0.75, -(a.hb - 0.2), a.hb - 0.2, C.cush); // stern bench
      gb.prism(cabinPoly(H, xw + 0.5, L / 2 - 0.5, 0.2, 4), H.at(xw + 0.5).ys - 0.25, H.at(xw + 0.5).ys + 0.05, C.cush, 0, 0.0, 0, true); // bow cushions
      bowRail(gb, H, L * 0.15, L / 2 - 0.4, 0.35, 3); }
    outboard(gb, -L / 2 - 0.05, 0, H.at(-L / 2).ys, 1);
  } else if (type === 1) { // centre console with T-top, twin outboards, leaning post
    const H = hull(gb, { L, B, fb: 0.95, rise: 0.4, dk: 0.55, rake: 1.2, boot: C.black, bottom: C.bottomB }, lod);
    const y = H.at(-L * 0.3).ys - 0.01; const cx = -0.3;
    gb.prism(rectP(cx - 0.6, cx + 0.6, -0.55, 0.55), y, y + 1.0, C.white, 1, 0.06); // console
    gb.prism([[cx + 0.55, -0.5], [cx + 0.55, 0.5], [cx + 0.75, 0.45], [cx + 0.75, -0.45]], y + 1.0, y + 1.45, C.glass, 2, 0.05, -0.15); // windscreen
    gb.box(cx - 1.6, cx - 0.9, y, y + 0.9, -0.5, 0.5, C.white); gb.box(cx - 1.65, cx - 0.85, y + 0.9, y + 1.0, -0.55, 0.55, C.cush); // leaning post
    for (const [px, pz] of [[cx - 1.0, 0.62], [cx - 1.0, -0.62], [cx + 0.5, 0.62], [cx + 0.5, -0.62]]) gb.rod([px, y, pz], [px, y + 2.15, pz], 0.035, C.steel, 3, lod ? 4 : 6);
    gb.box(cx - 1.35, cx + 0.85, y + 2.15, y + 2.25, -0.85, 0.85, C.white, 1); // T-top
    if (!lod) { gb.box(cx - 0.2, cx + 0.2, y + 2.25, y + 2.33, -0.15, 0.15, C.black); gb.box(cx + 0.05, cx + 0.12, y + 2.33, y + 2.36, -0.05, 0.05, C.white, 4); // radar dome + light
      gb.box(cx + 0.2, cx + 0.45, y + 1.0, y + 1.05, -0.3, 0.3, C.black); bowRail(gb, H, L * 0.12, L / 2 - 0.5, 0.45, 4);
      gb.box(-L / 2 + 0.25, -L / 2 + 0.75, y - 0.15, y + 0.35, -(B / 2 - 0.35), B / 2 - 0.35, C.white); }
    const ys = H.at(-L / 2).ys; outboard(gb, -L / 2 - 0.05, 0.42, ys, 1.15); outboard(gb, -L / 2 - 0.05, -0.42, ys, 1.15);
  } else if (type === 2) { // express cruiser: raked windscreen, hardtop, cabin forward, swim platform
    const H = hull(gb, { L, B, fb: 1.25, rise: 0.25, dk: 0.75, rake: 1.4, boot: C.navy, bottom: C.bottomB }, lod);
    const y = H.at(-L * 0.3).ys - 0.01;
    gb.prism(cabinPoly(H, 0.6, L / 2 - 1.6, 0.35, lod ? 3 : 6), y, y + 0.42, C.white, 1, 0.25, 0.1); // foredeck cabin top
    if (!lod) for (const sz of [1, -1]) for (let k = 0; k < 3; k++) { const x = 1.6 + k * 1.1; const b = H.at(x).hb; gb.box(x - 0.3, x + 0.3, y - 0.45, y - 0.28, sz * (b + 0.003) - 0.012, sz * (b + 0.003) + 0.012, C.glass, 5); } // hull ports
    const wx = 0.3; const a = H.at(wx);
    gb.prism([[wx, a.hb - 0.15], [wx + 0.5, a.hb - 0.4], [wx + 0.5, -(a.hb - 0.4)], [wx, -(a.hb - 0.15)]], y + 0.42, y + 0.95, C.glass, 2, 0.2, -0.45); // windscreen
    for (const sz of [1, -1]) gb.rod([wx - 2.6, y, sz * (a.hb - 0.2)], [wx - 2.2, y + 1.85, sz * (a.hb - 0.3)], 0.05, C.white, 0, lod ? 4 : 6); // hardtop legs
    gb.prism(rectP(wx - 2.9, wx - 0.1, -(a.hb - 0.25), a.hb - 0.25), y + 1.85, y + 1.98, C.white, 1, 0.05); // hardtop
    gb.box(-L / 2 - 0.8, -L / 2, 0.15, 0.3, -(B / 2 - 0.3), B / 2 - 0.3, C.teak); // swim platform
    if (!lod) { gb.box(-L / 2 + 0.3, -L / 2 + 1.6, y - 0.2, y + 0.3, -(B / 2 - 0.4), B / 2 - 0.4, C.cush); gb.box(-L / 2 + 0.3, -L / 2 + 0.6, y + 0.3, y + 0.8, -(B / 2 - 0.4), B / 2 - 0.4, C.cush);
      gb.box(wx - 1.6, wx - 0.6, y, y + 0.85, a.hb - 1.2, a.hb - 0.3, C.white); gb.box(wx - 0.9, wx - 0.7, y + 0.85, y + 0.9, a.hb - 0.95, a.hb - 0.55, C.black);
      gb.box(wx - 2.0, wx - 1.8, y + 1.98, y + 2.25, -0.04, 0.04, C.steel, 3); gb.box(wx - 1.94, wx - 1.86, y + 2.25, y + 2.31, -0.04, 0.04, C.white, 4);
      bowRail(gb, H, L * 0.05, L / 2 - 0.6, 0.55, 5); }
  } else if (type === 3) { // flybridge motor yacht: two-deck superstructure, dark window band, flybridge with bimini + radar arch
    const H = hull(gb, { L, B, fb: 1.7, rise: 0.22, dk: 1.0, rake: 2.0, boot: C.navy, bottom: C.bottomB, rub: C.steel }, lod);
    const y = H.at(-L * 0.3).ys - 0.01;
    const sup = cabinPoly(H, -L * 0.28, L * 0.2, 0.45, lod ? 3 : 6);
    gb.prism(sup, y, y + 0.55, C.white, 0, 0.0);                                   // saloon base
    gb.prism(sup.map(([x, z]) => [x, z * 1.004]), y + 0.55, y + 1.45, C.glass, 5, 0.12, 0.0, false); // window band (raked inward)
    gb.prism(cabinPoly(H, -L * 0.28 + 0.12, L * 0.2 - 0.6, 0.57, lod ? 3 : 6), y + 1.45, y + 1.6, C.white, 0, 0.0);
    gb.prism(cabinPoly(H, -L * 0.28 + 0.12, L * 0.2 - 0.6, 0.57, lod ? 3 : 6), y + 1.6, y + 1.75, C.white, 1, 0.08);
    if (!lod) { for (const sz of [1, -1]) for (let k = 0; k < 4; k++) { const x = L * 0.22 + k * 0.9; const b = H.at(x).hb; gb.box(x - 0.32, x + 0.32, y - 0.62, y - 0.45, sz * (b + 0.003) - 0.012, sz * (b + 0.003) + 0.012, C.glass, 5); }
      for (const sz of [1, -1]) { const b = H.at(-L * 0.05).hb; gb.box(-L * 0.25, L * 0.12, y - 0.95, y - 0.75, sz * (b + 0.005) - 0.015, sz * (b + 0.005) + 0.015, C.glass, 5); } }
    // flybridge: helm console, seating, rail, bimini on struts, radar arch with lights
    const fy = y + 1.75; const fx0 = -L * 0.24, fx1 = L * 0.08; const fb2 = H.at(0).hb - 0.75;
    gb.box(fx1 - 1.1, fx1 - 0.2, fy, fy + 0.85, -0.6, 0.6, C.white); gb.prism([[fx1 - 0.2, -0.55], [fx1 - 0.2, 0.55], [fx1 + 0.05, 0.5], [fx1 + 0.05, -0.5]], fy + 0.85, fy + 1.15, C.glass, 2, 0.04, -0.1);
    gb.box(fx0 + 0.4, fx0 + 1.6, fy, fy + 0.45, -fb2 + 0.2, fb2 - 0.2, C.cush);
    for (const sz of [1, -1]) { let prev = null; for (let i = 0; i <= (lod ? 1 : 4); i++) { const x = fx0 + (fx1 - fx0) * i / (lod ? 1 : 4); const q = [x, fy + 0.9, sz * fb2]; if (!lod) gb.rod([x, fy, sz * fb2], q, 0.02, C.steel, 3, 4); if (prev) gb.rod(prev, q, 0.025, C.steel, 3, 4); prev = q; } }
    for (const sz of [1, -1]) { gb.rod([fx0 + 0.3, fy, sz * (fb2 - 0.05)], [fx0 + 0.9, fy + 2.0, sz * (fb2 - 0.25)], 0.06, C.white, 0, lod ? 4 : 6); }
    gb.prism(rectP(fx0 + 0.6, fx0 + 1.2, -(fb2 - 0.2), fb2 - 0.2), fy + 2.0, fy + 2.12, C.white, 0, 0.0); // radar arch top
    gb.prism(rectP(fx0 + 1.1, fx1 - 0.3, -(fb2 - 0.1), fb2 - 0.1), fy + 1.85, fy + 1.92, C.canvas, 0, 0.0); // bimini
    if (!lod) { gb.box(fx0 + 0.75, fx0 + 1.05, fy + 2.12, fy + 2.22, -0.9, 0.9, C.black); gb.box(fx0 + 0.85, fx0 + 0.95, fy + 2.22, fy + 2.3, -0.04, 0.04, C.white, 4);
      gb.box(-L / 2 - 1.2, -L / 2, 0.2, 0.36, -(B / 2 - 0.35), B / 2 - 0.35, C.teak); for (const sz of [1, -1]) gb.rod([-L / 2 - 0.1, 0.36, sz * 0.9], [-L / 2 - 0.1, y + 0.1, sz * 0.9], 0.02, C.steel, 3, 4); // swim platform + ladder rails
      gb.box(-L / 2 + 0.1, -L * 0.28, y - 0.05, y + 0.95, B / 2 - 0.45, B / 2 - 0.35, C.white); gb.box(-L / 2 + 0.1, -L * 0.28, y - 0.05, y + 0.95, -(B / 2 - 0.35), -(B / 2 - 0.45), C.white); // cockpit coamings
      gb.box(-L / 2 + 0.3, -L * 0.28 - 0.3, y + 0.85, y + 0.95, -1.0, 1.0, C.teak); // cockpit table
      bowRail(gb, H, L * 0.18, L / 2 - 0.8, 0.7, 6); }
    else gb.box(-L / 2 - 1.2, -L / 2, 0.2, 0.36, -(B / 2 - 0.35), B / 2 - 0.35, C.teak);
  } else { // sloop: low coachroof with ports, mast, boom with sail cover, shrouds, stays, wheel
    const H = hull(gb, { L, B, fb: 1.0, rise: 0.18, dk: 0.6, rake: 1.6, boot: C.red, bottom: C.bottomR, deck: C.offw }, lod);
    const y = H.at(-L * 0.3).ys - 0.01;
    const cab = cabinPoly(H, -L * 0.12, L * 0.22, 0.42, lod ? 3 : 6);
    gb.prism(cab, y, y + 0.48, C.offw, 0, 0.15, 0.05);
    if (!lod) for (const sz of [1, -1]) for (let k = 0; k < 3; k++) { const x = -L * 0.06 + k * 0.9; const b = H.at(x).hb - 0.47; gb.box(x - 0.22, x + 0.22, y + 0.2, y + 0.32, sz * b - 0.02, sz * b + 0.02, C.glass, 5); }
    const mx = L * 0.12, mh = L * 1.35, my = y + 0.48; gb.rod([mx, my, 0], [mx, my + mh, 0], 0.075, C.steel, 3, lod ? 4 : 8);
    gb.rod([mx, my + 1.0, 0], [-L * 0.32, my + 0.95, 0], 0.06, C.steel, 3, lod ? 4 : 6); // boom
    const sc = new THREE.CylinderGeometry(0.2, 0.12, L * 0.42, lod ? 5 : 9); sc.rotateZ(Math.PI / 2); gb.geo(sc, new THREE.Matrix4().makeTranslation((mx - L * 0.32) / 2 + 0.2, my + 1.18, 0), C.canvas, 0); sc.dispose(); // sail cover
    gb.box(mx - 0.05, mx + 0.05, my + mh, my + mh + 0.08, -0.05, 0.05, C.white, 4); // masthead light
    if (!lod) { const tip = [mx, my + mh, 0]; const bowP = [L / 2 + 0.4, H.at(L / 2).ys + 0.1, 0]; gb.rod(tip, bowP, 0.012, C.steel, 3, 3); gb.rod(tip, [-L / 2 + 0.2, H.at(-L / 2).ys + 0.1, 0], 0.012, C.steel, 3, 3);
      const fz = new THREE.CylinderGeometry(0.11, 0.06, mh * 0.85, 7); const fd = new THREE.Vector3(bowP[0] - mx, bowP[1] - (my + mh), 0).normalize(); // furled genoa on the forestay
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fd.clone().negate()); gb.geo(fz, new THREE.Matrix4().compose(new THREE.Vector3((mx + bowP[0]) / 2 + 0.2, (my + mh + bowP[1]) / 2 - 0.4, 0), q, new THREE.Vector3(1, 1, 1)), [0.9, 0.9, 0.86], 0); fz.dispose();
      for (const sz of [1, -1]) { const b = H.at(mx).hb - 0.06; gb.rod(tip, [mx - 0.2, H.at(mx).ys, sz * b], 0.01, C.steel, 3, 3); gb.rod([mx, my + mh * 0.5, 0], [mx + 0.3, H.at(mx).ys, sz * b], 0.01, C.steel, 3, 3);
        gb.rod([mx, my + mh * 0.5, 0], [mx, my + mh * 0.5, sz * 0.75], 0.02, C.steel, 3, 3); }
      const wh = new THREE.TorusGeometry(0.45, 0.025, 4, 14); gb.geo(wh, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-L * 0.36, y + 0.55, 0), C.steel, 3); wh.dispose(); gb.box(-L * 0.37, -L * 0.35, y, y + 0.55, -0.06, 0.06, C.steel, 3);
      bowRail(gb, H, L * 0.25, L / 2 - 0.4, 0.6, 3);
      for (const sz of [1, -1]) { let prev = null; for (let i = 0; i <= 4; i++) { const x = -L / 2 + 0.4 + (L * 0.5) * i / 4; const a = H.at(x); const q = [x, a.ys + 0.6, sz * (a.hb - 0.08)]; gb.rod([x, a.ys, sz * (a.hb - 0.08)], q, 0.014, C.steel, 3, 3); if (prev) gb.rod(prev, q, 0.008, C.steel, 3, 3); prev = q; } } }
  }
  return gb.build();
}

// ------------------------------------------------------------------------------------------------------ material ----
// bob / roll / pitch around the instance origin, per-instance tint on the topsides, glass + chrome + lights by part code.
let MAT = null;
export function boatMaterial() {
  if (MAT) return MAT;
  MAT = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.0 }), 'boatBob', (s) => {
    s.uniforms.uTime = U.uTime; s.uniforms.uNight = U.uNight;
    const BOB = `
uniform float uTime; attribute float aK; attribute vec3 aTint; attribute float aCalm; varying float vK; varying vec3 vTint; varying float vLit;
mat3 bobR(){ vec2 io = vec2(instanceMatrix[3][0], instanceMatrix[3][2]); float ph = io.x * 0.37 + io.y * 0.23; float a = aCalm;
  float roll = a * (0.026 * sin(uTime * 1.07 + ph) + 0.011 * sin(uTime * 2.31 + ph * 1.7)); float pit = a * 0.011 * sin(uTime * 0.83 + ph * 1.3);
  float cr = cos(roll), sr = sin(roll), cp = cos(pit), sp = sin(pit);
  return mat3(cp, sp, 0.0, -sp, cp, 0.0, 0.0, 0.0, 1.0) * mat3(1.0, 0.0, 0.0, 0.0, cr, sr, 0.0, -sr, cr); }
float bobH(){ vec2 io = vec2(instanceMatrix[3][0], instanceMatrix[3][2]); float ph = io.x * 0.29 + io.y * 0.41; return aCalm * (0.045 * sin(uTime * 0.97 + ph) + 0.015 * sin(uTime * 1.9 + ph * 2.1)); }`;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + BOB)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = bobR() * objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed = bobR() * transformed + vec3(0.0, bobH(), 0.0); vK = aK; vTint = aTint;
  { vec2 io = vec2(instanceMatrix[3][0], instanceMatrix[3][2]); vLit = step(0.45, fract(sin(dot(io, vec2(12.9898, 78.233))) * 43758.5453)); }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vK; varying vec3 vTint; varying float vLit; float gK;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  gK = floor(vK + 0.5);
  if (gK > 0.5 && gK < 1.5) diffuseColor.rgb *= vTint;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  if (gK > 1.5 && gK < 2.5 || gK > 4.5) roughnessFactor = 0.06; else if (gK > 0.5 && gK < 1.5) roughnessFactor = 0.18; else if (gK > 2.5 && gK < 3.5) roughnessFactor = 0.22;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  if (gK > 2.5 && gK < 3.5) metalnessFactor = 0.9;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (gK > 3.5 && gK < 4.5) totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * (0.2 + uNight * 4.0);
  if (gK > 4.5) totalEmissiveRadiance += vec3(1.0, 0.74, 0.45) * uNight * vLit * 0.9;`);
  });
  return MAT;
}

// ------------------------------------------------------------------------------------------------------ fleet ----
// boats: [{ x, z, yaw, type, s (length scale), tint [r,g,b], calm (bob amplitude 0..1.5) }]. One InstancedMesh per type and LOD;
// near < NEAR m (casts shadows), far < FAR m, nothing beyond. Lists are rebuilt when the camera moves > 6 m.
export const NEAR = 260, FAR = 1700;
export function boatFleet(boats) {
  const F = { boats, meshes: [], last: [1e9, 1e9, 1e9], stats: { near: 0, far: 0 } };
  F.attach = (scene) => {
    const M = boatMaterial();
    for (let t = 0; t < TYPES.length; t++) {
      const n = boats.filter((b) => b.type === t).length; if (!n) { F.meshes.push(null); continue; }
      const pair = [0, 1].map((lod) => { const g = boatGeometry(t, lod);
        g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aCalm', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
        const m = new THREE.InstancedMesh(g, M, n); m.count = 0; m.castShadow = lod === 0; m.receiveShadow = true; m.frustumCulled = false; m.name = 'boats|' + TYPES[t].name + '|' + lod; m.userData.marina = true; scene.add(m); return m; });
      F.meshes.push(pair);
    }
    F.tris = F.meshes.reduce((s, p) => s + (p ? p[0].geometry.attributes.position.count / 3 : 0), 0);
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
  F.update = (cam, force = false) => {
    if (!F.meshes.length) return; const dx = cam.x - F.last[0], dy = cam.y - F.last[1], dz = cam.z - F.last[2]; if (!force && dx * dx + dy * dy + dz * dz < 36) return; F.last = [cam.x, cam.y, cam.z];
    const cnt = F.meshes.map(() => [0, 0]); let nn = 0, nf = 0;
    for (const b of boats) { const pair = F.meshes[b.type]; if (!pair) continue; const d = Math.hypot(b.x - cam.x, b.z - cam.z, Math.max(0, cam.y - 40) * 0.5); if (d > FAR) continue;
      const lod = d < NEAR ? 0 : 1; const m = pair[lod]; const i = cnt[b.type][lod]++; lod ? nf++ : nn++;
      _q.setFromAxisAngle(_y, b.yaw); m.setMatrixAt(i, _m.compose(_p.set(b.x, b.y ?? -1.0, b.z), _q, _s.set(b.s, b.s * (b.sy || 1), b.s * (b.sz || 1))));
      const ta = m.geometry.attributes.aTint, ca = m.geometry.attributes.aCalm; ta.setXYZ(i, b.tint[0], b.tint[1], b.tint[2]); ca.setX(i, b.calm ?? 1); }
    F.meshes.forEach((pair, t) => { if (!pair) return; for (const lod of [0, 1]) { const m = pair[lod]; m.count = cnt[t][lod]; m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aTint.needsUpdate = true; m.geometry.attributes.aCalm.needsUpdate = true; m.visible = m.count > 0; } });
    F.stats.near = nn; F.stats.far = nf;
  };
  return F;
}
