// r6.2 modeled car interiors (procedural, original): front bucket seats + rear bench, dashboard with lit gauge cluster and
// centre screen, steering wheel on its column (turns with the steering input), centre console + shifter, door cards with
// armrests and pulls, headliner, rear-view mirror, carpet, parcel shelf. Built from a cabin layout in the car's body space
// (z forward, y up, +x = left = driver side). Also exports the back-face "liner" material that closes the inside of the
// body shell (pillars / roof / doors seen through the glass are no longer see-through).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { prep } from './mats.js';

let IM = null;
export function interiorMats() {
  if (IM) return IM;
  const std = (o, k) => prep(new THREE.MeshStandardMaterial(o), k);
  IM = {
    cabin: std({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.02 }, 'icabin'),
    dash: std({ color: 0x18181a, roughness: 0.72, metalness: 0.05 }, 'idash'),
    trim: std({ color: 0x2c2c2f, roughness: 0.8 }, 'itrim'),
    head: std({ color: 0x8e8a83, roughness: 0.95 }, 'ihead'),
    carpet: std({ color: 0x1f1f20, roughness: 1 }, 'icarpet'),
    alu: std({ color: 0x9a9da2, roughness: 0.35, metalness: 0.9 }, 'ialu'),
    wheel: std({ color: 0x141415, roughness: 0.6 }, 'iwheel'),
    gauge: std({ color: 0xffffff, roughness: 0.4, map: gaugeTex(), emissiveMap: gaugeTex(), emissive: 0xffffff, emissiveIntensity: 0.25 }, 'igauge'),
    screen: std({ color: 0x0a0d12, roughness: 0.15, metalness: 0.2, emissive: 0x2a5d8a, emissiveIntensity: 0.25 }, 'iscreen'),
    mirror: std({ color: 0xc8ccd0, roughness: 0.05, metalness: 1 }, 'imirror'),
    // inside of the body shell: same geometry drawn with BackSide (no extra memory, never z-fights the outside)
    liner: std({ color: 0x2a2a2c, roughness: 0.9, side: THREE.BackSide }, 'iliner'),
    hidden: new THREE.MeshBasicMaterial({ visible: false }),
  };
  return IM;
}
let GT = null;
function gaugeTex() {
  if (GT) return GT;
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#050506'; g.fillRect(0, 0, 256, 96);
  const dial = (cx, cy, r, n, red) => {
    g.strokeStyle = '#3a3d42'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i <= n; i++) { const a = Math.PI * 0.75 + i / n * Math.PI * 1.5; const r0 = i % 2 ? r * 0.82 : r * 0.72;
      g.strokeStyle = red && i > n - 2 ? '#e03020' : '#e8eef4'; g.lineWidth = i % 2 ? 1.5 : 2.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93); g.stroke(); }
    g.strokeStyle = '#ff6a20'; g.lineWidth = 3; const a = Math.PI * 0.95; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); g.stroke();
    g.fillStyle = '#25282c'; g.beginPath(); g.arc(cx, cy, r * 0.12, 0, Math.PI * 2); g.fill();
  };
  dial(64, 50, 40, 12, false); dial(192, 50, 40, 8, true);
  g.fillStyle = '#7fd0ff'; g.fillRect(116, 30, 24, 4); g.fillRect(116, 42, 18, 4); g.fillStyle = '#e8eef4'; g.font = 'bold 15px sans-serif'; g.fillText('D', 122, 70);
  GT = new THREE.CanvasTexture(c); GT.colorSpace = THREE.SRGBColorSpace; return GT;
}
export function setInteriorNight(n) { const M = interiorMats(); M.gauge.emissiveIntensity = 0.25 + n * 1.6; M.screen.emissiveIntensity = 0.25 + n * 1.2; }

const GC = new Map();
const rbox = (w, h, d, r = 0.03) => { const k = [w, h, d, r].map((x) => x.toFixed(3)).join(','); if (!GC.has(k)) GC.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))); return GC.get(k); };
const box = (w, h, d) => { const k = 'b' + [w, h, d].map((x) => x.toFixed(3)).join(','); if (!GC.has(k)) GC.set(k, new THREE.BoxGeometry(w, h, d)); return GC.get(k); };
// side profile [[z, y], ...] extruded across x (width w, centred)
function sideExtrude(profile, w) {
  const k = 'x' + JSON.stringify(profile) + w.toFixed(3); if (GC.has(k)) return GC.get(k);
  const sh = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals();
  GC.set(k, g); return g;
}

/* cabin layout C (body space):
   floorY, beltY, headY (headliner underside), zCowl / yCowl (windscreen base), zWsTop / yWsTop (windscreen top), zDash (dash face),
   hwDash, hwFront, hwRear (inner half widths), front: {x, y, z} driver H-point (passenger mirrors x), rear: {y, z} | null,
   zBack (rear wall / rear window base), yBack, shelf (bool), sport (bool: low wraparound dash, no rear row) */
// Built once per cabin layout and baked into one merged geometry per material role (≈10 draw calls per car + the wheel).
const ROLE = { seat: 'seat', dash: 'dash', trim: 'trim', head: 'head', carpet: 'carpet', alu: 'alu', wheel: 'wheel', gauge: 'gauge', screen: 'screen', mirror: 'mirror' };
function buildRaw(C) {
  const M = ROLE; const seatM = 'seat';
  const grp = new THREE.Group(); grp.name = 'interior';
  const mk = (g, m) => { const o = new THREE.Mesh(g); o.userData.role = m; return o; };
  const add = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = mk(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); grp.add(o); return o; };
  const F = C.front; const fy = C.floorY;
  // ---- carpet floor + firewall / footwell
  const zf0 = (C.rear ? C.rear.z : F.z) - 0.55, zf1 = C.zCowl;
  add(box(C.hwRear * 2, 0.04, zf1 - zf0), M.carpet, 0, fy, (zf0 + zf1) / 2);
  // ---- dashboard: one extruded profile (cowl -> top -> face -> knee bolster -> footwell -> firewall)
  const dTop = C.beltY + (C.sport ? 0.0 : 0.04); const zD = C.zDash;
  // front edge stays behind / below the windscreen base so the dash never pokes through the cowl or A-pillar corners
  const zc = C.zCowl - 0.07, yc = Math.min(C.yCowl - 0.09, dTop + 0.12);
  const prof = [[zc, yc], [zD + 0.12, dTop + 0.02], [zD, dTop - 0.02], [zD - 0.02, dTop - 0.2], [zD + 0.06, fy + 0.3], [Math.min(zD + 0.3, zc - 0.02), fy + 0.12], [zc, fy + 0.02]];
  add(sideExtrude(prof, C.hwDash * 2), M.dash, 0, 0, 0);
  // gauge binnacle (hood + lit cluster) in front of the driver
  const gx = F.x, gy = dTop - 0.07, gz = zD + 0.07;
  add(rbox(0.4, 0.06, 0.16, 0.025), M.dash, gx, dTop + 0.015, gz - 0.02);
  add(new THREE.PlaneGeometry(0.34, 0.12), M.gauge, gx, gy, gz - 0.035, 0.15, Math.PI, 0);
  // centre stack: screen, vents, climate panel
  add(rbox(0.3, 0.32, 0.08, 0.02), M.dash, 0, dTop - 0.2, zD - 0.0, 0.25);
  add(new THREE.PlaneGeometry(0.24, 0.15), M.screen, 0, dTop - 0.1, zD - 0.055, 0.25, Math.PI, 0);
  for (const vx of [-0.07, 0.07]) add(box(0.1, 0.035, 0.02), M.trim, vx, dTop - 0.24, zD - 0.06, 0.25);
  for (const s of [-1, 1]) add(box(0.09, 0.05, 0.03), M.trim, s * (C.hwDash - 0.1), dTop - 0.07, zD - 0.01);
  add(box(0.3, 0.008, 0.006), M.trim, -F.x, dTop - 0.16, zD - 0.022); // glovebox shut line
  add(box(C.hwDash * 1.6, 0.012, 0.01), M.alu, 0, dTop - 0.03, zD - 0.02); // trim strip
  // ---- steering wheel: column into the dash, pivot raked toward the dash top; 'spin' turns with steering
  // wheel within arm's reach of the driver (≈0.5 m ahead of the H-point), column long enough to reach back into the dash
  const wz = Math.min(zD - 0.13, F.z + 0.5), wy = C.wheelY ?? (F.y + 0.36); const colL = Math.max(0.28, (zD + 0.08 - wz) / Math.cos(0.38));
  const piv = new THREE.Group(); piv.position.set(F.x, wy, wz); piv.rotation.x = 0.38; grp.add(piv);
  piv.add(mk(new THREE.CylinderGeometry(0.035, 0.045, colL, 10).rotateX(Math.PI / 2).translate(0, 0, colL / 2 + 0.01), M.wheel));
  const spin = new THREE.Group(); spin.name = 'steer'; spin.userData.spin = true; piv.add(spin);
  const R = 0.18;
  spin.add(mk(new THREE.TorusGeometry(R, 0.019, 8, 28), M.wheel));
  spin.add(mk(new THREE.CylinderGeometry(0.065, 0.07, 0.05, 16).rotateX(Math.PI / 2), M.wheel));
  spin.add(mk(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12).rotateX(Math.PI / 2).translate(0, 0, -0.027), M.alu));
  for (const s of [-1, 1]) spin.add(mk(box(R * 0.82, 0.032, 0.016).clone().translate(s * R * 0.5, -0.012, 0), M.wheel)); // 9 / 3 o'clock spokes
  spin.add(mk(box(0.032, R * 0.82, 0.016).clone().translate(0, -R * 0.5, 0), M.wheel)); // 6 o'clock spoke
  // grip points (spin space): ~9:30 and 2:30
  const grips = [new THREE.Vector3(R * 0.95, R * 0.3, -0.01), new THREE.Vector3(-R * 0.95, R * 0.3, -0.01)];
  // ---- seats
  const seat = (x, y, z, w) => {
    add(rbox(w, 0.13, 0.5, 0.05), seatM, x, y - 0.07, z + 0.2, -0.07); // cushion
    const bk = new THREE.Group(); bk.position.set(x, y - 0.02, z - 0.08); bk.rotation.x = -0.32; grp.add(bk);
    const back = mk(rbox(w, 0.62, 0.12, 0.05), seatM); back.position.y = 0.31; bk.add(back);
    for (const s of [-1, 1]) { const b = mk(rbox(0.07, 0.5, 0.16, 0.03), seatM); b.position.set(s * (w / 2 - 0.03), 0.3, 0.02); bk.add(b); }
    const hr = mk(rbox(0.26, 0.17, 0.1, 0.04), seatM); hr.position.set(0, 0.72, -0.01); bk.add(hr);
    for (const s of [-0.07, 0.07]) { const p = mk(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), M.alu); p.position.set(s, 0.63, -0.01); bk.add(p); }
    { const h = Math.max(0.04, y - 0.13 - fy); add(box(w * 0.8, h, 0.04), M.trim, x, fy + h / 2, z + 0.42); } // seat base front valance
  };
  seat(F.x, F.y, F.z, 0.5); seat(-F.x, F.y, F.z, 0.5);
  if (C.rear) { // rear bench (one cushion + one backrest, three headrests)
    const w = C.hwRear * 2 - 0.12; const y = C.rear.y, z = C.rear.z;
    const bh = C.rear.backH || 0.6;
    add(rbox(w, 0.14, 0.5, 0.05), seatM, 0, y - 0.07, z + 0.2, -0.06);
    const bk = new THREE.Group(); bk.position.set(0, y - 0.02, z - 0.1); bk.rotation.x = -0.3; grp.add(bk);
    const back = mk(rbox(w, bh, 0.13, 0.05), seatM); back.position.y = bh / 2; bk.add(back);
    if (bh > 0.55) for (const s of [-1, 0, 1]) { const hr = mk(rbox(0.24, 0.12, 0.09, 0.035), seatM); hr.position.set(s * w * 0.34, bh + 0.02, 0); bk.add(hr); }
    add(box(w, Math.max(0.05, y - 0.07 - fy), 0.06), M.trim, 0, (y - 0.07 + fy) / 2, z + 0.45);
  }
  // ---- centre console with shifter, armrest, cupholders
  { const z0 = F.z - 0.12, z1 = zD - 0.05; const h = F.y + 0.1 - fy;
    add(rbox(0.22, h, z1 - z0, 0.03), M.trim, 0, fy + h / 2, (z0 + z1) / 2);
    add(rbox(0.2, 0.06, 0.3, 0.025), seatM, 0, F.y + 0.13, F.z + 0.02);
    add(new THREE.CylinderGeometry(0.012, 0.014, 0.12, 8), M.alu, 0, F.y + 0.15, F.z + 0.42);
    add(new THREE.SphereGeometry(0.03, 10, 8), M.wheel, 0, F.y + 0.22, F.z + 0.42);
    for (const s of [-0.045, 0.045]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12), M.dash, s, F.y + 0.105, F.z + 0.28); }
  // ---- door cards (both sides): lower panel, armrest, pull handle, upper cap
  const zd0 = C.rear ? C.rear.z - 0.3 : F.z - 0.35, zd1 = zD + 0.02;
  for (const s of [-1, 1]) {
    const x = s * (C.hwFront - 0.015); const len = zd1 - zd0; const zc = (zd0 + zd1) / 2; const h = C.beltY - fy - 0.02;
    add(box(0.025, h, len), M.trim, x, fy + h / 2, zc);
    add(box(0.035, 0.035, len * 0.98), seatM, x - s * 0.005, C.beltY - 0.06, zc);
    add(rbox(0.09, 0.045, 0.32, 0.015), M.trim, x - s * 0.05, F.y + 0.16, F.z + 0.12);
    add(box(0.02, 0.025, 0.08), M.alu, x - s * 0.02, C.beltY - 0.12, F.z + 0.42);
    if (C.rear) add(rbox(0.07, 0.04, 0.26, 0.015), M.trim, x - s * 0.04, C.rear.y + 0.16, C.rear.z + 0.1);
  }
  // ---- headliner + rear-view mirror + sun visors
  { const z0 = C.zHead0, z1 = C.zHead1; if (!C.open) add(box(C.hwHead * 2, 0.02, z1 - z0), M.head, 0, C.headY, (z0 + z1) / 2); // open-top cars: no headliner
    const my = C.yWsTop - 0.1, mz = C.zWsTop + 0.02;
    add(box(0.02, 0.07, 0.02), M.trim, 0, my + 0.05, mz + 0.04);
    add(rbox(0.25, 0.065, 0.03, 0.012), M.trim, 0, my, mz);
    add(new THREE.PlaneGeometry(0.22, 0.05), M.mirror, 0, my, mz - 0.017, 0, Math.PI, 0);
    if (!C.open) for (const s of [-1, 1]) add(box(0.28, 0.01, 0.095), M.head, s * 0.33, C.headY - 0.008, C.zWsTop - 0.07, 0.02); } // visors folded flush against headliner
  // ---- parcel shelf / rear wall
  if (C.shelf && C.rear) { const z0 = C.zBack, z1 = C.rear.z - 0.25; if (z1 > z0) add(box(C.hwRear * 2, 0.025, z1 - z0), M.trim, 0, C.yBack, (z0 + z1) / 2); }
  if (!C.rear && C.backWall) add(box(C.hwRear * 2, C.headY - fy, 0.03), M.trim, 0, (C.headY + fy) / 2, C.zBack);
  if (C.cargo) add(box(C.hwRear * 2, 0.03, C.cargo[1] - C.cargo[0]), M.carpet, 0, C.cargo[2], (C.cargo[0] + C.cargo[1]) / 2);
  return { grp, spin, grips, F, zD };
}
const CACHE = new Map();
// role -> [linear colour, roughness-ish class]; everything except the lit gauge / screen / mirror / wheel rim is baked into ONE
// vertex-coloured mesh (1 draw call; it doubles as the mid-distance LOD of the cabin)
const SEAT_COL = [0x1c1c1e, 0x5e4330, 0x47484c, 0xa89c86, 0x3a2622];
const ROLE_COL = { dash: 0x18181a, trim: 0x2c2c2f, head: 0x8e8a83, carpet: 0x1f1f20, alu: 0x8a8d92, wheel: 0x141415 };
const SEP = new Set(['gauge', 'screen', 'mirror']);
function bake(C, seatIdx) {
  const k = JSON.stringify(C) + '|' + seatIdx; if (CACHE.has(k)) return CACHE.get(k);
  const { grp, spin, grips, F, zD } = buildRaw(C); grp.updateMatrixWorld(true);
  const main = [], sep = {}, spinList = []; const col = new THREE.Color();
  const norm = (g, role) => { g = g.index ? g.toNonIndexed() : g.clone(); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    const n = g.attributes.position.count; if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    col.setHex(role === 'seat' ? SEAT_COL[seatIdx % SEAT_COL.length] : ROLE_COL[role] ?? 0x202022); const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; };
  grp.traverse((o) => { if (!o.isMesh) return; let p = o.parent, inSpin = false; while (p) { if (p === spin) inSpin = true; p = p.parent; }
    const r = o.userData.role; const g = norm(o.geometry, r);
    if (inSpin) { g.applyMatrix4(o.matrix); spinList.push(g); }
    else { g.applyMatrix4(o.matrixWorld); if (SEP.has(r)) (sep[r] ||= []).push(g); else main.push(g); } });
  const parts = {}; for (const r in sep) parts[r] = mergeGeometries(sep[r]);
  spin.updateMatrixWorld(true);
  const out = { main: mergeGeometries(main), parts, spinGeo: mergeGeometries(spinList), spinPos: spin.getWorldPosition(new THREE.Vector3()), spinQuat: spin.getWorldQuaternion(new THREE.Quaternion()), grips, F, zD };
  CACHE.set(k, out); return out;
}
// one cabin instance. group.userData.near = the detail meshes (lit cluster / screen / mirror / wheel) hidden at mid distance
export function buildInterior(C, seatIdx = 0) {
  const B = bake(C, seatIdx); const M = interiorMats(); const grp = new THREE.Group(); grp.name = 'interior';
  const mm = new THREE.Mesh(B.main, M.cabin); mm.castShadow = true; mm.receiveShadow = true; grp.add(mm);
  const near = new THREE.Group(); grp.add(near);
  for (const r in B.parts) { const m = new THREE.Mesh(B.parts[r], M[r]); m.receiveShadow = true; near.add(m); }
  const piv = new THREE.Group(); piv.position.copy(B.spinPos); piv.quaternion.copy(B.spinQuat); near.add(piv);
  const steer = new THREE.Group(); piv.add(steer); const wm = new THREE.Mesh(B.spinGeo, M.cabin); wm.receiveShadow = true; steer.add(wm);
  const F = B.F;
  return { group: grp, near, steer, grips: B.grips, seats: { driver: new THREE.Vector3(F.x, F.y, F.z), passenger: new THREE.Vector3(-F.x, F.y, F.z) }, pedalZ: B.zD + 0.32, floorY: C.floorY, headY: C.headY, yCowl: C.yCowl };
}
