// r6.4 b_portlight (Hark modelling lane, 2026-11-22): 霓港 (B map) harbour container yards — night light pools + light wash on
// the boxes under the high masts, gantry-crane work lights and gate. Original content only.
//
// No light is added to any lighting loop and no shader program is added: every piece goes into the lot's existing 'cone'
// bucket (bldglayer.js coneMat — one additive ShaderMaterial already used by every crane / mast light shaft), so the chunk's
// draw-call count does not change. coneMat got a second mode in the same program: a vertex whose uv.x ≥ 2 is a "wash" vertex —
// its vertex colour IS the added night radiance (× uNight), view-independent; old cone vertices (uv.x ∈ [0, 1]) take the old path
// unchanged.
//  * ground pools: ring discs under every yard mast (outer masts cool white, inner masts sodium), under the crane's girder work
//    lights, at the gate portal (cyan) and under each warehouse's front work light. Vertex colour = irradiance × ground albedo,
//    a soft spot fall-off (gaussian of the horizontal distance) shaded per vertex, shadowed by the container stacks (height field).
//  * box wash: the faces of the container stacks that a lamp can see (top of each stack, the exposed sides — the same rule the
//    corrugation ribs use — and the row ends facing the open strips / a lower neighbour row) get a thin additive quad just in
//    front of the face whose vertex colour is box albedo × irradiance (n·l, spot fall-off, height-field shadow). So boxes read
//    by their own colour near the lights and fall back to the cold dark yard away from them.
// Build-time only (no rng — called after portExtras' last draw), lot-local frame like the rest of portExtras.
// Test switch ?noportlight: none of this is built.
import { yardBoxCol, CL as YCL, CW as YCW, CH2 as YCH } from './portyard.js';

export const PL_OFF = typeof location !== 'undefined' && /[?&]noportlight\b/.test(location.search);
export const PL = { stats: { pools: 0, poolTris: 0, washQuads: 0, washTris: 0, lots: 0 } };

const COOL = [0.62, 0.74, 0.9], SOD = [0.95, 0.62, 0.3], CYAN = [0.15, 0.8, 0.95];
const GROUND_ALB = 0.32, PY_Y = 0.2;
const K_WASH = 1.5, K_POOL = 0.5;

// ---------------------------------------------------------------- raw vertex push into a GeoBucket (per-vertex colour) ----
function vtx(b, x, y, z, nx, ny, nz, c) { b.p.push(x, y, z); b.n.push(nx, ny, nz); b.uv.push(2, 1); b.c.push(c[0], c[1], c[2]); return b.vc++; }

// lamps: { x, y, z, col, I, rs }  (I = irradiance straight under the lamp at the ground, rs = gaussian spot radius)
function irr(L, P, n, vis) { let r = 0, g = 0, b = 0;
  for (const l of L) { const dx = l.x - P[0], dy = l.y - P[1], dz = l.z - P[2]; if (dy <= 0.2) continue; const d = Math.hypot(dx, dy, dz);
    const nl = (n[0] * dx + n[1] * dy + n[2] * dz) / d; if (nl <= 0) continue; const rh = Math.hypot(dx, dz); if (rh > l.rs * 2.6) continue;
    const sp = Math.exp(-(rh / l.rs) * (rh / l.rs)); const fall = Math.min(1, (l.y / d) * (l.y / d)); const k = l.I * nl * sp * fall * (vis ? vis(P, n, l) : 1);
    r += l.col[0] * k; g += l.col[1] * k; b += l.col[2] * k; }
  return [r, g, b]; }

// container-stack height field (lot frame) + shadow test toward a lamp
function heightField(y) { const { N, xs, zs } = y; const nc = xs.length, nr = zs.length;
  const hAt = (x, z) => { const i = Math.floor((x - xs[0]) / 3), j = Math.floor((z - zs[0]) / 13.2); if (i < 0 || j < 0 || i >= nc || j >= nr) return 0;
    if (x > xs[i] + YCW || z > zs[j] + YCL) return 0; return 0.05 + N[i][j] * YCH; };
  const hMax = 0.05 + 4 * YCH;
  const vis = (P, n, l) => { const ox = P[0] + n[0] * 0.12, oy = P[1] + n[1] * 0.12, oz = P[2] + n[2] * 0.12; const dx = l.x - ox, dy = l.y - oy, dz = l.z - oz;
    const rh = Math.hypot(dx, dz); if (rh < 0.05) return 1; const st = Math.max(1, Math.ceil(rh / 0.45));
    for (let s = 1; s <= st; s++) { const t = s / st; const yy = oy + dy * t; if (yy > hMax) return 1; if (hAt(ox + dx * t, oz + dz * t) > yy) return 0; }
    return 1; };
  return { hAt, vis }; }

// ring disc on the ground: centre (x, z), spot lamp list, rings at fractions of rs
function pool(b, L, x, z, rs, vis, nseg = 14, rings = [0.45, 0.95, 1.6, 2.4]) {
  const up = [0, 1, 0]; const col = (px, pz) => { const e = irr(L, [px, PY_Y, pz], up, vis); return [e[0] * GROUND_ALB * K_POOL, e[1] * GROUND_ALB * K_POOL, e[2] * GROUND_ALB * K_POOL]; };
  const c0 = vtx(b, x, PY_Y, z, 0, 1, 0, col(x, z)); let prev = null; let tris = 0;
  for (let r = 0; r < rings.length; r++) { const R = rings[r] * rs; const ring = []; const last = r === rings.length - 1;
    for (let s = 0; s < nseg; s++) { const a = (s + (r % 2) * 0.5) / nseg * Math.PI * 2; const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; ring.push(vtx(b, px, PY_Y, pz, 0, 1, 0, last ? [0, 0, 0] : col(px, pz))); }
    for (let s = 0; s < nseg; s++) { const s1 = (s + 1) % nseg;
      if (!prev) { b.idx.push(c0, ring[s1], ring[s]); tris++; }
      else if (r % 2) { b.idx.push(prev[s], ring[s1], ring[s], prev[s], prev[s1], ring[s1]); tris += 2; }
      else { b.idx.push(prev[s], prev[s1], ring[s], prev[s1], ring[s1], ring[s]); tris += 2; } }
    prev = ring; }
  PL.stats.pools++; PL.stats.poolTris += tris; }

// wash quad over a face: corner o, axis a (length la, nsa segments), axis u (length lu), normal n; alb(t) = albedo at segment mid t∈[0,1]
function wash(b, L, vis, o, a, la, nsa, u, lu, n, off, alb) {
  const P = (sa, su) => [o[0] + a[0] * sa + u[0] * su + n[0] * off, o[1] + a[1] * sa + u[1] * su + n[1] * off, o[2] + a[2] * sa + u[2] * su + n[2] * off];
  const E = []; let mx = 0; for (let i = 0; i <= nsa; i++) { E.push([]); for (const su of [0, lu]) { const p = P(la * i / nsa, su); const e = irr(L, [p[0] - n[0] * off, p[1] - n[1] * off, p[2] - n[2] * off], n, vis); E[i].push(e); mx = Math.max(mx, e[0], e[1], e[2]); } }
  if (mx < 0.012) return;
  // winding: (a × u) · n > 0 → (0,0),(a,0),(a,u),(0,u) is CCW seen from n
  const cr = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]]; const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
  for (let i = 0; i < nsa; i++) { const c = alb((i + 0.5) / nsa); const cc = (e) => [c[0] * e[0] * K_WASH, c[1] * e[1] * K_WASH, c[2] * e[2] * K_WASH];
    const p00 = P(la * i / nsa, 0), p10 = P(la * (i + 1) / nsa, 0), p11 = P(la * (i + 1) / nsa, lu), p01 = P(la * i / nsa, lu);
    const i0 = vtx(b, ...p00, ...n, cc(E[i][0])), i1 = vtx(b, ...p10, ...n, cc(E[i + 1][0])), i2 = vtx(b, ...p11, ...n, cc(E[i + 1][1])), i3 = vtx(b, ...p01, ...n, cc(E[i][1]));
    if (!flip) b.idx.push(i0, i1, i2, i0, i2, i3); else b.idx.push(i0, i2, i1, i0, i3, i2);
    PL.stats.washQuads++; PL.stats.washTris += 2; } }

// ---------------------------------------------------------------- container yard (bldglayer.js portExtras, after the last draw) ----
// cb: the lot's 'cone' bucket; cr: the gantry crane { xL, xR, zc, Hc, tx }; masts0: the outer mast positions
export function yardLights(cb, p, cr, masts0) {
  const y = p.py; if (PL_OFF || !y) return; PL.stats.lots++;
  const hx = p.d / 2; const { xs, zs, N } = y; const nc = xs.length, nr = zs.length; const { vis } = heightField(y);
  const L = [];
  for (const [x, z] of masts0) L.push({ x, y: 21.8, z, col: COOL, I: 0.55, rs: 12.5, pool: 1 });
  for (const [x, z] of y.masts) L.push({ x: x + 0.8, y: 24.3, z, col: SOD, I: 0.42, rs: 11.5, pool: 1 });
  for (const s of [-1, 1]) for (let x = cr.xL + 3; x < cr.xR - 2; x += 9) L.push({ x, y: cr.Hc - 0.5, z: cr.zc + s * 2.2, col: SOD, I: 0.3, rs: 4.2, pool: 2 });
  if (y.gate && y.gate.portal) L.push({ x: hx + 0.5, y: 5.1, z: (y.gate.z0 + y.gate.z1) / 2, col: CYAN, I: 0.35, rs: 3.2, pool: 3 });
  // ground pools (shadowed by the stacks)
  for (const l of L) if (l.pool !== 2) pool(cb, L, l.x, l.z, l.rs, vis); // the crane lamps light the boxes under it (wash), their ground is all stacks
  // box wash
  const col = (i, j, k, t) => { const q = yardBoxCol(p, y.C, i, j, k); return q.pair && t > 0.5 ? q.c2 : q.c; };
  for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) { const n = N[i][j]; const x = xs[i], z = zs[j];
    for (let k = 0; k < n; k++) { const y0 = 0.05 + k * YCH; const Lx = i === 0 || N[i - 1][j] <= k, Rx = i === nc - 1 || N[i + 1][j] <= k;
      const al = (t) => col(i, j, k, t);
      if (Lx) wash(cb, L, vis, [x, y0, z], [0, 0, 1], YCL, 3, [0, 1, 0], YCH, [-1, 0, 0], 0.075, al);
      if (Rx) wash(cb, L, vis, [x + YCW, y0, z], [0, 0, 1], YCL, 3, [0, 1, 0], YCH, [1, 0, 0], 0.075, al);
      if (j === 0 || N[i][j - 1] <= k) wash(cb, L, vis, [x, y0, z], [1, 0, 0], YCW, 1, [0, 1, 0], YCH, [0, 0, -1], 0.055, () => col(i, j, k, 0));
      if (j === nr - 1 || N[i][j + 1] <= k) wash(cb, L, vis, [x, y0, z + YCL], [1, 0, 0], YCW, 1, [0, 1, 0], YCH, [0, 0, 1], 0.055, () => col(i, j, k, 1));
      if (k === n - 1) wash(cb, L, vis, [x, y0 + YCH, z], [0, 0, 1], YCL, 2, [1, 0, 0], YCW, [0, 1, 0], 0.03, al); } }
}

// warehouse lot: a warm pool on the apron under the front work light (bldglayer.js portExtras warehouse branch puts it at
// (hx + 0.12, 7.8, 0))
export function warehouseLight(cb, p) {
  if (PL_OFF) return; const hx = p.d / 2; const L = [{ x: hx + 0.6, y: 7.8, z: 0, col: [0.9, 0.82, 0.62], I: 0.5, rs: 4.5 }];
  pool(cb, L, hx + 2.6, 0, 4.5, null, 12, [0.5, 1.1, 1.8, 2.5]);
}
