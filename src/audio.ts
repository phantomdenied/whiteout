// Synthesized sound (Web Audio, no files): one-shot effects, a ski hiss that follows your speed, and yeti
// footsteps that quicken as it closes in (GDD §9: every cue also has a visual, so it plays fine muted).
// Browsers only allow audio after a user gesture, so nothing plays until unlock() is called from one.

export type SoundName =
  | 'roar' | 'crash' | 'nearMiss' | 'jump' | 'trick' | 'land' | 'trickLand' | 'bounce' | 'coin' | 'snack'
  | 'finish' | 'eaten' | 'buried' | 'burn' | 'click' | 'secret' | 'unlock' | 'gate' | 'ignite';

const MASTER = 0.6;

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
  muted = false;

  /** Create (or resume) the audio context. Call from a click / tap handler. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      this.ctx = ctx;
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
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.ctx.currentTime, 0.02);
  }

  /** Continuous sounds, once per frame: ski hiss from speed, yeti footsteps from proximity. */
  update(dt: number, playing: boolean, speed: number, airborne: boolean, proximity: number) {
    const ctx = this.ctx;
    if (!ctx || !this.hissGain || !this.hissFilter) return;
    const t = ctx.currentTime;
    const hiss = playing && !airborne ? Math.round(Math.min(0.12, speed / 150) * 200) / 200 : 0;
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
      this.step(0.12 + proximity * 0.3);
    }
  }

  play(name: SoundName) {
    if (!this.ctx || this.muted) return;
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
        this.tone(85, 0.9, 'sawtooth', 0.25, 55);
        for (let i = 0; i < 3; i++) this.noiseBurst(0.12, 0.3, 900, 'lowpass', undefined, 0.35 + i * 0.22);
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
