// anim2: render tools/ualview grid -> shots/anim2/ualview_<tag>.png ; env Q (query), TAG
const esbuild = require('esbuild'); const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const out = path.join(root, 'shots/anim2'); fs.mkdirSync(out, { recursive: true });
(async () => {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'ualview/view.js')], bundle: true, format: 'iife', outfile: path.join(root, 'dist/ualview.js'), logLevel: 'warning' });
  fs.writeFileSync(path.join(root, 'dist/ualview.html'), '<html><body style="margin:0"><script src="ualview.js"></script></body></html>');
  const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
  await new Promise((r) => srv.listen(0, r));
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } }); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/ualview.html?${process.env.Q || ''}`); await p.waitForFunction('window.__DONE', null, { timeout: 90000, polling: 300 });
  const r = await p.evaluate('({ err: window.__ERR, info: window.__INFO })'); console.log(JSON.stringify(r));
  const el = await p.$('canvas'); if (el) await el.screenshot({ path: path.join(out, `ualview_${process.env.TAG || 'a'}.png`) });
  await b.close(); srv.close();
})();
