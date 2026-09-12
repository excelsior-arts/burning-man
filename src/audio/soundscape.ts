import {DEFAULT_SCORE, pace, type Score} from '../experience/score';
import {VitalPlayer, type VitalTransport} from './vital-player';
import {SurfPlayer, type SurfListener} from './surf';
import {WALK_CONTACTS, walkStepCount} from '../character/walk-gait';

/** Filtered-noise wind and footsteps. */
export class Soundscape {
  private context?: AudioContext;
  private vitals?: VitalPlayer;
  private surf?: SurfPlayer;
  private score = DEFAULT_SCORE;
  private transport: VitalTransport = {
    time: 0,
    started: false,
    playing: false,
    rate: 1,
    visible: true,
  };
  onStateChange?: () => void;
  private master?: GainNode;
  private windGain?: GainNode;
  private windFilter?: BiquadFilterNode;
  private fireGain?: GainNode;
  /** iOS keeps the media volume in the user's hands: the property reads 1
   * whatever is written to it. Found once, the first time a level is set. */
  private volumeSettable?: boolean;
  private noise?: AudioBuffer;
  private nodes: AudioScheduledSourceNode[] = [];
  private media = new Audio();
  private objectUrl?: string;
  private musicNeedsSeek = true;
  private heartbeatPreviewRequest = 0;
  private distance = 0;
  private footfalls = 0;
  private crackle = 0;
  muted = false;
  /** Asked for a fresh address when the one in hand will not play. */
  onSourceFailed?: () => void;
  private sourceFailures = 0;
  status = 'Desert sound ready · no music selected';
  constructor() {
    this.media.preload = 'auto';
    // The song plays straight from the element to the output, never through the
    // graph. On iOS a media element feeding a MediaElementAudioSourceNode is a
    // tap off AVFoundation into a one-second ring buffer that the graph's render
    // thread must keep draining: whatever the graph misses under load, the song
    // falls behind by, and once a second is owed it is snapped forward to the
    // present, which is heard as the song rushing. The element on its own has no
    // such consumer to fall behind.
    this.media.crossOrigin = 'anonymous';
    this.media.addEventListener('error', () => {
      this.status = 'Music could not load. Desert sound remains available.';
      // The address the song is fetched from is signed and does not live for
      // ever. Left paused past its life and then resumed, the element is handed
      // a refusal rather than the song, so a fresh address is asked for instead
      // of the piece simply going quiet. Bounded, since a signer that is down
      // would otherwise be asked for ever; a track that plays clears the count.
      if (this.media.hasAttribute('src') && this.sourceFailures < 3) {
        this.sourceFailures++;
        this.onSourceFailed?.();
      }
    });
    this.media.addEventListener('canplay', () => {
      this.sourceFailures = 0;
    });
  }
  /** Try autoplay immediately; a blocked browser can resume this same context on any gesture. */
  arm(score: Score) {
    this.score = score;
    this.transport.visible = !document.hidden;
    void this.unlock().catch(() => this.onStateChange?.());
  }
  follow(transport: VitalTransport, score: Score) {
    this.transport = {...transport};
    if (!transport.visible) this.stopHeartbeatPreview();
    this.score = score;
    this.vitals?.follow(transport, score);
    this.waiting();
  }
  /** The desert is there before he is. Nothing draws while the piece waits to be
   * started, so the frame loop sleeps and the running mix is never asked for;
   * the wind is therefore set once and left to the graph, where the filter's own
   * slow sweep keeps it moving for nothing. The piece takes the level back the
   * moment it begins. */
  private waiting() {
    if (!this.context || !this.windGain || this.transport.started) return;
    this.windGain.gain.setTargetAtTime(this.lobbyWind(), this.context.currentTime, 0.9);
  }
  /** What the desert sounds like with nobody in it. */
  private lobbyWind() {
    return this.transport.visible && !this.muted && !this.transport.started
      ? this.score.ambienceGain * 0.26
      : 0;
  }
  async unlock() {
    if (!this.context) {
      const ctx = (this.context = new AudioContext());
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.65;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(ctx.destination);
      this.vitals = new VitalPlayer(ctx, this.master, this.score);
      this.surf = new SurfPlayer(ctx, this.master);
      this.vitals.follow(this.transport, this.score);
      ctx.onstatechange = () => this.onStateChange?.();
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.025 * (Math.random() * 2 - 1)) / 1.025;
        data[i] = last * 3;
      }
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = (this.windFilter = ctx.createBiquadFilter());
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      const wind = (this.windGain = ctx.createGain());
      wind.gain.value = 0;
      source.connect(filter).connect(wind).connect(this.master);
      source.start();
      this.nodes.push(source);
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = 0.055;
      depth.gain.value = 90;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start();
      this.nodes.push(lfo);
      const fire = ctx.createBufferSource();
      fire.buffer = this.noise;
      fire.loop = true;
      const high = ctx.createBiquadFilter();
      high.type = 'bandpass';
      high.frequency.value = 1300;
      high.Q.value = 0.45;
      this.fireGain = ctx.createGain();
      this.fireGain.gain.value = 0;
      fire.connect(high).connect(this.fireGain).connect(this.master);
      fire.start();
      this.nodes.push(fire);
    }
    this.onStateChange?.();
    await this.context.resume();
    this.waiting();
    this.onStateChange?.();
  }
  setTrack(url: string) {
    this.musicNeedsSeek = true;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
    this.media.pause();
    if (url) {
      this.media.crossOrigin = 'anonymous';
      // Previews and tests pass blob and data URLs; a score passes a bare path.
      this.media.src = /^[a-z][\w+.-]*:/i.test(url) ? url : new URL(url, document.baseURI).href;
      this.status = 'Music selected';
    } else {
      this.media.removeAttribute('src');
      this.media.load();
      this.status = 'Desert sound only';
    }
  }
  setFile(file: File) {
    this.setTrack('');
    this.objectUrl = URL.createObjectURL(file);
    this.media.src = this.objectUrl;
    this.status = `Preview: ${file.name}`;
  }
  async previewHeartbeat(pitch: number) {
    const request = ++this.heartbeatPreviewRequest;
    await this.unlock();
    if (request === this.heartbeatPreviewRequest && this.transport.visible)
      this.vitals?.preview(Math.max(28, Math.min(65, pitch)), this.score.heartbeatGain);
  }
  stopHeartbeatPreview() {
    this.heartbeatPreviewRequest++;
    this.vitals?.stopPreview();
  }
  toggleMute() {
    this.muted = !this.muted;
    this.media.muted = this.muted;
    this.waiting();
    if (this.context)
      this.master?.gain.setTargetAtTime(this.muted ? 0 : this.bed(), this.context.currentTime, 0.025);
    this.onStateChange?.();
  }
  /** The song's level, and whether the element will take one at all. */
  private setMusicLevel(level: number) {
    const wanted = Math.max(0, Math.min(1, level));
    if (this.volumeSettable === undefined) {
      this.media.volume = 0.5;
      this.volumeSettable = this.media.volume === 0.5;
    }
    if (this.volumeSettable && this.media.volume !== wanted) this.media.volume = wanted;
  }
  /** Master level for everything but the song. The song used to pass through
   * this same 0.65; where the element takes a volume it still does, and where it
   * will not, the bed comes up to meet the song's own level instead, so the
   * balance the piece was mixed at survives on both. */
  private bed() {
    return this.volumeSettable === false ? 1 : 0.65;
  }
  /** Reposition only for transport edits. Safari's media clock can trail the
   * score by its output latency; repeatedly "fixing" that delay interrupts audio.
   */
  async sync(time: number, playing: boolean, rate: number, seek = false) {
    if (seek) this.musicNeedsSeek = true;
    if (!this.context) return;
    const playbackRate = Math.max(0.25, Math.min(3, rate));
    if (this.media.playbackRate !== playbackRate) this.media.playbackRate = playbackRate;
    if (!playing) this.media.pause();
    // A song that stopped on its own, on a stalled frame or when the phone took
    // the audio session away, keeps its place: the picture comes back to it,
    // because a seek is the one thing here that is actually audible. Only a
    // transport edit or a new source repositions it, and both say so.
    if (this.musicNeedsSeek) {
      // And never from the wrong place. After a spell in the background iOS can
      // hand the element back with nothing buffered, and playing before the
      // seek lands starts the song from the top. Wait; this runs every frame.
      if (this.media.readyState === 0) return;
      const target = Math.max(
        0,
        Math.min(time, Number.isFinite(this.media.duration) ? this.media.duration : time),
      );
      if (Math.abs(this.media.currentTime - target) > 0.01) this.media.currentTime = target;
      this.musicNeedsSeek = false;
    }
    if (playing && this.media.hasAttribute('src') && this.media.paused && !this.media.ended) {
      try {
        await this.media.play();
      } catch (error) {
        // Pause, seek and source replacement may intentionally cancel a pending play.
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          this.status = 'Press Resume to enable music playback.';
      }
    }
  }

  /** Nought to one, and never the same twice inside three minutes. */
  private gust(time: number) {
    const swell =
      Math.sin(time * 0.081) * 0.5 +
      Math.sin(time * 0.143 + 1.7) * 0.3 +
      Math.sin(time * 0.29 + 4.1) * 0.14 +
      Math.sin(time * 0.53 + 2.3) * 0.06;
    return Math.max(0, Math.min(1, 0.5 + swell * 0.5));
  }

  update(
    dt: number,
    time: number,
    distance: number,
    walking: boolean,
    burn: number,
    playing: boolean,
    s: Score,
    listener?: SurfListener,
  ) {
    const fromDistance = this.distance;
    this.distance = distance;
    const ctx = this.context;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    this.surf!.update(listener, s.surfRange, s.surfGain, playing);
    this.setMusicLevel(s.musicGain * 0.65);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.bed(), t, 0.045);
    // Wind is gusts rather than a level, and a gust is heard as much in the
    // brightness as in the loudness, because moving air hisses. One envelope
    // drives both. Its waves have unrelated periods, so it does not repeat
    // inside the piece, and it is read off the score's own clock, so a scrub
    // lands on the same gust it left.
    const gust = this.gust(time);
    // A frame drawn before he is started must not silence the desert: the piece
    // hands the wind back to the lobby rather than to nothing.
    this.windGain!.gain.setTargetAtTime(
      playing ? s.ambienceGain * 0.32 * (0.45 + gust * 1.05) : this.lobbyWind(),
      t,
      playing ? 0.35 : 0.9,
    );
    this.windFilter?.frequency.setTargetAtTime(430 + gust * 520, t, 0.5);
    this.fireGain!.gain.setTargetAtTime(playing ? burn * s.fireGain * 0.22 : 0, t, 0.1);
    if (playing && walking && distance >= fromDistance) {
      // A tentative step is a quiet step. Footfalls are the only pulse in the
      // mix, so a cadence gathering after a fall was heard as the music itself
      // changing tempo. Weighting each step by how much of his stride he is
      // actually using leaves the gathering to the body rather than the beat.
      const stride = dt > 0 ? (distance - fromDistance) / dt / Math.max(0.1, pace(s)) : 1;
      const weight = Math.min(1, Math.max(0, stride)) ** 1.3;
      for (let step = walkStepCount(fromDistance); step < walkStepCount(distance); step++) {
        const pan = WALK_CONTACTS[step % 2]!.foot === 'left' ? -0.24 : 0.24;
        this.footfalls++;
        this.burst(s.stepsGain * 0.55 * weight, 0.16, 650, pan);
        this.burst(s.stepsGain * 0.12 * weight, 0.055, 160, pan);
      }
    }
    this.crackle += playing ? dt * burn : 0;
    if (this.crackle > 0.13) {
      this.crackle = 0;
      if (Math.random() < 0.5)
        this.burst(s.fireGain * 0.13, 0.025, 2000, (Math.random() - 0.5) * 0.5);
    }
  }
  private burst(volume: number, duration: number, frequency: number, pan: number) {
    if (!this.context || !this.noise || !this.master) return;
    const c = this.context,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain(),
      panner = c.createStereoPanner();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    source.connect(filter).connect(gain).connect(panner).connect(this.master);
    source.start(c.currentTime, Math.random() * 5, duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
  }
  pause() {
    this.musicNeedsSeek = true;
    this.media.pause();
    this.surf?.pause();
    if (this.context) {
      this.windGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
      this.fireGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
    }
  }
  get state() {
    return {
      unlocked: this.context?.state === 'running',
      vitals: this.vitals?.state,
      surf: this.surf?.state,
      footfalls: this.footfalls,
      windGain: this.windGain?.gain.value ?? 0,
      context: this.context?.state,
      muted: this.muted,
      musicTime: this.media.currentTime,
      musicPlaying: !this.media.paused,
      status: this.status,
    };
  }
  dispose() {
    this.stopHeartbeatPreview();
    this.media.pause();
    this.vitals?.dispose();
    this.surf?.dispose();
    for (const n of this.nodes) n.stop();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    void this.context?.close();
  }
}
