// r6.4 b_storefront (Hark modelling lane, 2026-11-22): ground-floor shops on the street face of 霓港's streamed parcels (B map).
// arch.js shopStreet already lays the bays (aluminium storefront, roll shutter / awning, signboards, stickers, condensers) and the
// facade shader paints a parallax shop room behind the glass. What the bays lacked was *which shop it is*. Each open bay now gets
// one of 9 original shop types, mixed per bay so a frontage never repeats one look:
//   拉面馆 ramen · 茶餐厅/糖水 tea & dessert · 便利店 convenience · 维修铺 phone repair · 药房 pharmacy · 五金 hardware ·
//   洗衣 laundry · 理发 barber · 义体诊所 cyber clinic
// Per shop: a lit 门头 light box over the door in the transom (cnFace shop-name cell from the offline glyph atlas: invented names,
// no real brands), a window display card in front of the parallax room (lit panel + dark strokes: menu board, fridge doors, phone
// screens on a pegboard, washer portholes, mirror seats…), a door curtain (cloth noren split panels or PVC strip curtain), price
// stickers on the glass, and per type the outside clutter — moulded plastic stools + folding table, drink crates + ice chest,
// steel rack with buckets + leaning ladder, a glass parts counter, red lanterns, a green pharmacy cross on a bracket, a barber pole.
// Bays without a shutter get one ~45 % of the time: half-pulled (a shop closing / not open yet) or rolled up into its housing.
// Bays whose existing shutter is fully down stay closed and undressed.
// Where the bays come from: arch.js shopStreet logs every bay of a streamed parcel (SHOP_LOG, no rng use) including the door side
// and the sidewalk clutter span kit.js storefront() chose; stream.js Stream.onParcel (b_rooftop hook, chained) hands each parcel
// over right after its near detail is built, and the plan is cached per parcel (a reloaded chunk gets the same shops).
// Rendering: one InstancedMesh per (unit geometry, material) for the whole map, repacked from the shops of the near-loaded chunks
// nearest the camera under a triangle budget; materials are MeshStandardMaterial prepped 'lamp' (the instanced street-light
// program, as alley.js / roofs.js / parcelgap.js) -> no new shader program; lit faces brighten with uNight through their
// emissiveIntensity uniform. The shop-name faces are one small merged World (existing 'cnsign' material), rebuilt only when the
// packed shop set changes. Nothing casts shadows. Outside clutter gets one small collider per shop (≤ 1.35 m from the facade, so the
// sidewalk stays clear); building colliders are untouched.
import * as THREE from 'three';
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';
import { World } from '../../geo.js';
import { SHOP_LOG } from './arch.js';
import { cnFace } from './street2.js';

const CH = 160, RMAX = 120, BUDGET = 15000; // layer triangles (the frame draws the layer ~3x: main + extra scene passes)
// shop types: [id, sign cells (street2.js SIGN_TXT), weight]
export const TYPES = [['ramen', [16, 0], 1.2], ['tea', [21, 7, 11], 1.0], ['conv', [6, 10], 1.2], ['repair', [18, 9, 2, 8], 1.1], ['pharm', [3], 0.8],
  ['hard', [4, 15], 0.8], ['laundry', [13], 0.7], ['barber', [5], 0.6], ['clinic', [22, 23], 0.7]];
const TW = TYPES.reduce((s, t) => s + t[2], 0);
function pickType() { let r = rng() * TW; for (const t of TYPES) { r -= t[2]; if (r <= 0) return t; } return TYPES[0]; }

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
let GEO = null;
function geos() {
  if (GEO) return GEO; const G = {};
  G.box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  // roll-shutter curtain: unit width x ∈ [−.5, .5], height y ∈ [0, 1], plane z ≈ 0: panel + 6 ribs + bottom bar
  { const P = [BX(-0.5, 0, -0.012, 0.5, 1, 0.012)]; for (let i = 1; i <= 6; i++) { const y = i / 7; P.push(BX(-0.5, y - 0.012, 0.012, 0.5, y + 0.012, 0.03)); }
    P.push(BX(-0.5, 0, -0.03, 0.5, 0.03, 0.04)); G.shutter = merge(P); }
  // moulded plastic stool (~0.44 m): tapered seat + 4 splayed legs + stretcher
  { const s = new THREE.CylinderGeometry(0.15, 0.13, 0.035, 8); s.translate(0, 0.43, 0); const P = [s];
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const c = Math.cos(a), n = Math.sin(a); P.push(BAR([c * 0.1, 0.42, n * 0.1], [c * 0.16, 0.0, n * 0.16], 0.035, 0.022)); }
    P.push(BX(-0.13, 0.13, -0.008, 0.13, 0.15, 0.008), BX(-0.008, 0.13, -0.13, 0.008, 0.15, 0.13)); G.stool = merge(P); }
  // folding table 0.8 × 0.6 × 0.72
  G.table = merge([BX(-0.4, 0.69, -0.3, 0.4, 0.72, 0.3), BAR([-0.34, 0.69, -0.25], [0.34, 0.0, 0.25], 0.03, 0.02), BAR([-0.34, 0.69, 0.25], [0.34, 0.0, -0.25], 0.03, 0.02), BAR([0.34, 0.69, -0.25], [-0.34, 0.0, 0.25], 0.03, 0.02), BAR([0.34, 0.69, 0.25], [-0.34, 0.0, -0.25], 0.03, 0.02)]);
  // noren: 4 cloth panels hanging from a rod, unit width, y ∈ [−1, 0]
  { const P = [BX(-0.52, -0.02, -0.015, 0.52, 0.02, 0.015)]; for (let i = 0; i < 4; i++) { const x0 = -0.5 + i * 0.25 + 0.006; P.push(BX(x0, -1, -0.006 + (i % 2) * 0.008, x0 + 0.238, -0.02, 0.006 + (i % 2) * 0.008)); } G.noren = merge(P); }
  // PVC strip curtain: 7 overlapping strips, unit width, y ∈ [−1, 0]
  { const P = [BX(-0.52, -0.03, -0.02, 0.52, 0.03, 0.02)]; for (let i = 0; i < 7; i++) { const x = -0.5 + (i + 0.5) / 7; P.push(BX(x - 0.085, -1, (i % 2 ? 0.006 : -0.006) - 0.002, x + 0.085, -0.03, (i % 2 ? 0.006 : -0.006) + 0.002)); } G.strip = merge(P); }
  // paper lantern (unit ~1 m tall: scaled), body + top / bottom caps
  { const s = new THREE.SphereGeometry(0.5, 8, 5); s.scale(1, 1.15, 1); G.lantern = merge([s]); G.cap = merge([new THREE.CylinderGeometry(0.28, 0.28, 0.1, 6)]); }
  // steel rack 1 × 1.6 × 0.45: 4 posts + 4 shelves
  { const P = []; for (const x of [-0.48, 0.48]) for (const z of [-0.2, 0.2]) P.push(BX(x - 0.02, 0, z - 0.02, x + 0.02, 1.6, z + 0.02));
    for (const y of [0.12, 0.6, 1.08, 1.56]) P.push(BX(-0.5, y, -0.22, 0.5, y + 0.025, 0.22)); G.rack = merge(P); }
  G.cyl = merge([new THREE.CylinderGeometry(0.5, 0.42, 1, 8)]);                       // bucket / bin, y centred
  G.pole = merge([new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true)]);              // barber pole glass, y centred
  { const r = new THREE.CylinderGeometry(0.52, 0.52, 0.12, 8, 1, true); r.rotateZ(0.32); G.band = merge([r]); } // tilted stripe ring
  { const t = new THREE.TorusGeometry(0.5, 0.09, 4, 10); G.ring = merge([t]); }      // washer porthole rim (in the xy plane)
  G.disc = merge([new THREE.CylinderGeometry(0.42, 0.42, 0.02, 10).rotateX(Math.PI / 2)]);
  G.cross = merge([BX(-0.5, -0.17, -0.5, 0.5, 0.17, 0.5), BX(-0.17, -0.5, -0.5, 0.17, 0.5, 0.5)]); // unit plus, depth 1 (scaled)
  // drink crate 0.4 × 0.28 × 0.3 open top
  G.crate = merge([BX(-0.2, 0, -0.15, 0.2, 0.025, 0.15), BX(-0.2, 0, -0.15, 0.2, 0.28, -0.13), BX(-0.2, 0, 0.13, 0.2, 0.28, 0.15), BX(-0.2, 0, -0.13, -0.18, 0.28, 0.13), BX(0.18, 0, -0.13, 0.2, 0.28, 0.13),
    BX(-0.17, 0.025, -0.11, -0.05, 0.24, 0.0), BX(-0.03, 0.025, -0.11, 0.09, 0.24, 0.0), BX(0.05, 0.025, 0.02, 0.17, 0.24, 0.12)]);   // + bottles as blocks
  return (GEO = G);
}

// ------------------------------------------------------------------ materials ----
// [colour, roughness, metalness, emissive?, glow group?] — all prepped 'lamp' (shared instanced program; no maps / vertex colours)
const MDEF = {
  frame: [0x15161a, 0.6, 0.4], lbBody: [0x0d0e10, 0.6, 0.3], ink: [0x0b0b0d, 0.85, 0.0], board: [0x23262b, 0.8, 0.1], steel: [0x3a3d42, 0.55, 0.6],
  shutter: [0x6c737a, 0.5, 0.6], shutterR: [0x5f4433, 0.75, 0.4], wood: [0x6a4a30, 0.8, 0.0],
  litW: [0x2a2620, 0.5, 0.0, 0xfff0d2, 'lit'], litC: [0x202a2e, 0.5, 0.0, 0xe2f4ff, 'lit'], litY: [0x2a2410, 0.5, 0.0, 0xffd45a, 'lit'], litG: [0x0a2a14, 0.5, 0.0, 0x34ff74, 'lit'],
  litM: [0x2a0a20, 0.5, 0.0, 0xff3ab0, 'lit'], litCy: [0x0a2228, 0.5, 0.0, 0x38eeff, 'lit'], scr: [0x061418, 0.3, 0.0, 0x46e8ff, 'lit'],
  lantern: [0x3a0a08, 0.6, 0.0, 0xff3420, 'lamp'], poleW: [0x505050, 0.2, 0.0, 0xffffff, 'lamp'], bandR: [0x900000, 0.5, 0.0, 0xff1e1e, 'lamp'], bandB: [0x101060, 0.5, 0.0, 0x3040ff, 'lamp'],
  stkY: [0xd8b818, 0.7, 0.0, 0xffe040, 'stk'], stkR: [0xc81c1c, 0.7, 0.0, 0xff3030, 'stk'],
  norenR: [0x8a1418, 0.9, 0.0], norenI: [0x1a2a55, 0.9, 0.0], norenW: [0xd8d2c0, 0.9, 0.0], strip: [0x9fb4b8, 0.22, 0.0],
  stoolR: [0xc0222a, 0.5, 0.0], stoolB: [0x1f5fb0, 0.5, 0.0], stoolG: [0x2a8a4a, 0.5, 0.0], crateR: [0xb51e22, 0.5, 0.0], crateB: [0x1f58a8, 0.5, 0.0],
  chest: [0xdfe3e6, 0.4, 0.0], bucketO: [0xd08a20, 0.6, 0.0], bucketB: [0x2a6ab0, 0.6, 0.0], glass: [0x1d2a30, 0.08, 0.3],
};
const GLOW = { lit: [0.35, 1.7], lamp: [0.4, 2.4], stk: [0.06, 0.45] }; // emissiveIntensity = a + uNight * b
const KINDS = {}; // kind -> [geometry, material]
for (const m in MDEF) KINDS[m] = ['box', m];
Object.assign(KINDS, { shutter: ['shutter', 'shutter'], shutterR: ['shutter', 'shutterR'], stoolR: ['stool', 'stoolR'], stoolB: ['stool', 'stoolB'], stoolG: ['stool', 'stoolG'],
  table: ['table', 'steel'], tableW: ['table', 'wood'], norenR: ['noren', 'norenR'], norenI: ['noren', 'norenI'], norenW: ['noren', 'norenW'], strip: ['strip', 'strip'],
  lantern: ['lantern', 'lantern'], lcap: ['cap', 'frame'], rack: ['rack', 'steel'], bucketO: ['cyl', 'bucketO'], bucketB: ['cyl', 'bucketB'], pole: ['pole', 'poleW'], bandR: ['band', 'bandR'],
  bandB: ['band', 'bandB'], ring: ['ring', 'steel'], disc: ['disc', 'glass'], crossG: ['cross', 'litG'], crateR: ['crate', 'crateR'], crateB: ['crate', 'crateB'] });
function mkMat([c, r, m, e]) { const o = { color: c, roughness: r, metalness: m }; if (e) { o.emissive = e; o.emissiveIntensity = 1; } return prep(new THREE.MeshStandardMaterial(o), 'lamp'); }

const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const BAYB = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)); // bay frame (x along the facade, z out) -> parcel frame

export class StorefrontLayer {
  constructor(scene, mats, city) {
    this.mats = mats; this.city = city; this.stream = city.stream; this.group = new THREE.Group(); this.group.name = 'storefront'; scene.add(this.group);
    this.M = {}; for (const k in MDEF) this.M[k] = mkMat(MDEF[k]);
    this.kinds = new Map(); this.chunks = new Map(); this.cache = new WeakMap(); this.world = []; this.uKey = ''; this.last = null; this.frame = 0; this.dirty = false;
    const G = geos(); this.triOf = {}; for (const k in KINDS) this.triOf[k] = G[KINDS[k][0]].attributes.position.count / 3;
    this.stats = { parcels: 0, bays: 0, shops: 0, closed: 0, narrow: 0, types: {}, shutterHalf: 0, shutterUp: 0, colliders: 0, packed: 0, tris: 0, inst: 0, faces: 0 };
    for (const t of TYPES) this.stats.types[t[0]] = 0;
    SHOP_LOG.length = 0; // nothing from before the layer existed belongs to a streamed parcel we will see again
    if (this.stream) { const prev = this.stream.onParcel; this.stream.onParcel = (c, p, m) => { this.onParcel(c, p, m); if (prev) prev(c, p, m); }; }
  }
  // stream.js, right after a parcel's near detail was generated: the bays it logged belong to this parcel (parcel frame, matrix m)
  onParcel(c, p, m) {
    const recs = SHOP_LOG.splice(0);
    let ch = this.chunks.get(c.key); if (ch && ch.parcels.has(p)) return; // planned before (chunk reloaded): keep the cached shops
    let shops = this.cache.get(p);
    if (!shops) { shops = []; this.stats.parcels++;
      recs.forEach((r, i) => { this.stats.bays++; const s = withSeed(((p.seed ^ 0x5f0f7e11) + i * 7919) >>> 0, () => this.plan(r, m)); if (s) shops.push(s); });
      this.cache.set(p, shops); }
    if (!ch) this.chunks.set(c.key, ch = { key: c.key, parcels: new Set(), shops: [] });
    ch.parcels.add(p); for (const s of shops) ch.shops.push(s); this.dirty = true;
  }
  // ---------------------------------------------------------------- one bay -> one shop (bay frame -> world via BM) ----
  plan(r, M) {
    const w = r.a1 - r.a0; if (w < 2.3) { this.stats.narrow++; return null; }
    if (r.kind === 'shut' && r.open === 0) { this.stats.closed++; return null; }
    const ac = (r.a0 + r.a1) / 2; const BM = new THREE.Matrix4().multiplyMatrices(M, BAYB.clone().setPosition(r.fx, 0, r.z1 - ac));
    const T = pickType(); const type = T[0]; this.stats.types[type]++; this.stats.shops++;
    const shop = { type, inst: {}, tris: 0, uniq: [] }; const hw = w / 2;
    const push = (k, mat) => { _w.multiplyMatrices(BM, mat); (shop.inst[k] || (shop.inst[k] = [])).push(..._w.elements); shop.tris += this.triOf[k]; };
    const P = (k, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) => { _e.set(0, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z); push(k, _m.compose(_p, _q, _s)); };
    const seg = (k, a, b, wd, h = wd) => { _a.set(...a); _b.set(...b); const L = _a.distanceTo(_b); if (L < 0.01) return; _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); _s.set(wd, L, h); _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); push(k, _m.compose(_p, _q, _s)); };
    const y0 = r.y0, yt = r.yt, ys = y0 + 0.45, yh = yt - 0.06, ytr = Math.min(yh - 0.35, y0 + 2.6);
    // door (kit.js storefront: 1 m leaf at a = da) and the clutter span it left on the sidewalk, in bay x
    const da = r.cl && r.cl.da !== undefined ? r.cl.da : r.a0 + 0.15; const dx0 = Math.max(-hw, da - ac), dx1 = Math.min(hw, dx0 + 1.0); const dcx = (dx0 + dx1) / 2;
    const left = dcx < 0; const wx0 = left ? dx1 + 0.12 : -hw + 0.12, wx1 = left ? hw - 0.12 : dx0 - 0.12; const wcx = (wx0 + wx1) / 2, ww = Math.max(0.3, wx1 - wx0);
    const busy = []; if (r.cl && r.cl.cl) busy.push([r.cl.cl[0] - ac - 0.15, r.cl.cl[1] - ac + 0.15]);
    // ---- shutter: existing (from the log) or one of ours on bare bays
    let yb = yt; // lowest point of a curtain over the opening (yt = none)
    if (r.kind === 'shut') yb = y0 + (yt - y0) * r.open;
    else if (r.kind === 'plain' && rng() < 0.45) { const half = rng() < 0.6; const op = half ? rand(0.4, 0.65) : 0.95; yb = y0 + (yt - y0) * op; if (half) this.stats.shutterHalf++; else this.stats.shutterUp++;
      const k = rng() < 0.3 ? 'shutterR' : 'shutter'; if (yt - yb > 0.1) P(k, 0, yb, 0.31, w, yt - yb, 1);
      P('steel', 0, yt + 0.22, 0.36, w + 0.2, 0.44, 0.42); for (const s of [-1, 1]) P('steel', s * hw, (y0 + yt) / 2, 0.31, 0.08, yt - y0, 0.08); }
    const vTop = Math.min(ytr - 0.05, yb - 0.05); const open = vTop > ys + 0.6; // window still visible below the curtain
    // ---- 门头 light box in the transom: dark case + lit shop-name face (cnFace, merged World)
    { const wl = Math.min(w - 0.3, 3.4), hl = 0.55, yl = Math.max(ytr + 0.3, Math.min(yh - 0.3, ytr + 0.32)); P('lbBody', 0, yl, 0.44, wl, hl, 0.18);
      const c = new THREE.Vector3(0, yl, 0.536).applyMatrix4(BM); const n = new THREE.Vector3(0, 0, 1).transformDirection(BM);
      shop.uniq.push({ k: pick(T[1]), x: c.x, y: c.y, z: c.z, ry: Math.atan2(n.x, n.z), w: wl * 0.95, h: hl * 0.86 }); }
    // ---- window display card (lit panel + dark strokes) in front of the parallax room, behind the glass
    const card = (k, x0, x1, ya, yb2) => { if (yb2 - ya < 0.15 || x1 - x0 < 0.2) return false; P(k, (x0 + x1) / 2, (ya + yb2) / 2, 0.12, x1 - x0, yb2 - ya, 0.02); return true; };
    const ink = (x, y, sx, sy) => P('ink', x, y, 0.135, sx, sy, 0.006);
    const stickers = (n) => { for (let i = 0; i < n; i++) { const x = rand(wx0 + 0.1, wx1 - 0.1), y = rand(ys + 0.15, Math.min(vTop, ys + 1.3)); if (y > vTop) continue; const k = rng() < 0.6 ? 'stkY' : 'stkR';
      P(k, x, y, 0.236, rand(0.12, 0.2), rand(0.08, 0.13), 0.006, 0, rand(-0.25, 0.25)); P('ink', x, y - 0.012, 0.24, 0.07, 0.022, 0.003); } };
    // ---- outside clutter group: x span [ox0, ox1], z ≤ oz; kept off the door and off the storefront's own clutter
    const free = (x0, x1) => x0 >= -hw - 0.05 && x1 <= hw + 0.05 && !(x1 > dx0 - 0.1 && x0 < dx1 + 0.1) && !busy.some((b) => x1 > b[0] && x0 < b[1]);
    const out = { x0: 1e9, x1: -1e9, z: 0 }; const claim = (x0, x1, z) => { out.x0 = Math.min(out.x0, x0); out.x1 = Math.max(out.x1, x1); out.z = Math.max(out.z, z); busy.push([x0, x1]); };
    const spot = (wd) => { for (let i = 0; i < 6; i++) { const x = rand(-hw + wd / 2, hw - wd / 2); if (free(x - wd / 2, x + wd / 2)) return x; } return null; };
    const stoolK = () => pick(['stoolR', 'stoolR', 'stoolB', 'stoolG']);
    const noren = (k) => { if (yb < ytr) return; P(k, dcx, ytr - 0.02, 0.33, dx1 - dx0 + 0.04, rand(0.55, 0.8), 1); };
    const strip = () => { if (yb < ytr) return; P('strip', dcx, ytr - 0.02, 0.34, dx1 - dx0 + 0.06, ytr - y0 - 0.06, 1); };
    const seats = (x, z, n) => { P(rng() < 0.6 ? 'table' : 'tableW', x, y0, z, 1, 1, 1, rand(-0.08, 0.08)); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3); const sx = x + Math.cos(a) * 0.62, sz = Math.min(1.25, Math.max(0.55, z + Math.sin(a) * 0.45)); P(stoolK(), sx, y0, sz, 1, 1, 1, rand(0, 6.28)); } };
    if (type === 'ramen' || type === 'tea') {
      noren(type === 'ramen' ? (rng() < 0.6 ? 'norenR' : 'norenI') : pick(['norenI', 'norenW']));
      if (open) { const ya = Math.max(ys + 0.35, vTop - 1.0); if (card(type === 'ramen' ? 'litW' : 'litY', wx0 + 0.05, wx1 - 0.05, ya, vTop)) { const rows = Math.max(2, Math.floor((vTop - ya) / 0.2));
        for (let i = 0; i < rows; i++) { const y = ya + (i + 0.6) * (vTop - ya) / (rows + 0.4); ink(wcx - ww * 0.12, y, ww * 0.5, 0.035); ink(wx1 - 0.25, y, 0.18, 0.035); } // dish lines + prices
        if (type === 'ramen') for (let i = 0; i < Math.min(3, Math.floor(ww / 0.6)); i++) ink(wx0 + 0.35 + i * 0.55, ya + 0.12, 0.34, 0.14); } } // bowl pictograms
      if (type === 'ramen') for (const s of [-1, 1]) { const x = s * (Math.min(w - 0.3, 3.4) / 2 + 0.22); if (Math.abs(x) > hw + 0.1) continue; P('lantern', x, ytr + 0.12, 0.55, 0.3, 0.36, 0.3); P('lcap', x, ytr + 0.34, 0.55, 0.5, 0.5, 0.5); P('lcap', x, ytr - 0.1, 0.55, 0.45, 0.45, 0.45); }
      const x = spot(1.5); if (x !== null) { seats(x, 0.85, randi(2, 4)); claim(x - 0.8, x + 0.8, 1.3); }
      else { const x2 = spot(0.4); if (x2 !== null) { const n = randi(2, 5); for (let i = 0; i < n; i++) P(stoolK(), x2, y0 + i * 0.075, 0.55, 1, 1, 1, rand(0, 6.28)); claim(x2 - 0.2, x2 + 0.2, 0.75); } } // stacked stools
      stickers(randi(0, 2));
    } else if (type === 'conv') {
      strip();
      if (open) { const ya = ys + 0.05, yz = vTop; const nd = Math.max(1, Math.round(ww / 0.75)); if (card('litC', wx0, wx1, ya, yz)) {
        for (let i = 1; i < nd; i++) ink(wx0 + (ww * i) / nd, (ya + yz) / 2, 0.05, yz - ya); // fridge door frames
        for (let y = ya + 0.32; y < yz - 0.1; y += 0.34) ink(wcx, y, ww, 0.025); } } // shelves
      stickers(randi(4, 8));
      const x = spot(1.3); if (x !== null) { for (let j = 0; j < 2; j++) { const n = randi(2, 4); const k = rng() < 0.5 ? 'crateR' : 'crateB'; for (let i = 0; i < n; i++) P(k, x - 0.25 + j * 0.45, y0 + i * 0.28, 0.6, 1, 1, 1, rand(-0.05, 0.05)); }
        P('chest', x + 0.15, y0 + 0.32, 1.05, 0.9, 0.64, 0.5); P('litC', x + 0.15, y0 + 0.5, 1.305, 0.6, 0.12, 0.01); claim(x - 0.5, x + 0.65, 1.32); }
    } else if (type === 'repair') {
      strip();
      if (open) { const ya = Math.max(ys + 0.1, vTop - 1.3); if (card('board', wx0, wx1, ya, vTop)) { const nc = Math.max(2, Math.floor(ww / 0.3)), nr = Math.max(1, Math.floor((vTop - ya - 0.1) / 0.32));
        for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) if (rng() < 0.75) P('scr', wx0 + (i + 0.5) * ww / nc, ya + 0.2 + j * 0.32, 0.135, 0.13, 0.22, 0.008); } }
      stickers(randi(2, 5));
      const x = spot(1.2); if (x !== null) { P('frame', x, y0 + 0.45, 0.62, 1.1, 0.9, 0.5); P('glass', x, y0 + 0.92, 0.62, 1.06, 0.05, 0.46); P('litCy', x, y0 + 0.75, 0.875, 1.0, 0.04, 0.01);
        for (let i = 0; i < 4; i++) P('scr', x - 0.38 + i * 0.25, y0 + 0.96, 0.62, 0.08, 0.012, 0.14); claim(x - 0.6, x + 0.6, 0.9); }
    } else if (type === 'pharm') {
      strip();
      if (open && card('litW', wx0, wx1, ys + 0.05, vTop)) for (let y = ys + 0.3; y < vTop - 0.1; y += 0.3) { ink(wcx, y, ww, 0.02); for (let x = wx0 + 0.08; x < wx1 - 0.08; x += rand(0.1, 0.22)) if (rng() < 0.6) P(rng() < 0.5 ? 'stkR' : 'board', x, y + 0.09, 0.13, 0.07, rand(0.08, 0.16), 0.03); }
      stickers(randi(2, 5));
      { const xe = left ? hw - 0.1 : -hw + 0.1; const yc = ytr - 0.15; P('steel', xe, yc + 0.48, 0.5, 0.05, 0.05, 0.6); P('lbBody', xe, yc, 0.82, 0.12, 0.72, 0.72); for (const s of [-1, 1]) P('crossG', xe + s * 0.065, yc, 0.82, 0.6, 0.6, 0.02, Math.PI / 2); }
    } else if (type === 'hard') {
      strip();
      if (open && card('litW', wx0, wx1, Math.max(ys, vTop - 1.0), vTop)) { for (let i = 0; i < 6; i++) ink(rand(wx0 + 0.1, wx1 - 0.1), rand(vTop - 0.9, vTop - 0.15), rand(0.03, 0.06), rand(0.2, 0.45)); } // hung tools
      stickers(randi(1, 3));
      const x = spot(1.05); if (x !== null) { P('rack', x, y0, 0.48, 1, 1, 1); for (const [yy, k] of [[0.145, 'bucketO'], [0.625, 'bucketB'], [1.105, 'bucketO']]) for (let i = 0; i < randi(1, 3); i++) P(k, x - 0.3 + i * 0.3, y0 + yy + 0.13, 0.48, 0.24, 0.26, 0.24);
        P('stkY', x + 0.3, y0 + 0.66, 0.705, 0.12, 0.08, 0.006); claim(x - 0.55, x + 0.55, 0.75);
        const xl = x + (x > 0 ? -0.75 : 0.75); if (free(xl - 0.25, xl + 0.25)) { for (const s of [-0.2, 0.2]) seg('steel', [xl + s, y0, 0.75], [xl + s * 0.8, y0 + 2.2, 0.3], 0.04); for (let y = 0.3; y < 2.1; y += 0.3) { const t = y / 2.2; seg('steel', [xl - 0.2 + 0.04 * t, y0 + y, 0.75 - 0.45 * t], [xl + 0.2 - 0.04 * t, y0 + y, 0.75 - 0.45 * t], 0.025); } claim(xl - 0.25, xl + 0.25, 0.8); } }
    } else if (type === 'laundry') {
      strip();
      if (open) { const ya = ys + 0.05, yz = Math.min(vTop, ys + 1.05); if (card('litW', wx0, wx1, ya, yz)) { const n = Math.max(1, Math.floor(ww / 0.62)); for (let i = 0; i < n; i++) { const x = wx0 + (i + 0.5) * ww / n; P('ring', x, ya + 0.45, 0.14, 0.5, 0.5, 0.5); P('disc', x, ya + 0.45, 0.135, 0.5, 0.5, 1); }
        ink(wcx, yz - 0.06, ww, 0.06); } if (vTop > yz + 0.3) card('litC', wx0, wx1, yz + 0.15, vTop); }
      const x = spot(0.9); if (x !== null) { P(stoolK(), x - 0.22, y0, 0.6); P(stoolK(), x + 0.24, y0, 0.62, 1, 1, 1, 1.1); P('bucketB', x + 0.24, y0 + 0.6, 0.62, 0.42, 0.28, 0.32); claim(x - 0.45, x + 0.45, 0.8); }
    } else if (type === 'barber') {
      if (open && card('litW', wx0, wx1, ys + 0.05, vTop)) { const n = Math.max(1, Math.floor(ww / 0.8)); for (let i = 0; i < n; i++) { const x = wx0 + (i + 0.5) * ww / n; ink(x, ys + 1.2, 0.5, 0.65); ink(x, ys + 0.45, 0.3, 0.5); ink(x, ys + 0.75, 0.55, 0.12); } } // mirrors + chairs
      const xp = left ? dx1 + 0.2 : dx0 - 0.2; if (Math.abs(xp) < hw - 0.05) { const yc = y0 + 2.0; P('pole', xp, yc, 0.42, 0.16, 0.7, 0.16); for (let i = 0; i < 3; i++) { P('bandR', xp, yc - 0.27 + i * 0.22, 0.42, 0.17, 0.6, 0.17); P('bandB', xp, yc - 0.16 + i * 0.22, 0.42, 0.17, 0.6, 0.17); }
        for (const s of [-1, 1]) P('steel', xp, yc + s * 0.38, 0.42, 0.2, 0.06, 0.2); P('steel', xp, yc, 0.3, 0.05, 0.05, 0.22); }
      stickers(randi(0, 2));
    } else { // clinic
      if (open) { const k = rng() < 0.5 ? 'litM' : 'litCy'; if (card(k, wx0, wx1, ys + 0.05, vTop)) { const n = Math.max(1, Math.floor(ww / 0.7)); for (let i = 0; i < n; i++) { const x = wx0 + (i + 0.5) * ww / n; // limb / spine diagrams
        seg('ink', [x, ys + 0.3, 0.135], [x + 0.08, ys + 1.0, 0.135], 0.05, 0.006); seg('ink', [x + 0.08, ys + 1.0, 0.135], [x - 0.04, ys + 1.5, 0.135], 0.05, 0.006); for (let y = ys + 0.35; y < ys + 1.45; y += 0.18) ink(x + 0.02, y, 0.16, 0.02); } } }
      if (rng() < 0.5) strip(); stickers(randi(0, 2));
    }
    // ---- one collider for the outside clutter (oriented with the facade)
    if (out.x1 > out.x0 && this.city.col && this.city.col.addOBB) { const zc = (0.3 + out.z) / 2; const c = new THREE.Vector3((out.x0 + out.x1) / 2, 0, zc).applyMatrix4(BM); const u = new THREE.Vector3(1, 0, 0).transformDirection(BM);
      this.city.col.addOBB(c.x, c.z, u.x, u.z, (out.x1 - out.x0) / 2, (out.z - 0.3) / 2, y0 + 1.0, 'shop'); this.stats.colliders++; shop.col = { x: c.x, z: c.z, hl: (out.x1 - out.x0) / 2, hw: (out.z - 0.3) / 2 }; }
    const c0 = new THREE.Vector3(0, 0, 0).applyMatrix4(BM); shop.cx = c0.x; shop.cz = c0.z;
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(BM), al = new THREE.Vector3(1, 0, 0).transformDirection(BM); shop.n = [fwd.x, fwd.z]; shop.u = [al.x, al.z]; shop.w = w; shop.shut = yb < yt - 0.1;
    return shop;
  }
  // ---------------------------------------------------------------- packing ----
  ensure(k, n) {
    let im = this.kinds.get(k); if (im && im.instanceMatrix.count >= n) return im;
    const cap = Math.max(32, 1 << Math.ceil(Math.log2(Math.max(1, n)))); const [gk, mk] = KINDS[k];
    if (im) { this.group.remove(im); im.dispose(); }
    im = new THREE.InstancedMesh(geos()[gk], this.M[mk], cap); im.count = 0; im.castShadow = false; im.receiveShadow = true; im.name = 'shop|' + k; im.visible = false; im.frustumCulled = false;
    this.group.add(im); this.kinds.set(k, im); return im;
  }
  repack(cam) {
    const p = cam.position; const st = this.stream; const cand = [];
    for (const ch of this.chunks.values()) { const c = st && st.chunks.get(ch.key); if (!c || !c.near) continue;
      for (const s of ch.shops) { const d = Math.hypot(s.cx - p.x, s.cz - p.z) + Math.max(0, p.y - 12) * 1.2; if (d < RMAX) cand.push([d, s]); } }
    cand.sort((a, b) => a[0] - b[0]);
    const take = new Map(); let tris = 0, n = 0; const sel = [];
    for (const [, s] of cand) { if (tris + s.tris > BUDGET) continue; tris += s.tris; n++; sel.push(s);
      for (const k in s.inst) { let l = take.get(k); if (!l) take.set(k, l = []); l.push(s.inst[k]); } }
    for (const [k, im] of this.kinds) if (!take.has(k)) { im.count = 0; im.visible = false; }
    for (const [k, l] of take) { const tot = l.reduce((a, b) => a + b.length / 16, 0); const im = this.ensure(k, tot); const arr = im.instanceMatrix.array; let o = 0;
      for (const a of l) { arr.set(a, o * 16); o += a.length / 16; } im.count = tot; im.visible = tot > 0; im.instanceMatrix.needsUpdate = true; }
    this.stats.packed = n; this.stats.tris = tris; this.stats.inst = [...this.kinds.values()].reduce((a, im) => a + im.count, 0);
    const key = sel.map((s) => s.cx.toFixed(1) + ':' + s.cz.toFixed(1)).join('|'); if (key !== this.uKey) { this.uKey = key; this.buildUniq(sel); }
  }
  buildUniq(sel) {
    for (const m of this.world) { this.group.remove(m); m.geometry.dispose(); } this.world = []; this.stats.faces = 0; if (!sel.length) return;
    const W = new World(1e7); W.attrs = {};
    for (const s of sel) for (const u of s.uniq) { cnFace(W, u.k, u.x, u.y, u.z, u.ry, u.w, u.h, 1); this.stats.faces++; }
    this.world = W.build(this.group, this.mats, { cnsign: { cast: false } });
  }
  sync(cam) {
    if (!cam) return; this.frame++;
    const nt = U.uNight.value; for (const k in MDEF) { const g = MDEF[k][4]; if (g) this.M[k].emissiveIntensity = GLOW[g][0] + nt * GLOW[g][1]; }
    const p = cam.position; const L = this.last; const st = this.stream; let on = 0;
    if (st) for (const ch of this.chunks.values()) { const c = st.chunks.get(ch.key); if (c && c.near) on++; }
    const moved = !L || Math.hypot(p.x - L.x, p.z - L.z) > 8 || Math.abs(p.y - L.y) > 6;
    if (this.dirty || on !== (L && L.on) || (moved && this.frame - (L ? L.f : -99) > 8)) { this.dirty = false; this.repack(cam); this.last = { x: p.x, y: p.y, z: p.z, on, f: this.frame }; }
  }
  tris() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n += im.geometry.attributes.position.count / 3 * im.count; for (const m of this.world) n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3; return Math.round(n); }
  calls() { let n = 0; for (const im of this.kinds.values()) if (im.visible) n++; return n + this.world.length; }
  // test helper: all planned shops (world centre at the facade, outward normal, along-facade axis)
  list() { const o = []; for (const ch of this.chunks.values()) for (const s of ch.shops) o.push(s); return o; }
}
