// anim3: NPC foot sliding per rig tier. Walkers spawned 2-40 m around the player (camera behind the player), 360 frames at 1/60 s.
// tiers: full (player-like layer: LOD0 & < 12 m), feet (LOD0 >= 12 m), lod1 (20-50 m). Per tier:
//   slideCmPerContact = planted-foot path length / contacts (anim1/2 metric: includes 1-frame jitter of skipped mixer frames)
//   driftCmPerContact = |foot position at lift - position at touch-down| per finished contact (the visible skate)
// plus Character.update ms per frame for all characters (perf).
(() => { const G = __G, g = G.game, A = __AP; G.setHour(13); g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  const P = g.peds; let made = 0; const R0 = +(window.__NPC_R0 || 2), R1 = +(window.__NPC_R1 || 40);
  for (let t = 0; t < 800 && made < 34; t++) { const c = P.spawn(g.P.pos, R0, R1); if (c) { made++; if (c.ai) c.ai.wait = 0; } }
  G.step(60, 1 / 60);
  const CU = g.player.constructor.prototype; const orig = CU.update; let upMs = 0;
  CU.update = function (dt) { const t0 = performance.now(); orig.call(this, dt); upMs += performance.now() - t0; };
  const prev = new Map(); const mk = () => ({ slide: 0, contacts: 0, frames: 0, pl: 0, drift: 0, done: 0, npcs: new Set() }); const acc = { full: mk(), feet: mk(), lod1: mk() };
  const N = 360;
  for (let i = 0; i < N; i++) { g.override = { mx: 0, mz: 0 }; G.step(1, 1 / 60);
    for (const c of P.list) { if (c.dead || !c.model.visible || c.lod > 1 || c.speed < 0.3) { prev.delete(c); continue; }
      const k = c.lod === 1 ? 'lod1' : (c._camD ?? 99) < 12 ? 'full' : 'feet'; const r = acc[k]; r.frames++; r.npcs.add(c);
      const F = { L: A.foot(c, 'Left'), R: A.foot(c, 'Right') }; const pv = prev.get(c) || {};
      for (const s of ['L', 'R']) { const f = F[s], p = pv[s]; const pl = f.sole - f.gy < 0.03;
        if (pl && p && p.pl && p.k === k) { r.slide += Math.hypot(f.x - p.x, f.z - p.z); r.pl += 1 / 60; f.sx = p.sx; f.sz = p.sz; }
        else if (pl) { r.contacts++; f.sx = f.x; f.sz = f.z; }
        if (!pl && p && p.pl && p.k === k && p.sx !== undefined) { r.drift += Math.hypot(p.x - p.sx, p.z - p.sz); r.done++; }
        f.pl = pl; f.k = k; }
      prev.set(c, F); } }
  CU.update = orig; g.override = null; const o = { made, charUpdateMsPerFrame: +(upMs / N).toFixed(3), arig: window.__ARIG_ST ? { ...window.__ARIG_ST } : null };
  for (const k in acc) { const r = acc[k]; o[k] = { npcs: r.npcs.size, npcFrames: r.frames, contacts: r.contacts, slideCmPerContact: +(r.slide * 100 / Math.max(1, r.contacts)).toFixed(2), slideCmPerS: +(r.slide * 100 / Math.max(0.01, r.pl)).toFixed(2), driftCmPerContact: +(r.drift * 100 / Math.max(1, r.done)).toFixed(2), finished: r.done }; }
  return o; })()
