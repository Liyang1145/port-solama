// Top-down layout map of Port Solana (MAP_DESIGN.md) -> shots/map/port_solana_map.png. Reads the same POI table the game uses
// (src/mapdata.js) and mirrors the LAYOUT / PIERS constants of src/city.js. Rendered as SVG with sharp. node tools/mapgen.cjs
const fs = require('fs'), path = require('path'), sharp = require('sharp');
(async () => {
  const { POI, MISSION_STARTS } = await import(path.resolve('src/mapdata.js'));
  const city = fs.readFileSync('src/city.js', 'utf8');
  const PIERS = eval(/export const PIERS = (\[.*?\]);/.exec(city)[1]);
  const NS = [50, 170, 290], EW = [-300, -150, 0, 150, 300], RH = 7, IX = [-22, 335], IZ = [-372, 372], BX = [335, 480];
  const X0 = -470, X1 = 600, Z0 = -560, Z1 = 560, S = 1.25; const W = (X1 - X0) * S, H = (Z1 - Z0) * S + 110;
  // north (+z) up: screen y = (Z1 - z) * S
  const px = (x) => ((x - X0) * S).toFixed(1), pz = (z) => ((Z1 - z) * S).toFixed(1);
  const R = (x0, z0, x1, z1, fill, extra = '') => `<rect x="${px(Math.min(x0, x1))}" y="${pz(Math.max(z0, z1))}" width="${(Math.abs(x1 - x0) * S).toFixed(1)}" height="${(Math.abs(z1 - z0) * S).toFixed(1)}" fill="${fill}" ${extra}/>`;
  const T = (x, z, t, size = 13, fill = '#1d232b', w = 700, anchor = 'middle') => `<text x="${px(x)}" y="${pz(z)}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" font-family="Noto Sans CJK SC, PingFang SC, sans-serif">${t}</text>`;
  const out = [];
  out.push(`<rect width="${W}" height="${H}" fill="#8fc6d6"/>`);
  out.push(R(-1000, -1500, -400, 1500, '#cfd5dc')); // mainland skyline strip
  for (let z = -540; z < 540; z += 46) out.push(R(-470, z, -405, z + 30, '#a9b1bb'));
  out.push(T(-437, 520, '湾对岸市中心', 13, '#39424d')); out.push(T(-437, 500, '（远景 · 第 3 期）', 11, '#39424d', 500));
  out.push(R(IX[0], IZ[0], BX[0], IZ[1], '#dfe3e8'));
  out.push(R(BX[0], IZ[0] - 8, BX[1], IZ[1] + 8, '#f1e5c4'));
  out.push(R(BX[1], IZ[0] - 8, 520, IZ[1] + 8, '#b9e1e6'));
  for (const zj of [IZ[0] - 1.5, IZ[1] + 1.5]) out.push(R(BX[0], zj - 3, 540, zj + 3, '#8d8a84'));
  // blocks + buildings rows + alleys
  const bet = (arr, lo, hi) => { const a = [lo, ...arr, hi], o = []; for (let i = 0; i < a.length - 1; i++) { const s = a[i] + (i === 0 ? 0 : RH), e = a[i + 1] - (i === a.length - 2 ? 0 : RH); if (e - s > 4) o.push([s, e]); } return o; };
  const XS = bet(NS, IX[0], 290 + RH).filter((p) => p[1] <= 290), ZS = bet(EW, IZ[0], IZ[1]);
  for (const [x0, x1] of XS) for (const [z0, z1] of ZS) {
    out.push(R(x0, z0, x1, z1, '#c4cad2'));
    const ix0 = x0 + 4.5, ix1 = x1 - 4.5, iz0 = z0 + 4.5, iz1 = z1 - 4.5;
    const corner = x0 < 0 && (z0 < -360 || z1 > 360);
    if (corner) { out.push(R(ix0, iz0, ix1, iz1, z0 < 0 ? '#b8a990' : '#a4927c')); for (let i = 0; i < 5; i++) out.push(R(ix0 + 4, iz0 + 4 + i * 10, ix1 - 4, iz0 + 6.5 + i * 10, ['#a3402f', '#2c5c8c', '#c98a2a', '#3f7a52', '#7c7c7c'][i])); continue; }
    if (x0 < 0) { out.push(R(ix0 + 4, (iz0 + iz1) / 2 - 22, ix1 - 6, (iz0 + iz1) / 2 + 22, '#9aa3ae')); continue; }
    const mid = (iz0 + iz1) / 2; const tide = x1 > 279 && x0 > 170;
    out.push(R(ix0, iz0, ix0 + 22, mid - 3, '#a9b1bb')); out.push(R(ix0, mid + 3, ix0 + 22, iz1, '#a9b1bb'));
    if (tide) out.push(R(ix1 - 3.5 - 22, iz0, ix1 - 3.5, iz1, '#e8b7b0')); else { out.push(R(ix1 - 22, iz0, ix1, mid - 3, '#a9b1bb')); out.push(R(ix1 - 22, mid + 3, ix1, iz1, '#a9b1bb')); }
    out.push(R(ix0, mid - 3, tide ? ix1 - 26 : ix1, mid + 3, '#f6f2ea', 'stroke="#d07a3a" stroke-dasharray="4 3" stroke-width="1"'));
  }
  for (const [z0, z1] of ZS) out.push(R(290 + RH, z0, BX[0], z1, '#bfdcae'));
  // roads (hierarchy: main avenues wider stroke)
  for (const x of NS) out.push(R(x - RH, IZ[0], x + RH, IZ[1], '#ffffff', x === 290 ? 'stroke="#f2c14e" stroke-width="2"' : ''));
  for (const z of EW) out.push(R(IX[0], z - RH, 290 + RH, z + RH, '#ffffff'));
  // piers + boats
  for (const p of PIERS) { out.push(R(p.x0, p.z - p.hw, p.x1, p.z + p.hw, '#8a6b4a')); for (let x = p.x0 + 8; x < p.x1 - 8; x += 15) for (const s of [-1, 1]) out.push(`<ellipse cx="${px(x)}" cy="${pz(p.z + s * (p.hw + 2.6))}" rx="${(6 * S).toFixed(1)}" ry="${(1.7 * S).toFixed(1)}" fill="#fafafa" stroke="#555" stroke-width="0.6"/>`); }
  // phase-2 causeway (dashed)
  out.push(R(-400, -5, IX[0], 5, 'none', 'stroke="#555" stroke-dasharray="8 6" stroke-width="1.5"'));
  out.push(T(-210, 14, '日光堤道 + 灯塔小岛（第 2 期）', 12, '#30383f', 600));
  // landmarks
  out.push(`<circle cx="${px(POI.lighthouse.x)}" cy="${pz(POI.lighthouse.z)}" r="7" fill="#c8261c" stroke="#fff" stroke-width="2"/>`); out.push(T(POI.lighthouse.x, POI.lighthouse.z - 16, '灯塔', 13));
  out.push(`<circle cx="${px(POI.wheel.x)}" cy="${pz(POI.wheel.z)}" r="${(16 * S).toFixed(1)}" fill="none" stroke="#d6408a" stroke-width="3"/>`); out.push(T(POI.wheel.x, POI.wheel.z + 26, '摩天轮「海风之眼」', 13));
  // POI icons
  const icon = (x, z, t, col, label) => { out.push(`<circle cx="${px(x)}" cy="${pz(z)}" r="9" fill="${col}" stroke="#fff" stroke-width="2"/>`); out.push(`<text x="${px(x)}" y="${(+pz(z) + 4.5).toFixed(1)}" font-size="12" font-weight="800" fill="#fff" text-anchor="middle" font-family="Noto Sans CJK SC, sans-serif">${t}</text>`); if (label) out.push(T(x + (x < 120 ? 12 : -12), z - 4, label, 11, '#1d232b', 600, x < 120 ? 'start' : 'end')); };
  icon(POI.gunshop.x, POI.gunshop.z, '枪', POI.gunshop.col, POI.gunshop.name);
  for (const s of POI.stores) icon(s.x, s.z, '店', s.col, s.name);
  icon(POI.clothes.x, POI.clothes.z, '衣', POI.clothes.col, POI.clothes.name);
  icon(POI.modshop.x, POI.modshop.z, '修', POI.modshop.col, POI.modshop.name);
  for (const a of POI.atms) icon(a.x, a.z, '$', '#2f9e5b');
  icon(POI.hospital.x, POI.hospital.z, '医', '#e23d5b', POI.hospital.name); icon(POI.precinct.x, POI.precinct.z, '警', '#2448a8', POI.precinct.name);
  icon(POI.valet.x, POI.valet.z, 'V', '#e0a91f', '代客泊车');
  for (const m of MISSION_STARTS) { out.push(`<rect x="${(+px(m.x) - 11).toFixed(1)}" y="${(+pz(m.z) - 11).toFixed(1)}" width="22" height="22" rx="5" fill="#e0a91f" stroke="#3a2a00" stroke-width="2"/>`); out.push(`<text x="${px(m.x)}" y="${(+pz(m.z) + 5).toFixed(1)}" font-size="14" font-weight="900" fill="#2a1d00" text-anchor="middle" font-family="sans-serif">${m.letter}</text>`); out.push(T(m.x + 16, m.z + 10, m.name, 12, '#5a3d00', 800, 'start')); }
  // district labels + street names
  out.push(T(312, 230, '海潮大道', 15, '#7a2f22', 900)); out.push(T(410, 200, '棕榈海滩', 18, '#8a6a20', 900)); out.push(T(110, 330, '椰影区', 16, '#3a4a5a', 900)); out.push(T(230, 330, '珊瑚大街', 16, '#3a4a5a', 900));
  out.push(T(-48, -150, '鹈鹕游艇港', 14, '#2c3e50', 900)); out.push(T(10, -385, '南湾货运站', 13, '#5a4630', 900)); out.push(T(10, 390, '北湾旧船坞', 13, '#5a4630', 900));
  out.push(T(400, -520, '虚线 = 街区中间步行小巷（捷径 / 躲警察）  黄框字母 = 任务起点', 12, '#1d232b', 600));
  // legend + north + scale
  const ly = (Z1 - Z0) * S + 18;
  out.push(`<rect x="0" y="${ly - 18}" width="${W}" height="110" fill="#1b1f26"/>`);
  out.push(`<text x="20" y="${ly + 10}" font-size="20" font-weight="900" fill="#fff" font-family="Noto Sans CJK SC, sans-serif">索拉纳港 Port Solana · 地图设计 v4.3（第 1 期）</text>`);
  out.push(`<text x="20" y="${ly + 38}" font-size="13" fill="#cfd6df" font-family="Noto Sans CJK SC, sans-serif">主干道：海潮大道（黄边）、珊瑚大街、椰影大道 · 次干道：五条横街 · 小巷：橙色虚线 · 栈桥：棕色 · 集装箱堆场：两个西侧角落</text>`);
  out.push(`<text x="20" y="${ly + 60}" font-size="13" fill="#cfd6df" font-family="Noto Sans CJK SC, sans-serif">图标：枪 武器店 · 店 便利店（可抢） · 衣 服装店 · 修 修车坊 · $ ATM · 医 医院 · 警 警局 · V 代客泊车 · R/C/D/G 任务</text>`);
  out.push(`<line x1="${W - 170}" y1="${ly + 60}" x2="${W - 170 + 100 * S}" y2="${ly + 60}" stroke="#fff" stroke-width="3"/><text x="${W - 170}" y="${ly + 50}" font-size="12" fill="#fff" font-family="sans-serif">100 m</text>`);
  out.push(`<text x="${W - 30}" y="30" font-size="22" font-weight="900" fill="#1d232b" text-anchor="middle" font-family="sans-serif">N ↑</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${out.join('')}</svg>`;
  fs.mkdirSync('shots/map', { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile('shots/map/port_solana_map.png');
  console.log('shots/map/port_solana_map.png', W, 'x', H);
})();
