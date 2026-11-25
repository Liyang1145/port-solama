// v4.3 open world + economy + phone (GAMEPLAY_PLAN.md C1–C4, C6, D1–D4): shop counters (gun shop, clothing, body shop,
// 24h stores with robbable clerks), ATMs + bank balance, interaction menus, the phone (jobs / map / contacts / bank / assets /
// car dealer / radio), purse-snatcher street event, two playable protagonists with their own cash, guns and wanted level,
// localStorage autosave. All names original.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { Character } from './people.js';
import { POI, MISSION_STARTS } from './mapdata.js';
import { WEAPONS, WBY, newLoadout } from './weapons.js';
import { pick, rand, rng, clamp } from './util.js';

const CARS_FOR_SALE = [{ type: 'sedan', name: '海鸥 四门轿车', price: 9000 }, { type: 'suv', name: '珊瑚 SUV', price: 16000 }, { type: 'pickup', name: '码头 皮卡', price: 14000 }, { type: 'sport2', name: '疾风 跑车', price: 48000 }];
const OUTFITS = [{ name: '亚麻衬衫', price: 180, tint: [0.0, 0.3, 1.25] }, { name: '花衬衫', price: 140, tint: [0.35, 1.3, 1.0] }, { name: '运动背心', price: 90, tint: [-0.3, 1.1, 0.8] }, { name: '深色夹克', price: 320, tint: [0.0, 0.2, 0.55] }];
export const STATIONS = [{ name: '海浪 FM 93.1', kind: 'latin', bpm: 104 }, { name: '霓光 101.7', kind: 'synth', bpm: 118 }, { name: '午夜慢调 88.5', kind: 'slow', bpm: 76 }];

function sign(scene, text, col, xFront, z, face, y = 3.3) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#16181d'; g.fillRect(0, 0, 512, 128); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = col; g.font = '900 64px "Noto Sans CJK SC","PingFang SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.5 }));
  m.position.set(xFront + face * 0.08, y, z); m.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(m); return m;
}
function marker(scene, col) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; scene.add(m); return m;
}

export class World {
  constructor(game) {
    const G = this.G = game; this.menuEl = null; this.menu = null; this.phoneOpen = false; this.phonePage = 'home'; this.phoneSel = 0; this.station = -1; this.eventT = rand(40, 80); this.thief = null; this.robCool = {};
    this.log = [];
    // shop fronts: signs + floor rings at the counters (doors face the avenue)
    const S = G.scene;
    const front = (p) => p.x - p.face * 2.0;
    sign(S, POI.gunshop.name, '#ff5a46', front(POI.gunshop), POI.gunshop.z, POI.gunshop.face);
    sign(S, POI.clothes.name, '#d483ff', front(POI.clothes), POI.clothes.z, POI.clothes.face);
    sign(S, POI.modshop.name, '#5aa8ff', 61.5, POI.modshop.z, -1, 4.2);
    for (const st of POI.stores) sign(S, st.name, '#4fe08a', front(st), st.z, st.face);
    this.rings = [];
    const ring = (p, col, kind) => { const r = marker(S, col); r.position.set(p.x, G.city.groundH(p.x, p.z) + 0.03, p.z); this.rings.push({ p, kind, r }); };
    ring(POI.gunshop, 0xff5a46, 'gun'); ring(POI.clothes, 0xd483ff, 'clothes'); ring(POI.modshop, 0x5aa8ff, 'mod');
    for (const a of POI.atms) { ring(a, 0x4fe08a, 'atm'); const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.4, metalness: 0.5 })); const fr = [61.5, 158.5, 181.5, 275].reduce((q, f) => (Math.abs(f - a.x) < Math.abs(q - a.x) ? f : q)); box.position.set(fr + Math.sign(a.x - fr) * 0.35, 0.95, a.z); S.add(box); }
    // store clerks (stand in the doorway)
    this.clerks = POI.stores.map((st) => this.spawnClerk(st));
    // phone + menu DOM
    const hud = document.getElementById('hud') || document.body;
    const ph = document.createElement('div'); ph.id = 'phone';
    Object.assign(ph.style, { position: 'absolute', right: '40px', bottom: '40px', width: '250px', height: '440px', borderRadius: '30px', background: 'linear-gradient(160deg,#20232c,#0d0f14)', boxShadow: '0 10px 30px rgba(0,0,0,.6), inset 0 0 0 3px #3a3f4a', color: '#fff', font: '500 15px "Noto Sans CJK SC","PingFang SC",sans-serif', padding: '34px 16px 16px', boxSizing: 'border-box', display: 'none', pointerEvents: 'none' });
    ph.id = 'phone'; hud.appendChild(ph); this.phoneEl = ph;
    const mn = document.createElement('div'); mn.id = 'menu';
    Object.assign(mn.style, { position: 'absolute', left: '40px', top: '120px', width: '330px', borderRadius: '14px', background: 'rgba(14,16,22,.88)', color: '#fff', font: '500 16px "Noto Sans CJK SC","PingFang SC",sans-serif', padding: '14px 16px', display: 'none', pointerEvents: 'none' });
    mn.id = 'wmenu'; hud.appendChild(mn); this.menuEl = mn;
    // second protagonist
    this.profiles = [];
  }
  spawnClerk(st) { const G = this.G; const c = new Character(G.scene, 'woman'); const x = st.x - st.face * 1.4; c.pos.set(x, G.city.groundH(x, st.z), st.z); c.yaw = st.face * Math.PI / 2; c.clerk = st.id; c.ai = { mode: 'clerk', t: 0 }; c.health = 60; G.extras.push(c); return c; }
  clerkAt(st) { return this.clerks[POI.stores.indexOf(st)]; }
  // ------------------------------------------------------------------ protagonists ----
  initProfiles() {
    const G = this.G;
    this.profiles = [
      { name: '马特奥', char: G.player, P: G.P, wanted: 0, car: null },
    ];
    const c2 = new Character(G.scene, 'woman', { proto: 'f2', player2: true }); const x = 59.5, z = 30; c2.pos.set(x, G.city.groundH(x, z), z); c2.yaw = Math.PI / 2;
    const P2 = { pos: c2.pos, yaw: Math.PI / 2, vy: 0, onFoot: true, car: null, health: 100, armor: 20, money: 3200, bank: 9000, stamina: 100, grounded: true, sprint: false, load: newLoadout(['fist', 'pistol', 'bat']), outfit: null, assets: [] };
    this.profiles.push({ name: '伊莎', char: c2, P: P2, wanted: 0, car: null });
    this.cur = 0;
  }
  switchChar() {
    const G = this.G; if (G.deadT > 0 || this.profiles.length < 2) return false;
    const a = this.profiles[this.cur]; a.wanted = G.wanted;
    if (G.P.car) { const v = G.P.car; v.driver = null; v.input.throttle = 0; v.input.handbrake = true; a.car = v; a.char.root.visible = false; } else a.car = null;
    a.P.cover = null;
    this.cur = (this.cur + 1) % this.profiles.length; const b = this.profiles[this.cur];
    G.player = b.char; G.P = b.P; G.wanted = b.wanted; G.lostT = 0;
    if (b.car && G.traffic.cars.includes(b.car)) { b.car.driver = 'player'; b.car.ai = null; b.car.input.handbrake = false; G.P.car = b.car; G.P.onFoot = false; b.char.root.visible = false; } else { G.P.car = null; G.P.onFoot = true; b.char.root.visible = true; }
    if (!a.car) a.char.root.visible = true;
    G.cam.yaw = (G.P.car ? G.P.car.yaw : G.P.yaw) + Math.PI; G.updateCamera(1, true);
    G.hud.msg('切换到 ' + b.name, 2); G.sfx.alert?.();
    return true;
  }
  updateIdle(dt) { for (let i = 0; i < this.profiles.length; i++) { if (i === this.cur) continue; const p = this.profiles[i]; if (p.car) continue; p.char.yaw = p.P.yaw; p.char.setLocomotion(0, dt); p.char.update(dt); } }
  // ------------------------------------------------------------------ menus ----
  openMenu(title, items) { this.menu = { title, items }; this.drawMenu(); this.G.hud.msg('', 0.01); }
  closeMenu() { this.menu = null; this.menuEl.style.display = 'none'; }
  drawMenu() {
    const m = this.menu; if (!m) return;
    this.menuEl.innerHTML = `<div style="font:800 20px 'Noto Sans CJK SC',sans-serif;margin-bottom:8px;color:#ffd24d">${m.title}</div>` + m.items.map((it, i) => `<div style="padding:5px 0;opacity:${it.off ? 0.4 : 1}"><b style="display:inline-block;width:24px;color:#7cc4ff">${i + 1}</b>${it.label}</div>`).join('') + '<div style="margin-top:8px;opacity:.6;font-size:13px">数字键选择 · Esc 离开</div>';
    this.menuEl.style.display = 'block';
  }
  choose(i) { const m = this.menu; if (!m || !m.items[i]) return false; const it = m.items[i]; if (it.off) { this.G.hud.msg(it.why || '不可用', 1.5); return false; } const r = it.act(); if (this.menu) this.drawMenu(); return r !== false; }
  pay(n) { const P = this.G.P; if (P.money < n) { this.G.hud.msg('现金不够（可以去 ATM 取钱）', 2); return false; } P.money -= n; return true; }
  gunMenu() {
    const G = this.G, P = G.P;
    if (G.wanted > 0) { G.hud.msg('老板：「被通缉的人不接待。」', 2); return; }
    const items = [];
    for (const w of WEAPONS) { if (w.id === 'fist') continue; const own = P.load.owned[w.id];
      if (!own) items.push({ label: `${w.name} · $${w.price}`, act: () => { if (!this.pay(w.price)) return false; G.arsenal.give(w.id, w.clip ? w.clip * 3 : 0); G.arsenal.equip(w.id); G.hud.msg('买下 ' + w.name, 2); this.log.push('buy:' + w.id); G.save(); } });
      else if (w.clip) { const n = w.clip * 2, cost = n * w.ammoPrice; items.push({ label: `${w.name} 弹药 ×${n} · $${cost}`, off: own.reserve >= w.reserveMax, why: '弹药已满', act: () => { if (!this.pay(cost)) return false; G.arsenal.give(w.id, n); this.log.push('ammo:' + w.id); } }); }
    }
    items.push({ label: `防弹衣 · $250`, off: P.armor >= 100, why: '护甲已满', act: () => { if (!this.pay(250)) return false; P.armor = 100; this.log.push('armor'); } });
    this.openMenu(POI.gunshop.name, items);
  }
  clothesMenu() {
    const G = this.G, P = G.P;
    this.openMenu(POI.clothes.name, OUTFITS.map((o) => ({ label: `${o.name} · $${o.price}`, act: () => { if (!this.pay(o.price)) return false; P.outfit = o.name; this.tintPlayer(o.tint); G.evidenceOutfitCleared = true;
      if (G.wanted > 0 && G.wantedFlash) { G.wanted = Math.max(0, G.wanted - 1); G.hud.msg('换了身衣服 · 警察认不出你了（通缉 −1）', 2.5); } else G.hud.msg('换上 ' + o.name, 2); this.log.push('outfit:' + o.name); } })));
  }
  tintPlayer(t) { this.G.player.model.traverse((o) => { if (!o.isMesh || /^(Skin|Eyes|Eyebrows|Eyelashes|Teeth|Tongue|Hair|Beard)/.test(o.material.name) || o.material.transparent) return; if (!/shirt|top|jacket|cloth|tshirt|body/i.test(o.material.name + o.name)) return; o.material = o.material.clone(); o.material.color.offsetHSL(t[0] * 0.3, (t[1] - 1) * 0.3, (t[2] - 1) * 0.3); }); }
  modMenu() {
    const G = this.G, P = G.P; const v = P.car;
    if (!v) { G.hud.msg('开车进来才能修车/喷漆', 2); return; }
    this.openMenu(POI.modshop.name, [
      { label: `修理 · $${Math.round((100 - v.health) * 8)}`, off: v.health >= 99, why: '车况良好', act: () => { if (!this.pay(Math.round((100 - v.health) * 8))) return false; v.health = 100; this.log.push('repair'); } },
      { label: '喷漆换色 · $300（警察失去车辆线索）', act: () => { if (!this.pay(300)) return false; v.root.traverse((o) => { if (o.isMesh && /paint|body/i.test(o.material.name)) { o.material = o.material.clone(); o.material.color.setHSL(rng(), 0.55, 0.45); } }); G.lastCrimeInCar = false; if (G.wanted > 0) G.wanted = Math.max(0, G.wanted - 1); G.hud.msg('喷好漆了', 2); this.log.push('respray'); } },
    ]);
  }
  atmMenu() {
    const G = this.G, P = G.P;
    this.openMenu('ATM · 银行余额 $' + P.bank.toLocaleString('en-US'), [
      { label: `存入全部现金（$${P.money.toLocaleString('en-US')}）`, off: P.money <= 0, act: () => { P.bank += P.money; P.money = 0; this.menu.title = 'ATM · 银行余额 $' + P.bank.toLocaleString('en-US'); this.log.push('deposit'); G.save(); } },
      { label: '取出 $1,000', off: P.bank < 1000, why: '余额不足', act: () => { P.bank -= 1000; P.money += 1000; this.menu.title = 'ATM · 银行余额 $' + P.bank.toLocaleString('en-US'); this.log.push('withdraw'); G.save(); } },
    ]);
  }
  interact() {
    const G = this.G, P = G.P; if (this.menu) { this.closeMenu(); return true; }
    for (const r of this.rings) { if (Math.hypot(P.pos.x - r.p.x, P.pos.z - r.p.z) > (r.kind === 'mod' ? 5 : 1.8)) continue;
      if (r.kind === 'gun') this.gunMenu(); else if (r.kind === 'clothes') this.clothesMenu(); else if (r.kind === 'mod') this.modMenu(); else this.atmMenu(); return true; }
    return false;
  }
  // ------------------------------------------------------------------ store robbery (free roam) ----
  updateClerks(dt) {
    const G = this.G, P = G.P;
    for (let i = 0; i < this.clerks.length; i++) {
      const c = this.clerks[i], st = POI.stores[i];
      if (c.dead) { c.update(dt); if (!this.robCool[st.id] || this.robCool[st.id] < 0) this.robCool[st.id] = 200; continue; }
      this.robCool[st.id] = (this.robCool[st.id] || 0) - dt;
      c.setLocomotion(0, dt); c.update(dt);
      if (G.missions.active && G.missions.active.id === 'rob' && i === 0) continue;
      const d = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      const aiming = (G.mouse.aim || (G.override && G.override.aim)) && P.onFoot && !G.arsenal.cur.melee;
      if (aiming && d < 8 && this.robCool[st.id] <= 0) {
        // must be roughly facing the clerk
        const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); const dot = ((c.pos.x - P.pos.x) * fx + (c.pos.z - P.pos.z) * fz) / Math.max(d, 0.1);
        if (dot > 0.8) { c.robT = (c.robT || 0) + dt; if (!c.warned) { c.warned = true; G.hud.msg('店员举起了手…… 继续瞄准', 1.5); }
          if (c.robT > 2.5) { const cash = Math.round(rand(300, 750)); P.money += cash; G.hud.cash(cash); G.crime(2, '抢劫商店'); this.robCool[st.id] = 240; c.robT = 0; c.warned = false; this.log.push('rob:' + st.id + ':' + cash); } }
      } else if (c.robT) c.robT = Math.max(0, c.robT - dt);
    }
  }
  // ------------------------------------------------------------------ random street event: purse snatcher ----
  updateEvents(dt) {
    const G = this.G, P = G.P;
    if (this.thief) {
      const c = this.thief, d = c.pos.distanceTo(P.pos); this.thiefT += dt;
      if (c.dead || c.health < 60) { if (!c.dead) c.kill(1); const r = 250; P.money += r; G.hud.cash(r); G.hud.msg('拿回了钱包 · 失主的谢礼 $' + r, 3); this.log.push('event:thief:ok'); this.thief = null; return; }
      if (d > 140 || this.thiefT > 75) { G.hud.msg('抢包贼跑掉了', 2); this.log.push('event:thief:lost'); this.thief = null; c.dispose?.(); return; }
      return;
    }
    if (G.wanted > 0 || G.missions.active || !P.onFoot) return;
    this.eventT -= dt; if (this.eventT > 0) return; this.eventT = rand(90, 160);
    if (P.pos.x < 230) return; // busy beachfront only (MAP_DESIGN §5)
    this.spawnThief();
  }
  spawnThief() {
    const G = this.G, P = G.P; const c = new Character(G.scene, 'man'); const x = clamp(P.pos.x + rand(-6, 6), 276, 300), z = P.pos.z + (rng() < 0.5 ? -18 : 18);
    c.pos.set(x, G.city.groundH(x, z), z); c.thief = true; c.health = 100;
    c.ai = { mode: 'flee', from: P.pos.clone(), t: -60, loop: [230, z - 30, 330, z + 30, 400], u: 0, dir: 1, speed: 1.3, wait: 0 };
    G.peds.list.push(c); this.thief = c; this.thiefT = 0; G.hud.msg('「抢劫啊！」—— 追上抢包贼，打倒他拿回钱包', 3.5); return c;
  }
  // ------------------------------------------------------------------ phone ----
  // r6.2: once a map was picked the URL kept #map= and the start menu never came back; this saves and returns to the menu
  switchMap() { this.G.save(); this.togglePhone(false); try { const q = new URLSearchParams(location.search); q.delete('map'); q.delete('snap'); const qs = q.toString(); location.replace(location.pathname + (qs ? '?' + qs + '&menu' : '?menu')); } catch (e) { } }
  togglePhone(on = !this.phoneOpen) { this.phoneOpen = on; this.phoneEl.style.display = on ? 'block' : 'none'; this.phonePage = 'home'; this.phoneSel = 0; this.drawPhone(); }
  phoneItems() {
    const G = this.G, P = G.P;
    if (this.phonePage === 'home') return [['任务', () => this.go('jobs')], ['地图', () => { G.hud.toggleBig(); this.togglePhone(false); }], ['联系人', () => this.go('contacts')], ['银行', () => this.go('bank')], ['资产', () => this.go('assets')], ['车行', () => this.go('cars')], ['电台', () => this.go('radio')], ['切换地图', () => this.switchMap()]];
    if (this.phonePage === 'jobs') return [...MISSION_STARTS.map((s) => [`${s.letter} ${s.name} · ${Math.round(Math.hypot(s.x - P.pos.x, s.z - P.pos.z))} 米${G.missions.done[s.id] ? ' ✓' : ''}`, () => { G.waypoint = { x: s.x, z: s.z, name: s.name }; G.hud.msg('已设置导航：' + s.name, 2); this.togglePhone(false); }]),
      [`代客泊车 · ${Math.round(Math.hypot(POI.valet.x - P.pos.x, POI.valet.z - P.pos.z))} 米`, () => { G.waypoint = { x: POI.valet.x, z: POI.valet.z, name: '代客泊车' }; this.togglePhone(false); }], ['返回', () => this.go('home')]];
    if (this.phonePage === 'contacts') return [['技工老秦 · 把你的车送过来', () => this.callMechanic()], ['律师许小姐 · 通缉 −1（$800）', () => this.callLawyer()], [(this.profiles[1 - this.cur] || {}).name + ' · 切换角色', () => { this.togglePhone(false); this.switchChar(); }], ['返回', () => this.go('home')]];
    if (this.phonePage === 'bank') return [[`现金 $${P.money.toLocaleString('en-US')}`, () => 0], [`存款 $${P.bank.toLocaleString('en-US')}`, () => 0], ['（存取款请去 ATM）', () => 0], ['返回', () => this.go('home')]];
    if (this.phonePage === 'assets') return [...(P.assets.length ? P.assets.map((a) => [a.name, () => 0]) : [['还没有资产', () => 0]]), [`武器 ${Object.keys(P.load.owned).length - 1} 把`, () => 0], ['返回', () => this.go('home')]];
    if (this.phonePage === 'cars') return [...CARS_FOR_SALE.map((c) => [`${c.name} · $${c.price.toLocaleString('en-US')}`, () => this.buyCar(c)]), ['返回', () => this.go('home')]];
    if (this.phonePage === 'radio') return [...STATIONS.map((s, i) => [(this.station === i ? '▶ ' : '') + s.name, () => { this.station = i; G.sfx.setStation?.(i); }]), [(this.station < 0 ? '▶ ' : '') + '关闭电台', () => { this.station = -1; G.sfx.setStation?.(-1); }], ['返回', () => this.go('home')]];
    return [];
  }
  go(p) { this.phonePage = p; this.phoneSel = 0; this.drawPhone(); }
  phoneKey(code) {
    const n = this.phoneItems().length;
    if (code === 'ArrowDown') this.phoneSel = (this.phoneSel + 1) % n; else if (code === 'ArrowUp') this.phoneSel = (this.phoneSel - 1 + n) % n;
    else if (code === 'Enter' || code === 'ArrowRight') this.phoneTap(this.phoneSel); else if (code === 'Backspace' || code === 'ArrowLeft') { if (this.phonePage === 'home') this.togglePhone(false); else this.go('home'); }
    this.drawPhone();
  }
  phoneTap(i) { const it = this.phoneItems()[i]; if (!it) return false; it[1](); if (this.phoneOpen) this.drawPhone(); return true; }
  drawPhone() {
    if (!this.phoneOpen) return; const h = window.__G ? window.__G.hour : 12; const t = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    const titles = { home: (this.profiles[this.cur] || {}).name + ' 的手机', jobs: '任务', contacts: '联系人', bank: '银行', assets: '资产', cars: '车行 · 送车上门', radio: '电台' };
    this.phoneEl.innerHTML = `<div style="position:absolute;top:12px;left:0;right:0;text-align:center;font-size:12px;opacity:.7">${t}</div><div style="font:800 18px 'Noto Sans CJK SC',sans-serif;margin-bottom:10px">${titles[this.phonePage]}</div>` +
      this.phoneItems().map((it, i) => `<div style="padding:7px 10px;margin:3px 0;border-radius:10px;background:${i === this.phoneSel ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.07)'};color:${i === this.phoneSel ? '#111' : '#fff'}">${it[0]}</div>`).join('') +
      '<div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:11px;opacity:.55">↑↓ 选择 · Enter 确定 · ← 返回</div>';
  }
  callMechanic() {
    const G = this.G, P = G.P; const own = P.assets.filter((a) => a.type); const type = own.length ? own[own.length - 1].type : 'sedan';
    const yaw = P.yaw; const x = P.pos.x + Math.sin(yaw + 1.2) * 7, z = P.pos.z + Math.cos(yaw + 1.2) * 7;
    const v = new Vehicle(G.scene, type); v.place(x, z, yaw); v.ai = null; v.parked = true; G.traffic.cars.push(v); this.lastDelivered = v;
    G.hud.msg('老秦：「车给你停在旁边了。」', 2.5); this.togglePhone(false); this.log.push('mechanic:' + type); return v;
  }
  callLawyer() {
    const G = this.G; if (G.wanted === 0) { G.hud.msg('许小姐：「你现在挺干净的。」', 2); return; }
    if (G.wanted > 3) { G.hud.msg('许小姐：「这么大的事我摆不平。」', 2); return; }
    if (!this.pay(800)) return; G.wanted--; G.hud.msg('许小姐打了几个电话 · 通缉 −1', 2.5); this.log.push('lawyer'); this.togglePhone(false);
  }
  buyCar(c) {
    const G = this.G, P = G.P; if (P.bank + P.money < c.price) { G.hud.msg('存款不够', 2); return; }
    const fromBank = Math.min(P.bank, c.price); P.bank -= fromBank; P.money -= c.price - fromBank;
    P.assets.push({ name: c.name, type: c.type }); this.log.push('car:' + c.type); G.hud.msg('买下 ' + c.name + ' · 打电话给技工老秦就能送来', 3); G.save(); this.go('assets');
  }
  update(dt) {
    this.updateClerks(dt); this.updateEvents(dt); this.updateIdle(dt);
    // context prompts near counters
    const G = this.G, P = G.P;
    if (!this.menu && !this.phoneOpen && G.deadT <= 0) {
      for (const r of this.rings) { const d = Math.hypot(P.pos.x - r.p.x, P.pos.z - r.p.z); if (d < (r.kind === 'mod' ? 5 : 1.8)) { const names = { gun: POI.gunshop.name, clothes: POI.clothes.name, mod: POI.modshop.name, atm: 'ATM' }; if (this.promptK !== r) { this.promptK = r; G.hud.msg(`按 E 使用 ${names[r.kind]}`, 2); } break; } }
    }
    if (this.menu) { for (const r of this.rings) { if (Math.hypot(P.pos.x - r.p.x, P.pos.z - r.p.z) < 6) return; } this.closeMenu(); }
  }
}
