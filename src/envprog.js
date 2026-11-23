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
  mat.userData.envFam = envFamily(key, patched); PENDING.add(mat);
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
  if ((ATFAM[m.userData.envFam] || envUberAT(m.userData.envFam)) && !(m.alphaTest > 0)) m.alphaTest = 0.001;
  if (m.side !== THREE.DoubleSide) {
    // main pass culls like the original side; shadow depth culls like three's default shadow side for it (Front -> Back)
    const s0 = m.side; const sh = m.shadowSide !== null ? m.shadowSide : (s0 === THREE.FrontSide ? THREE.BackSide : THREE.FrontSide);
    m.userData.envCull = s0; if (sh !== THREE.DoubleSide) m.userData.envDCull = sh;
    m.side = THREE.DoubleSide; m.shadowSide = THREE.DoubleSide; if (m.transparent) m.forceSinglePass = true; envStats.cull++;
  }
  m.userData.eu = { uEVC: { value: vc }, uEOpq: { value: opq ? 1 : 0 }, uENM: { value: nm }, uEK: { value: m.userData.envEK || 0 } };
  m.userData.envOn = 1; m.needsUpdate = true; if (!OLDENV2) envClsNote(m);
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
let CUR = null, CURG = null;
// main.js calls this right after creating the renderer: every render / compile first normalises pending materials
export function envInstall(r) {
  if (OLDENV || r.__envInst) return; r.__envInst = true;
  for (const fn of ['render', 'compile', 'compileAsync']) { const f0 = r[fn]; if (typeof f0 !== 'function') continue; r[fn] = function (...a) { envFlush(); if (fn !== 'render' && !OLDENV2 && a[0] && a[0].traverse) a[0].traverse(prepObj); return f0.apply(this, a); }; }
  if (!DBG.includes('noic')) icAccessor(); wrapRenderer(r); envCaps(r);
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
  const rbd = r.renderBufferDirect; r.renderBufferDirect = function (camera, scene, geometry, material, object, group) { CUR = object; CURG = group;
    if (!OLDENV2) { if (scene !== null) { instAT(object, material); if (material.isMeshBasicMaterial && !material.map) basicPH(material); } if (material.userData.envFam) kindCheck(object, material); else if (scene === null && material.isMeshDepthMaterial && object.customDepthMaterial !== material && !DBG.includes('nodepth')) material = envDepth(object, group, material); }
    return rbd.call(this, camera, scene, geometry, material, object, group); };
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

// ---- merging patch families (b_envprog step 3) --------------------------------------------------------------------------------
// envMerger(name): materials whose prep() patches differ in code (not only constants) share one program: every member's insertions
// go into one shader, each wrapped in `if (uPK == i)` (uniform, coherent branch). The insertions are read by running each original
// patch on a probe shader made of the real include lines, and verified: applying the extracted edits alone to the stock physical
// shader must give exactly what the original patch gives. Any mismatch (a patch editing something other than an include, or
// anything unexpected) -> no merge, every member keeps its own program and code.
const STMT_T = /^(float|vec2|vec3|vec4|int|bool)\s+(\w+)\s*=/;
function incs(src) { const r = []; src.replace(/#include <(\w+)>/g, (m, n) => { if (!r.includes(n)) r.push(n); }); return r; }
function probe(names) { return names.map((n) => `\n//@@${n}\n#include <${n}>\n`).join(''); }
function readEdits(names, txt) { // -> { name: [pre, post] } or null
  const out = {}; const parts = txt.split(/\n\/\/@@(\w+)\n/); if (parts[0] !== '' || parts.length !== names.length * 2 + 1) return null;
  for (let i = 0; i < names.length; i++) { const n = parts[1 + 2 * i], seg = parts[2 + 2 * i]; if (n !== names[i]) return null; const inc = `#include <${n}>`; const k = seg.indexOf(inc); if (k < 0 || seg.indexOf(inc, k + 1) >= 0) return null;
    const pre = seg.slice(0, k), post = seg.slice(k + inc.length); if (!post.endsWith('\n')) return null; const p2 = post.slice(0, -1); if (pre || p2) out[n] = [pre, p2]; }
  return out;
}
function applyEdits(src, E) { for (const n in E) src = src.replace(`#include <${n}>`, E[n][0] + `#include <${n}>` + E[n][1]); return src; }
function isDecl(n) { return n === 'common' || /_pars_/.test(n); }
function stripC(t) { return t.replace(/\/\/[^\n]*/g, ''); }
function splitTop(t) { // top-level statements / function bodies
  const r = []; let d = 0, s = 0; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { r.push(t.slice(s, i + 1).trim()); s = i + 1; } } else if (c === ';' && d === 0) { r.push(t.slice(s, i + 1).trim()); s = i + 1; } }
  const rest = t.slice(s).trim(); if (rest) r.push(rest); return r.filter(Boolean);
}
export function envMerger(name) {
  const P = []; let B = null;
  const build = () => {
    try {
      const L = THREE.ShaderLib.physical; const VN = incs(L.vertexShader), FN = incs(L.fragmentShader); const PV = probe(VN), PF = probe(FN);
      const K = P.map((fn) => { const t = { uniforms: {}, vertexShader: PV, fragmentShader: PF }; fn(t); const ev = readEdits(VN, t.vertexShader), ef = readEdits(FN, t.fragmentShader); if (!ev || !ef) throw new Error('probe');
        const r = { uniforms: {}, vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }; fn(r);
        if (applyEdits(L.vertexShader, ev) !== r.vertexShader || applyEdits(L.fragmentShader, ef) !== r.fragmentShader) throw new Error('verify');
        for (const E of [ev, ef]) for (const n in E) if (/#/.test(E[n][0] + E[n][1])) throw new Error('preprocessor'); // keep it simple: no #if in merged edits
        return { ev, ef, uniforms: t.uniforms }; });
      // identical members share an index
      const sig = K.map((k) => JSON.stringify([k.ev, k.ef])); const idx = sig.map((s) => sig.indexOf(s));
      const U0 = {}; for (const k of K) Object.assign(U0, k.uniforms);
      const V = {}, F = {}, VD = {}, FD = {}; const decl = { f: [] }; // VD / FD: global-scope hooks (common, *_pars_*): deduplicated declarations
      const addDecl = (arr, txt) => { for (const st of splitTop(stripC(txt))) if (!arr.includes(st)) arr.push(st); };
      const done = new Set();
      K.forEach((k, i) => { if (done.has(idx[i])) return; done.add(idx[i]);
        for (const n in k.ev) { const [pre, post] = k.ev[n]; if (isDecl(n)) { const D = VD[n] || (VD[n] = [[], []]); addDecl(D[0], pre); addDecl(D[1], post); continue; }
          for (const part of [pre, post]) for (const st of splitTop(stripC(part))) if (STMT_T.test(st)) throw new Error('vdecl'); // vertex edits must be plain assignments
          const cur = V[n] || (V[n] = ['', '']); for (const [j, part] of [pre, post].entries()) { const sts = splitTop(stripC(part)); for (const st of sts) if (!cur[j].includes(st)) cur[j] += '\n' + st; } }
        // fragment: hoist top-level declarations used by another hook of the same member, renamed per member
        const hooks = Object.keys(k.ef).filter((n) => !isDecl(n)); const code = {}; for (const n of hooks) code[n] = k.ef[n].map(stripC);
        for (const n of hooks) for (const j of [0, 1]) for (const st of splitTop(code[n][j])) { const m = STMT_T.exec(st); if (!m) continue; const nm = m[2];
          if (!hooks.some((o) => o !== n && new RegExp('\\b' + nm + '\\b').test(code[o].join(' ')))) continue; const g = nm + '_pk' + idx[i]; const re = new RegExp('\\b' + nm + '\\b', 'g');
          decl.f.push(m[1] + ' ' + g + ';'); for (const o of hooks) code[o] = code[o].map((c) => c.replace(re, g)); code[n][j] = code[n][j].replace(m[1] + ' ' + g, g).replace(new RegExp('^\\s*' + m[1] + '\\s+' + g), g); }
        for (const n in k.ef) if (isDecl(n)) { const D = FD[n] || (FD[n] = [[], []]); addDecl(D[0], k.ef[n][0]); addDecl(D[1], k.ef[n][1]); }
        for (const n of hooks) { const cur = F[n] || (F[n] = ['', '']); for (const j of [0, 1]) if (code[n][j].trim()) cur[j] += `\nif ( uPK == ${idx[i]}.0 ) {\n${code[n][j]}\n}`; } });
      const ev = {}, ef = {}; for (const n in V) ev[n] = [V[n][0] ? V[n][0] + '\n' : '', V[n][1]]; for (const n in F) ef[n] = [F[n][0] ? F[n][0] + '\n' : '', F[n][1]];
      const dj = (a) => (a.length ? '\n' + a.join('\n') : '');
      for (const n in VD) ev[n] = [VD[n][0].length ? VD[n][0].join('\n') + '\n' : '', dj(VD[n][1])];
      for (const n in FD) ef[n] = [FD[n][0].length ? FD[n][0].join('\n') + '\n' : '', dj(FD[n][1])];
      const fc = ef.common || ['', '']; ef.common = [fc[0], '\nuniform float uPK;' + dj(decl.f) + fc[1]];
      B = { ok: true, ev, ef, idx, U0, K, n: done.size }; (envStats.merge || (envStats.merge = {}))[name] = P.length + '->' + done.size + ' branches';
    } catch (e) { console.warn('[envprog] merge ' + name + ' skipped:', e.message); B = { ok: false }; (envStats.merge || (envStats.merge = {}))[name] = 'skipped: ' + e.message; }
    return B;
  };
  return { wrap(fn, key) {
    const i = P.length; P.push(fn);
    const w = (s) => { if (!B) build(); if (!B.ok) return fn(s); const t = { uniforms: {}, vertexShader: '', fragmentShader: '' }; fn(t); // own uniform values
      Object.assign(s.uniforms, B.U0, t.uniforms, { uPK: { value: B.idx[i] } }); s.vertexShader = applyEdits(s.vertexShader, B.ev); s.fragmentShader = applyEdits(s.fragmentShader, B.ef); };
    w.envKey = () => { if (!B) build(); return (B.ok ? name : key) + '|e'; }; return w; } };
}

// ---- b_envprog2: one merged program for the opaque environment families ('envu') ------------------------------------------------
// Every member family's patch is read the same way as envMerger above (probe shader, edits verified against the original patch) and
// goes into one shader behind `if (uPK == i)`; on top of envMerger this also takes
//  - patches that replace a whole include (only the chunks in REP_OK: the member's code, else the stock chunk),
//  - vertex edits (each member's own block, so two members writing one varying cannot clash),
//  - preprocessor lines inside a member's code (#ifdef USE_INSTANCING ...),
//  - declarations hoisted per member when a local is used by a later hook (comma lists too),
// and trims by define: a member's code is compiled only into the program variants it can be drawn with (UBF: i = instanced only,
// m = non-instanced only, a = alpha-tested) -> the instanced program does not carry road / ground code and the other way round.
// A material drawn in a variant its family was not listed for is switched to its own old program before that draw (renderBufferDirect
// wrapper below), so the table can only cost merging, never pixels. Conflicting declarations, too many samplers / attributes /
// varyings for this GPU, or a failed check drop that one member (own program, console.warn); the others still merge.
// Opaque default state only: transparent, polygon-offset, depthWrite / depthTest off, other depth funcs keep their own programs
// (SwiftShader re-JITs a whole fragment program per depth / blend state, so a big shared program would cost more there).
// ?oldenvmat2 -> exactly b_envprog (ground-family merger, nothing below).
export const ENVDBG = DBG;
export const OLDENV2 = OLDENV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldenvmat2'));
const UBF = {
  std: '--', // unpatched prep() materials: no code of their own, they just stop being a separate program
  // B 霓港 / shared
  road: 'm-', vcol: 'm-', sidewalk: 'm-', sand: 'm-', mgc: 'm-', grass: 'm-', mgg2: 'm-', terrain: 'm-',
  boulder: 'ia', creek: 'm-', furn63: 'm-',
  // 霓港 decals (were hand-made materials, now prep()'d: envAdopt). viaconc stays out: adopting it moved 2 % of pixels by 1/255
  cnsign: 'm-', puddleN: 'm-', qpuddle: 'm-',
  fol: 'ia', wind: 'ia', jbark: 'ia', portbox: 'ia',
  // A 索拉纳港 far city
  fabLot: 'm-', fabBody: 'ia', fabS: 'ia',
};
// instanced families (and unpatched materials first drawn instanced, see instAT) get alphaTest 0.001: ENV_AT never discards at that
// value in the main pass and envDepth gives every normalised source the same rule in the shadow pass, so pixels and shadows are
// unchanged and all instanced environment draws share the alpha-tested variant with the foliage (one program instead of two)
export function envUberAT(fam) { return !OLDENV2 && !!UBF[fam] && UBF[fam][1] === 'a'; }
function instAT(o, m) { if (o.isInstancedMesh && m.userData.envOn && m.userData.envFam === 'std' && !(m.alphaTest > 0) && clsOf(m) === 'u' && !DBG.includes('noinstat')) { m.alphaTest = 0.001; envStats.instAT = (envStats.instAT || 0) + 1; } }
// MeshBasicMaterial without a map -> shared white 1x1 map (x 1.0): same program as the mapped ones
function basicPH(m) { if (m && m.isMeshBasicMaterial && !m.map && !DBG.includes('nobasic')) { m.map = ph().white; m.needsUpdate = true; envStats.basic = (envStats.basic || 0) + 1; } }
function prepObj(o) { if (!o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { instAT(o, m); basicPH(m); } }
const REP_OK = new Set(['map_fragment', 'color_fragment', 'roughnessmap_fragment']); // chunks safe to put in braces
const REP_DECL = { roughnessmap_fragment: 'float roughnessFactor' }; // ...once this local is declared before the branches
const CAPS = { tex: 16, attr: 16, vary: 15 };
const AUTOI = new Set(); // families whose code reads instance attributes without an #ifdef USE_INSTANCING: instanced-only
const REPF = new Map(); // family -> representative patch (code); same family = same code
const UBS = {}; // build result per state class: u = opaque default state, o = polygon-offset decals (opaque, depth write on)
const CLS = {}; // family -> bit set of the classes its materials were seen in (1 = u, 2 = o)
const DTYPE = /^(?:(?:highp|mediump|lowp)\s+)?(float|vec2|vec3|vec4|int|bool|mat2|mat3|mat4|ivec2|ivec3|ivec4)\s+([\s\S]*);$/;
function splitComma(t) { const r = []; let d = 0, s = 0; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && d === 0) { r.push(t.slice(s, i)); s = i + 1; } } r.push(t.slice(s)); return r.map((x) => x.trim()); }
function nrm(t) { return t.replace(/\s+/g, ' ').trim(); }
function declNames(st) {
  st = st.trim(); if (st.startsWith('#')) { const m = /^#define\s+(\w+)/.exec(st); return m ? ['#' + m[1]] : []; }
  if (/^precision\s/.test(st)) return [];
  if (st.endsWith('}')) { const m = /^[\w\s]*?\b(\w+)\s*\(/.exec(st); if (m) return ['f:' + m[1]]; const s = /^struct\s+(\w+)/.exec(st); return s ? [s[1]] : ['?' + st]; }
  if (/\(/.test(st) && !/=/.test(st)) { const m = /(\w+)\s*\(/.exec(st); return m ? ['f:' + m[1]] : []; }
  const s = st.replace(/;$/, '').replace(/\b(uniform|varying|attribute|flat|smooth|highp|mediump|lowp|const|centroid|invariant)\b/g, ' ').trim();
  const m = /^(\w+)\s+([\s\S]*)$/.exec(s); if (!m) return ['?' + st];
  return splitComma(m[2]).map((d) => (/^(\w+)/.exec(d) || [])[1]).filter(Boolean);
}
const VSZ = { float: 0.25, vec2: 0.5, vec3: 1, vec4: 1, mat3: 3, mat4: 4, int: 0.25, ivec2: 0.5 };
function readEdits2(names, txt) { // -> { name: [pre, post] | { rep } } or null
  const out = {}; const parts = txt.split(/\n\/\/@@(\w+)\n/); if (parts[0] !== '' || parts.length !== names.length * 2 + 1) return null;
  for (let i = 0; i < names.length; i++) { const n = parts[1 + 2 * i], seg = parts[2 + 2 * i]; if (n !== names[i]) return null; const inc = `#include <${n}>`; const k = seg.indexOf(inc);
    if (!seg.endsWith('\n')) return null;
    if (k < 0) { out[n] = { rep: seg.slice(0, -1) }; continue; }
    if (seg.indexOf(inc, k + 1) >= 0) return null;
    const pre = seg.slice(0, k), post = seg.slice(k + inc.length); const p2 = post.slice(0, -1); if (pre || p2) out[n] = [pre, p2]; }
  return out;
}
function applyEdits2(src, E) { for (const n in E) { const inc = `#include <${n}>`; const e = E[n]; src = src.replace(inc, () => (e.rep !== undefined ? e.rep : e[0] + inc + e[1])); } return src; }
function guardOf(f, stage) { const k = (UBF[f] || '--').replace(/./, (c) => (AUTOI.has(f) ? 'i' : c)); const c = []; if (k[0] === 'i') c.push('defined( EU_INST )'); else if (k[0] === 'm') c.push('!defined( EU_INST )'); if (stage === 'f') { if (k[1] === 'a') c.push('defined( USE_ALPHATEST )'); else if (k[1] === 'n') c.push('!defined( USE_ALPHATEST )'); } return c.join(' && '); }
function gwrap(g, code) { return g ? `\n#if ${g}\n${code}\n#endif` : '\n' + code; }

// perf_debug6: cross-hook duplicate check for buildUber's declaration pass (see there). true = already declared at or before (n, j)
const OLDX = typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldxdedup');
export const xdedupStats = (envStats.xdedup = { reused: 0, moved: 0 });
function xdup(order, D, pend, n, j, s) { const pos = (h, k) => order.indexOf(h) * 2 + k; const me = pos(n, j);
  for (const h in D) for (const k of [0, 1]) { const L = D[h][k]; const i = L.findIndex((x) => nrm(x) === s); if (i < 0) continue;
    if (pos(h, k) <= me) { xdedupStats.reused++; return true; } L.splice(i, 1); xdedupStats.moved++; return false; }
  for (const a of pend) if (nrm(a[2]) === s && (a[0] !== n || a[1] !== j) && pos(a[0], a[1]) <= me) { xdedupStats.reused++; return true; }
  return false; }
function buildUber(cls) {
  if (UBS[cls]) return UBS[cls]; const bit = cls === 'u' ? 1 : 2;
  const L = THREE.ShaderLib.physical; const VN = incs(L.vertexShader), FN = incs(L.fragmentShader); const PV = probe(VN), PF = probe(FN);
  const B = { idx: new Map(), U0: {}, bad: {}, VD: {}, FD: {}, V: {}, F: {}, VR: {}, FR: {}, glob: { v: [], f: [] }, names: new Map(), samp: 0, attr: 0, vary: 0, sigs: [] };
  for (const [fam, fn] of REPF) { if (!(CLS[fam] & bit)) continue;
    try {
      const t = { uniforms: {}, vertexShader: PV, fragmentShader: PF }; fn(t); const ev = readEdits2(VN, t.vertexShader), ef = readEdits2(FN, t.fragmentShader); if (!ev || !ef) throw new Error('probe');
      const r = { uniforms: {}, vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }; fn(r);
      if (applyEdits2(L.vertexShader, ev) !== r.vertexShader || applyEdits2(L.fragmentShader, ef) !== r.fragmentShader) throw new Error('verify');
      for (const E of [ev, ef]) for (const n in E) { if (E[n].rep !== undefined && (!REP_OK.has(n) || isDecl(n))) throw new Error('replaces ' + n); if ((E[n].rep !== undefined ? E[n].rep : E[n].join('\n')).split('\n').some((l) => l.includes('#') && !/^\s*#/.test(l))) throw new Error('inline #'); }
      const sig = JSON.stringify([ev, ef]); let idx = B.sigs.indexOf(sig);
      if (idx >= 0) { B.idx.set(fam, idx); Object.assign(B.U0, t.uniforms); continue; } // same code as an earlier member
      idx = B.sigs.length; if (/\binstance(Matrix|Color)\b/.test(sig) && !/USE_INSTANCING/.test(sig)) AUTOI.add(fam);
      const gv = guardOf(fam, 'v'), gf = guardOf(fam, 'f');
      // declarations: dedupe identical statements, refuse a name declared differently, count samplers / attributes / varyings
      const add = { VD: [], FD: [] }; const nn = new Map(); let samp = 0, attr = 0, vary = 0;
      for (const [E, D, tag] of [[ev, B.VD, 'VD'], [ef, B.FD, 'FD']]) for (const n in E) { if (!isDecl(n)) continue;
        for (const j of [0, 1]) for (const st of splitTop(stripC(E[n][j]))) { const s = nrm(st); const have = (D[n] && D[n][j].some((x) => nrm(x) === s)) || add[tag].some((a) => a[0] === n && a[1] === j && nrm(a[2]) === s); if (have) continue;
          // perf_debug6 (?oldxdedup = old): the same statement already declared by another member in a different global hook of
          // this stage was emitted twice (GLSL 'redefinition' -> invalid program). Earlier (or same) position: reuse it; later
          // position: move it up here (dropped from the later hook, added in this one).
          if (!OLDX && xdup(tag === 'VD' ? VN : FN, D, add[tag], n, j, s)) continue;
          for (const nm of declNames(st)) { const o = B.names.get(nm) || nn.get(nm); if (o !== undefined && o !== s && !(nm.startsWith('f:') && false)) throw new Error('conflict ' + nm); nn.set(nm, s); }
          if (/^uniform\s/.test(s) && /\bsampler\w*\b/.test(s)) samp += declNames(st).length;
          if (/^attribute\s/.test(s)) attr += declNames(st).length;
          if (tag === 'VD' && /^(flat\s+)?varying\s/.test(s)) { const m = /varying\s+(?:\w+\s+)?(float|vec2|vec3|vec4|mat3|mat4|int|ivec2)\s/.exec(s); vary += (m ? VSZ[m[1]] : 1) * declNames(st).length; }
          add[tag].push([n, j, st]); } }
      if (B.samp + samp > CAPS.tex - 9 || B.attr + attr > CAPS.attr - 9 || Math.ceil(B.vary + vary) > CAPS.vary - 13) throw new Error('limits');
      // bodies: hoist a member's top-level locals that another of its blocks uses (renamed _u<idx>), then wrap in its branch
      const st2 = []; for (const [E, stage] of [[ev, 'v'], [ef, 'f']]) { const units = []; for (const n in E) { if (isDecl(n)) continue; const e = E[n];
          if (e.rep !== undefined) units.push({ n, j: 'r', c: stripC(e.rep) }); else for (const j of [0, 1]) if (e[j].trim()) units.push({ n, j, c: stripC(e[j]) }); }
        const glob = [], ren = [];
        for (const u of units) for (const st of splitTop(u.c)) { const m = DTYPE.exec(st); const cst = /^const\s/.test(st);
          const ds = m ? splitComma(m[2]).map((d) => { const q = /^(\w+)\s*(\[[^\]]*\])?\s*(?:=\s*([\s\S]*))?$/.exec(d); return q ? { name: q[1], arr: q[2], init: q[3] } : null; }) : null;
          const names = ds ? ds.filter(Boolean).map((d) => d.name) : cst ? declNames(st) : [];
          const used = names.some((nm) => units.some((o) => o !== u && new RegExp('\\b' + nm + '\\b').test(o.c))); if (!used) continue;
          if (!ds || ds.some((d) => !d || d.arr)) throw new Error('hoist ' + names.join(','));
          const sfx = '_u' + idx; glob.push(m[1] + ' ' + ds.map((d) => d.name + sfx).join(', ') + ';');
          const k = u.c.indexOf(st); if (k < 0) throw new Error('hoist stmt');
          u.c = u.c.slice(0, k) + ds.filter((d) => d.init !== undefined).map((d) => d.name + ' = ' + d.init + ';').join(' ') + u.c.slice(k + st.length);
          ren.push(...ds.map((d) => d.name)); }
        // renames last: renaming while statements are still being matched broke later declarations that mention an earlier name
        for (const nm of ren) for (const o of units) o.c = o.c.replace(new RegExp('\\b' + nm + '\\b', 'g'), nm + '_u' + idx);
        st2.push({ stage, units, glob }); }
      // commit
      B.sigs.push(sig); B.idx.set(fam, idx); Object.assign(B.U0, t.uniforms); B.samp += samp; B.attr += attr; B.vary += vary; for (const [k, v] of nn) B.names.set(k, v);
      for (const tag of ['VD', 'FD']) for (const [n, j, st] of add[tag]) { const D = B[tag][n] || (B[tag][n] = [[], []]); D[j].push(st); }
      for (const { stage, units, glob } of st2) { const H = stage === 'v' ? B.V : B.F, R = stage === 'v' ? B.VR : B.FR; const g = stage === 'v' ? gv : gf; if (glob.length) B.glob[stage].push(gwrap(g, glob.join('\n')));
        for (const u of units) { if (u.j === 'r') { const dv = REP_DECL[u.n]; let c = u.c; if (dv) { if (!c.includes(dv)) throw new Error('rep ' + u.n); c = c.split(dv).join(dv.split(' ')[1]); } (R[u.n] || (R[u.n] = [])).push(gwrap(g, `if ( uPK == ${idx}.0 ) {\n${c}\n} else`)); continue; }
          const cur = H[u.n] || (H[u.n] = ['', '']); cur[u.j] += gwrap(g, `if ( uPK == ${idx}.0 ) {\n${u.c}\n}`); } }
    } catch (e) { B.bad[fam] = e.message; console.warn('[envprog2] ' + fam + ' keeps its own program:', e.message); }
  }
  const mk = (H, R, D, gl) => { const E = {}; const keys = new Set([...Object.keys(H), ...Object.keys(R)]);
    for (const n of keys) { const h = H[n] || ['', '']; if (R[n]) { const dv = REP_DECL[n]; E[n] = { rep: h[0] + (dv ? '\n' + dv + ';' : '') + R[n].join('') + `\n{\n${dv ? THREE.ShaderChunk[n].split(dv).join(dv.split(' ')[1]) : `#include <${n}>`}\n}` + h[1] }; } else E[n] = [h[0] ? h[0] + '\n' : '', h[1]]; }
    for (const n in D) { if (E[n]) throw new Error('hook clash ' + n); E[n] = [D[n][0].length ? D[n][0].join('\n') + '\n' : '', D[n][1].length ? '\n' + D[n][1].join('\n') : '']; }
    const c = E.common || ['', '']; E.common = [c[0], '\nuniform float uPK;' + gl.join('') + c[1]]; return E; };
  try { B.ev = mk(B.V, B.VR, B.VD, B.glob.v); B.ef = mk(B.F, B.FR, B.FD, B.glob.f); B.ok = true; } catch (e) { console.warn('[envprog2] no merge:', e.message); B.ok = false; }
  (envStats.uber || (envStats.uber = {}))[cls] = { members: [...B.idx.keys()].join(' '), branches: B.sigs.length, bad: B.bad, samp: B.samp, attr: B.attr, vary: B.vary };
  return (UBS[cls] = B);
}
function clsOf(m) { if ((m.polygonOffset && DBG.includes('noo')) || (!m.polygonOffset && DBG.includes('nou'))) return null; if (m.transparent || m.depthWrite === false || m.depthTest === false || m.depthFunc !== THREE.LessEqualDepth || m.colorWrite === false) return null; return m.polygonOffset ? 'o' : 'u'; }
function inUber(m, fam) { if (!m.userData.envOn || m.userData.envBad || (DBG && DBG.includes('nx_' + fam + ','))) return null; const c = clsOf(m); if (!c) return null; const B = buildUber(c); return B.ok && B.idx.has(fam) ? B : null; }
export function envClsNote(m) { const c = clsOf(m); if (c) CLS[m.userData.envFam] |= c === 'u' ? 1 : 2; } // normalise(): which classes a family is used in
// prep() hook: patch (or null for an unpatched material) -> patch that compiles to the merged program when the material qualifies
export function envUberWrap(fn, key) {
  const fam = envFamily(key, !!fn); if (OLDENV2 || !UBF[fam] || key === 'npc' || key === 'ch') return fn;
  const f0 = fn || (() => {}); if (!REPF.has(fam)) REPF.set(fam, f0); // a family first seen after a build keeps its own program (not in B.idx)
  const w = (s, m) => { const UB = m && inUber(m, fam); if (!UB) return f0(s); const t = { uniforms: {}, vertexShader: '', fragmentShader: '' }; f0(t);
    for (const k in UB.U0) if (!(k in s.uniforms)) s.uniforms[k] = UB.U0[k]; // other members' uniforms only fill gaps (never a built-in or this material's own)
    Object.assign(s.uniforms, t.uniforms, { uPK: { value: UB.idx.get(fam) } }); const d = s.instancing ? '#define EU_INST\n' : ''; // three defines USE_INSTANCING in the vertex stage only
    s.vertexShader = d + applyEdits2(s.vertexShader, UB.ev); s.fragmentShader = d + applyEdits2(s.fragmentShader, UB.ef); };
  w.envKey = (m) => (inUber(m, fam) ? 'env' + clsOf(m) + '|e' : fam + '|e'); w.envFam = fam; return w;
}
// main-pass check before three picks the program: a member drawn in a variant its family's code was trimmed out of -> own program
// b_envprog2 shadow depth: three's depth material for a normalised source comes with or without alphaTest (and a clone per
// alpha-tested source) -> 2 programs per instancing kind. Normalised sources get their own depth material (one per source, so its
// map / alphaTest never change) that always has the alpha test, with ENV_AT's rule (no discard at alphaTest <= 0.0015): one program
// per instancing kind, same depth values as before. Non-environment mesh sources get the same treatment (white placeholder map,
// double-sided program + their own culling restored in setMaterial).
const DEPTHM = new WeakMap();
function envDepth(object, group, dm) {
  const src = Array.isArray(object.material) ? (group ? object.material[group.materialIndex] : null) : object.material; if (!src) return dm;
  // other mesh sources (vehicles, GLB props, basic materials) too: placeholder map, double-sided program with their culling restored
  const env = !!src.userData.envOn; if (!env && (DBG.includes('nodepth2') || src.isShaderMaterial || !object.isMesh || object.isSkinnedMesh)) return dm;
  let d = DEPTHM.get(src);
  if (!d) { d = new THREE.MeshDepthMaterial({ depthPacking: dm.depthPacking }); d.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <alphatest_fragment>', ENV_AT); };
    d.customProgramCacheKey = () => 'envd'; DEPTHM.set(src, d); }
  // what three's getDepthMaterial copied from the source for this draw
  d.visible = dm.visible; d.wireframe = dm.wireframe; d.alphaMap = dm.alphaMap; d.alphaTest = Math.max(dm.alphaTest, 0.001); d.map = dm.map || ph().white;
  d.side = THREE.DoubleSide; if (!env && dm.side !== THREE.DoubleSide) d.userData.envCull = dm.side; else delete d.userData.envCull; // env sources: envDCull via CUR
  d.clipShadows = dm.clipShadows; d.clippingPlanes = dm.clippingPlanes; d.clipIntersection = dm.clipIntersection; d.displacementMap = dm.displacementMap;
  d.displacementScale = dm.displacementScale; d.displacementBias = dm.displacementBias; d.wireframeLinewidth = dm.wireframeLinewidth; d.linewidth = dm.linewidth; d.depthPacking = dm.depthPacking;
  return d;
}
function kindCheck(object, m) {
  let k = UBF[m.userData.envFam]; if (k && AUTOI.has(m.userData.envFam)) k = 'i' + k[1]; if (!k || m.userData.envBad || !m.userData.envOn || m.isMeshDepthMaterial) return;
  const inst = !!object.isInstancedMesh, at = m.alphaTest > 0;
  if ((k[0] === 'i' && !inst) || (k[0] === 'm' && inst) || (k[1] === 'a' && !at) || (k[1] === 'n' && at)) { m.userData.envBad = 1; m.needsUpdate = true; envStats.kindBad = (envStats.kindBad || 0) + 1; console.warn('[envprog2] ' + m.userData.envFam + ' drawn as ' + (inst ? 'instanced' : 'mesh') + ': own program'); }
}
export function envCaps(r) { const c = r.capabilities; CAPS.tex = Math.min(c.maxTextures, 32); CAPS.attr = c.maxAttributes; CAPS.vary = c.maxVaryings; }
