// fix_pt2: why does a car sit exactly still under full throttle (A (187.5,143.1) heading south; A (177.27,80.87) stolen cruiser)?
// Places a car, gets in, full throttle; per step logs: pos before/after Vehicle.update, after carCollisions, speed, vl, input, lastImpact,
// health, in traffic.cars, other cars within 6 m. usage: node tools/pinprobe.cjs <map> "x,z,yaw;..." [type]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'gta'; const PTS = (process.argv[3] || '187.5,143.1,3.14159').split(';').map((s) => s.split(',').map(Number)); const TYPE = process.argv[4] || 'sedan';
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G, g = G.game; const out = [];
    for (const [x, z, yaw] of ${JSON.stringify(PTS)}) { g.tp(x + 6, z, 0); G.step(3); const v = g.carNearPlayer(${JSON.stringify(TYPE)}, 0); v.ai = null; v.place(x, z, yaw); G.step(1);
      g.tp(v.x + 4 * Math.cos(yaw), v.z - 4 * Math.sin(yaw), 0); G.step(1); g.toggleCar(); const T = [['in', g.P.car === v, g.traffic.cars.includes(v), Math.round(v.health), v.dims && [v.dims.L, v.dims.W], g.deadT, g.started]];
      const u0 = v.update; let pre = null, post = null; v.update = function (...a) { pre = [this.x, this.z]; const r = u0.apply(this, a); post = [this.x, this.z, this.lastImpact, this.vx, this.vz]; return r; };
      g.override = { throttle: 1, steer: 0 };
      for (let i = 0; i < 12; i++) { pre = post = null; G.step(1); const near = g.traffic.cars.filter((o) => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 6).map((o) => [o.type, +o.x.toFixed(2), +o.z.toFixed(2), +o.yaw.toFixed(2), !!o.ai, o.parked, Math.round(o.health)]);
        T.push([i, pre && pre.map((q) => +q.toFixed(3)), post && post.map((q) => +q.toFixed(3)), [+v.x.toFixed(3), +v.z.toFixed(3)], +(v.speed).toFixed(2), v.input.throttle, v.input.handbrake, Math.round(v.health), g.P.car === v, near]); }
      g.override = null; v.update = u0; if (g.P.car) g.toggleCar(); g.traffic.removeCar(v); out.push({ pt: [x, z, yaw], T }); }
    return out; })()`);
  for (const row of r) console.log(JSON.stringify(row)); console.log('PAGEERROR', perr); await b.close(); process.exit(0);
});
