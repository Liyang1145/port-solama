// Poly Haven CC0 prop -> drop variant duplicates (regex), prune; then optimize with the gltf-transform CLI (see below)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
const [inp, outp, drop] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp); const re = new RegExp(drop);
for (const n of doc.getRoot().listNodes()) if (re.test(n.getName())) n.dispose();
for (const v of doc.getRoot().listExtensionsUsed()) if (v.extensionName === 'KHR_materials_variants') v.dispose();
await doc.transform(prune(), dedup());
await io.write(outp, doc);
