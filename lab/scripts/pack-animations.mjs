// Pack the authored knee and stand-up clips into one binary. The two JSON files
// are 2.3 MB of text that the browser has to parse before the body can move;
// the same keyframes as float32 views cost a few kilobytes of header and no
// parse at all. Clip and track names are carried through unchanged.
//
//   node scripts/pack-animations.mjs [sourceDir] [out.bin]
import {readFile, stat, writeFile} from 'node:fs/promises';

const from = process.argv[2] ?? 'tmp/source';
const out = process.argv[3] ?? 'public/animations/clips.bin';
const clips = [];
let text = 0;
let mappedBones = 0;
for (const file of ['kneel.json', 'standup.json']) {
  const raw = await readFile(`${from}/${file}`, 'utf8');
  text += raw.length;
  const data = JSON.parse(raw);
  if (mappedBones && data.mappedBones !== mappedBones)
    throw new Error('The authored files map different skeletons');
  mappedBones = data.mappedBones;
  for (const clip of data.clips) clips.push(clip);
}

const header = {
  mappedBones,
  clips: clips.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.map((track) => ({
      name: track.name,
      type: track.type,
      times: track.times.length,
      values: track.values.length,
    })),
  })),
};
const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
// Four-byte align the float payload so the views can be taken without copying.
const pad = (4 - (headerBytes.length % 4)) % 4;
let floats = 0;
for (const clip of clips)
  for (const track of clip.tracks) floats += track.times.length + track.values.length;
const buffer = Buffer.alloc(8 + headerBytes.length + pad + floats * 4);
buffer.write('BMAN', 0, 'ascii');
buffer.writeUInt32LE(headerBytes.length, 4);
headerBytes.copy(buffer, 8);
const view = new Float32Array(floats);
let at = 0;
for (const clip of clips)
  for (const track of clip.tracks) {
    view.set(track.times, at);
    at += track.times.length;
    view.set(track.values, at);
    at += track.values.length;
  }
Buffer.from(view.buffer).copy(buffer, 8 + headerBytes.length + pad);
await writeFile(out, buffer);
const after = await stat(out);
console.log(
  `animations ${(text / 1048576).toFixed(2)} MB of JSON -> ${(after.size / 1048576).toFixed(2)} MB binary, ` +
    `${clips.length} clips (${clips.map((c) => c.name).join(', ')}), ${floats} keyframe floats, ` +
    `${mappedBones} mapped bones`,
);
