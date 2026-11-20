// Headless screenshot / logic harness (SwiftShader WebGL2). Serves dist/ over http, loads the game once in ?snap mode,
// then runs a list of shots: each {name, js} where js is evaluated in the page (use window.__G) before rendering.
// usage: node shot.cjs plan.json outdir [w h]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const outdir = process.argv[3] || 'shots/tmp';
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
fs.mkdirSync(outdir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const srv = http.createServer((q, s) => { const p = path.join(__dirname, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const port = srv.address().port; const t0 = Date.now();
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-watchdog', '--disable-hang-monitor', `--window-size=${W},${H}`] });
  const p = await b.newPage({ viewport: { width: W, height: H } }); p.setDefaultTimeout(1800000);
  const logs = []; p.on('console', (m) => { logs.push(m.type() + ': ' + m.text()); if (m.type() === 'error') console.log('CONSOLE-ERR', m.text().slice(0, 1500)); }); p.on('pageerror', (e) => { logs.push('PAGEERROR: ' + e.message); console.log('PAGEERROR', e.message); });
  await p.goto(`http://127.0.0.1:${port}/index.html?snap&${plan.query || ''}`, { timeout: 600000 });
  await p.waitForFunction('window.__G && window.__G.ready', null, { timeout: 900000, polling: 1000 });
  console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  for (const s of plan.shots) {
    const t1 = Date.now();
    try {
      const r = await p.evaluate(s.js || '0');
      if (r !== undefined && r !== 0) { console.log(s.name, 'js->', JSON.stringify(r).slice(0, 600)); fs.writeFileSync(path.join(outdir, s.name + '.json'), JSON.stringify(r, null, 1)); }
      if (s.noshot) continue;
      const tr = Date.now(); await p.evaluate(process.env.R2 ? 'window.__G.render(); window.__G.render();' : 'window.__G.render();'); console.log('rendered', s.name, ((Date.now() - tr) / 1000).toFixed(0) + 's');
      if (process.env.CAP === 'canvas') { // v4.3: read the WebGL canvas directly (no compositor frame; the headless GPU process kept dying in page.screenshot)
        const url = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
        fs.writeFileSync(path.join(outdir, s.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      } else await p.screenshot({ path: path.join(outdir, s.name + '.png'), timeout: 600000 });
      console.log('shot', s.name, ((Date.now() - t1) / 1000).toFixed(0) + 's');
    } catch (e) { console.log('ERR', s.name, e.message); }
  }
  const st = await p.evaluate('JSON.stringify(window.__G.stats())'); console.log('stats', st);
  console.log(logs.filter((l) => !/GPU stall|GL Driver Message|Automatic fallback/.test(l)).slice(0, 40).join('\n'));
  await b.close(); srv.close();
});
