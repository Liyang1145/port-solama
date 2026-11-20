// r5.0 top-down layout map of Port Solana (MAP_DESIGN.md) -> shots/map/port_solana_map.png (+ _full.png).
// Reads the SAME data the game uses: src/mapdata.js (POI, REGION control points) and src/mapgeo.js (paths, junctions, lots,
// coastlines), plus the Deco-district grid constants of src/city.js. So the design doc, this map and the game cannot disagree.
// node tools/mapgen.cjs
const fs = require('fs'), path = require('path'), sharp = require('sharp');
(async () => {
  const { POI, MISSION_STARTS, REGION } = await import(path.resolve('src/maps/gta/mapdata.js'));
  const G = await import(path.resolve('src/maps/gta/mapgeo.js'));
  const D = G.buildRegionData();
  const city = fs.readFileSync('src/city.js', 'utf8');
  const PIERS = eval(/export const PIERS = (\[.*?\]);/.exec(city)[1]);
  const NS = [50, 170, 290], EW = [-300, -150, 0, 150, 300], RH = 7, IX = [-22, 335], IZ = [-372, 372];
  const render = async (X0, X1, Z0, Z1, S, file, labels = 1) => {
    const W = Math.round((X1 - X0) * S), H = Math.round((Z1 - Z0) * S) + 90;
    const px = (x) => ((x - X0) * S).toFixed(1), pz = (z) => ((Z1 - z) * S).toFixed(1); // north (+z) up
    const poly = (P, fill, extra = '') => `<path d="M${P.map((p) => px(p[0]) + ',' + pz(p[1])).join('L')}Z" fill="${fill}" ${extra}/>`;
    const line = (P, col, w, extra = '') => `<path d="M${P.map((p) => px(p[0]) + ',' + pz(p[1])).join('L')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    const R = (x0, z0, x1, z1, fill) => poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], fill);
    const T = (x, z, t, size = 13, fill = '#1d232b', w = 700, anchor = 'middle') => `<text x="${px(x)}" y="${pz(z)}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" font-family="WenQuanYi Zen Hei, sans-serif" stroke="#ffffffcc" stroke-width="3" paint-order="stroke">${t}</text>`;
    const o = [`<rect width="${W}" height="${H}" fill="#8fc6d6"/>`];
    // land
    const ml = [[-2800, -1600]]; for (let z = -1600; z <= 1600; z += 10) ml.push([G.shoreX(z), z]); ml.push([-2800, 1600]); o.push(poly(ml, '#dfe1dc'));
    { const P = [[-1380, -480], [-1380, 480]]; for (let z = 480; z >= -480; z -= 10) P.push([G.shoreX(z), z]); o.push(poly(P, '#d5d8dc')); }
    for (const sg of [1, -1]) { o.push(poly(G.islandEndPoly(sg), '#cfe2c2')); const b = []; for (let a = 372; a <= 1480; a += 10) b.push([335 + G.beachOff(sg * a), sg * a]); for (let a = 1480; a >= 372; a -= 10) b.push([470 + G.beachOff(sg * a), sg * a]); o.push(poly(b, '#f1e5c4')); }
    o.push(poly(G.pearlPoly(), '#cfe2c2'));
    o.push(R(IX[0], IZ[0], IX[1], IZ[1], '#dfe3e8')); o.push(R(IX[1], IZ[0], 470, IZ[1], '#f1e5c4'));
    // Deco district blocks
    const bet = (arr, lo, hi) => { const a = [lo, ...arr, hi], r = []; for (let i = 0; i < a.length - 1; i++) { const s = a[i] + (i === 0 ? 0 : RH), e = a[i + 1] - (i === a.length - 2 ? 0 : RH); if (e - s > 4) r.push([s, e]); } return r; };
    for (const [x0, x1] of bet(NS, IX[0], 290 + RH).filter((p) => p[1] <= 290)) for (const [z0, z1] of bet(EW, IZ[0], IZ[1])) { o.push(R(x0, z0, x1, z1, '#c4cad2')); o.push(R(x0 + 6, z0 + 6, x1 - 6, z1 - 6, '#b3b9c2')); }
    for (const p of PIERS) o.push(R(p.x0, p.z - p.hw, p.x1, p.z + p.hw, '#8a6a48'));
    // lots / footprints
    const zc = { latin: '#c99a7a', condo: '#aeb6c0', mural: '#9d8fb5', mansion: '#f2f2ee' };
    for (const L of D.lots) o.push(poly(L.corners, L.empty ? '#bcd6a8' : zc[L.zone], 'stroke="#00000022" stroke-width="0.6"'));
    // roads: grid + ribbons (white with grey edge), causeway bridge hump marked
    const road = (P, hw) => o.push(line(P, '#9aa2ab', (hw * 2 + 1.5) * S), line(P, '#ffffff', hw * 2 * S));
    for (const x of NS) road([[x, IZ[0]], [x, IZ[1]]], RH); for (const z of EW) road([[IX[0], z], [290, z]], RH);
    for (const r of D.roads) { const P = []; for (let k = 0; k < r.path.n; k++) P.push([r.path.X[k], r.path.Z[k]]); road(P, r.hw); }
    { const P = []; for (let k = 0; k < D.byId.sun.path.n; k++) if (D.byId.sun.path.X[k] > REGION.bridge.x0 && D.byId.sun.path.X[k] < REGION.bridge.x1) P.push([D.byId.sun.path.X[k], D.byId.sun.path.Z[k]]); o.push(line(P, '#e0a91f', 4 * S + 2, 'stroke-dasharray="6 4"')); }
    // POIs + mission letters
    const dot = (x, z, t, col, r = 9) => `<circle cx="${px(x)}" cy="${pz(z)}" r="${r}" fill="${col}" stroke="#000a" stroke-width="1.2"/><text x="${px(x)}" y="${(+pz(z) + 4.5).toFixed(1)}" font-size="${r * 1.15}" font-weight="700" fill="#fff" text-anchor="middle" font-family="WenQuanYi Zen Hei, sans-serif">${t}</text>`;
    for (const p of [POI.gunshop, POI.clothes, POI.modshop, ...POI.stores]) o.push(dot(p.x, p.z, p.icon, p.col));
    for (const a of POI.atms) o.push(dot(a.x, a.z, '$', '#2f9e5b', 6));
    for (const r of POI.restaurants) o.push(dot(r.x, r.z, '餐', '#d4793a', 7));
    for (const m of MISSION_STARTS) o.push(dot(m.x, m.z, m.letter, '#e0a91f', 10));
    if (labels) {
      o.push(T(160, 0, '棕榈岛 · 海潮大道', 16), T(410, 200, '棕榈海滩', 14), T(150, 470, '海燕沙丘', 14, '#2d5a2a'), T(150, 900, '北棕榈', 14), T(150, -470, '南角红树林', 14, '#2d5a2a'), T(150, -900, '南棕榈', 14));
      o.push(T(-480, 30, '日光堤道', 16, '#1d232b'), T(-680, 18, '通航桥拱', 11, '#7a5a00', 500), T(-430, -182, '星湾岛', 14), T(-1160, -20, '甘蔗区', 18), T(-930, 210, '湾畔', 14, '#2d5a2a'), T(-1120, 300, '壁画仓库区', 14));
      o.push(T(-1600, 0, '湾岸中心（远景天际线）', 13, '#39424d', 500), T(-500, -420, '海 湾', 20, '#2b6f86', 700), T(650, 0, '大 西 洋', 18, '#2b6f86'));
      for (const r of D.roads) if (r.id !== 'sun' && r.id !== 'pring') { const q = r.path.at(r.path.len * 0.45); o.push(T(q.x, q.z + 9, r.name, 10, '#3a3f46', 500)); }
    }
    o.push(`<text x="12" y="${H - 50}" font-size="15" font-weight="700" fill="#102030" font-family="WenQuanYi Zen Hei, sans-serif">索拉纳港 Port Solana · r5.0 地图（与游戏同源数据：src/mapdata.js + src/mapgeo.js）</text>`);
    o.push(`<text x="12" y="${H - 28}" font-size="12" fill="#102030" font-family="WenQuanYi Zen Hei, sans-serif">建筑颜色：橙=甘蔗区拉丁低层 · 灰=湾畔公寓 · 紫=壁画仓库 · 白=星湾岛豪宅 · 绿=空地/公园 · 黄虚线=堤道桥拱 · 字母=任务起点</text>`);
    o.push(`<text x="12" y="${H - 8}" font-size="12" fill="#102030" font-family="WenQuanYi Zen Hei, sans-serif">比例：${(100 * S).toFixed(0)} px = 100 m · 北向上 · 原创地名</text>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${o.join('')}</svg>`;
    fs.mkdirSync('shots/map', { recursive: true }); await sharp(Buffer.from(svg)).png().toFile(file); console.log(file, W, H);
  };
  await render(-1720, 760, -1560, 1560, 0.5, 'shots/map/port_solana_map.png');
  await render(-1340, -380, -460, 420, 1.1, 'shots/map/port_solana_mainland.png');
})();
