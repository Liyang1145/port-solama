// perf_debug4 sprobe.cjs: street probe per-face calls / tris / ms after a forced refresh. usage: Q=oldsprobe node tools/sprobe.cjs gta old
// perf_debug1: rendered-frame comparison at 960x540 (new vs Q=old switches). usage: node tools/rcmp.cjs <map> <tag>   env Q
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, 97000);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
let BP = []; const MAPN = process.argv[2] || 'gta', TAG = process.argv[3] || 'new'; const out = path.join(root, 'shots', 'R_' + MAPN); fs.mkdirSync(out, { recursive: true });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/workspace/work/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1100'] });
  BP = require('child_process').execSync(`ps -o pid= --ppid ${process.pid}`).toString().split(/\s+/).filter(Boolean);
  process.on('exit', () => { for (const pid of BP) try { require('child_process').execSync(`for q in $(ps -o pid= --sid ${pid}); do kill -9 $q 2>/dev/null; done; true`); } catch (e) { } });
  const p = await (await b.newContext({ viewport: { width: +(process.env.VW || 960), height: +(process.env.VH || 540) }, deviceScaleFactor: +(process.env.DSF || 1.5) })).newPage(); p.setDefaultTimeout(90000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&prof&map=${MAPN}&hour=${process.env.HOUR || 15}&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G; const THREE_F = G.camera.constructor; const cam = G.sprobe.cam; cam.position.set(G.camera.position.x, 2.2, G.camera.position.z); cam.updateMatrixWorld(true);
    const out = []; const cp = cam.position; G.scene.traverseVisible((o) => { if (!o.isMesh) return; const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere(); let bs = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : g.boundingSphere; const c = bs.center.clone().applyMatrix4(o.matrixWorld); const rad = bs.radius * o.matrixWorld.getMaxScaleOnAxis(); const d = c.distanceTo(cp) - rad;
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1) * (g.drawRange.count < Infinity ? 0 + 1 : 1); out.push({ n: Math.round(n), nm: (o.name || (o.parent && o.parent.name) || o.type).slice(0, 30), inst: o.isInstancedMesh ? o.count : 0, d: Math.round(d), r: Math.round(rad), y: +(c.y + rad).toFixed(1), fc: o.frustumCulled, L: o.layers.mask }); });
    out.sort((a, b) => b.n - a.n); return { top: out.slice(0, 25), total: out.reduce((a, x) => a + x.n, 0) }; })()`);
  console.log(TAG, JSON.stringify(r), 'PAGEERROR', perr);
  fs.appendFileSync(path.join(out, 'sprobe.log'), TAG + ' ' + JSON.stringify(r) + ' PAGEERROR ' + perr + '\n'); process.exit(0);
});
