// perf_debug1: CDP sampling profile of N logic frames (no render) -> top self-time functions. usage: node tools/cpuprof.cjs <map> [frames]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, 95000);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
let BP = [];
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/workspace/work/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100'] });
  BP = require('child_process').execSync(`ps -o pid= --ppid ${process.pid}`).toString().split(/\s+/).filter(Boolean);
  process.on('exit', () => { for (const pid of BP) try { require('child_process').execSync(`for q in $(ps -o pid= --sid ${pid}); do kill -9 $q 2>/dev/null; done; true`); } catch (e) { } });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(90000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${process.argv[2] || 'gta'}&hour=15&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  await p.evaluate('for (let i = 0; i < 60; i++) __G.tick(1/30, false)');
  const c = await p.context().newCDPSession(p); await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 200 }); await c.send('Profiler.start');
  const t = Date.now(); await p.evaluate(`for (let i = 0; i < ${+(process.argv[3] || 300)}; i++) __G.tick(1/30, false)`); const ms = Date.now() - t;
  const { profile } = await c.send('Profiler.stop'); const dt = {}; const byId = {}; for (const n of profile.nodes) byId[n.id] = n;
  for (let i = 0; i < profile.samples.length; i++) { const n = byId[profile.samples[i]]; const cf = n.callFrame; const k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + cf.lineNumber; dt[k] = (dt[k] || 0) + (profile.timeDeltas[i] || 0); }
  const tot = Object.values(dt).reduce((a, b) => a + b, 0); console.log('frames', process.argv[3] || 300, 'wall ms', ms);
  for (const [k, v] of Object.entries(dt).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log((v / tot * 100).toFixed(1) + '%', k);
  fs.writeFileSync(path.join(root, 'shots', 'cpuprof_' + (process.argv[2] || 'gta') + (process.env.Q ? '_old' : '') + '.cpuprofile'), JSON.stringify(profile));
  process.exit(0);
});
