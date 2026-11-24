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
    { x: 281, z: -120, name: '蓝鲸海鲜' }, { x: 281, z: 130, name: '古巴咖啡馆' }, { x: 179.5, z: -110, name: '卷饼小站' }, { x: 59.5, z: 210, name: '炸鱼小馆' }, { x: 160.5, z: 240, name: '海盐面包房' },
  ],
};
// mission start markers (letters on the minimap)
// (r5.0 entries are appended from POI_R5 at the bottom of this file)
export const MISSION_STARTS = [
  { id: 'rob', letter: 'R', name: '夜班收银', x: 59.5, z: 50 },
  { id: 'cold', letter: 'C', name: '冷链急送', x: 15, z: -335 },
  { id: 'debt', letter: 'D', name: '追债', x: 175, z: 160 },
  { id: 'gang', letter: 'G', name: '码头火并', x: 12, z: 340 },
];

// ---------------------------------------------------------------------------------------------------------------
// r5.0 big map (MAP_DESIGN.md r5): barrier island with natural ends + 日光堤道 causeway + 星湾岛 artificial island +
// mainland 甘蔗区 / 湾畔 / 壁画仓库区. Control points only (pure data, no three.js): src/mapgeo.js turns them into
// dense paths, junctions, kerbs and building lots, used by the game (src/region.js), the minimap and tools/mapgen.cjs.
// Roads: kind 0 = 4-lane (hw 7), kind 2 = 2-lane (hw 4.5). Points are [x, z]. All names are original.
export const REGION = {
  sw: 4.5, // sidewalk width
  roads: [
    { id: 'sun', name: '日光堤道', kind: 0, hw: 7, causeway: true,
      pts: [[-22, 0], [-70, 0], [-150, 3], [-240, -14], [-330, -46], [-405, -64], [-480, -60], [-570, -42], [-680, -22], [-790, -6], [-880, 8], [-960, 16], [-1050, 24], [-1160, 38], [-1316, 56]] },
    { id: 'shore', name: '湾岸大道', kind: 0, hw: 7, pts: [[-958, -430], [-950, -300], [-962, -180], [-954, -60], [-958, 60], [-950, 180], [-964, 300], [-956, 430]] },
    { id: 'west', name: '西环路', kind: 0, hw: 7, pts: [[-1296, -430], [-1288, -200], [-1294, 0], [-1284, 200], [-1296, 430]] },
    { id: 'eighth', name: '第八街', kind: 2, hw: 4.5, pts: [[-1050, -400], [-1050, 323]] },
    { id: 'rail', name: '老铁路斜街', kind: 2, hw: 4.5, pts: [[-947, -312], [-1060, -228], [-1170, -138], [-1306, -32]] },
    { id: 'sugar', name: '糖厂街', kind: 2, hw: 4.5, pts: [[-946, -120], [-1000, -110], [-1070, -116], [-1150, -100], [-1230, -78], [-1306, -70]] },
    { id: 'moon', name: '月牙路', kind: 2, hw: 4.5, pts: [[-1044, 196], [-1110, 248], [-1190, 262], [-1258, 232], [-1306, 168]] },
    { id: 'mural', name: '壁画街', kind: 2, hw: 4.5, pts: [[-947, 318], [-1050, 322], [-1160, 342], [-1306, 352]] },
    { id: 'south', name: '南码头路', kind: 2, hw: 4.5, pts: [[-946, -388], [-1050, -378], [-1180, -398], [-1306, -394]] },
    { id: 'plink', name: '星湾桥', kind: 2, hw: 4.5, pts: [[-414, -52], [-420, -96], [-429, -140]] },
    { id: 'pring', name: '星湾环路', kind: 2, hw: 4.5, ring: { cx: -430, cz: -182, r: 50 } },
  ],
  pearl: { cx: -430, cz: -182, r: 84, y: 0.6, name: '星湾岛' },
  bridge: { x0: -760, x1: -600, rise: 4.6 }, // 堤道中段的通航桥拱（按 x 范围）
  deckY: 0.6, // causeway embankment / pearl island ground height
  districts: [
    { id: 'cane', name: '甘蔗区', sub: '大陆 · 拉丁街区' },
    { id: 'bayside', name: '湾畔', sub: '大陆 · 海湾公园' },
    { id: 'mural', name: '壁画仓库区', sub: '大陆 · 艺术区' },
    { id: 'pearl', name: '星湾岛', sub: '人工岛 · 豪宅' },
    { id: 'causeway', name: '日光堤道', sub: '跨湾堤道' },
    { id: 'dunes', name: '海燕沙丘', sub: '棕榈岛北端' },
    { id: 'north', name: '北棕榈', sub: '棕榈岛' },
    { id: 'mangrove', name: '南角红树林', sub: '棕榈岛南端' },
    { id: 'south', name: '南棕榈', sub: '棕榈岛' },
  ],
};
// r5.0 mainland points of interest (axis-aligned shopfront on 第八街 so the shop/clerk code works unchanged)
export const POI_R5 = {
  storeC: { id: 'C', x: -1059.5, z: -40, name: '甘蔗区杂货', icon: '店', col: '#2f9e5b', face: 1 },
  atm: { x: -1059.0, z: -62 },
  restaurants: [{ x: -1057, z: 70, name: '甘蔗面包坊' }, { x: -963.5, z: 120, name: '湾畔烤肉' }],
};

POI.stores.push(POI_R5.storeC); POI.atms.push(POI_R5.atm); POI.restaurants.push(...POI_R5.restaurants);
