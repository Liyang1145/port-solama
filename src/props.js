// Street furniture: cobra-head street lights (+ light pools + nearest real lights), awnings, neon signs,
// beach lifeguard towers, umbrellas, traffic signals.
import * as THREE from 'three';
import { prep, M } from './mats.js';
import { U } from './env.js';
import { GeoBucket, box, prismWalls, rect } from './geo.js';
import { mulberry } from './util.js';
import { LAYOUT } from './city.js';
import { serviceLanes } from './maps/gta/backlot.js';
import { CYBER } from './mapsel.js';
import { SHOPS } from './maps/gta/shoppools.js'; // a_shopnight2
import { furnMat, PB, stampAO, signalMastA, signalMastFarA, pedPoleA, hydrantA, bikeRackA, recycleBinA } from './streetkit.js';

// a_props (map 索拉纳港): fine-detail parts (bolts, chains, buttons, cables, louvres) go into 160 m chunk meshes that are only
// drawn within ~120 m of the camera; coarse parts merge into one always-on mesh per prop family.
const FINE = new Map(), FINE_MESHES = [];
function fineB(x, z) { const ix = Math.floor(x / 160), iz = Math.floor(z / 160), k = ix + ',' + iz; let e = FINE.get(k);
  if (!e) FINE.set(k, e = { b: new GeoBucket({ aPbr: 3 }), x0: ix * 160, z0: iz * 160 }); return e.b; }
// masts additionally: full model in 320 m 'mid' chunks drawn within ~260 m, a ~120-triangle far model in the same chunks otherwise
const MIDF = new Map();
function midB(x, z) { const ix = Math.floor(x / 320), iz = Math.floor(z / 320), k = ix + ',' + iz; let e = MIDF.get(k);
  if (!e) MIDF.set(k, e = { b: new GeoBucket({ aPbr: 3 }), f: new GeoBucket({ aPbr: 3 }), x0: ix * 320, z0: iz * 320 }); return e; }
function flushFine(scene) {
  for (const e of FINE.values()) if (e.b.vc) { const m = new THREE.Mesh(e.b.build(), furnMat()); m.receiveShadow = true; m.visible = false; scene.add(m); FINE_MESHES.push({ m, x0: e.x0, z0: e.z0, s: 160, r: 120 }); }
  FINE.clear();
  for (const e of MIDF.values()) if (e.b.vc) { const m = new THREE.Mesh(e.b.build(), furnMat()); m.castShadow = true; m.receiveShadow = true; m.visible = false; scene.add(m);
    const f = new THREE.Mesh(e.f.build(), furnMat()); f.castShadow = true; scene.add(f); FINE_MESHES.push({ m, far: f, x0: e.x0, z0: e.z0, s: 320, r: 260 }); }
  MIDF.clear();
}
function stampMast(parts, far, m, y0) { const e = new THREE.Vector3().setFromMatrixPosition(m); const c = midB(e.x, e.z); stampAO(c.b, parts, m, y0, 0); stampAO(c.f, far, m, y0, 0); stampAO(fineB(e.x, e.z), parts, m, y0, 1); }
// stamp a part list: lod-0 parts into the coarse bucket, lod-1 parts into the chunk bucket at (x, z); AO baked against ground y0
function stampLod(coarse, parts, m, y0) { const e = new THREE.Vector3().setFromMatrixPosition(m); stampAO(coarse, parts, m, y0, 0); stampAO(fineB(e.x, e.z), parts, m, y0, 1); }


function streetLightGeo() {
  const b = new GeoBucket();
  const pole = new THREE.CylinderGeometry(0.09, 0.14, 9, 8); pole.translate(0, 4.5, 0); b.geom(pole, new THREE.Matrix4());
  const base = new THREE.CylinderGeometry(0.22, 0.26, 0.6, 8); base.translate(0, 0.3, 0); b.geom(base, new THREE.Matrix4());
  // curved arm approximated by 3 segments reaching +z (local forward = arm direction)
  const pts = [[0, 8.6, 0], [0, 9.1, 0.8], [0, 9.25, 2.0], [0, 9.2, 3.0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), c = new THREE.Vector3(...pts[i + 1]); const len = a.distanceTo(c);
    const g = new THREE.CylinderGeometry(0.05, 0.06, len, 6); g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
    b.geom(g, new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  }
  const head = new THREE.BoxGeometry(0.42, 0.16, 0.95); head.translate(0, 9.13, 3.05); b.geom(head, new THREE.Matrix4());
  return b.build();
}

// ---------- v3.5 detailed prop geometry (shared, merged into the per-prop buckets) ----------
const PG = {};
// ribbed 8-panel market/beach umbrella: canopy sags between ribs, scalloped valance, ribs, finial
function umbrellaGeo(R = 1.25, H = 0.45, y = 2.25) {
  const key = 'u' + R + H + y; if (PG[key]) return PG[key];
  const N = 8, S = 3; const p = [], idx = []; let vi = 0;
  const pt = (a, t) => { const rr = R * t; const sag = Math.sin(t * Math.PI) * 0.06 * R; const panel = Math.abs(Math.cos(a * N / 2)); // 1 on ribs, 0 mid-panel
    return [Math.cos(a) * rr * (1 - 0.04 * (1 - panel)), y + H * (1 - t) - sag * (1 - panel) - (1 - panel) * 0.05 * t, Math.sin(a) * rr * (1 - 0.04 * (1 - panel))]; };
  const NA = N * 2;
  for (let i = 0; i <= NA; i++) for (let k = 0; k <= S; k++) p.push(...pt(i / NA * Math.PI * 2, k / S));
  for (let i = 0; i < NA; i++) for (let k = 0; k < S; k++) { const a = i * (S + 1) + k, b = a + S + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  vi = p.length / 3;
  // valance: short vertical skirt with scallops
  for (let i = 0; i <= NA; i++) { const a = i / NA * Math.PI * 2; const e = pt(a, 1); const sc = 0.07 + 0.05 * Math.abs(Math.sin(a * N)); p.push(e[0], e[1], e[2], e[0], e[1] - sc, e[2]); }
  for (let i = 0; i < NA; i++) { const a = vi + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.length / 3 * 2), 2));
  const cloth = g.toNonIndexed(); cloth.computeVertexNormals();
  const parts = [];
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; const e = pt(a, 0.98); const r = new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(R, H), 3, 1, true); r.translate(0, Math.hypot(R, H) / 2, 0);
    r.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, y + H, 0), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(e[0], e[1] - y - H - 0.02, e[2]).normalize()), new THREE.Vector3(1, 1, 1))); parts.push(r); }
  const fin = new THREE.SphereGeometry(0.05, 8, 6); fin.translate(0, y + H + 0.04, 0); parts.push(fin);
  PG[key] = { cloth, frame: mergeG(parts) }; return PG[key];
}
function mergeG(gs) {
  const p = [], n = [], uv = [], ix = []; let off = 0;
  for (const g of gs) { const P = g.attributes.position, N = g.attributes.normal; for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(0, 0); }
    if (g.index) for (let i = 0; i < g.index.count; i++) ix.push(off + g.index.getX(i)); else for (let i = 0; i < P.count; i++) ix.push(off + i); off += P.count; }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); o.setIndex(ix); return o;
}
const XF = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
// slatted bench with cast-iron scroll side frames (local: seat along z, back toward -x)
function benchGeo(L = 1.8) {
  if (PG['b' + L]) return PG['b' + L];
  const wood = [], iron = [];
  for (let k = 0; k < 5; k++) wood.push(XF(new THREE.BoxGeometry(0.085, 0.035, L), -0.18 + k * 0.095, 0.45, 0));
  for (let k = 0; k < 3; k++) { const y = 0.62 + k * 0.11; wood.push(XF(new THREE.BoxGeometry(0.03, 0.08, L), -0.29 - (y - 0.55) * 0.28, y, 0, 0, 0, -0.27)); }
  const sh = new THREE.Shape(); // side frame profile in (x = depth, y = height)
  sh.moveTo(-0.24, 0); sh.lineTo(-0.17, 0); sh.quadraticCurveTo(-0.16, 0.3, -0.2, 0.42); sh.lineTo(0.24, 0.42); sh.quadraticCurveTo(0.2, 0.2, 0.25, 0); sh.lineTo(0.32, 0);
  sh.quadraticCurveTo(0.27, 0.25, 0.3, 0.47); sh.lineTo(0.2, 0.47); sh.quadraticCurveTo(0.24, 0.62, 0.1, 0.66); sh.lineTo(0.06, 0.6); sh.lineTo(-0.24, 0.47); sh.lineTo(-0.37, 0.95); sh.lineTo(-0.42, 0.95); sh.lineTo(-0.31, 0.45); sh.quadraticCurveTo(-0.28, 0.2, -0.24, 0);
  for (const s of [-1, 1]) { const f = new THREE.ExtrudeGeometry(sh, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 }); f.translate(0, 0, -0.0225); iron.push(XF(f, 0, 0, s * (L / 2 - 0.12))); }
  PG['b' + L] = { wood: mergeG(wood.map((g) => g.index ? g.toNonIndexed() : g)), iron: mergeG(iron.map((g) => g.index ? g.toNonIndexed() : g)) }; return PG['b' + L];
}
// cobra-head street light: tapered 12-sided pole with base plinth + collar, smooth tube arm, lathe luminaire with lens
function streetLightGeo2() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.075, 0.14, 8.8, 12); pole.translate(0, 4.4, 0); parts.push(pole);
  const plinth = new THREE.CylinderGeometry(0.24, 0.3, 0.55, 12); plinth.translate(0, 0.275, 0); parts.push(plinth);
  const collar = new THREE.CylinderGeometry(0.17, 0.24, 0.12, 12); collar.translate(0, 0.6, 0); parts.push(collar);
  for (let k = 0; k < 4; k++) { const b = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 6); b.translate(Math.cos(k * 1.57 + 0.78) * 0.2, 0.58, Math.sin(k * 1.57 + 0.78) * 0.2); parts.push(b); }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 8.4, 0), new THREE.Vector3(0, 8.95, 0.25), new THREE.Vector3(0, 9.2, 1.1), new THREE.Vector3(0, 9.22, 2.2), new THREE.Vector3(0, 9.18, 2.7)]);
  const arm = new THREE.TubeGeometry(curve, 16, 0.055, 8, false); parts.push(arm);
  // luminaire: lathe profile (radius, z) rotated to lie along +z
  const lp = [[0.0, -0.05], [0.12, -0.02], [0.2, 0.15], [0.22, 0.45], [0.2, 0.75], [0.12, 0.92], [0.0, 0.95]].map(([r, z]) => new THREE.Vector2(r, z));
  const lum = new THREE.LatheGeometry(lp, 16); lum.scale(1, 1, 0.55); // flatten (y after rotation)
  lum.rotateX(Math.PI / 2); lum.scale(1, 1, 1); lum.translate(0, 9.2, 2.6); parts.push(lum.index ? lum.toNonIndexed() : lum);
  return mergeG(parts.map((g) => g.index ? g.toNonIndexed() : g));
}

// a_nightfix: 1.05 m beach bollard (8-sided open post, lens gap 0.875..0.955 m, cap; ~80 triangles) on the street-light material
function bollardGeo() { const parts = []; const cy = (r0, r1, y0, y1, open) => { const c = new THREE.CylinderGeometry(r1, r0, y1 - y0, 8, 1, open); c.translate(0, (y0 + y1) / 2, 0); parts.push(c); };
  cy(0.135, 0.13, 0, 0.05, true); cy(0.11, 0.1, 0.05, 0.86, true); cy(0.112, 0.112, 0.86, 0.875, true); cy(0.112, 0.112, 0.955, 0.97, true); // plinth, post, lens rings (lens = lamp-glow band 0.875..0.955)
  const cap = new THREE.CylinderGeometry(0.09, 0.118, 0.07, 8, 1, false); cap.translate(0, 1.005, 0); parts.push(cap);
  return mergeG(parts.map((g) => g.index ? g.toNonIndexed() : g)); }
// a_nightfix: where the beach lights stand. Bollards: on the promenade side of the low beach wall (x1 - 0.67, 0.17 m from its inner
// face) every 15 m, not within 4.5 m of a beach-access stair, a lamp or a tree; two at the foot of every access ramp (z +-2.0, the
// ramp is +-1.2 wide) on the sand. Lifeguard towers: one lamp under the roof edge over the ramp (water side). Pools: wall bollards
// spill 4-5 m onto the sand, the ramp pair lights the ramp foot, the tower lamp its ramp and the sand around it; the open sand stays
// dark. One OBB collider per bollard (8-gon r 0.11: half 0.784 r, a_polecol). Fixed positions: no random draws.
function beachNight(city) { const posts = [], lenses = [], pools = []; const col = city.col; const S = { wall: 0, ramp: 0, towers: 0, skipped: 0 };
  const gh = (x, z) => Math.max(0, city.groundH(x, z));
  const clear = (x, z) => { const l = col.query(x, z, 0.6); for (const b of l) if (b.maxX > x - 0.16 && b.minX < x + 0.16 && b.maxZ > z - 0.16 && b.minZ < z + 0.16 && b.h > 0.3) return false;
    if (city.lamps.some((l) => Math.abs(l.x - x) < 4.5 && Math.abs(l.z - z) < 4.5)) return false;
    for (const L of [city.palms, city.trees]) if (L && L.some((p) => Math.abs(p.x - x) < 1.2 && Math.abs(p.z - z) < 1.2)) return false; return true; };
  const post = (x, z) => { const y = gh(x, z); posts.push([x, y, z]); lenses.push([x, y + 0.875, z, 0.19, 0.08]); const h = 0.784 * 0.11; col.addOBB(x, z, 1, 0, h, h, 1.05, 'bollard'); };
  for (const b of city.blocks || []) { if (b.area !== 'promenade') continue; const zc = (b.z0 + b.z1) / 2 + 22, xw = b.x1 - 0.67;
    for (let z = b.z0 + 8; z <= b.z1 - 8; z += 15) { if (Math.abs(z - zc) < 4.5) continue; if (!clear(xw, z)) { S.skipped++; continue; } post(xw, z); S.wall++;
      const yp = Math.max(gh(xw, z), gh(b.x1 + 3, z)) + 0.05; pools.push([b.x1 + 0.2, z, 10.5, 8.5, yp]); }
    const xr = b.x1 + 6.2; for (const s of [-1, 1]) { const z = zc + s * 2.0; if (!clear(xr, z)) { S.skipped++; continue; } post(xr, z); S.ramp++; }
    pools.push([b.x1 + 6.6, zc, 9, 10]); }
  for (const lg of city.deco.lifeguards) { const y0 = city.groundH(lg.x, lg.z); lenses.push([lg.x + 1.05, y0 + 4.36, lg.z, 0.2, 0.12]); pools.push([lg.x + 3.2, lg.z, 13, 11]); S.towers++; }
  return { posts, lenses, pools, S }; }

// a_portlamps (map A, ?oldaportlamps = off): believable port fixtures at night.
// Marina piers: the a_nightfix low bollard (same geometry / lampMat / lamp-glow lens) on both deck edges every 12 m, half-way between
// the edge piles (piles every 4 m from x0+1), 0.25 m in from the edge; a candidate inside a moored yacht's boarding gap (its aft
// cockpit, x-Lh/2-0.6 .. x-0.3Lh+0.6 on that side) slides +-1/3/5 m (never onto a pile) or is dropped; the last one stays 3 m off the
// seawall. Each bollard's pool is an ellipse on the deck (7 x 3 m, never past the deck edge). One OBB collider each (half 0.086 m).
// North-bay shipyard gantry: 2 round high-bay floods under each beam (the bollard body scaled into a drum, lens disc underneath),
// one big ground pool per flood pair biased into the yard, and a long light cone per flood (instances of the street-light cone).
// Fixed positions, no random draws.
function portNight(city) { const posts = [], lenses = [], pools = [], cones = []; const col = city.col; const S = { bollards: 0, slid: 0, dropped: 0, floods: 0, spacing: [] };
  for (const l of city.lamps) { if (l.kind !== 'dock' || !l.pier) continue; const [x0, x1, pz, hw] = l.pier; const y = l.y;
    for (const sd of [-1, 1]) { const zb = pz + sd * (hw - 0.25); let last = null;
      const gaps = (l.berths || []).filter((b) => b[1] === sd).map(([bx, , Lh]) => [bx - Lh / 2 - 0.6, bx - Lh * 0.3 + 0.6]);
      for (let xc = x0 + 7; xc <= x1 - 3; xc += 12) { let put = null;
        for (const o of [0, -1, 1, -3, 3, -5, 5]) { const x = xc + o; if (x < x0 + 5 || x > x1 - 3) continue;
          const pd = Math.abs(((x - x0 - 1) % 4 + 4) % 4); if (Math.min(pd, 4 - pd) < 0.6) continue; // edge pile
          if (gaps.some(([a, b]) => x > a && x < b)) continue; put = x; if (o) S.slid++; break; }
        if (put === null) { S.dropped++; continue; }
        posts.push([put, y, zb, 1, 1]); lenses.push([put, y + 0.875, zb, 0.19, 0.08]); const h = 0.784 * 0.11; col.addOBB(put, zb, 1, 0, h, h, y + 1.05, 'bollard');
        pools.push([put, pz + sd * 0.25, 7, 3.0, y + 0.045]); S.bollards++; if (last !== null) S.spacing.push(+(put - last).toFixed(1)); last = put; } } }
  for (const yd of city.yards || []) { if (yd.kind !== 'shipyard') continue; const gx0 = yd.x0 + 3, gx1 = yd.x1 - 3, gz = yd.z0 + 2; const yb = 21.6; // gantry: beams y 22..24 at gz +-3, trolley at the middle
    const gy = Math.max(0.2, city.groundH((gx0 + gx1) / 2, gz + 4)) + 0.05;
    for (const t of [0.24, 0.76]) { const fx = gx0 + (gx1 - gx0) * t;
      for (const dz of [-3, 3]) { posts.push([fx, yb, gz + dz, 2.6, 0.35]); lenses.push([fx, yb - 0.012, gz + dz, 0.62, 0.03]); cones.push([fx, yb - 0.05, gz + dz, 2.4, 1.25]); S.floods++; }
      pools.push([fx, gz + 4, 26, 21, gy]); } }
  return { posts, lenses, pools, cones, S }; }

export function buildProps(scene, city, T) {
  const out = { lampLights: [] };
  const r = mulberry(99);
  // ---------- street lights
  const lampGeo = streetLightGeo2();
  const lampMat = prep(new THREE.MeshStandardMaterial({ color: 0x6b6e70, roughness: 0.5, metalness: 0.7 }), 'lamp');
  const lamps = city.lamps;
  const im = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length); im.castShadow = true; im.receiveShadow = true;
  const glowGeo = new THREE.PlaneGeometry(0.34, 0.8); glowGeo.rotateX(Math.PI / 2); glowGeo.translate(0, 9.05, 2.95);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb36b, toneMapped: true });
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, lamps.length);
  // ground light pools (additive decals)
  const poolGeo = new THREE.PlaneGeometry(16, 16); poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uNight: U.uNight, uCol: { value: CYBER ? new THREE.Color(0.45, 0.78, 1.0) : new THREE.Color(1.0, 0.62, 0.32) } }, // r6.0: cool LED lamps only on map 霓港
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uNight; uniform vec3 uCol; varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0; float a = pow(max(1.0-d,0.0),2.2); gl_FragColor = vec4(uCol * a * uNight * 0.55, 1.0); }',
  });
  // a_nightcheck (map A, ?oldanight = off): the 「海风之眼」 wheel's bulb rings lit nothing below -> two extra instances of this pool
  // (same draw, same program): an ellipse along the rim plane on each side of the boarding deck, which hides the centre (landmarks(): x 384, z 352)
  // a_portnight (map A, ?oldaportnight = off): port-area night fixes
  const OLD_PN = CYBER || /[?&]oldaportnight\b/.test(typeof location !== 'undefined' ? location.search : '');
  const xPools = CYBER || /[?&]oldanight\b/.test(typeof location !== 'undefined' ? location.search : '') ? [] : [[384, 344.6, 30, 14], [384, 359.4, 30, 14]];
  // a_nightfix (map A, ?oldanight2 / ?oldanight = off): low beach bollards (beach wall along the promenade, both sides of every
  // beach-access ramp foot) and a lamp on each lifeguard tower, each with its pool as more instances of this same pool mesh
  const BN = CYBER || /[?&]oldanight2?\b/.test(typeof location !== 'undefined' ? location.search : '') ? null : beachNight(city);
  if (BN) for (const q of BN.pools) xPools.push(q);
  const PN = CYBER || /[?&]oldaportlamps\b/.test(typeof location !== 'undefined' ? location.search : '') ? null : portNight(city); // a_portlamps
  if (PN) for (const q of PN.pools) xPools.push(q);
  // a_shopnight2 (map A; ?oldashop2 = none): island storefront pools (open shops only, from shoppools.js) as SHOP_CAP more instances
  // of this same pool mesh (same draw, same program), refilled by updateProps with the open shops within 200 m of the camera
  const SHOP_CAP = !CYBER && SHOPS.isl.length ? 384 : 0, nFix = lamps.length + xPools.length;
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, nFix + SHOP_CAP); pools.renderOrder = 2;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
  const lampM = [];
  lamps.forEach((l, i) => {
    const ang = Math.atan2(l.dir[0], l.dir[1]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    m4.compose(new THREE.Vector3(l.x, l.y, l.z), q, s1); im.setMatrixAt(i, m4); glow.setMatrixAt(i, m4); const a = m4.clone();
    const hx = l.x + l.dir[0] * 3.05, hz = l.z + l.dir[1] * 3.05; l.hx = hx; l.hz = hz; l.hy = l.y + 9.0;
    if (l.pool && !OLD_PN) { const [px, pz, sx, sz] = l.pool; m4.compose(new THREE.Vector3(px, l.y + 0.04, pz), new THREE.Quaternion(), new THREE.Vector3(sx / 16, 1, sz / 16)); } // a_portnight: marina pier lamp -> pool on the deck only (was a 16 m disc, 78% of it hovering 1.2 m over the water / through the moored yachts)
    else m4.compose(new THREE.Vector3(hx, 0.04 + (city.groundH(hx, hz) > 0.1 ? 0.15 : 0), hz), new THREE.Quaternion(), s1); pools.setMatrixAt(i, m4); lampM.push([a, m4.clone(), l.x, l.z]);
  });
  xPools.forEach(([x, z, sx, sz, py], k) => { m4.compose(new THREE.Vector3(x, py !== undefined ? py : Math.max(0, city.groundH(x, z)) + 0.16, z), new THREE.Quaternion(), new THREE.Vector3(sx / 16, 1, sz / 16)); pools.setMatrixAt(lamps.length + k, m4); }); // + 0.16: clears the sand ripple
  // light2: night light cones under the luminaires (in-scattering in the humid air): additive open cone, brightest just under
  // the lamp head, fading toward its rim (view-facing ratio) and the ground; warm sodium/LED white on 索拉纳港, the cyan/magenta
  // lamp tints on 霓港 (denser, rain-hazed air). One instanced draw, no depth reads.
  const coneGeo = new THREE.CylinderGeometry(0.16, 4.6, 8.6, 20, 6, true); coneGeo.translate(0, 9.0 - 4.3, 2.95);
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uNight: U.uNight, uK: { value: CYBER ? 0.11 : 0.06 } },
    vertexShader: `varying vec3 vC; varying float vH; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ vC = vec3(1.0, 0.66, 0.36);
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
        vH = clamp((9.0 - position.y) / 8.6, 0.0, 1.0); vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * vec3(normal.x, 0.0, normal.z)); vV = cameraPosition - wp.xyz; vD = length(vV);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uNight, uK; varying vec3 vC; varying float vH; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV)));            // 1 at the cone's centre line, 0 at its silhouette
        float a = pow(f, 2.2) * pow(1.0 - vH, 1.6) * smoothstep(1.0, 0.72, vH) * (0.35 + 0.65 * smoothstep(0.0, 0.08, vH));
        a *= smoothstep(220.0, 60.0, vD) * smoothstep(1.5, 5.0, vD);                // no accumulation of far cones, no wash when standing inside
        gl_FragColor = vec4(vC * a * uK * smoothstep(0.35, 0.9, uNight), 1.0); }`,
  });
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length + (PN ? PN.cones.length : 0)); cones.renderOrder = 3;
  { const cA = new THREE.Color(1.0, 0.66, 0.36), cL = new THREE.Color(1.0, 0.86, 0.68), cC = new THREE.Color(0.45, 0.82, 1.0), cM = new THREE.Color(1.0, 0.35, 0.85);
    lamps.forEach((l, i) => { const c = CYBER ? (i % 3 === 2 ? cM : cC) : (i % 4 === 3 ? cL : cA); l.mag = CYBER && i % 3 === 2; l.led = !CYBER && i % 4 === 3; cones.setMatrixAt(i, lampM[i][0]); cones.setColorAt(i, c); lampM[i].push(c); });
    if (PN) PN.cones.forEach(([x, y, z, sy, k], j) => { m4.compose(new THREE.Vector3(x, y - 9.0 * sy, z - 2.95 * k), new THREE.Quaternion(), new THREE.Vector3(k, sy, k)); cones.setMatrixAt(lamps.length + j, m4); cones.setColorAt(lamps.length + j, cA); }); } // a_portlamps: gantry flood cones (apex at the lens)
  if (BN && BN.posts.length) { // a_nightfix: bollard bodies on the street-light material, lenses / tower lamps on the lamp-glow material (same objects -> same programs)
    const bm = new THREE.InstancedMesh(bollardGeo(), lampMat, BN.posts.length); bm.castShadow = true; bm.receiveShadow = true;
    BN.posts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); bm.setMatrixAt(i, m4); }); bm.computeBoundingSphere(); scene.add(bm);
    const lg = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true); lg.translate(0, 0.5, 0); const lm = new THREE.InstancedMesh(lg, glowMat, BN.lenses.length);
    BN.lenses.forEach(([x, y, z, sx, sy], i) => { m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sx)); lm.setMatrixAt(i, m4); }); lm.computeBoundingSphere(); scene.add(lm);
    out.beachNight = { posts: BN.posts.length, pools: BN.pools.length, lenses: BN.lenses.length, tris: bm.geometry.index ? bm.geometry.index.count / 3 * BN.posts.length : 0 }; }
  if (PN && PN.posts.length) { // a_portlamps: pier bollards + gantry flood drums on the street-light material, lenses on the lamp-glow material (same objects -> same programs)
    const pm = new THREE.InstancedMesh(bollardGeo(), lampMat, PN.posts.length); pm.castShadow = true; pm.receiveShadow = true;
    PN.posts.forEach(([x, y, z, sx, sy], i) => { m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sx)); pm.setMatrixAt(i, m4); }); pm.computeBoundingSphere(); pm.name = 'portLamps'; scene.add(pm);
    const lg = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false); lg.translate(0, 0.5, 0); const lm = new THREE.InstancedMesh(lg, glowMat, PN.lenses.length);
    PN.lenses.forEach(([x, y, z, sx, sy], i) => { m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sx)); lm.setMatrixAt(i, m4); }); lm.computeBoundingSphere(); scene.add(lm);
    out.portNight = pm.userData.stats = Object.assign({ posts: PN.posts.length, lenses: PN.lenses.length, pools: PN.pools.length, cones: PN.cones.length }, PN.S); }
  for (const x of [im, glow, pools, cones]) { x.computeBoundingSphere(); if (CYBER) x.frustumCulled = false; scene.add(x); }
  // v4.4: the map has thousands of lamps -> only the ones within 450 m of the camera are drawn (re-packed every 25 m moved)
  if (CYBER) out.lampCull = { im, glow, pools, cones, lampM, lx: 1e9, lz: 1e9 }; // r6.0: lamp culling only on map 霓港
  out.lampGlow = glowMat; out.pools = pools;
  if (SHOP_CAP) { pools.count = nFix; pools.computeBoundingSphere(); out.shopPools = { m: pools, nFix, cap: SHOP_CAP, at: null, n: 0 }; } // a_shopnight2
  // a pool of real point lights that follow the nearest lamps at night
  for (let i = 0; i < 10; i++) { const pl = new THREE.PointLight(0xffa860, 0, 30, 1.6); pl.castShadow = false; scene.add(pl); out.lampLights.push(pl); }
  // v4.1 neon practicals: 6 coloured point lights follow the nearest hotel neon signs at night (pink / cyan pools on the pavement)
  out.neonLights = []; for (let i = 0; i < 6; i++) { const pl = new THREE.PointLight(0xff60a0, 0, 22, 1.8); scene.add(pl); out.neonLights.push(pl); }

  // ---------- awnings (striped cloth, slanted)
  {
    const g = new GeoBucket();
    // v3.5: curved (convex) striped canopy, scalloped valance per stripe, triangular side cheeks, metal frame (front bar + arms)
    const P = (x, y, z) => new THREE.Vector3(x, y, z); const UV = [0, 0, 1, 0, 1, 1, 0, 1];
    const fr = [0.18, 0.18, 0.19];
    for (const a of city.awnings) {
      const n = Math.max(2, Math.round((a.z1 - a.z0) / 0.9)); const sg = a.out > 0 ? 1 : -1; const S = 4;
      const prof = []; for (let i = 0; i <= S; i++) { const t = i / S; prof.push([a.x0 + a.out * t, a.y + 0.6 - 0.8 * t + Math.sin(t * Math.PI) * 0.12]); }
      const q = (A, B, C, D, c) => (sg > 0 ? g.quad(A, B, C, D, UV, {}, c) : g.quad(B, A, D, C, UV, {}, c));
      for (let k = 0; k < n; k++) {
        const z0 = a.z0 + (a.z1 - a.z0) * k / n, z1 = a.z0 + (a.z1 - a.z0) * (k + 1) / n; const zm = (z0 + z1) / 2;
        const c = k % 2 ? a.color : [0.95, 0.93, 0.88];
        for (let i = 0; i < S; i++) { const [xa, ya] = prof[i], [xb, yb] = prof[i + 1]; q(P(xa, ya, z0), P(xa, ya, z1), P(xb, yb, z1), P(xb, yb, z0), c); }
        const [xe, ye] = prof[S]; // scalloped valance: two quads meeting at a lower midpoint
        q(P(xe, ye, z0), P(xe, ye, zm), P(xe, ye - 0.4, zm), P(xe, ye - 0.27, z0), c);
        q(P(xe, ye, zm), P(xe, ye, z1), P(xe, ye - 0.27, z1), P(xe, ye - 0.4, zm), c);
      }
      // side cheeks (fan of triangles from the wall top corner)
      for (const [z, side] of [[a.z0, -1], [a.z1, 1]]) {
        const c = a.color; for (let i = 0; i < S; i++) { const [xa, ya] = prof[i], [xb, yb] = prof[i + 1]; const w = P(a.x0, a.y - 0.25, z);
          if (side * sg > 0) g.quad(w, P(xa, ya, z), P(xb, yb, z), P(xb, yb, z), UV, {}, c); else g.quad(w, P(xb, yb, z), P(xa, ya, z), P(xa, ya, z), UV, {}, c); }
      }
      // frame: front bar + arms from the wall to the front edge
      const [xe, ye] = prof[S]; const bar = new THREE.CylinderGeometry(0.025, 0.025, a.z1 - a.z0, 6); bar.rotateX(Math.PI / 2); bar.translate(xe - sg * 0.03, ye - 0.02, (a.z0 + a.z1) / 2); g.geom(bar, new THREE.Matrix4(), {}, fr);
      const na = Math.max(2, Math.round((a.z1 - a.z0) / 3)); for (let k = 0; k <= na; k++) { const z = a.z0 + 0.1 + (a.z1 - a.z0 - 0.2) * k / na; const A = new THREE.Vector3(a.x0, a.y - 0.25, z), B = new THREE.Vector3(xe - sg * 0.05, ye - 0.02, z);
        const len = A.distanceTo(B); const r = new THREE.CylinderGeometry(0.018, 0.018, len, 5); r.translate(0, len / 2, 0); r.applyMatrix4(new THREE.Matrix4().compose(A, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1))); g.geom(r, new THREE.Matrix4(), {}, fr); }
    }
    if (g.vc) { const m = new THREE.Mesh(g.build(), M.vcolCloth); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // ---------- neon / letter signs (canvas atlas)
  {
    const cellsV = [], cellsH = [];
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024; const gv0 = cv.getContext('2d');
    const ch = document.createElement('canvas'); ch.width = 2048; ch.height = 2048; const gh0 = ch.getContext('2d');
    // r6.1 索拉纳港 (map A, strictly non-neon): painted enamel channel letters by day (deep Deco colours, cream edge, no glow);
    // a second, warm-only canvas is the emissive map -> at night the letters glow like incandescent marquee bulbs, never neon
    const PAINT = ['#1f3f5b', '#0f5a57', '#8a3b2a', '#23262b', '#6a2f4f', '#b0662a', '#2f4d2a', '#1b2f4a'];
    const cvE = CYBER ? null : document.createElement('canvas'), chE = CYBER ? null : document.createElement('canvas');
    if (!CYBER) { cvE.width = 2048; cvE.height = 1024; chE.width = 2048; chE.height = 2048; }
    const gvE = cvE && cvE.getContext('2d'), ghE = chE && chE.getContext('2d');
    const both = (a, b, fn) => { fn(a, false); if (b) fn(b, true); };
    const gv = { set font(v) { gv0.font = v; if (gvE) gvE.font = v; }, set textAlign(v) { gv0.textAlign = v; if (gvE) gvE.textAlign = v; }, set textBaseline(v) { gv0.textBaseline = v; if (gvE) gvE.textBaseline = v; },
      save() { gv0.save(); gvE && gvE.save(); }, restore() { gv0.restore(); gvE && gvE.restore(); }, translate(x, y) { gv0.translate(x, y); gvE && gvE.translate(x, y); } };
    const gh = { set font(v) { gh0.font = v; if (ghE) ghE.font = v; }, set textAlign(v) { gh0.textAlign = v; if (ghE) ghE.textAlign = v; }, set textBaseline(v) { gh0.textBaseline = v; if (ghE) ghE.textBaseline = v; },
      save() { gh0.save(); ghE && ghE.save(); }, restore() { gh0.restore(); ghE && ghE.restore(); }, translate(x, y) { gh0.translate(x, y); ghE && ghE.translate(x, y); } };
    const letter = (g0, gE, txt, x, y, c, i, maxW) => {
      if (CYBER) { g0.shadowColor = c; g0.shadowBlur = maxW ? 22 : 18; g0.fillStyle = c; g0.fillText(txt, x, y, maxW); g0.shadowBlur = 0; g0.fillStyle = '#fff'; g0.globalAlpha = maxW ? 0.6 : 0.65; g0.fillText(txt, x, y, maxW); g0.globalAlpha = 1; return; }
      const pc = PAINT[i % PAINT.length];
      both(g0, gE, (g, em) => { g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = em ? '#7a4a1c' : '#f1e6cf'; g.strokeText(txt, x, y, maxW); // cream return edge
        g.fillStyle = em ? '#ffd59c' : pc; g.fillText(txt, x, y, maxW); });
    };
    const names = ['CORALINE', 'SANDPIPER', 'LA PALOMA', 'SEAGRAPE', 'BRISA MAR', 'ALBATROSS', 'STARLIGHT', 'MARIGOLD', 'HALCYON', 'SOLANA', 'BLUE HERON', 'CASA LUNA', 'HOTEL', 'CAFE', 'OCEAN GRILL', 'SURF SHOP'];
    const colors = ['#ff5fa2', '#59f3ff', '#ffb347', '#b78cff', '#ff6f61', '#7dffb2', '#ffe6a0', '#ff8ad8'];
    for (let i = 0; i < 8; i++) { // vertical cells 256x1024
      const name = names[i]; const c = colors[i];
      gv.save(); gv.translate(i * 256, 0);
      gv.font = 'bold 120px "Anton", Impact, sans-serif'; gv.textAlign = 'center'; gv.textBaseline = 'middle';
      const letters = name.replace(' ', '').split('').slice(0, 8); const step = 1000 / letters.length;
      letters.forEach((L, k) => letter(gv0, gvE, L, 128, 30 + step * (k + 0.5), c, i, undefined));
      gv.restore(); cellsV.push(i);
    }
    for (let i = 0; i < 16; i++) { // horizontal cells 1024x256
      const name = names[i % names.length]; const c = colors[i % colors.length];
      const x = (i % 2) * 1024, y = Math.floor(i / 2) * 256;
      gh.save(); gh.translate(x, y);
      gh.font = (i % 3 === 0 ? 'italic ' : '') + 'bold 150px "Anton", Impact, sans-serif'; gh.textAlign = 'center'; gh.textBaseline = 'middle';
      letter(gh0, ghE, name, 512, 130, c, i + 3, 980);
      gh.restore(); cellsH.push(i);
    }
    const mkMat = (cv, cvE2) => {
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      let te = t; if (cvE2) { te = new THREE.CanvasTexture(cvE2); te.colorSpace = THREE.SRGBColorSpace; te.anisotropy = 8; }
      return prep(new THREE.MeshStandardMaterial({ map: t, emissiveMap: te, emissive: 0xffffff, emissiveIntensity: 0.0, transparent: true, alphaTest: 0.08, roughness: CYBER ? 0.4 : 0.55, metalness: CYBER ? 0.2 : 0.1, side: THREE.DoubleSide, depthWrite: false }), CYBER ? 'sign' : 'signp');
    };
    const mv = mkMat(cv, cvE), mh = mkMat(ch, chE); out.signMats = [mv, mh];
    const bv = new GeoBucket(), bh = new GeoBucket();
    let iv = 0, ih = 0;
    for (const s of city.signs) {
      const g = new THREE.PlaneGeometry(s.w, s.h);
      const uv = g.attributes.uv;
      if (s.vertical) { const c = iv++ % 8; for (let k = 0; k < 4; k++) uv.setXY(k, (c + uv.getX(k)) / 8, uv.getY(k)); }
      else { const c = ih++ % 16; const cx = c % 2, cy = Math.floor(c / 2); for (let k = 0; k < 4; k++) uv.setXY(k, (cx + uv.getX(k)) / 2, 1 - (cy + 1 - uv.getY(k)) / 8); }
      const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry), new THREE.Vector3(1, 1, 1));
      (s.vertical ? bv : bh).geom(g, m);
    }
    if (bv.vc) scene.add(new THREE.Mesh(bv.build(), mv));
    if (bh.vc) scene.add(new THREE.Mesh(bh.build(), mh));
  }

  // ---------- lifeguard towers, umbrellas, loungers
  {
    const g = new GeoBucket();
    for (const lg of city.deco.lifeguards) {
      const y0 = city.groundH(lg.x, lg.z);
      const m = new THREE.Matrix4().makeTranslation(lg.x, y0, lg.z);
      const add = (geo, c) => g.geom(geo, m, {}, c);
      // v3.5 Miami-style lifeguard stand: splayed legs with cross braces, deck with tube railing, rounded hut with ribbon window
      // band and porthole, curved overhanging roof, ramp with handrails (faces the water, +x)
      const wht = [0.95, 0.95, 0.92];
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) { const p = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 8); p.rotateZ(-dx * 0.04); p.rotateX(dz * 0.04); p.translate(dx * 1.03, 1.25, dz * 1.03); add(p, wht); }
      for (const [ax, az, len, ry] of [[0, -1.2, 2.4, 0], [0, 1.2, 2.4, 0], [-1.2, 0, 2.4, Math.PI / 2], [1.2, 0, 2.4, Math.PI / 2]]) { const br = new THREE.BoxGeometry(len * 1.2, 0.06, 0.06); br.rotateZ(0.75); br.rotateY(ry); br.translate(ax, 1.2, az); add(br, wht); }
      const deck = new THREE.BoxGeometry(3.6, 0.18, 3.6); deck.translate(0, 2.5, 0); add(deck, [0.86, 0.84, 0.8]);
      for (const [x0, z0, x1, z1] of [[-1.75, -1.75, 1.75, -1.75], [-1.75, 1.75, 1.75, 1.75], [-1.75, -1.75, -1.75, 1.75], [1.75, -1.75, 1.75, -0.6], [1.75, 0.6, 1.75, 1.75]]) {
        const len = Math.hypot(x1 - x0, z1 - z0); const ry = Math.atan2(x1 - x0, z1 - z0);
        for (const yy of [3.05, 3.55]) { const rl = new THREE.CylinderGeometry(0.035, 0.035, len, 6); rl.rotateX(Math.PI / 2); rl.rotateY(ry); rl.translate((x0 + x1) / 2, yy, (z0 + z1) / 2); add(rl, wht); }
        const n = Math.max(1, Math.round(len / 0.9)); for (let k = 0; k <= n; k++) { const t = k / n; const po = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6); po.translate(x0 + (x1 - x0) * t, 3.08, z0 + (z1 - z0) * t); add(po, wht); } }
      const hut = new THREE.CylinderGeometry(1.25, 1.25, 2.1, 20); hut.scale(1.0, 1, 0.95); hut.translate(-0.25, 3.65, 0); add(hut, lg.color);
      const band = new THREE.CylinderGeometry(1.27, 1.27, 0.65, 20, 1, true); band.scale(1.0, 1, 0.95); band.translate(-0.25, 3.95, 0); add(band, [0.08, 0.1, 0.12]);
      const stripe = new THREE.CylinderGeometry(1.28, 1.28, 0.14, 20, 1, true); stripe.scale(1, 1, 0.95); stripe.translate(-0.25, 3.25, 0); add(stripe, wht);
      const roof = new THREE.SphereGeometry(1.75, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.32); roof.scale(1.05, 0.55, 1.0); roof.translate(-0.25, 4.15, 0); add(roof, wht);
      const fl = new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6); fl.translate(-0.25, 5.4, 0); add(fl, [0.7, 0.7, 0.7]);
      const flag = new THREE.BoxGeometry(0.02, 0.4, 0.6); flag.translate(-0.25, 5.95, 0.32); add(flag, [0.95, 0.85, 0.15]);
      const ramp = new THREE.BoxGeometry(1.0, 0.1, 4.4); ramp.rotateX(0.6); ramp.translate(0, 1.25, -3.25); ramp.rotateY(-Math.PI / 2); add(ramp, [0.86, 0.84, 0.8]);
      for (const s2 of [-0.55, 0.55]) { const hr = new THREE.CylinderGeometry(0.03, 0.03, 4.4, 6); hr.rotateX(Math.PI / 2 + 0.6); hr.translate(s2, 2.05, -3.25); hr.rotateY(-Math.PI / 2); add(hr, wht); }
      city.col.add(lg.x - 1.8, lg.z - 1.8, lg.x + 1.8, lg.z + 1.8, 2.3, 'lg');
    }
    for (const u of city.deco.umbrellas) {
      const y0 = city.groundH(u.x, u.z);
      const m = new THREE.Matrix4().makeTranslation(u.x, y0, u.z);
      if (!u.towelOnly) {
      const tilt = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.cos(u.r), 0, Math.sin(u.r)), 0.12); const mt = m.clone().multiply(tilt);
      const pole = new THREE.CylinderGeometry(0.022, 0.03, 2.5, 6); pole.translate(0, 1.25, 0); g.geom(pole, mt, {}, [0.92, 0.9, 0.86]);
      const U2 = umbrellaGeo(1.25, 0.42, 2.2); g.geom(U2.cloth, mt, {}, u.color); g.geom(U2.frame, mt, {}, [0.85, 0.83, 0.8]);
      }
      if (!u.towelOnly) { // reclining lounger: frame + slatted bed + raised backrest + legs
        const lm = m.clone().multiply(new THREE.Matrix4().makeRotationY(u.r)).multiply(new THREE.Matrix4().makeTranslation(0.9, 0, 0.6)); const wc = [0.97, 0.96, 0.93], fc = [0.75, 0.75, 0.74];
        for (const sx of [-0.3, 0.3]) { const rail = new THREE.BoxGeometry(0.04, 0.04, 1.35); rail.translate(sx, 0.3, 0.25); g.geom(rail, lm, {}, fc); for (const lz of [-0.35, 0.85]) { const leg = new THREE.BoxGeometry(0.04, 0.3, 0.04); leg.translate(sx, 0.15, lz); g.geom(leg, lm, {}, fc); } }
        for (let k = 0; k < 5; k++) { const sl = new THREE.BoxGeometry(0.62, 0.02, 0.2); sl.translate(0, 0.33, -0.3 + k * 0.26); g.geom(sl, lm, {}, wc); }
        const back = new THREE.BoxGeometry(0.62, 0.03, 0.7); back.rotateX(-0.75); back.translate(0, 0.55, -0.7); g.geom(back, lm, {}, wc); }
      else if ((u.x * 7.3) % 1 < 0.4) { const cooler = new THREE.BoxGeometry(0.5, 0.35, 0.32); cooler.translate(0.6, 0.18, 0.3); g.geom(cooler, m, {}, [0.85, 0.15, 0.15]); }
      const towel = new THREE.BoxGeometry(0.75, 0.02, 1.6); towel.rotateY(u.r + 0.4); towel.translate(-1.0, 0.03, -0.4); g.geom(towel, m, {}, [u.color[2], u.color[0], u.color[1]]);
    }
    const mm = new THREE.Mesh(g.build(), M.vcolCloth); mm.castShadow = true; mm.receiveShadow = true; scene.add(mm);
  }

  // ---------- traffic signals at intersections (mast arm + heads)
  {
    const g = new GeoBucket(); const heads = [];
    const RH = 7;
    const gA = CYBER ? null : new GeoBucket({ aPbr: 3 }); // a_props: map A signal assemblies (PBR furniture material, baked AO)
    const near = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
    for (const it of city.inters) {
      if (gA) { // a_props: pedestrian-signal poles on the two corners without a mast arm
        for (const [sx, sz] of [[1, -1], [-1, 1]]) { const px = it.x + sx * (RH + 1.0), pz = it.z + sz * (RH + 1.0);
          if (city.groundH(px, pz) < 0.1 || near(px, pz, 1.0)) continue;
          stampLod(gA, pedPoleA(sx, sz), new THREE.Matrix4().makeTranslation(px, 0.15, pz), 0.15); city.col.add(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, 3.4, 'pole'); }
      }
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const px = it.x + sx * (RH + 1.2), pz = it.z + sz * (RH + 1.2);
        const m = new THREE.Matrix4().makeTranslation(px, 0.15, pz);
        if (gA) { // a_props: detailed mast arm (same pole / head positions as before)
          { const pc = it.x > 170 ? [0.06, 0.09, 0.075] : null; stampMast(signalMastA(sx, sz, pc), signalMastFarA(sx, sz, pc), m, 0.15); }
          for (const d of [3, 6.5]) heads.push({ x: px - sx * d, y: 5.7 + 0.15, z: pz, face: sz, axis: 'z' });
          city.col.add(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 6, 'pole'); continue; }
        const pole = new THREE.CylinderGeometry(0.13, 0.16, 6.5, 8); pole.translate(0, 3.25, 0); g.geom(pole, m, {}, [0.75, 0.75, 0.72]);
        const arm = new THREE.CylinderGeometry(0.07, 0.09, 8.5, 6); arm.rotateZ(Math.PI / 2); arm.translate(-sx * 4.25, 6.3, 0); g.geom(arm, m, {}, [0.75, 0.75, 0.72]);
        for (const d of [3, 6.5]) { const h = new THREE.BoxGeometry(0.34, 1.04, 0.3); h.translate(-sx * d, 5.7, 0); g.geom(h, m, {}, [0.12, 0.12, 0.1]);
          const bp = new THREE.BoxGeometry(0.62, 1.32, 0.03); bp.translate(-sx * d, 5.7, -sz * 0.17); g.geom(bp, m, {}, [0.08, 0.08, 0.08]); // backplate
          const bpr = new THREE.BoxGeometry(0.64, 1.34, 0.01); bpr.translate(-sx * d, 5.7, -sz * 0.155); g.geom(bpr, m, {}, [0.85, 0.75, 0.2]); // retro-reflective border
          for (const yy of [6.02, 5.7, 5.38]) { const v = new THREE.CylinderGeometry(0.15, 0.15, 0.26, 10, 1, true, Math.PI / 2, Math.PI); v.rotateX(Math.PI / 2); v.translate(-sx * d, yy, sz * 0.27); g.geom(v, m, {}, [0.1, 0.1, 0.09]); } // visors
          const hg = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6); hg.translate(-sx * d, 6.3, 0); g.geom(hg, m, {}, [0.75, 0.75, 0.72]); heads.push({ x: px - sx * d, y: 5.7 + 0.15, z: pz, face: sz, axis: 'z' }); }
        city.col.add(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 6, 'pole');
      }
    }
    if (gA) { const ma = new THREE.Mesh(gA.build(), furnMat()); ma.castShadow = true; ma.receiveShadow = true; scene.add(ma); flushFine(scene); }
    else { const mm = new THREE.Mesh(g.build(), M.vcol); mm.castShadow = true; mm.receiveShadow = true; scene.add(mm); }
    // signal lamps: small emissive quads; colour updated from the traffic phase
    const lg = new THREE.PlaneGeometry(0.22, 0.22);
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a1a }), green = new THREE.MeshBasicMaterial({ color: 0x2aff8a });
    const R = new THREE.InstancedMesh(lg, red, heads.length), G = new THREE.InstancedMesh(lg, green, heads.length);
    heads.forEach((h, i) => {
      // faces along +/- z (towards traffic travelling along the z-axis road)
      const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, h.y + 0.3, h.z + h.face * 0.19), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.face > 0 ? 0 : Math.PI), s1);
      R.setMatrixAt(i, m);
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(h.x, h.y - 0.3, h.z + h.face * 0.19), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.face > 0 ? 0 : Math.PI), s1);
      G.setMatrixAt(i, m2);
    });
    for (const x of [R, G]) { x.computeBoundingSphere(); scene.add(x); }
    out.signal = { red, green };
  }
  return out;
}

// a_shopnight2: island shop-front pools (sidewalk in front of each lit storefront unit: 0.9 x unit width, 4 m deep), within 200 m,
// refilled every 25 m moved; the fixed lamp / bollard instances stay in front, so the lamp pools are untouched
const SHOP_R = 200, _sq = new THREE.Quaternion(), _sY = new THREE.Vector3(0, 1, 0), _sv = new THREE.Vector3(), _ss = new THREE.Vector3(), _sm = new THREE.Matrix4();
function shopPools(S, p) { const L = SHOPS.isl; if (S.at && S.at[2] === L.length && Math.hypot(p.x - S.at[0], p.z - S.at[1]) <= 25) return; S.at = [p.x, p.z, L.length];
  let k = 0; for (let i = 0; i + 5 < L.length && k < S.cap; i += 6) { if (Math.hypot(L[i] - p.x, L[i + 1] - p.z) >= SHOP_R) continue;
    _sm.compose(_sv.set(L[i], L[i + 5], L[i + 1]), _sq.setFromAxisAngle(_sY, L[i + 2]), _ss.set(L[i + 3] / 16, 1, L[i + 4] / 16)); S.m.setMatrixAt(S.nFix + k++, _sm); }
  S.n = k; S.m.count = S.nFix + k; S.m.instanceMatrix.needsUpdate = true; S.m.computeBoundingSphere(); }
export function updateProps(P, cam, night, phase) {
  const n = night;
  if (P.shopPools) shopPools(P.shopPools, cam.position);
  if (FINE_MESHES.length) { const cx = cam.position.x, cz = cam.position.z; // a_props: fine-detail chunks within ~120 m
    for (const f of FINE_MESHES) { const dx = Math.max(f.x0 - cx, 0, cx - f.x0 - f.s), dz = Math.max(f.z0 - cz, 0, cz - f.z0 - f.s); const v = dx * dx + dz * dz < f.r * f.r; f.m.visible = v; if (f.far) f.far.visible = !v; } }
  { const L = P.lampCull, cx = cam.position.x, cz = cam.position.z; if (L && Math.hypot(cx - L.lx, cz - L.lz) > 25) { L.lx = cx; L.lz = cz; let k = 0;
    for (const [a, b, x, z, ci] of L.lampM) { if ((x - cx) ** 2 + (z - cz) ** 2 > 450 * 450) continue; L.im.setMatrixAt(k, a); L.glow.setMatrixAt(k, a); L.pools.setMatrixAt(k, b); L.cones.setMatrixAt(k, a); L.cones.setColorAt(k, ci); k++; }
    for (const m of [L.im, L.glow, L.pools, L.cones]) { m.count = k; m.instanceMatrix.needsUpdate = true; } L.cones.instanceColor.needsUpdate = true; } }
  if (CYBER) P.lampGlow.color.setRGB(0.62 * (0.4 + 7 * n), 0.88 * (0.4 + 7 * n), 1.0 * (0.4 + 7 * n)); // v4.5 cool LED street lights (cyberpunk night)
  else P.lampGlow.color.setRGB(1.0 * (0.4 + 7 * n), 0.62 * (0.4 + 7 * n), 0.32 * (0.4 + 7 * n));
  for (const m of P.signMats) m.emissiveIntensity = CYBER ? 0.05 + n * 3.5 : n * 1.5; // r6.1 map A: unlit painted letters by day, warm bulb glow at night
  if (P.signal) { // NS-green phase: z-axis roads green
    const nsGreen = phase === 0;
    P.signal.red.color.setRGB(nsGreen ? 0.08 : 3.0, nsGreen ? 0.01 : 0.15, nsGreen ? 0.01 : 0.08);
    P.signal.green.color.setRGB(nsGreen ? 0.1 : 0.01, nsGreen ? 3.0 : 0.06, nsGreen ? 1.2 : 0.03);
  }
}
export function updateLampLights(P, lamps, pos, night) {
  if (night < 0.05) { for (const l of P.lampLights) l.intensity = 0; for (const v of U.uLampP.value) v.w = 0; return; }
  // nearest lamps
  const best = [];
  for (const l of lamps) { const d = (l.hx - pos.x) ** 2 + (l.hz - pos.z) ** 2; if (d > 90 * 90) continue; best.push([d, l]); }
  best.sort((a, b) => a[0] - b[0]);
  P.lampLights.forEach((pl, i) => { const e = best[i]; const lp = U.uLampP.value[i]; if (!e) { pl.intensity = 0; lp.w = 0; return; }
    lp.set(e[1].hx, e[1].hy + 0.05, e[1].hz, night); U.uLampC.value[i].setRGB(...(CYBER ? (e[1].mag ? [1.0, 0.35, 0.85] : [0.5, 0.85, 1.0]) : (e[1].led ? [1.0, 0.86, 0.7] : [1.0, 0.64, 0.34]))); pl.position.set(e[1].hx, e[1].hy - 0.4, e[1].hz); pl.intensity = 60 * night; if (CYBER) pl.color.setRGB(...(e[1].mag ? [1.0, 0.35, 0.85] : [0.55, 0.85, 1.0])); else pl.color.setRGB(...(e[1].led ? [1.0, 0.82, 0.62] : [1.0, 0.62, 0.34])); });
}

// ---------- street furniture: café terraces on Tideline Drive, benches, bins, hydrants, parking spots

// v3.5: instance a (Poly Haven CC0) glTF prop at many transforms; model recentred on its xz bbox centre, y from 0
function instGLB(scene, gltf, list, key) {
  if (!gltf || !list.length) return;
  const root = gltf.scene; root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(root); const c = bb.getCenter(new THREE.Vector3());
  const off = new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z); const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return; const mat = o.material; prep(mat, 'ph_' + key);
    const im = new THREE.InstancedMesh(o.geometry, mat, list.length); im.castShadow = key !== 'cafe'; im.receiveShadow = true;
    const local = off.clone().multiply(o.matrixWorld);
    list.forEach((t, i) => { m.copy(t).multiply(local); im.setMatrixAt(i, m); });
    im.computeBoundingSphere(); scene.add(im);
  });
}
const TR = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));

export function buildFurniture(scene, city, G = {}) {
  const PH = { hyd: [], bin: [], cafe: [] };
  const g = new GeoBucket(); const r = mulberry(4242);
  const add = (geo, m, c) => g.geom(geo, m, {}, c); const fb = new GeoBucket({ aPbr: 3 });
  const fA = CYBER ? null : new GeoBucket({ aPbr: 3 }); // a_props: map A corner kit (hydrants, recycling bins, bike racks)
  const occ = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
  const T = (x, y, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  const umbCols = [[0.95, 0.95, 0.92], [0.9, 0.35, 0.4], [0.2, 0.55, 0.6], [0.95, 0.75, 0.45], [0.3, 0.3, 0.32]];
  const parking = [];
  const binQ = []; // a_edgewalls: [x, z, ry] of the litter bins (GLB or cylinder), boxed after every layer (maps/gta/edgewalls.js)
  // café sets in front of the Tideline hotels (x 276..279), skipping intersections
  for (const b of city.blocks) {
    if (b.area !== 'island' || b.x1 < 280 || b.x0 < 170) continue;
    let k = 0;
    for (let z = b.z0 + 8; z < b.z1 - 8; z += 6.5) {
      if (r() < 0.25) continue;
      const x = 277.2 + (r() - 0.5) * 0.6, y = 0.15; const col = umbCols[Math.floor(r() * umbCols.length)];
      if (G.ph_cafe) { if (k % 2 === 0) PH.cafe.push(TR(x, y, z, r() * 0.3 - 0.15)); } else {
      const top = new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14); add(top, T(x, y + 0.74, z), [0.92, 0.92, 0.9]);
      const leg = new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6); add(leg, T(x, y + 0.36, z), [0.2, 0.2, 0.2]); }
      const odd = k % 2 === 1;
      if (k++ % 2 === 0) { const um = new THREE.ConeGeometry(1.5, 0.5, 10, 1, true); add(um, T(x, y + 2.45, z), col); const p = new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6); add(p, T(x, y + 1.2, z), [0.85, 0.85, 0.85]); }
      const cb = city.col.add(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1.0, 'cafe');
      if (!CYBER && G.ph_cafe && odd) cb.fit = []; // a_lane8fix: with the café GLB only every other slot gets a set, so this slot is empty: orphan box, dropped by maps/gta/colfix.js
    }
    // parallel parking on the west curb lane of Tideline Drive
    for (let z = b.z0 + 10; z < b.z1 - 10; z += 6.8) parking.push({ x: 284.6, z, yaw: r() < 0.5 ? 0 : Math.PI, fill: r() < 0.65 });
  }
  // benches + bins along the promenade, hydrants + bins on island street corners
  for (let z = -LAYOUT.islandZ[1] + 12; z < LAYOUT.islandZ[1] - 8; z += 24) {
    const x = 301.5; const BG = benchGeo(1.8);
    if (!CYBER) { fb.geom(BG.wood, T(x, 0.15, z), { aPbr: PB.wood }, [0.55, 0.40, 0.28]); fb.geom(BG.iron, T(x, 0.15, z), { aPbr: PB.paint }, [0.06, 0.09, 0.08]); } // r6.3 PBR bench (weathered teak, painted cast iron)
    else { add(BG.wood, T(x, 0.15, z), [0.58, 0.42, 0.29]); add(BG.iron, T(x, 0.15, z), [0.12, 0.13, 0.13]); }
    city.col.add(x - 0.35, z - 0.95, x + 0.35, z + 0.95, 1, 'bench');
    if (!CYBER) binQ.push([x, z + 3, Math.PI / 2]); // a_edgewalls: promenade bin beside the bench had no box
    if (G.ph_bin) PH.bin.push(TR(x, 0.15, z + 3, Math.PI / 2)); else { const bin = new THREE.CylinderGeometry(0.28, 0.25, 0.95, 10); add(bin, T(x, 0.62, z + 3), [0.15, 0.3, 0.25]); }
  }
  for (const it of city.inters) {
    if (it.x < -160) continue;
    const hx = it.x + 7 + 1.0, hz = it.z + 7 + 2.5; // hydrant on one corner
    const bx = it.x - 7 - 1.0, bz = it.z - 7 - 3.0;
    if (fA && G.ph_hydrant) { const ry = r() * 6.28; stampLod(fA, hydrantA(), TR(hx, 0.15, hz, ry), 0.15); { const ry = r() * 6.28; PH.bin.push(TR(bx, 0.15, bz, ry)); binQ.push([bx, bz, ry]); } // a_edgewalls: corner bin box (same draw); a_props: procedural Florida hydrant (same rng draws)
      city.col.add(hx - 0.18, hz - 0.18, hx + 0.18, hz + 0.18, 0.8, 'hyd');
      const rx = it.x + 7 + 1.2, rz = it.z - 7 - 3.2 - 0.85; // recycling bin beside street.js' corner litter bin (same occupancy rule it uses)
      if (it.x > -200 && !occ(rx, rz + 0.85, 1.0) && !occ(rx, rz, 1.0)) { stampLod(fA, recycleBinA(), TR(rx, 0.15, rz, Math.PI / 2), 0.15); city.col.add(rx - 0.25, rz - 0.28, rx + 0.25, rz + 0.28, 1.0, 'rbin'); }
    } else if (G.ph_hydrant) { PH.hyd.push(TR(hx, 0.15, hz, r() * 6.28, 1.05)); PH.bin.push(TR(bx, 0.15, bz, r() * 6.28)); } else {
    const h = new THREE.CylinderGeometry(0.13, 0.16, 0.65, 8); add(h, T(hx, 0.47, hz), [0.85, 0.75, 0.15]);
    const cap = new THREE.SphereGeometry(0.14, 8, 6); add(cap, T(hx, 0.82, hz), [0.85, 0.75, 0.15]);
    const bin = new THREE.CylinderGeometry(0.3, 0.27, 1.0, 10); add(bin, T(bx, 0.65, bz), [0.2, 0.22, 0.24]); }
  }
  if (fA) { // a_props: bike racks mid-block on the island streets (own rng stream; kerb furniture zone, clear of lamps / palms / trees / colliders)
    const rb = mulberry(5150); const box = [];
    for (const s of city.segs) {
      if (s.bridge || s.a1 - s.a0 < 44) continue; const isl = s.axis === 'z' ? s.c > -160 : s.a0 > -160; if (!isl) continue;
      const a = (s.a0 + s.a1) / 2 + (rb() - 0.5) * 12, side = rb() < 0.5 ? -1 : 1, keep = rb() < 0.6, n = 2 + Math.floor(rb() * 3);
      if (!keep || (s.axis === 'z' && s.c === 290 && side > 0)) continue;
      const off = side * (7 + 1.75); const x = s.axis === 'z' ? s.c + off : a, z = s.axis === 'z' ? a : s.c + off; const hl = (n - 1) * 0.45 + 0.4;
      if (city.groundH(x, z) < 0.1 || occ(x, z, 0.6 + hl)) continue;
      const ex = s.axis === 'z' ? 0.45 : hl, ez = s.axis === 'z' ? hl : 0.45;
      if (city.col.query(x, z, hl + 1, box).some((b) => b.maxX > x - ex && b.minX < x + ex && b.maxZ > z - ez && b.minZ < z + ez)) continue;
      if (serviceLanes(city).some((L) => x + ex > L.x - L.hw - 0.6 && x - ex < L.x + L.hw + 0.6 && z + ez > L.z0 - 1 && z - ez < L.z1 + 1)) continue; // a_lane8fix: keep the service-lane aprons (a_backlot) clear: a rack across lane 8's mouth stopped walkers dead at the kerb
      stampLod(fA, bikeRackA(n), TR(x, 0.15, z, s.axis === 'z' ? 0 : Math.PI / 2), 0.15); city.col.add(x - ex + 0.3, z - ez + 0.3, x + ex - 0.3, z + ez - 0.3, 0.9, 'bike');
    }
    const fm = new THREE.Mesh(fA.build(), furnMat()); fm.castShadow = true; fm.receiveShadow = true; scene.add(fm); flushFine(scene);
  }
  const mesh = new THREE.Mesh(g.build(), M.vcolCloth); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  if (fb.vc) { const fm = new THREE.Mesh(fb.build(), furnMat()); fm.castShadow = true; fm.receiveShadow = true; scene.add(fm); }
  if (!CYBER && binQ.length) { let hx = 0.3, hz = 0.3, hy = 1.1; // a_edgewalls: GLB footprint (as instGLB places it), else the 0.28 m cylinder
    if (G.ph_bin) { const bb = new THREE.Box3().setFromObject(G.ph_bin.scene); hx = (bb.max.x - bb.min.x) / 2; hz = (bb.max.z - bb.min.z) / 2; hy = bb.max.y - bb.min.y + 0.15; }
    for (const [x, z, ry] of binQ) (city.clutAdd = city.clutAdd || []).push({ k: 'bin', x, z, ang: ry, hl: hx, hw: hz, h: hy }); }
  instGLB(scene, G.ph_hydrant, PH.hyd, 'hyd'); instGLB(scene, G.ph_bin, PH.bin, 'bin'); instGLB(scene, G.ph_cafe, PH.cafe, 'cafe');
  city.parking = parking;
}

export function updateNeonLights(P, signs, pos, night) {
  if (!P.neonLights) return;
  if (night < 0.05) { for (const l of P.neonLights) l.intensity = 0; return; }
  const best = [];
  for (const s of signs) { if (!s.color) continue; const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2; if (d > 70 * 70) continue; best.push([d, s]); }
  best.sort((a, b) => a[0] - b[0]);
  P.neonLights.forEach((pl, i) => { const e = best[i]; if (!e) { pl.intensity = 0; return; } const sg = e[1];
    const ox = Math.sin(sg.ry) * 3.0, oz = Math.cos(sg.ry) * 3.0; pl.position.set(sg.x + ox, Math.min(sg.y, 4.2), sg.z + oz); pl.color.set(sg.color); pl.intensity = (CYBER ? 9 : 5) * night; /* v4.3: off the wall (was a blown-out hotspot 1.2 m from the stucco) */ });
}
