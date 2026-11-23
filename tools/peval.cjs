// perf_debug1: quick probe: load ?snap (map argv[2]) and print the result of each JS expression in argv[3..] (foreground, < 90 s)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, +(process.env.TMAX || 88000));
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1600'] });
  const p = await (await b.newContext({ viewport: { width: +(process.env.SW || 480), height: +(process.env.SH || 270) } })).newPage(); p.setDefaultTimeout(80000);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${process.argv[2]}&${process.env.Q || ''}`);
  await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  for (const js of process.argv.slice(3)) { try { const r = await p.evaluate(js); console.log('>>', JSON.stringify(r)); } catch (e) { console.log('ERR', e.message.slice(0, 400)); } }
  if (process.env.SHOT) { await p.evaluate('__G.render()'); const u = await p.evaluate(() => document.getElementById('c').toDataURL('image/jpeg', 0.85)); fs.writeFileSync(process.env.SHOT, Buffer.from(u.split(',')[1], 'base64')); console.log('shot', process.env.SHOT); }
  await b.close(); srv.close(); process.exit(0);
});
