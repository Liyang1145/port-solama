// v4.4 world definition (MAP_DESIGN.md). ONE data file drives the game (roads, coastlines, districts, streamed parcels, POI
// triggers, minimap) and tools/mapgen.cjs (the top-down design map), so the design doc, the map image and the game never disagree.
// Pure data + tiny geometry helpers, no three.js import (node can import it). All names are original.
// Coordinates: metres, x east, z north (+z is "up" on the map). The v4.0–4.3 Deco district (x −22…335, z ±372) is kept exactly.

// ------------------------------------------------------------------ helpers ----
export function catmull(pts, step = 8, closed = false) {
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[pts.length - 1].slice());
  return out;
}
export function ellipse(cx, cz, rx, rz, n = 28, rot = 0) { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const x = Math.cos(a) * rx, z = Math.sin(a) * rz; o.push([cx + x * Math.cos(rot) - z * Math.sin(rot), cz + x * Math.sin(rot) + z * Math.cos(rot)]); } return o; }
export function rectPoly(cx, cz, hx, hz, rot = 0) { const c = Math.cos(rot), s = Math.sin(rot); return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c]); }
export function inPoly(x, z, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins; }
  return ins;
}
export function polyBox(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return [a, b, c, d]; }

// ------------------------------------------------------------- coastline ----
// inner edge of the beach sand on the Atlantic side of 光栅岛, as x(z). Exactly 335 inside the Deco district.
const BEACH_CP = [[-1480, 175], [-1300, 250], [-1000, 305], [-700, 330], [-372, 335], [372, 335], [700, 342], [1100, 362], [1500, 392], [1900, 428], [2300, 468], [2650, 505]];
export const BEACH_Z = [-1480, 2650];
const BEACH_S = catmull(BEACH_CP.map(([z, x]) => [z, x]), 10);
export function beachX(z) {
  if (Math.abs(z) <= 372) return 335;
  if (z <= BEACH_S[0][0]) return BEACH_S[0][1]; if (z >= BEACH_S[BEACH_S.length - 1][0]) return BEACH_S[BEACH_S.length - 1][1];
  let lo = 0, hi = BEACH_S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BEACH_S[m][0] <= z) lo = m; else hi = m; }
  const a = BEACH_S[lo], b = BEACH_S[hi]; const t = (z - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * t;
}
export const BEACH_W = 205; // sand + shallow shelf modelled east of beachX (waterline ≈ +80 m)

// 光栅岛 (barrier island): east edge = beach inner edge, bay side drawn by hand (Deco district seawall x = −22 kept straight)
const westShore = [[90, 2660], [30, 2520], [-20, 2380], [-120, 2280], [-175, 2120], [-190, 1900], [-180, 1650], [-140, 1450], [-80, 1300], [-55, 1150], [-50, 1000], [-45, 850], [-35, 650], [-25, 480], [-22, 372],
  [-22, -372], [-28, -480], [-55, -620], [-85, -780], [-95, -940], [-70, -1100], [-20, -1240], [50, -1360], [110, -1450], [175, -1480]];
const eastShore = []; for (let z = BEACH_Z[0]; z <= BEACH_Z[1]; z += 50) eastShore.push([beachX(z), z]);
// finger canals cut into the canal-home district: notches in the island outline, open to the bay at the west end
export const CANALS = [2200, 2080, 1960, 1840, 1720, 1600, 1480].map((z) => ({ z, x1: 40, hw: 13 }));
function shoreXAt(z) { for (let i = 0; i < westShore.length - 1; i++) { const a = westShore[i], b = westShore[i + 1]; if ((a[1] - z) * (b[1] - z) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]); } return -150; }
const westNotched = [];
for (let i = 0; i < westShore.length; i++) {
  const p = westShore[i]; const q = westShore[i + 1];
  if (!(p[1] <= 2280 && p[1] >= 1450 && CANALS.some((c) => Math.abs(p[1] - c.z) < c.hw + 4))) westNotched.push(p);
  if (q) for (const c of CANALS) if (p[1] > c.z && q[1] <= c.z) { // going south across the canal axis: cut the notch
    const zt = c.z + c.hw, zb = c.z - c.hw; westNotched.push([shoreXAt(zt), zt], [c.x1, zt], [c.x1, zb], [shoreXAt(zb), zb]); }
}
export const ISLAND = [...eastShore, [505, 2650], [470, 2720], [400, 2765], [300, 2780], [180, 2740], ...westNotched];

export const LANDS = [
  { id: 'island', name: '光栅岛', poly: ISLAND, mat: 'grass' },
  // v4.5: the wild terrain rectangle (雨林 + 草原, src/nature.js) is notched out of the mainland cap: it has its own height-field mesh
  { id: 'mainland', name: '大陆 · 湾区', poly: [[-1420, 3300], [-1440, 2400], [-1480, 1600], [-1450, 1120], [-1500, 700], [-1470, 300], [-1520, -100], [-1480, -260], [-1530, -500], [-1500, -700], [-1560, -900], [-1620, -1200], [-1700, -1700], [-4200, -1700], [-4200, 3300], [-3420, 3300], [-3420, 1330], [-1650, 1330], [-1650, 3300]], mat: 'grass', wildNotch: true },
  { id: 'wild', name: '大陆 · 北部荒野', poly: [[-1650, 1330], [-1650, 3650], [-3420, 3650], [-3420, 1330]], mat: 'none', noCap: true },
  { id: 'goldpalm', name: '镀金岛', poly: ellipse(-640, -205, 200, 118, 36), mat: 'grass' },
  { id: 'sail1', name: '信标列岛 · 东岛', poly: rectPoly(-330, 1060, 112, 50, 0.02), mat: 'grass' },
  { id: 'sail2', name: '信标列岛 · 中岛', poly: rectPoly(-610, 1075, 112, 50, 0.05), mat: 'grass' },
  { id: 'sail3', name: '信标列岛 · 西岛', poly: rectPoly(-890, 1092, 112, 50, 0.07), mat: 'grass' },
  { id: 'golf', name: '全息高尔夫岛', poly: ellipse(-640, 1860, 265, 195, 40, 0.25), mat: 'grass' },
  { id: 'port', name: '货柜港', poly: [[-1400, -760], [-980, -715], [-880, -760], [-860, -820], [-880, -985], [-1420, -1015]], mat: 'concrete' },
  { id: 'southkey', name: '南礁（远景）', poly: ellipse(260, -1900, 380, 150, 30, -0.35), mat: 'grass', far: true },
  { id: 'northkey', name: '北光滩（远景）', poly: [[560, 2900], [700, 4200], [120, 4200], [130, 2900]], mat: 'grass', far: true },
];

// ----------------------------------------------------------------- roads ----
// kind: 'ave' 4-lane (aRd 0, hw 7) · 'cw' 6-lane causeway (aRd 3, hw 10.5) · 'res' 2-lane (aRd 2, hw 4.5). smooth = Catmull-Rom.
// Roads are split into a graph wherever they cross or touch (src/roads.js); Deco district streets join at z = ±372 and (−22, 0).
const rv = (cx, cz, r, n = 24) => ellipse(cx, cz, r, r, n);
export const ROADS = [
  // --- 光栅岛 south of the Deco district
  { id: 'tide_s', name: '脉冲大道南段', kind: 'ave', smooth: true, pts: [[290, -372], [289, -560], [287, -760], [272, -1000], [238, -1200], [190, -1281]] },
  { id: 'coral_s', name: '电路大街南段', kind: 'ave', smooth: true, pts: [[170, -372], [172, -560], [165, -800], [150, -1050], [165, -1283]] },
  { id: 'coco_s', name: '霓影大道南段', kind: 'res', smooth: true, pts: [[50, -372], [44, -560], [18, -760], [-20, -930]] },
  { id: 's_520', name: '南一街', kind: 'res', pts: [[-15, -520], [44, -520], [172, -520], [289, -520]] },
  { id: 's_diag', name: '南斜街', kind: 'res', pts: [[18, -760], [140, -880], [272, -1000]] },
  { id: 's_850', name: '南港路', kind: 'res', pts: [[-70, -850], [10, -850], [175, -850]] },
  { id: 'ring_s', name: '南端环岛', kind: 'res', closed: true, smooth: true, pts: rv(178, -1300, 22, 10) },
  { id: 's_park', name: '南端公园路', kind: 'res', pts: [[170, -1321], [150, -1390], [120, -1420]] },
  // --- 光栅岛 north of the Deco district
  { id: 'tide_n', name: '脉冲大道北段', kind: 'ave', smooth: true, pts: [[290, 372], [292, 520], [297, 800], [317, 1100], [334, 1320], [347, 1500], [370, 1790], [384, 1905], [423, 2300], [450, 2560], [405, 2675], [300, 2700]] },
  { id: 'coral_n', name: '电路大街北段', kind: 'ave', smooth: true, pts: [[170, 372], [168, 600], [178, 900], [200, 1250], [222, 1600], [236, 1736]] },
  { id: 'coral_n2', name: '电路大街北段', kind: 'ave', smooth: true, pts: [[252, 1784], [275, 2050], [310, 2400], [330, 2560]] },
  { id: 'n_2560', name: '北端路', kind: 'res', pts: [[330, 2560], [450, 2560]] },
  { id: 'coco_n', name: '霓影斜街', kind: 'res', smooth: true, pts: [[50, 372], [46, 560], [70, 800], [110, 1055]] },
  { id: 'n_700', name: '北一街', kind: 'res', pts: [[-30, 690], [56, 694], [170, 700], [297, 722]] },
  { id: 'n_1350', name: '弯月街', kind: 'res', smooth: true, pts: [[100, 1350], [205, 1300], [334, 1322]] },
  { id: 'ring_n', name: '风扇环岛', kind: 'ave', closed: true, smooth: true, pts: rv(244, 1760, 24, 10) },
  { id: 'n_1760w', name: '风扇街', kind: 'res', pts: [[95, 1780], [220, 1764]] },
  { id: 'n_1760e', name: '风扇街', kind: 'res', pts: [[268, 1764], [372, 1800]] },
  { id: 'n_2140', name: '北湾街', kind: 'res', pts: [[95, 2140], [279, 2120], [415, 2200]] },
  { id: 'canal_c', name: '运河路', kind: 'res', smooth: true, pts: [[110, 1055], [100, 1300], [95, 1500], [95, 2300]] },
  ...[1540, 1660, 1900, 2020].map((z, i) => ({ id: 'cul' + i, name: '运河巷', kind: 'res', culdesac: true, pts: [[95, z], [-135, z]] })),
  { id: 'cul_1780', name: '运河巷', kind: 'res', culdesac: true, pts: [[95, 1780], [-135, 1780]] },
  { id: 'cul_2140', name: '运河巷', kind: 'res', culdesac: true, pts: [[95, 2140], [-135, 2140]] },
  // --- 零点堤道 (south causeway) + 镀金岛
  { id: 'cw1', name: '零点堤道', kind: 'cw', smooth: true, pts: [[-22, 0], [-150, 0], [-330, -15], [-500, -38], [-640, -45], [-800, -50], [-1000, -90], [-1200, -170], [-1380, -238], [-1561, -262]] },
  { id: 'gp_br', name: '镀金桥', kind: 'res', pts: [[-640, -45], [-640, -135]] },
  { id: 'gp_ring', name: '镀金环路', kind: 'res', closed: true, smooth: true, pts: ellipse(-640, -205, 130, 70, 16) },
  { id: 'gp_mid', name: '镀金中路', kind: 'res', culdesac: true, pts: [[-640, -275], [-640, -205], [-560, -205]] },
  // --- 信标堤道 (north causeway) across 信标列岛
  { id: 'cw2', name: '信标堤道', kind: 'cw', smooth: true, pts: [[110, 1055], [-50, 1050], [-200, 1055], [-330, 1060], [-470, 1068], [-610, 1075], [-750, 1083], [-890, 1092], [-1100, 1102], [-1300, 1112], [-1542, 1125]] },
  { id: 'cw2_e', name: '信标堤道东延', kind: 'res', smooth: true, pts: [[110, 1055], [200, 1070], [317, 1100]] },
  ...[[-330, 1060, 0.02], [-610, 1075, 0.05], [-890, 1092, 0.07]].flatMap(([cx, cz], i) => [-60, 55].map((dx, k) => ({ id: `sail${i}${k}`, name: '信标巷', kind: 'res', culdesac: true, pts: [[cx + dx, cz - 40], [cx + dx, cz + 40]] }))),
  // --- 全息高尔夫岛 access
  { id: 'golf_rd', name: '全息桥', kind: 'res', smooth: true, pts: [[95, 2300], [-60, 2290], [-200, 2240], [-360, 2140], [-482, 2014]] },
  { id: 'golf_loop', name: '会所环路', kind: 'res', closed: true, smooth: true, pts: rv(-500, 1990, 30, 10) },
  // --- 大陆 · 数据核心区 (downtown): tilted avenues, uneven cross streets, one diagonal, bayfront boulevard
  { id: 'bay_blvd', name: '霓滨大道', kind: 'ave', smooth: true, pts: [[-1542, 1125], [-1560, 900], [-1546, 600], [-1552, 300], [-1575, 0], [-1561, -262], [-1588, -500], [-1600, -700], [-1610, -860], [-1655, -1120]] },
  ...[-1700, -1830, -1975, -2130].map((b, i) => ({ id: 'dt_ave' + i, name: ['一号大道', '二号大道', '三号大道', '四号大道'][i], kind: i === 1 ? 'ave' : 'res', pts: [[b + 0.08 * 760, -760], [b + 0.08 * 300, -300], [b - 0.08 * 300, 300], [b - 0.08 * 720, 720]] })),
  ...[[-700, 'res'], [-560, 'ave'], [-420, 'res'], [-120, 'res'], [40, 'ave'], [220, 'res'], [420, 'res'], [650, 'res']].map(([z, k], i) => ({ id: 'dt_st' + i, name: '湾区' + ['七', '六', '五', '三', '二', '一', '北一', '北二'][i] + '街', kind: k, pts: [[-1528, z + 4], [-2230, z - 30]] })),
  { id: 'dt_sun', name: '零点大道', kind: 'ave', pts: [[-1561, -262], [-1800, -275], [-2230, -300]] },
  { id: 'dt_diag', name: '斜光大道', kind: 'ave', pts: [[-2200, -760], [-1900, -220], [-1640, 260], [-1549, 420]] },
  // --- v4.5 北岸公路 + 草原 / 雨林 (src/nature.js): rural 2-lane roads ('rur', no sidewalks) through the wild terrain
  { id: 'coast_n', name: '北岸公路', kind: 'ave', smooth: true, pts: [[-1542, 1125], [-1575, 1450], [-1605, 1800], [-1600, 2200], [-1575, 2600], [-1585, 3000], [-1610, 3240]] },
  { id: 'prairie_rd', name: '电穗草原路', kind: 'rur', smooth: true, pts: [[-1605, 1800], [-1760, 1790], [-1950, 1735], [-2200, 1820], [-2450, 1940], [-2700, 1850], [-2950, 1720], [-3200, 1790], [-3360, 1900]] },
  { id: 'prairie_n', name: '野花小路', kind: 'rur', smooth: true, pts: [[-2450, 1940], [-2420, 2080], [-2330, 2200], [-2250, 2330], [-2140, 2470], [-2060, 2560]] },
  { id: 'forest_rd', name: '雾网雨林路', kind: 'rur', smooth: true, pts: [[-1575, 2600], [-1760, 2620], [-1920, 2700], [-2060, 2660], [-2200, 2720], [-2330, 2800], [-2480, 2760], [-2650, 2840], [-2820, 2790], [-3000, 2860], [-3150, 2950], [-3300, 2920]] },
  { id: 'falls_rd', name: '瀑布小径', kind: 'rur', culdesac: true, smooth: true, pts: [[-2330, 2800], [-2380, 2880], [-2440, 2950], [-2470, 3005]] },
  // --- 货柜港 (cargo + cruise port) bridge and quay roads
  { id: 'port_br', name: '货柜港大桥', kind: 'ave', pts: [[-1608, -850], [-1480, -862], [-1360, -870]] },
  { id: 'port_q', name: '码头路', kind: 'res', pts: [[-1360, -870], [-1100, -870], [-930, -860]] },
  { id: 'port_n', name: '邮轮码头路', kind: 'res', culdesac: true, pts: [[-1200, -870], [-1200, -770]] },
];

// ------------------------------------------------------------- districts ----
// style drives the streamed parcel generator (src/stream.js) and the far impostors: deco, mid, condo, canal, mansion, villa,
// downtown, port, lowrise (far only), park/golf (no buildings). poly = where parcels of that style may be placed.
export const DISTRICTS = [
  { id: 'south', name: '南光滩区', style: 'mid', poly: [[-60, -380], [300, -380], [300, -1250], [-60, -1250]] },
  { id: 'southdeco', name: '南光滩 Deco', style: 'deco', poly: [[230, -380], [330, -380], [330, -1150], [230, -1150]] },
  { id: 'spark', name: '南端公园', style: 'park', poly: [[40, -1250], [330, -1250], [330, -1500], [40, -1500]] },
  { id: 'northdeco', name: '北光滩 Deco', style: 'deco', poly: [[225, 380], [360, 380], [360, 1000], [225, 1000]] },
  { id: 'north', name: '北光滩区', style: 'mid', poly: [[-60, 380], [225, 380], [225, 1340], [-60, 1340]] },
  { id: 'condo', name: '霓塔带', style: 'condo', poly: [[260, 1000], [520, 1000], [520, 2720], [260, 2720]] },
  { id: 'canal', name: '运河格子区', style: 'canal', poly: [[-200, 1360], [260, 1360], [260, 2320], [-200, 2320]] },
  { id: 'goldpalm', name: '镀金岛', style: 'mansion', poly: ellipse(-640, -205, 196, 114, 36) },
  { id: 'sail', name: '信标列岛', style: 'villa', poly: [[-1010, 1000], [-210, 1000], [-210, 1150], [-1010, 1150]] },
  { id: 'golf', name: '全息高尔夫', style: 'golf', poly: ellipse(-640, 1860, 265, 195, 40, 0.25) },
  { id: 'downtown', name: '数据核心区', style: 'downtown', poly: [[-1555, -760], [-1540, 760], [-2240, 760], [-2240, -760]] },
  { id: 'dtpark', name: '核心区公园', style: 'park', poly: [[-1830, -120], [-1975, -120], [-1975, 40], [-1830, 40]] },
  { id: 'bayside', name: '芯湾区', style: 'mid', poly: [[-1520, 760], [-1520, 1300], [-2240, 1300], [-2240, 760]] },
  { id: 'port', name: '货柜港', style: 'port', poly: [[-1400, -760], [-880, -760], [-880, -1000], [-1400, -1000]] },
  { id: 'dtsouth', name: '南港区', style: 'mid', poly: [[-1560, -760], [-1560, -1150], [-2240, -1150], [-2240, -760]] },
  { id: 'prairie', name: '电穗草原', style: 'prairie', poly: [[-1650, 1330], [-1650, 2380], [-3420, 2380], [-3420, 1330]] },
  { id: 'forest', name: '雾网雨林', style: 'forest', poly: [[-1650, 2380], [-1650, 3650], [-3420, 3650], [-3420, 2380]] },
  { id: 'cane', name: '旧城区（远景 · 第 2 期）', style: 'lowrise', far: true, poly: [[-2240, -1100], [-2240, 1300], [-3200, 1300], [-3200, -1100]] },
  { id: 'northkey', name: '北光滩（远景）', style: 'condo', far: true, poly: [[150, 2950], [650, 2950], [650, 4000], [150, 4000]] },
];

// ----------------------------------------------------------- points of interest ----
// face = outward normal (x sign) of the shopfront the counter marker stands in front of (2 m out from the facade).
export const POI = {
  gunshop: { x: 160.5, z: -100, name: '赛博枪械坊', icon: '枪', col: '#e04a3a', face: 1 },
  stores: [
    { id: 'A', x: 59.5, z: 50, name: '霓虹 24 小时', icon: '店', col: '#2f9e5b', face: -1 },
    { id: 'B', x: 179.5, z: -225, name: '零点便利', icon: '店', col: '#2f9e5b', face: -1 },
  ],
  clothes: { x: 179.5, z: 100, name: '光纤衣橱', icon: '衣', col: '#b04fc7', face: -1 },
  modshop: { x: 57, z: -225, name: '脉冲改装坊', icon: '修', col: '#3b7bd8', face: -1 },
  atms: [{ x: 160.5, z: -50 }, { x: 281, z: -30 }, { x: 59.5, z: 95 }],
  hospital: { x: 120, z: 75, yaw: Math.PI / 2, name: '义体医疗中心' },
  precinct: { x: -18, z: -225, yaw: 0, name: '第七治安局' },
  valet: { x: 281, z: 10, name: '代客泊车台' },
  depot: { x: 15, z: -335, name: '南湾冷链仓' },
  shipyard: { x: 12, z: 340, name: '北湾废船坞' },
  debt: { x: 175, z: 160, name: '电路大街北口' },
  lighthouse: { x: 528, z: -374, name: '灯塔' },
  wheel: { x: 384, z: 352, name: '霓虹之眼' },
  restaurants: [
    { x: 281, z: -120, name: '合成海鲜' }, { x: 281, z: 130, name: '夜班咖啡馆' }, { x: 183.5, z: -110, name: '自动卷饼站' }, { x: 59.5, z: 210, name: '霓虹鱼档' }, { x: 160.5, z: 240, name: '芯片面包房' },
  ],
};
// mission start markers (letters on the minimap)
export const MISSION_STARTS = [
  { id: 'rob', letter: 'R', name: '夜班收银', x: 59.5, z: 50 },
  { id: 'cold', letter: 'C', name: '冷链急送', x: 15, z: -335 },
  { id: 'debt', letter: 'D', name: '追债', x: 175, z: 160 },
  { id: 'gang', letter: 'G', name: '码头火并', x: 12, z: 340 },
];
// v4.4 named places for the map labels / phone map (no gameplay trigger)
export const LABELS = [
  { x: 312, z: 230, t: '脉冲大道', s: 15 }, { x: 420, z: 200, t: '荧光海滩', s: 18 }, { x: 110, z: 330, t: '霓影区', s: 15 }, { x: 230, z: 330, t: '电路大街', s: 15 },
  { x: 150, z: -700, t: '南光滩区', s: 18 }, { x: 200, z: -1420, t: '南端公园', s: 15 }, { x: 120, z: 900, t: '北光滩区', s: 18 }, { x: 400, z: 2000, t: '霓塔带', s: 15 },
  { x: -40, z: 1700, t: '运河格子区', s: 16 }, { x: -640, z: -330, t: '镀金岛', s: 16 }, { x: -620, z: 1180, t: '信标列岛', s: 16 }, { x: -640, z: 1700, t: '全息高尔夫岛', s: 16 },
  { x: -1880, z: -420, t: '数据核心区', s: 22 }, { x: -1140, z: -940, t: '货柜港（货运 / 邮轮）', s: 15 }, { x: -1900, z: 1000, t: '芯湾区', s: 16 }, { x: -2700, z: 200, t: '旧城区（第 2 期）', s: 15 },
  { x: -800, z: 450, t: '荧蓝湾', s: 26 }, { x: 800, z: 600, t: '外海', s: 24 }, { x: 250, z: -1650, t: '灯塔水道', s: 14 }, { x: 400, z: 2850, t: '北口水道', s: 14 },
  { x: -2500, z: 1600, t: '电穗草原', s: 20 }, { x: -2500, z: 3250, t: '雾网雨林', s: 20 }, { x: -2470, z: 3110, t: '雾溪瀑布', s: 12 }, { x: -2860, z: 3035, t: '雾湖', s: 12 },
  { x: -820, z: -10, t: '零点堤道', s: 13 }, { x: -1150, z: 1140, t: '信标堤道', s: 13 },
];

// v4.4 land test shared by the game (isLand / groundH) and the map tools. The island's east edge is the beach inner edge:
// the sand itself is handled by the beach height field (city.js beachH).
const _lb = LANDS.map((l) => polyBox(l.poly));
export function landAt(x, z) {
  for (let i = 0; i < LANDS.length; i++) { const b = _lb[i]; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (inPoly(x, z, LANDS[i].poly)) return LANDS[i]; }
  return null;
}
const _db = DISTRICTS.map((d) => polyBox(d.poly));
export function districtAt(x, z, farToo = false) {
  for (let i = 0; i < DISTRICTS.length; i++) { const d = DISTRICTS[i]; if (d.far && !farToo) continue; const b = _db[i]; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (inPoly(x, z, d.poly)) return d; }
  return null;
}
// v4.5 wild terrain (src/nature.js): bounds, the stream from the falls to the lake, the lake
export const WILD = { x0: -3420, x1: -1650, z0: 1330, z1: 3650 };
export const FALLS = { x: -2470, z: 3096, top: 27, pool: 3.0, w: 9 }; // falls lip at y = top, plunge pool level
export const LAKE = { x: -2860, z: 3035, rx: 95, rz: 58, y: 0.6 };
export const STREAM = [[-2470, 3096], [-2520, 3070], [-2590, 3040], [-2650, 3048], [-2720, 3030], [-2790, 3036]];
// the v4.0–4.3 hand-built Deco district (src/city.js LAYOUT) — streamed parcels never go here
export const DECO_CORE = { x0: -22, x1: 335, z0: -372, z1: 372 };
