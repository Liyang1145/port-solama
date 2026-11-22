// r6.x b_palmloop (map 霓港 only): pedestrian walking lanes for the Deco block loops.
// The loop rectangle used to sit 2.2 m in from the kerb, which is exactly the street-palm / street-tree line (2.6 / 2.7 m),
// so walkers kept shouldering through trunks and stalling against poles. Here every loop gets a lateral profile: the lane
// keeps to the clear strip between the kerb furniture (lamps 0.8 m, utility poles 0.45 m, sign posts 0.55 m) and the palm /
// tree pits, and steps around the few things standing in that strip (corner news boxes, bus shelters, benches, bins).
// Also adds thin colliders for the sidewalk props of this map that had none (hydrants, corner bins, bollards, meters).
// Pure planning: no geometry, no materials, no rng.
import { LAYOUT } from './city.js';

const STEP = 0.5;   // profile sample spacing along the loop perimeter (m)
const DS = 0.05;    // lateral state spacing (m)
const R = 0.35;     // walker body radius (same as Pedestrians.update resolve)
const SKIP = new Set(['shop', 'trim', 'gap', 'alley']); // streamed / soft or not on the kerb strip

const bdist = (b, x, z) => {
  if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
  return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
};

// thin boxes for this map's sidewalk props that were drawn without a collider (positions mirror props.js / street.js)
export function addPropCols(city) {
  if (city._propCols) return city._propCols; const RH = LAYOUT.roadHW; const col = city.col; const st = city._propCols = { hyd: 0, bin: 0, bollard: 0, meter: 0 };
  const onWalk = (x, z) => city.groundH(x, z) > 0.1 && city.blockAt && city.blockAt(x, z);
  const occ = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
  for (const it of city.inters) {
    if (it.x >= -160) { // props.js buildFurniture: hydrant + bin on two island corners
      const hx = it.x + 7 + 1.0, hz = it.z + 7 + 2.5, bx = it.x - 7 - 1.0, bz = it.z - 7 - 3.0;
      if (onWalk(hx, hz)) { col.add(hx - 0.2, hz - 0.2, hx + 0.2, hz + 0.2, 0.9, 'hyd'); st.hyd++; }
      if (onWalk(bx, bz)) { col.add(bx - 0.31, bz - 0.31, bx + 0.31, bz + 0.31, 1.05, 'bin'); st.bin++; }
    }
    const tx = it.x + (RH + 1.2), tz = it.z - (RH + 3.2); // street.js corner litter bin
    if (!occ(tx, tz, 1.0) && onWalk(tx, tz)) { col.add(tx - 0.32, tz - 0.32, tx + 0.32, tz + 0.32, 1.15, 'bin'); st.bin++; }
  }
  st.tree = 0; for (const t of city.trees) { // pocket-park / plaza trees were drawn without a trunk collider (street trees have one)
    if (col.query(t.x, t.z, 0.5, []).some((b) => b.tag === 'tree' && t.x >= b.minX && t.x <= b.maxX && t.z >= b.minZ && t.z <= b.maxZ)) continue;
    const r = 0.28 * (t.s || 1); col.add(t.x - r, t.z - r, t.x + r, t.z + r, 6, 'tree'); st.tree++; }
  for (const z of LAYOUT.islandEW) for (let k = -3; k <= 3; k++) { if (Math.abs(k) < 1) continue; const x = 299.4, zz = z + k * 1.6; // promenade bollards
    if (onWalk(x, zz)) { col.add(x - 0.13, zz - 0.13, x + 0.13, zz + 0.13, 0.9, 'bollard'); st.bollard++; } }
  for (const s of city.segs) { if (!(s.axis === 'z' && s.c === 290)) continue; // beachfront parking meters
    for (let z = s.a0 + 13.4; z < s.a1 - 10; z += 6.8) { const x = 282.3; if (occ(x, z, 0.8)) continue; col.add(x - 0.11, z - 0.11, x + 0.11, z + 0.11, 1.5, 'meter'); st.meter++; } }
  return st;
}

// lane of one block loop: base rectangle (inset `base` from the kerb) + per-sample inset profile
export function pedLoop(city, b) {
  if (b._lane) return b._lane;
  const prom = b.area === 'promenade';
  const base = prom ? 3.0 : 1.7; const lo = 1.2, hi = prom ? 7.0 : 3.6; const soft = prom ? 99 : 2.05;
  const x0 = b.x0 + base, z0 = b.z0 + base, x1 = b.x1 - base, z1 = b.z1 - base;
  if (x1 <= x0 + 2 || z1 <= z0 + 2) return (b._lane = { x0, z0, x1, z1, per: 2 * (x1 - x0 + z1 - z0), base, prof: null });
  const w = x1 - x0, h = z1 - z0, per = 2 * (w + h); const n = Math.ceil(per / STEP); const S = Math.round((hi - lo) / DS) + 1;
  const col = city.col; const tmp = []; const near = new Set();
  const cost = new Float32Array(n * S);
  const cornerD = (u) => { const c = [0, w, w + h, 2 * w + h, per]; let m = 1e9; for (const q of c) m = Math.min(m, Math.abs(u - q)); return m; };
  for (let i = 0; i < n; i++) {
    const u = i * STEP; const q = loopBase(x0, z0, x1, z1, u); // q.nx/nz: inward normal, q.t / q.len: along the side
    near.clear();
    for (let d = lo; d <= hi + 0.01; d += 1.4) { const off = d - base; for (const bb of col.query(q.x + q.nx * off, q.z + q.nz * off, 2.0, tmp)) if (bb.h >= 0.5 && !SKIP.has(bb.tag)) near.add(bb); }
    const cd = cornerD(u); const dx = q.nz, dz = -q.nx; // side direction
    for (let k = 0; k < S; k++) {
      const ins = lo + k * DS; const off = ins - base; const sh = off + q.t * (q.len - 2 * off) / q.len - q.t; // lanePoint corner remap (offset ≈ constant)
      const px = q.x + q.nx * off + dx * sh, pz = q.z + q.nz * off + dz * sh;
      let c = 9; for (const bb of near) { const e = bdist(bb, px, pz) - R; if (e < c) c = e; }
      let v = Math.abs(ins - base) * 0.6;                    // keep to the clear strip by default
      if (c < 0) v += 60 + 120 * -c; else if (c < 0.15) v += 6 * (0.15 - c); // collision / brushing
      if (ins > soft) v += 4 * (ins - soft);                 // beyond the tree pits: shop terraces
      if (cd < 1.5) v += 1.5 * Math.abs(ins - base);         // corners: mild pull to the base rectangle
      cost[i * S + k] = v;
    }
  }
  // dynamic programming along the perimeter: lateral slope limited to 0.35 m per 0.5 m sample. The cost above takes the
  // corner remap of lanePoint as if the offset were constant, so the chosen lane is then walked for real and any sample
  // still brushing something gets its state (± 0.1 m) penalised and the solve repeated (≤ 8 rounds).
  const J = Math.round(0.35 / DS); const acc = new Float32Array(n * S); const from = new Int16Array(n * S); const pick = new Int16Array(n);
  const prof = new Float32Array(n + 1); const L = { x0, z0, x1, z1, per, base, prof };
  const clear = (x, z) => { let c = 9; for (const bb of col.query(x, z, 1.4, tmp)) { if (bb.h < 0.5 || SKIP.has(bb.tag)) continue; const e = bdist(bb, x, z) - R; if (e < c) c = e; } return c; };
  for (let round = 0; round < 9; round++) {
    for (let k = 0; k < S; k++) acc[k] = cost[k];
    for (let i = 1; i < n; i++) for (let k = 0; k < S; k++) {
      let best = 1e30, bk = k; for (let j = Math.max(0, k - J); j <= Math.min(S - 1, k + J); j++) { const v = acc[(i - 1) * S + j] + Math.abs(j - k) * 0.02; if (v < best) { best = v; bk = j; } }
      acc[i * S + k] = best + cost[i * S + k]; from[i * S + k] = bk;
    }
    let bk = 0, bv = 1e30; for (let k = 0; k < S; k++) if (acc[(n - 1) * S + k] < bv) { bv = acc[(n - 1) * S + k]; bk = k; }
    for (let i = n - 1; i >= 0; i--) { pick[i] = bk; prof[i] = lo + bk * DS - base; bk = from[i * S + bk]; }
    prof[n] = prof[0]; if (round === 8) break;
    let bad = 0; for (let i = 0; i < n; i++) { const q = lanePoint(L, i * STEP); if (clear(q.x, q.z) < 0.05) { bad++; for (let k = Math.max(0, pick[i] - 3); k <= Math.min(S - 1, pick[i] + 3); k++) cost[i * S + k] += 80; } }
    L.rounds = round + 1; if (!bad) break;
  }
  return (b._lane = L);

}

function loopBase(x0, z0, x1, z1, u) {
  const w = x1 - x0, h = z1 - z0; const per = 2 * (w + h); u = ((u % per) + per) % per;
  if (u < w) return { x: x0 + u, z: z0, nx: 0, nz: 1, t: u, len: w }; u -= w;
  if (u < h) return { x: x1, z: z0 + u, nx: -1, nz: 0, t: u, len: h }; u -= h;
  if (u < w) return { x: x1 - u, z: z1, nx: 0, nz: -1, t: u, len: w }; u -= w;
  return { x: x0, z: z1 - u, nx: 1, nz: 0, t: u, len: h };
}

// point on a lane (prof: lateral offset from the base rectangle, + = inward / away from the kerb). Along each side the
// parameter is remapped so the side ends exactly on the corner of the offset rectangle: the lane stays continuous round
// corners whatever the offsets there (no snap when a walker turns the corner).
export function lanePoint(L, u) {
  if (!L.prof) return loopBase(L.x0, L.z0, L.x1, L.z1, u);
  const w = L.x1 - L.x0, h = L.z1 - L.z0, per = L.per; u = ((u % per) + per) % per;
  const off = (v) => { const f = v / STEP; const i = Math.min(L.prof.length - 2, Math.max(0, Math.floor(f))); const t = f - i; return L.prof[i] * (1 - t) + L.prof[i + 1] * t; };
  const cu = [0, w, w + h, 2 * w + h, per]; let k = 0; while (k < 3 && u >= cu[k + 1]) k++;
  const len = cu[k + 1] - cu[k]; const a = off(cu[k]), b = off(cu[k + 1]); const t = a + (u - cu[k]) * (len - a - b) / len;
  const C = [[L.x0, L.z0, 1, 0, 0, 1], [L.x1, L.z0, 0, 1, -1, 0], [L.x1, L.z1, -1, 0, 0, -1], [L.x0, L.z1, 0, -1, 1, 0]][k];
  const o = off(u); return { x: C[0] + C[2] * t + C[4] * o, z: C[1] + C[3] * t + C[5] * o, nx: C[4], nz: C[5] };
}
