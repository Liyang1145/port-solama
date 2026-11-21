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
    float up = clamp(vFN.y, 0.0, 1.0); float foot = smoothstep(0.75, 0.05, p.y);
    if (wk == 1.0) { // painted metal: chipped paint exposing dark steel, rust bleeding down from chips, sun-faded tops
      float chip = smoothstep(0.80, 0.86, fn3(p * 7.0) * 0.7 + fn3(p * 23.0) * 0.3 + foot * 0.12);
      float rust = smoothstep(0.62, 0.9, fn2(vec2((p.x + p.z) * 18.0, p.y * 0.9))) * smoothstep(0.7, 0.2, fract(p.y * 0.8 + fn2(p.xz * 3.0))) * 0.5;
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
  // a_props wear pass (albedo only): traffic-polished studs on the manhole centre, rust bloom + silt in the grates and the lid
  // frame, oil / tyre grime smears, seeded so the atlas is identical on every load
  { let sd = 1234567; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    g.save(); g.globalCompositeOperation = 'lighter'; const pol = g.createRadialGradient(128, 128, 10, 128, 128, 110); pol.addColorStop(0, 'rgba(60,58,52,0.55)'); pol.addColorStop(0.7, 'rgba(30,29,26,0.25)'); pol.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pol; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.fill(); g.restore(); // polished centre
    for (let k = 0; k < 140; k++) { const cell = Math.floor(rn() * 4), x = cell * 256 + 8 + rn() * 240, y = 8 + rn() * 240, r = 2 + rn() * (cell === 0 ? 7 : 12);
      const rust = rn() < (cell === 2 || cell === 1 ? 0.6 : 0.3); const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rust ? 'rgba(112,58,26,0.55)' : 'rgba(14,13,11,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (const cx of [128, 384, 640, 896]) { const e = g.createRadialGradient(cx, 128, 96, cx, 128, 182); e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(20,17,12,0.45)'); g.fillStyle = e; g.fillRect(cx - 128, 0, 256, 256); } // silt at the frame edge
    g.fillStyle = 'rgba(70,60,40,0.35)'; for (let k = 0; k < 9; k++) g.fillRect(522 + k * 24 + rn() * 6, 236 - rn() * 30, 10, 20 + rn() * 14); // silt caught in the inlet bars
  }
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

// ================================================================ a_props (map 索拉纳港 only): street-corner kit ====
// Every builder returns [geometry, colour, pbrClass, lod] parts; lod 0 = coarse (always drawn), 1 = fine detail (bolts, chains,
// buttons, cables; drawn only near the camera). stampAO() bakes a cheap ambient-occlusion term into the vertex colours.
const tube = (pts, r, seg = 10, rad = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), seg, r, rad, false);
const ring = (r, t, rs = 4, ts = 14) => new THREE.TorusGeometry(r, t, rs, ts);
// inside-out copy (reversed winding + negated normals) so the inner face of an open shell renders with FrontSide
function flipG(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; }
const YEL = [0.80, 0.60, 0.07], BLK = [0.035, 0.035, 0.032], GALV = [0.66, 0.67, 0.65];

// bake AO into vertex colours of the last `count` vertices appended to bucket b: dark at the foot (contact shadow),
// darker on down-facing faces, slightly darker in the lower half of tall parts; y0 = ground level in world space
export function stampAO(b, parts, m, y0, filter = null) {
  for (const [g, c, pb, lod] of parts) {
    if (filter !== null && (lod || 0) !== filter) continue;
    const base = b.vc; b.geom(g, m, { aPbr: pb }, c);
    for (let i = base; i < b.vc; i++) {
      const h = b.p[i * 3 + 1] - y0, ny = b.n[i * 3 + 1];
      const t = Math.min(1, Math.max(0, h / 0.55)); let ao = 0.5 + 0.5 * t * t * (3 - 2 * t);
      if (ny < -0.35) ao *= 0.72; else if (ny < 0.2) ao *= 0.94;
      b.c[i * 3] *= ao; b.c[i * 3 + 1] *= ao; b.c[i * 3 + 2] *= ao;
    }
  }
}

// --- traffic signal head (local: y = centre, +z = face toward traffic). Yellow cast-aluminium housing, tunnel visors,
// black louvred backplate with the yellow retro-reflective border, lens doors with gaskets, hinge + latch, top hanger.
export function signalHeadA(o, x, y, z, face) {
  const R = (gx, gy, gz) => MX(x + gx, y + gy, z + gz * face, 0, face > 0 ? 0 : Math.PI);
  const push = (g, gx, gy, gz, c, pb, lod = 0) => { g.applyMatrix4(R(gx, gy, gz)); o.push([g, c, pb, lod]); };
  push(rbox(0.36, 1.06, 0.26, 0.05), 0, 0, 0, YEL, PB.paint);
  for (const yy of [0.33, 0, -0.33]) {
    push(cyl(0.155, 0.155, 0.03, 12).rotateX(Math.PI / 2), 0, yy, 0.135, YEL.map((c) => c * 0.9), PB.paint);          // lens door
    push(cyl(0.122, 0.122, 0.012, 12).rotateX(Math.PI / 2), 0, yy, 0.152, [0.07, 0.05, 0.04], PB.glass);              // dark lens
    push(ring(0.128, 0.008, 3, 16), 0, yy, 0.152, BLK, PB.rubber, 1);                                              // gasket
    const v = new THREE.CylinderGeometry(0.16, 0.16, 0.25, 9, 1, true, Math.PI / 2 - 0.35, Math.PI + 0.7); v.rotateX(Math.PI / 2); push(v, 0, yy, 0.28, YEL, PB.paint); // tunnel visor
    const vi = new THREE.CylinderGeometry(0.152, 0.152, 0.24, 9, 1, true, Math.PI / 2 - 0.35, Math.PI + 0.7); vi.rotateX(Math.PI / 2); push(flipG(vi), 0, yy, 0.28, BLK, PB.paintMatte, 1); // matte black inside
    push(new THREE.BoxGeometry(0.02, 0.05, 0.03), 0.165, yy, 0.12, [0.5, 0.5, 0.48], PB.galv, 1);                    // hinge
    push(new THREE.BoxGeometry(0.03, 0.03, 0.03), -0.175, yy, 0.12, [0.5, 0.5, 0.48], PB.galv, 1);                   // latch
  }
  push(new THREE.BoxGeometry(0.66, 1.36, 0.025), 0, 0, -0.15, BLK, PB.paintMatte);                                  // backplate
  for (const [w, h, gx, gy] of [[0.66, 0.05, 0, 0.655], [0.66, 0.05, 0, -0.655], [0.05, 1.36, 0.305, 0], [0.05, 1.36, -0.305, 0]])
    push(new THREE.BoxGeometry(w, h, 0.006), gx, gy, -0.135, [0.95, 0.78, 0.12], PB.tape);                             // reflective border
  for (let k = 0; k < 6; k++) push(new THREE.BoxGeometry(0.56, 0.012, 0.03), 0, -0.5 + k * 0.2, -0.13, [0.02, 0.02, 0.02], PB.paintMatte, 1); // louvre slats
  push(cyl(0.05, 0.05, 0.06, 10), 0, 0.56, 0, YEL, PB.paint);                                                       // top boss
}
// pedestrian head: square housing, egg-crate visor, hand / walker symbols as dull lit lamps
function pedHeadA(o, m) {
  const add = (g, mm, c, pb, lod = 0) => { g.applyMatrix4(mm).applyMatrix4(m); o.push([g, c, pb, lod]); };
  add(rbox(0.44, 0.44, 0.22, 0.03), MX(0, 0, 0), YEL, PB.paint);
  add(new THREE.BoxGeometry(0.36, 0.36, 0.01), MX(0, 0, 0.112), [0.02, 0.02, 0.02], PB.glass);
  add(new THREE.BoxGeometry(0.11, 0.14, 0.004), MX(-0.08, 0.02, 0.118), [0.55, 0.2, 0.05], PB.lcd);               // hand (dim orange)
  add(new THREE.BoxGeometry(0.06, 0.15, 0.004), MX(0.09, 0.02, 0.118), [0.6, 0.62, 0.58], PB.lcd);                // walker (dim white)
  add(new THREE.BoxGeometry(0.1, 0.06, 0.004), MX(0, -0.13, 0.118), [0.35, 0.18, 0.05], PB.lcd, 1);               // countdown digits
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.4, 0.008, 0.08), MX(0, -0.15 + k * 0.1, 0.16), BLK, PB.paintMatte, 1); // egg-crate
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.008, 0.4, 0.08), MX(s * 0.2, 0, 0.16), BLK, PB.paintMatte, 1);
}
// accessible push button (yellow body, big black button, white arrow plate) on a pole of radius pr
function pushButtonA(o, m, pr) {
  const add = (g, mm, c, pb) => { g.applyMatrix4(mm).applyMatrix4(m); o.push([g, c, pb, 1]); };
  add(rbox(0.12, 0.2, 0.07, 0.02), MX(0, 0, pr + 0.035), YEL, PB.paint);
  add(cyl(0.035, 0.035, 0.02, 12).rotateX(Math.PI / 2), MX(0, 0.02, pr + 0.075), [0.05, 0.05, 0.05], PB.rubber);
  add(cyl(0.01, 0.01, 0.006, 6).rotateX(Math.PI / 2), MX(0, 0.02, pr + 0.087), [0.75, 0.7, 0.2], PB.lcd);         // tactile arrow dot
  add(new THREE.BoxGeometry(0.16, 0.24, 0.005), MX(0, 0.25, pr + 0.006), [0.92, 0.92, 0.9], PB.tape);            // instruction plate
  add(new THREE.BoxGeometry(0.1, 0.02, 0.003), MX(0, 0.22, pr + 0.01), [0.05, 0.05, 0.05], PB.tape);              // arrow
  add(new THREE.BoxGeometry(0.05, 0.05, 0.003), MX(0, 0.29, pr + 0.01), [0.05, 0.05, 0.05], PB.tape);             // pictogram
  for (const y of [0.12, -0.12]) add(new THREE.BoxGeometry(0.03, 0.012, 0.03), MX(0, y, pr + 0.01), GALV, PB.galv); // band clamps
}

// --- mast-arm signal assembly (local: pole at origin on the pavement, arm along -sx * x, heads face +sz)
// col: pole paint (null = galvanised). Head positions match the original r6.3 layout (3 m and 6.5 m out, centre y 5.7).
export function signalMastA(sx, sz, paint) {
  const o = []; const pc = paint || GALV, ppb = paint ? PB.paint : PB.galv; const H = 6.6;
  const A = (g, c, pb, lod = 0) => o.push([g, c, pb, lod]);
  A(P(cyl(0.42, 0.45, 0.1, 12), MX(0, 0.05, 0)), [0.58, 0.57, 0.54], PB.conc);                           // footing
  A(P(new THREE.BoxGeometry(0.46, 0.035, 0.46), MX(0, 0.115, 0)), pc, ppb);                                 // base plate
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; A(P(cyl(0.022, 0.022, 0.09, 6), MX(Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.17)), [0.45, 0.45, 0.43], PB.galv, 1);
    A(P(cyl(0.036, 0.036, 0.03, 6), MX(Math.cos(a) * 0.17, 0.145, Math.sin(a) * 0.17)), [0.5, 0.5, 0.48], PB.galv, 1); }
  A(P(lathe([[0.2, 0.0], [0.2, 0.05], [0.16, 0.2], [0.155, 0.32], [0.0, 0.32]], 12), MX(0, 0.13, 0)), pc, ppb);   // base skirt
  A(P(cyl(0.11, 0.155, H, 12), MX(0, H / 2, 0)), pc, ppb);                                                // tapered pole
  A(P(new THREE.SphereGeometry(0.115, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), MX(0, H, 0)), pc, ppb);     // cap
  A(P(rbox(0.1, 0.24, 0.03, 0.01), MX(0, 0.62, -sz * 0.15, 0, 0, 0)), pc.map((c) => c * 0.8), ppb, 1);       // handhole cover
  // arm: tapered tube with clamp flange, end cap and a triangular tie
  const L = 8.6; const arm = cyl(0.06, 0.105, L, 12); arm.rotateZ(sx * Math.PI / 2); arm.translate(-sx * L / 2, 6.3, 0); A(arm, pc, ppb);
  A(P(rbox(0.06, 0.44, 0.36, 0.02), MX(-sx * 0.15, 6.3, 0)), pc, ppb);                                       // arm flange
  for (const yy of [6.16, 6.44]) for (const zz of [-0.12, 0.12]) A(P(cyl(0.02, 0.02, 0.05, 6).rotateZ(Math.PI / 2), MX(-sx * 0.19, yy, zz)), [0.45, 0.45, 0.43], PB.galv, 1);
  A(P(new THREE.SphereGeometry(0.062, 8, 4), MX(-sx * L, 6.3, 0)), pc, ppb);
  A(P(tube([[-sx * 0.12, 5.55, 0], [-sx * 1.4, 6.26, 0]], 0.025, 2, 6), new THREE.Matrix4()), pc, ppb);      // tie rod
  // heads on clamp hangers; signal cable runs under the arm from a weatherhead at the pole and drops into each head with a drip loop
  for (const d of [3, 6.5]) {
    signalHeadA(o, -sx * d, 5.7, 0, sz);
    A(P(cyl(0.03, 0.03, 0.12, 8), MX(-sx * d, 6.2, 0)), pc, ppb);                                          // hanger pipe
    A(P(rbox(0.16, 0.08, 0.2, 0.02), MX(-sx * d, 6.3, 0)), pc, ppb);                                       // arm clamp
    A(P(tube([[-sx * (d - 0.06), 6.24, 0.11], [-sx * (d - 0.2), 6.02, 0.15], [-sx * (d - 0.12), 5.86, 0.12], [-sx * (d - 0.02), 6.0, 0.07], [-sx * d, 6.27, 0.06]], 0.011, 10, 4), new THREE.Matrix4()), BLK, PB.rubber, 1);
  }
  A(P(tube([[-sx * 0.16, 6.22, 0.09], [-sx * 3.0, 6.235, 0.1], [-sx * 6.5, 6.25, 0.08]], 0.012, 8, 4), new THREE.Matrix4()), BLK, PB.rubber, 1); // cable along the arm
  A(P(cyl(0.03, 0.03, 0.22, 8), MX(0, H - 0.05, 0.13)), BLK, PB.rubber, 1);                                  // weatherhead
  // street-name blade brackets (blades themselves are drawn by street.js at y 4.7 / 5.15, 0.9 m out)
  A(P(new THREE.BoxGeometry(1.75, 0.03, 0.03), MX(-sx * 0.9, 4.92, 0)), GALV, PB.galv, 1);
  A(P(new THREE.BoxGeometry(0.03, 0.03, 1.75), MX(0, 5.37, -sz * 0.9)), GALV, PB.galv, 1);
  for (const y of [4.92, 5.37]) A(P(cyl(0.165, 0.165, 0.05, 14), MX(0, y, 0)), GALV, PB.galv, 1);
  // pedestrian heads + push buttons for both crosswalks
  pedHeadA(o, MX(-sx * 0.36, 3.0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2));
  pedHeadA(o, MX(0, 3.0, -sz * 0.36, 0, sz > 0 ? Math.PI : 0));
  A(P(new THREE.BoxGeometry(0.2, 0.05, 0.05), MX(-sx * 0.2, 3.0, 0)), pc, ppb, 1); A(P(new THREE.BoxGeometry(0.05, 0.05, 0.2), MX(0, 3.0, -sz * 0.2)), pc, ppb, 1);
  pushButtonA(o, MX(0, 1.08, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2), 0.14);
  pushButtonA(o, MX(0, 1.08, 0, 0, sz > 0 ? Math.PI : 0), 0.14);
  return o;
}
// far LOD of the mast arm (>~260 m): plain pole, arm, head boxes + backplates (~120 triangles)
export function signalMastFarA(sx, sz, paint) {
  const o = []; const pc = paint || GALV;
  o.push([P(cyl(0.11, 0.155, 6.6, 6), MX(0, 3.3, 0)), pc, PB.paint, 0]);
  const arm = cyl(0.06, 0.105, 8.6, 5); arm.rotateZ(sx * Math.PI / 2); arm.translate(-sx * 4.3, 6.3, 0); o.push([arm, pc, PB.paint, 0]);
  for (const d of [3, 6.5]) { o.push([P(new THREE.BoxGeometry(0.36, 1.06, 0.3), MX(-sx * d, 5.7, 0.02 * sz)), YEL, PB.paint, 0]); o.push([P(new THREE.BoxGeometry(0.66, 1.36, 0.03), MX(-sx * d, 5.7, -0.15 * sz)), BLK, PB.paintMatte, 0]); }
  return o;
}
// short pedestrian-signal pole for the corners without a mast arm (heads face -sx and -sz)
export function pedPoleA(sx, sz) {
  const o = []; const A = (g, c, pb, lod = 0) => o.push([g, c, pb, lod]);
  A(P(cyl(0.2, 0.22, 0.08, 12), MX(0, 0.04, 0)), [0.58, 0.57, 0.54], PB.conc);
  A(P(lathe([[0.12, 0.0], [0.12, 0.04], [0.085, 0.14], [0.0, 0.14]], 12), MX(0, 0.06, 0)), GALV, PB.galv);
  A(P(cyl(0.065, 0.075, 3.4, 12), MX(0, 1.7, 0)), GALV, PB.galv);
  A(P(new THREE.SphereGeometry(0.068, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), MX(0, 3.4, 0)), GALV, PB.galv);
  pedHeadA(o, MX(-sx * 0.3, 2.85, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2));
  pedHeadA(o, MX(0, 2.85, -sz * 0.3, 0, sz > 0 ? Math.PI : 0));
  A(P(new THREE.BoxGeometry(0.16, 0.05, 0.05), MX(-sx * 0.14, 2.85, 0)), GALV, PB.galv, 1); A(P(new THREE.BoxGeometry(0.05, 0.05, 0.16), MX(0, 2.85, -sz * 0.14)), GALV, PB.galv, 1);
  pushButtonA(o, MX(0, 1.08, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2), 0.07);
  pushButtonA(o, MX(0, 1.08, 0, 0, sz > 0 ? Math.PI : 0), 0.07);
  return o;
}

// --- fire hydrant (Florida dry-barrel, chrome-yellow body, silver bonnet + caps, chained caps) local y = 0 on the pavement
export function hydrantA(body = [0.86, 0.66, 0.08], top = [0.78, 0.78, 0.75]) {
  const o = []; const A = (g, c, pb, lod = 0) => o.push([g, c, pb, lod]);
  A(P(cyl(0.19, 0.2, 0.04, 14), MX(0, 0.02, 0)), [0.56, 0.55, 0.52], PB.conc);                                     // grout collar
  A(P(lathe([[0.0, 0.0], [0.16, 0.0], [0.16, 0.035], [0.12, 0.06], [0.115, 0.09]], 14), MX(0, 0.04, 0)), body, PB.paint); // ground flange
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; A(P(cyl(0.014, 0.014, 0.025, 6), MX(Math.cos(a) * 0.14, 0.085, Math.sin(a) * 0.14)), body.map((c) => c * 0.8), PB.paint, 1); }
  A(P(lathe([[0.112, 0.0], [0.108, 0.1], [0.104, 0.42], [0.112, 0.46], [0.13, 0.47], [0.13, 0.5], [0.0, 0.5]], 16), MX(0, 0.12, 0)), body, PB.paint); // barrel + upper flange
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; A(P(cyl(0.011, 0.011, 0.04, 6), MX(Math.cos(a) * 0.12, 0.61, Math.sin(a) * 0.12)), top.map((c) => c * 0.85), PB.paint, 1); }
  A(P(lathe([[0.125, 0.0], [0.12, 0.05], [0.1, 0.11], [0.06, 0.15], [0.035, 0.16], [0.0, 0.16]], 16), MX(0, 0.62, 0)), top, PB.paint); // bonnet
  A(P(cyl(0.028, 0.028, 0.05, 5), MX(0, 0.8, 0)), top.map((c) => c * 0.9), PB.paint);                                       // pentagon op nut
  A(P(cyl(0.05, 0.05, 0.012, 14), MX(0, 0.77, 0)), top.map((c) => c * 0.9), PB.paint, 1);                                 // weather shield
  const noz = (a, r, len, y) => { const m = MX(Math.sin(a) * 0.1, y, Math.cos(a) * 0.1, 0, a);
    A(P(cyl(r, r * 1.05, len, 14).rotateX(Math.PI / 2).translate(0, 0, len / 2), m), body, PB.paint);
    A(P(cyl(r * 1.12, r * 1.12, 0.045, 14).rotateX(Math.PI / 2).translate(0, 0, len + 0.02), m), top, PB.paint);             // cap
    A(P(cyl(r * 0.45, r * 0.45, 0.03, 5).rotateX(Math.PI / 2).translate(0, 0, len + 0.055), m), top.map((c) => c * 0.85), PB.paint);   // cap nut
    for (let k = 0; k < 4; k++) A(P(ring(0.012, 0.0035, 3, 6).rotateY(k % 2 ? Math.PI / 2 : 0).translate(r * 1.1 + 0.005, -0.03 - k * 0.022, len - 0.02 + k * 0.004), m), [0.5, 0.5, 0.48], PB.galv, 1); // chain
  };
  noz(0, 0.07, 0.11, 0.42); noz(Math.PI / 2, 0.045, 0.09, 0.47); noz(-Math.PI / 2, 0.045, 0.09, 0.47);
  return o;
}

// --- inverted-U bike rack (galvanised hoops on a flat rail, local: rack runs along z, n hoops 0.9 m apart)
export function bikeRackA(n = 3) {
  const o = []; const A = (g, c, pb, lod = 0) => o.push([g, c, pb, lod]); const len = (n - 1) * 0.9 + 0.4;
  A(P(new THREE.BoxGeometry(0.08, 0.02, len), MX(0, 0.01, 0)), [0.5, 0.5, 0.48], PB.galv);
  for (let i = 0; i < n; i++) { const z = -(n - 1) * 0.45 + i * 0.9;
    A(P(tube([[-0.0, 0.0, -0.32], [0, 0.62, -0.32], [0, 0.82, -0.22], [0, 0.86, 0], [0, 0.82, 0.22], [0, 0.62, 0.32], [0, 0.0, 0.32]], 0.024, 14, 7), MX(0, 0, z, 0, Math.PI / 2)), GALV, PB.galv);
    for (const s of [-1, 1]) A(P(new THREE.BoxGeometry(0.12, 0.012, 0.1), MX(s * 0.32, 0.026, z)), [0.48, 0.48, 0.46], PB.galv, 1);
    A(P(new THREE.BoxGeometry(0.4, 0.02, 0.02), MX(0, 0.3, z)), GALV, PB.galv, 1); }                           // cross bar
  return o;
}
// --- recycling bin (blue, rounded body with round can opening + paper slot, white label with green band)
export function recycleBinA(body = [0.07, 0.24, 0.52]) {
  const o = []; const A = (g, c, pb, lod = 0) => o.push([g, c, pb, lod]);
  A(P(new THREE.BoxGeometry(0.56, 0.05, 0.5), MX(0, 0.025, 0)), [0.55, 0.54, 0.51], PB.conc);
  A(P(rbox(0.5, 0.86, 0.44, 0.06), MX(0, 0.48, 0)), body, PB.plastic);
  A(P(rbox(0.54, 0.07, 0.48, 0.03), MX(0, 0.93, 0)), body.map((c) => c * 0.8), PB.plastic);                      // lid
  A(P(cyl(0.075, 0.075, 0.01, 14), MX(-0.11, 0.967, 0)), [0.02, 0.02, 0.02], PB.rubber);                             // can hole
  A(P(new THREE.BoxGeometry(0.18, 0.01, 0.035), MX(0.11, 0.967, 0)), [0.02, 0.02, 0.02], PB.rubber);               // paper slot
  A(P(new THREE.BoxGeometry(0.3, 0.2, 0.004), MX(0, 0.62, 0.222)), [0.92, 0.92, 0.9], PB.tape);                    // label
  A(P(new THREE.BoxGeometry(0.3, 0.05, 0.005), MX(0, 0.555, 0.223)), [0.12, 0.55, 0.22], PB.tape);
  A(P(new THREE.BoxGeometry(0.08, 0.08, 0.005), MX(0, 0.65, 0.224)), [0.12, 0.55, 0.22], PB.tape, 1);               // loop symbol
  for (const s of [-1, 1]) A(P(new THREE.BoxGeometry(0.02, 0.1, 0.04), MX(s * 0.2, 0.9, -0.23)), [0.2, 0.2, 0.2], PB.plastic, 1); // lid hinges
  return o;
}
