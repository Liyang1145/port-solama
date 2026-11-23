// perf_debug4 shotlite.cjs: low-memory screenshots (gl.readPixels of one scene -> raw RGBA file, no toDataURL / page.screenshot).
// usage: Q=... node tools/shotlite.cjs <map> <tag> <scene: spawn|drive|night|water>   -> shots/L_<map>/<tag>_<scene>.rgba (+ .json w,h)
// perf_debug1: rendered-frame comparison at 960x540 (new vs Q=old switches). usage: node tools/rcmp.cjs <map> <tag>   env Q
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, 98000); const SC = process.argv[4] || 'spawn';
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
let BP = []; const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1000 --max-semi-space-size=2 --optimize-for-size', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256']; const MAPN = process.argv[2] || 'gta', TAG = process.argv[3] || 'new'; const out = path.join(root, 'shots', 'L_' + MAPN); fs.mkdirSync(out, { recursive: true });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/workspace/work/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell', args: ARGS });
  BP = require('child_process').execSync(`ps -o pid= --ppid ${process.pid}`).toString().split(/\s+/).filter(Boolean);
  process.on('exit', () => { for (const pid of BP) try { require('child_process').execSync(`for q in $(ps -o pid= --sid ${pid}); do kill -9 $q 2>/dev/null; done; true`); } catch (e) { } });
  const W = +(process.env.VW || 800), H = +(process.env.VH || 450);
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage(); p.setDefaultTimeout(90000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  const hour = SC === 'night' ? 22 : 15;
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${MAPN}&hour=${hour}&${process.env.Q || ''}`); const T0 = Date.now(); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 }); console.log('ready ms', Date.now() - T0);
  await p.evaluate(`(() => { const G = __G, g = G.game; const sc = '${SC}';
    if (sc === 'drive') { const c = g.nearestCar(); if (c) { g.tp(c.x + 2, c.z, 0); G.step(2); g.toggleCar(); G.step(4); g.override = { throttle: 0.6, steer: 0 }; G.step(70); g.override = { throttle: 0.2, steer: 0 }; } }
    else if (sc === 'water') { ${process.env.WATERJS || "g.tp(-330, -30, -Math.PI / 2);"} G.step(8); }
    else G.step(8);
    G.sprobe.t = 99; if (G.sprobe.spn) G.sprobe.spn.every = 1; return 0; })()`); const TS = Date.now(); console.log('scene ms', TS - T0);
  for (let i = 0; i < +(process.env.NR || 9); i++) { const t = Date.now(); await p.evaluate('__G.render()'); if (i < 3 || i % 4 === 0) console.log('render', i, Date.now() - t); }
  const info = await p.evaluate(`(() => { const G = __G; window.__RT = 0;
    const gl = G.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    window.__PX = px; const st = G.stats(); return { w, h, cam: G.camera.position.toArray().map((v) => +v.toFixed(1)), calls: st.calls, tris: st.tris, rt: Math.round(window.__RT), heap: Math.round(performance.memory.usedJSHeapSize / 1048576) }; })()`);
  console.log('px ms', Date.now() - TS); const n = info.w * info.h * 4, CH = 1 << 20; const buf = Buffer.alloc(n);
  for (let o = 0; o < n; o += CH) { const s = await p.evaluate(`(() => { const a = __PX.subarray(${o}, ${Math.min(n, o + CH)}); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); })()`); Buffer.from(s, 'base64').copy(buf, o); }
  const f = path.join(out, TAG + '_' + SC); fs.writeFileSync(f + '.rgba', buf); fs.writeFileSync(f + '.json', JSON.stringify(info));
  console.log(TAG, SC, JSON.stringify(info), 'PAGEERROR', perr); process.exit(0);
});
