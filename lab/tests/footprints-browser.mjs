import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
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
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(process.env.URL ?? 'http://127.0.0.1:5180');
  await page.locator('#start:not([disabled])').waitFor({timeout: 90000});
  await page.addStyleTag({content: '#world{pointer-events:none!important}'});
  await page.evaluate(async () => {
    // Use the instance's exact Vite URL, including any development cache version.
    const fieldUrl = performance
      .getEntriesByType('resource')
      .find((entry) => new URL(entry.name).pathname === '/src/sand/field.ts')?.name;
    if (!fieldUrl) throw new Error('Sand module was not loaded');
    const {SandField} = await import(fieldUrl);
    const contact = SandField.prototype.contact;
    window.footprints = [];
    SandField.prototype.contact = function (event) {
      if (!event.kind || event.kind === 'step') {
        // Measure what the step actually sank, and on what ground.
        const before = this.surface(event.x, event.z).delta;
        const result = contact.call(this, event);
        window.footprints.push({
          ...event,
          depth: before - this.surface(event.x, event.z).delta,
          crust: this.crustWeight(event.x, event.z),
          wet: this.wetWeight(event.x, event.z),
        });
        return result;
      }
      return contact.call(this, event);
    };
    const score = burning.snapshot().score;
    // Daylight, no flame, and a walk that actually crosses every ground: at the
    // shipped pace he stops on the coastal dune, so the beach would never be
    // stepped on. Full gait, no intro wait, and the pace calibration would pick.
    const {calibratedPace} = await import('/src/experience/walker.ts');
    const plain = {...score, startHour: 15, endHour: 15, flame: 0, smoke: 0, paceScale: 1, stage_01_flame: 0};
    burning.applyScore({...plain, walkSpeed: calibratedPace(burning.applyScore(plain))});
  });
  await mkdir('artifacts/footprints', {recursive: true});
  const cases = [];
  for (const [name, time, routine] of [
    ['starting-dune', 8, 'story'],
    // Clear of the stop he makes to look about, and of the fall and its recovery.
    ['playa', 55, 'story'],
    ['coastal-dune', 90, 'story'],
    // The last stretch of the walk, on the shoreward side of the coastal screen.
    // The walk never reaches the saturated swash: an eight-metre dry margin is
    // enforced, and the figure stops about ten metres from the water.
    ['beach', 128, 'story'],
  ]) {
    await page.evaluate((routine) => burning.setRoutine(routine), routine);
    await page.evaluate((time) => burning.seek(time), time);
    await page.waitForFunction(() => burning.snapshot().rendering.idle);
    const soundBefore = await page.evaluate(() => burning.snapshot().audio.footfalls);
    const result = await page.evaluate(async () => {
      const {WALK_CONTACTS, walkStepCount} = await import('/src/character/walk-gait.ts');
      window.footprints.length = 0;
      await burning.togglePause();
      return new Promise((resolve, reject) => {
        const samples = [],
          start = performance.now();
        let seen = 0;
        const check = async () => {
          const state = burning.snapshot();
          if (footprints.length > seen) {
            seen = footprints.length;
            const print = footprints.at(-1);
            const foot = WALK_CONTACTS[(walkStepCount(state.motion.distance) - 1) % 2].foot;
            const [heel, toe] = state.character.grounding.probes.filter((p) => p.foot === foot);
            const sole = {x: (heel.x + toe.x) / 2, z: (heel.z + toe.z) / 2};
            samples.push({
              foot,
              time: state.time,
              print,
              sole,
              error: Math.hypot(print.x - sole.x, print.z - sole.z),
            });
          }
          if (samples.length >= 2) {
            // Let the rendered frame dispatch its sound before pausing it.
            await new Promise((resolve) => setTimeout(resolve, 80));
            await burning.togglePause();
            resolve(samples);
          } else if (performance.now() - start > 30000)
            reject(
              new Error(
                'Footfalls did not advance: ' +
                  JSON.stringify({
                    captured: footprints.length,
                    time: state.time,
                    sand: state.sand.footfalls,
                  }),
              ),
            );
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    });
    const sounds = await page.evaluate(() => burning.snapshot().audio.footfalls);
    assert.equal(
      sounds - soundBefore,
      result.length,
      `${name}: step sounds must follow the same contacts`,
    );
    assert.equal(result[0].foot === result[1].foot, false);
    for (const step of result)
      assert.ok(step.error < 0.035, `${name}: ${step.foot} print offset ${step.error} m`);
    await page.waitForFunction(() => burning.snapshot().rendering.idle);
    await page.screenshot({path: `artifacts/footprints/${name}.png`});
    cases.push({name, steps: result});
    console.log(
      name,
      result.map((s) => s.error),
    );
  }
  assert.deepEqual(errors, []);
  const ground = Object.fromEntries(
    cases.map((c) => [
      c.name,
      {
        depth: Math.max(...c.steps.map((s) => s.print.depth)),
        crust: +c.steps[0].print.crust.toFixed(3),
        wet: +c.steps[0].print.wet.toFixed(3),
      },
    ]),
  );
  // The playa crust is firm: a step there scuffs it instead of sinking into it.
  assert.ok(
    ground.playa.crust > 0.9,
    `playa must be recognised as crust: ${ground.playa.crust}`,
  );
  assert.ok(
    ground['starting-dune'].crust < 0.1 && ground['coastal-dune'].crust < 0.1,
    'dune faces must not be treated as crust',
  );
  // The beach softens again as the dune relief gives way to it.
  assert.ok(
    ground.beach.crust < 0.6 && ground.beach.depth > ground.playa.depth * 4,
    `the beach must stay softer than the crust: ${JSON.stringify(ground.beach)}`,
  );
  assert.ok(
    ground.playa.depth < 0.01,
    `playa prints must be a few millimetres at most: ${ground.playa.depth} m`,
  );
  for (const dune of ['starting-dune', 'coastal-dune', 'beach'])
    assert.ok(
      ground.playa.depth < ground[dune].depth * 0.25,
      `playa print ${ground.playa.depth} m must be far shallower than ${dune} ${ground[dune].depth} m`,
    );
  console.log('Print depth by ground, in millimetres:', Object.fromEntries(
    Object.entries(ground).map(([k, v]) => [k, {mm: +(v.depth * 1000).toFixed(1), crust: v.crust, wet: v.wet}]),
  ));
  await writeFile('artifacts/footprints/review.json', JSON.stringify({cases, ground}, null, 2));
  console.log(
    'Live footprint / rendered-sole errors:',
    cases.map((c) => ({
      name: c.name,
      centimeters: c.steps.map((s) => +(s.error * 100).toFixed(2)),
    })),
  );
} finally {
  await browser.close();
}
