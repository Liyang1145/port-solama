// r6.4 霓港 elevated light-rail (霓港轻轨 环湾线), Hark modelling lane b_street2 (2026-11-21). An original concrete viaduct that runs
// over 零点大道 from the west end of the downtown grid, swings south at the 霓滨大道 junction and follows the bay boulevard down
// towards the cargo port. Portal bents (two octagonal columns at the kerb + a cross-head over the carriageway) carry a U-trough
// double-track girder at ~10 m, so the street underneath stays drivable.
//  * BASE (built once, always on, InstancedMesh): girder chords, column legs, cross-heads; one procedural concrete shader
//    (world-space formwork lines, rain streaks, soot under the deck, splash-zone grime) – cheap enough to stay visible as its own
//    far LOD. A parked 4-car train sits on the westbound track (merged, ~5 k tris).
//  * NEAR (per span, built within NEAR_R of the camera, freed beyond FREE_R): slab track + rails + sleeper blocks, catenary masts /
//    cantilevers / wires, cable troughs, LED edge strips, soffit lamps with night light cones, drip puddles, column downpipes,
//    hazard bands and paper ads on the columns, line-name boards on the girder, and a few night-market stall clusters on the
//    pavement between the legs (street2.js stalls). Small parts in 'vcolD' (detail radius).
// Planning (route, pier positions) is pure and runs in buildCity so palms / skyways / street cables near the line can be dropped
// and the columns get colliders.
import * as THREE from 'three';
import { World, polyCap } from '../../geo.js';
import { mulberry, withSeed, rng, rand, randi, pick } from '../../util.js';
import { ROADS, catmull } from './mapdata.js';
import { kg, beam, tube, put, cable, NEONC, DARK, STEEL } from './kit.js';
import { cnFace, SG, STALLS } from './street2.js';
import { U } from '../../env.js';

export const VIA = { soffit: 10.2, floor: 10.75, top: 11.95, hw: 4.9, colOff: 7.75, colR: 0.56, track: 2.0, gauge: 0.72, wire: 15.9 };
// b_neon_sign: near build radius 330 → 250 m (≈ −40 % near-layer triangles in view); free radius 460 → 380 m. What reads from far
// away at night (LED edge strips) and from far away by day (light coping on the parapets) moved into the always-on base so the
// line does not change silhouette / lose its light strips when spans come and go at 250 m.
const NEAR_R = 250, FREE_R = 380, DETAIL_R = 230;

// ----------------------------------------------------------------------- planning ----
function polyLen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
function polyAt(P, s) { for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (s <= l || i === P.length - 1) { const t = Math.min(1, s / (l || 1)); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t, i]; } s -= l; } return P[P.length - 1]; }
export function viaductRoute(graph, lamps = [], parcels = []) {
  const dt = ROADS.find((r) => r.id === 'dt_sun'), bb = ROADS.find((r) => r.id === 'bay_blvd'); if (!dt || !bb) return null;
  const J = dt.pts[0];
  // west leg: from x = -2190 on 零点大道 east to the junction
  const w0 = dt.pts[2], w1 = dt.pts[1]; const t0 = (-2190 - w0[0]) / (w1[0] - w0[0]); const A = [[-2190, w0[1] + (w1[1] - w0[1]) * t0], w1.slice(), J.slice()];
  // south leg: 霓滨大道 (smoothed like the road ribbon) from the junction down to z = -1000
  const bs = catmull(bb.pts, 8); let k0 = 0, bd = 1e9; bs.forEach((p, i) => { const d = Math.hypot(p[0] - J[0], p[1] - J[1]); if (d < bd) { bd = d; k0 = i; } });
  const B = [J.slice()]; for (let i = k0 + 1; i < bs.length; i++) { const p = bs[i]; if (p[1] < -1000) { const q = bs[i - 1]; const t = (-1000 - q[1]) / (p[1] - q[1]); B.push([q[0] + (p[0] - q[0]) * t, -1000]); break; } B.push(p); }
  // fillet the corner with a quadratic Bézier through the junction (T m back along both legs)
  const T = 30; const LA = polyLen(A); const pa = polyAt(A, LA - T), pb = polyAt(B, T);
  const P = A.slice(0, pa[2]).concat([[pa[0], pa[1]]]);
  for (let i = 1; i < 24; i++) { const t = i / 24, u = 1 - t; P.push([u * u * pa[0] + 2 * u * t * J[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * J[1] + t * t * pb[1]]); }
  P.push([pb[0], pb[1]]); for (let i = pb[2]; i < B.length; i++) P.push(B[i]);
  // resample every 2 m with tangents / left normals
  const L = polyLen(P); const n = Math.ceil(L / 2); const S = [];
  for (let i = 0; i <= n; i++) { const s = (L * i) / n; const q = polyAt(P, s); S.push({ s, x: q[0], z: q[1] }); }
  for (let i = 0; i <= n; i++) { const a = S[Math.max(0, i - 1)], b = S[Math.min(n, i + 1)]; const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; S[i].tx = (b.x - a.x) / l; S[i].tz = (b.z - a.z) / l; S[i].nx = -S[i].tz; S[i].nz = S[i].tx; }
  const R = { S, L, step: L / n };
  R.at = (s) => { const f = Math.max(0, Math.min(n, s / R.step)); const i = Math.min(n - 1, Math.floor(f)), t = f - i; const a = S[i], b = S[i + 1];
    const tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t; const l = Math.hypot(tx, tz) || 1; return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l }; };
  R.lat = (s, d) => { const p = R.at(s); return [p.x + p.nx * d, p.z + p.nz * d]; };
  // nearest route sample to (x, z) -> {s, d (signed, + = left)}
  R.project = (x, z) => { let best = null; for (const p of S) { const dx = x - p.x, dz = z - p.z; const dd = dx * dx + dz * dz; if (!best || dd < best.dd) best = { dd, p }; } const p = best.p; return { s: p.s, d: (x - p.x) * p.nx + (z - p.z) * p.nz, dist: Math.sqrt(best.dd) }; };
  // piers: portal bents ~25 m apart; each leg must stand clear of every carriageway, lamp post and building lot
  const near = parcels.filter((p) => !p.far && p.x > -2300 && p.x < -1450 && p.z > -1100 && p.z < -150);
  const inLot = (p, x, z) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); const dx = x - p.x, dz = z - p.z; const u = dx * c + dz * s, v = -dx * s + dz * c; return Math.abs(u) <= p.d / 2 + 0.8 && Math.abs(v) <= p.w / 2 + 0.8; };
  const legOk = (x, z) => { const r = graph.index.near(x, z); if (r && r.d < r.e.hw + 0.65) return false; for (const l of lamps) if (Math.abs(l.x - x) < 1.6 && Math.abs(l.z - z) < 1.6) return false; for (const p of near) if (Math.abs(p.x - x) < 60 && Math.abs(p.z - z) < 60 && inLot(p, x, z)) return false; return true; };
  const legs = (s) => [-1, 1].filter((sg) => { const q = R.lat(s, sg * VIA.colOff); return legOk(q[0], q[1]); });
  const piers = []; const push = (s, lg) => piers.push({ s, legs: lg });
  { let s = 5; for (; s < 16; s += 1) if (legs(s).length === 2) break; push(s, legs(s)); }
  for (;;) { const prev = piers[piers.length - 1].s; if (prev + 20 > L - 5) break; let got = null;
    for (const o of [25, 23, 27, 21, 29, 31, 19, 33, 35]) { const s = prev + o; if (s > L - 5) continue; if (legs(s).length === 2) { got = s; break; } }
    if (got == null) { for (const o of [25, 27, 23, 29, 31]) { const s = prev + o; if (s <= L - 5 && legs(s).length) { got = s; break; } } }
    if (got == null) got = Math.min(L - 5, prev + 33);
    push(got, legs(got)); }
  { const last = piers[piers.length - 1]; if (L - 5 - last.s > 8) push(L - 5, legs(L - 5)); }
  R.piers = piers;
  return R;
}
// drop the things that would collide with the deck: palms whose crowns reach the girder, skyways / cables across the line
export function viaductClear(R, palms, col) {
  if (!R) return;
  for (let i = palms.length - 1; i >= 0; i--) { const p = palms[i]; if (Math.abs(p.x - -1900) > 520 || p.z > -100 || p.z < -1150) continue; const q = R.project(p.x, p.z); if (q.dist < 14 && q.s > -5 && q.s < R.L + 5) palms.splice(i, 1); }
  for (const pr of R.piers) for (const sg of pr.legs) { const q = R.lat(pr.s, sg * VIA.colOff); const r = VIA.colR + 0.05; col.add(q[0] - r, q[1] - r, q[0] + r, q[1] + r, VIA.soffit, 'pole'); }
}
// does the segment A→B ({x,z}) pass within m metres of the line?
export function nearViaduct(R, A, B, m = 12) {
  if (!R) return false; for (let i = 0; i <= 8; i++) { const t = i / 8; const q = R.project(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t); if (q.dist < m) return true; } return false;
}

// ----------------------------------------------------------------------- materials ----
let VMAT = null;
function concreteMat() {
  if (VMAT) return VMAT;
  VMAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  VMAT.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVP; varying vec3 vVN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 q = vec4(transformed, 1.0); vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
          q = instanceMatrix * q; wn = mat3(instanceMatrix) * wn;
          #endif
          vVP = (modelMatrix * q).xyz; vVN = normalize(mat3(modelMatrix) * wn); }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vVP; varying vec3 vVN;
      float vh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(vh(i), vh(i + vec2(1,0)), f.x), mix(vh(i + vec2(0,1)), vh(i + vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 N = normalize(vVN); vec3 P = vVP; float vert = 1.0 - abs(N.y);
        float u = dot(P.xz, normalize(vec2(-N.z, N.x) + 1e-4)); // horizontal coordinate along a vertical face
        float base = 0.56 + (vn(P.xz * 0.35 + P.y * 0.2) - 0.5) * 0.08 + (vn(vec2(u, P.y) * 2.3) - 0.5) * 0.05;
        // formwork: horizontal lift lines every 1.2 m and panel joints every 2.4 m on vertical faces
        float lift = (1.0 - smoothstep(0.0, 0.03, abs(fract(P.y / 1.2) - 0.5) - 0.47)) * 0.06 * vert;
        float joint = (1.0 - smoothstep(0.0, 0.02, abs(fract(u / 2.4) - 0.5) - 0.485)) * 0.05 * vert;
        // rain streaks: long vertical noise, strongest under the deck edge, fading downwards
        float st = vn(vec2(u * 3.1, P.y * 0.12)) * vn(vec2(u * 7.7 + 3.0, P.y * 0.3));
        float runoff = smoothstep(0.25, 0.75, st) * vert * (0.25 + 0.5 * smoothstep(3.0, 10.5, P.y));
        float splash = (1.0 - smoothstep(0.2, 1.6, P.y)) * 0.22 * (0.6 + 0.4 * vn(vec2(u * 4.0, P.y * 3.0)));
        float soffit = (1.0 - smoothstep(-0.9, -0.4, N.y)) * 0.3; float topf = smoothstep(0.5, 0.9, N.y) * 0.05;
        float g = base - lift - joint - runoff * 0.24 - splash - soffit + topf;
        diffuseColor.rgb *= vec3(g * 1.0, g * 0.99, g * 0.97); }`);
  };
  VMAT.customProgramCacheKey = () => 'viaconc';
  return VMAT;
}

// ----------------------------------------------------------------------- geometry ----
// U-trough girder cross-section, extruded 1 m along +x (lateral = -z after the rotation, symmetric anyway)
function troughG() {
  const h = VIA.hw, y0 = VIA.soffit, yf = VIA.floor, yt = VIA.top; const sh = new THREE.Shape();
  const pts = [[-h, yt], [-h, y0 + 0.75], [-h + 0.7, y0], [h - 0.7, y0], [h, y0 + 0.75], [h, yt], [h - 0.32, yt], [h - 0.32, yf + 0.25], [h - 0.55, yf], [-h + 0.55, yf], [-h + 0.32, yf + 0.25], [-h + 0.32, yt]];
  sh.moveTo(pts[0][0], pts[0][1]); for (let i = pts.length - 1; i > 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, steps: 1 }); g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2); g.computeVertexNormals();
  return g;
}
// column: plinth + octagonal shaft + flared head, y = 0 .. soffit-0.85 (cross-head sits on top)
function columnG() {
  const yh = VIA.soffit - 0.85; const parts = [];
  const add = (g, y) => { g.translate(0, y, 0); parts.push(g.toNonIndexed()); };
  add(new THREE.CylinderGeometry(0.82, 0.86, 0.5, 8).rotateY(Math.PI / 8), 0.25);
  add(new THREE.CylinderGeometry(VIA.colR, VIA.colR, yh - 1.2, 8, 1, true).rotateY(Math.PI / 8), 0.5 + (yh - 1.2) / 2 - 0.0);
  add(new THREE.CylinderGeometry(0.78, VIA.colR, 0.7, 8, 1, true).rotateY(Math.PI / 8), yh - 0.35);
  return mergeNI(parts);
}
// cross-head: tapered cap beam, lateral along x, 1.5 m thick along z
function crossG() {
  const w = VIA.colOff + 0.95, y1 = VIA.soffit, y0 = VIA.soffit - 0.85; const sh = new THREE.Shape();
  const pts = [[-w, y1], [w, y1], [w, y1 - 0.45], [w - 1.6, y0], [-w + 1.6, y0], [-w, y1 - 0.45]];
  sh.moveTo(pts[0][0], pts[0][1]); for (let i = pts.length - 1; i > 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: false }); g.translate(0, 0, -0.75); g.computeVertexNormals(); return g;
}
function mergeNI(parts) {
  const pos = [], nor = []; for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return g;
}

// ----------------------------------------------------------------------- the layer ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
export class Viaduct {
  constructor(scene, mats, city, R) {
    this.R = R; this.city = city; this.group = new THREE.Group(); this.group.name = 'viaduct'; scene.add(this.group);
    this.mats = mats; this.built = new Map(); this.base = [];
    const cm = concreteMat();
    // girder chords (6 m, 0.12 m overlap)
    const ch = []; for (let s = 0; s < R.L - 0.01; s += 6) ch.push([s, Math.min(R.L, s + 6)]);
    const gi = new THREE.InstancedMesh(troughG(), cm, ch.length);
    ch.forEach(([a, b], i) => { const A = R.at(a), B = R.at(b); const dx = B.x - A.x, dz = B.z - A.z; const l = Math.hypot(dx, dz);
      _q.setFromAxisAngle(_Y, Math.atan2(-dz, dx)); _s.set(l + 0.12, 1, 1); _p.set((A.x + B.x) / 2, 0, (A.z + B.z) / 2); _m.compose(_p, _q, _s); gi.setMatrixAt(i, _m); });
    // end walls (abutment caps) at both ends: short solid chords
    const nl = R.piers.reduce((n, p) => n + p.legs.length, 0);
    const ci = new THREE.InstancedMesh(columnG(), cm, nl), xi = new THREE.InstancedMesh(crossG(), cm, R.piers.length); let k = 0;
    R.piers.forEach((pr, i) => { const p = R.at(pr.s); const yaw = Math.atan2(-p.tz, p.tx) + Math.PI / 2; // cross-head x axis -> route normal
      _q.setFromAxisAngle(_Y, yaw); _s.set(1, 1, 1); _p.set(p.x, 0, p.z); _m.compose(_p, _q, _s); xi.setMatrixAt(i, _m);
      for (const sg of pr.legs) { _p.set(p.x + p.nx * sg * VIA.colOff, 0, p.z + p.nz * sg * VIA.colOff); _m.compose(_p, _q, _s); ci.setMatrixAt(k++, _m); } });
    for (const m of [gi, ci, xi]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); this.group.add(m); this.base.push(m); }
    this.counts = { chords: ch.length, legs: nl, piers: R.piers.length, len: Math.round(R.L) };
    // parked train + end buffers (merged, built once)
    const W = new World(1e7); withSeed(4711, () => { train(W, R, 330, 1); ends(W, R); edges(W, R); });
    for (const m of W.build(this.group, mats, { neon: { cast: false }, cnsign: { cast: false }, cone: { cast: false, receive: false } })) this.base.push(m);
    // spans for the near detail
    this.spans = []; for (let i = 0; i < R.piers.length - 1; i++) { const a = R.piers[i].s, b = R.piers[i + 1].s; const m = R.at((a + b) / 2); this.spans.push({ i, s0: a, s1: b, x: m.x, z: m.z, p0: R.piers[i], p1: R.piers[i + 1] }); }
  }
  sync(cam) {
    if (!cam) return; const p = cam.position;
    for (const sp of this.spans) {
      const d = Math.hypot(sp.x - p.x, sp.z - p.z); const b = this.built.get(sp.i);
      if (!b && d < NEAR_R) { const W = new World(1e7); W.attrs = {}; withSeed((0x51a7 + sp.i * 7919) >>> 0, () => spanDetail(W, this.R, sp, this.city)); this.built.set(sp.i, W.build(this.group, this.mats, { neon: { cast: false }, cone: { cast: false, receive: false }, steam: { cast: false, receive: false }, cnsign: { cast: false }, glassRail: { cast: false }, puddle: { cast: false } })); }
      else if (b && d > FREE_R) { for (const m of b) { this.group.remove(m); m.geometry.dispose(); } this.built.delete(sp.i); }
    }
    for (const [i, b] of this.built) { const sp = this.spans[i]; const on = Math.hypot(sp.x - p.x, sp.z - p.z) < DETAIL_R + Math.max(0, p.y - 40) * 0.5;
      for (const m of b) if (m.name.startsWith('vcolD|') || m.name.startsWith('steam|') || m.name.startsWith('puddle|')) m.visible = on; }
  }
  tris() { let n = 0; for (const m of this.base) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); for (const b of this.built.values()) for (const m of b) n += m.geometry.index.count / 3; return Math.round(n); }
}

// b_neon_sign: LED edge strips + parapet coping along the whole line (base layer; ~6 k tris, colour alternates per span as before)
function edges(W, R) {
  const P = R.piers.map((p) => p.s);
  for (let i = 0; i < P.length - 1; i++) {
    const s0 = P[i], s1 = P[i + 1]; const m = R.at((s0 + s1) / 2); const nb = W.b('neon', m.x, m.z), v = W.b('vcol', m.x, m.z);
    const ledC = i % 2 ? [0.12, 0.9, 1.0] : [1.0, 0.16, 0.62]; const nseg = Math.max(1, Math.round((s1 - s0) / 6)); const ds = (s1 - s0) / nseg;
    for (let k = 0; k < nseg; k++) { const a = s0 + k * ds, b = a + ds + 0.02;
      for (const sg of [-1, 1]) {
        beam(nb, WP(R, a, sg * (VIA.hw + 0.03), VIA.soffit + 0.78), WP(R, b, sg * (VIA.hw + 0.03), VIA.soffit + 0.78), 0.05, ledC.map((q) => q * 0.5), 0.07);
        beam(v, WP(R, a, sg * (VIA.hw - 0.16), VIA.top + 0.03), WP(R, b, sg * (VIA.hw - 0.16), VIA.top + 0.03), 0.36, [0.62, 0.62, 0.6], 0.06); } }
    // soffit lamps at mid-span (housing + lens), night light cones down onto the street
    { const s = (s0 + s1) / 2; const p = R.at(s); const yaw = Math.atan2(-p.tz, p.tx); const cb = W.b('cone', m.x, m.z); const G = kg();
      for (const sg of [-1, 1]) { const q = WP(R, s, sg * 2.6, VIA.soffit - 0.12); put(v, G.box, q[0], q[1], q[2], 0.9, 0.22, 0.4, [0.2, 0.2, 0.22], yaw); put(nb, G.box, q[0], q[1] - 0.12, q[2], 0.78, 0.02, 0.3, [0.55, 0.5, 0.42], yaw);
        cone(cb, q[0], q[1] - 0.14, q[2], VIA.soffit - 0.3, 4.2, [1.0, 0.85, 0.65]); } }
  }
}
// ----------------------------------------------------------------------- near detail ----
let CONE_G = null;
function cone(b, x, y, z, h, r, col) { if (!CONE_G) { CONE_G = new THREE.CylinderGeometry(0.06, 1, 1, 14, 1, true); CONE_G.translate(0, -0.5, 0); } put(b, CONE_G, x, y, z, r, h, r, col); }
// world point at arc length s, lateral d (left +), height y
const WP = (R, s, d, y) => { const q = R.lat(s, d); return [q[0], y, q[1]]; };
function spanDetail(W, R, sp, city) {
  const { s0, s1 } = sp; const mx = sp.x, mz = sp.z;
  const v = W.b('vcol', mx, mz), c = W.b('vcolD', mx, mz), nb = W.b('neon', mx, mz), cb = W.b('cone', mx, mz); const G = kg();
  const yf = VIA.floor, len = s1 - s0; const nseg = Math.max(1, Math.round(len / 6)); const ds = len / nseg;
  const ledC = sp.i % 2 ? [0.12, 0.9, 1.0] : [1.0, 0.16, 0.62];
  for (let k = 0; k < nseg; k++) {
    const a = s0 + k * ds, b = a + ds + 0.02;
    for (const tr of [-1, 1]) { const tc = tr * VIA.track;
      beam(v, WP(R, a, tc, yf + 0.1), WP(R, b, tc, yf + 0.1), 2.5, [0.5, 0.5, 0.49], 0.2); // slab-track plinth
      for (const r of [-1, 1]) { beam(v, WP(R, a, tc + r * VIA.gauge, yf + 0.28), WP(R, b, tc + r * VIA.gauge, yf + 0.28), 0.07, [0.34, 0.3, 0.27], 0.16); // rail
        beam(v, WP(R, a, tc + r * VIA.gauge, yf + 0.355), WP(R, b, tc + r * VIA.gauge, yf + 0.355), 0.06, [0.72, 0.72, 0.74], 0.012); } } // polished head
    for (const sg of [-1, 1]) { beam(c, WP(R, a, sg * (VIA.hw - 0.5), yf + 0.42), WP(R, b, sg * (VIA.hw - 0.5), yf + 0.42), 0.34, [0.32, 0.33, 0.34], 0.14); // cable trough
      void ledC; } // LED edge strip + coping: base layer (edges())
  }
  // sleeper blocks (two-block sleepers every 1.25 m)
  for (let s = s0 + 0.6; s < s1; s += 1.25) for (const tr of [-1, 1]) for (const r of [-1, 1]) { const q = WP(R, s, tr * VIA.track + r * VIA.gauge, yf + 0.22); const p = R.at(s); put(c, G.box, q[0], q[1], q[2], 0.3, 0.06, 0.62, [0.42, 0.42, 0.41], Math.atan2(-p.tz, p.tx)); }
  // catenary: a mast on alternating parapets at the pier and at mid-span, cantilever over its track, wires to the next mast
  const masts = [s0 + 0.9, (s0 + s1) / 2 + 0.9];
  masts.forEach((s, mi) => { const sg = (sp.i + mi) % 2 ? 1 : -1; const p = R.at(s); const yaw = Math.atan2(-p.tz, p.tx);
    const base = WP(R, s, sg * (VIA.hw - 0.16), VIA.top); const top = [base[0], VIA.wire + 1.4, base[2]]; beam(v, base, top, 0.26, [0.3, 0.32, 0.34], 0.2);
    put(v, G.box, base[0], VIA.top + 0.15, base[2], 0.6, 0.3, 0.6, [0.36, 0.37, 0.38], yaw);
    for (const tr of [sg, -sg]) { const tc = tr * VIA.track; const reach = WP(R, s, tc, VIA.wire + 0.9); const rb = WP(R, s, sg * (VIA.hw - 0.16), VIA.wire + 0.9);
      if (tr === -sg) { beam(v, [rb[0], VIA.wire + 1.3, rb[2]], WP(R, s, tc, VIA.wire + 1.3), 0.08, [0.3, 0.32, 0.34]); tube(c, WP(R, s, tc, VIA.wire + 1.3), WP(R, s, tc, VIA.wire + 0.15), 0.02, STEEL, kg().tube4); }
      else { beam(v, rb, reach, 0.07, [0.3, 0.32, 0.34]); beam(c, WP(R, s, sg * (VIA.hw - 0.16), VIA.wire), reach, 0.04, STEEL); } // stay
      put(c, G.cyl8, reach[0], reach[1] - 0.25, reach[2], 0.05, 0.4, 0.05, [0.75, 0.55, 0.35]); } // insulator
    if (mi === 0 && sp.i % 3 === 0) put(nb, G.box, top[0], top[1] + 0.12, top[2], 0.14, 0.14, 0.14, [1.0, 0.15, 0.1].map((q) => q * 0.8)); // red mast-top lamp
  });
  const wireTo = s1 + 0.9;
  for (const tr of [-1, 1]) { const tc = tr * VIA.track; const pts = [s0 + 0.9, (s0 + s1) / 2 + 0.9, wireTo];
    for (let i = 0; i < 2; i++) { cable(c, WP(R, pts[i], tc, VIA.wire + 1.0), WP(R, pts[i + 1], tc, VIA.wire + 1.0), 0.35, 0.012, [0.45, 0.32, 0.2], 6); // messenger
      beam(c, WP(R, pts[i], tc + (i ? 0.2 : -0.2), VIA.wire), WP(R, pts[i + 1], tc + (i ? -0.2 : 0.2), VIA.wire), 0.014, [0.62, 0.42, 0.25], 0.014, kg().tube4); // zig-zag contact wire
      for (let t = 0.25; t < 1; t += 0.25) { const s = pts[i] + (pts[i + 1] - pts[i]) * t; const sag = 0.35 * 4 * t * (1 - t); tube(c, WP(R, s, tc, VIA.wire + 1.0 - sag), WP(R, s, tc, VIA.wire), 0.004, [0.5, 0.4, 0.3], kg().tube4); } } }
  // soffit lamps at mid-span (housing + lens), night light cones down onto the street
  void cb; // b_neon_sign: soffit lamps + light cones moved to the base layer (edges()), they read from far at night
  // girder name boards on every third span (both faces)
  if (sp.i % 3 === 1) { const s = (s0 + s1) / 2 + 6; const p = R.at(s); const yaw = Math.atan2(p.nx, p.nz);
    for (const sg of [-1, 1]) { const q = WP(R, s, sg * (VIA.hw + 0.06), VIA.soffit + 0.95); put(v, G.box, q[0], q[1], q[2], 3.3, 1.35, 0.1, [0.06, 0.06, 0.07], yaw);
      const f = WP(R, s, sg * (VIA.hw + 0.115), VIA.soffit + 0.95); cnFace(W, sp.i % 2 ? SG.rail : SG.line, f[0], f[1], f[2], sg > 0 ? yaw : yaw + Math.PI, 2.6 * 1.18, 1.22, 1); } }
  // drips: puddles under the girder edges, wet stains
  for (let i = 0; i < randi(1, 3); i++) { const sg = rng() < 0.5 ? -1 : 1; const s = rand(s0 + 2, s1 - 2); const q = R.lat(s, sg * (VIA.hw - 0.1) + rand(-0.4, 0.4)); const y = city.groundH(q[0], q[1]) + 0.012;
    const b = W.b('puddle', q[0], q[1]); const n = 10, pts = []; const r = rand(0.5, 1.3); for (let k = 0; k < n; k++) { const t = -(k / n) * Math.PI * 2; const rr = r * (0.75 + rand(0, 0.35)); pts.push([q[0] + Math.cos(t) * rr * 1.5, q[1] + Math.sin(t) * rr]); }
    let A = 0; for (let k = 0; k < n; k++) { const P1 = pts[k], P2 = pts[(k + 1) % n]; A += P1[0] * P2[1] - P2[0] * P1[1]; } if (A > 0) pts.reverse(); polyCap(b, pts, y, {}, [0.03, 0.035, 0.04]); }
  // pier dressing at s0: downpipe, hazard bands, paper ads / posters, a height-limit plate
  pierDress(W, R, sp.p0, sp.i, city);
  // night market: a few spans get a cluster of stalls on the pavement between the legs (one side)
  if (sp.i % 4 === 2 && len > 18) market(W, R, sp, city);
}
function pierDress(W, R, pr, idx, city) {
  const p = R.at(pr.s); const yaw = Math.atan2(-p.tz, p.tx); const G = kg();
  for (const sg of pr.legs) {
    const [cx, cz] = R.lat(pr.s, sg * VIA.colOff); const c = W.b('vcolD', cx, cz), v = W.b('vcol', cx, cz); const y0 = city.groundH(cx, cz) > 0.1 ? 0.15 : 0;
    // hazard bands (yellow / black) around the foot of the shaft
    for (let i = 0; i < 4; i++) put(v, G.cyl8, cx, y0 + 0.55 + i * 0.22, cz, VIA.colR + 0.02, 0.22, VIA.colR + 0.02, i % 2 ? [0.06, 0.06, 0.06] : [0.85, 0.65, 0.05], yaw + Math.PI / 8);
    // downpipe on the street-facing side of one leg, elbow into a gully at the kerb
    if ((idx + (sg > 0 ? 1 : 0)) % 2 === 0) { const o = -sg * (VIA.colR + 0.12); const top = WP(R, pr.s + 0.3, sg * VIA.colOff + o, VIA.soffit - 0.9); const bot = [top[0], y0 + 0.35, top[2]];
      tube(c, top, bot, 0.075, [0.24, 0.25, 0.26], kg().tube6); const out = WP(R, pr.s + 0.3, sg * VIA.colOff + o * 2.2, y0 + 0.08); tube(c, bot, out, 0.075, [0.24, 0.25, 0.26], kg().tube6);
      for (let y = 1.6; y < VIA.soffit - 1.5; y += 2.4) put(c, G.box, top[0], y, top[2], 0.2, 0.06, 0.2, DARK, yaw);
      put(c, G.box, out[0], y0 + 0.01, out[2], 0.45, 0.02, 0.45, [0.1, 0.1, 0.1], yaw); }
    // paper ads + an occasional bigger poster on the column faces (both directions)
    for (const f of [0, 2, 4, 6]) { const ang = yaw + Math.PI / 8 + f * Math.PI / 4 + Math.PI / 8; // face normal angle of the octagon
      const nx = Math.sin(ang), nz = Math.cos(ang); const n = randi(0, 3);
      for (let i = 0; i < n; i++) { const y = y0 + rand(1.3, 2.6); const s = rand(0.16, 0.3); const fx = cx + nx * (VIA.colR * 0.93 + 0.01 + i * 0.002), fz = cz + nz * (VIA.colR * 0.93 + 0.01 + i * 0.002);
        const tx = Math.cos(ang), tz = -Math.sin(ang); const o = rand(-0.12, 0.12); cnFace(W, 100 + randi(0, 15), fx + tx * o, y, fz + tz * o, ang, s, s * rand(1, 1.3), 0, rand(-0.1, 0.1)); }
      if (rng() < 0.18) { const fx = cx + nx * (VIA.colR * 0.93 + 0.02), fz = cz + nz * (VIA.colR * 0.93 + 0.02); cnFace(W, randi(0, 17), fx, y0 + 3.1, fz, ang, 0.42, 0.21, 0); }
    }
  }
}
function market(W, R, sp, city) {
  const sg = sp.i % 8 === 2 ? 1 : -1; const s = (sp.s0 + sp.s1) / 2; const L = Math.min(sp.s1 - sp.s0 - 6, 14);
  // frame: back line at lateral sg * 11.0 (outer pavement), a along the route, d toward the road
  const A = R.at(s - L / 2), B = R.at(s + L / 2); const back = 10.9;
  const p0 = [A.x + A.nx * sg * back, A.z + A.nz * sg * back], p1 = [B.x + B.nx * sg * back, B.z + B.nz * sg * back];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); const dx = (p1[0] - p0[0]) / len, dz = (p1[1] - p0[1]) / len; const m = R.at(s); const ox = -m.nx * sg, oz = -m.nz * sg;
  const F = { len, dx, dz, ox, oz, P: (a, d) => [p0[0] + dx * a + ox * d, p0[1] + dz * a + oz * d] };
  // only on real pavement (not over a junction mouth)
  const r = city.graph.index.near(...F.P(len / 2, 1.6)); if (!r || r.d < r.e.hw + 0.5 || r.e.sw === 0) return;
  const y0 = 0.15; let a = 2.2; const used = [];
  while (a < len - 1.5) { const f = pick(STALLS); withSeed((sp.i * 131 + used.length * 17) >>> 0, () => f(W, F, a, 1.55, y0)); used.push(f); a += rand(4.2, 5.4); }
}
// parked 4-car train on the westbound (left) track, front at arc length s
function train(W, R, s, side) {
  const G = kg(); const tc = side * VIA.track; const yr = VIA.floor + 0.37; const CL = 17.2, GAP = 0.9;
  const body = [0.86, 0.87, 0.88], dark = [0.08, 0.085, 0.095], liv = [1.0, 0.16, 0.62], liv2 = [0.12, 0.9, 1.0];
  for (let k = 0; k < 4; k++) {
    const a = s - k * (CL + GAP), b = a - CL; const A = R.at(a), B = R.at(b); const cx = (A.x + B.x) / 2 + A.nx * tc, cz = (A.z + B.z) / 2 + A.nz * tc; const yaw = Math.atan2(-(A.z - B.z), A.x - B.x);
    const v = W.b('vcol', cx, cz), nb = W.b('neon', cx, cz);
    const P = (u, w, y) => { const c = Math.cos(yaw), sn = Math.sin(yaw); return [cx + c * u + sn * w, y, cz - sn * u + c * w]; }; // u along car (+ = front), w lateral
    const box = (b2, u, w, y, lu, lw, ly, col) => { const q = P(u, w, y); put(b2, G.box, q[0], q[1], q[2], lu, ly, lw, col, yaw); };
    // underframe, bogies, wheels
    box(v, 0, 0, yr + 0.72, CL - 0.6, 2.5, 0.42, dark);
    for (const u of [-CL / 2 + 2.6, CL / 2 - 2.6]) { box(v, u, 0, yr + 0.42, 2.6, 2.0, 0.42, [0.12, 0.12, 0.13]); for (const du of [-0.9, 0.9]) for (const w of [-0.72, 0.72]) { const q = P(u + du, w, yr + 0.36); _wheel(v, q, yaw); } }
    // body shell: lower panel, window band, upper panel, roof
    box(v, 0, 0, yr + 1.45, CL, 2.82, 1.05, body);
    box(v, 0, 0, yr + 2.95, CL, 2.82, 0.55, body);
    box(v, 0, 0, yr + 3.33, CL - 0.3, 2.5, 0.22, [0.7, 0.71, 0.72]);
    // window band: dark glass outside, lit interior at night (neon bucket, dim warm), mullions between
    for (const sd of [-1, 1]) { box(v, 0, sd * 1.405, yr + 2.3, CL - 0.4, 0.02, 0.76, [0.05, 0.06, 0.07]);
      for (let u = -CL / 2 + 1.0; u < CL / 2 - 0.9; u += 2.15) { box(nb, u + 0.95, sd * 1.415, yr + 2.3, 1.55, 0.01, 0.62, [0.42, 0.4, 0.34]); }
      box(nb, 0, sd * 1.42, yr + 1.25, CL - 0.2, 0.012, 0.09, (k % 2 ? liv2 : liv).map((q) => q * 0.45)); // livery LED stripe
      box(v, 0, sd * 1.418, yr + 1.12, CL - 0.2, 0.012, 0.1, k % 2 ? [0.1, 0.55, 0.62] : [0.62, 0.1, 0.38]);
      for (const u of [-CL / 2 + 3.2, 0, CL / 2 - 3.2]) { box(v, u, sd * 1.42, yr + 1.95, 1.4, 0.012, 1.95, [0.6, 0.61, 0.62]); box(nb, u, sd * 1.426, yr + 2.25, 1.0, 0.01, 0.6, [0.42, 0.4, 0.34]); } } // doors + door glass
    // roof AC pods + pantograph on cars 0 / 2
    for (const u of [-CL / 4, CL / 4]) box(v, u, 0, yr + 3.58, 2.6, 1.7, 0.32, [0.62, 0.63, 0.64]);
    if (k % 2 === 0) { const u0 = -1.2, y0 = yr + 3.48; const h = VIA.wire - y0; const base = P(u0, 0, y0); box(v, u0, 0, y0 + 0.08, 1.6, 1.0, 0.12, dark);
      for (const w of [-0.4, 0.4]) { beam(v, P(u0 - 0.7, w, y0 + 0.1), P(u0 + 0.2, w, y0 + h * 0.55), 0.04, DARK); beam(v, P(u0 + 0.2, w, y0 + h * 0.55), P(u0 - 0.3, w, VIA.wire - 0.04), 0.035, DARK); }
      beam(v, P(u0 - 0.3, -0.85, VIA.wire - 0.04), P(u0 - 0.3, 0.85, VIA.wire - 0.04), 0.05, [0.3, 0.3, 0.3]); void base; }
    // ends: front cab on car 0, rear cab on car 3, gangway bellows in between
    for (const e of [1, -1]) { const cab = (k === 0 && e === 1) || (k === 3 && e === -1); const u = e * CL / 2;
      if (cab) { box(v, u + e * 0.25, 0, yr + 1.6, 0.5, 2.7, 1.9, body); box(v, u + e * 0.52, 0, yr + 2.45, 0.04, 2.3, 0.9, [0.04, 0.05, 0.06]);
        const f = P(u + e * 0.55, 0, yr + 3.05); cnFace(W, SG.line, f[0], f[1], f[2], e > 0 ? yaw + Math.PI / 2 : yaw - Math.PI / 2, 1.3, 0.34, 1);
        for (const w of [-1.0, 1.0]) box(nb, u + e * 0.52, w, yr + 1.25, 0.03, 0.4, 0.14, e > 0 ? [0.9, 0.9, 0.85] : [0.8, 0.05, 0.05]);
        box(nb, u + e * 0.53, 0, yr + 1.0, 0.02, 2.5, 0.06, (e > 0 ? liv2 : liv).map((q) => q * 0.5)); }
      else box(v, u + e * GAP / 2, 0, yr + 2.1, GAP, 2.0, 2.6, [0.1, 0.1, 0.11]); }
  }
}
const _wq = new THREE.Quaternion(), _we = new THREE.Euler();
function _wheel(b, q, yaw) { _we.set(Math.PI / 2, yaw, 0, 'YXZ'); _wq.setFromEuler(_we); _s.set(0.42, 0.12, 0.42); _p.set(q[0], q[1], q[2]); _m.compose(_p, _wq, _s); b.geom(kg().cyl12, _m, {}, [0.2, 0.2, 0.21]); }
// end buffers + an end wall at both ends of the line
function ends(W, R) {
  const G = kg();
  for (const [s, e] of [[1.0, -1], [R.L - 1.0, 1]]) { const p = R.at(s); const yaw = Math.atan2(-p.tz, p.tx); const v = W.b('vcol', p.x, p.z), nb = W.b('neon', p.x, p.z);
    put(v, G.box, p.x, (VIA.floor + VIA.top + 0.5) / 2, p.z, 0.5, VIA.top + 0.5 - VIA.floor, VIA.hw * 2, [0.5, 0.5, 0.49], yaw);
    for (const tr of [-1, 1]) { const q = WP(R, s - e * 1.2, tr * VIA.track, VIA.floor + 0.8); put(v, G.box, q[0], q[1], q[2], 0.6, 0.7, 2.2, [0.85, 0.65, 0.05], yaw); put(nb, G.box, q[0], q[1] + 0.5, q[2], 0.15, 0.15, 0.15, [0.9, 0.1, 0.05], yaw); }
  }
}
void NEONC; void tube; void mulberry;
