import type {Score, Cue} from '../experience/score';
import type {AdaptiveQuality} from '../experience/quality';
import type {Soundscape} from '../audio/soundscape';
import {
  DEFAULT_SCORE,
  validateScore,
  retimeScore,
  FALL_SECONDS,
  RISE_SECONDS,
  SETTLE_SECONDS,
} from '../experience/score';
import type {surveyJourney} from '../experience/journey';
import {numberSlider} from './number-slider';
import {mountTimeline, timecode} from './timeline';
import './panel.css';
interface Host {
  snapshot: () => {
    ready: boolean;
    time: number;
    playing: boolean;
    started: boolean;
    direction: {mode: string; returnIn: number; routine: string};
    study: Cue['clip'] | null;
    score: Score;
    cue: Cue;
    motion: {speed: number; position: {x: number; z: number}};
    route: {waterDistance: number; arrival: number | null};
    map: {journey: string; budget: number; journeys: ReturnType<typeof surveyJourney>[]};
    renderer: string;
    graphics: ReturnType<AdaptiveQuality['inspect']> & {width: number; height: number};
  };
  applyScore: (s: unknown) => Score;
  reset: () => void;
  start: () => Promise<void>;
  togglePause: () => Promise<void>;
  seek: (t: number, reconstruct?: boolean) => void;
  setView: (v: string) => void;
  setRoutine: (v: string) => void;
  setQuality: (v: string) => void;
  jumpToAltar: (name: string) => void;
  setRate: (v: number) => void;
  practice: (v: Cue['clip'] | null) => void;
  calibrate: () => Score;
  audio: Soundscape;
}
const fields: [keyof Score, string, number, number, number][] = [
  ['duration', 'Length · seconds', 30, 600, 1],
  ['stage_01_flame', '1 · Flame takes · s', 0, 60, 0.1],
  ['stage_02_alight', '2 · Fully alight · s', 0, 90, 0.1],
  ['stage_03_walk', '3 · Walks to the ocean · s', 0, 90, 0.1],
  ['stage_05_fall', '5 · First fall · s', 5, 580, 0.1],
  ['stage_06_fatigue', '6 · Exhaustion begins · s', 15, 580, 0.1],
  ['stage_08_kneel', '8 · Final knee fall · s', 20, 590, 0.1],
  ['stage_09_settle', '9 · Settles onto heels · s', 20, 595, 0.1],
  ['stage_10_bow', '10 · Head bows · s', 25, 599, 0.1],
  ['stage_05_fall_hold', '5 · How long he stays down · s', 0, 10, 0.1],
  ['stage_07_crest', '7 · Tops the last dune · s', 5, 590, 0.1],
  ['stage_07_crest_hold', '7 · How long he stands there · s', 0, 10, 0.1],
  ['stage_04_look', '4 · Stops to look about · s', 5, 580, 0.1],
  ['stage_04_look_pivot', '4 · Seconds per quarter turn', 0.5, 10, 0.1],
  ['stage_04_look_hold', '4 · Seconds on each heading', 0, 20, 0.5],
  ['idleReturn', 'Return after no movement input · s', 10, 15, 0.1],
  ['walkSpeed', 'Walking · m/s', 0.3, 2, 0.001],
  ['paceScale', 'How much of that gait he has left · ×', 0.4, 1.5, 0.01],
  ['endSpeed', 'Final pace · fraction', 0.1, 1, 0.01],
  ['spawnX', 'Start east / west', -70, 120, 0.1],
  ['spawnZ', 'Start north / south', -150, 150, 0.5],
  ['beachMargin', 'Dry beach margin · m', 5, 20, 0.5],
  ['startHour', 'Sun at start · hour', 0, 24, 0.05],
  ['endHour', 'Sun at end · hour', 0, 24, 0.05],
  ['moonPhase', 'Moon phase · illuminated', 0, 1, 0.01],
  ['moonLight', 'Moonlight strength · ×', 0, 4, 0.05],
  ['moonElevation', 'Moon elevation · °', 5, 85, 1],
  ['moonAzimuth', 'Moon azimuth · °', -180, 180, 1],
  ['wind', 'Sea → mountain wind · m/s', 0, 8, 0.1],
  ['flame', 'Flame volume', 0, 2, 0.05],
  ['legFire', 'Leg emission · fraction', 0, 1, 0.01],
  ['smoke', 'Smoke', 0, 2, 0.05],
  ['ember', 'Amber burn', 0, 2, 0.05],
  ['musicGain', 'Music', 0, 1, 0.01],
  ['ambienceGain', 'Desert wind', 0, 1, 0.01],
  ['stepsGain', 'Sand steps', 0, 1, 0.01],
  ['fireGain', 'Fire sound', 0, 1, 0.01],
  ['heartbeatGain', 'Heartbeat', 0, 1, 0.01],
  ['heartbeatBpm', 'Heartbeat · BPM', 40, 160, 1],
  ['heartbeatPitch', 'Heartbeat tone · Hz', 28, 65, 1],
  ['surfGain', 'Shore surf', 0, 1, 0.01],
  ['surfRange', 'Surf reach from shore · m', 30, 200, 1],
  ['heartbeatSlowAt', 'Heartbeat slows · s', 0, 590, 0.1],
  ['heartbeatStopBeforeEnd', 'Heartbeat stops before end · s', 0, 30, 0.1],
  ['cameraDistance', 'Side view distance · m', 4, 12, 0.1],
  ['cameraDrift', 'Slow angle variation · °', 0, 35, 0.5],
  ['cameraReturn', 'Return after camera idle · s', 3, 20, 0.5],
];
export function mountAuthor(host: Host) {
  const toggle = document.createElement('button');
  toggle.id = 'author-toggle';
  toggle.textContent = 'Studio';
  toggle.setAttribute('aria-controls', 'author-panel author-timeline');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-keyshortcuts', 'H');
  document.body.append(toggle);
  const panel = document.createElement('aside');
  panel.id = 'author-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Experience authoring studio');
  panel.innerHTML = `
 <header><span class="studio-kicker">BURNING MAN / AUTHORING</span><h2>Shape the experience.</h2><p>These controls are removed from a release build.</p></header>
 <section><h3>Altar shortcuts</h3><div class="studio-actions"><button data-jump="air" aria-keyshortcuts="Shift+1">Air · ⇧1</button><button data-jump="fire" aria-keyshortcuts="Shift+2">Fire · ⇧2</button><button data-jump="earth" aria-keyshortcuts="Shift+3">Earth · ⇧3</button></div><p>Jump straight to a discovery, paused just before the final fall. Drag to inspect, or resume to play the ending. Shortcuts also work with Studio hidden.</p></section>
 <section><h3>Movement study</h3><div class="studio-actions"><button id="face-view">Face detail</button><button id="full-view">Whole body</button></div><label>Walking routine<select id="routine"><option value="story">Scripted ocean walk + WASD takeover</option><option value="keyboard">Manual only · WASD study</option><option value="coast">Continuous walk toward sea</option><option value="air">North passage · Air reveal</option><option value="fire">South passage · Fire reveal</option><option value="earth">Eastern dune · Earth reveal</option><option value="circle">Circle</option><option value="still">Remain still</option></select></label>
 <div id="transport-speed"></div><label>Pose practice<select id="practice"><option value="">Follow the score</option><option value="opening">Arms open · unlit</option><option value="kneefall">Fall onto knees</option><option value="kneeling">Knees · ready to rise</option><option value="settle">Settle onto heels · final</option><option value="standup">Rise from knees</option></select></label><p>WASD moves relative to the camera. Dragging or zooming only changes the camera; it returns gently to side views when left alone.</p><p>Choose a route, then scrub the timeline to rehearse its reveal. The public walk always starts toward the sea.</p><p id="route-status"></p><p id="reveal-status"></p><button id="calibrate">Calibrate walking pace for the beach</button></section>
 <section><h3>Graphics budget</h3><label>Quality<select id="graphics-quality"><option value="auto">Auto</option><option value="high">High · 60 fps</option><option value="balanced">Balanced · 30 fps</option><option value="low">Low · 30 fps</option></select></label><p id="graphics-status"></p><p>Balanced is High's picture at half the cadence; Low is the reduced picture. Auto starts balanced and steps down after sustained slow frames. Re-select Auto to retry; graphics never change the music or walking speed.</p></section>
 <div id="field-groups"></div>
 <section><h3>Music & score</h3><button id="studio-sound" aria-pressed="false">Mute sound</button><label>Preview your song<input id="music-file" type="file" accept="audio/*"/></label><label>Release music source<input id="music-path" placeholder="audio/song.mp3"/></label><p id="audio-status"></p><p id="vital-status"></p>
 <p id="fall-status"></p>
 <div class="studio-actions"><button id="save-draft">Save draft</button><button id="load-draft">Load draft</button><button id="export-score">Export score</button><button id="write-score" hidden>Write score.json</button></div><label>Import score<input id="import-score" type="file" accept="application/json,.json"/></label><button id="default-score">Restore shipped score</button><p id="studio-message" role="status"></p></section>`;
  document.body.append(panel);
  const timeline = mountTimeline(host);
  const $ = <T extends HTMLElement>(s: string) => panel.querySelector<T>(s)!;
  const message = (s: string) => ($('#studio-message').textContent = s);
  const sliders = new Map<keyof Score, ReturnType<typeof numberSlider>>();

  function bounds(key: keyof Score, s: Score, min: number, max: number): [number, number] {
    const recovery = FALL_SECONDS + s.stage_05_fall_hold + RISE_SECONDS;
    if (key === 'duration') {
      min = 120;
      max = 240;
    }
    // Every stage is held between the stages either side of it, so a mark can
    // be dragged without any other mark moving under it.
    if (key === 'stage_01_flame') max = Math.min(s.stage_02_alight, s.stage_03_walk) - 0.1;
    if (key === 'stage_02_alight') {
      min = s.stage_01_flame + 0.1;
      max = s.stage_06_fatigue - 0.1;
    }
    if (key === 'stage_03_walk') {
      min = s.stage_01_flame + 0.1;
      max = s.stage_05_fall - 0.1;
    }
    if (key === 'stage_04_look') {
      min = s.stage_03_walk;
      max = s.stage_05_fall - 0.1;
    }
    if (key === 'stage_05_fall') {
      min = Math.max(s.stage_03_walk, s.stage_02_alight);
      max = s.stage_08_kneel - recovery - 0.1;
    }
    if (key === 'stage_06_fatigue') {
      min = s.stage_02_alight + 0.1;
      max = s.stage_08_kneel - 0.1;
    }
    if (key === 'stage_07_crest') max = s.stage_08_kneel - 0.1;
    if (key === 'stage_08_kneel') {
      min = Math.max(s.stage_06_fatigue + 0.1, s.stage_05_fall + recovery + 0.1);
      max = s.stage_09_settle - FALL_SECONDS;
    }
    if (key === 'stage_09_settle') {
      min = s.stage_08_kneel + FALL_SECONDS;
      max = s.stage_10_bow - SETTLE_SECONDS;
    }
    if (key === 'stage_10_bow') {
      min = s.stage_09_settle + SETTLE_SECONDS;
      max = s.duration - 0.1;
    }
    if (key === 'stage_05_fall_hold')
      max = Math.min(max, s.stage_08_kneel - s.stage_05_fall - FALL_SECONDS - RISE_SECONDS - 0.1);
    if (key === 'heartbeatSlowAt') max = s.duration - s.heartbeatStopBeforeEnd - 0.1;
    if (key === 'heartbeatStopBeforeEnd') max = Math.min(30, s.duration - s.heartbeatSlowAt - 0.1);
    return [min, Math.max(min, max)];
  }
  function reflect() {
    const s = host.snapshot().score;
    for (const [key, , min, max] of fields)
      sliders.get(key)?.set(Number(s[key]), ...bounds(key, s, min, max));
    $<HTMLInputElement>('#music-path').value = s.music;
    $('#heartbeat-current').textContent = `Preview current · ${s.heartbeatPitch} Hz`;
    $('#vital-status').textContent =
      `Pulse slows at ${timecode(s.heartbeatSlowAt, true)} and stops at ${timecode(s.duration - s.heartbeatStopBeforeEnd, true)}. Wind and fire remain; the coastal dune keeps the surf out until he crests it, and from there it rises over the last ${s.surfRange} m to full at the water.`;
    $('#fall-status').textContent =
      `Exhaustion at ${timecode(s.stage_05_fall, true)}; rising at ${timecode(s.stage_05_fall + FALL_SECONDS + s.stage_05_fall_hold, true)}; walking again at ${timecode(s.stage_05_fall + FALL_SECONDS + s.stage_05_fall_hold + RISE_SECONDS, true)}. These moments stay fixed when the player takes control.`;
    timeline.reflect();
  }
  function update(score: Score) {
    try {
      host.applyScore(score);
      const current = host.snapshot();
      if (current.started && !current.playing) host.seek(current.time);
      message('Score updated. Export when ready.');
    } catch (e) {
      message(String(e));
    }
    reflect();
  }
  const rate = numberSlider('Transport speed · ×', 0.25, 3, 0.05, (value) => {
    host.setRate(value);
    rate.set(value);
  });
  rate.range.id = 'rate';
  rate.set(1);
  $('#transport-speed').append(rate.element);
  const sections = [
    ['Score timings', 0, 10],
    ['Ground & walking', 10, 17],
    ['Sun, moon & wind', 17, 24],
    ['The burning body', 24, 28],
    ['Sound mix', 28, 38],
    ['Camera', 38, fields.length],
  ] as const;
  for (const [title, start, end] of sections) {
    const section = document.createElement('details');
    section.innerHTML = `<summary>${title}</summary>`;
    for (const [key, label, min, max, step] of fields.slice(start, end)) {
      const slider = numberSlider(label, min, max, step, (value) => {
        try {
          const current = host.snapshot().score;
          update(key === 'duration' ? retimeScore(current, value) : {...current, [key]: value});
        } catch (error) {
          message(String(error));
          reflect();
        }
      });
      slider.number.dataset.score = key;
      slider.range.dataset.slider = key;
      sliders.set(key, slider);
      section.append(slider.element);
    }
    if (title === 'Sun, moon & wind') {
      const note = document.createElement('p');
      note.textContent =
        'Moon phase shapes the visible disc. Moonlight strength lights the dunes independently.';
      section.append(note);
    }
    if (title === 'Sound mix') {
      const note = document.createElement('p');
      note.textContent =
        'Shore surf is the level at the water and is heard the moment you move it. Surf reach is where the rise begins; whatever it is, the coastal dune keeps the surf out until he crests it.';
      section.append(note);
      const audition = document.createElement('div');
      audition.className = 'heartbeat-audition';
      audition.innerHTML = `<h3>Compare heartbeat tones</h3>
        <div class="studio-actions">${[
          ['Original', 57],
          ['Warm', 48],
          ['Deep', 40],
          ['Sub', 32],
        ]
          .map(
            ([name, hz]) =>
              `<button data-heart-preview="${hz}" aria-label="Preview ${name} heartbeat, ${hz} Hz">${name} · ${hz} Hz</button>`,
          )
          .join('')}</div>
        <p id="heartbeat-preview-status" role="status">Preview four beats without changing the score. Use tone applies your choice; the Hz slider fine-tunes it.</p>
        <div class="studio-actions"><button id="heartbeat-current">Preview current tone</button><button id="heartbeat-use" disabled>Use tone</button><button id="heartbeat-stop">Stop preview</button></div>`;
      section.append(audition);
    }
    $('#field-groups').append(section);
  }
  let auditionPitch: number | null = null;
  const audition = async (pitch: number, label: string) => {
    auditionPitch = pitch;
    $<HTMLButtonElement>('#heartbeat-use').disabled = false;
    $('#heartbeat-use').textContent = `Use ${pitch} Hz`;
    $('#heartbeat-preview-status').textContent = host.audio.muted
      ? 'Sound is muted. Unmute sound to hear this preview.'
      : `Previewing ${label}. Your score is unchanged.`;
    try {
      await host.audio.previewHeartbeat(pitch);
    } catch (error) {
      message(String(error));
    }
  };
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-heart-preview]')) {
    button.onclick = () => void audition(Number(button.dataset.heartPreview), button.textContent!);
  }
  $('#heartbeat-current').onclick = () => {
    const pitch = host.snapshot().score.heartbeatPitch;
    void audition(pitch, `current tone · ${pitch} Hz`);
  };
  $('#heartbeat-stop').onclick = () => {
    host.audio.stopHeartbeatPreview();
    $('#heartbeat-preview-status').textContent = 'Preview stopped. Your score is unchanged.';
  };
  $('#heartbeat-use').onclick = () => {
    if (auditionPitch === null) return;
    host.audio.stopHeartbeatPreview();
    update({...host.snapshot().score, heartbeatPitch: auditionPitch});
    $('#heartbeat-preview-status').textContent =
      `${auditionPitch} Hz applied. Save a draft or export the score to keep it.`;
  };
  const toggleStudio = () => {
    panel.hidden = !panel.hidden;
    timeline.element.hidden = panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (
      panel.hidden &&
      (panel.contains(document.activeElement) || timeline.element.contains(document.activeElement))
    )
      toggle.focus();
  };
  toggle.onclick = toggleStudio;
  const jump = (name: string) => {
    host.jumpToAltar(name);
    $<HTMLSelectElement>('#routine').value = name;
    reflect();
    message(`Paused at ${name} discovery.`);
  };
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-jump]'))
    button.onclick = () => jump(button.dataset.jump!);
  window.addEventListener('keydown', (e) => {
    if (
      e.repeat ||
      e.isComposing ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable)
    )
      return;
    const name = ({Digit1: 'air', Digit2: 'fire', Digit3: 'earth'} as Record<string, string>)[
      e.code
    ];
    if (e.shiftKey && name) {
      e.preventDefault();
      jump(name);
    } else if (e.code === 'KeyH') toggleStudio();
  });
  $<HTMLSelectElement>('#routine').onchange = (e) =>
    host.setRoutine((e.target as HTMLSelectElement).value);
  $<HTMLSelectElement>('#practice').onchange = (e) =>
    host.practice(((e.target as HTMLSelectElement).value || null) as Cue['clip'] | null);
  $('#studio-sound').onclick = () => {
    host.audio.toggleMute();
    if (!host.audio.muted) void host.audio.unlock().catch((error) => message(String(error)));
  };
  $('#face-view').onclick = () => host.setView('face');
  $('#full-view').onclick = () => host.setView('full');
  $('#calibrate').onclick = () => {
    host.calibrate();
    reflect();
    message(
      'Walking pace calibrated; the start stays on its ridge. Check the other reveals before exporting.',
    );
  };
  $<HTMLInputElement>('#music-file').onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      host.audio.setFile(file);
      message(
        'Local preview only. Put the finished track in public/audio and set its release path.',
      );
    }
  };
  $<HTMLInputElement>('#music-path').onchange = (e) => {
    try {
      host.applyScore({...host.snapshot().score, music: (e.target as HTMLInputElement).value});
    } catch (error) {
      message(String(error));
      reflect();
    }
  };
  $('#save-draft').onclick = () => {
    localStorage.setItem('burning-man-score-v1', JSON.stringify(host.snapshot().score));
    message('Draft saved in this browser.');
  };
  $('#load-draft').onclick = () => {
    try {
      host.applyScore(
        validateScore(JSON.parse(localStorage.getItem('burning-man-score-v1') ?? 'null')),
      );
      host.reset();
      reflect();
      message('Draft loaded.');
    } catch (e) {
      message(String(e));
    }
  };
  $('#export-score').onclick = () => {
    const blob = new Blob([JSON.stringify(host.snapshot().score, null, 2) + '\n'], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'score.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Replace src/experience/score.json with this export to make the release score.');
  };
  // Only the dev server can write the source file; the authoring build cannot.
  if (import.meta.env.DEV) {
    const write = $<HTMLButtonElement>('#write-score');
    write.hidden = false;
    write.onclick = async () => {
      write.disabled = true;
      try {
        const response = await fetch('/__score', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(host.snapshot().score, null, 2) + '\n',
        });
        message(
          response.ok
            ? 'Written to src/experience/score.json. Reload the file in your editor.'
            : `The dev server refused the score: ${await response.text()}`,
        );
      } catch (e) {
        message(String(e));
      } finally {
        write.disabled = false;
      }
    };
  }
  $<HTMLInputElement>('#import-score').onchange = async (e) => {
    try {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      host.applyScore(JSON.parse(await file.text()));
      host.reset();
      reflect();
      message('Score imported.');
    } catch (error) {
      message(String(error));
    }
  };
  $('#default-score').onclick = () => {
    host.applyScore(DEFAULT_SCORE);
    host.reset();
    reflect();
    message('Shipped score restored.');
  };
  $<HTMLSelectElement>('#graphics-quality').onchange = (event) =>
    host.setQuality((event.target as HTMLSelectElement).value);
  reflect();
  const interval = setInterval(() => {
    if (panel.hidden) return;
    const s = host.snapshot();
    $<HTMLSelectElement>('#routine').value = s.direction.routine;
    $<HTMLSelectElement>('#practice').value = s.study ?? '';
    $('#route-status').textContent =
      `Sea rehearsal: ${s.route.waterDistance.toFixed(1)} m from water. ${s.route.arrival === null ? 'Beach not reached.' : `Dry beach at ${s.route.arrival.toFixed(1)}s.`} · ${s.renderer}`;
    $('#reveal-status').textContent = s.map.journeys
      .filter((r) => r.journey !== 'sea')
      .map(
        (r) =>
          `${r.journey}: gate ${r.crossedAt === null ? 'not reached' : timecode(r.crossedAt, true)}, altar ${r.altarDistance?.toFixed(1)} m beyond the ending`,
      )
      .join(' · ');
    $<HTMLSelectElement>('#graphics-quality').value = s.graphics.mode;
    $('#graphics-status').textContent =
      `${s.renderer} · ${s.graphics.tier} · ${!s.playing && !s.study ? 'Idle' : s.graphics.fps ? Math.round(s.graphics.fps) + ' fps' : 'Measuring'} / ${s.graphics.targetFps} target · ${s.graphics.width} × ${s.graphics.height} · ${s.graphics.reason}`;
    $('#audio-status').textContent = host.audio.status;
    $('#studio-sound').textContent = host.audio.muted ? 'Unmute sound' : 'Mute sound';
    $('#studio-sound').setAttribute('aria-pressed', String(host.audio.muted));
  }, 250);
  window.addEventListener('pagehide', () => clearInterval(interval), {once: true});
}
