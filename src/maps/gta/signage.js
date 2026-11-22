// a_signage (map 索拉纳港 only): street traffic furniture on the island grid — bus stops (cantilever shelter with glazed back
// and end panels, slatted bench, route-map light box, flag-sign stop pole, no-parking post) every ~300 m along 海潮大道 and the
// two inner avenues, a yellow bus bay painted in the kerb lane at every stop (the 5 existing promenade shelters included),
// "慢" lane text on every approach, corner street-name posts (blue plates, original Chinese names + pinyin), cantilever
// guide-sign gantries (路口预告 board + round 限速 sign) over the approaches, and 禁止机动车驶入 plates at the pedestrian alleys.
// Every printed face (station names, route maps, street names, sign legends, road text) is rasterised once on a canvas,
// quantised to the sign's palette and greedily merged into rectangles; each rectangle is one instance of a unit quad in an
// InstancedMesh ("instanced thin decals"), so text costs 2 triangles per rectangle and no texture.
// Materials: every mesh is prep(MeshStandardMaterial({vertexColors:true}), 'fabCar') — the instanced vertex-colour +
// instance-colour MeshStandard program the fabric cars and a_promenade already compile (roughness / metalness / emissive /
// polygonOffset are uniforms or render state) -> no new shader program. The road program only gains A-only wear code.
// All street names come from ./streetnames.js (one table shared with street.js blades, mapapi.js and the HUD's area names).
import * as THREE from 'three';
import { mulberry } from '../../util.js';
import { prep } from '../../mats.js';
import { BLADE_LOG } from '../../street.js'; // a_streetnames: mast-arm blade texts (same table) for streetNames()

const RH = 7;
import { NS_NAME, NS_PY, EW_NAME, EW_PY } from './streetnames.js'; // a_streetnames: single street-name table
export { NS_NAME, NS_PY, EW_NAME, EW_PY };
const EW = [-300, -150, 0, 150, 300];
// original stop names per street, by block (z < -300, -300..-150, -150..0, 0..150, 150..300, > 300)
const STOP_NAMES = {
  50: ['南岸码头', '游艇港', '椰影公园', '鹈鹕市场', '湾畔公寓', '北岸码头'],
  170: ['南角公园', '珊瑚中学', '日光广场', '棕榈岛医院', '老城邮局', '白沙公寓'],
  290: ['南滩', '冲浪俱乐部', '潮汐酒店', '日光海滩', '灯塔公园', '北滩'],
};
const ROUTE = { 50: { no: '7', col: '#1f8a4c', lin: [0.05, 0.27, 0.08] }, 170: { no: '23', col: '#e07a12', lin: [0.75, 0.2, 0.01] }, 290: { no: '12', col: '#1d5fb8', lin: [0.012, 0.11, 0.48] } };
const FONT = '"WenQuanYi Zen Hei","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif';
const blockIdx = (z) => EW.filter((e) => e < z).length;

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MX = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(sx, sy, sz));
const P = (g, m) => { g.applyMatrix4(m); return g; };
const BX = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.BoxGeometry(w, h, d), MX(x, y, z, rx, ry, rz));
const CY = (r0, r1, h, n, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.CylinderGeometry(r0, r1, h, n), MX(x, y, z, rx, ry, rz));
function beam(a, b, w, h = w, n = 0) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  const g = n ? new THREE.CylinderGeometry(w, w, len, n, 1, true) : new THREE.BoxGeometry(w, len, h);
  return P(g, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1)));
}
function merge(parts) { // [geo, rgb] -> one non-indexed position / normal / color geometry (what the 'fabCar' program reads)
  let n = 0; const gs = parts.map(([g0, c]) => { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return [g, c]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const [g, c] of gs) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (let i = 0; i < k; i++) col.set(c, (o + i) * 3); o += k; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
const tris = (g) => g.attributes.position.count / 3;

// ------------------------------------------------------------------------------------------------ rasterised legends ----
// draw(g, W, H) on a canvas pre-filled with pal[0]; every pixel snaps to the nearest palette colour; index 0 is "background"
// (not emitted). opts.drop(x, y) -> true removes the pixel (paint wear). Returns { W, H, rects: [x, y, w, h, ci] }.
let _cv = null, _cg = null; // one CPU-backed canvas reused for every legend (fast getImageData)
function raster(W, H, pal, draw, opts = {}) {
  if (!_cv) { _cv = document.createElement('canvas'); _cg = _cv.getContext('2d', { willReadFrequently: true }); }
  const c = _cv; c.width = W; c.height = H; const g = _cg; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle'; draw(g, W, H);
  const d = g.getImageData(0, 0, W, H).data; const PC = pal.map((h) => { const cc = new THREE.Color(h); cc.convertLinearToSRGB(); return [cc.r * 255, cc.g * 255, cc.b * 255]; });
  const idx = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { let best = 0, bd = 1e9; for (let k = 0; k < PC.length; k++) { const dr = d[i * 4] - PC[k][0], dg = d[i * 4 + 1] - PC[k][1], db = d[i * 4 + 2] - PC[k][2]; const dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } } idx[i] = best; }
  if (opts.drop) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (idx[y * W + x] && opts.drop(x, y)) idx[y * W + x] = 0;
  const rects = []; let open = new Map();
  for (let y = 0; y < H; y++) {
    const next = new Map();
    for (let x = 0; x < W;) { const ci = idx[y * W + x]; if (!ci) { x++; continue; } let x1 = x; while (x1 + 1 < W && idx[y * W + x1 + 1] === ci) x1++;
      const key = x + ',' + x1 + ',' + ci; const r = open.get(key); if (r) { r[3]++; next.set(key, r); open.delete(key); } else { const nr = [x, y, x1 - x + 1, 1, ci]; rects.push(nr); next.set(key, nr); } x = x1 + 1; }
    open = next;
  }
  return { W, H, rects, pal: pal.map((h) => { const cc = new THREE.Color(h); return [cc.r, cc.g, cc.b]; }) };
}
const T = (g, t, x, y, size, col, weight = 'bold', font = FONT) => { g.fillStyle = col; g.font = `${weight} ${size}px ${font}`; g.fillText(t, x, y); };
const fitT = (g, t, x, y, size, col, maxW, weight = 'bold') => { g.font = `${weight} ${size}px ${FONT}`; const w = g.measureText(t).width; T(g, t, x, y, w > maxW ? Math.floor(size * maxW / w) : size, col, weight); };
function busGlyph(g, cx, cy, s, col) { // original front-view bus pictogram
  g.fillStyle = col; const w = 0.9 * s, h = s; const x = cx - w / 2, y = cy - h / 2;
  g.beginPath(); g.roundRect(x, y, w, h * 0.86, s * 0.12); g.fill();
  g.fillStyle = '#000'; g.globalCompositeOperation = 'destination-out'; g.fillRect(x + w * 0.12, y + h * 0.14, w * 0.76, h * 0.34); g.fillRect(x + w * 0.2, y + h * 0.04, w * 0.6, h * 0.05);
  g.beginPath(); g.arc(x + w * 0.22, y + h * 0.66, s * 0.07, 0, 7); g.arc(x + w * 0.78, y + h * 0.66, s * 0.07, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
  g.fillStyle = col; g.fillRect(x + w * 0.1, y + h * 0.84, w * 0.18, h * 0.16); g.fillRect(x + w * 0.72, y + h * 0.84, w * 0.18, h * 0.16);
}

// ------------------------------------------------------------------------------------------------ part geometries ----
const ALU = [0.6, 0.61, 0.62], DARK = [0.16, 0.17, 0.18], GALV = [0.58, 0.59, 0.58], CONC = [0.6, 0.59, 0.56];
// bus shelter, local: x along the street (4.2 m), +z towards the kerb, y = 0 on the pavement; footprint z -0.8..0.92
function shelterBody() {
  const o = [];
  for (const x of [-1.95, 0, 1.95]) { o.push([BX(0.09, 2.56, 0.09, x, 1.28, -0.74), DARK], [BX(0.22, 0.02, 0.22, x, 0.01, -0.74), DARK]); // rear posts + base plates
    o.push([beam(V3(x, 2.5, -0.74), V3(x, 2.58, 0.86), 0.07, 0.12), DARK]); } // cantilever roof arms
  o.push([BX(4.35, 0.05, 1.8, 0, 2.66, 0.06, -0.045), [0.86, 0.87, 0.88]], [BX(4.3, 0.012, 1.74, 0, 2.63, 0.06, -0.045), [0.95, 0.95, 0.94]]); // roof deck + white soffit
  o.push([BX(4.38, 0.24, 0.05, 0, 2.62, 0.96), [0.07, 0.12, 0.2]], [BX(4.38, 0.08, 0.12, 0, 2.74, -0.86), ALU]); // front fascia (name band), rear gutter
  o.push([CY(0.035, 0.035, 2.5, 6, -1.95, 1.3, -0.82), ALU]); // downpipe
  o.push([BX(3.9, 0.06, 0.05, 0, 0.12, -0.72), ALU], [BX(3.9, 0.06, 0.05, 0, 2.08, -0.72), ALU], [BX(0.05, 1.98, 0.05, 1.0, 1.1, -0.72), ALU], [BX(0.05, 1.98, 0.05, -1.0, 1.1, -0.72), ALU]); // back glazing frame
  o.push([BX(3.86, 0.07, 0.004, 0, 1.45, -0.69), [0.82, 0.84, 0.84]], [BX(3.86, 0.07, 0.004, 0, 1.45, -0.755), [0.82, 0.84, 0.84]]); // frosted manifestation band
  o.push([BX(0.05, 1.98, 0.05, -1.95, 1.1, 0.16), ALU], [BX(0.05, 0.06, 0.92, -1.95, 0.12, -0.28), ALU], [BX(0.05, 0.06, 0.92, -1.95, 2.08, -0.28), ALU]); // end panel frame (downstream end)
  const wood = [0.55, 0.37, 0.22];
  for (let k = 0; k < 4; k++) o.push([BX(1.9, 0.035, 0.085, -0.45, 0.46, -0.6 + k * 0.1), wood]); // slatted bench
  for (const x of [-1.3, 0.4]) o.push([BX(0.06, 0.06, 0.42, x, 0.42, -0.47), DARK], [beam(V3(x, 0.42, -0.68), V3(x, 0.02, -0.66), 0.05, 0.05), DARK]);
  for (const x of [-0.75, -0.15]) o.push([BX(0.04, 0.22, 0.32, x, 0.6, -0.5), DARK]); // anti-sleep dividers
  o.push([BX(4.3, 0.012, 0.36, 0, 0.006, 1.24), [0.85, 0.68, 0.12]]); // yellow tactile strip along the kerb (on the paving)
  for (let k = 0; k < 20; k++) o.push([CY(0.012, 0.014, 0.008, 5, -2.05 + k * 0.215, 0.016, 1.24), [0.8, 0.62, 0.1]]);
  return o;
}
function shelterFar() { return [[BX(4.35, 0.08, 1.8, 0, 2.64, 0.06), [0.8, 0.81, 0.82]], [BX(4.38, 0.24, 0.05, 0, 2.6, 0.96), [0.07, 0.12, 0.2]], [BX(3.9, 2.0, 0.04, 0, 1.1, -0.72), [0.3, 0.38, 0.4]], [BX(0.1, 2.56, 0.1, -1.95, 1.28, -0.74), DARK], [BX(0.1, 2.56, 0.1, 1.95, 1.28, -0.74), DARK], [BX(0.18, 1.86, 1.24, 2.25, 1.08, -0.1), [0.85, 0.86, 0.86]]]; }
function shelterGlass() { return [[BX(3.86, 1.92, 0.012, 0, 1.1, -0.72), [0.36, 0.45, 0.47]], [BX(0.012, 1.92, 0.88, -1.95, 1.1, -0.28), [0.36, 0.45, 0.47]]]; }
// route-map light box at the upstream end (x = +2.25; local +x is upstream on both street sides), faces +-x; housing only (the lit faces are 'litFace' quads)
function lightBox() {
  const o = [[BX(0.16, 1.86, 1.24, 2.25, 1.08, -0.1), [0.2, 0.21, 0.22]], [BX(0.2, 0.06, 1.28, 2.25, 2.03, -0.1), DARK], [BX(0.12, 0.15, 1.0, 2.25, 0.075, -0.1), DARK]];
  for (const s of [-1, 1]) { o.push([BX(0.012, 1.78, 0.04, 2.25 + s * 0.082, 1.1, -0.72), [0.7, 0.71, 0.72]], [BX(0.012, 1.78, 0.04, 2.25 + s * 0.082, 1.1, 0.52), [0.7, 0.71, 0.72]], [BX(0.012, 0.04, 1.24, 2.25 + s * 0.082, 1.98, -0.1), [0.7, 0.71, 0.72]], [BX(0.012, 0.04, 1.24, 2.25 + s * 0.082, 0.2, -0.1), [0.7, 0.71, 0.72]]); }
  return o;
}
// generic sign post (galvanised 76 mm), h = top height; local y up; with concrete footing collar and cap
function post(h) { return [[CY(0.038, 0.038, h, 8, 0, h / 2, 0), GALV], [CY(0.07, 0.08, 0.06, 8, 0, 0.03, 0), CONC], [CY(0.045, 0.04, 0.03, 8, 0, h + 0.015, 0), [0.45, 0.46, 0.46]]]; }
const clampBand = () => [[CY(0.048, 0.048, 0.05, 8, 0, 0, 0), [0.68, 0.69, 0.7]], [BX(0.05, 0.04, 0.06, 0, 0, 0.05), [0.62, 0.63, 0.64]]];
// cantilever gantry: pole at origin, twin-chord truss arm towards -x at y 6.0..6.6, board / sign hang under it on the +z face
function cantilever(armL) {
  const o = [[CY(0.16, 0.2, 7.0, 12, 0, 3.5, 0), GALV], [BX(0.62, 0.04, 0.62, 0, 0.02, 0), GALV], [CY(0.03, 0.03, 0.12, 6, 0.24, 0.07, 0.24), [0.4, 0.4, 0.4]], [CY(0.03, 0.03, 0.12, 6, -0.24, 0.07, 0.24), [0.4, 0.4, 0.4]],
    [CY(0.03, 0.03, 0.12, 6, 0.24, 0.07, -0.24), [0.4, 0.4, 0.4]], [CY(0.03, 0.03, 0.12, 6, -0.24, 0.07, -0.24), [0.4, 0.4, 0.4]], [CY(0.17, 0.16, 0.08, 12, 0, 7.04, 0), [0.5, 0.51, 0.5]],
    [BX(0.08, 0.3, 0.2, 0, 1.0, 0.18), [0.55, 0.56, 0.55]]]; // hand hole cover
  for (const y of [6.0, 6.62]) { o.push([CY(0.07, 0.07, armL, 8, -armL / 2, y, 0, 0, 0, Math.PI / 2), GALV], [BX(0.04, 0.42, 0.42, -0.16, y, 0), [0.5, 0.5, 0.5]]); }
  for (let x = -0.4; x > -armL + 0.3; x -= 0.75) o.push([beam(V3(x, 6.02, 0), V3(x - 0.375, 6.6, 0), 0.025, 0, 5), GALV], [beam(V3(x - 0.375, 6.6, 0), V3(x - 0.75, 6.02, 0), 0.025, 0, 5), GALV]);
  o.push([CY(0.075, 0.07, 0.04, 8, -armL, 6.0, 0, 0, 0, Math.PI / 2), [0.5, 0.5, 0.5]], [CY(0.075, 0.07, 0.04, 8, -armL, 6.62, 0, 0, 0, Math.PI / 2), [0.5, 0.5, 0.5]]);
  return o;
}
const cantFar = (armL) => [[CY(0.17, 0.2, 7.0, 6, 0, 3.5, 0), GALV], [BX(armL, 0.7, 0.12, -armL / 2, 6.3, 0), GALV]];
const unitQuad = () => merge([[new THREE.PlaneGeometry(1, 1), [1, 1, 1]]]);
const unitDisc = () => merge([[new THREE.CircleGeometry(0.5, 28), [1, 1, 1]]]);
const plateBack = () => merge([[BX(1, 1, 1, 0, 0, 0), [0.62, 0.63, 0.64]]]);
const discBack = () => merge([[CY(0.5, 0.5, 1, 24, 0, 0, 0, Math.PI / 2), [0.62, 0.63, 0.64]]]);

// ------------------------------------------------------------------------------------------------ build ----
export function buildSignage(scene, city) {
  const t0 = performance.now();
  const r = mulberry(8123); const col = city.col; const box = [];
  const occ = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
  const hit = (x0, z0, x1, z1) => col.query((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 1, box).some((b) => b.maxX > x0 && b.minX < x1 && b.maxZ > z0 && b.minZ < z1);
  const onWalk = (x, z) => { const h = city.groundH(x, z); return h > 0.1 && h < 0.3; };
  const kinds = new Map();
  const K = (name, near, far, rN, rF, opts = {}) => { kinds.set(name, { name, near: near.isBufferGeometry ? near : merge(near), far: far ? (far.isBufferGeometry ? far : merge(far)) : null, items: [], rN, rF: far ? rF : rN, cast: opts.cast !== false, mat: opts.mat || 'm' }); };
  K('shelter', shelterBody(), shelterFar(), 90, 230);
  K('glass', shelterGlass(), null, 120, 0, { mat: 'glass' });
  K('lbox', lightBox(), null, 90);
  K('lit', unitQuad(), null, 110, 0, { mat: 'lit', cast: false });
  K('post', post(3.2), null, 110);
  K('postS', post(2.6), null, 110);
  K('clamp', clampBand(), null, 45, 0, { cast: false });
  K('cant', cantilever(6.7), cantFar(6.7), 150, 320);
  K('face', unitQuad(), null, 170, 0, { mat: 'sign', cast: false });
  K('disc', unitDisc(), null, 170, 0, { mat: 'sign', cast: false });
  K('pback', plateBack(), null, 170);
  K('dback', discBack(), null, 170);
  K('txtS', unitQuad(), null, 38, 0, { mat: 'sign', cast: false });
  K('txtL', unitQuad(), null, 120, 0, { mat: 'sign', cast: false });
  K('gpaint', unitQuad(), null, 95, 0, { mat: 'paint', cast: false }); // XY quad; print() maps its +z normal to world up
  const push = (kind, x, z, m, c = [1, 1, 1]) => kinds.get(kind).items.push({ x, z, m, c });
  const stat = { stops: 0, bays: 0, stopPoles: 0, noPark: 0, slow: 0, nameposts: 0, gantries: 0, alleySigns: 0, legends: 0, rects: 0, gpaintRects: 0, parkingCleared: 0, zebras: 0, stopLines: 0 };
  const stops = [], gantries = [], nameposts = [];
  const glyphCache = new Map(); // worn road-glyph rasters, 4 wear variants per character

  // --- printing: lay a raster's rectangles out on a face. frame: origin o (centre of the face), u = legend "up", n = face normal
  // (right = u x n). wM / hM = metres of the whole raster. lift = offset along n. kind: 'txtS' | 'txtL' | 'gpaint'
  const _r = new THREE.Vector3(), _m = new THREE.Matrix4(), _p = new THREE.Vector3();
  const print = (ras, o, u, n, wM, hM, kind, lift = 0.006, tint = null, ax = o.x, az = o.z) => {
    _r.crossVectors(u, n).normalize(); const px = wM / ras.W, py = hM / ras.H;
    for (const [x, y, w, h, ci] of ras.rects) {
      const cx = (x + w / 2 - ras.W / 2) * px, cy = (ras.H / 2 - (y + h / 2)) * py;
      _p.copy(o).addScaledVector(_r, cx).addScaledVector(u, cy).addScaledVector(n, lift);
      const m = new THREE.Matrix4().makeBasis(_r.clone().multiplyScalar(w * px), u.clone().multiplyScalar(h * py), n.clone()); m.setPosition(_p);
      let c = ras.pal[ci]; if (tint) c = tint(c, x, y);
      push(kind, ax, az, m, c); stat.rects++; if (kind === 'gpaint') stat.gpaintRects++;
    }
    stat.legends++; void _m;
  };
  // flat sign plate (background face + grey back box) at centre o, normal n, up u, size w x h; shape 'rect' | 'disc'
  const plate = (o, u, n, w, h, bg, shape = 'rect', back = true, faceKind = null) => {
    const rr = new THREE.Vector3().crossVectors(u, n).normalize();
    const f = new THREE.Matrix4().makeBasis(rr.clone().multiplyScalar(w), u.clone().multiplyScalar(h), n.clone()); f.setPosition(o.clone().addScaledVector(n, 0.003));
    push(faceKind || (shape === 'disc' ? 'disc' : 'face'), o.x, o.z, f, bg);
    if (back) { const b = new THREE.Matrix4().makeBasis(rr.clone().multiplyScalar(w + 0.01), u.clone().multiplyScalar(h + 0.01), n.clone().multiplyScalar(0.012)); b.setPosition(o.clone().addScaledVector(n, -0.004)); push(shape === 'disc' ? 'dback' : 'pback', o.x, o.z, b); }
  };
  const PAL = (...h) => h; const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const UP = V3(0, 1, 0);
  // place a thing of world-aligned footprint [x0,x1]x[z0,z1]; returns true if free (sidewalk, no colliders, no palms / lamps / trees)
  const free = (x0, z0, x1, z1, pad = 0.4) => onWalk(x0 + 0.05, z0 + 0.05) && onWalk(x1 - 0.05, z1 - 0.05) && onWalk(x0 + 0.05, z1 - 0.05) && onWalk(x1 - 0.05, z0 + 0.05) && !occ((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + pad) && !hit(x0, z0, x1, z1);
  const isl = (z) => Math.abs(z) < 368;

  // ------------------------------------------------------------------ legends (rasterised once, reused) ----
  const BLUE = '#1b4f9e', RED = '#c8141e', WH = '#f4f4f0', BLK = '#121212';
  const rasNoPark = raster(48, 48, PAL(BLUE, RED), (g) => { g.fillStyle = RED; g.beginPath(); g.arc(24, 24, 23.5, 0, 7); g.fill(); g.fillStyle = BLUE; g.beginPath(); g.arc(24, 24, 18, 0, 7); g.fill(); g.strokeStyle = RED; g.lineWidth = 5; g.beginPath(); g.moveTo(11, 11); g.lineTo(37, 37); g.stroke(); });
  const rasNoEntry = raster(48, 48, PAL(WH, RED, BLK), (g) => { g.fillStyle = RED; g.beginPath(); g.arc(24, 24, 23.5, 0, 7); g.fill(); g.fillStyle = WH; g.beginPath(); g.arc(24, 24, 18.5, 0, 7); g.fill();
    g.fillStyle = BLK; g.beginPath(); g.roundRect(12, 18, 24, 10, 3); g.fill(); g.fillRect(16, 14, 14, 6); g.beginPath(); g.arc(17, 30, 3, 0, 7); g.arc(31, 30, 3, 0, 7); g.fill(); g.strokeStyle = RED; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 10); g.lineTo(38, 38); g.stroke(); });
  const rasLimit = (v) => raster(56, 56, PAL(WH, RED, BLK), (g) => { g.fillStyle = RED; g.beginPath(); g.arc(28, 28, 27.5, 0, 7); g.fill(); g.fillStyle = WH; g.beginPath(); g.arc(28, 28, 21.5, 0, 7); g.fill(); g.fillStyle = BLK; g.font = 'bold 26px Anton, Impact, "DejaVu Sans Condensed", sans-serif'; g.fillText(String(v), 28, 30); });
  const lim40 = rasLimit(40), lim30 = rasLimit(30);
  const rasNoParkSub = raster(80, 32, PAL(WH, BLK, RED), (g) => { T(g, '公交车站', 40, 10, 13, BLK); T(g, '前后 30 米', 40, 24, 11, RED); });
  const rasAlleySub = raster(72, 22, PAL(WH, BLK), (g) => T(g, '步行街', 36, 12, 14, BLK));
  const routeRas = new Map(); const rasRoute = (c) => { if (!routeRas.has(c)) { const R = ROUTE[c]; routeRas.set(c, raster(60, 32, PAL(WH, R.col, BLK), (g) => { T(g, R.no, 21, 17, 24, R.col, '900', 'Anton, Impact, sans-serif'); T(g, '路', 44, 17, 17, BLK); })); } return routeRas.get(c); };
  const nameRas = new Map(); const rasName = (cn, py) => { const k = cn; if (!nameRas.has(k)) nameRas.set(k, raster(120, 34, PAL(BLUE, WH), (g) => { g.strokeStyle = WH; g.lineWidth = 1.5; g.strokeRect(2.5, 2.5, 115, 29); fitT(g, cn, 60, 14, 17, WH, 104); fitT(g, py, 60, 27, 8, WH, 100, 'bold'); })); return nameRas.get(k); };

  // ------------------------------------------------------------------ bus stops ----
  // targets: inner avenues both sides, 海潮大道 west (hotel) side; ~300 m apart per side, staggered between the two sides
  const SIDES = [[50, 1, [-225, 75]], [50, -1, [-75, 225]], [170, 1, [-225, 75]], [170, -1, [-75, 225]], [290, -1, [-75, 225]]];
  const OFF = 8.55; // shelter centre offset from the road axis (footprint 7.63 .. 9.35, through-zone 9.95 .. 12.0 stays clear)
  for (const [c, sd, zs] of SIDES) for (const z0 of zs) {
    const ry = sd > 0 ? -Math.PI / 2 : Math.PI / 2; // local +z -> towards the road axis; local +x -> along the street
    const lx = V3(Math.cos(ry), 0, -Math.sin(ry)), lz = V3(Math.sin(ry), 0, Math.cos(ry)); // local +x, +z in world (+x = upstream: traffic on side sd runs along z = -sd)
    const fz = -sd; // traffic on this side travels along z = -sd (vehicles.js lanePoint)
    let done = null;
    for (let t = 0; t < 26 && !done; t++) { const z = z0 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 2;
      const x = c + sd * OFF; const zA = z - 2.4, zB = z + 2.4; const xa = c + sd * 7.6, xb = c + sd * 9.4;
      if (!free(Math.min(xa, xb), zA, Math.max(xa, xb), zB, 1.2)) continue; // pad keeps tree canopies off the roof
      // stop pole (flag sign) 3.4 m downstream of the shelter at the kerb, no-parking post at the bay's upstream end
      const zp = z + fz * 3.4, zn = z - fz * 15.5, xk = c + sd * 7.42;
      if (!free(xk - 0.12, zp - 0.12, xk + 0.12, zp + 0.12, 0.3) || !free(xk - 0.12, zn - 0.12, xk + 0.12, zn + 0.12, 0.3)) continue;
      done = { x, z, zp, zn, xk };
    }
    if (!done) continue;
    const { x, z, zp, zn, xk } = done; const gh = city.groundH(x, z);
    const M = MX(x, gh, z, 0, ry);
    push('shelter', x, z, M); push('glass', x, z, M); push('lbox', x, z, M);
    col.add(Math.min(c + sd * 7.66, c + sd * 9.36), z - 2.38, Math.max(c + sd * 7.66, c + sd * 9.36), z + 2.38, 2.6, 'busstop');
    const bi = blockIdx(z); const name = STOP_NAMES[c][bi] + '站'; const R = ROUTE[c];
    // fascia: station name, white on navy, both on the road face (+z local)
    const lxv = lx;
    const fasO = V3(x, gh + 2.62, z).addScaledVector(lz, 0.99);
    const rasF = raster(220, 12, PAL('#0e1f33', WH, R.col), (g) => { g.fillStyle = R.col; g.fillRect(0, 0, 14, 12); g.fillRect(206, 0, 14, 12); fitT(g, name + '  ' + R.no + '路', 110, 6.5, 10, WH, 180); });
    print(rasF, fasO, UP, lz.clone(), 4.38, 0.24, 'txtL', 0.004);
    // light box faces: inner (downstream-facing) = route map; outer = poster
    const lbC = V3(x, gh + 1.08, z).addScaledVector(lxv, 2.25).addScaledVector(lz, -0.1);
    const names = STOP_NAMES[c].map((s) => s + '站'); const order = fz > 0 ? names : [...names].reverse(); const cur = order.indexOf(name);
    const rasMap = raster(96, 136, PAL(WH, R.col, BLK, '#d0202a', '#9aa0a6'), (g) => {
      g.fillStyle = R.col; g.fillRect(0, 0, 96, 30); T(g, R.no, 18, 16, 22, WH, '900', 'Anton, Impact, sans-serif'); fitT(g, '路 ' + (c === 290 ? '海潮环线' : NS_NAME[c] + '线'), 60, 16, 11, WH, 66);
      fitT(g, name, 48, 40, 12, BLK, 90); T(g, '开往 ' + order[order.length - 1], 48, 53, 9, '#9aa0a6');
      g.fillStyle = R.col; g.fillRect(18, 62, 4, 66);
      order.forEach((s, i) => { const y = 64 + i * 11.4; g.fillStyle = i === cur ? '#d0202a' : (i < cur ? '#9aa0a6' : R.col); g.beginPath(); g.arc(20, y, i === cur ? 4.2 : 3.2, 0, 7); g.fill(); g.textAlign = 'left'; T(g, s, 30, y + 0.5, 9, i === cur ? '#d0202a' : (i < cur ? '#9aa0a6' : BLK)); g.textAlign = 'center'; });
      T(g, '首班 6:00  末班 22:30', 48, 131, 7, BLK, 'normal');
    });
    const adI = Math.floor(r() * 4); const ADS = [['海风防晒', '#ffb347', '#1b3d6d'], ['冰椰汁', '#ff4f86', '#fff3f8'], ['冲浪节 · 七月', '#1fb5a7', '#fff6d0'], ['岛屿银行', '#0d4c6b', '#ffffff']];
    const [adT, adBg, adFg] = ADS[adI];
    const rasAd = raster(64, 92, PAL(adBg, adFg, '#ffffff'), (g) => { g.fillStyle = adFg; g.globalAlpha = 1; g.beginPath(); g.arc(44, 26, 18, 0, 7); g.fill(); g.fillStyle = adBg; g.beginPath(); g.arc(44, 26, 12, 0, 7); g.fill(); fitT(g, adT, 32, 62, 13, adFg, 58); T(g, '索拉纳港', 32, 80, 8, adFg, 'normal'); });
    for (const s of [-1, 1]) { const n = lxv.clone().multiplyScalar(s); const o = lbC.clone().addScaledVector(n, 0.082); // s=-1 faces downstream (into the shelter): route map; s=+1 faces upstream: poster
      plate(o, UP, n, 1.12, 1.7, s < 0 ? [1, 1, 1] : lin(adBg), 'rect', false, 'lit'); print(s < 0 ? rasMap : rasAd, o, UP, n, 1.12, 1.7, 'txtS', 0.006); }
    // stop pole + flag (double-sided, faces up/downstream), route plate below
    { const gp = city.groundH(xk, zp); push('post', xk, zp, MX(xk, gp, zp)); col.add(xk - 0.07, zp - 0.07, xk + 0.07, zp + 0.07, 3.2, 'busstop');
      const rasFlag = raster(56, 86, PAL(BLUE, WH, R.col), (g) => { busGlyph(g, 28, 22, 26, WH); T(g, '公交车站', 28, 48, 11, WH); fitT(g, name, 28, 64, 11, WH, 52); g.fillStyle = WH; g.fillRect(4, 74, 48, 9); T(g, R.no + '路', 28, 79, 8, R.col); });
      const rasRt = rasRoute(c);
      for (const s of [1, -1]) { const n = V3(0, 0, s); const side = V3(sd, 0, 0); // flag sticks out over the kerb side (towards the road)
        const o = V3(xk, gp + 2.75, zp).addScaledVector(side, -0.31); plate(o, UP, n, 0.56, 0.86, lin(BLUE), 'rect', s > 0); print(rasFlag, o, UP, n, 0.56, 0.86, 'txtL', 0.006);
        const o2 = V3(xk, gp + 2.08, zp).addScaledVector(side, -0.27); plate(o2, UP, n, 0.48, 0.26, [0.92, 0.92, 0.9], 'rect', s > 0); print(rasRt, o2, UP, n, 0.48, 0.26, 'txtS', 0.006); }
      for (const y of [2.5, 3.0, 2.08]) push('clamp', xk, zp, MX(xk, gp + y, zp, 0, sd > 0 ? Math.PI / 2 : -Math.PI / 2));
      stat.stopPoles++; }
    // no-parking post at the upstream end of the bay, disc faces oncoming traffic
    { const gp = city.groundH(xk, zn); push('postS', xk, zn, MX(xk, gp, zn)); col.add(xk - 0.07, zn - 0.07, xk + 0.07, zn + 0.07, 2.6, 'busstop');
      const n = V3(0, 0, -fz); const o = V3(xk, gp + 2.3, zn).addScaledVector(n, 0.05); plate(o, UP, n, 0.6, 0.6, lin(BLUE), 'disc'); print(rasNoPark, o, UP, n, 0.6, 0.6, 'txtL', 0.006);
      const o2 = V3(xk, gp + 1.82, zn).addScaledVector(n, 0.05); plate(o2, UP, n, 0.5, 0.2, lin(WH)); print(rasNoParkSub, o2, UP, n, 0.5, 0.2, 'txtS', 0.006);
      for (const y of [2.3, 1.82]) push('clamp', xk, zn, MX(xk, gp + y, zn, 0, fz > 0 ? Math.PI : 0));
      stat.noPark++; }
    stops.push({ c, sd, x, z, name, route: R.no, pole: [xk, zp], noPark: [xk, zn] }); stat.stops++;
    bay(c, sd, z, fz);
  }
  // bus bays for the existing promenade shelters on 海潮大道's east side (street.js: x = 299.2, z = -302 + 150 k + 31)
  for (let z = -372 + 70; z <= 372 - 40; z += 150) bay(290, 1, z + 31, -1);

  // painted bus bay in the kerb lane (offset 3.6 .. 6.9): yellow dashed outline, "公交车站" lettering read near -> far
  function bay(c, sd, zc, fz) {
    const YEL = [0.86, 0.66, 0.16]; const L0 = zc - fz * 17, L1 = zc + fz * 7; // 24 m: the bus body sits upstream of the shelter
    const zlo = Math.min(L0, L1), zhi = Math.max(L0, L1);
    const line = (x0, z0, x1, z1) => { const m = new THREE.Matrix4().makeBasis(V3(x1 - x0, 0, 0), V3(0, 0, -(z1 - z0)), UP); m.setPosition((x0 + x1) / 2, 0.022, (z0 + z1) / 2);
      const w = 0.82 + r() * 0.18; push('gpaint', (x0 + x1) / 2, (z0 + z1) / 2, m, [YEL[0] * w, YEL[1] * w, YEL[2] * w]); stat.gpaintRects++; };
    const xa = c + sd * 3.6, xb = c + sd * 6.9; const W2 = 0.1;
    for (const xo of [xa, xb]) for (let zz = zlo; zz < zhi - 0.2; zz += 2.0) { const z1 = Math.min(zz + 1.0, zhi); if (r() < 0.08) continue; // dashes, a few worn away
      line(xo - W2, zz, xo + W2, z1); }
    for (const zo of [zlo, zhi]) line(Math.min(xa, xb), zo - W2, Math.max(xa, xb), zo + W2);
    // diagonal hatch at both ends (entry / exit tapers)
    for (const [zo, s] of [[zlo, 1], [zhi, -1]]) for (let k = 0; k < 3; k++) { const zz = zo + s * (0.9 + k * 0.9); const xm = (xa + xb) / 2; const m = new THREE.Matrix4().makeBasis(V3(Math.abs(xb - xa) * 0.92, 0, 0.55 * s * sd), V3(0, 0, -0.16), UP); m.setPosition(xm, 0.022, zz); push('gpaint', xm, zz, m, YEL); stat.gpaintRects++; }
    const f = V3(0, 0, fz); const chars = ['公', '交', '车', '站']; const zs = zc - fz * 5; // lettering centred in the bay
    chars.forEach((ch, i) => { const zz = zs + fz * ((i - 1.5) * 4.1); // first character nearest the approaching driver
      const o = V3((xa + xb) / 2, 0.024, zz); print(glyph(ch, YEL), o, f, UP, 2.0, 3.4, 'gpaint', 0, null, o.x, o.z); });
    stat.bays++;
  }
  // road glyph: 32x32 raster with worn pixels (wheel-path dropouts + speckle); tint jitter per rectangle
  function glyph(ch, colr) {
    const key = ch + (Math.floor(r() * 4)); const hitG = glyphCache.get(key); if (hitG) return { ...hitG, pal: [colr, colr] };
    const seed = glyphCache.size * 17.3 + 3.1;
    const h = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return s - Math.floor(s); };
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; const a = h(xi, yi), b = h(xi + 1, yi), c2 = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * fx + (c2 - a) * fy + (a - b - c2 + d) * fx * fy; };
    const ras = raster(32, 32, PAL('#000000', '#ffffff'), (g) => T(g, ch, 16, 17, 30, '#ffffff', '900'), { drop: (x, y) => { const wheel = Math.abs(Math.abs(x - 16) - 9) < 3 ? 0.22 : 0.0; return vn(x / 5, y / 5) < 0.18 + wheel || h(x, y) < 0.05; } });
    const gl = { W: ras.W, H: ras.H, rects: ras.rects }; glyphCache.set(key, gl); return { ...gl, pal: [colr, colr] };
  }

  // ------------------------------------------------------------------ "慢" lane text on every approach (e = 17.5 m before the stop line zone)
  for (const s of city.segs) {
    if (s.bridge || s.a1 - s.a0 < 40) continue; const mid = (s.a0 + s.a1) / 2;
    if (s.axis === 'z' ? !(isl(mid) && [50, 170, 290].includes(s.c)) : !(s.c >= -300 && s.c <= 300 && mid > -30 && mid < 300)) continue;
    for (const end of [0, 1]) { // approach towards a1 (end 1, travel +axis) or a0 (end 0, travel -axis)
      const ea = end ? s.a1 : s.a0; const nearInter = city.inters.some((it) => (s.axis === 'z' ? Math.abs(it.x - s.c) < 0.5 && Math.abs(it.z - (ea + (end ? RH : -RH))) < 0.6 : Math.abs(it.z - s.c) < 0.5 && Math.abs(it.x - (ea + (end ? RH : -RH))) < 0.6));
      if (!nearInter) continue; const d = end ? 1 : -1; const a = ea - d * 17.5;
      // lane side for travel d: z-axis road -> x = c - d * off ; x-axis road -> z = c + d * off  (vehicles.js lanePoint)
      const bike = !(s.axis === 'z' && s.c === 290);
      for (const lane of [0, 1]) { if (s.axis === 'z' && s.c === 290 && d > 0 && lane === 1) continue; // Tideline west kerb lane = parking
        const off = lane ? (bike ? 4.55 : 5.25) : 1.75; const wd = lane && bike ? 1.55 : 1.8;
        const x = s.axis === 'z' ? s.c - d * off : a, z = s.axis === 'z' ? a : s.c + d * off;
        const f = s.axis === 'z' ? V3(0, 0, d) : V3(d, 0, 0); print(glyph('慢', [0.86, 0.86, 0.82]), V3(x, 0.022, z), f, UP, wd, 4.2, 'gpaint', 0, jit, x, z); stat.slow++; }
    }
  }
  function jit(c) { const w = 0.8 + r() * 0.2; return [c[0] * w, c[1] * w, c[2] * w]; }
  // zebra / stop-line count (the road program paints them at both ends of every grid segment, wear added in mats.js)
  for (const s of city.segs) { if (s.bridge || s.a1 - s.a0 < 10) continue; stat.zebras += 2; stat.stopLines += 2; }

  // ------------------------------------------------------------------ corner street-name posts (one per intersection)
  for (const it of city.inters) {
    if (!isl(it.z) || it.x < -30 || it.x > 300) continue;
    let ok = null;
    for (const [sx, sz] of [[1, -1], [-1, 1], [-1, -1], [1, 1]]) for (const [dx, dz] of [[0.75, 3.6], [3.6, 0.75], [0.75, 5.0], [5.0, 0.75]]) {
      if (ok) break; const x = it.x + sx * (RH + dx), z = it.z + sz * (RH + dz);
      if (free(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.5)) ok = { x, z, sx, sz };
    }
    if (!ok) continue; const { x, z } = ok; const gh = city.groundH(x, z);
    push('postS', x, z, MX(x, gh, z)); col.add(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 3.2, 'namepost');
    const nsN = NS_NAME[it.x], ewN = EW_NAME[it.z]; if (!nsN || !ewN) continue;
    // NS-street plate runs along z (normal +-x), EW-street plate along x (normal +-z); upper / lower, both double-sided
    for (const [nm, py, y, nrm] of [[nsN, NS_PY[it.x], 3.01, V3(1, 0, 0)], [ewN, EW_PY[it.z], 2.74, V3(0, 0, 1)]]) {
      const ras = rasName(nm, py); const along = V3(nrm.z, 0, nrm.x); const o = V3(x, gh + y, z).addScaledVector(along, 0.0);
      for (const s of [1, -1]) { const n = nrm.clone().multiplyScalar(s); const oo = o.clone().addScaledVector(nrm, s * 0.006); plate(oo, UP, n, 0.96, 0.27, lin(BLUE), 'rect', s > 0); print(ras, oo, UP, n, 0.96, 0.27, 'txtS', 0.006); }
    }
    push('clamp', x, z, MX(x, gh + 2.6, z));
    nameposts.push([+x.toFixed(2), +z.toFixed(2), it.x, it.z, nsN, ewN]); stat.nameposts++;
  }

  // ------------------------------------------------------------------ guide-sign gantries (路口预告) on the approaches
  // one per segment, alternating direction; pole at the kerb (offset 7.62) 48 m before the stop line, arm over the two lanes
  let alt = 0;
  for (const s of city.segs) {
    if (s.bridge || s.a1 - s.a0 < 90) continue; const mid = (s.a0 + s.a1) / 2;
    if (s.axis === 'z' ? !isl(mid) : !(mid > 0 && mid < 300)) continue;
    const d = (alt++ % 2) ? 1 : -1; const ea = d > 0 ? s.a1 : s.a0; const it = s.axis === 'z' ? { x: s.c, z: ea + d * RH } : { x: ea + d * RH, z: s.c };
    // the kerb on the travel's right: z-road -> x = c - d * 7.62 ; x-road -> z = c + d * 7.62
    let pos = null;
    for (let t = 0; t < 14 && !pos; t++) { const a = ea - d * (48 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 2.5);
      const x = s.axis === 'z' ? s.c - d * 7.62 : a, z = s.axis === 'z' ? a : s.c + d * 7.62;
      if (free(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 0.8)) pos = { x, z, a }; }
    if (!pos) continue;
    const f = s.axis === 'z' ? V3(0, 0, d) : V3(d, 0, 0); const n = f.clone().negate(); // board faces oncoming traffic
    // cantilever geometry: arm towards local -x, face local +z. local +z -> n ; rotation about y with (sin ry, cos ry) = (n.x, n.z)
    const ry = Math.atan2(n.x, n.z); const gh = city.groundH(pos.x, pos.z);
    push('cant', pos.x, pos.z, MX(pos.x, gh, pos.z, 0, ry)); col.add(pos.x - 0.24, pos.z - 0.24, pos.x + 0.24, pos.z + 0.24, 7, 'gantry');
    const armDir = V3(-Math.cos(ry), 0, Math.sin(ry)); // world direction of local -x
    // board 3.9 x 1.75 centred 4.1 m out along the arm (over offsets ~1.6 .. 5.5), bottom at 5.1 m
    const bO = V3(pos.x, gh + 5.98, pos.z).addScaledVector(armDir, 4.15).addScaledVector(n, 0.12);
    // branches at the next intersection: straight (same street continues?), left / right (cross street extends that way?)
    const right = new THREE.Vector3().crossVectors(f, UP); const left = right.clone().negate();
    const hasRoad = (px, pz) => city.segs.some((q) => !q.bridge && (q.axis === 'z' ? Math.abs(px - q.c) < 1 && pz > q.a0 - 1 && pz < q.a1 + 1 : Math.abs(pz - q.c) < 1 && px > q.a0 - 1 && px < q.a1 + 1));
    const probe = (v) => hasRoad(it.x + v.x * (RH + 6), it.z + v.z * (RH + 6));
    const crossN = s.axis === 'z' ? EW_NAME[it.z] : NS_NAME[it.x]; const thisN = s.axis === 'z' ? NS_NAME[s.c] : EW_NAME[s.c];
    const dest = (v) => (Math.abs(v.x) > 0.5 ? (v.x > 0 ? '海滩' : '游艇港') : (v.z > 0 ? '北滩' : '南滩'));
    const st = probe(f), lf = probe(left), rt = probe(right);
    const rasB = raster(234, 105, PAL(BLUE, WH), (g) => {
      g.strokeStyle = WH; g.lineWidth = 2; g.strokeRect(3, 3, 228, 99);
      // arrow diagram: stem from the bottom centre, branches
      g.fillStyle = WH; g.fillRect(112, 58, 10, 40); const head = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -12); g.lineTo(11, 3); g.lineTo(-11, 3); g.closePath(); g.fill(); g.restore(); };
      if (st) { g.fillRect(112, 22, 10, 40); head(117, 18, 0); }
      if (lf) { g.fillRect(70, 53, 47, 10); head(64, 58, -Math.PI / 2); }
      if (rt) { g.fillRect(117, 53, 47, 10); head(170, 58, Math.PI / 2); }
      if (st) { fitT(g, thisN, 60, 14, 13, WH, 88); T(g, dest(f), 172, 14, 10, WH); }
      if (lf) { fitT(g, crossN, 36, 40, 15, WH, 54); T(g, dest(left), 36, 80, 10, WH); }
      if (rt) { fitT(g, crossN, 198, 40, 15, WH, 54); T(g, dest(right), 198, 80, 10, WH); }
      if (!st && !lf && !rt) fitT(g, thisN, 117, 40, 16, WH, 200);
    });
    plate(bO, UP, n, 3.9, 1.75, lin(BLUE)); print(rasB, bO, UP, n, 3.9, 1.75, 'txtL', 0.006);
    for (const k of [-1.2, 1.2]) { const hO = bO.clone().addScaledVector(new THREE.Vector3().crossVectors(UP, n), k); push('clamp', hO.x, hO.z, MX(hO.x, gh + 6.02, hO.z, 0, ry)); push('clamp', hO.x, hO.z, MX(hO.x, gh + 6.62, hO.z, 0, ry)); }
    // round speed-limit sign hung near the pole (30 on 海潮大道 / beach zone, 40 elsewhere)
    const lO = V3(pos.x, gh + 6.0, pos.z).addScaledVector(armDir, 1.35).addScaledVector(n, 0.12);
    const lim = (s.axis === 'z' && s.c === 290) ? lim30 : lim40; plate(lO, UP, n, 0.8, 0.8, lin(WH), 'disc'); print(lim, lO, UP, n, 0.8, 0.8, 'txtL', 0.006);
    gantries.push([+pos.x.toFixed(1), +pos.z.toFixed(1), s.axis === 'z' ? 'ns' + s.c : 'ew' + s.c, d, it.x, it.z, st ? thisN : null, lf || rt ? crossN : null, !st && !lf && !rt ? thisN : null]); stat.gantries++;
  }

  // ------------------------------------------------------------------ 禁止机动车驶入 + 步行街 plates at the pedestrian alley mouths
  for (const A of city.alleys || []) {
    if (!isl(A.z) || A.x0 < -30 || A.x1 > 300) continue;
    for (const [xm, s] of [[A.x0, -1], [A.x1, 1]]) { // s = outward normal of the mouth (towards the street)
      const zW = A.z + A.w / 2 + 0.45; // on the building corner beside the alley, 2.5 m up (no post on the sidewalk)
      const bb = col.query(xm - s * 1.0, zW + 0.5, 2.5, box).find((b) => b.tag !== 'busstop' && b.minX <= xm - s * 0.6 && b.maxX >= xm - s * 0.6 && b.minZ <= zW + 0.2 && b.maxZ >= zW && b.h > 3);
      if (!bb) continue; const wx = s < 0 ? bb.minX - 0.01 : bb.maxX + 0.01; if (Math.abs(wx - xm) > 1.2) continue;
      const n = V3(s, 0, 0); const o = V3(wx, city.groundH(wx + s * 0.5, zW) + 2.6, zW + 0.1);
      plate(o, UP, n, 0.5, 0.5, lin(WH), 'disc'); print(rasNoEntry, o, UP, n, 0.5, 0.5, 'txtL', 0.006);
      const o2 = o.clone().add(V3(0, -0.4, 0)); plate(o2, UP, n, 0.48, 0.16, lin(WH)); print(rasAlleySub, o2, UP, n, 0.48, 0.16, 'txtS', 0.006);
      stat.alleySigns++; }
  }

  // parked cars must not sit in a bus bay (Tideline west kerb lane, city.parking from props.js)
  for (const p of city.parking || []) for (const st of stops) if (st.c === 290 && Math.abs(p.x - (290 - 5.25)) < 1.5 && p.z > st.z - 18 && p.z < st.z + 18) { if (p.fill) stat.parkingCleared++; p.fill = false; }

  // ------------------------------------------------------------------ a_streetnames: signal-pole dressing ----
  // Found through the 'pole' colliders props.js (a_props) registers: mast arms at (it.x + sx 8.2, it.z + sz 8.2) for
  // (sx, sz) = (1, 1) / (-1, -1) (h 6) and pedestrian poles at (it.x + sx 8.0, it.z + sz 8.0) for (1, -1) / (-1, 1) (h 3.4).
  // Each assembly is built in the (sx = 1) local frame and turned by pi for the mirrored corner (same as signalMastA).
  // Adds: lit pedestrian pictograms (raised hand / walking figure, driven by the traffic phase), dark glyph backs,
  // "按键过街" legend plates on the push buttons + an accessible speaker / LED module above each button, an amber
  // middle lens and rear backplate straps on every vehicle head, a video-detection camera under every mast arm, a PTZ
  // dome camera + "电子监控" plate on every other mast, and stickers / rust streaks / tape on all signal poles.
  {
    const pedRas = (walk) => raster(24, 26, PAL('#000000', walk ? '#ffffff' : '#ff8a1a'), (g) => {
      g.fillStyle = walk ? '#ffffff' : '#ff8a1a';
      if (walk) { // walking figure, side view, original drawing
        g.beginPath(); g.arc(13, 3.6, 2.8, 0, 7); g.fill(); g.lineCap = 'round'; g.strokeStyle = '#ffffff';
        g.lineWidth = 3.4; g.beginPath(); g.moveTo(12.5, 8); g.lineTo(11, 15.5); g.stroke();
        g.lineWidth = 2.4; g.beginPath(); g.moveTo(12.4, 9); g.lineTo(16.5, 13.5); g.moveTo(12.0, 9.5); g.lineTo(8, 13); g.stroke();
        g.lineWidth = 2.8; g.beginPath(); g.moveTo(11, 15.5); g.lineTo(15.5, 20); g.lineTo(17, 24.5); g.moveTo(11, 15.5); g.lineTo(8.5, 20.5); g.lineTo(5.5, 23.5); g.stroke();
      } else { // raised open hand
        g.beginPath(); g.roundRect(6.5, 11, 11.5, 12, 3); g.fill();
        for (const [x, y0] of [[7, 5], [10, 3], [13, 3.5], [16, 6]]) { g.beginPath(); g.roundRect(x, y0, 2.6, 12 - y0 + 3, 1.3); g.fill(); }
        g.beginPath(); g.moveTo(18, 15); g.lineTo(21.5, 10.5); g.lineTo(22.5, 12); g.lineTo(19, 19); g.closePath(); g.fill();
      }
    });
    const rasWalk = pedRas(true), rasHand = pedRas(false);
    const rasBtn = raster(32, 48, PAL(WH, BLK), (g) => { T(g, '按键', 16, 8, 10, BLK); T(g, '过街', 16, 20, 10, BLK);
      g.fillStyle = BLK; g.fillRect(5, 33, 16, 4); g.beginPath(); g.moveTo(20, 28); g.lineTo(28, 35); g.lineTo(20, 42); g.closePath(); g.fill(); });
    const rasCam = raster(64, 44, PAL(WH, BLUE, BLK), (g) => { g.fillStyle = BLUE; g.fillRect(0, 0, 64, 44);
      g.fillStyle = WH; g.fillRect(8, 6, 22, 13); g.beginPath(); g.moveTo(30, 10); g.lineTo(38, 6); g.lineTo(38, 19); g.lineTo(30, 15); g.closePath(); g.fill(); g.fillRect(16, 19, 4, 5); g.fillRect(12, 23, 12, 2);
      T(g, '电子', 51, 9, 10, WH); T(g, '监控', 51, 20, 10, WH); T(g, '路口违法抓拍', 32, 36, 9, WH); });
    // part geometries (local frame: +z = face / outward normal, +y up)
    const apsMod = () => { const o = [[BX(0.11, 0.15, 0.05, 0, 0, 0.025), [0.82, 0.64, 0.1]], [BX(0.09, 0.012, 0.03, 0, 0.082, 0.03), [0.7, 0.54, 0.08]]];
      for (let k = 0; k < 5; k++) o.push([BX(0.07, 0.006, 0.004, 0, -0.045 + k * 0.014, 0.0515), [0.05, 0.05, 0.05]]); // speaker grille
      o.push([CY(0.009, 0.009, 0.006, 8, 0, 0.045, 0.052, Math.PI / 2), [0.7, 0.05, 0.03]]); // "request registered" LED
      return o; };
    const vcam = () => { const o = [[CY(0.018, 0.018, 0.2, 6, 0, -0.1, 0), [0.5, 0.5, 0.49]], [BX(0.07, 0.04, 0.09, 0, -0.2, 0), [0.45, 0.45, 0.44]]]; // hanger + swivel
      const tilt = MX(0, -0.29, 0.02, 0.26); const add = (g, c) => { g.applyMatrix4(tilt); o.push([g, c]); };
      add(BX(0.11, 0.1, 0.3, 0, 0, 0), [0.86, 0.86, 0.84]); add(BX(0.15, 0.012, 0.38, 0, 0.062, 0.03), [0.9, 0.9, 0.88]); // body + sun shield
      add(CY(0.04, 0.04, 0.02, 10, 0, 0, 0.16, Math.PI / 2), [0.03, 0.03, 0.035]); add(CY(0.03, 0.03, 0.004, 10, 0, 0, 0.172, Math.PI / 2), [0.1, 0.12, 0.16]); // lens bezel + glass
      add(CY(0.012, 0.012, 0.06, 5, 0, -0.03, -0.17, Math.PI / 2), [0.05, 0.05, 0.05]); // cable gland
      return o; };
    const dome = () => { const o = [[BX(0.1, 0.18, 0.03, 0, 0, 0.015), [0.8, 0.8, 0.79]], [CY(0.028, 0.028, 0.52, 8, 0, 0, 0.28, Math.PI / 2), [0.82, 0.82, 0.8]], // wall clamp + arm
        [CY(0.035, 0.035, 0.08, 8, 0, -0.04, 0.52), [0.82, 0.82, 0.8]], [CY(0.105, 0.11, 0.1, 14, 0, -0.12, 0.52), [0.9, 0.9, 0.89]], [CY(0.112, 0.112, 0.012, 14, 0, -0.17, 0.52), [0.6, 0.6, 0.6]]]; // pendant + housing + trim ring
      o.push([P(new THREE.SphereGeometry(0.098, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), MX(0, -0.172, 0.52)), [0.05, 0.055, 0.06]]); // smoked bubble
      return o; };
    const strap = () => [[BX(0.05, 1.2, 0.02, -0.18, 0, 0), [0.1, 0.1, 0.1]], [BX(0.05, 1.2, 0.02, 0.18, 0, 0), [0.1, 0.1, 0.1]], [BX(0.5, 0.05, 0.02, 0, 0.42, -0.005), [0.1, 0.1, 0.1]], [BX(0.5, 0.05, 0.02, 0, -0.42, -0.005), [0.1, 0.1, 0.1]],
      ...[[-0.18, 0.42], [0.18, 0.42], [-0.18, -0.42], [0.18, -0.42]].map(([x, y]) => [CY(0.012, 0.012, 0.03, 6, x, y, -0.02, Math.PI / 2), [0.55, 0.55, 0.53]])]; // channel straps + bolts (behind the backplate)
    K('aps', apsMod(), null, 45);
    K('vcam', vcam(), null, 140);
    K('dome', dome(), null, 140);
    K('hstrap', strap(), null, 80, 0, { cast: false });
    K('lens', unitDisc(), null, 150, 0, { mat: 'glass', cast: false });
    K('pbk', unitQuad(), null, 120, 0, { mat: 'sign', cast: false });
    K('pdec', unitQuad(), null, 45, 0, { mat: 'paint', cast: false });
    for (const g of ['pwX', 'phX', 'pwZ', 'phZ']) K(g, unitQuad(), null, 130, 0, { mat: g, cast: false });
    stat.sigMasts = 0; stat.sigPedPoles = 0; stat.pedHeads = 0; stat.vcams = 0; stat.domes = 0; stat.buttons = 0; stat.vehHeads = 0; stat.decals = 0;
    const sr = mulberry(4417);
    const RY = (ry, v) => V3(v.x * Math.cos(ry) + v.z * Math.sin(ry), v.y, -v.x * Math.sin(ry) + v.z * Math.cos(ry));
    const basisAt = (o, right, up, n, w, h, d = 1) => { const m = new THREE.Matrix4().makeBasis(right.clone().multiplyScalar(w), up.clone().multiplyScalar(h), n.clone().multiplyScalar(d)); m.setPosition(o); return m; };
    const DIM_W = [0.32, 0.33, 0.34], DIM_H = [0.42, 0.2, 0.06]; // unlit LED pixel tints (diffuse); the lit state is the material's emissive
    const pedHead = (base, ry, lp, ln) => { // lp: head centre (local), ln: face normal (local)
      const c = base.clone().add(RY(ry, lp)), n = RY(ry, ln), right = new THREE.Vector3().crossVectors(UP, n).normalize();
      const ax = Math.abs(n.x) > 0.5 ? 'X' : 'Z';
      for (const [dx, ras, kind, dim] of [[-0.08, rasHand, 'ph' + ax, DIM_H], [0.085, rasWalk, 'pw' + ax, DIM_W]]) {
        const o = c.clone().addScaledVector(right, dx).addScaledVector(UP, 0.03).addScaledVector(n, 0.1215);
        push('pbk', o.x, o.z, basisAt(o, right, UP, n, 0.16, 0.18), [0.018, 0.018, 0.02]);
        print(ras, o, UP, n, 0.15, 0.1625, kind, 0.002, () => dim);
      }
      stat.pedHeads++;
    };
    const button = (base, ry, ln, pr) => { // legend on the instruction plate + speaker / LED module above it
      const n = RY(ry, ln), right = new THREE.Vector3().crossVectors(UP, n).normalize();
      const o = base.clone().add(V3(0, 1.08 + 0.25, 0)).addScaledVector(n, pr + 0.0125);
      plate(o, UP, n, 0.16, 0.24, [0.92, 0.92, 0.9], 'rect', false); print(rasBtn, o, UP, n, 0.16, 0.24, 'txtS', 0.004);
      const om = base.clone().add(V3(0, 1.08 + 0.48, 0)).addScaledVector(n, pr - 0.004);
      push('aps', om.x, om.z, basisAt(om, right, UP, n, 1, 1)); stat.buttons++;
    };
    const decals = (base, rOf, y0, y1, nSt, rusty) => { // stickers / rust / tape on a round pole; rOf(y) = pole radius at height y (local)
      const add = (a, y, w, h, c) => { const r0 = rOf(y); const n = V3(Math.sin(a), 0, Math.cos(a)); const right = new THREE.Vector3().crossVectors(UP, n);
        const o = base.clone().add(V3(0, y, 0)).addScaledVector(n, r0 + w * w / (8 * r0) + 0.0025); push('pdec', o.x, o.z, basisAt(o, right, UP, n, w, h), c); stat.decals++; };
      const STK = [[0.92, 0.92, 0.9], [0.95, 0.8, 0.12], [0.75, 0.1, 0.1], [0.12, 0.3, 0.7], [0.08, 0.08, 0.08], [0.2, 0.6, 0.35], [0.95, 0.5, 0.65]];
      for (let k = 0; k < nSt; k++) { const a = sr() * 6.283, y = y0 + sr() * (y1 - y0), w = Math.min(0.075, 0.035 + sr() * 0.05), h = 0.03 + sr() * 0.07; const c = STK[Math.floor(sr() * STK.length)];
        add(a, y, w, h, c.map((v) => v * (0.75 + sr() * 0.2))); // faded sticker
        if (sr() < 0.6) add(a, y + (sr() - 0.5) * h * 0.4, w * 0.7, h * 0.18, c[0] + c[1] + c[2] > 1.5 ? [0.1, 0.1, 0.1] : [0.9, 0.9, 0.88]); // printed line
        if (sr() < 0.3) add(a + 0.05, y - h * 0.5 - 0.01, w * 0.85, 0.012, [0.7, 0.68, 0.62]); } // torn residue
      if (rusty) for (let k = 0; k < 4; k++) { const a = sr() * 6.283, h = 0.25 + sr() * 0.45; add(a, 0.32 + h / 2, 0.022 + sr() * 0.02, h, [0.3 + sr() * 0.08, 0.14 + sr() * 0.04, 0.06]); } // rust runs above the base skirt
      { const a = sr() * 6.283; add(a, 0.33, 0.05, 0.03, [0.28, 0.13, 0.05]); add(a + 1.6, 0.34, 0.04, 0.025, [0.34, 0.16, 0.06]); } // pitting at the skirt seam
    };
    for (const it of city.inters) {
      if (!isl(it.z) || it.x < -30 || it.x > 300) continue;
      for (const [sx, sz] of [[1, 1], [-1, -1]]) { const px = it.x + sx * 8.2, pz = it.z + sz * 8.2;
        if (!col.query(px, pz, 0.5, box).some((b) => b.tag === 'pole' && b.h === 6 && Math.abs((b.minX + b.maxX) / 2 - px) < 0.05 && Math.abs((b.minZ + b.maxZ) / 2 - pz) < 0.05)) continue;
        const ry = sx > 0 ? 0 : Math.PI, base = V3(px, 0.15, pz); stat.sigMasts++;
        pedHead(base, ry, V3(-0.36, 3.0, 0), V3(-1, 0, 0)); pedHead(base, ry, V3(0, 3.0, -0.36), V3(0, 0, -1));
        button(base, ry, V3(-1, 0, 0), 0.14); button(base, ry, V3(0, 0, -1), 0.14);
        for (const d of [3, 6.5]) { const hc = base.clone().add(RY(ry, V3(-d, 5.7, 0))), n = RY(ry, V3(0, 0, 1)), right = new THREE.Vector3().crossVectors(UP, n);
          const lo = hc.clone().addScaledVector(n, 0.1595); push('lens', lo.x, lo.z, basisAt(lo, right, UP, n, 0.236, 0.236), [0.3, 0.15, 0.02]); // amber lens (unlit)
          const so = hc.clone().addScaledVector(n, -0.165); push('hstrap', so.x, so.z, basisAt(so, right, UP, n, 1, 1)); stat.vehHeads++; }
        { const o = base.clone().add(RY(ry, V3(-1.55, 6.3 - 0.06, 0))), n = RY(ry, V3(0, 0, 1)), right = new THREE.Vector3().crossVectors(UP, n); // video detection camera under the arm, aimed at the approach
          push('vcam', o.x, o.z, basisAt(o, right, UP, n, 1, 1)); stat.vcams++; }
        if ((Math.round(it.x / 10) + Math.round(it.z / 150) + (sx > 0 ? 0 : 1)) % 2 === 0) { // PTZ dome on every other mast, on the intersection side, + plate
          const n = RY(ry, V3(-Math.SQRT1_2, 0, -Math.SQRT1_2)), right = new THREE.Vector3().crossVectors(UP, n); const rr = 0.155 - 0.045 * (5.6 / 6.6);
          const o = base.clone().add(V3(0, 5.6, 0)).addScaledVector(n, rr); push('dome', o.x, o.z, basisAt(o, right, UP, n, 1, 1)); stat.domes++;
          const pn = RY(ry, V3(0, 0, 1)), po = base.clone().add(V3(0, 2.45, 0)).addScaledVector(pn, 0.15 + 0.01);
          plate(po, UP, pn, 0.44, 0.3, lin(BLUE)); print(rasCam, po, UP, pn, 0.44, 0.3, 'txtS', 0.005); }
        decals(base, (y) => 0.155 - 0.045 * Math.min(1, y / 6.6), 1.2, 2.3, 3 + Math.floor(sr() * 3), true);
      }
      for (const [sx, sz] of [[1, -1], [-1, 1]]) { const px = it.x + sx * 8.0, pz = it.z + sz * 8.0;
        if (!col.query(px, pz, 0.5, box).some((b) => b.tag === 'pole' && b.h === 3.4 && Math.abs((b.minX + b.maxX) / 2 - px) < 0.05 && Math.abs((b.minZ + b.maxZ) / 2 - pz) < 0.05)) continue;
        const ry = sx > 0 ? 0 : Math.PI, base = V3(px, 0.15, pz); stat.sigPedPoles++;
        pedHead(base, ry, V3(-0.3, 2.85, 0), V3(-1, 0, 0)); pedHead(base, ry, V3(0, 2.85, 0.3), V3(0, 0, 1));
        button(base, ry, V3(-1, 0, 0), 0.07); button(base, ry, V3(0, 0, 1), 0.07);
        decals(base, (y) => 0.075 - 0.01 * Math.min(1, y / 3.4), 1.25, 2.2, 2 + Math.floor(sr() * 3), sr() < 0.5);
      }
    }
  }

  // ------------------------------------------------------------------ meshes + streaming ----
  const mats = {
    m: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.45 }), 'fabCar'),
    glass: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.08, metalness: 0.6 }), 'fabCar'),
    lit: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.0, emissive: 0xfff4e2, emissiveIntensity: 0.0 }), 'fabCar'),
    sign: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.05 }), 'fabCar'),
    paint: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'fabCar'),
    // a_streetnames: pedestrian-signal LED pictograms; lit state = emissive (uniform), phase-driven in update()
    pwX: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.0, emissive: 0xe9f3ff, emissiveIntensity: 0.0 }), 'fabCar'),
    pwZ: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.0, emissive: 0xe9f3ff, emissiveIntensity: 0.0 }), 'fabCar'),
    phX: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.0, emissive: 0xff6a10, emissiveIntensity: 0.0 }), 'fabCar'),
    phZ: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.0, emissive: 0xff6a10, emissiveIntensity: 0.0 }), 'fabCar'),
  };
  const CELL = 40; const out = { kinds: [], stat, stops, gantries, nameposts, last: new THREE.Vector3(1e9, 0, 1e9) };
  for (const k of kinds.values()) {
    if (!k.items.length) continue;
    const grid = new Map(); for (const it of k.items) { const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(it); }
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, mats[k.mat], k.items.length); im.count = 0; im.castShadow = k.cast; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.items.length * 3).fill(1), 3); im.frustumCulled = true; im.userData.signage = k.name; im.name = 'signage_' + k.name; scene.add(im); return im; };
    k.nearIM = mk(k.near); k.farIM = k.far ? mk(k.far) : null; if (k.farIM) k.farIM.castShadow = false; k.grid = grid;
    out.kinds.push(k);
  }
  const _c = new THREE.Color(); const _sph = new THREE.Sphere();
  out.update = (cam, night = 0, force = false, phase = 0) => {
    mats.lit.emissiveIntensity = 0.04 + night * 0.85;
    { const on = 1.1 + night * 0.9; // traffic phase 0 = NS green (crossing along z walks), 1 = EW green (crossing along x walks), 2 = all red
      mats.pwX.emissiveIntensity = phase === 1 ? on : 0; mats.phX.emissiveIntensity = phase === 1 ? 0 : on; mats.pwZ.emissiveIntensity = phase === 0 ? on : 0; mats.phZ.emissiveIntensity = phase === 0 ? 0 : on; }
    if (!force && Math.abs(cam.x - out.last.x) < 8 && Math.abs(cam.z - out.last.z) < 8) return; out.last.set(cam.x, 0, cam.z);
    for (const k of out.kinds) {
      let nN = 0, nF = 0; const R = k.rF, rr = k.rN * k.rN, RR = R * R;
      const ix0 = Math.floor((cam.x - R) / CELL), ix1 = Math.floor((cam.x + R) / CELL), iz0 = Math.floor((cam.z - R) / CELL), iz1 = Math.floor((cam.z + R) / CELL);
      let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) { const l = k.grid.get(ix + ',' + iz); if (!l) continue;
        for (const it of l) { const d2 = (it.x - cam.x) ** 2 + (it.z - cam.z) ** 2; if (d2 > RR) continue;
          const im = d2 <= rr ? k.nearIM : k.farIM; if (!im) continue; const i = im === k.nearIM ? nN++ : nF++;
          im.setMatrixAt(i, it.m); im.setColorAt(i, _c.setRGB(it.c[0], it.c[1], it.c[2]));
          mnx = Math.min(mnx, it.x); mxx = Math.max(mxx, it.x); mnz = Math.min(mnz, it.z); mxz = Math.max(mxz, it.z); } }
      for (const [im, n] of [[k.nearIM, nN], [k.farIM, nF]]) { if (!im) continue; im.count = n; im.visible = n > 0; if (!n) continue;
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.instanceMatrix.clearUpdateRanges?.(); im.instanceColor.clearUpdateRanges?.();
        _sph.center.set((mnx + mxx) / 2, 3, (mnz + mxz) / 2); _sph.radius = Math.hypot(mxx - mnx, mxz - mnz) / 2 + 9; im.boundingSphere = im.boundingSphere || new THREE.Sphere(); im.boundingSphere.copy(_sph); }
    }
  };
  out.info = () => { let dc = 0, t = 0, inst = 0; const per = {}; for (const k of out.kinds) for (const im of [k.nearIM, k.farIM]) { if (!im || !im.count) continue; dc++; const tt = im.count * tris(im.geometry); t += tt; inst += im.count; per[k.name + (im === k.farIM ? '_far' : '')] = [im.count, Math.round(tt)]; } return { drawCalls: dc, tris: Math.round(t), instances: inst, per }; };
  out.totals = () => { const o = {}; for (const k of out.kinds) o[k.name] = [k.items.length, tris(k.near), k.far ? tris(k.far) : 0]; return o; };
  // a_streetnames: every printed street name on map A, for tests (blades from street.js, posts + gantries + bus routes from here)
  out.streetNames = () => ({ blades: BLADE_LOG.map((b) => ({ ...b })), posts: nameposts.map(([x, z, ix, iz, ns, ew]) => ({ x, z, ix, iz, ns, ew })),
    gantries: gantries.map(([x, z, road, d, ix, iz, straight, cross, only]) => ({ x, z, road, d, ix, iz, straight, cross, only })),
    routes: Object.fromEntries([50, 170, 290].map((c) => [c, c === 290 ? '海潮环线' : NS_NAME[c] + '线'])) });
  out.buildMs = Math.round(performance.now() - t0); city.signage = out;
  return out;
}
