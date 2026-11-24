// fix_pt7 #1: per-frame CPU profile at the map's spawn (what the playtest saw), with the call stacks of every > 33 ms frame.
// ?snap&prof&lowshadow, logic frames G.tick(1/30, false) + the CPU-side streaming a rendered frame does (A: region.update(cam, 1),
// B: stream.update(cam, 1)), no drawing. Scenarios: walk (starts right after ready at the spawn, no warm-up steps: the opening
// frames are part of it), drive (back to the spawn, car, 60 s), tp (the playtest teleports). CDP sampling profile aligned to the
// frames by a 15 ms marker spin (__PF7SYNC) at the start of every chunk.
// usage: Q=... node tools/pf7.cjs <map> <tag> walk,drive,tp [frames]  -> shots/fp7/pf7_<map>_<tag>.json   (env DIST=dist)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'cyber', TAG = process.argv[3] || 'new', SC = (process.argv[4] || 'walk,drive,tp').split(','), NF = +(process.argv[5] || 1800);
const DIST = path.resolve(root, process.env.DIST || 'dist');
const srv = http.createServer((q, s) => { const p = path.join(DIST, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const STEP = {
  walk: "g.override = null; g.keys.KeyW = true; g.keys.ShiftLeft = (f % 240) < 150; g.cam.yaw += Math.sin(f / 90) * 0.012; if (f % 300 === 299) { g.keys.KeyA = true; } if (f % 300 === 20) g.keys.KeyA = false;",
  drive: "if (f === 0) { g.carNearPlayer('sport', 3); __G.step(2); g.toggleCar(); } g.override = { throttle: (f % 600) < 520 ? 0.85 : -0.4, steer: Math.sin(f / 70) * 0.35 + ((f % 900) > 780 ? 0.8 : 0) };",
  tp: "g.override = null; g.keys.KeyW = (f % 150) > 30; const TP = window.__TP; if (f % 150 === 0) { const q = TP[(f / 150) % TP.length]; g.tp(q[0], q[1], q[2] || 0); }",
};
const TPS = { cyber: [[257.9, -11.2], [179.5, 100], [82, -225], [284.6, -72], [284.5, 22], [15, -335], [175, 160], [12, 340], [140.8, -336.5], [162.1, 788.1], [-200, 0], [400, -300]],
  gta: [[61.1, 200], [-300, 200], [600, -400], [281, 14], [15, -335], [175, 160], [12, 340], [-100, -100], [200, 400], [400, -50], [-400, -300], [0, 600]] };
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1000 --max-semi-space-size=2 --optimize-for-size', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256', '--enable-precise-memory-info'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(900000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&prof&map=${MAPN}&lowshadow&${process.env.HOUR ? 'hour=' + process.env.HOUR + '&' : ''}${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const sp = await p.evaluate(`(() => { const G = __G; G.profInit(); G.rb = 1; window.__F = []; window.__TP = ${JSON.stringify(TPS[MAPN] || TPS.gta)}; const sub = window.__SUB = {};
    window.__PF7SYNC = function __PF7SYNC() { const t = performance.now(); while (performance.now() - t < 15); return t; };
    const wrap = (o, k, l) => { if (!o || typeof o[k] !== 'function') return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { sub[l] = (sub[l] || 0) + performance.now() - t; } }; };
    const R = G.city.region; if (R) { wrap(R, 'pump', 'reg.pump'); wrap(R, 'step', 'reg.step'); if (R.detail) wrap(R.detail, 'stepJob', 'det.stepJob'); }
    const S = G.stream; if (S) { wrap(S, 'buildNear', 'st.buildNear'); wrap(S, 'step', 'st.step'); const N = G.neon; if (N) { wrap(N, 'update', 'neon.update'); const B = N.bldg; if (B) { wrap(B, 'buildChunk', 'bl.buildChunk'); for (const k of ['via', 'alley', 'roofs', 'gaps', 'shops', 'ground']) if (B[k]) wrap(B[k], 'sync', 'bl.' + k); } if (N.port) wrap(N.port, 'sync', 'port.sync'); } if (G.nature) wrap(G.nature, 'update', 'nature.update'); }
    window.__STREAM = () => { if (S) { S.update(G.camera.position, 1); if (G.nature) G.nature.update(G.camera.position); if (G.neon) G.neon.update(G.env.look.night, G.U.uTime.value); } else if (R) R.update(G.camera.position, 1); };
    const P = G.game.P; return [P.pos.x, P.pos.z, G.game.P.yaw || 0]; })()`);
  if (!process.env.NOFINISH) { const t = Date.now(); await p.evaluate('__G.finish ? __G.finish() : 0'); console.log('gpu finish (SwiftShader backlog of the warm-up frame) s', ((Date.now() - t) / 1000).toFixed(0)); }
  console.log('spawn', JSON.stringify(sp));
  const res = { spawn: sp }; const cdp = await p.context().newCDPSession(p);
  for (const sc of SC) {
    if (sc !== 'walk') await p.evaluate(`(() => { const g = __G.game; g.keys = {}; g.override = null; if (g.P.car) g.toggleCar(); g.tp(${sp[0]}, ${sp[1]}, ${sp[2]}); __G.step(4); window.__F = []; return 0; })()`);
    else await p.evaluate('(() => { window.__F = []; return 0; })()');
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    const syncs = [];
    for (let f0 = 0; f0 < NF; f0 += 60) syncs.push(await p.evaluate(`(() => { const G = __G, g = G.game, sub = window.__SUB; const ts = window.__PF7SYNC(); for (let f = ${f0}; f < ${Math.min(NF, f0 + 60)}; f++) { ${STEP[sc]}
        for (const k in sub) delete sub[k]; const t0 = performance.now(); G.tick(1/30, false); const t1 = performance.now(); window.__STREAM(); const t2 = performance.now();
        const fr = G.prof.frames[G.prof.frames.length - 1]; const T = {}; for (const k in fr.T) if (fr.T[k] > 0.3) T[k] = +fr.T[k].toFixed(2); for (const k in sub) if (sub[k] > 0.3) T[k] = +sub[k].toFixed(2); T['r:stream'] = +(t2 - t1).toFixed(2);
        window.__F.push({ f, t0, t2, ms: +(t2 - t0).toFixed(2), T }); } return ts; })()`));
    const { profile } = await cdp.send('Profiler.stop');
    const by = {}; const par = {}; for (const n of profile.nodes) { by[n.id] = n; for (const c of n.children || []) par[c] = n.id; }
    const nm = (id) => { const cf = by[id].callFrame; return (cf.functionName || '(anon)') + '@' + (cf.url.split('/').pop() || '-') + ':' + (cf.lineNumber + 1); };
    const st = []; let t = profile.startTime; for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] || 0; st.push(t / 1000); }
    const inSync = (id) => { for (let q = id; q; q = par[q]) if (by[q].callFrame.functionName === '__PF7SYNC') return true; return false; };
    // offset per chunk: first sample inside the marker spin <-> its performance.now() start
    const marks = []; for (let i = 0; i < st.length; i++) if (inSync(profile.samples[i]) && (i === 0 || !inSync(profile.samples[i - 1]))) marks.push(st[i]);
    const F = await p.evaluate('window.__F');
    const off = marks.length >= syncs.length ? syncs.map((s, k) => marks[k] - s) : null; // profiler ms - performance.now ms
    const stackOf = (i) => { const a = []; for (let q = profile.samples[i]; q; q = par[q]) { const n = nm(q); if (!/^\(root\)|^\(program\)/.test(n)) a.push(n); } return a; };
    const slow = F.filter((fr) => fr.ms > 33.3).sort((a, c) => c.ms - a.ms);
    for (const fr of slow.slice(0, 12)) { if (!off) break; const o = off[Math.floor(fr.f / 60)] ?? off[0]; const a = fr.t0 + o, z = fr.t2 + o; const inc = {}, self = {}; let n = 0;
      for (let i = 0; i < st.length; i++) { if (st[i] < a || st[i] > z) continue; n++; const s = stackOf(i); if (s[0]) self[s[0]] = (self[s[0]] || 0) + 1; for (const k of new Set(s)) inc[k] = (inc[k] || 0) + 1;
        if (by[profile.samples[i]].callFrame.functionName === '(garbage collector)') self['(GC)'] = (self['(GC)'] || 0) + 1; }
      fr.samples = n; fr.self = Object.entries(self).sort((x, y) => y[1] - x[1]).slice(0, 6); fr.inc = Object.entries(inc).filter(([k]) => !/^\(anon\)@-|evaluate|^frame@|^tick@|__STREAM/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 14); }
    const dt = {}; for (const id of profile.samples) { const k = nm(id); dt[k] = (dt[k] || 0) + 1; }
    const top = Object.entries(dt).sort((a, c) => c[1] - a[1]).slice(0, 20).map(([k, v]) => [k, +(100 * v / profile.samples.length).toFixed(1)]);
    const ms = F.map((f) => f.ms).sort((a, c) => a - c); const pct = (q) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))];
    res[sc] = { frames: F.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: ms[ms.length - 1], over33: slow.length, sumOver33: +slow.reduce((a, f) => a + f.ms - 33.3, 0).toFixed(0), totalMs: +F.reduce((a, f) => a + f.ms, 0).toFixed(0), alignedChunks: off ? off.length : 0,
      slow: slow.slice(0, 12).map((f) => ({ f: f.f, ms: f.ms, T: Object.entries(f.T).sort((a, c) => c[1] - a[1]).slice(0, 6), samples: f.samples, self: f.self, inc: f.inc })), first10: F.slice(0, 10).map((f) => f.ms), cpuTop: top };
    console.log(TAG, MAPN, sc, 'p50/p95/p99/max', res[sc].p50, res[sc].p95, res[sc].p99, res[sc].max, 'over33', res[sc].over33, 'sumOver33', res[sc].sumOver33, 'total', res[sc].totalMs, 'first10', JSON.stringify(res[sc].first10));
    for (const s of res[sc].slow.slice(0, 6)) console.log('  slow f' + s.f, s.ms, JSON.stringify(s.T), '\n    self', JSON.stringify(s.self), '\n    inc', JSON.stringify((s.inc || []).slice(0, 10)));
  }
  res.streamStats = await p.evaluate('__G.stream ? JSON.stringify(__G.stream.stats) : (__G.city.region ? JSON.stringify(__G.city.region.stats) : "")'); res.pedStats = await p.evaluate('__G.city._pedStats ? JSON.stringify({ ...__G.city._pedStats, slow: __G.city._pedStats.slow.slice(0, 6) }) : ""'); console.log('stream', res.streamStats, 'ped', res.pedStats);
  res.heapMB = await p.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0');
  fs.mkdirSync(path.join(root, 'shots/fp7'), { recursive: true }); fs.writeFileSync(path.join(root, 'shots/fp7/pf7_' + MAPN + '_' + TAG + '.json'), JSON.stringify(res, null, 1));
  console.log('PAGEERROR', perr); await b.close(); process.exit(0);
});
