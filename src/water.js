// Ocean + bay water: planar reflection (shared with wet roads), animated normals, shallow-water colour, shore foam
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { U } from './env.js';
import { LAYOUT } from './city.js';

const vs = `
uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vWP;
void main(){ vUvR = textureMatrix * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const fs = `
uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 fogColor; uniform float fogDensity; uniform vec3 uFogSunCol; uniform float uFogFalloff; uniform float uNight; uniform vec3 uSkyCol;
uniform float beachX0, beachX1;
varying vec4 vUvR; varying vec3 vWP;
float bedH(vec2 p){
  if (p.x > beachX0 && abs(p.y) < 830.0) { float t = clamp((p.x - beachX0)/(beachX1 - beachX0), 0.0, 1.0); float y = 0.15 - pow(t,1.6)*2.9 - t*0.2; float ez = abs(p.y)-720.0; if (ez>0.0) y -= ez*0.06; return max(y, -1.0 - 6.0*clamp((p.x-beachX1)/260.0,0.0,1.0) - 2.6); }
  return -6.0;
}
vec3 nmap(vec2 uv){ return texture2D(tNormal, uv).xzy * 2.0 - 1.0; }
void main(){
  vec3 V = cameraPosition - vWP; float dist = length(V); V /= dist;
  vec2 p = vWP.xz;
  float t = uTime;
  vec3 n = nmap(p * 0.031 + vec2(t * 0.011, t * 0.007)) + nmap(p * 0.083 - vec2(t * 0.017, -t * 0.013)) * 0.7 + nmap(p * 0.0071 + vec2(-t*0.003, t*0.004)) * 0.8;
  float fade = clamp(1.0 - dist / 1400.0, 0.15, 1.0);
  n = normalize(vec3(n.x * 0.55 * fade, 1.0, n.z * 0.55 * fade));
  float depth = -1.0 - bedH(p);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec2 dist2 = n.xz * 0.035 * fade;
  vec3 refl = texture2D(tDiffuse, vUvR.xy / vUvR.w + dist2).rgb;
  // body colour: turquoise shallows -> deep teal blue
  vec3 shallow = vec3(0.10, 0.48, 0.44), mid = vec3(0.03, 0.20, 0.24), deep = vec3(0.012, 0.06, 0.09);
  vec3 body = mix(shallow, mid, smoothstep(0.2, 2.2, depth)); body = mix(body, deep, smoothstep(2.0, 7.0, depth));
  float skyL = dot(uSkyCol, vec3(0.3333));
  body *= (0.35 + 0.65 * clamp(dot(uSunCol, vec3(0.33)) * 0.25 + 0.1, 0.0, 1.2)) * (1.0 - uNight * 0.85);
  // sand visible through very shallow water
  body = mix(vec3(0.62, 0.56, 0.44) * (1.0 - uNight * 0.85) * clamp(dot(uSunCol, vec3(0.33)) * 0.3 + 0.2, 0.0, 1.0), body, smoothstep(0.0, 0.7, depth));
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  // sun glitter
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), 900.0) * 30.0 + pow(max(dot(n, H), 0.0), 120.0) * 0.6;
  col += uSunCol * spec * step(0.0, uSunDir.y);
  // shore foam
  float wave = sin(p.x * 0.35 - t * 1.2 + sin(p.y * 0.05) * 2.0) * 0.5 + 0.5;
  float foamN = texture2D(tNormal, p * 0.12 + t * 0.02).r;
  float foam = smoothstep(0.55, 0.0, depth + wave * 0.18) * smoothstep(0.35, 0.7, foamN + 0.25);
  col = mix(col, vec3(0.95, 0.96, 0.95) * (0.15 + 0.85 * (1.0 - uNight)) * clamp(dot(uSunCol, vec3(0.33)) * 0.35 + 0.25, 0.0, 1.3), foam * 0.85);
  // height fog (same model as the scene)
  vec3 rd = -V; float k = uFogFalloff; float tt = k * rd.y * dist; float f = abs(tt) > 1e-4 ? (1.0 - exp(-tt)) / tt : 1.0;
  float amt = 1.0 - exp(-fogDensity * dist * exp(-k * max(cameraPosition.y, 0.0)) * f);
  vec3 fc = fogColor + uFogSunCol * pow(max(dot(rd, uSunDir), 0.0), 7.0);
  col = mix(col, fc, clamp(amt, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildWater(scene, T, size = 0.5) {
  const tn = T.waternormals; tn.wrapS = tn.wrapT = THREE.RepeatWrapping; tn.colorSpace = THREE.NoColorSpace;
  const geo = new THREE.PlaneGeometry(9000, 9000);
  const w = window.innerWidth * size, h = window.innerHeight * size;
  const refl = new Reflector(geo, {
    textureWidth: w, textureHeight: h, clipBias: 0.003,
    shader: {
      name: 'Water', uniforms: {
        color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNormal: { value: tn }, uTime: U.uTime,
        uSunDir: U.uSunDir, uSunCol: U.uSunCol, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.001 }, uFogSunCol: U.uFogSunCol, uFogFalloff: U.uFogFalloff,
        uNight: U.uNight, uSkyCol: { value: new THREE.Color(0.5, 0.5, 0.6) }, beachX0: { value: LAYOUT.beachX[0] }, beachX1: { value: LAYOUT.beachX[1] },
      }, vertexShader: vs, fragmentShader: fs,
    },
  });
  refl.rotation.x = -Math.PI / 2; refl.position.set(0, LAYOUT.waterY, 0);
  refl.frustumCulled = false; refl.renderOrder = 1;
  scene.add(refl);
  // re-bind shared uniforms (Reflector clones uniforms)
  const u = refl.material.uniforms;
  u.uTime = U.uTime; u.uSunDir = U.uSunDir; u.uSunCol = U.uSunCol; u.uFogSunCol = U.uFogSunCol; u.uFogFalloff = U.uFogFalloff; u.uNight = U.uNight;
  // world-space reflection matrix for wet roads: textureMatrix * inverse(matrixWorld)
  const shared = { tex: { value: refl.getRenderTarget().texture }, mat: { value: new THREE.Matrix4() }, on: { value: 1 } };
  const inv = new THREE.Matrix4();
  const dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); dummy.needsUpdate = true;
  // The reflection is rendered explicitly once per frame (renderRefl) BEFORE the main pass, so wet roads drawn earlier in the
  // frame sample this frame's mirror image. The automatic per-draw hook is disabled: it also fired inside the GTAO normal
  // pass (scene.overrideMaterial = normals) and overwrote the mirror with view-space normals -> the blue/purple wet-road bug.
  const ob = refl.onBeforeRender;
  refl.onBeforeRender = function () {};
  const renderRefl = (renderer, scene, camera) => {
    if (!refl.visible) return;
    shared.on.value = 0; shared.tex.value = dummy;
    ob.call(refl, renderer, scene, camera);
    shared.tex.value = refl.getRenderTarget().texture; shared.on.value = 1;
    refl.updateMatrixWorld(); inv.copy(refl.matrixWorld).invert();
    shared.mat.value.copy(u.textureMatrix.value).multiply(inv);
  };
  const update = (scene) => {
    u.fogColor.value.copy(scene.fog.color); u.fogDensity.value = scene.fog.density;
  };
  return { mesh: refl, shared, update, renderRefl };
}
