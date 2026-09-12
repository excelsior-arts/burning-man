import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1280, height: 800}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/');   // Auto, as a visitor gets it
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(500);
const dur = await page.evaluate(() => window.burning.snapshot().score.duration);
await page.evaluate((t) => window.burning.seek(t - 2), dur);
await page.evaluate(() => window.burning.togglePause());
const read = async () => page.evaluate(() => {
  const g = window.burning.snapshot().graphics;
  return {tier: g.tier, scale: g.scale, changes: g.changes, fps: +g.fps.toFixed(1), slow: +g.slowFraction.toFixed(2), reason: g.reason};
});
await page.waitForTimeout(3000);
console.log('just after the end: ', JSON.stringify(await read()));
for (const s of [10, 20, 30]) {
  await page.waitForTimeout(10000);
  console.log(`sitting ${String(s).padStart(2)}s later:  `, JSON.stringify(await read()));
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
