// r6.3 霓港 street dressing / weathering (modeling pass B2, user 2026-11-21: 「我现在只考虑光影，建模」).
// Everything is real geometry appended into the streamed chunk World (merged per chunk, freed with it), like kit.js:
//  * grime: gradient water stains / soot run-off down a facade, rust streaks under brackets, a soot band under the parapet
//  * sidewalk clutter: trash-bag piles, wheelie bins, flattened cardboard, crate + pallet stacks, gas bottles, ground pipes,
//    puddles (glossy 'puddle' material), food stalls (cart, canopy, lanterns, stools, steaming pot), umbrella tables,
//    hanging light-box signs on arms
//  * laundry lines strung between facade brackets
// Small pieces go in 'vcolD' (hidden beyond the detail radius by bldglayer.js); lit parts in 'neon' (night x5 emissive).
// All invented / generic; no real brands.
import * as THREE from 'three';
import { polyCap, prismWalls } from '../../geo.js';
import { rng, rand, randi, pick } from '../../util.js';
import { kg, beam, tube, put, cable, NEONC, RUST, DARK, STEEL } from './kit.js';
import { U } from '../../env.js';
import { mulberry } from '../../util.js';
import { STALLS } from './street2.js';
import { clutSnap, clutGrab } from './clutcap.js'; // b_clutter

// r6.3 hanging light-box sign faces: 4x4 atlas of invented, Chinese-style stroke glyphs (original, procedurally drawn; no real
// characters or brands). Light background in the vertex (neon) colour, darker glyph strokes; night emissive like 'neon'.
const SIGN_CELLS = 4;
function signAtlas() {
  const N = 512, C = N / SIGN_CELLS; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const r = mulberry(7321);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, N, N);
  for (let cy = 0; cy < SIGN_CELLS; cy++) for (let cx = 0; cx < SIGN_CELLS; cx++) {
    const x0 = cx * C, y0 = cy * C; g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.strokeRect(x0 + 6, y0 + 6, C - 12, C - 12);
    const ng = 1 + ((cx + cy) % 2); // 1 or 2 glyphs per cell (side by side)
    for (let k = 0; k < ng; k++) {
      const gw = (C - 28) / ng, gx = x0 + 14 + k * gw + gw * 0.12, gy = y0 + 18, sw = gw * 0.76, sh = C - 36;
      g.lineCap = 'square'; g.lineWidth = Math.max(5, sw * 0.09);
      const st = 4 + Math.floor(r() * 5);
      for (let i = 0; i < st; i++) {
        const t = r(); g.beginPath();
        if (t < 0.4) { const yy = gy + sh * (0.1 + 0.8 * r()); const a = r() * 0.4, b = 0.6 + r() * 0.4; g.moveTo(gx + sw * a, yy); g.lineTo(gx + sw * b, yy); }
        else if (t < 0.7) { const xx = gx + sw * (0.1 + 0.8 * r()); const a = r() * 0.35, b = 0.65 + r() * 0.35; g.moveTo(xx, gy + sh * a); g.lineTo(xx, gy + sh * b); }
        else if (t < 0.85) { const xa = gx + sw * r() * 0.5, ya = gy + sh * (0.3 + r() * 0.3); g.moveTo(xa, ya); g.lineTo(xa + sw * (0.25 + r() * 0.3), ya + sh * (0.25 + r() * 0.3) * (r() < 0.5 ? 1 : -1)); }
        else { const xa = gx + sw * (0.15 + r() * 0.35), ya = gy + sh * (0.15 + r() * 0.4), bw = sw * (0.3 + r() * 0.3), bh = sh * (0.2 + r() * 0.25); g.rect(xa, ya, bw, bh); }
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let SIGN_MAT = null; const SIGN_G = [];
export function signFaceMat() {
  if (SIGN_MAT) return SIGN_MAT;
  SIGN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, color: 0x222222 });
  SIGN_MAT.onBeforeCompile = (s) => { s.uniforms.uNight = U.uNight; s.uniforms.tSign = { value: signAtlas() };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform sampler2D tSign; varying vec2 vSUv;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat sgM = texture2D(tSign, vSUv).r; totalEmissiveRadiance += vColor.rgb * mix(0.12, 1.0, sgM) * (0.25 + uNight * 5.0);'); };
  SIGN_MAT.customProgramCacheKey = () => 'signface';
  return SIGN_MAT;
}
// unit plane (facing +z) mapped to atlas cell k
function signPlane(k) {
  if (SIGN_G[k]) return SIGN_G[k];
  const g = new THREE.PlaneGeometry(1, 1); const u0 = (k % SIGN_CELLS) / SIGN_CELLS, v0 = 1 - (Math.floor(k / SIGN_CELLS) + 1) / SIGN_CELLS, d = 1 / SIGN_CELLS;
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * d, v0 + uv.getY(i) * d);
  return (SIGN_G[k] = g);
}

const V3 = (F, a, d, y) => { const q = F.P(a, d); return [q[0], y, q[1]]; };
const VV = (F, a, d, y) => { const q = F.P(a, d); return new THREE.Vector3(q[0], y, q[1]); };
const UVQ = [0, 0, 1, 0, 1, 1, 0, 1];
// quad with a vertical colour gradient: a, b bottom (along +a), c, d top
export function gquad(v, a, b, c, d, cBot, cTop) {
  v.quad(a, b, c, d, UVQ, {}, cBot); const n = v.c.length; // patch the two top corners
  v.c[n - 6] = cTop[0]; v.c[n - 5] = cTop[1]; v.c[n - 4] = cTop[2]; v.c[n - 3] = cTop[0]; v.c[n - 2] = cTop[1]; v.c[n - 1] = cTop[2];
}
// a stain running down the facade from y1 to y0 at a (width w): darkest at the top (source), fading into the wall colour
export function streak(v, F, a, y0, y1, w, wall, dark = 0.55, tint = null, d = 0.025) {
  const top = tint || wall.map((q) => q * dark); const bot = wall.map((q) => q * 0.96);
  const ym = y1 - (y1 - y0) * 0.35; const mid = top.map((q, i) => q * 0.6 + bot[i] * 0.4);
  const w2 = w * rand(0.55, 0.85); // tapers toward the bottom
  gquad(v, VV(F, a - w2 / 2, d, y0), VV(F, a + w2 / 2, d, y0), VV(F, a + w / 2, d, ym), VV(F, a - w / 2, d, ym), bot, mid);
  gquad(v, VV(F, a - w / 2, d, ym), VV(F, a + w / 2, d, ym), VV(F, a + w * 0.4, d, y1), VV(F, a - w * 0.4, d, y1), mid, top);
}
// grime pass over one facade [0, F.len] between yb (top of the shop band) and yt (roof): run-off under the parapet, a few long
// water stains, rust streaks under given bracket positions [{a, y}], plus mottled damp patches near the foot of the upper wall
export function grime(W, F, yb, yt, wall, brackets = [], opts = {}) {
  const v = W.b('vcolD', F.P(F.len / 2, 0)[0], F.P(F.len / 2, 0)[1]);
  const L = F.len; if (L < 4) return;
  // relief walls (style 2): stains run down the piers in front of the punched windows (piers stand 0.24 m proud at a = k * cw)
  const cw = opts.cw; const d = cw ? 0.255 : 0.025; const wMax = cw ? cw * 0.36 : 9;
  const snap = (a, w) => { if (cw) a = Math.round(a / cw) * cw; return Math.min(L - w / 2, Math.max(w / 2, a)); };
  const S = (a, y0, y1, w, dark, tint, dd) => { w = Math.min(w, wMax); streak(v, F, snap(a, w), y0, y1, w, wall, dark, tint, dd ?? d); };
  // parapet run-off: a row of overlapping short streaks under the roof line
  const n = cw ? Math.round(L / cw) + 1 : Math.max(2, Math.round(L / rand(1.6, 2.6)));
  for (let i = 0; i < n; i++) { if (cw && rng() < 0.25) continue; const a = cw ? i * cw : (i + rand(0.2, 0.8)) * (L / n); const len = rand(0.8, 3.2) * (opts.k ?? 1); S(a, yt - 0.3 - len, yt - 0.35, rand(0.5, 1.4), rand(0.5, 0.7), null, cw ? 0.27 : d); }
  // long stains from failed gutters / overflow pipes
  const nl = randi(1, Math.max(2, Math.round(L / 7)));
  for (let i = 0; i < nl; i++) { const a = rand(0.6, L - 0.6); const y1 = rand(yb + (yt - yb) * 0.4, yt - 0.4); S(a, Math.max(yb + 0.2, y1 - rand(4, 12)), y1, rand(0.35, 0.9), rand(0.42, 0.6)); }
  // rust / drip under brackets (AC units, balconies, fire escape)
  for (const b of brackets) if (rng() < (b.p ?? 0.7)) { const len = rand(1.2, 3.6); const rust = rng() < (b.rust ?? 0.35);
    S(b.a + rand(-0.2, 0.2), Math.max(yb + 0.1, b.y - len), b.y, rand(0.14, 0.35), 0.56, rust ? RUST.map((q, i) => q * 0.75 + wall[i] * 0.25) : null, cw ? 0.265 : 0.03); }
  // damp band above the shop band (plain walls only; relief walls get the foot darkening from the vcol material)
  if (!cw) { const dampTop = yb + rand(0.6, 1.4); const wd = wall.map((q) => q * 0.72);
    gquad(v, VV(F, 0, 0.02, yb), VV(F, L, 0.02, yb), VV(F, L, 0.02, dampTop), VV(F, 0, 0.02, dampTop), wd, wall.map((q) => q * 0.97)); }
}


// --------------------------------------------------------------- sidewalk ----
const BAGC = [[0.05, 0.05, 0.055], [0.07, 0.08, 0.07], [0.12, 0.18, 0.12], [0.1, 0.13, 0.22], [0.6, 0.6, 0.58], [0.04, 0.04, 0.045]];
export function trashPile(W, F, a, d, y0, cap = null) {
  const c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]); const G = kg(); const k = randi(3, 7);
  for (let i = 0; i < k; i++) { const p = V3(F, a + rand(-0.8, 0.8), d + rand(-0.35, 0.35), 0); const s = rand(0.26, 0.42); const h = s * rand(0.75, 1.0);
    put(c, G.ball, p[0], y0 + h * 0.8 + (i > 3 ? 0.3 : 0), p[2], s, h, s * rand(0.85, 1.1), pick(BAGC), rand(0, 3));
    if (rng() < 0.35) put(c, G.ball, p[0], y0 + h * 1.65 + (i > 3 ? 0.3 : 0), p[2], 0.07, 0.1, 0.07, pick(BAGC)); } // tied neck
  if (rng() < 0.6) { const p = V3(F, a + rand(-1.2, 1.2), d + rand(-0.3, 0.4), 0); put(c, G.box, p[0], y0 + 0.02, p[2], rand(0.5, 0.9), 0.03, rand(0.4, 0.7), [0.5, 0.4, 0.27], rand(0, 3)); } // flattened carton
  if (rng() < 0.5) { if (cap) cap.s = clutSnap(W); const p = V3(F, a + rand(-1, 1), d + rand(-0.3, 0.3), 0); const s = rand(0.3, 0.45); put(c, G.box, p[0], y0 + s / 2, p[2], s * 1.3, s, s, [0.58, 0.45, 0.3], Math.atan2(F.ox, F.oz) + rand(-0.5, 0.5)); } // b_clutter: cap.s marks the standing carton (its own collider; bags are soft)
}
export function wheelieBin(W, F, a, d, y0) {
  const c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]); const G = kg(); const col = pick([[0.12, 0.3, 0.14], [0.15, 0.17, 0.2], [0.55, 0.38, 0.08], [0.15, 0.25, 0.45]]); const ang = Math.atan2(F.ox, F.oz) + rand(-0.3, 0.3);
  const p = V3(F, a, d, 0); put(c, G.box, p[0], y0 + 0.5, p[2], 0.62, 1.0, 0.72, col, ang);
  put(c, G.box, p[0], y0 + 1.04, p[2], 0.68, 0.06, 0.8, col.map((q) => q * 0.8), ang + rand(-0.05, 0.05));
  for (const s of [-1, 1]) { const w = V3(F, a + s * 0.25, d - 0.3, 0); put(c, G.cyl8, w[0], y0 + 0.1, w[2], 0.1, 0.06, 0.1, DARK); }
}
export function crates(W, F, a, d, y0) {
  const c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]); const G = kg(); const ang = Math.atan2(F.ox, F.oz);
  if (rng() < 0.5) { const p = V3(F, a, d, 0); put(c, G.box, p[0], y0 + 0.07, p[2], 1.2, 0.14, 1.0, [0.55, 0.42, 0.26], ang); } // pallet
  const cc = pick([[0.15, 0.35, 0.6], [0.7, 0.2, 0.15], [0.85, 0.65, 0.1], [0.2, 0.5, 0.3], [0.5, 0.36, 0.22]]); const k = randi(2, 6);
  for (let i = 0; i < k; i++) { const p = V3(F, a + (i % 2 - 0.5) * 0.56, d + (Math.floor(i / 2) % 2 - 0.5) * 0.4, 0); put(c, G.box, p[0], y0 + 0.31 + Math.floor(i / 4) * 0.32, p[2], 0.52, 0.3, 0.38, rng() < 0.75 ? cc : pick([[0.15, 0.35, 0.6], [0.7, 0.2, 0.15]]), ang + rand(-0.12, 0.12)); }
}
export function gasBottles(W, F, a, d, y0) {
  const c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]); const G = kg(); const col = pick([[0.15, 0.3, 0.6], [0.9, 0.45, 0.1], [0.75, 0.75, 0.72], [0.55, 0.12, 0.1]]);
  for (let i = 0; i < randi(1, 4); i++) { const p = V3(F, a + i * 0.4, d + rand(-0.1, 0.1), 0); put(c, G.cyl8, p[0], y0 + 0.45, p[2], 0.16, 0.9, 0.16, col); put(c, G.cyl8, p[0], y0 + 0.95, p[2], 0.06, 0.12, 0.06, STEEL); }
}
// puddle: an irregular flat blob on the pavement in the glossy 'puddle' material (reflects the sky / neon)
export function puddle(W, F, a, d, y, r) {
  const q = F.P(a, d); const b = W.b('puddle', q[0], q[1]); const n = 10; const pts = []; const sx = rand(0.8, 1.6), ph = rand(0, 6);
  for (let i = 0; i < n; i++) { const t = -(i / n) * Math.PI * 2; const rr = r * (0.7 + 0.3 * Math.sin(t * 3 + ph) * 0.5 + rand(0, 0.25)); const lx = Math.cos(t) * rr * sx, ld = Math.sin(t) * rr; pts.push(F.P(a + lx, d + ld)); }
  // polyCap wants CCW seen from above (rect order); flip if needed via signed area
  let A = 0; for (let i = 0; i < n; i++) { const p = pts[i], o = pts[(i + 1) % n]; A += p[0] * o[1] - o[0] * p[1]; } if (A > 0) pts.reverse();
  polyCap(b, pts, y, {}, [0.03, 0.035, 0.04]);
}
// low pipes / conduits running along the facade foot (exposed services)
export function groundPipes(W, F, a0, a1, y0) {
  const c = W.b('vcolD', F.P(a0, 0)[0], F.P(a0, 0)[1]); const k = randi(1, 3); const col = pick([[0.3, 0.3, 0.3], [0.5, 0.5, 0.48], [0.45, 0.3, 0.2], [0.6, 0.55, 0.15]]);
  for (let i = 0; i < k; i++) { const y = y0 + 0.25 + i * 0.22; tube(c, V3(F, a0, 0.16 + i * 0.05, y), V3(F, a1, 0.16 + i * 0.05, y), 0.05 + i * 0.015, i === 1 ? RUST : col);
    for (let a = a0 + 0.6; a < a1; a += 2.2) put(c, kg().box, ...V3(F, a, 0.1, y), 0.08, 0.14, 0.2, DARK); }
}
// street food stall: wheeled cart, steel counter, fabric canopy on 4 poles, lanterns, menu light box, stools, steaming pot
export function foodStall(W, F, a, d, y0) {
  const v = W.b('vcol', F.P(a, d)[0], F.P(a, d)[1]), c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]), nb = W.b('neon', F.P(a, d)[0], F.P(a, d)[1]); const G = kg();
  const ang = Math.atan2(F.ox, F.oz); const body = pick([[0.7, 0.12, 0.1], [0.12, 0.3, 0.55], [0.85, 0.6, 0.12], [0.2, 0.22, 0.24], [0.2, 0.45, 0.35]]);
  const L = rand(1.8, 2.4), D = 0.9;
  const P = (u, w, y) => V3(F, a + u, d + w, y);
  const cb = P(0, 0, y0 + 0.5); put(v, G.box, cb[0], cb[1], cb[2], L, 0.8, D, body, ang); // cart body (long side along the street)
  const ct = P(0, 0.05, y0 + 0.93); put(v, G.box, ct[0], ct[1], ct[2], L + 0.15, 0.06, D + 0.2, [0.7, 0.72, 0.74], ang); // steel top
  for (const s of [-1, 1]) { const w = P(s * (L / 2 - 0.25), -D / 2 - 0.02, y0 + 0.2); put(c, G.cyl8, w[0], w[1], w[2], 0.2, 0.08, 0.2, DARK); }
  // canopy on 4 poles, sloped toward the kerb
  const yc = y0 + 2.3; for (const [u, w] of [[-L / 2, -D / 2], [L / 2, -D / 2], [-L / 2, D / 2 + 0.3], [L / 2, D / 2 + 0.3]]) beam(v, P(u, w, y0 + 0.9), P(u, w, yc + (w < 0 ? 0.15 : 0)), 0.04, STEEL);
  const cc = pick([[0.75, 0.15, 0.15], [0.9, 0.75, 0.2], [0.15, 0.4, 0.55], [0.85, 0.85, 0.82], [0.3, 0.55, 0.3]]);
  const q = (u, w, y) => VV(F, a + u, d + w, y);
  v.quad(q(-L / 2 - 0.2, -D / 2 - 0.3, yc + 0.2), q(L / 2 + 0.2, -D / 2 - 0.3, yc + 0.2), q(L / 2 + 0.2, D / 2 + 0.7, yc - 0.1), q(-L / 2 - 0.2, D / 2 + 0.7, yc - 0.1), UVQ, {}, cc);
  v.quad(q(-L / 2 - 0.2, D / 2 + 0.7, yc - 0.12), q(L / 2 + 0.2, D / 2 + 0.7, yc - 0.12), q(L / 2 + 0.2, -D / 2 - 0.3, yc + 0.18), q(-L / 2 - 0.2, -D / 2 - 0.3, yc + 0.18), UVQ, {}, cc.map((x) => x * 0.55));
  v.quad(q(-L / 2 - 0.2, D / 2 + 0.7, yc - 0.4), q(L / 2 + 0.2, D / 2 + 0.7, yc - 0.4), q(L / 2 + 0.2, D / 2 + 0.7, yc - 0.1), q(-L / 2 - 0.2, D / 2 + 0.7, yc - 0.1), UVQ, {}, cc.map((x) => x * 0.85)); // valance
  // lanterns hanging from the canopy edge + a menu light box over the counter
  const lc = pick([[1.0, 0.25, 0.12], [1.0, 0.6, 0.15], [1.0, 0.85, 0.5]]);
  for (let i = 0; i < randi(2, 4); i++) { const u = -L / 2 + (L * (i + 0.5)) / 4; const p = P(u, D / 2 + 0.6, yc - 0.65); tube(c, P(u, D / 2 + 0.6, yc - 0.1), p, 0.008, DARK, kg().tube4); put(nb, G.ball, p[0], p[1] - 0.16, p[2], 0.15, 0.2, 0.15, lc.map((x) => x * 0.3)); }
  const mb = P(0, -D / 2 + 0.05, yc - 0.45); put(nb, G.box, mb[0], mb[1], mb[2], L * 0.8, 0.35, 0.04, pick(NEONC).map((x) => x * 0.18 + 0.03), ang);
  // pot + wok + stools on the kerb side
  const pp = P(-L * 0.25, 0, y0 + 1.1); put(c, G.cyl12, pp[0], pp[1], pp[2], 0.22, 0.3, 0.22, [0.62, 0.63, 0.64]);
  const wk = P(L * 0.2, 0.05, y0 + 1.0); put(c, G.cyl12, wk[0], wk[1], wk[2], 0.28, 0.06, 0.28, [0.12, 0.12, 0.12]);
  for (let i = 0; i < randi(2, 4); i++) { const s = P(-L / 2 + 0.35 + i * 0.6, D / 2 + 0.55, 0); put(c, G.cyl8, s[0], y0 + 0.23, s[2], 0.16, 0.46, 0.16, pick([[0.75, 0.15, 0.15], [0.15, 0.35, 0.6], [0.85, 0.85, 0.8]])); }
  if (rng() < 0.6) { const g = P(L / 2 + 0.35, -0.2, 0); put(c, G.cyl8, g[0], y0 + 0.4, g[2], 0.15, 0.8, 0.15, [0.15, 0.3, 0.6]); }
}
// cafe / noodle-bar umbrella table with plastic stools
export function umbrellaTable(W, F, a, d, y0) {
  const v = W.b('vcol', F.P(a, d)[0], F.P(a, d)[1]), c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]); const G = kg(); const p = V3(F, a, d, 0);
  put(c, G.cyl12, p[0], y0 + 0.72, p[2], 0.42, 0.04, 0.42, [0.85, 0.85, 0.82]); put(c, G.cyl8, p[0], y0 + 0.36, p[2], 0.04, 0.72, 0.04, STEEL);
  put(v, G.cyl8, p[0], y0 + 1.25, p[2], 0.025, 2.5, 0.025, STEEL);
  const uc = pick([[0.8, 0.15, 0.15], [0.15, 0.35, 0.6], [0.9, 0.7, 0.15], [0.2, 0.5, 0.35], [0.85, 0.85, 0.82], [0.45, 0.2, 0.55]]);
  put(v, umbG(), p[0], y0 + 2.3, p[2], 1.0, 1.0, 1.0, uc, rand(0, 3));
  for (let i = 0; i < randi(2, 4); i++) { const t = i * 1.7 + rand(0, 0.5); put(c, G.cyl8, p[0] + Math.cos(t) * 0.7, y0 + 0.22, p[2] + Math.sin(t) * 0.7, 0.17, 0.44, 0.17, pick([[0.75, 0.15, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.3], [0.85, 0.85, 0.8]])); }
}
let _umb = null; function umbG() { if (_umb) return _umb; const g = new THREE.ConeGeometry(1.3, 0.45, 8, 1, true); g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); _umb = g.toNonIndexed(); _umb.computeVertexNormals(); return _umb; }
// light-box sign hanging from a wall arm at height y (perpendicular to the facade), lit both faces
export function hangingSign(W, F, a, y, opts = {}) {
  const v = W.b('vcol', F.P(a, 0)[0], F.P(a, 0)[1]), nb = W.b('neon', F.P(a, 0)[0], F.P(a, 0)[1]); const G = kg();
  const out = opts.out ?? rand(0.9, 1.4), w = opts.w ?? rand(0.7, 1.1), h = opts.h ?? rand(0.45, 0.9);
  beam(v, V3(F, a, 0.05, y + 0.1), V3(F, a, out + w + 0.1, y + 0.1), 0.05, DARK); beam(v, V3(F, a, 0.05, y - 0.55), V3(F, a, out * 0.6, y + 0.08), 0.03, DARK);
  for (const t of [out + 0.1, out + w - 0.1]) tube(v, V3(F, a, t, y + 0.1), V3(F, a, t, y - 0.12), 0.008, DARK, kg().tube4);
  const c = V3(F, a, out + w / 2, y - 0.12 - h / 2); const ang = Math.atan2(F.ox, F.oz) + Math.PI / 2;
  put(v, G.box, c[0], c[1], c[2], w + 0.08, h + 0.08, 0.14, [0.08, 0.08, 0.09], ang);
  const lc = (opts.col || pick(NEONC)).map((x) => x * 0.17 + 0.012);
  const sb = W.b('signface', c[0], c[2]); const cell = randi(0, SIGN_CELLS * SIGN_CELLS - 1);
  const fz = Math.sin(ang) * F.dx + Math.cos(ang) * F.dz; // plane normal (sin ang, cos ang) vs facade direction
  for (const s of [-1, 1]) { const f = [c[0] + F.dx * s * 0.076, c[1], c[2] + F.dz * s * 0.076]; put(sb, signPlane(cell), f[0], f[1], f[2], w, h, 1, lc, s * fz > 0 ? ang : ang + Math.PI); }
}
// laundry line between two facade points (world 3-vectors) with clothes pegged along it
export function laundryLine(W, A, B, sag = 0.3) {
  const v = W.b('vcolD', A[0], A[2]), cl = W.b('vcolD', A[0], A[2]); const G = kg();
  cable(v, A, B, sag, 0.008, [0.8, 0.8, 0.78], 8);
  const L = Math.hypot(B[0] - A[0], B[2] - A[2]); const ux = (B[0] - A[0]) / L, uz = (B[2] - A[2]) / L; const ang = Math.atan2(-uz, ux); const n = Math.floor(L / 0.7);
  for (let i = 1; i < n; i++) { if (rng() < 0.35) continue; const t = i / n + rand(-0.02, 0.02); const y = A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t);
    const w = rand(0.25, 0.5), h = rand(0.3, 0.7); const x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t;
    put(cl, G.box, x, y - h / 2, z, w, h, 0.02, pick([[0.88, 0.88, 0.85], [0.2, 0.3, 0.6], [0.7, 0.2, 0.25], [0.95, 0.75, 0.2], [0.3, 0.3, 0.32], [0.55, 0.7, 0.85], [0.85, 0.5, 0.6], [0.25, 0.5, 0.35]]), ang); }
}

// One bay-run of sidewalk dressing in front of a shop frontage F (a ∈ [0, F.len], outward d): picks a mix weighted by `grit`
// (0 clean commercial .. 1 tenement back street). Puddles everywhere (wet city), food stalls / umbrella tables on wider runs.
export function sidewalk(W, F, y0, grit = 0.5, opts = {}) {
  const L = F.len; if (L < 5) return; const yP = y0 + 0.012; const lg = opts.log; // b_signsync: footprints (a span, d span) for storefront.js
  let a = rand(0.8, 2.5);
  // b_clutter: each item group is bracketed (clutSnap … grab): clutcap.js fits its collider footprint and, on a streamed lot, moves
  // a group that overruns the kerb / stands on a lamp or palm back toward the facade (or hides it when there is no room); the
  // storefront.js footprint log entries of the group follow the move. No rng use.
  const grab = (s0, n0, k, cap) => { const r = clutGrab(W, s0, F, y0, k); if (r && r.hid) lg.length = n0; else if (r && (r.sh || r.sa)) for (let i = n0; i < lg.length; i++) { lg[i].d0 -= r.sh; lg[i].d1 -= r.sh; lg[i].a0 += r.sa; lg[i].a1 += r.sa; } // b_genfit: + slide along
    if (cap && cap.s && !(r && r.hid)) clutGrab(W, cap.s, F, y0, 'carton', true); return r; };
  while (a < L - 1.2) {
    const r = rng(); const s0 = lg && clutSnap(W), n0 = lg ? lg.length : 0;
    if (r < 0.16 * grit + 0.04) { const cap = lg ? {} : null; const d = rand(0.5, 0.9); trashPile(W, F, a, d, y0, cap); lg && lg.push({ k: 'trash', a0: a - 1.0, a1: a + 1.0, d0: d - 0.45, d1: d + 0.5 }); if (lg) grab(s0, n0, 'trash', cap); a += rand(2.5, 5); }
    else if (r < 0.26 * grit + 0.07) { const d = rand(0.55, 0.8); wheelieBin(W, F, a, d, y0); lg && lg.push({ k: 'bin', a0: a - 0.42, a1: a + 0.42, d0: d - 0.45, d1: d + 0.45 });
      if (rng() < 0.6) { const d2 = rand(0.55, 0.8); wheelieBin(W, F, a + 0.75, d2, y0); lg && lg.push({ k: 'bin', a0: a + 0.33, a1: a + 1.17, d0: d2 - 0.45, d1: d2 + 0.45 }); } if (lg) grab(s0, n0, 'bin'); a += rand(3, 6); }
    else if (r < 0.36 * grit + 0.1) { const d = rand(0.6, 1.0); crates(W, F, a, d, y0); lg && lg.push({ k: 'crates', a0: a - 0.65, a1: a + 0.65, d0: d - 0.5, d1: d + 0.5 }); if (lg) grab(s0, n0, 'crates'); a += rand(3, 6); }
    else if (r < 0.4 * grit + 0.12) { gasBottles(W, F, a, 0.45, y0); lg && lg.push({ k: 'gas', a0: a - 0.1, a1: a + 1.3, d0: 0.25, d1: 0.65 }); if (lg) grab(s0, n0, 'gas'); a += rand(2, 4); }
    else if (r < 0.52 && opts.stalls !== false && L > 10) { const f = rng() < 0.3 ? foodStall : pick(STALLS); const as = Math.min(L - 1.6, a + 1.2), d = rand(2.0, 2.6); f(W, F, as, d, y0); lg && lg.push({ k: 'stall', a0: as - 1.75, a1: as + 1.75, d0: d - 0.7, d1: d + 1.3 }); if (lg) grab(s0, n0, 'stall'); a += rand(6, 10); } // r6.4: + 面摊 / 烧烤 / 维修摊 (street2.js)
    else if (r < 0.62 && opts.tables !== false) { const d = rand(1.8, 2.6); umbrellaTable(W, F, a + 0.8, d, y0); lg && lg.push({ k: 'table', a0: a - 0.1, a1: a + 1.7, d0: d - 0.9, d1: d + 0.9 }); if (lg) grab(s0, n0, 'table'); a += rand(4, 7); }
    else a += rand(2, 5);
  }
  const np = Math.round(L / rand(6, 12)); for (let i = 0; i < np; i++) puddle(W, F, rand(1, L - 1), rand(1.0, 3.4), yP + i * 0.0005, rand(0.4, 1.3));
  if (grit > 0.4 && rng() < 0.7) { const a0 = rand(0, L * 0.4); groundPipes(W, F, a0, Math.min(L, a0 + rand(4, 12)), y0); }
}
void prismWalls;
