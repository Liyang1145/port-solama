// a_beach2 (map 索拉纳港 only): beach small props on the natural island ends — umbrella + chaise-lounge sets (rental rows,
// denser around each extended-beach lifeguard tower, sparse private sets elsewhere), beach towels, surfboard racks, beach
// trash barrels and a few cold-drink carts. All original procedural geometry.
// Everything is GPU-instanced (THREE.InstancedMesh, one per part x colour) and drawn with materials that share the existing
// palm-crown program ('pcrown' from veg.js: plain MeshStandardMaterial + foliagePatch(0), instanced, no vertex / instance
// colours), so colour comes from the material uniform and no new shader program is compiled.
// Instances are streamed by camera distance (near / far geometry, refilled when the camera moves > 10 m).
// Placement uses its own random stream (mulberry 7313); keeps clear of the dune-fence openings (access lanes), the tower /
// ramp / shower footprints, palms, and stays >= ~24 m from the waterline (bu <= 53 m; waterline at bu ~ 77 m).
import * as THREE from 'three';
import { mulberry } from '../../util.js';
import { prep } from '../../mats.js';
import { foliagePatch } from '../../veg.js';
import { beachOff } from './mapgeo.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MX = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(sx, sy, sz));
const P = (g, m) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.applyMatrix4(m); return g; };
const BX = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.BoxGeometry(w, h, d), MX(x, y, z, rx, ry, rz));
const CY = (r0, r1, h, n, x, y, z, rx = 0, ry = 0, rz = 0, open = false) => P(new THREE.CylinderGeometry(r0, r1, h, n, 1, open), MX(x, y, z, rx, ry, rz));
function beam(a, b, w, h) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  return P(new THREE.BoxGeometry(w, len, h), new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1)));
}
// merge non-indexed position+normal geometries; adds the aSway attribute (0) the shared program declares
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.computeBoundingSphere(); return g;
}
// umbrella canopy: octagonal, drooping ribs; even / odd panels as separate geometries (two-tone stripes), top + underside + valance
function canopy(R, H, y0, odd, seg = 8, under = true) {
  const pos = [];
  const rim = (k) => { const a = (k / seg) * Math.PI * 2; return [Math.cos(a) * R, y0, Math.sin(a) * R]; };
  const mid = (k, t) => { const a = (k / seg) * Math.PI * 2; const r = R * t; return [Math.cos(a) * r, y0 + H * (1 - t) + 0.06 * Math.sin(t * Math.PI), Math.sin(a) * r]; };
  for (let k = 0; k < seg; k++) { if ((k % 2 === 1) !== odd) continue; const T = [0, y0 + H, 0];
    const a0 = mid(k, 0.55), a1 = mid(k + 1, 0.55), b0 = rim(k), b1 = rim(k + 1);
    pos.push(...T, ...a1, ...a0, ...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    if (under) { const d = (p) => [p[0], p[1] - 0.02, p[2]]; pos.push(...d(T), ...d(a0), ...d(a1), ...d(a0), ...d(b1), ...d(a1), ...d(a0), ...d(b0), ...d(b1)); }
    const v0 = [b0[0], y0 - 0.16, b0[2]], v1 = [b1[0], y0 - 0.16, b1[2]]; // valance flap (both faces)
    pos.push(...b0, ...b1, ...v1, ...b0, ...v1, ...v0, ...b0, ...v1, ...b1, ...b0, ...v0, ...v1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------------------------------------ part geometries ----
// local frame: +x = seaward. Each kind -> list of parts { geo near, geo far|null, colour slot }
function geos() {
  const G = {};
  // umbrella (pole leans a touch seaward-south in the instance matrix); canopy radius 1.25 m, rim at 2.05 m
  G.umbA = { near: merge([canopy(1.25, 0.42, 2.05, false)]), far: merge([canopy(1.25, 0.42, 2.05, false, 8, false), canopy(1.25, 0.42, 2.05, true, 8, false)]) }; // far: whole canopy, colour A
  G.umbB = { near: merge([canopy(1.25, 0.42, 2.05, true)]), far: null };
  G.pole = { near: merge([CY(0.024, 0.028, 2.5, 6, 0, 1.18, 0, 0, 0, 0, true), CY(0.035, 0.035, 0.12, 6, 0, 1.6, 0), CY(0.0, 0.04, 0.1, 6, 0, 2.52, 0)]), far: null };
  // chaise lounge, 0.66 x 1.95 m, foot towards +x (sea), backrest raised at -x; frame (aluminium) + bed (fabric/slats, colour)
  { const fr = []; for (const z of [-0.31, 0.31]) { fr.push(BX(1.42, 0.035, 0.035, 0.18, 0.32, z)); fr.push(beam(V3(-0.52, 0.33, z), V3(-0.95, 0.88, z), 0.035, 0.035));
      for (const x of [-0.45, 0.82]) fr.push(BX(0.035, 0.32, 0.035, x, 0.16, z)); }
    fr.push(BX(0.035, 0.035, 0.62, 0.86, 0.32, 0)); fr.push(CY(0.05, 0.05, 0.04, 8, 0.86, 0.06, -0.3, Math.PI / 2)); fr.push(CY(0.05, 0.05, 0.04, 8, 0.86, 0.06, 0.3, Math.PI / 2));
    G.frame = { near: merge(fr), far: null };
    const bed = [BX(1.36, 0.045, 0.6, 0.18, 0.355, 0), beam(V3(-0.5, 0.37, 0), V3(-0.93, 0.92, 0), 0.04, 0.6)];
    for (let k = 0; k < 6; k++) bed.push(BX(0.03, 0.012, 0.6, -0.3 + k * 0.22, 0.383, 0)); // slat ridges (read as cushion piping)
    G.bed = { near: merge(bed), far: merge([BX(1.36, 0.06, 0.6, 0.18, 0.34, 0), beam(V3(-0.5, 0.36, 0), V3(-0.93, 0.9, 0), 0.05, 0.6)]) }; }
  // folded towel draped over the lounger foot / backrest (thin), and a flat beach towel on the sand (+ stripe)
  G.towelL = { near: merge([BX(0.5, 0.02, 0.62, 0.62, 0.395, 0), BX(0.6, 0.02, 0.5, -0.74, 0.68, 0, 0, 0, 0.9)]), far: null };
  G.towel = { near: merge([BX(0.9, 0.012, 1.75, 0, 0.012, 0)]), far: null };
  G.stripe = { near: merge([BX(0.92, 0.014, 0.16, 0, 0.016, -0.55), BX(0.92, 0.014, 0.16, 0, 0.016, 0.55)]), far: null };
  G.bag = { near: merge([BX(0.42, 0.3, 0.16, 0, 0.15, 0, 0, 0, 0.12), beam(V3(-0.15, 0.3, 0), V3(0, 0.45, 0), 0.02, 0.02), beam(V3(0.15, 0.3, 0), V3(0, 0.45, 0), 0.02, 0.02)]), far: null };
  // surfboard rack: timber A-frame, 2.2 m long, boards stand nose-up leaning into it (boards are separate colour parts)
  { const w = []; for (const z of [-1.05, 1.05]) { w.push(beam(V3(-0.55, 0, z), V3(0, 1.55, z), 0.09, 0.09)); w.push(beam(V3(0.55, 0, z), V3(0, 1.55, z), 0.09, 0.09)); w.push(BX(1.1, 0.07, 0.07, 0, 0.35, z)); }
    w.push(BX(0.1, 0.1, 2.3, 0, 1.55, 0)); w.push(BX(0.08, 0.08, 2.2, -0.42, 0.35, 0)); w.push(BX(0.08, 0.08, 2.2, 0.42, 0.35, 0));
    w.push(BX(0.5, 0.6, 0.03, 0, 1.1, -1.06)); // rental sign board
    G.rack = { near: merge(w), far: merge([beam(V3(-0.55, 0, 0), V3(0, 1.55, 0), 0.12, 2.2), beam(V3(0.55, 0, 0), V3(0, 1.55, 0), 0.12, 2.2)]) }; }
  { // board: 2.1 m, lens-shaped plan (lathe of a flattened ellipse), rocker; leaning 16 deg against the rack ridge
    const lat = new THREE.SphereGeometry(1, 10, 6); lat.scale(0.28, 1.05, 0.04); const b = P(lat, MX(0, 0, 0)); const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + 0.05 * (y / 1.05) * (y / 1.05)); } b.computeVertexNormals();
    G.boardGeo = merge([b]); }
  // trash barrel (painted drum, band, lid) on a small sand-anchored base
  G.drum = { near: merge([CY(0.3, 0.29, 0.92, 12, 0, 0.5, 0), CY(0.31, 0.31, 0.06, 12, 0, 0.62, 0, 0, 0, 0, true), CY(0.31, 0.31, 0.06, 12, 0, 0.82, 0, 0, 0, 0, true)]), far: merge([CY(0.3, 0.29, 0.92, 6, 0, 0.5, 0)]) };
  G.lid = { near: merge([CY(0.27, 0.33, 0.1, 12, 0, 1.01, 0), CY(0.12, 0.27, 0.08, 12, 0, 1.1, 0), BX(0.36, 0.05, 0.36, 0, 0.03, 0)]), far: merge([CY(0.27, 0.33, 0.12, 6, 0, 1.01, 0)]) };
  // cold-drink cart: insulated box body on two wheels, push bar, small canopy on a post, cooler lid
  { const body = [BX(1.3, 0.75, 0.72, 0, 0.72, 0), BX(1.34, 0.08, 0.76, 0, 1.12, 0)];
    body.push(BX(1.2, 0.05, 0.66, 0, 1.18, 0), BX(0.3, 0.03, 0.05, 0.1, 1.22, 0), BX(0.9, 0.04, 0.012, 0, 0.62, 0.367), BX(0.9, 0.04, 0.012, 0, 0.94, 0.367), BX(0.9, 0.04, 0.012, 0, 0.62, -0.367), BX(0.9, 0.04, 0.012, 0, 0.94, -0.367));
    G.cartBody = { near: merge(body), far: merge([BX(1.3, 0.85, 0.72, 0, 0.75, 0)]) };
    const st = [beam(V3(-0.8, 0.95, -0.3), V3(-0.62, 0.95, -0.3), 0.03, 0.03), beam(V3(-0.8, 0.95, 0.3), V3(-0.62, 0.95, 0.3), 0.03, 0.03), BX(0.03, 0.03, 0.66, -0.8, 0.95, 0),
      CY(0.025, 0.025, 1.3, 6, 0.5, 1.8, 0.26), BX(0.06, 0.36, 0.06, -0.55, 0.18, -0.25), BX(0.06, 0.36, 0.06, -0.55, 0.18, 0.25), BX(0.04, 0.04, 0.9, 0.35, 0.3, 0)];
    st.push(CY(0.3, 0.3, 0.07, 14, 0.35, 0.3, -0.42, Math.PI / 2), CY(0.3, 0.3, 0.07, 14, 0.35, 0.3, 0.42, Math.PI / 2));
    G.cartMetal = { near: merge(st), far: null };
    G.cartTop = { near: merge([canopy(0.95, 0.3, 2.35, false, 6), canopy(0.95, 0.3, 2.35, true, 6)].map((g) => { g.translate(0.5, 0, 0.26); return g; })), far: null };
  }
  return G;
}
const triOf = (g) => (g ? g.attributes.position.count / 3 : 0);

export function buildBeachProps(scene, city, kit) {
  const r = mulberry(7313); const G = geos(); const umb = city.deco.umbrellas || [], palms = city.palms || [];
  // shared-program materials: same key + same parameters as the palm-crown material (pcrown) -> no new program
  const MATS = new Map();
  const mat = (c, rough = 0.85, metal = 0.0) => { const k = c.join(',') + '|' + rough + '|' + metal; let m = MATS.get(k);
    if (!m) { m = prep(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), roughness: rough, metalness: metal }), 'pcrown', (s) => foliagePatch(s, 0.0)); m.shadowSide = THREE.DoubleSide; MATS.set(k, m); } return m; };
  const kinds = new Map(); // key -> { near geo, far geo, mat, list:[[matrix,x,z]], rn, rf, shadow }
  const put = (key, part, m4, x, z, c, rough, metal, rn, rf, shadow = true) => { let k = kinds.get(key);
    if (!k) kinds.set(key, k = { near: part.near || part, far: part.far === undefined ? null : part.far, mat: mat(c, rough, metal), list: [], rn, rf, shadow });
    k.list.push([m4, x, z]); };
  const openings = kit.openings || [], towers = kit.towers || [];
  const laneClear = (z, pad) => { for (const o of openings) if (Math.abs(z - o.z) < o.hw + pad) return false; return true; };
  const clear = (x, z, rr) => { for (const u of umb) if (Math.abs(u.x - x) < rr + 1.4 && Math.abs(u.z - z) < rr + 1.4) return false;
    for (const p of palms) if (Math.abs(p.x - x) < rr + 1.2 && Math.abs(p.z - z) < rr + 1.2) return false;
    for (const t of towers) if (Math.abs(t.x - x) < rr + 10 && Math.abs(t.z - z) < rr + 4.5) return false; // hut + back ramp (~8.5 m landward)
    for (const s of kit.showers || []) if (Math.hypot(s[0] - x, s[1] - z) < rr + 2.2) return false;
    return true; };
  const occ = []; const free = (x, z, rr) => { for (const o of occ) if (Math.hypot(o[0] - x, o[1] - z) < o[2] + rr) return false; return true; };
  const take = (x, z, rr) => occ.push([x, z, rr]);
  const gy = (x, z) => city.groundH(x, z);
  // small fixed palettes: every (part, colour) is one draw call, so colours are shared across all sets
  const WHITE = [0.94, 0.94, 0.92], ALU = [0.78, 0.79, 0.8], WOOD = [0.55, 0.42, 0.3], DARK = [0.16, 0.17, 0.18];
  const NAVY = [0.12, 0.3, 0.6], ORNG = [0.95, 0.5, 0.18], TEAL = [0.1, 0.55, 0.55], CORAL = [0.9, 0.32, 0.38];
  const CANOPY = [NAVY, ORNG, TEAL, CORAL], BEDC = [WHITE, NAVY, CORAL];
  const TOWEL = [[0.92, 0.2, 0.25], [0.18, 0.5, 0.85], [0.98, 0.82, 0.2], [0.2, 0.7, 0.55]], TOWEL_L = [WHITE, [0.18, 0.5, 0.85]];
  const stats = { sets: 0, loungers: 0, towels: 0, racks: 0, boards: 0, bins: 0, carts: 0 };
  // one umbrella + two chaise lounges (+ towels / bag); pal = [canopyA, canopyB, bed]
  const set = (x, z, pal, rot, dense) => {
    const y = gy(x, z); const tilt = (r() - 0.5) * 0.1;
    const mu = MX(x, y, z, 0, r() * 6.28, tilt, 1, 1, 1);
    put('umbA' + pal[0], G.umbA, mu, x, z, pal[0], 0.8, 0, 120, 320); put('umbB' + pal[1], G.umbB, mu, x, z, pal[1], 0.8, 0, 120, 320);
    put('pole', G.pole, mu, x, z, WHITE, 0.4, 0.3, 120, 0, true);
    const nL = dense || r() < 0.75 ? 2 : 1;
    for (let k = 0; k < nL; k++) { const lz = z + (k ? 0.48 : -0.48) * (nL === 2 ? 1 : 0) + (nL === 1 ? 0.3 : 0), lx = x - 0.55 + (r() - 0.5) * 0.25; const ly = gy(lx, lz);
      const ml = MX(lx, ly, lz, 0, rot + (r() - 0.5) * 0.16, 0); put('frame', G.frame, ml, lx, lz, ALU, 0.35, 0.6, 110, 0);
      put('bed' + pal[2], G.bed, ml, lx, lz, pal[2], 0.9, 0, 110, 260); stats.loungers++;
      if (r() < 0.45) { const tc = TOWEL_L[Math.floor(r() * TOWEL_L.length)]; put('towL' + tc, G.towelL, ml, lx, lz, tc, 0.95, 0, 90, 0, false); stats.towels++; } }
    if (r() < 0.35) { const bx = x + 0.9 + r() * 0.6, bz = z + (r() - 0.5) * 1.6; put('bag', G.bag, MX(bx, gy(bx, bz), bz, 0, r() * 6.28, 0), bx, bz, [0.85, 0.75, 0.55], 0.9, 0, 70, 0, false); }
    stats.sets++; };
  const towelAt = (x, z) => { const y = gy(x, z) + 0.005; const ry = (r() - 0.5) * 0.7 + (r() < 0.5 ? 0 : Math.PI / 2) * 0.15; const m = MX(x, y, z, 0, ry, 0);
    const c = TOWEL[Math.floor(r() * TOWEL.length)]; put('tow' + c, G.towel, m, x, z, c, 0.95, 0, 140, 0, false);
    if (r() < 0.6) put('str', G.stripe, m, x, z, WHITE, 0.95, 0, 90, 0, false); stats.towels++; };
  // 1) rental rows around each extended-beach tower: 4 rows (bu 23..41), sets every ~4.6 m along the shore, density falls off with distance
  const RENT = [[NAVY, WHITE, NAVY], [ORNG, WHITE, WHITE], [TEAL, TEAL, WHITE], [CORAL, WHITE, CORAL]]; // one vendor colour per tower
  towers.slice(4).forEach((t, ti) => { const pal = RENT[ti % RENT.length];
    for (let row = 0; row < 4; row++) { const bu = 23 + row * 6;
      for (let dz = -62; dz <= 62; dz += 4.6) { const z = t.z + dz + (row % 2) * 2.3; const ad = Math.abs(dz);
        if (ad < 13) continue; const p = ad < 30 ? 0.95 : 0.95 - (ad - 30) / 32 * 0.6; if (r() > p) continue;
        const x = 335 + beachOff(z) + bu + (r() - 0.5) * 0.6;
        if (!laneClear(z, 2.6) || !clear(x, z, 1.4) || !free(x, z, 1.5)) continue; take(x, z, 1.5); set(x, z, pal, 0, true); } }
    // towels scattered in front of the rows (towards the water, still on dry sand)
    for (let k = 0; k < 14; k++) { const z = t.z + (r() - 0.5) * 110, x = 335 + beachOff(z) + 46 + r() * 7; if (Math.abs(z - t.z) < 8 || !laneClear(z, 1.6) || !clear(x, z, 1.0) || !free(x, z, 1.0)) continue; take(x, z, 1.0); towelAt(x, z); }
  });
  // 2) sparse private sets + towels along the rest of the natural beach (|z| 420..1360)
  for (const sg of [-1, 1]) for (let a = 425; a < 1360; a += 9 + r() * 16) { const z = sg * a; const bu = 18 + Math.pow(r(), 1.3) * 32; const x = 335 + beachOff(z) + bu;
    if (!laneClear(z, 2.2) || !clear(x, z, 1.3) || !free(x, z, 1.6)) continue; take(x, z, 1.6);
    if (r() < 0.55) { const ca = CANOPY[Math.floor(r() * CANOPY.length)]; set(x, z, [ca, ca === TEAL && r() < 0.5 ? TEAL : WHITE, BEDC[Math.floor(r() * BEDC.length)]], (r() - 0.5) * 0.5, false); }
    else { towelAt(x, z); if (r() < 0.5) { const z2 = z + 1.1, x2 = x + (r() - 0.5) * 0.5; if (laneClear(z2, 1.6)) towelAt(x2, z2); } } }
  // 3) at access openings: a trash barrel beside the lane on the sea side of the fence; surfboard racks at the tower
  //    openings and some path openings; cold-drink carts at a few openings (kept >= 2.6 m off the lane centre line)
  const BINC = [0.12, 0.42, 0.62];
  const BOARD = [WHITE, ORNG, [0.2, 0.62, 0.8], [0.98, 0.82, 0.3]];
  let cartN = 0;
  openings.forEach((o, oi) => { const s = o.sg, lane = o.hw + 0.35;
    const bxz = o.z + s * (lane + 1.0), bx = o.x + 3.2; if (clear(bx, bxz, 0.4) && free(bx, bxz, 0.5)) { take(bx, bxz, 0.6); const m = MX(bx, gy(bx, bxz), bxz, 0, r() * 6.28, 0);
      put('drum', G.drum, m, bx, bxz, BINC, 0.55, 0, 120, 260); put('lid', G.lid, m, bx, bxz, DARK, 0.6, 0, 120, 0);
      city.col.add(bx - 0.32, bxz - 0.32, bx + 0.32, bxz + 0.32, gy(bx, bxz) + 1.1, 'bin'); stats.bins++; }
    if (o.kind === 'tower' || (o.kind === 'path' && oi % 3 === 1)) { const rz = o.z - s * (lane + (o.kind === 'tower' ? 0.8 : 1.4)), rx = o.x + 7.5 + r() * 2;
      if (laneClear(rz, 0.9) && clear(rx, rz, 1.2) && free(rx, rz, 1.4)) { take(rx, rz, 1.5); const yr = gy(rx, rz); const ry = (r() - 0.5) * 0.2; const mr = MX(rx, yr, rz, 0, ry, 0);
        put('rack', G.rack, mr, rx, rz, WOOD, 0.85, 0, 130, 300);
        const n = 3 + Math.floor(r() * 3); for (let k = 0; k < n; k++) { const side = k % 2 ? 1 : -1; const lz = -0.75 + k * (1.5 / Math.max(1, n - 1));
          const mb = mr.clone().multiply(MX(side * 0.34, 1.02, lz, 0, Math.PI / 2, side * 0.2)); const c = BOARD[Math.floor(r() * BOARD.length)];
          put('board' + c, { near: G.boardGeo, far: null }, mb, rx, rz, c, 0.3, 0, 130, 0); stats.boards++; }
        const c2 = Math.cos(ry), s2 = -Math.sin(ry); city.col.addOBB(rx, rz, c2, s2, 0.62, 1.15, yr + 1.6, 'rack'); stats.racks++; } }
    if ((o.kind === 'tower' || oi % 4 === 2) && cartN < 6) { const cz = o.z + s * (lane + 2.4), cx = o.x + 14 + r() * 4;
      if (laneClear(cz, 1.0) && clear(cx, cz, 1.0) && free(cx, cz, 1.3)) { take(cx, cz, 1.3); const yc = gy(cx, cz); const ry = Math.PI / 2 * (s > 0 ? -1 : 1) + (r() - 0.5) * 0.3; const m = MX(cx, yc, cz, 0, ry, 0);
        put('cartBody', G.cartBody, m, cx, cz, WHITE, 0.45, 0, 140, 320); put('cartMetal', G.cartMetal, m, cx, cz, DARK, 0.5, 0.3, 120, 0);
        put('cartTop', { near: G.cartTop.near, far: null }, m, cx, cz, [0.98, 0.82, 0.25], 0.8, 0, 140, 0);
        const c2 = Math.cos(ry), s2 = -Math.sin(ry); city.col.addOBB(cx, cz, c2, s2, 0.85, 0.48, yc + 1.2, 'cart'); stats.carts++; cartN++; } }
  });
  // ---- instanced meshes (near + far per kind), streamed by camera distance
  // shadow depth: RGBA-packed, double-sided, no map: the same instanced depth-program variant the vegetation already compiles
  // (a default front-side caster would add one more instanced depth variant). Shadows sample the depth buffer, so packing is moot.
  const DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const meshes = [];
  for (const [key, k] of kinds) { const n = k.list.length;
    const mk = (geo, cast) => { const im = new THREE.InstancedMesh(geo, k.mat, n); im.castShadow = cast; if (cast) im.customDepthMaterial = DEPTH; im.receiveShadow = true; im.count = 0; im.visible = false; im.matrixAutoUpdate = false; scene.add(im); meshes.push(im); return im; };
    k.nm = mk(k.near, k.shadow); k.fm = k.far && k.rf > k.rn ? mk(k.far, false) : null; k.key = key; }
  let lx = 1e9, lz = 1e9; const sph = new THREE.Sphere(), bb = new THREE.Box3(), tv = new THREE.Vector3();
  const fit = (im, pts) => { bb.makeEmpty(); for (const p of pts) bb.expandByPoint(tv.set(p[1], 1, p[2])); bb.getBoundingSphere(sph); sph.radius += 3; im.boundingSphere = sph.clone(); };
  function update(cam, force) {
    const cx = cam.position.x, cz = cam.position.z; if (!force && Math.hypot(cx - lx, cz - lz) < 10) return; lx = cx; lz = cz;
    for (const k of kinds.values()) { let nn = 0, nf = 0; const pn = [], pf = []; const rn2 = k.rn * k.rn, rf2 = k.rf * k.rf;
      for (const e of k.list) { const d = (e[1] - cx) ** 2 + (e[2] - cz) ** 2;
        if (d < rn2) { k.nm.setMatrixAt(nn++, e[0]); pn.push(e); } else if (k.fm && d < rf2) { k.fm.setMatrixAt(nf++, e[0]); pf.push(e); } }
      k.nm.count = nn; k.nm.visible = nn > 0; if (nn) { k.nm.instanceMatrix.needsUpdate = true; fit(k.nm, pn); }
      if (k.fm) { k.fm.count = nf; k.fm.visible = nf > 0; if (nf) { k.fm.instanceMatrix.needsUpdate = true; fit(k.fm, pf); } } }
  }
  // visible draw calls / triangles (before frustum culling) at the current streaming state
  function info() { let calls = 0, tris = 0, inst = 0; for (const k of kinds.values()) { if (k.nm.count) { calls++; tris += k.nm.count * triOf(k.near); inst += k.nm.count; } if (k.fm && k.fm.count) { calls++; tris += k.fm.count * triOf(k.far); inst += k.fm.count; } } return { calls, tris, inst }; }
  let total = 0; for (const k of kinds.values()) total += k.list.length;
  update({ position: { x: 280, z: 30 } }, true);
  return { update, info, stats, kinds: kinds.size, materials: MATS.size, instances: total, meshes };
}
