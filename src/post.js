// v4.0 cinematic post chain (HDR until the output pass):
//   scene (HDR) -> GTAO (+ depth/normal G-buffer) -> LightFX (screen-space contact shadows toward the sun, depth-occluded
//   god rays) -> bloom -> Lens (camera motion blur when driving, depth of field in photo mode) -> ACES/AgX tonemap ->
//   Grade (procedural 3-D film LUT: golden-hour warm-orange highlights / teal shadows, night cyan-magenta; vignette,
//   chromatic aberration, film grain) -> FXAA
import * as THREE from 'three';
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
  },
  vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse, tNormal; uniform vec3 uSunV; uniform vec2 uSunUV; uniform float uSunOn, uContact; uniform vec3 uRayCol; uniform vec2 uRes;
  ${DEPTH_FN}
  void main(){
    vec4 base = texture2D(tDiffuse, vUv); vec3 col = base.rgb;
    // v4.3 NaN/Inf guard: one bad pixel must never spread through bloom into a black frame
    col = (col.r >= 0.0 && col.g >= 0.0 && col.b >= 0.0 && col.r < 60000.0 && col.g < 60000.0 && col.b < 60000.0) ? col : vec3(0.0);
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
        float fade = smoothstep(60.0, 30.0, dist);
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
      float fall = smoothstep(1.0, 0.0, length(dl * vec2(uRes.x / uRes.y, 1.0)) * 0.9);
      col += uRayCol * acc * fall * uSunOn;
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
    float v = smoothstep(1.0, 0.28, length(c * vec2(1.0, 0.92)));
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
      const sh = 1 - sm(0.0, 0.35, l), hi = sm(0.5, 1.0, l), mid = 1 - Math.abs(l - 0.35) / 0.35;
      R += -0.02 * sh + 0.03 * hi + 0.012 * Math.max(0, mid); G += 0.008 * sh + 0.01 * hi - 0.008 * Math.max(0, mid); B += 0.05 * sh - 0.02 * hi + 0.016 * Math.max(0, mid);
      const s = (x) => { x = Math.min(1, Math.max(0, x)); return Math.pow(x, 1.12) * 0.99 + 0.006; };
      R = s(R); G = s(G); B = s(B);
      const l2 = 0.2126 * R + 0.7152 * G + 0.0722 * B; const k = 1.2; R = l2 + (R - l2) * k; G = l2 + (G - l2) * k; B = l2 + (B - l2) * k;
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
  const PP = new URLSearchParams(location.search).get('pp') || 'cbmgf';
  const lfx = new ShaderPass(LightFXShader); lfx.uniforms.tDepth.value = gtao.depthTexture; lfx.uniforms.tNormal.value = gtao.normalTexture;
  if (PP.includes('c')) composer.addPass(lfx);
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
      const vis = sp.z < 1 && sunDir.y > -0.02 ? THREE.MathUtils.smoothstep(1.2, 0.6, Math.max(Math.abs(sp.x), Math.abs(sp.y))) : 0; // r5.0: 1.2/0.6 (was 1.7/0.5): no ray fans from a sun well off-screen (aerial shots)
      lfx.uniforms.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      lfx.uniforms.uSunOn.value = vis * (1 - night) * (0.35 + gold * 0.85); // v4.4 stronger golden-hour shafts
      lfx.uniforms.uRayCol.value.copy(sunCol).multiplyScalar(0.02);
      lens.uniforms.uCamWorld.value.copy(camera.matrixWorld); lens.uniforms.uPrevVP.value.copy(P.prevVP);
      lens.uniforms.uBlur.value = P.blur; lens.uniforms.uDof.value = P.dof; lens.uniforms.uFocus.value = P.focus; lens.uniforms.uAperture.value = P.aperture;
      // r5.0: the bloom threshold is in scene-linear HDR, but day exposure is ~0.5 -> sunlit sand/grass (~3-7) crossed 1.3 and the
      // whole frame glowed (noon beach / open-ground whiteout). Day threshold now tracks exposure; night stays as before.
      bloom.strength = 0.22 + night * 0.26; bloom.threshold = THREE.MathUtils.lerp(7.5, 1.7, night); bloom.radius = 0.6;
    },
    render() { composer.render(); },
  };
  return P;
}
