import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

// Windowed but parked off every screen. Headless keeps no GPU device alive long
// enough for this walk through the piece: it is lost partway and the captures
// come back black, so the window is real and simply never in anybody's way.
const browser = await chromium.launch({headless: false, args: [
  '--enable-unsafe-webgpu', '--window-position=-3000,-3000',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
]});
// The dev server is served over TLS with a local certificate.
const page = await browser.newPage({viewport: {width: 1440, height: 900}, ignoreHTTPSErrors: true});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
const snapshot = () => page.evaluate(() => burning.snapshot());
const idle = () => page.waitForFunction(() => burning.snapshot().rendering.idle);
try {
  await mkdir('artifacts/fallen', {recursive: true});
  await page.goto(process.env.URL ?? 'http://127.0.0.1:5180');
  await page.waitForFunction(() => window.burning?.snapshot().ready, undefined, {timeout: 90000});
  // The piece opens without waiting for this one, so the study is only worth
  // framing once it has actually arrived.
  await page.waitForFunction(() => burning.snapshot().fallen.ready, undefined, {timeout: 90000});
  const site = await page.evaluate(async () => (await import('/src/world/fallen-site.ts')).FALLEN_ALTAR);
  await page.locator('#author-toggle').click();
  await page.locator('[data-jump="fallen"]').click();
  await idle();
  let s = await snapshot();
  assert.equal(s.altarStudy, 'fallen');
  assert.equal(s.playing, false);
  assert.equal(s.fallen.ready, true);
  assert.equal(await page.locator('#routine').inputValue(), 'keyboard');
  assert.equal(s.motion.position.x, site.visitor[0]);
  assert.equal(s.motion.position.z, site.visitor[1]);
  assert.ok(Math.hypot(s.camera.target[0] - site.position[0], s.camera.target[2] - site.position[1]) < .01);
  await page.locator('#author-toggle').click();
  await page.waitForTimeout(700); // Let the title and Studio fades finish.
  await page.screenshot({path: 'artifacts/fallen/dusk.png'});

  // A real drag must orbit the fallen figure and keep the study centered on it.
  const initial = s.camera.position;
  await page.mouse.move(720, 420);
  await page.mouse.down();
  await page.mouse.move(1050, 470, {steps: 18});
  await page.mouse.up();
  await idle();
  s = await snapshot();
  assert.ok(Math.hypot(...s.camera.position.map((n, i) => n - initial[i])) > .5);
  assert.ok(Math.abs(s.camera.target[0] - site.position[0]) < .01);
  await page.screenshot({path: 'artifacts/fallen/reverse.png'});
  await page.evaluate(() => burning.applyScore({...burning.snapshot().score, startHour: 16, endHour: 16.35}));
  await idle();
  await page.screenshot({path: 'artifacts/fallen/daylight.png'});

  await page.locator('#pause').click();
  await page.waitForFunction(() => burning.snapshot().playing && burning.snapshot().altarStudy === null);
  await page.locator('#pause').click();
  await page.keyboard.press('Shift+Digit4');
  await idle();
  assert.equal((await snapshot()).altarStudy, 'fallen');
  await page.evaluate(() => burning.reset());
  await idle();
  assert.equal((await snapshot()).altarStudy, null);
  await page.keyboard.press('Shift+Digit1');
  await idle();
  assert.equal((await snapshot()).map.journey, 'air');
  assert.equal((await snapshot()).altarStudy, null);
  assert.deepEqual(errors, []);
  console.log('The fallen one: shortcut, drag, resume, reset and existing altar passed.');
} finally {
  await browser.close();
}
