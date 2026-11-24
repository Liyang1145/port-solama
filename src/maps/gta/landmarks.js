// r6.4 a_landmarks: close-up modelling of map A 索拉纳港's landmarks — the jetty lighthouse, the 「海风之眼」 Ferris wheel
// and extra Art Deco hotel detail (original designs, Florida / Streamline-Moderne flavour, strictly non-neon: painted stucco,
// steel, glass; the only lit parts are the lighthouse lens and the wheel's warm incandescent bulbs).
// Two layers per landmark:
//   * base (resident, always drawn, a skyline guide from kilometres away): landmarksBase() — a few hundred triangles each;
//   * near detail (STREAMED through the r6.2 detail stream, built within DLOAD m and disposed past DFREE m): job closures
//     'lighthouse' / 'wheel' / 'deco2', deterministic (local mulb seed), they never touch the city's global rng sequence.
import * as THREE from 'three';
import { job, mulb, seedOf, edgesOf, lb, frame, fbox, COL, DLOAD, DFREE } from './bldgdetail.js';
import { GeoBucket, box } from '../../geo.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';

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
  G.bulb2 = new THREE.SphereGeometry(1, 6, 3);           // a2: spoke bulb (rounded glass envelope)
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
const WHITE = [0.93, 0.92, 0.88], RED = [0.66, 0.14, 0.09], BLACK = [0.1, 0.105, 0.11], VERD = [0.25, 0.4, 0.35], STONE = [0.3, 0.29, 0.27];
const LENS = [1.0, 0.82, 0.5], BULB = [1.0, 0.86, 0.6];

// ======================================================================== base (resident) =====
// ctx: the city build context {W, col}; pick: the city rng's pick (called exactly 16 times, as the v4 landmarks did, so
// the shared layout rng sequence after this point is unchanged); ds: the r6.2 detail stream.
export const LH = { x: 528, z: -374 }, WH = { x: 384, z: 352, R: 16 };
const BR = { x0: 522.2, x1: 525.4, z0: -376.0, z1: -372.0, y: 0.95 }; // lighthouse access bridge (deck top y)
const JO = { a: BR.x0 + 0.16, b: BR.x1 - 0.02 }; // a_jetty: opening in the bridge's south rail / the jetty's north rail (x range); a_wheelcab: east side moved to the bridge end (walkable >= 2 m)
export function landmarksBase(ctx, pick, ds) {
  const { W, col } = ctx; const g = geos();
  // ---------------------------------------------------------------- lighthouse 「南堤灯塔」 ----
  { const { x, z } = LH; const v = W.b('vcol', x, z);
    // stone plinth drum on the rubble mound, white tapered tower with one terracotta day-mark band, black watch room,
    // round gallery, lantern (amber lens inside clear glazing), verdigris copper dome, ventilator ball, lightning rod
    const pl = new THREE.CylinderGeometry(3.7, 4.1, 2.7, 12); pl.translate(0, 1.35, 0); rput(v, pl, x, -1.6, z, STONE);
    rput(v, new THREE.CylinderGeometry(3.85, 3.85, 0.18, 12), x, 1.19, z, [0.4, 0.39, 0.37]);
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
    lighthouseColliders(col); // a_wheelcab: fitted to the tower / plinth drum (was one 7.8 m square that blocked the bridge mouth)
    // a2: bridge railings are solid. a_jetty: the south one opens onto the jetty walkway (JO), the west end gets its own rail
    { const zs = BR.z0 + 0.12, zn = BR.z1 - 0.12, h = BR.y + 1.1;
      col.add(BR.x0, zn - 0.1, BR.x1, zn + 0.1, h, 'rail');
      col.add(BR.x0, zs - 0.1, JO.a, zs + 0.1, h, 'rail'); col.add(JO.b, zs - 0.1, BR.x1, zs + 0.1, h, 'rail');
      col.add(BR.x0 - 0.04, BR.z0, JO.a, BR.z1, h, 'rail'); }
    if (ds) ds.add(x, z, 9, job('lighthouse', (Wd) => lighthouseDetail(Wd)));
  }
  // ---------------------------------------------------------------- Ferris wheel 「海风之眼」 ----
  // a2: the wheel turns. Rim / spokes / bulbs live in one rotating mesh (local to the hub, spun about its axle); the 16 cabins
  // live in one mesh whose vertices are re-translated per frame to their pivot points (they hang level: pure translation,
  // no rotation). Legs, axle, hub drum and the deck stay in the static city batches.
  { const { x, z, R } = WH; const H = R + 3; const v = W.b('vcol', x, z); const m = W.b('metal', x, z);
    const rv = new GeoBucket(), rb = new GeoBucket(), gv = new GeoBucket(), fv = new GeoBucket(); const gr = [], ang = [], fg = [];
    for (const sz of [-1.2, 1.2]) {
      rput(rv, new THREE.TorusGeometry(R, 0.24, 6, 64), 0, 0, sz, [0.95, 0.95, 0.94]);           // outer chord
      rput(rv, new THREE.TorusGeometry(R - 1.5, 0.13, 5, 48), 0, 0, sz, [0.95, 0.95, 0.94]);     // inner chord (truss)
      for (let k = 0; k < 48; k++) { const a = (k + 0.5) / 48 * Math.PI * 2; rput(rb, g.bulb, Math.cos(a) * (R + 0.36), Math.sin(a) * (R + 0.36), sz, BULB, 0, 0, a, 0.1, 0.13, 0.1); } // rim bulbs
      for (let k = 0; k < 48; k++) { const a = (k + 0.5) / 48 * Math.PI * 2; const v0 = fv.vc; rput(fv, g.bulb2, 0, 0, 0, null); fg.push([v0, fv.vc, Math.cos(a) * (R + 0.36), Math.sin(a) * (R + 0.36), sz * 1.05]); } // a4: far glow points (same bulbs, scaled with distance)
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const sp = new THREE.CylinderGeometry(0.08, 0.08, R - 1.5, 4); sp.translate(0, (R - 1.5) / 2, 0); sp.rotateZ(a); rput(rv, sp, 0, 0, sz, [0.9, 0.9, 0.9]); }
      for (const dx of [-1, 1]) { const L = Math.hypot(H, R * 0.55); const leg = new THREE.CylinderGeometry(0.3, 0.48, L, 8); const ang = Math.atan2(R * 0.55, H) * dx; leg.translate(0, L / 2, 0); leg.rotateZ(-ang); rput(v, leg, x - dx * R * 0.55, 0, z + sz * 1.3, [0.9, 0.9, 0.9]); }
    }
    rput(m, g.cyl16, x, H, z - 1.7, null, Math.PI / 2, 0, 0, 1.1, 3.4, 1.1);   // hub drum (along z)
    rput(m, g.cyl8, x, H, z - 2.4, null, Math.PI / 2, 0, 0, 0.32, 4.8, 0.32);  // axle
    const cols = [];
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.1; const c = pick([[0.95, 0.4, 0.45], [0.25, 0.65, 0.75], [0.98, 0.8, 0.3], [0.95, 0.95, 0.92]]); cols.push(c); ang.push(a);
      const v0 = gv.vc; rput(gv, g.box, 0, -1.45, 0, c, 0, 0, 0, 1.6, 1.6, 1.8); gr.push([v0, gv.vc]); }
    // boarding deck (top 0.75, matches the cabin floor at the bottom of the turn) on the sloping sand
    rput(v, g.box, x, 0.05, z, [0.85, 0.82, 0.76], 0, 0, 0, 12, 1.4, 6.4);
    wheelColliders(col);
    // a2: the ticket kiosk and the drive house (the wheel's control booth) are solid too
    col.add(KIOSK.x - 1.5, KIOSK.z - 1.3, KIOSK.x + 1.5, KIOSK.z + 1.3, 2.9, 'kiosk');
    col.add(x - 2.15, z + 3.65, x + 2.15, z + 6.35, 2.2, 'kiosk');
    if (ds) ds.add(x, z, R + 8, job('wheel', (Wd) => wheelDetail(Wd)));
    rig = { x, z, H, R, rv, rb, gv, gr, ang, cols, ds, fv, fg, far: null, fs: 0, base: null, det: null, th: 0, f: 0 };
    rig.cc = cabinColliders(col); rig.ct = null; syncCab();
  }
  return { attach: wheelAttach, update: wheelUpdate };
}

// ======================================================================== turning wheel (a2) =====
// one revolution every ~8 minutes (rim speed ~0.21 m/s, a gentle seaside wheel); angle from the shared clock U.uTime
const SPIN = (Math.PI * 2) / 480; let rig = null, WM = null, BM = null, SC = null;
const KIOSK = { x: WH.x - 11.5, z: WH.z - 6.5 };
function gondGeo(bk, gr) { const geo = bk.build(); const loc = Float32Array.from(geo.attributes.position.array);
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WH.R + 4); geo.userData.loc = loc; geo.userData.gr = gr; return geo; }
function gondMove(geo, th) { const p = geo.attributes.position.array, loc = geo.userData.loc, gr = geo.userData.gr;
  for (let k = 0; k < gr.length; k++) { const a = rig.ang[k] + th, px = Math.cos(a) * rig.R, py = Math.sin(a) * rig.R;
    for (let i = gr[k][0] * 3, e = gr[k][1] * 3; i < e; i += 3) { p[i] = loc[i] + px; p[i + 1] = loc[i + 1] + py; p[i + 2] = loc[i + 2]; } }
  geo.attributes.position.needsUpdate = true; }
function rigMeshes(rv, rb, gv, gr) { const out = [];
  const add = (geo, mat, gond) => { const ms = new THREE.Mesh(geo, mat); ms.position.set(rig.x, rig.H, rig.z); ms.castShadow = true; ms.receiveShadow = true; ms.userData.gond = gond; ms.name = 'wheelRig'; SC.add(ms); out.push(ms); };
  if (rv.vc) add(rv.build(), WM, false); if (rb.vc) add(rb.build(), BM, false); if (gv.vc) add(gondGeo(gv, gr), WM, true);
  return out; }
function wheelAttach(scene, M) {
  if (!rig) return; SC = scene;
  // painted steel (vertex colours, no world-space plaster texture: it would swim over a moving part) + real bulbs:
  // frosted warm-white glass by day, incandescent glow at night (emissive follows U.uNight in wheelUpdate)
  WM = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }), 'vcolc'); // same program as M.vcolCloth (roughness/metalness are uniforms)
  BM = prep(new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.18, metalness: 0.0, emissive: 0xffc27a, emissiveIntensity: 0.0 }), 'pool'); // same program as M.pool (plain colour + emissive)
  rig.base = rigMeshes(rig.rv, rig.rb, rig.gv, rig.gr); rig.rv = rig.rb = rig.gv = null;
  // a4: far glow points — the 96 rim bulbs again, in the same bulb material (same 'pool' program, no new shader), each re-scaled
  // about its own socket with camera distance so the lit rim still reads as a ring of warm dots from the promenade / causeway.
  // Shown only at night and beyond ~60 m (the real bulbs take over close up); casts no shadow.
  { const geo = rig.fv.build(); geo.userData.loc = Float32Array.from(geo.attributes.position.array); geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WH.R + 6); const ms = new THREE.Mesh(geo, BM); ms.position.set(rig.x, rig.H, rig.z);
    ms.name = 'wheelFarGlow'; ms.userData.far = true; ms.visible = false; ms.frustumCulled = true; SC.add(ms); rig.far = ms; rig.base.push(ms); rig.fv = null; }
  wheelUpdate({ x: 1e9, z: 1e9 });
}
function wheelUpdate(cam) {
  if (!rig || !rig.base) return;
  const th = -U.uTime.value * SPIN; const d = Math.hypot(cam.x - rig.x, cam.z - rig.z) - rig.R - 8;
  if (!rig.det && d < DLOAD) { rig.det = wheelSpinDetail(); if (rig.ds) rig.ds.mark(rig.det); }
  else if (rig.det && d > DFREE) { for (const ms of rig.det) { SC.remove(ms); ms.geometry.dispose(); } rig.det = null; }
  BM.emissiveIntensity = 0.02 + U.uNight.value * 4.5;
  syncCab(); // a_wheelcab: the low cabins are solid (follow the turn every frame, near or far: 3 boxes, no draw calls)
  if (rig.far) { const dd = Math.hypot(cam.x - rig.x, cam.z - rig.z); const on = U.uNight.value > 0.05 && dd > 60; rig.far.visible = on;
    if (on) { const sc = Math.min(3.0, Math.max(0.16, dd * 0.0034)); if (Math.abs(sc - rig.fs) > rig.fs * 0.04) { rig.fs = sc; farScale(rig.far.geometry, sc); } } }
  // far away the motion is sub-pixel: re-pose the cabins only every 8th frame there
  if (d > 600 && (rig.f++ & 7)) return;
  for (const ms of rig.det ? rig.base.concat(rig.det) : rig.base) { if (ms.userData.gond) gondMove(ms.geometry, th); else ms.rotation.z = th; }
}

function farScale(geo, sc) { const p = geo.attributes.position.array, loc = geo.userData.loc;
  for (const [a, b, cx, cy, cz] of rig.fg) for (let i = a * 3, e = b * 3; i < e; i += 3) { p[i] = cx + loc[i] * sc; p[i + 1] = cy + loc[i + 1] * sc; p[i + 2] = cz + loc[i + 2] * sc; }
  geo.attributes.position.needsUpdate = true; }

// ======================================================================== a4: walkable decks + split colliders =====
// Boarding deck of the wheel (top 0.75, rail around it, three steps down to the sand on the promenade side) and the lighthouse
// access bridge (top BR.y) are walkable surfaces now: the city's groundH asks landmarkDeckH first.
const WD = { x0: WH.x - 6, x1: WH.x + 6, z0: WH.z - 3.2, z1: WH.z + 3.2, y: 0.75 };
export function landmarkDeckH(x, z) {
  syncCab(); // a_wheelcab: cabin colliders follow the simulation clock even on frames that don't render (groundH runs before the player's resolve)
  { const dx = x - LH.x, dz = z - LH.z; if (dx * dx + dz * dz <= PL.r * PL.r) return PL.y; } // a_wheelcab: lighthouse plinth drum top
  if (z >= WD.z0 && z <= WD.z1) { if (x >= WD.x0 && x <= WD.x1) return WD.y;
    if (x >= WD.x0 - 1.06 && x < WD.x0 && Math.abs(z - WH.z) <= 1.4) { const k = Math.min(2, Math.floor((WD.x0 - x) / 0.35)); return WD.y - (k + 1) * 0.25; } } // the three steps
  if (x >= BR.x0 && x <= BR.x1 && z >= BR.z0 && z <= BR.z1) return BR.y;
  for (const J of JT) { const dz = Math.abs(z - J.zj); if (dz > 2.4 || x < J.sx0 || x > J.x1 + 0.5) continue; // a_jetty: groyne walkway
    if (x >= J.x0) { if (dz <= 1.6 || x >= J.x1 - 3) return J.dy; continue; }                         // deck / round head
    if (dz <= 1.6) return J.base + (J.dy - J.base) * (Math.min(J.n - 1, Math.floor((x - J.sx0) / J.T)) + 1) / (J.n + 1); } // shore stairs
  return undefined;
}
// The wheel used to be one 22 x 6.4 m, 6 m tall box (nobody could reach the deck). Now: the four A-frame feet (footing + the low
// part of each leg), the two X-braced frames (their diagonals cross the deck at body height in the planes z +-1.56), the deck's
// perimeter railing (gap at the steps), and the queue stanchion ropes — so you queue between the ropes, climb the steps and walk
// down the boarding lane between the two braced frames to the cabin gate. The rim's lowest point (2.76 m) and the cabins clear
// a standing person on the deck, so they get no collider.
function wheelColliders(col) {
  const { x, z, R } = WH; const fx = R * 0.55, RH = WD.y + 1.1;
  for (const dx of [-1, 1]) for (const s of [-1, 1]) { const cx = x - dx * fx, cz = z + s * 1.56; // foot + lowest ~2 m of the leg (leans inward 0.46 m per m)
    col.add(Math.min(cx - 0.8, cx + dx * 1.0), cz - 0.8, Math.max(cx + 0.8, cx + dx * 1.0), cz + 0.8, 6, 'wheel'); }
  for (const s of [-1, 1]) col.add(x - fx, z + s * 1.56 - 0.14, x + fx, z + s * 1.56 + 0.14, 3.2, 'wheel');      // X-braced frames
  const r = (x0, z0, x1, z1) => col.add(x0, z0, x1, z1, RH, 'rail');
  r(WD.x0, WD.z0 - 0.08, WD.x1, WD.z0 + 0.08); r(WD.x0, WD.z1 - 0.08, WD.x1, WD.z1 + 0.08); r(WD.x1 - 0.08, WD.z0, WD.x1 + 0.08, WD.z1);
  r(WD.x0 - 0.08, WD.z0, WD.x0 + 0.08, WH.z - 1.4); r(WD.x0 - 0.08, WH.z + 1.4, WD.x0 + 0.08, WD.z1);
  for (const zz of [WH.z - 1.1, WH.z + 1.1]) r(x - 9.5 - 0.06, zz - 0.06, x - 9.5 + 4 * 1.3 + 0.06, zz + 0.06);      // queue ropes
}
// a_wheelcab: cabins at the bottom of the turn sweep the boarding lane. A pool of 3 boxes (at most 3 of the 16 cabins are ever
// within 2.5 m of the deck: 0.39 rad apart, |angle from bottom| < 0.56 rad) follows the lowest cabins every frame. A box is solid
// only while its cabin's floor is below head height (1.9 m) over the deck (or over the sand beside it: a cabin that clears a head
// on the lower sand is clipped to the deck span); higher cabins stay tracked but parked, so you can walk under them. Boxes are registered over the whole low sweep once and only their extents change (no grid churn, no draw calls).
// Test hook: set .off on any box's .pool to park them all (control runs).
const CAB = { hx: 0.92, hz: 1.02, y0: -2.28, y1: -0.24, low: 2.5, head: 1.9, n: 3 };
function cabinColliders(col) { const pool = []; const { x, z, R } = WH; const sx = R * Math.sin(0.6) + CAB.hx;
  for (let i = 0; i < CAB.n; i++) { const b = col.add(x - sx, z - CAB.hz, x + sx, z + CAB.hz, -50, 'cabin'); b.pool = pool; pool.push(b); }
  pool.off = false; return pool; }
function parkCab(b) { b.minX = b.maxX = WH.x; b.minZ = b.maxZ = WH.z; b.h = -50; b.k = -1; }
function syncCab() { if (rig && rig.cc && rig.ct !== U.uTime.value) { rig.ct = U.uTime.value; cabinCol(-U.uTime.value * SPIN); } }
function cabinCol(th) { const C = rig && rig.cc; if (!C) return; let n = 0;
  if (!C.off) for (let k = 0; k < 16 && n < C.length; k++) { const a = rig.ang[k] + th, s = Math.sin(a); const yb = rig.H + s * rig.R + CAB.y0;
    if (yb - WD.y >= CAB.low) continue; const b = C[n++];
    if (yb - WD.y >= CAB.head) { parkCab(b); b.k = k; continue; }
    const px = rig.x + Math.cos(a) * rig.R; let x0 = px - CAB.hx, x1 = px + CAB.hx;
    if (yb - sandY(px) >= CAB.head) { x0 = Math.max(x0, WD.x0); x1 = Math.min(x1, WD.x1); if (x1 <= x0) { parkCab(b); b.k = k; continue; } } // clears a head on the sand: solid only over the deck
    b.minX = x0; b.maxX = x1; b.minZ = rig.z - CAB.hz; b.maxZ = rig.z + CAB.hz;
    b.h = rig.H + s * rig.R + CAB.y1; b.k = k; }
  for (; n < C.length; n++) parkCab(C[n]); }
// a_wheelcab: the lighthouse used to be one 7.8 m square box (it covered the north half of the jetty's round head and left a ~1 m
// bridge mouth). Now: the tower shaft (regular octagon, apothem 2.5 = the shaft radius at its foot, four overlapping bars: two
// axis-aligned + two oriented at 45 deg), the plinth drum as a LOW octagon (apothem 3.85, top 1.2 — a swimmer can't climb it, but
// anyone on the bridge / jetty deck (feet 0.95) steps over it onto the drum top, which landmarkDeckH makes walkable at 1.28), and
// the drum's four iron mooring bollards.
const PL = { r: 3.85, y: 1.28 };
function octagon(col, cx, cz, ap, h, tag) { const hw = ap * Math.tan(Math.PI / 8), c = Math.SQRT1_2;
  col.add(cx - ap, cz - hw, cx + ap, cz + hw, h, tag); col.add(cx - hw, cz - ap, cx + hw, cz + ap, h, tag);
  col.addOBB(cx, cz, c, c, ap, hw, h, tag); col.addOBB(cx, cz, c, -c, ap, hw, h, tag); }
function lighthouseColliders(col) { const { x, z } = LH;
  octagon(col, x, z, 2.5, 30, 'lighthouse'); octagon(col, x, z, PL.r, 1.2, 'plinth');
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, bx = x + Math.cos(a) * 3.35, bz = z + Math.sin(a) * 3.35; col.add(bx - 0.2, bz - 0.2, bx + 0.2, bz + 0.2, PL.y + 0.6, 'bollard'); } }
// The old jetty collider (one 1.6 m box over the whole groyne) also covered the lighthouse bridge; cut the bridge's footprint out
// of it (the box stays on the west, east and south sides of the bridge), so the bridge's own railings are what stops you there.
export function jettyCollider(col, x0, z0, x1, z1, h) {
  const B = BR; if (x1 <= B.x0 || x0 >= B.x1 || z1 <= B.z0 || z0 >= B.z1) { col.add(x0, z0, x1, z1, h, 'rail'); return 1; }
  let n = 0; const add = (a, b, c, d) => { if (c - a > 0.01 && d - b > 0.01) { col.add(a, b, c, d, h, 'rail'); n++; } };
  add(x0, z0, B.x0, z1); add(B.x1, z0, x1, z1); add(B.x0, z0, B.x1, B.z0); add(B.x0, B.z1, B.x1, z1);
  return n;
}

// ======================================================================== a_jetty: walkable groynes =====
// The two beach groynes used to be one 1.6 m solid box each (nobody could get on them, and the lighthouse bridge was unreachable).
// Now the concrete deck is a walkway (landmarkDeckH returns its top), a flight of steps climbs to it from the sand at the root,
// the only colliders are the two edge railings (+ the end rail), and two iron bollards at the foot of the steps keep cars off.
// On the lighthouse groyne the north railing and the bridge's south railing open onto each other (JO), so you can walk from the
// beach to the lighthouse door. Materials: the city's concrete / metal / vcol buckets (no new programs).
const JT = []; const JT_HW = 1.45, JT_T = 0.45;
export function jettyWalk(ctx, x0, x1, zj, dy, sandH) {
  const { W, col } = ctx; const g = geos();
  let n = 6; for (let it = 0; it < 4; it++) n = Math.max(2, Math.ceil((dy - sandH(x0 - n * JT_T, zj)) / 0.19) - 1);
  const sx0 = x0 - n * JT_T, base = sandH(sx0, zj);
  const br = zj < 0 && Math.abs(zj + JT_HW - BR.z0) < 1 && x1 + 0.5 > JO.b; // this groyne carries the lighthouse bridge
  const J = { x0, x1, zj, dy, sx0, base, n, T: JT_T, br, xe: x1 + 0.45 };
  { const i = JT.findIndex((j) => j.zj === zj); if (i >= 0) JT.splice(i, 1); } JT.push(J);
  const stepY = (k) => base + (dy - base) * (k + 1) / (n + 1);
  // -------- colliders: edge railings over steps + deck, end rail, bridge-opening side wall, bollards
  const h = dy + 1.1, xe = J.xe; const r = (a, b, c, d) => { if (c - a > 0.01 && d - b > 0.01) col.add(a, b, c, d, h, 'rail'); };
  r(sx0, zj - JT_HW - 0.08, xe, zj - JT_HW + 0.08);
  if (br) { r(sx0, zj + JT_HW - 0.08, JO.a, zj + JT_HW + 0.08); r(JO.b, zj + JT_HW - 0.08, xe, zj + JT_HW + 0.08);
    r(BR.x0 - 0.04, zj + JT_HW - 0.08, JO.a, BR.z0); r(JO.b - 0.16, zj + JT_HW - 0.08, JO.b, BR.z0); }
  else r(sx0, zj + JT_HW - 0.08, xe, zj + JT_HW + 0.08);
  r(xe - 0.08, zj - JT_HW - 0.08, xe + 0.08, zj + JT_HW + 0.08);
  const bx = sx0 - 0.7, bz = [zj - 0.75, zj + 0.75];
  for (const z of bz) col.add(bx - 0.14, z - 0.14, bx + 0.14, z + 0.14, 1.2, 'bollard');
  // -------- visuals
  const c = W.b('concrete', (sx0 + x0) / 2, zj), m = W.b('metal', (x0 + x1) / 2, zj), v = W.b('vcol', sx0, zj);
  for (let k = 0; k < n; k++) box(c, sx0 + k * JT_T, base - 0.6, zj - 1.6, x0, stepY(k), zj + 1.6);   // the flight of steps
  const POST = 0.035, RT = 0.03;
  for (const e of [-1, 1]) { const zz = zj + e * JT_HW;
    // stairs handrail: a post on every other tread, two sloped rails parallel to the stair line
    for (let k = 0; k < n; k += 2) { const xx = sx0 + k * JT_T + 0.2; box(m, xx - POST, stepY(k), zz - POST, xx + POST, stepY(k) + 1.05, zz + POST); }
    for (const yo of [1.0, 0.55]) rod(m, g.tube, sx0 + 0.2, stepY(0) + yo, zz, x0 + 0.2, dy + yo, zz, RT, null);
    // deck rails (with the bridge opening on the lighthouse groyne's north side)
    const segs = br && e > 0 ? [[x0 + 0.2, JO.a - 0.1], [JO.b, xe]] : [[x0 + 0.2, xe]];
    for (const [a, b] of segs) { if (b - a < 0.2) continue; const np = Math.max(1, Math.round((b - a) / 2.2));
      for (let i = 0; i <= np; i++) { const xx = a + (b - a) * i / np; box(m, xx - POST, dy, zz - POST, xx + POST, dy + 1.05, zz + POST); }
      for (const y of [dy + 1.0, dy + 0.55]) box(m, a, y, zz - RT, b, y + 0.05, zz + RT); }
  }
  for (const zz of [zj - JT_HW, zj - 0.48, zj + 0.48, zj + JT_HW]) box(m, xe - POST, dy, zz - POST, xe + POST, dy + 1.05, zz + POST); // end rail
  for (const y of [dy + 1.0, dy + 0.55]) box(m, xe - RT, y, zj - JT_HW, xe + RT, y + 0.05, zj + JT_HW);
  if (br) { const xw = JO.a - 0.1; box(m, xw - POST, dy, BR.z0 - POST, xw + POST, dy + 1.05, BR.z0 + POST);           // opening side rail
    for (const y of [dy + 1.0, dy + 0.55]) box(m, xw - RT, y, zj + JT_HW, xw + RT, y + 0.05, BR.z0 + 0.12);
    const xq = JO.b - 0.08; box(m, xq - POST, dy, BR.z0 - POST, xq + POST, dy + 1.05, BR.z0 + POST);               // a_wheelcab: east side rail of the
    for (const y of [dy + 1.0, dy + 0.55]) box(m, xq - RT, y, zj + JT_HW, xq + RT, y + 0.05, BR.z0 + 0.12); }        // widened opening
  for (const z of bz) { const y0 = sandH(bx, z) - 0.15; // cast-iron bollards (black, a white reflective band)
    rput(v, g.cyl8, bx, y0, z, [0.1, 0.105, 0.11], 0, 0, 0, 0.13, 1.1, 0.13);
    rput(v, g.cyl8, bx, y0 + 0.82, z, [0.9, 0.9, 0.86], 0, 0, 0, 0.135, 0.08, 0.135);
    rput(v, g.ball, bx, y0 + 1.1, z, [0.1, 0.105, 0.11], 0, 0, 0, 0.14, 0.09, 0.14); }
  return J;
}
export const jettyInfo = () => JT.map((j) => ({ ...j }));

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
  const deckY = BR.y, bx0 = BR.x0, bx1 = BR.x1, bz0 = BR.z0, bz1 = BR.z1;
  fbox(v, frame(0, 0), bx0, bx1, bz0, bz1, -1.2, deckY, [0.46, 0.45, 0.43]);
  for (const zz of [bz0 + 0.12, bz1 - 0.12]) { const south = zz < LH.z; // a_jetty: the south rail opens onto the jetty walkway
    for (let xx = bx0 + 0.2; xx <= bx1; xx += 1.0) { if (south && xx > JO.a - 0.1 && xx < JO.b) continue; rput(m, g.cyl8, xx, deckY, zz, null, 0, 0, 0, 0.035, 1.05, 0.035); }
    if (south) rput(m, g.cyl8, JO.b, deckY, zz, null, 0, 0, 0, 0.035, 1.05, 0.035);
    for (const y of [deckY + 1.0, deckY + 0.55]) for (const [a, b] of south ? [[bx0, JO.a - 0.1], [JO.b, bx1]] : [[bx0, bx1]]) if (b - a > 0.1) rput(m, g.box, (a + b) / 2, y, zz, null, 0, 0, 0, b - a, 0.05, 0.05); }
  { const xw = bx0 + 0.06; for (const zz of [bz0 + 1.4, bz0 + 2.7]) rput(m, g.cyl8, xw, deckY, zz, null, 0, 0, 0, 0.035, 1.05, 0.035); // a_jetty: west end rail
    for (const y of [deckY + 1.0, deckY + 0.55]) rput(m, g.box, xw, y, (bz0 + bz1) / 2, null, 0, 0, 0, 0.05, 0.05, bz1 - bz0 - 0.24); }
  // plinth rim: iron mooring bollards, a steel access ladder into the water (east), rubble boulders hugging the drum
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; rput(v, g.cyl8, x + Math.cos(a) * 3.35, 1.28, z + Math.sin(a) * 3.35, [0.13, 0.14, 0.15], 0, 0, 0, 0.17, 0.45, 0.17);
    rput(v, g.ball, x + Math.cos(a) * 3.35, 1.74, z + Math.sin(a) * 3.35, [0.13, 0.14, 0.15], 0, 0, 0, 0.2, 0.12, 0.2); }
  for (const dz of [-0.3, 0.3]) rput(m, g.box, x + 4.0, -0.3, z + dz, null, 0, 0, 0, 0.06, 3.0, 0.06);
  for (let y = -1.6; y < 1.2; y += 0.3) rput(m, g.box, x + 4.0, y, z, null, 0, 0, 0, 0.04, 0.04, 0.6);
  for (let k = 0; k < 22; k++) { const a = r() * Math.PI * 2; const rr = 3.9 + r() * 1.6; const sc = 0.6 + r() * 0.9; const c = 0.2 + r() * 0.1;
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (px < 526 && pz > -377.5 && pz < -371) continue; // keep the bridge clear
    rput(v, g.rock, px, -1.1 + r() * 0.6, pz, [c * 1.02, c * 0.97, c * 0.88], r() * 6, r() * 6, r() * 6, sc * 1.2, sc * 0.7, sc); }
}

// ======================================================================== Ferris wheel near detail =====
// beach sand height inside the Deco stretch (mirrors city.js beachH with beachOff = 0; the wheel sits at z = 352)
const sandY = (x) => { const t = Math.min(1, Math.max(0, (x - 335) / 145)); return 0.15 - Math.pow(t, 1.6) * 2.9 - t * 0.2; };
// rotating near detail (a2): built into the turning rig meshes, local to the hub (rim truss, cables, spoke bulbs + sockets)
// and to each cabin's pivot (cabin envelope), so the wheel turns with all of it and the cabins stay level
function wheelSpinDetail() {
  const { R } = WH; const g = geos(); const rv = new GeoBucket(), rb = new GeoBucket(), gv = new GeoBucket(); const gr = [];
  const WH1 = [0.95, 0.95, 0.94], Ri = R - 1.5;
  const P = (a, rr, sz) => [Math.cos(a) * rr, Math.sin(a) * rr, sz];
  // rim truss: zig-zag diagonals between the outer and inner chords on both faces
  for (const sz of [-1.2, 1.2]) for (let k = 0; k < 48; k++) { const a0 = k / 48 * Math.PI * 2, a1 = (k + 1) / 48 * Math.PI * 2;
    const A = P(a0, R, sz), B = P(a1, Ri, sz); if (k % 2) { const t = P(a0, Ri, sz), u = P(a1, R, sz); rod(rv, g.tube, ...t, ...u, 0.05, WH1); } else rod(rv, g.tube, ...A, ...B, 0.05, WH1); }
  // (classic two-rim wheel: the only members crossing between the faces are the gondola axles, so cabins swing freely)
  // tension cables: hub flanges to the inner chord, each in its own face plane (nothing crosses the cabin gap)
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2 + 0.065; const sz = k % 2 ? 1.2 : -1.2; rod(rv, g.tube, 0, 0, sz * 1.21, ...P(a, Ri, sz), 0.022, [0.75, 0.76, 0.78]); }
  // incandescent bulbs along every spoke, each in a brass socket pointing out of the face — frosted glass by day, lit at night
  for (const sz of [-1, 1]) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (let j = 1; j <= 6; j++) { const rr = 1.6 + j * (Ri - 1.8) / 6; const [px, py] = P(a, rr, 0);
    rod(rv, g.tube, px, py, sz * 1.17, px, py, sz * 1.27, 0.04, [0.42, 0.34, 0.2]);
    rput(rb, g.bulb2, px, py, sz * 1.345, null, 0, 0, 0, 0.075, 0.075, 0.095); } }
  // gondolas, local to their pivot: pivot pin, hanger yoke, rounded-roof cabin around the base box, windows, floor pan
  for (let k = 0; k < 16; k++) { const c = rig.cols[k]; const v0 = gv.vc;
    rput(gv, g.cyl8, 0, 0, -1.25, [0.36, 0.37, 0.39], Math.PI / 2, 0, 0, 0.11, 2.5, 0.11);
    for (const sd of [-1, 1]) rod(gv, g.tube, 0, 0, sd * 1.0, 0, -0.6, sd * 0.96, 0.05, [0.3, 0.31, 0.33]);
    const y0 = -2.28, y1 = -0.6; const cy = (y0 + y1) / 2;
    rput(gv, g.box, 0, y0 + 0.2, 0, [0.24, 0.25, 0.27], 0, 0, 0, 1.78, 0.4, 1.98);                                    // floor pan
    rput(gv, g.box, 0, y0 + 0.62, 0, c, 0, 0, 0, 1.74, 0.46, 1.94);                                                     // lower body
    for (const sx of [-1, 1]) rput(gv, g.box, sx * 0.83, cy + 0.32, 0, [0.08, 0.1, 0.12], 0, 0, 0, 0.1, 0.78, 1.7);  // side glass
    for (const sd of [-1, 1]) rput(gv, g.box, 0, cy + 0.32, sd * 0.93, [0.08, 0.1, 0.12], 0, 0, 0, 1.5, 0.78, 0.1);  // end glass
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rput(gv, g.box, px * 0.84, cy + 0.3, pz * 0.94, WH1, 0, 0, 0, 0.1, 0.9, 0.1); // corner posts
    rput(gv, g.box, 0, y1 + 0.02, 0, WH1, 0, 0, 0, 1.84, 0.12, 2.04);                                                  // roof slab
    const dm = new THREE.SphereGeometry(1, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2); rput(gv, dm, 0, y1 + 0.08, 0, c, 0, 0, 0, 0.92, 0.28, 1.02); // roof dome
    gr.push([v0, gv.vc]); }
  return rigMeshes(rv, rb, gv, gr);
}
function wheelDetail(W) {
  const { x, z, R } = WH; const H = R + 3; const g = geos(); const v = W.b('vcol', x, z); const m = W.b('metal', x, z);
  const WH1 = [0.95, 0.95, 0.94];
  for (const sz of [-1.21, 1.21]) rput(m, new THREE.CylinderGeometry(1.6, 1.6, 0.12, 20), x, H, z + sz, null, Math.PI / 2);   // hub flanges
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
  { const kx = KIOSK.x, kz = KIOSK.z; const KW = [0.95, 0.92, 0.84], GL = [0.08, 0.1, 0.12]; // ticket kiosk, serving the promenade (west)
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
// a2: colliders for the entrance urns (people and cars stop at them). Same placement maths as decoCloseDetail, no rng.
export function decoUrnColliders(p, col) {
  const s = p.facing; const fx = s > 0 ? p.x1 : p.x0; let n = 0;
  for (const e of edgesOf(p.poly)) { if (!(e.ox * s > 0.9) || e.len < 3) continue;
    const zc = p.pylon ? p.pylon.z : (p.z0 + p.z1) / 2; const a = (zc - e.p[1]) * e.dz + (fx - e.p[0]) * e.dx;
    if (a > 4 && a < e.len - 4) for (const sg of [-1, 1]) { const [ux, uz] = e.P(a + sg * 2.45, 0.55); const b = col.add(ux - 0.45, uz - 0.45, ux + 0.45, uz + 0.45, 1.6, 'urn'); b.out = [e.ox, e.oz]; n++; } }
  return n;
}
// a2: keep the beach umbrellas (with their loungers / towels) off the wheel's ticket kiosk, queue, deck and drive house.
// Moves positions only (no rng draws), so the rest of the layout is untouched.
const SAND_KEEP = { x0: 368.5 - 1.8, x1: 396 + 1.8, z0: 342.5 - 1.8, z1: 359.5 + 1.8 };
export function keepSandClear(us) { const K = SAND_KEEP; let n = 0;
  for (const u of us) { if (u.x < K.x0 || u.x > K.x1 || u.z < K.z0 || u.z > K.z1) continue;
    u.z = u.z - K.z0 < K.z1 - u.z ? K.z0 - (u.z - K.z0) * 0.6 : K.z1 + (K.z1 - u.z) * 0.6; n++; }
  return n;
}
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
