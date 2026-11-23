// a_streetnames (map 索拉纳港 only): the ONE street-name table for the island grid. Pure JS (no three.js) so mapapi.js can
// use it in Node tests too. Every printed street name on map A reads from here:
//   - street.js     green blades on the signal mast arms
//   - signage.js    blue corner name posts, 路口预告 gantry boards, bus route names (7 路 xx线)
//   - mapapi.js     nearestRoad().name for the grid roads (logic layer)
// NS names follow the HUD area label (src/hud.js AREAS: x 0..110 华盛顿大道, 110..230 珊瑚大街, 230..335 海潮大道); where an
// older table disagreed with the HUD (椰影大道 for x = 50), the HUD wins. The HUD has no east-west names; those are a_signage's.
export const NS_NAME = { 50: '华盛顿大道', 170: '珊瑚大街', 290: '海潮大道' };
export const NS_PY = { 50: 'HUASHENGDUN DADAO', 170: 'SHANHU DAJIE', 290: 'HAICHAO DADAO' };
export const EW_NAME = { '-300': '鹈鹕街', '-150': '海葡萄路', 0: '日光大街', 150: '贝壳路', 300: '灯塔路' };
export const EW_PY = { '-300': 'TIHU JIE', '-150': 'HAIPUTAO LU', 0: 'RIGUANG DAJIE', 150: 'BEIKE LU', 300: 'DENGTA LU' };
/** street name of a grid road: axis 'z' (north-south, keyed by x) or 'x' (east-west, keyed by z); null off the grid */
export const gridName = (axis, c) => (axis === 'z' ? NS_NAME[c] : EW_NAME[c]) || null;
