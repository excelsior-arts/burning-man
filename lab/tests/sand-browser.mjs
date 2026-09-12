import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

// A controlled view of the real particle renderer: identical frozen sand in
// sunlight, a cast shadow, moonlight, and fog. Run against the dev server.
const url = process.env.URL ?? 'http://127.0.0.1:5180';
await mkdir('artifacts', {recursive: true});
const browser = await chromium.launch({headless: false, args: ['--enable-unsafe-webgpu']});
const page = await browser.newPage({viewport: {width: 1024, height: 640}});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.route('**/__sand-review', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<html><body style="margin:0;background:black"></body></html>',
  }),
);
try {
  await page.goto(`${url}/__sand-review`);
  const result = await page.evaluate(async () => {
    // Use Vite's exact module URL so TSL and the renderer share one Three instance.
    const source = await (await fetch('/src/sand/grains.ts')).text();
    const THREE = await import(source.match(/from ["']([^"']*three_webgpu[^"']*)["']/)[1]);
    const {SandGrains} = await import('/src/sand/grains.ts');
    const {SandField} = await import('/src/sand/field.ts');
    const renderer = new THREE.WebGPURenderer({antialias: true});
    await renderer.init();
    renderer.setSize(1024, 640);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('black');
    const camera = new THREE.PerspectiveCamera(35, 1024 / 640, 0.05, 30);
    camera.position.set(0, 1.2, 6);
    camera.lookAt(0, 0.25, 0);
    const hemi = new THREE.HemisphereLight('#b6c5d9', '#665749', 0.35);
    const sun = new THREE.DirectionalLight('#ffdab1', 4);
    sun.position.set(0, 6, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {left: -5, right: 5, bottom: -5, top: 5, near: 0.1, far: 15});
    scene.add(hemi, sun, sun.target);
    const blocker = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.1, 3),
      new THREE.MeshBasicNodeMaterial({colorWrite: false, depthWrite: false}),
    );
    blocker.position.set(-1.2, 1.5, 0);
    blocker.castShadow = true;
    scene.add(blocker);
    const field = new SandField();
    field.wind = {x: 0, z: 0};
    field.height = () => 0;
    field.gradient = () => ({x: 0, z: 0});
    const sand = new SandGrains(field);
    scene.add(sand.object);
    let burst = true;
    field.drainBursts = () => {
      if (!burst) return [];
      burst = false;
      return [-1.2, 1.2].map((x) => ({x, y: 0, z: 0, amount: 32, kind: 'step', facing: 0}));
    };
    for (let i = 0; i < 4; i++) sand.update(0.05, 0, 0);
    // Width is a multiple of 64: WebGPU readback rows are aligned to 256 bytes.
    const target = new THREE.RenderTarget(1024, 640);
    async function measure() {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1024, 640);
      const sum = [0, 0, 0];
      // Only the left burst changes shadow exposure. Both stay completely still.
      for (let y = 0; y < 640; y++)
        for (let x = 0; x < 512; x++) {
          const i = (y * 1024 + x) * 4;
          for (let c = 0; c < 3; c++) sum[c] += pixels[i + c];
        }
      renderer.setRenderTarget(null);
      return sum;
    }
    const shaded = await measure();
    blocker.castShadow = false;
    const sunlit = await measure();
    sun.color.set('#709fff');
    sun.intensity = 0.8;
    hemi.color.set('#709cff');
    hemi.groundColor.set('#304773');
    hemi.intensity = 0.3;
    const moonlit = await measure();
    scene.fog = new THREE.Fog('black', 0, 7);
    const fogged = await measure();
    scene.fog = null;
    sun.color.set('#ffdab1');
    sun.intensity = 4;
    hemi.color.set('#b6c5d9');
    hemi.groundColor.set('#665749');
    hemi.intensity = 0.35;
    blocker.castShadow = true;
    renderer.render(scene, camera);
    target.dispose();
    return {shaded, sunlit, moonlit, fogged, count: sand.inspect()};
  });
  const light = (rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  assert.ok(light(result.sunlit) > 1024, 'The sunlit sand must actually be visible');
  assert.ok(
    light(result.shaded) < light(result.sunlit) * 0.3,
    'Cast shadows must darken airborne sand',
  );
  assert.ok(result.moonlit[2] > result.moonlit[0] * 1.05, 'Moonlight must tint the sand blue');
  assert.ok(
    light(result.fogged) < light(result.moonlit) * 0.5,
    'Distance fog must attenuate the sand',
  );
  assert.equal(result.count.swells, 16);
  assert.deepEqual(errors, []);
  await page.screenshot({path: 'artifacts/sand-lighting.png'});
  console.log('Sand lighting passed:', result);
} finally {
  await browser.close();
}
