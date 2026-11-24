(() => { const g = __G.game; const gh = (x, z) => g.city.groundH(x, z); const steps = [], slopes = [];
  for (let x = 150; x < 330; x += 0.5) for (let z = -60; z < 200; z += 0.5) { const a = gh(x, z), b = gh(x + 0.5, z), c = gh(x, z + 0.5);
    if (!(a > -0.5)) continue; const d1 = Math.abs(b - a), d2 = Math.abs(c - a);
    if ((d1 > 0.09 && d1 < 0.3) || (d2 > 0.09 && d2 < 0.3)) { if (steps.length < 40) steps.push([x, z, +a.toFixed(3), +b.toFixed(3), +c.toFixed(3)]); }
    const s = Math.max(Math.abs(gh(x + 2, z) - gh(x - 2, z)) / 4, Math.abs(gh(x, z + 2) - gh(x, z - 2)) / 4); if (s > 0.06 && s < 0.35 && Math.abs(gh(x + 1, z) - gh(x - 1, z) - (gh(x + 2, z) - gh(x - 2, z)) / 2) < 0.02 && slopes.length < 40) slopes.push([x, z, +s.toFixed(3), +a.toFixed(2)]); }
  return { spawn: [g.P.pos.x, g.P.pos.y, g.P.pos.z], steps, slopes }; })()
