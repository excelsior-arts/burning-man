import {describe, expect, it} from 'vitest';
import {WalkDirector} from '../../src/experience/director';
import {ScriptedWalk} from '../../src/experience/rehearsal';
import {
  
  FALL_SECONDS,
  RISE_SECONDS,
  sampleScore,
  validateScore,
} from '../../src/experience/score';
import {Walker} from '../../src/experience/walker';
import {LOOK_PIVOT, lookSpan, lookStart} from '../../src/experience/look-around';
import {sampleCameraShot} from '../../src/experience/camera-director';
import {REFERENCE} from './reference-score';
const score = validateScore(REFERENCE);

describe('The unattended and interactive journey', () => {
  it('walks to the sea after the opening without input', () => {
    const director = new WalkDirector(),
      walker = new Walker(() => 0);
    walker.reset(0, 0);
    const steps = score.walkAt + score.stage_01_flame;
    for (let t = 0; t < steps; t += 1 / 60) {
      const [x, z] = director.direction(t, 0, 0, false, score);
      walker.step(x, z, 1 / 60, sampleScore(t, score).mobility, score);
    }
    expect(walker.state.distance).toBe(0);
    for (let t = steps; t < steps + 6; t += 1 / 60) {
      const [x, z] = director.direction(t, 0, 0, false, score);
      walker.step(x, z, 1 / 60, sampleScore(t, score).mobility, score);
    }
    expect(walker.state.position.x).toBeLessThan(-4);
  });

  it('yields to player input, waits while idle, and returns west from the current location', () => {
    const d = new WalkDirector();
    expect(d.direction(10, 1, 0.5, true, score)).toEqual([1, 0.5]);
    expect(d.inspect(10, score).mode).toBe('player');
    expect(d.direction(15, 0, 0, false, score)).toEqual([0, 0]);
    expect(d.direction(21.99, 0, 0, false, score)).toEqual([0, 0]);
    expect(d.direction(22, 0, 0, false, score)).toEqual([-1, 0]);
    expect(d.direction(25, 0, -1, true, score)).toEqual([0, -1]);
    expect(d.inspect(35, score).mode).toBe('player');
    expect(d.direction(37, 0, 0, false, score)).toEqual([-1, 0]);
    d.reset();
    expect(d.inspect(0, score)).toMatchObject({mode: 'ocean', returnIn: 0});
  });

  it('keeps the one fall and death on the score clock even during continuous input', () => {
    const d = new WalkDirector(),
      walker = new Walker(() => 0);
    walker.reset(20, 0);
    for (const t of [score.stage_05_fall, score.stage_05_fall + 1, score.stage_08_kneel, score.duration]) {
      const [x, z] = d.direction(t, 1, 0, true, score);
      walker.step(x, z, 1 / 60, sampleScore(t, score).mobility, score);
      expect(walker.state.speed).toBe(0);
    }
    const resume = score.stage_05_fall + FALL_SECONDS + score.stage_05_fall_hold + RISE_SECONDS + 0.1;
    expect(sampleScore(resume, score).mobility).toBeGreaterThan(0);
    expect(sampleScore(score.duration, score)).toMatchObject({ended: true, bow: 1});
    expect(validateScore({version: 1, idleReturn: 6.5}).idleReturn).toBe(12);
    expect(() => validateScore({...score, idleReturn: 9})).toThrow();
    expect(() => validateScore({...score, idleReturn: 16})).toThrow();
    expect(validateScore({version: 1, falls: [42, 87]}).stage_05_fall).toBe(87);
    expect(validateScore({version: 1, falls: [42, 87]})).not.toHaveProperty('falls');
  });
});

describe('Scripted timeline rehearsal', () => {
  it('gives the same pose location going forward, backward, and directly to a timestamp', () => {
    const route = new ScriptedWalk(score);
    const fall = route.sample(score.stage_05_fall + 0.6);
    const end = route.sample(score.duration);
    route.sample(3);
    expect(route.sample(score.stage_05_fall + 0.6)).toEqual(fall);
    expect(route.sample(score.duration)).toEqual(end);
    expect(new ScriptedWalk(score).sample(score.duration)).toEqual(end);
    expect(fall.speed).toBe(0);
    expect(end.speed).toBe(0);
    expect(end.position.x).toBeLessThan(fall.position.x);
  });
  it('pivots him round on the spot before the fall and lands back on the sea heading', () => {
    const route = new ScriptedWalk(score);
    const home = -Math.PI / 2;
    const off = (t: number, quarters: number) => {
      const d = route.sample(t).facing - home - (quarters * Math.PI) / 2;
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    };
    const slot = lookSpan(score) / 4;
    const standing = route.sample(lookStart(score) + 0.2);
    expect(off(lookStart(score) - 0.01, 0)).toBeLessThan(0.001);
    // Each quarter turn settles well inside its own beat, then holds.
    for (let quarter = 1; quarter <= 4; quarter++) {
      const landed = lookStart(score) + (quarter - 1) * slot + LOOK_PIVOT + 0.1;
      expect(off(landed, quarter)).toBeLessThan(0.02);
      expect(off(lookStart(score) + quarter * slot - 0.01, quarter)).toBeLessThan(0.001);
    }
    // Home for the last beat, with his feet where they were when he stopped.
    expect(off(score.stage_05_fall - 0.01, 4)).toBeLessThan(0.001);
    const kneel = route.sample(score.stage_05_fall);
    expect(kneel.position.x).toBeCloseTo(standing.position.x, 9);
    expect(kneel.position.z).toBeCloseTo(standing.position.z, 9);
    expect(kneel.speed).toBe(0);
    // A backward scrub reproduces the same headings.
    const sampled = [0.5, 0.3, 0.6, 0.9].map((f, i) => lookStart(score) + (i + f) * slot);
    const forward = sampled.map((t) => route.sample(t).facing);
    const scrubbed = new ScriptedWalk(score);
    scrubbed.sample(score.duration);
    expect(sampled.map((t) => scrubbed.sample(t).facing)).toEqual(forward);
  });

  it('keeps the camera behind his shoulders for the whole circle', () => {
    const route = new ScriptedWalk(score);
    let closest = Infinity,
      furthest = 0;
    for (let t = lookStart(score) - 3; t <= score.stage_05_fall; t += 1 / 30) {
      const shot = sampleCameraShot(t, score).offset;
      const bearing = Math.atan2(shot.x, shot.z) - route.sample(t).facing;
      const behind =
        Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing))) * (180 / Math.PI);
      closest = Math.min(closest, behind);
      furthest = Math.max(furthest, behind);
    }
    // Ninety degrees is his shoulder line. The camera lags his pivot but never
    // comes forward of that line, so the viewer is never given his face instead
    // of the direction he is looking, and it does settle behind his back.
    expect(closest).toBeGreaterThan(100);
    expect(furthest).toBeGreaterThan(160);
  });

  it('does not share mutable motion objects with the caller and handles the opening', () => {
    const route = new ScriptedWalk(score);
    const initial = route.sample(0);
    initial.position.x = 999;
    expect(route.sample(0).position.x).toBe(score.spawnX);
    expect(route.sample(0).distance).toBe(0);
    expect(route.sample(3).distance).toBe(0);
    const steps = score.walkAt + score.stage_01_flame;
    expect(route.sample(steps).distance).toBe(0);
    expect(route.sample(steps + 1).distance).toBeGreaterThan(0);
  });
});
