(() => { const G = __G, g = G.game, c = g.player, A = __AP; const o = {};
  const dump = (tag) => { const R = c._rg; const F = { L: A.foot(c, 'Left'), R: A.foot(c, 'Right') }; o[tag] = { pos: c.pos.toArray().map((v) => +v.toFixed(3)), sp: +c.speed.toFixed(2), my: +c.model.position.y.toFixed(3), mrot: c.model.rotation.toArray().slice(0, 3).map((v) => +(+v).toFixed(3)), R: R && { roll: +R.roll.toFixed(3), pitch: +R.pitch.toFixed(3), drop: +R.drop.toFixed(3), slope: +R.slope.toFixed(3), acc: +R.acc.toFixed(2) },
    feet: R && R.feet.map((f) => ({ off: +f.off.toFixed(3), clr: +(f.sole - c.pos.y).toFixed(3), locked: f.locked, lw: +f.lw.toFixed(2), step: +f.step.toFixed(2), lock: [+f.lock.x.toFixed(2), +f.lock.z.toFixed(2)] })), meas: [+(F.L.sole - F.L.gy).toFixed(3), +(F.R.sole - F.R.gy).toFixed(3)], var: c.var, aimW: c.aimW, pivot: g.P.pivot, hasOut: R && R.hasOut, full: R && R.full, hips: +c.model.getObjectByName('Hips').getWorldPosition(c.pos.clone()).y.toFixed(3), lfoot: +c.model.getObjectByName('LeftFoot').getWorldPosition(c.pos.clone()).y.toFixed(3), lknee: +c.model.getObjectByName('LeftLeg').getWorldPosition(c.pos.clone()).y.toFixed(3), mt: c.mixer.time, wts: Object.fromEntries(Object.entries(c.A).map(([k, a]) => [k, +a.weight.toFixed(2)]).filter((e) => e[1] > 0)) }; };
  g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60); dump('a_idle');
  A.run('x', 130, (i) => (i < 20 ? { mx: 0, mz: 0 } : i < 110 ? { mx: 0, mz: 1, sprint: true } : { mx: 0, mz: 0 })); dump('b_after_sprint20');
  G.step(60, 1 / 60); dump('c_after_1s');
  g.override = { mx: 0, mz: 0 }; G.step(120, 1 / 60); dump('d_after_3s'); g.override = null;
  g.tp(280.5, 36, Math.PI); G.step(1, 1 / 60); dump('e_tp1'); G.step(60, 1 / 60); dump('e_tp');
  return o; })()
