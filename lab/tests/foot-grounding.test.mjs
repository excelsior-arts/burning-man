import {beforeAll, describe, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {FootGrounding} from '../../src/character/foot-grounding';
let asset;
beforeAll(async () => {
  const bytes = await readFile(new URL('../../public/character/man.glb', import.meta.url));
  asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
});
function fixture(slope = 0, sink = 0) {
  const body = new THREE.Group(),
    rig = clone(asset.scene);
  body.add(rig);
  const surface = {height: (_x, z) => slope * z, sinkDepth: () => sink};
  const support = new FootGrounding(body, rig, surface);
  const mixer = new THREE.AnimationMixer(rig);
  const clip = asset.animations.find((c) => c.name === 'Walk');
  const action = mixer.clipAction(clip).play();
  const pose = (phase, z = 0, dt = 1 / 60, standing = true) => {
    body.position.set(0, surface.height(0, z), z);
    action.time = (phase % 1) * clip.duration;
    mixer.update(0);
    body.updateWorldMatrix(true, true);
    const offset = support.update(body.position.y, dt, standing);
    body.position.y += offset;
    body.updateWorldMatrix(true, true);
    return support.inspect();
  };
  return {body, rig, pose, support};
}
describe('terrain support under the authored feet', () => {
  it('leaves flat ground animation intact and preserves the lifted swing foot', () => {
    const f = fixture();
    for (let phase = 0; phase < 1; phase += 1 / 60) {
      const result = f.pose(phase);
      expect(result.offset).toBeCloseTo(0, 9);
    }
    const midSwing = f.pose(0.125);
    const foot = (name) =>
      Math.min(...midSwing.probes.filter((p) => p.foot === name).map((p) => p.clearance));
    expect(foot('left')).toBeGreaterThan(foot('right') + 0.02);
  });
  it('grounds the lower foot on ascent and descent while allowing the uphill foot to sink', () => {
    for (const slope of [-0.5, 0.5]) {
      const f = fixture(slope);
      const result = f.pose(0.25);
      expect(result.offset).toBeLessThan(-0.1);
      const feet = ['left', 'right']
        .map((foot) => {
          const probes = result.probes.filter((p) => p.foot === foot);
          return {
            foot,
            ground: Math.min(...probes.map((p) => p.ground)),
            clearance: Math.min(...probes.map((p) => p.clearance)),
          };
        })
        .sort((a, b) => a.ground - b.ground);
      expect(feet[0].clearance).toBeLessThan(0.08);
      expect(feet[1].clearance).toBeLessThan(-0.1);
      // All correction is a common translation. The knee angles and segment lengths stay authored.
      const bones = [];
      f.rig.traverse((o) => {
        if (o instanceof THREE.Bone) bones.push(o);
      });
      const before = bones.map((b) => [
        ...b.position.toArray(),
        ...b.quaternion.toArray(),
        ...b.scale.toArray(),
      ]);
      f.pose(0.25, 0, 1 / 60);
      expect(
        bones.map((b) => [
          ...b.position.toArray(),
          ...b.quaternion.toArray(),
          ...b.scale.toArray(),
        ]),
      ).toEqual(before);
    }
  });
  it('settles smoothly through an entire downhill stride instead of snapping between support feet', () => {
    const f = fixture(-0.5, 0.025);
    let previous = f.pose(0).height;
    let maximumStep = 0;
    for (let frame = 1; frame <= 240; frame++) {
      const time = frame / 60;
      const result = f.pose(time / 1.166667, time);
      maximumStep = Math.max(maximumStep, Math.abs(result.height - previous));
      previous = result.height;
      expect(result.offset).toBeGreaterThan(-0.5);
    }
    // At 60 Hz even a support-foot change stays below a three-centimetre step.
    expect(maximumStep).toBeLessThan(0.03);
  });
  it('keeps up with sustained steep descents instead of accumulating a hovering gap', () => {
    const f = fixture(-1.2, 0.025);
    f.pose(0);
    for (let frame = 1; frame <= 240; frame++) {
      const time = frame / 60;
      const result = f.pose(time / 1.166667, time * 1.4);
      expect(result.offset).toBeLessThan(0.2);
    }
  });
  it('holds a pause and authored kneeling pose, and resets cleanly for timeline seeks', () => {
    const f = fixture(-0.4, 0.03);
    const initial = f.pose(0.25);
    expect(initial.offset).toBeLessThan(-0.1);
    expect(f.pose(0.5, 0, 0).height).toBe(initial.height);
    for (let i = 0; i < 60; i++) expect(f.pose(0.8, 0, 1 / 60, false).height).toBe(initial.height);
    f.support.reset();
    const again = f.pose(0.25);
    expect(again.offset).toBeCloseTo(initial.offset, 10);
  });
});
