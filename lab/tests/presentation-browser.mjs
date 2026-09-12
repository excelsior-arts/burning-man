import {chromium} from '@playwright/test';
import {PerspectiveCamera, Vector3} from 'three';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const url = process.env.URL ?? 'http://127.0.0.1:5180';
const release = process.env.RELEASE === '1';
const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--window-position=-3000,-3000',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
await mkdir('artifacts', {recursive: true});
const errors = [];
let expectingFailure = false;
page.on('pageerror', (error) => {
  if (!expectingFailure) errors.push(error.message);
});
page.on('console', (message) => {
  if (!expectingFailure && message.type() === 'error') errors.push(message.text());
});
function gate(pattern) {
  let release, seen;
  return {
    pattern,
    released: new Promise((resolve) => {
      release = resolve;
    }),
    requested: new Promise((resolve) => {
      seen = resolve;
    }),
    release: () => release(),
    seen: () => seen(),
  };
}
const styles = gate(/\/(?:style(?:-[^/]+)?\.css)$/);
const main = gate(/\/(?:main\.ts|main-[^/]+\.js)$/);
const model = gate(/\/character\/man\.glb$/);
const gates = [styles, main, model];
await page.route('**/*', async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  const held = gates.find(({pattern}) => pattern.test(pathname));
  if (held) {
    held.seen();
    await held.released;
  }
  await route.continue();
});
async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 60000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function loading() {
  assert.equal(await page.locator('#loading-screen').isVisible(), true);
  assert.equal(await page.locator('#invitation').isVisible(), false);
  assert.equal(await page.locator('.credits').isVisible(), false);
  assert.equal(await page.locator('#start').isDisabled(), true);
  const rect = await page.locator('#loading-screen').boundingBox();
  assert.deepEqual(rect, {x: 0, y: 0, width: 390, height: 844});
  assert.equal(
    await page
      .locator('#loading-screen')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgb(23, 23, 27)',
  );
}
async function ready() {
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  assert.equal(await page.locator('#loading-screen').isVisible(), false);
  assert.equal(await page.locator('html').getAttribute('class'), '');
  assert.equal(await page.locator('body').getAttribute('aria-busy'), null);
  if (!release) {
    const state = await page.evaluate(() => burning.snapshot());
    assert.equal(state.ready, true);
    assert.ok(state.sea.frames > 0, 'The scene must render before the loading screen disappears');
  }
}
function bodyInView(state) {
  const camera = new PerspectiveCamera(state.camera.fov, state.camera.aspect, 0.08, 2400);
  camera.position.fromArray(state.camera.position);
  camera.lookAt(new Vector3().fromArray(state.camera.target));
  camera.updateMatrixWorld();
  for (const [name, position] of Object.entries(state.character.posture)) {
    const point = new Vector3().fromArray(position);
    if (name === 'Head') point.y += 0.18;
    if (name.endsWith('Foot')) point.y -= 0.06;
    const projected = point.project(camera);
    assert.ok(
      Math.abs(projected.x) < 0.82,
      `${name} leaves the horizontal safe area at ${state.time}s: ${projected.x}`,
    );
    assert.ok(
      Math.abs(projected.y) < 0.82,
      `${name} leaves the vertical safe area at ${state.time}s: ${projected.y}`,
    );
  }
}
try {
  await page.goto(url, {waitUntil: 'commit'});
  await within(styles.requested, 'stylesheet request');
  await loading();
  await page.screenshot({
    path: `artifacts/${release ? 'public' : 'author'}-loading-before-css.png`,
  });
  styles.release();
  await within(main.requested, 'world module request');
  await loading();
  main.release();
  await within(model.requested, 'body asset request');
  await loading();
  model.release();
  await ready();
  await page.screenshot({path: `artifacts/${release ? 'public' : 'author'}-mobile-ready.png`});
  if (!release) {
    for (const [width, height] of [
      [320, 844],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({width, height});
      await page.waitForFunction(
        ({width, height}) => {
          const canvas = document.querySelector('#world');
          const rect = canvas.getBoundingClientRect();
          return (
            rect.width === width &&
            rect.height === height &&
            burning.snapshot().camera.aspect === width / height
          );
        },
        {width, height},
      );
      for (const time of [0, 8, 65, 76, 86, 120, 135, 145, 150]) {
        await page.evaluate((time) => burning.seek(time), time);
        await page.waitForTimeout(200);
        bodyInView(await page.evaluate(() => burning.snapshot()));
        if (time === 8 || time === 145)
          await page.screenshot({path: `artifacts/mobile-framing-${width}-${time}.png`});
      }
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => burning.seek(8));
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, -5000);
    await page.waitForTimeout(1400);
    bodyInView(await page.evaluate(() => burning.snapshot()));
    await page.evaluate(() => burning.setView('face'));
    assert.equal((await page.evaluate(() => burning.snapshot())).camera.minDistance, 0.45);
    await page.evaluate(() => burning.setView('full'));
    await page.waitForTimeout(250);
    bodyInView(await page.evaluate(() => burning.snapshot()));
  }
  assert.deepEqual(errors, []);
  expectingFailure = true;
  await page.route('**/character/man.glb', (route) => route.abort());
  await page.reload({waitUntil: 'commit'});
  await page.locator('#loading-retry').waitFor({timeout: 90000});
  assert.equal(await page.locator('#loading-status').innerText(), 'The desert could not load.');
  assert.equal(await page.locator('#invitation').isVisible(), false);
  await page.screenshot({path: `artifacts/${release ? 'public' : 'author'}-loading-failure.png`});
  await page.unroute('**/character/man.glb');
  await page.locator('#loading-retry').click();
  await ready();
  console.log(`${release ? 'Public' : 'Author'} loading, recovery and viewport checks passed.`);
} catch (error) {
  console.log('Presentation failure:', error, errors);
  await page.screenshot({path: 'artifacts/presentation-failure.png'});
  throw error;
} finally {
  for (const held of gates) held.release();
  await browser.close();
}
