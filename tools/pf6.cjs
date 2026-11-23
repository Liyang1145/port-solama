// perf_debug6: per-frame CPU profile of player-like 60 s scenarios that fits the sandbox (human.cjs real-event runs get OOM-killed).
// ?snap&prof&lowshadow, logic frames G.tick(1/30, false) + the CPU-side streaming of a rendered frame (region.update(camera, 1):
// lot jobs, builds, gate/pump links), no drawing. Input through the game's own key state / override (same code paths the key
// handlers set). Per scenario: frame ms p50/p95/p99/max, the systems inside the worst 1 % / 5 % frames, and a CDP sampling profile.
// usage: Q=... node tools/pf6.cjs <tag> walk,drive,daynight [frames]  -> shots/pd6/pf6_<tag>.json
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'new', SC = (process.argv[3] || 'walk,drive,daynight').split(','), NF = +(process.argv[4] || 1800);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const STEP = {
  walk: "g.override = null; g.keys.KeyW = true; g.keys.ShiftLeft = (f % 240) < 150; g.cam.yaw += Math.sin(f / 90) * 0.012; if (f % 300 === 299) { g.keys.KeyA = true; } if (f % 300 === 20) g.keys.KeyA = false;",
  drive: "if (f === 0) { g.carNearPlayer('sport', 3); __G.step(2); g.toggleCar(); } g.override = { throttle: (f % 600) < 520 ? 0.85 : -0.4, steer: Math.sin(f / 70) * 0.35 + ((f % 900) > 780 ? 0.8 : 0) };",
  daynight: "g.override = null; g.keys.KeyW = (f % 120) < 80; g.cam.yaw += 0.006; if (f % 75 === 0) g.skipTime(1);",
};
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1000 --max-semi-space-size=2 --optimize-for-size', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(900000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&prof&map=gta&lowshadow&hour=15&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  await p.evaluate(`(() => { const G = __G; G.profInit(); G.rb = 1; window.__F = []; const R = G.city.region; const sub = window.__SUB = {};
    const wrap = (o, k, l) => { if (!o || typeof o[k] !== 'function') return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { sub[l] = (sub[l] || 0) + performance.now() - t; } }; };
    wrap(R, 'pump', 'reg.pump'); wrap(R, 'step', 'reg.step'); if (R.detail) wrap(R.detail, 'stepJob', 'det.stepJob'); return 0; })()`);
  const res = {}; const cdp = await p.context().newCDPSession(p);
  for (const sc of SC) {
    await p.evaluate(`(() => { const g = __G.game; g.keys = {}; g.override = null; if (g.P.car) g.toggleCar(); g.tp(281, 14, Math.PI); __G.setHour(15); __G.step(4); window.__F = []; return 0; })()`);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
    for (let f0 = 0; f0 < NF; f0 += 60) await p.evaluate(`(() => { const G = __G, g = G.game, R = G.city.region, sub = window.__SUB; for (let f = ${f0}; f < ${Math.min(NF, f0 + 60)}; f++) { ${STEP[sc]}
        for (const k in sub) delete sub[k]; const t0 = performance.now(); G.tick(1/30, false); const t1 = performance.now(); R.update(G.camera.position, 1); const t2 = performance.now();
        const fr = G.prof.frames[G.prof.frames.length - 1]; const T = {}; for (const k in fr.T) if (fr.T[k] > 0.3) T[k] = +fr.T[k].toFixed(2); for (const k in sub) if (sub[k] > 0.3) T[k] = +sub[k].toFixed(2); T['r:region'] = +(t2 - t1).toFixed(2);
        window.__F.push({ ms: +(t2 - t0).toFixed(2), T }); } return 0; })()`);
    const { profile } = await cdp.send('Profiler.stop'); const by = {}; for (const n of profile.nodes) by[n.id] = n; const dt = {}; for (const id of profile.samples) { const cf = by[id].callFrame; const k = (cf.functionName || '(anon)') + ':' + cf.lineNumber + ':' + cf.columnNumber; dt[k] = (dt[k] || 0) + 1; }
    const top = Object.entries(dt).sort((a, c) => c[1] - a[1]).slice(0, 20).map(([k, v]) => [k, +(100 * v / profile.samples.length).toFixed(1)]);
    const F = await p.evaluate('window.__F'); const ms = F.map((f) => f.ms).sort((a, c) => a - c); const pct = (q) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))];
    const worst = (q) => { const W = [...F].sort((a, c) => c.ms - a.ms).slice(0, Math.max(3, Math.ceil(F.length * q))); const s = {}; for (const f of W) for (const k in f.T) s[k] = (s[k] || 0) + f.T[k]; return Object.fromEntries(Object.entries(s).sort((a, c) => c[1] - a[1]).slice(0, 12).map(([k, v]) => [k, +(v / W.length).toFixed(1)])); };
    const mean = {}; for (const f of F) for (const k in f.T) mean[k] = (mean[k] || 0) + f.T[k]; for (const k in mean) mean[k] = +(mean[k] / F.length).toFixed(2);
    res[sc] = { frames: F.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: ms[ms.length - 1], over33: F.filter((f) => f.ms > 33.3).length, worst1: worst(0.01), worst5: worst(0.05), mean: Object.fromEntries(Object.entries(mean).sort((a, c) => c[1] - a[1]).slice(0, 14)), top10: [...F].sort((a, c) => c.ms - a.ms).slice(0, 8).map((f) => [f.ms, Object.entries(f.T).sort((a, c) => c[1] - a[1]).slice(0, 4).map(([k, v]) => k + '=' + v).join(' ')]), cpuTop: top, state: await p.evaluate('__G.game.state()') };
    console.log(TAG, sc, 'p50/p95/p99/max', res[sc].p50, res[sc].p95, res[sc].p99, res[sc].max, 'over33', res[sc].over33, 'worst1', JSON.stringify(res[sc].worst1));
    console.log(TAG, sc, 'top', JSON.stringify(res[sc].top10)); console.log(TAG, sc, 'cpu', JSON.stringify(top.slice(0, 10)));
  }
  fs.mkdirSync(path.join(root, 'shots/pd6'), { recursive: true }); fs.writeFileSync(path.join(root, 'shots/pd6/pf6_' + TAG + '.json'), JSON.stringify(res, null, 1));
  console.log('PAGEERROR', perr); await b.close(); process.exit(0);
});
