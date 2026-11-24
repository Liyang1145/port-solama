(() => { const G = __G, g = G.game; g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  const P = g.peds; const near = g.P.pos; let made = 0;
  for (let t = 0; t < 400 && made < 30; t++) { const c = P.spawn(near, 2, 16); if (c) made++; }
  // keep them close: everyone within 16 m walks / idles around the player
  const CU = g.player.constructor.prototype; const orig = CU.update; let upMs = 0, upN = 0;
  CU.update = function (dt) { const t0 = performance.now(); orig.call(this, dt); upMs += performance.now() - t0; upN++; };
  const st = window.__ARIG_ST; const res = {};
  for (const [name, inp] of [['idle', { mx: 0, mz: 0 }], ['run', { mx: 1, mz: 1 }]]) {
    g.override = inp; G.step(60, 1 / 60); const ms0 = st ? st.ms : 0, c0 = st ? st.calls : 0, f0 = st ? st.full : 0; upMs = 0; upN = 0; const T0 = performance.now(); const N = 240;
    for (let i = 0; i < N; i++) { g.camera && 0; G.step(1, 1 / 60); }
    const lod = [0, 0, 0, 0]; for (const c of P.list) lod[c.lod]++;
    res[name] = { frames: N, rigMsPerFrame: st ? +((st.ms - ms0) / N).toFixed(3) : 0, rigCallsPerFrame: st ? +((st.calls - c0) / N).toFixed(1) : 0, rigFullPerFrame: st ? +((st.full - f0) / N).toFixed(1) : 0,
      charUpdateMsPerFrame: +(upMs / N).toFixed(3), charUpdatesPerFrame: +(upN / N).toFixed(1), stepMsPerFrame: +((performance.now() - T0) / N).toFixed(2), peds: P.list.length, lod };
  }
  CU.update = orig; g.override = null; res.made = made;
  return res; })()
