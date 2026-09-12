import {beforeAll, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {Group, AnimationMixer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {FootGrounding} from '../../src/character/foot-grounding';
import {
  WALK_CONTACTS,
  WALK_STRIDE,
  walkStepCount,
  walkStepDistance,
} from '../../src/character/walk-gait';
import {SandContacts} from '../../src/sand/contacts';
let asset;
beforeAll(async () => {
  const bytes = await readFile(new URL('../../public/character/man.glb', import.meta.url));
  asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
});
function fixture(slope = 0) {
  const body = new Group(),
    rig = clone(asset.scene);
  body.add(rig);
  const support = new FootGrounding(body, rig, {height: (_x, z) => slope * z});
  const mixer = new AnimationMixer(rig);
  const clip = asset.animations.find((c) => c.name === 'Walk');
  const action = mixer.clipAction(clip).play();
  const motion = (distance, facing = 0) => {
    const x = 4 + Math.sin(facing) * distance,
      z = -10 + Math.cos(facing) * distance;
    return {
      position: {x, y: slope * z, z},
      velocity: {x: 0, y: 0, z: 1},
      speed: 1,
      distance,
      facing,
    };
  };
  const sole = (state, foot) => {
    body.position.copy(state.position);
    body.rotation.y = state.facing;
    action.time = ((state.distance / WALK_STRIDE) % 1) * clip.duration;
    mixer.update(0);
    body.updateWorldMatrix(true, true);
    support.update(state.position.y, 0, true);
    const [heel, toe] = support.inspect().probes.filter((p) => p.foot === foot);
    return {
      x: (heel.x + toe.x) / 2,
      z: (heel.z + toe.z) / 2,
      yaw: Math.atan2(toe.x - heel.x, toe.z - heel.z),
    };
  };
  return {motion, sole};
}
it('stamps beneath the actual GLB soles, including rotated travel on flat ground and slopes', () => {
  for (const slope of [0, -0.35, 0.35]) {
    const {motion, sole} = fixture(slope);
    for (const facing of [0, Math.PI / 2, -Math.PI / 2, 2.8]) {
      for (const step of [0, 1, 6, 7]) {
        const distance = walkStepDistance(step),
          footprints = [];
        const contacts = new SandContacts({contact: (event) => footprints.push(event)});
        contacts.reset(distance - 0.04);
        contacts.update(motion(distance - 0.04, facing));
        contacts.update(motion(distance + 0.04, facing));
        expect(footprints).toHaveLength(1);
        const point = sole(motion(distance, facing), WALK_CONTACTS[step % 2].foot);
        expect(Math.hypot(footprints[0].x - point.x, footprints[0].z - point.z)).toBeLessThan(
          0.002,
        );
        const turn = footprints[0].facing - point.yaw;
        expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(0.002);
      }
    }
  }
});
it('keeps the planted sole over its print through the weight-bearing part of the stride', () => {
  const {motion, sole} = fixture();
  for (const [index, contact] of WALK_CONTACTS.entries()) {
    const distance = walkStepDistance(index),
      start = sole(motion(distance), contact.foot);
    for (const phase of [0.05, 0.1, 0.15, 0.2]) {
      const point = sole(motion(distance + phase * WALK_STRIDE), contact.foot);
      expect(Math.hypot(point.x - start.x, point.z - start.z)).toBeLessThan(0.015);
    }
  }
});
it('preserves step count, location and parity through coarse updates and a mid-cycle reset', () => {
  const {motion} = fixture();
  const trail = (spacing, from = 0) => {
    const prints = [],
      contacts = new SandContacts({contact: (p) => prints.push(p)});
    contacts.reset(from);
    contacts.update(motion(from));
    for (let d = from + spacing; d < 15; d += spacing) contacts.update(motion(d));
    contacts.update(motion(15));
    return prints;
  };
  const fine = trail(1 / 120),
    coarse = trail(0.19);
  expect(fine).toHaveLength(walkStepCount(15));
  expect(coarse).toHaveLength(fine.length);
  const from = 7.33,
    resumed = trail(0.11, from);
  for (const [points, start] of [
    [coarse, 0],
    [resumed, walkStepCount(from)],
  ])
    points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(fine[start + i].x, 8);
      expect(p.z).toBeCloseTo(fine[start + i].z, 8);
      expect(p.facing).toBeCloseTo(fine[start + i].facing, 8);
    });
});
