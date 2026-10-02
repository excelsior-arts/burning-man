import type {MotionState} from '../runtime/types';
import {WALK_CONTACTS, walkStepCount, walkStepDistance} from '../character/walk-gait';
import {SandField} from './field';

type Sole = {x: number; y: number; z: number; facing: number};
type Plant = {last: Sole; printed: Sole; age: number};

/** Footprints and kicked sand follow the authored walk's sole positions and plant phases. */
export class SandContacts {
  private distance = 0;
  private previous?: {x: number; z: number; facing: number};
  private plants: Plant[] = [];
  constructor(readonly field: SandField) {}
  reset(distance = 0) {
    this.distance = distance;
    this.previous = undefined;
    this.plants = [];
  }
  /** Captures can pivot on a toe without lifting it: a newly settled sole counts
   * after either travel or a twist. A held pose never digs a repeating hole. */
  updatePose(motion: MotionState, feet: readonly Sole[], dt: number): number[] {
    if (!motion.gesture) {
      this.plants = [];
      return [];
    }
    if (dt <= 0) return [];
    const landed: number[] = [];
    for (const [i, foot] of feet.entries()) {
      const plant = this.plants[i] ??= {last: {...foot}, printed: {...foot}, age: 0};
      plant.age += dt;
      const speed = Math.hypot(foot.x - plant.last.x, foot.z - plant.last.z) / dt;
      const travel = Math.hypot(foot.x - plant.printed.x, foot.z - plant.printed.z);
      const turn = Math.abs(Math.atan2(Math.sin(foot.facing - plant.printed.facing),
        Math.cos(foot.facing - plant.printed.facing)));
      if (plant.age > 0.24 && speed < 0.32 && (travel > 0.1 || turn > 0.5)
        && foot.y - this.field.height(foot.x, foot.z) < 0.035) {
        this.field.contact({...foot, force: 0.65, kind: 'step'});
        Object.assign(plant.printed, foot);
        plant.age = 0;
        landed.push(i);
      }
      Object.assign(plant.last, foot);
    }
    return landed;
  }
  update(motion: MotionState) {
    if (motion.distance < this.distance) this.reset(motion.distance);
    const previous = this.previous ?? {...motion.position, facing: motion.facing};
    const travel = motion.distance - this.distance;
    if (!motion.gesture && motion.speed >= 0.12 && travel > 0) {
      const turn = Math.atan2(
        Math.sin(motion.facing - previous.facing),
        Math.cos(motion.facing - previous.facing),
      );
      for (let step = walkStepCount(this.distance); step < walkStepCount(motion.distance); step++) {
        const foot = WALK_CONTACTS[step % 2]!;
        // A scrub's coarse samples and a live fixed step must stamp the same spot.
        const f = (walkStepDistance(step) - this.distance) / travel;
        const facing = previous.facing + turn * f;
        const x = previous.x + (motion.position.x - previous.x) * f;
        const z = previous.z + (motion.position.z - previous.z) * f;
        const sin = Math.sin(facing),
          cos = Math.cos(facing);
        this.field.contact({
          x: x + cos * foot.x + sin * foot.z,
          z: z - sin * foot.x + cos * foot.z,
          facing: facing + foot.yaw,
          force: 1,
          kind: 'step',
        });
      }
    }
    this.distance = motion.distance;
    previous.x = motion.position.x;
    previous.z = motion.position.z;
    previous.facing = motion.facing;
    this.previous = previous;
  }
}
