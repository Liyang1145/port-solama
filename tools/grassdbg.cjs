// grassfix: at the flicker frames of grassprobe (same walk), dump the render state and bisect subsystems by re-rendering the frame.
// usage: node tools/grassdbg.cjs <out.json> ; env DIST, Q, TF="82,100", NF, X Z YAW, ROT
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const OUT = process.argv[2] || 'shots/grassdbg.json';
const X = +(process.env.X || 292.5), Z = +(process.env.Z || 19.2), YAW = +(process.env.YAW || 0), ROT = +(process.env.ROT || 0.035);
const TF = (process.env.TF || '82,100').split(',').map(Number); const NF = +(process.env.NF || (Math.max(...TF) + 1));
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1200', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(600000);
  let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); }); p.on('console', (m) => { if (m.text().startsWith('GD ')) console.log(m.text().slice(0, 400)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=cyber&hour=13&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  console.log('ready');
  await p.evaluate(`void (() => { const G = __G, g = G.game; __G.rb = 1; g.tp(${X}, ${Z}, ${YAW}); g.cam.yaw = ${YAW} + Math.PI; G.step(2); g.updateCamera(1, true);
    window.__cv = document.createElement('canvas'); __cv.width = 120; __cv.height = 68;
    window.__green = () => { const c = __cv.getContext('2d'); c.drawImage(G.renderer.domElement, 0, 0, 120, 68); const d = c.getImageData(0, 34, 120, 34).data; let g = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 1] > d[k] + 25 && d[k + 1] > d[k + 2] + 15) g++; return +(g / (120 * 34)).toFixed(3); };
  })()`);
  const res = { perr, frames: [] };
  for (let i = 0; i < NF; i++) {
    const hit = TF.includes(i);
    const r = await p.evaluate(`(() => { const G = __G; G.step(1, 1 / 30); G.game.cam.yaw += ${ROT}; if (${i} % 2) return null; if (!${hit}) { G.render(); return { i: ${i}, green: __green() }; }
      return window.__exp(${i}); })()`.replace('window.__exp', hit ? '(' + fs.readFileSync(path.join(__dirname, '' + (process.env.EXP || 'grassdbg_exp.js') + ''), 'utf8') + ')' : 'void'));
    if (r) { console.log(JSON.stringify(r).slice(0, 3000)); if (hit) res.frames.push(r); }
    if (hit) await p.screenshot({ path: OUT.replace(/\.json$/, '') + '_' + i + '.jpg', type: 'jpeg', quality: 70 });
  }
  res.perr = perr; fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); console.log('DONE perr', perr); await b.close(); srv.close(); process.exit(0);
});
