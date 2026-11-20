// v4.4 streaming (MAP_DESIGN.md §流式架构). The world outside the hand-built Deco district is cut into 160 m chunks.
//  * far: every parcel is a plain extruded box with the facade shader (window grid, night lights), merged per chunk —
//    a few hundred triangles per block, always resident, so the whole map reads from the air and across the bay.
//  * near (≤ LOAD m from the camera): the chunk's parcels are rebuilt with the same generators as the Deco district
//    (relief piers / spandrels, sills, balconies, shopfronts, roof clutter, condo slabs, Deco eyebrows) into their own
//    meshes; the chunk's far boxes hide. Beyond UNLOAD m the near meshes are disposed (GPU + JS freed).
//  * every chunk is built under its own seed (util.withSeed) so it rebuilds identically after being unloaded.
//  * colliders come from the parcel footprints at startup (city.js obbCollider), so physics never depends on what is loaded.
import * as THREE from 'three';
import { World, box, polyCap, prismWalls, rect } from '../../geo.js';
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { volume, decoHotel, midrise, condoSlabs, rooftop, downtownBlock, balconies } from './city.js';

const CH = 160, LOAD = 330, UNLOAD = 470;
const PASTEL = [[1.0, 0.78, 0.72], [0.66, 0.90, 0.86], [1.0, 0.92, 0.66], [0.86, 0.76, 0.96], [0.78, 0.94, 0.76], [1.0, 0.98, 0.95], [1.0, 0.70, 0.58], [0.64, 0.82, 0.98], [1.0, 0.80, 0.86], [0.98, 0.95, 0.88]];
const GLASS = [[0.10, 0.20, 0.24], [0.16, 0.24, 0.30], [0.22, 0.26, 0.28], [0.20, 0.17, 0.13], [0.08, 0.16, 0.20], [0.26, 0.32, 0.36]];
const ATTRS = { building: { aWin: 4, aCol: 3, aGlass: 3, aUp: 3 }, road: { aRd: 4 } };
const nullCol = { add() {} };

function mkWorld() { const w = new World(1e7); w.attrs = ATTRS; return w; }
// transform matrix: local +x (the facade facing the street) -> world facing vector (cos ang, sin ang)
function parcelMatrix(p) { const th = Math.atan2(-Math.sin(p.ang), Math.cos(p.ang)); return new THREE.Matrix4().makeRotationY(th).setPosition(p.x, 0, p.z); }

// ------------------------------------------------------------ local generators ----
// all generators build in the parcel frame: footprint x ∈ [−d/2, d/2], z ∈ [−w/2, w/2], street-facing facade at x = +d/2
function villa(ctx, p, big) {
  const W = ctx.W; const hx = p.d / 2, hz = p.w / 2; const wall = pick(PASTEL); const floors = big ? 2 : (rng() < 0.6 ? 2 : 1); const fh = 3.3;
  const top = 0.05 + floors * fh + 0.3;
  volume(ctx, rect(-hx, -hz, hx, hz), 0.05, top, { style: 2, fh, ww: rand(2.6, 3.4), wall, glass: [0.12, 0.16, 0.18], collide: false, relief: true });
  const v = W.b('vcol', 0, 0); const tile = pick([[0.62, 0.30, 0.20], [0.70, 0.38, 0.24], [0.55, 0.27, 0.2], [0.45, 0.44, 0.42]]);
  // hip roof (Spanish tile tone) with eaves
  const e = 0.7, rh = big ? 3.0 : 2.4; const A = [-hx - e, -hz - e], B = [hx + e, -hz - e], C = [hx + e, hz + e], D = [-hx - e, hz + e];
  const r0 = Math.min(hx, hz) * 0.75; const R1 = [-hx + r0, 0], R2 = [hx - r0, 0];
  const V3 = (q, y) => new THREE.Vector3(q[0], y, q[1]);
  const tri = (a, b, c, ya, yb, yc) => v.quad(V3(a, ya), V3(b, yb), V3(c, yc), V3(c, yc), [0, 0, 1, 0, 1, 1, 1, 1], {}, tile);
  const quad = (a, b, c, d, ya, yb, yc, yd) => v.quad(V3(a, ya), V3(b, yb), V3(c, yc), V3(d, yd), [0, 0, 1, 0, 1, 1, 0, 1], {}, tile);
  const y0 = top, y1 = top + rh;
  if (hx >= hz) { quad(D, C, [R2[0], R2[1]], [R1[0], R1[1]], y0, y0, y1, y1); quad(B, A, [R1[0], R1[1]], [R2[0], R2[1]], y0, y0, y1, y1); tri(C, B, R2, y0, y0, y1); tri(A, D, R1, y0, y0, y1); }
  else { const S1 = [0, -hz + r0], S2 = [0, hz - r0]; quad(A, D, S2, S1, y0, y0, y1, y1); quad(C, B, S1, S2, y0, y0, y1, y1); tri(D, C, S2, y0, y0, y1); tri(B, A, S1, y0, y0, y1); }
  polyCap(v, [D, C, B, A], y0 - 0.05, {}, tile.map((c) => c * 0.6), true); // eave soffit
  // front porch / entrance canopy on slim columns, garage door, garden wall + gate piers, pool deck at the side
  const pw = Math.min(5, hz); box(v, hx, 2.9, -pw / 2, hx + 2.4, 3.15, pw / 2, {}, wall.map((c) => Math.min(1, c * 1.08)), false);
  for (const zz of [-pw / 2 + 0.2, pw / 2 - 0.2]) box(v, hx + 2.0, 0.05, zz - 0.15, hx + 2.3, 2.9, zz + 0.15, {}, [0.95, 0.94, 0.9]);
  box(v, hx + 0.01, 0.05, hz - 5.5, hx + 0.06, 2.6, hz - 1.0, {}, [0.86, 0.85, 0.82]); // garage door
  for (let k = 0; k < 5; k++) box(v, hx + 0.06, 0.4 + k * 0.45, hz - 5.5, hx + 0.08, 0.43 + k * 0.45, hz - 1.0, {}, [0.7, 0.7, 0.68]);
  const gw = [0.93, 0.91, 0.86]; const fx = hx + 5.2;
  box(v, fx - 0.15, 0.05, -hz, fx + 0.15, 1.0, -pw / 2 - 1.2, {}, gw); box(v, fx - 0.15, 0.05, pw / 2 + 1.2, fx + 0.15, 1.0, hz - 6.5, {}, gw);
  for (const zz of [-pw / 2 - 1.2, pw / 2 + 1.2, hz - 6.5]) box(v, fx - 0.25, 0.05, zz - 0.25, fx + 0.25, 1.35, zz + 0.25, {}, gw);
  // driveway + front lawn edging
  polyCap(ctx.W.b('pavers', 0, 0), rect(hx, hz - 6, fx + 0.3, hz - 0.5), 0.02);
  if (big || rng() < 0.5) { // pool on the back lawn
    const px0 = -hx - 9, px1 = -hx - 2, pz0 = -hz + 2, pz1 = Math.min(hz - 2, pz0 + 11);
    polyCap(ctx.W.b('concrete', 0, 0), rect(px0 - 1.2, pz0 - 1.2, px1 + 1.2, pz1 + 1.2), 0.06);
    polyCap(v, rect(px0, pz0, px1, pz1), 0.08, {}, [0.10, 0.55, 0.70]);
    if (big) { box(v, px1 + 2, 0.05, pz1 + 2, px1 + 2.2, 2.6, pz1 + 2.2, {}, [0.85, 0.85, 0.82]); }
  }
}
function condo(ctx, p) {
  const hx = p.d / 2, hz = p.w / 2; const fh = 3.2; const top = Math.max(20, p.h);
  volume(ctx, rect(-hx, -hz, hx, hz), 0.05, 5.05, { style: 3, fh: 5, ww: 5, wall: [0.92, 0.92, 0.9], glass: [0.1, 0.12, 0.13], store: false, collide: false });
  const sx = hx - 2.5, sz = hz - 2.5;
  volume(ctx, rect(-sx, -sz, sx, sz), 5.05, top, { style: 1, fh, ww: 3.2, wall: [0.95, 0.95, 0.93], glass: pick(GLASS), collide: false });
  condoSlabs(ctx, -sx, -sz, sx, sz, 5.05, top, fh, 1.6);
  rooftop(ctx, -sx, -sz, sx, sz, top);
}
function port(ctx, p) {
  const hx = p.d / 2, hz = p.w / 2; const v = ctx.W.b('vcol', 0, 0);
  if (rng() < 0.45) { // warehouse with roller doors
    volume(ctx, rect(-hx, -hz, hx, hz), 0.05, p.h, { style: 2, fh: p.h - 0.1, ww: 14, wall: pick([[0.78, 0.78, 0.76], [0.62, 0.55, 0.48], [0.7, 0.74, 0.78]]), glass: [0.2, 0.22, 0.24], relief: false, collide: false });
    for (let z = -hz + 6; z < hz - 4; z += 10) box(v, hx + 0.02, 0.05, z - 2, hx + 0.08, 4.8, z + 2, {}, [0.75, 0.34, 0.18]);
    return;
  }
  const CC = [[0.62, 0.16, 0.12], [0.12, 0.32, 0.55], [0.85, 0.55, 0.12], [0.2, 0.45, 0.3], [0.55, 0.55, 0.55], [0.75, 0.75, 0.72], [0.45, 0.2, 0.35]];
  for (let x = -hx + 2; x < hx - 2.4; x += 3) for (let z = -hz + 1; z < hz - 12; z += 13.2) { const n = randi(1, 4); for (let k = 0; k < n; k++) { const c = pick(CC); box(v, x, 0.05 + k * 2.6, z, x + 2.44, 0.05 + (k + 1) * 2.6, z + 12.2, {}, c, false);
    for (let r = 1; r < 12; r++) box(v, x - 0.05, 0.15 + k * 2.6, z + r * 1.0, x + 2.49, 2.5 + k * 2.6, z + r * 1.0 + 0.08, {}, c.map((q) => q * 0.72)); } }
}
function genParcel(ctx, p) {
  const hx = p.d / 2, hz = p.w / 2;
  switch (p.style) {
    case 'deco': decoHotel(ctx, -hx, -hz, hx, hz, false, 1); break;
    case 'mid': if (rng() < 0.5) decoHotel(ctx, -hx, -hz, hx, hz, true, 1); else midrise(ctx, -hx, -hz, hx, hz); break;
    case 'condo': condo(ctx, p); break;
    case 'downtown': downtownBlock(ctx, { inner: [-hx, -hz, hx, hz], x1: -1600 }, [], [], p.h); break;
    case 'canal': case 'villa': villa(ctx, p, false); break;
    case 'mansion': villa(ctx, p, true); break;
    case 'port': port(ctx, p); break;
    default: break;
  }
}
// far impostor for a parcel (world space). v4.5: no longer a plain box — villas get a hipped tile roof (terracotta / slate /
// sand), downtown towers get a seeded material family (stone, dark glass, white concrete, brick, bronze), a setback crown on
// tall towers, a parapet line and rooftop plant boxes, so the city reads as buildings from the air instead of grey blocks.
const DT_WALL = [[0.80, 0.74, 0.64], [0.34, 0.40, 0.46], [0.90, 0.89, 0.86], [0.62, 0.40, 0.32], [0.48, 0.41, 0.33], [0.70, 0.72, 0.74], [0.84, 0.80, 0.72]];
const DT_STY = [2, 0, 5, 2, 0, 0, 5];
const ROOF_T = [[0.62, 0.30, 0.20], [0.70, 0.38, 0.24], [0.55, 0.27, 0.2], [0.40, 0.42, 0.45], [0.78, 0.68, 0.52], [0.66, 0.34, 0.26]];
function impostor(W, p) {
  const c = Math.cos(p.ang), s = Math.sin(p.ang); const hx = p.d / 2, hz = p.w / 2;
  const P = (a, b) => [p.x + c * a - s * b, p.z + s * a + c * b];
  const box4 = (sx, sz) => [P(-sx, sz), P(sx, sz), P(sx, -sz), P(-sx, -sz)]; // same winding as rect() in the local frame
  const st = p.style; const house = st === 'canal' || st === 'villa' || st === 'mansion';
  const h = house ? p.h + 0.3 : p.h;
  const fam = p.seed % DT_WALL.length;
  const style = st === 'downtown' ? DT_STY[fam] : st === 'condo' ? 1 : st === 'port' ? 6 : 2;
  const wall = st === 'downtown' ? DT_WALL[fam] : st === 'condo' ? [0.95, 0.95, 0.93] : PASTEL[p.seed % PASTEL.length];
  const glass = GLASS[p.seed % GLASS.length];
  const fh = st === 'downtown' ? 3.8 : 3.3, ww = st === 'downtown' ? (style === 0 ? 1.6 : 2.0) : 3.2;
  const b = W.b('building', p.x, p.z);
  const walls = (poly, y0, y1) => prismWalls(b, poly, y0, y1, (i, len) => ({ aWin: [style, fh, len / Math.max(1, Math.round(len / ww)), p.seed % 97], aCol: wall, aGlass: glass, aUp: [0, 0, 0] }), null, 0, true);
  const roof = W.b('roof', p.x, p.z), v = W.b('vcol', p.x, p.z);
  if (house) {
    walls(box4(hx, hz), 0, h);
    const tile = ROOF_T[p.seed % ROOF_T.length]; const e = 0.6, rh = Math.min(hx, hz) * 0.55; const r0 = Math.min(hx, hz);
    const A = P(-hx - e, -hz - e), B = P(hx + e, -hz - e), C = P(hx + e, hz + e), D = P(-hx - e, hz + e);
    const R1 = hx >= hz ? P(-hx + r0, 0) : P(0, -hz + r0), R2 = hx >= hz ? P(hx - r0, 0) : P(0, hz - r0);
    const V3 = (q, y) => new THREE.Vector3(q[0], y, q[1]); const y0 = h, y1 = h + rh;
    const tri = (a, bb, cc, ya, yb, yc) => v.quad(V3(a, ya), V3(bb, yb), V3(cc, yc), V3(cc, yc), [0, 0, 1, 0, 1, 1, 1, 1], {}, tile);
    const quad = (a, bb, cc, d, ya, yb, yc, yd) => v.quad(V3(a, ya), V3(bb, yb), V3(cc, yc), V3(d, yd), [0, 0, 1, 0, 1, 1, 0, 1], {}, tile);
    const dark = tile.map((q) => q * 0.82);
    if (hx >= hz) { quad(D, C, R2, R1, y0, y0, y1, y1); quad(B, A, R1, R2, y0, y0, y1, y1); v.quad(V3(C, y0), V3(B, y0), V3(R2, y1), V3(R2, y1), [0, 0, 1, 0, 1, 1, 1, 1], {}, dark); v.quad(V3(A, y0), V3(D, y0), V3(R1, y1), V3(R1, y1), [0, 0, 1, 0, 1, 1, 1, 1], {}, dark); }
    else { quad(A, D, R2, R1, y0, y0, y1, y1); quad(C, B, R1, R2, y0, y0, y1, y1); tri(D, C, R2, y0, y0, y1); tri(B, A, R1, y0, y0, y1); }
    return;
  }
  const tall = st === 'downtown' && h > 70 || st === 'condo' && h > 60;
  const hb = tall ? h * (0.72 + (p.seed % 7) * 0.02) : h;
  walls(box4(hx, hz), 0, hb);
  polyCap(roof, box4(hx, hz), hb);
  // parapet lip (reads as a cornice line from the air)
  prismWalls(W.b('concrete', p.x, p.z), box4(hx + 0.25, hz + 0.25), hb - 0.6, hb + 0.9, null);
  let top = hb, sx = hx, sz = hz;
  if (tall) { sx = hx * 0.74; sz = hz * 0.74; walls(box4(sx, sz), hb, h); polyCap(roof, box4(sx, sz), h); top = h; }
  // rooftop plant: one or two boxes + a water tank / crown block
  const k = (p.seed >> 3) % 4; const mx = sx * 0.35, mz = sz * 0.3;
  polyCap(v, [P(-mx - 3, mz + 2), P(-mx + 3, mz + 2), P(-mx + 3, mz - 2), P(-mx - 3, mz - 2)].map((q) => q), top + 2.2, {}, [0.62, 0.62, 0.6]);
  prismWalls(v, [P(-mx - 3, mz + 2), P(-mx + 3, mz + 2), P(-mx + 3, mz - 2), P(-mx - 3, mz - 2)], top, top + 2.2, null, [0.58, 0.58, 0.56]);
  if (k > 1) { const q = [P(mx - 2, -mz + 2), P(mx + 2, -mz + 2), P(mx + 2, -mz - 2), P(mx - 2, -mz - 2)]; prismWalls(v, q, top, top + (tall ? 6 : 3), null, [0.45, 0.47, 0.5]); polyCap(v, q, top + (tall ? 6 : 3), {}, [0.4, 0.42, 0.45]); }
}

export class Stream {
  constructor(scene, mats, parcels) {
    this.scene = scene; this.mats = mats; this.chunks = new Map(); this.stats = { loaded: 0, builds: 0, ms: 0 };
    this.group = new THREE.Group(); this.group.name = 'stream'; scene.add(this.group);
    for (const p of parcels) { const k = Math.floor(p.x / CH) + ',' + Math.floor(p.z / CH); let c = this.chunks.get(k); if (!c) this.chunks.set(k, c = { key: k, cx: (Math.floor(p.x / CH) + 0.5) * CH, cz: (Math.floor(p.z / CH) + 0.5) * CH, parcels: [], far: [], near: null }); c.parcels.push(p); }
    // far impostors, one merged set of meshes per chunk
    let tris = 0;
    for (const c of this.chunks.values()) {
      const W = mkWorld(); for (const p of c.parcels) impostor(W, p);
      c.far = W.build(this.group, mats, { building: { cast: true } }); for (const m of c.far) tris += m.geometry.index.count / 3;
    }
    this.farTris = tris;
  }
  buildNear(c) {
    const t0 = performance.now();
    const W = mkWorld();
    for (const p of c.parcels) {
      if (p.far) continue;
      const lw = mkWorld(); const ctx = { W: lw, col: nullCol, signs: [], awnings: [], lamps: [], alleys: [], yards: [] };
      withSeed(p.seed, () => genParcel(ctx, p));
      const m = parcelMatrix(p);
      for (const b of lw.buckets.values()) { if (!b.vc) continue; W.b(b.mat, p.x, p.z).append(b, m); }
    }
    c.near = W.build(this.group, this.mats, { neon: { cast: false }, pavers: { cast: false }, concrete: { cast: false }, glassRail: { cast: false } });
    for (const m of c.far) m.visible = c.parcels.some((p) => p.far); // keep far-only parcels' boxes (none in near chunks normally)
    this.stats.builds++; this.stats.ms = performance.now() - t0;
  }
  dropNear(c) { for (const m of c.near) { this.group.remove(m); m.geometry.dispose(); } c.near = null; for (const m of c.far) m.visible = true; }
  // call every frame: builds at most `budget` near chunks (nearest first), frees far ones
  update(pos, budget = 1) {
    const want = [];
    for (const c of this.chunks.values()) {
      const d = Math.hypot(c.cx - pos.x, c.cz - pos.z);
      if (c.near && d > UNLOAD) this.dropNear(c);
      else if (!c.near && d < LOAD && c.parcels.some((p) => !p.far)) want.push([d, c]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(budget, want.length); i++) this.buildNear(want[i][1]);
    this.stats.loaded = [...this.chunks.values()].filter((c) => c.near).length;
    return want.length - Math.min(budget, want.length);
  }
  sync(pos) { this.update(pos, 999); return this.stats; }
  tris() { let n = 0; for (const c of this.chunks.values()) if (c.near) for (const m of c.near) n += m.geometry.index.count / 3; return { near: n, far: this.farTris, loaded: this.stats.loaded }; }
}
