// perf_debug5: region chunk / far-LOD bookkeeping check at a mainland spot
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=gta&hour=15`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G, R = G.city.region; G.game.tp(-300, 200, 0); G.step(1); R.update(G.camera.position, 99);
    const cs = [...R.chunks.values()]; const cp = G.camera.position; const farNames = []; G.scene.traverse((o) => { if (o.isMesh && /^[a-zA-Z]+\\|-?\\d+\\|-?\\d+$/.test(o.name)) farNames.push(o.name); });
    return { n: cs.length, keys: cs.slice(0, 5).map((c) => c.key), withFar: cs.filter((c) => c.far.length).length, det: cs.filter((c) => c.det).length,
      detFarVisible: cs.filter((c) => c.det && c.far.some((m) => m.visible)).length, lodCand: cs.filter((c) => c.det && c.far.length && Math.hypot(cp.x - c.x, cp.z - c.z) - c.r >= 70).length,
      rs: cs.filter((c) => c.det).map((c) => [Math.round(Math.hypot(cp.x - c.x, cp.z - c.z)), Math.round(c.r), c.far.length]).slice(0, 12), names: farNames.slice(0, 8), nNamed: farNames.length }; })()`);
  console.log(JSON.stringify(r)); await b.close(); process.exit(0);
});
