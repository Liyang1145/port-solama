// fix_pt1: PLAYTEST_1H #2 root cause check. page.evaluate('__G.game.carNearPlayer("sedan",5)') RETURNS the Vehicle; Playwright then
// serialises everything reachable from it (scene graph, geometry arrays, ...) back to node. Compare with a void call. Guarded.
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'gta';
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const avail = () => +cp.execSync("free -m | awk '/Mem:/{print $7}'").toString().trim();
const chromeRss = () => +cp.execSync(`ps -eo rss=,comm= | awk '/chrome/{s+=$1} END{print int(s/1024)}'`).toString().trim();
const nodeRss = () => Math.round(process.memoryUsage().rss / 1048576);
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(120000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const pid = +cp.execSync(`ps -eo pid=,ppid=,comm= | awk -v p=${process.pid} '$2==p && /chrome/{print $1}' | head -1`).toString().trim();
  const peak = { node: 0, chrome: 0, minAvail: 1e9 }; const iv = setInterval(() => { const a = avail(); peak.node = Math.max(peak.node, nodeRss()); peak.chrome = Math.max(peak.chrome, chromeRss()); peak.minAvail = Math.min(peak.minAvail, a); if (a < 600) { console.log('GUARD: avail', a, 'node', nodeRss(), 'chrome', chromeRss(), '-> kill own chrome'); try { process.kill(pid, 'SIGKILL'); } catch (e) { } } }, 200);
  for (const [tag, js] of [['void (new)', 'void __G.game.carNearPlayer("sedan", 5)'], ['returned (playtest harness)', '__G.game.carNearPlayer && __G.game.carNearPlayer("sedan", 5)']]) {
    Object.assign(peak, { node: nodeRss(), chrome: chromeRss(), minAvail: avail() }); const n0 = nodeRss(), c0 = chromeRss(), a0 = avail(), t = Date.now(); let err = null, len = null;
    try { const r = await p.evaluate(js); len = r === undefined ? 'undefined' : JSON.stringify(r) === undefined ? 'unserialisable' : JSON.stringify(r).length; } catch (e) { err = e.message.slice(0, 120); }
    console.log('RESULT', JSON.stringify({ tag, ms: Date.now() - t, resultJsonChars: len, err, nodeMB: [n0, peak.node], chromeMB: [c0, peak.chrome], availMB: [a0, peak.minAvail] }));
    if (err) break;
  }
  clearInterval(iv); await b.close().catch(() => {}); process.exit(0);
});
