/** Finite, overlapping dune chains around the eastern playa. The basin guides
 * where dunes accumulate; it never cuts their toes to a perfect curved edge. */
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + 83.19) * 43758.5453;
  return n - Math.floor(n);
};
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const u = smooth(0, 1, x - ix),
    v = smooth(0, 1, z - iz);
  return (
    (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v) +
    (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v
  );
}
export function basinHalfWidth(x: number) {
  return 160 + Math.pow(Math.max(0, x), 2) * 0.0008;
}
interface Dune {
  x: number;
  z: number;
  half: number;
  bow: number;
  bend: number;
  phase: number;
  slant: number;
  height: number;
  windward: number;
  leeward: number;
}
const CELL = 128;
const cells = new Map<string, Dune[]>();
const key = (x: number, z: number) => `${x},${z}`;
function add(dune: Dune) {
  const reach =
    Math.abs(dune.bow) +
    Math.abs(dune.slant) +
    dune.bend +
    Math.max(dune.windward, dune.leeward) * 1.3;
  for (
    let z = Math.floor((dune.z - dune.half) / CELL);
    z <= Math.floor((dune.z + dune.half) / CELL);
    z++
  )
    for (
      let x = Math.floor((dune.x - reach) / CELL);
      x <= Math.floor((dune.x + reach) / CELL);
      x++
    ) {
      const id = key(x, z);
      let bucket = cells.get(id);
      if (!bucket) cells.set(id, (bucket = []));
      bucket.push(dune);
    }
}
// Jittered accumulation patches seed independent chains, not rows of one phase.
// Offshoots share part of a parent's crest before bending into another chain.
for (let row = -16; row <= 16; row++)
  for (let col = -1; col <= 12; col++) {
    const r = (salt: number) => hash(col * 19 + salt * 7.3, row * 31 - salt * 2.1);
    const x = col * 87 + (r(1) - 0.5) * 104;
    const z = row * 137 + (r(2) - 0.5) * 160;
    const bank =
      basinHalfWidth(x) +
      (noise(x / 210, z / 300) - 0.5) * 145 +
      (noise(x / 75 + 19, z / 130) - 0.5) * 58;
    if (Math.abs(z) < bank || x < -80 || x > 1060 || r(3) < 0.13) continue;
    const dune: Dune = {
      x,
      z,
      half: 78 + r(4) * 147,
      bow: 12 + r(5) * 47,
      bend: 6 + r(6) * 17,
      phase: r(7) * Math.PI * 2,
      slant: (r(8) - 0.5) * 94,
      height: 8 + r(9) * 19,
      windward: 38 + r(10) * 31,
      leeward: 21 + r(11) * 23,
    };
    add(dune);
    if (r(12) < 0.58)
      add({
        ...dune,
        x: x + 22 + r(13) * 27,
        z: z + (r(14) - 0.5) * dune.half,
        half: dune.half * 0.64,
        slant: dune.slant - 38,
        bow: dune.bow * -0.65,
        height: dune.height * (0.48 + r(15) * 0.28),
        windward: dune.windward * 0.7,
        leeward: dune.leeward * 0.7,
      });
  }

function relief(dune: Dune, x: number, z: number) {
  const t = (z - dune.z) / dune.half;
  if (Math.abs(t) >= 1) return 0;
  const crest =
    dune.x +
    dune.bow * t * t +
    dune.slant * t +
    dune.bend * Math.sin(t * 4.1 + dune.phase) * (1 - t * t);
  const width =
    (x < crest ? dune.windward : dune.leeward) * (0.88 + 0.2 * Math.sin(t * 3 + dune.phase));
  const d = Math.abs(x - crest) / width;
  if (d >= 1) return 0;
  const lip = Math.sqrt(d * d + 0.14 * 0.14) - 0.14;
  const face = (1 - lip / (Math.sqrt(1.0196) - 0.14)) ** 2;
  const horn = Math.pow(Math.max(0, 1 - t * t), 0.8);
  return dune.height * face * horn * (0.86 + 0.14 * Math.sin(t * 5 + dune.phase));
}
export function horizonDuneHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  if (radius <= 130 || x <= -110 || (x >= 120 && Math.abs(z) <= 120)) return 0;
  const bucket = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!bucket) return 0;
  let height = 0;
  for (const dune of bucket) {
    const h = relief(dune, x, z);
    // Sand shoulders join at crossings instead of leaving a stack of shells.
    const overlap = Math.max(0, 1 - Math.abs(height - h) / 1.8);
    height = Math.max(height, h) + overlap * overlap * 0.45 * smooth(0, 0.8, Math.min(height, h));
  }
  const corridor = 1 - smooth(100, 120, x) * (1 - smooth(120, 154, Math.abs(z)));
  return height * smooth(130, 174, radius) * corridor * smooth(-110, -78, x);
}
/** Every tile intersecting an accumulation patch needs the same shared fine grid. */
export function horizonDunesInTile(x: number, z: number, size: number) {
  for (let iz = Math.floor(z / CELL); iz <= Math.floor((z + size) / CELL); iz++)
    for (let ix = Math.floor(x / CELL); ix <= Math.floor((x + size) / CELL); ix++)
      if (cells.has(key(ix, iz))) return true;
  return false;
}
