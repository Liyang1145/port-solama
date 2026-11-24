(() => { const G = __G, g = G.game, A = __AP; G.setHour(13);
  // a ramp: scan the map for a steady 5-30 % grade on dry land
  let ramp = null; const gh = A.gh;
  for (let x = -1200; x < 700 && !ramp; x += 4) for (let z = -700; z < 700 && !ramp; z += 4) { const a = gh(x, z); if (!(a > 0.2)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) { const h = []; for (let k = -4; k <= 4; k++) h.push(gh(x + dx * k, z + dz * k)); const s = (h[8] - h[0]) / 8; if (Math.abs(s) < 0.05 || Math.abs(s) > 0.3) continue;
      let lin = true; for (let k = 0; k < 9; k++) if (Math.abs(h[k] - (h[0] + s * k)) > 0.04) lin = false;
      if (lin && !g.city.col.resolve(x, z, 0.4, a + 0.5).hit) { ramp = { x, z, yaw: Math.atan2(dx * Math.sign(s), dz * Math.sign(s)), s: +s.toFixed(3) }; break; } } }
  const out = { ramp }; const R = (n, steps, f) => { out[n] = A.run(n, steps, f); };
  const idle = { mx: 0, mz: 0 }, fw = { mx: 0, mz: 1 };
  g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  R('start_stop', 240, (i) => (i < 30 ? idle : i < 120 ? fw : idle));
  g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  R('sprint_stop', 220, (i) => (i < 20 ? idle : i < 150 ? { mx: 0, mz: 1, sprint: true } : idle));
  g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  R('turn180', 200, (i) => (i < 20 ? idle : i < 110 ? { mx: 0, mz: -1 } : idle));
  g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  R('circle', 300, () => ({ mx: 1, mz: 1 }));
  g.tp(152, -9.5, 0); G.step(30, 1 / 60);
  R('kerb_down_up', 300, (i) => (i < 60 ? { mx: 0, mz: 0.4 } : i < 120 ? idle : i < 200 ? { mx: 0, mz: -0.4 } : idle));
  if (ramp) { g.tp(ramp.x - Math.sin(ramp.yaw) * 4, ramp.z - Math.cos(ramp.yaw) * 4, ramp.yaw); G.step(30, 1 / 60); R('ramp', 160, (i) => (i < 100 ? fw : idle)); }
  g.tp(280.5, 36, Math.PI); G.step(30, 1 / 60);
  R('idle', 240, () => idle);
  for (const k in out) if (out[k] && out[k].track) out[k].track = out[k].track.slice(0, 50);
  out.arig = window.__ARIG_ST ? { ...window.__ARIG_ST } : null;
  return out; })()
