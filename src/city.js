// r6.0 facade: the active map's world builder. LAYOUT (the shared Deco beach district both maps keep at the origin) is
// identical in both maps. Map-specific code lives in src/maps/<map>/city.js.
import { CYBER } from './mapsel.js';
import { LAYOUT as LAYOUT_GTA, buildCity as buildGTA } from './maps/gta/city.js';
import { buildCity as buildCyber } from './maps/cyber/city.js';
import { GraphTraffic } from './maps/cyber/traffic.js';
export const LAYOUT = LAYOUT_GTA;
export function buildCity(scene, M, T) { const c = CYBER ? buildCyber(scene, M, T) : buildGTA(scene, M, T); c.mapId = CYBER ? 'cyber' : 'gta'; if (CYBER) c.TrafficClass = GraphTraffic; return c; }
