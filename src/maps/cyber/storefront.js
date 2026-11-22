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
// Rendering (b_signsync): the shops of the near-loaded chunks nearest the camera are packed under a triangle budget into two merged
// meshes on materials the streamed dressing already uses — 'vcolD' (vertex colour = diffuse, like kit.js / dress.js clutter) and
// 'neon' (lit faces, night x5 emissive) — so the layer is 2 draw calls + the shop-name World instead of ~33 instanced kinds, and
// no new shader program. Each shop is baked to world-space triangles once when first packed (small LRU), a repack only copies
// arrays. The shop-name faces are one small merged World (existing 'cnsign' material), rebuilt only when the packed set changes.
// b_signsync also: a bay whose board above is a cnSignboard takes that board's name (and a matching shop type) for its 门头 light
// box; outside clutter keeps clear of the frontage's sidewalk dressing / vending machines (arch.js / dress.js log their footprints).
// Nothing casts shadows. Outside clutter gets one small collider per shop (≤ 1.35 m from the facade, so the
// sidewalk stays clear); building colliders are untouched.
// b_corner (2026-11-22): two more sources of bays and three more shop types.
//  * corner side rows: bldglayer.js 'side' items (a parcel side facing a road at a block corner) build their own shopStreet with
//    opts.log; the bays come here through onSide() with the side-row matrix (same record as SHOP_LOG, cached per item).
//  * Deco core (hand-built, real collider grid): city.js shopfront() logs every ground-floor store edge (CORE_SHOP_LOG, world
//    frame). The first sync() keeps the edges that face a street sidewalk (road graph within reach, no building in front), cuts
//    them into the same bays as the facade shader / piers (n = round(len / sw)) and plans one shop per bay. The core has no glass
//    storefront kit, so a core shop also gets a door frame; sidewalk avoidance there reads the collider grid (lamps, palms,
//    poles, signs, benches) instead of the dress.js log. Core shops live in 'core|' chunks, always eligible (distance-packed).
//  * new types: 烧烤 bbq (charcoal grill trough with glowing coals + skewers, stainless hood with a duct up the wall, skewer rack),
//    大排档 dai pai dong (round folding tables + drum stools, wide PVC strip curtain over the open front, a string of red
//    lanterns), 网吧 net café (glass door, a row of glowing monitors over a desk behind the window, chair backs, lit posters).
//    Names come from the shop-name cells 夜猫烧烤 / 炭火烧烤, 大排档, 光栅网吧 (SIGN_TXT), so a cnSignboard above sets the type.
// Same packing as before (vcolD + neon merged meshes + the shop-name World), the triangle budget grows 15k -> 23k.
import * as THREE from 'three';
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { World } from '../../geo.js';
import { SHOP_LOG, CORE_SHOP_LOG } from './arch.js';
import { cnFace } from './street2.js';

// b_corner: the budget is per *frame*: the frame draws 'neon' + names 3x (half-res water / wet-street mirror, main, GTAO G-buffer)
// and 'vcolD' 2x (it skips the mirror pass, see mesh()) -> cost = 2·vcolD + 3·neon triangles. 29k keeps the whole-frame increase
// ≤ 30k even where no shop was drawn before (Deco core); b_storefront/b_signsync drew ~15k layer tris 3x = ~45k.
// b_recess: core shops carry ~300 cost of recess pieces each -> 29k + ~5.5k so the same shops still pack (whole-frame delta ≤ 20k)
const CH = 160, RMAX = 120, BUDGET = 34500;
// shop types: [id, sign cells (street2.js SIGN_TXT), weight]
export const TYPES = [['ramen', [16, 0], 1.2], ['tea', [21, 7, 11], 1.0], ['conv', [6, 10], 1.2], ['repair', [18, 9, 2, 8], 1.1], ['pharm', [3], 0.8],
  ['hard', [4, 15], 0.8], ['laundry', [13], 0.7], ['barber', [5], 0.6], ['clinic', [22, 23], 0.7], ['bbq', [1, 17], 0.9], ['paidang', [14], 0.8], ['netcafe', [12], 0.8]];
const TW = TYPES.reduce((s, t) => s + t[2], 0);
// b_signsync: the bay's own cnSignboard name (street2.js SIGN_TXT cell 0..17) decides the shop type, so 门头 light box and the board
// above carry one name: 面馆/拉面/烧烤/大排档 -> food bar (ramen look), 修机/电器/电子/网吧 -> screens (repair look), …
// b_corner: 夜猫烧烤 / 炭火烧烤 -> bbq, 光栅网吧 -> netcafe, 大排档 -> paidang (own types now)
const SIGN_TYPE = ['ramen', 'bbq', 'repair', 'pharm', 'hard', 'barber', 'conv', 'tea', 'repair', 'repair', 'conv', 'tea', 'netcafe', 'laundry', 'paidang', 'hard', 'ramen', 'bbq'];
const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t[0], t]));
const NOAVOID = typeof location !== 'undefined' && /[?&]shopnoavoid/.test(location.search); // test switch: b_storefront placement (no sidewalk avoidance)
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
  // ---- b_corner pieces
  // drum stool (大排档 round stool): tapered solid drum + seat ring
  { const d = new THREE.CylinderGeometry(0.15, 0.18, 0.43, 10); d.translate(0, 0.215, 0); const r = new THREE.CylinderGeometry(0.165, 0.165, 0.03, 10); r.translate(0, 0.445, 0); G.dstool = merge([d, r]); }
  // round folding table ⌀0.9 × 0.72: top + post + cross feet
  { const t = new THREE.CylinderGeometry(0.45, 0.45, 0.03, 14); t.translate(0, 0.71, 0); G.rtable = merge([t, BX(-0.025, 0, -0.025, 0.025, 0.7, 0.025), BX(-0.32, 0, -0.025, 0.32, 0.04, 0.025), BX(-0.025, 0, -0.32, 0.025, 0.04, 0.32)]); }
  // charcoal grill trough 1.2 × 0.3, rim at 0.86: 4 legs + bottom + 4 walls (coals are a separate lit box)
  { const P = []; for (const x of [-0.55, 0.55]) for (const z of [-0.12, 0.12]) P.push(BX(x - 0.02, 0, z - 0.02, x + 0.02, 0.66, z + 0.02));
    P.push(BX(-0.6, 0.62, -0.15, 0.6, 0.66, 0.15), BX(-0.6, 0.66, -0.15, 0.6, 0.86, -0.13), BX(-0.6, 0.66, 0.13, 0.6, 0.86, 0.15), BX(-0.6, 0.66, -0.13, -0.58, 0.86, 0.13), BX(0.58, 0.66, -0.13, 0.6, 0.86, 0.13));
    P.push(BX(-0.55, 0.2, -0.12, 0.55, 0.22, 0.12)); G.grill = merge(P); } // + lower shelf
  // skewers across the trough: 11 sticks (unit width 1 along x, sticks along z, y = 0) and the meat / veg chunks on them
  { const S = [], M = []; for (let i = 0; i < 11; i++) { const x = -0.5 + (i + 0.5) / 11; S.push(BX(x - 0.006, -0.006, -0.22, x + 0.006, 0.006, 0.2));
      for (const z of [-0.09, -0.02, 0.05]) M.push(BX(x - 0.022, -0.02, z - 0.028, x + 0.022, 0.024, z + 0.028)); } G.skew = merge(S); G.meat = merge(M); }
  // stainless hood (油烟罩): square frustum, bottom 1 × 1 (unit), top 0.4, height 1 (scaled) + a lip
  { const h = new THREE.CylinderGeometry(0.2 * Math.SQRT2, 0.5 * Math.SQRT2, 1, 4, 1, true); h.rotateY(Math.PI / 4); h.translate(0, 0.5, 0); G.hood = merge([h, BX(-0.52, -0.04, -0.52, 0.52, 0.02, -0.48), BX(-0.52, -0.04, 0.48, 0.52, 0.02, 0.52), BX(-0.52, -0.04, -0.48, -0.48, 0.02, 0.48), BX(0.48, -0.04, -0.48, 0.52, 0.02, 0.48)]); }
  // skewer rack (串架) 0.7 × 1.3 × 0.35: 2 side frames + 3 slanted trays
  { const P = []; for (const x of [-0.35, 0.35]) for (const z of [-0.15, 0.15]) P.push(BX(x - 0.015, 0, z - 0.015, x + 0.015, 1.3, z + 0.015));
    for (const y of [0.45, 0.8, 1.15]) { const t = BX(-0.35, -0.01, -0.16, 0.35, 0.01, 0.16); t.rotateX(-0.25); t.translate(0, y, 0); P.push(t, BX(-0.35, y - 0.06, 0.13, 0.35, y + 0.04, 0.15)); } G.srack = merge(P); }
  // wide PVC strip curtain with gaps (大排档 / 烧烤 open front): 10 strips per unit width, y ∈ [−1, 0]
  { const P = [BX(-0.52, -0.03, -0.02, 0.52, 0.03, 0.02)]; for (let i = 0; i < 10; i++) { const x = -0.5 + (i + 0.5) / 10; P.push(BX(x - 0.034, -1, (i % 2 ? 0.006 : -0.006) - 0.002, x + 0.034, -0.03, (i % 2 ? 0.006 : -0.006) + 0.002)); } G.pstrip = merge(P); }
  return (GEO = G);
}

// ------------------------------------------------------------------ materials ----
// [colour, roughness, metalness, emissive?, glow group?] — b_signsync: only the colours are used (baked to vertex colours, see KC)
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
  // b_corner
  inox: [0x9aa0a6, 0.35, 0.8], soot: [0x26221e, 0.9, 0.2], coal: [0x2a0a02, 0.8, 0.0, 0xff5a12, 'lamp'], meat: [0x7a2a14, 0.7, 0.0], veg: [0x3d7a26, 0.7, 0.0],
  stick: [0xb89060, 0.8, 0.0], tableR: [0xd8d8d0, 0.5, 0.0], dstoolR: [0xb01a22, 0.5, 0.0], dstoolB: [0x1d4f9c, 0.5, 0.0], pvc: [0x8fa8a6, 0.25, 0.0],
  // b_recess: core shop surround (门套) trims, recess lining / soffit, threshold stone
  trimK: [0x202226, 0.5, 0.3], trimB: [0x4a3826, 0.5, 0.5], trimS: [0x6a6f76, 0.4, 0.6], trimT: [0x173c3e, 0.5, 0.3], trimW: [0xa8a296, 0.7, 0.0], trimR: [0x4a1414, 0.6, 0.2],
  rev: [0x0b0c0e, 0.8, 0.1], soffit: [0x141518, 0.8, 0.1], sill: [0x34363a, 0.8, 0.0],
  monF: [0x101114, 0.4, 0.3], scrB: [0x0a1020, 0.3, 0.0, 0x5a8cff, 'lit'], scrP: [0x180a20, 0.3, 0.0, 0xc060ff, 'lit'], chair: [0x18181c, 0.6, 0.1], chairR: [0x601014, 0.6, 0.1],
};
const GLOW = { lit: [0.35, 1.7], lamp: [0.4, 2.4], stk: [0.06, 0.45] }; // emissiveIntensity = a + uNight * b
const KINDS = {}; // kind -> [geometry, material]
for (const m in MDEF) KINDS[m] = ['box', m];
Object.assign(KINDS, { shutter: ['shutter', 'shutter'], shutterR: ['shutter', 'shutterR'], stoolR: ['stool', 'stoolR'], stoolB: ['stool', 'stoolB'], stoolG: ['stool', 'stoolG'],
  table: ['table', 'steel'], tableW: ['table', 'wood'], norenR: ['noren', 'norenR'], norenI: ['noren', 'norenI'], norenW: ['noren', 'norenW'], strip: ['strip', 'strip'],
  lantern: ['lantern', 'lantern'], lcap: ['cap', 'frame'], rack: ['rack', 'steel'], bucketO: ['cyl', 'bucketO'], bucketB: ['cyl', 'bucketB'], pole: ['pole', 'poleW'], bandR: ['band', 'bandR'],
  bandB: ['band', 'bandB'], ring: ['ring', 'steel'], disc: ['disc', 'glass'], crossG: ['cross', 'litG'], crateR: ['crate', 'crateR'], crateB: ['crate', 'crateB'],
  dstoolR: ['dstool', 'dstoolR'], dstoolB: ['dstool', 'dstoolB'], rtable: ['rtable', 'tableR'], grill: ['grill', 'soot'], skew: ['skew', 'stick'], meatS: ['meat', 'meat'], vegS: ['meat', 'veg'],
  hood: ['hood', 'inox'], srack: ['srack', 'inox'], pstrip: ['pstrip', 'pvc'] });
// b_signsync: no own materials any more. Every kind bakes into one of two merged meshes on materials the streamed dressing already
// draws with (same programs): 'vcolD' (vertex colour = the kind's diffuse colour, as dress.js / kit.js clutter) and 'neon' (lit
// faces: vertex colour = emissive colour scaled so 'neon's (0.25 + 5·uNight) gives the old a + b·uNight at night).
const KC = {}; // kind -> { g: geometry key, b: 0 vcolD | 1 neon, c: [r, g, b] linear }
for (const k in KINDS) { const [gk, mk] = KINDS[k]; const [c, , , e, grp] = MDEF[mk];
  if (e && grp !== 'stk') { const f = (GLOW[grp][0] + GLOW[grp][1]) / 5.25; const col = new THREE.Color(e); KC[k] = { g: gk, b: 1, c: [col.r * f, col.g * f, col.b * f] }; }
  else { const col = new THREE.Color(c); KC[k] = { g: gk, b: 0, c: [col.r, col.g, col.b] }; } }
const BUCK = ['vcolD', 'neon'];

const _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const BAYB = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)); // bay frame (x along the facade, z out) -> parcel frame

export class StorefrontLayer {
  constructor(scene, mats, city) {
    this.mats = mats; this.city = city; this.stream = city.stream; this.group = new THREE.Group(); this.group.name = 'storefront'; scene.add(this.group);
    this.meshes = [null, null]; this.cap = [0, 0]; this.nv = [0, 0]; this.bake = new Map(); this.chunks = new Map(); this.cache = new WeakMap(); this.world = []; this.uKey = ''; this.last = null; this.frame = 0; this.dirty = false;
    const G = geos(); this.triOf = {}; for (const k in KINDS) this.triOf[k] = G[KINDS[k][0]].attributes.position.count / 3;
    this.stats = { parcels: 0, bays: 0, shops: 0, closed: 0, narrow: 0, types: {}, shutterHalf: 0, shutterUp: 0, colliders: 0, signSync: 0, signOther: 0, swItems: 0, outGroups: 0, outOverlap: 0, noavoid: NOAVOID, bakes: 0, packed: 0, tris: 0, inst: 0, faces: 0 };
    for (const t of TYPES) this.stats.types[t[0]] = 0;
    this.stats.bySrc = { front: { shops: 0, types: {} }, side: { rows: 0, bays: 0, shops: 0, types: {} }, core: { edges: 0, street: 0, bays: 0, shops: 0, types: {}, swItems: 0 } };
    this.coreDone = false; this.sideCache = new WeakMap();
    this.stats.recess = { shops: 0, tris: 0 }; this.stats.duct = { bbq: 0, awn: 0, sign: 0, rerouted: 0, hoodLow: 0, coreClamp: 0, hitOld: 0, hitNew: 0, hoodOld: 0, hoodNew: 0, signOld: 0, signNew: 0 };
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
  // b_corner: a corner side row (bldglayer.js 'side' item) was just built for stream chunk `key`: bays in the row frame, matrix m
  onSide(key, it, bays, m) {
    let ch = this.chunks.get(key); if (ch && ch.parcels.has(it)) return;
    let shops = this.sideCache.get(it);
    if (!shops) { shops = []; const bs = this.stats.bySrc.side; bs.rows++;
      bays.forEach((r, i) => { this.stats.bays++; bs.bays++; const s = withSeed(((it.p.seed ^ (it.sd > 0 ? 0x2c0e51 : 0x6b1d07)) + i * 7919) >>> 0, () => this.plan(r, m, 'side')); if (s) shops.push(s); });
      this.sideCache.set(it, shops); }
    if (!ch) this.chunks.set(key, ch = { key, parcels: new Set(), shops: [] });
    ch.parcels.add(it); for (const s of shops) ch.shops.push(s); this.dirty = true;
  }
  // b_corner: the hand-built Deco core (city.js shopfront log, world frame). Run once, on the first sync (all colliders exist then).
  planCore() {
    this.coreDone = true; const E = CORE_SHOP_LOG.splice(0); const col = this.city.col, gr = this.city.graph; const bs = this.stats.bySrc.core; if (!col || !col.query) return;
    // the core's own street grid (city.roads, half width 7 m + 4.5 m sidewalk; the road graph index does not cover the core)
    const RD = this.city.roads || []; const nearRoad = (x, z) => RD.some((r) => r.axis === 'z' ? Math.abs(x - r.c) < 14 && z > r.a0 - 2 && z < r.a1 + 2 : Math.abs(z - r.c) < 14 && x > r.a0 - 2 && x < r.a1 + 2)
      || (gr && (() => { const n = gr.index.near(x, z); return n && n.d < n.e.hw + 7; })());
    const inBld = (x, z) => col.query(x, z, 0.5, []).some((b) => b.tag === 'bld' && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
    E.forEach((e, ei) => {
      bs.edges++; const ox = -e.dz, oz = e.dx; const P = (a, d) => [e.p[0] + e.dx * a + ox * d, e.p[1] + e.dz * a + oz * d];
      // faces a street sidewalk: a road within reach of the edge middle, and no building right in front (party walls, back yards)
      let ok = true; for (const t of [0.25, 0.5, 0.75]) { const q = P(e.len * t, 1.5); if (inBld(q[0], q[1])) { ok = false; break; } } if (!ok) { bs.rejBld = (bs.rejBld || 0) + 1; return; }
      { const q = P(e.len / 2, 1.5); if (!nearRoad(q[0], q[1])) { bs.rejRoad = (bs.rejRoad || 0) + 1; return; } }
      bs.street++;
      const F0 = new THREE.Matrix4().makeBasis(new THREE.Vector3(e.dx, 0, e.dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(ox, 0, oz)).setPosition(e.p[0], 0, e.p[1]);
      // existing street furniture with colliders on the outside-clutter strip (lamps, palms, poles, signs, benches …) -> sidewalk spans
      const sw = []; { const m = P(e.len / 2, 1); for (const b of col.query(m[0], m[1], e.len / 2 + 2, [])) { if (b.tag === 'bld' || b.tag === 'shop' || b.tag === 'gap') continue;
        let a0 = 1e9, a1 = -1e9, d0 = 1e9, d1 = -1e9; for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ]]) { const dx = x - e.p[0], dz = z - e.p[1]; const a = dx * e.dx + dz * e.dz, d = dx * ox + dz * oz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
        if (a1 < -0.5 || a0 > e.len + 0.5 || d1 < 0 || d0 > 2.4) continue; sw.push({ k: b.tag, a0, a1, d0, d1 }); bs.swItems++; } }
      const n = Math.max(1, Math.round(e.len / e.sw)), cw = e.len / n; const shops = [];
      for (let i = 0; i < n; i++) { const a0 = i * cw + 0.2, a1 = (i + 1) * cw - 0.2; bs.bays++; this.stats.bays++;
        let h = Math.imul(ei + 0x51ed27, 0x85ebca6b) ^ Math.imul(i + 0x2f, 0xc2b2ae35); h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f); h ^= h >>> 13; // decorrelated per-bay seed
        const s = withSeed(h >>> 0, () => { const da = rng() < 0.5 ? a0 + 0.15 : a1 - 1.15;
          return this.plan({ F0, core: true, a0, a1, y0: e.y0, yt: 0.8 * e.ground - 0.04, ground: e.ground, kind: 'plain', open: 1, cl: { da, cl: null }, sg: 0, sk: -1, sw, i, n }, null, 'core'); });
        if (s) shops.push(s); }
      for (const s of shops) { const key = 'core|' + Math.floor(s.cx / CH) + ',' + Math.floor(s.cz / CH); let ch = this.chunks.get(key); if (!ch) this.chunks.set(key, ch = { key, core: true, parcels: new Set(), shops: [] }); ch.shops.push(s); }
    });
    this.dirty = true;
  }
  // ---------------------------------------------------------------- one bay -> one shop (bay frame -> world via BM) ----
  plan(r, M, src = 'front') {
    const w = r.a1 - r.a0; if (w < 2.3) { this.stats.narrow++; return null; }
    if (r.kind === 'shut' && r.open === 0) { this.stats.closed++; return null; }
    const ac = (r.a0 + r.a1) / 2; const BM = r.F0 ? r.F0.clone().multiply(new THREE.Matrix4().makeTranslation(ac, 0, 0)) : new THREE.Matrix4().multiplyMatrices(M, BAYB.clone().setPosition(r.fx, 0, r.z1 - ac));
    const synced = r.sg === 1 && r.sk >= 0 && r.sk < SIGN_TYPE.length; const T = synced ? TYPE_BY_ID[SIGN_TYPE[r.sk]] : pickType(); const type = T[0]; this.stats.types[type]++; this.stats.shops++;
    const bs = this.stats.bySrc[src]; bs.shops++; bs.types[type] = (bs.types[type] || 0) + 1;
    if (synced) this.stats.signSync++; else if (r.sg === 1) this.stats.signOther++;
    const shop = { type, src, inst: {}, tris: 0, cost: 0, uniq: [] }; const hw = w / 2; const gz = r.core ? 0.14 : 0.236; // glass plane (core: the facade shader wall, no storefront kit)
    const push = (k, mat) => { _w.multiplyMatrices(BM, mat); (shop.inst[k] || (shop.inst[k] = [])).push(..._w.elements); shop.tris += this.triOf[k]; shop.cost += this.triOf[k] * (KC[k].b ? 3 : 2); };
    const P0 = (k, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) => { _e.set(0, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z); push(k, _m.compose(_p, _q, _s)); };
    // b_recess: in the core the glazing plane (door, window cards, screens, stickers: z 0.075–0.2) moves 6.5 cm back to the wall,
    // so it sits at the back of the new 0.34 m deep surround
    const ZB = (z) => (r.core && z >= 0.075 && z < 0.2 ? z - 0.065 : z);
    const P = (k, x, y, z, sx, sy, sz, ry, rz) => P0(k, x, y, ZB(z), sx, sy, sz, ry, rz);
    const Q = (k, x0, x1, ya, yb2, z0, z1) => { if (x1 - x0 > 0.005 && yb2 - ya > 0.005 && z1 - z0 > 0.005) P0(k, (x0 + x1) / 2, (ya + yb2) / 2, (z0 + z1) / 2, x1 - x0, yb2 - ya, z1 - z0); }; // box by extents, unshifted
    const seg = (k, a, b, wd, h = wd) => { a = [a[0], a[1], ZB(a[2])]; b = [b[0], b[1], ZB(b[2])]; _a.set(...a); _b.set(...b); const L = _a.distanceTo(_b); if (L < 0.01) return; _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); _s.set(wd, L, h); _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); push(k, _m.compose(_p, _q, _s)); };
    const y0 = r.y0, yt = r.yt, ys = y0 + 0.45, yh = yt - 0.06, ytr = Math.min(yh - 0.35, y0 + 2.6);
    // door (kit.js storefront: 1 m leaf at a = da) and the clutter span it left on the sidewalk, in bay x
    const da = r.cl && r.cl.da !== undefined ? r.cl.da : r.a0 + 0.15; const dx0 = Math.max(-hw, da - ac), dx1 = Math.min(hw, dx0 + 1.0); const dcx = (dx0 + dx1) / 2;
    const left = dcx < 0; const wx0 = left ? dx1 + 0.12 : -hw + 0.12, wx1 = left ? hw - 0.12 : dx0 - 0.12; const wcx = (wx0 + wx1) / 2, ww = Math.max(0.3, wx1 - wx0);
    const busy = []; if (r.cl && r.cl.cl) busy.push([r.cl.cl[0] - ac - 0.15, r.cl.cl[1] - ac + 0.15]);
    // b_signsync: existing sidewalk dressing / vending machines of this frontage (dress.js sidewalk, arch.js vending) whose footprint
    // reaches into the outside-clutter strip (d ≤ 1.4 m) of this bay: their x spans become busy, so the outside group moves or is dropped
    const sw = []; if (r.sw) for (const it of r.sw) { const x0 = it.a0 - ac, x1 = it.a1 - ac; if (x1 < -hw - 0.1 || x0 > hw + 0.1 || it.d0 > (r.core ? 2.4 : 1.4) || it.d1 < 0.3) continue; /* b_corner: core palms / poles stand 1.6–2.2 m out -> keep the gap walkable */ sw.push([x0 - 0.1, x1 + 0.1, it.d0, it.d1]); }
    if (!NOAVOID) for (const b of sw) busy.push([b[0], b[1]]);
    const groups = [];
    // ---- shutter: existing (from the log) or one of ours on bare bays
    let yb = yt; // lowest point of a curtain over the opening (yt = none)
    if (r.kind === 'shut') yb = y0 + (yt - y0) * r.open;
    else if (r.kind === 'plain' && rng() < 0.45) { const half = rng() < 0.6; const op = half ? rand(0.4, 0.65) : 0.95; yb = y0 + (yt - y0) * op; if (half) this.stats.shutterHalf++; else this.stats.shutterUp++;
      const k = rng() < 0.3 ? 'shutterR' : 'shutter';
      if (r.core) { const yo = yt - 0.24, zs = 0.42; if (yb > yo - 0.05) yb = Math.min(yb, yo - 0.05); // b_recess: surface-mounted on the surround (box under the ledge, rails outside the casings)
        if (yo - yb > 0.1) P0(k, 0, yb, zs, w + 0.3, yo - yb, 1); P0('steel', 0, yt - 0.02, zs + 0.13, w + 0.36, 0.44, 0.3); for (const s of [-1, 1]) P0('steel', s * (hw + 0.17), (y0 + yo) / 2, zs, 0.07, yo - y0, 0.07); }
      else { if (yt - yb > 0.1) P(k, 0, yb, 0.31, w, yt - yb, 1);
        P('steel', 0, yt + 0.22, 0.36, w + 0.2, 0.44, 0.42); for (const s of [-1, 1]) P('steel', s * hw, (y0 + yt) / 2, 0.31, 0.08, yt - y0, 0.08); } }
    const vTop = Math.min(ytr - 0.05, yb - 0.05); const open = vTop > ys + 0.6; // window still visible below the curtain
    // b_corner: core bays have only the shader glass + piers -> door frame, glass leaf and push bar of our own
    if (r.core) { const yd = Math.min(ytr, yb); for (const x of [dx0, dx1]) P('frame', x, (y0 + yd) / 2, 0.1, 0.08, yd - y0, 0.1); P('frame', dcx, yd, 0.1, dx1 - dx0 + 0.08, 0.08, 0.1);
      if (yd - y0 > 1.2) { P('glass', dcx, (y0 + yd) / 2, 0.08, dx1 - dx0 - 0.06, yd - y0 - 0.04, 0.02); P('steel', dcx, y0 + 1.05, 0.13, dx1 - dx0 - 0.2, 0.04, 0.04); }
      // b_recess: the core bay reads as a recessed shopfront, not a door stuck on the wall: a deep surround (门套) projecting 0.34 m
      // (head box under the transom ledge + two jamb casings over the piers), a dark lining on the inner jamb faces and a dark soffit
      // with a lit downlight strip, a stone threshold, and the glazing (door, cards, stickers — shifted back, see ZB) at the wall with
      // its own sill / transom bars, kick panel and a mid mullion. The parallax room of the facade shader shows through behind.
      // Geometry only: the building collider stays the flat wall (the surround is inside the pier / ledge depth + 0.14 m).
      { const D = 0.34, yo = yt - 0.2, tk = pick(['trimK', 'trimK', 'trimB', 'trimS', 'trimT', 'trimW', 'trimR']); const xi = hw - 0.07, xc = hw + 0.12; const n0 = shop.tris;
        Q(tk, -xc, xc, yo, yt + 0.04, 0.0, D + 0.04);                                        // head (soffit face underneath is dark: below)
        Q('soffit', -xi, xi, yo - 0.02, yo, 0.0, D);                                         // soffit
        Q('litW', -xi + 0.25, xi - 0.25, yo - 0.035, yo - 0.02, D - 0.1, D - 0.05);           // downlight strip
        for (const s of [-1, 1]) { const a = s < 0 ? [-xc, -hw + 0.04] : [hw - 0.04, xc], l = s < 0 ? [-hw + 0.04, -xi] : [xi, hw - 0.04];
          Q(tk, a[0], a[1], y0, yo, 0.16, D + 0.04); Q('rev', Math.min(l[0], l[1]), Math.max(l[0], l[1]), y0, yo - 0.02, 0.0, D); }   // jamb casing + dark lining
        Q('sill', -xc + 0.02, xc - 0.02, y0 - 0.03, y0 + 0.05, 0.0, D + 0.1);                  // threshold step
        const gx0 = -xi, gx1 = xi; Q('frame', gx0, gx1, ytr - 0.035, ytr + 0.035, 0.02, 0.09);  // transom bar (glazing at the wall)
        if (wx1 - wx0 > 0.4) { Q('frame', wx0 - 0.06, wx1 + 0.06, ys - 0.03, ys + 0.03, 0.02, 0.1); Q('board', wx0 - 0.06, wx1 + 0.06, y0 + 0.05, ys - 0.03, 0.01, 0.06); // sill + kick panel
          if (wx1 - wx0 > 1.7) Q('frame', wcx - 0.03, wcx + 0.03, ys + 0.03, ytr - 0.035, 0.02, 0.09); }
        this.stats.recess.shops++; this.stats.recess.tris += shop.tris - n0; } }
    // ---- 门头 light box in the transom: dark case + lit shop-name face (cnFace, merged World)
    { const wl = Math.min(w - 0.3, 3.4), hl = 0.55; let yl = Math.max(ytr + 0.3, Math.min(yh - 0.3, ytr + 0.32)); const lz = r.core ? 0.26 : 0.44; // b_recess: core box sits in the recess, under the soffit
      if (r.core) yl = Math.min(yl, yt - 0.25 - hl / 2); P0('lbBody', 0, yl, lz, wl, hl, 0.18);
      const c = new THREE.Vector3(0, yl, lz + 0.096).applyMatrix4(BM); const n = new THREE.Vector3(0, 0, 1).transformDirection(BM);
      const nk = synced ? r.sk : pick(T[1]); shop.uniq.push({ k: nk, x: c.x, y: c.y, z: c.z, ry: Math.atan2(n.x, n.z), w: wl * 0.95, h: hl * 0.86 }); }
    // ---- window display card (lit panel + dark strokes) in front of the parallax room, behind the glass
    const card = (k, x0, x1, ya, yb2) => { if (yb2 - ya < 0.15 || x1 - x0 < 0.2) return false; P(k, (x0 + x1) / 2, (ya + yb2) / 2, 0.12, x1 - x0, yb2 - ya, 0.02); return true; };
    const ink = (x, y, sx, sy) => P('ink', x, y, 0.135, sx, sy, 0.006);
    const stickers = (n) => { for (let i = 0; i < n; i++) { const x = rand(wx0 + 0.1, wx1 - 0.1), y = rand(ys + 0.15, Math.min(vTop, ys + 1.3)); if (y > vTop) continue; const k = rng() < 0.6 ? 'stkY' : 'stkR';
      P(k, x, y, gz, rand(0.12, 0.2), rand(0.08, 0.13), 0.006, 0, rand(-0.25, 0.25)); P('ink', x, y - 0.012, gz + 0.004, 0.07, 0.022, 0.003); } };
    // ---- outside clutter group: x span [ox0, ox1], z ≤ oz; kept off the door and off the storefront's own clutter
    const free = (x0, x1) => x0 >= -hw - 0.05 && x1 <= hw + 0.05 && !(x1 > dx0 - 0.1 && x0 < dx1 + 0.1) && !busy.some((b) => x1 > b[0] && x0 < b[1]);
    const out = { x0: 1e9, x1: -1e9, z: 0 }; const claim = (x0, x1, z) => { out.x0 = Math.min(out.x0, x0); out.x1 = Math.max(out.x1, x1); out.z = Math.max(out.z, z); busy.push([x0, x1]); groups.push([x0, x1, z]); };
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
    } else if (type === 'bbq') { // 烧烤: grill trough with coals + skewers under a stainless hood (duct up the wall), skewer rack
      if (rng() < 0.5) noren('norenR'); else strip();
      if (open) { const ya = Math.max(ys + 0.35, vTop - 1.0); if (card('litW', wx0 + 0.05, wx1 - 0.05, ya, vTop)) { const rows = Math.max(2, Math.floor((vTop - ya) / 0.2));
        for (let i = 0; i < rows; i++) { const y = ya + (i + 0.6) * (vTop - ya) / (rows + 0.4); ink(wcx - ww * 0.12, y, ww * 0.5, 0.035); ink(wx1 - 0.25, y, 0.18, 0.035); } } }
      const x = spot(1.35); if (x !== null) { const z = 0.78; P('grill', x, y0, z); P('coal', x, y0 + 0.79, z, 1.12, 0.06, 0.22); P('skew', x, y0 + 0.875, z, 1.08, 1, 1); P('meatS', x, y0 + 0.875, z, 1.08, 1, 1);
        // b_recess: the duct used to go straight up from the hood (and into the wall) — through the awning of 'awn' bays and through
        // the signboard over the bay. Now, under an awning or a signboard, it runs sideways under the awning braces to the gap
        // between bays and rises there; in the core it stops under the ground-floor canopy. The hood drops if the awning is low.
        const hz = 0.66; let yh0 = y0 + 2.0; const yd0 = Math.min(yt + 1.4, yh0 + 2.6); const D = this.stats.duct; D.bbq++;
        const oldR = [[x - 0.11, x + 0.11, yh0 + 0.42, yd0, hz - 0.11, hz + 0.11], [x - 0.11, x + 0.11, yd0 - 0.11, yd0 + 0.11, 0.23, 0.67]], oldH = [x - 0.675, x + 0.675, yh0, yh0 + 0.42, 0.25, 1.07];
        const obs = [], obsS = []; const aw = r.core ? null : r.aw; // awning parts + signboard, as boxes in bay frame [x0, x1, y0, y1, z0, z1]
        if (aw) { const yl = aw.y - 0.45 * aw.out, ya = (z) => aw.y - (z - 0.2) / (aw.out - 0.2) * 0.45 * aw.out; D.awn++;
          for (let i = 0; i < 12; i++) { const za = 0.2 + (aw.out - 0.2) * i / 12, zb = 0.2 + (aw.out - 0.2) * (i + 1) / 12; obs.push([-hw, hw, ya(zb) - 0.025, ya(za), za, zb]); }
          obs.push([-hw, hw, yl - 0.32, yl, aw.out - 0.01, aw.out + 0.01]);
          for (const bx of [-hw + 0.1, hw - 0.1]) for (let i = 0; i < 8; i++) { const za = 0.2 + (aw.out - 0.25) * i / 8, zb = 0.2 + (aw.out - 0.25) * (i + 1) / 8; obs.push([bx - 0.015, bx + 0.015, yl - 0.315 + 0.3 * i / 8, yl - 0.285 + 0.3 * (i + 1) / 8, za, zb]); } }
        const sgn = !r.core && r.sg > 0; if (sgn) { D.sign++; const ys0 = y0 + 0.8 * r.ground + 0.18; obsS.push([-hw + 0.1, hw - 0.1, ys0, ys0 + 0.95, 0.18, 0.52]); }
        const hit = (B, O = obs) => B.some((b) => O.some((o) => b[0] < o[1] - 0.003 && b[1] > o[0] + 0.003 && b[2] < o[3] - 0.003 && b[3] > o[2] + 0.003 && b[4] < o[5] - 0.003 && b[5] > o[4] + 0.003));
        if (aw && hit(oldR)) D.hitOld++; if (aw && hit([oldH])) D.hoodOld++; if (sgn && hit(oldR, obsS)) D.signOld++;
        let R2; let yd = yd0;
        if (aw || sgn) { D.rerouted++; const s = x >= 0 ? 1 : -1, xg = s * (hw + 0.15); let hr = yh0 + 0.42 + 0.13;
          if (aw) { const yl = aw.y - 0.45 * aw.out; const ybr = yl - 0.3 + (hz - 0.1 - 0.2) / (aw.out - 0.25) * 0.3 - 0.055; hr = Math.min(hr, ybr - 0.13); // run passes under the braces (brace height at the run's near edge, minus margin)
            if (hr - 0.11 - 0.42 < yh0) { yh0 = Math.max(y0 + 1.55, hr - 0.11 - 0.42); D.hoodLow++; } }
          R2 = [[x - 0.1, x + 0.1, yh0 + 0.42, hr + 0.1, hz - 0.1, hz + 0.1], [Math.min(x, xg) - 0.1, Math.max(x, xg) + 0.1, hr - 0.1, hr + 0.1, hz - 0.1, hz + 0.1],
            [xg - 0.1, xg + 0.1, hr - 0.1, yd, hz - 0.1, hz + 0.1], [xg - 0.1, xg + 0.1, yd - 0.1, yd + 0.1, 0.0, hz + 0.1]];
        } else { if (r.core) { const yc = y0 + r.ground - 0.25; if (yd > yc) { yd = yc; D.coreClamp++; } } // core: stay under the ground-floor canopy
          R2 = [[x - 0.11, x + 0.11, yh0 + 0.42, yd, hz - 0.11, hz + 0.11], [x - 0.11, x + 0.11, yd - 0.11, yd + 0.11, 0.23, 0.67]]; }
        for (const b of R2) Q('inox', ...b);
        if (aw && hit(R2)) D.hitNew++; if (sgn && hit(R2, obsS)) D.signNew++; if (aw && hit([[x - 0.675, x + 0.675, yh0, yh0 + 0.42, 0.25, 1.07]])) D.hoodNew++;
        P('hood', x, yh0, 0.66, 1.35, 0.42, 0.82); P('soot', x, yh0 - 0.03, 0.66, 1.2, 0.02, 0.7);
        claim(x - 0.65, x + 0.65, 1.1);
        const x2 = spot(0.8); if (x2 !== null) { P('srack', x2, y0, 0.55); for (const [yy, k] of [[0.45, 'meatS'], [0.8, 'vegS'], [1.15, 'meatS']]) { P('skew', x2, y0 + yy + 0.035, 0.55, 0.64, 1, 0.7); P(k, x2, y0 + yy + 0.035, 0.55, 0.64, 1, 0.7); } claim(x2 - 0.4, x2 + 0.4, 0.75); }
        else { const x3 = spot(0.4); if (x3 !== null) { const n = randi(2, 4); for (let i = 0; i < n; i++) P(stoolK(), x3, y0 + i * 0.075, 0.55, 1, 1, 1, rand(0, 6.28)); claim(x3 - 0.2, x3 + 0.2, 0.75); } } }
      stickers(randi(0, 2));
    } else if (type === 'paidang') { // 大排档: wide PVC strip curtain, string of red lanterns, round tables + drum stools
      if (open) { const ya = Math.max(ys + 0.35, vTop - 1.1); if (card('litY', wx0 + 0.05, wx1 - 0.05, ya, vTop)) { const rows = Math.max(2, Math.floor((vTop - ya) / 0.22));
        for (let i = 0; i < rows; i++) { const y = ya + (i + 0.6) * (vTop - ya) / (rows + 0.4); ink(wcx - ww * 0.1, y, ww * 0.55, 0.04); ink(wx1 - 0.22, y, 0.16, 0.04); } } }
      if (yb >= ytr) P('pstrip', 0, ytr - 0.02, 0.36, w - 0.15, ytr - y0 - 0.08, 1);
      { const yw = ytr + 0.5, zl = 0.78, xa = -hw + 0.2, xb = hw - 0.2; seg('steel', [xa, yw, zl], [xb, yw, zl], 0.012); for (const xx of [xa, xb]) seg('steel', [xx, yw, 0.25], [xx, yw, zl], 0.03);
        const n = Math.max(2, Math.floor((xb - xa) / 0.85)); for (let i = 0; i < n; i++) { const xx = xa + (i + 0.5) * (xb - xa) / n, yy = yw - 0.3 - (i % 2) * 0.05; P('lantern', xx, yy, zl, 0.28, 0.32, 0.28); P('lcap', xx, yy + 0.2, zl, 0.45, 0.45, 0.45); P('lcap', xx, yy - 0.2, zl, 0.4, 0.4, 0.4); } }
      let tabs = 0; for (let t = 0; t < 2; t++) { const x = spot(1.5); if (x === null) break; P('rtable', x, y0, 0.85); const n = randi(3, 4);
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3); const sx = x + Math.cos(a) * 0.62, sz = Math.min(1.25, Math.max(0.5, 0.85 + Math.sin(a) * 0.45)); P(rng() < 0.6 ? 'dstoolR' : 'dstoolB', sx, y0, sz); }
        claim(x - 0.8, x + 0.8, 1.32); tabs++; }
      if (!tabs) { const x = spot(0.4); if (x !== null) { const n = randi(3, 6); for (let i = 0; i < n; i++) P('dstoolR', x, y0 + i * 0.06, 0.55); claim(x - 0.22, x + 0.22, 0.75); } } // stacked drum stools
      stickers(randi(1, 3));
    } else if (type === 'netcafe') { // 网吧: glass door, a row of glowing monitors behind the window, chair backs, lit posters
      if (!r.core && Math.min(ytr, yb) - y0 > 0.6) P('glass', dcx, (y0 + Math.min(ytr, yb)) / 2, 0.25, dx1 - dx0 - 0.1, Math.min(ytr, yb) - y0 - 0.06, 0.015);
      if (Math.min(ytr, yb) - y0 > 1.4) P('litCy', left ? dx1 - 0.12 : dx0 + 0.12, y0 + 1.1, gz + 0.03, 0.03, 0.6, 0.03); // lit door pull
      if (open && vTop > ys + 1.15 && card('board', wx0, wx1, ys + 0.05, vTop)) { const n = Math.max(1, Math.floor(ww / 0.55)); const ysc = ys + 0.98;
        ink(wcx, ys + 0.6, ww, 0.05); // desk edge
        for (let i = 0; i < n; i++) { const x = wx0 + (i + 0.5) * ww / n; P('frame', x, ysc, 0.128, 0.46, 0.29, 0.006); P(rng() < 0.7 ? 'scrB' : 'scrP', x, ysc, 0.135, 0.42, 0.25, 0.008);
          P(rng() < 0.75 ? 'chair' : 'chairR', x + rand(-0.06, 0.06), ys + 0.62, 0.17, 0.36, 0.62, 0.03); }
        if (vTop - ys > 1.6) P('litCy', wcx, vTop - 0.08, 0.135, ww, 0.03, 0.01); } // ceiling light strip
      for (let i = 0; i < 2; i++) { const x = left ? dx1 + 0.35 + i * 0.5 : dx0 - 0.35 - i * 0.5; if (Math.abs(x) > hw - 0.25) continue; const yp = ys + 1.0; if (yp + 0.32 > vTop) continue;
        P(pick(['litM', 'litCy', 'litY']), x, yp, gz, 0.42, 0.6, 0.006); ink(x, yp + 0.16, 0.32, 0.06); ink(x, yp - 0.18, 0.26, 0.03); } // posters
      const x = spot(0.6); if (x !== null) { P('frame', x, y0 + 0.5, 0.72, 0.56, 1.0, 0.08); P(rng() < 0.5 ? 'litM' : 'litCy', x, y0 + 0.55, 0.765, 0.46, 0.78, 0.01); claim(x - 0.3, x + 0.3, 0.85); } // A-board
      stickers(randi(1, 3));
    } else { // clinic
      if (open) { const k = rng() < 0.5 ? 'litM' : 'litCy'; if (card(k, wx0, wx1, ys + 0.05, vTop)) { const n = Math.max(1, Math.floor(ww / 0.7)); for (let i = 0; i < n; i++) { const x = wx0 + (i + 0.5) * ww / n; // limb / spine diagrams
        seg('ink', [x, ys + 0.3, 0.135], [x + 0.08, ys + 1.0, 0.135], 0.05, 0.006); seg('ink', [x + 0.08, ys + 1.0, 0.135], [x - 0.04, ys + 1.5, 0.135], 0.05, 0.006); for (let y = ys + 0.35; y < ys + 1.45; y += 0.18) ink(x + 0.02, y, 0.16, 0.02); } } }
      if (rng() < 0.5) strip(); stickers(randi(0, 2));
    }
    // b_signsync: outside groups still overlapping existing sidewalk items (0 unless ?shopnoavoid)
    this.stats.swItems += sw.length; this.stats.outGroups += groups.length;
    for (const gp of groups) if (sw.some((b) => gp[1] > b[0] + 0.1 && gp[0] < b[1] - 0.1 && gp[2] > b[2] && 0.3 < b[3])) this.stats.outOverlap++;
    // ---- one collider for the outside clutter (oriented with the facade)
    if (out.x1 > out.x0 && this.city.col && this.city.col.addOBB) { const zc = (0.3 + out.z) / 2; const c = new THREE.Vector3((out.x0 + out.x1) / 2, 0, zc).applyMatrix4(BM); const u = new THREE.Vector3(1, 0, 0).transformDirection(BM);
      this.city.col.addOBB(c.x, c.z, u.x, u.z, (out.x1 - out.x0) / 2, (out.z - 0.3) / 2, y0 + 1.0, 'shop'); this.stats.colliders++; shop.col = { x: c.x, z: c.z, hl: (out.x1 - out.x0) / 2, hw: (out.z - 0.3) / 2 }; }
    const c0 = new THREE.Vector3(0, 0, 0).applyMatrix4(BM); shop.cx = c0.x; shop.cz = c0.z;
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(BM), al = new THREE.Vector3(1, 0, 0).transformDirection(BM); shop.n = [fwd.x, fwd.z]; shop.u = [al.x, al.z]; shop.w = w; shop.shut = yb < yt - 0.1;
    return shop;
  }
  // ---------------------------------------------------------------- packing ----
  // one shop -> baked world-space triangles per bucket (positions, normals, colours), made when the shop is first packed
  bakeShop(s) {
    let b = this.bake.get(s); if (b) return b; const G = geos(); const nv = [0, 0];
    for (const k in s.inst) nv[KC[k].b] += G[KC[k].g].attributes.position.count * (s.inst[k].length / 16);
    b = nv.map((n) => ({ n, p: new Float32Array(n * 3), q: new Float32Array(n * 3), c: new Float32Array(n * 3) })); const o = [0, 0];
    for (const k in s.inst) { const kc = KC[k]; const B = b[kc.b]; const g = G[kc.g]; const P = g.attributes.position.array, N = g.attributes.normal.array, nvk = P.length / 3; const L = s.inst[k];
      for (let j = 0; j < L.length; j += 16) { _m.fromArray(L, j); _nm.getNormalMatrix(_m); let w = o[kc.b] * 3;
        for (let i = 0; i < nvk; i++, w += 3) { _v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(_m); B.p[w] = _v.x; B.p[w + 1] = _v.y; B.p[w + 2] = _v.z;
          _n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(_nm).normalize(); B.q[w] = _n.x; B.q[w + 1] = _n.y; B.q[w + 2] = _n.z; B.c[w] = kc.c[0]; B.c[w + 1] = kc.c[1]; B.c[w + 2] = kc.c[2]; }
        o[kc.b] += nvk; } }
    this.bake.set(s, b); this.stats.bakes++; return b;
  }
  mesh(i, n) {
    let m = this.meshes[i]; if (m && this.cap[i] >= n) return m;
    const cap = Math.max(4096, 1 << Math.ceil(Math.log2(Math.max(1, n)))); this.cap[i] = cap;
    const g = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'color']) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    if (m) { m.geometry.dispose(); m.geometry = g; return m; }
    m = new THREE.Mesh(g, this.mats[BUCK[i]] || this.mats.vcol); m.castShadow = false; m.receiveShadow = true; m.name = 'shop|' + BUCK[i]; m.visible = false;
    // b_corner: the clutter mesh stays out of the half-res mirror pass (water / wet street reflection: its camera is not the game
    // camera) — renderBufferDirect reads drawRange after onBeforeRender, so count 0 skips that draw; lit faces still reflect
    if (i === 0) { const nv = this.nv; m.onBeforeRender = (r, sc, cam, geo) => { const G = globalThis.__G; geo.drawRange.count = !G || !G.camera || cam === G.camera ? nv[0] : 0; }; }
    this.group.add(m); this.meshes[i] = m; return m;
  }
  repack(cam) {
    const p = cam.position; const st = this.stream; const cand = [];
    for (const ch of this.chunks.values()) { if (!ch.core) { const c = st && st.chunks.get(ch.key); if (!c || !c.near) continue; }
      for (const s of ch.shops) { const d = Math.hypot(s.cx - p.x, s.cz - p.z) + Math.max(0, p.y - 12) * 1.2; if (d < RMAX) cand.push([d, s]); } }
    cand.sort((a, b) => a[0] - b[0]);
    let tris = 0, n = 0, inst = 0; const sel = [];
    let cost = 0; for (const [, s] of cand) { const c = s.cost + s.uniq.length * 6; if (cost + c > BUDGET) continue; cost += c; tris += s.tris; n++; sel.push(s); for (const k in s.inst) inst += s.inst[k].length / 16; }
    const bakes = sel.map((s) => this.bakeShop(s));
    // bounding sphere of the packed shops (one merged mesh per bucket, frustum-culled as a whole)
    let cx = 0, cz = 0; for (const s of sel) { cx += s.cx; cz += s.cz; } if (sel.length) { cx /= sel.length; cz /= sel.length; }
    let rad = 1; for (const s of sel) rad = Math.max(rad, Math.hypot(s.cx - cx, s.cz - cz) + s.w / 2 + 3);
    for (let i = 0; i < 2; i++) { const nv = bakes.reduce((a, b) => a + b[i].n, 0); if (!nv) { if (this.meshes[i]) this.meshes[i].visible = false; continue; }
      const m = this.mesh(i, nv); const A = m.geometry.attributes; let o = 0;
      for (const b of bakes) { const B = b[i]; if (!B.n) continue; A.position.array.set(B.p, o * 3); A.normal.array.set(B.q, o * 3); A.color.array.set(B.c, o * 3); o += B.n; }
      for (const a of ['position', 'normal', 'color']) { A[a].clearUpdateRanges(); A[a].addUpdateRange(0, nv * 3); A[a].needsUpdate = true; }
      m.geometry.setDrawRange(0, nv); this.nv[i] = nv; m.geometry.boundingSphere.center.set(cx, 5, cz); m.geometry.boundingSphere.radius = rad + 5; m.visible = true; }
    // keep the bakes of the packed shops plus a few recent ones (walking back and forth), drop the rest
    if (this.bake.size > sel.length + 48) { const keep = new Set(sel); for (const k of this.bake.keys()) { if (this.bake.size <= sel.length + 24) break; if (!keep.has(k)) this.bake.delete(k); } }
    this.stats.packed = n; this.stats.tris = tris; this.stats.frameCost = cost; this.stats.inst = inst;
    const key = sel.map((s) => s.cx.toFixed(1) + ':' + s.cz.toFixed(1)).join('|'); if (key !== this.uKey) { this.uKey = key; this.buildUniq(sel); }
  }
  buildUniq(sel) {
    for (const m of this.world) { this.group.remove(m); m.geometry.dispose(); } this.world = []; this.stats.faces = 0; if (!sel.length) return;
    const W = new World(1e7); W.attrs = {};
    for (const s of sel) for (const u of s.uniq) { cnFace(W, u.k, u.x, u.y, u.z, u.ry, u.w, u.h, 1); this.stats.faces++; }
    this.world = W.build(this.group, this.mats, { cnsign: { cast: false } });
  }
  sync(cam) {
    if (!cam) return; this.frame++; if (!this.coreDone) this.planCore();
    const p = cam.position; const L = this.last; const st = this.stream; let on = 0;
    if (st) for (const ch of this.chunks.values()) { const c = st.chunks.get(ch.key); if (c && c.near) on++; }
    const moved = !L || Math.hypot(p.x - L.x, p.z - L.z) > 8 || Math.abs(p.y - L.y) > 6;
    if (this.dirty || on !== (L && L.on) || (moved && this.frame - (L ? L.f : -99) > 8)) { this.dirty = false; this.repack(cam); this.last = { x: p.x, y: p.y, z: p.z, on, f: this.frame }; }
  }
  tris() { let n = 0; for (const m of this.meshes) if (m && m.visible) n += m.geometry.drawRange.count / 3; for (const m of this.world) n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3; return Math.round(n); }
  calls() { let n = 0; for (const m of this.meshes) if (m && m.visible) n++; return n + this.world.length; }
  // test helper: all planned shops (world centre at the facade, outward normal, along-facade axis)
  list() { const o = []; for (const ch of this.chunks.values()) for (const s of ch.shops) o.push(s); return o; }
}
