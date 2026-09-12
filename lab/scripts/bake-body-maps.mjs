// Bake the body's surface maps from its own geometry and UVs.
//
//   node scripts/bake-body-maps.mjs [source.glb] [size]
//
// Writes public/character/body-normal.png (tangent-space cracked-charcoal
// relief) and public/character/body-cavity.png (where the form creases, so the
// amber fissures can follow it instead of floating on a noise field).
// The mesh's own UVs are used: they sit inside the unit square, cover 69% of it
// with no overlap and give about 1187 texels per metre at 2K.
import {deflateSync} from 'node:zlib';
import {readFile, writeFile} from 'node:fs/promises';

const source = process.argv[2] ?? 'tmp/source/man.glb';
const SIZE = Number(process.argv[3] ?? 2048);

const file = await readFile(source);
const jsonBytes = file.readUInt32LE(12);
const gltf = JSON.parse(file.subarray(20, 20 + jsonBytes).toString());
const binary = file.subarray(28 + jsonBytes);
function attribute(id) {
  const a = gltf.accessors[id];
  const v = gltf.bufferViews[a.bufferView];
  const components = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type];
  const Typed = {5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[
    a.componentType
  ];
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytes = binary.subarray(start, start + a.count * components * Typed.BYTES_PER_ELEMENT);
  return new Typed(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
const prim = gltf.meshes[0].primitives[0];
const position = attribute(prim.attributes.POSITION);
const normal = attribute(prim.attributes.NORMAL);
const uv = attribute(prim.attributes.TEXCOORD_0);
const index = new Uint32Array(attribute(prim.indices));
const vertices = position.length / 3;

// Height above the body's feet, so the charcoal can coarsen up the figure.
let minY = Infinity;
let maxY = -Infinity;
for (let i = 1; i < position.length; i += 3) {
  minY = Math.min(minY, position[i]);
  maxY = Math.max(maxY, position[i]);
}

// Discrete mean curvature: how far each neighbour leans off the tangent plane.
// Positive is a crease, negative a ridge; this is what the fissures follow.
const curve = new Float32Array(vertices);
const valence = new Uint32Array(vertices);
for (let t = 0; t < index.length; t += 3)
  for (let e = 0; e < 3; e++) {
    const a = index[t + e];
    const b = index[t + ((e + 1) % 3)];
    for (const [i, j] of [
      [a, b],
      [b, a],
    ]) {
      const dx = position[j * 3] - position[i * 3];
      const dy = position[j * 3 + 1] - position[i * 3 + 1];
      const dz = position[j * 3 + 2] - position[i * 3 + 2];
      const len = Math.hypot(dx, dy, dz) || 1;
      curve[i] +=
        (dx * normal[i * 3] + dy * normal[i * 3 + 1] + dz * normal[i * 3 + 2]) / (len * len);
      valence[i]++;
    }
  }
let spread = 0;
for (let i = 0; i < vertices; i++) {
  curve[i] /= Math.max(1, valence[i]);
  spread = Math.max(spread, Math.abs(curve[i]));
}

// Value noise on a lattice, hashed with integers so it never degenerates.
const hash = (x, y, z) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fade = (t) => t * t * (3 - 2 * t);
function noise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  let result = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        result +=
          hash(ix + dx, iy + dy, iz + dz) *
          (dx ? fx : 1 - fx) *
          (dy ? fy : 1 - fy) *
          (dz ? fz : 1 - fz);
  return result;
}
/** Charcoal: a few octaves of grain with a ridged fracture network cut into it. */
function relief(x, y, z) {
  const grain =
    0.45 * noise(x * 46, y * 46, z * 46) +
    0.33 * noise(x * 118, y * 118, z * 118) +
    0.22 * noise(x * 280, y * 280, z * 280);
  const ridge = 1 - Math.abs(2 * noise(x * 21 + 7.3, y * 21, z * 21 - 3.1) - 1);
  const fine = 1 - Math.abs(2 * noise(x * 58 - 2.7, y * 58 + 5.1, z * 58) - 1);
  return grain * 0.5 - Math.pow(ridge, 4) * 0.55 - Math.pow(fine, 5) * 0.3;
}

const pixels = SIZE * SIZE;
const nrm = new Uint8Array(pixels * 3);
const cav = new Uint8Array(pixels);
const filled = new Uint8Array(pixels);
// A step along the surface, in the body's own units, for the gradient.
const STEP = 0.0016;

const bary = (px, py, ax, ay, bx, by, cx, cy) => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-14) return null;
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const w = 1 - u - v;
  return u >= -0.002 && v >= -0.002 && w >= -0.002 ? [u, v, w] : null;
};

for (let t = 0; t < index.length; t += 3) {
  const a = index[t];
  const b = index[t + 1];
  const c = index[t + 2];
  const au = uv[a * 2] * SIZE;
  const av = uv[a * 2 + 1] * SIZE;
  const bu = uv[b * 2] * SIZE;
  const bv = uv[b * 2 + 1] * SIZE;
  const cu = uv[c * 2] * SIZE;
  const cv = uv[c * 2 + 1] * SIZE;
  // Tangent from the triangle's own UV derivatives; one frame per triangle is
  // enough at this density and avoids a second pass over the mesh.
  const e1 = [position[b * 3] - position[a * 3], position[b * 3 + 1] - position[a * 3 + 1], position[b * 3 + 2] - position[a * 3 + 2]];
  const e2 = [position[c * 3] - position[a * 3], position[c * 3 + 1] - position[a * 3 + 1], position[c * 3 + 2] - position[a * 3 + 2]];
  const du1 = uv[b * 2] - uv[a * 2];
  const dv1 = uv[b * 2 + 1] - uv[a * 2 + 1];
  const du2 = uv[c * 2] - uv[a * 2];
  const dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-16) continue;
  const r = 1 / det;
  let tan = [
    (e1[0] * dv2 - e2[0] * dv1) * r,
    (e1[1] * dv2 - e2[1] * dv1) * r,
    (e1[2] * dv2 - e2[2] * dv1) * r,
  ];
  const tl = Math.hypot(...tan) || 1;
  tan = tan.map((v) => v / tl);
  const lo = [Math.max(0, Math.floor(Math.min(au, bu, cu)) - 1), Math.max(0, Math.floor(Math.min(av, bv, cv)) - 1)];
  const hi = [Math.min(SIZE - 1, Math.ceil(Math.max(au, bu, cu)) + 1), Math.min(SIZE - 1, Math.ceil(Math.max(av, bv, cv)) + 1)];
  for (let y = lo[1]; y <= hi[1]; y++)
    for (let x = lo[0]; x <= hi[0]; x++) {
      const w = bary(x + 0.5, y + 0.5, au, av, bu, bv, cu, cv);
      if (!w) continue;
      const i = y * SIZE + x;
      const px = w[0] * position[a * 3] + w[1] * position[b * 3] + w[2] * position[c * 3];
      const py = w[0] * position[a * 3 + 1] + w[1] * position[b * 3 + 1] + w[2] * position[c * 3 + 1];
      const pz = w[0] * position[a * 3 + 2] + w[1] * position[b * 3 + 2] + w[2] * position[c * 3 + 2];
      let nx = w[0] * normal[a * 3] + w[1] * normal[b * 3] + w[2] * normal[c * 3];
      let ny = w[0] * normal[a * 3 + 1] + w[1] * normal[b * 3 + 1] + w[2] * normal[c * 3 + 1];
      let nz = w[0] * normal[a * 3 + 2] + w[1] * normal[b * 3 + 2] + w[2] * normal[c * 3 + 2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // Gram-Schmidt the triangle tangent against this texel's normal.
      const d = tan[0] * nx + tan[1] * ny + tan[2] * nz;
      let tx = tan[0] - nx * d;
      let ty = tan[1] - ny * d;
      let tz = tan[2] - nz * d;
      const tlen = Math.hypot(tx, ty, tz) || 1;
      tx /= tlen;
      ty /= tlen;
      tz /= tlen;
      const bx = ny * tz - nz * ty;
      const by = nz * tx - nx * tz;
      const bz = nx * ty - ny * tx;
      // Coarser charcoal higher up the figure, as heat works from the top down.
      const up = Math.min(1, Math.max(0, (py - minY) / (maxY - minY)));
      const amount = 0.55 + up * 0.45;
      const h0 = relief(px, py, pz);
      const hT = relief(px + tx * STEP, py + ty * STEP, pz + tz * STEP);
      const hB = relief(px + bx * STEP, py + by * STEP, pz + bz * STEP);
      const scale = (11 * amount) / STEP;
      let sx = -(hT - h0) * STEP * scale;
      let sy = -(hB - h0) * STEP * scale;
      const inv = 1 / Math.hypot(sx, sy, 1);
      nrm[i * 3] = Math.round((sx * inv * 0.5 + 0.5) * 255);
      nrm[i * 3 + 1] = Math.round((sy * inv * 0.5 + 0.5) * 255);
      nrm[i * 3 + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      const k = (w[0] * curve[a] + w[1] * curve[b] + w[2] * curve[c]) / (spread || 1);
      // Blend the form's creases with the fracture network's own valleys.
      const crease = Math.min(1, Math.max(0, k * 2.6 + 0.5));
      const cut = Math.min(1, Math.max(0, -h0 * 2.2));
      cav[i] = Math.round(Math.min(1, crease * 0.55 + cut * 0.75) * 255);
      filled[i] = 1;
    }
}

// Push the islands outward so bilinear filtering never samples empty space.
for (let pass = 0; pass < 6; pass++) {
  const grown = filled.slice();
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (filled[i]) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const jx = x + dx;
        const jy = y + dy;
        if (jx < 0 || jy < 0 || jx >= SIZE || jy >= SIZE) continue;
        const j = jy * SIZE + jx;
        if (!filled[j]) continue;
        nrm[i * 3] = nrm[j * 3];
        nrm[i * 3 + 1] = nrm[j * 3 + 1];
        nrm[i * 3 + 2] = nrm[j * 3 + 2];
        cav[i] = cav[j];
        grown[i] = 1;
        break;
      }
    }
  filled.set(grown);
}
for (let i = 0; i < pixels; i++)
  if (!filled[i]) {
    nrm[i * 3] = 128;
    nrm[i * 3 + 1] = 128;
    nrm[i * 3 + 2] = 255;
  }

function png(width, height, channels, data) {
  const bytes = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * channels);
    bytes[row] = 1; // Sub: neighbouring texels differ little on both maps.
    for (let x = 0; x < width * channels; x++) {
      const here = data[y * width * channels + x];
      const left = x >= channels ? data[y * width * channels + x - channels] : 0;
      bytes[row + 1 + x] = (here - left) & 255;
    }
  }
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    out.writeInt32BE(crc(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const table = Array.from({length: 256}, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) | 0;
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = channels === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(bytes, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const normalPng = png(SIZE, SIZE, 3, nrm);
const cavityPng = png(SIZE, SIZE, 1, cav);
await writeFile('public/character/body-normal.png', normalPng);
await writeFile('public/character/body-cavity.png', cavityPng);
const covered = filled.reduce((n, f) => n + f, 0);
console.log(
  `baked ${SIZE}x${SIZE}: normal ${(normalPng.length / 1048576).toFixed(2)} MB, ` +
    `cavity ${(cavityPng.length / 1048576).toFixed(2)} MB, ` +
    `${((covered / pixels) * 100).toFixed(1)}% of the square written`,
);
