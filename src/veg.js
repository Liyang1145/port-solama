// Vegetation: procedural royal/coconut palms with photo-leaflet fronds, broadleaf trees, shrubs (instanced)
import * as THREE from 'three';
import { prep } from './mats.js';
import { U } from './env.js';
import { mulberry } from './util.js';
import { CYBER } from './mapsel.js';
import { buildFloraA, floraExtras } from './maps/gta/flora.js';

function trunkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#8d8274'; g.fillRect(0, 0, 128, 512);
  const r = mulberry(7);
  for (let i = 0; i < 4000; i++) { const v = 100 + r() * 70; g.fillStyle = `rgba(${v},${v - 8},${v - 18},0.25)`; g.fillRect(r() * 128, r() * 512, 1 + r() * 3, 1 + r() * 6); }
  for (let y = 0; y < 512; y += 9 + r() * 6) { g.fillStyle = `rgba(60,52,44,${0.35 + r() * 0.3})`; g.fillRect(0, y, 128, 1.5 + r() * 2); g.fillStyle = 'rgba(190,180,165,0.25)'; g.fillRect(0, y + 2.5, 128, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// r6.4 flora_a: the sway displacement is shared with the swaying shadow-depth material (A map) so moving fronds cast moving
// shadows. windK = 1 reproduces the original r6.3 code exactly (map 霓港 / nature.js stay byte-identical).
export function swayGLSL(windK = 1) {
  const base = `
  float sw = aSway;
  transformed.x += sin(uTime * 1.3 + ph) * 0.12 * sw + sin(uTime * 3.1 + ph * 2.0 + position.y) * 0.04 * sw;
  transformed.z += cos(uTime * 1.1 + ph) * 0.10 * sw;
  transformed.y += sin(uTime * 2.3 + ph + position.x) * 0.05 * sw;`;
  if (windK === 1) return base;
  // A map: sea-breeze gusts (slow envelope), fronds stream downwind (+x, onshore from the ocean side is -x: breeze blows inland),
  // leaflet flutter at the tips; amplitude grows with aSway (0 at the crown -> ~1.2 at the frond tip)
  const k = windK.toFixed(2);
  return `
  float sw = aSway;
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ph * 0.05) * sin(uTime * 0.23 + 1.7 + ph * 0.031);
  transformed.x += (sin(uTime * 1.3 + ph) * 0.12 + sin(uTime * 3.1 + ph * 2.0 + position.y) * 0.04) * sw * ${k} * (0.6 + gust) - 0.10 * sw * sw * ${k} * gust;
  transformed.z += cos(uTime * 1.1 + ph) * 0.10 * sw * ${k} * (0.6 + gust) + sin(uTime * 7.3 + ph * 3.0 + position.x * 2.1) * 0.025 * sw * ${k};
  transformed.y += sin(uTime * 2.3 + ph + position.x) * 0.05 * sw * ${k} - 0.06 * sw * sw * gust * ${k};`;
}
// swaying shadow caster for alpha-tested foliage (A map): same displacement as the visible mesh
export function swayDepth(mat, windK = 1, key = 'sd') {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest || 0, side: THREE.DoubleSide });
  d.onBeforeCompile = (s) => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
#else
  float ph = 0.0;
#endif` + swayGLSL(windK));
  };
  d.customProgramCacheKey = () => 'swayD_' + key + windK.toFixed(2) + (mat.map ? 'm' : '');
  return d;
}
export const foliagePatch = (s, strength = 0.6, transK = 1, windK = 1) => {
  s.uniforms.uTime = U.uTime; s.uniforms.uSunCol = U.uSunCol; s.uniforms.uNightF = U.uNight;
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aSway;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
#else
  float ph = 0.0;
#endif` + swayGLSL(windK))
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), ${strength.toFixed(2)}));`);
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunCol; uniform float uNightF;')
    // r6.1: back faces of double-sided leaf cards get their normal bent toward the sky (still facing the viewer, so the BRDF
    // stays well-behaved): crown undersides are lit by the sky/canopy fill instead of reading as black from below
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
  if (!gl_FrontFacing) { vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); vec3 vv = normalize(vViewPosition);
    normal = normalize(normal + upV * 0.7); float nv = dot(normal, vv); if (nv < 0.12) normal = normalize(normal + vv * (0.12 - nv) * 1.5); }
#endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 vd = normalize(vViewPosition); // translucency when backlit by the sun
    vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float back = pow(clamp(dot(-vd, sunV), 0.0, 1.0), 4.0);
    // v4.1 leaf transmission: light through the blade when the sun is behind it (thin-leaf wrap), tinted yellow-green,
    // plus a sky-fill so undersides read green instead of black
    vec3 nF = normal; float trans = clamp(-dot(nF, sunV), 0.0, 1.0);
    vec3 tcol = diffuseColor.rgb * vec3(1.05, 1.25, 0.55);
    totalEmissiveRadiance += tcol * uSunCol * (back * 0.5 + trans * trans * 0.22) * ${(strength > 0 ? transK : 0).toFixed(2)} + diffuseColor.rgb * vec3(0.05, 0.065, 0.075) * (1.0 - uNightF); }`);
};

// --- v3.5 palms: three species (coconut / royal / sabal) with curved drooping pinnate or costapalmate fan fronds -----------------
// Fronds are real arching surfaces: a rachis ribbon + two drooping "wings" per frond whose alpha texture is individual leaflets
// (gaps between them), so silhouettes read as leaflets instead of flat cards. Near/far LOD swapped per instance by distance.
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.canvas = c; return t;
}
// height canvas -> tangent-space normal map
export function normalFromHeight(src, strength = 2.5) {
  const w = src.width, h = src.height; const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  return canvasTex(w, h, (g) => { const o = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength; const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4; o.data[i] = (-dx / l * 0.5 + 0.5) * 255; o.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; o.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; o.data[i + 3] = 255; }
    g.putImageData(o, 0, 0); }, false);
}
// species bark: albedo + height (rings / leaf scars / boots)
function barkTextures(kind) {
  const r = mulberry(kind === 'coco' ? 3 : kind === 'royal' ? 5 : 9); const W = 128, Hh = 512;
  const hc = document.createElement('canvas'); hc.width = W; hc.height = Hh; const hg = hc.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, Hh);
  const alb = canvasTex(W, Hh, (g) => {
    const base = kind === 'coco' ? [146, 132, 112] : kind === 'royal' ? [176, 172, 160] : [112, 96, 76];
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 5000; i++) { const v = (r() - 0.5) * 50; g.fillStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v - 4},0.22)`; g.fillRect(r() * W, r() * Hh, 1 + r() * 3, 1 + r() * 7); }
    if (kind === 'sabal') { // criss-cross leaf-base boots
      for (let y = -20; y < Hh + 20; y += 22) for (let x = -20; x < W + 20; x += 32) {
        const ox = x + ((y / 22) % 2) * 16;
        for (const [gg, col, lw] of [[hg, 'rgba(255,255,255,0.9)', 7], [g, `rgba(${base[0] + 25},${base[1] + 18},${base[2] + 8},0.9)`, 6]]) {
          gg.strokeStyle = col; gg.lineWidth = lw; gg.beginPath(); gg.moveTo(ox - 14, y + 18); gg.lineTo(ox, y - 4); gg.lineTo(ox + 14, y + 18); gg.stroke(); }
        g.fillStyle = 'rgba(40,30,22,0.75)'; g.beginPath(); g.ellipse(ox, y + 12, 6, 7, 0, 0, 6.3); g.fill();
        hg.fillStyle = 'rgba(0,0,0,0.9)'; hg.beginPath(); hg.ellipse(ox, y + 12, 6, 7, 0, 0, 6.3); hg.fill();
      }
    } else { // horizontal leaf-scar rings
      const step = kind === 'coco' ? 11 : 26;
      for (let y = 0; y < Hh; y += step + r() * step * 0.5) {
        const th = kind === 'coco' ? 2 + r() * 2.5 : 1 + r();
        g.fillStyle = `rgba(55,48,40,${kind === 'coco' ? 0.55 : 0.25})`; g.fillRect(0, y, W, th);
        g.fillStyle = 'rgba(215,205,190,0.25)'; g.fillRect(0, y + th + 1, W, 1.5);
        hg.fillStyle = 'rgba(0,0,0,0.85)'; hg.fillRect(0, y, W, th); hg.fillStyle = 'rgba(255,255,255,0.5)'; hg.fillRect(0, y + th, W, 2.5);
      }
      for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * Hh; hg.fillStyle = 'rgba(30,30,30,0.35)'; hg.fillRect(x, y, 1, 3 + r() * 10); } // vertical cracks
    }
  });
  return { map: alb, normalMap: normalFromHeight(hc, kind === 'royal' ? 1.2 : 3.0) };
}
// pinnate half-frond: u 0 = rachis -> 1 = leaflet tips, v 0 = base -> 1 = tip; leaflets angled toward the tip with gaps
export function pinnateTex() {
  const r = mulberry(41);
  return canvasTex(256, 1024, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const N = 74;
    for (let i = 0; i < N; i++) {
      const v = (i + r() * 0.4) / N; const y0 = H * (1 - v) ; const len = W * (0.86 + r() * 0.14) * (r() < 0.06 ? 0.55 : 1);
      const rise = 70 + r() * 30; const wid = 5.5 + r() * 2.5;
      const gcol = [52 + r() * 30, 92 + r() * 34, 26 + r() * 18]; const lit = 1 + (r() - 0.5) * 0.25;
      g.fillStyle = `rgb(${gcol.map((c) => Math.min(255, c * lit)).join(',')})`;
      g.beginPath(); g.moveTo(2, y0 - wid * 0.4);
      g.quadraticCurveTo(len * 0.45, y0 - rise * 0.5 - wid, len, y0 - rise); // upper edge to tip
      g.quadraticCurveTo(len * 0.5, y0 - rise * 0.45 + wid * 0.6, 2, y0 + wid * 0.6); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(190,200,120,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(3, y0); g.quadraticCurveTo(len * 0.47, y0 - rise * 0.48, len * 0.95, y0 - rise * 0.96); g.stroke();
    }
    g.fillStyle = '#a8a060'; g.fillRect(0, 0, 4, H); // rachis edge
  });
}
// costapalmate fan (sabal): polar layout, centre at bottom middle, split tips at the rim
export function fanTex() {
  const r = mulberry(17);
  return canvasTex(512, 512, (g, W, H) => {
    g.clearRect(0, 0, W, H); const cx = W / 2, cy = H - 6; const R = H - 14; const N = 46;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * (0.06 + 0.88 * i / N), a1 = Math.PI * (0.06 + 0.88 * (i + 0.82) / N); const rr = R * (0.88 + r() * 0.12);
      const c = [62 + r() * 26, 98 + r() * 30, 52 + r() * 20];
      g.fillStyle = `rgb(${c.join(',')})`; g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0) * rr * 0.62, cy - Math.sin(a0) * rr * 0.62);
      g.lineTo(cx + Math.cos(a0 + 0.004) * rr, cy - Math.sin(a0 + 0.004) * rr); // split tip
      g.lineTo(cx + Math.cos((a0 + a1) / 2) * rr * 0.7, cy - Math.sin((a0 + a1) / 2) * rr * 0.7);
      g.lineTo(cx + Math.cos(a1 - 0.004) * rr, cy - Math.sin(a1 - 0.004) * rr);
      g.lineTo(cx + Math.cos(a1) * rr * 0.62, cy - Math.sin(a1) * rr * 0.62); g.closePath(); g.fill();
      if (r() < 0.5) { g.strokeStyle = 'rgba(200,190,150,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx + Math.cos(a0) * rr, cy - Math.sin(a0) * rr); g.lineTo(cx + Math.cos(a0) * rr * 1.04, cy - Math.sin(a0) * rr * 1.04 + 8); g.stroke(); }
    }
  });
}

export function GB() { return { p: [], n: [], uv: [], i: [], c: [], s: [] }; }
export function gbBuild(o, withColor = true) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2)); if (withColor && o.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(o.s, 1)); g.setIndex(o.i); g.computeVertexNormals(); return g;
}
// one pinnate frond: rachis ribbon + two drooping leaflet wings
export function addFrond(F, top, az, L, up, droop, S, tint, opts = {}) {
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)); const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const P = (t) => top.clone().addScaledVector(dir, L * t * (1 - 0.18 * t * t)).add(new THREE.Vector3(0, L * (up * t - droop * t * t), 0));
  const wingDrop = opts.wingDrop ?? 0.55, maxW = opts.maxW ?? 1.0, plume = opts.plume ?? 0;
  for (const sg of [-1, 1]) {
    const base = F.p.length / 3;
    for (let k = 0; k <= S; k++) {
      const t = k / S; const pos = P(t); const nxt = P(Math.min(1, t + 0.02)); const tang = nxt.sub(P(Math.max(0, t - 0.02))).normalize();
      const nrm = new THREE.Vector3().crossVectors(side, tang).normalize(); if (nrm.y < 0) nrm.negate();
      const w = maxW * (0.12 + Math.pow(Math.sin(Math.min(1, t * 1.15 + 0.04) * Math.PI), 0.7) * (1 - 0.45 * t)) * (t < 0.06 ? t / 0.06 : 1);
      const drop = wingDrop * (0.5 + t * 0.7);
      // cross-section: rachis -> mid -> tip, wings hang down (inverted V), royal palms add an upward plume
      for (const f of [0, 0.5, 1]) {
        const q = pos.clone().addScaledVector(side, sg * w * f).addScaledVector(nrm, -w * (drop * f * f) + plume * w * f * (1 - f) * 2);
        F.p.push(q.x, q.y, q.z); F.uv.push(f * 0.98 + 0.01, t); F.c.push(...tint); F.s.push(t * (0.6 + f * 0.6));
      }
    }
    for (let k = 0; k < S; k++) for (let j = 0; j < 2; j++) { const a = base + k * 3 + j, b = a + 3; if (sg > 0) F.i.push(a, b, a + 1, b, b + 1, a + 1); else F.i.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  // rachis: thin vertical ribbon pair (reads as a stem from below and the side)
  if (opts.rachis !== false) {
    const base = F.p.length / 3; const rc = [0.78, 0.74, 0.5];
    for (let k = 0; k <= S; k++) { const t = k / S; const pos = P(t); const th = 0.07 * (1 - t * 0.8);
      for (const sg of [-1, 1]) { const q = pos.clone().addScaledVector(side, sg * th); F.p.push(q.x, q.y + th * 0.6, q.z); F.uv.push(0.004, t); F.c.push(...rc); F.s.push(t); } }
    for (let k = 0; k < S; k++) { const a = base + k * 2; F.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
}
// costapalmate fan leaf on a petiole
function addFan(F, top, az, L, up, R, S, tint) {
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)); const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const c = top.clone().addScaledVector(dir, L).add(new THREE.Vector3(0, L * up, 0));
  const fdir = dir.clone().add(new THREE.Vector3(0, up * 0.6 + 0.35, 0)).normalize(); // fan "forward" (radial axis)
  const fnrm = new THREE.Vector3().crossVectors(side, fdir).normalize(); if (fnrm.y < 0) fnrm.negate();
  const base = F.p.length / 3; const NA = 14, NR = S;
  for (let ir = 0; ir <= NR; ir++) for (let ia = 0; ia <= NA; ia++) {
    const rr = ir / NR; const a = (ia / NA - 0.5) * Math.PI * 0.88;
    const fold = (ia % 2 ? 1 : -1) * 0.07 * R * rr; const sag = -rr * rr * R * (0.35 + Math.abs(a) * 0.5); // costapalmate curl + droop
    const q = c.clone().addScaledVector(side, Math.sin(a) * R * rr).addScaledVector(fdir, Math.cos(a) * R * rr).addScaledVector(fnrm, fold + sag * 0.7).add(new THREE.Vector3(0, sag * 0.3, 0));
    F.p.push(q.x, q.y, q.z); F.uv.push(0.5 + Math.sin(a) * rr * 0.48, 0.012 + Math.cos(a) * rr * 0.97); F.c.push(...tint); F.s.push(0.4 + rr * 0.8);
  }
  for (let ir = 0; ir < NR; ir++) for (let ia = 0; ia < NA; ia++) { const a = base + ir * (NA + 1) + ia, b = a + NA + 1; F.i.push(a, b, a + 1, b, b + 1, a + 1); }
  // petiole ribbon
  const pb = F.p.length / 3;
  for (let k = 0; k <= 4; k++) { const t = k / 4; const q = top.clone().lerp(c, t); for (const sg of [-1, 1]) { const qq = q.clone().addScaledVector(side, sg * 0.05); F.p.push(qq.x, qq.y, qq.z); F.uv.push(0.5, 0.004); F.c.push(0.7, 0.68, 0.45); F.s.push(t * 0.4); } }
  for (let k = 0; k < 4; k++) { const a = pb + k * 2; F.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}

const SPECIES = {
  coco: { H: 11, curve: 1.4, nF: 22, L: [4.0, 5.2], up: [0.55, 1.0], droop: [1.2, 1.9], wingDrop: 0.7, maxW: 0.95, plume: 0, shaft: 0, nuts: true },
  royal: { H: 13, curve: 0.08, nF: 15, L: [3.6, 4.4], up: [0.9, 1.5], droop: [1.0, 1.5], wingDrop: 0.25, maxW: 0.85, plume: 0.35, shaft: 2.6, nuts: false },
  sabal: { H: 9, curve: 0.18, nF: 30, fan: true, L: [1.0, 1.6], up: [-0.3, 1.2], shaft: 0, nuts: false },
};
function palmGeometry(kind, seed, lod) {
  const sp = SPECIES[kind]; const r = mulberry(seed); const H = sp.H;
  const N = lod ? 6 : 16, R = lod ? 6 : 12;
  const pts = []; for (let k = 0; k <= N; k++) { const t = k / N; pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 0.5) * sp.curve * (0.6 + t), t * H, 0)); }
  const T = GB();
  for (let k = 0; k <= N; k++) {
    const t = k / N; const c = pts[k];
    let rad = kind === 'royal' ? 0.24 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.3)) : kind === 'coco' ? 0.16 + 0.07 * (1 - t) : 0.22 + 0.02 * (1 - t);
    rad += 0.22 * Math.exp(-t * H * 1.6); // root flare
    for (let j = 0; j <= R; j++) { const a = j / R * Math.PI * 2; T.p.push(c.x + Math.cos(a) * rad, c.y, c.z + Math.sin(a) * rad); T.uv.push(j / R, c.y / (kind === 'royal' ? 4 : 2.4)); T.s.push(Math.max(0, t - 0.6) * 0.5); }
  }
  for (let k = 0; k < N; k++) for (let j = 0; j < R; j++) { const a = k * (R + 1) + j, b = a + R + 1; T.i.push(a, b, a + 1, b, b + 1, a + 1); }
  const trunk = gbBuild(T, false);
  let top = pts[N].clone();
  // crown: royal crownshaft (smooth green column), coconut nut cluster, leaf-base knob for all
  const C = GB(); const crownParts = [];
  if (sp.shaft) { const cg = new THREE.CylinderGeometry(0.2, 0.27, sp.shaft, lod ? 6 : 14, 1); cg.translate(top.x, top.y + sp.shaft / 2 - 0.1, top.z); crownParts.push(cg); top = top.clone().add(new THREE.Vector3(0, sp.shaft - 0.25, 0)); }
  const knob = new THREE.SphereGeometry(kind === 'sabal' ? 0.42 : 0.3, lod ? 6 : 12, lod ? 4 : 8); knob.scale(1, 0.9, 1); knob.translate(top.x, top.y - 0.1, top.z); crownParts.push(knob);
  if (sp.nuts && !lod) for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = 0.28 + r() * 0.12; const s = new THREE.SphereGeometry(0.14 + r() * 0.03, 8, 6); s.scale(1, 1.15, 1); s.translate(top.x + Math.cos(a) * d, top.y - 0.35 - r() * 0.3, top.z + Math.sin(a) * d); crownParts.push(s); }
  const crown = mergeSimple(crownParts); crown.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(crown.attributes.position.count).fill(0.35), 1));
  // fronds
  const F = GB(); const S = lod ? 5 : 12; const nF = lod ? Math.ceil(sp.nF * 0.7) : sp.nF;
  for (let f = 0; f < nF; f++) {
    const az = f * 2.39996 + r() * 0.25; // golden-angle phyllotaxis
    const age = f / nF; // older fronds lower and droopier
    const dead = !lod && kind !== 'royal' && f % 9 === 7;
    const tint = dead ? [0.9, 0.62, 0.36] : [0.82 + r() * 0.2 - age * 0.1, 0.92 + r() * 0.12, 0.8 + r() * 0.15];
    if (sp.fan) { addFan(F, top.clone().add(new THREE.Vector3(0, -0.1 - age * 0.4, 0)), az, sp.L[0] + r() * (sp.L[1] - sp.L[0]), sp.up[1] - age * (sp.up[1] - sp.up[0]) - (dead ? 1.2 : 0), 1.25 + r() * 0.3, lod ? 2 : 4, tint); continue; }
    const L = sp.L[0] + r() * (sp.L[1] - sp.L[0]);
    const up = dead ? -0.9 : sp.up[1] - age * (sp.up[1] - sp.up[0]);
    const droop = dead ? 0.4 : sp.droop[0] + r() * (sp.droop[1] - sp.droop[0]) + age * 0.3;
    addFrond(F, top.clone().add(new THREE.Vector3(0, -age * 0.25, 0)), az, dead ? L * 0.8 : L, up, droop, S, tint, { wingDrop: dead ? 1.2 : sp.wingDrop, maxW: dead ? 0.55 : sp.maxW, plume: sp.plume, rachis: !lod });
  }
  const fronds = gbBuild(F);
  return { trunk, fronds, crown, H: H + (sp.shaft || 0) };
}

// v3.5 broadleaf tree: real branching skeleton (trunk -> 3-5 curved limbs -> 2-3 sub-branches, tapered tubes) with leaf
// clumps (clusters of cards) at the branch tips, so the crown is an irregular cloud of clumps with sky gaps and visible
// limbs underneath instead of one card ball. kind 'oak' = wide spreading live oak, 'grape' = rounder sea-grape / gumbo-limbo.
function treeGeometry(seed, kind = 'oak', lod = false) {
  const r = mulberry(seed);
  const cards = { p: [], n: [], uv: [], i: [], s: [], c: [] };
  const tubes = [];
  const tube = (pts, r0, r1) => {
    const curve = new THREE.CatmullRomCurve3(pts); const segs = lod ? 2 : 3; const g = new THREE.TubeGeometry(curve, segs, 1, lod ? 4 : 6, false); const RS = (lod ? 4 : 6) + 1;
    // taper radius along the tube
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { const ring = Math.floor(i / RS); const t = ring / segs; const c = curve.getPointAt(Math.min(1, t)); const rad = r0 + (r1 - r0) * t;
      P.setXYZ(i, c.x + N.getX(i) * rad, c.y + N.getY(i) * rad, c.z + N.getZ(i) * rad); }
    tubes.push(g);
  };
  const clump = (C, R, nCards, g0) => {
    if (lod) { nCards = Math.ceil(nCards * 0.35); }
    for (let k = 0; k < nCards; k++) {
      const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1) * 0.85; const rr = Math.pow(r(), 0.5) * R;
      const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * 0.6, Math.sin(v) * Math.sin(u) * rr).add(C);
      const nrm = p.clone().sub(C).add(new THREE.Vector3(0, R * 0.5, 0)).normalize();
      const s = ((kind === 'grape' ? 0.75 : 0.6) + r() * 0.45) * (lod ? 1.55 : 1);
      const a = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const t1 = new THREE.Vector3().crossVectors(nrm, a).normalize(), t2 = new THREE.Vector3().crossVectors(nrm, t1).normalize();
      const base = cards.p.length / 3; const g = g0 * (0.85 + r() * 0.3) * (0.85 + 0.3 * Math.max(0, nrm.y)); // darker inner/under leaves
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = p.clone().addScaledVector(t1, i * s).addScaledVector(t2, j * s);
        cards.p.push(q.x, q.y, q.z); cards.n.push(nrm.x, nrm.y, nrm.z); cards.uv.push((i + 1) / 2, (j + 1) / 2); cards.s.push(0.25); cards.c.push(g * 0.95, g, g * 0.88); }
      cards.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  const trunkH = kind === 'oak' ? 2.2 + r() * 0.8 : 1.6 + r() * 0.6;
  const lean = new THREE.Vector3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
  const top = new THREE.Vector3(0, trunkH, 0).add(lean);
  tube([new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(lean.x * 0.3, trunkH * 0.5, lean.z * 0.3), top], 0.3, 0.2);
  const nL = kind === 'oak' ? 4 + Math.floor(r() * 2) : 3 + Math.floor(r() * 2);
  for (let l = 0; l < nL; l++) {
    const az = l / nL * Math.PI * 2 + r() * 0.6; const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const spread = kind === 'oak' ? 2.4 + r() * 1.4 : 1.4 + r() * 0.8; const rise = kind === 'oak' ? 1.6 + r() * 1.2 : 2.0 + r() * 1.0;
    const mid = top.clone().addScaledVector(out, spread * 0.45).add(new THREE.Vector3(0, rise * 0.6, 0));
    const end = top.clone().addScaledVector(out, spread).add(new THREE.Vector3(0, rise, 0));
    tube([top.clone().add(new THREE.Vector3(0, -0.3, 0)), mid, end], 0.16, 0.07);
    const nS = 3 + Math.floor(r() * 2);
    for (let s = 0; s < nS; s++) {
      const a2 = az + (r() - 0.5) * 1.6; const o2 = new THREE.Vector3(Math.cos(a2), 0, Math.sin(a2));
      const st = mid.clone().lerp(end, 0.3 + r() * 0.6);
      const e2 = st.clone().addScaledVector(o2, 0.9 + r() * 1.3).add(new THREE.Vector3(0, 0.5 + r() * 1.0, 0));
      if (!lod) tube([st, st.clone().lerp(e2, 0.5).add(new THREE.Vector3(0, 0.15, 0)), e2], 0.06, 0.025);
      clump(e2.clone().add(new THREE.Vector3(0, 0.35, 0)), 1.1 + r() * 0.5, kind === 'oak' ? 15 : 16, 1.0);
    }
    clump(end.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.3 + r() * 0.5, 16, 1.05);
    clump(mid.clone().add(new THREE.Vector3(0, 0.7, 0)), 1.2, 10, 0.85); // inner fill
  }
  clump(top.clone().add(new THREE.Vector3(0, (kind === 'oak' ? 2.6 : 3.0), 0)), 1.9, 22, 1.1); // crown top
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cards.p, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(cards.n, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(cards.uv, 2)); cg.setAttribute('aSway', new THREE.Float32BufferAttribute(cards.s, 1));
  cg.setAttribute('color', new THREE.Float32BufferAttribute(cards.c, 3)); cg.setIndex(cards.i);
  const tg = mergeSimple(tubes); tg.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(tg.attributes.position.count).map((_, i) => Math.max(0, tg.attributes.position.getY(i) - trunkH) * 0.04), 1));
  return { trunk: tg, leaves: cg };
}
// v3.5 shrubs: 3-4 overlapping sub-clumps (irregular mound, not a ball); flowering variant tints bract cards magenta/coral
function shrubGeometry(seed, flower = 0) {
  const r = mulberry(seed); const cards = { p: [], n: [], uv: [], i: [], s: [], c: [] };
  const nC = 3 + Math.floor(r() * 2);
  for (let cI = 0; cI < nC; cI++) {
    const cu = r() * Math.PI * 2, cd = r() * 0.55; const C = new THREE.Vector3(Math.cos(cu) * cd, 0.35 + r() * 0.35, Math.sin(cu) * cd); const R = 0.45 + r() * 0.3;
    for (let k = 0; k < 9; k++) {
      const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1) * 0.8; const rr = Math.sqrt(r()) * R;
      const p = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * 0.7, Math.sin(v) * Math.sin(u) * rr).add(C);
      const nrm = p.clone().sub(new THREE.Vector3(0, 0.1, 0)).normalize(); const a = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const t1 = new THREE.Vector3().crossVectors(nrm, a).normalize(), t2 = new THREE.Vector3().crossVectors(nrm, t1).normalize();
      const sz = 0.38 + r() * 0.25; const base = cards.p.length / 3; const g = 0.75 + r() * 0.3;
      const fl = flower && r() < 0.4 && p.y > 0.4; const col = fl ? (flower === 1 ? [1.9, 0.45, 1.1] : [2.0, 0.75, 0.5]) : [g * 0.9, g, g * 0.85];
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = p.clone().addScaledVector(t1, i * sz).addScaledVector(t2, j * sz); cards.p.push(q.x, Math.max(0.02, q.y), q.z); cards.n.push(nrm.x, nrm.y, nrm.z); cards.uv.push((i + 1) / 2, (j + 1) / 2); cards.s.push(0.1); cards.c.push(...col); }
      cards.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(cards.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(cards.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(cards.uv, 2)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(cards.s, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cards.c, 3)); g.setIndex(cards.i);
  return g;
}
export function mergeSimple(gs) {
  const out = new THREE.BufferGeometry(); const p = [], n = [], uv = [], idx = []; let off = 0;
  for (const g0 of gs) { const g = g0.index ? g0 : g0; const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(UV.getX(i), UV.getY(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(off + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(off + i);
    off += P.count; }
  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
  return out;
}

export function buildVegetation(scene, city, T) {
  T.frond.colorSpace = THREE.SRGBColorSpace; T.leafcluster.colorSpace = THREE.SRGBColorSpace; T.frond.anisotropy = 4;
  const A = !CYBER; // r6.4 flora_a: map A gets wind gusts + swaying shadows + the coastal flora layer; map 霓港 unchanged
  const leafMat = prep(new THREE.MeshStandardMaterial({ map: T.leafcluster, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true, color: new THREE.Color().setRGB(1.6, 1.65, 1.35) }), A ? 'leafA' : 'leaf', (s) => foliagePatch(s, 0.55, 1, A ? 1.4 : 1));
  const barkMat = prep(new THREE.MeshStandardMaterial({ map: T.bark_d, roughness: 0.95, color: 0x9a8f80 }), 'tbark', (s) => foliagePatch(s, 0.0));
  // v3.5 palms: species by location (beach/promenade -> coconut, streets -> royal / sabal mix, parks mixed); near/far LOD
  const frondTex = pinnateTex(), fanT = fanTex();
  const mkFrondMat = (map) => prep(new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true, color: new THREE.Color().setRGB(1.25, 1.22, 1.05) }), A ? 'frondA' : 'frond', (s) => foliagePatch(s, 0.35, 1, A ? 2.3 : 1));
  const frondMat = mkFrondMat(frondTex), fanMat = mkFrondMat(fanT);
  const barks = { coco: barkTextures('coco'), royal: barkTextures('royal'), sabal: barkTextures('sabal') };
  const trunkMats = {}; for (const k in barks) trunkMats[k] = prep(new THREE.MeshStandardMaterial({ map: barks[k].map, normalMap: barks[k].normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.92, color: 0xffffff }), 'ptrunk', (s) => foliagePatch(s, 0.0));
  const crownMats = { coco: prep(new THREE.MeshStandardMaterial({ color: 0x6f6236, roughness: 0.75 }), 'pcrown', (s) => foliagePatch(s, 0.0)),
    royal: prep(new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.35 }), 'pcrown', (s) => foliagePatch(s, 0.0)),
    sabal: prep(new THREE.MeshStandardMaterial({ color: 0x5a4c34, roughness: 0.9 }), 'pcrown', (s) => foliagePatch(s, 0.0)) };
  const depthFor = (mat) => A ? swayDepth(mat, mat === leafMat ? 1.4 : 2.3, mat === leafMat ? 'leaf' : 'frond') : new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.42, side: THREE.DoubleSide });
  // A map: trunks/crowns sway too (aSway > 0 near the top) -> their shadows follow (opaque depth, no alpha map)
  const trunkDepth = A ? swayDepth({ map: null, alphaTest: 0 }, 1, 'trunk') : null;
  const XT = A ? floraExtras(city) : { palms: [], trees: [] }; // hammock palms / trees on the natural island ends (not added to city.*)
  const kinds = [['coco', 11], ['coco', 23], ['royal', 37], ['royal', 41], ['sabal', 53]];
  const variants = kinds.map(([k, sd]) => ({ k, near: palmGeometry(k, sd, false), far: palmGeometry(k, sd, true) }));
  const groups = variants.map(() => []);
  const palmList = A ? city.palms.concat(XT.palms) : city.palms;
  for (const p of palmList) {
    const hsh = Math.abs(Math.sin(p.x * 12.9 + p.z * 78.2)) * 1000 % 1;
    const beach = p.x > 300 || p.lean > 0.04 || p.lean < -0.04 && !p.street;
    let vi; if (beach) vi = hsh < 0.5 ? 0 : 1; else if (p.street) vi = hsh < 0.55 ? (hsh < 0.27 ? 2 : 3) : hsh < 0.85 ? 4 : 1; else vi = Math.floor(hsh * 5) % 5;
    groups[vi].push(p);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const out = []; const lodSets = [];
  variants.forEach((v, vi) => {
    const list = groups[vi]; if (!list.length) return;
    const fm = v.k === 'sabal' ? fanMat : frondMat;
    const mk = (geo, mat, cast = true) => { const im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = cast; im.receiveShadow = true; if (mat.alphaTest) im.customDepthMaterial = depthFor(mat); else if (trunkDepth) im.customDepthMaterial = trunkDepth; im.frustumCulled = false; scene.add(im); out.push(im); return im; };
    const set = { near: [mk(v.near.trunk, trunkMats[v.k]), mk(v.near.fronds, fm), mk(v.near.crown, crownMats[v.k])], far: [mk(v.far.trunk, trunkMats[v.k]), mk(v.far.fronds, fm), mk(v.far.crown, crownMats[v.k], false)], mats: [], pos: [] };
    list.forEach((p) => {
      const s = p.h / v.near.H;
      q.setFromEuler(new THREE.Euler(p.lean * (v.k === 'coco' ? 1.6 : 0.4), p.rot, 0)); sc.set(s * 0.95 * (p.s || 1), s, s * 0.95 * (p.s || 1));
      pos.set(p.x, city.groundH(p.x, p.z) - 0.05, p.z); m4.compose(pos, q, sc); set.mats.push(m4.clone()); set.pos.push([p.x, p.z, p.far2 || 0]);
    });
    lodSets.push(set);
  });
  // distribute instances to near/far meshes around the camera (cheap: a few thousand matrix copies, every ~0.4 s)
  const NEAR2 = 75 * 75, FAR2 = CYBER ? 900 * 900 : Infinity; // r6.0: far cull only on map 霓港 (thousands of palms) let lastX = 1e9, lastZ = 1e9;
  const updateLod = (cx, cz, force) => {
    if (!force && Math.hypot(cx - lastX, cz - lastZ) < 12) return; lastX = cx; lastZ = cz;
    for (const set of lodSets) {
      let nn = 0, nf = 0;
      for (let i = 0; i < set.mats.length; i++) {
        const d = (set.pos[i][0] - cx) ** 2 + (set.pos[i][1] - cz) ** 2; if (d > FAR2 || (set.pos[i][2] && d > set.pos[i][2])) continue; const arr = d < NEAR2 ? set.near : set.far; const idx = d < NEAR2 ? nn++ : nf++;
        for (const im of arr) im.setMatrixAt(idx, set.mats[i]);
      }
      for (const im of set.near) { im.count = nn; im.instanceMatrix.needsUpdate = true; }
      for (const im of set.far) { im.count = nf; im.instanceMatrix.needsUpdate = true; }
    }
  };
  updateLod(280, 30, true);
  out.update = (camPos) => updateLod(camPos.x, camPos.z, false);
  // trees
  const seeds = [[5, 'oak'], [9, 'grape'], [13, 'oak'], [21, 'grape']];
  const tv = seeds.map(([sd, k]) => ({ near: treeGeometry(sd, k, false), far: treeGeometry(sd, k, true) }));
  const tg = [[], [], [], []]; (A ? city.trees.concat(XT.trees) : city.trees).forEach((t) => tg[Math.floor(Math.abs(Math.sin(t.x * 3.7 + t.z * 1.3)) * 997) % 4].push(t));
  tv.forEach((v, vi) => {
    const list = tg[vi]; if (!list.length) return;
    const mk = (geo, mat, alpha) => { const im = new THREE.InstancedMesh(geo, mat, list.length); if (alpha) im.customDepthMaterial = depthFor(mat); else if (trunkDepth) im.customDepthMaterial = trunkDepth; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); out.push(im); return im; };
    const set = { near: [mk(v.near.trunk, barkMat), mk(v.near.leaves, leafMat, true)], far: [mk(v.far.trunk, barkMat), mk(v.far.leaves, leafMat, true)], mats: [], pos: [] };
    list.forEach((t) => { q.setFromEuler(new THREE.Euler(0, t.x * 3.1, 0)); sc.setScalar(t.s); pos.set(t.x, city.groundH(t.x, t.z), t.z); m4.compose(pos, q, sc); set.mats.push(m4.clone()); set.pos.push([t.x, t.z, t.far2 || 0]); });
    lodSets.push(set);
  });
  updateLod(280, 30, true);
  // shrubs
  const shrubList = A ? city.shrubs.filter((t) => !t.mangrove) : city.shrubs; // A: bay-edge mangrove thickets are real mangroves now (flora.js)
  if (shrubList.length) {
    const sv = [shrubGeometry(3, 0), shrubGeometry(7, 1), shrubGeometry(11, 0), shrubGeometry(19, 2)]; const sg = [[], [], [], []];
    shrubList.forEach((t) => sg[Math.floor(Math.abs(Math.sin(t.x * 5.1 + t.z * 2.3)) * 991) % 4].push(t));
    sv.forEach((g, vi) => { const list = sg[vi]; if (!list.length) return; const im = new THREE.InstancedMesh(g, leafMat, list.length); im.receiveShadow = true; im.castShadow = true; im.customDepthMaterial = depthFor(leafMat);
      list.forEach((t, i) => { q.setFromEuler(new THREE.Euler(0, t.x, 0)); sc.set(t.s * 1.3, t.s, t.s * 1.3); pos.set(t.x, city.groundH(t.x, t.z), t.z); m4.compose(pos, q, sc); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere(); scene.add(im); out.push(im); });
  }
  if (A) { // r6.4 flora_a: coastal layer (dune grass + hummocks, sea grape, saw palmetto, mangroves + marsh, hedges, coastal rock)
    const fl = buildFloraA(scene, city, { T, leafMat, frondMat, fanMat, fanT, mangroves: city.shrubs.filter((t) => t.mangrove) });
    out.flora = fl; const upd = out.update; out.update = (camPos) => { upd(camPos); fl.update(camPos); };
  }
  return out;
}
