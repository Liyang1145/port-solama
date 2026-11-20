import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, meshopt, join, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
const drop = /^(interior_light|interior_dark|leather|carpet|carbon|steering|brake|nuts|trim|wipers|blue)/;
for (const n of doc.getRoot().listNodes()) {
  if (drop.test(n.getName())) { const m = n.getMesh(); n.setMesh(null); }
}
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { if (p.getAttribute('TEXCOORD_0')) p.setAttribute('TEXCOORD_0', null); if (p.getAttribute('NORMAL')) p.setAttribute('NORMAL', null); }
await doc.transform(prune(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +process.argv[4]||0.15, error: 0.004, lockBorder:false }), prune());
let tot=0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tot+=p.getAttribute('POSITION').getCount();
console.log('verts', tot);
doc.createExtension((await import('@gltf-transform/extensions')).EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:'filter'});
await doc.transform(meshopt({encoder: MeshoptEncoder, level:'medium'}));
// remove draco ext
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName==='KHR_draco_mesh_compression') e.dispose();
await io.write(process.argv[3], doc);
