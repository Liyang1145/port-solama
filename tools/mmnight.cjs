// grassfix playtest #2: minimap / M-map readability by time of day and chase tint. usage: node tools/mmnight.cjs <outprefix> ; env DIST, MAP (cyber|gta), Q
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const OUT = process.argv[2] || 'shots/mm/x';
const srv = http.createServer((q, s) => { const p = path.join(root, process.env.DIST || 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1200', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(600000);
  let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&dpr=1&map=${process.env.MAP || 'cyber'}&hour=13&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  console.log('ready');
  const S = [['day', 13, 0, 0], ['daywant', 13, 3, 0], ['night', 21.5, 0, 0], ['nightwant', 21.5, 3, 0], ['nightwantbig', 21.5, 3, 1]];
  for (const [nm, h, w, big] of S) {
    const r = await p.evaluate(`(() => { const G = __G, g = G.game; G.setHour(${h}); g.wanted = 0; if (${w}) g.crime(${w}); g.wantedFlash = false; G.step(3); if (${big} && !g.hud.bigMap) g.hud.toggleBig(); if (!${big} && g.hud.bigMap) g.hud.toggleBig(); G.step(1); G.render();
      const c = g.hud.mm; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let sum = 0, sq = 0, n = 0; for (let k = 0; k < d.length; k += 16) { const l = 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]; sum += l; sq += l * l; n++; }
      const m = sum / n; return { wanted: g.wanted, flash: g.wantedFlash, night: G.env.look.night, mean: +m.toFixed(1), sd: +Math.sqrt(sq / n - m * m).toFixed(1) }; })()`);
    console.log(nm, JSON.stringify(r)); await p.screenshot({ path: `${OUT}_${nm}.jpg`, type: 'jpeg', quality: 85 });
  }
  console.log('DONE perr', perr); await b.close(); srv.close(); process.exit(0);
});
