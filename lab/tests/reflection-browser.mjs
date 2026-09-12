import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
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
const results = [];
try {
  await mkdir('artifacts', {recursive: true});
  for (const backend of ['webgpu', 'webgl']) {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript((backend) => {
      if (backend === 'webgl') Object.defineProperty(navigator, 'gpu', {value: undefined});
      window.shaderBuilds = 0;
      for (const [prototype, names] of [
        [GPUDevice.prototype, ['createRenderPipeline', 'createRenderPipelineAsync']],
        [WebGL2RenderingContext.prototype, ['compileShader']],
      ]) {
        for (const name of names) {
          const original = prototype[name];
          prototype[name] = function (...args) {
            window.shaderBuilds++;
            return original.apply(this, args);
          };
        }
      }
    }, backend);
    await page.goto(`${process.env.URL ?? 'http://127.0.0.1:5180'}/?quality=balanced`);
    await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
    await page.addStyleTag({content: '#world {pointer-events:none !important}'});
    await page.locator('#start').click();
    await page.evaluate(async () => {
      burning.seek(45);
      await burning.togglePause();
    });
    await page.waitForTimeout(3000);
    const before = await page.evaluate(() => ({builds: shaderBuilds, state: burning.snapshot()}));
    await page.waitForTimeout(16000);
    const after = await page.evaluate(() => ({builds: shaderBuilds, state: burning.snapshot()}));
    const result = {
      backend: after.state.renderer,
      seconds: after.state.time - before.state.time,
      hourChange: after.state.lighting.hour - before.state.lighting.hour,
      shaderBuilds: after.builds - before.builds,
      heartbeats: after.state.audio.vitals.heartbeats - before.state.audio.vitals.heartbeats,
      errors,
    };
    assert.equal(result.backend, backend);
    assert.ok(result.seconds > 14);
    // More than five reflection refreshes must update sunset without recompiling materials.
    assert.ok(result.hourChange > 0.015 * 5);
    assert.equal(result.shaderBuilds, 0, JSON.stringify(result));
    assert.ok(result.heartbeats > 10, JSON.stringify(result));
    assert.deepEqual(errors, []);
    await page.evaluate(() => burning.togglePause());
    await page.screenshot({path: `artifacts/reflection-${backend}.png`});
    results.push(result);
    console.log(JSON.stringify(result));
    await page.close();
  }
  await writeFile('artifacts/reflection-performance.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
