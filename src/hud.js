// HUD v3.4 — contextual corner layout modelled on GTA 6's (see GTA6_REFERENCE.md §1), original styling:
// top-left slim status bars (health / armour / stamina), top-right small 6-star wanted row + evidence dots + weapon/ammo + cash,
// bottom-left light translucent rounded-rect minimap that tints blue in a chase and shows a red search zone once police lose you.
// Everything except the minimap fades out when nothing is happening; Tab peeks all of it.
import { LAYOUT } from './city.js';
import { POI, MISSION_STARTS } from './mapdata.js';

const AREAS = [
  { test: (x, z) => x > 335, name: '棕榈海滩', sub: '海滨' },
  { test: (x, z) => x > 230 && x <= 335, name: '海潮大道', sub: '棕榈海滩' },
  { test: (x, z) => x > 110 && x <= 230, name: '珊瑚大街', sub: '棕榈岛' },
  { test: (x, z) => x > 0 && x <= 110, name: '华盛顿大道', sub: '棕榈岛' },
  { test: (x, z) => true, name: '湾畔', sub: '比斯坎湾' },
];

export class HUD {
  constructor(city) {
    this.city = city;
    this.$ = (id) => document.getElementById(id);
    this.stars = [...document.querySelectorAll('#stars span')];
    this.mm = this.$('mmc'); this.g = this.mm.getContext('2d');
    this.msgT = 0; this.cashT = 0; this.hurtT = 0; this.bigMap = false;
    this.statT = 6; this.wpnT = 0; this.areaT = 0; this.lastArea = ''; this.stam = 100; this.lastHP = 100; this.lastMoney = -1; this.peek = false;
    this.searchPos = null;
    this.buildMap();
    this.hurtEl = document.createElement('div');
    Object.assign(this.hurtEl.style, { position: 'absolute', inset: '0', pointerEvents: 'none', background: 'radial-gradient(rgba(0,0,0,0) 55%, rgba(200,0,20,.5))', opacity: 0, transition: 'opacity .15s' });
    this.$('hud').appendChild(this.hurtEl);
    this.cashEl = document.createElement('div');
    Object.assign(this.cashEl.style, { fontFamily: 'Anton, Impact, sans-serif', fontSize: '18px', color: '#5fe896', textShadow: '0 1px 3px rgba(0,0,0,.7)', opacity: 0, transition: 'opacity .3s' });
    this.$('tr').appendChild(this.cashEl);
    addEventListener('keydown', (e) => { if (e.code === 'Tab') { this.peek = true; e.preventDefault(); } });
    addEventListener('keyup', (e) => { if (e.code === 'Tab') this.peek = false; });
  }
  buildMap() {
    // light "GPS" plate: pale blocks, white roads, light-teal water (GTA6_REFERENCE §1 minimap)
    const X0 = -700, X1 = 720, Z0 = -700, Z1 = 700, S = 0.75;
    this.map = { X0, Z0, S };
    const c = document.createElement('canvas'); c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S; const g = c.getContext('2d');
    const P = (x, z) => [(x - X0) * S, (z - Z0) * S];
    g.fillStyle = '#9fcfda'; g.fillRect(0, 0, c.width, c.height);
    const rect = (x0, z0, x1, z1, col) => { const [a, b] = P(x0, z0); g.fillStyle = col; g.fillRect(a, b, (x1 - x0) * S, (z1 - z0) * S); };
    rect(-1900, -1500, -400, 1500, '#d9dde2'); rect(-60, 520, 340, 1500, '#d9dde2'); rect(-60, -1500, 340, -520, '#d9dde2');
    rect(LAYOUT.islandX[0], LAYOUT.islandZ[0], LAYOUT.beachX[0], LAYOUT.islandZ[1], '#d9dde2');
    rect(LAYOUT.beachX[0], LAYOUT.islandZ[0] - 8, LAYOUT.beachX[0] + 85, LAYOUT.islandZ[1] + 8, '#eee2c4');
    for (const b of this.city.blocks) rect(b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, b.lotMat === 'grass' || b.area === 'promenade' || b.area === 'bayfront' ? '#c3dbb5' : '#c9ced5');
    // building footprints (slightly darker, gives the "3-D city" texture)
    if (this.city.footprints) for (const f of this.city.footprints) rect(f.x0, f.z0, f.x1, f.z1, '#b7bcc4');
    for (const s of this.city.segs) { if (s.axis === 'z') rect(s.c - 6, s.a0 - 1, s.c + 6, s.a1 + 1, '#ffffff'); else rect(s.a0 - 1, s.c - 6, s.a1 + 1, s.c + 6, '#ffffff'); }
    for (const i of this.city.inters) rect(i.x - 7, i.z - 7, i.x + 7, i.z + 7, '#ffffff');
    this.mapCanvas = c;
  }
  toggleBig() { this.bigMap = !this.bigMap; }
  msg(t, s = 2.5) { const m = this.$('msg'); m.textContent = t; m.style.opacity = 1; this.msgT = s; this.$('help').style.opacity = 0; }
  big(t, col) { const b = this.$('big'); b.textContent = t; b.style.color = col; b.style.opacity = t ? 1 : 0; }
  cash(n) { this.cashEl.textContent = '+$' + n; this.cashEl.style.opacity = 1; this.cashT = 2.5; this.statT = Math.max(this.statT, 3); }
  hurt() { this.hurtT = 0.35; this.statT = 5; }
  update(dt, G) {
    const P = G.P;
    this.msgT -= dt; if (this.msgT <= 0) this.$('msg').style.opacity = 0;
    this.cashT -= dt; if (this.cashT <= 0) this.cashEl.style.opacity = 0;
    this.hurtT -= dt; this.hurtEl.style.opacity = this.hurtT > 0 ? 1 : (P.health < 25 ? 0.5 : 0);
    // stamina (visual only): drains while sprinting, refills otherwise
    this.stam = P.stamina ?? 100;
    const combat = G.wanted > 0 || G.mouse.aim || G.mouse.down || P.reloadT > 0 || (G.arsenal && G.arsenal.fireT > -2);
    if (combat || P.health < 60 || P.health !== this.lastHP) this.statT = Math.max(this.statT, 4);
    if (P.money !== this.lastMoney) { if (this.lastMoney >= 0) this.statT = Math.max(this.statT, 3.5); this.lastMoney = P.money; }
    this.lastHP = P.health;
    this.statT -= dt; this.wpnT = combat ? 4 : this.wpnT - dt;
    const show = (id, on) => { this.$(id).style.opacity = on || this.peek ? 1 : 0; };
    show('tl', this.statT > 0);
    this.$('stb').style.display = this.stam < 99.5 || this.peek ? 'flex' : 'none';
    show('stars', G.wanted > 0); show('evid', G.wanted > 0);
    show('wpn', P.onFoot && this.wpnT > 0); show('money', this.statT > 0);
    // wanted: white while seen, red + blinking once they lost sight (search)
    this.stars.forEach((s, i) => s.classList.toggle('on', i < G.wanted));
    this.$('stars').classList.toggle('lost', G.wantedFlash);
    if (G.wanted > 0) {
      const ev = ['脸']; if (!G.evidenceOutfitCleared) ev.push('衣');
      if (P.car || G.lastCrimeInCar) ev.push('车');
      if (G.lastWeaponCrime) ev.push('枪');
      const key = ev.join('');
      if (key !== this.evKey) { this.evKey = key; this.$('evid').innerHTML = ev.map((e) => `<i>${e}</i>`).join(''); }
    }
    this.$('cashv').textContent = '$' + P.money.toLocaleString('en-US');
    { const A = G.arsenal, w = A.cur, a = A.ammo(); this.$('ammo').innerHTML = `<small style="font-size:13px;margin-right:6px">${w.name}</small>` + (w.melee ? '' : A.reloadT > 0 ? '换弹中' : `${a.clip}<small> / ${a.reserve}</small>`); }
    const v = this.$('veh');
    if (P.car) { v.innerHTML = Math.round(Math.abs(P.car.speed) * 3.6) + '<small>km/h</small>'; v.style.opacity = 1; } else v.style.opacity = 0;
    this.$('cross').style.display = P.onFoot && (G.mouse.aim || G.mouse.down) ? 'block' : 'none';
    document.querySelector('#hp i').style.width = Math.max(0, P.health) + '%';
    document.querySelector('#ar i').style.width = Math.max(0, P.armor) + '%';
    document.querySelector('#st i').style.width = this.stam + '%';
    // area name: fades in for a few seconds when the district changes (no permanent label)
    const x = P.pos.x, z = P.pos.z; const a = AREAS.find((r) => r.test(x, z));
    const h = window.__G ? window.__G.hour : 18; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    if (a.name !== this.lastArea) { this.lastArea = a.name; this.areaT = 5; }
    this.areaT -= dt;
    this.$('area').innerHTML = `<b>${a.name}</b><span>${a.sub} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span>`;
    show('area', this.areaT > 0);
    // police search zone (GTA6 shows an area, not police dots)
    if (G.wanted > 0 && G.wantedFlash) { if (!this.searchPos) this.searchPos = (G.lastSeen || P.pos).clone(); } else this.searchPos = null;
    this.drawMinimap(G);
  }
  drawMinimap(G) {
    const g = this.g, W = this.mm.width, H = this.mm.height; const P = G.P; const M = this.map;
    g.save(); g.clearRect(0, 0, W, H);
    g.beginPath(); g.roundRect(0, 0, W, H, 18); g.clip();
    const zoom = (P.car ? 1.5 - Math.min(0.65, Math.abs(P.car.speed) / 40) : 1.9); // canvas px per map px
    const yaw = G.cam.yaw + Math.PI; // camera forward
    const cx = W / 2, cy = H * 0.6;
    g.translate(cx, cy); g.rotate(Math.PI + yaw); g.scale(zoom, zoom);
    g.translate(-(P.pos.x - M.X0) * M.S, -(P.pos.z - M.Z0) * M.S);
    g.globalAlpha = 0.86; g.drawImage(this.mapCanvas, 0, 0); g.globalAlpha = 1;
    if (this.searchPos) { // red search area
      const t = performance.now() / 1000;
      g.fillStyle = `rgba(235,40,60,${0.28 + Math.sin(t * 3) * 0.06})`;
      g.beginPath(); g.arc((this.searchPos.x - M.X0) * M.S, (this.searchPos.z - M.Z0) * M.S, 95 * M.S, 0, 7); g.fill();
    }
    // v4.3 map icons: shops (letters in coloured discs) + mission starts (yellow letters)
    const icon = (x, z, t, col, r = 7) => { const ix = (x - M.X0) * M.S, iz = (z - M.Z0) * M.S; g.save(); g.translate(ix, iz); g.rotate(-(Math.PI + yaw)); g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.2 / zoom; g.beginPath(); g.arc(0, 0, r / zoom, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.font = `bold ${10 / zoom}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 0.5 / zoom); g.restore(); };
    for (const p of [POI.gunshop, POI.clothes, POI.modshop, ...POI.stores]) icon(p.x, p.z, p.icon, p.col);
    for (const a of POI.atms) icon(a.x, a.z, '$', '#2f9e5b', 5);
    if (G.missions && !G.missions.active) for (const s of MISSION_STARTS) icon(s.x, s.z, s.letter, '#e0a91f', 8);
    const tg = (G.missions && G.missions.target) || (G.mission && G.mission.target) || G.waypoint || (G.mission && G.mission.state === 'idle' ? { x: 281, z: 10 } : null);
    if (G.waypoint && Math.hypot(G.waypoint.x - P.pos.x, G.waypoint.z - P.pos.z) < 8) G.waypoint = null;
    if (tg) { // v4.3 mission GPS: magenta route hint + yellow blip
      const tx = (tg.x - M.X0) * M.S, tz = (tg.z - M.Z0) * M.S, px = (P.pos.x - M.X0) * M.S, pz = (P.pos.z - M.Z0) * M.S;
      if (tg !== undefined && (G.mission.target || (G.missions && G.missions.target) || G.waypoint)) { g.strokeStyle = 'rgba(214,60,190,.85)'; g.lineWidth = 3.2 / zoom; g.setLineDash([5 / zoom, 4 / zoom]); g.beginPath(); g.moveTo(px, pz); g.lineTo(tx, tz); g.stroke(); g.setLineDash([]); }
      g.fillStyle = '#ffc34d'; g.strokeStyle = '#3a2a00'; g.lineWidth = 1.5 / zoom; g.beginPath(); g.arc(tx, tz, 6 / zoom, 0, 7); g.fill(); g.stroke();
    }
    g.restore();
    // dark plate variant at night (the GPS map follows the time of day)
    const nt = window.__G && window.__G.env ? window.__G.env.look.night || 0 : 0;
    if (nt > 0.05) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${Math.round(255 - 205 * nt)},${Math.round(255 - 195 * nt)},${Math.round(255 - 160 * nt)},1)`; g.fillRect(0, 0, W, H); g.restore(); }
    // chase tint: the whole plate goes blue while police can see you
    if (G.wanted > 0 && !G.wantedFlash) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(60,110,230,.85)'; g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill(); g.restore(); }
    // player marker: white arrow in a dark disc
    g.save(); g.translate(cx, cy);
    g.fillStyle = 'rgba(20,22,30,.85)'; g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fill();
    g.rotate(-(P.onFoot ? P.yaw : P.car.yaw) + yaw + Math.PI);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill();
    g.restore();
    // north marker (bottom-left corner)
    const nAng = Math.PI + yaw; // map +z is "north" (top of the map canvas)
    g.save(); g.translate(20, H - 20); g.fillStyle = 'rgba(20,22,30,.7)'; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
    g.rotate(nAng + Math.PI); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, 0.5); g.restore();
    // rim
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.roundRect(1, 1, W - 2, H - 2, 17); g.stroke();
  }
}
