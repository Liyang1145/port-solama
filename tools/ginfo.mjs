import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]); const r=doc.getRoot();
console.log('skins', r.listSkins().map(s=>s.listJoints().length), 'joints sample', r.listSkins()[0]?.listJoints().slice(0,8).map(j=>j.getName()).join(','));
console.log('anims', r.listAnimations().map(a=>a.getName()+':'+a.listChannels().length).join(' '));
console.log('mats', r.listMaterials().map(m=>m.getName()+'/'+m.getAlphaMode()).join(' '));
console.log('tex', r.listTextures().map(t=>t.getName()+' '+t.getMimeType()+' '+(t.getSize()||[]).join('x')+' '+(t.getImage().byteLength/1024|0)+'KB').join(' | '));
