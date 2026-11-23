// loadtime: start-up shader cost (user report: ~20 min to load on a Windows PC; ANGLE -> D3D11/HLSL compiles each program serially)
// 1) rolledLights(): three unrolls the point/spot light loop into one copy of the whole BRDF per light. With 19 point + 2 spot lights
//    (street lamps, neon fill, muzzle flash, sirens, headlight) every lit program carried ~21 BRDF copies -> huge HLSL, minutes per
//    program on D3D. None of those lights casts shadows, so the loop can stay a real loop: identical maths, a fraction of the code.
// 2) precompile(): compile every material of the whole scene (hidden LOD/stream objects too) with renderer.compileAsync before the
//    first frame, so KHR_parallel_shader_compile can spread the work over the GPU process' worker threads while the load bar moves.
import * as THREE from 'three';

let patched = false;
export function rolledLights() {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk; let s = C.lights_fragment_begin;
  // point lights: when no point light casts a shadow (always true here), a plain loop instead of the unrolled one
  const p0 = s.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'), p1 = s.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');
  const p2 = s.indexOf('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )');
  if (p0 < 0 || p1 < 0 || p2 < 0) { console.warn('[loadtime] lights chunk layout changed, loops left unrolled'); return; }
  const pointOrig = s.slice(p0, p1), spotOrig = s.slice(p1, p2);
  const pointRolled = `#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct ) && ( NUM_POINT_LIGHT_SHADOWS == 0 || !defined( USE_SHADOWMAP ) )
	PointLight pointLight;
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		if ( pointLight.color.r + pointLight.color.g + pointLight.color.b <= 0.0 ) continue; // dark (day lamps / idle flash): adds exactly 0
		getPointLightInfo( pointLight, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
#else
`;
  const spotRolled = `#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct ) && ( NUM_SPOT_LIGHT_MAPS == 0 ) && ( NUM_SPOT_LIGHT_SHADOWS == 0 || !defined( USE_SHADOWMAP ) )
	SpotLight spotLight;
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		if ( spotLight.color.r + spotLight.color.g + spotLight.color.b <= 0.0 ) continue;
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
#else
`;
  // original blocks are kept verbatim in the #else branch (they are themselves #if ... #endif)
  s = s.slice(0, p0) + pointRolled + pointOrig + '#endif\n\n' + spotRolled + spotOrig + '#endif\n\n' + s.slice(p2);
  C.lights_fragment_begin = s;
}

// compile the scene's materials without blocking: resolves when the driver reports every program linked. onProgress(done, total)
// drives the load bar. rt: the render target the scene is really drawn into (post chain) -> the same program variant (no tone
// mapping / linear output) as the real frames; compiling against the canvas made a second, never-used set. all: also objects that
// are hidden right now (far LOD, streamed chunks, night-only props) so they do not stall the game when they first appear.
export async function precompile(renderer, scene, camera, { onProgress = null, rt = null, all = false, budgetMs = 0 } = {}) {
  const hidden = [];
  if (all) scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
  const keep = renderer.getRenderTarget(); let mats;
  try { renderer.setRenderTarget(rt); mats = renderer.compile(scene, camera, scene); } finally { renderer.setRenderTarget(keep); for (const o of hidden) o.visible = false; }
  const props = renderer.properties; const total = mats.size; const t0 = performance.now();
  const ext = renderer.extensions.get('KHR_parallel_shader_compile');
  await new Promise((resolve) => {
    const check = () => {
      // isReady() polls COMPLETION_STATUS when the extension exists (non-blocking); without it each query links synchronously,
      // so then one program per tick keeps the load bar moving
      for (const m of mats) { const pr = props.get(m).currentProgram; if (pr === undefined || pr.isReady()) mats.delete(m); if (!ext) break; }
      if (onProgress) onProgress(total - mats.size, total);
      if (mats.size === 0 || (budgetMs && performance.now() - t0 > budgetMs)) { resolve(); return; }
      setTimeout(check, ext ? 16 : 0);
    };
    check();
  });
  return { materials: total, programs: renderer.info.programs.length, ms: Math.round(performance.now() - t0), parallel: !!ext };
}
