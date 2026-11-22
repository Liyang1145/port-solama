// a_downtown (map 索拉纳港 only): street-level read of the mainland downtown (fabric dtBlocks + the skyline towers snapped into them).
// Before this the towers' curtain walls ran straight into the paving (no podium, the round towers had no entrance at all, black at
// night), the generated mid-rises carried their window grid down to the ground, and the 4-lane junctions had no signals or kerb
// furniture. This pass runs in region.attach after every bake-hashed pass (curbfix / parkfix tapes keep their inputs) and adds:
//  1) tower podiums: a 5.6 m lobby glazing band on every face (granite plinth, bronze mullions, metal fascia, lit lobby at night),
//     on the street face a glass vestibule with a revolving door, a cantilevered canopy with soffit light strips and a fascia lip,
//     and two granite planters with shrubs;
//  2) generated mid-rises (fabric kinds 3 / 4 / 5): the street face index rides in the fraction of aK.x (rec.hs) and fabBody draws
//     the podium (lobby glazing + entrance doors, or a garage entry), plus an entrance canopy on the street face;
//  3) junction furniture on the downtown grid: two mast-arm signals per junction (heads lit green / red per approach), a controller
//     cabinet, a hydrant, a row of newspaper boxes and a litter bin, each placed only where the collider grid is clear.
// All boxes draw on the existing fabBody program (one InstancedMesh pool around the camera, like the house / strip kits): no new
// shader program, no new texture, one mesh (main + near shadow pass) only while the camera is downtown. Deterministic: no random
// draws (positions come from the plan, variation from integer hashes). Walk-height pieces get oriented colliders ('dtown').
import * as THREE from 'three';
import { fabKit } from './fabric.js';
import { KIT_LAYER } from './houses.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const OFF = Q.has('nodt');
const AW = 7; // arterial half width (fabric.js)
const CAP = 2400, RAD = 175, FADE = 18, NEAR = 95, NFADE = 12;
const ih = (x, z, k = 0) => { let h = (Math.round(x * 4) * 73856093) ^ (Math.round(z * 4) * 19349663) ^ (k * 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const C = {
  granite: [0.34, 0.33, 0.31], bronze: [0.21, 0.19, 0.17], white: [0.86, 0.85, 0.82], shrub: [0.24, 0.36, 0.18], pole: [0.27, 0.29, 0.28], head: [0.10, 0.10, 0.09],
  plate: [0.05, 0.05, 0.05], conc: [0.62, 0.61, 0.58], cab: [0.52, 0.56, 0.52], hyd: [0.86, 0.68, 0.12], hydcap: [0.75, 0.2, 0.12], bin: [0.14, 0.22, 0.16],
  news: [[0.12, 0.30, 0.62], [0.72, 0.13, 0.10], [0.88, 0.78, 0.22], [0.90, 0.90, 0.88], [0.15, 0.45, 0.30]],
};

// record: [x, y0, z, w (local x), h, d (local z), ang, r, g, b, kind, seed, rad]
export function prepDowntown(fab, col) {
  if (OFF || !fab || !fab.dtBlocks || !col) return null; const T0 = performance.now();
  const K = { recs: [], grid: new Map(), stats: { towers: 0, entrances: 0, mid: 0, midDoors: 0, canopies: 0, junctions: 0, corners: 0, items: {}, refused: {}, cols: 0 } };
  const S = K.stats; const it = (k) => { S.items[k] = (S.items[k] || 0) + 1; }; const no = (k) => { S.refused[k] = (S.refused[k] || 0) + 1; };
  const add = (x, y0, z, w, h, d, ang, c, kind, seed = 0, rad = RAD) => K.recs.push([x, y0, z, w, h, d, ang, c[0], c[1], c[2], kind, seed, rad]);
  const addCol = (x, z, w, d, ang, h) => { col.addOBB(x, z, Math.cos(ang), -Math.sin(ang), w / 2, d / 2, h, 'dtown'); S.cols++; };
  // free test: oriented footprint (local w x d at ang, + pad) against every collider taller than 0.25 m (AABB of the footprint vs box)
  const tmp = [];
  const free = (x, z, w, d, ang, pad = 0.15) => { const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang)); const ex = c * w / 2 + s * d / 2 + pad, ez = s * w / 2 + c * d / 2 + pad;
    const l = col.query(x, z, Math.max(ex, ez) + 1, tmp); for (const b of l) { if (b.h < 0.25) continue; if (b.maxX > x - ex && b.minX < x + ex && b.maxZ > z - ez && b.minZ < z + ez) return false; } return true; };

  // ---- 1) tower podiums ----
  const GFT = 5.6;
  for (const T of fab.dtTowers || []) {
    const P = T.poly; const n = P.length; if (n < 3) continue; S.towers++;
    let cx = 0, cz = 0; for (const p of P) { cx += p[0] / n; cz += p[1] / n; }
    const b = T.b; const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
    const gaps = [[Math.min(...xs) - b.x0, -1, 0], [b.x1 - Math.max(...xs), 1, 0], [Math.min(...zs) - b.z0, 0, -1], [b.z1 - Math.max(...zs), 0, 1]].sort((a, c) => a[0] - c[0]);
    const Sd = [gaps[0][1], gaps[0][2]];
    let best = -1, bs = -1e9; const E = [];
    for (let i = 0; i < n; i++) { const A = P[i], B = P[(i + 1) % n]; const L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 0.5) { E.push(null); continue; } const dx = (B[0] - A[0]) / L, dz = (B[1] - A[1]) / L;
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2; let nx = dz, nz = -dx; if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      const ang = Math.atan2(-dz, dx); E.push({ L, dx, dz, mx, mz, nx, nz, ang });
      // lobby glazing panel (kind 18), 0.14 m deep, 2 cm off the curtain wall; thin collider so nobody clips into the band
      add(mx + nx * 0.09, 0, mz + nz * 0.09, L + 0.04, GFT, 0.14, ang, C.white, 18, ih(mx, mz, 1));
      addCol(mx + nx * 0.09, mz + nz * 0.09, L, 0.16, ang, GFT);
      const sc = (nx * Sd[0] + nz * Sd[1]) * (0.5 + Math.min(L, 12) / 24); if (sc > bs && L >= 4.6) { bs = sc; best = i; } }
    if (best < 0) continue; const e = E[best]; S.entrances++;
    const off = (o) => [e.mx + e.nx * o, e.mz + e.nz * o]; const along = (p, a) => [p[0] + e.dx * a, p[1] + e.dz * a];
    const vw = Math.min(4.6, e.L - 0.4); const af = ((Math.atan2(e.nz, e.nx) / (Math.PI * 2)) % 1 + 1) % 1;
    const vp = off(0.16 + 0.95); add(vp[0], 0, vp[1], vw, 3.1, 1.9, e.ang, C.bronze, 20, af); addCol(vp[0], vp[1], vw, 1.9, e.ang, 3.1); it('vestibule');
    const cw = Math.min(Math.max(e.L + 1.6, 7.5), 10); const canC = ih(cx, cz, 3) < 0.5 ? C.white : C.bronze; const cy = 4.15;
    const cp = off(0.16 + 1.8); add(cp[0], cy, cp[1], cw, 0.32, 3.6, e.ang, canC, 8); S.canopies++;
    const fp = off(0.16 + 3.62); add(fp[0], cy - 0.22, fp[1], cw, 0.6, 0.12, e.ang, canC, 8);
    for (const o of [1.0, 2.6]) { const lp = off(0.16 + o); add(lp[0], cy - 0.04, lp[1], cw - 1.2, 0.04, 0.22, e.ang, C.white, 17, 0, NEAR); }
    for (const sg of [-1, 1]) { const pp = along(off(0.16 + 1.15), sg * (vw / 2 + 1.7)); if (!free(pp[0], pp[1], 1.5, 1.0, e.ang, 0.1)) { no('planter'); continue; }
      add(pp[0], 0, pp[1], 1.5, 0.75, 1.0, e.ang, C.granite, 8); add(pp[0], 0.75, pp[1], 1.3, 0.45, 0.8, e.ang, C.shrub, 6); addCol(pp[0], pp[1], 1.5, 1.0, e.ang, 0.75); it('planter'); }
  }

  // ---- 2) generated mid-rises: street face in rec.hs (0.15 + 0.07 * face, 0.43 = none), canopy over the entrance ----
  const GF = { 3: 4.4, 4: 4.8, 5: 3.8 };
  for (const M of fab.dtBodies || []) {
    const { rec, cx, cz, w, d, kind, b } = M; if (!rec || rec[10] !== kind) continue; S.mid++;
    const g = [(cx - w / 2) - b.x0, b.x1 - (cx + w / 2), (cz - d / 2) - b.z0, b.z1 - (cz + d / 2)]; let s = 0; for (let k = 1; k < 4; k++) if (g[k] < g[s]) s = k;
    if (g[s] > 16) { rec.hs = 0.43; continue; } rec.hs = 0.15 + 0.07 * s; S.midDoors++;
    if (kind === 5) continue;
    const nx = s === 0 ? -1 : s === 1 ? 1 : 0, nz = s === 2 ? -1 : s === 3 ? 1 : 0; const fx = cx + nx * w / 2, fz = cz + nz * d / 2; const ang = nx ? Math.PI / 2 : 0;
    const y = GF[kind] - 1.25; const canC = ih(cx, cz, 5) < 0.6 ? C.bronze : C.white;
    add(fx + nx * 1.22, y, fz + nz * 1.22, 6.4, 0.28, 2.4, ang, canC, 8); add(fx + nx * 2.4, y - 0.18, fz + nz * 2.4, 6.4, 0.46, 0.1, ang, canC, 8);
    add(fx + nx * 1.3, y - 0.035, fz + nz * 1.3, 5.6, 0.035, 0.22, ang, C.white, 17, 0, NEAR); S.canopies++;
  }

  // ---- 3) junction furniture ----
  const J = new Map(); for (const L of fab.dtLines || []) for (const x of L.xs) for (const z of L.zs) J.set(Math.round(x) + ',' + Math.round(z), [x, z]);
  const blockAt = (x, z) => fab.dtBlocks.find((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
  const CORN = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [x, z] of J.values()) {
    const corners = CORN.filter(([sx, sz]) => blockAt(x + sx * (AW + 1.5), z + sz * (AW + 1.5))); if (corners.length < 2) continue; S.junctions++;
    const hj = Math.floor(ih(x, z, 7) * 4); const nsGreen = ih(x, z, 8) < 0.5;
    for (let ci = 0; ci < 4; ci++) { const [sx, sz] = CORN[ci]; if (!corners.some((c) => c[0] === sx && c[1] === sz)) continue; S.corners++;
      const role = (ci + hj) % 4; const kx = x + sx * AW, kz = z + sz * AW;
      if (role === 0 || role === 2) { // mast-arm signal: arm over the N-S street (heads face +sz) and over the E-W street (heads face -sx)
        const px = kx + sx * 0.8, pz = kz + sz * 0.8; if (!free(px, pz, 0.5, 0.5, 0, 0.1)) { no('signal'); continue; }
        add(px, 0, pz, 0.62, 0.22, 0.62, 0, C.conc, 8); add(px, 0, pz, 0.26, 7.0, 0.26, 0, C.pole, 8); addCol(px, pz, 0.4, 0.4, 0, 7.0); it('signal');
        const la = 7.6, lb2 = 6.4;
        add(px - sx * la / 2, 6.5, pz, la, 0.18, 0.18, 0, C.pole, 8); add(px, 6.15, pz - sz * lb2 / 2, 0.16, 0.16, lb2, 0, C.pole, 8);
        const fA = Math.atan2(sz, 0) / (Math.PI * 2), fB = Math.atan2(0, -sx) / (Math.PI * 2); const nA = ((fA % 1) + 1) % 1, nB = ((fB % 1) + 1) % 1;
        const ltA = nsGreen ? 2 : 0, ltB = nsGreen ? 0 : 2;
        for (const a of [3.4, 6.6]) { const hx = px - sx * a; add(hx, 5.44, pz, 0.36, 1.05, 0.3, 0, C.head, 19, (ltA + nA) / 4); add(hx, 5.32, pz - sz * 0.17, 0.62, 1.3, 0.04, 0, C.plate, 8); }
        for (const a of [3.0, 5.6]) { const hz = pz - sz * a; add(px, 5.08, hz, 0.3, 1.05, 0.36, 0, C.head, 19, (ltB + nB) / 4); add(px + sx * 0.17, 4.96, hz, 0.04, 1.3, 0.62, 0, C.plate, 8); }
        add(px - sx * 0.2, 2.6, pz, 0.12, 0.42, 0.3, 0, C.head, 8, 0, NEAR); // pedestrian push-button / signal box
      } else if (role === 1) { // controller cabinet on its pad + hydrant
        let ok = false; for (const t of [3.4, 4.9, 6.4]) { const cx = kx + sx * t, cz = kz + sz * 1.05; if (!free(cx, cz, 1.2, 0.8, 0)) continue;
          add(cx, 0, cz, 1.2, 0.1, 0.8, 0, C.conc, 8, 0, NEAR); add(cx, 0.1, cz, 1.0, 1.42, 0.6, 0, C.cab, 8, 0, NEAR); add(cx, 1.52, cz, 1.06, 0.06, 0.66, 0, C.cab, 8, 0, NEAR); addCol(cx, cz, 1.2, 0.8, 0, 1.6); it('cabinet'); ok = true; break; }
        if (!ok) no('cabinet');
        const hx = kx + sx * 0.9, hz = kz + sz * 3.0; if (free(hx, hz, 0.5, 0.5, 0)) { add(hx, 0, hz, 0.3, 0.68, 0.3, 0, C.hyd, 8, 0, NEAR); add(hx, 0.68, hz, 0.22, 0.12, 0.22, 0, C.hydcap, 8, 0, NEAR); add(hx, 0.4, hz, 0.12, 0.1, 0.5, 0, C.hyd, 8, 0, NEAR); addCol(hx, hz, 0.4, 0.5, 0, 0.8); it('hydrant'); } else no('hydrant');
      } else { // newspaper boxes along the N-S edge + litter bin
        const n = 2 + Math.floor(ih(x, z, ci) * 3); const z0 = kz + sz * 4.2; const len = n * 0.56; const zc = z0 + sz * len / 2;
        if (free(kx + sx * 1.0, zc, 0.5, len, 0)) { for (let k = 0; k < n; k++) { const c = C.news[Math.floor(ih(x + k, z, ci) * 5)]; const zz = z0 + sz * (0.28 + k * 0.56); add(kx + sx * 1.0, 0, zz, 0.5, 1.02, 0.48, 0, c, 8, 0, NEAR); add(kx + sx * 1.0, 1.02, zz, 0.52, 0.05, 0.5, 0, c, 8, 0, NEAR); }
          addCol(kx + sx * 1.0, zc, 0.5, len, 0, 1.1); it('newsbox'); } else no('newsbox');
        const bx = kx + sx * 3.0, bz = kz + sz * 1.0; if (free(bx, bz, 0.62, 0.62, 0)) { add(bx, 0, bz, 0.6, 0.92, 0.6, 0, C.bin, 8, 0, NEAR); add(bx, 0.92, bz, 0.66, 0.07, 0.66, 0, C.bin, 8, 0, NEAR); addCol(bx, bz, 0.62, 0.62, 0, 1.0); it('bin'); } else no('bin');
      }
    }
  }
  // 48 m grid of record indices
  K.recs.forEach((r, i) => { const k = Math.floor(r[0] / 48) * 65536 + Math.floor(r[2] / 48); let l = K.grid.get(k); if (!l) K.grid.set(k, l = []); l.push(i); });
  S.boxes = K.recs.length; S.ms = Math.round(performance.now() - T0); return K;
}

export function attachDowntown(K, scene) {
  if (!K) return null; const { box: G, body: MAT } = fabKit(); if (!G || !MAT) return null;
  const g = G.clone(); const ak = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2); ak.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aK', ak);
  const m = new THREE.InstancedMesh(g, MAT, CAP); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.customDepthMaterial = new THREE.MeshDepthMaterial(); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.userData.dkit = true; m.layers.set(KIT_LAYER); scene.add(m);
  m.instanceMatrix.array.fill(0, 0, 16); m.count = 1; m.visible = true; m.userData.warm = 0; let keep = 0; // zero-scale warm-up instance (programs built with the rest, as a_houses)
  m.onBeforeShadow = function () { keep = this.count; if (scene.overrideMaterial) this.count = 0; this.userData.warm |= 1; }; m.onAfterShadow = function () { this.count = keep; };
  m.onBeforeRender = function (r, sc, cam, geo, mat) { this.userData.warm |= mat === MAT ? 2 : 4; };
  K.mesh = m; K.last = null; K.info = { boxes: 0, tris: 0 }; return K;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _y = new THREE.Vector3(0, 1, 0);
export function updateDowntown(K, cam) {
  if (!K || !K.mesh) return; const p = cam && cam.isObject3D ? cam.position : cam; if (!p) return; const m = K.mesh;
  if ((m.userData.warm & 3) !== 3) return;
  if (p.y > 140) { if (m.visible) { m.visible = false; K.last = null; } return; }
  if (K.last && Math.hypot(p.x - K.last[0], p.z - K.last[1]) < 1.5) return; K.last = [p.x, p.z];
  const M = m.instanceMatrix.array, Cc = m.instanceColor.array, A = m.geometry.attributes.aK.array; let n = 0;
  const a0 = Math.floor((p.x - RAD) / 48), a1 = Math.floor((p.x + RAD) / 48), k0 = Math.floor((p.z - RAD) / 48), k1 = Math.floor((p.z + RAD) / 48);
  for (let a = a0; a <= a1 && n < CAP; a++) for (let k = k0; k <= k1 && n < CAP; k++) { const l = K.grid.get(a * 65536 + k); if (!l) continue;
    for (const i of l) { const r = K.recs[i]; const dd = Math.hypot(r[0] - p.x, r[2] - p.z); const R = r[12]; if (dd > R) continue; if (n >= CAP) break;
      _q.setFromAxisAngle(_y, r[6]); _m.compose(_v.set(r[0], r[1], r[2]), _q, _s.set(r[3], r[4], r[5])); _m.toArray(M, n * 16);
      Cc[n * 3] = r[7]; Cc[n * 3 + 1] = r[8]; Cc[n * 3 + 2] = r[9]; A[n * 2] = r[10] - 0.45 * sstep(R - (R === RAD ? FADE : NFADE), R, dd); A[n * 2 + 1] = r[11]; n++; } }
  m.count = Math.max(n, 1); if (!n) m.instanceMatrix.array.fill(0, 0, 16);
  m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, Math.max(n, 1) * 16); m.instanceMatrix.needsUpdate = true;
  m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, Math.max(n, 1) * 3); m.instanceColor.needsUpdate = true;
  const ga = m.geometry.attributes.aK; ga.clearUpdateRanges(); ga.addUpdateRange(0, Math.max(n, 1) * 2); ga.needsUpdate = true; m.visible = n > 0;
  K.info = { boxes: n, tris: n * 12 };
}
