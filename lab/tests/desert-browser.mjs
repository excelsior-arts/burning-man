import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url = process.env.URL ?? 'http://127.0.0.1:5180';
const browser = await chromium.launch({headless: false, args: ['--enable-unsafe-webgpu']});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await mkdir('artifacts', {recursive: true});
try {
  await page.route('**/__floor-review', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<html><body style="margin:0;background:black"></body></html>',
    }),
  );
  await page.goto(`${url}/__floor-review`);
  // A controlled, close view of the dry lake bed at walking height.
  console.log(
    await page.evaluate(async () => {
      const source = await (await fetch('/src/world/desert.ts')).text();
      const THREE = await import(source.match(/from ["']([^"']*three_webgpu[^"']*)["']/)[1]);
      const {createDesert} = await import('/src/world/desert.ts');
      const renderer = new THREE.WebGPURenderer({antialias: true});
      await renderer.init();
      renderer.setSize(1440, 1000);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      document.body.append(renderer.domElement);
      const scene = new THREE.Scene();
      const desert = createDesert(scene);
      const camera = new THREE.PerspectiveCamera(45, 1.44, 0.05, 1200);
      // Open playa, a few metres ahead of the eye, level and unobstructed.
      const target = new THREE.Vector3(-14, desert.field.height(-14, 0), 0);
      camera.position.set(-8, target.y + 1.62, 0.4);
      camera.lookAt(target);
      window.review = {renderer, scene, desert, camera, target, three: THREE};
      desert.setTimeOfDay(15.5);
      desert.update(0, target, 1);
      renderer.setAnimationLoop(() => renderer.render(scene, camera));
      return {target: target.toArray(), sand: desert.inspectSand()};
    }),
  );
  await page.waitForTimeout(2500);
  await page.screenshot({path: 'artifacts/desert-floor-day.png'});
  await page.evaluate(() => {
    review.desert.setTimeOfDay(22);
  });
  await page.waitForTimeout(750);
  await page.screenshot({path: 'artifacts/desert-floor-night.png'});
  // The floor must carry visible structure rather than reading as one flat tone.
  const spread = await page.evaluate(async () => {
    const THREE = window.review.three;
    const target = new THREE.RenderTarget(720, 500);
    review.renderer.setAnimationLoop(null);
    review.renderer.setRenderTarget(target);
    review.renderer.render(review.scene, review.camera);
    const pixels = await review.renderer.readRenderTargetPixelsAsync(target, 0, 0, 720, 500);
    review.renderer.setRenderTarget(null);
    target.dispose();
    review.renderer.setAnimationLoop(() => review.renderer.render(review.scene, review.camera));
    // A band of bare floor below the horizon, clear of the sky.
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 40; y < 190; y++)
      for (let x = 150; x < 570; x++) {
        const i = (y * 720 + x) * 4;
        const v = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        sum += v;
        sumSq += v * v;
        n++;
      }
    return Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2));
  });
  console.log('Moonlit floor tonal spread:', spread.toFixed(2));
  await page.goto(`${url}/`);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  await page.screenshot({path: 'artifacts/desert-floor-opening.png'});
  await page.evaluate(async () => {
    await burning.start();
    burning.seek(38);
  });
  await page.waitForTimeout(1800);
  console.log(
    await page.evaluate(() => ({sand: burning.snapshot().sand, camera: burning.snapshot().camera})),
  );
  await page.screenshot({path: 'artifacts/desert-floor-walk.png'});
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => burning.snapshot().time), 38);
  console.log('Desert floor: native WebGPU and game scene rendered without errors.');
} finally {
  await browser.close();
}
