import './shim.mjs';
const M = await import('./bundle.mjs');
const g = M.buildGraph(M.ROADS, []); const P = M.genParcels(g); M.planGenfit(P, g); M.planYards(P, g);
const L = P.filter(p => !p.far); const step = +(process.env.STEP || 7); const SL = +(process.env.SL || 0.3);
const H0 = () => 2166136261 >>> 0;
const hashW = (W) => { let H = H0(); const ha = (a) => { if (!a) { H = Math.imul(H ^ 7, 16777619) >>> 0; return; } const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++) H = Math.imul(H ^ u[i], 16777619) >>> 0; };
  for (const [k, e] of [...W].sort((a, b) => a[0] < b[0] ? -1 : 1)) for (const o of e.list) { ha(o.P); ha(o.N); ha(o.UV); ha(o.C); for (const q of Object.keys(o.CU).sort()) ha(o.CU[q]); ha(o.idx); } return H.toString(16); };
let logsSeen;
const S = Object.create(M.Stream.prototype); S.onParcel = (c, p, m) => { logsSeen = JSON.stringify([M.SHOP_LOG, M.ROOF_LOG, M.FOOT_LOG, M.CLUTTER_LOG, p.svcF]); M.SHOP_LOG.length = M.ROOF_LOG.length = M.FOOT_LOG.length = M.CLUTTER_LOG.length = 0; };
let bad = 0, n = 0, maxSl = 0, slices = 0; const outerRng = M.rngGet();
for (let i = 0; i < L.length; i += step) { const p = L[i];
  const W1 = new Map(); S.parcel(W1, null, p); const h1 = hashW(W1), l1 = logsSeen;
  const W2 = new Map(); const T = S.ptBegin(null, p); let k = 0;
  for (;;) { const t = performance.now(); const fin = S.ptStep(T, W2, SL, t); const d = performance.now() - t; k++; if (d > maxSl) maxSl = d; if (fin) break;
    M.rng(); M.rng(); M.CLUT_CTX.m = { junk: 1 }; M.SHOP_LOG.push({ junk: k }); M.SHOP_LOG.length = 0; M.CLUT_CTX.m = null; }
  slices += k; const h2 = hashW(W2), l2 = logsSeen; n++;
  if (h1 !== h2 || l1 !== l2) { bad++; if (bad < 5) console.log('MISMATCH', i, p.style, h1, h2, l1 === l2); }
  if (M.rngGet() !== outerRng || M.CLUT_CTX.m) { console.log('LEAK state', i); bad++; } }
console.log('parcels', n, 'bad', bad, 'avg slices', (slices / n).toFixed(1), 'maxSlice(ms incl GC)', maxSl.toFixed(1));
