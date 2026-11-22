// b_alleyface (Hark modelling lane, 2026-11-22): service frontage (背街服务立面) for the ground floor of the hand-built Deco core
// where it faces the mid-block alleys, the back yards and the gaps between buildings instead of a street. city.js volume() gives
// those store-band edges facade style 6 (same 'building' program; the GLSL branch is in mats.js, 霓港 only) and adds a few real
// pieces (shutter housings, door hoods, hatch sills, meter cabinets) to the existing vcol bucket; alley.js keeps its wall fixtures
// off the openings. The bay plan is a pure integer rule shared by JS and GLSL (no rng): bay k of an edge with pattern seed ps
// (0..10) gets v = (7k + ps) mod 11 -> type. Keep this file and the style-6 branch in mats.js in step.
export const AF_OFF = typeof location !== 'undefined' && /[?&]noalleyface\b/.test(location.search); // test switch: old glass shop band all round
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
