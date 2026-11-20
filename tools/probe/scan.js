(()=>{const G=window.__G;const R=G.renderer;const groups={};const skS=new Set();let skinned=0,skVis=0,skVerts=0,matSet=new Set(),texSet=new Map();
for(const top of G.scene.children){let n=0,tris=0,vis=0;top.traverse(o=>{if(!o.isMesh)return;n++;let v=true;for(let p=o;p;p=p.parent)if(!p.visible){v=false;break;}const g=o.geometry;const t=(g.index?g.index.count:(g.attributes.position?g.attributes.position.count:0))/3*(o.isInstancedMesh?o.count:1);if(v){vis++;tris+=t;}
 if(o.isSkinnedMesh){skinned++;skS.add(o.skeleton);if(v){skVis++;skVerts+=g.attributes.position.count;}}
 for(const m of [].concat(o.material)){if(!m)continue;matSet.add(m);for(const k in m){const t2=m[k];if(t2&&t2.isTexture&&t2.image){const im=t2.image;texSet.set(t2.uuid,(im.width||0)*(im.height||0)*4);}}}});
 groups[(top.name||top.type)+'#'+top.id]={n,vis,tris:Math.round(tris)};}
const top=Object.entries(groups).sort((a,b)=>b[1].tris-a[1].tris).slice(0,14);
let texMB=0;for(const v of texSet.values())texMB+=v;
return {skeletons:skS.size,groups:top,skinned,skVis,skVerts,mats:matSet.size,texN:texSet.size,texMB:Math.round(texMB/1048576),geo:R.info.memory.geometries,tex:R.info.memory.textures,prog:R.info.programs.length,calls:R.info.render.calls,tris:R.info.render.triangles,heap:Math.round(performance.memory.usedJSHeapSize/1048576)};})()
