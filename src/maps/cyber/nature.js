// v4.5 natural landscapes on the mainland north of 数据核心区 (MAP_DESIGN.md §1 / §4): 电穗草原 (rolling grassland, wind-blown
// instanced grass, wildflowers, lone trees) and 雾网雨林 (layered rainforest: emergent + canopy + understory trees, buttress roots,
// hanging vines, ferns, mossy rock, a stream from a 24 m waterfall to a lake, drifting mist and light shafts).
//  * one height field (5 m grid) drives the terrain mesh, groundH (physics / people / cars) and the water bed, so they agree;
//    roads (mapdata 'rur') are cut flat into it, the stream / plunge pool / lake are carved into it.
//  * everything near-detailed is streamed around the camera: grass / flowers / ferns are re-scattered from deterministic
//    per-cell seeds as the camera moves; trees swap between a near (full) and far (cards) instanced LOD; terrain is cut into
//    160 m chunks (frustum-culled).
import * as THREE from 'three';
import { WILD, FALLS, LAKE, STREAM, catmull } from './mapdata.js';
import { mulberry, clamp, smooth, lerp } from '../../util.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';
import { OLDENV } from '../../envprog.js'; // b_envprog
import { foliagePatch, GB, gbBuild, addFrond, mergeSimple, pinnateTex } from '../../veg.js';

const CELL = 5;
// ----------------------------------------------------------------------------------- noise ----
function h2(i, j) { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vn(x, z) { const i = Math.floor(x), j = Math.floor(z); const fx = x - i, fz = z - j; const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(h2(i, j), h2(i + 1, j), u), lerp(h2(i, j + 1), h2(i + 1, j + 1), u), v); }
function fbm(x, z, o = 4) { let a = 0.5, s = 0, f = 1; for (let k = 0; k < o; k++) { s += a * vn(x * f + k * 17.3, z * f - k * 9.1); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, o)); }

// ------------------------------------------------------------------------- height field ----
// zones: forestK 0 (草原) .. 1 (雨林) across z ≈ 2280…2480
export function wildField(graph) {
  const X0 = WILD.x0, Z0 = WILD.z0, NX = Math.round((WILD.x1 - WILD.x0) / CELL) + 1, NZ = Math.round((WILD.z1 - WILD.z0) / CELL) + 1;
  const H = new Float32Array(NX * NZ), RD = new Float32Array(NX * NZ).fill(999), WET = new Float32Array(NX * NZ);
  // distance to roads (exact within 45 m of a sample)
  for (const e of graph.edges) {
    if (e.legacy) continue; let near = false;
    for (const p of e.pts) if (p[0] > X0 - 60 && p[0] < WILD.x1 + 60 && p[1] > Z0 - 60 && p[1] < WILD.z1 + 60) { near = true; break; }
    if (!near) continue;
    for (let s = 0; s <= e.L; s += 2) {
      let lo = 0, hi = e.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e.cum[m] <= s) lo = m; else hi = m; }
      const a = e.pts[lo], b = e.pts[hi]; const t = (s - e.cum[lo]) / ((e.cum[hi] - e.cum[lo]) || 1); const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      const i0 = Math.max(0, Math.floor((px - 45 - X0) / CELL)), i1 = Math.min(NX - 1, Math.ceil((px + 45 - X0) / CELL));
      const j0 = Math.max(0, Math.floor((pz - 45 - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.ceil((pz + 45 - Z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(X0 + i * CELL - px, Z0 + j * CELL - pz) - (e.hw - 4.2); const k = j * NX + i; if (d < RD[k]) RD[k] = d; }
    }
  }
  // stream polyline (smoothed) with level from the plunge pool down to the lake
  const SP = catmull(STREAM, 6); const SC = [0]; for (let i = 1; i < SP.length; i++) SC.push(SC[i - 1] + Math.hypot(SP[i][0] - SP[i - 1][0], SP[i][1] - SP[i - 1][1]));
  const SL = SC[SC.length - 1];
  const level = (s) => FALLS.pool + (LAKE.y + 0.15 - FALLS.pool) * Math.pow(clamp(s / SL, 0, 1), 0.8);
  const streamQ = (x, z) => { let best = 1e9, bs = 0, behind = false;
    for (let i = 0; i < SP.length - 1; i++) { const a = SP[i], b = SP[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; const bh = i === 0 && t < 0; t = clamp(t, 0, 1);
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (d < best) { best = d; bs = SC[i] + (SC[i + 1] - SC[i]) * t; behind = bh; } }
    return { d: best, s: bs, behind }; };
  const field = { X0, Z0, NX, NZ, H, RD, WET, SP, SC, SL, level, streamHW: (s) => 3.2 + 2.6 * Math.pow(1 - clamp(s / SL, 0, 1), 3) };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + i * CELL, z = Z0 + j * CELL; const k = j * NX + i;
    const zf = smooth(2280, 2480, z);
    const hP = 2.2 + 9 * (fbm(x / 300, z / 300) - 0.38) + 2.6 * (fbm(x / 85 + 40, z / 85) - 0.5);
    let hF = 4 + 15 * (fbm(x / 240 - 70, z / 240 + 30) - 0.36) + 4.5 * (fbm(x / 55, z / 55 + 11) - 0.5);
    const ridgeK = smooth(3105, 3215, z) * (1 - smooth(3380, 3600, z));
    const kf = Math.exp(-(((x - FALLS.x) / 95) ** 2));
    const cliffK = smooth(3107.5, 3113, z) * (1 - smooth(3380, 3600, z));
    hF = Math.max(hF, 0.6) + lerp(30 * ridgeK, (FALLS.top - 1.5) * cliffK + 6 * smooth(3140, 3260, z) * (1 - smooth(3380, 3600, z)), kf) + 5 * ridgeK * (fbm(x / 40, z / 40) - 0.5);
    let h = lerp(Math.max(hP, 0.25), hF, zf);
    // falls lip notch + the short stream on the plateau feeding it
    if (Math.abs(x - FALLS.x) < FALLS.w / 2 + 2 && z > 3108 && z < 3190) h = Math.min(h, FALLS.top - (Math.abs(x - FALLS.x) < FALLS.w / 2 - 1 ? 0.9 : 0));
    // north coast falls into the sea; other edges blend to the surrounding flat land (y −0.03)
    h = lerp(-2.4, h, smooth(3650, 3510, z));
    const m = smooth(WILD.x1, WILD.x1 - 70, x) * smooth(Z0, Z0 + 70, z) * smooth(X0, X0 + 70, x);
    h = -0.04 + (h + 0.04) * m;
    // roads cut flat (4 cm under the asphalt). p4: the flat core was RD < 2.6 m while the ribbon is 4.2 m half-wide (RD is the
    // distance to the centre line, minus hw - 4.2), so on the 5 m grid the verge triangles rose through the asphalt edge in a
    // sawtooth that ate the white edge lines along every 草原 / 雨林 road. Flat out to edge + one cell (4.2 + 5 m), same 25 m ramp.
    const f = smooth(9.5, 34, RD[k]); h = -0.04 + (h + 0.04) * f;
    // stream channel + banks
    let wet = 0;
    const q = streamQ(x, z);
    if (!q.behind) { const lv = level(q.s), hw = field.streamHW(q.s);
      const bank = lv + 0.45 + Math.max(0, q.d - hw) * 0.3; h = Math.min(h, q.d < hw ? lv - 0.85 + 1.3 * (q.d / hw) ** 2 : bank); wet = Math.max(wet, smooth(hw + 4, hw, q.d)); }
    // plunge pool
    { const dp = Math.hypot(x - FALLS.x, z - FALLS.z); const r = 12;
      if (dp < r) h = Math.min(h, FALLS.pool - 1.6 * (1 - (dp / r) ** 2)); else if (z < FALLS.z + 6) h = Math.min(h, FALLS.pool + 0.45 + (dp - r) * 0.3);
      wet = Math.max(wet, smooth(r + 6, r, dp)); }
    // lake
    { const qq = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz); if (qq < 1) h = Math.min(h, LAKE.y - 0.35 - 1.5 * (1 - qq * qq)); else h = Math.min(h, LAKE.y + 0.35 + (qq - 1) * LAKE.rz * 0.32);
      wet = Math.max(wet, smooth(1.12, 1.0, qq)); }
    H[k] = Number.isFinite(h) ? h : -0.04; WET[k] = wet;
  }
  field.HA = H;
  field.inside = (x, z) => x >= WILD.x0 && x <= WILD.x1 && z >= WILD.z0 && z <= WILD.z1;
  field.H = (x, z) => { const fx = clamp((x - X0) / CELL, 0, NX - 1.001), fz = clamp((z - Z0) / CELL, 0, NZ - 1.001); const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j; const k = j * NX + i;
    return lerp(lerp(H[k], H[k + 1], u), lerp(H[k + NX], H[k + NX + 1], u), v); };
  field.at = (A, x, z) => { const i = clamp(Math.round((x - X0) / CELL), 0, NX - 1), j = clamp(Math.round((z - Z0) / CELL), 0, NZ - 1); return A[j * NX + i]; };
  // p4: bilinear road distance for the ground-cover scatter (nearest-vertex RD is quantised to the 5 m grid, so grass / ferns
  // passed a "1.5 m" test anywhere up to ~3.5 m off and sprouted across both lanes of the 草原 / 雨林 roads); clear of asphalt + kerb
  field.rdAt = (x, z) => { const fx = clamp((x - X0) / CELL, 0, NX - 1.001), fz = clamp((z - Z0) / CELL, 0, NZ - 1.001); const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j; const k = j * NX + i;
    return lerp(lerp(RD[k], RD[k + 1], u), lerp(RD[k + NX], RD[k + NX + 1], u), v); };
  field.slope = (x, z) => { const a = field.H(x - 2.5, z), b = field.H(x + 2.5, z), c = field.H(x, z - 2.5), d = field.H(x, z + 2.5); return Math.hypot(b - a, d - c) / 5; };
  field.forestK = (x, z) => field.inside(x, z) ? smooth(2280, 2480, z) : 0;
  field.waterAt = (x, z) => { if (Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.06) return true; if (Math.hypot(x - FALLS.x, z - FALLS.z) < 15) return true; const q = streamQ(x, z); return !q.behind && q.d < field.streamHW(q.s) + 1.2; };
  return field;
}

// ------------------------------------------------------------------------- materials ----
const NOISE = `
float nh12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float nvn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(nh12(i),nh12(i+vec2(1,0)),f.x), mix(nh12(i+vec2(0,1)),nh12(i+vec2(1,1)),f.x), f.y); }`;
function terrainMaterial(T) {
  const g = T.grass_d, gn = T.grass_n, ga = T.grass_arm, rk = T.concrete_d;
  for (const t of [g, gn, ga, rk]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  const mat = new THREE.MeshStandardMaterial({ map: g, normalMap: gn, roughnessMap: ga, roughness: 1, color: 0xffffff });
  return prep(mat, 'terrain', (s) => {
    s.uniforms.tRock = { value: rk }; s.uniforms.uNightT = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aBio; varying vec3 vBio; varying vec3 vTW; varying vec3 vTN;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBio = aBio; vTW = position; vTN = normal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tRock; uniform float uNightT; varying vec3 vBio; varying vec3 vTW; varying vec3 vTN;' + NOISE)
      .replace('#include <map_fragment>', `
vec3 gtex = texture2D(map, vMapUv).rgb;
vec3 gtex2 = texture2D(map, vMapUv * 0.23 + 0.31).rgb; // second scale breaks the tiling
vec3 gg = mix(gtex, gtex2, 0.4);
float mac = nvn(vTW.xz * 0.011) * 0.6 + nvn(vTW.xz * 0.047) * 0.3 + nvn(vTW.xz * 0.21) * 0.1;
float fk = vBio.x;
// 草原: green swales, golden straw on the crests and dry patches
vec3 straw = gg * vec3(1.45, 1.22, 0.62) + vec3(0.07, 0.05, 0.0);
vec3 prairie = mix(gg * vec3(0.92, 1.02, 0.7), straw, smoothstep(0.38, 0.72, mac + vTW.y * 0.025));
// 雨林 floor: moss + dark leaf litter
vec3 litter = vec3(0.17, 0.12, 0.07) * (0.7 + 0.6 * gtex.g);
vec3 moss = gg * vec3(0.36, 0.50, 0.26);
vec3 forestF = mix(moss, litter, smoothstep(0.30, 0.6, mac));
vec3 col = mix(prairie, forestF, fk);
// rock on steep slopes: tri-planar concrete texture, wet-dark and mossy in the forest
vec3 n = normalize(vTN); vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
vec3 rock = (texture2D(tRock, vTW.zy * 0.09).rgb * bw.x + texture2D(tRock, vTW.xz * 0.09).rgb * bw.y + texture2D(tRock, vTW.xy * 0.09).rgb * bw.z);
rock = rock * vec3(0.66, 0.62, 0.56) * (0.75 + 0.5 * nvn(vTW.xy * 0.3 + vTW.zz * 0.2));
rock = mix(rock, rock * vec3(0.55, 0.72, 0.45), fk * smoothstep(0.4, 0.7, nvn(vTW.xz * 0.4 + vTW.y * 0.3)));
float slope = 1.0 - n.y;
float rk = smoothstep(0.30, 0.52, slope + (mac - 0.5) * 0.25);
col = mix(col, rock, rk);
// road shoulder: packed dirt / gravel
col = mix(col, vec3(0.40, 0.35, 0.29) * (0.8 + 0.4 * gtex.r), vBio.z * (0.6 + 0.4 * nvn(vTW.xz * 0.9)));
// wet banks
col = mix(col, col * 0.42 + vec3(0.02, 0.025, 0.015), vBio.y * 0.85);
diffuseColor.rgb *= col;
float wetT = vBio.y; float rockT = rk;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.78, rockT); roughnessFactor = mix(roughnessFactor, 0.22, wetT);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, rockT * 0.6));');
  });
}

// ------------------------------------------------------------------------- geometry ----
// tapered tube along a curve (radius r0 -> r1), sides n
function tube(pts, r0, r1, sides, segs) {
  const curve = new THREE.CatmullRomCurve3(pts); const g = new THREE.TubeGeometry(curve, segs, 1, sides, false); const RS = sides + 1;
  const P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) { const ring = Math.floor(i / RS); const t = ring / segs; const c = curve.getPointAt(Math.min(1, t)); const rad = r0 + (r1 - r0) * t;
    P.setXYZ(i, c.x + N.getX(i) * rad, c.y + N.getY(i) * rad, c.z + N.getZ(i) * rad); }
  // r6.3 bark uv in metres-ish: the whole trunk used to map one bark tile (a 35 m trunk stretched one texel row over metres ->
  // close-ups showed a smeared near-black crevice). Tile ~3 m along, ~1.6 m around.
  const UV = g.attributes.uv; const ku = Math.max(1, Math.round(curve.getLength() / 3)), kv = Math.max(1, Math.round((Math.PI * (r0 + r1)) / 1.6));
  for (let i = 0; i < UV.count; i++) UV.setXY(i, UV.getX(i) * ku, UV.getY(i) * kv);
  return g;
}
// leaf-card clump (same card style as veg.js trees; tropical colours)
function clump(cards, r, C, R, n, g0, size, yScale = 0.55, sway = 0.25) {
  for (let k = 0; k < n; k++) {
    const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1) * 0.85; const rr = Math.pow(r(), 0.5) * R;
    const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * yScale, Math.sin(v) * Math.sin(u) * rr).add(C);
    const nrm = p.clone().sub(C).add(new THREE.Vector3(0, R * 0.6, 0)).normalize();
    const s = size * (0.75 + r() * 0.5);
    const a = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const t1 = new THREE.Vector3().crossVectors(nrm, a).normalize(), t2 = new THREE.Vector3().crossVectors(nrm, t1).normalize();
    const base = cards.p.length / 3; const g = g0 * (0.8 + r() * 0.35) * (0.75 + 0.35 * Math.max(0, nrm.y));
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = p.clone().addScaledVector(t1, i * s).addScaledVector(t2, j * s);
      cards.p.push(q.x, q.y, q.z); cards.n.push(nrm.x, nrm.y, nrm.z); cards.uv.push((i + 1) / 2, (j + 1) / 2); cards.s.push(sway); cards.c.push(g * 0.66, g * 0.88, g * 0.52); }
    cards.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
function cardGeo(cards) {
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cards.p, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(cards.n, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(cards.uv, 2)); cg.setAttribute('aSway', new THREE.Float32BufferAttribute(cards.s, 1));
  cg.setAttribute('color', new THREE.Float32BufferAttribute(cards.c, 3)); cg.setIndex(cards.i); return cg;
}
// rainforest tree. kind: 'emergent' (tall straight trunk, buttresses, flat umbrella crown), 'canopy' (layered crown, vines),
// 'under' (small understory tree), 'lone' (wide prairie shade tree). Unit height (scaled per instance).
export function jungleTree(seed, kind, lod) {
  const r = mulberry(seed); const cards = { p: [], n: [], uv: [], i: [], s: [], c: [] }; const vines = { p: [], n: [], uv: [], i: [], s: [], c: [] }; const tubes = [];
  const Hh = { emergent: 44, canopy: 27, under: 9, lone: 13 }[kind];
  const crownR = { emergent: 13, canopy: 9, under: 3.2, lone: 9.5 }[kind];
  const trunkTop = Hh * ({ emergent: 0.8, canopy: 0.62, under: 0.45, lone: 0.32 }[kind]);
  const r0 = { emergent: 1.0, canopy: 0.62, under: 0.18, lone: 0.55 }[kind];
  const sides = lod ? 4 : 7, segs = lod ? 2 : 5;
  const lean = new THREE.Vector3((r() - 0.5) * 0.06 * Hh, 0, (r() - 0.5) * 0.06 * Hh);
  const top = new THREE.Vector3(0, trunkTop, 0).add(lean);
  tubes.push(tube([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(lean.x * 0.25, trunkTop * 0.45, lean.z * 0.25), top], r0, r0 * 0.45, sides, segs));
  // buttress / surface roots: a flared base + roots snaking out over the forest floor (emergent / canopy / lone)
  if (!lod && kind !== 'under') {
    tubes.push(tube([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, r0 * 1.6, 0), new THREE.Vector3(lean.x * 0.05, r0 * 4.0, lean.z * 0.05)], r0 * (kind === 'emergent' ? 2.3 : 1.8), r0 * 1.02, sides, 3));
    const nb = kind === 'emergent' ? 6 : 4;
    for (let b = 0; b < nb; b++) { const a = b / nb * Math.PI * 2 + r() * 0.5; const dx = Math.cos(a), dz = Math.sin(a); const L = r0 * (3 + r() * 3);
      tubes.push(tube([new THREE.Vector3(dx * r0 * 0.6, r0 * 1.8, dz * r0 * 0.6), new THREE.Vector3(dx * L * 0.45, r0 * 0.5, dz * L * 0.45), new THREE.Vector3(dx * L, -0.15, dz * L + (r() - 0.5) * L * 0.3)], r0 * 0.42, r0 * 0.1, 5, 4)); }
  }
  // branches + crown
  const nL = kind === 'emergent' ? 6 : kind === 'canopy' ? 5 : kind === 'lone' ? 6 : 3;
  for (let l = 0; l < nL; l++) {
    const az = l / nL * Math.PI * 2 + r() * 0.7; const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const spread = crownR * (0.7 + r() * 0.35); const rise = kind === 'emergent' ? Hh * 0.12 : kind === 'lone' ? Hh * 0.38 : Hh * 0.22;
    const st = top.clone().add(new THREE.Vector3(0, -r() * trunkTop * (kind === 'canopy' ? 0.25 : 0.08), 0));
    const mid = st.clone().addScaledVector(out, spread * 0.5).add(new THREE.Vector3(0, rise * 0.75, 0));
    const end = st.clone().addScaledVector(out, spread).add(new THREE.Vector3(0, rise, 0));
    tubes.push(tube([st, mid, end], r0 * 0.38, r0 * 0.12, lod ? 3 : 5, lod ? 1 : 3));
    const cs = kind === 'under' ? 0.9 : kind === 'lone' ? 1.25 : 1.6;
    const nc = lod ? 2 : 3;
    for (let c = 0; c < nc; c++) clump(cards, r, mid.clone().lerp(end, 0.4 + 0.6 * c / Math.max(1, nc - 1)).add(new THREE.Vector3(0, crownR * 0.12, 0)), crownR * (0.36 + r() * 0.1), lod ? 5 : 15, 1.0, cs * (lod ? 2.1 : 1), kind === 'emergent' ? 0.35 : 0.5);
    // hanging lianas from the branch tips
    if (!lod && kind !== 'under' && r() < (kind === 'lone' ? 0.0 : 0.9)) {
      const nv = 1 + Math.floor(r() * 3); // r6.1 more lianas
      for (let v = 0; v < nv; v++) { const p0 = mid.clone().lerp(end, r()); const len = Math.min(p0.y - 1.5, (0.25 + r() * 0.45) * Hh); const w = 0.28 + r() * 0.2; const a2 = r() * Math.PI;
        const sx = Math.cos(a2) * w, sz = Math.sin(a2) * w; const base = vines.p.length / 3; const S = 6;
        for (let k = 0; k <= S; k++) { const t = k / S; const sag = Math.sin(t * Math.PI) * 0.6; const y = p0.y - len * t;
          for (const sg of [-1, 1]) { vines.p.push(p0.x + sx * sg + sag, y, p0.z + sz * sg); vines.n.push(-sz, 0.2, sx); vines.uv.push((sg + 1) / 2 * 0.5 + 0.25, t * 3); vines.s.push(0.2 + t * 0.9); vines.c.push(0.5, 0.75, 0.42); } }
        for (let k = 0; k < S; k++) { const a = base + k * 2; vines.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    }
  }
  // crown top / layered canopy for the big trees
  clump(cards, r, top.clone().add(new THREE.Vector3(0, kind === 'emergent' ? Hh * 0.14 : kind === 'lone' ? Hh * 0.42 : Hh * 0.25, 0)), crownR * 0.6, lod ? 6 : 22, 1.05, (kind === 'under' ? 1.0 : 1.7) * (lod ? 2.0 : 1), 0.45);
  if (kind === 'canopy') clump(cards, r, new THREE.Vector3(0, trunkTop * 0.72, 0).add(lean.clone().multiplyScalar(0.7)), crownR * 0.55, lod ? 3 : 10, 0.8, 1.4 * (lod ? 2 : 1), 0.5);
  const trunk = mergeSimple(tubes);
  trunk.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(trunk.attributes.position.count).map((_, i) => Math.max(0, trunk.attributes.position.getY(i) - trunkTop) * 0.01), 1));
  return { trunk, leaves: cardGeo(cards), vines: vines.p.length ? cardGeo(vines) : null, H: Hh };
}
// fern: 7–9 arching pinnate fronds (veg.js frond builder)
function fernGeometry(seed) {
  const r = mulberry(seed); const F = GB(); const n = 7 + Math.floor(r() * 3); const top = new THREE.Vector3(0, 0.12, 0);
  for (let i = 0; i < n; i++) addFrond(F, top, i / n * Math.PI * 2 + r() * 0.4, 1.1 + r() * 0.6, 1.0 + r() * 0.4, 1.3 + r() * 0.4, 5, [0.62 + r() * 0.15, 0.85 + r() * 0.1, 0.45], { wingDrop: 0.25, maxW: 0.32, rachis: false });
  return gbBuild(F);
}
// r6.1 broad-leaf blade texture (elephant-ear / heliconia / banana-like): blade with midrib, side veins, a torn edge, alpha cut-out
function broadLeafTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); const r = mulberry(611);
  g.clearRect(0, 0, 128, 256);
  g.beginPath(); g.moveTo(64, 252);
  for (let i = 0; i <= 24; i++) { const t = i / 24; const y = 252 - t * 246; const w = 60 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.75) * (1 - 0.25 * t); g.lineTo(64 + w + (r() - 0.5) * 3, y); }
  for (let i = 24; i >= 0; i--) { const t = i / 24; const y = 252 - t * 246; const w = 60 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.75) * (1 - 0.25 * t); g.lineTo(64 - w + (r() - 0.5) * 3, y); }
  g.closePath(); const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, '#2f5a1f'); gr.addColorStop(0.5, '#4f8a2e'); gr.addColorStop(1, '#2c5520'); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(190,215,140,0.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 252); g.lineTo(64, 8); g.stroke();
  g.strokeStyle = 'rgba(160,200,110,0.35)'; g.lineWidth = 1.2; for (let k = 0; k < 16; k++) { const y = 240 - k * 14; g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(84, y - 6, 120, y - 20); g.moveTo(64, y); g.quadraticCurveTo(44, y - 6, 8, y - 20); g.stroke(); }
  g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 7; k++) { const sx = r() < 0.5 ? 6 + r() * 14 : 108 + r() * 14, sy = 30 + r() * 190; g.beginPath(); g.moveTo(sx, sy); g.lineTo(64 + (sx < 64 ? -10 : 10), sy - 6 - r() * 8); g.lineTo(sx, sy - 4); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${90 + r() * 60},${70 + r() * 40},20,${0.15 + r() * 0.2})`; g.fillRect(r() * 128, r() * 256, 2 + r() * 4, 2 + r() * 4); } // blemishes
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// r6.1 broad-leaf understory plant: 5–9 large paddle leaves on arching petioles (reads as elephant ear / heliconia / wild banana)
function bigLeafGeometry(seed, tall) {
  const r = mulberry(seed); const F = GB(); const n = 5 + Math.floor(r() * 5); const H = tall ? 2.4 + r() * 1.2 : 1.0 + r() * 0.6;
  for (let i = 0; i < n; i++) {
    const az = i / n * Math.PI * 2 + r() * 0.6; const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)); const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const ph = H * (0.55 + r() * 0.45); const out = H * (0.18 + r() * 0.25); const L = H * (0.55 + r() * 0.35), W = L * (0.32 + r() * 0.12);
    const base = new THREE.Vector3(0, 0, 0), tip = dir.clone().multiplyScalar(out).add(new THREE.Vector3(0, ph, 0));
    // petiole (thin ribbon)
    { const b0 = F.p.length / 3; for (let k = 0; k <= 3; k++) { const t = k / 3; const q = base.clone().lerp(tip, t); q.y -= Math.sin(t * Math.PI) * -0.05 * H; for (const sg of [-1, 1]) { F.p.push(q.x + side.x * sg * 0.025, q.y, q.z + side.z * sg * 0.025); F.uv.push(0.5, 0.02); F.c.push(0.55, 0.7, 0.35); F.s.push(t * 0.5); } }
      for (let k = 0; k < 3; k++) { const a = b0 + k * 2; F.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    // blade: 4 rows along its length, 3 across; bends down toward the tip, slight V fold at the midrib
    const tilt = 0.25 + r() * 0.5; const b1 = F.p.length / 3; const tint = [0.85 + r() * 0.25, 0.95 + r() * 0.15, 0.75 + r() * 0.2];
    for (let k = 0; k <= 4; k++) { const t = k / 4; const c = tip.clone().addScaledVector(dir, L * t * Math.cos(tilt)).add(new THREE.Vector3(0, L * (Math.sin(tilt) * t - 0.55 * t * t), 0));
      for (const f of [-1, 0, 1]) { const q = c.clone().addScaledVector(side, f * W * 0.5).add(new THREE.Vector3(0, -Math.abs(f) * W * 0.12, 0)); F.p.push(q.x, q.y, q.z); F.uv.push((f + 1) / 2, t * 0.98 + 0.01); F.c.push(...tint); F.s.push(0.4 + t * 0.9); } }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) { const a = b1 + k * 3 + j, b = a + 3; F.i.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  return gbBuild(F);
}
// r6.1 leaf litter: a patch of ~14 small fallen leaves lying on the ground (brown / ochre / a few green), plus 3 seedlings
function litterGeometry(seed) {
  const r = mulberry(seed); const F = GB();
  for (let k = 0; k < 14; k++) { const x = (r() - 0.5) * 2.2, z = (r() - 0.5) * 2.2, a = r() * 6.28, L = 0.14 + r() * 0.16, W = L * 0.45; const ca = Math.cos(a), sa = Math.sin(a); const y = 0.015 + r() * 0.02; const b = F.p.length / 3;
    const tint = r() < 0.75 ? [0.62 + r() * 0.2, 0.42 + r() * 0.12, 0.2] : [0.5, 0.7, 0.32];
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const lx = (u - 0.5) * W, lz = (v - 0.5) * L; F.p.push(x + lx * ca - lz * sa, y + (u - 0.5) * 0.01, z + lx * sa + lz * ca); F.uv.push(u, v); F.c.push(...tint); F.s.push(0); }
    F.i.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  for (let k = 0; k < 3; k++) { const x = (r() - 0.5) * 1.8, z = (r() - 0.5) * 1.8, H = 0.25 + r() * 0.3, a = r() * 6.28; const b = F.p.length / 3; const sx = Math.cos(a) * 0.09, sz = Math.sin(a) * 0.09;
    for (const [dx, dy, dz, u, v] of [[-sx, H * 0.6, -sz, 0, 0], [sx, H * 0.6, sz, 1, 0], [sx, H, sz, 1, 1], [-sx, H, -sz, 0, 1]]) { F.p.push(x + dx, dy, z + dz); F.uv.push(u, v); F.c.push(0.55, 0.8, 0.4); F.s.push(0.3); }
    F.i.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return gbBuild(F);
}
// r6.1 understory palm (unit height ~ 9 m): slim ringed trunk + 9–12 arching pinnate fronds; far LOD keeps 5 fronds
function underPalm(seed, lod) {
  const r = mulberry(seed); const F = GB(); const H = 9; const lean = new THREE.Vector3((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2); const top = new THREE.Vector3(0, H, 0).add(lean);
  const trunk = tube([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(lean.x * 0.3, H * 0.5, lean.z * 0.3), top], 0.16, 0.11, lod ? 4 : 6, lod ? 2 : 4);
  trunk.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(trunk.attributes.position.count).map((_, i) => trunk.attributes.position.getY(i) / H * 0.25), 1));
  const n = lod ? 5 : 9 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) addFrond(F, top, i / n * Math.PI * 2 + r() * 0.3, 3.2 + r() * 1.3, 0.55 + r() * 0.35, 1.25 + r() * 0.4, lod ? 3 : 6, [0.55 + r() * 0.15, 0.78 + r() * 0.1, 0.38], { wingDrop: 0.4, maxW: 0.55, rachis: !lod });
  return { trunk, leaves: gbBuild(F) };
}
// grass clump: 14 tapered blades with tip colour; aH = height fraction (wind weight)
export function grassClump(seed, tall) {
  const r = mulberry(seed); const p = [], n = [], c = [], h = [], idx = []; const NB = 18;
  for (let b = 0; b < NB; b++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.42; const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr; const H = (tall ? 0.7 : 0.45) + r() * (tall ? 0.6 : 0.3);
    const la = r() * Math.PI * 2, lean = 0.15 + r() * 0.35; const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean; const w = 0.018 + r() * 0.016; const wa = r() * Math.PI;
    const sx = Math.cos(wa) * w, sz = Math.sin(wa) * w; const base = p.length / 3;
    const tip = 0.5 + r() * 0.5; const C0 = [0.10, 0.17, 0.05], C1 = tall ? [0.36 * tip + 0.2, 0.34 * tip + 0.22, 0.10] : [0.24, 0.36, 0.10];
    const L = [[0, 1], [0.5, 0.62], [1, 0]];
    for (const [t, wf] of L) { const y = H * t; const ox = bx + lx * t * t * H, oz = bz + lz * t * t * H;
      for (const sg of (wf > 0 ? [-1, 1] : [0])) { p.push(ox + sx * sg * wf, y, oz + sz * sg * wf); n.push(lx * 0.4, 1, lz * 0.4); const cc = C0.map((q, k) => lerp(q, C1[k], t)); c.push(...cc); h.push(t); } }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1)); g.setIndex(idx); g.computeBoundingSphere(); return g;
}
// wildflower patch: stems + small petal crosses (vertex colours carry the bloom colour; instance colour tints it)
function flowerClump(seed) {
  const r = mulberry(seed); const p = [], n = [], c = [], h = [], idx = [];
  for (let f = 0; f < 7; f++) {
    const x = (r() - 0.5) * 0.8, z = (r() - 0.5) * 0.8, H = 0.35 + r() * 0.45; const base = p.length / 3;
    p.push(x - 0.008, 0, z, x + 0.008, 0, z, x, H, z); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0); c.push(0.2, 0.35, 0.1, 0.2, 0.35, 0.1, 0.25, 0.4, 0.12); h.push(0, 0, 1); idx.push(base, base + 1, base + 2);
    const s = 0.05 + r() * 0.04; const b2 = p.length / 3;
    for (const [dx, dz] of [[-s, 0], [s, 0], [0, -s], [0, s]]) { p.push(x + dx, H + 0.01, z + dz); n.push(0, 1, 0); c.push(1, 1, 1); h.push(1); }
    p.push(x, H + 0.03, z); n.push(0, 1, 0); c.push(1, 0.85, 0.3); h.push(1);
    idx.push(b2, b2 + 2, b2 + 4, b2 + 2, b2 + 1, b2 + 4, b2 + 1, b2 + 3, b2 + 4, b2 + 3, b2, b2 + 4);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1)); g.setIndex(idx); return g;
}
// wind: travelling gusts across the prairie (world-space waves) + per-blade flutter, weighted by aH²
const windPatch = (amp) => (s) => {
  s.uniforms.uTime = U.uTime;
  // b_envprog: amplitude as a uniform -> grass and flowers share one program (?oldenvmat: baked constant)
  let cA = amp.toFixed(2); if (!OLDENV) { s.uniforms.uWAmp = { value: +cA }; cA = 'uWAmp'; }
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aH;' + (OLDENV ? '' : ' uniform float uWAmp;'))
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec2 wp = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
  float gust = sin(dot(wp, vec2(0.055, 0.031)) - uTime * 1.6) * 0.5 + 0.5; gust = gust * gust;
  float fl = sin(uTime * 4.7 + wp.x * 1.3 + wp.y * 0.7 + position.x * 9.0) * 0.06;
  float k = aH * aH * ${cA};
  vec3 wd = vec3(0.86, 0.0, 0.5);
  transformed += wd * (0.12 + 0.55 * gust) * k + vec3(fl, 0.0, fl * 0.6) * k;
  transformed.y -= (0.10 + 0.25 * gust) * k * 0.35;`);
  // blades / petals are lit like the ground they stand on (no black back faces on double-sided cards)
  s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(0.15, 1.0, 0.1, 0.0)).xyz);');
};

// ------------------------------------------------------------------------- instanced LOD sets ----
class LodSet {
  // r6.1: the instanced meshes are allocated on the first update with exactly items.length slots. Before, a fixed 6000-slot
  // buffer overflowed once the rainforest got its second understory layer (count > buffer -> garbage matrices -> giant black
  // slabs / white spikes across the screen); update() also clamps to the capacity.
  constructor(scene, near, far, max, cast) { this.items = []; this.spec = { scene, near, far, cast }; this.near = []; this.far = []; this.cap = 0; void max; }
  alloc() { const { scene, near, far, cast } = this.spec; this.cap = Math.max(1, this.items.length);
    this.near = near.map((g) => this.mk(scene, g[0], g[1], this.cap, cast)); this.far = far.map((g) => this.mk(scene, g[0], g[1], this.cap, cast)); }
  mk(scene, geo, mat, max, cast) { const im = new THREE.InstancedMesh(geo, mat, max); im.count = 0; im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; if (mat.alphaTest) im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest, side: THREE.DoubleSide }); scene.add(im); return im; }
  add(m, x, z) { this.items.push([m, x, z]); }
  update(cx, cz, N2, F2) { let nn = 0, nf = 0; if (!this.cap) this.alloc();
    for (const [m, x, z] of this.items) { const d = (x - cx) ** 2 + (z - cz) ** 2; if (d > F2) continue; if (d < N2) { for (const im of this.near) im.setMatrixAt(nn, m); nn++; } else { for (const im of this.far) im.setMatrixAt(nf, m); nf++; } }
    for (const im of this.near) { im.count = nn; im.instanceMatrix.needsUpdate = true; } for (const im of this.far) { im.count = nf; im.instanceMatrix.needsUpdate = true; } return nn + nf; }
}

// ------------------------------------------------------------------------- build ----
export function buildNature(scene, city, T, field) {
  const F = field; const out = { meshes: [], stats: {} };
  const tmat = terrainMaterial(T);
  // ---- terrain chunks (160 m)
  const CH = 32; let tTris = 0;
  for (let cj = 0; cj < F.NZ - 1; cj += CH) for (let ci = 0; ci < F.NX - 1; ci += CH) {
    const i1 = Math.min(F.NX - 1, ci + CH), j1 = Math.min(F.NZ - 1, cj + CH); const w = i1 - ci + 1, hgt = j1 - cj + 1;
    const pos = new Float32Array(w * hgt * 3), nor = new Float32Array(w * hgt * 3), uv = new Float32Array(w * hgt * 2), bio = new Float32Array(w * hgt * 3);
    let v = 0;
    for (let j = cj; j <= j1; j++) for (let i = ci; i <= i1; i++, v++) {
      const k = j * F.NX + i; const x = F.X0 + i * CELL, z = F.Z0 + j * CELL; const y = F.HA[k];
      pos.set([x, y, z], v * 3); uv.set([x / 4, z / 4], v * 2);
      const HA = F.HA; const hl = HA[j * F.NX + Math.max(0, i - 1)], hr = HA[j * F.NX + Math.min(F.NX - 1, i + 1)], hd = HA[Math.max(0, j - 1) * F.NX + i], hu = HA[Math.min(F.NZ - 1, j + 1) * F.NX + i];
      const nx = hl - hr, nz = hd - hu, ny = 2 * CELL; const L = Math.hypot(nx, ny, nz); nor.set([nx / L, ny / L, nz / L], v * 3);
      bio.set([smooth(2280, 2480, z), F.WET[k], smooth(9.5, 6.0, F.RD[k])], v * 3);
    }
    const idx = []; for (let j = 0; j < hgt - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aBio', new THREE.BufferAttribute(bio, 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, tmat); m.receiveShadow = true; m.castShadow = true; m.name = 'terrain'; scene.add(m); out.meshes.push(m); tTris += idx.length / 3;
  }
  out.stats.terrainTris = tTris;
  // ---- materials for plants
  for (const t of [T.leafcluster, T.bark_d]) t.colorSpace = THREE.SRGBColorSpace;
  const leafMat = prep(new THREE.MeshStandardMaterial({ map: T.leafcluster, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true, color: new THREE.Color().setRGB(0.95, 1.08, 0.78) }), 'jleaf', (s) => foliagePatch(s, 0.5));
  const vineMat = prep(new THREE.MeshStandardMaterial({ map: T.leafcluster, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true, color: new THREE.Color().setRGB(1.2, 1.3, 1.0) }), 'jvine', (s) => foliagePatch(s, 0.2));
  // mossy bark: bark texture + green moss on the up/north-facing side and near the ground
  const barkMat = prep(new THREE.MeshStandardMaterial({ map: T.bark_d, roughness: 0.95, color: 0xffffff }), 'jbark', (s) => {
    foliagePatch(s, 0.0);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBW; varying vec3 vBN;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvBW = position; vBN = normal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBW; varying vec3 vBN;' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float mz = smoothstep(0.35, 0.75, nvn(vBW.xy * 1.7 + vBW.zz * 1.3) * 0.7 + max(vBN.z, 0.0) * 0.35 + (1.0 - smoothstep(0.0, 6.0, vBW.y)) * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.1, 1.06, 1.0), vec3(0.30, 0.40, 0.16) * (0.8 + 0.6 * diffuseColor.g), mz * 0.7);`);
  });
  const fernMat = prep(new THREE.MeshStandardMaterial({ map: pinnateTex(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true, color: new THREE.Color().setRGB(1.0, 1.08, 0.9) }), 'fern', (s) => foliagePatch(s, 0.4));
  const grassMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.82 }), 'grassb', windPatch(1.0));
  const flowerMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), 'flower', windPatch(0.7));
  const rockMat = prep(new THREE.MeshStandardMaterial({ map: T.concrete_d, color: 0x8a8a80, roughness: 0.85 }), 'boulder', (s) => {
    s.uniforms.uFalls = { value: new THREE.Vector3(FALLS.x, FALLS.pool, FALLS.z) };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN; uniform vec3 uFalls;' + NOISE).replace('#include <map_fragment>', `#include <map_fragment>
  // r6.1 moss grows on the top / north faces, the rock is dark and glossy-wet in the falls' spray zone and at the waterline
  float up = clamp(vRN.y, 0.0, 1.0);
  float mo = smoothstep(0.35, 0.75, nvn(vRW.xz * 0.9) * 0.5 + 0.25 * nvn(vRW.xy * 2.0) + up * 0.45);
  float dF = length((vRW - uFalls) * vec3(1.0, 0.6, 1.0)); float wetR = clamp((1.0 - smoothstep(8.0, 34.0, dF)) + (1.0 - smoothstep(uFalls.y - 0.2, uFalls.y + 1.5, vRW.y)) * 0.5, 0.0, 1.0);
  vec3 rk = diffuseColor.rgb * vec3(0.8, 0.78, 0.72) * (0.8 + 0.4 * nvn(vRW.xz * 3.0 + vRW.y));
  vec3 mossC = mix(vec3(0.16, 0.26, 0.09), vec3(0.24, 0.34, 0.10), nvn(vRW.xz * 6.0));
  diffuseColor.rgb = mix(rk, mossC, mo * 0.85);
  diffuseColor.rgb *= 1.0 - wetR * 0.45;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.18, wetR * (1.0 - mo * 0.6)); roughnessFactor = mix(roughnessFactor, 0.95, mo * (1.0 - wetR));');
  });
  // ---- tree placement (deterministic)
  const R = mulberry(4505);
  const okTree = (x, z, clear) => { if (!F.inside(x, z)) return false; if (F.at(F.RD, x, z) < clear) return false; if (F.waterAt(x, z)) return false; if (F.slope(x, z) > 0.75) return false; const h = F.H(x, z); return h > 0.2 || h > -0.05 && F.at(F.RD, x, z) > 40; };
  const kinds = ['emergent', 'canopy', 'under', 'lone'];
  const geos = {}; for (const k of kinds) geos[k] = [0, 1, 2].map((v) => ({ near: jungleTree(31 + v * 17 + k.length, k, false), far: jungleTree(31 + v * 17 + k.length, k, true) }));
  // r6.1: 3 silhouettes per kind (was 2)
  const sets = {}; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  for (const k of kinds) sets[k] = geos[k].map((g) => new LodSet(scene, [[g.near.trunk, barkMat], [g.near.leaves, leafMat], ...(g.near.vines ? [[g.near.vines, vineMat]] : [])], [[g.far.trunk, barkMat], [g.far.leaves, leafMat]], 6000, true));
  let nTrees = 0;
  const place = (k, x, z, s) => { const h = F.H(x, z); q.setFromEuler(new THREE.Euler(0, R() * 6.283, 0)); sc.set(s * (0.9 + R() * 0.2), s, s * (0.9 + R() * 0.2)); pv.set(x, h - 0.1, z); m4.compose(pv, q, sc); sets[k][Math.floor(R() * 2.999)].add(m4.clone(), x, z); nTrees++;
    if (k !== 'under' && city.col) { const tr = k === 'emergent' ? 1.1 * s : 0.7 * s; city.col.add(x - tr, z - tr, x + tr, z + tr, 30, 'tree'); } };
  const jit = (step, fn) => { for (let z = WILD.z0 + step / 2; z < WILD.z1; z += step) for (let x = WILD.x0 + step / 2; x < WILD.x1; x += step) fn(x + (R() - 0.5) * step * 0.9, z + (R() - 0.5) * step * 0.9); };
  // rainforest: emergents ~38 m apart, canopy ~16 m, understory ~13 m (denser near water)
  jit(38, (x, z) => { const fk = F.forestK(x, z); if (R() < fk * 0.9 && okTree(x, z, 14)) place('emergent', x, z, (38 + R() * 12) / 44); });
  jit(14, (x, z) => { const fk = F.forestK(x, z); if (R() < fk * 0.95 - 0.05 && okTree(x, z, 10)) place('canopy', x, z, (20 + R() * 11) / 27); });
  jit(13, (x, z) => { const fk = F.forestK(x, z); if (R() < fk * 0.7 && okTree(x, z, 7)) place('under', x, z, (6 + R() * 5) / 9); });
  // r6.1 second understory layer (smaller trees between the first) + understory palms -> layered, no bare gaps under the canopy
  jit(9, (x, z) => { const fk = F.forestK(x, z); if (R() < fk * 0.55 - 0.15 && okTree(x, z, 6)) place('under', x, z, (3.5 + R() * 4) / 9); });
  const palmG = [0, 1, 2].map((v) => ({ near: underPalm(71 + v * 13, false), far: underPalm(71 + v * 13, true) }));
  const palmLeafMat = prep(new THREE.MeshStandardMaterial({ map: fernMat.map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true, color: new THREE.Color().setRGB(0.95, 1.02, 0.85) }), 'jpalm', (s) => foliagePatch(s, 0.4, 0.3)); // seen from below: weak transmission (fronds glowed white)
  const palmSets = palmG.map((g) => new LodSet(scene, [[g.near.trunk, barkMat], [g.near.leaves, palmLeafMat]], [[g.far.trunk, barkMat], [g.far.leaves, palmLeafMat]], 4000, true));
  let nPalm = 0;
  jit(16, (x, z) => { const fk = F.forestK(x, z); if (R() < fk * 0.5 && okTree(x, z, 6)) { const h = F.H(x, z); const sc2 = (5 + R() * 6) / 9; q.setFromEuler(new THREE.Euler(0, R() * 6.283, 0)); sc.set(sc2, sc2, sc2); pv.set(x, h - 0.1, z); m4.compose(pv, q, sc); palmSets[Math.floor(R() * 2.999)].add(m4.clone(), x, z); nPalm++; } });
  out.stats.palms = nPalm;
  // forest edge + savanna transition and lone shade trees on the prairie
  jit(70, (x, z) => { const fk = F.forestK(x, z); if (fk < 0.2 && R() < 0.33 && okTree(x, z, 16)) place('lone', x, z, (10 + R() * 6) / 13); });
  jit(28, (x, z) => { const fk = F.forestK(x, z); if (fk > 0.05 && fk < 0.6 && R() < 0.45 && okTree(x, z, 9)) place(R() < 0.5 ? 'under' : 'lone', x, z, 0.8 + R() * 0.4); });
  // a few palms along the forest road and the coast (existing veg.js palms)
  for (let i = 0; i < 160; i++) { const x = lerp(WILD.x0, WILD.x1, R()), z = lerp(2380, 3300, R()); if (okTree(x, z, 6) && F.at(F.RD, x, z) < 22) city.palms.push({ x, z, h: 7 + R() * 7, lean: (R() - 0.5) * 0.2, rot: R() * 6.28, s: 1, region: true, wild: true }); }
  // prairie shrub islands (veg.js shrubs)
  for (let i = 0; i < 420; i++) { const x = lerp(WILD.x0, WILD.x1, R()), z = lerp(WILD.z0, 2500, R()); if (F.forestK(x, z) < 0.5 && okTree(x, z, 6) && vn(x / 60, z / 60) > 0.55) city.shrubs.push({ x, z, s: 0.8 + R() * 0.9 }); }
  out.stats.trees = nTrees;
  // ---- boulders: pool, stream banks, cliff foot, scattered in the forest
  const rockG = (() => { const g = new THREE.IcosahedronGeometry(1, 2); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const d = 0.75 + 0.45 * vn(x * 2.1 + 5, z * 2.1 + y * 1.7); P.setXYZ(i, x * d * 1.3, y * d * 0.75, z * d); } g.computeVertexNormals(); return g; })();
  // r6.1 rocks sit on the lowest point of their footprint (no boulders hovering over a downhill slope)
  const rocks = []; const addRock = (x, z, s) => { const h = Math.min(F.H(x, z), F.H(x + s * 1.1, z), F.H(x - s * 1.1, z), F.H(x, z + s), F.H(x, z - s)); q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.24)); sc.set(s, s * (0.6 + R() * 0.6), s); pv.set(x, h - s * 0.38, z); /* vis-sweep: tilt up to 0.5 rad lifted the flat boulder's girth 0.3·s above ground -> pitch-black floating overhangs (5 m slope boulders) */ m4.compose(pv, q, sc); rocks.push(m4.clone()); };
  for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2, rr = 12 + R() * 9; addRock(FALLS.x + Math.cos(a) * rr, FALLS.z + Math.sin(a) * rr * 0.8, 0.8 + R() * 2.2); }
  for (let i = 1; i < F.SP.length; i++) for (let k = 0; k < 3; k++) { const a = F.SP[i - 1], b = F.SP[i]; const t = R(); const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; const sg = R() < 0.5 ? -1 : 1; const off = F.streamHW(F.SC[i]) + 0.5 + R() * 3;
    addRock(a[0] + dx * t - dz / L * off * sg, a[1] + dz * t + dx / L * off * sg, 0.4 + R() * 1.1); }
  for (let i = 0; i < 120; i++) { const a = R() * Math.PI * 2, rr = 20 + R() * 26; addRock(FALLS.x + Math.cos(a) * rr, FALLS.z - 6 + Math.sin(a) * rr * 0.7, 0.5 + R() * 1.4); } // r6.1 boulder field around the pool
  for (let i = 0; i < 520; i++) { const x = lerp(WILD.x0 + 40, WILD.x1 - 40, R()), z = lerp(2450, 3550, R()); if (F.inside(x, z) && F.at(F.RD, x, z) > 8 && !F.waterAt(x, z)) addRock(x, z, 0.5 + R() * 1.6 + (F.slope(x, z) > 0.5 ? 2.5 : 0)); }
  for (let i = 0; i < 40; i++) { const x = lerp(WILD.x0 + 40, WILD.x1 - 40, R()), z = lerp(WILD.z0 + 40, 2300, R()); if (F.at(F.RD, x, z) > 10) addRock(x, z, 0.6 + R() * 1.4); }
  { const im = new THREE.InstancedMesh(rockG, rockMat, rocks.length); rocks.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); out.meshes.push(im); }
  // ---- water: stream ribbon, plunge pool, plateau feed, lake, falls sheet
  T.waternormals.wrapS = T.waternormals.wrapT = THREE.RepeatWrapping;
  const waterMat = prep(new THREE.MeshStandardMaterial({ color: 0x1d3a33, roughness: 0.06, metalness: 0.0, normalMap: T.waternormals, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9, envMapIntensity: 0.45 }), 'creek', (s) => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFlow; varying float vFlow;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFlow = aFlow;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying float vFlow;' + NOISE)
      .replace('#include <normal_fragment_maps>', `vec2 fuv = vNormalMapUv + vec2(0.0, -uTime * 0.35 * vFlow);
  vec3 n1 = texture2D(normalMap, fuv).xyz * 2.0 - 1.0; vec3 n2 = texture2D(normalMap, fuv * 1.7 + vec2(0.31, -uTime * 0.12)).xyz * 2.0 - 1.0;
  vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, 1.0)); normal = normalize(tbn * mapN);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float foamN = nvn(vNormalMapUv * vec2(6.0, 2.0) + vec2(0.0, -uTime * 0.9 * vFlow)); float foam = smoothstep(0.62, 0.9, foamN) * vFlow * 0.6;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.9), foam); diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`);
  });
  const ribbon = (pts, yOf, hwOf, flow, uvScale = 0.12) => {
    const p = [], uv = [], fl = [], idx = []; let acc = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; const nx = -dz / L, nz = dx / L;
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const hw = hwOf(i), y = yOf(i);
      p.push(pts[i][0] + nx * hw, y, pts[i][1] + nz * hw, pts[i][0] - nx * hw, y, pts[i][1] - nz * hw); uv.push(0, acc * uvScale, hw * 2 * uvScale, acc * uvScale); fl.push(flow, flow); }
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 1));
    g.setIndex(idx); g.computeVertexNormals(); for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0); return g;
  };
  const addW = (g) => { const m = new THREE.Mesh(g, waterMat); m.receiveShadow = true; m.renderOrder = 2; scene.add(m); out.meshes.push(m); return m; };
  addW(ribbon(F.SP, (i) => F.level(F.SC[i]) - 0.05, (i) => F.streamHW(F.SC[i]) + 0.9, 1.0));
  addW(ribbon([[FALLS.x, 3186], [FALLS.x, 3150], [FALLS.x, 3116]], () => FALLS.top - 0.4, () => FALLS.w / 2 - 0.6, 1.4));
  const disc = (cx, cz, rx, rz, y) => { const g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2); g.scale(rx, 1, rz); g.translate(cx, y, cz); const n = g.attributes.position.count; g.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.05), 1));
    const uvA = g.attributes.uv; const P = g.attributes.position; for (let i = 0; i < n; i++) uvA.setXY(i, P.getX(i) * 0.08, P.getZ(i) * 0.08); return g; };
  addW(disc(LAKE.x, LAKE.z, LAKE.rx * 1.02, LAKE.rz * 1.02, LAKE.y)); addW(disc(FALLS.x, FALLS.z, 13.0, 11.0, FALLS.pool));
  // falls (r6.1 rewrite): three layered sheets (dense core, broken outer veil, spray skin). The flow texture is parameterised by
  // free-fall time (sqrt of the drop), so streaks start slow at the lip and stretch + accelerate toward the pool; gaps in the
  // veil show the wet rock behind; white aerated foam at the lip and a churning foot; lit by the sun / sky, dim at night.
  const fallsMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: U.uTime, uSunCol: U.uSunCol, uNight: U.uNight, uK: { value: 1 }, uSeed: { value: 0 } }]),
    vertexShader: `varying vec2 vUv; varying vec3 vFogWP; uniform float uTime; uniform float uSeed; void main(){ vUv = uv; vec3 p = position; float t = 1.0 - uv.y;
      p.z += sin(uTime * 2.1 + uv.x * 9.0 + uSeed * 5.0) * 0.08 * t; vec4 wp = modelMatrix * vec4(p,1.0); vFogWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime, uNight, uK, uSeed; uniform vec3 uSunCol; varying vec2 vUv; ${NOISE}
      uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogWP;
      void main(){ float t = 1.0 - vUv.y; float ft = sqrt(t) * 6.0;           // free-fall time along the sheet
        float x = vUv.x * 14.0 + uSeed * 7.0;
        float s1 = nvn(vec2(x * 1.9, ft * 1.4 - uTime * 2.6)); float s2 = nvn(vec2(x * 4.7 + 3.0, ft * 2.6 - uTime * 4.1)); float s3 = nvn(vec2(x * 11.0, ft * 4.0 - uTime * 6.0));
        float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
        float thick = smoothstep(0.15, 0.6, nvn(vec2(x * 0.45, uTime * 0.12 + uSeed)) * 0.7 + 0.3);   // where the veil is thin the rock shows
        float edge = smoothstep(0.0, 0.10, vUv.x) * (1.0 - smoothstep(0.90, 1.0, vUv.x));
        float lipFoam = (1.0 - smoothstep(0.0, 0.08, t)); float footFoam = smoothstep(0.72, 1.0, t);
        float a = mix(smoothstep(0.38, 0.72, streak) * thick, 1.0, max(lipFoam * 0.8, footFoam * 0.7)) * edge * uK;
        a *= 0.55 + 0.45 * smoothstep(0.0, 0.25, t + lipFoam);
        float lum = 0.55 + 0.45 * streak + footFoam * 0.3;
        vec3 sky = vec3(0.55, 0.62, 0.66);
        vec3 c = mix(vec3(0.62, 0.70, 0.72), vec3(0.95, 0.97, 0.97), smoothstep(0.45, 0.8, streak) + lipFoam + footFoam * 0.6);
        c *= (sky * 0.35 + 0.05 * uSunCol * (1.0 - uNight)) * lum * 1.15 + 0.004;
        float fd = 1.0 - exp(-fogDensity * length(vFogWP - cameraPosition)); c = mix(c, fogColor, fd);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * 0.9); }` });
  const sheet = (w, z0, outK, k, sd) => { const g = new THREE.PlaneGeometry(1, 1, 8, 24); const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const u = P.getX(i) + 0.5, v = P.getY(i) + 0.5; const t = 1 - v; const y = FALLS.top - 0.2 - (FALLS.top - FALLS.pool + 0.4) * t; const z = z0 - outK * Math.pow(t, 0.6) - 2.0 * t; const x = FALLS.x + (u - 0.5) * w * (1 + 0.35 * t);
      P.setXYZ(i, x, y, z); } g.computeVertexNormals();
    const mm = fallsMat.clone(); mm.uniforms.uK = { value: k }; mm.uniforms.uSeed = { value: sd }; mm.uniforms.uTime = U.uTime; mm.uniforms.uSunCol = U.uSunCol; mm.uniforms.uNight = U.uNight;
    const mesh = new THREE.Mesh(g, mm); mesh.renderOrder = 3; scene.add(mesh); out.meshes.push(mesh); return mesh; };
  sheet(FALLS.w - 1.5, 3114, 5, 1.0, 0.0); sheet(FALLS.w + 1.2, 3113.8, 5.8, 0.7, 0.37); sheet(FALLS.w + 3.5, 3113.4, 6.8, 0.38, 0.71);
  // spray: ~220 soft particles boiling up and out of the impact zone (life-cycled in the vertex shader, no CPU work)
  { const N = 220; const pts = []; for (let i = 0; i < N; i++) pts.push([(R() - 0.5) * FALLS.w * 1.2, R(), R() * 6.283, R()]);
    const sprayMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTime: U.uTime, uC: { value: new THREE.Vector3(FALLS.x, FALLS.pool, 3113.6 - 7.0) }, uL: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `attribute vec4 aM; uniform float uTime; uniform vec3 uC; varying vec2 vUv; varying float vA;
        void main(){ vUv = uv; float life = fract(uTime * (0.22 + aM.w * 0.18) + aM.y); float a = aM.z;
          vec3 c = uC + vec3(aM.x, 0.0, 0.0) + vec3(cos(a), 0.0, sin(a) * 0.8) * (1.0 + life * (5.0 + aM.w * 6.0)) + vec3(0.0, life * (3.0 + aM.w * 5.0) - life * life * 2.0, 0.0);
          float sz = 1.2 + life * (4.5 + aM.w * 3.0); vA = sin(life * 3.1416) * (0.5 + 0.5 * aM.w);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          gl_Position = projectionMatrix * viewMatrix * vec4(c + (right * position.x + upv * position.y) * sz, 1.0); }`,
      fragmentShader: `uniform vec3 uL; varying vec2 vUv; varying float vA; ${NOISE}
        void main(){ float r = length(vUv - 0.5) * 2.0; float n = nvn(vUv * 5.0 + vA * 3.0); float a = (1.0 - smoothstep(0.2, 1.0, r)) * (0.5 + 0.5 * n) * vA * 0.32; gl_FragColor = vec4(uL, a); }` });
    const g = new THREE.InstancedBufferGeometry(); const b2 = new THREE.PlaneGeometry(1, 1); g.setIndex(b2.index); g.setAttribute('position', b2.attributes.position); g.setAttribute('uv', b2.attributes.uv);
    g.setAttribute('aM', new THREE.InstancedBufferAttribute(new Float32Array(pts.flat()), 4)); g.instanceCount = N; const m = new THREE.Mesh(g, sprayMat); m.frustumCulled = false; m.renderOrder = 5; scene.add(m); out.meshes.push(m);
    out.sprayMat = sprayMat; }
  // churning foam on the plunge pool: radial rings travelling outward from the impact line + drifting foam lace
  { const fg = new THREE.CircleGeometry(1, 48); fg.rotateX(-Math.PI / 2); fg.scale(12.5, 1, 10.5); fg.translate(FALLS.x, FALLS.pool + 0.04, FALLS.z);
    const foamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: U.uTime, uSunCol: U.uSunCol, uNight: U.uNight, uC: { value: new THREE.Vector2(FALLS.x, 3113.6 - 7.0) } }]),
      vertexShader: `varying vec3 vW; varying vec3 vFogWP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vFogWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime, uNight; uniform vec3 uSunCol; uniform vec2 uC; varying vec3 vW; ${NOISE} uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogWP;
        void main(){ vec2 d = vW.xz - uC; float r = length(d * vec2(0.8, 1.0)); float ang = atan(d.y, d.x);
          float rings = nvn(vec2(r * 1.3 - uTime * 1.6, ang * 4.0)) * 0.6 + nvn(vW.xz * 0.9 + vec2(uTime * 0.2, -uTime * 0.35)) * 0.4;
          float a = smoothstep(0.45, 0.8, rings) * (1.0 - smoothstep(2.0, 11.0, r)) + (1.0 - smoothstep(0.0, 4.0, r)) * 0.6;
          vec3 c = vec3(0.9, 0.94, 0.95) * (0.18 + 0.05 * length(uSunCol) * (1.0 - uNight));
          float fd = 1.0 - exp(-fogDensity * length(vFogWP - cameraPosition)); c = mix(c, fogColor, fd);
          gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * 0.75); }` });
    const fm = new THREE.Mesh(fg, foamMat); fm.renderOrder = 3; scene.add(fm); out.meshes.push(fm); }
  out.fallsMat = fallsMat;
  // ---- mist + light shafts (camera-facing soft quads)
  const mistMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(0.8, 0.85, 0.85) }, uA: { value: 0.35 } },
    vertexShader: `attribute vec4 aM; varying vec2 vUv; varying float vSeed; varying float vDist; uniform float uTime;
      void main(){ vUv = uv; vSeed = aM.w; vec3 c = aM.xyz + vec3(sin(uTime * 0.05 + aM.w * 6.0) * 6.0, 0.0, cos(uTime * 0.04 + aM.w * 5.0) * 4.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 wp = c + right * position.x + vec3(0.0, position.y, 0.0);
        vec4 mv = viewMatrix * vec4(wp, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uA; uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vDist; ${NOISE}
      void main(){ vec2 c = vUv - 0.5; float r = 1.0 - smoothstep(0.15, 0.5, length(c * vec2(1.0, 1.6)));
        float n = nvn(vUv * 3.0 + vec2(uTime * 0.03, vSeed * 9.0)) * 0.7 + nvn(vUv * 7.0 - vec2(uTime * 0.05, 0.0)) * 0.3;
        float a = r * smoothstep(0.25, 0.7, n) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(4.0, 22.0, vDist) * uA;
        gl_FragColor = vec4(uCol, a); }` });
  const mistPts = [];
  for (let i = 0; i < 150; i++) { const x = lerp(WILD.x0 + 60, WILD.x1 - 40, R()), z = lerp(2480, 3400, R()); if (!F.inside(x, z)) continue; mistPts.push([x, F.H(x, z) + 1.5 + R() * 8, z, R()]); }
  for (let i = 0; i < 8; i++) { const a = R() * 6.28; mistPts.push([FALLS.x + Math.cos(a) * 9, FALLS.pool + R() * 3, FALLS.z - 3 + Math.sin(a) * 5, R()]); }
  for (let i = 0; i < 26; i++) { const x = LAKE.x + (R() - 0.5) * LAKE.rx * 1.8, z = LAKE.z + (R() - 0.5) * LAKE.rz * 1.6; mistPts.push([x, LAKE.y + 0.5 + R() * 2, z, R()]); }
  const mkBill = (pts, w, h, mat) => { const g = new THREE.InstancedBufferGeometry(); const b = new THREE.PlaneGeometry(w, h); b.translate(0, h / 2, 0); g.setIndex(b.index); g.setAttribute('position', b.attributes.position); g.setAttribute('uv', b.attributes.uv);
    g.setAttribute('aM', new THREE.InstancedBufferAttribute(new Float32Array(pts.flat()), 4)); g.instanceCount = pts.length; const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 4; scene.add(m); out.meshes.push(m); return m; };
  out.mist = mkBill(mistPts, 26, 10, mistMat); out.mistMat = mistMat;
  // light shafts: tilted along the sun azimuth, faint additive, rooted in canopy gaps
  const shaftMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCol: { value: new THREE.Color(1, 0.9, 0.7) }, uA: { value: 0.0 }, uTilt: { value: new THREE.Vector3(0.3, 1, 0.1) } },
    vertexShader: `attribute vec4 aM; varying vec2 vUv; varying float vSeed; uniform vec3 uTilt;
      void main(){ vUv = uv; vSeed = aM.w; vec3 axis = normalize(uTilt); vec3 c = aM.xyz;
        vec3 toCam = normalize(cameraPosition - c); vec3 side = normalize(cross(axis, toCam)); vec3 wp = c + side * position.x * (0.6 + vSeed) + axis * position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uA; varying vec2 vUv; varying float vSeed;
      void main(){ float a = (1.0 - abs(vUv.x - 0.5) * 2.0); a = a * a * smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * uA * (0.5 + vSeed);
        gl_FragColor = vec4(uCol * a, 1.0); }` });
  const shaftPts = []; for (let i = 0; i < 160; i++) { const x = lerp(WILD.x0 + 60, WILD.x1 - 40, R()), z = lerp(2500, 3350, R()); if (!F.inside(x, z)) continue; shaftPts.push([x, F.H(x, z) - 1, z, R()]); }
  out.shafts = mkBill(shaftPts, 5, 34, shaftMat); out.shaftMat = shaftMat;
  // ---- streamed near detail: grass / flowers (prairie), ferns (forest) re-scattered around the camera
  const grassG = [grassClump(7, true), grassClump(13, true), grassClump(23, false)];
  const MAXG = 9000, MAXF = 2600, MAXN = 3200; // r6.1 ferns 1400 -> 3200
  const grassIM = grassG.map((g) => { const im = new THREE.InstancedMesh(g, grassMat, MAXG); im.count = 0; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * 3).fill(1), 3); im.frustumCulled = false; im.receiveShadow = true; scene.add(im); out.meshes.push(im); return im; });
  const flowerIM = new THREE.InstancedMesh(flowerClump(5), flowerMat, MAXF); flowerIM.count = 0; flowerIM.frustumCulled = false; flowerIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3); scene.add(flowerIM); out.meshes.push(flowerIM);
  const fernG = [fernGeometry(3), fernGeometry(9)];
  // r6.1 forest floor layers: broad-leaf plants (two sizes), leaf litter patches
  const bigLeafMat = prep(new THREE.MeshStandardMaterial({ map: broadLeafTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, vertexColors: true, color: new THREE.Color().setRGB(1.0, 1.05, 0.95) }), 'bigleaf', (s) => foliagePatch(s, 0.3));
  const litterMat = prep(new THREE.MeshStandardMaterial({ map: broadLeafTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }), 'litter', (s) => foliagePatch(s, 0.6));
  const MAXB = 1800, MAXL = 2600;
  const bigG = [bigLeafGeometry(5, true), bigLeafGeometry(11, false), bigLeafGeometry(17, false)];
  const bigIM = bigG.map((g) => { const im = new THREE.InstancedMesh(g, bigLeafMat, MAXB); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = true; scene.add(im); out.meshes.push(im); return im; });
  const litterIM = new THREE.InstancedMesh(litterGeometry(3), litterMat, MAXL); litterIM.count = 0; litterIM.frustumCulled = false; litterIM.receiveShadow = true; scene.add(litterIM); out.meshes.push(litterIM);
  const fernIM = fernG.map((g) => { const im = new THREE.InstancedMesh(g, fernMat, MAXN); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; scene.add(im); out.meshes.push(im); return im; });
  const BLOOM = [[1.0, 0.86, 0.2], [0.98, 0.96, 0.92], [0.62, 0.42, 0.95], [0.98, 0.45, 0.2], [0.95, 0.3, 0.45], [0.35, 0.55, 1.0]];
  const GC = 12; let lx = 1e9, lz = 1e9; const col3 = new THREE.Color();
  const scatter = (cx, cz) => {
    const RG = 78, RN = 30; let ng = [0, 0, 0], nf = 0, nn = [0, 0], nb = [0, 0, 0], nl = 0;
    const cells = []; for (let gz = Math.floor((cz - RG) / GC); gz <= Math.floor((cz + RG) / GC); gz++) for (let gx = Math.floor((cx - RG) / GC); gx <= Math.floor((cx + RG) / GC); gx++) { const mx = gx * GC + GC / 2, mz = gz * GC + GC / 2; const d = Math.hypot(mx - cx, mz - cz); if (d < RG + 9 && F.inside(mx, mz)) cells.push([d, gx, gz]); }
    cells.sort((a, b) => a[0] - b[0]);
    for (const [d, gx, gz] of cells) {
      const r = mulberry(gx * 7919 + gz * 104729 + 17); const mx = gx * GC, mz = gz * GC; const fk = F.forestK(mx + 6, mz + 6);
      const nearK = d < RN ? 1 : 0.28; // dense near, sparse (bigger) further out
      if (fk < 0.85) { const n = Math.round(150 * nearK * (1 - fk));
        for (let i = 0; i < n; i++) { const x = mx + r() * GC, z = mz + r() * GC; const rd = F.rdAt(x, z); if (rd < 4.8 || F.waterAt(x, z)) continue; const sl = F.slope(x, z); if (sl > 0.6) continue;
          const v = vn(x / 9, z / 9); const kind = rd < 7.5 ? 2 : (v < 0.3 ? 2 : (i & 1)); if (ng[kind] >= MAXG) continue;
          const s = (0.8 + r() * 0.5) * (nearK < 1 ? 1.5 : 1) * (rd < 7.5 ? 0.7 : 1); q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)); sc.set(s, s * (0.8 + 0.4 * v), s); pv.set(x, F.H(x, z) - 0.03, z); m4.compose(pv, q, sc); grassIM[kind].setMatrixAt(ng[kind], m4);
          { const dry = smooth(0.3, 0.75, vn(x / 70, z / 70) * 0.7 + vn(x / 14, z / 14) * 0.3); col3.setRGB(lerp(0.62, 1.05, dry), lerp(0.95, 1.0, dry), lerp(0.55, 0.9, dry)); grassIM[kind].setColorAt(ng[kind]++, col3); } }
        if (d < 64) { const fv = vn(mx / 45 + 3, mz / 45); if (fv > 0.5) { const nfl = Math.round((fv - 0.5) * 40 * (1 - fk));
          for (let i = 0; i < nfl && nf < MAXF; i++) { const x = mx + r() * GC, z = mz + r() * GC; if (F.rdAt(x, z) < 5.2 || F.waterAt(x, z)) continue; q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)); sc.setScalar(0.8 + r() * 0.6); pv.set(x, F.H(x, z) - 0.02, z); m4.compose(pv, q, sc); flowerIM.setMatrixAt(nf, m4);
            const bc = BLOOM[Math.floor(vn(x / 25, z / 25 + 9) * BLOOM.length * 1.6 + r() * 1.2) % BLOOM.length]; col3.setRGB(bc[0], bc[1], bc[2]); flowerIM.setColorAt(nf++, col3); } } }
      }
      if (fk > 0.35 && d < 70) { // r6.1 broad-leaf understory + leaf litter
        const nB = Math.round(9 * fk * (d < RN ? 1 : 0.55));
        for (let i = 0; i < nB; i++) { const x = mx + r() * GC, z = mz + r() * GC; if (F.rdAt(x, z) < 5.6 || F.waterAt(x, z) || F.slope(x, z) > 0.7) continue; const k = i % 3; if (nb[k] >= MAXB) continue;
          const s2 = (k === 0 ? 0.8 : 0.7) + r() * 0.8; q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)); sc.setScalar(s2); pv.set(x, F.H(x, z) - 0.04, z); m4.compose(pv, q, sc); bigIM[k].setMatrixAt(nb[k]++, m4); }
        if (d < 42) { const nL2 = Math.round(16 * fk);
          for (let i = 0; i < nL2 && nl < MAXL; i++) { const x = mx + r() * GC, z = mz + r() * GC; if (F.rdAt(x, z) < 4.5 || F.waterAt(x, z)) continue; q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)); sc.setScalar(0.8 + r() * 0.6); pv.set(x, F.H(x, z) + 0.01, z); m4.compose(pv, q, sc); litterIM.setMatrixAt(nl++, m4); } }
      }
      if (fk > 0.3 && d < 64) { const n = Math.round(58 * fk * (d < RN ? 1 : 0.5));
        for (let i = 0; i < n; i++) { const x = mx + r() * GC, z = mz + r() * GC; if (F.rdAt(x, z) < 5.2 || F.waterAt(x, z) || F.slope(x, z) > 0.8) continue; const k = i & 1; if (nn[k] >= MAXN) continue; const s = 0.8 + r() * 0.9;
          q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)); sc.setScalar(s); pv.set(x, F.H(x, z) - 0.05, z); m4.compose(pv, q, sc); fernIM[k].setMatrixAt(nn[k]++, m4); } }
    }
    grassIM.forEach((im, k) => { im.count = ng[k]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
    flowerIM.count = nf; flowerIM.instanceMatrix.needsUpdate = true; if (flowerIM.instanceColor) flowerIM.instanceColor.needsUpdate = true;
    fernIM.forEach((im, k) => { im.count = nn[k]; im.instanceMatrix.needsUpdate = true; });
    bigIM.forEach((im, k) => { im.count = nb[k]; im.instanceMatrix.needsUpdate = true; }); litterIM.count = nl; litterIM.instanceMatrix.needsUpdate = true;
    out.stats.bigLeaf = nb[0] + nb[1] + nb[2]; out.stats.litter = nl;
    out.stats.grass = ng.reduce((a, b) => a + b, 0); out.stats.flowers = nf; out.stats.ferns = nn[0] + nn[1];
  };
  let tlx = 1e9, tlz = 1e9;
  out.update = (cam, force = false) => {
    const inW = cam.x > WILD.x0 - 260 && cam.x < WILD.x1 + 260 && cam.z > WILD.z0 - 260 && cam.z < WILD.z1 + 260;
    if (force || Math.hypot(cam.x - tlx, cam.z - tlz) > 20) { tlx = cam.x; tlz = cam.z; let n = 0; for (const k of kinds) for (const s of sets[k]) n += s.update(cam.x, cam.z, (k === 'emergent' ? 230 : 150) ** 2, 1900 ** 2);
      for (const s of palmSets) n += s.update(cam.x, cam.z, 110 ** 2, 900 ** 2); out.stats.treesShown = n; }
    if (force || Math.hypot(cam.x - lx, cam.z - lz) > 7) { lx = cam.x; lz = cam.z; if (inW || force) scatter(cam.x, cam.z); else if (grassIM[0].count || fernIM[0].count) { for (const im of [...grassIM, flowerIM, ...fernIM, ...bigIM, litterIM]) im.count = 0; } }
  };
  // local atmosphere: denser, paler mist under the rainforest canopy; shafts only by day
  out.fogMul = (cam) => { if (!F.inside(cam.x, cam.z)) return 1; const fk = F.forestK(cam.x, cam.z); return 1 + fk * 3.2 * smooth(60, 10, cam.y - F.H(cam.x, cam.z)); };
  out.frame = (env, scene2) => {
    const night = env.look.night || 0; const fc = scene2.fog.color;
    mistMat.uniforms.uCol.value.setRGB(fc.r * 0.85, fc.g * 0.9, fc.b * 0.88); mistMat.uniforms.uA.value = 0.26 - 0.08 * night;
    const sd = U.uSunDir.value; shaftMat.uniforms.uTilt.value.set(sd.x, Math.max(0.35, sd.y), sd.z); shaftMat.uniforms.uA.value = 0.11 * (1 - night) * smooth(0.05, 0.3, sd.y); // r6.1 visible shafts through canopy gaps
    shaftMat.uniforms.uCol.value.copy(U.uSunCol.value).multiplyScalar(0.12);
  };
  out.update({ x: 0, z: 0, y: 10 }, true);
  return out;
}
