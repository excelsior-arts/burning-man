import {chromium} from '@playwright/test';
import {PerspectiveCamera, Vector3} from 'three';
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
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [],
  shots = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const snapshot = () => page.evaluate(() => burning.snapshot());
const idle = () => page.waitForFunction(() => burning.snapshot().rendering.idle);
async function landmarkInView(s, name) {
  const obscured = await page.evaluate(
    async ({s, name}) => {
      const {duneHeight} = await import('/src/sand/field.ts');
      const [x, z] = s.map.layout.altars[name];
      const [cx, cy, cz] = s.camera.position;
      // Check the opening, not just that the landmark's projection lies on screen.
      for (const elevation of [0.7, 1.5, 2]) {
        const targetY = duneHeight(x, z) + elevation;
        for (let i = 1; i < 80; i++) {
          const f = i / 80;
          if (duneHeight(cx + (x - cx) * f, cz + (z - cz) * f) > cy + (targetY - cy) * f)
            return true;
        }
      }
      return false;
    },
    {s, name},
  );
  assert.equal(obscured, false, `${name} altar hidden behind a dune in the ending shot`);
  const camera = new PerspectiveCamera(s.camera.fov, s.camera.aspect, 0.08, 2400);
  camera.position.fromArray(s.camera.position);
  camera.lookAt(new Vector3().fromArray(s.camera.target));
  camera.updateMatrixWorld();
  const [x, z] = s.map.layout.altars[name];
  if (name === 'earth' && s.time >= s.score.stage_08_kneel) {
    const points = await page.evaluate(async () => {
      const {earthTriangles} = await import('/src/world/earth-alignment.ts');
      return earthTriangles().flatMap((triangle) => triangle.frame.map((p) => p.toArray()));
    });
    for (const point of points) {
      const p = new Vector3().fromArray(point).project(camera);
      assert.ok(
        Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95,
        `Earth triangle cropped: ${p.toArray()}`,
      );
    }
  }
  for (const y of [s.map.layout.floor, s.map.layout.floor + 2.8]) {
    const p = new Vector3(x, y, z).project(camera);
    assert.ok(
      Math.abs(p.x) < 0.93 && Math.abs(p.y) < 0.93 && p.z < 1,
      `${name} altar outside ${s.camera.aspect} frame: ${p.toArray()}`,
    );
  }
}
try {
  await mkdir('artifacts/map', {recursive: true});
  await page.goto(process.env.URL ?? 'http://127.0.0.1:5180');
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  // Controlled seek renders should not receive incidental native mouse input.
  await page.addStyleTag({content: '#world{pointer-events:none!important}'});
  await idle();
  await page.screenshot({path: 'artifacts/map/opening.png'});
  const initial = await snapshot();
  assert.equal(initial.score.duration, 150);
  assert.ok(initial.lighting.fogFar >= 1800);
  await page.locator('#author-toggle').click();
  assert.equal(await page.locator('#timeline').getAttribute('max'), '150');
  for (const name of ['air', 'fire', 'earth']) {
    await page.locator(`[data-jump="${name}"]`).click();
    await idle();
    const s = await snapshot();
    assert.equal(s.map.journey, name);
    assert.equal(s.playing, false);
    assert.equal(s.time, s.score.stage_08_kneel - 1);
    const [x, z] = s.map.layout.altars[name];
    assert.ok(Math.hypot(s.motion.position.x - x, s.motion.position.z - z) < 13);
    await landmarkInView(s, name);
  }
  await page.locator('#author-toggle').click();
  for (const [index, name] of ['air', 'fire', 'earth'].entries()) {
    await page.keyboard.press(`Shift+Digit${index + 1}`);
    await idle();
    assert.equal((await snapshot()).map.journey, name);
    assert.equal((await snapshot()).playing, false);
  }
  await page.locator('#author-toggle').click();
  const routines = ['story', 'air', 'fire', 'earth'];
  for (const route of routines) {
    await page.locator('#routine').selectOption(route);
    await page.locator('#author-toggle').click();
    for (const t of [120, 132, 150]) {
      await page.evaluate((t) => burning.seek(t), t);
      await idle();
      const s = await snapshot();
      const journey = route === 'story' ? 'sea' : route;
      assert.equal(s.map.journey, journey);
      assert.equal(s.time, t);
      if (t === 150) {
        const predicted = s.map.journeys.find((j) => j.journey === journey);
        assert.ok(
          Math.hypot(
            s.motion.position.x - predicted.end[0],
            s.motion.position.z - predicted.end[1],
          ) < 0.1,
        );
        assert.equal(s.character.animation, 'settle');
        assert.ok(s.character.fire.count > 0);
        if (route !== 'story') await landmarkInView(s, route);
        else assert.ok(s.route.waterDistance > 9 && s.route.waterDistance < 10);
      }
      await page.screenshot({path: `artifacts/map/${route}-${t}.png`});
      shots.push(s);
    }
    await page.locator('#author-toggle').click();
  }
  await page.locator('#author-toggle').click();
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height: 844});
    for (const route of ['air', 'fire', 'earth']) {
      await page.evaluate((route) => {
        burning.setRoutine(route);
        burning.seek(150);
      }, route);
      await idle();
      const s = await snapshot();
      await landmarkInView(s, route);
      await page.screenshot({path: `artifacts/map/${route}-mobile-${width}.png`});
    }
  }
  await page.setViewportSize({width: 1440, height: 900});
  await page.evaluate(() => {
    const s = burning.snapshot().score;
    burning.applyScore({...s, startHour: 14, endHour: 14});
    burning.setRoutine('earth');
    burning.seek(150);
  });
  await idle();
  await page.screenshot({path: 'artifacts/map/black-rock-day.png'});
  await page.locator('#author-toggle').click();
  await page.locator('summary').filter({hasText: 'Score timings'}).click();
  await page.locator('[data-score=duration]').fill('160');
  await page.locator('[data-score=duration]').dispatchEvent('change');
  await page.evaluate(() => burning.seek(160));
  await idle();
  const retimed = await snapshot();
  assert.equal(retimed.score.duration, 160);
  assert.equal(await page.locator('#timeline').getAttribute('max'), '160');
  assert.ok(Math.abs(retimed.map.budget - initial.map.budget) < 0.001);
  await landmarkInView(retimed, 'earth');
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/map/review.json',
    JSON.stringify({routes: initial.map, retimed: retimed.map, shots}, null, 2),
  );
  console.log(
    'Authored map: all four routes, mobile altar framing, clear horizon and score retiming passed.',
  );
} catch (e) {
  console.log('Map review failure:', e, errors);
  await page.screenshot({path: 'artifacts/map/failure.png'});
  throw e;
} finally {
  await browser.close();
}
