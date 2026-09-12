import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 900, height: 620}});
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.URL ?? 'https://127.0.0.1:5180') + '/?quality=low');
await page.locator('#start:not([disabled])').waitFor({timeout: 120000});
await page.locator('#start').click();
await page.waitForTimeout(400);
const s = await page.evaluate(() => window.burning.snapshot().score);
const at = [['flame', s.stage_01_flame], ['alight', s.stage_02_alight], ['walk', s.stage_03_walk + 1],
  ['look', s.stage_04_look + 1], ['fall', s.stage_05_fall + 0.5], ['fatigue', s.stage_06_fatigue + 1],
  ['crest', s.stage_07_crest + 1], ['kneel', s.stage_08_kneel + 0.5], ['settle', s.stage_09_settle + 0.5],
  ['bow', s.stage_10_bow + 1]];
for (const [name, t] of at) {
  const cue = await page.evaluate((t) => { window.burning.seek(t); const c = window.burning.snapshot().cue; return {phase: c.phase, clip: c.clip, mobility: +c.mobility.toFixed(2)}; }, t);
  console.log(`${name.padEnd(8)} ${String(t.toFixed(1)).padStart(6)}s  ${cue.phase.padEnd(22)} ${cue.clip.padEnd(12)} mobility ${cue.mobility}`);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
