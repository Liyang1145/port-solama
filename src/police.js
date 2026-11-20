// v4.3 police escalation (GAMEPLAY_PLAN.md E1–E5): search zone around the last sighting, star escalation while resisting in
// view, 3-star road blocks (two cruisers across the road ahead + officers), 4-star helicopter with a spotlight that counts as
// "seen", and faster cool-down while hiding still out of sight. Helicopter is an original low-poly build.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { Character } from './people.js';
import { U } from './env.js';
import { LAYOUT } from './city.js';
import { rand, rng, clamp, angWrap } from './util.js';

function heliMesh() {
  const g = new THREE.Group(); const dark = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.45, metalness: 0.4 }); const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), dark); body.scale.set(1, 0.95, 2.0); g.add(body);
  const win = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, 1.2), glass); win.rotation.x = Math.PI / 2 + 0.3; win.position.set(0, 0.2, 1.7); g.add(win);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.35, 3.2), white); band.position.y = -0.15; g.add(band);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 5.5, 8), dark); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.25, -4.4); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.9), dark); fin.position.set(0, 0.85, -7.0); g.add(fin);
  for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.4), dark); sk.position.set(s * 1.0, -1.45, 0.2); g.add(sk); }
  const rotor = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 11), dark); b.rotation.y = i * Math.PI / 4 * 2 / 2 + i * Math.PI / 4; rotor.add(b); } rotor.position.y = 1.35; g.add(rotor); g.userData.rotor = rotor;
  const tr = new THREE.Group(); const tb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.2), dark); tr.add(tb); tr.position.set(0.18, 0.85, -7.0); g.add(tr); g.userData.tail = tr;
  // spotlight cone (additive, visible at night)
  const cm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uNight: U.uNight },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uNight; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.6) * 0.16 * (0.25 + uNight); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, 1.0); }' });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 7, 1, 20, 1, true), cm); cone.frustumCulled = false; g.userData.cone = cone;
  return g;
}

export class PoliceOps {
  constructor(game) {
    this.G = game; this.heli = null; this.blocks = []; this.blockT = 10; this.escT = 0; this.log = [];
    this.spot = new THREE.SpotLight(0xdde8ff, 0, 120, 0.22, 0.5, 1.2); this.spot.castShadow = false; game.scene.add(this.spot); game.scene.add(this.spot.target);
  }
  spawnHeli() {
    const G = this.G; const m = heliMesh(); G.scene.add(m); G.scene.add(m.userData.cone); const P = G.P;
    this.heli = { m, x: P.pos.x - 220, z: P.pos.z + 60, y: 48, yaw: 0, spot: new THREE.Vector3(P.pos.x, 0, P.pos.z) };
    G.hud.msg('警用直升机出动', 2); this.log.push('heli');
  }
  removeHeli() { if (!this.heli) return; this.G.scene.remove(this.heli.m); this.G.scene.remove(this.heli.m.userData.cone); this.heli = null; this.spot.intensity = 0; }
  updateHeli(dt) {
    const G = this.G, P = G.P, h = this.heli; if (!h) return false;
    const tx = (G.lostT > 1.5 && G.lastSeen ? G.lastSeen.x : P.pos.x), tz = (G.lostT > 1.5 && G.lastSeen ? G.lastSeen.z : P.pos.z);
    const ox = tx - 18 - h.x, oz = tz - 12 - h.z; const d = Math.hypot(ox, oz); const sp = Math.min(30, d * 0.6);
    if (d > 0.1) { h.x += ox / d * sp * dt; h.z += oz / d * sp * dt; h.yaw += angWrap(Math.atan2(ox, oz) - h.yaw) * (1 - Math.exp(-2 * dt)); }
    h.m.position.set(h.x, h.y + Math.sin(U.uTime.value * 0.9) * 0.6, h.z); h.m.rotation.set(clamp(sp / 30, 0, 1) * 0.18, h.yaw, 0);
    h.m.userData.rotor.rotation.y += dt * 38; h.m.userData.tail.rotation.x += dt * 50;
    // spotlight sweeps toward the target (search: it wanders around the last sighting)
    const wob = G.lostT > 1.5 ? 14 : 2; const sx = tx + Math.sin(U.uTime.value * 0.7) * wob, sz = tz + Math.cos(U.uTime.value * 0.53) * wob;
    h.spot.x += (sx - h.spot.x) * (1 - Math.exp(-1.6 * dt)); h.spot.z += (sz - h.spot.z) * (1 - Math.exp(-1.6 * dt));
    const cone = h.m.userData.cone; const from = new THREE.Vector3(h.x, h.y - 1.4, h.z); const to = new THREE.Vector3(h.spot.x, 0, h.spot.z); const L = from.distanceTo(to);
    cone.scale.set(1, L, 1); cone.position.copy(from).lerp(to, 0.5); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    this.spot.position.copy(from); this.spot.target.position.copy(to); this.spot.target.updateMatrixWorld(); this.spot.intensity = 3000 * (0.15 + U.uNight.value);
    const lit = Math.hypot(P.pos.x - h.spot.x, P.pos.z - h.spot.z) < 7.5;
    return lit;
  }
  // road block: nearest intersection ahead of the player (60–160 m), two cruisers across it + 2 officers
  placeBlock() {
    const G = this.G, P = G.P; const v = P.car; const fx = v ? Math.sin(v.yaw) : Math.sin(P.yaw), fz = v ? Math.cos(v.yaw) : Math.cos(P.yaw);
    let best = null, bs = -1;
    for (const it of G.city.inters) { const dx = it.x - P.pos.x, dz = it.z - P.pos.z; const d = Math.hypot(dx, dz); if (d < 55 || d > 170) continue; const s = (dx * fx + dz * fz) / d; if (s > 0.75 && s > bs) { bs = s; best = it; } }
    if (!best) return null;
    const alongZ = Math.abs(fz) > Math.abs(fx); const sgn = alongZ ? Math.sign(fz) : Math.sign(fx);
    const cars = []; const cx = alongZ ? best.x : best.x - sgn * 10, cz = alongZ ? best.z - sgn * 10 : best.z;
    for (const k of [-1, 1]) { const c = new Vehicle(G.scene, 'police'); const x = alongZ ? cx + k * 3.3 : cx, z = alongZ ? cz : cz + k * 3.3; c.place(x, z, alongZ ? Math.PI / 2 : 0); c.ai = null; c.parked = true; c.siren = true; G.traffic.cars.push(c); cars.push(c); }
    const cops = []; for (const k of [-1, 1]) { const o = new Character(G.scene, 'cop'); const x = alongZ ? cx + k * 6 : cx - sgn * 2.5, z = alongZ ? cz - sgn * 2.5 : cz + k * 6; o.pos.set(x, G.city.groundH(x, z), z); o.isCop = true; o.ai = { mode: 'cop', fireT: rand(1, 2) }; o.health = 100; G.cops.push(o); cops.push(o); }
    const b = { x: cx, z: cz, cars, cops, t: 0 }; this.blocks.push(b); G.hud.msg('前方路口有警方路障！', 2.5); this.log.push('roadblock'); return b;
  }
  update(dt, seen) {
    const G = this.G, P = G.P;
    // E2 escalation: resisting in plain view slowly raises the heat
    if (G.wanted > 0 && G.wanted < 5 && seen) { this.escT += dt; if (this.escT > 40 + G.wanted * 12) { this.escT = 0; G.wanted++; G.hud.msg('警方加强追捕 · 通缉 ' + G.wanted + ' 星', 2.5); G.sfx.alert?.(); this.log.push('escalate:' + G.wanted); } } else if (!seen) this.escT = Math.max(0, this.escT - dt * 0.5);
    // E3 road blocks
    this.blockT -= dt;
    if (G.wanted >= 3 && this.blockT <= 0 && this.blocks.length < 2) { this.blockT = 45; this.placeBlock(); }
    for (const b of [...this.blocks]) { b.t += dt; const d = Math.hypot(b.x - P.pos.x, b.z - P.pos.z);
      if ((G.wanted === 0 && d > 80) || d > 260 || b.t > 240) { for (const c of b.cars) if (c !== P.car) G.traffic.removeCar(c); this.blocks.splice(this.blocks.indexOf(b), 1); } }
    // E4 helicopter
    if (G.wanted >= 4 && !this.heli) this.spawnHeli();
    if (this.heli && G.wanted === 0) { this.heli.y += dt * 8; if (this.heli.y > 140) this.removeHeli(); }
    const lit = this.heli && G.wanted > 0 ? this.updateHeli(dt) : (this.heli ? (this.updateHeli(dt), false) : false);
    return lit;
  }
}
