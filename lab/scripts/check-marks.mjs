import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 620}});
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
// Find the first second at which he is standing still, for a few settings.
const firstStop = async (lookAt, pivot, hold) => {
  await page.evaluate(([lookAt, pivot, hold]) => {
    const s = window.burning.snapshot().score;
    window.burning.applyScore({...s, lookAt, stage_04_look_pivot: pivot, stage_04_look_hold: hold});
  }, [lookAt, pivot, hold]);
  for (let t = 10; t < 60; t += 0.5) {
    const phase = await page.evaluate((t) => {
      window.burning.seek(t);
      return window.burning.snapshot().cue.phase;
    }, t);
    if (phase === 'Looking about') return t;
  }
  return null;
};
for (const [lookAt, pivot, hold] of [[20, 2.4, 5], [20, 1, 2], [30, 2, 4], [40, 3, 6]]) {
  console.log(`lookAt ${lookAt}, pivot ${pivot}, hold ${hold}  ->  he stops at ${await firstStop(lookAt, pivot, hold)}s`);
}
await browser.close();
