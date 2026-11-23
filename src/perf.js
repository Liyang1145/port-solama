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
export const OLD = { shadow: Q.has('oldshadow'), gbuf: Q.has('oldgbuf'), probe: Q.has('oldprobe'), res: Q.has('oldres'), sharp: Q.has('oldsharp'), step: Q.has('oldstep'), mirror: Q.has('oldmirror'), mirrorOrder: Q.has('oldmwu'), anim: Q.has('oldanim') };
// ?oldmirror: characters (skinned, the costliest meshes) were drawn into the water mirror and both reflection probes too;
// now they live on CHAR_LAYER only, which the main camera and the shadow cameras see
export const CHAR_LAYER = 3;

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
