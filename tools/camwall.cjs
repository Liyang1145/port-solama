// fix_pt6 #2: back against a wall, orbit the camera a full turn (playtest2 back_wall_cam at B (257.9,-11.2)). Per yaw: camera->head
// distance, player hidden (fix_pt3 near-cut), camera->chest view blocked (THREE raycast vs visible meshes), camera inside a collider.
// usage: MAP=cyber node tools/camwall.cjs <variant-query> "x,z;x,z"   (one variant per process; SHOT=prefix writes the worst yaw frames)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.env.MAP || 'cyber'; const VQ = process.argv[2] || ''; const PTS = (process.argv[3] || '257.9,-11.2').split(';').map((s) => s.split(',').map(Number));
const srv = http.createServer((q, s) => { const p = path.join(path.resolve(root, process.env.DIST || 'dist'), decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: +(process.env.W || 320), height: +(process.env.H || 180) } })).newPage(); p.setDefaultTimeout(600000); let perr = 0; p.on('pageerror', (e) => { perr++; console.log('PAGEERROR', e.message.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&dpr=1&lowshadow&nopost&far=140&${VQ}`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  for (const [x, z] of PTS) {
    const r = await p.evaluate(`(() => { const G = __G, g = G.game, THREE = G.THREE, P = g.P; g.tp(${x}, ${z}, 0); G.step(6);
      let best = null; for (let a = 0; a < 6.283; a += 0.05) { const t = g.city.col.raycast(P.pos.x, P.pos.y + 1, P.pos.z, P.pos.x + Math.sin(a) * 30, P.pos.y + 1, P.pos.z + Math.cos(a) * 30); if (t < 1 && (!best || t < best.t)) best = { t, a }; }
      if (!best) return { err: 'no wall' }; const wx = P.pos.x + Math.sin(best.a) * 30 * best.t, wz = P.pos.z + Math.cos(best.a) * 30 * best.t;
      // back to the wall: stand 0.42 m off it, facing away
      const sx = wx - Math.sin(best.a) * 0.42, sz = wz - Math.cos(best.a) * 0.42; const rr = g.city.col.resolve(sx, sz, 0.35, P.pos.y + 0.5); P.pos.x = rr.x; P.pos.z = rr.z; P.pos.y = g.city.groundH(P.pos.x, P.pos.z); P.yaw = best.a + Math.PI; G.step(2);
      const rc = new THREE.Raycaster(); const v = new THREE.Vector3(); const head = new THREE.Vector3(); const out = [];
      for (let k = 0; k < 16; k++) { const pitch = k % 4 === 1 ? 0.25 : k % 4 === 3 ? -0.2 : 0.05; g.cam.yaw = best.a + k / 16 * Math.PI * 2; g.cam.pitch = pitch; g.cam.lastMouse = performance.now(); for (let i = 0; i < 25; i++) g.updateCamera(1 / 30);
        const c = G.camera.position; head.set(P.pos.x, P.pos.y + 1.55, P.pos.z); const hd = c.distanceTo(head);
        const cr = g.city.col.resolve(c.x, c.z, 0.05, c.y); const inC = Math.hypot(cr.x - c.x, cr.z - c.z) > 0.05;
        const chest = new THREE.Vector3(P.pos.x, P.pos.y + 1.2, P.pos.z); v.copy(chest).sub(c); const d = v.length(); v.normalize(); rc.set(c, v); rc.near = 0.05; rc.far = Math.max(0.06, d - 0.4);
        const was = g.player.root.visible; g.player.root.visible = false; const hits = rc.intersectObjects(G.scene.children, true).filter((h) => { let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } const m = h.object.material; return !(m && m.transparent && m.opacity < 0.6) && !h.object.isSprite && !h.object.isPoints && !h.object.isLine; }); g.player.root.visible = was;
        out.push({ k, yaw: +(g.cam.yaw - best.a).toFixed(2), pitch, hd: +hd.toFixed(2), camY: +(c.y - P.pos.y).toFixed(2), hid: g.player.root.visible ? 0 : 1, blk: hits.length ? (hits[0].object.name || hits[0].object.type) : 0, inC: inC ? 1 : 0 }); }
      return { wall: [+wx.toFixed(1), +wz.toFixed(1)], a: +best.a.toFixed(2), player: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], out }; })()`);
    if (r.err) { console.log(x, z, r.err); continue; }
    const bad = r.out.filter((o) => o.hid || o.blk || o.inC); const near = r.out.filter((o) => o.hd < 0.7);
    console.log(VQ || 'new', JSON.stringify([x, z]), 'wall', JSON.stringify(r.wall), 'player', JSON.stringify(r.player), 'hidden', r.out.filter((o) => o.hid).length + '/16', 'blocked', r.out.filter((o) => o.blk).length, 'inCol', r.out.filter((o) => o.inC).length, 'hd<0.7', near.length, 'minHd', Math.min(...r.out.map((o) => o.hd)));
    for (const o of r.out) console.log('  ', JSON.stringify(o));
    if (process.env.SHOT) { for (const k of (process.env.SHOTK || '8').split(',').map(Number)) { await p.evaluate(`(() => { const G = __G, g = G.game; g.cam.yaw = ${r.a} + ${k} / 16 * Math.PI * 2; g.cam.pitch = ${k % 4 === 1 ? 0.25 : k % 4 === 3 ? -0.2 : 0.05}; g.cam.lastMouse = performance.now(); for (let i = 0; i < 25; i++) g.updateCamera(1 / 30); G.render(); })()`);
      const d = await p.evaluate('document.getElementById("c").toDataURL("image/jpeg", 0.85)'); const f = `${process.env.SHOT}_k${k}.jpg`; fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); console.log('shot', f); } }
  }
  console.log('PAGEERROR', perr); await b.close().catch(() => {}); process.exit(0);
});
