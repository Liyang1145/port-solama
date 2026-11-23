// perf_debug6: native memory growth during logic-only play (the human runs got OOM-killed while the JS heap stayed ~900 MB).
// Every 60 frames: browser RSS (ps), Runtime.getHeapUsage (used / backing stores), G.prof alloc; at the end a forced GC.
// usage: MODE=walk|idle|drive node tools/memwatch.cjs <tag> [frames]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'x', NF = +(process.argv[3] || 600), MODE = process.env.MODE || 'walk';
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const rss = () => { try { return Math.round(+cp.execSync(`ps -o rss= --ppid ${process.pid} | awk '{s+=$1} END {print s}'`).toString() / 1024); } catch (e) { return -1; } };
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100 --expose-gc', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(900000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=gta&lowshadow&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const c = await p.context().newCDPSession(p);
  const hu = async () => { const h = await c.send('Runtime.getHeapUsage'); return { used: Math.round(h.usedSize / 1048576), emb: Math.round((h.embedderHeapUsedSize || 0) / 1048576), back: Math.round((h.backingStorageSize || 0) / 1048576) }; };
  console.log(TAG, 'ready rss', rss(), JSON.stringify(await hu()), 'avail', cp.execSync("free -m | awk '/Mem:/{print $7}'").toString().trim());
  if (MODE === 'drive') await p.evaluate('(() => { const g = __G.game; g.carNearPlayer("sport", 3); __G.step(2); g.toggleCar(); })()');
  for (let f = 0; f < NF; f += 60) {
    await p.evaluate(`(() => { const g = __G.game; for (let i = 0; i < 60; i++) { ${MODE === 'walk' ? "g.keys.KeyW = true; g.keys.ShiftLeft = (i % 120) < 60; g.cam.yaw += 0.01;" : MODE === 'drive' ? "g.override = { throttle: 0.8, steer: Math.sin(" + "i / 40) * 0.3 };" : ''} __G.tick(1/30, false); } })()`);
    const a = +cp.execSync("free -m | awk '/Mem:/{print $7}'").toString().trim(); console.log(TAG, 'f', f + 60, 'rss', rss(), JSON.stringify(await hu()), 'avail', a);
    if (a < 600) { console.log(TAG, 'LOW MEM stop'); break; }
  }
  await p.evaluate('window.gc && (gc(), gc())'); await c.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(1500);
  console.log(TAG, 'after GC rss', rss(), JSON.stringify(await hu()), 'PAGEERROR', perr); await b.close(); process.exit(0);
});
