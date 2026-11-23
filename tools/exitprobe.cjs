// fix_pt6 #4: get out of a car parked against obstacles and check the player / camera are not inside a collider for the next frames.
// For each point: a car is placed at the point with 12 yaws, also slid to touch the nearest wall on its left / right; player enters
// (toggleCar), then exits; 8 frames stepped. Counts frames with the player (resolve r 0.35 at P.y+0.5, like movement) or camera
// (r 0.05) inside a box. usage: MAP=cyber node tools/exitprobe.cjs <variant-query> "x,z;x,z"
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.env.MAP || 'cyber'; const VQ = process.argv[2] || ''; const PTS = (process.argv[3] || '160.9,787.6').split(';').map((s) => s.split(',').map(Number));
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&dpr=1&lowshadow&nopost&far=140&${VQ}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  for (const [x, z] of PTS) {
    const r = await p.evaluate(`(() => { const G = __G, g = G.game, P = g.P, col = g.city.col; const res = { n: 0, pIn: 0, cIn: 0, cases: [] };
      for (let k = 0; k < 12; k++) for (const slide of [0, 1, -1]) { if (P.car) g.toggleCar(); g.override = null; g.tp(${x}, ${z}, 0); G.step(2);
        const yaw = k / 12 * Math.PI * 2; g.carNearPlayer('sedan', 0.01); const v = g.traffic.cars[g.traffic.cars.length - 1]; let cx = ${x}, cz = ${z};
        if (slide) { const lx = Math.cos(yaw) * slide, lz = -Math.sin(yaw) * slide; for (let d = 0; d < 6; d += 0.1) { const t = col.raycast(cx, G.game.city.groundH(cx, cz) + 0.6, cz, cx + lx * (v.dims.W / 2 + 0.15), G.game.city.groundH(cx, cz) + 0.6, cz + lz * (v.dims.W / 2 + 0.15)); if (t < 1) break; cx += lx * 0.1; cz += lz * 0.1; } }
        v.place(cx, cz, yaw); v.health = 100; v.ai = null; g.tp(cx + Math.cos(yaw) * 2, cz - Math.sin(yaw) * 2, 0); G.step(1); g.toggleCar(); G.step(3); if (!P.car) { continue; } g.toggleCar(); res.n++;
        let pin = 0, cin = 0; for (let f = 0; f < 8; f++) { G.step(1); const q = col.resolve(P.pos.x, P.pos.z, 0.35, P.pos.y + 0.5); if (Math.hypot(q.x - P.pos.x, q.z - P.pos.z) > 0.05) pin++; const c = G.camera.position; const q2 = col.resolve(c.x, c.z, 0.05, c.y); if (Math.hypot(q2.x - c.x, q2.z - c.z) > 0.05) cin++; }
        if (pin) res.pIn++; if (cin) res.cIn++; if (pin || cin) res.cases.push({ yaw: +yaw.toFixed(2), slide, car: [+cx.toFixed(1), +cz.toFixed(1)], player: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], pin, cin });
        const i = g.traffic.cars.indexOf(v); if (i >= 0) { g.traffic.cars.splice(i, 1); v.dispose ? v.dispose() : v.root && v.root.removeFromParent(); } }
      return res; })()`);
    console.log(VQ || 'new', JSON.stringify([x, z]), 'exits', r.n, 'playerInCollider', r.pIn, 'cameraInCollider', r.cIn, JSON.stringify(r.cases.slice(0, 8)));
  }
  console.log('PAGEERROR', perr); await b.close().catch(() => {}); process.exit(0);
});
