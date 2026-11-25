// v4.3 mission framework (GAMEPLAY_PLAN.md B1, B3–B6): start markers on the map (letters), staged objectives in the bottom
// objective bar, GPS target, big pass/fail result card with payout. The valet job (mission.js) keeps running alongside.
// All missions, characters and places are original.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { Character } from './people.js';
import { U } from './env.js';
import { MISSION_STARTS, POI } from './mapdata.js';
import { pick, rand, rng } from './util.js';

function beam(scene, col, r, h) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(...col) }, uTime: U.uTime, uNight: U.uNight },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uTime, uNight; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.y * 8.0)); gl_FragColor = vec4(uCol * a * mix(0.4, 0.95, uNight), 1.0); }' });
  const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), m); c.position.y = h / 2; c.frustumCulled = false; g.add(c);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32), m); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  g.visible = false; scene.add(g); return g;
}

export class Missions {
  constructor(game) {
    this.G = game; this.active = null; this.stage = ''; this.t = 0; this.log = []; this.done = {}; this.cool = 0; this.target = null;
    this.startMk = MISSION_STARTS.map((s) => { const b = beam(game.scene, [1.0, 0.82, 0.25], 1.1, 4); b.position.set(s.x, game.city.groundH(s.x, s.z), s.z); b.visible = true; return b; });
    this.goalMk = beam(game.scene, [1.0, 0.85, 0.3], 2.4, 8);
    const el = document.createElement('div'); el.id = 'mobj2'; Object.assign(el.style, { position: 'absolute', left: '50%', bottom: '92px', transform: 'translateX(-50%)', fontSize: '17px', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.9)', whiteSpace: 'nowrap', pointerEvents: 'none' });
    (document.getElementById('hud') || document.body).appendChild(el); this.el = el;
    const card = document.createElement('div'); Object.assign(card.style, { position: 'absolute', left: '0', right: '0', top: '30%', textAlign: 'center', pointerEvents: 'none', opacity: 0, transition: 'opacity .5s', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.8)' });
    (document.getElementById('hud') || document.body).appendChild(card); this.card = card; this.cardT = 0;
  }
  get list() { return MISSION_STARTS.map((s) => ({ ...s, done: this.done[s.id] || 0 })); }
  obj(h) { this.el.innerHTML = h || ''; }
  result(ok, title, sub) { this.card.innerHTML = `<div style="font:800 46px 'Noto Sans CJK SC',sans-serif;color:${ok ? '#ffd24d' : '#ff5a5a'}">${title}</div><div style="font:600 20px 'Noto Sans CJK SC',sans-serif;margin-top:6px">${sub}</div>`; this.card.style.opacity = 1; this.cardT = 5; }
  setGoal(x, z, name) { this.target = { x, z, name }; this.goalMk.position.set(x, this.G.city.groundH(x, z), z); this.goalMk.visible = true; }
  clearGoal() { this.target = null; this.goalMk.visible = false; }
  start(id) {
    const G = this.G; if (this.active || G.mission.state !== 'idle' && G.mission.state !== 'cool') return false;
    const s = MISSION_STARTS.find((m) => m.id === id); if (!s) return false;
    this.active = s; this.t = 0; this.stage = 'go'; this.data = {}; this.startMk.forEach((b) => (b.visible = false));
    G.hud.msg('任务开始：' + s.name, 3); G.sfx.alert?.();
    this['start_' + id]();
    return true;
  }
  end(ok, why, pay = 0) {
    const G = this.G; const s = this.active;
    if (ok) { G.P.money += pay; G.hud.cash(pay); this.done[s.id] = (this.done[s.id] || 0) + 1; this.result(true, '任务完成', `${s.name} · 报酬 $${pay.toLocaleString('en-US')}`); }
    else this.result(false, '任务失败', why);
    this.log.push({ id: s.id, ok, why: why || '', pay, t: Math.round(this.t) });
    for (const c of this.data.npcs || []) { if (!c.dead) c.hostile = false; }
    this.active = null; this.stage = ''; this.clearGoal(); this.obj(''); this.cool = 8; G.save?.();
  }
  // ---------------------------------------------------------------- 夜班收银: rob the 24h store, then lose the cops
  start_rob() { const st = POI.stores[0]; this.setGoal(st.x, st.z, st.name); this.stage = 'go'; }
  upd_rob(dt) {
    const G = this.G, P = G.P; const st = POI.stores[0]; const d = Math.hypot(P.pos.x - st.x, P.pos.z - st.z);
    if (this.stage === 'go') { this.obj(`去 <b style="color:#ffd24d">${st.name}</b> · ${Math.round(d)} 米`); if (d < 7 && P.onFoot) { this.stage = 'hold'; this.clearGoal(); } return; }
    if (this.stage === 'hold') {
      const armed = !G.arsenal.cur.melee; const aiming = G.mouse.aim || (G.override && G.override.aim);
      const clerk = G.world.clerkAt(st);
      if (!armed) { this.obj('掏出枪（数字键 3–6 或按住 Q 选枪）对准店员'); return; }
      if (d > 9) { this.obj('回到收银台前'); return; }
      this.obj(`按住右键瞄准店员 · 装钱进度 ${Math.round((this.data.hold || 0) / 3 * 100)}%`);
      if (aiming && clerk && !clerk.dead) { this.data.hold = (this.data.hold || 0) + dt; clerk.ai.mode = 'cower'; clerk.ai.t = 0; }
      if ((this.data.hold || 0) >= 3) { this.data.cash = Math.round(rand(1400, 2200)); G.crime(3, '持枪抢劫'); this.stage = 'escape'; G.hud.msg(`抢到 $${this.data.cash} · 甩掉警察！`, 3); }
      return;
    }
    if (this.stage === 'escape') { this.obj(`甩掉警察 · 通缉 ${G.wanted} 星`); if (G.wanted === 0) this.end(true, '', this.data.cash); }
  }
  // ---------------------------------------------------------------- 冷链急送: reefer van from the depot to a restaurant on the clock
  start_cold() {
    const G = this.G; const v = new Vehicle(G.scene, 'van'); v.place(14, -322, 0); v.ai = null; G.traffic.cars.push(v); this.data.van = v;
    this.setGoal(v.x, v.z, '冷藏车'); this.stage = 'get';
  }
  upd_cold(dt) {
    const G = this.G, P = G.P; const v = this.data.van;
    if (!v || v.health < 30) return this.end(false, '货车被撞坏了，冷链断了');
    if (this.stage === 'get') { this.goalMk.position.set(v.x, 0.15, v.z); this.obj('坐进 <b style="color:#7cc4ff">冷藏厢式车</b>（按 F）');
      if (P.car === v) { const r = pick(POI.restaurants); this.data.dest = r; this.data.left = Math.hypot(r.x - v.x, r.z - v.z) / 9 + 35; this.setGoal(r.x, r.z, r.name); this.stage = 'drive'; G.hud.msg('把冷藏海鲜送到「' + r.name + '」，别磕碰', 3); } return; }
    if (this.stage === 'drive') {
      this.data.left -= dt; const r = this.data.dest; const d = Math.hypot(r.x - v.x, r.z - v.z);
      this.obj(`送到 <b style="color:#ffd24d">${r.name}</b> · ${Math.round(d)} 米 · <b>${Math.max(0, Math.ceil(this.data.left))} 秒</b> · 货物 ${Math.max(0, Math.round(v.health))}%`);
      if (this.data.left <= 0) return this.end(false, '超时，海鲜不新鲜了');
      if (P.car !== v && Math.hypot(P.pos.x - v.x, P.pos.z - v.z) > 60) return this.end(false, '你把货车丢下了');
      if (d < 9 && Math.abs(v.speed) < 1.5) { const pay = Math.max(150, Math.round(700 + this.data.left * 6 - (100 - v.health) * 6)); this.end(true, '', pay); }
    }
  }
  // ---------------------------------------------------------------- 追债: chase the debtor's car, stop it, collect
  start_debt() {
    const G = this.G; const v = new Vehicle(G.scene, 'sport2'); v.place(170 + 3.5, 200, 0); v.health = 100;
    v.ai = { mode: 'chase', chaseSpeed: 0, target: new THREE.Vector3(173.5, 0, 260), cruise: 0, stuck: 0 }; G.traffic.cars.push(v); this.data.car = v;
    this.setGoal(v.x, v.z, '欠债人'); this.stage = 'find';
  }
  upd_debt(dt) {
    const G = this.G, P = G.P; const v = this.data.car; if (!v) return this.end(false, '目标消失了');
    const d = Math.hypot(P.pos.x - v.x, P.pos.z - v.z); this.goalMk.position.set(v.x, 0.15, v.z); if (this.target) { this.target.x = v.x; this.target.z = v.z; }
    if (this.stage === 'find') { this.obj(`找到 <b style="color:#ff6a6a">欠债人</b>的跑车 · ${Math.round(d)} 米`); if (d < 45) { this.stage = 'chase'; G.hud.msg('他发现你了！把他的车撞停或打坏', 3); } return; }
    if (this.stage === 'chase') {
      this.data.t = (this.data.t || 0) + dt;
      if (v.health > 40 && v.ai) { v.ai.mode = 'chase'; v.ai.chaseSpeed = 21; const dd = Math.max(1, d); v.ai.target = G.roadWaypoint(v, v.x + (v.x - P.pos.x) / dd * 120, v.z + (v.z - P.pos.z) / dd * 120); }
      this.obj(`拦下欠债人 · 他的车况 <b>${Math.max(0, Math.round(v.health))}%</b> · 距离 ${Math.round(d)} 米`);
      if (d > 260 || this.data.t > 180) return this.end(false, '欠债人跑掉了');
      if (v.health <= 40) { if (v.ai) { v.ai.mode = 'dead'; } this.stage = 'collect'; G.hud.msg('他的车趴窝了，下车去收钱', 3); }
      return;
    }
    if (this.stage === 'collect') { this.obj('下车走到 <b style="color:#ff6a6a">欠债人</b>车旁收钱'); if (P.onFoot && d < 4.5) this.end(true, '', 1100); }
  }
  // ---------------------------------------------------------------- 码头火并: clear the rival crew out of the old shipyard
  start_gang() { this.setGoal(POI.shipyard.x, POI.shipyard.z, POI.shipyard.name); this.stage = 'go'; }
  upd_gang(dt) {
    const G = this.G, P = G.P; const y = G.city.yards.find((q) => q.kind === 'shipyard');
    const d = Math.hypot(P.pos.x - POI.shipyard.x, P.pos.z - POI.shipyard.z);
    if (this.stage === 'go') { this.obj(`去 <b style="color:#ffd24d">${POI.shipyard.name}</b> · ${Math.round(d)} 米`);
      if (d < 40) { this.clearGoal(); this.data.npcs = []; const spots = (y && y.cover.length ? y.cover : [{ x: POI.shipyard.x, z: POI.shipyard.z }]);
        for (let i = 0; i < 6; i++) { const s = spots[i % spots.length]; const c = new Character(G.scene, 'man'); const px = s.x + rand(-4, 4), pz = s.z + (i % 2 ? 2.4 : -2.4);
          c.pos.set(px, G.city.groundH(px, pz), pz); c.hostile = true; c.health = 70; c.ai = { mode: 'gang', fireT: rand(1.5, 3), home: { x: px, z: pz } }; G.gang.push(c); this.data.npcs.push(c); }
        this.stage = 'fight'; G.hud.msg('对面的人抄家伙了！', 2.5); G.crime(1, '帮派火并'); }
      return; }
    if (this.stage === 'fight') { const left = this.data.npcs.filter((c) => !c.dead).length; this.obj(`击倒敌对帮派成员 · 剩余 <b style="color:#ff6a6a">${left}</b> 人`);
      if (left === 0) this.end(true, '', 1600); if (d > 150) this.end(false, '你离开了交火区'); }
  }
  update(dt) {
    const G = this.G, P = G.P;
    this.cardT -= dt; if (this.cardT <= 0) this.card.style.opacity = 0;
    if (this.active) {
      this.t += dt;
      if (G.deadT > 0 && !this.data.deadHandled) { this.data.deadHandled = true; return this.end(false, G.busting ? '你被捕了' : '你倒下了'); }
      this['upd_' + this.active.id](dt); return;
    }
    this.cool -= dt;
    for (let i = 0; i < MISSION_STARTS.length; i++) this.startMk[i].visible = this.cool <= 0 && G.wanted === 0;
    if (this.cool > 0 || G.wanted > 0 || !P.onFoot || G.deadT > 0) return;
    for (const s of MISSION_STARTS) if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < 2.2) { this.start(s.id); return; }
  }
}
