// a_canaledge (map 索拉纳港 only): ground / water fix-up for placed props, run after placement (like colfix: no builder draws
// another random number, so every layout and RNG stream stays exactly as before; this pass only moves or drops finished records).
// Census (browser, every lamp / palm / tree / shrub / layer item / small collider vs the ground under it) found props standing in
// the finger canals (seaside boulevard lamps beyond the bridge parapet, bay-park palms in the canal mouths, ...). Rules:
//  - lamps (rows): slide along the row (pole keeps its arm direction, rhythm kept) to the nearest spot whose whole footprint is
//    land, at most 7 m; otherwise dropped;
//  - vegetation in water: dropped (decoration, no rhythm); with only its footprint over the water: nudged ≤ 1.5 m inland;
//  - matching colliders (palm / tree / layer boxes) move with them or are removed.
// land = ground above the water line (waterY -1; city.groundH gives -4 over open water / canals, the beach slope runs below -1)
// (city.isLand is not used: it misses the beach / dune strip east of the island ends)
const WET = -0.95;
const RINGS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
function footOk(isLand, x, z, r) { if (!isLand(x, z)) return false; for (const [dx, dz] of RINGS) if (!isLand(x + dx * r, z + dz * r)) return false; return true; }
// slide along unit tangent (tx, tz) up to maxD; returns signed offset or null
function slide(isLand, x, z, tx, tz, r, maxD, ok = () => true) {
  for (let s = 0.5; s <= maxD + 1e-6; s += 0.5) for (const sg of [1, -1]) { const X = x + tx * s * sg, Z = z + tz * s * sg; if (footOk(isLand, X, Z, r) && ok(X, Z)) return s * sg; }
  return null;
}
// nudge away from the wet side (mean of the wet footprint directions), up to maxD
function nudge(isLand, x, z, r, maxD) {
  let wx = 0, wz = 0; for (const [dx, dz] of RINGS) if (!isLand(x + dx * r, z + dz * r)) { wx += dx; wz += dz; }
  const l = Math.hypot(wx, wz); if (l < 1e-6) return null; const ux = -wx / l, uz = -wz / l;
  for (let s = 0.25; s <= maxD + 1e-6; s += 0.25) { const X = x + ux * s, Z = z + uz * s; if (footOk(isLand, X, Z, r)) return [X, Z]; }
  return null;
}
function moveBox(col, tag, x, z, X, Z) { // the small square collider centred on (x, z) with this tag; X === null -> remove
  const l = col.query(x, z, 1, []); for (const b of l) { if (b.tag !== tag || b.o) continue; const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2; if (Math.abs(cx - x) > 1e-4 || Math.abs(cz - z) > 1e-4) continue;
    col.remove(b); if (X !== null) col.add(b.minX + X - x, b.minZ + Z - z, b.maxX + X - x, b.maxZ + Z - z, b.h, tag); return true; }
  return false;
}
const bump = (S, cat, k) => { const s = S[cat] || (S[cat] = { moved: 0, dropped: 0 }); s[k] = (s[k] || 0) + 1; };

// fabric chunk records (mainland grid): I.lamp [x, z, ang] (row along (sin ang, cos ang), arm across it), I.palm [x, z, ...], I.tree [x, z, ...]
export function fixFabricProps(fab, groundH) {
  const isLand = (x, z) => groundH(x, z) > WET;
  const S = {}; if (!fab || !fab.chunks) return S;
  const scan = () => { const o = {}; for (const ch of fab.chunks.values()) for (const [key, r] of [['lamp', 0.2], ['palm', 0.35], ['tree', 0.35]]) for (const p of ch.I[key]) { const c = o[key] || (o[key] = { n: 0, water: 0, overhang: 0 }); c.n++; if (!isLand(p[0], p[1])) c.water++; else if (!footOk(isLand, p[0], p[1], r)) c.overhang++; } return o; };
  S.pre = scan();
  for (const ch of fab.chunks.values()) { const I = ch.I;
    I.lamp = I.lamp.filter((p) => { if (footOk(isLand, p[0], p[1], 0.2)) return true;
      const tx = Math.sin(p[2]), tz = Math.cos(p[2]); // row tangent (the arm is local +x = (cos, -sin), across the row)
      const s = slide(isLand, p[0], p[1], tx, tz, 0.2, 7); if (s === null) { bump(S, 'lamp', 'dropped'); return false; }
      p[0] += tx * s; p[1] += tz * s; bump(S, 'lamp', 'moved'); return true; });
    for (const key of ['palm', 'tree']) I[key] = I[key].filter((p) => { const r = 0.35;
      if (footOk(isLand, p[0], p[1], r)) return true;
      if (!isLand(p[0], p[1])) { bump(S, key, 'dropped'); return false; }
      const q = nudge(isLand, p[0], p[1], r, 1.5); if (!q) { bump(S, key, 'dropped'); return false; }
      p[0] = q[0]; p[1] = q[1]; bump(S, key, 'moved'); return true; });
  }
  S.post = scan();
  return S;
}

// city lists (district / region / street trees): lamps {x, y, z, dir}, palms / trees / shrubs {x, z}
export function fixCityProps(city) {
  const S = {}; const isLand = (x, z) => city.groundH(x, z) > WET, col = city.col;
  city.lamps.splice(0, city.lamps.length, ...city.lamps.filter((l) => {
    const gh = city.groundH(l.x, l.z);
    if (l.y > 0.5) { if (gh > WET && gh - l.y > 0.1 && gh - l.y < 0.5) { l.y = gh; bump(S, 'lamp', 'raised'); } return true; } // on a bridge / jetty deck the ground lookup does not know: keep; only lift a base sunk into a ramp
    if (footOk(isLand, l.x, l.z, 0.2)) { if (gh - l.y > 0.1 && gh - l.y < 0.5) { l.y = gh; bump(S, 'lamp', 'raised'); } return true; }
    const tx = l.dir[1], tz = -l.dir[0]; const s = slide(isLand, l.x, l.z, tx, tz, 0.2, 7); if (s === null) { bump(S, 'lamp', 'dropped'); moveBox(col, 'lamp', l.x, l.z, null); return false; }
    moveBox(col, 'lamp', l.x, l.z, l.x + tx * s, l.z + tz * s); l.x += tx * s; l.z += tz * s; bump(S, 'lamp', 'moved'); return true; }));
  for (const [key, tag, r] of [['palms', 'palm', 0.35], ['trees', 'tree', 0.35], ['shrubs', null, 0.3]]) {
    const L = city[key]; L.splice(0, L.length, ...L.filter((p) => { if (footOk(isLand, p.x, p.z, r)) return true;
      const q = isLand(p.x, p.z) ? nudge(isLand, p.x, p.z, r, 1.5) : null;
      if (!q) { if (tag) moveBox(col, tag, p.x, p.z, null); bump(S, tag || 'shrub', 'dropped'); return false; }
      if (tag) moveBox(col, tag, p.x, p.z, q[0], q[1]); p.x = q[0]; p.z = q[1]; bump(S, tag || 'shrub', 'moved'); return true; })); }
  return S;
}
