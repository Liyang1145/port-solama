// perf_debug1: native-memory leak probe: step the game while the player hops around (forces ped / car spawn + despawn) and
// sample the chromium RSS of this session + JS heap + live object counts
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, +(process.env.TMAX || 88000));
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const rss = () => { try { return Math.round(+execSync(`ps -o rss= --sid $(ps -o sid= -p ${process.pid}) | awk '{s+=$1} END {print s}'`).toString() / 1024); } catch (e) { return -1; } };
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1100'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(80000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${process.argv[2] || 'gta'}&hour=15&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const hops = [[280, 36], [290, -150], [170, -300], [50, 0], [170, 150], [290, 300], [50, -300], [280, 36]];
  for (let i = 0; i < +(process.env.N || 16); i++) { const [x, z] = hops[i % hops.length];
    const r = await p.evaluate(`(() => { const g = __G.game; g.tp(${x}, ${z}, 0); __G.step(120); return [Math.round(performance.memory.usedJSHeapSize / 1048576), g.traffic.cars.length, g.peds.list.length, __G.renderer.info.memory.geometries]; })()`);
    console.log('hop', i, 'rssMB', rss(), 'heap/cars/peds/geos', JSON.stringify(r)); }
  process.exit(0);
});
