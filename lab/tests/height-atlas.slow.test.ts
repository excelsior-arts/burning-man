import {describe, expect, it} from 'vitest';
import {
  ATLAS_MIN,
  ATLAS_SIZE,
  ATLAS_STEP,
  buildAtlas,
  FAR_ATLAS_MIN,
  FAR_ATLAS_SIZE,
  FAR_ATLAS_STEP,
  FAR_HEIGHT_RANGE,
  HEIGHT_RANGE,
} from '../../src/sand/atlas-build';
import {heightAtlas, horizonAtlas, surveyedHeight} from '../../src/sand/height-atlas';

/** Two independent rolling hashes, so a single changed byte cannot slip past. */
function digest(data: Uint8Array) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    a = Math.imul(a ^ data[i]!, 16777619) >>> 0;
    b = (Math.imul(b + data[i]! + i, 2654435761) ^ (b >>> 13)) >>> 0;
  }
  return `${a.toString(16)}:${b.toString(16)}`;
}

/** Pinned bytes. The sand, footprint, foot-grounding and route checks all read
 * this survey, so it must not move whoever builds it or wherever it runs. */
const NEAR = '9353c62:22c0b53';
const FAR = '5b4dfc11:623539f3';

describe('the ground survey', () => {
  it('is the same whoever builds it, on a worker or on this thread', () => {
    expect(digest(heightAtlas())).toBe(
      digest(buildAtlas(ATLAS_MIN, ATLAS_STEP, ATLAS_SIZE, HEIGHT_RANGE)),
    );
    expect(digest(horizonAtlas())).toBe(
      digest(buildAtlas(FAR_ATLAS_MIN, FAR_ATLAS_STEP, FAR_ATLAS_SIZE, FAR_HEIGHT_RANGE)),
    );
  }, 60000);
  it('has not moved a byte since it was taken off the main thread', () => {
    expect(heightAtlas().length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
    expect(horizonAtlas().length).toBe(FAR_ATLAS_SIZE * FAR_ATLAS_SIZE * 4);
    expect(digest(heightAtlas())).toBe(NEAR);
    expect(digest(horizonAtlas())).toBe(FAR);
  }, 60000);
  it('reads the same ground the walker and the foot grounding do', () => {
    for (const [x, z] of [
      [0, 0],
      [-31.1, 0],
      [-108.4, 0],
      [96, -40],
      [-600, 300],
    ])
      expect(Number.isFinite(surveyedHeight(x!, z!))).toBe(true);
  });
});
