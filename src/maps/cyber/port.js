// r6.4 (b_port) 霓港「货柜港」岸线近景 — original cyberpunk container terminal along the port island's south quay.
// Everything sits in one local quay frame (u along the quay edge, +v inland, water at v < 0) that is rotated onto the shore.
//  * containers: ONE InstancedMesh for every box (yard blocks, ship deck, chassis, rail flats, crane spreaders) — 12 tris each,
//    livery / rust / corrugation / door ends from a procedural atlas (8 invented lines, BIC-style codes, no real brands)
//  * ship-to-shore cranes (portal legs + bogies, sill beams with hazard stripes, box-girder boom + backreach, A-frame and
//    forestays, trolley, cab, hoist ropes + spreader, machinery house with a lit sign, stair tower, festoon cables, lights)
//  * a berthed box ship: lofted hull (bow flare, stern, bilge) with a painted hull strip (antifouling, boot top, draft marks,
//    rust runs, name), hatch covers, lashing bridges, deck stacks with gaps where the cranes work, accommodation block,
//    bridge wings, funnel, masts, lifeboat, mooring lines to the bollards
//  * quay ground: crane rails, on-dock rail siding with sleepers, lane / bay markings with painted stack numbers,
//    fenders + bollards on the edge, puddles (glossy 'puddle'), night light pools; static straddle carriers, reach stackers,
//    terminal tractors, forklifts, light masts
// LOD: 'base' (containers, hull, superstructure, crane proxies) is built the first time the camera comes within BASE_R and kept;
// 'near' (detailed cranes, ship gear, ground, props, cones) is built within NEAR_R and disposed beyond FAR_R; small parts go to
// 'vcolD' meshes hidden beyond DETAIL_R. The crane proxies hide while the near cranes exist.
import * as THREE from 'three';
import { World, box, polyCap, prismWalls } from '../../geo.js';
import { withSeed, rng, rand, randi, pick, mulberry } from '../../util.js';
import { kg, beam, tube, put, cable, DARK, STEEL } from './kit.js';
import { U } from '../../env.js';
import { envAdopt, prep } from '../../mats.js';
import { OLDENV2 } from '../../envprog.js'; // b_envprog2
import { coneMatU } from './bldglayer.js';

export const QUAY = { x: -1150, z: -1000, th: -0.0555, u0: -266, u1: 266 }; // edge (-1420,-1015)-(-880,-985) of LANDS.port
const BASE_R = 2600, NEAR_R = 650, FAR_R = 850, DETAIL_R = 260;
const CH = 90;
const cT = Math.cos(QUAY.th), sT = Math.sin(QUAY.th);
export function quayToWorld(u, v) { return [QUAY.x + u * cT + v * sT, QUAY.z - u * sT + v * cT]; }

// ------------------------------------------------------------------ liveries ----
// 8 invented lines (name, colour, text colour, BIC-style owner code). Rows of the atlas, top to bottom.
const LINES = [
  { n: 'NEOPORT', cn: '霓港航运', c: '#8a2a1e', t: '#f2efe8', code: 'NPLU', logo: 0 },
  { n: 'TIDERUNNER', cn: '', c: '#1b3157', t: '#e9eef5', code: 'TDRU', logo: 1 },
  { n: 'AXIOM', cn: '轴心物流', c: '#c8681a', t: '#1a1a1a', code: 'AXMU', logo: 2 },
  { n: 'KUROSHIO-X', cn: '', c: '#24533c', t: '#f0f0e6', code: 'KRXU', logo: 3 },
  { n: 'BLUWHAL', cn: '蓝鲸联运', c: '#4b84ad', t: '#ffffff', code: 'BWHU', logo: 4 },
  { n: 'HYPERION', cn: '', c: '#7d7f80', t: '#141414', code: 'HYPU', logo: 2 },
  { n: 'ORCA FREIGHT', cn: '', c: '#d6d3cb', t: '#1b1d20', code: 'ORCU', logo: 4 },
  { n: 'SYNTHCO', cn: '合成集运', c: '#5d2453', t: '#ff7ad9', code: 'SYNU', logo: 1 },
];
const NROW = LINES.length;
function logo(g, k, x, y, s, col) {
  g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * 0.12;
  if (k === 0) { g.beginPath(); g.arc(0, 0, s * 0.45, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-s * 0.3, s * 0.1); g.quadraticCurveTo(-s * 0.1, -s * 0.15, 0, s * 0.05); g.quadraticCurveTo(s * 0.12, s * 0.22, s * 0.3, -s * 0.05); g.stroke(); }
  else if (k === 1) { g.beginPath(); g.moveTo(0, -s * 0.48); g.lineTo(s * 0.45, s * 0.38); g.lineTo(-s * 0.45, s * 0.38); g.closePath(); g.stroke(); g.fillRect(-s * 0.08, -s * 0.05, s * 0.16, s * 0.3); }
  else if (k === 2) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.lineTo(Math.cos(a) * s * 0.46, Math.sin(a) * s * 0.46); } g.closePath(); g.stroke(); g.fillRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.4); }
  else if (k === 3) { for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.45, -s * 0.25 + i * s * 0.25); g.bezierCurveTo(-s * 0.15, -s * 0.45 + i * s * 0.25, s * 0.15, -s * 0.05 + i * s * 0.25, s * 0.45, -s * 0.25 + i * s * 0.25); g.stroke(); } }
  else { g.beginPath(); g.ellipse(0, 0, s * 0.46, s * 0.28, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#00000088'; g.beginPath(); g.moveTo(s * 0.46, 0); g.lineTo(s * 0.6, -s * 0.2); g.lineTo(s * 0.6, s * 0.2); g.fill(); }
  g.restore();
}
function rustDabs(g, r, x0, y0, w, h, n, amt) {
  for (let i = 0; i < n; i++) { const x = x0 + r() * w, y = y0 + r() * h, rw = 2 + r() * 10 * amt, rh = 2 + r() * 6;
    g.fillStyle = `rgba(${90 + r() * 50 | 0},${42 + r() * 20 | 0},${18 + r() * 10 | 0},${0.25 + r() * 0.5})`; g.fillRect(x, y, rw, rh);
    if (r() < 0.5) { const sl = 6 + r() * 40; const gr = g.createLinearGradient(0, y, 0, y + sl); gr.addColorStop(0, 'rgba(100,48,20,0.45)'); gr.addColorStop(1, 'rgba(100,48,20,0)'); g.fillStyle = gr; g.fillRect(x + rw * 0.3, y, 1 + r() * 3, sl); } }
}
// container atlas: 1024 x 1024, 8 rows of 128 px; per row [0, 768) long side (12.2 m), [768, 1024) door end
function containerAtlas() {
  const N = 1024, RH = N / NROW, SW = 768; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const r = mulberry(5150);
  LINES.forEach((L, row) => {
    const y0 = row * RH;
    g.fillStyle = L.c; g.fillRect(0, y0, N, RH);
    // corrugation shading (vertical bands; the shader adds the real ribs) + top / bottom rails
    for (let x = 0; x < SW; x += 6) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, y0, 2, RH); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 3, y0, 1, RH); }
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, y0, N, 7); g.fillRect(0, y0 + RH - 9, N, 9);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y0, 9, RH); g.fillRect(SW - 9, y0, 9, RH);
    // name (centred in the middle third so the 20 ft half-crops keep it), sub name, logo
    g.save(); g.fillStyle = L.t; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.font = `bold ${L.n.length > 9 ? 46 : 56}px Arial, sans-serif`; g.save(); g.translate(SW * 0.5, y0 + RH * 0.47); g.scale(0.82, 1.25); g.fillText(L.n, 0, 0); g.restore();
    if (L.cn) { g.font = 'bold 22px sans-serif'; g.fillText(L.cn, SW * 0.5, y0 + RH * 0.82); }
    logo(g, L.logo, SW * 0.17, y0 + RH * 0.5, 46, L.t);
    // BIC-style code, size/type, max gross block (top right), stripe of hazard labels sometimes
    g.textAlign = 'left'; g.font = 'bold 15px monospace'; g.fillText(`${L.code} ${String(100000 + ((r() * 899999) | 0))} ${(r() * 9) | 0}`, SW - 190, y0 + 22); g.font = '12px monospace'; g.fillText('45G1', SW - 190, y0 + 40);
    g.restore();
    // weathering: rust dabs and runs, dents (darker blotches), faded patches, grime at the bottom
    rustDabs(g, r, 6, y0 + 4, SW - 12, RH - 14, 60, 1);
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * SW, y0 + 15 + r() * (RH - 30), 8 + r() * 26, 5 + r() * 16, 0, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`; g.fillRect(r() * SW, y0 + r() * RH * 0.5, 30 + r() * 90, 18 + r() * 40); }
    const gb = g.createLinearGradient(0, y0 + RH * 0.6, 0, y0 + RH); gb.addColorStop(0, 'rgba(40,30,20,0)'); gb.addColorStop(1, 'rgba(40,30,20,0.45)'); g.fillStyle = gb; g.fillRect(0, y0 + RH * 0.6, SW, RH * 0.4);
    // door end: two leaves, 4 locking rods with cams, hinges, code + logo, CSC plate
    const dx = SW, dw = N - SW; g.fillStyle = L.c; g.fillRect(dx, y0, dw, RH);
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(dx, y0, dw, 8); g.fillRect(dx, y0 + RH - 10, dw, 10); g.fillRect(dx, y0, 10, RH); g.fillRect(N - 10, y0, 10, RH); g.fillRect(dx + dw / 2 - 1.5, y0, 3, RH);
    for (const fx of [0.17, 0.37, 0.63, 0.83]) { const x = dx + dw * fx; g.fillStyle = 'rgba(25,25,25,0.85)'; g.fillRect(x - 2, y0 + 10, 4, RH - 20); g.fillStyle = 'rgba(200,200,200,0.5)'; g.fillRect(x - 1, y0 + 10, 1, RH - 20);
      for (const yy of [0.12, 0.88]) { g.fillStyle = '#222'; g.fillRect(x - 5, y0 + RH * yy - 3, 10, 6); } g.fillStyle = '#333'; g.fillRect(x - 6, y0 + RH * 0.55, 12, 5); }
    for (const fy of [0.15, 0.4, 0.65, 0.88]) { g.fillStyle = '#1d1d1d'; g.fillRect(dx + 3, y0 + RH * fy - 4, 9, 8); g.fillRect(N - 12, y0 + RH * fy - 4, 9, 8); }
    g.fillStyle = L.t; g.font = 'bold 13px monospace'; g.fillText(L.code, dx + dw * 0.56, y0 + 26); g.font = '11px monospace'; g.fillText(String(1000 + ((r() * 8999) | 0)) + ' 22G1', dx + dw * 0.56, y0 + 42);
    logo(g, L.logo, dx + dw * 0.27, y0 + RH * 0.3, 26, L.t);
    g.fillStyle = '#c9c4b5'; g.fillRect(dx + dw * 0.08, y0 + RH * 0.62, 22, 14);
    rustDabs(g, r, dx + 6, y0 + 4, dw - 12, RH - 12, 22, 0.8);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return t;
}

let CMAT = null;
function containerMat() {
  if (CMAT) return CMAT;
  CMAT = prep(new THREE.MeshStandardMaterial({ map: containerAtlas(), roughness: 0.62, metalness: 0.35 }), 'portbox', (s) => {
    s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute float aFace; attribute vec4 aLiv; varying float vFace; varying vec3 vLP; varying vec4 vLiv; varying vec3 vRib; varying vec3 vQP;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  { vec2 cu = uv; float row = aLiv.x;
    if (aFace < 0.5) cu = vec2((uv.x * aLiv.y + aLiv.z) * 0.75, uv.y);
    else if (aFace < 1.5) cu = vec2(0.75 + uv.x * 0.25, uv.y);
    else if (aFace < 2.5) cu = vec2(0.015 + uv.x * 0.05, uv.y);
    else cu = vec2(0.0095 + uv.x * 0.0025, 0.45 + uv.y * 0.1);
    cu.y = clamp(cu.y, 0.02, 0.98); vMapUv = vec2(cu.x, 1.0 - (row + 1.0 - cu.y) / ${NROW}.0); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vFace = aFace; vLP = position; vLiv = aLiv; vQP = position;
  #ifdef USE_INSTANCING
    vQP = (instanceMatrix * vec4(position, 1.0)).xyz;
  #endif
  { vec3 ax = aFace < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    ax = mat3(instanceMatrix) * ax;
  #endif
    vRib = normalize(normalMatrix * ax); }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying float vFace; varying vec3 vLP; varying vec4 vLiv; varying vec3 vRib; varying vec3 vQP; uniform float uNight;
float ph12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float pn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(ph12(i),ph12(i+vec2(1,0)),f.x), mix(ph12(i+vec2(0,1)),ph12(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float sd = vLiv.w; vec2 q = vec2(vFace < 0.5 ? vLP.x : vLP.z, vLP.y);
    float run = pn(vec2(q.x * 3.0 + sd * 40.0, q.y * 0.35)) * pn(vec2(q.x * 0.7 + sd * 13.0, 1.0)); // rust runs from the top rail
    float rm = smoothstep(0.55, 0.85, run + (vLP.y - 1.6) * 0.18) * fract(sd * 7.3) * 0.9;
    float bl = smoothstep(0.62, 0.9, pn(q * 1.7 + sd * 21.0)) * fract(sd * 3.1);
    vec3 rust = vec3(0.30, 0.14, 0.07) * (0.7 + 0.6 * pn(q * 9.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, rust, clamp(rm + bl * 0.7, 0.0, 0.85));
    diffuseColor.rgb *= 1.0 - smoothstep(0.7, 0.0, vLP.y) * 0.25;                         // road grime at the foot
    if (vFace > 2.5) diffuseColor.rgb *= 0.75 + 0.25 * pn(q * 2.0 + sd * 9.0); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { float along = vFace < 0.5 ? vLP.x : vLP.z; float fw = fwidth(along * 3.5);
    float rib = vFace < 2.5 ? (vFace < 0.5 || vFace > 1.5 ? 1.0 : 0.0) : 0.0;
    float k = cos(along * 22.4) * 0.55 * rib * (1.0 - smoothstep(0.4, 1.2, fw));
    normal = normalize(normal + vRib * k); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // b_port2 night: fake light from the yard masts (u every 80 m, pools at v 33 / 71), the crane floods over the quay lanes and
  // the ship stacks, and a dim sodium bounce everywhere, so the yard reads at night without real point lights
  if (uNight > 0.01) { vec3 q = vQP; float up = vFace > 2.5 && vFace < 3.5 ? 1.0 : 0.55;
    float du = mod(q.x + 280.0, 80.0) - 40.0; float dv = min(abs(q.z - 33.0), abs(q.z - 71.0));
    float mast = exp(-(du * du + dv * dv) / 1150.0) * step(abs(q.x), 285.0) * (0.55 + 0.45 * clamp(q.y / 10.0, 0.0, 1.0));
    float cr = 0.0; for (int i = 0; i < 4; i++) { float cu = -168.0 + float(i) * 51.3; float dx = q.x - cu; cr += exp(-dx * dx / 160.0); }
    cr *= smoothstep(-40.0, -30.0, q.z) * (1.0 - smoothstep(25.0, 40.0, q.z)) * clamp((q.y - 2.0) / 12.0, 0.25, 1.0);
    vec3 L = vec3(1.0, 0.72, 0.42) * mast * 0.9 + vec3(0.95, 0.85, 0.7) * (cr * 0.8 + step(q.z, -3.5) * step(7.5, q.y) * 0.22) + vec3(0.32, 0.22, 0.4) * 0.1;
    totalEmissiveRadiance += diffuseColor.rgb * L * up * uNight; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + 0.25 * smoothstep(0.3, 0.8, pn(vLP.xz * 1.3 + vLiv.w * 5.0)), 0.0, 1.0);`);
  });
  return CMAT;
}
// unit 40 ft box (12.19 x 2.59 x 2.44, origin at the bottom centre) with per-face uv + aFace
let CGEO = null;
function containerGeo() {
  if (CGEO) return CGEO;
  const L = 12.19 / 2, H = 2.59, W = 2.44 / 2; const P = [], N = [], UV = [], F = [], I = [];
  const quad = (a, b, c, d, n, f) => { const k = P.length / 3; for (const q of [a, b, c, d]) P.push(...q); for (let i = 0; i < 4; i++) N.push(...n); UV.push(0, 0, 1, 0, 1, 1, 0, 1); F.push(f, f, f, f); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  quad([-L, 0, W], [L, 0, W], [L, H, W], [-L, H, W], [0, 0, 1], 0);          // +z side, u along +x
  quad([L, 0, -W], [-L, 0, -W], [-L, H, -W], [L, H, -W], [0, 0, -1], 0);     // -z side, u along -x
  quad([L, 0, W], [L, 0, -W], [L, H, -W], [L, H, W], [1, 0, 0], 1);          // +x door end
  quad([-L, 0, -W], [-L, 0, W], [-L, H, W], [-L, H, -W], [-1, 0, 0], 2);     // -x front end
  quad([-L, H, W], [L, H, W], [L, H, -W], [-L, H, -W], [0, 1, 0], 3);         // roof
  quad([-L, 0, -W], [L, 0, -W], [L, 0, W], [-L, 0, W], [0, -1, 0], 4);       // floor
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('aFace', new THREE.Float32BufferAttribute(F, 1)); g.setIndex(I);
  return (CGEO = g);
}

// ------------------------------------------------------------------- materials ----
let CONE = null, POOL = null, HULL = null, PUD = null;
// quay puddles: like city 'puddle' (glossy at night, neon reflections) but by day a damp darker concrete instead of a black hole
function puddleMat() {
  if (PUD) return PUD;
  PUD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.0, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  PUD.onBeforeCompile = (s) => { s.uniforms.uNight = U.uNight;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42, 0.1, uNight);')
      .replace('#include <opaque_fragment>', 'outgoingLight = min(outgoingLight, vec3(mix(0.42, 3.0, uNight)));\n#include <opaque_fragment>'); };
  PUD.customProgramCacheKey = () => 'qpuddle'; return (PUD = envAdopt(PUD, 'qpuddle')); // b_envprog2
}
function coneMat() {
  if (CONE) return CONE;
  if (!OLDENV2) return (CONE = coneMatU(2.6, 0.028)); // b_envprog2: same program as the city's lamp cones (bldglayer.js)
  return (CONE = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vC = color; vT = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform float uNight; varying vec3 vC; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = f * pow(vT, 2.6) * uNight * 0.028; gl_FragColor = vec4(vC * a, 1.0); }' }));
}
// flat additive light pool on the ground under a lamp (uv centre = lamp), night only
function poolMat() {
  if (POOL) return POOL;
  return (POOL = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying vec2 vU; void main(){ vC = color; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uNight; varying vec3 vC; varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * uNight * 0.42; gl_FragColor = vec4(vC * a, 1.0); }' }));
}
// b_port2: camera-facing additive glow sprites for lamp heads / aviation + nav lights / edge warning lights.
// One program; geometry = 4 verts per light at the light centre, aG = (corner x, corner y, size m, kind). The sprite never shrinks below
// ~2.5 px so the cranes and the ship still read as lit silhouettes from across the harbour. kind: 0 steady, 1 slow blink, 2 fast strobe.
let GLOW = null;
function glowMat() {
  if (GLOW) return GLOW;
  return (GLOW = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight, uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 color; attribute vec4 aG; uniform float uTime; varying vec3 vC; varying vec2 vU; void main(){ vC = color; vU = aG.xy;'
      + ' vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(1.0, -mv.z); float sz = max(aG.z, d * 0.0042);'
      + ' float bl = aG.w < 0.5 ? 1.0 : aG.w < 1.5 ? step(0.45, fract(uTime * 0.5 + position.x * 0.013)) : step(0.86, fract(uTime * 1.1 + position.z * 0.07));'
      + ' vC *= bl * min(1.6, sz / max(aG.z, 0.01) * 0.35 + 0.65); mv.xy += aG.xy * sz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uNight; varying vec3 vC; varying vec2 vU; void main(){ float r2 = dot(vU, vU); if (r2 > 1.0) discard;'
      + ' float a = exp(-r2 * 14.0) * 1.6 + exp(-r2 * 4.0) * 0.35 * (1.0 - r2); gl_FragColor = vec4(vC * a * (0.12 + 0.88 * uNight), 1.0); }' }));
}
class Glows {
  constructor() { this.p = []; this.g = []; this.c = []; this.i = []; }
  add(x, y, z, size, col, kind = 0) { const k = this.p.length / 3; for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { this.p.push(x, y, z); this.g.push(cx, cy, size, kind); this.c.push(...col); } this.i.push(k, k + 1, k + 2, k, k + 2, k + 3); }
  mesh() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('aG', new THREE.Float32BufferAttribute(this.g, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); g.computeBoundingSphere(); g.boundingSphere.radius += 30;
    const m = new THREE.Mesh(g, glowMat()); m.name = 'portglow'; m.renderOrder = 3; m.castShadow = m.receiveShadow = false; return m; }
}
function hullTex() {
  const W = 2048, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const r = mulberry(9902);
  // two strips: rows [0,256) = quay side (u = t, bow right), rows [256,512) = sea side (u = 1 - t, bow left)
  for (const side of [0, 1]) {
    const y0 = side * 256, X = (t) => (side ? 1 - t : t) * W; const yh = (h) => y0 + (1 - h) * 256; // h: 0 keel .. 1 deck
    g.fillStyle = '#20252c'; g.fillRect(0, y0, W, 256);                               // topside graphite
    g.fillStyle = '#6b2419'; g.fillRect(0, yh(0.55), W, yh(0) - yh(0.55));            // antifouling below the boot top
    g.fillStyle = '#0e0f10'; g.fillRect(0, yh(0.62), W, yh(0.55) - yh(0.62));          // boot top
    g.fillStyle = '#d8d6cf'; g.fillRect(0, yh(1) , W, 4);                              // sheer line
    // plating seams + frames
    for (let x = 0; x < W; x += 22) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y0, 1, 256); }
    for (const h of [0.3, 0.72, 0.86]) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, yh(h), W, 1); }
    // line name on the mid body, ship name + port of registry at bow / stern, draft marks, hawse rust, scupper runs
    g.save(); g.fillStyle = '#e8e6df'; g.textBaseline = 'middle'; g.font = 'bold 74px Arial, sans-serif'; g.textAlign = 'center';
    g.translate((X(0.38) + X(0.62)) / 2, yh(0.8)); g.scale(1.6, 1); g.fillText('AXIOM LINES', 0, 0); g.restore();
    g.save(); g.fillStyle = '#e8e6df'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('轴心航运', (X(0.38) + X(0.62)) / 2 + 300 * (side ? -1 : 1), yh(0.8) + 6); g.restore();
    g.fillStyle = '#efefe8'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('NEO LEVIATHAN', X(0.9), yh(0.9)); g.fillText('霓鲸号', X(0.9), yh(0.9) + 22);
    g.font = 'bold 16px Arial, sans-serif'; g.fillText('NEO LEVIATHAN · NEOPORT', X(0.06), yh(0.88));
    for (const t of [0.04, 0.5, 0.95]) for (let k = 2; k <= 14; k += 2) { g.fillStyle = '#f4f4ee'; g.font = '9px monospace'; g.fillText(String(k) + 'M', X(t), yh(k / 19)); }
    for (let i = 0; i < 260; i++) { const x = r() * W, h = 0.62 + r() * 0.37, len = 10 + r() * 70; const gr = g.createLinearGradient(0, yh(h), 0, yh(h) + len);
      gr.addColorStop(0, `rgba(${110 + r() * 40 | 0},${50 + r() * 20 | 0},22,${0.35 + r() * 0.4})`); gr.addColorStop(1, 'rgba(110,50,22,0)'); g.fillStyle = gr; g.fillRect(x, yh(h), 1 + r() * 4, len); }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${120 + r() * 30 | 0},${60 + r() * 20 | 0},30,${0.2 + r() * 0.4})`; g.fillRect(r() * W, yh(0.62 + r() * 0.36), 3 + r() * 16, 2 + r() * 6); }
    const hw = X(0.965); const gr = g.createLinearGradient(0, yh(0.93), 0, yh(0.6)); gr.addColorStop(0, 'rgba(120,52,20,0.8)'); gr.addColorStop(1, 'rgba(120,52,20,0)'); g.fillStyle = gr; g.fillRect(hw - 14, yh(0.93), 28, yh(0.6) - yh(0.93));
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(hw, yh(0.93), 9, 0, Math.PI * 2); g.fill(); // hawse pipe
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`; g.fillRect(r() * W, yh(0.62 + r() * 0.3), 40 + r() * 140, 6 + r() * 20); } // fresh-paint patches
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function hullMat() { return HULL || (HULL = prep(new THREE.MeshStandardMaterial({ map: hullTex(), roughness: 0.68, metalness: 0.25 }), 'porthull')); }

// ------------------------------------------------------------------ layout ----
const SHIP = { u0: -212, L: 236, vC: -19.0, B: 32.2, keel: -12.0, deck: 7.0 };            // stern at u0, bow at u0 + L
const CRANES = [{ u: -168, s: 0, work: true }, { u: -118, s: 1, work: true }, { u: -66, s: 0, work: true }, { u: -14, s: 1, work: true }, { u: 128, s: 0, up: true }, { u: 196, s: 1, up: true }];
const RAIL_V = [3, 33];
const BLOCKS = []; for (let u = -256; u < 250; u += 74) BLOCKS.push(u);
const LINE_A = { v0: 45, rows: 6 }, LINE_B = { v0: 64.5, rows: 4 };
const ROWP = 2.44 + 0.36, BAYP = 12.19 + 0.55;
const CRANE_COL = [{ st: [0.17, 0.18, 0.2], acc: [0.95, 0.62, 0.08], led: [0.1, 0.9, 1.0] }, { st: [0.66, 0.67, 0.66], acc: [0.85, 0.16, 0.12], led: [1.0, 0.2, 0.7] }];

export class PortQuay {
  constructor(scene, mats, city) {
    this.mats = Object.assign(Object.create(mats), { cone: coneMat(), pool: poolMat(), hull: hullMat() });
    if (!this.mats.vcolD) this.mats.vcolD = mats.vcol; this.mats.mark = mats.vcol; this.mats.qpuddle = puddleMat();
    this.group = new THREE.Group(); this.group.name = 'portquay'; this.group.position.set(QUAY.x, 0, QUAY.z); this.group.rotation.y = QUAY.th; scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.base = null; this.near = null; this.proxies = []; this.dmeshes = []; this.stats = { boxes: 0 };
    if (city && city.col) this.colliders(city.col);
  }
  colliders(col) {
    const add = (u0, v0, u1, v1, h, tag) => { const pts = [quayToWorld(u0, v0), quayToWorld(u1, v0), quayToWorld(u1, v1), quayToWorld(u0, v1)];
      // the quay is ~3° off axis: split long boxes so the AABBs stay tight
      const n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / 14)); for (let i = 0; i < n; i++) { const a = u0 + (u1 - u0) * i / n, b = u0 + (u1 - u0) * (i + 1) / n;
        const q = [quayToWorld(a, v0), quayToWorld(b, v0), quayToWorld(b, v1), quayToWorld(a, v1)]; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
        for (const p of q) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); } col.add(x0, z0, x1, z1, h, tag); } void pts; };
    for (const c of CRANES) for (const du of [-9, 9]) for (const v of RAIL_V) add(c.u + du - 0.9, v - 1.4, c.u + du + 0.9, v + 1.4, 46, 'crane');
    for (const bu of BLOCKS) for (const ln of [LINE_A, LINE_B]) add(bu, ln.v0, Math.min(QUAY.u1, bu + 5 * BAYP), ln.v0 + ln.rows * ROWP, 5.2, 'container');
    add(SHIP.u0, SHIP.vC - SHIP.B / 2, SHIP.u0 + SHIP.L, SHIP.vC + SHIP.B / 2, 30, 'ship');
  }
  // ------------------------------------------------------------- per frame ----
  sync() {
    const cam = globalThis.__G && globalThis.__G.camera; if (!cam) return; const p = cam.position;
    const c = quayToWorld(0, 20); const d = Math.hypot(p.x - c[0], p.z - c[1]);
    if (!this.base && d < BASE_R) this.buildBase();
    if (!this.near && d < NEAR_R) this.buildNear();
    else if (this.near && d > FAR_R) this.dropNear();
    for (const m of this.proxies) m.visible = !this.near;
    if (this.near) for (const m of this.dmeshes) { const s = m.userData.ws; m.visible = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) < DETAIL_R + m.userData.r; }
  }
  tris() { let n = 0; this.group.traverse((o) => { if (o.isMesh && o.visible && o.geometry.index) n += (o.geometry.index.count / 3) * (o.isInstancedMesh ? o.count : 1); }); return n; }
  // --------------------------------------------------------------- base LOD ----
  buildBase() {
    const t0 = performance.now(); const boxes = []; const W = new World(CH);
    withSeed(0xb0a7, () => { yardBoxes(boxes); shipBoxes(boxes); quayBoxes(boxes); });
    withSeed(0x5417, () => { hull(W); superstructure(W); });
    const GL = new Glows(); withSeed(0x9a17, () => nightLights(W, GL));
    const ms = W.build(this.group, this.mats, { neon: { cast: false }, hull: { cast: true }, cone: { cast: false, receive: false }, pool: { cast: false, receive: false } }); this.baseMeshes = ms;
    this.glow = GL.mesh(); this.group.add(this.glow);
    // crane proxies (far): portal + boom + A-frame boxes in the crane colour
    const PW = new World(1e6); withSeed(0xc4a1, () => { for (const c of CRANES) craneProxy(PW, c); }); this.proxies = PW.build(this.group, this.mats, { neon: { cast: false } });
    // containers: one instanced mesh
    const im = new THREE.InstancedMesh(containerGeo().clone(), containerMat(), boxes.length); const liv = new Float32Array(boxes.length * 4);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3(), col = new THREE.Color(); const UP = new THREE.Vector3(0, 1, 0);
    boxes.forEach((b, i) => { q.setFromAxisAngle(UP, b.ry || 0); s.set(b.short ? 6.058 / 12.19 : 1, b.hc ? 1.112 : 1, 1); pp.set(b.u, b.y, b.v); m.compose(pp, q, s); im.setMatrixAt(i, m);
      const k = 0.82 + b.r1 * 0.3; col.setRGB(k, k * (0.97 + b.r2 * 0.05), k * (0.95 + b.r2 * 0.08)); im.setColorAt(i, col);
      liv[i * 4] = b.row; liv[i * 4 + 1] = b.short ? 0.5 : 1; liv[i * 4 + 2] = b.short ? 0.25 : 0; liv[i * 4 + 3] = b.rust; });
    im.geometry.setAttribute('aLiv', new THREE.InstancedBufferAttribute(liv, 4));
    im.castShadow = true; im.receiveShadow = true; im.name = 'portboxes'; im.frustumCulled = false; this.group.add(im); this.boxes = im; this.stats.boxes = boxes.length;
    this.base = true; this.stats.baseMs = performance.now() - t0;
  }
  // --------------------------------------------------------------- near LOD ----
  buildNear() {
    const t0 = performance.now(); const W = new World(CH);
    withSeed(0x77a3, () => { for (const c of CRANES) withSeed(0x1000 + c.u * 7 >>> 0, () => stsCrane(W, c)); });
    withSeed(0x3c11, () => { quayGround(W); });
    withSeed(0x6d02, () => { shipGear(W); mooring(W); });
    withSeed(0x2f9e, () => { props(W); lightMasts(W); });
    this.near = W.build(this.group, this.mats, { neon: { cast: false }, cone: { cast: false, receive: false }, pool: { cast: false, receive: false }, qpuddle: { cast: false }, mark: { cast: false } });
    this.dmeshes = this.near.filter((m) => m.name.startsWith('vcolD|'));
    for (const m of this.dmeshes) { const bs = m.geometry.boundingSphere; m.userData.ws = this.group.localToWorld(bs.center.clone()); m.userData.r = bs.radius; }
    this.stats.nearMs = performance.now() - t0;
  }
  dropNear() { for (const m of this.near) { this.group.remove(m); m.geometry.dispose(); } this.near = null; this.dmeshes = []; }
}

// ================================================================ containers ====
const box40 = (out, u, y, v, o = {}) => { out.push({ u, y, v, ry: o.ry || 0, short: !!o.short, hc: !!o.hc, row: o.row ?? randi(0, NROW - 1), rust: rand(0.02, 0.98), r1: rng(), r2: rng() }); };
// yard blocks: rows across v, bays along u; heights from a smooth field with stepped block ends, empty slots, 20 ft pairs, high cubes
function yardBoxes(out) {
  let bi = 0;
  for (const bu of BLOCKS) for (const ln of [LINE_A, LINE_B]) {
    bi++; const fav = randi(0, NROW - 1); const hmax = ln === LINE_A ? 5 : 4;
    for (let b = 0; b < 5; b++) {
      const u = bu + b * BAYP + 12.19 / 2; if (u + 6.1 > QUAY.u1) continue;
      for (let r = 0; r < ln.rows; r++) {
        const v = ln.v0 + r * ROWP + 1.22;
        const f = 0.5 + 0.5 * Math.sin(u * 0.045 + bi * 1.7) * Math.cos(v * 0.21 + bi);
        let h = Math.round(1 + f * (hmax - 0.5) + rand(-0.8, 0.8)); if (b === 0 || b === 4) h = Math.min(h, randi(1, 3)); if (rng() < 0.07) h = 0; h = Math.max(0, Math.min(hmax, h));
        const two = rng() < 0.18; let y = 0.02;
        for (let k = 0; k < h; k++) { const row = rng() < 0.45 ? fav : randi(0, NROW - 1); const hc = rng() < 0.35;
          if (two && k === 0) { box40(out, u - 3.07, y, v, { short: true, row }); box40(out, u + 3.07, y, v, { short: true, row: randi(0, NROW - 1), ry: Math.PI }); }
          else box40(out, u, y, v, { row, hc, ry: rng() < 0.5 ? 0 : Math.PI });
          y += hc ? 2.896 : 2.59; }
      }
    }
  }
}
// deck stacks on the ship: 11 forty-foot bays x 13 rows, stepped down toward the bow / sides, gaps where the cranes work
function shipBoxes(out) {
  const S = SHIP; const y0 = S.deck + 1.35; const nb = 11;
  for (let b = 0; b < nb; b++) {
    const u = S.u0 + S.L * 0.19 + b * 13.4 + 6.1; const fwd = b / (nb - 1);
    const worked = CRANES.find((c) => c.work && Math.abs(c.u - u) < 6.8);
    for (let r = 0; r < 13; r++) {
      const v = S.vC - S.B / 2 + 1.0 + r * 2.48 + 1.22; const edge = Math.min(r, 12 - r);
      let h = 6 - (fwd > 0.82 ? 2 : 0) - (edge === 0 ? 2 : edge === 1 ? 1 : 0) + randi(-1, 0);
      if (worked) h = Math.max(0, h - randi(2, 5)); h = Math.max(0, h);
      let y = y0; for (let k = 0; k < h; k++) { const hc = rng() < 0.5; box40(out, u, y, v, { row: randi(0, NROW - 1), hc, ry: rng() < 0.5 ? 0 : Math.PI }); y += hc ? 2.896 : 2.59; }
    }
  }
  // the box in each working crane's spreader (hanging over the hatch) is added by stsCrane via CRANE_LIFT
  for (const c of CRANES) if (c.work) { const lift = craneLift(c); box40(out, c.u, lift.y - 2.6, lift.v, { row: randi(0, NROW - 1) }); }
}
// boxes on terminal-tractor chassis under the cranes and on the rail flats
function quayBoxes(out) {
  for (const c of CRANES) if (c.work) for (const lane of [12.5, 20.5]) if (rng() < 0.8) box40(out, c.u + rand(-3, 3), 1.45, lane, { row: randi(0, NROW - 1) });
  for (let u = -150; u < 60; u += 16.4) if (rng() < 0.75) { const two = rng() < 0.3; if (two) { box40(out, u - 3.07, 1.25, 38.5, { short: true }); box40(out, u + 3.07, 1.25, 38.5, { short: true }); } else box40(out, u, 1.25, 38.5, {}); }
}
const craneLift = (c) => ({ v: SHIP.vC + (((Math.abs(c.u) * 13) % 7) - 3) * 3.4, y: 29 + ((Math.abs(c.u) * 7) % 5) * 1.3 });

// ===================================================================== ship ====
function hbAt(t, h) {
  const S = SHIP; let k = 1;
  if (t > 0.8) { const a = (t - 0.8) / 0.2; k = 1 - Math.pow(a, 1.5 + (1 - h) * 1.4); k *= 1 - (1 - h) * a * 0.2; }
  else if (t < 0.15) { const a = (0.15 - t) / 0.15; k = 1 - a * a * Math.pow(1 - h, 1.3) * 0.96; }
  const hm = h * (S.deck - S.keel); const bil = hm < 2.2 ? 2.2 - Math.sqrt(Math.max(0, 2.2 * 2.2 - (2.2 - hm) * (2.2 - hm))) : 0;
  return Math.max(0, (S.B / 2) * Math.max(0, k) - bil);
}
function hull(W) {
  const S = SHIP; const NS = 56, NH = 9; const b = W.b('hull', S.u0 + S.L / 2, S.vC);
  const sAt = (i, h) => { const t = i / NS; let s = t * S.L; if (t > 0.8) s += h * 6 * (t - 0.8) / 0.2; if (t < 0.02) s -= h * 1.5; return s; }; // raked stem, slight transom overhang
  for (const sd of [1, -1]) for (let i = 0; i < NS; i++) for (let j = 0; j < NH; j++) {
    const h0 = j / NH, h1 = (j + 1) / NH; const y0 = S.keel + h0 * (S.deck - S.keel), y1 = S.keel + h1 * (S.deck - S.keel);
    const P = (ii, hh, yy) => new THREE.Vector3(S.u0 + sAt(ii, hh), yy, S.vC + sd * hbAt(ii / NS, hh));
    const a = P(i, h0, y0), bb = P(i + 1, h0, y0), c = P(i + 1, h1, y1), d = P(i, h1, y1);
    const t0 = i / NS, t1 = (i + 1) / NS; const tu = (t) => (sd > 0 ? t : 1 - t) ; const vo = sd > 0 ? 0.5 : 0;
    const uv = [tu(t0), vo + h0 * 0.5, tu(t1), vo + h0 * 0.5, tu(t1), vo + h1 * 0.5, tu(t0), vo + h1 * 0.5].map((x, k) => (k % 2 ? 1 - x + (sd > 0 ? -0.0 : 0) : x));
    // texture rows: quay side strip occupies the top half of the canvas (v in [0.5, 1]), sea side the bottom half
    const UVf = [uv[0], sd > 0 ? 0.5 + h0 * 0.5 : h0 * 0.5, uv[2], sd > 0 ? 0.5 + h0 * 0.5 : h0 * 0.5, uv[4], sd > 0 ? 0.5 + h1 * 0.5 : h1 * 0.5, uv[6], sd > 0 ? 0.5 + h1 * 0.5 : h1 * 0.5];
    if (sd > 0) b.quad(a, bb, c, d, UVf, {}); else b.quad(bb, a, d, c, [UVf[2], UVf[3], UVf[0], UVf[1], UVf[6], UVf[7], UVf[4], UVf[5]], {});
  }
  // transom
  const tr = []; for (let j = 0; j <= NH; j++) { const h = j / NH; tr.push([S.u0 + sAt(0, h), S.keel + h * (S.deck - S.keel), hbAt(0, h)]); }
  for (let j = 0; j < NH; j++) { const [x0, y0, w0] = tr[j], [x1, y1, w1] = tr[j + 1];
    b.quad(new THREE.Vector3(x0, y0, S.vC + w0), new THREE.Vector3(x0, y0, S.vC - w0), new THREE.Vector3(x1, y1, S.vC - w1), new THREE.Vector3(x1, y1, S.vC + w1), [0.01, 0.52 + j / NH * 0.45, 0.04, 0.52 + j / NH * 0.45, 0.04, 0.52 + (j + 1) / NH * 0.45, 0.01, 0.52 + (j + 1) / NH * 0.45], {}); }
  // main deck + bulwark lip + forecastle
  const v = W.b('vcol', S.u0 + S.L / 2, S.vC); const deck = []; for (let i = 0; i <= NS; i++) deck.push([S.u0 + sAt(i, 1), S.vC + hbAt(i / NS, 1)]); for (let i = NS; i >= 0; i--) deck.push([S.u0 + sAt(i, 1), S.vC - hbAt(i / NS, 1)]);
  polyCap(v, deck.filter((q, k, A) => k === 0 || Math.hypot(q[0] - A[k - 1][0], q[1] - A[k - 1][1]) > 0.01), S.deck - 0.05, {}, [0.2, 0.27, 0.24]);
  const fc0 = S.u0 + S.L * 0.86; const fw = (u) => hbAt(Math.min(1, (u - S.u0) / S.L), 1);
  { const fo = []; for (let i = Math.floor(NS * 0.86); i <= NS; i++) fo.push([S.u0 + sAt(i, 1), S.vC + hbAt(i / NS, 1)]); for (let i = NS; i >= Math.floor(NS * 0.86); i--) fo.push([S.u0 + sAt(i, 1), S.vC - hbAt(i / NS, 1)]);
    const fq = fo.filter((q, k, A) => k === 0 || Math.hypot(q[0] - A[k - 1][0], q[1] - A[k - 1][1]) > 0.05); let A = 0; for (let i = 0; i < fq.length; i++) { const p = fq[i], o = fq[(i + 1) % fq.length]; A += p[0] * o[1] - o[0] * p[1]; }
    const fw2 = A > 0 ? fq.slice().reverse() : fq; prismWalls(v, fw2, S.deck - 0.1, S.deck + 2.6, null, [0.13, 0.15, 0.17]); polyCap(v, fq, S.deck + 2.6, {}, [0.24, 0.3, 0.27]); } // raised forecastle (follows the bow flare)
  box(v, fc0 - 0.2, S.deck + 2.6, S.vC - fw(fc0) + 0.5, fc0 + 0.3, S.deck + 4.8, S.vC + fw(fc0) - 0.5, {}, [0.85, 0.84, 0.8]); // breakwater
}
function superstructure(W) {
  const S = SHIP; const v = W.b('vcol', S.u0 + 25, S.vC), nb = W.b('neon', S.u0 + 25, S.vC);
  const a0 = S.u0 + 16, a1 = a0 + 14, hw = 12.5, deckH = 2.85, nd = 7; const top = S.deck + 2 + nd * deckH; const wc = [0.9, 0.9, 0.87];
  box(v, a0, S.deck, S.vC - hw, a1, top, S.vC + hw, {}, wc);
  for (let k = 1; k <= nd; k++) { const y = S.deck + 2 + k * deckH; box(v, a0 - 0.6, y - 0.18, S.vC - hw - 0.6, a1 + 0.6, y, S.vC + hw + 0.6, {}, [0.8, 0.8, 0.77]); // deck edges
    for (const sd of [-1, 1]) { const lit = rng() < 0.4; put(lit ? nb : v, kg().box, (a0 + a1) / 2 + 0.3, y - 1.35, S.vC + sd * (hw + 0.02), 12.5, 0.9, 0.04, lit ? [0.32, 0.27, 0.19] : [0.07, 0.09, 0.11]); }
    { const lit = rng() < 0.35; put(lit ? nb : v, kg().box, a1 + 0.02, y - 1.35, S.vC, 0.04, 0.9, 2 * hw - 1.5, lit ? [0.32, 0.28, 0.2] : [0.07, 0.09, 0.11]); } }
  // bridge deck with wings to full beam, wheelhouse windows (lit), bridge top + radar mast
  const yb = top; box(v, a0 + 1, yb, S.vC - S.B / 2 - 0.4, a1 - 1, yb + 3.2, S.vC + S.B / 2 + 0.4, {}, wc);
  put(nb, kg().box, a1 - 0.98, yb + 1.9, S.vC, 0.05, 1.2, S.B - 1, [0.25, 0.42, 0.5]);
  for (const sd of [-1, 1]) put(nb, kg().box, (a0 + a1) / 2, yb + 1.9, S.vC + sd * (S.B / 2 + 0.43), 10, 1.0, 0.04, [0.25, 0.42, 0.5]);
  box(v, a0 + 3, yb + 3.2, S.vC - 5, a1 - 3, yb + 3.6, S.vC + 5, {}, [0.75, 0.75, 0.72]);
  const mu = a0 + 6; beam(v, [mu, yb + 3.6, S.vC], [mu, yb + 12, S.vC], 0.5, [0.85, 0.6, 0.12]); beam(v, [mu, yb + 9, S.vC - 3], [mu, yb + 9, S.vC + 3], 0.3, [0.85, 0.6, 0.12]);
  put(v, kg().box, mu + 0.8, yb + 10.2, S.vC, 0.3, 0.2, 5.5, [0.9, 0.9, 0.9]); put(nb, kg().ball, mu, yb + 12.3, S.vC, 0.3, 0.3, 0.3, [1, 0.95, 0.8]);
  // funnel aft of the block: tapered casing, company band, emblem panel, exhaust pipes
  const f0 = S.u0 + 7, f1 = f0 + 7; const fy = top - 4, fh = 12; box(v, f0, S.deck, S.vC - 4, f1, fy + fh, S.vC + 4, {}, [0.2, 0.22, 0.25]);
  box(v, f0 - 0.05, fy + fh - 4, S.vC - 4.05, f1 + 0.05, fy + fh - 1.5, S.vC + 4.05, {}, [0.85, 0.42, 0.1]);
  for (const sd of [-1, 1]) put(nb, kg().box, (f0 + f1) / 2, fy + fh - 6.5, S.vC + sd * 4.06, 4, 3.5, 0.04, [0.05, 0.55, 0.75]);
  for (const o of [-1.4, 0, 1.4]) put(v, kg().cyl8, (f0 + f1) / 2, fy + fh + 1.2, S.vC + o, 0.45, 2.6, 0.45, DARK);
  // lifeboat (free-fall, orange) on its ramp at the stern
  const lu = S.u0 + 4; beam(v, [lu - 3.5, S.deck + 8.6, S.vC + 6], [lu + 3.5, S.deck + 11.4, S.vC + 6], 3.2, [0.3, 0.3, 0.32], 0.3);
  beam(v, [lu - 3.3, S.deck + 9.8, S.vC + 6], [lu + 3.6, S.deck + 12.6, S.vC + 6], 2.5, [0.98, 0.45, 0.08], 2.4); // free-fall lifeboat on its ramp
  // navigation lights (port red / starboard green on the wings), stern light, deck floods along the block
  put(nb, kg().ball, a0 + 3, yb + 2.4, S.vC - S.B / 2 - 0.8, 0.25, 0.25, 0.25, [1, 0.05, 0.05]); put(nb, kg().ball, a0 + 3, yb + 2.4, S.vC + S.B / 2 + 0.8, 0.25, 0.25, 0.25, [0.1, 1, 0.3]);
  for (const sd of [-1, 1]) for (let k = 2; k < nd; k += 2) put(nb, kg().box, a1 + 0.1, S.deck + 2 + k * deckH - 0.3, S.vC + sd * (hw - 1.5), 0.2, 0.3, 0.6, [1, 0.92, 0.75]);
}
// near-only ship detail: hatch covers, lashing bridges, bow mast + winches, railings, deck lights
function shipGear(W) {
  const S = SHIP; const nb0 = 11;
  for (let b = 0; b < nb0; b++) {
    const u = S.u0 + S.L * 0.19 + b * 13.4; const v = W.b('vcol', u, S.vC), d = W.b('vcolD', u, S.vC), n = W.b('neon', u, S.vC);
    for (const hv of [-1, 0, 1]) box(v, u + 0.2, S.deck, S.vC + hv * 10.4 - 5, u + 12.6, S.deck + 1.35, S.vC + hv * 10.4 + 5, {}, [0.22, 0.32, 0.28]); // hatch panels
    // lashing bridge aft of the bay: two tiers, posts, walkways, rails, lashing rods
    const lu = u - 0.5; const yb = S.deck + 1.35;
    for (let k = -6; k <= 6; k += 2) beam(v, [lu, yb - 1.3, S.vC + k * 2.48], [lu, yb + 5.4, S.vC + k * 2.48], 0.3, [0.85, 0.85, 0.82]);
    for (const yy of [yb + 2.6, yb + 5.2]) { beam(v, [lu, yy, S.vC - 15], [lu, yy, S.vC + 15], 0.7, [0.85, 0.85, 0.82], 0.15); beam(d, [lu + 0.3, yy + 1.0, S.vC - 15], [lu + 0.3, yy + 1.0, S.vC + 15], 0.04, [0.95, 0.75, 0.1]); }
    for (let k = -6; k <= 6; k++) for (const s of [-1, 1]) tube(d, [lu, yb + 2.6, S.vC + k * 2.48 + 0.6], [lu + s * 0.9 + 0.5, yb + 0.1, S.vC + k * 2.48 + 0.6], 0.025, [0.7, 0.7, 0.68], kg().tube4);
    if (b % 2 === 0) put(n, kg().box, lu, yb + 5.6, S.vC, 0.3, 0.2, 1.2, [1, 0.9, 0.7]);
  }
  // bow: mast with lights, mooring winches, bollards, railing
  const bu = S.u0 + S.L - 14; const v = W.b('vcol', bu, S.vC), d = W.b('vcolD', bu, S.vC), n = W.b('neon', bu, S.vC); const yf = S.deck + 2.6;
  beam(v, [bu, yf, S.vC], [bu, yf + 11, S.vC], 0.45, [0.85, 0.6, 0.12]); put(n, kg().ball, bu, yf + 11.3, S.vC, 0.3, 0.3, 0.3, [1, 0.95, 0.85]);
  for (const sd of [-1, 1]) { put(v, kg().cyl8, bu - 6, yf + 0.8, S.vC + sd * 5, 1.0, 1.6, 1.0, [0.2, 0.3, 0.25]); put(d, kg().cyl8, bu - 2, yf + 0.5, S.vC + sd * 7, 0.35, 1.0, 0.35, DARK); }
  for (const sd of [-1, 1]) for (let u = S.u0 + 2; u < S.u0 + S.L * 0.86; u += 2.5) { const w = hbAt((u - S.u0) / S.L, 1); beam(d, [u, S.deck, S.vC + sd * (w - 0.1)], [u, S.deck + 1.1, S.vC + sd * (w - 0.1)], 0.04, [0.8, 0.8, 0.78]); }
  for (const sd of [-1, 1]) for (let u = S.u0 + 2; u < S.u0 + S.L * 0.86 - 2.5; u += 10) { const w = hbAt((u - S.u0) / S.L, 1); beam(d, [u, S.deck + 1.1, S.vC + sd * (w - 0.1)], [u + 10, S.deck + 1.1, S.vC + sd * (hbAt((u + 10 - S.u0) / S.L, 1) - 0.1)], 0.05, [0.8, 0.8, 0.78]); }
  // pilot ladder + gangway down to the quay amidships-aft
  const gu = S.u0 + 40; beam(v, [gu, S.deck + 0.5, S.vC + S.B / 2], [gu + 9, 0.2, S.vC + S.B / 2 + 4.5], 1.0, [0.75, 0.76, 0.74], 0.15);
  for (const o of [-0.5, 0.5]) beam(d, [gu, S.deck + 1.5, S.vC + S.B / 2 + o * 0.1], [gu + 9, 1.2, S.vC + S.B / 2 + 4.5 + o * 0.1], 0.04, [0.9, 0.9, 0.88]);
}
function mooring(W) {
  const S = SHIP; const v = W.b('vcolD', S.u0 + S.L / 2, 0);
  const lines = [[S.u0 + 3, S.u0 - 22], [S.u0 + 6, S.u0 + 8], [S.u0 + 30, S.u0 + 40], [S.u0 + S.L - 30, S.u0 + S.L - 40], [S.u0 + S.L - 8, S.u0 + S.L + 4], [S.u0 + S.L - 5, S.u0 + S.L + 24]];
  for (const [us, uq] of lines) { const w = hbAt(Math.max(0, Math.min(1, (us - S.u0) / S.L)), 1); const a = [us, S.deck + 1.2, S.vC + w], b = [uq, 0.75, 1.0];
    for (const o of [-0.25, 0.25]) cable(v, [a[0] + o, a[1], a[2]], [b[0] + o * 0.3, b[1], b[2]], 1.2, 0.05, [0.85, 0.75, 0.45], 10); }
}

// =================================================================== cranes ====
function craneProxy(W, c) {
  const C = CRANE_COL[c.s]; const v = W.b('vcol', c.u, 18), nb = W.b('neon', c.u, 18); const H = 46;
  for (const du of [-9, 9]) for (const rv of RAIL_V) box(v, c.u + du - 0.8, 0, rv - 0.8, c.u + du + 0.8, H, rv + 0.8, {}, C.st);
  for (const rv of RAIL_V) box(v, c.u - 9.8, H - 2, rv - 0.9, c.u + 9.8, H, rv + 0.9, {}, C.st);
  if (c.up) { for (const du of [-4, 4]) { box(v, c.u + du - 1, H, -2, c.u + du + 1, H + 3, 50, {}, C.st); beam(v, [c.u + du, H + 1.5, 0], [c.u + du, H + 52, -12], 2, C.st, 3); } }
  else for (const du of [-4, 4]) box(v, c.u + du - 1, H, -56, c.u + du + 1, H + 3, 50, {}, C.st);
  for (const du of [-9, 9]) { beam(v, [c.u + du, H, 3], [c.u + du * 0.55, 80, 10], 1.2, C.st); beam(v, [c.u + du, H, 33], [c.u + du * 0.55, 80, 10], 1.2, C.st); }
  box(v, c.u - 6, H + 3, 36, c.u + 6, H + 9, 48, {}, [0.78, 0.78, 0.76]);
  put(nb, kg().ball, c.u, 81, 10, 0.5, 0.5, 0.5, [1, 0.06, 0.04]);
}
// detailed ship-to-shore crane. local: u along the quay, rails at v = 3 / 33, boom over the water to v = -56, backreach to v = 50
function stsCrane(W, c) {
  const C = CRANE_COL[c.s]; const st = C.st, ac = C.acc; const U0 = c.u; const v = W.b('vcol', U0, 18), d = W.b('vcolD', U0, 18), nb = W.b('neon', U0, 18), cb = W.b('cone', U0, 18), pl = W.b('pool', U0, 18); const G = kg();
  const H = 46, Hb = 49, gw = 4; const rust = [0.34, 0.2, 0.13]; const stD = st.map((q) => q * 0.8);
  // legs: tapered box legs (wider at the foot), bogies with wheels, sill beams with hazard stripes, rail clamps
  for (const du of [-9, 9]) for (const rv of RAIL_V) {
    beam(v, [U0 + du, 2.6, rv], [U0 + du, H - 1, rv], 1.9, st, 1.9); beam(v, [U0 + du, 2.6, rv], [U0 + du, 9, rv], 2.15, stD, 2.15);
    for (let y = 6; y < H - 2; y += 5) put(d, G.box, U0 + du, y, rv, 2.0, 0.12, 2.0, stD); // weld bands / diaphragms
    for (let k = 0; k < 6; k++) put(v, G.box, U0 + du, 3.2 + k * 0.55, rv, 2.2, 0.28, 2.2, k % 2 ? [0.06, 0.06, 0.06] : ac); // hazard collar
    for (const s of [-1, 1]) { const bu = U0 + du + s * 2.8; box(v, bu - 1.9, 0.35, rv - 0.65, bu + 1.9, 1.5, rv + 0.65, {}, stD);
      for (const w of [-1.3, -0.45, 0.45, 1.3]) put(d, G.box, bu + w, 0.42, rv, 0.78, 0.78, 0.55, DARK); }
    box(v, U0 + du - 5, 1.5, rv - 0.9, U0 + du + 5, 2.6, rv + 0.9, {}, ac);
    put(nb, G.ball, U0 + du + 4.6, 2.9, rv, 0.16, 0.16, 0.16, [1, 0.55, 0.05]);
  }
  // portal: beams along the rails at the top, cross girders along v at u = ±9, knee braces, diagonal bracing in the rail planes
  for (const rv of RAIL_V) { box(v, U0 - 10, H - 2.4, rv - 1, U0 + 10, H, rv + 1, {}, st); for (const s of [-1, 1]) beam(v, [U0 + s * 9, H - 12, rv], [U0 + s * 2, H - 2.4, rv], 0.8, st); }
  for (const du of [-9, 9]) { box(v, U0 + du - 0.9, H - 2.2, 3, U0 + du + 0.9, H, 33, {}, st);
    beam(v, [U0 + du, H - 9, 3], [U0 + du, H - 2.2, 10], 0.7, st); beam(v, [U0 + du, H - 9, 33], [U0 + du, H - 2.2, 26], 0.7, st);
    beam(v, [U0 + du, 17, 3], [U0 + du, 17, 33], 1.0, st, 1.4); }                                // lower portal tie (clear of the lanes: 17 m)
  // boom (over water) + backreach girders: two box girders, stiffener ribs, trolley rails, walkway + handrails, cross ties
  const boomV0 = c.up ? -2 : -56; const Gs = [-gw, gw];
  const gird = (a, b) => { for (const s of Gs) { beam(v, [U0 + s, Hb, a], [U0 + s, Hb, b], 1.6, st, 3); beam(nb, [U0 + s + Math.sign(s) * 0.82, Hb - 1.0, a], [U0 + s + Math.sign(s) * 0.82, Hb - 1.0, b], 0.05, C.led, 0.08);
    for (let z = Math.min(a, b) + 2; z < Math.max(a, b) - 1; z += 3) put(d, G.box, U0 + s + Math.sign(s) * 0.83, Hb, z, 0.06, 2.9, 0.12, stD);
    beam(d, [U0 + s, Hb + 1.55, a], [U0 + s, Hb + 1.55, b], 0.18, [0.3, 0.3, 0.32], 0.12);                // trolley rail
    beam(d, [U0 + s - Math.sign(s) * 1.6, Hb + 1.6, a], [U0 + s - Math.sign(s) * 1.6, Hb + 1.6, b], 0.9, [0.25, 0.26, 0.27], 0.05); // walkway grating
    beam(d, [U0 + s - Math.sign(s) * 2.0, Hb + 2.6, a], [U0 + s - Math.sign(s) * 2.0, Hb + 2.6, b], 0.05, ac); }
    for (let z = Math.min(a, b) + 3; z < Math.max(a, b); z += 9) beam(v, [U0 - gw, Hb - 1.3, z], [U0 + gw, Hb - 1.3, z], 0.5, st, 0.5); };
  gird(-2, 50);
  if (c.up) { // parked: boom hinged up at v = -2 (lifted ~78°), forestay to the apex
    const ang = 1.36, Lb = 54; for (const s of Gs) { const tip = [U0 + s, Hb + Math.sin(ang) * Lb, -2 - Math.cos(ang) * Lb]; beam(v, [U0 + s, Hb, -2], tip, 1.6, st, 3); beam(nb, [U0 + s + Math.sign(s) * 0.85, Hb, -2], [tip[0] + Math.sign(s) * 0.85, tip[1], tip[2]], 0.05, C.led, 0.08); }
    for (let k = 1; k < 6; k++) { const t = k / 6 * Lb; beam(v, [U0 - gw, Hb + Math.sin(ang) * t, -2 - Math.cos(ang) * t], [U0 + gw, Hb + Math.sin(ang) * t, -2 - Math.cos(ang) * t], 0.45, st); }
    put(nb, G.ball, U0, Hb + Math.sin(ang) * Lb + 1.8, -2 - Math.cos(ang) * Lb, 0.35, 0.35, 0.35, [1, 0.06, 0.04]);
  } else { gird(-56, -2); for (const s of Gs) put(nb, G.ball, U0 + s, Hb + 1.8, -56.5, 0.3, 0.3, 0.3, [1, 0.06, 0.04]); box(v, U0 - gw - 1, Hb - 1.5, -57, U0 + gw + 1, Hb + 1.5, -56, {}, ac); }
  // A-frame: two legs per side up to the apex beam, forestays to the boom (or to the raised boom), backstays to the backreach end
  const ya = 80, va = 10;
  for (const s of [-1, 1]) { const ax = U0 + s * 5; beam(v, [U0 + s * 9, H, 3], [ax, ya, va], 1.3, st); beam(v, [U0 + s * 9, H, 33], [ax, ya, va], 1.3, st);
    beam(v, [U0 + s * 9, 63, 6.6], [U0 + s * 9 - s * 2.5, 63, 23], 0.6, st);
    if (!c.up) for (const bz of [-22, -50]) beam(v, [ax, ya - 0.5, va], [U0 + s * gw, Hb + 1.5, bz], 0.45, st, 0.45);
    else beam(v, [ax, ya - 0.5, va], [U0 + s * gw, Hb + Math.sin(1.36) * 40, -2 - Math.cos(1.36) * 40], 0.45, st, 0.45);
    beam(v, [ax, ya - 0.5, va], [U0 + s * gw, Hb + 1.5, 49], 0.5, st, 0.5); }
  box(v, U0 - 6, ya - 0.5, va - 1.2, U0 + 6, ya + 1.5, va + 1.2, {}, st); put(nb, G.ball, U0, ya + 2, va, 0.45, 0.45, 0.45, [1, 0.06, 0.04]);
  for (const s of [-1, 1]) put(nb, G.ball, U0 + s * 6, ya + 1.8, va, 0.3, 0.3, 0.3, [1, 0.06, 0.04]);
  for (let k = 0; k < 5; k++) put(d, G.box, U0, ya + 1.6, va - 0.8 + k * 0.4, 1.4, 0.4, 0.05, [0.7, 0.7, 0.7]); // sheave frame
  // machinery house on the backreach with a lit line sign on both long sides
  const mh = [U0 - 6.5, Hb + 1.6, 35, U0 + 6.5, Hb + 8.6, 48]; box(v, mh[0], mh[1], mh[2], mh[3], mh[4], mh[5], {}, [0.82, 0.82, 0.8]);
  for (let y = mh[1] + 1; y < mh[4] - 1; y += 0.45) for (const s of [-1, 1]) put(d, G.box, U0 + s * 6.52, y, 38, 0.06, 0.15, 3.5, [0.5, 0.5, 0.5]); // louvres
  for (const s of [-1, 1]) { put(nb, G.box, U0 + s * 6.56, mh[1] + 4.6, 44.4, 0.05, 2.6, 5.6, C.led.map((q) => q * 0.55)); for (let k = 0; k < 4; k++) put(nb, G.box, U0 + s * 6.6, mh[1] + 4.0 + (k % 2) * 1.0, 42.4 + k * 1.3, 0.05, 0.4, 0.9, [0.3, 0.3, 0.3]); }
  put(nb, G.box, U0, mh[1] + 4.6, 48.02, 9, 2.4, 0.05, C.led.map((q) => q * 0.55)); // end face sign
  put(nb, G.ball, U0 - 6.2, mh[4] + 0.4, 48, 0.3, 0.3, 0.3, [1, 0.06, 0.04]); put(nb, G.ball, U0 + 6.2, mh[4] + 0.4, 48, 0.3, 0.3, 0.3, [1, 0.06, 0.04]);
  // trolley + operator cab, hoist ropes, spreader (working cranes: over the ship holding a box; parked: at the backreach)
  const tv = c.up ? 30 : craneLift(c).v; const ty = Hb + 1.6;
  box(v, U0 - gw - 0.6, ty, tv - 3.2, U0 + gw + 0.6, ty + 2.4, tv + 3.2, {}, [0.86, 0.86, 0.84]);
  for (const s of [-1, 1]) for (const z of [-2.4, 2.4]) put(d, G.cyl8, U0 + s * gw, ty + 0.1, tv + z, 0.5, 0.35, 0.5, DARK);
  const cy = Hb - 4.6; box(v, U0 - 1.6, cy, tv - 3.1, U0 + 1.6, Hb - 1.6, tv - 0.3, {}, [0.86, 0.86, 0.84]);
  put(nb, G.box, U0, cy + 1.6, tv - 3.12, 2.8, 1.6, 0.04, [0.3, 0.45, 0.5]); put(nb, G.box, U0, cy - 0.02, tv - 1.7, 2.6, 0.04, 2.2, [0.3, 0.45, 0.5]);
  for (const s of [-1, 1]) beam(d, [U0 + s * 1.4, Hb - 1.6, tv - 0.6], [U0 + s * 1.4, Hb - 0.2, tv - 0.6], 0.15, st);
  if (!c.up) { const L = craneLift(c); const sy = L.y;
    for (const [ox, oz] of [[-1.0, -2.6], [1.0, -2.6], [-1.0, 2.6], [1.0, 2.6]]) tube(v, [U0 + ox * 0.7, ty, tv + oz * 0.5], [U0 + ox, sy + 0.9, L.v + oz], 0.045, DARK, G.tube4);
    box(v, U0 - 1.3, sy, L.v - 6.1, U0 + 1.3, sy + 0.9, L.v + 6.1, {}, ac); box(v, U0 - 0.7, sy + 0.9, L.v - 1.5, U0 + 0.7, sy + 1.7, L.v + 1.5, {}, stD);
    for (const z of [-6.05, 6.05]) put(nb, G.box, U0, sy + 0.95, L.v + z, 0.6, 0.12, 0.05, [1, 0.55, 0.08]);
    cone(cb, U0, cy - 0.2, tv - 1.7, cy - 0.5, 4.5, [0.85, 0.88, 0.92]); }
  // flood lights under both girders (housings, lit lenses, cones, pools on the quay / deck)
  const lampZ = c.up ? [6, 20, 30] : [-48, -36, -24, -12, 6, 20, 30];
  for (const s of Gs) for (const z of lampZ) { put(v, G.box, U0 + s, Hb - 1.75, z, 0.9, 0.5, 0.7, DARK); put(nb, G.box, U0 + s, Hb - 2.02, z, 0.75, 0.04, 0.55, [1.0, 0.82, 0.55].map((q) => q * 1.5));
    if (z < -6 && rng() < 0.35) cone(cb, U0 + s, Hb - 2.05, z, Hb - 2.1 - SHIP.deck - 1.4, rand(4, 5.5), [0.95, 0.75, 0.45]); } // quay-side cones + pools: nightLights()
  void pl;
  // stair tower on the landside leg at -9: zig-zag flights with landings, + lift shaft on the +9 landside leg
  const sx = U0 - 9 - 1.9, sv = 33; for (let y = 2.6, k = 0; y < H - 4; y += 4.2, k++) { const z0 = sv - 1.6, z1 = sv + 1.6; const dir = k % 2 ? -1 : 1;
    box(d, sx - 1.4, y - 0.12, z0, sx, y, z1, {}, [0.28, 0.28, 0.29]); beam(d, [sx - 0.7, y, dir > 0 ? z0 : z1], [sx - 0.7, y + 4.2, dir > 0 ? z1 : z0], 1.0, [0.32, 0.32, 0.33], 0.12);
    beam(d, [sx - 1.4, y + 1.0, z0], [sx - 1.4, y + 1.0, z1], 0.05, ac); put(d, G.box, sx - 1.4, y + 0.5, z0, 0.06, 1.0, 0.06, ac); put(d, G.box, sx - 1.4, y + 0.5, z1, 0.06, 1.0, 0.06, ac); }
  box(v, U0 + 9 + 1.0, 2.6, 33 - 1.1, U0 + 9 + 2.6, H, 33 + 1.1, {}, [0.75, 0.75, 0.73]);
  // festoon cables in loops under the backreach + the power cable reel / trench feed at the landside sill
  for (let k = 0; k < 7; k++) { const z = 12 + k * 4.5; cable(d, [U0 + 2.2, Hb - 1.6, z], [U0 + 2.2, Hb - 1.6, z + 4.5], 1.8 + (k % 2) * 0.5, 0.06, [0.08, 0.08, 0.09], 6); }
  put(v, G.cyl8, U0 + 6.5, 4.2, 34.6, 2.2, 1.1, 2.2, ac); cable(d, [U0 + 6.5, 3.2, 34.6], [U0 + 6.5, 0.1, 36.2], 0.4, 0.09, DARK, 5);
  // aviation lights on the leg tops, amber strobes on the sill beams
  for (const du of [-9, 9]) for (const rv of RAIL_V) put(nb, G.ball, U0 + du, H + 0.3, rv, 0.22, 0.22, 0.22, [1, 0.06, 0.04]);
  void rust;
}

// =============================================================== quay ground ====
function quayGround(W) {
  const u0 = QUAY.u0, u1 = QUAY.u1;
  for (let u = u0; u < u1; u += 60) {
    const ue = Math.min(u1, u + 60); const v = W.b('vcol', u + 30, 20), d = W.b('vcolD', u + 30, 20), mk = W.b('mark', u + 30, 20);
    // crane rails in a dark recessed channel, rail clips every 1.5 m
    for (const rv of RAIL_V) { box(mk, u, 0.0, rv - 0.45, ue, 0.025, rv + 0.45, {}, [0.13, 0.13, 0.14]); box(v, u, 0.0, rv - 0.08, ue, 0.16, rv + 0.08, {}, [0.42, 0.42, 0.44]);
      for (let x = u + 0.5; x < ue; x += 1.5) put(d, kg().box, x, 0.06, rv, 0.2, 0.08, 0.55, [0.2, 0.2, 0.21]); }
    // on-dock rail siding (v = 38.5): 2 rails on sleepers in ballast
    box(mk, u, 0.0, 36.6, ue, 0.03, 40.4, {}, [0.24, 0.22, 0.2]);
    for (const o of [-0.72, 0.72]) box(v, u, 0.03, 38.5 + o - 0.04, ue, 0.2, 38.5 + o + 0.04, {}, [0.36, 0.3, 0.26]);
    for (let x = u + 0.3; x < ue; x += 0.65) put(d, kg().box, x, 0.07, 38.5, 0.24, 0.08, 2.5, [0.27, 0.22, 0.18]);
    // lane lines under the cranes (yellow), white dashes, yard edge lines, hatched safety boxes at the crane legs
    for (const lv of [7, 16.5, 25]) box(mk, u, 0.0, lv - 0.08, ue, 0.03, lv + 0.08, {}, [0.85, 0.62, 0.08]);
    for (const lv of [11.8, 21.3]) for (let x = u; x < ue - 2; x += 6) box(mk, x, 0.0, lv - 0.07, x + 3, 0.03, lv + 0.07, {}, [0.8, 0.8, 0.78]);
    for (const lv of [43.3, 62.3]) box(mk, u, 0.0, lv - 0.1, ue, 0.03, lv + 0.1, {}, [0.86, 0.86, 0.84]);
    // edge: coping in hazard yellow, bollards every 12 m, rubber fenders on the face
    box(v, u, 0.0, 0.05, ue, 0.22, 0.55, {}, [0.8, 0.6, 0.1]);
    for (let x = u + 6; x < ue; x += 12) { put(v, kg().cyl8, x, 0.55, 1.2, 0.32, 0.9, 0.32, [0.12, 0.12, 0.13]); put(v, kg().cyl8, x, 1.05, 1.2, 0.48, 0.14, 0.48, [0.12, 0.12, 0.13]);
      put(v, kg().box, x + 3, -1.4, -0.35, 1.6, 2.6, 0.7, [0.05, 0.05, 0.05]); }
  }
  // bay numbers painted on the yard aprons in front of each block row (two-digit 7-seg digits), slot ticks
  BLOCKS.forEach((bu, bi) => { for (const [ln, la] of [[LINE_A, 'A'], [LINE_B, 'B']]) { const mk = W.b('mark', bu, ln.v0); const num = (bi + 1) * 2 + (la === 'B' ? 1 : 0);
    digits(mk, bu + 2, ln.v0 - 1.7, String(num).padStart(2, '0'), 1.6, [0.92, 0.92, 0.9]);
    for (let b = 0; b <= 5; b++) box(mk, bu + b * BAYP - 0.1, 0, ln.v0 - 0.9, bu + b * BAYP + 0.1, 0.03, ln.v0 - 0.1, {}, [0.92, 0.92, 0.9]);
    for (let r = 0; r <= ln.rows; r++) box(mk, bu - 1.1, 0, ln.v0 + r * ROWP - 0.08, bu - 0.2, 0.03, ln.v0 + r * ROWP + 0.08, {}, [0.92, 0.92, 0.9]); } });
  // puddles: in the rail channels, along the siding and in random dips; damp dark patches
  for (let i = 0; i < 46; i++) { const u = rand(u0 + 4, u1 - 4); const vv = pick([rand(1.5, 42), rand(1.5, 42), 3 + rand(-0.4, 0.4), 33 + rand(-0.4, 0.4), rand(40, 44), rand(60, 64)]);
    puddleAt(W, u, vv, rand(0.6, 2.6)); }
}
function digits(b, u, v, s, h, col) {
  const SEG = { 0: 'abcfed', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd' };
  const w = h * 0.55, t = h * 0.13; let x = u;
  for (const ch of s) { const segs = SEG[ch] || ''; const S = { a: [0, 1, 1, 1], b: [1, 1, 1, 0.5], c: [1, 0.5, 1, 0], d: [0, 0, 1, 0], e: [0, 0.5, 0, 0], f: [0, 1, 0, 0.5], g: [0, 0.5, 1, 0.5] };
    for (const k of segs) { const [x0, y0, x1, y1] = S[k]; const ax = x + x0 * w, az = v + (1 - y0) * h, bx = x + x1 * w, bz = v + (1 - y1) * h;
      box(b, Math.min(ax, bx) - t / 2, 0, Math.min(az, bz) - t / 2, Math.max(ax, bx) + t / 2, 0.032, Math.max(az, bz) + t / 2, {}, col); }
    x += w + h * 0.35; }
}
// vertical 7-seg digits on a sign face facing ±u (s), centred at (u, y, v)
function digits3(b, u, y, v, str, h, col, s) {
  const SEG = { 0: 'abcfed', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd' };
  const S = { a: [0, 1, 1, 1], b: [1, 1, 1, 0.5], c: [1, 0.5, 1, 0], d: [0, 0, 1, 0], e: [0, 0.5, 0, 0], f: [0, 1, 0, 0.5], g: [0, 0.5, 1, 0.5] };
  const w = h * 0.55, t = h * 0.12, tot = str.length * w + (str.length - 1) * h * 0.3; let x0 = -tot / 2;
  for (const ch of str) { for (const k of SEG[ch] || '') { const [a0, b0, a1, b1] = S[k]; const za = x0 + a0 * w, zb = x0 + a1 * w, ya = y - h / 2 + b0 * h, yb = y - h / 2 + b1 * h;
      put(b, kg().box, u, (ya + yb) / 2, v - s * (za + zb) / 2, 0.03, Math.abs(yb - ya) + t, Math.abs(zb - za) + t, col); }
    x0 += w + h * 0.3; }
}
function puddleAt(W, u, v, r) {
  const b = W.b('qpuddle', u, v); const n = 10, pts = []; const sx = rand(0.8, 2.2), ph = rand(0, 6);
  for (let i = 0; i < n; i++) { const t = -(i / n) * Math.PI * 2; const rr = r * (0.7 + 0.15 * Math.sin(t * 3 + ph) + rand(0, 0.25)); pts.push([u + Math.cos(t) * rr * sx, v + Math.sin(t) * rr]); }
  let A = 0; for (let i = 0; i < n; i++) { const p = pts[i], o = pts[(i + 1) % n]; A += p[0] * o[1] - o[0] * p[1]; } if (A > 0) pts.reverse();
  polyCap(b, pts, 0.035, {}, [0.2, 0.2, 0.21]);
}
function cone(b, x, y, z, h, r, col) { if (!cone.G) { cone.G = new THREE.CylinderGeometry(0.08, 1, 1, 14, 1, true); cone.G.translate(0, -0.5, 0); } put(b, cone.G, x, y, z, r, h, r, col); }
function pool(b, x, y, z, r, col) { b.quad(new THREE.Vector3(x - r, y, z + r), new THREE.Vector3(x + r, y, z + r), new THREE.Vector3(x + r, y, z - r), new THREE.Vector3(x - r, y, z - r), [0, 0, 1, 0, 1, 1, 0, 1], {}, col); }

// ===================================================================== props ====
function props(W) {
  // terminal tractors + skeletal chassis under the working cranes (the boxes on them are instanced)
  for (const c of CRANES) if (c.work) for (const lane of [12.5, 20.5]) { const u = c.u + rand(-3, 3); tractor(W, u + 8.6, lane); chassis(W, u, lane); }
  // straddle carriers parked along the yard edge, reach stackers + forklifts at block ends, rail flats under the siding boxes
  const sc = [[-200, 42.6], [-60, 42.6], [70, 42.6], [160, 42.6], [230, 42.6]]; for (const [u, vv] of sc) straddle(W, u, vv);
  for (const [u, vv, r] of [[-184, 56, 0.4], [40, 70, -0.5], [188, 58, 2.6]]) reachStacker(W, u, vv, r);
  for (const [u, vv, r] of [[-110, 42, 0.2], [-35, 61, 1.6], [110, 42.5, -0.8]]) forklift(W, u, vv, r);
  for (let u = -150; u < 60; u += 16.4) railFlat(W, u, 38.5);
  // block ID pylons (cyan light boxes with the painted block number, amber stack-height LEDs) at the lane end of every yard block
  BLOCKS.forEach((bu, bi) => { for (const [ln, la] of [[LINE_A, 0], [LINE_B, 1]]) { const u = bu - 2.2, vv = ln.v0 + 1.2; const v = W.b('vcol', u, vv), nb = W.b('neon', u, vv);
    put(v, kg().box, u, 3.0, vv, 0.25, 6.0, 0.25, DARK); put(v, kg().box, u, 6.4, vv, 0.5, 1.6, 2.4, [0.06, 0.06, 0.07]);
    for (const s of [-1, 1]) { put(nb, kg().box, u + s * 0.26, 6.4, vv, 0.02, 1.35, 2.15, [0.04, 0.34, 0.4]); digits3(nb, u + s * 0.28, 6.4, vv, String((bi + 1) * 2 + la).padStart(2, '0'), 0.85, [0.75, 0.85, 0.85], s); }
    for (let k = 0; k < 5; k++) put(nb, kg().box, u, 1.6 + k * 0.5, vv + 0.14, 0.27, 0.18, 0.02, k < 2 + ((bi + la) % 3) ? [1, 0.5, 0.06] : [0.08, 0.05, 0.03]); } });
  // hatch covers landed on the quay, lashing-cone bins, a reefer power rack
  for (const [u, vv] of [[-141, 26.8], [-92, 26.8], [-40, 26.8]]) { const v = W.b('vcol', u, vv); box(v, u - 6.3, 0, vv - 5, u + 6.3, 1.3, vv + 5, {}, [0.22, 0.32, 0.28]); for (let x = -6; x <= 6; x += 2) put(W.b('vcolD', u, vv), kg().box, u + x, 1.35, vv, 0.15, 0.1, 9.8, [0.17, 0.25, 0.22]); }
  for (let i = 0; i < 8; i++) { const u = rand(-180, 30), vv = rand(27.5, 30.5); const d = W.b('vcolD', u, vv); box(d, u - 0.6, 0, vv - 0.6, u + 0.6, 0.9, vv + 0.6, {}, pick([[0.2, 0.4, 0.7], [0.75, 0.35, 0.1], [0.3, 0.3, 0.3]])); }
  for (const bu of [BLOCKS[1], BLOCKS[4]]) { const u = bu - 4, vv = LINE_B.v0 + 2; const v = W.b('vcol', u, vv), nb = W.b('neon', u, vv);
    beam(v, [u, 0, vv - 3], [u, 0, vv + 8], 0.9, [0.3, 0.32, 0.34], 0.2); for (let k = 0; k < 4; k++) { const z = vv - 2 + k * 2.8; beam(v, [u, 0, z], [u, 4.5, z], 0.25, [0.3, 0.32, 0.34]); put(nb, kg().box, u + 0.2, 1.8, z, 0.05, 0.25, 0.25, k % 2 ? [0.1, 1, 0.4] : [1, 0.3, 0.1]); }
    beam(v, [u, 4.6, vv - 3], [u, 4.6, vv + 8], 1.4, [0.25, 0.26, 0.27], 0.15); }
}
function tractor(W, u, vv) {
  const v = W.b('vcol', u, vv), d = W.b('vcolD', u, vv), nb = W.b('neon', u, vv); const c = pick([[0.9, 0.62, 0.1], [0.85, 0.85, 0.82], [0.2, 0.55, 0.75]]);
  box(v, u - 2.6, 0.55, vv - 1.2, u + 2.6, 1.25, vv + 1.2, {}, [0.15, 0.15, 0.16]); box(v, u + 0.5, 1.25, vv - 1.25, u + 2.7, 3.1, vv + 1.25, {}, c); box(v, u + 0.3, 3.1, vv - 1.3, u + 2.9, 3.25, vv + 1.3, {}, c.map((q) => q * 0.8));
  put(nb, kg().box, u + 2.72, 2.4, vv, 0.04, 0.9, 2.1, [0.12, 0.16, 0.2]); put(nb, kg().box, u + 1.6, 3.35, vv, 0.35, 0.18, 0.35, [1, 0.55, 0.05]);
  for (const s of [-1, 1]) put(nb, kg().box, u + 2.71, 1.0, vv + s * 0.9, 0.05, 0.2, 0.3, [1, 0.95, 0.8]);
  for (const x of [-1.8, 1.9]) for (const s of [-1, 1]) { const R = new THREE.Matrix4().makeRotationX(Math.PI / 2); const m = new THREE.Matrix4().makeScale(0.55, 0.45, 0.55).premultiply(R).setPosition(u + x, 0.55, vv + s * 1.05); v.geom(kg().cyl8, m, {}, DARK); }
  box(v, u - 2.4, 1.25, vv - 0.9, u - 1.0, 1.45, vv + 0.9, {}, [0.3, 0.3, 0.3]); put(d, kg().cyl8, u + 0.4, 3.6, vv + 1.0, 0.1, 1.4, 0.1, [0.4, 0.4, 0.42]);
}
function chassis(W, u, vv) {
  const v = W.b('vcol', u, vv), d = W.b('vcolD', u, vv);
  for (const s of [-0.5, 0.5]) beam(v, [u - 6.1, 1.2, vv + s], [u + 6.1, 1.2, vv + s], 0.22, [0.12, 0.12, 0.13], 0.35);
  for (const x of [-5.6, 0, 5.6]) beam(v, [u + x, 1.25, vv - 1.2], [u + x, 1.25, vv + 1.2], 0.2, [0.12, 0.12, 0.13], 0.2);
  for (const x of [-4.6, -3.3]) for (const s of [-1, 1]) { const R = new THREE.Matrix4().makeRotationX(Math.PI / 2); const m = new THREE.Matrix4().makeScale(0.5, 0.6, 0.5).premultiply(R).setPosition(u + x, 0.5, vv + s * 0.95); v.geom(kg().cyl8, m, {}, DARK); }
  for (const s of [-1, 1]) put(d, kg().box, u + 4.5, 0.75, vv + s * 0.9, 0.1, 0.8, 0.1, [0.3, 0.3, 0.3]);
}
function straddle(W, u, vv) {
  const v = W.b('vcol', u, vv), d = W.b('vcolD', u, vv), nb = W.b('neon', u, vv); const c = [0.92, 0.66, 0.12]; const H = 14.5;
  for (const s of [-1, 1]) { box(v, u - 5.4, 0.9, vv + s * 2.0 - 0.4, u + 5.4, 2.0, vv + s * 2.0 + 0.4, {}, c);
    for (const x of [-4.6, -1.6, 1.6, 4.6]) { const R = new THREE.Matrix4().makeRotationX(Math.PI / 2); const m = new THREE.Matrix4().makeScale(0.7, 0.5, 0.7).premultiply(R).setPosition(u + x, 0.7, vv + s * 2.0); v.geom(kg().cyl8, m, {}, DARK); }
    for (const x of [-4.2, 4.2]) beam(v, [u + x, 2.0, vv + s * 2.0], [u + x * 0.85, H, vv + s * 2.0], 0.55, c);
    beam(v, [u - 4.2, 7, vv + s * 2.0], [u + 4.2, 7, vv + s * 2.0], 0.3, c); beam(d, [u - 4.2, 2.2, vv + s * 2.0], [u, 7, vv + s * 2.0], 0.2, c); }
  box(v, u - 4.3, H, vv - 2.4, u + 4.3, H + 1.2, vv + 2.4, {}, c);
  box(v, u + 1.5, H + 1.2, vv + 1.0, u + 3.6, H + 3.4, vv + 2.6, {}, [0.85, 0.85, 0.82]); put(nb, kg().box, u + 3.62, H + 2.4, vv + 1.8, 0.04, 1.2, 1.4, [0.15, 0.2, 0.24]);
  box(v, u - 3.5, H + 1.2, vv - 2.2, u + 0.5, H + 2.6, vv + 0.5, {}, [0.3, 0.3, 0.32]); put(nb, kg().ball, u, H + 2.9, vv - 1, 0.2, 0.2, 0.2, [1, 0.55, 0.05]);
  for (const s of [-1, 1]) for (const x of [-3.8, 3.8]) tube(d, [u + x, H, vv + s * 1.6], [u + x, 4.5, vv + s * 1.3], 0.03, DARK, kg().tube4);
  box(v, u - 6.1, 4.0, vv - 1.4, u + 6.1, 4.5, vv + 1.4, {}, c.map((q) => q * 0.85));
}
function reachStacker(W, u, vv, r) {
  const v = W.b('vcol', u, vv), d = W.b('vcolD', u, vv), nb = W.b('neon', u, vv); const c = pick([[0.85, 0.2, 0.12], [0.9, 0.62, 0.1]]);
  const cr = Math.cos(r), sr = Math.sin(r); const P = (a, y, b) => [u + a * cr - b * sr, y, vv + a * sr + b * cr];
  beam(v, P(-3.5, 1.5, 0), P(3.5, 1.5, 0), 3.4, c, 1.6); beam(v, P(-3.6, 2.8, 0), P(-1.2, 2.8, 0), 2.8, c.map((q) => q * 0.8), 1.4);
  beam(v, P(0.5, 2.3, 0.9), P(0.5, 4.6, 0.9), 1.6, [0.85, 0.85, 0.82], 1.4); put(nb, kg().box, ...P(1.32, 3.8, 0.9), 0.05, 1.0, 1.2, [0.15, 0.2, 0.24], -r);
  beam(v, P(-2.5, 3.2, -0.4), P(6.5, 12.5, -0.4), 1.0, c, 1.1); beam(v, P(6.5, 12.5, -0.4), P(6.8, 11.4, -0.4), 0.6, DARK);
  box(v, ...[P(6.8, 0, 0)].map((q) => [q[0] - 1.0, 10.6, q[2] - 3.0])[0], ...[P(6.8, 0, 0)].map((q) => [q[0] + 1.0, 11.3, q[2] + 3.0])[0], {}, [0.9, 0.62, 0.1]);
  for (const a of [-2.2, 2.6]) for (const b of [-1.5, 1.5]) { const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(-r)); m.scale(new THREE.Vector3(0.85, 0.6, 0.85)); const q = P(a, 0.85, b); m.setPosition(q[0], q[1], q[2]); v.geom(kg().cyl8, m, {}, DARK); }
  put(nb, kg().ball, ...P(-1.5, 4.0, 0), 0.18, 0.18, 0.18, [1, 0.55, 0.05]); put(d, kg().cyl8, ...P(-3.0, 4.2, 0.8), 0.12, 1.6, 0.12, DARK);
}
function forklift(W, u, vv, r) {
  const v = W.b('vcol', u, vv), d = W.b('vcolD', u, vv); const c = [0.95, 0.68, 0.1]; const cr = Math.cos(r), sr = Math.sin(r); const P = (a, y, b) => [u + a * cr - b * sr, y, vv + a * sr + b * cr];
  beam(v, P(-1.2, 0.8, 0), P(1.0, 0.8, 0), 1.2, c, 0.9); beam(v, P(-1.3, 1.1, 0), P(-0.7, 1.1, 0), 1.15, [0.2, 0.2, 0.2], 0.7);
  for (const b of [-0.5, 0.5]) { beam(v, P(-0.6, 1.2, b), P(-0.6, 2.2, b), 0.06, DARK); beam(v, P(0.5, 1.2, b), P(0.5, 2.2, b), 0.06, DARK); beam(v, P(1.2, 0.1, b * 0.6), P(1.2, 3.2, b * 0.6), 0.1, DARK); beam(d, P(1.3, 0.12, b * 0.4), P(2.4, 0.12, b * 0.4), 0.12, DARK, 0.05); }
  box(v, ...P(0, 2.2, 0).map((q, i) => q - [0.7, 0, 0.6][i]), ...P(0, 2.28, 0).map((q, i) => q + [0.7, 0, 0.6][i]), {}, [0.2, 0.2, 0.2]);
  for (const a of [-0.8, 0.7]) for (const b of [-0.55, 0.55]) put(v, kg().cyl8, ...P(a, 0.3, b), 0.3, 0.25, 0.3, DARK);
}
function railFlat(W, u, vv) {
  const v = W.b('vcol', u, vv), d = W.b('vcolD', u, vv);
  box(v, u - 7.8, 0.75, vv - 1.3, u + 7.8, 1.25, vv + 1.3, {}, [0.32, 0.22, 0.16]);
  for (const x of [-6, 6]) { for (const o of [-0.9, 0.9]) put(v, kg().cyl8, u + x + o, 0.5, vv, 0.42, 1.8, 0.42, DARK); box(d, u + x - 1.4, 0.35, vv - 1.1, u + x + 1.4, 0.75, vv + 1.1, {}, [0.15, 0.15, 0.15]); }
  for (const s of [-1, 1]) put(d, kg().box, u + s * 8.0, 0.9, vv, 0.25, 0.25, 0.4, [0.6, 0.6, 0.6]);
}
function lightMasts(W) {
  for (let u = -240; u <= 240; u += 80) for (const vv of [41, 79]) { const v = W.b('vcol', u, vv), nb = W.b('neon', u, vv), cb = W.b('cone', u, vv), pl = W.b('pool', u, vv), d = W.b('vcolD', u, vv);
    const H = 34; put(v, kg().cyl8, u, H / 2, vv, 0.45, H, 0.45, STEEL); put(v, kg().cyl8, u, 0.5, vv, 0.8, 1.0, 0.8, [0.4, 0.4, 0.4]);
    box(v, u - 3.2, H, vv - 0.5, u + 3.2, H + 0.4, vv + 0.5, {}, DARK); box(v, u - 3.2, H + 1.2, vv - 0.5, u + 3.2, H + 1.5, vv + 0.5, {}, DARK);
    for (const o of [-2.4, -0.8, 0.8, 2.4]) { put(v, kg().box, u + o, H + 0.75, vv - 0.1, 1.2, 0.9, 0.5, [0.25, 0.25, 0.27]); put(nb, kg().box, u + o, H + 0.75, vv - 0.37, 1.0, 0.7, 0.04, [1, 0.85, 0.6].map((q) => q * 1.3)); }
    for (let y = 1.5; y < H; y += 0.4) put(d, kg().box, u + 0.48, y, vv, 0.06, 0.04, 0.45, DARK); // ladder rungs
    put(nb, kg().ball, u, H + 1.8, vv, 0.22, 0.22, 0.22, [1, 0.06, 0.04]);
    void cb; void pl; // light cone + ground pool live in the base nightLights() layer (b_port2) so they also show from afar
  }
}

// ============================================================ night lighting ====
// b_port2: everything here is in the base LOD (built once within BASE_R, kept), so the port is lit from across the harbour too.
// No real lights: emissive 'neon' parts, additive ground pools / wall washes (pool material, any quad orientation), volumetric
// cones (cone material) and glow sprites (Glows). Only the glow sprites are a new shader program.
const AMBER = [1, 0.55, 0.08], RED = [1, 0.06, 0.04], WARM = [1, 0.8, 0.52], CYAN = [0.1, 0.85, 1], MAG = [1, 0.18, 0.75];
const sc = (c, k) => c.map((q) => q * k);
// vertical wash quad facing +v (n = 1) or -v (n = -1) at plane v, centre (u, y), half sizes (ru, ry)
function washV(b, u, y, v, ru, ry, col, n = 1) { const a = new THREE.Vector3(u - ru * n, y - ry, v), c = new THREE.Vector3(u + ru * n, y - ry, v), e = new THREE.Vector3(u + ru * n, y + ry, v), f = new THREE.Vector3(u - ru * n, y + ry, v);
  b.quad(a, c, e, f, [0, 0, 1, 0, 1, 1, 0, 1], {}, col); }
// wash quad facing +u / -u at plane u
function washU(b, u, y, v, rv, ry, col, n = 1) { const a = new THREE.Vector3(u, y - ry, v + rv * n), c = new THREE.Vector3(u, y - ry, v - rv * n), e = new THREE.Vector3(u, y + ry, v - rv * n), f = new THREE.Vector3(u, y + ry, v + rv * n);
  b.quad(a, c, e, f, [0, 0, 1, 0, 1, 1, 0, 1], {}, col); }
// b_portnight: port night tuning against the street lamps after b_lampfix (霓港 lamp pools 0.45 gain, 11.2 m) and the b_portlight
// yard pools behind the back fence. Measured (22:00, same cameras, nopost): the port is NOT over-lit — its ground stays darker than
// the lamp-lit streets (truck lane ~16 / 255 vs ~23 at the yard gate street, quay ~9) — but (a) the back-row mast pools (centre
// v = 71, 24 m) spilled ~9 m over the yard fence (v ≈ 86) onto the b_portlight cool pools, and (b) under each working crane four 12 m
// flood pools + the 16 m work-lane pool stacked into one hot patch (+135 / 255 over bare ground). New: back-row mast pool radius
// 24 → 20 m (the tail at the fence drops ~60 %; 16 m was tried and darkened the truck lane 15.6 → 12.2, so not used), truck-lane pool
// 0.5 → 0.85 (keeps that lane lit next to the fence), crane flood pools ×0.75 (softer hot patch, still the brightest quay ground).
// Front-row masts, inner hot spots, glows (aviation / warning lights), cones and LED strips unchanged.
// Same geometry counts (radius / vertex colour only): no new lights, programs or draw calls.
//   PK = [back-row mast pool radius m, front-row mast pool radius m, mast inner gain, crane flood pool gain, crane work-lane gain,
//         truck-lane (behind line B) pool gain]; ?oldport → b_port2 values; ?portk=a,b,c,d,e,f overrides (build time).
const PK_OLD = [24, 24, 0.5, 1.0, 0.35, 0.5], PK_NEW = [20, 24, 0.5, 0.75, 0.35, 0.85];
const PK_Q = typeof location !== 'undefined' ? location.search : '';
export const PK = /[?&]oldport\b/.test(PK_Q) ? PK_OLD : (() => { const m = /[?&]portk=([0-9.,]+)/.exec(PK_Q); if (!m) return PK_NEW; const v = m[1].split(',').map(Number); return PK_NEW.map((d, i) => (isFinite(v[i]) && i < v.length ? v[i] : d)); })();
function nightLights(W, GL) {
  const S = SHIP;
  // --- yard high masts: four lamp heads each, a long amber cone and a 24 m sodium pool; red top light
  for (let u = -240; u <= 240; u += 80) for (const vv of [41, 79]) { const cb = W.b('cone', u, vv), pl = W.b('pool', u, vv); const H = 34;
    cone(cb, u, H, vv - 2, H - 0.1, 12, sc([0.9, 0.78, 0.55], 0.6)); pool(pl, u, 0.05, vv - 8, vv > 60 ? PK[0] : PK[1], [1.0, 0.78, 0.5]); pool(pl, u, 0.07, vv - 8, 9, sc(WARM, PK[2]));
    for (const o of [-2.4, -0.8, 0.8, 2.4]) GL.add(u + o, H + 0.6, vv - 0.45, 0.9, sc(WARM, 1.1));
    GL.add(u, H + 1.8, vv, 0.5, RED, 1); }
  // --- container lanes: cross-aisle pools between yard blocks (cyan spill from the block ID pylons + sodium), the lane between the
  //     two lines and the truck lane behind line B
  BLOCKS.forEach((bu, bi) => { const gu = bu + 5 * BAYP + 5.2; const pl = W.b('pool', gu, 60);
    for (const ln of [LINE_A, LINE_B]) { pool(pl, bu - 2.2, 0.06, ln.v0 + 1.2, 6, sc(CYAN, 0.55)); GL.add(bu - 2.2 + 0.3, 6.4, ln.v0 + 1.2, 0.7, sc(CYAN, 0.6)); }
    if (gu < QUAY.u1 - 4) { pool(pl, gu, 0.06, 53, 8, sc(WARM, 0.55)); pool(pl, gu, 0.06, 70, 7, sc(bi % 2 ? MAG : CYAN, 0.35)); }
    for (let k = 0; k < 2; k++) pool(pl, bu + 16 + k * 32, 0.06, 63.1, 6.5, sc(WARM, 0.45));
    pool(pl, bu + 32, 0.06, 84, 13, sc(WARM, PK[5])); });
  // --- STS cranes: aviation lights (leg tops, A-frame apex, boom tip / raised boom tip), quay floods (cone + pool), lens glows,
  //     amber strobes on the sill beams, a lit spreader zone under the working ones
  for (const c of CRANES) { const U0 = c.u, H = 46, Hb = 49; const cb = W.b('cone', U0, 18), pl = W.b('pool', U0, 18), nb = W.b('neon', U0, 18);
    for (const du of [-9, 9]) for (const rv of RAIL_V) GL.add(U0 + du, H + 0.4, rv, 0.45, RED, 1);
    GL.add(U0, 81.2, 10, 0.7, RED, 1);
    if (c.up) GL.add(U0, Hb + Math.sin(1.36) * 54 + 1, -2 - Math.cos(1.36) * 54, 0.7, RED, 1); else { GL.add(U0, Hb + 1.2, -56, 0.6, RED, 1); GL.add(U0, Hb + 1.2, 50, 0.5, RED, 1); }
    for (const rv of RAIL_V) for (const du of [-5, 5]) GL.add(U0 + du, 2.6, rv + (rv < 10 ? -1.0 : 1.0), 0.35, AMBER, 2);
    const lampZ = c.up ? [6, 20, 30] : [-48, -36, -24, -12, 6, 20, 30];
    for (const s of [-4, 4]) for (const z of lampZ) { GL.add(U0 + s, Hb - 2.1, z, 0.55, sc(WARM, 1.2));
      if (z > -6 && z < 25) { cone(cb, U0 + s, Hb - 2.05, z, Hb - 2.15, 5, [0.95, 0.75, 0.45]); pool(pl, U0 + s, 0.06, z, 12, sc([1.0, 0.76, 0.46], PK[3])); } }
    if (!c.up) { pool(pl, U0, 0.08, 16, 16, sc(WARM, PK[4])); // work lane under the backreach (trucks)
      washV(pl, U0, S.deck * 0.5, S.vC + S.B / 2 + 0.06, 13, S.deck * 0.5, sc(WARM, 0.55)); } // flood spill on the hull side below the crane
    // cyan LED strip on the leg faces (reads as a cyber crane from afar)
    for (const du of [-9, 9]) for (const rv of RAIL_V) put(nb, kg().box, U0 + du, 28, rv + (rv < 10 ? -1.04 : 1.04), 0.14, 32, 0.04, sc(CRANE_COL[c.s].led, 0.5)); }
  // --- quay edge: amber warning beacons every 24 m (slow blink) with small pools, cyan LED line along the coping face
  for (let u = QUAY.u0 + 6; u < QUAY.u1; u += 24) { const pl = W.b('pool', u, 0), nb = W.b('neon', u, 0);
    put(nb, kg().box, u, 0.42, 0.45, 0.22, 0.22, 0.22, AMBER); GL.add(u, 0.55, 0.45, 0.3, AMBER, 1); pool(pl, u, 0.24, 1.6, 3.2, sc(AMBER, 0.6)); }
  for (let u = QUAY.u0; u < QUAY.u1; u += 60) put(W.b('neon', u + 30, 0), kg().box, u + 30, 0.12, 0.03, Math.min(60, QUAY.u1 - u), 0.06, 0.03, sc(CYAN, 0.45));
  // --- the ship: deck floods on the lashing bridges (cone onto the stacks), lit portholes / accommodation, masthead + nav lights,
  //     anchor / stern lights, funnel + hull name washes
  for (let b = 0; b < 11; b += 2) { const u = S.u0 + S.L * 0.19 + b * 13.4 - 0.5; const cb = W.b('cone', u, S.vC), pl = W.b('pool', u, S.vC);
    for (const sd of [-1, 1]) { GL.add(u, S.deck + 7.2, S.vC + sd * 13.5, 0.4, sc(WARM, 0.9)); cone(cb, u + 1, S.deck + 7.0, S.vC + sd * 13.5, 5.5, 4, sc([0.95, 0.8, 0.55], 0.6)); }
    void pl; }
  { const a0 = S.u0 + 16, a1 = a0 + 14, hw = 12.5, deckH = 2.85, nd = 7; const nb = W.b('neon', S.u0 + 25, S.vC), pl = W.b('pool', S.u0 + 25, S.vC); const r = mulberry(4711);
    for (let k = 1; k <= nd; k++) { const y = S.deck + 2 + k * deckH - 1.35; for (const sd of [-1, 1]) for (let i = 0; i < 9; i++) { if (r() < 0.45) continue;
      put(nb, kg().box, a0 + 1 + i * 1.5, y, S.vC + sd * (hw + 0.08), 0.55, 0.55, 0.03, r() < 0.15 ? sc(CYAN, 0.5) : [0.42, 0.34, 0.22]); } // portholes / cabin windows
      if (k % 2) GL.add(a1 + 0.3, y + 1.0, S.vC + hw - 1.5, 0.35, sc(WARM, 0.8)); }
    washU(pl, a1 + 0.12, S.deck + 6, S.vC, 10, 6, sc(WARM, 0.4)); // deck floods washing the front of the house
    const top = S.deck + 2 + nd * deckH, mu = a0 + 6;
    GL.add(mu, top + 12.5, S.vC, 0.55, [1, 0.95, 0.85]); GL.add(a0 + 3, top + 2.4, S.vC - S.B / 2 - 0.8, 0.5, RED); GL.add(a0 + 3, top + 2.4, S.vC + S.B / 2 + 0.8, 0.5, [0.1, 1, 0.3]);
    GL.add(S.u0 + S.L - 14, S.deck + 2.6 + 11.3, S.vC, 0.5, [1, 0.95, 0.85]); GL.add(S.u0 + 0.5, S.deck + 3, S.vC, 0.45, [1, 0.95, 0.85]);
    const f0 = S.u0 + 7; washV(pl, f0 + 3.5, top + 4, S.vC + 4.1, 4.5, 5, sc(CYAN, 0.35)); // funnel emblem glow spilling on the casing
    washV(pl, S.u0 + S.L * 0.5, 4.5, S.vC + S.B / 2 + 0.1, 30, 2.4, sc(WARM, 0.3)); } // hull name lit from the quay
}
