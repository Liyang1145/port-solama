// Gameplay: player on foot / driving, third-person + chase camera, traffic & pedestrians, carjacking,
// pistol combat, 1-5 star wanted level with police pursuit, HUD + minimap.
import * as THREE from 'three';
import { Vehicle, Traffic, prepareSport, prepareModels, setCarNight } from './vehicles.js';
import { Character, Pedestrians, prepareCharacters } from './people.js';
import { HUD } from './hud.js';
import { Sfx } from './sfx.js';
import { clamp, lerp, rand, pick, angWrap, rng, damp } from './util.js';
import { LAYOUT } from './city.js';
import { U } from './env.js';
import { Valet } from './mission.js';

const HOSPITAL = { x: 120, z: 75, yaw: Math.PI / 2 };
const PRECINCT = { x: -20, z: -225, yaw: 0 };

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.timeScale = 30; this.trafficPhase = 0;
    prepareSport(this.G.car); prepareModels(this.G);
    prepareCharacters(this.G);
    this.traffic = new Traffic(this.scene, this.city);
    this.peds = new Pedestrians(this.scene, this.city);
    this.hud = new HUD(this.city);
    this.sfx = new Sfx();
    // player
    this.player = new Character(this.scene, 'man', { player: true });
    this.P = { pos: this.player.pos, yaw: 0, vy: 0, onFoot: true, car: null, health: 100, armor: 40, money: 5000, ammo: 12, clip: 12, reserve: 96, reloadT: 0, fireT: 0, grounded: true, sprint: false };
    this.cam = { yaw: Math.PI, pitch: -0.12, dist: 3.4, lastMouse: 0, mode: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.keys = {}; this.mouse = { down: false, aim: false };
    this.wanted = 0; this.lostT = 0; this.wantedFlash = false; this.cops = []; this.policeCars = []; this.crimeCooldown = 0;
    this.tracers = []; this.spawnT = 0; this.msgT = 0; this.deadT = 0; this.override = null;
    // muzzle flash light
    this.flash = new THREE.PointLight(0xffc070, 0, 8, 2); this.scene.add(this.flash);
    this.sirenLights = [new THREE.PointLight(0xff2020, 0, 22, 2), new THREE.PointLight(0x2040ff, 0, 22, 2)]; for (const l of this.sirenLights) this.scene.add(l);
    this.headlight = new THREE.SpotLight(0xfff0dd, 0, 60, 0.55, 0.5, 1.4); this.headlight.castShadow = false; this.scene.add(this.headlight); this.scene.add(this.headlight.target);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 });
    this.bindInput();
    this.mission = new Valet(this);
  }
  // ------------------------------------------------------------------ setup / input ----
  bindInput() {
    const c = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.toggleCar();
      if (e.code === 'KeyR') this.reload();
      if (e.code === 'KeyT') this.skipTime(1);
      if (e.code === 'KeyV') this.cam.mode = (this.cam.mode + 1) % 2;
      if (e.code === 'KeyH' && this.P.car) this.sfx.horn();
      if (e.code === 'KeyM') this.hud.toggleBig();
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    c.addEventListener('click', () => { if (document.pointerLockElement !== c) c.requestPointerLock?.(); this.sfx.resume(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== c) return;
      this.cam.yaw -= e.movementX * 0.0024; this.cam.pitch = clamp(this.cam.pitch - e.movementY * 0.0022, -1.2, 0.6); this.cam.lastMouse = performance.now();
    });
    addEventListener('mousedown', (e) => { if (document.pointerLockElement !== c) return; if (e.button === 0) this.mouse.down = true; if (e.button === 2) this.mouse.aim = true; });
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
    if (!snap) this.sfx.resume();
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
  reload() { const P = this.P; if (P.clip >= 12 || P.reserve <= 0 || P.reloadT > 0) return; P.reloadT = 1.3; this.sfx.reload(); }
  aimRay() {
    const o = this.camera.position.clone(); const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    return { o, d };
  }
  shoot() {
    const P = this.P; if (!P.onFoot || P.reloadT > 0 || P.fireT > 0 || this.deadT > 0) return false;
    if (P.clip <= 0) { this.reload(); return false; }
    P.clip--; P.fireT = 0.22; this.sfx.shot();
    const { o, d } = this.aimRay();
    // start the ray at the player's shoulder depth to avoid hitting things behind the player
    const ds = o.distanceTo(this.player.pos) ; o.addScaledVector(d, Math.max(0, ds - 0.5));
    const maxD = 120; let hitT = maxD; let hitWhat = null;
    const tb = this.city.col.raycast(o.x, o.y, o.z, o.x + d.x * maxD, o.y + d.y * maxD, o.z + d.z * maxD); hitT = tb * maxD;
    const testChar = (c) => { if (c.dead) return; const cp = c.pos.clone(); cp.y += 1.0; const t = cp.clone().sub(o).dot(d); if (t < 0 || t > hitT) return; const q = o.clone().addScaledVector(d, t); const lat = Math.hypot(q.x - cp.x, q.z - cp.z); if (lat < 0.42 && q.y > c.pos.y && q.y < c.pos.y + 1.85) { hitT = t; hitWhat = { c, head: q.y > c.pos.y + 1.5 }; } };
    for (const c of this.peds.list) testChar(c); for (const c of this.cops) testChar(c);
    for (const v of this.traffic.cars) { if (v === P.car) continue; const cp = new THREE.Vector3(v.x, v.y + 0.8, v.z); const t = cp.clone().sub(o).dot(d); if (t < 0 || t > hitT) continue; const q = o.clone().addScaledVector(d, t); if (q.distanceTo(cp) < v.dims.W * 0.6) { hitT = t; hitWhat = { v }; } }
    const end = o.clone().addScaledVector(d, hitT);
    this.addTracer(this.player.pos.clone().add(new THREE.Vector3(Math.sin(P.yaw) * 0.5, 1.45, Math.cos(P.yaw) * 0.5)), end);
    this.flash.position.copy(this.player.pos).add(new THREE.Vector3(Math.sin(P.yaw) * 0.6, 1.5, Math.cos(P.yaw) * 0.6)); this.flash.intensity = 30;
    this.peds.panic(this.P.pos, 45);
    if (this.policeNear(60) || this.peds.list.some((c) => !c.dead && c.pos.distanceTo(this.P.pos) < 30)) this.crime(1, '当街开枪');
    if (hitWhat) {
      if (hitWhat.c) { const c = hitWhat.c; c.health -= hitWhat.head ? 100 : 45; if (c.health <= 0) this.killChar(c, d); }
      if (hitWhat.v) { const v = hitWhat.v; v.health -= 12; if (v.ai && v.ai.mode === 'lane') { v.ai.mode = 'flee'; v.ai.target = new THREE.Vector3(v.x * 2 - this.P.pos.x, 0, v.z * 2 - this.P.pos.z); } }
    }
    return true;
  }
  killChar(c, d) {
    const fwd = Math.sin(c.yaw) * d.x + Math.cos(c.yaw) * d.z; c.kill(fwd > 0 ? -1 : 1);
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
    const P = this.P; const want = [0, 2, 3, 4, 5, 6][this.wanted];
    // dispatch
    if (this.policeCars.length < want && rng() < dt * 0.8) {
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      const v = this.traffic.spawnCar('police', P.pos, 70, 170, null);
      if (v) { v.siren = true; v.ai.mode = 'chase'; v.ai.chaseSpeed = 22 + this.wanted * 3; v.crew = 2; this.policeCars.push(v); }
    }
    // police cars: chase the player; stop and deploy officers when close
    let seen = false;
    for (const v of this.policeCars) {
      if (!v.ai) continue;
      const tx = P.car ? P.car.x : P.pos.x, tz = P.car ? P.car.z : P.pos.z; const d = Math.hypot(tx - v.x, tz - v.z);
      if (this.wanted === 0) { v.siren = false; v.ai.mode = 'lane'; v.ai.mode = 'flee'; v.ai.target = new THREE.Vector3(v.x * 2 - tx, 0, v.z * 2 - tz); continue; }
      // route: follow the road grid towards the player (aim at the nearest road point beyond 40 m), direct pursuit when close
      v.ai.target = d < 45 ? new THREE.Vector3(tx, 0, tz) : this.roadWaypoint(v, tx, tz);
      v.ai.chaseSpeed = d < 30 ? (P.car ? 26 : 9) : 22 + this.wanted * 3;
      if (this.los(v.x, 1.2, v.z, tx, 1.2, tz) && d < 90) seen = true;
      if (!P.car && d < 16 && v.crew > 0 && Math.abs(v.speed) < 3) { // deploy
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
      const tx = P.car ? P.car.x : P.pos.x, tz = P.car ? P.car.z : P.pos.z; const dx = tx - c.pos.x, dz = tz - c.pos.z; const d = Math.hypot(dx, dz);
      const vis = d < 60 && this.los(c.pos.x, 1.6, c.pos.z, tx, 1.2, tz);
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
        const hit = rng() < clamp(0.45 - d * 0.008, 0.08, 0.45) * (P.car ? 0.5 : 1);
        const to = new THREE.Vector3(tx + (hit ? 0 : rand(-2, 2)), 1.1 + (hit ? 0 : rand(-0.6, 1)), tz + (hit ? 0 : rand(-2, 2)));
        this.addTracer(from, to); if (hit) this.damagePlayer(rand(5, 11));
      }
      // arrest
      if (!P.car && this.wanted <= 2 && d < 1.8 && this.playerSpeed < 0.8) { this.bustT = (this.bustT || 0) + dt; if (this.bustT > 1.6) this.busted(); } 
    }
    if (this.wanted > 0) {
      if (seen) { this.lostT = 0; this.lastSeen = P.pos.clone(); }
      else { this.lostT += dt; if (this.lostT > 9 + this.wanted * 3) { this.hud.msg('你甩掉了警察', 2.5); this.wanted = 0; this.lostT = 0; } }
    }
    this.wantedFlash = this.wanted > 0 && this.lostT > 1.5;
    // clean up: far / out of action police
    for (const v of [...this.policeCars]) { const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z); if ((this.wanted === 0 && d > 120) || d > 420) { this.policeCars.splice(this.policeCars.indexOf(v), 1); if (v !== P.car) this.traffic.removeCar(v); } }
    for (const c of [...this.cops]) { const d = c.pos.distanceTo(P.pos); if ((this.wanted === 0 && d > 70) || d > 250 || (c.dead && d > 90)) { this.cops.splice(this.cops.indexOf(c), 1); c.dispose(); } }
  }
  roadWaypoint(v, tx, tz) {
    // pick a point on the nearest road axis that moves toward the target: drive along the current road until aligned, then turn
    const NSx = [...LAYOUT.islandNS, ...LAYOUT.mainNS], EWz = [...LAYOUT.islandEW, ...LAYOUT.mainEW];
    const nearX = NSx.reduce((a, b) => (Math.abs(b - v.x) < Math.abs(a - v.x) ? b : a)), nearZ = EWz.reduce((a, b) => (Math.abs(b - v.z) < Math.abs(a - v.z) ? b : a));
    const onNS = Math.abs(v.x - nearX) < 8, onEW = Math.abs(v.z - nearZ) < 8;
    const crossBay = (v.x < -560) !== (tx < -560);
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
    P.health = 100; P.armor = busted ? P.armor : 0; P.money = Math.max(0, P.money - (busted ? Math.floor(P.money * 0.08) : 500));
    this.wanted = 0; this.lostT = 0; P.clip = 12; P.reserve = Math.max(P.reserve, 48);
    const s = busted ? PRECINCT : HOSPITAL; this.tp(s.x, s.z, s.yaw);
    this.hud.big('', '#fff'); this.hud.msg(busted ? '你被保释出狱 · 罚款已扣除' : '你在医院醒来 · 医药费 $500', 3.5);
  }
  // ------------------------------------------------------------------ main update ----
  update(dt) {
    if (!this.started) return;
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
    this.updatePolice(dt);
    // player
    if (P.onFoot) this.updateOnFoot(dt);
    else { const v = P.car; P.pos.set(v.x, v.y, v.z); this.playerSpeed = Math.abs(v.speed); if (v.inWater && v.y < -2) { this.toggleCar(); this.tp(v.x, v.z); this.damagePlayer(30); } }
    this.player.update(dt);
    this.mission.update(dt);
    // timers
    P.fireT -= dt; if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { const n = Math.min(12 - P.clip, P.reserve); P.clip += n; P.reserve -= n; } }
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
    } else if (this.mouse.down) this.shoot();
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
    const sprint = ov ? !!ov.sprint : !!(k.ShiftLeft || k.ShiftRight); const walk = !!(k.ControlLeft || k.AltLeft);
    let sp = 0;
    const gh = this.city.groundH(P.pos.x, P.pos.z);
    const swim = gh < -1.25;
    if (len > 0.01) { dx /= len; dz /= len; sp = swim ? 1.6 : walk ? 1.5 : sprint ? 6.8 : 4.0; P.yaw += angWrap(Math.atan2(dx, dz) - P.yaw) * (1 - Math.exp(-12 * dt)); }
    P.sprint = sprint && len > 0.01 && !swim;
    if (this.mouse.aim || this.mouse.down) P.yaw = yawC; // face aim direction
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
    for (const v of cars) {
      const sp = Math.abs(v.speed); if (sp < 3.5) continue; const f = v.forward();
      for (const c of [...this.peds.list, ...this.cops]) {
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
        const f = v.forward(); const p = new THREE.Vector3(v.x, v.y + 1.25, v.z).addScaledVector(f, 0.3);
        this.camera.position.copy(p); this.camera.lookAt(p.clone().addScaledVector(f, 10).add(new THREE.Vector3(0, -0.3, 0))); return;
      }
    } else {
      target = P.pos.clone(); target.y += 1.55; const aim = this.mouse.aim; dist = aim ? 2.0 : 3.3; side = aim ? 0.55 : 0.42; height = 0;
    }
    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    const off = new THREE.Vector3(Math.sin(C.yaw) * cp, -sp, Math.cos(C.yaw) * cp).multiplyScalar(dist);
    const right = new THREE.Vector3(-Math.cos(C.yaw), 0, Math.sin(C.yaw));
    target.addScaledVector(right, -side);
    let want = target.clone().add(off); want.y += height;
    // collide with buildings
    const t = this.city.col.raycast(target.x, target.y, target.z, want.x, want.y, want.z);
    if (t < 1) want = target.clone().lerp(want, Math.max(0.1, t - 0.06));
    want.y = Math.max(want.y, this.city.groundH(want.x, want.z) + 0.3);
    if (snap) C.pos.copy(want); else C.pos.lerp(want, 1 - Math.exp(-(P.car ? 14 : 20) * dt));
    this.camera.position.copy(C.pos);
    C.look.copy(target);
    this.camera.lookAt(C.look);
  }
  state() {
    const P = this.P; return {
      pos: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], inCar: !!P.car, carType: P.car && P.car.type, speedKmh: P.car ? Math.round(Math.abs(P.car.speed) * 3.6) : 0,
      wanted: this.wanted, policeCars: this.policeCars.length, cops: this.cops.filter((c) => !c.dead).length, health: Math.round(P.health), armor: Math.round(P.armor), money: P.money,
      traffic: this.traffic.cars.length, peds: this.peds.list.length, deadPeds: this.peds.list.filter((c) => c.dead).length, clip: P.clip,
    };
  }
  // ---- test helpers
  carNearPlayer(type = 'sedan', dist = 5) {
    const P = this.P; const v = new Vehicle(this.scene, type); const yaw = P.yaw; v.place(P.pos.x + Math.sin(yaw) * dist, P.pos.z + Math.cos(yaw) * dist, yaw + Math.PI / 2); v.ai = { mode: 'lane', seg: this.city.segs[0], dir: 1, lane: 0, cruise: 0, stuck: 0 }; v.ai.mode = 'dead'; this.traffic.cars.push(v); return v;
  }
}
