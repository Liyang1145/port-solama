// fix_pt2 #6: the first logic frames right after ready (map B worst logic frame 334 ms in PLAYTEST_1H B1). ?prof, logic only (no render),
// frames 0..N-1 at 1/30 s with their section breakdown (sections > 8 ms). usage: node tools/firstlogic.cjs <map> [variant-query] [N]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'cyber'; const VQ = process.argv[3] || ''; const N = +(process.argv[4] || 40);
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&prof&map=${MAPN}&lowshadow&probe=0&${VQ}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G; if (G.profInit) G.profInit(); const out = [];
    for (let i = 0; i < ${N}; i++) { const f = G.tick(1 / 30, false); out.push([i, Math.round(f.ms), Object.entries(f.T || {}).filter(([k, v]) => v > 8).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + Math.round(v)).join(' ')]); }
    return out; })()`);
  const top = [...r].sort((a, b) => b[1] - a[1]).slice(0, 6); console.log(VQ || 'new', 'top', JSON.stringify(top)); console.log(VQ || 'new', 'all', JSON.stringify(r.map((q) => q[1])));
  console.log(VQ || 'new', 'PAGEERROR', perr); await b.close(); process.exit(0);
});
