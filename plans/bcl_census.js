(() => {
  // b_clutter census (browser): sidewalk clutter of the near-loaded streamed blocks around window.CL_CAM (radius CL_R), run with
  // &clutkeep (captured triangles kept) in both runs; before = &noclutter (no clutter colliders, no moves).
  //  A  raster census: per clutter group a 0.05 m raster of its walking-height triangles (+ neighbours) -> exact EDT; points every
  //     0.25 m (deduped): 可穿模 = player centre can stand (≥ 0.35 m from every collider ≥ 0.3 m tall) and the body (r 0.35) overlaps
  //     visible clutter by > 0.1 m; 看不见却卡住 = within 0.35 m of a 'clut' box with no visible clutter within 0.5 m.
  //  B  road-graph sidewalk lanes (pedlane.js, after the per-frame solver incl. clutter re-plans has drained): lane points every
  //     0.5 m within 3 m of a clutter group: contact (< 0.35 m) with a clutter footprint box (before: the boxes it would get).
  //  C  live crowds of 16 / 32 walkers on the paths, 200 frames: pushed off the lane (> 3 cm) / contact / stalled.
  const t0 = performance.now(); const g = __G.game; const city = g.city; const COL = city.col; const PE = g.peds; const CL = __G.neon.bldg.clut;
  const [CX, CZ] = window.CL_CAM; const RAD = window.CL_R || 120; const R = 0.35; const tmp = [];
  const inR = (x, z) => Math.hypot(x - CX, z - CZ) < RAD;
  // drain the lane solver (distance queue + clutter re-plans)
  const W = city._warm; let it = 0; for (; it < 4000; it++) { city.pedWarm(PE, g.P.pos); const q = city._warm; if (q && !q.q.length && !q.pri.length && it > 5) break; }
  const recs = CL.recs.filter((r) => r.tris && inR(r.x, r.z));
  const dBox = (b, x, z) => { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)); };
  const dR = (r, x, z) => { const rx = x - r.x, rz = z - r.z; const la = rx * r.ux + rz * r.uz, lw = -rx * r.uz + rz * r.ux; return Math.hypot(Math.max(0, Math.abs(la) - r.hl), Math.max(0, Math.abs(lw) - r.hw)); };
  // ---- A
  const HC = 8; const H = new Map(); for (const r of recs) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; const t = r.tris; for (let i = 0; i < t.length; i += 2) { x0 = Math.min(x0, t[i]); x1 = Math.max(x1, t[i]); z0 = Math.min(z0, t[i + 1]); z1 = Math.max(z1, t[i + 1]); } r.bb = [x0, z0, x1, z1];
    for (let i = Math.floor(x0 / HC); i <= Math.floor(x1 / HC); i++) for (let j = Math.floor(z0 / HC); j <= Math.floor(z1 / HC); j++) { const k = i * 100003 + j; let l = H.get(k); if (!l) H.set(k, l = []); l.push(r); } }
  function edt1(f, n, d, v, z) { let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20; for (let q = 1; q < n; q++) { let s; for (;;) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; } k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } }
  const RES = 0.05, MG = 0.9, S = 0.25; const seen = new Set(); const A = { recs: recs.length, pts: 0, clip: 0, clipSoft: 0, stuck: 0, byKind: {} }; const BIG = 1e12;
  const kst = (k) => A.byKind[k] || (A.byKind[k] = { n: 0, clip: 0, stuck: 0 });
  for (const r of recs) { kst(r.k).n++;
    const x0 = r.bb[0] - MG, z0 = r.bb[1] - MG, x1 = r.bb[2] + MG, z1 = r.bb[3] + MG; const nx = Math.ceil((x1 - x0) / RES) + 1, nz = Math.ceil((z1 - z0) / RES) + 1;
    const gr = new Float64Array(nx * nz).fill(BIG); const mark = (x, z) => { const i = Math.round((x - x0) / RES), j = Math.round((z - z0) / RES); if (i >= 0 && j >= 0 && i < nx && j < nz) gr[j * nx + i] = 0; };
    const others = new Set(); for (let i = Math.floor(x0 / HC); i <= Math.floor(x1 / HC); i++) for (let j = Math.floor(z0 / HC); j <= Math.floor(z1 / HC); j++) for (const o of H.get(i * 100003 + j) || []) if (o.bb[2] > x0 && o.bb[0] < x1 && o.bb[3] > z0 && o.bb[1] < z1) others.add(o);
    for (const o of others) { const t = o.tris; for (let q = 0; q < t.length; q += 6) { const ax = t[q], az = t[q + 1], bx = t[q + 2], bz = t[q + 3], cx = t[q + 4], cz = t[q + 5];
      for (const [px, pz, qx, qz] of [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]]) { const n = Math.ceil(Math.hypot(qx - px, qz - pz) / (RES * 0.5)) + 1; for (let s = 0; s <= n; s++) mark(px + (qx - px) * s / n, pz + (qz - pz) * s / n); }
      const ar = (bx - ax) * (cz - az) - (cx - ax) * (bz - az); if (Math.abs(ar) < 1e-5) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / RES)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / RES)), j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / RES)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = x0 + i * RES, pz = z0 + j * RES; const w0 = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / ar, w1 = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / ar; if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) gr[j * nx + i] = 0; } } }
    const n = Math.max(nx, nz); const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
    for (let i = 0; i < nx; i++) { for (let j = 0; j < nz; j++) f[j] = gr[j * nx + i]; edt1(f, nz, d, v, zz); for (let j = 0; j < nz; j++) gr[j * nx + i] = d[j]; }
    for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) f[i] = gr[j * nx + i]; edt1(f, nx, d, v, zz); for (let i = 0; i < nx; i++) gr[j * nx + i] = d[i]; }
    for (let x = Math.ceil(x0 / S) * S; x <= x1; x += S) for (let z = Math.ceil(z0 / S) * S; z <= z1; z += S) {
      const key = Math.round(x / S) * 1000003 + Math.round(z / S); if (seen.has(key)) continue; seen.add(key);
      const dv = Math.sqrt(gr[Math.round((z - z0) / RES) * nx + Math.round((x - x0) / RES)]) * RES; if (dv > 0.8) continue; A.pts++;
      let dA = 9, dC = 9; for (const b of COL.query(x, z, 1, tmp)) { if (b.h < 0.3) continue; const e = dBox(b, x, z); if (e < dA) dA = e; if (b.tag === 'clut' && e < dC) dC = e; }
      let kk = r.k, bd = 1e9; for (const o of others) { const e = dR(o, x, z); if (e < bd) { bd = e; kk = o.k; } } const K = kst(kk);
      if (dA >= 0.35 && dv < 0.25) { if (kk === 'trash') A.clipSoft++; else { A.clip++; K.clip++; } }
      if (dC < 0.35 && dv >= 0.5) { A.stuck++; K.stuck++; } } }
  // ---- B
  const RH = new Map(); for (const r of CL.recs) { const k = Math.floor(r.x / 10) * 100003 + Math.floor(r.z / 10); let l = RH.get(k); if (!l) RH.set(k, l = []); l.push(r); }
  const nearRecs = (x, z) => { const o = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const r of RH.get((Math.floor(x / 10) + i) * 100003 + Math.floor(z / 10) + j) || []) o.push(r); return o; };
  const lane = !!city.pedPath; const paths = PE.paths.filter((p) => Math.hypot(p.mx - CX, p.mz - CZ) < RAD + p.L / 2);
  const at = (p, u) => lane && p._lane ? city.pathLanePoint(p._lane, p, u) : PE.pathPoint(p, u);
  const B = { paths: paths.length, solved: paths.filter((p) => p._lane).length, stale: paths.filter((p) => p._stale).length, nearPts: 0, contact: 0, deep: 0, trash: 0, any: 0, anyByTag: {} };
  const SK = new Set(['shop', 'trim', 'gap', 'alley']);
  for (const p of paths) for (let u = 0; u < p.L; u += 0.5) { const q = at(p, u); if (!inR(q.x, q.z)) continue; const nr = nearRecs(q.x, q.z); let near = false, mC = 9, mT = 9;
    for (const r of nr) { const d = dR(r, q.x, q.z); if (d < 3) near = true; if (r.k === 'trash') mT = Math.min(mT, d); else mC = Math.min(mC, d); } if (!near) continue; B.nearPts++;
    if (mC < R) { B.contact++; if (mC < 0.15) B.deep++; } if (mT < R) B.trash++;
    let m = 9, tg = null; for (const b of COL.query(q.x, q.z, 1.2, tmp)) { if (b.h < 0.5 || SK.has(b.tag)) continue; const e = dBox(b, q.x, q.z); if (e < m) { m = e; tg = b.tag; } } if (m < R) { B.any++; B.anyByTag[tg] = (B.anyByTag[tg] || 0) + 1; } }
  // ---- C
  const nearest = (x, z) => { let m = 9, tg = null; for (const b of COL.query(x, z, 1.2, tmp)) { if (b.h < 0.5 || SK.has(b.tag)) continue; const e = dBox(b, x, z); if (e < m) { m = e; tg = b.tag; } } return [m, tg]; };
  const clutNear = (x, z) => { let m = 9; for (const r of nearRecs(x, z)) if (r.k !== 'trash') m = Math.min(m, dR(r, x, z)); return m; };
  const crowd = (N) => {
    for (const c of [...PE.list]) PE.remove(c);
    const sv = { loops: PE.loops, reg: city.region, spawn: PE.spawn }; PE.loops = []; city.region = null;
    let tries = 0; while (PE.list.length < N && tries++ < 800) PE.spawn(g.P.pos, 6, 85);
    PE.loops = sv.loops; city.region = sv.reg; PE.spawn = () => null;
    const Wk = PE.list.slice(); for (const c of Wk) c.ai.wait = 0;
    const st = { peds: Wk.length, frames: 0, samples: 0, contact: 0, contactByTag: {}, clutVis: 0, pushed: 0, pushedClut: 0, stallEv: 0, stallPeds: 0, maxStall: 0 };
    const last = Wk.map((c) => ({ x: c.pos.x, z: c.pos.z, f: 0, walk: 0, run: 0, any: false, dir: c.ai.dir, flip: false }));
    for (let f = 1; f <= 200; f++) { __G.step(1); st.frames++;
      Wk.forEach((c, i) => { if (c.dead) return; const a = c.ai; st.samples++; const [m, tg] = nearest(c.pos.x, c.pos.z);
        if (m < R - 0.02) { st.contact++; st.contactByTag[tg] = (st.contactByTag[tg] || 0) + 1; }
        if (clutNear(c.pos.x, c.pos.z) < R - 0.02) st.clutVis++;
        let want = null; if (a.mode === 'walk' && a.path && a.wait <= 0) want = at(a.path, a.u);
        if (want && Math.hypot(want.x - c.pos.x, want.z - c.pos.z) > 0.03) { st.pushed++; if (tg === 'clut' && m < R + 0.03) st.pushedClut++; }
        const L = last[i]; if (a.wait <= 0) L.walk++; if (a.dir !== L.dir) { L.flip = true; L.dir = a.dir; }
        if (f - L.f >= 30) { const dd = Math.hypot(c.pos.x - L.x, c.pos.z - L.z); if (L.walk >= 28 && dd < 0.3 && L.flip) st.turnEv = (st.turnEv || 0) + 1; else if (L.walk >= 28 && dd < 0.3) { st.stallEv++; L.run++; L.any = true; st.maxStall = Math.max(st.maxStall, L.run * 30); } else L.run = 0; L.x = c.pos.x; L.z = c.pos.z; L.f = f; L.walk = 0; L.flip = false; } });
    }
    st.stallPeds = last.filter((l) => l.any).length; PE.spawn = sv.spawn; return st;
  };
  const C = {}; for (const n of (window.CL_N || [16, 32])) C['n' + n] = crowd(n);
  const ps = city._pedStats || {};
  return JSON.stringify({ cam: [CX, CZ], R: RAD, warmIters: it, clut: CL.stats, A, B, crowd: C, ped: { clutBoxes: ps.clutBoxes, clutDirty: ps.clutDirty, resolveN: ps.resolveN, warmN: ps.warmN, syncN: ps.syncN }, boxes: COL.boxes.length, ms: Math.round(performance.now() - t0) });
})()
