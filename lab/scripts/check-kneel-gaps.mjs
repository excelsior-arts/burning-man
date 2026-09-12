import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 620}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
for (const [label, t] of [['on his knees', s.stage_08_kneel + 1], ['settled', s.stage_09_settle + 2], ['head bowed', s.stage_10_bow + 2]]) {
  await page.evaluate((t) => window.burning.seek(t), t);
  await page.evaluate(() => window.burning.togglePause());
  await page.waitForTimeout(1800);
  const g = await page.evaluate(() => window.burning.snapshot().character.grounding);
  await page.evaluate(() => window.burning.togglePause());
  console.log(`${label.padEnd(14)} offset ${g.offset.toFixed(3)}m`);
  for (const p of g.probes)
    console.log(`   ${(p.foot + ' ' + p.part).padEnd(14)} clearance ${(p.clearance * 100).toFixed(1).padStart(6)} cm`);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
