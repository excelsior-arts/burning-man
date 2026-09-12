import {readFile, writeFile} from 'node:fs/promises';
import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
// The served body is meshopt-compressed; the index sets are generated from the
// uncompressed source on the shelf, whose vertex order the served file keeps.
const file = await readFile(process.argv[2] ?? 'tmp/source/man.glb');
const jsonBytes = file.readUInt32LE(12);
const gltf = JSON.parse(file.subarray(20, 20 + jsonBytes).toString());
const binary = file.subarray(28 + jsonBytes);
function attribute(id) {
  const a = gltf.accessors[id],
    v = gltf.bufferViews[a.bufferView];
  const components = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type];
  const Typed = {5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[
    a.componentType
  ];
  if (v.byteStride && v.byteStride !== components * Typed.BYTES_PER_ELEMENT)
    throw new Error('Interleaved source requires explicit unpacking');
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytes = binary.subarray(start, start + a.count * components * Typed.BYTES_PER_ELEMENT);
  return new Typed(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
const p = gltf.meshes[0].primitives[0];
const positions = attribute(p.attributes.POSITION),
  indices = new Uint32Array(attribute(p.indices));
const joints = attribute(p.attributes.JOINTS_0),
  weights = attribute(p.attributes.WEIGHTS_0);
const bones = gltf.skins[0].joints.length;
// Preserve joint influence while simplifying; pin vertices on smaller joints that
// do not fit the simplifier's 32-attribute budget (primarily finger details).
const mass = Array(bones).fill(0);
for (let i = 0; i < joints.length; i++) mass[joints[i]] += weights[i];
const important = mass
  .map((value, bone) => ({value, bone}))
  .sort((a, b) => b.value - a.value)
  .slice(0, 32)
  .map((x) => x.bone);
const stride = important.length;
const influences = new Float32Array((positions.length / 3) * stride);
const locks = new Uint8Array(positions.length / 3);
for (let i = 0; i < positions.length / 3; i++)
  for (let k = 0; k < 4; k++) {
    const slot = important.indexOf(joints[i * 4 + k]);
    if (slot >= 0) influences[i * stride + slot] += weights[i * 4 + k];
    else if (weights[i * 4 + k] > 0.01) locks[i] = 1;
  }
await MeshoptSimplifier.ready;
const levels = [];
for (const [name, triangles, error] of [
  ['balanced', 70000, 0.003],
  ['low', 28000, 0.008],
]) {
  const [lod, actualError] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    influences,
    stride,
    Array(stride).fill(0.2),
    locks,
    triangles * 3,
    error,
    ['LockBorder'],
  );
  levels.push(lod);
  console.log({name, triangles: lod.length / 3, relativeError: actualError});
}
// Only triangle indices change. Positions, normals, skin weights, bones and clips remain original.
const header = new Uint32Array([
  0x424c4f44,
  positions.length / 3,
  levels[0].length,
  levels[1].length,
]);
await writeFile(
  'public/character/body-detail.bin',
  Buffer.concat([header, ...levels].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))),
);
