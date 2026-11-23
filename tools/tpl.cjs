// perf_debug6: teleport stream cost WITHOUT drawing (the sandbox OOM-kills full renders): after a teleport, each frame = logic tick +
// region.update(camera, 1) (= real-play streaming: lot jobs, World build, gate/pump program links) + GL sync. Per frame: ms of the
// region update (+sync), new programs linked, region/detail sub-steps. usage: Q=... node tools/tpl.cjs <tag> [frames]  -> shots/pd6/tpl_<tag>.json
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'new', NF = +(process.argv[3] || 60);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=950 --max-semi-space-size=2 --optimize-for-size', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(900000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=gta&lowshadow&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G, g = G.game, R = G.city.region, rd = G.renderer; const gl = rd.getContext(); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const sub = {}; const wrap = (o, k, l) => { if (!o || typeof o[k] !== 'function') return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { sub[l] = (sub[l] || 0) + performance.now() - t; } }; };
    wrap(R, 'pump', 'pump'); wrap(R, 'step', 'region.step'); wrap(R, 'finish', 'region.finish'); if (R.detail) { wrap(R.detail, 'stepJob', 'detail.stepJob'); wrap(R.detail, 'load', 'detail.load'); }
    for (let i = 0; i < 4; i++) { G.tick(1/30, false); R.update(G.camera.position, 1); } sync();
    const out = []; for (const [x, z] of [${process.env.SPOTS || '[-300,200],[600,-400]'}]) { g.tp(x, z, 0);
      for (let i = 0; i < ${NF}; i++) { for (const k in sub) delete sub[k]; const p0 = rd.info.programs.length; const t0 = performance.now(); G.tick(1/30, false); const t1 = performance.now(); R.update(G.camera.position, 1); sync(); const t2 = performance.now();
        out.push({ at: x + ',' + z, i, logic: +(t1 - t0).toFixed(1), region: +(t2 - t1).toFixed(1), prog: rd.info.programs.length - p0, q: R.async && R.async.q ? R.async.q.length : 0, sub: Object.fromEntries(Object.entries(sub).filter(([k, v]) => v > 0.5).map(([k, v]) => [k, +v.toFixed(1)])) }); } }
    return out; })()`);
  const at = [...new Set(r.map((f) => f.at))]; for (const a of at) { const F = r.filter((f) => f.at === a); const s = [...F.map((f) => f.region)].sort((x, y) => y - x);
    console.log(TAG, a, 'max', s[0], 'top5', s.slice(0, 5).join('/'), 'sum', F.reduce((q, f) => q + f.region, 0).toFixed(0), 'progs', F.reduce((q, f) => q + f.prog, 0), 'over50', F.filter((f) => f.region > 50).length, 'seq', F.slice(0, 24).map((f) => Math.round(f.region) + (f.prog ? 'p' + f.prog : '')).join(' ')); }
  fs.mkdirSync(path.join(root, 'shots/pd6'), { recursive: true }); fs.writeFileSync(path.join(root, 'shots/pd6/tpl_' + TAG + '.json'), JSON.stringify(r).replace(/},{/g, '},\n{'));
  console.log('PAGEERROR', perr); await b.close(); process.exit(0);
});
