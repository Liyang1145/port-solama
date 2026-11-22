// r6.4 b_parcelgap (Hark modelling lane, 2026-11-22): closes the 0–3 m slots between neighbouring streamed parcels of 霓港 (B map).
// parcels.js lays lots along every road with a random 0–3 m spacing, so from the street you looked straight through those slots
// into the void / the next block. Each slot is now finished on the street side. Original content only.
//  * narrow slots (< 1.2 m, too tight to walk): a roller shutter (slats + housing + guide rails), a barred steel gate (spiked top,
//    padlock) or a chain-link panel with a razor-wire coil; the thinnest (< 0.4 m) get a riveted steel cover strip. A dark back
//    panel a few metres in stops the light from passing through. Thin colliders across the mouth and the back end keep players out.
//  * wide slots (≥ 1.2 m, walkable): left open — gate leaves swung back against the walls or a rolled-up shutter housing — with two
//    staggered dark baffle walls deeper in (dog-leg: no straight sight line through, a 0.85–0.9 m opening each, so it stays
//    walkable), a wall lamp, and a clutter cluster against one wall on slots ≥ 2 m (with a collider, ≥ 1.4 m lane left clear).
//  * every slot: wet dark floor, vertical downpipes / conduits / cable drops with junction boxes up the walls, sagging cable
//    bundles strung across the slot, a small hung light box at the mouth (cyan / magenta / amber), bags / crates / boxes heaped
//    in front of the closure.
// Slots are found once at startup from city.parcels (same seed -> same slots); colliders are added then (physics never depends on
// streaming, like the parcel colliders). Visual detail is planned the first time both neighbours' near detail was built — stream.js
// Stream.onParcel (b_rooftop hook, chained) reports each parcel; the lowest roof deck it logged (city.js ROOF_LOG, read without
// consuming it) caps the back panels / pipes below the real roof line — and is cached, so a chunk that reloads gets the same slot.
// Rendering: one InstancedMesh per (unit geometry, material) for the whole map; instance buffers are repacked from the slots of the
// near-loaded chunks nearest the camera under a triangle budget, released with their chunk. Materials: MeshStandardMaterial prepped
// 'lamp' (the instanced street-light program, as alley.js / roofs.js) -> no new shader program; light boxes / bulbs dim and brighten
// with uNight through their emissiveIntensity uniform. Nothing casts shadows. Existing buildings are untouched.
import * as THREE from 'three';
import { mulberry, withSeed, rng, rand, randi, pick } from '../../util.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';
import { ROOF_LOG } from './city.js';

const CH = 160, RMAX = 150, BUDGET = 15000, /* layer triangles; the frame draws it ~3x (main + 2 extra scene passes) */ GMAX = 3.3, NARROW = 1.2;
const URBAN = new Set(['deco', 'mid', 'downtown', 'condo', 'port']);
const angWrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

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
function TUBE(a, b, r, n = 4) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); d.normalize();
  const g = new THREE.CylinderGeometry(r, r, L, n, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
let GEO = null;
function geos() {
  if (GEO) return GEO; const G = {};
  G.box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();                       // unit box, centred
  G.pipe = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).toNonIndexed();     // unit pipe (r 1, h 1, centred), oriented by the matrix
  // closures: unit width x ∈ [−0.5, 0.5], unit height y ∈ [0, 1] (scaled to the slot width / closure height), plane z ≈ 0
  { const P = [], n = 14; for (let i = 0; i < n; i++) { const y0 = i / n, y1 = (i + 1) / n - 0.004, z = i % 2 ? 0.006 : -0.006;
      P.push(BX(-0.5, y0, z - 0.008, 0.5, y1, z + 0.008), BX(-0.5, y0 + 0.028, z + 0.008, 0.5, y0 + 0.042, z + 0.016)); }
    P.push(BX(-0.5, 0, -0.03, 0.5, 0.022, 0.03), BX(-0.06, 0.03, 0.02, 0.06, 0.05, 0.04)); G.shutter = merge(P); } // slats + bottom bar + handle
  { const P = [BX(-0.5, 0, -0.02, 0.5, 0.025, 0.02), BX(-0.5, 0.975, -0.02, 0.5, 1.0, 0.02), BX(-0.5, 0.45, -0.018, 0.5, 0.47, 0.018), BX(-0.5, 0, -0.022, -0.47, 1.0, 0.022), BX(0.47, 0, -0.022, 0.5, 1.0, 0.022)];
    for (let i = 1; i <= 9; i++) { const x = -0.5 + i * 0.1; P.push(BX(x - 0.007, 0, -0.008, x + 0.007, 1.06, 0.008)); const c = new THREE.ConeGeometry(0.018, 0.05, 4, 1); c.translate(x, 1.085, 0); P.push(c); }
    for (let i = 0; i < 5; i++) P.push(BAR([-0.47 + i * 0.2, 0.03, 0.012], [-0.27 + i * 0.2, 0.44, 0.012], 0.01, 0.008)); // diagonal braces, lower half
    G.gate = merge(P); }
  { const P = []; const k = 9; // chain-link diamonds as two families of diagonals clipped to the unit panel
    for (const dir of [1, -1]) for (let i = -k; i <= k; i++) { const c = i / k; // line y = dir*(x) * 1 + c, in panel coords x ∈ [−.5,.5], y ∈ [0,1]
      const pts = []; for (const x of [-0.5, 0.5]) { const y = 0.5 + dir * x + c; if (y >= 0 && y <= 1) pts.push([x, y]); }
      for (const y of [0, 1]) { const x = (y - 0.5 - c) * dir; if (x > -0.5 && x < 0.5) pts.push([x, y]); }
      if (pts.length >= 2) P.push(BAR([pts[0][0], pts[0][1], 0], [pts[1][0], pts[1][1], 0], 0.006, 0.006)); }
    P.push(BX(-0.5, 0.0, -0.01, 0.5, 0.012, 0.01)); G.fence = merge(P); }
  { const P = []; const turns = 6, seg = 8, R = 0.16; let prev = null; // razor-wire coil along x ∈ [−0.5, 0.5] (scaled in x only)
    for (let i = 0; i <= turns * seg; i++) { const t = i / (turns * seg), a = t * turns * Math.PI * 2; const q = [t - 0.5, Math.sin(a) * R, Math.cos(a) * R]; if (prev) P.push(TUBE(prev, q, 0.006, 3)); prev = q; }
    G.razor = merge(P); }
  // sagging 3-strand cable bundle along x ∈ [−0.5, 0.5], sag 0.5 at mid-span (scale x = span, y = sag / 0.5)
  { const P = []; const N = 7;
    for (const [oy, oz, r, sg] of [[0, 0, 0.022, 1], [-0.05, 0.03, 0.017, 1.12], [0.03, -0.03, 0.026, 0.9]]) {
      let prev = null; for (let i = 0; i <= N; i++) { const t = i / N; const q = [t - 0.5, oy - 0.5 * sg * 4 * t * (1 - t), oz]; if (prev) P.push(TUBE(prev, q, r, 3)); prev = q; } }
    G.cable = merge(P); }
  G.bulb = merge([BX(-0.11, -0.16, 0.0, 0.11, 0.0, 0.2), BX(-0.03, 0.0, 0.0, 0.03, 0.12, 0.06)]);         // caged wall lamp, wall plane z = 0
  G.jbox = merge([BX(-0.22, -0.3, 0, 0.22, 0.3, 0.17), BX(-0.24, 0.3, 0, 0.24, 0.34, 0.2)]);             // junction / meter box
  { const s = new THREE.SphereGeometry(0.5, 8, 5); const p = s.attributes.position; const R = mulberry(78);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y0 = p.getY(i), z = p.getZ(i); const k = 0.88 + R() * 0.2; const y = y0 < -0.25 ? -0.25 - (y0 + 0.25) * 0.15 : y0; p.setXYZ(i, x * k * (1 + Math.max(0, -y) * 0.3), y * 0.9 + 0.27, z * k * (1 + Math.max(0, -y) * 0.3)); }
    s.computeVertexNormals(); const knot = new THREE.ConeGeometry(0.06, 0.16, 5); knot.translate(0, 0.78, 0); G.bag = merge([s, knot]); }
  G.crate = merge([BX(-0.3, 0, -0.2, 0.3, 0.03, 0.2), BX(-0.3, 0, -0.2, 0.3, 0.32, -0.18), BX(-0.3, 0, 0.18, 0.3, 0.32, 0.2), BX(-0.3, 0, -0.18, -0.28, 0.32, 0.18), BX(0.28, 0, -0.18, 0.3, 0.32, 0.18),
    BX(-0.32, 0.29, -0.22, 0.32, 0.32, -0.2), BX(-0.32, 0.29, 0.2, 0.32, 0.32, 0.22), BX(-0.32, 0.29, -0.2, -0.3, 0.32, 0.2), BX(0.3, 0.29, -0.2, 0.32, 0.32, 0.2)]);
  return (GEO = G);
}

// ------------------------------------------------------------------ materials ----
// [colour, roughness, metalness, emissive?, emissiveIntensity?] — all prepped 'lamp' (shared instanced program, no maps / vertex colours)
const MDEF = {
  back: [0x06070a, 0.95, 0.0], floor: [0x0b0c0e, 0.28, 0.15], steel: [0x2a2d31, 0.6, 0.55], shutter: [0x6c737a, 0.5, 0.6], shutterR: [0x5f4433, 0.75, 0.4],
  gate: [0x17191c, 0.5, 0.6], fence: [0x8d959a, 0.38, 0.75], pipeGrey: [0x5d6268, 0.45, 0.6], pipeRust: [0x5a3626, 0.8, 0.35], pipeBlack: [0x141517, 0.5, 0.2],
  cable: [0x101113, 0.55, 0.1], jbox: [0x7f8580, 0.55, 0.4], lbBody: [0x0e0f11, 0.6, 0.3],
  lbC: [0x0a2a30, 0.4, 0.0, 0x22e8ff, 1.0], lbM: [0x300a20, 0.4, 0.0, 0xff2a9c, 1.0], lbA: [0x30200a, 0.4, 0.0, 0xffae2a, 1.0], bulb: [0x332a1c, 0.5, 0.0, 0xffc27a, 1.0],
  boxA: [0xa47c4c, 0.92, 0.0], bagK: [0x0f1012, 0.28, 0.0], bagB: [0x1a2d55, 0.32, 0.0], crateR: [0xb51e22, 0.5, 0.0], crateB: [0x1f58a8, 0.5, 0.0],
};
const KINDS = { // kind: [geometry, material]
  back: ['box', 'back'], floor: ['box', 'floor'], steel: ['box', 'steel'], shutter: ['shutter', 'shutter'], shutterR: ['shutter', 'shutterR'], gate: ['gate', 'gate'],
  fence: ['fence', 'fence'], razor: ['razor', 'fence'], pipeGrey: ['pipe', 'pipeGrey'], pipeRust: ['pipe', 'pipeRust'], pipeBlack: ['pipe', 'pipeBlack'], post: ['pipe', 'fence'],
  cable: ['cable', 'cable'], jbox: ['jbox', 'jbox'], lbBody: ['box', 'lbBody'], lbC: ['box', 'lbC'], lbM: ['box', 'lbM'], lbA: ['box', 'lbA'], bulb: ['bulb', 'bulb'],
  boxA: ['box', 'boxA'], bagK: ['bag', 'bagK'], bagB: ['bag', 'bagB'], crateR: ['crate', 'crateR'], crateB: ['crate', 'crateB'],
};
function mkMat([c, r, m, e, ei]) { const o = { color: c, roughness: r, metalness: m }; if (e) { o.emissive = e; o.emissiveIntensity = ei; } return prep(new THREE.MeshStandardMaterial(o), 'lamp'); }

const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const ROT90 = new THREE.Matrix4().makeRotationY(Math.PI / 2);

// slots between same-road neighbours of the urban styles. Gap frame (per slot): origin at the middle of the mouth (street-facing
// line), x across the slot, y up, z out toward the street (depth into the slot = −z). The two walls: xP = sd·g0/2 (constant) and
// xQ(t) = −sd·(g(t) − g0/2) (the neighbour may sit at a slight angle on curved roads, so its wall is linear in depth).
export function findGaps(parcels) {
  const U0 = parcels.filter((p) => !p.far && URBAN.has(p.style)); const out = []; const seen = new Set();
  const cell = new Map(); const K = 48; const ck = (x, z) => Math.floor(x / K) + ',' + Math.floor(z / K);
  for (const p of U0) { const k = ck(p.x, p.z); let l = cell.get(k); if (!l) cell.set(k, l = []); l.push(p); }
  for (const p of U0) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang); const cx = Math.floor(p.x / K), cz = Math.floor(p.z / K);
    for (const sd of [1, -1]) { let best = null;
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) for (const q of cell.get(ix + ',' + iz) || []) {
        if (q === p || Math.abs(angWrap(q.ang - p.ang)) > 0.35) continue;
        const qc = Math.cos(q.ang), qs = Math.sin(q.ang); const C = [];
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const lx = a * q.d / 2, lz = b * q.w / 2; const x = q.x + qc * lx - qs * lz, z = q.z + qs * lx + qc * lz; const dx = x - p.x, dz = z - p.z; C.push({ u: dx * c + dz * s, v: sd * (-dx * s + dz * c) }); }
        if (C.some((k) => k.v < p.w / 2 - 0.3)) continue;
        C.sort((m, n) => m.v - n.v); const nr = [C[0], C[1]].sort((m, n) => n.u - m.u); const f = nr[0], b = nr[1];
        if (Math.abs(f.u - p.d / 2) > 2.5) continue; const g0 = f.v - p.w / 2; if (g0 < 0.06 || g0 > GMAX) continue;
        if (!best || g0 < best.g0) best = { q, g0, g1: b.v - p.w / 2, uf: f.u, ub: b.u };
      }
      if (!best) continue; const key = Math.min(p.seed, best.q.seed) + ':' + Math.max(p.seed, best.q.seed); if (seen.has(key)) continue; seen.add(key);
      const uM = Math.min(p.d / 2, best.uf), uB = Math.max(-p.d / 2, best.ub); const D = uM - uB; if (D < 3) continue;
      const span = Math.max(0.5, best.uf - best.ub); const slope = (best.g1 - best.g0) / span;
      const GM = new THREE.Matrix4().makeRotationY(-p.ang).setPosition(p.x, 0, p.z).multiply(new THREE.Matrix4().makeTranslation(uM, 0, sd * (p.w / 2 + best.g0 / 2))).multiply(ROT90);
      out.push({ id: out.length, p, q: best.q, sd, g0: best.g0, slope, D, GM, seed: ((p.seed ^ (best.q.seed * 31)) >>> 0) ^ 0x9a9a, narrow: best.g0 < NARROW, key: Math.floor(p.x / CH) + ',' + Math.floor(p.z / CH) });
    }
  }
  return out;
}

export class ParcelGapLayer {
  constructor(scene, mats, city) {
    this.city = city; this.stream = city.stream; this.group = new THREE.Group(); this.group.name = 'parcelgap'; scene.add(this.group);
    this.M = {}; for (const k in MDEF) this.M[k] = mkMat(MDEF[k]);
    this.kinds = new Map(); this.hmin = new Map(); this.last = null; this.frame = 0; this.dirty = false;
    const G = geos(); this.triOf = {}; for (const k in KINDS) this.triOf[k] = G[KINDS[k][0]].attributes.position.count / 3;
    this.gaps = findGaps(city.parcels || []);
    this.stats = { gaps: this.gaps.length, narrow: 0, wide: 0, baffled: 0, colliders: 0, planned: 0, packed: 0, tris: 0, inst: 0 };
    this.byChunk = new Map(); for (const g of this.gaps) { let l = this.byChunk.get(g.key); if (!l) this.byChunk.set(g.key, l = []); l.push(g); }
    this.exactFootprints();
    for (const g of this.gaps) withSeed(g.seed, () => this.layout(g));
    if (this.stream) { const prev = this.stream.onParcel; this.stream.onParcel = (c, p, m) => { this.peek(p); if (prev) prev(c, p, m); this.dirty = true; }; }
  }
  // city.js obbCollider approximates a parcel by AABB slices; for near-axis lots the single AABB is inflated by up to ~1 m per
  // side (sin(ang)·half-width), which sealed most walkable slots, and rotated lots get inset slices. The parcels that border a slot
  // get their exact footprint instead (one oriented box, same height / tag; resolve + raycast support it) — geometry untouched.
  exactFootprints() {
    const col = this.city.col; if (!col || !col.addOBB || !col.remove) return; const ps = new Set(); for (const g of this.gaps) { ps.add(g.p); ps.add(g.q); }
    let n = 0, rm = 0;
    for (const p of ps) { const c = Math.cos(p.ang), s = Math.sin(p.ang); const inP = (x, z) => { const dx = x - p.x, dz = z - p.z; return Math.abs(dx * c + dz * s) <= p.d / 2 + 0.3 && Math.abs(-dx * s + dz * c) <= p.w / 2 + 0.3; };
      const r = Math.hypot(p.d, p.w) / 2 + 2; const own = col.query(p.x, p.z, r, []).filter((b) => b.tag === 'bld' && !b.o && inP((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2));
      if (!own.length) continue; for (const b of own) col.remove(b); rm += own.length; col.addOBB(p.x, p.z, c, s, p.d / 2, p.w / 2, p.h, 'bld'); n++; }
    this.stats.exact = n; this.stats.exactRemoved = rm;
  }
  // lowest roof deck the parcel's generator just logged (read only; roofs.js consumes the log right after) -> wall-height cap
  peek(p) { if (this.hmin.has(p.seed)) return; let y = 1e9; for (const r of ROOF_LOG) if (r.st) y = Math.min(y, r.y - 0.25); this.hmin.set(p.seed, y < 1e8 ? y : Math.min(p.h, 12)); }
  gw(g, t) { return Math.max(0.06, g.g0 + g.slope * t); }            // slot width at depth t
  xc(g, t) { return -g.sd * (this.gw(g, t) - g.g0) / 2; }              // slot centre (gap-frame x) at depth t
  wall(g, t, side) { return side > 0 ? g.sd * g.g0 / 2 : -g.sd * (this.gw(g, t) - g.g0 / 2); } // side +1: wall of p, −1: wall of q
  toW(g, x, z) { _p.set(x, 0, z).applyMatrix4(g.GM); return [_p.x, _p.z]; }
  // thin collider across the slot (gap frame: centre x, depth t, half length hl along x, half thickness hw along z)
  obb(g, x, t, hl, hw, h) { const [cx, cz] = this.toW(g, x, -t); const e = g.GM.elements; const ux = e[0], uz = e[2]; this.city.col.addOBB(cx, cz, ux, uz, hl, hw, h, 'gap'); this.stats.colliders++; }
  // ---- startup: layout decisions + colliders (deterministic per slot)
  layout(g) {
    const L = g.L = {};
    if (g.narrow) { this.stats.narrow++;
      L.type = g.g0 < 0.4 ? 'plate' : pick(['shutter', 'shutter', 'gate', 'gate', 'fence']);
      L.t1 = Math.min(Math.max(g.D * 0.3, 2.2), 5, g.D - 0.6);
      this.obb(g, this.xc(g, 0), 0.08, (g.g0 + 2.0) / 2, 0.15, 3.5);                                   // mouth
      this.obb(g, this.xc(g, g.D - 0.1), g.D - 0.1, (this.gw(g, g.D) + 2.0) / 2, 0.15, 3.5);           // back end
    } else { this.stats.wide++;
      L.type = pick(['open', 'open', 'up', 'up', 'none']);
      if (g.D >= 7.5) { this.stats.baffled++; L.t1 = Math.min(Math.max(g.D * 0.4, 3.5), 7); L.t2 = L.t1 + 1.3; L.sA = rng() < 0.5 ? 1 : -1; L.ow = this.gw(g, L.t1) < 1.75 ? 0.85 : 0.9;
        for (const [t, side] of [[L.t1, L.sA], [L.t2, -L.sA]]) { const w0 = this.wall(g, t, side), w1 = this.wall(g, t, -side); const dir = Math.sign(w1 - w0); const a = w0 - dir * 0.3, b = w1 - dir * L.ow;
          L['b' + t] = [a, b]; this.obb(g, (a + b) / 2, t, Math.abs(b - a) / 2, 0.08, 4); } }
      const lim = L.t1 ? L.t1 - 1.2 : g.D - 1; const gm = Math.min(this.gw(g, 1), this.gw(g, lim));
      if (gm >= 2.0 && lim > 2.2) { const side = L.sA || (rng() < 0.5 ? 1 : -1); /* on the baffle-1 wall: the opening (and the way through) is on the other side */ const t0 = rand(0.9, Math.max(1.0, lim - 1.4)), t1 = Math.min(lim, t0 + rand(0.9, 1.6)); const tm = (t0 + t1) / 2;
        const w = this.wall(g, tm, side); const dir = Math.sign(this.wall(g, tm, -side) - w); L.cl = { side, t0, t1, w, dir, dep: 0.5 };
        this.obb(g, w + dir * 0.25, tm, 0.25 + 0.05, (t1 - t0) / 2, 1.3); } // collider is rotated: across = 0.3 half, along depth = half span
    }
    // mouth heap in front of the closure (on the setback strip), small collider
    if (rng() < 0.55) { const gw = g.g0; const side = rng() < 0.5 ? 1 : -1; const x = g.narrow ? this.xc(g, 0) + rand(-0.2, 0.2) * gw : this.wall(g, 0, side) + side * g.sd * rand(0.35, 0.9);
      L.heap = { x, z: 0.42, r: Math.min(0.45, Math.max(0.3, gw * 0.4)) }; this.obb(g, x, -0.42, L.heap.r, 0.32, 1.0); }
  }
  // ---- visual plan (lazy: once both neighbours have reported their roof height)
  plan(g) {
    const hp = this.hmin.get(g.p.seed), hq = this.hmin.get(g.q.seed); if (hp === undefined || hq === undefined) return null;
    const H = Math.max(3.4, Math.min(hp, hq, 40, g.p.style === 'condo' || g.q.style === 'condo' ? 5.0 : 99)); /* condo slabs sit back 2.5 m above a 5 m podium */ const L = g.L; const D = g.D; const inst = {}; let tris = 0; this.stats.planned++;
    const push = (k, mat) => { _w.multiplyMatrices(g.GM, mat); (inst[k] || (inst[k] = [])).push(..._w.elements); tris += this.triOf[k]; };
    const P = (k, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => { _e.set(0, ry, 0); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z); push(k, _m.compose(_p, _q, _s)); };
    const seg = (k, a, b, w, h = w) => { _a.set(...a); _b.set(...b); const len = _a.distanceTo(_b); if (len < 0.01) return; _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); _s.set(w, len, h); _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); push(k, _m.compose(_p, _q, _s)); };
    const tEnd = g.narrow ? L.t1 : D; const g0 = g.g0; const x0 = this.xc(g, 0);
    // floor (wet, dark) over the dressed depth
    P('floor', this.xc(g, tEnd / 2), 0.03, -tEnd / 2, Math.max(this.gw(g, 0), this.gw(g, tEnd)) + 0.1, 0.05, tEnd);
    // ---- closure at the mouth
    const hc = L.type === 'shutter' ? 2.9 : L.type === 'gate' ? 2.4 : 2.5;
    if (L.type === 'plate') { P('steel', x0, 1.9, -0.05, g0 + 0.24, 3.8, 0.05); for (let y = 0.4; y < 3.7; y += 0.9) P('steel', x0, y, -0.02, g0 + 0.26, 0.05, 0.02); }
    else if (L.type === 'shutter') { P(rng() < 0.35 ? 'shutterR' : 'shutter', x0, 0, -0.1, g0, hc, 1); P('steel', x0, hc + 0.22, -0.16, g0 + 0.12, 0.44, 0.42);
      for (const s of [1, -1]) P('steel', x0 + s * (g0 / 2 - 0.02), hc / 2, -0.1, 0.05, hc, 0.08); }
    else if (L.type === 'gate') { P('gate', x0, 0, -0.06, g0, hc, 1); P('steel', x0, hc + 0.05, -0.06, g0 + 0.1, 0.08, 0.1); P('jbox', x0 + g0 * 0.3, 1.05, -0.02, 0.18, 0.18, 0.4); } // + padlock
    else if (L.type === 'fence') { P('fence', x0, 0, -0.05, g0, hc, 1); for (const s of [1, -1]) seg('post', [x0 + s * (g0 / 2 - 0.03), 0, -0.05], [x0 + s * (g0 / 2 - 0.03), hc + 0.3, -0.05], 0.03);
      seg('post', [x0 - g0 / 2, hc, -0.05], [x0 + g0 / 2, hc, -0.05], 0.022); P('razor', x0, hc + 0.18, -0.05, g0, 1, 1); }
    else if (L.type === 'open') { for (const side of [1, -1]) { const w = this.wall(g, 0.6, side); const dir = Math.sign(this.wall(g, 0.6, -side) - w); P('gate', w + dir * 0.06, 0, -g0 / 4 - 0.15, g0 / 2, 2.4, 1, Math.PI / 2); } }
    else if (L.type === 'up') { P('steel', x0, 3.2, -0.16, g0 + 0.12, 0.5, 0.45); for (const s of [1, -1]) P('steel', x0 + s * (g0 / 2 - 0.02), 1.5, -0.1, 0.05, 3.0, 0.08); }
    if (L.type !== 'plate' && L.type !== 'none' && rng() < 0.75) P('bulb', x0 + rand(-0.2, 0.2) * g0, Math.min(H - 0.3, hc + 0.7), -0.25); // lamp under the lintel, facing out
    // ---- back panel (narrow) / staggered baffles (wide)
    if (g.narrow) { const t = L.t1; P('back', this.xc(g, t), H / 2, -t, this.gw(g, t) + 0.6, H, 0.12); }
    else if (L.t1) for (const t of [L.t1, L.t2]) { const [a, b] = L['b' + t]; P('back', (a + b) / 2, H / 2, -t, Math.abs(b - a), H, 0.14);
      P('steel', b, H / 2, -t, 0.08, H, 0.2); } // steel edge on the opening
    // ---- pipes / conduits / cable drops up the walls
    const hp2 = Math.min(H - 0.2, 16); const tP = Math.max(0.6, tEnd - 0.3);
    for (let i = 0, n = randi(1, g0 < 0.5 ? 2 : 3); i < n; i++) { const side = rng() < 0.5 ? 1 : -1; const t = rand(0.35, tP); const r = g0 < 0.5 ? rand(0.035, 0.06) : rand(0.05, 0.11); const w = this.wall(g, t, side); const dir = Math.sign(this.wall(g, t, -side) - w);
      const x = w + dir * (r + 0.02); const top = rand(Math.min(5, hp2), hp2); const k = pick(['pipeGrey', 'pipeRust', 'pipeBlack']);
      seg(k, [x, 0.05, -t], [x, top, -t], r); seg(k, [x, top, -t], [w, top + 0.25, -t], r); for (let y = 1.2; y < top; y += rand(1.8, 2.6)) P('steel', x, y, -t, r * 2 + 0.08, 0.05, 0.05); }
    for (let i = 0, n = randi(1, 2); i < n; i++) { const side = rng() < 0.5 ? 1 : -1; const t = rand(0.3, Math.min(tP, 3)); const w = this.wall(g, t, side); const dir = Math.sign(this.wall(g, t, -side) - w);
      for (let j = 0; j < randi(1, 3); j++) { const x = w + dir * (0.03 + j * 0.035); seg('pipeBlack', [x, 0.6, -t - j * 0.03], [x, hp2, -t - j * 0.03], 0.016); }
      if (g0 > 0.5 || rng() < 0.5) P('jbox', w, rand(1.2, 1.8), -t + 0.12, 1, 1, 1, dir * Math.PI / 2); }
    // ---- cable bundles across the slot (near the mouth and deeper)
    for (let i = 0, n = randi(1, g0 < 0.6 ? 2 : 3); i < n; i++) { const t = i === 0 ? rand(0.15, 0.6) : rand(0.6, Math.min(tEnd, 7)); const y = rand(Math.min(4.2, H - 0.6), Math.min(H - 0.4, 10)); const sp = this.gw(g, t) + 0.1;
      P('cable', this.xc(g, t), y, -t, sp, Math.max(0.12, sp * 0.18) / 0.5, 1); }
    // ---- small light box hung at the mouth, facing the street
    if (g0 >= 0.6 && rng() < 0.7) { const wb = Math.min(g0 - 0.2, rand(0.8, 1.4)), hb = rand(0.42, 0.7); const y = Math.min(H - 0.6, rand(3.5, 4.8)) - (L.type === 'shutter' ? 0 : 0.3); const z = -0.22;
      const kc = pick(['lbC', 'lbM', 'lbA']); P('lbBody', x0, y, z, wb, hb, 0.16); P(kc, x0, y, z + 0.085, wb * 0.9, hb * 0.8, 0.01);
      const nch = randi(2, 3); for (let j = 0; j < nch; j++) { const cx = x0 - wb * 0.3 + j * wb * 0.6 / Math.max(1, nch - 1); P('lbBody', cx, y, z + 0.092, wb * 0.05, hb * 0.5, 0.005); P('lbBody', cx, y + hb * 0.05, z + 0.093, wb * 0.18, hb * 0.05, 0.005); }
      for (const s of [-0.4, 0.4]) seg('pipeBlack', [x0 + s * wb, y + hb / 2, z], [x0 + s * wb, y + hb / 2 + 0.55, z - 0.05], 0.008);
      P('cable', x0, y + hb / 2 + 0.6, z - 0.05, g0 + 0.1, 0.2 / 0.5, 1); }
    // ---- clutter against one wall (wide) and the heap in front of the closure
    const heap = (x, z, r, along) => { const n = randi(2, 4); for (let i = 0; i < n; i++) { const a = rand(-r, r) * 0.8; const bx = along ? x : x + a, bz = along ? z + a : z; const k = rng();
      if (k < 0.4) P(rng() < 0.6 ? 'bagK' : 'bagB', bx, 0.02, bz, rand(0.8, 1.15), rand(0.8, 1.1), rand(0.8, 1.15), rand(0, 6.28));
      else if (k < 0.7) { const h = rand(0.3, 0.55); const s = rand(0.35, 0.55); P('boxA', bx, 0.02 + h / 2, bz, s, h, s * rand(0.8, 1.2), rand(-0.3, 0.3)); if (rng() < 0.4) P('boxA', bx, 0.02 + h + 0.18, bz, s * 0.8, 0.36, s * 0.75, rand(-0.4, 0.4)); }
      else { const kc = rng() < 0.5 ? 'crateR' : 'crateB'; const st = randi(1, 3); const ry = along ? Math.PI / 2 : 0; for (let j = 0; j < st; j++) P(kc, bx, 0.02 + j * 0.32, bz, 1, 1, 1, ry + rand(-0.06, 0.06)); } } };
    if (L.heap) heap(L.heap.x, L.heap.z, L.heap.r, false);
    if (L.cl) { const c = L.cl; for (let t = c.t0; t < c.t1 - 0.3; t += 0.6) heap(c.w + c.dir * 0.27, -t - 0.25, 0.22, true); }
    // ---- wall lamp inside wide slots
    if (!g.narrow && rng() < 0.7) { const t = rand(1.0, Math.max(1.1, (L.t1 || D) - 0.6)); const side = rng() < 0.5 ? 1 : -1; const w = this.wall(g, t, side); const dir = Math.sign(this.wall(g, t, -side) - w);
      P('bulb', w, 2.7, -t, 1, 1, 1, dir * Math.PI / 2); }
    return { inst, tris };
  }
  // ---- packing (nearest slots of the near-loaded chunks, under the triangle budget)
  ensure(k, n) {
    let im = this.kinds.get(k); if (im && im.instanceMatrix.count >= n) return im;
    const cap = Math.max(32, 1 << Math.ceil(Math.log2(Math.max(1, n)))); const [gk, mk] = KINDS[k];
    if (im) { this.group.remove(im); im.dispose(); }
    im = new THREE.InstancedMesh(geos()[gk], this.M[mk], cap); im.count = 0; im.castShadow = false; im.receiveShadow = true; im.name = 'gap|' + k; im.visible = false; im.frustumCulled = false;
    this.group.add(im); this.kinds.set(k, im); return im;
  }
  repack(cam) {
    const p = cam.position; const st = this.stream; const cand = [];
    for (const [key, list] of this.byChunk) { const c = st && st.chunks.get(key); if (!c || !c.near) { for (const g of list) if (g.vis && g.vis.drop !== false) g.vis = null; continue; } // chunk dropped: release
      for (const g of list) { const [x, z] = this.toW(g, 0, -g.D / 2); const d = Math.hypot(x - p.x, z - p.z) + Math.max(0, p.y - 25) * 0.6; if (d < RMAX) cand.push([d, g]); } }
    cand.sort((a, b) => a[0] - b[0]);
    const take = new Map(); let tris = 0, n = 0;
    for (const [, g] of cand) { if (!g.vis) g.vis = withSeed((g.seed ^ 0x5151) >>> 0, () => this.plan(g)); const v = g.vis; if (!v) continue; if (tris + v.tris > BUDGET) continue; tris += v.tris; n++;
      for (const k in v.inst) { let l = take.get(k); if (!l) take.set(k, l = []); l.push(v.inst[k]); } }
    for (const [k, im] of this.kinds) if (!take.has(k)) { im.count = 0; im.visible = false; }
    for (const [k, l] of take) { const tot = l.reduce((s, a) => s + a.length / 16, 0); const im = this.ensure(k, tot); const arr = im.instanceMatrix.array; let o = 0;
      for (const a of l) { arr.set(a, o * 16); o += a.length / 16; } im.count = tot; im.visible = tot > 0; im.instanceMatrix.needsUpdate = true; }
    this.stats.packed = n; this.stats.tris = tris; this.stats.inst = [...this.kinds.values()].reduce((s, im) => s + im.count, 0);
  }
  sync(cam) {
    if (!cam) return; this.frame++;
    const nt = U.uNight.value; const li = 0.25 + nt * 2.4; this.M.lbC.emissiveIntensity = li; this.M.lbM.emissiveIntensity = li; this.M.lbA.emissiveIntensity = li; this.M.bulb.emissiveIntensity = 0.3 + nt * 2.2;
    const p = cam.position; const L = this.last; const st = this.stream; let on = 0;
    if (st) for (const key of this.byChunk.keys()) { const c = st.chunks.get(key); if (c && c.near) on++; }
    const moved = !L || Math.hypot(p.x - L.x, p.z - L.z) > 10 || Math.abs(p.y - L.y) > 8;
    if (this.dirty || on !== (L && L.on) || (moved && this.frame - (L ? L.f : -99) > 8)) { this.dirty = false; this.repack(cam); this.last = { x: p.x, y: p.y, z: p.z, on, f: this.frame }; }
  }
  tris() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n += im.geometry.attributes.position.count / 3 * im.count; return Math.round(n); }
  calls() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n++; return n; }
  depthOf(g, x, z) { _m.copy(g.GM).invert(); _p.set(x, 0, z).applyMatrix4(_m); return { t: -_p.z, x: _p.x }; } // gap-frame depth / across of a world point
  // test helpers (world coords): stand-off point on the street side, inward yaw, walk path for wide slots
  probe(g) {
    const L = g.L; const pt = (x, t) => { const w = this.toW(g, x, -t); w.push(+t.toFixed(2), +x.toFixed(2)); return w; }; const out = pt(this.xc(g, 0), -0.7); const inn = pt(this.xc(g, 0), 1.0); const yaw = Math.atan2(inn[0] - out[0], inn[1] - out[1]);
    const path = [pt(this.xc(g, 0), 0.6)];
    if (!g.narrow && L.t1) for (const t of [L.t1, L.t2]) { const [, b] = L['b' + t]; const side = t === L.t1 ? L.sA : -L.sA; const wo = this.wall(g, t, -side); const xm = (b + wo) / 2;
      path.push(pt(xm, t - 0.55), pt(xm, t + 0.55)); }
    path.push(pt(this.xc(g, g.D - 0.6), g.D - 0.6));
    return { id: g.id, g0: +g.g0.toFixed(2), D: +g.D.toFixed(1), narrow: g.narrow, type: L.type, out, yaw, path, deep: pt(this.xc(g, 0), Math.min(2.0, g.D - 0.5)), side: pt(this.wall(g, 0, 1) + g.sd * 1.2, -0.6), heap: !!L.heap };
  }
}
