import { type BluffPublic } from '../../shared/bluff';
import { GEMELLE, type GemellePublic } from '../../shared/gemelle';
import { IMPOSTOR, type ImpostorPublic } from '../../shared/impostor';
import { SCALA, type ScalaPublic } from '../../shared/scala';
import { getShowMeta, type ShowFinal, type ShowId, type ShowMeta } from '../../shared/shows';
import { type SocialPublic } from '../../shared/social';
import { SONDAGGI, type SondaggiPublic } from '../../shared/sondaggi';
import { TEMPO, type TempoPublic } from '../../shared/tempo';
import type { PlayerPublic, RoomSnapshot } from '../../shared/types';
import { esc } from '../common/net';
import { renderHostShowBatch2 } from './host-shows-2';

type NameFn = (id: string | null | undefined) => string;
type ColorFn = (id: string) => string;

/** Chiave di rendering per lo schermo principale quando `phaseData.phase === 'SHOW'`. */
export function showRenderKey(s: RoomSnapshot): string {
  const showId = s.phaseData.phase === 'SHOW' ? s.phaseData.show : s.show?.id ?? 'quiz';
  return `SHOW|${showId}|${JSON.stringify(s.show?.state ?? null)}|${s.endsAt}`;
}

/** Rende il pannello TV per qualunque Show dell'Hub Multi-Gioco. */
export function renderHostShow(s: RoomSnapshot, nameOf: NameFn, colorOf: ColorFn): string {
  const showId: ShowId = s.phaseData.phase === 'SHOW' ? s.phaseData.show : s.show?.id ?? 'quiz';
  const raw = s.show?.state;
  const meta = getShowMeta(showId);

  if (!raw || typeof raw !== 'object' || !('step' in raw)) {
    return `<div class="phase-title pop">${meta.icon} ${esc(meta.name)}</div><div class="sub">Preparazione del round…</div>`;
  }

  switch (showId) {
    case 'tempo':
      return renderTempoHost(s, raw as TempoPublic, nameOf, colorOf);
    case 'gemelle':
      return renderGemelleHost(s, meta, raw as GemellePublic, nameOf, colorOf);
    case 'scala':
      return renderScalaHost(s, meta, raw as ScalaPublic, nameOf, colorOf);
    case 'bluff':
      return renderBluffHost(s, meta, raw as BluffPublic, nameOf, colorOf);
    case 'impostor':
      return renderImpostorHost(s, meta, raw as ImpostorPublic, nameOf, colorOf);
    case 'social':
      return renderSocialHost(s, meta, raw as SocialPublic, nameOf, colorOf);
    case 'sondaggi':
      return renderSondaggiHost(s, meta, raw as SondaggiPublic, nameOf, colorOf);
    default:
      return renderHostShowBatch2(s, showId, meta, raw, nameOf, colorOf, renderShowFinalHost, renderPlayerChips);
  }
}

/** Classifica finale comune a tutti gli Show basati su ShowFinal. */
function renderShowFinalHost(meta: ShowMeta, st: ShowFinal, nameOf: NameFn): string {
  const winner = st.ranking[0];
  return `
    <div class="show-stage pop">
      <div class="mg-badge gold">${meta.icon} ${esc(meta.name)} · CLASSIFICA FINALE</div>
      ${winner ? `<div class="phase-title">🏆 Vince ${nameOf(winner.playerId)} con ${winner.points.toLocaleString('it-IT')} punti!</div>` : ''}
      <div class="num-Wait">
        ${st.ranking
          .map(
            (r, i) => `
            <div class="num-row pop ${i === 0 ? 'best' : ''}" style="animation-delay:${i * 0.08}s">
              <span>${i + 1}°</span>
              <b>${nameOf(r.playerId)}</b>
              <span></span>
              <em class="up">${r.points.toLocaleString('it-IT')} pti</em>
            </div>`
          )
          .join('')}
      </div>
      <div class="sub">Tra pochi secondi si torna automaticamente al Party Hub…</div>
      <button class="btn" data-act="restart">🏠 Torna subito al Party Hub</button>
    </div>`;
}

function renderPlayerChips(s: RoomSnapshot, actedIds: string[], colorOf: ColorFn, extra?: (p: PlayerPublic) => string): string {
  const online = s.players.filter((p) => p.connected);
  return `
    <div class="tempo-players-status">
      ${online
        .map((p) => {
          const done = actedIds.includes(p.id);
          return `<span class="start-chip ${done ? 'done-chip pop' : 'waiting-chip'}" style="--pc:${colorOf(p.id)}">
            ${done ? '✓' : '⏳'} ${esc(p.name)}${extra ? ` ${extra(p)}` : ''}
          </span>`;
        })
        .join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// 1. 🕰️ MACCHINA DEL TEMPO (Time Jinx)
// ---------------------------------------------------------------------------

// Etichette della linea del tempo: sopra/sotto la barra su 2 livelli per lato. Ogni pedina va nel primo
// livello libero (ultima etichetta lontana almeno MIN_GAP punti %), altrimenti in quello meno affollato.
const TEMPO_PIN_LEVELS = [-36, 36, -70, 70];
function tempoPinLayout<T>(items: { g: T; pos: number }[]): { g: T; pos: number; dy: number }[] {
  const MIN_GAP = 13;
  const last = TEMPO_PIN_LEVELS.map(() => -Infinity);
  return items
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((it) => {
      let lvl = last.findIndex((p) => it.pos - p >= MIN_GAP);
      if (lvl < 0) lvl = last.indexOf(Math.min(...last));
      last[lvl] = it.pos;
      return { ...it, dy: TEMPO_PIN_LEVELS[lvl] };
    });
}

function renderTempoHost(s: RoomSnapshot, st: TempoPublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'question': {
      const online = s.players.filter((p) => p.connected);
      return `
        <div class="qcard tempo-stage pop">
          <div class="qhead">
            <span class="chip" style="background:#f4a261;color:#14063a">🕰️ Macchina del Tempo</span>
            <span class="chip">Evento ${st.number}/${st.total}</span>
            <span class="chip">Risposte: <b data-live>${st.answered}/${online.length}</b></span>
          </div>
          <h1 class="qtext">${esc(st.event)}</h1>
          <div class="sub big">📱 Scegliete l'anno sul vostro telefono (${TEMPO.MIN_YEAR} – ${TEMPO.MAX_YEAR})!</div>
          ${renderPlayerChips(s, online.filter((p) => p.hasActed).map((p) => p.id), colorOf)}
        </div>`;
    }

    case 'reveal': {
      const years = [st.year, ...st.guesses.map((g) => g.year).filter((y): y is number => y !== null)];
      const minY = Math.max(TEMPO.MIN_YEAR, Math.min(...years) - 25);
      const maxY = Math.min(TEMPO.MAX_YEAR, Math.max(...years) + 25);
      const span = Math.max(10, maxY - minY);
      const posOf = (y: number) => Math.max(4, Math.min(96, ((y - minY) / span) * 100));
      const sorted = st.guesses.slice().sort((a, b) => (a.error ?? 9999) - (b.error ?? 9999));
      const pins = tempoPinLayout(st.guesses.filter((g) => g.year !== null).map((g) => ({ g, pos: posOf(g.year!) })));

      return `
        <div class="qcard tempo-stage pop">
          <div class="qhead">
            <span class="chip" style="background:#f4a261;color:#14063a">🕰️ Evento ${st.number}/${st.total}</span>
            <span class="chip hot">Anno esatto: ${st.year}</span>
          </div>
          <h1 class="qtext">${esc(st.event)}</h1>
          <div class="big-answer pop">📅 ${st.year}</div>

          <div class="tempo-timeline">
            <div class="tempo-axis">
              <span class="tempo-bound left">${minY}</span>
              <span class="tempo-bound right">${maxY}</span>
            </div>
            <div class="tempo-track reveal">
              <div class="tempo-true-pin" style="left:${posOf(st.year)}%">
                <span class="tempo-true-line"></span>
                <span class="tempo-true-mark pop">🎯</span>
              </div>
              ${pins
                .map(
                  ({ g, pos, dy }, idx) => `
                  <div class="tempo-pin" style="left:${pos}%;--pc:${colorOf(g.playerId)};--dy:${dy}px">
                    <div class="tempo-pin-body pop" style="animation-delay:${0.12 + idx * 0.08}s">
                      <span class="tempo-pin-stem"></span>
                      <span class="tempo-pin-dot"></span>
                      <span class="tempo-pin-tag">${nameOf(g.playerId)} · ${g.year}</span>
                    </div>
                  </div>`
                )
                .join('')}
            </div>
          </div>

          <div class="num-Wait tempo-results">
            ${sorted
              .map(
                (g, i) => `
                <div class="num-row pop ${g.error === 0 ? 'best' : i === 0 && g.points > 0 ? 'best' : ''}" style="animation-delay:${i * 0.08}s">
                  <span>${g.error === 0 ? '🎯' : `${i + 1}°`}</span>
                  <b>${nameOf(g.playerId)}</b>
                  <span>${
                    g.year === null
                      ? 'nessuna risposta'
                      : `${g.year} <small class="muted">(${g.error === 0 ? 'ANNO ESATTO!' : `scarto ${g.error} ${g.error === 1 ? 'anno' : 'anni'}`})</small>`
                  }</span>
                  <em class="up">${g.points > 0 ? `+${g.points}` : '0'}</em>
                </div>`
              )
              .join('')}
          </div>
        </div>`;
    }

    case 'final': {
      const winner = st.ranking[0];
      return `
        <div class="qcard tempo-stage pop">
          <div class="mg-badge gold">🕰️ CLASSIFICA MACCHINA DEL TEMPO</div>
          ${winner ? `<div class="phase-title">Vince ${nameOf(winner.playerId)} con ${winner.points.toLocaleString('it-IT')} punti!</div>` : ''}
          <div class="num-Wait tempo-results">
            ${st.ranking
              .map(
                (r, i) => `
                <div class="num-row pop ${i === 0 ? 'best' : ''}" style="animation-delay:${i * 0.09}s">
                  <span>${i + 1}°</span>
                  <b>${nameOf(r.playerId)}</b>
                  <span>🎯 ${r.exact} esatti · <small class="muted">errore tot: ${r.totalError} anni</small></span>
                  <em class="up">${r.points.toLocaleString('it-IT')} pti</em>
                </div>`
              )
              .join('')}
          </div>
          <div class="sub">Tra pochi secondi si torna automaticamente al Party Hub…</div>
          <button class="btn" data-act="restart">🏠 Torna subito al Party Hub</button>
        </div>`;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. 💞 ANIME GEMELLE (MegaPals)
// ---------------------------------------------------------------------------

function renderGemelleHost(s: RoomSnapshot, meta: ShowMeta, st: GemellePublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'write': {
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} ${esc(meta.name)}</span>
            <span class="chip">Round ${st.round}/${st.total}</span>
            <span class="chip">Max ${GEMELLE.MAX_WORDS} parole</span>
          </div>
          <div class="sub">Scrivete tutte le parole che vi vengono in mente per:</div>
          <div class="big-answer pop">«${esc(st.prompt)}»</div>
          ${renderPlayerChips(s, st.done, colorOf, (p) => `<b>(${st.counts[p.id] ?? 0})</b>`)}
        </div>`;
    }

    case 'matches': {
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total}</span>
            <span class="chip hot">Parola: «${esc(st.prompt)}»</span>
          </div>
          <div class="phase-title">💞 Parole in Comune!</div>
          ${
            st.shared.length === 0
              ? `<div class="sub big">😱 Nessuna parola in comune in questo round! Siete su lunghezze d'onda diverse!</div>`
              : `<div class="show-cards-grid">
                  ${st.shared
                    .map(
                      (m, i) => `
                      <div class="show-card match-card pop" style="animation-delay:${i * 0.1}s">
                        <div class="match-word">«${esc(m.word)}»</div>
                        <div class="match-pts">+${(m.by.length - 1) * GEMELLE.POINTS_PER_MATCH} pti a testa</div>
                        <div class="match-authors">
                          ${m.by.map((id) => `<span class="start-chip" style="--pc:${colorOf(id)}">${nameOf(id)}</span>`).join('')}
                        </div>
                      </div>`
                    )
                    .join('')}
                </div>`
          }
        </div>`;
    }

    case 'soulmates': {
      return `
        <div class="qcard show-stage pop">
          <div class="mg-badge gold">💞 LE ANIME GEMELLE DELLA SERATA</div>
          ${
            st.pairs.length === 0 || st.pairs[0].common === 0
              ? `<div class="phase-title">Nessuna coppia ha trovato parole in comune! 😅</div>`
              : st.pairs
                  .map(
                    (pair, i) => `
                    <div class="soulmate-banner pop" style="animation-delay:${i * 0.15}s">
                      <span class="soulmate-name">${nameOf(pair.a)}</span>
                      <span class="soulmate-heart">💖</span>
                      <span class="soulmate-name">${nameOf(pair.b)}</span>
                      <div class="sub big"><b>${pair.common}</b> ${pair.common === 1 ? 'parola' : 'parole'} in comune!</div>
                    </div>`
                  )
                  .join('')
          }
        </div>`;
    }

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 3. 📊 SCALA DEL NONSENSO (Nonsensory)
// ---------------------------------------------------------------------------

function renderScalaHost(s: RoomSnapshot, meta: ShowMeta, st: ScalaPublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'write':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} ${esc(meta.name)}</span>
            <span class="chip">Round ${st.round}/${st.total}</span>
            <span class="chip">${st.round === 1 ? '🎯 Numero esatto (1–10)' : '🎯 Intervallo di 3 numeri'}</span>
          </div>
          <h1 class="qtext">Scrivete sul telefono una risposta che valga esattamente il vostro numero segreto!</h1>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'guess':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total} · ${st.index}/${st.count}</span>
            <span class="chip hot">Autore: ${nameOf(st.authorId)}</span>
          </div>
          <div class="sub">${esc(st.theme.text)} — Scala 1–10: quanto è <b>${esc(st.theme.scale)}</b>?</div>
          <div class="big-answer pop">«${esc(st.answer)}»</div>
          <div class="scala-bar">
            ${Array.from({ length: 10 }, (_, i) => i + 1)
              .map((n) => `<div class="scala-cell"><span>${n}</span></div>`)
              .join('')}
          </div>
          ${renderPlayerChips(
            s.players.filter((p) => p.id !== st.authorId) as unknown as RoomSnapshot['players'] extends infer T ? { players: T } & RoomSnapshot : never,
            st.guessed,
            colorOf
          )}
        </div>`;

    case 'reveal': {
      const targetLabel = st.target.lo === st.target.hi ? `${st.target.lo}` : `${st.target.lo}–${st.target.hi}`;
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Autore: ${nameOf(st.authorId)} (+${st.authorPoints} pti)</span>
            <span class="chip hot">🎯 Segreto: ${targetLabel}/10</span>
          </div>
          <div class="sub">${esc(st.theme.text)} (quanto è <b>${esc(st.theme.scale)}</b>)</div>
          <div class="big-answer pop">«${esc(st.answer)}» → 🎯 ${targetLabel}/10</div>
          <div class="scala-bar">
            ${Array.from({ length: 10 }, (_, i) => i + 1)
              .map((n) => {
                const inTarget = n >= st.target.lo && n <= st.target.hi;
                const here = st.guesses.filter((g) => g.value === n);
                return `
                  <div class="scala-cell ${inTarget ? 'target' : ''}">
                    <span>${n}</span>
                    <div class="scala-pins">
                      ${here.map((g) => `<em class="scala-pin" style="background:${colorOf(g.playerId)}">${nameOf(g.playerId)}</em>`).join('')}
                    </div>
                  </div>`;
              })
              .join('')}
          </div>
          <div class="num-Wait">
            ${st.guesses
              .map(
                (g, i) => `
                <div class="num-row pop ${g.points >= SCALA.GUESS_POINTS[0] ? 'best' : ''}" style="animation-delay:${i * 0.07}s">
                  <span>${g.value !== null ? `${g.value}/10` : '—'}</span>
                  <b>${nameOf(g.playerId)}</b>
                  <span></span>
                  <em class="up">+${g.points}</em>
                </div>`
              )
              .join('')}
          </div>
        </div>`;
    }

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 4. 🎭 FUFFA D'AUTORE (Fibbage)
// ---------------------------------------------------------------------------

function formatBlank(text: string): string {
  return esc(text).replace(/___+/g, '<span class="bluff-blank">______</span>');
}

function renderBluffHost(s: RoomSnapshot, meta: ShowMeta, st: BluffPublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'lie':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Domanda ${st.number}/${st.total}</span>
            ${st.double ? '<span class="chip hot">🔥 PUNTI DOPPI!</span>' : ''}
          </div>
          <h1 class="qtext">${formatBlank(st.question)}</h1>
          <div class="sub big">📱 Scrivete una bugia credibile sul telefono per ingannare gli amici!</div>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'choose':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Domanda ${st.number}/${st.total}</span>
            ${st.double ? '<span class="chip hot">🔥 PUNTI DOPPI!</span>' : ''}
            <span class="chip">Qual è la VERITÀ?</span>
          </div>
          <h1 class="qtext">${formatBlank(st.question)}</h1>
          <div class="opts ${st.options.length > 6 ? 'two-col' : ''}">
            ${st.options
              .map(
                (o, i) => `
                <div class="opt pop" style="animation-delay:${i * 0.06}s">
                  <span class="opt-letter">${String.fromCharCode(65 + i)}</span>
                  <span class="opt-text">${esc(o.text)}</span>
                </div>`
              )
              .join('')}
          </div>
          ${renderPlayerChips(s, st.chosen, colorOf)}
        </div>`;

    case 'reveal':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Rivelazione ${st.number}/${st.total}</span>
            ${st.double ? '<span class="chip hot">🔥 PUNTI DOPPI!</span>' : ''}
          </div>
          <h1 class="qtext">${formatBlank(st.question)}</h1>
          <div class="opts">
            ${st.options
              .map((o, i) => {
                const authorLabel = o.isTruth
                  ? '✅ VERITÀ'
                  : o.authors.length
                    ? `🎭 Bugia di ${o.authors.map(nameOf).join(', ')}`
                    : '🏠 Bugia della casa';
                return `
                  <div class="opt ${o.isTruth ? 'correct' : o.pickedBy.length ? 'fooled' : 'dim'} pop" style="animation-delay:${i * 0.1}s">
                    <span class="opt-letter">${o.isTruth ? '✓' : '🎭'}</span>
                    <div class="opt-body">
                      <div class="opt-text">${esc(o.text)}</div>
                      <small class="opt-meta">${authorLabel}</small>
                    </div>
                    <div class="voters">
                      ${o.pickedBy.map((id) => `<em>${nameOf(id)}</em>`).join('')}
                    </div>
                  </div>`;
              })
              .join('')}
          </div>
        </div>`;

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 5. 🕵️ L'IMPOSTORE
// ---------------------------------------------------------------------------

function renderImpostorHost(s: RoomSnapshot, meta: ShowMeta, st: ImpostorPublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'secret':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total}</span>
            <span class="chip hot">Categoria: ${esc(st.category)}</span>
          </div>
          <h1 class="qtext">🤫 Guardate in segreto il vostro telefono!</h1>
          <div class="sub big">Tutti vedono la parola segreta… tranne <b>l'Impostore</b>!</div>
        </div>`;

    case 'clue':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total}</span>
            <span class="chip hot">Categoria: ${esc(st.category)}</span>
          </div>
          <h1 class="qtext">Scrivete un indizio di UNA SOLA PAROLA!</h1>
          <div class="sub">Fate capire agli alleati che conoscete la parola, ma non regolatela all'Impostore.</div>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'discuss':
    case 'vote':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Categoria: ${esc(st.category)}</span>
            <span class="chip hot">${st.step === 'discuss' ? '🗣️ Discussione a voce!' : '🗳️ Votate il sospettato!'}</span>
          </div>
          <div class="show-cards-grid">
            ${st.clues
              .map(
                (c, i) => `
                <div class="show-card clue-card pop" style="--pc:${colorOf(c.playerId)};animation-delay:${i * 0.08}s">
                  <div class="clue-author">${nameOf(c.playerId)}</div>
                  <div class="clue-word">${c.clue ? `«${esc(c.clue)}»` : '…'}</div>
                </div>`
              )
              .join('')}
          </div>
          ${renderPlayerChips(s, st.step === 'discuss' ? st.ready : st.voted, colorOf)}
        </div>`;

    case 'guess':
      return `
        <div class="qcard show-stage pop">
          <div class="mg-badge sabotage">🚨 IMPOSTORE SMASCHERATO!</div>
          <h1 class="qtext">${nameOf(st.impostorId)} è stato scoperto!</h1>
          <div class="sub big">Ultima chance: se indovina la parola segreta della categoria <b>«${esc(st.category)}»</b>, ruba la vittoria!</div>
        </div>`;

    case 'reveal': {
      const outcome = !st.caught
        ? `🕵️ ${nameOf(st.impostorId)} l'ha fatta franca! (+${IMPOSTOR.IMPOSTOR_POINTS} pti)`
        : st.guessedRight
          ? `🕵️ ${nameOf(st.impostorId)} è stato scoperto ma ha indovinato «${esc(st.impostorGuess ?? '')}»! (+${IMPOSTOR.IMPOSTOR_POINTS} pti)`
          : `🎉 Squadra vittoriosa! ${nameOf(st.impostorId)} è stato smascherato${st.impostorGuess ? ` (ha tentato «${esc(st.impostorGuess)}»)` : ''}!`;
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total}</span>
            <span class="chip hot">Parola segreta: «${esc(st.word)}»</span>
          </div>
          <h1 class="qtext">${outcome}</h1>
          <div class="num-Wait">
            ${st.votes
              .map(
                (v) => `
                <div class="num-row pop">
                  <span>🗳️</span>
                  <b>${nameOf(v.playerId)}</b>
                  <span>ha votato <b>${v.targetId ? nameOf(v.targetId) : 'nessuno'}</b></span>
                  <em class="up">+${st.points[v.playerId] ?? 0}</em>
                </div>`
              )
              .join('')}
          </div>
        </div>`;
    }

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 6. 📸 CHI DI NOI? (Social / Consenso)
// ---------------------------------------------------------------------------

function renderSocialHost(s: RoomSnapshot, meta: ShowMeta, st: SocialPublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'vote':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Domanda ${st.number}/${st.total}</span>
            <span class="chip">Vota un amico sul telefono!</span>
          </div>
          <h1 class="qtext">${esc(st.question)}</h1>
          ${renderPlayerChips(s, st.voted, colorOf)}
        </div>`;

    case 'reveal': {
      const counts: Record<string, string[]> = {};
      for (const v of st.votes) {
        if (!v.targetId) continue;
        (counts[v.targetId] ??= []).push(v.playerId);
      }
      const sortedTargets = Object.entries(counts).sort((a, b) => b[1].length - a[1].length);
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Risultato ${st.number}/${st.total}</span>
          </div>
          <h1 class="qtext">${esc(st.question)}</h1>
          ${
            st.winners.length
              ? `<div class="big-answer pop">👑 ${st.winners.map(nameOf).join(' & ')}</div>`
              : `<div class="sub big">Nessuna maggioranza assoluta: siete tutti divisi!</div>`
          }
          <div class="num-Wait">
            ${sortedTargets
              .map(
                ([targetId, voters], i) => `
                <div class="num-row pop ${st.winners.includes(targetId) ? 'best' : ''}" style="animation-delay:${i * 0.08}s">
                  <span>${st.winners.includes(targetId) ? '👑' : `${voters.length}v`}</span>
                  <b>${nameOf(targetId)}</b>
                  <span>votato da ${voters.map(nameOf).join(', ')}</span>
                  <em class="up">+${st.points[targetId] ?? 0}</em>
                </div>`
              )
              .join('')}
          </div>
        </div>`;
    }

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 7. ⛏️ MINIERA DEI SONDAGGI (The Poll Mine)
// ---------------------------------------------------------------------------

function renderSondaggiHost(s: RoomSnapshot, meta: ShowMeta, st: SondaggiPublic, nameOf: NameFn, colorOf: ColorFn): string {
  switch (st.step) {
    case 'poll':
    case 'guess':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Round ${st.number}/${st.total}</span>
            <span class="chip hot">${
              st.step === 'poll'
                ? `📊 Fase 1: Scegli le tue ${SONDAGGI.PICKS} preferite in ordine!`
                : `🔮 Fase 2: Indovina la TOP ${SONDAGGI.PICKS} del gruppo!`
            }</span>
          </div>
          <h1 class="qtext">${esc(st.question)}</h1>
          <div class="opts two-col">
            ${st.options
              .map(
                (opt, i) => `
                <div class="opt pop" style="animation-delay:${i * 0.04}s">
                  <span class="opt-letter">${i + 1}</span>
                  <span class="opt-text">${esc(opt)}</span>
                </div>`
              )
              .join('')}
          </div>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'reveal': {
      const medals = ['🥇 1°', '🥈 2°', '🥉 3°'];
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Classifica del Sondaggio ${st.number}/${st.total}</span>
          </div>
          <h1 class="qtext">${esc(st.question)}</h1>
          <div class="num-Wait">
            ${st.ranking
              .slice(0, 5)
              .map((r, i) => {
                const topIdx = st.top.indexOf(r.index);
                return `
                  <div class="num-row pop ${topIdx >= 0 ? 'best' : ''}" style="animation-delay:${i * 0.08}s">
                    <span>${topIdx >= 0 ? medals[topIdx] : `${i + 1}°`}</span>
                    <b>${esc(st.options[r.index] ?? '')}</b>
                    <span>${ topIdx >= 0 ? `Vale +${SONDAGGI.RANK_POINTS[topIdx]} pti` : '' }</span>
                    <em class="up">${r.score} pt</em>
                  </div>`;
              })
              .join('')}
          </div>
        </div>`;
    }

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
