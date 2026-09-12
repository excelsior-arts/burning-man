import {chromium} from '@playwright/test';
const dir = (process.env.OUT ?? 'artifacts');
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
for (const [name, viewport] of [['desktop', {width: 1440, height: 900}], ['phone', {width: 390, height: 844}]]) {
  const page = await browser.newPage({viewport});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=high');
  await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
  await page.locator('#start').click();
  await page.waitForTimeout(600);
  const dur = await page.evaluate(() => window.burning.snapshot().score.duration);
  // Play through the end so the ending class arrives the way it does in a take.
  await page.evaluate((t) => window.burning.seek(t), dur - 2);
  await page.evaluate(() => window.burning.togglePause());
  await page.waitForTimeout(2500);
  const atEnd = await page.evaluate(() => ({ended: document.body.classList.contains('score-ended'), opacity: getComputedStyle(document.querySelector('.credits')).opacity}));
  await page.waitForTimeout(5000);
  const shown = await page.evaluate(() => ({opacity: +getComputedStyle(document.querySelector('.credits')).opacity, visible: getComputedStyle(document.querySelector('.credits')).visibility}));
  await page.screenshot({path: `${dir}/credits-${name}.png`});
  // A seek back must take them away again.
  await page.evaluate(() => window.burning.seek(60));
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({ended: document.body.classList.contains('score-ended'), opacity: +getComputedStyle(document.querySelector('.credits')).opacity}));
  console.log(name, 'at the end:', JSON.stringify(atEnd), '| after the wait:', JSON.stringify(shown), '| seeked back:', JSON.stringify(back), '| errors:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
