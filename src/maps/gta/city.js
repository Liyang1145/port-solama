// "Port Solana": an original Miami-inspired city — a barrier island (Art Deco beachfront, condos)
// across a bay from a glass-tower downtown, linked by a causeway.
import * as THREE from 'three';
import { World, prismWalls, polyCap, rect, box } from '../../geo.js';
import { ColliderGrid, rng, rand, randi, pick, clamp, withSeed } from '../../util.js';
import { buildRegion } from './region.js';
import { beachOff, westCoast, ISLE } from './mapgeo.js';
import { detailStream, job, mulb, seedOf } from './bldgdetail.js';
import { planFabric, attachFabric, updateFabric, inCanal, inCanalWater } from './fabric.js';
import { prepDowntown, attachDowntown, updateDowntown } from './downtown.js'; // a_downtown
import { fixFabricProps } from './propfix.js';
import { fixFabricCars } from './parkfix.js';
import { curbPass } from './curbfix.js'; // a_curbalign
import { prepHouses, attachHouses, updateHouses, auditHouses } from './houses.js'; // a_houses
import { prepStrip, attachStrip, updateStrip, stripGroundH } from './strip.js'; // a_strip (a_stripfix: stripGroundH)
const HOUSE_AUDIT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('houseaudit');
import { yardTrees, fixEdgeHedges, collectTrunks, auditEdgeWalls, EDGE_OFF } from './edgewalls.js'; // a_edgewalls (after curbfix / propfix / parkfix: their bake inputs are unchanged)
const EDGE_AUDIT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('edgeaudit');
import { decoHotelDetail, midriseDetail, condoTowerDetail, towerDetail, lotDetail, bridgeDetail, beachDetail } from './archdetail.js';

export const LAYOUT = {
  // v4.0 "one perfect district": only the Deco beachfront (Tideline Dr, x=290), two inner avenues (x=170, x=50) and five cross
  // streets survive; downtown across the bay is a low-poly skyline silhouette (no roads, no colliders).
  islandNS: [50, 170, 290],
  islandEW: [-300, -150, 0, 150, 300],
  islandX: [-22, 335], islandZ: [-372, 372],
  mainNS: [],
  mainEW: [],
  mainX: [-1500, -560], mainZ: [-700, 500],
  beachX: [335, 480], waterY: -1.0, roadHW: 7, swalk: 4.5,
};
const RH = LAYOUT.roadHW;
const SKY_X = -1400; // r5.0: downtown skyline now stands behind the mainland district (was -400)
// v4.3 map (MAP_DESIGN.md): 鹈鹕游艇港 timber piers off the west seawall
export const PIERS = [{ x0: -74, x1: -22, z: -78, hw: 1.8 }, { x0: -64, x1: -22, z: 28, hw: 1.8 }, { x0: -78, x1: -22, z: 98, hw: 1.8 }]; // mainland shore across the bay (skyline only)

// pastel stucco palette (linear-ish multipliers on a white plaster texture)
const PASTEL = [[1.0, 0.78, 0.72], [0.66, 0.90, 0.86], [1.0, 0.92, 0.66], [0.86, 0.76, 0.96], [0.78, 0.94, 0.76], [1.0, 0.98, 0.95], [1.0, 0.70, 0.58], [0.64, 0.82, 0.98], [1.0, 0.80, 0.86], [0.98, 0.95, 0.88]];
const ACCENT = [[0.18, 0.62, 0.62], [0.95, 0.45, 0.55], [0.98, 0.72, 0.30], [0.45, 0.40, 0.78], [0.25, 0.55, 0.85], [0.9, 0.55, 0.35]];
const GLASS = [[0.10, 0.20, 0.24], [0.16, 0.24, 0.30], [0.22, 0.26, 0.28], [0.20, 0.17, 0.13], [0.08, 0.16, 0.20], [0.26, 0.32, 0.36]];
const NEON = [[1.0, 0.18, 0.55], [0.15, 0.85, 1.0], [0.6, 0.25, 1.0], [1.0, 0.45, 0.15], [0.2, 1.0, 0.6], [1.0, 0.3, 0.8]];
export const HOTEL_NAMES = ['CORALINE', 'SANDPIPER', 'LA PALOMA', 'SEAGRAPE', 'BRISA MAR', 'ALBATROSS', 'STARLIGHT', 'MARIGOLD', 'THE HALCYON', 'SOLANA', 'BLUE HERON', 'CASA LUNA'];

export function buildCity(scene, mats, T) {
  const W = new World(250);
  W.attrs.building = { aWin: 4, aCol: 3, aGlass: 3, aUp: 3 };
  W.attrs.road = { aRd: 4 };
  const col = new ColliderGrid(24);
  const roads = []; // {axis, c, a0, a1}
  const segs = []; // road segments for traffic: {axis,c,a0,a1}
  const inters = []; // {x,z}
  const blocks = []; // {x0,z0,x1,z1,kind}
  const lamps = []; // {x,z,y,dir}
  const palms = []; // {x,z,h,lean,rot,s}
  const trees = []; // {x,z,s}
  const shrubs = []; // {x,z,s}
  const signs = []; // {x,y,z,ry,name,w,h,color}
  const awnings = [];
  const deco = { lifeguards: [], umbrellas: [] };

  // ----------------------------------------------------------- road network ----
  const L = LAYOUT;
  for (const x of L.islandNS) roads.push({ axis: 'z', c: x, a0: L.islandZ[0], a1: L.islandZ[1] });
  const NSL = L.islandNS[L.islandNS.length - 1];
  for (const z of L.islandEW) roads.push({ axis: 'x', c: z, a0: L.islandX[0], a1: NSL });
  for (const x of L.mainNS) roads.push({ axis: 'z', c: x, a0: -620, a1: 420 });
  for (const z of L.mainEW) roads.push({ axis: 'x', c: z, a0: L.mainNS[0], a1: L.mainNS[4] });
  // intersections
  const xs = roads.filter((r) => r.axis === 'z'), zs = roads.filter((r) => r.axis === 'x');
  for (const a of xs) for (const b of zs) {
    if (b.c >= a.a0 - 0.1 && b.c <= a.a1 + 0.1 && a.c >= b.a0 - 0.1 && a.c <= b.a1 + 0.1) inters.push({ x: a.c, z: b.c });
  }
  // split roads at intersections -> segments
  const rd = (wx, wz) => W.b('road', wx, wz);
  for (const r of roads) {
    const cuts = inters.filter((i) => (r.axis === 'z' ? Math.abs(i.x - r.c) < 0.1 : Math.abs(i.z - r.c) < 0.1)).map((i) => (r.axis === 'z' ? i.z : i.x)).sort((a, b) => a - b);
    const pts = [r.a0, ...cuts.filter((c) => c > r.a0 + 1 && c < r.a1 - 1), r.a1];
    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = pts[i] + (cuts.includes(pts[i]) ? RH : 0), s1 = pts[i + 1] - (cuts.includes(pts[i + 1]) ? RH : 0);
      if (s1 - s0 < 1) continue;
      const seg = { axis: r.axis, c: r.c, a0: s0, a1: s1, bridge: !!r.bridge };
      segs.push(seg);
      roadQuad(rd, seg);
    }
  }
  for (const i of inters) {
    const b = rd(i.x, i.z);
    b.quad(new THREE.Vector3(i.x - RH, 0, i.z + RH), new THREE.Vector3(i.x + RH, 0, i.z + RH), new THREE.Vector3(i.x + RH, 0, i.z - RH), new THREE.Vector3(i.x - RH, 0, i.z - RH),
      [(i.x - RH) / 7, (i.z + RH) / 7, (i.x + RH) / 7, (i.z + RH) / 7, (i.x + RH) / 7, (i.z - RH) / 7, (i.x - RH) / 7, (i.z - RH) / 7], { aRd: [0, 0, 0, 1] });
  }

  // ---------------------------------------------------------------- blocks -----
  const between = (arr, lo, hi) => { const out = []; const a = [lo, ...arr, hi]; for (let i = 0; i < a.length - 1; i++) { const s = a[i] + (i === 0 ? 0 : RH), e = a[i + 1] - (i === a.length - 2 ? 0 : RH); if (e - s > 4) out.push([s, e]); } return out; };
  const islandXs = between(L.islandNS, L.islandX[0], NSL + RH + 0.0001).filter((p) => p[1] <= NSL);
  const islandZs = between(L.islandEW, L.islandZ[0], L.islandZ[1]);
  for (const [x0, x1] of islandXs) for (const [z0, z1] of islandZs) blocks.push({ x0, z0, x1, z1, area: 'island' });
  // promenade strip east of Tideline Drive
  for (const [z0, z1] of islandZs) blocks.push({ x0: NSL + RH, z0, x1: L.beachX[0], z1, area: 'promenade' });
  const mainXs = between(L.mainNS, -1200, L.mainX[1]);
  const mainZs = between(L.mainEW, -620, 420);
  if (L.mainNS.length) for (const [x0, x1] of mainXs) for (const [z0, z1] of mainZs) blocks.push({ x0, z0, x1, z1, area: x0 > -600 ? 'bayfront' : 'downtown' });
  // block slabs: raised 0.15 with curbs; sidewalk ring, interior lot
  for (const b of blocks) {
    const deep = b.area === 'island' || b.area === 'promenade' || b.area === 'bayfront' ? -3.2 : -0.5;
    slab(W, b, deep);
  }
  // (V7, r6.2: the legacy mainland concrete layer at y -0.02 and the buried seawall at x=SKY_X were removed — region.js owns the mainland ground at -0.06; they z-fought it / poked out as a 3 km line)
  // island perimeter seawall (north/south ends + west) with railing posts
  {
    const b = W.b('concrete', 0, 0);
    prismWalls(b, [[L.islandX[0], L.islandZ[1]], [L.beachX[0], L.islandZ[1]]], -3.2, 0.0, null);
    prismWalls(b, [[L.beachX[0], L.islandZ[0]], [L.islandX[0], L.islandZ[0]]], -3.2, 0.0, null);
    prismWalls(b, [[L.islandX[0], L.islandZ[0]], [L.islandX[0], L.islandZ[1]]], -3.2, 0.0, null);
    // fence colliders to keep players out of the bay
    // r5.0: the island continues north/south (natural ends), so only the west bay edge keeps its rail; gap for the causeway at z=0
    const GAPS = [...PIERS, { z: 0, hw: 9.6 }].sort((a, b) => a.z - b.z);
    { let za = L.islandZ[0]; for (const p of GAPS) { col.add(L.islandX[0] - 2, za, L.islandX[0] - 0.6, p.z - p.hw, 1.1, 'rail'); za = p.z + p.hw; } col.add(L.islandX[0] - 2, za, L.islandX[0] - 0.6, L.islandZ[1], 1.1, 'rail'); }
    // railings (metal) along the bay edges
    const m = W.b('metal', 0, 0);
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.floor(len / 2.5);
      for (let i = 0; i <= n; i++) { const t = i / n; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; box(m, x - 0.04, 0.15, z - 0.04, x + 0.04, 1.1, z + 0.04); }
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len; const nx = -dz * 0.03, nz = dx * 0.03;
      for (const y of [1.05, 0.6]) prismWalls(m, [[x0 - nx, z0 - nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz], [x0 + nx, z0 + nz]], y, y + 0.05, null);
    };
    { let za = L.islandZ[0]; for (const p of GAPS) { rail(L.islandX[0] + 0.3, za, L.islandX[0] + 0.3, p.z - p.hw - 0.3); za = p.z + p.hw + 0.3; } rail(L.islandX[0] + 0.3, za, L.islandX[0] + 0.3, L.islandZ[1]); }
  }
  // ---------------------------------------------------------------- beach ------
  // r5.0: the beach line follows a natural offset beyond the Deco district (beachOff = 0 inside it) and runs to the island tips
  const beachH = (x, z) => {
    const t = clamp((x - L.beachX[0] - beachOff(z)) / (L.beachX[1] - L.beachX[0]), 0, 1);
    let y = 0.15 - Math.pow(t, 1.6) * 2.9 - t * 0.2;
    const ez = Math.abs(z) - (ISLE.tip - 20); if (ez > 0) y -= ez * 0.06;
    return y;
  };
  {
    const nx = 40, nz = 380; const x0 = L.beachX[0], x1 = L.beachX[1] + 60, z0 = -ISLE.tip - 60, z1 = ISLE.tip + 60;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position; const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); const x = p.getX(i) + beachOff(z); p.setX(i, x); p.setY(i, beachH(x, z) + (Math.sin(x * 0.21 + z * 0.13) * 0.04 + Math.sin(z * 0.05) * 0.06) * clamp((x - x0) / 10, 0, 1)); uv.setXY(i, x, z); }
    g.computeVertexNormals();
    W.b('sand', 400, 0).geom(g, new THREE.Matrix4());
    // lifeguard towers + umbrellas (positions; geometry built in props)
    for (let z = -300; z <= 300; z += 200) deco.lifeguards.push({ x: 392, z: z + 20, color: pick(ACCENT) });
    for (let i = 0; i < 50; i++) { const z = rand(-L.islandZ[1] + 25, L.islandZ[1] - 25), x = rand(355, 400); deco.umbrellas.push({ x, z, color: pick(ACCENT), r: rand(0, 6) }); }
    // v3.4: dense umbrella clusters (GTA6 beaches are packed) — rows near the hotels, thinning toward the water
    for (let cz = -L.islandZ[1] + 30; cz < L.islandZ[1] - 30; cz += 26) { const n = randi(18, 30); for (let i = 0; i < n; i++) { const x = 354 + Math.pow(rng(), 1.4) * 34, z = cz + rand(-20, 20); deco.umbrellas.push({ x, z, color: pick([...ACCENT, [0.95, 0.95, 0.92], [0.92, 0.82, 0.2], [0.85, 0.2, 0.25], [0.2, 0.45, 0.85]]), r: rand(0, 6), towelOnly: rng() < 0.35 }); } }
    // palms along the promenade
    for (let z = -L.islandZ[1] + 8; z < L.islandZ[1] - 8; z += rand(7, 13)) {
      if (Math.abs(z % 150) < 9 || Math.abs((z % 150) + 150) < 9 || Math.abs((z % 150) - 150) < 9) continue;
      palms.push({ x: rand(306, 330), z, h: rand(9, 15), lean: rand(-0.12, 0.12), rot: rand(0, 6.28), s: rand(0.9, 1.15) });
    }
    // r5.0: sparse umbrellas + dune palms along the extended beach (north/south of the district)
    for (let i = 0; i < 90; i++) { const sg = rng() < 0.5 ? 1 : -1, a = rand(560, 1350); const z = sg * a; deco.umbrellas.push({ x: 352 + beachOff(z) + Math.pow(rng(), 1.4) * 34, z, color: pick([...ACCENT, [0.95, 0.95, 0.92]]), r: rand(0, 6), towelOnly: rng() < 0.3 }); }
    for (let i = 0; i < 70; i++) { const sg = rng() < 0.5 ? 1 : -1, a = rand(400, 1400); const z = sg * a; palms.push({ x: 332 + beachOff(z) + rand(-12, 6), z, h: rand(8, 13), lean: rand(0.0, 0.2), rot: rand(0, 6.28), s: rand(0.9, 1.1) }); }
    for (let i = 0; i < 16; i++) palms.push({ x: rand(338, 352), z: rand(-L.islandZ[1] + 15, L.islandZ[1] - 15), h: rand(8, 13), lean: rand(0.05, 0.22), rot: rand(0, 6.28), s: rand(0.9, 1.1) });
  }
  // ------------------------------------------------------------- buildings -----
  const B = W.b.bind(W);
  // r6.2: streamed per-building geometric detail (bldgdetail.js / archdetail.js); jobs register here, meshes build near the camera
  const DS = detailStream(128);
  // r6.3 (ground_a): mainland urban fabric around the district — lattice + downtown blocks first (the skyline snaps into them)
  const fab = planFabric();
  const bld = { W, col, signs, awnings, lamps, alleys: [], yards: [], ds: DS, fab };
  for (const b of blocks) {
    if (b.area === 'promenade') { promenade(W, b, shrubs, trees); { const zc = (b.z0 + b.z1) / 2 + 22; DS.add(b.x1, zc, 8, job('beach', (Wd) => beachDetail(Wd, b.x1, zc, mulb(seedOf(b.x1, zc, 9))))); } continue; }
    if (b.area === 'island') islandBlock(bld, b, palms, trees, shrubs);
    else if (b.area === 'bayfront') bayfrontBlock(bld, b, palms, trees);
    else downtownBlock(bld, b, palms, trees);
  }
  // ------------------------------------------- v4.0 district edges + far skyline ----
  districtEdges(bld, deco);
  skyline(bld);
  marina(bld); landmarks(bld);
  fab.populate(col); // own RNG stream: the shared rng sequence (island / district layout) is unchanged
  // r5.0 big map phase 1 (MAP_DESIGN.md): natural island ends, causeway, artificial island, mainland district (streamed)
  const region = buildRegion({ ...bld, palms, trees, shrubs, deco }, { volume, balconies, gput, rgeo, PASTEL, GLASS, ACCENT, fab, inCanal, inCanalWater });
  // r6.2: hook the detail stream into the region's attach/update, and add per-lot detail to every streamed mainland chunk
  {
    const rAttach = region.attach.bind(region), rUpdate = region.update.bind(region), rLoad = region.load.bind(region);
    region.attach = (scene, M) => { rAttach(scene, M); DS.attach(scene, M); const yard = yardTrees(fab); const lots = fab.lots; region.curbFix = curbPass(fab, groundH); region.propFix = fixFabricProps(fab, groundH); region.parkFix = fixFabricCars(fab, groundH); region.edgeAudit = EDGE_AUDIT ? { pre: auditEdgeWalls(fab) } : null; region.edgeFix = fixEdgeHedges(fab); if (EDGE_AUDIT) region.edgeAudit.post = auditEdgeWalls(fab); { const t1 = performance.now(); fab._trunks = collectTrunks(fab, yard, EDGE_AUDIT); region.edgeFix.msTrunks = Math.round(performance.now() - t1); } fab.houseKit = prepHouses(fab, lots); fab.stripKit = prepStrip(fab); region.stripAudit = fab.stripKit && fab.stripKit.audit; fab.dtKit = prepDowntown(fab, col, palms); region.fabStats = attachFabric(fab, scene, M); region.houses = attachHouses(fab.houseKit, scene); region.strip = attachStrip(fab.stripKit, scene); region.downtown = attachDowntown(fab.dtKit, scene); if (HOUSE_AUDIT) region.houseAudit = auditHouses(fab.houseKit); }; // a_houses: lot records read after every fix (bake inputs untouched), kit meshes around the camera // a_canaledge: fabric props off the water before their instances are made
    region.update = (cam, budget = 1) => { rUpdate(cam, budget); DS.update(cam, budget); updateFabric(fab, cam); updateHouses(fab.houseKit, cam); updateStrip(fab.stripKit, cam); updateDowntown(fab.dtKit, cam); };
    region.fabric = fab;
    region.load = (c) => { rLoad(c); const Wd = DS.world(); for (const Lt of c.lots) lotDetail(Wd, Lt); const ms = Wd.build(region.scene, region.M, { glassRail: { cast: false } }); DS.mark(ms); for (const m of ms) c.det.push(m); };
    region.detail = DS;
    const sun = region.data.byId.sun; let sb0 = 1e9, sb1 = -1e9; for (let s = 0; s < sun.path.len; s += 2) if (region.inBridge(sun.path.at(s).x)) { sb0 = Math.min(sb0, s); sb1 = Math.max(sb1, s); }
    if (sb1 > sb0) for (let s = 8 + 4 * Math.floor((sb0 - 16) / 4); s < sb1 + 8; s += 48) { /* aligned to region.js's 4 m pier grid (s = 8 + 4k) */ const a = s, b2 = Math.min(sb1 + 8, s + 48); const m = sun.path.at((a + b2) / 2); DS.add(m.x, m.z, 30, job('bridge', (Wd) => bridgeDetail(Wd, sun, region.inBridge, a, b2))); }
  }
  // ---------------------------------------------------------- street lights ----
  for (const s of segs) {
    if (s.bridge) continue;
    const len = s.a1 - s.a0; const n = Math.max(1, Math.floor(len / 34));
    for (let i = 0; i < n; i++) {
      const a = s.a0 + (i + 0.5) * len / n;
      for (const side of [-1, 1]) {
        if ((i + (side > 0 ? 1 : 0)) % 2) continue; // staggered
        const off = side * (RH + 0.8);
        if (s.axis === 'z') lamps.push({ x: s.c + off, z: a, y: 0.15, dir: [-side, 0] });
        else lamps.push({ x: a, z: s.c + off, y: 0.15, dir: [0, -side] });
      }
    }
  }
  for (const l of lamps) col.add(l.x - 0.18, l.z - 0.18, l.x + 0.18, l.z + 0.18, 9, 'pole');
  // sidewalk palms along streets (island)
  for (const s of segs) {
    if (s.bridge) continue;
    const onIsland = s.axis === 'z' ? s.c > -200 : s.a0 > -200;
    const len = s.a1 - s.a0; const step = onIsland ? 21 : 26; const n = Math.floor(len / step);
    for (let i = 1; i < n; i++) {
      const a = s.a0 + i * len / n + rand(-1, 1);
      for (const side of [-1, 1]) {
        if (s.axis === 'z' && s.c === 290 && side > 0) continue; // promenade side has its own
        const off = side * (RH + 2.6);
        const x = s.axis === 'z' ? s.c + off : a, z = s.axis === 'z' ? a : s.c + off;
        if (lamps.some((l) => Math.abs(l.x - x) < 3 && Math.abs(l.z - z) < 3)) continue;
        if ((onIsland && (s.axis === 'x' || s.c >= 170)) || rng() < 0.3) palms.push({ x, z, h: rand(7, 12), lean: rand(-0.07, 0.07), rot: rand(0, 6.28), s: rand(0.85, 1.05), street: true });
      }
    }
  }
  for (const p of palms) col.add(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3, 6, 'palm');

  // ground height lookup (blocks/sidewalks 0.15, beach slope, roads 0)
  const bgrid = new Map(); const BC = 50;
  for (const b of blocks) for (let ix = Math.floor(b.x0 / BC); ix <= Math.floor(b.x1 / BC); ix++) for (let iz = Math.floor(b.z0 / BC); iz <= Math.floor(b.z1 / BC); iz++) { const k = ix + ',' + iz; if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(b); }
  const blockAt = (x, z) => { const l = bgrid.get(Math.floor(x / BC) + ',' + Math.floor(z / BC)); if (l) for (const b of l) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b; return null; };
  const isLand = (x, z) => {
    { const h = region.groundH(x, z); if (h !== undefined) return h > L.waterY - 0.6; }
    for (const p of PIERS) if (x >= p.x0 && x <= p.x1 && Math.abs(z - p.z) <= p.hw) return true;
    if (x >= L.islandX[0] && x <= L.beachX[0] && z >= L.islandZ[0] && z <= L.islandZ[1]) return true;
    if (x >= L.beachX[0] && Math.abs(z) < L.islandZ[1] + 110 && beachH(x, z) > L.waterY - 0.6) return true;
    return false;
  };
  const groundH = (x, z) => {
    { const h = region.groundH(x, z); if (h !== undefined) { if (h === 0 && fab.stripKit) { const r = stripGroundH(fab.stripKit, x, z); if (r !== undefined) return r; } return h; } } // a_stripfix: strip-mall front walks
    if (x >= L.beachX[0] + beachOff(z) && x < 760 && Math.abs(z) < ISLE.tip + 60) return Math.max(beachH(x, z), -1.6);
    if (!isLand(x, z)) return L.waterY - 3;
    if (x < L.islandX[0]) return 0.15; // v4.3 marina piers
    return blockAt(x, z) ? 0.15 : 0;
  };
  return { detail: DS, fabric: fab, region, world: W, col, roads, segs, inters, blocks, lamps, palms, trees, shrubs, signs, awnings, deco, groundH, isLand, blockAt, beachH, alleys: bld.alleys, yards: bld.yards, piers: PIERS, clutAdd: bld.clutAdd || [] }; // a_edgewalls: clutAdd = boxes queued for kerb clutter (edgewalls.js)
}

function roadQuad(rd, s) {
  const b = rd(s.axis === 'z' ? s.c : (s.a0 + s.a1) / 2, s.axis === 'z' ? (s.a0 + s.a1) / 2 : s.c);
  const L = s.a1 - s.a0, w = RH;
  const n = Math.max(1, Math.ceil(L / 40));
  for (let i = 0; i < n; i++) {
    const a0 = s.a0 + L * i / n, a1 = s.a0 + L * (i + 1) / n;
    const v0 = a0 - s.a0, v1 = a1 - s.a0;
    if (s.axis === 'z') {
      const x0 = s.c - w, x1 = s.c + w;
      // CCW from above: (x0,a1) (x1,a1) (x1,a0) (x0,a0)
      const P = (x, z) => new THREE.Vector3(x, 0, z);
      b.quad(P(x0, a1), P(x1, a1), P(x1, a0), P(x0, a0), [x0 / 7, a1 / 7, x1 / 7, a1 / 7, x1 / 7, a0 / 7, x0 / 7, a0 / 7], {}, null);
      const k = b.custom.aRd; k.length -= 16;
      k.push(-w, v1, L, s.bridge ? 0 : 0, w, v1, L, 0, w, v0, L, 0, -w, v0, L, 0);
    } else {
      const z0 = s.c - w, z1 = s.c + w;
      const P = (x, z) => new THREE.Vector3(x, 0, z);
      b.quad(P(a0, z1), P(a1, z1), P(a1, z0), P(a0, z0), [a0 / 7, z1 / 7, a1 / 7, z1 / 7, a1 / 7, z0 / 7, a0 / 7, z0 / 7], {}, null);
      const k = b.custom.aRd; k.length -= 16;
      k.push(-w, v0, L, 0, -w, v1, L, 0, w, v1, L, 0, w, v0, L, 0);
    }
  }
}

function slab(W, b, deep) {
  const y = 0.15; const sw = LAYOUT.swalk;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  // curb sides
  // v3.5 kerb: vertical face, 45-degree arris bevel, 0.3 m granite-grey kerb stone on top, concrete gutter pan on the road
  const kc = W.b('concrete', cx, cz); const K = 0.3, bv = 0.045;
  prismWalls(kc, rect(b.x0, b.z0, b.x1, b.z1), deep, y - bv, null);
  { const o = rect(b.x0, b.z0, b.x1, b.z1), i2 = rect(b.x0 + bv, b.z0 + bv, b.x1 - bv, b.z1 - bv), i3 = rect(b.x0 + K, b.z0 + K, b.x1 - K, b.z1 - K);
    const V = (p, yy) => new THREE.Vector3(p[0], yy, p[1]);
    for (let k = 0; k < 4; k++) { const j = (k + 1) % 4;
      kc.quad(V(o[k], y - bv), V(o[j], y - bv), V(i2[j], y), V(i2[k], y), [o[k][0], o[k][1], o[j][0], o[j][1], i2[j][0], i2[j][1], i2[k][0], i2[k][1]]);
      kc.quad(V(i2[k], y), V(i2[j], y), V(i3[j], y), V(i3[k], y), [i2[k][0], i2[k][1], i2[j][0], i2[j][1], i3[j][0], i3[j][1], i3[k][0], i3[k][1]]); }
    if (deep < -1) { const g0 = rect(b.x0 - 0.45, b.z0 - 0.45, b.x1 + 0.45, b.z1 + 0.45); // gutter pan, slightly dished toward the kerb
      for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; kc.quad(V(g0[k], 0.012), V(g0[j], 0.012), V(o[j], 0.004), V(o[k], 0.004), [g0[k][0], g0[k][1], g0[j][0], g0[j][1], o[j][0], o[j][1], o[k][0], o[k][1]]); } } }
  const s = W.b('sidewalk', cx, cz);
  const inner = [b.x0 + sw, b.z0 + sw, b.x1 - sw, b.z1 - sw];
  // ring (inside the kerb stone)
  polyCap(s, rect(b.x0 + K, b.z0 + K, b.x1 - K, inner[1]), y); polyCap(s, rect(b.x0 + K, inner[3], b.x1 - K, b.z1 - K), y);
  polyCap(s, rect(b.x0 + K, inner[1], inner[0], inner[3]), y); polyCap(s, rect(inner[2], inner[1], b.x1 - K, inner[3]), y);
  b.inner = inner;
  // interior lot: pavers (plazas) or grass (park), decided later; default pavers
  b.lotMat = b.area === 'promenade' ? 'grass' : (rng() < 0.12 && b.area === 'island' ? 'grass' : 'pavers');
  polyCap(W.b(b.lotMat, cx, cz), rect(inner[0], inner[1], inner[2], inner[3]), y);
}

function promenade(W, b, shrubs, trees) {
  // low coral-stone wall towards the sand and shrubs
  const w = W.b('white', b.x1, (b.z0 + b.z1) / 2);
  box(w, b.x1 - 0.5, 0.15, b.z0 + 1, b.x1, 0.75, b.z1 - 1, {}, null);
  for (let z = b.z0 + 6; z < b.z1 - 6; z += rand(5, 9)) shrubs.push({ x: rand(b.x0 + 9, b.x1 - 3), z, s: rand(0.8, 1.6) });
}

// ---------- building helpers ----------
function facadeAttrs(style, fh, ww, seed, wallC, glassC, up = [0, 0, 0]) {
  return (i, len) => { const n = Math.max(1, Math.round(len / ww)); return { aWin: [style, fh, len / n, seed], aCol: wallC, aGlass: glassC, aUp: up }; };
}
// one building volume (polygon footprint) with ground-floor storefront band + upper style
function volume(ctx, poly, y0, y1, opts) {
  const { W, col } = ctx; const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const b = W.b('building', cx, cz);
  const seed = rand(0, 100);
  const ground = opts.ground ?? 4.6;
  if (opts.store && y0 < 1) {
    prismWalls(b, poly, y0, y0 + ground, facadeAttrs(3, ground, opts.storeW || 4.5, seed, opts.wall, [0.12, 0.13, 0.13]), null, 0, true);
    prismWalls(b, poly, y0 + ground, y1, facadeAttrs(opts.style, opts.fh, opts.ww, seed, opts.wall, opts.glass, opts.up), null, 0, true);
  } else prismWalls(b, poly, y0, y1, facadeAttrs(opts.style, opts.fh, opts.ww, seed, opts.wall, opts.glass, opts.up), null, 0, true);
  if (opts.relief !== false && (opts.style === 0 || opts.style === 2 || opts.style === 1)) relief(ctx, poly, opts.store && y0 < 1 ? y0 + ground : y0, y1, opts.fh, opts.ww, opts.style, opts.wall, y1 - y0 > 40 || opts.lite);
  if (opts.store && y0 < 1 && opts.canopy !== false) canopies(ctx, poly, y0 + ground, opts.wall);
  if (opts.store && y0 < 1) shopfront(ctx, poly, y0, ground, opts.storeW || 4.5, opts.wall);
  polyCap(W.b('roof', cx, cz), poly, y1);
  if (opts.collide !== false) {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    col.add(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), y1, 'bld');
  }
}
function chamfer(x0, z0, x1, z1, c) {
  return [[x0 + c, z1], [x1 - c, z1], [x1, z1 - c], [x1, z0 + c], [x1 - c, z0], [x0 + c, z0], [x0, z0 + c], [x0, z1 - c]];
}

// ---------- v3.5 real facade geometry (piers, spandrels, sills, mullion fins, canopies, balconies, roof clutter) ----------
// local frame per polygon edge: a = along the edge from p, d = outward distance. Columns line up with the window shader
// (prismWalls perEdge uv, n = round(len/ww) windows per edge), rows with absolute y / fh.
function edgeFrame(poly, i) {
  const p = poly[i], q = poly[(i + 1) % poly.length]; const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len; const ox = -dz, oz = dx;
  const P = (a, d) => [p[0] + dx * a + ox * d, p[1] + dz * a + oz * d];
  return { len, P, dx, dz, ox, oz };
}
function lbox(b, E, a0, a1, d0, d1, y0, y1, col, bottom = false) {
  const poly = [E.P(a0, d1), E.P(a1, d1), E.P(a1, d0), E.P(a0, d0)]; const V = (p, y) => new THREE.Vector3(p[0], y, p[1]); const uv = [0, 0, 1, 0, 1, 1, 0, 1];
  for (let k = 0; k < 4; k++) { if (k === 2 && d0 <= 0) continue; // inner face is buried in the wall
    const p = poly[k], q = poly[(k + 1) % 4]; b.quad(V(p, y0), V(q, y0), V(q, y1), V(p, y1), uv, {}, col); }
  polyCap(b, poly, y1, {}, col); if (bottom) polyCap(b, poly, y0, {}, col, true);
}
function relief(ctx, poly, y0, y1, fh, ww, style, wall, lite) {
  const b = ctx.W.b('vcol', poly[0][0], poly[0][1]);
  const pier = wall.map((c) => Math.min(1, c * 1.04 + 0.02)), band = wall.map((c) => c * 0.92), sill = wall.map((c) => Math.min(1, c * 1.1 + 0.05));
  const metal = [0.30, 0.32, 0.35];
  const k0 = Math.ceil(y0 / fh - 0.001), k1 = Math.floor(y1 / fh);
  for (let i = 0; i < poly.length; i++) {
    const E = edgeFrame(poly, i); if (E.len < 1.5) continue;
    const n = Math.max(1, Math.round(E.len / ww)); const cw = E.len / n;
    if (style === 2) {
      // deep piers between windows + spandrel bands: windows read as punched 0.25 m into the wall
      for (let k = 0; k <= n; k++) { const a = k * cw; lbox(b, E, Math.max(0, a - cw * 0.2), Math.min(E.len, a + cw * 0.2), -0.02, 0.24, y0, y1, pier); }
      for (let k = k0; k < k1; k++) { const yb = k * fh + fh * 0.80; if (yb < y0 || yb + fh * 0.48 > y1 + 0.01) continue; lbox(b, E, 0, E.len, -0.02, 0.18, yb, Math.min(y1, yb + fh * 0.48), band, true); }
      if (!lite) for (let k = k0; k < k1; k++) { const ys = k * fh + fh * 0.25; if (ys < y0) continue;
        for (let c = 0; c < n; c++) { const ac = (c + 0.5) * cw; lbox(b, E, ac - cw * 0.34, ac + cw * 0.34, 0.1, 0.36, ys, ys + 0.07, sill, true); } }
      // horizontal top cornice
      lbox(b, E, -0.3, E.len + 0.3, -0.02, 0.45, y1 - 0.45, y1 - 0.1, sill, true);
    } else if (style === 0) {
      const fin = lite && E.len > 12 ? 0.42 : 0.22;
      for (let k = 0; k <= n; k++) { const a = k * cw; lbox(b, E, Math.max(0, a - 0.06), Math.min(E.len, a + 0.06), -0.02, fin, y0, y1, metal); }
      for (let k = k0; k <= k1; k++) { const yb = k * fh; if (yb < y0 || yb > y1 - 0.2) continue; lbox(b, E, 0, E.len, -0.02, 0.12, yb, Math.min(y1, yb + fh * 0.16), metal, true); }
    }
  }
}
// v3.5 shopfront geometry on the ground-floor band: piers between bays, projecting transom / sign ledge, stone kick plate
function shopfront(ctx, poly, y0, ground, sw, wall) {
  const b = ctx.W.b('vcol', poly[0][0], poly[0][1]); const pier = wall.map((c) => Math.min(1, c * 1.02)), ledge = wall.map((c) => Math.min(1, c * 1.1 + 0.04)), kick = [0.32, 0.31, 0.3];
  for (let i = 0; i < poly.length; i++) {
    const E = edgeFrame(poly, i); if (E.len < 2.5) continue; const n = Math.max(1, Math.round(E.len / sw)); const cw = E.len / n;
    for (let k = 0; k <= n; k++) { const a = k * cw; lbox(b, E, Math.max(0, a - 0.17), Math.min(E.len, a + 0.17), -0.02, 0.2, y0, y0 + ground - 0.05, pier); }
    const yt = 0.8 * ground; lbox(b, E, 0, E.len, -0.02, 0.3, yt, yt + 0.14, ledge, true);
    lbox(b, E, 0, E.len, -0.02, 0.07, y0, 0.06 * ground + 0.04, kick);
  }
}
function canopies(ctx, poly, y, wall) {
  const b = ctx.W.b('vcol', poly[0][0], poly[0][1]); const dark = [0.22, 0.23, 0.25], soffit = [0.85, 0.85, 0.83];
  for (let i = 0; i < poly.length; i++) {
    const E = edgeFrame(poly, i); if (E.len < 12) continue;
    const a0 = E.len * rand(0.1, 0.3), a1 = E.len * rand(0.7, 0.9); const dep = rand(1.8, 2.6);
    lbox(b, E, a0, a1, 0, dep, y - 0.12, y + 0.18, dark, true); // canopy slab
    lbox(b, E, a0, a1, dep - 0.05, dep + 0.03, y - 0.25, y + 0.3, soffit); // fascia
    for (const a of [a0 + 0.4, a1 - 0.4]) lbox(b, E, a - 0.05, a + 0.05, 0.1, dep - 0.2, y + 0.18, y + 1.6, dark); // tie-back rods
    void wall;
  }
}
function balconies(ctx, poly, y0, y1, fh, ww, wall) {
  const b = ctx.W.b('vcol', poly[0][0], poly[0][1]); const g = ctx.W.b('glassRail', poly[0][0], poly[0][1]);
  const slabC = wall.map((c) => Math.min(1, c * 1.08 + 0.04)), rail = [0.2, 0.21, 0.22];
  const glass = rng() < 0.5; const every = randi(2, 3); const ph = randi(0, 1);
  for (let i = 0; i < poly.length; i++) {
    const E = edgeFrame(poly, i); if (E.len < 10) continue;
    const n = Math.max(1, Math.round(E.len / ww)); const cw = E.len / n;
    for (let k = Math.ceil(y0 / fh); k * fh < y1 - fh * 0.9; k++) {
      const yf = k * fh; if (yf < y0 + 0.5) continue;
      for (let c = ph; c < n; c += every) {
        const ac = (c + 0.5) * cw, w = Math.min(cw * 1.5, 4.2) / 2, dep = 1.15;
        lbox(b, E, ac - w, ac + w, 0, dep, yf - 0.05, yf + 0.16, slabC, true);
        if (glass) { // frameless glass balustrade with a metal top rail
          const p = [E.P(ac - w + 0.03, dep - 0.03), E.P(ac + w - 0.03, dep - 0.03), E.P(ac + w - 0.03, 0.05), E.P(ac - w + 0.03, 0.05)];
          prismWalls(g, p, yf + 0.16, yf + 1.05, null);
          lbox(b, E, ac - w, ac + w, dep - 0.06, dep, yf + 1.02, yf + 1.08, rail);
        } else { // stucco parapet + rail
          lbox(b, E, ac - w, ac + w, dep - 0.1, dep, yf + 0.16, yf + 0.95, slabC);
          for (const s of [-1, 1]) lbox(b, E, s < 0 ? ac - w : ac + w - 0.1, s < 0 ? ac - w + 0.1 : ac + w, 0, dep, yf + 0.16, yf + 0.95, slabC);
          lbox(b, E, ac - w, ac + w, dep - 0.08, dep + 0.02, yf + 1.0, yf + 1.05, rail);
        }
      }
    }
  }
}
// rooftop clutter: parapet with coping, mechanical penthouse with louvres, AC condensers, water tank, antenna + dish
const _m4 = new THREE.Matrix4();
function gput(b, g, x, y, z, col, sx = 1, sy = 1, sz = 1, ry = 0) { _m4.makeRotationY(ry).scale(new THREE.Vector3(sx, sy, sz)).setPosition(x, y, z); b.geom(g, _m4, {}, col); }
const RG = {};
function rgeo() {
  if (RG.cyl) return RG;
  RG.cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1); RG.cyl.translate(0, 0.5, 0);
  RG.cone = new THREE.ConeGeometry(1, 1, 10, 1); RG.cone.translate(0, 0.5, 0);
  RG.thin = new THREE.CylinderGeometry(1, 1, 1, 6, 1); RG.thin.translate(0, 0.5, 0);
  RG.dish = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.35); RG.dish.rotateX(Math.PI / 2);
  RG.fan = new THREE.CylinderGeometry(1, 1, 1, 8, 1); RG.fan.translate(0, 0.5, 0);
  return RG;
}
function rooftop(ctx, x0, z0, x1, z1, y, kind = 'any', excl = []) {
  const b = ctx.W.b('vcol', (x0 + x1) / 2, (z0 + z1) / 2); const G = rgeo();
  const conc = [0.72, 0.71, 0.68], cap = [0.84, 0.83, 0.8], met = [0.62, 0.64, 0.66], dark = [0.16, 0.17, 0.18];
  const t = 0.3, ph = 1.05;
  const P = (a0, b0, a1, b1, c, y0, y1, bottom) => { box(b, a0, y0, b0, a1, y1, b1, {}, c, !bottom); };
  P(x0, z0, x1, z0 + t, conc, y, y + ph); P(x0, z1 - t, x1, z1, conc, y, y + ph); P(x0, z0, x0 + t, z1, conc, y, y + ph); P(x1 - t, z0, x1, z1, conc, y, y + ph);
  for (const [a0, b0, a1, b1] of [[x0 - 0.08, z0 - 0.08, x1 + 0.08, z0 + t + 0.05], [x0 - 0.08, z1 - t - 0.05, x1 + 0.08, z1 + 0.08], [x0 - 0.08, z0, x0 + t + 0.05, z1], [x1 - t - 0.05, z0, x1 + 0.08, z1]]) P(a0, b0, a1, b1, cap, y + ph, y + ph + 0.1, true);
  const W = x1 - x0, D = z1 - z0; if (W < 7 || D < 7) return [];
  const used = excl.slice();
  const free = (a0, b0, a1, b1) => !used.some((u) => a0 < u[2] && a1 > u[0] && b0 < u[3] && b1 > u[1]);
  const place = (w, d) => { for (let i = 0; i < 12; i++) { const a = rand(x0 + 1.2, x1 - 1.2 - w), c = rand(z0 + 1.2, z1 - 1.2 - d); if (free(a - 0.6, c - 0.6, a + w + 0.6, c + d + 0.6)) { used.push([a, c, a + w, c + d]); return [a, c]; } } return null; };
  // penthouse
  if (W > 12 && D > 12) { const w = Math.min(W * 0.4, rand(5, 10)), d = Math.min(D * 0.4, rand(4, 8)); const s = place(w, d);
    if (s) { const h = rand(2.8, 4.2); P(s[0], s[1], s[0] + w, s[1] + d, conc, y, y + h); P(s[0] - 0.15, s[1] - 0.15, s[0] + w + 0.15, s[1] + d + 0.15, cap, y + h, y + h + 0.2, true);
      for (let a = s[0] + 0.3; a < s[0] + w - 0.3; a += 0.28) { P(a, s[1] - 0.12, a + 0.06, s[1], met, y + 0.6, y + h - 0.5); P(a, s[1] + d, a + 0.06, s[1] + d + 0.12, met, y + 0.6, y + h - 0.5); } } }
  // AC condensers with fan discs
  const nac = randi(2, Math.min(9, Math.floor(W * D / 60) + 2));
  for (let i = 0; i < nac; i++) { const s = place(1.3, 1.3); if (!s) break; P(s[0], s[1], s[0] + 1.3, s[1] + 1.3, met, y, y + 1.0);
    gput(b, G.fan, s[0] + 0.65, y + 1.0, s[1] + 0.65, dark, 0.48, 0.04, 0.48); gput(b, G.fan, s[0] + 0.65, y + 1.04, s[1] + 0.65, met, 0.12, 0.03, 0.12); }
  // water tank on legs (classic) or HVAC duct runs
  if (rng() < (kind === 'mid' ? 0.6 : 0.3)) { const s = place(3.2, 3.2); if (s) { const cx = s[0] + 1.6, cz = s[1] + 1.6; const r = 1.4, legH = 2.2, th = 2.6; const wood = rng() < 0.5 ? [0.5, 0.38, 0.27] : [0.75, 0.76, 0.78];
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gput(b, G.thin, cx + lx * r * 0.7, y, cz + lz * r * 0.7, dark, 0.07, legH, 0.07);
    gput(b, G.cyl, cx, y + legH, cz, wood, r, th, r); gput(b, G.cone, cx, y + legH + th, cz, dark, r * 1.04, 0.8, r * 1.04);
    for (let k = 1; k < 3; k++) gput(b, G.cyl, cx, y + legH + k * th / 3, cz, dark, r + 0.02, 0.05, r + 0.02); } }
  else if (W > 10) { const s = place(W * 0.5, 0.9); if (s) P(s[0], s[1], s[0] + W * 0.5, s[1] + 0.9, met, y + 0.5, y + 1.3); }
  // antenna mast + satellite dish
  if (rng() < 0.7) { const ax = rand(x0 + 1, x1 - 1), az = rand(z0 + 1, z1 - 1); const ah = rand(3, 8); used.push([ax - 0.6, az - 0.6, ax + 0.6, az + 0.6]); gput(b, G.thin, ax, y, az, met, 0.05, ah, 0.05);
    for (let k = 1; k < 3; k++) gput(b, G.thin, ax, y + ah * k / 3, az, met, 0.02, 1.2, 0.02); }
  if (rng() < 0.6) { const s = place(1.2, 1.2); if (s) { gput(b, G.thin, s[0] + 0.6, y, s[1] + 0.6, met, 0.05, 1.0, 0.05); gput(b, G.dish, s[0] + 0.6, y + 1.2, s[1] + 0.6, [0.9, 0.9, 0.9], 0.55, 0.55, 0.55, rand(0, 6.28)); } }
  return used; // r6.2: occupied roof cells -> the streamed roofKit (bldgdetail.js) avoids them
}

function condoSlabs(ctx, x0, z0, x1, z1, y0, y1, fh, dep) {
  const b = ctx.W.b('white', (x0 + x1) / 2, (z0 + z1) / 2);
  const g = ctx.W.b('glassRail', (x0 + x1) / 2, (z0 + z1) / 2);
  for (let y = y0 + fh; y < y1 - 0.5; y += fh) {
    const X0 = x0 - dep, X1 = x1 + dep, Z0 = z0 - dep, Z1 = z1 + dep;
    box(b, X0, y - 0.22, Z0, X1, y, Z1, {}, null, false);
    // glass balustrade + metal top rail + privacy dividers between units (v3.5)
    prismWalls(g, rect(X0 + 0.05, Z0 + 0.05, X1 - 0.05, Z1 - 0.05), y, y + 1.05, null);
    const v = ctx.W.b('vcol', (x0 + x1) / 2, (z0 + z1) / 2); const rc = [0.25, 0.26, 0.28], dv = [0.9, 0.9, 0.88];
    prismWalls(v, rect(X0 + 0.02, Z0 + 0.02, X1 - 0.02, Z1 - 0.02), y + 1.03, y + 1.09, null, rc); prismWalls(v, rect(X0 + 0.08, Z0 + 0.08, X1 - 0.08, Z1 - 0.08), y + 1.03, y + 1.09, null, rc);
    polyCap(v, rect(X0 - 0.03, Z0 - 0.03, X1 + 0.03, Z1 + 0.03), y - 0.22, {}, dv, true);
    for (let x = x0 + 6.6; x < x1 - 2; x += 6.6) { box(v, x - 0.08, y, Z0, x + 0.08, y + fh - 0.22, z0, {}, dv); box(v, x - 0.08, y, z1, x + 0.08, y + fh - 0.22, Z1, {}, dv); }
    for (let z = z0 + 6.6; z < z1 - 2; z += 6.6) { box(v, X0, y, z - 0.08, x0, y + fh - 0.22, z + 0.08, {}, dv); box(v, x1, y, z - 0.08, X1, y + fh - 0.22, z + 0.08, {}, dv); }
  }
}

function islandBlock(ctx, b, palms, trees, shrubs) {
  const [ix0, iz0, ix1, iz1] = b.inner;
  const W = ctx.W;
  if (b.lotMat === 'grass') { // pocket park
    for (let i = 0; i < 7; i++) trees.push({ x: rand(ix0 + 5, ix1 - 5), z: rand(iz0 + 5, iz1 - 5), s: rand(0.8, 1.3) });
    for (let i = 0; i < 6; i++) palms.push({ x: rand(ix0 + 3, ix1 - 3), z: rand(iz0 + 3, iz1 - 3), h: rand(8, 14), lean: rand(-0.1, 0.1), rot: rand(0, 6), s: 1 });
    return;
  }
  const tideline = b.x1 > 280 - 1 && b.x0 > 170; // block facing the beach
  const bayside = b.x0 < 0;
  // v4.3 map: the two bay corners become container yards (south: cold-store depot, north: old shipyard / gang turf)
  if (bayside && (b.z0 < -360 || b.z1 > 360)) { yard(ctx, b, b.z0 < 0 ? 'depot' : 'shipyard'); return; }
  if (bayside) { // condo towers on the bay
    const z = (iz0 + iz1) / 2; const hz = Math.min(22, (iz1 - iz0) / 2 - 6);
    const x0 = ix0 + 4, x1 = ix1 - 6;
    const fh = 3.2; const floors = randi(14, 30); const top = 0.15 + 5 + floors * fh;
    volume(ctx, rect(x0, z - hz, x1, z + hz), 0.15, 5.15, { style: 3, fh: 5, ww: 5, wall: [0.92, 0.92, 0.9], glass: [0.1, 0.12, 0.13] });
    const sx0 = x0 + 3, sx1 = x1 - 3, sz0 = z - hz + 3, sz1 = z + hz - 3;
    volume(ctx, rect(sx0, sz0, sx1, sz1), 5.15, top, { style: 1, fh, ww: 3.2, wall: [0.95, 0.95, 0.93], glass: pick(GLASS), collide: false });
    condoSlabs(ctx, sx0, sz0, sx1, sz1, 5.15, top, fh, 1.6);
    rooftop(ctx, sx0, sz0, sx1, sz1, top);
    if (ctx.ds) { const p = { x0, x1, z, hz, sx0, sx1, sz0, sz1, top, fh }; ctx.ds.add((x0 + x1) / 2, z, Math.max(x1 - x0, 2 * hz) / 2 + 9, job('condo', (Wd) => condoTowerDetail(Wd, p))); }
    for (let zz = iz0 + 3; zz < iz1 - 3; zz += 9) palms.push({ x: ix0 + 1.5, z: zz, h: rand(8, 12), lean: 0.05, rot: rand(0, 6), s: 1 });
    return;
  }
  // rows of buildings along the long (z) frontage, front and back
  const depth = ix1 - ix0;
  const half = depth / 2;
  // v4.3 map: a 6 m pedestrian alley through the middle of every inner block (shortcut + cover from police cars)
  const zm = (iz0 + iz1) / 2; const alley = iz1 - iz0 > 60;
  if (alley) ctx.alleys.push({ x0: ix0, x1: ix1, z: zm, w: 6 });
  for (const side of tideline ? [1, -1] : [1, -1]) {
   const runs = alley && !(tideline && side > 0) ? [[iz0, zm - 3], [zm + 3, iz1]] : [[iz0, iz1]];
   for (const [ra, rb] of runs) {
    let z = ra; const iz1 = rb;
    while (z < iz1 - 8) {
      const w = Math.min(iz1 - z, rand(18, 34));
      if (iz1 - z - w < 10) { /* absorb leftover */ }
      const ww2 = iz1 - z - w < 10 ? iz1 - z : w;
      const gap = rng() < 0.3 ? rand(2, 4) : 0;
      const z0 = z + gap, z1 = z + ww2 - (gap ? 0 : 0);
      const front = side > 0 ? (tideline ? ix1 - 3.5 : ix1) : ix0;
      const d = Math.min(half - 2, rand(16, 30));
      const x0 = side > 0 ? front - d : front, x1 = side > 0 ? front : front + d;
      if (tideline && side > 0) decoHotel(ctx, x0, z0, x1, z1);
      else if (rng() < 0.55) decoHotel(ctx, x0, z0, x1, z1, true, side);
      else midrise(ctx, x0, z0, x1, z1);
      z += ww2;
    }
   }
  }
}


// real geometry on punched-window facades: projecting sills, side jambs, pilasters, AC units, planters
function facadeDetail(ctx, fx, s, z0, z1, yBase, floors, fh, ww, wall, withAC = true) {
  const tb = ctx.W.b('vcol', fx, (z0 + z1) / 2);
  const len = z1 - z0; const n = Math.max(1, Math.round(len / ww)); const cw = len / n;
  const dark = wall.map((c) => c * 0.8); const light = wall.map((c) => Math.min(1, c * 1.1 + 0.03));
  const ac = [0.78, 0.78, 0.76];
  const bx = (a, b, y0, y1, za, zb, c) => s > 0 ? box(tb, fx + a, y0, za, fx + b, y1, zb, {}, c) : box(tb, fx - b, y0, za, fx - a, y1, zb, {}, c);
  for (let i = 0; i < floors; i++) {
    const yf = yBase + i * fh;
    for (let k = 0; k < n; k++) {
      const zc = z0 + (k + 0.5) * cw; const hw = cw * 0.3;
      bx(-0.02, 0.22, yf + fh * 0.25, yf + fh * 0.285, zc - hw - 0.12, zc + hw + 0.12, light); // sill
      bx(-0.02, 0.05, yf + fh * 0.28, yf + fh * 0.8, zc - hw - 0.07, zc - hw, light); // jambs
      bx(-0.02, 0.05, yf + fh * 0.28, yf + fh * 0.8, zc + hw, zc + hw + 0.07, light);
      bx(-0.02, 0.08, yf + fh * 0.8, yf + fh * 0.84, zc - hw - 0.12, zc + hw + 0.12, light); // lintel
      if (withAC && rng() < 0.16) bx(0.0, 0.55, yf + fh * 0.1, yf + fh * 0.1 + 0.45, zc - 0.4, zc + 0.4, ac); // AC unit under sill
      if (rng() < 0.12 && i > 0) { // planter box
        bx(0.0, 0.3, yf + fh * 0.02, yf + fh * 0.24, zc - hw, zc + hw, [0.45, 0.3, 0.22]);
        bx(0.02, 0.28, yf + fh * 0.24, yf + fh * 0.4, zc - hw * 0.9, zc + hw * 0.9, [0.18, 0.4, 0.16]);
      }
    }
    bx(-0.02, 0.1, yf - 0.08, yf + 0.1, z0, z1, dark); // floor band
  }
  for (let k = 0; k <= n; k++) { const zc = z0 + k * cw; bx(-0.02, 0.14, yBase, yBase + floors * fh, zc - 0.12, zc + 0.12, light); } // pilasters
}

// v3.5 Art Deco curves: rounded front corners (polyline arcs) and ledges/eyebrows that wrap around them
function roundFront(x0, z0, x1, z1, s, R, seg = 6) {
  const arc = (cx, cz, a0, a1) => { const o = []; for (let k = 0; k <= seg; k++) { const a = a0 + (a1 - a0) * k / seg; o.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); } return o; };
  // CCW order as rect(): (x0,z1) -> (x1,z1) -> (x1,z0) -> (x0,z0)
  if (s > 0) return [[x0, z1], ...arc(x1 - R, z1 - R, Math.PI / 2, 0), ...arc(x1 - R, z0 + R, 0, -Math.PI / 2), [x0, z0]];
  return [...arc(x0 + R, z1 - R, Math.PI, Math.PI / 2), [x1, z1], [x1, z0], ...arc(x0 + R, z0 + R, -Math.PI / 2, -Math.PI)];
}
// band between offsets d0..d1 outward of an open/closed polyline (outline order as rect), y0..y1, with top, bottom, outer face
function ledge(b, pts, closed, d0, d1, y0, y1, col) {
  const n = pts.length; const nrm = [];
  for (let i = 0; i < n; i++) {
    const pa = pts[(i - 1 + n) % n], pb = pts[i], pc = pts[(i + 1) % n]; let ex = 0, ez = 0;
    if (closed || i > 0) { const dx = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dx, dz) || 1; ex += -dz / l; ez += dx / l; }
    if (closed || i < n - 1) { const dx = pc[0] - pb[0], dz = pc[1] - pb[1], l = Math.hypot(dx, dz) || 1; ex += -dz / l; ez += dx / l; }
    const l = Math.hypot(ex, ez) || 1; const cosh = (closed || (i > 0 && i < n - 1)) ? Math.max(0.5, l / 2) : 1; nrm.push([ex / l / cosh, ez / l / cosh]);
  }
  const O = (i, d) => [pts[i][0] + nrm[i][0] * d, pts[i][1] + nrm[i][1] * d];
  const V = (p, y) => new THREE.Vector3(p[0], y, p[1]);
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n; const a0 = O(i, d0), a1 = O(i, d1), b0 = O(j, d0), b1 = O(j, d1);
    const uv = [0, 0, 1, 0, 1, 1, 0, 1];
    b.quad(V(a1, y0), V(b1, y0), V(b1, y1), V(a1, y1), uv, {}, col); // outer face
    b.quad(V(a1, y1), V(b1, y1), V(b0, y1), V(a0, y1), uv, {}, col); // top
    b.quad(V(a0, y0), V(b0, y0), V(b1, y0), V(a1, y0), uv, {}, col); // bottom
  }
  if (!closed) for (const [i, sg] of [[0, 1], [n - 1, -1]]) { const a0 = O(i, d0), a1 = O(i, d1); const q = sg > 0 ? [a0, a1] : [a1, a0]; b.quad(V(q[0], y0), V(q[1], y0), V(q[1], y1), V(q[0], y1), [0, 0, 1, 0, 1, 1, 0, 1], {}, col); }
}

function decoHotel(ctx, x0, z0, x1, z1, small = false, facing = 1) {
  const { W, signs, awnings } = ctx;
  const floors = small ? randi(2, 4) : randi(3, 5);
  const fh = 3.3; const ground = 4.4; const top = 0.15 + ground + (floors - 1) * fh + 0.5;
  const wall = pick(PASTEL); const accent = pick(ACCENT);
  const seed = rand(0, 99);
  const frontX = facing > 0 ? x1 : x0;
  const up0 = small ? null : pick(NEON); const upK = (seed * 7.31) % 1; // (pick kept so the layout RNG sequence is unchanged)
  const up = !up0 || upK < 0.35 ? [0, 0, 0] : [0.62, 0.47, 0.30].map((v) => v * (0.55 + 0.35 * upK)); void up0; // r6.1 warm halogen façade floodlights (no coloured neon wash on 索拉纳港)
  const dStyle = rng() < 0.5 ? 5 : 2, dWw = rand(2.6, 3.6);
  const R = (z1 - z0 > 14 && rng() < (small ? 0.35 : 0.7)) ? Math.min(3.2, (z1 - z0) / 5) : 0;
  const poly = R ? roundFront(x0, z0, x1, z1, facing, R) : rect(x0, z0, x1, z1);
  // front outline (for wrap-around ledges): the front face plus its rounded corners and a short return on each side
  let fpts;
  if (facing > 0) fpts = R ? poly.filter((p) => p[0] > x1 - R - 0.01) : [[x1, z1], [x1, z0]];
  else if (R) { const k = poly.findIndex((p) => p[0] === x1 && p[1] === z0); fpts = [...poly.slice(k + 1), ...poly.slice(0, k - 1)]; } else fpts = [[x0, z0], [x0, z1]];
  if (facing > 0) { fpts.unshift([x1 - R - 2.5, z1]); fpts.push([x1 - R - 2.5, z0]); } else { fpts.unshift([x0 + R + 2.5, z0]); fpts.push([x0 + R + 2.5, z1]); }
  volume(ctx, poly, 0.15, top, { style: dStyle, fh, ww: dWw, wall, glass: [0.10, 0.14, 0.16], store: true, storeW: rand(3.5, 5), ground, up, relief: false, canopy: false });
  const tb = W.b('vcol', frontX, (z0 + z1) / 2);
  const s = facing; const fx = frontX;
  const lighter = wall.map((c) => Math.min(1, c * 1.06));
  // eyebrows over each window row on the front + sides
  for (let i = 0; i < floors - 1; i++) {
    const y = 0.15 + ground + i * fh + fh * 0.86;
    ledge(tb, fpts, false, -0.02, 0.75, y, y + 0.16, lighter); // wrap-around eyebrow
  }
  if (dStyle === 2) facadeDetail(ctx, fx, s, z0 + R, z1 - R, 0.15 + ground, floors - 1, fh, dWw, wall, true);
  // cornice + parapet band
  ledge(tb, poly, true, -0.02, 0.3, top - 0.2, top + 0.2, lighter);
  prismWalls(tb, poly, top + 0.2, top + 1.2, null, wall); polyCap(tb, poly, top + 1.2, {}, wall);
  ledge(tb, poly, true, -0.02, 0.12, top + 1.2, top + 1.32, lighter); // parapet coping
  // stepped Deco parapet "ziggurat" blocks at the front corners and centre
  for (const zz of [z0 + 0.6 + R * 0.4, z1 - 0.6 - R * 0.4]) { const pxa = s > 0 ? fx - 1.6 - R * 0.3 : fx + 0.2 + R * 0.3; box(tb, pxa, top + 1.2, zz - 0.5, pxa + 1.4, top + 1.9, zz + 0.5, {}, lighter); box(tb, pxa + 0.25, top + 1.9, zz - 0.3, pxa + 1.15, top + 2.4, zz + 0.3, {}, accent); }
  // accent stripes on the parapet front
  for (const yy of [top + 0.45, top + 0.8]) ledge(tb, fpts.slice(1, -1), false, -0.01, 0.08, yy, yy + 0.12, accent);
  // r6.1: painted Deco accent bands where v4.x had neon tubes (map A is strictly non-neon): a slim colour band under the
  // cornice + a pin-stripe along the top eyebrow, both plain painted stucco (lit only by the warm façade floodlights at night)
  const nx = s > 0 ? fx + 0.33 : fx - 0.33; void nx; void pick(NEON); // (RNG sequence kept)
  ledge(tb, fpts.slice(1, -1), false, 0.29, 0.37, top - 0.34, top - 0.22, accent);
  if (floors > 2) { const y = 0.15 + ground + (floors - 2) * fh + fh * 0.86 - 0.08; ledge(tb, fpts, false, 0.74, 0.82, y, y + 0.07, accent); }
  // central pylon / fin rising above the roof
  const zc = (z0 + z1) / 2; const pw = rand(2.2, 3.4); const ph = rand(3.5, 8);
  let pylon = null;
  if (!small || rng() < 0.4) { pylon = { z: zc, w: pw / 2 + 0.6 };
    if (s > 0) box(tb, fx - 1.5, 0.15 + ground, zc - pw / 2, fx + 0.9, top + ph, zc + pw / 2, {}, lighter);
    else box(tb, fx - 0.9, 0.15 + ground, zc - pw / 2, fx + 1.5, top + ph, zc + pw / 2, {}, lighter);
    // r6.1: painted accent edges on the pylon (were neon tubes)
    const pxF = s > 0 ? fx + 0.93 : fx - 0.93; void pick(NEON); // (RNG sequence kept)
    for (const zz of [zc - pw / 2 - 0.03, zc + pw / 2 + 0.03]) box(tb, pxF - 0.05, 0.15 + ground + 0.5, zz - 0.05, pxF + 0.05, top + ph, zz + 0.05, {}, accent);
    // stepped crown
    box(tb, (s > 0 ? fx - 1.2 : fx - 0.6), top + ph, zc - pw / 2 + 0.3, (s > 0 ? fx + 0.6 : fx + 1.2), top + ph + 1.2, zc + pw / 2 - 0.3, {}, accent);
    // vertical sign on the pylon
    signs.push({ x: fx + s * 0.95, y: 0.15 + ground + (top + ph - ground) * 0.5, z: zc, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2, name: pick(HOTEL_NAMES), w: pw * 0.8, h: Math.min(10, (top + ph - ground - 1) * 0.8), vertical: true, color: pick(['#ffd49a', '#ffc77e', '#ffe2b8']) }); // r6.1 warm incandescent letters
  }
  // awnings over storefront + cafe umbrellas on the sidewalk (front only)
  if (!small) {
    const aw = pick([[0.85, 0.25, 0.35], [0.95, 0.55, 0.62], [0.15, 0.55, 0.58], [0.95, 0.85, 0.75], [0.25, 0.3, 0.55]]);
    const yA = 0.15 + ground - 0.3;
    awnings.push({ x0: fx, z0: z0 + 1, z1: z1 - 1, y: yA, out: 2.2 * s, color: aw });
    // horizontal name sign above awning
    signs.push({ x: fx + s * 0.06, y: yA + 0.75, z: zc, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2, name: pick(HOTEL_NAMES), w: Math.min(14, z1 - z0 - 4), h: 1.1, vertical: false, color: pick(['#ffd49a', '#ffe2b8', '#ffc77e']) });
  }
  if (ctx.ds) { const p = { x0, z0, x1, z1, facing, poly, top, ground, floors, fh, style: dStyle, ww: dWw, wall, accent, R, pylon, small };
    ctx.ds.add((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 3, job('deco', (Wd) => decoHotelDetail(Wd, p))); }
}

function midrise(ctx, x0, z0, x1, z1) {
  const floors = randi(3, 9); const fh = 3.2; const top = 0.15 + 4.6 + (floors - 1) * fh;
  const modern = rng() < 0.45;
  const wall = modern ? [0.93, 0.93, 0.91] : pick(PASTEL); const ww = rand(2.8, 4);
  volume(ctx, rect(x0, z0, x1, z1), 0.15, top, { style: modern ? 1 : 2, fh, ww, wall, glass: pick(GLASS), store: true });
  if (modern) condoSlabs(ctx, x0, z0, x1, z1, 4.75, top, fh, 1.2);
  else if (floors > 2 && rng() < 0.75) balconies(ctx, rect(x0, z0, x1, z1), 4.75, top, fh, ww, wall);
  const rused = rooftop(ctx, x0, z0, x1, z1, top, 'mid');
  if (ctx.ds) { // street face = the long side nearest a north-south street
    const dR = (x) => Math.min(...LAYOUT.islandNS.map((r) => Math.abs(Math.abs(x - r) - RH - LAYOUT.swalk)));
    const p = { x0, z0, x1, z1, floors, fh, top, modern, wall, ww, frontX: dR(x0) < dR(x1) ? x0 : x1, rused };
    ctx.ds.add((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 3, job('mid', (Wd) => midriseDetail(Wd, p))); }
}

function bayfrontBlock(ctx, b, palms, trees) {
  // waterfront park/promenade on the mainland side, with a few palms
  const [ix0, iz0, ix1, iz1] = b.inner;
  for (let z = iz0 + 2; z < iz1 - 2; z += rand(8, 12)) palms.push({ x: rand(ix0 + 2, ix1 - 2), z, h: rand(9, 15), lean: rand(-0.1, 0.1), rot: rand(0, 6), s: 1 });
  b.lotMat = 'grass';
}

function circlePoly(cx, cz, r, n = 20) { const p = []; for (let i = 0; i < n; i++) { const t = Math.PI / 2 - (i / n) * Math.PI * 2; p.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]); } return p; }
function fins(ctx, poly, y0, y1, step, depth, col) {
  const b = ctx.W.b('vcol', poly[0][0], poly[0][1]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]; const len = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.floor(len / step);
    const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len; const nx = dz, nz = -dx; // outward for our winding
    for (let k = 1; k < n; k++) {
      const x = p[0] + dx * k * len / n, z = p[1] + dz * k * len / n;
      const a = [x - dx * 0.08, z - dz * 0.08], bb = [x + dx * 0.08, z + dz * 0.08];
      prismWalls(b, [[a[0], a[1]], [bb[0], bb[1]], [bb[0] + nx * depth, bb[1] + nz * depth], [a[0] + nx * depth, a[1] + nz * depth]], y0, y1, null, col);
    }
  }
}
function crownLights(ctx, poly, y, col) {
  const b = ctx.W.b('neon', poly[0][0], poly[0][1]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]; const len = Math.hypot(q[0] - p[0], q[1] - p[1]); const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len; const nx = dz * 0.12, nz = -dx * 0.12;
    prismWalls(b, [[p[0], p[1]], [q[0], q[1]], [q[0] + nx, q[1] + nz], [p[0] + nx, p[1] + nz]], y, y + 0.35, null, col);
  }
}
function downtownBlock(ctx, b, palms, trees) {
  const [ix0, iz0, ix1, iz1] = b.inner;
  const W = ctx.W; const w = ix1 - ix0, d = iz1 - iz0;
  const parcels = [];
  if (d > 110) { const m = iz0 + d * rand(0.4, 0.6); parcels.push([ix0, iz0, ix1, m - 3], [ix0, m + 3, ix1, iz1]); }
  else parcels.push([ix0, iz0, ix1, iz1]);
  const distBay = Math.abs(b.x1 + 560);
  for (const p of parcels) {
    const [x0, z0, x1, z1] = p; const pw = x1 - x0, pd = z1 - z0;
    const podH = 0.15 + rand(8, 18);
    const kind = rng();
    const tall = Math.max(45, rand(80, 270) * (1 - distBay / 1000));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    volume(ctx, rect(x0 + 1, z0 + 1, x1 - 1, z1 - 1), 0.15, podH, { style: rng() < 0.5 ? 0 : 2, fh: 4.0, ww: 3.5, wall: [0.78, 0.77, 0.74], glass: pick(GLASS), store: true });
    const tw = Math.min(pw - 8, rand(26, 44)), td = Math.min(pd - 8, rand(26, 44));
    const tx0 = cx - tw / 2, tx1 = cx + tw / 2, tz0 = cz - td / 2, tz1 = cz + td / 2;
    rooftop(ctx, x0 + 1, z0 + 1, x1 - 1, z1 - 1, podH, 'pod', [[tx0 - 2, tz0 - 2, tx1 + 2, tz1 + 2]]);
    const lightCol = pick([[0.62, 0.6, 0.56], [0.7, 0.6, 0.45]]); // r6.1 plain white / warm crown floodlights (no coloured LED crowns on 索拉纳港)
    if (kind < 0.3) { // glass curtain-wall tower, chamfered, setback, vertical fins
      const glass = pick(GLASS); const ch = rng() < 0.6 ? rand(2, 6) : 0;
      const poly = ch ? chamfer(tx0, tz0, tx1, tz1, ch) : rect(tx0, tz0, tx1, tz1);
      const h1 = podH + tall * rand(0.6, 0.8);
      volume(ctx, poly, podH, h1, { style: 0, fh: 3.8, ww: rand(1.5, 2.2), wall: [0.55, 0.58, 0.6], glass, collide: false });

      const s = rand(2.5, 5); const poly2 = ch ? chamfer(tx0 + s, tz0 + s, tx1 - s, tz1 - s, ch) : rect(tx0 + s, tz0 + s, tx1 - s, tz1 - s);
      volume(ctx, poly2, h1, podH + tall, { style: 0, fh: 3.8, ww: rand(1.5, 2.2), wall: [0.55, 0.58, 0.6], glass, collide: false });
      // v3.5 crown: glass screen wall rising above the roof hides the plant; slim mullions continue; open top with a ledge
      const ch2 = rand(5, 11); const poly3 = ch ? chamfer(tx0 + s + 0.4, tz0 + s + 0.4, tx1 - s - 0.4, tz1 - s - 0.4, ch) : rect(tx0 + s + 0.4, tz0 + s + 0.4, tx1 - s - 0.4, tz1 - s - 0.4);
      volume(ctx, poly3, podH + tall, podH + tall + ch2, { style: 0, fh: ch2, ww: rand(1.5, 2.2), wall: [0.55, 0.58, 0.6], glass, collide: false, lite: true });
      box(W.b('metal', cx, cz), tx0 + s + 3, podH + tall, tz0 + s + 3, tx1 - s - 3, podH + tall + ch2 - 1.5, tz1 - s - 3);
      crownLights(ctx, poly3, podH + tall + ch2 - 0.6, lightCol);
      if (rng() < 0.4) { const sp = W.b('metal', cx, cz); box(sp, cx - 0.4, podH + tall, cz - 0.4, cx + 0.4, podH + tall + rand(20, 45), cz + 0.4); }
    } else if (kind < 0.45) { // round glass tower
      const r = Math.min(tw, td) / 2; const poly = circlePoly(cx, cz, r, 22); const glass = pick(GLASS);
      volume(ctx, poly, podH, podH + tall, { style: 0, fh: 3.7, ww: 2.0, wall: [0.6, 0.62, 0.64], glass, collide: false });
      const ch2 = rand(4, 8); volume(ctx, circlePoly(cx, cz, r * 0.97, 22), podH + tall, podH + tall + ch2, { style: 0, fh: ch2, ww: 2.0, wall: [0.6, 0.62, 0.64], glass, collide: false, lite: true });
      crownLights(ctx, circlePoly(cx, cz, r * 0.97, 22), podH + tall + ch2 - 0.6, lightCol);
      rooftop(ctx, cx - r * 0.6, cz - r * 0.6, cx + r * 0.6, cz + r * 0.6, podH + tall);
    } else if (kind < 0.8) { // white residential tower with deep balconies, sometimes two slender slabs
      const fh = 3.2; const top = podH + tall * rand(0.65, 0.9);
      const twin = rng() < 0.35 && tw > 30;
      const parts = twin ? [[tx0, tz0, tx0 + tw * 0.42, tz1], [tx1 - tw * 0.42, tz0, tx1, tz1]] : [[tx0, tz0, tx1, tz1]];
      parts.forEach(([a0, b0, a1, b1], k) => {
        const tt = top - k * rand(0, 25);
        volume(ctx, rect(a0, b0, a1, b1), podH, tt, { style: 1, fh, ww: 3.3, wall: [0.95, 0.95, 0.94], glass: pick(GLASS), collide: false });
        condoSlabs(ctx, a0, b0, a1, b1, podH, tt, fh, rand(1.4, 2.2));
        rooftop(ctx, a0, b0, a1, b1, tt);
        { // v3.5 floating roof canopy on slim columns (residential crown)
          const v = ctx.W.b('vcol', (a0 + a1) / 2, (b0 + b1) / 2); const hc = rand(4, 6.5), wc = [0.95, 0.95, 0.94];
          box(v, a0 - 1.5, tt + hc, b0 - 1.5, a1 + 1.5, tt + hc + 0.5, b1 + 1.5, {}, wc, false);
          for (const [px, pz] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) box(v, px - 0.25, tt, pz - 0.25, px + 0.25, tt + hc, pz + 0.25, {}, wc);
          crownLights(ctx, rect(a0 - 1.5, b0 - 1.5, a1 + 1.5, b1 + 1.5), tt + hc - 0.05, [0.9, 0.95, 1.0]); }
      });
    } else { // stepped concrete office tower
      const top = podH + tall * 0.6; const wall = pick([[0.85, 0.82, 0.78], [0.9, 0.88, 0.84], [0.72, 0.7, 0.68]]); const glass = pick(GLASS);
      const h1 = podH + (top - podH) * 0.55, h2 = podH + (top - podH) * 0.82;
      volume(ctx, rect(tx0, tz0, tx1, tz1), podH, h1, { style: 2, fh: 3.6, ww: 2.2, wall, glass, collide: false });
      volume(ctx, rect(tx0 + 3, tz0 + 3, tx1 - 3, tz1 - 3), h1, h2, { style: 2, fh: 3.6, ww: 2.2, wall, glass, collide: false });
      volume(ctx, rect(tx0 + 6, tz0 + 6, tx1 - 6, tz1 - 6), h2, top, { style: 2, fh: 3.6, ww: 2.2, wall, glass, collide: false });
      rooftop(ctx, tx0 + 6, tz0 + 6, tx1 - 6, tz1 - 6, top);
    }
  }
}


// ===================================================================== v4.0 =====
// Edges of the playable district: road-closed barricades where the avenues meet the seawall, and a stone jetty (groyne) with a
// concrete walkway, railings and a lamp at each end of the beach — it stops the beach walk and frames the shoreline.
function districtEdges(ctx, deco) {
  const L = LAYOUT; const { W, col, lamps } = ctx;
  const v = W.b('vcol', 200, 0);
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (const sg of [-1, 1]) {
    const zE = sg * L.islandZ[1];
    // barricades across each avenue end (striped boards on A-frames) + a few water-filled barriers
    for (const x of L.islandNS) {
      const z = zE - sg * 2.2;
      for (let k = -2; k <= 2; k++) {
        const x0 = x + k * 2.9 - 1.3, x1 = x + k * 2.9 + 1.3;
        for (const yy of [0.55, 0.95]) for (let s = 0; s < 6; s++) { const a = x0 + (x1 - x0) * s / 6, b = x0 + (x1 - x0) * (s + 1) / 6;
          box(v, a, yy, z - 0.03, b, yy + 0.22, z + 0.03, {}, s % 2 ? [0.95, 0.95, 0.93] : [0.95, 0.35, 0.08], false); }
        for (const xx of [x0 + 0.15, x1 - 0.15]) { box(v, xx - 0.04, 0, z - 0.35, xx + 0.04, 1.2, z - 0.28, {}, [0.85, 0.85, 0.82]); box(v, xx - 0.04, 0, z + 0.28, xx + 0.04, 1.2, z + 0.35, {}, [0.85, 0.85, 0.82]); }
        box(v, (x0 + x1) / 2 - 0.09, 1.2, z - 0.09, (x0 + x1) / 2 + 0.09, 1.38, z + 0.09, {}, [1.0, 0.65, 0.1]); // amber flasher
      }
      col.add(x - RH, z - 0.5, x + RH, z + 0.5, 1.2, 'barrier');
    }
    // EW streets dead-end at the bay seawall (west): same barricade, turned
    if (sg > 0) for (const zc of L.islandEW) { if (zc === 0) continue; /* r5.0: z=0 continues as 日光堤道 */ const x = L.islandX[0] + 2.2;
      for (let k = -2; k <= 2; k++) { const z0 = zc + k * 2.9 - 1.3, z1 = zc + k * 2.9 + 1.3;
        for (const yy of [0.55, 0.95]) for (let s = 0; s < 6; s++) { const a = z0 + (z1 - z0) * s / 6, b = z0 + (z1 - z0) * (s + 1) / 6;
          box(v, x - 0.03, yy, a, x + 0.03, yy + 0.22, b, {}, s % 2 ? [0.95, 0.95, 0.93] : [0.95, 0.35, 0.08], false); }
        for (const zz of [z0 + 0.15, z1 - 0.15]) { box(v, x - 0.35, 0, zz - 0.04, x - 0.28, 1.2, zz + 0.04, {}, [0.85, 0.85, 0.82]); box(v, x + 0.28, 0, zz - 0.04, x + 0.35, 1.2, zz + 0.04, {}, [0.85, 0.85, 0.82]); }
        box(v, x - 0.09, 1.2, (z0 + z1) / 2 - 0.09, x + 0.09, 1.38, (z0 + z1) / 2 + 0.09, {}, [1.0, 0.65, 0.1]); }
      col.add(x - 0.5, zc - RH, x + 0.5, zc + RH, 1.2, 'barrier'); }
    // v4.1 bay seawall: coping cap, rip-rap toe at the waterline, cast-iron bollards (west edge, once)
    if (sg > 0) { const xw = L.islandX[0];
      box(W.b('concrete', xw, 0), xw - 0.35, 0.0, -L.islandZ[1], xw + 0.25, 0.22, -RH - 2.5); box(W.b('concrete', xw, 0), xw - 0.35, 0.0, RH + 2.5, xw + 0.25, 0.22, L.islandZ[1]);
      for (let z = -L.islandZ[1]; z < L.islandZ[1]; z += 1.3) { const s2 = rand(0.7, 1.4), c = rand(0.38, 0.55);
        _m4.makeRotationFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))).scale(new THREE.Vector3(s2 * 1.2, s2 * 0.7, s2)).setPosition(xw - rand(0.8, 3.2), L.waterY + rand(-0.6, 0.3), z);
        v.geom(rock, _m4, {}, [c, c * 0.97, c * 0.9]); }
      const bol = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10); const cap = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      for (let z0 = -L.islandZ[1] + 10; z0 < L.islandZ[1]; z0 += 16) { if (Math.abs(z0) < RH + 4) continue; let z = z0; if (!EDGE_OFF) { const c = L.islandEW.find((e) => Math.abs(z0 - e) < RH + 1); if (c !== undefined) z = c + (z0 >= c ? 1 : -1) * (RH + 1.5); } /* a_edgewalls: the row also stood in the cross-street ends at the seawall -> slid onto the sidewalk */ _m4.makeTranslation(xw + 1.0, 0.4, z); v.geom(bol, _m4, {}, [0.12, 0.13, 0.14]); (ctx.clutAdd = ctx.clutAdd || []).push({ k: 'swbol', x: xw + 1.0, z, ang: 0, hl: 0.18, hw: 0.18, h: 0.85 }); /* a_edgewalls: cast-iron seawall bollard had no box */ _m4.makeTranslation(xw + 1.0, 0.65, z); v.geom(cap, _m4, {}, [0.12, 0.13, 0.14]); }
    }
    // jetty: rubble mound of boulders, concrete deck, rails, end lamp
    const zj = zE + sg * 6, x0 = L.beachX[0] + 38, x1 = L.beachX[1] + 45; // r5.0: jetty root starts past the dry sand so the beach walk continues
    for (let x = x0; x < x1 + 4; x += 1.4) for (let k = 0; k < 3; k++) {
      const s = rand(0.9, 1.9); const zz = zj + rand(-4.2, 4.2); const t = (x - L.beachX[0]) / (L.beachX[1] - L.beachX[0]);
      const y = Math.min(0.2, 0.2 - Math.max(0, t) * 2.2) + rand(-0.4, 0.3);
      const c = rand(0.42, 0.62); _m4.makeRotationFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))).scale(new THREE.Vector3(s * rand(0.8, 1.3), s * 0.7, s)).setPosition(x, y, zz);
      v.geom(rock, _m4, {}, [c * 1.02, c * 0.97, c * 0.88]);
    }
    const dy = 0.95;
    box(W.b('concrete', (x0 + x1) / 2, zj), x0, -1.5, zj - 1.6, x1, dy, zj + 1.6);
    box(v, x1 - 3, -1.5, zj - 2.4, x1 + 0.5, dy + 0.05, zj + 2.4, {}, [0.72, 0.71, 0.68]); // round-head platform
    const m = W.b('metal', (x0 + x1) / 2, zj);
    for (const e of [-1.45, 1.45]) {
      for (let x = x0 + 1; x < x1; x += 2.2) box(m, x - 0.035, dy, zj + e - 0.035, x + 0.035, dy + 1.05, zj + e + 0.035);
      for (const y of [dy + 1.0, dy + 0.55]) box(m, x0 + 1, y, zj + e - 0.03, x1 - 0.2, y + 0.05, zj + e + 0.03);
    }
    lamps.push({ x: x1 - 1.2, z: zj + 1.2, y: dy, dir: [0, -sg], kind: 'bridge' });
    col.add(x0, zj - 4.5, x1 + 4, zj + 4.5, 1.6, 'rail');
    // walls the sand off past the jetty so the beach ends at the rocks
    // (r5.0: the sand wall past the jetty is gone — the beach continues to the island tips)
  }
}

// Far skyline: downtown across the bay + condo strips up/down the coast. Plain extruded volumes with the facade shader only
// (no relief, no colliders, no roofs clutter) — the whole skyline costs a few thousand triangles.
function skyline(ctx) {
  const glassT = [[0.10, 0.20, 0.24], [0.16, 0.24, 0.30], [0.22, 0.26, 0.28], [0.12, 0.18, 0.22]];
  const lightCols = [[0.62, 0.6, 0.56], [0.7, 0.6, 0.45]];
  // r6.3 (ground_a): towers used to stand on bare grass at random spots. Phase 1 runs the original code on a scratch context so the
  // shared rng sequence is exactly as before (and records every pick); phase 2 snaps the downtown towers into the fabric's paved
  // blocks (shrunk / slid / dropped if they would hit a street or a neighbour) and builds them for real, replaying the picks.
  const recs = []; const SCR = { W: new World(1e6), col: { add() {}, addOBB() {} }, ds: null };
  let REC = null, REPLAY = null, CUR_B = null; const draw = (f) => { if (REPLAY) return REPLAY.shift(); const v = f(); REC.push(v); return v; };
  const rngR = () => draw(rng), pickR = (a) => draw(() => pick(a));
  const tower = (cx, cz, w, d, h, kind) => { REC = []; build(SCR, cx, cz, w, d, h, kind); recs.push({ cx, cz, w, d, h, kind, picks: REC, seed: Math.floor(cx * 31 + cz * 17) }); REC = null; };
  const build = (ctx, cx, cz, w, d, h, kind) => {
    const opt = { collide: false, relief: false }; const rng = rngR, pick = pickR;
    const tdet = (poly, wall) => { if (ctx.fab && CUR_B) (ctx.fab.dtTowers || (ctx.fab.dtTowers = [])).push({ kind, poly, cx, cz, w, d, h, wall, b: CUR_B, cb: tcb }); if (!ctx.ds) return; const p = { kind, poly, cx, cz, w, d, h, wall, dt: !!CUR_B }; /* a_downtown: downtown towers recorded for the podium pass (no rng draws) */ ctx.ds.add(cx, cz, Math.max(w, d) / 2 + 4, job('tower', (Wd) => towerDetail(Wd, p))); };
    const tcb = ctx.col.add(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h, 'bld'); /* a_downtown2: kept so downtown.js can swap it for a fitted one */ // r5.0: the far skyline is reachable now (causeway / island ends)
    if (kind === 0) { const poly = rng() < 0.5 ? chamfer(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, Math.min(w, d) * 0.15) : rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
      volume(ctx, poly, 0, h, { ...opt, style: 0, fh: 3.8, ww: 2, wall: [0.55, 0.58, 0.6], glass: pick(glassT) });
      if (rng() < 0.6) crownLights(ctx, poly, h - 0.6, pick(lightCols)); tdet(poly); }
    else if (kind === 1) { const poly = circlePoly(cx, cz, Math.min(w, d) / 2, 14);
      volume(ctx, poly, 0, h, { ...opt, style: 0, fh: 3.7, ww: 2, wall: [0.6, 0.62, 0.64], glass: pick(glassT) }); crownLights(ctx, poly, h - 0.6, pick(lightCols)); tdet(poly); }
    else if (kind === 2) { volume(ctx, rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2), 0, h, { ...opt, style: 1, fh: 3.2, ww: 3.3, wall: [0.95, 0.95, 0.94], glass: pick(glassT) }); tdet(rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)); }
    else { const wall = pick([[0.85, 0.82, 0.78], [0.9, 0.88, 0.84], [0.95, 0.9, 0.82]]); volume(ctx, rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2), 0, h, { ...opt, style: 2, fh: 3.6, ww: 2.2, wall, glass: pick(glassT) }); tdet(rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2), wall); }
  };
  // downtown: densest + tallest toward the centre (z≈-100), shorter to the sides; first row low bayfront condos
  for (let z = -900; z < 900; z += rand(34, 58)) {
    const f = Math.exp(-Math.pow((z + 100) / 520, 2));
    tower(SKY_X - rand(40, 70), z, rand(24, 34), rand(20, 30), rand(25, 60) + f * 40, 2);
    for (let r = 0; r < 3; r++) { if (rng() > 0.35 + f * 0.6) continue;
      tower(SKY_X - 130 - r * 120 - rand(0, 60), z + rand(-15, 15), rand(26, 44), rand(26, 44), 40 + f * rand(90, 230) * (1 - r * 0.2), randi(0, 3)); }
  }
  const L = LAYOUT; void L;
  coastStrips(tower);
  // phase 2: snap + build
  const fab = ctx.fab;
  for (const r of recs) {
    const b = fab && fab.blockAt(r.cx, r.cz);
    if (b) {
      let w = r.w, d = r.d; if (r.kind === 1) w = d = Math.min(w, d);
      w = Math.min(w, b.ix1 - b.ix0 - 2); d = Math.min(d, b.iz1 - b.iz0 - 2); const s = w / r.w; if (r.kind === 1) d = w; void s;
      const cl = (v, a, c) => Math.max(a, Math.min(c, v)); const fits = (x, z) => !b.towers.some((t) => x - w / 2 - 4 < t[2] && x + w / 2 + 4 > t[0] && z - d / 2 - 4 < t[3] && z + d / 2 + 4 > t[1]);
      let x = cl(r.cx, b.ix0 + 1 + w / 2, b.ix1 - 1 - w / 2), z = cl(r.cz, b.iz0 + 1 + d / 2, b.iz1 - 1 - d / 2);
      if (!fits(x, z)) { let best = null, bd = 1e9; for (let zz = b.iz0 + 1 + d / 2; zz <= b.iz1 - 1 - d / 2; zz += 2) for (let xx = b.ix0 + 1 + w / 2; xx <= b.ix1 - 1 - w / 2; xx += 2) { const dd = Math.hypot(xx - x, zz - z); if (dd < bd && fits(xx, zz)) { bd = dd; best = [xx, zz]; } } if (!best) continue; [x, z] = best; }
      b.towers.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, r.h]); r.cx = x; r.cz = z; r.w = w; r.d = d;
    }
    CUR_B = b || null; REPLAY = r.picks.slice(); withSeed(r.seed >>> 0, () => build(ctx, r.cx, r.cz, r.w, r.d, r.h, r.kind)); REPLAY = null; CUR_B = null;
  }
}
// coast to the north and south of the district (beyond the jetties): condo/hotel strips on the barrier island
function coastStrips(tower) {
  const L = LAYOUT; void L;
  for (const sg of [-1, 1]) {
    // r5.0: no rectangular pads any more — towers stand on the natural island-end ground (region.js), inside its coastline
    for (let z = 660; z < 1300; z += rand(32, 52)) { const zz = sg * z; const xe = 335 + beachOff(zz) - 22, xw = westCoast(zz) + 22;
      if (xe - 26 > xw) tower(Math.min(xe - 14, rand(250, 300)), zz, rand(22, 30), rand(18, 26), rand(20, 70) + (z > 900 ? rand(0, 50) : 0), rng() < 0.6 ? 2 : 3);
      const xm = rand(Math.max(xw + 16, 40), Math.min(xe - 60, 170)); if (rng() < 0.55 && xm < xe - 60) tower(xm, sg * (z + rand(-10, 10)), rand(24, 32), rand(24, 32), rand(25, 80), randi(0, 4)); }
  }
}


// ---------------------------------------------------------------- v4.3 map additions (MAP_DESIGN.md) ----
// container yard on a bay corner block: stacked containers (colliders = cover), a cold store / shed, a low-poly gantry crane, fence
function yard(ctx, b, kind) {
  const { W, col } = ctx; const [ix0, iz0, ix1, iz1] = b.inner; const v = W.b('vcol', (ix0 + ix1) / 2, (iz0 + iz1) / 2);
  const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
  polyCap(W.b('concrete', cx, cz), rect(ix0, iz0, ix1, iz1), 0.2); // V9 r6.2: 5 cm over the lot pavers (0.15), was 1 cm -> z-fight
  const CC = [[0.62, 0.16, 0.12], [0.12, 0.32, 0.55], [0.85, 0.55, 0.12], [0.2, 0.45, 0.3], [0.55, 0.55, 0.55], [0.75, 0.75, 0.72], [0.45, 0.2, 0.35]];
  const cover = [];
  const container = (x, z, y, rot, c) => { // 12.2 x 2.44 x 2.6, corrugation ribs + door end
    const L2 = rot ? 1.22 : 6.1, W2 = rot ? 6.1 : 1.22;
    box(v, x - L2, y, z - W2, x + L2, y + 2.6, z + W2, {}, c, false);
    const dark = c.map((q) => q * 0.72);
    for (let k = -9; k <= 9; k++) { const o = k * 0.62; if (rot) box(v, x - 1.25, y + 0.1, z + o - 0.06, x + 1.25, y + 2.5, z + o + 0.06, {}, dark, false); else box(v, x + o - 0.06, y + 0.1, z - 1.25, x + o + 0.06, y + 2.5, z + 1.25, {}, dark, false); }
    if (y < 0.5) { col.add(x - L2, z - W2, x + L2, z + W2, y + 2.6 + 2.6, 'container'); cover.push({ x, z }); }
  };
  if (kind === 'depot') {
    // cold store: white insulated shed with roller doors + loading dock (mission start)
    const sx0 = ix0 + 2, sx1 = ix0 + 22, sz0 = iz0 + 2, sz1 = iz1 - 16;
    volume(ctx, rect(sx0, sz0, sx1, sz1), 0.16, 8.5, { style: 2, fh: 8.3, ww: 12, wall: [0.92, 0.93, 0.94], glass: [0.2, 0.22, 0.24], relief: false });
    box(v, sx1, 0.16, sz0 + 4, sx1 + 3, 1.3, sz1 - 4, {}, [0.55, 0.55, 0.52]);
    col.add(sx1, sz0 + 4, sx1 + 3, sz1 - 4, 1.3, 'dock');
    for (let k = 0; k < 3; k++) { const z = sz0 + 8 + k * 9; box(v, sx1 + 0.02, 1.3, z - 1.6, sx1 + 0.06, 4.6, z + 1.6, {}, [0.75, 0.32, 0.18], false); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) container(ix1 - 10, iz0 + 7 + i * 4.2 + j * 30, 0.16, false, pick(CC));
    for (let i = 0; i < 3; i++) container(ix1 - 10, iz0 + 7 + i * 4.2, 2.76, false, pick(CC));
  } else {
    // old shipyard: maze of containers + rusty shed (gang turf)
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { if ((i + j) % 4 === 3) continue; const x = ix0 + 9 + j * 16, z = iz0 + 6 + i * 10;
      container(x, z, 0.16, false, pick(CC)); if (rng() < 0.45) container(x, z, 2.76, false, pick(CC)); }
    volume(ctx, rect(ix1 - 12, iz1 - 16, ix1 - 1, iz1 - 2), 0.16, 6.5, { style: 2, fh: 6.3, ww: 8, wall: [0.55, 0.42, 0.34], glass: [0.12, 0.12, 0.12], relief: false });
  }
  // gantry crane over the yard (legs collide)
  { const gx0 = ix0 + 3, gx1 = ix1 - 3, gz = kind === 'depot' ? iz1 - 8 : iz0 + 2; const Y = [0.9, 0.62, 0.1];
    for (const x of [gx0, gx1]) for (const dz of [-3, 3]) { box(v, x - 0.5, 0.16, gz + dz - 0.5, x + 0.5, 22, gz + dz + 0.5, {}, Y); col.add(x - 0.5, gz + dz - 0.5, x + 0.5, gz + dz + 0.5, 22, 'crane'); }
    box(v, gx0 - 6, 22, gz - 3.6, gx1 + 6, 24, gz - 2.4, {}, Y); box(v, gx0 - 6, 22, gz + 2.4, gx1 + 6, 24, gz + 3.6, {}, Y);
    box(v, (gx0 + gx1) / 2 - 2, 20.5, gz - 2.4, (gx0 + gx1) / 2 + 2, 22, gz + 2.4, {}, [0.25, 0.25, 0.27]); }
  // chain-link fence posts along the street sides (gap = gate)
  const m = W.b('metal', cx, cz);
  for (let x = ix0; x <= ix1; x += 3) for (const z of [iz0 - 0.2, iz1 + 0.2]) if (Math.abs(x - cx) > 5) box(m, x - 0.04, 0.16, z - 0.04, x + 0.04, 2.2, z + 0.04);
  ctx.yards.push({ kind, x: cx, z: cz, x0: ix0, z0: iz0, x1: ix1, z1: iz1, cover });
}

// 鹈鹕游艇港: timber decks on piles + moored motor yachts; the deck is walkable/drivable (groundH 0.15 over PIERS)
function marina(ctx) {
  const { W } = ctx; const L = LAYOUT;
  for (const p of PIERS) {
    const v = W.b('vcol', (p.x0 + p.x1) / 2, p.z);
    box(v, p.x0, -0.1, p.z - p.hw, p.x1, 0.15, p.z + p.hw, {}, [0.42, 0.32, 0.22], false);
    for (let x = p.x0 + 0.5; x < p.x1; x += 1.2) box(v, x - 0.02, 0.15, p.z - p.hw, x + 0.02, 0.152, p.z + p.hw, {}, [0.3, 0.22, 0.15], false); // plank gaps
    for (let x = p.x0 + 1; x < p.x1; x += 4) for (const sz of [-1, 1]) box(v, x - 0.15, L.waterY - 2, p.z + sz * (p.hw - 0.15) - 0.15, x + 0.15, 0.5, p.z + sz * (p.hw - 0.15) + 0.15, {}, [0.3, 0.24, 0.18]);
    // dock lamps on the outer end (night practicals)
    ctx.lamps.push({ x: p.x0 + 2, z: p.z + p.hw - 0.3, y: 0.15, dir: [0, -1], kind: 'dock' });
    // yachts on both sides
    for (const sz of [-1, 1]) for (let x = p.x0 + 8; x < p.x1 - 8; x += rand(13, 17)) {
      if (rng() < 0.25) continue; const Lh = rand(9, 14), Bh = rand(3, 3.8); const zc = p.z + sz * (p.hw + Bh / 2 + 0.8);
      const hull = new THREE.CylinderGeometry(Bh / 2, Bh / 2 * 0.75, Lh, 14, 1); hull.rotateZ(Math.PI / 2); hull.scale(1, 0.55, 1);
      gput(v, hull, x, L.waterY + 0.7, zc, [0.94, 0.94, 0.92]);
      const bow = new THREE.ConeGeometry(Bh / 2, 3, 14); bow.rotateZ(-Math.PI / 2); bow.scale(1, 0.55, 1); gput(v, bow, x + Lh / 2 + 1.5, L.waterY + 0.7, zc, [0.94, 0.94, 0.92]);
      box(v, x - Lh / 2, L.waterY + 0.25, zc - Bh / 2 - 0.02, x + Lh / 2, L.waterY + 0.45, zc + Bh / 2 + 0.02, {}, pick([[0.1, 0.2, 0.45], [0.1, 0.1, 0.1], [0.6, 0.1, 0.1]]), false);
      box(v, x - Lh * 0.3, L.waterY + 1.2, zc - Bh * 0.35, x + Lh * 0.15, L.waterY + 2.6, zc + Bh * 0.35, {}, [0.9, 0.9, 0.88], false);
      box(v, x - Lh * 0.28, L.waterY + 1.7, zc - Bh * 0.36, x + Lh * 0.13, L.waterY + 2.3, zc + Bh * 0.36, {}, [0.08, 0.12, 0.16], false);
    }
  }
}

// skyline guides: lighthouse at the south jetty head, 「海风之眼」 Ferris wheel at the north end of the beach
function landmarks(ctx) {
  const { W, col } = ctx;
  { const x = 528, z = -374; const v = W.b('vcol', x, z);
    const tw = new THREE.CylinderGeometry(1.7, 2.6, 24, 18, 6); tw.translate(0, 12, 0);
    const red = new THREE.CylinderGeometry(2.02, 2.22, 5, 18); red.translate(0, 12.5, 0); gput(v, red, x, -0.5, z, [0.78, 0.1, 0.08]);
    v.geom(tw, new THREE.Matrix4().makeTranslation(x, -0.5, z), {}, [1, 1, 1]);
    box(v, x - 2.4, 23.4, z - 2.4, x + 2.4, 23.8, z + 2.4, {}, [0.15, 0.15, 0.15]);
    const lan = new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12); gput(W.b('neon', x, z), lan, x, 25, z, [1.0, 0.85, 0.5]);
    const cap = new THREE.ConeGeometry(1.6, 1.6, 12); gput(v, cap, x, 27, z, [0.8, 0.12, 0.1]);
    col.add(x - 2.6, z - 2.6, x + 2.6, z + 2.6, 30, 'lighthouse');
   }
  { const x = 384, z = 352, R = 16, H = R + 3; const v = W.b('vcol', x, z); const n = W.b('neon', x, z);
    for (const sz of [-1.2, 1.2]) {
      const rim = new THREE.TorusGeometry(R, 0.22, 6, 64); gput(v, rim, x, H, z + sz, [0.95, 0.95, 0.95]);
      const rim2 = new THREE.TorusGeometry(R + 0.35, 0.07, 4, 64); gput(n, rim2, x, H, z + sz, [0.9, 0.72, 0.45]); // r6.1 warm bulb ring
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const sp = new THREE.CylinderGeometry(0.07, 0.07, R, 4); sp.translate(0, R / 2, 0); sp.rotateZ(a); gput(v, sp, x, H, z + sz, [0.9, 0.9, 0.9]); }
      for (const dx of [-1, 1]) { const leg = new THREE.CylinderGeometry(0.3, 0.45, Math.hypot(H, R * 0.55), 6); const ang = Math.atan2(R * 0.55, H) * dx; leg.translate(0, Math.hypot(H, R * 0.55) / 2, 0); leg.rotateZ(ang); gput(v, leg, x - dx * R * 0.55, 0, z + sz * 1.3, [0.9, 0.9, 0.9]); }
    }
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.1; const gx = x + Math.cos(a) * R, gy = H + Math.sin(a) * R;
      box(v, gx - 0.8, gy - 2.2, z - 0.9, gx + 0.8, gy - 0.6, z + 0.9, {}, pick([[0.95, 0.4, 0.45], [0.25, 0.65, 0.75], [0.98, 0.8, 0.3], [0.95, 0.95, 0.92]])); }
    box(v, x - 4, 0, z - 3, x + 4, 2.4, z + 3, {}, [0.85, 0.82, 0.76]); col.add(x - R * 0.7, z - 3, x + R * 0.7, z + 3, 6, 'wheel'); }
}
