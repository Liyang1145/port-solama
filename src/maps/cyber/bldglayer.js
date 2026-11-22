// r6.2 霓港 street-structure layer: the pieces that span parcels or that stream.js's own generators do not cover.
//  * industrial / harbor (port parcels): warehouse pipe runs + front catwalk + ladders + roof stacks / pipe rack / tank;
//    container yards get a rail-mounted gantry crane (legs, box girders, trolley, hoist ropes, spreader) and flood-light masts.
//  * elevated walkways: glazed truss skyways at 6.5–9 m between facing downtown / mid-rise fronts across a street.
//  * sky bridges: enclosed bridges between neighbouring megatowers (both ≥ 90 m) at 30–40 % height, clear of other towers.
//  * cable bundles strung across tenement streets between facing facades.
// LOD: a chunk's layer geometry is built the frame stream.js builds that chunk's near detail and is disposed when stream.js
// drops it (same 160 m chunks, LOAD 330 m / UNLOAD 470 m), each piece under its own seed so it rebuilds identically.
import * as THREE from 'three';
import { World, box, polyCap, prismWalls, rect } from '../../geo.js';
import { withSeed, rng, rand, randi, pick } from '../../util.js';
import { kg, beam, tube, put, cableBundle, NEONC, DARK, STEEL } from './kit.js';
import { U } from '../../env.js';
import { laundryLine } from './dress.js';
import { shopStreet } from './arch.js';
import { Viaduct, nearViaduct } from './viaduct.js';
import { AlleyLayer } from './alley.js';
import { RoofLayer } from './roofs.js';
import { ParcelGapLayer } from './parcelgap.js';

// r6.3 additive light cone (flood lights on cranes / masts): bright at the lamp (uv.y = 1), fading down and toward the silhouette,
// vertex colour = light colour; night only (uNight)
let CONE_MAT = null, CONE_G = null;
function coneMat() {
  if (CONE_MAT) return CONE_MAT;
  CONE_MAT = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vC = color; vT = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform float uNight; varying vec3 vC; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = f * pow(vT, 2.2) * uNight * 0.11; gl_FragColor = vec4(vC * a, 1.0); }' });
  return CONE_MAT;
}
// cone from the lamp at (x, y, z) down to the ground, radius r at the bottom (unit geometry: apex at y=0 top, base at y=-1)
function cone(b, x, y, z, h, r, col) {
  if (!CONE_G) { CONE_G = new THREE.CylinderGeometry(0.06, 1, 1, 14, 1, true); CONE_G.translate(0, -0.5, 0); }
  put(b, CONE_G, x, y, z, r, h, r, col);
}

const CH = 160, DETAIL_R = 230;
const ATTRS = { building: { aWin: 4, aCol: 3, aGlass: 3, aUp: 3 }, road: { aRd: 4 } };
const mkWorld = () => { const w = new World(1e7); w.attrs = ATTRS; return w; };
const keyOf = (x, z) => Math.floor(x / CH) + ',' + Math.floor(z / CH);
function parcelMatrix(p) { const th = Math.atan2(-Math.sin(p.ang), Math.cos(p.ang)); return new THREE.Matrix4().makeRotationY(th).setPosition(p.x, 0, p.z); }
const inParcel = (p, x, z, pad = 0) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); const dx = x - p.x, dz = z - p.z; const u = dx * c + dz * s, v = -dx * s + dz * c; return Math.abs(u) <= p.d / 2 + pad && Math.abs(v) <= p.w / 2 + pad; };

export class BldgLayer {
  constructor(scene, mats, city) {
    this.mats = mats; this.stream = city.stream; if (mats && mats.vcol && !mats.vcolD) mats.vcolD = mats.vcol; /* LOD alias (kit.js) */
    this.lmats = Object.assign(Object.create(mats), { cone: coneMat() }); this.group = new THREE.Group(); this.group.name = 'bldglayer'; scene.add(this.group);
    this.via = city.viaduct ? new Viaduct(scene, this.lmats, city, city.viaduct) : null; // r6.4 b_street2 elevated light-rail
    this.alley = new AlleyLayer(scene, this.lmats, city); // r6.4 b_alley: Deco-core back-alley clutter (alley.js, own distance LOD)
    this.roofs = new RoofLayer(scene, this.lmats, city); // r6.4 b_rooftop: low / mid-rise roof plant, dishes, solar, rails, billboards, aviation lights (roofs.js)
    this.gaps = new ParcelGapLayer(scene, this.lmats, city); // r6.4 b_parcelgap: street-side closure of the 0–3 m slots between streamed parcels (parcelgap.js; after roofs: chains onParcel)
    this.items = new Map(); this.built = new Map(); this.counts = { port: 0, walk: 0, bridge: 0, cables: 0 };
    const add = (k, it) => { let l = this.items.get(k); if (!l) this.items.set(k, l = []); l.push(it); };
    const P = city.parcels.filter((p) => !p.far);
    for (const p of P) if (p.style === 'port') { add(keyOf(p.x, p.z), { kind: 'port', p }); this.counts.port++; }
    // r6.3 side streets: a parcel side that faces a road (block corners) gets its own shop row + sidewalk dressing — the generators
    // only dress the front, so streets running past building sides were bare (b_night_street)
    this.counts.side = 0;
    for (const p of P) { if (!(p.style === 'mid' || p.style === 'deco' || p.style === 'downtown')) continue; const c = Math.cos(p.ang), sn = Math.sin(p.ang);
      for (const sd of [1, -1]) { const lz = sd * (p.w / 2 + 4.5); const x = p.x - sn * lz, z = p.z + c * lz; const n = city.graph.index.near(x, z);
        if (n && n.d < n.e.hw + n.e.sw + 0.5 && n.e.sw > 0) { add(keyOf(p.x, p.z), { kind: 'side', p, sd }); this.counts.side++; } } }
    // facing pairs across a street
    const front = (p) => { const fx = Math.cos(p.ang), fz = Math.sin(p.ang); return { x: p.x + fx * p.d / 2, z: p.z + fz * p.d / 2, fx, fz }; };
    const cand = P.filter((p) => p.style === 'mid' || p.style === 'downtown' || p.style === 'deco');
    const F = cand.map(front); const used = new Set();
    const R = (() => { let s = 6202; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (let i = 0; i < cand.length; i++) {
      if (used.has(i)) continue; const a = F[i], p = cand[i]; let best = -1, bl = 1e9;
      for (let j = 0; j < cand.length; j++) {
        if (j === i || used.has(j)) continue; const b = F[j], q = cand[j];
        if (a.fx * b.fx + a.fz * b.fz > -0.94) continue;
        const dx = b.x - a.x, dz = b.z - a.z; const along = dx * a.fx + dz * a.fz; if (along < 10 || along > 34) continue;
        const lat = Math.abs(-dx * a.fz + dz * a.fx); if (lat > Math.min(p.w, q.w) / 2 - 3.5) continue;
        if (lat < bl) { bl = lat; best = j; }
      }
      if (best < 0) continue; const q = cand[best], b = F[best];
      // project both onto the shared line through the overlap so the deck runs square to both facades
      const ox = -a.fz, oz = a.fx; const la = 0, lb = (b.x - a.x) * ox + (b.z - a.z) * oz; const lm = (la + lb) / 2;
      const A = { x: a.x + ox * lm, z: a.z + oz * lm }; const Bp = { x: A.x + a.fx * ((b.x - a.x) * a.fx + (b.z - a.z) * a.fz), z: A.z + a.fz * ((b.x - a.x) * a.fx + (b.z - a.z) * a.fz) };
      const mid = { x: (A.x + Bp.x) / 2, z: (A.z + Bp.z) / 2 }; const nr = city.graph.index.near(mid.x, mid.z); if (!nr || nr.d > nr.e.hw + 1) continue;
      if (nearViaduct(city.viaduct, A, Bp, 13)) continue; // r6.4: no skyways / cross-street cables through the light-rail deck
      const hmin = Math.min(p.h, q.h); const r = R(); const seed = (p.seed ^ q.seed) >>> 0;
      const dt = p.style === 'downtown' && q.style === 'downtown';
      if ((dt || p.style === 'mid' || q.style === 'mid') && hmin > 14 && r < (dt ? 0.4 : 0.22)) { used.add(i); used.add(best); add(keyOf(A.x, A.z), { kind: 'walk', A, B: Bp, y: Math.min(hmin - 4, 6.5 + R() * 2.5), seed, dt }); this.counts.walk++; }
      else if (p.style !== 'downtown' && q.style !== 'downtown' && hmin > 9 && r < 0.75) { used.add(i); used.add(best); add(keyOf(A.x, A.z), { kind: 'cables', A, B: Bp, hmin, seed }); this.counts.cables++; }
    }
    // sky bridges between megatowers
    const tall = P.filter((p) => p.style === 'downtown' && p.h >= 90 && p.w > 26 && p.d > 26); const tu = new Set();
    for (let i = 0; i < tall.length; i++) {
      if (tu.has(i)) continue; const p = tall[i];
      for (let j = i + 1; j < tall.length; j++) {
        if (tu.has(j)) continue; const q = tall[j]; const L = Math.hypot(q.x - p.x, q.z - p.z); if (L < 42 || L > 95) continue;
        const y = 16 + Math.min(p.h, q.h) * (0.26 + R() * 0.1); let clear = true;
        for (let k = 1; k < 20 && clear; k++) { const t = k / 20; const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
          for (const o of P) if (o !== p && o !== q && o.h > y - 6 && inParcel(o, x, z, 4)) { clear = false; break; } }
        if (!clear || R() < 0.35) continue;
        tu.add(i); tu.add(j); add(keyOf(p.x, p.z), { kind: 'bridge', p, q, y, seed: (p.seed * 31 + q.seed) >>> 0 }); this.counts.bridge++; break;
      }
    }
  }
  buildChunk(key, list) {
    const W = mkWorld();
    for (const it of list) {
      if (it.kind === 'port') { const lw = mkWorld(); const wh = withSeed(it.p.seed, () => rng() < 0.45); withSeed((it.p.seed ^ 0x9e37) >>> 0, () => portExtras(lw, it.p, wh));
        const m = parcelMatrix(it.p); for (const b of lw.buckets.values()) if (b.vc) W.b(b.mat, it.p.x, it.p.z).append(b, m); }
      else if (it.kind === 'side') { const lw = mkWorld(); const p = it.p; const dt = p.style === 'downtown'; const ins = dt ? 1 : 0; const ctx = { W: lw };
        withSeed((p.seed ^ (it.sd > 0 ? 0x5151 : 0xa3a3)) >>> 0, () => shopStreet(ctx, p.w / 2 - ins, -p.d / 2 + ins + 0.5, p.d / 2 - ins - 0.5, 0.15, dt ? 5.0 : 4.4, 4.5, { grit: dt ? 0.35 : 0.7, blade: rng() < 0.6 }));
        const m = parcelMatrix(p).multiply(new THREE.Matrix4().makeRotationY(-it.sd * Math.PI / 2)); for (const b of lw.buckets.values()) if (b.vc) W.b(b.mat, p.x, p.z).append(b, m); }
      else withSeed(it.seed, () => (it.kind === 'walk' ? skyway(W, it) : it.kind === 'bridge' ? skyBridge(W, it) : streetCables(W, it)));
    }
    return W.build(this.group, this.lmats, { neon: { cast: false }, glassRail: { cast: false }, cone: { cast: false, receive: false }, steam: { cast: false, receive: false }, cnsign: { cast: false }, nglow: { cast: false, receive: false }, nrefl: { cast: false, receive: false } });
  }
  sync() {
    const st = this.stream; if (!st) return;
    if (this.via) this.via.sync(globalThis.__G && globalThis.__G.camera); // r6.4 light-rail near detail (own distance LOD)
    if (this.alley) this.alley.sync(globalThis.__G && globalThis.__G.camera);
    if (this.roofs) this.roofs.sync(globalThis.__G && globalThis.__G.camera);
    if (this.gaps) this.gaps.sync(globalThis.__G && globalThis.__G.camera);
    // detail LOD: small clutter meshes ('vcolD') only within DETAIL_R of the camera (chunk centre distance)
    const cam = globalThis.__G && globalThis.__G.camera; if (cam) { const p = cam.position; let n = 0;
      for (const c of st.chunks.values()) { if (!c.near) continue; const on = Math.hypot(c.cx - p.x, c.cz - p.z) < DETAIL_R + Math.max(0, p.y - 40) * 0.5;
        for (const m of c.near) if (m.name.startsWith('vcolD|') || m.name.startsWith('puddle|') || m.name.startsWith('steam|') || m.name.startsWith('nglow|') || m.name.startsWith('nrefl|')) { m.visible = on; n += on; } }
      for (const b of this.built.values()) for (const m of b) if (m.name.startsWith('vcolD|') || m.name.startsWith('steam|') || m.name.startsWith('nglow|') || m.name.startsWith('nrefl|')) { const q = m.geometry.boundingSphere || (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere); m.visible = q.center.distanceTo(p) < DETAIL_R + q.radius; }
      this.detailOn = n; }
    for (const [k, list] of this.items) {
      const c = st.chunks.get(k); const on = !!(c && c.near); const b = this.built.get(k);
      if (on && !b) this.built.set(k, this.buildChunk(k, list));
      else if (!on && b) { for (const m of b) { this.group.remove(m); m.geometry.dispose(); } this.built.delete(k); }
    }
  }
  tris() { let n = 0; for (const b of this.built.values()) for (const m of b) n += m.geometry.index.count / 3; return n; }
}

// -------------------------------------------------------------- harbor / industrial ----
function portExtras(W, p, warehouse) {
  const hx = p.d / 2, hz = p.w / 2; const v = W.b('vcol', 0, 0), nb = W.b('neon', 0, 0); const G = kg();
  if (warehouse) {
    const h = p.h; const pc = pick([[0.62, 0.6, 0.55], [0.55, 0.3, 0.18], [0.3, 0.42, 0.5], [0.7, 0.62, 0.2]]);
    // pipe run along the front facade under the eaves: 3 pipes on brackets, two vertical drops into the ground
    const yp = h - 2.2; const pr = [0.22, 0.16, 0.12];
    for (let i = 0; i < 3; i++) tube(v, [hx + 0.5 + i * 0.45, yp - i * 0.2, -hz + 1], [hx + 0.5 + i * 0.45, yp - i * 0.2, hz - 1], pr[i], i === 1 ? [0.75, 0.68, 0.2] : pc, G.tube6);
    for (let z = -hz + 2; z < hz - 1; z += 4) { beam(v, [hx, yp + 0.35, z], [hx + 1.6, yp + 0.35, z], 0.12, DARK); beam(v, [hx, yp - 1.0, z], [hx + 1.4, yp + 0.3, z], 0.08, DARK); }
    for (const z of [-hz + 3, hz - 5]) { tube(v, [hx + 0.5, 0.05, z], [hx + 0.5, yp, z], 0.22, pc, G.tube6); put(v, G.cyl8, hx + 0.5, 0.4, z, 0.32, 0.8, 0.32, DARK); }
    // front catwalk above the roller doors + rails + ladders (ground -> catwalk -> roof)
    const yc = 6.2, dep = 1.2;
    box(v, hx + 0.05, yc - 0.12, -hz + 0.5, hx + dep, yc, hz - 0.5, {}, [0.2, 0.21, 0.22], false);
    for (const yy of [yc + 0.5, yc + 1.05]) beam(v, [hx + dep, yy, -hz + 0.5], [hx + dep, yy, hz - 0.5], 0.05, [0.85, 0.7, 0.12]);
    for (let z = -hz + 0.5; z <= hz - 0.5; z += 1.5) beam(v, [hx + dep, yc, z], [hx + dep, yc + 1.05, z], 0.04, [0.85, 0.7, 0.12], null, G.tube4);
    for (let z = -hz + 3; z < hz - 2; z += 6) beam(v, [hx, yc - 1.1, z], [hx + dep, yc - 0.1, z], 0.08, DARK);
    const lz = hz - 1.2; for (const zz of [lz - 0.22, lz + 0.22]) beam(v, [hx + dep + 0.3, 0.05, zz], [hx + dep + 0.3, yc + 1.0, zz], 0.05, DARK);
    for (let y = 0.4; y < yc; y += 0.32) beam(v, [hx + dep + 0.3, y, lz - 0.22], [hx + dep + 0.3, y, lz + 0.22], 0.03, DARK);
    for (const zz of [-hz + 1.2, -hz + 1.62]) beam(v, [hx + 0.35, yc, zz], [hx + 0.35, h + 1.1, zz], 0.05, DARK);
    for (let y = yc + 0.3; y < h + 1; y += 0.32) beam(v, [hx + 0.35, y, -hz + 1.2], [hx + 0.35, y, -hz + 1.62], 0.03, DARK);
    put(nb, G.box, hx + 0.12, yc + 1.6, 0, 0.05, 0.25, 1.4, [0.9, 0.85, 0.7]); // work light
    // roof: exhaust stacks with bands, pipe rack on T-frames, horizontal tank on saddles, vent boxes
    const ns = randi(2, 4); for (let i = 0; i < ns; i++) { const x = rand(-hx + 3, hx - 3), z = rand(-hz + 3, hz - 3), sh = rand(5, 10), sr = rand(0.35, 0.7);
      put(v, G.cyl8, x, h + sh / 2, z, sr, sh, sr, [0.5, 0.5, 0.5]); for (const t of [0.3, 0.7]) put(v, G.cyl8, x, h + sh * t, z, sr + 0.06, 0.25, sr + 0.06, [0.75, 0.2, 0.15]); put(v, G.cyl8, x, h + sh + 0.2, z, sr * 1.2, 0.3, sr * 1.2, DARK); }
    const rz = rand(-hz * 0.3, hz * 0.3); for (let x = -hx + 2; x < hx - 1; x += 4) { beam(v, [x, h, rz], [x, h + 2.2, rz], 0.2, STEEL); beam(v, [x, h + 2.2, rz - 1.4], [x, h + 2.2, rz + 1.4], 0.18, STEEL); }
    for (let i = 0; i < 3; i++) tube(v, [-hx + 2, h + 2.5, rz - 1 + i], [hx - 1, h + 2.5, rz - 1 + i], rand(0.15, 0.3), pick([pc, [0.7, 0.7, 0.68], [0.25, 0.4, 0.3]]), G.tube6);
    if (hz > 12) { const tz = -hz + 5; _ry(v, G.cyl12, 0, h + 2.4, tz, 1.5, 7, 1.5, [0.85, 0.85, 0.82]); for (const x of [-2.4, 2.4]) box(v, x - 0.3, h, tz - 1.4, x + 0.3, h + 1.6, tz + 1.4, {}, DARK); }
    for (let i = 0; i < 3; i++) { const x = rand(-hx + 2, hx - 2), z = rand(-hz + 2, hz - 2); box(v, x - 0.7, h, z - 0.7, x + 0.7, h + 0.9, z + 0.7, {}, [0.55, 0.56, 0.57]); }
    return;
  }
  // container yard: rail-mounted gantry crane over the stacks + flood-light masts
  const cy = pick([[0.95, 0.68, 0.08], [0.9, 0.35, 0.1], [0.2, 0.45, 0.75]]); const xL = -hx - 1.4, xR = hx + 1.4, Hc = 19;
  for (const x of [xL, xR]) beam(v, [x, 0.06, -hz], [x, 0.06, hz], 0.25, [0.25, 0.25, 0.26], 0.12); // rails
  const zc = rand(-hz + 9, hz - 9);
  for (const x of [xL, xR]) {
    for (const s of [-1, 1]) beam(v, [x, 0.6, zc + s * 5], [x, Hc, zc + s * 2.2], 0.9, cy, 0.9);
    box(v, x - 0.7, 0.1, zc - 6, x + 0.7, 1.2, zc + 6, {}, cy.map((q) => q * 0.8)); // sill beam / bogies
    for (const s of [-1, 1]) put(v, G.cyl8, x, 0.45, zc + s * 5.2, 0.4, 0.5, 0.4, DARK);
    beam(v, [x, 7, zc - 4], [x, 7, zc + 4], 0.35, cy); beam(v, [x, 7, zc - 4], [x, Hc - 1, zc + 2.4], 0.25, cy);
  }
  for (const s of [-1, 1]) box(v, xL - 0.8, Hc, zc + s * 2.2 - 0.8, xR + 0.8, Hc + 1.8, zc + s * 2.2 + 0.8, {}, cy); // twin box girders
  for (let x = xL; x <= xR; x += 4) beam(v, [x, Hc + 1.8, zc - 2.2], [x, Hc + 1.8, zc + 2.2], 0.25, cy);
  const tx = rand(xL + 4, xR - 4); box(v, tx - 1.8, Hc + 1.8, zc - 3.2, tx + 1.8, Hc + 3.6, zc + 3.2, {}, [0.88, 0.88, 0.85]); // trolley
  box(v, tx - 1.2, Hc - 2.8, zc + 3.1, tx + 1.2, Hc - 0.2, zc + 5.2, {}, [0.86, 0.86, 0.84]); put(nb, G.box, tx, Hc - 1.5, zc + 5.22, 1.8, 1.1, 0.03, [0.25, 0.3, 0.32]); // cab + lit glazing
  const ys = rand(9, 13); for (const [ox, oz] of [[-1.2, -2.5], [1.2, -2.5], [-1.2, 2.5], [1.2, 2.5]]) tube(v, [tx + ox * 0.6, Hc + 1.8, zc + oz * 0.6], [tx + ox, ys + 0.6, zc + oz], 0.03, DARK, G.tube4);
  box(v, tx - 1.3, ys, zc - 6.1, tx + 1.3, ys + 0.6, zc + 6.1, {}, cy.map((q) => q * 0.85)); // spreader
  if (rng() < 0.6) box(v, tx - 1.22, ys - 2.6, zc - 6.1, tx + 1.22, ys, zc + 6.1, {}, pick([[0.62, 0.16, 0.12], [0.12, 0.32, 0.55], [0.2, 0.45, 0.3]])); // a lifted box
  for (const [x, z] of [[xL - 1.5, -hz + 1], [xR + 1.5, hz - 1]]) { put(v, G.cyl8, x, 11, z, 0.25, 22, 0.25, STEEL); box(v, x - 1.6, 22, z - 0.25, x + 1.6, 22.3, z + 0.25, {}, DARK);
    for (const o of [-1.1, 0, 1.1]) put(nb, G.box, x + o, 21.85, z, 0.7, 0.12, 0.4, [0.95, 0.9, 0.75]); }
  put(nb, G.ball, tx, Hc + 3.9, zc, 0.2, 0.2, 0.2, [1, 0.5, 0.05]);
  // r6.2b night read: sodium work lights under both box girders, red obstruction lights on the girder ends + leg tops,
  // a lit machinery-house window band on the trolley and amber strobes on the sill beams
  for (const s of [-1, 1]) for (let x = xL + 2; x < xR - 1; x += 5) put(nb, G.box, x, Hc - 0.05, zc + s * 2.2, 0.9, 0.08, 0.35, [0.95, 0.72, 0.38]);
  for (const x of [xL - 0.8, xR + 0.8]) for (const s of [-1, 1]) put(nb, G.ball, x, Hc + 2.0, zc + s * 2.2, 0.22, 0.22, 0.22, [1, 0.08, 0.05]);
  for (const s of [-1, 1]) put(nb, G.box, tx + s * 1.81, Hc + 2.8, zc, 0.02, 0.35, 5.2, [0.55, 0.6, 0.62]);
  for (const x of [xL, xR]) for (const s of [-1, 1]) put(nb, G.ball, x, 1.35, zc + s * 5.6, 0.14, 0.14, 0.14, [1, 0.55, 0.05]);
  // r6.3: the crane read as a dark goalpost at night -> lamp housings with light cones under both girders, lit girder edge strips,
  // flashing-red beacons on the girder ends + leg tops, flood cones from the yard masts
  const cb = W.b('cone', 0, 0); const sod = [0.95, 0.66, 0.32], wh = [0.75, 0.8, 0.85];
  for (const s of [-1, 1]) for (let x = xL + 3; x < xR - 2; x += 9) { box(v, x - 0.5, Hc - 0.45, zc + s * 2.2 - 0.35, x + 0.5, Hc, zc + s * 2.2 + 0.35, {}, DARK); put(nb, G.box, x, Hc - 0.48, zc + s * 2.2, 0.8, 0.04, 0.5, sod.map((q) => q * 1.6)); cone(cb, x, Hc - 0.5, zc + s * 2.2, Hc - 0.6, rand(3.2, 4.2), sod); }
  for (const s of [-1, 1]) for (const side of [-1, 1]) put(nb, G.box, (xL + xR) / 2, Hc + 0.9, zc + s * 2.2 + side * 0.82, xR - xL + 1.4, 0.06, 0.02, [0.3, 0.32, 0.36]);
  for (const x of [xL, xR]) for (const s of [-1, 1]) put(nb, G.ball, x, Hc - 2, zc + s * 2.2 + s * 0.5, 0.18, 0.18, 0.18, [1, 0.08, 0.05]);
  cone(cb, tx, Hc - 2.9, zc + 4.2, Hc - 3, 3, wh);
  for (const [x, z] of [[xL - 1.5, -hz + 1], [xR + 1.5, hz - 1]]) cone(cb, x, 21.8, z, 21.7, 7, [0.6, 0.58, 0.5]);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function _ry(b, g, x, y, z, sx, sy, sz, col) { _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); _s.set(sx, sy, sz); _p.set(x, y, z); _m.compose(_p, _q, _s); b.geom(g, _m, {}, col); }

// ----------------------------------------------------------- elevated walkway ----
function skyway(W, it) {
  const { A, B, y } = it; const L = Math.hypot(B.x - A.x, B.z - A.z); const ux = (B.x - A.x) / L, uz = (B.z - A.z) / L; const sx = -uz, sz = ux;
  const v = W.b('vcol', A.x, A.z), nb = W.b('neon', A.x, A.z), g = W.b('glassRail', A.x, A.z);
  const P = (t, s, yy) => [A.x + ux * t + sx * s, yy, A.z + uz * t + sz * s];
  const hw = 1.7, H = 2.9; const st = pick([[0.22, 0.23, 0.25], [0.8, 0.8, 0.78], [0.12, 0.12, 0.13]]); const glow = pick(NEONC);
  beam(v, P(-0.3, 0, y - 0.2), P(L + 0.3, 0, y - 0.2), hw * 2 + 0.2, [0.4, 0.4, 0.41], 0.4); // deck slab (beam: width across, height y)
  beam(v, P(-0.3, 0, y + H + 0.15), P(L + 0.3, 0, y + H + 0.15), hw * 2 + 0.5, st, 0.3); // roof slab
  for (const s of [-hw, hw]) {
    beam(v, P(0, s, y - 0.55), P(L, s, y - 0.55), 0.3, st, 0.5); beam(v, P(0, s, y + H - 0.1), P(L, s, y + H - 0.1), 0.2, st, 0.2); // chords
    const n = Math.max(2, Math.round(L / 3)); for (let i = 0; i <= n; i++) { const t = (L * i) / n; beam(v, P(t, s, y - 0.3), P(t, s, y + H), 0.16, st);
      if (i < n) beam(v, P(t, s, y - 0.4), P((L * (i + 1)) / n, s, y + 0.1), 0.1, st); }
    const gq = [P(0, s - 0.03, 0), P(L, s - 0.03, 0), P(L, s + 0.03, 0), P(0, s + 0.03, 0)].map((q) => [q[0], q[2]]); prismWalls(g, gq, y + 0.1, y + H - 0.2, null);
    beam(nb, P(0, s * 1.06, y - 0.82), P(L, s * 1.06, y - 0.82), 0.07, glow, 0.07); // neon underline
  }
  beam(nb, P(0.5, 0, y + H - 0.05), P(L - 0.5, 0, y + H - 0.05), 0.35, [0.5, 0.55, 0.6], 0.04); // ceiling light strip
  // portal frames on both facades + a tube sign hung under the deck
  for (const t of [0, L]) { beam(v, P(t, -hw - 0.5, y - 0.6), P(t, -hw - 0.5, y + H + 0.4), 0.45, DARK); beam(v, P(t, hw + 0.5, y - 0.6), P(t, hw + 0.5, y + H + 0.4), 0.45, DARK); beam(v, P(t, -hw - 0.5, y + H + 0.4), P(t, hw + 0.5, y + H + 0.4), 0.45, DARK); }
  // r6.3 street connection: columns under the deck at the kerb line + a stair tower down to the pavement at one or both ends
  const ys = 0.15; const kerb = Math.min(3.2, L * 0.18);
  for (const t of [kerb, L - kerb]) for (const s of [-hw + 0.25, hw - 0.25]) { beam(v, P(t, s, ys), P(t, s, y - 0.4), 0.42, st); put(v, kg().box, ...P(t, s, ys + 0.2), 0.7, 0.4, 0.7, [0.4, 0.4, 0.41]); }
  for (const [t, dir] of [[0, 1], [L, -1]]) if (t === 0 || rng() < 0.5) skyStair(v, g, P, t + dir * 0.9, (rng() < 0.5 ? -1 : 1), hw, y, ys, st);
  if (L > 14 && it.dt) { const c = P(L / 2, 0, y - 0.6); const pr = [ux, 0, uz]; for (const o of [-1.2, 1.2]) beam(v, [c[0] + ux * o, y - 0.8, c[2] + uz * o], [c[0] + ux * o, y - 1.25, c[2] + uz * o], 0.04, DARK);
    for (const s of [-1, 1]) beam(nb, [c[0] + sx * s * 0.08 - ux * 1.6, y - 1.25, c[2] + sz * s * 0.08 - uz * 1.6], [c[0] + sx * s * 0.08 + ux * 1.6, y - 1.25, c[2] + sz * s * 0.08 + uz * 1.6], 0.06, pick(NEONC)); void pr; }
}
// straight stair run alongside the facade (perpendicular to the skyway) from the deck end down to the pavement: stringers, treads,
// a landing at the deck, glass balustrade with a handrail, a column under the mid-span
function skyStair(v, g, P, t, side, hw, y, ys, st) {
  const rise = y - ys; const run = rise * 1.45; const sw = 1.5; const tc = t; // stair centre line at skyway coordinate t
  const s0 = side * (hw + 0.2), s1 = side * (hw + 0.2 + run); // lateral start (deck edge) -> end (ground)
  const Q = (s, dt, yy) => P(tc + dt, s, yy);
  beam(v, Q(side * (hw - 0.8), 0, y - 0.2), Q(s0 + side * 0.6, 0, y - 0.2), sw + 0.4, [0.4, 0.4, 0.41], 0.35); // landing
  for (const dt of [-sw / 2, sw / 2]) { beam(v, Q(s0, dt, y - 0.3), Q(s1, dt, ys + 0.05), 0.1, st, 0.32); beam(v, Q(s0, dt, y + 0.9), Q(s1, dt, ys + 1.0), 0.05, [0.7, 0.72, 0.74]); }
  const nt = Math.round(rise / 0.18); for (let i = 1; i < nt; i++) { const k = i / nt; const s = s0 + (s1 - s0) * k, yy = y - 0.2 - rise * k; beam(v, Q(s, -sw / 2, yy), Q(s, sw / 2, yy), 0.3, [0.35, 0.36, 0.37], 0.05); }
  for (const dt of [-sw / 2 - 0.02, sw / 2 + 0.02]) { const a = Q(s0, dt, 0), b = Q(s1, dt, 0), n = 6; for (let i = 0; i < n; i++) { const k0 = i / n, k1 = (i + 1) / n;
    const p0 = [a[0] + (b[0] - a[0]) * k0, a[2] + (b[2] - a[2]) * k0], p1 = [a[0] + (b[0] - a[0]) * k1, a[2] + (b[2] - a[2]) * k1]; const y0 = y - 0.2 - rise * k0, y1 = y - 0.2 - rise * k1;
    g.quad(new THREE.Vector3(p0[0], y0, p0[1]), new THREE.Vector3(p1[0], y1, p1[1]), new THREE.Vector3(p1[0], y1 + 0.95, p1[1]), new THREE.Vector3(p0[0], y0 + 0.95, p0[1]), [0, 0, 1, 0, 1, 1, 0, 1], {}); } }
  const sm = (s0 + s1) / 2; beam(v, Q(sm, 0, ys), Q(sm, 0, (y + ys) / 2 - 0.35), 0.35, st);
}
// ---------------------------------------------------------------- sky bridge ----
function skyBridge(W, it) {
  const { p, q, y } = it; const L = Math.hypot(q.x - p.x, q.z - p.z); const ux = (q.x - p.x) / L, uz = (q.z - p.z) / L; const sx = -uz, sz = ux;
  const v = W.b('vcol', p.x, p.z), nb = W.b('neon', p.x, p.z), g = W.b('glassRail', p.x, p.z);
  const P = (t, s, yy) => [p.x + ux * t + sx * s, yy, p.z + uz * t + sz * s];
  const hw = 3.2, H = 4.6; const st = pick([[0.18, 0.19, 0.2], [0.85, 0.85, 0.83], [0.5, 0.38, 0.24]]); const glow = pick(NEONC);
  beam(v, P(0, 0, y - 0.6), P(L, 0, y - 0.6), hw * 2, st, 1.2); beam(v, P(0, 0, y + H + 0.4), P(L, 0, y + H + 0.4), hw * 2 + 0.4, st, 0.8);
  const n = Math.max(3, Math.round(L / 4.5));
  for (let i = 0; i <= n; i++) { const t = (L * i) / n; for (const s of [-hw, hw]) beam(v, P(t, s, y - 0.6), P(t, s, y + H + 0.4), 0.35, st, 0.35); }
  for (const s of [-hw, hw]) { const gq = [P(0, s - 0.04, 0), P(L, s - 0.04, 0), P(L, s + 0.04, 0), P(0, s + 0.04, 0)].map((qq) => [qq[0], qq[2]]); prismWalls(g, gq, y, y + H, null);
    beam(v, P(0, s * 1.02, y + 1.05), P(L, s * 1.02, y + 1.05), 0.08, STEEL); // handrail line seen through the glass
    beam(nb, P(0, s * 1.03, y - 1.25), P(L, s * 1.03, y - 1.25), 0.1, glow, 0.1); beam(nb, P(0, s * 1.03, y + H + 0.85), P(L, s * 1.03, y + H + 0.85), 0.1, glow, 0.1); }
  beam(nb, P(1, 0, y + H - 0.05), P(L - 1, 0, y + H - 0.05), 0.8, [0.55, 0.58, 0.62], 0.05);
  // under-truss: two bottom chords + V diagonals
  for (const s of [-hw * 0.7, hw * 0.7]) { beam(v, P(0, s, y - 3.2), P(L, s, y - 3.2), 0.4, st);
    for (let i = 0; i < n; i++) { const t0 = (L * i) / n, t1 = (L * (i + 1)) / n; beam(v, P(t0, s, y - 1.2), P((t0 + t1) / 2, s, y - 3.2), 0.25, st); beam(v, P((t0 + t1) / 2, s, y - 3.2), P(t1, s, y - 1.2), 0.25, st); } }
}
// ------------------------------------------------------ cables across a street ----
function streetCables(W, it) {
  const { A, B, hmin } = it; const v = W.b('vcol', A.x, A.z);
  const n = randi(1, 3); const L = Math.hypot(B.x - A.x, B.z - A.z); const ux = (B.x - A.x) / L, uz = (B.z - A.z) / L; const sx = -uz, sz = ux;
  for (let i = 0; i < n; i++) { const off = rand(-4, 4); const ya = rand(5.5, Math.min(hmin - 1, 12)), yb = Math.min(hmin - 1, ya + rand(-1.5, 1.5));
    const a = [A.x + sx * off - ux * 0.2, ya, A.z + sz * off - uz * 0.2], b = [B.x + sx * off + ux * 0.2, yb, B.z + sz * off + uz * 0.2];
    cableBundle(v, a, b, rand(0.8, 2.0) + L * 0.03);
    for (const [q, d] of [[a, 1], [b, -1]]) beam(v, [q[0] - ux * d * 0.2, q[1] + 0.05, q[2] - uz * d * 0.2], [q[0] + ux * d * 0.35, q[1] + 0.05, q[2] + uz * d * 0.35], 0.1, DARK); }
  if (rng() < 0.55) { const off = rand(-5, 5); const ya = rand(4.5, Math.min(hmin - 1, 8)); laundryLine(W, [A.x + sx * off, ya, A.z + sz * off], [B.x + sx * off, ya + rand(-0.6, 0.6), B.z + sz * off], 0.6 + L * 0.03); }
  if (rng() < 0.35) { // hanging tube sign mid-street
    const t = rand(0.35, 0.65); const ya = rand(6, Math.min(hmin - 1, 9)); const c = [A.x + (B.x - A.x) * t, ya, A.z + (B.z - A.z) * t]; const nb = W.b('neon', c[0], c[2]);
    tube(v, [A.x, ya + 1.5, A.z], [B.x, ya + 1.5, B.z], 0.025, DARK, kg().tube4);
    for (const o of [-0.9, 0.9]) tube(v, [c[0] + sx * o, ya + 1.5 - 0.0, c[2] + sz * o], [c[0] + sx * o, ya + 0.45, c[2] + sz * o], 0.012, DARK, kg().tube4);
    beam(v, [c[0] - sx * 1.0, ya, c[2] - sz * 1.0], [c[0] + sx * 1.0, ya, c[2] + sz * 1.0], 0.12, [0.05, 0.05, 0.06], 0.9);
    const col = pick(NEONC); for (const d of [-1, 1]) { const o = d * 0.09; const ct = [c[0] + ux * o, ya, c[2] + uz * o];
      for (const [a0, a1] of [[-0.8, 0.8]]) for (const yy of [-0.32, 0.32]) tube(nb, [ct[0] + sx * a0, ya + yy, ct[2] + sz * a0], [ct[0] + sx * a1, ya + yy, ct[2] + sz * a1], 0.03, col);
      tube(nb, [ct[0] - sx * 0.5, ya - 0.2, ct[2] - sz * 0.5], [ct[0] + sx * 0.5, ya + 0.2, ct[2] + sz * 0.5], 0.03, col); }
  }
}
void polyCap; void rect;
