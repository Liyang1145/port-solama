(() => {
  // b_palmloop census: Deco block-loop lanes vs street furniture (palms / trees / poles / signs / news boxes / hydrants / bins …)
  // + live crowds (N walkers forced onto the loops near the camera, 200 frames). window.PL_N = list of crowd sizes.
  const t0 = performance.now();
  const g = __G.game; const city = g.city; const COL = city.col; const PE = g.peds; const CAMX = window.PL_X || 178, CAMZ = window.PL_Z || 15, RAD = window.PL_R || 400;
  const SK = new Set(['shop', 'trim', 'gap', 'alley']); const R = 0.35;
  const bd = (b, x, z) => { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)); };
  // props drawn without a collider before this lane (same positions as pedlane.addPropCols): checked by geometry in both runs
  const RH = 7; const onWalk = (x, z) => city.groundH(x, z) > 0.1 && city.blockAt(x, z);
  const occ = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
  const XP = []; // [x, z, r, tag]
  for (const it of city.inters) { if (it.x >= -160) { const hx = it.x + 8, hz = it.z + 9.5, bx = it.x - 8, bz = it.z - 10; if (onWalk(hx, hz)) XP.push([hx, hz, 0.17, 'hyd']); if (onWalk(bx, bz)) XP.push([bx, bz, 0.3, 'bin']); }
    const tx = it.x + RH + 1.2, tz = it.z - (RH + 3.2); if (!occ(tx, tz, 1.0) && onWalk(tx, tz)) XP.push([tx, tz, 0.3, 'bin']); }
  const EW = [...new Set(city.inters.filter((it) => Math.abs(it.x - 290) < 1).map((it) => it.z))];
  for (const z of EW) for (let k = -3; k <= 3; k++) { if (Math.abs(k) < 1) continue; if (onWalk(299.4, z + k * 1.6)) XP.push([299.4, z + k * 1.6, 0.12, 'bollard']); }
  for (const s of city.segs) { if (!(s.axis === 'z' && s.c === 290)) continue; for (let z = s.a0 + 13.4; z < s.a1 - 10; z += 6.8) if (!occ(282.3, z, 0.8)) XP.push([282.3, z, 0.1, 'meter']); }
  const XI = new Map(); const xk = (x, z) => Math.floor(x / 8) + ',' + Math.floor(z / 8); for (const p of XP) { const k = xk(p[0], p[1]); (XI.get(k) || XI.set(k, []).get(k)).push(p); }
  const tmp = [];
  // nearest obstacle (distance from a point to its visible footprint) and its tag
  const nearest = (x, z) => { let m = 9, tg = null; for (const b of COL.query(x, z, 1.2, tmp)) { if (b.h < 0.5 || SK.has(b.tag)) continue; const e = bd(b, x, z); if (e < m) { m = e; tg = b.tag; } }
    const fx = Math.floor(x / 8), fz = Math.floor(z / 8); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of XI.get((fx + i) + ',' + (fz + j)) || []) { const e = Math.hypot(x - p[0], z - p[1]) - p[2]; if (e < m) { m = e; tg = p[3]; } }
    return [m, tg]; };
  const loops = PE.loops.filter((b) => Math.hypot((b.x0 + b.x1) / 2 - CAMX, (b.z0 + b.z1) / 2 - CAMZ) < RAD);
  const laneOf = (b) => { if (city.pedLoop) { const L = city.pedLoop(b); return { per: L.per, at: (u) => city.lanePoint(L, u) }; }
    const sw = b.area === 'promenade' ? 3 : 2.2; const x0 = b.x0 + sw, x1 = b.x1 - sw, z0 = b.z0 + sw, z1 = b.z1 - sw; return { per: 2 * (x1 - x0 + z1 - z0), at: (u) => PE.loopPoint(x0, z0, x1, z1, u) }; };
  // ---- 1: lane points every 0.5 m
  const P = { loops: loops.length, pts: 0, contact: 0, deep: 0, byTag: {}, deepByTag: {}, minClear: 9, maxJump: 0, insetHist: {}, ex: [] };
  const tl = performance.now();
  for (const b of loops) { const L = laneOf(b); let prev = null;
    for (let u = 0; u < L.per; u += 0.5) { const q = L.at(u); P.pts++; const [m, tg] = nearest(q.x, q.z); P.minClear = Math.min(P.minClear, m - R);
      if (prev) P.maxJump = Math.max(P.maxJump, Math.hypot(q.x - prev.x, q.z - prev.z)); prev = q;
      const ins = Math.min(q.x - b.x0, b.x1 - q.x, q.z - b.z0, b.z1 - q.z); const hk = (Math.round(ins * 4) / 4).toFixed(2); P.insetHist[hk] = (P.insetHist[hk] || 0) + 1;
      if (m < R) { P.contact++; P.byTag[tg] = (P.byTag[tg] || 0) + 1; if (P.ex.length < 8) P.ex.push([+q.x.toFixed(1), +q.z.toFixed(1), tg, +m.toFixed(2), +ins.toFixed(2)]); }
      if (m < 0.15) { P.deep++; P.deepByTag[tg] = (P.deepByTag[tg] || 0) + 1; } } }
  P.minClear = +P.minClear.toFixed(3); P.maxJump = +P.maxJump.toFixed(3); P.ms = Math.round(performance.now() - tl);
  // ---- 2: street furniture that walkers / the player can pass through (no collider over a visible trunk / post)
  const F = { palms: 0, palmNoCol: 0, trees: 0, treeNoCol: 0, lamps: 0, lampNoCol: 0, props: XP.length, propNoCol: 0, propKinds: {} };
  const hasCol = (x, z, tags) => COL.query(x, z, 0.5, tmp).some((b) => tags.includes(b.tag) && x >= b.minX - 0.01 && x <= b.maxX + 0.01 && z >= b.minZ - 0.01 && z <= b.maxZ + 0.01);
  const inR = (x, z) => Math.hypot(x - CAMX, z - CAMZ) < RAD;
  for (const p of city.palms) if (inR(p.x, p.z)) { F.palms++; if (!hasCol(p.x, p.z, ['palm'])) F.palmNoCol++; }
  for (const t of city.trees) if (inR(t.x, t.z)) { F.trees++; if (!hasCol(t.x, t.z, ['tree'])) F.treeNoCol++; }
  for (const l of city.lamps) if (inR(l.x, l.z)) { F.lamps++; if (!hasCol(l.x, l.z, ['pole'])) F.lampNoCol++; }
  for (const p of XP) { if (!inR(p[0], p[1])) continue; F.propKinds[p[3]] = (F.propKinds[p[3]] || 0) + 1; if (!hasCol(p[0], p[1], [p[3]])) F.propNoCol++; }
  // ---- 3: live crowds on the loops (200 frames each)
  const crowd = (N) => {
    for (const c of [...PE.list]) PE.remove(c);
    const sv = { paths: PE.paths, reg: city.region, spawn: PE.spawn }; PE.paths = []; city.region = null;
    let tries = 0; while (PE.list.length < N && tries++ < 800) PE.spawn(g.P.pos, 6, 85);
    PE.paths = sv.paths; city.region = sv.reg; PE.spawn = () => null;
    const W = PE.list.slice(); for (const c of W) c.ai.wait = 0;
    const st = { peds: W.length, frames: 0, samples: 0, contact: 0, deep: 0, deepByTag: {}, contactByTag: {}, pushed: 0, stallEv: 0, stallPeds: 0, maxStall: 0, pairs: 0 };
    const last = W.map((c) => ({ x: c.pos.x, z: c.pos.z, f: 0, walk: 0, run: 0, any: false, dir: c.ai.dir, flip: false }));
    for (let f = 1; f <= 200; f++) { __G.step(1); st.frames++;
      W.forEach((c, i) => { if (c.dead) return; const a = c.ai; st.samples++; const [m, tg] = nearest(c.pos.x, c.pos.z);
        if (m < R - 0.02) { st.contact++; st.contactByTag[tg] = (st.contactByTag[tg] || 0) + 1; } if (m < 0.15) { st.deep++; st.deepByTag[tg] = (st.deepByTag[tg] || 0) + 1; }
        let want = null; if (a.mode === 'walk' && a.loop) want = a.loop[5] ? city.lanePoint(a.loop[5], a.u) : PE.loopPoint(a.loop[0], a.loop[1], a.loop[2], a.loop[3], a.u);
        if (want && Math.hypot(want.x - c.pos.x, want.z - c.pos.z) > 0.03) st.pushed++;
        const L = last[i]; if (a.wait <= 0) L.walk++; if (a.dir !== L.dir) { L.flip = true; L.dir = a.dir; }
        if (f - L.f >= 30) { const dd = Math.hypot(c.pos.x - L.x, c.pos.z - L.z); if (L.walk >= 28 && dd < 0.3 && L.flip) st.turnEv = (st.turnEv || 0) + 1; else if (L.walk >= 28 && dd < 0.3) { st.stallEv++; L.run++; L.any = true; st.maxStall = Math.max(st.maxStall, L.run * 30); } else L.run = 0; L.x = c.pos.x; L.z = c.pos.z; L.f = f; L.walk = 0; L.flip = false; } });
    }
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) if (Math.hypot(W[i].pos.x - W[j].pos.x, W[i].pos.z - W[j].pos.z) < 0.45) st.pairs++;
    st.stallPeds = last.filter((l) => l.any).length; PE.spawn = sv.spawn; return st;
  };
  const C = {}; for (const n of (window.PL_N || [16, 32])) C['n' + n] = crowd(n);
  return JSON.stringify({ off: /nopalmloop/.test(location.search), lane: !!city.pedLoop, propCols: city._propCols || null, P, F, crowd: C, ms: Math.round(performance.now() - t0) });
})()
