// fix_pt1: (a) PIT: drop a car at each point with 8 headings, full throttle 1.5 s then full reverse 1.5 s (logic only); reports how far it
// got, nearby collider boxes and the ground height grid. (b) COP: carjack an AI police cruiser (carNearPlayer('police') + chase AI) next
// to the player, then drive it. usage: node tools/carprobe.cjs <map> pit "x,z;x,z" | cop "x,z"   env Q, TYPE (default sedan)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'cyber', MODE = process.argv[3] || 'pit'; const PTS = (process.argv[4] || '161,-101').split(';').map((s) => s.split(',').map(Number));
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  for (const [vn, q] of (process.env.V || 'new=').split(';').map((s) => s.split('='))) {
    const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0&${q}&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
    const r = await p.evaluate(`(() => { const G = __G, g = G.game, col = g.city.col; const out = []; const TYPE = ${JSON.stringify(process.env.TYPE || 'sedan')};
      if (${JSON.stringify(MODE)} === 'pit') for (const [x, z] of ${JSON.stringify(PTS)}) {
        g.tp(x + 6, z, 0); G.step(3); const row = { pt: [x, z], boxes: col.query(x, z, 5).map((b) => [b.tag, +b.minX.toFixed(2), +b.minZ.toFixed(2), +b.maxX.toFixed(2), +b.maxZ.toFixed(2), +b.h.toFixed(2), b.o ? 'obb' : '', b.y0 ?? '']).slice(0, 24), over: g.city.col.over ? g.city.col.over.query(x, z, 5).map((b) => [b.tag, +b.minX.toFixed(2), +b.minZ.toFixed(2), +b.maxX.toFixed(2), +b.maxZ.toFixed(2), +b.y0.toFixed(2), +b.h.toFixed(2), b.o ? 'obb' : '']).slice(0, 16) : null, gh: [], runs: [] };
        for (let dz = -4; dz <= 4; dz += 2) row.gh.push([-4, -2, 0, 2, 4].map((dx) => +g.city.groundH(x + dx, z + dz).toFixed(2)));
        for (let k = 0; k < 8; k++) { const yaw = k / 8 * Math.PI * 2; const v = g.carNearPlayer(TYPE, 0); v.ai = null; v.place(x, z, yaw); G.step(1); if (g.P.car) g.toggleCar(); g.tp(v.x + 4 * Math.cos(yaw), v.z - 4 * Math.sin(yaw), 0); G.step(1); g.toggleCar(); const inCar = g.P.car === v;
          const ov = (cx, cz, r) => col.query(cx, cz, r + 1).filter((b) => { if (0.5 > b.h) return false; if (b.o) { const o = b.o; const rx = cx - o.cx, rz = cz - o.cz; const la = rx * o.ux + rz * o.uz, lw = -rx * o.uz + rz * o.ux; const da = la - Math.max(-o.hl, Math.min(o.hl, la)), dw = lw - Math.max(-o.hw, Math.min(o.hw, lw)); return da * da + dw * dw < r * r; } const qx = Math.max(b.minX, Math.min(b.maxX, cx)) - cx, qz = Math.max(b.minZ, Math.min(b.maxZ, cz)) - cz; return qx * qx + qz * qz < r * r; }).map((b) => b.tag + (b.o ? '(obb ' + b.o.cx.toFixed(1) + ',' + b.o.cz.toFixed(1) + ' ' + b.o.hl.toFixed(2) + 'x' + b.o.hw.toFixed(2) + ')' : '[' + b.minX.toFixed(1) + ',' + b.minZ.toFixed(1) + '..' + b.maxX.toFixed(1) + ',' + b.maxZ.toFixed(1) + ']') + ' h' + b.h.toFixed(2));
          const circ = () => { const f = v.forward(), r0 = v.dims.W * 0.5, hf = v.dims.L * 0.5 - r0; return [-1, 0, 1].map((kk) => ov(v.x + f.x * hf * kk, v.z + f.z * hf * kk, r0)); };
          const hitsStart = circ(); const x0 = v.x, z0 = v.z; g.override = { throttle: 1, steer: 0 }; G.step(45); const fw = +Math.hypot(v.x - x0, v.z - z0).toFixed(2); const x1 = v.x, z1 = v.z;
          g.override = { throttle: -1, steer: 0.6 }; G.step(60); const bw = +Math.hypot(v.x - x1, v.z - z1).toFixed(2); g.override = null; if (g.P.car) g.toggleCar();
          row.runs.push({ yaw: +yaw.toFixed(2), inCar, start: [+x0.toFixed(2), +z0.toFixed(2)], placedShift: +Math.hypot(x0 - x, z0 - z).toFixed(2), fwd: fw, back: bw, end: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)], hp: Math.round(v.health), hitsStart, hitsEnd: circ() });
          g.traffic.removeCar(v); }
        out.push(row); }
      else { const [x, z] = ${JSON.stringify(PTS[0])}; g.tp(x, z, 0); G.step(3); const v = g.carNearPlayer('police', 4); v.ai = { mode: 'chase', target: g.P.pos.clone(), chaseSpeed: 0, stuck: 0, seg: g.city.segs && g.city.segs[0], dir: 1, lane: 0, cruise: 0 }; v.siren = true; v.crew = 2; g.policeCars.push(v); G.step(2);
        const trace = []; const inT = () => g.traffic.cars.includes(v); trace.push(['spawned', +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), inT(), Math.round(v.health), v.ai && v.ai.mode]);
        g.toggleCar(); trace.push(['after F', g.P.car === v, inT(), g.wanted, v.driver, !!v.ai, v.parked, v.input.handbrake]);
        for (let i = 0; i < 6; i++) { g.override = { throttle: 1, steer: 0 }; G.step(15); trace.push(['drive', i, +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +(v.speed * 3.6).toFixed(0), inT(), g.wanted, g.policeCars.includes(v), g.P.car === v]); }
        g.override = null; out.push({ trace }); }
      return out; })()`);
    for (const row of r) console.log(vn, JSON.stringify(row)); console.log(vn, 'PAGEERROR', perr); await p.close();
  }
  await b.close(); process.exit(0);
});
