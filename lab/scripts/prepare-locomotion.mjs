// Retarget the private Mixamo sources onto the existing body. Keep captures in
// tmp/animation-sources/locomotion; only this character's packed motion ships.
// node lab/scripts/prepare-locomotion.mjs [source directory]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const from = process.argv[2] ?? 'tmp/animation-sources/locomotion';
const bytes = fs.readFileSync('public/character/man.glb');
const body = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
);
const entries = [
  ['TurnLeft90', 'turnleft90', 'turn'],
  ['TurnRight90', 'turnright90', 'turn'],
  ['TurnLeft180', 'turnleft180', 'turn'],
  ['TurnRight180', 'turnright180', 'turn'],
  ['StartWalking', 'startwalk', 'travel', 0, 50],
  ['StopWalking', 'stopwalk', 'travel', 40, 90],
  ['WeightShift', 'idleweight', 'idle'],
];
const axis = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion(), yawQ = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const clips = [], profiles = {};
for (const [file, name, kind, first, last] of entries) {
  const bytes = fs.readFileSync(path.join(from, `${file}.fbx`));
  const source = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let clip = source.animations[0].clone();
  if (first !== undefined) clip = THREE.AnimationUtils.subclip(clip, name, first, last + 1, 30);
  clip.name = name;
  const hip = source.getObjectByName('mixamorig1Hips');
  const targetHip = body.scene.getObjectByName(hip.name);
  const size = targetHip.position.y / hip.position.y;
  // The body is centimetres inside its armature, metres in the world.
  const unit = targetHip.parent.getWorldScale(new THREE.Vector3()).y;
  const rotation = clip.tracks.find(t => t.name === `${hip.name}.quaternion`);
  const position = clip.tracks.find(t => t.name === `${hip.name}.position`);
  const yaws = [];
  for (let i = 0; i < rotation.times.length; i++) {
    const yaw = euler.setFromQuaternion(q.fromArray(rotation.values, i * 4), 'YXZ').y;
    const previous = yaws.at(-1) ?? yaw;
    yaws.push(previous + Math.atan2(Math.sin(yaw - previous), Math.cos(yaw - previous)));
  }
  const angle = yaws.at(-1) - yaws[0];
  const motion = [];
  let travel = 0;
  const start = [...position.values.slice(0, 3)];
  for (let i = 0; i < position.times.length; i++) {
    const forward = (position.values[i * 3 + 2] - start[2]) * size * unit;
    if (kind === 'travel') travel = Math.max(travel, forward);
    motion.push(travel);
    // Preserve the captured sideways balance and vertical bob, removing only
    // the forward displacement the controller will apply in world space.
    let x = (position.values[i * 3] - start[0]) * size;
    let z = (position.values[i * 3 + 2] - start[2]) * size - travel / unit;
    if (kind === 'turn') {
      const yaw = yaws[i] - yaws[0];
      const a = x * Math.cos(yaw) - z * Math.sin(yaw);
      z = x * Math.sin(yaw) + z * Math.cos(yaw);
      x = a;
    }
    position.values[i * 3] = targetHip.position.x + x;
    position.values[i * 3 + 1] *= size;
    position.values[i * 3 + 2] = targetHip.position.z + z;
  }
  for (const track of clip.tracks) {
    const boneName = track.name.split('.')[0];
    const bone = source.getObjectByName(boneName), target = body.scene.getObjectByName(boneName);
    if (!bone?.isBone || !target?.isBone) throw new Error(`Unmapped bone: ${boneName}`);
    if (!track.name.endsWith('.quaternion')) continue;
    const correction = target.quaternion.clone().multiply(bone.quaternion.clone().invert());
    for (let i = 0; i < track.times.length; i++) {
      q.fromArray(track.values, i * 4).premultiply(correction);
      if (kind === 'turn' && track === rotation)
        q.premultiply(yawQ.setFromAxisAngle(axis, -(yaws[i] - yaws[0])));
      q.normalize().toArray(track.values, i * 4);
    }
  }
  if (kind !== 'idle') {
    const curve = kind === 'turn' ? yaws.map(y => (y - yaws[0]) / angle) : motion;
    const n = Math.min(10, curve.length - 1);
    const speed = kind !== 'travel' ? 0 : name === 'startwalk'
      ? (motion.at(-1) - motion.at(-1 - n)) / (position.times.at(-1) - position.times.at(-1 - n))
      : (motion[n] - motion[0]) / (position.times[n] - position.times[0]);
    profiles[name] = {
      duration: clip.duration, angle: kind === 'turn' ? angle : 0,
      speed, times: [...position.times], curve,
    };
  }
  clips.push(THREE.AnimationClip.toJSON(clip));
  console.log(`${name}: ${clip.duration.toFixed(2)}s, ${kind === 'turn' ? `${(angle * 180 / Math.PI).toFixed(1)} degrees` : `${travel.toFixed(3)}m travel`}`);
}

const header = {mappedBones: 52, clips: clips.map(c => ({
  name: c.name, duration: c.duration,
  tracks: c.tracks.map(t => ({name: t.name, type: t.type, times: t.times.length, values: t.values.length})),
}))};
const text = Buffer.from(JSON.stringify(header)), padding = (4 - text.length % 4) % 4;
const values = new Float32Array(clips.reduce((n,c) => n + c.tracks.reduce((m,t) => m + t.times.length + t.values.length, 0), 0));
let offset = 0;
for (const c of clips) for (const t of c.tracks) for (const data of [t.times, t.values]) {
  values.set(data, offset); offset += data.length;
}
const pack = Buffer.alloc(8 + text.length + padding + values.byteLength);
pack.write('BMAN'); pack.writeUInt32LE(text.length, 4); text.copy(pack, 8);
Buffer.from(values.buffer).copy(pack, 8 + text.length + padding);
fs.writeFileSync('public/animations/locomotion.bin', pack);
fs.writeFileSync('src/character/locomotion-data.json', JSON.stringify(profiles, (_, v) => typeof v === 'number' ? Number(v.toFixed(6)) : v) + '\n');
console.log(`Packed ${clips.length} clips into ${(pack.length / 1024).toFixed(0)} KiB`);
