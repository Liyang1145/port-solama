// a_backlot (map 索拉纳港 only): the service lanes / back yards behind the inner-block building rows. Every inner island
// block (two building rows facing the avenues, back to back) has an open paved courtyard between the two rows of back
// walls; it becomes a working back-of-house lane: a 6 m service lane down the middle (patched asphalt, concrete centre
// gutter with grates, oil stains, a concrete driveway apron across the sidewalk at each end), and along every exposed back
// wall: steel staff doors with a wall lamp, lidded commercial dumpsters with stencilled numbers, wheeled recycling / trash
// carts, split-system condensers on pads with line sets up the wall, wall-hung mini-split units with drain pipes on the
// upper floors, electric meter banks with conduit and yellow guard bollards, gas meters with regulators, a loading dock
// per block (raised concrete platform, roll-up door, bumpers, steel steps, a ramp with pipe rail, pallets, yellow hatch),
// zig-zag fire escapes on a few low Deco hotels (3-4 floors), original spray-paint pieces / tags and grey buff patches on
// the walls, one chain-link fenced yard per block (with green windscreen on some panels and a rolled-back gate), open
// parking stalls with wheel stops, and a few parked delivery vans (the traffic van body from carbody.js, static).
// Realistic Florida back-of-house look; no neon anywhere.
// All original procedural geometry. Everything is a THREE.InstancedMesh (one per part kind) with vertex colours baked per
// part and an instance colour for variants, drawn with prep(MeshStandardMaterial({vertexColors:true}), 'fabCar') — the
// instanced vertex-colour MeshStandard program the mainland fabric cars / a_promenade / a_signage already compile;
// roughness / metalness / emissive / polygonOffset are uniforms or render state -> no new shader program.
// Instances are streamed by camera distance (refilled when the camera moves > 8 m), most kinds with a coarse far mesh.
// Colliders (tag 'backlot') are added for everything a walker could bump into; the lane (+-3.6 m) and the cross-block
// pedestrian alleys stay clear, so the courtyards remain walk-through shortcuts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mulberry } from '../../util.js';
import { prep } from '../../mats.js';
import { buildBody } from '../../carbody.js';

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
// two back-to-back quads (thin mesh wire / windscreen without a DoubleSide program variant)
function quad2(w, h, x, y, z, rx = 0, ry = 0, rz = 0) { const a = new THREE.PlaneGeometry(w, h); const b = new THREE.PlaneGeometry(w, h); b.rotateY(Math.PI); b.translate(0, 0, -0.002); const m = MX(x, y, z, rx, ry, rz); return [P(a, m), P(b, m)]; }
function merge(parts) { // [geo, rgb] -> one non-indexed position / normal / color geometry (what the 'fabCar' program reads)
  let n = 0; const gs = parts.map(([g0, c]) => { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return [g, c]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const [g, c] of gs) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (let i = 0; i < k; i++) col.set(c, (o + i) * 3); o += k; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
const tris = (g) => g.attributes.position.count / 3;

// ------------------------------------------------------------------------------------------------ part geometries ----
// wall-mounted / against-the-wall parts: local x along the wall, local +z away from the wall (into the yard), y = 0 on the slab
const DARK = [0.06, 0.065, 0.07], GALV = [0.6, 0.61, 0.6], CONC = [0.62, 0.6, 0.56], RUBBER = [0.05, 0.05, 0.05], YEL = [0.86, 0.68, 0.08], WHITE = [0.92, 0.92, 0.9];
const COPPER = [0.55, 0.32, 0.18], INSUL = [0.04, 0.04, 0.04], BEIGE = [0.78, 0.75, 0.68], WOOD = [0.52, 0.4, 0.27];
function dumpster(far) { // 2-yard front-load commercial container (body colour = instance tint), black plastic split lids
  const o = []; const B = [1, 1, 1];
  if (far) { o.push([BX(1.9, 1.05, 1.05, 0, 0.62, 0.62), B], [BX(1.92, 0.06, 1.12, 0, 1.2, 0.6, -0.17), [0.08, 0.08, 0.08]]); return o; }
  o.push([BX(1.9, 1.0, 1.0, 0, 0.62, 0.62), B]); // body
  o.push([BX(1.96, 0.08, 1.06, 0, 1.14, 0.62), B]); // top rim
  o.push([BX(1.9, 0.06, 0.06, 0, 0.14, 0.12), [0.25, 0.25, 0.25]], [BX(1.9, 0.06, 0.06, 0, 0.14, 1.12), [0.25, 0.25, 0.25]]); // skids
  for (const s of [-1, 1]) { o.push([BX(0.14, 0.12, 0.9, s * 1.02, 0.78, 0.62), [0.55, 0.55, 0.55]]); // fork pockets
    o.push([BX(0.03, 0.9, 0.05, s * 0.55, 0.62, 1.125), [0.82, 0.82, 0.82]]); } // front ribs (lighter)
  for (const x of [-0.82, 0.82]) for (const z of [0.25, 1.0]) o.push([CY(0.07, 0.07, 0.06, 8, x, 0.07, z, 0, 0, Math.PI / 2), RUBBER], [BX(0.05, 0.08, 0.05, x, 0.13, z), DARK]); // casters
  for (const s of [-1, 1]) { const L = P(new THREE.BoxGeometry(0.94, 0.05, 1.14), MX(s * 0.48, 1.24, 0.6, -0.12 + (s > 0 ? -0.05 : 0), 0, 0)); o.push([L, [0.07, 0.07, 0.075]]); // lids
    o.push([BX(0.3, 0.04, 0.03, s * 0.48, 1.18, 1.18), [0.1, 0.1, 0.1]]); } // lid grips
  o.push([BX(0.5, 0.32, 0.005, 0.55, 0.8, 1.123), [0.72, 0.72, 0.7]]); // hauler decal plate (blank, faded)
  o.push([BX(0.12, 0.6, 0.006, -0.3, 0.55, 1.124), [0.55, 0.42, 0.3]], [BX(0.06, 0.4, 0.006, 0.12, 0.45, 1.124), [0.5, 0.4, 0.3]]); // rust runs
  return o;
}
function cart(far) { // 96-gal wheeled cart (tint), lid hinged at the back (toward the wall), two wheels at the back
  const o = []; const B = [1, 1, 1];
  if (far) { o.push([BX(0.6, 1.0, 0.7, 0, 0.52, 0.4), B]); return o; }
  o.push([P(new THREE.CylinderGeometry(0.4, 0.33, 0.92, 4, 1), MX(0, 0.52, 0.4, 0, Math.PI / 4, 0, 0.78 * 1.0, 1, 0.92)), B]);
  o.push([RB(0.66, 0.06, 0.76, 0.02, 0, 1.01, 0.4), B], [BX(0.5, 0.04, 0.05, 0, 0.98, 0.79), [0.2, 0.2, 0.2]]);
  o.push([CY(0.025, 0.025, 0.62, 6, 0, 0.92, 0.04, 0, 0, Math.PI / 2), DARK]); // handle bar
  for (const s of [-1, 1]) o.push([CY(0.13, 0.13, 0.06, 12, s * 0.3, 0.13, 0.08, 0, 0, Math.PI / 2), RUBBER]);
  o.push([CY(0.02, 0.02, 0.66, 5, 0, 0.13, 0.08, 0, 0, Math.PI / 2), GALV]);
  o.push([BX(0.24, 0.16, 0.004, 0, 0.66, 0.79), WHITE]); // label
  return o;
}
function condenser(far) { // split-system condensing unit on a concrete pad, line set up the wall
  const o = []; const CAS = [0.8, 0.79, 0.74];
  if (far) { o.push([BX(1.1, 0.08, 1.1, 0, 0.04, 0.75), CONC], [BX(0.84, 0.74, 0.84, 0, 0.45, 0.75), CAS]); return o; }
  o.push([BX(1.1, 0.08, 1.1, 0, 0.04, 0.75), CONC]);
  o.push([BX(0.84, 0.66, 0.84, 0, 0.41, 0.75), [0.18, 0.19, 0.2]]); // coil core (dark, louvres read as dark gaps)
  for (const y of [0.14, 0.26, 0.38, 0.5, 0.62]) for (const [w, d, x, z] of [[0.86, 0.035, 0, 1.17], [0.86, 0.035, 0, 0.33], [0.035, 0.86, -0.42, 0.75], [0.035, 0.86, 0.42, 0.75]]) o.push([BX(w, 0.06, d, x, y, z), CAS]);
  for (const [x, z] of [[-0.41, 0.34], [0.41, 0.34], [-0.41, 1.16], [0.41, 1.16]]) o.push([BX(0.05, 0.66, 0.05, x, 0.41, z), CAS]); // corner posts
  o.push([BX(0.88, 0.06, 0.88, 0, 0.77, 0.75), CAS]); // top
  o.push([CY(0.3, 0.3, 0.03, 16, 0, 0.81, 0.75), [0.1, 0.1, 0.1]], [CY(0.06, 0.06, 0.05, 8, 0, 0.82, 0.75), [0.3, 0.3, 0.3]]); // fan grille + hub
  for (let k = 0; k < 4; k++) o.push([BX(0.6, 0.01, 0.018, 0, 0.835, 0.75, 0, k * Math.PI / 4), [0.15, 0.15, 0.15]]);
  o.push([BX(0.22, 0.3, 0.02, 0.32, 0.5, 0.33), [0.7, 0.7, 0.68]]); // service panel
  // line set: suction (insulated) + liquid (copper) from the valves to the wall, up 2.4 m and in through a wall cap
  for (const [x, r, c] of [[0.3, 0.028, INSUL], [0.38, 0.012, COPPER]]) {
    o.push([beam(V3(x, 0.32, 0.33), V3(x, 0.32, 0.06), r, r, 6), c], [beam(V3(x, 0.32, 0.06), V3(x, 2.65, 0.06), r, r, 6), c]); }
  o.push([BX(0.22, 0.18, 0.06, 0.34, 2.7, 0.03), BEIGE]); // wall penetration cap
  o.push([BX(0.24, 0.32, 0.1, 0.34, 1.35, 0.05), [0.55, 0.55, 0.55]], [beam(V3(0.34, 1.19, 0.05), V3(0.34, 0.5, 0.05), 0.012, 0.012, 5), DARK]); // disconnect box + whip
  return o;
}
function wallAC(far) { // ductless mini-split outdoor unit on wall brackets (upper floors), line-set cover + condensate drain
  const o = []; const CAS = [0.88, 0.87, 0.83];
  if (far) { o.push([BX(0.8, 0.55, 0.3, 0, 0, 0.3), CAS]); return o; }
  o.push([BX(0.8, 0.55, 0.3, 0, 0, 0.3), CAS]);
  o.push([CY(0.2, 0.2, 0.012, 16, -0.08, 0, 0.452, Math.PI / 2), [0.15, 0.15, 0.16]]); // fan grille
  for (let k = 0; k < 3; k++) o.push([BX(0.4, 0.012, 0.01, -0.08, 0, 0.46, 0, 0, k * Math.PI / 3), [0.5, 0.5, 0.5]]);
  for (const x of [-0.3, 0.3]) { o.push([BX(0.04, 0.04, 0.5, x, -0.3, 0.25), GALV], [beam(V3(x, -0.3, 0.48), V3(x, -0.62, 0.02), 0.02, 0.02), GALV]); } // L brackets
  o.push([BX(0.09, 1.1, 0.07, 0.36, -0.85, 0.04), BEIGE], [BX(0.12, 0.12, 0.09, 0.36, -0.28, 0.06), BEIGE]); // line-set cover duct
  o.push([beam(V3(-0.32, -0.28, 0.25), V3(-0.32, -2.2, 0.03), 0.012, 0.012, 5), [0.85, 0.85, 0.82]]); // drain hose down the wall
  return o;
}
function meterBank() { // electric meter centre: grey steel enclosure, 4 glass-domed meters, main disconnect, conduit up / down
  const o = []; const G = [0.56, 0.58, 0.58];
  o.push([BX(1.36, 0.95, 0.22, 0, 1.45, 0.11), G], [BX(1.4, 0.05, 0.26, 0, 1.95, 0.13), G]);
  for (let k = 0; k < 4; k++) { const x = -0.48 + k * 0.32; o.push([CY(0.1, 0.1, 0.05, 8, x, 1.5, 0.245, Math.PI / 2), [0.35, 0.37, 0.38]], [CY(0.085, 0.08, 0.1, 8, x, 1.5, 0.3, Math.PI / 2), [0.78, 0.82, 0.84]], [BX(0.1, 0.03, 0.004, x, 1.25, 0.222), WHITE]); }
  o.push([BX(0.36, 0.5, 0.2, 0.92, 1.4, 0.1), G], [BX(0.04, 0.16, 0.06, 1.12, 1.45, 0.12), [0.7, 0.1, 0.1]]); // main disconnect + handle
  o.push([CY(0.045, 0.045, 1.6, 8, -0.4, 2.75, 0.07), GALV], [CY(0.045, 0.045, 0.95, 8, 0.2, 0.5, 0.07), GALV], [CY(0.055, 0.055, 0.06, 8, -0.4, 2.0, 0.07), GALV]); // conduits
  o.push([BX(0.3, 0.12, 0.004, -0.2, 1.84, 0.222), [0.85, 0.15, 0.1]], [BX(0.18, 0.08, 0.004, 0.3, 1.84, 0.222), YEL]); // warning labels
  for (const x of [-0.5, 0.5]) o.push([CY(0.085, 0.085, 1.05, 8, x, 0.52, 0.95), YEL], [CY(0.05, 0.085, 0.06, 8, x, 1.075, 0.95), YEL], [BX(0.17, 0.05, 0.004, x, 0.85, 1.036), DARK]); // guard bollards
  return o;
}
function gasMeter() { // gas service: yellow riser out of the ground, regulator, diaphragm meter, outlet into the wall
  const o = []; const PIPE = [0.86, 0.72, 0.12], MET = [0.62, 0.63, 0.62];
  o.push([CY(0.03, 0.03, 0.55, 8, 0, 0.27, 0.32), PIPE], [CY(0.04, 0.04, 0.06, 8, 0, 0.55, 0.32), PIPE]);
  o.push([beam(V3(0, 0.56, 0.32), V3(0.22, 0.56, 0.32), 0.03, 0.03, 8), PIPE], [CY(0.08, 0.06, 0.12, 10, 0.24, 0.62, 0.32), [0.35, 0.36, 0.38]], [CY(0.05, 0.05, 0.08, 10, 0.24, 0.72, 0.32), [0.35, 0.36, 0.38]]); // regulator
  o.push([RB(0.34, 0.4, 0.24, 0.03, 0.24, 0.98, 0.3), MET], [BX(0.18, 0.1, 0.01, 0.24, 1.04, 0.425), [0.88, 0.88, 0.85]]); // meter + index window
  o.push([beam(V3(0.24, 1.2, 0.3), V3(0.24, 1.34, 0.3), 0.03, 0.03, 8), PIPE], [beam(V3(0.24, 1.34, 0.3), V3(0.24, 1.34, 0.0), 0.03, 0.03, 8), PIPE]);
  o.push([BX(0.2, 0.06, 0.004, 0.24, 1.25, 0.425), YEL]);
  return o;
}
function backDoor() { // flush steel staff door: frame, leaf (tint), kick plate, lever, closer, peephole sign plate, low stoop
  const o = []; const FR = [0.3, 0.31, 0.32];
  o.push([BX(1.2, 0.12, 1.0, 0, 0.06, 0.5), CONC]);
  o.push([BX(1.16, 2.26, 0.07, 0, 1.13, 0.035), FR]); // frame
  o.push([BX(0.98, 2.12, 0.05, 0, 1.18, 0.07), [1, 1, 1]]); // leaf (tint)
  o.push([BX(0.94, 0.25, 0.006, 0, 0.3, 0.098), [0.55, 0.56, 0.57]]); // kick plate
  o.push([BX(0.16, 0.03, 0.05, -0.34, 1.05, 0.12), [0.7, 0.7, 0.7]], [CY(0.03, 0.03, 0.03, 8, -0.34, 1.05, 0.1, Math.PI / 2), [0.7, 0.7, 0.7]]); // lever
  o.push([BX(0.36, 0.08, 0.08, 0.15, 2.17, 0.13), [0.2, 0.2, 0.2]], [BX(0.3, 0.025, 0.025, 0.25, 2.2, 0.2, 0, 0.5), [0.25, 0.25, 0.25]]); // closer + arm
  o.push([BX(0.36, 0.22, 0.006, 0, 1.6, 0.098), WHITE], [BX(0.3, 0.05, 0.007, 0, 1.64, 0.099), [0.75, 0.12, 0.1]]); // "staff only" plate
  return o;
}
function doorLampHousing() { return [[BX(0.26, 0.14, 0.2, 0, 2.62, 0.1), [0.12, 0.12, 0.12]], [BX(0.12, 0.18, 0.04, 0, 2.62, 0.02), [0.12, 0.12, 0.12]]]; }
function doorLampLens() { return [[BX(0.22, 0.03, 0.15, 0, 2.535, 0.12), [1, 0.96, 0.86]]]; }
function dock(far) { // loading dock: platform 4.6 x 2.4 (top +1.1), roll-up door, bumpers, steps (+x end), ramp (-x end)
  const o = []; const SL = [0.68, 0.69, 0.68];
  if (far) { o.push([BX(4.6, 1.1, 2.4, 0, 0.55, 1.2), CONC], [BX(3.2, 3.3, 0.1, 0, 2.75, 0.05), SL], [P(new THREE.BoxGeometry(3.2, 0.1, 1.4), MX(-3.9, 0.55, 0.7, 0, 0, -0.33)), CONC]); return o; }
  o.push([BX(4.6, 1.1, 2.4, 0, 0.55, 1.2), CONC], [BX(4.6, 0.08, 0.08, 0, 1.08, 2.4), [0.4, 0.4, 0.4]]); // platform + steel edge angle
  for (let k = 0; k < 8; k++) o.push([BX(0.29, 0.1, 0.004, -2.1 + k * 0.6, 0.95, 2.403, 0, 0, 0.7), k % 2 ? DARK : YEL]); // hazard band
  for (const x of [-1.2, 1.2]) o.push([BX(0.25, 0.45, 0.12, x, 0.75, 2.46), RUBBER]); // bumpers
  // roll-up door on the wall above the platform: slats, guides, hood
  o.push([BX(3.2, 3.2, 0.06, 0, 2.7, 0.04), SL]); for (let y = 1.25; y < 4.25; y += 0.2) o.push([BX(3.18, 0.02, 0.012, 0, y, 0.075), [0.5, 0.51, 0.5]]);
  o.push([BX(3.4, 0.45, 0.4, 0, 4.55, 0.2), [0.45, 0.46, 0.45]], [BX(0.1, 3.3, 0.14, -1.65, 2.7, 0.07), [0.4, 0.4, 0.4]], [BX(0.1, 3.3, 0.14, 1.65, 2.7, 0.07), [0.4, 0.4, 0.4]]);
  o.push([BX(0.3, 0.06, 0.04, 0, 1.18, 0.09), [0.2, 0.2, 0.2]]); // bottom handle
  // dock light on a swing arm
  o.push([beam(V3(1.95, 3.1, 0.05), V3(1.95, 3.1, 0.9), 0.025, 0.025, 6), DARK], [CY(0.12, 0.16, 0.22, 10, 1.95, 3.0, 0.95, 0.6), [0.25, 0.25, 0.25]]);
  // steel steps with handrail at +x
  for (let k = 0; k < 4; k++) o.push([BX(0.9, 0.04, 0.3, 2.8, 0.25 + k * 0.25, 2.1 - k * 0.3), [0.35, 0.36, 0.36]]);
  for (const z of [1.65, 2.55]) o.push([beam(V3(2.38, 0, z + 0.25), V3(2.38, 1.1, z - 0.95), 0.03, 0.06), [0.35, 0.36, 0.36]], [beam(V3(3.22, 0, z + 0.25), V3(3.22, 1.1, z - 0.95), 0.03, 0.06), [0.35, 0.36, 0.36]]);
  o.push([beam(V3(3.25, 0.9, 2.45), V3(3.25, 2.0, 1.25), 0.022, 0.022, 6), YEL], [CY(0.022, 0.022, 0.9, 6, 3.25, 0.45, 2.45), YEL], [CY(0.022, 0.022, 0.9, 6, 3.25, 1.55, 1.25), YEL]);
  // ramp at -x: concrete wedge from the slab up to the platform over 3.2 m, pipe rail on its outer edge
  { const g = new THREE.BufferGeometry(); const x0 = -2.3, x1 = -5.5, z0 = 0.0, z1 = 1.4, h = 1.1;
    const v = [[x0, 0, z0], [x0, h, z0], [x1, 0, z0], [x0, 0, z1], [x0, h, z1], [x1, 0, z1]]; const f = [[0, 2, 1], [3, 4, 5], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5], [0, 1, 4], [0, 4, 3]];
    const pos = []; for (const t of f) for (const i of t) pos.push(...v[i]); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); o.push([g, CONC]); }
  for (const x of [-2.4, -3.95, -5.3]) o.push([CY(0.025, 0.025, 1.0 + (x + 5.5) / 3.2 * 1.1, 6, x, 0.5 + (x + 5.5) / 3.2 * 0.55, 1.35), GALV]);
  o.push([beam(V3(-5.3, 1.0, 1.35), V3(-2.4, 2.05, 1.35), 0.025, 0.025, 6), GALV]);
  return o;
}
function pallet() { const o = []; for (const z of [-0.5, 0, 0.5]) o.push([BX(1.2, 0.09, 0.1, 0, 0.045, z), WOOD]); for (let k = 0; k < 7; k++) o.push([BX(0.1, 0.02, 1.0, -0.54 + k * 0.18, 0.1, 0), WOOD]); for (let k = 0; k < 3; k++) o.push([BX(0.1, 0.02, 1.0, -0.5 + k * 0.5, 0.0, 0), WOOD]); return o; }
function cartonStack() { const o = []; const K = [0.62, 0.48, 0.32]; o.push([BX(0.6, 0.42, 0.45, 0, 0.21, 0), K], [BX(0.5, 0.38, 0.4, 0.05, 0.61, 0.02, 0, 0.12), [0.66, 0.52, 0.36]], [BX(0.62, 0.02, 0.06, 0, 0.42, 0), [0.75, 0.7, 0.55]], [BX(0.55, 0.32, 0.03, 0.75, 0.16, 0.1, 0.0, 0.3, -1.25), [0.58, 0.45, 0.3]]); return o; }
function drum() { const o = []; o.push([CY(0.29, 0.29, 0.88, 14, 0, 0.44, 0), [1, 1, 1]], [CY(0.295, 0.295, 0.03, 14, 0, 0.3, 0), [0.8, 0.8, 0.8]], [CY(0.295, 0.295, 0.03, 14, 0, 0.6, 0), [0.8, 0.8, 0.8]], [CY(0.27, 0.27, 0.02, 14, 0, 0.885, 0), [0.75, 0.75, 0.75]], [CY(0.04, 0.04, 0.03, 8, 0.15, 0.9, 0.05), DARK]); return o; }
// zig-zag fire escape for a Deco hotel back: platform levels at y = lv[i] (local), 4.8 m along the wall, 1.1 m deep
function fireEscape(lv, far) {
  const o = []; const C = [0.11, 0.12, 0.11]; const W = 4.8, D = 1.1;
  for (let i = 0; i < lv.length; i++) { const y = lv[i];
    o.push([BX(W, 0.05, D, 0, y, D / 2 + 0.05), C]);
    if (far) { o.push([BX(W, 0.9, 0.04, 0, y + 0.5, D + 0.05), C]); continue; }
    for (let k = 0; k < 10; k++) o.push([BX(W, 0.012, 0.02, 0, y + 0.03, 0.12 + k * 0.1), [0.2, 0.2, 0.2]]); // grating bars
    o.push([BX(W, 0.04, 0.04, 0, y + 1.0, D + 0.03), C], [BX(W, 0.03, 0.03, 0, y + 0.5, D + 0.03), C]); // rails along the front
    for (const s of [-1, 1]) o.push([BX(0.04, 0.04, D, s * W / 2, y + 1.0, D / 2 + 0.03), C], [BX(0.03, 0.03, D, s * W / 2, y + 0.5, D / 2 + 0.03), C]); // end rails
    for (let k = 0; k <= 6; k++) o.push([BX(0.035, 1.0, 0.035, -W / 2 + k * W / 6, y + 0.5, D + 0.03), C]); // posts
    for (const s of [-1, 1]) o.push([beam(V3(s * (W / 2 - 0.3), y - 0.02, D), V3(s * (W / 2 - 0.3), y - 0.9, 0.04), 0.04, 0.04), C]); // knee braces
    if (i + 1 < lv.length) { const y1 = lv[i + 1]; const xa = (i % 2 ? -1 : 1) * 1.7, xb = -xa; // stair from this level to the next (alternating)
      for (const z of [0.25, 0.95]) o.push([beam(V3(xa, y, z), V3(xb, y1, z), 0.04, 0.16), C]);
      const n = Math.round((y1 - y) / 0.22); for (let k = 1; k < n; k++) { const t = k / n; o.push([BX(0.22, 0.03, 0.66, xa + (xb - xa) * t, y + (y1 - y) * t, 0.6), C]); }
      o.push([beam(V3(xa, y + 0.95, 1.02), V3(xb, y1 + 0.95, 1.02), 0.025, 0.025, 5), C]); }
  }
  if (!far) { const y = lv[0]; const x = -1.9; // counter-balanced drop ladder, stowed (bottom at y - 2.2 above the slab)
    for (const s of [-0.22, 0.22]) o.push([BX(0.04, 2.6, 0.04, x + s, y - 0.9, D + 0.12), C]); for (let k = 0; k < 9; k++) o.push([CY(0.012, 0.012, 0.44, 5, x, y - 2.1 + k * 0.3, D + 0.12, 0, 0, Math.PI / 2), C]); }
  return o;
}
// fence: one 3.0 m chain-link panel (local x along the run, y up), posts at the panel ends via the post kind
function fencePanel(screen, far) {
  const o = []; const G = [0.56, 0.58, 0.58], WIRE = [0.48, 0.5, 0.5]; const L = 3.0, H = 1.85;
  o.push([CY(0.021, 0.021, L, 6, 0, H, 0, 0, 0, Math.PI / 2), G], [CY(0.006, 0.006, L, 4, 0, 0.08, 0, 0, 0, Math.PI / 2), G]);
  if (screen) { o.push(...quad2(L - 0.04, H - 0.25, 0, (H - 0.25) / 2 + 0.12, 0.015).map((g) => [g, [0.12, 0.3, 0.18]])); }
  if (far) { if (!screen) o.push(...quad2(L, 0.03, 0, H * 0.5, 0).map((g) => [g, WIRE])); return o; }
  const s = 0.16; const ang = Math.atan2(H, H); // 45-degree diamonds
  for (let k = -Math.ceil(H / s); k * s < L; k++) { // each diagonal clipped to the panel rectangle
    for (const dir of [1, -1]) { const x0 = -L / 2 + k * s; let a = [x0, 0], b = [x0 + H, H]; if (dir < 0) { a = [x0, H]; b = [x0 + H, 0]; }
      const cl = (p, q) => { // clip segment p->q to x in [-L/2, L/2]
        let [px, py] = p, [qx, qy] = q; const lo = -L / 2, hi = L / 2; if (Math.max(px, qx) < lo || Math.min(px, qx) > hi) return null;
        const f = (x) => py + (qy - py) * (x - px) / (qx - px); if (px < lo) { py = f(lo); px = lo; } if (qx > hi) { qy = f(hi); qx = hi; } return [[px, py], [qx, qy]]; };
      const c = cl(a, b); if (!c) continue; const [[ax, ay], [bx, by]] = c; const len = Math.hypot(bx - ax, by - ay); if (len < 0.05) continue;
      o.push(...quad2(0.014, len, (ax + bx) / 2, (ay + by) / 2 + 0.06, 0, 0, 0, Math.atan2(-(bx - ax), by - ay)).map((g) => [g, WIRE])); } }
  void ang; return o;
}
function fencePost() { return [[CY(0.035, 0.035, 1.98, 5, 0, 0.99, 0), [0.56, 0.58, 0.58]], [CY(0.12, 0.12, 0.05, 5, 0, 0.025, 0), CONC]]; }
function wheelStop() { return [[BX(1.8, 0.12, 0.22, 0, 0.06, 0), [0.7, 0.68, 0.62]], [BX(0.5, 0.004, 0.226, -0.5, 0.121, 0), YEL], [BX(0.5, 0.004, 0.226, 0.5, 0.121, 0), YEL]]; }
function grate() { const o = [[BX(0.6, 0.008, 0.6, 0, 0.004, 0), [0.16, 0.15, 0.14]]]; for (let k = 0; k < 6; k++) o.push([BX(0.54, 0.01, 0.03, 0, 0.006, -0.25 + k * 0.1), [0.3, 0.27, 0.24]]); return o; }
// static delivery van: the traffic van body (carbody.js buildBody('van')) baked into one vertex-colour mesh; paint = tint
function vanParts(far) {
  if (far) { const B = [1, 1, 1], GL = [0.05, 0.06, 0.07]; const o = [[BX(1.98, 1.42, 4.1, 0, 1.12, -0.5), B], [BX(1.96, 0.62, 1.0, 0, 0.72, 2.05), B], [P(new THREE.BoxGeometry(1.9, 0.05, 1.12), MX(0, 1.42, 1.9, -0.6, 0, 0)), GL],
      [BX(2.0, 0.42, 0.7, 0, 1.48, 1.2), GL], [BX(2.02, 0.22, 5.12, 0, 0.42, 0), [0.07, 0.07, 0.075]], [BX(1.6, 0.12, 0.04, 0, 0.9, 2.56), [0.8, 0.8, 0.8]]];
    for (const w of [[0.82, 1.93], [-0.82, 1.93], [0.82, -1.12], [-0.82, -1.12]]) o.push([CY(0.35, 0.35, 0.24, 8, w[0], 0.35, w[1], 0, 0, Math.PI / 2), RUBBER]); return o; }
  const Bd = buildBody('van'); const o = []; const sub = (g, start, count) => { const ng = new THREE.BufferGeometry(); const idx = g.index.array; const p = g.attributes.position.array; const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { const v = idx[start + i]; pos[i * 3] = p[v * 3]; pos[i * 3 + 1] = p[v * 3 + 1]; pos[i * 3 + 2] = p[v * 3 + 2]; } ng.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (g.attributes.normal) { const n = g.attributes.normal.array; const nn = new Float32Array(count * 3); for (let i = 0; i < count; i++) { const v = idx[start + i]; nn[i * 3] = n[v * 3]; nn[i * 3 + 1] = n[v * 3 + 1]; nn[i * 3 + 2] = n[v * 3 + 2]; } ng.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); } return ng; };
  const SC = [[1, 1, 1], [0.05, 0.06, 0.07], [0.05, 0.05, 0.055]]; // paint (tint), glass, black
  for (const gr of Bd.shell.groups) o.push([Bd.shell.index ? sub(Bd.shell, gr.start, gr.count) : Bd.shell, SC[gr.materialIndex] || DARK]);
  const DC = { black: [0.05, 0.05, 0.055], head: [0.85, 0.86, 0.85], tail: [0.55, 0.05, 0.04], plate: [0.9, 0.9, 0.86], paint: [1, 1, 1], amber: [0.9, 0.5, 0.1] };
  for (const k in DC) if (Bd.det[k]) o.push([Bd.det[k], DC[k]]);
  for (const w of Bd.wheels) { o.push([CY(0.35, 0.35, 0.24, 12, w.x * 1.0, w.y, w.z, 0, 0, Math.PI / 2), RUBBER], [CY(0.22, 0.22, 0.245, 8, w.x, w.y, w.z, 0, 0, Math.PI / 2), [0.6, 0.6, 0.62]]); }
  o.push([BX(1.4, 0.03, 1.8, 0, 1.895, -0.6), [0.7, 0.7, 0.7]]); // roof rack slats hint (flat)
  return o;
}

// 3x5 stencil digits (dumpster numbers)
const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', '-': '000000111000000' };
function glyphRects(ch) { const s = DIG[ch]; const out = []; if (!s) return out; for (let y = 0; y < 5; y++) { let x = 0; while (x < 3) { if (s[y * 3 + x] !== '1') { x++; continue; } let x1 = x; while (x1 + 1 < 3 && s[y * 3 + x1 + 1] === '1') x1++; out.push([x, y, x1 - x + 1, 1]); x = x1 + 1; } } return out; }

// original spray-paint pieces: a few made-up letters, bubble-outlined, two-tone fill, white highlights, a few drips.
// Rasterised on a CPU canvas, palette-quantised and greedily merged into rectangles (each rectangle = one unit-quad instance).
let _cv = null, _cg = null;
function raster(W, H, pal, draw) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  if (!_cv) { _cv = document.createElement('canvas'); _cg = _cv.getContext('2d', { willReadFrequently: true }); }
  if (!_cg || !_cg.getImageData) return null;
  const c = _cv; c.width = W; c.height = H; const g = _cg; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); draw(g, W, H);
  const d = g.getImageData(0, 0, W, H).data; const PC = pal.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const idx = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { let best = 0, bd = 1e9; for (let k = 0; k < PC.length; k++) { const dr = d[i * 4] - PC[k][0], dg = d[i * 4 + 1] - PC[k][1], db = d[i * 4 + 2] - PC[k][2]; const dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } } idx[i] = best; }
  const rects = []; let open = new Map();
  for (let y = 0; y < H; y++) { const next = new Map();
    for (let x = 0; x < W;) { const ci = idx[y * W + x]; if (!ci) { x++; continue; } let x1 = x; while (x1 + 1 < W && idx[y * W + x1 + 1] === ci) x1++;
      const key = x + ',' + x1 + ',' + ci; const r = open.get(key); if (r) { r[3]++; next.set(key, r); open.delete(key); } else { const nr = [x, y, x1 - x + 1, 1, ci]; rects.push(nr); next.set(key, nr); } x = x1 + 1; }
    open = next; }
  return { W, H, rects, pal: pal.map((h) => { const cc = new THREE.Color().setStyle(h); return [cc.r, cc.g, cc.b]; }) };
}
const SPRAY = [['#e8452c', '#f6b51e'], ['#2a7de1', '#58d0f0'], ['#7a3bd1', '#e04fa0'], ['#1f9d55', '#c6e34a'], ['#f07c1c', '#ffe066'], ['#d8d8d8', '#8c8c8c'], ['#c0182e', '#f2f2f2']];
const LET = 'AEKRSTMOZQWXBNDV';
function graffitiPiece(r, big) {
  const W = big ? 56 : 32, H = big ? 20 : 12; const [c1, c2] = SPRAY[Math.floor(r() * SPRAY.length)];
  const n = big ? 3 + Math.floor(r() * 3) : 2 + Math.floor(r() * 3); let word = ''; for (let i = 0; i < n; i++) word += LET[Math.floor(r() * LET.length)];
  const pal = ['#000000', '#101010', c1, c2, '#f4f4f4'];
  const rot = (r() - 0.5) * 0.16, ital = big ? 0.25 : 0.4;
  return raster(W, H, pal, (g) => {
    g.fillStyle = '#000000'; g.fillRect(0, 0, W, H); // background index 0 is not emitted
    g.save(); g.translate(W / 2, H / 2 + 1); g.rotate(rot); g.transform(1, 0, -ital, 1, 0, 0);
    const fs = big ? H * 0.74 : H * 0.9; g.font = `900 ${fs}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    let w = g.measureText(word).width; const sx = Math.min(1, (W - 6) / w); g.scale(sx, 1);
    if (big) { g.lineJoin = 'round'; g.lineWidth = 3.4; g.strokeStyle = '#101010'; g.strokeText(word, 0, 0); }
    const gr = g.createLinearGradient(0, -fs / 2, 0, fs / 2); gr.addColorStop(0, c2); gr.addColorStop(0.55, c2); gr.addColorStop(0.56, c1); gr.addColorStop(1, c1);
    g.fillStyle = big ? gr : (r() < 0.5 ? '#101010' : c1); g.fillText(word, 0, 0);
    if (big) { g.fillStyle = '#f4f4f4'; for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + r() * w, -fs * 0.32 + r() * fs * 0.2, 1.3, 1.3); }
    g.restore();
    if (big) { g.fillStyle = c1; for (let k = 0; k < 4; k++) { const x = 8 + r() * (W - 16); g.fillRect(x, H * 0.72, 1, 3 + r() * (H * 0.28)); } }
  }, null);
}

// ------------------------------------------------------------------------------------------------------- build -----
// a_lane8fix: the service-lane centre lines, the same rule buildBacklot uses below (yard midline between the two rows' back walls,
// read from the 'bld' colliders, which exist once buildCity has run) so earlier layers (props.js bike racks) can keep the aprons clear.
export function serviceLanes(city) {
  if (city._svcLanes) return city._svcLanes; const out = [];
  for (const b of city.blocks.filter((q) => q.area === 'island' && q.x0 > 0 && q.lotMat !== 'grass' && q.inner)) {
    const [ix0, iz0, ix1, iz1] = b.inner; const cxm = (ix0 + ix1) / 2;
    const bl = city.col.query(cxm, (iz0 + iz1) / 2, Math.max(ix1 - ix0, iz1 - iz0) / 2 + 2, []).filter((c) => c.tag === 'bld' && c.minX >= ix0 - 0.5 && c.maxX <= ix1 + 0.5 && c.minZ >= iz0 - 0.5 && c.maxZ <= iz1 + 0.5);
    const Wr = bl.filter((c) => c.minX < cxm - 5), Er = bl.filter((c) => c.maxX > cxm + 5); if (Wr.length < 2 || Er.length < 2) continue;
    const wMax = Math.max(...Wr.map((c) => c.maxX)), eMin = Math.min(...Er.map((c) => c.minX)); if (eMin - wMax < 24) continue;
    out.push({ x: (wMax + eMin) / 2, hw: 3.0, z0: b.z0, z1: b.z1 });
  }
  return (city._svcLanes = out);
}

export function buildBacklot(scene, city) {
  const t0 = performance.now();
  const r = mulberry(7177); const col = city.col; const qb = [];
  const hit = (x0, z0, x1, z1, pad = 0) => col.query((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 1, qb).some((b) => b.maxX > x0 - pad && b.minX < x1 + pad && b.maxZ > z0 - pad && b.minZ < z1 + pad);
  const kinds = new Map();
  const K = (name, nearParts, farParts, rN, rF, opts = {}) => kinds.set(name, { name, near: merge(nearParts), far: farParts ? merge(farParts) : null, items: [], rN, rF: farParts ? rF : rN, cast: opts.cast !== false, mat: opts.mat || 'm' });
  K('dumpster', dumpster(false), dumpster(true), 26, 150);
  K('cart', cart(false), cart(true), 22, 100, { cast: false });
  K('cond', condenser(false), condenser(true), 20, 110, { cast: false });
  K('wallac', wallAC(false), wallAC(true), 18, 130, { cast: false });
  K('meter', meterBank(), null, 24, 0, { cast: false });
  K('gas', gasMeter(), null, 20, 0, { cast: false });
  K('door', backDoor(), null, 34, 0, { mat: 'door', cast: false });
  K('lampH', doorLampHousing(), null, 80, 0, { cast: false });
  K('lampL', doorLampLens(), null, 140, 0, { cast: false, mat: 'lit' });
  K('dock', dock(false), dock(true), 70, 160);
  K('pallet', pallet(), null, 45, 0, { mat: 'wood', cast: false });
  K('carton', cartonStack(), null, 35, 0, { mat: 'wood', cast: false });
  K('drum', drum(), null, 35, 0, { cast: false });
  K('fe3', fireEscape([4.4, 7.7], false), fireEscape([4.4, 7.7], true), 45, 180);
  K('fe4', fireEscape([4.4, 7.7, 11.0], false), fireEscape([4.4, 7.7, 11.0], true), 45, 180);
  K('fence', fencePanel(false, false), fencePanel(false, true), 22, 120, { cast: false });
  K('fenceS', fencePanel(true, false), fencePanel(true, true), 22, 140, { cast: false });
  K('fpost', fencePost(), null, 100, 0, { cast: false });
  K('wstop', wheelStop(), null, 40, 0, { cast: false });
  K('grate', grate(), null, 45, 0, { cast: false, mat: 'paint' });
  K('van', vanParts(false), vanParts(true), 11, 170, { cast: false });
  // flat paint / ground layers: a unit quad facing +z (walls) and one facing +y (ground)
  const qz = merge([[new THREE.PlaneGeometry(1, 1), [1, 1, 1]]]); const qy = merge([[new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [1, 1, 1]]]);
  kinds.set('wpaint', { name: 'wpaint', near: qz, far: null, items: [], rN: 70, rF: 70, cast: false, mat: 'paint' }); // graffiti / buff patches / stencils
  kinds.set('stencil', { name: 'stencil', near: qz, far: null, items: [], rN: 28, rF: 28, cast: false, mat: 'paint' }); // dumpster numbers
  kinds.set('gpaint', { name: 'gpaint', near: qy, far: null, items: [], rN: 220, rF: 220, cast: false, mat: 'paint' }); // lane surface, gutter, stall lines, stains
  const push = (kind, x, y, z, ry, c = [1, 1, 1], s = 1) => kinds.get(kind).items.push({ x, z, m: MX(x, y, z, 0, ry, 0, s, s, s), c });
  const pushM = (kind, x, z, m, c) => kinds.get(kind).items.push({ x, z, m, c });
  const vanAt = (x, y, z, yaw, c) => { push('van', x, y, z, yaw, c); pushM('gpaint', x, z, MX(x, 0.159, z, 0, yaw, 0, 2.2, 1, 5.2), [0.03, 0.03, 0.035]); }; // + contact shadow (vans cast no shadow-map shadow)
  const ground = (x, z, w, d, c, y = 0.152, ry = 0) => pushM('gpaint', x, z, MX(x, y, z, 0, ry, 0, w, 1, d), c);
  const stat = { yards: 0, lanes: [], faces: 0, doors: 0, dumpsters: 0, carts: 0, cond: 0, wallac: 0, meters: 0, gas: 0, docks: 0, fireEsc: 0, fences: 0, fencePanels: 0, vans: 0, stalls: 0, graffiti: 0, graffitiRects: 0, colliders: 0 };
  const addCol = (x0, z0, x1, z1, h) => { col.add(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), h, 'backlot'); stat.colliders++; };

  // the blocks: inner island blocks east of the bay towers (x0 > 0), paved (not the pocket parks), with building rows
  const blocks = city.blocks.filter((b) => b.area === 'island' && b.x0 > 0 && b.lotMat !== 'grass' && b.inner);
  const wallFrame = (f) => { const ry = f.s > 0 ? Math.PI / 2 : -Math.PI / 2; return { ry, at: (u, d) => [f.x + f.s * d, u] }; }; // local +z -> world +x*s, local x -> world -z*s
  const DUMP = [[0.12, 0.3, 0.2], [0.1, 0.22, 0.42], [0.22, 0.24, 0.26], [0.42, 0.3, 0.2], [0.55, 0.12, 0.1], [0.16, 0.36, 0.26]];
  const CARTC = [[0.1, 0.28, 0.62], [0.1, 0.28, 0.62], [0.14, 0.38, 0.2], [0.3, 0.31, 0.33], [0.07, 0.07, 0.08]];
  const DOORC = [[0.42, 0.44, 0.45], [0.55, 0.42, 0.32], [0.2, 0.36, 0.38], [0.45, 0.14, 0.12], [0.75, 0.72, 0.62], [0.26, 0.3, 0.42]];
  const VANC = [[0.93, 0.93, 0.92], [0.93, 0.93, 0.92], [0.9, 0.88, 0.8], [0.72, 0.76, 0.8], [0.9, 0.9, 0.9]];
  const DRUMC = [[0.1, 0.25, 0.6], [0.12, 0.38, 0.2], [0.62, 0.12, 0.1]];
  let dumpNo = 100 + Math.floor(r() * 50);

  const stencil = (f, u, y, d, txt, h = 0.16) => { // number on a face at along-wall u, height y, distance d (local +z)
    const px = h / 5; const wdt = txt.length * 4 * px - px; const fr = wallFrame(f);
    for (let i = 0; i < txt.length; i++) for (const [gx, gy, gw, gh] of glyphRects(txt[i])) {
      const lx = -wdt / 2 + i * 4 * px + (gx + gw / 2) * px, ly = y + h / 2 - (gy + gh / 2) * px; // local x along the wall
      const [wx, wz] = fr.at(u - lx * f.s, d); // local +x = world -z*s
      pushM('stencil', wx, wz, MX(wx, ly, wz, 0, fr.ry, 0, gw * px, gh * px, 1), [0.9, 0.9, 0.88]); }
  };
  const wallRects = (f, u, y0, d, R, sz) => { // rasterised piece -> wall rect instances, centred at along-wall u, bottom at y0
    if (!R) return 0; const fr = wallFrame(f); const Wm = R.W * sz, Hm = R.H * sz;
    for (const [x, y, w, h, ci] of R.rects) { const lx = -Wm / 2 + (x + w / 2) * sz, ly = 0.15 + y0 + Hm - (y + h / 2) * sz; const [wx, wz] = fr.at(u - lx * f.s, d);
      pushM('wpaint', wx, wz, MX(wx, ly, wz, 0, fr.ry, 0, w * sz, h * sz, 1), R.pal[ci]); }
    return R.rects.length;
  };

  for (const b of blocks) {
    const [ix0, iz0, ix1, iz1] = b.inner; const cxm = (ix0 + ix1) / 2;
    const bl = col.query(cxm, (iz0 + iz1) / 2, Math.max(ix1 - ix0, iz1 - iz0) / 2 + 2, []).filter((c) => c.tag === 'bld' && c.minX >= ix0 - 0.5 && c.maxX <= ix1 + 0.5 && c.minZ >= iz0 - 0.5 && c.maxZ <= iz1 + 0.5);
    const Wr = bl.filter((c) => c.minX < cxm - 5), Er = bl.filter((c) => c.maxX > cxm + 5);
    if (Wr.length < 2 || Er.length < 2) continue;
    const wMax = Math.max(...Wr.map((c) => c.maxX)), eMin = Math.min(...Er.map((c) => c.minX));
    if (eMin - wMax < 24) continue;
    const xc = (wMax + eMin) / 2; const LH = 3.0; // lane half width
    const alleys = city.alleys.filter((a) => Math.abs(a.x0 - ix0) < 1 && a.z > iz0 && a.z < iz1).map((a) => a.z);
    const inAlley = (z0, z1, pad = 0.6) => alleys.some((za) => z1 > za - 3 - pad && z0 < za + 3 + pad);
    stat.yards++; const laneInfo = { x: xc, z0: b.z0, z1: b.z1, alleys, block: [b.x0, b.z0, b.x1, b.z1] }; stat.lanes.push(laneInfo);
    // ---- service lane surface: patched asphalt slabs, concrete centre gutter with grates, oil stains, aprons over the sidewalk
    for (let z = iz0; z < iz1 - 0.5;) { const L = Math.min(iz1 - z, 5 + r() * 6); const t = 0.17 + r() * 0.06; ground(xc, z + L / 2, LH * 2, L - 0.03, [t, t * 0.99, t * 0.97]);
      if (r() < 0.35) { const pw = 1 + r() * 2, pl = 1 + r() * 2.5; const t2 = t * (r() < 0.5 ? 0.8 : 1.25); ground(xc + (r() - 0.5) * (LH * 2 - pw), z + L / 2 + (r() - 0.5) * (L - pl), pw, pl, [t2, t2, t2 * 0.97], 0.154); }
      z += L; }
    ground(xc, (iz0 + iz1) / 2, 0.55, iz1 - iz0, [0.42, 0.41, 0.38], 0.155);
    for (let z = iz0 + 9 + r() * 4; z < iz1 - 6; z += 16 + r() * 6) { if (inAlley(z - 0.4, z + 0.4, 0)) continue; push('grate', xc, 0.153, z, 0); }
    for (let k = 0; k < 10; k++) { const z = iz0 + 4 + r() * (iz1 - iz0 - 8); const s = 0.4 + r() * 1.0; ground(xc + (r() - 0.5) * 4.5, z, s, s * (0.6 + r() * 0.8), [0.07, 0.07, 0.075], 0.156, r() * 3); }
    for (const [za, zb] of [[b.z0 + 0.35, iz0], [iz1, b.z1 - 0.35]]) ground(xc, (za + zb) / 2, LH * 2 + 1.2, zb - za, [0.58, 0.57, 0.53], 0.153); // driveway aprons
    for (const zz of [iz0 + 1.2, iz1 - 1.2]) for (const sx of [-1, 1]) ground(xc + sx * (LH - 0.08), zz + (zz < 0 ? 0 : 0), 0.12, 1.5, [0.85, 0.7, 0.12], 0.157); // yellow mouth marks

    // ---- back-wall faces (exposed back of each row building)
    const faces = [];
    for (const c of Wr) faces.push({ x: c.maxX, s: 1, z0: c.minZ, z1: c.maxZ, h: c.h, side: 'W' });
    for (const c of Er) faces.push({ x: c.minX, s: -1, z0: c.minZ, z1: c.maxZ, h: c.h, side: 'E' });
    for (const f of faces) { const dfl = (f.h - 5.05) / 3.3 + 1; f.deco = Math.abs(dfl - Math.round(dfl)) < 0.04 ? Math.round(dfl) : 0; f.gap = f.s > 0 ? (xc - LH) - f.x : f.x - (xc + LH); }
    // pick the dock face (longest tall-enough face), the fire-escape faces (3-4 floor Deco hotels, at most one per row), the fenced yard face
    const usable = (f) => f.z1 - f.z0 > 9 && f.gap > 9;
    const dockF = faces.filter((f) => usable(f) && f.z1 - f.z0 >= 15 && f.h > 10).sort((a, b2) => (b2.z1 - b2.z0) - (a.z1 - a.z0))[0];
    const feF = []; for (const sd of ['W', 'E']) { const c = faces.filter((f) => f.side === sd && (f.deco === 3 || f.deco === 4) && f.z1 - f.z0 >= 10 && f !== dockF); if (c.length && r() < 0.8) feF.push(c[Math.floor(r() * c.length)]); }
    const yardF = (() => { const c = faces.filter((f) => usable(f) && f !== dockF && f.z1 - f.z0 >= 16 && f.gap > 11); return c.length ? c[Math.floor(r() * c.length)] : null; })();
    let vansHere = 0;
    let yard = null; if (yardF) { const f = yardF; const Lz = Math.min(26, f.z1 - f.z0 - 1); const D = Math.min(9.5, f.gap - 1.2); const u0 = f.z0 + (f.z1 - f.z0 - Lz) / 2, u1 = u0 + Lz;
      if (!inAlley(u0, u1, 1.0) && D > 7) yard = { f, Lz, D, u0, u1 }; }

    for (const f of faces) {
      stat.faces++; const fr = wallFrame(f); const occ = []; // occupied along-wall intervals [u0,u1]
      const zA = f.z0 + 1.3, zB = f.z1 - 1.3; if (zB - zA < 3) continue;
      if (yard && yard.f === f) occ.push([yard.u0 - 0.35, yard.u0 + 0.35], [yard.u1 - 0.35, yard.u1 + 0.35]);
      const free = (u0, u1) => u0 >= zA && u1 <= zB && !occ.some(([a, c]) => u1 > a && u0 < c) && !inAlley(u0, u1);
      const box2 = (u0, u1, d0, d1) => { const xa = f.x + f.s * d0, xb = f.x + f.s * d1; return [Math.min(xa, xb), u0, Math.max(xa, xb), u1]; };
      const clear = (u0, u1, d0, d1) => { if (d1 > f.gap - 0.6) return false; const [x0, z0, x1, z1] = box2(u0, u1, d0, d1); return !hit(Math.min(x0, x1) + (f.s > 0 ? 0.02 : 0), z0, Math.max(x0, x1) - (f.s < 0 ? 0.02 : 0), z1, 0.05); };
      const take = (u0, u1, d1, h, colOn = true) => { occ.push([u0, u1]); if (colOn) { const [x0, z0, x1, z1] = box2(u0, u1, 0.0, d1); addCol(x0, z0, x1, z1, h); } };
      const slot = (w, d, tries = 12) => { for (let t = 0; t < tries; t++) { const u0 = zA + r() * (zB - zA - w); if (u0 < zA) return null; if (free(u0 - 0.25, u0 + w + 0.25) && clear(u0, u0 + w, 0.05, d)) return u0; } return null; };
      // loading dock (+ ramp / steps): 9.4 m along the wall incl. ramp and steps, 2.5 m deep
      if (f === dockF) { const w = 9.4; const u0 = slot(w, 2.6, 20); if (u0 !== null) { const uc = f.s > 0 ? u0 + 3.5 : u0 + 5.75; // platform centre (ramp at local -x = world +z*s)
          const [x, z] = fr.at(uc, 0); push('dock', x, 0.15, z, fr.ry); take(u0, u0 + w, 2.55, 1.25); stat.docks++;
          // van backed up to the platform (rear toward the wall) or a yellow no-parking hatch in front of it
          if (f.gap > 9.5 && r() < 0.6) { const [vx, vz] = fr.at(uc, 2.55 + 0.15 + 2.55); vanAt(vx, 0.15, vz, fr.ry, VANC[Math.floor(r() * VANC.length)]); addCol(...(() => { const bb = box2(uc - 1.0, uc + 1.0, 2.6, 7.8); return bb; })(), 2.2); vansHere++; stat.vans++; }
          else for (let k = 0; k < 7; k++) { const [hx, hz] = fr.at(uc - 1.8 + k * 0.6, 4.0); pushM('gpaint', hx, hz, MX(hx, 0.157, hz, 0, fr.ry + 0.7, 0, 0.14, 1, 2.4), [0.85, 0.68, 0.1]); }
          // pallets + a carton stack beside the steps
          { const u = u0 + w + 0.9; if (free(u - 0.7, u + 0.7) && clear(u - 0.6, u + 0.6, 0.2, 1.4)) { const [px, pz] = fr.at(u, 0.8); const n = 1 + Math.floor(r() * 4); for (let k = 0; k < n; k++) push('pallet', px, 0.15 + k * 0.13, pz, fr.ry + (r() - 0.5) * 0.2); take(u - 0.7, u + 0.7, 1.4, 0.2 + n * 0.13); } } } }
      // fire escape (above head height: no collider, keeps ground slots free)
      let feU = null;
      if (feF.includes(f)) { const u = (f.z0 + f.z1) / 2 + (r() - 0.5) * Math.max(0, f.z1 - f.z0 - 8); const [x, z] = fr.at(u, 0); push(f.deco === 4 ? 'fe4' : 'fe3', x, 0.15, z, fr.ry); feU = u; stat.fireEsc++; }
      // staff door + lamp (one per face, two on long faces)
      const nDoor = f.z1 - f.z0 > 22 ? 2 : 1;
      for (let k = 0; k < nDoor; k++) { const u0 = slot(1.3, 1.1); if (u0 === null) continue; const u = u0 + 0.65; const [x, z] = fr.at(u, 0);
        push('door', x, 0.15, z, fr.ry, DOORC[Math.floor(r() * DOORC.length)]); push('lampH', x, 0.15, z, fr.ry); push('lampL', x, 0.15, z, fr.ry); occ.push([u0 - 0.5, u0 + 1.8]); stat.doors++; }
      // electric meter bank + gas meter (with bollards) on most faces
      if (r() < 0.75) { const u0 = slot(2.7, 1.1); if (u0 !== null) { const uc = u0 + 1.25; const [x, z] = fr.at(uc, 0); push('meter', x, 0.15, z, fr.ry); take(u0, u0 + 2.5, 1.05, 2.0); stat.meters++;
        } }
      if (r() < 0.6) { const u0 = slot(0.8, 0.5); if (u0 !== null) { const [x, z] = fr.at(u0 + 0.4, 0); push('gas', x, 0.15, z, fr.ry); take(u0, u0 + 0.8, 0.48, 1.3); stat.gas++; } }
      // dumpsters with stencilled numbers, a cart cluster beside each
      const nD = f.z1 - f.z0 > 20 ? 2 : (r() < 0.8 ? 1 : 0);
      for (let k = 0; k < nD; k++) { const u0 = slot(2.15, 1.35); if (u0 === null) continue; const uc = u0 + 1.075; const [x, z] = fr.at(uc, 0.08); const yaw = fr.ry;
        push('dumpster', x, 0.15, z, yaw, DUMP[Math.floor(r() * DUMP.length)]); take(u0, u0 + 2.15, 1.3, 1.3); stat.dumpsters++;
        stencil(f, uc, 0.73, 1.207, String(dumpNo++));
        if (r() < 0.8) { const n = 2 + Math.floor(r() * 3); const w = n * 0.7; const dir = r() < 0.5 ? -1 : 1; const ua = dir > 0 ? u0 + 2.15 + 0.3 : u0 - 0.3 - w;
          if (free(ua - 0.1, ua + w + 0.1) && clear(ua, ua + w, 0.05, 0.85)) { const cc = CARTC[Math.floor(r() * CARTC.length)]; for (let i = 0; i < n; i++) { const [cx, cz] = fr.at(ua + 0.35 + i * 0.7, 0.05); push('cart', cx, 0.15, cz, fr.ry + (r() - 0.5) * 0.3, r() < 0.75 ? cc : CARTC[Math.floor(r() * CARTC.length)]); stat.carts++; }
            take(ua, ua + w, 0.9, 1.1); } }
        if (r() < 0.45) { const u1 = slot(0.7, 0.7); if (u1 !== null) { const [dx, dz] = fr.at(u1 + 0.35, 0.4); push('drum', dx, 0.15, dz, r() * 6, DRUMC[Math.floor(r() * DRUMC.length)]); take(u1, u1 + 0.7, 0.72, 0.9); } }
        if (r() < 0.5) { const u1 = slot(1.0, 0.8); if (u1 !== null) { const [cx, cz] = fr.at(u1 + 0.45, 0.35); push('carton', cx, 0.15, cz, fr.ry + (r() - 0.5) * 0.5); take(u1, u1 + 1.0, 0.75, 0.9); } } }
      // condensers on pads (line set up the wall)
      const nC = Math.floor((f.z1 - f.z0) / 10 + r() * 1.5);
      for (let k = 0; k < nC; k++) { const u0 = slot(1.2, 1.35); if (u0 === null) continue; const [x, z] = fr.at(u0 + 0.6, 0); push('cond', x, 0.15, z, fr.ry); take(u0, u0 + 1.2, 1.32, 0.95); stat.cond++; }
      // wall-hung mini-splits on the upper floors of the Deco hotels (window rows), skipping the fire escape span
      if (f.deco >= 2) { const n = Math.floor(r() * 3 + (f.z1 - f.z0) / 14); for (let k = 0; k < n; k++) { const fl = 1 + Math.floor(r() * (f.deco - 1)); const u = f.z0 + 1.2 + r() * (f.z1 - f.z0 - 2.4);
          if (feU !== null && Math.abs(u - feU) < 3.2) continue; const y = 0.15 + 4.4 + (fl - 1) * 3.3 + 0.55; const [x, z] = fr.at(u, 0); push('wallac', x, y, z, fr.ry); stat.wallac++; } }
      // spray paint: one bigger piece or a couple of tags + a grey buff patch on some faces (low on the wall, clear of the door)
      { const L = zB - zA; if (L > 7 && r() < 0.55) { const R = graffitiPiece(r, L > 12 && r() < 0.7); if (R) { const sz = R.W > 50 ? 0.066 : 0.055; const wm = R.W * sz; const u = zA + wm / 2 + r() * Math.max(0, L - wm);
            stat.graffitiRects += wallRects(f, u, R.W > 50 ? 0.45 : 0.9 + r() * 0.5, 0.012, R, sz); stat.graffiti++; } }
        if (r() < 0.35) { const pw = 1.2 + r() * 2.2, ph = 0.8 + r() * 1.0; const u = zA + pw / 2 + r() * Math.max(0, zB - zA - pw); const [x, z] = fr.at(u, 0.008); const g = 0.55 + r() * 0.2;
          pushM('wpaint', x, z, MX(x, 0.45 + ph / 2 + r() * 0.8, z, 0, fr.ry, 0, pw, ph, 1), [g, g * 0.98, g * 0.94]); } }
    }

    // ---- chain-link fenced yard against one back wall (three sides, rolled-back gate in the lane-side run)
    if (yard) { const { f, Lz, D, u0, u1 } = yard; const fr = wallFrame(f); {
        const run = (ua, da, ub, db, gateLen) => { // fence run between local points (u,d), optional gate opening (centred) on the run
          const [xa, za] = fr.at(ua, da), [xb, zb] = fr.at(ub, db); const len = Math.hypot(xb - xa, zb - za); const n = Math.max(1, Math.round(len / 3.0)); const yaw = Math.atan2(-(zb - za), xb - xa);
          const gate0 = gateLen ? (len - gateLen) / 2 : 1e9, gate1 = gateLen ? (len + gateLen) / 2 : -1e9; const scr = r() < 0.5;
          for (let i = 0; i < n; i++) { const t0 = i * len / n, t1 = (i + 1) * len / n; if (t1 > gate0 + 0.01 && t0 < gate1 - 0.01) continue; const tm = (t0 + t1) / 2; const px = xa + (xb - xa) * tm / len, pz = za + (zb - za) * tm / len;
            pushM(scr && i % 3 !== 1 ? 'fenceS' : 'fence', px, pz, MX(px, 0.15, pz, 0, yaw, 0, (t1 - t0) / 3.0, 1, 1), [1, 1, 1]); stat.fencePanels++;
            const qx0 = xa + (xb - xa) * t0 / len, qz0 = za + (zb - za) * t0 / len, qx1 = xa + (xb - xa) * t1 / len, qz1 = za + (zb - za) * t1 / len; addCol(Math.min(qx0, qx1) - 0.05, Math.min(qz0, qz1) - 0.05, Math.max(qx0, qx1) + 0.05, Math.max(qz0, qz1) + 0.05, 2.0); }
          for (let i = 0; i <= n; i++) { const t = i * len / n; if (t > gate0 + 0.01 && t < gate1 - 0.01) continue; const px = xa + (xb - xa) * t / len, pz = za + (zb - za) * t / len; push('fpost', px, 0.15, pz, 0); }
          if (gateLen) { for (const t of [gate0, gate1]) { const px = xa + (xb - xa) * t / len, pz = za + (zb - za) * t / len; push('fpost', px, 0.15, pz, 0); } // gate leaf rolled back along the inside of the run
            const t = gate0 - gateLen * 0.5 - 0.3; const px = xa + (xb - xa) * t / len, pz = za + (zb - za) * t / len; const ix = px - f.s * 0.25; pushM('fence', ix, pz, MX(ix, 0.15, pz, 0, yaw, 0, gateLen / 3.0, 1, 1), [0.9, 0.9, 0.9]);
            const g2 = t - gateLen / 2; void g2; }
          return len; };
        // the wall-side items of this face stay inside; the fence keeps 0.4 m off the wall-band colliders
        run(u0, 0.05, u0, D, 0); run(u1, 0.05, u1, D, 0); run(u0, D, u1, D, 6.5); stat.fences++;
        if (vansHere < 2) { const uc = (u0 + u1) / 2 + (r() < 0.5 ? -1 : 1) * (Lz / 2 - 3.6); const dc = D - 1.4 - 0.2; // van parked inside, along the fence
          if (dc > 2.5) { const [vx, vz] = fr.at(uc, D - 1.35); const bb = box2Face(f, uc - 2.6, uc + 2.6, D - 2.4, D - 0.3); if (!hit(bb[0], bb[1], bb[2], bb[3])) { vanAt(vx, 0.15, vz, 0 + (f.s > 0 ? 0 : Math.PI), VANC[Math.floor(r() * VANC.length)]); addCol(...bb, 2.2); vansHere++; stat.vans++; } } } } }

    // ---- open parking stalls along the lane (perpendicular, 2.7 m wide, 5.4 m deep) on the side with more room, wheel stops, a van in some
    { const sideW = (xc - LH) - wMax, sideE = eMin - (xc + LH); const s = sideW > sideE ? -1 : 1; const room = Math.max(sideW, sideE);
      if (room > 8.2) { const x0 = s < 0 ? xc - LH : xc + LH; // lane edge; stalls extend away from the lane by 5.4
        const zs = iz0 + 10 + r() * 6, ze = iz1 - 10; let k = 0;
        for (let z = zs; z + 2.7 < ze; z += 2.7) { const zc = z + 1.35; if (inAlley(z - 0.3, z + 3.0, 0.8)) { k = 0; continue; }
          const sx0 = x0 + s * 0.3, sx1 = x0 + s * 5.7; if (hit(Math.min(sx0, sx1), z, Math.max(sx0, sx1), z + 2.7)) { k = 0; continue; }
          if (k === 0) ground((sx0 + sx1) / 2, z, 5.4, 0.1, [0.86, 0.86, 0.82], 0.158); ground((sx0 + sx1) / 2, z + 2.7, 5.4, 0.1, [0.86, 0.86, 0.82], 0.158); k++; stat.stalls++;
          const wx = x0 + s * 5.0; push('wstop', wx, 0.15, zc, Math.PI / 2);
          if (vansHere < 2 && stat.vans < 30 && r() < 0.16) { const vx = x0 + s * 2.95; vanAt(vx, 0.15, zc, s > 0 ? Math.PI / 2 : -Math.PI / 2, VANC[Math.floor(r() * VANC.length)]); addCol(Math.min(x0 + s * 0.4, x0 + s * 5.5), zc - 1.02, Math.max(x0 + s * 0.4, x0 + s * 5.5), zc + 1.02, 2.2); vansHere++; stat.vans++; }
          else addCol(Math.min(wx - 0.11, wx + 0.11), zc - 0.9, Math.max(wx - 0.11, wx + 0.11), zc + 0.9, 0.27); } // a_bridgewalk: top 0.27 = visible stop (0.15 + 0.12; was 0.12, under the 0.15 yard surface)
      } }
  }

  // ------------------------------------------------------------------------------------------------ meshes + streaming ----
  const mats = {
    m: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.3 }), 'fabCar'),
    door: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.45, metalness: 0.5 }), 'fabCar'),
    wood: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0.0 }), 'fabCar'),
    lit: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.0, emissive: 0xffe2b0, emissiveIntensity: 0.0 }), 'fabCar'),
    paint: prep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'fabCar'),
  };
  const CELL = 40; const out = { kinds: [], stat, last: new THREE.Vector3(1e9, 0, 1e9), meshes: [], enabled: true };
  for (const k of kinds.values()) {
    if (!k.items.length) continue;
    const grid = new Map(); for (const it of k.items) { const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(it); }
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, mats[k.mat], k.items.length); im.count = 0; im.visible = false; im.castShadow = k.cast; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.items.length * 3).fill(1), 3); im.frustumCulled = true; im.userData.backlot = k.name; im.name = 'backlot_' + k.name; scene.add(im); out.meshes.push(im); return im; };
    k.nearIM = mk(k.near); k.farIM = k.far ? mk(k.far) : null; if (k.farIM) k.farIM.castShadow = false; k.grid = grid;
    out.kinds.push(k);
  }
  const _c = new THREE.Color(); const _sph = new THREE.Sphere();
  out.update = (cam, night = 0, force = false) => {
    mats.lit.emissiveIntensity = 0.05 + night * 1.6;
    if (!out.enabled) { for (const im of out.meshes) im.visible = false; return; }
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
        _sph.center.set((mnx + mxx) / 2, 4, (mnz + mxz) / 2); _sph.radius = Math.hypot(mxx - mnx, mxz - mnz) / 2 + 14; im.boundingSphere = im.boundingSphere || new THREE.Sphere(); im.boundingSphere.copy(_sph); }
    }
  };
  out.setEnabled = (on) => { out.enabled = !!on; out.last.set(1e9, 0, 1e9); if (!on) for (const im of out.meshes) im.visible = false; };
  out.info = () => { let dc = 0, t = 0, inst = 0; const per = {}; for (const k of out.kinds) for (const im of [k.nearIM, k.farIM]) { if (!im || !im.count || !im.visible) continue; dc++; const tt = im.count * tris(im.geometry); t += tt; inst += im.count; per[k.name + (im === k.farIM ? '_far' : '')] = [im.count, Math.round(tt)]; } return { drawCalls: dc, tris: Math.round(t), instances: inst, per }; };
  out.totals = () => { const o = {}; for (const k of out.kinds) o[k.name] = [k.items.length, tris(k.near), k.far ? tris(k.far) : 0]; return o; };
  out.mats = mats;
  out.buildMs = Math.round(performance.now() - t0); city.backlot = out;
  return out;
}
function box2Face(f, u0, u1, d0, d1) { const xa = f.x + f.s * d0, xb = f.x + f.s * d1; return [Math.min(xa, xb), u0, Math.max(xa, xb), u1]; }
