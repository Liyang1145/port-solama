// a_lane8fix (map 索拉纳港 only): collider fit pass, run once after every layer has been placed (main.js, after buildBacklot).
// Builders keep registering their legacy box while they place things (so every later layer's free-space checks, and with them the
// whole street layout, stay exactly as before); a box that carries `fit` is swapped here for the boxes that follow its visible
// geometry (`fit` = [[minX, minZ, maxX, maxZ, h], ...], same tag; an empty list = orphan box with nothing visible, removed).
// Found by the sidewalk / service-lane census (2 m player-start grid, 4 × 3 m walks) and a per-box visible-geometry audit.
export function applyColliderFits(city) {
  const col = city.col; const stat = { swapped: 0, removed: 0, added: 0, byTag: {} };
  for (const b of col.boxes.filter((q) => q.fit)) {
    col.remove(b); const t = stat.byTag[b.tag] || (stat.byTag[b.tag] = { boxes: 0, removed: 0, added: 0 }); t.boxes++;
    if (!b.fit.length) { stat.removed++; t.removed++; continue; }
    for (const [x0, z0, x1, z1, h] of b.fit) { col.add(x0, z0, x1, z1, h, b.tag); stat.added++; t.added++; }
    stat.swapped++;
  }
  city.colfix = stat; return stat;
}
