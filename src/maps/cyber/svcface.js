// b_alleyface (Hark modelling lane, 2026-11-22): service frontage (背街服务立面) for the ground floor of the hand-built Deco core
// where it faces the mid-block alleys, the back yards and the gaps between buildings instead of a street. city.js volume() gives
// those store-band edges facade style 6 (same 'building' program; the GLSL branch is in mats.js, 霓港 only) and adds a few real
// pieces (shutter housings, door hoods, hatch sills, meter cabinets) to the existing vcol bucket; alley.js keeps its wall fixtures
// off the openings. The bay plan is a pure integer rule shared by JS and GLSL (no rng): bay k of an edge with pattern seed ps
// (0..10) gets v = (7k + ps) mod 11 -> type. Keep this file and the style-6 branch in mats.js in step.
export const AF_OFF = typeof location !== 'undefined' && /[?&]noalleyface\b/.test(location.search); // test switch: old glass shop band all round
// b_alleyface2: streamed parcels. stream.js buildNear sets p (the lot being generated, parcel frame) and log (an array) around
// genParcel; city.js svcEdges then treats the lot's back (local −x) and its two sides (±z) as service faces unless bldglayer.js
// marked that side as facing a road (p.svcRoad bits: 1 = +z side, 2 = −z side, 4 = back; the same test as the corner side rows).
// The front (+x, shop street) never changes. svcFront logs every opening of a streamed lot into log (parcel frame); stream.js
// turns them into world segments on p.svcF for parcelgap.js (wall fixtures in the slots keep off them). No rng use anywhere.
export const SVC_CTX = { p: null, log: null };
export const SVC = { BLANK: 0, METER: 1, SHUT: 2, LOUV: 3, HATCH: 4, DOOR: 5 };
// v -> type: 0,1 blank · 2,3 meter cabinet · 4,5 roller shutter · 6,7 exhaust louvre · 8 delivery hatch · 9,10 steel door
const TBL = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 5];
export function svcType(k, ps, ww) { if (ww < 2.4) return SVC.BLANK; return TBL[(k * 7 + ps) % 11]; }
// opening of one bay, in metres from the bay centre (hw) and above the band base (y0 lowest, y1 painted top, top = highest
// real piece incl. housing / hood / sign) -> what alley.js has to keep clear of
export function svcOpening(t, ww) {
  switch (t) {
    case SVC.SHUT: return { hw: Math.min(ww * 0.5 - 0.45, 1.5), y0: 0, y1: 2.55, top: 2.86, floor: true };
    case SVC.DOOR: return { hw: 0.5, y0: 0, y1: 2.15, top: 2.6, floor: true };
    case SVC.HATCH: return { hw: Math.min(0.7, ww * 0.5 - 0.5), y0: 1.0, y1: 2.05, top: 2.26, bot: 0.9 };
    case SVC.LOUV: return { hw: 0.6, y0: 1.9, y1: 2.7, top: 2.72, bot: 1.84 };
    case SVC.METER: return { hw: 0.45, y0: 1.1, y1: 2.25, top: 2.27, bot: 1.1 };
    default: return null;
  }
}
// all openings of an edge of length len split into n = len / ww bays: [{ k, t, c (bay centre u), hw, y0, y1, top, bot }]
export function svcBays(len, ww, ps) {
  const n = Math.max(1, Math.round(len / ww)); const out = [];
  for (let k = 0; k < n; k++) { const t = svcType(k, ps, ww); const o = svcOpening(t, ww); if (o) out.push({ k, t, c: (k + 0.5) * ww, ...o, bot: o.bot ?? 0 }); }
  return out;
}
// b_svccol / b_narrowfix: the real pieces of one service edge, in the order city.js svcFront builds them (edge frame: u along,
// d out of the wall plane, y above the band base; every box starts 0.02 m inside the wall). fx (b_narrowfix, svccol.js) = the free
// depth in front of the wall where a neighbour wall stands close (narrow slots): { c: [per opening of svcBays], cp (plinth) } —
// a piece that would reach into the neighbour gets its flush version (shorter sill / housing, recessed meter cabinet, narrow hood)
// or is left off; null = the full pieces (as before b_narrowfix). Pure function of (len, ww, ps, fx): geometry, colliders and the
// census read the same list. k = piece kind, c = colour key (city.js), cap = bottom cap.
export const NF_MARGIN = 0.02; // kept free in front of the neighbour wall
// depth of a piece of full depth d0 with free depth c in front (null / large c -> d0); lo = shallowest version still built
const nfDepth = (d0, c, lo) => { if (c == null) return d0; const a = c - NF_MARGIN; if (a >= d0) return d0; return a >= lo ? Math.floor(a * 100) / 100 : 0; };
export function svcPieceList(len, ww, ps, fx = null) {
  const out = []; const P = (k, u0, u1, d, ya, yb, c, cap) => { if (d > 0) out.push({ k, u0, u1, d, ya, yb, c, cap, i: -1 }); };
  P('plinth', 0, len, nfDepth(0.06, fx && fx.cp, 0.03), 0, 0.3, 'plinth', false);
  svcBays(len, ww, ps).forEach((o, i) => { const P = (k, u0, u1, d, ya, yb, c, cap) => { if (d > 0) out.push({ k, u0, u1, d, ya, yb, c, cap, i, t: o.t }); }; const a0 = o.c - o.hw, a1 = o.c + o.hw; const c = fx && fx.c ? fx.c[i] : null;
    if (o.t === SVC.SHUT) P('shutter housing', a0 - 0.1, a1 + 0.1, nfDepth(0.3, c, 0.12), 2.55, 2.86, 'galv', true); // roll housing (rails painted); flush box ≥ 0.12
    else if (o.t === SVC.DOOR) P('door hood', a0 - 0.08, a1 + 0.08, nfDepth(0.2, c, 0.05), 2.28, 2.36, 'door', true); // drip hood, narrowed
    else if (o.t === SVC.HATCH) { const ds = nfDepth(0.34, c, 0.04); // sill: shortened, down to a 4 cm flush ledge
      P('hatch sill', ds < 0.34 ? a0 - 0.04 : a0 - 0.12, ds < 0.34 ? a1 + 0.04 : a1 + 0.12, ds, 0.9, 1.0, 'steel', true);
      P('hatch housing', a0 - 0.08, a1 + 0.08, nfDepth(0.22, c, 0.06), 2.05, 2.26, 'galv', true); }
    else if (o.t === SVC.LOUV) P('louvre drip', a0 - 0.05, a1 + 0.05, nfDepth(0.09, c, 0.03), 1.84, 1.9, 'steel', true);
    else if (o.t === SVC.METER) { const dl = nfDepth(0.25, c, 0.05); // cabinet + rain lid; recessed (嵌墙) version: 3 cm door plate, 5 cm lid
      const dc = dl >= 0.25 ? 0.2 : dl >= 0.08 ? +(dl - 0.05).toFixed(2) : dl > 0 ? 0.03 : 0;
      P('meter cabinet', a0, a1, dc, 1.1, 2.22, 'cab', true); P('meter lid', a0 - 0.04, a1 + 0.04, dl, 2.22, 2.28, 'dark', true); }
  });
  return out;
}

// ---- b_narrowfix: where a service face stands close to a neighbour wall (narrow slots, back-to-back core blocks) ----
// Test switch ?nonarrowfix (also off with ?nosvccol / ?noalleyface): full pieces everywhere, as b_svccol.
export const NF_OFF = () => AF_OFF || !!globalThis.__NONARROWFIX || !!globalThis.__NOSVCCOL || (typeof location !== 'undefined' && /[?&](nonarrowfix|nosvccol)\b/.test(location.search));
export const inBox = (b, x, z) => { if (b.o) { const o = b.o; const rx = x - o.cx, rz = z - o.cz; return Math.abs(rx * o.ux + rz * o.uz) <= o.hl && Math.abs(-rx * o.uz + rz * o.ux) <= o.hw; } return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ; };
// exact ray / box slabs in a box frame (a along (ux, uz), w across): entry distance (0 when inside), Infinity when missed within tmax
function raySlab(rx, rz, dx, dz, ux, uz, hl, hw, tmax) {
  const a = rx * ux + rz * uz, w = -rx * uz + rz * ux, da = dx * ux + dz * uz, dw = -dx * uz + dz * ux; let t0 = 0, t1 = tmax;
  for (const [p, d, h] of [[a, da, hl], [w, dw, hw]]) { if (Math.abs(d) < 1e-9) { if (p < -h || p > h) return Infinity; continue; }
    let ta = (-h - p) / d, tb = (h - p) / d; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return Infinity; }
  return t0; }
export function rayBox(b, x, z, dx, dz, tmax) { if (b.o) { const o = b.o; return raySlab(x - o.cx, z - o.cz, dx, dz, o.ux, o.uz, o.hl, o.hw, tmax); }
  return raySlab(x - (b.minX + b.maxX) / 2, z - (b.minZ + b.maxZ) / 2, dx, dz, 1, 0, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2, tmax); }
// free depth in front of a wall point (x, z) along the outward unit (ox, oz), up to dmax: the first foreign building collider
// ('bld', taller than ya, not own(b, x, z, ox, oz)) and, with near, the neighbours' exact footprints (parcelfit pieces, parcel frame)
const _q = [];
export function freeDepth(col, x, z, ox, oz, ya, own, dmax, near = null, self = null) {
  let t = dmax; col.query(x + ox * dmax / 2, z + oz * dmax / 2, dmax / 2 + 0.1, _q);
  for (const b of _q) { if (b.tag !== 'bld' || b.h < ya + 0.01 || own(b, x, z, ox, oz)) continue; const e = rayBox(b, x, z, ox, oz, t); if (e < t) t = e; }
  if (near) for (const [p, f] of near(x, z)) { if (p === self || !f.pieces) continue; const c = Math.cos(p.ang), s = Math.sin(p.ang);
    const lx = (x - p.x) * c + (z - p.z) * s, lz = -(x - p.x) * s + (z - p.z) * c, ldx = ox * c + oz * s, ldz = -ox * s + oz * c;
    for (const q of f.pieces) { const e = raySlab(lx - q.x, lz - q.z, ldx, ldz, q.ux, q.uz, q.hl, q.hw, t); if (e < t) t = e; } }
  return t; }
// free depth in front of the wall segment u0..u1 of an edge record (P(rec, u, d) -> world, P.dir(rec) -> along): min over samples ≤ 0.1 m apart
export function segFree(col, P, rec, u0, u1, ya, own, dmax, near, self) { const [ux, uz] = P.dir(rec); const l = Math.hypot(ux, uz); const ox = -uz / l, oz = ux / l;
  const n = Math.max(4, Math.ceil((u1 - u0) / 0.1)); let m = dmax; for (let i = 0; i <= n; i++) { const [x, z] = P(rec, u0 + (u1 - u0) * i / n, 0); m = Math.min(m, freeDepth(col, x, z, ox, oz, ya, own, m, near, self)); if (m <= 0) return 0; } return m; }
const NF_NEAR = 0.7; // a free depth below this is recorded (two full pieces facing each other need 0.34 + 0.34 + margin)
const EXT = { [SVC.SHUT]: 0.1, [SVC.DOOR]: 0.08, [SVC.HATCH]: 0.12, [SVC.LOUV]: 0.05, [SVC.METER]: 0.04 };
// pass 1 for one face F = { P, rec (len, ww, ps), own, self, near }: free depth per opening (its widest piece) and along the plinth.
// Only the obstacles that reach into the strip 0..NF_NEAR in front of the face are ray-tested (most faces have none -> null at once).
const cornersOf = (o) => { const r = []; for (const [sa, sw] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) r.push([o.cx + o.ux * o.hl * sa - o.uz * o.hw * sw, o.cz + o.uz * o.hl * sa + o.ux * o.hw * sw]); return r; };
const boxQuad = (b) => b.o ? cornersOf(b.o) : [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
export function nfFace(col, F) { const { P, rec } = F; const fl = (v) => Math.floor(v * 1000) / 1000;
  const S = [P(rec, 0, 0.001), P(rec, rec.len, 0.001), P(rec, rec.len, NF_NEAR), P(rec, 0, NF_NEAR)]; const [ux, uz] = P.dir(rec); const l = Math.hypot(ux, uz); const ox = -uz / l, oz = ux / l;
  const mx = (S[0][0] + S[2][0]) / 2, mz = (S[0][1] + S[2][1]) / 2; const R = rec.len / 2 + NF_NEAR + 0.5; const C = [];
  for (const b of col.query(mx, mz, R, [])) { if (b.tag !== 'bld' || b.h < 0.01) continue; const Q = boxQuad(b); if (!quadsHit(S, Q)) continue; C.push(b); }
  if (F.near) for (const [p, f] of F.near(mx, mz)) { if (p === F.self || !f.pieces) continue; const c = Math.cos(p.ang), s = Math.sin(p.ang);
    for (const q of f.pieces) { const w = { o: { cx: p.x + q.x * c - q.z * s, cz: p.z + q.x * s + q.z * c, ux: q.ux * c - q.uz * s, uz: q.ux * s + q.uz * c, hl: q.hl, hw: q.hw }, pc: 1 }; if (quadsHit(S, cornersOf(w.o))) C.push(w); } }
  if (!C.length) return null;
  const free = (u0, u1, dmax) => { const n = Math.max(4, Math.ceil((u1 - u0) / 0.1)); let m = dmax; for (let i = 0; i <= n; i++) { const [x, z] = P(rec, u0 + (u1 - u0) * i / n, 0);
    for (const b of C) { if (!b.pc && F.own(b, x, z, ox, oz)) continue; const e = rayBox(b, x, z, ox, oz, m); if (e < m) m = e; } if (m <= 0) return 0; } return m; };
  let any = false; const cp = free(0, rec.len, 0.2);
  const c = svcBays(rec.len, rec.ww, rec.ps).map((o) => { const e = EXT[o.t] || 0; const v = free(o.c - o.hw - e, o.c + o.hw + e, NF_NEAR); if (v >= NF_NEAR) return null; any = true; return fl(v); });
  if (!any && cp >= 0.08) return null; return { c, cp: cp < 0.08 ? fl(cp) : null }; }
// world quad of a piece (wall frame u0..u1 × −0.02..d)
const quadOf = (F, q) => [F.P(F.rec, q.u0, -0.02), F.P(F.rec, q.u1, -0.02), F.P(F.rec, q.u1, q.d), F.P(F.rec, q.u0, q.d)];
function sepAxis(A, B) { for (const Q of [A, B]) for (let i = 0; i < 4; i++) { const p = Q[i], q = Q[(i + 1) % 4]; const nx = q[1] - p[1], nz = p[0] - q[0];
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const v of A) { const t = v[0] * nx + v[1] * nz; a0 = Math.min(a0, t); a1 = Math.max(a1, t); } for (const v of B) { const t = v[0] * nx + v[1] * nz; b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
  if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return true; } return false; }
export const quadsHit = (A, B) => !sepAxis(A, B);
// pass 2: pieces of two faces facing each other across a narrow slot: when they overlap, each side keeps half the free depth (a fixed
// face — the hand-built core, already built — keeps its pieces and the other side gives way by their depth). L = [{ F, fx, fixed }]
export function nfPairs(L) { const K = 4; const grid = new Map(); const ents = [];
  for (const e of L) { if (!e.fx) continue; const [ux, uz] = e.F.P.dir(e.F.rec); const l = Math.hypot(ux, uz); e.n = [-uz / l, ux / l];
    for (const q of svcPieceList(e.F.rec.len, e.F.rec.ww, e.F.rec.ps, e.fx)) { if (q.i < 0) continue; const Q = quadOf(e.F, q); const it = { e, q, Q }; ents.push(it);
      const xs = Q.map((v) => v[0]), zs = Q.map((v) => v[1]); for (let ix = Math.floor(Math.min(...xs) / K); ix <= Math.floor(Math.max(...xs) / K); ix++) for (let iz = Math.floor(Math.min(...zs) / K); iz <= Math.floor(Math.max(...zs) / K); iz++) { const k = ix + ',' + iz; let g = grid.get(k); if (!g) grid.set(k, g = []); g.push(it); } } }
  const cut = new Map(); let n = 0;
  for (const it of ents) { if (it.e.fixed) continue; const seen = new Set(); const xs = it.Q.map((v) => v[0]), zs = it.Q.map((v) => v[1]);
    for (let ix = Math.floor(Math.min(...xs) / K); ix <= Math.floor(Math.max(...xs) / K); ix++) for (let iz = Math.floor(Math.min(...zs) / K); iz <= Math.floor(Math.max(...zs) / K); iz++) for (const o of grid.get(ix + ',' + iz) || []) {
      if (o.e === it.e || seen.has(o) || o.e.F.self && o.e.F.self === it.e.F.self) continue; seen.add(o);
      if (it.e.n[0] * o.e.n[0] + it.e.n[1] * o.e.n[1] > -0.5) continue; if (it.q.yb <= o.q.ya || o.q.yb <= it.q.ya) continue; if (!quadsHit(it.Q, o.Q)) continue;
      const c = it.e.fx.c[it.q.i]; if (c == null) continue; const v = o.e.fixed ? c - o.q.d : (c + NF_MARGIN) / 2; const k = it.e; let m = cut.get(k); if (!m) cut.set(k, m = new Map());
      if (!m.has(it.q.i) || v < m.get(it.q.i)) m.set(it.q.i, v); } }
  for (const [e, m] of cut) for (const [i, v] of m) { e.fx.c[i] = Math.max(0, Math.floor(Math.min(e.fx.c[i], v) * 1000) / 1000); n++; }
  return n; }
