import {MAP, duneRelief, heap} from './layout';
import {horizonDuneHeight} from './horizon-dunes';
export {MAP, DUNE_RIDGES, duneRelief} from './layout';
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const SEA_LEVEL = 0;
export const BEACH_WIDTH = 10;
export const DUNE_TRANSITION_END = 17;
export const BEACH_SLOPE = 0.045;
export const SEABED_SLOPE = 0.075;
export function coastalDuneWeight(shore: number) {
  return smooth(BEACH_WIDTH, DUNE_TRANSITION_END, shore);
}
export function coastX(z: number) {
  return MAP.coast + 1.2 * Math.sin(z * 0.014) + 0.5 * Math.sin(z * 0.047);
}
/** Ground under the authored dunes; the eastern playa stays level for 500 m. */
export function landHeight(x: number, z: number) {
  const shore = x - coastX(z);
  const beach = Math.max(-20, shore * (shore < 0 ? SEABED_SLOPE : BEACH_SLOPE));
  const weight = coastalDuneWeight(shore);
  return (
    beach * (1 - weight) +
    // The authored dunes and the horizon field are one sand sheet: pile them into
    // each other rather than taking whichever is taller and leaving a ledge.
    (MAP.floor + heap(duneRelief(x, z), horizonDuneHeight(x, z))) * weight
  );
}

/** Metres of approach over which the camera turns forward onto the last climb. */
export const COASTAL_CLIMB = 25;
const crests = new Map<number, number>();
/** Distance from the shoreline to the top of the last dune before it, read off the
 * ground itself so a change to the coastal profile carries the camera with it. */
export function coastalCrest(z: number) {
  const key = Math.round(z / 2) * 2;
  let crest = crests.get(key);
  if (crest === undefined) {
    let highest = -Infinity;
    crest = BEACH_WIDTH;
    for (let shore = BEACH_WIDTH; shore <= 90; shore += 0.5) {
      const ground = landHeight(coastX(key) + shore, key);
      if (ground > highest) {
        highest = ground;
        crest = shore;
      }
    }
    crests.set(key, crest);
  }
  return crest;
}

/** Shared by the horizon mesh and the Earth altar's perspective study. */
export const BLACK_ROCK_PEAKS = [
  {x: 713, z: -181, radiusX: 100, radiusZ: 184, height: 42},
  {x: 718, z: -35, radiusX: 108, radiusZ: 180, height: 78},
  {x: 699, z: 112, radiusX: 86, radiusZ: 155, height: 50},
] as const;

/** Broad eroded shoulders and the isolated Black Rock peak in the supplied photos. */
export function mountainHeight(x: number, z: number) {
  if (x <= MAP.mountainFoot) return 0;
  const cone = (cx: number, cz: number, rx: number, rz: number, height: number) => {
    const dx = (x - cx) / rx,
      dz = (z - cz) / rz;
    const r = Math.hypot(dx, dz);
    const flank = Math.max(0, 1 - r);
    const angle = Math.atan2(dz, dx);
    const gullies =
      1 + Math.sin(angle * 19 + r * 4) * 0.2 * r + Math.sin(angle * 37 - r * 9) * 0.065 * r;
    const crags =
      Math.sin(x * 0.21 + Math.sin(z * 0.12)) * 1.4 +
      Math.sin(z * 0.29 - x * 0.13) * 1.0 +
      Math.sin(x * 0.63 + z * 0.41) * 0.55;
    return Math.max(0, height * Math.pow(flank, 1.1) * gullies + crags * smooth(0, 0.24, flank));
  };
  let summits = 0;
  for (const peak of BLACK_ROCK_PEAKS)
    summits = Math.max(summits, cone(peak.x, peak.z, peak.radiusX, peak.radiusZ, peak.height));
  const longRidge = 835 + Math.sin(z * 0.003) * 38 + Math.sin(z * 0.009) * 14;
  const profile = Math.max(0, 1 - Math.abs(x - longRidge) / 150);
  const peaks = 28 + 9 * Math.sin(z * 0.014) + 5 * Math.sin(z * 0.031 + 1.3);
  const background = profile * profile * peaks;
  return Math.max(summits, background) * smooth(MAP.mountainFoot, MAP.mountainFoot + 25, x);
}
