import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
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
  const page = await browser.newPage({viewport: {width: 1280, height: 960}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.URL ?? 'http://127.0.0.1:5180'}/?quality=low`);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  await page.evaluate(() => burning.seek(55));
  const before = await page.evaluate(() => burning.snapshot().score);
  await page.locator('#author-toggle').click();
  await page.locator('summary').filter({hasText: 'Sound mix'}).click();
  await page.locator('[data-heart-preview="40"]').click();
  await page.waitForFunction(() => burning.snapshot().audio.vitals.previewPitch === 40);
  assert.deepEqual(await page.evaluate(() => burning.snapshot().score), before);
  assert.equal(await page.evaluate(() => burning.snapshot().time), 55);
  assert.equal(await page.evaluate(() => burning.snapshot().playing), false);
  await mkdir('artifacts', {recursive: true});
  await page.screenshot({path: 'artifacts/heartbeat-options.png'});
  await page.locator('#heartbeat-stop').click();
  assert.equal(await page.evaluate(() => burning.snapshot().audio.vitals.previewPitch), null);
  await page.locator('#heartbeat-use').click();
  assert.deepEqual(await page.evaluate(() => burning.snapshot().score), {
    ...before,
    heartbeatPitch: 40,
  });
  assert.equal(await page.locator('[data-slider=heartbeatPitch]').inputValue(), '40');
  assert.equal(await page.evaluate(() => burning.snapshot().audio.vitals.pitch), 40);
  assert.equal(await page.evaluate(() => burning.snapshot().time), 55);
  await page.locator('#save-draft').click();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('burning-man-score-v1')).heartbeatPitch,
    ),
    40,
  );
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-score').click();
  const file = await downloaded;
  const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
  assert.deepEqual(exported, {...before, heartbeatPitch: 40});
  await page.locator('[data-slider=heartbeatPitch]').evaluate((input) => {
    input.value = '36';
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  assert.equal(await page.evaluate(() => burning.snapshot().audio.vitals.pitch), 36);
  await page.locator('#heartbeat-current').click();
  await page.waitForFunction(() => burning.snapshot().audio.vitals.previewPitch === 36);
  await page.locator('#heartbeat-stop').click();
  await page.locator('#load-draft').click();
  assert.equal(await page.evaluate(() => burning.snapshot().score.heartbeatPitch), 40);
  assert.deepEqual(errors, []);
  console.log(
    'Heartbeat previews preserve paused score/time; Use, Hz slider, draft and export passed.',
  );
} finally {
  await browser.close();
}
