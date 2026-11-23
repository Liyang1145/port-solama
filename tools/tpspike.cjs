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
  const r = await p.evaluate(`(() => { const G = __G, g = G.game; G.profInit(); for (let i = 0; i < 3; i++) G.tick(1/30, false); const out = [];
    for (const [x, z] of [[281, 14], [-300, 200], [600, -400]]) { g.tp(x, z, 0); for (let i = 0; i < 3; i++) { const f = G.tick(1/30, false); out.push({ x, i, ms: Math.round(f.ms), T: Object.entries(f.T).filter(([k, v]) => v > 15).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + Math.round(v)).join(' ') }); } }
    return out; })()`);
  console.log(TAG, JSON.stringify(r), 'PAGEERROR', perr);
  fs.appendFileSync(path.join(out, 'tpspike.log'), TAG + ' ' + JSON.stringify(r) + ' PAGEERROR ' + perr + '\n'); process.exit(0);
});
