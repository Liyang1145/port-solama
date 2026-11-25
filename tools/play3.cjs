// anim3 playtest: scripted "human" session with a streaming screenshot sequence (canvas + HTML HUD via page.screenshot).
// The game runs under ?snap (no rAF loop): every logic frame is stepped at dt = 1/30 s; all player input is real keyboard / mouse
// events (pointer lock shimmed); a few clearly labelled debug moves (tp next to the parked car, crime() for a wanted level,
// setHour for night). A shot every EVERY logic frames (default 10 = 0.33 s game time), plus per frame: logic ms, render ms for
// shot frames, long frames, anomaly checks, console errors / PAGEERROR. Output: <out>/f_<nnnn>.jpg + frames.jsonl + summary.json.
// usage: node tools/play3.cjs <gta|cyber> <outdir>   env: VW VH (480x270), Q (extra query), DIST (dist), EVERY, SINGLE=1, ONLY=seg,seg
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'gta'; const out = path.resolve(process.argv[3] || 'shots/play3/' + MAPN);
fs.mkdirSync(out, { recursive: true }); const W = +(process.env.VW || 480), H = +(process.env.VH || 270), EVERY = +(process.env.EVERY || 10);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const T0 = Date.now(); const log = (...a) => { const l = ((Date.now() - T0) / 1000).toFixed(0) + 's ' + a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(l); fs.appendFileSync(path.join(out, 'run.log'), l + '\n'); };
// segments: [name, {keys: held codes, n: logic frames, mx: mouse dx / frame, my, ldown: left button held, rdown, js: debug js at start (labelled), tap: [codes] pressed once at start}]
const SEG = [
  ['spawn_idle', { n: 45 }],
  ['spawn_look', { n: 60, mx: 9 }],
  ['walk', { keys: ['KeyW'], n: 75 }],
  ['run_cross_street', { keys: ['KeyW', 'ShiftLeft'], n: 105, mx: -2 }],
  ['to_car', { js: 'const v = g.parked || g.nearestCar(); const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw); g.tp(v.x + lx * 3.2, v.z + lz * 3.2, v.yaw + Math.PI / 2); g.cam.yaw = v.yaw + Math.PI / 2 + Math.PI;', n: 15 }],
  ['enter_car', { tap: ['KeyF'], n: 105 }],
  ['drive', { keys: ['KeyW'], n: 120 }],
  ['drive_left', { keys: ['KeyW', 'KeyA'], n: 40 }],
  ['drive_right', { keys: ['KeyW', 'KeyD'], n: 40 }],
  ['handbrake_turn', { keys: ['KeyW', 'KeyA', 'Space'], n: 40 }],
  ['drive_crash', { keys: ['KeyW'], n: 150 }],
  ['reverse', { keys: ['KeyS'], n: 45 }],
  ['exit_car', { tap: ['KeyF'], n: 75 }],
  ['pistol_aim_fire', { tap: ['Digit3'], rdown: true, n: 75, clickEvery: 12, mx: 3 }],
  ['melee_combo', { tap: ['Digit1'], n: 60, clickEvery: 9 }],
  ['wanted_flee', { js: 'g.crime(3, "playtest");', keys: ['KeyW', 'ShiftLeft'], n: 165, mx: 4 }],
  ['night', { js: '__G.setHour(21.5);', keys: ['KeyW'], n: 75, mx: -5 }],
  ['ui_bigmap', { tap: ['KeyM'], n: 24 }],
  ['ui_bigmap_off', { tap: ['KeyM'], n: 9 }],
  ['ui_phone', { tap: ['KeyI'], n: 30 }],
  ['ui_phone_nav', { tap: ['ArrowDown'], n: 15 }],
  ['ui_phone_close', { tap: ['Escape'], n: 9 }],
  ['ui_wheel', { keys: ['KeyQ'], n: 24, mx: 6 }],
  ['ui_tab', { keys: ['Tab'], n: 15 }],
  ['ui_interact', { tap: ['KeyE'], n: 24 }],
  ['ui_interact_close', { tap: ['Escape'], n: 9 }],
];
const HELP = `(() => { const G = __G, g = G.game; window.__ERRS = window.__ERRS || []; window.__AN = []; let last = {};
  const an = (k, x) => { const P = g.P; if (last[k] && G.U.uTime.value - last[k] < 1.5) return; last[k] = G.U.uTime.value; window.__AN.push({ k, t: +G.U.uTime.value.toFixed(1), pos: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], car: !!P.car, ...x }); };
  window.__chk = () => { const P = g.P, cam = G.camera.position; if (![P.pos.x, P.pos.y, P.pos.z, cam.x, cam.y, cam.z].every(Number.isFinite)) an('NaN');
    if (!P.car && !g.deadT) { const gh = g.city.groundH(P.pos.x, P.pos.z); if (gh > -1.25 && P.grounded && P.pos.y - gh > 0.6) an('float'); if (gh > -1.25 && P.pos.y < gh - 0.35) an('sunk'); }
    const cgh = g.city.groundH(cam.x, cam.z); if (cgh > -1.25 && cam.y < cgh + 0.05) an('camera-below-ground', { cy: +cam.y.toFixed(2), gh: +cgh.toFixed(2) });
    try { const t = g.cam.look; if (t && g.cam.mode !== 1) { const r = g.city.col.resolve(cam.x, cam.z, 0.05, cam.y); if (Math.hypot(r.x - cam.x, r.z - cam.z) > 0.04) an('camera-in-collider', { cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)] }); } } catch (e) {} };
  window.__st = () => { const P = g.P, v = P.car; const hud = document.getElementById('hud'); return { pos: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], car: v ? { sp: +(Math.abs(v.speed) * 3.6).toFixed(0), y: +v.y.toFixed(2) } : null, wanted: g.wanted, hp: Math.round(P.health), hour: +G.hour.toFixed(2), weapon: g.arsenal && g.arsenal.cur, phone: !!g.world.phoneOpen, menu: !!g.world.menu, hud: hud ? hud.innerText.replace(/\\s+/g, ' ').slice(0, 160) : '', calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles }; };
})()`;
srv.listen(0, async () => {
  const SINGLE = process.env.SINGLE ? ['--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] : [];
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=' + (process.env.JSH || 1200), '--disable-dev-shm-usage', '--renderer-process-limit=1', ...SINGLE] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(600000);
  let perr = 0, cerr = 0; const errs = [];
  p.on('pageerror', (e) => { perr++; errs.push('PAGEERROR ' + e.message.slice(0, 300)); log('PAGEERROR', e.message.slice(0, 300)); });
  p.on('console', (m) => { if (m.type() === 'error') { cerr++; errs.push('CONSOLE-ERR ' + m.text().slice(0, 200)); log('CONSOLE-ERR', m.text().slice(0, 200)); } else if (m.type() === 'warning' && /\[ual\]|NaN|undefined/i.test(m.text())) log('WARN', m.text().slice(0, 200)); });
  p.on('crash', () => log('PAGECRASH'));
  const url = `http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${MAPN}&hour=13&${process.env.Q || ''}`; log('goto', url);
  await p.goto(url); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 }); log('ready');
  await p.evaluate(`void (() => { const c = __G.renderer.domElement; Object.defineProperty(document, 'pointerLockElement', { get: () => c, configurable: true }); __G.rb = 1; })()`);
  await p.evaluate(HELP); await p.mouse.move(W / 2, H / 2);
  const fj = path.join(out, 'frames.jsonl'); fs.writeFileSync(fj, '');
  let fno = 0, shot = 0, mxp = W / 2; const segSum = []; const only = (process.env.ONLY || '').split(',').filter(Boolean);
  for (const [name, S] of SEG) {
    if (only.length && !only.includes(name)) continue;
    const s0 = { name, f0: fno, shot0: shot, logic: [], render: [] };
    if (S.js) { log('DEBUG', name, S.js); await p.evaluate(`void (() => { const G = __G, g = G.game; ${S.js} })()`); }
    for (const k of S.tap || []) await p.keyboard.press(k);
    for (const k of S.keys || []) await p.keyboard.down(k);
    if (S.rdown) await p.mouse.down({ button: 'right' });
    for (let i = 0; i < S.n; i++) {
      if (S.mx || S.my) { mxp += S.mx || 0; if (mxp > W - 5 || mxp < 5) { mxp = W / 2; await p.evaluate('void 0'); } await p.mouse.move(mxp, H / 2 + (S.my || 0)); }
      if (S.clickEvery && i % S.clickEvery === 0) { await p.mouse.down({ button: 'left' }); }
      if (S.clickEvery && i % S.clickEvery === 2) { await p.mouse.up({ button: 'left' }); }
      const doShot = (fno % EVERY) === 0;
      const r = await p.evaluate(`(() => { const G = __G; const t0 = performance.now(); G.step(1, 1 / 30); const lg = performance.now() - t0; __chk(); let rd = 0;
        if (${doShot}) { const t1 = performance.now(); G.render(); G.renderer.getContext().finish(); rd = performance.now() - t1; }
        return { lg: +lg.toFixed(1), rd: +rd.toFixed(1), st: ${doShot} ? __st() : null }; })()`);
      s0.logic.push(r.lg); if (doShot) {
        const fn = `f_${String(shot).padStart(4, '0')}.jpg`; await p.screenshot({ path: path.join(out, fn), type: 'jpeg', quality: 60 }); s0.render.push(r.rd);
        fs.appendFileSync(fj, JSON.stringify({ shot, f: fno, seg: name, i, lg: r.lg, rd: r.rd, ...r.st }) + '\n'); shot++;
      } else if (r.lg > 50) fs.appendFileSync(fj, JSON.stringify({ long: true, f: fno, seg: name, i, lg: r.lg }) + '\n');
      fno++;
    }
    for (const k of S.keys || []) await p.keyboard.up(k);
    if (S.rdown) await p.mouse.up({ button: 'right' }); if (S.clickEvery) await p.mouse.up({ button: 'left' });
    const q = (a, x) => { if (!a.length) return 0; const c = [...a].sort((u, v) => u - v); return c[Math.min(c.length - 1, Math.floor(c.length * x))]; };
    const an = await p.evaluate('window.__AN.splice(0)');
    const sum = { name, frames: S.n, shots: `${s0.shot0}-${shot - 1}`, logicP50: q(s0.logic, 0.5), logicP95: q(s0.logic, 0.95), logicMax: Math.max(...s0.logic), long50: s0.logic.filter((x) => x > 50).length, renderP50: q(s0.render, 0.5), renderMax: s0.render.length ? Math.max(...s0.render) : 0, an };
    segSum.push(sum); log('SEG', JSON.stringify(sum).slice(0, 600));
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ map: MAPN, url, frames: fno, shots: shot, perr, cerr, errs: errs.slice(0, 50), segs: segSum }, null, 1));
  log('DONE frames', fno, 'shots', shot, 'PAGEERRORS', perr, 'CONSOLE-ERR', cerr);
  await b.close(); srv.close(); process.exit(0);
});
