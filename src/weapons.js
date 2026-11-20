// v4.3 weapons (GAMEPLAY_PLAN.md A1–A6): six weapons with per-weapon clip / reserve / rate / damage / spread / pellets / range,
// reload timing, melee arcs, hit markers + hit reactions, camera recoil, a hold-Q weapon wheel (slow-mo) and basic cover (C).
// Original implementation; weapon names are generic.
import * as THREE from 'three';
import { clamp, rand, rng } from './util.js';

export const WEAPONS = [
  { id: 'fist', name: '拳头', melee: true, dmg: 22, range: 1.7, arc: 0.9, rate: 0.42, price: 0 },
  { id: 'bat', name: '棒球棍', melee: true, dmg: 55, range: 2.2, arc: 1.1, rate: 0.65, price: 120 },
  { id: 'pistol', name: '手枪', clip: 12, reserveMax: 180, dmg: 34, head: 2.6, rate: 0.2, spread: 0.010, pellets: 1, range: 110, reload: 1.3, auto: false, recoil: 0.012, price: 600, ammoPrice: 2 },
  { id: 'smg', name: '冲锋枪', clip: 30, reserveMax: 300, dmg: 20, head: 2.2, rate: 0.075, spread: 0.032, pellets: 1, range: 80, reload: 1.9, auto: true, recoil: 0.009, price: 1800, ammoPrice: 2 },
  { id: 'shotgun', name: '霰弹枪', clip: 7, reserveMax: 70, dmg: 14, head: 1.5, rate: 0.85, spread: 0.075, pellets: 9, range: 38, reload: 2.6, auto: false, recoil: 0.05, price: 2400, ammoPrice: 6 },
  { id: 'rifle', name: '步枪', clip: 30, reserveMax: 270, dmg: 32, head: 2.5, rate: 0.11, spread: 0.014, pellets: 1, range: 180, reload: 2.2, auto: true, recoil: 0.014, price: 4200, ammoPrice: 3 },
];
export const WBY = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

// per-protagonist loadout
export function newLoadout(start = ['fist', 'pistol']) {
  const L = { cur: 'pistol', owned: {}, };
  for (const id of start) L.owned[id] = { clip: WBY[id].clip || 0, reserve: WBY[id].clip ? WBY[id].clip * 4 : 0 };
  if (!L.owned[L.cur]) L.cur = 'fist';
  L.owned.fist = L.owned.fist || { clip: 0, reserve: 0 };
  return L;
}

export class Arsenal {
  constructor(game) {
    this.G = game; this.fireT = 0; this.reloadT = 0; this.wheelOpen = false; this.hitT = 0; this.hitHead = false; this.recoil = 0; this.shots = 0; this.hits = 0;
    const hud = document.getElementById('hud') || document.body;
    // weapon wheel (6 sectors) — built from DOM, original styling
    const w = document.createElement('div'); w.id = 'wheel';
    Object.assign(w.style, { position: 'absolute', left: '50%', top: '50%', width: '420px', height: '420px', marginLeft: '-210px', marginTop: '-210px', borderRadius: '50%', background: 'radial-gradient(rgba(10,12,18,.15) 22%, rgba(10,12,18,.62) 23%, rgba(10,12,18,.62) 70%, rgba(10,12,18,0) 71%)', display: 'none', pointerEvents: 'none' });
    this.cells = WEAPONS.map((wp, i) => {
      const a = -Math.PI / 2 + i * Math.PI * 2 / WEAPONS.length; const c = document.createElement('div');
      Object.assign(c.style, { position: 'absolute', left: (210 + Math.cos(a) * 140 - 58) + 'px', top: (210 + Math.sin(a) * 140 - 30) + 'px', width: '116px', height: '60px', borderRadius: '12px', textAlign: 'center', color: '#fff', font: '600 16px "Noto Sans CJK SC","PingFang SC",sans-serif', paddingTop: '6px', boxSizing: 'border-box' });
      w.appendChild(c); return c;
    });
    this.wname = document.createElement('div'); Object.assign(this.wname.style, { position: 'absolute', left: '0', right: '0', top: '196px', textAlign: 'center', color: '#fff', font: '700 18px "Noto Sans CJK SC",sans-serif' }); w.appendChild(this.wname);
    hud.appendChild(w); this.wheelEl = w;
    // hit marker
    const hm = document.createElement('div'); hm.id = 'hitm'; hm.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
    Object.assign(hm.style, { position: 'absolute', left: '50%', top: '50%', marginLeft: '-13px', marginTop: '-13px', color: '#fff', opacity: 0, pointerEvents: 'none', filter: 'drop-shadow(0 0 2px #000)' });
    hud.appendChild(hm); this.hm = hm;
  }
  get L() { return this.G.P.load; }
  get cur() { return WBY[this.L.cur]; }
  ammo() { return this.L.owned[this.L.cur] || { clip: 0, reserve: 0 }; }
  equip(id) {
    if (!this.L.owned[id]) return false;
    if (this.L.cur !== id) { this.L.cur = id; this.reloadT = 0; this.fireT = 0.25; this.G.hud.msg('装备：' + WBY[id].name, 1.2); }
    return true;
  }
  cycle(dir) { const ids = WEAPONS.map((w) => w.id).filter((id) => this.L.owned[id]); const i = ids.indexOf(this.L.cur); this.equip(ids[(i + dir + ids.length) % ids.length]); }
  give(id, rounds = 0) {
    const w = WBY[id]; if (!this.L.owned[id]) this.L.owned[id] = { clip: w.clip || 0, reserve: 0 };
    const a = this.L.owned[id]; if (w.clip) a.reserve = Math.min(w.reserveMax, a.reserve + rounds);
  }
  reload() {
    const w = this.cur, a = this.ammo(); if (w.melee || this.reloadT > 0 || a.clip >= w.clip || a.reserve <= 0) return false;
    this.reloadT = w.reload; this.G.sfx.reload(); return true;
  }
  openWheel(on) {
    this.wheelOpen = on; this.wheelEl.style.display = on ? 'block' : 'none'; this.G.slowmo = on ? 0.25 : 1;
    if (on) { this.wheelSel = this.L.cur; this.drawWheel(); }
    else if (this.wheelSel) this.equip(this.wheelSel);
  }
  wheelAim(dx, dy) { if (Math.hypot(dx, dy) < 30) return; const a = Math.atan2(dy, dx) + Math.PI / 2; const i = ((Math.round(a / (Math.PI * 2 / WEAPONS.length)) % WEAPONS.length) + WEAPONS.length) % WEAPONS.length; if (this.L.owned[WEAPONS[i].id]) { this.wheelSel = WEAPONS[i].id; this.drawWheel(); } }
  drawWheel() {
    WEAPONS.forEach((w, i) => { const c = this.cells[i]; const own = this.L.owned[w.id]; const sel = this.wheelSel === w.id;
      c.style.background = sel ? 'rgba(255,255,255,.92)' : own ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)'; c.style.color = sel ? '#111' : own ? '#fff' : 'rgba(255,255,255,.3)';
      c.innerHTML = `${w.name}<br><small style="font-weight:500;opacity:.8">${!own ? '未拥有' : w.melee ? '近战' : own.clip + ' / ' + own.reserve}</small>`; });
    this.wname.textContent = WBY[this.wheelSel].name;
  }
  update(dt) {
    this.fireT -= dt; this.recoil *= Math.exp(-dt * 10);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const w = this.cur, a = this.ammo(); const n = Math.min(w.clip - a.clip, a.reserve); a.clip += n; a.reserve -= n; } }
    this.hitT -= dt; this.hm.style.opacity = this.hitT > 0 ? 1 : 0; this.hm.style.color = this.hitHead ? '#ff4040' : '#fff';
    if (this.wheelOpen) this.drawWheel();
  }
  // trigger: called every frame while fire is held; returns true if something was fired/swung
  trigger(held, edge) {
    const G = this.G, P = G.P; if (!P.onFoot || G.deadT > 0 || this.wheelOpen || this.fireT > 0 || this.reloadT > 0) return false;
    const w = this.cur;
    if (!w.auto && !edge && !w.melee) return false;
    if (w.melee) return this.swing(w);
    const a = this.ammo(); if (a.clip <= 0) { this.reload(); return false; }
    a.clip--; this.fireT = w.rate; this.shots++;
    G.sfx.shot(w.id === 'shotgun' ? 1.3 : w.id === 'smg' ? 0.7 : 1);
    const { o, d } = G.aimRay(); const ds = o.distanceTo(G.player.pos); o.addScaledVector(d, Math.max(0, ds - 0.5));
    const bloom = w.spread * (G.mouse.aim || (G.override && G.override.aim) ? 0.55 : 1) * (P.sprint ? 2 : 1) * (1 + this.recoil * 20);
    let anyHit = false;
    for (let k = 0; k < w.pellets; k++) {
      const dd = d.clone(); dd.x += (rng() - 0.5) * 2 * bloom; dd.y += (rng() - 0.5) * 2 * bloom; dd.z += (rng() - 0.5) * 2 * bloom; dd.normalize();
      const h = G.castShot(o, dd, w.range);
      if (h.what) { anyHit = true; this.applyHit(h, w, dd); }
      if (k < 3) G.addTracer(G.player.pos.clone().add(new THREE.Vector3(Math.sin(P.yaw) * 0.5, 1.45, Math.cos(P.yaw) * 0.5)), o.clone().addScaledVector(dd, h.t));
    }
    if (anyHit) this.hits++;
    this.recoil = Math.min(0.08, this.recoil + w.recoil); G.cam.pitch = clamp(G.cam.pitch + w.recoil * 0.6, -1.2, 0.6);
    G.flash.position.copy(G.player.pos).add(new THREE.Vector3(Math.sin(P.yaw) * 0.6, 1.5, Math.cos(P.yaw) * 0.6)); G.flash.intensity = w.id === 'shotgun' ? 45 : 30;
    G.peds.panic(P.pos, 45);
    if (G.policeNear(60) || G.peds.list.some((c) => !c.dead && c.pos.distanceTo(P.pos) < 30)) G.crime(1, '当街开枪');
    G.lastWeaponCrime = true;
    return true;
  }
  applyHit(h, w, d) {
    const G = this.G;
    if (h.what.c) { const c = h.what.c; const dmg = w.dmg * (h.what.head ? w.head : 1); c.health -= dmg; this.hitT = 0.14; this.hitHead = !!h.what.head;
      G.hitReact(c, d); if (c.health <= 0) G.killChar(c, d); }
    if (h.what.v) { const v = h.what.v; v.health -= w.dmg * 0.3; this.hitT = 0.1; this.hitHead = false; if (v.ai && v.ai.mode === 'lane') { v.ai.mode = 'flee'; v.ai.target = new THREE.Vector3(v.x * 2 - G.P.pos.x, 0, v.z * 2 - G.P.pos.z); } }
  }
  swing(w) {
    const G = this.G, P = G.P; this.fireT = w.rate; G.sfx.burst?.(0.08, 900, 0.25); this.swingReq = w.id === 'bat' ? 'bat' : 'fist'; // r6.2: visible swing (game.js -> actionpose)
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); let hit = null, best = 9;
    for (const c of [...G.peds.list, ...G.cops, ...G.hostiles()]) {
      if (c.dead || c === G.player) continue; const dx = c.pos.x - P.pos.x, dz = c.pos.z - P.pos.z; const d = Math.hypot(dx, dz);
      if (d > w.range + 0.4 || d < 0.05) continue; const ang = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); if (ang > w.arc) continue;
      if (d < best) { best = d; hit = c; }
    }
    if (!hit) return true;
    const dir = new THREE.Vector3(fx, 0, fz); hit.health -= w.dmg; this.hitT = 0.14; this.hitHead = false; this.hits++;
    G.hitReact(hit, dir, w.id === 'bat' ? 0.6 : 0.3);
    G.sfx.burst?.(0.12, 300, 0.5);
    if (hit.health <= 0) G.killChar(hit, dir, true);
    else if (!hit.isCop && !hit.hostile && hit.ai) { hit.ai.mode = 'flee'; hit.ai.from = P.pos.clone(); hit.ai.t = 0; }
    if (hit.isCop) G.crime(Math.max(G.wanted, 2), '袭警'); else if (!hit.hostile && !hit.thief && (G.policeNear(40) || rng() < 0.3)) G.crime(1, '斗殴');
    G.peds.panic(P.pos, 18);
    return true;
  }
  // basic cover: snap against the nearest wall / car within 1.3 m; crouched, slower, harder to hit
  toggleCover() {
    const G = this.G, P = G.P; if (!P.onFoot) return false;
    if (P.cover) { P.cover = null; return false; }
    const r = G.city.col.resolve(P.pos.x, P.pos.z, 1.3, P.pos.y + 0.5);
    let near = r.hit; if (!near) near = G.traffic.cars.some((v) => Math.hypot(v.x - P.pos.x, v.z - P.pos.z) < v.dims.L / 2 + 1.0);
    if (!near) { G.hud.msg('附近没有可以躲的掩体', 1.2); return false; }
    P.cover = { x: P.pos.x, z: P.pos.z }; G.hud.msg('进入掩体 · 再按 C 离开', 1.4); return true;
  }
}
