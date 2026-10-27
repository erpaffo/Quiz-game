import { BLUFF, type BluffPrivate, type BluffPublic } from '../../shared/bluff';

import { GEMELLE, type GemellePrivate, type GemellePublic } from '../../shared/gemelle';
import { IMPOSTOR, type ImpostorPrivate, type ImpostorPublic } from '../../shared/impostor';
import { SCALA, type ScalaPrivate, type ScalaPublic } from '../../shared/scala';
import { getShowMeta, type ShowFinal, type ShowId, type ShowMeta } from '../../shared/shows';
import { TEMPO, type TempoPrivate, type TempoPublic } from '../../shared/tempo';
import type { PlayerPublic, RoomSnapshot } from '../../shared/types';
import { esc, PLAYER_COLORS, playerShape } from '../common/net';
import { renderControllerShowBatch2 } from './controller-shows-2';

export interface ControllerShowContext {
  app: HTMLElement;
  onClick: (handler: (target: HTMLElement) => void) => void;
  sendShowAction: (payload: unknown) => Promise<boolean>;
  restartGame: () => Promise<boolean>;
  toast: (msg: string, good?: boolean) => void;
}

let draftYear = 1980;
let draftQuestionNum = -1;
let impostorRoleHidden = false;

export function playerColor(snap: RoomSnapshot, id: string): string {
  const i = snap.players.findIndex((p) => p.id === id);
  return PLAYER_COLORS[Math.max(0, i) % PLAYER_COLORS.length];
}

/** Forma del giocatore da mettere accanto al colore (CSS: --ps). */
export function playerShapeCss(snap: RoomSnapshot, id: string): string {
  return `--ps:'${playerShape(snap.players.findIndex((p) => p.id === id))}'`;
}

export function playerName(snap: RoomSnapshot, id: string | null | undefined): string {
  return esc(snap.players.find((p) => p.id === id)?.name ?? '???');
}

export function controllerShowKey(snap: RoomSnapshot, p: PlayerPublic): string {
  const showId = snap.phaseData.phase === 'SHOW' ? snap.phaseData.show : snap.show?.id ?? 'quiz';
  const pub = (snap.show?.state ?? {}) as Record<string, unknown>;
  const step = typeof pub.step === 'string' ? pub.step : '';
  const num = typeof pub.number === 'number' ? pub.number : typeof pub.round === 'number' ? pub.round : typeof pub.stage === 'number' ? pub.stage : '';
  const idx = typeof pub.index === 'number' ? pub.index : typeof pub.question === 'object' && pub.question && 'id' in pub.question ? String((pub.question as { id: unknown }).id) : '';
  const gold = typeof pub.gold === 'number' ? pub.gold : '';
  return `SHOW|${showId}|${step}|${num}|${idx}|${gold}|${p.isVip}|${JSON.stringify(snap.me?.show ?? null)}`;
}

export function renderControllerShow(snap: RoomSnapshot, p: PlayerPublic, ctx: ControllerShowContext): void {
  const showId: ShowId = snap.phaseData.phase === 'SHOW' ? snap.phaseData.show : snap.show?.id ?? 'quiz';
  const pub = snap.show?.state;
  const priv = snap.me?.show;
  const meta = getShowMeta(showId);

  if (!pub || typeof pub !== 'object' || !('step' in pub)) {
    ctx.app.innerHTML = `<div class="view center"><div class="big-icon">${meta.icon}</div><div class="title">${esc(meta.name)}</div><p class="muted">Preparazione…</p></div>`;
    return;
  }

  switch (showId) {
    case 'tempo':
      return renderTempoController(snap, p, pub as TempoPublic, (priv ?? { myYear: null }) as TempoPrivate, ctx);
    case 'gemelle':
      return renderGemelleController(snap, p, meta, pub as GemellePublic, (priv ?? { words: [], done: false }) as GemellePrivate, ctx);
    case 'scala':
      return renderScalaController(
        snap,
        p,
        meta,
        pub as ScalaPublic,
        (priv ?? { theme: null, target: null, myAnswer: null, myGuess: null, isAuthor: false }) as ScalaPrivate,
        ctx
      );
    case 'bluff':
      return renderBluffController(
        snap,
        p,
        meta,
        pub as BluffPublic,
        (priv ?? { myLie: null, safeties: [], myOptionId: null, myChoice: null }) as BluffPrivate,
        ctx
      );
    case 'impostor':
      return renderImpostorController(
        snap,
        p,
        meta,
        pub as ImpostorPublic,
        (priv ?? { role: null, word: null, myClue: null, myVote: null }) as ImpostorPrivate,
        ctx
      );
    default:
      return renderControllerShowBatch2(snap, p, showId, meta, pub, priv, ctx);
  }
}

export function renderShowFinalController(p: PlayerPublic, meta: ShowMeta, st: ShowFinal, ctx: ControllerShowContext): void {
  const idx = st.ranking.findIndex((r) => r.playerId === p.id);
  const meRank = idx >= 0 ? st.ranking[idx] : null;
  ctx.app.innerHTML = `
    <div class="view center">
      ${idx === 0 ? '<div class="big-icon">👑</div><div class="title">HAI VINTO!</div>' : `<div class="rank-big">${idx + 1}°</div><div class="title">posto</div>`}
      <div class="muted">${esc(meta.name)} · ${(meRank?.points ?? p.score).toLocaleString('it-IT')} punti</div>
      ${p.isVip ? '<button class="btn big" data-act="hub">🏠 Torna al Party Hub</button>' : '<div class="muted small">Tra poco si torna automaticamente al Party Hub</div>'}
    </div>`;
  if (p.isVip) {
    ctx.onClick((t) => {
      if (t.closest('[data-act="hub"]')) void ctx.restartGame();
    });
  }
}

// ---------------------------------------------------------------------------
// 1. 🕰️ MACCHINA DEL TEMPO
// ---------------------------------------------------------------------------

function renderTempoController(_snap: RoomSnapshot, p: PlayerPublic, st: TempoPublic, priv: TempoPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'question') {
    if (draftQuestionNum !== st.number) {
      draftQuestionNum = st.number;
      draftYear = priv.myYear ?? 1975;
    } else if (priv.myYear !== null) {
      draftYear = priv.myYear;
    }
    const clampYear = (y: number) => Math.max(TEMPO.MIN_YEAR, Math.min(TEMPO.MAX_YEAR, Math.round(y)));

    ctx.app.innerHTML = `
      <div class="view tempo-ctrl">
        <div class="q-banner">🕰️ Evento ${st.number} di ${st.total}</div>
        <div class="title">${esc(st.event)}</div>
        <div class="tempo-year-box">
          <small class="muted">${priv.myYear !== null ? `✓ Confermato: <b>${priv.myYear}</b> (puoi cambiarlo)` : "Scegli l'anno sull'orologio del tempo"}</small>
          <div class="tempo-year-val" id="tempo-year-val">${draftYear}</div>
        </div>
        <input type="range" id="tempo-slider" class="tempo-slider" min="${TEMPO.MIN_YEAR}" max="${TEMPO.MAX_YEAR}" step="1" value="${draftYear}" />
        <div class="tempo-range-labels"><span>${TEMPO.MIN_YEAR}</span><span>1500</span><span>1800</span><span>${TEMPO.MAX_YEAR}</span></div>
        <div class="tempo-step-grid">
          <button class="btn secondary" data-delta="-50">-50</button>
          <button class="btn secondary" data-delta="-10">-10</button>
          <button class="btn secondary" data-delta="-1">-1</button>
          <button class="btn secondary" data-delta="1">+1</button>
          <button class="btn secondary" data-delta="10">+10</button>
          <button class="btn secondary" data-delta="50">+50</button>
        </div>
        <button class="btn big ${priv.myYear !== null ? 'is-ready' : 'pink'}" data-act="confirm-year" id="tempo-confirm-btn">
          ${priv.myYear !== null ? `✓ Anno ${priv.myYear} inviato · Tocca per aggiornare` : `🕰️ Conferma anno ${draftYear}`}
        </button>
      </div>`;

    const valEl = document.getElementById('tempo-year-val');
    const sliderEl = document.getElementById('tempo-slider') as HTMLInputElement | null;
    const btnEl = document.getElementById('tempo-confirm-btn');

    const updateYearUi = (next: number) => {
      draftYear = clampYear(next);
      if (valEl) valEl.textContent = String(draftYear);
      if (sliderEl && Number(sliderEl.value) !== draftYear) sliderEl.value = String(draftYear);
      if (btnEl) {
        btnEl.textContent =
          priv.myYear === draftYear ? `✓ Anno ${draftYear} confermato` : priv.myYear !== null ? `🔄 Aggiorna a ${draftYear}` : `🕰️ Conferma anno ${draftYear}`;
      }
    };

    sliderEl?.addEventListener('input', () => updateYearUi(Number(sliderEl.value)));
    ctx.onClick(async (t) => {
      const deltaStr = t.closest<HTMLElement>('[data-delta]')?.dataset.delta;
      if (deltaStr !== undefined) {
        navigator.vibrate?.(10);
        updateYearUi(draftYear + Number(deltaStr));
        return;
      }
      if (t.closest('[data-act="confirm-year"]')) {
        navigator.vibrate?.(25);
        const ok = await ctx.sendShowAction({ type: 'year', value: draftYear });
        if (ok) ctx.toast(`Anno ${draftYear} confermato!`, true);
      }
    });
    return;
  }

  if (st.step === 'reveal') {
    const mine = st.guesses.find((g) => g.playerId === p.id);
    const errText =
      !mine || mine.error === null
        ? 'Non hai risposto in tempo'
        : mine.error === 0
          ? '🎯 ANNO ESATTO! Bonus +50!'
          : `Hai scelto ${mine.year} (scarto di ${mine.error} ${mine.error === 1 ? 'anno' : 'anni'})`;
    ctx.app.innerHTML = `
      <div class="view center">
        <div class="q-banner">📅 Anno vero: <b>${st.year}</b></div>
        <div class="points ${mine && mine.points > 0 ? '' : 'neg'}">+${mine?.points ?? 0}</div>
        <div class="title">${errText}</div>
        <p class="muted">${esc(st.event)}</p>
      </div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, getShowMeta('tempo'), st, ctx);
}

// ---------------------------------------------------------------------------
// 2. 💞 ANIME GEMELLE
// ---------------------------------------------------------------------------

function renderGemelleController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: GemellePublic, priv: GemellePrivate, ctx: ControllerShowContext): void {
  if (st.step === 'write') {
    if (priv.done) {
      ctx.app.innerHTML = `
        <div class="view center">
          <div class="done pop">✓ Hai chiuso il round (${priv.words.length} parole)!</div>
          <div class="custom-opts">${priv.words.map((w) => `<span class="trait on">${esc(w)}</span>`).join('')}</div>
          <p class="muted">In attesa degli altri giocatori…</p>
        </div>`;
      return;
    }
    const full = priv.words.length >= GEMELLE.MAX_WORDS;
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">${meta.icon} Round ${st.round}/${st.total} · ${priv.words.length}/${GEMELLE.MAX_WORDS} parole</div>
        <div class="title">Parola: «${esc(st.prompt)}»</div>
        <form id="gemelle-form" class="show-inline-form">
          <input name="word" type="text" maxlength="${GEMELLE.WORD_MAX_CHARS}" autocomplete="off" placeholder="${full ? 'Limite raggiunto' : 'Scrivi una parola…'}" ${full ? 'disabled' : 'required'} />
          <button class="btn" type="submit" ${full ? 'disabled' : ''}>Aggiungi ➕</button>
        </form>
        <div class="gemelle-words">
          ${priv.words.length === 0 ? '<small class="muted">Tocca una parola inserita per rimuoverla.</small>' : priv.words.map((w) => `<button type="button" class="trait on" data-remove="${esc(w)}">${esc(w)} ✕</button>`).join('')}
        </div>
        <button class="btn secondary" type="button" data-act="gemelle-done" ${priv.words.length === 0 ? 'disabled' : ''}>✓ Ho finito (${priv.words.length})</button>
      </div>`;

    const form = document.getElementById('gemelle-form') as HTMLFormElement | null;
    const input = form?.querySelector<HTMLInputElement>('input[name="word"]');
    input?.focus();
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input?.value.trim() ?? '';
      if (!text) return;
      navigator.vibrate?.(15);
      const ok = await ctx.sendShowAction({ type: 'word', text });
      if (ok && input) input.value = '';
    });
    ctx.onClick((t) => {
      const rem = t.closest<HTMLElement>('[data-remove]')?.dataset.remove;
      if (rem) return void ctx.sendShowAction({ type: 'removeWord', text: rem });
      if (t.closest('[data-act="gemelle-done"]')) void ctx.sendShowAction({ type: 'done' });
    });
    return;
  }

  if (st.step === 'matches') {
    const myMatches = st.shared.filter((m) => m.by.includes(p.id));
    const pts = st.points[p.id] ?? 0;
    ctx.app.innerHTML = `
      <div class="view center">
        <div class="q-banner">💞 Round ${st.round}/${st.total} · «${esc(st.prompt)}»</div>
        <div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div>
        <div class="title">${myMatches.length ? `${myMatches.length} parole in comune!` : 'Nessuna parola in comune'}</div>
        <div class="custom-opts">${myMatches.map((m) => `<span class="trait on">«${esc(m.word)}» (${m.by.length}x)</span>`).join('')}</div>
      </div>`;
    return;
  }

  if (st.step === 'soulmates') {
    const myPair = st.pairs.find((pair) => pair.a === p.id || pair.b === p.id);
    const partnerId = myPair ? (myPair.a === p.id ? myPair.b : myPair.a) : null;
    ctx.app.innerHTML = `
      <div class="view center">
        <div class="big-icon">💞</div>
        <div class="title">${partnerId ? `Anima Gemella: ${playerName(snap, partnerId)}!` : 'Le Anime Gemelle della Serata'}</div>
        <p class="muted">${myPair ? `Avete scritto ${myPair.common} parole identiche!` : 'Guarda la TV!'}</p>
      </div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}

// ---------------------------------------------------------------------------
// 3. 📊 SCALA DEL NONSENSO
// ---------------------------------------------------------------------------

function renderScalaController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: ScalaPublic, priv: ScalaPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'write') {
    const t = priv.target;
    const targetText = !t ? '?' : t.lo === t.hi ? `${t.lo} su 10` : `tra ${t.lo} e ${t.hi} su 10`;
    ctx.app.innerHTML = `
      <form class="view" id="scala-form">
        <div class="q-banner">🎯 Numero segreto: <b>${targetText}</b></div>
        <div class="title">${esc(priv.theme?.text ?? 'Scrivi un esempio')}</div>
        <p class="muted">Scala 1–10: quanto è <b>${esc(priv.theme?.scale ?? '')}</b>?</p>
        <input name="answer" type="text" maxlength="${SCALA.MAX_CHARS}" autocomplete="off" value="${esc(priv.myAnswer ?? '')}" placeholder="Scrivi un esempio che valga ${targetText}…" required />
        <button class="btn big ${priv.myAnswer ? 'is-ready' : 'pink'}" type="submit">${priv.myAnswer ? '✓ Risposta inviata · Aggiorna' : '📊 Invia risposta'}</button>
      </form>`;
    const form = document.getElementById('scala-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector<HTMLInputElement>('input[name="answer"]')!.value.trim();
      if (!text) return;
      const ok = await ctx.sendShowAction({ type: 'answer', text });
      if (ok) ctx.toast('Risposta inviata!', true);
    });
    return;
  }

  if (st.step === 'guess') {
    if (priv.isAuthor || st.authorId === p.id) {
      ctx.app.innerHTML = `<div class="view center"><div class="big-icon">🤫</div><div class="title">Questa è la tua risposta!</div><p class="muted">«${esc(st.answer)}»</p></div>`;
      return;
    }
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">📊 Risposta di ${playerName(snap, st.authorId)} (${st.index}/${st.count})</div>
        <div class="title">«${esc(st.answer)}»</div>
        <p class="muted">${esc(st.theme.text)} — Quanto è <b>${esc(st.theme.scale)}</b> da 1 a 10?</p>
        <div class="scala-num-grid">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<button class="btn ${priv.myGuess === n ? 'pink' : 'secondary'}" data-guess="${n}">${n}</button>`).join('')}
        </div>
      </div>`;
    ctx.onClick((t) => {
      const g = t.closest<HTMLElement>('[data-guess]')?.dataset.guess;
      if (g) void ctx.sendShowAction({ type: 'guess', value: Number(g) });
    });
    return;
  }

  if (st.step === 'reveal') {
    const isAuth = st.authorId === p.id;
    const myG = st.guesses.find((g) => g.playerId === p.id);
    const pts = isAuth ? st.authorPoints : myG?.points ?? 0;
    const targetText = st.target.lo === st.target.hi ? `${st.target.lo}/10` : `${st.target.lo}–${st.target.hi}/10`;
    ctx.app.innerHTML = `
      <div class="view center">
        <div class="q-banner">🎯 Valore segreto: <b>${targetText}</b></div>
        <div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div>
        <div class="title">${isAuth ? 'Punti autore!' : myG?.value ? `Hai votato ${myG.value}/10` : 'Non hai votato'}</div>
      </div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}

// ---------------------------------------------------------------------------
// 4. 🎭 FUFFA D'AUTORE
// ---------------------------------------------------------------------------

function renderBluffController(_snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: BluffPublic, priv: BluffPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'lie') {
    if (priv.myLie !== null) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">🎭 Bugia pronta!</div><div class="q-banner">«${esc(priv.myLie)}»</div><p class="muted">In attesa degli altri…</p></div>`;
      return;
    }
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">${meta.icon} Domanda ${st.number}/${st.total} ${st.double ? '· 🔥 PUNTI DOPPI' : ''}</div>
        <div class="title">${esc(st.question)}</div>
        <form id="bluff-form" class="show-inline-col">
          <input name="lie" type="text" maxlength="${BLUFF.MAX_CHARS}" autocomplete="off" placeholder="Scrivi una bugia credibile…" required />
          <button class="btn big pink" type="submit">🎭 Invia Bugia</button>
        </form>
        ${priv.safeties.length ? `<div class="bluff-safeties"><small class="muted">🆘 Bugia Salvagente (50% punti):</small>${priv.safeties.map((s, i) => `<button type="button" class="btn secondary" data-safety="${i}">🆘 «${esc(s)}»</button>`).join('')}</div>` : ''}
      </div>`;
    const form = document.getElementById('bluff-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector<HTMLInputElement>('input[name="lie"]')!.value.trim();
      if (text) await ctx.sendShowAction({ type: 'lie', text });
    });
    ctx.onClick((t) => {
      const idx = t.closest<HTMLElement>('[data-safety]')?.dataset.safety;
      if (idx !== undefined) void ctx.sendShowAction({ type: 'safety', index: Number(idx) });
    });
    return;
  }

  if (st.step === 'choose') {
    if (priv.myChoice !== null) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Scelta registrata!</div><p class="muted">Guarda la TV per la rivelazione…</p></div>`;
      return;
    }
    const choices = st.options.filter((o) => o.id !== priv.myOptionId);
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">🔍 Trova la VERITÀ!</div>
        <div class="title">${esc(st.question)}</div>
        <div class="cat-grid">${choices.map((o) => `<button class="btn secondary" data-opt="${esc(o.id)}">${esc(o.text)}</button>`).join('')}</div>
      </div>`;
    ctx.onClick((t) => {
      const optId = t.closest<HTMLElement>('[data-opt]')?.dataset.opt;
      if (optId) void ctx.sendShowAction({ type: 'choose', optionId: optId });
    });
    return;
  }

  if (st.step === 'reveal') {
    const pts = st.points[p.id] ?? 0;
    const truth = st.options.find((o) => o.isTruth);
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">✅ Verità: <b>${esc(truth?.text ?? '')}</b></div><div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div></div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}

// ---------------------------------------------------------------------------
// 5. 🕵️ L'IMPOSTORE
// ---------------------------------------------------------------------------

function renderImpostorRoleBanner(category: string, priv: ImpostorPrivate): string {
  if (!priv.role) return '';
  if (impostorRoleHidden) return `<button type="button" class="q-banner impostor-role-btn" data-act="toggle-role">👁️ Tocca per mostrare il ruolo segreto</button>`;
  return priv.role === 'impostor'
    ? `<button type="button" class="q-banner impostor-role-btn is-impostor" data-act="toggle-role">🕵️ <b>SEI L'IMPOSTORE!</b> · Categoria: <b>${esc(category)}</b> <small>(nascondi)</small></button>`
    : `<button type="button" class="q-banner impostor-role-btn is-crew" data-act="toggle-role">🔍 Parola: <b>«${esc(priv.word ?? '')}»</b> (${esc(category)}) <small>(nascondi)</small></button>`;
}

function renderImpostorController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: ImpostorPublic, priv: ImpostorPrivate, ctx: ControllerShowContext): void {
  const bindToggle = () => {
    if (impostorRoleHidden) impostorRoleHidden = false;
    else impostorRoleHidden = true;
    renderImpostorController(snap, p, meta, st, priv, ctx);
  };

  if (st.step === 'secret') {
    impostorRoleHidden = false;
    ctx.app.innerHTML = `
      <div class="view center">
        ${renderImpostorRoleBanner(st.category, priv)}
        <div class="big-icon">${priv.role === 'impostor' ? '🕵️' : '🔍'}</div>
        <div class="title">${priv.role === 'impostor' ? 'Non conosci la parola segreta!' : `La parola è «${esc(priv.word ?? '')}»`}</div>
        <p class="muted">Categoria: <b>${esc(st.category)}</b></p>
      </div>`;
    ctx.onClick((t) => { if (t.closest('[data-act="toggle-role"]')) bindToggle(); });
    return;
  }

  if (st.step === 'clue') {
    if (priv.myClue) {
      ctx.app.innerHTML = `<div class="view center">${renderImpostorRoleBanner(st.category, priv)}<div class="done pop">✓ Indizio: «${esc(priv.myClue)}»</div></div>`;
      ctx.onClick((t) => { if (t.closest('[data-act="toggle-role"]')) bindToggle(); });
      return;
    }
    ctx.app.innerHTML = `
      <div class="view">
        ${renderImpostorRoleBanner(st.category, priv)}
        <div class="title">Scrivi un indizio di UNA SOLA PAROLA</div>
        <form id="impostor-clue-form" class="show-inline-col">
          <input name="clue" type="text" maxlength="${IMPOSTOR.CLUE_MAX_CHARS}" autocomplete="off" placeholder="Una sola parola…" required />
          <button class="btn big pink" type="submit">Invia Indizio 🔍</button>
        </form>
      </div>`;
    const form = document.getElementById('impostor-clue-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const word = form.querySelector<HTMLInputElement>('input[name="clue"]')!.value.trim().split(/\s+/)[0] ?? '';
      if (word) await ctx.sendShowAction({ type: 'clue', text: word });
    });
    ctx.onClick((t) => { if (t.closest('[data-act="toggle-role"]')) bindToggle(); });
    return;
  }

  if (st.step === 'discuss') {
    const isReady = st.ready.includes(p.id);
    ctx.app.innerHTML = `
      <div class="view">
        ${renderImpostorRoleBanner(st.category, priv)}
        <div class="title">🗣️ Discutete gli indizi!</div>
        <div class="custom-opts">${st.clues.map((c) => `<span class="trait on"><b>${playerName(snap, c.playerId)}:</b> «${esc(c.clue ?? '…')}»</span>`).join('')}</div>
        <button class="btn big ${isReady ? 'is-ready' : 'pink'}" data-act="imp-ready" ${isReady ? 'disabled' : ''}>${isReady ? '✓ Pronto a votare' : '🗳️ Sono pronto a votare'}</button>
      </div>`;
    ctx.onClick((t) => {
      if (t.closest('[data-act="toggle-role"]')) return bindToggle();
      if (t.closest('[data-act="imp-ready"]')) void ctx.sendShowAction({ type: 'ready' });
    });
    return;
  }

  if (st.step === 'vote') {
    const suspects = snap.players.filter((o) => o.id !== p.id && o.connected);
    ctx.app.innerHTML = `
      <div class="view">
        ${renderImpostorRoleBanner(st.category, priv)}
        <div class="title">🗳️ Chi è l'Impostore?</div>
        <div class="target-list">
          ${suspects.map((o) => {
            const clue = st.clues.find((c) => c.playerId === o.id)?.clue;
            const picked = priv.myVote === o.id;
            return `<button class="target-btn ${picked ? 'on' : ''}" data-suspect="${o.id}" style="--pc:${playerColor(snap, o.id)};${playerShapeCss(snap, o.id)}"><b>${picked ? '✓ ' : ''}${esc(o.name)}</b><small>Indizio: «${esc(clue ?? '—')}»</small></button>`;
          }).join('')}
        </div>
      </div>`;
    ctx.onClick((t) => {
      if (t.closest('[data-act="toggle-role"]')) return bindToggle();
      const targetId = t.closest<HTMLElement>('[data-suspect]')?.dataset.suspect;
      if (targetId) void ctx.sendShowAction({ type: 'vote', targetId });
    });
    return;
  }

  if (st.step === 'guess') {
    if (st.impostorId === p.id) {
      ctx.app.innerHTML = `
        <form class="view" id="impostor-guess-form">
          <div class="q-banner">🚨 Ti hanno scoperto! Ultima chance!</div>
          <div class="title">Qual era la parola segreta di «${esc(st.category)}»?</div>
          <input name="guess" type="text" maxlength="32" autocomplete="off" placeholder="Indovina la parola segreta…" required />
          <button class="btn big pink" type="submit">🎯 Tenta il tutto per tutto!</button>
        </form>`;
      const form = document.getElementById('impostor-guess-form') as HTMLFormElement | null;
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = form.querySelector<HTMLInputElement>('input[name="guess"]')!.value.trim();
        if (text) await ctx.sendShowAction({ type: 'guess', text });
      });
      return;
    }
    ctx.app.innerHTML = `<div class="view center"><div class="big-icon">🚨</div><div class="title">${playerName(snap, st.impostorId)} è l'Impostore!</div><p class="muted">Sta provando a indovinare la parola segreta…</p></div>`;
    return;
  }

  if (st.step === 'reveal') {
    const pts = st.points[p.id] ?? 0;
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">Parola: <b>«${esc(st.word)}»</b> · Impostore: <b>${playerName(snap, st.impostorId)}</b></div><div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div></div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}