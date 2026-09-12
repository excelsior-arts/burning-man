import {chromium} from '@playwright/test';
const dir = (process.env.OUT ?? 'artifacts');
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1200, height: 820}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=high');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(1500);
// The opening camera looks east, straight at the ground the monument stands on.
await page.screenshot({path: `${dir}/east-opening.png`});
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
