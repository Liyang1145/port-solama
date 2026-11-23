// fix_pt1: logic-only ticking (like the playtest / memwatch harnesses: __G.tick(1/30,false) x N per JS task) -> what the GPU thread
// has to drain. Per variant: wall time, CPU seconds of the in-process GPU thread, chrome RSS. usage: V="new=;old=oldmmdraw" node tools/mmgpu.cjs <map> [frames] [perTask]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'gta', NF = +(process.argv[3] || 450), PER = +(process.argv[4] || 30);
const V = (process.env.V || 'new=;old=oldmmdraw').split(';').map((s) => s.split('='));
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
const avail = () => +cp.execSync("free -m | awk '/Mem:/{print $7}'").toString().trim();
const chromePid = () => +cp.execSync(`ps -eo pid=,ppid=,comm= | awk -v p=${process.pid} '$2==p && /chrome/{print $1}' | head -1`).toString().trim();
const gpuCpu = (pid) => { let s = 0; for (const t of fs.readdirSync(`/proc/${pid}/task`)) { try { const c = fs.readFileSync(`/proc/${pid}/task/${t}/comm`, 'utf8'); if (/InProcGp/.test(c)) { const f = fs.readFileSync(`/proc/${pid}/task/${t}/stat`, 'utf8').split(') ')[1].split(' '); s += (+f[11] + +f[12]) / 100; } } catch (e) { } } return +s.toFixed(1); };
const rssOf = (pid) => Math.round(+cp.execSync(`ps -o rss= -p ${pid}`).toString() / 1024);
srv.listen(0, async () => {
  for (const [vn, q] of V) {
    const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
    const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(300000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0&${q}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
    const pid = chromePid(); if (process.env.TP) await p.evaluate(`(() => { __G.game.tp(${process.env.TP}); __G.step(3); return 1; })()`); await p.evaluate('__G.render()'); await p.waitForTimeout(2000);
    const g0 = gpuCpu(pid), r0 = rssOf(pid), t0 = Date.now(); let worst = 0, hung = false;
    for (let f = 0; f < NF; f += PER) { const t = Date.now(); let fin = false; const pr = p.evaluate(`(() => { const g = __G.game; for (let i = 0; i < ${PER}; i++) { g.keys.KeyW = ((g.__fpi = (g.__fpi || 0) + 1) % 240) < 120; g.keys.KeyS = !g.keys.KeyW; g.cam.yaw += 0.002; __G.tick(1/30, false); } g.keys.KeyW = false; g.keys.KeyS = false; return 1; })()`).then(() => { fin = true; });
      for (let w = 0; w < 300 && !fin; w++) { await new Promise((r) => setTimeout(r, 100)); if (avail() < 900) break; }
      if (!fin) { hung = true; console.log(vn, 'HANG/lowmem at frame', f, 'rss', rssOf(pid), 'gpuCpu', gpuCpu(pid), 'avail', avail()); break; }
      worst = Math.max(worst, Date.now() - t); }
    const res = { variant: vn, q, frames: NF, perTask: PER, wallS: +((Date.now() - t0) / 1000).toFixed(1), worstTaskMs: worst, gpuCpuS: +(gpuCpu(pid) - g0).toFixed(1), rssMB: [r0, rssOf(pid)], hung, perr };
    console.log('RESULT', JSON.stringify(res)); fs.appendFileSync(path.join(root, 'shots/fp1/mmgpu.jsonl'), JSON.stringify({ map: MAPN, ...res }) + '\n');
    await b.close().catch(() => {}); if (hung) { try { process.kill(pid, 'SIGKILL'); } catch (e) { } }
  }
  process.exit(0);
});
