// perf_debug6: merged-env readout after load: __ENVSTATS (uber members / bad members / xdedup) + program count. usage: Q=... node tools/envchk.cjs <tag>
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'new';
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=950 --max-semi-space-size=2 --optimize-for-size', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(900000); let perr = 0, shErr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  p.on('console', (m) => { const t = m.text(); if (/redefinition|program not valid|ERROR:/.test(t)) { shErr++; if (shErr < 4) console.log('SHADER', t.slice(0, 200)); } });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${process.env.MAP || 'gta'}&lowshadow&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { __G.render(); const E = window.__ENVSTATS || {}; return { progs: __G.renderer.info.programs.length, uber: E.uber, xdedup: E.xdedup, merge: E.merge }; })()`);
  console.log(TAG, JSON.stringify(r), 'PAGEERROR', perr, 'SHADERERR', shErr); await b.close(); process.exit(0);
});
