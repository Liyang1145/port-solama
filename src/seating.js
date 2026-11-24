// r6.2 vehicle occupants: the player (and an idle second protagonist) sit visibly in the driver's seat with hands on the wheel,
// NPC traffic drivers (and the two-officer crew of a police cruiser) are pooled characters seated in nearby moving cars.
// Getting in / out blends position + pose over ~0.45 s instead of popping. Also drives the cabin detail LOD.
import * as THREE from 'three';
import { Character, poseSeated, poseReach, poseDuck } from './people.js';
import { UA } from './ualanim.js'; // anim2 door sequence (?olddoor)

const T_IN = 0.45, T_OUT = 0.4, T_IN2 = 1.3, T_OUT2 = 1.05, NPC_R = 60, NPC_MAX = 12, CABIN_NEAR = 40, CABIN_MID = 160;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const ease = (t) => t * t * (3 - 2 * t);

export class Occupants {
  constructor(game) { this.g = game; this.pool = { civ: [], cop: [] }; this.npc = new Map(); }
  // seat frame of a vehicle seat in world space -> pose targets
  // (root, not body, is refreshed: a stale parent matrix left the driver a frame behind the car, ~1 m at speed)
  frame(v, which) {
    const c = v.cabin; v.root.updateMatrixWorld(true); const host = c ? c.group.parent : v.body; const W = host.matrixWorld;
    const loc = c ? c.seats[which].clone() : new THREE.Vector3(which === 'passenger' ? -0.38 : 0.38, 0.5, 0);
    const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(W);
    const hip = P(loc.x, loc.y + 0.06, loc.z + 0.04);
    v.body.getWorldQuaternion(_q); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q), left = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
    const pz = c ? c.pedalZ : loc.z + 0.85, fy = c ? c.floorY : loc.y - 0.24;
    const S = { hip, fwd, up, left, lean: 0.24, footL: P(loc.x + 0.13, fy + 0.1, Math.min(pz, loc.z + 0.95)), footR: P(loc.x - 0.13, fy + 0.1, Math.min(pz, loc.z + 0.95)), handL: null, handR: null, quat: _q.clone() };
    if (which === 'driver' && c) { c.steer.updateMatrixWorld(true); const sw = c.steer.matrixWorld;
      // wrist sits a little short of the rim grip, toward the driver
      const gl = c.grips[0].clone().applyMatrix4(sw), gr = c.grips[1].clone().applyMatrix4(sw);
      S.handL = gl.addScaledVector(fwd, -0.07).addScaledVector(left, 0.025); S.handR = gr.addScaledVector(fwd, -0.07).addScaledVector(left, -0.025); }
    return S;
  }
  // place character c in seat (car may be null = not seated); st keeps the blend state on the character
  seat(c, car, which, dt, standPos) {
    let st = c._seat;
    if (car) {
      if (!st || st.car !== car) st = c._seat = { car, which, w: 0, from: (c._lastStand || standPos || c.root.position).clone() };
      st.door = st.door ?? (UA.door && c === this.g.player && !st.npc); st.w = Math.min(1, st.w + dt / (st.door ? T_IN2 : T_IN));
    } else {
      if (!st) { (c._lastStand ||= new THREE.Vector3()).copy(c.root.position); return false; }
      if (st.w >= 1) st.door = UA.door && c === this.g.player; // exiting: the door sequence for the protagonist
      st.w -= dt / (st.door ? T_OUT2 : T_OUT); if (st.w <= 0 || !st.car.root.parent) { c._seat = null; c.model.position.set(0, 0, 0); return false; }
      st.from.copy(standPos || c.pos);
    }
    const v = st.car; const S = this.frame(v, st.which);
    if (st.door) return this.seatDoor(c, st, v, S, !!car);
    const w = ease(st.w);
    // standing body faces the car's heading; the stand point slides from the door-side spot into the seat
    c.root.visible = true; c.setLod && c.setLod(this.g.camera.position.distanceTo(S.hip));
    c.root.quaternion.slerpQuaternions(_q.setFromAxisAngle(_p.set(0, 1, 0), v.yaw), S.quat, w);
    const door = S.hip.clone().addScaledVector(S.left, st.which === 'driver' ? 0.75 : -0.75); door.y = st.from.y;
    const a = st.from, t = w; // quadratic path from -> door -> seat (root pos before the hips correction)
    c.root.position.set((1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * door.x + t * t * S.hip.x, (1 - t) * a.y + t * (S.hip.y - 0.9), (1 - t) * (1 - t) * a.z + 2 * t * (1 - t) * door.z + t * t * S.hip.z);
    c.mixer.update(0); // re-evaluate the clip pose first (LOD-skipped / idle-profile mixers would otherwise accumulate the bend)
    poseSeated(c, S, w);
    // head clearance: taller characters recline further (then sink a little) until the top of the head clears the headliner
    const hb = c._headBone || (c._headBone = c.model.getObjectByName('Head') || null);
    if (hb && v.cabin && v.cabin.headY) { const host = v.cabin.group.parent;
      for (let k = 0; k < 3; k++) { const hl = host.worldToLocal(hb.getWorldPosition(_p)); const ex = hl.y + 0.18 - v.cabin.headY; if (ex <= 0.005) break;
        if (S.lean < 0.55) S.lean = Math.min(0.55, S.lean + ex / 0.6); else S.hip.addScaledVector(S.up, -Math.min(ex, 0.08));
        c.mixer.update(0); poseSeated(c, S, w); } }
    if (c.weaponMesh) c.weaponMesh.visible = false;
    return true;
  }
  // anim2 (?olddoor): protagonist in / out with the door: standing at the door (the approach is walked on foot, game.js), the near hand
  // reaches the door handle and pulls (in) / pushes it shut (out), the body turns its back to the seat, ducks under the roof line
  // and sinks into the seat (poseSeated blend). Timeline u = st.w (0 standing at the door .. 1 seated): reach 0-0.3, sit 0.25-1.
  // The body shell has no separate door panel, so the door itself does not swing (hand / body timing only).
  seatDoor(c, st, v, S, entering) {
    const u = st.w; const sit = ease(Math.min(1, Math.max(0, (u - 0.25) / 0.75))); const side = st.which === 'driver' ? 1 : -1;
    const reach = entering ? Math.sin(Math.min(1, Math.max(0, u / 0.36)) * Math.PI) : Math.sin(Math.min(1, Math.max(0, u / 0.3)) * Math.PI);
    // door spot: outside the sill beside the seat; handle at the rear edge of the front door, belt-line height
    const hw = (v.dims.W || 1.9) / 2; const host = v.cabin ? v.cabin.group.parent : v.body; const loc = v.cabin ? v.cabin.seats[st.which] : _p.set(side * 0.38, 0.5, 0);
    const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(host.matrixWorld);
    const handle = toW(side * (hw + 0.02), loc.y + 0.38, loc.z - 0.32);
    const pull = entering ? Math.min(1, Math.max(0, (u - 0.12) / 0.2)) : 1 - Math.min(1, Math.max(0, (u - 0.04) / 0.18)); // handle travels out with the (implied) door
    handle.addScaledVector(S.left, side * 0.22 * pull).addScaledVector(S.fwd, -0.12 * pull);
    const stand = st.from; const yawCar = v.yaw; c.root.visible = true; c.setLod && c.setLod(this.g.camera.position.distanceTo(S.hip));
    // facing: toward the door (quarter turn into the car) while reaching, then the back to the seat as the body sits
    const qDoor = _q.setFromAxisAngle(_p.set(0, 1, 0), yawCar - side * 0.9).clone();
    c.root.quaternion.slerpQuaternions(qDoor, S.quat, ease(Math.min(1, Math.max(0, (u - 0.22) / 0.5))));
    const door = S.hip.clone().addScaledVector(S.left, side * 0.7); door.y = stand.y;
    const t = sit; c.root.position.set((1 - t) * (1 - t) * stand.x + 2 * t * (1 - t) * door.x + t * t * S.hip.x, (1 - t) * stand.y + t * (S.hip.y - 0.9), (1 - t) * (1 - t) * stand.z + 2 * t * (1 - t) * door.z + t * t * S.hip.z);
    c.mixer.update(0); poseSeated(c, S, sit);
    const hb = c._headBone || (c._headBone = c.model.getObjectByName('Head') || null);
    if (hb && v.cabin && v.cabin.headY) { const h2 = v.cabin.group.parent;
      for (let k = 0; k < 3; k++) { const hl = h2.worldToLocal(hb.getWorldPosition(_p)); const ex = hl.y + 0.18 - v.cabin.headY; if (ex <= 0.005 || sit < 0.98) break;
        if (S.lean < 0.55) S.lean = Math.min(0.55, S.lean + ex / 0.6); else S.hip.addScaledVector(S.up, -Math.min(ex, 0.08)); c.mixer.update(0); poseSeated(c, S, sit); } }
    poseDuck(c, 0.55 * Math.sin(Math.min(1, Math.max(0, (u - 0.2) / 0.7)) * Math.PI)); // head down under the roof line on the way in / out
    c.root.updateMatrixWorld(true); poseReach(c, side > 0, handle, reach * (1 - sit * 0.7));
    if (c.weaponMesh) c.weaponMesh.visible = false;
    return true;
  }
  take(kind) { const p = this.pool[kind]; const c = p.length ? p.pop() : new Character(this.g.scene, kind === 'cop' ? 'cop' : (Math.random() < 0.5 ? 'man' : 'woman')); c.root.visible = true; c._seat = null; return c; }
  give(c) { c.root.visible = false; c._seat = null; this.pool[c.isCop || c.kind === 'cop' ? 'cop' : 'civ'].push(c); }
  update(dt) {
    const g = this.g, cam = g.camera.position; const cars = g.traffic.cars;
    for (const v of cars) { const d = Math.hypot(v.x - cam.x, v.z - cam.z); v.setCabin && v.setCabin(v.driver === 'player' || d < CABIN_NEAR ? 2 : d < CABIN_MID ? 1 : 0); }
    // protagonists (the active one drives P.car; an idle one waits in the car it was left in)
    const profs = g.world && g.world.profiles ? g.world.profiles : [{ char: g.player }];
    for (const p of profs) {
      const active = p.char === g.player; const car = active ? g.P.car : (p.car && cars.includes(p.car) ? p.car : null);
      this.seat(p.char, car, 'driver', dt, active ? g.P.pos : p.P.pos);
    }
    // NPC occupants for nearby AI-driven cars
    const want = [];
    for (const v of cars) { if (!v.ai || !v.root.visible || v.ai.mode === 'dead' || v.health <= 0 || v.driver === 'player' || v.parked || !v.cabin) continue; if (v.type === 'police' && v.crew === 0 && v.ai.chaseSpeed === 0) continue;
      const d = Math.hypot(v.x - cam.x, v.z - cam.z); if (d < NPC_R) want.push([d, v]); }
    want.sort((a, b) => a[0] - b[0]); const keep = new Set(want.slice(0, NPC_MAX).map((x) => x[1]));
    for (const [v, occ] of [...this.npc]) if (!keep.has(v) || !cars.includes(v)) { for (const c of occ) this.give(c); this.npc.delete(v); }
    for (const v of keep) {
      if (!this.npc.has(v)) { const cop = v.type === 'police'; const occ = [this.take(cop ? 'cop' : 'civ')]; if (cop && (v.crew ?? 2) > 1) occ.push(this.take('cop')); this.npc.set(v, occ);
        for (const c of occ) c._seat = { car: v, which: c === occ[0] ? 'driver' : 'passenger', w: 1, from: new THREE.Vector3(v.x, v.y, v.z) }; }
      const occ = this.npc.get(v);
      for (const c of occ) { c.setLocomotion(0, dt); c.pos.set(v.x, v.y, v.z); c.yaw = v.yaw; c.update(dt); this.seat(c, v, c._seat.which, dt); }
    }
  }
  // test helper: list of seated characters
  stats() { let n = 0; for (const o of this.npc.values()) n += o.length; return { npc: n, pooled: this.pool.civ.length + this.pool.cop.length }; }
}
