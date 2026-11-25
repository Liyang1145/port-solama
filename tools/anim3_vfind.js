// anim3: find vault test spots: low thin colliders near the start + the parked car; for each, stand 1.0 m in front facing it and run vaultScan
(() => { const G = __G, g = G.game, col = g.city.col, gh = (x, z) => g.city.groundH(x, z); const P0 = { x: g.P.pos.x, z: g.P.pos.z }; const ok = [], why = {};
  const cand = [];
  for (const b of col.boxes) { const cx = b.o ? b.o.cx : (b.minX + b.maxX) / 2, cz = b.o ? b.o.cz : (b.minZ + b.maxZ) / 2; const d = Math.hypot(cx - P0.x, cz - P0.z); if (d > 260) continue;
    const hh = b.h - gh(cx, cz); if (hh < 0.5 || hh > 1.2) continue;
    let ux, uz, hl, hw; if (b.o) ({ ux, uz, hl, hw } = b.o); else { const ex = (b.maxX - b.minX) / 2, ez = (b.maxZ - b.minZ) / 2; if (ex >= ez) { ux = 1; uz = 0; hl = ex; hw = ez; } else { ux = 0; uz = 1; hl = ez; hw = ex; } }
    if (hl < 0.6 || hw * 2 > 1.3) continue; cand.push({ b, cx, cz, ux, uz, hl, hw, d, hh }); }
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand.slice(0, 400)) for (const sg of [1, -1]) { const nx = -c.uz * sg, nz = c.ux * sg; const x = c.cx + nx * (c.hw + 0.95), z = c.cz + nz * (c.hw + 0.95);
    if (col.resolve(x, z, 0.35, gh(x, z) + 0.5).hit) continue; g.P.pos.set(x, gh(x, z), z); const yaw = Math.atan2(-nx, -nz);
    const r = __vaultScan(g, yaw, false); const w = window.__VAULT_ST.last; if (r) ok.push({ tag: c.b.tag, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), H: +r.H.toFixed(2), deep: +(r.tout - r.tin).toFixed(2), d: c.d | 0 }); else { const k = c.b.tag + ': ' + String(w).replace(/[0-9.\-]+/g, '#'); why[k] = (why[k] || 0) + 1; } }
  // the parked car: from each side, across the bonnet
  const v = g.parked; const cars = [];
  if (v) { const f = v.forward(); const lx = f.z, lz = -f.x; for (const sg of [1, -1]) for (const al of [0.36, -0.36]) { const x = v.x + f.x * al * v.dims.L + lx * sg * (v.dims.W / 2 + 0.9), z = v.z + f.z * al * v.dims.L + lz * sg * (v.dims.W / 2 + 0.9);
      g.P.pos.set(x, gh(x, z), z); const yaw = Math.atan2(-lx * sg, -lz * sg); const r = __vaultScan(g, yaw, false); cars.push({ sg, al, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), ok: !!r, why: window.__VAULT_ST.last, H: r ? +r.H.toFixed(2) : null, deep: r ? +(r.tout - r.tin).toFixed(2) : null }); } }
  g.tp(P0.x, P0.z, 0);
  const byTag = {}; for (const o of ok) (byTag[o.tag] ||= []).push(o);
  return { cand: cand.length, ok: ok.length, byTag: Object.fromEntries(Object.entries(byTag).map(([k, v]) => [k, v.slice(0, 4)])), why, cars, parked: v ? { x: v.x, z: v.z, yaw: v.yaw, dims: v.dims, y: v.y } : null }; })()
