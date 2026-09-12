import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {CameraDirector, HANDOVER_SECONDS, sampleCameraShot} from '../../src/experience/camera-director';
import {lookStart} from '../../src/experience/look-around';
import {WalkDirector} from '../../src/experience/director';
import {FollowCamera} from '../../src/world/follow-camera';
import {validateScore} from '../../src/experience/score';
import {REFERENCE} from './reference-score';

const score = validateScore(REFERENCE);
const vector = (time: number) => {
  const p = sampleCameraShot(time, score).offset;
  return new THREE.Vector3(p.x, p.y, p.z);
};
const steps = score.stage_03_walk;
const handover = steps + HANDOVER_SECONDS;
describe('the scripted side camera', () => {
  it('opens on his face and arcs onto the flank while he walks off', () => {
    const opening = vector(0);
    // West of him on his line to the sea, so the shot holds his face and the range.
    expect(opening.x).toBeLessThan(-score.cameraDistance + 0.1);
    expect(Math.abs(opening.z)).toBeLessThan(0.05);
    expect(opening.y).toBeGreaterThan(0);
    expect(opening.y).toBeLessThan(0.4);
    // The opening frame holds until he steps off, then swings one way onto the flank.
    expect(vector(steps)).toEqual(opening);
    let previous = -Math.PI / 2;
    for (let time = steps; time <= handover; time += 1 / 60) {
      const azimuth = Math.atan2(vector(time).x, vector(time).z);
      expect(azimuth).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(azimuth - previous).toBeLessThan(0.02);
      previous = azimuth;
    }
    expect(vector(handover).z).toBeGreaterThan(5);
    expect(vector(handover).y).toBeGreaterThan(0.9);
  });

  it('stays across the wind axis, moves slowly, and closes in for the final kneel', () => {
    for (let time = handover; time <= score.duration; time += 0.25) {
      // The look-around is its own shot: the camera goes round with him there.
      if (time >= lookStart(score) - 3 && time < score.stage_05_fall) continue;
      const offset = vector(time);
      expect(offset.z).toBeGreaterThan(1.5);
      if (time < score.stage_08_kneel - 22) expect(Math.abs(offset.x / offset.z)).toBeLessThan(0.6);
      expect(offset.distanceTo(vector(time + 1 / 60))).toBeLessThan(0.01);
    }
    expect(vector(score.duration).length()).toBeLessThan(
      vector(score.stage_08_kneel - 15).length() - 1,
    );
    const fall = sampleCameraShot(100, score);
    sampleCameraShot(185, score);
    expect(sampleCameraShot(100, score)).toEqual(fall);
  });

  it('rides his look around and is back on the flank for the knee fall', () => {
    const start = lookStart(score);
    // A plain flank frame from after the opening arc and before the camera leans.
    const flank = vector(start - 3.5);
    const radius = (v: THREE.Vector3) => Math.hypot(v.x, v.z);
    let swept = 0,
      previous = Math.atan2(flank.x, flank.z),
      quickest = 0,
      lowest = Infinity;
    for (let time = start - 3; time <= score.stage_05_fall; time += 1 / 60) {
      const offset = vector(time);
      // Roughly the distance it already had; the bearing and the eye change.
      expect(offset.length()).toBeCloseTo(flank.length(), 2);
      expect(radius(offset)).toBeGreaterThan(radius(flank) - 0.2);
      lowest = Math.min(lowest, offset.y);
      const bearing = Math.atan2(offset.x, offset.z);
      swept += Math.atan2(Math.sin(bearing - previous), Math.cos(bearing - previous));
      previous = bearing;
      quickest = Math.max(quickest, offset.distanceTo(vector(time + 1 / 60)));
    }
    // One turn round him, at an orbit's pace rather than a whip.
    expect(swept).toBeGreaterThan(Math.PI * 1.9);
    expect(swept).toBeLessThan(Math.PI * 2.1);
    expect(quickest).toBeLessThan(0.12);
    // A lower eye than the walking flank, close behind his back.
    expect(lowest).toBeLessThan(flank.y - 0.3);
    const kneel = vector(score.stage_05_fall);
    expect(kneel.z).toBeGreaterThan(1.5);
    expect(Math.abs(kneel.x / kneel.z)).toBeLessThan(0.6);
  });

  it('turns forward on the climb of the last dune, not only at the ending', () => {
    const bearing = (coast: number, time = 60) =>
      (Math.atan2(
        sampleCameraShot(time, score, coast).offset.x,
        sampleCameraShot(time, score, coast).offset.z,
      ) *
        180) /
      Math.PI;
    const flank = bearing(0);
    expect(flank).toBeLessThan(35);
    // The climb reaches the very angle the ending uses, so the ending's turn is
    // now a continuation of this one rather than a second swing of its own.
    expect(bearing(1)).toBeCloseTo(72, 6);
    expect(bearing(0, score.stage_08_kneel + 5)).toBeCloseTo(72, 6);
    // Part way up the climb is part way round, and it never overshoots.
    expect(bearing(0.5)).toBeGreaterThan(flank + 10);
    expect(bearing(0.5)).toBeLessThan(72);
    expect(bearing(0, score.duration)).toBeCloseTo(bearing(1, score.duration), 6);
  });

  it('lets camera gestures override the view without interrupting or extending the walk', () => {
    const camera = new CameraDirector(),
      walk = new WalkDirector();
    camera.begin(7);
    expect(camera.update(7, 1 / 60, score, false, false).weight).toBe(0);
    expect(walk.direction(7, 0, 0, false, score)).toEqual([-1, 0]);
    camera.end(8);
    expect(camera.inspect(15.9, score).mode).toBe('manual');
    expect(camera.update(16.1, 1 / 60, score, false, false).weight).toBeGreaterThan(0);
    expect(walk.inspect(16.1, score).mode).toBe('ocean');
    walk.direction(20, 1, 0, true, score);
    camera.begin(28);
    camera.end(30);
    expect(walk.direction(31.9, 0, 0, false, score)).toEqual([0, 0]);
    expect(walk.direction(32, 0, 0, false, score)).toEqual([-1, 0]);
    expect(camera.inspect(32, score).mode).toBe('manual');
  });

  it('holds the view during steering, a pause or a face study, then returns gradually', () => {
    const director = new CameraDirector();
    expect(director.update(20, 1 / 60, score, true, false).weight).toBe(0);
    expect(director.update(32, 0, score, false, false).weight).toBe(0);
    expect(director.update(32, 1 / 60, score, false, true).weight).toBe(0);
    const first = director.update(32, 1 / 60, score, false, false).weight;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.00001);
    for (let i = 0; i < 361; i++) director.update(32 + i / 60, 1 / 60, score, false, false);
    expect(director.inspect(39, score).mode).toBe('scripted');
    director.begin(40);
    director.reset();
    expect(director.inspect(0, score)).toEqual({mode: 'scripted', returnIn: 0});
  });

  it('keeps a returning camera outside dunes and follows an arc without cutting through the body', () => {
    const camera = new THREE.PerspectiveCamera();
    const orbit = {target: new THREE.Vector3(0, 1, 0), update() {}};
    camera.position.set(0, 2, -8);
    let ground = 0;
    const follow = new FollowCamera(camera, orbit, () => ground);
    const director = new CameraDirector();
    // Settle over the plain stretch after the recovery, clear of the opening arc
    // and of the look around, both of which the easing is meant to trail.
    const settled = score.stage_05_fall + 12;
    director.begin(settled);
    director.end(settled);
    for (let i = 0; i < 1200; i++) {
      const time = settled + i / 60;
      const shot = director.update(time, 1 / 60, score, false, false);
      follow.update(orbit.target.clone(), 1 / 60, true, shot);
      expect(camera.position.distanceTo(orbit.target)).toBeGreaterThan(5);
    }
    expect(
      camera.position.clone().sub(orbit.target).distanceTo(vector(settled + 20)),
    ).toBeLessThan(0.2);
    ground = 5;
    follow.update(orbit.target.clone(), 1 / 60, true, sampleCameraShot(20, score));
    expect(camera.position.y).toBeGreaterThanOrEqual(5.5);
    follow.snap(new THREE.Vector3(50, 1, 0), sampleCameraShot(100, score));
    expect(camera.position.clone().sub(orbit.target).distanceTo(vector(100))).toBeLessThan(1e-10);
  });
});
