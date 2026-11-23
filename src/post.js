// v4.0 cinematic post chain (HDR until the output pass):
//   scene (HDR) -> GTAO (+ depth/normal G-buffer) -> LightFX (screen-space contact shadows toward the sun, depth-occluded
//   god rays) -> bloom -> Lens (camera motion blur when driving, depth of field in photo mode) -> ACES/AgX tonemap ->
//   Grade (procedural 3-D film LUT: golden-hour warm-orange highlights / teal shadows, night cyan-magenta; vignette,
//   chromatic aberration, film grain) -> FXAA
import * as THREE from 'three';
import { CYBER } from './mapsel.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const DEPTH_FN = `
uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uProj; uniform float uNear, uFar;
float rawD(vec2 uv){ return texture2D(tDepth, uv).x; }
vec3 viewPos(vec2 uv, float d){ vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float viewZ(vec2 uv){ float d = rawD(uv); return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// ---------------------------------------------------------------- contact shadows + god rays (HDR, linear) ----
const LightFXShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, tNormal: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
    uNear: { value: 0.1 }, uFar: { value: 4000 }, uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
    uSunOn: { value: 0 }, uRayCol: { value: new THREE.Color(1, 0.7, 0.4) }, uContact: { value: 1 }, uRes: { value: new THREE.Vector2(1280, 720) },
    tShadow: { value: null }, uShMat: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uSunW: { value: new THREE.Vector3(0, 1, 0) }, uShaft: { value: new THREE.Vector4() },
  },
  vertexShader: VS,
  fragmentShader: `precision highp sampler2DShadow; varying vec2 vUv; uniform sampler2D tDiffuse, tNormal; uniform vec3 uSunV; uniform vec2 uSunUV; uniform float uSunOn, uContact; uniform vec3 uRayCol; uniform vec2 uRes;
  uniform sampler2DShadow tShadow; uniform mat4 uShMat, uCamWorld; uniform vec3 uSunW; uniform vec4 uShaft;
  ${DEPTH_FN}
  void main(){
    vec4 base = texture2D(tDiffuse, vUv); vec3 col = base.rgb;
    // v4.3 NaN/Inf guard: one bad pixel must never spread through bloom into a black frame
    col = (col.r >= 0.0 && col.g >= 0.0 && col.b >= 0.0 && col.r < 60000.0 && col.g < 60000.0 && col.b < 60000.0) ? col : vec3(0.0);
    // r6.1 highlight clamp before bloom: sun glints on chrome / headlight lenses / glass reached 1000s and bloomed into
    // 200 px white blobs over backlit dunes and streets; any channel above 24 (HDR, pre-exposure) is scaled down
    { float mx = max(col.r, max(col.g, col.b)); col *= min(1.0, 24.0 / max(mx, 1e-4)); }
    float d = rawD(vUv);
    // --- screen-space contact shadows: short ray march toward the sun; catches the fine occlusion the shadow map misses
    if (uContact > 0.0 && d < 0.99999) {
      vec3 vp = viewPos(vUv, d); float dist = -vp.z;
      vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
      float ndl = dot(n, uSunV);
      if (dist < 60.0 && ndl > 0.05) {
        float len = mix(0.35, 1.4, clamp(dist / 60.0, 0.0, 1.0)); float j = ign(gl_FragCoord.xy);
        float occ = 0.0;
        for (int i = 1; i <= 10; i++) {
          vec3 p = vp + uSunV * len * (float(i) - j) / 10.0 + n * 0.02 * dist / 10.0;
          vec4 c = uProj * vec4(p, 1.0); vec2 uv = c.xy / c.w * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          float sz = viewZ(uv); float dz = sz - p.z;              // >0: the depth buffer is in front of the ray point
          float thick = 0.25 + dist * 0.01;
          if (dz > 0.02 + dist * 0.0006 && dz < thick) { occ = 1.0 - float(i - 1) / 12.0; break; }
        }
        float fade = (1.0 - smoothstep(30.0, 60.0, dist));
        col *= 1.0 - occ * fade * uContact * 0.55 * smoothstep(0.05, 0.4, ndl);
      }
    }
    // --- god rays: radial march toward the sun through a sky-only mask (the depth buffer occludes: palms, towers, lamp posts)
    if (uSunOn > 0.001) {
      vec2 dl = (vUv - uSunUV); float j = ign(gl_FragCoord.xy + 17.0);
      vec2 stepv = dl / 36.0; vec2 uv = vUv - stepv * j; float acc = 0.0; float w = 1.0;
      for (int i = 0; i < 36; i++) {
        uv -= stepv;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { w *= 0.9; continue; }
        float sky = step(0.99999, rawD(uv));
        vec3 c = texture2D(tDiffuse, uv).rgb; float l = min(dot(c, vec3(0.3, 0.5, 0.2)), 8.0);
        acc += sky * l * w; w *= 0.955;
      }
      acc /= 36.0;
      float fall = (1.0 - smoothstep(0.0, 1.0, length(dl * vec2(uRes.x / uRes.y, 1.0)) * 0.9));
      col += uRayCol * acc * fall * uSunOn;
    }
    // --- light2 volumetric sun shafts: 12 jittered taps of the FAR shadow cascade along the view ray (<= 260 m) integrate
    // in-scattered sun light through a low ground haze (scale height 45 m) with a forward Henyey-Greenstein phase -> at golden
    // hour the air between buildings glows where the sun gets through and stays clear in a block's shadow (shafts down streets,
    // past palm crowns). One screen pass instead of a loop in every material shader.
    if (uShaft.w > 0.001) {
      vec3 vpS = viewPos(vUv, min(d, 0.999999)); vec3 ro = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vec3 wpS = (uCamWorld * vec4(vpS, 1.0)).xyz;
      vec3 rd = wpS - ro; float L = min(length(rd), 260.0); rd = normalize(rd);
      float j = ign(gl_FragCoord.xy + 31.0); float ds = L / 12.0; float acc = 0.0;
      for (int i = 0; i < 12; i++) {
        vec3 p = ro + rd * ((float(i) + j) * ds);
        vec4 sc = uShMat * vec4(p, 1.0); sc.xyz /= sc.w;
        float v = (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) ? texture(tShadow, vec3(sc.xy, sc.z - 0.0004)) : 1.0;
        acc += v * exp(-max(p.y, 0.0) / 45.0);
      }
      float cs = dot(rd, uSunW); float g = 0.62; float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cs, 1.5) * 0.25 + 0.12;
      col += uShaft.rgb * (acc * ds * 0.0012 * hg * uShaft.w);
    }
    gl_FragColor = vec4(col, base.a);
  }`,
};

// ---------------------------------------------------------------- motion blur + depth of field (HDR) ----
const LensShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uNear: { value: 0.1 }, uFar: { value: 4000 },
    uCamWorld: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uBlur: { value: 0 }, uDof: { value: 0 }, uFocus: { value: 6 }, uAperture: { value: 1 },
    uRes: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform mat4 uCamWorld, uPrevVP; uniform float uBlur, uDof, uFocus, uAperture; uniform vec2 uRes;
  ${DEPTH_FN}
  void main(){
    vec4 base = texture2D(tDiffuse, vUv); vec3 col = base.rgb; float d = rawD(vUv);
    vec3 vp = viewPos(vUv, min(d, 0.999999)); float dist = length(vp);
    if (uBlur > 0.001) {
      // camera-motion blur by reprojection; the player's own car / body (closest metres) stays sharp like a chase cam
      vec4 wp = uCamWorld * vec4(vp, 1.0); vec4 pc = uPrevVP * wp; vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
      vec2 vel = (vUv - puv) * uBlur; float vl = length(vel * uRes);
      vel *= min(1.0, 40.0 / max(vl, 1e-3));
      vel *= smoothstep(6.0, 12.0, dist);
      if (length(vel * uRes) > 0.8) {
        vec3 acc = col; float j = ign(gl_FragCoord.xy);
        for (int i = 1; i < 9; i++) { float t = (float(i) + j - 0.5) / 8.0 - 0.5; acc += texture2D(tDiffuse, clamp(vUv + vel * t, 0.001, 0.999)).rgb; }
        col = acc / 9.0;
      }
    }
    if (uDof > 0.001) {
      float coc = clamp(abs(dist - uFocus) / max(dist, 0.1) * uAperture * 14.0, 0.0, 9.0) * uDof;
      if (coc > 0.5) {
        vec3 acc = col; float wsum = 1.0; float j = ign(gl_FragCoord.xy) * 6.283;
        for (int i = 0; i < 20; i++) {
          float r = sqrt((float(i) + 0.5) / 20.0) * coc; float a = float(i) * 2.39996 + j;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
          float sd = length(viewPos(uv, min(rawD(uv), 0.999999)));
          float sc = clamp(abs(sd - uFocus) / max(sd, 0.1) * uAperture * 14.0, 0.0, 9.0);
          float w = sd < dist ? smoothstep(r - 1.0, r + 1.0, sc + 1.0) : 1.0; // foreground blur bleeds, background does not over sharp edges
          vec3 c = texture2D(tDiffuse, uv).rgb; w *= 1.0 + dot(c, vec3(0.3)) * 0.6; // cheap bokeh highlight weighting
          acc += c * w; wsum += w;
        }
        col = acc / wsum;
      }
    }
    gl_FragColor = vec4(col, base.a);
  }`,
};

// ---------------------------------------------------------------- display-referred grade with a 3-D LUT ----
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, tLutDay: { value: null }, tLutNight: { value: null }, uTime: { value: 0 }, uGold: { value: 0 }, uNight: { value: 0 },
    uRes: { value: new THREE.Vector2(1280, 720) }, uLutAmt: { value: 1 } },
  vertexShader: VS,
  fragmentShader: `precision highp sampler3D; uniform sampler2D tDiffuse; uniform sampler3D tLutDay, tLutNight; uniform float uTime, uGold, uNight, uLutAmt; uniform vec2 uRes; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  vec3 lut(sampler3D t, vec3 c){ const float N = 32.0; vec3 uvw = clamp(c, 0.0, 1.0) * ((N - 1.0) / N) + 0.5 / N; return texture(t, uvw).rgb; }
  void main(){
    vec2 uv = vUv; vec2 c = uv - 0.5;
    float ca = dot(c, c) * 0.0055;      // lateral chromatic aberration toward the frame edge
    vec3 col = vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
    vec3 dayC = lut(tLutDay, col), nightC = lut(tLutNight, col);
    vec3 g = mix(mix(col, dayC, 0.55 + 0.45 * uGold), nightC, uNight);
    col = mix(col, g, uLutAmt);
    float v = (1.0 - smoothstep(0.28, 1.0, length(c * vec2(1.0, 0.92))));
    col *= mix(0.80, 1.0, v);
    float gr = h(uv * uRes + fract(uTime * 7.13) * 91.0) - 0.5;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col += gr * mix(0.018, 0.034, uNight) * (1.0 - lum * 0.6); // grain, stronger in the darks and at night (film stock look)
    gl_FragColor = vec4(col, 1.0);
  }`,
};

// procedural film LUTs (display space). day: gentle S-curve, warm-orange highlights + teal shadows, skin/sunset hues richer,
// foliage slightly olive, sky toward cyan-cobalt; night: blue-teal shadows, magenta-leaning mids, saturated practicals.
function makeLUT(kind) {
  const N = 32; const data = new Uint8Array(N * N * N * 4);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    let R = r / (N - 1), G = g / (N - 1), B = b / (N - 1);
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B); const sat = mx - mn;
    let hh = 0; if (sat > 1e-4) { if (mx === R) hh = ((G - B) / sat + 6) % 6; else if (mx === G) hh = (B - R) / sat + 2; else hh = (R - G) / sat + 4; } hh *= 60;
    if (kind === 'day') {
      const sh = 1 - sm(0.0, 0.42, l), hi = sm(0.45, 1.0, l);
      R += -0.036 * sh + 0.055 * hi; G += 0.012 * sh + 0.018 * hi; B += 0.050 * sh - 0.050 * hi; // v4.4 slightly stronger teal shadows / warm highlights
      // hue-selective: oranges/skin richer, greens olive + calmer, blues to cyan-cobalt
      const orange = Math.max(0, 1 - Math.abs(hh - 30) / 30) * sat, green = Math.max(0, 1 - Math.abs(hh - 110) / 45) * sat, blue = Math.max(0, 1 - Math.abs(hh - 210) / 40) * sat;
      R += orange * 0.06; B -= orange * 0.04;
      R += green * 0.03; G -= green * 0.03; B -= green * 0.02;
      G += blue * 0.03; R -= blue * 0.02;
      // filmic S around 0.45 + soft shoulder
      const s = (x) => { x = Math.min(1, Math.max(0, x)); const y = x < 0.45 ? 0.45 * Math.pow(x / 0.45, 1.12) : 1 - 0.55 * Math.pow((1 - x) / 0.55, 1.18); return 0.007 + y * 0.98; }; // v4.4 deeper black point (shadows were milky)
      R = s(R); G = s(G); B = s(B);
      const l2 = 0.2126 * R + 0.7152 * G + 0.0722 * B; const k = 1.08; R = l2 + (R - l2) * k; G = l2 + (G - l2) * k; B = l2 + (B - l2) * k;
    } else {
      if (CYBER) { // r6.0 map 霓港 (v4.5 cyberpunk night): teal-cyan shadows, magenta mids, pink-violet highlights, neon hues pushed
        const sh = 1 - sm(0.0, 0.35, l), hi = sm(0.5, 1.0, l), mid = Math.max(0, 1 - Math.abs(l - 0.35) / 0.35);
        R += -0.025 * sh + 0.035 * hi + 0.035 * mid; G += 0.022 * sh + 0.0 * hi - 0.025 * mid; B += 0.065 * sh + 0.04 * hi + 0.03 * mid;
        const mag = Math.max(0, 1 - Math.abs(hh - 315) / 45) * sat, cyn = Math.max(0, 1 - Math.abs(hh - 185) / 35) * sat, orn = Math.max(0, 1 - Math.abs(hh - 32) / 28) * sat;
        R += mag * 0.06 - cyn * 0.05 - orn * 0.02; G += cyn * 0.03 - mag * 0.03; B += mag * 0.05 + cyn * 0.05 + orn * 0.03;
      } else {
        const sh = 1 - sm(0.0, 0.35, l), hi = sm(0.5, 1.0, l), mid = 1 - Math.abs(l - 0.35) / 0.35;
        R += -0.02 * sh + 0.03 * hi + 0.012 * Math.max(0, mid); G += 0.008 * sh + 0.01 * hi - 0.008 * Math.max(0, mid); B += 0.05 * sh - 0.02 * hi + 0.016 * Math.max(0, mid);
      }
      const s = (x) => { x = Math.min(1, Math.max(0, x)); return Math.pow(x, 1.12) * 0.99 + 0.006; };
      R = s(R); G = s(G); B = s(B);
      const l2 = 0.2126 * R + 0.7152 * G + 0.0722 * B; const k = CYBER ? 1.32 : 1.2; R = l2 + (R - l2) * k; G = l2 + (G - l2) * k; B = l2 + (B - l2) * k;
    }
    const o = 4 * (r + g * N + b * N * N);
    data[o] = Math.round(Math.min(1, Math.max(0, R)) * 255); data[o + 1] = Math.round(Math.min(1, Math.max(0, G)) * 255); data[o + 2] = Math.round(Math.min(1, Math.max(0, B)) * 255); data[o + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

export function buildPost(renderer, scene, camera, opts = {}) {
  const w = window.innerWidth, h = window.innerHeight;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: opts.msaa ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  const rp = new RenderPass(scene, camera); composer.addPass(rp);
  // GTAO always runs: its normal/depth G-buffer feeds contact shadows, god rays, motion blur and DOF
  const gtao = new GTAOPass(scene, camera, w, h);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = opts.ao ? 1.0 : 0.0;
  gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.6, thickness: 1.8, scale: 1.15, samples: 12, distanceFallOff: 1.0 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
  composer.addPass(gtao);
  // vis-sweep: GTAO's normal/depth G-buffer is drawn with one override MeshNormalMaterial (no alpha test), so every leaf card /
  // palm frond / fence cut-out landed in the depth buffer as a full quad -> contact shadows + AO painted dark sky-blue
  // rectangles around tree canopies, god rays were blocked by invisible quads, DOF/motion blur used the wrong depth.
  // Alpha-tested meshes now render into that pass with a cut-out normal material of their own.
  const cutN = new WeakMap();
  const cutMat = (m) => { let c = cutN.get(m); if (c) return c;
    c = new THREE.ShaderMaterial({ side: m.side, allowOverride: false, uniforms: { map: { value: m.map }, uvT: { value: new THREE.Matrix3() }, aT: { value: m.alphaTest } },
      vertexShader: `uniform mat3 uvT; varying vec2 vUv; varying vec3 vN;
        void main(){ vUv = (uvT * vec3(uv, 1.0)).xy; vec4 p = vec4(position, 1.0); vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
        #endif
        vN = normalize(normalMatrix * n); gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: `uniform sampler2D map; uniform float aT; varying vec2 vUv; varying vec3 vN;
        void main(){ if (texture2D(map, vUv).a < aT) discard; vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }` });
    c.allowOverride = false; cutN.set(m, c); return c; };
  const swp = [], hid = [];
  const ro = gtao._renderOverride.bind(gtao);
  gtao._renderOverride = (r, mat, tgt, cc, ca) => {
    if (mat === gtao.normalMaterial) scene.traverseVisible((o) => { const m = o.material; if (!(o.isMesh || o.isPoints || o.isLine) || !m) return;
      // light2: see-through / additive / non-depth-writing surfaces (light cones, light pools, blob shadows, glass, decals,
      // water) must not enter the AO G-buffer: drawn there as solid quads they occluded everything behind them -> GTAO
      // painted huge black slabs over facades and streets (default ?ao on), and contact shadows / god rays hit them too.
      const m0 = Array.isArray(m) ? m[0] : m;
      if (!o.isMesh || m0.depthWrite === false || m0.colorWrite === false || m0.blending === THREE.AdditiveBlending || (m0.transparent && m0.opacity < 0.75 && !(m0.alphaTest > 0))) { hid.push(o); o.visible = false; return; }
      if (Array.isArray(m) || !(m.alphaTest > 0) || !m.map) return;
      const c = cutMat(m); if (m.map.matrixAutoUpdate) m.map.updateMatrix(); c.uniforms.uvT.value.copy(m.map.matrix); c.uniforms.map.value = m.map; swp.push(o, m); o.material = c; });
    try { ro(r, mat, tgt, cc, ca); } finally { for (let i = 0; i < swp.length; i += 2) swp[i].material = swp[i + 1]; swp.length = 0; for (const o of hid) o.visible = true; hid.length = 0; }
  };
  const PP = new URLSearchParams(location.search).get('pp') || 'cbmgf';
  const lfx = new ShaderPass(LightFXShader); lfx.uniforms.tDepth.value = gtao.depthTexture; lfx.uniforms.tNormal.value = gtao.normalTexture;
  if (PP.includes('c')) composer.addPass(lfx);
  { // light2: a valid compare-mode depth texture for tShadow until the far cascade's shadow map exists
    const drt = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) }); drt.depthTexture.compareFunction = THREE.LessEqualCompare;
    drt.depthTexture.minFilter = drt.depthTexture.magFilter = THREE.LinearFilter;
    const keep = renderer.getRenderTarget(); renderer.setRenderTarget(drt); renderer.clear(); renderer.setRenderTarget(keep);
    lfx.uniforms.tShadow.value = drt.depthTexture;
    const r0 = lfx.render.bind(lfx);
    lfx.render = (...a) => { const L = P.shaftLight; const t = L && L.shadow.map && L.shadow.map.depthTexture;
      if (t && t.compareFunction) { lfx.uniforms.tShadow.value = t; lfx.uniforms.uShMat.value.copy(L.shadow.matrix); } else lfx.uniforms.uShaft.value.w = 0;
      r0(...a); };
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.6, 1.6); if (PP.includes('b')) composer.addPass(bloom);
  const lens = new ShaderPass(LensShader); lens.uniforms.tDepth.value = gtao.depthTexture; if (PP.includes('m')) composer.addPass(lens);
  const out = new OutputPass(); composer.addPass(out);
  const grade = new ShaderPass(GradeShader); grade.uniforms.tLutDay.value = makeLUT('day'); grade.uniforms.tLutNight.value = makeLUT('night');
  if (PP.includes('g')) composer.addPass(grade);
  const fxaa = new FXAAPass(); if (PP.includes('f')) composer.addPass(fxaa);
  const sp = new THREE.Vector3(), sv = new THREE.Vector3();
  const P = {
    composer, gtao, bloom, lfx, lens, grade, prevVP: new THREE.Matrix4(), blur: 0, dof: 0, focus: 6, aperture: 1,
    setSize(w, h) { composer.setSize(w, h); for (const p of [grade, lfx, lens]) p.uniforms.uRes.value.set(w, h); },
    // call once per simulated frame BEFORE the camera moves: motion blur reprojects against this
    storePrev() { camera.updateMatrixWorld(); P.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); },
    update(sunDir, sunCol, night, time, gold = 0) {
      for (const p of [lfx, lens]) { const u = p.uniforms; u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uProj.value.copy(camera.projectionMatrix); u.uNear.value = camera.near; u.uFar.value = camera.far; }
      grade.uniforms.uTime.value = time; grade.uniforms.uNight.value = night; grade.uniforms.uGold.value = gold;
      sv.copy(sunDir).transformDirection(camera.matrixWorldInverse); lfx.uniforms.uSunV.value.copy(sv);
      lfx.uniforms.uContact.value = (1 - night) * Math.min(1, Math.max(0, sunDir.y * 6));
      sp.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
      const vis = sp.z < 1 && sunDir.y > -0.02 ? (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sp.x), Math.abs(sp.y)), 0.6, 1.2)) : 0; // shaftfix: three's smoothstep is (x, min, max) - full inside |ndc|<0.6, fades to 0 at 1.2 // r5.0: 1.2/0.6 (was 1.7/0.5): no ray fans from a sun well off-screen (aerial shots)
      lfx.uniforms.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      lfx.uniforms.uSunOn.value = vis * (1 - night) * (0.22 + gold * 0.5); // r6.1 softer shafts (backlit golden hour was a white wash) // v4.4 stronger golden-hour shafts
      lfx.uniforms.uRayCol.value.copy(sunCol).multiplyScalar(0.02);
      lfx.uniforms.uCamWorld.value.copy(camera.matrixWorld); lfx.uniforms.uSunW.value.copy(sunDir); if (P.shaft) lfx.uniforms.uShaft.value.copy(P.shaft);
      lens.uniforms.uCamWorld.value.copy(camera.matrixWorld); lens.uniforms.uPrevVP.value.copy(P.prevVP);
      lens.uniforms.uBlur.value = P.blur; lens.uniforms.uDof.value = P.dof; lens.uniforms.uFocus.value = P.focus; lens.uniforms.uAperture.value = P.aperture;
      // r5.0: the bloom threshold is in scene-linear HDR, but day exposure is ~0.5 -> sunlit sand/grass (~3-7) crossed 1.3 and the
      // whole frame glowed (noon beach / open-ground whiteout). Day threshold now tracks exposure; night stays as before.
      bloom.strength = 0.22 + night * (CYBER ? 0.4 : 0.26); bloom.threshold = THREE.MathUtils.lerp(7.5, 1.7, night); bloom.radius = 0.6;
    },
    render() { composer.render(); },
  };
  return P;
}
