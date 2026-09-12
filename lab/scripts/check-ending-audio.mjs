import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({viewport: {width: 900, height: 600}, ignoreHTTPSErrors: true});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
console.log(`fatigue ${s.stage_06_fatigue}s, kneel ${s.stage_08_kneel}s, end ${s.duration}s, heartbeat slows ${s.heartbeatSlowAt}s and stops ${s.heartbeatStopBeforeEnd}s before the end`);
await page.evaluate((t) => window.burning.seek(t), s.duration - 26);
await page.evaluate(() => window.burning.togglePause());
let last = null;
const rows = [];
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(500);
  const v = await page.evaluate(() => {
    const snap = window.burning.snapshot();
    return {t: snap.time, music: snap.audio.musicTime, beats: snap.audio.heartbeats ?? 0, speed: snap.motion.speed};
  });
  if (last && v.t > last.t + 0.05) {
    const dt = v.t - last.t;
    rows.push(`${(v.t - s.duration).toFixed(1).padStart(6)}s  speed ${v.speed.toFixed(2)}  beats/min ${(((v.beats - last.beats) / dt) * 60).toFixed(0).padStart(3)}  music/clock ${((v.music - last.music) / dt).toFixed(2)}`);
  }
  last = v;
}
console.log(rows.join('\n'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
