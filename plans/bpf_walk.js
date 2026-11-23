(() => {
  // b_parcelfit: walk into fitted walls (rounded Deco corners, downtown fronts, rotated lots, villa garden walls) — the player must
  // stop outside the drawn footprint; then unload / reload the chunks and check the colliders did not change.
  const g = __G.game; const city = g.city; const COL = city.col; const FIT = __G.neon.bldg.fit; const [CX, CZ] = window.PF_CAM;
  const P = [...FIT.fit.keys()].filter((p) => Math.hypot(p.x - CX, p.z - CZ) < (window.PF_R || 160)).sort((a, b) => Math.hypot(a.x - CX, a.z - CZ) - Math.hypot(b.x - CX, b.z - CZ));
  const out = { tests: [], minClear: 9, inside: 0 };
  const toW = (p, x, z) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); return [p.x + x * c - z * s, p.z + x * s + z * c]; };
  const run = (p, tgt, nrm, vis, kind) => { // tgt / nrm in the parcel frame
    const [sx, sz] = toW(p, tgt[0] + nrm[0] * 2.6, tgt[1] + nrm[1] * 2.6); const [tx, tz] = toW(p, tgt[0] - nrm[0] * 1.0, tgt[1] - nrm[1] * 1.0);
    if (COL.resolve(sx, sz, 0.4, 0.5).hit) return; // start point itself blocked (a neighbour / prop) -> skip
    g.override = null; if (g.P.car) g.toggleCar(); g.tp(sx, sz, 0); let mc = 9;
    for (let f = 0; f < 90; f += 3) { const dx = tx - g.P.pos.x, dz = tz - g.P.pos.z; g.cam.yaw = Math.atan2(dx, dz) + Math.PI; g.override = { mx: 0, mz: 1 }; __G.step(3); mc = Math.min(mc, FIT.dPieces(p, vis, g.P.pos.x, g.P.pos.z)); }
    g.override = null; const moved = Math.hypot(g.P.pos.x - sx, g.P.pos.z - sz);
    out.tests.push([kind, p.style, +p.x.toFixed(0), +p.z.toFixed(0), +mc.toFixed(2), +moved.toFixed(1)]); out.minClear = Math.min(out.minClear, mc); if (mc < 0.05) out.inside++;
  };
  const want = { round: 4, inset: 3, rotated: 3, rect: 2, villa: 2 }; const got = {};
  for (const p of P) { const f = FIT.fit.get(p); const vis = [...f.pieces, ...f.extra]; const hx = p.d / 2, hz = p.w / 2;
    const rot = Math.abs(Math.sin(p.ang)) > 0.08 && Math.abs(Math.cos(p.ang)) > 0.08;
    const k = f.kind === 'round' ? 'round' : f.kind === 'inset' ? 'inset' : (p.style === 'villa' || p.style === 'canal' || p.style === 'mansion') ? 'villa' : rot ? 'rotated' : f.kind === 'rect' ? 'rect' : null;
    if (!k || (got[k] || 0) >= want[k]) continue; got[k] = (got[k] || 0) + 1;
    if (k === 'round') { const R = f.R, a = Math.PI / 4; run(p, [hx - R + Math.cos(a) * R, hz - R + Math.sin(a) * R], [Math.cos(a), Math.sin(a)], vis, 'roundCorner'); run(p, [hx - R + Math.cos(-a) * R, -hz + R + Math.sin(-a) * R], [Math.cos(a), -Math.sin(a)], vis, 'roundCorner'); }
    else if (k === 'inset') { run(p, [hx - 1, 0], [1, 0], vis, 'podiumFront'); run(p, [0, hz - 1], [0, 1], vis, 'podiumSide'); }
    else if (k === 'villa') { run(p, [hx + 5.35, -hz + 1.5], [1, 0], vis, 'gardenWall'); run(p, [hx, 0], [1, 0], vis, 'villaFront'); }
    else { run(p, [hx, hz * 0.5], [1, 0], vis, k + 'Front'); run(p, [hx * 0.3, hz], [0, 1], vis, k + 'Side'); }
  }
  // streaming: unload everything near, reload, compare the collider set
  const sig = () => { let n = 0, h = 0; for (const b of COL.boxes) if (b.tag === 'bld') { n++; h = (h + Math.round(b.minX * 10) * 7 + Math.round(b.maxZ * 10) * 13) % 1000000007; } return [n, h]; };
  const s0 = sig(); const ch0 = FIT.stats.checked; g.tp(CX + 2600, CZ + 2600, 0); __G.streamSync(); __G.step(1); const loaded0 = __G.stream.stats.loaded;
  g.tp(CX, CZ, 0); __G.streamSync(); __G.step(1); const s1 = sig();
  out.stream = { before: s0, after: s1, same: s0[0] === s1[0] && s0[1] === s1[1], loadedFar: loaded0, rechecked: FIT.stats.checked - ch0, mismatch: FIT.stats.mismatch, mis: FIT.mis || null };
  out.minClear = +out.minClear.toFixed(2); out.got = got; return JSON.stringify(out);
})()
