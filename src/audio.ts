// Sound (Web Audio): recorded effects and loops (generated with ElevenLabs, in public/sfx), with synthesized
// versions that play until the recordings load, or if they can't (the single-file build has no sfx folder).
// A ski hiss follows your speed, yeti footsteps quicken as it closes in, wind blows under every run, an
// avalanche rumbles louder as it gains on you, and the Burning Man crackles. (GDD §9: every cue also has a
// visual, so the game plays fine muted.) Browsers only allow audio after a user gesture, so nothing plays
// until unlock() is called from one.

export type SoundName =
  | 'roar' | 'crash' | 'nearMiss' | 'jump' | 'trick' | 'land' | 'trickLand' | 'bounce' | 'coin' | 'snack'
  | 'finish' | 'eaten' | 'buried' | 'burn' | 'click' | 'secret' | 'unlock' | 'gate' | 'ignite';

const MASTER = 0.6;
const SFX_URL = './sfx/';
/** Recorded one-shots: file and playback gain (balanced by ear against each other). */
const SAMPLES: Partial<Record<SoundName | 'step', [string, number]>> = {
  roar: ['roar.mp3', 0.8], step: ['step.mp3', 0.9], crash: ['crash.mp3', 0.7], nearMiss: ['nearMiss.mp3', 0.45],
  jump: ['jump.mp3', 0.35], land: ['land.mp3', 0.4], trickLand: ['trickLand.mp3', 0.45], coin: ['coin.mp3', 0.35],
  gate: ['gate.mp3', 0.45], ignite: ['ignite.mp3', 0.22], burn: ['ignite.mp3', 0.4], eaten: ['eaten.mp3', 0.85],
  buried: ['buried.mp3', 0.85], finish: ['finish.mp3', 0.5], unlock: ['unlock.mp3', 0.55], click: ['click.mp3', 0.35],
  bounce: ['bounce.mp3', 0.5], snack: ['snack.mp3', 0.5], secret: ['secret.mp3', 0.6],
};
/** Recorded loops (WAV, so they loop without the gap MP3 encoding adds). */
const LOOPS = { hiss: 'hiss.wav', wind: 'wind.wav', rumble: 'rumble.wav', fire: 'fire.wav' } as const;
type LoopName = keyof typeof LOOPS;

/** Levels for the loops each frame (0–1): the avalanche's closeness and the Burning Man's flame. */
export interface Ambience {
  rumble: number;
  fire: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hissGain: GainNode | null = null;
  private hissFilter: BiquadFilterNode | null = null;
  private stepClock = 0;
  /** Last values sent to the hiss, so automation is only scheduled when they change (Safari slows down otherwise). */
  private hissLevel = -1;
  private hissFreq = -1;
  private samples = new Map<string, AudioBuffer>();
  private loops: Partial<Record<LoopName, { gain: GainNode; src: AudioBufferSourceNode; level: number; rate: number }>> = {};
  /** Last ignite, so a forest going up doesn't stack dozens of copies. */
  private lastIgnite = 0;
  muted = false;

  /** `recordings: false` plays only the synthesized sounds (the single-file build ships no sfx folder). */
  constructor(private recordings = true) {}

  /** Create (or resume) the audio context. Call from a click / tap handler. */
  unlock() {
    if (this.ctx) {
      // iOS only starts audio from a finished tap (touchend / click), and suspends or "interrupts" it when the
      // phone locks or another app takes over: keep nudging it until it's running.
      if (this.ctx.state !== 'running') {
        void this.ctx.resume();
        this.blip();
      }
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    // iOS 17+: treat this as game audio, so it plays even with the ring/silent switch on silent.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        // Not allowed here: the silent switch will mute the game, as for any web page.
      }
    }
    try {
      const ctx = new Ctx();
      this.ctx = ctx;
      if (ctx.state !== 'running') void ctx.resume();
      this.blip();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      this.master.connect(ctx.destination);
      // One second of white noise, reused by every noisy sound.
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // The ski hiss: looping noise through a band-pass, silent until you move.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      this.hissFilter = ctx.createBiquadFilter();
      this.hissFilter.type = 'bandpass';
      this.hissFilter.frequency.value = 800;
      this.hissFilter.Q.value = 0.8;
      this.hissGain = ctx.createGain();
      this.hissGain.gain.value = 0;
      src.connect(this.hissFilter).connect(this.hissGain).connect(this.master);
      src.start();
      if (this.recordings) void this.loadSamples(ctx);
    } catch {
      this.ctx = null;
    }
  }

  /** Fetch and decode the recordings; each one replaces its synthesized version as soon as it's ready. */
  private async loadSamples(ctx: AudioContext) {
    const decode = (data: ArrayBuffer) =>
      new Promise<AudioBuffer>((resolve, reject) => {
        // The callback form, for older Safari.
        const p = ctx.decodeAudioData(data, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
    const load = async (file: string) => {
      if (this.samples.has(file)) return this.samples.get(file)!;
      const res = await fetch(SFX_URL + file);
      if (!res.ok) throw new Error(file);
      const buf = await decode(await res.arrayBuffer());
      this.samples.set(file, buf);
      return buf;
    };
    await Promise.allSettled([
      ...(Object.keys(LOOPS) as LoopName[]).map(async (name) => {
        const buf = await load(LOOPS[name]);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(this.master!);
        src.start(0, Math.random() * buf.duration);
        this.loops[name] = { gain, src, level: 0, rate: 1 };
      }),
      ...[...new Set(Object.values(SAMPLES).map(([file]) => file))].map(load),
    ]);
  }

  private playSample(name: SoundName | 'step', volume = 1): boolean {
    const entry = SAMPLES[name];
    const buf = entry && this.samples.get(entry[0]);
    if (!this.ctx || !buf || !entry) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // A touch of pitch variety so repeats don't sound copy-pasted.
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = this.ctx.createGain();
    g.gain.value = entry[1] * volume;
    src.connect(g).connect(this.master!);
    src.start();
    return true;
  }

  /** Ease a loop toward a level and playback rate, scheduling automation only when they change. */
  private setLoop(name: LoopName, level: number, rate = 1) {
    const loop = this.loops[name];
    if (!loop || !this.ctx) return;
    const t = this.ctx.currentTime;
    const l = Math.round(level * 100) / 100;
    if (l !== loop.level) {
      loop.level = l;
      loop.gain.gain.setTargetAtTime(l, t, 0.12);
    }
    const r = Math.round(rate * 50) / 50;
    if (r !== loop.rate) {
      loop.rate = r;
      loop.src.playbackRate.setTargetAtTime(r, t, 0.2);
    }
  }

  /** Play one silent sample: the classic way to unlock audio on iOS from inside a user gesture. */
  private blip() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // Ignore: the next gesture tries again.
    }
  }

  /** Is the audio actually running (not suspended or interrupted)? */
  get running() {
    return this.ctx?.state === 'running';
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.ctx.currentTime, 0.02);
  }

  /** Continuous sounds, once per frame: ski hiss from speed, wind, the avalanche and fire, yeti footsteps. */
  update(dt: number, playing: boolean, speed: number, airborne: boolean, proximity: number, ambience: Ambience = { rumble: 0, fire: 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.hissGain || !this.hissFilter) return;
    const t = ctx.currentTime;
    const recordedHiss = !!this.loops.hiss;
    this.setLoop('hiss', playing && !airborne ? Math.min(0.12, speed / 140) : 0, 0.85 + Math.min(speed, 22) / 70);
    this.setLoop('wind', playing ? 0.22 : 0);
    this.setLoop('rumble', playing ? ambience.rumble * 0.9 : 0);
    this.setLoop('fire', playing ? ambience.fire * 0.45 : 0);
    // The synthesized hiss stands in only until the recorded one loads.
    const hiss = playing && !airborne && !recordedHiss ? Math.round(Math.min(0.03, speed / 600) * 200) / 200 : 0;
    if (hiss !== this.hissLevel) {
      this.hissLevel = hiss;
      this.hissGain.gain.setTargetAtTime(hiss, t, 0.05);
    }
    const freq = Math.round((500 + speed * 90) / 50) * 50;
    if (freq !== this.hissFreq) {
      this.hissFreq = freq;
      this.hissFilter.frequency.setTargetAtTime(freq, t, 0.1);
    }
    if (!playing || proximity < 0.15) {
      this.stepClock = 0;
      return;
    }
    this.stepClock -= dt;
    if (this.stepClock <= 0) {
      this.stepClock = 0.6 - proximity * 0.38;
      if (!this.playSample('step', 0.35 + proximity * 0.65)) this.step(0.12 + proximity * 0.3);
    }
  }

  play(name: SoundName) {
    if (!this.ctx || this.muted) return;
    if (name === 'ignite') {
      if (this.ctx.currentTime - this.lastIgnite < 0.07) return;
      this.lastIgnite = this.ctx.currentTime;
    }
    if (this.playSample(name)) return;
    switch (name) {
      case 'roar':
        this.tone(120, 0.9, 'sawtooth', 0.22, 60);
        this.noiseBurst(0.8, 0.25, 500, 'lowpass');
        break;
      case 'crash':
        this.noiseBurst(0.35, 0.45, 1400, 'lowpass');
        this.tone(95, 0.15, 'square', 0.12, 50);
        break;
      case 'nearMiss':
        this.noiseBurst(0.25, 0.18, 2200, 'bandpass', 700);
        break;
      case 'jump':
        this.tone(300, 0.12, 'sine', 0.1, 520);
        break;
      case 'trick':
        this.tone(620, 0.08, 'triangle', 0.1, 900);
        break;
      case 'land':
        this.tone(130, 0.08, 'sine', 0.2, 80);
        break;
      case 'trickLand':
        this.tone(130, 0.08, 'sine', 0.2, 80);
        this.arpeggio([880, 1320], 0.07, 'triangle', 0.08);
        break;
      case 'bounce':
        this.tone(180, 0.25, 'sine', 0.18, 560);
        break;
      case 'coin':
        this.arpeggio([988, 1319], 0.07, 'square', 0.05);
        break;
      case 'snack':
        this.tone(420, 0.09, 'sine', 0.15, 200);
        break;
      case 'finish':
        this.arpeggio([523, 659, 784, 1047], 0.11, 'triangle', 0.12);
        break;
      case 'eaten':
        // A falling "HA-HA-HA" stands in for the recorded laugh.
        for (let i = 0; i < 4; i++) this.tone(150 - i * 18, 0.16, 'sawtooth', 0.2, 110 - i * 14, i * 0.2);
        break;
      case 'buried':
        this.noiseBurst(1.6, 0.5, 380, 'lowpass');
        break;
      case 'burn':
        this.noiseBurst(0.45, 0.2, 3000, 'highpass');
        break;
      case 'click':
        this.tone(760, 0.035, 'sine', 0.06);
        break;
      case 'secret':
        this.arpeggio([1047, 1319, 1568, 2093], 0.08, 'sine', 0.08);
        break;
      case 'ignite':
        this.noiseBurst(0.22, 0.12, 1800, 'bandpass', 600);
        break;
      case 'gate':
        this.tone(1175, 0.09, 'triangle', 0.07, 1400);
        break;
      case 'unlock':
        this.arpeggio([523, 784, 1047, 1568], 0.12, 'triangle', 0.12);
        break;
    }
  }

  private step(vol: number) {
    this.tone(68, 0.14, 'sine', vol, 45);
    this.noiseBurst(0.08, vol * 0.6, 220, 'lowpass');
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private arpeggio(freqs: number[], each: number, type: OscillatorType, vol: number) {
    freqs.forEach((f, i) => this.tone(f, each * 1.6, type, vol, undefined, i * each));
  }

  private noiseBurst(dur: number, vol: number, freq: number, type: BiquadFilterType, sweepTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
