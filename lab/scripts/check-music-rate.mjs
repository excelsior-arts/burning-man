import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 600}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5180/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
const watch = async (label, from, to) => {
  await page.evaluate((t) => window.burning.seek(t), from);
  await page.evaluate(() => window.burning.togglePause());
  await page.waitForTimeout(600);
  const rows = [];
  let last = null;
  while (true) {
    const v = await page.evaluate(() => {
      const a = document.querySelector('audio');
      const snap = window.burning.snapshot();
      return {t: snap.time, music: snap.audio.musicTime, rate: a ? a.playbackRate : -1, src: a ? !!a.currentSrc : false};
    });
    if (last) {
      const dt = v.t - last.t, dm = v.music - last.music;
      if (dt > 0.15) rows.push(`${v.t.toFixed(1)}s rate ${v.rate.toFixed(2)} music/clock ${(dm / dt).toFixed(2)}`);
    }
    last = v;
    if (v.t >= to) break;
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.burning.togglePause());
  console.log(label, rows.slice(0, 9).join('  '));
};
await watch('through the first fall :', s.stage_05_fall - 2, s.stage_05_fall + 12);
await watch('through the crest stop :', s.stage_07_crest - 3, s.stage_07_crest + 8);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
