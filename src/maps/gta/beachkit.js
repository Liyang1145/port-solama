// a_beach (map 索拉纳港 only): beach close-up kit — original procedural models.
//  * Miami-style lifeguard towers: timber stilts + bracing, joisted plank deck with balustrade, lap-sided pastel hut with
//    trimmed windows / door / Bahama shutter, three roof types, back ramp with cleats + handrails, flagpole with warning
//    flags, ring buoys, rescue can, rescue board, rules board. 8 towers (the 4 district stands + 4 on the extended beach).
//  * Beach shower columns (stainless, twin heads, push valves, foot tap, slatted pallet pad).
//  * Dune sand fences (wired timber slats on posts) along the natural island ends; post-and-rope lines at the district
//    beach accesses.
// Everything uses the shared street-furniture PBR material (furnMat, program 'furn63'): no new shader program.
// Placement uses its own random stream (mulberry 7311) so the city's rng draws are untouched; new objects avoid the
// randomly placed umbrellas / palms already in city.deco / city.palms.
import * as THREE from 'three';
import { GeoBucket } from '../../geo.js';
import { mulberry } from '../../util.js';
import { furnMat, PB } from '../../streetkit.js';
import { beachOff } from './mapgeo.js';
import { buildBeachProps } from './beachprops.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MX = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(1, 1, 1));
const P = (g, m) => { g.applyMatrix4(m); return g; };
const BX = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.BoxGeometry(w, h, d), MX(x, y, z, rx, ry, rz));
const CY = (r0, r1, h, n, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.CylinderGeometry(r0, r1, h, n), MX(x, y, z, rx, ry, rz));
// box spanning two points (a beam / rail / brace), cross-section w x h
function beam(a, b, w, h) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const g = new THREE.BoxGeometry(w, len, h);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  return P(g, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1)));
}
function rod(a, b, r, n = 6) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const g = new THREE.CylinderGeometry(r, r, len, n, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  return P(g, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1)));
}
const PAINTW = [0.6, 0.0, 3]; // painted timber (satin, light grime; no metal chipping)
const GLOSSP = [0.32, 0.0, 3];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Miami pastel palettes: hut, trim, roof, flag set (sea conditions: 0 yellow, 1 green, 2 red, 3 yellow + purple)
const PALS = [
  { hut: [0.92, 0.42, 0.52], trim: [0.96, 0.95, 0.9], roof: [0.18, 0.62, 0.64], roofT: 0 },
  { hut: [0.16, 0.62, 0.66], trim: [0.97, 0.95, 0.9], roof: [0.98, 0.74, 0.25], roofT: 2 },
  { hut: [0.98, 0.76, 0.22], trim: [0.12, 0.42, 0.7], roof: [0.95, 0.94, 0.9], roofT: 1 },
  { hut: [0.58, 0.46, 0.8], trim: [0.98, 0.86, 0.3], roof: [0.95, 0.94, 0.9], roofT: 0 },
  { hut: [0.42, 0.8, 0.6], trim: [0.92, 0.38, 0.45], roof: [0.95, 0.94, 0.9], roofT: 2 },
  { hut: [0.97, 0.52, 0.25], trim: [0.96, 0.95, 0.9], roof: [0.2, 0.5, 0.78], roofT: 1 },
  { hut: [0.36, 0.62, 0.9], trim: [0.97, 0.55, 0.3], roof: [0.95, 0.94, 0.9], roofT: 0 },
  { hut: [0.9, 0.3, 0.3], trim: [0.96, 0.95, 0.9], roof: [0.98, 0.8, 0.35], roofT: 2 },
];
const FLAGC = [[0.98, 0.82, 0.08], [0.1, 0.62, 0.22], [0.86, 0.1, 0.08], [0.5, 0.18, 0.62]];

// ---------------------------------------------------------------- lifeguard tower ----
// local frame: +x = seaward, y = 0 at the sand under the tower centre. Returns part lists [geom, colour, pbr].
const DY = 2.15; // deck top
function lifeguardTower(pal, flags, r) {
  const L0 = [], L1 = [], PX = [];
  const wood = [0.56, 0.47, 0.37], woodD = [0.44, 0.36, 0.28], wh = pal.trim, hut = pal.hut;
  // stilts (6x6 timber) buried 0.5 m, girts + X bracing on every side
  const PXY = [[-1.45, -1.4], [1.45, -1.4], [1.45, 1.4], [-1.45, 1.4]];
  for (const [x, z] of PXY) { L0.push([BX(0.16, DY + 0.38, 0.16, x, (DY - 0.12 - 0.5) / 2 - 0.0, z), wood, PB.wood]); }
  for (let k = 0; k < 4; k++) { const [x0, z0] = PXY[k], [x1, z1] = PXY[(k + 1) % 4];
    L0.push([beam(V3(x0, 0.05, z0), V3(x1, DY - 0.45, z1), 0.05, 0.14), woodD, PB.wood]);
    L0.push([beam(V3(x1, 0.05, z1), V3(x0, DY - 0.45, z0), 0.05, 0.14), woodD, PB.wood]);
    L0.push([beam(V3(x0, 0.35, z0), V3(x1, 0.35, z1), 0.06, 0.16), woodD, PB.wood]); }
  // beams + joists under the deck
  for (const z of [-1.4, 1.4]) L0.push([BX(3.7, 0.24, 0.16, 0, DY - 0.32, z), woodD, PB.wood]);
  for (let x = -1.75; x <= 1.76; x += 0.44) L1.push([BX(0.05, 0.18, 3.3, x, DY - 0.2, 0), woodD, PB.wood]);
  // plank deck (planks run along z), rim boards painted trim colour
  for (let x = -1.8; x < 1.79; x += 0.15) L0.push([BX(0.135, 0.05, 3.5, x + 0.0675, DY - 0.025, 0), shade(wood, 0.92 + r() * 0.16), PB.wood]);
  for (const s of [-1, 1]) { L0.push([BX(3.62, 0.2, 0.04, 0, DY - 0.12, s * 1.77), wh, PAINTW]); L0.push([BX(0.04, 0.2, 3.58, s * 1.81, DY - 0.12, 0), wh, PAINTW]); }
  PX.push([BX(3.6, 0.3, 3.5, 0, DY - 0.15, 0), wood, PB.wood]);
  for (const [x, z] of PXY) PX.push([BX(0.2, DY, 0.2, x, DY / 2 - 0.15, z), wood, PB.wood]);
  // balustrade: seaward + both sides (landward side is the ramp landing)
  const rail = (a, b, open) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(len / 1.15));
    for (let k = 0; k <= n; k++) { const t = k / n; L0.push([BX(0.09, 1.08, 0.09, a[0] + (b[0] - a[0]) * t, DY + 0.54, a[1] + (b[1] - a[1]) * t), wh, PAINTW]); }
    L0.push([beam(V3(a[0], DY + 1.06, a[1]), V3(b[0], DY + 1.06, b[1]), 0.13, 0.05), wh, PAINTW]);
    L0.push([beam(V3(a[0], DY + 0.12, a[1]), V3(b[0], DY + 0.12, b[1]), 0.07, 0.07), wh, PAINTW]);
    const nb = Math.round(len / 0.13); for (let k = 1; k < nb; k++) { const t = k / nb; if (open && open(t)) continue; L0.push([BX(0.035, 0.9, 0.035, a[0] + (b[0] - a[0]) * t, DY + 0.6, a[1] + (b[1] - a[1]) * t), wh, PAINTW]); } };
  rail([1.75, -1.72], [1.75, 1.72]); rail([-1.75, -1.72], [1.75, -1.72]); rail([-1.75, 1.72], [1.75, 1.72]);
  PX.push([BX(0.1, 1.1, 3.4, 1.75, DY + 0.55, 0), wh, PAINTW]);
  // ---- hut: x [-1.45, 0.62], z [-1.15, 1.15], floor DY, walls 2.1 m, horizontal lap siding around openings
  const hx0 = -1.45, hx1 = 0.62, hz = 1.15, H = 2.1;
  L0.push([BX(hx1 - hx0 - 0.1, H - 0.05, 2 * hz - 0.1, (hx0 + hx1) / 2, DY + H / 2, 0), [0.1, 0.09, 0.085], PB.rubber]); // dark interior volume
  PX.push([BX(hx1 - hx0, H, 2 * hz, (hx0 + hx1) / 2, DY + H / 2, 0), hut, PAINTW]);
  const walls = [ // centre x,z, outward normal, width, openings [a0,a1,y0,y1] (a along local +X)
    { c: [hx1, 0], n: [1, 0], w: 2 * hz, op: [[-0.92, 0.92, 0.95, 1.85]] },
    { c: [(hx0 + hx1) / 2, hz], n: [0, 1], w: hx1 - hx0, op: [[0.02, 0.86, 1.0, 1.8]] },
    { c: [(hx0 + hx1) / 2, -hz], n: [0, -1], w: hx1 - hx0, op: [[-0.86, -0.02, 1.0, 1.8]] },
    { c: [hx0, 0], n: [-1, 0], w: 2 * hz, op: [[-0.42, 0.42, 0.0, 1.95]] },
  ];
  const sidingH = 0.15;
  for (const W of walls) {
    const ry = Math.atan2(W.n[0], W.n[1]); const M0 = new THREE.Matrix4().makeTranslation(W.c[0], DY, W.c[1]).multiply(new THREE.Matrix4().makeRotationY(ry));
    const put = (L, g, c, pb) => L.push([g.applyMatrix4(M0), c, pb]);
    for (let y = 0; y < H - 0.01; y += sidingH) {
      let segs = [[-W.w / 2, W.w / 2]];
      for (const o of W.op) if (y + sidingH > o[2] + 0.001 && y < o[3] - 0.001) { const ns = []; for (const [a, b] of segs) { if (o[1] <= a || o[0] >= b) { ns.push([a, b]); continue; } if (o[0] > a) ns.push([a, o[0]]); if (o[1] < b) ns.push([o[1], b]); } segs = ns; }
      const yy = Math.max(y, 0); const hh = Math.min(sidingH, H - y); const tone = 0.95 + 0.1 * r();
      for (const [a, b] of segs) if (b - a > 0.01) put(L0, P(new THREE.BoxGeometry(b - a, hh + 0.01, 0.04), MX((a + b) / 2, yy + hh / 2, 0.02, -0.09, 0, 0)), shade(hut, tone), PAINTW);
      // trim fill where the opening top/bottom is not on a siding line
    }
    // corner boards, skirt, frieze
    for (const s of [-1, 1]) put(L0, BX(0.12, H + 0.02, 0.07, s * (W.w / 2 - 0.02), H / 2, 0.05), wh, PAINTW);
    put(L0, BX(W.w + 0.04, 0.16, 0.08, 0, 0.08, 0.06), wh, PAINTW); put(L0, BX(W.w + 0.04, 0.2, 0.08, 0, H - 0.1, 0.06), wh, PAINTW);
    for (const o of W.op) {
      const [a0, a1, y0, y1] = o; const door = y0 < 0.05; const cx = (a0 + a1) / 2, cw = a1 - a0;
      // casing
      put(L0, BX(cw + 0.2, 0.1, 0.07, cx, y1 + 0.05, 0.06), wh, PAINTW);
      for (const a of [a0 - 0.05, a1 + 0.05]) put(L0, BX(0.1, y1 - y0, 0.07, a, (y0 + y1) / 2, 0.06), wh, PAINTW);
      if (door) { // door leaf + hardware
        put(L0, BX(cw, y1 - y0, 0.05, cx, (y0 + y1) / 2, 0.0), shade(wh, 0.93), PAINTW);
        for (const yy of [0.45, 1.35]) put(L1, BX(cw - 0.16, 0.5, 0.012, cx, yy, 0.03), shade(wh, 0.85), PAINTW); // raised panels
        put(L1, P(new THREE.SphereGeometry(0.035, 8, 5), MX(cx + cw / 2 - 0.1, 1.0, 0.06)), [0.75, 0.76, 0.78], PB.chrome);
        put(L1, BX(0.26, 0.18, 0.01, cx, 1.62, 0.035), [0.85, 0.15, 0.1], GLOSSP); // red cross plate
        put(L1, BX(0.05, 0.14, 0.012, cx, 1.62, 0.042), [0.97, 0.97, 0.95], GLOSSP); put(L1, BX(0.14, 0.05, 0.012, cx, 1.62, 0.042), [0.97, 0.97, 0.95], GLOSSP);
        put(L1, CY(0.06, 0.08, 0.1, 10, cx, y1 + 0.28, 0.08, Math.PI / 2), [0.15, 0.15, 0.14], PB.paint); // porch light
        put(L1, P(new THREE.SphereGeometry(0.055, 8, 5), MX(cx, y1 + 0.24, 0.14)), [0.95, 0.92, 0.82], PB.glass);
      } else {
        put(L0, BX(cw, y1 - y0, 0.02, cx, (y0 + y1) / 2, -0.01), [0.07, 0.12, 0.15], PB.glass);
        put(L0, BX(cw + 0.24, 0.06, 0.16, cx, y0 - 0.03, 0.08), wh, PAINTW); // sill
        const nm = cw > 1.2 ? 2 : 1; for (let k = 1; k <= nm; k++) put(L1, BX(0.05, y1 - y0, 0.05, a0 + cw * k / (nm + 1), (y0 + y1) / 2, 0.01), wh, PAINTW);
        put(L1, BX(cw, 0.04, 0.05, cx, (y0 + y1) / 2 + 0.08, 0.01), wh, PAINTW);
        if (W.n[0] > 0) { // Bahama shutter propped open over the sea window
          const sh = new THREE.Matrix4().makeTranslation(0, y1 + 0.1, 0.06).multiply(new THREE.Matrix4().makeRotationX(-0.62)).multiply(new THREE.Matrix4().makeTranslation(cx, -(y1 - y0 + 0.2) / 2, 0.04));
          put(L0, P(new THREE.BoxGeometry(cw + 0.2, y1 - y0 + 0.2, 0.05), sh), shade(pal.trim, 0.97), PAINTW);
          for (let k = 0; k < 7; k++) put(L1, P(new THREE.BoxGeometry(cw + 0.1, 0.05, 0.03), sh.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.42 + k * 0.14, 0.035))), shade(pal.trim, 0.8), PAINTW);
          for (const a of [a0 + 0.1, a1 - 0.1]) put(L1, beam(V3(a, y0 + 0.12, 0.08), V3(a, y0 + 0.2, 0.62), 0.025, 0.025), [0.6, 0.6, 0.6], PB.galv);
        }
      }
    }
    // rescue can + strap on the north wall, tower number plate on the south wall
    if (W.n[1] > 0) { put(L0, P(new THREE.CapsuleGeometry(0.11, 0.6, 3, 10), MX(-0.55, 1.05, 0.2)), [0.95, 0.25, 0.08], GLOSSP); put(L1, rod(V3(-0.55, 1.45, 0.2), V3(-0.55, 1.75, 0.05), 0.012), [0.1, 0.1, 0.1], PB.rubber); put(L1, BX(0.06, 0.06, 0.08, -0.55, 1.75, 0.03), [0.6, 0.6, 0.6], PB.galv); }
    if (W.n[1] < 0) { put(L1, BX(0.5, 0.5, 0.02, 0.45, 1.45, 0.06), [0.97, 0.97, 0.94], GLOSSP); put(L1, P(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16), MX(0.45, 1.45, 0.075, Math.PI / 2)), pal.trim[0] > 0.9 && pal.trim[2] > 0.85 ? [0.1, 0.2, 0.35] : pal.trim, GLOSSP); }
  }
  // ---- roof
  const ry0 = DY + H, rc = [(hx0 + hx1) / 2, 0];
  if (pal.roofT === 0) { // hip roof with deep overhang + fascia
    const g = new THREE.ConeGeometry(2.25, 1.05, 4, 1); g.rotateY(Math.PI / 4); g.scale(1.0, 1, 1.05); L0.push([P(g, MX(rc[0], ry0 + 0.6, 0)), pal.roof, PAINTW]);
    const s = 2.25 * Math.SQRT1_2; for (const [w, d, x, z] of [[2 * s, 0.05, 0, s * 1.05], [2 * s, 0.05, 0, -s * 1.05], [0.05, 2 * s * 1.05, s, 0], [0.05, 2 * s * 1.05, -s, 0]]) L0.push([BX(w + 0.02, 0.16, d + 0.02, rc[0] + x, ry0 + 0.03, z), wh, PAINTW]);
    L0.push([BX(2 * s, 0.04, 2 * s * 1.05, rc[0], ry0 + 0.06, 0), shade(wh, 0.8), PAINTW]); // soffit
    PX.push([P(new THREE.ConeGeometry(2.25, 1.05, 4, 1).rotateY(Math.PI / 4), MX(rc[0], ry0 + 0.6, 0)), pal.roof, PAINTW]);
  } else if (pal.roofT === 1) { // mono-pitch roof rising to the sea, exposed rafter tails
    const tilt = 0.2; L0.push([BX(3.05, 0.1, 3.1, rc[0] + 0.15, ry0 + 0.33, 0, 0, 0, tilt), pal.roof, PAINTW]);
    L0.push([BX(0.06, 0.2, 3.14, rc[0] + 0.15 + 1.52 * Math.cos(tilt), ry0 + 0.33 + 1.52 * Math.sin(tilt) - 0.03, 0), wh, PAINTW]);
    L0.push([BX(0.06, 0.2, 3.14, rc[0] + 0.15 - 1.52 * Math.cos(tilt), ry0 + 0.33 - 1.52 * Math.sin(tilt) - 0.03, 0), wh, PAINTW]);
    for (let z = -1.4; z <= 1.41; z += 0.4) L1.push([BX(3.0, 0.1, 0.06, rc[0] + 0.15, ry0 + 0.22, z, 0, 0, tilt), shade(wh, 0.9), PAINTW]);
    for (const s of [-1, 1]) { const g = new THREE.BufferGeometry(); const x0 = hx0 - 0.02, x1 = hx1 + 0.02, yb = ry0; const t0 = Math.tan(tilt);
      const y0 = ry0 + 0.27 + (x0 - rc[0] - 0.15) * t0, y1 = ry0 + 0.27 + (x1 - rc[0] - 0.15) * t0; const zz = s * (hz + 0.03);
      const p = s > 0 ? [x0, yb, zz, x1, yb, zz, x1, y1, zz, x0, yb, zz, x1, y1, zz, x0, y0, zz] : [x0, yb, zz, x1, y1, zz, x1, yb, zz, x0, yb, zz, x0, y0, zz, x1, y1, zz];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); L0.push([g, hut, PAINTW]); } // gable infill
    PX.push([BX(3.05, 0.25, 3.1, rc[0] + 0.15, ry0 + 0.3, 0, 0, 0, tilt), pal.roof, PAINTW]);
  } else { // barrel roof with end bands
    const g = new THREE.CylinderGeometry(1.55, 1.55, 3.05, 14, 1, false, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.scale(1, 0.45, 1); L0.push([P(g, MX(rc[0], ry0 + 0.02, 0)), pal.roof, PAINTW]);
    for (const z of [-1.5, 1.5]) { const b = new THREE.TorusGeometry(1.55, 0.05, 4, 14, Math.PI); b.scale(1, 0.45, 1); L0.push([P(b, MX(rc[0], ry0 + 0.02, z)), wh, PAINTW]); }
    PX.push([P(new THREE.CylinderGeometry(1.55, 1.55, 3.05, 6, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.45, 1), MX(rc[0], ry0 + 0.02, 0)), pal.roof, PAINTW]);
  }
  // ---- flagpole (seaward corner) + flags
  const fx = 1.5, fz = -1.48, ftop = DY + 4.4;
  L0.push([CY(0.03, 0.04, ftop - DY + 0.4, 8, fx, (ftop + DY - 0.4) / 2, fz), [0.88, 0.88, 0.86], PB.galv]);
  L1.push([P(new THREE.SphereGeometry(0.06, 8, 5), MX(fx, ftop + 0.04, fz)), [0.85, 0.7, 0.3], PB.chrome]);
  for (const yy of [DY + 0.5, DY + 0.95]) L1.push([BX(0.05, 0.05, 0.12, fx, yy, fz - 0.06), [0.7, 0.7, 0.7], PB.galv]);
  L1.push([rod(V3(fx, ftop, fz - 0.045), V3(fx, DY + 0.95, fz - 0.045), 0.006, 4), [0.92, 0.92, 0.9], PB.rubber]);
  flags.forEach((fc, i) => { const g = new THREE.BoxGeometry(0.02, 0.5, 0.82, 1, 1, 8); const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) { const z = pp.getZ(k) + 0.41; pp.setX(k, pp.getX(k) + Math.sin(z * 4.5 + i) * 0.07 * z); pp.setY(k, pp.getY(k) - z * 0.06); }
    g.computeVertexNormals(); L0.push([P(g, MX(fx, ftop - 0.35 - i * 0.6, fz - 0.45, 0, 0.25, 0)), FLAGC[fc], GLOSSP]); });
  PX.push([CY(0.05, 0.05, 4.4, 4, fx, DY + 2.2, fz), [0.88, 0.88, 0.86], PB.galv]);
  // ---- ring buoys on the seaward rail posts, outside face
  for (const z of [-0.88, 0.88]) {
    const m = MX(1.83, DY + 0.55, z, 0, Math.PI / 2, 0);
    L0.push([P(new THREE.TorusGeometry(0.29, 0.06, 7, 18), m), [0.97, 0.38, 0.06], GLOSSP]);
    for (let k = 0; k < 4; k++) L0.push([P(new THREE.TorusGeometry(0.29, 0.064, 7, 3, 0.26), m.clone().multiply(new THREE.Matrix4().makeRotationZ(k * Math.PI / 2 + Math.PI / 4 - 0.13))), [0.97, 0.96, 0.94], GLOSSP]);
    L1.push([P(new THREE.TorusGeometry(0.255, 0.008, 3, 18), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.0))), [0.9, 0.88, 0.82], PB.rubber]); // grab line
    L1.push([BX(0.08, 0.08, 0.05, 1.82, DY + 0.86, z), [0.6, 0.6, 0.6], PB.galv]); // hook
  }
  // rules board on the seaward rail centre (faux text lines)
  L0.push([BX(0.04, 0.5, 0.95, 1.86, DY + 0.62, 0), [0.97, 0.97, 0.94], GLOSSP]); L0.push([BX(0.045, 0.08, 0.95, 1.865, DY + 0.82, 0), [0.86, 0.12, 0.1], GLOSSP]);
  for (let k = 0; k < 4; k++) L1.push([BX(0.01, 0.025, 0.5 + 0.3 * r(), 1.885, DY + 0.68 - k * 0.07, -0.08), [0.15, 0.15, 0.17], GLOSSP]);
  // rescue board leaning on the north-east stilt, binocular post on the balcony
  { const g = new THREE.SphereGeometry(1, 14, 6); g.scale(0.27, 0.045, 1.45); const m = MX(1.45, 1.15, 1.72, -1.18, 0, 0); L0.push([P(g, m), [0.98, 0.84, 0.15], GLOSSP]);
    const s2 = new THREE.SphereGeometry(1, 14, 6); s2.scale(0.08, 0.048, 1.38); L1.push([P(s2, m), [0.86, 0.12, 0.1], GLOSSP]); }
  L1.push([CY(0.03, 0.03, 1.1, 6, 1.25, DY + 0.55, 0.55), [0.3, 0.3, 0.3], PB.paint]);
  L1.push([BX(0.12, 0.08, 0.18, 1.25, DY + 1.15, 0.55, 0, 0.3, 0), [0.08, 0.08, 0.09], PB.rubber]);
  // ---- ramp to the back door (landward, -x): stringers, cleated planks, handrails
  const rx0 = -1.8, rlen = 5.3, rdrop = DY + 0.1, rw = 1.0; const ang = Math.atan2(rdrop, rlen); const hyp = Math.hypot(rdrop, rlen);
  const at = (t, z, dy = 0) => V3(rx0 - rlen * t, DY - rdrop * t + dy, z);
  for (const z of [-rw / 2, rw / 2]) L0.push([beam(at(0, z, -0.18), at(1, z, -0.18), 0.06, 0.26), woodD, PB.wood]);
  const np = Math.round(hyp / 0.16); for (let k = 0; k < np; k++) { const t = (k + 0.5) / np; const p = at(t, 0, -0.02); L0.push([BX(0.14, 0.04, rw + 0.08, p.x, p.y, 0, 0, 0, ang), shade(wood, 0.9 + r() * 0.18), PB.wood]); }
  for (let k = 1; k < 13; k++) { const p = at(k / 13, 0, 0.02); L1.push([BX(0.04, 0.03, rw - 0.1, p.x, p.y, 0, 0, 0, ang), woodD, PB.wood]); }
  for (const z of [-rw / 2 - 0.04, rw / 2 + 0.04]) { for (let k = 0; k <= 4; k++) { const p = at(k / 4, z); L0.push([BX(0.08, 1.05, 0.08, p.x, p.y + 0.45, z), wh, PAINTW]); }
    L0.push([beam(at(0, z, 0.98), at(1, z, 0.98), 0.07, 0.06), wh, PAINTW]); L0.push([beam(at(0, z, 0.5), at(1, z, 0.5), 0.05, 0.05), wh, PAINTW]); }
  { const p = at(0.5, 0); for (const z of [-rw / 2, rw / 2]) L0.push([BX(0.14, p.y + 0.5, 0.14, p.x, (p.y - 0.5) / 2, z), wood, PB.wood]); }
  PX.push([BX(hyp, 0.12, rw, (rx0 + rx0 - rlen) / 2, DY / 2 - 0.05, 0, 0, 0, ang), wood, PB.wood]);
  return { L0, L1, PX };
}

// ---------------------------------------------------------------- beach shower ----
function beachShower(post) {
  const L0 = [], L1 = [];
  const st = [0.76, 0.78, 0.8], w = [0.58, 0.48, 0.38];
  for (let k = 0; k < 9; k++) L0.push([BX(0.15, 0.05, 1.5, -0.68 + k * 0.17, 0.07, 0), shade(w, 0.9 + (k % 3) * 0.06), PB.wood]); // slatted pallet
  for (const z of [-0.6, 0, 0.6]) L0.push([BX(1.5, 0.06, 0.1, 0, 0.02, z), shade(w, 0.75), PB.wood]);
  L0.push([BX(0.24, 0.04, 0.24, 0, 0.11, 0), [0.4, 0.4, 0.42], PB.iron]); // base flange
  L0.push([CY(0.075, 0.085, 2.45, 12, 0, 1.3, 0), post, post === st ? PB.chrome : PB.paint]);
  L0.push([CY(0.085, 0.075, 0.1, 12, 0, 2.55, 0), post, PB.paint]);
  for (const s of [-1, 1]) { L0.push([beam(V3(0, 2.45, 0), V3(0, 2.45, s * 0.55), 0.035, 0.035), st, PB.chrome]);
    L0.push([CY(0.03, 0.1, 0.09, 12, 0, 2.38, s * 0.55), st, PB.chrome]);
    L1.push([CY(0.025, 0.025, 0.08, 8, 0, 1.25, s * 0.09, Math.PI / 2), st, PB.chrome]); L1.push([CY(0.032, 0.032, 0.03, 10, 0, 1.25, s * 0.14, Math.PI / 2), [0.15, 0.4, 0.75], GLOSSP]); }
  L0.push([beam(V3(0, 0.45, 0), V3(0.22, 0.45, 0), 0.03, 0.03), st, PB.chrome]); L0.push([CY(0.018, 0.018, 0.08, 8, 0.22, 0.41, 0), st, PB.chrome]); // foot tap
  L1.push([BX(0.012, 0.22, 0.16, 0.08, 1.65, 0), [0.97, 0.97, 0.94], GLOSSP]); L1.push([BX(0.014, 0.05, 0.16, 0.081, 1.73, 0), [0.15, 0.45, 0.75], GLOSSP]);
  L1.push([BX(0.22, 0.01, 0.22, 0.45, 0.1, 0.35), [0.25, 0.25, 0.26], PB.iron]); // drain grate
  return { L0, L1 };
}

// ---------------------------------------------------------------- fences ----
// wired slat dune fence along a polyline (posts every ~2.4 m); near detail + far strip
function slatFence(near, far, pts, r) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const dx = b[0] - a[0], dz = b[2] - a[2]; const len = Math.hypot(dx, dz); const ux = dx / len, uz = dz / len;
    const ry = Math.atan2(-uz, ux); const lean = (r() - 0.5) * 0.12;
    near.push([CY(0.055, 0.06, 1.45, 6, a[0], a[1] + 0.47, a[2], 0, 0, lean), [0.46, 0.4, 0.33], PB.wood]);
    far.push([BX(0.1, 1.3, 0.1, a[0], a[1] + 0.45, a[2]), [0.46, 0.4, 0.33], PB.wood]);
    const n = Math.floor(len / 0.085);
    for (let k = 0; k < n; k++) { if (r() < 0.07) continue; const t = (k + 0.5) / n; const x = a[0] + dx * t, z = a[2] + dz * t, y = a[1] + (b[1] - a[1]) * t;
      const h = 1.02 + (r() - 0.5) * 0.08, bury = r() * 0.22 + 0.05 * Math.sin(t * 9.0 + i);
      const c = 0.52 + r() * 0.14; near.push([BX(0.038, h, 0.012, x, y + h / 2 - bury - 0.05, z, (r() - 0.5) * 0.06, ry, lean * 0.7 + (r() - 0.5) * 0.05), [c * 1.04, c * 0.93, c * 0.8], PB.wood]); }
    for (const yy of [0.12, 0.82]) near.push([rod(V3(a[0], a[1] + yy, a[2]), V3(b[0], b[1] + yy, b[2]), 0.008, 3), [0.35, 0.34, 0.32], PB.galv]);
    // far: double-sided strip
    for (const s of [1, -1]) { const g = new THREE.BufferGeometry(); const y0 = 0.0, y1 = 0.85;
      const p = [a[0], a[1] + y0, a[2], b[0], b[1] + y0, b[2], b[0], b[1] + y1, b[2], a[0], a[1] + y0, a[2], b[0], b[1] + y1, b[2], a[0], a[1] + y1, a[2]];
      if (s < 0) for (let q = 0; q < 6; q += 3) { /* flip winding */ }
      const pp = s > 0 ? p : [...p.slice(0, 3), ...p.slice(6, 9), ...p.slice(3, 6), ...p.slice(9, 12), ...p.slice(15, 18), ...p.slice(12, 15)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.computeVertexNormals(); far.push([g, [0.5, 0.44, 0.36], PB.wood]); }
  }
  const e = pts[pts.length - 1]; near.push([CY(0.055, 0.06, 1.45, 6, e[0], e[1] + 0.47, e[2]), [0.46, 0.4, 0.33], PB.wood]);
}
function ropeFence(L, pts) {
  for (let i = 0; i < pts.length; i++) { const a = pts[i]; L.push([BX(0.1, 1.0, 0.1, a[0], a[1] + 0.3, a[2]), [0.5, 0.42, 0.33], PB.wood]); L.push([CY(0.0, 0.07, 0.06, 4, a[0], a[1] + 0.83, a[2], 0, Math.PI / 4), [0.5, 0.42, 0.33], PB.wood]);
    if (i === pts.length - 1) break; const b = pts[i + 1]; let prev = V3(a[0], a[1] + 0.68, a[2]);
    for (let k = 1; k <= 4; k++) { const t = k / 4; const sag = Math.sin(t * Math.PI) * 0.13; const q = V3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 0.68 - sag, a[2] + (b[2] - a[2]) * t); L.push([rod(prev, q, 0.016, 5), [0.82, 0.74, 0.58], PB.rubber]); prev = q; } }
}

// ---------------------------------------------------------------- build ----
function flush(parts, m) { const b = new GeoBucket({ aPbr: 3 }); for (const [g, c, pb] of parts) { if (!g.attributes.position || !g.attributes.position.count) continue; b.geom(g, m, { aPbr: pb }, c); } return b; }

export function buildBeachKit(scene, city) {
  const out = {}; const r = mulberry(7311); const mat = furnMat(); const groups = []; const stats = { towers: 0, showers: 0, fenceM: 0, tri: { towerL0: 0, towerL1: 0, towerPX: 0, fenceNear: 0, fenceFar: 0, other: 0 } };
  const umb = city.deco.umbrellas || [], palms = city.palms || [];
  const clearOf = (x, z, x0, x1, z0, z1, rUmb, rPalm) => { for (const u of umb) if (u.x > x + x0 - rUmb && u.x < x + x1 + rUmb && u.z > z + z0 - rUmb && u.z < z + z1 + rUmb) return false;
    for (const p of palms) if (p.x > x + x0 - rPalm && p.x < x + x1 + rPalm && p.z > z + z0 - rPalm && p.z < z + z1 + rPalm) return false; return true; };
  const tri = (b) => b.idx.length / 3;
  const mk = (b, shadow) => { const m = new THREE.Mesh(b.build(), mat); m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m; };
  const slope = (z) => (beachOff(z + 1) - beachOff(z - 1)) / 2;
  // ---- lifeguard towers: the 4 district stands (city.deco.lifeguards positions) + 4 on the extended beach
  const spots = city.deco.lifeguards.map((l) => ({ x: l.x, z: l.z }));
  for (const z of [-830, -560, 560, 830]) spots.push({ x: 392 + beachOff(z), z });
  const towers = [];
  spots.forEach((s, i) => {
    let z = s.z, ok = false; // slide along the shore until the tower + ramp footprint is clear of umbrellas
    for (let k = 0; k < 24 && !ok; k++) { const zz = s.z + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5; const xx = s.x + (beachOff(zz) - beachOff(s.z));
      if (Math.abs(Math.abs(zz) - 378) < 9 || (zz > 340 && zz < 366)) continue; if (clearOf(xx, zz, -8.2, 2.4, -2.6, 2.6, 1.3, 1.5)) { z = zz; s.x = xx; ok = true; } }
    s.z = z; const phi = Math.atan(slope(z)); const y0 = city.groundH(s.x, z);
    const m = new THREE.Matrix4().makeTranslation(s.x, y0, z).multiply(new THREE.Matrix4().makeRotationY(phi));
    const pal = PALS[i % PALS.length]; const fset = [[0], [0, 3], [1], [0], [2, 2], [0], [1], [0, 3]][i % 8];
    const T = lifeguardTower(pal, fset, r);
    const b0 = flush(T.L0, m), b1 = flush(T.L1, m), bp = flush(T.PX, m);
    stats.tri.towerL0 += tri(b0); stats.tri.towerL1 += tri(b1); stats.tri.towerPX += tri(bp);
    const g = { x: s.x, z, lv: [mk(b0, true), mk(b1, false), mk(bp, false)], d: [[0, 900], [0, 140], [900, 3000]] }; groups.push(g); towers.push({ x: s.x, z, y0, phi });
    // collision: hut/stilt footprint + ramp (oriented to the shore)
    const ux = Math.cos(phi), uz = -Math.sin(phi);
    city.col.addOBB(s.x, z, ux, uz, 1.85, 1.8, y0 + 5.6, 'lifeguard');
    city.col.addOBB(s.x - ux * 4.45, z - uz * 4.45, ux, uz, 2.65, 0.6, y0 + 1.2, 'lifeguard');
    stats.towers++;
  });
  // ---- showers: foot of every district beach access + one beside each extended-beach tower
  const near = [], misc = [], showers = [];
  const showerAt = (x, z) => { for (let k = 0; k < 10; k++) { const zz = z + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.6; if (clearOf(x, zz, -1.2, 1.2, -1.2, 1.2, 1.0, 1.2)) { z = zz; break; } }
    const y0 = city.groundH(x, z); const m = new THREE.Matrix4().makeTranslation(x, y0, z); const S = beachShower(r() < 0.5 ? [0.76, 0.78, 0.8] : [0.16, 0.5, 0.55]);
    for (const p of S.L0) misc.push([p[0].applyMatrix4(m), p[1], p[2]]); for (const p of S.L1) near.push([p[0].applyMatrix4(m), p[1], p[2]]);
    city.col.add(x - 0.15, z - 0.15, x + 0.15, z + 0.15, y0 + 2.6, 'shower'); stats.showers++; showers.push([x, z]); };
  const access = city.blocks.filter((b) => b.area === 'promenade').map((b) => ({ x: b.x1, z: (b.z0 + b.z1) / 2 + 22 }));
  for (const a of access) { showerAt(a.x + 9.0, a.z + 4.2);
    // post-and-rope lines guiding the access path from the stair foot toward the water
    for (const s of [-1, 1]) { const pts = []; for (let x = a.x + 6.0; x <= a.x + 15.1; x += 2.3) pts.push([x, city.groundH(x, a.z + s * 1.9), a.z + s * 1.9]); ropeFence(misc, pts); } }
  for (const t of towers.slice(4)) showerAt(t.x - 15.5, t.z + 6.5);
  // ---- dune sand fences: natural island ends, x = 346 + beachOff(z), segments with gaps.
  // a_beach2: designated walk-through openings (beach-access paths every ~100 m, the dune boardwalk end, each extended-beach
  // lifeguard tower + its shower) are cut out of the fence and framed by two taller end posts; the old random gaps remain.
  const rA = mulberry(7312); const openings = [];
  const OP = { '1': [], '-1': [] };
  for (const sg of [-1, 1]) { const L = OP[sg];
    for (const t of towers.slice(4)) if (Math.sign(t.z) === sg) L.push({ c: Math.abs(t.z), hw: 12.5, kind: 'tower' }); // hut + ramp + shower (t.z+6.5)
    if (sg > 0) L.push({ c: 588, hw: 2.2, kind: 'boardwalk' }); // the dune boardwalk ends at z~588
    for (let a = 452 + rA() * 18; a < 1365; a += 86 + rA() * 24) if (!L.some((o) => Math.abs(o.c - a) < o.hw + 18)) L.push({ c: a, hw: 1.9, kind: 'path' });
    L.sort((p, q) => p.c - q.c);
    for (const o of L) { const z = sg * o.c; openings.push({ sg, z, hw: o.hw, kind: o.kind, x: 346 + beachOff(z) }); } }
  const CH = 160; const chunks = new Map(); const endPosts = [];
  const endPost = (c, x, z) => { const y = city.groundH(x, z) - 0.02;
    c.near.push([CY(0.075, 0.085, 1.95, 8, x, y + 0.62, z), [0.5, 0.43, 0.35], PB.wood]); c.near.push([CY(0.0, 0.1, 0.12, 8, x, y + 1.65, z), [0.5, 0.43, 0.35], PB.wood]);
    c.near.push([CY(0.079, 0.079, 0.14, 8, x, y + 1.38, z), [0.95, 0.45, 0.12], PAINTW]); c.near.push([CY(0.079, 0.079, 0.06, 8, x, y + 1.22, z), [0.96, 0.95, 0.9], PAINTW]); // marker bands
    c.far.push([BX(0.14, 1.75, 0.14, x, y + 0.85, z), [0.5, 0.43, 0.35], PB.wood]);
    city.col.add(x - 0.1, z - 0.1, x + 0.1, z + 0.1, y + 1.6, 'fence'); endPosts.push([x, z]); };
  for (const sg of [-1, 1]) {
    const L = OP[sg]; let a = 412 + r() * 10, fromOpen = false;
    while (a < 1385) { const len = 14 + r() * 22; let a1 = Math.min(a + len, 1390), next = a1 + 4 + r() * 9, toOpen = false;
      const o = L.find((o) => o.c + o.hw > a + 0.01 && o.c - o.hw < a1);
      if (o) { if (o.c - o.hw < a + 2.5) { a = o.c + o.hw; fromOpen = true; continue; } a1 = o.c - o.hw; next = o.c + o.hw; toOpen = true; }
      const n = Math.max(1, Math.round((a1 - a) / 2.4)); const pts = [];
      const wob = r() * 6.28; for (let k = 0; k <= n; k++) { const q = a + (a1 - a) * k / n; const z = sg * q; const x = 346 + beachOff(z) + Math.sin(q * 0.05 + wob) * 1.6; pts.push([x, city.groundH(x, z) - 0.02, z]); }
      // skip a segment that would cross a palm / umbrella / new tower or shower
      let blocked = false; for (const p of pts) { if (!clearOf(p[0], p[2], -0.6, 0.6, -0.6, 0.6, 0.9, 1.0)) { blocked = true; break; } for (const t of towers) if (Math.hypot(p[0] - t.x, p[2] - t.z) < 12) blocked = true; }
      if (pts.length > 1 && !blocked) { const key = Math.round(sg * (a + a1) / 2 / CH); let c = chunks.get(key); if (!c) chunks.set(key, c = { near: [], far: [], z: 0, n: 0, x: 0 });
        slatFence(c.near, c.far, pts, r);
        if (fromOpen) endPost(c, pts[0][0], pts[0][2]); if (toOpen) endPost(c, pts[pts.length - 1][0], pts[pts.length - 1][2]);
        for (let q = 0; q < pts.length - 1; q++) { const A = pts[q], B = pts[q + 1]; const l = Math.hypot(B[0] - A[0], B[2] - A[2]); city.col.addOBB((A[0] + B[0]) / 2, (A[2] + B[2]) / 2, (B[0] - A[0]) / l, (B[2] - A[2]) / l, l / 2, 0.08, A[1] + 1.0, 'fence'); } c.z += pts[0][2]; c.x += pts[0][0]; c.n++; stats.fenceM += Math.hypot(pts[n][0] - pts[0][0], pts[n][2] - pts[0][2]); }
      a = next; fromOpen = toOpen; }
  }
  out.openings = openings; out.endPosts = endPosts;
  for (const c of chunks.values()) { const I = new THREE.Matrix4(); const bn = flush(c.near, I), bf = flush(c.far, I); stats.tri.fenceNear += tri(bn); stats.tri.fenceFar += tri(bf);
    groups.push({ x: c.x / c.n, z: c.z / c.n, lv: [mk(bn, true), mk(bf, false)], d: [[0, 170 + CH / 2], [170 + CH / 2, 1600]] }); }
  { const I = new THREE.Matrix4(); const bm = flush(misc, I); stats.tri.other += tri(bm); const bn = flush(near, I); stats.tri.other += tri(bn);
    // misc pieces are spread along the whole district beach: split showers/rope lines by z band so they cull
    const m1 = mk(bm, true); const m2 = mk(bn, false); groups.push({ x: 345, z: 0, lv: [m2], d: [[0, 0]], nearList: true }); out.miscNear = m2; out.misc = m1; }
  // near-detail meshes of the shower/rope set are only shown on the district beach (camera within 520 m of it)
  // a_beach2: umbrellas / loungers / towels / surf racks / bins / drink carts (instanced, streamed)
  const props = buildBeachProps(scene, city, { openings, towers, showers }); out.props = props;
  function update(cam) {
    props.update(cam);
    const cx = cam.position.x, cz = cam.position.z;
    for (const g of groups) { if (g.nearList) { g.lv[0].visible = cx > 200 && Math.abs(cz) < 520; continue; }
      const d = Math.hypot(g.x - cx, g.z - cz); for (let i = 0; i < g.lv.length; i++) g.lv[i].visible = d >= g.d[i][0] && d < g.d[i][1]; }
  }
  out.update = update; out.stats = stats; out.towers = towers; out.showers = showers; city.beachKit = out; // (tests / tools)
  return out;
}
