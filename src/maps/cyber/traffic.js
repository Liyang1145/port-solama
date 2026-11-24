// r6.0 map 霓港 traffic (from v4.4/4.5): cars drive the road graph (./roadgraph.js) — polyline edges with 1–3 lanes per direction,
// quadratic turn paths through junctions, signals at major junctions, Dijkstra waypoints for police / fleeing AI.
// Same public surface as the shared Traffic in src/vehicles.js (cars, phase, spawnCar, removeCar, update, waypoint).
import * as THREE from 'three';
import { Vehicle } from '../../vehicles.js';
import { clamp, lerp, rand, pick, angWrap, rng } from '../../util.js';
import { pointAt, project } from './roadgraph.js';

export class GraphTraffic {
  // v4.4: cars drive the road graph (src/roadgraph.js): polyline edges with 1–3 lanes per direction, turns are quadratic paths
  // through the junction, signals at major junctions alternate between two approach groups in each node's own frame.
  constructor(scene, city) {
    this.scene = scene; this.city = city; this.cars = []; this.phase = 0; this.phaseT = 0;
    this.G = city.graph; this.segs = city.segs; this.inter = new Map(); for (const i of city.inters) this.inter.set(Math.round(i.x) + ',' + Math.round(i.z), i);
    this.edges = this.G.edges.filter((e) => e.L > 14);
  }
  lanesOf(e) { return e.lanes; }
  laneOffset(e, dir, lane) { return e.kind === 'res' || e.kind === 'rur' ? 2.1 : 1.75 + lane * 3.5; }
  // world point on a lane at arc length s along edge e (s measured from n0); right-hand traffic
  lanePoint(e, dir, lane, s, out = new THREE.Vector3()) {
    const P = pointAt(e, s, this._p || (this._p = {})); const tx = P.tx * dir, tz = P.tz * dir; const off = this.laneOffset(e, dir, lane);
    return out.set(P.x - tz * off, 0, P.z + tx * off);
  }
  laneFix(e, dir, lane) { if (e.legacy && e.axis === 'z' && Math.abs(e.pts[0][0] - 290) < 0.5 && dir > 0) return 0; return Math.min(lane, e.lanes - 1); }
  spawnCar(type, nearPos, minD = 110, maxD = 240, avoidDir = null) {
    // r6.2: draw from the edges that can be in range (the map has thousands of edges; 40 blind picks over the whole graph
    // usually all missed, so 3-star dispatch on 霓港 only ever put ~2 cruisers on the road vs 4 on 索拉纳港)
    const cand = this.edges.filter((e) => { const bb = e.pts[Math.floor(e.pts.length / 2)]; return Math.hypot(bb[0] - nearPos.x, bb[1] - nearPos.z) <= maxD + e.L / 2; });
    if (!cand.length) return null;
    for (let tries = 0; tries < 40; tries++) {
      const e = pick(cand);
      const dir = rng() < 0.5 ? 1 : -1; const lane = this.laneFix(e, dir, rng() < 0.5 ? 0 : 1);
      const s = lerp(e.n0.trim + 6, e.L - e.n1.trim - 6, rng()); if (e.L - e.n1.trim - e.n0.trim < 14) continue;
      const p = this.lanePoint(e, dir, lane, s);
      const d = Math.hypot(p.x - nearPos.x, p.z - nearPos.z);
      if (d < minD || d > maxD) continue;
      if (avoidDir && (p.x - nearPos.x) * avoidDir.x + (p.z - nearPos.z) * avoidDir.z > d * 0.5 && d < 160) continue;
      if (this.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 12)) continue;
      const v = new Vehicle(this.scene, type);
      const P = pointAt(e, s); const yaw = Math.atan2(P.tx * dir, P.tz * dir);
      v.place(p.x, p.z, yaw);
      const sp = e.kind === 'cw' ? rand(15, 19) : e.kind === 'res' ? rand(8, 11) : e.kind === 'rur' ? rand(12, 16) : rand(10, 14); v.vx = Math.sin(yaw) * sp * 0.8; v.vz = Math.cos(yaw) * sp * 0.8;
      v.ai = { mode: 'lane', edge: e, dir, lane, s, cruise: sp, path: null, pi: 0, stuck: 0 };
      this.cars.push(v); return v;
    }
    return null;
  }
  removeCar(v) { const i = this.cars.indexOf(v); if (i >= 0) this.cars.splice(i, 1); v.dispose(); }
  // re-attach a car that lost its lane (chase ended, spawned by the player) to the nearest edge
  attach(v) {
    const n = (this.G.index.nearAny ? this.G.index.nearAny(v.x, v.z, 80) : this.G.index.near(v.x, v.z)); if (!n) return false; const e = n.e; const P = pointAt(e, n.s);
    const dir = P.tx * Math.sin(v.yaw) + P.tz * Math.cos(v.yaw) >= 0 ? 1 : -1;
    v.ai = Object.assign(v.ai || {}, { mode: 'lane', edge: e, dir, lane: this.laneFix(e, dir, 0), s: n.s, cruise: v.ai?.cruise || 11, path: null, pi: 0, stuck: 0, revT: 0 }); return true;
  }
  endS(a) { const e = a.edge; const s0 = e.n0.trim, s1 = e.L - e.n1.trim; if (s1 <= s0) return e.L * 0.5; return a.dir > 0 ? s1 : s0; }
  planTurn(v) {
    const a = v.ai; const e = a.edge; const node = a.dir > 0 ? e.n1 : e.n0; const endS = this.endS(a);
    const deadLegacy = node.deg === 1 && node.legacy;
    const fromS = deadLegacy ? Math.max(0, Math.min(e.L, endS - a.dir * 8)) : endS;
    const from = this.lanePoint(e, a.dir, a.lane, fromS);
    const inH = pointAt(e, fromS); const ix = inH.tx * a.dir, iz = inH.tz * a.dir;
    const collect = (minUsable) => {
      const opts = [];
      for (const o of node.edges) {
        for (const od of (o.n0 === node ? [1] : []).concat(o.n1 === node ? [-1] : [])) {
          if (o === e && od === -a.dir && node.deg > 1) continue; // no U-turn unless dead end
          if (o.L - o.n0.trim - o.n1.trim < minUsable) continue;
          const s0 = o.n0.trim, s1 = o.L - o.n1.trim;
          const sS = s1 <= s0 ? o.L * 0.5 : (od > 0 ? s0 : s1);
          const H = pointAt(o, sS); const hx = H.tx * od, hz = H.tz * od;
          const al = ix * hx + iz * hz; opts.push({ edge: o, dir: od, sS, w: al > 0.7 ? 3 : al > -0.3 ? 1 : 0.15, al });
        }
      }
      return opts;
    };
    let options = collect(4);
    // short bridge edges between closely spaced junctions (e.g. ring_n, bay_blvd, dt_sun): allow through-traversal rather than illegal U-turn
    if (!options.length && node.deg >= 2) options = collect(-1e9);
    let ch;
    if (!options.length) ch = { edge: e, dir: -a.dir, sS: fromS, uturn: true, al: -1 };
    else { const tot = options.reduce((s, o) => s + o.w, 0); let r = rng() * tot; ch = options[0]; for (const o of options) { r -= o.w; if (r <= 0) { ch = o; break; } } }
    const lane = this.laneFix(ch.edge, ch.dir, ch.al > 0.7 ? a.lane : rng() < 0.5 ? 0 : 1);
    const to = this.lanePoint(ch.edge, ch.dir, lane, ch.sS);
    const H2 = pointAt(ch.edge, ch.sS); const ox = H2.tx * ch.dir, oz = H2.tz * ch.dir;
    let ctrl;
    if (ch.uturn) ctrl = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(ix * (deadLegacy ? 3.5 : 9), 0, iz * (deadLegacy ? 3.5 : 9)));
    else { const den = ix * oz - iz * ox; if (Math.abs(den) < 0.15) ctrl = from.clone().add(to).multiplyScalar(0.5);
      else { const t = ((to.x - from.x) * oz - (to.z - from.z) * ox) / den; ctrl = new THREE.Vector3(from.x + ix * t, 0, from.z + iz * t); if (t < 0 || t > 60) ctrl = from.clone().add(to).multiplyScalar(0.5); } }
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3().copy(from).multiplyScalar((1 - t) ** 2).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(to, t * t)); }
    return { pts, next: { edge: ch.edge, dir: ch.dir, lane, s: ch.sS }, straight: !ch.uturn && ch.al > 0.9 };
  }
  green(node, e, dir) { // is the approach of edge e (arriving at node with travel dir) green?
    if (!node.signal) return true; if (this.phase === 2) return false;
    if (!node._sigRef) {
      let ref = null;
      for (const o of node.edges) {
        const P = pointAt(o, o.n0 === node ? Math.min(2, o.L * 0.5) : Math.max(0, o.L - 2));
        if (!ref || (Math.abs(P.tz) >= 0.89 && Math.abs(ref[1]) < 0.89)) ref = [P.tx, P.tz];
      }
      node._sigRef = ref || [0, 1];
    }
    const H = pointAt(e, dir > 0 ? Math.max(0, e.L - 2) : Math.min(2, e.L * 0.5));
    const grp = Math.abs(H.tx * node._sigRef[0] + H.tz * node._sigRef[1]) > 0.88 ? 0 : 1;
    return grp === this.phase;
  }
  update(dt, player, others) {
    this.phaseT += dt; const cyc = this.phaseT % 30; this.phase = cyc < 13 ? 0 : cyc < 15 ? 2 : cyc < 28 ? 1 : 2;
    const tgt = new THREE.Vector3();
    for (const v of this.cars) {
      const a = v.ai; if (!a || v.driver === 'player') continue;
      if (a.mode === 'dead') { v.input.throttle = 0; v.input.handbrake = true; continue; }
      if (a.mode === 'lane' && !a.edge) { if (!this.attach(v)) continue; }
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      let desired = a.cruise;
      if (a.mode === 'lane') {
        const e = a.edge; // track arc length near the previous value
        const pr = project(e, v.x, v.z); a.s = pr.s; if (pr.d > 25) { this.attach(v); continue; }
        const endS = this.endS(a); const remain = (endS - a.s) * a.dir;
        const node = a.dir > 0 ? e.n1 : e.n0;
        if (remain < (node.deg === 1 && node.legacy ? 11 : 3)) { a.path = this.planTurn(v); a.mode = 'turn'; a.pi = 1; continue; }
        if (node.signal && !this.green(node, e, a.dir) && remain > 2.5 && remain < 26) desired = Math.min(desired, Math.max(0, (remain - 4.5) * 0.9));
        if (remain < 18 && node.deg !== 2) desired = Math.min(desired, 8);
        this.lanePoint(e, a.dir, a.lane, a.s + a.dir * (7 + Math.abs(v.speed) * 0.5), tgt);
      } else if (a.mode === 'turn') {
        const P = a.path.pts; let p = P[a.pi];
        while (a.pi < P.length - 1 && Math.hypot(p.x - v.x, p.z - v.z) < 4.5) { a.pi++; p = P[a.pi]; }
        tgt.copy(p); desired = a.path.straight ? a.cruise : 6.5;
        if (a.pi >= P.length - 1 && Math.hypot(p.x - v.x, p.z - v.z) < 4.5) { Object.assign(a, a.path.next); a.mode = 'lane'; a.path = null; const ec = a.edge.kind; a.cruise = ec === 'cw' ? Math.max(a.cruise, 15) : ec === 'res' ? Math.min(a.cruise, 11) : a.cruise; }
      } else if (a.mode === 'chase' || a.mode === 'flee') {
        tgt.copy(a.target || player.pos); desired = a.mode === 'chase' ? (a.chaseSpeed ?? 24) : 26;
      }
      let block = 99;
      const chk = (ox, oz, rad) => { const dx = ox - v.x, dz = oz - v.z; const along = dx * fx + dz * fz; if (along < 0 || along > 28) return; const lat = Math.abs(dx * fz - dz * fx); if (lat < rad) block = Math.min(block, along); };
      for (const o of this.cars) if (o !== v) chk(o.x, o.z, 2.3);
      for (const o of others) if (o !== v) chk(o.x, o.z, 2.3);
      if (player.onFoot) chk(player.pos.x, player.pos.z, 1.8);
      if (a.mode !== 'chase' && a.mode !== 'flee') desired = Math.min(desired, Math.max(0, (block - 6.5) * 1.1));
      else if (block < 8) desired = Math.min(desired, 6);
      if (player.onFoot && block < 10 && v.hornT <= 0 && Math.abs(v.speed) < 3) { v.hornT = 4; v.wantsHorn = true; }
      v.hornT -= dt;
      const ang = angWrap(Math.atan2(tgt.x - v.x, tgt.z - v.z) - v.yaw);
      v.input.steer = clamp(ang * 2.2, -1, 1);
      const sp = v.speed;
      if (desired <= 0) { v.input.throttle = 0; v.input.handbrake = true; a.stuck = 0; a.revT = 0; continue; }
      v.input.throttle = sp < desired - 0.5 ? clamp((desired - sp) * 0.4, 0.15, 1) : sp > desired + 0.8 ? -clamp((sp - desired) * 0.35, 0.2, 1) : 0;
      v.input.handbrake = false;
      if (a.mode === 'chase' && Math.abs(ang) > 1.6 && Math.abs(sp) < 6) { v.input.throttle = -0.8; v.input.steer = -Math.sign(ang); }
      if (a.revT > 0) { a.revT -= dt; v.input.throttle = -0.85; v.input.steer = -v.input.steer; v.input.handbrake = false; }
      else if (Math.abs(sp) < 0.4 && desired > 3) { a.stuck += dt; if (a.stuck > 4) { a.revT = 1.6; a.stuck = 0; } } else a.stuck = 0;
    }
  }
  // v4.4 graph route for police / fleeing AI: next waypoint on the shortest road path from the car toward (tx, tz)
  waypoint(v, tx, tz) {
    const G = this.G; const lk = G.index.nearAny || G.index.near;
    const a = lk(v.x, v.z, 80), b = lk(tx, tz, 80);
    if (!a || !b) return new THREE.Vector3(tx, 0, tz);
    if (a.e === b.e) {
      const ds = b.s - a.s;
      if (Math.abs(ds) > 25) { const p = pointAt(a.e, a.s + Math.sign(ds) * 35); return new THREE.Vector3(p.x, 0, p.z); }
      return new THREE.Vector3(tx, 0, tz);
    }
    const key = a.e.id + ':' + b.e.id; v._route = v._route || {};
    if (v._route.key !== key || v._route.t < performance.now() - 1500) {
      const dist = new Map(), prev = new Map(), q = []; // r6.2: binary heap (was sort + includes per pop: O(n^2 log n) stalls on the big graph)
      const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (q[p][0] <= q[i][0]) break; [q[p], q[i]] = [q[i], q[p]]; i = p; } };
      const down = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < q.length && q[l][0] < q[m][0]) m = l; if (r < q.length && q[r][0] < q[m][0]) m = r; if (m === i) return; [q[m], q[i]] = [q[i], q[m]]; i = m; } };
      const push = (n, d) => { q.push([d, n]); up(q.length - 1); };
      const pop = () => { const t = q[0]; const l = q.pop(); if (q.length) { q[0] = l; down(0); } return t; };
      for (const [n, d0] of [[a.e.n0, a.s], [a.e.n1, a.e.L - a.s]]) { if (d0 < (dist.has(n) ? dist.get(n) : 1e18)) { dist.set(n, d0); push(n, d0); } }
      const goal = new Set([b.e.n0, b.e.n1]); let found = null; let guard = 0;
      while (q.length && guard++ < 20000) { const [dn, n] = pop(); if (dn > dist.get(n)) continue; if (goal.has(n)) { found = n; break; }
        for (const e of n.edges) { const m = e.n0 === n ? e.n1 : e.n0; const d = dn + e.L; if (d < (dist.has(m) ? dist.get(m) : 1e18)) { dist.set(m, d); prev.set(m, n); push(m, d); } } }
      const path = []; for (let n = found; n; n = prev.get(n)) path.unshift(n);
      v._route = { key, t: performance.now(), path };
    }
    const path = v._route.path;
    while (path.length > 1 && Math.hypot(path[0].x - v.x, path[0].z - v.z) < 16) path.shift();
    if (!path.length) return new THREE.Vector3(tx, 0, tz);
    const n0 = path[0];
    // sample along current edge a.e toward n0 so curved roads/bridges don't cut across water/buildings
    if (a.e.n0 === n0 || a.e.n1 === n0) {
      const targetS = a.e.n0 === n0 ? 0 : a.e.L;
      const ds = targetS - a.s;
      if (Math.abs(ds) > 16) { const p = pointAt(a.e, a.s + Math.sign(ds) * Math.min(Math.abs(ds), 35)); return new THREE.Vector3(p.x, 0, p.z); }
      if (path.length > 1) {
        const n1 = path[1]; const e2 = n0.edges.find((e) => (e.n0 === n0 && e.n1 === n1) || (e.n1 === n0 && e.n0 === n1));
        if (e2) { const s0 = e2.n0 === n0 ? 0 : e2.L, s1 = e2.n0 === n0 ? e2.L : 0; const p = pointAt(e2, s0 + Math.sign(s1 - s0) * Math.min(e2.L, 35)); return new THREE.Vector3(p.x, 0, p.z); }
      }
    }
    if (Math.hypot(n0.x - v.x, n0.z - v.z) > 14) return new THREE.Vector3(n0.x, 0, n0.z);
    return new THREE.Vector3(tx, 0, tz);
  }
}
