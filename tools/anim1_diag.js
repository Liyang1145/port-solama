(() => { const G = __G, g = G.game, c = g.player; g.tp(280.5, 36, Math.PI); G.step(60, 1 / 60); c.root.updateMatrixWorld(true);
  const y = (n) => { const b = c.model.getObjectByName(n); return b ? +b.getWorldPosition(new c.pos.constructor()).y.toFixed(3) : null; };
  const names = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightFoot', 'RightToeBase'];
  const o = { posY: c.pos.y, modelY: c.model.position.y, modelRot: c.model.rotation.toArray().slice(0, 3), scale: c.P.scale, rootS: c.root.scale.x, cal: { ank: c.P.cal.__ank, idleLift: c.P.cal.idle.lift, walkLift: c.P.cal.walk && c.P.cal.walk.lift }, drop: c._rg && c._rg.drop, lift: c.lift };
  for (const n of names) o[n] = y(n); o.cal2 = { ank: c.P.cal.__ank, toe: c.P.cal.__toe };
  if (c._rg) o.feet = c._rg.feet.map((f) => ({ off: f.off, sole: f.sole, Ay: f.Ay, gy: f.gy, locked: f.locked, lw: f.lw, step: f.step })), o.rg = { roll: c._rg.roll, pitch: c._rg.pitch, drop: c._rg.drop };
  const kids = []; c.model.getObjectByName('LeftFoot').traverse((b) => kids.push(b.name)); o.footKids = kids;
  // lowest skinned vertex near the feet (bounding box of the shoe meshes)
  let lo = 1e9; c.model.traverse((m) => { if (m.isSkinnedMesh && /shoe|boot|feet|foot|sneak/i.test(m.name + m.material.name)) { const p = m.geometry.attributes.position; const v = new c.pos.constructor(); for (let i = 0; i < p.count; i += 7) { m.getVertexPosition(i, v); m.localToWorld(v); lo = Math.min(lo, v.y); } } });
  o.shoeLowY = lo; const mats = []; c.model.traverse((m) => { if (m.isSkinnedMesh) mats.push(m.name + '/' + m.material.name); }); o.meshes = mats.slice(0, 40);
  return o; })()
