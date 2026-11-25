// anim3: low collider census (vault candidates): boxes whose top is 0.5-1.2 m above the ground under them
(() => { const G = __G, g = G.game, col = g.city.col, gh = (x, z) => g.city.groundH(x, z); const tags = {}; const near = [];
  const P = g.P.pos;
  for (const b of col.boxes) { const cx = b.o ? b.o.cx : (b.minX + b.maxX) / 2, cz = b.o ? b.o.cz : (b.minZ + b.maxZ) / 2; const gy = gh(cx, cz); const hh = b.h - gy;
    const thin = b.o ? Math.min(b.o.hl, b.o.hw) * 2 : Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
    const k = b.tag + (hh < 0.5 ? '<0.5' : hh <= 1.2 ? ' 0.5-1.2' : '>1.2'); tags[k] = (tags[k] || 0) + 1;
    if (hh >= 0.45 && hh <= 1.25 && thin < 1.3) near.push([Math.hypot(cx - P.x, cz - P.z) | 0, b.tag, +cx.toFixed(1), +cz.toFixed(1), +hh.toFixed(2), +thin.toFixed(2), b.o ? +Math.atan2(b.o.ux, b.o.uz).toFixed(2) : null, b.o ? +(b.o.hl*2).toFixed(1) : +(Math.max(b.maxX - b.minX, b.maxZ - b.minZ)).toFixed(1)]); }
  near.sort((a, b) => a[0] - b[0]);
  return { n: col.boxes.length, tags, near: near.slice(0, 60), p: [P.x, P.y, P.z] }; })()
