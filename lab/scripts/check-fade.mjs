import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1000, height: 700}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5180/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
const read = async () => page.evaluate(() => ({
  title: +getComputedStyle(document.querySelector('#invitation')).opacity.slice(0, 5),
  chrome: +getComputedStyle(document.querySelector('.masthead')).opacity.slice(0, 5),
}));
console.log('before  ', JSON.stringify(await read()));
await page.locator('#start').click();
for (const ms of [120, 160, 200, 400]) { await page.waitForTimeout(ms); console.log('during  ', JSON.stringify(await read())); }
await page.waitForTimeout(900);
console.log('after   ', JSON.stringify(await read()));
console.log('title hidden:', !(await page.locator('#invitation').isVisible()), ' chrome visible:', await page.locator('.masthead').isVisible(), ' pause button visible:', await page.locator('#pause').isVisible());
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
