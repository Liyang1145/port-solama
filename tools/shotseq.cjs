// fix_pt4 shotseq: like shotcmp but SEQ='name|js;;name|js' runs on the same page in order (scene setup / debug switches); writes shots/fp4/<variant>_<map>_<name>.jpg
// fix_pt2 (copy of patches/playtest/shotS.cjs, serves dist/, writes shots/fp2/<variant>_<map>_<scene>.jpg): background screenshot batch (no self-timeout; run via tools/bg.sh). One browser, one page per variant, several scenes per page.
// gl.readPixels of the final frame -> shots/pd5/S/<variant>_<scene>.rgba + .json. usage: node tools/shot5.cjs   env V="new=;old=oldsprobe&oldrefl" SC="spawn,drive,night,water"
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const out = path.join(root, 'shots/fp4/raw'); fs.mkdirSync(out, { recursive: true }); const MAPN = process.env.MAP || 'gta'; const { execSync } = require('child_process');
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const V = (process.env.V || 'new=lowshadow').split(';').map((s) => s.split('=')).map(([k, ...v]) => [k, v.join('=')]);
const SCN = (process.env.SEQ || 'x61|').split('@@').map((t) => { const i = t.indexOf('|'); return [t.slice(0, i), t.slice(i + 1)]; });
const W = +(process.env.VW || 800), H = +(process.env.VH || 450);
const SET = {
  spawn: "G.setHour(" + (MAPN === 'cyber' ? 21.6 : 18.3) + "); g.tp(280.5,36,Math.PI); G.step(8);",
  drive: "G.setHour(15.5); g.tp(283.5,26,Math.PI); G.step(2); { const c=g.nearestCar(); if(c){ g.tp(c.x+2,c.z,0); G.step(2); g.toggleCar(); G.step(3); g.override={throttle:0.7,steer:0}; G.step(60); g.override={throttle:0.25,steer:0}; G.step(4);} }",
  night: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(22.5); g.tp(281,14,Math.PI); G.step(8);",
  water: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(17.2); g.tp(-330,-30,-Math.PI/2); G.step(8);",
  marina: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(16); g.tp(-300,200,1.2); G.step(10);",
  west: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(12); g.tp(-1080,-50,0.5); G.step(10);",
  dock: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(" + (MAPN === 'cyber' ? 23 : 14) + "); g.tp(12,330,2.5); G.step(10);",
  wheel: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(20.5); g.tp(384,340,-2.2); G.step(10);",
  precinct: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(13); g.tp(172,88,Math.PI/2); G.step(10);",
  lot143: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(13); g.tp(182,136,0.6); G.step(10);",
  tp384: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(13); g.tp(384,340,-2.2); G.step(10);",
  camwall: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(" + (MAPN === 'cyber' ? 22 : 13) + "); g.tp(140.8,-336.5,1.6); G.step(10);",
  x61: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(12); g.tp(61.1,200,0); G.step(10);",
  rob: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(" + (MAPN === 'cyber' ? 22 : 15) + "); g.tp(66,50,-Math.PI/2); G.step(10);",
  alley: "g.override=null; if(g.P.car) g.toggleCar(); G.setHour(" + (MAPN === 'cyber' ? 0.5 : 10) + "); g.tp(175,160,Math.PI/2); G.step(10);",
};

srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=' + (process.env.JSH || 1000) + ' --max-semi-space-size=2 --optimize-for-size', '--disable-dev-shm-usage', '--renderer-process-limit=1', ...(process.env.SINGLE ? ['--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] : [])] });
  let perr = 0;
  for (const [vn, q] of V) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(1100000);
    p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', vn, e.message.slice(0, 200)); }); p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR', m.text().slice(0, 200)); });
    const T0 = Date.now(); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${MAPN}&hour=${process.env.HOUR || 15}&${q}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 }); console.log(vn, 'ready s', (Date.now() - T0) / 1000 | 0);
    for (const [sc, js] of SCN) {
      const t = Date.now();
      await p.evaluate(`(() => { const G = __G, g = G.game; ${SET[sc.split('_')[0]] || ''} ${js}; G.sprobe.t = 99; if (G.sprobe.spn) G.sprobe.spn.every = 1; return 0; })()`);
      for (let i = 0; i < +(process.env.NR || 10); i++) await p.evaluate('__G.render()');
      const info = await p.evaluate(`(() => { const G = __G; const gl = G.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__PX = px; const st = G.stats(); return { w, h, cam: G.camera.position.toArray().map((v) => +v.toFixed(1)), calls: st.calls, tris: st.tris, heap: Math.round(performance.memory.usedJSHeapSize / 1048576) }; })()`);
      const n = info.w * info.h * 4, CH = 1 << 20; const buf = Buffer.alloc(n);
      for (let o = 0; o < n; o += CH) { const s = await p.evaluate(`(() => { const a = __PX.subarray(${o}, ${Math.min(n, o + CH)}); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); })()`); Buffer.from(s, 'base64').copy(buf, o); }
      const raw = path.join(out, vn + '_' + MAPN + '_' + sc + '.rgba'); fs.writeFileSync(raw, buf); fs.writeFileSync(path.join(out, vn + '_' + MAPN + '_' + sc + '.json'), JSON.stringify({ ...info, st: await p.evaluate('__G.game.state()'), hour: await p.evaluate('__G.hour') })); execSync(`python3 /workspace/work/patches/playtest/rgba2jpg.py ${raw} ${info.w} ${info.h} ${path.join(root, 'shots/fp4', vn + '_' + MAPN + '_' + sc + '.jpg')}`);
      console.log(vn, sc, JSON.stringify(info), ((Date.now() - t) / 1000 | 0) + 's');
    }
    await ctx.close();
  }
  console.log('PAGEERRORS', perr); await b.close(); srv.close(); process.exit(0);
});
