import {beforeAll, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {AnimationMixer, Group, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {decodeClips} from '../../src/character/clip-pack';
import {SandContacts} from '../../src/sand/contacts';
import {motionAt} from '../../src/character/manual-gait';
import profiles from '../../src/character/locomotion-data.json';

let asset, clips;
const read = async path => {
  const bytes = await readFile(new URL(path, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
beforeAll(async () => {
  asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    await read('../../public/character/man.glb'), '',
  );
  clips = decodeClips(await read('../../public/animations/locomotion.bin')).clips;
});

it('binds all captured tracks to the shipped rig with finite, normalized rotations', () => {
  expect(clips).toHaveLength(7);
  for (const clip of clips) {
    expect(clip.validate()).toBe(true);
    for (const track of clip.tracks) {
      expect(asset.scene.getObjectByName(track.name.split('.')[0])?.isBone).toBe(true);
      expect([...track.values].every(Number.isFinite)).toBe(true);
      if (track.name.endsWith('.quaternion'))
        for (let i = 0; i < track.values.length; i += 4)
          expect(Math.hypot(...track.values.slice(i, i + 4))).toBeCloseTo(1, 5);
    }
    if (profiles[clip.name]) expect(clip.duration).toBeCloseTo(profiles[clip.name].duration, 5);
  }
});

it('turns the actual legs and creates bounded sole scuffs without moving the controller', () => {
  for (const clip of clips.filter(c => c.name.startsWith('turn'))) {
    const rig = clone(asset.scene), body = new Group(); body.add(rig);
    const mixer = new AnimationMixer(rig), action = mixer.clipAction(clip).play();
    const events = [], contacts = new SandContacts({height: () => 0, contact: e => events.push(e)});
    const state = {gesture: {clip: clip.name, time: 0}};
    const p = new Vector3(), toe = new Vector3(), knee = new Vector3();
    const legPositions = [];
    const feet = [0, 1].map(() => ({x: 0, y: 0, z: 0, facing: 0}));
    for (let t = 0; t < clip.duration + 0.6; t += 1 / 60) {
      action.time = Math.min(t, clip.duration - 0.00001);
      body.rotation.y = profiles[clip.name].angle * motionAt(clip.name, t);
      mixer.update(0); body.updateWorldMatrix(true, true);
      for (const [i, side] of ['Left', 'Right'].entries()) {
        rig.getObjectByName(`mixamorig1${side}Foot`).getWorldPosition(p);
        rig.getObjectByName(`mixamorig1${side}ToeBase`).getWorldPosition(toe);
        Object.assign(feet[i], {x: (p.x + toe.x) / 2, z: (p.z + toe.z) / 2,
          y: Math.min(p.y - 0.099, toe.y - 0.028), facing: Math.atan2(toe.x-p.x, toe.z-p.z)});
      }
      rig.getObjectByName('mixamorig1LeftLeg').getWorldPosition(knee);
      // Remove world yaw: any remaining motion is articulation, not a spun mesh.
      knee.applyAxisAngle(new Vector3(0, 1, 0), -body.rotation.y);
      legPositions.push(knee.clone());
      contacts.updatePose(state, feet, 1 / 60);
    }
    expect(Math.max(...legPositions.map(p => p.distanceTo(legPositions[0])))).toBeGreaterThan(0.06);
    expect(events.length, clip.name).toBeGreaterThan(0);
    expect(events.length, clip.name).toBeLessThanOrEqual(5);
    expect(body.position.length()).toBe(0);
    const count = events.length;
    for (let i = 0; i < 180; i++) contacts.updatePose(state, feet, 1 / 60);
    expect(events.length).toBe(count);
    contacts.updatePose(state, feet.map(f => ({...f, x: f.x + 1})), 0);
    expect(events.length).toBe(count);
  }
});
