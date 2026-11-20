// r5.0 weapon models held in the hand (original, procedural; no external assets). Barrel along +z, grip/hand point at the
// origin, up = +y. One merged vertex-coloured geometry per weapon; parkerised steel, polymer, wood and rubber tones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const STEEL = [0.16, 0.17, 0.18], BLACK = [0.07, 0.07, 0.075], POLY = [0.11, 0.11, 0.1], WOOD = [0.42, 0.24, 0.12], TAN = [0.55, 0.47, 0.34], BRIGHT = [0.55, 0.56, 0.58];
function part(g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  g = g.toNonIndexed(); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
  const n = g.attributes.position.count; const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(col, i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
const B = (w, h, l, col, x, y, z, rx = 0, ry = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, l), col, x, y, z, rx, ry, rz);
const C = (r0, r1, l, col, x, y, z, seg = 12) => part(new THREE.CylinderGeometry(r1, r0, l, seg), col, x, y, z, Math.PI / 2);
const BUILD = {
  pistol() { const P = [];
    P.push(B(0.03, 0.034, 0.19, STEEL, 0, 0.068, 0.045)); // slide
    for (let k = 0; k < 7; k++) P.push(B(0.032, 0.026, 0.003, BLACK, 0, 0.068, -0.04 + k * 0.006)); // rear serrations
    P.push(B(0.006, 0.006, 0.01, BLACK, 0, 0.088, 0.13), B(0.018, 0.007, 0.01, BLACK, 0, 0.088, -0.04)); // sights
    P.push(C(0.007, 0.007, 0.012, BLACK, 0, 0.068, 0.142, 10)); // muzzle
    P.push(B(0.027, 0.024, 0.165, POLY, 0, 0.04, 0.035)); // frame + dust cover
    P.push(B(0.006, 0.006, 0.05, BLACK, 0, 0.026, 0.09)); // rail
    P.push(B(0.028, 0.115, 0.048, POLY, 0, -0.022, -0.028, -0.26)); // grip (raked)
    for (let k = 0; k < 4; k++) P.push(B(0.03, 0.006, 0.05, BLACK, 0, -0.06 + k * 0.022, -0.04, -0.26)); // grip texture bands
    P.push(part(new THREE.TorusGeometry(0.018, 0.0035, 6, 14, Math.PI), POLY, 0, 0.026, 0.03, 0, Math.PI / 2, Math.PI)); // trigger guard
    P.push(B(0.005, 0.016, 0.004, BLACK, 0, 0.017, 0.025)); // trigger
    P.push(B(0.026, 0.012, 0.05, BLACK, 0, -0.087, -0.046, -0.26)); // magazine base plate
    return P; },
  smg() { const P = [];
    P.push(B(0.048, 0.062, 0.28, STEEL, 0, 0.06, 0.08)); P.push(B(0.05, 0.012, 0.2, BLACK, 0, 0.097, 0.09)); // receiver + top rail
    for (let k = 0; k < 10; k++) P.push(B(0.052, 0.006, 0.008, BLACK, 0, 0.104, 0.0 + k * 0.02));
    P.push(C(0.017, 0.017, 0.16, BLACK, 0, 0.06, 0.29, 14)); // suppressor
    P.push(B(0.03, 0.17, 0.042, BLACK, 0, -0.04, 0.12, 0.08)); // magazine
    P.push(B(0.03, 0.1, 0.045, POLY, 0, -0.02, -0.02, -0.25)); // pistol grip
    P.push(part(new THREE.TorusGeometry(0.02, 0.004, 6, 14, Math.PI), POLY, 0, 0.03, 0.04, 0, Math.PI / 2, Math.PI));
    P.push(B(0.006, 0.012, 0.18, STEEL, 0.02, 0.06, -0.14), B(0.006, 0.012, 0.18, STEEL, -0.02, 0.06, -0.14), B(0.05, 0.05, 0.012, POLY, 0, 0.05, -0.23)); // folding wire stock + butt
    P.push(B(0.022, 0.03, 0.04, BLACK, 0, 0.12, 0.05)); // red-dot body
    return P; },
  shotgun() { const P = [];
    P.push(C(0.011, 0.011, 0.62, STEEL, 0, 0.07, 0.37, 12)); P.push(C(0.012, 0.012, 0.5, STEEL, 0, 0.045, 0.31, 12)); // barrel + tube mag
    P.push(B(0.05, 0.07, 0.2, STEEL, 0, 0.055, 0.02)); // receiver
    P.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 14), WOOD, 0, 0.045, 0.24, Math.PI / 2)); // pump forend
    for (let k = 0; k < 6; k++) P.push(C(0.0235, 0.0235, 0.008, BLACK, 0, 0.045, 0.16 + k * 0.03, 14));
    P.push(B(0.04, 0.09, 0.05, WOOD, 0, -0.01, -0.09, -0.3)); // wrist
    P.push(part(new THREE.BoxGeometry(0.042, 0.11, 0.3), WOOD, 0, 0.01, -0.25, 0.12)); P.push(B(0.044, 0.12, 0.015, BLACK, 0, -0.005, -0.4, 0.12)); // stock + recoil pad
    P.push(part(new THREE.TorusGeometry(0.02, 0.004, 6, 14, Math.PI), STEEL, 0, 0.02, -0.03, 0, Math.PI / 2, Math.PI));
    P.push(B(0.005, 0.006, 0.006, BRIGHT, 0, 0.083, 0.67)); // bead sight
    return P; },
  rifle() { const P = [];
    P.push(B(0.045, 0.06, 0.24, TAN, 0, 0.06, 0.03)); // receiver
    P.push(B(0.05, 0.055, 0.26, TAN, 0, 0.06, 0.27)); // handguard
    for (let k = 0; k < 9; k++) for (const s of [-1, 1]) P.push(B(0.006, 0.02, 0.012, BLACK, s * 0.027, 0.06, 0.16 + k * 0.026)); // M-LOK slots
    P.push(B(0.016, 0.012, 0.5, BLACK, 0, 0.094, 0.15)); for (let k = 0; k < 22; k++) P.push(B(0.022, 0.006, 0.008, BLACK, 0, 0.1, -0.08 + k * 0.022)); // picatinny rail
    P.push(C(0.009, 0.009, 0.22, STEEL, 0, 0.06, 0.5, 10), C(0.014, 0.014, 0.06, BLACK, 0, 0.06, 0.62, 10)); // barrel + flash hider
    P.push(part(new THREE.BoxGeometry(0.028, 0.2, 0.06), BLACK, 0, -0.06, 0.1, 0.32)); // curved mag (tilted)
    P.push(B(0.03, 0.1, 0.045, POLY, 0, -0.02, -0.04, -0.3)); // grip
    P.push(C(0.016, 0.016, 0.18, BLACK, 0, 0.06, -0.17, 10)); P.push(B(0.045, 0.08, 0.17, TAN, 0, 0.045, -0.3)); P.push(B(0.046, 0.09, 0.015, BLACK, 0, 0.04, -0.39)); // buffer tube + stock + pad
    P.push(C(0.018, 0.02, 0.1, BLACK, 0, 0.135, 0.07, 14), B(0.02, 0.03, 0.03, BLACK, 0, 0.11, 0.07)); // optic + mount
    P.push(part(new THREE.TorusGeometry(0.02, 0.004, 6, 14, Math.PI), POLY, 0, 0.03, 0.0, 0, Math.PI / 2, Math.PI));
    return P; },
  bat() { const P = [];
    P.push(part(new THREE.CylinderGeometry(0.033, 0.014, 0.66, 14), [0.62, 0.45, 0.28], 0, 0, 0.4, Math.PI / 2)); // barrel tapering into the handle
    P.push(C(0.016, 0.016, 0.2, [0.15, 0.15, 0.16], 0, 0, 0.0, 10)); // grip tape
    P.push(C(0.024, 0.024, 0.02, [0.55, 0.4, 0.25], 0, 0, -0.105, 12)); // knob
    return P; },
};
const CACHE = {}; let MAT = null;
export function gunMesh(id) {
  if (!BUILD[id]) return null;
  if (!CACHE[id]) { const g = mergeGeometries(BUILD[id]()); g.computeVertexNormals(); CACHE[id] = g; }
  if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42 });
  const m = new THREE.Mesh(CACHE[id], MAT); m.castShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false; m.userData.long = id === 'shotgun' || id === 'rifle' || id === 'smg'; m.userData.id = id;
  return m;
}
