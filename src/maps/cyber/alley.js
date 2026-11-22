// r6.4 b_alley (Hark modelling lane, 2026-11-22): GTA6-style clutter density in the 6 m pedestrian alleys that cut through the
// middle of the Deco-core blocks (city.alleys, behind the main streets). Original content only.
//  * walls (building side faces found from the real colliders): downpipes + conduit runs, sagging cable bundles hooked along the
//    wall and strung across the alley / over the open back yards, window AC unit clusters with brackets, condensate drain lines
//    and wet streaks, zig-zag fire escapes with a drop ladder, steel back doors with a caged bulb (+ night light cone), meter /
//    junction boxes, exhaust hoods with steam, paper stickers and small hand-made neon signs / light boxes (kit.js neonSign tube
//    circuits, street2.js cnFace text atlas = offline cnglyph glyphs).
//  * ground: stacked cardboard boxes + flattened sheets, garbage-bag piles, plastic turnover crates (stacks), puddles.
// Rendering: every repeated prop is ONE InstancedMesh per (unit geometry, material) for all alleys; the instance buffers are
// repacked from the alleys within ON_R of the camera (released beyond OFF_R), so draw calls stay constant and triangles are only
// paid near the camera. Materials are MeshStandardMaterial prepped with the existing 'lamp' program key (instanced, no vertex
// colours — the street-light program), so no new shader program; colour / roughness / emissive are plain uniforms. The few unique
// pieces (neon signs, light boxes, stickers, steam, puddles, light cones) go into one merged World for the active alleys, using the
// existing 'neon' / 'nglow' / 'nrefl' / 'cnsign' / 'steam' / 'puddle' / 'cone' / 'vcol' materials.
// Walkability: ground clutter keeps within 0.9 m of a wall (≥ 4 m clear lane), gets colliders, and nothing is placed within 2.5 m
// of an alley mouth; alleys a hotel closes off at one end are dressed up to the dead end only.
import * as THREE from 'three';
import { World, polyCap } from '../../geo.js';
import { mulberry, withSeed, rng, rand, randi, pick } from '../../util.js';
import { prep } from '../../mats.js';
import { kg, neonSign, GLYPHS, NEONC, put } from './kit.js';
import { cnFace, plume } from './street2.js';
import { AF_OFF, svcBays, SVC } from './svcface.js'; // b_alleyface

// b_overlayfit test switch: ?nooverlayfit dresses the alleys exactly as before this lane
const OF_OFF = typeof location !== 'undefined' && /[?&]nooverlayfit/.test(location.search);
// b_core test switch: ?nobcore puts the wall fixtures back on the bounding-box face (over the rounded Deco hotel corners)
const BC_OFF = typeof location !== 'undefined' && /[?&]nobcore/.test(location.search);
const BAGY = 0.0788; // lowest point of the unit bag above its origin
const ON_R = 70, OFF_R = 78; // alleys sit 150 m apart (z) -> at most one row (2 alleys) active; detail is hidden by the walls beyond this anyway

// ------------------------------------------------------------------ unit geometries ----
// local frame: x along the wall, y up, z out of the wall (wall plane z = 0). Merged non-indexed position/normal/uv.
function merge(parts) {
  const pos = [], nor = [];
  for (const g0 of parts) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return g;
}
const BX = (x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; };
// oriented bar a→b (w × h cross-section), box
function BAR(a, b, w, h = w) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); d.normalize();
  const g = new THREE.BoxGeometry(w, L, h); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  g.applyQuaternion(q); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
function TUBE(a, b, r, n = 4) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); d.normalize();
  const g = new THREE.CylinderGeometry(r, r, L, n, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
let GEO = null;
function geos() {
  if (GEO) return GEO; const G = {};
  // window AC unit, bottom at y = 0: body 0.84 × 0.56 × 0.32, 0.22 off the wall
  G.acBody = merge([BX(-0.42, 0, 0.22, 0.42, 0.56, 0.54), BX(-0.42, 0.5, 0.2, 0.42, 0.58, 0.56)]);
  { const disc = new THREE.CylinderGeometry(0.21, 0.21, 0.02, 8, 1, true); disc.rotateX(Math.PI / 2); disc.translate(0.1, 0.28, 0.55);
    const face = new THREE.CircleGeometry(0.2, 8); face.translate(0.1, 0.28, 0.555);
    const P = [disc, face, BX(-0.4, 0.06, 0.541, -0.18, 0.5, 0.548)]; // side louvre panel
    for (const s of [-0.3, 0.3]) { P.push(BAR([s, -0.02, 0.02], [s, -0.02, 0.52], 0.04)); P.push(BAR([s, -0.32, 0.02], [s, -0.03, 0.46], 0.035)); P.push(BX(s - 0.04, -0.4, 0, s + 0.04, 0.04, 0.02)); }
    G.acDark = merge(P); }
  G.stain = BX(-0.07, -1, 0.004, 0.07, 0, 0.009); // wet streak, top at 0, scaled in y
  G.pipe = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).toNonIndexed(); // unit: radius 1, height 1 centred; oriented by the instance matrix
  // sagging 3-strand cable bundle along x ∈ [−0.5, 0.5], sag 0.5 at mid-span (scale x = span, y = sag / 0.5)
  { const P = []; const N = 7;
    for (const [oy, oz, r, sg] of [[0, 0, 0.022, 1], [-0.05, 0.03, 0.017, 1.12], [0.03, -0.03, 0.026, 0.9]]) {
      let prev = null; for (let i = 0; i <= N; i++) { const t = i / N; const q = [t - 0.5, oy - 0.5 * sg * 4 * t * (1 - t), oz]; if (prev) P.push(TUBE(prev, q, r, 4)); prev = q; } }
    P.push(BX(-0.52, -0.06, -0.05, -0.48, 0.06, 0.05), BX(0.48, -0.06, -0.05, 0.52, 0.06, 0.05)); // clamps
    G.cable = merge(P); }
  // fire escape module (one floor, 3.3 m): platform 3.6 × 1.25 at y = 0, rails, balusters, knee braces + stair to the next floor
  const feBase = () => { const P = [BX(-1.8, -0.06, 0.1, 1.8, 0, 1.25)];
    for (let i = 0; i < 9; i++) P.push(BX(-1.75 + i * 0.44, -0.08, 0.12, -1.72 + i * 0.44, -0.06, 1.23)); // grate bars under
    for (const y of [0.5, 1.0]) { P.push(BAR([-1.8, y, 1.25], [1.8, y, 1.25], 0.035)); P.push(BAR([-1.8, y, 0.1], [-1.8, y, 1.25], 0.035)); P.push(BAR([1.8, y, 0.1], [1.8, y, 1.25], 0.035)); }
    for (let i = 0; i <= 6; i++) P.push(BX(-1.8 + i * 0.6 - 0.012, 0, 1.237, -1.8 + i * 0.6 + 0.012, 1.0, 1.262));
    for (const s of [-1.65, 1.65]) P.push(BAR([s, -0.05, 0.1], [s, -0.55, 1.2], 0.05));
    return P; };
  const stair = (s0, s1, fh) => { const P = []; for (const d of [0.35, 0.95]) P.push(BAR([s0, 0, d], [s1, fh, d], 0.05, 0.12));
    for (let i = 1; i < 9; i++) { const t = i / 9; P.push(BX(s0 + (s1 - s0) * t - 0.12, fh * t - 0.02, 0.35, s0 + (s1 - s0) * t + 0.12, fh * t + 0.02, 0.95)); }
    P.push(BAR([s0, 0.9, 1.0], [s1, fh + 0.9, 1.0], 0.03)); return P; };
  G.feA = merge([...feBase(), ...stair(-1.5, 0.7, 3.3)]);
  G.feB = merge([...feBase(), ...stair(1.5, -0.7, 3.3)]);
  G.feTop = merge(feBase());
  { const P = []; for (const x of [-1.45, -1.0]) P.push(BX(x - 0.02, -2.4, 1.08, x + 0.02, 0.4, 1.12)); for (let y = -2.3; y < 0.3; y += 0.3) P.push(BX(-1.45, y - 0.012, 1.09, -1.0, y + 0.012, 1.11));
    P.push(BAR([-1.45, 0.4, 1.1], [-1.45, 1.0, 1.25], 0.03), BAR([-1.0, 0.4, 1.1], [-1.0, 1.0, 1.25], 0.03)); G.feLad = merge(P); }
  // steel back door 1.0 × 2.15 with frame, kick plate and lever
  G.door = merge([BX(-0.58, 0, 0, 0.58, 2.28, 0.05), BX(-0.5, 0.02, 0.05, 0.5, 2.17, 0.085), BX(-0.48, 0.05, 0.085, 0.48, 0.3, 0.092), BX(0.34, 1.0, 0.085, 0.44, 1.04, 0.14), BX(-0.58, 2.28, 0, 0.58, 2.36, 0.2)]);
  G.bulb = merge([BX(-0.11, -0.16, 0.0, 0.11, 0.0, 0.2), BX(-0.03, 0.0, 0.0, 0.03, 0.12, 0.06)]);
  G.jbox = merge([BX(-0.22, -0.3, 0, 0.22, 0.3, 0.17), BX(-0.24, 0.3, 0, 0.24, 0.34, 0.2), BX(-0.03, -0.9, 0.02, 0.03, -0.3, 0.08)]);
  G.box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed();
  { const s = new THREE.SphereGeometry(0.5, 8, 5); const p = s.attributes.position; const R = mulberry(77);
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.88 + R() * 0.2; y = y < -0.25 ? -0.25 - (y + 0.25) * 0.15 : y; p.setXYZ(i, x * k * (1 + Math.max(0, -y) * 0.3), y * 0.9 + 0.27, z * k * (1 + Math.max(0, -y) * 0.3)); }
    s.computeVertexNormals(); const knot = new THREE.ConeGeometry(0.06, 0.16, 5); knot.translate(0, 0.78, 0); G.bag = merge([s, knot]); }
  // plastic turnover crate 0.6 × 0.32 × 0.4 (open top, lip, handle slots as dark recesses are skipped)
  G.crate = merge([BX(-0.3, 0, -0.2, 0.3, 0.03, 0.2), BX(-0.3, 0, -0.2, 0.3, 0.32, -0.18), BX(-0.3, 0, 0.18, 0.3, 0.32, 0.2), BX(-0.3, 0, -0.18, -0.28, 0.32, 0.18), BX(0.28, 0, -0.18, 0.3, 0.32, 0.18),
    BX(-0.32, 0.29, -0.22, 0.32, 0.32, -0.2), BX(-0.32, 0.29, 0.2, 0.32, 0.32, 0.22), BX(-0.32, 0.29, -0.2, -0.3, 0.32, 0.2), BX(0.3, 0.29, -0.2, 0.32, 0.32, 0.2),
    BX(-0.31, 0.12, -0.212, 0.31, 0.15, -0.2), BX(-0.31, 0.12, 0.2, 0.31, 0.15, 0.212)]);
  // exhaust hood with louvres
  { const P = [BX(-0.32, -0.22, 0, 0.32, 0.22, 0.26)]; for (let i = 0; i < 4; i++) P.push(BAR([-0.3, -0.16 + i * 0.1, 0.27], [0.3, -0.16 + i * 0.1, 0.27], 0.02, 0.06)); P.push(BX(-0.36, 0.22, 0, 0.36, 0.26, 0.32)); G.vent = merge(P); }
  return (GEO = G);
}

// ------------------------------------------------------------------ materials ----
// 'lamp' = the instanced street-light program (props.js); same feature set (no map, no vertex colours) -> shared program
const MDEF = {
  acBody: [0xb9bab4, 0.6, 0.15], acDark: [0x1d1f22, 0.6, 0.5], stain: [0x121416, 0.3, 0.0], pipeGrey: [0x5d6268, 0.45, 0.6], pipeRust: [0x5a3626, 0.8, 0.35],
  pipeBlack: [0x141517, 0.5, 0.2], cable: [0x111214, 0.55, 0.1], fe: [0x1f2226, 0.7, 0.55], door: [0x5a636e, 0.55, 0.45] /* b_alleyface2: same steel as the painted service doors (mats.js style 6) */, bulb: [0x332a1c, 0.5, 0.0, 0xffc27a, 2.2],
  jbox: [0x7f8580, 0.55, 0.4], boxA: [0xa47c4c, 0.92, 0.0], boxB: [0x7a5a37, 0.95, 0.0], bagK: [0x0f1012, 0.28, 0.0], bagB: [0x1a2d55, 0.32, 0.0],
  crateR: [0xb51e22, 0.5, 0.0], crateB: [0x1f58a8, 0.5, 0.0], crateY: [0xd9a514, 0.5, 0.0], vent: [0x8a9095, 0.45, 0.6],
};
const KINDS = [ // kind: [geometry, material, castShadow]
  ['acBody', 'acBody', 'acBody', true], ['acDark', 'acDark', 'acDark', false], ['stain', 'stain', 'stain', false], ['pipeGrey', 'pipe', 'pipeGrey', false], ['pipeRust', 'pipe', 'pipeRust', false],
  ['pipeBlack', 'pipe', 'pipeBlack', false], ['cable', 'cable', 'cable', false], ['feA', 'feA', 'fe', true], ['feB', 'feB', 'fe', true], ['feTop', 'feTop', 'fe', true], ['feLad', 'feLad', 'fe', false],
  ['door', 'door', 'door', false], ['bulb', 'bulb', 'bulb', false], ['jbox', 'jbox', 'jbox', false], ['boxA', 'box', 'boxA', true], ['boxB', 'box', 'boxB', true], ['bagK', 'bag', 'bagK', false],
  ['bagB', 'bag', 'bagB', false], ['crateR', 'crate', 'crateR', true], ['crateB', 'crate', 'crateB', true], ['crateY', 'crate', 'crateY', true], ['vent', 'vent', 'vent', false],
];
function mkMat([c, r, m, e, ei]) { const o = { color: c, roughness: r, metalness: m }; if (e) { o.emissive = e; o.emissiveIntensity = ei; } return prep(new THREE.MeshStandardMaterial(o), 'lamp'); }

// ------------------------------------------------------------------ planning ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
let CONE_G = null;
function coneG() { if (!CONE_G) { CONE_G = new THREE.CylinderGeometry(0.06, 1, 1, 12, 1, true); CONE_G.translate(0, -0.5, 0); } return CONE_G; }

// b_alleyface: the openings of the service face on the collider box b at z = zw (city.js leaves b.svc = per-edge service info);
// null when that face is not a service face (or ?noalleyface)
function svcOpen(b, zw) {
  if (AF_OFF || !b.svc) return null; let hit = false; const out = [];
  for (const e of b.svc) { if (!e || Math.abs(e.dz) > 0.01 || Math.abs(e.p[1] - zw) > 0.05) continue; hit = true;
    for (const o of svcBays(e.len, e.ww, e.ps)) { const xc = e.p[0] + e.dx * o.c; out.push({ x0: xc - o.hw - 0.15, x1: xc + o.hw + 0.15, lo: e.y0 + o.bot, top: e.y0 + o.top, t: o.t, floor: !!o.floor }); } }
  return hit ? out : null;
}
export class AlleyLayer {
  constructor(scene, mats, city) {
    this.mats = mats; this.city = city; this.group = new THREE.Group(); this.group.name = 'alleys'; scene.add(this.group);
    const G = geos(); this.kinds = new Map(); this.alleys = []; this.active = new Set(); this.world = []; this.stats = { alleys: 0, through: 0, inst: 0, colliders: 0, of: { off: OF_OFF, wallCols: 0, ladders: 0, bags: 0, clusterGrow: 0 } };
    const M = {}; for (const k in MDEF) M[k] = mkMat(MDEF[k]);
    const list = (city.alleys || []).slice();
    list.forEach((a, i) => { const A = withSeed((0xa11e + i * 7877) >>> 0, () => this.plan(a, i)); if (A) this.alleys.push(A); });
    // one InstancedMesh per kind sized for every alley; filled from the active alleys in sync()
    for (const [k, gk, mk, cast] of KINDS) {
      const n = this.alleys.reduce((s, A) => s + (A.inst[k] ? A.inst[k].length / 16 : 0), 0); if (!n) continue;
      const im = new THREE.InstancedMesh(G[gk], M[mk], n); im.count = 0; im.castShadow = cast; im.receiveShadow = true; im.name = 'alley|' + k; im.visible = false;
      this.group.add(im); this.kinds.set(k, im); this.stats.inst += n;
    }
    this.stats.alleys = this.alleys.length; this.stats.through = this.alleys.filter((A) => A.through).length;
  }
  // walls from the real building colliders on both sides of the alley strip; clutter, colliders and the unique-piece list
  plan(a, idx) {
    const city = this.city, col = city.col; const zc = a.z, hw = a.w / 2;
    const near = col.boxes.filter((b) => b.tag !== 'pole' && b.tag !== 'palm' && b.maxX > a.x0 - 1 && b.minX < a.x1 + 1 && b.maxZ > zc - hw - 3 && b.minZ < zc + hw + 3 && (b.maxX - b.minX) > 3);
    // walkable range: a building straddling the centre line closes the alley there (tideline hotels)
    let xs = a.x0, xe = a.x1;
    for (const b of near) if (b.minZ < zc - 0.5 && b.maxZ > zc + 0.5) { if ((b.minX + b.maxX) / 2 > (a.x0 + a.x1) / 2) xe = Math.min(xe, b.minX); else xs = Math.max(xs, b.maxX); }
    if (xe - xs < 20) return null;
    const walls = [];
    for (const b of near) {
      if (b.minZ < zc - 0.5 && b.maxZ > zc + 0.5) continue;
      const s = b.maxZ <= zc ? 1 : -1; const zw = s > 0 ? b.maxZ : b.minZ; if (Math.abs(zw - zc) > hw + 2.2) continue;
      let wa = Math.max(b.minX, xs), wb = Math.min(b.maxX, xe); if (wb - wa < 3) continue;
      // b_core: a Deco hotel with rounded front corners (city.js volume() leaves the real footprint on its box as b.poly) only has
      // a flat wall on the alley side where its polygon has an edge on the box face; over the rounded corner the face curves in by
      // up to R = 3.2 m, so AC units, conduit runs, cables and crates hung on the box face floated in front of the curved glass at
      // the alley mouth. Clip the wall to the straight part of the polygon edge.
      if (!BC_OFF && b.poly) { const P = b.poly, n = P.length; let sa = Infinity, sb = -Infinity;
        for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; if (Math.abs(p[1] - zw) < 0.05 && Math.abs(q[1] - zw) < 0.05) { sa = Math.min(sa, p[0], q[0]); sb = Math.max(sb, p[0], q[0]); } }
        const ca = Math.max(wa, sa + 0.1), cb = Math.min(wb, sb - 0.1); const st = this.stats.bcore || (this.stats.bcore = { walls: 0, cut: 0, cutLen: 0, dropped: 0 });
        if (ca > wa + 1e-3 || cb < wb - 1e-3) { st.cut++; st.cutLen += Math.max(0, ca - wa) + Math.max(0, wb - cb); }
        if (cb - ca < 3) { st.dropped++; continue; } wa = ca; wb = cb; st.walls++; }
      walls.push({ s, zw, wa, wb, h: b.h, y0: city.groundH((wa + wb) / 2, zc), sv: svcOpen(b, zw) });
    }
    const A = { a, idx, xs, xe, z: zc, through: xs <= a.x0 + 0.01 && xe >= a.x1 - 0.01, walls, inst: {}, uniq: [], cols: [], cx: (xs + xe) / 2 };
    let DRY = false; // b_alleyface: a fixture that would sit on a shutter / door / hatch of the service face is planned as before (same rng draws) but not placed
    const push = (k, m) => { if (DRY) return; (A.inst[k] || (A.inst[k] = [])).push(...m.elements); };
    const uq = (o) => { if (!DRY) A.uniq.push(o); };
    const AF = this.stats.af || (this.stats.af = { off: AF_OFF, walls: 0, open: 0, doorMoved: 0, doorDrop: 0, jboxMoved: 0, jboxDrop: 0, ventMoved: 0, ventDrop: 0, pipeMoved: 0, drainCut: 0, stainCut: 0, stainDrop: 0, clusterDrop: 0, acSkip: 0, runSplit: 0 });
    // wall frame: along-wall a (world x), out d, height y -> matrix with local +z = out of the wall
    const at = (w, x, y, d, sx = 1, sy = 1, sz = 1, roll = 0) => { _e.set(0, w.s > 0 ? 0 : Math.PI, roll, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, w.zw + w.s * d); return _m.compose(_p, _q, _s); };
    const seg = (k, p0, p1, r) => { _a.set(...p0); _b.set(...p1); const L = _a.distanceTo(_b); if (L < 0.02) return; _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); _s.set(r, L, r); _p.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2); push(k, _m.compose(_p, _q, _s)); };
    const W3 = (w, x, d, y) => [x, y, w.zw + w.s * d];
    const cableSpan = (p0, p1, sag) => { const dx = p1[0] - p0[0], dz = p1[2] - p0[2]; const L = Math.hypot(dx, dz); _e.set(0, -Math.atan2(dz, dx), Math.atan2(p1[1] - p0[1], L), 'YZX'); _q.setFromEuler(_e);
      _s.set(Math.hypot(L, p1[1] - p0[1]), sag / 0.5, 1); _p.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2); push('cable', _m.compose(_p, _q, _s)); };
    const m0 = Math.min(xs, xe) + 2.5, m1 = Math.max(xs, xe) - 2.5; // keep the alley mouths clear
    const groundY = city.groundH(A.cx, zc);
    // ---- ground clutter cluster against a wall (or the alley edge in the open yards): crates / boxes / bags, with a collider
    const cluster = (s, zw, x, len, y) => {
      const kind = pick(['crate', 'box', 'bag', 'box', 'crate', 'mix']); const fr = (d) => zw + s * d; let depth = 0;
      let ex0 = x, ex1 = x + len, ytop = 1.4; // b_overlayfit: the pieces' real along-wall extent / top (the box stopped at x + len and 1.4 m)
      const P = (k, xx, yy, d, sx, sy, sz, ry) => { _e.set(0, ry, 0); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(xx, yy, fr(d)); push(k, _m.compose(_p, _q, _s)); depth = Math.max(depth, d + Math.max(sx, sz) * 0.5);
        if (!k.startsWith('bag')) { const hx = (k.startsWith('crate') ? 0.3 : 0.5) * Math.max(sx, sz) + 0.02; ex0 = Math.min(ex0, xx - hx); ex1 = Math.max(ex1, xx + hx); ytop = Math.max(ytop, yy + (k.startsWith('crate') ? 0.3 : sy / 2)); } };
      const crateCol = pick(['crateR', 'crateB', 'crateY']);
      for (let u = x + 0.1; u < x + len - 0.3;) {
        const k = kind === 'mix' ? pick(['crate', 'box', 'bag']) : kind;
        if (k === 'crate') { const n = randi(1, 5); const ck = rng() < 0.7 ? crateCol : pick(['crateR', 'crateB', 'crateY']); const ry = rand(-0.06, 0.06) + (rng() < 0.3 ? Math.PI / 2 : 0);
          for (let j = 0; j < n; j++) P(rng() < 0.85 ? ck : pick(['crateR', 'crateB', 'crateY']), u + 0.32 + rand(-0.03, 0.03), y + j * 0.3, 0.3 + rand(0, 0.06), 1, 1, 1, ry + rand(-0.05, 0.05)); u += 0.72; }
        else if (k === 'box') { let yy = y; const n = randi(1, 3); let sw = rand(0.45, 0.75);
          for (let j = 0; j < n; j++) { const sx = sw * rand(0.75, 1), sy = rand(0.3, 0.55), sz = rand(0.35, Math.min(0.7, 0.85 - 0.05)); P(rng() < 0.6 ? 'boxA' : 'boxB', u + sw / 2 + rand(-0.06, 0.06), yy, sz / 2 + 0.05, sx, sy, sz, rand(-0.2, 0.2)); yy += sy; sw = sx; }
          if (rng() < 0.3) { _e.set(-0.18 * s, s > 0 ? 0 : Math.PI, 0, 'YXZ'); _q.setFromEuler(_e); _s.set(rand(0.7, 1.1), rand(0.9, 1.3), 0.02); _p.set(u + sw + 0.4, y + 0.55, fr(0.12)); push('boxB', _m.compose(_p, _q, _s)); ex1 = Math.max(ex1, u + sw + 0.4 + _s.x / 2 + 0.02); u += 0.9; } // flattened sheet leaning on the wall
          u += sw + 0.1; }
        else { const n = randi(2, 5); for (let j = 0; j < n; j++) { const sc = rand(0.55, 0.85); const kk = rng() < 0.75 ? 'bagK' : 'bagB', bx = u + 0.3 + rand(-0.1, 0.2), bd = rand(0.3, 0.55), sy = sc * rand(0.8, 1.05), ry = rand(0, 6.28);
          P(kk, bx, y + (j > 2 ? 0.35 : 0) - (OF_OFF ? 0 : BAGY * sy), bd, sc, sy, sc, ry); if (!OF_OFF) { this.stats.of.bags++; A.of = (A.of || 0) | 1; } u += rand(0.25, 0.45); } u += 0.45; } // b_overlayfit: bags rest on their flattened bottom
      }
      depth = Math.min(0.95, depth + 0.05); const z0 = Math.min(zw, zw + s * depth), z1 = Math.max(zw, zw + s * depth);
      if (DRY) return; if (OF_OFF) A.cols.push([x, z0, x + len, z1, 1.4]); else { if (ex0 < x - 1e-3 || ex1 > x + len + 1e-3 || ytop > 1.4) this.stats.of.clusterGrow++; A.cols.push([ex0, z0, ex1, z1, Math.max(1.4, ytop)]); }
    };
    // ---- walls
    // b_overlayfit: walking-height wall fixtures (downpipes, meter boxes, back doors, AC drain lines ending low) stood 0.14–0.27 m off
    // the wall with no collider -> one thin box each, wall face out to the fixture face
    const wfix = (w, x0, x1, d, h) => { if (OF_OFF || DRY) return; const z0 = Math.min(w.zw, w.zw + w.s * d), z1 = Math.max(w.zw, w.zw + w.s * d); A.cols.push([x0, z0, x1, z1, h]); this.stats.of.wallCols++; };
    for (const w of walls) {
      const len = w.wb - w.wa, y0 = w.y0, top = Math.min(w.h, 40); const fh = 3.3, yf = y0 + 4.2; const nF = Math.max(0, Math.floor((top - yf - 0.6) / fh) + 1);
      const busy = []; const free = (x0, x1) => busy.every(([p, q]) => x1 < p || x0 > q); const take = (x0, x1) => busy.push([x0, x1]);
      const lo = Math.max(w.wa, m0), hi = Math.min(w.wb, m1); if (hi - lo < 2) continue;
      // b_alleyface: the ground floor of this wall is a service face (style-6 shader + city.js pieces). OP = its openings in world x
      // ([x0, x1] incl. 0.15 m margin, lo / top heights). Walking-height fixtures move sideways off them (occ = where moved ones
      // ended up); one that finds no room is dropped (DRY). Conduit runs drop to the band above the openings, the first AC row
      // rises above them. Every rng draw happens exactly as before.
      const OP = w.sv; const occ = []; if (OP) { AF.walls++; AF.open += OP.length; }
      const hitO = (x0, x1, ya, yb2) => OP && OP.find((o) => x1 > o.x0 && x0 < o.x1 && yb2 > o.lo && ya < o.top);
      const hitOcc = (x0, x1) => occ.some(([p, q]) => x1 > p && x0 < q);
      const clearX = (x, hw, ya, yb2) => { const ok = (c) => c - hw >= lo && c + hw <= hi && !hitO(c - hw, c + hw, ya, yb2) && !hitOcc(c - hw, c + hw);
        if (ok(x)) return x; for (let d = 0.1; d < 8; d += 0.1) { if (ok(x - d)) return x - d; if (ok(x + d)) return x + d; } return null; };
      const pipeX = (x) => { if (!OP) return x; const o = OP.find((q) => x > q.x0 && x < q.x1); if (!o) return x; AF.pipeMoved++;
        const c = [o.x0 - 0.02, o.x1 + 0.02].filter((v) => v > w.wa + 0.08 && v < w.wb - 0.08 && !OP.some((q) => q !== o && v > q.x0 && v < q.x1)); return c.length ? c.reduce((p, v) => Math.abs(v - x) < Math.abs(p - x) ? v : p) : x; };
      let doorX = null;
      // fire escape (needs ≥ 3 floors and 4.5 m of wall)
      if (nF >= 2 && hi - lo > 4.5 && rng() < 0.85) { const x = rand(lo + 2, hi - 2); take(x - 2, x + 2);
        for (let k = 0; k < nF; k++) { const y = yf + k * fh; push(k === nF - 1 ? 'feTop' : k % 2 ? 'feB' : 'feA', at(w, x, y, 0)); }
        // b_overlayfit: the drop ladder hung to 1.8 m, 1.1 m out from the wall (head height in the alley): shortened so its foot is at 2.15 m
        { const sy = OF_OFF ? 1 : Math.min(1, (yf - y0 - 2.15) / 2.4); push('feLad', at(w, x, yf, 0, 1, sy, 1)); if (sy < 1) { this.stats.of.ladders++; A.of = (A.of || 0) | 2; } } A.fe = (A.fe || 0) + 1;
        // a crate or a potted bucket on a landing now and then
        for (let k = 0; k < nF; k++) if (rng() < 0.35) push(pick(['crateR', 'crateB', 'crateY', 'boxA']), at(w, x + rand(0.4, 1.4), yf + k * fh, 0.7, k % 2 ? 1 : 0.8, 1, 0.8)); }
      // back door + caged bulb (+ light cone) + small sign
      { const xr = Math.min(hi - 0.8, Math.max(lo + 0.8, rand(lo + 1, hi - 1))); if (free(xr - 0.8, xr + 0.8)) { take(xr - 0.9, xr + 0.9);
        const xd = OP ? clearX(xr, 0.7, y0, y0 + 3.0) : xr; const x = xd ?? xr; if (OP) { if (xd === null) AF.doorDrop++; else { if (Math.abs(xd - xr) > 1e-6) AF.doorMoved++; occ.push([x - 0.9, x + 0.9]); doorX = x; } } DRY = xd === null;
        push('door', at(w, x, y0, 0)); wfix(w, x - 0.58, x + 0.58, 0.15, y0 + 2.36); push('bulb', at(w, x, y0 + 2.7, 0));
        uq({ t: 'cone', p: W3(w, x, 0.12, y0 + 2.52), h: 2.45, r: 1.9 });
        const r = rng(); if (r < 0.45) uq({ t: 'neon', w, x: x + rand(-0.3, 0.3), y: y0 + 3.35, sw: rand(0.9, 1.5), sh: rand(0.5, 0.75), glyphs: rng() < 0.5 ? [pick(GLYPHS.slice(10))] : [GLYPHS[randi(0, 9)], GLYPHS[randi(0, 9)]], col: pick(NEONC), col2: pick(NEONC), gy: y0 });
        else if (r < 0.8) uq({ t: 'box', w, x: x + rand(-0.2, 0.2), y: y0 + 3.05, k: randi(0, 17) });
        uq({ t: 'stk', w, x0: x - 1.4, x1: x + 1.4, y0, n: randi(3, 8) }); DRY = false; } }
      // downpipes at the ends and every ~9 m, conduit runs along the wall, junction boxes with conduit, cable bundles on hooks
      for (const x0p of [w.wa + 0.35, w.wb - 0.35]) if (x0p > lo - 2 && x0p < hi + 2) { const x = pipeX(x0p); const pk = rng() < 0.6 ? 'pipeGrey' : 'pipeRust', r = rand(0.055, 0.075); seg(pk, W3(w, x, 0.13, y0), W3(w, x, 0.13, top - 0.2), r); wfix(w, x - r, x + r, 0.13 + r, top); }
      for (let x = w.wa + rand(6, 10); x < w.wb - 4; x += rand(7, 11)) if (free(x - 0.3, x + 0.3)) { const xp = pipeX(x); seg('pipeGrey', W3(w, xp, 0.12, y0), W3(w, xp, 0.12, top - 0.2), 0.05); wfix(w, xp - 0.05, xp + 0.05, 0.17, top); }
      const nr = randi(1, 3); for (let i = 0; i < nr; i++) { let y = y0 + rand(2.9, 4.4) + i * 0.22; if (OP) y = y0 + 2.95 + (y - y0 - 2.9 - i * 0.22) * 0.2 + i * 0.15; // b_alleyface: 2.95–3.55 m, between the openings and the first AC row
        const pk = i === 1 ? 'pipeBlack' : rng() < 0.5 ? 'pipeRust' : 'pipeGrey', pr = rand(0.025, 0.045), d = 0.09 + i * 0.07;
        const runs = OP && doorX !== null && doorX - 0.75 > w.wa + 0.2 && doorX + 0.75 < w.wb - 0.2 ? [[w.wa + 0.2, doorX - 0.75], [doorX + 0.75, w.wb - 0.2]] : [[w.wa + 0.2, w.wb - 0.2]]; if (runs.length > 1) AF.runSplit++; // break round the door's sign
        for (const [ra, rb] of runs) seg(pk, W3(w, ra, d, y), W3(w, rb, d, y), pr); }
      for (let k = 0; k < Math.max(1, Math.round(len / 9)); k++) { const xr = rand(lo + 0.5, hi - 0.5); if (!free(xr - 0.3, xr + 0.3)) continue; take(xr - 0.3, xr + 0.3);
        const xj = OP ? clearX(xr, 0.3, y0 + 0.6, y0 + 3.0) : xr; const x = xj ?? xr; if (OP) { if (xj === null) AF.jboxDrop++; else { if (Math.abs(xj - xr) > 1e-6) AF.jboxMoved++; occ.push([x - 0.3, x + 0.3]); } } DRY = xj === null;
        { const yj = y0 + rand(1.5, 2.0); push('jbox', at(w, x, yj, 0)); wfix(w, x - 0.24, x + 0.24, 0.2, yj + 0.34); }
        seg('pipeBlack', W3(w, x + 0.05, 0.06, y0 + 2.2), W3(w, x + 0.05, 0.06, y0 + rand(3.0, 6.5)), 0.022); seg('pipeBlack', W3(w, x - 0.08, 0.07, y0 + 2.2), W3(w, x - 0.08, 0.07, top - rand(0.5, 3)), 0.016); DRY = false; }
      { const yb = y0 + rand(3.6, 5.2); let x = w.wa + 0.3; while (x < w.wb - 1.5) { const x2 = Math.min(w.wb - 0.3, x + rand(3.5, 6.5)); cableSpan(W3(w, x, 0.2, yb + rand(-0.1, 0.1)), W3(w, x2, 0.2, yb + rand(-0.1, 0.1)), rand(0.25, 0.55)); x = x2; } }
      // AC clusters: one or two dense zones on the wall, sparse elsewhere; drain lines / wet streaks below some
      const zones = []; for (let i = 0; i < randi(1, 2); i++) { const c = rand(w.wa, w.wb); zones.push([c - rand(2.5, 5), c + rand(2.5, 5)]); }
      for (let k = 0; k < Math.max(1, nF); k++) { const y = yf - 1.2 + k * fh + 0.35 + (OP && k === 0 ? 0.27 : 0); if (y > top - 1) break; // b_alleyface: first row 3.47–3.87 m, over the service openings
        for (let x = w.wa + 0.8; x < w.wb - 0.6; x += rand(1.1, 1.6)) { const z = zones.some(([p, q]) => x > p && x < q); if (rng() > (z ? 0.72 : 0.12) || !free(x - 0.5, x + 0.5) && y < yf + nF * fh) continue;
          const yy = y + rand(-0.15, 0.25); const skip = OP && k === 0 && hitOcc(x - 0.5, x + 0.5); if (skip) { AF.acSkip++; DRY = true; } // not over a moved door's sign
          push('acBody', at(w, x, yy, 0)); push('acDark', at(w, x, yy, 0));
          const dr = rng(); if (dr < 0.3) { let yd = y0 + (rng() < 0.5 ? 0.05 : rand(1, 3)); { const o = hitO(x - 0.4, x - 0.36, yd, yy); if (o && o.top < yy - 0.1) { yd = Math.max(yd, o.top + 0.05); AF.drainCut++; } } // drain line ends over an opening
            seg('pipeBlack', W3(w, x - 0.38, 0.25, yy), W3(w, x - 0.38, 0.25, yd), 0.012); if (yd < y0 + 2.1) wfix(w, x - 0.41, x - 0.35, 0.27, yy); }
          else if (dr < 0.65) { const xs2 = x + rand(-0.25, 0.25), sx = rand(0.7, 1.4); let sy = rand(0.8, Math.min(3.5, yy - y0 - 0.2)); const o = hitO(xs2 - 0.07 * sx, xs2 + 0.07 * sx, yy - 0.02 - sy, yy);
            if (o && o.top < yy) { sy = Math.min(sy, yy - 0.04 - o.top); AF.stainCut++; } if (sy >= 0.2) push('stain', at(w, xs2, yy - 0.02, 0, sx, sy, 1)); else AF.stainDrop++; }
          if (dr < 0.3 && rng() < 0.6) uq({ t: 'pud', x: x - 0.38, z: w.zw + w.s * 0.45, y: y0 + 0.012, r: rand(0.25, 0.5) }); DRY = false; } }
      // exhaust hood + steam (kitchen / laundry vent) on some walls
      if (rng() < 0.55) { const xr = rand(lo + 0.5, hi - 0.5); if (free(xr - 0.5, xr + 0.5)) { take(xr - 0.5, xr + 0.5); const y = y0 + rand(2.3, 3.0);
        const xv = OP ? clearX(xr, 0.4, y - 0.25, y + 0.3) : xr; const x = xv ?? xr; if (OP) { if (xv === null) AF.ventDrop++; else { if (Math.abs(xv - xr) > 1e-6) AF.ventMoved++; occ.push([x - 0.4, x + 0.4]); } } DRY = xv === null;
        push('vent', at(w, x, y, 0)); uq({ t: 'steam', p: W3(w, x, 0.45, y - 0.1), w: rand(0.6, 1.0), h: rand(2.2, 3.4) }); if (!DRY) A.steam = (A.steam || 0) + 1; DRY = false; } }
      // ground clutter clusters
      for (let x = lo + rand(0, 1.5); x < hi - 1;) { const L = rand(1.2, 2.8); if (x + L < hi && free(x, x + L) && rng() < 0.7) { take(x, x + L);
        DRY = !!OP && (OP.some((o) => o.floor && x + L > o.x0 + 0.25 && x < o.x1 - 0.25) || occ.some(([p, q]) => q - p > 1.5 && x + L > p + 0.2 && x < q - 0.2)); if (DRY) AF.clusterDrop++; // not in front of a door / shutter
        cluster(w.s, w.zw, x, L, y0); DRY = false; } x += L + rand(0.6, 3.5); }
    }
    // ---- open back yards between the building runs: sparse clutter on the alley edge, long cable runs between same-side walls
    for (const s of [1, -1]) {
      const ws = walls.filter((w) => w.s === s).sort((p, q) => p.wa - q.wa); const ze = zc - s * (hw - 0.4);
      for (let i = 0; i < ws.length - 1; i++) { const g0 = ws[i].wb, g1 = ws[i + 1].wa; if (g1 - g0 < 4) continue;
        for (let x = Math.max(g0 + 1, m0); x < Math.min(g1 - 1.5, m1);) { if (rng() < 0.3) cluster(s, ze, x, rand(1.2, 2.2), groundY); x += rand(4, 9); }
        const h = Math.min(ws[i].h, ws[i + 1].h) - 1.5; if (h > 5) for (let k = 0; k < randi(1, 3); k++) { const y = Math.min(h, rand(5.5, 8.5)) - k * 0.4;
          cableSpan([g0, y, ws[i].zw + s * 0.3], [g1, y + rand(-0.4, 0.4), ws[i + 1].zw + s * 0.3], rand(1.2, 2.6) * (g1 - g0) / 40); } }
    }
    // ---- bundles strung across the alley between facing walls
    const S = walls.filter((w) => w.s > 0), N = walls.filter((w) => w.s < 0);
    for (const p of S) for (const q of N) { const x0 = Math.max(p.wa, q.wa) + 0.6, x1 = Math.min(p.wb, q.wb) - 0.6; if (x1 - x0 < 1) continue;
      const hmax = Math.min(p.h, q.h) - 1; for (let x = x0 + rand(0, 2); x < x1; x += rand(2.5, 6)) { const y = Math.min(hmax, rand(4.6, 9)); cableSpan([x, y, p.zw + 0.15], [x + rand(-1.5, 1.5), y + rand(-0.5, 0.5), q.zw - 0.15], rand(0.4, 0.9)); } }
    // puddles down the middle of the alley
    for (let i = 0; i < randi(3, 6); i++) A.uniq.push({ t: 'pud', x: rand(m0, m1), z: zc + rand(-1.6, 1.6), y: groundY + 0.01, r: rand(0.5, 1.4) });
    for (const c of A.cols) col.add(c[0], c[1], c[2], c[3], c[4], 'alley');
    this.stats.colliders += A.cols.length;
    return A;
  }
  // unique pieces of the active alleys -> one merged World (existing materials)
  buildUniq() {
    for (const m of this.world) { this.group.remove(m); m.geometry.dispose(); } this.world = [];
    if (!this.active.size) return;
    const W = new World(1e7); W.attrs = {};
    for (const A of this.alleys) { if (!this.active.has(A.idx)) continue;
      withSeed((0x5eed + A.idx * 131) >>> 0, () => { for (const u of A.uniq) {
        if (u.t === 'cone') put(W.b('cone', u.p[0], u.p[2]), coneG(), u.p[0], u.p[1], u.p[2], u.r, u.h, u.r, [1.0, 0.78, 0.5]);
        else if (u.t === 'pud') { const b = W.b('puddle', u.x, u.z); const n = 9; const pts = []; const sx = rand(0.8, 1.7), ph = rand(0, 6);
          for (let i = 0; i < n; i++) { const t = -(i / n) * Math.PI * 2; const rr = u.r * (0.75 + 0.15 * Math.sin(t * 3 + ph) + rand(0, 0.2)); pts.push([u.x + Math.cos(t) * rr * sx, u.z + Math.sin(t) * rr]); }
          let ar = 0; for (let i = 0; i < n; i++) { const p = pts[i], o = pts[(i + 1) % n]; ar += p[0] * o[1] - o[0] * p[1]; } if (ar > 0) pts.reverse(); polyCap(b, pts, u.y, {}, [0.05, 0.055, 0.06]); }
        else if (u.t === 'steam') plume(W, u.p[0], u.p[1], u.p[2], u.w, u.h, [0.85, 0.86, 0.88]);
        else if (u.t === 'neon') { const w = u.w; neonSign(W, [u.x, u.y, w.zw + w.s * 0.3], [w.s, 0, 0], u.sw, u.sh, { glyphs: u.glyphs, col: u.col, col2: u.col2, t: 0.12, gap: 0.18, r: 0.028, gy: u.gy, back: [0.04, 0.04, 0.05] }); }
        else if (u.t === 'box') { const w = u.w; const ry = w.s > 0 ? 0 : Math.PI; put(W.b('vcol', u.x, w.zw), kg().box, u.x, u.y, w.zw + w.s * 0.11, 0.98, 0.52, 0.2, [0.08, 0.08, 0.09], ry);
          cnFace(W, u.k, u.x, u.y, w.zw + w.s * 0.212, ry, 0.9, 0.45, 1); }
        else if (u.t === 'stk') { const w = u.w; const ry = w.s > 0 ? 0 : Math.PI; for (let i = 0; i < u.n; i++) { const s = rand(0.14, 0.3); cnFace(W, 100 + randi(0, 15), rand(u.x0, u.x1), u.y0 + rand(0.7, 2.1), w.zw + w.s * (0.012 + i * 0.0015), ry, s, s * rand(1.0, 1.35), 0, rand(-0.15, 0.15)); } }
      } });
    }
    this.world = W.build(this.group, this.mats, { neon: { cast: false }, cone: { cast: false, receive: false }, steam: { cast: false, receive: false }, cnsign: { cast: false }, nglow: { cast: false, receive: false }, nrefl: { cast: false, receive: false }, puddle: { cast: false }, vcolD: { cast: false } });
  }
  sync(cam) {
    if (!cam || !this.alleys.length) return; const p = cam.position; let changed = false;
    for (const A of this.alleys) { const dx = Math.max(A.xs - p.x, 0, p.x - A.xe), dz = A.z - p.z; const d = Math.hypot(dx, dz) + Math.max(0, p.y - 30) * 0.5; const on = this.active.has(A.idx);
      if (!on && d < ON_R) { this.active.add(A.idx); changed = true; } else if (on && d > OFF_R) { this.active.delete(A.idx); changed = true; } }
    if (!changed) return;
    for (const [k, im] of this.kinds) { let n = 0; const arr = im.instanceMatrix.array;
      for (const A of this.alleys) { if (!this.active.has(A.idx) || !A.inst[k]) continue; arr.set(A.inst[k], n * 16); n += A.inst[k].length / 16; }
      im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (n) { im.boundingSphere = null; im.computeBoundingSphere(); } }
    this.buildUniq();
  }
  tris() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n += im.geometry.attributes.position.count / 3 * im.count; for (const m of this.world) n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3; return Math.round(n); }
  calls() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n++; return n + this.world.length; }
  // alley end points for the walk test: [{ idx, x0, x1, z, through }]
  ends() { return this.alleys.map((A) => ({ idx: A.idx, x0: A.xs, x1: A.xe, z: A.z, through: A.through })); }
}
