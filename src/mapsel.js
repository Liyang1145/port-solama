// r6.0 map selection. The game ships two maps that share every gameplay system (src/*.js):
//   'gta'   = 索拉纳港 Port Solana — realistic day & night (src/maps/gta/)
//   'cyber' = 霓港 Neoport — cyberpunk night city (src/maps/cyber/)
// The choice is made BEFORE the game bundle runs (index.html start menu / ?map= / #map=), so modules may read MAP at load.
// Node (tests, tools) defaults to 'gta'; set globalThis.__PS_MAP = 'cyber' before importing to load the other map.
function detect() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  let m = g.__PS_MAP;
  if (!m && typeof location !== 'undefined') {
    try { m = new URLSearchParams(location.search).get('map') || (location.hash.match(/map=(\w+)/) || [])[1]; } catch (e) { }
  }
  return m === 'cyber' ? 'cyber' : 'gta';
}
export const MAP = detect();
export const CYBER = MAP === 'cyber';
export const MAP_NAME = CYBER ? '霓港' : '索拉纳港';
