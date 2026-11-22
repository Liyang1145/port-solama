// a_yardcol (map 索拉纳港 only): colliders for the mainland back-yard hedges and the yard trees / palms, and fitted trunk shapes for
// every fabric tree / palm (street, lot and yard alike) instead of a_edgewalls' square boxes.
//  - runs at the same point as a_edgewalls' collectTrunks: after curbfix -> propfix -> parkfix -> edgewalls (the curbbake / parkbake
//    input hashes are already taken), reads the final records only and draws no random numbers.
//  - trunk: fabric.js draws a 5-sided cylinder (vertex radius 0.24 at the base, 0.16 at the top). Its footprint at the collision
//    height (y 0.5, where col.resolve tests) is approximated by two mirrored oriented boxes, the best two-box fit of a regular
//    pentagon (least missed + 2x excess area, mirror-symmetric about the vertex axis): excess outside the pentagon <= 0.09 R
//    (the old square overhung by up to 0.58 R), pentagon tips left out <= 0.26 R. Trees are not rotated (vertex on +z); palms turn
//    with their yaw and the boxes follow their lean (offset taken at y 0.8). Canopies / fronds get nothing.
//  - hedge (kind 6 body: the lot back-line hedges, after a_edgewalls trimmed the ones inside the arterial walls): one oriented box,
//    exactly the drawn slab (w x d, full height).
//  - all of it goes into a_edgewalls' 8 m trunk grid (attachStreetColliders); a box is filed in every cell its AABB touches and a
//    per-query stamp keeps it from being returned twice, so 20 m hedges do not widen every query.
// &noyardcol: a_edgewalls' behaviour (square street trunk boxes, no yard trees, no hedges) in the same build.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const YARD_OFF = Q.has('noyardcol');
// two-box pentagon fit, vertex radius 1, vertex on +z: [cx, cz, ang, hl, hw] and its mirror (-cx, cz, -ang)
const PF = [0.1276, -0.0158, 0.3207, 0.6812, 0.6634];
const YH = 0.5; // collision test height (col.resolve y for people / cars)
export const YTAGS = ['ftree', 'fpalm', 'ytree', 'ypalm', 'hedge'];
// out: flat array, stride 8 [cx, cz, ux, uz, hl, hw, h, tag]
function pent(out, x, z, R, yaw, h, tag) { const cb = Math.cos(yaw), sb = Math.sin(yaw);
  for (const m of [1, -1]) { const px = PF[0] * m * R, pz = PF[1] * R, a = PF[2] * m + yaw; out.push(x + px * cb + pz * sb, z - px * sb + pz * cb, Math.cos(a), -Math.sin(a), PF[3] * R, PF[4] * R, h, tag); } }
// palm instance: Euler(p4, p3, p5) order XYZ applied to (0, y, 0)
function lean(p, y) { const a = p[4], b = p[3], c = p[5]; const x1 = -y * Math.sin(c), y1 = y * Math.cos(c); const x2 = x1 * Math.cos(b), z2 = -x1 * Math.sin(b); const z3 = y1 * Math.sin(a) + z2 * Math.cos(a); return [x2, z3]; }
export function collectYardCol(fab, yard) { if (YARD_OFF || !fab || !fab.chunks) return null; const T0 = performance.now(); const A = []; const S = { ftree: 0, fpalm: 0, ytree: 0, ypalm: 0, hedge: 0, boxes: 0, ms: 0 };
  for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue;
    for (const t of I.tree) { if (t.gone) continue; const y = yard && yard.has(t); const s = 0.75 + t[2] * 0.12, H = t[3] + t[2] * 0.4; const R = s * (0.24 - 0.08 * Math.min(1, YH / H));
      pent(A, t[0], t[1], R, 0, H, y ? 2 : 0); S[y ? 'ytree' : 'ftree']++; }
    for (const p of I.palm) { if (p.gone) continue; const y = yard && yard.has(p); const s = p[2] / 10; const R = 0.24 * s - 0.08 * YH / 9.4; const o = lean(p, 0.8);
      pent(A, p[0] + o[0], p[1] + o[1], R, p[3], 9.4 * s, y ? 3 : 1); S[y ? 'ypalm' : 'fpalm']++; }
    for (const b of I.body) { if (b[10] !== 6 || b.gone) continue; A.push(b[0], b[2], Math.cos(b[6]), -Math.sin(b[6]), b[3] / 2, b[5] / 2, b[1] + b[4], 4); S.hedge++; } }
  S.boxes = A.length / 8; S.ms = Math.round(performance.now() - T0); return { A: new Float32Array(A), S }; }
// boxes into the trunk grid: cells = Array over [I0, I0+NI) x [K0, K0+NK), each box in every cell its AABB touches
export function fileYardBoxes(Y, push) { const A = Y.A; for (let i = 0; i < A.length; i += 8) { const cx = A[i], cz = A[i + 1], ux = A[i + 2], uz = A[i + 3], hl = A[i + 4], hw = A[i + 5];
    const ex = Math.abs(ux) * hl + Math.abs(uz) * hw, ez = Math.abs(uz) * hl + Math.abs(ux) * hw;
    push({ minX: cx - ex, minZ: cz - ez, maxX: cx + ex, maxZ: cz + ez, h: A[i + 6], tag: YTAGS[A[i + 7]], o: { cx, cz, ux, uz, hl, hw } }); } }
