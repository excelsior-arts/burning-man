import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1000, height: 700}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
const walk = await page.evaluate(() => window.burning.snapshot().score.stage_03_walk);
console.log('he can be walked from', walk, 's');
await page.locator('#start').click();
for (const at of [2, 5, 8, 11, 14]) {
  await page.waitForFunction((t) => window.burning.snapshot().time >= t, at, {timeout: 60000});
  const v = await page.evaluate(() => ({t: +window.burning.snapshot().time.toFixed(1), shown: +getComputedStyle(document.querySelector('.hint')).opacity > 0.05}));
  console.log(`  at ${String(v.t).padStart(4)}s  hint ${v.shown ? 'visible' : 'not shown'}`);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
