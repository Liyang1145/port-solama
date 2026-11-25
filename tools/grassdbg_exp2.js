(i) => { const G = __G, R = G.renderer, gl = R.getContext(), out = { i };
  const nm = (o, m) => (o.name || o.type) + ':' + (m && (m.name || (m.userData && m.userData.prepKey) || m.type)) + (o.parent ? '<' + (o.parent.name || o.parent.type) : '');
  G.render(); out.g0 = __green();
  // per-draw pixel tracker in the main HDR target (pixel columns at the bottom)
  const PX = [[240, 15], [120, 30], [360, 30], [240, 45]]; let cur = null, main = null; const rbd = R.renderBufferDirect; const ev = [];
  R.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) { cur = { o: obj, m: mat, cam, rt: R.getRenderTarget() }; return rbd.apply(this, arguments); };
  const last = PX.map(() => null); const buf = new Float32Array(4), bu8 = new Uint8Array(4);
  const rd = (x, y) => { try { gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, buf); return Array.from(buf).map((v) => +v.toFixed(3)); } catch (e) { return 'err'; } };
  const K = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'];
  K.forEach((k) => { const f = gl[k]; gl['__' + k] = f; gl[k] = function () { const c = cur; cur = null; const r = f.apply(this, arguments);
    if (c && c.cam.isPerspectiveCamera && c.rt && c.rt.width === 480 && !c.cam.isCubeCamera) { if (!main) main = c.rt; if (c.rt === main) { PX.forEach(([x, y], j) => { const v = rd(x, y); const s = JSON.stringify(v); if (s !== last[j]) { last[j] = s; ev.push({ px: j, n: nm(c.o, c.m), id: c.o.id, v, inst: c.o.isInstancedMesh ? c.o.count : undefined }); } }); } }
    return r; }; });
  out.err0 = gl.getError(); G.render(); out.g1 = __green(); out.err1 = gl.getError();
  K.forEach((k) => { gl[k] = gl['__' + k]; }); R.renderBufferDirect = rbd; out.ev = ev; out.samples = main && main.samples;
  // hide tests (same frame state)
  const groups = { grassCap: (o) => /^grass\|/.test(o.name), land: (o) => /^land\|/.test(o.name), road: (o) => /^road\|/.test(o.name) };
  out.hide = {};
  for (const [k, f] of Object.entries(groups)) { const hid = []; G.scene.traverse((o) => { if (o.isMesh && o.visible && f(o)) { o.visible = false; hid.push(o); } }); G.render(); out.hide[k] = [hid.length, __green()]; hid.forEach((o) => { o.visible = true; }); }
  // road meshes: world matrices / geometry bounds
  out.roads = []; G.scene.traverse((o) => { if (o.isMesh && /^(road|grass|land)\|/.test(o.name)) { const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); out.roads.push([o.name, o.id, o.visible, o.matrixWorld.elements.filter((v, j) => j === 13 || j === 12 || j === 14 || j === 5).map((v) => +v.toFixed(3)), g.boundingBox.min.y.toFixed(3), g.boundingBox.max.y.toFixed(3), o.material.uuid.slice(0, 6), o.material.version]); } });
  return out; }
