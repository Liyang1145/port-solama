globalThis.window=globalThis; globalThis.location={search:process.env.QS||''};
const ctx2d=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?()=>({data:new Uint8ClampedArray(4)}):k==='createLinearGradient'||k==='createRadialGradient'||k==='createPattern'?()=>({addColorStop(){}}):(()=>{})});
globalThis.document={createElement:()=>({getContext:()=>ctx2d,width:1,height:1,style:{}}),addEventListener(){},body:{appendChild(){}}};
globalThis.performance ??= {now:()=>Date.now()};
