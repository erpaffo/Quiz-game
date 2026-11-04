// 🕵️ L'Impostore Tascabile — giro segreto con lo Scudo, discussione a tempo, voto e ultima possibilità.

import { CHAMELEON_PAIRS } from '../data/impostore';
import { IMPOSTORE_WORDS, dealImpostore, hasLastChance, pairKey, wordKey, impostorePoints, isCaught, outcomeOf, type ImpostoreDeal } from '../logic/impostore';
import type { PassGame, Player } from '../types';
import { esc, pointsList, screen, shield, tag, Timers } from '../ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const impostore: PassGame = (ctx) => {
  const t = new Timers();
  const rounds = Number(ctx.options.rounds) || 3;
  const talk = Number(ctx.options.talk) || 150;
  const points: Record<string, number> = {};
  let round = 0;
  let deal: ImpostoreDeal;
  const byId = (id: string) => ctx.players.find((p) => p.id === id)!;
  const decks = {
    classico: ctx.deck('impostore', IMPOSTORE_WORDS, wordKey),
    camaleonte: ctx.deck('camaleonte', CHAMELEON_PAIRS, pairKey)
  };

  const startRound = () => {
    round++;
    deal = dealImpostore(ctx.players, { mode: ctx.options.mode, impostors: Number(ctx.options.impostors) || 1 }, Math.random, decks);
    secretTurn(0);
  };

  const secretTurn = (i: number) => {
    if (i >= ctx.players.length) return table();
    const p = ctx.players[i];
    const card = deal.cards.find((c) => c.playerId === p.id)!;
    const secret =
      card.word === null
        ? `<div class="pp-secret-card imp"><div class="pp-muted">Categoria</div><b>${esc(card.category)}</b><div class="pp-role">🕵️ Sei l’IMPOSTORE!</div><small>Non conosci la parola: ascolta gli indizi e mimetizzati.</small></div>`
        : `<div class="pp-secret-card"><div class="pp-muted">Categoria</div><b>${esc(card.category)}</b><div class="pp-muted">La parola segreta è</div><div class="pp-role">${esc(card.word)}</div></div>`;
    shield(ctx.root, {
      player: p,
      title: `Partita ${round} di ${rounds} · carta ${i + 1} di ${ctx.players.length}`,
      secretHtml: secret,
      doneLabel: i + 1 < ctx.players.length ? `Ho visto, passa a ${ctx.players[i + 1].name}` : 'Ho visto: posate il telefono al centro',
      onDone: () => secretTurn(i + 1)
    });
  };

  const table = () => {
    const starter = byId(deal.starterId);
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <h2>📍 Telefono al centro del tavolo</h2>
        <p>Inizia ${tag(starter)}, poi in senso orario: <b>una sola parola</b> a testa come indizio.</p>
        <p class="pp-note">${deal.mode === 'camaleonte' ? '🦎 Attenzione: il camaleonte ha una parola <b>simile</b> e non sa di essere diverso!' : '🕵️ L’impostore conosce solo la categoria: occhio agli indizi troppo vaghi.'}</p>
        <button class="pp-btn big" data-act="go">⏱️ Avvia la discussione (${mmss(talk)})</button>
      </div>`,
      { go: discuss }
    );
  };

  const discuss = () => {
    const endAt = performance.now() + talk * 1000;
    let last = -1;
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-muted">Discussione · categoria <b>${esc(deal.category)}</b></div>
        <div class="pp-count" data-left>${mmss(talk)}</div>
        <p>Chi è l’impostore? Fate domande, difendetevi, accusate!</p>
        <button class="pp-btn big" data-act="vote">🗳️ Vai subito al voto</button>
      </div>`,
      { vote }
    );
    t.loop(() => {
      const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
      if (left !== last) {
        last = left;
        const el = ctx.root.querySelector('[data-left]');
        if (el) el.textContent = mmss(left);
        if (left <= 10 && left > 0) ctx.sfx.tick();
      }
      if (left <= 0) {
        ctx.sfx.beep(true);
        vote();
        return false;
      }
    });
  };

  const vote = () => {
    t.clear();
    screen(
      ctx.root,
      `<div class="pp-stack">
        <h2>🗳️ Chi accusa il tavolo?</h2>
        <p class="pp-muted">Contate i voti a voce (o per alzata di mano) e toccate il più votato.</p>
        <div class="pp-grid-players">${ctx.players.map((p) => `<button class="pp-player-btn" data-act="accuse" data-id="${p.id}" style="--pc:${p.color}">${esc(p.name)}</button>`).join('')}</div>
      </div>`,
      { accuse: (el) => accused(byId(el.dataset.id!)) }
    );
  };

  const accused = (p: Player) => {
    if (isCaught(deal, p.id) && hasLastChance(deal)) {
      ctx.sfx.good();
      screen(
        ctx.root,
        `<div class="pp-stack">
          <h2>🎯 ${tag(p)} è un impostore!</h2>
          <p>Ultima possibilità: ${esc(p.name)}, qual era la parola segreta?</p>
          <div class="pp-grid-words">${deal.guessOptions.map((w) => `<button class="pp-word-btn" data-act="guess" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>
        </div>`,
        { guess: (el) => reveal(p, el.dataset.w ?? '') }
      );
      return;
    }
    reveal(p, null);
  };

  const reveal = (accusedP: Player, guess: string | null) => {
    const outcome = outcomeOf(deal, accusedP.id, guess);
    const pts = impostorePoints(deal, outcome);
    for (const [id, n] of Object.entries(pts)) {
      points[id] = (points[id] ?? 0) + n;
      ctx.addPoints(id, n);
    }
    if (outcome === 'citizens') ctx.sfx.fanfare();
    else ctx.sfx.boom();
    const imps = deal.impostorIds.map(byId);
    const twin = deal.mode === 'camaleonte' ? deal.cards.find((c) => c.role === 'impostor')?.word : null;
    const why = !isCaught(deal, accusedP.id)
      ? `${tag(accusedP)} era innocente!`
      : guess !== null && guess === deal.secret
        ? `${tag(accusedP)} è stato scoperto… ma ha indovinato la parola!`
        : `${tag(accusedP)} è stato smascherato${guess !== null ? ` e ha sbagliato la parola (${esc(guess)})` : ''}.`;
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-outcome ${outcome}">${outcome === 'citizens' ? '🎉 Vincono i cittadini!' : '🕵️ Vince l’impostore!'}</div>
        <p>${why}</p>
        <div class="pp-card"><div class="pp-muted">Impostor${imps.length > 1 ? 'i' : 'e'}</div>${imps.map(tag).join(' ')}
          <div class="pp-muted">Parola segreta</div><b>${esc(deal.secret)}</b>${twin ? `<div class="pp-muted">Parola del camaleonte</div><b>${esc(twin)}</b>` : ''}</div>
        <button class="pp-btn big" data-act="next">${round < rounds ? '▶ Prossima partita' : '🏁 Fine'}</button>
      </div>`,
      { next: () => (round < rounds ? startRound() : ctx.exit({ title: '🕵️ L’Impostore Tascabile', html: pointsList(ctx.players, points) })) }
    );
  };

  ctx.keepAwake(true);
  startRound();
  return () => t.clear();
};
