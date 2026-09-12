import {FALL_SECONDS, type Cue, type Score} from '../experience/score';
import {lookSpan, lookStart} from '../experience/look-around';

interface TimelineHost {
  snapshot(): {
    ready: boolean;
    time: number;
    playing: boolean;
    started: boolean;
    score: Score;
    cue: Cue;
    direction: {mode: string; returnIn: number};
  };
  seek(time: number): void;
  start(): Promise<void>;
  togglePause(): Promise<void>;
  reset(): void;
}
export function timecode(time: number, precise = false) {
  const tenths = Math.round(time * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}${precise ? `.${tenths % 10}` : ''}`;
}

/** One large playhead, outside the scrolling settings. Scrubbing always previews the script. */
export function mountTimeline(host: TimelineHost) {
  const element = document.createElement('section');
  element.id = 'author-timeline';
  element.hidden = true;
  element.setAttribute('aria-label', 'Scripted journey timeline');
  element.innerHTML = `
    <div class="timeline-heading"><div><span class="studio-kicker">SCRIPTED JOURNEY</span>
      <strong id="studio-phase">Before the flame</strong></div>
      <output id="studio-clock">0:00.0 / ${timecode(host.snapshot().score.duration)}</output>
      <div class="studio-actions"><button id="studio-start">Start</button><button id="studio-pause">Resume</button><button id="studio-reset">Reset</button></div></div>
    <div class="timeline-track"><span>0:00</span><div class="timeline-rail">
      <input id="timeline" aria-label="Scripted journey playhead" type="range" min="0" max="${host.snapshot().score.duration}" step="0.1" value="0"/>
      <div id="timeline-ticks" aria-hidden="true"></div></div><span id="timeline-end">${timecode(host.snapshot().score.duration)}</span></div>
    <div id="timeline-cues"></div>
    <div class="timeline-note"><span>Drag to preview the selected journey. Resume plays from here.</span><output id="control-status">Walking toward the ocean</output></div>`;
  document.body.append(element);
  const $ = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
  const range = $<HTMLInputElement>('#timeline');
  let pending: number | null = null,
    frame = 0,
    dragging = false,
    signature = '';
  function flush() {
    frame = 0;
    if (pending === null) return;
    const at = pending;
    pending = null;
    host.seek(at);
    reflect();
  }
  function queue(at: number) {
    pending = at;
    range.value = String(at);
    $('#studio-clock').textContent =
      `${timecode(at, true)} / ${timecode(host.snapshot().score.duration)}`;
    if (!frame) frame = requestAnimationFrame(flush);
  }
  range.oninput = () => queue(Number(range.value));
  const finish = () => {
    dragging = false;
    if (frame) cancelAnimationFrame(frame);
    flush();
  };
  function drag(event: PointerEvent) {
    const rect = range.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left - 6.5) / (rect.width - 13)),
    );
    queue(Math.round(fraction * Number(range.max) * 10) / 10);
  }
  range.onpointerdown = (event) => {
    if (range.disabled || event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    range.focus({preventScroll: true});
    range.setPointerCapture(event.pointerId);
    drag(event);
  };
  range.onpointermove = (event) => {
    if (dragging) drag(event);
  };
  range.onpointerup = (event) => {
    if (!dragging) return;
    drag(event); // Always apply the release position, even if rendering coalesced moves.
    finish();
    range.releasePointerCapture(event.pointerId);
  };
  range.onchange = finish;
  range.onpointercancel = finish;
  range.onlostpointercapture = finish;
  $('#studio-start').onclick = () => {
    finish();
    void host.start();
  };
  $('#studio-pause').onclick = () => {
    finish();
    void host.togglePause();
  };
  $('#studio-reset').onclick = () => {
    pending = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    host.reset();
    reflect();
  };
  function reflect() {
    const current = host.snapshot(),
      s = current.score;
    // Every stage he passes through, including the small ones, in the order he
    // meets them. A beat that the score has squeezed out simply is not listed.
    const span = lookSpan(s);
    const marks: [string, string, number][] = (
      [
        ['flame', 'Flame takes', s.stage_01_flame],
        ['lit', 'Fully alight', s.stage_02_alight],
        ['walk', 'Walks to the ocean', s.stage_03_walk],
        ['look', 'Stops to look about', lookStart(s)],
        span > 0 ? ['looked', 'Back on his heading', lookStart(s) + span] : null,
        ['fall', 'First fall', s.stage_05_fall],
        ['knees', 'On his knees', s.stage_05_fall + FALL_SECONDS],
        ['rise', 'Rises again', s.stage_05_fall + FALL_SECONDS + s.stage_05_fall_hold],
        ['crest', 'Tops the last dune', s.stage_07_crest],
        s.stage_07_crest_hold > 0 ? ['descend', 'Walks on down', s.stage_07_crest + s.stage_07_crest_hold] : null,
        ['tire', 'Exhaustion begins', s.stage_06_fatigue],
        ['last', 'Final knee fall', s.stage_08_kneel],
        ['settle', 'Settles onto heels', s.stage_09_settle],
        ['bow', 'Head bows', s.stage_10_bow],
        ['end', 'End', s.duration],
      ] as ([string, string, number] | null)[]
    )
      .filter((m): m is [string, string, number] => m !== null)
      .sort((a, b) => a[2] - b[2]);
    const nextSignature = JSON.stringify([s.duration, ...marks]);
    if (signature !== nextSignature) {
      signature = nextSignature;
      range.max = String(s.duration);
      $('#timeline-end').textContent = timecode(s.duration);
      $('#timeline-ticks').replaceChildren();
      $('#timeline-cues').replaceChildren();
      for (const [id, name, at] of marks) {
        const tick = document.createElement('span');
        tick.style.left = `${(at / s.duration) * 100}%`;
        $('#timeline-ticks').append(tick);
        const button = document.createElement('button');
        button.dataset.cue = id;
        button.textContent = `${name} · ${timecode(at, true)}`;
        button.onclick = () => queue(at);
        $('#timeline-cues').append(button);
      }
    }
    if (pending === null && !dragging) range.value = String(current.time);
    range.setAttribute('aria-valuetext', timecode(Number(range.value), true));
    $('#studio-phase').textContent = current.cue.phase;
    if (pending === null)
      $('#studio-clock').textContent = `${timecode(current.time, true)} / ${timecode(s.duration)}`;
    $('#studio-pause').textContent = current.playing ? 'Pause' : 'Resume';
    $('#studio-pause').toggleAttribute('disabled', !current.started || current.time >= s.duration);
    $('#studio-start').toggleAttribute('disabled', !current.ready);
    range.disabled = !current.ready;
    $('#control-status').textContent = current.cue.ended
      ? 'The journey has ended'
      : current.direction.mode === 'player'
        ? `Your control · ocean in ${current.direction.returnIn.toFixed(1)}s idle`
        : current.direction.mode === 'ocean'
          ? 'Walking toward the ocean'
          : `Study: ${current.direction.mode}`;
  }
  reflect();
  const interval = setInterval(() => {
    if (!element.hidden) reflect();
  }, 100);
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(interval);
      cancelAnimationFrame(frame);
    },
    {once: true},
  );
  return {element, reflect};
}
