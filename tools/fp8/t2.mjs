import './shim.mjs';
const M = await import('./bundle.mjs');
const g = M.buildGraph(M.ROADS, []); const P = M.genParcels(g); M.planGenfit(P, g); M.planYards(P, g);
const L = P.filter(p => !p.far && (!process.env.STYLE || process.env.STYLE.split(",").includes(p.style))); const N = +(process.env.N || L.length);
const BAL=[]; for (let i=0;i<(+process.env.BAL||0);i++){ const a=new Array(1000); for(let j=0;j<1000;j++) a[j]={x:j,y:i,z:[j]}; BAL.push(a);} globalThis.BAL=BAL;
const fake = { onParcel: null }; const res = []; let H = 2166136261 >>> 0;
const hashArr = (a) => { if (!a) { H = Math.imul(H ^ 7, 16777619) >>> 0; return; } const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++) H = Math.imul(H ^ u[i], 16777619) >>> 0; };
const t00 = performance.now();
for (let r = 0; r < (+process.env.R || 1); r++)
for (let i = 0; i < N; i++) { const p = L[i]; const W = new Map(); const t = performance.now(); M.Stream.prototype.parcel.call(fake, W, null, p); const d = performance.now() - t;
  if (r === 0) { res.push([p.style, d, i]); if (process.env.HASH) for (const [k, e] of [...W].sort((a, b) => a[0] < b[0] ? -1 : 1)) for (const o of e.list) { hashArr(o.P); hashArr(o.N); hashArr(o.UV); hashArr(o.C); for (const q of Object.keys(o.CU).sort()) hashArr(o.CU[q]); hashArr(o.idx); } } }
const tot = performance.now() - t00;
const by = {}; for (const [s, d] of res) { const b = by[s] ||= { n: 0, ms: 0, max: 0 }; b.n++; b.ms += d; b.max = Math.max(b.max, d); }
for (const s in by) by[s].avg = +(by[s].ms / by[s].n).toFixed(1), by[s].ms = Math.round(by[s].ms), by[s].max = +by[s].max.toFixed(1);
console.log(JSON.stringify(by), 'total', Math.round(tot), 'hash', H.toString(16));
res.sort((a, b) => b[1] - a[1]); console.log(JSON.stringify(res.slice(0, 12).map(r => [r[0], +r[1].toFixed(1), r[2]])));
