import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1100, height: 760}});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const look = async () => page.evaluate(() => {
  const s = window.burning.snapshot();
  return {t: +s.time.toFixed(1), phase: s.cue.phase, mobility: +s.cue.mobility.toFixed(2), driving: s.driving, speed: +s.motion.speed.toFixed(2)};
});
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(500);
const at = await page.evaluate(() => window.burning.snapshot().score.stage_07_crest);
// 1. hands off: he should stop at the crest
await page.evaluate((t) => window.burning.seek(t - 1.5), at);
await page.evaluate(() => window.burning.togglePause());
await page.waitForTimeout(2200);
console.log('hands off, in the window: ', JSON.stringify(await look()));
await page.waitForTimeout(2600);
console.log('hands off, after it:     ', JSON.stringify(await look()));
// 2. driving through the same window: no stop
await page.evaluate(() => window.burning.togglePause());
await page.evaluate((t) => window.burning.seek(t - 1.5), at);
await page.evaluate(() => window.burning.togglePause());
await page.keyboard.down('KeyW');
await page.waitForTimeout(2200);
console.log('driving, in the window:  ', JSON.stringify(await look()));
await page.keyboard.up('KeyW');
// 3. the death still comes, wherever he is
const dur = await page.evaluate(() => window.burning.snapshot().score.duration);
await page.evaluate((t) => window.burning.seek(t), dur - 12);
await page.evaluate(() => window.burning.togglePause());
await page.keyboard.down('KeyW');
await page.waitForTimeout(4000);
console.log('driving, past the kneel: ', JSON.stringify(await look()));
await page.keyboard.up('KeyW');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
