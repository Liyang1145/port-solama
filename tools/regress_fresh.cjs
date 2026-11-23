// r6.1 regression harness: ONE browser (one CHROMIUM.lock hold), a FRESH page per test (no state pollution between tests).
// usage: node tools/regress_fresh.cjs plan.json outdir [w h]   -> outdir/<name>.json, prints PASS-relevant output + PAGEERROR count
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const outdir = process.argv[3]; const W = +(process.argv[4] || 640), H = +(process.argv[5] || 360);
fs.mkdirSync(outdir, { recursive: true });
const root = path.join(__dirname, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const port = srv.address().port; let perr = 0;
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-watchdog', '--disable-hang-monitor', `--window-size=${W},${H}`] });
  for (const s of plan.shots) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage(); p.setDefaultTimeout(1200000);
    p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', s.name, e.message); });
    const t0 = Date.now();
    try {
      await p.goto(`http://127.0.0.1:${port}/index.html?snap&${plan.query || ''}`, { timeout: 600000 });
      await p.waitForFunction('window.__G && window.__G.ready', null, { timeout: 900000, polling: 1000 });
      const r = await p.evaluate(s.js || '0');
      console.log(s.name, 'js->', JSON.stringify(r).slice(0, 900), ((Date.now() - t0) / 1000).toFixed(0) + 's');
      fs.writeFileSync(path.join(outdir, s.name + '.json'), JSON.stringify(r, null, 1));
    } catch (e) { console.log('ERR', s.name, e.message.slice(0, 300)); }
    await ctx.close();
  }
  console.log('PAGEERRORS', perr); await b.close(); srv.close(); process.exit(0);
});
