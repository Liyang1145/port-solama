import './shim.mjs';
const M = await import('./bundle.mjs');
const g = M.buildGraph(M.ROADS, []); const P = M.genParcels(g); M.planGenfit(P, g); M.planYards(P, g);
const BAL=[]; for (let i=0;i<(+process.env.BAL||0);i++){ const a=new Array(1000); for(let j=0;j<1000;j++) a[j]={x:j,y:i,z:[j]}; BAL.push(a);} globalThis.BAL=BAL;
const L = P.filter(p => !p.far && ['downtown','mid','deco'].includes(p.style)).filter((_, i) => i % 4 === 0);
const S = Object.create(M.Stream.prototype); S.onParcel = () => { M.SHOP_LOG.length = M.ROOF_LOG.length = M.FOOT_LOG.length = M.CLUTTER_LOG.length = 0; };
const pct = (a) => { a.sort((x, y) => x - y); const q = (f) => a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(1); return `n=${a.length} p50 ${q(.5)} p95 ${q(.95)} p99 ${q(.99)} max ${a[a.length - 1].toFixed(1)} >16:${a.filter(x => x > 16).length} >33:${a.filter(x => x > 33).length}`; };
const mode = process.env.MODE; const sl = [];
for (const p of L) { const W = new Map();
  if (mode === 'old') { const t = performance.now(); S.parcel(W, null, p); sl.push(performance.now() - t); }
  else { const T = S.ptBegin(null, p); for (;;) { const t = performance.now(); const f = S.ptStep(T, W, 6, t); sl.push(performance.now() - t); if (f) break; } } }
console.log(mode, 'parcels', L.length, pct(sl));
