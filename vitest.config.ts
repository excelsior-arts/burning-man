import {defineConfig} from 'vitest/config';
// The suites live in lab/ beside the benches and the harnesses that use them.
// Those that survey the whole ground take seconds rather than milliseconds and
// live behind npm run test:slow, so the default run stays a quick check.
const slow = process.env.SLOW === '1';
export default defineConfig({
  test: {
    include: [slow ? 'lab/tests/**/*.slow.test.{ts,mjs}' : 'lab/tests/**/*.test.{ts,mjs}'],
    exclude: slow ? ['node_modules/**'] : ['lab/tests/**/*.slow.test.{ts,mjs}', 'node_modules/**'],
  },
});
