// perf_debug1: native-memory leak probe: step the game while the player hops around (forces ped / car spawn + despawn) and
// sample the chromium RSS of this session + JS heap + live object counts
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, +(process.env.TMAX || 88000));
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
let BP = []; const rss = () => { try { return Math.round(BP.reduce((a, pid) => a + +execSync(`ps -o rss= --sid ${pid} | awk '{s+=$1} END {print s+0}'`).toString(), 0) / 1024); } catch (e) { return -1; } };
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1100'] });
  BP = execSync(`ps -o pid= --ppid ${process.pid}`).toString().split(/\s+/).filter(Boolean);
  process.on('exit', () => { for (const pid of BP) try { execSync(`for q in $(ps -o pid= --sid ${pid}); do kill -9 $q 2>/dev/null; done; true`); } catch (e) { } });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(80000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${process.argv[2] || 'gta'}&hour=15&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const hops = [[280, 36], [290, -150], [170, -300], [50, 0], [170, 150], [290, 300], [50, -300], [280, 36]];
  for (let i = 0; i < +(process.env.N || 16); i++) { const [x, z] = hops[i % hops.length];
    const r = await p.evaluate(process.env.DRIVE ? `(() => { const g = __G.game; if (!g.P.car) { g.carNearPlayer('sport', 3); g.toggleCar(); } g.override = { throttle: 1, steer: Math.sin(${i}) * 0.3 }; __G.step(120);` : `(() => { const g = __G.game; g.tp(${x}, ${z}, 0); __G.step(120); return [Math.round(performance.memory.usedJSHeapSize / 1048576), g.traffic.cars.length, g.peds.list.length, __G.renderer.info.memory.geometries]; })()`);
    console.log('hop', i, 'rssMB', rss(), 'heap/cars/peds/geos', JSON.stringify(r)); }
  process.exit(0);
});
