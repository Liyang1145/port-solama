import { NodeIO } from '@gltf-transform/core';
const io=new NodeIO(); const d=await io.read(process.argv[2]);
const root=d.getRoot();
function walk(n,dp){const m=n.getMesh();let t=0;if(m)for(const p of m.listPrimitives()){t+=(p.getIndices()?.getCount()||0)/3}
console.log(' '.repeat(dp)+n.getName(),m?('tris '+t+' '+m.listPrimitives().map(p=>p.getMaterial()?.getName()).join(',')):'',n.getTranslation().map(x=>x.toFixed(2)).join(','));n.listChildren().forEach(c=>walk(c,dp+1))}
root.listScenes()[0].listChildren().forEach(c=>walk(c,0));
