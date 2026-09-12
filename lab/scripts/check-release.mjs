import {readdir, readFile, stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
async function files(root) {
  const out = [];
  for (const e of await readdir(root, {withFileTypes: true})) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
const built = await files('docs');
for (const p of built) {
  assert.ok(!/\.(?:map|fbx|blend|ts)$/.test(p), `Source asset in release: ${p}`);
  assert.ok(!/panel-|threejs-water-pro\/|\/blender\//.test(p), `Unexpected release file: ${p}`);
  // Nothing in the published site may name the machine it was built on, the
  // disk it was built from, or anything else that lives outside this project.
  // Binaries carry this too: a render leaves its source scene's path in a PNG
  // chunk. Matched by shape rather than by name, so this list gives nothing
  // away and still catches a path or a hostname that has not been seen before.
  const raw = await readFile(p, 'latin1');
  const code = /\.(?:js|css|html)$/.test(p);
  for (const shape of [
    /\/Users\//,
    /\/home\/[a-z]/,
    /\/private\/tmp\//,
    /["'`][\w-]+\.local["'`]/,
    // Only outside code: three.js is full of `blendSrc` and the like.
    ...(code ? [] : [/\.blend\b/]),
  ])
    assert.ok(!shape.test(raw), `Private reference in release: ${shape} in ${p}`);
  if (/\.(?:js|css|html)$/.test(p)) {
    const body = await readFile(p, 'utf8');
    for (const marker of [
      'author-panel',
      'author-timeline',
      'SCRIPTED JOURNEY',
      'burning-man-score-v1',
      'Shape the experience.',
      'author-toggle',
      'graphics-quality',
      'Altar shortcuts',
      'data-jump',
      'jumpToAltar',
    ])
      assert.ok(!body.includes(marker), `Author code in release: ${marker}`);
  }
}
assert.deepEqual(
  built.filter((p) => p.endsWith('.glb')),
  ['docs/character/man.glb'],
);
assert.equal(built.filter((p) => p.startsWith('docs/animations/')).length, 1);
assert.ok((await stat('docs/character/body-detail.bin')).size > 16);
assert.ok((await stat('docs/character/man.glb')).size > 1_000_000);
console.log(
  'Release audit passed: one body, one animation pack, no author panel or source maps.',
);
