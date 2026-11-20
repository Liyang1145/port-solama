// face = outward normal (x sign) of the shopfront the counter marker stands in front of (2 m out from the facade).
// v4.3 map points of interest (MAP_DESIGN.md §4). One table drives the game (triggers, minimap icons) and tools/mapgen.cjs
// (top-down layout PNG), so the design doc, the map image and the game never disagree. All names are original.
export const POI = {
  gunshop: { x: 160.5, z: -100, name: '海岸枪械行', icon: '枪', col: '#e04a3a', face: 1 },
  stores: [
    { id: 'A', x: 59.5, z: 50, name: '椰林 24 小时', icon: '店', col: '#2f9e5b', face: -1 },
    { id: 'B', x: 179.5, z: -225, name: '海风便利', icon: '店', col: '#2f9e5b', face: -1 },
  ],
  clothes: { x: 179.5, z: 100, name: '潮汐衣橱', icon: '衣', col: '#b04fc7', face: -1 },
  modshop: { x: 57, z: -225, name: '快修车坊', icon: '修', col: '#3b7bd8', face: -1 },
  atms: [{ x: 160.5, z: -50 }, { x: 281, z: -30 }, { x: 59.5, z: 95 }],
  hospital: { x: 120, z: 75, yaw: Math.PI / 2, name: '海岸医疗中心' },
  precinct: { x: -18, z: -225, yaw: 0, name: '第七分局' },
  valet: { x: 281, z: 10, name: '代客泊车台' },
  depot: { x: 15, z: -335, name: '南湾货运站冷库' },
  shipyard: { x: 12, z: 340, name: '北湾旧船坞' },
  debt: { x: 175, z: 160, name: '珊瑚大街北口' },
  lighthouse: { x: 528, z: -374, name: '灯塔' },
  wheel: { x: 384, z: 352, name: '海风之眼' },
  restaurants: [
    { x: 281, z: -120, name: '蓝鲸海鲜' }, { x: 281, z: 130, name: '古巴咖啡馆' }, { x: 183.5, z: -110, name: '卷饼小站' }, { x: 59.5, z: 210, name: '炸鱼小馆' }, { x: 160.5, z: 240, name: '海盐面包房' },
  ],
};
// mission start markers (letters on the minimap)
export const MISSION_STARTS = [
  { id: 'rob', letter: 'R', name: '夜班收银', x: 59.5, z: 50 },
  { id: 'cold', letter: 'C', name: '冷链急送', x: 15, z: -335 },
  { id: 'debt', letter: 'D', name: '追债', x: 175, z: 160 },
  { id: 'gang', letter: 'G', name: '码头火并', x: 12, z: 340 },
];
