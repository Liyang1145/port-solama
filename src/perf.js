// perf_debug1: frame-cost / clarity fixes, each with an off switch (?old<name>) for A/B:
//   ?oldshadow  shadow maps were re-rendered inside EVERY renderer.render() of a frame (water mirror, main pass, GTAO normal
//               pass, 6 cube faces of each probe) -> now exactly once per frame (first scene render after the frustum fit)
//   ?oldgbuf    GTAO drew the whole city a second time for a normal/depth G-buffer -> now it reads the main pass depth
//               (normals reconstructed from depth, also for contact shadows / god rays / motion blur / DOF)
//   ?oldprobe   street / city reflection probes rendered 6 cube faces + PMREM in one frame (a 0.5–3 s hitch in SwiftShader,
//               a visible stutter on GPUs, every 2 s / 25 m while driving) -> one face per frame, then PMREM next frame
//   ?oldres     the post chain ran at CSS pixels (pixel ratio 1) and was stretched onto the 1.5x canvas on HiDPI screens
//               (blurry) -> post chain at the canvas' real pixel ratio + dynamic resolution (?nodrs) keeps the frame rate
//   ?oldsharp   CAS-style sharpening after FXAA, less chromatic aberration / grain, gentler speed motion blur
//   ?oldanim    every pedestrian within 50 m sampled its AnimationMixer every frame (~5 ms/frame with 86 peds)
//               -> 20-50 m: every 2nd frame (staggered by id), 50 m+: 6 Hz
//   ?oldstep    one variable game step per rAF clamped to 1/20 s (slow motion under 20 fps, big physics steps)
//               -> fixed 1/60 s sub-steps (at most 4 per frame) with the rest carried to the next frame
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const OLD = { shadow: Q.has('oldshadow'), gbuf: Q.has('oldgbuf'), probe: Q.has('oldprobe'), res: Q.has('oldres'), sharp: Q.has('oldsharp'), step: Q.has('oldstep'), mirror: Q.has('oldmirror'), mirrorOrder: Q.has('oldmwu'), anim: Q.has('oldanim'), sprobe: Q.has('oldsprobe'), sprobeLod: Q.has('oldsprobelod'), tpwarm: Q.has('oldtpwarm'), tpstagger: Q.has('oldtpstagger'), tpwarmRt: Q.has('oldtpwarmrt') };
// ?oldmirror: characters (skinned, the costliest meshes) were drawn into the water mirror and both reflection probes too;
// now they live on CHAR_LAYER only, which the main camera and the shadow cameras see
export const CHAR_LAYER = 3;

// perf_debug4: hide meshes a low-res capture can't resolve (same idea as the water mirror cull). Returns the hidden list; the
// caller restores visible = true. Kept: sky / frustumCulled = false planes, skinned meshes. Hidden: farther than D (bounding-sphere
// surface), subtending < K rad, or low flat stuff (top below flatY) farther than flatNear; with instR, any InstancedMesh whose
// single instance is smaller than instR m (its whole-set sphere spans the city, so the distance test can't cull it).
const _bs = new THREE.Sphere(), _cp = new THREE.Vector3();
export function cullSmall(scene, camPos, o_, hid) { const { D, K, flatY, flatNear } = o_; _cp.copy(camPos);
  scene.traverseVisible((o) => { if (!o.isMesh || o.isSkinnedMesh) return;
    if (o_.instR && o.isInstancedMesh && o.geometry) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); // city-wide instanced props: a whole-set sphere never culls,
      if (g.boundingSphere.radius < o_.instR) { o.visible = false; hid.push(o); return; } } // so drop small-instance sets (street furniture, plants, kerb clutter) outright
    if (o.frustumCulled === false) return;
    let bs; if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); bs = o.boundingSphere; } else { const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere(); bs = g.boundingSphere; }
    if (!bs || !Number.isFinite(bs.radius)) return; _bs.copy(bs).applyMatrix4(o.matrixWorld); const d = _bs.center.distanceTo(_cp) - _bs.radius;
    if (d > D || _bs.radius < d * K || (d > flatNear && _bs.center.y + _bs.radius < flatY)) { o.visible = false; hid.push(o); } });
  return hid; }

// perf_debug5 (?oldsprobelod = old): the street probe drew the DETAILED mesh of every loaded region chunk (within 300 m);
// beyond lodD from the probe a chunk now shows its far LOD volume (plain building shells) for the face instead. Returns the
// far meshes it made visible (hide them again after the face); detailed meshes go into hid (made visible again by the caller).
export function probeLod(region, camPos, lodD, hid, shown) { if (!region || !region.chunks) return;
  for (const c of region.chunks.values()) { if (!c.det || !c.far.length) continue; if (Math.hypot(camPos.x - c.x, camPos.z - c.z) - c.r < lodD) continue;
    for (const m of c.det) if (m.visible) { m.visible = false; hid.push(m); } for (const m of c.far) if (!m.visible) { m.visible = true; shown.push(m); } } }

// ---- amortized cube capture: start(pos) then step() once per frame; returns true on the frame the cube is complete
export function cubeStepper(renderer, scene, cubeCam) {
  const S = { face: -1, busy: false };
  S.start = () => { S.face = 0; S.busy = true; cubeCam.updateMatrixWorld(); if (cubeCam.coordinateSystem !== renderer.coordinateSystem) { cubeCam.coordinateSystem = renderer.coordinateSystem; cubeCam.updateCoordinateSystem(); } };
  S.step = (before, after) => { if (!S.busy) return false; const rt = cubeCam.renderTarget; const cams = cubeCam.children;
    const cur = renderer.getRenderTarget(), cf = renderer.getActiveCubeFace(), cm = renderer.getActiveMipmapLevel(); const xr = renderer.xr.enabled; renderer.xr.enabled = false;
    const auto = rt.texture.mipmapsAutoUpdate; if (S.face < 5) rt.texture.mipmapsAutoUpdate = false;
    if (before) before(); renderer.setRenderTarget(rt, S.face, 0); renderer.render(scene, cams[S.face]); if (after) after();
    rt.texture.mipmapsAutoUpdate = auto; renderer.setRenderTarget(cur, cf, cm); renderer.xr.enabled = xr;
    S.face++; if (S.face > 5) { S.busy = false; rt.texture.needsPMREMUpdate = true; return true; } return false; };
  return S;
}

// ---- scene pass that keeps its own depth texture (the G-buffer depth for GTAO / contact shadows / lens), copied into the chain
export class DepthScenePass extends Pass {
  constructor(scene, camera, w, h) {
    super(); this.scene = scene; this.camera = camera; this.needsSwap = true;
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType; dt.minFilter = dt.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: dt });
    this.depthTexture = dt;
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { t: { value: this.rt.texture } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }' }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt); if (renderer.autoClear) renderer.clear(); renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.copy.render(renderer);
  }
  dispose() { this.rt.dispose(); this.copy.dispose(); }
}

// ---- contrast-adaptive sharpening (display space, after FXAA)
export const SharpenShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1280, 720) }, uAmt: { value: 0.6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uAmt; varying vec2 vUv;
  void main(){ vec2 px = 1.0 / uRes; vec3 c = texture2D(tDiffuse, vUv).rgb;
    vec3 a = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb, b = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb, d = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
    vec3 mn = min(min(min(a, b), min(d, e)), c), mx = max(max(max(a, b), max(d, e)), c);
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
    vec3 w = -amp * mix(0.08, 0.2, uAmt);
    gl_FragColor = vec4(clamp((c + (a + b + d + e) * w) / (1.0 + 4.0 * w), 0.0, 1.0), 1.0); }`,
};

// ---- dynamic resolution: keeps the smoothed rAF frame time between 15 and 25 ms by scaling the post chain (0.6–1.0)
export function makeDRS(apply) {
  const D = { scale: 1, avg: 16.7, t: 0, cool: 0, on: !Q.has('nodrs') && !OLD.res, log: [] };
  D.tick = (ms) => { if (!D.on) return; D.avg += (Math.min(ms, 100) - D.avg) * 0.05; D.t += ms; D.cool -= ms; if (D.cool > 0 || D.t < 500) return; D.t = 0;
    let s = D.scale; if (D.avg > 25 && s > 0.6) s = Math.max(0.6, s - 0.1); else if (D.avg < 15 && s < 1) s = Math.min(1, s + 0.1); else return;
    D.scale = +s.toFixed(2); D.cool = 2000; D.log.push([Math.round(performance.now()), D.scale, +D.avg.toFixed(1)]); if (D.log.length > 50) D.log.shift(); apply(D.scale); };
  return D;
}

// perf_debug3 (?keepgeo = old): the CPU copies of static vertex attributes stayed in the JS heap after the GPU upload
// (~305 MB of attribute arrays at the gta spawn). Map A only: normal / uv / uv1 / uv2 / color arrays of static, non-skinned,
// non-instanced meshes are released once uploaded (attribute.onUpload). position / index and every custom attribute (aK fades,
// landmark position edits) stay, so bounding volumes, collision builders and the code that rewrites attributes are unaffected.
const DROP = new Set(['normal', 'uv', 'uv1', 'uv2', 'color']); let dropped = 0; const reg = new WeakSet();
// fix_pt7 #2 (?oldfree = old): the released array was only dropped, so its memory came back at the next GC - and the first frame's
// long GPU sync (SwiftShader: ~2 min with the main thread blocked in finish / readPixels) runs with no GC at all: ~170 MB of released
// arrays sat in RSS through the first-frame peak (JS backing store 523 MB at ready vs 352 MB after). An array that is the sole full
// view of its ArrayBuffer is now detached with transfer(0), which frees the backing store at once (GLB slices / shared buffers keep
// the old path).
const FREENOW = !Q.has('oldfree') && typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.prototype.transfer === 'function'; let freedNow = 0;
function freeArr() { const a = this.array; dropped += a.byteLength; this.array = new a.constructor(0);
  if (FREENOW && a.byteOffset === 0 && a.buffer && !a.buffer.detached && a.byteLength === a.buffer.byteLength && !(a.buffer instanceof (globalThis.SharedArrayBuffer || function () {}))) { try { freedNow += a.byteLength; a.buffer.transfer(0); } catch (e) { } } }
export const freedNowMB = () => +(freedNow / 1048576).toFixed(1);
// fix_pt6 #1 (?oldrelease = old): onUpload only fires on an upload that happens AFTER it is registered. The load-time precompile pass
// (and a streamed chunk drawn before the next 60-frame sweep) uploads first, so those arrays were never freed (A spawn: ~110 MB of
// normal / uv / color arrays still on the CPU at ready). Every attribute now marks itself when uploaded (prototype default callback);
// one already on the GPU is freed at once.
const UPL = new WeakSet(); const OLDREL = Q.has('oldrelease');
// fix_pt6 #1 (?keeppos = old): position + index of the same static meshes go too (bounding volumes are computed first; draw counts stay
// on the attribute; nothing reads a static mesh's vertices after load - the dynamic ones are DynamicDrawUsage and skipped)
const KEEPPOS = OLDREL || Q.has('keeppos');
if (!OLDREL) THREE.BufferAttribute.prototype.onUploadCallback = function () { UPL.add(this); };
export function releaseCpuAttrs(scene) {
  if (Q.has('keepgeo')) return 0; let n = 0;
  scene.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.morphTargetInfluences) return; const g = o.geometry; if (!g || reg.has(g)) return; reg.add(g);
    if (Object.keys(g.morphAttributes).length) return; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox();
    const ix = g.index; if (KEEPPOS === false && ix && ix.usage === THREE.StaticDrawUsage && ix.array && ix.array.length >= 3000) { if (UPL.has(ix)) freeArr.call(ix); else ix.onUpload(freeArr); n++; }
    for (const k in g.attributes) { const a = g.attributes[k]; if (!(DROP.has(k) || (KEEPPOS === false && k === 'position')) || a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || a.usage !== THREE.StaticDrawUsage || !a.array || a.array.length < 3000) continue; if (!OLDREL && UPL.has(a)) freeArr.call(a); else a.onUpload(freeArr); n++; } });
  return n;
}
export const releasedMB = () => +(dropped / 1048576).toFixed(1);
// fix_pt7 #2 (?oldcanvas = old): procedural CanvasTextures (shop-sign / signage / road-text atlases: three 2048² + two 2048x1024 +
// smaller, ~100 MB on the GPU at the A spawn) kept their source canvas after the upload: the same pixels a second time in the
// renderer process. Map A: once every texture drawn from a canvas is on the GPU (and was uploaded once), the canvas is shrunk to
// 1x1 (frees its backing store). Skipped: textures marked userData.canvas (veg redraws), re-uploaded ones (version > 1).
const CVDONE = new WeakSet(); let cvFreed = 0;
// pre = true (warm-up, before the first frame): upload those textures now and let the GL queue run (finish) once the canvases are
// shrunk, so the canvas memory is gone before the GPU thread starts the long first frame (frees queue behind it otherwise)
export function releaseCanvases(scene, renderer, pre = false) {
  if (Q.has('oldcanvas')) return 0; const props = renderer.properties; const by = new Map(); const mats = new Set();
  const see = (t) => { if (!t || !t.isTexture || !t.isCanvasTexture) return; const c = t.image; if (!c || CVDONE.has(c) || !(c.width > 1)) return; let e = by.get(c); if (!e) by.set(c, e = new Set()); e.add(t); };
  scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { if (mats.has(m)) continue; mats.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture) see(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) see(v); } } });
  if (pre) for (const ts of by.values()) for (const t of ts) if (!t.userData.canvas && t.version === 1) try { renderer.initTexture(t); } catch (e) { }
  let n = 0; for (const [c, ts] of by) { let ok = true; for (const t of ts) { const p = props.get(t); if (t.userData.canvas || t.version !== 1 || p.__version !== t.version || !p.__webglTexture) { ok = false; break; } } if (!ok) continue;
    cvFreed += c.width * c.height * 4; try { c.width = 1; c.height = 1; } catch (e) { continue; } CVDONE.add(c); n++; }
  if (pre && n) renderer.getContext().finish();
  return n;
}
export const canvasFreedMB = () => +(cvFreed / 1048576).toFixed(1);
