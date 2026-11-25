(i) => { const G = __G, R = G.renderer, gl = R.getContext(), out = { i };
  const nm = (o, m) => (o.name || o.type) + ':' + (m && (m.name || (m.userData && m.userData.prepKey) || m.type)) + (o.parent ? '<' + (o.parent.name || o.parent.type) : '');
  const rtId = new WeakMap(); let rtN = 0; const rid = (t) => t ? (rtId.get(t) || (rtId.set(t, 't' + (++rtN) + ':' + t.width + 'x' + t.height + (t.isWebGLCubeRenderTarget ? 'c' : '')), rtId.get(t))) : 'screen';
  let cur = null; const draws = []; const rbd = R.renderBufferDirect;
  R.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) { cur = { o: obj, m: mat, cam, rt: rid(R.getRenderTarget()) }; return rbd.apply(this, arguments); };
  const st = () => ({ dt: gl.isEnabled(gl.DEPTH_TEST), df: gl.getParameter(gl.DEPTH_FUNC), dw: gl.getParameter(gl.DEPTH_WRITEMASK), vp: Array.from(gl.getParameter(gl.VIEWPORT)), sc: gl.isEnabled(gl.SCISSOR_TEST), sb: Array.from(gl.getParameter(gl.SCISSOR_BOX)), cm: gl.getParameter(gl.COLOR_WRITEMASK), po: gl.isEnabled(gl.POLYGON_OFFSET_FILL), pf: gl.getParameter(gl.POLYGON_OFFSET_FACTOR), pu: gl.getParameter(gl.POLYGON_OFFSET_UNITS), cf: gl.isEnabled(gl.CULL_FACE), dr: Array.from(gl.getParameter(gl.DEPTH_RANGE)) });
  const wrap = (k) => { const f = gl[k]; gl['__' + k] = f; gl[k] = function () { if (cur) { const o = cur.o, m = cur.m; const n = nm(o, m); const e = { n, rt: cur.rt, cam: cur.cam.type + (cur.cam.isArrayCamera ? 'A' : ''), near: +(cur.cam.near || 0).toFixed(3), far: +(cur.cam.far || 0).toFixed(0), id: o.id };
        if (/land|road|asph|lane|street|grass|ground|pav/i.test(n) || draws.length < 3) Object.assign(e, st(), { cp: (m.clippingPlanes || []).length, mpo: [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits], ro: o.renderOrder, mdt: [m.depthTest, m.depthWrite, m.depthFunc], tr: m.transparent, side: m.side });
        draws.push(e); cur = null; } return f.apply(this, arguments); }; };
  const K = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']; K.forEach(wrap);
  const cam = G.camera; out.cam = { pos: cam.position.toArray().map((v) => +v.toFixed(3)), near: cam.near, far: cam.far, layers: cam.layers.mask, proj: Array.from(cam.projectionMatrix.elements).map((v) => +v.toFixed(4)) };
  out.rclip = { n: (R.clippingPlanes || []).length, local: R.localClippingEnabled, rt: rid(R.getRenderTarget()), sc: R.getScissorTest() };
  G.render(); out.g0 = __green();
  K.forEach((k) => { gl[k] = gl['__' + k]; }); R.renderBufferDirect = rbd;
  const byRt = {}; for (const d of draws) byRt[d.rt + '/' + d.cam] = (byRt[d.rt + '/' + d.cam] || 0) + 1; out.byRt = byRt;
  out.ground = draws.filter((d) => d.dt !== undefined).map((d, k) => ({ k: draws.indexOf(d), ...d }));
  out.ndraw = draws.length;
  // re-render the same frame
  G.render(); out.g1 = __green();
  // no post: straight to screen
  R.setRenderTarget(null); R.render(G.scene, G.camera); out.g2 = __green();
  window.__gd = draws; return out; }
