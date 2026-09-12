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
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  window.gpuSubmissions = 0;
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (...args) {
    window.gpuSubmissions++;
    return submit.apply(this, args);
  };
});
const gpu = () => page.evaluate(() => gpuSubmissions);
const snapshot = () => page.evaluate(() => burning.snapshot());
async function idle() {
  if (release) await page.waitForTimeout(1500);
  else await page.waitForFunction(() => burning.snapshot().rendering.idle, null, {timeout: 10000});
}
async function quiet(label) {
  await idle();
  const before = await gpu();
  const state = release ? null : await snapshot();
  await page.waitForTimeout(2000);
  assert.equal(await gpu(), before, `${label}: static scenes must submit no GPU work`);
  if (state) {
    const after = await snapshot();
    assert.equal(after.rendering.frames, state.rendering.frames);
    assert.equal(after.sea.frames, state.sea.frames);
    assert.equal(after.time, state.time);
  }
  console.log(`${label}: 0 GPU submissions in 2 seconds`);
}
try {
  await page.goto(url);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  await quiet('Opening');
  if (!release) {
    await page.mouse.click(20, 450);
    await page.waitForFunction(() => burning.snapshot().audio.unlocked);
    const before = (await snapshot()).audio.vitals;
    await quiet('Opening with heartbeat');
    const after = (await snapshot()).audio.vitals;
    assert.ok(after.heartbeats > before.heartbeats, 'Heartbeat remains independent of graphics');
  }
  await page.locator('#start').click();
  await page.waitForTimeout(1200);
  await page.locator('#pause').click();
  await quiet('Paused');
  const frozen = release ? null : await snapshot();
  const beforeOrbit = await gpu();
  await page.mouse.move(1100, 500);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(120);
  assert.ok((await gpu()) > beforeOrbit, 'Orbiting wakes rendering');
  await quiet('Paused after smooth zoom');
  if (frozen) {
    const after = await snapshot();
    assert.equal(after.time, frozen.time);
    assert.equal(after.sea.simulationTime, frozen.sea.simulationTime);
    assert.notDeepEqual(after.camera.position, frozen.camera.position);
  }
  const beforeResize = await gpu();
  await page.setViewportSize({width: 390, height: 844});
  // Playwright can return before the browser delivers its resize event. Wait
  // for the required redraw before measuring the subsequent idle interval.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#world');
    return Math.abs(canvas.width / canvas.height - 390 / 844) < 0.002;
  });
  await quiet('Paused after mobile resize');
  assert.ok((await gpu()) > beforeResize, 'Resizing redraws the viewport');
  if (!release) {
    const beforeScrub = await gpu();
    await page.evaluate(() => burning.seek(95));
    await quiet('Timeline scrub');
    assert.equal((await snapshot()).time, 95);
    assert.ok((await gpu()) > beforeScrub, 'Scrubbing redraws the selected scene');
    const beforeLight = await gpu();
    await page.evaluate(() => {
      const s = burning.snapshot();
      burning.applyScore({...s.score, startHour: 23, endHour: 23});
    });
    await quiet('Studio lighting change');
    assert.ok((await gpu()) > beforeLight, 'Studio lighting edits redraw the scene');
    await page.locator('#author-toggle').click();
    await page.locator('#practice').selectOption('kneefall');
    const before = await gpu();
    await page.waitForTimeout(500);
    assert.ok((await gpu()) > before, 'Pose practice stays animated');
    await page.locator('#practice').selectOption('');
    await quiet('After pose practice');
    await page.locator('#author-toggle').click();
    await page.evaluate(() => burning.seek(35));
    await idle();
  }
  await page.locator('#pause').click();
  const beforeResume = await gpu();
  await page.waitForTimeout(800);
  assert.ok((await gpu()) > beforeResume, 'Resume restarts graphics');
  if (!release) {
    const state = await snapshot();
    assert.ok(state.time > 35.3 && state.time < 36.5, 'Resume excludes idle wall time');
    // Exercise the browser visibility contract deterministically, independent of window focus.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await quiet('Hidden tab');
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await quiet('Restored paused tab');
    await page.evaluate(async () => {
      burning.seek(149.7);
      await burning.togglePause();
    });
    await page.waitForTimeout(1100);
    const before = await snapshot();
    const gpuBefore = await gpu();
    await page.waitForTimeout(500);
    const after = await snapshot();
    assert.equal(after.time, 150);
    assert.ok((await gpu()) > gpuBefore, 'Fire and ocean keep moving after the natural ending');
    assert.ok(after.sea.simulationTime > before.sea.simulationTime, 'Final ocean keeps advancing');
    await page.evaluate(() => burning.seek(150));
    await quiet('Frozen ending scrub');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
