// r6.4 b_tower2 霓港 tower crowns & roof plant (megatower tops, near) + cheap crown silhouettes on the far impostors.
//  * crownKind(seed): one choice per parcel seed shared by the near megatower and its far impostor, so the crown does not change
//    when a chunk streams in (heli / mast / bill / screen / spire).
//  * near (arch.js megatower, parcel frame, street facade at +x): roof plant deck (parapet, machine room with louvre doors + caged
//    ladder + roof rail, cooling-tower bank with fan stacks, water tank on braced legs, pipe runs on sleepers, condenser grid),
//    a stepped fin-screen crown (退台轮廓), a rooftop billboard on a steel lattice with catwalk + lamp arms, mast ladder / rest
//    platforms / guy wires, aviation lights (red steady on corners, white strobe on the highest point).
//  * LOD: masses go to 'vcol', small parts (louvres, rungs, rails, fan blades, sleepers, braces) to 'vcolD' which bldglayer.js
//    hides beyond DETAIL_R; far impostors get a handful of boxes + 'neon' light points per tower. No new materials / programs:
//    everything is vertex-coloured into the existing 'vcol' / 'neon' buckets.
import * as THREE from 'three';
import { box, polyCap, prismWalls } from '../../geo.js';
import { rng, rand, randi, pick } from '../../util.js';
import { kg, beam, tube, put, NEONC, DARK, STEEL } from './kit.js';

export const RED = [1, 0.09, 0.06], STROBE = [1, 0.97, 0.9];
const LSTEEL = [0.55, 0.57, 0.6], YEL = [0.9, 0.7, 0.12], GRATE = [0.3, 0.31, 0.32];
const PLANT = [[0.62, 0.64, 0.63], [0.46, 0.53, 0.5], [0.7, 0.68, 0.62], [0.38, 0.42, 0.47]];

// deterministic crown choice per parcel seed (independent of the generator rng stream)
export function crownKind(seed) {
  const h = (Math.imul(seed >>> 0, 2654435761) >>> 0) / 4294967296;
  return h < 0.32 ? 'heli' : h < 0.56 ? 'mast' : h < 0.75 ? 'bill' : h < 0.88 ? 'screen' : 'spire';
}

// approximate top-tier half extents of the megatower built on a parcel (pw = p.d along the facing, pd = p.w; 3–5 m setbacks)
// -> [tx, tz, worst-case min]; the near tower and the far impostor both gate the helipad on the worst case so they agree
export function topEst(d, w, tall) { const nT = tall > 150 ? 4 : 3; const a = Math.min(d - 7, 46) / 2, b = Math.min(w - 7, 46) / 2; return [a - (nT - 1) * 4, b - (nT - 1) * 4, Math.min(a, b) - (nT - 1) * 5]; }
export const HELI_MIN = 6.5;

// ------------------------------------------------------------------ small kit ----
// vertical ladder at (x, z) from y0 to y1, rungs along (sx, sz); cage hoops above 2.4 m when cage
export function ladder(d, x, z, y0, y1, sx, sz, cage = false, ox = 0, oz = 0) {
  const hw = 0.23; const G = kg();
  for (const s of [-1, 1]) beam(d, [x + sx * hw * s, y0, z + sz * hw * s], [x + sx * hw * s, y1 + 1.0, z + sz * hw * s], 0.05, LSTEEL, null, G.tube4);
  const step = y1 - y0 > 12 ? 0.45 : 0.32;
  for (let y = y0 + 0.3; y < y1 + 0.1; y += step) beam(d, [x - sx * hw, y, z - sz * hw], [x + sx * hw, y, z + sz * hw], 0.03, LSTEEL);
  if (cage && y1 - y0 > 3) for (let y = y0 + 2.4; y < y1 + 0.9; y += 1.0) { // U hoops (three straight bars) out from the wall along (ox, oz)
    const a = [x - sx * 0.36, y, z - sz * 0.36], b = [x + sx * 0.36, y, z + sz * 0.36];
    const a2 = [a[0] + ox * 0.72, y, a[2] + oz * 0.72], b2 = [b[0] + ox * 0.72, y, b[2] + oz * 0.72];
    beam(d, a, a2, 0.04, LSTEEL); beam(d, b, b2, 0.04, LSTEEL); beam(d, a2, b2, 0.04, LSTEEL);
  }
}
// guard rail around a rectangle at y (posts + top + knee rail)
export function railRect(d, x0, z0, x1, z1, y, h = 1.05, col = YEL) {
  const C = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 1.8));
    for (const yy of [h, h * 0.5]) beam(d, [a[0], y + yy, a[1]], [b[0], y + yy, b[1]], 0.05, col);
    for (let k = 0; k < n; k++) { const t = k / n; const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t; beam(d, [px, y, pz], [px, y + h, pz], 0.05, col); } }
}
// cooling tower cell: casing, louvre bands, fan stack with dark opening, fan blades
function coolingTower(v, d, x, y, z, w, h, col) {
  const G = kg(); const hw = w / 2; const slat = col.map((q) => q * 0.55);
  box(v, x - hw, y, z - hw, x + hw, y + h, z + hw, {}, col);
  for (let yy = y + 0.35; yy < y + h * 0.62; yy += 0.3) {
    put(d, G.box, x, yy, z + hw + 0.05, w * 0.9, 0.07, 0.1, slat); put(d, G.box, x, yy, z - hw - 0.05, w * 0.9, 0.07, 0.1, slat);
    put(d, G.box, x + hw + 0.05, yy, z, 0.1, 0.07, w * 0.9, slat); put(d, G.box, x - hw - 0.05, yy, z, 0.1, 0.07, w * 0.9, slat); }
  put(v, G.cyl12, x, y + h + 0.55, z, hw * 0.86, 1.1, hw * 0.86, col.map((q) => q * 0.92));
  put(v, G.cyl12, x, y + h + 1.11, z, hw * 0.78, 0.02, hw * 0.78, [0.06, 0.065, 0.07]);
  put(d, G.cyl8, x, y + h + 1.0, z, 0.22, 0.2, 0.22, DARK); const r0 = rand(0, 3);
  for (let k = 0; k < 3; k++) put(d, G.box, x, y + h + 1.02, z, hw * 1.45, 0.03, 0.28, [0.2, 0.21, 0.22], r0 + k * Math.PI / 3);
  // fan guard ring
  for (let k = 0; k < 4; k++) put(d, G.box, x, y + h + 1.16, z, hw * 1.6, 0.03, 0.04, LSTEEL, k * Math.PI / 4);
}
// water tank on four braced legs + hoops + conical lid + ladder
function waterTank(v, d, x, y, z, r, th, legH) {
  const G = kg(); const col = pick([[0.78, 0.79, 0.8], [0.52, 0.4, 0.3], [0.6, 0.66, 0.62]]);
  const L = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + a * r * 0.68, z + b * r * 0.68]);
  for (const [lx, lz] of L) beam(v, [lx, y, lz], [lx, y + legH, lz], 0.18, DARK);
  for (let i = 0; i < 4; i++) { const a = L[i], b = L[(i + 1) % 4]; beam(d, [a[0], y + 0.2, a[1]], [b[0], y + legH - 0.1, b[1]], 0.06, DARK); beam(d, [b[0], y + 0.2, b[1]], [a[0], y + legH - 0.1, a[1]], 0.06, DARK); }
  put(v, G.box, x, y + legH, z, r * 1.6, 0.18, r * 1.6, DARK);
  put(v, G.cyl12, x, y + legH + th / 2 + 0.1, z, r, th, r, col);
  for (let k = 1; k < 4; k++) put(d, G.cyl12, x, y + legH + 0.1 + (th * k) / 4, z, r + 0.03, 0.08, r + 0.03, DARK);
  if (!_cone) { _cone = new THREE.ConeGeometry(1, 1, 12, 1); _cone.deleteAttribute('uv'); _cone.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(_cone.attributes.position.count * 2), 2)); }
  put(v, _cone, x, y + legH + th + 0.1 + 0.4, z, r * 1.05, 0.8, r * 1.05, col.map((q) => q * 0.7));
  ladder(d, x + r + 0.08, z, y, y + legH + th, 0, 1);
}
let _cone = null;
// pipe run along a polyline at height y on sleepers (2–3 parallel pipes), vertical drops at both ends
function pipeRun(v, d, pts, y, n, col, yr) {
  const G = kg();
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; const sx = -uz, sz = ux;
    for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 0.42; tube(v, [a[0] + sx * o - ux * 0.2, y, a[1] + sz * o - uz * 0.2], [b[0] + sx * o + ux * 0.2, y, b[1] + sz * o + uz * 0.2], k === 0 ? 0.17 : 0.12, k === 1 ? [0.7, 0.55, 0.15] : col, G.tube6); }
    for (let t = 1; t < L; t += 3) { const px = a[0] + ux * t, pz = a[1] + uz * t; beam(d, [px - sx * n * 0.3, y - 0.25, pz - sz * n * 0.3], [px + sx * n * 0.3, y - 0.25, pz + sz * n * 0.3], 0.14, DARK, 0.14);
      put(d, G.box, px, (yr + y - 0.32) / 2, pz, 0.12, y - 0.32 - yr, 0.12, DARK); } }
}

// ------------------------------------------------------------ roof plant deck ----
// fills the top roof [X0..X1]x[Z0..Z1] at y with plant, avoiding the excl rects ([a0, b0, a1, b1]); parapet included
export function plantDeck(W, X0, Z0, X1, Z1, y, excl = [], opt = {}) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; const v = W.b('vcol', cx, cz), d = W.b('vcolD', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  const conc = [0.6, 0.6, 0.58], cap = [0.75, 0.74, 0.71]; const t = 0.35, ph = 1.2;
  for (const [a0, b0, a1, b1] of [[X0, Z0, X1, Z0 + t], [X0, Z1 - t, X1, Z1], [X0, Z0, X0 + t, Z1], [X1 - t, Z0, X1, Z1]]) { box(v, a0, y, b0, a1, y + ph, b1, {}, conc); box(v, a0 - 0.06, y + ph, b0 - 0.06, a1 + 0.06, y + ph + 0.12, b1 + 0.06, {}, cap); }
  if (opt.parapetOnly) return;
  const used = excl.slice();
  const free = (a0, b0, a1, b1) => a0 > X0 + 0.8 && a1 < X1 - 0.8 && b0 > Z0 + 0.8 && b1 < Z1 - 0.8 && !used.some((u) => a0 < u[2] && a1 > u[0] && b0 < u[3] && b1 > u[1]);
  const place = (w, dd, pref) => { for (let i = 0; i < 16; i++) { const a = pref && i < 6 ? pref[0] + rand(-1.5, 1.5) : rand(X0 + 1, X1 - 1 - w), c = pref && i < 6 ? pref[1] + rand(-1.5, 1.5) : rand(Z0 + 1, Z1 - 1 - dd);
    if (free(a - 0.5, c - 0.5, a + w + 0.5, c + dd + 0.5)) { used.push([a - 0.3, c - 0.3, a + w + 0.3, c + dd + 0.3]); return [a, c]; } } return null; };
  const pc = pick(PLANT); const anchors = [];
  // machine room (back half of the roof), louvre doors, caged ladder to its roof, roof rail + aviation light
  { const w = Math.min(rand(6, 10), (X1 - X0) * 0.4), dd = Math.min(rand(5, 8), (Z1 - Z0) * 0.4); const s = place(w, dd, [X0 + 1.4, cz - dd / 2]);
    if (s) { const h = rand(3.4, 4.6); const [a, c] = s; box(v, a, y, c, a + w, y + h, c + dd, {}, conc.map((q) => q * 0.95)); box(v, a - 0.15, y + h, c - 0.15, a + w + 0.15, y + h + 0.25, c + dd + 0.15, {}, cap);
      for (let k = 0; k < 2; k++) { const zz = c + dd * (0.3 + k * 0.4); // louvre doors on the +x face
        box(v, a + w, y, zz - 0.8, a + w + 0.06, y + 2.4, zz + 0.8, {}, [0.3, 0.32, 0.34]); for (let yy = y + 0.3; yy < y + 2.3; yy += 0.22) put(d, G.box, a + w + 0.1, yy, zz, 0.06, 0.06, 1.5, [0.2, 0.21, 0.22]);
        put(nb, G.box, a + w + 0.1, y + 2.7, zz, 0.08, 0.14, 0.4, [0.9, 0.85, 0.65]); }
      ladder(d, a + w * 0.15, c + dd + 0.18, y, y + h + 0.25, 1, 0, true, 0, 1);
      railRect(d, a + 0.2, c + 0.2, a + w - 0.2, c + dd - 0.2, y + h + 0.25);
      for (let k = 0; k < randi(2, 4); k++) put(d, G.box, a + rand(1, w - 1), y + h + 0.6, c + rand(1, dd - 1), 0.9, 0.7, 0.9, [0.55, 0.56, 0.57]); // roof fans
      put(nb, G.ball, a + w - 0.4, y + h + 1.6, c + 0.4, 0.2, 0.2, 0.2, RED); beam(d, [a + w - 0.4, y + h + 0.25, c + 0.4], [a + w - 0.4, y + h + 1.4, c + 0.4], 0.06, LSTEEL);
      anchors.push([a + w, c + dd / 2]); } }
  // cooling-tower bank
  { const n = randi(2, 3), cw = rand(2.8, 3.6), ch = rand(2.6, 3.4); const s = place(n * (cw + 0.4), cw + 0.6);
    if (s) { for (let i = 0; i < n; i++) coolingTower(v, d, s[0] + cw / 2 + i * (cw + 0.4), y + 0.3, s[1] + cw / 2 + 0.3, cw, ch, pc);
      box(v, s[0] - 0.2, y, s[1], s[0] + n * (cw + 0.4), y + 0.3, s[1] + cw + 0.6, {}, DARK); // steel base frame
      ladder(d, s[0] - 0.15, s[1] + cw / 2, y, y + ch + 0.3, 0, 1, false);
      anchors.push([s[0] + n * (cw + 0.4) / 2, s[1] + cw + 0.6]); } }
  // water tank
  if (opt.tank !== false && rng() < 0.75) { const r = rand(1.4, 2.0); const s = place(r * 2.2, r * 2.2); if (s) { waterTank(v, d, s[0] + r * 1.1, y, s[1] + r * 1.1, r, rand(2.4, 3.6), rand(1.8, 2.8)); anchors.push([s[0] + r * 1.1, s[1] + r * 1.1]); } }
  // pipe runs between the plant pieces (L-shaped, on sleepers), avoiding nothing but staying on the roof
  for (let i = 0; i + 1 < anchors.length; i++) { const a = anchors[i], b = anchors[i + 1]; const mid = [b[0], a[1]];
    const cl = (p) => [Math.min(X1 - 1.2, Math.max(X0 + 1.2, p[0])), Math.min(Z1 - 1.2, Math.max(Z0 + 1.2, p[1]))];
    pipeRun(v, d, [cl(a), cl(mid), cl(b)], y + 0.7, randi(2, 3), pick([[0.62, 0.64, 0.66], [0.42, 0.48, 0.45]]), y); }
  // condenser grid
  { const nc = randi(2, 6); const s = place(Math.min(nc, 3) * 1.5, Math.ceil(nc / 3) * 1.5);
    if (s) for (let k = 0; k < nc; k++) { const x = s[0] + 0.7 + (k % 3) * 1.5, z = s[1] + 0.7 + Math.floor(k / 3) * 1.5; put(v, G.box, x, y + 0.55, z, 1.3, 1.1, 1.3, [0.66, 0.67, 0.68]); put(d, G.cyl8, x, y + 1.12, z, 0.48, 0.04, 0.48, DARK); } }
  // aviation lights on the parapet corners
  for (const [px, pz] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) put(nb, G.ball, px + Math.sign(cx - px) * 0.3, y + ph + 0.35, pz + Math.sign(cz - pz) * 0.3, 0.2, 0.2, 0.2, RED);
}

// --------------------------------------------------------- stepped fin crown ----
// 退台轮廓: fin screen on the roof edge (h1), an inset chamfered frame above it (h2), neon reveal at both tops
export function crownScreen(W, X0, Z0, X1, Z1, y, col, glow) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; const v = W.b('vcol', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  const h1 = rand(5, 8), h2 = rand(4, 7), ins = rand(2.5, 3.5);
  const ring = (a0, b0, a1, b1, yb, yt, finStep, finD) => {
    for (const [px, pz] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) box(v, px - 0.45, yb, pz - 0.45, px + 0.45, yt + 0.4, pz + 0.45, {}, col);
    for (const [p0, p1] of [[[a0, b0], [a1, b0]], [[a1, b0], [a1, b1]], [[a1, b1], [a0, b1]], [[a0, b1], [a0, b0]]]) {
      beam(v, [p0[0], yt + 0.2, p0[1]], [p1[0], yt + 0.2, p1[1]], 0.5, col, 0.5);
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); const n = Math.max(2, Math.round(L / finStep));
      const ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L; const ox = uz, oz = -ux; // outward for this CCW loop? use both signs safely
      for (let k = 1; k < n; k++) { const px = p0[0] + (p1[0] - p0[0]) * k / n, pz = p0[1] + (p1[1] - p0[1]) * k / n;
        put(v, G.box, px, (yb + yt) / 2, pz, Math.abs(ox) * finD + Math.abs(ux) * 0.16 + 0.01, yt - yb, Math.abs(oz) * finD + Math.abs(uz) * 0.16 + 0.01, col); }
      const q0 = [p0[0], p1[0]], q1 = [p0[1], p1[1]]; box(nb, Math.min(...q0) - 0.28, yt + 0.45, Math.min(...q1) - 0.28, Math.max(...q0) + 0.28, yt + 0.53, Math.max(...q1) + 0.28, {}, glow);
    }
  };
  ring(X0 + 0.2, Z0 + 0.2, X1 - 0.2, Z1 - 0.2, y, y + h1, 1.6, 0.9);
  ring(X0 + ins, Z0 + ins, X1 - ins, Z1 - ins, y + h1 + 0.6, y + h1 + h2, 2.4, 0.6);
  // a cross-braced ring beam tying the inner frame to the outer one at the corners
  for (const [a, b] of [[[X0 + 0.2, Z0 + 0.2], [X0 + ins, Z0 + ins]], [[X1 - 0.2, Z0 + 0.2], [X1 - ins, Z0 + ins]], [[X1 - 0.2, Z1 - 0.2], [X1 - ins, Z1 - ins]], [[X0 + 0.2, Z1 - 0.2], [X0 + ins, Z1 - ins]]])
    beam(v, [a[0], y + h1 + 0.4, a[1]], [b[0], y + h1 + 0.8, b[1]], 0.4, col);
  const top = y + h1 + h2 + 0.6;
  for (const [px, pz] of [[X0 + ins, Z0 + ins], [X1 - ins, Z0 + ins], [X1 - ins, Z1 - ins], [X0 + ins, Z1 - ins]]) put(nb, G.ball, px, top + 0.3, pz, 0.22, 0.22, 0.22, RED);
  return top;
}

// -------------------------------------------------------- rooftop billboard ----
// lattice-mounted billboard facing the street (+x) on the top roof: back columns + rakers, dark backing, lit face with colour
// fields and type bars, catwalk + rail along the bottom, lamp arms, aviation light on the top corners
export function roofBillboard(W, X0, Z0, X1, Z1, y) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; const v = W.b('vcol', cx, cz), d = W.b('vcolD', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  const bw = Math.min(Z1 - Z0 - 2, 34), ph = Math.min(12, Math.max(7, bw * 0.38)); const xf = X1 - 1.2, xb = xf - Math.min(4.5, (X1 - X0) * 0.3);
  const z0 = cz - bw / 2, z1 = cz + bw / 2; const yb = y + rand(3, 5), yt = yb + ph; const st = pick([[0.2, 0.21, 0.23], [0.42, 0.44, 0.46], [0.55, 0.12, 0.1]]);
  const nC = Math.max(3, Math.round(bw / 4.5));
  for (let i = 0; i <= nC; i++) { const z = z0 + (bw * i) / nC;
    beam(v, [xf - 0.5, y, z], [xf - 0.5, yt, z], 0.35, st); beam(v, [xb, y, z], [xb, yt - 1.5, z], 0.3, st); // front + back columns
    beam(d, [xb, y + 0.3, z], [xf - 0.5, yt - 0.5, z], 0.18, st); beam(d, [xb, yb, z], [xf - 0.5, yb, z], 0.2, st); // raker + strut
    put(v, G.box, xb, y + 0.15, z, 1.0, 0.3, 1.0, [0.4, 0.4, 0.41]); put(v, G.box, xf - 0.5, y + 0.15, z, 1.0, 0.3, 1.0, [0.4, 0.4, 0.41]); }
  for (let i = 0; i < nC; i++) { const za = z0 + (bw * i) / nC, zb = z0 + (bw * (i + 1)) / nC; // X braces in the back plane
    beam(d, [xb, y + 0.4, za], [xb, yt - 1.6, zb], 0.12, st); beam(d, [xb, y + 0.4, zb], [xb, yt - 1.6, za], 0.12, st); }
  box(v, xf - 0.4, yb, z0 - 0.3, xf, yt, z1 + 0.3, {}, [0.07, 0.07, 0.08]); // backing
  // lit face: dim base + a hero colour block + type bars + a frame line
  const c1 = pick(NEONC), c2 = pick(NEONC.filter((c) => c !== c1)); const F = xf + 0.03; const m = 0.35;
  const field = (za, zb, ya, yc, col) => box(nb, F - 0.02, ya, za, F + 0.02, yc, zb, {}, col);
  field(z0 + m, z1 - m, yb + m, yt - m, c2.map((q) => q * 0.16 + 0.02));
  const split = z0 + bw * rand(0.32, 0.45); const lhs = rng() < 0.5; const [ha, hb] = lhs ? [z0 + m, split] : [z1 - (split - z0), z1 - m];
  field(ha, hb, yb + m, yt - m, c1.map((q) => q * 0.55)); field(ha + 0.6, hb - 0.6, yb + ph * 0.25, yb + ph * 0.75, c1.map((q) => q * 0.9 + 0.08));
  const ta = lhs ? hb + 1.0 : z0 + 1.0, tb = lhs ? z1 - 1.0 : ha - 1.0; const nl = randi(2, 4);
  for (let k = 0; k < nl; k++) { const yy = yt - m - 1.0 - k * (ph - 2 * m - 1.5) / nl; const hh = k === 0 ? Math.min(1.6, ph * 0.16) : 0.55; const len = (tb - ta) * (k === 0 ? rand(0.75, 1) : rand(0.4, 0.85));
    field(ta, ta + len, yy - hh, yy, k === 0 ? [0.95, 0.95, 0.9] : c1.map((q) => q * 0.7 + 0.15)); }
  for (const [za, zb, ya, yc] of [[z0, z1, yt - 0.12, yt], [z0, z1, yb, yb + 0.12], [z0, z0 + 0.12, yb, yt], [z1 - 0.12, z1, yb, yt]]) field(za, zb, ya, yc, c1);
  // catwalk + rail + lamp arms
  box(v, xf, yb - 0.25, z0, xf + 1.2, yb - 0.1, z1, {}, GRATE);
  for (const yy of [yb + 0.45, yb + 0.95]) beam(d, [xf + 1.2, yy, z0], [xf + 1.2, yy, z1], 0.05, LSTEEL);
  for (let z = z0; z <= z1 + 0.01; z += 2) beam(d, [xf + 1.2, yb - 0.1, z], [xf + 1.2, yb + 0.95, z], 0.04, LSTEEL);
  for (let z = z0 + 2; z < z1 - 1; z += 4.5) { beam(d, [xf + 0.1, yb - 0.2, z], [xf + 2.3, yb + 0.5, z], 0.08, DARK); put(v, G.box, xf + 2.35, yb + 0.62, z, 0.45, 0.25, 0.7, DARK); put(nb, G.box, xf + 2.12, yb + 0.6, z, 0.05, 0.18, 0.55, [1, 0.92, 0.75]); }
  ladder(d, xf + 0.6, z0 - 0.5, y, yb - 0.1, 1, 0, true, 0, -1);
  for (const z of [z0, z1]) put(nb, G.ball, xf - 0.2, yt + 0.35, z, 0.22, 0.22, 0.22, RED);
  return [xb - 1, z0 - 1, X1, z1 + 1];
}

// ---------------------------------------------------- mast extras (near) ----
// rest platforms with rails, a climbing ladder on one leg, guy wires to the roof corners, extra aviation lights (red steady at
// 1/3 + 2/3, white strobe on top of the whip)
export function mastExtras(W, cx, y0, cz, mh, r0, r1, T, H) {
  const v = W.b('vcol', cx, cz), d = W.b('vcolD', cx, cz), nb = W.b('neon', cx, cz); const G = kg();
  for (const t of [0.33, 0.66]) { const r = r0 + (r1 - r0) * t + 0.9; const yy = y0 + mh * t;
    box(v, cx - r, yy - 0.12, cz - r, cx + r, yy, cz + r, {}, GRATE); railRect(d, cx - r, cz - r, cx + r, cz + r, yy, 1.0, LSTEEL);
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(nb, G.ball, cx + sx * r, yy + 1.2, cz + sz * r, 0.16, 0.16, 0.16, RED); }
  // ladder up the +x face between the legs
  { const nn = 8; let prev = null; for (let i = 0; i <= nn; i++) { const t = i / nn; const r = r0 + (r1 - r0) * t; const p = [cx + r + 0.1, y0 + mh * t, cz]; if (prev) ladder(d, prev[0], prev[2], prev[1], p[1] - 0.6, 0, 1); prev = p; } }
  // guy wires from 0.6 height to the roof corners
  const ya = y0 + mh * 0.6; const ra = r0 + (r1 - r0) * 0.6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const gx = sx > 0 ? T.X1 - 1.5 : T.X0 + 1.5, gz = sz > 0 ? T.Z1 - 1.5 : T.Z0 + 1.5;
    tube(d, [cx + sx * ra, ya, cz + sz * ra], [gx, H + 1.2, gz], 0.025, DARK, G.tube4); put(v, G.box, gx, H + 0.6, gz, 0.8, 1.2, 0.8, [0.45, 0.45, 0.46]); }
  put(nb, G.ball, cx, y0 + mh + 10.8, cz, 0.34, 0.34, 0.34, STROBE);
}

// ---------------------------------------------------------- far crown ----
// cheap crown silhouette on a far impostor (world space through P(local a, local b) -> [x, z]); top = roof height, sx/sz = half
// extents of the top volume. A handful of prisms + neon light points.
export function farCrown(W, P, p, top, sx, sz) {
  const kind = crownKind(p.seed); const v = W.b('vcol', p.x, p.z), nb = W.b('neon', p.x, p.z);
  const ob = (b, a0, b0, a1, b1, y0, y1, col) => { const q = [P(a0, b1), P(a1, b1), P(a1, b0), P(a0, b0)]; prismWalls(b, q, y0, y1, null, col); polyCap(b, q, y1, {}, col); };
  const lt = (a, b, y, s, col) => ob(nb, a - s, b - s, a + s, b + s, y - s, y + s, col);
  const m = Math.min(sx, sz); const k = (p.seed >>> 4) % 97 / 97; const [ex, ez, emin] = topEst(p.d, p.w, p.h);
  for (const [a, b] of [[-sx, -sz], [sx, -sz], [sx, sz], [-sx, sz]]) lt(a * 0.95, b * 0.95, top + 1.2, 0.55, RED);
  if (kind === 'heli' && emin > HELI_MIN) { const r = Math.min(Math.min(ex, ez) - 0.5, 11, m); const y = top + 3.2; const oct = []; for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8 * Math.PI * 2; oct.push(P(Math.cos(t) * r, -Math.sin(t) * r)); }
    prismWalls(v, oct, y - 0.5, y, null, [0.3, 0.31, 0.32]); polyCap(v, oct, y, {}, [0.22, 0.23, 0.24]);
    for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8 * Math.PI * 2; lt(Math.cos(t) * r, -Math.sin(t) * r, y + 0.2, 0.45, [0.2, 1.0, 0.35]); }
    const hs = r * 0.3, mc = [0.92, 0.9, 0.82]; ob(v, -hs, -hs * 0.8, -hs + 0.9, hs * 0.8, y, y + 0.06, mc); ob(v, hs - 0.9, -hs * 0.8, hs, hs * 0.8, y, y + 0.06, mc); ob(v, -hs, -0.45, hs, 0.45, y, y + 0.06, mc);
    for (const s of [-1, 1]) ob(v, s * r * 0.45 - 0.3, -0.3, s * r * 0.45 + 0.3, 0.3, top, y - 0.5, STEEL); }
  else if (kind === 'mast' || kind === 'heli') { const mh = 28 + k * 24; ob(v, -2.6, -2.6, 2.6, 2.6, top, top + 3, [0.3, 0.31, 0.33]);
    ob(v, -0.9, -0.9, 0.9, 0.9, top + 3, top + 3 + mh * 0.5, [0.55, 0.57, 0.6]); ob(v, -0.45, -0.45, 0.45, 0.45, top + 3 + mh * 0.5, top + 3 + mh + 10, [0.6, 0.62, 0.64]);
    lt(0, 0, top + 3 + mh * 0.5, 0.6, RED); lt(0, 0, top + 3 + mh + 10.3, 0.75, STROBE); }
  else if (kind === 'bill') { const bw = Math.min(2 * Math.min(ez, sz) - 2, 34), ph = Math.min(12, Math.max(7, bw * 0.38)); const xf = Math.min(ex, sx) - 1.2, yb = top + 4; const col = NEONC[p.seed % NEONC.length];
    ob(v, xf - 4, -bw / 2, xf - 0.4, bw / 2, top, yb, [0.2, 0.21, 0.23]); ob(v, xf - 0.4, -bw / 2 - 0.3, xf, bw / 2 + 0.3, yb, yb + ph, [0.07, 0.07, 0.08]);
    ob(nb, xf, -bw / 2, xf + 0.05, bw / 2, yb + 0.3, yb + ph - 0.3, col.map((q) => q * 0.45 + 0.04)); ob(nb, xf + 0.05, -bw / 2 + 1, xf + 0.08, -bw / 2 + bw * 0.38, yb + ph * 0.25, yb + ph * 0.75, col);
    ob(nb, xf + 0.05, -bw / 2 + bw * 0.45, xf + 0.08, bw / 2 - 1.5, yb + ph * 0.62, yb + ph * 0.72, [0.95, 0.95, 0.9]); }
  else if (kind === 'screen') { const h = 10 + k * 4; ob(v, -sx + 0.2, -sz + 0.2, sx - 0.2, sz - 0.2, top, top + h * 0.55, [0.3, 0.32, 0.35]); ob(v, -sx + 3, -sz + 3, sx - 3, sz - 3, top + h * 0.55, top + h, [0.28, 0.3, 0.33]);
    const glow = NEONC[(p.seed >>> 2) % NEONC.length]; for (const [s0, s1, y] of [[sx - 0.2, sz - 0.2, top + h * 0.55], [sx - 3, sz - 3, top + h]]) {
      ob(nb, -s0 - 0.1, s1, s0 + 0.1, s1 + 0.12, y - 0.2, y, glow); ob(nb, -s0 - 0.1, -s1 - 0.12, s0 + 0.1, -s1, y - 0.2, y, glow); ob(nb, s0, -s1, s0 + 0.12, s1, y - 0.2, y, glow); ob(nb, -s0 - 0.12, -s1, -s0, s1, y - 0.2, y, glow); } }
  else { let s = m * 0.8, yy = top; for (let i = 0; i < 3; i++) { const h = 5.5; ob(v, -s, -s, s, s, yy, yy + h, i % 2 ? [0.25, 0.26, 0.28] : [0.4, 0.42, 0.45]); yy += h; s *= 0.62; }
    ob(v, -0.35, -0.35, 0.35, 0.35, yy, yy + 24, STEEL); lt(0, 0, yy + 24.3, 0.7, RED); }
}
void THREE;
