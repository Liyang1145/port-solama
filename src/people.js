// Characters: realistic rigged humans (MakeHuman CC0 bodies via ara3d, CMU mocap clips baked per character)
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
export const charLodReady = MeshoptSimplifier.ready;
// v4.2 character LOD: per proto geometry, two simplified index buffers sharing the skinned vertex data (meshoptimizer)
const LODG = new Map();
function makeLods(geo) {
  if (LODG.has(geo) || !geo.index) return;
  const pos = geo.attributes.position; const P = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); }
  const I = new Uint32Array(geo.index.array);
  const out = [geo];
  for (const r of [0.3, 0.1]) {
    let res; try { res = MeshoptSimplifier.simplify(I, P, 3, Math.max(3, Math.floor(I.length * r / 3) * 3), 0.02, ['LockBorder']); } catch (e) { res = null; }
    const g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(new THREE.BufferAttribute(res ? res[0] : I, 1)); g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
    for (const gr of geo.groups) g.addGroup(0, Infinity, gr.materialIndex);
    out.push(g);
  }
  LODG.set(geo, out);
}
import { prep } from './mats.js';
import { clamp, lerp, rand, pick, angWrap, rng } from './util.js';

const CLIPS = {};
const PROTOS = {};

function stripPos(clip, rename, dropHips) {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => !t.name.endsWith('.position') && !t.name.endsWith('.scale') && !(dropHips && /Hips\.quaternion/.test(t.name)));
  for (const t of c.tracks) {
    if (rename) t.name = t.name.replace('mixamorig', '');
  }
  return c;
}
function hueMat(src, key) {
  // clothing tint: rotates hue/value of non-skin texels (per-character uniforms)
  const m = src.clone();
  m.userData.tint = { uHue: { value: 0 }, uVal: { value: 1 }, uSat: { value: 1 }, uSkin: { value: /Outfit/.test(src.name) ? 0 : 1 } };
  return prep(m, key, (s) => {
    Object.assign(s.uniforms, m.userData.tint);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform float uHue, uVal, uSat, uSkin;
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 hsv = rgb2hsv(diffuseColor.rgb);
  float skin = uSkin * smoothstep(0.13, 0.08, hsv.x) * smoothstep(0.12, 0.25, hsv.y) * smoothstep(0.7, 0.5, hsv.y) * smoothstep(0.15, 0.3, hsv.z);
  vec3 t = hsv2rgb(vec3(fract(hsv.x + uHue), clamp(hsv.y * uSat, 0.0, 1.0), clamp(hsv.z * uVal, 0.0, 1.0)));
  diffuseColor.rgb = mix(t, diffuseColor.rgb, skin); }`);
  });
}

// Cast: MakeHuman-based realistic people (CC0 bodies, CMU mocap clips) exported with ara3d; each GLB carries its own clips
// (Idle / Walk / Run / Pistol aim / Death), so no cross-rig retargeting is needed.
export const CAST = {
  hero: { file: 'ch_hero.glb', sex: 'm' },
  m1: { file: 'ch_m1.glb', sex: 'm' }, m2: { file: 'ch_m2.glb', sex: 'm' }, m3: { file: 'ch_m3.glb', sex: 'm' }, m4: { file: 'ch_m4.glb', sex: 'm' },
  f1: { file: 'ch_f1.glb', sex: 'f' }, f2: { file: 'ch_f2.glb', sex: 'f' }, f3: { file: 'ch_f3.glb', sex: 'f' }, f4: { file: 'ch_f4.glb', sex: 'f' },
  cop: { file: 'ch_cop.glb', sex: 'm' },
};
const SKIN_RE = /^(Skin|Eyes|Eyebrows|Eyelashes|Teeth|Tongue|Hair|Beard|Skin details)/;
export function prepareCharacters(G) {
  const find = (g, re) => g.animations.find((a) => re.test(a.name));
  for (const key in CAST) {
    const g = G['ch_' + key]; if (!g) continue;
    g.scene.traverse((o) => {
      if (!o.isMesh) return; o.castShadow = !/Eye|Teeth|Tongue|lash|brow|details/i.test(o.material.name); o.receiveShadow = true; o.frustumCulled = false;
      const mm = Array.isArray(o.material) ? o.material : [o.material];
      mm.forEach((m) => { if (m.transparent && m.map === null) m.depthWrite = false; prep(m, 'ch'); });
      if (o.isSkinnedMesh && key !== 'hero') makeLods(o.geometry);
    });
    const clip = (re) => { const c = find(g, re); if (!c) return null; const k = c.clone(); k.tracks = k.tracks.filter((t) => !t.name.endsWith('.scale')); return k; };
    PROTOS[key] = { scene: g.scene, scale: 1, sex: CAST[key].sex, clips: { idle: clip(/^Idle/), walk: clip(/^Walk/), run: clip(/^Run/), aim: clip(/Pistol aim/), death: clip(/^Death/) } };
  }
}
const pickKind = (kind, opt) => {
  if (opt.proto && PROTOS[opt.proto]) return opt.proto;
  if (opt.player) return 'hero';
  if (kind === 'cop') return 'cop';
  const pool = Object.keys(PROTOS).filter((k) => k !== 'hero' && k !== 'cop' && (kind === 'man' ? PROTOS[k].sex === 'm' : kind === 'woman' ? PROTOS[k].sex === 'f' : true));
  return pick(pool.length ? pool : Object.keys(PROTOS));
};

let CID = 0;
export class Character {
  constructor(scene, kind, opt = {}) {
    const pk = pickKind(kind, opt); const P = PROTOS[pk]; this.kind = kind; this.proto = pk; this.id = CID++; this.isCop = kind === 'cop';
    this.model = SkeletonUtils.clone(P.scene);
    this.root = new THREE.Group(); this.root.add(this.model); scene.add(this.root); this.scene = scene;
    if (!opt.player && !opt.player2 && kind !== 'cop' && rng() < 0.75) {
      // wardrobe variety: shift the hue / value of clothing (never skin, eyes or hair)
      const t = pick([[rand(-0.5, 0.5), rand(0.7, 1.3), rand(0.75, 1.2)], [0, rand(0.2, 0.6), rand(1.1, 1.4)], [rand(-0.5, 0.5), 1, rand(0.5, 0.8)]]);
      this.model.traverse((o) => {
        if (!o.isMesh || SKIN_RE.test(o.material.name) || o.material.transparent) return;
        if (rng() < 0.35) return;
        o.material = hueMat(o.material, 'tint');
        const u = o.material.userData.tint; u.uSkin.value = 0; u.uHue.value = t[0]; u.uSat.value = t[1]; u.uVal.value = t[2];
      });
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const k of ['idle', 'walk', 'run']) { const a = this.mixer.clipAction(P.clips[k]); a.play(); a.weight = k === 'idle' ? 1 : 0; this.actions[k] = a; }
    if (P.clips.death) { const a = this.mixer.clipAction(P.clips.death); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; this.deathA = a; }
    this.pos = new THREE.Vector3(); this.yaw = 0; this.vy = 0; this.speed = 0; this.health = 100; this.dead = false;
    this.fallT = 0; this.mixer.update(rand(0, 2));
    this.root.scale.setScalar(opt.player ? 1 : rand(0.95, 1.04));
    this.lod = 0; this.lodAcc = 0; this.lodMeshes = [];
    this.model.traverse((o) => { if (o.isMesh) this.lodMeshes.push({ m: o, g: LODG.get(o.geometry), small: /Eye|Teeth|Tongue|lash|brow|details/i.test(o.material.name), cast: o.castShadow }); });
  }
  // LOD by camera distance: 0 full (<16 m), 1 = 30 % tris, no tiny meshes / shadows past 28 m, 2 = 10 % tris + quarter-rate animation
  setLod(d) {
    const L = d < 16 ? 0 : d < 45 ? 1 : 2; if (L === this.lod) return; this.lod = L;
    for (const e of this.lodMeshes) { if (e.g) e.m.geometry = e.g[L]; e.m.visible = !(e.small && L > 0); e.m.castShadow = e.cast && d < 28; }
  }
  setLocomotion(speed, dt) {
    const w = { idle: speed < 0.3 ? 1 : 0, walk: speed >= 0.3 && speed < 3.2 ? 1 : 0, run: speed >= 3.2 ? 1 : 0 };
    for (const k in this.actions) { const a = this.actions[k]; a.weight = lerp(a.weight, w[k], 1 - Math.exp(-10 * dt)); }
    this.actions.walk.timeScale = clamp(speed / 1.4, 0.5, 2.0);
    this.actions.run.timeScale = clamp(speed / 5.0, 0.7, 1.5);
  }
  update(dt) {
    if (this.dead && !this.deathA) {
      this.fallT = Math.min(1, this.fallT + dt * 2.2);
      const e = this.fallT * this.fallT;
      this.model.rotation.x = -e * Math.PI / 2 * this.fallDir; this.model.position.y = 0.12 * e;
      if (this.fallT < 1) this.mixer.update(dt * 0.3);
    } else if (this.lod < 2) this.mixer.update(dt);
    else { this.lodAcc += dt; if (this.lodAcc > 0.12) { this.mixer.update(this.lodAcc); this.lodAcc = 0; } }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
  kill(dirSign = 1) {
    this.dead = true; this.health = 0; this.fallDir = dirSign;
    if (this.deathA) {
      for (const k in this.actions) this.actions[k].weight = 0;
      this.deathA.reset(); this.deathA.weight = 1; this.deathA.play();
      // the clip falls backwards: face the body so it falls away from the hit
      if (dirSign < 0) this.yaw += Math.PI;
    } else for (const k in this.actions) this.actions[k].weight = k === 'idle' ? 1 : 0;
  }
  revive() {
    this.dead = false; this.health = 100; this.fallT = 0; this.model.rotation.x = 0; this.model.position.y = 0;
    if (this.deathA) { this.deathA.stop(); this.deathA.weight = 0; }
    this.actions.idle.weight = 1;
  }
  dispose() { this.scene.remove(this.root); }
}

// ------------------------------------------------------------------------ pedestrians ----
export class Pedestrians {
  constructor(scene, city) { this.scene = scene; this.city = city; this.list = []; this.loops = city.blocks.filter((b) => b.area !== 'promenade' || true); }
  spawn(near, minD = 25, maxD = 110, kinds = ['woman', 'man', 'man']) {
    for (let t = 0; t < 20; t++) {
      const b = pick(this.loops); const sw = b.area === 'promenade' ? 3 : 2.2;
      // sidewalk loop rectangle (inset from the curb)
      const x0 = b.x0 + sw, x1 = b.x1 - sw, z0 = b.z0 + sw, z1 = b.z1 - sw;
      const per = 2 * (x1 - x0 + z1 - z0); const u = rng() * per;
      const p = this.loopPoint(x0, z0, x1, z1, u);
      const d = Math.hypot(p.x - near.x, p.z - near.z); if (d < minD || d > maxD) continue;
      if (this.city.col.resolve(p.x, p.z, 0.4, 0.5).hit) continue;
      const c = new Character(this.scene, pick(kinds));
      c.pos.set(p.x, this.city.groundH(p.x, p.z), p.z);
      c.ai = { mode: 'walk', loop: [x0, z0, x1, z1, per], u, dir: rng() < 0.5 ? 1 : -1, speed: rand(1.1, 1.6), wait: rng() < 0.3 ? rand(15, 90) : 0 }; // 30 % loiter (idle, chatting, waiting)
      this.list.push(c); return c;
    }
    return null;
  }
  loopPoint(x0, z0, x1, z1, u) {
    const w = x1 - x0, h = z1 - z0; const per = 2 * (w + h); u = ((u % per) + per) % per;
    if (u < w) return { x: x0 + u, z: z0 }; u -= w; if (u < h) return { x: x1, z: z0 + u }; u -= h; if (u < w) return { x: x1 - u, z: z1 }; u -= w; return { x: x0, z: z1 - u };
  }
  update(dt, ctx) {
    const cp = ctx && ctx.camera ? ctx.camera.position : null;
    for (const c of this.list) {
      const a = c.ai;
      if (cp) c.setLod(Math.hypot(c.pos.x - cp.x, c.pos.z - cp.z));
      if (c.dead) { c.update(dt); continue; }
      let sp = 0;
      if (a.mode === 'walk') {
        if (a.wait > 0) { a.wait -= dt; sp = 0; }
        else {
          a.u += a.dir * a.speed * dt; const [x0, z0, x1, z1] = a.loop;
          const p = this.loopPoint(x0, z0, x1, z1, a.u); const p2 = this.loopPoint(x0, z0, x1, z1, a.u + a.dir * 0.8);
          const nx = p.x, nz = p.z; const yawT = Math.atan2(p2.x - p.x, p2.z - p.z);
          c.yaw += angWrap(yawT - c.yaw) * (1 - Math.exp(-8 * dt));
          // avoid obstacles: if blocked, pause briefly and turn back
          const r = this.city.col.resolve(nx, nz, 0.35, 0.5);
          c.pos.x = r.x; c.pos.z = r.z; if (r.hit && rng() < 0.02) a.dir *= -1;
          sp = a.speed; if (rng() < 0.0015) a.wait = rand(1, 4);
        }
      } else if (a.mode === 'flee') {
        const dx = c.pos.x - a.from.x, dz = c.pos.z - a.from.z; const yawT = Math.atan2(dx, dz) + Math.sin(a.t * 1.3 + c.id) * 0.4;
        c.yaw += angWrap(yawT - c.yaw) * (1 - Math.exp(-6 * dt)); sp = 5.2;
        const nx = c.pos.x + Math.sin(c.yaw) * sp * dt, nz = c.pos.z + Math.cos(c.yaw) * sp * dt;
        const r = this.city.col.resolve(nx, nz, 0.35, 0.5); c.pos.x = r.x; c.pos.z = r.z;
        if (r.hit) c.yaw += 1.2 * dt * 4;
        a.t += dt; if (a.t > 12) { a.mode = 'walk'; const [x0, z0, x1, z1, per] = a.loop; a.u = this.nearestU(a.loop, c.pos); }
      } else if (a.mode === 'cower') { sp = 0; a.t += dt; if (a.t > 6) a.mode = 'flee'; }
      c.pos.y = lerp(c.pos.y, this.city.groundH(c.pos.x, c.pos.z), 1 - Math.exp(-15 * dt));
      c.setLocomotion(sp, dt); c.update(dt);
    }
  }
  nearestU(loop, p) { const [x0, z0, x1, z1] = loop; let best = 0, bd = 1e9; const per = 2 * (x1 - x0 + z1 - z0); for (let u = 0; u < per; u += 2) { const q = this.loopPoint(x0, z0, x1, z1, u); const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = u; } } return best; }
  panic(from, radius = 40) { for (const c of this.list) { if (c.dead) continue; if (c.pos.distanceTo(from) < radius) { c.ai.mode = 'flee'; c.ai.from = from.clone(); c.ai.t = 0; } } }
  remove(c) { const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1); c.dispose(); }
}
