// fix_pt1: what is under a screen point (object / material / hit position) in a scripted view. usage: node tools/pick.cjs <map> '<json scenes>'
// scene: { tp:[x,z,yaw], hour, ndc:[[x,y],...] }
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const MAPN = process.argv[2] || 'gta'; const SC = JSON.parse(process.argv[3] || '[]');
const srv = http.createServer((q, s) => { const p = path.join(root, 'dist', decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--in-process-gpu', '--js-flags=--max-old-space-size=1100', '--disable-dev-shm-usage', '--single-process', '--disable-gpu-program-cache', '--force-gpu-mem-available-mb=256'] });
  const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage(); p.setDefaultTimeout(600000);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?snap&map=${MAPN}&lowshadow&probe=0&dpr=1`); await p.waitForFunction('window.__G && window.__G.ready', null, { polling: 500 });
  const r = await p.evaluate(`(() => { const G = __G, g = G.game, THREE = G.THREE; const out = []; const rc = new THREE.Raycaster();
    for (const s of ${JSON.stringify(SC)}) { G.setHour(s.hour ?? 13); g.tp(...s.tp); G.step(8); g.updateCamera(1, true); G.camera.updateMatrixWorld(); const row = { tp: s.tp, cam: G.camera.position.toArray().map((v) => +v.toFixed(2)), hits: [] };
      for (const [x, y] of s.ndc) { rc.setFromCamera(new THREE.Vector2(x, y), G.camera); rc.far = 120; const hs = rc.intersectObjects(G.scene.children, true).filter((h) => { let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return !h.object.isSprite && !h.object.isPoints; }).slice(0, 3);
        row.hits.push({ ndc: [x, y], h: hs.map((h) => { const o = h.object, m = Array.isArray(o.material) ? o.material[h.face ? h.face.materialIndex : 0] : o.material; return { obj: o.name || o.type, parent: o.parent && (o.parent.name || o.parent.type), mat: m && (m.name || m.type), key: m && m.userData && (m.userData.prepKey || m.userData.key), map: !!(m && m.map), mapSrc: m && m.map && m.map.image && (m.map.image.width + 'x' + m.map.image.height), col: m && m.color && m.color.getHexString(), em: m && m.emissive && m.emissive.getHexString(), inst: h.instanceId, d: +h.distance.toFixed(2), p: h.point.toArray().map((v) => +v.toFixed(2)), ud: Object.keys(o.userData || {}).slice(0, 6) }; }) }); }
      out.push(row); }
    return out; })()`);
  for (const row of r) console.log(JSON.stringify(row)); await b.close(); process.exit(0);
});
