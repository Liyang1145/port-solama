// marina_a: 索拉纳港 waterfront — 鹈鹕游艇港 (finger slips, cleats, lamp posts, power pedestals, fuel dock) and the canal-front
// homes of the mainland finger canals (private docks on piles, fences, pool coping + loungers, modern-villa glass / slabs,
// bungalow lanais), plus every moored boat (boats.js, instanced, bobbing, near / far LOD).
// Near detail is STREAMED through the r6.2 detail stream (bldgdetail.js: built inside 230 m, freed past 380 m); far away the
// fabric's instanced houses / dock decals and the resident pier decks stand in. All randomness is position-seeded (mulb), the
// city's rng and the fabric's R() streams are untouched. Strictly no neon: lamp heads are warm practicals.
import * as THREE from 'three';
import { job, mulb, seedOf, fbox, lb, put, geos, COL, frame, signBoard, door } from './bldgdetail.js';
import { addPalmRaw } from './fabric.js';
import { boatFleet, TYPES, SWELL } from './boats.js';
import { U } from '../../env.js';
import { villaShells } from './villafar.js';
import { setCalm } from './calm.js';

const WY = -1.0; // LAYOUT.waterY
const WOOD = [0.50, 0.40, 0.29], WOODD = [0.36, 0.28, 0.20], WOODG = [0.58, 0.54, 0.47]; // fresh / dark / weathered grey timber
const TINTS = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [0.98, 0.95, 0.86], [0.16, 0.22, 0.36], [0.62, 0.76, 0.86], [0.12, 0.26, 0.22], [0.12, 0.12, 0.13], [0.66, 0.16, 0.12], [0.84, 0.82, 0.74]];
const UMB = [[0.92, 0.91, 0.87], [0.16, 0.24, 0.40], [0.20, 0.46, 0.46], [0.85, 0.80, 0.68], [0.62, 0.20, 0.16]];
const pickL = (r, a) => a[Math.floor(r() * a.length) % a.length];

// edge frame for lb(): from pA to pB, outward unit vector o
function edgeE(pA, pB, o) { const len = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]); const dx = (pB[0] - pA[0]) / len, dz = (pB[1] - pA[1]) / len;
  return { len, p: pA, dx, dz, ox: o[0], oz: o[1], P: (a, d) => [pA[0] + dx * a + o[0] * d, pA[1] + dz * a + o[1] * d] }; }
// lot-local frame helpers: u along the street (ua), v toward the canal (ub)
function lotFrame(w) {
  const F = frame(w.x, w.z, w.ua[0], w.ua[1]); const sg = Math.sign(-w.ua[1] * w.ub[0] + w.ua[0] * w.ub[1]) || 1;
  const P = (u, v) => [w.x + w.ua[0] * u + w.ub[0] * v, w.z + w.ua[1] * u + w.ub[1] * v];
  const box = (bk, u0, u1, v0, v1, y0, y1, col, bottom = false) => fbox(bk, F, Math.min(u0, u1), Math.max(u0, u1), Math.min(sg * v0, sg * v1), Math.max(sg * v0, sg * v1), y0, y1, col, bottom);
  // façade edge at v = vv (side +1 faces the canal, -1 the street) or at u = uu (side ±1)
  const faceV = (vv, side, u0, u1) => edgeE(P(u0, vv), P(u1, vv), side > 0 ? w.ub : [-w.ub[0], -w.ub[1]]);
  const faceU = (uu, side, v0, v1) => edgeE(P(uu, v0), P(uu, v1), side > 0 ? w.ua : [-w.ua[0], -w.ua[1]]);
  return { F, P, box, faceV, faceU, sg };
}

// ---------------------------------------------------------------------------------------------------- planning ----
export function planMarina({ fab, DS, piers, col }) {
  const boats = []; const decks = []; const G = geos();
  const MR = { boats, decks, jobs: 0 };
  // ---------------------------------------------------------------- 鹈鹕游艇港 slips ----
  piers.forEach((p, pi) => {
    for (const sz of [-1, 1]) {
      const r = mulb(seedOf(p.x0, p.z, 31 + sz)); const slips = [];
      if (pi === 1 && sz < 0) { // south side of the middle pier faces the causeway berm: side-tied runabouts only
        for (let x = p.x1 - 8; x > p.x0 + 6; x -= 10.5) { if (r() < 0.3) continue; const t = r() < 0.6 ? 0 : 1; const s = 0.9 + r() * 0.15;
          boats.push({ x: x - 3, z: p.z - p.hw - 0.45 - TYPES[t].B * s / 2, yaw: r() < 0.5 ? 0 : Math.PI, type: t, s, tint: pickL(r, TINTS), calm: 0.9 }); }
      } else {
        let x = p.x1 - 2.5;
        while (true) {
          const far = (p.x1 - x) / (p.x1 - p.x0); // 0 at the seawall .. 1 at the pier head
          const u = r(); const t = far > 0.55 ? (u < 0.35 ? 3 : u < 0.6 ? 2 : u < 0.82 ? 4 : 1) : (u < 0.3 ? 0 : u < 0.6 ? 1 : u < 0.85 ? 2 : 4);
          const s = 0.92 + r() * 0.18; const B = TYPES[t].B * s; const wSl = B + 1.6; if (x - wSl < p.x0 + 1.5) break;
          slips.push({ x0: x - wSl, x1: x, t, s, occ: r() < 0.86, bowIn: r() < 0.3, tint: pickL(r, TINTS) }); x -= wSl + 0.9;
        }
        for (const sl of slips) { if (!sl.occ) continue; const Lb = TYPES[sl.t].L * sl.s; const zc = p.z + sz * (p.hw + (sl.bowIn ? 1.1 : 1.9) + Lb / 2);
          const bowZ = sl.bowIn ? -sz : sz; boats.push({ x: (sl.x0 + sl.x1) / 2, z: zc, yaw: bowZ > 0 ? -Math.PI / 2 : Math.PI / 2, type: sl.t, s: sl.s, tint: sl.tint, calm: 1.0 }); }
        // fingers between slips (fixed timber, walkable), length ~ the shorter neighbour
        const edges = []; slips.forEach((sl, i) => { edges.push({ x: sl.x1 + 0.45, L: TYPES[sl.t].L * sl.s }); if (i === slips.length - 1) edges.push({ x: sl.x0 - 0.45, L: TYPES[sl.t].L * sl.s }); });
        for (let i = 0; i < edges.length; i++) { const e = edges[i]; const n = edges[i + 1]; const Lf = Math.min(10, Math.max(5, 0.72 * Math.min(e.L, n ? n.L : e.L)));
          const za = p.z + sz * p.hw, zb = p.z + sz * (p.hw + Lf); decks.push({ x0: e.x - 0.45, x1: e.x + 0.45, z0: Math.min(za, zb), z1: Math.max(za, zb), kind: 'finger', sz, pier: pi }); }
      }
    }
  });
  // fuel dock off the head of the south pier (z = -78): a platform, two pump islands, an attendant kiosk; one boat alongside
  const P0 = piers[0]; const FU = { x0: P0.x0 - 14, x1: P0.x0, z0: P0.z - 8, z1: P0.z + 8 };
  decks.push({ ...FU, kind: 'fuel' });
  boats.push({ x: FU.x0 + 6.5, z: FU.z0 - 0.5 - TYPES[1].B / 2, yaw: Math.PI, type: 1, s: 1.0, tint: [1, 1, 1], calm: 1.0 });
  boats.push({ x: FU.x0 - 0.6 - TYPES[2].B / 2, z: P0.z + 1, yaw: Math.PI / 2, type: 2, s: 0.95, tint: [0.16, 0.22, 0.36], calm: 1.0 });
  col.add(FU.x0 + 4.6, P0.z - 2.2, FU.x0 + 8.4, P0.z + 1.6, 3.4, 'kiosk');
  // a few boats on moorings out in the bay, clear of the causeway and the pearl island
  { const r = mulb(91); for (const [x, z] of [[-128, -46], [-150, -118], [-118, -160], [-176, 72], [-140, 128], [-196, 150], [-110, 196]]) { const t = r() < 0.6 ? 4 : 2;
    boats.push({ x: x + (r() - 0.5) * 8, z: z + (r() - 0.5) * 8, yaw: 2.4 + (r() - 0.5) * 0.6, type: t, s: 0.95 + r() * 0.15, tint: pickL(r, TINTS), calm: 1.3 }); } }
  // ---------------------------------------------------------------- canal-front lots ----
  for (const w of fab.wf || []) {
    if (w.vb === undefined) continue; const r = mulb(w.seed ^ 0x2c1b3c6d);
    w.style = { fence: r() < 0.6 ? 0 : 1, umb: pickL(r, UMB), lanai: r() < 0.7, palms: r() < 0.65 ? (r() < 0.35 ? 2 : 1) : 0, ladderL: r() < 0.5 };
    // palms on the canal side of the back yard (fabric instanced palms, so their far LOD comes for free)
    const L = lotFrame(w);
    for (let k = 0; k < w.style.palms; k++) { const u = (k ? w.u0 + 1.6 : w.u1 - 1.6) + (r() - 0.5) * 0.8, v = w.vb - 1.4 - r() * 1.2; const q = L.P(u, v);
      addPalmRaw(fab, q[0], q[1], 7 + r() * 5, r() * 6.28, (r() - 0.5) * 0.18, (r() - 0.5) * 0.18); col.add(q[0] - 0.3, q[1] - 0.3, q[0] + 0.3, q[1] + 0.3, 6, 'palm'); }
    if (w.boat) { const bl = w.boat.len; const t = bl < 8.3 ? (r() < 0.5 ? 0 : 1) : (r() < 0.16 ? 4 : r() < 0.7 ? 2 : 1); const s = Math.min(1.15, Math.max(0.8, bl / TYPES[t].L));
      const v = w.vb + 2.45 + 0.35 + TYPES[t].B * s / 2; const q = L.P(w.boat.u, v); const ang = Math.atan2(-w.ua[1], w.ua[0]);
      boats.push({ x: q[0], z: q[1], yaw: ang + (r() < 0.5 ? 0 : Math.PI), type: t, s, tint: pickL(r, TINTS), calm: 0.55 }); }
    DS.add(w.x + w.ub[0] * w.vb * 0.5, w.z + w.ub[1] * w.vb * 0.5, Math.max(w.u1 - w.u0, w.vb - w.vf) * 0.7 + 4, job('canalLot', (Wd) => canalLot(Wd, w, G))); MR.jobs++;
  }
  // ---------------------------------------------------------------- marina jobs ----
  piers.forEach((p, pi) => { DS.add((p.x0 + p.x1) / 2, p.z, (p.x1 - p.x0) / 2 + 14, job('marina', (Wd) => pierDetail(Wd, p, pi, decks, G))); MR.jobs++; });
  DS.add((FU.x0 + FU.x1) / 2, P0.z, 14, job('fuelDock', (Wd) => fuelDock(Wd, FU, P0, G))); MR.jobs++;
  // sheltered-water zones for water.js
  setCalm([{ A: [-62, -112], B: [-62, 132], hw: -46 }, ...(fab.canals || []).map((c) => ({ A: c.A, B: c.B, hw: c.hw }))]);
  // walkable decks (fingers + fuel platform) for city.isLand / groundH
  MR.onDeck = (x, z) => { if (x > -18 || x < -110 || z < -110 || z > 130) return false; for (const d of decks) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return true; return false; };
  const fleet = boatFleet(boats); MR.fleet = fleet;
  const VS = villaShells(fab.wf || []); MR.shells = VS;
  MR.attach = (scene) => { if (DS.M) floatMat(DS.M, piers); fleet.attach(scene); VS.attach(scene); };
  MR.update = (cam) => fleet.update(cam);
  return MR;
}

// marina_b: floating-finger material = the shared vcol look + a heave from the boats' swell field, weighted 0 at the fixed pier
// spine and 1 from 2.5 m out (the hinge), and only inside the three piers' x span. World-space buckets, so xz is world.
function floatMat(M, piers) {
  if (M.vcolFloat || !M.vcol) return; const base = M.vcol; const m = base.clone(); const P = piers.map((p) => new THREE.Vector4(p.x0, p.x1, p.z, p.hw));
  m.onBeforeCompile = (s, r) => { base.onBeforeCompile(s, r); s.uniforms.uMarinaTime = U.uTime; s.uniforms.uPier = { value: P };
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
uniform float uMarinaTime; uniform vec4 uPier[${P.length}];` + SWELL + `
float fHinge(vec2 p){ float w = 0.0; for (int i = 0; i < ${P.length}; i++) { vec4 q = uPier[i]; if (p.x > q.x - 2.0 && p.x < q.y + 2.0) w = max(w, clamp((abs(p.y - q.z) - q.w) / 2.5, 0.0, 1.0)); } return w; }`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += mSwell(transformed.xz, uMarinaTime) * fHinge(transformed.xz);'); };
  m.customProgramCacheKey = () => 'vcolFloat'; M.vcolFloat = m;
}
// ---------------------------------------------------------------------------------------------------- pier detail ----
function cleat(bk, x, y, z, along = 'x') { const a = along === 'x'; fbox(bk, frame(x, z, a ? 1 : 0, a ? 0 : 1), -0.17, 0.17, -0.035, 0.035, y, y + 0.09, COL.dkalu); fbox(bk, frame(x, z, a ? 1 : 0, a ? 0 : 1), -0.06, 0.06, -0.05, 0.05, y, y + 0.06, COL.dkalu); }
function pile(bk, G, x, z, top, col = WOOD, cap = true) { put(bk, G.cyl, x, WY - 2.4, z, col, 0.15, top - WY + 2.4, 0.15); if (cap) put(bk, G.cone, x, top, z, [0.92, 0.92, 0.9], 0.17, 0.16, 0.17); }
// dock lamp post: square timber-look post, lantern with a warm (non-neon) practical
function dockLamp(Wd, bk, G, x, z, y) {
  put(bk, G.cyl6, x, y, z, [0.18, 0.19, 0.2], 0.06, 3.0, 0.06); fbox(bk, frame(x, z), -0.12, 0.12, -0.12, 0.12, y, y + 0.35, [0.18, 0.19, 0.2]);
  fbox(bk, frame(x, z), -0.16, 0.16, -0.16, 0.16, y + 3.0, y + 3.06, [0.18, 0.19, 0.2]); fbox(bk, frame(x, z), -0.19, 0.19, -0.19, 0.19, y + 3.42, y + 3.5, [0.18, 0.19, 0.2]);
  put(bk, G.cone, x, y + 3.5, z, [0.18, 0.19, 0.2], 0.24, 0.2, 0.24);
  fbox(Wd.b('neon', x, z), frame(x, z), -0.12, 0.12, -0.12, 0.12, y + 3.06, y + 3.42, [1.0, 0.82, 0.55]);
}
function pedestal(bk, x, y, z) { fbox(bk, frame(x, z), -0.15, 0.15, -0.15, 0.15, y, y + 1.0, [0.9, 0.9, 0.88]); fbox(bk, frame(x, z), -0.18, 0.18, -0.18, 0.18, y + 1.0, y + 1.12, [0.25, 0.42, 0.62]); fbox(bk, frame(x, z), -0.16, 0.16, 0.15, 0.17, y + 0.55, y + 0.8, COL.dkalu); }
function pierDetail(Wd, p, pi, decks, G) {
  const bk = Wd.b('vcol', (p.x0 + p.x1) / 2, p.z); const y = 0.15; const r = mulb(seedOf(p.x0, p.z, 77));
  // fascia / stringer boards on both edges, white pile caps on the r4 piles (every 4 m at ±(hw-0.15))
  for (const sz of [-1, 1]) { fbox(bk, frame(0, 0), p.x0, p.x1, sz > 0 ? p.z + p.hw : p.z - p.hw - 0.07, sz > 0 ? p.z + p.hw + 0.07 : p.z - p.hw, -0.22, y + 0.02, WOODD);
    for (let x = p.x0 + 1; x < p.x1; x += 4) put(bk, G.cone, x, 0.5, p.z + sz * (p.hw - 0.15), [0.92, 0.92, 0.9], 0.17, 0.14, 0.17); }
  fbox(bk, frame(0, 0), p.x0 - 0.07, p.x0, p.z - p.hw, p.z + p.hw, -0.22, y + 0.02, WOODD);
  // fingers: deck, plank seams, outer pile, cleats; a power pedestal where each finger meets the pier
  // marina_b: the fingers FLOAT (bucket vcolFloat: heaves with the boats' swell, hinged at the fixed spine); guide piles stay put
  const fk = Wd.b('vcolFloat', (p.x0 + p.x1) / 2, p.z);
  for (const d of decks) { if (d.kind !== 'finger' || d.pier !== pi) continue; const xc = (d.x0 + d.x1) / 2; const zo = d.sz > 0 ? d.z1 : d.z0, zi = d.sz > 0 ? d.z0 : d.z1;
    fbox(fk, frame(0, 0), d.x0, d.x1, d.z0, d.z1, -0.1, y, WOOD);
    for (let z = d.z0 + 0.45; z < d.z1; z += 0.55) fbox(fk, frame(0, 0), d.x0, d.x1, z - 0.012, z + 0.012, y, y + 0.002, WOODD);
    // float tubs under the deck (grey polyethylene, weed line at the water) + an aluminium edge frame with rub strip
    for (let z = Math.min(zi, zo) + 0.25; z < Math.max(zi, zo) - 0.5; z += 1.25) { fbox(fk, frame(0, 0), d.x0 + 0.04, d.x1 - 0.04, z, z + 1.0, WY - 0.32, WY + 0.06, [0.38, 0.37, 0.33]);
      fbox(fk, frame(0, 0), d.x0 + 0.05, d.x1 - 0.05, z + 0.02, z + 0.98, WY + 0.06, -0.1, [0.62, 0.62, 0.60]); }
    for (const xs of [d.x0 - 0.035, d.x1]) fbox(fk, frame(0, 0), xs, xs + 0.035, d.z0, d.z1, -0.22, y - 0.02, COL.alu);
    fbox(fk, frame(0, 0), d.x0 - 0.06, d.x0 - 0.035, d.z0, d.z1, -0.14, 0.0, COL.rubber); fbox(fk, frame(0, 0), d.x1 + 0.035, d.x1 + 0.06, d.z0, d.z1, -0.14, 0.0, COL.rubber);
    pile(bk, G, xc, zo - d.sz * 0.15, 1.35); pile(bk, G, xc + 0.62, zo - d.sz * 0.15, 1.2, WOODG); pile(bk, G, xc, (zo + zi) / 2, 0.5, WOODD, false);
    { const pz = zo - d.sz * 0.15; for (const s of [-1, 1]) fbox(fk, frame(xc, pz), -0.24, 0.24, s * 0.2, s * 0.2 + s * 0.05, y - 0.25, y + 0.05, COL.dkalu); } // pile hoop
    cleat(fk, xc - 0.32, y, (zo + zi) / 2 + d.sz * 1.2, 'z'); cleat(fk, xc + 0.32, y, zo - d.sz * 0.6, 'z'); cleat(fk, xc - 0.32, y, zo - d.sz * 0.6, 'z');
    pedestal(fk, xc, y, zi + d.sz * 0.45); }
  // lamp posts (alternating edges), dock boxes, a bench + life-ring stand at the head
  let k = 0; for (let x = p.x1 - 6; x > p.x0 + 2; x -= 12, k++) { const sz = k % 2 ? 1 : -1; dockLamp(Wd, bk, G, x, p.z + sz * (p.hw - 0.3), y);
    if (r() < 0.6) { const bz = p.z - sz * (p.hw - 0.45); fbox(bk, frame(x - 3, bz), -0.7, 0.7, -0.3, 0.3, y, y + 0.62, [0.94, 0.94, 0.92]); fbox(bk, frame(x - 3, bz), -0.72, 0.72, -0.32, 0.32, y + 0.62, y + 0.66, [0.84, 0.84, 0.82]); } }
  { const x = p.x0 + 0.9; fbox(bk, frame(x, p.z), -0.25, 0.25, -0.9, 0.9, y, y + 0.42, WOODD); fbox(bk, frame(x, p.z), -0.3, 0.3, -1.0, 1.0, y + 0.42, y + 0.48, WOOD);
    put(bk, G.cyl6, x + 0.6, y, p.z + p.hw - 0.3, [0.85, 0.85, 0.82], 0.04, 1.6, 0.04);
    const ring = new THREE.TorusGeometry(0.32, 0.07, 6, 16); for (let s = 0; s < 4; s++) { const seg = new THREE.TorusGeometry(0.32, 0.075, 6, 4, Math.PI / 2); seg.rotateZ(s * Math.PI / 2); seg.rotateY(Math.PI / 2); bk.geom(seg, new THREE.Matrix4().makeTranslation(x + 0.66, y + 1.25, p.z + p.hw - 0.3), {}, s % 2 ? [0.92, 0.92, 0.9] : [0.86, 0.22, 0.12]); } ring.dispose(); }
  // shore-end gangway gate + sign board on the seawall side
  { const x = p.x1 - 1.2; for (const sz of [-1, 1]) fbox(bk, frame(x, p.z + sz * (p.hw - 0.12)), -0.1, 0.1, -0.1, 0.1, y, y + 2.3, [0.2, 0.21, 0.22]);
    fbox(bk, frame(x, p.z), -0.06, 0.06, -p.hw + 0.1, p.hw - 0.1, y + 2.3, y + 2.42, [0.2, 0.21, 0.22]);
    const E = edgeE([x - 0.07, p.z + 1.2], [x - 0.07, p.z - 1.2], [-1, 0]); signBoard(bk, E, 0.1, 2.3, y + 2.5, 0.55, [0.12, 0.26, 0.44], [0.92, 0.92, 0.9]); }
}
function fuelDock(Wd, FU, P0, G) {
  const bk = Wd.b('vcol', (FU.x0 + FU.x1) / 2, P0.z); const y = 0.15; const f0 = frame(0, 0);
  fbox(bk, f0, FU.x0, FU.x1, FU.z0, FU.z1, -0.12, y, WOOD);
  for (let x = FU.x0 + 0.5; x < FU.x1; x += 0.6) fbox(bk, f0, x - 0.012, x + 0.012, FU.z0, FU.z1, y, y + 0.002, WOODD);
  fbox(bk, f0, FU.x0 - 0.08, FU.x1, FU.z0 - 0.08, FU.z0, -0.3, y + 0.03, [0.15, 0.15, 0.16]); fbox(bk, f0, FU.x0 - 0.08, FU.x1, FU.z1, FU.z1 + 0.08, -0.3, y + 0.03, [0.15, 0.15, 0.16]); fbox(bk, f0, FU.x0 - 0.08, FU.x0, FU.z0, FU.z1, -0.3, y + 0.03, [0.15, 0.15, 0.16]); // rubber fender strip
  for (let x = FU.x0 + 0.3; x < FU.x1; x += 3.4) for (const z of [FU.z0 + 0.2, FU.z1 - 0.2]) pile(bk, G, x, z, 1.1);
  for (let z = FU.z0 + 3.6; z < FU.z1 - 2; z += 3.6) pile(bk, G, FU.x0 + 0.2, z, 1.1);
  for (const [x, z] of [[FU.x0 + 3, FU.z0 + 0.4], [FU.x0 + 10, FU.z0 + 0.4], [FU.x0 + 0.4, P0.z - 3], [FU.x0 + 0.4, P0.z + 4], [FU.x0 + 6, FU.z1 - 0.4]]) cleat(bk, x, y, z);
  // pump islands: cabinet, hose on a reel bracket, nozzle holster, bollards either end
  for (const [px, pz, rot] of [[FU.x0 + 3.2, FU.z0 + 2.0, 0], [FU.x0 + 3.2, FU.z1 - 2.0, Math.PI]]) {
    const F = frame(px, pz, 1, 0); fbox(bk, F, -1.6, 1.6, -0.5, 0.5, y, y + 0.16, [0.7, 0.7, 0.68]);
    fbox(bk, F, -0.45, 0.45, -0.3, 0.3, y + 0.16, y + 1.6, [0.92, 0.92, 0.9]); fbox(bk, F, -0.47, 0.47, -0.32, 0.32, y + 1.6, y + 1.8, [0.72, 0.14, 0.10]);
    const fs = rot ? -1 : 1; fbox(bk, F, -0.3, 0.3, -0.31 * fs - 0.01, -0.31 * fs + 0.01, y + 1.0, y + 1.35, [0.08, 0.1, 0.12]); fbox(bk, F, -0.3, 0.3, -0.31 * fs - 0.01, -0.31 * fs + 0.01, y + 0.5, y + 0.8, [0.72, 0.14, 0.10]);
    for (const s of [-1, 1]) { fbox(bk, F, s * 0.45, s * 0.6, -0.08, 0.08, y + 0.9, y + 1.0, COL.dkalu); put(bk, G.cyl, px + s * 0.62, y + 0.55, pz, COL.rubber, 0.05, 0.5, 0.05); put(bk, G.cyl, px + s * 1.35, y + 0.16, pz, [0.95, 0.75, 0.12], 0.1, 0.8, 0.1); }
  }
  // attendant kiosk: white block, flat slab roof with overhang, door + service window, striped awning, painted sign board
  { const kx0 = FU.x0 + 4.8, kx1 = FU.x0 + 8.2, kz0 = P0.z - 2.0, kz1 = P0.z + 1.4; const F = frame(0, 0);
    fbox(bk, F, kx0, kx1, kz0, kz1, y, y + 2.7, [0.94, 0.94, 0.92]); fbox(bk, F, kx0 - 0.5, kx1 + 0.5, kz0 - 0.5, kz1 + 0.5, y + 2.7, y + 2.9, [0.86, 0.86, 0.84], true);
    const Es = edgeE([kx0, kz0], [kx1, kz0], [0, -1]); door(bk, Es, 0.9, 0.85, 2.05, y, { leaf: [0.3, 0.42, 0.52], frame: COL.dkalu });
    lb(bk, Es, 1.6, 3.1, -0.02, 0.04, y + 1.0, y + 2.1, COL.glass); lb(bk, Es, 1.5, 3.2, -0.02, 0.35, y + 0.95, y + 1.0, COL.alu, true);
    for (let i = 0; i < 6; i++) { const a0 = 1.4 + i * 0.32; lb(bk, Es, a0, a0 + 0.32, 0, 0.9, y + 2.2, y + 2.26, i % 2 ? [0.94, 0.94, 0.92] : [0.12, 0.30, 0.52], true); }
    const Ew = edgeE([kx0, kz1], [kx0, kz0], [-1, 0]); lb(bk, Ew, 0.5, 2.9, -0.02, 0.04, y + 1.1, y + 2.0, COL.glass); signBoard(bk, Ew, 0.3, 3.1, y + 2.95, 0.6, [0.72, 0.14, 0.10], [0.94, 0.94, 0.92]);
    fbox(bk, F, kx1 - 0.4, kx1 + 0.4, kz1 - 1.0, kz1 - 0.2, y + 2.9, y + 3.5, COL.alu); }
  // fuel-price mast (painted boards, no lettering) + spill-kit locker + hose reels
  { const mx = FU.x0 + 12.6, mz = FU.z1 - 0.5; put(bk, G.cyl6, mx, y, mz, [0.2, 0.21, 0.22], 0.08, 4.6, 0.08);
    const E = edgeE([mx - 0.8, mz - 0.1], [mx + 0.8, mz - 0.1], [0, -1]); lb(bk, E, 0, 1.6, -0.05, 0.05, y + 3.0, y + 4.4, [0.72, 0.14, 0.10], true);
    for (let i = 0; i < 3; i++) lb(bk, E, 0.15, 1.45, 0.05, 0.07, y + 3.15 + i * 0.4, y + 3.42 + i * 0.4, [0.95, 0.95, 0.93]);
    fbox(bk, frame(FU.x0 + 11, FU.z0 + 1.2), -0.6, 0.6, -0.4, 0.4, y, y + 0.9, [0.95, 0.75, 0.12]);
    dockLamp(Wd, bk, G, FU.x0 + 0.6, FU.z0 + 0.6, y); dockLamp(Wd, bk, G, FU.x0 + 0.6, FU.z1 - 0.6, y); }
}

// ---------------------------------------------------------------------------------------------------- canal lot ----
function canalLot(Wd, w, G) {
  const L = lotFrame(w); const bk = Wd.b('vcol', w.x, w.z); const gl = Wd.b('glassRail', w.x, w.z); const r = mulb(w.seed ^ 0x51ed27); const S = w.style;
  const hw = w.hw / 2, hd = w.hd / 2, H = w.h, vb = w.vb;
  // ---- private dock on piles: deck, seams, fascia, piles with caps, cleats, ladder, dock box
  { const dw = w.dockW / 2, v0 = vb - 0.35, v1 = vb + 2.42; const y1 = 0.37;
    L.box(bk, -dw, dw, v0, v1, 0.17, y1, WOODG); for (let u = -dw + 0.5; u < dw - 0.2; u += 0.5) L.box(bk, u - 0.012, u + 0.012, v0, v1, y1, y1 + 0.002, WOODD);
    L.box(bk, -dw - 0.05, dw + 0.05, v1, v1 + 0.06, 0.02, y1 + 0.01, WOODD);
    const n = Math.max(2, Math.round(dw * 2 / 2.6)); for (let i = 0; i <= n; i++) { const u = -dw + 0.15 + (2 * dw - 0.3) * i / n; const q = L.P(u, v1 - 0.12); pile(bk, G, q[0], q[1], i === 0 || i === n ? 0.95 : 0.6, WOODG, i === 0 || i === n); }
    for (const u of [-dw * 0.55, dw * 0.55]) { const q = L.P(u, v1 - 0.25); fbox(bk, frame(q[0], q[1], w.ua[0], w.ua[1]), -0.17, 0.17, -0.035, 0.035, y1, y1 + 0.09, COL.dkalu); }
    { const u = S.ladderL ? -dw + 0.7 : dw - 0.7; for (const s of [-0.22, 0.22]) { const a = L.P(u + s, v1 + 0.08); put(bk, G.cyl6, a[0], WY - 1.2, a[1], COL.steel, 0.025, y1 + 0.9 - WY + 1.2, 0.025); }
      for (let yy = WY - 0.8; yy < y1; yy += 0.3) L.box(bk, u - 0.22, u + 0.22, v1 + 0.06, v1 + 0.1, yy, yy + 0.03, COL.steel); }
    if (r() < 0.5) { const u = (S.ladderL ? 1 : -1) * (dw - 1.1); L.box(bk, u - 0.75, u + 0.75, vb + 0.4, vb + 1.0, y1, y1 + 0.6, [0.94, 0.94, 0.92]); L.box(bk, u - 0.77, u + 0.77, vb + 0.38, vb + 1.02, y1 + 0.6, y1 + 0.64, [0.84, 0.84, 0.82]); }
    if (!w.boat && r() < 0.5) { // boat lift without a boat: four piles + cradle beams + motor box
      for (const u of [-1.6, 1.6]) for (const v of [v1 + 0.6, v1 + 3.6]) { const q = L.P(u + (dw > 3 ? 0 : 0), v); pile(bk, G, q[0], q[1], 1.6, WOODG); }
      for (const v of [v1 + 0.6, v1 + 3.6]) L.box(bk, -1.75, 1.75, v - 0.1, v + 0.1, 1.45, 1.6, COL.alu);
      for (const u of [-1.0, 1.0]) L.box(bk, u - 0.08, u + 0.08, v1 + 0.6, v1 + 3.6, WY + 0.25, WY + 0.4, COL.alu);
      L.box(bk, -1.95, -1.6, v1 + 0.4, v1 + 0.8, 1.6, 1.95, COL.alu); }
  }
  // ---- side fence on the u1 lot line (black aluminium pickets or white vinyl), from the house front to the seawall
  { const ua = w.u1 - 0.12; const v0 = -hd + 0.5, v1 = vb - 0.45; const blk = S.fence === 0; const c = blk ? [0.1, 0.1, 0.11] : [0.93, 0.93, 0.91]; const h = blk ? 1.22 : 1.3;
    const E = L.faceU(ua, 1, v0, v1);
    for (let a = 0; a <= E.len; a += 2.4) lb(bk, E, a - 0.05, a + 0.05, -0.05, 0.05, 0, h + 0.08, c);
    for (const yy of blk ? [0.12, h - 0.06] : [0.1, h - 0.12]) lb(bk, E, 0, E.len, -0.025, 0.025, yy, yy + 0.06, c, true);
    if (blk) for (let a = 0.12; a < E.len; a += 0.13) { const p0 = E.P(a, 0), p1 = E.P(a + 0.022, 0); bk.quad(new THREE.Vector3(p0[0], 0.04, p0[1]), new THREE.Vector3(p1[0], 0.04, p1[1]), new THREE.Vector3(p1[0], h, p1[1]), new THREE.Vector3(p0[0], h, p0[1]), [0, 0, 1, 0, 1, 1, 0, 1], {}, c);
      bk.quad(new THREE.Vector3(p1[0], 0.04, p1[1]), new THREE.Vector3(p0[0], 0.04, p0[1]), new THREE.Vector3(p0[0], h, p0[1]), new THREE.Vector3(p1[0], h, p1[1]), [0, 0, 1, 0, 1, 1, 0, 1], {}, c); }
    else for (let a = 0.1; a < E.len - 0.1; a += 0.21) lb(bk, E, a, a + 0.16, -0.012, 0.012, 0.16, h - 0.02, c); }
  // ---- pool: coping ring, two loungers, umbrella, chrome ladder
  if (w.pool) { const { u, v, w: pw, d: pd } = w.pool; const cw = 0.38, y0 = 0.025, y1 = 0.09; const cc = [0.88, 0.85, 0.78];
    L.box(bk, u - pw / 2 - cw, u + pw / 2 + cw, v - pd / 2 - cw, v - pd / 2, y0, y1, cc); L.box(bk, u - pw / 2 - cw, u + pw / 2 + cw, v + pd / 2, v + pd / 2 + cw, y0, y1, cc);
    L.box(bk, u - pw / 2 - cw, u - pw / 2, v - pd / 2, v + pd / 2, y0, y1, cc); L.box(bk, u + pw / 2, u + pw / 2 + cw, v - pd / 2, v + pd / 2, y0, y1, cc);
    L.box(bk, u - pw / 2, u - pw / 2 + 1.1, v - pd / 2, v + pd / 2, 0.034, 0.036, [0.55, 0.85, 0.88]); // shallow-step ledge
    for (const s of [-0.18, 0.18]) { const a = L.P(u + pw / 2 - 0.6 + s, v - pd / 2 + 0.1), b = L.P(u + pw / 2 - 0.6 + s, v - pd / 2 - 0.35); put(bk, G.cyl6, a[0], -0.4, a[1], COL.steel, 0.02, 1.25, 0.02); put(bk, G.cyl6, b[0], y1, b[1], COL.steel, 0.02, 0.75, 0.02); L.box(bk, u + pw / 2 - 0.6 + s - 0.02, u + pw / 2 - 0.6 + s + 0.02, v - pd / 2 - 0.35, v - pd / 2 + 0.1, 0.82, 0.86, COL.steel); }
    const lv = v - pd / 2 - cw - 1.1; for (let k = 0; k < 2; k++) { const lu = u - 1.2 + k * 1.1; L.box(bk, lu - 0.3, lu + 0.3, lv - 0.95, lv + 0.95, 0.06, 0.32, [0.92, 0.92, 0.9]); L.box(bk, lu - 0.28, lu + 0.28, lv - 0.95, lv + 0.4, 0.32, 0.4, S.umb);
      const E = L.faceV(lv + 0.4, 1, lu - 0.28, lu + 0.28); for (let s = 0; s < 4; s++) lb(bk, E, 0, 0.56, 0.12 * s, 0.12 * s + 0.12, 0.4 + 0.13 * s, 0.48 + 0.13 * s, S.umb); }
    { const q = L.P(u + 1.4, lv); put(bk, G.cyl6, q[0], 0, q[1], [0.9, 0.9, 0.88], 0.03, 2.3, 0.03); put(bk, G.cone, q[0], 2.0, q[1], S.umb, 1.35, 0.42, 1.35); put(bk, G.cyl, q[0], 0, q[1], [0.3, 0.3, 0.3], 0.25, 0.08, 0.25); } }
  // ---- house trim
  const ws = w.wall; const white = [0.95, 0.95, 0.93];
  if (w.flat) { // modern villa: thin roof slab overhanging all round (deep over the canal terrace), glass wall + balcony on the canal side
    const back = S.lanai ? 3.2 : 1.4;
    // marina_b: roof slab, canal glass wall, balcony slab and the upper street glass band are villafar.js shells (all distances)
    const Eb = L.faceV(hd, 1, -hw, hw); const fl = w.two ? [[0.08, 2.75], [3.25, H - 0.4]] : [[0.08, H - 0.45]];
    for (const [y0, y1] of fl) { for (let a = 0.5; a <= Eb.len - 0.45; a += 1.7) lb(bk, Eb, a - 0.04, a + 0.04, -0.02, 0.09, y0, y1, COL.dkalu);
      lb(bk, Eb, 0.45, Eb.len - 0.45, -0.02, 0.1, y0 - 0.05, y0 + 0.02, COL.dkalu); lb(bk, Eb, 0.45, Eb.len - 0.45, -0.02, 0.1, y1, y1 + 0.07, COL.dkalu); }
    if (w.two) { lb(gl, Eb, 0.35, Eb.len - 0.35, 1.62, 1.68, 3.05, 4.05, [1, 1, 1]); lb(bk, Eb, 0.32, Eb.len - 0.32, 1.6, 1.7, 4.05, 4.1, COL.steel, true);
      for (const a of [0.35, Eb.len - 0.35]) lb(gl, Eb, a - 0.03, a + 0.03, 0.1, 1.65, 3.05, 4.05, [1, 1, 1]); }
    if (S.lanai) for (const u of [-hw + 0.3, hw - 0.3]) { const q = L.P(u, hd + back - 0.25); put(bk, G.cyl6, q[0], 0, q[1], COL.dkalu, 0.07, H, 0.07); }
    // front: entry recess with a timber-slat feature wall, tall pivot door, slab canopy
    const Ef = L.faceV(-hd, -1, hw, -hw); const da = Ef.len * 0.32; lb(bk, Ef, da - 1.3, da + 1.3, -0.02, 0.08, 0, H - 0.4, [0.45, 0.32, 0.2]);
    for (let a = da - 1.25; a < da + 1.25; a += 0.12) lb(bk, Ef, a, a + 0.06, 0.08, 0.12, 0.1, H - 0.5, [0.38, 0.27, 0.17]);
    door(bk, Ef, da + 2.2, 1.2, 2.5, 0.0, { leaf: [0.2, 0.15, 0.11], frame: COL.dkalu, steps: 1 });
    lb(bk, Ef, da + 1.3, da + 3.1, -0.02, 1.4, 2.9, 3.05, white, true);
    if (w.two) { lb(bk, Ef, Ef.len * 0.55 - 0.08, Ef.len - 0.52, -0.02, 0.5, 5.1, 5.2, white, true); }
  } else { // bungalow: eave gutters, screened-lanai frame + flat roof on the canal side, porch with columns at the door
    const Ef = L.faceV(-hd, -1, hw, -hw), Eb = L.faceV(hd, 1, -hw, hw);
    for (const E of [Ef, Eb]) { lb(bk, E, -0.45, E.len + 0.45, 0.32, 0.5, H - 0.16, H - 0.02, [0.92, 0.92, 0.9], true); }
    for (const u of [-hw - 0.4, hw + 0.4]) { const q = L.P(u, -hd - 0.4); put(bk, G.cyl6, q[0], 0, q[1], [0.92, 0.92, 0.9], 0.04, H - 0.1, 0.04); }
    if (S.lanai) { const d = 3.4, frameC = r() < 0.5 ? [0.92, 0.92, 0.9] : [0.28, 0.22, 0.17]; const y1 = Math.min(2.7, H - 0.35);
      L.box(bk, -hw + 0.6, hw - 0.6, hd, hd + d, y1, y1 + 0.16, [0.88, 0.87, 0.84], true);
      const n = Math.max(2, Math.round((2 * hw - 1.2) / 2.2)); for (let i = 0; i <= n; i++) { const u = -hw + 0.7 + (2 * hw - 1.4) * i / n; L.box(bk, u - 0.05, u + 0.05, hd + d - 0.1, hd + d, 0, y1, frameC); }
      for (const u of [-hw + 0.65, hw - 0.75]) L.box(bk, u, u + 0.1, hd, hd + d, 0, y1, frameC);
      L.box(bk, -hw + 0.6, hw - 0.6, hd + d - 0.12, hd + d + 0.02, 0, 0.55, [0.86, 0.84, 0.8]); L.box(bk, -hw + 0.6, hw - 0.6, hd + d - 0.1, hd + d, y1 - 0.12, y1, frameC);
      L.box(bk, -hw + 0.6, hw - 0.6, hd, hd + d, 0.0, 0.08, [0.80, 0.76, 0.68]);
      lb(bk, Eb, 1.2, Math.min(Eb.len - 1.2, 5.0), -0.02, 0.05, 0.05, 2.2, COL.glass); }
    const da = Ef.len * 0.55; door(bk, Ef, da, 0.95, 2.1, 0.0, { leaf: [0.85, 0.83, 0.78], frame: [0.92, 0.92, 0.9], steps: 2 });
    lb(bk, Ef, da - 1.4, da + 1.4, -0.02, 1.6, 2.55, 2.7, [0.9, 0.9, 0.88], true); for (const s of [-1.25, 1.25]) lb(bk, Ef, da + s - 0.1, da + s + 0.1, 1.3, 1.5, 0, 2.55, [0.94, 0.94, 0.92]);
    // window frames + shutters on the street side
    for (const a of [1.6, Ef.len - 1.8]) { if (Math.abs(a - da) < 2.2) continue; lb(bk, Ef, a - 0.7, a + 0.7, -0.02, 0.12, 0.88, 0.95, [0.95, 0.95, 0.93], true);
      const sc = pickL(r, [[0.2, 0.36, 0.42], [0.92, 0.92, 0.9], [0.32, 0.4, 0.26], [0.22, 0.25, 0.3]]); for (const s of [-1, 1]) lb(bk, Ef, a + s * 0.68 - 0.24, a + s * 0.68 + 0.24, -0.02, 0.07, 0.92, 2.2, sc); }
  }
  // garage door on the driveway side of the street façade (both styles), AC condenser on a pad at the side
  { const Ef = L.faceV(-hd, -1, hw, -hw); const a = hw - (w.drive || 0); if (a > 1.8 && a < Ef.len - 1.8 && !(w.flat && Math.abs(a - Ef.len * 0.32) < 3.2)) { lb(bk, Ef, a - 1.35, a + 1.35, -0.02, 0.05, 0, 2.2, [0.9, 0.9, 0.88]); for (let k = 1; k < 4; k++) lb(bk, Ef, a - 1.35, a + 1.35, 0.05, 0.065, k * 0.55 - 0.02, k * 0.55 + 0.01, [0.75, 0.75, 0.73]); } }
  { const su = r() < 0.5 ? -1 : 1; const u = su * (hw + 0.75), v = hd - 2.2; L.box(bk, u - 0.6, u + 0.6, v - 0.6, v + 0.6, 0, 0.08, [0.7, 0.7, 0.68]); L.box(bk, u - 0.45, u + 0.45, v - 0.45, v + 0.45, 0.08, 0.95, [0.82, 0.82, 0.8]);
    const q = L.P(u, v); put(bk, G.fan, q[0], 0.95, q[1], COL.rubber, 0.36, 0.03, 0.36); }
  void ws;
}
