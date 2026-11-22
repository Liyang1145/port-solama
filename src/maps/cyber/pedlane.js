// r6.x b_palmloop (map 霓港 only): pedestrian walking lanes for the Deco block loops.
// The loop rectangle used to sit 2.2 m in from the kerb, which is exactly the street-palm / street-tree line (2.6 / 2.7 m),
// so walkers kept shouldering through trunks and stalling against poles. Here every loop gets a lateral profile: the lane
// keeps to the clear strip between the kerb furniture (lamps 0.8 m, utility poles 0.45 m, sign posts 0.55 m) and the palm /
// tree pits, and steps around the few things standing in that strip (corner news boxes, bus shelters, benches, bins).
// Also adds thin colliders for the sidewalk props of this map that had none (hydrants, corner bins, bollards, meters).
// Pure planning: no geometry, no materials, no rng.
import { LAYOUT } from './city.js';
import { pointAt } from './roadgraph.js';

const STEP = 0.5;   // profile sample spacing along the loop perimeter (m)
const DS = 0.05;    // lateral state spacing (m)
const R = 0.35;     // walker body radius (same as Pedestrians.update resolve)
const SKIP = new Set(['shop', 'trim', 'gap', 'alley']); // streamed / soft or not on the kerb strip

const bdist = (b, x, z) => {
  if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
  return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
};

// thin boxes for this map's sidewalk props that were drawn without a collider (positions mirror props.js / street.js)
export function addPropCols(city, sp = true) {
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
    if (sp || onWalk(x, zz)) { col.add(x - 0.13, zz - 0.13, x + 0.13, zz + 0.13, 0.9, 'bollard'); st.bollard++; } }
  for (const s of city.segs) { if (!(s.axis === 'z' && s.c === 290)) continue; // beachfront parking meters
    for (let z = s.a0 + 13.4; z < s.a1 - 10; z += 6.8) { const x = 282.3; if (occ(x, z, 0.8)) continue; col.add(x - 0.11, z - 0.11, x + 0.11, z + 0.11, 1.5, 'meter'); st.meter++; } }
  return st;
}

// ---- lane solver (shared by the Deco block loops and the road-graph sidewalk paths) ----
// n samples along the route × S lateral states. fill(i, cost) writes the S costs of sample i; check(i) -> clearance of the
// chosen lane at sample i (only the loops need it: their lane point is remapped at the corners). Written as a generator
// that yields every few samples / DP rows, so the work can be spread over frames (pedWarm) or run straight through (finish).
function* solveJob(n, S, fill, prof, lo, base, check, L) {
  const cost = new Float32Array(n * S); L._ph = 'fill';
  for (let i = 0; i < n; i++) { fill(i, cost); if (i & 1) yield; }
  const J = Math.round(0.35 / DS); const acc = new Float32Array(n * S); const from = new Int16Array(n * S); const pick = new Int16Array(n);
  for (let round = 0; round < 9; round++) { L._ph = 'dp' + round;
    for (let k = 0; k < S; k++) acc[k] = cost[k];
    for (let i = 1; i < n; i++) { for (let k = 0; k < S; k++) {
      let best = 1e30, bk = k; for (let j = Math.max(0, k - J); j <= Math.min(S - 1, k + J); j++) { const v = acc[(i - 1) * S + j] + Math.abs(j - k) * 0.02; if (v < best) { best = v; bk = j; } }
      acc[i * S + k] = best + cost[i * S + k]; from[i * S + k] = bk; } if ((i & 15) === 15) yield; }
    let bk = 0, bv = 1e30; for (let k = 0; k < S; k++) if (acc[(n - 1) * S + k] < bv) { bv = acc[(n - 1) * S + k]; bk = k; }
    for (let i = n - 1; i >= 0; i--) { pick[i] = bk; prof[i] = lo + bk * DS - base; bk = from[i * S + bk]; }
    if (prof.length > n) prof[n] = L.closed ? prof[0] : prof[n - 1];
    if (round === 8 || !check) break;
    L._ph = 'chk'; let bad = 0; for (let i = 0; i < n; i++) { if (check(i) < 0.05) { bad++; for (let k = Math.max(0, pick[i] - 3); k <= Math.min(S - 1, pick[i] + 3); k++) cost[i * S + k] += 80; } if ((i & 15) === 15) yield; }
    L.rounds = round + 1; if (!bad) break;
  }
}

// clearance of a walker (radius R) at (x, z) from the static colliders a lane plans around
function clearAt(col, x, z, tmp) { let c = 9; for (const bb of col.query(x, z, 1.4, tmp)) { if (bb.h < 0.5 || SKIP.has(bb.tag)) continue; const e = bdist(bb, x, z) - R; if (e < c) c = e; } return c; }

// run a lane job to the end now (synchronous fallback); stats: city._pedStats
function finish(city, o, mk) {
  if (o._lane) return o._lane; const t0 = performance.now(); if (!o._job) o._job = mk();
  while (!o._job.it.next().done); o._lane = o._job.L; o._job = null; const st = pedStats(city); const ms = performance.now() - t0;
  st.syncN++; st.syncMs += ms; if (ms > st.syncMax) st.syncMax = ms; if (!st.frames) { st.loadN++; st.loadMs += ms; } return o._lane;
}
export function pedStats(city) { return city._pedStats || (city._pedStats = { syncN: 0, syncMs: 0, syncMax: 0, loadN: 0, loadMs: 0, warmN: 0, warmMs: 0, warmMaxFrame: 0, chunkMax: 0, slow: [], frames: 0 }); }

// lane of one block loop: base rectangle (inset `base` from the kerb) + per-sample inset profile
function loopJob(city, b) {
  const prom = b.area === 'promenade';
  const base = prom ? 3.0 : 1.7; const lo = 1.2, hi = prom ? 7.0 : 3.6; const soft = prom ? 99 : 2.05;
  const x0 = b.x0 + base, z0 = b.z0 + base, x1 = b.x1 - base, z1 = b.z1 - base;
  if (x1 <= x0 + 2 || z1 <= z0 + 2) { const L = { x0, z0, x1, z1, per: 2 * (x1 - x0 + z1 - z0), base, prof: null }; return { L, it: [].values() }; }
  const w = x1 - x0, h = z1 - z0, per = 2 * (w + h); const n = Math.ceil(per / STEP); const S = Math.round((hi - lo) / DS) + 1;
  const col = city.col; const tmp = []; const near = new Set();
  const cornerD = (u) => { const c = [0, w, w + h, 2 * w + h, per]; let m = 1e9; for (const q of c) m = Math.min(m, Math.abs(u - q)); return m; };
  const fill = (i, cost) => {
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
  };
  // the cost above takes the corner remap of lanePoint as if the offset were constant, so the chosen lane is then walked for
  // real and any sample still brushing something gets its state (± 0.1 m) penalised and the solve repeated (≤ 8 rounds).
  const prof = new Float32Array(n + 1); const L = { x0, z0, x1, z1, per, base, prof, closed: true };
  const check = (i) => { const q = lanePoint(L, i * STEP); return clearAt(col, q.x, q.z, tmp); };
  return { L, it: solveJob(n, S, fill, prof, lo, base, check, L) };
}
export function pedLoop(city, b) { return finish(city, b, () => loopJob(city, b)); }

// ---- b_streetpeds: road-graph sidewalk paths (people.js this.paths: one polyline per edge side, built hw + 0.55·sw out,
// which is the street-palm line, hw + 0.58·sw). The lane keeps the path's own parameter u (so spawning / turning / rng stay as
// they were) and re-plans the lateral position: centre line point at the path's arc position + smoothed normal × (hw + inset),
// inset chosen per 0.5 m like the loops (clear strip between the kerb lamps 0.8 m and the palm pits, around the pits where
// the strip is too narrow, e.g. residential 3 m sidewalks). Lane points are tabulated every 0.5 m and interpolated.
function pathJob(city, path) {
  const e = path.e, sg = path.sg, sw = e.sw, hw = e.hw; const ss = path.ss; const sA = ss[0], sB = ss[ss.length - 1];
  const n = Math.max(2, Math.ceil((sB - sA) / STEP) + 1); const lo = -0.45, hi = Math.max(1.05, sw - 0.45); const base = Math.min(hi, Math.max(0.55, sw * 0.36));
  // lo < 0: a step down into the gutter (cost 40 + distance) only where the sidewalk itself is shut (kerb pole next to an oversized building box)
  const S = Math.round((hi - lo) / DS) + 1; const col = city.col; const tmp = []; const near = new Set();
  const cx = new Float32Array(n), cz = new Float32Array(n), nx = new Float32Array(n), nz = new Float32Array(n); const P = {}, Q = {}; const off = new Uint8Array((S + 3) >> 2);
  const fill = (i, cost) => {
    near.clear(); for (let d = lo; d <= hi + 0.01; d += 1.4) { const o = hw + d; for (const bb of col.query(cx[i] + nx[i] * o, cz[i] + nz[i] * o, 2.0, tmp)) if (bb.h >= 0.5 && !SKIP.has(bb.tag)) near.add(bb); }
    for (let j = 0; j < off.length; j++) { const o = hw + lo + j * 4 * DS; off[j] = city.groundH(cx[i] + nx[i] * o, cz[i] + nz[i] * o) > 0.1 ? 0 : 1; }
    for (let k = 0; k < S; k++) {
      const ins = lo + k * DS; const o = hw + ins; const px = cx[i] + nx[i] * o, pz = cz[i] + nz[i] * o;
      let c = 9; for (const bb of near) { const q = bdist(bb, px, pz) - R; if (q < c) c = q; }
      let v = Math.abs(ins - base) * 0.6;
      if (c < 0) v += 60 + 120 * -c; else if (c < 0.15) v += 6 * (0.15 - c);
      if (off[k >> 2]) v += 40; // off the kerbed sidewalk (junction mouths, bridge ends)
      cost[i * S + k] = v;
    }
  };
  const prof = new Float32Array(n + 1); const L = { path: true, sA, n, prof, base, hw, cx, cz, nx, nz, xs: new Float32Array(n), zs: new Float32Array(n), closed: false };
  const it = (function* () { const A = {}; L._ph = 'setup'; // centre line + smoothed normal (tangent over ± 2 m), tabulated every 0.5 m
    for (let i = 0; i < n; i++) { const s = Math.min(sB, sA + i * STEP); pointAt(e, s, P); pointAt(e, Math.max(0, s - 2), A); pointAt(e, Math.min(e.L, s + 2), Q);
      let tx = Q.x - A.x, tz = Q.z - A.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; cx[i] = P.x; cz[i] = P.z; nx[i] = -tz * sg; nz[i] = tx * sg; if ((i & 63) === 63) yield; }
    yield* solveJob(n, S, fill, prof, lo, base, null, L);
    for (let i = 0; i < n; i++) { const o = hw + base + prof[i]; L.xs[i] = cx[i] + nx[i] * o; L.zs[i] = cz[i] + nz[i] * o; } L.cx = L.cz = L.nx = L.nz = null; })();
  return { L, it };
}
export function pedPath(city, path) { return finish(city, path, () => pathJob(city, path)); }
// point on a path lane at the path's own parameter u (arc length along the old polyline)
export function pathLanePoint(L, path, u, out = {}) {
  u = Math.max(0, Math.min(path.L, u)); const C = path.cum; let lo = 0, hi = C.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m] <= u) lo = m; else hi = m; }
  const t = (u - C[lo]) / (C[hi] - C[lo] || 1); const s = path.ss[lo] + (path.ss[hi] - path.ss[lo]) * t;
  const f = Math.max(0, Math.min(L.n - 1, (s - L.sA) / STEP)); const i = Math.min(L.n - 2, Math.floor(f)); const w = f - i;
  out.x = L.xs[i] * (1 - w) + L.xs[i + 1] * w; out.z = L.zs[i] * (1 - w) + L.zs[i + 1] * w;
  if (L.prev) { const b = (performance.now() - L.t0) / 700; if (b >= 1) L.prev = null; else { const x = out.x, z = out.z; pathLanePoint(L.prev, path, u, out); const s2 = b * b * (3 - 2 * b); out.x += (x - out.x) * s2; out.z += (z - out.z) * s2; } } // b_clutter: re-planned lane eased in
  return out;
}

// ---- frame-split precompute: lanes of the loops / paths around the player are solved a slice per frame (≤ budget ms),
// nearest first, so a spawn on a new block normally finds its lane ready (no ~20 ms solve on the spawning frame).
const warmQ = (city) => city._warm || (city._warm = { x: 1e9, z: 1e9, q: [], f: 0, pri: [] });
// a walker wants this lane now (spawned or walking before it was solved): solved ahead of the distance queue
export function pedWant(city, o, isPath) { if (o._lane || o._want) return; o._want = 1; warmQ(city).pri.push([0, o, isPath ? 1 : 0]); }
export function pedWarm(city, PE, at, budget = 2) {
  const st = pedStats(city); st.frames++; if (!at) return;
  const W = warmQ(city);
  if (city._clutNew && city._clutNew.length) clutDirty(city, PE, W, city._clutNew.splice(0));
  if (Math.hypot(at.x - W.x, at.z - W.z) > 20 || ++W.f > 120) { W.x = at.x; W.z = at.z; W.f = 0; const q = [];
    for (const b of PE.loops) if (!b._lane) { const d = Math.hypot((b.x0 + b.x1) / 2 - at.x, (b.z0 + b.z1) / 2 - at.z); if (d < 400) q.push([d, b, 0]); }
    for (const p of PE.paths) if (!p._lane && p.e) { const d = Math.hypot(p.mx - at.x, p.mz - at.z) - p.L / 2; if (d < 260) q.push([d, p, 1]); }
    q.sort((a, b) => b[0] - a[0]); W.q = q; } // nearest at the end (pop)
  if (!W.q.length && !W.pri.length) return; const t0 = performance.now();
  for (const Qu of [W.pri, W.q]) { while (Qu.length) { const [, o, k] = Qu[Qu.length - 1]; if (o._lane && !o._stale) { Qu.pop(); continue; }
    if (!o._job) o._job = k ? pathJob(city, o) : loopJob(city, o);
    let done = false; for (;;) { const c0 = performance.now(); done = o._job.it.next().done; const cm = performance.now() - c0; if (cm > st.chunkMax) st.chunkMax = cm; if (cm > 4 && st.slow.length < 12) st.slow.push([k, Math.round(o._job.L.n || o._job.L.per), +cm.toFixed(1), o._job.L._ph, st.frames]); if (done || performance.now() - t0 >= budget) break; }
    if (done) { const L = o._job.L; if (o._lane && o._stale) { L.prev = o._lane; L.prev.prev = null; L.t0 = performance.now(); st.resolveN = (st.resolveN || 0) + 1; } o._lane = L; o._stale = 0; o._job = null; Qu.pop(); st.warmN++; }
    if (performance.now() - t0 >= budget) break; } if (performance.now() - t0 >= budget) break; }
  const ms = performance.now() - t0; st.warmMs += ms; if (ms > st.warmMaxFrame) st.warmMaxFrame = ms;
}

// b_clutter: sidewalk clutter boxes (clutter.js, tag 'clut') appear when a parcel streams in. Road-graph lanes already solved (or
// being solved) near them are re-planned: a solved lane stays in use until its re-solve finishes (then eased over, pathLanePoint),
// a job in progress restarts. Only paths whose polyline passes within 7 m of a new box.
function clutDirty(city, PE, W, boxes) {
  const st = pedStats(city); st.clutBoxes = (st.clutBoxes || 0) + boxes.length;
  for (const p of PE.paths) { if (!p.e || !(p._lane || p._job)) continue;
    if (!p._bb) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const q of p.pts) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]); } p._bb = [x0 - 7, z0 - 7, x1 + 7, z1 + 7]; }
    const B = p._bb; let hit = false;
    for (const b of boxes) { if (b.maxX < B[0] || b.minX > B[2] || b.maxZ < B[1] || b.minZ > B[3]) continue;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2; const r = 7 + Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
      for (const q of p.pts) if (Math.abs(q[0] - cx) < r && Math.abs(q[1] - cz) < r) { hit = true; break; } if (hit) break; }
    if (!hit) continue; st.clutDirty = (st.clutDirty || 0) + 1;
    if (p._job) { p._job = null; continue; } // restarts from scratch with the new boxes (still queued: no lane yet)
    if (!p._stale) { p._stale = 1; W.pri.push([0, p, 1]); } }
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
