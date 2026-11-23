// fix_pt4: load-time vs browser launch args (ptS harness args vs shot args). usage: node tools/ltargs.cjs <map> <variant>
// variants: pts = ptS.cjs args exactly (single-process, old-space 900, optimize-for-size, gpu-mem 256); pts1400 = same with old-space 1400;
// ptshide = pts + --disable-gpu-compositing (ptS HIDECANVAS): ready 28.8 -> 95.8 s, but without it ptS pays the same ~115 s as the first GL finish after ready (SwiftShader), so it only moves the cost; env INIT=1 adds ptS's rAF hook
// ptsmulti = ptS args without --single-process; shot = shotcmp args (old-space 1000, multi-process)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'cyber'; const VAR = process.argv[3] || 'pts';
const DIST = process.env.DIST || path.join(root, 'dist');
const srv = http.createServer((q, s) => { const p = path.join(DIST, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const base = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--disable-dev-shm-usage', '--renderer-process-limit=1'];
const A = {
  pts: [...base, '--js-flags=--max-old-space-size=900 --max-semi-space-size=2 --optimize-for-size', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'],
  pts1400: [...base, '--js-flags=--max-old-space-size=1400', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'],
  pts1400s: [...base, '--js-flags=--max-old-space-size=1400 --max-semi-space-size=2 --optimize-for-size', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'],
  ptsmulti: [...base, '--js-flags=--max-old-space-size=900 --max-semi-space-size=2 --optimize-for-size'],
  ptshide: [...base, '--disable-gpu-compositing', '--js-flags=--max-old-space-size=900 --max-semi-space-size=2 --optimize-for-size', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'],
  shot: [...base, '--js-flags=--max-old-space-size=1000 --max-semi-space-size=2 --optimize-for-size'],
}[VAR];
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: A });
  const ctx = await b.newContext({ viewport: { width: +(process.env.VW || 480), height: +(process.env.VH || 270) }, deviceScaleFactor: 1 }); if (process.env.INIT) await ctx.addInitScript(`(() => { window.__FT = []; const raf = window.requestAnimationFrame.bind(window); let last = 0; window.requestAnimationFrame = (cb) => raf((ts) => { const n = performance.now(); if (last) window.__FT.push(n - last); last = n; cb(ts); }); })();`); const p = await ctx.newPage(); p.setDefaultTimeout(400000);
  let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  const lt = []; p.on('console', (m) => { const t = m.text(); if (/loadtime/.test(t)) lt.push(t.slice(0, 160)); });
  const T0 = Date.now(); const hs = []; const iv = setInterval(async () => { try { hs.push([((Date.now() - T0) / 1000) | 0, await p.evaluate('Math.round(performance.memory.usedJSHeapSize/1048576)+"/"+Math.round(performance.memory.jsHeapSizeLimit/1048576)')]); } catch (e) { } }, 5000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${MAPN}${process.env.Q ? "&" + process.env.Q : ""}`, { timeout: 300000 });
  await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 1000, timeout: 400000 }); clearInterval(iv);
  const ready = (Date.now() - T0) / 1000; const heap = await p.evaluate('Math.round(performance.memory.usedJSHeapSize/1048576)');
  console.log('RESULT', JSON.stringify({ map: MAPN, var: VAR, ready, heap, perr, heapTrace: hs.filter((_, i) => i % 2 === 0) }));
  for (const l of lt.slice(-6)) console.log('  ', l);
  await b.close(); srv.close(); process.exit(0);
});
