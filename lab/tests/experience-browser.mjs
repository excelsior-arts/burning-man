import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const url = process.env.URL ?? 'http://127.0.0.1:5183';
const release = process.env.RELEASE === '1';
const slide = async (selector, value) =>
  page.locator(selector).evaluate((e, v) => {
    e.value = String(v);
    e.dispatchEvent(new Event('input', {bubbles: true}));
  }, value);
await mkdir('artifacts', {recursive: true});
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
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
const errors = [];
await page.addInitScript(() => {
  window.worldInputs = [];
  for (const name of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup'])
    document.addEventListener(name, (e) => {
      if (e.target.id === 'world') worldInputs.push([name, performance.now()]);
    });
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
async function checkOpening() {
  assert.equal(await page.locator('#invitation h1').innerText(), 'BURNING MAN 2026');
  assert.equal(await page.locator('#start').innerText(), 'Fire');
  assert.equal(await page.locator('.masthead').isVisible(), false);
  assert.equal(await page.locator('.credit').innerText(), 'by excelsior-arts');
  assert.equal(
    await page.locator('.credit').getAttribute('href'),
    'https://github.com/excelsior-arts',
  );
  assert.equal(
    await page
      .locator('#sound, #ending, #restart, #instruction, #touch-walk, .intro, .sound-note')
      .count(),
    0,
  );
  assert.equal(await page.locator('#author-panel').isVisible(), false);
  assert.equal(await page.locator('#author-timeline').isVisible(), false);
  assert.deepEqual(
    await page.locator('button:visible').allTextContents(),
    release ? ['Fire'] : ['Fire', 'Studio'],
  );
  const viewport = page.viewportSize();
  const title = await page.locator('#invitation h1').boundingBox();
  const fire = await page.locator('#start').boundingBox();
  const credit = await page.locator('.credit').boundingBox();
  assert.ok(
    title.x >= 0 && title.x + title.width <= viewport.width,
    'The title stays on one line inside the viewport',
  );
  assert.ok(Math.abs(title.x + title.width / 2 - viewport.width / 2) < 1);
  assert.ok(
    Math.abs((title.y + fire.y + fire.height) / 2 - viewport.height / 2) < 1,
    'The title and Fire group is vertically centered',
  );
  assert.ok(fire.y > title.y + title.height);
  assert.ok(credit.x > viewport.width / 2 && credit.y > viewport.height - 80);
}
async function checkPlaying() {
  assert.equal(await page.locator('#invitation').isVisible(), false);
  assert.equal(await page.locator('.masthead').isVisible(), true);
  assert.equal(await page.locator('.wordmark').innerText(), 'BURNING MAN 2026');
  const title = await page.locator('.wordmark').boundingBox();
  const controls = await page.locator('.transport').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(title.x < 60 && title.y < 60);
  assert.ok(controls.x > title.x + title.width, 'Title and transport must not overlap');
  assert.ok(controls.x + controls.width <= viewport.width && controls.y < 60);
  assert.deepEqual(
    await page
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label') || button.textContent.trim()),
      ),
    release ? ['Resume'] : ['Pause', 'Studio'],
  );
}
try {
  await page.goto(url);
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  assert.equal(await page.locator('canvas').count(), 1);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({width, height: width === 1440 ? 1000 : 844});
    await checkOpening();
    if (width !== 320)
      await page.screenshot({
        path: `artifacts/${release ? 'public' : 'author'}-opening-${width}.png`,
      });
  }
  if (release) {
    assert.equal(await page.locator('#author-panel').count(), 0);
    assert.equal(await page.locator('#author-timeline').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.burning), 'undefined');
    await page.locator('#start').click();
    await page.waitForTimeout(7500);
    assert.match(await page.locator('#progress').innerText(), /^2:2[1-3]$/);
    await page.locator('#pause').click();
    const at = await page.locator('#progress').innerText();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#progress').innerText(), at);
    await checkPlaying();
    await page.screenshot({path: 'artifacts/release.png'});
    await page.setViewportSize({width: 320, height: 844});
    await checkPlaying();
    await page.screenshot({path: 'artifacts/public-playing-mobile.png'});
  } else {
    const snapshot = () => page.evaluate(() => burning.snapshot());
    let s = await snapshot();
    assert.equal(s.audio.vitals.mode, 'opening');
    // The first interaction may unlock audio, but must not ignite or advance the film.
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(1700);
    s = await snapshot();
    assert.equal(s.started, false);
    assert.equal(s.time, 0);
    assert.equal(s.audio.context, 'running');
    assert.ok(s.audio.vitals.heartbeats >= 2);
    assert.equal(s.audio.vitals.breaths, undefined);
    assert.equal(s.audio.surf.target, 0);
    assert.equal(s.motion.facing, -Math.PI / 2);
    assert.equal(s.audio.windGain, 0);
    assert.equal(s.character.fire.count, 0);
    assert.equal(s.character.animation, 'opening');
    assert.equal(s.lighting.moonPhase, s.score.moonPhase);
    assert.ok(s.lighting.sunDirection[0] < 0);
    assert.ok(s.lighting.moonIntensity > 0);
    await page.locator('#author-toggle').click();
    assert.equal(await page.locator('#author-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#author-panel').isVisible(), true);
    assert.equal(await page.locator('#author-timeline').isVisible(), true);
    await page.locator('#studio-sound').click();
    assert.equal((await snapshot()).audio.muted, true);
    await page.locator('#studio-sound').click();
    assert.equal((await snapshot()).audio.muted, false);
    const numeric = page.locator('#author-panel input[type=number]');
    const sliderCount = await page
      .locator('#author-panel .numeric-control input[type=range]')
      .count();
    assert.equal(await numeric.count(), sliderCount);
    assert.ok((await page.locator('[data-slider]').count()) > 30, 'Studio shows its sliders');
    await page.locator('summary').filter({hasText: 'The burning body'}).click();
    await slide('[data-slider=flame]', '0.65');
    assert.equal((await snapshot()).score.flame, 0.65);
    assert.equal(await page.locator('[data-score=flame]').inputValue(), '0.65');
    await page.locator('[data-score=flame]').fill('1');
    await page.locator('[data-score=flame]').dispatchEvent('change');
    assert.equal(await page.locator('[data-slider=flame]').inputValue(), '1');
    await page.locator('summary').filter({hasText: 'Score timings'}).click();
    // Drive the authored values rather than assuming them: the score is the
    // author's to tune and the checks must survive whatever is in it today.
    const authored = (await snapshot()).score;
    await slide('[data-slider=fallAt]', String(authored.stage_05_fall - 0.5));
    assert.equal((await snapshot()).score.stage_05_fall, authored.stage_05_fall - 0.5);
    await page.locator('[data-score=fallAt]').fill(String(authored.stage_05_fall));
    await page.locator('[data-score=fallAt]').dispatchEvent('change');
    assert.equal(await page.locator('#add-fall').count(), 0);
    assert.equal(await page.locator('#timeline').count(), 1);
    assert.equal(await page.locator('#timeline').getAttribute('max'), String(authored.duration));
    assert.ok((await page.locator('#timeline').boundingBox()).width > 800);
    await slide('[data-slider=settleAt]', String(authored.stage_09_settle + 1));
    assert.equal((await snapshot()).score.stage_09_settle, authored.stage_09_settle + 1);
    await page.locator('[data-score=settleAt]').fill(String(authored.stage_09_settle));
    await page.locator('[data-score=settleAt]').dispatchEvent('change');
    await page.screenshot({path: 'artifacts/sliders.png'});
    await page.locator('#author-toggle').click();
    await checkOpening();
    assert.equal(await page.locator('#author-toggle').getAttribute('aria-expanded'), 'false');
    await page.screenshot({path: 'artifacts/opening.png'});
    // Inspect the restored uninterrupted face at neutral lighting, then restore the shipped score.
    await page.evaluate(() => {
      window.savedScore = burning.snapshot().score;
      burning.applyScore({...savedScore, startHour: 12, endHour: 12});
      burning.setView('face');
    });
    await page.waitForTimeout(700);
    await page.screenshot({path: 'artifacts/face.png'});
    await page.evaluate(() => {
      burning.applyScore(savedScore);
      burning.reset();
    });
    await page.locator('#start').click();
    await page.waitForTimeout(7300);
    s = await snapshot();
    assert.equal(s.audio.context, 'running');
    await checkPlaying();
    assert.ok(s.audio.windGain > 0);
    assert.ok(s.character.fire.count > 0);
    assert.equal(s.cue.clip, 'locomotion');
    assert.equal(s.direction.mode, 'ocean');
    assert.ok(s.motion.position.x < s.score.spawnX - 1);
    const offsetYaw = (state) =>
      Math.atan2(
        state.camera.position[0] - state.camera.target[0],
        state.camera.position[2] - state.camera.target[2],
      );
    assert.equal(s.camera.mode, 'scripted');
    const yawBefore = offsetYaw(s);
    await page.waitForTimeout(2000);
    s = await snapshot();
    assert.ok(Math.abs(offsetYaw(s) - yawBefore) > 0.002, 'The side camera should slowly drift');
    // Orbiting and zooming must leave the unattended ocean walk uninterrupted.
    const beforeOrbit = s.motion.position.x;
    await page.mouse.move(550, 400);
    await page.mouse.down();
    await page.mouse.move(620, 430, {steps: 8});
    await page.mouse.up();
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(800);
    s = await snapshot();
    assert.equal(s.direction.mode, 'ocean');
    assert.equal(s.direction.returnIn, 0);
    assert.equal(s.camera.mode, 'manual');
    assert.ok(s.motion.position.x < beforeOrbit - 0.2);
    // Restore a side shot; W now follows the viewing direction again.
    await page.evaluate(() => burning.setView('full'));
    const autoMotion = (await snapshot()).motion;
    const steeringYaw = offsetYaw(await snapshot());
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2600);
    await page.keyboard.up('KeyW');
    s = await snapshot();
    assert.ok(s.motion.distance > 1);
    assert.equal(s.direction.mode, 'player');
    assert.equal(s.camera.mode, 'manual');
    assert.ok(Math.abs(offsetYaw(s) - steeringYaw) < 0.01);
    const dx = s.motion.position.x - autoMotion.position.x;
    const dz = s.motion.position.z - autoMotion.position.z;
    assert.ok(-dx * Math.sin(steeringYaw) - dz * Math.cos(steeringYaw) > 0.5);
    const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    assert.ok(angleGap(s.motion.facing, steeringYaw + Math.PI) < 0.025);
    assert.ok(s.audio.footfalls > 0);
    assert.ok(s.sand.footfalls > 0);
    assert.ok(s.sand.swells > 0 && s.sand.swells <= s.sand.swellCapacity);
    assert.ok(s.motion.speed <= s.pace + 0.01);
    assert.ok(s.character.fire.birthRegions.torso > s.character.fire.birthRegions.legs * 2);
    // Orbit during W: movement follows the new view while the camera coasts.
    const bodyHeading = s.motion.facing;
    await page.keyboard.down('KeyW');
    await page.mouse.move(500, 390);
    await page.mouse.down();
    await page.mouse.move(740, 415, {steps: 8});
    await page.mouse.up();
    const releaseYaw = offsetYaw(await snapshot());
    await page.waitForTimeout(100);
    const coastYaw = offsetYaw(await snapshot());
    await page.waitForTimeout(450);
    s = await snapshot();
    assert.ok(Math.abs(coastYaw - releaseYaw) > 0.01, 'Orbit should coast after mouse release');
    assert.ok(Math.abs(offsetYaw(s) - coastYaw) > 0.01);
    assert.ok(Math.abs(s.motion.facing - bodyHeading) > 0.25, 'W should follow the changed view');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(1200);
    const turnStart = (await snapshot()).motion;
    const leftHeading = offsetYaw(await snapshot()) - Math.PI / 2;
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(750);
    await page.keyboard.up('KeyA');
    s = await snapshot();
    assert.ok(angleGap(s.motion.facing, leftHeading) < 0.12);
    const leftDistance = Math.hypot(
      s.motion.position.x - turnStart.position.x,
      s.motion.position.z - turnStart.position.z,
    );
    assert.ok(leftDistance > 0.25 && leftDistance < s.pace);
    assert.equal(s.character.animation, 'walk');
    await page.screenshot({path: 'artifacts/burning.png'});
    await page.locator('#pause').click();
    const frozen = (await snapshot()).time;
    const frozenSand = (await snapshot()).sand;
    const frozenSea = (await snapshot()).sea.simulationTime;
    const frozenIdle = (await snapshot()).direction.returnIn;
    await page.waitForTimeout(600);
    assert.equal((await snapshot()).time, frozen);
    assert.equal((await snapshot()).sea.simulationTime, frozenSea);
    assert.deepEqual((await snapshot()).sand, frozenSand);
    // Wheel zoom also eases to its destination while the transport is paused.
    const horizontalRadius = (state) =>
      Math.hypot(
        state.camera.position[0] - state.camera.target[0],
        state.camera.position[2] - state.camera.target[2],
      );
    const beforeZoom = horizontalRadius(await snapshot());
    await page.mouse.move(700, 420);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(100);
    const midZoom = horizontalRadius(await snapshot());
    await page.waitForTimeout(600);
    const afterZoom = horizontalRadius(await snapshot());
    assert.ok(beforeZoom - midZoom > 0.01);
    assert.ok(midZoom - afterZoom > 0.01, 'Zoom must settle gradually after the wheel input');
    assert.equal((await snapshot()).time, frozen);
    // Pause freezes the movement timeout. Camera input must never extend it.
    assert.equal((await snapshot()).direction.returnIn, frozenIdle);
    // The twelve-second timeout needs a clear stretch of walking to prove itself,
    // so put the clock back before the stop he makes to look around.
    await page.evaluate(() => burning.seek(10));
    await page.locator('#pause').click();
    // The seek returns him to the script, so take the walk over again first.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyW');
    const beforeCameraIdle = (await snapshot()).direction.returnIn;
    await page.mouse.move(560, 410);
    await page.mouse.down();
    await page.mouse.move(620, 430, {steps: 8});
    await page.mouse.up();
    assert.equal((await snapshot()).direction.mode, 'player');
    assert.ok((await snapshot()).direction.returnIn <= beforeCameraIdle);
    const held = (await snapshot()).motion.position.x;
    await page.waitForTimeout(8500);
    assert.equal((await snapshot()).direction.mode, 'player');
    const remaining = (await snapshot()).direction.returnIn;
    await page.waitForTimeout((remaining + 1) * 1000);
    s = await snapshot();
    assert.equal(s.direction.mode, 'ocean');
    assert.ok(s.motion.position.x < held - 0.1);
    await page.waitForTimeout(6500);
    assert.equal((await snapshot()).camera.mode, 'scripted');
    // The timer still ends a manually diverted journey at its current location.
    const diverted = await page.evaluate(() => {
      const position = burning.snapshot().motion.position;
      burning.seek(149.5, false);
      return position;
    });
    await page.locator('#pause').click();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyW');
    s = await snapshot();
    assert.equal(s.time, 150);
    assert.equal(s.cue.ended, true);
    const endObservedAt = Date.now();
    const pauseOpacity = await page.locator('#pause').evaluate((e) => +getComputedStyle(e).opacity);
    assert.ok(pauseOpacity > 0 && pauseOpacity < 1, 'Pause fades as the score ends');
    assert.equal(s.motion.position.x, diverted.x);
    assert.equal(s.motion.position.z, diverted.z);
    const endedSea = s.sea.simulationTime;
    const endedHead = s.character.posture.Head;
    await page.waitForTimeout(750);
    s = await snapshot();
    assert.equal(s.time, 150);
    assert.ok(
      s.sea.simulationTime > endedSea + 0.15,
      'The ocean must keep moving after the ending',
    );
    assert.deepEqual(s.character.posture.Head, endedHead);
    assert.ok(s.character.fire.count > 0);
    assert.equal(s.audio.surf.target, 0, 'A diverted inland ending must not play surf');
    assert.equal(await page.locator('#invitation').isVisible(), false);
    assert.equal(await page.locator('.masthead').isVisible(), true);
    assert.equal(await page.locator('#pause').isDisabled(), true);
    assert.equal(await page.locator('#pause').isVisible(), false);
    assert.equal(await page.locator('#progress').innerText(), '0:00');
    assert.equal(await page.locator('#progress').evaluate((e) => +getComputedStyle(e).opacity), 1);
    await page.waitForFunction(
      () => {
        const opacity = +getComputedStyle(document.querySelector('#progress')).opacity;
        return opacity > 0 && opacity < 1;
      },
      null,
      {timeout: 7000},
    );
    assert.ok(Date.now() - endObservedAt > 4000, 'Timer lingers before its separate fade');
    await page.locator('#progress').waitFor({state: 'hidden', timeout: 2000});
    assert.ok((await snapshot()).sea.simulationTime > endedSea + 4);
    await page.screenshot({path: 'artifacts/ending-controls-hidden.png'});
    await page.locator('#author-toggle').click();
    // Exercise the real thumb, rather than only the console seek shortcut.
    const bar = await page.locator('#timeline').boundingBox();
    await page.mouse.move(bar.x + bar.width * 0.1, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2, {steps: 6});
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(burning.snapshot().time - 75) < 0.4);
    assert.equal(await page.locator('#pause').isVisible(), true);
    assert.equal(await page.locator('#pause').isEnabled(), true);
    assert.equal(await page.locator('#progress').isVisible(), true);
    assert.equal(await page.locator('#progress').evaluate((e) => +getComputedStyle(e).opacity), 1);
    assert.ok((await snapshot()).character.fire.count > 100);
    const seekTimes = [];
    for (const [time, clip] of [
      [35.6, 'kneefall'],
      [39, 'standup'],
      [136, 'kneeling'],
      [140, 'settle'],
    ]) {
      const elapsed = await page.evaluate((t) => {
        const begin = performance.now();
        const input = document.querySelector('#timeline');
        input.value = String(t);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        return new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now() - begin)),
          ),
        );
      }, time);
      seekTimes.push(elapsed);
      await page.waitForFunction((t) => burning.snapshot().time === t, time);
      assert.equal((await snapshot()).character.animation, clip);
      const sampled = await snapshot();
      assert.ok(sampled.character.fire.count > 100);
      for (const particle of sampled.character.fire.particles)
        assert.ok(
          Math.abs(particle.position[0] - sampled.motion.position.x) < 6,
          'Flames must follow the sought body',
        );
    }
    console.log('Timeline seek latency (ms):', seekTimes);
    await slide('#timeline', 35.6);
    await page.waitForFunction(() => burning.snapshot().time === 35.6);
    const fallPosition = (await snapshot()).motion.position;
    const fallCamera = offsetYaw(await snapshot());
    await slide('#timeline', 30);
    await page.waitForFunction(() => burning.snapshot().time === 30);
    await slide('#timeline', 35.6);
    await page.waitForFunction(() => burning.snapshot().time === 35.6);
    assert.deepEqual((await snapshot()).motion.position, fallPosition);
    assert.ok(Math.abs(offsetYaw(await snapshot()) - fallCamera) < 0.0001);
    await page.screenshot({path: 'artifacts/timeline.png'});
    // Held movement cannot cancel the music-timed exhaustion fall.
    await page.locator('#studio-pause').click();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    await page.locator('#studio-pause').click();
    assert.equal((await snapshot()).motion.position.x, fallPosition.x);
    assert.equal((await snapshot()).motion.position.z, fallPosition.z);
    await page.evaluate(() => {
      burning.applyScore({...savedScore, flame: 0});
      burning.seek(150);
    });
    await page.waitForTimeout(500);
    const head = (await snapshot()).character.posture.Head;
    const reviewSea = (await snapshot()).sea.simulationTime;
    await page.waitForTimeout(1200);
    const after = await snapshot();
    assert.deepEqual(after.character.posture.Head, head);
    assert.equal(after.sea.simulationTime, reviewSea);
    assert.equal(after.audio.surf.target, 0, 'Paused author review stays quiet');
    assert.equal(after.motion.speed, 0);
    assert.equal(after.cue.ended, true);
    assert.ok(after.route.waterDistance > 9 && after.route.waterDistance < 10);
    await page.screenshot({path: 'artifacts/final-pose.png'});
    await page.evaluate(() => {
      burning.applyScore(savedScore);
      burning.seek(150);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({path: 'artifacts/ending.png'});
    await page.evaluate(async () => {
      burning.seek(149.5);
      await burning.togglePause();
    });
    await page.waitForTimeout(1200);
    s = await snapshot();
    assert.equal(s.time, 150);
    assert.ok(s.audio.surf.target > 0.3, 'Surf continues beside the sea after the ending');
    await page.locator('#save-draft').click();
    assert.ok(await page.evaluate(() => localStorage.getItem('burning-man-score-v1')));
    await page.locator('#studio-start').click();
    s = await snapshot();
    assert.ok(s.time < 1);
    assert.equal(s.motion.distance, 0);
    assert.equal(s.sand.footfalls, 0);
    assert.equal(s.sand.swells, 0);
    assert.equal(s.motion.position.x, s.score.spawnX);
    assert.equal(s.motion.facing, -Math.PI / 2);
    if (process.env.FULL === '1') {
      assert.equal((await snapshot()).direction.mode, 'ocean');
      await slide('#rate', '3');
      const wallStart = Date.now(),
        frames = s.sea.frames;
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(4000);
        s = await snapshot();
        console.log('Journey', s.time.toFixed(1), s.cue.phase, s.motion.position.x.toFixed(1));
        if (s.cue.ended) break;
      }
      assert.equal(s.cue.ended, true);
      assert.equal(s.character.animation, 'settle');
      assert.ok(
        s.motion.position.x < -107,
        `Sea route ended too far inland: ${s.motion.position.x}`,
      );
      assert.ok(s.motion.position.x >= s.map.layout.coast + s.score.beachMargin - 0.001);
      console.log('Complete journey:', {
        position: s.motion.position,
        frames: s.sea.frames - frames,
        seconds: (Date.now() - wallStart) / 1000,
      });
      await page.screenshot({path: 'artifacts/full-journey.png'});
    }
    console.log('Author checks passed:', {backend: s.renderer, route: s.route, errors});
  }
  assert.deepEqual(errors, []);
  console.log(release ? 'Release browser passed' : 'Experience browser passed');
} catch (error) {
  console.log(
    'Failure state:',
    await page.evaluate(() => ({
      time: window.burning?.snapshot().time,
      direction: window.burning?.snapshot().direction,
      inputs: window.worldInputs,
    })),
  );
  await page.screenshot({path: 'artifacts/experience-failure.png'});
  throw error;
} finally {
  await browser.close();
}
