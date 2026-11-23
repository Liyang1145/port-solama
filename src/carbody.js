// v3.5 procedural car bodies (original designs): a lofted body shell built from smooth side / plan profiles and
// superellipse cross-sections, with wheel arches cut into the sill line, a separate greenhouse (tinted glass, pillars, roof),
// panel-gap lines, lens-shaped head/tail lights, grille, mirrors, handles, plates and a dark cabin interior.
// Replaces the cartoon-proportioned ara3d bodies for sedan / taxi / police / suv / van / pickup traffic.
import * as THREE from 'three';

// monotone cubic interpolation through [u, y] keys (no overshoot, smooth)
function mono(keys) {
  const n = keys.length; const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i]; const s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// body specs (metres). u = 0 rear bumper -> 1 front bumper. zones: rear window / roof / windshield (u ranges)
export const BODY_SPECS = {
  sedan: { L: 4.78, W: 1.84, wr: 0.33, wb: 2.80, fo: 0.5, clear: 0.2, nUp: 3.0, nLo: 5.5, tumble: 0.2,
    top: [[0, 0.6], [0.025, 0.86], [0.09, 0.97], [0.2, 1.0], [0.36, 1.41], [0.42, 1.44], [0.56, 1.43], [0.715, 1.02], [0.88, 0.93], [0.965, 0.84], [1, 0.58]],
    belt: [[0, 0.82], [0.1, 0.98], [0.5, 0.96], [0.72, 0.94], [0.9, 0.86], [1, 0.62]],
    width: [[0, 0.74], [0.02, 0.84], [0.06, 0.9], [0.12, 0.918], [0.5, 0.92], [0.88, 0.912], [0.95, 0.875], [0.985, 0.80], [1, 0.66]],
    rw: [0.2, 0.36], roof: [0.36, 0.585], ws: [0.585, 0.715], pillars: [0.475], doors: [0.31, 0.475, 0.655], hood: 0.735, trunk: 0.19 },
  suv: { L: 4.85, W: 1.94, wr: 0.37, wb: 2.86, fo: 0.48, clear: 0.28, nUp: 4.2, nLo: 6, tumble: 0.14,
    top: [[0, 0.82], [0.02, 1.08], [0.045, 1.72], [0.08, 1.78], [0.5, 1.8], [0.62, 1.76], [0.75, 1.24], [0.9, 1.16], [0.97, 1.08], [1, 0.8]],
    belt: [[0, 1.0], [0.08, 1.17], [0.6, 1.15], [0.76, 1.12], [0.92, 1.06], [1, 0.82]],
    width: [[0, 0.86], [0.03, 0.95], [0.5, 0.97], [0.93, 0.96], [0.975, 0.92], [1, 0.82]],
    rw: [0.04, 0.09], roof: [0.09, 0.63], ws: [0.63, 0.755], pillars: [0.2, 0.42], doors: [0.09, 0.22, 0.42, 0.62], hood: 0.77, trunk: 0.03 },
  van: { L: 5.1, W: 1.98, wr: 0.35, wb: 3.05, fo: 0.62, clear: 0.24, nUp: 4.5, nLo: 6, tumble: 0.1,
    top: [[0, 0.82], [0.02, 1.1], [0.04, 1.8], [0.08, 1.86], [0.6, 1.88], [0.7, 1.8], [0.84, 1.18], [0.95, 1.08], [1, 0.8]],
    belt: [[0, 1.0], [0.07, 1.1], [0.7, 1.08], [0.85, 1.03], [1, 0.8]],
    width: [[0, 0.86], [0.03, 0.97], [0.5, 0.99], [0.94, 0.97], [1, 0.82]],
    rw: [0.03, 0.08], roof: [0.08, 0.7], ws: [0.7, 0.845], pillars: [0.27, 0.5], doors: [0.08, 0.27, 0.5, 0.69], hood: 0.86, trunk: 0.025 },
  pickup: { L: 5.45, W: 2.0, wr: 0.39, wb: 3.4, fo: 0.48, clear: 0.32, nUp: 4.5, nLo: 7, tumble: 0.1, bed: [0.02, 0.37],
    top: [[0, 1.2], [0.37, 1.22], [0.385, 1.86], [0.4, 1.9], [0.58, 1.9], [0.66, 1.84], [0.74, 1.34], [0.92, 1.28], [0.975, 1.18], [1, 0.9]],
    belt: [[0, 1.2], [0.37, 1.22], [0.4, 1.24], [0.74, 1.22], [0.92, 1.16], [1, 0.9]],
    width: [[0, 0.95], [0.02, 0.98], [0.5, 1.0], [0.94, 0.98], [1, 0.86]],
    rw: [0.37, 0.4], roof: [0.4, 0.655], ws: [0.655, 0.74], pillars: [0.52], doors: [0.4, 0.52, 0.655], hood: 0.76, trunk: 0.0 },
  // r6.4 vehicles3: original Florida-flavoured bodies (variants of sedan / pickup traffic)
  muscle: { L: 4.92, W: 1.95, wr: 0.35, wb: 2.86, fo: 0.78, clear: 0.15, nUp: 3.2, nLo: 6.5, tumble: 0.24, hl: 'round', twoDoor: true, scoop: true, duck: true,
    top: [[0, 0.74], [0.03, 0.93], [0.1, 1.0], [0.2, 1.03], [0.3, 1.22], [0.4, 1.31], [0.52, 1.32], [0.6, 1.27], [0.665, 1.0], [0.85, 0.94], [0.965, 0.87], [1, 0.62]],
    belt: [[0, 0.86], [0.1, 0.99], [0.5, 0.975], [0.665, 0.965], [0.9, 0.89], [1, 0.65]],
    width: [[0, 0.8], [0.02, 0.88], [0.08, 0.955], [0.2, 0.975], [0.5, 0.94], [0.8, 0.95], [0.94, 0.915], [0.985, 0.84], [1, 0.72]],
    rw: [0.22, 0.38], roof: [0.38, 0.57], ws: [0.57, 0.665], pillars: [], doors: [0.37, 0.64], hood: 0.69, trunk: 0.16 },
  conv: { L: 4.7, W: 1.88, wr: 0.34, wb: 2.74, fo: 0.86, clear: 0.16, nUp: 3.0, nLo: 5.5, tumble: 0.2, hl: 'slim', twoDoor: true, tub: [0.215, 0.592], open: true,
    top: [[0, 0.66], [0.03, 0.88], [0.1, 0.97], [0.3, 0.995], [0.5, 1.0], [0.585, 1.0], [0.6, 1.25], [0.625, 1.28], [0.715, 0.99], [0.88, 0.92], [0.965, 0.84], [1, 0.6]],
    belt: [[0, 0.82], [0.1, 0.96], [0.5, 0.955], [0.715, 0.94], [0.9, 0.86], [1, 0.62]],
    width: [[0, 0.76], [0.02, 0.85], [0.07, 0.915], [0.15, 0.935], [0.5, 0.93], [0.88, 0.92], [0.95, 0.88], [0.985, 0.8], [1, 0.66]],
    rw: [0.6, 0.6], roof: [0.6, 0.6], ws: [0.605, 0.715], pillars: [], doors: [0.36, 0.62], hood: 0.735, trunk: 0.17 },
};
// lifted pickup: the pickup body raised on off-road tyres
BODY_SPECS.lifted = { ...BODY_SPECS.pickup, W: 2.08, wr: 0.46, clear: 0.55, lift: 0.24, mud: true,
  top: BODY_SPECS.pickup.top.map(([u, y]) => [u, y + 0.24]), belt: BODY_SPECS.pickup.belt.map(([u, y]) => [u, y + 0.24]) };

const NI = 64; // stations along the length
export function buildBody(kind) {
  const S = BODY_SPECS[kind]; const L = S.L, HW = S.W / 2;
  const top = mono(S.top), belt0 = mono(S.belt), wid = mono(S.width);
  const axF = 1 - S.fo / L, axR = axF - S.wb / L; // axle stations
  const ra = S.wr * 1.13; const cy = S.wr;
  const bottom = (u) => { let y = S.clear; for (const ax of [axF, axR]) { const dz = (u - ax) * L; if (Math.abs(dz) < ra) y = Math.max(y, cy + Math.sqrt(ra * ra - dz * dz) * 0.98); } const e = Math.min(u, 1 - u) * L; return y + Math.max(0, 0.18 - e) * 0.9; };
  const TU = [0, 0.2, 0.38, 0.5, 0.6, 0.7, 0.8, 0.9, 0.975, 1]; const NU = TU.length, NL = 7; // points on the upper / lower quarter
  // section at u: half ring from top centre (j=0) to bottom centre; returns [{x,y,t,part}]
  const section = (u) => {
    const yT = top(u), yB = bottom(u); const yBe = Math.min(belt0(u), yT - 0.05);
    const A = HW * wid(u); const Bh = yT - yBe; const g = Math.min(1, Math.max(0, (Bh - 0.12) / 0.3));
    const pts = [];
    for (let k = 0; k < NU; k++) { // upper: superellipse from top centre to belt corner
      const t = TU[k] * Math.PI / 2; const n = S.nUp * (1 - g) + S.nUp * g; const sx = Math.pow(Math.sin(t), 2 / n), sy = Math.pow(Math.cos(t), 2 / n);
      const yy = yBe + Bh * sy; const tumble = 1 - S.tumble * g * Math.pow((yy - yBe) / Math.max(Bh, 1e-3), 1.2);
      pts.push({ x: A * sx * tumble * (g > 0.2 ? 1 : 0.995), y: yy, t: TU[k], yf: sy, up: true });
    }
    for (let k = 1; k < NL; k++) { // lower: belt corner down the side to the sill / bottom centre
      const t = k / (NL - 1) * Math.PI / 2; const sx = Math.pow(Math.cos(t), 2 / S.nLo), sy = Math.pow(Math.sin(t), 2 / S.nLo);
      const shoulder = k === 1 ? 1.042 : k === 2 ? 1.03 : 1 + 0.012 * Math.sin(Math.min(1, k / 3) * Math.PI); // v4.1 crisp shoulder character line just under the belt
      pts.push({ x: A * sx * shoulder * (k === NL - 1 ? 0 : 1), y: yBe - (yBe - yB) * sy, t: k / (NL - 1), up: false });
    }
    return { pts, yT, yB, yBe, A, g };
  };
  const inZ = (u, r) => u >= r[0] && u <= r[1];
  // classify quad between ring points k,k+1 at station u -> 0 paint, 1 glass, 2 black trim
  const cls = (u, k, sec) => {
    const greenhouse = sec.g > 0.35; const a = sec.pts[k], b = sec.pts[k + 1];
    if (S.bed && inZ(u, S.bed) && a.up) return (a.yf + b.yf) / 2 > 0.25 ? -1 : 0; // open bed: only the rail cap remains
    if (S.tub && inZ(u, S.tub) && a.up) return (a.yf + b.yf) / 2 > 0.3 ? -1 : 0; // r6.4 open cockpit (convertible, top down)
    if (!a.up || !b.up) { if (!a.up && b.t > 0.83) return 2; return 0; } // sill / underside black
    if (!greenhouse) return 0;
    const ym = (a.yf + b.yf) / 2;
    const side = ym < 0.66, corner = ym >= 0.66 && ym < 0.86;
    const sideGlassLow = ym < 0.07; // last strip above the belt = window seal (black)
    if (side) {
      if (sideGlassLow) return 2;
      for (const p of S.pillars) if (Math.abs(u - p) < 0.012) return 2; // B / C pillar (black)
      if (inZ(u, S.rw) && kind === 'sedan' && u < S.rw[0] + 0.06) return 0; // sedan C pillar
      if (inZ(u, S.roof) || inZ(u, S.ws) || inZ(u, S.rw)) return 1;
      return 0;
    }
    if (corner) return 0; // roof rail / A pillar
    if (inZ(u, S.ws) || inZ(u, S.rw)) { if (u > S.ws[1] - 0.008 || u < S.rw[0] + 0.006) return 2; return 1; }
    return 0;
  };
  // build mirrored shell
  const pos = [], idxG = [[], [], []];
  const ring = []; const R = NU + NL - 1;
  for (let i = 0; i <= NI; i++) {
    const u = i / NI; const sec = section(u); const z = (u - 0.5) * L; ring.push(sec);
    for (let s of [1, -1]) for (const p of sec.pts) pos.push(p.x * s, p.y, z);
  }
  const vid = (i, s, k) => i * 2 * R + (s > 0 ? 0 : R) + k;
  for (let i = 0; i < NI; i++) {
    const u = (i + 0.5) / NI; const sec = section(u);
    for (let k = 0; k < R - 1; k++) {
      const c = cls(u, k, sec); if (c < 0) continue;
      const a = vid(i, 1, k), b = vid(i + 1, 1, k), cc = vid(i + 1, 1, k + 1), d = vid(i, 1, k + 1);
      idxG[c].push(a, b, d, b, cc, d);
      const a2 = vid(i, -1, k), b2 = vid(i + 1, -1, k), c2 = vid(i + 1, -1, k + 1), d2 = vid(i, -1, k + 1);
      idxG[c].push(a2, d2, b2, b2, d2, c2);
    }
  }
  // end caps (fan from the centre of the end ring)
  for (const [i, dir] of [[0, -1], [NI, 1]]) {
    const sec = ring[i]; const z = (i / NI - 0.5) * L; const cIdx = pos.length / 3; pos.push(0, (sec.yT + sec.yB) / 2, z + dir * 0.02);
    for (const s of [1, -1]) for (let k = 0; k < R - 1; k++) { const a = vid(i, s, k), b = vid(i, s, k + 1); const flip = (dir > 0) === (s > 0); idxG[2 === 0 ? 0 : 0].push(...(flip ? [cIdx, b, a] : [cIdx, a, b])); }
  }
  const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all = [...idxG[0], ...idxG[1], ...idxG[2]]; shell.setIndex(all);
  shell.addGroup(0, idxG[0].length, 0); shell.addGroup(idxG[0].length, idxG[1].length, 1); shell.addGroup(idxG[0].length + idxG[1].length, idxG[2].length, 2);
  shell.computeVertexNormals();
  // ----- details
  const parts = { black: [], chrome: [], head: [], tail: [], plate: [], interior: [], paint: [], amber: [], lens: [], tlens: [], lampIn: [], drl: [], rev: [], hglow: [], tglow: [] };
  const put = (list, g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); list.push(g); };
  const surfX = (u, y) => { // outer half-width of the shell at station u and height y
    const sec = section(u); const p = sec.pts; for (let k = 0; k < p.length - 1; k++) { const a = p[k], b = p[k + 1]; if ((a.y - y) * (b.y - y) <= 0) { const t = (y - a.y) / ((b.y - a.y) || 1); return a.x + (b.x - a.x) * t; } } return sec.A;
  };
  // panel gaps: thin dark strips following the side section at door lines, plus hood / trunk shut lines across the top
  const gap = (u, w = 0.006) => {
    const sec = section(u); const z = (u - 0.5) * L; const p = sec.pts.filter((q) => !q.up || q.t > 0.97); // belt down to sill
    for (const s of [1, -1]) { const g = []; for (let k = 0; k < p.length - 2; k++) { const a = p[k], b = p[k + 1]; const len = Math.hypot(a.x - b.x, a.y - b.y); const box = new THREE.BoxGeometry(0.012, len, w * 2); const ang = Math.atan2(b.x - a.x, a.y - b.y);
      put(g, box, s * ((a.x + b.x) / 2 + 0.002), (a.y + b.y) / 2, z, 0, 0, s * ang); } parts.black.push(...g); }
  };
  for (const u of S.doors) gap(u);
  const shut = (u, x0, x1) => { const sec = section(u); const z = (u - 0.5) * L; const y = sec.yT + 0.004; put(parts.black, new THREE.BoxGeometry((x1 - x0) * sec.A * 2, 0.006, 0.012), 0, y, z); };
  if (S.hood) shut(S.hood, 0, 0.92); if (S.trunk && !S.bed) shut(S.trunk + 0.01, 0, 0.9);
  // front: grille, headlights (lens bulges), lower intake, plate; rear: tail lights, plate, reflectors
  const zf = L / 2, zr = -L / 2; const yHl = top(0.96) - 0.1;
  const low = !!(kind === 'sedan' || S.twoDoor); const lift = S.lift || 0;
  // r6.4 outer body surface along z at (x, y): scan the stations from the end inward (headlamp / tail-lamp seating)
  const endZ = (x, y, front) => { for (let k = 0; k <= 160; k++) { const u = front ? 1 - k * 0.0012 : k * 0.0012; if (surfX(u, y) >= x) return (u - 0.5) * L; } return front ? zf - 0.19 : zr + 0.19; };
  const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg);
  // headlamp unit: dark housing + chrome reflector cups with bulbs + LED daytime-running strip, under a clear outer lens
  const headUnit = (s) => {
    const hx = HW * (S.hl === 'round' ? 0.66 : 0.68); const z0 = endZ(hx, yHl, true); const yaw = s * -0.35;
    const rx = S.hl === 'slim' ? 0.2 : 0.2, ry = S.hl === 'round' ? 0.075 : S.hl === 'slim' ? 0.045 : 0.058, rz = 0.1;
    const lz = z0 - 0.035; // lens centre a little behind the surface so ~6 cm of the dome stands proud
    const hous = new THREE.SphereGeometry(1, 16, 10, Math.PI, Math.PI); hous.scale(rx * 0.97, ry * 0.95, rz * 0.9); put(parts.lampIn, hous, s * hx, yHl, lz - 0.006, 0.1, yaw, 0);
    const lens = new THREE.SphereGeometry(1, 18, 10); lens.scale(rx, ry, rz); put(parts.lens, lens, s * hx, yHl, lz, 0.1, yaw, 0);
    const hg = new THREE.SphereGeometry(1, 14, 8); hg.scale(rx * 0.9, ry * 0.85, rz * 0.8); put(parts.hglow, hg, s * hx, yHl, lz - 0.004, 0.1, yaw, 0); // night: lit lens glow (additive)
    const cos = Math.cos(yaw), sin = Math.sin(yaw); const at = (dx, dz) => [s * hx + dx * cos + dz * sin, lz - dx * sin + dz * cos];
    const cups = S.hl === 'round' ? [[-0.085, 0.05], [0.085, 0.045]] : S.hl === 'slim' ? [[-0.1, 0.03], [0.0, 0.035], [0.1, 0.03]] : [[-0.075, 0.042], [0.07, 0.04]];
    for (const [dx, cr] of cups) { const sx = s * dx; const [x, z] = at(sx, rz * 0.35);
      const cup = lathe([[0.004, -cr * 0.55], [cr * 0.45, -cr * 0.48], [cr * 0.8, -cr * 0.25], [cr, 0]]); put(parts.chrome, cup, x, yHl - 0.004, z, Math.PI / 2, yaw, 0);
      const bulb = new THREE.SphereGeometry(cr * 0.38, 10, 6); put(parts.head, bulb, x, yHl - 0.004, z - cr * 0.15); }
    // LED strip along the upper / outer edge of the lamp (L-shaped on square lamps, ring segments on round)
    if (S.hl === 'round') { for (const [dx, cr] of cups) { const [x, z] = at(s * dx, rz * 0.4); const ring = new THREE.TorusGeometry(cr * 1.05, 0.0045, 4, 20); put(parts.drl, ring, x, yHl - 0.004, z + 0.004, 0, yaw, 0); } }
    else { const [x, z] = at(0, rz * 0.62); put(parts.drl, new THREE.BoxGeometry(rx * 1.7, 0.009, 0.008), x, yHl + ry * 0.62, z, 0.1, yaw, 0);
      const [x2, z2] = at(s * rx * 0.82, rz * 0.4); put(parts.drl, new THREE.BoxGeometry(0.008, ry * 1.2, 0.008), x2, yHl, z2, 0, yaw, 0); }
    const amb = new THREE.BoxGeometry(0.1, 0.022, 0.02); const [xa, za] = at(s * rx * 0.55, rz * 0.5); put(parts.amber, amb, xa, yHl - ry * 0.6, za, 0, yaw, 0);
  };
  // tail lamp: smoked red outer lens over a dark cavity with horizontal LED bars (+ white reverse lamp)
  const tailUnit = (s) => {
    const yTl = low ? top(0.02) - 0.08 : 1.0 + lift; const tx = HW * 0.72; const z0 = endZ(tx, yTl, false); const yaw = s * 0.45;
    const rx = S.twoDoor ? 0.3 : 0.26, ry = S.hl === 'round' ? 0.06 : 0.07, rz = 0.1; const lz = z0 + 0.035;
    const cav = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI); cav.scale(rx * 0.97, ry * 0.93, rz * 0.9); put(parts.lampIn, cav, s * tx, yTl, lz + 0.006, 0, yaw, 0);
    const lens = new THREE.SphereGeometry(1, 16, 8); lens.scale(rx, ry, rz); put(parts.tlens, lens, s * tx, yTl, lz, 0, yaw, 0);
    const tg = new THREE.SphereGeometry(1, 12, 6); tg.scale(rx * 0.9, ry * 0.8, rz * 0.8); put(parts.tglow, tg, s * tx, yTl, lz + 0.004, 0, yaw, 0);
    const cos = Math.cos(yaw), sin = Math.sin(yaw); const at = (dx, dz) => [s * tx + dx * cos + dz * sin, lz - dx * sin + dz * cos];
    const nb = S.hl === 'round' ? 2 : 3; for (let k = 0; k < nb; k++) { const [x, z] = at(s * 0.01, -rz * 0.45); put(parts.tail, new THREE.BoxGeometry(rx * 1.5, 0.008, 0.01), x, yTl + (k - (nb - 1) / 2) * ry * 0.55, z, 0, yaw, 0); }
    const [xr, zr2] = at(-s * rx * 0.5, -rz * 0.5); put(parts.rev, new THREE.BoxGeometry(0.07, ry * 0.5, 0.01), xr, yTl, zr2, 0, yaw, 0);
    if (!low) { const tv = new THREE.BoxGeometry(0.07, 0.45, 0.07); put(parts.tail, tv, s * HW * 0.86, yTl + 0.05, zr + 0.06); }
  };
  for (const s of [1, -1]) {
    headUnit(s); tailUnit(s);
    const fog = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12); put(parts.head, fog, s * HW * 0.66, S.clear + 0.22, zf - 0.08, Math.PI / 2, 0, 0);
    // mirrors (body-colour cap on a black stalk) at the A-pillar base
    const um = S.ws[1] - 0.02; const my = belt0(um) + 0.1; const mx = surfX(um, belt0(um) - 0.02);
    put(parts.black, new THREE.BoxGeometry(0.1, 0.04, 0.05), s * (mx + 0.03), my - 0.05, (um - 0.5) * L);
    const cap = new THREE.SphereGeometry(1, 12, 8); cap.scale(0.085, 0.055, 0.045); put(parts.paint, cap, s * (mx + 0.1), my, (um - 0.5) * L - 0.01);
    const mg = new THREE.PlaneGeometry(0.15, 0.09); put(parts.chrome, mg, s * (mx + 0.1), my, (um - 0.5) * L - 0.056, 0, Math.PI, 0);
    // door handles (r6.4: at the rear edge of each door, where real pulls sit)
    for (let d = 0; d < S.doors.length - 1; d++) { const u = S.doors[d] + 0.035; const y = belt0(u) - 0.1; const x = surfX(u, y);
      put(parts.chrome, new THREE.BoxGeometry(0.03, 0.035, 0.16), s * (x + 0.01), y, (u - 0.5) * L); }
  }
  // r6.4 panel seams: bumper covers meet the fenders, fuel filler flap (right rear quarter)
  for (const u of [0.035, 0.962]) { const sec = section(u); const z = (u - 0.5) * L; const ylo = S.clear + 0.1, yhi = Math.min(sec.yBe - 0.04, ylo + 0.42);
    for (const s of [1, -1]) { const x = surfX(u, (ylo + yhi) / 2); put(parts.black, new THREE.BoxGeometry(0.01, yhi - ylo, 0.008), s * (x + 0.002), (ylo + yhi) / 2, z, 0, 0, 0); } }
  { const uf = S.bed ? 0.3 : low ? 0.2 : 0.16; const y = belt0(uf) - 0.1; const x = surfX(uf, y); const z = (uf - 0.5) * L; const fl = new THREE.TorusGeometry(0.075, 0.004, 3, 4); fl.rotateZ(Math.PI / 4);
    put(parts.black, fl, -(x + 0.003), y, z, 0, Math.PI / 2, 0); }
  const gw = HW * (low ? 0.9 : 1.05); const gy = yHl - 0.12;
  put(parts.black, new THREE.BoxGeometry(gw, 0.17, 0.06), 0, gy, zf - 0.07); // grille
  for (let k = 0; k < 6; k++) put(parts.chrome, new THREE.BoxGeometry(gw * 0.98, 0.008, 0.01), 0, gy - 0.07 + k * 0.028, zf - 0.035);
  put(parts.black, new THREE.BoxGeometry(HW * 1.2, 0.1, 0.06), 0, S.clear + 0.12, zf - 0.1); // lower intake
  // r6.4 licence plates are textured per car in vehicles.js: slots (centre, size, facing)
  const plates = [{ x: 0, y: S.clear + 0.24, z: endZ(0.27, S.clear + 0.24, true) + 0.028, w: 0.52, h: 0.11, dir: 1, front: true },
    { x: 0, y: low ? top(0.02) - 0.26 : 0.82 + lift, z: endZ(0.17, low ? top(0.02) - 0.26 : 0.82 + lift, false) - 0.028, w: 0.31, h: 0.155, dir: -1 }];
  put(parts.tail, new THREE.BoxGeometry(HW * 1.1, 0.03, 0.04), 0, low ? top(0.02) - 0.05 : 1.12 + lift, zr + 0.06); // light bar
  // r6.4 model-specific pieces
  if (S.scoop) { const uh = 0.8; const g = new THREE.BoxGeometry(0.55, 0.07, 0.6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) > 0) p.setY(i, p.getY(i) - 0.05); g.computeVertexNormals();
    put(parts.paint, g, 0, top(uh) + 0.01, (uh - 0.5) * L); put(parts.black, new THREE.BoxGeometry(0.45, 0.025, 0.01), 0, top(uh) + 0.03, (uh - 0.5) * L + 0.3); }
  if (S.duck) { const g = new THREE.BoxGeometry(HW * 1.7, 0.05, 0.2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0 && p.getY(i) > 0) p.setY(i, p.getY(i) + 0.03); g.computeVertexNormals();
    put(parts.paint, g, 0, top(0.045) + 0.02, (0.045 - 0.5) * L); }
  if (S.open) { // folded soft top behind the rear seats + a chrome windscreen-frame cap
    const ut = S.tub[0] + 0.012; put(parts.black, new THREE.BoxGeometry(HW * 1.55, 0.12, 0.3), 0, belt0(ut) + 0.03, (ut - 0.5) * L + 0.12);
    const uw = S.ws[0] - 0.006; put(parts.chrome, new THREE.BoxGeometry(HW * 1.4, 0.02, 0.03), 0, top(uw) + 0.008, (uw - 0.5) * L); }
  if (S.mud) { // off-road kit: roof LED bar, side steps, front skid plate, rear hitch, bigger flares (below)
    const ur = S.roof[1] - 0.04; put(parts.black, new THREE.BoxGeometry(1.1, 0.07, 0.08), 0, top(ur) + 0.07, (ur - 0.5) * L);
    put(parts.drl, new THREE.BoxGeometry(1.0, 0.035, 0.01), 0, top(ur) + 0.07, (ur - 0.5) * L + 0.042);
    for (const s of [1, -1]) put(parts.black, new THREE.BoxGeometry(0.16, 0.05, (S.doors[S.doors.length - 1] - S.doors[0]) * L), s * (HW * 0.93), S.clear - 0.06, ((S.doors[0] + S.doors[S.doors.length - 1]) / 2 - 0.5) * L);
    put(parts.black, new THREE.BoxGeometry(HW * 1.3, 0.04, 0.4), 0, S.clear - 0.02, zf - 0.35);
    put(parts.chrome, new THREE.BoxGeometry(0.06, 0.06, 0.25), 0, S.clear + 0.02, zr - 0.08); }
  // r6.2: the cabin is modeled in src/carinterior.js from this layout (seats / dash / wheel / console / door cards / headliner)
  const cabin = (() => {
    const K = { sedan: { fz: 0.0, dz: 0.70, rz: -0.80 }, suv: { fz: 0.15, dz: 0.86, rz: -0.75 }, van: { fz: 0.72, dz: 1.36, rz: -0.18 }, pickup: { fz: 0.0, dz: 0.70, rz: null }, lifted: { fz: 0.0, dz: 0.70, rz: null }, muscle: { fz: -0.12, dz: 0.55, rz: -0.95 }, conv: { fz: -0.05, dz: 0.62, rz: -0.85 } }[kind];
    const uz = (z) => z / L + 0.5; const floorY = S.clear + (S.bed ? 0.1 : 0.08);
    const uF = uz(K.fz); const beltY = belt0(uF); const fy = floorY + (low ? 0.24 : 0.3);
    let headY = 9; for (let u = S.roof[0]; u <= S.roof[1]; u += 0.01) headY = Math.min(headY, top(u)); headY -= 0.06;
    let hwHead = 9; for (let u = S.roof[0]; u <= S.roof[1]; u += 0.02) hwHead = Math.min(hwHead, surfX(u, headY - 0.02)); hwHead -= 0.05;
    const hwFront = Math.min(surfX(uF, beltY - 0.12), surfX(uz(K.dz), beltY - 0.12)) - 0.07;
    const C = { floorY, beltY, headY, hwHead, hwFront, hwDash: surfX(uz(K.dz), beltY - 0.1) - 0.08, hwRear: hwFront,
      zCowl: (S.ws[1] - 0.5) * L, yCowl: top(S.ws[1]), zWsTop: (S.ws[0] - 0.5) * L, yWsTop: top(S.ws[0]), zDash: K.dz,
      front: { x: hwFront * 0.47, y: fy, z: K.fz }, rear: null, zHead0: (S.roof[0] - 0.5) * L + 0.03, zHead1: (S.ws[0] - 0.5) * L - 0.03 };
    if (K.rz !== null) {
      const ry = fy + 0.03; const tz = K.rz - 0.1 - 0.6 * Math.sin(0.3); const avail = top(uz(tz)) - 0.1 - (ry - 0.02);
      C.rear = { y: ry, z: K.rz, backH: Math.max(0.42, Math.min(0.6, avail / Math.cos(0.3))) };
      C.hwRear = surfX(uz(K.rz), beltY - 0.12) - 0.07;
    } else { C.backWall = true; C.zBack = (S.roof[0] - 0.5) * L + 0.06; }
    if (S.open) { C.open = true; C.headY = 2.4; } // top down: no headliner, nothing to clear
    if (kind === 'sedan' || kind === 'muscle' || kind === 'conv') { C.shelf = true; C.zBack = (S.rw[0] - 0.5) * L + 0.05; C.yBack = belt0(S.rw[0] + 0.03) - 0.02; }
    if (kind === 'suv' || kind === 'van') C.cargo = [-L / 2 + 0.25, K.rz - 0.35, floorY + 0.12];
    return C;
  })();
  // open pickup bed: floor, liner walls, front wall, tailgate inner face; SUV roof rails
  if (S.bed) { const z0 = (S.bed[0] - 0.5) * L, z1 = (S.bed[1] - 0.5) * L; const yb = belt0((S.bed[0] + S.bed[1]) / 2); const yf = S.clear + S.wr * 1.25; const xi = HW * 0.86;
    put(parts.black, new THREE.BoxGeometry(xi * 2, 0.04, z1 - z0), 0, yf, (z0 + z1) / 2);
    for (const sx of [-1, 1]) put(parts.black, new THREE.BoxGeometry(0.03, yb - yf, z1 - z0), sx * xi, (yf + yb) / 2, (z0 + z1) / 2);
    put(parts.black, new THREE.BoxGeometry(xi * 2, yb - yf, 0.03), 0, (yf + yb) / 2, z1); put(parts.black, new THREE.BoxGeometry(xi * 2, yb - yf, 0.03), 0, (yf + yb) / 2, z0 + 0.06);
    for (let k = 1; k < 6; k++) put(parts.black, new THREE.BoxGeometry(0.04, 0.025, z1 - z0 - 0.1), -xi + k * xi / 3, yf + 0.03, (z0 + z1) / 2); }
  if (kind === 'suv' || kind === 'van') for (const sx of [-1, 1]) { const ua = S.roof[0] + 0.03, ub = S.roof[1] - 0.05; const y = top((ua + ub) / 2) + 0.06; const xr = HW * wid(0.5) * (1 - S.tumble) * 0.82;
    put(parts.black, new THREE.BoxGeometry(0.035, 0.035, (ub - ua) * L), sx * xr, y, ((ua + ub) / 2 - 0.5) * L);
    for (const u of [ua, ub]) put(parts.black, new THREE.BoxGeometry(0.04, 0.07, 0.08), sx * xr, y - 0.035, (u - 0.5) * L); }
  // arch lips (thin half-torus following each arch on both sides), wipers, roof antenna fin, exhaust tips
  for (const ax of [axF, axR]) for (const s of [1, -1]) {
    const lip = new THREE.TorusGeometry(ra * 1.0, S.mud ? 0.055 : 0.022, 5, 18, Math.PI); lip.rotateY(Math.PI / 2); const ux = ax; const xw = surfX(ux, cy + ra * 0.7);
    lip.translate(s * (xw + 0.004), cy, (ax - 0.5) * L); parts.black.push(lip);
  }
  if (S.ws) { const uw = S.ws[1] - 0.012; const yw = top(uw) + 0.02; for (const s of [-0.28, 0.32]) put(parts.black, new THREE.BoxGeometry(0.62, 0.018, 0.03), s * HW, yw, (uw - 0.5) * L - 0.05, 0, s > 0 ? 0.12 : -0.08, 0.05); }
  { const ua = (S.roof[0] + S.roof[1]) / 2 - 0.12; const fin = new THREE.SphereGeometry(1, 10, 6); fin.scale(0.035, 0.05, 0.12); put(parts.black, fin, 0, top(ua) + 0.02, (ua - 0.5) * L); }
  for (const s of low ? [-1, 1] : [1]) { const ex = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12, 1, true); put(parts.chrome, ex, s * HW * 0.55, S.clear + 0.1, zr + 0.04, Math.PI / 2, 0, 0); }
  // wheel-well liners (dark half-cylinders inside the arches)
  for (const ax of [axF, axR]) { const lg = new THREE.CylinderGeometry(ra * 0.98, ra * 0.98, S.W * 0.86, 20, 1, true, -Math.PI / 2, Math.PI); lg.rotateZ(Math.PI / 2); lg.translate(0, cy, (ax - 0.5) * L); parts.black.push(lg); }
  const merge = (list) => { if (!list.length) return null; const p = [], n = [], ix = []; let off = 0; for (const g0 of list) { const g = g0.index ? g0 : g0; if (!g.attributes.normal) g.computeVertexNormals(); const P = g.attributes.position, N = g.attributes.normal; for (let i = 0; i < P.count; i++) { p.push(P.getX(i), P.getY(i), P.getZ(i)); n.push(N.getX(i), N.getY(i), N.getZ(i)); } if (g.index) for (let i = 0; i < g.index.count; i++) ix.push(off + g.index.getX(i)); else for (let i = 0; i < P.count; i++) ix.push(off + i); off += P.count; }
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); o.setIndex(ix); return o; };
  const det = {}; for (const k in parts) det[k] = merge(parts[k]);
  const wheels = []; const track = HW - S.wr * 0.34 - 0.05;
  for (const [ax, f] of [[axF, 'f'], [axR, 'r']]) for (const [s, side] of [[1, 'l'], [-1, 'r']]) wheels.push({ name: 'wheel_' + f + side, x: s * track, y: cy, z: (ax - 0.5) * L });
  return { shell, det, wheels, cabin, plates, dims: { L, W: S.W, H: Math.max(...S.top.map((k) => k[1])), wb: S.wb, wr: S.wr } };
}

// assemble a prototype scene graph compatible with vehicles.js cloneModel(): meshes flagged userData.paint get the car's
// paint; wheel nodes named wheel_fl/fr/rl/rr each hold an invisible placeholder cylinder (detailWheels sizes the real
// procedural wheel from it).
export function bodyProto(kind, M) {
  const B = buildBody(kind); const root = new THREE.Group();
  const shell = new THREE.Mesh(B.shell, [M.paint, M.glass, M.black]); shell.userData.paint = true; shell.userData.paintSlot = 0; root.add(shell);
  const mk = (g, mat, paint) => { if (!g) return; const m = new THREE.Mesh(g, mat); if (paint) m.userData.paint = true; root.add(m); };
  mk(B.det.black, M.black); mk(B.det.chrome, M.chrome); mk(B.det.head, M.head); mk(B.det.tail, M.tail); mk(B.det.plate, M.plate); mk(B.det.interior, M.interior); mk(B.det.paint, M.paint, true); mk(B.det.amber, M.amber);
  // r6.4 lamp internals: dark cavities, LED strips, reverse lamps; clear / smoked-red outer lenses drawn last (transparent)
  mk(B.det.lampIn, M.lampIn || M.black); mk(B.det.drl, M.drl || M.head); mk(B.det.rev, M.rev || M.head); mk(B.det.lens, M.lens || M.head); mk(B.det.tlens, M.tlens || M.tail);
  if (M.hglow) { mk(B.det.hglow, M.hglow); mk(B.det.tglow, M.tglow); }
  root.userData.plates = B.plates;
  const S = BODY_SPECS[kind];
  for (const w of B.wheels) { const n = new THREE.Group(); n.name = w.name; n.position.set(w.x, w.y, w.z); const ph = new THREE.Mesh(new THREE.CylinderGeometry(S.wr, S.wr, S.wr * 0.68, 8).rotateZ(Math.PI / 2), M.black); ph.visible = false; n.add(ph); root.add(n); }
  root.traverse((o) => { if (o.isMesh) { const tr = !Array.isArray(o.material) && o.material.transparent; o.castShadow = !tr; o.receiveShadow = !tr; } }); // r6.4 lenses / glows cast no shadow
  // r6.2 inner lining of the shell (BackSide pass on the same geometry; glass group skipped) + modeled cabin
  if (M.liner) { const ln = new THREE.Mesh(B.shell, [M.liner, M.hidden, M.liner]); ln.name = 'liner'; ln.castShadow = false; ln.receiveShadow = true; root.add(ln); }
  return { root, dims: B.dims, cabin: B.cabin };
}
