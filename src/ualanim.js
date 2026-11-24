// anim2: CC0 Quaternius Universal Animation Library clips (dist/assets/anim_ual.glb, packed by tools/ualpack.py) retargeted at run
// time onto each cast proto's own 70-bone Mixamo-style skeleton (the cast rigs differ in rest pose: women's arms / legs by up to
// ~45 deg, so one baked clip set would not fit them all). Retarget = world-space rotation delta from the source rest pose, applied to
// the target bone after a per-bone "swing" that points it the way the source rest bone points (removes the T-pose / A-pose and
// proportion differences without re-applying them as motion); the character's facing is matched by a yaw about +Y; the hips
// translation is scaled by the hip-height ratio; each clip is then lifted / sunk by one constant so the lowest sole over the clip sits
// on the bind-pose ground (the cast's ground convention, see people.js calibrate). Clips are built lazily per proto (first use) and
// cached; ~3-8 ms per clip per proto.
import * as THREE from 'three';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
// per-feature switches (old behaviour): ?oldcrouch ?oldmelee ?oldstagger ?olddoor ?oldjump2 ; ?olduanim = all of them
export const UA = { all: Q.has('olduanim') };
for (const k of ['crouch', 'melee', 'stagger', 'door', 'jump2']) UA[k] = !UA.all && !Q.has('old' + k);
if (typeof window !== 'undefined') window.__UA = UA;

const SIDE = ['Left', 'Right'];
const MAP = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
for (const S of SIDE) {
  MAP.push(S + 'Shoulder', S + 'Arm', S + 'ForeArm', S + 'Hand', S + 'UpLeg', S + 'Leg', S + 'Foot', S + 'ToeBase');
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) MAP.push(`${S}Hand${f}${k}`);
}
const DIR = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const S of SIDE) {
  Object.assign(DIR, { [S + 'Shoulder']: S + 'Arm', [S + 'Arm']: S + 'ForeArm', [S + 'ForeArm']: S + 'Hand', [S + 'Hand']: S + 'HandMiddle1', [S + 'UpLeg']: S + 'Leg', [S + 'Leg']: S + 'Foot', [S + 'Foot']: S + 'ToeBase', [S + 'ToeBase']: S + 'Toe_End' });
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) DIR[`${S}Hand${f}${k}`] = `${S}Hand${f}${k + 1}`;
}
export const UPPER_RE = /(Spine1|Spine2|Neck|Head|Shoulder|Arm|ForeArm|Hand)/;
let SRC = null;
const FLATY = new Set(['jstart', 'jland2']);
export const UAL_ST = { clips: 0, ms: 0 };
if (typeof window !== 'undefined') window.__UAL_ST = UAL_ST;
export function setUAL(gltf) {
  if (!gltf) return; const scene = gltf.scene; const nodes = {}; const rest = [];
  scene.traverse((o) => { nodes[o.name] = o; rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const clips = {}; for (const c of gltf.animations) clips[c.name] = c;
  SRC = { scene, nodes, rest, clips, mixer: new THREE.AnimationMixer(scene) };
}
export const hasUAL = () => !!SRC;
const resetSrc = () => { for (const [o, p, q, s] of SRC.rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); } SRC.scene.updateMatrixWorld(true); };
const wpos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
const wquat = (o) => { const q = new THREE.Quaternion(); o.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };

// lightweight copy of a proto's bone tree in proto-scene space (the proto scene itself stays untouched)
function targetRig(P) {
  if (P._urig) return P._urig;
  P.scene.updateMatrixWorld(true); const hips = P.scene.getObjectByName('Hips'); if (!hips) return null;
  const holder = new THREE.Object3D(); holder.matrixAutoUpdate = false; holder.matrix.copy(hips.parent.matrixWorld); holder.matrixWorld.copy(holder.matrix);
  const copy = (b) => { const o = new THREE.Object3D(); o.name = b.name; o.position.copy(b.position); o.quaternion.copy(b.quaternion); o.scale.copy(b.scale); for (const c of b.children) if (c.isBone) o.add(copy(c)); return o; };
  const root = copy(hips); holder.add(root); root.updateMatrixWorld(true);
  const nodes = {}; const order = []; root.traverse((o) => { nodes[o.name] = o; order.push(o); }); // traverse = parents first
  const restQ = new Map(order.map((o) => [o, o.quaternion.clone()])); const restP = root.position.clone();
  return P._urig = { holder, root, nodes, order, restQ, restP };
}
const lowJ = (N) => Math.min(wpos(N.LeftFoot).y, wpos(N.RightFoot).y, wpos(N.LeftToeBase).y, wpos(N.RightToeBase).y);

function retarget(P, key, upperOnly) {
  const clip = SRC && SRC.clips[key]; const T = targetRig(P); if (!clip || !T) return null;
  const t0 = performance.now();
  resetSrc(); const S = SRC.nodes; const N = T.nodes;
  const names = MAP.filter((n) => S[n] && N[n]);
  // facing: left-hip -> right-hip axis x up = forward, on both rigs; R yaws the source frame onto the target's
  const fw = (L, Rr) => { const a = wpos(L).sub(wpos(Rr)); const f = new THREE.Vector3().crossVectors(a, new THREE.Vector3(0, 1, 0)); f.y = 0; return f.normalize(); };
  T.root.updateMatrixWorld(true);
  const fs = fw(S.LeftUpLeg, S.RightUpLeg), ft = fw(N.LeftUpLeg, N.RightUpLeg);
  const R = new THREE.Quaternion().setFromUnitVectors(fs, ft); const Ri = R.clone().invert();
  const footY = (M) => Math.min(wpos(M.LeftFoot).y, wpos(M.RightFoot).y);
  const k = (wpos(N.Hips).y - footY(N)) / Math.max(0.1, wpos(S.Hips).y - footY(S));
  const Ws0i = {}, Wr = {}, Sw = {};
  for (const o of T.order) { const n = o.name; if (!names.includes(n)) continue;
    Ws0i[n] = wquat(S[n]).invert();
    const ch = DIR[n]; let sw = null;
    if (ch && S[ch] && N[ch]) { const sd = wpos(S[ch]).sub(wpos(S[n])).applyQuaternion(R), td = wpos(N[ch]).sub(wpos(N[n])); if (sd.lengthSq() > 1e-10 && td.lengthSq() > 1e-10) sw = new THREE.Quaternion().setFromUnitVectors(td.normalize(), sd.normalize()); }
    if (!sw) { let p = o.parent; while (p && !Sw[p.name]) p = p.parent; sw = p ? Sw[p.name].clone() : new THREE.Quaternion(); }
    Sw[n] = sw; Wr[n] = sw.clone().multiply(wquat(N[n])); }
  const ps0 = wpos(S.Hips); const pt0 = wpos(N.Hips); const hInv = T.holder.matrixWorld.clone().invert();
  const restLow = Math.min(wpos(N.LeftFoot).y, wpos(N.RightFoot).y, wpos(N.LeftToeBase).y, wpos(N.RightToeBase).y); // bind-pose ground (calibrate's 'rest')
  const a = SRC.mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset(); a.play(); a.weight = 1;
  const fps = 30, dur = clip.duration || 1 / fps, nf = Math.max(2, Math.round(dur * fps) + 1);
  const times = new Float32Array(nf); const qv = {}; for (const n of names) qv[n] = new Float32Array(nf * 4); const pv = new Float32Array(nf * 3);
  const W = new Map(); const lows = new Float32Array(nf); const lf = new Float32Array(nf); const hz = new Float32Array(nf);
  const tq = new THREE.Quaternion(), d = new THREE.Quaternion(), pq = new THREE.Quaternion();
  for (let f = 0; f < nf; f++) {
    const t = Math.min(dur, f / fps); times[f] = t; SRC.mixer.setTime(t); SRC.scene.updateMatrixWorld(true);
    for (const o of T.order) {
      const n = o.name; const par = o.parent && W.get(o.parent); const pw = par || wquat(T.holder);
      if (Ws0i[n]) {
        d.copy(R).multiply(wquat(S[n])).multiply(Ws0i[n]).multiply(Ri); tq.copy(d).multiply(Wr[n]);
        W.set(o, tq.clone()); pq.copy(pw).invert().multiply(tq); o.quaternion.copy(pq);
        const v = qv[n]; if (f > 0 && v[f * 4 - 4] * pq.x + v[f * 4 - 3] * pq.y + v[f * 4 - 2] * pq.z + v[f * 4 - 1] * pq.w < 0) pq.set(-pq.x, -pq.y, -pq.z, -pq.w);
        v[f * 4] = pq.x; v[f * 4 + 1] = pq.y; v[f * 4 + 2] = pq.z; v[f * 4 + 3] = pq.w;
      } else W.set(o, pw.clone().multiply(T.restQ.get(o)));
    }
    const disp = wpos(S.Hips).sub(ps0).applyQuaternion(R).multiplyScalar(k); if (FLATY.has(key) && disp.y > 0) disp.y = 0; const pt = pt0.clone().add(disp).applyMatrix4(hInv); // jump clips (FLATY): the physics does the rise
    T.root.position.copy(pt); pv[f * 3] = pt.x; pv[f * 3 + 1] = pt.y; pv[f * 3 + 2] = pt.z;
    T.root.updateMatrixWorld(true); lows[f] = lowJ(N);
    lf[f] = wpos(N.LeftFoot).z - wpos(N.Hips).z; hz[f] = wpos(N.Hips).z;
  }
  a.stop(); SRC.mixer.uncacheAction(clip); resetSrc();
  // ground = calibrate()'s convention: lowest foot / toe joint over the clip at the bind pose's lowest joint height (people.js lift)
  let mn = 1e9; for (let f = 0; f < nf; f++) mn = Math.min(mn, lows[f]);
  const off = restLow - mn; const offL = new THREE.Vector3(0, off, 0).applyMatrix4(hInv).sub(new THREE.Vector3().applyMatrix4(hInv));
  for (let f = 0; f < nf; f++) { pv[f * 3] += offL.x; pv[f * 3 + 1] += offL.y; pv[f * 3 + 2] += offL.z; }
  const tracks = [];
  for (const n of names) { if (upperOnly && !UPPER_RE.test(n)) continue; tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, qv[n])); }
  if (!upperOnly) tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, pv));
  const out = new THREE.AnimationClip('ual_' + key + (upperOnly ? '_u' : ''), dur, tracks);
  // stride (crouch walk): 2 x swing range of the left foot relative to the hips along forward; left-foot-forward phase
  let mx = -1e9, mi = 1e9, tm = 0; for (let f = 0; f < nf; f++) { if (lf[f] > mx) { mx = lf[f]; tm = f / (nf - 1); } mi = Math.min(mi, lf[f]); }
  out.userData = { stride: Math.max(0.2, 2 * (mx - mi)), ph: tm, off, drift: hz[nf - 1] - hz[0] };
  // restore the light rig to rest for the next clip
  for (const o of T.order) o.quaternion.copy(T.restQ.get(o)); T.root.position.copy(T.restP); T.root.updateMatrixWorld(true);
  UAL_ST.clips++; UAL_ST.ms += performance.now() - t0;
  return out;
}
export function ualClip(P, key, upperOnly = false) {
  const ck = key + (upperOnly ? '_u' : ''); P.ual ||= {}; if (ck in P.ual) return P.ual[ck];
  let c = null; try { c = retarget(P, key, upperOnly); } catch (e) { console.warn('[ual] retarget', key, e); }
  return P.ual[ck] = c;
}
export const UAL_KEYS = ['cidle', 'cwalk', 'jab', 'cross', 'hook', 'hitC', 'hitH', 'knock', 'jstart', 'jland2', 'climb'];
