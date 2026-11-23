(() => {
  // b_streetpeds census: road-graph sidewalk path lanes (+ Deco loops) vs street furniture, live crowds on the paths, spawn hitch.
  // window.SP_CAM = [x, z], window.SP_R = radius, window.SP_N = crowd sizes
  const t0 = performance.now();
  const g = __G.game; const city = g.city; const COL = city.col; const PE = g.peds; const [CAMX, CAMZ] = window.SP_CAM || [166.2, 516]; const RAD = window.SP_R || 250;
  const ST0 = JSON.parse(JSON.stringify(city._pedStats || {}));
  const SK = new Set(['shop', 'trim', 'gap', 'alley']); const R = 0.35;
  const bd = (b, x, z) => { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)); };
  // props drawn without a collider before b_palmloop / this lane, checked by geometry in both runs (bollards at the promenade crossings)
  const XP = []; for (const z of [-300, -150, 0, 150, 300]) for (let k = -3; k <= 3; k++) { if (Math.abs(k) < 1) continue; XP.push([299.4, z + k * 1.6, 0.12, 'bollard']); }
  const tmp = [];
  const nearest = (x, z) => { let m = 9, tg = null; for (const b of COL.query(x, z, 1.2, tmp)) { if (b.h < 0.5 || SK.has(b.tag)) continue; const e = bd(b, x, z); if (e < m) { m = e; tg = b.tag; } }
    for (const p of XP) { const e = Math.hypot(x - p[0], z - p[1]) - p[2]; if (e < m) { m = e; tg = p[3]; } } return [m, tg]; };
  const inR = (x, z) => Math.hypot(x - CAMX, z - CAMZ) < RAD;
  const paths = PE.paths.filter((p) => Math.hypot(p.mx - CAMX, p.mz - CAMZ) < RAD + p.L / 2);
  const lane = !!city.pedPath;
  // ---- timing of a cold solve of these lanes (lanes dropped, re-solved synchronously); restored afterwards
  const tS = performance.now(); let maxOne = 0, nSolved = 0;
  if (lane) for (const p of paths) { const keep = p._lane; p._lane = null; p._job = null; const a = performance.now(); city.pedPath(p); const ms = performance.now() - a; if (ms > maxOne) maxOne = ms; nSolved++;
    if (keep) { const L2 = p._lane; let dif = 0; for (let i = 0; i < L2.n; i++) dif = Math.max(dif, Math.abs(L2.prof[i] - keep.prof[i])); p._ldiff = dif; } }
  const solve = { paths: nSolved, ms: Math.round(performance.now() - tS), maxOne: +maxOne.toFixed(1), streamDiffMax: +Math.max(0, ...paths.map((p) => p._ldiff || 0)).toFixed(2) };
  // ---- 1: lane points every 0.5 m (inside RAD)
  const at = (p, u) => lane ? city.pathLanePoint(city.pedPath(p), p, u) : PE.pathPoint(p, u);
  const P = { paths: paths.length, pts: 0, contact: 0, deep: 0, byTag: {}, deepByTag: {}, minClear: 9, maxJump: 0, offWalk: 0, kerbHist: {}, ex: [] };
  for (const p of paths) { let prev = null; const e = p.e;
    for (let u = 0; u < p.L; u += 0.5) { const q = at(p, u); if (!inR(q.x, q.z)) { prev = null; continue; } P.pts++; const [m, tg] = nearest(q.x, q.z); P.minClear = Math.min(P.minClear, m - R);
      if (prev) P.maxJump = Math.max(P.maxJump, Math.hypot(q.x - prev.x, q.z - prev.z)); prev = q;
      if (!(city.groundH(q.x, q.z) > 0.1)) P.offWalk++;
      if (e) { const n = city.graph.index.near(q.x, q.z, false); if (n && n.e === e) { const hk = ((n.d - e.hw) / e.sw).toFixed(1); P.kerbHist[hk] = (P.kerbHist[hk] || 0) + 1; } }
      if (m < R) { P.contact++; P.byTag[tg] = (P.byTag[tg] || 0) + 1; if (P.ex.length < 8) P.ex.push([+q.x.toFixed(1), +q.z.toFixed(1), tg, +m.toFixed(2)]); }
      if (m < 0.15) { P.deep++; P.deepByTag[tg] = (P.deepByTag[tg] || 0) + 1; } } }
  P.minClear = +P.minClear.toFixed(3); P.maxJump = +P.maxJump.toFixed(3);
  // Deco block loops in range (b_palmloop lanes; must stay at 0)
  const PL = { loops: 0, pts: 0, contact: 0, byTag: {} };
  if (city.pedLoop) for (const b of PE.loops) { if (Math.hypot((b.x0 + b.x1) / 2 - CAMX, (b.z0 + b.z1) / 2 - CAMZ) > RAD) continue; const L = city.pedLoop(b); PL.loops++;
    for (let u = 0; u < L.per; u += 0.5) { const q = city.lanePoint(L, u); PL.pts++; const [m, tg] = nearest(q.x, q.z); if (m < R) { PL.contact++; PL.byTag[tg] = (PL.byTag[tg] || 0) + 1; } } }
  // the old census metric (b_coreflow D): path points inside a collider grown by nothing (point blocked)
  // ---- 2: live crowds on the paths (200 frames each); loops / mainland lines disabled while they spawn
  const crowd = (N) => {
    for (const c of [...PE.list]) PE.remove(c);
    const sv = { loops: PE.loops, reg: city.region, spawn: PE.spawn }; PE.loops = []; city.region = null;
    let tries = 0; while (PE.list.length < N && tries++ < 800) PE.spawn(g.P.pos, 6, 85);
    PE.loops = sv.loops; city.region = sv.reg; PE.spawn = () => null;
    const W = PE.list.slice(); for (const c of W) c.ai.wait = 0;
    const st = { peds: W.length, frames: 0, samples: 0, contact: 0, deep: 0, contactByTag: {}, pushed: 0, stallEv: 0, stallPeds: 0, maxStall: 0, pairs: 0 };
    const last = W.map((c) => ({ x: c.pos.x, z: c.pos.z, f: 0, walk: 0, run: 0, any: false, dir: c.ai.dir, flip: false }));
    for (let f = 1; f <= 200; f++) { __G.step(1); st.frames++;
      W.forEach((c, i) => { if (c.dead) return; const a = c.ai; st.samples++; const [m, tg] = nearest(c.pos.x, c.pos.z);
        if (m < R - 0.02) { st.contact++; st.contactByTag[tg] = (st.contactByTag[tg] || 0) + 1; } if (m < 0.15) st.deep++;
        let want = null; if (a.mode === 'walk' && a.path && a.wait <= 0) want = at(a.path, a.u);
        if (want && Math.hypot(want.x - c.pos.x, want.z - c.pos.z) > 0.03) st.pushed++;
        const L = last[i]; if (a.wait <= 0) L.walk++; if (a.dir !== L.dir) { L.flip = true; L.dir = a.dir; }
        if (f - L.f >= 30) { const dd = Math.hypot(c.pos.x - L.x, c.pos.z - L.z); if (L.walk >= 28 && dd < 0.3 && L.flip) st.turnEv = (st.turnEv || 0) + 1; else if (L.walk >= 28 && dd < 0.3) { st.stallEv++; L.run++; L.any = true; st.maxStall = Math.max(st.maxStall, L.run * 30); } else L.run = 0; L.x = c.pos.x; L.z = c.pos.z; L.f = f; L.walk = 0; L.flip = false; } });
    }
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) if (Math.hypot(W[i].pos.x - W[j].pos.x, W[i].pos.z - W[j].pos.z) < 0.45) pairs0++;
    st.pairs = pairs0; pairs0 = 0; st.stallPeds = last.filter((l) => l.any).length; PE.spawn = sv.spawn; return st;
  };
  let pairs0 = 0;
  const C = {}; for (const n of (window.SP_N || [16, 32])) C['n' + n] = crowd(n);
  return JSON.stringify({ cam: [CAMX, CAMZ], lane, propCols: city._propCols || null, solve, P, PL, crowd: C, stats0: ST0, stats: city._pedStats || null, ms: Math.round(performance.now() - t0) });
})()
