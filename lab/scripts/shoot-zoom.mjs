import {chromium} from '@playwright/test';
const dir = (process.env.OUT ?? 'artifacts');
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1200, height: 780}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=high');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(600);
await page.evaluate(() => window.burning.seek(95));
await page.waitForTimeout(1400);
// Pull back as hard as the wheel allows.
await page.mouse.move(600, 400);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(120); }
await page.waitForTimeout(1600);
const far = await page.evaluate(() => { const c = window.burning.snapshot().camera; return {max: +c.minDistance.toFixed(2), pos: c.position.map((v) => +v.toFixed(1))}; });
await page.screenshot({path: `${dir}/zoom-far.png`});
console.log('pulled fully back:', JSON.stringify(far), 'errors:', errors.length ? errors : 'none');
await browser.close();
