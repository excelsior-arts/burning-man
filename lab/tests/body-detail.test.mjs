import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {bodyDetailIndices} from '../../src/character/body-detail';
const bytes = readFileSync(new URL('../../public/character/body-detail.bin', import.meta.url));
const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
it('ships bounded levels referring only to original skinned vertices', () => {
  const levels = bodyDetailIndices(data, 107125);
  expect(levels.balanced.count / 3).toBe(70000);
  expect(levels.low.count / 3).toBe(28000);
  for (const level of Object.values(levels))
    for (let i = 0; i < level.count; i += 3) {
      const a = level.getX(i),
        b = level.getX(i + 1),
        c = level.getX(i + 2);
      if (a === b || a === c || b === c) throw new Error('Collapsed triangle in body detail');
    }
});
it('rejects a stale body shelf, truncated indices and out-of-range vertices', () => {
  expect(() => bodyDetailIndices(data, 100)).toThrow('does not match');
  expect(() => bodyDetailIndices(data.slice(0, 12), 107125)).toThrow('Invalid');
  const broken = data.slice(0);
  new Uint32Array(broken)[4] = 107125;
  expect(() => bodyDetailIndices(broken, 107125)).toThrow('invalid vertex');
});
