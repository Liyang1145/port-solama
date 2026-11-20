// r6.2: turn all-zero morph-target accessors of a cast GLB into bufferView-less accessors (glTF: zero-filled), drop their data.
// glTF requires every primitive of a mesh to keep the same target count, so the targets stay; only their payload goes.
// usage: node tools/stripmorph.cjs in.glb out.glb
const fs = require('fs'); const { MeshoptDecoder } = require('meshoptimizer');
(async () => {
  await MeshoptDecoder.ready; const [src, dst] = process.argv.slice(2); const b = fs.readFileSync(src);
  const jl = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + jl).toString()); const bin0 = 20 + jl + 8; const BIN = b.slice(bin0, bin0 + b.readUInt32LE(20 + jl));
  const CS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }; const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const cache = new Map();
  const view = (i) => { if (cache.has(i)) return cache.get(i); const bv = j.bufferViews[i]; const mo = bv.extensions && bv.extensions.EXT_meshopt_compression; let out;
    if (mo) { out = new Uint8Array(mo.count * mo.byteStride); MeshoptDecoder.decodeGltfBuffer(out, mo.count, mo.byteStride, BIN.subarray(mo.byteOffset || 0, (mo.byteOffset || 0) + mo.byteLength), mo.mode, mo.filter || 'NONE'); }
    else out = new Uint8Array(BIN.buffer, BIN.byteOffset + (bv.byteOffset || 0), bv.byteLength);
    cache.set(i, out); return out; };
  let zeroed = 0, kept = 0; const drop = new Set(); const used = new Set();
  const isZero = (ai) => { const a = j.accessors[ai]; if (a.bufferView === undefined || a.sparse) return false; const bv = j.bufferViews[a.bufferView]; const d = view(a.bufferView);
    const es = CS[a.componentType] * NC[a.type]; const stride = bv.byteStride || (bv.extensions && bv.extensions.EXT_meshopt_compression && bv.extensions.EXT_meshopt_compression.byteStride) || es; const o0 = a.byteOffset || 0;
    for (let i = 0; i < a.count; i++) for (let k = 0; k < es; k++) if (d[o0 + i * stride + k] !== 0) return false; return true; };
  for (const m of j.meshes) for (const p of m.primitives) for (const t of p.targets || []) for (const k in t) { const ai = t[k];
    if (isZero(ai)) { const a = j.accessors[ai]; drop.add(a.bufferView); delete a.bufferView; delete a.byteOffset; delete a.normalized; if (a.min) a.min = a.min.map(() => 0); if (a.max) a.max = a.max.map(() => 0); zeroed++; } else kept++; }
  for (const a of j.accessors) if (a.bufferView !== undefined) used.add(a.bufferView); for (const im of j.images || []) if (im.bufferView !== undefined) used.add(im.bufferView);
  // remove unreferenced views, remap indices
  const remap = new Map(); const nbv = []; j.bufferViews.forEach((bv, i) => { if (used.has(i)) { remap.set(i, nbv.length); nbv.push(bv); } });
  for (const a of j.accessors) if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView); for (const im of j.images || []) if (im.bufferView !== undefined) im.bufferView = remap.get(im.bufferView);
  j.bufferViews = nbv; const parts = []; let len = 0; const fb = j.buffers[1] && j.buffers[1].extensions && j.buffers[1].extensions.EXT_meshopt_compression ? 1 : -1; let fbLen = 0;
  for (const bv of nbv) { const mo = bv.extensions && bv.extensions.EXT_meshopt_compression; const seg = mo || bv; const d = BIN.subarray(seg.byteOffset || 0, (seg.byteOffset || 0) + seg.byteLength);
    while (len % 4) { parts.push(Buffer.alloc(1)); len++; } seg.byteOffset = len; parts.push(d); len += d.length;
    if (mo) { while (fbLen % 4) fbLen++; bv.byteOffset = fbLen; fbLen += bv.byteLength; } }
  while (len % 4) { parts.push(Buffer.alloc(1)); len++; } const out = Buffer.concat(parts); j.buffers[0].byteLength = out.length; if (fb === 1) j.buffers[1].byteLength = fbLen;
  let js = Buffer.from(JSON.stringify(j)); const pad = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546C67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + out.length, 8);
  const c0 = Buffer.alloc(8); c0.writeUInt32LE(js.length, 0); c0.writeUInt32LE(0x4E4F534A, 4); const c1 = Buffer.alloc(8); c1.writeUInt32LE(out.length, 0); c1.writeUInt32LE(0x004E4942, 4);
  fs.writeFileSync(dst, Buffer.concat([hdr, c0, js, c1, out])); console.log(src.split('/').pop(), 'zeroed', zeroed, 'kept', kept, (b.length / 1024 | 0) + ' -> ' + ((12 + 16 + js.length + out.length) / 1024 | 0) + ' KB');
})();
