import type {MotionState} from '../runtime/types';
import type {Score} from './score';
import {sampleScore, clamp, pace} from './score';
import {lookHeading, lookTurn} from './look-around';
import {duneHeight} from '../sand/field';
import {coastX} from '../sand/geography';
/** Walk-only controller. Acceleration and slope effort never exceed the score's speed budget. */
export class Walker {
  readonly state: MotionState = {
    position: {x: 0, y: 0, z: 0},
    velocity: {x: 0, y: 0, z: 0},
    speed: 0,
    distance: 0,
    facing: -Math.PI / 2,
  };
  constructor(private height: (x: number, z: number) => number = duneHeight) {}
  reset(x: number, z: number) {
    Object.assign(this.state.position, {x, y: this.height(x, z), z});
    Object.assign(this.state.velocity, {x: 0, y: 0, z: 0});
    this.state.speed = 0;
    this.state.distance = 0;
    this.state.facing = -Math.PI / 2;
  }
  restore(state: MotionState) {
    Object.assign(this.state.position, state.position);
    Object.assign(this.state.velocity, state.velocity);
    this.state.speed = state.speed;
    this.state.distance = state.distance;
    this.state.facing = state.facing;
  }
  step(x: number, z: number, dt: number, mobility: number, s: Score) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const p = this.state.position,
      v = this.state.velocity;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    const rise = len
      ? (this.height(p.x + x * 0.3, p.z + z * 0.3) - this.height(p.x - x * 0.3, p.z - z * 0.3)) /
        0.6
      : 0;
    const target = pace(s) * mobility * clamp(1 - Math.max(0, rise) * 0.55, 0.48, 1);
    const ease = 1 - Math.exp(-dt * 9);
    v.x += (x * target - v.x) * ease;
    v.z += (z * target - v.z) * ease;
    if (mobility === 0) v.x = v.z = 0;
    const oldX = p.x,
      oldZ = p.z,
      oldY = p.y;
    p.x += v.x * dt;
    p.z += v.z * dt;
    // A dry shore is always retained, including lateral approaches and author retuning.
    p.x = Math.max(coastX(p.z) + s.beachMargin, p.x);
    v.x = (p.x - oldX) / dt;
    v.z = (p.z - oldZ) / dt;
    const floor = this.height(p.x, p.z);
    p.y += (floor - p.y) * (1 - Math.exp(-dt / 0.075));
    v.y = (p.y - oldY) / dt;
    this.state.speed = Math.hypot(v.x, v.z);
    this.state.distance += this.state.speed * dt;
    if (this.state.speed > 0.02) this.turn(Math.atan2(v.x, v.z), dt);
  }
  /** A pivot bounded per frame so a reversal never flips the body instantly. The
   * walk aims it at travel and turns briskly; the scripted look-around aims it
   * with the feet planted and hands in a much slower rate and ceiling. */
  turn(heading: number, dt: number, rate = 12, limit = 6) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const delta = Math.atan2(
      Math.sin(heading - this.state.facing),
      Math.cos(heading - this.state.facing),
    );
    this.state.facing += clamp(delta * (1 - Math.exp(-dt * rate)), -dt * limit, dt * limit);
  }
}
export function rehearse(s: Score, spawnX = s.spawnX) {
  const walker = new Walker();
  walker.reset(spawnX, s.spawnZ);
  let arrival: number | null = null;
  for (let t = 0; t < s.duration; t += 1 / 30) {
    const c = sampleScore(t, s);
    walker.step(-1, 0, 1 / 30, c.mobility, s);
    const heading = lookHeading(t, s, [-1, 0]);
    if (heading !== null) walker.turn(heading, 1 / 30, ...lookTurn(s));
    if (
      arrival === null &&
      walker.state.position.x - coastX(walker.state.position.z) < s.beachMargin + 0.15
    )
      arrival = t;
  }
  return {
    x: walker.state.position.x,
    z: walker.state.position.z,
    waterDistance: walker.state.position.x - coastX(walker.state.position.z),
    arrival,
    distance: walker.state.distance,
  };
}
/** Calibrate against the actual dune profile, with margin before the final knee fall. */
export function calibratedSpawn(s: Score) {
  const end = s.stage_08_kneel - 1.5;
  let low = coastX(s.spawnZ) + 30,
    high = coastX(s.spawnZ) + 260;
  for (let i = 0; i < 25; i++) {
    const middle = (low + high) / 2;
    const r = rehearse({...s, duration: end}, middle);
    if (r.waterDistance > s.beachMargin + 0.2) high = middle;
    else low = middle;
  }
  return Math.round(((low + high) / 2) * 100) / 100;
}

/** Keep the authored start on its crest; tune pace instead of relocating it. */
export function calibratedPace(score: Score) {
  let low = 0.3,
    high = 2;
  for (let i = 0; i < 22; i++) {
    const speed = (low + high) / 2;
    const result = rehearse({...score, duration: score.stage_08_kneel - 1.5, walkSpeed: speed});
    if (result.waterDistance > score.beachMargin + 0.15) low = speed;
    else high = speed;
  }
  return (low + high) / 2;
}
