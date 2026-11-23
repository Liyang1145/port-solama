// perf_debug5: teleport spike WITH rendering. Real-play streaming (__G.rb=1) under ?snap&prof; per rendered frame:
// total ms, render stages (r:*), WebGL time split into compile/link (sync points), buffer+texture upload, draw calls, + new programs.
// usage: Q=... node tools/tpr.cjs <tag> [frames]   -> shots/pd5/tpr_<tag>.json
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const TAG = process.argv[2] || 'new', NF = +(process.argv[3] || 30);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const HOOK = `(() => { const P = WebGL2RenderingContext.prototype; const A = window.__GLT = { comp: 0, up: 0, draw: 0, other: 0, upB: 0, n: {} };
  const grp = { compileShader: 'comp', linkProgram: 'comp', getProgramParameter: 'comp', getShaderParameter: 'comp', getProgramInfoLog: 'comp', getShaderInfoLog: 'comp',
    bufferData: 'up', bufferSubData: 'up', texImage2D: 'up', texSubImage2D: 'up', texStorage2D: 'up', texImage3D: 'up', texSubImage3D: 'up', compressedTexImage2D: 'up', compressedTexSubImage2D: 'up', generateMipmap: 'up', texStorage3D: 'up',
    drawElements: 'draw', drawArrays: 'draw', drawElementsInstanced: 'draw', drawArraysInstanced: 'draw', drawBuffers: 'other', readPixels: 'other', clear: 'draw', blitFramebuffer: 'draw' };
  for (const k in grp) { const f = P[k]; if (!f) continue; const g = grp[k]; P[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; A[g] += d; A.n[k] = (A.n[k] || 0) + 1;
    if (g === 'up' && (k === 'bufferData' || k === 'bufferSubData') && a[1] && a[1].byteLength) A.upB += a[1].byteLength; } }; } })();`;
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=1300'] });
  const ctx = await b.newContext({ viewport: { width: +(process.env.VW || 640), height: +(process.env.VH || 360) }, deviceScaleFactor: +(process.env.DSF || 1) });
  await ctx.addInitScript(HOOK); const p = await ctx.newPage(); p.setDefaultTimeout(1100000); let perr = 0;
  p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&prof&map=gta&hour=${process.env.HOUR || 15}&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  console.log('ready', (Date.now() - t0) / 1000 | 0, 's');
  await p.evaluate(`(() => { const G = __G, g = G.game, A = __GLT, R = G.city.region; G.profInit(); G.rb = 1;
    const { wrap, prof } = { wrap: (o, k, l) => { if (!o || typeof o[k] !== 'function') return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { G.prof && (G._sub[l] = (G._sub[l] || 0) + performance.now() - t); } }; } };
    G._sub = {}; wrap(R, 'finish', 'region.finish'); wrap(R, 'unload', 'region.unload'); wrap(R, 'step', 'region.step'); if (R.detail) { wrap(R.detail, 'update', 'detail.update'); } if (R.marina) wrap(R.marina, 'update', 'marina.update');
    const gl = G.renderer.getContext(); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const one = (lbl, i) => { for (const k in A) if (typeof A[k] === 'number') A[k] = 0; A.n = {}; G._sub = {}; const p0 = G.renderer.info.programs.length; const pk0 = new Set(G.renderer.info.programs.map((q) => q.id)); const t = performance.now(); const f = G.tick(1/30, true); const ts = performance.now(); sync(); const syncMs = performance.now() - ts;
      return { at: lbl, i, ms: Math.round(performance.now() - t), sync: Math.round(syncMs), newProg: G.renderer.info.programs.length - p0, progs: G.renderer.info.programs.filter((q) => !pk0.has(q.id)).map((q) => q.name + '|' + String(q.cacheKey).slice(0, 60)), calls: f.calls, gl: { comp: Math.round(A.comp), up: Math.round(A.up), upMB: +(A.upB / 1048576).toFixed(1), draw: Math.round(A.draw), nBuf: A.n.bufferData || 0, nTex: (A.n.texImage2D || 0) + (A.n.texStorage2D || 0), nLink: A.n.linkProgram || 0 },
        T: Object.entries(f.T).filter(([k, v]) => v > 8).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + Math.round(v)).join(' '), sub: Object.entries(G._sub).filter(([k, v]) => v > 3).map(([k, v]) => k + '=' + Math.round(v)).join(' '), loaded: R.stats.loaded, loads: R.stats.loads }; };
    window.__one = one; return 0; })()`);
  const r = []; const rec = async (lbl, i) => { const f = await p.evaluate(`__one(${JSON.stringify(lbl)}, ${i})`); r.push(f); if (f.ms > 120 || f.i < 2) console.log(TAG, JSON.stringify(f)); };
  for (let i = 0; i < 3; i++) await rec('warm', i);
  for (const [x, z] of [[-300, 200], [600, -400], [-150, -350]]) { await p.evaluate(`__G.game.tp(${x}, ${z}, 0)`); for (let i = 0; i < NF; i++) await rec(x + ',' + z, i); }
  fs.mkdirSync(path.join(root, 'shots/pd5'), { recursive: true }); fs.writeFileSync(path.join(root, 'shots/pd5/tpr_' + TAG + '.json'), JSON.stringify(r, null, 0).replace(/},{/g, '},\n{'));
  console.log('PAGEERROR', perr); await b.close(); process.exit(0);
});
