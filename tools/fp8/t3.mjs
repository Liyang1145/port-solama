import './shim.mjs';
import inspector from 'node:inspector/promises'; import fs from 'node:fs';
const M = await import('./bundle.mjs');
const g = M.buildGraph(M.ROADS, []); const P = M.genParcels(g); M.planGenfit(P, g); M.planYards(P, g);
const L = P.filter(p => !p.far && (!process.env.STYLE || process.env.STYLE.split(",").includes(p.style))); const N = +(process.env.N || 100);
const s = new inspector.Session(); s.connect();
await s.post('HeapProfiler.enable'); await s.post('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const fake = { onParcel: null };
for (let i = 0; i < N; i++) { const W = new Map(); M.Stream.prototype.parcel.call(fake, W, null, L[i]); }
const { profile } = await s.post('HeapProfiler.stopSampling');
const self = {}, inc = {}; let tot = 0;
const walk = (n, st) => { const k = (n.callFrame.functionName || '(anon)') + ':' + (n.callFrame.lineNumber + 1); const st2 = st.includes(k) ? st : st.concat(k); const sz = n.selfSize; tot += sz; self[k] = (self[k] || 0) + sz; for (const q of st2) inc[q] = (inc[q] || 0) + sz; for (const c of n.children) walk(c, st2); };
walk(profile.head, []);
const pr = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 35).map(([k, v]) => k + ' ' + (v / 1e6).toFixed(0) + 'MB ' + (100 * v / tot).toFixed(1) + '%').join('\n');
console.log('TOTAL MB', (tot / 1e6).toFixed(0), 'per parcel', (tot / 1e6 / N).toFixed(1)); console.log('SELF\n' + pr(self)); console.log('INC\n' + pr(inc));
