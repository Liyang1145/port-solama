// a_promenade (map 索拉纳港 only): street-level detail along the beachfront drive (海潮大道 / Tideline, x = 290) and the two
// inner avenues (x = 170, x = 50): sidewalk-café terraces (bistro sets, market umbrellas, café barriers, planters, A-frame
// menu boards), a bike-share dock per street (kiosk totem, docks, step-through share bikes), multi-space parking pay stations,
// mid-block fire hydrants with the blue reflective road marker in the lane, traffic-signal controller cabinets with meter
// pedestals at the signalised corners, newsrack corrals, utility valve / meter lids, and pole dressing on the existing
// wooden utility poles (PVC service riser + weatherhead, stapled flyers, pole tags, guy-wire guard on some).
// All original procedural geometry. Everything is a THREE.InstancedMesh (one per part kind, vertex colours baked per part,
// instance colour for variants) drawn with materials keyed 'fabCar' = the instanced vertex-colour MeshStandard program the
// mainland fabric cars already compile (roughness / metalness are uniforms) -> no new shader program.
// Instances are streamed by camera distance (refilled when the camera moves > 8 m); every kind has a near radius, umbrellas /
// kiosks / cabinets also a coarse far geometry out to 260 m.
// Placement keeps the pedestrian through-zone clear: on every sidewalk a 2 m band (kerb offset 8.9-10.9 m from the road
// axis on the 4.5 m sidewalks, wider where the hotel forecourts are deeper) gets nothing; kerb-zone items sit at 7.4-8.8 m,
// frontage items within 1.9 m of the shop front only where the front is >= 13.3 m from the axis. Nothing goes on the
// carriageway (|offset| < 7). Colliders are added for everything taller than a lid, matching the footprints.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mulberry } from '../../util.js';
import { prep } from '../../mats.js';
import { hydrantA, parkingMeter } from '../../streetkit.js';
import { newsBox, cabinet } from '../../detail.js';

const RH = 7;
const STREETS = [290, 170, 50];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MX = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(sx, sy, sz));
const P = (g, m) => { g.applyMatrix4(m); return g; };
const BX = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.BoxGeometry(w, h, d), MX(x, y, z, rx, ry, rz));
const CY = (r0, r1, h, n, x, y, z, rx = 0, ry = 0, rz = 0) => P(new THREE.CylinderGeometry(r0, r1, h, n), MX(x, y, z, rx, ry, rz));
const RB = (w, h, d, r, x, y, z, ry = 0) => P(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), MX(x, y, z, 0, ry));
function beam(a, b, w, h = w, n = 0) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize());
  const g = n ? new THREE.CylinderGeometry(w, w, len, n, 1, true) : new THREE.BoxGeometry(w, len, h);
  return P(g, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1)));
}
const tube = (pts, r, seg, rad) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V3(x, y, z))), seg, r, rad, false);
// merge [geo, rgb] parts -> one non-indexed position / normal / color geometry (what the 'fabCar' program reads)
function merge(parts) {
  let n = 0; const gs = parts.map(([g0, c]) => { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return [g, c]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const [g, c] of gs) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (let i = 0; i < k; i++) col.set(c, (o + i) * 3); o += k; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
const tris = (g) => g.attributes.position.count / 3;

// ------------------------------------------------------------------------------------------------ part geometries ----
// local frames: y = 0 on the pavement; +z = towards the road (kerb) unless noted
const IRON = [0.07, 0.075, 0.08], ALU = [0.62, 0.63, 0.64], GALV = [0.58, 0.59, 0.58], WHITE = [0.92, 0.92, 0.9], CONC = [0.6, 0.59, 0.56];
function bistroSet() { // round marble-top café table on a cast-iron pedestal + two woven bistro chairs facing each other (along x)
  const o = []; const top = [0.86, 0.85, 0.82];
  o.push([CY(0.3, 0.3, 0.03, 16, 0, 0.74, 0), top], [CY(0.305, 0.3, 0.012, 16, 0, 0.72, 0), [0.7, 0.7, 0.68]]);
  o.push([CY(0.03, 0.035, 0.7, 8, 0, 0.37, 0), IRON], [CY(0.06, 0.03, 0.06, 8, 0, 0.7, 0), IRON]);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; o.push([beam(V3(0, 0.12, 0), V3(Math.cos(a) * 0.26, 0.01, Math.sin(a) * 0.26), 0.025, 0.03), IRON]); }
  for (const s of [-1, 1]) { // chairs: woven seat + back band (colour via instance tint), aluminium bent frame
    const x0 = s * 0.62; const seat = [0.95, 0.95, 0.95];
    o.push([RB(0.42, 0.04, 0.42, 0.02, x0, 0.46, 0), seat]);
    o.push([P(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10, 1, true, -Math.PI / 2 - 1.0, 2.0), MX(x0 + s * 0.05, 0.78, 0, 0, s > 0 ? 0 : Math.PI)), seat]);
    for (const dz of [-0.18, 0.18]) for (const dx of [-0.17, 0.17]) o.push([beam(V3(x0 + dx, 0.45, dz), V3(x0 + dx * 1.15, 0.0, dz * 1.12), 0.012, 0, 5), ALU]);
    for (const dz of [-0.18, 0.18]) o.push([beam(V3(x0 + s * 0.18, 0.46, dz), V3(x0 + s * 0.27, 0.86, dz * 0.9), 0.012, 0, 5), ALU]);
  }
  return o;
}
function bistroSetFar() { return [[CY(0.3, 0.3, 0.05, 8, 0, 0.73, 0), [0.86, 0.85, 0.82]], [CY(0.04, 0.04, 0.7, 4, 0, 0.36, 0), IRON], [BX(0.42, 0.46, 0.42, -0.62, 0.23, 0), [0.6, 0.6, 0.6]], [BX(0.42, 0.46, 0.42, 0.62, 0.23, 0), [0.6, 0.6, 0.6]]]; }
// square market umbrella 2.5 m: four sloped canvas panels + valance (canopy = white, tinted per instance), timber pole, iron base
function umbrellaCanopy(far) {
  const R = 1.25, y0 = 2.2, H = 0.55, pos = [];
  const C = [[R, R], [-R, R], [-R, -R], [R, -R]];
  for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4];
    pos.push(0, y0 + H, 0, b[0], y0, b[1], a[0], y0, a[1]); if (!far) pos.push(0, y0 + H - 0.02, 0, a[0], y0 - 0.02, a[1], b[0], y0 - 0.02, b[1]);
    const v = 0.2; pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y0 - v, b[1], a[0], y0, a[1], b[0], y0 - v, b[1], a[0], y0 - v, a[1]);
    if (!far) pos.push(a[0], y0, a[1], b[0], y0 - v, b[1], b[0], y0, b[1], a[0], y0, a[1], a[0], y0 - v, a[1], b[0], y0 - v, b[1]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const parts = [[g, [0.97, 0.97, 0.97]]];
  if (!far) { parts.push([CY(0.12, 0.05, 0.14, 8, 0, y0 + H + 0.04, 0), [0.97, 0.97, 0.97]]); } // top vent
  return parts;
}
function umbrellaPole() { return [[CY(0.025, 0.028, 2.75, 6, 0, 1.38, 0), [0.62, 0.48, 0.32]], [CY(0.22, 0.25, 0.08, 10, 0, 0.04, 0), IRON], [CY(0.06, 0.06, 0.08, 6, 0, 1.6, 0), ALU],
  ...[0, 1, 2, 3].map((k) => [beam(V3(0, 1.62, 0), V3(Math.cos(k * 1.571 + 0.785) * 0.9, 2.42, Math.sin(k * 1.571 + 0.785) * 0.9), 0.012, 0, 4), [0.62, 0.48, 0.32]])]; }
// café barrier panel 2.4 m long (along x): black powder-coated posts + rails, canvas windscreen (tinted per instance)
function barrier() {
  const o = [];
  for (const x of [-1.2, 1.2]) { o.push([CY(0.02, 0.02, 0.95, 6, x, 0.475, 0), IRON], [CY(0.12, 0.12, 0.02, 8, x, 0.01, 0), IRON], [CY(0.03, 0.03, 0.03, 6, x, 0.96, 0), IRON]); }
  o.push([BX(2.4, 0.03, 0.03, 0, 0.93, 0), IRON], [BX(2.4, 0.03, 0.03, 0, 0.12, 0), IRON]);
  o.push([BX(2.36, 0.72, 0.008, 0, 0.53, 0), [0.97, 0.97, 0.97]]);
  return o;
}
function planter() { // fibreglass trough planter with clipped boxwood
  return [[RB(1.0, 0.5, 0.4, 0.03, 0, 0.25, 0), [0.22, 0.22, 0.23]], [BX(0.9, 0.04, 0.3, 0, 0.49, 0), [0.25, 0.2, 0.15]], [P(new THREE.IcosahedronGeometry(0.28, 1), MX(-0.22, 0.68, 0, 0, 0, 0, 1, 0.8, 0.75)), [0.16, 0.3, 0.12]], [P(new THREE.IcosahedronGeometry(0.28, 1), MX(0.22, 0.7, 0, 0, 0.7, 0, 1, 0.85, 0.75)), [0.18, 0.33, 0.13]]];
}
function aframe() { // A-frame sidewalk chalkboard (menu)
  const o = []; const wood = [0.5, 0.36, 0.22];
  for (const s of [-1, 1]) { o.push([BX(0.6, 0.86, 0.025, 0, 0.42, s * 0.12, s * 0.15), wood], [BX(0.5, 0.7, 0.005, 0, 0.44, s * 0.135, s * 0.15), [0.08, 0.1, 0.09]]);
    for (let k = 0; k < 4; k++) o.push([BX(0.3 - k * 0.04, 0.025, 0.004, 0, 0.66 - k * 0.11, s * 0.142, s * 0.15), [0.85, 0.83, 0.78]]); }
  return o;
}
// bike-share: kiosk totem (local +z = screen side), dock post, share bike (local x = along the bike, front at +x)
function kiosk(far) {
  if (far) return [[BX(0.5, 2.3, 0.3, 0, 1.15, 0), [0.1, 0.45, 0.5]], [BX(0.9, 0.04, 0.6, 0, 2.4, 0, -0.3), [0.06, 0.08, 0.14]]];
  const T = [0.08, 0.42, 0.48];
  const o = [[BX(0.7, 0.08, 0.5, 0, 0.04, 0), CONC], [RB(0.5, 2.2, 0.3, 0.05, 0, 1.18, 0), T], [RB(0.52, 0.08, 0.32, 0.02, 0, 2.3, 0), [0.9, 0.9, 0.9]],
    [BX(0.4, 0.5, 0.01, 0, 1.75, 0.151), [0.85, 0.86, 0.84]], [BX(0.36, 0.46, 0.004, 0, 1.75, 0.157), [0.55, 0.7, 0.58]], // station map panel
    [BX(0.22, 0.16, 0.02, 0, 1.25, 0.155), [0.15, 0.17, 0.18]], [BX(0.18, 0.12, 0.004, 0, 1.26, 0.167), [0.22, 0.34, 0.42]], // touch screen
    [BX(0.1, 0.06, 0.02, 0.11, 1.05, 0.16), [0.12, 0.12, 0.12]], [BX(0.4, 0.12, 0.006, 0, 2.05, 0.152), WHITE], // card reader, name band
    [BX(0.9, 0.035, 0.62, 0, 2.48, -0.08, -0.32), [0.06, 0.08, 0.15]], [BX(0.92, 0.02, 0.64, 0, 2.46, -0.08, -0.32), ALU], [CY(0.03, 0.03, 0.24, 6, 0, 2.38, -0.12), ALU]]; // solar panel
  return o;
}
function dockRail(n) { // concrete-free base plate the docks bolt to (along x), n docks 0.9 m apart
  const L = n * 0.9; return [[BX(L, 0.04, 0.42, 0, 0.02, 0), [0.32, 0.33, 0.34]], [BX(L, 0.015, 0.05, 0, 0.045, 0.19), [0.85, 0.72, 0.12]]];
}
function dock() { return [[RB(0.16, 0.78, 0.22, 0.04, 0, 0.43, 0), [0.75, 0.76, 0.77]], [RB(0.18, 0.12, 0.26, 0.03, 0, 0.84, 0.01), [0.08, 0.42, 0.48]], [BX(0.08, 0.05, 0.006, 0, 0.84, 0.141), [0.2, 0.85, 0.3]], [BX(0.06, 0.12, 0.08, 0, 0.36, 0.14), [0.1, 0.1, 0.1]]]; }
function shareBike(far) {
  const frame = [1, 1, 1]; const blk = [0.05, 0.05, 0.055];
  const W = (x, r) => far ? [P(new THREE.TorusGeometry(r, 0.03, 3, 10), MX(x, r + 0.01, 0)), blk] : [P(new THREE.TorusGeometry(r, 0.028, 4, 16), MX(x, r + 0.01, 0)), blk];
  const o = [W(-0.55, 0.33), W(0.55, 0.33)];
  if (far) { o.push([beam(V3(-0.55, 0.34, 0), V3(0.45, 0.95, 0), 0.04), frame], [beam(V3(-0.15, 0.85, 0), V3(0.55, 0.34, 0), 0.04), frame], [BX(0.32, 0.22, 0.3, 0.7, 0.92, 0), frame]); return o; }
  o.push([CY(0.06, 0.06, 0.06, 8, -0.55, 0.34, 0, Math.PI / 2), [0.55, 0.56, 0.58]], [CY(0.07, 0.07, 0.07, 8, 0.55, 0.34, 0, Math.PI / 2), [0.55, 0.56, 0.58]]); // hub motor / dynamo hub
  for (const x of [-0.55, 0.55]) for (let k = 0; k < 3; k++) { const a = k * 2.094; o.push([beam(V3(x, 0.34, 0), V3(x + Math.cos(a) * 0.3, 0.34 + Math.sin(a) * 0.3, 0), 0.018, 0.012), [0.15, 0.15, 0.16]]); } // 3-spoke mag wheels
  o.push([tube([[-0.55, 0.34, 0], [-0.25, 0.42, 0], [0.0, 0.48, 0], [0.22, 0.72, 0], [0.38, 0.96, 0]], 0.03, 10, 6), frame]); // step-through down tube
  o.push([beam(V3(-0.17, 0.46, 0), V3(-0.25, 0.86, 0), 0.026, 0, 6), frame], [beam(V3(-0.55, 0.34, 0.05), V3(-0.2, 0.48, 0.05), 0.012, 0, 4), frame], [beam(V3(-0.55, 0.34, -0.05), V3(-0.2, 0.48, -0.05), 0.012, 0, 4), frame]);
  o.push([beam(V3(-0.55, 0.34, 0), V3(-0.25, 0.8, 0), 0.014, 0, 4), frame]); // seat stays
  o.push([beam(V3(0.55, 0.34, 0), V3(0.4, 1.0, 0), 0.02, 0, 6), [0.6, 0.61, 0.62]]); // fork + steerer
  o.push([RB(0.26, 0.07, 0.13, 0.03, -0.27, 0.9, 0), blk], [CY(0.016, 0.016, 0.12, 5, -0.25, 0.84, 0), [0.5, 0.5, 0.5]]); // saddle, post
  o.push([beam(V3(0.4, 1.0, -0.28), V3(0.4, 1.0, 0.28), 0.014, 0, 5), [0.55, 0.56, 0.58]]); for (const z of [-0.26, 0.26]) o.push([CY(0.02, 0.02, 0.1, 6, 0.38, 1.0, z, Math.PI / 2), blk]);
  o.push([BX(0.34, 0.2, 0.32, 0.62, 0.95, 0), frame], [BX(0.3, 0.008, 0.28, 0.62, 0.85, 0), blk], [BX(0.2, 0.08, 0.004, 0.62, 0.95, 0.162), [0.92, 0.92, 0.9]]); // front basket (branded panel)
  for (const [x, r] of [[-0.55, 0.37], [0.55, 0.37]]) o.push([P(new THREE.TorusGeometry(r, 0.035, 2, 8, 1.6), MX(x, 0.35, 0, 0, 0, x < 0 ? 0.9 : 0.75)), frame]); // fenders
  o.push([BX(0.08, 0.035, 0.05, 0.6, 0.8, 0), [0.95, 0.95, 0.85]], [BX(0.04, 0.04, 0.04, -0.82, 0.62, 0), [0.75, 0.08, 0.06]]); // lamp, tail light
  o.push([BX(0.2, 0.012, 0.012, -0.05, 0.08, 0.05, 0, 0, 0.5), [0.5, 0.5, 0.5]]); // kickstand folded
  return o;
}
function payStation(far) { // multi-space pay station (local +z = screen to the sidewalk)
  if (far) return [[BX(0.42, 1.55, 0.32, 0, 0.78, 0), [0.12, 0.16, 0.2]]];
  const B = [0.12, 0.17, 0.22];
  return [[BX(0.5, 0.06, 0.4, 0, 0.03, 0), CONC], [RB(0.42, 1.45, 0.32, 0.04, 0, 0.78, 0), B], [RB(0.44, 0.1, 0.34, 0.03, 0, 1.52, 0), [0.88, 0.88, 0.86]],
    [BX(0.3, 0.2, 0.01, 0, 1.24, 0.163), [0.6, 0.62, 0.62]], [BX(0.24, 0.15, 0.004, 0, 1.24, 0.17), [0.18, 0.3, 0.22]], // screen
    [BX(0.24, 0.12, 0.03, 0, 1.03, 0.17), [0.15, 0.15, 0.16]], [BX(0.07, 0.03, 0.03, -0.08, 0.92, 0.17), [0.7, 0.7, 0.72]], [BX(0.07, 0.04, 0.03, 0.08, 0.92, 0.17), [0.1, 0.1, 0.1]], // keypad, coin, card
    [BX(0.1, 0.05, 0.02, 0, 0.72, 0.165), [0.08, 0.08, 0.08]], [BX(0.3, 0.3, 0.004, 0, 0.42, 0.162), [0.12, 0.35, 0.72]], [BX(0.16, 0.16, 0.004, 0, 0.45, 0.165), [0.96, 0.96, 0.96]], // ticket slot, blue "P" plate
    [BX(0.44, 0.03, 0.36, 0, 1.6, -0.02, -0.25), [0.06, 0.08, 0.15]]]; // solar lid
}
// traffic-signal controller cabinet (grey aluminium, base-mounted on a concrete pad, louvred door, police panel) + meter pedestal
function signalCabinet(far) {
  const A = [0.7, 0.71, 0.7];
  if (far) return [[BX(1.3, 0.12, 0.9, 0, 0.06, 0), CONC], [BX(1.0, 1.55, 0.65, 0, 0.88, 0), A], [BX(0.3, 1.2, 0.25, 0.85, 0.6, 0), [0.45, 0.46, 0.45]]];
  const o = [[BX(1.4, 0.12, 0.95, 0.1, 0.06, 0), CONC], [RB(1.0, 1.55, 0.65, 0.02, 0, 0.9, 0), A], [RB(1.06, 0.06, 0.72, 0.02, 0, 1.7, 0, 0), [0.66, 0.67, 0.66]]];
  const dk = [0.4, 0.41, 0.4];
  o.push([BX(0.006, 1.38, 0.01, 0, 0.92, 0.328), dk]);
  for (let k = 0; k < 5; k++) o.push([BX(0.36, 0.016, 0.025, 0.24, 0.3 + k * 0.035, 0.33, -0.5), dk], [BX(0.36, 0.016, 0.025, 0.24, 1.42 + k * 0.035, 0.33, -0.5), dk]);
  o.push([BX(0.02, 0.14, 0.035, -0.06, 0.95, 0.34), [0.55, 0.55, 0.56]], [BX(0.18, 0.14, 0.012, -0.28, 1.2, 0.33), [0.62, 0.63, 0.62]], [BX(0.06, 0.04, 0.02, -0.28, 1.2, 0.34), [0.1, 0.1, 0.1]]); // handle, police panel + lock
  o.push([BX(0.22, 0.08, 0.004, 0.24, 1.15, 0.327), [0.95, 0.95, 0.92]], [BX(0.18, 0.14, 0.004, -0.28, 0.6, 0.327), [0.95, 0.8, 0.1]]); // id label, hazard sticker
  for (const dx of [-0.25, 0.25]) o.push([BX(0.12, 0.03, 0.04, dx, 0.13, 0.31), [0.5, 0.5, 0.5]]);
  // meter pedestal + conduit
  o.push([RB(0.3, 1.2, 0.25, 0.02, 0.85, 0.72, 0), [0.45, 0.46, 0.45]], [CY(0.09, 0.09, 0.05, 14, 0.85, 1.05, 0.13, Math.PI / 2), [0.7, 0.72, 0.72]], [P(new THREE.SphereGeometry(0.08, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), MX(0.85, 1.08, 0.155, Math.PI / 2)), [0.75, 0.82, 0.85]]);
  o.push([CY(0.03, 0.03, 0.5, 6, 0.6, 0.38, 0), [0.6, 0.6, 0.62]]);
  return o;
}
// pole dressing for an existing wooden utility pole (local: pole axis at origin, +z = the sidewalk face): grey PVC service riser
// with straps + weatherhead, stapled flyers, aluminium tag, optional guy-wire with yellow guard
function poleDress(guy) {
  const o = []; const pvc = [0.55, 0.56, 0.55]; const R = 0.2;
  o.push([CY(0.035, 0.035, 5.6, 6, 0, 2.95, R + 0.035), pvc], [P(new THREE.TorusGeometry(0.06, 0.02, 4, 8, Math.PI), MX(0, 5.75, R + 0.095, 0, Math.PI / 2)), pvc], [CY(0.05, 0.05, 0.06, 8, 0, 5.78, R + 0.155), pvc]);
  for (let k = 0; k < 6; k++) o.push([BX(0.1, 0.02, 0.03, 0, 0.6 + k * 0.9, R + 0.05), [0.65, 0.66, 0.66]]);
  const fly = [[0.95, 0.92, 0.6], [0.98, 0.98, 0.95], [0.95, 0.55, 0.6], [0.6, 0.85, 0.95], [0.98, 0.8, 0.4]];
  for (let k = 0; k < 6; k++) { const a = -0.8 + k * 0.32, y = 1.35 + (k % 3) * 0.17; o.push([BX(0.2, 0.27, 0.004, Math.sin(a) * 0.186, y, Math.cos(a) * 0.186, 0.02 * (k - 2), a, 0.06 * (k % 2 ? 1 : -1)), fly[k % fly.length]]); }
  o.push([BX(0.09, 0.06, 0.004, 0.06, 2.2, 0.163, 0, 0.35), [0.75, 0.76, 0.76]], [BX(0.12, 0.07, 0.004, -0.06, 2.35, 0.163, 0, -0.35), [0.92, 0.92, 0.88]]);
  if (guy) { o.push([beam(V3(0, 8.6, 0), V3(3.0, 0.05, 0), 0.008, 0, 3), [0.3, 0.3, 0.3]], [beam(V3(3.0, 0.05, 0), V3(3.0 - 0.75, 2.2, 0), 0.03, 0, 6), [0.95, 0.78, 0.08]], [CY(0.1, 0.12, 0.1, 8, 3.0, 0.05, 0), CONC]); } // guy along the line, anchor stays in the kerb zone
  return o;
}
function valveLid(rect) { return rect ? [[BX(0.42, 0.02, 0.62, 0, 0.012, 0), [0.24, 0.23, 0.22]], [BX(0.3, 0.022, 0.5, 0, 0.014, 0), [0.17, 0.16, 0.15]]] : [[CY(0.15, 0.15, 0.02, 12, 0, 0.012, 0), [0.24, 0.23, 0.22]], [CY(0.11, 0.11, 0.022, 12, 0, 0.014, 0), [0.15, 0.14, 0.13]]]; }
function rpm() { return [[BX(0.1, 0.018, 0.1, 0, 0.009, 0), [0.92, 0.92, 0.9]], [BX(0.08, 0.012, 0.008, 0, 0.014, 0.05, -0.6), [0.1, 0.3, 0.95]], [BX(0.08, 0.012, 0.008, 0, 0.014, -0.05, 0.6), [0.1, 0.3, 0.95]]]; }
const fromKit = (list) => list.filter((p) => !(p[3] === 1 && p[0].attributes.position.count < 30)).map((p) => [p[0], p[1]]); // a_props kit parts (drop the tiny lod1 bolts)

// ------------------------------------------------------------------------------------------------ build ----
export function buildPromenade(scene, city) {
  const t0 = performance.now();
  const r = mulberry(6061); const col = city.col; const box = [];
  const occ = (x, z, d) => city.palms.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d) || city.lamps.some((l) => Math.abs(l.x - x) < d && Math.abs(l.z - z) < d) || city.trees.some((t) => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d);
  const hit = (x0, z0, x1, z1) => col.query((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 1, box).some((b) => b.maxX > x0 && b.minX < x1 && b.maxZ > z0 && b.minZ < z1);
  const onWalk = (x, z) => city.groundH(x, z) > 0.1 && city.groundH(x, z) < 0.3;
  const kinds = new Map(); // name -> { near, far, items: [{x,z,m,c}], rN, rF, cast, mat }
  const K = (name, nearParts, farParts, rN, rF, opts = {}) => kinds.set(name, { name, near: merge(nearParts), far: farParts ? merge(farParts) : null, items: [], rN, rF: farParts ? rF : rN, cast: opts.cast !== false, mat: opts.mat || 'm' });
  K('bistro', bistroSet(), bistroSetFar(), 55, 150);
  K('umbC', umbrellaCanopy(false), umbrellaCanopy(true), 110, 260, { mat: 'cloth' });
  K('umbP', umbrellaPole(), null, 90);
  K('barrier', barrier(), null, 90, 0, { mat: 'cloth' });
  K('planter', planter(), null, 90, 0, { mat: 'cloth' });
  K('aframe', aframe(), null, 55);
  K('kiosk', kiosk(false), kiosk(true), 90, 220);
  K('dockRail', dockRail(1), null, 80);
  K('dock', dock(), null, 70);
  K('bike', shareBike(false), shareBike(true), 45, 110);
  K('pay', payStation(false), payStation(true), 80, 200);
  K('hyd', fromKit(hydrantA()), [[CY(0.12, 0.12, 0.62, 6, 0, 0.43, 0), [0.86, 0.66, 0.08]], [CY(0.13, 0.06, 0.2, 6, 0, 0.82, 0), [0.78, 0.78, 0.75]]], 70, 160);
  K('rpm', rpm(), null, 60, 0, { cast: false });
  K('sigcab', signalCabinet(false), signalCabinet(true), 100, 240);
  K('poleD', poleDress(false), null, 80);
  K('poleG', poleDress(true), null, 80);
  K('news', newsBox([1, 1, 1]), null, 70, 0, { mat: 'm' });
  K('lidR', valveLid(true), null, 45, 0, { cast: false });
  K('lidC', valveLid(false), null, 45, 0, { cast: false });
  K('meter1', parkingMeter(false).map((p) => [p[0], p[1]]), null, 60);
  const push = (kind, x, y, z, ry, c = [1, 1, 1], s = 1) => kinds.get(kind).items.push({ x, z, m: MX(x, y, z, 0, ry, 0, s, s, s), c });
  const stat = { cafe: 0, sets: 0, umb: 0, docks: 0, bikes: 0, pay: 0, hyd: 0, cab: 0, pole: 0, news: 0, lids: 0, skipped: 0 };
  const isl = (z) => Math.abs(z) < 368;
  const segs = city.segs.filter((s) => s.axis === 'z' && STREETS.includes(s.c) && !s.bridge && isl((s.a0 + s.a1) / 2) && s.a1 - s.a0 > 40);
  // through-zone band (offset from the road axis), never furnished: the existing palm / street-tree line sits at 9.6-9.7 m, the
  // inner avenues' building fronts at ~12 m, the Tideline hotel café row starts at 12.1 m -> walkers keep 9.95-12.0 m
  const CL0 = 9.95, CL1 = 12.0;
  const clearOK = (o0, o1) => o1 <= CL0 || o0 >= CL1;
  const place = (c, sd, z, o0, o1, hz, h, tag) => { // footprint across offsets [o0,o1] (|offset|) and z +- hz; returns world box or null
    if (!clearOK(o0, o1)) return null; const xa = c + sd * o0, xb = c + sd * o1; const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    if (!onWalk(x0 + 0.05, z) || !onWalk(x1 - 0.05, z) || !onWalk((x0 + x1) / 2, z - hz) || !onWalk((x0 + x1) / 2, z + hz)) return null;
    const cx = (x0 + x1) / 2; if (occ(cx, z, Math.max(x1 - x0, 2 * hz) / 2 + 0.6)) return null;
    if (hit(x0, z - hz, x1, z + hz)) return null;
    return tag ? col.add(x0, z - hz, x1, z + hz, h, tag) : { minX: x0, maxX: x1 };
  };
  const ryFace = (sd) => (sd > 0 ? -Math.PI / 2 : Math.PI / 2); // local +z -> toward the road axis
  const umbCols = [[0.94, 0.93, 0.88], [0.12, 0.42, 0.45], [0.86, 0.3, 0.32], [0.95, 0.72, 0.35], [0.18, 0.24, 0.42], [0.9, 0.58, 0.6]];
  const chairCols = [[0.9, 0.88, 0.82], [0.25, 0.42, 0.62], [0.82, 0.3, 0.25], [0.2, 0.45, 0.35], [0.95, 0.85, 0.55]];
  const shareCol = [0.1, 0.55, 0.62];

  for (const s of segs) {
    const c = s.c, L = s.a1 - s.a0;
    for (const sd of [-1, 1]) {
      if (c === 290 && sd > 0) { // promenade side of Tideline: only lids + hydrants (benches / shelters / bollards already line it)
        for (let z = s.a0 + 20 + r() * 10; z < s.a1 - 15; z += 38 + r() * 14) { const o = 7.9; if (place(c, sd, z, 7.7, 8.1, 0.25, 0, null)) { push('lidC', c + sd * o, 0.15, z, r() * 6); stat.lids++; } }
        continue; }
      // --- kerb zone: mid-block hydrant (+ blue RPM in the lane), pay stations on the inner avenues, valve / meter lids
      { const z = (s.a0 + s.a1) / 2 + (r() - 0.5) * 30; const b = place(c, sd, z, 7.62, 7.98, 0.18, 0.8, 'hyd');
        if (b) { push('hyd', c + sd * 7.8, 0.15, z, r() * 6.28); push('rpm', c + sd * 0.25, 0.0, z, 0); stat.hyd++; } }
      if (c !== 290) for (let z = s.a0 + 24 + r() * 8; z < s.a1 - 20; z += 46 + r() * 10) { const b = place(c, sd, z, 7.62, 8.0, 0.26, 1.7, 'paystn'); if (b) { push('pay', c + sd * 7.81, 0.15, z, ryFace(sd) + Math.PI); stat.pay++; } }
      for (let z = s.a0 + 9 + r() * 8; z < s.a1 - 8; z += 17 + r() * 12) { const rect = r() < 0.55; const o = 9.3 + r() * 1.2; const x = c + sd * o; // lids may sit in the through-zone (flush with the pavement)
        if (onWalk(x, z) && !occ(x, z, 0.8) && !hit(x - 0.4, z - 0.4, x + 0.4, z + 0.4)) { push(rect ? 'lidR' : 'lidC', x, 0.15, z, rect ? (r() < 0.5 ? 0 : Math.PI / 2) : r() * 6); stat.lids++; } }
      // --- bike-share station (one per street side on the inner avenues; Tideline west kerb is the parking lane -> beside the meters)
      if ((c !== 290 && L > 100 && r() < 0.6) || (c === 290 && s.a0 > -160 && s.a0 < -140)) {
        const n = 6 + Math.floor(r() * 3); const len = n * 0.9 + 0.9; let done = false;
        for (let t = 0; t < 8 && !done; t++) { const z0 = s.a0 + 18 + r() * (L - 36 - len); const zc = z0 + len / 2;
          const b = place(c, sd, zc, 7.45, 8.85, len / 2 + 0.2, 1.1, 'bikeshare'); if (!b) continue; done = true; stat.docks++;
          const ox = 8.1; push('kiosk', c + sd * ox, 0.15, z0 + 0.25, ryFace(sd) + Math.PI);
          let zEnd = z0 + 0.45 + n * 0.9 + 0.2; // a_orphans: last dock (+0.2); the box used to run 0.65 m past it
          for (let i = 0; i < n; i++) { const zz = z0 + 0.9 + 0.45 + i * 0.9; push('dockRail', c + sd * 8.5, 0.15, zz, Math.PI / 2); push('dock', c + sd * 8.6, 0.15, zz, ryFace(sd));
            if (r() < 0.72) { // bike angled into the dock, rear wheel toward the road (fits 7.45-8.85)
              const yaw = sd > 0 ? 0 : Math.PI; /* front wheel into the dock (away from the road) */ const m = new THREE.Matrix4().compose(V3(c + sd * 8.15, 0.15, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + 0.62 * sd, 0)), V3(0.82, 0.82, 0.82));
              kinds.get('bike').items.push({ x: c + sd * 8.15, z: zz, m, c: shareCol }); stat.bikes++; zEnd = Math.max(zEnd, zz + 0.45); } }
          if (b.maxZ - zEnd > 0.1) b.fit = [[b.minX, b.minZ, b.maxX, zEnd, b.h]]; }
      }
      // --- traffic-signal controller cabinet near the downstream corner (kerb zone), meter pedestal beside it
      { const z = s.a1 - 4.6; const b = place(c, sd, z, 7.5, 8.75, 0.85, 1.75, 'sigcab'); if (b) { push('sigcab', c + sd * 8.12, 0.15, z, ryFace(sd) + Math.PI); stat.cab++;
        // a_lane8fix: fit to the visible cabinet (local x -0.55..0.55, depth +-0.36) + meter pedestal (local x 0.7..1.0); the 0.12 m pad is stepped over
        const ry = ryFace(sd) + Math.PI, cx = c + sd * 8.12, co = Math.cos(ry), si = Math.sin(ry); const L = (u0, u1, v0, v1) => { const xs = [], zs = [];
          for (const u of [u0, u1]) for (const v of [v0, v1]) { xs.push(cx + co * u + si * v); zs.push(z - si * u + co * v); } return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), 1.75]; };
        b.fit = [L(-0.55, 0.55, -0.36, 0.36), L(0.7, 1.0, -0.15, 0.25)]; } }
      // --- newsrack corral mid-block on the inner avenues' kerb zone (3-4 boxes on a shared base)
      if (c !== 290 && r() < 0.55) { const n = 3 + Math.floor(r() * 2); const z = s.a0 + 14 + r() * (L - 28); const b = place(c, sd, z, 7.95, 8.5, n * 0.26 + 0.05, 1.2, 'nbox2');
        if (b) { const cols = [[0.12, 0.32, 0.65], [0.75, 0.12, 0.12], [0.9, 0.75, 0.15], [0.95, 0.95, 0.93], [0.15, 0.45, 0.25], [0.3, 0.3, 0.32]]; for (let k = 0; k < n; k++) push('news', c + sd * 8.22, 0.15, z - (n - 1) * 0.26 + k * 0.52, ryFace(sd) + Math.PI, cols[Math.floor(r() * cols.length)]); stat.news += n; } }
      // --- Tideline hotel café terraces (west side, forecourt 12-15 m under the awnings): fill the gaps between the existing café
      //     sets with bistro sets (square market umbrella over every other one), a café barrier along the street edge of the
      //     terrace (offset 12.0, an opening every third panel), planters at the ends, an A-frame menu board at each opening
      if (c === 290 && sd < 0) {
        for (const a of city.awnings) { if (Math.abs(a.x0 - (c - 15)) > 0.6 || a.z1 < s.a0 || a.z0 > s.a1) continue;
          const z0 = Math.max(a.z0, s.a0 + 9) + 0.6, z1 = Math.min(a.z1, s.a1 - 9) - 0.6; if (z1 - z0 < 6) continue;
          const uc = umbCols[Math.floor(r() * umbCols.length)], cc = chairCols[Math.floor(r() * chairCols.length)]; let k = 0;
          for (let z = z0 + 1.0; z < z1 - 1.0; z += 2.1) { const bb = place(c, sd, z, 12.45, 13.55, 0.95, 1.0, 'cafe2'); if (!bb) continue;
            const m = new THREE.Matrix4().compose(V3(c - 13.0, 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + (r() - 0.5) * 0.25, 0)), V3(1, 1, 1));
            kinds.get('bistro').items.push({ x: c - 13.0, z, m, c: cc }); stat.sets++;
            if (k++ % 2 === 0) { push('umbC', c - 13.0, 0.15, z, (r() - 0.5) * 0.3, uc, 0.85); push('umbP', c - 13.0, 0.15, z, 0); stat.umb++; } }
          if (!k) continue; stat.cafe++;
          let pi = 0; const bo = 12.06;
          for (let z = z0 + 1.2; z < z1 - 1.2; z += 2.45) { if (pi++ % 3 === 2) { if (r() < 0.7 && place(c, sd, z, 12.15, 12.65, 0.2, 0.9, 'aframe')) push('aframe', c - 12.4, 0.15, z, Math.PI / 2); continue; } // opening
            const x = c - bo; if (hit(x - 0.06, z - 1.2, x + 0.06, z + 1.2)) continue; kinds.get('barrier').items.push({ x, z, m: MX(x, 0.15, z, 0, Math.PI / 2), c: uc }); col.add(x - 0.06, z - 1.2, x + 0.06, z + 1.2, 1.0, 'cbar'); }
          for (const zz of [z0 - 0.1, z1 + 0.1]) { const b2 = place(c, sd, zz, 12.25, 12.75, 0.5, 0.9, 'planter'); if (b2) push('planter', c - 12.5, 0.15, zz, Math.PI / 2); }
        }
      }
    }
  }
  // --- pole dressing: every wooden utility pole on the two inner avenues (colliders tagged 'upole' by street.js; Tideline has none)
  for (const b of col.boxes) { if (b.tag !== 'upole') continue; const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2; if (x < -22 || x > 335 || !isl(z)) continue;
    // which road is the pole on: NS (x near 50/170) or EW (z near a cross street); +z local faces away from the road
    const ns = STREETS.find((c) => Math.abs(Math.abs(x - c) - 7.45) < 0.3); if (ns === undefined) continue; const ry = x > ns ? Math.PI / 2 : -Math.PI / 2; // NS avenues only
    const gx = x + Math.cos(ry) * 3.0, gz = z - Math.sin(ry) * 3.0; const guy = r() < 0.18 && !hit(gx - 0.2, gz - 0.2, gx + 0.2, gz + 0.2) && onWalk(gx, gz) && !occ(gx, gz, 1);
    push(guy ? 'poleG' : 'poleD', x, city.groundH(x, z), z, ry); if (guy) col.add(gx - 0.12, gz - 0.12, gx + 0.12, gz + 0.12, 2.4, 'guy'); stat.pole++; }

  // ------------------------------------------------------------------------------------------------ meshes + streaming ----
  const mats = {
    m: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.35 }), 'fabCar'),
    cloth: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0.0 }), 'fabCar'),
  };
  const CELL = 40; const out = { kinds: [], stat, last: new THREE.Vector3(1e9, 0, 1e9) };
  const white = new THREE.Color(1, 1, 1);
  for (const k of kinds.values()) {
    if (!k.items.length) continue;
    const grid = new Map(); for (const it of k.items) { const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(it); }
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, mats[k.mat], k.items.length); im.count = 0; im.castShadow = k.cast; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.items.length * 3).fill(1), 3); im.frustumCulled = true; im.userData.prom = k.name; scene.add(im); return im; };
    k.nearIM = mk(k.near); k.farIM = k.far ? mk(k.far) : null; if (k.farIM) k.farIM.castShadow = false; k.grid = grid; void white;
    out.kinds.push(k);
  }
  const _c = new THREE.Color(); const _sph = new THREE.Sphere();
  out.update = (cam, force) => {
    if (!force && Math.abs(cam.x - out.last.x) < 8 && Math.abs(cam.z - out.last.z) < 8) return; out.last.set(cam.x, 0, cam.z);
    for (const k of out.kinds) {
      let nN = 0, nF = 0; const R = k.rF, rr = k.rN * k.rN, RR = R * R;
      const ix0 = Math.floor((cam.x - R) / CELL), ix1 = Math.floor((cam.x + R) / CELL), iz0 = Math.floor((cam.z - R) / CELL), iz1 = Math.floor((cam.z + R) / CELL);
      let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) { const l = k.grid.get(ix + ',' + iz); if (!l) continue;
        for (const it of l) { const d2 = (it.x - cam.x) ** 2 + (it.z - cam.z) ** 2; if (d2 > RR) continue;
          const im = d2 <= rr ? k.nearIM : k.farIM; if (!im) continue; const i = im === k.nearIM ? nN++ : nF++;
          im.setMatrixAt(i, it.m); im.setColorAt(i, _c.setRGB(it.c[0], it.c[1], it.c[2]));
          mnx = Math.min(mnx, it.x); mxx = Math.max(mxx, it.x); mnz = Math.min(mnz, it.z); mxz = Math.max(mxz, it.z); } }
      for (const [im, n] of [[k.nearIM, nN], [k.farIM, nF]]) { if (!im) continue; im.count = n; im.visible = n > 0; if (!n) continue;
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.instanceMatrix.clearUpdateRanges?.(); im.instanceColor.clearUpdateRanges?.();
        _sph.center.set((mnx + mxx) / 2, 1.5, (mnz + mxz) / 2); _sph.radius = Math.hypot(mxx - mnx, mxz - mnz) / 2 + 4; im.boundingSphere = im.boundingSphere || new THREE.Sphere(); im.boundingSphere.copy(_sph); }
    }
  };
  out.info = () => { let dc = 0, t = 0, inst = 0; const per = {}; for (const k of out.kinds) for (const im of [k.nearIM, k.farIM]) { if (!im || !im.count) continue; dc++; const tt = im.count * tris(im.geometry); t += tt; inst += im.count; per[k.name + (im === k.farIM ? '_far' : '')] = [im.count, Math.round(tt)]; } return { drawCalls: dc, tris: Math.round(t), instances: inst, per }; };
  out.totals = () => { const o = {}; for (const k of out.kinds) o[k.name] = [k.items.length, tris(k.near), k.far ? tris(k.far) : 0]; return o; };
  out.buildMs = Math.round(performance.now() - t0); city.promenade = out;
  return out;
}
