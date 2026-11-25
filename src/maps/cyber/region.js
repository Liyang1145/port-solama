// v4.4 open-world shell around the hand-built Deco district: coastlines (land caps, seawalls), the curved Atlantic beach,
// road ribbons + intersections + sidewalks for the polyline road graph, causeway decks / piers / barriers, street lights and
// palms along the new roads. Geometry goes into the same chunked World (so it frustum-culls per 250 m cell).
import * as THREE from 'three';
import { prismWalls, polyCap, box } from '../../geo.js';
import { LANDS, DISTRICTS, landAt, districtAt, beachX, BEACH_Z, polyBox, DECO_CORE, WILD } from './mapdata.js';
import { pointAt } from './roadgraph.js';
import { rng, rand, clamp } from '../../util.js';

const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
// prismWalls / rect() convention: clockwise with x right, z up (negative shoelace area) -> outward faces
const cw = (p) => (area(p) > 0 ? p.slice().reverse() : p);
// Sutherland-Hodgman: clip polygon `s` by convex polygon `c`
function clip(s, c) {
  const cc = area(c) > 0 ? c : c.slice().reverse(); let out = s;
  for (let i = 0; i < cc.length && out.length; i++) {
    const a = cc[i], b = cc[(i + 1) % cc.length]; const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length]; const pi = inside(p), qi = inside(q);
      if (pi) out.push(p);
      if (pi !== qi) { const dx = q[0] - p[0], dz = q[1] - p[1], ex = b[0] - a[0], ez = b[1] - a[1]; const t = ((a[0] - p[0]) * ez - (a[1] - p[1]) * ex) / (dx * ez - dz * ex); out.push([p[0] + dx * t, p[1] + dz * t]); }
    }
  }
  return out;
}

// grassfix (?oldgrassfix = old): land / district caps were single polygons triangulated into km-long slivers (the island's
// 276 triangles reach 2.7 km). A sliver crossing the camera plane is clipped by the rasteriser and its depth comes out a few
// cm too near right in front of the camera, so the lawn 3 cm under the road won the depth test there (whole near road turning
// to grass for a frame, edge = a horizontal line). Caps are now cut into CAP_S m cells (same bucket = same draw calls).
const OLDGRASSFIX = typeof location !== 'undefined' && /[?&]oldgrassfix\b/.test(location.search);
const CAP_S = 64;
function tiledCap(bucket, poly, y) {
  if (OLDGRASSFIX) { polyCap(bucket, poly, y); return; }
  const [x0, z0, x1, z1] = polyBox(poly);
  if (x1 - x0 <= CAP_S && z1 - z0 <= CAP_S) { polyCap(bucket, poly, y); return; }
  for (let gx = Math.floor(x0 / CAP_S) * CAP_S; gx < x1; gx += CAP_S) for (let gz = Math.floor(z0 / CAP_S) * CAP_S; gz < z1; gz += CAP_S) {
    const c = clip(poly, [[gx, gz], [gx + CAP_S, gz], [gx + CAP_S, gz + CAP_S], [gx, gz + CAP_S]]);
    if (c.length < 3 || Math.abs(area(c)) < 0.01) continue;
    polyCap(bucket, cw(c), y);
  }
}

export function buildRegion(ctx, graph) {
  const { W, col, lamps, palms, trees, shrubs } = ctx;
  // ------------------------------------------------------------ land caps + seawalls ----
  const onWildEdge = (a, b) => { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; return mx >= WILD.x0 - 1 && mx <= WILD.x1 + 1 && mz >= WILD.z0 - 1 && mz <= WILD.z1 + 1; };
  for (const l of LANDS) {
    if (l.noCap) continue; // v4.5 wild terrain has its own height-field mesh (src/nature.js)
    const p = cw(l.poly); const [x0, z0, x1, z1] = polyBox(p);
    tiledCap(W.b(l.mat === 'concrete' ? 'landc' : 'land', (x0 + x1) / 2, (z0 + z1) / 2), p, -0.03);
    // seawall faces on every shore edge except the island's beach edge (and the Deco core's own wall at x = −22)
    const sw = W.b('concrete', (x0 + x1) / 2, (z0 + z1) / 2);
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length];
      if (l.id === 'island' && (a[0] >= beachX(a[1]) - 0.5 && b[0] >= beachX(b[1]) - 0.5)) continue;
      if (l.id === 'island' && a[0] === -22 && b[0] === -22) continue;
      if (l.wildNotch && onWildEdge(a, b)) continue;
      prismWalls(sw, [a, b], -3.2, -0.03, null); prismWalls(sw, [b, a], -3.2, -0.03, null);
      // coping strip
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * 0.5, nz = dx / L * 0.5;
      polyCap(sw, [[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]], 0.06);
    }
  }
  // district ground: urban districts get pavers / concrete over the lawn (clipped to the coast)
  for (const d of DISTRICTS) {
    if (d.far) continue; const mat = { downtown: 'pavers', port: 'concrete', park: null, golf: null }[d.style]; // v4.5: island districts keep their lawns (whole island read as salmon pavers from the air)
    if (!mat) continue; // r6.0 fix: this guard sat inside the comment -> every non-urban district got an unlit white cap (white slabs from the air)
    for (const l of LANDS) { if (l.far) continue; const c = clip(l.poly, d.poly); if (c.length < 3) continue; const [x0, z0, x1, z1] = polyBox(c); tiledCap(W.b(mat, (x0 + x1) / 2, (z0 + z1) / 2), cw(c), -0.02); }
  }
  // ------------------------------------------------------------------ roads ----
  const rd = (x, z) => W.b('road', x, z);
  const overWater = (x, z) => !landAt(x, z) && !(x > DECO_CORE.x0 && x < DECO_CORE.x1 && Math.abs(z) < DECO_CORE.z1);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const P = {}, Q = {};
  for (const e of graph.edges) {
    if (e.legacy) continue;
    const s0 = e.n0.trim, s1 = e.L - e.n1.trim; if (s1 - s0 < 1) continue;
    const pad0 = e.n0.deg === 2 ? 1000 : 0, pad1 = e.n1.deg === 2 ? 1000 : 0; const Lr = s1 - s0 + pad0 + pad1;
    const n = Math.max(1, Math.ceil((s1 - s0) / 4)); const hw = e.hw;
    const water = []; e.water = water;
    for (let i = 0; i < n; i++) {
      const sa = s0 + (s1 - s0) * i / n, sb = s0 + (s1 - s0) * (i + 1) / n; pointAt(e, sa, P); pointAt(e, sb, Q);
      const ax = -P.tz, az = P.tx, bx = -Q.tz, bz = Q.tx; // left normals
      const b = rd((P.x + Q.x) / 2, (P.z + Q.z) / 2); const va = sa - s0 + pad0, vb = sb - s0 + pad0;
      // CCW from above as in roadQuad: left-forward, right-forward... keep the normal up via polyCap-style ordering
      const A0 = V(P.x + ax * hw, 0, P.z + az * hw), A1 = V(P.x - ax * hw, 0, P.z - az * hw), B0 = V(Q.x + bx * hw, 0, Q.z + bz * hw), B1 = V(Q.x - bx * hw, 0, Q.z - bz * hw);
      const nrm = new THREE.Vector3().subVectors(B0, A0).cross(new THREE.Vector3().subVectors(A1, A0));
      if (nrm.y > 0) b.quad(A0, B0, B1, A1, [A0.x / 7, A0.z / 7, B0.x / 7, B0.z / 7, B1.x / 7, B1.z / 7, A1.x / 7, A1.z / 7], { aRd: [0, 0, 0, 0] });
      else b.quad(A1, B1, B0, A0, [A1.x / 7, A1.z / 7, B1.x / 7, B1.z / 7, B0.x / 7, B0.z / 7, A0.x / 7, A0.z / 7], { aRd: [0, 0, 0, 0] });
      const k = b.custom.aRd; k.length -= 16;
      // across u: + on the left normal side. The shader is symmetric except lane arrows / stop lines (sign(v - L/2)).
      const first = nrm.y > 0; const uA0 = hw, uA1 = -hw;
      if (first) k.push(uA0, va, Lr, e.rd, uA0, vb, Lr, e.rd, uA1, vb, Lr, e.rd, uA1, va, Lr, e.rd); else k.push(uA1, va, Lr, e.rd, uA1, vb, Lr, e.rd, uA0, vb, Lr, e.rd, uA0, va, Lr, e.rd);
      const wet = overWater(P.x, P.z); water.push(wet);
      // ---- sidewalks + kerbs on land, bridge deck / barriers over water
      const sw = e.sw;
      for (const sg of [1, -1]) {
        const ia = V(P.x + ax * hw * sg, 0, P.z + az * hw * sg), ib = V(Q.x + bx * hw * sg, 0, Q.z + bz * hw * sg);
        if (!wet && sw > 0) {
          const oa = V(P.x + ax * (hw + sw) * sg, 0.15, P.z + az * (hw + sw) * sg), ob = V(Q.x + bx * (hw + sw) * sg, 0.15, Q.z + bz * (hw + sw) * sg);
          const ta = ia.clone().setY(0.15), tb = ib.clone().setY(0.15);
          const sb2 = W.b('sidewalk', P.x, P.z); const kc = W.b('concrete', P.x, P.z);
          const up = new THREE.Vector3().subVectors(tb, ta).cross(new THREE.Vector3().subVectors(oa, ta)).y > 0;
          if (up) sb2.quad(ta, tb, ob, oa, [ta.x, ta.z, tb.x, tb.z, ob.x, ob.z, oa.x, oa.z]); else sb2.quad(oa, ob, tb, ta, [oa.x, oa.z, ob.x, ob.z, tb.x, tb.z, ta.x, ta.z]);
          // kerb face toward the road
          kc.quad(ib, ia, ta, tb, [0, 0, 1, 0, 1, 0.15, 0, 0.15]); kc.quad(ia, ib, tb, ta, [0, 0, 1, 0, 1, 0.15, 0, 0.15]);
        } else if (wet) {
          const c = W.b('concrete', P.x, P.z);
          const da = V(P.x + ax * (hw + 0.6) * sg, 0, P.z + az * (hw + 0.6) * sg), db = V(Q.x + bx * (hw + 0.6) * sg, 0, Q.z + bz * (hw + 0.6) * sg);
          // deck edge face + soffit
          const lo = -1.3; const daL = da.clone().setY(lo), dbL = db.clone().setY(lo);
          c.quad(db, da, daL, dbL, [0, 0, 4, 0, 4, 1.3, 0, 1.3]); c.quad(da, db, dbL, daL, [0, 0, 4, 0, 4, 1.3, 0, 1.3]);
          // jersey barrier (0.85 m) on the deck edge, skipped next to junctions
          const nearNode = Math.min(sa - s0 + (e.n0.deg >= 3 ? 0 : 99), s1 - sb + (e.n1.deg >= 3 ? 0 : 99)) < 10;
          if (!nearNode) {
            const i0 = V(P.x + ax * (hw + 0.05) * sg, 0, P.z + az * (hw + 0.05) * sg), i1 = V(Q.x + bx * (hw + 0.05) * sg, 0, Q.z + bz * (hw + 0.05) * sg);
            const poly = [[i0.x, i0.z], [i1.x, i1.z], [db.x, db.z], [da.x, da.z]];
            prismWalls(c, cw(poly), 0, 0.85, null); polyCap(c, poly, 0.85);
            for (const t of [0.17, 0.5, 0.83]) { const mx = (P.x + ax * (hw + 0.45) * sg) * (1 - t) + (Q.x + bx * (hw + 0.45) * sg) * t, mz = (P.z + az * (hw + 0.45) * sg) * (1 - t) + (Q.z + bz * (hw + 0.45) * sg) * t;
              col.add(mx - 0.4, mz - 0.4, mx + 0.4, mz + 0.4, 0.9, 'barrier'); }
          }
        }
      }
      if (wet) { // deck underside + piers every ~28 m
        const c = W.b('concrete', P.x, P.z);
        const pa = [[P.x + ax * (hw + 0.6), P.z + az * (hw + 0.6)], [Q.x + bx * (hw + 0.6), Q.z + bz * (hw + 0.6)], [Q.x - bx * (hw + 0.6), Q.z - bz * (hw + 0.6)], [P.x - ax * (hw + 0.6), P.z - az * (hw + 0.6)]];
        polyCap(c, pa, -1.3, {}, null, true);
        if (i % 7 === 3) for (const sg of [-0.6, 0.6]) { const x = P.x + ax * hw * sg, z = P.z + az * hw * sg; box(c, x - 0.8, -7, z - 0.8, x + 0.8, -1.3, z + 0.8); }
      }
    }
    // street lights + palms along the edge
    const rural = e.kind === 'rur';
    const ave = e.kind !== 'res' && !rural; const step = e.kind === 'cw' ? 46 : ave ? 36 : rural ? 58 : 44;
    for (let s = s0 + 10, k = 0; s < s1 - 10; s += step, k++) {
      pointAt(e, s, P); const lx = -P.tz, lz = P.tx; const wet = overWater(P.x, P.z);
      const sg = k % 2 ? 1 : -1; if ((e.kind === 'res' || rural) && k % 2) continue;
      const off = e.hw + (wet ? 0.3 : rural ? 1.6 : 0.8);
      lamps.push({ x: P.x + lx * off * sg, z: P.z + lz * off * sg, y: wet ? 0.85 : rural ? 0 : 0.15, dir: [-lx * sg, -lz * sg], kind: wet ? 'bridge' : undefined, region: true });
    }
    if (!rural) for (let s = s0 + 16; s < s1 - 12; s += e.kind === 'res' ? 26 : 21) {
      pointAt(e, s, P); if (overWater(P.x, P.z)) continue; const lx = -P.tz, lz = P.tx;
      for (const sg of [-1, 1]) {
        if (e.kind === 'res' && rng() < 0.45) continue; if (e.kind === 'cw' && rng() < 0.5) continue;
        const off = e.hw + (e.sw ? e.sw * 0.58 : 3); const x = P.x + lx * off * sg, z = P.z + lz * off * sg;
        if (!landAt(x, z) || lamps.some((l) => l.region && Math.abs(l.x - x) < 3 && Math.abs(l.z - z) < 3)) continue;
        palms.push({ x, z, h: rand(8, 13), lean: rand(-0.06, 0.06), rot: rand(0, 6.28), s: rand(0.85, 1.05), street: true, region: true });
      }
    }
  }
  // intersection patches (convex hull of the trimmed ribbon corners) and cul-de-sac bulbs
  for (const n of graph.nodes) {
    if (n.legacy) continue;
    if (n.deg >= 3) {
      const pts = [];
      for (const e of n.edges) { const s = e.n0 === n ? n.trim : e.L - n.trim; pointAt(e, s, P); const lx = -P.tz, lz = P.tx; pts.push([P.x + lx * e.hw, P.z + lz * e.hw], [P.x - lx * e.hw, P.z - lz * e.hw]); if (e.n0 === n && e.n1 === n) { pointAt(e, e.L - n.trim, P); pts.push([P.x - P.tz * e.hw, P.z + P.tx * e.hw], [P.x + P.tz * e.hw, P.z - P.tx * e.hw]); } }
      const hull = convexHull(pts); if (hull.length >= 3) polyCap(rd(n.x, n.z), hull, 0, { aRd: [0, 0, 0, 1] });
    } else if (n.deg === 1 && n.edges[0].culdesac) {
      const c = []; for (let i = 0; i < 16; i++) { const a = -i / 16 * Math.PI * 2; c.push([n.x + Math.cos(a) * 11, n.z + Math.sin(a) * 11]); }
      polyCap(rd(n.x, n.z), c, 0.002, { aRd: [0, 0, 0, 1] }); n.bulb = 11;
    }
  }
  // ----------------------------------------------------------- parks / golf greenery ----
  for (const d of DISTRICTS) {
    if (d.style !== 'park' && d.style !== 'golf') continue; const [x0, z0, x1, z1] = polyBox(d.poly); const n = d.style === 'golf' ? 140 : 60;
    for (let i = 0; i < n; i++) { const x = rand(x0, x1), z = rand(z0, z1); if (!landAt(x, z) || districtAt(x, z) !== d) continue; const nr = graph.index.near(x, z); if (nr && nr.d < nr.e.hw + nr.e.sw + 2) continue;
      if (rng() < 0.55) palms.push({ x, z, h: rand(8, 15), lean: rand(-0.12, 0.12), rot: rand(0, 6.28), s: rand(0.9, 1.1), region: true }); else trees.push({ x, z, s: rand(0.8, 1.4) }); }
    if (d.style === 'golf') { const s = W.b('sand', -640, 1860); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; const cx = -640 + Math.cos(a) * 150, cz = 1860 + Math.sin(a) * 105; const c = []; for (let k = 0; k < 12; k++) { const b = -k / 12 * 6.28; c.push([cx + Math.cos(b) * 7, cz + Math.sin(b) * 4.5]); } polyCap(s, c, -0.01); } }
  }
  void shrubs; void clamp;
}

function convexHull(p) {
  const pts = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}

// ------------------------------------------------------------------ beach (curved) ----
export function beachHeight(x, z) {
  const bx = beachX(z); const t = clamp((x - bx) / 145, 0, 1);
  let y = 0.15 - Math.pow(t, 1.6) * 2.9 - t * 0.2;
  const ez = Math.max(BEACH_Z[0] - z, z - BEACH_Z[1]); if (ez > 0) y -= ez * 0.06;
  return y;
}
export function buildBeach(W) {
  const z0 = BEACH_Z[0] - 110, z1 = BEACH_Z[1] + 110, nz = Math.ceil((z1 - z0) / 8), nu = 44, U = 265;
  const g = new THREE.PlaneGeometry(1, 1, nu, nz); const p = g.attributes.position, uv = g.attributes.uv; const nrm = []; void nrm;
  for (let i = 0; i < p.count; i++) {
    const iu = i % (nu + 1), iz = Math.floor(i / (nu + 1)); const z = z0 + (z1 - z0) * (iz / nz); const u = U * iu / nu; const x = beachX(z) + u;
    p.setXYZ(i, x, beachHeight(x, z) + (Math.sin(x * 0.21 + z * 0.13) * 0.04 + Math.sin(z * 0.05) * 0.06) * clamp(u / 10, 0, 1), z); uv.setXY(i, x, z);
  }
  g.computeVertexNormals();
  // split into ~250 m chunks along z so it culls
  const idx = g.index.array; const rowsPer = 30;
  for (let r0 = 0; r0 < nz; r0 += rowsPer) {
    const r1 = Math.min(nz, r0 + rowsPer); const sub = new THREE.BufferGeometry();
    const vs = r0 * (nu + 1), ve = (r1 + 1) * (nu + 1);
    for (const k of ['position', 'normal', 'uv']) { const a = g.attributes[k]; sub.setAttribute(k, new THREE.BufferAttribute(a.array.slice(vs * a.itemSize, ve * a.itemSize), a.itemSize)); }
    const ii = []; for (let q = r0 * nu * 6; q < r1 * nu * 6; q++) ii.push(idx[q] - vs); sub.setIndex(ii);
    const zc = z0 + (z1 - z0) * ((r0 + r1) / 2 / nz); W.b('sand', beachX(zc) + 60, zc).geom(sub, new THREE.Matrix4());
  }
}

// water bed height texture for the water shader (shallows along every shore, beach shelf, deep channels)
export function bedTexture(groundAt) {
  const N = 512, X0 = -4400, X1 = 1400, Z0 = -2400, Z1 = 4600; const d = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = X0 + (X1 - X0) * (i + 0.5) / N, z = Z0 + (Z1 - Z0) * (j + 0.5) / N; d[j * N + i] = groundAt(x, z); }
  // distance-to-land falloff (chamfer, in texels) -> shallow shelf near shores
  const dist = new Float32Array(N * N); for (let k = 0; k < N * N; k++) dist[k] = d[k] > -1.2 ? 0 : 1e6;
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const jj = pass ? N - 1 - j : j, ii = pass ? N - 1 - i : i; const k = jj * N + ii; const s = pass ? 1 : -1;
    const a = ii + s >= 0 && ii + s < N ? dist[k + s] + 1 : 1e6, b = jj + s >= 0 && jj + s < N ? dist[k + s * N] + 1 : 1e6; dist[k] = Math.min(dist[k], a, b);
  }
  const tx = (X1 - X0) / N; const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    let h = d[k]; if (h < -1.2) h = Math.max(-9, -1.6 - dist[k] * tx * 0.035); // ~3.5 m deeper per 100 m from shore
    const v = clamp((h + 9) / 10, 0, 1); data[k * 4] = Math.round(v * 255); data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return { tex: t, box: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) };
}
