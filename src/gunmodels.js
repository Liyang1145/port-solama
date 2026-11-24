// r6.4 weapon models held in the hand (original, procedural; no external assets). Barrel along +z, grip/hand point at the
// origin, up = +y. Each weapon is modelled part by part (slide / barrel / trigger guard / magazine / handguard / stock,
// sights and rails) from chamfered boxes, extruded side profiles (frames, guards with real openings, stocks, curved
// magazines) and lathes. Wear is baked into vertex colour: chamfer and bevel faces of metal parts read as bright
// rubbed edges, muzzle crowns are polished, painted / polymer parts scuff lighter at their edges, grips carry a raised
// stipple grid. Two LODs (full < 8 m from the camera, simplified beyond), one geometry per LOD with two groups:
// metal + non-metal. Both materials are plain MeshStandardMaterial with vertexColors, i.e. the same shader program as
// r5.0's single gun material (metalness / roughness are uniforms): no new shader programs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// palette (linear)
const PARK = [0.07, 0.074, 0.08], BLUED = [0.05, 0.055, 0.068], STEEL = [0.2, 0.205, 0.21], BLACK = [0.03, 0.03, 0.032];
const POLY = [0.085, 0.085, 0.08], POLYD = [0.05, 0.05, 0.048], WOOD = [0.24, 0.12, 0.05], WOODD = [0.12, 0.055, 0.022];
const TAN = [0.46, 0.38, 0.25], RUBBER = [0.028, 0.028, 0.028], WORN = [0.44, 0.45, 0.46], ALU = [0.42, 0.43, 0.44];
const WHITE = [0.85, 0.85, 0.78], GLASS = [0.04, 0.075, 0.09], RED = [0.9, 0.06, 0.03], BEAD = [0.75, 0.58, 0.28];
const ASH = [0.6, 0.43, 0.26], TAPE = [0.045, 0.045, 0.05];

const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Part collector for one LOD. o = { metal, wear (0..1), wc (wear colour), rim (cylinder caps worn), jit, ops: [['x'|'y'|'z', rad]...], at: [x,y,z], fn(tri) -> colour }
class Kit {
  constructor(hi) { this.hi = hi; this.m = []; this.n = []; }
  add(g, col, o = {}) {
    if (g.index) g = g.toNonIndexed();
    if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3; const c = new Float32Array(n * 3);
    const wear = o.wear ?? (o.metal ? 0.7 : 0.2), wc = o.wc || (o.metal ? WORN : lerp3(col, [0.32, 0.32, 0.31], 0.6)), jit = o.jit ?? (o.metal ? 0.07 : 0.1);
    for (let t = 0; t < n; t += 3) {
      const i = t * 3; const nx = (N[i] + N[i + 3] + N[i + 6]) / 3, ny = (N[i + 1] + N[i + 4] + N[i + 7]) / 3, nz = (N[i + 2] + N[i + 5] + N[i + 8]) / 3;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cy = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      let k = col;
      if (o.fn) k = o.fn(cx, cy, cz, nx, ny, nz) || col;
      // local space: extrusions run along z, so bevel faces have 0.2 < |nz| < 0.95 and chamfered long edges are diagonal in xy
      const edge = o.rim ? ay > 0.9 : ((az > 0.2 && az < 0.95) || (ax > 0.3 && ay > 0.3 && az < 0.2));
      if (edge && wear > 0) k = lerp3(k, wc, wear * (0.75 + 0.25 * hash(cx * 50, cy * 50, cz * 50)));
      const j = 1 + (hash(cx * 91 + (o.seed || 0), cy * 91, cz * 91) - 0.5) * 2 * jit;
      for (let v = 0; v < 3; v++) c.set([k[0] * j, k[1] * j, k[2] * j], (t + v) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    for (const [a, r] of o.ops || []) a === 'x' ? g.rotateX(r) : a === 'y' ? g.rotateY(r) : g.rotateZ(r);
    if (o.at) g.translate(o.at[0], o.at[1], o.at[2]);
    (o.metal ? this.m : this.n).push(g); return this;
  }
  geometry() {
    const one = (L) => L.length ? mergeGeometries(L) : null; const a = one(this.m), b = one(this.n);
    const g = mergeGeometries([a, b].filter(Boolean), true);
    if (!a) g.groups[0].materialIndex = 1; // groups: 0 = metal, 1 = non-metal
    else if (b) g.groups[1].materialIndex = 1;
    g.computeBoundingSphere(); return g;
  }
}
// plain box
const box = (w, h, l) => new THREE.BoxGeometry(w, h, l);
// box with its four long (z) edges chamfered by c and both ends bevelled by b — wear lands on those faces
function cbox(w, h, l, c = 0.003, b = 0.0012) {
  c = Math.min(c, w * 0.45, h * 0.45); const x = w / 2 - b, y = h / 2 - b, cc = Math.max(0, c - b);
  const s = new THREE.Shape(); s.moveTo(-x + cc, -y); s.lineTo(x - cc, -y); s.lineTo(x, -y + cc); s.lineTo(x, y - cc); s.lineTo(x - cc, y); s.lineTo(-x + cc, y); s.lineTo(-x, y - cc); s.lineTo(-x, -y + cc); s.closePath();
  const d = Math.max(0.0005, l - 2 * b); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -d / 2); return g;
}
// side profile in (z, y) extruded across x (width), optional holes, bevelled rim. Returned geometry is in extrusion space
// (x = gun z, y = up, z = across); use ops YZ to place it (see prof()).
function profG(pts, w, b = 0.0015, holes = [], seg = 2) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const d = Math.max(0.0005, w - 2 * b); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 1, curveSegments: seg });
  g.translate(0, 0, -d / 2); return g;
}
const PROF = [['y', -Math.PI / 2]]; // extrusion x -> gun z, extrusion z -> gun -x
// cylinder along z, r0 at the back, r1 at the front
const cyl = (r0, r1, l, seg) => new THREE.CylinderGeometry(r1, r0, l, seg, 1);
const CYL = [['x', Math.PI / 2]];
// stipple: plane w (along z) x h (along y) with a raised checker grid, facing +x (side=1) or -x (side=-1)
function stip(k, w, h, col, side, at, rake = 0, cell = 0.004) {
  const nx = Math.max(1, Math.round(w / cell)), ny = Math.max(1, Math.round(h / cell));
  const g = new THREE.PlaneGeometry(w, h, k.hi ? nx : 1, k.hi ? ny : 1);
  if (k.hi) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const ix = i % (nx + 1), iy = Math.floor(i / (nx + 1)); const edge = ix === 0 || iy === 0 || ix === nx || iy === ny; if (!edge && (ix + iy) % 2 === 0) p.setZ(i, 0.0011); } }
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  k.add(ng, col, { jit: 0.22, wear: 0, ops: [['y', side * Math.PI / 2], ['x', rake]], at, seed: side });
}
const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const BUILD = {
  pistol(k) {
    const h = k.hi, S = h ? 16 : 8;
    // slide (nitrided steel, rubbed edges), ejection port, barrel hood, serrations
    k.add(cbox(0.029, 0.033, 0.19, 0.0035, 0.0015), PARK, { metal: 1, wear: 0.6, at: [0, 0.068, 0.045] });
    k.add(box(0.0012, 0.012, 0.034), BLACK, { at: [0.0146, 0.0735, 0.066] });
    k.add(cbox(0.012, 0.004, 0.034, 0.0012, 0.0006), STEEL, { metal: 1, wear: 0.9, at: [0.0025, 0.0846, 0.066] });
    if (h) {
      for (let i = 0; i < 7; i++) k.add(box(0.0303, 0.021, 0.0016), BLACK, { at: [0, 0.066, -0.046 + i * 0.0045] });
      for (let i = 0; i < 4; i++) k.add(box(0.0303, 0.018, 0.0016), BLACK, { at: [0, 0.066, 0.106 + i * 0.0045] });
      k.add(box(0.0012, 0.003, 0.012), STEEL, { metal: 1, at: [0.015, 0.078, 0.042] }); // extractor
      k.add(box(0.0022, 0.004, 0.022), PARK, { metal: 1, at: [-0.0142, 0.053, 0.018] }); // slide stop
      k.add(box(0.0022, 0.004, 0.008), PARK, { metal: 1, at: [-0.0142, 0.046, 0.062] }); // takedown lever
    }
    // barrel crown + bore
    k.add(cyl(0.0074, 0.0074, 0.006, S), STEEL, { metal: 1, rim: 1, wear: 0.8, ops: CYL, at: [0, 0.068, 0.1405] });
    k.add(cyl(0.0044, 0.0044, 0.0064, S), BLACK, { ops: CYL, at: [0, 0.068, 0.1406] });
    // sights: front post + dot, rear notch + two dots
    k.add(cbox(0.0042, 0.0062, 0.008, 0.001, 0.0005), BLACK, { metal: 1, wear: 0.4, at: [0, 0.0875, 0.128] });
    k.add(box(0.0022, 0.0022, 0.0008), WHITE, { at: [0, 0.0888, 0.1237] });
    k.add(cbox(0.02, 0.005, 0.01, 0.0012, 0.0006), BLACK, { metal: 1, wear: 0.5, at: [0, 0.087, -0.038] });
    for (const s of [-1, 1]) { k.add(box(0.0066, 0.0045, 0.01), BLACK, { metal: 1, at: [s * 0.0068, 0.0915, -0.038] }); k.add(box(0.0022, 0.0022, 0.0008), WHITE, { at: [s * 0.0068, 0.0918, -0.0434] }); }
    // polymer frame: dust cover, trigger guard (real opening), raked grip with beavertail
    k.add(profG([[0.132, 0.051], [0.132, 0.031], [0.066, 0.029], [0.064, 0.012], [0.058, 0.0], [0.048, -0.005], [0.02, -0.005], [0.01, -0.002], [0.004, -0.03], [-0.004, -0.06], [-0.012, -0.088], [-0.014, -0.097], [-0.062, -0.086], [-0.058, -0.06], [-0.05, -0.02], [-0.046, 0.012], [-0.058, 0.028], [-0.074, 0.036], [-0.071, 0.045], [-0.058, 0.051]],
      0.026, 0.0016, [[[0.056, 0.024], [0.054, 0.008], [0.048, 0.002], [0.022, 0.002], [0.014, 0.008], [0.012, 0.024]]]), POLY, { wear: 0.3, ops: PROF });
    if (h) for (let i = 0; i < 3; i++) k.add(box(0.0262, 0.0016, 0.004), POLYD, { at: [0, 0.0303, 0.08 + i * 0.016] }); // rail slots
    for (const s of [-1, 1]) stip(k, 0.034, 0.07, POLYD, s, [s * 0.0131, -0.046, -0.03], 0.24);
    // trigger (curved blade), magazine base plate
    k.add(profG([[0.037, 0.024], [0.036, 0.013], [0.034, 0.005], [0.03, 0.004], [0.031, 0.012], [0.032, 0.024]], 0.006, 0.0006), BLACK, { ops: PROF });
    k.add(cbox(0.029, 0.009, 0.05, 0.003, 0.001), PARK, { metal: 1, wear: 0.8, ops: [['x', 0.24]], at: [0, -0.096, -0.038] });
  },
  smg(k) {
    const h = k.hi, S = h ? 18 : 10;
    k.add(cbox(0.046, 0.06, 0.28, 0.005, 0.002), PARK, { metal: 1, wear: 0.6, at: [0, 0.06, 0.08] }); // receiver
    k.add(box(0.0012, 0.018, 0.05), BLACK, { at: [0.0231, 0.068, 0.1] }); // ejection port
    k.add(cbox(0.012, 0.008, 0.016, 0.002, 0.0008), STEEL, { metal: 1, wear: 0.9, at: [-0.028, 0.072, 0.17] }); // charging handle
    if (h) for (const s of [-1, 1]) k.add(box(0.0012, 0.003, 0.2), BLACK, { at: [s * 0.0231, 0.046, 0.07] }); // side flute
    // top rail
    k.add(cbox(0.022, 0.008, 0.2, 0.002, 0.0008), BLACK, { metal: 1, wear: 0.6, at: [0, 0.094, 0.09] });
    if (h) for (let i = 0; i < 12; i++) k.add(cbox(0.026, 0.005, 0.007, 0.0012, 0.0005), BLACK, { metal: 1, wear: 0.7, at: [0, 0.1, 0.002 + i * 0.016] });
    else k.add(box(0.026, 0.005, 0.19), BLACK, { metal: 1, at: [0, 0.1, 0.09] });
    // barrel nut + integral suppressor with vent rings, polished crown
    k.add(cyl(0.013, 0.013, 0.012, S), PARK, { metal: 1, rim: 1, wear: 0.6, ops: CYL, at: [0, 0.06, 0.226] });
    k.add(cyl(0.018, 0.018, 0.17, S), BLUED, { metal: 1, rim: 1, wear: 0.55, ops: CYL, at: [0, 0.06, 0.315] });
    if (h) for (let i = 0; i < 4; i++) k.add(cyl(0.0186, 0.0186, 0.004, S), BLACK, { metal: 1, ops: CYL, at: [0, 0.06, 0.25 + i * 0.03] });
    k.add(cyl(0.006, 0.006, 0.0025, S), BLACK, { ops: CYL, at: [0, 0.06, 0.4] });
    // magwell + straight magazine with base plate
    k.add(cbox(0.034, 0.03, 0.05, 0.005, 0.0015), PARK, { metal: 1, wear: 0.75, at: [0, 0.02, 0.12] });
    k.add(cbox(0.026, 0.16, 0.04, 0.004, 0.0012), POLYD, { wear: 0.25, ops: [['x', 0.08]], at: [0, -0.045, 0.12] });
    if (h) for (let i = 0; i < 3; i++) k.add(box(0.0272, 0.003, 0.034), POLY, { ops: [['x', 0.08]], at: [0, -0.02 - i * 0.03, 0.118 - i * 0.0024] });
    k.add(cbox(0.03, 0.012, 0.046, 0.003, 0.001), BLACK, { metal: 1, wear: 0.7, ops: [['x', 0.08]], at: [0, -0.126, 0.113] });
    // pistol grip + stipple, trigger guard with opening, trigger
    k.add(profG([[0.012, 0.031], [0.012, 0.0], [0.003, -0.04], [-0.006, -0.075], [-0.042, -0.076], [-0.04, -0.05], [-0.03, 0.0], [-0.03, 0.031]], 0.03, 0.002), POLY, { wear: 0.3, ops: PROF });
    for (const s of [-1, 1]) stip(k, 0.03, 0.055, POLYD, s, [s * 0.0151, -0.035, -0.014], 0.2);
    k.add(profG([[0.075, 0.031], [0.075, 0.006], [0.065, -0.004], [0.012, -0.004], [0.012, 0.031]], 0.012, 0.0012, [[[0.067, 0.026], [0.067, 0.008], [0.061, 0.003], [0.017, 0.003], [0.017, 0.026]]]), POLY, { wear: 0.3, ops: PROF });
    k.add(profG([[0.047, 0.03], [0.046, 0.018], [0.043, 0.008], [0.039, 0.008], [0.041, 0.018], [0.042, 0.03]], 0.006, 0.0006), BLACK, { ops: PROF });
    // folding wire stock + hinge + butt pad
    k.add(cbox(0.04, 0.03, 0.022, 0.006, 0.0015), PARK, { metal: 1, wear: 0.8, at: [0, 0.062, -0.07] });
    for (const s of [-1, 1]) k.add(cyl(0.0042, 0.0042, 0.18, h ? 10 : 6), STEEL, { metal: 1, rim: 1, ops: CYL, at: [s * 0.019, 0.06, -0.165] });
    k.add(cbox(0.05, 0.062, 0.014, 0.01, 0.002), RUBBER, { wear: 0.15, at: [0, 0.055, -0.255] });
    // red-dot: mount, housing, lenses, dot
    k.add(cbox(0.024, 0.01, 0.04, 0.002, 0.0008), BLACK, { metal: 1, wear: 0.6, at: [0, 0.108, 0.05] });
    k.add(cbox(0.03, 0.03, 0.036, 0.008, 0.0015), BLACK, { metal: 1, wear: 0.75, at: [0, 0.128, 0.05] });
    k.add(box(0.022, 0.02, 0.0012), GLASS, { metal: 1, jit: 0, at: [0, 0.13, 0.0685] }); k.add(box(0.022, 0.02, 0.0012), GLASS, { metal: 1, jit: 0, at: [0, 0.13, 0.0315] });
    k.add(box(0.0018, 0.0018, 0.0005), RED, { jit: 0, at: [0, 0.131, 0.0307] });
  },
  shotgun(k) {
    const h = k.hi, S = h ? 16 : 8;
    // receiver (blued, rubbed edges), ports, safety
    k.add(profG([[0.12, 0.088], [0.12, 0.022], [-0.06, 0.022], [-0.072, 0.03], [-0.078, 0.07], [-0.07, 0.088]], 0.048, 0.003), BLUED, { metal: 1, wear: 0.8, ops: PROF });
    k.add(box(0.0012, 0.022, 0.06), BLACK, { at: [0.0241, 0.062, 0.04] });
    k.add(box(0.03, 0.0012, 0.07), BLACK, { at: [0, 0.0214, 0.04] });
    if (h) k.add(cyl(0.004, 0.004, 0.008, 8), STEEL, { metal: 1, rim: 1, ops: [['z', 0]], at: [0, 0.092, -0.06] }); // tang safety
    // trigger plate with guard opening + trigger
    k.add(profG([[0.03, 0.023], [0.03, 0.004], [0.02, -0.008], [-0.035, -0.008], [-0.045, 0.005], [-0.06, 0.023]], 0.02, 0.0015, [[[0.022, 0.019], [0.02, 0.004], [0.012, -0.002], [-0.03, -0.002], [-0.035, 0.008], [-0.035, 0.019]]]), BLACK, { metal: 1, wear: 0.65, ops: PROF });
    k.add(profG([[-0.004, 0.02], [-0.005, 0.01], [-0.008, 0.003], [-0.012, 0.003], [-0.01, 0.01], [-0.009, 0.02]], 0.006, 0.0006), STEEL, { metal: 1, ops: PROF });
    // barrel + vent rib + bead, crown, bore
    k.add(cyl(0.0115, 0.0115, 0.57, S), BLUED, { metal: 1, rim: 1, wear: 0.75, ops: CYL, at: [0, 0.07, 0.405] });
    k.add(cyl(0.0085, 0.0085, 0.0025, S), BLACK, { ops: CYL, at: [0, 0.07, 0.6905] });
    if (h) { k.add(box(0.007, 0.004, 0.55), BLUED, { metal: 1, at: [0, 0.0832, 0.4] }); for (let i = 0; i < 18; i++) k.add(box(0.0072, 0.0016, 0.004), BLACK, { at: [0, 0.0835, 0.14 + i * 0.03] }); }
    k.add(new THREE.SphereGeometry(0.0028, 8, 6), BEAD, { metal: 1, jit: 0, at: [0, 0.087, 0.682] });
    // magazine tube + end cap + barrel clamp
    k.add(cyl(0.0125, 0.0125, 0.5, S), BLUED, { metal: 1, ops: CYL, at: [0, 0.043, 0.37] });
    k.add(cyl(0.0135, 0.0135, 0.022, S), BLUED, { metal: 1, rim: 1, wear: 0.85, ops: CYL, at: [0, 0.043, 0.628] });
    k.add(cbox(0.02, 0.046, 0.016, 0.005, 0.0015), BLUED, { metal: 1, wear: 0.8, at: [0, 0.057, 0.598] });
    // ribbed wooden pump forend (lathe; groove faces darker)
    const fp = []; const R = 0.0235, r = 0.0212; fp.push([0.0135, -0.1], [0.021, -0.1], [R, -0.092]);
    if (h) { for (let i = 0; i < 7; i++) { const y = -0.072 + i * 0.024; fp.push([R, y - 0.006], [r, y - 0.004], [r, y + 0.004], [R, y + 0.006]); } } fp.push([R, 0.092], [0.021, 0.1], [0.0135, 0.1]);
    k.add(lathe(fp, S), WOOD, { wear: 0, jit: 0.12, ops: CYL, at: [0, 0.047, 0.3], fn: (x, y, z) => (Math.hypot(x, z) < 0.0222 ? WOODD : null) });
    // wooden stock with wrist checkering, rubber recoil pad
    k.add(profG([[-0.07, 0.088], [-0.085, 0.08], [-0.15, 0.066], [-0.41, 0.08], [-0.425, 0.075], [-0.432, -0.065], [-0.42, -0.072], [-0.25, -0.03], [-0.15, -0.012], [-0.1, -0.008], [-0.075, 0.01], [-0.066, 0.022]], 0.042, 0.004),
      WOOD, { wear: 0.35, wc: [0.36, 0.2, 0.1], jit: 0.14, ops: PROF, fn: (x, y) => (Math.sin(x * 260 + y * 40) > 0.6 ? lerp3(WOOD, WOODD, 0.35) : null) });
    for (const s of [-1, 1]) stip(k, 0.06, 0.03, WOODD, s, [s * 0.0211, 0.035, -0.12], -0.15, 0.005);
    k.add(profG([[-0.425, 0.079], [-0.447, 0.081], [-0.454, -0.068], [-0.432, -0.07]], 0.044, 0.002), RUBBER, { wear: 0.1, ops: PROF });
  },
  rifle(k) {
    const h = k.hi, S = h ? 16 : 8;
    const ALUW = { wear: 0.5, wc: ALU, jit: 0.08 }; // painted aluminium: edges wear through to bare metal
    // upper receiver, ejection port cover, forward assist, charging handle
    k.add(cbox(0.042, 0.046, 0.25, 0.008, 0.002), TAN, { ...ALUW, at: [0, 0.074, 0.035] });
    k.add(box(0.0012, 0.019, 0.05), POLYD, { at: [0.0213, 0.07, 0.02] });
    if (h) k.add(cbox(0.012, 0.014, 0.03, 0.004, 0.001), TAN, { ...ALUW, at: [0.024, 0.08, -0.045] });
    k.add(cbox(0.032, 0.01, 0.02, 0.002, 0.0008), BLACK, { metal: 1, wear: 0.8, at: [0, 0.09, -0.098] });
    // lower receiver with magwell, trigger guard (opening), trigger
    k.add(profG([[-0.09, 0.055], [0.155, 0.055], [0.158, 0.03], [0.152, -0.004], [0.08, -0.004], [0.075, 0.03], [-0.08, 0.03], [-0.092, 0.04]], 0.04, 0.0025), TAN, { ...ALUW, ops: PROF });
    k.add(profG([[0.075, 0.031], [0.074, 0.008], [0.065, -0.002], [0.0, -0.002], [-0.01, 0.031]], 0.012, 0.0012, [[[0.066, 0.027], [0.066, 0.009], [0.06, 0.004], [0.006, 0.004], [0.003, 0.027]]]), BLACK, { metal: 1, wear: 0.6, ops: PROF });
    k.add(profG([[0.046, 0.03], [0.045, 0.018], [0.042, 0.008], [0.038, 0.008], [0.04, 0.018], [0.041, 0.03]], 0.006, 0.0006), BLACK, { metal: 1, ops: PROF });
    if (h) k.add(cbox(0.003, 0.006, 0.012, 0.001, 0.0005), BLACK, { metal: 1, at: [-0.0215, 0.045, -0.01] }); // selector
    // pistol grip + stipple
    k.add(profG([[0.006, 0.032], [0.004, 0.0], [-0.01, -0.05], [-0.022, -0.088], [-0.058, -0.08], [-0.048, -0.04], [-0.036, 0.0], [-0.036, 0.032]], 0.03, 0.002), POLY, { wear: 0.3, ops: PROF });
    for (const s of [-1, 1]) stip(k, 0.03, 0.06, POLYD, s, [s * 0.0151, -0.04, -0.03], 0.3);
    // curved polymer magazine (forward curve), ribs, base plate
    const fr = [], bk = []; for (let i = 0; i <= (h ? 8 : 4); i++) { const t = i / (h ? 8 : 4); fr.push([0.15 + 0.07 * t * t, -0.19 * t]); bk.push([0.088 + 0.07 * t * t, -0.19 * t]); }
    k.add(profG([...fr, ...bk.reverse()], 0.026, 0.002), POLYD, { wear: 0.25, ops: PROF });
    if (h) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.12; k.add(box(0.0012, 0.005, 0.05), POLY, { ops: [['x', -Math.atan(0.74 * t)]], at: [s * 0.0131, -0.19 * t, 0.119 + 0.07 * t * t] }); }
    k.add(cbox(0.03, 0.012, 0.066, 0.003, 0.0012), POLY, { wear: 0.35, ops: [['x', -0.63]], at: [0, -0.193, 0.188] });
    // free-float handguard with M-LOK slots
    k.add(cbox(0.048, 0.05, 0.27, 0.014, 0.002), TAN, { ...ALUW, at: [0, 0.075, 0.295] });
    if (h) for (const s of [-1, 1]) for (let i = 0; i < 5; i++) k.add(box(0.0012, 0.007, 0.03), BLACK, { at: [s * 0.0242, 0.07, 0.2 + i * 0.05] });
    // full-length top rail
    k.add(cbox(0.016, 0.006, 0.52, 0.0015, 0.0008), BLACK, { metal: 1, wear: 0.6, at: [0, 0.1, 0.17] });
    if (h) for (let i = 0; i < 26; i++) k.add(cbox(0.021, 0.005, 0.0065, 0.0012, 0.0005), BLACK, { metal: 1, wear: 0.75, at: [0, 0.1045, -0.08 + i * 0.02] });
    else k.add(box(0.021, 0.005, 0.51), BLACK, { metal: 1, at: [0, 0.1045, 0.17] });
    // barrel, muzzle brake (ports), crown
    k.add(cyl(0.0095, 0.0095, 0.17, S), BLUED, { metal: 1, ops: CYL, at: [0, 0.07, 0.515] });
    k.add(cyl(0.013, 0.013, 0.055, S), BLACK, { metal: 1, rim: 1, wear: 0.75, ops: CYL, at: [0, 0.07, 0.6275] });
    k.add(cyl(0.005, 0.005, 0.0025, S), BLACK, { ops: CYL, at: [0, 0.07, 0.6553] });
    if (h) for (let i = 0; i < 3; i++) k.add(box(0.0264, 0.0045, 0.008), BLACK, { at: [0, 0.07, 0.61 + i * 0.014] });
    // folded front sight on the rail
    k.add(cbox(0.016, 0.01, 0.03, 0.003, 0.001), BLACK, { metal: 1, wear: 0.7, at: [0, 0.112, 0.41] });
    // buffer tube, castle nut, stock, butt pad
    k.add(cyl(0.015, 0.015, 0.2, S), BLACK, { metal: 1, ops: CYL, at: [0, 0.075, -0.19] });
    k.add(cyl(0.017, 0.017, 0.01, S), BLACK, { metal: 1, rim: 1, wear: 0.8, ops: CYL, at: [0, 0.075, -0.096] });
    k.add(profG([[-0.19, 0.098], [-0.385, 0.102], [-0.39, -0.005], [-0.37, -0.008], [-0.28, 0.035], [-0.21, 0.05], [-0.19, 0.058]], 0.044, 0.003), POLY, { wear: 0.3, ops: PROF });
    k.add(profG([[-0.388, 0.102], [-0.405, 0.102], [-0.405, -0.008], [-0.388, -0.008]], 0.046, 0.002), RUBBER, { wear: 0.1, ops: PROF });
    // variable-power optic: rings, tube, bells, turrets, lenses
    for (const z of [-0.005, 0.085]) { k.add(cbox(0.022, 0.012, 0.014, 0.003, 0.001), BLACK, { metal: 1, wear: 0.7, at: [0, 0.112, z] }); k.add(cyl(0.0168, 0.0168, 0.014, S), BLACK, { metal: 1, rim: 1, wear: 0.6, ops: CYL, at: [0, 0.135, z] }); }
    k.add(cyl(0.0135, 0.0135, 0.15, S), POLYD, { metal: 1, ops: CYL, at: [0, 0.135, 0.04] });
    k.add(cyl(0.0135, 0.0195, 0.03, S), POLYD, { metal: 1, ops: CYL, at: [0, 0.135, 0.13] }); k.add(cyl(0.0195, 0.0195, 0.025, S), POLYD, { metal: 1, rim: 1, wear: 0.6, ops: CYL, at: [0, 0.135, 0.157] });
    k.add(cyl(0.0185, 0.0135, 0.03, S), POLYD, { metal: 1, ops: CYL, at: [0, 0.135, -0.05] }); k.add(cyl(0.0185, 0.0185, 0.04, S), POLYD, { metal: 1, rim: 1, wear: 0.6, ops: CYL, at: [0, 0.135, -0.085] });
    k.add(cyl(0.017, 0.017, 0.0015, S), GLASS, { metal: 1, jit: 0, ops: CYL, at: [0, 0.135, 0.17] }); k.add(cyl(0.016, 0.016, 0.0015, S), GLASS, { metal: 1, jit: 0, ops: CYL, at: [0, 0.135, -0.105] });
    k.add(cyl(0.008, 0.008, 0.012, S), BLACK, { metal: 1, rim: 1, wear: 0.7, at: [0, 0.153, 0.045] }); // elevation turret
    k.add(cyl(0.008, 0.008, 0.012, S), BLACK, { metal: 1, rim: 1, wear: 0.7, ops: [['z', Math.PI / 2]], at: [0.018, 0.135, 0.045] }); // windage
  },
  bat(k) {
    const h = k.hi; const pts = [[0, -0.118], [0.02, -0.118], [0.025, -0.112], [0.024, -0.1], [0.016, -0.095]];
    for (let s = -0.08; s <= 0.1001; s += h ? 0.015 : 0.09) pts.push([0.0145, s]);
    pts.push([0.016, 0.2], [0.022, 0.32], [0.03, 0.45], [0.0335, 0.58], [0.0335, 0.68], [0.031, 0.72], [0.022, 0.735], [0, 0.738]);
    k.add(lathe(pts, h ? 18 : 9), ASH, { wear: 0, jit: 0.06, ops: CYL, fn: (x, y, z) => {
      if (y > -0.094 && y < 0.1) { const a = Math.atan2(z, x) / (Math.PI * 2); return Math.floor((y + a * 0.03) / 0.015) % 2 ? TAPE : lerp3(TAPE, [0.12, 0.12, 0.13], 0.5); } // spiral grip tape
      let c = Math.sin(y * 90 + Math.atan2(z, x) * 2) > 0.7 ? lerp3(ASH, WOODD, 0.25) : ASH; // grain
      if (y > 0.45 && hash(Math.round(x * 300), Math.round(y * 60), Math.round(z * 300)) > 0.86) c = lerp3(c, [0.78, 0.68, 0.55], 0.6); // scuffs
      if (y < -0.1 || y > 0.715) c = lerp3(c, [0.7, 0.55, 0.38], 0.4); return c; } });
  },
};

const CACHE = {}; let MATS = null; const _p = new THREE.Vector3();
const LOD_NEAR2 = 8 * 8;
function build(id, hi) { const k = new Kit(hi); BUILD[id](k); return k.geometry(); }
export function prebuildGuns() { let n = 0; for (const id in BUILD) if (!CACHE[id]) { CACHE[id] = [build(id, true), build(id, false)]; n++; } return n; } // fix_pt7 #1: behind the loading screen
export function gunMesh(id) {
  if (!BUILD[id]) return null;
  if (!CACHE[id]) CACHE[id] = [build(id, true), build(id, false)];
  // metal: nitride / blued steel, polished where rubbed; non-metal: polymer, paint, wood, rubber. Same program as r5.0.
  if (!MATS) MATS = [new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.34 }), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.0, roughness: 0.6 })];
  const G = CACHE[id]; const m = new THREE.Mesh(G[0], MATS);
  m.castShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false; m.userData.long = id === 'shotgun' || id === 'rifle' || id === 'smg'; m.userData.id = id;
  // LOD by camera distance (takes effect next frame; the swap only flips between two cached geometries)
  m.onBeforeRender = (r, s, cam) => { _p.setFromMatrixPosition(m.matrixWorld); const g = cam.position.distanceToSquared(_p) < LOD_NEAR2 ? G[0] : G[1]; if (m.geometry !== g) m.geometry = g; };
  return m;
}
// triangle counts per LOD (diagnostics)
export function gunStats() { const o = {}; for (const id in BUILD) { const [a, b] = CACHE[id] || [build(id, true), build(id, false)]; o[id] = [a.attributes.position.count / 3, b.attributes.position.count / 3]; } return o; }
