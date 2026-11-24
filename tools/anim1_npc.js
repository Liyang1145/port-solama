// anim2 (anim1 leftover): NPC foot sliding. Spawns walkers around the player (camera at the player), steps 360 frames, and per NPC
// with a full rig layer (LOD0 and < 12 m from the camera) or lean-only (other LOD0/1) sums planted-foot travel per contact.
(() => { const G = __G, g = G.game, A = __AP; G.setHour(13); g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  const P = g.peds; let made = 0; for (let t = 0; t < 500 && made < 30; t++) { const c = P.spawn(g.P.pos, 2, 14); if (c) { made++; if (c.ai) c.ai.wait = 0; } }
  G.step(60, 1 / 60); const prev = new Map(); const acc = { full: { slide: 0, contacts: 0, frames: 0, pl: 0 }, lean: { slide: 0, contacts: 0, frames: 0, pl: 0 } }; const per = [];
  for (let i = 0; i < 360; i++) { g.override = { mx: 0, mz: 0 }; G.step(1, 1 / 60);
    for (const c of P.list) { if (c.dead || !c.model.visible || c.lod > 1 || c.speed < 0.3) { prev.delete(c); continue; }
      const k = c.lod === 0 && (c._camD ?? 99) < 12 ? 'full' : 'lean'; const r = acc[k]; r.frames++;
      const F = { L: A.foot(c, 'Left'), R: A.foot(c, 'Right') }; const pv = prev.get(c) || {};
      for (const s of ['L', 'R']) { const f = F[s], p = pv[s]; const pl = f.sole - f.gy < 0.03; if (pl && p && p.pl && p.k === k) { r.slide += Math.hypot(f.x - p.x, f.z - p.z); r.pl += 1 / 60; } else if (pl) r.contacts++; f.pl = pl; f.k = k; }
      prev.set(c, F); } }
  g.override = null; const o = { made };
  for (const k in acc) { const r = acc[k]; o[k] = { npcFrames: r.frames, contacts: r.contacts, slideCmPerContact: +(r.slide * 100 / Math.max(1, r.contacts)).toFixed(2), slideCmPerS: +(r.slide * 100 / Math.max(0.01, r.pl)).toFixed(2) }; }
  return o; })()
