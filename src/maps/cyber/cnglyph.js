// b_neon_sign (Hark modelling lane, 2026-11-22): canvas text for map B signs WITHOUT the player's system CJK font.
// dist/assets/cnglyph.png is an offline-rendered atlas of only the characters the B sign modules use (tools/cnglyph.py,
// Noto Sans SC Bold, SIL OFL 1.1; see CREDITS.md). Latin / digits still go through fillText (bundled Anton / generic sans).
// The image starts loading when this module is evaluated (long before buildCity); a caller that paints before it arrives
// gets the old system-font fallback and registers a repaint with cnWhenReady().
import { CN_CELL, CN_COLS, CN_CHARS } from './cnglyph_chars.js';

const IDX = new Map(); Array.from(CN_CHARS).forEach((c, i) => IDX.set(c, i));
const EM = CN_CELL * 84 / 96; // glyph em inside a cell (tools/cnglyph.py: CELL 96, PX 84)
const FALLBACK = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","WenQuanYi Zen Hei",sans-serif';
let IMG = null, READY = false; const WAIT = [];
const flush = () => { for (const f of WAIT.splice(0)) { try { f(); } catch (e) { console.warn('cnglyph', e); } } };
function load() {
  if (IMG || typeof Image === 'undefined') return; const f = 'cnglyph.png';
  IMG = new Image(); let tried = 0;
  IMG.onload = () => { READY = true; flush(); };
  IMG.onerror = () => { if (!tried++ && !(window.__A && window.__A[f])) IMG.src = f; else WAIT.length = 0; }; // flattened host, else give up (fallback stays)
  IMG.src = (window.__A && window.__A[f]) || 'assets/' + f;
}
load();
export const cnReady = () => READY || !!(IMG && IMG.complete && IMG.naturalWidth && (READY = true));
// run fn once the atlas is decoded (immediately when it already is)
export function cnWhenReady(fn) { if (cnReady()) fn(); else WAIT.push(fn); }

let TMP = null;
const isCJK = (c) => IDX.has(c);
// split into runs of atlas glyphs / other text
function runs(t) { const o = []; for (const c of Array.from(t)) { const k = isCJK(c); if (o.length && o[o.length - 1].k === k) o[o.length - 1].s += c; else o.push({ k, s: c }); } return o; }
const latinFont = (px, fam) => `bold ${px}px ${fam || '"Anton", Impact, sans-serif'}`;
// width of t at size px (CJK advance = 1 em)
export function cnMeasure(g, t, px, fam) {
  if (!cnReady()) { g.font = `bold ${px}px ${FALLBACK}`; return g.measureText(t).width; }
  let w = 0; for (const r of runs(t)) { if (r.k) w += Array.from(r.s).length * px; else { g.font = latinFont(px, fam); w += g.measureText(r.s).width; } } return w;
}
// draw t centred vertically on y with the context's current fillStyle / shadow / globalAlpha; align 'center' | 'left' | 'right'
export function cnText(g, t, x, y, px, align = 'center', fam) {
  if (!cnReady()) { g.font = `bold ${px}px ${FALLBACK}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); return; }
  const w = cnMeasure(g, t, px, fam); let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const col = g.fillStyle; const s = px / EM, cs = CN_CELL * s;
  if (!TMP) { TMP = document.createElement('canvas'); TMP.width = TMP.height = CN_CELL; }
  const tg = TMP.getContext('2d');
  for (const r of runs(t)) {
    if (!r.k) { g.font = latinFont(px, fam); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(r.s, cx, y); cx += g.measureText(r.s).width; continue; }
    for (const c of Array.from(r.s)) {
      const i = IDX.get(c); const sx = (i % CN_COLS) * CN_CELL, sy = Math.floor(i / CN_COLS) * CN_CELL;
      tg.globalCompositeOperation = 'copy'; tg.drawImage(IMG, sx, sy, CN_CELL, CN_CELL, 0, 0, CN_CELL, CN_CELL);
      tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, CN_CELL, CN_CELL);
      g.drawImage(TMP, cx + px / 2 - cs / 2, y - cs / 2, cs, cs); cx += px;
    }
  }
}
