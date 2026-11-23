// Gameplay: player on foot / driving, third-person + chase camera, traffic & pedestrians, carjacking,
// pistol combat, 1-5 star wanted level with police pursuit, HUD + minimap.
import * as THREE from 'three';
import { Vehicle, Traffic, prepareSport, prepareModels, setCarNight } from './vehicles.js';
import { Occupants } from './seating.js';
import { Character, Pedestrians, prepareCharacters } from './people.js';
import { HUD } from './hud.js';
import { Sfx } from './sfx.js';
import { clamp, lerp, rand, pick, angWrap, rng, damp } from './util.js';
import { LAYOUT } from './city.js';
import { U } from './env.js';
import { Valet } from './mission.js';
import { Arsenal, newLoadout, WBY } from './weapons.js';
import { Missions } from './missions.js';
import { World } from './world.js';
import { PoliceOps } from './police.js';
import { POI } from './mapdata.js';
import { CYBER } from './mapsel.js';
import { routeWaypoint } from './roadroute.js';
import { ActionPose } from './actionpose.js';
const SAVE_KEY = CYBER ? 'portsolana_cyber_v60' : 'portsolana_v43'; // r6.0: one save per map (positions differ)

const HOSPITAL = POI.hospital;
const PRECINCT = POI.precinct;

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.timeScale = 30; this.trafficPhase = 0;
    prepareSport(this.G.car); prepareModels(this.G);
    prepareCharacters(this.G);
    this.traffic = new (this.city.TrafficClass || Traffic)(this.scene, this.city); // r6.0: map 霓港 brings its road-graph traffic
    this.peds = new Pedestrians(this.scene, this.city);
    this.hud = new HUD(this.city);
    this.sfx = new Sfx();
    // player
    this.player = new Character(this.scene, 'man', { player: true });
    this.P = { pos: this.player.pos, yaw: 0, vy: 0, onFoot: true, car: null, health: 100, armor: 40, money: 5000, bank: 12000, stamina: 100, load: newLoadout(['fist', 'pistol']), assets: [], outfit: null, reloadT: 0, fireT: 0, grounded: true, sprint: false };
    this.cam = { yaw: Math.PI, pitch: -0.12, dist: 3.4, lastMouse: 0, mode: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.keys = {}; this.mouse = { down: false, aim: false };
    this.wanted = 0; this.lostT = 0; this.wantedFlash = false; this.cops = []; this.policeCars = []; this.crimeCooldown = 0;
    this.tracers = []; this.spawnT = 0; this.msgT = 0; this.deadT = 0; this.override = null;
    // muzzle flash light
    this.flash = new THREE.PointLight(0xffc070, 0, 8, 2); this.scene.add(this.flash);
    this.sirenLights = [new THREE.PointLight(0xff2020, 0, 22, 2), new THREE.PointLight(0x2040ff, 0, 22, 2)]; for (const l of this.sirenLights) this.scene.add(l);
    this.headlight = new THREE.SpotLight(0xfff0dd, 0, 60, 0.55, 0.5, 1.4); this.headlight.castShadow = false; this.scene.add(this.headlight); this.scene.add(this.headlight.target);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 });
    this.extras = []; this.gang = []; this.slowmo = 1; this.waypoint = null;
    this.arsenal = new Arsenal(this);
    this.bindInput();
    this.mission = new Valet(this);
    this.world = new World(this); this.world.initProfiles();
    this.missions = new Missions(this);
    this.police = new PoliceOps(this);
  }
  // ------------------------------------------------------------------ setup / input ----
  bindInput() {
    const c = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (this.world.phoneOpen) { if (/Arrow|Enter|Backspace/.test(e.code)) { this.world.phoneKey(e.code); e.preventDefault(); return; } if (e.code === 'Escape' || e.code === 'KeyI') { this.world.togglePhone(false); return; } }
      if (this.world.menu) { const m = /^Digit(\d)$/.exec(e.code); if (m) { this.world.choose(+m[1] - 1); return; } if (e.code === 'Escape' || e.code === 'KeyE') { this.world.closeMenu(); return; } }
      if (e.repeat) return;
      this.keys[e.code] = true;
      { const m = /^Digit([1-6])$/.exec(e.code); if (m) this.arsenal.equip(['fist', 'bat', 'pistol', 'smg', 'shotgun', 'rifle'][+m[1] - 1]); }
      if (e.code === 'KeyQ') { this.arsenal.openWheel(true); this.wheelM = [0, 0]; }
      if (e.code === 'KeyC') this.arsenal.toggleCover();
      if (e.code === 'KeyE' && this.P.onFoot) this.world.interact();
      if (e.code === 'KeyI' || (e.code === 'ArrowUp' && this.P.onFoot)) this.world.togglePhone(true);
      if (e.code === 'KeyZ') this.world.switchChar();
      if (e.code === 'Period') { const n = this.world.station + 1; this.world.station = n >= 3 ? -1 : n; this.sfx.setStation(this.world.station); this.hud.msg(this.world.station < 0 ? '电台已关闭' : '电台：' + ['海浪 FM 93.1', '霓光 101.7', '午夜慢调 88.5'][this.world.station], 1.5); }
      if (e.code === 'KeyF') this.toggleCar();
      if (e.code === 'KeyR') this.arsenal.reload();
      if (e.code === 'KeyT') this.skipTime(1);
      if (e.code === 'KeyV') this.cam.mode = (this.cam.mode + 1) % 2;
      if (e.code === 'KeyH' && this.P.car) this.sfx.horn();
      if (e.code === 'KeyM') this.hud.toggleBig();
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'KeyQ' && this.arsenal.wheelOpen) this.arsenal.openWheel(false); });
    addEventListener('wheel', (e) => { if (document.pointerLockElement === c && this.P.onFoot) this.arsenal.cycle(e.deltaY > 0 ? 1 : -1); });
    c.addEventListener('click', () => { if (document.pointerLockElement !== c) c.requestPointerLock?.(); this.sfx.resume(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== c) return;
      if (this.arsenal.wheelOpen) { this.wheelM[0] += e.movementX; this.wheelM[1] += e.movementY; this.arsenal.wheelAim(this.wheelM[0], this.wheelM[1]); return; }
      this.cam.yaw -= e.movementX * 0.0024; this.cam.pitch = clamp(this.cam.pitch - e.movementY * 0.0022, -1.2, 0.6); this.cam.lastMouse = performance.now();
    });
    addEventListener('mousedown', (e) => { if (document.pointerLockElement !== c) return; if (e.button === 0) { this.mouse.down = true; this.mouse.edge = true; } if (e.button === 2) this.mouse.aim = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.aim = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }
  start(snap = false) {
    this.tp(286, 30, Math.PI); // Tideline Drive sidewalk... placed on the road edge near the hotels
    this.tp(280.5, 36, Math.PI);
    // a couple of cars to start with + initial traffic/peds
    const v = new Vehicle(this.scene, 'sport'); v.place(284.5, 22, Math.PI); v.ai = null; this.traffic.cars.push(v); this.parked = v;
    for (let i = 0; i < 18; i++) this.traffic.spawnCar(pick(['sedan', 'sedan', 'suv', 'pickup', 'van', 'taxi', 'sport2', 'sport']), this.P.pos, 20, 230);
    for (let i = 0; i < 84; i++) this.peds.spawn(this.P.pos, 6, 110); // v4.4 denser crowd (character LOD keeps far peds cheap)
    this.hud.msg('欢迎来到索拉纳港 · 走近车辆按 F 上车', 5);
    const help = document.getElementById('help'); if (snap) help.style.display = 'none'; else setTimeout(() => { help.style.transition = 'opacity 1s'; help.style.opacity = 0; }, 20000);
    this.started = true;
    this._init = { armor: this.P.armor, money: this.P.money, bank: this.P.bank, load: JSON.stringify(this.P.load) };
    if (!snap) { this.sfx.resume(); this.loadSave(); addEventListener('pagehide', () => this.save()); } // r6.2: also save when the tab closes / map switch (autosave was every 30 s only)
  }
  tp(x, z, yaw = 0) { this.P.pos.set(x, this.city.groundH(x, z), z); this.P.yaw = yaw; this.cam.yaw = yaw + Math.PI; this.player.pos.copy(this.P.pos); this.player.yaw = yaw; this.updateCamera(1, true); }
  skipTime(h) { window.__G.setHour((window.__G.hour + h) % 24); this.hud.msg('时间快进 1 小时', 1.5); }
  // ------------------------------------------------------------------ vehicles ----
  nearestCar(maxD = 4.5) {
    let best = null, bd = maxD;
    for (const v of this.traffic.cars) { const d = Math.hypot(v.x - this.P.pos.x, v.z - this.P.pos.z) - v.dims.W * 0.5; if (d < bd && !v.inWater) { bd = d; best = v; } }
    return best;
  }
  toggleCar() {
    if (this.deadT > 0) return;
    const P = this.P;
    if (P.car) { // exit on the left side
      const v = P.car; const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
      let x = v.x + lx * (v.dims.W / 2 + 0.6), z = v.z + lz * (v.dims.W / 2 + 0.6);
      if (this.city.col.resolve(x, z, 0.35, 0.5).hit) { x = v.x - lx * (v.dims.W / 2 + 0.6); z = v.z - lz * (v.dims.W / 2 + 0.6); }
      v.driver = null; v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
      P.car = null; P.onFoot = true; this.player.root.visible = true; this.tp(x, z, v.yaw); this.cam.yaw = v.yaw + Math.PI;
      this.headlight.intensity = 0; if (v.type === 'police') v.siren = false;
      return;
    }
    const v = this.nearestCar(); if (!v) return;
    if (v.ai && v.ai.mode !== 'dead' && v.health > 0) { // carjack: pull the driver out
      const kind = v.type === 'police' ? 'cop' : pick(['woman', 'man']);
      const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
      const d = new Character(this.scene, kind);
      d.pos.set(v.x + lx * 2.2, this.city.groundH(v.x, v.z), v.z + lz * 2.2);
      if (kind === 'cop') { d.isCop = true; this.cops.push(d); d.ai = { mode: 'cop', fireT: 1 }; this.crime(2, '袭警抢车'); }
      else { d.ai = { mode: 'flee', from: this.P.pos.clone(), t: 0, loop: [v.x - 20, v.z - 20, v.x + 20, v.z + 20, 160], u: 0, dir: 1, speed: 1.3, wait: 0 }; this.peds.list.push(d); if (this.policeNear(45) || rng() < 0.25) this.crime(1, '抢劫车辆'); }
      this.peds.panic(this.P.pos, 15);
    }
    v.ai = null; v.driver = 'player'; v.input.handbrake = false; P.car = v; P.onFoot = false; this.player.root.visible = false;
    this.cam.yaw = v.yaw + Math.PI; this.hud.msg(v.type === 'sport' ? '跑车 · 按 F 下车' : '按 F 下车 · 空格 手刹 · H 喇叭', 2);
    if (v.type === 'police') v.siren = false;
  }
  // ------------------------------------------------------------------ combat ----
  reload() { return this.arsenal.reload(); }
  aimRay() {
    const o = this.camera.position.clone(); const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    return { o, d };
  }
  shoot() { return this.arsenal.trigger(true, true); }
  hostiles() { return this.gang.filter((c) => !c.dead); }
  // one hitscan ray against buildings, characters (peds, cops, gang, clerks) and cars
  castShot(o, d, maxD) {
    const P = this.P; const tb = this.city.col.raycast(o.x, o.y, o.z, o.x + d.x * maxD, o.y + d.y * maxD, o.z + d.z * maxD); let hitT = tb * maxD; let what = null;
    const testChar = (c) => { if (c.dead || c === this.player) return; const cp = c.pos.clone(); cp.y += 1.0; const t = cp.clone().sub(o).dot(d); if (t < 0 || t > hitT) return; const q = o.clone().addScaledVector(d, t); const lat = Math.hypot(q.x - cp.x, q.z - cp.z); if (lat < 0.42 && q.y > c.pos.y && q.y < c.pos.y + 1.85) { hitT = t; what = { c, head: q.y > c.pos.y + 1.5 }; } };
    for (const c of this.peds.list) testChar(c); for (const c of this.cops) testChar(c); for (const c of this.gang) testChar(c); for (const c of this.extras) testChar(c);
    for (const pr of this.world.profiles) if (pr.char !== this.player && !pr.car) testChar(pr.char);
    for (const v of this.traffic.cars) { if (v === P.car) continue; const cp = new THREE.Vector3(v.x, v.y + 0.8, v.z); const t = cp.clone().sub(o).dot(d); if (t < 0 || t > hitT) continue; const q = o.clone().addScaledVector(d, t); if (q.distanceTo(cp) < v.dims.W * 0.6) { hitT = t; what = { v }; } }
    return { t: hitT, what };
  }
  hitReact(c, d, push = 0.15) { if (c.dead) return; const r = this.city.col.resolve(c.pos.x + d.x * push, c.pos.z + d.z * push, 0.35, 0.5); c.pos.x = r.x; c.pos.z = r.z; c.yaw += (rng() - 0.5) * 0.6; c.hitT = 0.3; if (c.ai && c.ai.mode === 'gang') c.ai.fireT = Math.max(c.ai.fireT, 0.4); }
  killChar(c, d, melee = false) {
    const fwd = Math.sin(c.yaw) * d.x + Math.cos(c.yaw) * d.z; c.kill(fwd > 0 ? -1 : 1);
    if (c.thief || c.hostile) { if (c.hostile) this.dropCash(c.pos); return; }
    if (c.isCop) { this.crime(Math.max(this.wanted + 1, 3), '击毙警察'); }
    else { this.crime(Math.max(this.wanted, 2), '谋杀'); this.dropCash(c.pos); }
  }
  dropCash(p) { const amt = Math.floor(rand(20, 160)); this.P.money += amt; this.hud.cash(amt); }
  addTracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, this.tracerMat); this.scene.add(l); this.tracers.push({ l, t: 0.06 });
  }
  policeNear(r) { const p = this.P.pos; return this.cops.some((c) => !c.dead && c.pos.distanceTo(p) < r) || this.policeCars.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < r); }
  crime(level, why) {
    if (this.deadT > 0) return;
    const nl = clamp(Math.max(this.wanted, level), 0, 6);
    if (nl > this.wanted) { this.wanted = nl; this.hud.msg('通缉等级上升 · ' + why, 2); this.sfx.alert(); }
    this.lostT = 0; this.lastSeen = this.P.pos.clone();
  }
  // ------------------------------------------------------------------ police ----
  updatePolice(dt) {
    const P = this.P; const want = [0, 2, 3, 4, 5, 6, 6][this.wanted] || 0; // r6.2: 6 stars (HUD has six) indexed past the old table -> undefined -> no police at all
    // dispatch
    if (this.policeCars.length < want && rng() < dt * 0.8) {
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      const v = this.traffic.spawnCar('police', this.lostT > 1.5 && this.lastSeen ? this.lastSeen : P.pos, 70, 170, null); // v4.3: reinforcements go to the last sighting
      if (v) { v.siren = true; v.ai.mode = 'chase'; v.ai.chaseSpeed = 22 + this.wanted * 3; v.crew = 2; this.policeCars.push(v); }
    }
    // police cars: chase the player; stop and deploy officers when close
    let seen = false;
    // v4.3 search: once police lose sight they go to the last sighting, not to where you really are
    const searching = this.lostT > 1.5 && this.lastSeen;
    const px = P.car ? P.car.x : P.pos.x, pz = P.car ? P.car.z : P.pos.z;
    for (const v of this.policeCars) {
      if (!v.ai) continue;
      const tx = searching ? this.lastSeen.x + Math.sin(this.lostT * 0.3 + v.x) * 20 : px, tz = searching ? this.lastSeen.z + Math.cos(this.lostT * 0.3 + v.z) * 20 : pz; const d = Math.hypot(tx - v.x, tz - v.z);
      if (this.wanted === 0) { v.siren = false; v.ai.mode = 'lane'; v.ai.mode = 'flee'; v.ai.target = new THREE.Vector3(v.x * 2 - tx, 0, v.z * 2 - tz); continue; }
      // route: follow the road grid towards the player (aim at the nearest road point beyond 40 m), direct pursuit when close
      v.ai.target = d < 45 ? new THREE.Vector3(tx, 0, tz) : this.roadWaypoint(v, tx, tz);
      v.ai.chaseSpeed = d < 30 ? (P.car ? 26 : 9) : 22 + this.wanted * 3;
      if (Math.hypot(px - v.x, pz - v.z) < 90 && this.los(v.x, 1.2, v.z, px, 1.2, pz)) seen = true;
      if (!P.car && !searching && d < 16 && v.crew > 0 && Math.abs(v.speed) < 3) { // deploy
        for (let i = 0; i < v.crew; i++) {
          const c = new Character(this.scene, 'cop'); const side = i ? 1 : -1; const lx = Math.cos(v.yaw) * side, lz = -Math.sin(v.yaw) * side;
          c.pos.set(v.x + lx * 2, this.city.groundH(v.x, v.z), v.z + lz * 2); c.isCop = true; c.ai = { mode: 'cop', fireT: rand(0.8, 2) }; c.health = 100; this.cops.push(c);
        }
        v.crew = 0; v.input.throttle = 0; v.ai.chaseSpeed = 0;
      }
      if (!v.crew && !P.car) { v.ai.chaseSpeed = 0; v.input.handbrake = true; }
      // shoot at the player's car from moving cruisers
      if (P.car && d < 28 && seen && rng() < dt * 0.6 * this.wanted) this.damagePlayer(rand(3, 7));
    }
    // officers on foot
    for (const c of this.cops) {
      if (c.dead) { c.update(dt); continue; }
      const rd = Math.hypot(px - c.pos.x, pz - c.pos.z);
      const vis = rd < 60 && this.los(c.pos.x, 1.6, c.pos.z, px, 1.2, pz);
      const tx = !vis && searching ? this.lastSeen.x : px, tz = !vis && searching ? this.lastSeen.z : pz; const dx = tx - c.pos.x, dz = tz - c.pos.z; const d = Math.hypot(dx, dz);
      if (vis) seen = true;
      c.yaw += angWrap(Math.atan2(dx, dz) - c.yaw) * (1 - Math.exp(-8 * dt));
      let sp = 0;
      if (this.wanted === 0) { sp = 1.3; }
      else if (d > 9 || !vis) sp = d > 25 ? 5.5 : 3.6;
      if (sp) { const nx = c.pos.x + Math.sin(c.yaw) * sp * dt, nz = c.pos.z + Math.cos(c.yaw) * sp * dt; const r = this.city.col.resolve(nx, nz, 0.35, 0.5); c.pos.x = r.x; c.pos.z = r.z; }
      c.pos.y = lerp(c.pos.y, this.city.groundH(c.pos.x, c.pos.z), 1 - Math.exp(-15 * dt));
      c.setLocomotion(sp, dt); c.update(dt);
      c.ai.fireT -= dt;
      if (this.wanted > 0 && vis && d < 40 && c.ai.fireT <= 0) {
        c.ai.fireT = rand(0.7, 1.5) / (0.6 + this.wanted * 0.2); this.sfx.shot(0.5);
        const from = c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw) * 0.5, 1.45, Math.cos(c.yaw) * 0.5));
        const hit = rng() < clamp(0.45 - d * 0.008, 0.08, 0.45) * (P.car ? 0.5 : 1) * (P.cover ? 0.35 : 1);
        const to = new THREE.Vector3(tx + (hit ? 0 : rand(-2, 2)), 1.1 + (hit ? 0 : rand(-0.6, 1)), tz + (hit ? 0 : rand(-2, 2)));
        this.addTracer(from, to); if (hit) this.damagePlayer(rand(5, 11));
      }
      // arrest
      if (!P.car && this.wanted <= 2 && rd < 1.8 && this.playerSpeed < 0.8) { this.bustT = (this.bustT || 0) + dt; if (this.bustT > 1.6) this.busted(); } 
    }
    if (this.wanted > 0 && this.police.update(dt, seen)) seen = true; // helicopter spotlight
    else if (this.wanted === 0) this.police.update(dt, false);
    if (this.wanted > 0) {
      if (seen) { this.lostT = 0; this.lastSeen = P.pos.clone(); }
      else {
        // hiding still out of sight cools down faster; you must also be outside the red search circle (95 m) unless you wait it out
        const still = (this.playerSpeed || 0) < 0.5; this.lostT += dt * (still ? 1.5 : 1);
        const need = 9 + this.wanted * 3; const out = !this.lastSeen || Math.hypot(P.pos.x - this.lastSeen.x, P.pos.z - this.lastSeen.z) > 95;
        if ((this.lostT > need && out) || this.lostT > need * 1.8) { this.hud.msg('你甩掉了警察', 2.5); this.wanted = 0; this.lostT = 0; this.police.log.push('lost'); }
      }
    }
    this.wantedFlash = this.wanted > 0 && this.lostT > 1.5;
    // clean up: far / out of action police
    for (const v of [...this.policeCars]) { const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z); if ((this.wanted === 0 && d > 120) || d > 420) { this.policeCars.splice(this.policeCars.indexOf(v), 1); if (v !== P.car) this.traffic.removeCar(v); } }
    for (const c of [...this.cops]) { const d = c.pos.distanceTo(P.pos); if ((this.wanted === 0 && d > 70) || d > 250 || (c.dead && d > 90)) { this.cops.splice(this.cops.indexOf(c), 1); c.dispose(); } }
  }
  roadWaypoint(v, tx, tz) {
    if (this.city.graph && this.traffic.waypoint) return this.traffic.waypoint(v, tx, tz); // r6.0 map 霓港: shortest path on the road graph
    if (!CYBER) { const w = routeWaypoint(v.x, v.z, tx, tz); if (w) return new THREE.Vector3(w.x, 0, w.z); } // r6.2: shortest road route (was greedy)
    // pick a point on the nearest road axis that moves toward the target: drive along the current road until aligned, then turn
    // r5.0: on a region road (causeway / mainland / pearl island) follow that road toward the target
    const rg = this.city.region; if (rg && (v.x < -22 || Math.abs(v.z) > 372)) { const w = rg.waypoint(v.x, v.z, tx, tz); if (w) return new THREE.Vector3(w.x, 0, w.z); }
    const NSx = [...LAYOUT.islandNS, ...LAYOUT.mainNS], EWz = [...LAYOUT.islandEW, ...LAYOUT.mainEW];
    const nearX = NSx.reduce((a, b) => (Math.abs(b - v.x) < Math.abs(a - v.x) ? b : a)), nearZ = EWz.reduce((a, b) => (Math.abs(b - v.z) < Math.abs(a - v.z) ? b : a));
    const onNS = Math.abs(v.x - nearX) < 8, onEW = Math.abs(v.z - nearZ) < 8;
    const crossBay = (v.x < -25) !== (tx < -25);
    if (crossBay) { // causeway
      if (Math.abs(v.z) < 8) return new THREE.Vector3(tx < v.x ? v.x - 40 : v.x + 40, 0, 0);
      if (onNS) return new THREE.Vector3(nearX, 0, 0);
    }
    const tgtX = NSx.reduce((a, b) => (Math.abs(b - tx) < Math.abs(a - tx) ? b : a)), tgtZ = EWz.reduce((a, b) => (Math.abs(b - tz) < Math.abs(a - tz) ? b : a));
    if (onNS && Math.abs(v.z - tgtZ) > 12) return new THREE.Vector3(nearX, 0, v.z + Math.sign(tgtZ - v.z) * 35);
    if (onEW && Math.abs(v.x - tgtX) > 12) return new THREE.Vector3(v.x + Math.sign(tgtX - v.x) * 35, 0, nearZ);
    if (onNS) return new THREE.Vector3(nearX, 0, tz);
    if (onEW) return new THREE.Vector3(tx, 0, nearZ);
    return new THREE.Vector3(nearX, 0, nearZ);
  }
  los(ax, ay, az, bx, by, bz) { return this.city.col.raycast(ax, ay, az, bx, by, bz) >= 0.999; }
  damagePlayer(n) {
    const P = this.P; if (this.deadT > 0) return;
    const a = Math.min(P.armor, n * 0.7); P.armor -= a; P.health -= n - a; this.hud.hurt();
    if (P.health <= 0) this.wasted();
  }
  wasted() {
    this.P.health = 0; this.deadT = 4; this.hud.big('阵亡', '#e8384f'); this.player.kill(1); this.sfx.alert();
  }
  busted() { this.deadT = 3.5; this.busting = true; this.hud.big('被捕', '#ffffff'); this.bustT = 0; }
  respawn() {
    const P = this.P; const busted = this.busting; this.busting = false;
    if (P.car) { P.car.driver = null; P.car = null; }
    P.onFoot = true; this.player.root.visible = true; this.player.revive();
    P.health = 100; P.armor = busted ? P.armor : 0; P.money = Math.max(0, P.money - (busted ? Math.floor(P.money * 0.08) : 500)); if (busted) { for (const id of ['smg', 'shotgun', 'rifle']) delete P.load.owned[id]; if (!P.load.owned[P.load.cur]) P.load.cur = 'pistol'; }
    this.wanted = 0; this.lostT = 0; P.cover = null; const pa = P.load.owned.pistol; if (pa) pa.reserve = Math.max(pa.reserve, 48);
    const s = busted ? PRECINCT : HOSPITAL; this.tp(s.x, s.z, s.yaw);
    this.hud.big('', '#fff'); this.hud.msg(busted ? '你被保释出狱 · 罚款已扣除' : '你在医院醒来 · 医药费 $500', 3.5);
  }
  // ------------------------------------------------------------------ main update ----
  update(dt) {
    if (!this.started) return;
    dt *= this.slowmo;
    const P = this.P;
    this.input(dt);
    if (this.deadT > 0) { this.deadT -= dt; if (this.deadT <= 0) this.respawn(); }
    // vehicles
    const wet = U.uWet.value;
    for (const v of this.traffic.cars) {
      if (v.driver !== 'player' && !v.ai) { v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true; }
    }
    this.traffic.update(dt, { onFoot: P.onFoot, pos: P.pos }, []);
    this.trafficPhase = this.traffic.phase;
    for (const v of this.traffic.cars) {
      // only simulate cars near the player at full rate
      v.update(dt, this.city, wet);
      if (v.wantsHorn) { v.wantsHorn = false; if (Math.hypot(v.x - P.pos.x, v.z - P.pos.z) < 30) this.sfx.horn(0.35); }
      if (v.health <= 0 && v.ai && v.ai.mode !== 'dead') { v.ai.mode = 'dead'; v.siren = false; }
    }
    this.carCollisions(dt);
    this.peds.update(dt, this);
    // r6.2: fleeing pedestrians steer only away from the threat (people.js), so on the beach / quay edges they ran into the
    // sea and kept "running" under water. Keep everyone not in a car on land: step back to the last dry spot and turn around.
    for (const c of this.peds.list) { if (c.dead) continue; const gh = this.city.groundH(c.pos.x, c.pos.z);
      if (gh < -0.6) { if (c._dry) { c.pos.x = c._dry.x; c.pos.z = c._dry.z; c.pos.y = c._dry.y; } c.yaw += Math.PI; if (c.ai && c.ai.mode === 'flee' && c.ai.from) { c.ai.from.set(c.pos.x * 2 - c.ai.from.x, 0, c.pos.z * 2 - c.ai.from.z); } }
      else (c._dry || (c._dry = new THREE.Vector3())).copy(c.pos); }
    this.updatePolice(dt);
    // player
    if (P.onFoot) this.updateOnFoot(dt);
    else { const v = P.car; P.pos.set(v.x, v.y, v.z); this.playerSpeed = Math.abs(v.speed); if (v.inWater && v.y < -2) { this.toggleCar(); this.tp(v.x, v.z); this.damagePlayer(30); } }
    // r5.0: weapon in hand + upper-body aim layer (player, police, gang)
    { const ov = this.override; const aimP = P.onFoot && !!(this.mouse.aim || this.mouse.down || (ov && (ov.aim || ov.fire)));
      const cw = this.arsenal.cur; this.player.setWeapon(P.onFoot && cw && cw.id !== 'fist' ? cw.id : null);
      this.player.aiming = aimP && cw && !cw.melee; if (this.player.aiming) this.camera.getWorldDirection(this.player.aimDir);
      for (const c of [...this.cops, ...this.gang]) { if (c.dead) { c.aiming = false; continue; } if (!c.weaponId) c.setWeapon(c.isCop ? 'pistol' : (c.id % 3 === 0 ? 'smg' : c.id % 3 === 1 ? 'rifle' : 'pistol'));
        const dx = P.pos.x - c.pos.x, dy = P.pos.y + 1.3 - c.pos.y - 1.45, dz = P.pos.z - c.pos.z; const d = Math.hypot(dx, dz); c.aiming = d < 45; if (c.aiming) c.aimDir.set(dx, dy, dz).normalize(); } }
    if (this.pose && this.pose.c !== this.player) { this.pose.restore(); this.pose = null; } // protagonist switched
    if (this.pose) this.pose.restore();
    this.player.update(dt);
    { // r6.2 reload / melee swing / low-ready carry (src/actionpose.js)
      if (!this.pose) this.pose = new ActionPose(this.player);
      const A = this.arsenal, cw = A.cur; if (A.swingReq) { this.pose.startSwing(A.swingReq, Math.max(0.3, cw.rate * 0.95)); A.swingReq = null; }
      this.pose.apply({ weapon: P.onFoot ? cw : null, aiming: this.player.aiming, reloadP: A.reloadT > 0 && cw.reload ? 1 - A.reloadT / cw.reload : -1, dt });
    }
    this.mission.update(dt); this.missions.update(dt); this.world.update(dt); this.updateGang(dt);
    (this.occ ||= new Occupants(this)).update(dt); // r6.2 visible seated driver / NPC drivers / cabin LOD
    this.arsenal.update(dt); P.reloadT = this.arsenal.reloadT;
    if (this.saveT === undefined) this.saveT = 30; this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 30; this.save(); }
    this.flash.intensity *= Math.exp(-dt * 40);
    for (const t of [...this.tracers]) { t.t -= dt; if (t.t <= 0) { this.scene.remove(t.l); t.l.geometry.dispose(); this.tracers.splice(this.tracers.indexOf(t), 1); } }
    this.crimeCooldown -= dt;
    // population management
    this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnT = 0.5; this.manage(); }
    // lights at night: car head/tail glow, player headlight
    const night = U.uNight.value;
    this.setCarLights(night);
    if (P.car && night > 0.2) { const v = P.car; const f = v.forward(); this.headlight.position.set(v.x + f.x * 2.3, v.y + 0.8, v.z + f.z * 2.3); this.headlight.target.position.set(v.x + f.x * 20, 0, v.z + f.z * 20); this.headlight.intensity = 400 * night; this.headlight.target.updateMatrixWorld(); }
    else this.headlight.intensity = 0;
    { const act = this.policeCars.filter((v) => v.siren).sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z)); const ph = Math.floor(performance.now() / 160) % 2;
      this.sirenLights.forEach((l, i) => { const v = act[i]; if (!v) { l.intensity = 0; return; } l.position.set(v.x, v.y + 2.0, v.z); l.intensity = 40 * (0.3 + U.uNight.value); l.color.setHex((ph + i) % 2 ? 0xff2020 : 0x2040ff); }); }
    this.sfx.update(dt, { wanted: this.wanted, car: P.car, speed: P.car ? Math.abs(P.car.speed) : 0 });
    this.updateCamera(dt);
    this.hud.update(dt, this);
  }
  setCarLights(night) { setCarNight(night); }
  input(dt) {
    const k = this.keys, P = this.P;
    const ov = this.override;
    if (P.car) {
      const v = P.car;
      v.input.throttle = ov ? ov.throttle : (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      v.input.steer = ov ? ov.steer : (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
      v.input.handbrake = ov ? !!ov.handbrake : !!k.Space;
      if (v.type === 'police' && k.KeyE) { v.siren = !v.siren; k.KeyE = false; }
    } else if ((this.mouse.down || (ov && ov.fire)) && !this.world.menu && !this.world.phoneOpen) { this.arsenal.trigger(true, this.mouse.edge || (ov && ov.fire === 'edge')); this.mouse.edge = false; if (ov && ov.fire === 'edge') ov.fire = false; }
  }
  updateOnFoot(dt) {
    const P = this.P, k = this.keys, c = this.player; const ov = this.override;
    let mx = 0, mz = 0;
    if (ov) { mx = ov.mx || 0; mz = ov.mz || 0; }
    else { mz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0); }
    if (this.deadT > 0) { mx = mz = 0; }
    const yawC = this.cam.yaw + Math.PI; // camera forward yaw
    const fx = Math.sin(yawC), fz = Math.cos(yawC), rx = -Math.cos(yawC), rz = Math.sin(yawC);
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx; const len = Math.hypot(dx, dz);
    let sprint = ov ? !!ov.sprint : !!(k.ShiftLeft || k.ShiftRight); const walk = !!(k.ControlLeft || k.AltLeft);
    // v4.3 stamina: sprinting drains it; at 0 you can't sprint until it refills past 25
    if (P.stamina === undefined) P.stamina = 100;
    if (P.tired && P.stamina > 25) P.tired = false; if (P.stamina <= 0.5) P.tired = true; if (P.tired) sprint = false;
    P.stamina = clamp(P.stamina + ((sprint && Math.hypot(mx, mz) > 0.01) ? -12 : 16) * dt, 0, 100);
    if (P.cover) { if (Math.hypot(mx, mz) > 0.01 && Math.hypot(P.pos.x - P.cover.x, P.pos.z - P.cover.z) > 0.8) P.cover = null; else if (Math.hypot(mx, mz) > 0.01) { mx *= 0.35; mz *= 0.35; sprint = false; } }
    let sp = 0;
    const gh = this.city.groundH(P.pos.x, P.pos.z);
    const swim = gh < -1.25;
    if (len > 0.01) { dx /= len; dz /= len; sp = swim ? 1.6 : walk ? 1.5 : sprint ? 6.8 : 4.0; P.yaw += angWrap(Math.atan2(dx, dz) - P.yaw) * (1 - Math.exp(-12 * dt)); }
    P.sprint = sprint && len > 0.01 && !swim;
    if (this.mouse.aim || this.mouse.down || (ov && (ov.aim || ov.fire))) P.yaw = yawC; // face aim direction
    this.curSpeed = damp(this.curSpeed || 0, sp, 10, dt);
    const nx = P.pos.x + Math.sin(P.yaw) * this.curSpeed * dt * (len > 0.01 ? 1 : 0), nz = P.pos.z + Math.cos(P.yaw) * this.curSpeed * dt * (len > 0.01 ? 1 : 0);
    const r = this.city.col.resolve(nx, nz, 0.35, P.pos.y + 0.5);
    // vehicles block the player
    let px = r.x, pz = r.z;
    for (const v of this.traffic.cars) { const ddx = px - v.x, ddz = pz - v.z; const f = v.forward(); const al = ddx * f.x + ddz * f.z, lt = ddx * f.z - ddz * f.x; const hl = v.dims.L / 2 + 0.3, hw = v.dims.W / 2 + 0.3; if (Math.abs(al) < hl && Math.abs(lt) < hw) { const pa = hl - Math.abs(al), pl = hw - Math.abs(lt); if (pa < pl) { px += f.x * Math.sign(al) * pa; pz += f.z * Math.sign(al) * pa; } else { px += f.z * Math.sign(lt) * pl; pz += -f.x * Math.sign(lt) * pl; } if (Math.abs(v.speed) > 4) { this.damagePlayer(Math.abs(v.speed) * 2); } } }
    P.pos.x = px; P.pos.z = pz;
    // vertical
    const ground = swim ? -1.35 : gh;
    if ((k.Space || (ov && ov.jump)) && P.grounded && !swim) { P.vy = 4.6; P.grounded = false; if (ov) ov.jump = false; }
    P.vy -= 14 * dt; P.pos.y += P.vy * dt;
    if (P.pos.y <= ground) { P.pos.y = ground; P.vy = 0; P.grounded = true; }
    this.playerSpeed = this.curSpeed * (len > 0.01 ? 1 : 0);
    c.yaw = P.yaw; c.setLocomotion(this.playerSpeed, dt);
  }
  carCollisions(dt) {
    const cars = this.traffic.cars;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j]; const dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz; if (d2 > 49) continue;
      // three-circle approximation per car
      let best = null;
      const fa = a.forward(), fb = b.forward(); const ra = a.dims.W * 0.5, rb = b.dims.W * 0.5; const ha = a.dims.L / 2 - ra, hb = b.dims.L / 2 - rb;
      for (const ka of [-1, 0, 1]) for (const kb of [-1, 0, 1]) {
        const ax = a.x + fa.x * ha * ka, az = a.z + fa.z * ha * ka, bx = b.x + fb.x * hb * kb, bz = b.z + fb.z * hb * kb;
        const ex = bx - ax, ez = bz - az; const d = Math.hypot(ex, ez); const pen = ra + rb - d;
        if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: ex / (d || 1), nz: ez / (d || 1) };
      }
      if (!best) continue;
      const ma = a.type === 'van' ? 1.5 : 1, mb = b.type === 'van' ? 1.5 : 1; const wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.x -= best.nx * best.pen * wa; a.z -= best.nz * best.pen * wa; b.x += best.nx * best.pen * wb; b.z += best.nz * best.pen * wb;
      const rv = (b.vx - a.vx) * best.nx + (b.vz - a.vz) * best.nz;
      if (rv < 0) { const jimp = -rv * 1.25; a.vx -= best.nx * jimp * wa; a.vz -= best.nz * jimp * wa; b.vx += best.nx * jimp * wb; b.vz += best.nz * jimp * wb;
        if (-rv > 5) { a.health -= -rv * 1.5; b.health -= -rv * 1.5; if ((a.driver === 'player' || b.driver === 'player')) { this.sfx.crash(Math.min(1, -rv / 20)); const other = a.driver === 'player' ? b : a; if (other.type === 'police') this.crime(Math.max(this.wanted, 1), '撞击警车'); } } }
    }
    // cars vs pedestrians / cops
    const walkers = this.peds.list.concat(this.cops); // perf_debug1: was rebuilt per moving car per frame (GC churn)
    for (const v of cars) {
      const sp = Math.abs(v.speed); if (sp < 3.5) continue; const f = v.forward();
      for (const c of walkers) {
        if (c.dead) continue; const ddx = c.pos.x - v.x, ddz = c.pos.z - v.z; const al = ddx * f.x + ddz * f.z, lt = ddx * f.z - ddz * f.x;
        if (Math.abs(al) < v.dims.L / 2 + 0.3 && Math.abs(lt) < v.dims.W / 2 + 0.3) { c.kill(al > 0 ? -1 : 1); c.pos.x += f.x * 1.5; c.pos.z += f.z * 1.5; if (v.driver === 'player') { if (c.isCop) this.crime(Math.max(this.wanted + 1, 3), '撞倒警察'); else if (this.policeNear(60) || rng() < 0.5) this.crime(Math.max(this.wanted, 1), '肇事'); this.dropCash(c.pos); } else this.peds.panic(c.pos, 20); }
      }
    }
  }
  manage() {
    const P = this.P; const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    // traffic
    const civ = this.traffic.cars.filter((v) => !v.parked && (v.type !== 'police' || !this.policeCars.includes(v)));
    for (const v of civ) { const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z); if (d > 330 && v !== P.car && v !== this.parked) this.traffic.removeCar(v); }
    if (civ.length < 27) this.traffic.spawnCar(pick(['sedan', 'sedan', 'suv', 'pickup', 'van', 'taxi', 'sport2', 'sedan']), P.pos, 110, 260, fwd);
    // parked cars (Tideline curb lane)
    for (const s of this.city.parking || []) {
      const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z);
      if (s.car && !this.traffic.cars.includes(s.car)) s.car = null;
      if (s.car && (s.car.driver === 'player' || Math.hypot(s.car.x - s.x, s.car.z - s.z) > 3)) { s.car = null; continue; }
      if (!s.car && s.fill && d < 115 && d > 25) { const v = new Vehicle(this.scene, pick(['sedan', 'suv', 'sport2', 'pickup', 'van', 'taxi'])); v.place(s.x, s.z, s.yaw); v.ai = null; v.parked = true; this.traffic.cars.push(v); s.car = v; }
      else if (s.car && d > 150 && s.car !== P.car) { this.traffic.removeCar(s.car); s.car = null; }
    }
    // pedestrians
    for (const c of [...this.peds.list]) { if (c.pos.distanceTo(P.pos) > 150) this.peds.remove(c); }
    if (this.peds.list.length < 86) this.peds.spawn(P.pos, 50, 130);
  }
  updateCamera(dt, snap = false) {
    const P = this.P, C = this.cam;
    let target, dist, height, side = 0;
    const idle = performance.now() - C.lastMouse > 1800;
    if (P.car) {
      const v = P.car; target = new THREE.Vector3(v.x, v.y + 1.35, v.z);
      dist = (v.type === 'van' ? 9 : 7.2) + Math.min(3, Math.abs(v.speed) * 0.06); height = 0.0;
      if (idle && Math.abs(v.speed) > 2) C.yaw += angWrap(v.yaw + Math.PI - C.yaw) * (1 - Math.exp(-2.5 * dt));
      if (idle) C.pitch = damp(C.pitch, -0.16, 2, dt);
      if (C.mode === 1) { // bonnet cam
        const f = v.forward(); const p = v.cockpitCam ? v.cockpitCam(new THREE.Vector3()) : new THREE.Vector3(v.x, v.y + 1.25, v.z).addScaledVector(f, 0.3); // r6.2 eye point inside the modeled cabin
        this.camera.position.copy(p); this.camera.lookAt(p.clone().addScaledVector(f, 10).add(new THREE.Vector3(0, -0.3, 0))); return;
      }
    } else {
      target = P.pos.clone(); target.y += P.cover ? 1.0 : 1.55; const aim = this.mouse.aim || (this.override && this.override.aim); dist = aim ? 2.0 : 3.3; side = aim ? 0.55 : 0.42; height = 0;
    }
    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    const off = new THREE.Vector3(Math.sin(C.yaw) * cp, -sp, Math.cos(C.yaw) * cp).multiplyScalar(dist);
    const right = new THREE.Vector3(-Math.cos(C.yaw), 0, Math.sin(C.yaw));
    { // r6.2: the shoulder offset could push the look-at point into a wall / pole when standing against it, and a ray
      // cast from inside a box returns 0, leaving the camera inside the building; clamp the offset against geometry first
      const hx = target.x, hz = target.z; target.addScaledVector(right, -side);
      if (side > 0) { const ts = this.city.col.raycast(hx, target.y, hz, target.x, target.y, target.z); if (ts < 1) { const k = Math.max(0, ts - 0.25 / side); target.x = hx + (target.x - hx) * k; target.z = hz + (target.z - hz) * k; } }
    }
    let want = target.clone().add(off); want.y += height;
    // collide with buildings
    const t = this.city.col.raycast(target.x, target.y, target.z, want.x, want.y, want.z);
    if (t < 1) want = target.clone().lerp(want, Math.max(0.05, t - 0.25 / Math.max(1, dist)));
    want.y = Math.max(want.y, this.city.groundH(want.x, want.z) + 0.3);
    if (snap) C.pos.copy(want); else C.pos.lerp(want, 1 - Math.exp(-(P.car ? 14 : 20) * dt));
    // r6.2: the smoothed camera lags behind `want`, so for a few frames it could sit inside / behind a wall the ray had
    // already pulled `want` in front of (see-through walls when turning next to a building): re-test the smoothed position
    if (!snap) { const t2 = this.city.col.raycast(target.x, target.y, target.z, C.pos.x, C.pos.y, C.pos.z); if (t2 < 1) C.pos.copy(target).lerp(C.pos, Math.max(0.05, t2 - 0.25 / Math.max(1, dist))); }
    this.camera.position.copy(C.pos);
    C.look.copy(target);
    this.camera.lookAt(C.look);
  }
  state() {
    const P = this.P; return {
      pos: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], inCar: !!P.car, carType: P.car && P.car.type, speedKmh: P.car ? Math.round(Math.abs(P.car.speed) * 3.6) : 0,
      wanted: this.wanted, policeCars: this.policeCars.length, cops: this.cops.filter((c) => !c.dead).length, health: Math.round(P.health), armor: Math.round(P.armor), money: P.money,
      traffic: this.traffic.cars.length, peds: this.peds.list.length, deadPeds: this.peds.list.filter((c) => c.dead).length,
      weapon: P.load.cur, clip: (P.load.owned[P.load.cur] || {}).clip, reserve: (P.load.owned[P.load.cur] || {}).reserve, bank: P.bank, stamina: Math.round(P.stamina || 0),
      who: this.world.profiles[this.world.cur] ? this.world.profiles[this.world.cur].name : '', mission: this.missions.active ? this.missions.active.id + ':' + this.missions.stage : '', cover: !!P.cover,
      heli: !!this.police.heli, roadblocks: this.police.blocks.length, gang: this.gang.filter((c) => !c.dead).length,
    };
  }
  // v4.3 hostile gang members (码头火并): hold near their cover spot, strafe, fire when they can see you
  updateGang(dt) {
    const P = this.P; const px = P.car ? P.car.x : P.pos.x, pz = P.car ? P.car.z : P.pos.z;
    for (const c of [...this.gang]) {
      if (c.dead) { c.update(dt); if (c.pos.distanceTo(P.pos) > 160) { this.gang.splice(this.gang.indexOf(c), 1); c.dispose(); } continue; }
      if (!c.hostile) { c.setLocomotion(0, dt); c.update(dt); continue; }
      const dx = px - c.pos.x, dz = pz - c.pos.z; const d = Math.hypot(dx, dz);
      const vis = d < 50 && this.los(c.pos.x, 1.5, c.pos.z, px, 1.2, pz);
      c.yaw += angWrap(Math.atan2(dx, dz) - c.yaw) * (1 - Math.exp(-6 * dt));
      // strafe around the home cover spot
      const h = c.ai.home; c.ai.st = (c.ai.st || rand(0, 6)) + dt; const tx = h.x + Math.sin(c.ai.st * 0.7) * 2.2, tz = h.z + Math.cos(c.ai.st * 0.5) * 1.5;
      const mvx = tx - c.pos.x, mvz = tz - c.pos.z; const md = Math.hypot(mvx, mvz); let sp = 0;
      if (md > 0.3) { sp = Math.min(3, md * 2); const r = this.city.col.resolve(c.pos.x + mvx / md * sp * dt, c.pos.z + mvz / md * sp * dt, 0.35, 0.5); c.pos.x = r.x; c.pos.z = r.z; }
      c.pos.y = lerp(c.pos.y, this.city.groundH(c.pos.x, c.pos.z), 1 - Math.exp(-15 * dt));
      c.setLocomotion(sp, dt); c.update(dt);
      c.ai.fireT -= dt;
      if (vis && d < 45 && c.ai.fireT <= 0 && this.deadT <= 0) {
        c.ai.fireT = rand(0.9, 1.8); this.sfx.shot(0.45);
        const from = c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw) * 0.5, 1.45, Math.cos(c.yaw) * 0.5));
        const hit = rng() < clamp(0.4 - d * 0.008, 0.06, 0.4) * (P.cover ? 0.35 : 1) * (P.car ? 0.5 : 1);
        this.addTracer(from, new THREE.Vector3(px + (hit ? 0 : rand(-2, 2)), 1.1 + (hit ? 0 : rand(-0.6, 1)), pz + (hit ? 0 : rand(-2, 2)))); if (hit) this.damagePlayer(rand(4, 9));
      }
    }
  }
  // v4.3 autosave (localStorage): cash, bank, guns, assets, mission record for both protagonists
  save() {
    if (this.SNAP) return; try {
      const pr = this.world.profiles.map((p) => ({ money: p.P.money, bank: p.P.bank, load: p.P.load, assets: p.P.assets, outfit: p.P.outfit }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ pr, done: this.missions.done, valet: this.mission.jobs }));
    } catch (e) { }
  }
  loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!s) return false;
      s.pr.forEach((d, i) => { const p = this.world.profiles[i]; if (!p) return; Object.assign(p.P, { money: d.money, bank: d.bank, load: d.load, assets: d.assets || [], outfit: d.outfit }); });
      this.missions.done = s.done || {}; if (s.valet) this.mission.jobs = s.valet; if (!this.P.load.owned[this.P.load.cur]) this.P.load.cur = 'fist'; this.hud.msg('已读取存档', 2); return true; } catch (e) { return false; }
  }
  // ---- test helpers
  // r6.2 per-test reset (shot.cjs calls __G.reset() before every plan step unless the step sets keep:true): back to the start
  // state so one regression step can no longer leak a mission / wanted level / car / loadout into the next one.
  testReset() {
    if (!this._init) return;
    const W = this.world; if (W.menu) W.closeMenu(); if (W.phoneOpen) W.togglePhone(false);
    if (this.arsenal.wheelOpen) this.arsenal.openWheel(false); this.slowmo = 1;
    if (W.cur) { W.switchChar(); } // back to the first protagonist
    if (this.P.car) this.toggleCar();
    this.override = null; this.keys = {}; this.mouse = { down: false, aim: false }; this.deadT = 0; this.busting = false; this.bustT = 0;
    if (this.missions.active) { this.missions.active = null; this.missions.stage = ''; this.missions.clearGoal(); this.missions.obj(''); }
    this.missions.cool = 0; this.missions.data = {}; this.missions.startMk.forEach((b) => (b.visible = true));
    const V = this.mission; if (V.state !== 'idle') { V.state = 'idle'; V.cool = 0; V.target = null; V.dropMk.visible = false; V.carMk.visible = false; V.standMk.visible = true; V.obj(''); }
    if (V.car && V.car !== this.parked && this.traffic.cars.includes(V.car)) this.traffic.removeCar(V.car); V.car = null;
    this.wanted = 0; this.lostT = 0; this.lastSeen = null; this.wantedFlash = false; this.crimeCooldown = 0;
    for (const v of [...this.policeCars]) if (this.traffic.cars.includes(v)) this.traffic.removeCar(v); this.policeCars.length = 0;
    for (const b of this.police.blocks) for (const c of b.cars) if (this.traffic.cars.includes(c)) this.traffic.removeCar(c); this.police.blocks.length = 0; this.police.removeHeli(); this.police.escT = 0; this.police.blockT = 10;
    for (const c of [...this.cops, ...this.gang]) c.dispose(); this.cops.length = 0; this.gang.length = 0;
    for (const v of [...this.traffic.cars]) if (v.health <= 0 || (v.ai && v.ai.mode === 'dead' && v !== this.parked)) this.traffic.removeCar(v);
    for (const c of [...this.peds.list]) if (c.dead || (c.ai && c.ai.mode === 'flee')) this.peds.remove(c);
    const P = this.P, I = this._init; this.player.revive(); this.player.root.visible = true;
    Object.assign(P, { health: 100, armor: I.armor, money: I.money, bank: I.bank, stamina: 100, tired: false, cover: null, vy: 0, grounded: true, sprint: false, assets: [], outfit: null, load: JSON.parse(I.load) });
    this.arsenal.reloadT = 0; this.arsenal.fireT = 0; this.arsenal.recoil = 0; P.reloadT = 0; this.waypoint = null; this.cam.mode = 0; this.cam.pitch = -0.12;
    if (this.parked && this.traffic.cars.includes(this.parked)) { this.parked.health = 100; this.parked.driver = null; this.parked.place(284.5, 22, Math.PI); this.parked.ai = null; }
    this.tp(280.5, 36, Math.PI); this.curSpeed = 0; this.playerSpeed = 0;
  }
  carNearPlayer(type = 'sedan', dist = 5) {
    const P = this.P; const v = new Vehicle(this.scene, type); const yaw = P.yaw; v.place(P.pos.x + Math.sin(yaw) * dist, P.pos.z + Math.cos(yaw) * dist, yaw + Math.PI / 2); v.ai = { mode: 'lane', seg: this.city.segs[0], dir: 1, lane: 0, cruise: 0, stuck: 0 }; v.ai.mode = 'dead'; this.traffic.cars.push(v); return v;
  }
}
