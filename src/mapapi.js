// r6.0 map query API for the logic layer (game / missions / police / economy). Pure JS, no three.js: works in the browser and
// in Node tests. Same functions for BOTH maps; they answer for the active map (src/mapsel.js), or the one picked with useMap().
//   import { getPOIs, nearestRoad, roadPointAhead, districtAt, isOnLand, randomRoadPoint, roadNetwork, useMap, currentMap } from './mapapi.js';
// Implementations: src/maps/gta/mapapi.js (索拉纳港, ribbon roads + Deco grid) and src/maps/cyber/mapapi.js (霓港, road graph).
import { MAP } from './mapsel.js';
import * as GTA from './maps/gta/mapapi.js';
import * as CY from './maps/cyber/mapapi.js';
let cur = MAP;
const I = () => (cur === 'cyber' ? CY : GTA);
/** 'gta' | 'cyber' */
export const currentMap = () => cur;
/** Node tests: answer for another map ('gta' | 'cyber'). In the browser the active map is fixed at start. */
export function useMap(id) { cur = id === 'cyber' ? 'cyber' : 'gta'; return cur; }
export const getPOIs = (...a) => I().getPOIs(...a);
export const nearestRoad = (...a) => I().nearestRoad(...a);
export const roadPointAhead = (...a) => I().roadPointAhead(...a);
export const districtAt = (...a) => I().districtAt(...a);
export const isOnLand = (...a) => I().isOnLand(...a);
export const randomRoadPoint = (...a) => I().randomRoadPoint(...a);
export const roadNetwork = (...a) => I().roadNetwork(...a);
