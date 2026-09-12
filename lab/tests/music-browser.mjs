import {chromium, webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

// Optional AAC/Opus test tone for codec-specific checks; default fixture is generated PCM.
const encoded = process.env.MUSIC_FIXTURE
  ? (await readFile(process.env.MUSIC_FIXTURE)).toString('base64')
  : null;
const results = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(
    engine === webkit
      ? {headless: true}
      : {
          headless: false,
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--window-position=-3000,-3000',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
          ],
        },
  );
  try {
    const page = await browser.newPage({ignoreHTTPSErrors: true});
    const errors = [];
    console.log(engine.name(), 'loading audio fixture');
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__music_test__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Music continuity check</title><button id=enable>Enable sound</button>',
      }),
    );
    await page.goto(`${process.env.URL ?? 'http://127.0.0.1:5180'}/__music_test__`);
    await page.evaluate(async (encoded) => {
      const {Soundscape} = await import('/src/audio/soundscape.ts');
      const {DEFAULT_SCORE} = await import('/src/experience/score.ts');
      const audio = (window.audio = new Soundscape());
      const score = {...DEFAULT_SCORE, stepsGain: 0, ambienceGain: 0, fireGain: 0, surfGain: 0};
      audio.arm(score);
      document.querySelector('#enable').onclick = () => void audio.unlock();
      const analyser = audio.context.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      // The piece plays the song straight from the element, because on iOS a
      // graph that misses a deadline drags the song with it. To listen to the
      // song here, the test puts it back through the graph for itself.
      audio.context.createMediaElementSource(audio.media).connect(audio.master);
      audio.master.connect(analyser);
      let bytes;
      if (encoded) bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      else {
        const samples = 48000 * 18;
        const view = new DataView(new ArrayBuffer(44 + samples * 2));
        const text = (offset, word) =>
          [...word].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        text(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 48000, true);
        view.setUint32(28, 96000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, samples * 2, true);
        for (let i = 0; i < samples; i++)
          view.setInt16(44 + i * 2, Math.sin((i * 440 * 2 * Math.PI) / 48000) * 0.4 * 32767, true);
        bytes = new Uint8Array(view.buffer);
      }
      const file = new File([bytes], encoded ? 'tone.m4a' : 'tone.wav', {
        type: encoded ? 'audio/mp4' : 'audio/wav',
      });
      const writes = (window.writes = {seeks: 0, rates: 0});
      for (const [key, counter] of [
        ['currentTime', 'seeks'],
        ['playbackRate', 'rates'],
      ]) {
        const property = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, key);
        Object.defineProperty(audio.media, key, {
          get() {
            return property.get.call(this);
          },
          set(value) {
            writes[counter]++;
            property.set.call(this, value);
          },
        });
      }
      window.musicFollow = (time, playing, rate = 1) => {
        audio.follow({time, playing, rate, started: true, visible: true}, score);
        audio.update(0.02, time, 0, false, 0, playing, score);
      };
      window.musicCheck = {file, analyser, score};
      audio.setFile(file);
    }, encoded);
    await page.locator('#enable').click();
    await page.waitForFunction(() => audio.state.unlocked && audio.media.readyState >= 3);
    const result = await page.evaluate(async () => {
      musicFollow(0, true);
      await audio.sync(0, true, 1, true);
      writes.seeks = writes.rates = 0;
      const start = performance.now(),
        levels = [],
        drift = [];
      const analyser = musicCheck.analyser;
      const bins = new Float32Array(analyser.frequencyBinCount);
      const bin = Math.round((440 * analyser.fftSize) / audio.context.sampleRate);
      let lastSync = 0;
      while (performance.now() - start < 7000) {
        const time = (performance.now() - start) / 1000;
        musicFollow(time, true);
        if (time - lastSync > 0.3) {
          lastSync = time;
          await audio.sync(time, true, 1);
        }
        if (time > 2) {
          analyser.getFloatFrequencyData(bins);
          levels.push(Math.max(...bins.slice(bin - 2, bin + 3)));
          drift.push(audio.media.currentTime - time);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return {
        writes: {...writes},
        spreadDb: Math.max(...levels) - Math.min(...levels),
        minDb: Math.min(...levels),
        driftRange: [Math.min(...drift), Math.max(...drift)],
      };
    });
    assert.equal(
      result.writes.seeks,
      0,
      'Steady music must never repeatedly seek to the graphics clock',
    );
    assert.equal(result.writes.rates, 0, 'Unchanged playback rates must not be rewritten');
    assert.ok(result.spreadDb < 1 && result.minDb > -40, JSON.stringify(result));
    await page.evaluate(async () => {
      musicFollow(7, false);
      await audio.sync(7, false, 1, true);
    });
    assert.equal(await page.evaluate(() => audio.state.musicPlaying), false);
    // Tiny, deliberate scrubs still work even below the former drift tolerance.
    for (const time of [2.15, 2.22]) {
      await page.evaluate((time) => audio.sync(time, false, 1, true), time);
      await page.waitForFunction(() => !audio.media.seeking);
      assert.ok(Math.abs((await page.evaluate(() => audio.media.currentTime)) - time) < 0.03);
    }
    const rates = await page.evaluate(async () => {
      await audio.sync(2.22, true, 1, true);
      writes.rates = 0;
      for (let i = 0; i < 10; i++) await audio.sync(2.22, true, 1.5);
      return writes.rates;
    });
    assert.equal(rates, 1);
    // Replacing a track mid-score waits for metadata and aligns once.
    await page.evaluate(() => audio.setFile(musicCheck.file));
    await page.waitForFunction(() => audio.media.readyState >= 3);
    await page.evaluate(() => audio.sync(5, true, 1));
    await page.waitForFunction(() => !audio.media.seeking);
    assert.ok(Math.abs((await page.evaluate(() => audio.media.currentTime)) - 5) < 0.5);
    await page.evaluate(async () => {
      await audio.sync(audio.media.duration + 2, false, 1, true);
      writes.seeks = 0;
      for (let i = 0; i < 10; i++) await audio.sync(audio.media.duration + 2 + i, false, 1);
    });
    assert.equal(
      await page.evaluate(() => writes.seeks),
      0,
      'Short tracks must not keep seeking after EOF',
    );
    await page.evaluate(() => audio.sync(0, true, 1, true));
    assert.equal(
      await page.evaluate(() => audio.media.paused),
      false,
      'Replay must restart an ended track',
    );
    await page.evaluate(() => audio.dispose());
    assert.deepEqual(errors, []);
    results.push({engine: engine.name(), ...result});
    console.log(engine.name(), result);
  } finally {
    await browser.close();
  }
}
await mkdir('artifacts', {recursive: true});
await writeFile('artifacts/music-continuity.json', JSON.stringify(results, null, 2));
