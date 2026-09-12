import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const url = process.env.URL ?? 'http://127.0.0.1:5180';
const release = process.env.RELEASE === '1';
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
const errors = [];
async function create(query = '', slow = false, webgl = false) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2});
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(
    ({slow, webgl}) => {
      if (webgl) Object.defineProperty(navigator, 'gpu', {value: undefined});
      // Emulate a slow display/GPU delivery cadence without changing simulation
      // time. The delay has to be clearly worse than Balanced's 30 fps budget.
      if (slow) {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) =>
          raf((time) => setTimeout(() => cb(performance.now()), 50));
      }
      window.gpuSubmissions = 0;
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (...args) {
        gpuSubmissions++;
        return submit.apply(this, args);
      };
    },
    {slow, webgl},
  );
  await page.goto(url + query);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  // Keep unrelated native mouse movement out of a controlled graphics comparison.
  await page.addStyleTag({content: '#world { pointer-events:none !important; }'});
  return page;
}
const state = (page) => page.evaluate(() => burning.snapshot());
async function idle(page) {
  await page.waitForFunction(() => burning.snapshot().rendering.idle, null, {timeout: 10000});
}
try {
  const page = await create('?quality=low');
  if (release) {
    assert.equal(await page.evaluate(() => typeof window.burning), 'undefined');
    await page.locator('#start').click();
    await page.waitForTimeout(2500);
    assert.match(await page.locator('#progress').innerText(), /^2:2[78]$/);
    await page.locator('#pause').click();
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => gpuSubmissions);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => gpuSubmissions), before);
    assert.ok(await page.locator('#world').evaluate((c) => c.width * c.height <= 950000));
    await page.close();
  } else {
    await page.evaluate(() => burning.seek(35));
    await idle(page);
    let reference = await state(page);
    assert.equal(reference.graphics.tier, 'low');
    const referencePixels = {};
    for (const tier of ['high', 'balanced', 'low', 'high', 'balanced']) {
      await page.evaluate((tier) => burning.setQuality(tier), tier);
      await idle(page);
      const s = await state(page);
      assert.equal(s.time, 35);
      assert.equal(s.graphics.tier, tier);
      assert.equal(s.sea.quality, tier === 'low' ? 'low' : 'medium');
      assert.equal(s.sea.cascades, tier === 'low' ? 1 : 2);
      assert.deepEqual(s.sea.waveSettings, reference.sea.waveSettings);
      assert.equal(s.sea.waveTime, reference.sea.waveTime);
      // Balanced is a cadence step: it keeps High's body and High's pixels.
      assert.equal(s.character.triangles, {high: 207874, balanced: 207874, low: 28000}[tier]);
      assert.equal(s.graphics.targetFps, {high: 60, balanced: 30, low: 30}[tier]);
      for (const [joint, position] of Object.entries(s.character.posture))
        assert.ok(
          position.every((v, i) => Math.abs(v - reference.character.posture[joint][i]) < 1e-6),
          'Detail must retain the authored skeleton',
        );
      assert.deepEqual(s.motion, reference.motion);
      assert.ok(
        s.camera.position.every((v, i) => Math.abs(v - reference.camera.position[i]) < 1e-6),
        'Quality must not move the camera',
      );
      assert.equal(s.sea.simulationTime, reference.sea.simulationTime);
      const pixels = s.graphics.width * s.graphics.height;
      referencePixels[tier] ??= pixels;
      assert.ok(pixels <= {high: 3200000, balanced: 3200000, low: 950000}[tier]);
      if (tier === 'balanced') assert.equal(pixels, referencePixels.high);
      assert.equal(s.lighting.shadowMapSize, tier === 'low' ? 2048 : 4096);
      const before = await page.evaluate(() => gpuSubmissions);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => gpuSubmissions), before);
      await page.screenshot({path: `artifacts/quality-${tier}.png`});
    }
    await page.locator('#author-toggle').click();
    await page.locator('#graphics-quality').selectOption('low');
    await idle(page);
    assert.equal((await state(page)).graphics.tier, 'low');
    await page.locator('#author-toggle').click();
    // The exhaustion cue now starts at 35 s. Test walking after recovery.
    await page.evaluate(() => burning.seek(55));
    await idle(page);
    reference = await state(page);
    await page.evaluate(() => burning.togglePause());
    const at = (await state(page)).time;
    await page.waitForTimeout(2100);
    const playing = await state(page);
    assert.ok(playing.time - at > 1.8 && playing.time - at < 2.4);
    assert.ok(playing.motion.distance > reference.motion.distance);
    await page.evaluate(() => burning.togglePause());
    await idle(page);
    await page.setViewportSize({width: 390, height: 844});
    await idle(page);
    assert.ok((await state(page)).camera.aspect < 1);
    await page.evaluate(() => burning.seek(132));
    await idle(page);
    await page.evaluate(() => burning.setQuality('high'));
    await idle(page);
    await page.screenshot({path: 'artifacts/quality-shore-high.png'});
    await page.evaluate(() => burning.setQuality('low'));
    await idle(page);
    await page.screenshot({path: 'artifacts/quality-shore-low.png'});
    await page.close();
    const slow = await create('', true);
    await slow.evaluate(async () => {
      burning.seek(35);
      await burning.togglePause();
    });
    await slow.waitForFunction(
      () => {
        const s = burning.snapshot();
        return (
          s.graphics.tier === 'low' &&
          s.graphics.width * s.graphics.height <= 950000 &&
          s.character.detail === 'low' &&
          s.sea.quality === 'low'
        );
      },
      null,
      {
        timeout: 20000,
      },
    );
    const adapted = await state(slow);
    assert.equal(adapted.graphics.mode, 'auto');
    assert.ok(adapted.time > 42);
    console.log('Sustained slow frames select Low:', adapted.graphics);
    await slow.close();
    const gl = await create('', false, true);
    assert.equal((await state(gl)).renderer, 'webgl');
    assert.equal((await state(gl)).graphics.tier, 'low');
    assert.equal((await state(gl)).sea.quality, 'low');
    await gl.evaluate(async () => {
      burning.seek(35);
      await burning.togglePause();
    });
    await gl.waitForTimeout(1500);
    assert.ok((await state(gl)).time > 35.5);
    await gl.evaluate(() => burning.togglePause());
    await idle(gl);
    await gl.screenshot({path: 'artifacts/quality-webgl.png'});
    await gl.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${release ? 'Public' : 'Author'} graphics quality checks passed.`);
} finally {
  await browser.close();
}
