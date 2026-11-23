// v4.2 close-up street furniture (original procedural models, vertex-coloured): wooden utility pole with hardware,
// bus shelter, newspaper vending box, utility cabinet. Each builder returns [[geometry, rgb], ...] in local space;
// stamp() bakes them into a GeoBucket with a placement matrix.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CYBER } from './mapsel.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(...s));
const P = (g, m) => { g.applyMatrix4(m); return g; };
export function stamp(add, parts, m) { for (const [g, c] of parts) add(g, m, c); }

// ---------------------------------------------------------------- wooden utility pole ----
// tapered 10-sided creosote pole with darker butt (ground line), galvanised steps, ID tag, ground-wire moulding,
// crossarm with two diagonal braces and three ribbed pin insulators, optional pole-top transformer with bushings.
export function woodPole(H, rnd, wood, opts = {}) {
  const out = [];
  const pole = new THREE.CylinderGeometry(0.12, 0.17, H, 10, 6); pole.translate(0, H / 2, 0);
  // weathering: per-vertex colour can't vary inside one stamp, so add a darker butt sleeve instead
  out.push([pole, wood]);
  const butt = new THREE.CylinderGeometry(0.177, 0.18, 1.4, 10); butt.translate(0, 0.7, 0); out.push([butt, wood.map((c) => c * 0.62)]);
  const tag = new THREE.BoxGeometry(0.1, 0.14, 0.012); out.push([P(tag, M(0, 1.9, 0.172)), [0.75, 0.75, 0.7]]);
  const gw = new THREE.BoxGeometry(0.03, H - 1, 0.025); out.push([P(gw, M(0.15, H / 2 + 0.5, 0.06, 0, 0.4)), [0.35, 0.33, 0.3]]);
  for (let y = 2.8; y < H - 1.2; y += 0.45) { const st = new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5); st.rotateZ(Math.PI / 2); const s = (Math.round(y / 0.45) % 2) ? 1 : -1; st.translate(s * 0.22, y, 0); out.push([st, [0.55, 0.56, 0.57]]); }
  // crossarm along local x
  const ay = H - 0.45;
  out.push([P(new THREE.BoxGeometry(2.4, 0.1, 0.09), M(0, ay, 0.15)), [0.31, 0.27, 0.22]]);
  for (const s of [-1, 1]) { const b = new THREE.BoxGeometry(0.035, 0.85, 0.02); out.push([P(b, M(s * 0.32, ay - 0.36, 0.15, 0, 0, s * 0.72)), [0.45, 0.46, 0.47]]); }
  for (const x of [-1.05, 0, 1.05]) {
    const pin = new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5); pin.translate(x, ay + 0.1, 0.15); out.push([pin, [0.5, 0.5, 0.5]]);
    for (let k = 0; k < 3; k++) { const d = new THREE.CylinderGeometry(0.035 - k * 0.006, 0.055 - k * 0.006, 0.05, 10); d.translate(x, ay + 0.14 + k * 0.05, 0.15); out.push([d, [0.74, 0.79, 0.72]]); }
  }
  if (opts.transformer) {
    const can = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14); can.translate(0, H - 2.0, 0.42); out.push([can, [0.52, 0.55, 0.53]]);
    const lid = new THREE.CylinderGeometry(0.31, 0.31, 0.05, 14); lid.translate(0, H - 1.53, 0.42); out.push([lid, [0.45, 0.48, 0.46]]);
    for (const s of [-1, 1]) { const bu = new THREE.CylinderGeometry(0.03, 0.04, 0.16, 8); bu.translate(s * 0.12, H - 1.43, 0.42); out.push([bu, [0.62, 0.42, 0.28]]); }
    out.push([P(new THREE.BoxGeometry(0.08, 0.6, 0.1), M(0, H - 2.0, 0.17)), [0.4, 0.4, 0.4]]);
  }
  if (opts.streetlight) { // small cobra arm on some wood poles
    const arm = new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6); arm.rotateX(Math.PI / 2 - 0.15); arm.translate(0, H - 2.8, -0.95); out.push([arm, [0.5, 0.5, 0.5]]);
    const hd = new THREE.SphereGeometry(0.22, 10, 6); hd.scale(0.7, 0.35, 1.3); hd.translate(0, H - 2.65, -1.9); out.push([hd, [0.55, 0.56, 0.57]]);
  }
  return out;
}

// ---------------------------------------------------------------- bus shelter (local: x along kerb, -z = back wall) ----
export function busShelter() {
  const o = []; const steel = [0.24, 0.26, 0.28], glass = [0.42, 0.52, 0.55], alu = [0.72, 0.74, 0.76];
  for (const x of [-1.95, 0, 1.95]) for (const z of [-0.62, 0.55]) { if (x === 0 && z > 0) continue; const p = new THREE.CylinderGeometry(0.045, 0.05, 2.45, 10); p.translate(x, 1.225, z); o.push([p, steel]); }
  // curved roof: extruded arc (barrel) with fascia and gutter
  const sh = new THREE.Shape(); const R = 3.2, a0 = -0.26, a1 = 0.26; sh.moveTo(Math.sin(a0) * R, Math.cos(a0) * R - R);
  for (let i = 1; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; sh.lineTo(Math.sin(a) * R, Math.cos(a) * R - R); }
  for (let i = 12; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 12; sh.lineTo(Math.sin(a) * (R + 0.05), Math.cos(a) * (R + 0.05) - R); }
  const roof = new THREE.ExtrudeGeometry(sh, { depth: 4.3, bevelEnabled: false, curveSegments: 1 }); roof.rotateY(Math.PI / 2); roof.translate(-2.15, 2.5, 0); o.push([roof, [0.9, 0.91, 0.92]]);
  o.push([P(new THREE.BoxGeometry(4.35, 0.14, 0.06), M(0, 2.52, 0.86)), alu]);
  o.push([P(new THREE.BoxGeometry(4.35, 0.08, 0.08), M(0, 2.45, -0.86)), steel]);
  // back glazing: 2 framed panes (frame members + tinted pane), side wing pane
  for (const x of [-0.98, 0.98]) {
    o.push([P(new THREE.BoxGeometry(1.86, 1.75, 0.012), M(x, 1.22, -0.62)), glass]);
    for (const y of [0.33, 2.1]) o.push([P(new THREE.BoxGeometry(1.9, 0.05, 0.05), M(x, y, -0.62)), steel]);
    o.push([P(new THREE.BoxGeometry(1.7, 0.03, 0.014), M(x, 1.15, -0.605)), [0.85, 0.85, 0.85]]); // safety manifestation band
  }
  o.push([P(new THREE.BoxGeometry(0.012, 1.75, 1.1), M(-1.95, 1.22, -0.05)), glass]);
  // perforated bench (slats) on two cantilever brackets
  for (let k = 0; k < 5; k++) o.push([P(new THREE.BoxGeometry(2.6, 0.025, 0.06), M(0.3, 0.47, -0.45 + k * 0.075)), alu]);
  for (const x of [-0.8, 1.4]) { o.push([P(new THREE.BoxGeometry(0.05, 0.47, 0.05), M(x, 0.235, -0.5)), steel]); o.push([P(new THREE.BoxGeometry(0.05, 0.05, 0.42), M(x, 0.44, -0.33)), steel]); }
  // map / timetable case on the end post, small litter bin
  o.push([P(new THREE.BoxGeometry(0.05, 0.75, 0.55), M(1.95, 1.45, -0.05)), [0.15, 0.17, 0.2]]);
  o.push([P(new THREE.BoxGeometry(0.01, 0.62, 0.45), M(1.98, 1.45, -0.05)), [0.82, 0.84, 0.8]]);
  const bin = new THREE.CylinderGeometry(0.2, 0.18, 0.7, 12); bin.translate(2.35, 0.35, 0.2); o.push([bin, [0.2, 0.32, 0.26]]);
  const lip = new THREE.TorusGeometry(0.2, 0.02, 6, 16); lip.rotateX(Math.PI / 2); lip.translate(2.35, 0.71, 0.2); o.push([lip, steel]);
  if (!CYBER) { // a_props (map 索拉纳港): backlit ad light box behind the end-wing poster, roof gutter + downpipe, kerb edge strip, bench armrests
    o.push([new RoundedBoxGeometry(0.13, 1.74, 1.24, 1, 0.02).translate(1.915, 1.3, 0), alu]);
    for (const [w, h, y, z] of [[0.05, 1.74, 1.3, -0.6], [0.05, 1.74, 1.3, 0.6], [1.24, 0.05, 2.15, 0], [1.24, 0.05, 0.45, 0]]) o.push([P(new THREE.BoxGeometry(0.03, h, w > 0.1 ? w : 0.05), M(1.995, y, z)), steel]);
    o.push([P(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), M(-2.12, 1.25, -0.8)), steel]);                            // downpipe
    o.push([P(new THREE.BoxGeometry(4.3, 0.06, 0.1), M(0, 2.43, -0.92)), steel]);                                              // gutter
    o.push([P(new THREE.BoxGeometry(4.4, 0.012, 0.25), M(0, 0.006, 0.95)), [0.86, 0.72, 0.18]]);                            // yellow kerb edge strip
    for (const x of [-0.3, 0.75]) o.push([P(new THREE.BoxGeometry(0.04, 0.16, 0.3), M(x, 0.56, -0.3)), steel]);              // anti-sleep armrests
    o.push([P(new THREE.BoxGeometry(0.3, 0.08, 0.004), M(1.4, 2.2, -0.605)), [0.9, 0.9, 0.88]]);                             // stop number plate
  }
  return o;
}

// ---------------------------------------------------------------- newspaper vending box (local: +z = front) ----
export function newsBox(col) {
  const o = [];
  const body = new RoundedBoxGeometry(0.46, 0.62, 0.44, 2, 0.035); body.translate(0, 0.62, 0); o.push([body, col]);
  const hood = new RoundedBoxGeometry(0.47, 0.2, 0.46, 2, 0.05); hood.translate(0, 1.02, -0.005); o.push([hood, col]);
  o.push([P(new THREE.BoxGeometry(0.38, 0.27, 0.02), M(0, 0.78, 0.222)), [0.88, 0.88, 0.86]]); // window frame
  o.push([P(new THREE.BoxGeometry(0.33, 0.22, 0.02), M(0, 0.78, 0.226)), [0.12, 0.14, 0.16]]); // window (paper behind)
  o.push([P(new THREE.BoxGeometry(0.28, 0.14, 0.012), M(0, 0.76, 0.234)), [0.86, 0.84, 0.78]]); // the paper's front page
  o.push([P(new THREE.BoxGeometry(0.22, 0.03, 0.04), M(0, 0.6, 0.235)), [0.6, 0.6, 0.62]]); // pull handle
  o.push([P(new THREE.BoxGeometry(0.1, 0.13, 0.05), M(0.13, 1.01, 0.235)), [0.55, 0.56, 0.58]]); // coin mechanism
  o.push([P(new THREE.BoxGeometry(0.03, 0.05, 0.02), M(0.13, 1.03, 0.262)), [0.1, 0.1, 0.1]]);
  o.push([P(new THREE.BoxGeometry(0.36, 0.3, 0.36), M(0, 0.15, 0)), [0.2, 0.2, 0.21]]); // pedestal
  o.push([P(new THREE.BoxGeometry(0.42, 0.02, 0.42), M(0, 0.01, 0)), [0.25, 0.25, 0.26]]);
  if (!CYBER) { // a_props (map 索拉纳港): door hinge pins, price sticker, rain drip lip, chained ground anchor, sun-faded side decal
    for (const y of [0.68, 0.88]) o.push([P(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), M(-0.2, y, 0.228)), [0.6, 0.6, 0.62]]);
    o.push([P(new THREE.BoxGeometry(0.07, 0.04, 0.003), M(0.13, 0.93, 0.236)), [0.93, 0.92, 0.85]]);
    o.push([P(new THREE.BoxGeometry(0.48, 0.015, 0.03), M(0, 0.925, 0.235)), col.map((c) => c * 0.8)]);
    o.push([P(new THREE.BoxGeometry(0.003, 0.2, 0.3), M(0.232, 0.62, 0)), col.map((c) => Math.min(1, c * 0.6 + 0.35))]);
    for (let k = 0; k < 5; k++) { const t = new THREE.TorusGeometry(0.018, 0.005, 3, 6); t.rotateY(k % 2 ? Math.PI / 2 : 0); t.translate(0.18, 0.06 + k * 0.032, -0.19); o.push([t, [0.5, 0.5, 0.48]]); }
  }
  return o;
}

// ---------------------------------------------------------------- utility cabinet (local: +z = front) ----
export function cabinet(col) {
  const o = [];
  o.push([P(new THREE.BoxGeometry(1.25, 0.1, 0.8), M(0, 0.05, 0)), [0.62, 0.61, 0.58]]); // concrete pad
  const body = new RoundedBoxGeometry(0.95, 1.35, 0.55, 2, 0.02); body.translate(0, 0.78, 0); o.push([body, col]);
  const cap = new RoundedBoxGeometry(1.0, 0.06, 0.6, 1, 0.02); cap.translate(0, 1.48, 0); o.push([cap, col.map((c) => c * 0.9)]);
  const dk = col.map((c) => c * 0.55);
  o.push([P(new THREE.BoxGeometry(0.008, 1.2, 0.01), M(0, 0.8, 0.278)), dk]); // door split seam
  for (const x of [-0.47, 0.47]) o.push([P(new THREE.BoxGeometry(0.01, 1.2, 0.01), M(x * 0.98, 0.8, 0.276)), dk]);
  for (let k = 0; k < 6; k++) for (const x of [-0.24, 0.24]) o.push([P(new THREE.BoxGeometry(0.3, 0.018, 0.03), M(x, 0.32 + k * 0.035, 0.283, -0.5)), dk]); // louvres
  for (const x of [-0.05, 0.05]) o.push([P(new THREE.BoxGeometry(0.025, 0.16, 0.03), M(x, 0.95, 0.29)), [0.62, 0.62, 0.6]]); // handles
  o.push([P(new THREE.BoxGeometry(0.05, 0.06, 0.03), M(0.08, 0.85, 0.3)), [0.75, 0.62, 0.2]]); // padlock
  o.push([P(new THREE.BoxGeometry(0.16, 0.11, 0.005), M(-0.25, 1.15, 0.279)), [0.95, 0.82, 0.12]]); // warning sticker
  o.push([P(new THREE.BoxGeometry(0.2, 0.06, 0.005), M(0.25, 1.2, 0.279)), [0.9, 0.9, 0.88]]); // ID label
  return o;
}
