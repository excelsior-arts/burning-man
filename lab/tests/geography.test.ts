import {expect, it} from 'vitest';
import {duneHeight, SandField} from '../../src/sand/field';
import {
  coastX,
  mountainHeight,
  MAP,
  BEACH_WIDTH,
  BEACH_SLOPE,
  coastalCrest,
  COASTAL_CLIMB,
  landHeight,
} from '../../src/sand/geography';
import {travelBudget, surveyJourney, terrainOccludes} from '../../src/experience/journey';
import {retimeScore, sampleScore, validateScore} from '../../src/experience/score';
import {WalkDirector} from '../../src/experience/director';
import {ScriptedWalk} from '../../src/experience/rehearsal';
import {Walker, calibratedPace} from '../../src/experience/walker';
import {REFERENCE} from './reference-score';
/** The landscape was drawn for a walk that reaches the sea. At the shipped pace it
 * no longer does, pending the author's choice, so the ground itself is measured at
 * the pace that completes the authored route: full gait and no intro wait. */
const plain = validateScore({...REFERENCE, paceScale: 1, stage_01_flame: 0});
const ROUTE = validateScore({...plain, walkSpeed: calibratedPace(plain)});


it('follows the authored map: low eastern start, higher coastal screen, low central humps', () => {
  expect(duneHeight(...MAP.spawn)).toBeCloseTo(4, 2);
  expect(duneHeight(...MAP.gates.sea)).toBeGreaterThan(5);
  const field = new SandField();
  let flat = 0,
    humps = 0;
  for (let x = -40; x < -15; x += 1)
    for (let z = -25; z < 25; z += 1) {
      const h = duneHeight(x, z);
      expect(h).toBeLessThan(1.86);
      if (h < 0.9) {
        flat++;
        expect(field.support(x, z).softness).toBeLessThan(0.04);
      }
      if (h > 1.4) humps++;
    }
  expect(flat).toBeGreaterThan(850);
  expect(humps).toBeGreaterThan(10);
  expect(terrainOccludes(MAP.spawn, [coastX(0), 0], 2.8, 0)).toBe(true);
});

it('leaves a flat dry beach and five hundred metres of eastern playa before Black Rock', () => {
  const field = new SandField();
  for (const z of [-120, -40, 0, 40, 120]) {
    const coast = coastX(z);
    for (let d = 0; d <= BEACH_WIDTH; d += 0.5) {
      expect(duneHeight(coast + d, z)).toBeCloseTo(d * BEACH_SLOPE, 2);
      expect(Math.abs(field.height(coast + d, z) - duneHeight(coast + d, z))).toBeLessThan(0.001);
      expect(field.support(coast + d, z).sinkDepth).toBeLessThan(0.0001);
    }
    expect(duneHeight(coast - 40, z)).toBeLessThan(-2);
    for (let x = 120; x < 610; x += 10) {
      expect(duneHeight(x, z)).toBeCloseTo(MAP.floor, 3);
      expect(mountainHeight(x, z)).toBe(0);
    }
    expect(mountainHeight(718, z)).toBeGreaterThan(15);
    expect(mountainHeight(-718, z)).toBe(0);
  }
});

it('hides altar tops from the central playa with terrain, then reveals them at the ending', () => {
  for (const name of ['air', 'fire', 'earth'] as const) {
    const target = MAP.altars[name];
    for (let x = -65; x <= 0; x += 10)
      for (let z = -45; z <= 45; z += 15) {
        if (duneHeight(x, z) > 2) continue;
        expect(
          terrainOccludes([x, z], target, 2.8, name === 'earth' ? 2.8 : 2.2),
          `${name} from ${x},${z}`,
        ).toBe(true);
      }
    const route = surveyJourney(name, ROUTE);
    expect(route.crossedAt).toBeGreaterThan(name === 'earth' ? 100 : 122);
    expect(route.crossedAt).toBeLessThan(name === 'earth' ? 110 : 128);
    expect(route.altarDistance).toBeGreaterThan(8.5);
    expect(route.altarDistance).toBeLessThan(12);
    expect(route.altarVisible).toBe(true);
    // Even the unlimited flat-ground speed envelope cannot reach an altar's base.
    expect(Math.hypot(...target) - 1.7).toBeGreaterThan(travelBudget(ROUTE));
  }
});

it('finds the top of the last dune before the water from the ground itself', () => {
  for (const z of [-120, -40, 0, 60, 140]) {
    const crest = coastalCrest(z);
    const top = landHeight(coastX(z) + crest, z);
    // It is a top: the ground falls away on both sides, and the camera's approach
    // starts on ground that is genuinely lower than the crest it is climbing.
    expect(top).toBeGreaterThan(landHeight(coastX(z) + crest - 8, z));
    expect(top).toBeGreaterThan(landHeight(coastX(z) + crest + 8, z));
    expect(top).toBeGreaterThan(landHeight(coastX(z) + crest + COASTAL_CLIMB, z) + 1);
    expect(crest).toBeGreaterThan(20);
    expect(crest).toBeLessThan(70);
  }
});

it('retains the authored crests within the quarter-metre survey resolution', () => {
  // A sharp crest between 25 cm samples rounds by at most half a cell.
  for (let z = -120; z < 120; z += 1.73)
    for (let x = -120; x < 125; x += 1.91)
      expect(Math.abs(duneHeight(x, z) - landHeight(x, z))).toBeLessThan(0.125);
});

it('retimes a 2:40 or 3:20 song while preserving distance, real recovery durations and reveals', () => {
  const budget = travelBudget(ROUTE);
  for (const duration of [160, 200]) {
    const score = retimeScore(ROUTE, duration);
    expect(score.duration).toBe(duration);
    expect(score.duration - score.stage_08_kneel).toBe(17);
    expect(score.stage_05_fall_hold).toBe(ROUTE.stage_05_fall_hold);
    expect(travelBudget(score)).toBeCloseTo(budget, 6);
    for (const name of ['air', 'fire', 'earth'] as const) {
      const original = surveyJourney(name, ROUTE),
        longer = surveyJourney(name, score);
      expect(
        Math.hypot(longer.end[0] - original.end[0], longer.end[1] - original.end[1]),
      ).toBeLessThan(0.25);
      expect(longer.crossedAt).toBeLessThan(score.stage_08_kneel);
      expect(longer.altarVisible).toBe(true);
    }
  }
});

it('walks the curled N/S passages on level sand and reproduces the turns when scrubbing', () => {
  for (const name of ['air', 'fire'] as const) {
    const director = new WalkDirector();
    director.routine = name;
    const walker = new Walker();
    walker.reset(...MAP.spawn);
    let passageSamples = 0;
    for (let t = 0; t < ROUTE.duration; t += 1 / 60) {
      const p = walker.state.position;
      const direction = director.direction(t, 0, 0, false, ROUTE, [p.x, p.z]);
      walker.step(...direction, 1 / 60, sampleScore(t, ROUTE).mobility, ROUTE);
      if (Math.hypot(p.x, p.z) > 72) {
        passageSamples++;
        expect(Math.abs(duneHeight(p.x, p.z) - MAP.floor)).toBeLessThan(0.05);
        const grade =
          Math.abs(
            duneHeight(p.x + direction[0] * 0.3, p.z + direction[1] * 0.3) -
              duneHeight(p.x - direction[0] * 0.3, p.z - direction[1] * 0.3),
          ) / 0.6;
        expect(grade).toBeLessThan(Math.tan((5 * Math.PI) / 180));
        if (t < 108) expect(terrainOccludes([p.x, p.z], MAP.altars[name], 1.8)).toBe(true);
      }
    }
    expect(passageSamples).toBeGreaterThan(2500);
    const rehearsal = new ScriptedWalk(ROUTE, name);
    const end = rehearsal.sample(ROUTE.duration);
    expect(
      Math.hypot(
        end.position.x - walker.state.position.x,
        end.position.z - walker.state.position.z,
      ),
    ).toBeLessThan(0.03);
    rehearsal.sample(85);
    expect(rehearsal.sample(ROUTE.duration)).toEqual(end);
  }
});

it('leaves a wider level forecourt in front of the Earth altar', () => {
  expect(MAP.altars.earth[0] - MAP.gates.earth[0]).toBeGreaterThanOrEqual(24);
  for (let x = MAP.gates.earth[0]; x < MAP.altars.earth[0]; x += 0.5)
    expect(Math.abs(duneHeight(x, 0) - MAP.floor)).toBeLessThan(0.02);
});

// An altar center can be visible while its base is buried around a curl. Sample
// the whole clearing and the base sightline so that regression cannot recur.
it('centers Air and Fire on open playa, with their bases fully visible beyond the entrance', () => {
  for (const name of ['air', 'fire'] as const) {
    const clearing = MAP.hiddenPlayas[name];
    expect(MAP.altars[name]).toEqual(clearing.center);
    for (let r = 0; r <= clearing.clearRadius; r += 0.5)
      for (let angle = 0; angle < Math.PI * 2; angle += 0.2)
        expect(
          Math.abs(
            duneHeight(
              clearing.center[0] + Math.cos(angle) * r,
              clearing.center[1] + Math.sin(angle) * r,
            ) - MAP.floor,
          ),
        ).toBeLessThan(0.05);
    const end = surveyJourney(name, ROUTE).end;
    for (const height of [0.08, 0.5, 1, 2])
      expect(terrainOccludes(end, clearing.center, 0.9, height)).toBe(false);
  }
});
