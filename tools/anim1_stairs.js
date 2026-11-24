// anim2 (anim1 leftover): stairs. Scans the map ground for a flight of steps (>= 3 rises of 6-25 cm within 2.5 m on a straight line),
// then walks the player up and down it measuring sole penetration / hover / planted-foot slide (same metrics as anim1_measure.js).
(() => { const G = __G, g = G.game, A = __AP; G.setHour(13); const gh = A.gh; let best = null;
  for (let x = -700; x < 700 && !best; x += 3) for (let z = -600; z < 600 && !best; z += 3) { const a = gh(x, z); if (!(a > 0.05)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { let rises = 0, flat = true, prevH = a, maxR = 0; for (let k = 1; k <= 25; k++) { const h = gh(x + dx * k * 0.1, z + dz * k * 0.1); const d = h - prevH; if (d > 0.06 && d < 0.26) { rises++; maxR = Math.max(maxR, d); } else if (Math.abs(d) > 0.03) { flat = false; break; } prevH = h; }
      if (flat && rises >= 3 && !g.city.col.resolve(x, z, 0.4, a + 0.5).hit && !g.city.col.resolve(x + dx * 2.5, z + dz * 2.5, 0.4, prevH + 0.5).hit) { best = { x, z, yaw: Math.atan2(dx, dz), rises, maxR: +maxR.toFixed(3), h0: +a.toFixed(2), h1: +prevH.toFixed(2) }; break; } } }
  const out = { stairs: best }; if (!best) return out;
  const fw = { mx: 0, mz: 0.45 }, idle = { mx: 0, mz: 0 };
  g.tp(best.x - Math.sin(best.yaw) * 1.5, best.z - Math.cos(best.yaw) * 1.5, best.yaw); G.step(30, 1 / 60);
  out.up = A.run('stairs_up', 200, (i) => (i < 140 ? fw : idle)); out.upEnd = [+g.P.pos.x.toFixed(2), +g.P.pos.y.toFixed(2), +g.P.pos.z.toFixed(2)];
  g.tp(best.x + Math.sin(best.yaw) * 4, best.z + Math.cos(best.yaw) * 4, best.yaw + Math.PI); G.step(30, 1 / 60);
  out.down = A.run('stairs_down', 200, (i) => (i < 140 ? fw : idle)); out.downEnd = [+g.P.pos.x.toFixed(2), +g.P.pos.y.toFixed(2), +g.P.pos.z.toFixed(2)];
  for (const k of ['up', 'down']) if (out[k]) out[k].track = out[k].track.slice(0, 30);
  window.__STAIRS = best; return out; })()
