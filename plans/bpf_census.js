(() => {
  // b_parcelfit census: building colliders of the streamed parcels vs the drawn building meshes (walking-height slices).
  // window.PF_CAM = [x, z], window.PF_R = radius. Grid 0.125 m in each parcel's own frame, margin 3 m; "points" = 0.25 m lattice.
  const t0 = performance.now();
  const g = __G.game; const city = g.city; const COL = city.col; const ST = __G.stream; const BL = __G.neon.bldg; const FIT = BL && BL.fit;
  const [CX, CZ] = window.PF_CAM; const RAD = window.PF_R || 160; const H = 0.125, M = 3, PR = 0.35; const YS = [0.35, 0.9, 1.5];
  const SKIP = /^(steam|nglow|nrefl|neon|cone|cnsign|signface|puddle|glassRail)\|/;
  // ---- slice every loaded near mesh (stream chunks + street-structure layer) at the walking heights -> world xz segments
  const SG = [[], []]; // 0: building meshes, 1: small clutter (vcolD)
  const chunks = [...ST.chunks.values()].filter((c) => c.near && Math.hypot(c.cx - CX, c.cz - CZ) < RAD + 150);
  const meshes = []; for (const c of chunks) { for (const m of c.near) meshes.push(m); const b = BL.built.get(c.key); if (b) for (const m of b) meshes.push(m); }
  let tri = 0; const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const m of meshes) { if (SKIP.test(m.name)) continue; const L = m.name.startsWith('vcolD|') ? 1 : 0; const out = SG[L];
    const pa = m.geometry.attributes.position; if (!pa || !pa.array) continue; const A = pa.array; const I = m.geometry.index ? m.geometry.index.array : null; m.updateMatrixWorld(); const E = m.matrixWorld.elements;
    const ident = E[0] === 1 && E[5] === 1 && E[10] === 1 && !E[12] && !E[13] && !E[14] && !E[1] && !E[2] && !E[4] && !E[6] && !E[8] && !E[9];
    const n = I ? I.length : A.length / 3;
    for (let t = 0; t < n; t += 3) { tri++;
      for (let k = 0; k < 3; k++) { const i = (I ? I[t + k] : t + k) * 3; let x = A[i], y = A[i + 1], z = A[i + 2];
        if (!ident) { const X = E[0] * x + E[4] * y + E[8] * z + E[12], Y = E[1] * x + E[5] * y + E[9] * z + E[13], Z = E[2] * x + E[6] * y + E[10] * z + E[14]; x = X; y = Y; z = Z; }
        v[k * 3] = x; v[k * 3 + 1] = y; v[k * 3 + 2] = z; }
      const y0 = Math.min(v[1], v[4], v[7]), y1 = Math.max(v[1], v[4], v[7]); if (y1 < 0.3 || y0 > 1.55) continue;
      if (Math.hypot(v[0] - CX, v[2] - CZ) > RAD + 80) continue;
      for (const Y of YS) { if (Y < y0 || Y > y1) continue; const P = [];
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const ya = v[a * 3 + 1], yb = v[b * 3 + 1]; if ((ya - Y) * (yb - Y) < 0 || (ya === Y && yb !== Y)) { const s = (Y - ya) / (yb - ya); P.push(v[a * 3] + (v[b * 3] - v[a * 3]) * s, v[a * 3 + 2] + (v[b * 3 + 2] - v[a * 3 + 2]) * s); } }
        if (P.length >= 4) out.push(P[0], P[1], P[2], P[3]); } } }
  // spatial hash of segments (8 m)
  const HS = 8; const hash = [new Map(), new Map()];
  for (let L = 0; L < 2; L++) { const S = SG[L]; for (let i = 0; i < S.length; i += 4) { const x0 = Math.min(S[i], S[i + 2]), x1 = Math.max(S[i], S[i + 2]), z0 = Math.min(S[i + 1], S[i + 3]), z1 = Math.max(S[i + 1], S[i + 3]);
    for (let a = Math.floor(x0 / HS); a <= Math.floor(x1 / HS); a++) for (let b = Math.floor(z0 / HS); b <= Math.floor(z1 / HS); b++) { const k = a * 100003 + b; let l = hash[L].get(k); if (!l) hash[L].set(k, l = []); l.push(i); } } }
  const tSlice = performance.now() - t0;
  // ---- helpers
  const dBox = (b, x, z) => { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; return Math.hypot(Math.max(0, Math.abs(la) - o.hl), Math.max(0, Math.abs(lw) - o.hw)); }
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)); };
  const inBox = (b, x, z) => dBox(b, x, z) === 0;
  // exact-ish Euclidean distance transform (nearest-site propagation, two passes) -> metres
  const edt = (src, W, Hh) => { const N = W * Hh; const sx = new Int32Array(N).fill(-1), sz = new Int32Array(N); const d = new Float32Array(N).fill(1e9);
    for (let i = 0; i < N; i++) if (src[i]) { sx[i] = i % W; sz[i] = (i / W) | 0; d[i] = 0; }
    const relax = (i, j) => { if (sx[j] < 0) return; const x = i % W, z = (i / W) | 0; const e = (x - sx[j]) ** 2 + (z - sz[j]) ** 2; if (e < d[i]) { d[i] = e; sx[i] = sx[j]; sz[i] = sz[j]; } };
    for (let z = 0; z < Hh; z++) { for (let x = 0; x < W; x++) { const i = z * W + x; if (x > 0) relax(i, i - 1); if (z > 0) { relax(i, i - W); if (x > 0) relax(i, i - W - 1); if (x < W - 1) relax(i, i - W + 1); } } for (let x = W - 2; x >= 0; x--) relax(z * W + x, z * W + x + 1); }
    for (let z = Hh - 1; z >= 0; z--) { for (let x = W - 1; x >= 0; x--) { const i = z * W + x; if (x < W - 1) relax(i, i + 1); if (z < Hh - 1) { relax(i, i + W); if (x < W - 1) relax(i, i + W + 1); if (x > 0) relax(i, i + W - 1); } } for (let x = 1; x < W; x++) relax(z * W + x, z * W + x - 1); }
    for (let i = 0; i < N; i++) d[i] = d[i] >= 1e9 ? 1e3 : Math.sqrt(d[i]) * H; return d; };
  // ---- parcels in range whose near detail is built
  const loaded = new Set(); for (const c of chunks) for (const p of c.parcels) if (!p.far) loaded.add(p);
  const PS = [...loaded].filter((p) => Math.hypot(p.x - CX, p.z - CZ) < RAD);
  const ALLP = city.parcels.filter((p) => !p.far && Math.hypot(p.x - CX, p.z - CZ) < RAD + 120);
  const rectD = (p, x, z) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); const dx = x - p.x, dz = z - p.z; const u = dx * c + dz * s, w = -dx * s + dz * c; return Math.hypot(Math.max(0, Math.abs(u) - p.d / 2), Math.max(0, Math.abs(w) - p.w / 2)); };
  const T = { parcels: PS.length, meshes: meshes.length, tri, seg: SG[0].length / 4, segProps: SG[1].length / 4, pts: 0, protrMax: 0, protr03: 0, protrPts: 0, walkPts: 0, roadPts: 0, walkInvis: 0, roadInvis: 0, walkParcels: 0,
    stuck: 0, stuckParcels: 0, clip: 0, clipDeep: 0, clipParcels: 0, byStyle: {}, worst: [], clipEx: [], stuckEx: [], leak: 0 };
  const tmp = []; const CH = {}; const PER = {};
  for (const p of PS) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang); const hx = p.d / 2 + M, hz = p.w / 2 + M; const W = Math.ceil(2 * hx / H), Hh = Math.ceil(2 * hz / H), N = W * Hh;
    const toW = (ix, iz) => { const lx = -hx + (ix + 0.5) * H, lz = -hz + (iz + 0.5) * H; return [p.x + lx * c - lz * s, p.z + lx * s + lz * c]; };
    const mark = [new Uint8Array(N), new Uint8Array(N)];
    const R = Math.hypot(hx, hz);
    for (let L = 0; L < 2; L++) { const S = SG[L]; const seen = new Set();
      for (let a = Math.floor((p.x - R) / HS); a <= Math.floor((p.x + R) / HS); a++) for (let b = Math.floor((p.z - R) / HS); b <= Math.floor((p.z + R) / HS); b++) { const l = hash[L].get(a * 100003 + b); if (!l) continue;
        for (const i of l) { if (seen.has(i)) continue; seen.add(i);
          const ax = S[i] - p.x, az = S[i + 1] - p.z, bx = S[i + 2] - p.x, bz = S[i + 3] - p.z; const u0 = ax * c + az * s + hx, w0 = -ax * s + az * c + hz, u1 = bx * c + bz * s + hx, w1 = -bx * s + bz * c + hz;
          const len = Math.hypot(u1 - u0, w1 - w0); const n = Math.max(1, Math.ceil(len / (H * 0.5)));
          for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n, w = w0 + (w1 - w0) * k / n; const ix = Math.floor(u / H), iz = Math.floor(w / H); if (ix >= 0 && iz >= 0 && ix < W && iz < Hh) mark[L][iz * W + ix] = 1; } } } }
    // building solid = walls + what they enclose (flood the outside from the border, 4-connected)
    const out = new Uint8Array(N); const q = new Int32Array(N); let qh = 0, qt = 0; const push = (i) => { if (!out[i] && !mark[0][i]) { out[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((Hh - 1) * W + x); } for (let z = 0; z < Hh; z++) { push(z * W); push(z * W + W - 1); }
    while (qh < qt) { const i = q[qh++]; const x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < N - W) push(i + W); }
    const S0 = new Uint8Array(N), SA = new Uint8Array(N), C = new Uint8Array(N), CA = new Uint8Array(N);
    const bl = COL.query(p.x, p.z, R + 1, tmp).filter((b) => b.h >= 0.5); const bb = bl.filter((b) => b.tag === 'bld');
    const nb = ALLP.filter((o) => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < R + Math.hypot(o.d, o.w) / 2 + M); // every lot competes for a cell (a lot outside the census owns its cells)
    const own = new Uint8Array(N);
    for (const b of bl) { const K = b.o ? [[b.o.cx + b.o.ux * b.o.hl - b.o.uz * b.o.hw, b.o.cz + b.o.uz * b.o.hl + b.o.ux * b.o.hw], [b.o.cx + b.o.ux * b.o.hl + b.o.uz * b.o.hw, b.o.cz + b.o.uz * b.o.hl - b.o.ux * b.o.hw], [b.o.cx - b.o.ux * b.o.hl - b.o.uz * b.o.hw, b.o.cz - b.o.uz * b.o.hl + b.o.ux * b.o.hw], [b.o.cx - b.o.ux * b.o.hl + b.o.uz * b.o.hw, b.o.cz - b.o.uz * b.o.hl - b.o.ux * b.o.hw]] : [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
      let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9; for (const [x, z] of K) { const dx = x - p.x, dz = z - p.z; const u = dx * c + dz * s + hx, w = -dx * s + dz * c + hz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
      const a0 = Math.max(0, Math.floor(u0 / H)), a1 = Math.min(W - 1, Math.floor(u1 / H)), b0 = Math.max(0, Math.floor(w0 / H)), b1 = Math.min(Hh - 1, Math.floor(w1 / H)); const isB = b.tag === 'bld';
      for (let iz = b0; iz <= b1; iz++) for (let ix = a0; ix <= a1; ix++) { const i = iz * W + ix; if (CA[i] && (C[i] || !isB)) continue; const [x, z] = toW(ix, iz); if (inBox(b, x, z)) { CA[i] = 1; if (isB) C[i] = 1; } } }
    for (let iz = 0; iz < Hh; iz++) for (let ix = 0; ix < W; ix++) { const i = iz * W + ix; S0[i] = !out[i] ? 1 : 0; SA[i] = S0[i] || mark[1][i] ? 1 : 0;
      const [x, z] = toW(ix, iz);
      const dp = rectD(p, x, z); let mine = true; for (const o of nb) if (rectD(o, x, z) < dp) { mine = false; break; } own[i] = mine ? 1 : 0; }
    const dS = edt(S0, W, Hh), dSA = edt(SA, W, Hh), dC = edt(C, W, Hh), dCA = edt(CA, W, Hh);
    let pmax = 0, ppts = 0, walk = 0, road = 0, wI = 0, rI = 0, stuck = 0, clip = 0, deep = 0, pts = 0; let ex = null, sx = null, cx = null;
    for (let iz = 0; iz < Hh; iz++) for (let ix = 0; ix < W; ix++) { const i = iz * W + ix; if (!own[i]) continue;
      if (C[i] && !S0[i] && dS[i] > pmax) { pmax = dS[i]; ex = toW(ix, iz); }
      if (ix & 1 || iz & 1) continue; pts++; const [x, z] = toW(ix, iz);
      if (C[i]) { if (dS[i] > 0.3) ppts++;
        const lx = -hx + (ix + 0.5) * H, lz = -hz + (iz + 0.5) * H; if (Math.abs(lx) > p.d / 2 - 1 || Math.abs(lz) > p.w / 2 - 1) { const n = city.graph.index.near(x, z, false);
          if (n && n.d < n.e.hw + n.e.sw) { const inv = dS[i] > 0.15; if (n.d < n.e.hw) { road++; rI += inv; } else { walk++; wI += inv; } } } }
      if (!S0[i] && dC[i] < PR && dSA[i] >= 0.5) { stuck++; if (!sx) sx = [x, z]; }
      if (!S0[i] && dCA[i] >= PR && dS[i] < PR - 0.1) { clip++; if (dS[i] < 0.15) deep++; if (!cx) cx = [x, z];
        if (FIT && FIT.fit.get(p)) { const f = FIT.fit.get(p); const d0 = FIT.dPieces(p, [...f.pieces, ...f.extra], x, z); const lx = -hx + (ix + 0.5) * H, lz = -hz + (iz + 0.5) * H;
          const side = d0 === 0 ? 'in' : lx > p.d / 2 - 1.5 && Math.abs(lz) < p.w / 2 - 0.5 ? 'front' : lx < -p.d / 2 + 1.5 && Math.abs(lz) < p.w / 2 - 0.5 ? 'back' : 'side';
          const bin = side + ':' + (d0 < 0.35 ? 'a' : d0 < 0.6 ? 'b' : d0 < 1 ? 'c' : 'd'); CH[bin] = (CH[bin] || 0) + 1; } } }
    T.pts += pts; T.protrMax = Math.max(T.protrMax, pmax); if (pmax > 0.3) { T.protr03++; if (T.worst.length < 12) T.worst.push([p.style, +p.x.toFixed(1), +p.z.toFixed(1), +pmax.toFixed(2), ex && ex.map((q2) => +q2.toFixed(1))]); }
    T.protrPts += ppts; T.walkPts += walk; T.roadPts += road; T.walkInvis += wI; T.roadInvis += rI; if (wI + rI) T.walkParcels++; T.stuck += stuck; if (stuck) { T.stuckParcels++; if (T.stuckEx.length < 8) T.stuckEx.push([p.style, ...sx.map((q2) => +q2.toFixed(1))]); }
    PER[p.x.toFixed(1) + ',' + p.z.toFixed(1)] = clip; T.clip += clip; T.clipDeep += deep; if (clip) { T.clipParcels++; if (T.clipEx.length < 12) T.clipEx.push([p.style, ...cx.map((q2) => +q2.toFixed(1)), clip]); }
    const kk = (FIT && FIT.fit.get(p) || {}).kind || p.style; const k = T.byStyle[p.style + ':' + kk] || (T.byStyle[p.style + ':' + kk] = { n: 0, protr03: 0, pmax: 0, walkInvis: 0, stuck: 0, clip: 0 });
    k.n++; k.protr03 += pmax > 0.3; k.pmax = Math.max(k.pmax, +pmax.toFixed(2)); k.walkInvis += wI + rI; k.stuck += stuck; k.clip += clip;
    const enc = S0.reduce((a, b) => a + b, 0) * H * H; if (enc > p.d * p.w * 1.6) T.leak++; // sanity: enclosed area far beyond the lot
  }
  T.protrMax = +T.protrMax.toFixed(2);
  T.clipHist = CH; T.per = PER; return JSON.stringify({ cam: [CX, CZ], R: RAD, fit: FIT ? FIT.stats : null, boxes: COL.boxes.length, T, msSlice: Math.round(tSlice), ms: Math.round(performance.now() - t0) });
})()
