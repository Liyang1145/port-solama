// aggressive weld+simplify (ignores UV borders) for small props: node tools/simp.mjs in.glb out.glb ratio
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
await doc.transform(dedup(), weld({ tolerance: 0.0005 }), simplify({ simplifier: MeshoptSimplifier, ratio: +process.argv[4], error: 0.02, lockBorder: false }), prune());
await io.write(process.argv[3], doc);
