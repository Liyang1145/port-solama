// perf_debug3 first.cjs: first-rendered-frame breakdown + CPU-side geometry/texture memory census. (from rcmp)
// perf_debug1: rendered-frame comparison at 960x540 (new vs Q=old switches). usage: node tools/rcmp.cjs <map> <tag>   env Q
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); setTimeout(() => { console.log('SELF-TIMEOUT'); process.exit(3); }, 97000);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
let BP = []; const MAPN = process.argv[2] || 'gta', TAG = process.argv[3] || 'new'; const out = path.join(root, 'shots', 'R_' + MAPN); fs.mkdirSync(out, { recursive: true });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/workspace/work/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1100'] });
  BP = require('child_process').execSync(`ps -o pid= --ppid ${process.pid}`).toString().split(/\s+/).filter(Boolean);
  process.on('exit', () => { for (const pid of BP) try { require('child_process').execSync(`for q in $(ps -o pid= --sid ${pid}); do kill -9 $q 2>/dev/null; done; true`); } catch (e) { } });
  const p = await (await b.newContext({ viewport: { width: +(process.env.VW || 960), height: +(process.env.VH || 540) }, deviceScaleFactor: +(process.env.DSF || 1.5) })).newPage(); p.setDefaultTimeout(90000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&prof&map=${MAPN}&hour=${process.env.HOUR || 15}&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G; G.profInit(); const pg = G.renderer.info.programs.length; const fr = []; for (let i = 0; i < 4; i++) { const f = G.tick(1/30, true); fr.push({ ms: Math.round(f.ms), progs: f.progs, T: Object.entries(f.T).filter(([k, v]) => v > 40).map(([k, v]) => k + '=' + Math.round(v)).join(' ') }); }
  const seen = new Set(); let attr = 0, idx = 0, nG = 0, dup = 0; const bySig = new Map(); const big = {}; G.scene.traverse((o) => { const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); nG++; let b = 0; for (const k in g.attributes) { const a = g.attributes[k]; const arr = a.array || (a.data && a.data.array); if (arr && !seen.has(arr)) { seen.add(arr); b += arr.byteLength; } }
    for (const k in g.morphAttributes) for (const a of g.morphAttributes[k]) if (a.array && !seen.has(a.array)) { seen.add(a.array); b += a.array.byteLength; }
    if (g.index && !seen.has(g.index.array)) { seen.add(g.index.array); idx += g.index.array.byteLength; } attr += b; const pos = g.attributes.position; if (pos) { const sig = pos.count + ':' + (pos.array[0]||0).toFixed(3) + ':' + (pos.array[pos.array.length-1]||0).toFixed(3); if (bySig.has(sig)) dup += b; else bySig.set(sig, 1); }
    const nm = (o.name || o.parent && o.parent.name || o.type).slice(0, 24); big[nm] = (big[nm] || 0) + b; });
  let tex = 0; const ts = new Set(); G.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k in m) { const t = m[k]; if (t && t.isTexture && !ts.has(t)) { ts.add(t); const im = t.image; if (im && im.data && im.data.byteLength) tex += im.data.byteLength; } } });
  const top = Object.entries(big).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ':' + (v / 1048576).toFixed(1));
  return { fr, prog0: pg, geoMB: +(attr / 1048576).toFixed(1), idxMB: +(idx / 1048576).toFixed(1), dupMB: +(dup / 1048576).toFixed(1), nG, dataTexMB: +(tex / 1048576).toFixed(1), top, heap: Math.round(performance.memory.usedJSHeapSize / 1048576), rel: G.releasedMB && G.releasedMB(), lt: (() => { try { return JSON.stringify({ w: 0 }); } catch (e) { return 0; } })() }; })()`);
  console.log(TAG, JSON.stringify(r), 'PAGEERROR', perr);
  if (process.env.SHOT) { const url = await p.evaluate(() => document.getElementById('c').toDataURL('image/jpeg', 0.9)); fs.writeFileSync(path.join(out, TAG + '.jpg'), Buffer.from(url.split(',')[1], 'base64')); }
  fs.appendFileSync(path.join(out, 'first.log'), TAG + ' ' + JSON.stringify(r) + ' PAGEERROR ' + perr + '\n'); process.exit(0);
});
