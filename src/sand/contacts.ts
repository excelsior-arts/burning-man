import type {MotionState} from '../runtime/types';
import {WALK_CONTACTS, walkStepCount, walkStepDistance} from '../character/walk-gait';
import {SandField} from './field';

/** Footprints and kicked sand follow the authored walk's sole positions and plant phases. */
export class SandContacts {
  private distance = 0;
  private previous?: {x: number; z: number; facing: number};
  constructor(readonly field: SandField) {}
  reset(distance = 0) {
    this.distance = distance;
    this.previous = undefined;
  }
  update(motion: MotionState) {
    if (motion.distance < this.distance) this.reset(motion.distance);
    const previous = this.previous ?? {...motion.position, facing: motion.facing};
    const travel = motion.distance - this.distance;
    if (motion.speed >= 0.12 && travel > 0) {
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
