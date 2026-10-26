// Menù di pausa e impostazioni dello schermo principale (tasto Esc o bottone ⏸️).
// Durante una partita la mette in pausa per tutti; nella sala d'attesa apre solo le impostazioni.
// Schede: Pausa (riprendi, esci dal gioco, esci dall'app) · Audio · Video (risoluzione, schermo, qualità).

import { audio } from './audio';
import { DEFAULT_VIDEO, type VideoSettings } from './stage';

const VIDEO_KEY = 'sep:video';

export function loadVideo(): VideoSettings {
  try {
    const v = JSON.parse(localStorage.getItem(VIDEO_KEY) ?? 'null') as Partial<VideoSettings> | null;
    if (!v || typeof v !== 'object') return { ...DEFAULT_VIDEO };
    return {
      quality: v.quality === 'high' || v.quality === 'low' ? v.quality : 'auto',
      scale: typeof v.scale === 'number' && v.scale >= 0.5 && v.scale <= 1.5 ? v.scale : 1,
      shadows: v.shadows !== false,
      antialias: v.antialias !== false,
      fps: v.fps === 30 || v.fps === 120 || v.fps === 0 ? v.fps : 60
    };
  } catch {
    return { ...DEFAULT_VIDEO };
  }
}

function saveVideo(v: VideoSettings) {
  try {
    localStorage.setItem(VIDEO_KEY, JSON.stringify(v));
  } catch {
    /* non salvato: vale fino alla chiusura */
  }
}

/** Comandi dell'app desktop (Electron), presenti solo lì: vedi desktop/preload.ts. */
interface DesktopInfo {
  fullscreen: boolean;
  size: [number, number];
  displays: { id: number; label: string; current: boolean }[];
}
interface DesktopBridge {
  info(): Promise<DesktopInfo | null>;
  setFullScreen(on: boolean): Promise<DesktopInfo | null>;
  moveToDisplay(id: number): Promise<DesktopInfo | null>;
  setWindowSize(w: number, h: number): Promise<DesktopInfo | null>;
  quit(): Promise<void>;
}
const desktop = (window as unknown as { desktop?: DesktopBridge }).desktop;

const WINDOW_SIZES: [number, number][] = [
  [1280, 720],
  [1600, 900],
  [1920, 1080]
];

type Tab = 'pause' | 'audio' | 'video';

export interface PauseMenuOptions {
  stage: { setVideo(v: VideoSettings): void };
  /** True se c'è una partita in corso (fuori dalla sala d'attesa). */
  inGame(): boolean;
  setPaused(paused: boolean): Promise<string | null>;
  /** Torna al menù dei giochi (fine anticipata della partita). */
  exitGame(): Promise<string | null>;
  onAudioChange(): void;
  toast(text: string): void;
}

export function createPauseMenu(o: PauseMenuOptions) {
  const root = document.createElement('div');
  root.id = 'pause-menu';
  root.hidden = true;
  document.body.appendChild(root);

  let tab: Tab = 'pause';
  let video = loadVideo();
  let info: DesktopInfo | null = null;
  /** Bottone che chiede conferma al secondo click («Sei sicuro?»). */
  let confirming: string | null = null;
  let pausedByMenu = false;

  const isOpen = () => !root.hidden;
  const browserFull = () => !!document.fullscreenElement;

  async function refreshInfo() {
    info = desktop ? await desktop.info().catch(() => null) : null;
    if (isOpen()) render();
  }

  function render() {
    const inGame = o.inGame();
    const tabs = `
      <nav class="pm-tabs">
        <button class="${tab === 'pause' ? 'on' : ''}" data-tab="pause">${inGame ? '⏸️ Pausa' : '🏠 Generale'}</button>
        <button class="${tab === 'audio' ? 'on' : ''}" data-tab="audio">🔊 Audio</button>
        <button class="${tab === 'video' ? 'on' : ''}" data-tab="video">🖥️ Video</button>
      </nav>`;
    root.innerHTML = `
      <div class="pm-box" role="dialog" aria-modal="true" aria-label="Pausa e impostazioni">
        <div class="pm-head"><h2>${inGame ? '⏸️ Partita in pausa' : '⚙️ Impostazioni'}</h2><span class="muted small">Esc per ${inGame ? 'riprendere' : 'chiudere'}</span></div>
        ${tabs}
        <div class="pm-body">${tab === 'pause' ? pausePanel(inGame) : tab === 'audio' ? audioPanel() : videoPanel()}</div>
      </div>`;
  }

  function pausePanel(inGame: boolean) {
    const ask = (id: string, label: string, sure: string) =>
      `<button class="btn ${confirming === id ? 'pink' : 'secondary'} pm-wide" data-act="${id}">${confirming === id ? sure : label}</button>`;
    return `
      <button class="btn pm-wide" data-act="resume">▶ ${inGame ? 'Riprendi la partita' : 'Torna al gioco'}</button>
      ${inGame ? ask('exit-game', '🏠 Esci dalla partita (torna al menù dei giochi)', '⚠️ Sicuro? I punti di questa partita si perdono') : ''}
      ${ask('quit', desktop ? '🚪 Esci dall’applicazione' : '🚪 Chiudi il gioco', '⚠️ Sicuro? Tocca di nuovo per uscire')}
      <p class="muted small">${inGame ? 'In pausa il tempo è fermo per tutti e i telefoni aspettano.' : 'Durante una partita, Esc la mette in pausa per tutti.'}</p>`;
  }

  function audioPanel() {
    const st = audio.settings;
    const slider = (key: 'music' | 'sfx' | 'voice', label: string) =>
      `<label class="pm-row"><span>${label} <b>${Math.round(st[key] * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value="${st[key]}" data-vol="${key}"></label>`;
    return `
      ${slider('music', '🎵 Musica')}
      ${slider('sfx', '💥 Effetti')}
      ${slider('voice', '🎙️ Voce del presentatore')}
      <div class="pm-row-btns">
        <button class="btn secondary" data-act="mute">${st.muted ? '🔊 Riattiva l’audio' : '🔇 Muto (tasto M)'}</button>
        <button class="btn secondary" data-act="audio-reset">↺ Valori predefiniti</button>
      </div>`;
  }

  function videoPanel() {
    const seg = (key: string, options: [string, string][], current: string) =>
      `<div class="seg">${options.map(([v, l]) => `<button class="${current === v ? 'on' : ''}" data-video="${key}" data-value="${v}">${l}</button>`).join('')}</div>`;
    const full = info ? info.fullscreen : browserFull();
    const screenRows = desktop
      ? `
        <div class="pm-row"><span>Modalità</span>${seg('window', [['full', '⛶ Schermo intero'], ['window', '🗗 Finestra']], full ? 'full' : 'window')}</div>
        <div class="pm-row"><span>Dimensione finestra</span>${seg('size', WINDOW_SIZES.map(([w, h]) => [`${w}x${h}`, `${w}×${h}`]), info && !full ? `${info.size[0]}x${info.size[1]}` : '')}</div>
        ${info && info.displays.length > 1 ? `<div class="pm-row"><span>Schermo</span>${seg('display', info.displays.map((d) => [String(d.id), d.label]), String(info.displays.find((d) => d.current)?.id ?? ''))}</div>` : ''}`
      : `<div class="pm-row"><span>Schermo intero</span>${seg('browser-full', [['on', '⛶ Attivo'], ['off', 'Disattivo']], full ? 'on' : 'off')}</div>
         <p class="muted small">Nel browser, per uscire dallo schermo intero tieni premuto Esc per qualche secondo.</p>`;
    return `
      <h3>🖥️ Schermo</h3>
      ${screenRows}
      <h3>🎨 Grafica</h3>
      <div class="pm-row"><span>Qualità di luci e materiali</span>${seg('quality', [['auto', 'Automatica'], ['high', 'Alta'], ['low', 'Bassa']], video.quality)}</div>
      <div class="pm-row"><span>Risoluzione di disegno</span>${seg('scale', [['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']], String(video.scale))}</div>
      <div class="pm-row"><span>Ombre</span>${seg('shadows', [['on', 'Sì'], ['off', 'No']], video.shadows ? 'on' : 'off')}</div>
      <div class="pm-row"><span>Bordi smussati (antialiasing)</span>${seg('antialias', [['on', 'Sì'], ['off', 'No']], video.antialias ? 'on' : 'off')}</div>
      <div class="pm-row"><span>Limite fotogrammi</span>${seg('fps', [['30', '30 fps'], ['60', '60 fps'], ['120', '120 fps'], ['0', 'Nessuno']], String(video.fps))}</div>
      <p class="muted small">Se il gioco va a scatti: qualità bassa, risoluzione 75% e niente ombre.</p>`;
  }

  async function act(name: string) {
    if (name !== confirming && (name === 'exit-game' || name === 'quit')) {
      confirming = name;
      return render();
    }
    confirming = null;
    switch (name) {
      case 'resume':
        return close();
      case 'exit-game': {
        const err = await o.exitGame();
        if (err) o.toast(err);
        pausedByMenu = false;
        return close();
      }
      case 'quit':
        if (desktop) return void desktop.quit();
        window.close(); // funziona solo se la scheda l'ha aperta il gioco
        setTimeout(() => (location.href = './index.html'), 300);
        return;
      case 'mute':
        audio.toggleMute();
        break;
      case 'audio-reset':
        audio.resetVolumes();
        break;
    }
    o.onAudioChange();
    render();
  }

  async function setVideo(key: string, value: string) {
    if (key === 'window' && desktop) info = await desktop.setFullScreen(value === 'full');
    else if (key === 'size' && desktop) {
      const [w, h] = value.split('x').map(Number);
      info = await desktop.setWindowSize(w, h);
    } else if (key === 'display' && desktop) info = await desktop.moveToDisplay(Number(value));
    else if (key === 'browser-full') await toggleBrowserFullscreen(value === 'on');
    else {
      const prevAA = video.antialias;
      video = {
        ...video,
        ...(key === 'quality' ? { quality: value as VideoSettings['quality'] } : {}),
        ...(key === 'scale' ? { scale: Number(value) } : {}),
        ...(key === 'shadows' ? { shadows: value === 'on' } : {}),
        ...(key === 'antialias' ? { antialias: value === 'on' } : {}),
        ...(key === 'fps' ? { fps: Number(value) } : {})
      };
      saveVideo(video);
      o.stage.setVideo(video);
      // l'antialiasing si decide solo all'avvio della grafica: si ricarica lo schermo (la stanza riprende da sola)
      if (video.antialias !== prevAA) {
        o.toast('🔄 Ricarico lo schermo per applicare i bordi smussati…');
        setTimeout(() => location.reload(), 700);
      }
    }
    render();
    if (key === 'window' || key === 'size' || key === 'display') setTimeout(refreshInfo, 400);
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === root) return void close(); // click fuori dal riquadro
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab as Tab;
      confirming = null;
      return render();
    }
    const v = t.closest<HTMLElement>('[data-video]');
    if (v) return void setVideo(v.dataset.video!, v.dataset.value!);
    const a = t.closest<HTMLElement>('[data-act]');
    if (a) void act(a.dataset.act!);
  });
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.vol) return;
    audio.setVolume(el.dataset.vol as 'music' | 'sfx' | 'voice', Number(el.value));
    const label = el.closest('label')?.querySelector('b');
    if (label) label.textContent = `${Math.round(Number(el.value) * 100)}%`;
    o.onAudioChange();
  });

  async function open(start: Tab = 'pause') {
    if (isOpen()) return;
    tab = start;
    confirming = null;
    root.hidden = false;
    render();
    void refreshInfo();
    if (o.inGame()) {
      const err = await o.setPaused(true);
      if (err) o.toast(err);
      else pausedByMenu = true;
    }
  }

  async function close() {
    if (!isOpen()) return;
    root.hidden = true;
    confirming = null;
    if (pausedByMenu) {
      pausedByMenu = false;
      const err = await o.setPaused(false);
      if (err) o.toast(err);
    }
  }

  return {
    open,
    close,
    isOpen,
    toggle: () => (isOpen() ? close() : open()),
    /** Se la partita risulta in pausa (es. dopo aver ricaricato lo schermo) il menù deve essere aperto. */
    syncPaused(paused: boolean) {
      if (paused && !isOpen()) {
        pausedByMenu = true;
        root.hidden = false;
        render();
      }
      if (isOpen()) render();
    }
  };
}

/** Schermo intero nel browser; con il blocco della tastiera Esc arriva al gioco invece di uscire (Chrome/Edge). */
export async function toggleBrowserFullscreen(on: boolean) {
  try {
    if (on && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      await (navigator as unknown as { keyboard?: { lock?(keys: string[]): Promise<void> } }).keyboard?.lock?.(['Escape']);
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* il browser ha rifiutato (es. senza un click dell'utente) */
  }
}
