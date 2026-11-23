// b_verify: fast headless screenshots for the sandbox (SwiftShader). One browser, foreground, self-timeout.
// usage: CHROME_BIN=... node tools/shotfast.cjs plan.json outdir [W H]
//   plan = { query, shots: [{ name, js, noshot? }] } (same format as shot.cjs / runplan plans; reset is never called)
//   env: DIST=dist (served dir), TMAX=93000 (ms, whole run), R2=1 (render twice instead of once)
// Always add &shotfast to plan.query (see src/shotfast.js): identical pixels, ~2x faster first frame.
// Per shot it logs: js time, render() time and finish = how long the GPU queue took (SwiftShader pipeline JIT on the first
// frame; 2-10 s for later shots at the same place, because compiled pipelines are reused inside one page).
// Tips: keep one place per run (each new place / new page pays its JIT again); set camera.far 90-220 in the plan for
// close-ups (fewer far materials -> fewer pipelines); put variants (a uniform, a light, a material tweak) as extra shots
// in the same plan — they cost seconds, not a new first frame.
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const outdir = process.argv[3] || 'shots/fast';
const W = +(process.argv[4] || 320), H = +(process.argv[5] || 180); const root = path.join(__dirname, '..');
fs.mkdirSync(outdir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let b = null; setTimeout(async () => { log('SELF-TIMEOUT'); try { await b.close(); } catch (e) { } process.exit(3); }, +(process.env.TMAX || 93000));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const port = srv.address().port; const t0 = Date.now(); let perr = 0;
  b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-watchdog', '--disable-hang-monitor', '--in-process-gpu', '--js-flags=--max-old-space-size=900', `--window-size=${W},${H}`] });
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage(); p.setDefaultTimeout(900000);
  p.on('pageerror', (e) => { perr++; log('PAGEERROR', e.message.slice(0, 300)); });
  if (!/(^|&)shotfast(&|$)/.test(plan.query || '')) log('WARN query has no &shotfast');
  await p.goto(`http://127.0.0.1:${port}/index.html?snap&${plan.query || ''}`, { timeout: 600000 });
  await p.waitForFunction('window.__G && window.__G.ready', null, { timeout: 900000, polling: 500 }); log('loaded', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  for (const s of plan.shots) {
    try {
      const t1 = Date.now(); const r = await p.evaluate(s.js || '0'); const tj = Date.now() - t1;
      if (r !== undefined && r !== 0) { log(s.name, 'js->', JSON.stringify(r).slice(0, 600)); fs.writeFileSync(path.join(outdir, s.name + '.json'), JSON.stringify(r, null, 1)); }
      if (s.noshot) continue;
      const tr = Date.now(); await p.evaluate(process.env.R2 ? '__G.render(); __G.render();' : '__G.render();'); const tf = Date.now();
      const fin = await p.evaluate('__G.finish ? __G.finish() : -1');
      const url = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
      fs.writeFileSync(path.join(outdir, s.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      log('shot', s.name, `js ${(tj / 1000).toFixed(1)}s render ${((tf - tr) / 1000).toFixed(1)}s finish ${(fin / 1000).toFixed(1)}s total ${((Date.now() - t1) / 1000).toFixed(0)}s`);
    } catch (e) { log('ERR', s.name, e.message.slice(0, 300)); }
  }
  log('DONE PAGEERRORS', perr, 'programs', await p.evaluate('__G.renderer.info.programs.length'), 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  await b.close(); srv.close(); process.exit(0);
});
