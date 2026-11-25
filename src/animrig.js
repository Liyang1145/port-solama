// anim1: procedural bone layer over the mixer pose (Character.update, after mixer.update and before the head look-at).
// Only bone rotations / the model's local transform are touched: no new bones, the GLBs are unchanged.
//   lean    turn banking (yaw rate x speed) and accel / brake / sprint / uphill pitch, split between the whole body (pivot at the
//           feet) and the spine; the head counter-rolls to keep the eyes level                               ?oldlean
//   footik  two-bone leg IK onto city.groundH under heel and toe (kerbs, steps, ramps), hips sink to the lower foot,
//           planted feet locked in world space (no skating while blending / pivoting), re-step with an arc when a locked
//           foot is dragged > 22 cm, sole aligned to the ground normal                                         ?oldfootik
//   breath  breathing (chest + shoulders; rate and depth rise after running) and idle weight shift, random phase ?oldbreath
//   sec     head stabilisation while moving, shoulders / upper arms lag (follow-through), sprint arm / thigh swing amplified ?oldsec
// ?oldanimrig switches the whole layer off (with ?oldgait: the pre-anim1 animation exactly).
// LOD: player + LOD0 all layers; LOD1 only the body lean (model transform: valid on frames the mixer skips); LOD2+ nothing.
import * as THREE from 'three';
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const ARIG = { off: Q.has('oldanimrig'), lean: !Q.has('oldlean'), ik: !Q.has('oldfootik'), breath: !Q.has('oldbreath'), sec: !Q.has('oldsec'), gait: !Q.has('oldgait'), npcfeet: !Q.has('oldnpcfeet') }; // anim3: ?oldnpcfeet = no foot lock on LOD0 NPCs 12-20 m
export const ARIG_ST = { ms: 0, calls: 0, full: 0, feet: 0, lean: 0, steps: 0, locks: 0 };
if (typeof window !== 'undefined') { window.__ARIG = ARIG; window.__ARIG_ST = ARIG_ST; }
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sm = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ex = (k, dt) => 1 - Math.exp(-k * dt);
const NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'LeftHand', 'RightHand']; // anim3: hands (vault hand plant)
const FULL_D = 12; // m from the camera: NPCs farther (LOD0 up to 20 m) get the lean + (anim3) the light foot lock only
const FEET_D = 20; // anim3: light tier = leg IK lock only (one ground sample per foot, no sole tilt, no spine / breath / head / arms)
const AMP = ['LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
const _m = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _k1 = new THREE.Vector3(), _k2 = new THREE.Vector3(), _k3 = new THREE.Vector3(), _k4 = new THREE.Vector3();
const _fw = new THREE.Vector3(), _lf = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();
const wq = (o, out) => out.setFromRotationMatrix(_m.extractRotation(o.matrixWorld));
const wp = (o, out) => out.setFromMatrixPosition(o.matrixWorld);
// set a bone's world rotation (parent matrixWorld must be current), then refresh its subtree
// perf: world matrices are refreshed only for the bones this layer reads (R.ord: the edited bones + their ancestors, parents first;
// fingers etc. are left to the renderer's scene.updateMatrixWorld before the draw)
let CUR = null;
function upd(L) { for (let i = 0; i < L.length; i++) { const b = L[i]; b.matrix.compose(b.position, b.quaternion, b.scale); b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix); } }
function updB(b) { const L = CUR && CUR.sub.get(b); if (L) upd(L); else b.updateMatrixWorld(true); }
function setWorldQ(b, q) { wq(b.parent, _qc).invert(); b.quaternion.copy(_qc.multiply(q)); updB(b); }
// small world-axis rotation without refreshing matrices (the caller refreshes once after a batch; second-order error only)
function rotWorldL(b, axis, ang) { if (Math.abs(ang) < 1e-5) return; wq(b.parent, _qc); _qb.copy(_qc).invert(); _qa.setFromAxisAngle(axis, ang); _qb.multiply(_qa).multiply(_qc); b.quaternion.premultiply(_qb); }
// rotate bone so that the direction bone->child points at target (world)
function aim(b, child, target) {
  const bp = wp(b, _v5), cur = wp(child, _v6).sub(bp), want = _v7.copy(target).sub(bp);
  if (cur.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  _qa.setFromUnitVectors(cur.normalize(), want.normalize()); wq(b, _qb); _qa.multiply(_qb); setWorldQ(b, _qa);
}
// analytic two-bone IK (hip, knee, ankle) with the knee kept in the plane through the pole point
function ik2(up, mid, end, target, pole) {
  const J = wp(up, _v1), M = wp(mid, _v2), E = wp(end, _v3);
  const a = J.distanceTo(M), b = M.distanceTo(E); const d = _v4.copy(target).sub(J); const c = clamp(d.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3); d.normalize();
  const cosA = clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pn = _n.copy(pole).sub(J); pn.addScaledVector(d, -pn.dot(d)); if (pn.lengthSq() < 1e-8) pn.copy(_fw); pn.normalize();
  const knee = _k1.copy(J).addScaledVector(d, a * cosA).addScaledVector(pn, a * sinA); // anim3: no per-leg allocations
  const T = _k2.copy(J).addScaledVector(d, c);
  aim(up, mid, knee); aim(mid, end, T);
}
function init(c) {
  const B = {}; for (const n of NAMES) B[n] = c.model.getObjectByName(n) || null;
  const ok = B.Hips && B.Spine1 && B.LeftUpLeg && B.LeftLeg && B.LeftFoot && B.RightUpLeg && B.RightLeg && B.RightFoot;
  const bl = NAMES.map((n) => B[n]).filter(Boolean); // bones this layer (and the look-at after it) edits
  const set = new Set(); for (const b of bl) for (let o = b; o && o !== c.model; o = o.parent) set.add(o);
  const depth = (o) => { let d = 0; for (; o && o !== c.model; o = o.parent) d++; return d; };
  const ord = [...set].sort((x, y) => depth(x) - depth(y)); const sub = new Map();
  for (const b of ord) sub.set(b, ord.filter((o) => { for (let p = o; p && p !== c.model; p = p.parent) if (p === b) return true; return false; }));
  const rest = {}; for (const n of AMP) if (B[n]) rest[n] = B[n].quaternion.clone(); // idle frame-0 pose (constructor ran mixer.update(0) on idle)
  const r = Math.random;
  return { B, ok, rest, bl, ord, sub, clean: new Float64Array(bl.length * 4), out: new Float64Array(bl.length * 4), hasOut: false, roll: 0, pitch: 0, acc: 0, lsp: 0, exert: 0, bt: r(), st: r() * 50, sway: r() * 6.28, hq: new THREE.Quaternion(), hqOk: false,
    aq: { LeftArm: new THREE.Quaternion(), RightArm: new THREE.Quaternion() }, aqOk: false, drop: 0, slope: 0,
    feet: [mkFoot(B.LeftUpLeg, B.LeftLeg, B.LeftFoot, B.LeftToeBase), mkFoot(B.RightUpLeg, B.RightLeg, B.RightFoot, B.RightToeBase)], ank: null };
}
const mkFoot = (u, l, f, t) => ({ u, l, f, t, off: 0, lock: new THREE.Vector3(), lw: 0, locked: false, step: 0, from: new THREE.Vector3(), prevA: new THREE.Vector3(), has: false, nq: new THREE.Quaternion() });
// three's PropertyMixer only writes a bone when the blended value changed since its last write: a bone whose tracks are constant
// (or a frame the mixer re-applies the same value) keeps last frame's procedural edit, which would then accumulate. So: remember the
// clean (mixer) pose and the edited result; a bone still holding our result was not rewritten -> put the clean pose back first.
function restoreClean(R) { const L = R.bl, C = R.clean, O = R.out;
  for (let i = 0, j = 0; i < L.length; i++, j += 4) { const q = L[i].quaternion;
    if (R.hasOut && q.x === O[j] && q.y === O[j + 1] && q.z === O[j + 2] && q.w === O[j + 3]) q.set(C[j], C[j + 1], C[j + 2], C[j + 3]);
    else { C[j] = q.x; C[j + 1] = q.y; C[j + 2] = q.z; C[j + 3] = q.w; } } }
// end of Character.update (after the look-at): remember what we left on the bones
export function rigEnd(c) { const R = c._rg; if (!R || !R.full) return; const L = R.bl, O = R.out;
  for (let i = 0, j = 0; i < L.length; i++, j += 4) { const q = L[i].quaternion; O[j] = q.x; O[j + 1] = q.y; O[j + 2] = q.z; O[j + 3] = q.w; } R.hasOut = true; }
// reset the model transform the layer owns (seated / dead / layer off)
export function rigReset(c) { const R = c._rg; if (!R) return; if (R.hasOut) { restoreClean(R); R.hasOut = false; R.full = false; } if (!c.dead) c.model.rotation.set(0, 0, 0); c.model.position.x = 0; c.model.position.z = 0; R.roll = R.pitch = R.drop = 0; R.hqOk = R.aqOk = false; for (const f of R.feet) { f.locked = false; f.lw = 0; f.has = false; f.step = 0; } }
// called each frame after mixer.update; posed = the mixer re-posed the bones this frame (bone edits are only safe then)
export function rigApply(c, dt, posed, groundFn) {
  if (ARIG.off || dt <= 0) return;
  if (c.dead || c._seat || !c.root.visible || c.lod > 1 && !c.isPlayer) { const R = c._rg; if (R) { if (!c.dead && !c._seat) rigReset(c); else if (R.hasOut) { restoreClean(R); R.hasOut = false; R.full = false; } } return; }
  const t0 = performance.now(); const R = c._rg || (c._rg = init(c)); if (!R.ok) return;
  const top = (c.isPlayer || c.lod === 0 && (c._camD ?? 0) < FULL_D) && posed;
  const lite = !top && ARIG.npcfeet && ARIG.ik && posed && c.lod === 0 && (c._camD ?? 0) < FEET_D && c.speed > 0.05; // anim3 light tier (walkers only)
  const full = top || lite; ARIG_ST.calls++; R.full = full;
  if (R.hasOut) { restoreClean(R); if (!full) R.hasOut = false; } else if (full) restoreClean(R); if (top) ARIG_ST.full++; else if (lite) ARIG_ST.feet++; else ARIG_ST.lean++;
  if (!full && R.wasFull) { for (const f of R.feet) { f.locked = false; f.lw = 0; f.step = 0; f.has = false; } R.drop = 0; } R.wasFull = full; // anim3: no stale locks on re-entry
  const sp = c.speed, moveT = sm(sp, 0.08, 0.7), runT = sm(sp, 2.3, 3.8), sprT = sm(sp, 4.4, 6.6), gnd = (1 - c.swimW) * (1 - c.airW) * (1 - (c.noIK || 0)); // anim2: noIK = knock-down / get-up (body on the ground)
  // ---- signals: forward acceleration, lateral (turn) acceleration, slope of travel
  const a = (sp - R.lsp) / dt; R.lsp = sp; R.acc += (clamp(a, -20, 20) - R.acc) * ex(10, dt);
  const lat = clamp(c.yawRate, -6, 6) * sp;
  R.slope += ((sp > 0.5 ? clamp(c.mvy / sp, -0.6, 0.6) : 0) - R.slope) * ex(5, dt);
  R.exert = clamp(R.exert + (runT > 0.5 ? dt * 0.12 * (1 + sprT) : -dt * 0.05), 0, 1);
  // ---- lean (model transform, pivot at the feet) — valid at LOD1 too
  let roll = 0, pitch = 0;
  if (ARIG.lean) {
    roll = clamp(-lat * 0.024, -0.26, 0.26) * gnd * moveT;
    pitch = (clamp(R.acc * 0.028, -0.16, 0.2) + 0.035 * runT + 0.07 * sprT + R.slope * 0.22) * gnd * moveT;
    if (c.aimW > 0.3) { roll *= 0.4; pitch *= 0.4; }
  }
  R.roll += (roll - R.roll) * ex(7, dt); R.pitch += (pitch - R.pitch) * ex(6, dt);
  const bodyK = top ? 0.55 : 1;
  // idle weight shift (lateral hip sway, feet stay locked by the IK)
  R.st += dt; const idleW = (1 - moveT) * gnd * (c.var ? 0.4 : 1);
  const swayX = top && ARIG.breath ? Math.sin(R.st * 0.75 + R.sway) * 0.018 * idleW : 0;
  c.model.rotation.set(R.pitch * bodyK, 0, R.roll * bodyK); c.model.position.x = swayX / (c.root.scale.x || 1);
  if (!full) { ARIG_ST.ms += performance.now() - t0; return; }
  const B = R.B; CUR = R;
  if (lite) { _fw.set(Math.sin(c.yaw), 0, Math.cos(c.yaw)); c.root.updateWorldMatrix(false, false); c.model.updateWorldMatrix(false, false); upd(R.ord);
    if (groundFn && gnd > 0.3) footIK(c, R, dt, groundFn, gnd, true); else { R.drop += (0 - R.drop) * ex(10, dt); for (const f of R.feet) { f.locked = false; f.lw = 0; } }
    CUR = null; ARIG_ST.ms += performance.now() - t0; return; }
  _fw.set(Math.sin(c.yaw), 0, Math.cos(c.yaw)); _lf.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); // character forward / left (world)
  // ---- sprint: larger thigh / arm swing (extrapolate the clip pose away from the idle rest pose)
  if (ARIG.sec && sprT > 0.01 && c.aimW < 0.1 && gnd > 0.5) {
    const k = 1 + 0.32 * sprT * gnd; for (const n of AMP) { const b = B[n]; if (!b || !R.rest[n]) continue; if (n.includes('Arm') && c.weaponId && /smg|rifle|shotgun|carbine|lmg|sniper/i.test(c.weaponId)) continue; _qa.copy(R.rest[n]).slerp(b.quaternion, k); b.quaternion.copy(_qa); }
  }
  c.root.updateWorldMatrix(false, false); c.model.updateWorldMatrix(false, false); upd(R.ord);
  // ---- spine share of the lean + breathing
  const sR = R.roll * (1 - bodyK), sP = R.pitch * (1 - bodyK);
  if (sR || sP) { rotWorldL(B.Spine1, _fw, sR * 0.6); rotWorldL(B.Spine1, _lf, sP * 0.6); if (B.Spine2) { rotWorldL(B.Spine2, _fw, sR * 0.4); rotWorldL(B.Spine2, _lf, sP * 0.4); } }
  if (ARIG.breath) {
    R.bt += dt * (0.24 + 0.34 * R.exert); const br = Math.sin(R.bt * 6.2832), dep = (0.6 + 0.9 * R.exert) * (1 - 0.6 * moveT);
    if (B.Spine2) rotWorldL(B.Spine2, _lf, -0.014 * br * dep);
    if (B.LeftShoulder) rotWorldL(B.LeftShoulder, _fw, -0.018 * br * dep);
    if (B.RightShoulder) rotWorldL(B.RightShoulder, _fw, 0.018 * br * dep);
    if (idleW > 0.01) { rotWorldL(B.Hips, _fw, Math.sin(R.st * 0.75 + R.sway + 1.2) * 0.022 * idleW); rotWorldL(B.Spine1, _fw, -Math.sin(R.st * 0.75 + R.sway + 1.2) * 0.026 * idleW); }
  }
  // ---- head: counter the body roll (eyes level), stabilise while moving; upper arms lag a little (follow-through)
  if (ARIG.lean && B.Neck) rotWorldL(B.Neck, _fw, -R.roll * 0.7);
  upd(R.ord);
  if (ARIG.sec && B.Head && c.aimW < 0.1) {
    wq(B.Head, _qb); if (!R.hqOk) { R.hq.copy(_qb); R.hqOk = true; }
    R.hq.slerp(_qb, ex(9, dt)); const w = 0.5 * moveT * gnd; if (w > 0.01) { _qa.copy(_qb).slerp(R.hq, w); setWorldQ(B.Head, _qa); }
    if (B.LeftArm && B.RightArm && !c.weaponId) {
      for (const n of ['LeftArm', 'RightArm']) { const b = B[n]; wq(b, _qb); const f = R.aq[n]; if (!R.aqOk) f.copy(_qb); f.slerp(_qb, ex(16, dt)); const w2 = 0.3 * moveT * gnd; if (w2 > 0.01) { _qa.copy(_qb).slerp(f, w2); setWorldQ(b, _qa); } }
      R.aqOk = true;
    }
  } else R.hqOk = R.aqOk = false;
  // ---- anim3 vault: hands planted on the obstacle's top edge (c.handT = { w, L: Vector3, R: Vector3 } set by src/vault.js)
  if (c.handT && c.handT.w > 0.001 && B.LeftHand && B.RightHand) handIK(c, R);
  // ---- feet on the ground
  if (ARIG.ik && groundFn && gnd > 0.3) footIK(c, R, dt, groundFn, gnd);
  else { R.drop += (0 - R.drop) * ex(10, dt); for (const f of R.feet) { f.locked = false; f.lw = 0; } }
  CUR = null; ARIG_ST.ms += performance.now() - t0;
}
function handIK(c, R) {
  const B = R.B, H = c.handT, w = Math.min(1, H.w);
  for (const [s, T, sg] of [['Left', H.L, 1], ['Right', H.R, -1]]) {
    const up = B[s + 'Arm'], mid = B[s + 'ForeArm'], end = B[s + 'Hand']; if (!up || !mid || !end || !T) continue;
    const P0 = wp(end, _v1); _k3.copy(P0).lerp(T, w); wq(end, _hq);
    const E = wp(mid, _v2); _k4.copy(E).addScaledVector(_lf, 0.35 * sg).addScaledVector(_fw, -0.25).addScaledVector(_up, 0.1); // elbows out and back
    ik2(up, mid, end, _k3, _k4); setWorldQ(end, _hq); // keep the clip's hand orientation (palm down in the tuck)
  }
}
function footIK(c, R, dt, G, gnd, lite) {
  const s = c.P.scale * (c.root.scale.x || 1); const base = c.pos.y;
  const k = c.P.scale * (c.root.scale.x || 1); const ank = (c.P.cal.__ank ?? 0.085) * k, toe = (c.P.cal.__toe ?? 0.05) * k; // joint heights above the sole (idle frame 0)
  let minOff = 0;
  for (const f of R.feet) {
    const A = wp(f.f, _v1); const T = f.t ? wp(f.t, _v2) : _v2.copy(A);
    const g = lite ? G((A.x + T.x) * 0.5, (A.z + T.z) * 0.5) : Math.max(G(A.x, A.z), G(T.x, T.z));
    f.gy = g; f.Ay = A.y; f.Ax = A.x; f.Az = A.z; f.sole = Math.min(A.y - ank, T.y - toe); // anim sole height (world)
    const off = clamp(g - base, -0.45, 0.45); f.off += (off - f.off) * ex(f.has ? 22 : 1e3, dt); f.has = true;
    minOff = Math.min(minOff, f.off);
  }
  // hips sink to the lower foot (step down, kerb edge, slope); smoothed
  R.drop += (minOff - R.drop) * ex(12, dt);
  c.model.position.y += R.drop / (c.root.scale.x || 1); if (R.drop) { c.model.matrixWorld.elements[13] += R.drop; for (const b of R.ord) b.matrixWorld.elements[13] += R.drop; }
  for (const f of R.feet) {
    const A = wp(f.f, _v1); // after the hip drop
    // anim clearance of the sole above the root plane (0 when the clip plants this foot)
    const clr = f.sole - base;
    // target ankle: keep the clip's clearance over this foot's own ground; never below it (clip noise / lift averaging)
    let ty = f.Ay + f.off + Math.max(0, -clr) * 0.9;
    // foot lock: planted = sole near the ground; locked xz stays put in the world until the clip lifts the foot
    const plant = clr < 0.03 && c.swimW < 0.1;
    if (plant && !f.locked && f.step <= 0) { f.locked = true; f.lock.set(f.Ax, 0, f.Az); ARIG_ST.locks++; }
    if (f.locked) {
      const drag = Math.hypot(f.Ax - f.lock.x, f.Az - f.lock.z);
      if (!plant || drag > 0.22) { f.locked = false; if (drag > 0.22 && drag < 1.2 && plant) { f.step = 1; f.from.copy(f.lock); ARIG_ST.steps++; } } // > 1.2 m: teleport, no step
    }
    f.lw += ((f.locked ? 1 : 0) - f.lw) * ex(f.locked ? 30 : 9, dt);
    let tx = f.Ax, tz = f.Az;
    if (f.step > 0) { // re-step: from the old lock to the clip foot along a small arc
      if (Math.hypot(f.Ax - f.from.x, f.Az - f.from.z) > 1.2) f.step = 0;
      f.step = Math.max(0, f.step - dt / 0.2); const u = 1 - f.step, e = u * u * (3 - 2 * u);
      tx = f.from.x + (f.Ax - f.from.x) * e; tz = f.from.z + (f.Az - f.from.z) * e; ty += Math.sin(u * Math.PI) * 0.07; f.lw = 0;
    } else if (f.lw > 0.001) { tx += (f.lock.x - tx) * f.lw; tz += (f.lock.z - tz) * f.lw; }
    const need = Math.abs(ty - A.y) > 0.004 || Math.hypot(tx - A.x, tz - A.z) > 0.004;
    wq(f.f, f.nq); // foot world rotation from the clip (restored after the leg IK)
    if (need) {
      const K = wp(f.l, _v4); const H = wp(f.u, _v5); _v6.copy(K).sub(_v3.copy(H).add(A).multiplyScalar(0.5)); if (_v6.lengthSq() < 1e-6) _v6.copy(_fw); _v6.normalize();
      const pole = _v7.copy(K).addScaledVector(_v6, 0.5).addScaledVector(_fw, 0.15);
      ik2(f.u, f.l, f.f, _k3.set(tx, ty, tz), _k4.copy(pole));
    }
    // sole on the ground normal (only near the ground; steep = a kerb edge, no tilt)
    const near = lite ? 0 : 1 - sm(clr, 0.02, 0.1);
    _qa.copy(f.nq);
    if (near > 0.01) {
      const e = 0.12, x = f.Ax, z = f.Az; const gx = (G(x + e, z) - G(x - e, z)) / (2 * e), gz = (G(x, z + e) - G(x, z - e)) / (2 * e);
      if (Math.abs(gx) < 0.6 && Math.abs(gz) < 0.6 && (Math.abs(gx) > 0.01 || Math.abs(gz) > 0.01)) { _n.set(-gx, 1, -gz).normalize(); _qb.setFromUnitVectors(_up, _n); _qc.identity().slerp(_qb, near); _qa.premultiply(_qc); }
    }
    setWorldQ(f.f, _qa);
  }
}
