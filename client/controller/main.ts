import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import { brandLogoHtml } from '../../shared/brand';
import { cardDescription, CARDS, isAttack } from '../../shared/cards';
import { CHARACTERS, getCharacter } from '../../shared/characters';
import { CONFIG } from '../../shared/config';
import { GAMES } from '../../shared/games';
import type { CardEvent, CardType, GameAction, GameId, PlayerPublic, PlayState, PowerType, RoomSnapshot } from '../../shared/types';
import '../common/base.css';
import { clock, createSocket, esc, OPTION_COLORS, OPTION_LETTERS, PLAYER_COLORS } from '../common/net';
import { addQuestionSheet } from './addQuestion';
import './controller.css';
import { formatNumber, numericView } from './numeric';
import { preview } from './preview';
import { questionView } from './question';
import { pickSelfie } from './selfie';

interface Session {
  code: string;
  name: string;
  playerId: string;
}

const SESSION_KEY = 'sep:player';
const SELFIE_KEY = 'sep:selfie';
const socket = createSocket();
const app = document.getElementById('app')!;
const head = document.getElementById('head')!;
const timerBar = document.getElementById('c-timer-bar')!;
const conn = document.getElementById('conn')!;
const urlRoom = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase();

let session: Session | null = load<Session>(SESSION_KEY);
let mySelfie: string | null = load<string>(SELFIE_KEY);
let s: RoomSnapshot | null = null;
let joined = false;
let viewKey = '';
let lastPhase = '';
let cleanup: (() => void) | null = null;
let selectTimer = 0;
const local = {
  charIdx: -1,
  skinIdx: 0,
  jokerArmed: false,
  cardPick: null as CardType | null,
  sabotagePick: null as PowerType | null,
  sheet: false,
  lastCategory: 'Domande degli amici',
  endsAt: null as number | null,
  total: 1
};

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
function store(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage non disponibile (navigazione privata): si gioca lo stesso */
  }
}

function toast(text: string, good = false) {
  const el = document.createElement('div');
  el.className = `toast ${good ? 'good' : ''}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ------------------------------------------------------------ connessione

socket.on('connect', () => {
  conn.hidden = true;
  if (session && (!urlRoom || urlRoom === session.code)) void join(session.code, session.name, session.playerId, true);
  else if (!joined) renderJoin();
});
socket.on('disconnect', () => {
  if (joined) conn.hidden = false;
});
socket.on('ROOM_STATE', (snap) => {
  clock.sync(snap.serverNow);
  s = snap;
  render();
});
socket.on('KICKED', () => leave('Sei stato rimosso dalla stanza.'));

async function join(code: string, name: string, playerId?: string, silent = false) {
  const r = await socket.emitWithAck('JOIN_ROOM', { code: code.toUpperCase(), name, playerId });
  if (!r.ok) {
    if (silent) {
      session = null;
      store(SESSION_KEY, null);
    }
    return renderJoin(silent ? '' : r.error);
  }
  joined = true;
  session = { code: code.toUpperCase(), name, playerId: r.playerId };
  store(SESSION_KEY, session);
  if (!r.reconnected) {
    local.charIdx = -1;
    if (mySelfie) void socket.emitWithAck('UPLOAD_SELFIE', { dataUrl: mySelfie });
  }
  void requestWakeLock();
  render(true);
}

function leave(message: string) {
  session = null;
  store(SESSION_KEY, null);
  joined = false;
  s = null;
  renderJoin(message);
}

async function requestWakeLock() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    /* non supportato: pazienza */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && joined) void requestWakeLock();
});

// ------------------------------------------------------------ utilità

function meOf(snap: RoomSnapshot): PlayerPublic | undefined {
  return snap.players.find((p) => p.id === snap.me?.playerId);
}
function nameOf(id: string | null | undefined) {
  return esc(s?.players.find((p) => p.id === id)?.name ?? '???');
}
function colorOf(id: string) {
  const i = s?.players.findIndex((p) => p.id === id) ?? 0;
  return PLAYER_COLORS[Math.max(0, i) % PLAYER_COLORS.length];
}
function canStart(snap: RoomSnapshot) {
  const online = snap.players.filter((p) => p.connected);
  return online.length >= CONFIG.MIN_PLAYERS && online.every((p) => p.ready && p.characterId);
}
function takenCombos(snap: RoomSnapshot, me: PlayerPublic) {
  return new Set(snap.players.filter((p) => p.id !== me.id && p.characterId).map((p) => `${p.characterId}/${p.skinId}`));
}
const pts = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('it-IT')}`;

async function act(p: Promise<{ ok: boolean; error?: string } | { ok: false; error: string }>) {
  const r = await p;
  if (!r.ok && 'error' in r) toast(r.error ?? 'Errore');
  return r.ok;
}
const gameAction = (a: GameAction) => act(socket.emitWithAck('GAME_ACTION', a));

function wait(main: string, sub = '') {
  app.innerHTML = `<div class="view center"><div class="done pop">${main}</div>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;
}

function onClick(handler: (target: HTMLElement) => void) {
  const fn = (e: Event) => handler(e.target as HTMLElement);
  app.addEventListener('click', fn);
  const prev = cleanup;
  cleanup = () => {
    app.removeEventListener('click', fn);
    prev?.();
  };
}

/** Lista degli avversari da toccare (bersaglio di carte, bomba, furto). */
function targetList(title: string, me: PlayerPublic, back?: string) {
  const others = s!.players.filter((o) => o.id !== me.id);
  app.innerHTML = `
    <div class="view">
      <div class="title">${title}</div>
      <div class="target-list ${others.length > 5 ? 'grid' : ''}">${others.map((o) => `
        <button class="target-btn" data-target="${o.id}" style="--pc:${colorOf(o.id)}">
          <b>${esc(o.name)}</b><small>${esc(getCharacter(o.characterId)?.name ?? '')} · ${o.score.toLocaleString('it-IT')} pti · ${o.rank}°${o.defense ? ` · ${CARDS[o.defense].icon}` : ''}</small>
        </button>`).join('')}
      </div>
      ${back ? `<button class="link-btn" data-act="back">${back}</button>` : ''}
    </div>`;
}

// ------------------------------------------------------------ chiavi di vista

function keyOf(snap: RoomSnapshot, p: PlayerPublic): string {
  const d = snap.phaseData;
  const m = snap.me!;
  switch (d.phase) {
    case 'LOBBY':
      if (local.sheet) return 'SHEET';
      return ['L', local.charIdx, local.skinIdx, p.ready, p.hasSelfie, [...takenCombos(snap, p)].join(), p.isVip, canStart(snap), p.characterId, p.skinId].join('|');
    case 'WHEEL':
    case 'GAME_INTRO':
    case 'GAME_RESULT':
      return `${d.phase}|${d.gameNumber}`;
    case 'CARD_PICK':
      return `CP|${d.game}|${m.hand.join()}|${m.playsLeft}|${local.cardPick}`;
    case 'CARD_RESOLVE':
      return `CR|${d.game}`;
    case 'PLAY': {
      const st = d.state;
      const g = d.game;
      switch (st.step) {
        case 'vote':
          return `${g}|vote|${m.myVote}|${local.jokerArmed}|${p.jokerLeft}`;
        case 'question':
          return `${g}|q|${st.question.id}|${m.myAnswer}|${m.blocked}|${st.holder}`;
        case 'steal':
          return `${g}|steal|${st.question.id}|${m.choose?.done}`;
        case 'bet':
          return `${g}|bet|${st.number}|${m.myBet}`;
        case 'pass':
          return `${g}|pass|${st.holder}|${snap.endsAt}`;
        case 'numeric':
          return `${g}|num|${st.question.id}|${m.myNumeric}`;
        case 'blitz':
          return `${g}|blitz|${m.blitz?.question.id}`;
        case 'sabotage':
          return `${g}|sab|${m.sabotage?.left ?? 0}|${local.sabotagePick}`;
        default:
          return `${g}|${st.step}|${'question' in st ? st.question.id : ''}|${snap.endsAt}`;
      }
    }
    case 'PYRAMID_INTRO':
      return 'PI';
    case 'GAME_OVER':
      return `GO|${p.isVip}`;
  }
}

// ------------------------------------------------------------ rendering

function render(force = false) {
  if (!s?.me) return;
  const p = meOf(s);
  if (!p) return;
  renderHeader(s, p);
  if (s.endsAt !== local.endsAt) {
    local.endsAt = s.endsAt;
    local.total = Math.max(1, clock.remaining(s.endsAt) ?? 1);
  }
  const phaseId = `${s.phase}|${s.phaseData.phase === 'PLAY' ? s.phaseData.state.step : ''}`;
  if (phaseId !== lastPhase) {
    lastPhase = phaseId;
    local.jokerArmed = false;
    local.cardPick = null;
    local.sabotagePick = null;
    if (s.phase !== 'LOBBY') local.sheet = false;
  }

  const key = keyOf(s, p);
  if (!force && key === viewKey) return;
  viewKey = key;
  cleanup?.();
  cleanup = null;
  if (s.phase !== 'LOBBY' || local.sheet) preview.unmount();

  const d = s.phaseData;
  switch (d.phase) {
    case 'LOBBY':
      return local.sheet ? sheetView() : lobbyView(s, p);

    case 'WHEEL':
      return wait('<div class="big-icon spin">🎡</div>Guarda la ruota!', `Gioco ${d.gameNumber} di ${d.totalGames}`);

    case 'GAME_INTRO': {
      const g = GAMES[d.game];
      app.innerHTML = `
        <div class="view center">
          <div class="game-badge pop" style="--gc:${g.color}"><span>${g.icon}</span>${esc(g.name)}</div>
          <ul class="rules">${g.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <p class="muted">Gioco ${d.gameNumber} di ${d.totalGames} · tra poco le carte!</p>
        </div>`;
      return;
    }

    case 'CARD_PICK':
      return cardPickView(d.game, p);

    case 'CARD_RESOLVE':
      return cardResolveView(d.events, p);

    case 'PLAY':
      return playView(d.game, d.state, p);

    case 'GAME_RESULT': {
      const delta = d.deltas[p.id] ?? 0;
      return wait(
        `<div class="rank-big">${p.rank}°</div><div class="points ${delta < 0 ? 'neg' : ''}">${pts(delta)}</div><b>${p.score.toLocaleString('it-IT')}</b> punti totali`,
        d.gameNumber < d.totalGames ? `Prossimo gioco tra poco (${d.gameNumber}/${d.totalGames})` : 'Ora si va in finale! 🔺'
      );
    }

    case 'PYRAMID_INTRO':
      return wait(
        `<div class="game-badge" style="--gc:#e9a800"><span>🔺</span>FINALE</div><div class="title">La Piramide della Conoscenza</div>Parti dal gradino <b>${p.pyramidStep}</b> di ${s.pyramidSteps}`,
        'Risposta giusta +1 · la più veloce +2 · vince chi arriva in cima'
      );

    case 'GAME_OVER': {
      const pos = d.podium.indexOf(p.id) + 1;
      app.innerHTML = `
        <div class="view center">
          ${d.winnerId === p.id ? '<div class="big-icon">🏆</div><div class="title">HAI VINTO!</div>' : `<div class="rank-big">${pos}°</div><div class="title">posto</div>`}
          <div class="muted">${p.score.toLocaleString('it-IT')} punti · gradino ${p.pyramidStep}</div>
          ${p.isVip ? '<button class="btn big" data-act="again">🔁 Gioca ancora</button>' : '<div class="muted small">Il capo stanza 👑 può avviare una nuova partita</div>'}
        </div>`;
      onClick((t) => {
        if (t.closest('[data-act="again"]')) void act(socket.emitWithAck('RESTART_GAME', {}));
      });
      return;
    }
  }
}

function renderHeader(snap: RoomSnapshot, p: PlayerPublic) {
  const badges = [p.defense ? CARDS[p.defense].icon : '', p.doubleArmed ? '💎' : '', p.bonusCard ? '🃏+1' : ''].filter(Boolean).join(' ');
  const html = `<span class="dot" style="background:${colorOf(p.id)}"></span><b>${esc(p.name)}</b>${badges ? `<span class="badges">${badges}</span>` : ''}
    <span class="c-score">${snap.phase === 'LOBBY' ? `Stanza ${snap.code}` : `${p.score.toLocaleString('it-IT')} pti · ${p.rank}°`}</span>`;
  if (head.innerHTML !== html) head.innerHTML = html;
}

// ------------------------------------------------------------ carte

function cardPickView(game: GameId, p: PlayerPublic) {
  const m = s!.me!;
  if (m.playsLeft === 0) {
    const played = m.played.map((c) => `${CARDS[c.card].icon} ${CARDS[c.card].label}${c.targetId ? ` → ${nameOf(c.targetId)}` : ''}`);
    return wait(played.length ? `<div class="big-icon">🃏</div>${played.join('<br>')}` : '<div class="big-icon">🤐</div>Nessuna carta giocata', 'In attesa degli altri…');
  }
  if (local.cardPick) {
    const c = CARDS[local.cardPick];
    targetList(`${c.icon} ${c.label}: chi colpisci?`, p, '‹ Cambia carta');
  } else {
    app.innerHTML = `
      <div class="view">
        <div class="title">🃏 Gioca una carta</div>
        ${m.playsLeft > 1 ? '<div class="q-banner">🔥 Serie di risposte giuste: puoi giocare 2 carte!</div>' : ''}
        <div class="card-list">${m.hand.map((t) => {
          const c = CARDS[t];
          return `<button class="card-btn ${c.kind}" data-card="${t}" style="--pw:${c.color}">
            <span class="pi">${c.icon}</span><span><em>${{ attack: 'Attacco', defense: 'Difesa', bonus: 'Bonus' }[c.kind]}</em><b>${c.label}</b><small>${esc(cardDescription(t, game))}</small></span>
          </button>`;
        }).join('')}</div>
        ${GAMES[game].cards.note ? `<div class="muted small">⚖️ ${esc(GAMES[game].cards.note)}</div>` : ''}
        <button class="link-btn" data-act="skip">Non giocare carte</button>
      </div>`;
  }
  onClick((t) => {
    const card = t.closest<HTMLElement>('[data-card]')?.dataset.card as CardType | undefined;
    const target = t.closest<HTMLElement>('[data-target]')?.dataset.target;
    if (card) {
      if (isAttack(card)) {
        local.cardPick = card;
        return render();
      }
      navigator.vibrate?.(25);
      return void act(socket.emitWithAck('PLAY_CARD', { card, targetId: null }));
    }
    if (target && local.cardPick) {
      const c = local.cardPick;
      local.cardPick = null;
      navigator.vibrate?.(25);
      return void act(socket.emitWithAck('PLAY_CARD', { card: c, targetId: target }));
    }
    if (t.closest('[data-act="back"]')) {
      local.cardPick = null;
      return render();
    }
    if (t.closest('[data-act="skip"]')) void act(socket.emitWithAck('PLAY_CARD', { card: null, targetId: null }));
  });
}

function describe(e: CardEvent, meId: string): string | null {
  const c = CARDS[e.card];
  const last = e.path[e.path.length - 1];
  const mine = e.from === meId;
  const defense = e.defense ? `${CARDS[e.defense].icon} ${CARDS[e.defense].label}` : '';
  if (e.result === 'self') return mine ? `${c.icon} Hai attivato <b>${c.label}</b>` : null;
  const reflected = e.path.length > 2 && last === e.from;
  const redirected = e.path.length > 2 && !reflected;
  if (mine) {
    if (e.result === 'hit') return reflected ? `🪞 Il tuo ${c.icon} è tornato indietro: <b>ti sei colpito da solo!</b>` : `${c.icon} Hai colpito <b>${nameOf(last)}</b>${redirected ? ' (deviato dal Mantello!)' : ''}`;
    if (e.result === 'blocked') return `${c.icon} ${nameOf(last)} si è difeso con ${defense}`;
    if (e.result === 'absorbed') return `${c.icon} ${nameOf(last)} l'ha neutralizzato con ${defense}`;
    if (e.result === 'crowded') return `${c.icon} ${nameOf(last)} è già sommerso di attacchi: rimbalzato!`;
    return `${c.icon} 👻 Attacco andato a vuoto!`;
  }
  if (!e.path.includes(meId)) return null;
  if (e.path[1] === meId && e.result !== 'hit' && last !== meId) {
    return reflected ? `🪞 Hai rimandato ${c.icon} a <b>${nameOf(e.from)}</b>!` : `👻 Il Mantello ha deviato ${c.icon} di ${nameOf(e.from)}`;
  }
  if (last !== meId) return e.path[1] === meId && redirected ? `👻 Il Mantello ha deviato ${c.icon} su ${nameOf(last)}` : null;
  if (e.result === 'hit') return `⚠️ <b>${nameOf(e.from)}</b> ti ha colpito con ${c.icon} ${c.label}!`;
  if (e.result === 'blocked') return `${defense}: hai bloccato ${c.icon} di ${nameOf(e.from)}`;
  if (e.result === 'absorbed') return `🧪 Hai neutralizzato ${c.icon} di ${nameOf(e.from)}: +${CONFIG.ANTIDOTE_POINTS} punti`;
  if (e.result === 'crowded') return `🛑 ${c.icon} di ${nameOf(e.from)} rimbalzato: eri già bersagliato da troppi!`;
  return null;
}

function cardResolveView(events: CardEvent[], p: PlayerPublic) {
  const lines = events.map((e) => describe(e, p.id)).filter(Boolean);
  if (events.some((e) => e.result === 'hit' && e.path[e.path.length - 1] === p.id)) navigator.vibrate?.([120, 60, 120]);
  if (!lines.length) return wait('<div class="big-icon">📺</div>Guarda lo schermo!', 'Le carte stanno volando…');
  app.innerHTML = `<div class="view center"><div class="title">Carte giocate</div><div class="incoming">${lines.map((l) => `<div class="pop">${l}</div>`).join('')}</div></div>`;
}

// ------------------------------------------------------------ giochi

function questionBanner(game: string, st: Extract<PlayState, { step: 'question' }>, p: PlayerPublic): string | undefined {
  const extra = p.doubleArmed ? ' · 💎 punti doppi' : '';
  if (game === 'bomb') return st.holder === p.id ? `💣 <b>Hai la bomba!</b> Rispondi giusto per lanciarla${extra}` : `💣 La bomba ce l'ha ${nameOf(st.holder)}${extra}`;
  if (game === 'fastest') return `⚡ Solo il primo che risponde giusto vince!${extra}`;
  if (game === 'clues') return `🧩 Rispondi prima che si sveli tutto!${extra}`;
  if (game === 'pyramid') return '🔺 Finale: rispondi giusto per salire';
  if (game === 'music' || st.question.audio) return `🎵 <b>Ascolta il brano dallo schermo!</b>${extra}`;
  return extra ? extra.slice(3) : undefined;
}

function playView(game: string, st: PlayState, p: PlayerPublic) {
  const m = s!.me!;
  const effectsFor = (qid: string) => (m.cur?.questionId === qid ? m.cur.incoming.filter((e) => p.activeEffects.includes(e.type)) : []);
  const removedFor = (qid: string) => (m.cur?.questionId === qid ? m.cur.removed : []);
  const onCleared = (type: PowerType) => socket.emit('CLEAR_EFFECT', { type });

  switch (st.step) {
    case 'vote': {
      if (m.myVote) {
        const c = st.categories.find((x) => x.id === m.myVote)!;
        return wait(`<div class="big-icon">${c.icon}</div>Hai votato <b>${esc(c.name)}</b>`, 'In attesa degli altri…');
      }
      app.innerHTML = `
        <div class="view">
          <div class="title">Vota la categoria</div>
          <div class="cat-grid">${st.categories.map((c) => `
            <button class="cat-btn" data-cat="${c.id}" style="--cc:${c.color}"><span>${c.icon}</span>${esc(c.name)}</button>`).join('')}
          </div>
          ${p.jokerLeft > 0
            ? `<button class="joker ${local.jokerArmed ? 'on' : ''}" data-act="joker">🃏 ${local.jokerArmed ? '<b>JOKER ATTIVO</b> · la tua scelta vincerà!' : 'Usa il Joker <small>(1 a partita)</small>'}</button>`
            : '<div class="muted small">🃏 Joker già usato</div>'}
        </div>`;
      onClick((t) => {
        if (t.closest('[data-act="joker"]')) {
          local.jokerArmed = !local.jokerArmed;
          return render();
        }
        const cat = t.closest<HTMLElement>('[data-cat]')?.dataset.cat;
        if (cat) void gameAction({ type: 'vote', categoryId: cat, useJoker: local.jokerArmed });
      });
      return;
    }

    case 'voteResult':
      return wait(
        `<div class="big-icon">${st.category.icon}</div><div class="title">${esc(st.category.name)}</div>`,
        st.jokerBy ? `🃏 Scelta imposta dal Joker di ${nameOf(st.jokerBy)}` : 'Categoria scelta dalla maggioranza'
      );

    case 'question': {
      const q = st.question;
      cleanup = questionView(app, q, effectsFor(q.id), {
        answered: m.myAnswer,
        removed: removedFor(q.id),
        blocked: m.blocked,
        banner: questionBanner(game, st, p),
        onAnswer: (i) => void gameAction({ type: 'answer', questionId: q.id, optionIndex: i }),
        onCleared
      });
      return;
    }

    case 'reveal': {
      const r = st.results.find((x) => x.playerId === p.id);
      const move = st.moves?.find((x) => x.playerId === p.id);
      navigator.vibrate?.(r?.correct ? 60 : [40, 40, 40]);
      let detail = '';
      if (game === 'pyramid') detail = move ? `Sali di <b>${move.to - move.from}</b> gradin${move.to - move.from === 1 ? 'o' : 'i'}! Ora sei al ${move.to}°` : `Resti al gradino ${p.pyramidStep}`;
      else if (r?.points) detail = `<span class="points ${r.points < 0 ? 'neg' : ''}">${pts(r.points)}</span>`;
      if (game === 'fastest' && st.winner && st.winner !== p.id) detail += `<div class="muted">⚡ Il più veloce: ${nameOf(st.winner)}</div>`;
      app.innerHTML = `
        <div class="view center">
          <div class="result ${r?.correct ? 'good' : 'bad'} pop">${r?.correct ? '✅ Esatto!' : r?.optionIndex == null ? '⏰ Nessuna risposta' : '❌ Sbagliato'}</div>
          <div class="detail">${detail}</div>
          <div class="muted">La risposta giusta era</div>
          <div class="reveal-answer" style="--oc:${OPTION_COLORS[st.correctIndex]}"><b>${OPTION_LETTERS[st.correctIndex]}</b>
            ${st.question.optionImages ? `<img class="reveal-img" src="${esc(st.question.optionImages[st.correctIndex])}" alt="">` : ''}${esc(st.question.options[st.correctIndex])}</div>
          ${st.question.image ? `<img class="q-image small" src="${esc(st.question.image)}" alt="">` : ''}
        </div>`;
      return;
    }

    case 'steal': {
      if (m.choose?.kind === 'steal' && !m.choose.done) {
        targetList(`🦝 Ruba ${m.choose.amount} punti a…`, p);
        onClick((t) => {
          const target = t.closest<HTMLElement>('[data-target]')?.dataset.target;
          if (target) void gameAction({ type: 'target', targetId: target });
        });
        return;
      }
      const thief = st.thieves.find((x) => x.playerId === p.id);
      return wait(
        thief ? '<div class="big-icon">🦝</div>Bersaglio scelto!' : st.results.find((r) => r.playerId === p.id)?.correct ? '✅ Esatto!' : '<div class="big-icon">😬</div>Speriamo che non rubino a te…',
        `Ladri: ${st.thieves.map((t) => nameOf(t.playerId)).join(', ')}`
      );
    }

    case 'transfers': {
      const net = st.transfers.reduce((n, t) => n + (t.to === p.id ? t.amount : 0) - (t.from === p.id ? t.amount : 0), 0);
      return wait(net === 0 ? '<div class="big-icon">😌</div>Nessun furto per te' : `<div class="big-icon">${net > 0 ? '💰' : '🦝'}</div><div class="points ${net < 0 ? 'neg' : ''}">${pts(net)}</div>`);
    }

    case 'bet': {
      if (m.myBet !== null) return wait(`<div class="big-icon">🎰</div>Hai puntato <b>${m.myBet.toLocaleString('it-IT')}</b> punti`, `Categoria: ${st.category.icon} ${esc(st.category.name)}`);
      app.innerHTML = `
        <div class="view">
          <div class="title">🎰 Quanto scommetti?</div>
          <div class="bet-cat" style="--cc:${st.category.color}"><span>${st.category.icon}</span>${esc(st.category.name)}</div>
          <div class="bet-list">${m.betOptions.map((v, i) => `<button class="bet-btn" data-bet="${i}">💰 ${v.toLocaleString('it-IT')}${v >= p.score && p.score > 0 ? ' <small>TUTTO!</small>' : ''}</button>`).join('')}</div>
          <div class="muted small">Giusto: vinci la puntata · Sbagliato: la perdi</div>
        </div>`;
      onClick((t) => {
        const i = t.closest<HTMLElement>('[data-bet]')?.dataset.bet;
        if (i !== undefined) void gameAction({ type: 'bet', index: Number(i) });
      });
      return;
    }

    case 'pass': {
      if (m.choose?.kind === 'pass') {
        targetList('💣 Lancia la bomba a…', p);
        navigator.vibrate?.(60);
        onClick((t) => {
          const target = t.closest<HTMLElement>('[data-target]')?.dataset.target;
          if (target) void gameAction({ type: 'target', targetId: target });
        });
        return;
      }
      return wait('<div class="big-icon shake">💣</div>', `${nameOf(st.holder)} sta per lanciare la bomba…`);
    }

    case 'boom':
      navigator.vibrate?.(st.holder === p.id ? [300, 100, 300] : 50);
      return wait(
        st.holder === p.id ? `<div class="big-icon">💥</div>BOOM! Hai perso <b>${st.penalty}</b> punti` : `<div class="big-icon">💥</div>La bomba è esplosa in mano a <b>${nameOf(st.holder)}</b>!`,
        st.holder === p.id ? 'Sarà per la prossima…' : 'Scampato pericolo 😅'
      );

    case 'numeric': {
      const q = st.question;
      cleanup = numericView(app, q, effectsFor(q.id), {
        submitted: m.myNumeric,
        hint: m.cur?.questionId === q.id ? m.cur.hint : null,
        onSubmit: (value) => void gameAction({ type: 'numeric', questionId: q.id, value }),
        onCleared
      });
      return;
    }

    case 'numericReveal': {
      const g = st.guesses.find((x) => x.playerId === p.id);
      return wait(
        `<div class="muted">Risposta esatta</div><div class="title">${formatNumber(st.answer)} ${esc(st.question.unit)}</div>
         ${g?.value != null ? `La tua stima: <b>${formatNumber(g.value)}</b>${g.rank ? ` · ${g.rank}° più vicino` : ''}` : 'Nessuna stima'}
         ${g?.points ? `<div class="points">${pts(g.points)}</div>` : ''}`
      );
    }

    case 'blitz': {
      const b = m.blitz;
      if (!b) return wait('<div class="big-icon">🔥</div>');
      const q = b.question;
      cleanup = questionView(app, q, effectsFor(q.id), {
        answered: null,
        removed: removedFor(q.id),
        blocked: false,
        banner: `🔥 Serie <b>${b.streak}</b> · ×${b.multiplier} · <b>${b.points}</b> pti`,
        onAnswer: (i) => void gameAction({ type: 'answer', questionId: q.id, optionIndex: i }),
        onCleared
      });
      if (b.feedback) app.querySelector('.question')?.classList.add(b.feedback === 'correct' ? 'flash-good' : 'flash-bad');
      return;
    }

    case 'blitzEnd': {
      const pr = st.progress.find((x) => x.playerId === p.id);
      return wait(`<div class="big-icon">🔥</div><b>${pr?.correct ?? 0}</b> giuste su ${pr?.answered ?? 0}<div class="points">${pts(pr?.points ?? 0)}</div>`, 'Guarda la classifica sullo schermo');
    }

    case 'sabotage':
      return sabotageView(st, p);

    case 'sabotageResult': {
      const lines = st.events.map((e) => describe(e, p.id)).filter(Boolean);
      if (st.events.some((e) => e.result === 'hit' && e.path[e.path.length - 1] === p.id)) navigator.vibrate?.([120, 60, 120]);
      if (!lines.length) return wait('<div class="big-icon">🔻</div>Nessun sabotaggio per te', 'Prossima domanda in arrivo…');
      app.innerHTML = `<div class="view center"><div class="title">🔻 Sabotaggio</div><div class="incoming">${lines.map((l) => `<div class="pop">${l}</div>`).join('')}</div></div>`;
      return;
    }
  }
}

const SABOTAGE_CARDS: PowerType[] = ['ICE', 'GOO', 'BOMB', 'LOCK'];

/** Piramide: chi è in fondo sceglie un attacco e il bersaglio (l'ultimo ne ha 2, il penultimo 1). */
function sabotageView(st: Extract<PlayState, { step: 'sabotage' }>, p: PlayerPublic) {
  const left = s!.me!.sabotage?.left ?? 0;
  if (left === 0) {
    const mine = st.saboteurs.some((x) => x.playerId === p.id);
    return wait(
      mine ? '<div class="big-icon">🔻</div>Attacchi inviati!' : '<div class="big-icon">😬</div>Sabotaggio in corso…',
      mine ? 'Guarda lo schermo' : `Stanno scegliendo: ${st.saboteurs.map((x) => nameOf(x.playerId)).join(', ')}`
    );
  }
  if (local.sabotagePick) {
    const c = CARDS[local.sabotagePick];
    targetList(`${c.icon} ${c.label}: chi colpisci?`, p, '‹ Cambia attacco');
  } else {
    app.innerHTML = `
      <div class="view">
        <div class="title">🔻 Sabotaggio!</div>
        <div class="q-banner">Sei in fondo alla piramide: hai <b>${left}</b> ${left === 1 ? 'attacco' : 'attacchi'} da lanciare contro chi vuoi</div>
        <div class="card-list">${SABOTAGE_CARDS.map((t) => {
          const c = CARDS[t];
          return `<button class="card-btn attack" data-card="${t}" style="--pw:${c.color}">
            <span class="pi">${c.icon}</span><span><em>Attacco</em><b>${c.label}</b><small>${esc(cardDescription(t, 'pyramid'))}</small></span>
          </button>`;
        }).join('')}</div>
        <button class="link-btn" data-act="skip">Rinuncia</button>
      </div>`;
  }
  onClick((t) => {
    const card = t.closest<HTMLElement>('[data-card]')?.dataset.card as PowerType | undefined;
    const target = t.closest<HTMLElement>('[data-target]')?.dataset.target;
    if (card) {
      local.sabotagePick = card;
      return render();
    }
    if (target && local.sabotagePick) {
      const c = local.sabotagePick;
      local.sabotagePick = null;
      navigator.vibrate?.(25);
      return void gameAction({ type: 'sabotage', card: c, targetId: target });
    }
    if (t.closest('[data-act="back"]')) {
      local.sabotagePick = null;
      return render();
    }
    if (t.closest('[data-act="skip"]')) void gameAction({ type: 'sabotage', card: null, targetId: null });
  });
}

// ------------------------------------------------------------ lobby

function sheetView() {
  cleanup = addQuestionSheet(
    app,
    local.lastCategory,
    async (q) => {
      const r = await socket.emitWithAck('ADD_QUESTION', q);
      if (!r.ok) {
        toast(r.error);
        return false;
      }
      local.lastCategory = q.categoryName;
      toast(`Domanda aggiunta! (${r.total} nel pacchetto degli amici)`, true);
      return true;
    },
    () => {
      local.sheet = false;
      render(true);
    }
  );
}

function lobbyView(snap: RoomSnapshot, p: PlayerPublic) {
  const taken = takenCombos(snap, p);
  const free = (ci: number) => CHARACTERS[ci].skins.findIndex((k) => !taken.has(`${CHARACTERS[ci].id}/${k.id}`));

  if (local.charIdx < 0) {
    const ci = CHARACTERS.findIndex((c) => c.id === p.characterId);
    if (ci >= 0) {
      local.charIdx = ci;
      local.skinIdx = Math.max(0, CHARACTERS[ci].skins.findIndex((k) => k.id === p.skinId));
    } else {
      const usedChars = new Set(snap.players.map((o) => o.characterId));
      local.charIdx = Math.max(0, CHARACTERS.findIndex((c, i) => !usedChars.has(c.id) && free(i) >= 0));
      local.skinIdx = Math.max(0, free(local.charIdx));
    }
  }
  if (!p.ready && taken.has(`${CHARACTERS[local.charIdx].id}/${CHARACTERS[local.charIdx].skins[local.skinIdx].id}`)) {
    const f = free(local.charIdx);
    if (f >= 0) local.skinIdx = f;
  }

  const ch = CHARACTERS[local.charIdx];
  const sk = ch.skins[local.skinIdx];
  if (p.characterId !== ch.id || p.skinId !== sk.id) {
    clearTimeout(selectTimer);
    selectTimer = window.setTimeout(() => void act(socket.emitWithAck('SELECT_CHARACTER', { characterId: ch.id, skinId: sk.id })), 200);
  }

  const selfieThumb = mySelfie ? `style="background-image:url(${mySelfie})"` : '';
  app.innerHTML = `
    <div class="view lobby">
      <div class="char-stage">
        <button class="arrow" data-act="prev" ${p.ready ? 'disabled' : ''} aria-label="Personaggio precedente">‹</button>
        <div class="preview" id="preview"></div>
        <button class="arrow" data-act="next" ${p.ready ? 'disabled' : ''} aria-label="Personaggio successivo">›</button>
      </div>
      <div class="char-name">${esc(ch.name)}</div>
      <div class="muted char-tag">${esc(ch.tagline)}</div>
      <div class="skins">${ch.skins.map((k, i) => `
        <button class="skin ${i === local.skinIdx ? 'on' : ''}" data-skin="${i}" ${taken.has(`${ch.id}/${k.id}`) || p.ready ? 'disabled' : ''}
          style="--a:${k.colors.body};--b:${k.colors.accent};--c:${k.colors.skin}"><i></i>${esc(k.name)}</button>`).join('')}
      </div>
      <div class="selfie-row">
        <div class="selfie-thumb" ${selfieThumb}>${mySelfie ? '' : p.hasSelfie ? '✓' : '🙂'}</div>
        <button class="btn secondary" data-act="selfie">📸 ${mySelfie || p.hasSelfie ? 'Rifai il selfie' : 'Scatta un selfie'}</button>
        ${mySelfie || p.hasSelfie ? '<button class="btn secondary icon" data-act="noselfie" aria-label="Rimuovi selfie">✕</button>' : ''}
      </div>
      <button class="btn big ${p.ready ? 'is-ready' : ''}" data-act="ready">${p.ready ? '✅ Pronto! <small>tocca per modificare</small>' : '✋ Sono pronto!'}</button>
      ${p.isVip
        ? `<button class="btn pink big" data-act="start" ${canStart(snap) ? '' : 'disabled'}>👑 Avvia la partita</button>
           ${canStart(snap) ? '' : '<div class="muted small">Sei il capo stanza: potrai avviare quando tutti sono pronti</div>'}`
        : '<div class="muted small">Il capo stanza 👑 avvierà la partita</div>'}
      <button class="btn secondary" data-act="sheet">➕ Aggiungi una domanda per gli amici</button>
    </div>`;

  preview.mount(document.getElementById('preview')!);
  preview.show(ch.id, sk.id, mySelfie);

  const step = (dir: number) => {
    for (let k = 1; k <= CHARACTERS.length; k++) {
      const ci = (local.charIdx + dir * k + CHARACTERS.length) % CHARACTERS.length;
      const f = free(ci);
      if (f >= 0) {
        local.charIdx = ci;
        local.skinIdx = f;
        break;
      }
    }
    navigator.vibrate?.(10);
    render();
  };

  onClick(async (t) => {
    const a = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const skin = t.closest<HTMLElement>('[data-skin]')?.dataset.skin;
    if (skin !== undefined) {
      local.skinIdx = Number(skin);
      return render();
    }
    switch (a) {
      case 'prev':
        return step(-1);
      case 'next':
        return step(1);
      case 'sheet':
        local.sheet = true;
        return render(true);
      case 'selfie': {
        const data = await pickSelfie();
        if (!data) return toast('Foto non valida, riprova');
        mySelfie = data;
        store(SELFIE_KEY, data);
        await act(socket.emitWithAck('UPLOAD_SELFIE', { dataUrl: data }));
        preview.wave();
        return render(true);
      }
      case 'noselfie':
        mySelfie = null;
        store(SELFIE_KEY, null);
        await act(socket.emitWithAck('UPLOAD_SELFIE', { dataUrl: null }));
        return render(true);
      case 'ready':
        if (!p.ready) {
          clearTimeout(selectTimer);
          const r = await socket.emitWithAck('SELECT_CHARACTER', { characterId: ch.id, skinId: sk.id });
          if (!r.ok) return toast(r.error);
          preview.wave();
        }
        socket.emit('PLAYER_READY', { ready: !p.ready });
        navigator.vibrate?.(30);
        return;
      case 'start':
        return void act(socket.emitWithAck('START_GAME', {}));
    }
  });
}

// ------------------------------------------------------------ schermata di ingresso

function renderJoin(error = '') {
  viewKey = 'JOIN';
  cleanup?.();
  cleanup = null;
  preview.unmount();
  head.innerHTML = '';
  app.innerHTML = `
    <form class="view join">
      <div class="join-logo">${brandLogoHtml()}</div>
      <label>Codice stanza
        <input name="code" maxlength="4" autocomplete="off" autocapitalize="characters" required value="${esc(urlRoom || session?.code || '')}" placeholder="ABCD">
      </label>
      <label>Il tuo nome
        <input name="name" maxlength="${CONFIG.NAME_MAX_CHARS}" autocomplete="nickname" required value="${esc(session?.name ?? load<string>('sep:name') ?? '')}" placeholder="Come ti chiami?">
      </label>
      <button class="btn big" type="submit">Entra in partita!</button>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
    </form>`;
  const form = app.querySelector('form')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    store('sep:name', name);
    void join(String(data.get('code') ?? '').trim(), name);
  });
}

// ------------------------------------------------------------ timer

setInterval(() => {
  const rem = local.endsAt === null ? null : clock.remaining(local.endsAt);
  timerBar.style.transform = `scaleX(${rem === null ? 0 : Math.min(1, rem / local.total)})`;
  timerBar.classList.toggle('urgent', rem !== null && rem < 5000);
}, 100);
