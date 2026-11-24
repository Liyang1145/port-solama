// r6.4 b_rooftop (Hark modelling lane, 2026-11-22): rooftop detail for the low / mid-rise buildings of 霓港 (NOT the megatower
// crowns, those are crown.js / arch.js). Read from the air and from high vantage points. Original content only.
//  * water tanks: squat tanks on short steel legs (timber-stave or galvanised) and tall tanks on braced stands with a catwalk ring
//  * packaged cooling-tower banks (1–3 cells: louvred casing, fan stack + guard, skid) with condenser-water pipes on sleepers
//  * vent caps (mushroom / turbine ventilators), gooseneck vents, roof hatches and skylights
//  * antenna forests (yagi masts, whips) and satellite-dish groups on pipe racks — every dish on the map points the same way
//  * tilted solar-panel rows on steel frames (one azimuth map-wide), roof guard rails on the parapet / deck edge
//  * small rooftop billboards (steel frame + catwalk) with a kit.js neonSign tube face or a street2.js cnFace light box
//  * red aviation obstruction lights on roof corners of taller buildings, mast tips and billboard tops; steady / flashing at night
// Where the decks come from: city.js rooftop() / decoHotel() log every deck they lay (ROOF_LOG, no rng use). The hand-built Deco core
// is drained at construction; streamed parcels are handed over by stream.js (Stream.onParcel) the moment their near detail is built,
// planned once per parcel under its own seed (cached, so a chunk that reloads gets the same roof). Parcels that reach above 62 m
// (megatowers / tall towers) only get their podium decks dressed (< 25 m); no deck above 62 m is touched.
// Rendering: one InstancedMesh per (unit geometry, material) for the whole map; instance buffers are repacked from the decks nearest
// the camera (chunk near-loaded, ≤ RMAX m) under a fixed triangle budget, so triangles and draw calls stay bounded at any height.
// From below a deck (camera under the roof line) only the pieces that clear the parapet are packed (masts, tanks, cooling towers,
// rails, billboards, lights). Materials: MeshStandardMaterial prepped with the existing 'lamp' key (instanced street-light program,
// no maps / vertex colours) -> no new shader program; the aviation lights blink by animating their emissiveIntensity uniform from
// uTime. Billboard faces go to one merged World built from the existing 'vcol' / 'vcolD' / 'neon' / 'nglow' / 'cnsign' materials.
// No colliders are added or changed.
import * as THREE from 'three';
import { World } from '../../geo.js';
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';
import { kg, neonSign, GLYPHS, NEONC, put } from './kit.js';
import { cnFace } from './street2.js';
import { ROOF_LOG } from './city.js';

const CH = 160, RMAX = 300, BUDGET = 40000, YMAX = 62, RMAX_LOW = 170, BUDGET_LOW = 24000; // budgets: layer triangles (the frame pays ~2x: two scene passes) // *_LOW: camera at street level (< 20 m)
const DISH_AZ = 2.55, SOLAR_AZ = 2.55; // world yaw the dishes / panels face (one satellite, one sun)

// ------------------------------------------------------------------ unit geometries ----
function merge(parts) {
  const pos = [], nor = [];
  for (const g0 of parts) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return g;
}
const BX = (x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; };
function BAR(a, b, w, h = w) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); d.normalize();
  const g = new THREE.BoxGeometry(w, L, h); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
const CYL = (r, y0, y1, n = 12, open = false, x = 0, z = 0, r2 = r) => { const g = new THREE.CylinderGeometry(r2, r, y1 - y0, n, 1, open); g.translate(x, (y0 + y1) / 2, z); return g; };
const flip = (g0) => { const g = g0.index ? g0.toNonIndexed() : g0.clone(); const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; const u = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = u; }
  for (let i = 0; i < n.length; i++) n[i] = -n[i]; return g; };
let GEO = null;
function geos() {
  if (GEO) return GEO; const G = {};
  G.box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();             // unit box centred (bars / plates / pads, oriented by the matrix)
  G.pipe = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).toNonIndexed();
  G.ball = new THREE.SphereGeometry(0.13, 6, 4).toNonIndexed();
  // tank A: squat tank on short legs (legs 1.6, body r 1.35 × 2.6, conical roof); origin = deck centre under the tank
  { const r = 1.35, lh = 1.6, th = 2.6; G.tankAb = merge([CYL(r, lh, lh + th, 14)]);
    const P = [new THREE.ConeGeometry(r * 1.05, 0.75, 14, 1).translate(0, lh + th + 0.37, 0), CYL(0.2, lh + th + 0.6, lh + th + 0.85, 6)];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(BX(sx * r * 0.72 - 0.08, 0, sz * r * 0.72 - 0.08, sx * r * 0.72 + 0.08, lh, sz * r * 0.72 + 0.08));
    for (const s of [-1, 1]) P.push(BX(-r - 0.1, lh - 0.22, s * r * 0.72 - 0.09, r + 0.1, lh, s * r * 0.72 + 0.09)); // sleeper beams
    for (const t of [0.22, 0.55, 0.88]) P.push(CYL(r + 0.035, lh + th * t - 0.04, lh + th * t + 0.04, 14, true)); // hoops
    for (const z of [-0.2, 0.2]) P.push(BX(r + 0.1, 0, z - 0.025, r + 0.15, lh + th + 0.5, z + 0.025)); // ladder rails
    for (let y = 0.35; y < lh + th + 0.4; y += 0.32) P.push(BX(r + 0.1, y - 0.015, -0.2, r + 0.15, y + 0.015, 0.2));
    P.push(CYL(0.07, 0.2, lh, 6, true, -r * 0.4, -r * 0.4)); // outlet pipe down to the deck
    G.tankAf = merge(P); }
  // tank B: tall tank on a braced stand (legs 4.0, body r 1.1 × 3.0, dome cap, catwalk ring + rail)
  { const r = 1.1, lh = 4.0, th = 3.0; const d = new THREE.SphereGeometry(r, 14, 3, 0, Math.PI * 2, 0, 0.55); d.scale(1, 0.55, 1); d.translate(0, lh + th, 0);
    G.tankBb = merge([CYL(r, lh, lh + th, 14), d]);
    const P = []; const L = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * r * 0.85, b * r * 0.85]);
    for (const [x, z] of L) P.push(BAR([x * 1.12, 0, z * 1.12], [x, lh, z], 0.12));
    for (let i = 0; i < 4; i++) { const [ax, az] = L[i], [bx, bz] = L[(i + 1) % 4]; for (const [y0, y1] of [[0.2, lh * 0.5], [lh * 0.5, lh - 0.1]]) {
      const f0 = 1.12 - 0.12 * y0 / lh, f1 = 1.12 - 0.12 * y1 / lh; P.push(BAR([ax * f0, y0, az * f0], [bx * f1, y1, bz * f1], 0.05), BAR([bx * f0, y0, bz * f0], [ax * f1, y1, az * f1], 0.05)); }
      P.push(BAR([ax, lh * 0.5, az], [bx, lh * 0.5, bz], 0.07)); }
    const n = 12; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; const R0 = r + 0.75;
      P.push(BAR([Math.cos(a0) * (r + 0.4), lh, Math.sin(a0) * (r + 0.4)], [Math.cos(a1) * (r + 0.4), lh, Math.sin(a1) * (r + 0.4)], 0.06, 0.75)); // grating ring
      P.push(BAR([Math.cos(a0) * R0, lh + 1.0, Math.sin(a0) * R0], [Math.cos(a1) * R0, lh + 1.0, Math.sin(a1) * R0], 0.04));
      P.push(BX(Math.cos(a0) * R0 - 0.02, lh, Math.sin(a0) * R0 - 0.02, Math.cos(a0) * R0 + 0.02, lh + 1.0, Math.sin(a0) * R0 + 0.02)); }
    for (const t of [0.3, 0.7]) P.push(CYL(r + 0.03, lh + th * t - 0.04, lh + th * t + 0.04, 14, true));
    for (const z of [-0.2, 0.2]) P.push(BX(r * 1.1 + 0.25, 0, z - 0.025, r * 1.1 + 0.3, lh + 0.1, z + 0.025));
    for (let y = 0.35; y < lh; y += 0.32) P.push(BX(r * 1.1 + 0.25, y - 0.015, -0.2, r * 1.1 + 0.3, y + 0.015, 0.2));
    P.push(CYL(0.08, 0, lh, 6, true, 0, 0)); G.tankBf = merge(P); }
  // packaged cooling-tower cell 2.4 × 2.4, casing to 2.5 m, fan stack on top; origin = deck centre under the cell
  { const P = [BX(-1.2, 0.3, -1.2, 1.2, 2.5, 1.2)];
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) { const y = 0.45 + i * 0.17; P.push(BX(s * 1.2 - 0.06, y, -1.1, s * 1.2 + 0.06, y + 0.05, 1.1)); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; P.push(BX(-0.95, 3.22, -0.03, 0.95, 3.26, 0.03).rotateY(a)); } // fan guard spokes
    G.ctBody = merge(P);
    const Q = [CYL(0.95, 2.5, 3.2, 14, true), CYL(0.98, 3.18, 3.22, 14, true), CYL(0.88, 2.9, 2.94, 12), CYL(0.18, 2.9, 3.05, 8)];
    for (const s of [-1, 1]) Q.push(BX(s * 1.2 - 0.02, 0.4, -1.12, s * 1.2 + 0.02, 1.7, 1.12), BX(-1.3, 0, s * 0.9 - 0.12, 1.3, 0.3, s * 0.9 + 0.12));
    Q.push(BX(1.2, 0.55, -0.16, 1.6, 0.87, 0.16)); G.ctDark = merge(Q); } // inlet stub
  G.ventMush = merge([CYL(0.16, 0, 0.06, 8), CYL(0.09, 0.06, 0.62, 6, true), new THREE.ConeGeometry(0.27, 0.16, 8, 1).translate(0, 0.72, 0), CYL(0.27, 0.6, 0.64, 8, true)]);
  { const s = new THREE.SphereGeometry(0.3, 8, 5); s.scale(1, 0.8, 1); s.translate(0, 0.62, 0); G.ventTurb = merge([CYL(0.3, 0, 0.08, 8), CYL(0.2, 0.08, 0.42, 8, true), s]); }
  // yagi mast (nominal 6 m) and whip antenna (3.5 m)
  { const P = [CYL(0.04, 0, 6, 6, true), BX(-0.2, 0, -0.2, 0.2, 0.05, 0.2)];
    for (const [y, a, L] of [[5.7, 0, 1.6], [5.0, 1.2, 1.3], [4.2, 2.3, 1.1]]) { const c = Math.cos(a), s = Math.sin(a);
      P.push(BAR([0, y, 0], [c * L, y, s * L], 0.03)); for (let k = 1; k <= 5; k++) { const t = k / 5 * L; P.push(BAR([c * t - s * 0.45 * (1 - k / 8), y, s * t + c * 0.45 * (1 - k / 8)], [c * t + s * 0.45 * (1 - k / 8), y, s * t - c * 0.45 * (1 - k / 8)], 0.015)); } }
    G.antYagi = merge(P); }
  G.antWhip = merge([CYL(0.03, 0, 3.5, 5, true), CYL(0.06, 0, 0.5, 6, true), BAR([0, 0.45, 0], [0.5, 0.2, 0], 0.015), BAR([0, 0.45, 0], [-0.25, 0.2, 0.43], 0.015), BAR([0, 0.45, 0], [-0.25, 0.2, -0.43], 0.015)]);
  // satellite dish r 0.5 (concave side +z, tilted up 35°), centre 1.1 m above the origin; mount = pole + arm + LNB
  { const cap = new THREE.SphereGeometry(0.62, 10, 3, 0, Math.PI * 2, 0, 0.9); const fixd = (g) => g.rotateX(-Math.PI / 2).translate(0, 0, 0.62 * Math.cos(0.9) - 0.0).rotateX(-0.6).translate(0, 1.1, 0);
    G.dish = merge([fixd(cap.clone()), fixd(flip(cap.clone()).scale(1.0, 1.0, 1.0))]);
    const f = new THREE.Vector3(0, 0, 0.3).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.6); const lnb = [f.x, f.y + 1.1, f.z];
    const rim = new THREE.Vector3(0, -0.47, 0.0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.6);
    G.dishMount = merge([CYL(0.04, 0, 1.05, 6, true), BX(-0.12, 0, -0.12, 0.12, 0.04, 0.12), BAR([0, 1.0, -0.05], [rim.x, rim.y + 1.1, rim.z], 0.03), BAR([rim.x, rim.y + 1.1, rim.z], lnb, 0.025), BX(lnb[0] - 0.05, lnb[1] - 0.05, lnb[2] - 0.08, lnb[0] + 0.05, lnb[1] + 0.05, lnb[2] + 0.04)]); }
  return (GEO = G);
}

// ------------------------------------------------------------------ materials ----
// [colour, roughness, metalness, emissive?, emissiveIntensity?] — all prepped 'lamp' (shared instanced program)
const MDEF = {
  wood: [0x5b402c, 0.9, 0.0], galv: [0x9aa1a5, 0.42, 0.65], blue: [0x3d5d77, 0.55, 0.35], steel: [0x2b2e32, 0.6, 0.55], ctLight: [0x97a09c, 0.55, 0.25],
  dark: [0x17191b, 0.7, 0.3], dishW: [0xd6d6d0, 0.5, 0.1], solar: [0x0c1730, 0.16, 0.55], yellow: [0xc49b1c, 0.5, 0.3], grey: [0x8b8a86, 0.85, 0.05],
  glass: [0x1c2731, 0.12, 0.4], avA: [0x2a0504, 0.4, 0.0, 0xff1a0e, 0.5], avB: [0x2a0504, 0.4, 0.0, 0xff1a0e, 0.5], avS: [0x2a0504, 0.4, 0.0, 0xff2414, 0.5],
};
// kind: [geometry, material, castShadow, tall (clears the parapet: packed for views from below too)]
const KINDS = {
  tankAw: ['tankAb', 'wood', true, true], tankAg: ['tankAb', 'galv', true, true], tankAf: ['tankAf', 'steel', false, true],
  tankBg: ['tankBb', 'galv', true, true], tankBb: ['tankBb', 'blue', true, true], tankBf: ['tankBf', 'steel', false, true],
  ctBody: ['ctBody', 'ctLight', true, true], ctDark: ['ctDark', 'dark', false, true],
  ventM: ['ventMush', 'galv', false, false], ventT: ['ventTurb', 'galv', false, false], yagi: ['antYagi', 'steel', false, true], whip: ['antWhip', 'steel', false, true],
  dish: ['dish', 'dishW', false, true], dishM: ['dishMount', 'steel', false, true], solar: ['box', 'solar', false, false], barS: ['box', 'steel', false, false],
  barSt: ['box', 'steel', false, true], barY: ['box', 'yellow', false, true], pipeG: ['pipe', 'galv', false, false], boxG: ['box', 'grey', false, false],
  boxGl: ['box', 'glass', false, false], avA: ['ball', 'avA', false, true], avB: ['ball', 'avB', false, true], avS: ['ball', 'avS', false, true],
};
function mkMat([c, r, m, e, ei]) { const o = { color: c, roughness: r, metalness: m }; if (e) { o.emissive = e; o.emissiveIntensity = ei; } return prep(new THREE.MeshStandardMaterial(o), 'lamp'); }

const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const ID = new THREE.Matrix4();

export class RoofLayer {
  constructor(scene, mats, city) {
    this.mats = mats; this.city = city; this.stream = city.stream; this.group = new THREE.Group(); this.group.name = 'roofs'; scene.add(this.group);
    this.M = {}; for (const k in MDEF) this.M[k] = mkMat(MDEF[k]);
    this.kinds = new Map(); this.chunks = new Map(); this.cache = new WeakMap(); this.world = []; this.bbKey = ''; this.last = null; this.frame = 0;
    this.stats = { decks: 0, planned: 0, packed: 0, tris: 0, inst: 0, bill: 0, skipped: 0 };
    const G = geos(); this.triOf = {}; for (const k in KINDS) this.triOf[k] = G[KINDS[k][0]].attributes.position.count / 3;
    // hand-built Deco core: decks logged while buildCity ran (world coordinates)
    const core = ROOF_LOG.splice(0).filter((r) => !r.st);
    core.forEach((r, i) => { if (r.y > YMAX) { this.stats.skipped++; return; } const roof = withSeed((0x700f + i * 7919) >>> 0, () => this.plan(r, ID, 0, true)); if (roof) this.addRoof('core|' + this.keyOf(roof.cx, roof.cz), roof, true); });
    if (this.stream) this.stream.onParcel = (c, p, m) => this.onParcel(c, p, m);
  }
  keyOf(x, z) { return Math.floor(x / CH) + ',' + Math.floor(z / CH); }
  addRoof(key, roof, core) { let c = this.chunks.get(key); if (!c) { const [a, b] = key.replace('core|', '').split(',').map(Number); this.chunks.set(key, c = { key, core, cx: (a + 0.5) * CH, cz: (b + 0.5) * CH, roofs: [], parcels: new Set() }); } c.roofs.push(roof); this.stats.decks++; }
  // stream.js, right after a parcel's near detail was generated: the decks it logged belong to this parcel (local frame, matrix m)
  onParcel(c, p, m) {
    const recs = ROOF_LOG.splice(0).filter((r) => r.st); if (!recs.length) return;
    let ch = this.chunks.get(c.key); if (ch && ch.parcels.has(p)) return; // planned before (chunk reloaded): keep the cached roofs
    let roofs = this.cache.get(p);
    if (!roofs) { const tall = recs.reduce((a, r) => Math.max(a, r.y), 0) > YMAX; const th = Math.atan2(-Math.sin(p.ang), Math.cos(p.ang));
      roofs = []; recs.forEach((r, i) => { if (r.y > YMAX || (tall && r.y > 25)) { this.stats.skipped++; return; }
        const roof = withSeed(((p.seed ^ 0x7007f00f) + i * 7919) >>> 0, () => this.plan(r, m, th, false)); if (roof) roofs.push(roof); });
      this.cache.set(p, roofs); }
    if (!ch) { this.chunks.set(c.key, ch = { key: c.key, core: false, cx: c.cx, cz: c.cz, roofs: [], parcels: new Set() }); }
    ch.parcels.add(p); for (const r of roofs) { ch.roofs.push(r); this.stats.decks++; }
    this.dirty = true;
  }
  // ---------------------------------------------------------------- planning (deck local frame -> world via M) ----
  plan(r, M, th, core) {
    const { x0, z0, x1, z1, y } = r; const W = x1 - x0, D = z1 - z0; if (W < 4.5 || D < 4.5) return null;
    const roof = { y, inst: {}, uniq: [], tris: 0, lowTris: 0 }; this.stats.planned++;
    const c0 = new THREE.Vector3((x0 + x1) / 2, y, (z0 + z1) / 2).applyMatrix4(M); roof.cx = c0.x; roof.cz = c0.z; roof.r = Math.hypot(W, D) / 2;
    const used = r.used.slice(); const parapet = r.ph > 0.5; const ytop = y + r.ph; // deck at y, parapet / coping top at ytop
    const push = (k, mat) => { _w.multiplyMatrices(M, mat); const a = roof.inst[k] || (roof.inst[k] = []); a.push(..._w.elements); const t = this.triOf[k]; roof.tris += t; if (!KINDS[k][3]) roof.lowTris += t; };
    const P = (k, x, yy, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0) => { _e.set(rx, ry, 0, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, yy, z); push(k, _m.compose(_p, _q, _s)); };
    const seg = (k, a, b, w, h = w) => { _a.set(...a); _b.set(...b); const L = _a.distanceTo(_b); if (L < 0.01) return; _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); _s.set(w, L, h); _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); push(k, _m.compose(_p, _q, _s)); };
    const free = (a0, b0, a1, b1) => a0 > x0 + 0.5 && b0 > z0 + 0.5 && a1 < x1 - 0.5 && b1 < z1 - 0.5 && !used.some((u) => a0 < u[2] && a1 > u[0] && b0 < u[3] && b1 > u[1]);
    const place = (w, d, pad = 0.5, n = 14) => { for (let i = 0; i < n; i++) { const a = rand(x0 + 0.6, x1 - 0.6 - w), c = rand(z0 + 0.6, z1 - 0.6 - d); if (free(a - pad, c - pad, a + w + pad, c + d + pad)) { used.push([a, c, a + w, c + d]); return [a, c]; } } return null; };
    const area = W * D; const big = area > 150;
    // ---- guard rail along the parapet / deck edge (some roofs; always on decks without a parapet that have roof plant)
    if (rng() < (parapet ? 0.3 : 0.55)) { const ry = parapet ? ytop + 0.1 : y; const k = rng() < 0.55 ? 'barY' : 'barSt'; const i = parapet ? 0.15 : 0.25; const hr = parapet ? 0.95 : 1.1;
      const E = [[x0 + i, z0 + i, x1 - i, z0 + i], [x1 - i, z0 + i, x1 - i, z1 - i], [x1 - i, z1 - i, x0 + i, z1 - i], [x0 + i, z1 - i, x0 + i, z0 + i]];
      for (const [ax, az, bx, bz] of E) { const L = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.round(L / 1.8));
        seg(k, [ax, ry + hr, az], [bx, ry + hr, bz], 0.05); seg(k, [ax, ry + hr * 0.5, az], [bx, ry + hr * 0.5, bz], 0.04);
        for (let j = 0; j < n; j++) { const t = j / n; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; seg(k, [x, ry, z], [x, ry + hr, z], 0.05); } } }
    // ---- water tanks
    if (area > 60 && rng() < 0.55) for (let n = rng() < (big ? 0.4 : 0.15) ? 2 : 1, j = 0; j < n; j++) {
      const B = rng() < 0.4; const s = rand(0.8, 1.15); const fp = (B ? 2.4 : 3.0) * s; const q = place(fp + 0.8, fp + 0.8, 0.4); if (!q) break;
      const x = q[0] + (fp + 0.8) / 2, z = q[1] + (fp + 0.8) / 2, ry = rand(0, 6.28);
      if (B) { P(rng() < 0.5 ? 'tankBg' : 'tankBb', x, y, z, s, s, s, ry); P('tankBf', x, y, z, s, s, s, ry); roof.tall = Math.max(roof.tall || 0, 7.6 * s); }
      else { P(rng() < 0.55 ? 'tankAw' : 'tankAg', x, y, z, s, s, s, ry); P('tankAf', x, y, z, s, s, s, ry); roof.tall = Math.max(roof.tall || 0, 5.1 * s); }
      // feed pipe from the tank down across the deck to the nearest edge on sleepers
      const ex = x - x0 < x1 - x ? x0 + 0.6 : x1 - 0.6; seg('pipeG', [x, y + 0.35, z], [ex, y + 0.35, z], 0.07); for (let u = Math.min(x, ex) + 0.8; u < Math.max(x, ex); u += 2.2) P('boxG', u, y + 0.1, z, 0.25, 0.2, 0.6); }
    // ---- cooling-tower bank (1–3 cells) + condenser-water pipes on sleepers
    if (area > 110 && rng() < 0.5) { const n = randi(1, W > 20 || D > 20 ? 3 : 2); const alongX = W >= D; const L = n * 2.5;
      const q = place(alongX ? L + 0.4 : 3.2, alongX ? 3.2 : L + 0.4, 0.8);
      if (q) { const ry = alongX ? 0 : Math.PI / 2; for (let i = 0; i < n; i++) { const x = alongX ? q[0] + 1.45 + i * 2.5 : q[0] + 1.6, z = alongX ? q[1] + 1.6 : q[1] + 1.45 + i * 2.5; P('ctBody', x, y, z, 1, 1, 1, ry); P('ctDark', x, y, z, 1, 1, 1, ry); }
        roof.tall = Math.max(roof.tall || 0, 3.3);
        const px = alongX ? q[0] + 0.3 : q[0] + 3.4, pz = alongX ? q[1] + 3.4 : q[1] + 0.3; const ex = alongX ? px : (px - x0 < x1 - px ? x0 + 0.7 : x1 - 0.7), ez = alongX ? (pz - z0 < z1 - pz ? z0 + 0.7 : z1 - 0.7) : pz;
        for (const o of [0, 0.45]) { const a = alongX ? [px + o, y + 0.45, pz] : [px, y + 0.45, pz + o]; const b = alongX ? [ex + o, y + 0.45, ez] : [ex, y + 0.45, ez + o]; seg('pipeG', [a[0], y + 0.45, a[2]], [b[0], y + 0.45, b[2]], 0.12);
          seg('pipeG', [b[0], y + 0.45, b[2]], [b[0], ytop + 0.6, b[2]], 0.12); }
        for (let t = 0.15; t < 1; t += 0.25) P('boxG', px + (ex - px) * t, y + 0.12, pz + (ez - pz) * t, alongX ? 1.2 : 0.25, 0.24, alongX ? 0.25 : 1.2); } }
    // ---- vent caps, gooseneck vents, hatches, skylights
    for (let i = 0, n = randi(2, Math.min(10, 2 + Math.floor(area / 45))); i < n; i++) { const q = place(0.6, 0.6, 0.3, 6); if (!q) break; P(rng() < 0.55 ? 'ventM' : 'ventT', q[0] + 0.3, y, q[1] + 0.3, 1, rand(0.85, 1.3), 1, rand(0, 6.28)); }
    for (let i = 0, n = randi(0, 2); i < n; i++) { const q = place(0.5, 1.0, 0.3, 6); if (!q) break; const x = q[0] + 0.25, z = q[1] + 0.2; const h = rand(0.7, 1.1);
      seg('pipeG', [x, y, z], [x, y + h, z], 0.09); seg('pipeG', [x, y + h, z], [x, y + h + 0.12, z + 0.35], 0.09); seg('pipeG', [x, y + h + 0.12, z + 0.35], [x, y + h - 0.25, z + 0.6], 0.09); }
    if (rng() < 0.6) { const q = place(1.0, 1.0, 0.5, 8); if (q) { P('boxG', q[0] + 0.5, y + 0.3, q[1] + 0.5, 1.0, 0.6, 1.0); P('barS', q[0] + 0.5, y + 0.63, q[1] + 0.5, 0.92, 0.06, 0.92); } }
    for (let i = 0, n = big && rng() < 0.45 ? randi(1, 3) : 0; i < n; i++) { const w = rand(1.6, 3.2), d = rand(1.2, 2.4); const q = place(w, d, 0.6, 8); if (!q) break;
      P('boxG', q[0] + w / 2, y + 0.22, q[1] + d / 2, w + 0.2, 0.44, d + 0.2); P('boxGl', q[0] + w / 2, y + 0.47, q[1] + d / 2, w, 0.06, d, 0, 0); }
    // ---- antenna forest + dish group (pipe rack along a free strip or single mounts)
    if (rng() < 0.75) { const n = randi(1, big ? 4 : 2); const q = place(2.2, 2.2, 0.4, 10);
      if (q) for (let i = 0; i < n; i++) { const x = q[0] + rand(0.2, 2.0), z = q[1] + rand(0.2, 2.0); const yagi = rng() < 0.6; const s = rand(0.6, 1.25);
        P(yagi ? 'yagi' : 'whip', x, y, z, s, s, s, rand(0, 6.28)); const tip = (yagi ? 6 : 3.5) * s; roof.tall = Math.max(roof.tall || 0, tip);
        if (i === 0 && tip > 4.5 && (y > 16 || rng() < 0.5)) P(rng() < 0.6 ? 'avA' : 'avB', x, y + tip + 0.08, z); } }
    if (rng() < 0.6) { const n = randi(1, big ? 5 : 3); const ry = DISH_AZ - th;
      if (n >= 3) { const L = n * 1.15; const q = place(L, 1.2, 0.4, 10); if (q) { const zz = q[1] + 0.6; seg('barS', [q[0], y + 0.6, zz], [q[0] + L, y + 0.6, zz], 0.08);
          for (const xx of [q[0] + 0.1, q[0] + L - 0.1]) seg('barS', [xx, y, zz], [xx, y + 0.6, zz], 0.08);
          for (let i = 0; i < n; i++) { const x = q[0] + 0.58 + i * 1.15, s = rand(0.75, 1.15); P('dish', x, y, zz, s, s, s, ry + rand(-0.08, 0.08)); P('dishM', x, y, zz, s, s, s, ry); } } }
      else for (let i = 0; i < n; i++) { const q = place(1.1, 1.1, 0.3, 8); if (!q) break; const s = rand(0.7, 1.1); P('dish', q[0] + 0.55, y, q[1] + 0.55, s, s, s, ry + rand(-0.1, 0.1)); P('dishM', q[0] + 0.55, y, q[1] + 0.55, s, s, s, ry); } }
    // ---- solar rows (largest free strip found among a few tries)
    if (area > 70 && rng() < 0.42) { let best = null; for (let t = 0; t < 8; t++) { const w = rand(3.5, Math.min(14, W - 2)), d = rand(3.2, Math.min(9, D - 2)); if (w < 3 || d < 3) continue;
        const a = rand(x0 + 0.8, x1 - 0.8 - w), c = rand(z0 + 0.8, z1 - 0.8 - d); if (free(a - 0.4, c - 0.4, a + w + 0.4, c + d + 0.4) && (!best || w * d > best[2] * best[3])) best = [a, c, w, d]; }
      if (best) { used.push([best[0], best[1], best[0] + best[2], best[1] + best[3]]); const [a, c, w, d] = best; const tilt = 0.44, pd = 1.65, py = Math.sin(tilt) * pd;
        // panels face SOLAR_AZ in world: pick the deck axis closest to it for the rows, yaw the panels exactly to it
        const d0 = Math.abs(Math.atan2(Math.sin(th - SOLAR_AZ), Math.cos(th - SOLAR_AZ))); const ry = d0 < Math.PI / 2 ? 0 : Math.PI, sg = ry ? -1 : 1; const rows = Math.max(1, Math.floor((d - 0.2) / (pd * Math.cos(tilt) + 1.1)));
        for (let k = 0; k < rows; k++) { const zr = c + 0.4 + k * (pd * Math.cos(tilt) + 1.1) + pd * Math.cos(tilt) / 2; const n = Math.max(1, Math.floor(w / 1.05));
          for (let i = 0; i < n; i++) { const xx = a + 0.55 + i * 1.05; P('solar', xx, y + 0.45 + py / 2, zr, 1.0, 0.04, pd, ry, tilt); }
          const hz = pd * Math.cos(tilt) / 2; // low edge on the side the panels face (sg), high edge behind
          for (const zo of [-hz, hz]) { const hi = zo * sg < 0 ? py : 0; seg('barS', [a + 0.05, y + 0.4 + hi, zr + zo], [a + 0.05 + n * 1.05, y + 0.4 + hi, zr + zo], 0.06); }
          for (let x = a + 0.1; x <= a + n * 1.05 + 0.05; x += 2.1) { seg('barS', [x, y, zr + sg * hz], [x, y + 0.42, zr + sg * hz], 0.05); seg('barS', [x, y, zr - sg * hz], [x, y + 0.42 + py, zr - sg * hz], 0.05); } } } }
    // ---- small rooftop billboard (streamed parcels face the street = +x; Deco hotels their facing; core towers skip)
    const face = core ? (r.kind === 'deco' ? r.facing : 0) : 1;
    if (face && W > 8 && D > 8 && y > 7 && y < 45 && rng() < 0.24) { const bw = Math.min(D - 3, rand(4.5, 8)), bh = bw * rand(0.32, 0.45); const bx = face > 0 ? x0 + W * 0.42 : x1 - W * 0.42; const zc = rand(z0 + bw / 2 + 1, z1 - bw / 2 - 1);
      if (free(bx - 1.6, zc - bw / 2, bx + 1.6, zc + bw / 2)) { used.push([bx - 1.6, zc - bw / 2, bx + 1.6, zc + bw / 2]); const by = ytop + rand(1.6, 2.6); const fx = bx + face * 0.25;
        for (const zz of [zc - bw * 0.38, zc + bw * 0.38]) { seg('barSt', [bx, y, zz], [bx, by + bh, zz], 0.16); seg('barSt', [bx - face * 1.5, y, zz], [bx, by + bh * 0.55, zz], 0.1); seg('barSt', [bx, by - 0.05, zz], [bx + face * 0.9, by - 0.05, zz], 0.1); }
        seg('barSt', [bx, by + 0.2, zc - bw / 2], [bx, by + bh - 0.2, zc + bw / 2], 0.06); seg('barSt', [bx, by + bh - 0.2, zc - bw / 2], [bx, by + 0.2, zc + bw / 2], 0.06);
        P('barS', bx + face * 0.65, by - 0.12, zc, 0.9, 0.06, bw); seg('barSt', [bx + face * 1.1, by - 0.1, zc - bw / 2], [bx + face * 1.1, by - 0.1, zc + bw / 2], 0.04); seg('barSt', [bx + face * 1.1, by + 0.9, zc - bw / 2], [bx + face * 1.1, by + 0.9, zc + bw / 2], 0.04);
        for (const zz of [zc - bw / 2 + 0.1, zc + bw / 2 - 0.1]) P(rng() < 0.5 ? 'avA' : 'avB', bx, by + bh + 0.12, zz);
        const w3 = new THREE.Vector3(fx + face * 0.12, by + bh / 2, zc).applyMatrix4(M); const e3 = new THREE.Vector3(0, 0, -face).transformDirection(M);
        roof.uniq.push({ c: [w3.x, w3.y, w3.z], e1: [e3.x, 0, e3.z], w: bw, h: bh, neon: rng() < 0.55, glyphs: rng() < 0.4 ? [pick(GLYPHS.slice(10))] : [GLYPHS[randi(0, 9)], GLYPHS[randi(0, 9)], GLYPHS[randi(0, 9)]].slice(0, randi(2, 3)), col: pick(NEONC), col2: pick(NEONC), k: randi(0, 23) });
        roof.tall = Math.max(roof.tall || 0, by + bh - y); this.stats.bill++; } }
    // ---- aviation obstruction lights on the parapet corners of the taller decks (steady + flashing pairs)
    if (y >= 24) { const i = 0.35; const k = rng() < 0.5 ? 'avS' : 'avA'; for (const [x, z] of [[x0 + i, z0 + i], [x1 - i, z0 + i], [x1 - i, z1 - i], [x0 + i, z1 - i]]) { P(k === 'avA' && rng() < 0.5 ? 'avB' : k, x, ytop + 0.25, z); P('barS', x, ytop + 0.07, z, 0.1, 0.14, 0.1); } }
    return roof.tris ? roof : null;
  }
  // ---------------------------------------------------------------- packing ----
  ensure(k, n) {
    let im = this.kinds.get(k); if (im && im.instanceMatrix.count >= n) return im;
    const cap = Math.max(64, 1 << Math.ceil(Math.log2(Math.max(1, n)))); const [gk, mk, cast] = KINDS[k];
    if (im) { this.group.remove(im); im.dispose(); }
    im = new THREE.InstancedMesh(geos()[gk], this.M[mk], cap); im.count = 0; im.castShadow = false; void cast; // no casters: the instanced depth program would be new in most views (b_rooftop census)
    im.receiveShadow = true; im.name = 'roof|' + k; im.visible = false; im.frustumCulled = false;
    this.group.add(im); this.kinds.set(k, im); return im;
  }
  repack(cam) {
    const p = cam.position; const st = this.stream; const cand = []; const low = p.y < 20; const rmax = low ? RMAX_LOW : RMAX, budget = low ? BUDGET_LOW : BUDGET;
    for (const c of this.chunks.values()) { const on = c.core ? Math.hypot(c.cx - p.x, c.cz - p.z) < 330 : !!(st && st.chunks.get(c.key) && st.chunks.get(c.key).near); if (!on) continue;
      for (const r of c.roofs) { const d = Math.max(0, Math.hypot(r.cx - p.x, r.cz - p.z) - r.r); if (d < rmax) cand.push([d, r]); } }
    cand.sort((a, b) => a[0] - b[0]);
    const take = new Map(); let tris = 0, n = 0; const bill = [];
    for (const [d, r] of cand) { const below = p.y < r.y - 0.5 && d > 6; const t = below ? r.tris - r.lowTris : r.tris; if (tris + t > budget) continue; tris += t; n++;
      for (const k in r.inst) { if (below && !KINDS[k][3]) continue; let l = take.get(k); if (!l) take.set(k, l = []); l.push(r.inst[k]); }
      if (r.uniq.length) bill.push(r); }
    for (const [k, im] of this.kinds) if (!take.has(k)) { im.count = 0; im.visible = false; }
    for (const [k, l] of take) { const tot = l.reduce((s, a) => s + a.length / 16, 0); const im = this.ensure(k, tot); const arr = im.instanceMatrix.array; let o = 0;
      for (const a of l) { arr.set(a, o * 16); o += a.length / 16; } im.count = tot; im.visible = tot > 0; im.instanceMatrix.needsUpdate = true; }
    this.stats.packed = n; this.stats.tris = tris; this.stats.inst = [...this.kinds.values()].reduce((s, im) => s + im.count, 0);
    const key = bill.map((r) => r.cx.toFixed(1) + ':' + r.cz.toFixed(1)).join('|'); if (key !== this.bbKey) { this.bbKey = key; this.buildUniq(bill); }
  }
  buildUniq(list) {
    for (const m of this.world) { this.group.remove(m); m.geometry.dispose(); } this.world = []; if (!list.length) return;
    const W = new World(1e7); W.attrs = {};
    list.forEach((r, i) => withSeed((0xb111 + Math.round(r.cx * 7 + r.cz * 13)) >>> 0, () => { for (const u of r.uniq) {
      if (u.neon) neonSign(W, u.c, u.e1, u.w, u.h, { glyphs: u.glyphs, col: u.col, col2: u.col2, t: 0.3, gap: 0.1, r: 0.06, alt: true, back: [0.05, 0.05, 0.06] });
      else { const ry = Math.atan2(-u.e1[2], u.e1[0]); const nx = -u.e1[2], nz = u.e1[0]; // light box: dark case + lit cnFace shop-name face
        put(W.b('vcol', u.c[0], u.c[2]), kg().box, u.c[0], u.c[1], u.c[2], u.w, u.h, 0.3, [0.07, 0.07, 0.08], ry);
        cnFace(W, u.k, u.c[0] + nx * 0.16, u.c[1], u.c[2] + nz * 0.16, Math.atan2(nx, nz), u.w * 0.94, u.h * 0.9, 1); } } }));
    this.world = W.build(this.group, this.mats, { neon: { cast: false }, cnsign: { cast: false }, nglow: { cast: false, receive: false }, nrefl: { cast: false, receive: false }, vcolD: { cast: false }, vcol: { cast: false } });
  }
  sync(cam) {
    if (!cam) return; this.frame++;
    // aviation lights: steady / two flashing phases, driven from uTime (uniform), bright at night, dim by day
    const nt = U.uNight.value, t = U.uTime.value; const flash = (ph) => (((t * 0.8 + ph) % 1) < 0.3 ? 1 : 0);
    this.M.avS.emissiveIntensity = 0.6 + nt * 4.5; this.M.avA.emissiveIntensity = 0.35 + nt * (0.3 + 7 * flash(0)); this.M.avB.emissiveIntensity = 0.35 + nt * (0.3 + 7 * flash(0.5));
    const p = cam.position; const L = this.last; let on = 0; const st = this.stream;
    if (st) for (const c of this.chunks.values()) if (!c.core && st.chunks.get(c.key) && st.chunks.get(c.key).near) on++;
    const moved = !L || Math.hypot(p.x - L.x, p.z - L.z) > 14 || Math.abs(p.y - L.y) > 6 || Math.sign(p.y - 30) !== L.sy;
    if (this.dirty || on !== (L && L.on) || (moved && this.frame - (L ? L.f : -99) > 8)) { this.dirty = false; this.repack(cam); this.last = { x: p.x, y: p.y, z: p.z, sy: Math.sign(p.y - 30), on, f: this.frame }; }
  }
  tris() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n += im.geometry.attributes.position.count / 3 * im.count; for (const m of this.world) n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3; return Math.round(n); }
  calls() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n++; return n + this.world.length; }
}
