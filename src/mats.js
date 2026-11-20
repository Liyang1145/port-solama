// Materials: PBR texture sets, CSM/fog preparation, procedural facade + road shaders
import * as THREE from 'three';
import { U } from './env.js';
import { CYBER } from './mapsel.js'; // r6.0: v4.5 cyberpunk / weathering shader parts only on map 霓港

export const M = {}; // material registry
let CSMREF = null; let ANISO = 8;
export function setCSM(csm, aniso) { CSMREF = csm; ANISO = aniso; }

export function prep(mat, key = 'std', patch = null) {
  mat.onBeforeCompile = (s, r) => {
    s.uniforms.uSunDir = U.uSunDir; s.uniforms.uFogSunCol = U.uFogSunCol; s.uniforms.uFogFalloff = U.uFogFalloff;
    if (patch) patch(s);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function texSet(T, name, rep = 1, opts = {}) {
  const d = T[name + '_d'], n = T[name + '_n'], a = T[name + '_arm'];
  for (const t of [d, n, a]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = ANISO; }
  if (d) d.colorSpace = THREE.SRGBColorSpace;
  return { map: d, normalMap: n, roughnessMap: a, aoMap: null, ...opts };
}

const HASH = `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h12(i),h12(i+vec2(1,0)),f.x), mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x), f.y); }
`;

// ---------------------------------------------------------------- building facades ----
// geometry attributes: uv = facade metres (u along wall, v height), aWin = (style, floorH, winW, seed), aCol = wall colour, aGlass = glass tint
// styles: 0 curtain wall, 1 condo (balcony bands), 2 punched windows (stucco), 3 storefront, 4 blank wall/roof, 5 deco ribbon windows
export function buildingMaterial(T) {
  const ts = texSet(T, 'plaster', 1);
  const cs = texSet(T, 'concrete', 1);
  const mat = new THREE.MeshStandardMaterial({ map: ts.map, normalMap: ts.normalMap, roughnessMap: ts.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) });
  ts.map.repeat.set(0.25, 0.25); ts.normalMap.repeat.set(0.25, 0.25); ts.roughnessMap.repeat.set(0.25, 0.25);
  const uniforms = { tConc: { value: cs.map }, uNight: U.uNight, uTime: U.uTime, uDbg: { value: +(new URLSearchParams(location.search).get('dbg') || 0) } };
  return prep(mat, 'building', (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aWin; attribute vec3 aCol; attribute vec3 aGlass; attribute vec3 aUp; flat varying vec4 vWin; flat varying vec3 vCol; flat varying vec3 vGlass; flat varying vec3 vUp; varying vec2 vUvM; varying vec3 vWPb;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vWin = aWin; vCol = aCol; vGlass = aGlass; vUp = aUp; vUvM = uv; vWPb = (modelMatrix * vec4(position,1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tConc; uniform float uNight; uniform float uTime; uniform float uDbg; flat varying vec4 vWin;
vec3 neonPal(float h){ h = fract(h); return h < 0.3 ? vec3(1.0, 0.17, 0.84) : h < 0.58 ? vec3(0.1, 0.94, 1.0) : h < 0.8 ? vec3(0.55, 0.36, 1.0) : vec3(1.0, 0.32, 0.45); } flat varying vec3 vCol; flat varying vec3 vGlass; flat varying vec3 vUp; varying vec2 vUvM; varying vec3 vWPb;
${HASH}`)
      .replace('#include <map_fragment>', `
float style = floor(vWin.x + 0.5); float fh = vWin.y; float ww = vWin.z; float seed = vWin.w;
vec2 cf = vec2(vUvM.x / ww, vUvM.y / fh); vec2 cid = floor(cf); vec2 f = fract(cf);
float rnd = h12(cid + seed * 17.0); float rnd2 = h12(cid.yx * 1.7 + seed * 3.1);
float isGlass = 0.0; float frame = 0.0; float lit = 0.0; float interior = 0.0; float shade = 1.0; float isMetal = 0.0; float posterM = 0.0; vec3 posterC = vec3(1.0);
vec3 wall = vCol;
vec4 texelColor = texture2D(map, vMapUv);
vec3 baseTex = texelColor.rgb / 0.82;
vec3 conc = baseTex;
// r6.1 tangent frame from screen derivatives (window recess parallax)
vec3 rP_ = vWPb; vec3 rdp1 = dFdx(rP_), rdp2 = dFdy(rP_); vec2 rdu1 = dFdx(vUvM), rdu2 = dFdy(vUvM);
vec3 rNg = normalize(cross(rdp1, rdp2) + 1e-7); if (dot(rNg, cameraPosition - rP_) < 0.0) rNg = -rNg;
vec3 rd2p = cross(rdp2, rNg), rd1p = cross(rNg, rdp1);
vec3 rTt = normalize(rd2p * rdu1.x + rd1p * rdu2.x + 1e-6), rBt = normalize(rd2p * rdu1.y + rd1p * rdu2.y + 1e-6);
vec3 rV = normalize(rP_ - cameraPosition);
vec3 vt_ = vec3(dot(rV, rTt), dot(rV, rBt), max(dot(rV, -rNg), 0.08));
float reveal = 0.0, revealK = 1.0;
float age = fract(seed * 0.618 + 0.13); // per-building age: grime, bleaching, streak strength
if (style == 0.0) { // curtain wall: glass with thin metal mullions + spandrel bands
  float mx = 1.0 - step(0.03, f.x) * step(f.x, 0.97);
  float my = 1.0 - step(0.035, f.y) * step(f.y, 0.985);
  float span = step(f.y, 0.16);
  frame = max(mx, my); isGlass = 1.0 - frame; isMetal = frame;
  interior = (1.0 - span);
  baseTex = vec3(0.75);
} else if (style == 1.0) { // condo: floor-to-ceiling glass behind balcony bands (slabs are geometry)
  float mx = 1.0 - step(0.025, f.x) * step(f.x, 0.975);
  float band = step(f.y, 0.20);
  frame = max(mx, band); isGlass = 1.0 - frame; interior = 1.0;
  baseTex = conc * 1.25;
} else if (style == 2.0 || style == 5.0) { // punched / ribbon windows in stucco
  float x0 = style == 5.0 ? 0.0 : 0.2; float x1 = style == 5.0 ? 1.0 : 0.8;
  float wx = step(x0, f.x) * step(f.x, x1); float wy = step(0.28, f.y) * step(f.y, 0.80);
  // r6.1 recessed openings: march the view ray D metres into the wall; outside the opening at that depth it hits the reveal
  // (jamb / head soffit / sill) instead of the frame + glass, so windows read as holes in a thick wall at any angle
  float open_ = wx * wy; float Dr = style == 5.0 ? 0.13 : 0.21;
  vec2 g = f + vt_.xy * (Dr / vt_.z) / vec2(ww, fh) * open_;
  if (style == 5.0) g.x = clamp(g.x, 0.0, 1.0);
  float gin = step(x0, g.x) * step(g.x, x1) * step(0.28, g.y) * step(g.y, 0.80);
  reveal = open_ * (1.0 - gin); revealK = g.y > 0.80 ? 0.40 : (g.y < 0.28 ? 1.02 : 0.72);
  f = mix(f, g, open_ * gin);
  float inner = step(x0 + 0.03, f.x) * step(f.x, x1 - 0.03) * step(0.31, f.y) * step(f.y, 0.77) * (1.0 - reveal);
  isGlass = inner; frame = wx * wy * (1.0 - inner) * (1.0 - reveal);
  if (style == 5.0) { float mul = 1.0 - step(0.02, fract(f.x * 3.0)) * step(fract(f.x * 3.0), 0.98); frame = max(frame, mul * wx * wy * (1.0 - reveal)); isGlass *= 1.0 - mul; }
  else { float sash = inner * max(step(abs(f.x - 0.5), 0.011), step(abs(f.y - 0.555), 0.010)); frame = max(frame, sash); isGlass *= 1.0 - sash; } // v4.1 casement mullion + meeting rail
  // reveal shadow under the eyebrow
  shade = 1.0 - 0.35 * step(0.80, f.y) * step(f.y, 0.86) * wx;
  interior = 1.0;
} else if (style == 3.0) { // storefront
  float mx = 1.0 - step(0.025, f.x) * step(f.x, 0.975);
  float wy = step(0.06, f.y) * step(f.y, 0.80);
  isGlass = wy * (1.0 - mx); frame = (1.0 - isGlass) * step(f.y, 0.82); isMetal = frame * 0.6; interior = 1.0;
  lit = 0.0;
  // window posters / decals and a door push-bar on some bays (GTA6 storefronts are covered in signage)
  float ph = h12(cid + seed * 9.1);
  float px0 = 0.10 + ph * 0.25, py1 = 0.24 + ph * 0.14;
  posterM = step(0.5, ph) * step(px0, f.x) * step(f.x, px0 + 0.16) * step(0.10, f.y) * step(f.y, py1);
  vec2 pq = vec2((f.x - px0) / 0.16, (f.y - 0.10) / max(py1 - 0.10, 0.01));
  posterC = (0.12 + 0.45 * vec3(fract(ph * 13.7), fract(ph * 7.9), fract(ph * 3.3))) * (0.75 + 0.5 * step(0.55, pq.y)) * (1.0 - 0.6 * step(abs(pq.y - 0.35), 0.06));
  float door = step(0.82, h12(cid.xx + seed)) * step(0.55, f.x) * step(f.x, 0.95);
  frame = max(frame, door * (step(abs(f.y - 0.42), 0.015) + step(abs(f.x - 0.75), 0.008) * wy) );
} else { // blank
  shade = 1.0;
}
// weathering / dirt streaks at the bottom of walls and under windows
float grime = vnoise(vec2(vUvM.x * 0.7, vUvM.y * 0.08 + seed)) * 0.07 + smoothstep(2.0, 0.0, vUvM.y) * 0.08;
// r6.1 material layering on both maps (the v4.5 霓港 layer generalised): water streaks running down from each sill,
// splash-back plinth, macro repaint / sun-bleach variation, per-building age, concrete patches, projecting sill + drop shadow
float streak = 0.0, sill = 0.0, sillSh = 0.0;
float sn0 = vnoise(vec2(vUvM.x * 9.0, cid.y * 3.1 + seed)) * 0.6 + vnoise(vec2(vUvM.x * 23.0, seed)) * 0.4;
if (style == 2.0 || style == 5.0) {
  float x0s = style == 5.0 ? 0.0 : 0.2; float x1s = style == 5.0 ? 1.0 : 0.8;
  float fx_ = fract(cf.x), fy_ = fract(cf.y);
  float inCol = step(x0s + 0.02, fx_) * step(fx_, x1s - 0.02);
  streak = inCol * smoothstep(0.28, 0.0, fy_) * smoothstep(0.45, 0.8, sn0) * ${CYBER ? '0.26' : '0.15'} * (0.5 + age);
  sill = step(x0s - 0.04, fx_) * step(fx_, x1s + 0.04) * step(0.245, fy_) * step(fy_, 0.28);
  sillSh = step(x0s - 0.03, fx_) * step(fx_, x1s + 0.03) * smoothstep(0.245, 0.225, fy_) * step(0.19, fy_);
}
// long run-off streaks below the parapet / every few floors (stronger on 霓港's rain-soaked concrete)
float roofStreak = smoothstep(0.55, 0.85, vnoise(vec2(vUvM.x * 1.3, seed * 2.0)) * 0.7 + vnoise(vec2(vUvM.x * 5.1, vUvM.y * 0.05)) * 0.3) * (style == 3.0 || style == 4.0 ? 0.0 : 1.0);
float macro = vnoise(vUvM * vec2(0.09, 0.05) + seed * 1.7);
float micro = vnoise(vUvM * vec2(1.9, 2.3) + seed) * 0.6 + vnoise(vUvM * 7.0) * 0.4;
float plinth = smoothstep(${CYBER ? '1.1' : '0.75'}, 0.0, vUvM.y) * (0.6 + 0.4 * vnoise(vec2(vUvM.x * 2.0, seed)));
vec3 concP = texture2D(tConc, vUvM * 0.21).rgb * vec3(0.95, 0.93, 0.9);
float patchC = smoothstep(0.66, 0.72, vnoise(vUvM * 0.33 + seed * 5.0)) * step(style, 2.5) * step(1.5, style);
vec3 wallCol = baseTex * min(wall, vec3(0.9)) * 0.9 * (1.0 - grime) * shade; // v4.0: stucco albedo capped (sunlit walls no longer clip)
wallCol *= (0.9 + 0.2 * macro) * (0.95 + 0.1 * micro) * (1.0 - streak) * (1.0 - plinth * ${CYBER ? '0.30' : '0.20'}) * (1.0 - sillSh * 0.3);
${CYBER ? `wallCol *= 1.0 - roofStreak * smoothstep(30.0, 6.0, mod(vUvM.y, 36.0)) * 0.18 * (0.4 + age); // rain run-off
wallCol = mix(wallCol, concP * 0.8, patchC * 0.55);` : `// 索拉纳港: sun-bleached stucco (paler + less saturated high up and on old buildings), warm dust at the foot
{ float lumW = dot(wallCol, vec3(0.299, 0.587, 0.114)); float bleach = (0.15 + 0.35 * age) * smoothstep(3.0, 18.0, vUvM.y) * (0.6 + 0.4 * macro);
  wallCol = mix(wallCol, vec3(lumW) * vec3(1.06, 1.04, 1.0), bleach * 0.45);
  wallCol = mix(wallCol, wallCol * vec3(0.86, 0.80, 0.72), plinth * 0.5);
  wallCol *= 1.0 - roofStreak * smoothstep(14.0, 4.0, mod(vUvM.y, 18.0)) * 0.07 * age;
  wallCol = mix(wallCol, concP * vec3(0.95, 0.92, 0.86), patchC * 0.25 * age); }`}
wallCol = mix(wallCol, vec3(0.86, 0.85, 0.82) * baseTex, sill * 0.85);
vec3 frameCol = style == 0.0 || style == 3.0 ? vec3(0.06, 0.065, 0.07) + wall * 0.15 : vec3(0.85, 0.85, 0.82);
// interiors behind glass: blinds / curtains for residential windows
float blind = (style == 2.0 || style == 5.0 || style == 1.0) ? step(1.0 - fract(f.y * 1.0 + 0.0), 0.0) : 0.0;
float bl = (style == 2.0 || style == 5.0 || style == 1.0) ? step(0.55, rnd2) * step(mix(0.55, 0.95, rnd), f.y) : 0.0;
vec3 glassCol = vGlass * (0.8 + 0.4 * rnd2);
float gEdge = 1.0 - smoothstep(0.0, 0.09, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 1.6); // dust at the pane edges
float gDirt = gEdge * 0.5 + smoothstep(0.55, 0.9, vnoise(vUvM * 3.1 + seed)) * 0.25;
glassCol = mix(glassCol, glassCol * vec3(1.05, 1.0, 0.92) + 0.015, gDirt * 0.5);
glassCol *= 1.0 - 0.45 * smoothstep(0.70, 0.77, f.y) * step(1.5, style) * step(style, 2.5); // reveal shadow under the lintel
glassCol = mix(glassCol, vec3(0.55, 0.52, 0.47), bl * 0.8);
// fade the procedural grid to its average when it gets smaller than a pixel (prevents moire)
vec2 fw = fwidth(cf); float aa = smoothstep(0.18, 0.6, max(fw.x, fw.y));
float avgG = style == 0.0 ? 0.80 : (style == 1.0 ? 0.76 : (style == 5.0 ? 0.48 : (style == 3.0 ? 0.70 : (style == 2.0 ? 0.22 : 0.0))));
isGlass = mix(isGlass, avgG, aa); frame = mix(frame, (1.0 - avgG) * (style == 2.0 || style == 5.0 ? 0.15 : 0.7), aa); shade = mix(shade, 1.0, aa); bl *= 1.0 - aa;
frameCol *= 0.88 + 0.24 * vnoise(vUvM * vec2(13.0, 17.0) + seed); // r6.1 paint wear / dirt on frames
vec3 col = mix(wallCol, frameCol, frame);
reveal *= 1.0 - aa; col = mix(col, wallCol * revealK * (1.0 - 0.25 * (1.0 - revealK)), reveal); // r6.1 recess reveal (head soffit darkest)
col = mix(col, glassCol, isGlass);
posterM *= 1.0 - aa; col = mix(col, posterC, posterM); isGlass *= 1.0 - posterM;
diffuseColor.rgb *= col;
${CYBER ? `float litChance = style == 3.0 ? 0.86 : (style == 0.0 ? 0.36 : 0.42);` : `float litChance = style == 3.0 ? 0.86 : (style == 0.0 ? 0.42 : 0.5);`}
lit = max(lit, step(rnd, litChance));
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
roughnessFactor *= mix(texelRoughness.g * 0.9 + 0.1, 0.35 + 0.2 * micro, frame);
roughnessFactor *= 0.9 + 0.2 * micro;
${CYBER ? `roughnessFactor = mix(roughnessFactor, 0.32, clamp(streak * 3.0 + roofStreak * 0.5 + plinth * 0.6, 0.0, 1.0) * (0.35 + 0.65 * uNight)); // wet run-off / splash zone` : ``}
roughnessFactor = mix(roughnessFactor, mix(0.02 + 0.06 * rnd2 + gDirt * 0.25, 0.6, bl), isGlass);
`)
      .replace('#include <metalnessmap_fragment>', `
float metalnessFactor = mix(isMetal * 0.7, (style == 0.0 ? 0.9 : (style == 3.0 ? 0.45 : 0.6)) * (1.0 - bl), isGlass);
`)
      .replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, max(isGlass, frame)));
// r6.1 procedural relief on the wall: trowelled stucco (索拉纳港) / board-formed concrete with tie holes (霓港), fades out with distance
{ float wallOnly = (1.0 - isGlass) * (1.0 - frame) * (1.0 - reveal) * (1.0 - aa);
${CYBER ? `  float hb = (vnoise(vUvM * vec2(3.0, 1.2) + seed) * 0.5 + vnoise(vUvM * 9.0) * 0.25) * 0.006 - smoothstep(0.035, 0.0, abs(fract(vUvM.y / 1.2) - 0.5) - 0.465) * 0.004
           - smoothstep(0.06, 0.0, length(fract(vUvM / vec2(0.9, 0.6)) - 0.5)) * 0.003;` : `  float hb = (vnoise(vUvM * vec2(2.3, 2.9) + seed) * 0.55 + vnoise(vUvM * 8.5 + 3.0) * 0.3 + vnoise(vUvM * 23.0) * 0.15) * 0.007;`}
  hb *= wallOnly;
  vec2 dH = vec2(dFdx(hb), dFdy(hb));
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition); vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
  float fDet = dot(sX, R1) * faceDirection; vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
  normal = normalize(abs(fDet) * normal - vGrad); }
// per-pane tilt: neighbouring panes reflect slightly different parts of the sky/street (real glazing is never perfectly flat)
normal = normalize(normal + vec3((rnd - 0.5) * 0.06 + (vnoise(vUvM * 0.7) - 0.5) * 0.02, (rnd2 - 0.5) * 0.04, 0.0) * isGlass);
`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ // r6.1 ambient occlusion on the indirect light only: wall foot, recess reveals, under sills (sunlit faces keep their direct light)
  float aoB = mix(0.50, 1.0, smoothstep(0.1, 2.4, vUvM.y)) * (1.0 - reveal * 0.45) * (1.0 - sillSh * 0.35);
  reflectedLight.indirectDiffuse *= aoB; reflectedLight.indirectSpecular *= mix(1.0, aoB, 0.7);
}`)
      .replace('#include <emissivemap_fragment>', `
#include <emissivemap_fragment>
{
  vec3 warm = mix(vec3(1.0, 0.62, 0.32), vec3(0.85, 0.9, 1.0), step(0.72, rnd2));
  float n = uNight;
${CYBER ? `  warm = mix(warm, neonPal(rnd * 3.7 + seed * 0.1) * 0.9 + 0.1, step(0.78, rnd) * n * 0.8); // some rooms lit in magenta / cyan at night
` : ``}  // fake room depth: darker towards the window centre, a bright ceiling band, random furniture silhouettes
  float ceil = smoothstep(0.66, 0.74, f.y) * (1.0 - smoothstep(0.76, 0.8, f.y));
  float depthF = 0.55 + 0.45 * smoothstep(0.0, 0.35, abs(f.x - 0.5));
  float furn = step(0.5, h12(vec2(floor(vUvM.x * 1.3), seed))) * step(f.y, 0.42);
  vec3 room = warm * (depthF * (1.0 - furn * 0.6) + ceil * 1.6);
  if (style == 3.0) { // v3.4 shop interior: pale back wall, small merchandise on shelf rows, counter, ceiling troffers
    float rows = fract(f.y * 7.0);
    float shelfBand = step(0.10, f.y) * step(f.y, 0.60);
    vec2 gid = floor(vec2(vUvM.x * 10.0, f.y * 7.0)); float gh = h12(gid + seed * 5.3);
    vec3 goods = mix(vec3(0.62, 0.58, 0.52), vec3(fract(gh * 7.31), fract(gh * 3.17), fract(gh * 5.73)), 0.5);
    float gx = fract(vUvM.x * 10.0);
    float item = step(0.22, gh) * step(0.12, gx) * step(gx, 0.88) * step(0.18, rows) * step(rows, 0.86);
    float shelfLine = smoothstep(0.09, 0.0, rows);
    float aisle = step(0.78, h12(vec2(floor(vUvM.x * 0.45), seed)));
    vec3 wallC = mix(vec3(0.92, 0.88, 0.82), vec3(0.82, 0.88, 0.92), step(0.5, rnd2));
    float troffer = step(0.72, f.y) * step(f.y, 0.75) * step(0.35, fract(vUvM.x * 0.5)) * step(fract(vUvM.x * 0.5), 0.65);
    room = wallC * mix(0.40, 0.2, uNight) * depthF + shelfBand * (1.0 - aisle) * (goods * item * 0.75 + shelfLine * 0.28)
         + vec3(1.0, 0.98, 0.92) * troffer * 1.1 + vec3(0.9, 0.85, 0.78) * step(f.y, 0.2) * aisle * 0.3;
    room *= mix(vec3(1.0), warm, 0.45);
    // r6.1 not every shop is a grocery: per-shop interior type (2-bay units) -> café / boutique / office as well
    float stype = floor(h12(vec2(seed * 3.7, floor(cid.x * 0.5))) * 4.0);
    if (stype == 1.0) { // café / restaurant: warm darker room, table + chair silhouettes, pendant lamps, a counter at the back
      vec3 wc = vec3(0.55, 0.38, 0.26) * (0.8 + 0.4 * rnd2);
      float tx = fract(vUvM.x * 0.55); float table = step(0.28, f.y) * step(f.y, 0.31) * step(0.2, tx) * step(tx, 0.62) + step(f.y, 0.29) * step(abs(tx - 0.41), 0.02);
      float chair = step(f.y, 0.36) * step(0.12, f.y) * (step(abs(tx - 0.12), 0.03) + step(abs(tx - 0.72), 0.03));
      float pend = smoothstep(0.05, 0.0, length(vec2((tx - 0.41) * 2.0, f.y - 0.6))) ;
      float cord = step(0.6, f.y) * step(abs(tx - 0.41), 0.004);
      room = wc * mix(0.30, 0.18, uNight) * depthF; room = mix(room, vec3(0.06, 0.04, 0.03), clamp(table + chair + cord, 0.0, 1.0));
      room += vec3(1.0, 0.72, 0.4) * pend * 2.2 + vec3(1.0, 0.75, 0.45) * smoothstep(0.6, 0.0, abs(f.y - 0.58)) * 0.12;
    } else if (stype == 2.0) { // boutique: bright white room, clothes on rails, track spots
      vec3 wc = vec3(0.92, 0.9, 0.88);
      float rail = step(abs(f.y - 0.58), 0.006); float gx = fract(vUvM.x * 4.0); vec2 gid2 = vec2(floor(vUvM.x * 4.0), seed);
      float cloth = step(0.30, f.y) * step(f.y, 0.57) * step(0.15, gx) * step(gx, 0.85) * step(0.25, h12(gid2));
      vec3 cc = 0.25 + 0.6 * vec3(h12(gid2 + 1.3), h12(gid2 + 2.1), h12(gid2 + 3.7));
      // vis-sweep: was an L1 distance -> hard white diamonds on every boutique window; now a round track-light head + a soft
      // downward wash on the wall below it
      vec2 sd = vec2((fract(vUvM.x * 0.7) - 0.5) * 0.3, (f.y - 0.73) * 0.6);
      float spot = smoothstep(0.03, 0.012, length(sd)) + smoothstep(0.16, 0.0, length(vec2(sd.x * 1.5, max(-sd.y, 0.0) * 0.45))) * step(f.y, 0.73) * 0.3;
      room = wc * mix(0.30, 0.22, uNight) * depthF; room = mix(room, cc * 0.45, cloth); room = mix(room, vec3(0.1), rail);
      room += vec3(1.0, 0.95, 0.85) * spot * 0.8;
    } else if (stype == 3.0) { // office / bank: cool white, reception desk, a plant, ceiling panels
      vec3 wc = vec3(0.78, 0.82, 0.86);
      float desk = step(0.12, f.y) * step(f.y, 0.30) * step(0.25, fract(vUvM.x * 0.3)) * step(fract(vUvM.x * 0.3), 0.75);
      // vis-sweep: the potted plant was a soft green blur dot; now a pot + a lobed leaf crown with a crisp (AA) edge
      vec2 pq = vec2((fract(vUvM.x * 0.3 + 0.37) - 0.5) * 2.5, (f.y - 0.38) * 1.6); float pa = atan(pq.y, pq.x);
      float pr = 0.085 * (0.78 + 0.22 * sin(pa * 7.0 + seed * 3.0)) - length(pq); float paw = max(fwidth(pr), 1e-4);
      float plant = smoothstep(-paw, paw, pr);
      float pot = step(abs(pq.x), 0.04) * step(-0.2, pq.y) * step(pq.y, -0.07);
      room = wc * mix(0.32, 0.22, uNight) * depthF; room = mix(room, vec3(0.32, 0.28, 0.25), desk); room = mix(room, vec3(0.06, 0.15, 0.05) * (0.8 + 0.4 * h12(floor(pq * 40.0))), plant * step(f.y, 0.5)); room = mix(room, vec3(0.30, 0.18, 0.12), pot);
      room += vec3(0.9, 0.95, 1.0) * troffer * 1.2;
    }
  }
  float inside = isGlass * interior * (style == 3.0 ? max(lit, 1.0 - n) : lit) * (0.55 + 0.45 * rnd2); // v4.4 shops are open by day (unlit bays read as black slabs)
  float k = style == 3.0 ? (0.95 - n * 0.25) : (n * 0.8); // v4.3 lit shop interiors read through the glass by day (no black storefronts)
  // v4.1 interior mapping (parallax rooms): ray-box intersection of the view ray with a room behind each window cell.
  if (style != 3.0 && style != 4.0 && isGlass > 0.01 && aa < 0.99) {
    vec3 P = vWPb; vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 du1 = dFdx(vUvM), du2 = dFdy(vUvM);
    vec3 Ng = normalize(cross(dp1, dp2)); if (dot(Ng, cameraPosition - P) < 0.0) Ng = -Ng;
    vec3 d2p = cross(dp2, Ng), d1p = cross(Ng, dp1);
    vec3 Tt = normalize(d2p * du1.x + d1p * du2.x + 1e-6), Bt = normalize(d2p * du1.y + d1p * du2.y + 1e-6);
    vec3 V = normalize(P - cameraPosition);
    vec3 rd = vec3(dot(V, Tt), dot(V, Bt), max(dot(V, -Ng), 0.05));
    float RW = ww, RH2 = fh, RD = max(ww, 3.2) * (1.0 + rnd * 0.6);
    vec3 ro = vec3(f.x * RW, f.y * RH2, 0.0);
    float tx = rd.x > 0.0 ? (RW - ro.x) / max(rd.x, 1e-4) : ro.x / max(-rd.x, 1e-4);
    float ty = rd.y > 0.0 ? (RH2 * 0.96 - ro.y) / max(rd.y, 1e-4) : (ro.y - RH2 * 0.03) / max(-rd.y, 1e-4);
    float tz = RD / rd.z;
    float t = min(min(tx, ty), tz); vec3 hp = ro + rd * t;
    vec3 wallP = mix(vec3(0.80, 0.76, 0.70), vec3(0.70, 0.76, 0.80), step(0.5, rnd2)) * (0.8 + 0.3 * h12(cid + 3.3));
    vec3 rc; float depthK = 1.0 - 0.55 * clamp(hp.z / RD, 0.0, 1.0);
    if (t == tz) { // back wall: a picture or a doorway
      vec2 bq = vec2(hp.x / RW, hp.y / RH2); rc = wallP;
      float pic = step(0.6, rnd) * step(abs(bq.x - 0.5), 0.16) * step(abs(bq.y - 0.55), 0.10); rc = mix(rc, vec3(0.25, 0.35, 0.45) * (0.6 + rnd2), pic);
      float door = step(rnd, 0.3) * step(abs(bq.x - 0.25), 0.1) * step(bq.y, 0.7); rc = mix(rc, rc * 0.45, door);
    } else if (t == ty) rc = rd.y > 0.0 ? vec3(0.92, 0.9, 0.86) : mix(vec3(0.36, 0.25, 0.17), vec3(0.42, 0.40, 0.38), step(0.5, rnd)) * 0.9;
    else rc = wallP * 0.82;
    // furniture silhouette (sofa / bookcase / desk) on a plane part-way into the room
    float fz = RD * (0.35 + 0.3 * rnd2); float tf = (fz - ro.z) / rd.z; vec3 fp = ro + rd * tf;
    float fx0 = RW * (0.1 + 0.3 * rnd), fx1 = fx0 + RW * (0.35 + 0.25 * rnd2);
    float fh2 = RH2 * mix(0.28, 0.62, step(0.6, h12(cid + 7.7)));
    if (tf < t && fp.x > fx0 && fp.x < fx1 && fp.y < fh2 && fp.y > 0.0) { rc = mix(vec3(0.22, 0.18, 0.16), vec3(0.35, 0.3, 0.26), rnd) ; depthK *= 0.9; }
    // curtains just behind the glass
    float cw = RW * (0.08 + 0.2 * step(0.5, h12(cid + 1.1)));
    float curt = max(step(ro.x, cw), step(RW - cw, ro.x));
    vec3 curtC = mix(vec3(0.85, 0.82, 0.74), vec3(0.75, 0.55, 0.45), step(0.7, rnd2));
    float lamp = smoothstep(RW * 0.5, 0.0, length(hp.xz - vec2(RW * 0.5, RD * 0.5))) * step(RH2 * 0.9, hp.y);
    vec3 nightL = warm * (0.7 * depthK + lamp * 1.5);
    vec3 dayL = vec3(0.95, 0.97, 1.0) * exp(-hp.z / RD * 1.4) * 0.9 + 0.08;
    vec3 roomI = rc * mix(dayL * 0.34, nightL * lit, n);
    roomI = mix(roomI, curtC * mix(0.30, 0.55 * lit + 0.04, n), curt * 0.92);
    float fres = pow(1.0 - clamp(rd.z, 0.0, 1.0), 4.0);
    totalEmissiveRadiance += roomI * isGlass * (1.0 - aa) * (1.0 - fres * 0.85) * (1.0 - bl * 0.7);
    k *= aa; // far windows keep the old flat lit-window look
  }
  totalEmissiveRadiance += room * inside * k;
${CYBER ? `  // v4.5 cyberpunk night: LED bands every few floors + a corner strip on towers, neon fascia over storefronts
  if (n > 0.01) {
    vec3 pc = neonPal(seed * 0.137 + 0.05);
    float fl = cid.y;
    if (style == 0.0 || style == 1.0 || (style == 2.0 && vUvM.y > 16.0 && fract(seed * 0.31) < 0.5)) {
      float every = style == 1.0 ? 4.0 : 6.0;
      // bands on absolute height so they stay continuous lines (>= 1.5 px) from the air; chase light runs along the facade
      float per = fh * every; float yy = mod(vUvM.y + floor(seed) * fh, per);
      float bh = max(0.22, fwidth(vUvM.y) * 1.6);
      float bandM = smoothstep(bh, bh * 0.4, yy) * step(6.0, vUvM.y);
      float chase = 0.55 + 0.45 * sin(vUvM.x * 0.35 - uTime * 2.2 + seed);
      float cw = max(0.5, fwidth(vUvM.x) * 1.6);
      float corner = smoothstep(cw, cw * 0.3, vUvM.x) * step(0.5, fract(seed * 0.73)) * step(4.0, vUvM.y);
      totalEmissiveRadiance += pc * (bandM * chase * 4.0 + corner * 3.0) * n;
    }
    if (style == 3.0) {
      float fas = smoothstep(0.835, 0.845, f.y) * smoothstep(0.875, 0.865, f.y);
      totalEmissiveRadiance += neonPal(seed * 0.21 + cid.x * 0.37) * fas * 6.0 * n;
    }
    // r6.1 neon light actually falling on the surfaces around it: each storefront fascia throws its own colour up the wall
    // above it and down over the frames / piers (falls off with distance from the tube), weighted by the surface albedo
    { float wallLit = (1.0 - isGlass * 0.85);
      float bay = floor(vUvM.x / max(ww, 0.5));
      float yF = style == 3.0 ? fh * 0.855 : 4.0; float dy = vUvM.y - yF;
      float fall = exp(-max(dy, 0.0) / 2.2) * step(-0.2, dy) + exp(min(dy, 0.0) / 1.4) * (1.0 - step(-0.2, dy)) * 0.8;
      fall *= smoothstep(13.0, 2.0, vUvM.y);
      vec3 spillC = neonPal(seed * 0.21 + bay * 0.37);
      totalEmissiveRadiance += spillC * diffuseColor.rgb * fall * wallLit * n * 1.6; }
  }
` : ``}  // coloured facade up-lighting on the Art Deco hotels at night
  float wallM = (1.0 - isGlass) * (1.0 - frame * 0.5);
  float grad = 0.12 + 0.88 * exp(-max(vUvM.y - 4.4, 0.0) / 4.5); // v4.3 wash concentrated above the shop band, not a whole-facade tint
  totalEmissiveRadiance += vUp * diffuseColor.rgb * wallM * grad * n * 0.9;
}
`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
if (uDbg == 1.0) gl_FragColor = vec4(vec3(isGlass), 1.0);
if (uDbg == 2.0) gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
if (uDbg == 3.0) gl_FragColor = vec4(totalEmissiveRadiance, 1.0);
if (uDbg == 4.0) gl_FragColor = vec4(roughnessFactor, metalnessFactor, 0.0, 1.0);
if (uDbg == 5.0) gl_FragColor = vec4(diffuseColor.rgb, 1.0);
`);
  });
}

// --------------------------------------------------------------------- road surface ----
// attributes: aRd = (across m, along m, segment length, kind) ; kind 0 = 4-lane two-way, 1 = intersection, 2 = 2-lane, 3 = 6-lane causeway
export function roadMaterial(T, refl) {
  const ts = texSet(T, 'asphalt', 1);
  const mat = new THREE.MeshStandardMaterial({ map: ts.map, normalMap: ts.normalMap, roughnessMap: ts.roughnessMap, roughness: 1, metalness: 0, color: 0xffffff, normalScale: new THREE.Vector2(1, 1) , ...(CYBER ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } : {}) }); // v4.5 roads win the depth test over land caps / terrain 3–4 cm below
  for (const t of [ts.map, ts.normalMap, ts.roughnessMap]) t.repeat.set(7 / 3.5, 7 / 3.5);
  const uniforms = { uWet: U.uWet, uNight: U.uNight, tRefl: refl.tex, uReflMat: refl.mat, uReflOn: refl.on };
  return prep(mat, 'road', (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aRd; varying vec4 vRd; varying vec3 vRW;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vRd = aRd; vRW = (modelMatrix * vec4(position, 1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet; uniform float uNight; uniform sampler2D tRefl; uniform mat4 uReflMat; uniform float uReflOn; varying vec4 vRd; varying vec3 vRW;
${HASH}
float bandM(float x, float c, float w){ return smoothstep(w*0.5+0.02, w*0.5-0.02, abs(x-c)); }`)
      .replace('#include <map_fragment>', `
vec4 texelColor = texture2D(map, vMapUv);
float u = vRd.x, v = vRd.y, L = vRd.z, kind = floor(vRd.w + 0.5);
float au = abs(u);
vec3 paintW = vec3(0.86, 0.86, 0.82), paintY = vec3(0.86, 0.66, 0.16);
float wpaint = 0.0, ypaint = 0.0, bikeM = 0.0, bikeG = 0.0;
float wear = vnoise(vRW.xz * 0.35) * 0.6 + vnoise(vRW.xz * 2.3) * 0.4;
if (kind == 0.0 || kind == 3.0) {
  float hw = kind == 3.0 ? 10.5 : 7.0;
  ypaint = max(bandM(u, 0.18, 0.12), bandM(u, -0.18, 0.12));
  float dash = step(fract(v / 9.0), 0.36);
  wpaint = bandM(au, 3.5, 0.13) * dash + bandM(au, hw - 0.35, 0.15);
  if (kind == 3.0) wpaint += bandM(au, 7.0, 0.13) * dash;
  // crosswalks + stop lines at both ends
  float e = min(v, L - v);
  float zebra = step(0.5, fract(u / 1.1)) * step(1.0, e) * step(e, 4.2) * step(au, hw - 0.5);
  float stopl = bandM(e, 5.0, 0.45) * step(0.3, u * sign(v - L * 0.5) * -1.0) * step(au, hw - 0.5);
  wpaint = max(wpaint, max(zebra, stopl));
  if (e < 5.4) ypaint *= step(5.4, e);
  // v3.4 lane arrows before the stop line (GTA6_REFERENCE §6 road markings)
  float laneC = au < 3.5 ? 1.75 : 5.25; float ue = abs(au - laneC);
  float inb = step(0.3, u * sign(v - L * 0.5) * -1.0) * step(au, 6.6);
  float shaft = step(ue, 0.11) * step(9.0, e) * step(e, 11.6);
  float head = step(11.6, e) * step(e, 13.0) * step(ue, 0.42 * (13.0 - e) / 1.4);
  wpaint = max(wpaint, (shaft + head) * inb * step(30.0, L));
  // green bike lanes on island/bayfront streets (not the beachfront drive with its parking lane)
  bikeM = (kind == 0.0 && vRW.x > -620.0 && (vRW.x < 268.0 || vRW.x > 312.0)) ? 1.0 : 0.0;
  float bikeBand = bandM(au, 6.15, 0.95) * bikeM * step(5.4, e);
  float bikeDash = step(e, 22.0) * step(fract(v / 3.0), 0.5);
  bikeG = bikeBand * mix(1.0, bikeDash, step(e, 22.0));
  wpaint = max(wpaint, bandM(au, 5.6, 0.12) * bikeM * step(5.4, e));
} else if (kind == 2.0) {
  ypaint = max(bandM(u, 0.15, 0.1), bandM(u, -0.15, 0.1));
  wpaint = bandM(au, 3.9, 0.14);
}
float paintMask = clamp(wpaint + ypaint, 0.0, 1.0) * (0.55 + 0.45 * smoothstep(0.25, 0.75, wear));
vec3 asph = texelColor.rgb * diffuse;
// tyre tracks: darker, smoother bands in each lane centre
float lanePos = abs(fract((au) / 3.5) - 0.5);
float tracks = (kind == 1.0) ? 0.0 : smoothstep(0.32, 0.18, abs(lanePos - 0.25)) * 0.2;
// patches / sealed cracks
float patchN = smoothstep(0.62, 0.66, vnoise(vRW.xz * 0.06 + 3.0));
asph *= (1.0 - tracks) * (1.0 - patchN * 0.25) * (0.9 + 0.2 * wear);
${CYBER ? `// v4.5 sealed crack lines + oil drips down the lane centres + lighter aggregate where the binder wore off
float crk = smoothstep(0.035, 0.0, abs(vnoise(vRW.xz * 0.35) - 0.5)) * smoothstep(0.5, 0.7, vnoise(vRW.xz * 0.045 + 11.0));
float oil = (kind == 1.0 ? 0.0 : smoothstep(0.18, 0.0, abs(lanePos - 0.0))) * smoothstep(0.55, 0.8, vnoise(vRW.xz * vec2(0.9, 0.9) + 3.7)) * 0.5;
asph = mix(asph, asph * 0.45, max(crk * 0.8, oil));
asph *= 1.0 + 0.12 * smoothstep(0.7, 0.9, vnoise(vRW.xz * 1.7));
` : ``}vec3 col = mix(asph, wpaint > ypaint ? paintW : paintY, paintMask);
col = mix(col, vec3(0.16, 0.42, 0.20) * (0.8 + 0.3 * wear), bikeG * (0.7 + 0.3 * smoothstep(0.2, 0.7, wear)));
paintMask = max(paintMask, bikeG * 0.8);
// wet: darker, puddles
float pud = smoothstep(${CYBER ? '0.48, 0.62' : '0.56, 0.68'}, vnoise(vRW.xz * 0.11) * 0.7 + vnoise(vRW.xz * 0.6) * 0.3 + tracks * 0.6); // vis-sweep A: fewer puddles (the whole night road read as a flooded mirror)
float wet = uWet;
col *= mix(1.0, 0.45, wet);
diffuseColor.rgb = col;
float paintF = paintMask;
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
roughnessFactor = clamp(texelRoughness.g * 1.05, 0.55, 1.0) - tracks * 0.25;
roughnessFactor = mix(roughnessFactor, 0.55, paintF);
roughnessFactor = mix(roughnessFactor, mix(${CYBER ? '0.32' : '0.42'}, ${CYBER ? '0.11' : '0.07'}, pud), wet); // vis-sweep A: 0.32/0.03 -> 0.42/0.07 (damp asphalt, not glass) // r6.1 B: puddles 0.03 -> 0.11 (lamp specular was a tiny over-bright hot spot)
`)
      .replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, max(paintF * 0.7, wet * pud)));
`)
      .replace('#include <emissivemap_fragment>', `
#include <emissivemap_fragment>
if (uReflOn > 0.5 && wet > 0.01) {
  vec4 rc = uReflMat * vec4(vRW, 1.0);
  vec2 ruv = rc.xy / rc.w + normal.xz * 0.02 * (1.0 - pud);
  // wet asphalt is not a mirror: smear the reflection along the view's vertical (classic streaky night reflections of
  // lamps, signals and neon), sharper in puddles
  float sm = mix(${CYBER ? '0.022' : '0.032'}, 0.006, pud);
  vec3 rcol = texture2D(tRefl, ruv).rgb * 0.28
    + (texture2D(tRefl, ruv + vec2(0.0, sm)).rgb + texture2D(tRefl, ruv - vec2(0.0, sm)).rgb) * 0.22
    + (texture2D(tRefl, ruv + vec2(0.0, sm * 2.6)).rgb + texture2D(tRefl, ruv - vec2(0.0, sm * 2.6)).rgb) * 0.14;
  rcol = min(rcol, vec3(12.0));
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
  totalEmissiveRadiance += rcol * wet * mix(${CYBER ? '0.16' : '0.08'}, ${CYBER ? '0.6' : '0.5'}, pud) * clamp(fres * 1.0 + 0.06, 0.0, 1.0);
}
`);
  });
}

export function simpleMats(T) {
  const side = texSet(T, 'sidewalk', 1); for (const t of [side.map, side.normalMap, side.roughnessMap]) t.repeat.set(1 / 3, 1 / 3);
  M.sidewalk = prep(new THREE.MeshStandardMaterial({ map: side.map, normalMap: side.normalMap, roughnessMap: side.roughnessMap, color: 0xffffff, roughness: 1 }), 'sidewalk', (s) => {
    s.uniforms.uWet = U.uWet;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, uWet);\ndiffuseColor.rgb *= mix(1.0, 0.6, uWet);\n{ vec2 g = abs(fract(vSWP.xz / 1.6) - 0.5); float j = smoothstep(0.485, 0.497, max(g.x, g.y)); diffuseColor.rgb *= 1.0 - j * 0.35; }')
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec3 vSWP;');
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWP;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSWP = (modelMatrix * vec4(position,1.0)).xyz;');
  });
  const pav = texSet(T, 'pavers', 1); for (const t of [pav.map, pav.normalMap, pav.roughnessMap]) t.repeat.set(1 / 2.5, 1 / 2.5);
  M.pavers = prep(new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, roughnessMap: pav.roughnessMap, color: 0xffffff, roughness: 1, ...(CYBER ? { polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -2 } : {}) }), 'pavers');
  const conc = texSet(T, 'concrete', 1); for (const t of [conc.map, conc.normalMap, conc.roughnessMap]) t.repeat.set(1 / 4, 1 / 4);
  M.concrete = prep(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.roughnessMap, color: 0xffffff, roughness: 1 }), 'concrete');
  const sand = texSet(T, 'sand', 1); for (const t of [sand.map, sand.normalMap, sand.roughnessMap]) t.repeat.set(1 / 6, 1 / 6);
  if (CYBER) {
  // v4.5: sand albedo 1.22 -> 0.98 (noon beach no longer glares), dune-scale tone variation, wind ripples (normal), a wrack line
  // of dark debris at the high-water mark, wet sand darker + glossier toward the sea
  M.sand = prep(new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normalMap, roughnessMap: sand.roughnessMap, color: new THREE.Color().setRGB(0.90, 0.86, 0.78), roughness: 1 }), 'sand', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSandW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSandW = (modelMatrix*vec4(position,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSandW;' + HASH)
      .replace('#include <map_fragment>', `#include <map_fragment>
float vSandY = vSandW.y; float wetS = smoothstep(-0.55, -0.9, vSandY);
float dune = vnoise(vSandW.xz * 0.025) * 0.6 + vnoise(vSandW.xz * 0.11) * 0.4;
diffuseColor.rgb *= mix(vec3(0.93, 0.90, 0.85), vec3(1.04, 1.0, 0.94), dune);
float wrack = smoothstep(0.12, 0.0, abs(vSandY + 0.42)) * smoothstep(0.45, 0.75, vnoise(vSandW.xz * vec2(0.6, 0.15)));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.19, 0.12), wrack * 0.55);
diffuseColor.rgb *= mix(1.0, 0.55, wetS);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float rp = sin(vSandW.x * 2.6 + vnoise(vSandW.xz * 0.3) * 6.0) * (1.0 - wetS) * 0.12; normal = normalize(normal + (viewMatrix * vec4(rp, 0.0, rp * 0.3, 0.0)).xyz); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, wetS);');
  });
  } else {
  M.sand = prep(new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normalMap, roughnessMap: sand.roughnessMap, color: new THREE.Color().setRGB(1.22, 1.18, 1.10), roughness: 1 }), 'sand', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSandY;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSandY = (modelMatrix*vec4(position,1.0)).y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSandY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat wetS = smoothstep(-0.55, -0.9, vSandY); diffuseColor.rgb *= mix(1.0, 0.55, wetS);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, wetS);');
  });
  }
  const grass = texSet(T, 'grass', 1); for (const t of [grass.map, grass.normalMap, grass.roughnessMap]) t.repeat.set(1 / 4, 1 / 4);
  // v4.5 lawns: a second texture scale + world-space macro noise (greener swales, sun-dried patches, worn earth) kills the tiling
  const lawn = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvLW = (modelMatrix*vec4(position,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;' + HASH).replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 t2 = texture2D(map, vMapUv * 0.27 + 0.43).rgb; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + t2 * 0.5, 0.5);
  float m = vnoise(vLW.xz * 0.013) * 0.6 + vnoise(vLW.xz * 0.06) * 0.3 + vnoise(vLW.xz * 0.31) * 0.1;
  diffuseColor.rgb *= mix(vec3(0.82, 0.95, 0.74), vec3(1.18, 1.08, 0.78), smoothstep(0.3, 0.75, m));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.30, 0.22), smoothstep(0.80, 0.9, vnoise(vLW.xz * 0.09 + 7.0)) * 0.3);${CYBER ? '' : `
  // vis-sweep (map A, GTA6 Florida look): St. Augustine lawns read olive / sun-bleached, not lime -> 25% desaturate, warmer
  { float gl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(gl), diffuseColor.rgb, 0.75) * vec3(1.03, 0.97, 0.88); }`} }`);
  };
  M.grass = prep(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, color: 0xffffff, roughness: 1 }), 'grass', lawn); // vis-sweep: lawn macro-variation on both maps (map A lawns were one flat tiled green, aerials showed the 4 m tile)
  // v4.4 land caps under the open world: pushed back in depth so district pavers / roads drawn just above never z-fight from the air
  const po = { polygonOffset: false }; // v4.5: was 3 / 12 -> at grazing distances the caps fell behind the water plane 1 m below (white 'shallows' instead of land)
  M.land = prep(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, color: new THREE.Color().setRGB(0.92, 0.95, 0.86), roughness: 1, ...po }), 'grass', lawn);
  M.landc = prep(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.roughnessMap, color: 0xffffff, roughness: 1, ...po }), 'concrete');
  // r5.0 mainland / pearl-island ground: sits 6 cm below the road ribbons (polygonOffset pushed it behind the water at grazing angles)
  // vis-sweep: the district ground showed as hectares of bare grey concrete between the lots (aerials looked unfinished) ->
  // world-space mix of worn concrete, gravel/dirt and patchy lawn (vacant lots / yards), macro tone so the 4 m tile never repeats
  M.mgroundC = prep(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.roughnessMap, color: 0xaaa69e, roughness: 1 }), 'mgc', (s) => {
    s.uniforms.tG = { value: grass.map };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvLW = (modelMatrix*vec4(position,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tG; varying vec3 vLW;' + HASH).replace('#include <map_fragment>', `#include <map_fragment>
{ float m = vnoise(vLW.xz * 0.017) * 0.65 + vnoise(vLW.xz * 0.08) * 0.25 + vnoise(vLW.xz * 0.5) * 0.1;
  vec3 g = texture2D(tG, vLW.xz * 0.25).rgb * mix(vec3(0.80, 0.92, 0.70), vec3(1.10, 1.02, 0.74), vnoise(vLW.xz * 0.05 + 3.0));
  vec3 dirt = vec3(0.33, 0.30, 0.25) * (0.85 + 0.3 * vnoise(vLW.xz * 0.7));
  diffuseColor.rgb *= 0.84 + 0.2 * vnoise(vLW.xz * 0.03 + 9.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, dirt, smoothstep(0.36, 0.46, m) * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, g, smoothstep(0.44, 0.56, m)); }`);
  });
  M.mgroundG = prep(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, color: 0xffffff, roughness: 1 }), 'mgg', lawn);
  M.pool = prep(new THREE.MeshStandardMaterial({ color: 0x2aa9bd, roughness: 0.06, metalness: 0.0, emissive: 0x0a3a44, emissiveIntensity: 0.6 }), 'pool');
  M.roof = prep(new THREE.MeshStandardMaterial({ map: conc.map, color: 0x9a948c, roughness: 0.95 }), 'roof');
  M.white = prep(new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.7, map: T.plaster_d }), 'whitep');
  M.metal = prep(new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.45, metalness: 0.85 }), 'metal');
  M.darkmetal = prep(new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 }), 'dmetal');
  M.glassRail = prep(new THREE.MeshStandardMaterial({ color: 0x8fb4b8, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.45 }), 'grail');
  M.neon = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, color: 0x222222 }), 'neon', (s) => {
    s.uniforms.uNight = U.uNight;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (0.25 + uNight * 5.0);');
  });
  // r6.1: building trims / piers / cornices / pylons (vertex-coloured relief geometry) were flat plastic next to the textured
  // walls -> tri-planar plaster (索拉纳港) / concrete (霓港) texture, macro colour noise, dirt at the foot, soot under ledges
  { const tpl = CYBER ? T.concrete_d : T.plaster_d; tpl.wrapS = tpl.wrapT = THREE.RepeatWrapping;
  M.vcol = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'vcol', (s) => {
    s.uniforms.tPl = { value: tpl };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVW; varying vec3 vVN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  { vec4 wq = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq;
  #endif
    vVW = (modelMatrix * wq).xyz; vVN = normalize(mat3(modelMatrix) * objectNormal); }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tPl; varying vec3 vVW; varying vec3 vVN;' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 bw = pow(abs(vVN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 tx = texture2D(tPl, vVW.zy * 0.25).rgb * bw.x + texture2D(tPl, vVW.xz * 0.25).rgb * bw.y + texture2D(tPl, vVW.xy * 0.25).rgb * bw.z;
    float cl = dot(vColor.rgb, vec3(0.299, 0.587, 0.114)); float k = smoothstep(0.18, 0.55, cl);
    float mac = vnoise(vVW.xz * 0.07 + vVW.y * 0.05) * 0.6 + vnoise(vVW.xy * 0.9 + vVW.zz * 0.7) * 0.4;
    diffuseColor.rgb *= mix(vec3(1.0), clamp(tx / ${CYBER ? '0.44' : '0.63'}, 0.6, 1.25), 0.55 * k) * (0.92 + 0.14 * mac);
    diffuseColor.rgb *= 1.0 - smoothstep(${CYBER ? '1.2' : '0.8'}, 0.0, vVW.y) * 0.22 * k;           // splash / dust at the foot
    diffuseColor.rgb *= 1.0 - smoothstep(-0.2, -0.9, vVN.y) * 0.18;                                    // soffits / undersides darker
  }`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= 0.9 + 0.2 * vnoise(vVW.xz * 2.1 + vVW.y);');
  }); }
  M.vcolCloth = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 'vcolc');
  M.bark = prep(new THREE.MeshStandardMaterial({ map: T.bark_d, color: 0xb0a490, roughness: 0.95 }), 'bark');
  T.bark_d.colorSpace = THREE.SRGBColorSpace; T.bark_d.wrapS = T.bark_d.wrapT = THREE.RepeatWrapping;
  return M;
}
