// Suoni sintetizzati con la Web Audio API: nessun file da scaricare, quindi funzionano anche offline.
// Su iPhone l'audio parte solo dopo un tocco dell'utente: `unlock()` va chiamato al primo tocco.
// Nota: sull'iPhone il tasto silenzioso spegne questi suoni, e la vibrazione da browser non è supportata.

import type { Sfx } from './types';

export interface SfxEngine extends Sfx {
  unlock(): void;
  muted: boolean;
}

export function createSfx(): SfxEngine {
  let ctx: AudioContext | null = null;

  const ac = (): AudioContext | null => {
    if (engine.muted) return null;
    try {
      ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  /** Una nota con attacco e coda brevi. */
  const tone = (freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25, delay = 0, slideTo?: number) => {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  const engine: SfxEngine = {
    muted: false,
    unlock() {
      const a = ac();
      if (!a) return;
      // un suono vuoto «sblocca» l'audio su iOS
      const b = a.createBuffer(1, 1, 22050);
      const s = a.createBufferSource();
      s.buffer = b;
      s.connect(a.destination);
      s.start(0);
    },
    tick() {
      tone(1400, 0.04, 'square', 0.12);
    },
    good() {
      tone(660, 0.12, 'triangle', 0.25);
      tone(990, 0.18, 'triangle', 0.25, 0.08);
    },
    bad() {
      tone(220, 0.25, 'sawtooth', 0.18, 0, 140);
    },
    beep(high = false) {
      tone(high ? 1320 : 880, high ? 0.35 : 0.12, 'sine', 0.3);
    },
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.11));
    },
    boom() {
      const a = ac();
      if (!a) return;
      const len = a.sampleRate * 1.2;
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      const src = a.createBufferSource();
      src.buffer = buf;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, a.currentTime);
      lp.frequency.exponentialRampToValueAtTime(80, a.currentTime + 1.1);
      const g = a.createGain();
      g.gain.value = 0.9;
      src.connect(lp).connect(g).connect(a.destination);
      src.start();
      tone(90, 0.8, 'sine', 0.5, 0, 40);
    },
    vibrate(pattern) {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* non supportata (iPhone): pazienza */
      }
    }
  };
  return engine;
}

/** Versione muta per i test e per chi spegne l'audio. */
export const silentSfx: Sfx = { tick() {}, good() {}, bad() {}, boom() {}, beep() {}, fanfare() {}, vibrate() {} };
