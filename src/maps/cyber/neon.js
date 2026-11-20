// v4.5 cyberpunk night layer (user 2026-11-20 19:46: 夜景 = 赛博朋克风). Everything here fades in with uNight, so the day stays
// cinematic-realistic and the time system crossfades. All brands / words are invented for this game.
//  * holographic billboards on tower / mid-rise facades (canvas atlas, additive, scanlines, flicker, glitch slices)
//  * rotating holo rings above landmark towers, sweeping searchlight beams that read as shafts in the night fog
// Tower LED bands, storefront neon fascias, the magenta/cyan sky glow and the night grade live in mats.js / env.js / post.js.
import * as THREE from 'three';
import { U } from '../../env.js';
import { mulberry } from '../../util.js';
import { BldgLayer } from './bldglayer.js';

const WORDS_V = [['霓', '港'], ['鲸', '歌', '电', '子'], ['夜', '航'], ['零', '点', '茶'], ['海', '妖', '酒', '吧'], ['蓝', '晶', '诊', '所'], ['极', '光'], ['数', '字', '海']];
const WORDS_H = [['SOLA//NET', '索拉纳网络'], ['潮汐 VR', 'DIVE DEEP'], ['白鲸 AI', '24H ONLINE'], ['双月光学', 'TWIN MOON'], ['回声电台', '101.7 FM'], ['拉面 24H', 'RAMEN'], ['珊瑚银行', 'CORAL BANK'], ['Ψ-ARC', '义体工坊'],
  ['极光能量', 'AURORA'], ['NEON TIDE', '霓潮'], ['夜猫市场', 'NIGHT MKT'], ['HYDRA-7', '量子快递'], ['星砂赌场', 'STAR SAND'], ['云端公寓', 'SKYHOME'], ['蓝鲸物流', 'BLUEWHALE'], ['零号区', 'ZONE 0']];
const PAL = ['#ff2bd6', '#19f0ff', '#8a5cff', '#ff4d6d', '#38ff9c', '#ffd23f', '#3d7bff', '#ff8a2b'];

function atlas() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 2048; const g = c.getContext('2d'); const r = mulberry(4545);
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 2048);
  const font = (px, bold = true) => `${bold ? '900' : '500'} ${px}px "Anton", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
  const glowText = (t, x, y, px, col, align = 'center') => { g.font = font(px); g.textAlign = align; g.textBaseline = 'middle';
    for (const [b, a] of [[28, 0.55], [12, 0.8], [0, 1]]) { g.shadowColor = col; g.shadowBlur = b; g.fillStyle = a < 1 ? col : '#ffffff'; g.globalAlpha = a; g.fillText(t, x, y); }
    g.globalAlpha = 1; g.shadowBlur = 0; };
  // 8 vertical banners (256 x 1024) in the top half
  for (let i = 0; i < 8; i++) {
    const x0 = i * 256, col = PAL[i % PAL.length], col2 = PAL[(i + 3) % PAL.length];
    const gr = g.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, col + '30'); gr.addColorStop(1, col2 + '18'); g.fillStyle = gr; g.fillRect(x0 + 10, 10, 236, 1004);
    g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 18; g.strokeRect(x0 + 14, 14, 228, 996); g.shadowBlur = 0;
    const w = WORDS_V[i]; const step = 900 / (w.length + 0.5);
    w.forEach((ch, k) => glowText(ch, x0 + 128, 90 + step * (k + 0.5), Math.min(190, step * 0.82), k % 2 ? col2 : col));
    for (let k = 0; k < 14; k++) { g.fillStyle = col2; g.globalAlpha = 0.6; g.fillRect(x0 + 30 + r() * 190, 960 + r() * 30, 4 + r() * 18, 6); } g.globalAlpha = 1;
  }
  // 16 landscape panels (512 x 256) in the bottom half
  for (let i = 0; i < 16; i++) {
    const x0 = (i % 4) * 512, y0 = 1024 + Math.floor(i / 4) * 256; const col = PAL[(i * 3) % PAL.length], col2 = PAL[(i * 5 + 1) % PAL.length];
    const gr = g.createLinearGradient(x0, y0, x0 + 512, y0 + 256); gr.addColorStop(0, col + '38'); gr.addColorStop(1, col2 + '20'); g.fillStyle = gr; g.fillRect(x0 + 8, y0 + 8, 496, 240);
    g.strokeStyle = col; g.lineWidth = 5; g.shadowColor = col; g.shadowBlur = 16; g.strokeRect(x0 + 12, y0 + 12, 488, 232); g.shadowBlur = 0;
    // a simple original emblem: rings / chevrons / wave
    const ex = x0 + 70, ey = y0 + 128; g.strokeStyle = col2; g.lineWidth = 7; g.shadowColor = col2; g.shadowBlur = 14;
    if (i % 3 === 0) { g.beginPath(); g.arc(ex, ey, 38, 0, 6.283); g.stroke(); g.beginPath(); g.arc(ex, ey, 18, 0, 6.283); g.stroke(); }
    else if (i % 3 === 1) { g.beginPath(); g.moveTo(ex - 36, ey + 30); g.lineTo(ex, ey - 34); g.lineTo(ex + 36, ey + 30); g.moveTo(ex - 20, ey + 30); g.lineTo(ex, ey - 4); g.lineTo(ex + 20, ey + 30); g.stroke(); }
    else { g.beginPath(); for (let k = 0; k <= 40; k++) { const xx = ex - 40 + k * 2, yy = ey + Math.sin(k * 0.45) * 22; k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
    g.shadowBlur = 0;
    const [a, b] = WORDS_H[i]; glowText(a, x0 + 300, y0 + 105, a.length > 6 ? 62 : 76, col); glowText(b, x0 + 300, y0 + 190, 40, col2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t;
}

const HOLO_VS = `attribute vec4 aCell; attribute vec2 aSeed; varying vec2 vUv; varying vec2 vSeed; varying vec3 vWP;
void main(){ vUv = aCell.xy + uv * aCell.zw; vSeed = aSeed; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const HOLO_FS = `uniform sampler2D tAtlas; uniform float uNight, uTime; varying vec2 vUv; varying vec2 vSeed; varying vec3 vWP;
float hh(float x){ return fract(sin(x * 91.7) * 43758.5); }
void main(){
  float t = uTime + vSeed.x * 37.0;
  float slice = floor(vWP.y * 2.2 + t * 0.7); float glitch = step(0.985, hh(slice + floor(t * 3.0))) * (hh(slice) - 0.5) * 0.05;
  vec3 c = texture2D(tAtlas, vUv + vec2(glitch, 0.0)).rgb;
  float scan = 0.72 + 0.28 * sin(vWP.y * 26.0 - t * 6.0);
  float flick = 0.86 + 0.14 * step(0.08, hh(floor(t * 13.0) + vSeed.y * 7.0));
  float roll = 0.8 + 0.4 * smoothstep(0.0, 0.08, fract(vWP.y * 0.05 - t * 0.15)) * smoothstep(0.2, 0.08, fract(vWP.y * 0.05 - t * 0.15));
  float k = uNight * scan * flick * roll * (1.4 + vSeed.y);
  gl_FragColor = vec4(c * k * 2.4, 1.0);
}`;

export function buildNeon(scene, city) {
  const out = { meshes: [] }; const R = mulberry(4546); const tex = atlas();
  const mat = new THREE.ShaderMaterial({ uniforms: { tAtlas: { value: tex }, uNight: U.uNight, uTime: U.uTime }, vertexShader: HOLO_VS, fragmentShader: HOLO_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: true });
  // panel placements on tall parcels (street-facing facade = local +x -> world (cos ang, sin ang))
  const items = [];
  const cand = city.parcels.filter((p) => !p.far && (p.style === 'downtown' && p.h > 45 || p.style === 'condo' || (p.style === 'mid' || p.style === 'deco') && p.h > 12));
  for (const p of cand) {
    const big = p.style === 'downtown' || p.style === 'condo'; if (R() > (big ? 0.75 : 0.3)) continue;
    const fx = Math.cos(p.ang), fz = Math.sin(p.ang); const vert = R() < (big ? 0.55 : 0.75);
    const w = vert ? Math.min(p.w * 0.3, big ? 10 : 3.4) : Math.min(p.w * 0.8, big ? 32 : 9); const h = vert ? w * 4 : w * 0.5;
    const yC = big ? Math.min(p.h - h / 2 - 3, (0.35 + R() * 0.4) * p.h) : Math.min(p.h - h / 2 - 1, 5 + h / 2 + R() * 3); if (yC - h / 2 < 4.2) continue;
    const off = p.d / 2 + (p.style === 'condo' ? 2.4 : 0.9);
    // vertical banners stand at a facade corner, perpendicular-ish to the street (classic blade sign); landscape panels on the face
    let x = p.x + fx * off, z = p.z + fz * off, ry = Math.atan2(fx, fz);
    if (vert) { const sx = -fz, sz = fx; const sd = (R() < 0.5 ? -1 : 1) * (p.w / 2 - w * 0.2); x += sx * sd + fx * (w * 0.6); z += sz * sd + fz * (w * 0.6); ry += Math.PI / 2; }
    const ci = vert ? Math.floor(R() * 8) : Math.floor(R() * 16);
    const cell = vert ? [ci * 0.125, 0.5, 0.125, 0.5] : [(ci % 4) * 0.25, (3 - Math.floor(ci / 4)) * 0.125, 0.25, 0.125];
    items.push({ x, y: yC, z, ry, w, h, cell, seed: [R(), R() * 0.8] });
  }
  const g = new THREE.PlaneGeometry(1, 1); const im = new THREE.InstancedMesh(g, mat, Math.max(1, items.length));
  const aCell = new Float32Array(items.length * 4), aSeed = new Float32Array(items.length * 2); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  items.forEach((it, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry); sc.set(it.w, it.h, 1); pv.set(it.x, it.y, it.z); m4.compose(pv, q, sc); im.setMatrixAt(i, m4); aCell.set(it.cell, i * 4); aSeed.set(it.seed, i * 2); });
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 2));
  im.count = items.length; im.frustumCulled = false; im.renderOrder = 5; scene.add(im); out.meshes.push(im); out.panels = items.length;
  // holo rings + searchlights on the tallest towers
  const tall = city.parcels.filter((p) => !p.far && (p.style === 'downtown' || p.style === 'condo')).sort((a, b) => b.h - a.h);
  const ringG = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true); const ringUV = ringG.attributes.uv; for (let i = 0; i < ringUV.count; i++) ringUV.setX(i, ringUV.getX(i) * 3.0);
  const ringMat = new THREE.ShaderMaterial({ uniforms: { tAtlas: { value: tex }, uNight: U.uNight, uTime: U.uTime, uCell: { value: new THREE.Vector4() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tAtlas; uniform float uNight, uTime; uniform vec4 uCell; varying vec2 vUv; varying float vY;
      void main(){ vec2 uv = uCell.xy + fract(vUv) * uCell.zw; vec3 c = texture2D(tAtlas, uv).rgb; float scan = 0.7 + 0.3 * sin(vUv.y * 40.0 - uTime * 5.0);
        float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y); gl_FragColor = vec4(c * uNight * scan * edge * 2.2 + vec3(0.1, 0.6, 0.8) * uNight * 0.08 * edge, 1.0); }` });
  out.rings = [];
  for (let i = 0; i < Math.min(14, tall.length); i += 1) { const p = tall[i]; if (i % 2) continue; const m = ringMat.clone(); m.uniforms.uNight = U.uNight; m.uniforms.uTime = U.uTime; m.uniforms.tAtlas = { value: tex };
    const ci = Math.floor(R() * 16); m.uniforms.uCell = { value: new THREE.Vector4((ci % 4) * 0.25, (3 - Math.floor(ci / 4)) * 0.125, 0.25, 0.125) };
    const r = Math.min(p.w, p.d) * 0.42; const ring = new THREE.Mesh(ringG, m); ring.scale.set(r, r * 0.55, r); ring.position.set(p.x, p.h + 6 + r * 0.3, p.z); ring.renderOrder = 6; scene.add(ring); out.rings.push(ring); out.meshes.push(ring); }
  // searchlight beams: open cones, bright core fading along the length and toward the silhouette edge
  const beamG = new THREE.CylinderGeometry(0.4, 9, 520, 24, 1, true); beamG.translate(0, 260, 0);
  const beamMat = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight, uCol: { value: new THREE.Color() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.y / 520.0; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform float uNight; uniform vec3 uCol; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = f * pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.02, vT) * uNight * 0.16; gl_FragColor = vec4(uCol * a, 1.0); }' });
  out.beams = []; const BC = [[0.3, 0.9, 1.0], [1.0, 0.3, 0.85], [0.75, 0.6, 1.0], [0.9, 0.95, 1.0]];
  for (let i = 0; i < Math.min(10, tall.length); i++) { const p = tall[i]; const m = beamMat.clone(); m.uniforms.uNight = U.uNight; m.uniforms.uCol = { value: new THREE.Color().setRGB(...BC[i % BC.length]) };
    const b = new THREE.Mesh(beamG, m); b.position.set(p.x, p.h + 1, p.z); b.renderOrder = 7; b.userData = { ph: R() * 6.28, sp: 0.15 + R() * 0.2, tilt: 0.28 + R() * 0.2 }; b.frustumCulled = false; scene.add(b); out.beams.push(b); out.meshes.push(b); }
  // r6.2: street-structure layer (harbor cranes / pipes / catwalks, skyways, sky bridges, cross-street cables), chunk-streamed
  out.bldg = city.stream ? new BldgLayer(scene, city.stream.mats, city) : null;
  out.update = (night, time) => {
    if (out.bldg) out.bldg.sync();
    const on = night > 0.02;
    for (const m of out.meshes) m.visible = on;
    if (!on) return;
    for (const r of out.rings) r.rotation.y = time * 0.25;
    for (const b of out.beams) { const u = b.userData; const a = u.ph + time * u.sp; b.rotation.set(Math.cos(a) * u.tilt, 0, Math.sin(a) * u.tilt); }
  };
  return out;
}
