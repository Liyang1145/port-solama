// anim1: foot-sliding / penetration / rig cost probe. node tools/anim1probe.cjs   env V="new=;old=oldanimrig&oldgait" MODE=explore|measure|perf
// measure: scripted player moves (override input) at fixed 1/60 s steps; per step the soles vs city.groundH:
//   slide  = horizontal travel (cm) of a planted foot (sole within 3 cm of its ground, both frames) per contact
//   pen    = ground above the sole (cm, penetration), hover = lower foot's sole above its ground while grounded (cm)
// writes shots/anim1/probe_<variant>.json
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const out = path.join(root, process.env.OUT || 'shots/anim1'); fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const V = (process.env.V || 'new=;old=oldanimrig&oldgait').split(';').map((s) => s.split('=')).map(([k, ...v]) => [k, v.join('=')]);
const MODE = process.env.MODE || 'measure';
const LIB = `
window.__AP = (() => {
  const G = __G, g = G.game, C = g.player; const gh = (x, z) => g.city.groundH(x, z);
  const S = { L: null, R: null };
  function foot(c, side) { const B = c.model; const f = B.getObjectByName(side + 'Foot'), t = B.getObjectByName(side + 'ToeBase'); c.root.updateMatrixWorld(true);
    const A = f.getWorldPosition(new G.THREE.Vector3()), T = t.getWorldPosition(new G.THREE.Vector3()); const k = c.P.scale * c.root.scale.x, ank = (c.P.cal.__ank || 0.085) * k, toe = (c.P.cal.__toe || 0.05) * k;
    const sole = Math.min(A.y - ank, T.y - toe); const gy = Math.max(gh(A.x, A.z), gh(T.x, T.z)); return { x: (A.x + T.x) / 2, z: (A.z + T.z) / 2, sole, gy }; }
  function run(name, steps, input) {
    const r = { name, n: 0, slide: 0, contacts: 0, plantedT: 0, pen: 0, penMax: 0, hov: 0, hovMax: 0, track: [] }; let prev = { L: null, R: null };
    for (let i = 0; i < steps; i++) { g.override = input(i); G.step(1, 1 / 60);
      if (!g.P.grounded) { prev = { L: null, R: null }; continue; }
      const F = { L: foot(C, 'Left'), R: foot(C, 'Right') }; r.n++;
      for (const s of ['L', 'R']) { const f = F[s], p = prev[s]; const pl = f.sole - f.gy < 0.03;
        if (pl && p && p.pl) { r.slide += Math.hypot(f.x - p.x, f.z - p.z); r.plantedT += 1 / 60; } else if (pl) r.contacts++;
        const pen = Math.max(0, f.gy - f.sole); r.pen += pen; r.penMax = Math.max(r.penMax, pen); f.pl = pl; prev[s] = f; }
      const lo = F.L.sole - F.L.gy < F.R.sole - F.R.gy ? F.L : F.R; const hv = Math.max(0, lo.sole - lo.gy); r.hov += hv; r.hovMax = Math.max(r.hovMax, hv);
      if (i % 6 === 0) r.track.push([+C.pos.x.toFixed(2), +C.pos.z.toFixed(2), +C.speed.toFixed(2), +(F.L.sole - F.L.gy).toFixed(3), +(F.R.sole - F.R.gy).toFixed(3)]);
    }
    g.override = null;
    return { name, frames: r.n, slideCmPerContact: +(r.slide * 100 / Math.max(1, r.contacts)).toFixed(2), slideCmPerS: +(r.slide * 100 / Math.max(0.01, r.plantedT)).toFixed(2), contacts: r.contacts,
      penMeanCm: +(r.pen * 100 / Math.max(1, 2 * r.n)).toFixed(2), penMaxCm: +(r.penMax * 100).toFixed(1), hoverMeanCm: +(r.hov * 100 / Math.max(1, r.n)).toFixed(2), hoverMaxCm: +(r.hovMax * 100).toFixed(1), track: r.track };
  }
  return { foot, run, gh };
})();`;
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=' + (process.env.JSH || 1000), '--disable-dev-shm-usage', '--renderer-process-limit=1', ...(process.env.SINGLE ? ['--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] : [])] });
  let perr = 0;
  for (const [vn, q] of V) {
    const ctx = await b.newContext({ viewport: { width: +(process.env.VW || 480), height: +(process.env.VH || 270) }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(1100000);
    p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', vn, e.message.slice(0, 300)); }); p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR', m.text().slice(0, 200)); });
    const T0 = Date.now(); await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${process.env.MAP || 'gta'}&hour=13&${q}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 }); console.log(vn, 'ready s', (Date.now() - T0) / 1000 | 0);
    await p.evaluate('void (window.__G.THREE = window.__G.THREE || (window.THREE))');
    const hasT = await p.evaluate('!!(__G.THREE && __G.THREE.Vector3)'); if (!hasT) await p.evaluate(`void (__G.THREE = { Vector3: __G.game.player.pos.constructor })`);
    await p.evaluate(LIB);
    const js = (process.env.PRE || '') + fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, MODE + '.js')) ? MODE + '.js' : 'anim1_' + MODE + '.js'), 'utf8');
    const res = await p.evaluate(js);
    fs.writeFileSync(path.join(out, MODE + '_' + vn + '.json'), JSON.stringify(res, null, 1)); console.log(vn, JSON.stringify(res).slice(0, 3000));
    await ctx.close();
  }
  console.log('PAGEERRORS', perr); await b.close(); srv.close(); process.exit(0);
});
