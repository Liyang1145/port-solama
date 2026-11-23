// a_signage legend rasteriser, shared since a_strip (signage.js bus-stop / street signs, strip.js shop and pylon signs).
// draw(g, W, H) on a canvas pre-filled with pal[0]; every pixel snaps to the nearest palette colour; index 0 is "background"
// (not emitted). opts.drop(x, y) -> true removes the pixel (paint wear). Returns { W, H, rects: [x, y, w, h, ci], pal }.
import * as THREE from 'three';
export const FONT = '"WenQuanYi Zen Hei","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif';
let _cv = null, _cg = null; // one CPU-backed canvas reused for every legend (fast getImageData)
export function raster(W, H, pal, draw, opts = {}) {
  if (!_cv) { _cv = document.createElement('canvas'); _cg = _cv.getContext('2d', { willReadFrequently: true }); }
  const c = _cv; c.width = W; c.height = H; const g = _cg; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle'; draw(g, W, H);
  const d = g.getImageData(0, 0, W, H).data; const PC = pal.map((h) => { const cc = new THREE.Color(h); cc.convertLinearToSRGB(); return [cc.r * 255, cc.g * 255, cc.b * 255]; });
  const idx = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { let best = 0, bd = 1e9; for (let k = 0; k < PC.length; k++) { const dr = d[i * 4] - PC[k][0], dg = d[i * 4 + 1] - PC[k][1], db = d[i * 4 + 2] - PC[k][2]; const dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } } idx[i] = best; }
  if (opts.drop) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (idx[y * W + x] && opts.drop(x, y)) idx[y * W + x] = 0;
  const rects = []; let open = new Map();
  for (let y = 0; y < H; y++) {
    const next = new Map();
    for (let x = 0; x < W;) { const ci = idx[y * W + x]; if (!ci) { x++; continue; } let x1 = x; while (x1 + 1 < W && idx[y * W + x1 + 1] === ci) x1++;
      const key = x + ',' + x1 + ',' + ci; const r = open.get(key); if (r) { r[3]++; next.set(key, r); open.delete(key); } else { const nr = [x, y, x1 - x + 1, 1, ci]; rects.push(nr); next.set(key, nr); } x = x1 + 1; }
    open = next;
  }
  return { W, H, rects, pal: pal.map((h) => { const cc = new THREE.Color(h); return [cc.r, cc.g, cc.b]; }) };
}
