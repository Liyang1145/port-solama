// Characters: realistic rigged humans (MakeHuman CC0 bodies via ara3d, CMU mocap clips baked per character)
import { REGION } from './maps/gta/mapdata.js';
import { pointAt } from './maps/cyber/roadgraph.js';
import { gunMesh } from './gunmodels.js';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
export const charLodReady = MeshoptSimplifier.ready;
// v4.2 character LOD: per proto geometry, two simplified index buffers sharing the skinned vertex data (meshoptimizer)
// r6.2 memory: glTF morph targets are per mesh, so every sub-mesh of a cast model (clothes, shoes, hair, ...) carried all 34 ARKit /
// viseme targets as zero deltas, and three.js builds a float morph texture (verts x targets x vec4) for each one. Drop targets that
// move nothing; the face / eyes / teeth keep theirs (blink, talk, expressions still animate).
const DROPPED = { geos: 0, kept: 0 };
function dropDeadMorphs(geo) {
  const M = geo.morphAttributes; if (!M || !M.position || !M.position.length) return;
  for (const a of M.position) { for (let i = 0, n = a.count; i < n; i++) if (Math.abs(a.getX(i)) > 1e-5 || Math.abs(a.getY(i)) > 1e-5 || Math.abs(a.getZ(i)) > 1e-5) { DROPPED.kept++; return; } }
  geo.morphAttributes = {}; DROPPED.geos++;
}
export const morphStats = () => ({ ...DROPPED });
const LODG = new Map();
function makeLods(geo) {
  if (LODG.has(geo) || !geo.index) return;
  const pos = geo.attributes.position; const P = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); }
  const I = new Uint32Array(geo.index.array);
  const out = [geo];
  for (const r of [0.3, 0.1]) {
    let res; try { res = MeshoptSimplifier.simplify(I, P, 3, Math.max(3, Math.floor(I.length * r / 3) * 3), 0.02, ['LockBorder']); } catch (e) { res = null; }
    const g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]); g.morphTargetsRelative = geo.morphTargetsRelative; // r6.2: no face morphs on LOD1/2 (blinks / visemes are invisible past 20 m; each morphed geometry costs a float morph texture of verts x 34 targets)
    g.setIndex(new THREE.BufferAttribute(res ? res[0] : I, 1)); g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
    for (const gr of geo.groups) g.addGroup(0, Infinity, gr.materialIndex);
    out.push(g);
  }
  LODG.set(geo, out);
}
import { prep } from './mats.js';
import { U } from './env.js';
import { CYBER } from './mapsel.js';
import { clamp, lerp, rand, pick, angWrap, rng } from './util.js';

const PROTOS = {};

// b_corenpc: one shader program for every character material (shared people.js, both maps). The cast GLBs mix materials with /
// without base colour, normal and metal-rough maps, opaque / alpha-blend / alpha-mask, single / double sided, plus the per-character
// tint patch (key 'tint') vs plain ('ch'): each combination was its own program (~25 extra programs around a crowd, each a full
// lit + skinned shader to compile). Now every character material is normalised to the same program parameters with identical pixels:
// - missing maps -> shared 1x1 placeholders (white base colour / white metal-rough: x1; flat normal map with normalScale 0: the
//   geometry normal exactly);
// - opaque materials keep blending off (NoBlending: same GL state as opaque) and force alpha = 1 by uniform (OPAQUE define);
// - every material has alphaTest > 0 (opaque / blend 0.001, a dead threshold in the main pass; masks keep 0.5);
// - every material is DoubleSide in the program; originally single-sided ones keep back-face culling through a WebGLState
//   setMaterial wrap (userData.npcCull), and blended ones render in one pass (forceSinglePass);
// - the clothing / hair / skin-tone tint is always in the shader, off by uniform (uTint 0) on untinted materials.
// What still splits: face meshes with morph targets vs without (LOD1/2 + clothes), and shadow depth (back / double side).
// ?oldnpcmat restores the old per-combination materials.
export const OLDNPC = typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldnpcmat');
// people3_port: the people3 per-role look (skin / hair / fabric shading, per-character costumes, sunglasses) rides on the same single
// npc program: role and costume are uniforms (uLook / uRole / uCost ...), no new shader programs. ?oldpeople3 = the r6.4 look
// (b_corenpc tint only, old dress()); ?oldnpcmat implies it (the look needs the shared npc program).
export const OLDP3 = OLDNPC || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldpeople3'));
const TINT_GLSL = `
uniform float uHue, uVal, uSat, uSkin, uTint, uOpq;
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`;
const TINT_APPLY = `{ vec3 hsv = rgb2hsv(diffuseColor.rgb);
  float skin = uSkin * smoothstep(0.13, 0.08, hsv.x) * smoothstep(0.12, 0.25, hsv.y) * smoothstep(0.7, 0.5, hsv.y) * smoothstep(0.15, 0.3, hsv.z);
  vec3 t = hsv2rgb(vec3(fract(hsv.x + uHue), clamp(hsv.y * uSat, 0.0, 1.0), clamp(hsv.z * uVal, 0.0, 1.0)));
  diffuseColor.rgb = mix(t, diffuseColor.rgb, skin); }`;

const LOOK_GLSL = `
uniform vec3 uLSun; uniform float uLook, uRole, uAniso, uGarm; uniform vec4 uBN, uCost, uCol1, uCol2, uGlow; uniform vec3 uSkinC; varying vec3 vBP; varying vec3 vBN;
float lh3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float lnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lh3(i), lh3(i + vec3(1,0,0)), f.x), mix(lh3(i + vec3(0,1,0)), lh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lh3(i + vec3(0,0,1)), lh3(i + vec3(1,0,1)), f.x), mix(lh3(i + vec3(0,1,1)), lh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float band(float v, float c, float w){ float fw = fwidth(v) * 1.2 + 1e-5; return 1.0 - smoothstep(w, w + fw, abs(v - c)); }
float lum3(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// costume region masks in bind space: s = bare skin, b = bikini, k = sheer cover-up, top = upper-body fabric
void costume(out float s, out float b, out float k, out float top){
  float h = vBP.y, ax = abs(vBP.x), tw = uBN.w, front = smoothstep(-0.05, 0.35, vBN.z);
  top = smoothstep(0.565, 0.6, h);
  s = 0.0; b = 0.0; k = 0.0;
  if (uGarm > 0.5) return;
  float armX = mix(tw + 0.012, 0.074, smoothstep(0.715, 0.785, h)); float arm = smoothstep(armX, armX + 0.008, ax) * smoothstep(0.43, 0.47, h);
  if (uCost.x > 0.5) {
    float scoop = front * smoothstep(0.0, 0.006, h - (0.765 + 0.55 * ax)) * step(ax, 0.07);
    float neck = smoothstep(0.80, 0.81, h);
    s = max(s, max(arm, max(scoop, neck)) * top);
  }
  if (uCost.y > 0.0) s = max(s, 1.0 - smoothstep(uCost.y - 0.004, uCost.y + 0.004, h));
  if (uCost.z > 0.5) {
    float cup = smoothstep(0.688, 0.695, h) * (1.0 - smoothstep(0.742, 0.75, h)) * (1.0 - arm);
    float strap = band(ax, 0.052, 0.0055) * smoothstep(0.74, 0.75, h) * (1.0 - smoothstep(0.815, 0.825, h));
    b = max(cup, strap * front);
    if (uCost.z < 1.5) { k = top * (1.0 - b); b *= top; }
  }
}`;
// role: 0 skin, 1 skin details, 2 hair, 4 cloth (3 = eyes / teeth: look off). One branch per role, all dynamic (uniform-driven).
const LOOK_MAP = `float cS = 0.0, cB = 0.0, cK = 0.0, cTop = 0.0, skinW = 0.0; float lkR = uLook > 0.5 ? uRole : -1.0;
if (lkR < -0.5) { if (uTint > 0.5) TINT_APPLY_HERE }
else {
  if (lkR > 3.5 || lkR < 0.5) costume(cS, cB, cK, cTop);
  if (lkR < 0.5) { cS = 0.0; cK = 0.0; if (uCost.z < 1.5) cB = 0.0; }
  vec3 hsv = rgb2hsv(diffuseColor.rgb);
  diffuseColor.rgb = hsv2rgb(vec3(fract(hsv.x + uHue), clamp(hsv.y * uSat, 0.0, 1.0), clamp(hsv.z * uVal, 0.0, 1.0)));
  float det = clamp(mix(1.0, lum3(diffuseColor.rgb) * 2.4, 0.35), 0.72, 1.18);
  if (abs(lkR - 2.0) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uCol1.rgb * clamp(lum3(diffuseColor.rgb) * 4.0, 0.35, 1.6), uCol1.a);
  if (lkR > 3.5) {
    float gm = 1.0 - step(0.5, uGarm);
    diffuseColor.rgb = mix(diffuseColor.rgb, uCol1.rgb * det, uCol1.a * cTop * gm);
    diffuseColor.rgb = mix(diffuseColor.rgb, uCol2.rgb * det, uCol2.a * (1.0 - cTop) * (1.0 - cS) * gm);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uSkinC, uCol2.rgb, 0.42) * mix(1.0, det, 0.5), cK);
    if (uCost.w > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uCol1.rgb * mix(1.0, det, 0.4), cTop * gm);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, uSkinC * (0.93 + 0.1 * lnoise(vBP * 55.0) + 0.04 * lnoise(vBP * 260.0)), cS);
  diffuseColor.rgb = mix(diffuseColor.rgb, uCol1.rgb * mix(1.0, det, lkR < 0.5 ? 0.0 : 0.5), cB * step(0.5, uCost.z));
  skinW = lkR < 0.5 ? 1.0 - cB : lkR < 1.5 ? 1.0 : cS;
}`;
const LOOK_ROUGH = `float nearF = 1.0 - smoothstep(2.5, 9.0, length(vViewPosition));
if (lkR > -0.5) { float pn = lnoise(vBP * 900.0), bn = lnoise(vBP * 70.0);
  float tz = (1.0 - smoothstep(0.0, 0.03, abs(vBP.x))) * smoothstep(0.85, 0.87, vBP.y) * step(0.0, vBN.z);
  float rs = clamp(0.5 + 0.12 * (bn - 0.5) + 0.1 * (pn - 0.5) * nearF - 0.14 * tz, 0.3, 0.75);
  roughnessFactor = mix(roughnessFactor, rs, skinW);
  if (lkR > 3.5) { roughnessFactor = mix(roughnessFactor, 0.17 + 0.12 * bn, step(0.5, uCost.w) * step(uGarm, 0.5) * cTop * (1.0 - cS)); roughnessFactor = mix(roughnessFactor, 0.55, cB); }
  if (abs(lkR - 2.0) < 0.5) roughnessFactor = max(roughnessFactor, 0.55);
}`;
const LOOK_NORMAL = `if (lkR > 3.5) normal = normalize(mix(normal, nonPerturbedNormal, cS * 0.8));
if (skinW > 0.01 && nearF > 0.0) { vec3 q = vBP * 1400.0; float e = 0.6;
  vec3 g = vec3(lnoise(q + vec3(e,0,0)) - lnoise(q - vec3(e,0,0)), lnoise(q + vec3(0,e,0)) - lnoise(q - vec3(0,e,0)), lnoise(q + vec3(0,0,e)) - lnoise(q - vec3(0,0,e)));
  normal = normalize(normal - (g - normal * dot(g, normal)) * 0.08 * nearF * skinW); }`;
const LOOK_EMIS = `if (lkR > 3.5 && uGlow.w > 0.0) { float h = vBP.y, ax = abs(vBP.x), front = smoothstep(0.1, 0.4, vBN.z);
  float armX = mix(uBN.w + 0.012, 0.074, smoothstep(0.715, 0.785, h)); float arm = smoothstep(armX, armX + 0.008, ax) * smoothstep(0.43, 0.47, h);
  float tr = 0.0;
  if (uGarm < 0.5) {
    tr += band(vBP.x, 0.0, 0.0028) * front * smoothstep(0.56, 0.58, h) * (1.0 - smoothstep(0.79, 0.8, h)) * (1.0 - arm);
    tr += band(h, 0.578, 0.0032) * (1.0 - arm);
    tr += band(h, 0.792, 0.0028) * (1.0 - arm) * step(ax, 0.09);
    tr += band(h, 0.585, 0.004) * arm;
    tr += band(h, 0.70, 0.0026) * arm;
    tr += band(h, 0.30, 0.0028) * (1.0 - smoothstep(0.56, 0.58, h));
  } else if (uGarm < 1.5) tr += 1.0 - smoothstep(0.012, 0.016, h);
  totalEmissiveRadiance += uGlow.rgb * uGlow.w * clamp(tr, 0.0, 1.0); }`;
const LOOK_LIGHT = `if (lkR > -0.5) {
  vec3 Ld = normalize((viewMatrix * vec4(uLSun, 0.0)).xyz); vec3 V = normalize(vViewPosition); float nl = dot(normal, Ld);
  vec3 sunC = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
    sunC = directionalLights[0].color;
  #endif
  if (skinW > 0.01) {
    float wrap = max(0.0, (nl + 0.4) / 1.4) - max(0.0, nl);
    vec3 scat = diffuseColor.rgb * vec3(0.9, 0.42, 0.32);
    reflectedLight.directDiffuse += wrap * scat * sunC * 0.22 * skinW;
    reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.0, 0.97, 0.95), skinW * smoothstep(0.2, 0.9, nl));
    reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(1.03, 0.99, 0.97), skinW);
    float rim = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 3.0);
    reflectedLight.directDiffuse += rim * scat * sunC * max(0.0, -nl + 0.2) * 0.12 * skinW;
  }
  #ifdef USE_MAP
  if (uAniso > 0.5) { vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition); vec2 du1 = dFdx(vMapUv), du2 = dFdy(vMapUv);
    vec3 T = -dp1 * du2.x + dp2 * du1.x; T = T - normal * dot(T, normal); float tl = length(T);
    if (tl > 1e-6) { T /= tl; vec3 Hh = normalize(Ld + V); float sh = (lnoise(vec3(vMapUv * vec2(160.0, 8.0), 0.0)) - 0.5) * 0.35;
      vec3 T1 = normalize(T + normal * (0.08 + sh)), T2 = normalize(T - normal * (0.12 - sh));
      float d1 = dot(T1, Hh), d2 = dot(T2, Hh); float s1 = pow(sqrt(max(0.0, 1.0 - d1 * d1)), 110.0), s2 = pow(sqrt(max(0.0, 1.0 - d2 * d2)), 26.0);
      float vis = smoothstep(-0.2, 0.4, nl);
      reflectedLight.directSpecular += sunC * vis * (s1 * 0.05 * mix(vec3(1.0), diffuseColor.rgb * 3.0, 0.4) + s2 * 0.1 * diffuseColor.rgb) * (1.0 - nearF * 0.3);
      float sv = dot(T1, V); reflectedLight.indirectSpecular += reflectedLight.indirectDiffuse * pow(sqrt(max(0.0, 1.0 - sv * sv)), 40.0) * 0.12; } }
  #endif
  if (lkR > 3.5) { float rimc = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 4.0) * (1.0 - cS) * (1.0 - step(0.5, uCost.w) * step(uGarm, 0.5) * cTop);
    reflectedLight.indirectDiffuse += rimc * diffuseColor.rgb * (reflectedLight.indirectDiffuse + sunC * 0.15) * 0.6; }
}`;

function hueMat(src, key) {
  if (!OLDNPC && src.userData.nu) { // b_corenpc: same program, tint switched on by uniform
    const m = src.clone(); m.__npcDepth = src.__npcDepth; const u = m.userData.nu; u.uTint.value = 1; u.uSkin.value = /Outfit/.test(src.name) ? 0 : 1; m.userData.tint = u; return m; // clone() keeps the shared hooks (npcClone)
  }
  // clothing / hair / skin-tone tint: rotates hue / scales saturation + value (per-character uniforms)
  const m = src.clone();
  m.userData.tint = { uHue: { value: 0 }, uVal: { value: 1 }, uSat: { value: 1 }, uSkin: { value: /Outfit/.test(src.name) ? 0 : 1 } };
  return prep(m, key, (s) => {
    Object.assign(s.uniforms, m.userData.tint);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform float uHue, uVal, uSat, uSkin;
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 hsv = rgb2hsv(diffuseColor.rgb);
  float skin = uSkin * (1.0 - smoothstep(0.08, 0.13, hsv.x)) * smoothstep(0.12, 0.25, hsv.y) * (1.0 - smoothstep(0.5, 0.7, hsv.y)) * smoothstep(0.15, 0.3, hsv.z);
  vec3 t = hsv2rgb(vec3(fract(hsv.x + uHue), clamp(hsv.y * uSat, 0.0, 1.0), clamp(hsv.z * uVal, 0.0, 1.0)));
  diffuseColor.rgb = mix(t, diffuseColor.rgb, skin); }`);
  });
}

let PH = null; // shared 1x1 placeholders
const px1 = (r, g, b, srgb) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
function npcCullWrap(renderer) { // originally single-sided character materials: back-face culling restored after three's setMaterial
  const st = renderer.state; if (st.__npcCull) return; st.__npcCull = true; const gl = renderer.getContext(); const orig = st.setMaterial;
  st.setMaterial = function (material, frontFaceCW, ...rest) {
    orig.call(this, material, frontFaceCW, ...rest); const c = material.userData.npcCull;
    if (c === 1) { st.enable(gl.CULL_FACE); st.setFlipSided(!!frontFaceCW); } // main pass: FrontSide
    else if (c === 2) { st.enable(gl.CULL_FACE); st.setFlipSided(!frontFaceCW); } // shadow depth: BackSide (three's default for FrontSide)
  };
}
export const npcMatStats = { mats: 0, ph: 0, cull: 0, blend: 0 };
function npcMat(m) {
  if (!m.isMeshStandardMaterial) { prep(m, 'ch'); return; }
  if (m.userData.nu) return; // shared by several sub-meshes: already normalised
  if (!PH) PH = { white: px1(255, 255, 255, true), lin: px1(255, 255, 255, false), flat: px1(128, 128, 255, false) };
  npcMatStats.mats++;
  if (!m.map) { m.map = PH.white; npcMatStats.ph++; }
  if (!m.normalMap) { m.normalMap = PH.flat; m.normalScale.set(0, 0); npcMatStats.ph++; }
  if (!m.roughnessMap) { m.roughnessMap = PH.lin; npcMatStats.ph++; }
  if (!m.metalnessMap) { m.metalnessMap = PH.lin; npcMatStats.ph++; }
  const opq = !m.transparent; if (opq) m.blending = THREE.NoBlending; else { m.forceSinglePass = true; npcMatStats.blend++; }
  if (!(m.alphaTest > 0)) m.alphaTest = 0.001;
  // shadow depth: one program too. Each source material gets its own MeshDepthMaterial (Object3D.customDepthMaterial, set per mesh in
  // Character; three copies map / alphaTest onto it every pass), drawn DoubleSide in the program with the old culling restored.
  const dm = new THREE.MeshDepthMaterial(); dm.onBeforeCompile = (s, r) => npcCullWrap(r); dm.customProgramCacheKey = NPC_DKEY; m.__npcDepth = dm;
  if (m.side !== THREE.DoubleSide) { m.side = THREE.DoubleSide; m.userData.npcCull = 1; dm.userData.npcCull = 2; npcMatStats.cull++; }
  m.shadowSide = THREE.DoubleSide;
  m.userData.nu = { uTint: { value: 0 }, uHue: { value: 0 }, uVal: { value: 1 }, uSat: { value: 1 }, uSkin: { value: 0 }, uOpq: { value: opq ? 1 : 0 }, ...lookUniforms() };
  prep(m, 'npc'); const base = m.onBeforeCompile;
  m.onBeforeCompile = function (s, r) {
    base.call(this, s, r); npcCullWrap(r); Object.assign(s.uniforms, this.userData.nu); s.uniforms.uLSun = U.uSunDir;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uBN; varying vec3 vBP; varying vec3 vBN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP = vec3((position.x - uBN.z) * uBN.y, (position.y - uBN.x) * uBN.y, position.z * uBN.y); vBN = normalize(vec3(normal));');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>' + TINT_GLSL + LOOK_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + LOOK_MAP.replace('TINT_APPLY_HERE', TINT_APPLY))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + LOOK_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + LOOK_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + LOOK_EMIS)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LOOK_LIGHT)
      .replace('#include <alphatest_fragment>', '#ifdef USE_ALPHATEST\nif ( alphaTest > 0.0015 && diffuseColor.a < alphaTest ) discard;\n#endif')
      .replace('#include <opaque_fragment>', 'if (uOpq > 0.5) diffuseColor.a = 1.0;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = NPC_KEY; m.clone = npcClone;
}
// Material.clone() does not carry onBeforeCompile / customProgramCacheKey: a plain clone (the tint, world.js tintPlayer) would fall
// back to a stock program. The hook reads its uniforms from this.userData.nu (deep-copied by clone), so sharing the function is safe.
const NPC_KEY = () => 'npc', NPC_DKEY = () => 'npcd';
function npcClone() { const c = THREE.MeshStandardMaterial.prototype.clone.call(this); c.onBeforeCompile = this.onBeforeCompile; c.customProgramCacheKey = NPC_KEY; c.clone = npcClone;
  c.userData.nu = THREE.UniformsUtils.clone(this.userData.nu); c.__npcDepth = this.__npcDepth; return c; } // people3_port: vector uniforms survive (userData is JSON-copied)

// ---------------------------------------------------------------- people3 look (ported onto the npc program) ----
// Skin (wrap-lit subsurface approximation, pore / roughness breakup, T-zone sheen), hair (two-lobe Kajiya-Kay highlight along the
// strand direction from the UV gradient), fabric (sheen rim) and per-character costumes painted in BIND space (pre-skinning position,
// normalised to body height): map A 索拉纳港 = Florida waterfront (tank tops, shorts, bikini + sheer cover-up, sunglasses), map B 霓港 =
// street techwear (glossy rain shells, emissive piping / zipper / cuffs / soles, LED visor glasses, dyed hair). Everything is a uniform
// on the shared npc program; sunglasses are skinned meshes on the head bone with npc materials (same program as the clothes).
// Dropped from people3: alphaToCoverage on hair cards (a program define).
const ROLE = (n) => /^(Skin|Mouth)$/.test(n) ? 'skin' : /^Skin details/.test(n) ? 'detail' : /^(Hair|Beard|Buzz|Eyebrows|Eyelashes)/.test(n) ? 'hair'
  : /^(Eyes|Teeth|Tongue|Palette)/.test(n) ? 'eye' : 'cloth';
const ROLE_ID = { skin: 0, detail: 1, hair: 2, eye: 3, cloth: 4 };
const GARM_FOOT = /shoe|sole|heel|loafer|oxford|sneaker|slide|flip|boot/i, GARM_HAT = /hat|cap\b|^cap/i, GARM_GEAR = /belt|pouch/i;
function lookUniforms() {
  return {
    uLook: { value: 0 }, uRole: { value: 3 }, uAniso: { value: 0 }, uGarm: { value: 0 }, // uGarm: 0 garment, 1 footwear, 2 hat / gear
    uBN: { value: new THREE.Vector4(-1, 0.5, 0, 0.1) }, // yFoot, 1/H, x centre, torso half width (all /H)
    uSkinC: { value: new THREE.Vector3(0.5, 0.33, 0.25) },
    uCost: { value: new THREE.Vector4() }, // x tank top, y shorts cut height (0 = none), z 1 bikini + cover-up / 2 bikini top on skin, w rain shell
    uCol1: { value: new THREE.Vector4() }, uCol2: { value: new THREE.Vector4() }, uGlow: { value: new THREE.Vector4() },
  };
}
function bodyFrame(P) {
  let mn = 1e9, mx = -1e9, xs = 0, xn = 0; const V = []; const v = new THREE.Vector3();
  P.scene.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || ROLE(o.material.name) === 'eye') return; const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); if (!isFinite(v.y)) continue; mn = Math.min(mn, v.y); mx = Math.max(mx, v.y); xs += v.x; xn++; if ((i & 1) === 0) V.push(v.x, v.y); }
  });
  const H = Math.max(1e-3, mx - mn), xc = xn ? xs / xn : 0;
  const bins = new Uint32Array(80);
  for (let i = 0; i < V.length; i += 2) { const h = (V[i + 1] - mn) / H; if (h > 0.62 && h < 0.69) { const b = Math.floor(Math.abs(V[i] - xc) / H / 0.005); if (b < 80) bins[b]++; } }
  let tw = 0.1; for (let b = 10; b < 40; b++) if (!bins[b] && !bins[b + 1]) { tw = b * 0.005; break; }
  P.bn = new THREE.Vector4(mn, 1 / H, xc, tw);
}
function skinColour(P) {
  let mapImg = null; P.scene.traverse((o) => { if (!mapImg && o.isMesh && o.material.name === 'Skin' && o.material.map) mapImg = o.material.map.image; });
  P.skinC = new THREE.Vector3(0.45, 0.3, 0.22);
  if (!mapImg || typeof document === 'undefined' || !(mapImg.width > 1)) return;
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(mapImg, 0, 0, 32, 32); const d = cx.getImageData(0, 0, 32, 32).data; let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (d[i + 3] < 200 || l < 30 || l > 245 || d[i] < d[i + 2]) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (n > 20) { const c = new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace); P.skinC.set(c.r, c.g, c.b); }
  } catch (e) { /* tainted / unsupported: keep the default */ }
}
// sunglasses / LED visor: lens + frame pieces in head-bone space (calibrated on the eyes), baked into skinned meshes weighted 100 % to the
// head bone so they take the npc (no-morph) program; added hidden to each proto, kept only on characters dress() gives glasses to
function glassesParts() {
  const lensP = [], frameP = [];
  for (const sx of [-1, 1]) {
    const lens = new THREE.CircleGeometry(0.0265, 18); lens.scale(1, 0.78, 1); lens.translate(sx * 0.0325, 0, 0.018); lensP.push(lens);
    const rim = new THREE.TorusGeometry(0.0268, 0.0024, 4, 18); rim.scale(1, 0.8, 1); rim.translate(sx * 0.0325, 0, 0.018); frameP.push(rim);
    const arm = new THREE.BoxGeometry(0.004, 0.006, 0.105); arm.translate(sx * 0.066, 0.004, -0.034); frameP.push(arm);
  }
  const br = new THREE.BoxGeometry(0.014, 0.004, 0.004); br.translate(0, 0.008, 0.019); frameP.push(br);
  return [lensP, frameP];
}
function glassesMeshes(P) {
  P.scene.updateMatrixWorld(true); let eyes = null; P.scene.traverse((o) => { if (!eyes && o.isSkinnedMesh && o.material.name === 'Eyes') eyes = o; });
  if (!eyes) return; const sk = eyes.skeleton; const hi = sk.bones.findIndex((b) => b.name === 'Head'); if (hi < 0) return; const head = sk.bones[hi];
  const ec = eyes.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(eyes.matrixWorld);
  const o = head.worldToLocal(ec.clone()); const ax = (d) => head.worldToLocal(ec.clone().add(d)).sub(o);
  const glM = new THREE.Matrix4().makeBasis(ax(new THREE.Vector3(1, 0, 0)), ax(new THREE.Vector3(0, 1, 0)), ax(new THREE.Vector3(0, 0, 1))).setPosition(o);
  // skinned position p with weight 1 on the head lands at world = Mt * p (Mt = matrixWorld * bindMatrixInverse * head.matrixWorld * boneInverse * bindMatrix)
  const Mt = new THREE.Matrix4().copy(eyes.matrixWorld).multiply(eyes.bindMatrixInverse).multiply(head.matrixWorld).multiply(sk.boneInverses[hi]).multiply(eyes.bindMatrix);
  const X = Mt.clone().invert().multiply(head.matrixWorld).multiply(glM); if (!X.elements.every(isFinite)) return;
  const out = [];
  glassesParts().forEach((parts, k) => {
    const gs = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a); return n; });
    const pos = [], nor = [], uv = []; gs.forEach((g) => { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); });
    const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); G.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    G.applyMatrix4(X); const n = pos.length / 3; const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = hi; sw[i * 4] = 1; }
    G.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); G.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); G.computeBoundingSphere();
    for (const a in eyes.geometry.attributes) if (!G.attributes[a]) { const s0 = eyes.geometry.attributes[a]; G.setAttribute(a, new THREE.BufferAttribute(new s0.array.constructor(n * s0.itemSize), s0.itemSize, s0.normalized)); } // same attribute set as the cast (same program)
    const m = new THREE.SkinnedMesh(G, glassesMat(k ? 'black' : 'lensdark', k)); m.name = k ? 'Sunglasses frame' : 'Sunglasses lens'; m.userData.glass = k + 1;
    m.bind(sk, eyes.bindMatrix); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.visible = false; eyes.parent.add(m); out.push(m);
  });
  // bind() copies the mesh's own world matrix as bindMatrix in 'attached' mode unless given; keep the eyes' bind space exactly
  for (const m of out) { m.position.copy(eyes.position); m.quaternion.copy(eyes.quaternion); m.scale.copy(eyes.scale); m.updateMatrixWorld(true); m.bindMatrix.copy(eyes.bindMatrix); m.bindMatrixInverse.copy(eyes.bindMatrixInverse); }
}
const GL_MAT = {};
function glassesMat(kind, frame) {
  const key = kind + '|' + frame; if (GL_MAT[key]) return GL_MAT[key];
  const m = frame
    ? new THREE.MeshStandardMaterial({ name: 'Sunglasses frame', color: kind === 'tort' ? 0x3a2416 : kind === 'gold' ? 0xb08a4a : 0x111114, roughness: kind === 'gold' ? 0.3 : 0.35, metalness: kind === 'gold' ? 1 : 0 })
    : new THREE.MeshStandardMaterial({ name: 'Sunglasses lens', color: /^led/.test(kind) ? 0x05060a : kind === 'gold' ? 0x2a3a2a : 0x0b0d10, roughness: 0.06, metalness: 0.5, side: THREE.DoubleSide });
  if (/^led/.test(kind) && !frame) { m.emissive.setHex(+kind.slice(3) || 0x22e6ff); m.emissiveIntensity = 2.2; }
  npcMat(m); return (GL_MAT[key] = m);
}
const SRGB = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const PAL = {
  aTop: [0xf2efe8, 0xe9e4d8, 0xd9665a, 0x4fb3b0, 0x7fb4d9, 0xa7a9ac, 0x1d1f22, 0xe8b84a, 0x2f5d8a, 0xf0a7a0, 0x6f8f5e],
  aBottom: [0xc8b48c, 0x4a6a92, 0x2f3e5a, 0xece8de, 0x6d7253, 0xd88a6a, 0x8aa4b8, 0x3a3a3c],
  bikini: [0xc8262d, 0x111111, 0x1f9fa3, 0xe36a8a, 0xf0c03a, 0x2b4f9e, 0xffffff],
  cover: [0xfaf7f0, 0xf3e6d0, 0xf6d2d4, 0xd2ecea, 0xe8e2f2],
  shell: [0x0d0f12, 0x1b1f24, 0x123a3e, 0x3a1218, 0x2a2d33, 0x6a5a1a, 0x1a1530],
  bBottom: [0x0c0d10, 0x1a1c20, 0x23262c, 0x2b2620],
  glow: [0x22e6ff, 0xff2bd6, 0xffb020, 0x7dff4a, 0xff3355, 0x9a6bff],
  dye: [0xd8dde2, 0x2ab3b3, 0xb3307a, 0x6a52c8, 0xe0e0e0],
};
// per proto: role uniforms on the shared proto materials (hero / unstyled peds get the skin / hair / fabric shading too)
function lookProto(P) {
  bodyFrame(P); skinColour(P); P.hasTop = false;
  P.scene.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material.userData.nu) return; const m = o.material, n = m.name, r = ROLE(n); if (r === 'eye') return;
    if (r === 'cloth' && !GARM_FOOT.test(n) && !GARM_HAT.test(n) && !GARM_GEAR.test(n)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); if ((o.geometry.boundingBox.max.y - P.bn.x) * P.bn.y > 0.66) P.hasTop = true; }
    if (m.userData.role) return; m.userData.role = r; const u = m.userData.nu;
    u.uLook.value = 1; u.uRole.value = ROLE_ID[r]; u.uAniso.value = r === 'hair' && /^Hair/.test(n) ? 1 : 0; u.uBN.value.copy(P.bn); u.uSkinC.value.copy(P.skinC);
    if (r === 'cloth') u.uGarm.value = GARM_FOOT.test(n) ? 1 : GARM_HAT.test(n) || GARM_GEAR.test(n) ? 2 : 0;
    if (r === 'skin') { m.roughness = 0.62; m.metalness = 0; }
    if (r === 'cloth' && !/leather|loafer|oxford|heel|belt/i.test(n)) { m.roughness = Math.max(m.roughness, 0.82); m.metalness = 0; }
  });
  if (!P.cop) glassesMeshes(P);
}

// Cast: MakeHuman-based realistic people (CC0 bodies, CMU mocap clips) exported with ara3d at medium detail; each GLB carries
// its own retargeted clip set (r6.2: 20 clips — locomotion in 4 directions, idle variations, swim, jump, hit, two deaths, aim).
// h = exported height (m); hT = height the cast is normalised to (consistent street scale: no 2 m giants next to 1.5 m teens).
export const CAST = {
  hero: { file: 'ch_hero.glb', sex: 'm', h: 1.74, hT: 1.78 },
  m1: { file: 'ch_m1.glb', sex: 'm', h: 1.94, hT: 1.83 }, m2: { file: 'ch_m2.glb', sex: 'm', h: 1.90, hT: 1.82 }, m3: { file: 'ch_m3.glb', sex: 'm', h: 2.01, hT: 1.85 }, m4: { file: 'ch_m4.glb', sex: 'm', h: 1.66, hT: 1.70 },
  m5: { file: 'ch_m5.glb', sex: 'm', h: 1.93, hT: 1.81 }, m6: { file: 'ch_m6.glb', sex: 'm', h: 1.87, hT: 1.79 }, m7: { file: 'ch_m7.glb', sex: 'm', h: 1.90, hT: 1.82 }, m8: { file: 'ch_m8.glb', sex: 'm', h: 2.11, hT: 1.90 },
  f1: { file: 'ch_f1.glb', sex: 'f', h: 1.69, hT: 1.68 }, f2: { file: 'ch_f2.glb', sex: 'f', h: 1.80, hT: 1.71 }, f3: { file: 'ch_f3.glb', sex: 'f', h: 1.76, hT: 1.69 }, f4: { file: 'ch_f4.glb', sex: 'f', h: 1.48, hT: 1.58 },
  f5: { file: 'ch_f5.glb', sex: 'f', h: 1.71, hT: 1.69 }, f6: { file: 'ch_f6.glb', sex: 'f', h: 1.63, hT: 1.64 },
  cop: { file: 'ch_cop.glb', sex: 'm', h: 1.89, hT: 1.82, cop: true }, cop2: { file: 'ch_cop2.glb', sex: 'm', h: 1.97, hT: 1.84, cop: true },
};
const SKIN_RE = /^(Skin|Mouth|Eyes|Eyebrows|Eyelashes|Teeth|Tongue|Hair|Beard|Buzz|Skin details)/;
const HAIR_RE = /^(Hair|Beard|Buzz|Eyebrows)/;
const TONE_RE = /^(Skin|Skin details)$/;
const CLIP_NAMES = {
  idle: 'Idle', walk: 'Walk', run: 'Run', back: 'Walk backwards', sl: 'Strafe left', sr: 'Strafe right',
  look: 'Look around', phone: 'Phone call', text: 'Texting', talk: 'Talk with gestures',
  tread: 'Tread water', swim: 'Swim breaststroke', jair: 'Jump (in air)', jland: 'Jump land',
  hitF: 'Hit from front', hitB: 'Hit from back', deathF: 'Death (fall forward)', deathB: 'Death (fall backward)', aim: 'Pistol aim', raim: 'Rifle aim idle',
};
const GAIT = ['walk', 'run', 'back', 'sl', 'sr'];
const LOOPED = ['idle', 'walk', 'run', 'back', 'sl', 'sr', 'look', 'phone', 'text', 'talk', 'tread', 'swim', 'jair'];
const UPPER_RE = /(Spine1|Spine2|Neck|Head|Shoulder|Arm|ForeArm|Hand)/;

// per proto + clip: stride (m per cycle), left-foot-forward phase and the vertical lift that puts the soles on the ground
function calibrate(P) {
  const m = SkeletonUtils.clone(P.scene); m.updateMatrixWorld(true);
  const feet = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'].map((n) => m.getObjectByName(n)).filter(Boolean);
  const lf = m.getObjectByName('LeftFoot'), hips = m.getObjectByName('Hips'); const v = new THREE.Vector3(), h = new THREE.Vector3();
  const lowY = () => { let y = 1e9; for (const b of feet) y = Math.min(y, b.getWorldPosition(v).y); return y; };
  const rest = lowY(); const mixer = new THREE.AnimationMixer(m); const cal = {};
  for (const k of ['idle', ...GAIT, 'look', 'phone', 'text', 'talk']) {
    const c = P.clips[k]; if (!c || !lf || !hips) continue;
    const a = mixer.clipAction(c); a.play(); a.weight = 1; const N = 40, d = c.duration || 1; let lo = 1e9, mx = -1e9, mn = 1e9, tm = 0;
    const side = k === 'sl' || k === 'sr';
    for (let i = 0; i < N; i++) {
      mixer.setTime(i / N * d); m.updateMatrixWorld(true); lo = Math.min(lo, lowY());
      lf.getWorldPosition(v); hips.getWorldPosition(h); const r = side ? v.x - h.x : v.z - h.z; if (r > mx) { mx = r; tm = i / N; } mn = Math.min(mn, r);
    }
    cal[k] = { lift: clamp(rest - lo, -0.12, 0.12), stride: Math.max(0.3, 2 * (mx - mn)), ph: tm, dur: d };
    a.stop(); mixer.uncacheAction(c);
  }
  return cal;
}

// r6.3 fix: the shipped cast glbs carry a few corrupt keyframes (~1e35-1e38, < 1 % of values) in the face morph-weight tracks
// (every proto; the beach-dude / f6 rigs even in Idle / Walk). One such weight flung face / eye vertices to ~1e34 m: a pale skin-
// coloured sliver across the screen (the "seawall strip") and garbage raycasts. Weights live in [0, 1]: zero anything outside.
const MORPH_BAD = { tracks: 0, values: 0 };
function cleanMorphTrack(t) {
  if (!t.name.endsWith('.morphTargetInfluences')) return; const v = t.values; let n = 0;
  for (let i = 0; i < v.length; i++) { const x = v[i]; if (!(x >= -0.01 && x <= 1.01)) { v[i] = 0; n++; } }
  if (n) { MORPH_BAD.tracks++; MORPH_BAD.values += n; }
}
export const morphFixStats = () => ({ ...MORPH_BAD });
export function prepareCharacters(G) {
  for (const key in CAST) {
    const g = G['ch_' + key]; if (!g) continue;
    const names = new Set(); g.scene.traverse((o) => names.add(o.name));
    g.scene.traverse((o) => {
      if (!o.isMesh) return; o.castShadow = !/Eye|Teeth|Tongue|Mouth|lash|brow|details/i.test(o.material.name); o.receiveShadow = true; o.frustumCulled = false;
      const mm = Array.isArray(o.material) ? o.material : [o.material];
      mm.forEach((m) => { if (m.transparent && m.map === null) m.depthWrite = false; if (OLDNPC) prep(m, 'ch'); else npcMat(m); });
      if (o.isSkinnedMesh) dropDeadMorphs(o.geometry);
      if (o.isSkinnedMesh && key !== 'hero') makeLods(o.geometry);
    });
    // tracks for nodes the rig lacks (props in some clips) would only spam binding warnings: keep bones / mesh weights that exist
    const clip = (nm) => { const c = g.animations.find((a) => a.name === nm); if (!c) return null; const k = c.clone(); k.tracks = k.tracks.filter((t) => !t.name.endsWith('.scale') && names.has(t.name.split('.')[0])); k.tracks.forEach(cleanMorphTrack); return k; };
    const upper = (c, nm) => { if (!c) return null; const k = c.clone(); k.tracks = k.tracks.filter((t) => UPPER_RE.test(t.name.split('.')[0])); k.name = nm; return k; };
    const clips = {}; for (const k in CLIP_NAMES) clips[k] = clip(CLIP_NAMES[k]);
    clips.idle = clips.idle || g.animations[0];
    for (const k of ['walk', 'run']) clips[k] = clips[k] || clips.idle;
    clips.aimU = upper(clips.aim, 'aimUpper'); clips.raimU = upper(clips.raim || clips.aim, 'rifleUpper');
    const C = CAST[key]; const P = PROTOS[key] = { scene: g.scene, scale: C.hT && C.h ? C.hT / C.h : 1, sex: C.sex, cop: !!C.cop, clips };
    P.cal = calibrate(P);
    if (!OLDP3) lookProto(P); // people3_port
  }
}
const pickKind = (kind, opt) => {
  if (opt.proto && PROTOS[opt.proto]) return opt.proto;
  if (opt.player) return 'hero';
  const keys = Object.keys(PROTOS);
  if (kind === 'cop') { const cs = keys.filter((k) => PROTOS[k].cop); if (cs.length) return pick(cs); }
  const pool = keys.filter((k) => k !== 'hero' && !PROTOS[k].cop && (kind === 'man' ? PROTOS[k].sex === 'm' : kind === 'woman' ? PROTOS[k].sex === 'f' : true));
  return pick(pool.length ? pool : keys);
};
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const LONG_GUNS = /smg|rifle|shotgun|carbine|lmg|sniper/i;

// r6.2 perf/memory: SkeletonUtils.clone gives every skinned sub-mesh (30-40 per cast model) its own Skeleton, so each character
// computed and uploaded 30-40 identical bone textures per frame (~1100 per frame for a street crowd; it OOM'd the software GPU).
// All sub-meshes of a cast model come from one glTF skin: point them at the first mesh's Skeleton when bones + inverses match.
export function shareSkeleton(root) {
  let sk = null;
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return; if (!sk) { sk = o.skeleton; return; } const s2 = o.skeleton; if (s2 === sk) return;
    if (s2.bones.length !== sk.bones.length || !s2.bones.every((b, i) => b === sk.bones[i]) || !s2.boneInverses.every((m, i) => m.equals(sk.boneInverses[i]))) return;
    s2.dispose(); o.skeleton = sk;
  });
  return sk;
}
export const CROWD_DRAW = 80; // m
let CID = 0;
export class Character {
  constructor(scene, kind, opt = {}) {
    const pk = pickKind(kind, opt); const P = PROTOS[pk]; this.kind = kind; this.proto = pk; this.P = P; this.id = CID++; this.isCop = kind === 'cop';
    this.isPlayer = !!opt.player;
    this.model = SkeletonUtils.clone(P.scene); this.model.scale.setScalar(P.scale);
    shareSkeleton(this.model); // r6.2: one Skeleton (one bone texture upload / matrix pass) per character instead of one per sub-mesh
    this.root = new THREE.Group(); this.root.add(this.model); scene.add(this.root); this.scene = scene;
    if (!opt.player && !opt.player2) this.dress(kind);
    { const gl = []; this.model.traverse((o) => { if (o.userData.glass && !this.glassKind) gl.push(o); }); for (const o of gl) o.parent.remove(o); } // people3_port: only worn glasses stay
    this.mixer = new THREE.AnimationMixer(this.model);
    this.A = {};
    for (const k of [...LOOPED, 'jland', 'hitF', 'hitB']) {
      const c = P.clips[k]; if (!c) continue; const a = this.mixer.clipAction(c);
      if (!LOOPED.includes(k)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      a.play(); a.weight = 0; this.A[k] = a; a.w = 0;
    }
    this.A.idle.weight = 1; this.A.idle.w = 1;
    for (const k of GAIT) if (this.A[k]) this.A[k].timeScale = 0; // gait clips are driven by one shared stride phase (no foot sliding, no foot crossing while blending)
    this.actions = { idle: this.A.idle, walk: this.A.walk, run: this.A.run }; // legacy handle
    if (P.clips.aimU) { const a = this.mixer.clipAction(P.clips.aimU); a.play(); a.weight = 0; this.aimA = a; }
    if (P.clips.raimU) { const a = this.mixer.clipAction(P.clips.raimU); a.play(); a.weight = 0; this.raimA = a; }
    this.aiming = false; this.aimW = 0; this.aimDir = new THREE.Vector3(0, 0, 1); this.weaponMesh = null; this.weaponId = null;
    this.bones = { hand: this.model.getObjectByName('RightHand'), mid: this.model.getObjectByName('RightHandMiddle1'), lhand: this.model.getObjectByName('LeftHand'), lmid: this.model.getObjectByName('LeftHandMiddle1'), lidx: this.model.getObjectByName('LeftHandIndex1'), lpinky: this.model.getObjectByName('LeftHandPinky1'), neck: this.model.getObjectByName('Neck'), head: this.model.getObjectByName('Head') };
    this.deathA = null;
    for (const k of ['deathF', 'deathB']) if (P.clips[k]) { const a = this.mixer.clipAction(P.clips[k]); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.weight = 0; this[k] = a; this.deathA = this.deathA || a; }
    this.pos = new THREE.Vector3(); this.yaw = 0; this.vy = 0; this.speed = 0; this.health = 100; this.dead = false;
    this.fallT = 0;
    // locomotion state: measured velocity (what the feet must match), shared gait phase, idle variation, overlays
    this._lp = null; this._ly = 0; this.mv = new THREE.Vector2(); this.mvy = 0; this.yawRate = 0; this.cmdSpeed = 0;
    this.phase = rng(); this.moveT = 0; this.runT = 0; this.idleT = -rand(1, 6); this.var = null; this.varW = 0; this.varT = 0;
    this.airW = 0; this.landW = 0; this.hitW = 0; this.swimW = 0; this.lookY = 0; this._hp = 100; this.lift = 0;
    this.mixer.update(0);
    this.root.scale.setScalar(opt.player ? 1 : rand(0.96, 1.04));
    this.lod = 0; this.lodAcc = 0; this.lodMeshes = [];
    this.model.traverse((o) => { if (o.isMesh && o.material.__npcDepth) o.customDepthMaterial = o.material.__npcDepth; }); // b_corenpc (dress() keeps the map)
    this.model.traverse((o) => { if (o.isMesh) this.lodMeshes.push({ m: o, g: LODG.get(o.geometry), small: !!o.userData.glass || /Eye|Teeth|Tongue|Mouth|lash|brow|details/i.test(o.material.name), cast: o.castShadow }); });
  }
  // wardrobe (people3_port): per-character look on top of the role uniforms. Tint shifts as before (realistic fabric, natural hair,
  // skin-tone range) plus a map style: A Florida waterfront (tank tops, shorts, bikini + sheer cover-up, sunglasses), B street techwear
  // (glossy rain shells, emissive trims, LED visors, dyed hair). Cops keep their uniforms (skin / hair only). ?oldpeople3: dressOld()
  dress(kind) {
    if (OLDP3) return this.dressOld(kind);
    const P = this.P, cop = kind === 'cop' || P.cop, fem = P.sex === 'f';
    const cloth = !cop && rng() < 0.75 ? pick([[rand(-0.5, 0.5), rand(0.55, 0.95), rand(0.75, 1.08)], [0, rand(0.15, 0.5), rand(0.95, 1.25)], [rand(-0.08, 0.08), rand(0.8, 1.05), rand(0.45, 0.75)]]) : null;
    const hair = rng() < 0.7 ? pick([[0, 0.9, 0.35], [0, 1, 0.55], [0.01, 1.05, 0.8], [0.02, 0.8, 1.25], [0, 0.3, 0.9]]) : null;
    const tone = rng() < 0.6 ? [rand(-0.012, 0.008), rand(1.0, 1.15), pick([rand(0.5, 0.65), rand(0.68, 0.85), rand(0.86, 1.04)])] : null;
    const L = { cost: [0, 0, 0, 0], c1: [0, 0, 0, 0], c2: [0, 0, 0, 0], glow: [0, 0, 0, 0], dye: [0, 0, 0, 0], skinTop: null, glasses: null };
    const col = (list, a = 1) => [...SRGB(pick(list)), a];
    if (!cop && !CYBER) {
      if (fem && rng() < 0.42) { L.cost[2] = 1; L.c1 = col(PAL.bikini); L.c2 = col(PAL.cover); L.cost[1] = rng() < 0.55 ? rand(0.37, 0.43) : 0; }
      else {
        if (rng() < (fem ? 0.4 : 0.5)) { L.cost[0] = 1; L.c1 = col(PAL.aTop); } else if (rng() < 0.5) L.c1 = col(PAL.aTop, 0.85);
        if (rng() < 0.7) { L.cost[1] = fem ? rand(0.37, 0.43) : rand(0.32, 0.37); L.c2 = col(PAL.aBottom); }
      }
      if (rng() < 0.45) L.glasses = pick(['black', 'black', 'tort', 'gold']);
    } else if (!cop) {
      if (rng() < 0.55) { L.cost[3] = 1; L.c1 = col(PAL.shell); }
      if (rng() < 0.5) L.c2 = col(PAL.bBottom);
      if (rng() < 0.7) { const g = new THREE.Color(pick(PAL.glow)); L.glow = [g.r, g.g, g.b, rand(2.2, 3.6)]; }
      if (rng() < 0.22) L.dye = col(PAL.dye, rand(0.7, 0.95));
      if (rng() < 0.18) L.glasses = 'led';
    }
    if (fem && !P.hasTop) L.skinTop = L.cost[2] ? L.c1 : col(PAL.bikini); // bikini-only rigs always get a painted top
    const sc = new THREE.Color(P.skinC.x, P.skinC.y, P.skinC.z);
    if (tone) { const hs = {}; sc.getHSL(hs); sc.setHSL((hs.h + tone[0] + 1) % 1, Math.min(1, hs.s * tone[1]), hs.l * (0.35 + 0.65 * tone[2])); }
    this.model.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || o.userData.glass) return; const base = o.material, r = base.userData.role; if (!r || !base.userData.nu) return;
      let t = null; if (r === 'hair') t = hair; else if (r === 'skin' || r === 'detail') t = tone; else if (r === 'cloth' && !base.transparent && rng() >= 0.35) t = cloth;
      const styled = r === 'cloth' ? !cop : r === 'hair' ? L.dye[3] > 0 : r === 'skin' ? !!L.skinTop : false;
      if (!t && !styled) return;
      const m = base.clone(); m.userData.role = r; o.material = m; const u = m.userData.nu; // npcClone: same program, own uniforms, same depth material
      if (t) { u.uHue.value = t[0]; u.uSat.value = t[1]; u.uVal.value = t[2]; }
      u.uSkinC.value.set(sc.r, sc.g, sc.b);
      if (r === 'cloth' && !cop) { u.uCost.value.fromArray(L.cost); u.uCol1.value.fromArray(L.c1); u.uCol2.value.fromArray(L.c2); u.uGlow.value.fromArray(L.glow);
        if (L.cost[3] && /leather|loafer|oxford|heel/i.test(base.name)) u.uCost.value.w = 0; }
      if (r === 'hair') u.uCol1.value.fromArray(L.dye);
      if (r === 'skin' && L.skinTop && base.name === 'Skin') { u.uCost.value.set(0, 0, 2, 0); u.uCol1.value.fromArray(L.skinTop); }
    });
    if (L.glasses) {
      const kind2 = L.glasses === 'led' ? 'led' + (L.glow[3] ? new THREE.Color(L.glow[0], L.glow[1], L.glow[2]).getHex() : 0x22e6ff) : L.glasses;
      let n = 0; this.model.traverse((o) => { if (o.userData.glass) { o.material = glassesMat(kind2, o.userData.glass - 1); o.visible = true; n++; } });
      if (n) this.glassKind = kind2;
    }
  }
  // r6.4 wardrobe (b_corenpc tint only): clothing hue / value shifts (never skin), natural hair shades, and a range of skin tones
  dressOld(kind) {
    // realistic fabric shifts only (r6.2): moderate hue turns at reduced saturation, washed / faded, or darker dyes — no acid colours
    const cloth = kind !== 'cop' && rng() < 0.75 ? pick([[rand(-0.5, 0.5), rand(0.55, 0.95), rand(0.75, 1.08)], [0, rand(0.15, 0.5), rand(0.95, 1.25)], [rand(-0.08, 0.08), rand(0.8, 1.05), rand(0.45, 0.75)]]) : null;
    const hair = rng() < 0.7 ? pick([[0, 0.9, 0.35], [0, 1, 0.55], [0.01, 1.05, 0.8], [0.02, 0.8, 1.25], [0, 0.3, 0.9]]) : null; // black / dark brown / brown / dark blond / greying
    const tone = rng() < 0.6 ? [rand(-0.012, 0.008), rand(1.0, 1.15), pick([rand(0.5, 0.65), rand(0.68, 0.85), rand(0.86, 1.04)])] : null;
    this.model.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return; const n = o.material.name; let t = null;
      if (HAIR_RE.test(n)) t = hair; else if (TONE_RE.test(n)) t = tone;
      else if (!SKIN_RE.test(n) && !o.material.transparent && rng() >= 0.35) t = cloth;
      if (!t) return;
      o.material = hueMat(o.material, 'tint'); const u = o.material.userData.tint; u.uSkin.value = 0; u.uHue.value = t[0]; u.uSat.value = t[1]; u.uVal.value = t[2];
    });
  }
  // hand-held phone for the phone-call / texting idles (world-space like the weapon, posed from the left-hand bones)
  posePhone() {
    const w = Math.max(this.A.phone ? this.A.phone.weight : 0, this.A.text ? this.A.text.weight : 0);
    const show = w > 0.45 && !this.dead && this.lod < 2 && this.root.visible && this.bones.lhand && this.bones.lmid && this.bones.lidx && this.bones.lpinky;
    if (!show) { if (this.phone) this.phone.visible = false; return; }
    if (!this.phone) { this.phone = new THREE.Mesh(phoneGeo(), PHONE_MAT); this.phone.matrixAutoUpdate = false; this.phone.castShadow = false; this.phone.frustumCulled = false; this.scene.add(this.phone); }
    this.phone.visible = true; this.root.updateMatrixWorld(true);
    const B = this.bones; const a = B.lhand.getWorldPosition(_wa), b = B.lmid.getWorldPosition(_wb), t = B.lidx.getWorldPosition(_wx).sub(B.lpinky.getWorldPosition(_wy));
    const fd = _wd.subVectors(b, a); const fl = fd.length() || 1; fd.divideScalar(fl); t.addScaledVector(fd, -t.dot(fd)).normalize();
    const n = _wz.crossVectors(fd, t).normalize(); // palm normal (left hand: the phone-call and texting clips hold it in the left)
    const pos = _wp.copy(a).addScaledVector(fd, fl * 0.75).addScaledVector(n, 0.024);
    this.phone.matrix.makeBasis(t, fd, n).setPosition(pos); this.phone.matrixWorld.copy(this.phone.matrix);
  }
  // LOD by camera distance: 0 full (<20 m), 1 = 30 % tris, no tiny meshes, 2 (>50 m) = 10 % tris + quarter-rate animation; shadows < 28 m
  setLod(d) {
    // r6.2 crowd draw distance: beyond CROWD_DRAW a character (< ~10 px tall at 960 px) is not drawn at all (model hidden, root
    // logic untouched); with 84 peds + seated drivers + 17 distinct cast models this keeps draw calls and GPU memory bounded
    const far = d > (this.lod === 3 ? CROWD_DRAW - 5 : CROWD_DRAW);
    const L = far ? 3 : d < 20 ? 0 : d < 50 ? 1 : 2; if (L === this.lod) return; this.lod = L; this.model.visible = L < 3; if (L === 3) return;
    for (const e of this.lodMeshes) { if (e.g) e.m.geometry = e.g[L]; e.m.visible = !(e.small && L > 0); e.m.castShadow = e.cast && d < 28; }
  }
  // callers pass the speed they intend; the animation follows the speed the body actually moved at (blocked = no treadmill)
  setLocomotion(speed, dt) { this.cmdSpeed = speed; }
  // r5.0: weapon model in the right hand (null = none)
  setWeapon(id) {
    if (id === this.weaponId) return; this.weaponId = id;
    if (this.weaponMesh) { this.scene.remove(this.weaponMesh); this.weaponMesh = null; }
    const m = id ? gunMesh(id) : null; if (m) { this.scene.add(m); this.weaponMesh = m; }
  }
  poseWeapon() {
    const wm = this.weaponMesh; wm.visible = this.root.visible && !this.dead && this.lod < 2 && !!this.bones.hand && this.swimW < 0.5; if (!wm.visible) return;
    this.root.updateMatrixWorld(true);
    const a = this.bones.hand.getWorldPosition(_wa), b = this.bones.mid ? this.bones.mid.getWorldPosition(_wb) : _wb.copy(a);
    const fwd = _wf.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); const fd = _wd.subVectors(b, a); const fl = fd.length() || 1; fd.divideScalar(fl);
    const id = this.weaponId; const bar = _wz;
    if (this.aimW > 0.5 && id !== 'bat') bar.copy(this.aimDir).normalize();
    else if (id === 'bat') bar.copy(fwd).multiplyScalar(-0.45).add(_up).addScaledVector(fd, 0.3).normalize();
    else if (wm.userData.long) bar.copy(fwd).addScaledVector(_up, -0.55).normalize();
    else bar.copy(fwd).multiplyScalar(0.6).addScaledVector(fd, 0.6).addScaledVector(_up, -0.25).normalize();
    const x = _wx.crossVectors(id === 'bat' ? fwd : _up, bar); if (x.lengthSq() < 1e-4) x.set(1, 0, 0); x.normalize(); const y = _wy.crossVectors(bar, x);
    const pos = _wp.copy(a).addScaledVector(fd, Math.min(0.06, fl * 0.6)).addScaledVector(y, -0.01);
    wm.matrix.makeBasis(x, y, bar).setPosition(pos); wm.matrixWorld.copy(wm.matrix);
  }
  // measured motion of the body this frame (teleports / car exits are ignored)
  sense(dt) {
    const p = this.pos;
    if (!this._lp || dt <= 0) { this._lp = p.clone(); this._ly = this.yaw; return; }
    const dx = p.x - this._lp.x, dz = p.z - this._lp.z, dy = p.y - this._lp.y; const sp = Math.hypot(dx, dz) / dt;
    const tele = sp > 14 || Math.abs(dy) / dt > 14;
    const k = 1 - Math.exp(-12 * dt);
    if (tele) { this.mv.set(0, 0); this.mvy = 0; this.airW = 0; this.landW = 0; this.yawRate = 0; }
    else {
      this.mv.x += (dx / dt - this.mv.x) * k; this.mv.y += (dz / dt - this.mv.y) * k; this.mvy += (dy / dt - this.mvy) * (1 - Math.exp(-20 * dt));
      this.yawRate += (angWrap(this.yaw - this._ly) / dt - this.yawRate) * (1 - Math.exp(-10 * dt));
    }
    this._lp.copy(p); this._ly = this.yaw;
  }
  locomote(dt) {
    const A = this.A, cal = this.P.cal; const sp = Math.hypot(this.mv.x, this.mv.y); this.speed = sp;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const f = this.mv.x * sy + this.mv.y * cy, s = this.mv.x * cy - this.mv.y * sy; // forward / left components
    const cs = sp > 0.05 ? f / sp : 1, sn = sp > 0.05 ? s / sp : 0;
    const moveT = smooth(sp, 0.08, 0.7); const runT = smooth(sp, 2.3, 3.8);
    const swim = this.pos.y < -1.2; this.swimW = lerp(this.swimW, swim ? 1 : 0, 1 - Math.exp(-6 * dt));
    // turn-in-place: small side steps while the body turns on the spot
    const turn = (1 - moveT) * smooth(Math.abs(this.yawRate), 0.9, 2.5) * (1 - this.swimW);
    // idle variations (look around, phone call, texting, talking) after standing still for a while
    if (moveT < 0.05 && !this.aiming && !this.weaponId && !this.dead && this.swimW < 0.1) this.idleT += dt; else { this.idleT = Math.min(this.idleT, -2); this.var = null; }
    if (!this.var && this.idleT > (this.isPlayer ? 9 : 2)) {
      const opts = this.isPlayer || this.isCop ? ['look'] : ['look', 'phone', 'text', 'talk', 'talk', 'text'];
      const o2 = opts.filter((k) => A[k]); const nv = o2.length ? pick(o2) : null;
      if (nv && (nv === this.lastVar || this.varW < 0.05)) { if (nv !== this.lastVar) A[nv].time = rng() * A[nv].getClip().duration; this.var = nv; this.varT = rand(6, 18); }
    }
    if (this.var) { this.varT -= dt; if (this.varT <= 0) { this.var = null; this.idleT = -rand(3, 10); } }
    // airborne / landing (player jump, falls) and swim
    const air = !swim && (this.mvy > 2.0 || this.mvy < -3.0);
    const airT = air ? 1 : 0; const wasAir = this.airW > 0.6;
    this.airW = lerp(this.airW, airT, 1 - Math.exp(-(air ? 14 : 18) * dt));
    if (wasAir && !air && A.jland) { A.jland.reset().play(); A.jland.time = 0.15; this.landW = 1; }
    this.landW = Math.max(0, this.landW - dt * 2.4);
    // hit flinch when health drops without dying
    if (this.health < this._hp - 0.5 && !this.dead && A.hitF) { const k = rng() < 0.7 ? 'hitF' : 'hitB'; if (A[k]) { A[k].reset().play(); this.hitK = k; this.hitW = 1; } }
    this._hp = this.health; this.hitW = Math.max(0, this.hitW - dt * 1.6);
    // target weights
    const T = {}; for (const k in A) T[k] = 0;
    const ground = (1 - this.swimW) * (1 - this.airW);
    const idleShare = (1 - moveT) * ground;
    const fw = cs > 0 ? cs * cs : 0, bw = cs < 0 ? cs * cs : 0, lw = sn > 0 ? sn * sn : 0, rw = sn < 0 ? sn * sn : 0;
    T.walk = moveT * ground * (fw * (1 - runT)); T.run = moveT * ground * fw * runT;
    if (A.back) T.back = moveT * ground * bw; else T.walk += moveT * ground * bw;
    if (A.sl) T.sl = moveT * ground * lw; else T.walk += moveT * ground * lw;
    if (A.sr) T.sr = moveT * ground * rw; else T.walk += moveT * ground * rw;
    const tw = turn * 0.55; const idleW = idleShare * (1 - tw);
    if (tw > 0) { const tk = this.yawRate > 0 ? 'sl' : 'sr'; if (A[tk]) T[tk] += idleShare * tw; }
    this.varW = lerp(this.varW, this.var ? 1 : 0, 1 - Math.exp(-2.5 * dt));
    if (this.var) this.lastVar = this.var;
    if (this.lastVar && A[this.lastVar]) T[this.lastVar] = idleW * this.varW;
    let vs = 0; for (const k of ['look', 'phone', 'text', 'talk']) vs += T[k] || 0; T.idle = Math.max(0, idleW - vs);
    if (A.tread) { const sw = smooth(sp, 0.3, 0.9); T.tread = this.swimW * (1 - sw); if (A.swim) T.swim = this.swimW * sw; else T.tread += this.swimW * sw; }
    if (A.jair) T.jair = (1 - this.swimW) * this.airW; else T.idle += (1 - this.swimW) * this.airW;
    // smooth every weight, then normalise so the base layer always sums to 1 (a sum < 1 would bleed the bind / T-pose in)
    let sum = 0; const r = 1 - Math.exp(-9 * dt);
    for (const k of LOOPED) { const a = A[k]; if (!a) continue; a.w = lerp(a.w, T[k] || 0, r); if (a.w < 1e-4) a.w = 0; sum += a.w; }
    if (sum < 1e-3) { A.idle.w = 1; sum = 1; }
    for (const k of LOOPED) if (A[k]) A[k].weight = A[k].w / sum;
    // one-shot overlays (weighted over the base)
    if (A.jland) A.jland.weight = this.landW * 0.8 * (1 - this.swimW);
    for (const k of ['hitF', 'hitB']) if (A[k]) A[k].weight = this.hitK === k ? Math.sin(Math.min(1, this.hitW) * Math.PI / 2) * 1.2 : 0;
    // shared stride phase: cycle frequency = speed / blended stride length, so planted feet do not slide
    let ws = 0, st = 0; for (const k of GAIT) if (A[k] && cal[k]) { ws += A[k].weight; st += A[k].weight * cal[k].stride; }
    const stride = ws > 1e-3 ? st / ws : 1.4; let fq = sp > 0.05 ? sp / stride : 0;
    if (tw > 0 && moveT < 0.5) fq = Math.max(fq, 0.9 * turn);
    if (this.swimW > 0.5) fq = 0;
    this.phase = (this.phase + clamp(fq, 0, 2.2) * dt) % 1;
    for (const k of GAIT) { const a = A[k]; if (!a) continue; const c = cal[k]; const d = c ? c.dur : a.getClip().duration; a.time = ((this.phase + (c ? c.ph : 0)) % 1) * d; }
    // feet on the ground: weighted per-clip lift (calibrated against the bind pose)
    let lift = 0; for (const k of ['idle', ...GAIT, 'look', 'phone', 'text', 'talk']) if (A[k] && cal[k]) lift += A[k].weight * cal[k].lift;
    this.lift = lift;
  }
  // head turns towards the player when close (peds only; skipped while aiming / dead / far LODs)
  lookAt(dt) {
    const t = Character.lookTarget; let want = 0;
    if (t && !this.isPlayer && !this.dead && !this.aiming && this.lod === 0 && this.swimW < 0.1 && this.bones.head && this.bones.neck) {
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z; const d = Math.hypot(dx, dz);
      if (d < 7 && d > 0.6) { const a = angWrap(Math.atan2(dx, dz) - this.yaw); if (Math.abs(a) < 1.9) want = clamp(a, -1.15, 1.15) * smooth(7 - d, 0, 1.5); }
    }
    this.lookY = lerp(this.lookY, want, 1 - Math.exp(-4 * dt));
    if (Math.abs(this.lookY) < 0.01 || this.lod > 0) return;
    this.root.updateMatrixWorld(true);
    for (const [b, f] of [[this.bones.neck, 0.4], [this.bones.head, 0.6]]) {
      b.parent.getWorldQuaternion(_q1); _q2.setFromAxisAngle(_up, this.lookY * f);
      _q3.copy(_q1).invert().multiply(_q2).multiply(_q1); b.quaternion.premultiply(_q3); b.updateMatrixWorld(true);
    }
  }
  update(dt) {
    this.sense(dt);
    const long = this.weaponId && LONG_GUNS.test(this.weaponId);
    this.aimW = lerp(this.aimW, this.aiming && !this.dead ? 1 : 0, 1 - Math.exp(-14 * dt));
    if (this.aimA) this.aimA.weight = this.aimW * (long ? 0 : 6) * (1 - this.swimW);
    if (this.raimA) this.raimA.weight = this.aimW * (long ? 6 : 0) * (1 - this.swimW);
    if (this.dead && !this.deathA) {
      this.fallT = Math.min(1, this.fallT + dt * 2.2);
      const e = this.fallT * this.fallT;
      this.model.rotation.x = -e * Math.PI / 2 * this.fallDir; this.model.position.y = 0.12 * e;
      if (this.fallT < 1) this.mixer.update(dt * 0.3);
    } else {
      if (!this.dead) this.locomote(dt);
      else this.lift = lerp(this.lift, 0, 1 - Math.exp(-6 * dt));
      // swimming: torso at the surface (the clips keep the hips at standing height)
      this.model.position.y = (this.lift + this.swimW * (this.A.swim ? 0.25 * (this.A.swim.weight) : 0)) * this.P.scale;
      if (this.lod < 2) this.mixer.update(dt);
      else if (this.lod === 2) { this.lodAcc += dt; if (this.lodAcc > 0.12) { this.mixer.update(this.lodAcc); this.lodAcc = 0; } } else this.lodAcc += dt; // lod 3 (not drawn): no pose work
    }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    if (!this.dead && this.lod === 0) this.lookAt(dt); else this.lookY = 0;
    if (this.weaponMesh) this.poseWeapon();
    if (this.phone || this.var === 'phone' || this.var === 'text' || this.lastVar === 'phone' || this.lastVar === 'text') this.posePhone();
  }
  kill(dirSign = 1) {
    if (this.dead) return;
    this.dead = true; this.health = 0; this.fallDir = dirSign; this.var = null; this.lookY = 0;
    // dirSign < 0: hit from behind / struck from the front of a car -> falls forward; otherwise falls backward (no instant 180° flip)
    const da = (dirSign < 0 ? this.deathF : this.deathB) || this.deathA;
    if (da) {
      this.deathA = da;
      for (const k in this.A) { this.A[k].weight = 0; this.A[k].w = 0; }
      if (this.aimA) this.aimA.weight = 0; if (this.raimA) this.raimA.weight = 0;
      da.reset(); da.weight = 1; da.play();
    } else for (const k in this.A) this.A[k].weight = k === 'idle' ? 1 : 0;
  }
  revive() {
    this.dead = false; this.health = 100; this._hp = 100; this.fallT = 0; this.model.rotation.x = 0; this.model.position.y = 0;
    for (const k of ['deathF', 'deathB']) if (this[k]) { this[k].stop(); this[k].weight = 0; }
    this.deathA = this.deathF || this.deathB || null;
    for (const k in this.A) { this.A[k].w = k === 'idle' ? 1 : 0; this.A[k].weight = this.A[k].w; if (!LOOPED.includes(k)) this.A[k].stop(); else this.A[k].play(); }
    this._lp = null; this.idleT = -3; this.var = null;
  }
  dispose() { this.scene.remove(this.root); if (this.weaponMesh) this.scene.remove(this.weaponMesh); if (this.phone) this.scene.remove(this.phone); }
}
Character.lookTarget = null;
let PHONE_G = null; const PHONE_MAT = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.4, roughness: 0.25 });
function phoneGeo() { if (!PHONE_G) { PHONE_G = new THREE.BoxGeometry(0.068, 0.142, 0.009); } return PHONE_G; }
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _wa = new THREE.Vector3(), _wb = new THREE.Vector3(), _wf = new THREE.Vector3(), _wd = new THREE.Vector3(), _wz = new THREE.Vector3(), _wx = new THREE.Vector3(), _wy = new THREE.Vector3(), _wp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------ pedestrians ----
export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene; this.city = city; this.list = []; this.loops = city.blocks.filter((b) => b.area !== 'promenade' || true);
    if (city.pedInit) city.pedInit(); // map 霓港 (b_palmloop): loop lanes off the palm / tree pits + colliders for bare sidewalk props
    // r6.0 (from v4.4, map 霓港): sidewalk paths along every road-graph edge (both sides), as polylines in the sidewalk middle
    this.paths = [];
    if (city.graph) for (const e of city.graph.edges) {
      if (e.legacy || !e.sw || e.L < 30) continue;
      for (const sg of [1, -1]) {
        const pts = [], ss = []; const off = (e.hw + e.sw * 0.55) * sg; const s0 = e.n0.trim + 2, s1 = e.L - e.n1.trim - 2; if (s1 - s0 < 20) continue;
        for (let s = s0; s <= s1; s += 3) { const q = pointAt(e, s); const x = q.x - q.tz * off, z = q.z + q.tx * off; if (!city.isLand(x, z) || city.groundH(x, z) < 0.1) { if (pts.length > 6) break; pts.length = 0; ss.length = 0; continue; } pts.push([x, z]); ss.push(s); }
        if (pts.length < 6) continue; const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        this.paths.push({ pts, cum, L: cum[cum.length - 1], mx: pts[pts.length >> 1][0], mz: pts[pts.length >> 1][1], e, sg, ss }); // e / sg / ss: 霓港 lane (b_streetpeds)
      }
    }
  }
  // 霓港 lane of a block loop / sidewalk path: ready -> lane; not yet -> null and queued first for the per-frame solver (b_streetpeds).
  // Without the per-frame solver (?nostreetpeds) loops are solved on the spot as in b_palmloop and paths keep the old polyline.
  laneOf(o, isPath) { const C = this.city; if (C.pedWarm) { if (o._lane) return o._lane; C.pedWant(o, isPath); return null; } return isPath ? null : C.pedLoop ? C.pedLoop(o) : null; }
  pathPoint(path, u) { u = Math.max(0, Math.min(path.L, u)); const C = path.cum; let lo = 0, hi = C.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m] <= u) lo = m; else hi = m; } const a = path.pts[lo], b = path.pts[hi]; const t = (u - C[lo]) / (C[hi] - C[lo] || 1); return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t }; }
  spawn(near, minD = 25, maxD = 110, kinds = ['woman', 'man', 'man']) {
    // r5.0: on the mainland / causeway / island ends people walk the ribbon sidewalks (mode 'line')
    const RW = this.city.region && this.city.region.walks;
    if (RW && RW.length && (near.x < -120 || Math.abs(near.z) > 400 || rng() < 0.08)) {
      for (let t = 0; t < 24; t++) {
        const w = pick(RW); const L = w.s1 - w.s0; if (L < 8) continue; const s = w.s0 + 2 + rng() * (L - 4);
        const p = this.linePoint(w, s); const d = Math.hypot(p.x - near.x, p.z - near.z); if (d < minD || d > maxD) continue;
        if (this.city.col.resolve(p.x, p.z, 0.4, 0.5).hit) continue;
        const c = new Character(this.scene, pick(kinds)); c.pos.set(p.x, this.city.groundH(p.x, p.z), p.z);
        c.ai = { mode: 'line', w, s, dir: rng() < 0.5 ? 1 : -1, speed: rand(1.1, 1.6), wait: rng() < 0.25 ? rand(10, 60) : 0, off: rand(0.35, 0.75) };
        this.list.push(c); return c;
      }
      if (near.x < -120 || Math.abs(near.z) > 400) return null;
    }
    if (this.paths.length) { // r6.0 map 霓港: road-graph sidewalks near the camera, mixed with the Deco block loops
      const nearPaths = this.paths.filter((p) => Math.hypot(p.mx - near.x, p.mz - near.z) < maxD + p.L / 2);
      const nearLoops = this.loops.filter((b) => Math.hypot((b.x0 + b.x1) / 2 - near.x, (b.z0 + b.z1) / 2 - near.z) < maxD + 150);
      for (let t = 0; t < 24 && nearPaths.length; t++) {
        if (nearLoops.length && rng() >= nearPaths.length / (nearPaths.length + nearLoops.length * 2)) break;
        const path = pick(nearPaths); const u = rng() * path.L; let p = this.pathPoint(path, u);
        const d = Math.hypot(p.x - near.x, p.z - near.z); if (d < minD || d > maxD) continue;
        if (this.city.col.resolve(p.x, p.z, 0.4, 0.5).hit) continue;
        const LP = this.laneOf(path, true); if (LP) p = this.city.pathLanePoint(LP, path, u); // 霓港 (b_streetpeds): same accept / reject as the old polyline (rng stream), then stand on the lane when it is solved
        const c = new Character(this.scene, pick(kinds)); c.pos.set(p.x, this.city.groundH(p.x, p.z), p.z);
        c.ai = { mode: 'walk', path, u, dir: rng() < 0.5 ? 1 : -1, speed: rand(1.1, 1.6), wait: rng() < 0.25 ? rand(10, 60) : 0 }; c.ai.lw = LP ? 1 : 0;
        this.list.push(c); return c;
      }
      if (!nearLoops.length) return null;
    }
    for (let t = 0; t < 20; t++) {
      const b = pick(this.loops); const sw = b.area === 'promenade' ? 3 : 2.2;
      // sidewalk loop rectangle (inset from the curb)
      const x0 = b.x0 + sw, x1 = b.x1 - sw, z0 = b.z0 + sw, z1 = b.z1 - sw;
      const per = 2 * (x1 - x0 + z1 - z0); const u = rng() * per;
      let p = this.loopPoint(x0, z0, x1, z1, u);
      const d = Math.hypot(p.x - near.x, p.z - near.z); if (d < minD || d > maxD) continue;
      if (this.city.col.resolve(p.x, p.z, 0.4, 0.5).hit) continue;
      // 霓港 (b_palmloop): same accept / reject as the old rectangle (keeps the rng stream), then stand on the lane
      const LN = this.laneOf(b, false); if (LN) p = this.city.lanePoint(LN, u * LN.per / per);
      const c = new Character(this.scene, pick(kinds));
      c.pos.set(p.x, this.city.groundH(p.x, p.z), p.z);
      c.ai = { mode: 'walk', loop: [x0, z0, x1, z1, per], u, dir: rng() < 0.5 ? 1 : -1, speed: rand(1.1, 1.6), wait: rng() < 0.3 ? rand(15, 90) : 0 }; // 30 % loiter (idle, chatting, waiting)
      if (this.city.pedLoop) { c.ai.blk = b; c.ai.lw = LN ? 1 : 0; } // 霓港: u stays on the old rectangle's parameter, the lane is looked up per frame
      this.list.push(c); return c;
    }
    return null;
  }
  linePoint(w, s, off = 0.55) { const p = w.road.path.at(s); const o = w.side * (w.road.hw + REGION_SW * off); return { x: p.x - p.tz * o, z: p.z + p.tx * o, tx: p.tx, tz: p.tz }; }
  loopPoint(x0, z0, x1, z1, u) {
    const w = x1 - x0, h = z1 - z0; const per = 2 * (w + h); u = ((u % per) + per) % per;
    if (u < w) return { x: x0 + u, z: z0 }; u -= w; if (u < h) return { x: x1, z: z0 + u }; u -= h; if (u < w) return { x: x1 - u, z: z1 }; u -= w; return { x: x0, z: z1 - u };
  }
  update(dt, ctx) {
    const cp = ctx && ctx.camera ? ctx.camera.position : null;
    Character.lookTarget = ctx && ctx.P && ctx.P.onFoot && !ctx.P.car ? ctx.P.pos : null;
    if (this.city.pedWarm) this.city.pedWarm(this, ctx && ctx.P ? ctx.P.pos : cp); // 霓港 (b_streetpeds): solve lanes near the player a slice per frame
    for (const c of this.list) {
      const a = c.ai;
      if (cp) c.setLod(Math.hypot(c.pos.x - cp.x, c.pos.z - cp.z));
      if (c.dead) { c.update(dt); continue; }
      let sp = 0;
      if (a.mode === 'walk') {
        if (a.wait > 0) { a.wait -= dt; sp = 0; }
        else {
          a.u += a.dir * a.speed * dt; let p, p2;
          if (a.path) { if (a.u > a.path.L - 0.5 || a.u < 0.5) { a.dir *= -1; a.u = Math.max(0.5, Math.min(a.path.L - 0.5, a.u)); } p = this.pathPoint(a.path, a.u); p2 = this.pathPoint(a.path, a.u + a.dir * 0.8); }
          else { const [x0, z0, x1, z1] = a.loop; p = this.loopPoint(x0, z0, x1, z1, a.u); p2 = this.loopPoint(x0, z0, x1, z1, a.u + a.dir * 0.8); }
          // 霓港 (b_palmloop / b_streetpeds): the walker follows its lane (off the palm / tree line) once the lane is solved; a walker
          // spawned before that walks the old line and eases over to the lane in ~0.7 s. The rng below is still drawn from the old line.
          const p0 = p; let LN = null;
          if (a.path ? this.city.pedPath : a.blk) LN = this.laneOf(a.path || a.blk, !!a.path);
          if (LN) { let q, q2; if (a.path) { q = this.city.pathLanePoint(LN, a.path, a.u); q2 = this.city.pathLanePoint(LN, a.path, a.u + a.dir * 0.8); } else { const f = LN.per / a.loop[4]; q = this.city.lanePoint(LN, a.u * f); q2 = this.city.lanePoint(LN, (a.u + a.dir * 0.8) * f); }
            a.lw = Math.min(1, (a.lw || 0) + dt * 1.4); const w = a.lw * a.lw * (3 - 2 * a.lw);
            p = w >= 1 ? q : { x: p0.x + (q.x - p0.x) * w, z: p0.z + (q.z - p0.z) * w }; p2 = w >= 1 ? q2 : { x: p2.x + (q2.x - p2.x) * w, z: p2.z + (q2.z - p2.z) * w }; }
          const nx = p.x, nz = p.z; const yawT = Math.atan2(p2.x - p.x, p2.z - p.z);
          c.yaw += angWrap(yawT - c.yaw) * (1 - Math.exp(-8 * dt));
          // avoid obstacles: if blocked, pause briefly and turn back
          const r = this.city.col.resolve(nx, nz, 0.35, 0.5);
          c.pos.x = r.x; c.pos.z = r.z; let hit = r.hit;
          if (p !== p0) hit = this.city.col.resolve(p0.x, p0.z, 0.35, 0.5).hit; // 霓港 lane: draw rng as the old line would (shared stream)
          if (hit && rng() < 0.02) a.dir *= -1;
          sp = a.speed; if (rng() < 0.0015) a.wait = rand(1, 4);
        }
      } else if (a.mode === 'line') {
        if (a.wait > 0) { a.wait -= dt; sp = 0; }
        else {
          a.s += a.dir * a.speed * dt; if (a.s > a.w.s1 - 1) { a.s = a.w.s1 - 1; a.dir = -1; } if (a.s < a.w.s0 + 1) { a.s = a.w.s0 + 1; a.dir = 1; }
          const p = this.linePoint(a.w, a.s, a.off); const yawT = Math.atan2(p.tx * a.dir, p.tz * a.dir);
          c.yaw += angWrap(yawT - c.yaw) * (1 - Math.exp(-8 * dt));
          const r = this.city.col.resolve(p.x, p.z, 0.35, 0.5); c.pos.x = r.x; c.pos.z = r.z; if (r.hit && rng() < 0.02) a.dir *= -1;
          sp = a.speed; if (rng() < 0.0015) a.wait = rand(1, 4);
        }
      } else if (a.mode === 'flee') {
        const dx = c.pos.x - a.from.x, dz = c.pos.z - a.from.z; const yawT = Math.atan2(dx, dz) + Math.sin(a.t * 1.3 + c.id) * 0.4;
        c.yaw += angWrap(yawT - c.yaw) * (1 - Math.exp(-6 * dt)); sp = 5.2;
        const nx = c.pos.x + Math.sin(c.yaw) * sp * dt, nz = c.pos.z + Math.cos(c.yaw) * sp * dt;
        const r = this.city.col.resolve(nx, nz, 0.35, 0.5); c.pos.x = r.x; c.pos.z = r.z;
        if (r.hit) c.yaw += 1.2 * dt * 4;
        a.t += dt; if (a.t > 12) { if (a.w) { a.mode = 'line'; const q = a.w.road.path.nearest(c.pos.x, c.pos.z); a.s = Math.min(a.w.s1 - 1, Math.max(a.w.s0 + 1, q.s)); } else if (a.path) { a.mode = 'walk'; let bu = 0, bd = 1e9; for (let u = 0; u < a.path.L; u += 3) { const q = this.pathPoint(a.path, u); const d = (q.x - c.pos.x) ** 2 + (q.z - c.pos.z) ** 2; if (d < bd) { bd = d; bu = u; } } a.u = bu; } else { a.mode = 'walk'; a.u = this.nearestU(a.loop, c.pos); } }
      } else if (a.mode === 'cower') { sp = 0; a.t += dt; if (a.t > 6) a.mode = 'flee'; }
      c.pos.y = lerp(c.pos.y, this.city.groundH(c.pos.x, c.pos.z), 1 - Math.exp(-15 * dt));
      c.setLocomotion(sp, dt); c.update(dt);
    }
  }
  nearestU(loop, p) { const [x0, z0, x1, z1] = loop; let best = 0, bd = 1e9; const per = 2 * (x1 - x0 + z1 - z0); for (let u = 0; u < per; u += 2) { const q = this.loopPoint(x0, z0, x1, z1, u); const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = u; } } return best; }
  panic(from, radius = 40) { for (const c of this.list) { if (c.dead) continue; if (c.pos.distanceTo(from) < radius) { c.ai.mode = 'flee'; c.ai.from = from.clone(); c.ai.t = 0; } } }
  remove(c) { const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1); c.dispose(); }
}

const REGION_SW = REGION.sw;

// ------------------------------------------------------------------- r6.2 seated pose ----
// Isolated hook used by src/seating.js: after the mixer has posed the character (idle), bend it into a driving / sitting pose
// with world-space aim + two-bone IK (works on any of the cast rigs, whatever their bone axes). S (world space):
// hip (Hips target), fwd / up / left (seat frame unit axes), footL / footR (ankle targets), handL / handR (wrist targets or null
// for hands on the lap), lean (recline rad). w in 0..1 blends from the standing pose (entering / exiting).
const SB = ['Hips', 'Spine', 'Spine1', 'Neck', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _s5 = new THREE.Vector3(), _s6 = new THREE.Vector3();
function aimBoneAt(bone, child, target) {
  const bp = bone.getWorldPosition(_s1); const cur = child.getWorldPosition(_s2).sub(bp); const want = _s3.copy(target).sub(bp);
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  _q1.setFromUnitVectors(cur.normalize(), want.normalize());
  bone.getWorldQuaternion(_q2); _q1.multiply(_q2); bone.parent.getWorldQuaternion(_q3).invert(); bone.quaternion.copy(_q3.multiply(_q1)); bone.updateMatrixWorld(true);
}
function rotateBoneWorld(bone, axis, ang) {
  _q1.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_q2); _q1.multiply(_q2); bone.parent.getWorldQuaternion(_q3).invert(); bone.quaternion.copy(_q3.multiply(_q1)); bone.updateMatrixWorld(true);
}
function ik2(upper, mid, end, target, pole) {
  const J = upper.getWorldPosition(new THREE.Vector3()); const Mp = mid.getWorldPosition(_s4); const E = end.getWorldPosition(_s5);
  const a = J.distanceTo(Mp), b = Mp.distanceTo(E); const d = _s6.copy(target).sub(J); const c = clamp(d.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3); d.normalize();
  const cosA = clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pn = pole.clone().sub(J); pn.addScaledVector(d, -pn.dot(d)); if (pn.lengthSq() < 1e-8) pn.set(0, 1, 0); pn.normalize();
  const elbow = J.clone().addScaledVector(d, a * cosA).addScaledVector(pn, a * sinA); const T = J.clone().addScaledVector(d, c);
  aimBoneAt(upper, mid, elbow); aimBoneAt(mid, end, T);
}
export function poseSeated(c, S, w = 1) {
  const B = c._seatBones || (c._seatBones = Object.fromEntries(SB.map((n) => [n, c.model.getObjectByName(n)])));
  if (!B.Hips || !B.LeftUpLeg || !B.LeftArm || !B.Spine) return false;
  c.root.updateMatrixWorld(true);
  // root so that the hips land on the H-point (blended from where the character stands now)
  const hp = B.Hips.getWorldPosition(new THREE.Vector3()); const rootT = c.root.position.clone().add(_s1.copy(S.hip).sub(hp));
  c.root.position.lerp(rootT, w); c.root.updateMatrixWorld(true);
  const q0 = SB.map((n) => B[n] ? B[n].quaternion.clone() : null);
  rotateBoneWorld(B.Spine, S.left, -(S.lean ?? 0.22));
  if (B.Neck) rotateBoneWorld(B.Neck, S.left, (S.lean ?? 0.22) * 0.7);
  const hipL = B.LeftUpLeg.getWorldPosition(new THREE.Vector3()), hipR = B.RightUpLeg.getWorldPosition(new THREE.Vector3());
  ik2(B.LeftUpLeg, B.LeftLeg, B.LeftFoot, S.footL, hipL.addScaledVector(S.fwd, 0.6).addScaledVector(S.up, 0.6));
  ik2(B.RightUpLeg, B.RightLeg, B.RightFoot, S.footR, hipR.addScaledVector(S.fwd, 0.6).addScaledVector(S.up, 0.6));
  for (const [ft, toe] of [[B.LeftFoot, 'LeftToeBase'], [B.RightFoot, 'RightToeBase']]) { const t = c.model.getObjectByName(toe); if (ft && t) aimBoneAt(ft, t, ft.getWorldPosition(new THREE.Vector3()).addScaledVector(S.fwd, 0.14).addScaledVector(S.up, 0.05)); }
  for (const [sh, arm, fore, hand, tgt, side] of [[B.LeftShoulder, B.LeftArm, B.LeftForeArm, B.LeftHand, S.handL, 1], [B.RightShoulder, B.RightArm, B.RightForeArm, B.RightHand, S.handR, -1]]) {
    if (!arm || !fore || !hand) continue;
    const sp = arm.getWorldPosition(new THREE.Vector3());
    const t = tgt ? tgt.clone() : sp.clone().addScaledVector(S.up, -0.52).addScaledVector(S.fwd, 0.3).addScaledVector(S.left, -side * 0.08); // hands on the thighs
    ik2(arm, fore, hand, t, sp.clone().addScaledVector(S.up, -0.7).addScaledVector(S.left, side * 0.35).addScaledVector(S.fwd, -0.1));
    const mid = hand.children.find((o) => /Middle1/.test(o.name)); if (mid) { const hpw = hand.getWorldPosition(new THREE.Vector3()); const fd = hpw.clone().sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
      aimBoneAt(hand, mid, hpw.addScaledVector(fd, 0.1).addScaledVector(tgt ? S.up : S.fwd, 0.06)); }
  }
  if (w < 1) SB.forEach((n, i) => { if (B[n]) B[n].quaternion.slerpQuaternions(q0[i], B[n].quaternion.clone(), w); });
  return true;
}
