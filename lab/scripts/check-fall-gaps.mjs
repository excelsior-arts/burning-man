import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 620}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
await page.evaluate((t) => window.burning.seek(t), s.stage_05_fall - 1);
await page.waitForTimeout(1200);
if (!(await page.evaluate(() => window.burning.snapshot().playing))) await page.evaluate(() => window.burning.togglePause());
for (let i = 0; i <= 48; i++) {
  await page.waitForTimeout(320);
  const d = await page.evaluate(() => {
    const s = window.burning.snapshot();
    const g = s.character.grounding;
    return {t: s.time, clip: s.cue?.clip ?? s.character?.clip ?? s.phase, off: g.offset, lo: Math.min(...g.probes.map(p => p.clearance)), hi: Math.max(...g.probes.map(p => p.clearance)), knee: g.probes.filter(p => p.part === 'knee').map(p => p.clearance)};
  });
  console.log(`${d.t.toFixed(1).padStart(6)}s ${String(d.clip).padEnd(10)} offset ${d.off.toFixed(3).padStart(7)}  lowest ${(d.lo*100).toFixed(1).padStart(6)}cm  highest ${(d.hi*100).toFixed(1).padStart(6)}cm  knees ${d.knee.map(v=>(v*100).toFixed(1)).join(' / ')}`);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
