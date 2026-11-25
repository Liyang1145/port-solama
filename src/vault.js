// anim3: vaulting low obstacles — UNVERIFIED, default OFF: enable with ?vault (work stopped 2026-11-25 19:13 for the playtest pass). Kerb-side barriers, low walls, railings, planters, benches and the hood / boot
// of a parked car, 0.45-1.25 m above the player's feet and at most 1.3 m deep (2.4 m for a car across its width), with room to land.
// Trigger: jump while moving towards one (standing: within 0.75 m), or sprint into one. The pose is the CC0 Quaternius UAL
// 'ClimbUp_1m' clip (a running tuck vault; retargeted with no root height, ualanim.js NOROOTY), played over a procedural root path:
// horizontal at the approach speed, height = the upper envelope of ballistic arcs over "the lowest foot joint of the clip pose clears
// the obstacle top by 4 cm while it is over it" -> the legs never cut through the top; both hands are planted on the top edge by a
// two-bone arm IK (animrig.js handIK) while the clip's hands are down. Collisions: the landing spot is checked before the vault starts
// (city colliders + cars + ground height / water); during the vault the player is not pushed by colliders.
import * as THREE from 'three';
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const VAULT = { on: Q.has('vault') && !Q.has('oldvault') }; // opt-in until verified on screen
export const VAULT_ST = { scans: 0, vaults: 0, last: null };
if (typeof window !== 'undefined') { window.__VAULT = VAULT; window.__VAULT_ST = VAULT_ST; }
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sm = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const LOW = 0.45, HIGH = 1.25, REACH = 1.0, DEEP = 1.3, DEEP_CAR = 2.4, LAND = 0.65;
const _tmp = [];
// 2D ray (origin o, unit dir f) vs box -> [tin, tout] or null
function slab(b, ox, oz, fx, fz) {
  let t0 = -1e9, t1 = 1e9;
  const ax = (o, d, mn, mx) => { if (Math.abs(d) < 1e-9) return o >= mn && o <= mx; let a = (mn - o) / d, c = (mx - o) / d; if (a > c) { const t = a; a = c; c = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); return t0 <= t1; };
  if (b.o) { const o = b.o, rx = ox - o.cx, rz = oz - o.cz; if (!ax(rx * o.ux + rz * o.uz, fx * o.ux + fz * o.uz, -o.hl, o.hl)) return null; if (!ax(-rx * o.uz + rz * o.ux, -fx * o.uz + fz * o.ux, -o.hw, o.hw)) return null; }
  else { if (!ax(ox, fx, b.minX, b.maxX)) return null; if (!ax(oz, fz, b.minZ, b.maxZ)) return null; }
  return t1 < 0 ? null : [Math.max(0, t0), t1];
}
// obstacle along one ray: all hits (colliders + parked cars) within 4 m, sorted
function hitsAlong(g, ox, oz, fx, fz, y0) {
  const col = g.city.col, out = [];
  for (const b of col.query(ox + fx * 2, oz + fz * 2, 2.5, _tmp)) { const s = slab(b, ox, oz, fx, fz); if (!s || s[0] > 4) continue; out.push({ tin: s[0], tout: s[1], h: b.h - y0, car: null, tag: b.tag }); }
  for (const v of g.traffic.cars) {
    const dx = v.x - ox, dz = v.z - oz; if (dx * dx + dz * dz > 49) continue; const f = v.forward(); const hl = v.dims.L / 2, hw = v.dims.W / 2;
    const s = slab({ o: { cx: v.x, cz: v.z, ux: f.x, uz: f.z, hl, hw } }, ox, oz, fx, fz); if (!s || s[0] > 4) continue;
    // height where the ray crosses the car: bonnet / boot are low, the cabin is not
    const tm = (s[0] + s[1]) / 2, al = (ox + fx * tm - v.x) * f.x + (oz + fz * tm - v.z) * f.z, a = Math.abs(al) / hl;
    const cross = Math.abs(fx * f.x + fz * f.z) < 0.55; // across the car, not along it
    const low = a > 0.42 && cross && Math.abs(v.speed) < 0.6; const hood = clamp(v.dims.H * 0.7, 0.8, 1.15);
    out.push({ tin: s[0], tout: s[1], h: (v.y || 0) + (low ? hood : v.dims.H + 0.3) - y0, car: v, tag: 'car' });
  }
  out.sort((a, b) => a.tin - b.tin); return out;
}
// can the player vault from here facing yaw? -> plan { tin, tout, H, land: {x, y, z}, car } or null (and why, in VAULT_ST.last)
export function vaultScan(g, yaw, standing) {
  VAULT_ST.scans++; const P = g.P, y0 = P.pos.y, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = fz, lz = -fx;
  const why = (r) => { VAULT_ST.last = r; return null; };
  let plan = null;
  for (const lat of [0, -0.22, 0.22]) { // three parallel rays (body width): all must meet the same kind of low obstacle
    const ox = P.pos.x + lx * lat, oz = P.pos.z + lz * lat; const H = hitsAlong(g, ox, oz, fx, fz, y0);
    const first = H.find((h) => h.h > 0.3); if (!first) return why('nothing ahead');
    if (first.tin > (standing ? 0.75 : REACH)) return why('too far ' + first.tin.toFixed(2));
    if (first.h < LOW || first.h > HIGH) return why('height ' + first.h.toFixed(2) + ' ' + first.tag);
    // merge touching low hits into one obstacle (a barrier + the planter behind it)
    let tin = first.tin, tout = first.tout, top = first.h, car = first.car;
    for (const h of H) { if (h === first || h.h <= 0.3) continue; if (h.tin <= tout + 0.15 && h.tout > tout) { if (h.h > HIGH) return why('tall behind ' + h.tag); tout = h.tout; top = Math.max(top, h.h); car = car || h.car; } }
    if (tout - tin > (car ? DEEP_CAR : DEEP)) return why('deep ' + (tout - tin).toFixed(2));
    // landing zone clear: nothing above knee height between the far side and the landing spot + body radius
    for (const h of H) if (h.h > 0.3 && h.tin > tout + 0.02 && h.tin < tout + LAND + 0.4) return why('landing blocked ' + h.tag);
    if (lat === 0) plan = { tin, tout, H: top, car };
    else if (Math.abs(top - plan.H) > 0.35 || Math.abs(tin - plan.tin) > 0.5) return why('uneven');
  }
  const D = plan.tout + LAND, lxp = P.pos.x + fx * D, lzp = P.pos.z + fz * D; const gy = g.city.groundH(lxp, lzp);
  if (!(gy > -1.2)) return why('water');
  if (gy < y0 - 1.6 || gy > y0 + 0.5) return why('drop ' + (gy - y0).toFixed(2));
  const r = g.city.col.resolve(lxp, lzp, 0.35, gy + 0.5); if (r.hit) return why('landing collides');
  plan.land = { x: lxp, y: gy, z: lzp }; plan.D = D; plan.fx = fx; plan.fz = fz; plan.yaw = yaw; plan.y0 = y0; plan.sx = P.pos.x; plan.sz = P.pos.z;
  VAULT_ST.last = 'ok'; return plan;
}
if (typeof window !== 'undefined') window.__vaultScan = (g, yaw, st) => vaultScan(g, yaw, st);
// start: builds the root path (31 samples) from the clip's foot heights
export function vaultStart(g, plan, speed) {
  const c = g.player, P = g.P; if (!c.playUA('climb', { fi: 0.06, fo: 0.18, w: 1, noik: true, rate: 1 })) return false;
  const a = c._U.climb; const clip = a.getClip(); const U = clip.userData; const d = clip.duration;
  const vh = Math.max(speed, 3.4), dur = clamp(plan.D / vh, 0.5, 0.95); a.timeScale = d / dur; // the whole clip over the vault
  const e = c.os.find((x) => x.a === a); if (e) e.dur = dur;
  const k = c.P.scale * (c.root.scale.x || 1), N = 30, dts = dur / N, gN = 16;
  const sOf = (u) => plan.D * (0.75 * u + 0.25 * u * u * (3 - 2 * u));
  const lowAt = (u) => { const L = U.lows; if (!L) return 0.35; const f = clamp(u * d * U.fps, 0, L.length - 1), i = f | 0, w = f - i; return (L[i] * (1 - w) + L[Math.min(L.length - 1, i + 1)] * w) * k; };
  const floor = new Float32Array(N + 1), y = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { const u = i / N, s = sOf(u); const x = plan.sx + plan.fx * s, z = plan.sz + plan.fz * s;
    const over = s > plan.tin - 0.28 && s < plan.tout + 0.22; // toes ahead of / heels behind the root
    floor[i] = over ? plan.y0 + plan.H + 0.04 - lowAt(u) : g.city.groundH(x, z); }
  floor[0] = plan.y0; floor[N] = plan.land.y;
  for (let i = 0; i <= N; i++) { let m = -1e9; for (let j = 0; j <= N; j++) { const t = (i - j) * dts; m = Math.max(m, floor[j] - 0.5 * gN * t * t); } y[i] = m; }
  // pin the ends to the ground (take-off / landing), never below the floor
  const y0e = y[0] - plan.y0, yNe = y[N] - plan.land.y;
  for (let i = 0; i <= N; i++) { const u = i / N; y[i] = Math.max(floor[i], y[i] - y0e * (1 - sm(u, 0, 0.3)) - yNe * sm(u, 0.7, 1)); }
  P.vault = { plan, t: 0, dur, y, N, sOf, a, speed: vh, minClr: 1e9 };
  P.grounded = true; P.vy = 0; P.jumpT = 0; P.jumping = false; VAULT_ST.vaults++;
  return true;
}
// per frame while P.vault: returns true (the vault owns the player's movement this frame)
export function vaultStep(g, dt) {
  const P = g.P, c = g.player, V = P.vault; if (!V) return false; const pl = V.plan;
  V.t += dt; const u = clamp(V.t / V.dur, 0, 1); const s = V.sOf(u);
  P.pos.x = pl.sx + pl.fx * s; P.pos.z = pl.sz + pl.fz * s;
  const f = u * V.N, i = Math.min(V.N - 1, f | 0), w = f - i; P.pos.y = V.y[i] * (1 - w) + V.y[i + 1] * w;
  P.yaw = pl.yaw; c.yaw = pl.yaw;
  // hands: planted on the top just past the near edge while the clip's hands are down (clip time 0.2-0.5 of 0.67 s)
  const ct = u * 0.67; const hw = sm(ct, 0.16, 0.27) * (1 - sm(ct, 0.4, 0.5));
  if (hw > 0.001) { const H = c.handT || (c.handT = { w: 0, L: new THREE.Vector3(), R: new THREE.Vector3() }); const ex = pl.sx + pl.fx * (pl.tin + 0.1), ez = pl.sz + pl.fz * (pl.tin + 0.1), lx = pl.fz, lz = -pl.fx, hy = pl.y0 + pl.H + 0.03;
    H.L.set(ex + lx * 0.2, hy, ez + lz * 0.2); H.R.set(ex - lx * 0.2, hy, ez - lz * 0.2); H.w = hw; } else if (c.handT) c.handT.w = 0;
  c.setLocomotion(V.speed * 0.9, dt); c.crouch = false; c.airborne = false;
  g.playerSpeed = V.speed; g.curSpeed = V.speed * 0.9;
  if (u >= 1) { P.vault = null; if (c.handT) c.handT.w = 0; P.pos.y = pl.land.y; P.grounded = true; P.vy = 0; const drop = pl.y0 - pl.land.y; if (drop > 0.3) c.playUA('jland2', { from: 0.04, to: 0.9, rate: 1.15, fi: 0.03, fo: 0.3, w: clamp(drop / 2, 0.3, 0.8) }); }
  return true;
}
