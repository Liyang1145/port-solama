// b_envprog: fewer shader programs for environment (non-character) MeshStandardMaterials. Pixels unchanged.
// Why: every distinct three.js program is a full lit shader (sun CSM + 19 point + 2 spot lights) that the GPU driver compiles on
// the first frame (ANGLE/D3D: FXC, serial; sandbox: SwiftShader JIT). Many environment programs differed only in parameters that
// can be made uniform without changing the result:
//  1. which texture slots are bound -> missing map / emissiveMap filled with a shared 1x1 white (multiplies by 1), roughness /
//     metalness with 1x1 white (x1), normalMap with a flat 1x1 + normalScale 0, and uniform uENM = 0 keeps the normal exactly as
//     it was before the normal-map step (foliage patches bend back-face normals before it);
//  2. vertexColors on/off -> always on in the program; uniform uEVC = 0 replaces the vertex colour by exactly 1.0 (the attribute
//     may be absent: the generic attribute value is finite, mix(1, c, 0) == 1);
//  3. opaque vs transparent (OPAQUE define) -> opaque materials use NoBlending (the same GL state three uses for opaque) and
//     uniform uEOpq forces alpha = 1, exactly what the OPAQUE define did;
//  4. FrontSide / BackSide / DoubleSide -> DoubleSide in the program, the original culling restored after three's setMaterial
//     (main pass and shadow depth pass); single-sided transparent materials are drawn in one pass (forceSinglePass), as before;
//  5. names: unpatched prep() materials ('roof', 'whitep', 'metal', 'lamp', 'ph_*' ...) share one program ('std'), and patches
//     that differed only in constants (foliage sway/transmission, prairie wind) read them from uniforms (veg.js, nature.js).
// ?oldenvmat restores the old per-combination programs exactly.
import * as THREE from 'three';

export const OLDENV = typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldenvmat');
const DBG = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('envdbg') || '') : ''; // test-only bisect switches
export const envStats = { mats: 0, skipped: 0, ph: 0, cull: 0, blend: 0, vc: 0 };
// patched families whose patch differs only in constants (now uniforms) share one program
const FAM = { leaf: 'fol', tbark: 'fol', frond: 'fol', ptrunk: 'fol', pcrown: 'fol', jleaf: 'fol', jvine: 'fol', fern: 'fol', jpalm: 'fol', bigleaf: 'fol', litter: 'fol', grassb: 'wind', flower: 'wind' };
// families whose members mix alphaTest and opaque: give the opaque ones alphaTest 0.001 (no discard, see ENV_AT)
const ATFAM = { fol: 1 };
const PENDING = new Set();
let PH = null;
function px1(r, g, b, srgb) { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }
function ph() { return PH || (PH = { white: px1(255, 255, 255, true), lin: px1(255, 255, 255, false), flat: px1(128, 128, 255, false) }); }

export function envFamily(key, patched) { return patched ? (FAM[key] || key) : 'std'; }

// called by prep(): normalised lazily right before the next render, when the material is fully set up
export function envReg(mat, key, patched) {
  if (OLDENV || !mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || key === 'npc' || key === 'ch') return;
  mat.userData.envFam = envFamily(key, patched); PENDING.add(mat); hook();
  // Material.clone() drops onBeforeCompile / customProgramCacheKey: clones keep the hooks and are normalised too
  if (!mat.__envClone && !DBG.includes('noclone')) { mat.__envClone = 1; const c0 = mat.clone; mat.clone = function () { const c = c0.call(this); c.onBeforeCompile = this.onBeforeCompile; c.customProgramCacheKey = this.customProgramCacheKey; c.clone = this.clone; c.__envClone = 1; if (!c.userData.envOn) PENDING.add(c); return c; }; }
}

function normalise(m) {
  if (m.userData.envOn || !m.userData.envFam) return;
  // unusual slots / modes keep their own program (rare: bump-mapped sticker sheet, ao-mapped GLBs, wireframe, flat shading)
  if (m.aoMap || m.lightMap || m.bumpMap || m.alphaMap || m.displacementMap || m.flatShading || m.wireframe || m.alphaToCoverage || m.blending !== THREE.NormalBlending
    || (m.map && m.map.channel) || (m.emissiveMap && m.emissiveMap.channel) || (m.normalMap && m.normalMap.channel) || (m.roughnessMap && m.roughnessMap.channel) || (m.metalnessMap && m.metalnessMap.channel)
    || m.normalMapType !== THREE.TangentSpaceNormalMap) { envStats.skipped++; return; }
  const P = ph(); envStats.mats++;
  if (!m.map) { m.map = P.white; envStats.ph++; }
  if (!m.emissiveMap) { m.emissiveMap = P.white; envStats.ph++; }
  const nm = m.normalMap ? 1 : 0; if (!nm) { m.normalMap = P.flat; m.normalScale.set(0, 0); envStats.ph++; }
  if (!m.roughnessMap) { m.roughnessMap = P.lin; envStats.ph++; }
  if (!m.metalnessMap) { m.metalnessMap = P.lin; envStats.ph++; }
  const vc = m.vertexColors ? 1 : 0; if (!vc) { m.vertexColors = true; envStats.vc++; }
  const opq = !m.transparent; if (opq) m.blending = THREE.NoBlending; else envStats.blend++;
  if (ATFAM[m.userData.envFam] && !(m.alphaTest > 0)) m.alphaTest = 0.001;
  if (m.side !== THREE.DoubleSide) {
    // main pass culls like the original side; shadow depth culls like three's default shadow side for it (Front -> Back)
    const s0 = m.side; const sh = m.shadowSide !== null ? m.shadowSide : (s0 === THREE.FrontSide ? THREE.BackSide : THREE.FrontSide);
    m.userData.envCull = s0; if (sh !== THREE.DoubleSide) m.userData.envDCull = sh;
    m.side = THREE.DoubleSide; m.shadowSide = THREE.DoubleSide; if (m.transparent) m.forceSinglePass = true; envStats.cull++;
  }
  m.userData.eu = { uEVC: { value: vc }, uEOpq: { value: opq ? 1 : 0 }, uENM: { value: nm }, uEK: { value: m.userData.envEK || 0 } };
  m.userData.envOn = 1; m.needsUpdate = true;
}

export function envFlush() {
  if (PENDING.size) { for (const m of PENDING) normalise(m); PENDING.clear(); }
}

// shader edits common to every normalised program (identical text -> one program per family)
const ENV_VC = `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= mix( vec4( 1.0 ), color, uEVC );
#elif defined( USE_COLOR )
	vColor.rgb *= mix( vec3( 1.0 ), color, uEVC );
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif`;
const ENV_AT = '#ifdef USE_ALPHATEST\nif ( alphaTest > 0.0015 && diffuseColor.a < alphaTest ) discard;\n#endif';
// uEK: small emissive patches folded in (were their own programs): 1 = 'neon' trims (vertex colour glow), 2 = 'fabLamp' heads
const ENV_EK = `#include <emissivemap_fragment>
  if ( uEK > 0.5 ) totalEmissiveRadiance += uEK < 1.5 ? vColor.rgb * ( 0.25 + uENight * 5.0 ) : step( 0.9, vColor.r ) * uENight * vec3( 1.0, 0.72, 0.42 ) * 6.0;`;
export function envPatch(s, m, U) {
  Object.assign(s.uniforms, m.userData.eu); s.uniforms.uENight = U.uNight; // own name: family patches declare uNight themselves
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uEVC;').replace('#include <color_vertex>', ENV_VC);
  // flat placeholder normal map: keep the normal exactly as it was before the normal-map step (patches may bend it in between)
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uEOpq; uniform float uENM; uniform float uEK; uniform float uENight;')
    .replace('#include <emissivemap_fragment>', DBG.includes('noek') ? '#include <emissivemap_fragment>' : ENV_EK)
    .replace('#include <normal_fragment_maps>', 'vec3 eN0 = normal;\n#include <normal_fragment_maps>\nif ( uENM < 0.5 ) normal = eN0;')
    .replace('#include <alphatest_fragment>', ENV_AT)
    .replace('#include <opaque_fragment>', 'if ( uEOpq > 0.5 ) diffuseColor.a = 1.0;\n#include <opaque_fragment>');
}

// culling restore. renderBufferDirect remembers the drawn object so the shared shadow depth material can find its source material
let CUR = null, CURG = null, HOOKED = false;
function hook() { HOOKED = true; } // kept for clarity: the renderer is wrapped once by envInstall (main.js)
// main.js calls this right after creating the renderer: every render / compile first normalises pending materials
export function envInstall(r) {
  if (OLDENV || r.__envInst) return; r.__envInst = true;
  for (const fn of ['render', 'compile', 'compileAsync']) { const f0 = r[fn]; if (typeof f0 !== 'function') continue; r[fn] = function (...a) { envFlush(); return f0.apply(this, a); }; }
  if (!DBG.includes('noic')) icAccessor(); wrapRenderer(r);
}
// instanced meshes whose materials are all normalised read a white instanceColor (x1) when they have none, so 'instanced' and
// 'instanced + colour' share programs. Done in an accessor so the buffer exists before three uploads the frame's attributes and
// picks the program (a buffer attached mid-draw would stay unbound in the cached VAO); code that sets or fills its own colours
// (setColorAt, nature.js grass) goes through the same accessor unchanged.
function icAccessor() {
  const P = THREE.InstancedMesh.prototype; if (Object.getOwnPropertyDescriptor(P, 'instanceColor')) return;
  Object.defineProperty(P, 'instanceColor', { configurable: true,
    set(v) { this.__ic = v; },
    get() { let ic = this.__ic; const im = this.instanceMatrix; if (!im) return ic === undefined ? null : ic;
      if (ic) { if (ic.__env && ic.count < im.count) ic = this.__ic = whiteIC(im.count); return ic; }
      const ms = Array.isArray(this.material) ? this.material : [this.material];
      if (ms.length && ms.every((m) => m && m.userData.envOn)) return (this.__ic = whiteIC(im.count));
      return ic === undefined ? null : ic; } });
}
function whiteIC(n) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); a.__env = 1; return a; }
function wrapRenderer(r) {
  if (r.__envWrap) return; r.__envWrap = true; const st = r.state; const gl = r.getContext();
  const rbd = r.renderBufferDirect; r.renderBufferDirect = function (camera, scene, geometry, material, object, group) { CUR = object; CURG = group; return rbd.call(this, camera, scene, geometry, material, object, group); };
  const sm = st.setMaterial;
  st.setMaterial = function (material, frontFaceCW, ...rest) {
    sm.call(this, material, frontFaceCW, ...rest);
    let c = material.userData.envCull;
    if (c === undefined && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial) && CUR) {
      const om = Array.isArray(CUR.material) ? (CURG ? CUR.material[CURG.materialIndex] : null) : CUR.material; if (om && om.userData.envOn) c = om.userData.envDCull;
    }
    if (c === THREE.FrontSide) { st.enable(gl.CULL_FACE); st.setFlipSided(!!frontFaceCW); } else if (c === THREE.BackSide) { st.enable(gl.CULL_FACE); st.setFlipSided(!frontFaceCW); }
  };
}
if (typeof window !== 'undefined') window.__ENVSTATS = envStats; // test harness readout
