import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1100, height: 760}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const look = async () => page.evaluate(() => {
  const s = window.burning.snapshot();
  return {t: +s.time.toFixed(1), phase: s.cue.phase, clip: s.cue.clip, driving: s.driving, playing: s.playing};
});
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(500);
const dur = await page.evaluate(() => window.burning.snapshot().score.duration);
const kneel = await page.evaluate(() => window.burning.snapshot().score.stage_08_kneel);
// Land just before the kneel and walk him hard through it.
await page.evaluate((t) => window.burning.seek(t), kneel - 4);
console.log('after the seek:          ', JSON.stringify(await look()));
await page.evaluate(() => window.burning.togglePause());
await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
console.log('driving, before the kneel:', JSON.stringify(await look()));
await page.waitForTimeout(4000);
console.log('driving, past the kneel:  ', JSON.stringify(await look()));
await page.keyboard.up('KeyW');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
