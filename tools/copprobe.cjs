// fix_pt2: PLAYTEST_1H #4/#24 "stolen police car never moves". Reproduces the playtest sequence with the game's own police logic:
// wanted 2 -> updatePolice dispatches cruisers (traffic.spawnCar) that chase, stop near the player and deploy officers (crew 0,
// handbrake) -> wanted cleared (cars switch to 'flee') -> walk to the nearest police car, F (toggleCar = carjack) -> hold W with real
// key state (g.keys) 3 s, then S 2 s. Each step logs: in traffic.cars, Vehicle.update calls this step, speed, input, ai, in policeCars.
// Pit-style extra: overhead (col.over) boxes around the car. usage: node tools/copprobe.cjs <map> "x,z" [variant-query]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'cyber'; const PT = (process.argv[3] || '174.2,77.7').split(',').map(Number); const VQ = process.argv[4] || '';
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0&${VQ}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  for (let trial = 0; trial < 2; trial++) {
    const r = await p.evaluate(`(() => { const G = __G, g = G.game; const [x, z] = ${JSON.stringify(PT)}; const T = []; G.reset && G.reset(); g.tp(x, z, 0); G.step(3);
      g.crime(2, 'probe'); let t = 0; for (; t < 2400 && !g.policeCars.some((v) => v.crew === 0); t += 30) { g.wanted = Math.max(g.wanted, 2); g.lostT = 0; G.step(30); }
      T.push(['deployed@', t, g.policeCars.length, g.policeCars.map((v) => [+v.x.toFixed(1), +v.z.toFixed(1), v.crew, v.ai && v.ai.mode, g.traffic.cars.includes(v)])]);
      for (const c of g.cops) if (!c.dead) { if (c.kill) c.kill(1); else c.dead = true; } g.wanted = 0; g.lostT = 0; G.step(60);
      T.push(['cleared', g.wanted, g.policeCars.length, g.policeCars.map((v) => [+v.x.toFixed(1), +v.z.toFixed(1), v.crew, v.ai && v.ai.mode, g.traffic.cars.includes(v), Math.round(v.health)])]);
      const P = g.P.pos; const near = g.traffic.cars.filter((v) => v.type === 'police').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      if (!near) return { T, err: 'no police car' };
      const v = near; let uc = 0; const u0 = v.update; v.update = function (...a) { uc++; return u0.apply(this, a); };
      const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw); g.tp(v.x + lx * 2.4, v.z + lz * 2.4, 0); G.step(2); g.toggleCar(); G.step(2);
      T.push(['carjack', g.P.car === v, g.traffic.cars.includes(v), g.policeCars.includes(v), v.driver, !!v.ai, v.parked, v.input.handbrake, g.wanted, +v.x.toFixed(2), +v.z.toFixed(2)]);
      const run = (key, n) => { for (let i = 0; i < n; i += 15) { g.keys[key] = true; uc = 0; G.step(15); T.push([key, i, +v.x.toFixed(2), +v.z.toFixed(2), +(v.speed * 3.6).toFixed(0), 'upd', uc, 'inT', g.traffic.cars.includes(v), 'pc', g.policeCars.includes(v), 'car', g.P.car === v, 'thr', v.input.throttle, 'hb', v.input.handbrake, 'hp', Math.round(v.health), 'imp', +v.lastImpact.toFixed(1)]); } g.keys[key] = false; };
      run('KeyW', 90); run('KeyS', 60);
      const o = g.city.col.over ? g.city.col.over.query(v.x, v.z, 4).map((b) => [b.tag, +b.minX.toFixed(1), +b.minZ.toFixed(1), +b.maxX.toFixed(1), +b.maxZ.toFixed(1), +b.y0.toFixed(2), +b.h.toFixed(2)]) : [];
      if (g.P.car) g.toggleCar(); v.update = u0; return { T, over: o.slice(0, 12) }; })()`);
    console.log((VQ || 'new') + ' trial ' + trial, JSON.stringify(r));
  }
  console.log(VQ || 'new', 'PAGEERROR', perr); await b.close(); process.exit(0);
});
