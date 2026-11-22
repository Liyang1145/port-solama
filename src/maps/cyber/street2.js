// r6.4 霓港 street layer pass 2 (Hark modelling lane b_street2, 2026-11-21): close-range street-vendor stalls and ground-floor
// shop dressing, original cyberpunk-Asian street feel. Builds on dress.js (model_b2: generic food cart, umbrella tables, trash,
// hanging light boxes) without stacking the same props again:
//  * stalls: 面摊 noodle stall (glass-front cart, stock pots, steam), 烧烤 grill stall (charcoal trough with glowing coals, skewers,
//    smoke), 维修摊 phone / gadget repair booth (glass counter, pegboard, lit phone screens, magnifier lamp). Each has a sagging rain
//    tarp on poles, a bulb string, folding tables and proper moulded plastic stools.
//  * shop fronts: Chinese light-box signboards (invented shop names, drawn into a canvas atlas at runtime), stickers / small paper
//    ads on walls and shutters, ground-level AC condensers with copper lines up the wall, meter boxes with conduit + cable bundles.
// Materials (registered in city.js buildCity): 'cnsign' (atlas face, lit by vertex-colour .r at night), 'steam' (animated soft plume,
// alpha-blended, no shadows). Small parts go to 'vcolD' (hidden beyond the detail radius), steam LOD-hidden the same way.
// All names / texts are invented; no real brands or marks.
import * as THREE from 'three';
import { envAdopt } from '../../mats.js'; // b_envprog2
import { rng, rand, randi, pick } from '../../util.js';
import { kg, beam, tube, put, cable, cableBundle, NEONC, RUST, DARK, STEEL } from './kit.js';
import { U } from '../../env.js';
import { cnText, cnMeasure, cnReady, cnWhenReady } from './cnglyph.js';
import { clutSnap, clutGrab } from './clutcap.js'; // b_clutter

// ------------------------------------------------------------------ text atlas ----
// 1024²: rows 0-5 = 24 shop sign cells (256×128), rows 6-7 = 16 sticker cells (128×128)
export const SIGN_TXT = ['阿明面馆', '夜猫烧烤', '老街修机', '霓虹药房', '永兴五金', '幸福理发', '全日便利', '海风茶餐厅', '鸿运电器', '快修电子', '平价超市', '福记粥铺',
  '光栅网吧', '星河洗衣', '大排档', '电池回收', '牛肉拉面', '炭火烧烤', '手机维修', '霓港轻轨', '环湾线', '糖水铺', '义肢保养', '芯片植入'];
export const SG = { noodle: 16, bbq: 17, repair: 18, rail: 19, line: 20 };
const SUB = ['24小时营业', '营业中', '新店开张', '老字号', '欢迎光临', '堂食 外带', '诚信经营', '夜宵', '平价实惠', '快修 贴膜', '充电 换屏', '轻轨三号线'];
const STK = [['开锁', '换锁芯'], ['管道疏通', ''], ['招租', '临街旺铺'], ['高价回收', '旧手机'], ['急招', '洗碗工'], ['搬家', '长短途'], ['家电维修', '上门'], ['转让', '设备齐全'],
  ['二手显卡', '收售'], ['义眼校准', ''], ['寻猫启事', '橘色'], ['数据恢复', ''], ['空调加氟', ''], ['租房', '单间'], ['代驾', ''], ['夜班', '日结']];
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","WenQuanYi Zen Hei",sans-serif';
const SIGN_STY = [['#c8161d', '#ffe14a'], ['#f4f1e6', '#c41a1a'], ['#0b3f8c', '#ffffff'], ['#101012', '#38f0ff'], ['#0e5a35', '#fff4c8'], ['#ffd21f', '#1a1a1a'],
  ['#101012', '#ff3aa8'], ['#e8e8ea', '#0b3f8c'], ['#6a1690', '#ffe6ff'], ['#ff6a00', '#ffffff'], ['#101012', '#ffcf3a'], ['#1d8f86', '#ffffff']];
// b_neon_sign: text comes from the offline glyph atlas (cnglyph.js), not the system font; repainted once if it arrives late
function textAtlas() {
  const N = 1024; const c = document.createElement('canvas'); c.width = c.height = N;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  paintAtlas(c.getContext('2d'), N); if (!cnReady()) cnWhenReady(() => { paintAtlas(c.getContext('2d'), N); t.needsUpdate = true; });
  return t;
}
function paintAtlas(g, N) {
  g.fillStyle = '#777'; g.fillRect(0, 0, N, N);
  // shop signs
  for (let i = 0; i < 24; i++) {
    const x0 = (i % 4) * 256, y0 = Math.floor(i / 4) * 128; const [bg, fg] = SIGN_STY[(i * 7) % SIGN_STY.length];
    g.fillStyle = bg; g.fillRect(x0, y0, 256, 128);
    g.strokeStyle = fg; g.globalAlpha = 0.85; g.lineWidth = 3; g.strokeRect(x0 + 6, y0 + 6, 244, 116); g.globalAlpha = 1;
    const t = SIGN_TXT[i]; let fs = Math.min(76, 220 / t.length);
    const w = cnMeasure(g, t, fs); if (w > 228) fs *= 228 / w;
    if (bg === '#101012') { g.shadowColor = fg; g.shadowBlur = 10; }
    g.fillStyle = fg; cnText(g, t, x0 + 128, y0 + 54, fs); g.shadowBlur = 0;
    g.globalAlpha = 0.9; cnText(g, SUB[i % SUB.length], x0 + 128, y0 + 104, 17); g.globalAlpha = 1;
  }
  // stickers / small paper ads
  const r = (() => { let s = 911; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 16; i++) {
    const x0 = (i % 8) * 128, y0 = 768 + Math.floor(i / 8) * 128; const bg = ['#f2efe4', '#ffe75a', '#ff9ac0', '#9fd6ff', '#ffffff', '#c6f7b0'][i % 6];
    g.fillStyle = '#5b5b5b'; g.fillRect(x0, y0, 128, 128);
    g.fillStyle = bg; g.fillRect(x0 + 6, y0 + 6, 116, 116);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(80,70,50,${r() * 0.12})`; g.fillRect(x0 + 6 + r() * 110, y0 + 6 + r() * 110, 2 + r() * 10, 2 + r() * 6); } // paper wear
    const [t1, t2] = STK[i]; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = i % 3 === 0 ? '#c4141a' : '#111'; cnText(g, t1, x0 + 64, y0 + 34, Math.min(40, 100 / t1.length));
    g.fillStyle = '#222'; if (t2) cnText(g, t2, x0 + 64, y0 + 66, 19);
    let num = '1'; for (let k = 0; k < 10; k++) num += Math.floor(r() * 10); g.font = `bold 15px ${FONT}`; g.fillStyle = '#c4141a'; g.fillText(num.slice(0, 3) + '-' + num.slice(3, 7) + '-' + num.slice(7), x0 + 64, y0 + 94);
    if (i % 4 === 1) { g.fillStyle = '#111'; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (r() < 0.5) g.fillRect(x0 + 94 + a * 4, y0 + 96 + b * 4, 4, 4); } // tiny QR-ish block
    if (i % 5 === 2) { g.strokeStyle = '#111'; g.setLineDash([3, 3]); g.beginPath(); for (let k = 0; k < 7; k++) { g.moveTo(x0 + 10 + k * 16, y0 + 106); g.lineTo(x0 + 10 + k * 16, y0 + 122); } g.stroke(); g.setLineDash([]); } // tear-off strips
  }
}
let CN_MAT = null;
// face material: albedo = atlas; emissive = atlas × vertex colour .r (1 = lit light box, 0 = paper sticker), strong at night
export function cnSignMat() {
  if (CN_MAT) return CN_MAT;
  CN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  CN_MAT.map = textAtlas();
  CN_MAT.onBeforeCompile = (s) => { s.uniforms.uNight = U.uNight;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vColor.r * (0.06 + uNight * 1.25);'); };
  CN_MAT.customProgramCacheKey = () => 'cnsign';
  return (CN_MAT = envAdopt(CN_MAT, 'cnsign')); // b_envprog2
}
const CN_G = new Map();
// unit plane facing +z for a sign cell (0..23) or a sticker cell (100..115)
function cnPlane(k) {
  let g = CN_G.get(k); if (g) return g; g = new THREE.PlaneGeometry(1, 1);
  let u0, v0, du, dv; if (k >= 100) { const i = k - 100; u0 = (i % 8) / 8; du = 1 / 8; v0 = 1 - (768 + (Math.floor(i / 8) + 1) * 128) / 1024; dv = 0.125; }
  else { u0 = (k % 4) / 4; du = 0.25; v0 = 1 - (Math.floor(k / 4) + 1) * 128 / 1024; dv = 0.125; }
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  CN_G.set(k, g); return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
// textured face: centre (x,y,z), yaw ry (plane normal = (sin ry, 0, cos ry)), size w×h, in-plane roll, lit 0/1
export function cnFace(W, k, x, y, z, ry, w, h, lit = 1, roll = 0) {
  const b = W.b('cnsign', x, z); _e.set(0, ry, roll, 'YXZ'); _q.setFromEuler(_e); _s.set(w, h, 1); _p.set(x, y, z); _m.compose(_p, _q, _s); b.geom(cnPlane(k), _m, {}, [lit, lit, lit]);
}

// ------------------------------------------------------------------ steam / smoke ----
let STEAM_MAT = null;
export function steamMat() {
  if (STEAM_MAT) return STEAM_MAT;
  STEAM_MAT = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uNight: U.uNight }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying vec2 vUv; varying float vS; void main(){ vC = color; vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vS = wp.x * 0.37 + wp.z * 0.61; wp.x += sin(uv.y * 3.0 + vS) * uv.y * 0.12; gl_Position = projectionMatrix * viewMatrix * wp; }'.replace('void main', 'uniform float uTime; void main'),
    fragmentShader: `uniform float uTime, uNight; varying vec3 vC; varying vec2 vUv; varying float vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main(){ vec2 p = vec2(vUv.x * 2.2 + vS, vUv.y * 2.6 - uTime * 0.9);
        float d = n(p) * 0.6 + n(p * 2.3 + 7.0) * 0.4; float w = 1.0 - abs(vUv.x - 0.5) * 2.0; w = smoothstep(0.0, 0.7 - vUv.y * 0.3, w);
        float a = smoothstep(0.25, 0.85, d) * w * smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.4);
        vec3 c = vC * mix(0.95, 0.42, uNight); gl_FragColor = vec4(c, a * 0.5); }` });
  return STEAM_MAT;
}
// a plume of w × h rising from (x, y, z): two crossed quads
export function plume(W, x, y, z, w, h, col = [0.92, 0.92, 0.9]) {
  const b = W.b('steam', x, z); const V = (a, b2, c) => new THREE.Vector3(a, b2, c); const UV = [0, 0, 1, 0, 1, 1, 0, 1];
  for (const t of [0.35, 0.35 + Math.PI / 2]) { const dx = Math.cos(t) * w / 2, dz = Math.sin(t) * w / 2;
    b.quad(V(x - dx, y, z - dz), V(x + dx, y, z + dz), V(x + dx * 1.6, y + h, z + dz * 1.6), V(x - dx * 1.6, y + h, z - dz * 1.6), UV, {}, col); }
}

// ------------------------------------------------------------------ small parts ----
// moulded plastic stool: tapered seat ring + 4 splayed legs + a stretcher ring, ~44 cm tall (unit geometry in metres)
let STOOL_G = null;
function stoolG() {
  if (STOOL_G) return STOOL_G;
  const parts = []; const add = (g, m) => { g.applyMatrix4(m); parts.push(g.toNonIndexed()); };
  add(new THREE.CylinderGeometry(0.15, 0.135, 0.04, 12), new THREE.Matrix4().makeTranslation(0, 0.43, 0));
  add(new THREE.CylinderGeometry(0.135, 0.13, 0.05, 12, 1, true), new THREE.Matrix4().makeTranslation(0, 0.39, 0));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const g = new THREE.BoxGeometry(0.05, 0.42, 0.035);
    const m = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeRotationX(0)).multiply(new THREE.Matrix4().makeRotationZ(0.16));
    m.setPosition(Math.cos(a) * 0.135, 0.2, Math.sin(a) * 0.135); add(g, m); }
  add(new THREE.TorusGeometry(0.15, 0.01, 3, 10), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.12, 0));
  const pos = [], nor = []; for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }
  STOOL_G = new THREE.BufferGeometry(); STOOL_G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); STOOL_G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  STOOL_G.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return STOOL_G;
}
const STOOLC = [[0.78, 0.1, 0.1], [0.12, 0.32, 0.68], [0.85, 0.85, 0.82], [0.95, 0.62, 0.08], [0.15, 0.55, 0.35], [0.88, 0.3, 0.55]];
export function stool(c, x, y, z, col, stack = 1) { for (let i = 0; i < stack; i++) put(c, stoolG(), x, y + i * 0.075, z, 1, 1, 1, col || pick(STOOLC), rand(0, 6.28)); }
// folding table (laminate top + steel X legs) at (x,z) with yaw
function foldTable(c, x, y, z, ang, w = 0.9, d = 0.6) {
  const G = kg(); const top = pick([[0.85, 0.83, 0.78], [0.72, 0.55, 0.35], [0.9, 0.9, 0.9], [0.25, 0.42, 0.62]]);
  put(c, G.box, x, y + 0.72, z, w, 0.03, d, top, ang); const ca = Math.cos(ang), sa = Math.sin(ang);
  for (const s of [-1, 1]) { const ox = ca * s * w * 0.4, oz = -sa * s * w * 0.4; // legs at both ends (X frame across the depth)
    for (const t of [-1, 1]) beam(c, [x + ox + sa * t * d * 0.4, y, z + oz + ca * t * d * 0.4], [x + ox - sa * t * d * 0.4, y + 0.7, z + oz - ca * t * d * 0.4], 0.022, STEEL); }
  if (rng() < 0.6) put(c, kg().cyl8, x + rand(-0.2, 0.2), y + 0.78, z + rand(-0.15, 0.15), 0.07, 0.08, 0.07, pick([[0.9, 0.9, 0.88], [0.8, 0.25, 0.2]])); // bowl / cup
  if (rng() < 0.4) put(c, kg().cyl8, x + rand(-0.3, 0.3), y + 0.86, z + rand(-0.15, 0.15), 0.035, 0.24, 0.035, [0.25, 0.5, 0.2]); // bottle
}
// sagging rain tarp over a rectangle in frame F: a ∈ [a0, a1], d ∈ [d0, d1], high edge at d0 (yh), low edge at d1 (yl); both faces
function tarp(v, F, a0, a1, d0, d1, yh, yl, col, poles = true) {
  const NA = 4, ND = 3; const P = (i, j) => { const a = a0 + (a1 - a0) * i / NA, d = d0 + (d1 - d0) * j / ND; const q = F.P(a, d);
    const sag = Math.sin(Math.PI * i / NA) * Math.sin(Math.PI * j / ND) * 0.16 + (i % 2) * 0.015; return new THREE.Vector3(q[0], yh + (yl - yh) * j / ND - sag, q[1]); };
  const UV = [0, 0, 1, 0, 1, 1, 0, 1]; const under = col.map((x) => x * 0.55);
  for (let i = 0; i < NA; i++) for (let j = 0; j < ND; j++) { const A = P(i, j), B = P(i + 1, j), C = P(i + 1, j + 1), D = P(i, j + 1);
    const sh = 0.94 + ((i + j) % 2) * 0.06; v.quad(A, D, C, B, UV, {}, col.map((x) => x * sh)); v.quad(A, B, C, D, UV, {}, under); }
  if (poles) { const pc = rng() < 0.5 ? STEEL : [0.55, 0.45, 0.28];
    for (const [a, d, y] of [[a0, d0, yh], [a1, d0, yh], [a0, d1, yl], [a1, d1, yl]]) { const q = F.P(a, d); beam(v, [q[0], 0.15, q[1]], [q[0], y + 0.02, q[1]], 0.045, pc, null, kg().tube6); } }
}
// a string of bulbs along A→B (world 3-vectors), sagging
function bulbs(c, nb, A, B, sag, col) {
  cable(c, A, B, sag, 0.006, DARK, 8); const n = Math.max(3, Math.round(Math.hypot(B[0] - A[0], B[2] - A[2]) / 0.45)); const G = kg();
  for (let i = 1; i < n; i++) { const t = i / n; const x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t, y = A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t);
    put(nb, G.ball, x, y - 0.05, z, 0.045, 0.06, 0.045, col.map((q) => q * 0.4)); }
}
const V3 = (F, a, d, y) => { const q = F.P(a, d); return [q[0], y, q[1]]; };
const yawOf = (F) => Math.atan2(F.ox, F.oz); // yaw that turns +z toward the frame's outward direction

// common stall shell: tarp, bulb string, a lit name board under the front edge; returns builders
function stallShell(W, F, a, d, y0, L, D, sign) {
  const v = W.b('vcol', F.P(a, d)[0], F.P(a, d)[1]), c = W.b('vcolD', F.P(a, d)[0], F.P(a, d)[1]), nb = W.b('neon', F.P(a, d)[0], F.P(a, d)[1]);
  const tc = pick([[0.12, 0.35, 0.62], [0.78, 0.16, 0.12], [0.22, 0.5, 0.3], [0.85, 0.65, 0.12], [0.3, 0.32, 0.36], [0.55, 0.75, 0.85]]);
  const yh = y0 + 2.45, yl = y0 + 2.05; tarp(v, F, a - L / 2 - 0.35, a + L / 2 + 0.35, d - D / 2 - 0.25, d + D / 2 + 1.4, yh, yl, tc);
  const bc = pick([[1.0, 0.82, 0.5], [1.0, 0.55, 0.25], [0.6, 0.9, 1.0], [1.0, 0.4, 0.7]]);
  bulbs(c, nb, V3(F, a - L / 2 - 0.3, d + D / 2 + 1.35, yl - 0.05), V3(F, a + L / 2 + 0.3, d + D / 2 + 1.35, yl - 0.05), 0.18, bc);
  if (rng() < 0.6) bulbs(c, nb, V3(F, a - L / 2 - 0.3, d - D / 2 - 0.2, yh - 0.08), V3(F, a - L / 2 - 0.3, d + D / 2 + 1.35, yl - 0.08), 0.12, bc);
  // name board hung from the tarp front edge, facing the street (both faces)
  const sb = V3(F, a, d + D / 2 + 1.38, yl - 0.42); const ry = yawOf(F); put(v, kg().box, sb[0], sb[1], sb[2], 1.3, 0.6, 0.06, [0.08, 0.08, 0.09], ry);
  for (const s of [1, -1]) { const o = 0.035 * s; cnFace(W, sign, sb[0] + F.ox * o, sb[1], sb[2] + F.oz * o, s > 0 ? ry : ry + Math.PI, 1.22, 0.56, 1); }
  return { v, c, nb, ry };
}
// seating in front of a stall: 1-2 folding tables with stools
function seating(c, F, a, d, y0, L) {
  const ry = yawOf(F); const nt = L > 2 ? randi(1, 2) : 1;
  for (let i = 0; i < nt; i++) { const ta = a + (nt === 1 ? rand(-0.3, 0.3) : (i - 0.5) * 1.3); const p = V3(F, ta, d, 0); foldTable(c, p[0], y0, p[2], ry + rand(-0.15, 0.15));
    for (const [u, w] of [[-0.62, 0], [0.62, 0], [0, -0.55], [0, 0.55]]) if (rng() < 0.75) { const q = V3(F, ta + u + rand(-0.08, 0.08), d + w + rand(-0.08, 0.08), 0); stool(c, q[0], y0, q[2]); } }
  if (rng() < 0.6) { const q = V3(F, a + L / 2 + 0.3, d + 0.4, 0); stool(c, q[0], y0, q[2], pick(STOOLC), randi(3, 6)); } // stacked stools
}

// 面摊 noodle stall: steel cart with a glass display case, two stock pots on burners (steam), bowl stacks, a ladle rail
export function noodleStall(W, F, a, d, y0) {
  const L = 2.0, D = 0.85; const { v, c, nb, ry } = stallShell(W, F, a, d, y0, L, D, SG.noodle); const G = kg();
  const g = W.b('glassRail', F.P(a, d)[0], F.P(a, d)[1]);
  const body = pick([[0.72, 0.73, 0.74], [0.62, 0.15, 0.12], [0.18, 0.35, 0.55]]);
  const cb = V3(F, a, d, y0 + 0.45); put(v, G.box, cb[0], cb[1], cb[2], L, 0.8, D, body, ry);
  const top = V3(F, a, d, y0 + 0.87); put(v, G.box, top[0], top[1], top[2], L + 0.1, 0.05, D + 0.12, [0.78, 0.79, 0.8], ry);
  for (const s of [-1, 1]) { const w = V3(F, a + s * (L / 2 - 0.3), d - D / 2 - 0.02, y0 + 0.18); put(c, G.cyl8, w[0], w[1], w[2], 0.18, 0.07, 0.18, DARK); }
  // glass display case on the street side (noodles, greens, eggs inside)
  const gc0 = V3(F, a + 0.35, d + D / 2 - 0.22, y0 + 0.9);
  for (const [u, w2] of [[-0.55, 0], [0.55, 0]]) put(v, G.box, gc0[0] + F.dx * u, gc0[1] + 0.25, gc0[2] + F.dz * u, 0.03, 0.5, 0.4, [0.75, 0.76, 0.77], ry + w2);
  put(v, G.box, gc0[0], gc0[1] + 0.51, gc0[2], 1.12, 0.03, 0.42, [0.75, 0.76, 0.77], ry);
  { const q = [F.P(a - 0.2, d + D / 2 - 0.01), F.P(a + 0.9, d + D / 2 - 0.01), F.P(a + 0.9, d + D / 2 - 0.03), F.P(a - 0.2, d + D / 2 - 0.03)];
    for (let i = 0; i < 4; i++) { const p = q[i], o = q[(i + 1) % 4]; g.quad(new THREE.Vector3(p[0], y0 + 0.9, p[1]), new THREE.Vector3(o[0], y0 + 0.9, o[1]), new THREE.Vector3(o[0], y0 + 1.4, o[1]), new THREE.Vector3(p[0], y0 + 1.4, p[1]), [0, 0, 1, 0, 1, 1, 0, 1]); } }
  for (let i = 0; i < 5; i++) { const p = V3(F, a - 0.1 + i * 0.22, d + D / 2 - 0.22, y0 + 0.95); put(c, G.box, p[0], p[1], p[2], 0.18, 0.08, 0.26, pick([[0.95, 0.88, 0.6], [0.3, 0.6, 0.2], [0.95, 0.95, 0.9], [0.85, 0.45, 0.2]]), ry); }
  put(nb, G.box, gc0[0], gc0[1] + 0.47, gc0[2], 1.0, 0.03, 0.05, [0.5, 0.48, 0.4], ry); // case strip light
  // stock pots on burners + steam
  for (const [u, r] of [[-0.62, 0.24], [-0.1, 0.19]]) { const p = V3(F, a + u, d - 0.12, 0);
    put(c, G.cyl8, p[0], y0 + 0.95, p[2], r * 0.9, 0.1, r * 0.9, DARK); put(c, G.cyl12, p[0], y0 + 1.2, p[2], r, 0.42, r, [0.7, 0.71, 0.72]); put(c, G.cyl12, p[0], y0 + 1.415, p[2], r * 0.95, 0.01, r * 0.95, [0.62, 0.48, 0.28]);
    plume(W, p[0], y0 + 1.42, p[2], 0.5, 1.3); }
  // ladle rail + bowl stacks + condiment bottles
  beam(c, V3(F, a - 0.95, d - D / 2 - 0.05, y0 + 1.55), V3(F, a + 0.95, d - D / 2 - 0.05, y0 + 1.55), 0.02, STEEL);
  for (let i = 0; i < 4; i++) { const p = V3(F, a - 0.8 + i * 0.22, d - D / 2 - 0.05, y0 + 1.4); tube(c, [p[0], p[1] + 0.15, p[2]], [p[0], p[1] - 0.12, p[2]], 0.008, STEEL, kg().tube4); put(c, G.ball, p[0], p[1] - 0.15, p[2], 0.05, 0.03, 0.05, STEEL); }
  for (let i = 0; i < 3; i++) { const p = V3(F, a + 0.3 + i * 0.16, d - 0.25, y0 + 0.9); put(c, G.cyl8, p[0], p[1] + 0.06, p[2], 0.075, 0.12 + i * 0.04, 0.075, [0.9, 0.9, 0.88]); }
  for (let i = 0; i < 4; i++) { const p = V3(F, a + 0.75 + (i % 2) * 0.08, d - 0.3 + Math.floor(i / 2) * 0.1, y0 + 0.9); put(c, G.cyl8, p[0], p[1] + 0.09, p[2], 0.03, 0.18, 0.03, pick([[0.6, 0.1, 0.08], [0.2, 0.15, 0.1], [0.85, 0.7, 0.1]])); }
  { const q = V3(F, a - L / 2 - 0.3, d - 0.2, 0); put(c, G.cyl8, q[0], y0 + 0.42, q[2], 0.16, 0.84, 0.16, [0.15, 0.32, 0.62]); } // gas bottle
  { const q = V3(F, a + L / 2 + 0.25, d - 0.3, 0); put(c, G.cyl8, q[0], y0 + 0.2, q[2], 0.2, 0.4, 0.2, [0.25, 0.45, 0.75]); } // wash bucket
  seating(c, F, a, d + D / 2 + 1.0, y0, L);
}
// 烧烤 grill stall: charcoal trough on legs with glowing coals + skewers, prep table, cooler, beer crates, smoke
export function bbqStall(W, F, a, d, y0) {
  const L = 2.2, D = 0.8; const { v, c, nb, ry } = stallShell(W, F, a, d, y0, L, D, SG.bbq); const G = kg();
  // grill trough on the street side of the stall
  const gd = d + 0.2; const gl = 1.5; const g0 = V3(F, a - 0.25, gd, y0 + 0.82);
  put(v, G.box, g0[0], g0[1], g0[2], gl, 0.22, 0.38, [0.12, 0.12, 0.12], ry);
  for (const s of [-1, 1]) for (const t of [-1, 1]) { const p = V3(F, a - 0.25 + s * (gl / 2 - 0.08), gd + t * 0.14, 0); beam(c, [p[0], y0, p[2]], [p[0], y0 + 0.72, p[2]], 0.03, DARK); }
  const coal = V3(F, a - 0.25, gd, y0 + 0.92); put(nb, G.box, coal[0], coal[1], coal[2], gl - 0.1, 0.03, 0.3, [0.55, 0.12, 0.02], ry);
  for (let i = 0; i < 12; i++) { const u = -gl / 2 + 0.12 + i * (gl - 0.24) / 11; const p0 = V3(F, a - 0.25 + u, gd - 0.24, y0 + 0.97), p1 = V3(F, a - 0.25 + u, gd + 0.24, y0 + 0.97);
    beam(c, p0, p1, 0.006, [0.75, 0.68, 0.5], null, kg().tube4); const m = V3(F, a - 0.25 + u, gd + 0.02, y0 + 0.985); put(c, G.box, m[0], m[1], m[2], 0.045, 0.035, 0.22, pick([[0.45, 0.18, 0.08], [0.6, 0.3, 0.12], [0.3, 0.45, 0.15]]), ry); }
  plume(W, coal[0], y0 + 1.0, coal[2], 0.9, 1.9, [0.72, 0.72, 0.74]);
  // prep table behind (trays of raw skewers), cooler, crates
  const pt = V3(F, a, d - 0.35, 0); put(v, G.box, pt[0], y0 + 0.4, pt[2], L, 0.8, 0.5, [0.7, 0.71, 0.72], ry);
  for (let i = 0; i < 4; i++) { const p = V3(F, a - 0.75 + i * 0.5, d - 0.35, y0 + 0.83); put(c, G.box, p[0], p[1], p[2], 0.42, 0.04, 0.32, [0.85, 0.85, 0.85], ry);
    put(c, G.box, p[0], p[1] + 0.035, p[2], 0.36, 0.03, 0.26, pick([[0.75, 0.3, 0.28], [0.6, 0.25, 0.15], [0.35, 0.55, 0.2], [0.9, 0.8, 0.6]]), ry); }
  { const q = V3(F, a + L / 2 + 0.35, d, 0); put(c, G.box, q[0], y0 + 0.25, q[2], 0.6, 0.5, 0.4, [0.85, 0.85, 0.88], ry); put(c, G.box, q[0], y0 + 0.52, q[2], 0.62, 0.05, 0.42, [0.15, 0.4, 0.75], ry); }
  for (let i = 0; i < randi(2, 4); i++) { const q = V3(F, a - L / 2 - 0.4, d - 0.2 + (i % 2) * 0.1, 0); put(c, G.box, q[0], y0 + 0.15 + Math.floor(i / 2) * 0.3 + i % 2 * 0.3, q[2], 0.45, 0.28, 0.32, [0.12, 0.45, 0.2], ry + i * 0.1); }
  // red lantern pair at the tarp corners
  for (const s of [-1, 1]) { const p = V3(F, a + s * (L / 2 + 0.2), d + D / 2 + 1.3, y0 + 1.7); tube(c, [p[0], p[1] + 0.32, p[2]], [p[0], p[1] + 0.18, p[2]], 0.006, DARK, kg().tube4); put(nb, G.ball, p[0], p[1], p[2], 0.19, 0.17, 0.19, [0.6, 0.06, 0.03]); }
  seating(c, F, a, d + D / 2 + 1.1, y0, L);
}
// 维修摊 repair booth: glass counter, pegboard with tools + cables, shelf of phones with lit screens, magnifier lamp, parts boxes
export function repairStall(W, F, a, d, y0) {
  const L = 1.8, D = 0.7; const { v, c, nb, ry } = stallShell(W, F, a, d, y0, L, D, SG.repair); const G = kg();
  const g = W.b('glassRail', F.P(a, d)[0], F.P(a, d)[1]);
  // counter: steel frame + glass top case
  const ct = V3(F, a, d, y0 + 0.42); put(v, G.box, ct[0], ct[1], ct[2], L, 0.84, D, [0.2, 0.21, 0.23], ry);
  { const q = [F.P(a - L / 2, d + D / 2), F.P(a + L / 2, d + D / 2), F.P(a + L / 2, d - D / 2), F.P(a - L / 2, d - D / 2)];
    for (let i = 0; i < 4; i++) { const p = q[i], o = q[(i + 1) % 4]; g.quad(new THREE.Vector3(p[0], y0 + 0.85, p[1]), new THREE.Vector3(o[0], y0 + 0.85, o[1]), new THREE.Vector3(o[0], y0 + 1.05, o[1]), new THREE.Vector3(p[0], y0 + 1.05, p[1]), [0, 0, 1, 0, 1, 1, 0, 1]); } }
  put(v, G.box, ct[0], y0 + 1.06, ct[2], L, 0.015, D, [0.35, 0.4, 0.42], ry);
  for (let i = 0; i < 7; i++) { const p = V3(F, a - 0.75 + i * 0.25, d + rand(-0.15, 0.15), y0 + 0.9); put(nb, G.box, p[0], p[1], p[2], 0.09, 0.012, 0.17, pick([[0.2, 0.35, 0.45], [0.35, 0.3, 0.42], [0.12, 0.3, 0.3], [0.03, 0.03, 0.04]]), ry + rand(-0.3, 0.3)); }
  // pegboard back panel with hanging cables / tools, shelf with phones
  const pb = V3(F, a, d - D / 2 - 0.05, y0 + 1.55); put(v, G.box, pb[0], pb[1], pb[2], L, 1.1, 0.04, [0.62, 0.52, 0.36], ry);
  beam(v, V3(F, a - L / 2, d - D / 2 - 0.05, y0), V3(F, a - L / 2, d - D / 2 - 0.05, y0 + 2.1), 0.05, DARK); beam(v, V3(F, a + L / 2, d - D / 2 - 0.05, y0), V3(F, a + L / 2, d - D / 2 - 0.05, y0 + 2.1), 0.05, DARK);
  for (let i = 0; i < 9; i++) { const u = -0.8 + i * 0.2; const top = V3(F, a + u, d - D / 2 - 0.01, y0 + 1.95);
    if (i % 3 === 0) cable(c, top, V3(F, a + u + 0.12, d - D / 2 - 0.01, y0 + 1.95), 0.35, 0.008, pick([[0.9, 0.9, 0.9], [0.1, 0.1, 0.1], [0.8, 0.2, 0.2]]), 6);
    else { put(c, G.box, top[0], top[1] - 0.12, top[2], 0.04, 0.2, 0.02, pick([[0.8, 0.15, 0.1], [0.2, 0.2, 0.22], [0.9, 0.7, 0.1], [0.15, 0.35, 0.7]]), ry); } }
  const sh = V3(F, a, d - D / 2 + 0.05, y0 + 1.25); put(v, G.box, sh[0], sh[1], sh[2], L - 0.1, 0.03, 0.22, [0.85, 0.85, 0.85], ry);
  for (let i = 0; i < 8; i++) { const p = V3(F, a - 0.75 + i * 0.21, d - D / 2 + 0.05, y0 + 1.34); put(c, G.box, p[0], p[1], p[2], 0.08, 0.16, 0.012, [0.05, 0.05, 0.06], ry);
    const s2 = V3(F, a - 0.75 + i * 0.21, d - D / 2 + 0.058, y0 + 1.345); put(nb, G.box, s2[0], s2[1], s2[2], 0.068, 0.135, 0.004, pick([[0.25, 0.55, 0.8], [0.6, 0.3, 0.75], [0.2, 0.7, 0.5], [0.02, 0.02, 0.02], [0.8, 0.7, 0.3]]).map((q) => q * 0.6), ry); }
  // magnifier lamp on an arm + a soldering station
  const lb = V3(F, a + 0.6, d - 0.15, y0 + 1.07); beam(c, lb, [lb[0], lb[1] + 0.45, lb[2]], 0.02, [0.85, 0.85, 0.85]); const lh = V3(F, a + 0.4, d + 0.05, y0 + 1.5);
  beam(c, [lb[0], lb[1] + 0.45, lb[2]], lh, 0.02, [0.85, 0.85, 0.85]); put(c, G.cyl12, lh[0], lh[1], lh[2], 0.11, 0.04, 0.11, [0.9, 0.9, 0.9]); put(nb, G.cyl12, lh[0], lh[1] - 0.025, lh[2], 0.09, 0.01, 0.09, [0.55, 0.6, 0.65]);
  { const p = V3(F, a - 0.5, d - 0.1, y0 + 1.12); put(c, G.box, p[0], p[1], p[2], 0.22, 0.1, 0.16, [0.12, 0.12, 0.14], ry); put(nb, G.box, p[0], p[1] + 0.01, p[2] + 0.0, 0.08, 0.04, 0.165, [0.6, 0.15, 0.05], ry); }
  // parts boxes + repairer's stool + extension reel
  for (let i = 0; i < 5; i++) { const p = V3(F, a - L / 2 - 0.4, d - 0.2 + rand(-0.1, 0.1), 0); put(c, G.box, p[0], y0 + 0.12 + i * 0.2, p[2], 0.42, 0.18, 0.3, pick([[0.6, 0.48, 0.3], [0.2, 0.25, 0.3], [0.75, 0.75, 0.72]]), ry + rand(-0.1, 0.1)); }
  { const q = V3(F, a, d - D / 2 - 0.45, 0); stool(c, q[0], y0, q[2], [0.12, 0.32, 0.68]); }
  { const q = V3(F, a + L / 2 + 0.3, d - 0.2, 0); put(c, G.cyl12, q[0], y0 + 0.15, q[2], 0.16, 0.06, 0.16, [0.85, 0.5, 0.1]); }
  // small A-board with a sticker-style price card
  const ab = V3(F, a + L / 2 + 0.25, d + D / 2 + 0.6, y0 + 0.4); put(c, G.box, ab[0], ab[1], ab[2], 0.45, 0.75, 0.04, [0.9, 0.9, 0.88], ry); cnFace(W, 100 + 11, ab[0] + F.ox * 0.025, ab[1] + 0.1, ab[2] + F.oz * 0.025, ry, 0.38, 0.38, 0);
}
// pick one of the stall types (the generic dress.js foodStall stays one of the options, so model_b2's carts still appear)
export const STALLS = [noodleStall, bbqStall, repairStall];

// ------------------------------------------------------------------ shop fronts ----
// Chinese light-box signboard across a bay (replaces kit.js signboard on some bays): metal box, lit text face, end caps
export function cnSignboard(W, F, a0, a1, y, h = 0.8) {
  const w = a1 - a0; const ry = yawOf(F); const c = V3(F, (a0 + a1) / 2, 0.36, y + h / 2); const v = W.b('vcol', c[0], c[2]);
  put(v, kg().box, c[0], c[1], c[2], w, h, 0.3, [0.1, 0.1, 0.11], ry);
  const k = randi(0, 17); const fw = Math.min(w - 0.12, (h - 0.1) * 2.2 * (w > 4 ? 1.15 : 1)); // keep the 2:1 cell aspect roughly; centre it
  const f = V3(F, (a0 + a1) / 2, 0.515, y + h / 2); cnFace(W, k, f[0], f[1], f[2], ry, fw, h - 0.1, 1);
  if (fw < w - 0.5) for (const s of [-1, 1]) { const e = V3(F, (a0 + a1) / 2 + s * (fw / 2 + (w - fw) / 4), 0.515, y + h / 2); put(W.b('neon', e[0], e[2]), kg().box, e[0], e[1], e[2], (w - fw) / 2 - 0.12, h - 0.16, 0.01, pick(NEONC).map((q) => q * 0.12), ry); }
  return k; // b_signsync: the shop name cell, so storefront.js can light the same name over the door
}
// stickers / paper ads: n small sheets on the wall around a0..a1 (d just proud of the facade), heights 0.7-2.2
export function stickers(W, F, a0, a1, y0, n, d = 0.03) {
  const ry = yawOf(F);
  for (let i = 0; i < n; i++) { const a = rand(a0, a1); const s = rand(0.14, 0.3); const p = V3(F, a, d + i * 0.0015, y0 + rand(0.7, 2.2)); cnFace(W, 100 + randi(0, 15), p[0], p[1], p[2], ry, s, s * rand(1.0, 1.35), 0, rand(-0.12, 0.12)); }
}
// ground-level AC condenser on a little steel stand against the wall, copper lines running up into the shop band
export function condenser(W, F, a, y0, yt) {
  const c = W.b('vcolD', F.P(a, 0)[0], F.P(a, 0)[1]); const G = kg(); const ry = yawOf(F);
  const w = rand(0.75, 0.9), h = 0.62, dep = 0.32; const b = V3(F, a, 0.4, y0 + 0.2 + h / 2);
  for (const s of [-1, 1]) beam(c, V3(F, a + s * w * 0.4, 0.4, y0), V3(F, a + s * w * 0.4, 0.4, y0 + 0.2), 0.04, DARK);
  put(c, G.box, b[0], b[1], b[2], w, h, dep, pick([[0.82, 0.82, 0.78], [0.7, 0.71, 0.68], [0.6, 0.6, 0.58]]), ry);
  const fc = V3(F, a + w * 0.12, 0.4 + dep / 2 + 0.01, y0 + 0.2 + h / 2); // fan grille
  { _e.set(Math.PI / 2, ry, 0, 'YXZ'); _q.setFromEuler(_e); _s.set(0.23, 0.02, 0.23); _p.set(...fc); _m.compose(_p, _q, _s); c.geom(G.cyl12, _m, {}, [0.07, 0.07, 0.08]); }
  // insulated copper lines: out of the side, up the wall into the transom
  const x = a - w / 2 - 0.08; tube(c, V3(F, a - w / 2, 0.35, y0 + 0.45), V3(F, x, 0.08, y0 + 0.45), 0.025, [0.85, 0.85, 0.82], kg().tube4);
  tube(c, V3(F, x, 0.08, y0 + 0.45), V3(F, x, 0.08, yt + 0.3), 0.03, [0.85, 0.85, 0.82], kg().tube4);
  tube(c, V3(F, x + 0.07, 0.07, y0 + 0.3), V3(F, x + 0.07, 0.07, yt + 0.3), 0.012, [0.3, 0.3, 0.3], kg().tube4); // drain
}
// meter box + conduit + a loose cable bundle up the wall at a, plus a sagging bundle along the shop band to the next box
export function wiring(W, F, a, y0, yt, next = null) {
  const c = W.b('vcolD', F.P(a, 0)[0], F.P(a, 0)[1]); const G = kg(); const ry = yawOf(F);
  const mb = V3(F, a, 0.12, y0 + 1.6); put(c, G.box, mb[0], mb[1], mb[2], 0.45, 0.6, 0.18, pick([[0.55, 0.57, 0.58], [0.4, 0.42, 0.4], [0.6, 0.55, 0.42]]), ry);
  put(c, G.box, mb[0] + F.ox * 0.092, mb[1] + 0.05, mb[2] + F.oz * 0.092, 0.2, 0.16, 0.01, [0.12, 0.15, 0.12], ry); // meter window
  for (let i = 0; i < randi(2, 4); i++) { const o = (i - 1) * 0.06; tube(c, V3(F, a + o, 0.06 + i * 0.015, y0 + 1.9), V3(F, a + o, 0.06 + i * 0.015, yt + 0.6 + rand(0, 1.2)), rand(0.012, 0.025), i === 0 ? [0.55, 0.55, 0.52] : DARK, kg().tube4); }
  tube(c, V3(F, a + 0.1, 0.07, y0 + 0.2), V3(F, a + 0.1, 0.07, y0 + 1.3), 0.03, [0.55, 0.55, 0.52], kg().tube6);
  // stray loop hanging out of the box
  cable(c, V3(F, a - 0.2, 0.15, y0 + 1.35), V3(F, a + 0.25, 0.15, y0 + 1.4), 0.45, 0.01, DARK, 6);
  if (next != null) cableBundle(c, V3(F, a, 0.12, yt + 0.55), V3(F, next, 0.12, yt + 0.5), rand(0.25, 0.6));
}
// per-bay extras for shopStreet: stickers everywhere (more on gritty streets), condensers, wiring runs
export function shopBits(W, F, a0, a1, y0, yt, grit, last, clut = false) {
  const n = Math.round(rand(0, 3 + grit * 6)); if (n) stickers(W, F, a1 - 0.25, a1 + 0.25, y0, n);
  if (rng() < 0.25 + grit * 0.2) stickers(W, F, a0 + 0.3, a1 - 0.3, y0, randi(1, 3), 0.29); // on the shutter / glass line
  if (rng() < 0.22 + grit * 0.25) { const s0 = clut && clutSnap(W); condenser(W, F, rand(a0 + 0.7, a1 - 0.7), y0, yt); if (clut) clutGrab(W, s0, F, y0, 'cond'); } // b_clutter: ground AC unit stands 0.56 m proud
  if (rng() < 0.18 + grit * 0.3) wiring(W, F, a1 + 0.02, y0, yt, last ? null : a1 + rand(3, 6));
}
void RUST;
