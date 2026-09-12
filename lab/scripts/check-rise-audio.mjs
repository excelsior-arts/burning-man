import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({viewport: {width: 900, height: 600}, ignoreHTTPSErrors: true});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
const up = s.stage_05_fall + 1.9 + s.stage_05_fall_hold + 6.866667;
await page.evaluate((t) => window.burning.seek(t), up - 2);
await page.evaluate(() => window.burning.togglePause());
let last = null;
const rows = [];
for (let i = 0; i < 22; i++) {
  await page.waitForTimeout(500);
  const v = await page.evaluate(() => {
    const snap = window.burning.snapshot();
    return {t: snap.time, steps: snap.audio.footfalls, music: snap.audio.musicTime, speed: snap.motion.speed};
  });
  if (last && v.t > last.t) {
    const dt = v.t - last.t;
    rows.push(`${(v.t - up).toFixed(1).padStart(5)}s speed ${v.speed.toFixed(2)} steps/s ${((v.steps - last.steps) / dt).toFixed(1)} music/clock ${((v.music - last.music) / dt).toFixed(2)}`);
  }
  last = v;
}
console.log(rows.join('\n'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
