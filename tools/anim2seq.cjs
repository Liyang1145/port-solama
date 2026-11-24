// anim2: frame sequences (new / old) for crouch, melee combo, stagger, jump, car in / out; shots/anim2/<variant>_<scene>_<i>.jpg
// env V="new=;old=olduanim" SC="crouch,melee,stagger,jump,carin,carout,sprint" VW/VH; each scene: tp + segments of [setup js, input, steps, every]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..'); const out = path.join(root, 'shots/anim2'); fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const V = (process.env.V || 'new=;old=olduanim').split(';').map((s) => s.split('=')).map(([k, ...v]) => [k, v.join('=')]);
const W = +(process.env.VW || 400), H = +(process.env.VH || 300);
const T0 = '{mx:0,mz:0}';
// tgt: JS expression for the character the camera frames (default the player); ang: camera angle from the character's heading
const SCN = {
  crouch: { tp: [280.5, 36, Math.PI], cam: 3.0, ang: 1.4, seg: [['', '{mx:0,mz:0,crouch:false}', 10, 0], ['', '{mx:0,mz:0,crouch:true}', 36, 12], ['', '{mx:0,mz:1,crouch:true}', 60, 10]] },
  melee: { tp: [280.5, 36, Math.PI], cam: 3.0, ang: 1.25, seg: [['g.arsenal.equip("fist"); g.P.crouchOn = false;', T0, 20, 0], ...[0, 1, 2, 3].flatMap(() => [['', '{mx:0,mz:0,fire:"edge"}', 1, 0], ['', T0, 30, 6]])] },
  stagger: { tp: [280.5, 36, Math.PI], cam: 3.0, ang: 1.3, tgt: 'window.__N', seg: [[`const C = g.player.constructor; const n = window.__N = new C(g.scene, 'man', { proto: 'm2' }); n.pos.set(g.P.pos.x, g.P.pos.y, g.P.pos.z - 2.5); n.yaw = 0; n.ai = { mode: 'cower', t: -99 }; g.peds.list.push(n); g.tp(g.P.pos.x + 3, g.P.pos.z, Math.PI);`, T0, 30, 0],
    [`const n = window.__N; n._hitHead = false; n.health -= 25; g.hitReact(n, new (g.player.pos.constructor)(0, 0, -1), 0.3);`, T0, 36, 4]] },
  jump: { tp: [280.5, 36, Math.PI], cam: 3.4, ang: 1.45, seg: [['', T0, 20, 0], ['', '{mx:0,mz:0,jump:true}', 1, 0], ['', T0, 56, 4]] },
  carin: { tp: [280.5, 36, Math.PI], cam: 4.2, ang: 2.2, seg: [['const v = g.parked; const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw); g.tp(v.x + lx * 1.8 - Math.sin(v.yaw) * 0.6, v.z + lz * 1.8 - Math.cos(v.yaw) * 0.6, v.yaw + Math.PI / 2);', T0, 30, 0], ['g.toggleCar();', T0, 60, 5]] },
  carout: { tp: [280.5, 36, Math.PI], cam: 4.2, ang: 2.2, seg: [['const v = g.parked; g.tp(v.x + Math.cos(v.yaw) * 1.8, v.z - Math.sin(v.yaw) * 1.8, v.yaw); g.toggleCar();', T0, 70, 0], ['g.toggleCar();', T0, 60, 5]] },
  sprint: { tp: [280.5, 36, Math.PI], cam: 4.5, ang: 2.0, follow: true, seg: [['', '{mx:0,mz:1,sprint:true}', 80, 0], ['', '{mx:0,mz:1,sprint:true}', 24, 4]] },
};
const list = (process.env.SC || 'crouch,melee,stagger,jump').split(',');
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=' + (process.env.JSH || 1000), '--disable-dev-shm-usage', '--renderer-process-limit=1'] });
  let perr = 0;
  for (const [vn, q] of V) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(1100000);
    p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', vn, e.message.slice(0, 300)); }); p.on('crash', () => console.log('PAGECRASH', vn));
    p.on('console', (m) => { if (/\[ual\]|Error/.test(m.text())) console.log('console', vn, m.text().slice(0, 300)); });
    const t0 = Date.now(); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=gta&hour=13&nomb&${q}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 }); console.log(vn, 'ready s', (Date.now() - t0) / 1000 | 0);
    for (const sc of list) {
      const S = SCN[sc]; await p.evaluate(`void (() => { const G = __G, g = G.game; g.override = null; if (g.P.car) g.toggleCar(); g.P.crouchOn = false; G.setHour(13); g.tp(${S.tp.join(',')}); G.step(40, 1/60); window.__CAMY = g.P.yaw; })()`);
      let n = 0; const meta = [];
      for (const [js, inp, steps, every] of S.seg) {
        if (js) await p.evaluate(`void (() => { const G = __G, g = G.game; ${js} window.__CAMY = (${S.tgt || 'g.player'}).yaw; })()`);
        for (let i = 0; i < steps; i++) {
          await p.evaluate(`void (() => { const G = __G, g = G.game; g.override = ${inp}; G.step(1, 1/60); })()`);
          if (every && (i + 1) % every === 0) {
            const info = await p.evaluate(`(() => { const G = __G, g = G.game, c = ${S.tgt || 'g.player'}, cam = G.camera; const y = ${S.follow ? 'c.yaw' : 'window.__CAMY'};
              const a = y + ${S.ang}; const d = ${S.cam}; const hp = c.root.position;
              cam.position.set(hp.x + Math.sin(a) * d, hp.y + 1.0, hp.z + Math.cos(a) * d); cam.lookAt(hp.x, hp.y + 0.75, hp.z); cam.updateMatrixWorld(); const keep = g.updateCamera; g.updateCamera = () => {};
              G.sprobe.t = 99; G.render(); G.render(); g.updateCamera = keep;
              const gl = G.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__PX = px;
              return { w, h, sp: +c.speed.toFixed(2), cr: +(c.crW || 0).toFixed(2), ov: +(c.ovF || 0).toFixed(2), os: (c.os || []).map((e) => e.key + ':' + e.env.toFixed(2)).join(','), y: +(c.pos.y).toFixed(2), seat: !!c._seat }; })()`);
            const nn = info.w * info.h * 4, CH = 1 << 20; const buf = Buffer.alloc(nn);
            for (let o = 0; o < nn; o += CH) { const s = await p.evaluate(`(() => { const a = __PX.subarray(${o}, ${Math.min(nn, o + CH)}); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); })()`); Buffer.from(s, 'base64').copy(buf, o); }
            const raw = path.join(out, `${vn}_${sc}_${n}.rgba`); fs.writeFileSync(raw, buf); execSync(`python3 /workspace/work/patches/playtest/rgba2jpg.py ${raw} ${info.w} ${info.h} ${path.join(out, `${vn}_${sc}_${n}.jpg`)}`); n++; delete info.w; delete info.h; meta.push(info);
          }
        }
      }
      console.log(vn, sc, 'frames', n, JSON.stringify(meta));
    }
    await ctx.close();
  }
  console.log('PAGEERRORS', perr); await b.close(); srv.close(); process.exit(0);
});
