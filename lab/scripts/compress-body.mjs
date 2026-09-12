// Meshopt-compress the body. The uncompressed source stays on the ignored tmp/
// shelf with the other working assets; this writes the served file, so the
// recipe is repeatable and the binary is never edited by hand.
//
//   node scripts/compress-body.mjs [source.glb] [out.glb]
//
// Vertices are quantised but never reordered or welded: body-detail.bin indexes
// this exact vertex order, and the fire picks its emission anchors by walking
// the triangles in this exact order.
import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression, KHRMeshQuantization} from '@gltf-transform/extensions';
import {quantize} from '@gltf-transform/functions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';
import {readFile, stat, writeFile} from 'node:fs/promises';

const source = process.argv[2] ?? 'tmp/source/man.glb';
const out = process.argv[3] ?? 'public/character/man.glb';
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder});

const document = await io.read(source);
const before = document.getRoot().listMeshes()[0].listPrimitives()[0];
const vertices = before.getAttribute('POSITION').getCount();
const triangles = before.getIndices().getCount() / 3;
const bones = document.getRoot().listSkins()[0].listJoints().length;
const names = document
  .getRoot()
  .listAnimations()
  .map((a) => a.getName());

await document.transform(
  quantize({
    quantizePosition: 16,
    quantizeNormal: 12,
    quantizeTexcoord: 14,
    quantizeWeight: 10,
    quantizeGeneric: 14,
  }),
);
document
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({method: EXTMeshoptCompression.EncoderMethod.QUANTIZE});
await writeFile(out, await io.writeBinary(document));

// Read the result back and refuse to ship a body the runtime cannot line up with.
const check = await io.read(out);
const after = check.getRoot().listMeshes()[0].listPrimitives()[0];
const problems = [];
if (after.getAttribute('POSITION').getCount() !== vertices)
  problems.push(`vertex count moved: ${vertices} -> ${after.getAttribute('POSITION').getCount()}`);
if (after.getIndices().getCount() / 3 !== triangles)
  problems.push(`triangle count moved: ${triangles} -> ${after.getIndices().getCount() / 3}`);
if (check.getRoot().listSkins()[0].listJoints().length !== bones)
  problems.push('joint count moved');
const kept = check
  .getRoot()
  .listAnimations()
  .map((a) => a.getName());
if (kept.join() !== names.join()) problems.push(`clip names moved: ${names} -> ${kept}`);
// The order itself: the first and last triangles must still name the same corners.
const a = before.getIndices().getArray();
const b = after.getIndices().getArray();
for (const i of [0, 1, 2, a.length - 3, a.length - 2, a.length - 1])
  if (a[i] !== b[i]) problems.push(`triangle order moved at index ${i}`);
if (problems.length) throw new Error(`Compression changed the body: ${problems.join('; ')}`);

const [from, to] = await Promise.all([stat(source), stat(out)]);
const raw = await readFile(out);
console.log(
  `body ${(from.size / 1048576).toFixed(2)} MB -> ${(to.size / 1048576).toFixed(2)} MB ` +
    `(${Math.round((1 - to.size / from.size) * 100)}% smaller), ` +
    `${vertices} vertices, ${triangles} triangles, ${bones} joints, clips ${kept.join(', ')}`,
);
void raw;
