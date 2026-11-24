// anim2 perf: Character.update cost per frame (player + ~30 NPCs around it) for idle / run / crouch-walk / punch combo, plus the
// one-off UAL retarget cost (window.__UAL_ST). Run with anim1probe.cjs MODE=perf2, V="new=;old=olduanim".
(() => { const G = __G, g = G.game; g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  const P = g.peds; const near = g.P.pos; let made = 0;
  for (let t = 0; t < 400 && made < 30; t++) { const c = P.spawn(near, 2, 16); if (c) made++; }
  const CU = g.player.constructor.prototype; const orig = CU.update; let upMs = 0, upN = 0, plMs = 0;
  CU.update = function (dt) { const t0 = performance.now(); orig.call(this, dt); const d = performance.now() - t0; upMs += d; upN++; if (this === g.player) plMs += d; };
  const res = {}; g.arsenal.equip('fist');
  const SC = [['idle', () => ({ mx: 0, mz: 0 })], ['run', () => ({ mx: 1, mz: 1 })], ['crouchwalk', () => ({ mx: 0, mz: 1, crouch: true })], ['punch', (i) => ({ mx: 0, mz: 0, crouch: false, fire: i % 30 === 0 ? 'edge' : false })]];
  for (const [name, inp] of SC) {
    for (let i = 0; i < 60; i++) { g.override = inp(i); G.step(1, 1 / 60); }
    upMs = 0; upN = 0; plMs = 0; const T0 = performance.now(); const N = 240;
    for (let i = 0; i < N; i++) { g.override = inp(i); G.step(1, 1 / 60); }
    res[name] = { charUpdateMsPerFrame: +(upMs / N).toFixed(3), playerMsPerFrame: +(plMs / N).toFixed(3), charUpdatesPerFrame: +(upN / N).toFixed(1), stepMsPerFrame: +((performance.now() - T0) / N).toFixed(2) };
  }
  CU.update = orig; g.override = null; res.made = made; res.ual = window.__UAL_ST ? { ...window.__UAL_ST } : null;
  return res; })()
