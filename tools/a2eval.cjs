// anim2: load the game (map gta / MAP), run JS files from argv (each evaluated as an expression returning JSON), print results
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1400', '--disable-dev-shm-usage', '--renderer-process-limit=1'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage(); p.setDefaultTimeout(600000);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300))); p.on('console', (m) => { if (/\[ual\]|rror/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${process.env.MAP || 'gta'}&hour=13&nomb&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  for (const f of process.argv.slice(2)) { const r = await p.evaluate(fs.readFileSync(f, 'utf8')); console.log(f, JSON.stringify(r)); }
  await b.close(); srv.close(); process.exit(0);
});
