// The card a link preview shows. Social scrapers never run the piece, so one
// frame of it is captured at the size they expect and shipped as a file.
import {chromium} from '@playwright/test';
const at = Number(process.argv[2] ?? 145);
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 2, ignoreHTTPSErrors: true});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=high');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(800);
await page.evaluate((t) => window.burning.seek(t), at);
await page.waitForTimeout(2500);
// No chrome in the picture: it is the piece, not a screenshot of an interface.
await page.addStyleTag({content: '.masthead, #author-toggle, .hint, .credits {opacity: 0 !important}'});
await page.waitForTimeout(400);
await page.screenshot({path: 'public/share.jpg', type: 'jpeg', quality: 88});
console.log('captured at', at, 's  errors:', errors.length ? errors : 'none');
await browser.close();
