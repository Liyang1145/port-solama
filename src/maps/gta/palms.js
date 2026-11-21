// r6.5 a_palms — map A「索拉纳港」palms rebuilt (original, procedural; map 霓港 keeps the v3.5 palms in veg.js untouched)
//   * 7 height / species variants: coconut (standard, tall slender lean, short young), royal (standard, tall avenue),
//     sabal (short booted, tall smooth trunk with a dead-leaf skirt)
//   * trunks: gentle S-bend + wobble, root buttresses at the base, species bark with stronger leaf-scar rings (albedo + normal)
//   * crowns: vertex-coloured knob / green royal crownshaft / sabal boot knot, 2-4 coconut clusters (green, yellow, brown)
//   * a hanging layer of dead fronds under the live crown (atlas: live half | dead half of the same frond texture)
//   * street palms stand in a tree pit: cast-iron grate (downtown) or a mulch bed with a low curb
//   * three LODs (near < 55 m, mid < 210 m, far) + pits only < 150 m; empty instanced meshes are hidden (no draw call)
import * as THREE from 'three';
import { prep } from '../../mats.js';
import { mulberry } from '../../util.js';
import { canvasTex, normalFromHeight, GB, gbBuild, addFrond, addFan, foliagePatch, pinnateTex, fanTex } from '../../veg.js';

const TAU = Math.PI * 2;
export const VARIANTS_A = [
  { k: 'coco', seed: 11, H: 11, curve: 1.5, nF: 22, dead: 5, nuts: 3, bark: 'coco', slim: 1 },
  { k: 'coco', seed: 23, H: 14.5, curve: 2.6, nF: 20, dead: 4, nuts: 2, bark: 'coco', slim: 0.86 },
  { k: 'coco', seed: 29, H: 7.5, curve: 0.8, nF: 24, dead: 3, nuts: 4, bark: 'coco', slim: 1.08 },
  { k: 'royal', seed: 37, H: 12, curve: 0.08, nF: 15, dead: 1, nuts: 0, bark: 'royal', shaft: 2.4 },
  { k: 'royal', seed: 41, H: 16, curve: 0.12, nF: 14, dead: 1, nuts: 0, bark: 'royal', shaft: 2.9 },
  { k: 'sabal', seed: 53, H: 7.5, curve: 0.18, nF: 30, dead: 5, nuts: 0, bark: 'sabal' },
  { k: 'sabal', seed: 59, H: 11.5, curve: 0.3, nF: 26, dead: 9, nuts: 0, bark: 'sabalS' },
];
const FR = { coco: { L: [4.0, 5.2], up: [0.55, 1.0], droop: [1.2, 1.9], wingDrop: 0.7, maxW: 0.95, plume: 0 },
  royal: { L: [3.6, 4.4], up: [0.9, 1.5], droop: [1.0, 1.5], wingDrop: 0.25, maxW: 0.85, plume: 0.35 },
  sabal: { L: [1.0, 1.6], up: [-0.3, 1.2] } };
// pick a variant for a palm of species group sp (0 coco, 1 royal, 2 sabal) and wanted height h
export function pickVariantA(sp, h, hsh) {
  if (sp === 0) return h < 9 ? (hsh < 0.75 ? 2 : 0) : h > 12 ? (hsh < 0.7 ? 1 : 0) : (hsh < 0.15 ? 1 : 0);
  if (sp === 1) return h > 10.5 || hsh < 0.25 ? 4 : 3;
  return h > 9.5 ? (hsh < 0.8 ? 6 : 5) : (hsh < 0.2 ? 6 : 5);
}

// ---------------------------------------------------------------- textures ----
function barkTexA(kind) {
  const r = mulberry(kind === 'coco' ? 103 : kind === 'royal' ? 105 : kind === 'sabal' ? 109 : 113); const W = 128, Hh = 512;
  const hc = document.createElement('canvas'); hc.width = W; hc.height = Hh; const hg = hc.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, Hh);
  const base = kind === 'coco' ? [150, 134, 112] : kind === 'royal' ? [184, 180, 168] : kind === 'sabal' ? [112, 96, 76] : [150, 142, 128];
  const map = canvasTex(W, Hh, (g) => {
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 6000; i++) { const v = (r() - 0.5) * 46; g.fillStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v - 4},0.2)`; g.fillRect(r() * W, r() * Hh, 1 + r() * 3, 1 + r() * 8); }
    if (kind === 'sabal') { // criss-cross leaf-base boots (split petiole stubs)
      for (let y = -20; y < Hh + 20; y += 22) for (let x = -20; x < W + 20; x += 32) { const ox = x + ((y / 22) % 2) * 16;
        for (const [gg, col, lw] of [[hg, 'rgba(255,255,255,0.9)', 7], [g, `rgba(${base[0] + 28},${base[1] + 20},${base[2] + 10},0.92)`, 6]]) {
          gg.strokeStyle = col; gg.lineWidth = lw; gg.beginPath(); gg.moveTo(ox - 14, y + 18); gg.lineTo(ox, y - 4); gg.lineTo(ox + 14, y + 18); gg.stroke(); }
        g.fillStyle = 'rgba(38,28,20,0.8)'; g.beginPath(); g.ellipse(ox, y + 12, 6, 7, 0, 0, TAU); g.fill();
        hg.fillStyle = 'rgba(0,0,0,0.9)'; hg.beginPath(); hg.ellipse(ox, y + 12, 6, 7, 0, 0, TAU); hg.fill(); }
      return;
    }
    // leaf-scar rings: wavy, slightly tilted, uneven spacing; a raised lip above each scar (height) + pale bleached lip (albedo)
    const step = kind === 'coco' ? 13 : kind === 'royal' ? 9 : 20;
    for (let y = 2; y < Hh - 4; y += step * (0.7 + r() * 0.6)) {
      const th = kind === 'coco' ? 2.5 + r() * 2.5 : kind === 'royal' ? 1 + r() * 0.8 : 1.5 + r(); const tilt = (r() - 0.5) * 6, ph = r() * TAU, amp = kind === 'coco' ? 1.5 + r() * 2 : 0.6;
      const row = (yy, f) => { for (let x = 0; x <= W; x += 4) f(x, yy + tilt * (x / W - 0.5) + Math.sin(x / W * TAU * 2 + ph) * amp); };
      row(y, (x, yy) => { g.fillStyle = `rgba(48,40,32,${kind === 'royal' ? 0.28 : 0.6})`; g.fillRect(x, yy, 4, th); hg.fillStyle = 'rgba(0,0,0,0.9)'; hg.fillRect(x, yy, 4, th); });
      row(y + th, (x, yy) => { g.fillStyle = 'rgba(226,216,198,0.3)'; g.fillRect(x, yy, 4, 2); hg.fillStyle = 'rgba(255,255,255,0.65)'; hg.fillRect(x, yy, 4, 3); });
    }
    for (let i = 0; i < 320; i++) { const x = r() * W, y = r() * Hh; hg.fillStyle = 'rgba(25,25,25,0.4)'; hg.fillRect(x, y, 1, 3 + r() * 12); g.fillStyle = 'rgba(60,52,44,0.25)'; g.fillRect(x, y, 1, 3 + r() * 12); }
    if (kind !== 'royal') for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${90 + r() * 30},${96 + r() * 30},${70},0.18)`; g.beginPath(); g.ellipse(r() * W, r() * Hh, 6 + r() * 14, 10 + r() * 30, 0, 0, TAU); g.fill(); } // lichen / weathering blotches
  });
  return { map, normalMap: normalFromHeight(hc, kind === 'royal' ? 1.6 : kind === 'sabalS' ? 2.2 : 3.6) };
}
// dead frond (pinnate): straw / grey-brown leaflets, folded and partly shredded
function deadPinnateCanvas() {
  const r = mulberry(43); const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d'); const W = 256, H = 1024;
  for (let i = 0; i < 70; i++) { if (r() < 0.18) continue; const v = (i + r() * 0.4) / 70; const y0 = H * (1 - v); const len = W * (0.55 + r() * 0.4);
    const rise = 20 + r() * 50; const wid = 3 + r() * 2.5; const cc = r() < 0.3 ? [120 + r() * 30, 112 + r() * 20, 96] : [150 + r() * 40, 110 + r() * 30, 62 + r() * 20];
    g.fillStyle = `rgb(${cc.map((x) => x | 0).join(',')})`; g.beginPath(); g.moveTo(2, y0 - wid * 0.4); g.quadraticCurveTo(len * 0.45, y0 - rise * 0.5 - wid, len, y0 - rise);
    g.quadraticCurveTo(len * 0.5, y0 - rise * 0.45 + wid * 0.5, 2, y0 + wid * 0.5); g.closePath(); g.fill(); }
  g.fillStyle = '#9a8460'; g.fillRect(0, 0, 5, H); return c;
}
function deadFanCanvas() {
  const r = mulberry(19); const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'); const cx = 256, cy = 506, R = 498;
  for (let i = 0; i < 40; i++) { const a0 = Math.PI * (0.08 + 0.84 * i / 40), a1 = Math.PI * (0.08 + 0.84 * (i + 0.7) / 40); const rr = R * (0.6 + r() * 0.4);
    const cc = [128 + r() * 40, 98 + r() * 26, 58 + r() * 18]; g.fillStyle = `rgb(${cc.map((x) => x | 0).join(',')})`; g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * rr * 0.5, cy - Math.sin(a0) * rr * 0.5); g.lineTo(cx + Math.cos(a0) * rr, cy - Math.sin(a0) * rr + 20);
    g.lineTo(cx + Math.cos(a1) * rr, cy - Math.sin(a1) * rr + 26); g.lineTo(cx + Math.cos(a1) * rr * 0.5, cy - Math.sin(a1) * rr * 0.5); g.closePath(); g.fill(); }
  return c;
}
// live | dead atlas (left half live, right half dead)
function atlas(liveTex, deadCanvas, w, h) {
  const lc = liveTex.userData.canvas; const t = canvasTex(w * 2, h, (g) => { g.clearRect(0, 0, w * 2, h); g.drawImage(lc, 0, 0, w, h); g.drawImage(deadCanvas, w, 0, w, h); });
  t.wrapS = THREE.ClampToEdgeWrapping; liveTex.dispose(); return t;
}
// a_palms3: shared patch for every 'flWood' material (hammock wood, crossover boardwalks, tree pits) -> still one program.
// foliagePatch(s, 0) already zeroes leaf transmission; its sky-fill emissive is blue-green (0.05/0.065/0.075), which turned weathered
// wood and the pit grates green on the shadowed side when backlit -> neutral-warm fill, slightly weaker.
export const woodPatch = (s) => { foliagePatch(s, 0.0);
  s.fragmentShader = s.fragmentShader.replace('diffuseColor.rgb * vec3(0.05, 0.065, 0.075)', 'diffuseColor.rgb * vec3(0.052, 0.047, 0.042)'); };
// tree-pit atlas: [0,0.5]x[0,1] cast-iron grate, [0.5,1]x[0.5,1] mulch, [0.5,1]x[0,0.5] concrete curb
function pitTex() {
  const r = mulberry(77);
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#17130f'; g.fillRect(0, 0, 256, 256); // a_palms3: dark river pebbles showing through the grate (was brown mulch, read like the sidewalk)
    for (let i = 0; i < 1400; i++) { const v = r() * 34; g.fillStyle = `rgb(${38 + v},${36 + v},${34 + v})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 1.5 + r() * 2.5, 1 + r() * 1.8, r() * TAU, 0, TAU); g.fill(); }
    g.strokeStyle = '#1f2123'; g.lineCap = 'butt'; // concentric slotted rings (cast iron)
    for (let k = 0; k < 6; k++) { const rad = 30 + k * 17; g.lineWidth = 8; const n = 10 + k * 5;
      for (let s = 0; s < n; s++) { const a0 = s / n * TAU + 0.04, a1 = (s + 1) / n * TAU - 0.04; g.beginPath(); g.arc(128, 128, rad, a0, a1); g.stroke(); } }
    g.fillStyle = '#1f2123'; for (let s = 0; s < 8; s++) { g.save(); g.translate(128, 128); g.rotate(s / 8 * TAU); g.fillRect(24, -4, 104, 8); g.restore(); } // spokes
    g.fillRect(0, 0, 256, 12); g.fillRect(0, 244, 256, 12); g.fillRect(0, 0, 12, 256); g.fillRect(244, 0, 12, 256); // frame
    for (let x = 0; x < 256; x += 64) for (let y = 0; y < 256; y += 64) { if (Math.hypot(x + 32 - 128, y + 32 - 128) < 120) continue; g.fillRect(x + 6, y + 6, 52, 52); g.fillStyle = '#121010'; for (let q = 0; q < 4; q++) g.fillRect(x + 12 + q * 12, y + 12, 6, 40); g.fillStyle = '#1f2123'; }
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${96 + r() * 40},${56 + r() * 24},${34 + r() * 14},0.18)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); } // rust bloom
    g.fillStyle = '#241a12'; g.fillRect(256, 0, 256, 128); // a_palms3: dark (dyed) hardwood mulch bed, was light #4a3624
    for (let i = 0; i < 2600; i++) { const v = r(); g.fillStyle = v < 0.55 ? `rgb(${50 + r() * 30},${33 + r() * 18},${22 + r() * 10})` : v < 0.88 ? `rgb(${30 + r() * 14},${22 + r() * 10},${16})` : `rgb(${96 + r() * 30},${70 + r() * 20},${46})`;
      g.save(); g.translate(256 + r() * 256, r() * 128); g.rotate(r() * TAU); g.fillRect(-3, -1, 4 + r() * 6, 1.5 + r() * 2); g.restore(); }
    { const pb = (x0, y0, w, h, n) => { for (let i = 0; i < n; i++) { const v = r() * 60; g.fillStyle = `rgb(${70 + v},${66 + v},${60 + v})`; g.beginPath(); g.ellipse(x0 + r() * w, y0 + r() * h, 2 + r() * 3, 1.5 + r() * 2, r() * TAU, 0, TAU); g.fill(); } };
      pb(256, 0, 256, 16, 260); pb(256, 112, 256, 16, 260); pb(256, 0, 16, 128, 130); pb(496, 0, 16, 128, 130); } // river-pebble border inside the curb
    g.fillStyle = '#4e4c49'; g.fillRect(256, 128, 256, 128); // a_palms3: charcoal granite curb (was pale concrete = same as the sidewalk)
    for (let i = 0; i < 2600; i++) { const v = (r() - 0.5) * 50; g.fillStyle = `rgba(${84 + v},${82 + v},${78 + v},0.6)`; g.fillRect(256 + r() * 256, 128 + r() * 128, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${200 + r() * 40},${196 + r() * 40},${190 + r() * 40},0.5)`; g.fillRect(256 + r() * 256, 128 + r() * 128, 1, 1); } // feldspar glints
  });
}

// ---------------------------------------------------------------- geometry ----
function mergeColored(parts) { // [[geometry, [r,g,b], sway]]
  const p = [], n = [], uv = [], c = [], s = [], idx = []; let off = 0;
  for (const [g, col, sw] of parts) { const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0); c.push(...col); s.push(sw); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(off + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(off + i); off += P.count; g.dispose(); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); o.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); o.setAttribute('aSway', new THREE.Float32BufferAttribute(s, 1)); o.setIndex(idx); return o;
}
// lvl 0 near, 1 mid, 2 far
export function palmGeometryA(v, lvl) {
  const r = mulberry(v.seed * 7 + 1); const H = v.H; const k = v.k;
  const N = [22, 9, 5][lvl], R = [14, 8, 5][lvl];
  const ph1 = r() * TAU, ph2 = r() * TAU; const wob = k === 'coco' ? 0.18 : 0.07;
  const C = (t) => new THREE.Vector3(Math.sin(t * Math.PI * 0.5) * v.curve * (0.6 + t) + wob * Math.sin(t * 5.5 + ph1) * t, t * H, wob * 0.8 * Math.sin(t * 4.1 + ph2) * t);
  // ring heights: extra rings at the base for the root buttresses (near only)
  const ts = []; if (lvl === 0) ts.push(0, 0.05 / H, 0.16 / H, 0.34 / H); else ts.push(0);
  const t0 = ts[ts.length - 1]; for (let i = 1; i <= N; i++) ts.push(t0 + (1 - t0) * i / N);
  const T = GB(); const nB = 5 + (v.seed % 3); const vs = k === 'royal' ? 4 : 2.4;
  ts.forEach((t) => { const c = C(t); const y = t * H;
    let rad = k === 'royal' ? 0.25 + 0.085 * Math.sin(Math.PI * Math.min(1, t * 1.25)) : k === 'coco' ? (0.17 + 0.08 * (1 - t)) * v.slim : v.bark === 'sabalS' ? 0.2 + 0.03 * (1 - t) : 0.22 + 0.02 * (1 - t) + 0.05 * Math.max(0, t - 0.55);
    rad *= 1 + (k === 'coco' ? 0.05 : 0.02) * Math.sin(y * 1.7 + ph1); // growth bulges
    const flare = 0.26 * Math.exp(-y * 2.2) + 0.06 * Math.exp(-y * 0.6);
    for (let j = 0; j <= R; j++) { const a = j / R * TAU; const bt = lvl === 0 ? Math.pow(Math.max(0, Math.cos(a * nB + ph2)), 3) * 0.22 * Math.exp(-y * 3.2) : 0;
      const rr = rad + flare + bt; T.p.push(c.x + Math.cos(a) * rr, y - (y === 0 ? 0.12 : 0), c.z + Math.sin(a) * rr); T.uv.push(j / R, y / vs); T.s.push(Math.max(0, t - 0.6) * 0.5); } });
  const NR = ts.length - 1; for (let q = 0; q < NR; q++) for (let j = 0; j < R; j++) { const a = q * (R + 1) + j, b = a + R + 1; T.i.push(a, b, a + 1, b, b + 1, a + 1); }
  const trunk = gbBuild(T, false);
  // crown
  let top = C(1); const parts = []; const seg = [12, 8, 5][lvl];
  if (v.shaft) { const cg = new THREE.CylinderGeometry(0.21, 0.29, v.shaft, seg, lvl ? 1 : 3); if (!lvl) { const P = cg.attributes.position; for (let i = 0; i < P.count; i++) { const yy = P.getY(i) / v.shaft + 0.5; const f = 1 + 0.12 * Math.sin(yy * Math.PI) * (1 - yy); P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * f); } cg.computeVertexNormals(); }
    cg.translate(top.x, top.y + v.shaft / 2 - 0.1, top.z); parts.push([cg, [0.36, 0.52, 0.24], 0.3]);
    const ring = new THREE.CylinderGeometry(0.3, 0.27, 0.25, seg, 1); ring.translate(top.x, top.y - 0.05, top.z); parts.push([ring, [0.55, 0.5, 0.38], 0.3]); top = top.clone().add(new THREE.Vector3(0, v.shaft - 0.25, 0)); }
  const knob = new THREE.SphereGeometry(k === 'sabal' ? 0.44 : 0.32, seg, Math.max(4, seg - 4)); knob.scale(1, 0.9, 1); knob.translate(top.x, top.y - 0.1, top.z);
  parts.push([knob, k === 'royal' ? [0.42, 0.55, 0.28] : k === 'sabal' ? [0.40, 0.33, 0.22] : [0.46, 0.38, 0.24], 0.35]);
  if (v.nuts && lvl < 2) { const nC = lvl ? Math.min(2, v.nuts) : v.nuts; const NUT = [[0.42, 0.52, 0.16], [0.62, 0.55, 0.18], [0.72, 0.5, 0.16], [0.42, 0.29, 0.15]];
    for (let cI = 0; cI < nC; cI++) { const a0 = cI / nC * TAU + r() * 0.8; const cx = top.x + Math.cos(a0) * 0.36, cz = top.z + Math.sin(a0) * 0.36, cy = top.y - 0.45 - r() * 0.2; const col = NUT[Math.floor(r() * NUT.length)];
      const nN = lvl ? 3 : 5 + Math.floor(r() * 3);
      for (let i = 0; i < nN; i++) { const a = r() * TAU, d = 0.08 + r() * 0.16; const s = new THREE.SphereGeometry(0.13 + r() * 0.035, lvl ? 5 : 6, lvl ? 3 : 4); s.scale(1, 1.18, 1);
        s.translate(cx + Math.cos(a) * d, cy - r() * 0.28, cz + Math.sin(a) * d); parts.push([s, col.map((x) => x * (0.88 + r() * 0.24)), 0.35]); }
      if (!lvl) { const st = new THREE.CylinderGeometry(0.025, 0.035, 0.6, 4, 1); st.rotateZ(0.6); st.rotateY(-a0); st.translate(cx - Math.cos(a0) * 0.1, cy + 0.2, cz - Math.sin(a0) * 0.1); parts.push([st, [0.62, 0.55, 0.32], 0.35]); } } }
  const crown = mergeColored(parts);
  // fronds: live (left half of the atlas) then the dead hanging layer (right half)
  const F = GB(); const S = [12, 6, 3][lvl]; const sp = FR[k];
  const nF = Math.ceil(v.nF * [1, 0.72, k === 'sabal' ? 0.32 : 0.45][lvl]); const nD = lvl === 2 ? Math.min(2, v.dead) : Math.ceil(v.dead * [1, 0.6][lvl]);
  for (let f = 0; f < nF; f++) {
    const az = f * 2.39996 + r() * 0.25; const age = f / nF; const yel = age > 0.85 && k !== 'royal' && r() < 0.5; // a few yellowing old fronds
    const tint = yel ? [1.05, 0.92, 0.5] : [0.82 + r() * 0.2 - age * 0.1, 0.92 + r() * 0.12, 0.8 + r() * 0.15];
    if (sp.L[0] < 2) { addFan(F, top.clone().add(new THREE.Vector3(0, -0.1 - age * 0.4, 0)), az, sp.L[0] + r() * (sp.L[1] - sp.L[0]), sp.up[1] - age * (sp.up[1] - sp.up[0]), 1.25 + r() * 0.3, lvl ? 2 : 4, tint, lvl ? 7 : 14); continue; }
    const L = (sp.L[0] + r() * (sp.L[1] - sp.L[0])) * (v.H > 14 ? 1.08 : v.H < 8 ? 0.85 : 1);
    addFrond(F, top.clone().add(new THREE.Vector3(0, -age * 0.25, 0)), az, L, sp.up[1] - age * (sp.up[1] - sp.up[0]), sp.droop[0] + r() * (sp.droop[1] - sp.droop[0]) + age * 0.3, S, tint, { wingDrop: sp.wingDrop, maxW: sp.maxW, plume: sp.plume, rachis: !lvl });
  }
  const live = F.uv.length; for (let i = 0; i < live; i += 2) F.uv[i] *= 0.5;
  for (let f = 0; f < nD; f++) {
    const az = f * 2.39996 + 1.1 + r() * 0.5; const tint = [0.95 + r() * 0.15, 0.92 + r() * 0.1, 0.85 + r() * 0.1]; const y0 = -0.25 - r() * 0.45;
    if (sp.L[0] < 2) { addFan(F, top.clone().add(new THREE.Vector3(0, y0 - 0.2, 0)), az, 0.35 + r() * 0.3, -1.6 - r() * 0.8, 0.9 + r() * 0.3, lvl ? 2 : 3, tint, lvl ? 6 : 10); continue; }
    const L = (k === 'royal' ? 3.2 : 3.0 + r() * 1.0) * (v.H < 8 ? 0.85 : 1);
    addFrond(F, top.clone().add(new THREE.Vector3(0, y0, 0)), az, L, -1.5 - r() * 0.9, 0.12 + r() * 0.2, Math.max(3, S - 3), tint, { wingDrop: 1.5, maxW: 0.55, plume: 0, rachis: !lvl });
  }
  for (let i = live; i < F.uv.length; i += 2) F.uv[i] = 0.5 + F.uv[i] * 0.5;
  for (let i = live / 2; i < F.s.length; i++) F.s[i] *= 0.6; // dead fronds hang stiffer
  const fronds = gbBuild(F);
  return { trunk, fronds, crown, H: H + (v.shaft || 0) };
}
// tree pit: kind 0 = cast-iron grate flush with the sidewalk, kind 1 = mulch bed in a low concrete curb
function pitGeometry(kind) {
  const parts = []; const S = kind ? 2.2 : 2.0; const ch = kind ? 0.16 : 0.035, cw = kind ? 0.14 : 0.16; // a_palms3: larger, granite-framed
  const box = (w, h, d, x, y, z, u0, v0, u1, v1) => { const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); g.translate(x, y, z); parts.push(g); };
  const hs = S / 2;
  box(S, ch, cw, 0, ch / 2, hs - cw / 2, 0.52, 0.02, 0.98, 0.46); box(S, ch, cw, 0, ch / 2, -hs + cw / 2, 0.52, 0.02, 0.98, 0.46);
  box(cw, ch, S - 2 * cw, hs - cw / 2, ch / 2, 0, 0.52, 0.02, 0.98, 0.46); box(cw, ch, S - 2 * cw, -hs + cw / 2, ch / 2, 0, 0.52, 0.02, 0.98, 0.46);
  const ins = S - 2 * cw; const pl = new THREE.PlaneGeometry(ins, ins); pl.rotateX(-Math.PI / 2); const uv = pl.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, kind ? 0.5 + uv.getX(i) * 0.5 : uv.getX(i) * 0.5, kind ? 0.5 + uv.getY(i) * 0.5 : uv.getY(i)); pl.translate(0, kind ? 0.09 : 0.025, 0); parts.push(pl);
  const o = mergeColored(parts.map((g) => [g, [1, 1, 1], 0])); o.deleteAttribute('aSway'); o.computeBoundingSphere(); return o; // keeps the white vertex colour: pits share the flWood program
}

// ---------------------------------------------------------------- build ----
// list: palms with .vi (variant index) already chosen; ctx: { depthFor(mat), trunkDepth, out, groundH }
export function buildPalmsA(scene, city, list, ctx) {
  const frondT = atlas(pinnateTex(), deadPinnateCanvas(), 256, 1024), fanT = atlas(fanTex(), deadFanCanvas(), 512, 512);
  const mkF = (map) => prep(new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true, color: new THREE.Color().setRGB(1.25, 1.22, 1.05) }), 'frondA', (s) => foliagePatch(s, 0.35, 1, 2.3));
  const frondMat = mkF(frondT), fanMat = mkF(fanT);
  const trunkMats = {}; for (const b of ['coco', 'royal', 'sabal', 'sabalS']) { const t = barkTexA(b); trunkMats[b] = prep(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.9, color: 0xffffff }), 'ptrunk', (s) => foliagePatch(s, 0.0)); }
  const crownMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, color: 0xffffff }), 'pcrownA', (s) => foliagePatch(s, 0.0));
  // shader-program reuse (01:42 rule): same params + key as flora.js woodMat ('flWood': map + vertex colour + instancing, foliagePatch 0) -> no new program
  const pitMat = prep(new THREE.MeshStandardMaterial({ map: pitTex(), vertexColors: true, roughness: 0.88, color: 0xffffff }), 'flWood', woodPatch);
  const fDepth = ctx.depthFor(frondMat), nDepth = ctx.depthFor(fanMat);
  const groups = VARIANTS_A.map(() => []); for (const p of list) groups[p.vi].push(p);
  const sets = []; const ims = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const mk = (geo, mat, n, cast, dm) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = cast; im.receiveShadow = true; if (dm) im.customDepthMaterial = dm; im.frustumCulled = false; im.count = 0; im.visible = false; scene.add(im); ctx.out.push(im); ims.push(im); return im; };
  VARIANTS_A.forEach((v, vi) => {
    const L = groups[vi]; if (!L.length) return; const fan = v.k === 'sabal';
    const lv = [0, 1, 2].map((lvl) => { const g = palmGeometryA(v, lvl);
      return { H: g.H, ims: [mk(g.trunk, trunkMats[v.bark], L.length, lvl < 2, ctx.trunkDepth), mk(g.fronds, fan ? fanMat : frondMat, L.length, true, fan ? nDepth : fDepth), mk(g.crown, crownMat, L.length, lvl === 0, ctx.trunkDepth)] }; });
    const set = { lv: lv.map((l) => l.ims), th: [55 * 55, 210 * 210], mats: [], pos: [] };
    for (const p of L) { const s = p.hA / lv[0].H; q.setFromEuler(new THREE.Euler(p.lean * (v.k === 'coco' ? 1.6 : 0.4), p.rot, 0)); sc.set(s * 0.95 * (p.s || 1), s, s * 0.95 * (p.s || 1));
      pos.set(p.x, city.groundH(p.x, p.z) - 0.05, p.z); m4.compose(pos, q, sc); set.mats.push(m4.clone()); set.pos.push([p.x, p.z, p.far2 || 0]); }
    sets.push(set);
  });
  // tree pits under street palms (downtown island streets get grates, the rest mulch beds)
  const pits = [[], []]; for (const p of list) if (p.street) pits[p.x > 150 && Math.abs(p.z) < 380 ? 0 : 1].push(p);
  pits.forEach((L, kind) => { if (!L.length) return; const im = mk(pitGeometry(kind), pitMat, L.length, false, null); const set = { lv: [[im]], th: [150 * 150], mats: [], pos: [] };
    for (const p of L) { m4.compose(pos.set(p.x, city.groundH(p.x, p.z) - (kind ? 0.0 : 0.012), p.z), q.identity(), sc.set(1, 1, 1)); set.mats.push(m4.clone()); set.pos.push([p.x, p.z, 0]); }
    sets.push(set); });
  let lastX = 1e9, lastZ = 1e9;
  const update = (cx, cz, force) => {
    if (!force && Math.hypot(cx - lastX, cz - lastZ) < 12) return; lastX = cx; lastZ = cz;
    for (const set of sets) { const cnt = set.lv.map(() => 0);
      for (let i = 0; i < set.mats.length; i++) { const P = set.pos[i]; const d = (P[0] - cx) ** 2 + (P[1] - cz) ** 2; if (P[2] && d > P[2]) continue;
        let li = 0; while (li < set.th.length && d >= set.th[li]) li++; if (li >= set.lv.length) continue; const idx = cnt[li]++; for (const im of set.lv[li]) im.setMatrixAt(idx, set.mats[i]); }
      set.lv.forEach((arr, li) => { for (const im of arr) { im.count = cnt[li]; im.visible = cnt[li] > 0; im.instanceMatrix.needsUpdate = true; } }); }
  };
  update(280, 30, true);
  return { update, ims, frondMat, fanMat, stats: () => { let t = 0; for (const im of ims) if (im.visible) t += (im.geometry.index.count / 3) * im.count; return t; } };
}
