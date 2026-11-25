// anim3 playtest: B map "lawn over the road" flicker probe. Stands at a spot, steps frames, renders every 2nd, measures the green
// fraction of the lower half and diffs which meshes are visible between frames. usage: node tools/grassprobe.cjs <out.json> [x z yaw frames] env DIST, Q
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const OUT = process.argv[2] || 'shots/grassprobe.json';
const X = +(process.argv[3] || 284.5), Z = +(process.argv[4] || 22), YAW = +(process.argv[5] || 0), NF = +(process.argv[6] || 200);
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1200', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(600000);
  let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=cyber&hour=13&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  console.log('ready');
  await p.evaluate(`void (() => { const G = __G, g = G.game; __G.rb = 1; g.tp(${X}, ${Z}, ${YAW}); g.cam.yaw = ${YAW} + Math.PI; G.step(2); g.updateCamera(1, true);
    window.__cv = document.createElement('canvas'); __cv.width = 120; __cv.height = 68; window.__vis = () => { const s = new Map(); G.scene.traverseVisible((o) => { if (o.isMesh) s.set(o.uuid, o); }); return s; }; window.__prev = __vis(); })()`);
  const rows = []; let shots = 0;
  for (let i = 0; i < NF; i++) {
    const r = await p.evaluate(`(() => { const G = __G; G.step(1, 1 / 30); G.game.cam.yaw += ${+(process.env.ROT||0)}; if (${i} % 2) return null; G.render(); const c = __cv.getContext('2d'); c.drawImage(G.renderer.domElement, 0, 0, 120, 68);
      const d = c.getImageData(0, 34, 120, 34).data; let g = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 1] > d[k] + 25 && d[k + 1] > d[k + 2] + 15) g++;
      const cur = __vis(); const on = [], off = []; for (const [u, o] of cur) if (!__prev.has(u)) on.push(o); for (const [u, o] of __prev) if (!cur.has(u)) off.push(o); window.__prev = cur;
      const nm = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return (o.name || o.type) + ':' + (m && (m.name || (m.userData && m.userData.prepKey) || m.type)) + (o.parent ? '<' + (o.parent.name || o.parent.type) : ''); };
      const cp = G.camera.position; return { green: +(g / (120 * 34)).toFixed(3), cam: [cp.x, cp.y, cp.z].map((v) => +v.toFixed(2)), on: on.slice(0, 12).map(nm), off: off.slice(0, 12).map(nm), non: on.length, noff: off.length, sp: !!(G.sprobe.step && G.sprobe.step.busy) }; })()`);
    if (!r) continue; r.i = i; rows.push(r); console.log(JSON.stringify(r).slice(0, 500));
    if ((process.env.SHOTS || '').split(',').includes(String(i))) await p.screenshot({ path: OUT.replace(/\.json$/, '') + '_' + i + '.jpg', type: 'jpeg', quality: 70 });
    else if (shots < 6 && rows.length > 1 && Math.abs(r.green - rows[rows.length - 2].green) > 0.05) { await p.screenshot({ path: OUT.replace(/\.json$/, '') + '_' + i + '.jpg', type: 'jpeg', quality: 70 }); shots++; }
  }
  fs.writeFileSync(OUT, JSON.stringify({ perr, rows }, null, 1)); console.log('DONE perr', perr); await b.close(); srv.close(); process.exit(0);
});
