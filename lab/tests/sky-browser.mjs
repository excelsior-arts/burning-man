import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

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
try {
  const page = await browser.newPage({viewport: {width: 1024, height: 640}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const url = process.env.URL ?? 'http://127.0.0.1:5180';
  await page.route('**/__sky-review', (r) =>
    r.fulfill({contentType: 'text/html', body: '<body style="margin:0"></body>'}),
  );
  await page.goto(`${url}/__sky-review`);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/world/desert.ts')).text();
    const THREE = await import(source.match(/from ["']([^"']*three_webgpu[^"']*)["']/)[1]);
    const {createDesert} = await import('/src/world/desert.ts');
    const {sampleSkyGradient} = await import('/src/world/sky-gradient.ts');
    const renderer = new THREE.WebGPURenderer({antialias: true});
    await renderer.init();
    renderer.setSize(1024, 640);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(),
      desert = createDesert(scene);
    const camera = new THREE.PerspectiveCamera(49, 1024 / 640, 0.08, 2400);
    const anchor = new THREE.Vector3(-34, desert.field.height(-34, 0), 0);
    camera.position.copy(anchor).add(new THREE.Vector3(0, 2, 0));
    desert.setCelestial(0.25, 19, -124, 0.75);
    desert.setTimeOfDay(17.95);
    window.skyReview = {THREE, renderer, scene, desert, camera, anchor, sampleSkyGradient};
  });
  await mkdir('artifacts/sky', {recursive: true});
  for (const [name, x, hour, strength] of [
    ['sunset-west', -1, 17.95, 0.75],
    ['sunset-east', 1, 17.95, 0.75],
    ['moonlight-off', 1, 17.95, 0],
    ['moonlight-strong', 1, 17.95, 2.5],
    ['sunrise-east', 1, 6.05, 0.75],
    ['sunrise-west', -1, 6.05, 0.75],
  ]) {
    await page.evaluate(
      ({x, hour, strength}) => {
        const {camera, desert, renderer, scene, anchor} = skyReview;
        desert.setCelestial(0.25, 19, -124, strength);
        desert.setTimeOfDay(hour);
        camera.lookAt(camera.position.x + x, camera.position.y + 0.09, camera.position.z);
        desert.update(0, anchor, 0);
        renderer.render(scene, camera);
      },
      {x, hour, strength},
    );
    await page.screenshot({path: `artifacts/sky/${name}.png`});
  }
  const result = await page.evaluate(async () => {
    const {THREE, desert, scene, renderer, camera, anchor, sampleSkyGradient} = skyReview;
    const luma = (color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    desert.setTimeOfDay(17.95);
    const west = sampleSkyGradient(desert.seaLight, new THREE.Vector3(-1, 0, 0), new THREE.Color());
    const east = sampleSkyGradient(desert.seaLight, new THREE.Vector3(1, 0, 0), new THREE.Color());
    desert.setCelestial(0.25, 19, -124, 2.5);
    const quarter = desert.lighting;
    desert.setCelestial(0.8, 19, -124, 2.5);
    const fuller = desert.lighting;
    const target = new THREE.RenderTarget(1024, 640);
    async function groundLight(strength) {
      desert.setCelestial(0.25, 19, -124, strength);
      camera.lookAt(camera.position.x + 1, camera.position.y - 1.5, camera.position.z);
      desert.update(0, anchor, 0);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1024, 640);
      renderer.setRenderTarget(null);
      let light = 0;
      // Aim down and sample the central ground; independent of readback row orientation.
      for (let y = 180; y < 460; y++)
        for (let x = 250; x < 774; x++) {
          const i = (y * 1024 + x) * 4;
          light += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
        }
      return light;
    }
    const dark = await groundLight(0),
      bright = await groundLight(2.5);
    target.dispose();
    return {
      west: west.toArray(),
      east: east.toArray(),
      contrast: luma(west) / luma(east),
      quarter,
      fuller,
      dark,
      bright,
    };
  });
  assert.ok(result.contrast > 2, 'Sunset horizon must be brighter toward the sun');
  assert.ok(result.east[2] > result.east[0], 'Opposite twilight must be cool');
  assert.equal(result.quarter.moonIntensity, result.fuller.moonIntensity);
  assert.equal(result.quarter.moonPhase, 0.25);
  assert.ok(result.bright > result.dark * 1.15, 'Moonlight strength must brighten the ground');
  assert.deepEqual(errors, []);
  await writeFile('artifacts/sky/review.json', JSON.stringify(result, null, 2));
  console.log('Directional sunset and independent moonlight passed:', {
    contrast: result.contrast,
    groundGain: result.bright / result.dark,
  });
  await page.goto(url);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  await page.locator('#author-toggle').click();
  await page.locator('summary').filter({hasText: 'Sun, moon & wind'}).click();
  const before = await page.evaluate(() => burning.snapshot().score);
  for (const [key, value] of [
    ['moonPhase', 0.25],
    ['moonLight', 2.5],
  ]) {
    await page.locator(`[data-slider=${key}]`).evaluate((e, v) => {
      e.value = String(v);
      e.dispatchEvent(new Event('input', {bubbles: true}));
    }, value);
  }
  await page.waitForFunction(() => burning.snapshot().lighting.moonLight === 2.5);
  assert.equal(await page.locator('[data-slider=moonPhase]').inputValue(), '0.25');
  await page.locator('#save-draft').click();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('burning-man-score-v1')));
  assert.equal(draft.moonPhase, 0.25);
  assert.equal(draft.moonLight, 2.5);
  await page.evaluate(() => burning.applyScore({...burning.snapshot().score, moonLight: 0.1}));
  await page.locator('#load-draft').click();
  assert.equal(await page.evaluate(() => burning.snapshot().score.moonLight), 2.5);
  await page.screenshot({path: 'artifacts/sky/studio-moonlight.png'});
  await page.evaluate((score) => burning.applyScore(score), before);
  assert.deepEqual(errors, []);
  console.log('Studio sliders and draft round-trip passed.');
} finally {
  await browser.close();
}
