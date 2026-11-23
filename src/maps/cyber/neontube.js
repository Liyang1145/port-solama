// b_neon_sign (Hark modelling lane, 2026-11-22): real neon-tube construction for map B (霓港) signs, used by kit.js neonSign().
// Before: every stroke was a separate straight 4/6-sided cylinder meeting the next one at a hard mitre, floating on the box.
// Now each sign face is wired like a real one:
//  * one continuous swept glass tube per stroke (shared rings, parallel-transport frames) with bent corners (bend radius ≈ 3.5 r,
//    a few arc steps per bend instead of a kink);
//  * the tube runs from stroke to stroke as a BLACK-OUT painted jumper that dips back towards the backer (the unlit sections you
//    see on every real sign), and ends in electrode housings that go through the backer at both ends of the circuit;
//  * glass-tube supports (stand-off posts + clip) every ~80 cm hold the tube off the backer;
//  * now and then (≈8 %, position hash) a dead tube (grey, unlit glass) on a stroke;
//  * a soft additive halo on the face ('nglow') and a view-dependent streak on the wet pavement under the sign ('nrefl'), both
//    near-range only (LOD-hidden with the small clutter beyond DETAIL_R) and night / wet driven.
// Original procedural geometry; no third-party assets.
import * as THREE from 'three';
import { U } from '../../env.js';

const BLACK = [0.035, 0.035, 0.04], DEAD = [0.32, 0.34, 0.37], SUP = [0.62, 0.64, 0.66], ELEC = [0.08, 0.08, 0.09];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-5;

// polyline with filleted corners (quadratic Bézier through each interior vertex). closed when first == last
export function roundPath(P, rb) {
  const closed = P.length > 2 && same(P[0], P[P.length - 1]); const pts = closed ? P.slice(0, -1) : P.slice(); const n = pts.length;
  if (n < 3 && !closed) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(cur); continue; }
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    const v1 = sub(cur, prev), v2 = sub(next, cur); const l1 = len(v1), l2 = len(v2); if (l1 < 1e-5 || l2 < 1e-5) continue;
    const d1 = mul(v1, 1 / l1), d2 = mul(v2, 1 / l2); const ang = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2))));
    if (ang < 0.08) { out.push(cur); continue; }
    const c = Math.min(rb * Math.tan(ang / 2), l1 * 0.45, l2 * 0.45); const A = sub(cur, mul(d1, c)), B = add(cur, mul(d2, c));
    const k = ang > 1.9 ? 4 : ang > 1.0 ? 3 : 2; out.push(A);
    for (let j = 1; j < k; j++) { const t = j / k, u = 1 - t; out.push(add(add(mul(A, u * u), mul(cur, 2 * u * t)), mul(B, t * t))); }
    out.push(B);
  }
  if (closed) out.push(out[0].slice());
  return out;
}
const pathLen = (P) => { let L = 0; for (let i = 1; i < P.length; i++) L += len(sub(P[i], P[i - 1])); return L; };
function pathAt(P, s) { for (let i = 1; i < P.length; i++) { const l = len(sub(P[i], P[i - 1])); if (s <= l || i === P.length - 1) { const t = l ? Math.min(1, s / l) : 0; return add(P[i - 1], mul(sub(P[i], P[i - 1]), t)); } s -= l; } return P[P.length - 1]; }

// swept tube of radius r along P (shared rings, parallel transport), written straight into a GeoBucket
export function sweep(b, P, r, col, sides = 6) {
  const n = P.length; if (n < 2) return;
  const T = []; for (let i = 0; i < n; i++) { const a = P[Math.max(0, i - 1)], c = P[Math.min(n - 1, i + 1)]; T.push(nrm(sub(c, a))); }
  let N = Math.abs(T[0][1]) < 0.9 ? nrm(cross(T[0], [0, 1, 0])) : nrm(cross(T[0], [1, 0, 0]));
  const base = b.vc; const cust = Object.keys(b.custom);
  for (let i = 0; i < n; i++) {
    N = nrm(sub(N, mul(T[i], dot(N, T[i])))); const B = cross(T[i], N);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2; const o = add(mul(N, Math.cos(a)), mul(B, Math.sin(a)));
      b.p.push(P[i][0] + o[0] * r, P[i][1] + o[1] * r, P[i][2] + o[2] * r); b.n.push(o[0], o[1], o[2]); b.uv.push(s / sides, i / (n - 1)); b.c.push(col[0], col[1], col[2]);
      for (const k of cust) for (let j = 0; j < b.attrSizes[k]; j++) b.custom[k].push(0);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
    const a = base + i * sides + s, c = base + i * sides + (s + 1) % sides, d = a + sides, e = c + sides;
    b.idx.push(a, c, d, c, e, d);
  }
  b.vc += n * sides;
}
// flat quad a,b,c,d (CCW from the front) with a custom normal (the 'nrefl' shader reads it as the outward direction)
function quadN(b, Q, uvs, nor, col) {
  const base = b.vc; const cust = Object.keys(b.custom);
  for (let i = 0; i < 4; i++) { b.p.push(Q[i][0], Q[i][1], Q[i][2]); b.n.push(nor[0], nor[1], nor[2]); b.uv.push(uvs[i * 2], uvs[i * 2 + 1]); b.c.push(col[0], col[1], col[2]);
    for (const k of cust) for (let j = 0; j < b.attrSizes[k]; j++) b.custom[k].push(0); }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); b.vc += 4;
}

// one tube circuit on a sign face. strokes: list of 3D polylines (in drawing order), r: tube radius, col: lit colour,
// n: unit outward normal of the face, back: distance from the tube axis to the backer face.
// lit glass -> nb ('neon'); black-out jumpers / electrodes / dead tubes -> dk ('vcolD'); supports -> dk too.
export function tubeCircuit(nb, dk, strokes, r, col, n, back, opts = {}) {
  const rb = r * 3.5; let prevEnd = null; const ends = []; const small = r < 0.04; // small shop-board tubes: 4-sided, no clips
  // dead tube: position hash, NOT rng(), so the chunk's random dressing sequence stays exactly as before
  let dead = opts.dead; if (dead == null) { const q = strokes[0] && strokes[0][0]; const hs = q ? Math.abs(Math.sin(q[0] * 12.9898 + q[1] * 78.233 + q[2] * 37.719) * 43758.5453) % 1 : 1; dead = hs < 0.08 ? Math.floor(hs * 1000) % strokes.length : -1; }
  strokes.forEach((S, i) => {
    if (S.length < 2) return; const P = roundPath(S, rb);
    sweep(i === dead ? dk : nb, P, r, i === dead ? DEAD : col, small ? 4 : 6);
    // black-out jumper from the previous stroke: dips back towards the backer, runs behind, comes out again
    if (prevEnd) { const a = prevEnd, c = P[0]; const dd = mul(n, -back * 0.65); if (len(sub(c, a)) > r * 1.5) sweep(dk, roundPath([a, add(a, dd), add(c, dd), c], r * 2.2), r, BLACK, 4); }
    else ends.push(P[0]);
    prevEnd = P[P.length - 1];
    // glass-tube supports (stand-off post + clip) every ~80 cm
    const L = pathLen(P); const k = L > 1.6 ? Math.round(L / 0.8) : L > 0.45 ? 1 : 0;
    for (let j = 0; j < k; j++) { const q = pathAt(P, L * (j + 0.5) / k); const bq = add(q, mul(n, -back));
      sweep(dk, [add(q, mul(n, -r * 0.6)), bq], r * 0.32, SUP, 3); if (!small) sweep(dk, [add(q, mul(n, -r * 1.25)), add(q, mul(n, -r * 0.85))], r * 1.15, SUP, 4); }
  });
  if (prevEnd) ends.push(prevEnd);
  // electrode housings through the backer at both ends of the circuit (painted black ends of the tube + the housing boot)
  for (const e of ends) { sweep(dk, [e, add(e, mul(n, -back * 0.55))], r * 1.0, BLACK, 4); sweep(dk, [add(e, mul(n, -back * 0.55)), add(e, mul(n, -back - 0.03))], r * 1.9, ELEC, small ? 4 : 6); }
}

// near-range glow halo on a face: centre c, axes e1 (right) / e2 (up), half sizes hw / hh, pushed out along n by d
export function haloQuad(gb, c, e1, e2, n, hw, hh, col, d = 0.015) {
  const m = Math.min(1.1, 0.35 + Math.max(hw, hh) * 0.35); const W = hw + m, H = hh + m; const o = add(c, mul(n, d));
  const P = (a, bb) => add(o, add(mul(e1, a), mul(e2, bb)));
  quadN(gb, [P(-W, -H), P(W, -H), P(W, H), P(-W, H)], [0, 0, 1, 0, 1, 1, 0, 1], n, col.map((q) => Math.min(1, q)));
}
// wet-pavement reflection streak on the ground under a sign: foot point f (y = ground + 0.02), out = horizontal unit direction
// away from the sign, side = horizontal unit across it, width w, length L. uv.y = 0 at the foot, 1 at the far end.
export function reflQuad(rb, f, out, side, w, L, col) {
  const P = (a, u) => [f[0] + side[0] * a + out[0] * u, f[1], f[2] + side[2] * a + out[2] * u];
  quadN(rb, [P(-w, 0), P(w, 0), P(w, L), P(-w, L)], [0, 0, 1, 0, 1, 1, 0, 1], out, col);
}

// ------------------------------------------------------------------ materials ----
let GLOW = null, REFL = null;
export function neonGlowMat() {
  if (GLOW) return GLOW;
  GLOW = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 color; varying vec3 vC; varying vec2 vUv; varying float vF;
      void main(){ vC = color; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); float d = distance(wp.xyz, cameraPosition);
        vF = (1.0 - smoothstep(70.0, 210.0, d)) * smoothstep(1.5, 6.0, d); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uNight; varying vec3 vC; varying vec2 vUv; varying float vF;
      void main(){ vec2 q = abs(vUv - 0.5) * 2.0; float r = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
        float g = pow(max(0.0, 1.0 - r), 1.8); float k = smoothstep(0.35, 0.85, uNight) * vF * 0.32;
        gl_FragColor = vec4(vC * g * k, 1.0); }` });
  GLOW.toneMapped = false;
  return GLOW;
}
export function neonReflMat() {
  if (REFL) return REFL;
  REFL = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight, uWet: U.uWet, uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    vertexShader: `attribute vec3 color; varying vec3 vC; varying vec2 vUv; varying vec3 vW; varying vec3 vO;
      void main(){ vC = color; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vO = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uNight, uWet, uTime; varying vec3 vC; varying vec2 vUv; varying vec3 vW; varying vec3 vO;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main(){ vec3 V = cameraPosition - vW; float dist = length(V); vec2 vh = normalize(V.xz + 1e-4);
        // the mirror image of a sign shows on the ground between the viewer and the sign: strongest looking towards it, grazing
        float face = smoothstep(0.15, 0.85, dot(vh, normalize(vO.xz + 1e-4))); float graze = smoothstep(0.05, 0.6, 1.0 - abs(V.y) / max(dist, 1e-3));
        float lat = 1.0 - smoothstep(0.35, 1.0, abs(vUv.x - 0.5) * 2.0);
        float along = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.6);
        // wet asphalt / paver breakup: puddle mask + streaky ripples stretched along the view
        float pud = smoothstep(0.35, 0.7, n2(vW.xz * 0.45)); float rip = 0.65 + 0.35 * n2(vec2(dot(vW.xz, vec2(-vh.y, vh.x)) * 9.0, uTime * 1.3));
        float fade = (1.0 - smoothstep(60.0, 180.0, dist));
        float k = uWet * smoothstep(0.35, 0.85, uNight) * face * graze * lat * along * mix(0.35, 1.0, pud) * rip * fade * 0.55;
        gl_FragColor = vec4(vC * k, 1.0); }` });
  REFL.toneMapped = false;
  return REFL;
}
