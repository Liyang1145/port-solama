import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) { const d = await io.read(f); const r = d.getRoot(); let v = 0, t = 0;
 for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { v += p.getAttribute('POSITION').getCount(); t += (p.getIndices()?.getCount() || 0) / 3; }
 const b = getBounds(r.listScenes()[0]);
 console.log(f.split('/').pop(), 'verts', v, 'tris', t, 'tex', r.listTextures().length, 'mats', r.listMaterials().map(m=>m.getName()).join(','), 'nodes', r.listNodes().map(n=>n.getName()).slice(0,12).join(','), 'bounds', b.min.map(x=>x.toFixed(2)), b.max.map(x=>x.toFixed(2)));
}
