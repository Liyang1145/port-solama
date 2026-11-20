// r6.0 facade: gameplay points of the ACTIVE map (POI, MISSION_STARTS). Each map keeps its own data in
// src/maps/<map>/mapdata.js; gameplay code (world.js, missions.js, hud.js, game.js) imports from here.
import { CYBER } from './mapsel.js';
import * as A from './maps/gta/mapdata.js';
import * as B from './maps/cyber/mapdata.js';
export const POI = CYBER ? B.POI : A.POI;
export const MISSION_STARTS = CYBER ? B.MISSION_STARTS : A.MISSION_STARTS;
