import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1280, height: 800}});
const errors = [], failed = [], music = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 60)} ${r.failure()?.errorText}`));
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('lambda-url') || u.includes('cloudfront') || /\.(m4a|mp3)/.test(u)) music.push(`${r.status()} ${u.slice(0, 55)}`);
  if (r.status() >= 400) failed.push(`${r.status()} ${u.slice(0, 60)}`);
});
try {
  await page.goto('http://127.0.0.1:5191/burning-man/');
  await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
  await page.locator('#start').click();
  await page.waitForTimeout(6000);
  const el = await page.evaluate(() => {
    const a = document.querySelector('audio');
    return a ? {hasSrc: !!a.currentSrc, playing: !a.paused, time: +a.currentTime.toFixed(1), readyState: a.readyState} : 'no audio element';
  });
  console.log('audio element:', JSON.stringify(el));
  console.log('music requests:', music.length ? music : 'none');
} finally {
  console.log('page errors:', errors.length ? errors : 'none');
  console.log('failed requests:', failed.length ? failed : 'none');
  await browser.close();
}
