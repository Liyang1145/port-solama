(i) => { const G = __G, R = G.renderer, T = G.THREE, cam = G.camera, out = { i };
  G.render(); out.g0 = __green();
  const roads = [], lands = []; G.scene.traverse((o) => { if (o.isMesh && /^road\|/.test(o.name)) roads.push(o); if (o.isMesh && /^land\|/.test(o.name)) lands.push(o); });
  const rm = roads[0].material, lm = lands[0].material;
  const rc = new T.Raycaster(); out.hits = [];
  for (const [px, py] of [[240, 255], [120, 240], [240, 225]]) { rc.setFromCamera(new T.Vector2(px / 480 * 2 - 1, 1 - py / 270 * 2), cam);
    for (const set of [roads, lands]) { const h = rc.intersectObjects(set, false)[0]; if (!h) { out.hits.push([px, py, 'none']); continue; }
      const g = h.object.geometry, P = g.attributes.position; const vs = [h.face.a, h.face.b, h.face.c].map((k) => { const v = new T.Vector3().fromBufferAttribute(P, k).applyMatrix4(h.object.matrixWorld); const c = v.clone().applyMatrix4(cam.matrixWorldInverse); return { w: v.toArray().map((x) => +x.toFixed(2)), vz: +c.z.toFixed(2) }; });
      out.hits.push([px, py, h.object.name, +h.distance.toFixed(2), h.point.toArray().map((x) => +x.toFixed(2)), vs, g.index ? g.index.count / 3 : P.count / 3]); } }
  const tv = (name, on, off) => { on(); G.render(); out[name] = __green(); off(); };
  tv('roadPO40', () => { rm.polygonOffsetUnits = -40; }, () => { rm.polygonOffsetUnits = -4; });
  tv('landDown10cm', () => { lands.forEach((o) => { o.position.y -= 0.1; o.updateMatrixWorld(); }); }, () => { lands.forEach((o) => { o.position.y += 0.1; o.updateMatrixWorld(); }); });
  tv('landDown50cm', () => { lands.forEach((o) => { o.position.y -= 0.5; o.updateMatrixWorld(); }); }, () => { lands.forEach((o) => { o.position.y += 0.5; o.updateMatrixWorld(); }); });
  tv('near05', () => { cam.near = 0.5; cam.updateProjectionMatrix(); }, () => { cam.near = 0.1; cam.updateProjectionMatrix(); });
  tv('landPOpush', () => { lm.polygonOffset = true; lm.polygonOffsetFactor = 1; lm.polygonOffsetUnits = 4; }, () => { lm.polygonOffset = false; lm.polygonOffsetFactor = 0; lm.polygonOffsetUnits = 0; });
  tv('roadNoPO', () => { rm.polygonOffset = false; }, () => { rm.polygonOffset = true; });
  out.g9 = (G.render(), __green());
  return out; }
