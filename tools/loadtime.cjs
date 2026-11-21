// loadtime harness: serves a dir (default dist_single), opens index.html?<query> WITHOUT snap (real start-up path), waits for the
// '[loadtime]' console line (first rendered frame), writes the stage table. usage: node tools/loadtime.cjs out.json [query] [dir]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const out = process.argv[2], query = process.argv[3] || 'map=gta', root = path.resolve(process.argv[4] || 'dist_single');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.webp': 'image/webp', '.bin': 'application/octet-stream' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const kill = setTimeout(() => { fs.writeFileSync(out, JSON.stringify({ error: 'timeout' })); process.exit(2); }, +(process.env.LT_TIMEOUT || 900) * 1000);
srv.listen(0, async () => {
  const port = srv.address().port; const t0 = Date.now(); const logs = [];
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-watchdog', '--disable-hang-monitor', '--window-size=960,540', ...(process.env.XARGS || '').split(' ').filter(Boolean)] });
  fs.writeFileSync(out + '.pid', String(process.pid));
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage(); p.setDefaultTimeout(900000);
  let perr = 0; p.on('pageerror', (e) => { perr++; logs.push('PAGEERROR ' + e.message); });
  p.on('console', (m) => { const t = m.text(); if (/loadtime|error/i.test(t)) logs.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + t.slice(0, 2000)); });
  await p.goto(`http://127.0.0.1:${port}/index.html?${query}`, { timeout: 600000 });
  await p.waitForFunction('window.__LT && window.__LT.marks.some(m => m[0] === "first frame")', null, { timeout: 900000, polling: 500 });
  const LT = await p.evaluate('window.__LT');
  // a second frame (steady state) to see the residual compile on frame 2
  const f2 = await p.evaluate('(() => { const t = performance.now(); window.__G.render(); const g = window.__G.renderer.getContext(); g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(4)); return Math.round(performance.now() - t); })()');
  LT.frame2 = f2; LT.wall = (Date.now() - t0) / 1000; LT.perr = perr; LT.logs = logs; LT.programsAfter = await p.evaluate('window.__G.renderer.info.programs.length');
  LT.frame3 = await p.evaluate('(() => { const t = performance.now(); window.__G.render(); const g = window.__G.renderer.getContext(); g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(4)); return Math.round(performance.now() - t); })()');
  LT.progList = await p.evaluate(`window.__G.renderer.info.programs.map(p => { const g = window.__G.renderer.getContext(); const sh = g.getAttachedShaders(p.program); const fsrc = g.getShaderSource(sh[1]); const defs = (fsrc.match(/^#define [A-Z_0-9]+.*$/gm) || []).filter(d => !/PI|EPSILON|saturate|whiteComplement|RECIPROCAL|LOG2|sqrt|pow2|pow3|pow4|average|SHADER_|STANDARD$|PHYSICAL|GAMMA|LOW_PRECISION|HIGH_PRECISION|MEDIUM/.test(d)).join(' '); return [p.name, p.usedTimes, sh.map(x => g.getShaderSource(x).length).join('/'), p.cacheKey.length, defs, p.cacheKey.slice(0, 60)]; })`);
  LT.translated = await p.evaluate(`(() => { const r = window.__G.renderer, g = r.getContext(), x = g.getExtension('WEBGL_debug_shaders'); if (!x) return null; let fs = 0, vs = 0, n = 0, mx = 0;
    for (const p of r.info.programs) { const sh = g.getAttachedShaders(p.program); const a = x.getTranslatedShaderSource(sh[0]).length, b = x.getTranslatedShaderSource(sh[1]).length; vs += a; fs += b; n++; mx = Math.max(mx, b); } return { n, vs, fs, maxFs: mx }; })()`);
  if (process.env.LT_SHOT) await p.screenshot({ path: process.env.LT_SHOT });
  fs.writeFileSync(out, JSON.stringify(LT, null, 1)); await b.close(); srv.close(); clearTimeout(kill); process.exit(0);
});
