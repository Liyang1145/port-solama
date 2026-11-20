import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root=doc.getRoot(); let tot=0;
for (const n of root.listNodes()){ const m=n.getMesh(); if(!m) continue; let v=0; let mats=[];
 for(const p of m.listPrimitives()){ v+=p.getAttribute('POSITION').getCount(); mats.push(p.getMaterial()?.getName()); }
 tot+=v; console.log(n.getName().padEnd(24), String(v).padStart(7), mats.join(','), n.getTranslation().map(x=>x.toFixed(2)).join(' ')); }
console.log('total',tot);
