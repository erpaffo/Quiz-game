// App «Party Tascabile»: 8 giochi da fare passandosi un solo telefono, 100% offline.
// Schermate: home (tavolo + giochi per categoria) → sottomenù del gioco → partita → riepilogo · Coppa · Installa.

import '@fontsource-variable/bricolage-grotesque/wght.css';
import '../common/base.css';
import './pass.css';
import { createSfx } from './audio';
import { isPassGameId, PASS_CATEGORIES, PASS_GAME_IDS, PASS_GAMES, passStartProblem } from './catalog';
import { bomba } from './games/bomba';
import { catena } from './games/catena';
import { duello } from './games/duello';
import { fronte } from './games/fronte';
import { impostore } from './games/impostore';
import { onda } from './games/onda';
import { panico } from './games/panico';
import { tribunale } from './games/tribunale';
import { browserStore, MAX_PLAYERS, NAME_MAX, PassStore } from './store';
import type { PassCategory, PassGame, PassGameId } from './types';
import { ask, esc, tag } from './ui';

const GAMES: Record<PassGameId, PassGame> = { fronte, bomba, impostore, panico, onda, tribunale, catena, duello };

const app = document.getElementById('app')!;
const kv = browserStore();
const store = new PassStore(kv);
const sfx = createSfx();

type View = 'home' | 'detail' | 'play' | 'summary' | 'cup' | 'install';
const state: {
  view: View;
  filter: PassCategory | 'all';
  game: PassGameId;
  summary: { title: string; html?: string; points: Record<string, number> } | null;
  offlineReady: boolean;
  update: ServiceWorker | null;
  error: string;
} = { view: 'home', filter: 'all', game: 'fronte', summary: null, offlineReady: false, update: null, error: '' };

let stopGame: (() => void) | null = null;

// ------------------------------------------------------------------ preferenze e ambiente

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function pref(key: string, fallback: string) {
  try {
    return kv.getItem(`sep:pass:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function setPref(key: string, value: string) {
  try {
    kv.setItem(`sep:pass:${key}`, value);
  } catch {
    /* niente */
  }
}
sfx.muted = pref('muted', '0') === '1';

// Schermo sempre acceso durante le partite (se il telefono lo permette: iOS 16.4+ in https).
let wake: { release(): Promise<void> } | null = null;
let wantAwake = false;
async function keepAwake(on: boolean) {
  wantAwake = on;
  try {
    const wl = (navigator as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (on && wl && !wake) wake = await wl.request('screen');
    if (!on && wake) {
      await wake.release();
      wake = null;
    }
  } catch {
    wake = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantAwake) {
    wake = null;
    void keepAwake(true);
  }
});

// L'audio su iPhone si sblocca solo dopo un tocco.
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ------------------------------------------------------------------ offline (service worker)

function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const watch = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          // c'è già una versione attiva: quella nuova aspetta il permesso per non interrompere una partita
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            state.update = w;
            if (state.view !== 'play') render();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) state.update = reg.waiting;
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
    })
    .catch(() => {});
  navigator.serviceWorker.ready.then(() => {
    state.offlineReady = true;
    if (state.view === 'home' || state.view === 'install') render();
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !state.update) return;
    reloaded = true;
    location.reload();
  });
  // Chiede al browser di non cancellare i dati dell'app quando manca spazio.
  void navigator.storage?.persist?.().catch(() => false);
}

function offlineBadge() {
  if (state.offlineReady) return '<span class="pp-badge ok" title="Funziona anche senza internet">✅ Offline</span>';
  if (!window.isSecureContext) return '<button class="pp-badge warn" data-act="install">⚠️ Solo online</button>';
  return '<span class="pp-badge">⏳ Preparo l’offline…</span>';
}

// ------------------------------------------------------------------ schermate

function render() {
  app.onclick = null;
  app.onsubmit = null;
  switch (state.view) {
    case 'home':
      return home();
    case 'detail':
      return detail();
    case 'summary':
      return summary();
    case 'cup':
      return cup();
    case 'install':
      return install();
    case 'play':
      return;
  }
}

function go(view: View) {
  state.view = view;
  state.error = '';
  render();
  window.scrollTo(0, 0);
}

function bind(acts: Record<string, (el: HTMLElement) => void>) {
  // azioni dell'intestazione valide in ogni schermata
  const all: Record<string, (el: HTMLElement) => void> = { update: applyUpdate, install: () => go('install'), ...acts };
  app.onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    all[el.dataset.act!]?.(el);
  };
}

function header(extra = '') {
  return `
    <header class="pp-header">
      <div class="pp-logo">Party <span>Tascabile</span></div>
      <div class="pp-header-tools">${offlineBadge()}${extra}</div>
    </header>
    ${state.update ? '<button class="pp-update" data-act="update">🔄 Nuova versione pronta: tocca per aggiornare</button>' : ''}`;
}

function home() {
  const players = store.players();
  const atTable = new Set(players.map((p) => p.name.toLowerCase()));
  const suggestions = store.history().filter((n) => !atTable.has(n.toLowerCase())).slice(0, 10);
  const cats = (Object.keys(PASS_CATEGORIES) as PassCategory[]).filter((c) => PASS_GAME_IDS.some((id) => PASS_GAMES[id].category === c));
  const ids = PASS_GAME_IDS.filter((id) => state.filter === 'all' || PASS_GAMES[id].category === state.filter);
  const showTip = !isStandalone() && pref('tip', '1') === '1';

  app.innerHTML = `
    ${header(`<button class="pp-icon-btn" data-act="cup" aria-label="Coppa del Tavolo">🏆</button><button class="pp-icon-btn" data-act="sound" aria-label="Audio">${sfx.muted ? '🔇' : '🔊'}</button>`)}
    ${showTip ? `<div class="pp-tip">📲 <b>Installala sul telefono</b>: ${isIOS() ? 'in Safari tocca <b>Condividi</b> ⬆️ e poi <b>«Aggiungi alla schermata Home»</b>.' : 'dal menù del browser scegli <b>«Installa app»</b> o <b>«Aggiungi a schermata Home»</b>.'} <button data-act="install">Come funziona</button><button data-act="hidetip" aria-label="Chiudi">✕</button></div>` : ''}
    <section class="pp-table">
      <div class="pp-row space"><h2>👥 Il Tavolo <small>${players.length}/${MAX_PLAYERS}</small></h2>${players.length > 1 ? '<button class="pp-btn ghost small" data-act="shuffle">🔀 Mescola giro</button>' : ''}</div>
      <div class="pp-chips">${players.map((p) => `<span class="pp-chip" style="--pc:${p.color}">${esc(p.name)}<button data-act="remove" data-id="${p.id}" aria-label="Togli ${esc(p.name)}">✕</button></span>`).join('') || '<span class="pp-muted">Aggiungi gli amici che giocano: l’ordine è il giro del tavolo.</span>'}</div>
      <form class="pp-add" data-form="add"><input name="name" maxlength="${NAME_MAX}" placeholder="+ Nome" autocomplete="off" enterkeyhint="done"><button class="pp-btn small" type="submit">Aggiungi</button></form>
      ${state.error ? `<div class="pp-error">${esc(state.error)}</div>` : ''}
      ${suggestions.length ? `<div class="pp-suggest">${suggestions.map((n) => `<button data-act="suggest" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
    </section>
    <nav class="pp-filters">
      <button class="${state.filter === 'all' ? 'on' : ''}" data-act="filter" data-f="all">Tutti (${PASS_GAME_IDS.length})</button>
      ${cats.map((c) => `<button class="${state.filter === c ? 'on' : ''}" data-act="filter" data-f="${c}">${PASS_CATEGORIES[c].icon} ${esc(PASS_CATEGORIES[c].label)}</button>`).join('')}
    </nav>
    <section class="pp-games">${ids
      .map((id) => {
        const g = PASS_GAMES[id];
        const problem = passStartProblem(id, players.length);
        return `<button class="pp-game" data-act="open" data-id="${id}" style="--gc:${g.color}">
          <span class="pp-game-icon">${g.icon}</span>
          <span class="pp-game-body"><b>${esc(g.name)}</b><span>${esc(g.subtitle)}</span>
            <span class="pp-game-tags"><i>${esc(g.posture)}</i><i>👥 ${g.minPlayers}–${g.maxPlayers}</i><i>⏱️ ${esc(g.duration)}</i>${problem ? `<i class="warn">servono ${g.minPlayers}+</i>` : ''}</span></span>
        </button>`;
      })
      .join('')}</section>
    <footer class="pp-footer"><a href="../index.html">← Giochi da salotto (TV)</a></footer>`;

  const form = app.querySelector<HTMLFormElement>('[data-form="add"]')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.elements.namedItem('name') as HTMLInputElement;
    const err = store.addPlayer(input.value);
    state.error = err ?? '';
    render();
    if (!err) app.querySelector<HTMLInputElement>('[data-form="add"] input')?.focus();
  });
  bind({
    remove: (el) => {
      store.removePlayer(el.dataset.id!);
      render();
    },
    suggest: (el) => {
      state.error = store.addPlayer(el.dataset.name!) ?? '';
      render();
    },
    shuffle: () => {
      store.shufflePlayers();
      render();
    },
    filter: (el) => {
      state.filter = el.dataset.f as PassCategory | 'all';
      render();
    },
    open: (el) => {
      if (isPassGameId(el.dataset.id)) {
        state.game = el.dataset.id;
        go('detail');
      }
    },
    cup: () => go('cup'),
    install: () => go('install'),
    hidetip: () => {
      setPref('tip', '0');
      render();
    },
    sound: () => {
      sfx.muted = !sfx.muted;
      setPref('muted', sfx.muted ? '1' : '0');
      render();
    },
    update: applyUpdate
  });
}

function detail() {
  const g = PASS_GAMES[state.game];
  const players = store.players();
  const opts = store.options(state.game);
  const problem = passStartProblem(state.game, players.length);
  const cat = PASS_CATEGORIES[g.category];
  app.innerHTML = `
    ${header()}
    <button class="pp-back" data-act="back">◀ Tutti i giochi</button>
    <section class="pp-detail" style="--gc:${g.color}">
      <div class="pp-detail-head">
        <span class="pp-game-icon big">${g.icon}</span>
        <div><span class="pp-cat">${cat.icon} ${esc(cat.label)}</span><h1>${esc(g.name)}</h1><p class="pp-muted">${esc(g.subtitle)}</p></div>
      </div>
      <div class="pp-game-tags"><i>${esc(g.posture)}</i><i>👥 ${g.minPlayers}–${g.maxPlayers}</i><i>⏱️ ${esc(g.duration)}</i></div>
      <div class="pp-panel"><h3>📖 Come si gioca</h3><ol class="pp-rules">${g.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div>
      <div class="pp-panel"><h3>⚙️ Regole e durata</h3>
        ${g.options
          .map(
            (o) => `<div class="pp-opt"><div><b>${esc(o.label)}</b><small>${esc(o.hint)}</small></div>
              <div class="pp-seg">${o.choices.map((c) => `<button class="${opts[o.id] === c.id ? 'on' : ''}" data-act="opt" data-o="${o.id}" data-c="${c.id}">${esc(c.label)}</button>`).join('')}</div></div>`
          )
          .join('')}
      </div>
      <div class="pp-start">
        <div class="${problem ? 'pp-error' : 'pp-ok'}">${problem ? esc(problem) : `✅ ${players.length} giocatori al tavolo: pronti!`}</div>
        <button class="pp-btn huge" data-act="start" ${problem ? 'disabled' : ''}>▶ INIZIA IL GIRO</button>
        ${problem ? '<button class="pp-btn ghost" data-act="back">👥 Aggiungi giocatori</button>' : ''}
      </div>
    </section>`;
  bind({
    back: () => go('home'),
    opt: (el) => {
      store.setOption(state.game, el.dataset.o!, el.dataset.c!);
      render();
    },
    start: () => startGame(state.game),
    update: applyUpdate
  });
}

function startGame(id: PassGameId) {
  const players = store.players();
  if (passStartProblem(id, players.length)) return go('detail');
  state.game = id;
  state.view = 'play';
  const g = PASS_GAMES[id];
  const session: Record<string, number> = {};
  app.onclick = null;
  app.innerHTML = `
    <div class="pp-play" style="--gc:${g.color}">
      <div class="pp-play-bar"><button class="pp-icon-btn" data-quit aria-label="Esci">✕</button><span>${g.icon} ${esc(g.name)}</span><span></span></div>
      <main class="pp-game-root" data-root></main>
    </div>`;
  const root = app.querySelector<HTMLElement>('[data-root]')!;
  let ended = false;
  const end = (summary?: { title: string; html?: string }) => {
    if (ended) return;
    ended = true;
    stopGame?.();
    stopGame = null;
    void keepAwake(false);
    state.summary = { title: summary?.title ?? `${g.icon} ${g.name}`, html: summary?.html, points: session };
    go('summary');
  };
  app.querySelector('[data-quit]')!.addEventListener('click', async () => {
    if (await ask('Uscire dalla partita? I punti già presi restano nella Coppa.', 'Esci', 'Continua')) {
      ended = true;
      stopGame?.();
      stopGame = null;
      void keepAwake(false);
      go('home');
    }
  });
  try {
    stopGame = GAMES[id]({
      root,
      meta: g,
      players,
      options: store.options(id),
      sfx,
      addPoints: (pid, n) => {
        session[pid] = (session[pid] ?? 0) + n;
        store.addPoints(pid, n);
      },
      exit: end,
      keepAwake: (on) => void keepAwake(on)
    });
  } catch (err) {
    console.error(err);
    end({ title: '😵 Qualcosa è andato storto', html: `<p>${esc(err instanceof Error ? err.message : String(err))}</p>` });
  }
}

function standingsHtml(limit = 99) {
  const rows = store.standings().slice(0, limit);
  if (!rows.length) return '<p class="pp-muted">Nessun giocatore al tavolo.</p>';
  const medal = ['🥇', '🥈', '🥉'];
  return `<ol class="pp-standings">${rows.map((r, i) => `<li><span>${medal[i] ?? `${i + 1}.`}</span>${tag(r.player)}<b>${r.points}</b></li>`).join('')}</ol>`;
}

function summary() {
  const s = state.summary;
  const g = PASS_GAMES[state.game];
  app.innerHTML = `
    ${header()}
    <section class="pp-summary">
      <h1>${esc(s?.title ?? 'Fine partita')}</h1>
      ${s?.html ?? ''}
      <div class="pp-panel"><h3>🏆 Coppa del Tavolo</h3>${standingsHtml(5)}</div>
      <div class="pp-row"><button class="pp-btn big" data-act="again">🔁 Rigioca ${esc(g.name)}</button></div>
      <button class="pp-btn ghost" data-act="home">🏠 Menù</button>
    </section>`;
  celebrate();
  bind({ again: () => startGame(state.game), home: () => go('home'), update: applyUpdate });
}

let lastFanfare = 0;
/** Fanfara di fine partita (una sola volta anche se la schermata si ridisegna). */
function celebrate() {
  if (Date.now() - lastFanfare > 2000) sfx.fanfare();
  lastFanfare = Date.now();
}

function cup() {
  app.innerHTML = `
    ${header()}
    <button class="pp-back" data-act="home">◀ Menù</button>
    <section class="pp-summary">
      <h1>🏆 Coppa del Tavolo</h1>
      <p class="pp-muted">I punti di tutti i giochi della serata si sommano qui.</p>
      ${standingsHtml()}
      <button class="pp-btn ghost" data-act="reset">🔄 Nuova serata (azzera i punti)</button>
    </section>`;
  bind({
    home: () => go('home'),
    reset: async () => {
      if (await ask('Azzerare la Coppa del Tavolo per una nuova serata? I giocatori restano.', 'Azzera', 'Annulla')) {
        store.resetScores();
        render();
      }
    },
    update: applyUpdate
  });
}

function install() {
  const secure = window.isSecureContext;
  app.innerHTML = `
    ${header()}
    <button class="pp-back" data-act="home">◀ Menù</button>
    <section class="pp-summary">
      <h1>📲 Installa e gioca offline</h1>
      <div class="pp-panel"><h3>Stato</h3>
        <ul class="pp-list">
          <li>${isStandalone() ? '✅ Aperta come app installata' : '➖ Aperta nel browser (non ancora installata)'}</li>
          <li>${state.offlineReady ? '✅ Pronta per giocare senza internet' : secure ? '⏳ Sto salvando i file per l’offline…' : '⚠️ Indirizzo non sicuro (http): l’offline non si attiva'}</li>
        </ul>
      </div>
      <div class="pp-panel"><h3>${isIOS() ? 'iPhone / iPad (Safari)' : 'Android / altri'}</h3>
        <ol class="pp-rules">${
          isIOS()
            ? '<li>Apri questa pagina in <b>Safari</b> (non dentro altre app)</li><li>Tocca <b>Condividi</b> ⬆️ in basso</li><li>Scegli <b>«Aggiungi alla schermata Home»</b> e poi <b>Aggiungi</b></li><li>Apri l’app dall’icona: da ora funziona anche in <b>modalità aereo</b></li>'
            : '<li>Apri questa pagina in <b>Chrome</b></li><li>Menù ⋮ → <b>«Installa app»</b> (o «Aggiungi a schermata Home»)</li><li>Apri l’app dall’icona: funziona anche senza rete</li>'
        }</ol>
      </div>
      ${secure ? '' : '<div class="pp-panel warn"><h3>⚠️ Perché «Solo online»?</h3><p>I telefoni salvano un’app per l’offline solo se è aperta da un indirizzo <b>https://</b>. Pubblica l’app su un indirizzo https (es. GitHub Pages) e installala da lì: vedi <i>docs/APP_TASCABILE.md</i>.</p></div>'}
      <p class="pp-muted">I giocatori, la Coppa e le regole scelte restano salvati sul telefono.</p>
    </section>`;
  bind({ home: () => go('home'), update: applyUpdate });
}

function applyUpdate() {
  if (!state.update) return;
  state.update.postMessage({ type: 'SKIP_WAITING' });
}

registerOffline();
render();
