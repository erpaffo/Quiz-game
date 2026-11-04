// Motore audio dello schermo principale: musiche, effetti e voce del presentatore letti da
// /audio/audio.json (generato da scripts/build-audio.py, modificabile a mano per usare i propri file).
// Se un file manca o non si carica, chi chiama ripiega sui suoni sintetizzati (sfx.ts).

import { fillName, sanitizeName, type VoicePriority } from '../../shared/voice';
import type { VoiceItem } from './voice-queue';
import { defaultVoiceQueue } from './voice-queue';

type Category = 'music' | 'sfx' | 'voice';

interface Manifest {
  volume?: Partial<Record<Category, number>>;
  music: Record<string, string>;
  sfx: Record<string, string[] | string>;
  voice: Record<string, string[] | string>;
}

export interface AudioSettings {
  music: number;
  sfx: number;
  voice: number;
  muted: boolean;
  voiceEnabled?: boolean;
}

const SETTINGS_KEY = 'sep:audio';
const BASE = '/audio/';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: Record<Category | 'clip', GainNode>;
  private duck!: GainNode;
  private manifest: Manifest | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private musicNow: { key: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantedMusic: string | null = null;
  private voiceNow: { stop(): void } | null = null;
  private clipNow: AudioBufferSourceNode | null = null;
  private defaults: Record<Category, number> = { music: 0.35, sfx: 0.8, voice: 1 };
  settings: AudioSettings = { music: 0.35, sfx: 0.8, voice: 1, muted: false, voiceEnabled: true };

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
      if (saved) this.settings = { ...this.settings, ...saved };
    } catch {
      /* impostazioni non disponibili */
    }
  }

  /** Da chiamare su un clic (i browser sbloccano l'audio solo dopo un gesto dell'utente). */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.duck = this.ctx.createGain();
      this.duck.connect(this.master);
      const mk = (dest: AudioNode) => {
        const g = this.ctx!.createGain();
        g.connect(dest);
        return g;
      };
      this.bus = { music: mk(this.duck), sfx: mk(this.master), voice: mk(this.master), clip: mk(this.master) };
      this.applyVolumes();
      void this.loadManifest();
    }
    void this.ctx.resume();
  }

  get ready() {
    return !!this.ctx;
  }

  private async loadManifest() {
    try {
      const res = await fetch(`${BASE}audio.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      this.manifest = await res.json();
      // Il volume indicato nel file vale solo finché l'utente non ne sceglie uno.
      const hasSaved = (() => {
        try {
          return !!localStorage.getItem(SETTINGS_KEY);
        } catch {
          return false;
        }
      })();
      if (this.manifest?.volume) {
        this.defaults = { ...this.defaults, ...this.manifest.volume };
        if (!hasSaved) this.settings = { ...this.settings, ...this.manifest.volume };
        this.applyVolumes();
      }
      // Precarica effetti e voci (piccoli), poi le musiche.
      const lists = [...Object.values(this.manifest!.sfx), ...Object.values(this.manifest!.voice)].flat();
      await Promise.all(lists.map((f) => this.load(f)));
      for (const f of Object.values(this.manifest!.music)) void this.load(f);
      if (this.wantedMusic) this.music(this.wantedMusic);
    } catch (err) {
      console.warn('[audio] audio.json non disponibile: uso i suoni sintetizzati', err);
    }
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const url = file.startsWith('/') || /^https?:/.test(file) ? file : BASE + file;
    if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url)!);
    let p = this.loading.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => this.ctx!.decodeAudioData(data))
        .catch((err) => {
          console.warn(`[audio] ${url} non caricato:`, err);
          return null;
        })
        .then((buf) => {
          this.buffers.set(url, buf);
          return buf;
        });
      this.loading.set(url, p);
    }
    return p;
  }

  private loaded(file: string): AudioBuffer | null {
    const url = file.startsWith('/') || /^https?:/.test(file) ? file : BASE + file;
    return this.buffers.get(url) ?? null;
  }

  private pickFile(cat: 'sfx' | 'voice', key: string): string | null {
    const entry = this.manifest?.[cat]?.[key];
    if (!entry) return null;
    const list = Array.isArray(entry) ? entry : [entry];
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  /** Varianti della battuta: n dal nome file (`-n`), pre/post se c'è {nome}, altrimenti file intero. */
  private pickVoice(key: string) {
    const entry = this.manifest?.voice?.[key];
    const list = !entry ? [] : Array.isArray(entry) ? entry : [entry];
    const byN = new Map<number, { whole?: string; pre?: string; post?: string }>();
    list.forEach((f, i) => {
      const m = /-(\d+)(?:\.(pre|post))?\.\w+$/.exec(f);
      const n = m ? Number(m[1]) - 1 : i;
      const v = byN.get(n) ?? {};
      v[(m?.[2] as 'pre' | 'post' | undefined) ?? 'whole'] = f;
      byN.set(n, v);
    });
    const all = [...byN.entries()];
    if (!all.length) return null;
    const [index, files] = all[Math.floor(Math.random() * all.length)];
    return { index, ...files };
  }

  private start(buf: AudioBuffer, bus: GainNode, opts: { loop?: boolean; gain?: number } = {}) {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    const g = this.ctx!.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g).connect(bus);
    src.start();
    return { src, gain: g };
  }

  /** Effetto sonoro dal file. Restituisce false se non disponibile (il chiamante usa la sintesi). */
  sfx(key: string): boolean {
    if (!this.ctx || this.settings.muted) return !!this.ctx && this.settings.muted;
    const file = this.pickFile('sfx', key);
    const buf = file ? this.loaded(file) : null;
    if (!buf) return false;
    this.start(buf, this.bus.sfx);
    return true;
  }

  /** Battuta del presentatore con coda e anti-doppione (F3.3). */
  say(key: string, cooldownMs = 2500, priority: VoicePriority = 'normal', opts: Pick<VoiceItem, 'text' | 'texts' | 'nome' | 'onStart'> = {}) {
    if (!this.ctx || !this.isVoiceEnabled()) {
      if (opts.text) opts.onStart?.(fillName(opts.text, sanitizeName(opts.nome ?? '')));
      return;
    }
    const queued = defaultVoiceQueue.push({ key, priority, ...opts }, Date.now(), cooldownMs);
    if (!queued) return;
    this.playNextVoice();
  }

  private playNextVoice() {
    if (!this.ctx || !this.isVoiceEnabled()) {
      defaultVoiceQueue.finishCurrent();
      return;
    }
    if (this.voiceNow) return;

    const item = defaultVoiceQueue.next();
    if (!item) return;

    const pick = this.pickVoice(item.key);
    const nome = sanitizeName(item.nome ?? '');
    const raw = item.texts?.[pick?.index ?? 0] ?? item.text;
    // Senza sintesi vocale (o senza nome) si suona pre+post senza il nome in mezzo.
    const speakable = nome && typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices().length > 0;
    const steps: (AudioBuffer | string)[] = [];
    for (const f of pick?.whole ? [pick.whole] : [pick?.pre, speakable ? nome : '', pick?.post]) {
      const b = f && (f === nome ? f : this.loaded(f));
      if (b) steps.push(b);
    }
    if (!steps.length) {
      if (raw) item.onStart?.(fillName(raw, nome));
      defaultVoiceQueue.finishCurrent();
      this.playNextVoice();
      return;
    }

    let cur: AudioBufferSourceNode | null = null;
    const handle = {
      stop: () => {
        try {
          cur?.stop();
          if (cur === null) speechSynthesis.cancel();
        } catch {
          /* già fermato */
        }
      }
    };
    this.voiceNow = handle;

    // La musica si abbassa mentre parla il presentatore (anche durante il nome).
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.35, t, 0.05);

    const run = (i: number) => {
      if (this.voiceNow !== handle) return;
      if (i >= steps.length) {
        this.voiceNow = null;
        defaultVoiceQueue.finishCurrent();
        if (this.ctx) this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.3);
        this.playNextVoice();
        return;
      }
      const s = steps[i];
      if (typeof s === 'string') {
        cur = null;
        const u = new SpeechSynthesisUtterance(s);
        u.lang = 'it-IT';
        u.voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('it')) ?? null;
        u.volume = Math.min(1, this.settings.voice);
        // Se la sintesi non risponde non si blocca la coda.
        let done = false;
        const next = () => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          run(i + 1);
        };
        const guard = setTimeout(next, 4000);
        u.onend = u.onerror = next;
        speechSynthesis.speak(u);
      } else {
        cur = this.start(s, this.bus.voice).src;
        cur.onended = () => run(i + 1);
      }
    };
    run(0);
    if (raw) item.onStart?.(fillName(raw, nome));
  }

  /** Interrompe la voce in corso e svuota la battuta corrente dalla coda. */
  stopVoice() {
    if (this.voiceNow) {
      try {
        this.voiceNow.stop();
      } catch {
        /* già fermato */
      }
      this.voiceNow = null;
    }
    defaultVoiceQueue.finishCurrent();
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setTargetAtTime(1, t, 0.1);
    }
  }

  /** Svuota le battute in attesa nella coda senza fermare la voce in corso (eccetto 'high'). */
  skipPending() {
    defaultVoiceQueue.skipPending();
  }

  /** Indica se la voce del presentatore è abilitata e udibile. */
  isVoiceEnabled(): boolean {
    return this.settings.voiceEnabled !== false && this.settings.voice > 0 && !this.settings.muted;
  }

  /** Interruttore Voce sì/no: azzera o ripristina la voce del presentatore. */
  toggleVoice(): boolean {
    if (this.settings.voiceEnabled === false || this.settings.voice === 0) {
      this.settings.voiceEnabled = true;
      if (this.settings.voice === 0) this.settings.voice = this.defaults.voice ?? 1;
    } else {
      this.settings.voiceEnabled = false;
      this.stopVoice();
    }
    this.save();
    return this.isVoiceEnabled();
  }

  /** Musica di sottofondo in loop, con dissolvenza incrociata. null = silenzio. */
  music(key: string | null) {
    this.wantedMusic = key;
    if (!this.ctx) return;
    if (this.musicNow?.key === key) return;
    const t = this.ctx.currentTime;
    if (this.musicNow) {
      const old = this.musicNow;
      old.gain.gain.setTargetAtTime(0, t, 0.4);
      setTimeout(() => old.src.stop(), 2000);
      this.musicNow = null;
    }
    const file = key ? this.manifest?.music[key] : null;
    if (!key || !file) return;
    const buf = this.loaded(file);
    if (!buf) {
      void this.load(file).then(() => this.wantedMusic === key && this.music(key));
      return;
    }
    const { src, gain } = this.start(buf, this.bus.music, { loop: true, gain: 0 });
    gain.gain.setTargetAtTime(1, t, 0.5);
    this.musicNow = { key, src, gain };
  }

  /** Brano da indovinare: la musica di sottofondo si ferma. Restituisce false se il file non si carica. */
  async clip(url: string): Promise<boolean> {
    if (!this.ctx) return false;
    this.stopClip();
    const buf = await this.load(url);
    if (!buf) return false;
    this.music(null);
    const { src } = this.start(buf, this.bus.clip);
    this.clipNow = src;
    return true;
  }

  stopClip() {
    this.clipNow?.stop();
    this.clipNow = null;
  }

  setVolume(cat: Category, v: number) {
    this.settings[cat] = Math.max(0, Math.min(1, v));
    if (cat === 'voice' && v > 0) {
      this.settings.voiceEnabled = true;
    }
    this.save();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.save();
  }

  resetVolumes() {
    this.settings = { ...this.defaults, muted: false, voiceEnabled: true };
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* non salvato */
    }
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.muted ? 0 : 1;
    this.bus.music.gain.value = s.music;
    this.bus.sfx.gain.value = s.sfx;
    this.bus.voice.gain.value = s.muted || s.voiceEnabled === false ? 0 : s.voice;
    this.bus.clip.gain.value = Math.max(s.music, 0.8);
  }
}

export const audio = new AudioEngine();
