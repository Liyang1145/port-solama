// b_verify: test-only screenshot speed-up (URL ?shotfast, meant together with ?snap). Default game behaviour is untouched:
// without the flag nothing in this file runs.
// Why the first frame is slow in the sandbox: the renderer is SwiftShader (CPU), which JIT-compiles every pipeline on its first
// draw. JS-side load is ~10-20 s; the remaining 70-170 s of a "first frame" was the JIT, paid at canvas read-back (toDataURL waits
// for the GPU queue). The JIT cost is proportional to shader size, and three.js unrolls the point/spot light loop: with 19 point +
// 2 spot lights (street lamps, neon fill, muzzle flash, sirens, headlight, police spot) every lit fragment shader carried ~21 copies
// of the BRDF. ?shotfast keeps those loops as real loops — identical maths (the loadtime lane's rolledLights, which is a no-op here
// if that lane is merged and already patched the chunk).
import * as THREE from 'three';

export const SHOTFAST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('shotfast');

export function shotfastShaders() {
  if (!SHOTFAST) return false;
  const C = THREE.ShaderChunk; let s = C.lights_fragment_begin;
  if (s.includes('NUM_POINT_LIGHT_SHADOWS == 0 ||')) return true; // already rolled (loadtime lane)
  const p0 = s.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'), p1 = s.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');
  const p2 = s.indexOf('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )');
  if (p0 < 0 || p1 < 0 || p2 < 0) { console.warn('[shotfast] lights chunk layout changed, loops left unrolled'); return false; }
  const loop = (T, t, extra) => `#if ( NUM_${T}_LIGHTS > 0 ) && defined( RE_Direct ) && ( NUM_${T}_LIGHT_SHADOWS == 0 || !defined( USE_SHADOWMAP ) )${extra}
	${t[0].toUpperCase() + t.slice(1)}Light ${t}Light;
	for ( int i = 0; i < NUM_${T}_LIGHTS; i ++ ) {
		${t}Light = ${t}Lights[ i ];
		if ( ${t}Light.color.r + ${t}Light.color.g + ${t}Light.color.b <= 0.0 ) continue; // dark light adds exactly 0
		get${t[0].toUpperCase() + t.slice(1)}LightInfo( ${t}Light, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
#else
`;
  s = s.slice(0, p0) + loop('POINT', 'point', '') + s.slice(p0, p1) + '#endif\n\n' + loop('SPOT', 'spot', ' && ( NUM_SPOT_LIGHT_MAPS == 0 )') + s.slice(p1, p2) + '#endif\n\n' + s.slice(p2);
  C.lights_fragment_begin = s;
  return true;
}

// read-back helper for harnesses: forces the GPU queue to finish (1 px readPixels) and reports how long it took
export function shotfastFinish(renderer) {
  const gl = renderer.getContext(); const px = new Uint8Array(4); const t0 = performance.now();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return Math.round(performance.now() - t0);
}
