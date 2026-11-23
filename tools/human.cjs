// perf_debug1: "real player" scenario harness. One browser; the game runs in ?snap&prof (no rAF loop: every frame is stepped
// with __G.tick so SwiftShader can keep up), but ALL player input goes through real browser events (page.keyboard / page.mouse
// -> the game's own keydown / mousemove / mousedown listeners; pointer lock is requested by a real click on the canvas).
// Per scenario: frame-time p50/p95/max (logic frames and rendered frames separately), per-system CPU ms, draw calls / tris per
// pass, shader programs, JS heap, PAGEERROR / console errors and anomaly checks; a screenshot at the end of each scenario.
// usage: node tools/human.cjs <map gta|cyber> <outdir> [scenario,scenario...]   env: SW SH (640x360), Q (extra query), DIST (dist), RE (render every N frames)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'gta'; const out = path.resolve(process.argv[3] || 'shots/human');
const ONLY = (process.argv[4] || '').split(',').filter(Boolean); const W = +(process.env.SW || 640), H = +(process.env.SH || 360);
const RE = +(process.env.RE || 90); fs.mkdirSync(out, { recursive: true });
const log = (...a) => { const l = new Date().toISOString().slice(11, 19) + ' ' + a.join(' '); console.log(l); fs.appendFileSync(path.join(out, 'run.log'), l + '\n'); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const RESULTS = {};
// ---------------------------------------------------------------- page-side helpers (installed once) ----
const PAGE_HELPERS = `(() => {
  const G = window.__G, g = G.game; G.profInit(); window.__AN = []; window.__ERR = window.__ERR || [];
  const an = (kind, extra) => { const P = g.P; const r = { f: G.prof.frames.length, kind, pos: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], car: !!P.car, ...extra };
    const last = window.__AN[window.__AN.length - 1]; if (last && last.kind === kind && r.f - last.f < 30) { last.n = (last.n || 1) + 1; last.fEnd = r.f; return; } window.__AN.push(r); };
  const st = { hist: [], airF: 0 };
  window.__check = () => { const P = g.P, cam = G.camera.position; const k = g.keys;
    if (![P.pos.x, P.pos.y, P.pos.z, cam.x, cam.y, cam.z].every(Number.isFinite)) an('NaN');
    if (P.onFoot && !g.deadT) { const gh = g.city.groundH(P.pos.x, P.pos.z);
      if (gh > -1.25) { if (P.grounded && P.pos.y - gh > 0.5) an('float', { gh: +gh.toFixed(2) }); if (P.pos.y < gh - 0.3) an('sunk', { gh: +gh.toFixed(2) }); }
      const r = g.city.col.resolve(P.pos.x, P.pos.z, 0.2, P.pos.y + 0.5); if (Math.hypot(r.x - P.pos.x, r.z - P.pos.z) > 0.15) an('player-in-collider', { push: +Math.hypot(r.x - P.pos.x, r.z - P.pos.z).toFixed(2) }); }
    if (P.car) { const v = P.car; const gh = g.city.groundH(v.x, v.z); if (v.y - gh > 1.2) st.airF++; else st.airF = 0; if (st.airF === 45) an('car-airborne-1.5s', { y: +v.y.toFixed(2), gh: +gh.toFixed(2) }); if (v.y < gh - 0.6 && !v.inWater) an('car-sunk', { y: +v.y.toFixed(2), gh: +gh.toFixed(2) }); }
    // camera inside geometry: segment from the look target to the camera blocked, or the camera point inside a collider
    { const t = g.cam.look; const rc = g.city.col.raycast(t.x, t.y, t.z, cam.x, cam.y, cam.z); if (rc < 0.97 && g.cam.mode !== 1) an('camera-occluded', { t: +rc.toFixed(2) });
      const r = g.city.col.resolve(cam.x, cam.z, 0.05, cam.y); if (Math.hypot(r.x - cam.x, r.z - cam.z) > 0.04 && g.cam.mode !== 1) an('camera-in-collider', { cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)] }); }
    // stuck: movement intent held for 1.5 s with < 0.3 m of travel
    const intent = P.car ? Math.abs(P.car.input.throttle) > 0.1 : !!(k.KeyW || k.KeyA || k.KeyS || k.KeyD);
    st.hist.push([P.pos.x, P.pos.z, intent]); if (st.hist.length > 45) st.hist.shift();
    if (st.hist.length === 45 && st.hist.every((h) => h[2])) { const a = st.hist[0]; if (Math.hypot(P.pos.x - a[0], P.pos.z - a[1]) < 0.3) { an(P.car ? 'car-stuck' : 'player-stuck'); st.hist.length = 0; } }
  };
  window.__run = (n, re) => { for (let i = 0; i < n; i++) { const fi = G.prof.frames.length; const render = re > 0 && fi % re === re - 1; G.tick(1 / 30, render); window.__check(); } return G.prof.frames.length; };
  window.__mark = () => G.prof.frames.length;
  window.__sum = (from) => { const F = G.prof.frames.slice(from); const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
    const L = F.filter((f) => !f.r), R = F.filter((f) => f.r); const sys = {}; const sysMax = {};
    for (const f of F) for (const k in f.T) { if (k.startsWith('gl:') || k.startsWith('pass:') || k === 'shadow') { if (!f.r) continue; } sys[k] = (sys[k] || 0) + f.T[k]; sysMax[k] = Math.max(sysMax[k] || 0, f.T[k]); }
    const nF = { }; for (const k in sys) nF[k] = (k.startsWith('gl:') || k.startsWith('pass:') || k === 'shadow' || k.startsWith('r:')) ? Math.max(1, R.length) : F.length;
    const mean = {}; for (const k in sys) mean[k] = +(sys[k] / nF[k]).toFixed(2); const mx = {}; for (const k in sysMax) mx[k] = +sysMax[k].toFixed(1);
    const counters = {}; for (const f of R) for (const k in f.C) counters[k] = Math.max(counters[k] || 0, f.C[k]);
    const heap = F.map((f) => f.heap); let drops = 0, grow = 0; for (let i = 1; i < heap.length; i++) { const d = heap[i] - heap[i - 1]; if (d < -2) drops++; else if (d > 0) grow += d; }
    const logicMs = L.map((f) => f.ms), renderMs = R.map((f) => f.ms);
    const spikes = L.map((f, i) => [f.ms, from + F.indexOf(f)]).filter((x) => x[0] > Math.max(8, pct(logicMs, 0.5) * 4)).slice(0, 12);
    return { frames: F.length, rendered: R.length, logic: { p50: pct(logicMs, 0.5), p95: pct(logicMs, 0.95), max: pct(logicMs, 1), longOver16: L.filter((f) => f.ms > 16.7).length, longOver50: L.filter((f) => f.ms > 50).length },
      render: { p50: pct(renderMs, 0.5), p95: pct(renderMs, 0.95), max: pct(renderMs, 1) }, spikes, mean, max: mx, counters,
      calls: R.length ? Math.max(...R.map((f) => f.calls || 0)) : 0, tris: R.length ? Math.max(...R.map((f) => f.tris || 0)) : 0,
      progs: [F.length ? F[0].progs : 0, F.length ? F[F.length - 1].progs : 0], geo: F.length ? F[F.length - 1].geo : 0, tex: F.length ? F[F.length - 1].tex : 0,
      heapMB: [heap[0], Math.max(...heap), heap[heap.length - 1]], allocMBperFrame: +(grow / Math.max(1, F.length)).toFixed(3), gcDrops: drops, state: g.state(), an: window.__AN.filter((a) => a.f >= from) };
  };
  return 'ok';
})()`;
srv.listen(0, async () => {
  const port = srv.address().port; const T0 = Date.now();
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-watchdog', '--disable-hang-monitor', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1100', `--window-size=${W},${H}`] });
  const ctx = await b.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage(); p.setDefaultTimeout(1500000);
  let perr = 0, cerr = 0; const errs = [];
  p.on('pageerror', (e) => { perr++; errs.push('PAGEERROR ' + e.message.slice(0, 300)); log('PAGEERROR', e.message.slice(0, 300)); });
  p.on('crash', () => log('PAGE-CRASH')); p.on('close', () => log('PAGE-CLOSE')); b.on('disconnected', () => log('BROWSER-DISCONNECTED'));
  p.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver|Automatic fallback/.test(m.text())) { cerr++; errs.push('CONSOLE ' + m.text().slice(0, 300)); log('CONSOLE-ERR', m.text().slice(0, 300)); } });
  await p.goto(`http://127.0.0.1:${port}/index.html?snap&prof&map=${MAPN}&${process.env.Q || ''}`, { timeout: 600000 });
  await p.waitForFunction('window.__G && window.__G.ready', null, { timeout: 900000, polling: 1000 });
  log('loaded', MAPN, ((Date.now() - T0) / 1000).toFixed(0) + 's', 'Q=' + (process.env.Q || ''));
  log('helpers', await p.evaluate(PAGE_HELPERS));
  // pointer lock through a real click on the canvas (headless may refuse it: then the lock state is shimmed so the game's
  // own mousemove / mousedown listeners still receive the real events)
  await p.mouse.click(W / 2, H / 2); await p.waitForTimeout(300);
  const locked = await p.evaluate(() => document.pointerLockElement === document.getElementById('c'));
  if (!locked) await p.evaluate(() => { const c = document.getElementById('c'); Object.defineProperty(document, 'pointerLockElement', { get: () => c, configurable: true }); });
  log('pointerLock', locked ? 'real' : 'shimmed');
  let nrun = 0; const run = async (n, re = RE) => { const r = await p.evaluate(`__run(${n}, ${re})`); if (++nrun % 20 === 0) log('frames', r, 'heap', await p.evaluate('performance.memory.usedJSHeapSize/1048576|0'), 'availMB', require('child_process').execSync("free -m | awk '/Mem:/{print $7}'").toString().trim()); return r; };
  const key = { down: (k) => p.keyboard.down(k), up: (k) => p.keyboard.up(k), tap: async (k, n = 2) => { await p.keyboard.down(k); await run(n); await p.keyboard.up(k); } };
  const hold = async (keys, frames, re) => { for (const k of keys) await p.keyboard.down(k); await run(frames, re); for (const k of keys) await p.keyboard.up(k); };
  // continuous mouse look: dx pixels per frame for n frames (real mousemove events with movementX)
  let mx = W / 2, my = H / 2; const look = async (dx, dy, n, re) => { for (let i = 0; i < n; i += 3) { mx += dx * 3; my += dy * 3; await p.mouse.move(mx, my); await run(3, re); if (Math.abs(mx - W / 2) > W * 0.4 || Math.abs(my - H / 2) > H * 0.4) { mx = W / 2; my = H / 2; await p.mouse.move(mx, my, { steps: 1 }); } } };
  const ev = (js) => p.evaluate(js);
  const shot = async (name) => { const t = Date.now(); await ev('__G.render()'); const url = await ev(() => document.getElementById('c').toDataURL('image/jpeg', 0.85)); fs.writeFileSync(path.join(out, name + '.jpg'), Buffer.from(url.split(',')[1], 'base64')); log('shot', name, ((Date.now() - t) / 1000).toFixed(0) + 's'); };
  const st = () => ev('__G.game.state()');
  const S = require('./human_scenarios.cjs')({ key, hold, look, run, ev, st, p, W, H, MAPN, log });
  for (const [name, fn] of Object.entries(S)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const t = Date.now(); const f0 = await ev('__mark()'); let res = null, err = null; const e0 = errs.length;
    try { res = await fn(); } catch (e) { err = e.message.slice(0, 400); log('SCENARIO-ERR', name, err); }
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) await p.keyboard.up(k);
    let sum = null; try { sum = await ev(`__sum(${f0})`); } catch (e) { log('SUM-ERR', e.message.slice(0, 200)); }
    RESULTS[name] = { checks: res, err, errors: errs.slice(e0), sum, wallS: Math.round((Date.now() - t) / 1000) };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ map: MAPN, q: process.env.Q || '', W, H, RE, results: RESULTS, perr, cerr }, null, 1));
    log('scenario', name, 'logic p50/p95/max', sum && sum.logic.p50, sum && sum.logic.p95, sum && sum.logic.max, 'render p50', sum && sum.render.p50, 'calls', sum && sum.calls, 'an', sum && sum.an.length, JSON.stringify(res).slice(0, 300));
    if (process.env.NOSHOT !== '1') { try { await shot(MAPN + '_' + name); } catch (e) { log('SHOT-ERR', e.message.slice(0, 200)); } }
  }
  try { fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(await ev('__G.prof.frames'))); } catch (e) { }
  log('ALLDONE PAGEERRORS', perr, 'CONSOLE-ERR', cerr, ((Date.now() - T0) / 1000).toFixed(0) + 's');
  await b.close(); srv.close(); process.exit(0);
});
