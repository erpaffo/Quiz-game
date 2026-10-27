// Menù del Pack: griglia dei giochi divisa per categoria e sottomenù di ogni gioco (spiegazione, durata, regole).
// Lo usano sia la TV sia il telefono del capo stanza, così i due non possono andare fuori sincrono.
// Qui nasce solo l'HTML e la lettura dei click: la rete (MENU_NAV / SET_SETTINGS) la fa chi chiama.

import {
  clampRounds,
  isShowId,
  optionFor,
  roundsFor,
  SHOW_CATEGORIES,
  SHOW_IDS,
  SHOWS,
  type MenuView,
  type ShowCategory,
  type ShowId,
  type ShowMeta
} from '../../shared/shows';
import type { LobbySettings, RoomSnapshot } from '../../shared/types';
import { esc } from './net';

/** Gioco evidenziato nel menù (quello che parte con «Avvia»). */
export function menuFocus(s: RoomSnapshot): ShowId {
  if (s.menu?.focus && isShowId(s.menu.focus)) return s.menu.focus;
  const fromSettings = s.phaseData.phase === 'LOBBY' ? s.phaseData.settings.showId : undefined;
  return fromSettings && isShowId(fromSettings) ? fromSettings : 'quiz';
}

export function menuView(s: RoomSnapshot): MenuView {
  return s.menu?.view ?? 'cover';
}

const lobbySettings = (s: RoomSnapshot): LobbySettings | null => (s.phaseData.phase === 'LOBBY' ? s.phaseData.settings : null);

/** Perché il gioco non può partire adesso (stringa vuota = può partire). */
export function startProblem(s: RoomSnapshot, id: ShowId): string {
  const meta = SHOWS[id];
  const online = s.players.filter((p) => p.connected);
  if (!meta.available) return 'Questo gioco è in arrivo.';
  if (online.length < meta.minPlayers) return `Servono almeno ${meta.minPlayers} giocatori (puoi aggiungere dei bot).`;
  if (online.length > meta.maxPlayers) return `Al massimo ${meta.maxPlayers} giocatori: «${meta.name}» non parte con ${online.length}.`;
  if (!online.every((p) => p.ready && p.characterId)) return 'In attesa che tutti premano «Pronto!»…';
  return '';
}

/** Avviso breve sulla cartuccia quando il numero di giocatori non va bene (altrimenti stringa vuota). */
function playersWarning(online: number, meta: ShowMeta): string {
  if (online < meta.minPlayers) return `Servono ${meta.minPlayers}+`;
  if (online > meta.maxPlayers) return `Max ${meta.maxPlayers}`;
  return '';
}

export interface PackMenuOptions {
  /** TV o capo stanza: può navigare e cambiare le regole. Gli altri vedono solo. */
  canControl: boolean;
  /** Schermo grande (TV): più dettagli per cartuccia. */
  tv?: boolean;
}

function categoriesInUse(): { id: ShowCategory; ids: ShowId[] }[] {
  const order = Object.keys(SHOW_CATEGORIES) as ShowCategory[];
  return order
    .map((id) => ({ id, ids: SHOW_IDS.filter((g) => SHOWS[g].category === id) }))
    .filter((c) => c.ids.length > 0);
}

/** Tutti i giochi, raggruppati per categoria. Un tocco su una cartuccia apre il suo sottomenù. */
export function packGrid(s: RoomSnapshot, o: PackMenuOptions): string {
  const online = s.players.filter((p) => p.connected).length;
  const focus = menuFocus(s);
  const card = (id: ShowId) => {
    const m = SHOWS[id];
    const warn = m.available ? playersWarning(online, m) : 'In arrivo';
    return `
      <button class="pk-card ${focus === id ? 'on' : ''} ${m.available ? '' : 'soon'}" data-pk-open="${id}" style="--sc:${m.color}" ${o.canControl ? '' : 'disabled'}>
        <span class="pk-icon">${m.icon}</span>
        <span class="pk-body">
          <b>${esc(m.name)}</b>
          ${o.tv ? `<span class="pk-sub">${esc(m.subtitle)}</span>` : ''}
          <span class="pk-tags"><i>👥 ${m.minPlayers}–${m.maxPlayers}</i><i>⏱️ ${esc(m.durationLabel)}</i>${warn ? `<i class="pk-warn">${esc(warn)}</i>` : ''}</span>
        </span>
      </button>`;
  };
  return `
    <div class="pk pk-grid ${o.tv ? 'pk-tv' : ''}">
      ${categoriesInUse()
        .map((c) => {
          const cat = SHOW_CATEGORIES[c.id];
          return `
          <section class="pk-cat" style="--n:${Math.min(c.ids.length, 4)}">
            <h3><span>${cat.icon}</span> ${esc(cat.label)} <small>${c.ids.length} ${c.ids.length === 1 ? 'gioco' : 'giochi'}</small></h3>
            <div class="pk-cards">${c.ids.map(card).join('')}</div>
          </section>`;
        })
        .join('')}
    </div>`;
}

/**
 * Sottomenù di un gioco: come si gioca, durata (round) e regole. `extra` = impostazioni in più
 * (la TV le usa per il quiz: modalità, giochi della ruota, pacchetti di domande).
 */
export function packDetail(s: RoomSnapshot, o: PackMenuOptions & { extra?: string }): string {
  const id = menuFocus(s);
  const m = SHOWS[id];
  const st = lobbySettings(s);
  const cat = SHOW_CATEGORIES[m.category];
  const dis = o.canControl ? '' : 'disabled';
  const problem = startProblem(s, id);
  const online = s.players.filter((p) => p.connected).length;

  const cur = roundsFor(st, id);
  const quizSequence = id === 'quiz' && st?.mode === 'sequence';
  const rounds = quizSequence
    ? `<div class="pk-row"><div class="pk-row-label"><b>🔁 Durata</b><small>Con la scaletta si gioca esattamente la lista scelta.</small></div></div>`
    : `<div class="pk-row">
         <div class="pk-row-label"><b>🔁 ${esc(m.rounds.label)}</b><small>Da ${m.rounds.min} a ${m.rounds.max} · predefinito ${m.rounds.default}</small></div>
         <div class="pk-stepper">
           <button data-pk-rounds="-1" aria-label="Meno" ${dis} ${cur <= m.rounds.min ? 'disabled' : ''}>−</button>
           <b>${cur}</b>
           <button data-pk-rounds="1" aria-label="Più" ${dis} ${cur >= m.rounds.max ? 'disabled' : ''}>+</button>
         </div>
       </div>`;

  const options = m.options
    .map((opt) => {
      const chosen = optionFor(st, id, opt.id);
      return `
      <div class="pk-row pk-opt">
        <div class="pk-row-label"><b>${esc(opt.label)}</b><small>${esc(opt.hint)}</small></div>
        <div class="pk-seg">${opt.choices
          .map((c) => `<button class="${c.id === chosen ? 'on' : ''}" data-pk-opt="${opt.id}" data-pk-choice="${c.id}" ${dis}>${esc(c.label)}</button>`)
          .join('')}</div>
      </div>`;
    })
    .join('');

  return `
    <div class="pk pk-detail ${o.tv ? 'pk-tv' : ''}" style="--sc:${m.color}">
      <div class="pk-detail-head">
        ${o.canControl ? '<button class="pk-back" data-pk-back>◀ Tutti i giochi</button>' : ''}
        <span class="pk-big">${m.icon}</span>
        <div class="pk-title">
          <span class="pk-badge">${esc(m.badge)} · ${cat.icon} ${esc(cat.label)}</span>
          <h2>${esc(m.name)}</h2>
          <p class="muted">${esc(m.subtitle)}</p>
          <div class="pk-tags"><i>👥 ${esc(m.playersLabel)}</i><i>⏱️ ${esc(m.durationLabel)}</i><i>🎮 ora in sala: ${online}</i></div>
        </div>
      </div>
      <div class="pk-cols">
        <section class="pk-panel">
          <h4>📖 Come si gioca</h4>
          <ol class="pk-rules">${m.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
          <ul class="pk-highlights">${m.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        </section>
        <section class="pk-panel">
          <h4>⚙️ Durata e regole</h4>
          ${rounds}
          ${options}
          ${o.extra ?? ''}
          ${o.canControl ? '' : '<p class="muted small">Le regole le sceglie il capo stanza 👑.</p>'}
        </section>
      </div>
      <div class="pk-start">
        <span class="pk-hint ${problem ? 'bad' : 'good'}">${problem ? esc(problem) : '✅ Tutti pronti! Si può partire.'}</span>
        ${o.canControl ? `<button class="btn pk-go" data-act="start" ${problem ? 'disabled' : ''}>▶ Avvia ${esc(m.name)}</button>` : ''}
      </div>
    </div>`;
}

export interface PackMenuApi {
  nav(nav: { view?: MenuView; focus?: ShowId }): void;
  set(settings: Partial<LobbySettings>): void;
}

/** Interpreta un click sul menù. Restituisce true se l'ha gestito (così il chiamante non lo elabora ancora). */
export function handlePackClick(target: HTMLElement, s: RoomSnapshot, api: PackMenuApi): boolean {
  const st = lobbySettings(s);
  if (!st) return false;

  const view = target.closest<HTMLElement>('[data-pk-view]')?.dataset.pkView;
  if (view === 'cover' || view === 'grid') {
    api.nav({ view });
    return true;
  }
  const open = target.closest<HTMLElement>('[data-pk-open]')?.dataset.pkOpen;
  if (open && isShowId(open)) {
    api.nav({ view: 'detail', focus: open });
    return true;
  }
  if (target.closest('[data-pk-back]')) {
    api.nav({ view: 'grid' });
    return true;
  }
  const id = menuFocus(s);
  const delta = target.closest<HTMLElement>('[data-pk-rounds]')?.dataset.pkRounds;
  if (delta) {
    const next = clampRounds(id, roundsFor(st, id) + Number(delta));
    if (next !== null) api.set({ rounds: { ...(st.rounds ?? {}), [id]: next } });
    return true;
  }
  const opt = target.closest<HTMLElement>('[data-pk-opt]');
  if (opt?.dataset.pkOpt && opt.dataset.pkChoice) {
    api.set({ options: { [id]: { [opt.dataset.pkOpt]: opt.dataset.pkChoice } } });
    return true;
  }
  return false;
}

/** Numero di giochi per categoria: serve alla copertina della TV. */
export function categorySummary(): { icon: string; label: string; count: number }[] {
  return categoriesInUse().map((c) => ({ ...SHOW_CATEGORIES[c.id], count: c.ids.length }));
}
