/**
 * Synthesized sound system — no audio files, everything is generated with
 * the Web Audio API. Muted by default; the preference persists locally.
 */
const STORAGE_KEY = 'voxel-seoul-audio';

export class AudioManager {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { gain: GainNode; stop: () => void } | null = null;
  private stepAccumulator = 0;
  private changeCbs: ((enabled: boolean) => void)[] = [];

  constructor() {
    this.enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  }

  onChange(cb: (enabled: boolean) => void): void {
    this.changeCbs.push(cb);
  }

  /** Must be called from a user gesture at least once. */
  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    if (on) {
      this.ensureContext();
      this.startAmbience();
      this.blip(660, 0.06);
    } else {
      this.stopAmbience();
      void this.ctx?.suspend();
    }
    for (const cb of this.changeCbs) cb(on);
  }

  /** Soft looping city hum: filtered noise + a slow swell. */
  startAmbience(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master || this.ambience) return;

    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(gain.gain);

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.ambience = {
      gain,
      stop: () => {
        try {
          src.stop();
          lfo.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }

  /** Little "boing" ticks while the poro runs; called each frame. */
  updateMovement(speedRatio: number, dt: number, grounded: boolean): void {
    if (!this.enabled || !this.ctx || speedRatio < 0.1 || !grounded) return;
    this.stepAccumulator += dt * (2 + speedRatio * 6);
    if (this.stepAccumulator >= 1) {
      this.stepAccumulator = 0;
      this.pluck(180 + Math.random() * 60, 0.05, 0.03);
    }
  }

  uiBlip(): void {
    this.blip(880, 0.05);
  }

  enterBuilding(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [392, 523, 659].forEach((f, i) => setTimeout(() => this.pluck(f, 0.18, 0.09), i * 90));
  }

  closeBuilding(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [659, 523, 392].forEach((f, i) => setTimeout(() => this.pluck(f, 0.14, 0.07), i * 70));
  }

  districtChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [523, 784].forEach((f, i) => setTimeout(() => this.pluck(f, 0.22, 0.05), i * 130));
  }

  private blip(freq: number, dur: number): void {
    this.pluck(freq, dur, 0.06);
  }

  private pluck(freq: number, dur: number, vol: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }
}
