// Vehicles: realistic sports car (optimised glTF) + procedural sedans/SUVs/vans/taxis/police, arcade physics, traffic AI
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep } from './mats.js';
import { bodyProto } from './carbody.js';
import { buildInterior, interiorMats, setInteriorNight } from './carinterior.js';
import { U } from './env.js';
import { OLDENV2 } from './envprog.js'; // b_envprog2
import { CYBER } from './mapsel.js';
import { clamp, lerp, rand, pick, angWrap, rng } from './util.js';

const PAINTS = [0xf2f2ee, 0x101215, 0x8c9096, 0x1d3f7a, 0x7a1418, 0xd7d3c8, 0x2f4f4f, 0xb5b8bb, 0x5b1e3a, 0x0d5c63, 0xe36b2c, 0x2b2b2e, 0xcfc5a8, 0x6b7f99];
const SPORT_PAINTS = [0xc8102e, 0xf5c400, 0x111111, 0xf0f0f0, 0x00a3ad, 0xff5e1a, 0x7b2cbf, 0x2a6dd9];

const matCache = new Map();
// r6.4 vehicles3 paint look switches: metallic flake + clear-coat orange peel (both cheap ALU noise, no textures).
// URL ?carfx=0 turns them off (flat paint, same as r6.3); setCarFx(false) does the same at runtime.
const CARFX = { uFlake: { value: (typeof location !== 'undefined' && new URLSearchParams(location.search).get('carfx') === '0') ? 0 : 1 } };
export function setCarFx(on) { CARFX.uFlake.value = on ? 1 : 0; }
const SOLID = new Set([0xf2f2ee, 0xd7d3c8, 0xcfc5a8, 0xf2c230, 0xf0f0f0, 0xf5c400, 0xf4f4f4, 0xf0efe8, 0xffffff, 0xe36b2c]); // gloss solid colours (no flake)
function paintMat(color) {
  const k = 'p' + color; if (matCache.has(k)) return matCache.get(k);
  // v3.4: road dust / grime on the lower body (GTA6_REFERENCE §7 — dirt layers on paint), amount varies per paint
  const dirt = { value: 0.18 + ((color * 2654435761) % 1000) / 1000 * 0.55 };
  const solid = SOLID.has(color); const metal = { value: solid ? 0 : 1 };
  const m = prep(new THREE.MeshPhysicalMaterial({ color, metalness: solid ? 0.04 : 0.62, roughness: solid ? 0.36 : 0.3, clearcoat: 1.0, clearcoatRoughness: 0.035 }), solid ? 'paintS' : 'paintM', (sh) => {
    sh.uniforms.uDirt = dirt; sh.uniforms.uFlake = CARFX.uFlake; sh.uniforms.uMetal = metal;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPc; varying vec3 vOPc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPc = (modelMatrix * vec4(transformed, 1.0)).xyz; vOPc = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPc; varying vec3 vOPc; uniform float uDirt; uniform float uFlake; uniform float uMetal;
float dh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float dn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(dh(i), dh(i+vec2(1,0)), f.x), mix(dh(i+vec2(0,1)), dh(i+vec2(1,1)), f.x), f.y); }
vec3 fh3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float dust = (1.0 - smoothstep(0.22, 0.95, vWPc.y)) * uDirt * (0.55 + 0.7 * dn(vWPc.xz * 5.0 + vWPc.y * 7.0));
dust = clamp(dust + uDirt * 0.12 * dn(vWPc.xz * 1.3), 0.0, 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.355, 0.30), dust);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, dust);')
      // metallic flake: ~2.5 mm cells, each tilts the BASE-layer normal (the clear coat above stays mirror smooth); faded out
      // once a flake gets smaller than a pixel so distant cars never shimmer
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uFlake * uMetal > 0.0) { vec3 fp = vOPc * 400.0; float fw = length(fwidth(fp)); float fk = (1.0 - smoothstep(0.7, 2.2, fw)) * (1.0 - dust);
  if (fk > 0.0) { vec3 r = fh3(floor(fp)) - 0.5; normal = normalize(normal + r * 0.55 * fk); } }`)
      // clear-coat orange peel: a very low-amplitude wobble of the coat normal (bends reflections like real paint)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
if (uFlake > 0.0) { vec2 op = vOPc.xz * 38.0 + vOPc.y * 21.0; float e = 0.04; float a0 = dn(op), ax = dn(op + vec2(e, 0.0)), ay = dn(op + vec2(0.0, e));
  float pk = 1.0 - smoothstep(0.02, 0.2, length(fwidth(vOPc)) * 38.0); clearcoatNormal = normalize(clearcoatNormal + vec3(ax - a0, ay - a0, 0.0) / e * 0.0045 * pk); }`)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - dust * 0.9;');
  });
  matCache.set(k, m); return m;
}
let SH = null;
function shared() {
  if (SH) return SH;
  SH = {
    // r6.2 see-through tinted glass: low alpha head-on, Fresnel-driven reflection + opacity at grazing angles (was 0.88 opaque black)
    glass: prep(new THREE.MeshPhysicalMaterial({ color: 0x14211f, metalness: 0.0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.4, envMapIntensity: 1.8 }), 'cglass2', (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
{ float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 4.0); gl_FragColor.a = clamp(mix(opacity, 0.92, fr) + 0.25 * dot(gl_FragColor.rgb, vec3(0.3, 0.6, 0.1)), 0.0, 0.95);
  gl_FragColor.rgb *= mix(vec3(0.86, 1.0, 0.96), vec3(1.0), fr); } // r6.4 faint green-blue body tint, reflections at grazing angles stay neutral`);
    }),
    tire: prep(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }), 'tire'),
    rim: prep(new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.28, metalness: 0.95 }), 'rim'),
    black: prep(new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.55, metalness: 0.2 }), 'cblack'),
    chrome: prep(new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.08, metalness: 1 }), 'chrome'),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 0.2, roughness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x6a0000, emissive: 0xff1010, emissiveIntensity: 0.3, roughness: 0.2 }),
    plate: prep(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), 'plate'),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, map: blobTex() }),
    lbRed: new THREE.MeshBasicMaterial({ color: 0xff2020 }), lbBlue: new THREE.MeshBasicMaterial({ color: 0x2050ff }),
    // r6.4 lamp internals: clear polycarbonate headlamp lens, smoked red tail lens, dark lamp cavity, LED strips, reverse lamps
    lens: prep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 }), 'clens'),
    tlens: prep(new THREE.MeshPhysicalMaterial({ color: 0x8a0a0a, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0x400000, emissiveIntensity: 0.2 }), 'ctlens'),
    lampIn: prep(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }), 'clampin'),
    drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf2ff, emissiveIntensity: 1.2, roughness: 0.2 }),
    rev: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.15 }),
    // night glow filling the lamp lenses (additive, invisible by day): headlamps read lit at a distance, not just the small bulbs
    hglow: new THREE.MeshBasicMaterial({ color: 0xfff1d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    tglow: new THREE.MeshBasicMaterial({ color: 0xff2414, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  SH.lens.renderOrder = 3; SH.hglow.visible = SH.tglow.visible = false; prep(SH.drl, 'cdrl'); prep(SH.rev, 'crev');
  prep(SH.head, 'chead'); prep(SH.tail, 'ctail');
  return SH;
}
function blobTex() {
  // r6.4 contact shadow: soft rounded-rectangle footprint (dense core under the floor pan, darker pads under the four tyres)
  // instead of the old radial blob. Plane is W*1.25 x L*1.15, so the car's footprint is ~80 % x 87 % of the texture.
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 64, 128);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,0.55)'; rr(9, 10, 46, 108, 14); g.fill();
  g.filter = 'blur(3px)'; g.fillStyle = 'rgba(255,255,255,0.8)'; rr(14, 18, 36, 92, 9); g.fill();
  g.filter = 'blur(2px)'; g.fillStyle = 'rgba(255,255,255,1)'; for (const [x, y] of [[11, 26], [47, 26], [11, 92], [47, 92]]) { rr(x - 5, y - 9, 10, 18, 4); g.fill(); }
  g.filter = 'none'; const t = new THREE.CanvasTexture(c); return t;
}
// r6.4 licence plates (original designs, no real-state marks): one 4x4 atlas per map, each car picks a cell.
// 索拉纳港: white with a sunrise band and teal numerals, rear plate only (like the coast it is modelled on); 霓港: dark plate,
// cyan numerals, magenta edge, front and rear.
let PLATES = null;
function plateAtlas() {
  if (PLATES) return PLATES;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'); let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const AL = 'ABCDEFGHJKLMNPRSTUVWXYZ', DG = '0123456789';
  const ch = (s) => s[Math.floor(r() * s.length)];
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 128; g.save(); g.translate(x, y);
    const num = CYBER ? 'NP' + ch(DG) + ch(DG) + '·' + ch(AL) + ch(DG) + ch(AL) : ch(DG) + ch(AL) + ch(AL) + '·' + ch(DG) + ch(DG) + ch(AL);
    if (!CYBER) {
      const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#fbfaf5'); gr.addColorStop(1, '#ece8dc'); g.fillStyle = gr; g.fillRect(2, 2, 252, 124);
      g.strokeStyle = '#3b4a52'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 120);
      g.fillStyle = '#f39a3c'; g.beginPath(); g.arc(128, 58, 26, Math.PI, 0); g.fill(); g.fillStyle = 'rgba(243,154,60,0.35)'; g.fillRect(20, 58, 216, 4);
      g.fillStyle = '#0f6d6a'; g.font = 'bold 20px "WenQuanYi Zen Hei", "Noto Sans CJK SC", sans-serif'; g.textAlign = 'center'; g.fillText('索拉纳港', 128, 30);
      g.fillStyle = '#123c44'; g.font = 'bold 58px "Anton", "Arial Narrow", sans-serif'; g.fillText(num, 128, 96);
      g.fillStyle = '#5a6a70'; g.font = '14px "WenQuanYi Zen Hei", sans-serif'; g.fillText('阳光海岸 · 2026', 128, 118);
    } else {
      g.fillStyle = '#0b0f1c'; g.fillRect(2, 2, 252, 124); g.strokeStyle = '#d02c8f'; g.lineWidth = 4; g.strokeRect(5, 5, 246, 118);
      g.fillStyle = '#8fe9ff'; g.font = 'bold 18px "WenQuanYi Zen Hei", sans-serif'; g.textAlign = 'left'; g.fillText('霓港', 16, 30); g.textAlign = 'right'; g.fillStyle = '#d02c8f'; g.fillText('NEOPORT', 240, 30);
      g.textAlign = 'center'; g.fillStyle = '#7ff0ff'; g.font = 'bold 54px "Anton", "Arial Narrow", sans-serif'; g.fillText(num, 128, 94);
      for (let k = 0; k < 22; k++) { g.fillStyle = r() < 0.5 ? '#2a3550' : '#47577a'; g.fillRect(20 + k * 10, 106, 4 + (k % 3) * 2, 12); }
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = prep(new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2 }), 'cplate');
  const frame = prep(new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.5, metalness: 0.3 }), 'cplatefr');
  PLATES = { mat, frame, geo: new Map() }; return PLATES;
}
function plateGeo(w, h, cell) {
  const P = plateAtlas(); const key = w.toFixed(3) + h.toFixed(3) + '|' + cell; if (P.geo.has(key)) return P.geo.get(key);
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; const cx = (cell % 4) / 4, cy = 1 - (Math.floor(cell / 4) + 1) / 4;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cx + uv.getX(i) * 0.25, cy + uv.getY(i) * 0.25);
  P.geo.set(key, g); return g;
}
function addPlates(m, slots, cell) {
  if (!slots) return; const P = plateAtlas();
  for (const s of slots) {
    if (s.front && !CYBER) continue; // the 索拉纳港 coast state issues rear plates only
    const fr = new THREE.Mesh(GBOX(s.w + 0.03, s.h + 0.03, 0.025), P.frame); fr.position.set(s.x, s.y, s.z - s.dir * 0.012); m.add(fr);
    const pl = new THREE.Mesh(plateGeo(s.w, s.h, cell), P.mat); pl.position.set(s.x, s.y, s.z + s.dir * 0.002); if (s.dir < 0) pl.rotation.y = Math.PI; m.add(pl);
  }
}
const GBOXC = new Map(); function GBOX(w, h, d) { const k = [w, h, d].join(','); if (!GBOXC.has(k)) GBOXC.set(k, new THREE.BoxGeometry(w, h, d)); return GBOXC.get(k); }

// ---------------------------------------------------------------------------- models ----
let sportProto = null;
// cabin layout of the glTF sports car in car space (z forward, +x = left / driver side); see carinterior.js
const SPORT_CABIN = { floorY: 0.2, beltY: 0.8, headY: 1.13, hwHead: 0.58, hwFront: 0.72, hwDash: 0.7, hwRear: 0.72, zCowl: 0.86, yCowl: 0.86, zWsTop: 0.12, yWsTop: 1.2, zDash: 0.5,
  front: { x: 0.36, y: 0.33, z: -0.28 }, rear: null, backWall: true, zBack: -0.78, zHead0: -0.62, zHead1: 0.1, sport: true, open: true, wheelY: 0.7 };
export function prepareSport(gltf) {
  const root = gltf.scene; const geoDone = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!geoDone.has(o.geometry)) { const g = toCreasedNormals(o.geometry, 0.6); geoDone.set(o.geometry, g); }
    o.geometry = geoDone.get(o.geometry);
    o.castShadow = true; o.receiveShadow = true;
    const n = o.material.name; const S = shared();
    if (n === 'Body_Color') o.material = paintMat(SPORT_PAINTS[0]), o.userData.paint = true;
    else if (/Glass_Gray/.test(n)) o.material = S.glass;
    else if (/Tires|plastic_gray/.test(n)) o.material = /Tires/.test(n) ? S.tire : S.black;
    else if (/metal_chrome/.test(n)) o.material = S.chrome;
    else if (/metal_gray/.test(n)) o.material = S.rim;
    else if (/Taillight/.test(n)) o.material = S.tail;
    else if (/Projector|Turn_Signal/.test(n)) o.material = S.head;
    else if (/Yellow/.test(n)) o.material = S.black; // r6.2 de-badged: the source model's yellow emblem shields / hub caps / plate badge now plain black (no brand marks)
    else o.material = S.black;
  });
  // r6.2 carve the source model's own low-detail cockpit (dash / steering wheel / seats) out of the non-paint parts so it never
  // doubles up with the modeled cabin: drop triangles whose centroid lies inside the cabin box (car space = proto rotated 180°)
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const carved = new Map(); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), M4 = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.paint || o.material === shared().glass || /wheel|tire|rim|centre|light|led/.test(o.name + '|' + (o.parent ? o.parent.name : ''))) return;
    const g = o.geometry; const pos = g.attributes.position; M4.multiplyMatrices(inv, o.matrixWorld);
    const idx = g.index ? g.index.array : null; const n = idx ? idx.length : pos.count; const keep = []; let cut = 0;
    for (let i = 0; i < n; i += 3) { const i0 = idx ? idx[i] : i, i1 = idx ? idx[i + 1] : i + 1, i2 = idx ? idx[i + 2] : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(M4); b.fromBufferAttribute(pos, i1).applyMatrix4(M4); c.fromBufferAttribute(pos, i2).applyMatrix4(M4); a.add(b).add(c).multiplyScalar(1 / 3);
      if (Math.abs(a.x) < 0.72 && a.y > 0.15 && a.y < 1.12 && -a.z > -0.85 && -a.z < 0.85) { cut++; continue; } keep.push(i0, i1, i2); }
    if (!cut) return; const ng = carved.get(g) || g.clone(); ng.setIndex(keep); carved.set(g, ng); o.geometry = ng; SPORT_CARVED += cut;
  });
  sportProto = root;
}
export let SPORT_CARVED = 0;

function cloneSport(color) {
  const g = new THREE.Group(); const m = sportProto.clone(true); m.rotation.y = Math.PI; g.add(m);
  const wheels = [];
  m.traverse((o) => { if (o.isMesh && o.userData.paint) o.material = paintMat(color); if (/^wheel_(f|r)(l|r)$/.test(o.name)) { o.rotation.order = 'YXZ'; wheels.push({ node: o, front: o.name[6] === 'f', r: 0.36 }); } });
  // r6.2 mid-engine cabin (low seats, wraparound dash, bulkhead behind the seats) + back-face lining of the shell
  const cabin = buildInterior(SPORT_CABIN, Math.abs(Math.round(color * 0.000371)) % 5); g.add(cabin.group); cabin.liner = [];
  const IMt = interiorMats(); const lin = [];
  m.traverse((o) => { if (o.isMesh && !o.userData.liner && (o.userData.paint || o.material === shared().black || o.material === shared().rim) && !/wheel|tire|rim|centre/.test(o.name + (o.parent ? o.parent.name : ''))) lin.push(o); });
  for (const o of lin) { const l = new THREE.Mesh(o.geometry, IMt.liner); l.userData.liner = true; l.castShadow = false; l.receiveShadow = true; o.add(l); cabin.liner.push(l); }
  return { group: g, wheels, dims: { L: 4.5, W: 2.0, H: 1.24, wb: 2.65 }, seatY: 0.45, cabin };
}

// ara3d vehicle models (MakeHuman project generator, MIT): static body + 4 wheel nodes (tools/splitcar.mjs)
const VP = {}; const CABIN = {};
const MODEL_SCALE = { car: 1.28, sports: 1.1, suv: 1.0, pickup: 1.0 };
const MODEL_DIMS = { car: { L: 3.75, W: 2.24, H: 1.45, wb: 2.75, wr: 0.33 }, sports: { L: 4.4, W: 2.1, H: 1.55, wb: 2.9, wr: 0.35 }, suv: { L: 4.9, W: 2.0, H: 1.9, wb: 2.6, wr: 0.34 }, pickup: { L: 5.3, W: 2.0, H: 1.9, wb: 2.9, wr: 0.34 } };
export function prepareModels(G) {
  const S = shared();
  const leather = prep(new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.8 }), 'leather');
  for (const k of Object.keys(MODEL_SCALE)) {
    if (!G['veh_' + k]) continue;
    const root = G['veh_' + k].scene; const done = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!done.has(o.geometry)) done.set(o.geometry, toCreasedNormals(o.geometry, 0.7));
      o.geometry = done.get(o.geometry); o.castShadow = true; o.receiveShadow = true;
      const n = o.material.name;
      if (/paint/.test(n)) o.userData.paint = true, o.material = paintMat(0xffffff);
      else if (/glass/.test(n)) o.material = S.glass;
      else if (/rubber/.test(n)) o.material = S.tire;
      else if (/headlight/.test(n)) o.material = S.head;
      else if (/tail/.test(n)) o.material = S.tail;
      else if (/plate/.test(n)) o.material = S.plate;
      else if (/upholstery/.test(n)) o.material = leather;
      else if (/dark metal/.test(n)) o.material = S.rim;
      else o.material = S.black;
    });
    VP[k] = root;
  }
  // v3.5 procedural lofted bodies (src/carbody.js) for everyday traffic
  const IMt = interiorMats();
  const BM = { liner: IMt.liner, hidden: IMt.hidden, paint: paintMat(0xffffff), glass: S.glass, black: S.black, chrome: S.chrome, head: S.head, tail: S.tail, plate: S.plate, interior: leather,
    amber: prep(new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0x803000, emissiveIntensity: 0.4, roughness: 0.2 }), 'amber'),
    lens: S.lens, tlens: S.tlens, lampIn: S.lampIn, drl: S.drl, rev: S.rev, hglow: S.hglow, tglow: S.tglow };
  for (const k of ['sedan', 'suv', 'van', 'pickup', 'muscle', 'conv', 'lifted']) { const P = bodyProto(k, BM); VP['b_' + k] = P.root; CABIN['b_' + k] = P.cabin; MODEL_SCALE['b_' + k] = 1; MODEL_DIMS['b_' + k] = { L: P.dims.L, W: P.dims.W, H: P.dims.H, wb: P.dims.wb, wr: P.dims.wr }; }
}
// ---- v3.5 procedural wheels: lathe tyre with rounded sidewall + tread grooves, extruded multi-spoke alloy face with bevels,
// rim barrel, lug nuts, centre cap, brake disc + caliper. Replaces the low-poly ara3d wheels (sized from their bounding box).
const WGEO = new Map();
function wheelGeo(r, hw, spokes, style) {
  const key = [r.toFixed(3), hw.toFixed(3), spokes, style].join('|'); if (WGEO.has(key)) return WGEO.get(key);
  const V2 = (a, b) => new THREE.Vector2(a, b);
  const tp = [V2(r * 0.66, -hw * 0.9), V2(r * 0.8, -hw * 0.98), V2(r * 0.92, -hw), V2(r * 0.975, -hw * 0.88), V2(r, -hw * 0.66), V2(r, -hw * 0.42), V2(r * 0.982, -hw * 0.36), V2(r * 0.982, -hw * 0.3), V2(r, -hw * 0.24),
    V2(r, -0.03 * hw), V2(r * 0.982, 0), V2(r, 0.03 * hw), V2(r, hw * 0.24), V2(r * 0.982, hw * 0.3), V2(r * 0.982, hw * 0.36), V2(r, hw * 0.42), V2(r, hw * 0.66), V2(r * 0.975, hw * 0.88), V2(r * 0.92, hw), V2(r * 0.8, hw * 0.98), V2(r * 0.66, hw * 0.9)];
  if (style === 2) for (const p of tp) { p.x = r * 0.58 + (p.x - r * 0.66) * (r - r * 0.58) / (r - r * 0.66); } // tall off-road sidewall
  let tyre = new THREE.LatheGeometry(tp, 32); tyre.rotateY(Math.PI / 32);
  const rr = r * (style === 2 ? 0.575 : 0.655); // rim radius
  // r6.4 sidewall: raised moulded lettering ring on the outer face (lathe band 2 mm proud of the sidewall, alpha-tested text)
  const swp = []; for (let k = 0; k <= 6; k++) { const t = k / 6; const rad = rr * 1.06 + (r * 0.95 - rr * 1.06) * t; let yy = -1; for (let q = tp.length - 1; q > tp.length / 2; q--) { const A = tp[q], B = tp[q - 1]; if ((A.x - rad) * (B.x - rad) <= 0 && A.x !== B.x) { yy = A.y + (B.y - A.y) * (rad - A.x) / (B.x - A.x); break; } } swp.push(new THREE.Vector2(rad, Math.max(yy, hw * 0.9) + 0.0025)); }
  swp.reverse(); const side = new THREE.LatheGeometry(swp, 48); // outer-to-inner like the tyre profile (same winding)
  if (style === 2) { // mud-terrain tread blocks
    const blocks = []; for (let i = 0; i < 26; i++) for (const sd of [-1, 1]) { const a = (i + (sd > 0 ? 0.5 : 0)) / 26 * Math.PI * 2; const b = new THREE.BoxGeometry(0.06, hw * 0.62, 0.075);
      b.translate(0, sd * hw * 0.38, 0); b.rotateY(-a); b.translate(Math.cos(a) * (r + 0.008), 0, Math.sin(a) * (r + 0.008)); blocks.push(b); }
    tyre = mergeGeos([tyre, ...blocks]); }
  const barrel = new THREE.CylinderGeometry(rr, rr, hw * 1.8, 28, 1, true);
  // spoke face: disc with N windows between spokes
  const sh = new THREE.Shape(); sh.absarc(0, 0, rr * 0.995, 0, Math.PI * 2, false);
  const N = spokes; const sw = style === 1 ? 0.13 : 0.2; // spoke angular half-width (rad, at the rim)
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + sw * (style === 1 ? 1.0 : 0.9), a1 = ((i + 1) / N) * Math.PI * 2 - sw;
    const ri = rr * (style === 1 ? 0.33 : 0.3), ro = rr * 0.86; const h = new THREE.Path();
    const n = 6; h.moveTo(Math.cos(a0 + 0.12) * ri, Math.sin(a0 + 0.12) * ri);
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; h.lineTo(Math.cos(a) * ro, Math.sin(a) * ro); }
    h.lineTo(Math.cos(a1 - 0.06) * ri * 1.05, Math.sin(a1 - 0.06) * ri * 1.05); h.closePath(); sh.holes.push(h);
  }
  const face = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 20 });
  face.rotateX(-Math.PI / 2); face.translate(0, hw * 0.45, 0); // lathe axis = Y, outer face toward +Y
  const lip = new THREE.TorusGeometry(rr * 0.99, 0.014, 6, 36); lip.rotateX(Math.PI / 2); lip.translate(0, hw * 0.78, 0);
  const cap = new THREE.CylinderGeometry(rr * 0.2, rr * 0.24, 0.05, 18); cap.translate(0, hw * 0.52, 0);
  const lugs = []; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const g = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6); g.translate(Math.cos(a) * rr * 0.25, hw * 0.56, Math.sin(a) * rr * 0.25); lugs.push(g); }
  const disc = new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.028, 28); disc.translate(0, hw * 0.12, 0);
  const cal = new THREE.BoxGeometry(rr * 0.42, 0.07, rr * 0.3); cal.translate(0, hw * 0.24, rr * 0.62);
  const valve = new THREE.CylinderGeometry(0.005, 0.006, 0.03, 6); valve.translate(rr * 0.92, hw * 0.75, 0);
  const out = { tyre, side, rim: mergeGeos([face, lip, cap, valve, ...lugs]), barrel, disc, cal };
  WGEO.set(key, out); return out;
}
function mergeGeos(gs) {
  const p = [], n = [], uv = [], idx = []; let off = 0;
  for (let g of gs) { if (!g.index) g = g; const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(off + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(off + i); off += P.count; }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); o.setIndex(idx); return o;
}
// r6.4 moulded sidewall lettering (original brand / size marks) as an alpha strip wrapped round the tyre
function sidewallTex() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 2048, 64);
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.font = 'bold 34px "Anton", "Arial Narrow", sans-serif';
  const put = (t, x, sz) => { g.font = 'bold ' + sz + 'px "Anton", "Arial Narrow", sans-serif'; g.save(); g.translate(x, 32); g.scale(1, -1); g.fillText(t, 0, 0); g.restore(); };
  for (const o of [0, 1024]) { put('MARLINA', o + 40, 40); put('SEAWAY  TOURING', o + 300, 24); put('245/45 R18  98W', o + 600, 22); put('M+S  RADIAL  TUBELESS', o + 820, 16); }
  g.fillRect(0, 2, 2048, 3); g.fillRect(0, 59, 2048, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
let WM = null;
function wheelMats() {
  if (WM) return WM; const S = shared();
  WM = { tyre: prep(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.88 }), 'tire'), alloy: prep(new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.95 }), 'rim'),
    dark: prep(new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.4, metalness: 0.9 }), 'rim'), disc: prep(new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.5, metalness: 0.9 }), 'rim'),
    calR: prep(new THREE.MeshStandardMaterial({ color: 0xa01818, roughness: 0.45 }), 'std'), calK: prep(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }), 'std'), barrel: S.black,
    side: prep(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.75, map: sidewallTex(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }), 'tside') };
  return WM;
}
function detailWheels(m, sc, spokes, style, darkRim, redCal) {
  const M = wheelMats(); const bb = new THREE.Box3();
  m.traverse((o) => {
    if (!/^wheel_(f|r)(l|r)$/.test(o.name)) return;
    bb.makeEmpty(); o.traverse((c) => { if (c.isMesh) { c.geometry.computeBoundingBox(); bb.union(c.geometry.boundingBox); c.visible = false; } });
    const sz = bb.getSize(new THREE.Vector3()); const r = Math.max(sz.y, sz.z) / 2 * 1.0, hw = Math.min(sz.x / 2, r * 0.45);
    const G = wheelGeo(r, hw, spokes, style); const grp = new THREE.Group();
    const parts = [[G.tyre, M.tyre], [G.side, M.side], [G.rim, darkRim ? M.dark : M.alloy], [G.barrel, M.barrel], [G.disc, M.disc], [G.cal, redCal ? M.calR : M.calK]];
    for (const [g, mt] of parts) { const me = new THREE.Mesh(g, mt); me.castShadow = true; me.receiveShadow = true; grp.add(me); }
    const outward = o.position.x >= 0 ? 1 : -1; grp.rotation.z = -outward * Math.PI / 2;
    const ctr = bb.getCenter(new THREE.Vector3()); grp.position.copy(ctr); o.add(grp);
    void sc;
  });
}

// r6.4 body variants: a share of everyday sedans are drawn as the muscle coupe or the convertible, a share of pickups as the
// lifted off-road truck (same vehicle type, handling and AI; only the look). Picked from a counter hash, so the game's
// rng sequence is untouched. Vehicle.vis.force = 'muscle' | 'conv' | 'lifted' pins the next car (shots / tests).
export const VIS = { force: null }; let VARN = 0;
function bodyVariant(k, type) {
  if (VIS.force && VP['b_' + VIS.force]) { const f = 'b_' + VIS.force; if ((k === 'b_sedan' && f !== 'b_lifted') || (k === 'b_pickup' && f === 'b_lifted')) return f; }
  const h = ((VARN++ * 2654435761) >>> 0) % 100;
  if (k === 'b_sedan' && type === 'sedan') return h < 16 ? 'b_muscle' : h < 30 ? 'b_conv' : k;
  if (k === 'b_pickup' && type === 'pickup') return h < 45 ? 'b_lifted' : k;
  return k;
}
function cloneModel(k, color, type) {
  k = bodyVariant(k, type);
  const g = new THREE.Group(); const m = VP[k].clone(true); const sc = MODEL_SCALE[k]; m.scale.setScalar(sc); g.add(m);
  const wheels = []; const d = MODEL_DIMS[k];
  { const h = Math.abs(Math.sin((typeof color === 'number' ? color : 1) * 0.37 + k.length)); if (k === 'b_lifted') detailWheels(m, sc, 6, 2, true, false); else if (k === 'b_muscle') detailWheels(m, sc, 5, 0, h > 0.6, h < 0.3); else
    detailWheels(m, sc, type === 'police' || k === 'b_pickup' ? 6 : h < 0.5 ? 5 : 10, h < 0.5 ? 0 : 1, k === 'b_pickup' || type === 'police' || h > 0.85, k === 'sports');
    addPlates(m, m.userData.plates, ((VARN * 7 + Math.round(h * 97)) >>> 0) % 16); }
  m.traverse((o) => { if (o.isMesh && o.userData.paint) { if (Array.isArray(o.material)) { o.material = o.material.slice(); o.material[o.userData.paintSlot || 0] = paintMat(color); } else o.material = paintMat(color); } if (/^wheel_(f|r)(l|r)$/.test(o.name)) { o.rotation.order = 'YXZ'; wheels.push({ node: o, front: o.name[6] === 'f', r: d.wr }); } });
  let lightbar = null;
  if (type === 'police') {
    lightbar = new THREE.Group(); lightbar.position.set(0, d.H + 0.02, -0.1);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0xff2020 })); a.position.x = -0.3; const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0x2050ff })); b.position.x = 0.3;
    lightbar.add(a, b); g.add(lightbar);
  }
  if (type === 'taxi') { const sg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.28), prep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9a8, emissiveIntensity: 0.6 }), 'taxisign')); sg.position.set(0, d.H + 0.08, -0.1); g.add(sg); }
  let cabin = null;
  if (CABIN[k]) { const seatIdx = type === 'police' || type === 'taxi' ? 0 : Math.abs(Math.round((typeof color === 'number' ? color : 7) * 0.000371)) % 5; cabin = buildInterior(CABIN[k], seatIdx); m.add(cabin.group);
    m.traverse((o) => { if (o.name === 'liner') cabin.liner = o; }); }
  return { group: g, wheels, dims: { L: d.L, W: d.W, H: d.H, wb: d.wb }, lightbar, seatY: 0.5, cabin };
}
const MODEL_OF = { sedan: 'b_sedan', taxi: 'b_sedan', police: 'b_sedan', suv: 'b_suv', pickup: 'b_pickup', van: 'b_van', sport2: 'sports' };

const GCACHE = new Map();
function extrudeSide(profile, width, bevel = 0.06) {
  const key = JSON.stringify(profile) + width + '|' + bevel; if (GCACHE.has(key)) return GCACHE.get(key);
  const sh = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  // shape is in xy; extrusion along +z. map: shape x -> car z (forward), shape y -> up, extrusion -> car x
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2);
  GCACHE.set(key, g); return g;
}

// lower body side profile with real wheel arches, extruded across the width, then sides pulled in near the top (tumblehome)
function bodyGeo(type, T) {
  const key = 'body' + type; if (GCACHE.has(key)) return GCACHE.get(key);
  const pts = []; const L2 = T.L / 2, ar = T.wr + 0.07, wb2 = T.wb / 2, y0 = 0.3;
  // bottom edge from rear to front with two arches (z forward)
  pts.push([-L2 + 0.05, y0]);
  for (const c of [-wb2, wb2]) { for (let i = 0; i <= 10; i++) { const a = Math.PI - i / 10 * Math.PI; pts.push([c + Math.cos(a) * ar, T.wr + Math.sin(a) * ar * 0.98]); } }
  pts.push([L2 - 0.05, y0]);
  // upper edge from front back to rear (from the type profile, skipping its two bottom points)
  const top = T.body.slice(2);
  const sh = new THREE.Shape(pts.concat(top).map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: T.W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(T.W - 0.16) / 2); g.rotateY(-Math.PI / 2);
  const p = g.attributes.position; const belt = T.body[3][1] - 0.15;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > belt) p.setX(i, p.getX(i) * (1 - (y - belt) * 0.25)); }
  g.computeVertexNormals();
  GCACHE.set(key, g); return g;
}
// procedural road cars: profile (z forward, y up) for lower body and greenhouse
const TYPES = {
  sedan: { L: 4.8, W: 1.86, body: [[-2.4, 0.32], [2.4, 0.32], [2.42, 0.62], [2.25, 0.78], [1.1, 0.92], [-1.5, 0.95], [-2.3, 0.9], [-2.42, 0.62]], cab: [[1.05, 0.9], [0.35, 1.42], [-1.0, 1.44], [-1.75, 0.94]], wb: 2.8, wr: 0.34, mass: 1 },
  suv: { L: 4.9, W: 1.96, body: [[-2.45, 0.38], [2.45, 0.38], [2.47, 0.75], [2.3, 0.98], [1.35, 1.08], [-2.4, 1.1], [-2.47, 0.75]], cab: [[1.3, 1.06], [0.75, 1.72], [-2.25, 1.76], [-2.38, 1.08]], wb: 2.9, wr: 0.39, mass: 1.25 },
  van: { L: 5.3, W: 2.0, body: [[-2.65, 0.38], [2.65, 0.38], [2.67, 0.8], [2.4, 1.05], [1.9, 1.15], [-2.62, 1.15], [-2.67, 0.8]], cab: [[1.9, 1.12], [1.35, 2.2], [-2.6, 2.25], [-2.62, 1.12]], wb: 3.3, wr: 0.38, mass: 1.5, solidCab: true },
  taxi: null, police: null,
};
TYPES.taxi = { ...TYPES.sedan }; TYPES.police = { ...TYPES.sedan };

function buildProcCar(type, color) {
  const T = TYPES[type]; const S = shared(); const g = new THREE.Group();
  const paint = paintMat(color);
  const body = new THREE.Mesh(bodyGeo(type, T), paint); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const sill = new THREE.Mesh(GCACHE.get('sill' + type) || GCACHE.set('sill' + type, new THREE.BoxGeometry(T.W - 0.06, 0.1, T.L * 0.98)).get('sill' + type), S.black); sill.position.y = 0.3; g.add(sill);
  if (type === 'police') { // two-tone doors
    const door = new THREE.Mesh(extrudeSide([[-1.3, 0.34], [1.2, 0.34], [1.2, 0.9], [-1.3, 0.93]], T.W + 0.02, 0.05), paintMat(0xf4f4f4)); g.add(door);
  }
  const cabW = T.W - 0.2;
  const cabG = (() => { const k = 'cab' + type; if (GCACHE.has(k)) return GCACHE.get(k); const gg = extrudeSide(T.cab, cabW, 0.06).clone(); const p = gg.attributes.position; const yb = T.cab[0][1]; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - Math.max(0, y - yb) * 0.22)); } gg.computeVertexNormals(); GCACHE.set(k, gg); return gg; })();
  const cab = new THREE.Mesh(cabG, T.solidCab ? paint : S.glass); cab.castShadow = true; g.add(cab);
  if (T.solidCab) { // van: side windows only at the front
    const win = new THREE.Mesh(extrudeSide([[1.85, 1.2], [1.38, 2.05], [0.7, 2.05], [0.7, 1.2]], cabW + 0.03, 0.03), S.glass); g.add(win);
  } else { // roof panel + pillars in body colour
    const c = T.cab; const roof = new THREE.Mesh(extrudeSide([[c[1][0] - 0.05, c[1][1] - 0.04], [c[2][0] + 0.05, c[2][1] - 0.04], [c[2][0] + 0.05, c[2][1] + 0.02], [c[1][0] - 0.05, c[1][1] + 0.02]], cabW + 0.01, 0.03), paint); roof.castShadow = true; g.add(roof);
    const pil = new THREE.Mesh(extrudeSide([[0.0, 0.92], [0.12, 0.92], [-0.02, 1.4], [-0.14, 1.4]], cabW + 0.025, 0.02), paint); g.add(pil);
  }
  const L = T.L / 2;
  // lights, grille, bumpers, plates, mirrors
  const box = (w, h, d, m, x, y, z) => { const k = 'b' + w + ',' + h + ',' + d; if (!GCACHE.has(k)) GCACHE.set(k, new THREE.BoxGeometry(w, h, d)); const b = new THREE.Mesh(GCACHE.get(k), m); b.position.set(x, y, z); g.add(b); return b; };
  for (const s of [-1, 1]) {
    box(0.42, 0.13, 0.06, S.head, s * (T.W / 2 - 0.3), T.body[2][1] - 0.03, L + 0.01);
    box(0.36, 0.12, 0.05, S.tail, s * (T.W / 2 - 0.28), T.body[T.body.length - 1][1] + 0.05, -L - 0.01);
    box(0.1, 0.1, 0.18, type === 'police' ? S.black : paint, s * (T.W / 2 + 0.06), T.cab[0][1] + 0.08, T.cab[0][0] - 0.25);
  }
  box(T.W * 0.45, 0.16, 0.04, S.black, 0, T.body[2][1] - 0.14, L + 0.02);
  box(T.W - 0.1, 0.18, 0.12, S.black, 0, 0.38, L - 0.02);
  box(T.W - 0.1, 0.18, 0.12, S.black, 0, 0.38, -L + 0.02);
  box(0.52, 0.12, 0.02, S.plate, 0, 0.5, -L - 0.04);
  if (type === 'taxi') { box(0.7, 0.18, 0.28, prep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9a8, emissiveIntensity: 0.6 }), 'taxisign'), 0, T.cab[1][1] + 0.1, -0.3); }
  let lightbar = null;
  if (type === 'police') {
    lightbar = new THREE.Group(); lightbar.position.set(0, T.cab[1][1] + 0.06, -0.3);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0xff2020 })); a.position.x = -0.3; const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0x2050ff })); b.position.x = 0.3;
    lightbar.add(a, b); g.add(lightbar);
  }
  // wheels
  const wheels = [];
  const tk = 'tire' + T.wr; if (!GCACHE.has(tk)) { const a = new THREE.CylinderGeometry(T.wr, T.wr, 0.24, 18); a.rotateZ(Math.PI / 2); const b = new THREE.CylinderGeometry(T.wr * 0.66, T.wr * 0.66, 0.25, 12); b.rotateZ(Math.PI / 2); GCACHE.set(tk, [a, b]); }
  const [tireG, rimG] = GCACHE.get(tk);
  for (const [fx, fz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Group(); w.rotation.order = 'YXZ'; w.position.set(fx * (T.W / 2 - 0.12), T.wr, fz * T.wb / 2);
    const t = new THREE.Mesh(tireG, S.tire); t.castShadow = true; w.add(t); const r = new THREE.Mesh(rimG, S.rim); w.add(r);
    g.add(w); wheels.push({ node: w, front: fz > 0, r: T.wr });
  }
  return { group: g, wheels, dims: { L: T.L, W: T.W, H: T.cab[2][1], wb: T.wb }, lightbar, seatY: 0.5 };
}

// --------------------------------------------------------------------------- Vehicle ----
let VID = 0;
export class Vehicle {
  static get vis() { return VIS; }
  constructor(scene, type, color) {
    this.id = VID++; this.type = type; this.scene = scene;
    const m = type === 'sport' || type === 'sport2' ? cloneSport(color ?? pick(SPORT_PAINTS)) : MODEL_OF[type] ? cloneModel(MODEL_OF[type], color ?? (type === 'taxi' ? 0xf2c230 : type === 'police' ? 0x15181d : type === 'sport2' ? pick(SPORT_PAINTS) : pick(PAINTS)), type) : buildProcCar(type, color ?? (type === 'taxi' ? 0xf2c230 : type === 'police' ? 0x111318 : pick(PAINTS)));
    this.root = new THREE.Group(); this.body = m.group; this.root.add(this.body);
    this.wheels = m.wheels; this.dims = m.dims; this.lightbar = m.lightbar; this.cabin = m.cabin || null; this.cabinOn = true; this.cabinLv = 2;
    // contact shadow
    const sk = 'sh' + this.dims.W + this.dims.L; if (!GCACHE.has(sk)) GCACHE.set(sk, new THREE.PlaneGeometry(this.dims.W * 1.25, this.dims.L * 1.15)); const sh = new THREE.Mesh(GCACHE.get(sk), shared().shadow); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.renderOrder = 1; this.root.add(sh);
    // v3.4 headlight pools on the road ahead + red tail glow behind (additive decals, visible at night only)
    if (!GCACHE.has('hlpool')) {
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      // b_envprog2: head cone and tail pool share one program (uniform uCone picks the branch, each branch's code unchanged); ?oldenvmat2: two
      const FC = 'if (uNight < 0.01) discard; float y = clamp(vUv.y, 0.0, 1.0); float x = abs(vUv.x - 0.5) * 2.0; float w = mix(0.35, 1.0, y); float a = (1.0 - smoothstep(0.1, 1.0, x / w)) * smoothstep(0.0, 0.3, y) * (y < 0.999 ? pow(1.0 - y, 2.4) : 0.0) * (0.75 + 0.25 * sin(x * 9.0 + y * 3.0)); gl_FragColor = vec4(uCol * a * uNight, 1.0);';
      const FP = 'if (uNight < 0.01) discard; float d = length((vUv - 0.5) * vec2(1.0, 1.6)) * 2.0; float a = d < 0.999 ? pow(1.0 - d, 2.0) : 0.0; gl_FragColor = vec4(uCol * a * uNight, 1.0);';
      if (!OLDENV2) GCACHE.set('hlpoolFS', 'uniform float uNight; uniform vec3 uCol; uniform float uCone; varying vec2 vUv; void main(){ if (uCone > 0.5) { ' + FC + ' } else { ' + FP + ' } }');
      const mk = (col, cone) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: Object.assign({ uNight: U.uNight, uCol: { value: new THREE.Color(...col) } }, OLDENV2 ? {} : { uCone: { value: cone ? 1 : 0 } }),
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: cone ? 'uniform float uNight; uniform vec3 uCol; varying vec2 vUv; void main(){ ' + FC + ' }'
                             : 'uniform float uNight; uniform vec3 uCol; varying vec2 vUv; void main(){ ' + FP + ' }', ...(OLDENV2 ? {} : { fragmentShader: GCACHE.get('hlpoolFS') }) });
      GCACHE.set('hlpool', { g, head: mk([0.42, 0.38, 0.31], true), tail: mk([0.5, 0.03, 0.02], false) });
    }
    { const P = GCACHE.get('hlpool');
      const hp = new THREE.Mesh(P.g, P.head); hp.scale.set(this.dims.W * 2.6, 1, 16); hp.position.set(0, 0.05, this.dims.L / 2 + 8); hp.renderOrder = 2; hp.frustumCulled = false; this.root.add(hp);
      const tp = new THREE.Mesh(P.g, P.tail); tp.scale.set(this.dims.W * 1.4, 1, 2.6); tp.position.set(0, 0.05, -this.dims.L / 2 - 0.9); tp.renderOrder = 2; tp.frustumCulled = false; this.root.add(tp); }
    this.root.traverse((o) => { if (o.isMesh && o.renderOrder !== 2) o.frustumCulled = true; });
    scene.add(this.root);
    // v4.3 measured handling (plans/handling.json): [traction accel m/s², power/mass W/kg-ish, top m/s, lateral grip decay, brake m/s², tyre mu]
    // targets: sport 0-100 ≈3.5 s / 100-0 ≈34 m / 1.15 g; sedan ≈8 s / ≈40 m / 0.92 g; SUV ≈9 s / ≈43 m; van ≈13 s
    const spec = { sport: [8.5, 190, 92, 7.5, 11.5, 1.15], sport2: [8.3, 175, 90, 7.5, 11.2, 1.12], sedan: [6.0, 60, 58, 6.5, 9.6, 0.92], taxi: [6.0, 60, 58, 6.5, 9.6, 0.92],
      suv: [5.5, 55, 53, 6.0, 9.0, 0.85], pickup: [5.5, 52, 52, 6.0, 8.8, 0.85], van: [4.5, 38, 45, 5.0, 8.2, 0.8], police: [7.5, 95, 68, 7.5, 10.5, 1.0] }[type];
    this.accel = spec[0]; this.power = spec[1]; this.maxSpeed = spec[2]; this.grip = spec[3]; this.brake = spec[4]; this.mu = spec[5]; this.cd = spec[1] / Math.pow(spec[2], 3);
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.yawRate = 0; this.steer = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.pitch = 0; this.roll = 0; this.spin = 0; this.health = 100; this.driver = null; this.ai = null; this.siren = false; this.hornT = 0;
    this.radius = Math.max(this.dims.W, this.dims.L) * 0.5;
  }
  get speed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  place(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.vx = this.vz = 0; this.sync(0); }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  update(dt, city, wet = 0) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let vl = this.vx * fx + this.vz * fz, vt = this.vx * rx + this.vz * rz;
    const inp = this.input; const dead = this.health <= 0;
    const th = dead ? 0 : inp.throttle;
    let acc = 0;
    const av = Math.abs(vl);
    if (th > 0) acc = vl < -0.5 ? this.brake * th : th * Math.min(this.accel, this.power / Math.max(av, 1));
    else if (th < 0) acc = vl > 0.5 ? this.brake * th : this.accel * 0.5 * th * Math.max(0, 1 - av / 9);
    vl += acc * dt;
    // aero + rolling drag, engine braking off-throttle
    vl -= Math.sign(vl) * Math.min(av, (this.cd * vl * vl + 0.15 + (th === 0 ? 0.45 : 0)) * dt);
    if (inp.handbrake) vl -= Math.sign(vl) * Math.min(Math.abs(vl), 7 * dt);
    if (dead) vl *= Math.exp(-1.5 * dt);
    const steerTarget = inp.steer * 0.62 / (1 + Math.abs(vl) / 22);
    this.steer = lerp(this.steer, steerTarget, 1 - Math.exp(-10 * dt));
    const grip = (inp.handbrake ? 1.6 : this.grip) * (1 - wet * 0.25);
    vt *= Math.exp(-grip * dt);
    let yr = vl * Math.tan(this.steer) / this.dims.wb;
    // tyre limit: lateral acceleration v*yawRate never exceeds mu*g (understeer beyond it) unless the handbrake breaks traction
    if (!inp.handbrake) { const lim = this.mu * (1 - wet * 0.25) * 9.81 / Math.max(Math.abs(vl), 1); yr = Math.max(-lim, Math.min(lim, yr)); }
    this.yawRate = lerp(this.yawRate, yr + (inp.handbrake ? inp.steer * Math.sign(vl) * Math.min(1, Math.abs(vl) / 8) * 1.1 : 0), 1 - Math.exp(-(inp.handbrake ? 4 : 12) * dt));
    this.yaw = angWrap(this.yaw + this.yawRate * dt);
    // lateral slip feeds from yaw change (drift feel)
    vt += -this.yawRate * vl * 0.04 * dt * (inp.handbrake ? 6 : 1);
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw), nrx = Math.cos(this.yaw), nrz = -Math.sin(this.yaw);
    const ax = (vl * nfx + vt * nrx - this.vx) / dt, az = (vl * nfz + vt * nrz - this.vz) / dt;
    this.vx = vl * nfx + vt * nrx; this.vz = vl * nfz + vt * nrz;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // collisions: three circles along the body
    this.lastImpact = 0;
    const r = this.dims.W * 0.5; const half = this.dims.L * 0.5 - r;
    for (const k of [-1, 0, 1]) {
      const cx = this.x + nfx * half * k, cz = this.z + nfz * half * k;
      const res = city.col.resolve(cx, cz, r, 0.5, undefined, this.y + this.dims.H, this.y); // b_canopycol: body height vs overhead boxes
      if (res.hit) {
        const dx = res.x - cx, dz = res.z - cz; this.x += dx; this.z += dz;
        const vn = this.vx * res.nx + this.vz * res.nz;
        if (vn < 0) { this.vx -= vn * res.nx * 1.35; this.vz -= vn * res.nz * 1.35; this.vx *= 0.8; this.vz *= 0.8; this.lastImpact = Math.max(this.lastImpact, -vn); this.yawRate *= 0.5; }
      }
    }
    if (this.lastImpact > 6) this.health -= (this.lastImpact - 6) * 2.2;
    // water: sink
    const gh = city.groundH(this.x, this.z);
    const wy = city.waterY ? city.waterY(this.x, this.z) : -1.0;
    if (gh < wy - 0.5) { this.inWater = true; this.y = lerp(this.y, wy - 1.4, 1 - Math.exp(-1.2 * dt)); this.vx *= Math.exp(-2 * dt); this.vz *= Math.exp(-2 * dt); this.health -= 20 * dt; }
    else { this.inWater = false; this.y = lerp(this.y, Math.max(gh, 0), 1 - Math.exp(-20 * dt)); }
    // body dynamics (visual suspension)
    const alon = ax * nfx + az * nfz, alat = ax * nrx + az * nrz;
    this.pitch = lerp(this.pitch, clamp(-alon * 0.006, -0.06, 0.06), 1 - Math.exp(-6 * dt));
    this.roll = lerp(this.roll, clamp(alat * 0.008, -0.07, 0.07), 1 - Math.exp(-6 * dt));
    this.spin += vl * dt;
    this.sync(dt);
  }
  sync(dt) {
    this.root.position.set(this.x, this.y, this.z); this.root.rotation.y = this.yaw;
    this.body.rotation.set(this.pitch, 0, this.roll);
    for (const w of this.wheels) { w.node.rotation.x = this.spin / w.r; w.node.rotation.y = w.front ? this.steer : 0; }
    if (this.cabin && this.cabinOn) this.cabin.steer.rotation.z = -this.steer * 4.2; // steering wheel follows the road wheels (~14:1 feel)
    if (this.lightbar) {
      const on = this.siren; const t = performance.now() / 1000; const ph = Math.floor(t * 6) % 2;
      this.lightbar.children[0].material.color.setScalar(on && ph ? 4 : 0.3).multiply(new THREE.Color(1, 0.1, 0.1));
      this.lightbar.children[1].material.color.setScalar(on && !ph ? 4 : 0.3).multiply(new THREE.Color(0.15, 0.25, 1));
    }
  }
  // r6.2 cabin detail LOD (interior meshes + shell lining only near the camera)
  // lv 2 = full (lit cluster, screen, mirror, steering wheel), 1 = merged cabin only, 0 = none. The shell lining always stays on,
  // so a far car is dark inside instead of see-through.
  setCabin(lv) { if (!this.cabin) return; lv = lv === true ? 2 : lv === false ? 0 : lv; if (lv === this.cabinLv) return; this.cabinLv = lv; this.cabinOn = lv === 2; this.cabin.group.visible = lv > 0; this.cabin.near.visible = lv === 2; }
  // seat anchor in world space: which = 'driver' | 'passenger'; returns {pos, quat} of the H-point frame (body space -> world)
  seatWorld(which = 'driver', outP = new THREE.Vector3(), outQ = new THREE.Quaternion()) {
    this.root.updateMatrixWorld(true); const c = this.cabin;
    const loc = c ? c.seats[which] : new THREE.Vector3(which === 'driver' ? 0.38 : -0.38, 0.5, 0);
    outP.copy(loc); (c ? c.group.parent : this.body).localToWorld(outP); this.body.getWorldQuaternion(outQ); return { pos: outP, quat: outQ };
  }
  // r6.2 in-cabin camera: between the front seats at eye height (the old fixed y=1.25 clipped through low roofs)
  cockpitCam(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); const c = this.cabin; if (!c) return out.set(this.x, this.y + 1.1, this.z).addScaledVector(this.forward(), 0.3); const s = c.seats.driver; out.set(s.x * 0.35, s.y + 0.68, s.z + 0.12); return (c.group.parent).localToWorld(out); }
  dispose() { this.scene.remove(this.root); }
}

// --------------------------------------------------------------------------- Traffic ----
// lanes: right-hand traffic, two lanes per direction, centre offsets 1.75 / 5.25 from the road axis
export class Traffic {
  constructor(scene, city) {
    this.scene = scene; this.city = city; this.cars = []; this.phase = 0; this.phaseT = 0;
    this.segs = city.segs;
    this.inter = new Map(); for (const i of city.inters) this.inter.set(Math.round(i.x) + ',' + Math.round(i.z), i);
    // r5.0 ribbon road graph (causeway, pearl island, mainland curved/diagonal streets): pieces between junctions
    const R = city.region && city.region.data;
    if (R) {
      this.rib = { pieces: R.pieces, nodes: new Map(), total: 0, J: new Map(R.junctions.map((J) => [J.id, J])) };
      for (const pc of R.pieces) { for (const [end, node] of [['a', pc.a], ['b', pc.b]]) { if (!this.rib.nodes.has(node)) this.rib.nodes.set(node, []); this.rib.nodes.get(node).push({ pc, end }); } this.rib.total += pc.s1 - pc.s0; }
      this.rib.portal = R.pieces.find((pc) => pc.road.id === 'sun' && pc.s0 === 0);
    }
    this._nq = {};
  }
  ribLanes(pc) { return pc.kind === 0 ? [1.75, 5.25] : [2.2]; }
  ribPoint(pc, dir, lane, s, out = new THREE.Vector3()) {
    const p = pc.road.path.at(s); const fx = p.tx * dir, fz = p.tz * dir; const L = this.ribLanes(pc); const off = L[Math.min(lane, L.length - 1)];
    return out.set(p.x - fz * off, 0, p.z + fx * off);
  }
  bez(from, ctrl, to) { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3().copy(from).multiplyScalar((1 - t) ** 2).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(to, t * t)); } return pts; }
  planRib(v) {
    const a = v.ai, pc = a.pc; const endS = a.dir > 0 ? pc.s1 : pc.s0; const node = a.dir > 0 ? pc.b : pc.a;
    const from = this.ribPoint(pc, a.dir, a.lane, endS); const f = pc.road.path.at(endS); const fx = f.tx * a.dir, fz = f.tz * a.dir;
    if (pc === this.rib.portal && a.dir < 0) { // causeway -> island grid street z=0
      const seg = this.findSeg('x', 0, -15);
      if (seg) { const to = this.lanePoint(seg, 1, a.lane, seg.a0 + 6); return { pts: this.bez(from, from.clone().add(to).multiplyScalar(0.5), to), next: { mode: 'lane', seg, dir: 1, lane: a.lane }, straight: true }; }
    }
    const opts = (this.rib.nodes.get(node) || []).filter((o) => !(o.pc === pc && o.end === (a.dir > 0 ? 'b' : 'a')));
    let ch = null, g = 0;
    if (opts.length) {
      const W = opts.map((o) => { const dir2 = o.end === 'a' ? 1 : -1; const q = o.pc.road.path.at(o.end === 'a' ? o.pc.s0 : o.pc.s1); const gg = q.tx * dir2 * fx + q.tz * dir2 * fz; return { o, dir2, gg, w: 0.25 + Math.max(0, gg) * 3 }; });
      let r = rng() * W.reduce((t, x) => t + x.w, 0); for (const x of W) { r -= x.w; if (r <= 0) { ch = { pc: x.o.pc, dir: x.dir2 }; g = x.gg; break; } } if (!ch) { ch = { pc: W[0].o.pc, dir: W[0].dir2 }; g = W[0].gg; }
    } else ch = { pc, dir: -a.dir, uturn: true };
    const lanes = this.ribLanes(ch.pc).length; const lane = ch.uturn ? 0 : Math.min(a.lane, lanes - 1);
    const startS = ch.uturn ? endS : (ch.dir > 0 ? ch.pc.s0 : ch.pc.s1);
    const to = this.ribPoint(ch.pc, ch.dir, lane, startS);
    const J = this.rib.J.get(node);
    const ctrl = ch.uturn ? from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(fx * 9, 0, fz * 9)) : (g > 0.95 || !J ? from.clone().add(to).multiplyScalar(0.5) : new THREE.Vector3(J.x, 0, J.z));
    return { pts: this.bez(from, ctrl, to), next: { mode: 'rib', pc: ch.pc, dir: ch.dir, lane, s: startS }, straight: !ch.uturn && g > 0.9 };
  }
  spawnRib(type, nearPos, minD, maxD, avoidDir) {
    const R = this.rib; let t = rng() * R.total, pc = R.pieces[0]; for (const p of R.pieces) { t -= p.s1 - p.s0; if (t <= 0) { pc = p; break; } }
    if (pc.s1 - pc.s0 < 16) return null;
    const dir = rng() < 0.5 ? 1 : -1; const lane = rng() < 0.5 ? 0 : this.ribLanes(pc).length - 1; const s = lerp(pc.s0 + 6, pc.s1 - 6, rng());
    const p = this.ribPoint(pc, dir, lane, s); const d = Math.hypot(p.x - nearPos.x, p.z - nearPos.z);
    if (d < minD || d > maxD) return null;
    if (avoidDir && (p.x - nearPos.x) * avoidDir.x + (p.z - nearPos.z) * avoidDir.z > d * 0.5 && d < 160) return null;
    if (this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 12)) return null;
    const q = pc.road.path.at(s); const yaw = Math.atan2(q.tx * dir, q.tz * dir);
    const v = new Vehicle(this.scene, type); v.place(p.x, p.z, yaw);
    const sp = pc.kind === 0 ? rand(13, 19) : rand(9, 12.5); v.vx = Math.sin(yaw) * sp * 0.8; v.vz = Math.cos(yaw) * sp * 0.8;
    v.ai = { mode: 'rib', pc, dir, lane, s, cruise: sp, path: null, pi: 0, stuck: 0 };
    this.cars.push(v); return v;
  }
  laneOffset(seg, dir, lane) { return 1.75 + lane * 3.5; }
  // world point on a lane at coordinate s along the segment axis
  lanePoint(seg, dir, lane, s, out = new THREE.Vector3()) {
    const off = this.laneOffset(seg, dir, lane);
    // forward along axis: z-axis road dir +1 -> +z; right = (-fz, fx)
    if (seg.axis === 'z') { const fz = dir; out.set(seg.c + (-fz) * off, 0, s); }
    else { const fx = dir; out.set(s, 0, seg.c + fx * off); }
    return out;
  }
  findSeg(axis, c, s) { return this.segs.find((g) => g.axis === axis && Math.abs(g.c - c) < 0.5 && s >= g.a0 - 0.5 && s <= g.a1 + 0.5); }
  spawnCar(type, nearPos, minD = 110, maxD = 240, avoidDir = null) {
    const ribP = this.rib ? (nearPos.x < -120 || Math.abs(nearPos.z) > 400 ? 0.92 : 0.12) : 0;
    for (let tries = 0; tries < 30; tries++) {
      if (rng() < ribP) { const r = this.spawnRib(type, nearPos, minD, maxD, avoidDir); if (r) return r; continue; }
      const seg = pick(this.segs); const dir = rng() < 0.5 ? 1 : -1; let lane = rng() < 0.5 ? 0 : 1; if (seg.axis === 'z' && seg.c === 290 && dir > 0) lane = 0;
      const s = lerp(seg.a0 + 6, seg.a1 - 6, rng());
      const p = this.lanePoint(seg, dir, lane, s);
      const d = Math.hypot(p.x - nearPos.x, p.z - nearPos.z);
      if (d < minD || d > maxD) continue;
      if (avoidDir && (p.x - nearPos.x) * avoidDir.x + (p.z - nearPos.z) * avoidDir.z > d * 0.5 && d < 160) continue; // not right in front of the camera
      if (this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 12)) continue;
      const v = new Vehicle(this.scene, type);
      const yaw = seg.axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      v.place(p.x, p.z, yaw);
      const sp = rand(10, 14); const fx = Math.sin(yaw), fz = Math.cos(yaw); v.vx = fx * sp * 0.8; v.vz = fz * sp * 0.8;
      v.ai = { mode: 'lane', seg, dir, lane, cruise: sp, path: null, pi: 0, stuck: 0 };
      this.cars.push(v); return v;
    }
    return null;
  }
  removeCar(v) { const i = this.cars.indexOf(v); if (i >= 0) this.cars.splice(i, 1); v.dispose(); }
  // choose the next segment at the end of the current one; returns a turn path
  planTurn(v) {
    const a = v.ai; const seg = a.seg; const endS = a.dir > 0 ? seg.a1 : seg.a0;
    const ix = seg.axis === 'z' ? seg.c : endS + a.dir * 7, iz = seg.axis === 'z' ? endS + a.dir * 7 : seg.c;
    const it = this.inter.get(Math.round(ix) + ',' + Math.round(iz));
    const from = this.lanePoint(seg, a.dir, a.lane, endS);
    const options = [];
    if (it) {
      // straight
      const st = this.findSeg(seg.axis, seg.c, endS + a.dir * 15);
      if (st) options.push({ seg: st, dir: a.dir, w: 3 });
      const other = seg.axis === 'z' ? 'x' : 'z';
      for (const d of [1, -1]) {
        const ss = this.findSeg(other, other === 'z' ? it.x : it.z, (other === 'z' ? it.z : it.x) + d * 15);
        if (ss) options.push({ seg: ss, dir: d, w: 1 });
      }
    }
    // r5.0: the west end of the z=0 street continues onto the causeway (ribbon graph)
    if (!it && this.rib && this.rib.portal && seg.axis === 'x' && Math.abs(seg.c) < 0.5 && a.dir < 0 && Math.abs(endS - seg.a0) < 1) {
      const to = this.ribPoint(this.rib.portal, 1, a.lane, 8);
      return { pts: this.bez(from, from.clone().add(to).multiplyScalar(0.5), to), next: { mode: 'rib', pc: this.rib.portal, dir: 1, lane: a.lane, s: 8 }, straight: true };
    }
    let ch;
    if (!options.length) { ch = { seg, dir: -a.dir, uturn: true }; }
    else { let tot = options.reduce((s, o) => s + o.w, 0), r = rng() * tot; ch = options[0]; for (const o of options) { r -= o.w; if (r <= 0) { ch = o; break; } } }
    let lane = ch.uturn ? 0 : (ch.seg.axis === seg.axis ? a.lane : (rng() < 0.5 ? 0 : 1)); if (ch.seg.axis === 'z' && ch.seg.c === 290 && ch.dir > 0) lane = 0;
    const startS = ch.dir > 0 ? ch.seg.a0 : ch.seg.a1;
    const to = this.lanePoint(ch.seg, ch.dir, lane, ch.uturn ? endS : startS);
    const ctrl = ch.uturn ? from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(seg.axis === 'x' ? a.dir * 9 : 0, 0, seg.axis === 'z' ? a.dir * 9 : 0))
      : (ch.seg.axis === seg.axis ? from.clone().add(to).multiplyScalar(0.5) : new THREE.Vector3(seg.axis === 'z' ? from.x : to.x, 0, seg.axis === 'z' ? to.z : from.z));
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3().copy(from).multiplyScalar((1 - t) ** 2).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(to, t * t)); }
    return { pts, next: { seg: ch.seg, dir: ch.dir, lane }, straight: !ch.uturn && ch.seg.axis === seg.axis };
  }
  update(dt, player, others) {
    // signal phases: 0 NS green, 1 EW green (with all-red gaps)
    this.phaseT += dt; const cyc = this.phaseT % 30; this.phase = cyc < 13 ? 0 : cyc < 15 ? 2 : cyc < 28 ? 1 : 2;
    const tgt = new THREE.Vector3();
    for (const v of this.cars) {
      const a = v.ai; if (!a || v.driver === 'player') continue;
      if (a.mode === 'flee' || a.mode === 'dead') { if (a.mode === 'dead') { v.input.throttle = 0; v.input.handbrake = true; } }
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      let desired = a.cruise;
      if (a.mode === 'lane') {
        const seg = a.seg; const s = seg.axis === 'z' ? v.z : v.x; const endS = a.dir > 0 ? seg.a1 : seg.a0;
        const remain = (endS - s) * a.dir;
        if (remain < 3) { const pl = this.planTurn(v); a.mode = 'turn'; a.path = pl; a.pi = 1; continue; }
        // traffic light at the end of this segment
        const myAxisGreen = (seg.axis === 'z' && this.phase === 0) || (seg.axis === 'x' && this.phase === 1);
        const hasLight = this.inter.has(Math.round(seg.axis === 'z' ? seg.c : endS + a.dir * 7) + ',' + Math.round(seg.axis === 'z' ? endS + a.dir * 7 : seg.c));
        if (hasLight && !myAxisGreen && remain > 2.5 && remain < 26) desired = Math.min(desired, Math.max(0, (remain - 4.5) * 0.9));
        if (remain < 18) desired = Math.min(desired, 8);
        this.lanePoint(seg, a.dir, a.lane, s + a.dir * (7 + Math.abs(v.speed) * 0.5), tgt);
      } else if (a.mode === 'turn') {
        const P = a.path.pts; let p = P[a.pi];
        while (a.pi < P.length - 1 && Math.hypot(p.x - v.x, p.z - v.z) < 4.5) { a.pi++; p = P[a.pi]; }
        tgt.copy(p); desired = a.path.straight ? a.cruise : 6.5;
        if (a.pi >= P.length - 1 && Math.hypot(p.x - v.x, p.z - v.z) < 4.5) { const nx = a.path.next; Object.assign(a, nx); a.mode = nx.mode || 'lane'; a.path = null; }
      } else if (a.mode === 'rib') {
        const pc = a.pc; const path = pc.road.path; path.nearest(v.x, v.z, this._nq, a.s, 20); a.s = this._nq.s;
        const remain = a.dir > 0 ? pc.s1 - a.s : a.s - pc.s0;
        if (remain < 3) { a.path = this.planRib(v); a.mode = 'turn'; a.pi = 1; continue; }
        if (remain < 18) desired = Math.min(desired, 9);
        const p1 = path.at(a.s), p2 = path.at(a.s + a.dir * 30); const bend = Math.abs(p1.tx * p2.tz - p1.tz * p2.tx); desired = Math.min(desired, a.cruise * (1 - bend * 0.6));
        this.ribPoint(pc, a.dir, a.lane, a.s + a.dir * (7 + Math.abs(v.speed) * 0.5), tgt);
      } else if (a.mode === 'chase' || a.mode === 'flee') {
        tgt.copy(a.target || player.pos); desired = a.mode === 'chase' ? a.chaseSpeed || 24 : 26;
      }
      // obstacle check: cars / player / peds ahead
      let block = 99;
      const chk = (ox, oz, rad) => { const dx = ox - v.x, dz = oz - v.z; const along = dx * fx + dz * fz; if (along < 0 || along > 28) return; const lat = Math.abs(dx * fz - dz * fx); if (lat < rad) block = Math.min(block, along); };
      for (const o of this.cars) if (o !== v) chk(o.x, o.z, 2.3);
      for (const o of others) if (o !== v) chk(o.x, o.z, 2.3);
      if (player.onFoot) chk(player.pos.x, player.pos.z, 1.8);
      if (a.mode !== 'chase' && a.mode !== 'flee') desired = Math.min(desired, Math.max(0, (block - 6.5) * 1.1));
      else if (block < 8) desired = Math.min(desired, 6);
      if (player.onFoot && block < 10 && v.hornT <= 0 && Math.abs(v.speed) < 3) { v.hornT = 4; v.wantsHorn = true; }
      v.hornT -= dt;
      // steering (pure pursuit)
      const ang = angWrap(Math.atan2(tgt.x - v.x, tgt.z - v.z) - v.yaw);
      v.input.steer = clamp(ang * 2.2, -1, 1);
      const sp = v.speed;
      v.input.throttle = sp < desired - 0.5 ? clamp((desired - sp) * 0.4, 0.15, 1) : sp > desired + 0.8 ? -clamp((sp - desired) * 0.35, 0.2, 1) : 0;
      v.input.handbrake = false;
      if (a.mode === 'chase' && Math.abs(ang) > 1.6 && Math.abs(sp) < 6) { v.input.throttle = -0.8; v.input.steer = -Math.sign(ang); }
      // stuck detection -> nudge back to lane
      if (Math.abs(sp) < 0.4 && desired > 3) { a.stuck += dt; if (a.stuck > 4) { v.input.throttle = -1; v.input.steer = -v.input.steer; if (a.stuck > 6) a.stuck = 0; } } else a.stuck = 0;
    }
  }
}

export function setCarNight(n) { setInteriorNight(n); const S = shared(); S.head.emissiveIntensity = 0.3 + n * 10; S.tail.emissiveIntensity = 0.4 + n * 5; S.drl.emissiveIntensity = 1.2 + n * 3.5; S.tlens.emissiveIntensity = 0.2 + n * 1.6; S.hglow.opacity = n * 0.85; S.tglow.opacity = n * 0.6; S.hglow.visible = S.tglow.visible = n > 0.02; }
// v4.0: local street-level reflection probe for paint / glass / chrome (main.js refreshes it around the camera)
export function setCarEnv(tex, k = 1) {
  const S = shared(); const ms = [...matCache.values(), S.glass, S.chrome, S.rim, S.lens, S.tlens];
  for (const m of ms) { if (m.envMap !== tex) { m.envMap = tex; m.needsUpdate = true; } m.envMapIntensity = k; }
}
