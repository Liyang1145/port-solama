// v4.4 parcels: building lots laid along both sides of every non-Deco road, oriented to the road (so blocks follow curved and
// diagonal streets), sized by district style. Pure JS: the game streams detailed buildings from them (src/stream.js), the far
// impostors are their boxes, tools/mapgen.cjs draws their footprints. Same seed -> same city everywhere.
import { mulberry } from '../../util.js';
import { landAt, districtAt, DECO_CORE, DISTRICTS, inPoly, polyBox } from './mapdata.js';
import { pointAt } from './roadgraph.js';

const STY = {
  deco: { fr: [18, 30], dp: [18, 26], h: [11, 20], set: 1 },
  mid: { fr: [16, 32], dp: [16, 26], h: [9, 30], set: 1 },
  condo: { fr: [28, 42], dp: [22, 32], h: [45, 105], set: 6 },
  canal: { fr: [17, 22], dp: [13, 16], h: [7, 8], set: 6 },
  villa: { fr: [18, 24], dp: [13, 16], h: [7, 9], set: 6 },
  mansion: { fr: [30, 40], dp: [18, 24], h: [9, 11], set: 10 },
  downtown: { fr: [30, 48], dp: [28, 42], h: [40, 200], set: 1.5 },
  port: { fr: [40, 70], dp: [26, 36], h: [10, 14], set: 4 },
};
export function genParcels(graph) {
  const R = mulberry(4404); const rnd = (a, b) => a + (b - a) * R();
  const occ = new Set(); const C = 3;
  const cells = (p) => { const o = []; const [cx, cz, hl, hd, c, s] = [p.x, p.z, p.w / 2, p.d / 2, Math.cos(p.ang), Math.sin(p.ang)];
    const r = Math.hypot(hl, hd); for (let gx = Math.floor((cx - r) / C); gx <= Math.floor((cx + r) / C); gx++) for (let gz = Math.floor((cz - r) / C); gz <= Math.floor((cz + r) / C); gz++) {
      const x = gx * C + C / 2 - cx, z = gz * C + C / 2 - cz; const u = x * c + z * s, v = -x * s + z * c; if (Math.abs(u) <= hd + 1 && Math.abs(v) <= hl + 1) o.push(gx * 100003 + gz); } return o; };
  const out = [];
  const inCore = (x, z) => x > DECO_CORE.x0 - 4 && x < DECO_CORE.x1 + 30 && z > DECO_CORE.z0 - 6 && z < DECO_CORE.z1 + 6;
  const roadHit = (x, z) => { const n = graph.index.near(x, z); return n && n.d < n.e.hw + n.e.sw + 0.3; };
  for (const e of graph.edges) {
    if (e.legacy || e.kind === 'cw' && !e.road.id.startsWith('cw2')) continue;
    const t0 = e.n0.trim + 3, t1 = e.L - e.n1.trim - 3;
    for (const side of [1, -1]) {
      let s = t0 + rnd(0, 4);
      while (s < t1 - 8) {
        const q = pointAt(e, s + 8); const mid = [q.x, q.z];
        const dist = districtAt(mid[0], mid[1]); const st = dist && STY[dist.style];
        if (!st) { s += 12; continue; }
        const w = rnd(st.fr[0], st.fr[1]); if (s + w > t1) break;
        const P = pointAt(e, s + w / 2); const nx = -P.tz * side, nz = P.tx * side; // side normal
        const d = rnd(st.dp[0], st.dp[1]); const off = e.hw + e.sw + st.set + d / 2;
        const p = { x: P.x + nx * off, z: P.z + nz * off, w, d, ang: Math.atan2(-nz, -nx), style: dist.style, district: dist.id, seed: (R() * 1e9) >>> 0 };
        // front faces the road: local +x -> world (-nx, -nz); ang = atan2 of the facing vector (x, z)
        let h = rnd(st.h[0], st.h[1]);
        if (dist.style === 'downtown') { const f = Math.exp(-(((p.x + 1880) / 330) ** 2 + ((p.z + 180) / 420) ** 2)); h = 35 + f * rnd(90, 210) + R() * 30; }
        p.h = h;
        // validity: land under every corner, clear of other roads (including center & edge midpoints), not on the Deco core, no overlap
        const fx = Math.cos(p.ang), fz = Math.sin(p.ang); let ok = true;
        for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [0.5, 1], [-0.5, 1], [0.5, -1], [-0.5, -1], [1, 0.5], [1, -0.5], [-1, 0.5], [-1, -0.5]]) {
          const lx = a * d / 2, lz = b * w / 2; const x = p.x + fx * lx - fz * lz, z = p.z + fz * lx + fx * lz;
          if (!landAt(x, z) || inCore(x, z) || roadHit(x, z) || districtAt(x, z)?.style === 'park') { ok = false; break; }
        }
        if (ok) { const cs = cells(p); if (cs.some((k) => occ.has(k))) ok = false; else { for (const k of cs) occ.add(k); out.push(p); } }
        s += ok ? w + rnd(0, 3) : 6;
      }
    }
  }
  // far-only low-rise districts (no roads yet): a jittered grid of boxes
  for (const dd of DISTRICTS.filter((q) => q.far)) {
    const [x0, z0, x1, z1] = polyBox(dd.poly); const step = dd.style === 'condo' ? 70 : 34;
    for (let x = x0 + 10; x < x1 - 10; x += step) for (let z = z0 + 10; z < z1 - 10; z += step) {
      if (!inPoly(x, z, dd.poly) || !landAt(x, z) || R() < 0.15) continue;
      const px = x + rnd(-4, 4), pz = z + rnd(-4, 4), pw = rnd(16, 26), pd = rnd(14, 24), ang = 0.12;
      const h = dd.style === 'condo' ? rnd(40, 110) : rnd(6, 13), seed = (R() * 1e9) >>> 0;
      const c = Math.cos(ang), s = Math.sin(ang); let onLand = landAt(px, pz);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!onLand) break;
        const lx = a * pd / 2, lz = b * pw / 2;
        if (!landAt(px + c * lx - s * lz, pz + s * lx + c * lz)) onLand = false;
      }
      if (onLand) out.push({ x: px, z: pz, w: pw, d: pd, ang, style: dd.style, district: dd.id, far: true, h, seed });
    }
  }
  return out;
}
