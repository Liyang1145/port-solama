// r6.4 a_landmarks: close-up modelling of map A 索拉纳港's landmarks — the jetty lighthouse, the 「海风之眼」 Ferris wheel
// and extra Art Deco hotel detail (original designs, Florida / Streamline-Moderne flavour, strictly non-neon: painted stucco,
// steel, glass; the only lit parts are the lighthouse lens and the wheel's warm incandescent bulbs).
// Two layers per landmark:
//   * base (resident, always drawn, a skyline guide from kilometres away): landmarksBase() — a few hundred triangles each;
//   * near detail (STREAMED through the r6.2 detail stream, built within DLOAD m and disposed past DFREE m): job closures
//     'lighthouse' / 'wheel' / 'deco2', deterministic (local mulb seed), they never touch the city's global rng sequence.
import * as THREE from 'three';
import { job, mulb, seedOf, edgesOf, lb, frame, fbox, COL } from './bldgdetail.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
// put geometry g with Euler rotation (rx, ry, rz), scale, position
function rput(bk, g, x, y, z, col, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)); bk.geom(g, _m, {}, col);
}
const G = {};
function geos() {
  if (G.box) return G;
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1); G.cyl8.translate(0, 0.5, 0);
  G.cyl16 = new THREE.CylinderGeometry(1, 1, 1, 16, 1); G.cyl16.translate(0, 0.5, 0);
  G.tube = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); // centred, along Y
  G.ball = new THREE.SphereGeometry(1, 10, 6);
  G.bulb = new THREE.OctahedronGeometry(1, 0);
  G.ring = new THREE.TorusGeometry(1, 0.16, 6, 20);       // porthole frame, in the XY plane
  G.disc = new THREE.CircleGeometry(0.86, 16);            // porthole glass, facing +Z
  G.rock = new THREE.DodecahedronGeometry(1, 0);
  // chevron (inverted V) relief tile: 1 m wide, 0.5 m tall, 1 m deep (scaled), extruded along +Z
  { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(-0.32, 0); sh.lineTo(0, 0.32); sh.lineTo(0.32, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 0.5); sh.lineTo(-0.5, 0);
    G.chev = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); }
  // stepped "ziggurat" relief tile (three tiers), 1 m wide, 0.5 m tall, extruded 1 m along +Z
  { const sh = new THREE.Shape(); const pts = [[-0.5, 0], [0.5, 0], [0.5, 0.18], [0.3, 0.18], [0.3, 0.34], [0.12, 0.34], [0.12, 0.5], [-0.12, 0.5], [-0.12, 0.34], [-0.3, 0.34], [-0.3, 0.18], [-0.5, 0.18]];
    sh.moveTo(...pts[0]); for (const q of pts.slice(1)) sh.lineTo(...q); sh.lineTo(...pts[0]);
    G.zig = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); }
  return G;
}
// a straight tube (cylinder) between two 3-D points
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function rod(bk, g, ax, ay, az, bx, by, bz, r, col) {
  _a.set(ax, ay, az); _b.set(bx, by, bz); _d.subVectors(_b, _a); const len = _d.length(); if (len < 1e-4) return;
  _q.setFromUnitVectors(_up, _d.divideScalar(len)); _m.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(r, len, r)); bk.geom(g, _m, {}, col);
}
// geometry in an edge frame: local +X along the wall, local +Z out of the wall, at wall coordinate a, offset d, height y
function eput(bk, g, E, a, d, y, col, sx = 1, sy = 1, sz = 1) {
  const [x, z] = E.P(a, d); const ry = Math.atan2(E.ox, E.oz); // local +Z -> (ox, oz)
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(sx, sy, sz)); bk.geom(g, _m, {}, col);
}

// ------------------------------------------------------------------------------------------------ palette ----
const WHITE = [0.93, 0.92, 0.88], RED = [0.66, 0.14, 0.09], BLACK = [0.1, 0.105, 0.11], VERD = [0.25, 0.4, 0.35], STONE = [0.44, 0.42, 0.38];
const LENS = [1.0, 0.82, 0.5], BULB = [1.0, 0.86, 0.6];

// ======================================================================== base (resident) =====
// ctx: the city build context {W, col}; pick: the city rng's pick (called exactly 16 times, as the v4 landmarks did, so
// the shared layout rng sequence after this point is unchanged); ds: the r6.2 detail stream.
export const LH = { x: 528, z: -374 }, WH = { x: 384, z: 352, R: 16 };
export function landmarksBase(ctx, pick, ds) {
  const { W, col } = ctx; const g = geos();
  // ---------------------------------------------------------------- lighthouse 「南堤灯塔」 ----
  { const { x, z } = LH; const v = W.b('vcol', x, z);
    // stone plinth drum on the rubble mound, white tapered tower with one terracotta day-mark band, black watch room,
    // round gallery, lantern (amber lens inside clear glazing), verdigris copper dome, ventilator ball, lightning rod
    const pl = new THREE.CylinderGeometry(3.7, 4.1, 2.7, 12); pl.translate(0, 1.35, 0); rput(v, pl, x, -1.6, z, STONE);
    rput(v, new THREE.CylinderGeometry(3.85, 3.85, 0.18, 12), x, 1.19, z, [0.56, 0.55, 0.51]);
    const seg = [[1.1, 10.6, WHITE], [10.6, 13.6, RED], [13.6, 22.4, WHITE]]; const rAt = (y) => 2.5 - (y - 1.1) / 21.9 * 0.75;
    for (const [y0, y1, c] of seg) { const t = new THREE.CylinderGeometry(rAt(y1), rAt(y0), y1 - y0, 20, 1, true); t.translate(0, (y0 + y1) / 2, 0); rput(v, t, x, 0, z, c); }
    rput(v, new THREE.CylinderGeometry(2.05, 1.75, 0.6, 20), x, 22.7, z, WHITE);                 // corbel ring
    rput(v, new THREE.CylinderGeometry(3.0, 3.0, 0.3, 24), x, 23.15, z, [0.2, 0.2, 0.21]);        // gallery deck
    rput(v, new THREE.CylinderGeometry(1.75, 1.75, 1.2, 16), x, 23.9, z, BLACK);                  // watch room
    rput(v, new THREE.CylinderGeometry(1.55, 1.55, 0.5, 16), x, 24.75, z, BLACK);                 // lantern parapet
    rput(W.b('glassRail', x, z), new THREE.CylinderGeometry(1.42, 1.42, 2.3, 12, 1, true), x, 26.15, z, null); // glazing
    rput(W.b('neon', x, z), new THREE.CylinderGeometry(0.55, 0.75, 1.6, 12), x, 26.0, z, LENS);  // lens (lit)
    rput(v, new THREE.CylinderGeometry(1.62, 1.62, 0.16, 16), x, 27.38, z, BLACK);
    { const d = new THREE.SphereGeometry(1.62, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2); d.scale(1, 0.75, 1); rput(v, d, x, 27.46, z, VERD); }
    rput(v, g.ball, x, 28.95, z, VERD, 0, 0, 0, 0.32, 0.32, 0.32);
    rput(v, g.cyl8, x, 28.2, z, BLACK, 0, 0, 0, 0.13, 0.5, 0.13);
    rput(v, g.cyl8, x, 29.2, z, [0.3, 0.3, 0.3], 0, 0, 0, 0.025, 1.6, 0.025);
    col.add(x - 3.9, z - 3.9, x + 3.9, z + 3.9, 30, 'lighthouse');
    if (ds) ds.add(x, z, 9, job('lighthouse', (Wd) => lighthouseDetail(Wd)));
  }
  // ---------------------------------------------------------------- Ferris wheel 「海风之眼」 ----
  { const { x, z, R } = WH; const H = R + 3; const v = W.b('vcol', x, z); const n = W.b('neon', x, z); const m = W.b('metal', x, z);
    for (const sz of [-1.2, 1.2]) {
      rput(v, new THREE.TorusGeometry(R, 0.24, 6, 64), x, H, z + sz, [0.95, 0.95, 0.94]);           // outer chord
      rput(v, new THREE.TorusGeometry(R - 1.5, 0.13, 5, 48), x, H, z + sz, [0.95, 0.95, 0.94]);     // inner chord (truss)
      rput(n, new THREE.TorusGeometry(R + 0.33, 0.06, 4, 64), x, H, z + sz, [0.9, 0.74, 0.48]);     // warm bulb ring
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const sp = new THREE.CylinderGeometry(0.08, 0.08, R - 1.5, 4); sp.translate(0, (R - 1.5) / 2, 0); sp.rotateZ(a); rput(v, sp, x, H, z + sz, [0.9, 0.9, 0.9]); }
      for (const dx of [-1, 1]) { const L = Math.hypot(H, R * 0.55); const leg = new THREE.CylinderGeometry(0.3, 0.48, L, 8); const ang = Math.atan2(R * 0.55, H) * dx; leg.translate(0, L / 2, 0); leg.rotateZ(ang); rput(v, leg, x - dx * R * 0.55, 0, z + sz * 1.3, [0.9, 0.9, 0.9]); }
    }
    rput(m, g.cyl16, x, H, z - 1.7, null, Math.PI / 2, 0, 0, 1.1, 3.4, 1.1);   // hub drum (along z)
    rput(m, g.cyl8, x, H, z - 2.4, null, Math.PI / 2, 0, 0, 0.32, 4.8, 0.32);  // axle
    const cols = [];
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.1; const gx = x + Math.cos(a) * R, gy = H + Math.sin(a) * R; const c = pick([[0.95, 0.4, 0.45], [0.25, 0.65, 0.75], [0.98, 0.8, 0.3], [0.95, 0.95, 0.92]]); cols.push(c);
      rput(v, g.box, gx, gy - 1.45, z, c, 0, 0, 0, 1.6, 1.6, 1.8); }
    // boarding deck (top 0.75, matches the cabin floor at the bottom of the turn) on the sloping sand
    rput(v, g.box, x, 0.05, z, [0.85, 0.82, 0.76], 0, 0, 0, 12, 1.4, 6.4);
    col.add(x - R * 0.7, z - 3.2, x + R * 0.7, z + 3.2, 6, 'wheel');
    if (ds) ds.add(x, z, R + 8, job('wheel', (Wd) => wheelDetail(Wd, cols)));
  }
}

// ======================================================================== lighthouse near detail =====
function lighthouseDetail(W) {
  const { x, z } = LH; const g = geos(); const v = W.b('vcol', x, z); const m = W.b('metal', x, z); const r = mulb(seedOf(x, z, 31));
  const rAt = (y) => 2.5 - (y - 1.1) / 21.9 * 0.75;
  // gallery: 20 corbels under the deck, railing (posts + top rail + two intermediate rails), drip edge
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a);
    rput(v, g.box, x + c * 2.35, 22.6, z + s * 2.35, WHITE, 0, -a, 0, 1.2, 0.8, 0.22);
    rput(v, g.box, x + c * 2.75, 22.88, z + s * 2.75, WHITE, 0, -a, 0, 0.5, 0.26, 0.2); }
  for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; rput(v, g.cyl8, x + Math.cos(a) * 2.9, 23.3, z + Math.sin(a) * 2.9, BLACK, 0, 0, 0, 0.035, 1.05, 0.035); }
  for (const [y, t] of [[24.35, 0.05], [23.95, 0.025], [23.62, 0.025]]) rput(v, new THREE.TorusGeometry(2.9, t, 4, 40), x, y, z, BLACK, Math.PI / 2);
  // watch room: four small square windows + a gallery door, frames
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const c = Math.cos(a), s = Math.sin(a);
    rput(v, g.box, x + c * 1.76, 23.95, z + s * 1.76, [0.06, 0.08, 0.1], 0, -a + Math.PI / 2, 0, 0.6, 0.6, 0.04);
    rput(v, g.box, x + c * 1.75, 23.95, z + s * 1.75, [0.75, 0.72, 0.64], 0, -a + Math.PI / 2, 0, 0.74, 0.74, 0.03); }
  // lantern: 12 astragals (glazing bars), a mid transom ring, roof gutter + 8 lion-head-free plain drip spouts
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; rput(v, g.box, x + Math.cos(a) * 1.44, 26.15, z + Math.sin(a) * 1.44, BLACK, 0, -a, 0, 0.07, 2.3, 0.09); }
  rput(v, new THREE.TorusGeometry(1.44, 0.04, 4, 24), x, 26.15, z, BLACK, Math.PI / 2);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; rput(v, g.box, x + Math.cos(a) * 1.75, 27.33, z + Math.sin(a) * 1.75, BLACK, 0, -a, 0, 0.32, 0.07, 0.08); }
  // lens: tiers of prism rings (thin warm bands on the glowing lens) + the lamp pedestal
  const n = W.b('neon', x, z);
  for (let k = 0; k < 6; k++) { const y = 25.35 + k * 0.26; const rr = 0.78 - k * 0.04; rput(n, new THREE.TorusGeometry(rr, 0.04, 4, 20), x, y, z, [1.0, 0.92, 0.7], Math.PI / 2); }
  rput(v, g.cyl8, x, 25.0, z, [0.55, 0.45, 0.25], 0, 0, 0, 0.25, 0.25, 0.25);
  // tower: spiral of small stair windows (dark glass in white frames), a seam ring every 2.4 m (block courses)
  for (let k = 0; k < 6; k++) { const y = 4.2 + k * 3.0; const a = k * 1.15 + 0.6; const rr = rAt(y); const c = Math.cos(a), s = Math.sin(a);
    rput(v, g.box, x + c * (rr + 0.02), y, z + s * (rr + 0.02), [0.07, 0.09, 0.11], 0, -a + Math.PI / 2, 0, 0.5, 0.9, 0.06);
    rput(v, g.box, x + c * (rr + 0.03), y - 0.52, z + s * (rr + 0.03), [0.85, 0.84, 0.8], 0, -a + Math.PI / 2, 0, 0.7, 0.1, 0.16);  // sill
    rput(v, g.box, x + c * (rr + 0.03), y + 0.52, z + s * (rr + 0.03), [0.85, 0.84, 0.8], 0, -a + Math.PI / 2, 0, 0.72, 0.12, 0.18); } // hood
  for (let y = 3.5; y < 22; y += 2.4) { if (y > 10.4 && y < 13.8) continue; rput(v, new THREE.TorusGeometry(rAt(y) + 0.005, 0.018, 3, 28), x, y, z, [0.82, 0.81, 0.77], Math.PI / 2); }
  for (const y of [10.6, 13.6]) rput(v, new THREE.TorusGeometry(rAt(y) + 0.01, 0.05, 4, 28), x, y, z, [0.85, 0.84, 0.8], Math.PI / 2);
  // weathering: faint rust streaks under the gallery drip spouts (thin darker slivers on the white shaft)
  for (let k = 0; k < 5; k++) { const a = r() * Math.PI * 2; const y1 = 22.3, y0 = y1 - 1.5 - r() * 3; const rr = rAt((y0 + y1) / 2);
    rput(v, g.box, x + Math.cos(a) * (rr + 0.012), (y0 + y1) / 2, z + Math.sin(a) * (rr + 0.012), [0.74, 0.66, 0.56], 0, -a + Math.PI / 2, 0, 0.08 + r() * 0.08, y1 - y0, 0.01); }
  // entrance facing the jetty (west): door, Deco-stepped surround, brass plaque, steps down to a short concrete bridge
  { const a = Math.PI; const c = Math.cos(a), s = Math.sin(a); const rr = rAt(2.3);
    rput(v, g.box, x + c * (rr + 0.03), 2.25, z + s * (rr + 0.03), [0.16, 0.26, 0.24], 0, -a + Math.PI / 2, 0, 1.1, 2.2, 0.08);
    // stepped surround: each tier is a deep block buried 0.5 m into the curved shaft so its outer edges never float off the wall
    for (const [w, h, d] of [[1.6, 2.75, 0.14], [1.9, 3.05, 0.1]]) { const dep = d + 0.5, rc = rr + d - dep / 2;
      rput(v, g.box, x + c * rc, 1.15 + h - 0.12, z + s * rc, WHITE, 0, -a + Math.PI / 2, 0, w, 0.24, dep);
      for (const sd of [-1, 1]) rput(v, g.box, x + c * rc, 1.15 + h / 2, z + s * rc + sd * w / 2, WHITE, 0, -a + Math.PI / 2, 0, 0.18, h, dep); }
    { const rp = rAt(4.75); rput(v, g.box, x + c * (rp + 0.02), 4.75, z, [0.62, 0.5, 0.26], 0, -a + Math.PI / 2, 0, 0.5, 0.34, 0.04); } // bronze plaque over the door
  }
  const deckY = 0.95; const bx0 = 522.2, bx1 = 525.4, bz0 = -376.0, bz1 = -372.0;
  fbox(v, frame(0, 0), bx0, bx1, bz0, bz1, -1.2, deckY, [0.6, 0.59, 0.56]);
  for (const zz of [bz0 + 0.12, bz1 - 0.12]) { for (let xx = bx0 + 0.2; xx <= bx1; xx += 1.0) rput(m, g.cyl8, xx, deckY, zz, null, 0, 0, 0, 0.035, 1.05, 0.035);
    for (const y of [deckY + 1.0, deckY + 0.55]) rput(m, g.box, (bx0 + bx1) / 2, y, zz, null, 0, 0, 0, bx1 - bx0, 0.05, 0.05); }
  // plinth rim: iron mooring bollards, a steel access ladder into the water (east), rubble boulders hugging the drum
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; rput(v, g.cyl8, x + Math.cos(a) * 3.35, 1.28, z + Math.sin(a) * 3.35, [0.13, 0.14, 0.15], 0, 0, 0, 0.17, 0.45, 0.17);
    rput(v, g.ball, x + Math.cos(a) * 3.35, 1.74, z + Math.sin(a) * 3.35, [0.13, 0.14, 0.15], 0, 0, 0, 0.2, 0.12, 0.2); }
  for (const dz of [-0.3, 0.3]) rput(m, g.box, x + 4.0, -0.3, z + dz, null, 0, 0, 0, 0.06, 3.0, 0.06);
  for (let y = -1.6; y < 1.2; y += 0.3) rput(m, g.box, x + 4.0, y, z, null, 0, 0, 0, 0.04, 0.04, 0.6);
  for (let k = 0; k < 22; k++) { const a = r() * Math.PI * 2; const rr = 3.9 + r() * 1.6; const sc = 0.6 + r() * 0.9; const c = 0.3 + r() * 0.12;
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (px < 526 && pz > -377.5 && pz < -371) continue; // keep the bridge clear
    rput(v, g.rock, px, -1.1 + r() * 0.6, pz, [c * 1.02, c * 0.97, c * 0.88], r() * 6, r() * 6, r() * 6, sc * 1.2, sc * 0.7, sc); }
}

// ======================================================================== Ferris wheel near detail =====
// beach sand height inside the Deco stretch (mirrors city.js beachH with beachOff = 0; the wheel sits at z = 352)
const sandY = (x) => { const t = Math.min(1, Math.max(0, (x - 335) / 145)); return 0.15 - Math.pow(t, 1.6) * 2.9 - t * 0.2; };
function wheelDetail(W, cols) {
  const { x, z, R } = WH; const H = R + 3; const g = geos(); const v = W.b('vcol', x, z); const m = W.b('metal', x, z); const n = W.b('neon', x, z);
  const WH1 = [0.95, 0.95, 0.94], Ri = R - 1.5;
  const P = (a, rr, sz) => [x + Math.cos(a) * rr, H + Math.sin(a) * rr, z + sz];
  // rim truss: zig-zag diagonals between the outer and inner chords on both faces, cross ties between the two faces
  for (const sz of [-1.2, 1.2]) for (let k = 0; k < 48; k++) { const a0 = k / 48 * Math.PI * 2, a1 = (k + 1) / 48 * Math.PI * 2;
    const A = P(a0, R, sz), B = P(a1, Ri, sz); if (k % 2) { const t = P(a0, Ri, sz), u = P(a1, R, sz); rod(v, g.tube, ...t, ...u, 0.05, WH1); } else rod(v, g.tube, ...A, ...B, 0.05, WH1); }
  // (classic two-rim wheel: the only members crossing between the faces are the gondola axles, so cabins swing freely)
  // tension cables: hub flanges to the inner chord, each in its own face plane (nothing crosses the cabin gap)
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2 + 0.065; const sz = k % 2 ? 1.2 : -1.2; rod(v, g.tube, x, H, z + sz * 1.21, ...P(a, Ri, sz), 0.022, [0.75, 0.76, 0.78]); }
  for (const sz of [-1.21, 1.21]) rput(m, new THREE.CylinderGeometry(1.6, 1.6, 0.12, 20), x, H, z + sz, null, Math.PI / 2);   // hub flanges
  // warm incandescent bulbs along every spoke (daylight: pale glass; night: warm sparkle) — no coloured tubes on map A
  for (const sz of [-1.32, 1.32]) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (let j = 1; j <= 6; j++) { const rr = 1.6 + j * (Ri - 1.8) / 6; rput(n, g.bulb, ...P(a, rr, sz), BULB, 0, 0, 0, 0.09, 0.09, 0.09); } }
  // gondolas: pivot pin on the rim, hanger yoke, rounded-roof cabin around the base box (envelope never cuts it), windows, floor pan
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.1; const gx = x + Math.cos(a) * R, gy = H + Math.sin(a) * R; const c = cols[k];
    rput(m, g.cyl8, gx, gy, z - 1.25, null, Math.PI / 2, 0, 0, 0.11, 2.5, 0.11);
    for (const sd of [-1, 1]) rod(v, g.tube, gx, gy, z + sd * 1.0, gx, gy - 0.6, z + sd * 0.96, 0.05, [0.3, 0.31, 0.33]);
    const y0 = gy - 2.28, y1 = gy - 0.6; const cy = (y0 + y1) / 2;
    rput(v, g.box, gx, y0 + 0.2, z, [0.24, 0.25, 0.27], 0, 0, 0, 1.78, 0.4, 1.98);                                    // floor pan
    rput(v, g.box, gx, y0 + 0.62, z, c, 0, 0, 0, 1.74, 0.46, 1.94);                                                     // lower body
    for (const sx of [-1, 1]) rput(v, g.box, gx + sx * 0.83, cy + 0.32, z, [0.08, 0.1, 0.12], 0, 0, 0, 0.1, 0.78, 1.7);  // side glass
    for (const sd of [-1, 1]) rput(v, g.box, gx, cy + 0.32, z + sd * 0.93, [0.08, 0.1, 0.12], 0, 0, 0, 1.5, 0.78, 0.1);  // end glass
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rput(v, g.box, gx + px * 0.84, cy + 0.3, z + pz * 0.94, WH1, 0, 0, 0, 0.1, 0.9, 0.1); // corner posts
    rput(v, g.box, gx, y1 + 0.02, z, WH1, 0, 0, 0, 1.84, 0.12, 2.04);                                                  // roof slab
    const dm = new THREE.SphereGeometry(1, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2); rput(v, dm, gx, y1 + 0.08, z, c, 0, 0, 0, 0.92, 0.28, 1.02); // roof dome
  }
  // A-frame bracing: horizontal ties and X braces between each leg pair, ties between the front and back frames
  const L = (dx, s, t) => [x - dx * R * 0.55 * (1 - t), H * t, z + s * 1.56];
    for (const sz of [-1.2, 1.2]) { const s = Math.sign(sz); rod(v, g.tube, ...L(-1, s, 0.03), ...L(1, s, 0.15), 0.09, WH1); rod(v, g.tube, ...L(1, s, 0.03), ...L(-1, s, 0.15), 0.09, WH1); rod(v, g.tube, ...L(-1, s, 0.15), ...L(1, s, 0.15), 0.11, WH1); }
  for (const dx of [-1, 1]) for (const t of [0.15]) { const A = L(dx, -1, t), B = L(dx, 1, t); rod(v, g.tube, ...A, ...B, 0.1, WH1); }
  // concrete footings at the four leg feet (the sand slopes away to the sea), anchor plates
  for (const dx of [-1, 1]) for (const s of [-1, 1]) { const fx = x - dx * R * 0.55, fz = z + s * 1.56;
    rput(v, g.box, fx, -0.45, fz, [0.66, 0.65, 0.62], 0, 0, 0, 1.6, 1.0, 1.6); rput(v, g.box, fx, 0.1, fz, [0.3, 0.31, 0.33], 0, 0, 0, 1.1, 0.1, 1.1); }
  // drive house behind the deck: louvred steel shed with a service door
  { const hx = x, hz = z + 5.0; rput(v, g.box, hx, 0.75, hz, [0.78, 0.77, 0.74], 0, 0, 0, 4.0, 2.6, 2.4); rput(v, g.box, hx, 2.12, hz, [0.36, 0.37, 0.39], 0, 0, 0, 4.3, 0.14, 2.7);
    for (let k = 0; k < 6; k++) rput(v, g.box, hx + 0.9, 0.7 + k * 0.2, hz + 1.22, [0.42, 0.43, 0.45], 0, 0, 0, 1.6, 0.06, 0.06);
    rput(v, g.box, hx - 1.0, 0.6, hz + 1.21, [0.3, 0.42, 0.46], 0, 0, 0, 0.9, 1.9, 0.04); }
  // boarding deck furniture: perimeter railing with a gap at the steps, three steps down to the sand (promenade side, west),
  // gate turnstile posts, deck planking lines, ticket kiosk with a striped canvas awning, queue stanchions with ropes
  const dy = 0.75; const x0 = x - 6, x1 = x + 6, z0 = z - 3.2, z1 = z + 3.2;
  const rail = [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z + 1.4]], [[x0, z - 1.4], [x0, z0]]];
  for (const [[ax, az], [bx, bz]] of rail) { const len = Math.hypot(bx - ax, bz - az); const nP = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= nP; i++) { const t = i / nP; rput(m, g.cyl8, ax + (bx - ax) * t, dy, az + (bz - az) * t, null, 0, 0, 0, 0.035, 1.05, 0.035); }
    for (const y of [dy + 1.02, dy + 0.55]) rod(m, g.tube, ax, y, az, bx, y, bz, 0.03, null); }
  for (let k = 0; k < 3; k++) { const top = dy - (k + 1) * 0.25; rput(v, g.box, x0 - 0.18 - k * 0.35, (top - 0.7) / 2, z, [0.8, 0.78, 0.72], 0, 0, 0, 0.36, top + 0.7, 2.8); }
  for (let xx = x0 + 0.5; xx < x1; xx += 0.5) rput(v, g.box, xx, dy + 0.002, z, [0.7, 0.67, 0.6], 0, 0, 0, 0.03, 0.002, 6.3);
  { const kx = x - 11.5, kz = z - 6.5; const KW = [0.95, 0.92, 0.84], GL = [0.08, 0.1, 0.12]; // ticket kiosk, serving the promenade (west)
    rput(v, g.box, kx, -0.1, kz, [0.75, 0.74, 0.7], 0, 0, 0, 3.0, 0.8, 2.6);                       // plinth
    rput(v, g.box, kx, 1.2, kz, KW, 0, 0, 0, 2.2, 2.6, 2.0);                                          // body
    rput(v, g.box, kx, 0.65, kz, [0.25, 0.55, 0.58], 0, 0, 0, 2.24, 0.5, 2.04);                      // teal dado
    rput(v, g.box, kx - 1.11, 1.7, kz, GL, 0, 0, 0, 0.04, 0.95, 1.5);                                 // west ticket window
    rput(v, g.box, kx - 1.24, 1.16, kz, [0.55, 0.42, 0.3], 0, 0, 0, 0.3, 0.07, 1.7);                  // counter
    for (const dz of [-0.76, 0, 0.76]) rput(v, g.box, kx - 1.14, 1.7, kz + dz, KW, 0, 0, 0, 0.05, 1.0, 0.06);
    rput(v, g.box, kx, 1.75, kz - 1.01, GL, 0, 0, 0, 1.2, 0.8, 0.04);                                 // south window
    rput(v, g.box, kx, 2.62, kz, [0.25, 0.55, 0.58], 0, 0, 0, 2.5, 0.26, 2.3);                      // teal fascia board
    rput(v, g.box, kx, 2.8, kz, KW, 0, 0, 0, 2.6, 0.1, 2.4);                                          // roof cap
    for (let k = 0; k < 7; k++) { const z0 = kz - 1.1 + (k + 0.5) * 2.2 / 7; rput(v, g.box, kx - 1.62, 2.3, z0, k % 2 ? [0.95, 0.94, 0.9] : [0.86, 0.3, 0.32], 0, 0, 0.45, 1.05, 0.03, 2.2 / 7); }
    rput(v, g.box, kx - 2.1, 2.07, kz, [0.86, 0.3, 0.32], 0, 0, 0, 0.03, 0.2, 2.2); }              // awning valance
  for (let k = 0; k < 5; k++) { const sx = x - 9.5 + k * 1.3; const gy = sandY(sx), gp = sandY(sx - 1.3); for (const zz of [z - 1.1, z + 1.1]) { rput(m, g.cyl8, sx, gy - 0.2, zz, null, 0, 0, 0, 0.04, 1.2, 0.04); rput(v, g.cyl8, sx, gy - 0.04, zz, [0.2, 0.2, 0.2], 0, 0, 0, 0.16, 0.07, 0.16); }
    if (k) for (const zz of [z - 1.1, z + 1.1]) rod(v, g.tube, sx - 1.3, gp + 0.88, zz, sx, gy + 0.88, zz, 0.025, [0.62, 0.12, 0.14]); }
}

// ======================================================================== Deco hotel close-up detail =====
// p: the same params decoHotel() hands to decoHotelDetail (x0,z0,x1,z1,facing,poly,top,ground,floors,fh,wall,accent,R,pylon,small)
export function decoCloseJob(p) { return job('deco2', (Wd) => decoCloseDetail(Wd, p)); }
const mixc = (c, k, add = 0) => c.map((q) => Math.min(1, q * k + add));
function decoCloseDetail(W, p) {
  const r = mulb(seedOf(p.x0, p.z0, 41)); const g = geos(); const bk = W.b('vcol', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2); const m = W.b('metal', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
  const s = p.facing; const fx = s > 0 ? p.x1 : p.x0; const light = mixc(p.wall, 1.06); const cream = [0.95, 0.92, 0.84];
  const motif = r() < 0.5 ? g.chev : g.zig; const yG = 0.15 + p.ground;
  for (const e of edgesOf(p.poly)) {
    const front = e.ox * s > 0.9; if (e.len < 3) continue;
    if (front) {
      // relief frieze in the clear band between the top eyebrow and the cornice: repeated chevrons or stepped ziggurats
      const nT = Math.max(2, Math.floor((e.len - 0.6) / 1.15)); const cw = (e.len - 0.6) / nT;
      lb(bk, e, 0.3, e.len - 0.3, -0.02, 0.05, p.top - 0.74, p.top - 0.24, light);
      for (let k = 0; k < nT; k++) eput(bk, motif, e, 0.3 + (k + 0.5) * cw, 0.05, p.top - 0.7, k % 2 ? p.accent : cream, cw * 0.82, 0.84, 0.07);
      // entrance: glass-block side lights, brass plaque, a pair of concrete urns with clipped shrubs
      const zc = p.pylon ? p.pylon.z : (p.z0 + p.z1) / 2; const a = (zc - e.p[1]) * e.dz + (fx - e.p[0]) * e.dx;
      if (a > 4 && a < e.len - 4) {
        for (const sg of [-1, 1]) { const c0 = a + sg * 2.45; const w = 0.9, y0 = 0.6, y1 = 3.3;
          lb(bk, e, c0 - w / 2 - 0.08, c0 + w / 2 + 0.08, -0.02, 0.1, y0 - 0.12, y1 + 0.12, light);
          lb(bk, e, c0 - w / 2, c0 + w / 2, 0.1, 0.13, y0, y1, [0.66, 0.8, 0.82]);
          for (let k = 1; k < 5; k++) lb(bk, e, c0 - w / 2 + k * w / 5 - 0.015, c0 - w / 2 + k * w / 5 + 0.015, 0.13, 0.15, y0, y1, [0.86, 0.86, 0.83]);
          for (let y = y0 + 0.2; y < y1; y += 0.2) lb(bk, e, c0 - w / 2, c0 + w / 2, 0.13, 0.15, y - 0.015, y + 0.015, [0.86, 0.86, 0.83]);
          const [ux, uz] = e.P(c0, 0.55); rput(bk, new THREE.CylinderGeometry(0.42, 0.26, 0.7, 10), ux, 0.5, uz, [0.82, 0.8, 0.75]);
          rput(bk, g.box, ux, 0.89, uz, [0.78, 0.76, 0.71], 0, 0, 0, 0.9, 0.08, 0.9); rput(bk, g.ball, ux, 1.25, uz, [0.18, 0.36, 0.2], 0, 0, 0, 0.42, 0.38, 0.42); }
        lb(bk, e, a + 1.95, a + 2.25, 0.1, 0.13, 1.5, 1.85, [0.66, 0.53, 0.28]);
      }
    } else if (Math.abs(e.ox * s) < 0.1 && e.len > 6) {
      // side walls: three Streamline "speed lines" wrapping off the front corner at the top of the ground storey
      const nearA = Math.abs((e.p[0] - fx)) < Math.abs((e.q[0] - fx)) ? 0 : e.len; const L = Math.min(4.5, e.len * 0.4);
      const a0 = nearA === 0 ? 0 : e.len - L, a1 = nearA === 0 ? L : e.len;
      for (let k = 0; k < 3; k++) { const y = yG - 0.55 + k * 0.2; lb(bk, e, a0, a1, -0.02, 0.07, y, y + 0.08, k === 1 ? p.accent : light); }
    }
  }
  // rounded corners: tubular "ocean-liner" railings on top of each eyebrow (3 pipes + stanchions), as on Streamline hotels
  if (p.R > 0) { const R2 = p.R + 0.62; const cs = s > 0 ? [[p.x1 - p.R, p.z1 - p.R, Math.PI / 2, 0], [p.x1 - p.R, p.z0 + p.R, 0, -Math.PI / 2]] : [[p.x0 + p.R, p.z1 - p.R, Math.PI, Math.PI / 2], [p.x0 + p.R, p.z0 + p.R, -Math.PI / 2, -Math.PI]];
    for (let i = 0; i < p.floors - 1; i++) { const yb = yG + i * p.fh + p.fh * 0.86 + 0.16;
      for (const [cx, cz, a0, a1] of cs) { const N = 6;
        for (let k = 0; k <= N; k++) { const a = a0 + (a1 - a0) * k / N; rput(m, g.cyl8, cx + Math.cos(a) * R2, yb, cz + Math.sin(a) * R2, null, 0, 0, 0, 0.03, 0.95, 0.03); }
        for (const h of [0.35, 0.65, 0.95]) for (let k = 0; k < N; k++) { const aa = a0 + (a1 - a0) * k / N, ab = a0 + (a1 - a0) * (k + 1) / N;
          rod(m, g.tube, cx + Math.cos(aa) * R2, yb + h, cz + Math.sin(aa) * R2, cx + Math.cos(ab) * R2, yb + h, cz + Math.sin(ab) * R2, 0.028, null); } } } }
  // pylon: portholes on its side faces above the roof, three vertical flutes on each side, flagpole + pennant on the crown
  if (p.pylon) { const zc = p.pylon.z, hw = p.pylon.w - 0.6; const px = s > 0 ? fx - 0.3 : fx + 0.3; const yTop = p.pylonTop || p.top + 4.7;
    for (const sd of [-1, 1]) { const zf = zc + sd * (hw + 0.02); const ry = sd > 0 ? 0 : Math.PI;
      for (let k = 0; k < 2; k++) { const y = p.top + 1.6 + k * 1.15; if (y > yTop - 1.9) break;
        rput(bk, g.ring, px, y, zf + sd * 0.02, cream, 0, ry, 0, 0.38, 0.38, 0.6); rput(bk, g.disc, px, y, zf + sd * 0.005, [0.07, 0.1, 0.12], 0, ry, 0, 0.38, 0.38, 1); }
      for (const dxl of [0.25, 0.6]) rput(bk, g.box, fx + dxl * s, (yG + 0.4 + p.top - 0.2) / 2, zf + sd * 0.04, light, 0, 0, 0, 0.1, p.top - 0.2 - yG - 0.4, 0.08); }
    const fxp = s > 0 ? fx - 0.3 : fx + 0.3; rput(m, g.cyl8, fxp, yTop, zc, null, 0, 0, 0, 0.045, 5.7, 0.045); // grounded on the crown
    rput(bk, g.ball, fxp, yTop + 5.75, zc, [0.75, 0.62, 0.32], 0, 0, 0, 0.09, 0.09, 0.09);
    const fl = new THREE.PlaneGeometry(1.3, 0.75, 4, 1); { const q = fl.attributes.position; for (let i = 0; i < q.count; i++) q.setZ(i, Math.sin(q.getX(i) * 2.4) * 0.12); fl.computeVertexNormals(); }
    const fg = new THREE.BufferGeometry().copy(fl); fg.translate(0.65, 0, 0); const back = fg.clone(); back.scale(1, 1, -1); { const ix = back.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
    for (const geo of [fg, back]) rput(bk, geo, fxp, yTop + 5.2, zc, cream, 0, Math.PI / 2 + r() * 0.6, 0);
    rput(bk, g.box, fxp, yTop + 4.75, zc, p.accent, 0, 0, 0, 0.06, 0.18, 0.06);
  } else {
    // no pylon: a short flagpole at the front parapet centre
    const zc = (p.z0 + p.z1) / 2; const fxp = s > 0 ? fx - 1.0 : fx + 1.0; rput(m, g.cyl8, fxp, p.top + 1.32, zc, null, 0, 0, 0, 0.04, 3.4, 0.04);
    rput(bk, g.box, fxp + 0.0, p.top + 4.2, zc + 0.55, p.accent, 0, 0, 0, 0.03, 0.6, 1.1);
  }
}
