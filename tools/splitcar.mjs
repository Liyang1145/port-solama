// Convert an ara3d skinned vehicle (props/*_driver.glb) into static glb: body + 4 wheel nodes (wheel_fl/fr/rl/rr), recentred, facing +Z, bbox-centred on X.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [inp, outp] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(inp); const root = src.getRoot();
const skin = root.listSkins()[0]; const joints = skin.listJoints().map(j => j.getName());
const wheelOf = {}; joints.forEach((n, i) => { const m = /Wheel_(front|rear)_(-?1)/.exec(n); if (m) wheelOf[i] = 'w' + (m[1] === 'front' ? 'f' : 'r') + (m[2] === '1' ? 'l' : 'r'); });
const dst = new Document(); const buf = dst.createBuffer(); const sc = dst.createScene();
const matMap = new Map(); const gm = (m) => { if (!matMap.has(m)) { const c = dst.createMaterial(m.getName()).setBaseColorFactor(m.getBaseColorFactor()).setRoughnessFactor(m.getRoughnessFactor()).setMetallicFactor(m.getMetallicFactor()).setAlphaMode(m.getAlphaMode()).setEmissiveFactor(m.getEmissiveFactor()); matMap.set(m, c); } return matMap.get(m); };
const groups = {}; // key -> {mat -> {pos:[],idx:[],map}}
let minX = 1e9, maxX = -1e9;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const P = p.getAttribute('POSITION').getArray(), J = p.getAttribute('JOINTS_0')?.getArray(), W = p.getAttribute('WEIGHTS_0')?.getArray(), I = p.getIndices().getArray();
  const dom = (v) => { let b = 0, bw = -1; for (let k = 0; k < 4; k++) if (W[v * 4 + k] > bw) { bw = W[v * 4 + k]; b = J[v * 4 + k]; } return b; };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2]; const wj = [a, b, c].map(v => wheelOf[dom(v)]).filter(Boolean);
    const key = wj.length >= 2 ? wj[0] : 'body';
    const g = ((groups[key] ??= new Map()).get(p.getMaterial()) ?? (groups[key].set(p.getMaterial(), { pos: [], idx: [], mp: new Map() }), groups[key].get(p.getMaterial())));
    for (const v of [a, b, c]) { if (!g.mp.has(v)) { g.mp.set(v, g.pos.length / 3); g.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); if (key === 'body') { minX = Math.min(minX, P[v * 3]); maxX = Math.max(maxX, P[v * 3]); } } g.idx.push(g.mp.get(v)); }
  }
}
const cx = (minX + maxX) / 2;
// find a wheel's centre for pivot
for (const [key, mm] of Object.entries(groups)) {
  const node = dst.createNode(key === 'body' ? 'body' : 'wheel_' + key.slice(1)); sc.addChild(node);
  let c = [0, 0, 0], n = 0;
  if (key !== 'body') { for (const g of mm.values()) for (let i = 0; i < g.pos.length; i += 3) { c[0] += g.pos[i]; c[1] += g.pos[i + 1]; c[2] += g.pos[i + 2]; n++; } c = c.map(x => x / n); } 
  else c = [cx, 0, 0];
  if (key !== 'body') node.setTranslation([c[0] - cx, c[1], c[2]]);
  const mesh = dst.createMesh(node.getName()); node.setMesh(mesh);
  for (const [m, g] of mm) {
    const pos = new Float32Array(g.pos); for (let i = 0; i < pos.length; i += 3) { pos[i] -= c[0]; if (key !== 'body') { pos[i + 1] -= c[1]; pos[i + 2] -= c[2]; } }
    const prim = dst.createPrimitive().setAttribute('POSITION', dst.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf)).setIndices(dst.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buf)).setMaterial(gm(m));
    mesh.addPrimitive(prim);
  }
  if (key !== 'body') console.log(node.getName(), node.getTranslation().map(x => x.toFixed(2)).join(','));
}
await io.write(outp, dst);
