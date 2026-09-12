/** The author's sketch in metres: west = -X, north = -Z, Y is height. */
export type MapPoint = readonly [number, number];
export type DuneRidge = {
  name: string;
  points: readonly MapPoint[];
  height: number;
  windward: number;
  leeward: number;
  tip: number;
  curve?: boolean;
  /** Metres the crest bows across its own line, so it is not ruled in plan. */
  wander?: number;
  /** Metres the crest rises and falls along its length, so the top is not level. */
  swell?: number;
  /** Slides both along the crest, to put a low or a high where one is wanted. */
  phase?: number;
};
const passagePoint = (distance: number, offset: number, sign: number): MapPoint => {
  const length = Math.hypot(39, 101);
  return [
    (-39 * distance + 101 * offset) / length,
    (sign * (101 * distance + 39 * offset)) / length,
  ];
};
const passagePath = (sign: number): readonly MapPoint[] =>
  [
    [72, -4],
    [80, -5.5],
    [109, 5.5],
    [113, 3],
  ].map(([s, n]) => passagePoint(s!, n!, sign));
/** How far out the monuments stand. A viewer who takes the walk over skips every
 * scripted stop and so covers about 156 m before the knee fall, and the piece
 * wants the best possible approach to end just short of an altar rather than at
 * one. The dunes and the hidden playas do not move with this. */
const ALTAR_REACH = 161;
// The monuments occupy the clear centers, not the inner toes of the entrance horns.
const hiddenPlayas = {
  air: {center: passagePoint(121, 1, -1), clearRadius: 5.5},
  fire: {center: passagePoint(121, 1, 1), clearRadius: 5.5},
};
export const MAP = {
  spawn: [0, 0] as MapPoint,
  coast: -118.3,
  floor: 0.85,
  mountainFoot: 610,
  altarGap: 10,
  gates: {
    air: passagePoint(109, 5, -1),
    fire: passagePoint(109, 5, 1),
    earth: [96, 0] as MapPoint,
    sea: [-76, 0] as MapPoint,
  },
  passages: {air: passagePath(-1), fire: passagePath(1)},
  hiddenPlayas,
  altars: {
    // Each stands on level playa along its own bearing, past the dunes rather
    // than on one, and close enough that the best a viewer can walk ends just
    // short of it. The two beyond the horns are the ones the ground argues
    // with: nearer is reachable, further is better hidden, and reach wins.
    air: passagePoint(165, 6, -1),
    fire: passagePoint(166, 30, 1),
    earth: [ALTAR_REACH, 0] as MapPoint,
  },
};

// Crest polylines follow the drawn layout. Overlapping tips form the concealed
// north/south passages; the low humps leave the middle predominantly flat.
export const DUNE_RIDGES: readonly DuneRidge[] = [
  {
    name: 'Starting ridge',
    points: [
      [14, -88],
      [4, -62],
      [-9, -36],
      [-3, -13],
      [0, 0],
      [4, 13],
      [10, 27],
      [3, 50],
      [-10, 76],
    ],
    curve: true,
    // Sixty centimetres taller for the opening, which is well under the five
    // and a bit metres at which the sea would show over the coastal screen.
    height: 3.75,
    windward: 15,
    leeward: 9,
    // The curve is in the drawn line here rather than added across it, so the
    // control point he stands on cannot move and the opening frame is unchanged.
    swell: 0.34,
    phase: 5.071,
    tip: 18,
  },
  {
    name: 'Coastal screen',
    points: [
      [-74, -170],
      [-92, -138],
      [-92, -110],
      [-80, -78],
      [-67, -55],
      [-77, -28],
      [-76, -8],
      [-76, 0],
      [-76, 8],
      [-78, 28],
      [-90, 53],
      [-87, 79],
      [-84, 111],
      [-64, 146],
      [-78, 181],
    ],
    curve: true,
    height: 6.0,
    windward: 34,
    leeward: 32,
    // Undulating rather than flat topped, and phased so the route crosses it
    // through a low of the wave instead of over a high.
    wander: 3.0,
    swell: 0.55,
    phase: 1.5,
    tip: 20,
  },
  {
    name: 'North west arm',
    curve: true,
    points: [[-84, -33], [-73, -57], passagePoint(83, -24, -1)],
    height: 4.8,
    windward: 17,
    leeward: 10,
    tip: 9,
  },
  {
    name: 'North east arm',
    curve: true,
    points: [[3, -35], [-6, -64], passagePoint(76, 22, -1)],
    height: 4.15,
    windward: 13,
    leeward: 9,
    tip: 10,
  },
  {
    name: 'South west arm',
    curve: true,
    points: [[-84, 33], [-73, 57], passagePoint(83, -24, 1)],
    height: 4.8,
    windward: 17,
    leeward: 10,
    tip: 9,
  },
  {
    name: 'South east arm',
    curve: true,
    points: [[3, 35], [-6, 64], passagePoint(76, 22, 1)],
    height: 4.8,
    windward: 13,
    leeward: 9,
    tip: 10,
  },
  {
    name: 'Central north hump',
    curve: true,
    points: [
      [-22, -24],
      [-20, -13],
      [-22, 0],
    ],
    height: 1,
    windward: 8,
    leeward: 4,
    tip: 10,
  },
  {
    name: 'Central south hump',
    curve: true,
    points: [
      [-34, 7],
      [-30, 19],
      [-33, 29],
    ],
    height: 0.95,
    windward: 8,
    leeward: 4,
    tip: 10,
  },
  {
    name: 'Eastern near hump',
    curve: true,
    points: [
      [26, -33],
      [30, -22],
      [27, -11],
    ],
    height: 1.05,
    windward: 8,
    leeward: 4,
    tip: 10,
  },
  {
    name: 'Eastern mid hump',
    curve: true,
    points: [
      [44, 12],
      [48, 23],
      [45, 35],
    ],
    height: 0.9,
    windward: 8,
    leeward: 4,
    tip: 10,
  },
  {
    name: 'Eastern far hump',
    curve: true,
    points: [
      [58, -19],
      [62, -8],
      [59, 3],
    ],
    height: 0.8,
    windward: 8,
    leeward: 4,
    tip: 10,
  },
  // The eastern playa is a scatter of humps rather than a ridge across it, so the
  // floor reads through to the foot of the range between them. One of them, sized
  // and placed for the job, stands between the earth altar and everywhere the walk
  // and the opening shot can see it from.
  {
    name: 'Eastern scatter far north',
    curve: true,
    points: [
      [84, -94],
      [88, -83],
      [85, -72],
    ],
    height: 2.0,
    windward: 11,
    leeward: 6,
    tip: 11,
  },
  {
    name: 'Eastern scatter north',
    curve: true,
    points: [
      [73, -57],
      [78, -47],
      [75, -37],
    ],
    height: 2.2,
    windward: 12,
    leeward: 6,
    tip: 11,
  },
  {
    name: 'Eastern scatter north inner',
    curve: true,
    points: [
      [93, -31],
      [97, -22],
      [94, -13],
    ],
    height: 1.7,
    windward: 10,
    leeward: 6,
    tip: 10,
  },
  {
    name: 'Earth altar blocker',
    curve: true,
    points: [
      [101, -16],
      [107, -7],
      [108, 3],
      [103, 14],
    ],
    height: 3.9,
    windward: 14,
    leeward: 10,
    tip: 9,
  },
  {
    name: 'Eastern scatter south inner',
    curve: true,
    points: [
      [93, 15],
      [97, 24],
      [94, 33],
    ],
    height: 1.65,
    windward: 10,
    leeward: 6,
    tip: 10,
  },
  {
    name: 'Eastern scatter south',
    curve: true,
    points: [
      [75, 43],
      [80, 53],
      [77, 63],
    ],
    height: 2.3,
    windward: 12,
    leeward: 6,
    tip: 11,
  },
  {
    name: 'Eastern scatter far south',
    curve: true,
    points: [
      [82, 79],
      [86, 90],
      [83, 101],
    ],
    height: 2.1,
    windward: 11,
    leeward: 6,
    tip: 11,
  },
  {
    name: 'Northern starting horn',
    points: [
      [6, -64],
      [25, -95],
      [16, -135],
      [-5, -169],
    ],
    height: 3.9,
    windward: 19,
    leeward: 11,
    tip: 25,
    curve: true,
  },
  {
    name: 'Southern starting horn',
    points: [
      [2, 46],
      [21, 87],
      [14, 128],
      [-10, 163],
    ],
    height: 4.3,
    windward: 19,
    leeward: 12,
    tip: 26,
    curve: true,
  },
  {
    name: 'Northern eastern branch',
    points: [
      [92, -48],
      [74, -77],
      [59, -119],
      [76, -173],
    ],
    height: 3.1,
    windward: 18,
    leeward: 11,
    tip: 30,
    curve: true,
  },
  {
    name: 'Southern eastern branch',
    points: [
      [86, 113],
      [114, 175],
      [94, 213],
    ],
    height: 3.5,
    windward: 18,
    leeward: 10,
    tip: 35,
    curve: true,
  },
  {
    name: 'North inner west curl',
    points: [
      [83, -24],
      [100, -10],
      [109, -0.5],
      [111, -13],
      [116, -25],
    ].map(([s, n]) => passagePoint(s!, n!, -1)),
    curve: true,
    height: 3.6,
    windward: 8,
    leeward: 8,
    tip: 14,
  },
  {
    name: 'North inner east curl',
    points: [
      [70, 22],
      [75, 9],
      [80, 0.5],
      [86, 8],
      [92, 17],
    ].map(([s, n]) => passagePoint(s!, n!, -1)),
    curve: true,
    height: 3.6,
    windward: 8,
    leeward: 8,
    tip: 13,
  },
  {
    name: 'South inner west curl',
    points: [
      [83, -24],
      [100, -10],
      [109, -0.5],
      [111, -13],
      [116, -25],
    ].map(([s, n]) => passagePoint(s!, n!, 1)),
    curve: true,
    height: 3.6,
    windward: 8,
    leeward: 8,
    tip: 14,
  },
  {
    name: 'South inner east curl',
    points: [
      [70, 22],
      [75, 9],
      [80, 0.5],
      [86, 8],
      [92, 17],
    ].map(([s, n]) => passagePoint(s!, n!, 1)),
    curve: true,
    height: 3.6,
    windward: 8,
    leeward: 8,
    tip: 13,
  },
];

/** Sample the editable crest through smooth bends; distance queries reuse it. */
export function crestPoints(ridge: DuneRidge): readonly MapPoint[] {
  if (!ridge.curve) return bowed(ridge, [...ridge.points]);
  const points: MapPoint[] = [];
  const at = (i: number) => ridge.points[Math.max(0, Math.min(ridge.points.length - 1, i))]!;
  for (let i = 0; i < ridge.points.length - 1; i++) {
    const a = at(i - 1),
      b = at(i),
      c = at(i + 1),
      d = at(i + 2);
    const count = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 3));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      const axis = (k: 0 | 1) =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t);
      points.push([axis(0), axis(1)]);
    }
  }
  points.push(at(ridge.points.length - 1));
  return bowed(ridge, points);
}
const TAU = Math.PI * 2;
/** Two slow sines of arc length, incommensurate so they never repeat a shape.
 * Returns -1 to 1, and it is smooth: a crest built on it has no corner in it. */
function swellAt(s: number, phase: number) {
  return (
    Math.sin((s / 5.3) * TAU + phase) * 0.5 +
    Math.sin((s / 8.9) * TAU + phase * 1.7 + 2.1) * 0.3 +
    Math.sin((s / 13.7) * TAU + phase * 0.6 + 4.3) * 0.2
  );
}
/** Bow the sampled crest across its own line, by arc length rather than by
 * control point, so the wander does not depend on where the author clicked. */
function bowed(ridge: DuneRidge, points: MapPoint[]): readonly MapPoint[] {
  if (!ridge.wander) return points;
  const out: MapPoint[] = [];
  let along = 0;
  for (let i = 0; i < points.length; i++) {
    const b = points[i]!;
    if (i > 0) along += Math.hypot(b[0] - points[i - 1]![0], b[1] - points[i - 1]![1]);
    const a = points[Math.max(0, i - 1)]!,
      c = points[Math.min(points.length - 1, i + 1)]!;
    const tx = c[0] - a[0],
      tz = c[1] - a[1];
    const m = Math.max(0.0001, Math.hypot(tx, tz));
    const bow =
      ridge.wander *
      (Math.sin((along / 121) * TAU + (ridge.phase ?? 0)) * 0.64 +
        Math.sin((along / 79) * TAU + (ridge.phase ?? 0) * 1.3 + 2.4) * 0.36);
    out.push([b[0] - (tz / m) * bow, b[1] + (tx / m) * bow]);
  }
  return out;
}
function compileRidge(ridge: DuneRidge) {
  const points = crestPoints(ridge);
  const width = Math.max(ridge.windward, ridge.leeward);
  let total = 0;
  const segments = points.slice(1).map((point, i) => {
    const a = points[i]!;
    const dx = point[0] - a[0],
      dz = point[1] - a[1];
    const length2 = dx * dx + dz * dz,
      length = Math.sqrt(length2);
    const segment = {
      x: a[0],
      z: a[1],
      dx,
      dz,
      length2,
      length,
      along: total,
      // The crest's own tangent and curvature at this segment's two ends, so both
      // vary continuously along it. Read per segment they step at every join, and
      // a width built on a stepping tangent steps with it.
      ax: dx / length,
      az: dz / length,
      bx: dx / length,
      bz: dz / length,
      ka: 0,
      kb: 0,
    };
    total += length;
    return segment;
  });
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1]!,
      b = segments[i]!;
    const mx = a.dx / a.length + b.dx / b.length,
      mz = a.dz / a.length + b.dz / b.length;
    const m = Math.max(0.0001, Math.hypot(mx, mz));
    a.bx = b.ax = mx / m;
    a.bz = b.az = mz / m;
    const cross = (a.dx * b.dz - a.dz * b.dx) / Math.max(0.0001, a.length * b.length);
    const curvature =
      Math.asin(Math.max(-1, Math.min(1, cross))) / Math.max(0.0001, (a.length + b.length) * 0.5);
    a.kb = b.ka = curvature;
  }
  // The curvature drives the width inside a bend, so it must vary as slowly as
  // the bend itself. Read raw from three-metre samples of a hand-drawn line it
  // jittered join to join, and every jitter became a ridge running down the face.
  // Smooth it over about twenty metres of crest before it touches the width.
  const joins = segments.length + 1;
  const raw = new Float64Array(joins);
  for (let i = 0; i < segments.length; i++) raw[i] = segments[i]!.ka;
  raw[segments.length] = segments[segments.length - 1]!.kb;
  const smooth = new Float64Array(joins);
  const radius = 3;
  for (let i = 0; i < joins; i++) {
    let sum = 0,
      weight = 0;
    for (let d = -radius; d <= radius; d++) {
      const j = Math.max(0, Math.min(joins - 1, i + d));
      const w = radius + 1 - Math.abs(d);
      sum += raw[j]! * w;
      weight += w;
    }
    smooth[i] = sum / weight;
  }
  for (let i = 0; i < segments.length; i++) {
    segments[i]!.ka = smooth[i]!;
    segments[i]!.kb = smooth[i + 1]!;
  }
  return {
    segments,
    total,
    bounds: [
      Math.min(...points.map((p) => p[0])) - width,
      Math.max(...points.map((p) => p[0])) + width,
      Math.min(...points.map((p) => p[1])) - width,
      Math.max(...points.map((p) => p[1])) + width,
    ],
  };
}
const shapes = new Map(DUNE_RIDGES.map((ridge) => [ridge, compileRidge(ridge)]));

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Sand piles into one another; it does not stack. A polynomial smooth maximum
 * joins overlapping cross-sections and neighbouring ridges without a crease. */
const BLEND = 1.4;
export function heap(a: number, b: number, k = BLEND) {
  // The extra sand two dunes leave against each other has to fade in with the
  // smaller of them. Switching it on the moment the second one appears steps the
  // ground by a quarter of the blend along every line where one reaches zero,
  // which is exactly the toe of every dune, and the step reads as a row of
  // notches there. Scaled this way the join is continuous and flat ground, where
  // the smaller contribution is nothing at all, is left alone.
  const low = Math.min(a, b);
  if (low <= 0) return Math.max(a, b);
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return Math.max(a, b) + h * h * k * 0.25 * Math.min(1, low / k);
}
/** One dune, evaluated once. The nearest point on the whole crest gives a distance
 * and a place along it; the cross-section is a single raised cosine that reaches
 * the ground with zero slope, so the base is as continuous as the crest. Taking a
 * maximum over per-segment cross-sections cannot do this: wherever one segment
 * hands over to the next of a different width the surface steps, and the steps
 * read as a ledge along the toe. */
export function ridgeRelief(x: number, z: number, ridge: DuneRidge) {
  let shape = shapes.get(ridge);
  if (!shape) shapes.set(ridge, (shape = compileRidge(ridge)));
  const box = shape.bounds;
  if (x < box[0]! || x > box[1]! || z < box[2]! || z > box[3]!) return 0;
  let best = Infinity,
    along = 0,
    turn = 0,
    tx = 1,
    tz = 0,
    ox = 0,
    oz = 0;
  for (const segment of shape.segments) {
    const {dx, dz} = segment;
    const t = clamp(((x - segment.x) * dx + (z - segment.z) * dz) / segment.length2);
    const px = x - segment.x - t * dx,
      pz = z - segment.z - t * dz;
    const distance2 = px * px + pz * pz;
    if (distance2 >= best) continue;
    best = distance2;
    along = segment.along + t * segment.length;
    turn = segment.ka + (segment.kb - segment.ka) * t;
    tx = segment.ax + (segment.bx - segment.ax) * t;
    tz = segment.az + (segment.bz - segment.az) * t;
    ox = px;
    oz = pz;
  }
  const tangent = Math.max(0.0001, Math.hypot(tx, tz));
  tx /= tangent;
  tz /= tangent;
  const distance = Math.sqrt(best);
  // Which flank, blended across a half-metre so the crest line is not a crease:
  // the wind side is the long gentle one, the lee shorter and steeper.
  const lateral = ox * tz - oz * tx;
  const face = clamp(lateral / 1 + 0.5);
  let width = ridge.leeward + (ridge.windward - ridge.leeward) * (face * face * (3 - 2 * face));
  // Inside a bend the two flanks converge; give that side room so the profile
  // widens through the turn instead of pinching into a notch.
  width *= 1 + clamp(-Math.sign(lateral) * turn * 9) * 0.35;
  if (distance >= width) return 0;
  // A rounded nose at each end rather than a cut across the crest.
  const taper = clamp(Math.min(along, shape.total - along) / ridge.tip);
  const profile = 0.5 + 0.5 * Math.cos((Math.PI * distance) / width);
  // The crest rises and falls along its length, and only the crest does: carried
  // down the faces the same wave corrugates them into shelves running to the toe.
  // A third of the way down it is gone and the face is the plain cosine again.
  const top = clamp((profile - 0.62) / 0.38);
  const crest = ridge.swell
    ? ridge.swell * swellAt(along, ridge.phase ?? 0) * top * top * (3 - 2 * top)
    : 0;
  return (ridge.height * profile + crest) * taper * taper * (3 - 2 * taper);
}
export function duneRelief(x: number, z: number) {
  let h = 0;
  for (const ridge of DUNE_RIDGES) h = heap(h, ridgeRelief(x, z, ridge));
  return h;
}
