import {chromium} from '@playwright/test';
const dir = process.env.OUT ?? 'artifacts';
const tag = process.argv[2] ?? 'kneel';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1280, height: 800}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=high');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
for (const [label, t] of [['kneel', s.stage_08_kneel + 1.5], ['settle', s.stage_09_settle + 2], ['bow', s.stage_10_bow + 2]]) {
  await page.evaluate((t) => window.burning.seek(t), t);
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => window.burning.snapshot().rendering.idle, null, {timeout: 60000});
  await page.screenshot({path: `${dir}/${tag}-${label}.png`});
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
