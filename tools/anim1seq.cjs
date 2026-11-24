// anim1: frame sequences of the player for new / old (side camera at the hips, 1/60 s steps), shots/anim1/<variant>_<scene>_<i>.jpg
// env V="new=;old=oldanimrig&oldgait" SC="start,stop,turn,circle,kerb,sprint,idle" (default all), VW/VH, SINGLE=1
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..'); const out = path.join(root, 'shots/anim1'); fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const V = (process.env.V || 'new=;old=oldanimrig&oldgait').split(';').map((s) => s.split('=')).map(([k, ...v]) => [k, v.join('=')]);
const W = +(process.env.VW || 480), H = +(process.env.VH || 300);
// scene: setup, then segments [input, steps, captureEvery]; camera: side (perpendicular to the start heading) at dist, or 'follow'
const I = { idle: '{mx:0,mz:0}', fw: '{mx:0,mz:1}', back: '{mx:0,mz:-1}', spr: '{mx:0,mz:1,sprint:true}', circ: '{mx:1,mz:1}' };
const SCN = {
  start: { tp: [280.5, 36, Math.PI], seg: [['idle', 20, 0], ['fw', 36, 6]], cam: 3.4 },
  stop: { tp: [280.5, 36, Math.PI], seg: [['fw', 70, 0], ['idle', 42, 6]], cam: 3.4, follow: true },
  turn: { tp: [280.5, 36, Math.PI], seg: [['idle', 20, 0], ['back', 30, 5]], cam: 3.0 },
  circle: { tp: [280.5, 36, Math.PI], seg: [['circ', 90, 0], ['circ', 36, 6]], cam: 4.0, follow: true },
  kerb: { tp: [152, -9.6, 0], seg: [['idle', 20, 0], ['fw', 42, 6]], cam: 3.0, side: true },
  sprint: { tp: [280.5, 36, Math.PI], seg: [['spr', 80, 0], ['spr', 24, 4]], cam: 4.0, follow: true },
  idle: { tp: [280.5, 36, Math.PI], seg: [['idle', 60, 0], ['idle', 120, 30]], cam: 2.6 },
};
const list = (process.env.SC || Object.keys(SCN).join(',')).split(',');
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=' + (process.env.JSH || 1000), '--disable-dev-shm-usage', '--renderer-process-limit=1', ...(process.env.SINGLE ? ['--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] : [])] });
  let perr = 0;
  for (const [vn, q] of V) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(1100000);
    p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', vn, e.message.slice(0, 300)); });
    const T0 = Date.now(); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=gta&hour=13&nomb&${q}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 }); console.log(vn, 'ready s', (Date.now() - T0) / 1000 | 0);
    for (const sc of list) {
      const S = SCN[sc]; await p.evaluate(`void (() => { const G = __G, g = G.game; g.override = null; if (g.P.car) g.toggleCar(); G.setHour(13); g.tp(${S.tp.join(',')}); G.step(40, 1/60); window.__CAMY = g.P.yaw; })()`);
      let n = 0;
      for (const [inp, steps, every] of S.seg) {
        for (let i = 0; i < steps; i++) {
          await p.evaluate(`void (() => { const G = __G, g = G.game; g.override = ${I[inp]}; G.step(1, 1/60); })()`);
          if (every && (i + 1) % every === 0) {
            const info = await p.evaluate(`(() => { const G = __G, g = G.game, c = g.player, cam = G.camera; const y = ${S.follow ? 'g.P.yaw' : 'window.__CAMY'};
              const s = ${S.side ? 'Math.PI / 2' : '1.15'}; const a = y + s; const d = ${S.cam};
              cam.position.set(c.pos.x + Math.sin(a) * d, c.pos.y + 0.95, c.pos.z + Math.cos(a) * d); cam.lookAt(c.pos.x, c.pos.y + 0.8, c.pos.z); cam.updateMatrixWorld(); const keep = g.updateCamera; g.updateCamera = () => {};
              G.sprobe.t = 99; G.render(); G.render(); g.updateCamera = keep;
              const gl = G.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__PX = px; return { w, h, sp: +c.speed.toFixed(2) }; })()`);
            const nn = info.w * info.h * 4, CH = 1 << 20; const buf = Buffer.alloc(nn);
            for (let o = 0; o < nn; o += CH) { const s = await p.evaluate(`(() => { const a = __PX.subarray(${o}, ${Math.min(nn, o + CH)}); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); })()`); Buffer.from(s, 'base64').copy(buf, o); }
            const raw = path.join(out, `${vn}_${sc}_${n}.rgba`); fs.writeFileSync(raw, buf); execSync(`python3 /workspace/work/patches/playtest/rgba2jpg.py ${raw} ${info.w} ${info.h} ${path.join(out, `${vn}_${sc}_${n}.jpg`)}`); n++; console.log(vn, sc, n, ((Date.now() - T0) / 1000 | 0) + 's');
          }
        }
      }
      console.log(vn, sc, 'frames', n);
    }
    await ctx.close();
  }
  console.log('PAGEERRORS', perr); await b.close(); srv.close(); process.exit(0);
});
