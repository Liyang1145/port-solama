// a_shopnight2 (map A): open / closed state of the storefront bands (buildingMaterial style 3: island 海滨大道 / 珊瑚大街, the bay-side
// condo bases and the mainland region low-rise shops such as 第八街) decided in JS instead of inside the facade shader, so every lit
// shop window can get its own sidewalk light pool and closed shops get none.
// Unit = 2 window bays (the shader's shop-room unit: floor(cid.x * 0.5)). Open bit per unit from its own hash sub-stream (k = 99,
// no rng draw), P(open) = 0.86 (the shader's old litChance). The bits ride in aWin.x = style + 8 * (1 + mask) (exact in float32 for
// <= 20 units per wall edge); edges with more units keep code 0 = the old in-shader hash and get no pools (counted in SHOPS.stats).
// ?oldashop2 = old behaviour (code 0 everywhere, shader text unchanged, no pools).
import { CYBER } from '../../mapsel.js';
export const OLD_ASHOP2 = CYBER || (typeof location !== 'undefined' && /[?&]oldashop2\b/.test(location.search));
export const SHOP_OPEN_P = 0.86, SHOP_MAXU = 20;
// pools: island list (props.js street-lamp pool mesh, the island already draws that program) and mainland list (strip.js K.pm, the
// fabGlow program the mainland fabric already draws). Records: x, z, angle, width, depth, y (6 floats, the K.walkPools layout).
export const SHOPS = { isl: [], ml: [], keys: new Set(), units: [], stats: { edges: 0, units: 0, open: 0, closed: 0, fallbackEdges: 0, fallbackUnits: 0 } };
const isIsland = (x, z) => x > -60 && x < 370 && Math.abs(z) < 400;
function h99(seed, e, u) { // integer hash of (seed, edge, unit), stream 99
  let h = Math.imul(Math.round(seed * 1e5) | 0, 0x27d4eb2d) ^ Math.imul(e + 1, 0x165667b1) ^ Math.imul(u + 7, 0x9e3779b1) ^ 99;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
// called by city.js facadeAttrs for a style-3 edge: returns the aWin.x value; registers the unit pools (deduplicated: region tiles rebuild)
export function shopEdge(style, p, q, len, nBays, seed, e, y0) {
  if (OLD_ASHOP2 || style !== 3) return style;
  const ww = len / nBays, nU = Math.ceil(nBays / 2); const key = `${p[0].toFixed(2)},${p[1].toFixed(2)},${q[0].toFixed(2)},${q[1].toFixed(2)},${y0.toFixed(2)}`;
  const fresh = !SHOPS.keys.has(key); if (fresh) { SHOPS.keys.add(key); SHOPS.stats.edges++; SHOPS.stats.units += nU; }
  if (nU > SHOP_MAXU) { if (fresh) { SHOPS.stats.fallbackEdges++; SHOPS.stats.fallbackUnits += nU; } return style; }
  let mask = 0; const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len, ox = -dz, oz = dx; // outward (prismWalls CCW)
  for (let u = 0; u < nU; u++) { const on = h99(seed, e, u) < SHOP_OPEN_P; if (on) mask += 2 ** u;
    if (!fresh) continue; const b0 = 2 * u, b1 = Math.min(nBays, 2 * u + 2), w = (b1 - b0) * ww, ac = (b0 + b1) / 2 * ww;
    const D = 4.0, cx = p[0] + dx * ac + ox * (0.22 + D / 2), cz = p[1] + dz * ac + oz * (0.22 + D / 2);
    const isl = isIsland(cx, cz); SHOPS.units.push([cx, cz, on ? 1 : 0, isl ? 1 : 0, +w.toFixed(2)]);
    if (on) { SHOPS.stats.open++; (isl ? SHOPS.isl : SHOPS.ml).push(cx, cz, Math.atan2(-dz, dx), w * 0.9, D, Math.max(y0, 0.15) + 0.04); } else SHOPS.stats.closed++; }
  return style + 8 * (1 + mask);
}
