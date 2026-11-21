// r6.3 street-level kit for map 索拉纳港 (original procedural models): PBR street-furniture material with per-vertex
// roughness / metalness / wear class and procedural grime (foot dirt, rust run-off, chipped paint, galvanised spangle),
// smart parking meters (single + twin head), slatted steel litter bins, steel bollards with reflective bands, and a
// cast-iron floor-cover atlas (manholes, tree grates, curb-inlet grates, utility lids) drawn as one decal mesh.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { prep } from './mats.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MX = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(1, 1, 1));
const P = (g, m) => { g.applyMatrix4(m); return g; };

// pbr classes: [roughness, metalness, wear]  wear: 0 none, 1 painted metal (chips + rust), 2 galvanised / bare steel, 3 plastic / glass, 4 cast iron, 5 wood
export const PB = {
  paint: [0.42, 0.35, 1], paintMatte: [0.62, 0.2, 1], galv: [0.38, 0.85, 2], chrome: [0.16, 1.0, 2], plastic: [0.35, 0.0, 3],
  glass: [0.06, 0.0, 3], lcd: [0.12, 0.0, 3], iron: [0.55, 0.6, 4], wood: [0.78, 0.0, 5], rubber: [0.9, 0.0, 3], conc: [0.92, 0.0, 0], tape: [0.3, 0.0, 3],
};

let FURN = null;
export function furnMat() {
  if (FURN) return FURN;
  const HASH = `
float fh12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fn2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh12(i),fh12(i+vec2(1,0)),f.x), mix(fh12(i+vec2(0,1)),fh12(i+vec2(1,1)),f.x), f.y); }
float fn3(vec3 p){ return fn2(p.xz + p.y * 1.7) * 0.5 + fn2(p.xy * 1.3 - p.z) * 0.5; }`;
  FURN = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), 'furn63', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aPbr; varying vec3 vPbr; varying vec3 vFW; varying vec3 vFN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vPbr = aPbr; vFW = (modelMatrix * vec4(transformed, 1.0)).xyz; vFN = normalize(mat3(modelMatrix) * objectNormal);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPbr; varying vec3 vFW; varying vec3 vFN;' + HASH + '\nfloat fRough, fMetal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float wk = floor(vPbr.z + 0.5); fRough = vPbr.x > 0.0 ? vPbr.x : 0.85; fMetal = vPbr.y;
    vec3 p = vFW; float nz = fn3(p * 2.3) * 0.6 + fn3(p * 9.0) * 0.4;
    float up = clamp(vFN.y, 0.0, 1.0); float foot = (1.0 - smoothstep(0.05, 0.75, p.y));
    if (wk == 1.0) { // painted metal: chipped paint exposing dark steel, rust bleeding down from chips, sun-faded tops
      float chip = smoothstep(0.80, 0.86, fn3(p * 7.0) * 0.7 + fn3(p * 23.0) * 0.3 + foot * 0.12);
      float rust = smoothstep(0.62, 0.9, fn2(vec2((p.x + p.z) * 18.0, p.y * 0.9))) * (1.0 - smoothstep(0.2, 0.7, fract(p.y * 0.8 + fn2(p.xz * 3.0)))) * 0.5;
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 1.08, 0.3), up * 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.2, 0.11), rust * (0.25 + foot * 0.5));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.15, 0.14), chip); fMetal = mix(fMetal, 0.75, chip); fRough = mix(fRough, 0.55, chip) + rust * 0.3;
    } else if (wk == 2.0) { // galvanised / stainless: spangle, handling smudges, white zinc bloom at the foot
      float sp = fn2(p.xz * 31.0 + p.y * 27.0); diffuseColor.rgb *= 0.86 + 0.24 * sp; fRough = clamp(fRough + (sp - 0.5) * 0.18 + foot * 0.25, 0.05, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.72, 0.69), foot * 0.35 * smoothstep(0.4, 0.7, nz));
    } else if (wk == 4.0) { // cast iron: rust bloom in the recesses, worn shiny on top
      float r2 = smoothstep(0.45, 0.8, nz) * (1.0 - up * 0.6); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.19, 0.1), r2 * 0.6); fRough += r2 * 0.25; fMetal *= 1.0 - r2 * 0.7;
    } else if (wk == 5.0) { // weathered timber: silvering + grain
      float gr = fn2(vec2(dot(p.xz, vec2(0.7, 0.7)) * 60.0, p.y * 4.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.5, 0.46), 0.35 * up + 0.15) * (0.82 + 0.3 * gr);
    }
    // everyone: city grime (darker blotches, splash dirt at the foot, dust settling on up-facing surfaces)
    diffuseColor.rgb *= 0.88 + 0.16 * nz; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.56, 0.48), foot * 0.55 * (wk == 3.0 ? 0.5 : 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.52, 0.47), up * 0.12 * smoothstep(0.3, 0.8, nz) * step(wk, 4.5) * (1.0 - step(2.5, wk) * step(wk, 3.5) * 0.5));
    fRough = clamp(fRough + foot * 0.15, 0.04, 1.0); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = fMetal;');
  });
  return FURN;
}

// ---------------------------------------------------------------- parts helpers ----
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);
const lathe = (pts, n = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);

// smart single-space parking meter head (local: +z = kerb side the driver reads, y = 0 at the top of the post)
function meterHead(o, x, body) {
  o.push([P(rbox(0.25, 0.34, 0.17, 0.04), MX(x, 0.2, 0)), body, PB.paint]);                  // cast housing
  o.push([P(rbox(0.27, 0.05, 0.19, 0.02), MX(x, 0.03, 0)), body.map((c) => c * 0.7), PB.paint]); // bottom collar
  o.push([P(rbox(0.26, 0.04, 0.2, 0.015), MX(x, 0.39, 0.0, -0.32)), [0.05, 0.07, 0.12], PB.glass]); // solar panel lid
  o.push([P(new THREE.BoxGeometry(0.2, 0.005, 0.15), MX(x, 0.413, 0.006, -0.32)), [0.07, 0.11, 0.24], PB.lcd]); // cells
  for (const z of [-0.04, 0.0, 0.04]) o.push([P(new THREE.BoxGeometry(0.205, 0.006, 0.004), MX(x, 0.415, z + 0.006, -0.32)), [0.6, 0.62, 0.64], PB.chrome]);
  o.push([P(rbox(0.19, 0.13, 0.02, 0.008), MX(x, 0.25, 0.086)), [0.7, 0.71, 0.72], PB.chrome]);   // display bezel
  o.push([P(new THREE.BoxGeometry(0.15, 0.085, 0.006), MX(x, 0.255, 0.096)), [0.20, 0.27, 0.22], PB.lcd]); // LCD
  for (let k = 0; k < 4; k++) o.push([P(cyl(0.011, 0.011, 0.012, 6), MX(x - 0.06 + k * 0.04, 0.165, 0.09, Math.PI / 2)), k === 3 ? [0.15, 0.55, 0.2] : [0.12, 0.12, 0.13], PB.rubber]);
  o.push([P(new THREE.BoxGeometry(0.06, 0.022, 0.012), MX(x - 0.06, 0.115, 0.088)), [0.75, 0.76, 0.78], PB.chrome]); // coin slot plate
  o.push([P(new THREE.BoxGeometry(0.035, 0.005, 0.006), MX(x - 0.06, 0.115, 0.095)), [0.02, 0.02, 0.02], PB.rubber]);
  o.push([P(new THREE.BoxGeometry(0.07, 0.03, 0.014), MX(x + 0.05, 0.115, 0.088)), [0.08, 0.08, 0.09], PB.plastic]); // card reader
  o.push([P(new THREE.BoxGeometry(0.055, 0.004, 0.006), MX(x + 0.05, 0.12, 0.096)), [0.01, 0.01, 0.01], PB.rubber]);
  o.push([P(new THREE.SphereGeometry(0.012, 6, 3), MX(x + 0.1, 0.33, 0.085)), [0.8, 0.12, 0.1], PB.glass]);      // expiry LED
  o.push([P(new THREE.BoxGeometry(0.1, 0.035, 0.003), MX(x, 0.33, 0.0865)), [0.92, 0.9, 0.82], PB.tape]);      // space-number sticker
  o.push([P(new THREE.BoxGeometry(0.16, 0.06, 0.003), MX(x, 0.06, -0.0865)), [0.9, 0.88, 0.8], PB.tape]);      // rates decal (back)
}
// post: galvanised pipe, base flange with 4 bolts, top saddle; twin = two heads on a yoke (one per parking space)
export function parkingMeter(twin, body = [0.12, 0.14, 0.17]) {
  const o = []; const H = 1.08;
  o.push([P(cyl(0.035, 0.038, H, 12), MX(0, H / 2, 0)), [0.62, 0.63, 0.62], PB.galv]);
  o.push([P(cyl(0.09, 0.1, 0.02, 14), MX(0, 0.01, 0)), [0.5, 0.5, 0.49], PB.galv]);
  for (let k = 0; k < 4; k++) o.push([P(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 4), MX(Math.cos(k * 1.571 + 0.785) * 0.07, 0.025, Math.sin(k * 1.571 + 0.785) * 0.07)), [0.42, 0.42, 0.4], PB.galv]);
  o.push([P(cyl(0.05, 0.045, 0.06, 12), MX(0, H - 0.03, 0)), [0.2, 0.2, 0.21], PB.iron]);
  const top = new THREE.Matrix4().makeTranslation(0, H, 0);
  if (twin) {
    o.push([P(rbox(0.6, 0.05, 0.09, 0.02), MX(0, H + 0.01, 0)), [0.22, 0.23, 0.24], PB.iron]);
    const hs = []; meterHead(hs, -0.17, body); meterHead(hs, 0.17, body); for (const [g, c, pb] of hs) o.push([P(g, new THREE.Matrix4().makeTranslation(0, H + 0.03, 0)), c, pb]);
  } else { const hs = []; meterHead(hs, 0, body); for (const [g, c, pb] of hs) o.push([P(g, top), c, pb]); }
  return o;
}
// slatted steel litter bin with a domed lid + liner (local: y = 0 on the pavement)
export function litterBin(body) {
  const o = []; const R = 0.3, H = 0.92, N = 14;
  o.push([P(cyl(0.34, 0.36, 0.06, 12), MX(0, 0.03, 0)), [0.55, 0.54, 0.51], PB.conc]); // concrete footing
  o.push([P(cyl(R - 0.03, R - 0.04, H - 0.08, 10), MX(0, 0.06 + (H - 0.08) / 2, 0)), [0.09, 0.09, 0.1], PB.plastic]); // liner
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; o.push([P(new THREE.BoxGeometry(0.055, H - 0.16, 0.018), MX(Math.sin(a) * R, 0.06 + 0.08 + (H - 0.16) / 2, Math.cos(a) * R, 0, a)), body, PB.paint]); }
  for (const y of [0.1, H - 0.02]) { const ring = new THREE.TorusGeometry(R + 0.005, 0.022, 4, 16); ring.rotateX(Math.PI / 2); o.push([P(ring, MX(0, y, 0)), body.map((c) => c * 0.85), PB.paint]); }
  o.push([P(lathe([[0.0, 0.16], [0.12, 0.155], [0.25, 0.11], [0.315, 0.04], [0.33, 0.0], [0.32, -0.02]], 14), MX(0, H, 0)), body, PB.paint]); // dome lid
  o.push([P(rbox(0.22, 0.09, 0.05, 0.02), MX(0, H + 0.065, 0.265, -0.35)), [0.04, 0.04, 0.04], PB.rubber]); // posting mouth (dark)
  o.push([P(new THREE.BoxGeometry(0.14, 0.09, 0.004), MX(0, 0.55, R + 0.012)), [0.86, 0.85, 0.8], PB.tape]); // city crest plate
  return o;
}
// steel bollard: flared foot, shaft, two reflective bands, domed cap (lathe, 12 sides)
export function bollard(col = [0.88, 0.88, 0.85]) {
  const o = [];
  o.push([P(lathe([[0.0, 0.0], [0.16, 0.0], [0.16, 0.03], [0.12, 0.08], [0.1, 0.14], [0.1, 0.86], [0.108, 0.88], [0.108, 0.9], [0.09, 0.95], [0.05, 0.985], [0.0, 1.0]], 12), MX(0, 0, 0)), col, PB.paint]);
  for (const y of [0.72, 0.8]) o.push([P(cyl(0.104, 0.104, 0.04, 12), MX(0, y, 0)), [0.9, 0.12, 0.1], PB.tape]);
  return o;
}

// ---------------------------------------------------------------- floor covers (canvas atlas, 4 cells of 256px) ----
// 0 manhole (road / sidewalk, round, Chinese "污水 索拉纳港" casting), 1 tree grate (square, radial slots), 2 curb-inlet grate,
// 3 utility lid (rectangular, chequer plate). Albedo + a height-like bump from the same drawing.
export function coverAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  const h = document.createElement('canvas'); h.width = 1024; h.height = 256; const b = h.getContext('2d'); // bump: white = raised
  g.fillStyle = '#26241f'; g.fillRect(0, 0, 1024, 256); b.fillStyle = '#808080'; b.fillRect(0, 0, 1024, 256);
  const both = (f) => { f(g, false); f(b, true); };
  // 0 manhole
  both((x, bump) => { x.save(); x.translate(128, 128);
    x.fillStyle = bump ? '#606060' : '#5b5853'; x.beginPath(); x.arc(0, 0, 126, 0, 7); x.fill(); // frame ring
    x.fillStyle = bump ? '#a0a0a0' : '#38352f'; x.beginPath(); x.arc(0, 0, 112, 0, 7); x.fill();
    x.strokeStyle = bump ? '#202020' : '#141310'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 112, 0, 7); x.stroke();
    x.fillStyle = bump ? '#d0d0d0' : '#4a4740';
    for (let r = 30; r < 104; r += 13) for (let a = 0; a < 6.28; a += 0.42 * 40 / r) { x.save(); x.rotate(a + r * 0.02); x.fillRect(r - 3, -3, 6, 6); x.restore(); }
    x.fillStyle = bump ? '#202020' : '#151411'; x.fillRect(-56, -24, 112, 48);
    x.fillStyle = bump ? '#e0e0e0' : '#5a564e'; x.font = 'bold 30px "Noto Sans CJK SC","PingFang SC",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('污 水', 0, -2);
    x.font = 'bold 12px sans-serif'; x.fillText('索拉纳港 PORT SOLANA', 0, 40); x.fillText('1987', 0, -42);
    for (const s of [-1, 1]) { x.fillStyle = bump ? '#101010' : '#0b0a09'; x.fillRect(s * 80 - 8, -3, 16, 6); }
    x.restore(); });
  // 1 tree grate: square frame, ring of radial slots, centre opening (soil shows through = dark)
  both((x, bump) => { x.save(); x.translate(384, 128);
    x.fillStyle = bump ? '#909090' : '#3a3530'; x.fillRect(-127, -127, 254, 254);
    x.fillStyle = bump ? '#000' : '#1b140e'; x.beginPath(); x.arc(0, 0, 44, 0, 7); x.fill();
    x.fillStyle = bump ? '#000' : '#16120d';
    for (let r = 58; r < 118; r += 16) for (let a = 0; a < 6.28; a += 0.13 * 90 / r) { x.save(); x.rotate(a); x.fillRect(r, -3, 11, 6); x.restore(); }
    for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (let k = 0; k < 6; k++) { x.save(); x.translate(px * 108, py * 108); x.rotate(Math.atan2(py, px)); x.fillRect(-k * 5, -2, 4, 4); x.restore(); }
    x.strokeStyle = bump ? '#000' : '#191612'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -127); x.lineTo(0, 127); x.stroke(); // two halves
    x.restore(); });
  // 2 curb-inlet grate: frame + bars (bike-safe, diagonal)
  both((x, bump) => { x.save(); x.translate(640, 128);
    x.fillStyle = bump ? '#808080' : '#45413b'; x.fillRect(-127, -127, 254, 254);
    x.fillStyle = bump ? '#000' : '#0a0908'; x.fillRect(-110, -110, 220, 220);
    x.fillStyle = bump ? '#c8c8c8' : '#3b3833'; for (let k = -110; k < 110; k += 22) { x.save(); x.translate(k + 11, 0); x.transform(1, 0, -0.25, 1, 0, 0); x.fillRect(-5, -110, 10, 220); x.restore(); }
    x.fillRect(-110, -6, 220, 12); x.restore(); });
  // 3 utility lid: chequer plate in a frame, two lifting holes, 'TEL' casting
  both((x, bump) => { x.save(); x.translate(896, 128);
    x.fillStyle = bump ? '#707070' : '#4d4a44'; x.fillRect(-127, -127, 254, 254);
    x.fillStyle = bump ? '#8a8a8a' : '#3c3a35'; x.fillRect(-114, -114, 228, 228);
    x.fillStyle = bump ? '#d0d0d0' : '#47443e';
    for (let i = -110; i < 110; i += 18) for (let j = -110; j < 110; j += 18) { x.save(); x.translate(i + 9, j + 9); x.rotate(((i + j) / 18) % 2 ? 0.785 : -0.785); x.fillRect(-7, -2, 14, 4); x.restore(); }
    x.fillStyle = bump ? '#000' : '#0d0c0a'; for (const s of [-1, 1]) x.fillRect(s * 80 - 9, -4, 18, 8);
    x.restore(); });
  const T = new THREE.CanvasTexture(c); T.colorSpace = THREE.SRGBColorSpace; T.anisotropy = 8;
  const B = new THREE.CanvasTexture(h); B.anisotropy = 8;
  const mat = prep(new THREE.MeshStandardMaterial({ map: T, bumpMap: B, bumpScale: 1.6, roughness: 0.62, metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 'cover63');
  return mat;
}
// uv rect for atlas cell i on a PlaneGeometry
export function coverQuad(i, w, d) {
  const q = new THREE.PlaneGeometry(w, d); q.rotateX(-Math.PI / 2); const uv = q.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 4);
  return q;
}
