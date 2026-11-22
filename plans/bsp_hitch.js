(() => {
  // spawn hitch after arriving in a part of town whose lanes are not solved yet: max single spawn() / pedWarm slice / frame
  const g = __G.game; const city = g.city; const PE = g.peds; const [X, Z] = window.SP_HX || [178, 15];
  const s0 = JSON.parse(JSON.stringify(city._pedStats || {})); const sp = PE.spawn.bind(PE); let maxSp = 0, nSp = 0, slow = 0;
  PE.spawn = (...a) => { const t = performance.now(); const r = sp(...a); const ms = performance.now() - t; nSp++; if (ms > maxSp) maxSp = ms; if (ms > 8) slow++; return r; };
  g.tp(X, Z, 0); let maxF = 0; const fr = [];
  for (let f = 0; f < (window.SP_HF || 240); f++) { const t = performance.now(); __G.step(1); const ms = performance.now() - t; fr.push(ms); if (ms > maxF) maxF = ms; }
  PE.spawn = sp; fr.sort((a, b) => a - b);
  const loopsNear = PE.loops.filter((b) => Math.hypot((b.x0 + b.x1) / 2 - X, (b.z0 + b.z1) / 2 - Z) < 300); const pathsNear = PE.paths.filter((p) => Math.hypot(p.mx - X, p.mz - Z) < 300 + p.L / 2);
  return JSON.stringify({ at: [X, Z], spawns: nSp, maxSpawnMs: +maxSp.toFixed(1), spawnsOver8ms: slow, frameMed: +fr[fr.length >> 1].toFixed(1), frameP95: +fr[Math.floor(fr.length * 0.95)].toFixed(1), frameMax: +maxF.toFixed(1),
    loopsNear: loopsNear.length, loopsReady: loopsNear.filter((b) => b._lane).length, pathsNear: pathsNear.length, pathsReady: pathsNear.filter((p) => p._lane).length, peds: PE.list.length, before: s0, after: city._pedStats || null });
})()
