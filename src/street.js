// v3.4 street clutter (GTA6_REFERENCE.md §6): wooden utility poles + sagging power/phone lines, traffic & street-name signs,
// bus shelters, newspaper boxes, utility cabinets, parking meters, bollards, storm drains + manholes, and broadleaf street trees.
// Everything is original artwork drawn on canvas (Chinese/English invented street names, generic sign shapes).
import * as THREE from 'three';
import { GeoBucket, dropJS } from './geo.js';
import { M, prep, SHOPK } from './mats.js';
import { U } from './env.js';
import { LAYOUT } from './city.js';
import { stamp, woodPole, busShelter, newsBox, cabinet } from './detail.js';
import { mulberry } from './util.js';
import { CYBER } from './mapsel.js';
import { EDGE_OFF } from './maps/gta/edgewalls.js'; // a_edgewalls
import { NS_NAME, NS_PY, EW_NAME, EW_PY } from './maps/gta/streetnames.js';
import { furnMat, PB, parkingMeter, litterBin, bollard, coverAtlas, coverQuad } from './streetkit.js';

const RH = LAYOUT.roadHW;
const STREETS_Z = ['北滨路', '珊瑚街', '鹈鹕路', '海葡萄街', '第五大道', '棕榈巷', '日落街', '灯塔路', '贝壳街']; // EW roads by index
export const BLADE_NAMES = [], BLADE_LOG = []; // a_streetnames: map A atlas blade texts by cell (read back by tests through city.signage.streetNames())
const STREETS_X = ['湾景路', '红树林大道', '火烈鸟街', '海潮大道', '金融大道', '港湾路', '运河街', '商业街', '中央大道'];

// a_streetnames: map A blade cells read the shared table (EW roads at cells 0..4 by LAYOUT.islandEW index, NS at 9..11 by
// LAYOUT.islandNS index — the same indices buildStreet's zIdx / xIdx pick). Fills names in place, returns cell -> pinyin.
function bladeNamesA(names) {
  const py = new Map(); LAYOUT.islandEW.forEach((z, i) => { if (EW_NAME[z]) { names[i] = EW_NAME[z]; py.set(i, EW_PY[z]); } }); LAYOUT.islandNS.forEach((x, i) => { if (NS_NAME[x]) { names[9 + i] = NS_NAME[x]; py.set(9 + i, NS_PY[x]); } });
  BLADE_NAMES.length = 0; BLADE_NAMES.push(...names); return py;
}
const OLD_SIGNBACK = typeof location !== 'undefined' && /[?&]oldsignback\b/.test(location.search); // fix_pt2
const OLD_POOL = typeof location !== 'undefined' && /[?&]oldpool\b/.test(location.search); // fix_pt2
function signAtlas() {
  // 8x4 cells of 128px: generic road signs (original drawings)
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const cell = (i, f) => { g.save(); g.translate((i % 8) * 128, Math.floor(i / 8) * 128); f(); g.restore(); };
  const txt = (t, x, y, size, col, font = 'bold') => { g.fillStyle = col; g.font = `${font} ${size}px "Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  g.fillStyle = '#888'; g.fillRect(0, 0, 1024, 512);
  // 0 speed limit 40
  cell(0, () => { g.fillStyle = '#f4f4f0'; g.fillRect(14, 4, 100, 120); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(20, 10, 88, 108); txt('限速', 64, 34, 22, '#111'); g.fillStyle = '#111'; g.font = 'bold 52px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.fillText('40', 64, 86); });
  // 1 pedestrian crossing diamond (yellow-green)
  cell(1, () => { g.fillStyle = '#d7e93a'; g.beginPath(); g.moveTo(64, 2); g.lineTo(126, 64); g.lineTo(64, 126); g.lineTo(2, 64); g.closePath(); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 9); g.lineTo(119, 64); g.lineTo(64, 119); g.lineTo(9, 64); g.closePath(); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(66, 34, 8, 0, 7); g.fill(); g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(64, 46); g.lineTo(60, 74); g.lineTo(48, 96); g.moveTo(60, 74); g.lineTo(74, 96); g.moveTo(63, 52); g.lineTo(48, 64); g.moveTo(63, 52); g.lineTo(80, 62); g.stroke(); });
  // 2 no parking
  cell(2, () => { g.fillStyle = '#f4f4f0'; g.fillRect(18, 4, 92, 120); g.strokeStyle = '#d0202a'; g.lineWidth = 8; g.beginPath(); g.arc(64, 54, 34, 0, 7); g.stroke(); txt('P', 64, 56, 44, '#111'); g.beginPath(); g.moveTo(40, 30); g.lineTo(88, 78); g.stroke(); txt('禁止停车', 64, 108, 17, '#d0202a'); });
  // 3 one way
  cell(3, () => { g.fillStyle = '#111'; g.fillRect(2, 38, 124, 52); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(14, 56); g.lineTo(84, 56); g.lineTo(84, 46); g.lineTo(116, 64); g.lineTo(84, 82); g.lineTo(84, 72); g.lineTo(14, 72); g.closePath(); g.fill(); txt('单行', 46, 64, 14, '#111'); });
  // 4 bus stop
  cell(4, () => { g.fillStyle = '#1f5fbf'; g.fillRect(14, 4, 100, 120); g.fillStyle = '#fff'; g.fillRect(34, 22, 60, 44); g.fillStyle = '#1f5fbf'; g.fillRect(40, 28, 48, 18); g.fillStyle = '#fff'; g.beginPath(); g.arc(46, 72, 7, 0, 7); g.arc(82, 72, 7, 0, 7); g.fill(); txt('公交车站', 64, 102, 17, '#fff'); });
  // 5 stop octagon (original glyph)
  cell(5, () => { g.fillStyle = '#c8141e'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); } g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55); } g.closePath(); g.stroke(); txt('停', 64, 66, 64, '#fff'); });
  // 6 school/children warning (yellow diamond with "注意")
  cell(6, () => { g.fillStyle = '#f2c516'; g.beginPath(); g.moveTo(64, 2); g.lineTo(126, 64); g.lineTo(64, 126); g.lineTo(2, 64); g.closePath(); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 9); g.lineTo(119, 64); g.lineTo(64, 119); g.lineTo(9, 64); g.closePath(); g.stroke(); txt('注意', 64, 56, 26, '#111'); txt('行人', 64, 84, 20, '#111'); });
  // 7 tow-away / parking hours
  cell(7, () => { g.fillStyle = '#f4f4f0'; g.fillRect(22, 2, 84, 124); g.strokeStyle = '#1a7a3a'; g.lineWidth = 3; g.strokeRect(26, 6, 76, 116); txt('2小时', 64, 30, 22, '#1a7a3a'); txt('停车', 64, 56, 22, '#1a7a3a'); txt('8:00-18:00', 64, 84, 14, '#1a7a3a'); txt('周一至周六', 64, 106, 13, '#1a7a3a'); });
  // 8..15: billboard-ish small posters for bus shelters (backlit ads)
  const ads = [['冰椰汁', '#ff4f86', '#ffe3ef'], ['海浪 FM 93.1', '#3a2a7a', '#9fe6ff'], ['海风防晒', '#ffb347', '#1b3d6d'], ['夜潮俱乐部', '#141414', '#ff5fd2'], ['索拉纳银行', '#0d4c6b', '#ffffff'], ['冲浪节', '#1fb5a7', '#fff6d0'], ['古巴咖啡', '#5a2e14', '#ffd28a'], ['炸鱼小馆', '#d62f2f', '#ffe14d']];
  ads.forEach(([t, bg, fg], k) => cell(8 + k, () => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, bg); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = fg; g.globalAlpha = 0.25; g.beginPath(); g.arc(90, 40, 34, 0, 7); g.fill(); g.globalAlpha = 1; txt(t, 64, 84, t.length > 6 ? 15 : 20, fg); }));
  // 16..31 street-name blades: 2 per row-cell pair (256x64 each, green)
  const names = [...STREETS_Z, ...STREETS_X].slice(0, 16);
  if (!CYBER) { // a_streetnames: map A blades read the shared table (cell = layout index: EW k 0..4, NS k 9..11), pinyin under the name
    const py = bladeNamesA(names);
    names.forEach((n, k) => { const x = (k % 4) * 256, y = 256 + Math.floor(k / 4) * 64; g.fillStyle = '#16703f'; g.fillRect(x, y, 256, 64); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, 248, 56); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const p = py.get(k); g.font = `bold ${p ? 30 : 34}px "WenQuanYi Zen Hei","Noto Sans CJK SC","PingFang SC",sans-serif`; const w = g.measureText(n).width; if (w > 232) g.font = `bold ${Math.floor((p ? 30 : 34) * 232 / w)}px "WenQuanYi Zen Hei","Noto Sans CJK SC","PingFang SC",sans-serif`; g.fillText(n, x + 128, y + (p ? 26 : 33));
      if (p) { g.font = 'bold 12px "DejaVu Sans", Arial, sans-serif'; g.fillText(p, x + 128, y + 50); } });
  } else names.forEach((n, k) => { const x = (k % 4) * 256, y = 256 + Math.floor(k / 4) * 64; g.fillStyle = '#16703f'; g.fillRect(x, y, 256, 64); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, 248, 56); g.fillStyle = '#fff'; g.font = 'bold 34px "Noto Sans CJK SC","PingFang SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x + 128, y + 33); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

export function addStreetTrees(city) {
  // broadleaf canopy trees (sea grape / live oak stand-ins) on the quieter island NS streets and bayfront avenues
  const r = mulberry(777);
  const near = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d);
  let n = 0;
  for (const s of city.segs) {
    if (s.bridge) continue;
    const island = s.axis === 'z' ? s.c > -200 : s.a0 > -200;
    const want = (s.axis === 'z' && island && s.c < 170) || (!island && s.axis === 'x' && s.a1 > -900) || (island && s.axis === 'x' && r() < 0.35);
    if (!want) continue;
    const len = s.a1 - s.a0; const step = island ? 13 : 16;
    for (let a = s.a0 + 6; a < s.a1 - 6; a += step + r() * 4) {
      for (const side of [-1, 1]) {
        if (r() < 0.18) continue;
        const off = side * (RH + 2.7);
        const x = s.axis === 'z' ? s.c + off : a, z = s.axis === 'z' ? a : s.c + off;
        if (near(x, z, 3.2)) continue;
        city.trees.push({ x, z, s: 0.7 + r() * 0.45, street: true }); city.col.add(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 6, 'tree'); n++;
      }
    }
    void len;
  }
  return n;
}

export function buildStreet(scene, city) {
  const r = mulberry(31337);
  const g = new GeoBucket(CYBER ? {} : { aPbr: 3 }); // vertex-coloured solid props (r6.3 索拉纳港: + per-vertex roughness / metalness / wear class)
  const w = new GeoBucket();          // wires (double-sided ribbons)
  const sg = new GeoBucket();         // sign faces (atlas uv)
  const T = (x, y, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  const add = (geo, m, c) => g.geom(geo, m, {}, c);
  const addP = (pb) => (geo, m, c) => g.geom(geo, m, { aPbr: pb }, c); // r6.3: stamp() with a PBR class
  const stamp3 = (parts, m) => { for (const [geo, c, pb] of parts) g.geom(geo, m, { aPbr: pb }, c); };
  const cov = new GeoBucket(); const covers = (i, w, d, m) => cov.geom(coverQuad(i, w, d), m); // r6.3 cast-iron floor covers
  const occupied = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
  const signFace = (cellU0, cellV0, cellU1, cellV1, x, y, z, ry, wdt, hgt, det = false) => {
    const geo = new THREE.PlaneGeometry(wdt, hgt); const uv = geo.attributes.uv;
    for (let k = 0; k < 4; k++) uv.setXY(k, cellU0 + (cellU1 - cellU0) * uv.getX(k), cellV0 + (cellV1 - cellV0) * uv.getY(k));
    const m = T(x, y, z, ry); sg.geom(geo, m);
    const back = new THREE.PlaneGeometry(wdt, hgt); back.rotateY(Math.PI); back.translate(0, 0, -0.012); add(back, m, OLD_SIGNBACK ? [0.55, 0.56, 0.57] : [0.34, 0.35, 0.36]);
    // fix_pt2 (?oldsignback = old): a bare light-grey back read as an empty notice board at night (PLAYTEST_1H V2): darker aluminium,
    // a folded rim and two horizontal mounting channels with the clamp, in the same furniture mesh (no new draw / program)
    if (!OLD_SIGNBACK && det) { const rim = [0.5, 0.51, 0.52], ch = [0.22, 0.23, 0.24];
      for (const sy of [-1, 1]) { const e = new THREE.BoxGeometry(wdt, 0.025, 0.02); e.translate(0, sy * (hgt / 2 - 0.012), -0.022); add(e, m, rim); }
      for (const sx of [-1, 1]) { const e = new THREE.BoxGeometry(0.025, hgt, 0.02); e.translate(sx * (wdt / 2 - 0.012), 0, -0.022); add(e, m, rim); }
      for (const sy of [-0.28, 0.28]) { const c = new THREE.BoxGeometry(wdt * 0.92, 0.045, 0.03); c.translate(0, sy * hgt, -0.03); add(c, m, ch); } }
  };
  const cellUV = (i) => { const cx = i % 8, cy = Math.floor(i / 8); return [cx / 8, 1 - (cy + 1) / 4, (cx + 1) / 8, 1 - cy / 4]; };
  const postSign = (x, z, ry, cell, h = 2.6, size = 0.75) => {
    const gh = city.groundH(x, z);
    const p = new THREE.CylinderGeometry(0.035, 0.035, h + size * 0.5, 6); add(p, T(x, gh + (h + size * 0.5) / 2, z), [0.6, 0.62, 0.63]);
    const [u0, v0, u1, v1] = cellUV(cell);
    const fx = Math.sin(ry) * 0.05, fz = Math.cos(ry) * 0.05;
    signFace(u0, v0, u1, v1, x + fx, gh + h, z + fz, ry, size, size, true); // fix_pt2: single-sided post sign -> back detail
    city.col.add(x - 0.08, z - 0.08, x + 0.08, z + 0.08, 3, 'sign');
  };

  // ---------------- utility poles + power lines (island EW streets, back NS streets, mainland bayfront avenues)
  const poleLines = [];
  for (const s of city.segs) {
    if (s.bridge) continue;
    const island = s.axis === 'z' ? s.c > -200 : s.a0 > -200;
    if (s.axis === 'z' && s.c === 290) continue;     // no poles on the Deco beachfront drive (wires are buried there)
    if (!island && s.a0 < -1000 && s.axis === 'x') continue;
    if (!island && s.axis === 'z' && s.c < -700) continue; // downtown core: underground
    const side = (Math.round(s.c / 10) % 2) ? 1 : -1; const off = side * (RH + 0.45);
    const pts = [];
    for (let a = s.a0 + 3; a <= s.a1 - 2; a += 33) {
      let aa = a; let tries = 0;
      while (tries++ < 6) { const x = s.axis === 'z' ? s.c + off : aa, z = s.axis === 'z' ? aa : s.c + off; if (!occupied(x, z, 1.6)) break; aa += 1.7; }
      const x = s.axis === 'z' ? s.c + off : aa, z = s.axis === 'z' ? aa : s.c + off;
      pts.push({ x, z });
    }
    if (pts.length >= 2) poleLines.push({ s, pts, side });
  }
  const woodC = [[0.36, 0.30, 0.24], [0.42, 0.36, 0.29], [0.33, 0.29, 0.26], [0.58, 0.57, 0.55]];
  let poles = 0;
  for (const L of poleLines) {
    const along = L.s.axis === 'z' ? [0, 1] : [1, 0]; // line direction
    const ry = L.s.axis === 'z' ? 0 : Math.PI / 2;    // crossarm perpendicular to the line
    const tops = [];
    for (const p of L.pts) {
      const gh = city.groundH(p.x, p.z); const H = 10.5 + r() * 1.2; const c = woodC[Math.floor(r() * woodC.length)];
      // v4.2 detailed wooden pole (steps, tag, braces, ribbed insulators, transformer) — src/detail.js
      const pm = T(p.x, gh, p.z, ry); stamp(CYBER ? add : addP(PB.wood), woodPole(H, r, c, { transformer: r() < 0.3 }), pm);
      const ins = [];
      for (const k of [-1.05, 0, 1.05]) ins.push(new THREE.Vector3(k, H - 0.45 + 0.3, 0.15).applyMatrix4(pm));
      ins.push(new THREE.Vector3(0.2, H - 2.6, 0.18).applyMatrix4(pm)); ins.push(new THREE.Vector3(-0.2, H - 3.1, 0.18).applyMatrix4(pm));
      // streetlight-ish small arm on some poles
      tops.push(ins); poles++;
      city.col.add(p.x - 0.2, p.z - 0.2, p.x + 0.2, p.z + 0.2, 10, 'upole');
    }
    for (let i = 0; i < tops.length - 1; i++) for (let k = 0; k < tops[i].length; k++) wire(w, tops[i][k], tops[i + 1][k], k < 3 ? 0.55 + r() * 0.25 : 0.8 + r() * 0.3, k < 3 ? 0.022 : 0.03);
    void along;
  }

  // ---------------- signs: street-name blades at signal poles, speed / crossing / parking signs along segments
  if (!CYBER) bladeNamesA([...STREETS_Z, ...STREETS_X].slice(0, 16)); BLADE_LOG.length = 0;
  const zIdx = (z) => Math.max(0, LAYOUT.islandEW.indexOf(z) >= 0 ? LAYOUT.islandEW.indexOf(z) : LAYOUT.mainEW.indexOf(z)) % 9;
  const xIdx = (x) => { const i = LAYOUT.islandNS.indexOf(x); return i >= 0 ? i : 4 + Math.max(0, LAYOUT.mainNS.indexOf(x)); };
  const bladeUV = (k) => { const x = (k % 4) * 256, y = 256 + Math.floor(k / 4) * 64; return [x / 1024, 1 - (y + 64) / 512, (x + 256) / 1024, 1 - y / 512]; };
  for (const it of city.inters) {
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = it.x + sx * (RH + 1.2), pz = it.z + sz * (RH + 1.2);
      const kz = Math.min(15, zIdx(it.z)), kx = Math.min(15, 9 + (xIdx(it.x) % 7));
      if (!CYBER) BLADE_LOG.push({ x: +px.toFixed(2), z: +pz.toFixed(2), ix: it.x, iz: it.z, ew: BLADE_NAMES[kz], ns: BLADE_NAMES[kx] }); // a_streetnames: read back by tests
      let [u0, v0, u1, v1] = bladeUV(kz); signFace(u0, v0, u1, v1, px - sx * 0.9, 4.7, pz, 0, 1.6, 0.4); signFace(u0, v0, u1, v1, px - sx * 0.9, 4.7, pz, Math.PI, 1.6, 0.4);
      [u0, v0, u1, v1] = bladeUV(kx); signFace(u0, v0, u1, v1, px, 5.15, pz - sz * 0.9, Math.PI / 2, 1.6, 0.4); signFace(u0, v0, u1, v1, px, 5.15, pz - sz * 0.9, -Math.PI / 2, 1.6, 0.4);
    }
  }
  let nSigns = 0;
  for (const s of city.segs) {
    if (s.bridge || s.a1 - s.a0 < 40) continue;
    const at = (a, side) => (s.axis === 'z' ? [s.c + side * (RH + 0.55), a] : [a, s.c + side * (RH + 0.55)]);
    const face = (dir) => (s.axis === 'z' ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2));
    const cand = [[s.a0 + 14, 1, 1, 0], [s.a1 - 14, -1, -1, 0], [s.a0 + 9, -1, 1, r() < 0.5 ? 1 : 6], [s.a1 - 30, 1, -1, s.c === 290 ? 2 : 7]];
    for (const [a, side, dir, cell] of cand) {
      const [x, z] = at(a, side); if (occupied(x, z, 1.4)) continue;
      postSign(x, z, face(dir), cell); nSigns++;
    }
  }

  // ---------------- bus shelters (promenade side of the beachfront drive + bayfront avenue)
  const shelters = [];
  for (let z = -LAYOUT.islandZ[1] + 70; z <= LAYOUT.islandZ[1] - 40; z += 150) shelters.push({ x: 299.2, z: z + 31, ry: -Math.PI / 2 });
  for (const s of city.segs) if (s.axis === 'x' && s.c === 0 && s.a0 < -600 && s.a1 > -1000) shelters.push({ x: (s.a0 + s.a1) / 2, z: RH + 2.2, ry: Math.PI });
  for (const sh of shelters) {
    const gh = city.groundH(sh.x, sh.z); const m = T(sh.x, gh, sh.z, sh.ry);
    stamp(CYBER ? add : addP(PB.paint), busShelter(), m); // v4.2 detailed shelter (curved roof, framed glazing, slatted bench, timetable case, bin)
    const ad = cellUV(8 + Math.floor(r() * 8)); const lm = new THREE.Vector3(sh.x, gh + 1.3, sh.z);
    const fm = new THREE.Matrix4().multiplyMatrices(m, T(2.0, 1.3, 0, Math.PI / 2)); const e = new THREE.Vector3(); e.setFromMatrixPosition(fm);
    signFace(ad[0], ad[1], ad[2], ad[3], e.x, e.y, e.z, sh.ry + Math.PI / 2, 1.1, 1.6); void lm;
    postSign(sh.x + Math.cos(sh.ry) * 2.8, sh.z - Math.sin(sh.ry) * 2.8, sh.ry, 4, 2.4, 0.6);
    const sb = city.col.add(sh.x - 2.2, sh.z - 2.2, sh.x + 2.2, sh.z + 2.2, 2.5, 'shelter');
    if (!CYBER) { // a_lane8fix: detail.busShelter footprint (local x along the street, +z out of the open front) instead of the 4.4 m square that spanned
      // the whole promenade sidewalk: back glazing + bench strip, side wing pane, map-case end post, front post, litter bin (applied by maps/gta/colfix.js)
      const c = Math.cos(sh.ry), s2 = Math.sin(sh.ry); const L = (u0, u1, v0, v1, h) => { const xs = [], zs = [];
        for (const u of [u0, u1]) for (const v of [v0, v1]) { xs.push(sh.x + c * u + s2 * v); zs.push(sh.z - s2 * u + c * v); }
        return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), h]; };
      sb.fit = [L(-2.0, 2.0, -0.7, -0.12, 2.5), L(-2.0, -1.9, -0.12, 0.6, 2.5), L(1.9, 2.0, -0.12, 0.6, 2.5), L(2.15, 2.55, 0.0, 0.4, 0.75)]; }
  }

  // ---------------- corner clutter: newspaper boxes, utility cabinets, bins, bollards; parking meters on the beachfront drive
  const boxCols = [[0.12, 0.32, 0.65], [0.75, 0.12, 0.12], [0.9, 0.75, 0.15], [0.95, 0.95, 0.93], [0.15, 0.45, 0.25]];
  for (const it of city.inters) {
    const island = it.x > -200;
    const cs = [[1, -1], [-1, 1]];
    for (const [sx, sz] of cs) {
      if (r() < 0.25) continue;
      const bx = it.x + sx * (RH + 3.0), bz = it.z + sz * (RH + 1.6);
      if (occupied(bx, bz, 1.2)) continue;
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) { const c = boxCols[Math.floor(r() * boxCols.length)]; stamp(CYBER ? add : addP(PB.paint), newsBox(c), T(bx + k * 0.52 * sz, 0.15, bz, sz > 0 ? 0 : Math.PI)); }
      const nb = city.col.add(bx - 0.3, bz - 0.3, bx + 1.6, bz + 0.3, 1.1, 'nbox');
      if (!CYBER) { const xe = bx + (n - 1) * 0.52 * sz; nb.fit = [[Math.min(bx, xe) - 0.25, bz - 0.25, Math.max(bx, xe) + 0.25, bz + 0.25, 1.1]]; } // a_lane8fix: real run of n boxes (0.47 m, 0.52 m pitch toward sz), applied after every layer is placed (maps/gta/colfix.js)
    }
    if (r() < 0.7) { // utility cabinet
      const ux = it.x - (RH + 3.4), uz = it.z + (RH + 4.5);
      if (!occupied(ux, uz, 1.2)) { stamp(CYBER ? add : addP(PB.paintMatte), cabinet(island ? [0.48, 0.55, 0.5] : [0.55, 0.56, 0.55]), T(ux, 0.15, uz, Math.PI / 2)); city.col.add(ux - 0.45, uz - 0.6, ux + 0.45, uz + 0.6, 1.4, 'cab'); }
    }
    // bins (green island / black downtown)
    const tx = it.x + (RH + 1.2), tz = it.z - (RH + 3.2);
    if (!occupied(tx, tz, 1.0)) { if (!CYBER) { stamp3(litterBin(island ? [0.10, 0.26, 0.17] : [0.08, 0.085, 0.09]), T(tx, 0.15, tz, r() * 6.28)); (city.clutAdd = city.clutAdd || []).push({ k: 'bin', x: tx, z: tz, ang: 0, hl: 0.31, hw: 0.31, h: 1.1 }); } // a_edgewalls: litter bin had no box (applied after every layer, edgewalls.js)
      else { const bin = new THREE.CylinderGeometry(0.3, 0.27, 0.95, 10); add(bin, T(tx, 0.62, tz), island ? [0.14, 0.32, 0.22] : [0.12, 0.12, 0.13]); const lid = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 10); add(lid, T(tx, 1.12, tz), [0.1, 0.1, 0.1]); } }
    // r6.3 sidewalk utility lids (telecom / water) near the corner
    if (!CYBER && r() < 0.6) { const lx = it.x - (RH + 1.4), lz = it.z - (RH + 2.0 + r() * 3); if (city.groundH(lx, lz) > 0.1) covers(3, 0.62, 0.9, T(lx, 0.152, lz, r() < 0.5 ? 0 : Math.PI / 2)); }
  }
  for (const s of city.segs) { // parking meters next to the beachfront parking lane
    if (!(s.axis === 'z' && s.c === 290)) continue;
    let mk = 0;
    for (let z = s.a0 + 13.4; z < s.a1 - 10; z += 6.8) { const x = 282.3; if (occupied(x, z, 0.8)) continue;
      if (!CYBER) { // r6.3 smart meters: twin heads on a yoke every other bay (one per parking space), painted housings, galvanised posts
        if (mk++ % 2 === 1) continue; const body = [[0.10, 0.12, 0.16], [0.13, 0.13, 0.14], [0.08, 0.2, 0.16]][Math.floor(r() * 3)];
        let zm = z + 3.4; if (!EDGE_OFF) { // a_edgewalls: the occupancy test above looks at z, the meter stands at z + 3.4: off a lamp / tree / palm there, slide along the kerb (no rng draw)
          const busy = (q) => occupied(x, q, 0.55); if (busy(zm)) for (const dz of [1.0, -1.0, 1.6, -1.6]) if (!busy(z + 3.4 + dz)) { zm = z + 3.4 + dz; break; } }
        stamp3(parkingMeter(true, body), T(x, 0.15, zm, Math.PI / 2)); city.col.add(x - 0.12, zm - 0.4, x + 0.12, zm + 0.4, 1.5, 'meter'); continue; }
      const p = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6); add(p, T(x, 0.15 + 0.55, z), [0.3, 0.3, 0.32]); const hd = new THREE.CylinderGeometry(0.1, 0.1, 0.26, 14); hd.scale(1, 1, 0.75); add(hd, T(x, 0.15 + 1.22, z), [0.25, 0.27, 0.3]);
      const dome = new THREE.SphereGeometry(0.1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.8, 0.75); add(dome, T(x, 0.15 + 1.35, z), [0.25, 0.27, 0.3]);
      const win = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12); win.rotateZ(Math.PI / 2); add(win, T(x - 0.07, 0.15 + 1.3, z), [0.55, 0.62, 0.62]);
      const collar = new THREE.CylinderGeometry(0.07, 0.05, 0.08, 10); add(collar, T(x, 0.15 + 1.07, z), [0.2, 0.2, 0.22]); }
  }
  // bollards at the promenade crossings
  for (const z of LAYOUT.islandEW) for (let k = -3; k <= 3; k++) { const x = 299.4, zz = z + k * 1.6 ; if (Math.abs(k) < 1) continue;
    if (!CYBER) { stamp3(bollard(), T(x, city.groundH(x, zz), zz, r() * 6.28)); (city.clutAdd = city.clutAdd || []).push({ k: 'bollard', x, z: zz, ang: 0, hl: 0.11, hw: 0.11, h: 1.0 }); continue; } // a_edgewalls: box (edgewalls.js)
    const b = new THREE.CylinderGeometry(0.11, 0.12, 0.9, 8); add(b, T(x, 0.6, zz), [0.92, 0.92, 0.9]); }
  // r6.3 tree grates around the sidewalk street trees
  if (!CYBER) for (const t of city.trees) if (t.street && city.groundH(t.x, t.z) > 0.1) covers(1, 1.3, 1.3, T(t.x, city.groundH(t.x, t.z) + 0.004, t.z));

  // ---------------- road decals: storm drains at the curb, manholes in lanes
  const dec = new GeoBucket();
  for (const s of city.segs) {
    if (s.bridge) continue;
    for (let a = s.a0 + 8; a < s.a1 - 8; a += 27 + r() * 10) {
      for (const side of [-1, 1]) {
        const off = side * (RH - 0.35);
        const x = s.axis === 'z' ? s.c + off : a, z = s.axis === 'z' ? a : s.c + off;
        if (!CYBER) { // r6.3 cast-iron grate in the gutter + the dark curb-inlet mouth in the kerb face behind it
          covers(2, 0.62, 1.0, T(x, 0.013, z, s.axis === 'z' ? 0 : Math.PI / 2));
          const kx = s.axis === 'z' ? s.c + side * (RH - 0.006) : a, kz = s.axis === 'z' ? a : s.c + side * (RH - 0.006);
          const mouth = new THREE.PlaneGeometry(1.15, 0.075); dec.geom(mouth, T(kx, 0.07, kz, s.axis === 'z' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0)), {}, [0.015, 0.015, 0.015]);
          continue; }
        const q = new THREE.PlaneGeometry(s.axis === 'z' ? 0.55 : 1.0, s.axis === 'z' ? 1.0 : 0.55); q.rotateX(-Math.PI / 2); dec.geom(q, T(x, 0.012, z), {}, [0.06, 0.06, 0.06]);
        const rim = new THREE.PlaneGeometry(s.axis === 'z' ? 0.75 : 1.2, s.axis === 'z' ? 1.2 : 0.75); rim.rotateX(-Math.PI / 2); dec.geom(rim, T(x, 0.009, z), {}, [0.38, 0.37, 0.35]);
      }
      if (r() < 0.6) { const off = (r() < 0.5 ? -1 : 1) * 3.4; const x = s.axis === 'z' ? s.c + off : a + 9, z = s.axis === 'z' ? a + 9 : s.c + off;
        if (!CYBER) { const q = new THREE.CircleGeometry(0.4, 20); q.rotateX(-Math.PI / 2); const uv = q.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) / 4); cov.geom(q, T(x, 0.011, z, r() * 6.28)); continue; }
        const c = new THREE.CircleGeometry(0.42, 14); c.rotateX(-Math.PI / 2); dec.geom(c, T(x, 0.011, z), {}, [0.16, 0.15, 0.14]); }
    }
  }
  const decMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'decal');
  const decMesh = new THREE.Mesh(dec.build(), decMat); decMesh.receiveShadow = true; scene.add(decMesh);

  if (cov.vc) { const cm = new THREE.Mesh(cov.build(), coverAtlas()); cm.receiveShadow = true; scene.add(cm); }
  const solid = new THREE.Mesh(g.build(), CYBER ? M.vcol : furnMat()); solid.castShadow = true; solid.receiveShadow = true; scene.add(solid);
  const wireMat = prep(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }), 'wire');
  const wires = new THREE.Mesh(w.build(), wireMat); wires.castShadow = false; scene.add(wires);
  const atlas = signAtlas();
  const signMat = prep(new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.45, metalness: 0.1, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.0 }), 'rsign');
  const signs = new THREE.Mesh(sg.build(), signMat); signs.castShadow = true; signs.receiveShadow = true; scene.add(signs); dropJS(g, w, sg, cov); // perf_debug5
  // v3.5 kerb ramps where the crosswalks (1.0–4.2 m from each intersection edge) meet the kerb: sloped concrete wedge with
  // flared sides and a yellow detectable-warning pad at the bottom
  {
    const rb = new GeoBucket(); const V = (x, y, z) => new THREE.Vector3(x, y, z); const UV = [0, 0, 1, 0, 1, 1, 0, 1];
    const conc = [0.74, 0.73, 0.7], yel = [0.92, 0.72, 0.12]; const D = 0.75, Y = 0.15;
    const isRoad = (x, z) => city.isLand(x, z) && !city.blockAt(x, z) && city.groundH(x, z) < 0.05;
    const ramp = (fx, fz, nx, nz, ax, az) => { // face point, outward normal, along-face unit
      const w = 1.6; const P = (a, d, y) => V(fx + ax * a + nx * d, y, fz + az * a + nz * d);
      const q = (A, B, C, D2, c) => rb.quad(A, B, C, D2, UV, {}, c);
      // slope: top edge at the kerb (d=0, y=Y) down to the road (d=D, y=0.005); orientation chosen so the normal faces up/out
      const s = nx * az - nz * ax > 0 ? -1 : 1;
      const A = P(-w, 0, Y), B = P(w, 0, Y), C = P(w, D, 0.005), E = P(-w, D, 0.005);
      if (s > 0) q(A, E, C, B, conc); else q(A, B, C, E, conc);
      const t0 = 0.45; const A2 = P(-w + 0.15, D * t0, Y * (1 - t0) + 0.006), B2 = P(w - 0.15, D * t0, Y * (1 - t0) + 0.006), C2 = P(w - 0.15, D * 0.97, 0.012), E2 = P(-w + 0.15, D * 0.97, 0.012);
      if (s > 0) q(A2, E2, C2, B2, yel); else q(A2, B2, C2, E2, yel);
      for (const sg of [-1, 1]) { const T0 = P(sg * w, 0, Y), T1 = P(sg * (w + 0.6), 0, 0.005), T2 = P(sg * w, D, 0.005); // flared side wing
        if (sg * s > 0) q(T0, T1, T2, T2, conc); else q(T0, T2, T1, T1, conc); }
    };
    let nR = 0;
    for (const it of city.inters) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = it.x + sx * RH, cz = it.z + sz * RH; // block corner
      if (!city.blockAt(cx + sx * 0.5, cz + sz * 0.5)) continue;
      const zc = cz + sz * 2.6, xc = cx + sx * 2.6;
      if (isRoad(cx - sx * 1, zc)) { ramp(cx, zc, -sx, 0, 0, 1); nR++; } // face along z, crosswalk across the z-road
      if (isRoad(xc, cz - sz * 1)) { ramp(xc, cz, 0, -sz, 1, 0); nR++; }
    }
    if (rb.vc) { const m = new THREE.Mesh(rb.build(), prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 'vcolds')); m.receiveShadow = true; scene.add(m); }
    city.kerbRamps = nR;
  }
  return { poles, signs: nSigns, shelters: shelters.length, signMat, update(night) { signMat.emissiveIntensity = 0.03 + night * 0.12; } };
}

// ---------------- shop sign boards above every awning (dense, unique storefront signage — GTA6_REFERENCE §6)
export function buildShopSigns(scene, city) {
  const names = ['古巴咖啡馆', '海风冲浪店', '珍珠洗衣', '日落药房', '椰林便利店', CYBER ? '霓虹理发' : '海湾理发', /* r6.1 map A: no "neon" even in shop names */ '蓝鲸海鲜', '旧城当铺', '火烈鸟酒吧', '太阳眼镜屋', '比基尼精品', '老街雪茄',
    '24小时便利', '金沙珠宝', '冰淇淋工坊', '彩虹奶昔', '码头渔具', '热带果汁', '幸运彩票', '手机维修', '卷饼小站', '铁人健身', '美甲沙龙', '刺青工作室',
    '海盐面包房', '午夜唱片', '椰子按摩', '潮汐酒店', '白沙公寓', '星光影院', '粉红火烈鸟', '小哈瓦那'];
  const sub = ['CAFE', 'SURF', 'LAUNDRY', 'PHARMACY', 'MARKET', 'BARBER', 'SEAFOOD', 'PAWN', 'BAR', 'OPTICS', 'BOUTIQUE', 'CIGARS', 'OPEN 24H', 'JEWELRY', 'GELATO', 'SMOOTHIE',
    'BAIT & TACKLE', 'JUICE', 'LOTTO', 'REPAIR', 'TACOS', 'GYM', 'NAILS', 'TATTOO', 'BAKERY', 'RECORDS', 'MASSAGE', 'HOTEL', 'SUITES', 'CINEMA', 'LOUNGE', 'CANTINA'];
  const pal = [['#1b2a4a', '#ffd36b'], ['#f7f2e8', '#c2185b'], ['#0e6655', '#ffffff'], ['#ffffff', '#1565c0'], ['#d84315', '#fff3e0'], ['#212121', '#ff4081'], ['#fdd835', '#212121'], ['#4a148c', '#e1bee7'],
    ['#00838f', '#e0f7fa'], ['#f8bbd0', '#880e4f'], ['#3e2723', '#ffcc80'], ['#e8f5e9', '#2e7d32']];
  const c = document.createElement('canvas'); c.width = 2048; c.height = 2048; const g = c.getContext('2d');
  names.forEach((n, k) => {
    const x = (k % 4) * 512, y = Math.floor(k / 4) * 256; const [bg, fg] = pal[k % pal.length];
    g.fillStyle = bg; g.fillRect(x + 4, y + 8, 504, 240);
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 5; g.strokeRect(x + 16, y + 20, 480, 216); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${k % 3 === 0 ? '900' : 'bold'} ${n.length > 5 ? 82 : 100}px "Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif`; g.fillText(n, x + 256, y + 104, 470);
    g.font = `${k % 2 ? 'italic ' : ''}bold 44px Anton, Impact, sans-serif`; g.fillText(sub[k], x + 256, y + 192, 440);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const b = new GeoBucket(); const r = mulberry(5150); let k = 0;
  // a_interior: what sells behind each sign -> shop-kind grid read by the storefront interior shader (map A only).
  // kind: 0 market / pharmacy / phone repair, 1 café / bakery / ice cream, 2 boutique, 3 office / salon / lobby, 4 diner / bar, 5 laundromat
  const KIND = [[1, 0], [2, 0], [5, 0], [0, 1], [0, 0], [3, 0], [4, 0], [2, 0], [4, 1], [2, 0], [2, 0], [2, 0], [0, 0], [2, 0], [1, 0], [1, 0],
    [0, 0], [1, 0], [0, 0], [0, 2], [4, 0], [3, 0], [3, 0], [3, 0], [1, 0], [2, 0], [3, 0], [3, 0], [3, 0], [3, 0], [4, 1], [4, 0]];
  const kreg = [];
  for (const a of city.awnings) {
    const len = a.z1 - a.z0; if (len < 4) continue;
    const sx = Math.sign(a.out) || 1; const xf = a.x0 + a.out + sx * 0.03; // front valance of the awning
    const nShops = len > 16 ? 3 : len > 8 ? 2 : 1;
    for (let j = 0; j < nShops; j++) {
      const cell = Math.floor(r() * 32); const cx = cell % 4, cy = Math.floor(cell / 4);
      const zc = a.z0 + len * (j + 0.5) / nShops; kreg.push([a.x0, a.z0 + len * j / nShops - (j === 0 ? 1 : 0), a.z0 + len * (j + 1) / nShops + (j === nShops - 1 ? 1 : 0), KIND[cell]]); const w = Math.min(len / nShops * 0.8, 4.2), h = Math.min(0.62, w * 0.3);
      const geo = new THREE.PlaneGeometry(w, h); const uv = geo.attributes.uv;
      for (let i = 0; i < 4; i++) uv.setXY(i, (cx + uv.getX(i)) / 4, 1 - (cy + 1 - uv.getY(i)) / 8);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(xf, a.y - 0.2 - h / 2 + 0.05, zc), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx > 0 ? Math.PI / 2 : -Math.PI / 2), new THREE.Vector3(1, 1, 1));
      b.geom(geo, m); k++;
      // projecting blade sign on the wall between shops (double-sided)
      if (j > 0 && r() < 0.7) {
        const c2 = Math.floor(r() * 32); const bx = c2 % 4, by = Math.floor(c2 / 4);
        for (const side of [1, -1]) {
          const bg = new THREE.PlaneGeometry(1.3, 0.62); const bu = bg.attributes.uv;
          for (let i = 0; i < 4; i++) bu.setXY(i, (bx + bu.getX(i)) / 4, 1 - (by + 1 - bu.getY(i)) / 8);
          const zb = a.z0 + len * j / nShops;
          const mb = new THREE.Matrix4().compose(new THREE.Vector3(a.x0 + sx * 0.85, a.y + 1.6, zb + side * 0.01), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? 0 : Math.PI), new THREE.Vector3(1, 1, 1));
          b.geom(bg, mb);
        }
      }
    }
  }
  const mat = prep(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), 'shopsign');
  if (k) { const mesh = new THREE.Mesh(b.build(), mat); mesh.receiveShadow = true; scene.add(mesh); }
  if (!CYBER && kreg.length) { // 1.5 m cells over the signed shop rows; the shader samples the cell under each 2-bay unit's centre
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, za, zb] of kreg) { x0 = Math.min(x0, x - 3); x1 = Math.max(x1, x + 3); z0 = Math.min(z0, za); z1 = Math.max(z1, zb); }
    const ext = Math.max(x1 - x0, z1 - z0, 1); const cell = Math.max(1.5, ext / 1000); const N = Math.ceil(ext / cell) + 2; const d = new Uint8Array(N * N * 4);
    for (const [x, za, zb, kk] of kreg) for (let zz = za; zz <= zb; zz += cell * 0.5) for (let xx = x - 3; xx <= x + 3; xx += cell * 0.5) {
      const i = Math.floor((xx - x0) / cell), j = Math.floor((zz - z0) / cell); if (i < 0 || j < 0 || i >= N || j >= N) continue; const o = (j * N + i) * 4; d[o] = kk[0] + 1; d[o + 1] = kk[1] + 1; d[o + 3] = 255; }
    const tex = new THREE.DataTexture(d, N, N); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    SHOPK.tex.value = tex; SHOPK.box.value.set(x0, z0, 1 / (cell * N), 0);
    city.shopKinds = kreg; // (debug / shot plans: [x0, z0, z1, [kind, variant]])
  }
  // night light spill from shop windows + coloured neon onto the sidewalk (additive ground decals)
  const pg = new GeoBucket();
  for (const a of city.awnings) {
    const sx = Math.sign(a.out) || 1; const len = a.z1 - a.z0;
    const geo = new THREE.PlaneGeometry(5.5, len + 3); geo.rotateX(-Math.PI / 2);
    // fix_pt2 (?oldpool = old): map B storefronts also carry real point lights over the walk, so the stacked additive awning spill
    // (neighbouring pools overlap 3 m) burnt the spawn sidewalk to white at night (PLAYTEST_1H V5); B gets 45 % of it
    const kP = CYBER && !OLD_POOL ? 0.45 : 1; pg.geom(geo, new THREE.Matrix4().makeTranslation(a.x0 + sx * 2.6, 0.17, (a.z0 + a.z1) / 2), {}, [1.0 * kP, 0.72 * kP, 0.45 * kP]);
  }
  for (const sg of city.signs) {
    if (!sg.vertical) continue; const col = new THREE.Color(sg.color);
    const sx = Math.sin(sg.ry), sz = Math.cos(sg.ry);
    const geo = new THREE.PlaneGeometry(7, 7); geo.rotateX(-Math.PI / 2);
    pg.geom(geo, new THREE.Matrix4().makeTranslation(sg.x + sx * 3, 0.18, sg.z + sz * 3), {}, [col.r * 1.2, col.g * 1.2, col.b * 1.2]);
  }
  const poolMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uNight: U.uNight },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying vec2 vUv; void main(){ vUv = uv; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uNight; varying vec3 vC; varying vec2 vUv; void main(){ vec2 d = abs(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.35, 1.0, d.x)) * (1.0 - smoothstep(0.6, 1.0, d.y)); gl_FragColor = vec4(vC * a * a * uNight * 0.32, 1.0); }' });
  if (pg.vc) { const pm = new THREE.Mesh(pg.build(), poolMat); pm.renderOrder = 2; scene.add(pm); }
  return { count: k, update(night) { mat.emissiveIntensity = 0.02 + night * 0.55; } };
}

// thin sagging cable between two points: two crossed ribbons per sub-segment (reads at any angle)
function wire(b, a, c, sag, wdt) {
  const N = 10; const P = [];
  for (let i = 0; i <= N; i++) { const t = i / N; const p = a.clone().lerp(c, t); p.y -= sag * 4 * t * (1 - t); P.push(p); }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const p0 = P[i], p1 = P[i + 1]; const d = p1.clone().sub(p0).normalize();
    const s1 = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(wdt);
    const s2 = new THREE.Vector3().crossVectors(d, s1).normalize().multiplyScalar(wdt);
    for (const s of [s1, s2]) b.quad(p0.clone().sub(s), p1.clone().sub(s), p1.clone().add(s), p0.clone().add(s), [0, 0, 1, 0, 1, 1, 0, 1]);
  }
}
