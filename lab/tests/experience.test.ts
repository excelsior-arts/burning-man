import {describe, it, expect} from 'vitest';
import {
  DEFAULT_SCORE,
  validateScore,
  IGNITE_DELAY_DEFAULT,
  PACE_SCALE_DEFAULT,
  pace,
  retimeScore,
  sampleScore,
  Transport,
  FALL_SECONDS,
  RISE_SECONDS,
  type Score,
} from '../../src/experience/score';
import {Walker, rehearse} from '../../src/experience/walker';
import {coastX} from '../../src/sand/geography';
import {travelBudget} from '../../src/experience/journey';
import {
  LOOK_PIVOT,
  LOOK_SECONDS,
  lookQuarters,
  lookSpan,
  lookStart,
} from '../../src/experience/look-around';
import {REFERENCE} from './reference-score';
const score = validateScore(REFERENCE);
describe('the 150 second score', () => {
  it('holds an unlit opening until a gesture starts ignition', () => {
    expect(sampleScore(0, score, false)).toMatchObject({clip: 'opening', burn: 0, mobility: 0});
    const lit = score.stage_01_flame;
    expect(sampleScore((score.stage_01_flame + score.stage_02_alight) / 2, score)).toMatchObject({
      clip: 'opening',
      burn: 0.5,
      mobility: 0,
    });
    expect(sampleScore(Math.max(score.stage_02_alight, score.stage_03_walk) + 1, score)).toMatchObject({
      clip: 'locomotion',
      burn: 1,
    });
  });

  it('waits out the song intro unlit before the flame takes and the walk begins', () => {
    expect(score.stage_01_flame).toBe(IGNITE_DELAY_DEFAULT);
    // Nothing is alight while the intro plays, and he is still in the opening pose.
    for (let t = 0; t < score.stage_01_flame; t += 0.1)
      expect(sampleScore(t, score)).toMatchObject({
        phase: 'The opening bars',
        clip: 'opening',
        burn: 0,
        mobility: 0,
      });
    expect(sampleScore(score.stage_01_flame, score).phase).toBe('Ignition');
    expect(sampleScore(score.stage_01_flame + 0.01, score).burn).toBeGreaterThan(0);
    // The flame takes over the same seconds as before, and the gap between the
    // flame and the first step is unchanged; both simply start after the intro.
    expect(sampleScore(score.stage_03_walk - 0.01, score).mobility).toBe(0);
    expect(sampleScore(score.stage_03_walk, score).clip).toBe('locomotion');
    const without = validateScore({...score, stage_01_flame: 0});
    for (const t of [0, 1, 3, 5.5])
      expect(sampleScore(t + score.stage_01_flame, score).burn).toBeCloseTo(
        sampleScore(t, without).burn,
        9,
      );
    // A score that names no flame takes the shipped one.
    const {stage_01_flame: _drop, ...older} = score;
    expect(validateScore(older).stage_01_flame).toBe(DEFAULT_SCORE.stage_01_flame);
  });
  it('samples falls, recovery and exhaustion independently of render history', () => {
    for (const t of [score.stage_05_fall]) {
      expect(sampleScore(t + 0.4, score)).toMatchObject({clip: 'kneefall', mobility: 0});
      expect(sampleScore(t + FALL_SECONDS + 0.1, score).clip).toBe('kneeling');
      expect(sampleScore(t + FALL_SECONDS + score.stage_05_fall_hold + 0.1, score).clip).toBe('standup');
      expect(sampleScore(t + FALL_SECONDS + score.stage_05_fall_hold + RISE_SECONDS + 0.1, score).clip).toBe(
        'locomotion',
      );
    }
    expect(sampleScore(score.stage_08_kneel - 5, score).mobility).toBeLessThan(
      sampleScore(score.stage_06_fatigue + 10, score).mobility,
    );
    expect(sampleScore(score.stage_08_kneel + 3, score).clip).toBe('kneeling');
    expect(sampleScore(score.stage_09_settle + 3, score).clip).toBe('settle');
    expect(sampleScore(score.stage_05_fall + 4, score).clip).toBe('standup');
    const end = sampleScore(score.duration, score);
    expect(end).toMatchObject({clip: 'settle', bow: 1, mobility: 0, burn: 1, ended: true});
    expect(sampleScore(999, score)).toEqual(end);
    for (let i = 0; i < score.duration; i += 0.037) sampleScore(i, score);
    expect(sampleScore(score.duration, score)).toEqual(end);
  });
  it('keeps moon phase and light independent while importing older drafts faithfully', () => {
    expect(validateScore({version: 1, moonPhase: 0.2}).moonLight).toBe(0.2);
    const crescent = validateScore({version: 1, moonPhase: 0.2, moonLight: 2.5});
    expect(crescent.moonPhase).toBe(0.2);
    expect(crescent.moonLight).toBe(2.5);
    expect(validateScore({...crescent, moonLight: 20}).moonLight).toBe(4);
    expect(validateScore({...crescent, moonLight: -1}).moonLight).toBe(0);
  });
  it('pauses, seeks and ends without a frame-rate dependent clock', () => {
    const slow = new Transport(),
      fast = new Transport();
    slow.start();
    fast.start();
    for (let i = 0; i < 120; i++) slow.advance(1 / 60, 200);
    fast.advance(2, 200);
    expect(slow.time).toBeCloseTo(fast.time, 10);
    slow.playing = false;
    slow.advance(60, 200);
    expect(slow.time).toBeCloseTo(2, 10);
    slow.seek(198, 200);
    slow.playing = true;
    slow.advance(10, 200);
    expect(slow.time).toBe(200);
    expect(slow.playing).toBe(false);
    slow.reset();
    expect(slow.started).toBe(false);
    expect(slow.time).toBe(0);
  });
  it('rejects invalid and overlapping author cues', () => {
    for (const patch of [
      {duration: 10},
      {stage_08_kneel: 199},
      {stage_09_settle: 180},
      {stage_09_settle: 191},
      {stage_05_fall: 2},
      {idleReturn: 0},
      {stage_03_walk: 190},
      {walkSpeed: NaN},
      {endSpeed: 0},
      {beachMargin: 0},
      {music: 'https://remote/song.mp3'},
      {stage_05_fall: 179},
    ])
      expect(() => validateScore({...score, ...patch})).toThrow();
    expect(validateScore({...score, flame: 9, unused: 'discard'})).not.toHaveProperty('unused');
    expect(validateScore({...score, flame: 9}).flame).toBe(2);
  });
});
describe('the authored score', () => {
  it('is a score the piece can play', () => {
    // The only test that reads src/experience/score.json: everything else measures
    // the pinned reference, so tuning the piece never moves the suite underfoot.
    const authored = validateScore(DEFAULT_SCORE);
    expect(authored.duration).toBeGreaterThan(30);
    expect(lookSpan(authored)).toBeGreaterThanOrEqual(0);
    expect(sampleScore(authored.duration, authored).ended).toBe(true);
  });
});

describe('the look around before the first fall', () => {
  it('stops him for a full circle of quarter turns without moving the fall', () => {
    // He must be walking for a while after the flame takes, so a short song gets a
    // shorter look about; a three-and-a-bit-minute one gets the whole beat.
    expect(lookSpan(score)).toBeLessThanOrEqual(LOOK_SECONDS);
    // The beat runs forward from its own mark, trimmed only if the fall is near.
    expect(lookSpan(score)).toBe(
      Math.min(
        4 * (score.stage_04_look_pivot + score.stage_04_look_hold),
        score.stage_05_fall - score.stage_04_look,
      ),
    );
    expect(lookSpan(retimeScore(score, 200))).toBe(LOOK_SECONDS);
    expect(lookStart(score)).toBe(score.stage_04_look);
    expect(sampleScore(lookStart(score) - 0.01, score)).toMatchObject({
      phase: 'Walking',
      mobility: 1,
    });
    for (let t = lookStart(score); t < score.stage_05_fall; t += 0.1)
      expect(sampleScore(t, score)).toMatchObject({
        phase: 'Looking about',
        clip: 'locomotion',
        mobility: 0,
      });
    // The fall, its recovery and everything after keep their authored timestamps.
    expect(sampleScore(score.stage_05_fall, score)).toMatchObject({clip: 'kneefall', clipTime: 0});
    expect(sampleScore(score.stage_05_fall + 0.4, score).clipTime).toBeCloseTo(0.4, 9);
  });

  it('holds each heading for a beat and is home before the knee fall', () => {
    const slot = lookSpan(score) / 4;
    // Every heading leaves time for the slow pivot and a real look that way.
    expect(slot).toBeGreaterThan(LOOK_PIVOT + 1);
    expect(lookQuarters(lookStart(score) - 0.01, score)).toBe(null);
    expect(lookQuarters(score.stage_05_fall, score)).toBe(null);
    for (const [at, quarter] of [
      [0, 1],
      [slot - 0.01, 1],
      [slot, 2],
      [2 * slot, 3],
      [3 * slot, 4],
      [lookSpan(score) - 0.01, 4],
    ] as const)
      expect(lookQuarters(lookStart(score) + at, score)).toBe(quarter);
  });

  it('costs the walk its seconds, which nothing now buys back', () => {
    // The standing beat is simply standing: no pace makes it up. A score whose fall
    // leaves no room for the beat keeps those seconds, and about nineteen metres.
    const unbroken = validateScore({
      ...score,
      stage_04_look: score.stage_05_fall - 5,
    });
    expect(lookSpan(unbroken)).toBe(0);
    expect(lookSpan(score) + score.stage_01_flame).toBeGreaterThan(20);
    const lost = travelBudget(unbroken) - travelBudget(score);
    expect(lost).toBeGreaterThan(lookSpan(score) * pace(score) * 0.8);
    expect(lost).toBeLessThan((lookSpan(score) + score.stage_01_flame) * pace(score) * 1.2);
  });
});

describe('walk-only coast journey', () => {
  it('caps speed, normalizes diagonals and brakes for falls', () => {
    const a = new Walker(() => 0),
      b = new Walker(() => 0);
    a.reset(0, 0);
    b.reset(0, 0);
    for (let i = 0; i < 600; i++) {
      a.step(1, 0, 1 / 120, 1, score);
      b.step(1, 1, 1 / 120, 1, score);
    }
    // A man on fire keeps only a fraction of the authored gait, but the fatigue
    // ramp still ends on the authored final pace rather than a fraction of that.
    expect(score.paceScale).toBe(PACE_SCALE_DEFAULT);
    expect(pace(score)).toBeCloseTo(score.walkSpeed * PACE_SCALE_DEFAULT, 9);
    expect(a.state.speed).toBeLessThanOrEqual(pace(score));
    const settled = (s: Score, t: number) => pace(s) * sampleScore(t, s).mobility;
    const full = validateScore({...score, paceScale: 1});
    expect(settled(score, score.stage_08_kneel - 0.1)).toBeCloseTo(
      settled(full, score.stage_08_kneel - 0.1),
      5,
    );
    expect(settled(score, score.stage_08_kneel - 0.1)).toBeCloseTo(
      score.walkSpeed * score.endSpeed,
      4,
    );
    expect(settled(score, score.stage_06_fatigue)).toBeCloseTo(settled(full, score.stage_06_fatigue) * 0.85, 6);
    expect(b.state.distance).toBeCloseTo(a.state.distance, 8);
    a.step(1, 0, 1 / 120, 0, score);
    expect(a.state.speed).toBe(0);
  });
  it('retains the dry margin on oblique and lateral shore approaches', () => {
    for (const z of [-120, -40, 0, 40, 120]) {
      const w = new Walker(() => 0);
      w.reset(coastX(z) + score.beachMargin, z);
      for (let i = 0; i < 600; i++) {
        w.step(-1, i % 2 ? 1 : -1, 1 / 60, 1, score);
        expect(w.state.position.x - coastX(w.state.position.z)).toBeGreaterThanOrEqual(
          score.beachMargin - 1e-7,
        );
      }
    }
  });
  it('falls short of the shore at the shipped pace, by a distance the author must close', () => {
    // Pinned so the choice is visible rather than silent: with the intro wait and
    // the look around taken out of the walk, and fifteen per cent off the fresh
    // gait on top, he stops well short of the water and nothing buys it back.
    const r = rehearse(score);
    expect(r.arrival).toBe(null);
    expect(r.waterDistance).toBeGreaterThan(score.beachMargin + 20);
    // The slower gait is part of it; the standing beats are the larger part.
    const full = rehearse(validateScore({...score, paceScale: 1})).waterDistance;
    expect(full).toBeLessThan(r.waterDistance - 8);
    expect(full).toBeGreaterThan(score.beachMargin + 10);
    // Retiming to a longer song does not help: it preserves the authored distance
    // by lowering the pace in step with the extra seconds.
    expect(rehearse(retimeScore(score, 200)).waterDistance).toBeCloseTo(r.waterDistance, 0);
    // Letting that song's extra seconds be walking instead recovers a good part.
    const walked = validateScore({...retimeScore(score, 200), walkSpeed: score.walkSpeed});
    expect(rehearse(walked).waterDistance).toBeLessThan(r.waterDistance - 15);
    expect(rehearse(walked).waterDistance).toBeGreaterThan(score.beachMargin);
  });
});
