// Sky (HDRI-derived panoramas blended over the day), sun + CSM shadows, height fog, IBL.
import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';
import { CYBER } from './mapsel.js';

export const U = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uFogSunCol: { value: new THREE.Color(0, 0, 0) },
  uFogFalloff: { value: 0.01 },
  uNight: { value: 0 },
  uTime: { value: 0 },
  uWet: { value: 0 },
  // light2 volumetric sun shafts in the height fog (far-cascade shadow map marched along the view ray)
  uShMat: { value: new THREE.Matrix4() },
  uShaft: { value: new THREE.Vector4(0, 0, 0, 0) },
  // light2 wet-road lamp streaks: the 10 street lamps nearest the camera (xyz = lamp head, w = intensity) + their colours
  uLampP: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
  uLampC: { value: Array.from({ length: 10 }, () => new THREE.Color()) },
};

// ---- global height-fog patch for every built-in material -------------------------------
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
 varying vec3 vFogWP;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
 { vec4 fwp = vec4( transformed, 1.0 );
 #ifdef USE_INSTANCING
  fwp = instanceMatrix * fwp;
 #endif
  vFogWP = ( modelMatrix * fwp ).xyz; }
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
 uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogWP;
 uniform vec3 uSunDir; uniform vec3 uFogSunCol; uniform float uFogFalloff;
 vec3 applyHeightFog(vec3 col, vec3 wp){
   vec3 rd = wp - cameraPosition; float dist = length(rd); rd /= max(dist, 1e-3);
   float k = uFogFalloff; float amt;
   if (k > 1e-5) { float t = k * rd.y * dist; float f = abs(t) > 1e-4 ? (1.0 - exp(-t)) / t : 1.0;
     amt = 1.0 - exp(-fogDensity * dist * exp(-k * max(cameraPosition.y, 0.0)) * f); }
   else amt = 1.0 - exp(-fogDensity * dist);
   float cs = max(dot(rd, uSunDir), 0.0);
   float s = pow(cs, 14.0) * 0.45 + pow(cs, 60.0) * 0.35;   // v4.0: tighter Mie lobe, lower peak (backlit beach no longer whites out)
   vec3 fc = fogColor + uFogSunCol * s;
   vec3 r = mix(col, fc, clamp(amt, 0.0, 1.0) * mix(1.0, 0.82, cs * cs));
   ${CYBER ? '' : `// vis-sweep (map A): everything past 2.3 km fades into the sky's below-horizon sea colour, same as the water (water.js)
   // and the sky (skyFS) -> aerials no longer show the mainland ground slab / skyline ending in a hard line at the far plane
   { vec3 sea = mix(fogColor * vec3(0.55, 0.66, 0.78), fogColor, 0.5) + uFogSunCol * pow(cs, 7.0) * 0.4; r = mix(r, sea, smoothstep(2300.0, 4000.0, dist)); }`}
   return r;
 }
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 gl_FragColor.rgb = applyHeightFog(gl_FragColor.rgb, vFogWP);
#endif`;

const L2Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const L2_SOFT = !L2Q.has('nosoft'); // light2 bisect toggles: ?nosoft = stock PCF near cascade, ?noshaft = no volumetric shafts
// ---- light2: contact-hardening sun shadows (PCSS-style) for the near cascade. The shadow map is a hardware-compare
// (sampler2DShadow) texture, so the blocker search cannot read depths; instead each search tap is compared at two depth
// offsets (2 / 9 m nearer the sun) and a layer-cake integral estimates the mean receiver->blocker distance. Penumbra
// = sun cone (0.53 deg, widened ~2x for haze) x that distance: crisp where a pole meets the pavement, soft 20-40 cm edges
// for a hotel cornice shadow 15 m up. Fully lit pixels exit after the 6 plain taps.
THREE.ShaderChunk.shadowmap_pars_fragment += `
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
#define L2_SHADOWPARS
float getShadowSoft( sampler2DShadow sm, float bias, vec4 sc, float worldW ) {
  sc.xyz /= sc.w; sc.z += bias;
  if ( sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0 ) return 1.0;
  float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
  const float DR = 899.0;               // ortho shadow camera depth range (near 1, far 900) -> depth is linear in metres
  float sr = 0.42 / worldW;             // search radius 42 cm
  // light2 r2 (lighter for SwiftShader memory): 6 search taps, two depth layers (2 m / 9 m) x 6 taps, 8 filter taps = 26 taps
  float b0 = 0.0, b1 = 0.0, b2 = 0.0;
  for ( int i = 0; i < 6; i ++ ) b0 += 1.0 - texture( sm, vec3( sc.xy + vogelDiskSample( i, 6, phi ) * sr, sc.z ) );
  if ( b0 < 0.01 ) return 1.0;           // fully lit: 6 taps
  for ( int i = 0; i < 6; i ++ ) { vec2 t = sc.xy + vogelDiskSample( i, 6, phi ) * sr;
    b1 += 1.0 - texture( sm, vec3( t, sc.z - 2.0 / DR ) );
    b2 += 1.0 - texture( sm, vec3( t, sc.z - 9.0 / DR ) ); }
  float p1 = b1 / b0, p2 = b2 / b0;
  float dB = 1.0 + p1 * 4.5 + p2 * 9.0;  // E[receiver-blocker distance], m (layer-cake estimate)
  float rW = clamp( 0.004 + dB * 0.0115, 0.0, 0.40 );
  vec2 r = vec2( max( rW / worldW, 1.2 / ${4096}.0 ) );
  float s = 0.0;
  for ( int i = 0; i < 8; i ++ ) s += texture( sm, vec3( sc.xy + vogelDiskSample( i, 8, phi + 1.3 ) * r, sc.z ) );
  return s / 8.0;
}
#endif`;

// ---- v4.0 two-cascade sun shadows: directional light 0 = near cascade (sharp, ~1.5 cm texels), light 1 = far cascade
// (black light, shadow map only). Fragments blend near->far at the edge of the near map. ----
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
  `#if ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
   if ( directLight.visible && receiveShadow ) {
     vec3 c0 = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
     float e0 = max( abs( c0.x - 0.5 ), abs( c0.y - 0.5 ) );
     float kf = smoothstep( 0.40, 0.47, e0 );
     float sN = kf < 0.999 ? ${L2_SOFT ? 'mix( 1.0, getShadowSoft( directionalShadowMap[ 0 ], directionalLightShadow.shadowBias, vDirectionalShadowCoord[ 0 ], 64.0 ), directionalLightShadow.shadowIntensity )' : 'getShadow( directionalShadowMap[ 0 ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] )'} : 1.0;
     float sF = kf > 0.001 ? getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ) : 1.0;
     directLight.color *= mix( sN, sF, kf );
   }
  #elif ( UNROLLED_LOOP_INDEX == 0 )
   directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
  #endif`);

// ---- sky material ---------------------------------------------------------------------
const skyVS = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,0.0)).xyz); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFS = `
uniform sampler2D tA, tB; uniform float mixAB, skyScale, rotU, envMode, uNightK, uDeep, uHazeSky, uHazeAmt;
uniform vec3 uSunDir, uSunCol, fogC, fogSunC, groundC; uniform float fogD, fogK;
varying vec3 vDir;
#define PI 3.14159265
vec3 dec(sampler2D t, vec2 uv){ vec3 e = texture2D(t, uv).rgb; return exp2(e*6.0)-1.0; }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y,-1.0,1.0));
  float u = atan(d.z, d.x)/(2.0*PI) + 0.5 + rotU;
  float v = 1.0 - (PI*0.5 - max(el, -0.17))/(PI*100.0/180.0);
  vec2 uv = vec2(u, clamp(v, 0.002, 0.998));
  vec3 c = mix(dec(tA, uv), dec(tB, uv), mixAB) * skyScale;
  // stars at night
  if (uNightK > 0.0 && d.y > 0.0 && envMode < 0.5) { vec3 q = d*420.0; vec3 id = floor(q); float h = h21(id.xy+id.z*7.13);
    float st = step(0.9965, h) * (1.0 - smoothstep(0.0, 0.5, length(fract(q)-0.5))); c += vec3(0.8,0.85,1.0)*st*uNightK*(0.5+h21(id.yz)*2.0)*smoothstep(0.0,0.25,d.y); }
  float cs = dot(d, uSunDir);
  if (envMode < 0.5) {
    c += uSunCol * (smoothstep(0.99993, 0.99997, cs) * 22.0);  // sun disc (r6.1: 60 -> 22; the bloom of a 60x disc whited out backlit dunes/towers)
  }
  c += uSunCol * (pow(max(cs,0.0), 600.0)*1.0 + pow(max(cs,0.0), 60.0)*0.045);
  // horizon haze matching scene fog (distant ray through the same height fog)
  float dist = 2600.0; float t = fogK * max(d.y, 0.0) * dist; float f = t > 1e-4 ? (1.0-exp(-t))/t : 1.0;
  float amt = 1.0 - exp(-fogD * dist * f);
  vec3 fc = fogC + fogSunC * pow(max(cs,0.0), 7.0);
  // r6.1: the haze takes part of its colour from the sky behind it (no flat grey band above the horizon in aerials / golden hour)
  fc = mix(fc, c * (0.85 + 0.25 * max(cs, 0.0)), uHazeSky);
  // away from the sun the haze is a pale sky-blue, toward it warm (fogSunC) -> no flat grey band in aerials / at golden hour
  { float lf = dot(fc, vec3(0.2126, 0.7152, 0.0722)); fc = mix(fc, vec3(0.80, 0.90, 1.08) * lf, 0.35 * (1.0 - max(cs, 0.0)) * (1.0 - uNightK)); }
  c = mix(c, fc, clamp(amt,0.0,1.0) * uHazeAmt * (1.0 - 0.55*smoothstep(0.02, 0.35, d.y)));
  // v3.4: Florida-blue zenith — deepen + saturate blue sky pixels while keeping neutral clouds white
  if (envMode < 0.5 && d.y > 0.0) {
    float el2 = smoothstep(0.03, 0.55, d.y) * uDeep;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float blueK = clamp((c.b - c.r) / max(c.b, 1e-3) * 2.2, 0.0, 1.0);
    c = mix(vec3(lum), c, 1.0 + 0.55 * el2 * blueK);
    c *= mix(1.0, 0.78, el2 * blueK);
  }
  // r6.1: IBL lower hemisphere = sun + sky light bounced off the ground (warm sand / stucco on 索拉纳港, wet grey concrete on 霓港),
  // so shadowed walls, eyebrow soffits and the undersides of awnings get a warm fill instead of a flat blue-grey
  if (envMode > 0.5 && d.y < 0.0) c = mix(c, groundC, (1.0 - smoothstep(-0.15, 0.0, d.y)));
  // r6.1 view below the horizon beyond the far water edge (aerials): continue the sea into the haze instead of the panorama's ground
  if (envMode < 0.5 && d.y < 0.0) { vec3 sea = mix(fogC * vec3(0.55, 0.66, 0.78), fogC, 0.5) + fogSunC * pow(max(cs, 0.0), 7.0) * 0.4; c = mix(c, sea, (1.0 - smoothstep(-0.03, 0.0, d.y))); }
  // v4.5 cyberpunk city glow: magenta light pollution hugging the horizon, cyan higher up
${CYBER ? `if (uNightK > 0.0) { float yy = max(d.y, 0.0); c += uNightK * (vec3(0.50, 0.06, 0.40) * exp(-yy * 7.0) * 0.07 + vec3(0.04, 0.20, 0.30) * exp(-yy * 2.2) * 0.022); }` : ''}
  c = min(c, vec3(48.0)); // r6.1 cap so the sun never floods the bloom chain
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Time-of-day keyframes: hour -> look parameters
// sky: [texA, texB, mix, scale]; sun color (linear, before intensity), sunI, envI, fog color, fog density, exposure
const KEYS_GTA = [
  { h: 0.0, sky: ['dusk', 'dusk', 0, 0.012], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.016, 0.019, 0.032], fogSun: [0, 0, 0], fogD: 0.0006, exp: 1.0, night: 1 },
  { h: 5.2, sky: ['dusk', 'dusk', 0, 0.016], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.018, 0.021, 0.036], fogSun: [0, 0, 0], fogD: 0.0006, exp: 1.0, night: 1 },
  { h: 6.3, sky: ['dusk', 'sunset', 0.6, 0.45], sun: [1.0, 0.45, 0.22], sunI: 0.8, envI: 0.8, fog: [0.42, 0.36, 0.40], fogSun: [0.9, 0.45, 0.2], fogD: 0.0006, exp: 0.95, night: 0.3 },
  { h: 7.2, sky: ['golden', 'golden', 0, 0.9], sun: [1.0, 0.66, 0.40], sunI: 6.0, envI: 0.6, fog: [0.78, 0.72, 0.74], fogSun: [0.7, 0.4, 0.2], fogD: 0.00032, exp: 0.56, night: 0 },
  { h: 9.5, sky: ['day', 'day', 0, 1.0], sun: [1.0, 0.94, 0.86], sunI: 9.0, envI: 0.6, fog: [0.78, 0.90, 1.08], fogSun: [0.6, 0.5, 0.3], fogD: 0.00026, exp: 0.5, night: 0 },
  { h: 15.5, sky: ['day', 'day', 0, 1.0], sun: [1.0, 0.92, 0.80], sunI: 9.0, envI: 0.6, fog: [0.80, 0.90, 1.05], fogSun: [0.7, 0.55, 0.3], fogD: 0.00028, exp: 0.5, night: 0 },
  { h: 17.3, sky: ['golden', 'golden', 0, 1.0], sun: [1.0, 0.72, 0.44], sunI: 8.0, envI: 0.31, fog: [0.62, 0.66, 0.78], fogSun: [0.80, 0.46, 0.22], fogD: 0.00036, exp: 0.5, night: 0 }, // v4.4 higher sun:sky ratio + denser warm aerial perspective
  { h: 18.7, sky: ['golden', 'golden', 0, 1.0], sun: [1.0, 0.56, 0.26], sunI: 7.4, envI: 0.28, fog: [0.56, 0.56, 0.68], fogSun: [0.88, 0.42, 0.16], fogD: 0.00044, exp: 0.52, night: 0 } /* r6.1 cooler base haze + softer sun lobe: warm only toward the sun */,
  { h: 19.4, sky: ['sunset', 'sunset', 0, 0.9], sun: [1.0, 0.42, 0.22], sunI: 2.5, envI: 0.7, fog: [0.7, 0.48, 0.55], fogSun: [1.4, 0.55, 0.28], fogD: 0.0006, exp: 0.85, night: 0.2 },
  { h: 20.2, sky: ['sunset', 'dusk', 0.6, 0.35], sun: [0.8, 0.5, 0.5], sunI: 0.15, envI: 0.65, fog: [0.10, 0.08, 0.13], fogSun: [0.15, 0.06, 0.05], fogD: 0.0006, exp: 1.12, night: 0.75 },
  { h: 21.3, sky: ['dusk', 'dusk', 0, 0.014], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.016, 0.018, 0.030], fogSun: [0, 0, 0], fogD: 0.0006, exp: 0.95, night: 1 },
  { h: 24.0, sky: ['dusk', 'dusk', 0, 0.012], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.016, 0.019, 0.032], fogSun: [0, 0, 0], fogD: 0.0006, exp: 1.0, night: 1 },
];
// r6.0 map 霓港 (v4.5): violet night haze, slightly lower noon exposure
const KEYS_CYBER = [
  { h: 0.0, sky: ['dusk', 'dusk', 0, 0.012], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.034, 0.016, 0.050], fogSun: [0, 0, 0], fogD: 0.0009, exp: 1.0, night: 1 }, // v4.5 cyberpunk night: violet haze that the neon / beams light up
  { h: 5.2, sky: ['dusk', 'dusk', 0, 0.016], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.030, 0.018, 0.048], fogSun: [0, 0, 0], fogD: 0.0009, exp: 1.0, night: 1 },
  { h: 6.3, sky: ['dusk', 'sunset', 0.6, 0.45], sun: [1.0, 0.45, 0.22], sunI: 0.8, envI: 0.8, fog: [0.42, 0.36, 0.40], fogSun: [0.9, 0.45, 0.2], fogD: 0.0006, exp: 0.95, night: 0.3 },
  { h: 7.2, sky: ['golden', 'golden', 0, 0.9], sun: [1.0, 0.66, 0.40], sunI: 6.0, envI: 0.6, fog: [0.78, 0.72, 0.74], fogSun: [0.7, 0.4, 0.2], fogD: 0.00032, exp: 0.56, night: 0 },
  { h: 9.5, sky: ['day', 'day', 0, 1.0], sun: [1.0, 0.93, 0.83], sunI: 9.0, envI: 0.55, fog: [0.70, 0.82, 1.02], fogSun: [0.45, 0.38, 0.24], fogD: 0.00034, exp: 0.43, night: 0 }, // v4.5 deeper aerial perspective, slightly lower noon exposure (beach no longer glares)
  { h: 15.5, sky: ['day', 'day', 0, 1.0], sun: [1.0, 0.91, 0.78], sunI: 9.0, envI: 0.55, fog: [0.74, 0.83, 1.0], fogSun: [0.65, 0.5, 0.28], fogD: 0.00034, exp: 0.46, night: 0 },
  { h: 17.3, sky: ['golden', 'golden', 0, 1.0], sun: [1.0, 0.72, 0.44], sunI: 8.0, envI: 0.31, fog: [0.62, 0.66, 0.78], fogSun: [0.80, 0.46, 0.22], fogD: 0.00036, exp: 0.5, night: 0 }, // v4.4 higher sun:sky ratio + denser warm aerial perspective
  { h: 18.7, sky: ['golden', 'golden', 0, 1.0], sun: [1.0, 0.56, 0.26], sunI: 7.4, envI: 0.28, fog: [0.56, 0.56, 0.68], fogSun: [0.88, 0.42, 0.16], fogD: 0.00044, exp: 0.52, night: 0 } /* r6.1 cooler base haze + softer sun lobe: warm only toward the sun */,
  { h: 19.4, sky: ['sunset', 'sunset', 0, 0.9], sun: [1.0, 0.42, 0.22], sunI: 2.5, envI: 0.7, fog: [0.7, 0.48, 0.55], fogSun: [1.4, 0.55, 0.28], fogD: 0.0006, exp: 0.85, night: 0.2 },
  { h: 20.2, sky: ['sunset', 'dusk', 0.6, 0.35], sun: [0.8, 0.5, 0.5], sunI: 0.15, envI: 0.65, fog: [0.12, 0.06, 0.15], fogSun: [0.15, 0.06, 0.05], fogD: 0.0007, exp: 1.12, night: 0.75 },
  { h: 21.3, sky: ['dusk', 'dusk', 0, 0.014], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.034, 0.016, 0.050], fogSun: [0, 0, 0], fogD: 0.0009, exp: 0.95, night: 1 },
  { h: 24.0, sky: ['dusk', 'dusk', 0, 0.012], sun: [0.55, 0.62, 0.9], sunI: 0.05, envI: 0.3, fog: [0.034, 0.016, 0.050], fogSun: [0, 0, 0], fogD: 0.0009, exp: 1.0, night: 1 },
];
const KEYS = CYBER ? KEYS_CYBER : KEYS_GTA;
const TEX_SUN_U = 0.6; // azimuth of the sun in all three source panoramas

export class Env {
  constructor(renderer, scene, camera, tex) {
    this.r = renderer; this.scene = scene; this.camera = camera; this.tex = tex;
    for (const k in tex) { const t = tex[k]; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.NoColorSpace; }
    const mk = (envMode) => new THREE.ShaderMaterial({
      vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, depthTest: envMode < 0.5,
      uniforms: {
        tA: { value: tex.sunset }, tB: { value: tex.sunset }, mixAB: { value: 0 }, skyScale: { value: 1 }, rotU: { value: 0 }, envMode: { value: envMode },
        uNightK: { value: 0 }, uDeep: { value: 1 }, uSunDir: U.uSunDir, uSunCol: { value: new THREE.Color() }, fogC: { value: new THREE.Color() }, fogSunC: { value: new THREE.Color() },
        groundC: { value: new THREE.Color(0.13, 0.12, 0.11) }, fogD: { value: 0.001 }, fogK: { value: 0.01 }, uHazeSky: { value: 0.45 }, uHazeAmt: { value: 0.72 },
      },
    });
    this.skyMat = mk(0); this.envSkyMat = mk(1);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1;
    this.sky.onBeforeRender = (r, s, cam) => { this.sky.position.copy(cam.position); this.sky.scale.setScalar(cam.far * 0.95); this.sky.updateMatrixWorld(); };
    scene.add(this.sky);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.envSkyMat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.fog = new THREE.FogExp2(0xffffff, 0.001);

    // sun: one directional light whose 4k shadow frustum follows the camera (texel-snapped to avoid shimmer)
    const Q = new URLSearchParams(location.search);
    const mk2 = (S, size, color) => { const l = new THREE.DirectionalLight(color, 3); l.castShadow = true; l.shadow.mapSize.set(size, size);
      Object.assign(l.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 900 }); l.shadow.camera.updateProjectionMatrix(); scene.add(l); scene.add(l.target); return l; };
    // near cascade: 4096 over 64 m (1.6 cm texels) -> crisp contact; far cascade: 4096 over 360 m for the whole district
    const sun = mk2(this.shadowSizeN = 32, 4096, 0xffffff);
    sun.shadow.bias = -0.00018; sun.shadow.normalBias = 0.01; // vis-sweep: 0.02 normal bias peter-panned a lit 1–3 px dashed sliver along every wall base on the shadow side sun.shadow.radius = 1.6;
    const far = mk2(this.shadowSize = 180, Q.has('lowshadow') ? 2048 : 4096, 0x000000);
    far.shadow.bias = -0.0003; far.shadow.normalBias = 0.06; far.shadow.radius = 2.5; far.intensity = 0;
    this.sun = sun; this.sunFar = far; U.uShMat.value = far.shadow.matrix; // same object: three rewrites it every shadow pass
    this.lightDir = new THREE.Vector3(0, -1, 0);
    this.csm = { lights: [sun], lightDirection: this.lightDir, setupMaterial() {}, update: () => this.updateShadowFrustum() };
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x332822, 0); scene.add(this.hemi);
    this.hour = -1; this.lastEnvHour = -99; this.look = {};
    // r6.1 natural-light tunables (window.__G.env.tune; lab plans tweak them live)
    this.tune = CYBER ? { albedo: 0.2, bounce: 1.0, groundTint: [0.86, 0.88, 0.92], nightGround: new THREE.Color(0.15, 0.10, 0.19), hazeSky: 0.4, hazeAmt: 0.75, shaft: 1.0 }
      : { albedo: 0.26, bounce: 1.0, groundTint: [1.0, 0.86, 0.68], nightGround: new THREE.Color(0.11, 0.075, 0.045), hazeSky: 0.45, hazeAmt: 0.72, shaft: 1.0 };
  }
  sample(h) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const t = smooth(0, 1, (h - a.h) / Math.max(1e-3, b.h - a.h));
    const L = (x, y) => lerp(x, y, t), L3 = (x, y) => [L(x[0], y[0]), L(x[1], y[1]), L(x[2], y[2])];
    return { a, b, t, sun: L3(a.sun, b.sun), sunI: L(a.sunI, b.sunI), envI: L(a.envI, b.envI), fog: L3(a.fog, b.fog), fogSun: L3(a.fogSun, b.fogSun), fogD: L(a.fogD, b.fogD), exp: L(a.exp, b.exp), night: L(a.night, b.night) };
  }
  sunDirection(h, out = new THREE.Vector3()) {
    // sunrise 6.4 over the ocean (east, +x), sunset 19.6 over the bay (west, -x); arc tilted to the south (+z)
    const day = (h - 6.6) / 13.2; // 0..1
    const ang = day * Math.PI; // 0 east .. PI west
    let el = Math.sin(Math.PI * clamp(day, 0, 1)) * 68 * Math.PI / 180;
    if (day < 0 || day > 1) el = -0.25;
    const az = ang; // in xz plane
    const x = -Math.cos(az), z = Math.sin(az) * 0.55 + 0.25;
    out.set(x * Math.cos(el), Math.sin(el), z * Math.cos(el)).normalize();
    if (h > 19.0 && h < 21) { // keep a low sun direction for the afterglow
      out.y = Math.max(out.y, 0.02);
    }
    return out.normalize();
  }
  setHour(h, force = false) {
    h = ((h % 24) + 24) % 24;
    this.hour = h;
    const L = this.sample(h); this.look = L;
    const sd = this.sunDirection(h, U.uSunDir.value);
    // panoramas: rotate so their sun sits at our sun azimuth
    const uw = Math.atan2(sd.z, sd.x) / (2 * Math.PI) + 0.5;
    const night = L.night; U.uNight.value = night;
    const sunUp = smooth(-0.02, 0.06, sd.y);
    const moon = h < 6 || h > 20;
    const sunCol = new THREE.Color(L.sun[0], L.sun[1], L.sun[2]);
    U.uSunCol.value.copy(sunCol).multiplyScalar(L.sunI);
    for (const m of [this.skyMat, this.envSkyMat]) {
      const u = m.uniforms;
      const tA = this.tex[L.a.sky[0]], tB = this.tex[L.a.sky[1]], tC = this.tex[L.b.sky[0]], tD = this.tex[L.b.sky[1]];
      // blend between keyframes: collapse to two textures
      const mixA = L.a.sky[2], mixB = L.b.sky[2];
      const wB1 = lerp(mixA * (tB === tA ? 0 : 1), 0, L.t);
      // weights per texture
      const w = new Map();
      const addw = (t, v) => w.set(t, (w.get(t) || 0) + v);
      addw(tA, (1 - L.t) * (1 - mixA)); addw(tB, (1 - L.t) * mixA); addw(tC, L.t * (1 - mixB)); addw(tD, L.t * mixB);
      const arr = [...w.entries()].sort((p, q) => q[1] - p[1]);
      u.tA.value = arr[0][0]; u.tB.value = arr[1] ? arr[1][0] : arr[0][0];
      u.mixAB.value = arr[1] ? arr[1][1] / (arr[0][1] + arr[1][1]) : 0;
      u.skyScale.value = lerp(L.a.sky[3], L.b.sky[3], L.t);
      u.rotU.value = TEX_SUN_U - uw;
      u.uNightK.value = night; u.uDeep.value = 1 - night;
      u.uSunCol.value.copy(sunCol).multiplyScalar(L.sunI * sunUp * 1.0);
      u.fogC.value.setRGB(L.fog[0], L.fog[1], L.fog[2]);
      u.fogSunC.value.setRGB(L.fogSun[0], L.fogSun[1], L.fogSun[2]);
      u.fogD.value = L.fogD * 0.5; u.fogK.value = 0.004;
      void wB1;
    }
    // r6.1 ground bounce for the IBL (radiance units of the env sky, which is scaled by envIntensity afterwards):
    //   L_bounce = albedo * (E_sun + E_sky) / pi ;  E_sun = sunI * max(sun.y, 0), E_sky ~ pi * L_sky (fog colour as a proxy)
    { const T = this.tune; const A = T.albedo; const tint = T.groundTint; const eSun = L.sunI * sunUp * Math.max(sd.y, 0);
      const k = A * eSun / (Math.PI * Math.max(L.envI, 0.05)) * T.bounce;
      const g = this.envSkyMat.uniforms.groundC.value;
      g.setRGB(tint[0] * (sunCol.r * k + A * L.fog[0] * 0.9), tint[1] * (sunCol.g * k + A * L.fog[1] * 0.9), tint[2] * (sunCol.b * k + A * L.fog[2] * 0.9));
      if (night > 0.5) g.lerp(T.nightGround, smooth(0.5, 1.0, night)); // street-lit ground at night (sodium on 索拉纳港, neon spill on 霓港)
      for (const m of [this.skyMat, this.envSkyMat]) { m.uniforms.uHazeSky.value = T.hazeSky; m.uniforms.uHazeAmt.value = T.hazeAmt; } }
    this.scene.fog.color.setRGB(L.fog[0], L.fog[1], L.fog[2]);
    this.scene.fog.density = L.fogD;
    U.uFogSunCol.value.setRGB(L.fogSun[0], L.fogSun[1], L.fogSun[2]);
    U.uFogFalloff.value = 0.012;
    { const gold = smooth(0.55, 0.06, sd.y) * (1 - night) * sunUp; // light2 shafts: strong at golden hour (A/B: x3 golden weight reads as warm aerial haze, no clipping), faint by day, none at night
      U.uShaft.value.set(sunCol.r * L.sunI, sunCol.g * L.sunI, sunCol.b * L.sunI, (0.12 + 2.6 * gold) * (1 - night) * sunUp * this.tune.shaft * (L2Q.has('noshaft') ? 0 : 1)); }
    // directional light: sun by day, moon by night
    const ld = sd.clone();
    let li = L.sunI * sunUp;
    const lc = sunCol.clone();
    if (moon) { ld.set(0.3, 0.8, -0.4).normalize(); li = 0.12; lc.setRGB(0.55, 0.65, 1.0); }
    this.csm.lightDirection.copy(ld).negate();
    for (const l of this.csm.lights) { l.intensity = li; l.color.copy(lc); }
    this.sunFar.intensity = 0;
    if (CYBER) { this.hemi.color.setHex(0x526b94); this.hemi.groundColor.setHex(0x522a4e); this.hemi.intensity = 0.16 * night; } // lift crushed ACES night shadow floor without washing out neon contrast
    this.exposure = L.exp * (CYBER ? 1 : lerp(1.25, 1.1, night)); // r6.1 PBR-Neutral needs ~25% more exposure than ACES for the same mid-grey
    this.envIntensity = L.envI;
    if (force || Math.abs(h - this.lastEnvHour) > 0.08) this.updateEnv();
  }
  updateEnv() {
    this.lastEnvHour = this.hour;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 1000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.envIntensity;
  }
  updateShadowFrustum() { this.fitShadow(this.sun, this.shadowSizeN, 0.6); this.fitShadow(this.sunFar, this.shadowSize, 0.55); }
  fitShadow(light, size, ahead) {
    const cam = this.camera; cam.updateMatrixWorld();
    // centre the shadow box ~60% of its size ahead of the camera on the ground
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const c = cam.position.clone().addScaledVector(f, size * ahead); c.y = 0;
    // snap to shadow texels in light space
    const L = this.lightDir.clone().normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), L, Math.abs(L.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
    const inv = m.clone().invert(); const lc = c.clone().applyMatrix4(inv);
    const tex = size * 2 / light.shadow.mapSize.x; lc.x = Math.round(lc.x / tex) * tex; lc.y = Math.round(lc.y / tex) * tex;
    c.copy(lc.applyMatrix4(m));
    light.target.position.copy(c); light.position.copy(c).addScaledVector(L, -450);
    light.target.updateMatrixWorld(); light.updateMatrixWorld();
  }
  update(dt) {
    this.csm.update();
  }
}
