// v4.3 「代客泊车」 valet job loop inside the shrunk district (Tideline Drive hotels -> parking lots on the inner avenues).
// idle: amber beacon at the hotel valet stand -> walk into it -> a guest's car pulls up at the kerb -> get in -> drive it to the
// lot marker before the clock runs out without wrecking it or drawing police -> paid (base + time bonus - damage) -> repeat.
// Fail states: timer, car health < 35, wanted >= 2, guest car abandoned > 60 m away.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { U } from './env.js';
import { pick, rand } from './util.js';

const STAND = { x: 281.0, z: 10.0 };
const CURB = { x: 285.0, z: 5.0, yaw: Math.PI };
const GUEST_CARS = ['sedan', 'sport2', 'suv', 'sedan', 'sport2', 'taxi'];
const GUESTS = ['滨海酒店的住客', '一位赶着去晚宴的客人', '度假的退休夫妇', '穿亚麻西装的商人', '刚下飞机的游客'];

function beaconMat(col) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(...col) }, uTime: U.uTime, uNight: U.uNight },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uTime, uNight; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.55 + 0.45 * sin(uTime * 3.0 + vUv.y * 9.0) * 0.3);
        a *= 0.35 + 0.65 * smoothstep(0.0, 0.5, abs(fract(vUv.x * 2.0) - 0.5) * 2.0 + 0.3);
        gl_FragColor = vec4(uCol * a * mix(0.35, 0.9, uNight), 1.0); }`,
  });
}

export class Valet {
  constructor(game) {
    this.G = game; this.state = 'idle'; this.t = 0; this.cool = 0; this.jobs = 0; this.earned = 0; this.car = null; this.target = null; this.log = [];
    const mk = (col, r, h) => {
      const g = new THREE.Group();
      const col1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true), beaconMat(col)); col1.position.y = h / 2; col1.frustumCulled = false; g.add(col1);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 40), beaconMat(col)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
      g.visible = false; game.scene.add(g); return g;
    };
    this.standMk = mk([1.0, 0.72, 0.18], 0.9, 3.2);
    this.dropMk = mk([1.0, 0.85, 0.25], 2.6, 9.0);
    this.carMk = mk([0.35, 0.75, 1.0], 0.35, 1.2);
    const el = document.createElement('div'); el.id = 'obj';
    Object.assign(el.style, { position: 'absolute', left: '50%', bottom: '64px', transform: 'translateX(-50%)', fontSize: '17px', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.9)', textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0, transition: 'opacity .4s' });
    (document.getElementById('hud') || document.body).appendChild(el); this.el = el;
    this.standMk.position.set(STAND.x, game.city.groundH(STAND.x, STAND.z), STAND.z); this.standMk.visible = true;
  }
  obj(html) { this.el.innerHTML = html || ''; this.el.style.opacity = html ? 1 : 0; }
  pickDrop() {
    // lots on the inner avenues (x=50 / x=170), kerb lane, away from intersections
    const segs = this.G.city.segs.filter((s) => s.axis === 'z' && (s.c === 50 || s.c === 170) && !s.bridge && s.a1 - s.a0 > 60);
    const s = pick(segs); const a = s.a0 + (s.a1 - s.a0) * rand(0.35, 0.65);
    return { x: s.c + 4.6 * (Math.random() < 0.5 ? -1 : 1), z: a, name: (s.c === 50 ? '湾畔' : '棕榈') + '停车场 ' + (Math.abs(Math.round(a / 10)) % 9 + 1) + ' 号位' };
  }
  start() {
    const G = this.G;
    this.car = new Vehicle(G.scene, pick(GUEST_CARS)); this.car.place(CURB.x, CURB.z, CURB.yaw); this.car.ai = null; G.traffic.cars.push(this.car);
    this.guest = pick(GUESTS); this.state = 'pickup'; this.t = 0; this.standMk.visible = false; this.carMk.visible = true;
    G.hud.msg('代客泊车：' + this.guest + '把车钥匙交给了你', 4); G.sfx.alert?.();
  }
  finish(ok, why) {
    const G = this.G; this.dropMk.visible = false; this.carMk.visible = false; this.target = null;
    if (ok) {
      const dmg = Math.max(0, 100 - this.car.health); const bonus = Math.max(0, Math.round(this.left * 4)); const pay = Math.max(40, 150 + bonus - Math.round(dmg * 3));
      G.P.money += pay; G.hud.cash(pay); this.jobs++; this.earned += pay;
      G.hud.msg(`停好了 · 报酬 $${pay}（时间奖励 $${bonus}${dmg > 1 ? ' · 车损扣款 $' + Math.round(dmg * 3) : ''}）· 下车走回代客泊车台接下一单`, 5);
      this.log.push({ ok: true, pay, dmg: Math.round(dmg), left: Math.round(this.left) });
    } else { G.hud.msg('任务失败：' + why, 4); this.log.push({ ok: false, why }); }
    this.state = 'cool'; this.cool = 6; this.obj('');
  }
  update(dt) {
    const G = this.G, P = G.P;
    if (this.state === 'cool') { this.cool -= dt; if (this.cool <= 0) { this.state = 'idle'; this.standMk.visible = true; this.car = null; } return; }
    if (this.state === 'idle') {
      if (P.onFoot && G.deadT <= 0 && G.wanted === 0 && Math.hypot(P.pos.x - STAND.x, P.pos.z - STAND.z) < 2.2) this.start();
      else if (P.onFoot && Math.hypot(P.pos.x - STAND.x, P.pos.z - STAND.z) < 25) this.obj('<span style="color:#ffc34d">代客泊车台</span> · 走过去接单');
      else this.obj('');
      return;
    }
    const c = this.car;
    if (!c || c.health < 35) return this.finish(false, '客人的车被撞坏了');
    if (G.wanted >= 2) return this.finish(false, '警察盯上了你，客人报了警');
    if (G.deadT > 0) return this.finish(false, '你倒下了');
    if (this.state === 'pickup') {
      this.carMk.position.set(c.x, c.y + 1.9, c.z);
      this.obj('坐进<span style="color:#7cc4ff">客人的车</span>（按 F）');
      if (P.car === c) {
        this.target = this.pickDrop(); const d = Math.hypot(this.target.x - c.x, this.target.z - c.z);
        this.left = d / 8.5 + 22; this.state = 'drive'; this.carMk.visible = false;
        this.dropMk.position.set(this.target.x, G.city.groundH(this.target.x, this.target.z), this.target.z); this.dropMk.visible = true;
      }
      return;
    }
    if (this.state === 'drive') {
      this.left -= dt;
      const d = Math.hypot(this.target.x - c.x, this.target.z - c.z);
      if (this.left <= 0) return this.finish(false, '超时了，客人很不满意');
      if (P.car !== c && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > 60) return this.finish(false, '你把客人的车丢下了');
      const mm = Math.floor(this.left / 60), ss = Math.floor(this.left % 60);
      this.obj(`把车停到 <span style="color:#ffc34d">${this.target.name}</span> · ${Math.round(d)} 米 · <b>${mm}:${String(ss).padStart(2, '0')}</b> · 车况 ${Math.max(0, Math.round(c.health))}%`);
      if (d < 5.5 && Math.abs(c.speed) < 1.5) this.finish(true);
    }
  }
}
