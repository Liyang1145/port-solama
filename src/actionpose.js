// r6.2 procedural action layer for the player on top of the mocap mixer (no clip for these in the cast): reload (gun brought
// to the chest, support hand to the magazine well, tilt-and-seat), melee swings (fist jab / bat wind-up + horizontal swing)
// and a low-ready carry that holds the weapon a little out from the hip so it reads from the over-the-shoulder camera
// (it used to hang behind the thigh, hidden by the body). Rotations are given in WORLD space (character frame) and
// converted to each bone's local frame, so they don't depend on the rig's bone axes. Lives outside people.js on purpose.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _ax = new THREE.Vector3();
const find = (m, re) => { let b = null; m.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (a, b, c, d, x) => ss(a, b, x) * (1 - ss(c, d, x));

export class ActionPose {
  constructor(char) { this.bind(char); this.saved = []; this.swing = 0; this.swingDur = 0; this.swingKind = null; }
  bind(char) {
    this.c = char; const m = char.model;
    this.b = { rA: find(m, /RightArm$/), rF: find(m, /RightForeArm$/), lA: find(m, /LeftArm$/), lF: find(m, /LeftForeArm$/), sp: find(m, /Spine2$/) || find(m, /Spine1$/) };
  }
  // undo last frame's offsets (the mixer may skip a frame at low LOD, so offsets must never accumulate)
  restore() { for (const [b, q] of this.saved) b.quaternion.copy(q); this.saved.length = 0; }
  rot(b, axis, ang) {
    if (!b || Math.abs(ang) < 1e-4) return;
    if (!this.saved.some((s) => s[0] === b)) this.saved.push([b, b.quaternion.clone()]);
    b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_pq); _pi.copy(_pq).invert();
    _q.setFromAxisAngle(_ax.copy(axis).normalize(), ang); // world delta -> local: P^-1 * D * P * L
    b.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pi);
    b.updateMatrixWorld(true);
  }
  startSwing(kind, dur) { this.swingKind = kind; this.swingDur = dur; this.swing = dur; }
  // state: { weapon (WEAPONS entry or null), aiming, reloadP (0..1 or -1), dt }
  apply(st) {
    const c = this.c; this.restore(); if (c.dead || !c.root.visible) return false;
    c.root.updateMatrixWorld(true);
    const y = c.yaw; const F = new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), R = new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)), UP = new THREE.Vector3(0, 1, 0);
    const B = this.b; let did = false;
    const w = st.weapon;
        const lift = (b, a) => this.rot(b, R, a), abduct = (b, a, side) => this.rot(b, F, -side * a), twist = (b, a) => this.rot(b, UP, a); // +lift = forward/up, +abduct = away from the body, +twist = toward the character's left
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - st.dt); const p = 1 - this.swing / this.swingDur; did = true;
      if (this.swingKind === 'bat') {
        // wind-up (0-0.35): raise and pull back; strike (0.35-0.6): sweep across; follow-through and recover
        const up = ss(0, 0.3, p) * (1 - ss(0.55, 1, p)); const sweep = ss(0.32, 0.6, p); const back = 1 - ss(0.6, 1, p);
        twist(B.sp, (-0.55 * up + 0.75 * sweep) * back);
        lift(B.rA, 1.2 * up + 0.6 * sweep * back); abduct(B.rA, 0.35 * up, 1); lift(B.rF, 0.5 * up);
        lift(B.lA, 0.9 * (up + sweep * back) * 0.8); twist(B.lA, -0.5 * (up + sweep * back) * 0.6); twist(B.rA, -0.5 * up + 0.4 * sweep * back); lift(B.lF, 0.6 * up);
      } else { // jab: chamber, extend, retract
        const ext = bump(0.05, 0.35, 0.55, 0.95, p); const ch = bump(0, 0.15, 0.2, 0.4, p);
        twist(B.sp, 0.35 * ext - 0.15 * ch); lift(B.rA, 1.35 * ext + 0.5 * ch); lift(B.rF, 1.0 * ch - 0.2 * ext); abduct(B.rA, -0.15 * ext, 1);
        lift(B.lA, 0.6); lift(B.lF, 1.4); // guard
      }
    } else if (w && !w.melee && st.reloadP >= 0) {
      const p = st.reloadP; did = true;
      const inn = ss(0, 0.18, p) * (1 - ss(0.85, 1, p)); const mag = bump(0.2, 0.35, 0.55, 0.7, p); const seat = bump(0.62, 0.7, 0.72, 0.82, p);
      lift(B.rA, 0.55 * inn); lift(B.rF, 0.9 * inn - 0.25 * mag); twist(B.rA, 0.25 * inn);
      lift(B.lA, 0.75 * inn - 0.25 * mag + 0.12 * seat); twist(B.lA, -0.55 * inn); lift(B.lF, 1.2 * inn - 0.5 * mag + 0.3 * seat);
      twist(B.sp, 0.12 * inn);
    } else if (w && !w.melee && !st.aiming) {
      // low ready: arm a touch out from the hip and forward, so the weapon clears the thigh in the over-the-shoulder view
      did = true; abduct(B.rA, 0.22, 1); lift(B.rA, w.id === 'rifle' || w.id === 'shotgun' || w.id === 'smg' ? 0.35 : 0.2);
      if (w.id === 'rifle' || w.id === 'shotgun' || w.id === 'smg') { lift(B.lA, 0.45); twist(B.lA, -0.35); lift(B.lF, 0.9); }
    } else if (w && w.id === 'bat' && !st.aiming) { did = true; abduct(B.rA, 0.15, 1); }
    if (did && c.weaponMesh) c.poseWeapon();
    return did;
  }
}
