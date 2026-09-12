import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 600}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5180/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const crest = await page.evaluate(() => window.burning.snapshot().score.stage_07_crest);
await page.evaluate((t) => window.burning.seek(t), crest - 6);
await page.evaluate(() => window.burning.togglePause());
let last = null;
const rows = [];
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(400);
  const v = await page.evaluate(() => { const s = window.burning.snapshot(); return {t: s.time, steps: s.audio.footfalls, wind: s.audio.windGain}; });
  if (last) rows.push(`${(v.t - crest).toFixed(1)}s steps/s ${((v.steps - last.steps) / (v.t - last.t)).toFixed(1)} wind ${v.wind.toFixed(3)}`);
  last = v;
}
console.log(rows.join('\n'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
