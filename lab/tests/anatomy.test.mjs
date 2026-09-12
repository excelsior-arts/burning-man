import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {decodeClips} from '../../src/character/clip-pack';

/** The authored clips now ship as one binary pack instead of two JSON files. */
const pack = () => {
  const bytes = readFileSync('public/animations/clips.bin');
  return decodeClips(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
async function rig(withMesh = false) {
  const file = readFileSync('public/character/man.glb');
  const jsonSize = file.readUInt32LE(12);
  const doc = JSON.parse(file.subarray(20, 20 + jsonSize).toString());
  // Load the actual skeleton and clips without requesting browser-only textures.
  if (!withMesh) {
    for (const node of doc.nodes) {
      delete node.mesh;
      delete node.skin;
    }
    delete doc.meshes;
    delete doc.skins;
    delete doc.materials;
    delete doc.textures;
    delete doc.images;
  }
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const bin = file.subarray(20 + jsonSize);
  const glb = Buffer.alloc(20 + padded.length + bin.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  bin.copy(glb, 20 + padded.length);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
    '',
  );
}
it('maps authored Mixamo actions to the Blender rig without changing limb lengths', async () => {
  const {scene: root} = await rig();
  const mixer = new THREE.AnimationMixer(root);
  const pairs = [
    ['LeftUpLeg', 'LeftLeg'],
    ['LeftLeg', 'LeftFoot'],
    ['RightUpLeg', 'RightLeg'],
    ['RightLeg', 'RightFoot'],
    ['LeftArm', 'LeftForeArm'],
    ['LeftForeArm', 'LeftHand'],
  ].map((pair) => pair.map((name) => root.getObjectByName(`mixamorig1${name}`)));
  const length = ([a, b]) =>
    a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
  root.updateWorldMatrix(true, true);
  const rest = pairs.map(length);
  {
    const data = pack();
    expect(data.mappedBones).toBe(52);
    for (const clip of data.clips) {
      for (const track of clip.tracks)
        expect(root.getObjectByName(track.name.split('.')[0])).toBeTruthy();
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).play();
      let minHip = Infinity,
        maxHip = -Infinity;
      for (let t = 0; t < clip.duration; t += 0.1) {
        action.time = t;
        mixer.update(0);
        root.updateWorldMatrix(true, true);
        pairs.forEach((pair, i) => expect(length(pair)).toBeCloseTo(rest[i], 5));
        const y = root.getObjectByName('mixamorig1Hips').getWorldPosition(new THREE.Vector3()).y;
        minHip = Math.min(y, minHip);
        maxHip = Math.max(y, maxHip);
      }
      if (clip.name === 'KneeFall' || clip.name === 'StandUp')
        expect(maxHip - minHip).toBeGreaterThan(0.3);
      const rootTrack = clip.tracks.find((t) => t.name.endsWith('Hips.position'));
      for (let i = 0; clip.name !== 'Settle' && i < rootTrack.values.length; i += 3) {
        expect(rootTrack.values[i]).toBe(rootTrack.values[0]);
        expect(rootTrack.values[i + 2]).toBe(rootTrack.values[2]);
      }
    }
  }
});

it('restores a single uninterrupted charcoal face without eye or mouth geometry', async () => {
  const {scene: root} = await rig(true);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  expect(meshes).toHaveLength(1);
  expect(meshes[0].material.name).toBe('Charcoal skin');
  expect(root.getObjectByName('Dark amber eyes')).toBeUndefined();
});

it('separates the hands during recovery and settles onto the heels without moving the feet', async () => {
  const {scene: root} = await rig();
  const mixer = new THREE.AnimationMixer(root);
  const point = (name) =>
    root.getObjectByName(`mixamorig1${name}`).getWorldPosition(new THREE.Vector3());
  const data = pack();
  const clip = (name) => data.clips.find((c) => c.name === name);
  const sample = (clip, time) => {
    mixer.stopAllAction();
    const a = mixer.clipAction(clip).play();
    a.time = Math.min(time, clip.duration - 0.0001);
    mixer.update(0);
    root.updateMatrixWorld(true);
  };
  const kneel = clip('Kneeling');
  sample(kneel, 1);
  const hips = point('Hips'),
    hands = ['LeftHand', 'RightHand'].map(point),
    feet = ['LeftFoot', 'RightFoot'].map(point);
  expect(hands[0].distanceTo(hands[1])).toBeGreaterThan(0.4);
  for (const hand of hands) expect(hand.y - hips.y).toBeLessThan(0.05);
  const settle = clip('Settle');
  let previous = hips;
  for (let t = 0; t < settle.duration; t += 1 / 30) {
    sample(settle, t);
    const next = point('Hips');
    expect(next.distanceTo(previous)).toBeLessThan(0.012);
    previous = next;
    for (const [i, side] of ['Left', 'Right'].entries()) {
      expect(point(`${side}Foot`).distanceTo(feet[i])).toBeLessThan(0.001);
      expect(point(`${side}Leg`).y).toBeGreaterThan(0.025);
    }
  }
  sample(settle, 4);
  expect(hips.y - point('Hips').y).toBeGreaterThan(0.14);
  expect(hips.z - point('Hips').z).toBeGreaterThan(0.24);
  expect(Math.abs(point('Hips').z - (feet[0].z + feet[1].z) / 2)).toBeLessThan(0.1);
  const stand = clip('StandUp');
  sample(stand, 0);
  expect(point('LeftHand').y - point('Hips').y).toBeLessThan(0.08);
  sample(stand, stand.duration);
  expect(point('Hips').y).toBeGreaterThan(0.94);
});
