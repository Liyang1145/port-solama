// anim3 (copy of anim2seq + OUT env + vault scenes / metrics): frame sequences (new / old) for crouch, melee combo, stagger, jump, car in / out; shots/anim2/<variant>_<scene>_<i>.jpg
// env V="new=;old=olduanim" SC="crouch,melee,stagger,jump,carin,carout,sprint" VW/VH; each scene: tp + segments of [setup js, input, steps, every]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..'); const out = path.join(root, process.env.OUT || 'shots/anim3'); fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const V = (process.env.V || 'new=;old=olduanim').split(';').map((s) => s.split('=')).map(([k, ...v]) => [k, v.join('=')]);
const W = +(process.env.VW || 400), H = +(process.env.VH || 300);
const T0 = '{mx:0,mz:0,throttle:0,steer:0}';
// tgt: JS expression for the character the camera frames (default the player); ang: camera angle from the character's heading
const SCN = {
  // vault scenes: approach 2.6 m from the obstacle (finder: tools/anim3_vfind.js), run, jump at ~1 m; side camera
  vbar: { tp: [274.43, 46.7, Math.PI / 2], cam: 4.2, ang: -1.57, seg: [['', '{mx:0,mz:1}', 22, 0], ['', '{mx:0,mz:1,jump:true}', 1, 1], ['', '{mx:0,mz:1}', 40, 3], ['', T0, 20, 10]] },
  vbench: { tp: [297.7, 24, Math.PI / 2], cam: 4.2, ang: -1.57, seg: [['', '{mx:0,mz:1}', 22, 0], ['', '{mx:0,mz:1,jump:true}', 1, 1], ['', '{mx:0,mz:1}', 40, 3], ['', T0, 20, 10]] },
  vcar: { tp: [279.6, 20.38, Math.PI / 2], cam: 5.0, ang: -1.0, seg: [['', '{mx:0,mz:1}', 24, 0], ['', '{mx:0,mz:1,jump:true}', 1, 1], ['', '{mx:0,mz:1}', 46, 3], ['', T0, 20, 10]] },
  vsprint: { tp: [295.2, 24, Math.PI / 2], cam: 4.4, ang: -1.57, seg: [['', '{mx:0,mz:1,sprint:true}', 26, 0], ['', '{mx:0,mz:1,sprint:true}', 48, 3]] },
  // anim2 leftovers: sprint on an open stretch (promenade along z), knocked-down NPC hit again
  sprint: { tp: [280.5, 36, 0], cam: 4.5, ang: 2.0, follow: true, seg: [['', '{mx:0,mz:1,sprint:true}', 80, 0], ['', '{mx:0,mz:1,sprint:true}', 24, 4]] },
  reknock: { tp: [280.5, 36, Math.PI], cam: 3.4, ang: 1.5, tgt: 'window.__N', seg: [[`const C = g.player.constructor; const n = window.__N = new C(g.scene, 'man', { proto: 'm2' }); n.pos.set(g.P.pos.x, g.P.pos.y, g.P.pos.z - 1.6); n.yaw = 0; n.ai = { mode: 'cower', t: -99 }; g.peds.list.push(n); g.arsenal.L.owned.bat = { clip: 0, reserve: 0 }; g.arsenal.equip('bat'); g.arsenal.fireT = 0;`, T0, 30, 0],
    ['', '{mx:0,mz:0,throttle:0,steer:0,fire:"edge"}', 1, 0], ['', T0, 30, 10], ['const n = window.__N; n._hitHead = false; n.health -= 10; n._heavy = false; g.hitReact(n, new (g.player.pos.constructor)(0, 0, -1), 0.3);', T0, 36, 6]] },
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
              cam.position.set(hp.x + Math.sin(a) * d, hp.y + 1.0, hp.z + Math.cos(a) * d); cam.lookAt(hp.x, hp.y + 0.75, hp.z);
              if (${!!0} || ${'"carcam"'} === ${JSON.stringify(S.carcam ? 'carcam' : '')}) { const v = g.parked; const sp = v.seatWorld('driver').pos; const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
                cam.position.set(sp.x + lx * 3.0 + fx * 1.6, sp.y + 1.1, sp.z + lz * 3.0 + fz * 1.6); cam.lookAt(sp.x + lx * 0.6, sp.y + 0.35, sp.z + lz * 0.6); } cam.updateMatrixWorld(); const keep = g.updateCamera; g.updateCamera = () => {};
              G.sprobe.t = 99; G.render(); G.render(); g.updateCamera = keep;
              const gl = G.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__PX = px;
              const V = g.P.vault, lowJ = Math.min(...['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((n) => { const o = c.model.getObjectByName(n); return o ? o.getWorldPosition(new (c.pos.constructor)()).y : 1e9; }));
              const hd = c.handT && c.handT.w > 0.5 ? Math.max(...['Left', 'Right'].map((s) => c.model.getObjectByName(s + 'Hand').getWorldPosition(new (c.pos.constructor)()).distanceTo(c.handT[s[0]]))) : null;
              const vi = V ? { u: +(V.t / V.dur).toFixed(2), s: +Math.hypot(g.P.pos.x - V.plan.sx, g.P.pos.z - V.plan.sz).toFixed(2), tin: +V.plan.tin.toFixed(2), tout: +V.plan.tout.toFixed(2), top: +(V.plan.y0 + V.plan.H).toFixed(2), lowJ: +lowJ.toFixed(2), hand: hd === null ? null : +hd.toFixed(3) } : null;
              return { w, h, vi, vst: window.__VAULT_ST ? window.__VAULT_ST.last : null, sp: +c.speed.toFixed(2), cr: +(c.crW || 0).toFixed(2), ov: +(c.ovF || 0).toFixed(2), os: (c.os || []).map((e) => e.key + ':' + e.env.toFixed(2)).join(','), y: +(c.pos.y).toFixed(2), seat: !!c._seat }; })()`);
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
