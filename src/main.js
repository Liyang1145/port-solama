// PORT SOLANA — entry: renderer, asset loading, world assembly, main loop, test hooks (window.__G)
import * as THREE from 'three';
import { envInstall } from './envprog.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Env, U } from './env.js';
import { setCSM, buildingMaterial, roadMaterial, simpleMats, M } from './mats.js';
import { buildCity } from './city.js';
import { buildVegetation } from './veg.js';
import { buildWater } from './water.js';
import { buildPromenade } from './maps/gta/promenade.js';
import { buildSignage } from './maps/gta/signage.js';
import { buildBacklot } from './maps/gta/backlot.js';
import { applyColliderFits } from './maps/gta/colfix.js';
import { applyCurbColliders } from './maps/gta/curbfix.js';
import { attachStreetColliders } from './maps/gta/edgewalls.js'; import { attachHouseColliders, KIT_LAYER } from './maps/gta/houses.js'; import { attachStripColliders } from './maps/gta/strip.js'; // a_edgewalls / a_strip
import { fixCityProps } from './maps/gta/propfix.js';
import { fixStreetParking, attachParkedColliders } from './maps/gta/parkfix.js';
import { buildProps, updateProps, updateLampLights, updateNeonLights, buildFurniture } from './props.js';
import { buildPost } from './post.js';
import { Game } from './game.js';
import { addStreetTrees, buildStreet, buildShopSigns } from './street.js';
import { CAST, charLodReady } from './people.js';
import { setCarEnv } from './vehicles.js';
import { CYBER, MAP } from './mapsel.js';
import { POI, MISSION_STARTS } from './mapdata.js';
// r6.0 map 霓港 (cyberpunk): streamed districts, wild nature, neon night (src/maps/cyber/)
import { Stream } from './maps/cyber/stream.js';
import { rolledLights, precompile } from './loadfast.js';
import { bedTexture } from './maps/cyber/region.js';
import { buildNature } from './maps/cyber/nature.js';
import { buildNeon } from './maps/cyber/neon.js';
import { SHOTFAST, shotfastShaders, shotfastFinish } from './shotfast.js'; // b_verify: test-only ?shotfast (screenshot first frame)

// loadtime: staged boot timing (ms since navigation start) -> window.__LT, shown on the load screen and in the console
const LT = window.__LT = { marks: [], t: {} };
let ltPrev = performance.now();
function mark(name) { const n = performance.now(); LT.marks.push([name, Math.round(n - ltPrev), Math.round(n)]); LT.t[name] = Math.round(n - ltPrev); ltPrev = n; }
mark('html+bundle');
const Q = new URLSearchParams(location.search);
const SNAP = Q.has('snap');
if (SHOTFAST) window.__SF = shotfastShaders();
if (SNAP) document.body.classList.add('snap');
if (!Q.has('unrolled')) rolledLights(); // loadtime: lit shaders keep a real light loop (A/B: ?unrolled)
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: SNAP });
envInstall(renderer); // b_envprog: merged environment shader programs (?oldenvmat: off)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.has('dpr') ? +Q.get('dpr') : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
// r6.1: 索拉纳港 uses the Khronos PBR-Neutral curve (hue-true, no ACES over-saturated sky / clipped sidewalks); 霓港 keeps ACES for neon punch
renderer.toneMapping = Q.get('tm') === 'agx' ? THREE.AgXToneMapping : Q.get('tm') === 'neutral' ? THREE.NeutralToneMapping : Q.get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : CYBER ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 4200);

const lbar = document.querySelector('#lbar i');
const texList = ['sky_day.jpg', 'sky_golden.jpg', 'sky_sunset.jpg', 'sky_dusk.jpg', 'asphalt_d.jpg', 'asphalt_n.jpg', 'asphalt_arm.jpg', 'pavers_d.jpg', 'pavers_n.jpg', 'pavers_arm.jpg', 'plaster_d.jpg', 'plaster_n.jpg', 'plaster_arm.jpg',
  'concrete_d.jpg', 'concrete_n.jpg', 'concrete_arm.jpg', 'sand_d.jpg', 'sand_n.jpg', 'sand_arm.jpg', 'grass_d.jpg', 'grass_n.jpg', 'grass_arm.jpg', 'sidewalk_d.jpg', 'sidewalk_n.jpg', 'sidewalk_arm.jpg',
  'frond.png', 'leafcluster.png', 'bark_d.jpg', 'waternormals.jpg'];
// asset path: single-file builds (tools/single.cjs) embed every asset as a data: URI in window.__A
const AP = (f) => (window.__A && window.__A[f]) || 'assets/' + f;
const glbList = { car: 'car_sport.glb', carLod: 'car_sport_lod.glb', ph_hydrant: 'ph_hydrant.glb', ph_bin: 'ph_bin.glb', ph_cafe: 'ph_cafe.glb' };
for (const k in CAST) glbList['ch_' + k] = CAST[k].file;

async function load() {
  const T = {}; let done = 0; const total = texList.length + Object.keys(glbList).length;
  const tick = () => { done++; lbar.style.width = (100 * done / total) + '%'; };
  const tl = new THREE.TextureLoader();
  // publishing hosts may keep assets/ or flatten every file next to index.html: try assets/ first, then the bare name
  const loadTex = (f) => new Promise((res, rej) => tl.load(AP(f), res, undefined, () => (window.__A && window.__A[f]) ? rej(new Error(f)) : tl.load(f, res, undefined, () => rej(new Error('missing ' + f)))));
  await Promise.all(texList.map((f) => loadTex(f).then((t) => { T[f.replace(/\.(jpg|png)$/, '')] = t; tick(); })));
  mark('textures');
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const G = {};
  await Promise.all(Object.entries(glbList).map(([k, f]) => gl.loadAsync(AP(f)).catch(() => gl.loadAsync(f)).then((g) => { G[k] = g; tick(); })));
  mark('glb');
  try { await document.fonts.load('40px Anton'); } catch (e) { }
  return { T, G };
}

(async function boot() {
  const { T, G } = await load();
  await charLodReady; mark('font+simplifier');
  const env = new Env(renderer, scene, camera, { day: T.sky_day, golden: T.sky_golden, sunset: T.sky_sunset, dusk: T.sky_dusk });
  setCSM(env.csm, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  simpleMats(T);
  const water = buildWater(scene, T, SNAP ? 0.5 : 0.5);
  if (Q.has('nowater')) water.mesh.visible = false;
  M.building = buildingMaterial(T);
  M.road = roadMaterial(T, water.shared);
  mark('env+mats+water');
  const city = buildCity(scene, M, T); mark('buildCity');
  const meshes = city.world.build(scene, M, { neon: { cast: false }, road: { cast: false }, sidewalk: { cast: false }, pavers: { cast: false }, grass: { cast: false }, land: { cast: false }, landc: { cast: false }, sand: { cast: false }, glassRail: { cast: false } });
  let stream = null, nature = null, neon = null;
  if (CYBER) { water.setBed(bedTexture(city.bedH)); stream = new Stream(scene, M, city.parcels); city.stream = stream; }
  mark('world.build+stream');
  addStreetTrees(city);
  if (!CYBER) city.propFix = fixCityProps(city); // a_canaledge: lamps / palms / trees / shrubs standing in the water moved to land or dropped (after placement, RNG untouched)
  if (!CYBER) city.region.attach(scene, M); // r5.0: far LOD of the mainland buildings now; detailed chunks stream in renderFrame
  const veg = buildVegetation(scene, city, T);
  if (CYBER) nature = buildNature(scene, city, T, city.wild);
  mark('trees+region+veg+nature');
  const props = buildProps(scene, city, T);
  buildFurniture(scene, city, G);
  const street = buildStreet(scene, city); const shopSigns = buildShopSigns(scene, city);
  const prom = CYBER ? null : buildPromenade(scene, city); // a_promenade: map 索拉纳港 street-level detail (instanced, streamed)
  const sign = CYBER ? null : buildSignage(scene, city); // a_signage: bus stops, road text, street-name posts, guide gantries (instanced, streamed)
  const blot = CYBER ? null : buildBacklot(scene, city); // a_backlot: service lanes / back yards behind the inner-block rows (instanced, streamed)
  if (!CYBER) city.parkFix = fixStreetParking(city); // a_parking: 海潮大道 kerb-lane slots: face the lane's traffic, clear of crosswalks / signals / hydrants / bus stops (after every layer)
  if (!CYBER) city.curbCol = applyCurbColliders(city); // a_curbalign: boxes of the houses moved / yard walls cut off the streets (after every layer is placed)
  if (!CYBER) applyColliderFits(city); // a_lane8fix: swap oversized / misplaced / orphan colliders for their visible footprint (after every layer is placed)
  if (!CYBER) city.edgeCol = attachStreetColliders(city); // a_edgewalls: fabric street-light / street-tree trunks (own fine grid) + fitted boxes for the island kerb clutter that had none (after every layer)
  if (!CYBER) { city.houseCol = attachHouseColliders(city); city.stripCol = attachStripColliders(city); if (city.region.fabric && (city.region.fabric.houseKit || city.region.fabric.stripKit)) { camera.layers.enable(KIT_LAYER); env.sunFar.shadow.camera.layers.enable(30); } } // a_houses: kit boxes (lazy per house cell) + the shadow kit is skipped by the far cascade
  if (!CYBER) city.parkCol = attachParkedColliders(city); // a_parkcol: oriented boxes for the ~23k mainland parked cars (own fine grid, appended to col.query)
  if (CYBER) neon = buildNeon(scene, city);
  mark('props+furniture+street+neon');
  const post = buildPost(renderer, scene, camera, { ao: Q.get('ao') !== '0' });
  post.shaftLight = env.sunFar; post.shaft = U.uShaft.value; // light2 volumetric sun shafts (far cascade)

  // v3.4 reflection probe: a cube capture of the city from over the bay, used as the env map of the building material so
  // tower glass reflects the skyline / island / water instead of only the sky (GTA6_REFERENCE §4 reflections). Refreshed with the sky.
  const probe = { rt: new THREE.WebGLCubeRenderTarget(Q.has('snap') ? 128 : 256, { type: THREE.HalfFloatType }), pm: new THREE.PMREMGenerator(renderer), tex: null, hour: -99 };
  probe.cam = new THREE.CubeCamera(2, 3600, probe.rt); probe.cam.position.set(-420, 38, -30); scene.add(probe.cam);
  probe.update = () => {
    if (Q.get('probe') === '0') return;
    const envKeep = scene.environment; probe.cam.update(renderer, scene);
    const t = probe.pm.fromCubemap(probe.rt.texture); if (probe.tex) probe.tex.dispose(); probe.tex = t;
    M.building.envMap = t.texture; M.building.envMapIntensity = 1.0; M.building.needsUpdate = true; scene.environment = envKeep;
  };
  // v4.0 street probe: a low cube capture near the camera (every ~2 s of game time, or on demand) -> car paint / glass / chrome
  // reflect the real street (palms, hotels, neon at night) instead of only the sky.
  const sprobe = { rt: new THREE.WebGLCubeRenderTarget(SNAP ? 128 : 128, { type: THREE.HalfFloatType }), pm: probe.pm, tex: null, t: 99, pos: new THREE.Vector3(1e9, 0, 0) };
  sprobe.cam = new THREE.CubeCamera(0.5, 900, sprobe.rt); scene.add(sprobe.cam);
  sprobe.update = (force) => {
    if (Q.get('probe') === '0') return;
    const p = camera.position; if (!force && sprobe.t < 2 && sprobe.pos.distanceTo(p) < 25) return;
    sprobe.t = 0; sprobe.pos.copy(p); sprobe.cam.position.set(p.x, 2.2, p.z);
    const pl = window.__G && window.__G.game ? window.__G.game.player?.root : null; const vis = pl ? pl.visible : null; if (pl) pl.visible = false;
    sprobe.cam.update(renderer, scene); if (pl) pl.visible = vis;
    const t = sprobe.pm.fromCubemap(sprobe.rt.texture); if (sprobe.tex) sprobe.tex.dispose(); sprobe.tex = t; setCarEnv(t.texture, 1.0);
  };
  mark('post+probes');
  const game = new Game({ renderer, scene, camera, env, city, G, T, props, Q, SNAP });
  let hour = Q.has('hour') ? +Q.get('hour') : CYBER ? 21.6 : 18.3; // r6.0: 霓港 opens at night
  env.setHour(hour, true); mark('game');
  const lp = document.querySelector('#load p'); const lp0 = lp ? lp.innerHTML : '';
  const pre = (all) => precompile(renderer, scene, camera, { rt: post.composer.renderTarget1, all, onProgress: (d, n) => { lbar.style.width = (100 * d / Math.max(1, n)) + '%'; if (lp) lp.innerHTML = '正在准备画面 ' + d + ' / ' + n; } });
  if (!Q.has('noprecompile')) { LT.precompile = await pre(false); mark('precompile'); } // loadtime: what the first frames draw, in parallel
  probe.update(); probe.hour = hour; mark('probe(first compile)');
  if (!Q.has('noprecompile')) { LT.precompile2 = await pre(false); if (lp) lp.innerHTML = lp0; mark('precompile(envmap variants)'); }

  const W = window.__G = {
    game, env, city, street, scene, camera, renderer, post, U, water, sprobe, map: MAP, poi: POI, missionStarts: MISSION_STARTS, stream, nature, neon,
    streamSync(x, z) { if (!stream) return 0; const p = x === undefined ? camera.position : { x, z }; return stream.sync(p); },
    setHour(h) { hour = h; env.setHour(h, true); probe.hour = h; probe.update(); sprobe.t = 99; },
    photo(on = true, focus = 0, ap = 1.2) { post.dof = on ? 1 : 0; post.focus = focus || 6; post.aperture = ap; document.body.classList.toggle('photo', !!on); },
    get hour() { return hour; },
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt, true); return game.state(); },
    render() { renderFrame(0); },
    finish() { return shotfastFinish(renderer); }, // b_verify: ms until the GPU queue (SwiftShader pipeline JIT) is done
    reset() { game.testReset(); if (Q.has('hour')) { this.setHour(+Q.get('hour')); } return game.state(); }, // r6.2 per-test isolation (shot.cjs)
    // vis-sweep debug: what is under screen pixel (px,py) of a w×h frame -> [{name, path, mat, dist, point, instanceId}]
    pick(px, py, w = 1280, h = 720, n = 3) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px / w * 2 - 1, 1 - py / h * 2), camera);
      return rc.intersectObjects(scene.children, true).filter((i) => i.object.visible && i.object.material && !i.object.material.isShaderMaterial || i.object.name).slice(0, n).map((i) => { const pth = []; for (let o = i.object; o && pth.length < 5; o = o.parent) pth.push(o.name || o.type);
        const m = Array.isArray(i.object.material) ? i.object.material[0] : i.object.material; return { path: pth.join('<'), mat: m && (m.name || m.type), color: m && m.color && m.color.getHexString(), dist: +i.distance.toFixed(1), point: i.point.toArray().map((v) => +v.toFixed(2)), inst: i.instanceId, tris: i.object.geometry && i.object.geometry.index ? i.object.geometry.index.count / 3 : 0 }; }); },
    stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, meshes: meshes.length, ...(CYBER ? { stream: stream.tris() } : { chunks: { ...city.region.stats } }) }; },
  };

  const clock = new THREE.Timer(); clock.connect?.(document);
  function frame(dt, noRender = false) {
    if (game.paused) { if (!noRender) renderFrame(0); return; }
    post.storePrev();
    U.uTime.value += dt; sprobe.t += dt;
    if (!SNAP || W.timeFlow) { hour += dt * game.timeScale / 3600; if (hour >= 24) hour -= 24; }
    if (Math.abs(env.hour - hour) > 0.002) env.setHour(hour);
    if (Math.abs(probe.hour - hour) > 0.75 && Math.abs(probe.hour - hour) < 23.25) { probe.hour = hour; probe.update(); }
    U.uWet.value = THREE.MathUtils.smoothstep(env.look.night, 0.3, 0.8) * 0.9;
    game.update(dt);
    if (!noRender) renderFrame(dt);
  }
  function renderFrame(dt) {
    if (CYBER) { stream.update(camera.position, 1); if (SNAP) stream.sync(camera.position); } // 霓港: detailed chunks before the mirror pass (wet-road / sea reflections)
    env.update(dt);
    water.update(scene);
    camera.updateMatrixWorld(); water.renderRefl(renderer, scene, camera);
    if (!CYBER) city.region.update(camera.position, SNAP ? 99 : 1);
    veg.update?.(camera.position);
    if (CYBER) { nature.update(camera.position); nature.frame(env, scene); neon.update(env.look.night, U.uTime.value); scene.fog.density = env.look.fogD * nature.fogMul(camera.position); }
    updateProps(props, camera, env.look.night, game.trafficPhase || 0); if (prom) prom.update(camera.position); if (sign) sign.update(camera.position, env.look.night, false, game.trafficPhase || 0); if (blot) blot.update(camera.position, env.look.night); street.update(env.look.night); shopSigns.update(env.look.night);
    updateLampLights(props, city.lamps, camera.position, env.look.night);
    updateNeonLights(props, city.signs, camera.position, env.look.night);
    renderer.toneMappingExposure = env.exposure; if (M.building.envMap) M.building.envMapIntensity = env.envIntensity * 1.1;
    sprobe.update(false);
    const pc = game.P && game.P.car; const kmh = pc ? Math.abs(pc.speed || 0) * 3.6 : 0;
    post.blur = Q.get('mb') === '0' ? 0 : THREE.MathUtils.smoothstep(kmh, 25, 110) * 0.6;
    if (post.dof && game.P) post.focus = camera.position.distanceTo(game.P.pos) + 0.3;
    const sy = U.uSunDir.value.y; const gold = (1 - THREE.MathUtils.smoothstep(sy, 0.08, 0.55)) /* shaftfix: was (sy,0.55,0.08) -> min>max made gold 1 at noon, 0 at golden hour; now matches env.js smooth(0.55,0.06,sd.y) */ * (1 - env.look.night);
    post.update(U.uSunDir.value, U.uSunCol.value, env.look.night, U.uTime.value, gold);
    if (Q.has('nopost')) renderer.render(scene, camera); else post.render();
  }
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); post.setSize(window.innerWidth, window.innerHeight); });
  document.getElementById('load').style.display = SNAP ? 'none' : 'flex';
  const st = document.getElementById('start'); st.style.display = 'block';
  st.onclick = () => { document.getElementById('load').style.display = 'none'; game.start(); };
  addEventListener('keydown', (e) => { if (e.code === 'KeyP') { W.photo(!post.dof); } });
  mark('ready'); LT.programs = renderer.info.programs.length;
  W.firstFrame = () => { const t = performance.now(); renderFrame(0); renderer.getContext().readPixels(0, 0, 1, 1, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, new Uint8Array(4)); LT.firstFrame = Math.round(performance.now() - t); LT.programs = renderer.info.programs.length; return LT; };
  if (SNAP) { game.start(true); W.ready = true; return; }
  let nf = 0;
  renderer.setAnimationLoop(() => { clock.update(); const dt = Math.min(clock.getDelta(), 1 / 20); frame(dt);
    if (++nf === 1) { mark('first frame'); LT.programs = renderer.info.programs.length; console.log('[loadtime]', JSON.stringify(LT));
      // loadtime: then the hidden rest (far LOD, streamed chunks, night props) in the background, only where it cannot block
      if (!Q.has('noprecompile') && renderer.extensions.get('KHR_parallel_shader_compile')) setTimeout(() => precompile(renderer, scene, camera, { rt: post.composer.renderTarget1, all: true }).then((r) => { LT.precompileBg = r; }), 1500);
    } });
  W.ready = true;
})().catch((e) => { console.error(e); document.querySelector('#load p').textContent = /WebGL/i.test(e.message) ? '无法创建 WebGL2 画面：请用开启了硬件加速的 Chrome / Edge / Safari 打开' : '载入失败: ' + e.message; });
