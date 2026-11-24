// marina_b: canal-front house "shells" for map A 索拉纳港 — the big forms that make a canal house read as a house and not a box
// from across the canal or from the air, drawn at EVERY distance as a few resident InstancedMeshes (≈ 737 lots, ~6 boxes each):
//   · pitched houses: the hip roof itself (fabric.js no longer adds it for canal lots) with a barrel / flat concrete tile shader
//     (courses, per-tile colour, ridge mortar, weathering), window units with frames + meeting rail, striped canvas awnings,
//     and on two-storey houses without a lanai a canal balcony (slab + white balustrade + glazed door);
//   · flat-roofed white villas: the overhanging roof slab (moved here from the near detail), the canal glass wall and the
//     upper street window band (mullion grid + lit panes at night, moved here too), balcony slab, a far-only glass rail,
//     a roof-access box + AC units.
// The near detail (marina.js canalLot, streamed < 230 m) keeps everything small: mullion fins, sills, shutters, rails, doors.
// Cheap: one box geometry / one roof / one awning geometry, patterns in the fragment shader, fade to average with distance.
// Strictly no neon: lit panes are warm interior light, like the fabric's houses.
import * as THREE from 'three';
import { prep } from '../../mats.js';
import { U } from '../../env.js';

const mulb = (seed) => { let a = (seed | 0) >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const AWN = [[0.13, 0.30, 0.22], [0.12, 0.20, 0.38], [0.46, 0.13, 0.13], [0.70, 0.58, 0.40], [0.18, 0.42, 0.46]];
const WHITE = [0.95, 0.95, 0.93];
// kinds (aKind): 0 plain solid · 1 glazing wall (mullion grid) · 2 window unit · 3 glass rail (far only) · 4 awning · 5 balustrade · 6 roof
const FAR_ONLY = 240; // m — inside this the streamed near detail carries the glass rail

export function villaShells(lots) {
  const S = { solid: [], thin: [], roof: [], awn: [], meshes: [] };
  for (const w of lots) {
    if (w.vb === undefined) continue; const r = mulb((w.seed ^ 0x7a3d91) >>> 0); const st = w.style || {};
    const hw = w.hw / 2, hd = w.hd / 2, H = w.h; const ang = Math.atan2(-w.ua[1], w.ua[0]);
    const zx = Math.sin(ang), zz = Math.cos(ang); const sgz = Math.sign(zx * w.ub[0] + zz * w.ub[1]) || 1;
    const seed = (w.seed % 997) / 997;
    // a lot-frame box → [cx, cy, cz, sx, sy, sz, ang, r, g, b, kind, seed]
    const B = (list, u0, u1, v0, v1, y0, y1, col, kind = 0) => { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      list.push([w.x + w.ua[0] * uc + w.ub[0] * vc, (y0 + y1) / 2, w.z + w.ua[1] * uc + w.ub[1] * vc, Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(v1 - v0), ang, col[0], col[1], col[2], kind, seed]); };
    if (w.flat) {
      const back = st.lanai ? 3.2 : 1.4;
      B(S.solid, -hw - 0.7, hw + 0.7, -hd - 0.7, hd + back, H - 0.02, H + 0.24, WHITE);
      B(S.solid, -hw - 0.72, hw + 0.72, -hd - 0.72, hd + back + 0.02, H + 0.24, H + 0.27, [0.78, 0.78, 0.76]);
      const fl = w.two ? [[0.08, 2.75], [3.25, H - 0.4]] : [[0.08, H - 0.45]];
      for (const [y0, y1] of fl) B(S.thin, -hw + 0.5, hw - 0.5, hd - 0.02, hd + 0.05, y0, y1, [0.07, 0.10, 0.12], 1);
      if (w.two) { B(S.solid, -hw + 0.3, hw - 0.3, hd - 0.02, hd + 1.7, 2.8, 3.05, WHITE);
        B(S.thin, -hw + 0.35, hw - 0.35, hd + 1.64, hd + 1.71, 3.05, 4.05, [0.50, 0.60, 0.60], 3);
        B(S.thin, -hw + 0.6, -0.1 * hw, -hd - 0.05, -hd + 0.02, 3.5, 5.1, [0.07, 0.10, 0.12], 1); }
      // roof: access / stair box with its own thin slab, two AC condensers
      if (w.two || r() < 0.6) { const u0 = -hw + 1.2 + r() * Math.max(0.1, hw - 3), v0 = -hd + 1.0 + r() * Math.max(0.1, hd - 3.5);
        B(S.solid, u0, u0 + 3.0, v0, v0 + 2.6, H + 0.27, H + 2.55, [0.93, 0.93, 0.91]); B(S.solid, u0 - 0.25, u0 + 3.25, v0 - 0.25, v0 + 2.85, H + 2.55, H + 2.7, WHITE); }
      for (let k = 0; k < 2; k++) { const u = hw - 1.6 - k * 1.3, v = -hd + 1.4; B(S.solid, u - 0.5, u + 0.5, v - 0.45, v + 0.45, H + 0.27, H + 1.05, [0.70, 0.71, 0.70]); }
    } else {
      // the roof (fabric's transform exactly, ridge along u)
      const rc = w.roofC || [0.6, 0.3, 0.2], rh = w.roofH || Math.min(hw, hd) * 0.5;
      S.roof.push([w.x, H, w.z, w.hw + 0.9, rh, w.hd + 0.9, ang, rc[0], rc[1], rc[2], 6, seed]);
      // street windows where the near detail puts its shutters (Ef runs from u = +hw to -hw); glass now lives here
      const len = 2 * hw, da = len * 0.55; const awnC = AWN[Math.floor(r() * AWN.length) % AWN.length]; const awnOn = r() < 0.55;
      for (const a of [1.6, len - 1.8]) { if (Math.abs(a - da) < 2.2) continue; const u = hw - a;
        B(S.thin, u - 0.65, u + 0.65, -hd - 0.05, -hd + 0.02, 0.95, 2.15, [0.93, 0.93, 0.91], 2);
        if (w.two) B(S.thin, u - 0.65, u + 0.65, -hd - 0.05, -hd + 0.02, 3.9, 5.1, [0.93, 0.93, 0.91], 2);
        if (awnOn) S.awn.push(awnBox(w, ang, u, -hd - 0.02, -1, 1.7, w.two ? 5.45 : 2.5, 0.75, 0.85, awnC, seed)); }
      if (!st.lanai) { // canal side: windows (+ awnings) and, two-storey, a balcony with a glazed door
        for (const u of [-hw + 2.0, hw - 2.0]) { B(S.thin, u - 0.7, u + 0.7, hd - 0.02, hd + 0.05, 0.9, 2.2, [0.93, 0.93, 0.91], 2);
          if (awnOn) S.awn.push(awnBox(w, ang, u, hd + 0.02, 1, 1.8, 2.55, 0.8, 0.9, awnC, seed)); }
        if (w.two) { const bu = Math.min(3.2, hw * 0.55);
          B(S.solid, -bu, bu, hd - 0.02, hd + 1.3, 2.95, 3.15, WHITE);
          B(S.thin, -bu, bu, hd + 1.22, hd + 1.3, 3.15, 4.1, WHITE, 5); for (const s of [-1, 1]) B(S.thin, s * bu - 0.04, s * bu + 0.04, hd + 0.02, hd + 1.26, 3.15, 4.1, WHITE, 5);
          B(S.thin, -1.0, 1.0, hd - 0.02, hd + 0.05, 3.2, 5.25, [0.07, 0.10, 0.12], 1);
          for (const u of [-hw + 2.0, hw - 2.0]) if (Math.abs(u) > bu + 0.8) B(S.thin, u - 0.6, u + 0.6, hd - 0.02, hd + 0.05, 3.9, 5.1, [0.93, 0.93, 0.91], 2); }
      } else if (w.two) for (const u of [-hw + 2.0, 0, hw - 2.0]) B(S.thin, u - 0.6, u + 0.6, hd - 0.02, hd + 0.05, 3.9, 5.1, [0.93, 0.93, 0.91], 2);
    }
  }
  // awning: hung at (u, face v) at height top, projecting out along side*ub
  function awnBox(w, ang, u, v, side, width, top, drop, proj, col, seed) { const q = [w.x + w.ua[0] * u + w.ub[0] * v, w.z + w.ua[1] * u + w.ub[1] * v];
    const zx = Math.sin(ang), zz = Math.cos(ang); const dz = Math.sign(zx * w.ub[0] * side + zz * w.ub[1] * side) || 1; // local +z → outward
    return [q[0], top, q[1], width, drop, proj, dz > 0 ? ang : ang + Math.PI, col[0], col[1], col[2], 4, seed]; } // turn, never mirror

  S.stats = { solid: S.solid.length, thin: S.thin.length, roof: S.roof.length, awn: S.awn.length };
  S.tris = S.solid.length * 12 + S.thin.length * 12 + S.roof.length * 6 + S.awn.length * 20;
  S.attach = (scene) => {
    const M = shellMat(); const G = shellGeos();
    const mk = (list, geo, mat, cast, name) => { if (!list.length) return; const n = list.length; const g = geo.clone();
      const ak = new Float32Array(n * 2); list.forEach((b, i) => { ak[i * 2] = b[10]; ak[i * 2 + 1] = b[11]; }); g.setAttribute('aKS', new THREE.InstancedBufferAttribute(ak, 2));
      const m = new THREE.InstancedMesh(g, mat, n); const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
      list.forEach((b, i) => { _q.setFromAxisAngle(_y, b[6]); m.setMatrixAt(i, _m.compose(_v.set(b[0], b[1], b[2]), _q, _s.set(b[3], b[4], b[5]))); m.setColorAt(i, _c.setRGB(b[7], b[8], b[9])); });
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); m.castShadow = cast; m.receiveShadow = true; m.name = 'villaShell|' + name; m.userData.marina = true;
      scene.add(m); S.meshes.push(m); };
    mk(S.solid, G.box, M, true, 'solid'); mk(S.thin, G.box, M, false, 'thin'); mk(S.roof, G.roof, M, true, 'roof'); mk(S.awn, G.awn, M, true, 'awning');
  };
  return S;
}

let GEO = null;
function shellGeos() {
  if (GEO) return GEO; GEO = {};
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  { // hip roof over a unit footprint, ridge along x — identical to fabric.js's so the gutters / fascia of the near detail still fit
    const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.22, 1, 0], [0.22, 1, 0]];
    const f = [[0, 4, 5, 1], [2, 5, 4, 3], [1, 5, 2, -1], [3, 4, 0, -1]]; const p = [];
    for (const q of f) { p.push(...v[q[0]], ...v[q[1]], ...v[q[2]]); if (q[3] >= 0) p.push(...v[q[0]], ...v[q[2]], ...v[q[3]]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); GEO.roof = g; }
  { // awning: top edge on the wall at y = 0 (z = 0), slopes down to (y = -1, z = 1), valance 0.22 of the drop, two side cheeks
    const p = []; const q = (a, b, c, d) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
    q([-0.5, 0, 0], [-0.5, -1, 1], [0.5, -1, 1], [0.5, 0, 0]); q([-0.5, -1, 1], [-0.5, -1.22, 1], [0.5, -1.22, 1], [0.5, -1, 1]);
    p.push(-0.5, 0, 0, -0.5, -1, 0, -0.5, -1, 1); p.push(0.5, 0, 0, 0.5, -1, 1, 0.5, -1, 0);
    const n0 = p.length; for (let i = 0; i < n0; i += 9) p.push(p[i], p[i + 1], p[i + 2], p[i + 6], p[i + 7], p[i + 8], p[i + 3], p[i + 4], p[i + 5]); // back faces (underside seen from the street)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); GEO.awn = g; }
  return GEO;
}

const VCOMMON = `
attribute vec2 aKS; uniform float uFarOnly; varying vec3 vLP; varying vec3 vLN; varying vec3 vSc; varying float vKind; varying float vSeed; varying vec3 vIP;`;
const VBODY = `
  vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vLP = position * vSc; vLN = normal; vKind = aKS.x; vSeed = aKS.y;
  vIP = instanceMatrix[3].xyz;
  { float dc = distance(vIP, cameraPosition); if (dc > 2800.0 || (vKind > 2.5 && vKind < 3.5 && dc < uFarOnly)) transformed = vec3(0.0); }`;
const FCOMMON = `
uniform float uNight; varying vec3 vLP; varying vec3 vLN; varying vec3 vSc; varying float vKind; varying float vSeed; varying vec3 vIP; float sGl; float sLit; float sMet;
float sh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }`;
let MAT = null;
// ONE program for every shell part (01:42 rule: reuse programs) — the part is the instance's aKS.x kind:
// 0 plaster solid · 1/2/3/5 thin glazing / window / glass rail / balustrade · 4 canvas awning · 6 tile roof. Roughness per kind.
function shellMat() {
  if (MAT) return MAT;
  MAT = prep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'villaShell', (s) => {
    s.uniforms.uNight = U.uNight; s.uniforms.uTime = U.uTime; s.uniforms.uFarOnly = { value: FAR_ONLY };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>' + VCOMMON).replace('#include <begin_vertex>', '#include <begin_vertex>' + VBODY);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>' + FCOMMON)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  sGl = 0.0; sLit = 0.0; sMet = 0.0; float sRo = 0.82; vec3 sNn = normalize(vLN); vec3 sPp = vLP; float sAA = clamp(length(fwidth(vIP + sPp)) * 2.5, 0.0, 1.0);\n' + FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(sRo, 0.06, sGl);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = max(metalnessFactor, sMet);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += sLit * uNight * vec3(1.0, 0.72, 0.42) * 1.5;');
  });
  return MAT;
}
// solids: render-plaster slabs / boxes, darker soffits, slab-edge grime
const F_SOLID = `
  diffuseColor.rgb *= 0.93 + 0.1 * sn(vIP.xz * 0.3 + sPp.xz * 0.6); diffuseColor.rgb *= 1.0 - step(sNn.y, -0.5) * 0.28;
  diffuseColor.rgb *= 1.0 - (1.0 - step(0.5, abs(sNn.y))) * (1.0 - smoothstep(-vSc.y * 0.5, max(-vSc.y * 0.5 + 1e-4, vSc.y * 0.5 - 0.06), sPp.y)) * 0.08;`;
// thin: glazing walls, window units, glass rails, balustrades
const F_THIN = `
  float fz = step(0.5, abs(sNn.z)); vec2 sF = vec2(sPp.x + vSc.x * 0.5, sPp.y + vSc.y * 0.5); // metres from the unit's lower-left corner (face)
  if (vKind > 0.5 && vKind < 1.5) { // glass wall: 1.7 m bays, slim dark-alu mullions, head / sill rails, a lit pane now and then
    float bay = floor(sF.x / 1.7); float m = 1.0 - step(0.045, fract(sF.x / 1.7)) * step(fract(sF.x / 1.7), 0.97); float rail = 1.0 - step(0.07, sF.y) * step(sF.y, vSc.y - 0.07);
    float fr = clamp(max(m, rail) * fz * (1.0 - sAA * 0.7), 0.0, 1.0);
    vec3 gc = mix(vec3(0.05, 0.08, 0.10), vec3(0.20, 0.27, 0.32), clamp(sF.y / max(vSc.y, 0.1), 0.0, 1.0) * 0.6) * (0.85 + 0.3 * sh(vec2(bay, vSeed * 13.0)));
    diffuseColor.rgb = mix(gc, vec3(0.16, 0.17, 0.18), max(fr, 1.0 - fz)); sGl = (1.0 - fr) * fz; sMet = sGl * 0.25;
    sLit = sGl * step(0.55, sh(vec2(bay, vSeed * 7.0 + floor(vIP.y)))) * (0.7 + 0.3 * sn(sF * 1.3)); }
  else if (vKind > 1.5 && vKind < 2.5) { // window unit: painted frame, meeting rail, glass
    float bw = 0.07; float fr = 1.0 - step(bw, sF.x) * step(sF.x, vSc.x - bw) * step(bw, sF.y) * step(sF.y, vSc.y - bw); fr = max(fr, 1.0 - step(0.03, abs(sF.y - vSc.y * 0.5)));
    fr = max(fr, (1.0 - step(0.022, abs(sF.x - vSc.x * 0.5))) * step(vSc.x, 1.5) * 0.0); fr = clamp(fr * (1.0 - sAA * 0.6) + sAA * 0.25, 0.0, 1.0);
    vec3 gc = mix(vec3(0.05, 0.07, 0.09), vec3(0.22, 0.28, 0.32), smoothstep(vSc.y * 0.5, vSc.y, sF.y) * 0.5);
    diffuseColor.rgb = mix(gc, diffuseColor.rgb, max(fr, 1.0 - fz)); sGl = (1.0 - fr) * fz; sMet = sGl * 0.2;
    sLit = sGl * step(0.6, sh(vec2(floor(vIP.x * 0.7 + vIP.z * 1.3), floor(sF.y / 2.0) + vSeed * 11.0))); }
  else if (vKind > 2.5 && vKind < 3.5) { sGl = 0.8; sMet = 0.3; diffuseColor.rgb *= 0.55; }
  else if (vKind > 4.5 && vKind < 5.5) { // balustrade: top + bottom rails, 4.5 cm balusters every 14 cm (gaps cut)
    float rail = 1.0 - step(0.06, sF.y) * step(sF.y, vSc.y - 0.09); float ax = abs(sNn.z) > 0.5 ? sF.x : sPp.z + vSc.z * 0.5; float bal = 1.0 - step(0.045, fract(ax / 0.14));
    if (abs(sNn.y) < 0.5 && max(rail, bal) < 0.5 && sAA < 0.6) discard; diffuseColor.rgb *= 0.96; }`;
// roof tiles: barrel (warm colours) or flat concrete (greys), courses up the slope, ridge mortar, weathering
const F_ROOF = `
  { float lx = abs(sNn.x) > abs(sNn.z) ? 1.0 : 0.0; float c = mix(sPp.x, sPp.z, lx);
    float eave = mix(vSc.z * 0.5 - abs(sPp.z), vSc.x * 0.5 - abs(sPp.x), lx); float up = sPp.y; float s = sqrt(up * up + max(eave, 0.0) * max(eave, 0.0)); // slope distance from the eave
    vec3 base = diffuseColor.rgb; float warm = clamp((base.r - base.b) * 3.0, 0.0, 1.0);
    float ci = floor(c / 0.24), si = floor(s / 0.38); float cf = fract(c / 0.24), sf = fract(s / 0.38);
    float barrel = mix(0.55 + 0.45 * sqrt(max(sin(cf * 3.14159), 0.0)), 1.0, 1.0 - warm); float cap = mod(ci, 2.0);
    float butt = smoothstep(0.0, 0.12, sf) * (0.82 + 0.18 * sf);
    float tile = 0.82 + 0.36 * sh(vec2(ci, si + vSeed * 31.0));
    float pat = barrel * mix(1.0, 0.88 + 0.12 * cap, warm) * butt * mix(1.0, tile, 0.7);
    float flatLine = 1.0 - (1.0 - step(0.03, fract(c / 0.33))) * (1.0 - warm) * 0.25;
    pat *= flatLine; pat = mix(pat, 0.86, sAA);
    diffuseColor.rgb = base * pat * (0.86 + 0.22 * sn(vIP.xz + sPp.xz * 0.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.72, 0.66), smoothstep(0.55, 0.9, sn(sPp.xz * 0.35 + vSeed * 20.0)) * 0.5); // weathering / mildew
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.78, 0.74), step(vSc.y - 0.12, up) * 0.6); }`;
// canvas awnings: 25 cm stripes (colour / cream), a little sag shading
const F_AWN = `
  { float st = step(0.5, fract((sPp.x + vSc.x * 0.5) / 0.5)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.90, 0.84), st * (1.0 - sAA * 0.5));
    diffuseColor.rgb *= 0.9 + 0.1 * sn(sPp.xy * 3.0); }`;
const FRAG = `
  if (vKind < 0.5) {` + F_SOLID + `
  } else if (vKind > 5.5) { sRo = 0.78;` + F_ROOF + `
  } else if (vKind > 3.5 && vKind < 4.5) { sRo = 0.92;` + F_AWN + `
  } else { sRo = 0.5;` + F_THIN + `
  }`;
