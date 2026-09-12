import {chromium} from '@playwright/test';
const dir = (process.env.OUT ?? 'artifacts');
const tag = process.argv[2] ?? 'now';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1100, height: 800}});
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=high');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(600);
// Walking on the playa, then close in on the feet the way he framed it.
await page.evaluate(() => window.burning.seek(60));
await page.waitForTimeout(2500);
await page.screenshot({path: `${dir}/feet-${tag}-walk.png`});
await page.mouse.move(550, 400);
await page.mouse.wheel(0, -900);
await page.waitForTimeout(1200);
await page.screenshot({path: `${dir}/feet-${tag}-close.png`});
await browser.close();
