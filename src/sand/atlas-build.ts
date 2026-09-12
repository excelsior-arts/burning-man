import {landHeight} from './geography';

/** A shared, immutable 25 cm walking survey, plus an eight-metre horizon survey.
 * RG packs height; RGBA8 filtering works on WebGPU and WebGL2. */
export const ATLAS_MIN = -192;
export const ATLAS_STEP = 0.25;
export const ATLAS_SIZE = 1537;
export const HEIGHT_MIN = -20;
export const HEIGHT_RANGE = 64;
export const FAR_ATLAS_MIN = -2048;
export const FAR_ATLAS_STEP = 8;
export const FAR_ATLAS_SIZE = 513;
export const FAR_HEIGHT_RANGE = 64;

/** One band of rows of the survey. Kept apart from its cache so any number of
 * workers can each run exactly this, on exactly these points, and the bands can
 * be stitched back into the same bytes a single pass would have produced. */
export function buildAtlasRows(
  min: number,
  step: number,
  size: number,
  range: number,
  from: number,
  to: number,
) {
  const data = new Uint8Array((to - from) * size * 4);
  for (let z = from; z < to; z++)
    for (let x = 0; x < size; x++) {
      const h = landHeight(min + x * step, min + z * step);
      const value = Math.max(0, Math.min(65535, Math.round(((h - HEIGHT_MIN) / range) * 65535)));
      const i = ((z - from) * size + x) * 4;
      data[i] = value >> 8;
      data[i + 1] = value & 255;
      data[i + 3] = 255;
    }
  return data;
}

export function buildAtlas(min: number, step: number, size: number, range: number) {
  return buildAtlasRows(min, step, size, range, 0, size);
}
