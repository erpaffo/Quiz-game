import type { PowerType } from '../../shared/types';

// Effetti sonori sintetizzati al volo con WebAudio: nessun file audio da scaricare.
// Il browser sblocca l'audio solo dopo un gesto dell'utente: chiamare unlock() su un click.

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slide?: number } = {}) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.at ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, opts: { freq?: number; type?: BiquadFilterType; gain?: number; at?: number } = {}) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.at ?? 0);
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.type ?? 'lowpass';
    filter.frequency.value = opts.freq ?? 1200;
    const g = this.ctx.createGain();
    g.gain.value = opts.gain ?? 0.4;
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  tick() {
    this.tone(1200, 0.05, { type: 'sine', gain: 0.15 });
  }
  private lastPop = 0;
  pop() {
    // Con tanti giocatori le risposte arrivano a raffica: un solo "pop" ogni 120 ms.
    const now = performance.now();
    if (now - this.lastPop < 120) return;
    this.lastPop = now;
    this.tone(500, 0.12, { type: 'sine', gain: 0.25, slide: 1100 });
  }
  join() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, { type: 'triangle', at: i * 0.07, gain: 0.2 }));
  }
  whoosh() {
    this.noise(0.5, { freq: 2500, type: 'bandpass', gain: 0.25 });
  }
  hit(type: PowerType) {
    switch (type) {
      case 'ICE':
        this.noise(0.35, { freq: 5000, type: 'highpass', gain: 0.35 });
        [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', at: i * 0.05, gain: 0.08 }));
        break;
      case 'GOO':
        this.tone(220, 0.4, { type: 'sine', slide: 70, gain: 0.35 });
        this.tone(160, 0.3, { type: 'triangle', at: 0.08, slide: 60, gain: 0.25 });
        break;
      case 'BOMB':
        this.noise(0.7, { freq: 400, gain: 0.7 });
        this.tone(90, 0.5, { type: 'sine', slide: 40, gain: 0.4 });
        break;
      case 'LOCK':
        this.tone(1800, 0.08, { type: 'square', gain: 0.12 });
        this.tone(1400, 0.12, { type: 'square', at: 0.09, gain: 0.12 });
        break;
    }
  }
  correct() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', at: i * 0.08, gain: 0.22 }));
  }
  wrong() {
    this.tone(180, 0.5, { type: 'sawtooth', gain: 0.15, slide: 110 });
  }
  reveal() {
    for (let i = 0; i < 10; i++) this.noise(0.06, { freq: 900, at: i * 0.06, gain: 0.25 - i * 0.015 });
  }
  coin() {
    [1319, 1760].forEach((f, i) => this.tone(f, 0.12, { type: 'square', at: i * 0.07, gain: 0.1 }));
  }
  shield() {
    this.tone(660, 0.25, { type: 'triangle', gain: 0.2, slide: 990 });
    this.noise(0.15, { freq: 6000, type: 'highpass', gain: 0.15 });
  }
  boom() {
    this.noise(1.2, { freq: 300, gain: 0.9 });
    this.tone(70, 0.9, { type: 'sine', slide: 30, gain: 0.5 });
  }
  spin(steps = 16) {
    for (let i = 0; i < steps; i++) this.tone(900, 0.03, { type: 'square', at: (i / steps) ** 2 * 3.1, gain: 0.08 });
  }
  whoosh2() {
    this.tone(300, 0.3, { type: 'sine', slide: 900, gain: 0.15 });
  }
  fanfare() {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    const times = [0, 0.15, 0.3, 0.45, 0.75, 0.95, 1.1, 1.3];
    notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 0.9 : 0.18, { type: 'square', at: times[i], gain: 0.15 }));
    notes.forEach((f, i) => this.tone(f / 2, 0.2, { type: 'triangle', at: times[i], gain: 0.15 }));
  }
}

export const sfx = new Sfx();
