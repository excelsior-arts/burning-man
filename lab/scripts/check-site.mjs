import {chromium} from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:5191/burning-man/';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1280, height: 800}});
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
try {
  await page.goto(url);
  await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
  await page.locator('#start').click();
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => ({
    studio: !!document.querySelector('#studio-toggle, [class*=author]'),
    burning: typeof window.burning,
    canvas: !!document.querySelector('canvas'),
  }));
  console.log('booted and running at the project path:', JSON.stringify(state));
  await page.screenshot({path: 'artifacts/site-check.png'});
} finally {
  console.log('page errors:', errors.length ? errors : 'none');
  console.log('failed requests:', failed.length ? failed : 'none');
  await browser.close();
}
