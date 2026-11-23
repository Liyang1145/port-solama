// fix_pt1: A-map load cost of curbfix / parkfix (bake replay vs stale full pass). usage: node tools/ltbake.cjs <distDir> [loads]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(process.argv[2] || 'dist'); const N = +(process.argv[3] || 2);
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  for (let i = 0; i < N; i++) { const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000); const warn = []; p.on('console', (m) => { if (/stale|curbfix|parkfix/.test(m.text())) warn.push(m.text().slice(0, 80)); });
    const t0 = Date.now(); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=gta&lowshadow&probe=0`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 250 }); const ready = (Date.now() - t0) / 1000;
    const r = await p.evaluate(`(() => { const R = __G.city.region; const cf = R.curbFix || {}; const pf = R.parkFix || {}; const pick = (o) => { const q = {}; for (const k in o) { const v = o[k]; if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') q[k] = v; } return q; }; return { curb: { ...pick(cf), t: cf.t }, park: pick(pf), LT: window.__LT ? pick(window.__LT) : null }; })()`);
    console.log('LOAD', i, JSON.stringify({ dir: path.basename(root), readyS: ready, warn, ...r })); await p.close(); }
  await b.close(); process.exit(0);
});
