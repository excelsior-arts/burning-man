import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
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
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('**/src/experience/main.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        '\nwindow.readbackReview={renderer,frameLoop,sea,transport,man,walker};\n',
    });
  });
  await page.goto(`${process.env.URL ?? 'http://127.0.0.1:5180'}/?quality=balanced`);
  await page.waitForFunction(
    () => window.readbackReview && !document.querySelector('#start').disabled,
    null,
    {timeout: 90000},
  );
  await page.locator('#start').click();
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const {renderer, frameLoop, sea, transport, man, walker} = readbackReview;
    const original = renderer.getArrayBufferAsync;
    window.delayedReadbacks = [];
    let reads = 0;
    renderer.getArrayBufferAsync = async function (...args) {
      const data = await original.apply(this, args);
      if (++reads % 60 === 0) {
        const frames = frameLoop.inspect().frames,
          at = transport.time,
          waves = sea.inspect().waveTime,
          distance = walker.state.distance,
          emitted = man.inspect().fire.emitted;
        await new Promise((resolve) => setTimeout(resolve, 180));
        delayedReadbacks.push({
          frames: frameLoop.inspect().frames - frames,
          elapsed: transport.time - at,
          waves: sea.inspect().waveTime - waves,
          walked: walker.state.distance - distance,
          emitted: man.inspect().fire.emitted - emitted,
        });
      }
      return data;
    };
  });
  await page.waitForFunction(() => delayedReadbacks.length >= 3, null, {timeout: 20000});
  const samples = await page.evaluate(() => delayedReadbacks);
  console.log('Frames drawn during each delayed readback:', samples);
  if (!process.env.BASELINE)
    for (const sample of samples) {
      assert.ok(sample.frames >= 4, 'A slow water-height readback must not hold the frame loop');
      assert.ok(sample.walked > 0.05 && sample.emitted > 0, 'Walking and fire must advance');
      assert.ok(
        sample.elapsed > 0.1 && sample.waves > 0.1,
        'Character and ocean clocks must keep advancing',
      );
    }
  await page.evaluate(() => burning.togglePause());
  await page.waitForFunction(() => readbackReview.frameLoop.inspect().idle);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
