// a_strip (map 索拉纳港 only): close-range detail for the mainland arterial commercial strips (strip malls along the arterials,
// their striped lots, the pad buildings out in the lots), read against the South-Florida arterial look. All original names.
// Runs after every earlier pass (curbfix -> propfix -> parkfix -> edgewalls -> houses' prep), reads the final records and the
// fabric's strip metadata (fab.strips, written without any random draw), draws no random numbers itself (variation from each
// record's own seed via a hash), so the curbbake / parkbake tapes keep their inputs.
//  - strip-mall shops: the fabBody retail shader switches to a "strip" face set (shop record fraction = lot-side normal angle):
//    storefront glazing on a 1.5 m mullion grid with tile bulkhead + transom only on the lot face, service walls with steel doors
//    at the back, plain end walls, no painted sign band. Kit per shop: raised front walk with kerb, continuous canopy (soffit +
//    1.1 m sign-band fascia), square columns with base and cap, demising piers between tenants, a glazed double-door entrance
//    per tenant (on the mullion grid), a light-box sign per tenant on the fascia (original shop names, rasterised by the shared
//    signage rasteriser into instanced thin decals), parapet coping, rooftop units, CMU dumpster enclosures with gates behind.
//  - per band: lot light poles (twin heads) on the double-row stall heads, a pylon sign (plaza name + tenant panels) at one end;
//    some bands without a pad building get a filling station at the other end (concrete apron painted by the lot shader, canopy with
//    lit soffit, three pump islands with dispensers + bollards, cashier kiosk, price sign); the cars parked on it are removed.
//  - pad buildings become drive-through fast-food restaurants: wall sign, entrance, drive-through lane along the back with
//    edge lines + arrows painted by the lot shader (no stalls there), menu board, speaker post, pickup window + awning, clearance
//    bar (cars on the lane removed). Aprons / lanes go to fabric.js LOTZ (the lot quad is polygon-offset, boxes over it lose).
//  - one InstancedMesh pool on the fabBody program (casters + non-casters, KIT_LAYER, dissolves like a_housepolish) and one
//    InstancedMesh of text decals on the 'fabCar' program: no new shader program. Colliders for every standing piece.
//  &nostrip switches the layer off, &stripaudit counts / checks everything eagerly (region.stripAudit).
import * as THREE from 'three';
import { fabKit, LOTZ, OLD_ANIGHT, OLD_ASHOP } from './fabric.js';
import { prep } from '../../mats.js';
import { U } from '../../env.js';
import { raster, FONT } from './raster.js';
import { KIT_LAYER } from './houses.js';
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const STRIP_OFF = Q.has('nostrip');
const AUDIT = Q.has('stripaudit');
const RAD = 110, NEAR = 50, FADE = 14, FADE1 = 8, CAP = 2600, NF = 21, TCAP = 9000, TXT_R = 80, TXT_RL = 125, TFADE = 14, TMOVE = 1.5; // a_stripfix: text dissolves over its last 14 m
const hh = (s, k) => { const x = Math.sin(s * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const axes = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
// a_shopnight: is a tenant open at night? Its own hash sub-stream (k 97, never drawn before; the layout's draws are untouched), with
// a closing rate by trade: late trades (food, pharmacy, convenience, gym, liquor) mostly open, office-hours trades mostly closed.
const LATE = new Set(['椰林药房', '鲜果冰沙', '老街面馆', '好运便利', '小岛咖啡', '椰子甜品', '海盐寿司', '活力健身', '街角披萨', '渔夫海鲜', '日落酒铺', '椰香奶茶']);
const DAYT = new Set(['阳光牙科', '南湾保险', '东湾税务', '湾区房产', '安心诊所', '速印快印', '顺风快递', '海港五金', '鹈鹕洗车', '彩虹干洗', '晨光书店']);
const shopOpen = (name, seed, i) => hh(seed * 5.17 + i * 0.731 + 0.29, 97) >= (LATE.has(name) ? 0.12 : DAYT.has(name) ? 0.85 : 0.45);
const fangP = (P, a, b) => { const p = P(a, b), q = P(a + 1, b); return Math.atan2(-(q[1] - p[1]), q[0] - p[0]); };
class Grid { constructor(C) { this.C = C; this.m = new Map(); }
  add(o, x0, z0, x1, z1) { const C = this.C; for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const k = i * 65536 + j; let l = this.m.get(k); if (!l) this.m.set(k, l = []); l.push(o); } }
  // a_stripfix: dedupe by a query stamp on the object instead of a new Set per query (same visiting order, no garbage)
  near(x0, z0, x1, z1, f) { const C = this.C; const i0 = Math.floor(x0 / C), i1 = Math.floor(x1 / C), j0 = Math.floor(z0 / C), j1 = Math.floor(z1 / C);
    if (i0 === i1 && j0 === j1) { const l = this.m.get(i0 * 65536 + j0); if (l) for (let k = 0; k < l.length; k++) if (f(l[k])) return true; return false; }
    const st = ++STAMP; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = this.m.get(i * 65536 + j); if (l) for (let k = 0; k < l.length; k++) { const o = l[k]; if (o._st === st) continue; o._st = st; if (f(o)) return true; } } return false; } }
let STAMP = 0;
function obbOverlap(a, b, pad) { const A = axes(a.a), B = axes(b.a); const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of [A[0], A[1], B[0], B[1]]) { const ra = a.hl * Math.abs(A[0][0] * ax + A[0][1] * az) + a.hw * Math.abs(A[1][0] * ax + A[1][1] * az); const rb = b.hl * Math.abs(B[0][0] * ax + B[0][1] * az) + b.hw * Math.abs(B[1][0] * ax + B[1][1] * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb + pad) return false; } return true; }
function circRect(px, pz, r, R) { const [u, v] = axes(R.a); const rx = px - R.x, rz = pz - R.z; const la = rx * u[0] + rz * u[1], lw = rx * v[0] + rz * v[1];
  const ca = Math.max(-R.hl, Math.min(R.hl, la)), cw = Math.max(-R.hw, Math.min(R.hw, lw)); return (la - ca) ** 2 + (lw - cw) ** 2 < r * r; }
const ext = (R, e = 0) => { const ex = Math.abs(Math.cos(R.a)) * R.hl + Math.abs(Math.sin(R.a)) * R.hw + e, ez = Math.abs(Math.sin(R.a)) * R.hl + Math.abs(Math.cos(R.a)) * R.hw + e; return [R.x - ex, R.z - ez, R.x + ex, R.z + ez]; };
const triIn = (px, pz, ax, az, bx, bz, cx, cz) => { const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az); return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))); };
const CARHL = 2.2, CARHW = 0.89; // parkfix's fabric car box

// ---------------------------------------------------------------- names / palettes (all original) ----
const SHOPS = ['椰林药房', '海风洗衣', '阳光牙科', '蓝湾美甲', '鲜果冰沙', '老街面馆', '潮汐手机', '金沙理发', '棕榈宠物', '好运便利', '海岛面包', '珊瑚眼镜',
  '晨光书店', '浪花冲浪', '南湾保险', '小岛咖啡', '速印快印', '椰子甜品', '海港五金', '月光花店', '东湾税务', '顺风快递', '碧水泳具', '甜心烘焙',
  '海盐寿司', '活力健身', '乐乐玩具', '安心诊所', '彩虹干洗', '街角披萨', '渔夫海鲜', '星沙美容', '鹈鹕洗车', '湾区房产', '日落酒铺', '椰香奶茶'];
const PLAZAS = ['椰风广场', '棕榈湾商业中心', '海鸥商业街', '日光购物广场', '珊瑚湾广场', '潮汐市集', '鹈鹕角广场', '海葡萄商业街', '红树林广场', '白沙湾中心'];
const FOOD = [['汉堡湾', '#c8281e', '#ffd23c'], ['炸鸡岛', '#e2731a', '#ffffff'], ['海风塔可', '#127a72', '#ffe9a8'], ['椰岛鸡排', '#2f7d32', '#ffffff']];
const GAS = [['海鸥能源', '#1d4f9a', '#ffffff', [0.11, 0.31, 0.60]], ['棕榈石油', '#2a7a3a', '#ffffff', [0.16, 0.48, 0.23]], ['日光加油', '#c9361d', '#ffffff', [0.79, 0.21, 0.11]]];
const SIGNST = [['#f4f2ec', '#b8231b'], ['#f4f2ec', '#1b4f9e'], ['#f4f2ec', '#1f6b3a'], ['#f4f2ec', '#202020'], ['#1b4f9e', '#ffffff'], ['#a3221a', '#ffffff'], ['#1f6b3a', '#ffffff'], ['#222224', '#f2d36a'], ['#f2e6c8', '#7a3b12'], ['#0f6f78', '#ffffff']];
const TRIM = [[0.93, 0.91, 0.86], [0.56, 0.34, 0.25], [0.22, 0.34, 0.38], [0.30, 0.27, 0.24], [0.86, 0.80, 0.69], [0.93, 0.93, 0.92]];
const CONC = [0.73, 0.72, 0.69], KERB = [0.62, 0.61, 0.58], YEL = [0.82, 0.68, 0.18], CMU = [0.67, 0.66, 0.63], DKB = [0.21, 0.19, 0.17], WHT = [0.94, 0.94, 0.92], RTU = [0.78, 0.79, 0.78];
const LIN = new Map(); const lin = (hex) => { let v = LIN.get(hex); if (!v) { const c = new THREE.Color(hex); LIN.set(hex, v = [c.r, c.g, c.b]); } return v; }; // a_stripfix: cached (read-only uses)
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------------------------------------------------------------- box records ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
// a_stripfix: box records go straight into four growable Float32 arenas (casters far / near, no-cast far / near); a unit's boxes are
// contiguous in each arena (units are filled one after another), packed as subarray views (was: JS number arrays + a copy each)
class Arena { constructor() { this.a = new Float32Array(1 << 16); this.n = 0; }
  room(k) { if (this.n + k > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } } }
function box(out, x, y0, z, sx, sy, sz, a, c, kind, seed) { _q.setFromAxisAngle(_Y, a); _m.compose(_v.set(x, y0, z), _q, _s.set(sx, sy, sz)); const e = _m.elements;
  const A = out.A; if (out.u !== A.cur) throw new Error('strip arena: unit out of order'); A.room(NF); const d = A.a; let n = A.n; for (let k = 0; k < 16; k++) d[n++] = e[k]; d[n++] = c[0]; d[n++] = c[1]; d[n++] = c[2]; d[n++] = kind; d[n++] = seed; A.n = n; }
// a local frame: origin O, along U (box x), out N (box z), angle a. cb(list, s, t, y0, sx, sy, st, c, kind)
function frameAt(O, a, flip) { const [U, V] = axes(a); const N = flip ? [-V[0], -V[1]] : V; const W = (s, t) => [O[0] + U[0] * s + N[0] * t, O[1] + U[1] * s + N[1] * t]; return { O, a, U, N, W }; }

// ---------------------------------------------------------------- prep (before attachFabric) ----
export function prepStrip(fab) {
  if (STRIP_OFF || !fab || !fab.strips || !fab.strips.length) return null; const T0 = performance.now();
  const K = { lotPools: [], walkPools: [], units: [], ug: new Grid(64), signs: [], sg: new Grid(64), cols: [], raise: new Grid(16), stats: { bands: 0, shops: 0, tenants: 0, doors: 0, signs: 0, columns: 0, piers: 0, rtu: 0, enclosures: 0, poles: 0, pylons: 0, gas: 0, pads: 0, carsDropped: 0, refused: {} } };
  const S = K.stats; const why = (k) => { S.refused[k] = (S.refused[k] || 0) + 1; };
  // test grids from the final records (bodies, trunks, arterial sidewalks, parked cars). a_stripfix: filed lazily per 640 m
  // chunk (only the chunks around a band, when that band is built); the record arrays are kept by reference here because
  // attachFabric drops the chunk's handle (records are not moved / dropped after this pass, so the lists are the same as at load)
  const G = { body: new Grid(32), trunk: new Grid(16), walk: new Grid(16), car: new Grid(16) };
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const SB of fab.strips) for (const s of SB.shops) { const r = s.rec; bx0 = Math.min(bx0, r[0]); bx1 = Math.max(bx1, r[0]); bz0 = Math.min(bz0, r[2]); bz1 = Math.max(bz1, r[2]); }
  bx0 -= 140; bz0 -= 140; bx1 += 140; bz1 += 140;
  const mask = new Set(); for (const SB of fab.strips) for (let a = -8; a <= SB.La + 8; a += 24) for (let b = -12; b <= 96; b += 24) { const p = SB.P(a, SB.bEdge + SB.dir * b); const i = Math.floor(p[0] / 32), j = Math.floor(p[1] / 32); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) mask.add((i + di) * 65536 + j + dj); }
  const inB = (x, z) => mask.has(Math.floor(x / 32) * 65536 + Math.floor(z / 32)); // only records near a strip band are filed
  const srcs = []; for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue; if (ch.cx + 400 < bx0 || ch.cx - 400 > bx1 || ch.cz + 400 < bz0 || ch.cz - 400 > bz1) continue;
    srcs.push({ cx: ch.cx, cz: ch.cz, body: I.body, tree: I.tree, palm: I.palm, lamp: I.lamp, car: I.car, wp: ch.walk && ch.walk.p ? ch.walk.p : null, wn: ch.walk ? ch.walk.n : 0, L: null, filed: false }); }
  // a chunk's filtered records, in the same order the eager pass filed them (walk quads: bounds first, then the Float32 copy)
  const lists = (sc) => { if (sc.L) return sc.L; const o = sc.L = { body: [], trunk: [], car: [], walk: [] };
    for (const b of sc.body) { if (b.gone || !inB(b[0], b[2])) continue; o.body.push({ x: b[0], z: b[2], a: b[6], hl: b[3] / 2, hw: b[5] / 2, rec: b }); }
    for (const t of sc.tree) { if (t.gone || !inB(t[0], t[1])) continue; const r = 0.24 * (0.75 + t[2] * 0.12) + 0.05; o.trunk.push({ x: t[0], z: t[1], r }); }
    for (const p of sc.palm) { if (p.gone || !inB(p[0], p[1])) continue; const r = 0.24 * (p[2] / 10) + 0.07; o.trunk.push({ x: p[0], z: p[1], r }); }
    for (const l of sc.lamp) { if (!inB(l[0], l[1])) continue; o.trunk.push({ x: l[0], z: l[1], r: 0.16 }); }
    for (const p of sc.car) { if (!inB(p[0], p[1])) continue; o.car.push({ x: p[0], z: p[1], a: p[2], hl: CARHL, hw: CARHW, rec: p }); }
    const w = sc.wp; if (w) for (let v = 0; v + 3 < sc.wn; v += 4) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 4; k++) { const x = w[(v + k) * 3], z = w[(v + k) * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (!inB(x0, z0) && !inB(x1, z1) && !inB((x0 + x1) / 2, (z0 + z1) / 2)) continue; const q = new Float32Array(12);
      for (let k = 0; k < 4; k++) { q[k * 2] = w[(v + k) * 3]; q[k * 2 + 1] = w[(v + k) * 3 + 2]; } q[8] = x0; q[9] = z0; q[10] = x1; q[11] = z1; o.walk.push(q); }
    return o; };
  const fileChunk = (sc) => { sc.filed = true; const o = lists(sc); for (const R of o.body) G.body.add(R, ...ext(R)); for (const t of o.trunk) G.trunk.add(t, t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r);
    for (const R of o.car) G.car.add(R, ...ext(R)); for (const q of o.walk) G.walk.add(q, q[8], q[9], q[10], q[11]); };
  const CHM = 320 + 140; // chunk half size + the longest body half length (records belong to the chunk of their centre)
  const srcNear = (x0, z0, x1, z1) => srcs.filter((sc) => !(sc.cx + CHM < x0 || sc.cx - CHM > x1 || sc.cz + CHM < z0 || sc.cz - CHM > z1));
  const ensureChunks = (bb) => { for (const sc of srcNear(...bb)) if (!sc.filed) fileChunk(sc); };
  const walkHit = (x, z) => G.walk.near(x, z, x, z, (q) => x >= q[8] && x <= q[10] && z >= q[9] && z <= q[11] && (triIn(x, z, q[0], q[1], q[2], q[3], q[4], q[5]) || triIn(x, z, q[0], q[1], q[4], q[5], q[6], q[7])));
  const onWalk = (R) => { const [u, v] = axes(R.a); for (let a = -1; a <= 1.0001; a += 0.5) for (let b = -1; b <= 1.0001; b += 1) if (walkHit(R.x + u[0] * a * R.hl + v[0] * b * R.hw, R.z + u[1] * a * R.hl + v[1] * b * R.hw)) return true; return false; };
  const blocked = (R, opt = {}) => { const e = ext(R, 0.6);
    if (G.body.near(...e, (B) => B.rec !== opt.own && obbOverlap(R, B, 0.05))) return 'body';
    if (G.trunk.near(...e, (t) => circRect(t.x, t.z, t.r + 0.1, R))) return 'trunk';
    if (!opt.cars && G.car.near(...e, (C) => !(C.rec.dead && C.rec.dseq < LIM) && obbOverlap(R, C, 0.1))) return 'car';
    if (!opt.nowalk && onWalk(R)) return 'walk';
    if (!opt.nozone) for (const Z of K.zones) if (Z.seq < LIM && obbOverlap(R, Z, 0.2)) return 'zone';
    return null; };
  K.zones = []; // gas aprons / drive-through lanes: no other piece may stand there
  // a_stripfix: bands are built lazily in any order, so every check sees exactly what the eager pass (band by band) saw: zones
  // and dropped cars carry a sequence number (band * 4 + 1 lane, + 2 apron), LIM is the point of the eager pass being replayed
  let LIM = Infinity;
  // the zone / car-drop decisions are taken at load (lot shader zones, fab.parked) by a brute-force scan of the nearby chunks
  // (same filters, same overlap tests as the grids: a record either overlaps or not, whichever structure finds it)
  // raw record arrays with a cheap distance reject first, so phase A builds no per-record objects
  const SCR = { x: 0, z: 0, a: 0, hl: 0, hw: 0 }; const f32 = Math.fround;
  const scanBody = (R, pad, own) => { const e = R.hl + R.hw + pad; for (const sc of srcNear(...ext(R, 2))) for (const b of sc.body) {
      const m = e + b[3] / 2 + b[5] / 2; if (Math.abs(b[0] - R.x) > m || Math.abs(b[2] - R.z) > m) continue; if (b.gone || b === own || !inB(b[0], b[2])) continue;
      SCR.x = b[0]; SCR.z = b[2]; SCR.a = b[6]; SCR.hl = b[3] / 2; SCR.hw = b[5] / 2; if (obbOverlap(R, SCR, pad)) return true; } return false; };
  const scanTrunk = (R) => { const e = R.hl + R.hw + 1; for (const sc of srcNear(...ext(R, 2))) {
      for (const t of sc.tree) { if (Math.abs(t[0] - R.x) > e || Math.abs(t[1] - R.z) > e || t.gone || !inB(t[0], t[1])) continue; const r = 0.24 * (0.75 + t[2] * 0.12) + 0.05; if (circRect(t[0], t[1], r + 0.1, R)) return true; }
      for (const t of sc.palm) { if (Math.abs(t[0] - R.x) > e || Math.abs(t[1] - R.z) > e || t.gone || !inB(t[0], t[1])) continue; const r = 0.24 * (t[2] / 10) + 0.07; if (circRect(t[0], t[1], r + 0.1, R)) return true; }
      for (const t of sc.lamp) { if (Math.abs(t[0] - R.x) > e || Math.abs(t[1] - R.z) > e || !inB(t[0], t[1])) continue; if (circRect(t[0], t[1], 0.16 + 0.1, R)) return true; } } return false; };
  const scanWalk = (R) => { const e = R.hl + R.hw + 1; const Q = []; // the filed quads (float32 copies, as the grid holds them) near R, then the 15 probe points
    for (const sc of srcNear(...ext(R, 2))) { const w = sc.wp; if (!w) continue; for (let v = 0; v + 3 < sc.wn; v += 4) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let k = 0; k < 4; k++) { const x = w[(v + k) * 3], z = w[(v + k) * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        if (x1 < R.x - e || x0 > R.x + e || z1 < R.z - e || z0 > R.z + e) continue; if (!inB(x0, z0) && !inB(x1, z1) && !inB((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const q = []; for (let k = 0; k < 4; k++) q.push(f32(w[(v + k) * 3]), f32(w[(v + k) * 3 + 2])); q.push(f32(x0), f32(z0), f32(x1), f32(z1)); Q.push(q); } }
    const hit = (x, z) => { for (const q of Q) if (x >= q[8] && x <= q[10] && z >= q[9] && z <= q[11] && (triIn(x, z, q[0], q[1], q[2], q[3], q[4], q[5]) || triIn(x, z, q[0], q[1], q[4], q[5], q[6], q[7]))) return true; return false; };
    const [u, v] = axes(R.a); for (let a = -1; a <= 1.0001; a += 0.5) for (let b = -1; b <= 1.0001; b += 1) if (hit(R.x + u[0] * a * R.hl + v[0] * b * R.hw, R.z + u[1] * a * R.hl + v[1] * b * R.hw)) return true; return false; };
  const blockedScan = (R, opt = {}) => { if (scanBody(R, 0.05, opt.own)) return 'body'; if (scanTrunk(R)) return 'trunk';
    if (!opt.cars) throw new Error('blockedScan: cars');
    if (!opt.nowalk && scanWalk(R)) return 'walk';
    if (!opt.nozone) for (const Z of K.zones) if (obbOverlap(R, Z, 0.2)) return 'zone';
    return null; };
  const dropCars = (R, seq) => { const e = R.hl + R.hw + CARHL + CARHW + 0.25; for (const sc of srcNear(...ext(R, 2))) for (const p of sc.car) {
      if (Math.abs(p[0] - R.x) > e || Math.abs(p[1] - R.z) > e || p.dead || !inB(p[0], p[1])) continue; SCR.x = p[0]; SCR.z = p[1]; SCR.a = p[2]; SCR.hl = CARHL; SCR.hw = CARHW;
      if (obbOverlap(R, SCR, 0.25)) { p.dead = true; p.dseq = seq; S.carsDropped++; } } };
  // text
  const TX = typeof document !== 'undefined'; const rcache = new Map();
  const ras = (key, W, H, pal, draw) => { if (!TX) return null; let r = rcache.get(key); if (!r) { r = raster(W, H, pal, draw); rcache.set(key, r); } return r; };
  const newSign = (x, z, R) => { const sg = { x, z, R, L: [], n: 0 }; K.signs.push(sg); K.sg.add(sg, x, z, x, z); return sg; };
  // lay a raster on a face: centre o (Vector3), u (up), n (normal); wM x hM metres. Kept as (raster, frame); the decal matrices are
  // written straight into the instance buffer when the sign comes within its radius (no per-rectangle objects at load)
  const print = (sg, rs, o, u, n, wM, hM, lift = 0.004) => { if (!rs) return; const r = new THREE.Vector3().crossVectors(u, n).normalize();
    sg.L.push({ rs, o: [o.x + n.x * lift, o.y + n.y * lift, o.z + n.z * lift], r: [r.x, r.y, r.z], u: [u.x, u.y, u.z], n: [n.x, n.y, n.z], px: wM / rs.W, py: hM / rs.H }); sg.n += rs.rects.length; };
  const nameRas = (txt, st) => { const n = txt.length; const W = 15 * n + 6, H = 20; return ras('n' + txt + st, W, H, [SIGNST[st][0], SIGNST[st][1]], (g) => { g.fillStyle = SIGNST[st][1]; g.font = `bold 15px ${FONT}`; g.fillText(txt, W / 2, H / 2 + 1); }); };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z); const UP = V3(0, 1, 0);
  // unit record: lists S (casters far), S1 (casters near), F (no-cast far), F1 (no-cast near), centre
  const AR = [new Arena(), new Arena(), new Arena(), new Arena()];
  const newUnit = (x, z) => { const u = { x, z, S: null, S1: null, F: null, F1: null, o: [0, 0, 0, 0] }; K.units.push(u); for (let k = 0; k < 4; k++) { AR[k].cur = u; u.o[k] = AR[k].n; }
    u.S = { A: AR[0], u }; u.S1 = { A: AR[1], u }; u.F = { A: AR[2], u }; u.F1 = { A: AR[3], u }; return u; };
  const addCol = (R, h, k) => { K.cols.push({ x: R.x, z: R.z, a: R.a, hl: R.hl, hw: R.hw, h, k }); };
  const cbF = (fr, seed) => (list, s, t, y0, sx, sy, st, c, kind = 8) => { const p = fr.W(s, t); box(list, p[0], y0, p[1], sx, sy, st, fr.a, c, kind, seed); };

  // -------------------------------------------------------------- a_stripfix phase A (load): what the rest of the load needs ----
  // shop / pad face sets (attachFabric), front walks (groundH), tenant names (a running count over all bands), drive-through lanes
  // and filling-station aprons (lot shader zones + the parked cars they remove, before parkcol / the car instances). Everything
  // else (kit boxes, signs, colliders) is built per band when the camera or a collision query first comes near it (buildBand).
  let tenantNo = 0; const bounds0 = (L, hs) => { const hw = L / 2; const k0 = Math.ceil((-hw + 0.45) / 1.5), k1 = Math.floor((hw - 0.45) / 1.5); const bounds = [k0]; let k = k0, j = 0;
    while (k1 - k >= 7) { const w = [4, 5, 6, 8][Math.floor(hs(10 + j++) * 4)]; if (k1 - (k + w) < 4) break; k += w; bounds.push(k); } bounds.push(k1); return bounds; };
  for (let bi = 0; bi < fab.strips.length; bi++) { const SB = fab.strips[bi]; const B = (x) => SB.bEdge + SB.dir * x; const P = SB.P;
    const bandSeed = SB.shops.length ? SB.shops[0].rec[11] : bi * 0.37; const ten = SB._ten = [];
    { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; const g = (x, z, e) => { x0 = Math.min(x0, x - e); x1 = Math.max(x1, x + e); z0 = Math.min(z0, z - e); z1 = Math.max(z1, z + e); };
      for (let a = -8; a <= SB.La + 8; a += 12) for (let b = -12; b <= 96; b += 12) { const p = P(a, B(b)); g(p[0], p[1], 0); }
      for (const sh of SB.shops) g(sh.rec[0], sh.rec[2], sh.rec[3] / 2 + sh.rec[5] + 12); if (SB.pad) g(SB.pad.rec[0], SB.pad.rec[2], SB.pad.rec[3] / 2 + SB.pad.rec[5] + 14);
      SB._bb = [x0 - 40, z0 - 40, x1 + 40, z1 + 40]; SB._built = false; }
    for (const sh of SB.shops) { const r = sh.rec; if (r.gone) continue;
      const seed = r[11], hs = (k) => hh(seed * 7.31 + 0.5, k); const C = [r[0], r[2]], L = r[3], D = r[5] / 2, a = r[6];
      const [, V] = axes(a); const lp = P(sh.a + sh.L / 2, B(30)); const flip = (lp[0] - C[0]) * V[0] + (lp[1] - C[1]) * V[1] < 0;
      const N = frameAt(C, a, flip).N; const F2 = frameAt([C[0] + N[0] * D, C[1] + N[1] * D], a, flip);
      { let th = Math.atan2(N[1], N[0]); if (th < 0) th += Math.PI * 2; r.hs = 0.05 + 0.4 * th / (Math.PI * 2); } // fabBody strip face set (lot face = storefront)
      { const p = F2.W(0, 1.66), R = { x: p[0], z: p[1], a, hl: L / 2 + 0.2, hw: 1.66, y: 0.12 }; K.raise.add(R, ...ext(R)); } // walk + kerb top for groundH
      const bounds = bounds0(L, hs); sh._ni = [];
      for (let i = 0; i < bounds.length - 1; i++) { if (bounds[i + 1] - bounds[i] < 3) continue; const ts = hh(seed * 3.1 + i, 5);
        const ni = (Math.floor(bandSeed * 997) + tenantNo++ * 7 + Math.floor(ts * 5)) % SHOPS.length; sh._ni[i] = ni; ten.push(SHOPS[ni]); } }
    SB._lb = null; SB._gb = null;
    if (SB.pad && !SB.pad.rec.gone) { const r = SB.pad.rec; const C = [r[0], r[2]], w = r[3], D = r[5] / 2, a = r[6];
      const [, V] = axes(a); const ap = P(SB.pad.ap, B(0)); const flip = (ap[0] - C[0]) * V[0] + (ap[1] - C[1]) * V[1] < 0; const N = flip ? [-V[0], -V[1]] : V;
      { let th = Math.atan2(N[1], N[0]); if (th < 0) th += Math.PI * 2; r.hs = 0.05 + 0.4 * th / (Math.PI * 2); }
      const F2 = frameAt([C[0] + N[0] * D, C[1] + N[1] * D], a, flip); const lane = (() => { const p = F2.W(-1, -2 * D - 2.1); return { x: p[0], z: p[1], a, hl: w / 2 + 7, hw: 1.8 }; })();
      const lb = SB._lb = blockedScan({ ...lane, hl: lane.hl - 0.5, hw: 1.6 }, { own: r, cars: true });
      if (!lb) { dropCars(lane, bi * 4 + 1); lane.kind = 2; lane.dash = 1; lane.seq = bi * 4 + 1; K.zones.push(lane); } }
    const La = SB.La; const endP = hh(bandSeed, 70) < 0.5 ? 0 : 1; let gasEnd = -1;
    if (!SB.pad && La > 200 && hh(bandSeed, 71) < 0.6) gasEnd = 1 - endP;
    if (gasEnd >= 0) { const ac = gasEnd === 0 ? 21 : La - 21; const ang = fangP(P, ac, B(12.8)); const c0 = P(ac, B(12.8));
      const apron = { x: c0[0], z: c0[1], a: ang, hl: 18, hw: 12.2 }; const gb = SB._gb = scanBody(apron, 0.3, undefined);
      if (!gb) { dropCars(apron, bi * 4 + 2); apron.kind = 1; apron.seq = bi * 4 + 2; K.zones.push(apron); } } }
  S.msGrid = Math.round(performance.now() - T0);
  // -------------------------------------------------------------- phase B: one band's kit (strip shops, pad, station, pylon, poles) ----
  const buildBand = (bi) => { const SB = fab.strips[bi]; if (SB._built) return; SB._built = true; const tB = performance.now(); const u0 = K.units.length, c0n = K.cols.length;
    ensureChunks(SB._bb); LIM = bi * 4 + 1; S.bands++; const B = (x) => SB.bEdge + SB.dir * x; const P = SB.P;
    const bandSeed = SB.shops.length ? SB.shops[0].rec[11] : bi * 0.37; const tenantsOf = SB._ten;
    for (const sh of SB.shops) { const r = sh.rec; if (r.gone) continue; S.shops++;
      const seed = r[11], hs = (k) => hh(seed * 7.31 + 0.5, k); const C = [r[0], r[2]], L = r[3], h = r[4], D = r[5] / 2, a = r[6];
      const [, V] = axes(a); const lp = P(sh.a + sh.L / 2, B(30)); const flip = (lp[0] - C[0]) * V[0] + (lp[1] - C[1]) * V[1] < 0;
      const fr = frameAt(C, a, flip); const N = fr.N; const O2 = [C[0] + N[0] * D, C[1] + N[1] * D]; const F2 = frameAt(O2, a, flip); const cb = cbF(F2, seed);
      { let th = Math.atan2(N[1], N[0]); if (th < 0) th += Math.PI * 2; r.hs = 0.05 + 0.4 * th / (Math.PI * 2); } // fabBody strip face set (lot face = storefront)
      const u = newUnit(C[0], C[1]); u.meta = { k: 'shop', C, N, U: F2.U, L, D, h, band: bi }; const wall = [r[7], r[8], r[9]]; const trim = TRIM[Math.floor(hs(1) * TRIM.length)]; const hw = L / 2;
      const yellow = hs(2) < 0.45; const colC = hs(3) < 0.5 ? mul(wall, 0.97) : trim;
      // walk + kerb, canopy slab + sign-band fascia, coping
      cb(u.S, 0, 1.6, 0, L + 0.4, 0.12, 3.2, CONC); cb(u.F, 0, 3.24, 0, L + 0.4, 0.13, 0.16, yellow ? YEL : KERB);
      cb(u.S, 0, 1.55, 3.15, L + 0.5, 0.25, 3.1, [0.90, 0.89, 0.85]); cb(u.S, 0, 2.95, 3.0, L + 0.56, 1.1, 0.3, trim);
      cb(u.F, 0, 3.11, 3.0, L + 0.6, 0.07, 0.04, mul(trim, 0.7)); // drip edge
      cb(u.S, 0, 0.05, h, L + 0.12, 0.14, 0.3, mul(wall, 1.04));
      // tenants on the 1.5 m mullion grid
      const k0 = Math.ceil((-hw + 0.45) / 1.5), k1 = Math.floor((hw - 0.45) / 1.5); const bounds = [k0]; let k = k0, j = 0;
      while (k1 - k >= 7) { const w = [4, 5, 6, 8][Math.floor(hs(10 + j++) * 4)]; if (k1 - (k + w) < 4) break; k += w; bounds.push(k); }
      bounds.push(k1);
      // end piers
      for (const sg of [-1, 1]) { const e = sg < 0 ? k0 * 1.5 : k1 * 1.5; const w = Math.abs(sg * hw - e) + 0.3; cb(u.S, sg * hw - sg * (w / 2 - 0.05), 0.15, 0, w + 0.1, 3.05, 0.3, mul(wall, 0.92)); S.piers++; }
      for (let i = 1; i < bounds.length - 1; i++) { cb(u.S, bounds[i] * 1.5, 0.15, 0, 0.6, 3.05, 0.3, mul(wall, 0.92)); S.piers++; }
      // columns: ends, tenant bounds, and in between no more than 9 m apart
      const colS = [-hw + 0.35, hw - 0.35]; for (let i = 1; i < bounds.length - 1; i++) colS.push(bounds[i] * 1.5); colS.sort((p, q) => p - q);
      const colAll = []; for (let i = 0; i < colS.length; i++) { colAll.push(colS[i]); if (i < colS.length - 1) { const g = colS[i + 1] - colS[i]; const n = Math.floor(g / 9); for (let m = 1; m <= n; m++) colAll.push(colS[i] + (g * m) / (n + 1)); } }
      for (const s of colAll) { const p = F2.W(s, 2.6); const R = { x: p[0], z: p[1], a, hl: 0.28, hw: 0.28 }; const w = blocked(R, { own: r, nowalk: true }); // on the shop's own walk if (w) { why('column:' + w); continue; }
        cb(u.S, s, 2.6, 0.12, 0.4, 3.03, 0.4, colC); cb(u.S1, s, 2.6, 0.12, 0.54, 0.32, 0.54, mul(colC, 0.85)); cb(u.S1, s, 2.6, 2.95, 0.54, 0.2, 0.54, mul(colC, 1.03)); addCol(R, 3.2, 'column'); S.columns++; }
      // per tenant: entrance, light-box sign, rooftop unit
      for (let i = 0; i < bounds.length - 1; i++) { const m0 = bounds[i], m1 = bounds[i + 1], nm = m1 - m0; if (nm < 3) continue; S.tenants++; const ts = hh(seed * 3.1 + i, 5);
        const ni = sh._ni[i], nmT = SHOPS[ni]; // a_stripfix: named in phase A (running count over the bands)
        const op = OLD_ASHOP || shopOpen(nmT, seed, i); const sc = (m0 + m1) * 0.75; // a_shopnight
        if (nm >= 4) { const jj = nm >= 6 ? (ts < 0.5 ? 2 : nm - 2) : 2; const sd = (m0 + jj) * 1.5; const fc = ts < 0.6 ? [0.22, 0.20, 0.18] : [0.66, 0.67, 0.68];
          if (OLD_ASHOP) cb(u.F, sd, 0.045, 0, 3.0, 3.0, 0.09, fc, 15); else { const q = F2.W(sd, 0.045); box(u.F, q[0], 0, q[1], 3.0, 3.0, 0.09, F2.a, fc, 15, seed + (op ? 2 : 4)); } S.doors++; }
        if (!OLD_ASHOP) { // a_shopnight: tenant glazing panel 1.5 cm proud of the glass (night only; open = lit at the tenant's own level / tone, closed = dark)
          const tone = hh(seed * 2.71 + i * 0.37 + 0.11, 98); const q = F2.W(sc, 0.015); box(u.F, q[0], 0.45, q[1], nm * 1.5, 2.55, 0.02, F2.a, [0.1, 0.12, 0.14], 21, (nm & 1 ? 0.5 : 0) + (op ? 0.25 : 0) + tone * 0.199);
          S.open = (S.open || 0) + (op ? 1 : 0); S.closed = (S.closed || 0) + (op ? 0 : 1);
          if (op) { const w = F2.W(sc, 1.9); K.walkPools.push(w[0], w[1], F2.a, nm * 1.5 * 0.92, 4.4, 0.19); } } // shop light on the front walk
        const wS = Math.min(nm * 1.5 * 0.66, 6.5), hS = 0.74; const st = (ni * 7 + (hh(seed * 5.7 + i, 9) < 0.25 ? 3 : 0)) % SIGNST.length; // one look per shop name (a chain reads the same), a few variants
        cb(u.F, sc, 3.19, 3.18, wS, hS, 0.16, lin(SIGNST[st][0]), 16); S.signs++;
        const p = F2.W(sc, 3.27 + 0.004); const sg = newSign(p[0], p[1], TXT_R); const rs = nameRas(nmT, st);
        if (rs) { const wT = wS * 0.92, hT = Math.min(hS * 0.8, wT * rs.H / rs.W); print(sg, rs, V3(p[0], 3.18 + hS / 2, p[1]), UP, V3(N[0], 0, N[1]), wT * (hT / (wT * rs.H / rs.W)), hT); }
        if (hh(seed, 20 + i) < 0.8) { const ss = sc + (hh(seed, 30 + i) - 0.5) * nm * 0.6; cb(u.S, ss, -(2 * D) * (0.35 + 0.3 * hh(seed, 40 + i)), h, 2.0, 1.15, 1.4, RTU, 10); cb(u.F1, ss, -(2 * D) * 0.2, h, 0.35, 0.5, 0.35, DKB); S.rtu++; } }
      // back: CMU dumpster enclosures against the service wall
      const nE = Math.min(3, 1 + Math.floor((bounds.length - 1) / 2));
      for (let e = 0; e < nE; e++) { const s = -hw + (L * (e + 0.5)) / nE + (hh(seed, 50 + e) - 0.5) * 4; const t = -2 * D - 1.62; const p = F2.W(s, t); const R = { x: p[0], z: p[1], a, hl: 1.9, hw: 1.55 };
        const w = blocked(R, { own: r }); if (w) { why('enclosure:' + w); continue; } S.enclosures++;
        for (const sg2 of [-1, 1]) cb(u.S, s + sg2 * 1.8, t, 0, 0.2, 1.9, 3.0, CMU, 7);
        cb(u.S1, s, t, 0, 3.4, 0.08, 2.8, [0.40, 0.40, 0.39]); // pad
        const gc = hh(seed, 60 + e) < 0.5 ? [0.30, 0.25, 0.19] : [0.17, 0.28, 0.20]; for (const sg2 of [-1, 1]) cb(u.S, s + sg2 * 0.86, t - 1.47, 0.08, 1.66, 1.7, 0.06, gc, 14);
        cb(u.S1, s - 0.2, t + 0.6, 0.08, 1.9, 1.25, 1.2, [0.16, 0.30, 0.20]); cb(u.F1, s - 0.2, t + 0.6, 1.33, 1.94, 0.06, 1.25, [0.10, 0.18, 0.12]);
        addCol(R, 1.9, 'enclosure'); } }

    // -------------------------------------------------------------- 2. pad building -> drive-through restaurant ----
    if (SB.pad && !SB.pad.rec.gone) { const r = SB.pad.rec; S.pads++; const seed = r[11]; const C = [r[0], r[2]], w = r[3], h = r[4], D = r[5] / 2, a = r[6];
      const [, V] = axes(a); const ap = P(SB.pad.ap, B(0)); const flip = (ap[0] - C[0]) * V[0] + (ap[1] - C[1]) * V[1] < 0; const N = flip ? [-V[0], -V[1]] : V;
      { let th = Math.atan2(N[1], N[0]); if (th < 0) th += Math.PI * 2; r.hs = 0.05 + 0.4 * th / (Math.PI * 2); }
      const F2 = frameAt([C[0] + N[0] * D, C[1] + N[1] * D], a, flip); const cb = cbF(F2, seed); const u = newUnit(C[0], C[1]); u.meta = { k: 'pad', C, N, U: F2.U, w, D, band: bi }; const bi2 = Math.floor(hh(seed, 1) * FOOD.length); const [nm, bg, fg] = FOOD[bi2]; const bgc = lin(bg);
      // lane along the back (t from -2D-0.3 to -2D-3.9), from upstream (s-) to the pickup window
      const lane = (() => { const p = F2.W(-1, -2 * D - 2.1); return { x: p[0], z: p[1], a, hl: w / 2 + 7, hw: 1.8 }; })();
      LIM = bi * 4 + 2; const lb = SB._lb; // decided in phase A (zone + car drop done there)
      if (!lb) {
        // pickup window + awning on the back wall
        // a_stripfix: the fabBody kind-15 branch draws a < 2 m tall entrance as a pickup window (aluminium frame, sliding sash slid open,
        // transom light, lit kitchen); stainless transaction shelf, header plate with the brand colour + '取餐' under the awning
        cb(u.F, w / 4, -2 * D - 0.04, 0.85, 1.5, 1.2, 0.08, [0.66, 0.67, 0.69], 15); cb(u.S, w / 4, -2 * D - 0.55, 2.45, 2.4, 0.12, 1.1, bgc);
        cb(u.F1, w / 4, -2 * D - 0.17, 0.80, 1.7, 0.05, 0.26, [0.72, 0.73, 0.74]); cb(u.F, w / 4, -2 * D - 0.03, 0.77, 1.62, 0.08, 0.07, [0.62, 0.63, 0.65]);
        cb(u.F, w / 4, -2 * D - 0.05, 2.1, 1.3, 0.3, 0.06, bgc, 16);
        { const p = F2.W(w / 4, -2 * D - 0.085); const sg = newSign(p[0], p[1], TXT_R); const rs = ras('pick' + bi2, 40, 14, [bg, fg], (g) => { g.fillStyle = fg; g.font = `bold 11px ${FONT}`; g.fillText('取餐', 20, 8); });
          if (rs) print(sg, rs, V3(p[0], 2.25, p[1]), UP, V3(-F2.N[0], 0, -F2.N[1]), 0.86, 0.3); }
        // menu board + speaker post on the outer side of the lane, clearance bar at the entry
        { const s = -w / 2 - 2.6, t = -2 * D - 4.75; const p = F2.W(s, t); const R = { x: p[0], z: p[1], a, hl: 1.3, hw: 0.25 }; const bw = blocked(R, { own: r, nozone: true });
          if (!bw) { for (const q of [-1, 1]) cb(u.S, s + q * 1.0, t, 0, 0.12, 1.2, 0.12, DKB); cb(u.S, s, t, 1.2, 2.5, 1.5, 0.18, [0.12, 0.12, 0.13]); cb(u.F, s, t + 0.1, 1.28, 2.32, 1.34, 0.04, [0.96, 0.95, 0.9], 16);
            const sg = newSign(p[0], p[1], TXT_R); const rs = ras('menu' + bi2, 72, 42, ['#f6f4ec', bg, '#262626'], (g) => { g.fillStyle = bg; g.font = `bold 11px ${FONT}`; g.fillText(nm + ' 菜单', 36, 7);
              g.fillStyle = '#262626'; for (let i = 0; i < 4; i++) { g.fillRect(6, 15 + i * 7, 20 + (i * 7) % 11, 3); g.fillRect(40, 15 + i * 7, 18 - (i * 5) % 7, 3); g.fillRect(62, 15 + i * 7, 6, 3); } });
            const o = F2.W(s, t + 0.125); print(sg, rs, V3(o[0], 1.95, o[1]), UP, V3(F2.N[0], 0, F2.N[1]), 2.2, 1.28); addCol(R, 2.7, 'menu'); } else why('menu:' + bw); }
        { const s = -w / 2 - 0.3, t = -2 * D - 4.3; const p = F2.W(s, t); const R = { x: p[0], z: p[1], a, hl: 0.2, hw: 0.2 }; const sw = blocked(R, { own: r, nozone: true }); if (sw) why('speaker:' + sw); else { cb(u.S, s, t, 0, 0.16, 1.15, 0.16, DKB); cb(u.F, s, t + 0.05, 1.0, 0.36, 0.5, 0.22, bgc, 16); addCol(R, 1.5, 'speaker'); } }
        { const s = -w / 2 - 7.2; const ok = [-2 * D - 0.25, -2 * D - 4.1].every((t) => { const p = F2.W(s, t); return !blocked({ x: p[0], z: p[1], a, hl: 0.15, hw: 0.15 }, { own: r, nozone: true }); }); if (!ok) why('bar');
          if (ok) { for (const t of [-2 * D - 0.25, -2 * D - 4.1]) { cb(u.S, s, t, 0, 0.18, 3.0, 0.18, YEL); const p = F2.W(s, t); addCol({ x: p[0], z: p[1], a, hl: 0.12, hw: 0.12 }, 3.0, 'bar'); }
            cb(u.S, s, -2 * D - 2.18, 2.8, 0.22, 0.26, 4.1, YEL); for (let q = 0; q < 4; q++) cb(u.F1, s, -2 * D - 0.75 - q * 0.95, 2.79, 0.24, 0.28, 0.42, [0.1, 0.1, 0.1]); } } }
      else why('drive:' + lb);
      // front: entrance, wall sign, coping, rooftop unit
      cb(u.F, 0, 0.045, 0, 3.0, 3.0, 0.09, [0.22, 0.2, 0.18], 15); S.doors++;
      { const wS = Math.min(w * 0.6, 6.0), y0 = Math.max(3.0, h - 1.5); cb(u.F, 0, 0.09, y0, wS, 0.9, 0.18, bgc, 16); const p = F2.W(0, 0.18); const sg = newSign(p[0], p[1], TXT_RL);
        const rs = ras('fd' + bi2, 15 * nm.length + 8, 20, [bg, fg], (g) => { g.fillStyle = fg; g.font = `bold 15px ${FONT}`; g.fillText(nm, (15 * nm.length + 8) / 2, 11); });
        if (rs) { const hT = 0.66, wT = Math.min(wS * 0.9, hT * rs.W / rs.H); print(sg, rs, V3(p[0], y0 + 0.45, p[1]), UP, V3(N[0], 0, N[1]), wT, wT * rs.H / rs.W); } }
      for (const q of [0, 1]) cb(u.S, 0, q ? -2 * D - 0.05 : 0.05, h - 0.55, w + 0.12, 0.7, 0.3, bgc); for (const q of [-1, 1]) cb(u.S, q * (w / 2 + 0.05), -D, h - 0.55, 0.3, 0.7, 2 * D, bgc); cb(u.S, w * 0.2, -D, h, 2.0, 1.15, 1.4, RTU, 10); S.rtu++; }

    // -------------------------------------------------------------- 3. pylon sign at one end, filling station at the other ----
    const La = SB.La; const endP = hh(bandSeed, 70) < 0.5 ? 0 : 1; let gasEnd = -1;
    if (!SB.pad && La > 200 && hh(bandSeed, 71) < 0.6) gasEnd = 1 - endP;
    if (gasEnd >= 0) { // apron a in [3, 39] from that end, b 0.6..25
      const ac = gasEnd === 0 ? 21 : La - 21; const ang = fangP(P, ac, B(12.8)); const c0 = P(ac, B(12.8)); const nb = P(ac, B(13.8)); const fr = frameAt(c0, ang, (nb[0] - c0[0]) * Math.sin(ang) + (nb[1] - c0[1]) * Math.cos(ang) < 0); // t: arterial -> lot interior
      // frame: s along a, t along +b(into the cell for dir +1) -> flip for dir -1 so t points from the arterial into the lot
      const apron = { x: c0[0], z: c0[1], a: ang, hl: 18, hw: 12.2 };
      const gb = SB._gb;
      if (!gb) { S.gas++; const seed = bandSeed * 3.3 + 0.7; const cb = cbF(fr, seed); const u = newUnit(c0[0], c0[1]); u.meta = { k: 'gas', C: c0, N: fr.N, U: fr.U, band: bi }; 
        const gi = Math.floor(hh(seed, 1) * GAS.length); const [gn, gbg, gfg, gc] = GAS[gi]; const sgn = gasEnd === 0 ? 1 : -1; // s toward the band interior
        // canopy 26 x 11 over b 7..18 (t -5.8..5.2)
        const tc = -0.3; cb(u.S, 0, tc, 5.1, 26, 0.4, 11, [0.93, 0.93, 0.91]);
        if (!OLD_ASHOP) for (const so of [-8.6, 0, 8.6]) { const w = fr.W(so, tc); K.walkPools.push(w[0], w[1], fr.a, 13.5, 12.5, 0.07); } // a_shopnight: the lit canopy's light on the apron
        for (const q of [-1, 1]) { cb(u.S, 0, tc + q * 5.5, 5.0, 26.3, 0.95, 0.3, WHT); cb(u.S, q * 13.0, tc, 5.0, 0.3, 0.95, 11.3, WHT); cb(u.F, 0, tc + q * 5.66, 5.3, 26.32, 0.3, 0.02, gc); cb(u.F, q * 13.16, tc, 5.3, 0.02, 0.3, 11.32, gc); }
        for (let i = 0; i < 6; i++) cb(u.F, -10 + i * 4, tc + ((i & 1) ? 2.4 : -2.4), 5.04, 1.3, 0.06, 0.62, WHT, 17);
        for (const so of [-8.5, 0, 8.5]) { const p = fr.W(so, tc); const R = { x: p[0], z: p[1], a: ang, hl: 0.7, hw: 3.85 };
          cb(u.S, so, tc, 0.05, 1.3, 0.18, 7.5, KERB); cb(u.S, so, tc, 0.05, 0.45, 5.05, 0.45, [0.85, 0.85, 0.83]); addCol(R, 1.0, 'island');
          for (const bo of [-1, 1]) { const tt = tc + bo * 2.2; cb(u.S, so, tt, 0.23, 0.55, 1.9, 1.1, [0.90, 0.90, 0.88]); cb(u.F, so, tt, 1.15, 0.62, 0.5, 0.9, lin(gbg), 16); cb(u.S1, so, tt, 2.13, 0.6, 0.26, 1.12, gc);
            for (const hq of [-1, 1]) cb(u.F1, so + hq * 0.3, tt, 0.6, 0.04, 0.9, 0.06, [0.08, 0.08, 0.08]); }
          for (const eo of [-1, 1]) for (const lo of [-0.4, 0.4]) cb(u.S1, so + lo, tc + eo * 3.95, 0.05, 0.16, 1.0, 0.16, YEL); }
        // cashier kiosk beyond the canopy (toward the band interior), price sign at the arterial corner
        { const so = sgn * 15.5, to = 7.5; const p = fr.W(so, to); const R = { x: p[0], z: p[1], a: ang, hl: 2.6, hw: 2.1 };
          cb(u.S, so, to, 0.05, 5.0, 3.0, 4.0, [0.93, 0.92, 0.88]); cb(u.S, so, to, 3.05, 5.3, 0.4, 4.3, gc); cb(u.F, so, to - 2.03, 0.05, 3.0, 2.85, 0.08, [0.6, 0.61, 0.62], 15); addCol(R, 3.5, 'kiosk'); }
        { const so = sgn * 15.8, to = -9.6; const p = fr.W(so, to); const R = { x: p[0], z: p[1], a: ang, hl: 0.35, hw: 1.2 }; const bw = blocked(R, { cars: true, nozone: true });
          if (!bw) { const f2 = frameAt(p, ang + Math.PI / 2, false); const c2 = cbF(f2, seed + 1); // panels face along the arterial
            c2(u.S, 0, 0, 0, 2.4, 0.6, 0.6, CMU); for (const q of [-1, 1]) c2(u.S, q * 0.9, 0, 0.6, 0.2, 3.6, 0.25, DKB); c2(u.F, 0, 0, 3.2, 2.1, 0.9, 0.3, lin(gbg), 16);
            for (let i = 0; i < 3; i++) c2(u.F, 0, 0, 0.95 + i * 0.72, 2.0, 0.62, 0.26, [0.10, 0.10, 0.11], 16);
            const sg = newSign(p[0], p[1], TXT_RL); const hd = ras('gas' + gi, 15 * gn.length + 8, 20, [gbg, gfg], (g) => { g.fillStyle = gfg; g.font = `bold 15px ${FONT}`; g.fillText(gn, (15 * gn.length + 8) / 2, 11); });
            const rows = [['92#', '7.68'], ['95#', '8.21'], ['柴油', '7.45']];
            for (const fs of [-1, 1]) { const nrm = V3(f2.N[0] * fs, 0, f2.N[1] * fs); const o = f2.W(0, fs * 0.155);
              if (hd) { const wT = Math.min(1.9, 0.7 * hd.W / hd.H); print(sg, hd, V3(o[0], 3.65, o[1]), UP, nrm, wT, wT * hd.H / hd.W); }
              const o2 = f2.W(0, fs * 0.135); for (let i = 0; i < 3; i++) { const rr = ras('pr' + i, 60, 16, ['#1a1a1c', '#f3c623', '#f2f2ee'], (g) => { g.font = `bold 13px ${FONT}`; g.fillStyle = '#f2f2ee'; g.fillText(rows[i][0], 15, 9); g.fillStyle = '#f3c623'; g.fillText(rows[i][1], 43, 9); });
                print(sg, rr, V3(o2[0], 0.95 + i * 0.72 + 0.31, o2[1]), UP, nrm, 1.9, 0.5); } }
            addCol({ x: p[0], z: p[1], a: ang + Math.PI / 2, hl: 1.2, hw: 0.35 }, 4.2, 'pricesign'); } else why('pricesign:' + bw); } }
      else why('gas:body'); }
    LIM = bi * 4 + 3;
    { // pylon at the end endP: a 1.15 from that end, b 1.6..4.4
      const a0 = endP === 0 ? 1.15 : La - 1.15; const c0 = P(a0, B(3.0)); const ang = fangP(P, a0, B(3.0)); const R = { x: c0[0], z: c0[1], a: ang, hl: 0.55, hw: 1.85 };
      const pw = blocked(R, { cars: false }); if (pw) why('pylon:' + pw);
      else { S.pylons++; const seed = bandSeed * 5.1 + 0.3; const fr = frameAt(c0, ang + Math.PI / 2, false); const cb = cbF(fr, seed); const u = newUnit(c0[0], c0[1]); u.meta = { k: 'pylon', C: c0, N: fr.N, U: fr.U, band: bi };
        const pz = PLAZAS[Math.floor(hh(seed, 1) * PLAZAS.length)]; const trim = TRIM[Math.floor(hh(seed, 2) * TRIM.length)]; const stone = [0.80, 0.75, 0.66];
        cb(u.S, 0, 0, 0, 3.7, 1.0, 1.1, stone); cb(u.S, 0, 0, 1.0, 3.2, 7.4, 0.62, [0.92, 0.90, 0.85]); cb(u.S, 0, 0, 8.4, 3.7, 0.42, 1.0, trim);
        cb(u.F, 0, 0, 7.0, 3.0, 1.15, 0.76, lin('#1b3f6e'), 16);
        const sg = newSign(c0[0], c0[1], TXT_RL); const hdr = ras('pz' + pz, 15 * pz.length + 8, 20, ['#1b3f6e', '#f4f2ec'], (g) => { g.fillStyle = '#f4f2ec'; g.font = `bold 15px ${FONT}`; g.fillText(pz, (15 * pz.length + 8) / 2, 11); });
        const ten = tenantsOf.slice(0, 4); while (ten.length < 4 && SHOPS.length) ten.push(SHOPS[(Math.floor(seed * 131) + ten.length * 5) % SHOPS.length]);
        for (let i = 0; i < 4; i++) cb(u.F, 0, 0, 1.35 + i * 1.38, 2.9, 1.16, 0.72, lin(SIGNST[(SHOPS.indexOf(ten[i]) * 7) % SIGNST.length][0]), 16);
        for (const fs of [-1, 1]) { const nrm = V3(fr.N[0] * fs, 0, fr.N[1] * fs); const o = fr.W(0, fs * 0.38);
          if (hdr) { const wT = Math.min(2.8, 0.82 * hdr.W / hdr.H); print(sg, hdr, V3(o[0], 7.575, o[1]), UP, nrm, wT, wT * hdr.H / hdr.W); }
          const o2 = fr.W(0, fs * 0.36); for (let i = 0; i < 4; i++) { const st = (SHOPS.indexOf(ten[i]) * 7) % SIGNST.length; const rs = nameRas(ten[i], st);
            if (rs) { const wT = Math.min(2.7, 0.85 * rs.W / rs.H); print(sg, rs, V3(o2[0], 1.35 + i * 1.38 + 0.58, o2[1]), UP, nrm, wT, wT * rs.H / rs.W); } } }
        addCol({ x: c0[0], z: c0[1], a: ang + Math.PI / 2, hl: 1.85, hw: 0.55 }, 8.8, 'pylon'); } }
    { // lot light poles on the double-row stall heads (b 18.2), every ~32 m
      const off = 8 + hh(bandSeed, 80) * 10; for (let a1 = off; a1 < La - 6; a1 += 30 + hh(bandSeed, a1) * 6) {
        let c0 = null, ang = 0, R = null, w = null; for (const da of [0, 1.35, -1.35, 2.7, -2.7]) { c0 = P(a1 + da, B(18.2)); ang = fangP(P, a1 + da, B(18.2)); R = { x: c0[0], z: c0[1], a: ang, hl: 0.3, hw: 0.3 }; w = blocked(R); if (!w) break; }
        if (w) { why('pole:' + w); continue; } S.poles++;
        const fr = frameAt(c0, ang, false); const cb = cbF(fr, bandSeed + a1); const u = newUnit(c0[0], c0[1]);
        cb(u.S, 0, 0, 0, 0.55, 0.75, 0.55, CONC); cb(u.S, 0, 0, 0.75, 0.18, 8.2, 0.18, [0.24, 0.23, 0.22]); cb(u.S, 0, 0, 8.85, 0.1, 0.1, 2.4, [0.24, 0.23, 0.22]);
        for (const q of [-1, 1]) cb(u.S, 0, q * 1.25, 8.72, 0.5, 0.18, 0.8, [0.26, 0.25, 0.24], 17);
        K.lotPools.push(c0[0], c0[1], ang); /* a_nightcheck: ground light under the twin heads (read only, no random draw) */ addCol(R, 9.0, 'pole'); } }
    // pack this band's units (subarray views of the arenas), file them; colliders straight into the collision grid once it is attached
    for (let i = u0; i < K.units.length; i++) { const u = K.units[i], v = K.units[i + 1]; const end = (k) => (v ? v.o[k] : AR[k].n);
      u.S = AR[0].a.subarray(u.o[0], end(0)); u.S1 = AR[1].a.subarray(u.o[1], end(1)); u.F = AR[2].a.subarray(u.o[2], end(2)); u.F1 = AR[3].a.subarray(u.o[3], end(3)); u.o = null; K.ug.add(u, u.x, u.z, u.x, u.z); }
    if (K.col) for (let i = c0n; i < K.cols.length; i++) addColTo(K.col, K.cols[i]);
    K.built++; if (K.built === fab.strips.length) K.allBuilt = true; K.msBuild += performance.now() - tB; };
  // drop the cars that stood on the new aprons / lanes (records and the fab.parked snapshot stay in step)
  if (S.carsDropped) { const P0 = fab.parked; let nc = 0; for (const ch of fab.chunks.values()) if (ch.I) nc += ch.I.car.length; const live = new Float32Array(nc * 4); let i = 0, m = 0;
    for (const ch of fab.chunks.values()) { const I = ch.I; if (!I) continue; const keep = []; for (const p of I.car) { const k = P0 ? P0[i * 4 + 3] : 0; i++; if (p.dead) continue; keep.push(p); live[m++] = p[0]; live[m++] = p[1]; live[m++] = p[2]; live[m++] = k; } I.car = keep; }
    if (P0) fab.parked = live.slice(0, m); }
  // lot-shader zones (aprons, lanes): the lot quad is polygon-offset toward the camera, so paint on it rather than boxes over it
  { let i = 0; for (const Z of K.zones) { if (i >= 28) break; LOTZ.a.set([Z.x, Z.z, Math.cos(Z.a), Math.sin(Z.a)], i * 4); LOTZ.b.set([Z.hl, Z.hw, Z.kind, Z.dash || 0], i * 4); i++; } if (i < 28) LOTZ.b[i * 4 + 2] = 0; S.zones = i; }
  // pack
  // lazily built bands: a 128 m grid of band boxes; ensureNear(x, z, r) builds every band whose box comes within r (camera,
  // collision queries), ensureAll() builds the rest in band order (audit / tools). Totals below read the bands built so far.
  K.built = 0; K.allBuilt = false; K.msBuild = 0; const BG = new Map(), BC = 128;
  fab.strips.forEach((SB, bi) => { const bb = SB._bb; for (let i = Math.floor(bb[0] / BC); i <= Math.floor(bb[2] / BC); i++) for (let j = Math.floor(bb[1] / BC); j <= Math.floor(bb[3] / BC); j++) { const k = i * 65536 + j; let l = BG.get(k); if (!l) BG.set(k, l = []); l.push(bi); } });
  K.ensureNear = (x, z, r) => { if (K.allBuilt) return; for (let i = Math.floor((x - r) / BC); i <= Math.floor((x + r) / BC); i++) for (let j = Math.floor((z - r) / BC); j <= Math.floor((z + r) / BC); j++) { const l = BG.get(i * 65536 + j); if (!l) continue;
      for (const bi of l) { const SB = fab.strips[bi]; if (SB._built) continue; const bb = SB._bb; if (x + r < bb[0] || x - r > bb[2] || z + r < bb[1] || z - r > bb[3]) continue; buildBand(bi); } } };
  K.ensureAll = () => { for (let bi = 0; bi < fab.strips.length; bi++) buildBand(bi); };
  Object.defineProperty(S, 'rects', { enumerable: true, configurable: true, get: () => { let n = 0; for (const s of K.signs) n += s.n; return n; } });
  Object.defineProperty(S, 'units', { enumerable: true, configurable: true, get: () => K.units.length });
  Object.defineProperty(S, 'colliders', { enumerable: true, configurable: true, get: () => K.cols.length });
  S.ms = Math.round(performance.now() - T0);
  if (AUDIT) { K.ensureAll(); K.audit = auditStrip(K, G, blocked); }
  return K; }

// a_stripfix: raised front walks (0.12 m) for city.groundH -> people stand on them instead of sinking 12 cm, cars ride up the kerb
export function stripGroundH(K, x, z) { if (!K || !K.raise) return undefined; let y; K.raise.near(x, z, x, z, (R) => { const [u, v] = axes(R.a); const dx = x - R.x, dz = z - R.z;
    if (Math.abs(dx * u[0] + dz * u[1]) <= R.hl && Math.abs(dx * v[0] + dz * v[1]) <= R.hw) { y = R.y; return true; } return false; }); return y; }
// &stripaudit: every collider against sidewalks / buildings / trunks / parked cars after the drop
function auditStrip(K, G, blocked) { const R = { cols: K.cols.length, byKind: {}, bad: {} };
  for (const c of K.cols) { R.byKind[c.k] = (R.byKind[c.k] || 0) + 1; const w = blocked({ x: c.x, z: c.z, a: c.a, hl: Math.max(0.02, c.hl - 0.12), hw: Math.max(0.02, c.hw - 0.12) }, { own: null, cars: false });
    const ownBody = w === 'body' && (c.k === 'enclosure'); if (w && w !== 'zone' && !ownBody) R.bad[c.k + ':' + w] = (R.bad[c.k + ':' + w] || 0) + 1; }
  let boxes = 0, bf = 0; for (const u of K.units) { boxes += (u.S.length + u.S1.length + u.F.length + u.F1.length) / NF; bf += (u.S.length + u.F.length) / NF; } R.boxes = boxes; R.boxesFar = bf; return R; }

// ---------------------------------------------------------------- colliders (all at load: ~3k boxes) ----
export function attachStripColliders(city) { const fab = city.fabric || (city.region && city.region.fabric); const K = fab && fab.stripKit; const col = city.col; if (!K || !col || K.colDone) return null;
  for (const c of K.cols) addColTo(col, c); K.colDone = true; K.col = col; // a_stripfix: bands built later add theirs on build
  const q0 = col.query; const REACH = 40; col.query = function (x, z, r, out = []) { if (!K.allBuilt) K.ensureNear(x, z, r + REACH); return q0.call(this, x, z, r, out); };
  return { n: K.cols.length, lazy: true }; }
function addColTo(col, c) { const [u] = axes(c.a); col.addOBB(c.x, c.z, u[0], u[1], c.hl, c.hw, c.h, 'skit'); }

// ---------------------------------------------------------------- meshes ----
function quadGeo() { const g = new THREE.PlaneGeometry(1, 1).toNonIndexed(); const n = g.attributes.position.count; const c = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g; }
export function attachStrip(K, scene) { if (!K) return null; const { box: G, body: MAT } = fabKit(); const T0 = performance.now();
  const g = G.clone(); const ak = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2); ak.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aK', ak);
  const m = new THREE.InstancedMesh(g, MAT, CAP); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.customDepthMaterial = new THREE.MeshDepthMaterial(); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.userData.skit = true; m.layers.set(KIT_LAYER); scene.add(m);
  m.instanceMatrix.array.fill(0, 0, 16); m.count = 1; m.visible = true; m.userData.n = [1, 0]; m.userData.warm = 0; let keep = 0; // zero-scale warm-up instance (programs built with the rest, as a_houses)
  m.onBeforeShadow = function () { keep = this.count; this.count = scene.overrideMaterial ? 0 : this.userData.n[0]; this.userData.warm |= 1; }; m.onAfterShadow = function () { this.count = keep; };
  m.onBeforeRender = function (r, sc, cam, geo, mat) { this.userData.warm |= mat === MAT ? 2 : 4; };
  K.mesh = m;
  const tm = new THREE.InstancedMesh(quadGeo(), prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.05 }), 'fabCar'), TCAP);
  tm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tm.setColorAt(0, new THREE.Color(1, 1, 1)); tm.instanceColor.setUsage(THREE.DynamicDrawUsage); tm.frustumCulled = false; tm.castShadow = false; tm.receiveShadow = true;
  tm.instanceMatrix.array.fill(0, 0, 16); tm.count = 1; scene.add(tm); K.tmesh = tm;
  // a_nightcheck: night light pools under the lot poles' twin heads (they lit nothing): one instanced mesh on the fabric street-lamp
  // pool material (same object -> same fabGlow program), filled by nightPools() -> +1 draw call near a strip at night, 0 programs.
  // ?oldanight: not created.
  { const { flat: GF, glow: GM } = fabKit(); if (!OLD_ANIGHT && GF && GM) {
      const mk = (cap) => { const m = new THREE.InstancedMesh(GF, GM, cap); m.renderOrder = 2; m.castShadow = false; m.receiveShadow = false; m.count = 0; m.visible = false; scene.add(m); return m; };
      K.pm = mk(OLD_ASHOP ? 256 : 512); K.pm.userData.at = null; } }
  K.last = null; K.lastT = null; K.info = { units: 0, boxes: 0, tris: 0, rects: 0 }; K.stats.attachMs = Math.round(performance.now() - T0); return K; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function fadeStrip(K, p, fresh = false) { const m = K.mesh, A = m.geometry.attributes.aK.array, sg = K.segs; let lo = 1e9, hi = -1; K.lastF = [p.x, p.z];
  for (let k = 0; k < sg.length; k += 5) { const dd = Math.hypot(sg[k + 2] - p.x, sg[k + 3] - p.z); const f = Math.max(sstep(RAD - FADE, RAD, dd), sg[k + 4] ? sstep(NEAR - FADE1, NEAR, dd) : 0);
    for (let j = sg[k], e = sg[k] + sg[k + 1]; j < e; j++) { const v = Math.round(A[j * 2]) - 0.45 * f; if (fresh || v !== A[j * 2]) { A[j * 2] = v; if (j < lo) lo = j; if (j > hi) hi = j; } } }
  if (hi >= lo && !fresh) { const ga = m.geometry.attributes.aK; ga.clearUpdateRanges(); ga.addUpdateRange(lo * 2, (hi - lo + 1) * 2); ga.needsUpdate = true; } }
// a_nightcheck: night pools under the lot poles' twin heads (22 m, the fabric lamp colour FAB_GLOW; the fabGlow falloff reads the unit
// flat's position.xz, so the instance scale only sizes a pool). The mesh keeps frustum culling and holds only the pools within LOT_R of
// the camera (refilled every 25 m moved), so away from the strips it is empty / hidden and no view draws (or compiles) it for nothing.
const LOT_D = 22, LOT_R = 420;
function putPool(A, k, x, z, a, sx, sz, y) { const c = Math.cos(a), s = Math.sin(a), j = k * 16; A.fill(0, j, j + 16); A[j] = c * sx; A[j + 2] = -s * sx; A[j + 5] = 1; A[j + 8] = s * sz; A[j + 10] = c * sz; A[j + 12] = x; A[j + 13] = y; A[j + 14] = z; A[j + 15] = 1; }
const WALK_R = 200; // a_shopnight: shop-front / canopy pools within 200 m (after the lot pools; the mesh holds 512 since this pass)
function nightPools(K, p) { const pm = K.pm, L = K.lotPools, Wp = K.walkPools, at = pm.userData.at, CP = OLD_ASHOP ? 256 : 512;
  if (!at || at[2] !== L.length + Wp.length || Math.hypot(p.x - at[0], p.z - at[1]) > 25) { pm.userData.at = [p.x, p.z, L.length + Wp.length]; let k = 0; const A = pm.instanceMatrix.array;
    for (let i = 0; i + 2 < L.length && k < 256; i += 3) if (Math.hypot(L[i] - p.x, L[i + 1] - p.z) < LOT_R) putPool(A, k++, L[i], L[i + 1], L[i + 2], LOT_D, LOT_D, 0.07);
    for (let i = 0; i + 5 < Wp.length && k < CP; i += 6) if (Math.hypot(Wp[i] - p.x, Wp[i + 1] - p.z) < WALK_R) putPool(A, k++, Wp[i], Wp[i + 1], Wp[i + 2], Wp[i + 3], Wp[i + 4], Wp[i + 5]);
    pm.count = k; if (k) { pm.instanceMatrix.needsUpdate = true; pm.computeBoundingSphere(); } }
  pm.visible = U.uNight.value > 0.03 && pm.count > 0; }
export function updateStrip(K, cam) { if (!K || !K.mesh) return; const p = cam && cam.isObject3D ? cam.position : cam; if (!p) return; const m = K.mesh, tm = K.tmesh;
  if (K.pm) nightPools(K, p);
  if ((m.userData.warm & 3) !== 3) return;
  if (p.y > 140) { if (m.visible) { m.visible = false; tm.visible = false; K.last = null; K.lastT = null; } return; }
  // text decals: signs inside their own radius; a_stripfix: over the last TFADE m each rect drops out at its own hashed threshold
  // (an ordered rect-level dissolve on the existing decal program, matching the boxes' dissolve instead of a hard cut)
  if (!K.lastT || Math.hypot(p.x - K.lastT[0], p.z - K.lastT[1]) > TMOVE) { K.lastT = [p.x, p.z]; K.ensureNear(p.x, p.z, Math.max(RAD, TXT_RL) + 5); /* a_stripfix: bands built on approach */ const M = tm.instanceMatrix.array, Cc = tm.instanceColor.array; let n = 0; const list = [];
    K.sg.near(p.x - TXT_RL, p.z - TXT_RL, p.x + TXT_RL, p.z + TXT_RL, (s) => { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < s.R) list.push([d, s]); return false; }); list.sort((a, b) => a[0] - b[0]);
    for (const [d, s] of list) { if (n + s.n > TCAP) break; const f = sstep(s.R - TFADE, s.R, d); const sh0 = s.x * 0.0131 + s.z * 0.0071; let ri = 0; for (const it of s.L) { const { rs, o, r, u, n: nn, px, py } = it;
        for (const [x, y, w, h, ci] of rs.rects) { if (f > 0 && f > ((ri++ * 0.6180339887 + sh0) % 1 + 1) % 1) continue; const cx = (x + w / 2 - rs.W / 2) * px, cy = (rs.H / 2 - (y + h / 2)) * py, sw = w * px, sh = h * py, j = n * 16;
          M[j] = r[0] * sw; M[j + 1] = r[1] * sw; M[j + 2] = r[2] * sw; M[j + 3] = 0; M[j + 4] = u[0] * sh; M[j + 5] = u[1] * sh; M[j + 6] = u[2] * sh; M[j + 7] = 0;
          M[j + 8] = nn[0]; M[j + 9] = nn[1]; M[j + 10] = nn[2]; M[j + 11] = 0; M[j + 12] = o[0] + r[0] * cx + u[0] * cy; M[j + 13] = o[1] + r[1] * cx + u[1] * cy; M[j + 14] = o[2] + r[2] * cx + u[2] * cy; M[j + 15] = 1;
          const c = rs.pal[ci]; Cc[n * 3] = c[0]; Cc[n * 3 + 1] = c[1]; Cc[n * 3 + 2] = c[2]; n++; } } }
    tm.count = n; tm.visible = n > 0; tm.instanceMatrix.clearUpdateRanges(); tm.instanceMatrix.addUpdateRange(0, n * 16); tm.instanceMatrix.needsUpdate = true; tm.instanceColor.clearUpdateRanges(); tm.instanceColor.addUpdateRange(0, n * 3); tm.instanceColor.needsUpdate = true; K.info.rects = n; }
  const mv = K.last ? Math.hypot(p.x - K.last[0], p.z - K.last[1]) : 1e9;
  if (mv < 2.5) { if (K.segs && Math.hypot(p.x - K.lastF[0], p.z - K.lastF[1]) >= 0.3) fadeStrip(K, p); return; } K.last = [p.x, p.z]; const T0 = performance.now();
  const near = []; K.ug.near(p.x - RAD - 60, p.z - RAD - 60, p.x + RAD + 60, p.z + RAD + 60, (u) => { const d = Math.hypot(u.x - p.x, u.z - p.z); if (d < RAD) near.push([d, u]); return false; }); near.sort((a, b) => a[0] - b[0]);
  const M = m.instanceMatrix.array, Cc = m.instanceColor.array, A = m.geometry.attributes.aK.array; let n = 0; const segs = []; const cnt = [0, 0];
  const put = (a) => { const k = a.length / NF; if (n + k > CAP) return false; for (let j = 0; j < k; j++, n++) { const o = j * NF; M.set(a.subarray(o, o + 16), n * 16); Cc[n * 3] = a[o + 16]; Cc[n * 3 + 1] = a[o + 17]; Cc[n * 3 + 2] = a[o + 18]; A[n * 2] = a[o + 19]; A[n * 2 + 1] = a[o + 20]; } return true; };
  const seg = (n0, u, tier) => { if (n > n0) segs.push(n0, n - n0, u.x, u.z, tier); };
  for (const [d, u] of near) { let q = n; if (!put(u.S)) break; seg(q, u, 0); if (d < NEAR) { q = n; put(u.S1); seg(q, u, 1); } } cnt[0] = n;
  for (const [d, u] of near) { let q = n; if (!put(u.F)) break; seg(q, u, 0); if (d < NEAR) { q = n; put(u.F1); seg(q, u, 1); } } cnt[1] = n - cnt[0];
  K.segs = segs; fadeStrip(K, p, true);
  m.count = Math.max(1, n); if (!n) M.fill(0, 0, 16); m.userData.n = cnt; m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, Math.max(1, n) * 16); m.instanceMatrix.needsUpdate = true;
  m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, Math.max(1, n) * 3); m.instanceColor.needsUpdate = true; const ga = m.geometry.attributes.aK; ga.clearUpdateRanges(); ga.addUpdateRange(0, Math.max(1, n) * 2); ga.needsUpdate = true; m.visible = true;
  K.info = { units: near.length, boxes: n, casters: cnt[0], tris: n * 12, rects: K.info.rects, ms: +(performance.now() - T0).toFixed(2) }; }
