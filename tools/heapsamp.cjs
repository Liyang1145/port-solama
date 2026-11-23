// perf_debug5: JS heap sampling (CDP HeapProfiler.startSampling from before page load -> live allocations at ready).
// usage: Q=... node tools/heapsamp.cjs <tag>   -> shots/pd5/heap_<tag>.json (top allocating functions, self + by module file)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'new';
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1500'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } }); const p = await ctx.newPage(); p.setDefaultTimeout(1100000);
  const cdp = await ctx.newCDPSession(p); await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 65536 });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${process.env.MAP || 'gta'}&hour=15&lowshadow&probe=0&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 1000 });
  await p.evaluate('__G.step(5)'); await cdp.send('HeapProfiler.collectGarbage');
  const mem = await p.evaluate('({ used: Math.round(performance.memory.usedJSHeapSize/1048576), total: Math.round(performance.memory.totalJSHeapSize/1048576) })');
  const { profile } = await cdp.send('HeapProfiler.getSamplingProfile');
  const self = {}, file = {}, stack = {}; let tot = 0;
  const walk = (n, chain) => { const cf = n.callFrame; const nm = (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').pop() + ':' + cf.lineNumber + ':' + cf.columnNumber; const ch = chain.concat(nm);
    if (n.selfSize) { tot += n.selfSize; self[nm] = (self[nm] || 0) + n.selfSize; const key = ch.slice(-6).join(' < '); stack[key] = (stack[key] || 0) + n.selfSize; }
    for (const c of n.children) walk(c, ch); };
  walk(profile.head, []);
  const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, v]) => [+(v / 1048576).toFixed(1), n]);
  const r = { mem, sampledMB: +(tot / 1048576).toFixed(1), self: top(self, 40), stacks: top(stack, 30) };
  fs.mkdirSync(path.join(root, 'shots/pd5'), { recursive: true }); fs.writeFileSync(path.join(root, 'shots/pd5/heap_' + TAG + '.json'), JSON.stringify(r, null, 1));
  console.log(TAG, JSON.stringify({ mem, sampledMB: r.sampledMB })); for (const x of r.self.slice(0, 25)) console.log(' ', x[0], 'MB', x[1]);
  await b.close(); process.exit(0);
});
