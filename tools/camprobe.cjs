// fix_pt1: third-person camera vs walls / canopies / containers at the PLAYTEST_1H points. For each point x yaw: player placed,
// camera settled (updateCamera x 20 steps), then (a) camera inside a collider (resolve r 0.05, same test as the playtest __check),
// (b) visual occlusion: THREE.Raycaster from the look-at point to the camera against visible scene meshes (player hidden).
// usage: node tools/camprobe.cjs <map> "x,z;x,z" [yaws]   env Q
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'cyber'; const PTS = (process.argv[3] || '198.7,77.5;140.8,-336.5;12,330').split(';').map((s) => s.split(',').map(Number)); const NY = +(process.argv[4] || 16);
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const out = {};
  for (const [vn, q] of (process.env.V || 'new=;old=oldcam').split(';').map((s) => s.split('='))) {
    const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] }); // one browser per variant (single-process cannot open a 2nd page)
    const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
    await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0&${q}&${process.env.Q || ''}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
    const r = await p.evaluate(`(() => { const G = __G, g = G.game, THREE = G.THREE || window.THREE; const PTS = ${JSON.stringify(PTS)}; const NY = ${NY}; const res = [];
      const rc = THREE ? new THREE.Raycaster() : null; const tmp = THREE ? new THREE.Vector3() : null;
      for (const [x, z] of PTS) { g.tp(x, z, 0); G.step(4); const P = g.P; const row = { pt: [x, z], player: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], inCol: 0, occl: 0, n: 0, bad: [] };
        for (let i = 0; i < NY; i++) for (const pitch of [0.15, -0.25]) { const yaw = i / NY * Math.PI * 2; g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.lastMouse = performance.now(); for (let k = 0; k < 20; k++) g.updateCamera(1 / 30);
          const c = G.camera.position; const L = g.cam.look; row.n++;
          const rr = g.city.col.resolve(c.x, c.z, 0.05, c.y); const inC = Math.hypot(rr.x - c.x, rr.z - c.z) > 0.05; if (inC) row.inCol++;
          let occ = null; if (rc) { tmp.copy(c).sub(L); const d = tmp.length(); tmp.normalize(); rc.set(L, tmp); rc.far = d - 0.15; rc.near = 0.3; const was = g.player.root.visible; g.player.root.visible = false;
            const hits = rc.intersectObjects(G.scene.children, true).filter((h) => { let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } const m = h.object.material; return !(m && (m.transparent && m.opacity < 0.6)) && !(h.object.isSprite) && !(h.object.isPoints) && !(h.object.isLine); }); g.player.root.visible = was;
            if (hits.length) { occ = [hits[0].object.name || hits[0].object.type, (hits[0].object.material && (hits[0].object.material.name || hits[0].object.material.type)) || '', +hits[0].distance.toFixed(2), +d.toFixed(2)]; row.occl++; } }
          if (inC || occ) row.bad.push({ yaw: +yaw.toFixed(2), pitch, cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], dist: +c.distanceTo(L).toFixed(2), inC, occ }); }
        res.push(row); }
      return res; })()`);
    out[vn] = r; for (const row of r) console.log(vn, JSON.stringify(row.pt), 'player', JSON.stringify(row.player), 'inCol', row.inCol + '/' + row.n, 'occluded', row.occl + '/' + row.n, JSON.stringify(row.bad.slice(0, 6)));
    console.log(vn, 'PAGEERROR', perr); await b.close().catch(() => {});
  }
  fs.writeFileSync(path.join(root, 'shots/fp1/camprobe_' + MAPN + '.json'), JSON.stringify(out)); process.exit(0);
});
