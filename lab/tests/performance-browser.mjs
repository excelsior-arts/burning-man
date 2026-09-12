import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--window-position=-3000,-3000',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
await mkdir('artifacts', {recursive: true});
const results = [];
try {
  const base = process.env.URL ?? 'http://127.0.0.1:5180';
  const cases = ['high', 'balanced', 'low'].map((tier) => [tier, `${base}/?quality=${tier}`]);
  if (process.env.BASELINE_URL) cases.unshift(['before', process.env.BASELINE_URL]);
  for (const [label, url] of cases) {
    const page = await browser.newPage({
      viewport: {width: 1440, height: 900},
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.counters = {submissions: 0, draws: 0, triangles: 0, frames: 0};
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (...args) {
        counters.submissions++;
        return submit.apply(this, args);
      };
      for (const name of ['draw', 'drawIndexed']) {
        const original = GPURenderPassEncoder.prototype[name];
        GPURenderPassEncoder.prototype[name] = function (count, instances = 1, ...rest) {
          counters.draws++;
          counters.triangles += (count * instances) / 3;
          return original.call(this, count, instances, ...rest);
        };
      }
      const original = GPUCanvasContext.prototype.getCurrentTexture;
      const seen = new WeakSet();
      GPUCanvasContext.prototype.getCurrentTexture = function (...args) {
        const t = original.apply(this, args);
        if (!seen.has(t)) {
          seen.add(t);
          counters.frames++;
        }
        return t;
      };
    });
    await page.goto(url);
    await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
    await page.addStyleTag({content: '#world {pointer-events:none !important}'});
    await page.locator('#start').click();
    await page.waitForTimeout(8000);
    const before = await page.evaluate(() => ({...counters, at: performance.now()}));
    await page.waitForTimeout(5000);
    const result = await page.evaluate((before) => {
      const seconds = (performance.now() - before.at) / 1000;
      const frames = counters.frames - before.frames;
      return {
        seconds,
        frames,
        fps: frames / seconds,
        submissionsPerSecond: (counters.submissions - before.submissions) / seconds,
        drawsPerFrame: (counters.draws - before.draws) / frames,
        trianglesPerFrame: (counters.triangles - before.triangles) / frames,
        width: document.querySelector('canvas').width,
        height: document.querySelector('canvas').height,
        graphics: window.burning?.snapshot().graphics,
      };
    }, before);
    results.push({label, ...result, errors});
    console.log(JSON.stringify(results.at(-1)));
    await page.locator('#pause').click();
    await page.waitForTimeout(1500);
    await page.screenshot({path: `artifacts/performance-${label}.png`});
    await page.close();
  }
  await writeFile('artifacts/performance-comparison.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
