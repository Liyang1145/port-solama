// perf_debug5: which shader programs a teleport needs that load-time precompile did not make (no full frames: region sync + renderer.compile)
// usage: Q=... node tools/tpc.cjs <tag>
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'new';
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1300'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(1100000); let perr = 0, cerr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); }); p.on('console', (m) => { if (/Shader Error|redefinition|not valid/.test(m.text())) { cerr++; if (cerr < 4) console.log('GLERR', m.text().slice(0, 300)); } });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=gta&hour=15&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G, R = G.renderer; const out = { base: R.info.programs.length, LT: null, tp: [] };
    for (const [x, z] of [[-300, 200], [600, -400], [-150, -350], [-700, 100]]) { const ids = new Set(R.info.programs.map((q) => q.id)); G.game.tp(x, z, 0); G.step(1); G.city.region.update(G.camera.position, 99); G.scene.updateMatrixWorld(); const t = performance.now(); R.compile(G.scene, G.camera);
      out.tp.push({ at: x + ',' + z, ms: Math.round(performance.now() - t), n: R.info.programs.length - ids.size, progs: R.info.programs.filter((q) => !ids.has(q.id)).map((q) => q.name + '|' + String(q.cacheKey).slice(0, 50)) }); }
    return out; })()`);
  console.log(TAG, JSON.stringify(r)); console.log('PAGEERROR', perr, 'GLERR', cerr); await b.close(); process.exit(0);
});
