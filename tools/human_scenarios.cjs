// perf_debug1: the "real player" scenarios for tools/human.cjs. Every action is a real key / mouse event; the page is only
// READ to decide which key a human would press next (where the car is, where the GPS points).
module.exports = ({ key, hold, look, run, ev, st, p, W, H, MAPN, log }) => {
  const sleepF = (n, re) => run(n, re);
  const pose = () => ev(`(() => { const g = __G.game, P = g.P, v = P.car; return { x: v ? v.x : P.pos.x, z: v ? v.z : P.pos.z, yaw: v ? v.yaw : P.yaw, camYaw: g.cam.yaw, speed: v ? v.speed : g.playerSpeed || 0, inCar: !!v, onFoot: P.onFoot }; })()`);
  // turn the camera with real mouse moves until it looks at (x,z) (camera forward yaw = cam.yaw + PI)
  const face = async (x, z) => { for (let i = 0; i < 6; i++) { const s = await pose(); const want = Math.atan2(x - s.x, z - s.z); let d = want - (s.camYaw + Math.PI); d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < 0.05) return; const px = -d / 0.0024; await look(Math.max(-40, Math.min(40, px / 6)), 0, 6); } };
  // walk to (x,z) like a player: aim the camera, hold W (+Shift), re-aim every half second
  const walkTo = async (x, z, { sprint = false, maxF = 900, stop = 1.2 } = {}) => { let f = 0; let s = await pose(); let last = [s.x, s.z]; let stuck = 0; let side = 0;
    while (f < maxF) { s = await pose(); const dd = Math.hypot(x - s.x, z - s.z); if (dd < stop) break; await face(x, z); await key.down('KeyW'); const near = dd < 6; if (sprint && !near) await key.down('ShiftLeft'); else await key.up('ShiftLeft'); const nf = near ? 3 : 15; await run(nf); f += nf;
      const n = await pose(); if (Math.hypot(n.x - last[0], n.z - last[1]) < 0.2) stuck++; else stuck = 0; last = [n.x, n.z];
      if (stuck >= 2 && side < 6) { side++; const k = side % 2 ? 'KeyD' : 'KeyA'; await key.down(k); await run(12 + side * 4); await key.up(k); f += 12 + side * 4; stuck = 0; } // blocked: sidestep like a player
      if (stuck > 4) break; }
    await key.up('KeyW'); await key.up('ShiftLeft'); const e = await pose(); return { dist: +Math.hypot(x - e.x, z - e.z).toFixed(1), frames: f, stuck: stuck > 4, sidesteps: side }; };
  // drive along waypoints with W/S/A/D only (a keyboard player steers bang-bang)
  const driveTo = async (pts, { maxF = 1800, vmax = 16, reach = 7 } = {}) => { let i = 0, f = 0; const held = new Set(); const set = async (k, on) => { if (on && !held.has(k)) { await key.down(k); held.add(k); } else if (!on && held.has(k)) { await key.up(k); held.delete(k); } };
    let crashes = 0, lastSp = 0;
    while (i < pts.length && f < maxF) { const s = await pose(); if (!s.inCar) break; const [tx, tz] = pts[i]; if (Math.hypot(tx - s.x, tz - s.z) < reach) { i++; continue; }
      let a = Math.atan2(tx - s.x, tz - s.z) - s.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); const sp = s.speed;
      if (lastSp - sp > 6) crashes++; lastSp = sp;
      const slow = Math.abs(a) > 0.6 ? 7 : vmax; await set('KeyW', sp < slow); await set('KeyS', sp > slow + 4); await set('KeyA', a > 0.07); await set('KeyD', a < -0.07); await run(3); f += 3; }
    for (const k of [...held]) await set(k, false); return { reached: i, of: pts.length, frames: f, crashes }; };
  const route = (tx, tz) => ev(`(() => { const s = __G.game.P.car || __G.game.P.pos; const x = s.x, z = s.z; let pts = []; try { const v = { x, z }; const T = __G.game.traffic; if (__G.city.graph && T.waypoint) { T.waypoint(v, ${tx}, ${tz}); pts = ((v._route && v._route.path) || []).map((n) => [n.x, n.z]); } } catch (e) { } pts.push([${tx}, ${tz}]); return pts; })()`);
  const S = {};
  S.walk = async () => { const r = {}; const s0 = await pose();
    await hold(['KeyW'], 90); const s1 = await pose(); r.walk3s = +Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1);
    await hold(['KeyS'], 30); await face(300, 30); // the spawn faces a palm trunk + cafe terrace pocket: back off and head for the open road like a player would
    await hold(['KeyW', 'ShiftLeft'], 120); const s2 = await pose(); r.sprint4s = +Math.hypot(s2.x - s1.x, s2.z - s1.z).toFixed(1);
    await key.down('KeyW'); const ys = []; for (let j = 0; j < 3; j++) { await key.tap('Space', 1); for (let q = 0; q < 6; q++) { await run(3); ys.push(await ev('+__G.game.P.pos.y.toFixed(2)')); } } await key.up('KeyW'); r.jumpPeakY = Math.max(...ys);
    await key.down('KeyW'); await look(10, 0, 120); await look(-14, 2, 60); await look(0, -3, 30); await key.up('KeyW'); // walk while sweeping the camera
    await key.down('KeyA'); await run(30); await key.up('KeyA'); await key.down('KeyS'); await run(30); await key.up('KeyS');
    r.state = await st(); return r; };
  S.car = async () => { const r = {}; const c = await ev(`(() => { const g = __G.game; const v = g.parked || g.nearestCar(40); return v ? [v.x, v.z] : null; })()`); r.target = c;
    r.walk = await walkTo(c[0] - 2.2, c[1], { stop: 1.6 }); await key.tap('KeyF', 2); await run(10); r.inCarAfterF = (await pose()).inCar;
    if (!r.inCarAfterF) { await key.tap('KeyF', 2); await run(20); r.inCarAfter2ndF = (await pose()).inCar; }
    if (!(await pose()).inCar) return r;
    await hold(['KeyW'], 150); r.kmhAfter5s = (await st()).speedKmh; // full throttle
    await hold(['KeyW', 'KeyA'], 45); await hold(['KeyW', 'KeyD'], 45); await hold(['KeyW', 'KeyD', 'Space'], 30); r.kmhAfterTurns = (await st()).speedKmh; // hard turns + handbrake
    await hold(['KeyS'], 60); await hold(['KeyS'], 90); r.kmhReverse = (await st()).speedKmh; // brake then reverse
    // ram the nearest traffic car, then a wall (keep throttle into whatever is ahead)
    const tgt = await ev(`(() => { const g = __G.game, v = g.P.car; let b = null, bd = 1e9; for (const c of g.traffic.cars) { if (c === v) continue; const d = Math.hypot(c.x - v.x, c.z - v.z); if (d < bd) { bd = d; b = c; } } return b ? [b.x, b.z, Math.round(bd)] : null; })()`);
    r.ramTarget = tgt; const h0 = await ev('__G.game.P.car.health');
    if (tgt && tgt[2] < 120) r.ram = await driveTo([[tgt[0], tgt[1]]], { maxF: 300, vmax: 18, reach: 1 });
    await hold(['KeyW'], 120); r.carHealth = [h0, await ev('Math.round(__G.game.P.car ? __G.game.P.car.health : -1)')];
    await hold(['KeyS'], 30); await key.tap('KeyF', 2); await run(20); r.onFootAfterF = (await pose()).onFoot;
    r.state = await st(); return r; };
  S.guns = async () => { const r = {}; await ev('__G.game.arsenal.give && (__G.game.arsenal.give("smg", 120), __G.game.arsenal.give("rifle", 90), __G.game.arsenal.give("shotgun", 24))'); // a player who already bought guns
    await key.tap('Digit3'); r.w1 = (await st()).weapon; await p.mouse.down({ button: 'right' }); await run(10);
    for (let i = 0; i < 6; i++) { await p.mouse.down(); await run(2); await p.mouse.up(); await run(8); }
    r.pistolClip = (await st()).clip; await key.tap('KeyR'); await run(50); r.afterReload = (await st()).clip;
    await key.tap('Digit4'); r.w2 = (await st()).weapon; await p.mouse.down(); await look(4, 0, 45); await p.mouse.up(); r.smgClip = (await st()).clip;
    await p.mouse.up({ button: 'right' });
    await p.mouse.wheel(0, 120); await run(4); r.wheelNext = (await st()).weapon; await p.mouse.wheel(0, -120); await run(4);
    await key.down('KeyQ'); await run(6); await look(-12, -6, 9); await key.up('KeyQ'); await run(4); r.wheelPick = (await st()).weapon;
    await key.tap('Digit6'); await p.mouse.down(); await run(30); await p.mouse.up(); r.rifle = (await st()).clip;
    await key.tap('Digit1'); r.fist = (await st()).weapon; r.wanted = (await st()).wanted; await ev('__G.game.wanted = 0');
    return r; };
  S.mission = async () => { const r = {}; await ev('__G.game.wanted = 0; __G.game.mission.cool = 0');
    r.walk = await walkTo(281, 10.5, { sprint: true, stop: 0.8 }); await run(10); r.s1 = await ev('__G.game.mission.state'); r.obj = await ev('(__G.game.mission.el||{}).textContent');
    if (r.s1 !== 'pickup') return r;
    const gc = await ev('[__G.game.mission.car.x, __G.game.mission.car.z]'); r.walkCar = await walkTo(gc[0] - 2.2, gc[1], { stop: 1.4 }); await key.tap('KeyF', 2); await run(15); r.s2 = await ev('__G.game.mission.state');
    if (r.s2 !== 'drive') return r;
    const t = await ev('__G.game.mission.target'); r.target = t.name; const pts = await route(t.x, t.z); r.routePts = pts.length;
    r.drive = await driveTo(pts, { maxF: 2400, vmax: 15, reach: 6 }); await hold(['KeyS'], 30); await run(40); r.s3 = await ev('__G.game.mission.state'); r.log = await ev('__G.game.mission.log.slice(-1)');
    if ((await pose()).inCar) { await key.tap('KeyF', 2); await run(10); }
    return r; };
  S.menus = async () => { const r = {}; await key.tap('KeyI'); r.phone = await ev('__G.game.world.phoneOpen'); await key.tap('ArrowDown'); await key.tap('ArrowDown'); await key.tap('Enter'); await run(10); r.page = await ev('__G.game.world.phonePage');
    await key.tap('Backspace'); await key.tap('Escape'); r.phoneClosed = !(await ev('__G.game.world.phoneOpen'));
    await key.tap('KeyM'); await run(30); r.bigMap = await ev('__G.game.hud.bigMap'); await key.tap('KeyM'); r.bigMapOff = !(await ev('__G.game.hud.bigMap'));
    const pos0 = await pose(); await key.tap('Escape'); await key.down('KeyW'); await run(30); await key.up('KeyW'); const pos1 = await pose(); r.escapePausesGame = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z) < 0.05; // is there a pause menu?
    await key.tap('KeyV'); r.camMode = await ev('__G.game.cam.mode'); await key.tap('KeyV');
    return r; };
  S.daynight = async () => { const r = { hours: [] }; for (let i = 0; i < 8; i++) { const t0 = Date.now(); await key.tap('KeyT', 1); await run(20); r.hours.push([+(await ev('__G.hour')).toFixed(1), Date.now() - t0]); } return r; };
  // ~3 minutes of mixed play (5400 frames): walk + sprint + look, take a car, drive the GPS route to a far point, crash, exit, shoot
  S.session3min = async () => { const r = {}; const F0 = await ev('__mark()');
    await key.down('KeyW'); await key.down('ShiftLeft'); await look(6, 0, 300); await key.up('ShiftLeft'); await look(-6, 1, 300); await key.up('KeyW');
    const c = await ev(`(() => { const g = __G.game, P = g.P; let b = null, bd = 1e9; for (const v of g.traffic.cars) { const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z); if (d < bd && !v.ai) { bd = d; b = v; } } if (!b) for (const v of g.traffic.cars) { const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z); if (d < bd) { bd = d; b = v; } } return [b.x, b.z, Math.round(bd)]; })()`); r.car = c;
    r.walk = await walkTo(c[0] - 2.2, c[1], { sprint: true, stop: 1.6, maxF: 900 }); await key.tap('KeyF', 2); await run(20); r.inCar = (await pose()).inCar;
    if (!r.inCar) { await ev('__G.game.carNearPlayer && __G.game.carNearPlayer("sport", 3)'); await run(2); await key.tap('KeyF', 2); await run(20); r.inCar2 = (await pose()).inCar; }
    const dst = MAPN === 'gta' ? [59.5, -225] : [-300, -60]; const pts = await route(dst[0], dst[1]); r.routePts = pts.length;
    r.drive = await driveTo(pts, { maxF: 2700, vmax: 20, reach: 7 });
    await hold(['KeyS'], 45); await key.tap('KeyF', 2); await run(15);
    await key.tap('Digit3'); await p.mouse.down({ button: 'right' }); for (let i = 0; i < 8; i++) { await p.mouse.down(); await run(2); await p.mouse.up(); await look(3, 0, 6); } await p.mouse.up({ button: 'right' });
    await ev('__G.game.wanted = 0');
    const used = (await ev('__mark()')) - F0; if (used < 5400) { await key.down('KeyW'); await look(5, 0, Math.max(0, 5400 - used)); await key.up('KeyW'); }
    r.frames = (await ev('__mark()')) - F0; r.state = await st(); return r; };
  return S;
};
