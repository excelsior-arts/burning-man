import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const url = process.env.URL ?? 'http://127.0.0.1:5180';
for (const autoplay of [false, true]) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      `--autoplay-policy=${autoplay ? 'no-user-gesture-required' : 'document-user-activation-required'}`,
      '--window-position=-3000,-3000',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // Exercise real Web Audio on the dev origin, independently of GPU/frame load.
    await page.route('**/__audio_test__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Audio check</title><button id="enable">Enable sound</button>',
      }),
    );
    await page.goto(`${url}/__audio_test__`);
    const setup = async () => {
      const {Soundscape} = await import('/src/audio/soundscape.ts');
      const {DEFAULT_SCORE} = await import('/src/experience/score.ts');
      window.audio = new Soundscape();
      window.score = DEFAULT_SCORE;
      audio.arm(score);
      window.analyser = audio.context.createAnalyser();
      analyser.fftSize = 2048;
      audio.master.connect(analyser);
      document.querySelector('#enable').onclick = () => void audio.unlock();
      window.follow = (time, playing = true, started = true, rate = 1, visible = true) =>
        audio.follow({time, playing, started, rate, visible}, score);
      window.measure = async (seconds) => {
        let peak = 0,
          energy = 0,
          count = 0;
        const data = new Float32Array(analyser.fftSize);
        const end = performance.now() + seconds * 1000;
        while (performance.now() < end) {
          analyser.getFloatTimeDomainData(data);
          for (const value of data) {
            peak = Math.max(peak, Math.abs(value));
            energy += value * value;
            count++;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return {peak, rms: Math.sqrt(energy / count), state: audio.state};
      };
    };
    // Playwright evaluate normally supplies a user gesture; CDP must explicitly omit it here.
    const cdp = await page.context().newCDPSession(page);
    const setupResult = await cdp.send('Runtime.evaluate', {
      expression: `(${setup.toString()})()`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    assert.equal(setupResult.exceptionDetails, undefined);
    await page.waitForTimeout(100);
    const initial = await cdp.send('Runtime.evaluate', {
      expression: 'audio.state.unlocked',
      returnByValue: true,
      userGesture: false,
    });
    assert.equal(initial.result.value, autoplay);
    if (!autoplay) await page.locator('#enable').click();
    const opening = await page.evaluate(() => measure(1.9));
    assert.equal(opening.state.vitals.mode, 'opening');
    assert.ok(opening.state.vitals.heartbeats >= 2);
    assert.equal(opening.state.vitals.breaths, undefined);
    assert.equal(opening.state.surf.target, 0);
    assert.ok(opening.peak > 0.12 && opening.peak < 1, JSON.stringify(opening));
    assert.ok(opening.rms > 0.01);
    await page.evaluate(() => audio.toggleMute());
    await page.waitForTimeout(180);
    const muted = await page.evaluate(() => measure(0.5));
    assert.ok(muted.peak < 0.001, `Mute leaked ${muted.peak}`);
    await page.evaluate(() => {
      audio.toggleMute();
      follow(126);
    });
    const late = await page.evaluate(() => measure(2.5));
    assert.ok(late.state.vitals.bpm < 40);
    assert.ok(late.state.vitals.irregularity > 0.6);
    assert.ok(late.peak > 0.02);
    await page.evaluate(() => follow(127, false));
    await page.waitForTimeout(180);
    const paused = await page.evaluate(() => measure(0.5));
    assert.ok(paused.peak < 0.0001, `Pause leaked ${paused.peak}`);
    assert.equal(paused.state.vitals.voices, 0);
    // Audition is audible while paused, without changing the scored pitch or pulse cue.
    for (const pitch of [57, 48, 40, 32]) {
      await page.evaluate((pitch) => audio.previewHeartbeat(pitch), pitch);
      const preview = await page.evaluate(() => measure(0.55));
      assert.ok(preview.peak > 0.1 && preview.peak < 1, JSON.stringify(preview));
      assert.equal(preview.state.vitals.previewPitch, pitch);
      assert.equal(preview.state.vitals.pitch, paused.state.vitals.pitch);
      assert.equal(preview.state.vitals.bpm, paused.state.vitals.bpm);
      await page.evaluate(() => audio.stopHeartbeatPreview());
      await page.waitForTimeout(180);
      const stopped = await page.evaluate(() => measure(0.15));
      assert.ok(stopped.peak < 0.0001);
      assert.equal(stopped.state.vitals.previewVoices, 0);
    }
    await page.evaluate(async () => {
      await Promise.all([audio.previewHeartbeat(48), audio.previewHeartbeat(32)]);
    });
    const latest = await page.evaluate(() => audio.state.vitals);
    assert.equal(latest.previewPitch, 32);
    assert.equal(latest.previewVoices, 4);
    await page.waitForTimeout(3300);
    const expired = await page.evaluate(() => measure(0.1));
    assert.equal(expired.state.vitals.previewPitch, null);
    assert.equal(expired.state.vitals.previewVoices, 0);
    assert.ok(expired.peak < 0.0001);
    await page.evaluate(async () => {
      const pending = audio.previewHeartbeat(40);
      audio.stopHeartbeatPreview();
      await pending;
    });
    assert.equal((await page.evaluate(() => audio.state)).vitals.previewPitch, null);

    await page.evaluate(() => follow(139.2));
    const last = await page.evaluate(() => measure(0.9));
    assert.ok(last.peak > 0.04, 'The final double thud must be audible');
    const silence = await page.evaluate(() => measure(0.9));
    assert.ok(silence.peak < 0.0001, `Final silence leaked ${silence.peak}`);
    await page.evaluate(() => follow(145));
    assert.equal((await page.evaluate(() => audio.state)).vitals.stopped, true);
    const after = await page.evaluate(() => measure(0.4));
    assert.ok(after.peak < 0.0001);
    await page.evaluate(() => follow(0, false, false));
    const reset = await page.evaluate(() => measure(1));
    assert.ok(reset.peak > 0.12, 'Reset should restore the steady opening pulse');
    // A background opening must fall quiet too, even though the film has not started.
    await page.evaluate(() => follow(0, false, false, 1, false));
    await page.waitForTimeout(180);
    const hidden = await page.evaluate(() => measure(0.5));
    assert.ok(hidden.peak < 0.0001);
    // Isolate shore ambience after the pulse has stopped; no graphics clock is involved.
    // The walk runs west along z = 0: the playa, the coastal dune crest at x = -76,
    // then the beach. The shoreline itself is at x = -118.3.
    const walkTo = (x) =>
      page.evaluate((x) => audio.update(0.016, 145, 0, false, 0, true, score, {x, z: 0}), x);
    await page.evaluate(() => {
      score = {...score, ambienceGain: 0, fireGain: 0, stepsGain: 0, musicGain: 0, surfGain: 0.7};
      follow(145);
      audio.update(0.016, 145, 0, false, 0, true, score, {x: 0, z: 0});
    });
    const inland = await page.evaluate(() => measure(0.4));
    assert.ok(inland.peak < 0.0001);
    assert.equal(inland.state.surf.target, 0);
    // On the playa behind the dune, and again halfway up its windward face: the
    // crest stands over his ear line both times, so the sea is not there yet.
    await walkTo(-45);
    const behind = await page.evaluate(() => measure(0.4));
    assert.equal(behind.state.surf.openness, 0);
    assert.equal(behind.state.surf.target, 0);
    assert.ok(behind.peak < 0.0001, 'The coastal dune must keep the surf out');
    await walkTo(-60);
    const climbing = await page.evaluate(() => measure(0.4));
    assert.ok(climbing.state.surf.target < 0.001, 'The climb is still all but silent');
    assert.ok(climbing.peak < 0.0001);
    await walkTo(-90);
    const approaching = await page.evaluate(() => measure(1));
    assert.ok(approaching.state.surf.openness > 0.99, 'Over the crest the water is open');
    assert.ok(approaching.rms > 0.001, 'Approaching shore must become audible');
    await walkTo(-110);
    const beach = await page.evaluate(() => measure(1));
    assert.equal(beach.state.surf.proximity, 1);
    assert.ok(beach.state.surf.target > approaching.state.surf.target);
    assert.ok(beach.rms > 0.001 && beach.peak < 1);
    // The author's fader is heard at once, without waiting for the next approach.
    await page.evaluate(() => {
      score = {...score, surfGain: 0.12};
      audio.update(0.016, 145, 0, false, 0, true, score, {x: -110, z: 0});
    });
    await page.waitForTimeout(200);
    const quieter = await page.evaluate(() => measure(0.6));
    assert.ok(
      quieter.rms < beach.rms * 0.5,
      `Shore surf slider did not take effect: ${quieter.rms}`,
    );
    await page.evaluate(() => {
      score = {...score, surfGain: 0.7};
      audio.update(0.016, 145, 0, false, 0, true, score, {x: -110, z: 0});
    });
    await page.waitForTimeout(200);
    const louder = await page.evaluate(() => measure(0.6));
    assert.ok(louder.rms > quieter.rms * 2, 'Raising the slider is heard at once too');
    await walkTo(0);
    await page.waitForTimeout(2200);
    const away = await page.evaluate(() => measure(0.4));
    assert.ok(away.peak < 0.0001, 'Walking inland fades surf out');
    await page.evaluate(() => {
      audio.update(0.016, 145, 0, false, 0, true, score, {x: -110, z: 0});
      audio.pause();
    });
    await page.waitForTimeout(180);
    const surfPause = await page.evaluate(() => measure(0.3));
    assert.ok(surfPause.peak < 0.0001);
    await page.evaluate(() => audio.dispose());
    assert.deepEqual(errors, []);
    console.log('Audio browser passed', {
      autoplay,
      opening: {peak: opening.peak, rms: opening.rms},
      late: {peak: late.peak, bpm: late.state.vitals.bpm},
      finalSilence: silence.peak,
    });
  } finally {
    await browser.close();
  }
}
