import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
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
const base = process.env.URL ?? 'http://127.0.0.1:5180';
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await mkdir('artifacts/crescent', {recursive: true});
  await page.goto(base);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  await page.addStyleTag({content: '#world{pointer-events:none!important}'});
  await page.screenshot({path: 'artifacts/crescent/opening.png'});
  for (const t of [55, 72, 95, 129, 132]) {
    await page.evaluate((t) => burning.seek(t), t);
    await page.waitForFunction(() => burning.snapshot().rendering.idle);
    await page.screenshot({path: `artifacts/crescent/coast-${t}.png`});
  }
  await page.route('**/__crescent-review', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<body style="margin:0;background:#161821"></body>',
    }),
  );
  await page.goto(new URL('/__crescent-review', base).href);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/world/mountains.ts')).text();
    const THREE = await import(source.match(/from ["']([^"']*three_webgpu[^"']*)["']/)[1]);
    const {createDesert} = await import('/src/world/desert.ts');
    const renderer = new THREE.WebGPURenderer({antialias: true});
    await renderer.init();
    renderer.setSize(1440, 900);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(),
      desert = createDesert(scene),
      camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 2400);
    const target = new THREE.Vector3(0, 5, 0);
    desert.setTimeOfDay(15.5);
    window.review = {renderer, scene, desert, camera, target};
    window.shot = async (position, look) => {
      camera.position.fromArray(position);
      camera.lookAt(new THREE.Vector3().fromArray(look));
      desert.update(0, target, 0);
      await renderer.renderAsync(scene, camera);
    };
  });
  for (const [name, position, look] of [
    ['east', [-8, 7, 0], [520, 18, 0]],
    ['north', [0, 5.6, 0], [-5, 7, -500]],
    ['south', [0, 5.6, 0], [-5, 7, 500]],
    ['aerial', [-280, 430, 470], [185, 0, 20]],
    ['north-passage', [-26, 18, -72], [-37, 1, -106]],
    ['south-passage', [-26, 18, 72], [-37, 1, 106]],
  ]) {
    await page.evaluate(({position, look}) => shot(position, look), {position, look});
    await page.screenshot({path: `artifacts/crescent/${name}.png`});
  }
  // Terrain-only aerial review deliberately leaves the sea out to expose mesh joins.
  console.log('Coastal crossing and crescent horizon rendered without errors.');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
