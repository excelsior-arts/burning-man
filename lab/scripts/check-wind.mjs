import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 600}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
const seen = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(2500);
  seen.push(await page.evaluate(() => +window.burning.snapshot().audio.windGain.toFixed(4)));
}
console.log('wind level over 25 s:', seen.join(' '));
console.log('moved between', Math.min(...seen).toFixed(4), 'and', Math.max(...seen).toFixed(4));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
