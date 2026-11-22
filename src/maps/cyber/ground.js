// r6.4 b_ground (Hark modelling lane, map 霓港): street-level ground detail for the near view.
//  * geometry (this file, 'vcol' + 'steam' materials that already exist, no new program):
//    - round sewer manholes (cast-iron cover with a ring pattern, raised rim, a darker re-laid asphalt collar) and square telecom
//      covers in the lane centres, spaced along every street edge with a per-edge hash jitter; a few round vents breathe steam
//      (existing animated 'steam' plume material);
//    - storm-drain grates in the gutter at the kerb (bars, frame, dark sump) with the kerb-face inlet slot;
//    - sidewalk cable-trench covers (runs of 0.8 m concrete plates in steel frames, lift holes), small cast-iron service hatches
//      and a few steaming sidewalk vent grates;
//    - kerb wear: grime band at the foot of the kerb face, black tyre scuffs, chipped arrises (top edge) with exposed aggregate.
//  * shader (mats.js road / sidewalk, 霓港 branch only, same programs): puddles collecting at every drain inlet and along the
//    gutter (they feed the existing wet-road mirror / lamp-streak terms through `pud`), utility-cut asphalt patches with sealed
//    seams, alligator cracking in the wheel paths, worn / broken zebra stripes, slab-to-slab tone, joint dirt and replaced slabs
//    on the pavers.
// Placement is deterministic (integer hashes of edge id / cell, no rng() draws, so no other generator's sequence moves); items
// that would sit under a collider (lamp, palm, pole, clutter, shop group, building, …) are skipped at build time.
// LOD: one merged mesh per material holding only the items within NEAR_R of the camera, rebuilt when the camera has moved
// REBUILD m -> at most +2 draw calls (vcol, steam), nothing beyond 80 m. Flat pieces sit 6–25 mm proud of the surface and the
// vcol mesh renders with a polygon offset (set only around its own draw), so nothing z-fights. Ground pieces have no colliders
// (all < 3 cm tall). Test switch ?noground: no geometry and the old road / sidewalk shader text.
import * as THREE from 'three';
import { World } from '../../geo.js';
import { pointAt } from './roadgraph.js';
import { landAt } from './mapdata.js';
import { plume } from './street2.js';

export const GROUND_OFF = typeof location !== 'undefined' && /[?&]noground\b/.test(location.search);
const NEAR_R = 80, REBUILD = 9, CELL = 40;
const fr = (x) => x - Math.floor(x);
// integer hash -> [0,1)
const ih = (a, b = 0, c = 0) => { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
// storm-drain positions along a road ribbon: MUST match the road shader (mats.js, b_ground drain puddles)
export const DRAIN = { cell: 30, off: 15 };
export function drainAt(c, sd, Lr) {
  const h = fr(c * 0.6180339887 + sd * 0.37 + fr(Lr * 0.0137)), h2 = fr(c * 0.4142135 + sd * 0.71 + fr(Lr * 0.0291));
  return { v: sd * DRAIN.off + (c + 0.5 + (h - 0.5) * 0.5) * DRAIN.cell, on: h2 > 0.18 };
}

const IRON = [0.105, 0.1, 0.095], IRON2 = [0.16, 0.15, 0.14], IRONR = [0.2, 0.13, 0.09], ASPH = [0.075, 0.075, 0.08], SUMP = [0.012, 0.012, 0.014];
const CONC = [0.46, 0.45, 0.43], CONC2 = [0.36, 0.355, 0.35], STEELF = [0.24, 0.24, 0.25], GRIME = [0.07, 0.068, 0.065], SCUFF = [0.025, 0.025, 0.027];
const CHIP = [0.58, 0.56, 0.52];
const TMP = new THREE.Vector3(), TA = new THREE.Vector3(), TB = new THREE.Vector3();
const V3 = (q) => new THREE.Vector3(q[0], q[1], q[2]);
// quad with a wanted facing (n): corners in any rotation, flipped if needed
function Q(b, p0, p1, p2, p3, n, col) {
  const a = V3(p0), bb = V3(p1), c = V3(p2), d = V3(p3);
  TA.subVectors(bb, a); TB.subVectors(d, a); TMP.crossVectors(TA, TB);
  if (TMP.x * n[0] + TMP.y * n[1] + TMP.z * n[2] >= 0) b.quad(a, bb, c, d, [0, 0, 1, 0, 1, 1, 0, 1], {}, col); else b.quad(d, c, bb, a, [0, 0, 1, 0, 1, 1, 0, 1], {}, col);
}
// local frame at (x, z): a along t, c across n (left normal), y up
function frame(x, z, tx, tz) { const nx = -tz, nz = tx; return { P: (a, c, y) => [x + tx * a + nx * c, y, z + tz * a + nz * c], t: [tx, 0, tz], n: [nx, 0, nz], x, z }; }
// box without a bottom in a frame: a0..a1 along, c0..c1 across, y0..y1
function obox(b, F, a0, a1, c0, c1, y0, y1, col, colTop = col) {
  const P = F.P; const t = F.t, n = F.n, mt = [-t[0], 0, -t[2]], mn = [-n[0], 0, -n[2]];
  Q(b, P(a0, c0, y1), P(a1, c0, y1), P(a1, c1, y1), P(a0, c1, y1), [0, 1, 0], colTop);
  Q(b, P(a1, c0, y0), P(a1, c1, y0), P(a1, c1, y1), P(a1, c0, y1), t, col);
  Q(b, P(a0, c0, y0), P(a0, c1, y0), P(a0, c1, y1), P(a0, c0, y1), mt, col);
  Q(b, P(a0, c1, y0), P(a1, c1, y0), P(a1, c1, y1), P(a0, c1, y1), n, col);
  Q(b, P(a0, c0, y0), P(a1, c0, y0), P(a1, c0, y1), P(a0, c0, y1), mn, col);
}
const flat = (b, F, a0, a1, c0, c1, y, col) => Q(b, F.P(a0, c0, y), F.P(a1, c0, y), F.P(a1, c1, y), F.P(a0, c1, y), [0, 1, 0], col);
// annulus r0..r1 at y (k segments), optionally a bevel down to y0 at the outside
function ring(b, x, z, r0, r1, y, k, col, y0 = null, colB = col, alt = null) {
  for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2, a2 = (i + 1) / k * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a), c2 = Math.cos(a2), s2 = Math.sin(a2);
    Q(b, [x + c * r0, y, z + s * r0], [x + c2 * r0, y, z + s2 * r0], [x + c2 * r1, y, z + s2 * r1], [x + c * r1, y, z + s * r1], [0, 1, 0], alt && i % 2 ? alt : col);
    if (y0 !== null) { const rr = r1 + (y - y0) * 1.2; Q(b, [x + c * r1, y, z + s * r1], [x + c2 * r1, y, z + s2 * r1], [x + c2 * rr, y0, z + s2 * rr], [x + c * rr, y0, z + s * rr], [c, 0.8, s], colB); } }
}
function disc(b, x, z, r, y, k, col) { for (let i = 0; i < k; i += 2) { const a = i / k * Math.PI * 2, a2 = (i + 1) / k * Math.PI * 2, a3 = (i + 2) / k * Math.PI * 2;
  Q(b, [x, y, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(a2) * r, y, z + Math.sin(a2) * r], [x + Math.cos(a3) * r, y, z + Math.sin(a3) * r], [0, 1, 0], col); } }

// ------------------------------------------------------------------ item builders ----
// y0 = surface height (road 0, sidewalk 0.15)
function manhole(b, it) {
  const { x, z, y0, h } = it; const R = 0.36;
  ring(b, x, z, R + 0.09, R + 0.42 + h * 0.18, y0 + 0.006, 12, [ASPH[0] * (0.8 + h * 0.4), ASPH[1] * (0.8 + h * 0.4), ASPH[2] * (0.85 + h * 0.3)]); // re-laid collar
  ring(b, x, z, R + 0.01, R + 0.09, y0 + 0.022, 16, IRON2, y0 + 0.008, IRON); // frame rim + bevel
  const rust = h > 0.6 ? IRONR : IRON;
  ring(b, x, z, R * 0.86, R, y0 + 0.018, 16, rust);
  ring(b, x, z, R * 0.55, R * 0.86, y0 + 0.016, 16, IRON, null, IRON, IRON2); // ring pattern: alternating raised / worn sectors
  ring(b, x, z, R * 0.3, R * 0.55, y0 + 0.017, 12, IRON2);
  disc(b, x, z, R * 0.3, y0 + 0.018, 8, h > 0.3 ? IRON : rust);
  const F = frame(x, z, Math.cos(h * 6.28), Math.sin(h * 6.28)); // two pick holes
  for (const a of [-0.2, 0.2]) flat(b, F, a - 0.025, a + 0.025, -0.012, 0.012, y0 + 0.0185, SUMP);
}
function telecom(b, it) {
  const F = frame(it.x, it.z, it.tx, it.tz); const y = it.y0; const s = 0.42;
  flat(b, F, -s - 0.35, s + 0.35, -s - 0.35, s + 0.35, y + 0.006, [ASPH[0] * 0.85, ASPH[1] * 0.85, ASPH[2] * 0.9]);
  obox(b, F, -s - 0.06, s + 0.06, -s - 0.06, s + 0.06, y + 0.004, y + 0.02, IRON, IRON2);
  for (const [a0, a1] of [[-s, -0.01], [0.01, s]]) obox(b, F, a0, a1, -s, s, y + 0.006, y + 0.022, IRON, it.h > 0.5 ? IRONR : IRON);
  for (let k = -3; k <= 3; k++) flat(b, F, -s + 0.04, s - 0.04, k * 0.11 - 0.012, k * 0.11 + 0.012, y + 0.0225, IRON2); // tread bars
}
function drain(b, it) { // gutter grate at the kerb; frame: a along, c across (+ toward the kerb)
  const F = frame(it.x, it.z, it.tx, it.tz); const y = it.y0; const L = 0.48, Wd = 0.22, k = it.kerbC; // half sizes; k = kerb line (c)
  flat(b, F, -L - 0.25, L + 0.25, k - 2 * Wd - 0.3, k - 0.02, y + 0.005, [ASPH[0] * 0.8, ASPH[1] * 0.8, ASPH[2] * 0.85]); // concrete/asphalt surround
  const c0 = k - 2 * Wd - 0.06, c1 = k - 0.03;
  flat(b, F, -L, L, c0 + 0.05, c1 - 0.05, y + 0.006, SUMP); // dark sump seen between the bars
  obox(b, F, -L - 0.05, L + 0.05, c0, c0 + 0.05, y + 0.004, y + 0.018, IRON, IRON2); obox(b, F, -L - 0.05, L + 0.05, c1 - 0.05, c1, y + 0.004, y + 0.018, IRON, IRON2);
  obox(b, F, -L - 0.05, -L, c0 + 0.05, c1 - 0.05, y + 0.004, y + 0.018, IRON, IRON2); obox(b, F, L, L + 0.05, c0 + 0.05, c1 - 0.05, y + 0.004, y + 0.018, IRON, IRON2);
  for (let i = 0; i < 9; i++) { const a = -L + 0.06 + i * (2 * L - 0.12) / 8; obox(b, F, a - 0.016, a + 0.016, c0 + 0.05, c1 - 0.05, y + 0.006, y + 0.017, IRON, it.h > 0.55 ? IRONR : IRON2); }
  // kerb inlet slot on the kerb face (dark mouth) + a steel lip
  const kf = k - 0.004; Q(b, F.P(-L, kf, y + 0.03), F.P(L, kf, y + 0.03), F.P(L, kf, y + 0.105), F.P(-L, kf, y + 0.105), [-F.n[0], 0, -F.n[2]], SUMP);
  Q(b, F.P(-L - 0.05, kf - 0.001, y + 0.105), F.P(L + 0.05, kf - 0.001, y + 0.105), F.P(L + 0.05, kf - 0.001, y + 0.13), F.P(-L - 0.05, kf - 0.001, y + 0.13), [-F.n[0], 0, -F.n[2]], STEELF);
}
function trench(b, it) { // a run of n concrete plates along t; c = across centre
  const F = frame(it.x, it.z, it.tx, it.tz); const y = it.y0; const w = 0.24, pl = 0.8;
  for (let i = 0; i < it.n; i++) { if (it.skip & (1 << i)) continue; const a0 = i * pl, a1 = a0 + pl; const hv = ih(it.id, i, 7);
    obox(b, F, a0, a1, -w - 0.04, w + 0.04, y + 0.002, y + 0.012, STEELF); // steel frame
    const cc = hv < 0.2 ? CONC2 : CONC; obox(b, F, a0 + 0.025, a1 - 0.025, -w, w, y + 0.003, y + 0.014, cc, hv > 0.85 ? [cc[0] * 0.78, cc[1] * 0.78, cc[2] * 0.76] : cc);
    for (const a of [a0 + 0.14, a1 - 0.14]) flat(b, F, a - 0.03, a + 0.03, -0.015, 0.015, y + 0.0145, SUMP); }
}
function hatch(b, it) {
  const F = frame(it.x, it.z, it.tx, it.tz); const y = it.y0; const s = 0.22;
  obox(b, F, -s - 0.035, s + 0.035, -s - 0.035, s + 0.035, y + 0.002, y + 0.013, IRON, IRON2);
  obox(b, F, -s, s, -s, s, y + 0.003, y + 0.015, IRON, it.h > 0.5 ? IRONR : IRON);
  for (let k = -2; k <= 2; k++) flat(b, F, k * 0.08 - 0.012, k * 0.08 + 0.012, -s + 0.03, s - 0.03, y + 0.0155, IRON2);
}
function vent(b, it) { // sidewalk vent grate (rect) with steam
  const F = frame(it.x, it.z, it.tx, it.tz); const y = it.y0; const L = 0.6, Wd = 0.3;
  flat(b, F, -L + 0.03, L - 0.03, -Wd + 0.03, Wd - 0.03, y + 0.004, SUMP);
  obox(b, F, -L, L, -Wd, -Wd + 0.04, y + 0.002, y + 0.016, STEELF); obox(b, F, -L, L, Wd - 0.04, Wd, y + 0.002, y + 0.016, STEELF);
  obox(b, F, -L, -L + 0.04, -Wd + 0.04, Wd - 0.04, y + 0.002, y + 0.016, STEELF); obox(b, F, L - 0.04, L, -Wd + 0.04, Wd - 0.04, y + 0.002, y + 0.016, STEELF);
  for (let i = 1; i < 12; i++) { const a = -L + i * (2 * L) / 12; obox(b, F, a - 0.012, a + 0.012, -Wd + 0.04, Wd - 0.04, y + 0.004, y + 0.015, STEELF, [0.3, 0.3, 0.31]); }
}
function kerbWear(b, it) { // one kerb piece of length len along t from (x,z); c = kerb line, + = sidewalk side; road at y 0, top 0.15
  const F = frame(it.x, it.z, it.tx, it.tz); const L = it.len; const k = it.kerbC; const mn = [-F.n[0], 0, -F.n[2]]; const f = k - 0.003;
  // grime band at the foot of the kerb face (road dirt / splash line)
  Q(b, F.P(0, f, 0.004), F.P(L, f, 0.004), F.P(L, f, 0.045 + it.h * 0.03), F.P(0, f, 0.04 + it.h * 0.03), mn, GRIME);
  for (let i = 0, a = 0; a < L - 0.3; i++) { const h = ih(it.id, i, 3), h2 = ih(it.id, i, 5); const ln = 0.25 + h2 * 0.9;
    if (h < 0.22) { // tyre scuff: long black streak low on the face
      const a1 = Math.min(L, a + ln * 1.4); Q(b, F.P(a, f - 0.0005, 0.03 + h2 * 0.02), F.P(a1, f - 0.0005, 0.035), F.P(a1, f - 0.0005, 0.06 + h2 * 0.03), F.P(a, f - 0.0005, 0.075 + h2 * 0.04), mn, SCUFF);
    } else if (h < 0.5) { // chipped arris: a bevel cut across the top edge exposing lighter aggregate
      const a1 = Math.min(L, a + ln * 0.55), d = 0.025 + h2 * 0.035, dy = 0.02 + h2 * 0.03;
      Q(b, F.P(a, f - 0.001, 0.15 - dy), F.P(a1, f - 0.001, 0.15 - dy * 0.6), F.P(a1, k + d * 0.6, 0.1515), F.P(a, k + d, 0.1515), [-F.n[0] * 0.7, 0.7, -F.n[2] * 0.7], CHIP);
    }
    a += ln + 0.15; }
}

// ------------------------------------------------------------------ layer ----
export class GroundLayer {
  constructor(scene, mats, city) {
    this.mats = mats; this.city = city; this.col = city.col; this.group = new THREE.Group(); this.group.name = 'ground'; scene.add(this.group);
    this.grid = new Map(); this.meshes = []; this.last = null; this.stats = { items: 0, byKind: {}, built: 0, tris: 0, meshes: 0, rebuilds: 0, skipped: 0, off: GROUND_OFF };
    if (GROUND_OFF) return;
    this.plan();
  }
  add(it) { it.id = this.stats.items++; const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(it); this.stats.byKind[it.k] = (this.stats.byKind[it.k] || 0) + 1; }
  plan() {
    const g = this.city.graph; const P = {};
    for (const e of g.edges) {
      if (e.legacy || e.kind === 'rur') continue;
      const s0 = e.n0.trim, s1 = e.L - e.n1.trim; if (s1 - s0 < 6) continue;
      const pad0 = e.n0.deg === 2 ? 1000 : 0, pad1 = e.n1.deg === 2 ? 1000 : 0; const Lr = s1 - s0 + pad0 + pad1; const hw = e.hw; const eid = e.id ?? 0;
      const vAt = (s) => s - s0 + pad0, sAt = (v) => v - pad0 + s0, endD = (v) => Math.min(v, Lr - v);
      const at = (s, c) => { pointAt(e, s, P); return { x: P.x - P.tz * c, z: P.z + P.tx * c, tx: P.tx, tz: P.tz }; };
      const dry = (x, z) => landAt(x, z);
      const kerb = e.sw > 0;
      // storm drains (both sides), shader-matched positions
      if (kerb) for (const sd of [0, 1]) { const vlo = vAt(s0), vhi = vAt(s1);
        for (let c = Math.floor((vlo - sd * DRAIN.off) / DRAIN.cell); c <= Math.floor((vhi - sd * DRAIN.off) / DRAIN.cell); c++) { const d = drainAt(c, sd, Lr);
          if (!d.on || d.v < vlo + 1 || d.v > vhi - 1 || endD(d.v) <= 8) continue; const sg = sd ? 1 : -1; const q = at(sAt(d.v), sg * (hw - 0.3)); if (!dry(q.x, q.z)) continue;
          // frame: t along the road, n = left normal; kerb is at +c on the left side -> flip the frame on the right so +c points at the kerb
          const tx = sd ? q.tx : -q.tx, tz = sd ? q.tz : -q.tz; const mid = at(sAt(d.v), 0);
          this.add({ k: 'drain', x: mid.x, z: mid.z, tx, tz, kerbC: hw, y0: 0, r: 0.7, h: ih(eid, c, sd + 11), ox: q.x, oz: q.z }); } }
      // manholes / telecom covers in the lanes
      const lanes = e.kind === 'ave' ? [1.75, 5.25] : e.kind === 'cw' ? [1.75, 5.25, 8.75] : [2.25];
      for (let c = Math.floor(vAt(s0) / 34); c <= Math.floor(vAt(s1) / 34); c++) { const h1 = ih(eid, c, 21), h2 = ih(eid, c, 22), h3 = ih(eid, c, 23);
        const v = (c + 0.2 + 0.6 * h1) * 34; if (h3 < 0.22 || v < vAt(s0) + 2 || v > vAt(s1) - 2 || endD(v) < 15) continue;
        const u = (h2 < 0.5 ? -1 : 1) * lanes[Math.floor(fr(h2 * 2) * lanes.length)]; const q = at(sAt(v), u); if (!dry(q.x, q.z)) continue;
        const kind = h3 > 0.86 ? 'telecom' : 'manhole'; this.add({ k: kind, x: q.x, z: q.z, tx: q.tx, tz: q.tz, y0: 0, r: kind === 'telecom' ? 0.8 : 0.85, h: ih(eid, c, 24), steam: kind === 'manhole' && h3 < 0.36 && h1 > 0.5 }); }
      if (!kerb) continue;
      const sw = e.sw; const y0 = 0.15;
      for (const sd of [0, 1]) { const sg = sd ? 1 : -1;
        // cable trench runs
        for (let c = Math.floor(vAt(s0) / 46); c <= Math.floor(vAt(s1) / 46); c++) { const h = ih(eid, c, 31 + sd); if (h > 0.5) continue; const n = 4 + Math.floor(ih(eid, c, 33 + sd) * 7);
          const v = c * 46 + 4 + ih(eid, c, 35 + sd) * 30; if (v < vAt(s0) + 3 || v + n * 0.8 > vAt(s1) - 3 || endD(v) < 6 || endD(v + n * 0.8) < 6) continue;
          const q = at(sAt(v), sg * (hw + sw * 0.42)); if (!dry(q.x, q.z)) continue; this.add({ k: 'trench', x: q.x, z: q.z, tx: q.tx, tz: q.tz, y0, n, r: 0.4, len: n * 0.8, skip: 0 }); }
        // service hatches near the building line
        for (let c = Math.floor(vAt(s0) / 19); c <= Math.floor(vAt(s1) / 19); c++) { const h = ih(eid, c, 41 + sd); if (h > 0.42) continue; const v = c * 19 + 2 + ih(eid, c, 43 + sd) * 15;
          if (v < vAt(s0) + 2 || v > vAt(s1) - 2 || endD(v) < 5) continue; const q = at(sAt(v), sg * (hw + sw - 0.75 - ih(eid, c, 45) * 0.6)); if (!dry(q.x, q.z)) continue;
          this.add({ k: 'hatch', x: q.x, z: q.z, tx: q.tx, tz: q.tz, y0, r: 0.35, h: ih(eid, c, 47) }); }
        // steaming sidewalk vents
        for (let c = Math.floor(vAt(s0) / 110); c <= Math.floor(vAt(s1) / 110); c++) { const h = ih(eid, c, 51 + sd); if (h > 0.38) continue; const v = c * 110 + 10 + ih(eid, c, 53 + sd) * 90;
          if (v < vAt(s0) + 3 || v > vAt(s1) - 3 || endD(v) < 8) continue; const q = at(sAt(v), sg * (hw + sw * 0.62)); if (!dry(q.x, q.z)) continue;
          this.add({ k: 'vent', x: q.x, z: q.z, tx: q.tx, tz: q.tz, y0, r: 0.75, steam: true }); }
        // kerb wear, 3 m pieces along the kerb line (frame flipped on the right so +c is the sidewalk)
        for (let s = s0 + 0.5, i = 0; s < s1 - 3.5; s += 3, i++) { const q = at(s, sg * hw); if (!dry(q.x, q.z)) continue; const tx = sd ? q.tx : -q.tx, tz = sd ? q.tz : -q.tz;
          const ox = sd ? q.x : q.x + q.tx * 3, oz = sd ? q.z : q.z + q.tz * 3; // right side: start at the far end so the piece still spans s..s+3
          this.add({ k: 'kerb', x: ox, z: oz, tx, tz, kerbC: 0, len: 3, y0: 0, r: 0, h: ih(eid, i, 61 + sd), nocheck: true }); }
      }
    }
    // Deco core grid streets (city.js roadQuad: kind 0, half width 7, v from the segment start): drains + manholes
    for (const [si, sgm] of (this.city.segs || []).entries()) { if (sgm.bridge) continue; const Lr = sgm.a1 - sgm.a0; const w = 7;
      const at = (v, u) => sgm.axis === 'z' ? { x: sgm.c + u, z: sgm.a0 + v, tx: 0, tz: 1 } : { x: sgm.a0 + v, z: sgm.c - u, tx: 1, tz: 0 };
      // u -> world: axis z: x = c + u (left normal of t=(0,1) is (-1,0) -> u_frame = -u); axis x: z = c - u (left normal of (1,0) is (0,1) -> u_frame = -u)
      for (const sd of [0, 1]) for (let c = Math.floor((0 - sd * DRAIN.off) / DRAIN.cell); c <= Math.floor((Lr - sd * DRAIN.off) / DRAIN.cell); c++) { const d = drainAt(c, sd, Lr);
        if (!d.on || d.v < 1 || d.v > Lr - 1 || Math.min(d.v, Lr - d.v) <= 8) continue; const u = (sd ? 1 : -1) * (w - 0.3); const q = at(d.v, u), m = at(d.v, 0);
        if (!landAt(q.x, q.z)) continue; // frame +c must point at the kerb (world side of +u): frame left normal is -u side, so flip t when sd = 1
        const tx = sd ? -m.tx : m.tx, tz = sd ? -m.tz : m.tz; this.add({ k: 'drain', x: m.x, z: m.z, tx, tz, kerbC: w, y0: 0, r: 0.7, h: ih(9000 + si, c, sd), ox: q.x, oz: q.z }); }
      for (let c = 0; c <= Math.floor(Lr / 34); c++) { const h1 = ih(9000 + si, c, 21), h2 = ih(9000 + si, c, 22), h3 = ih(9000 + si, c, 23); const v = (c + 0.2 + 0.6 * h1) * 34;
        if (h3 < 0.22 || v > Lr - 2 || Math.min(v, Lr - v) < 15) continue; const u = (h2 < 0.5 ? -1 : 1) * (fr(h2 * 2) < 0.5 ? 1.75 : 5.25); const q = at(v, u); if (!landAt(q.x, q.z)) continue;
        const kind = h3 > 0.86 ? 'telecom' : 'manhole'; this.add({ k: kind, x: q.x, z: q.z, tx: q.tx, tz: q.tz, y0: 0, r: kind === 'telecom' ? 0.8 : 0.85, h: ih(9000 + si, c, 24), steam: kind === 'manhole' && h3 < 0.36 && h1 > 0.5 }); }
    }
  }
  // free of colliders? (lamps, palms, poles, clutter, shop groups, gap / alley boxes, buildings …) circle (x, z, r)
  free(x, z, r) {
    const col = this.col; if (!col || !col.query) return true; const L = col.query(x, z, r + 1, this._tmp || (this._tmp = []));
    for (const b of L) { if (b.h < 0.05) continue;
      if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = Math.abs(rx * o.ux + rz * o.uz), lw = Math.abs(-rx * o.uz + rz * o.ux); if (la < o.hl + r && lw < o.hw + r) return false; continue; }
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false; }
    return true;
  }
  sync(cam) {
    if (GROUND_OFF || !cam) return; const p = cam.position;
    const far = p.y > 60; // high above the street: nothing (all within 80 m of the street would be sub-pixel)
    if (this.last && (far ? this.last.far : (!this.last.far && Math.hypot(p.x - this.last.x, p.z - this.last.z) < REBUILD))) return;
    this.last = { x: p.x, z: p.z, far }; this.rebuild(p, far);
  }
  rebuild(p, far) {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); } this.meshes = []; this.stats.built = 0; this.stats.tris = 0; this.stats.skipped = 0;
    if (far) { this.stats.meshes = 0; return; }
    this.stats.rebuilds++; const W = new World(1e7); const R = NEAR_R; const v = W.b('vcol', 0, 0);
    for (let gx = Math.floor((p.x - R) / CELL); gx <= Math.floor((p.x + R) / CELL); gx++) for (let gz = Math.floor((p.z - R) / CELL); gz <= Math.floor((p.z + R) / CELL); gz++) {
      const l = this.grid.get(gx + ',' + gz); if (!l) continue;
      for (const it of l) { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d > R) continue;
        if (!it.nocheck) { if (it.k === 'trench') { let sk = 0; for (let i = 0; i < it.n; i++) { const a = i * 0.8 + 0.4; if (!this.free(it.x + it.tx * a, it.z + it.tz * a, 0.3)) sk |= 1 << i; } it.skip = sk; if (sk === (1 << it.n) - 1) { this.stats.skipped++; continue; } }
          else if (!this.free(it.ox ?? it.x, it.oz ?? it.z, it.r)) { this.stats.skipped++; continue; } }
        this.stats.built++;
        switch (it.k) {
          case 'manhole': manhole(v, it); if (it.steam) plume(W, it.x, 0.02, it.z, 0.9, 2.6, [0.85, 0.86, 0.9]); break;
          case 'telecom': telecom(v, it); break;
          case 'drain': drain(v, it); break;
          case 'trench': trench(v, it); break;
          case 'hatch': hatch(v, it); break;
          case 'vent': vent(v, it); plume(W, it.x, it.y0 + 0.02, it.z, 0.8, 2.2, [0.86, 0.87, 0.9]); break;
          case 'kerb': kerbWear(v, it); break;
        } } }
    this.meshes = W.build(this.group, this.mats, { vcol: { cast: false }, steam: { cast: false, receive: false } });
    for (const m of this.meshes) { this.stats.tris += m.geometry.index.count / 3;
      if (m.material === this.mats.vcol) { // own polygon offset around this draw only (shared material, same program)
        m.onBeforeRender = (r, s, c, g, mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -6; };
        m.onAfterRender = (r, s, c, g, mat) => { mat.polygonOffset = false; mat.polygonOffsetFactor = 0; mat.polygonOffsetUnits = 0; }; } }
    this.stats.meshes = this.meshes.length;
  }
}
