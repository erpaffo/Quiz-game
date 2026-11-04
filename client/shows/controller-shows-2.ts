import { getCharacter } from '../../shared/characters';
import { type FilaPrivate, type FilaPublic } from '../../shared/fila';
import { GUASTA, type GuastaPrivate, type GuastaPublic } from '../../shared/guastafeste';
import { LEGGENDE, type LeggendeItem, type LeggendePrivate, type LeggendePublic } from '../../shared/leggende';
import { type ShowId, type ShowMeta } from '../../shared/shows';
import { type SocialPrivate, type SocialPublic } from '../../shared/social';
import { SONDAGGI, type SondaggiPrivate, type SondaggiPublic } from '../../shared/sondaggi';
import type { PlayerPublic, RoomSnapshot } from '../../shared/types';
import { esc } from '../common/net';
import { playerColor, playerName, playerShapeCss, renderShowFinalController, type ControllerShowContext } from './controller-shows';
import { renderControllerShowBatch3 } from './controller-shows-3';

let draftSondaggiKey = '';
let draftSondaggiPicks: number[] = [];
let draftFilaKey = '';
let draftFilaOrder: string[] = [];

export function renderControllerShowBatch2(
  snap: RoomSnapshot,
  p: PlayerPublic,
  showId: ShowId,
  meta: ShowMeta,
  pub: unknown,
  priv: unknown,
  ctx: ControllerShowContext
): void {
  switch (showId) {
    case 'social':
      return renderSocialController(snap, p, meta, pub as SocialPublic, (priv ?? { myVote: null }) as SocialPrivate, ctx);
    case 'sondaggi':
      return renderSondaggiController(snap, p, meta, pub as SondaggiPublic, (priv ?? { myPoll: null, myGuess: null }) as SondaggiPrivate, ctx);
    case 'fila':
      return renderFilaController(snap, p, meta, pub as FilaPublic, (priv ?? { myOrder: null }) as FilaPrivate, ctx);
    case 'guastafeste':
      return renderGuastaController(
        snap,
        p,
        meta,
        pub as GuastaPublic,
        (priv ?? { prompts: [], favorite: null, contender: false, myVote: null }) as GuastaPrivate,
        ctx
      );
    case 'leggende':
      return renderLeggendeController(
        snap,
        p,
        meta,
        pub as LeggendePublic,
        (priv ?? { hearts: 3, maxHearts: 3, items: [], shielded: false, myAnswer: null, removed: [] }) as LeggendePrivate,
        ctx
      );
    default:
      return renderControllerShowBatch3(snap, p, showId, meta, pub, priv, ctx);
  }
}

// ---------------------------------------------------------------------------
// 6. 📸 CHI DI NOI?
// ---------------------------------------------------------------------------

function renderSocialController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: SocialPublic, priv: SocialPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'final') return renderShowFinalController(p, meta, st, ctx);
  if (st.step === 'vote') {
    const online = snap.players.filter((o) => o.connected);
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">${meta.icon} Domanda ${st.number}/${st.total}</div>
        <div class="title">${esc(st.question)}</div>
        <div class="target-list ${online.length > 5 ? 'grid' : ''}">
          ${online.map((o) => {
            const ch = getCharacter(o.characterId);
            const picked = priv.myVote === o.id;
            return `<button class="target-btn ${picked ? 'on' : ''}" data-vote="${o.id}" style="--pc:${playerColor(snap, o.id)};${playerShapeCss(snap, o.id)}"><b>${picked ? '✓ ' : ''}${esc(o.name)}${o.id === p.id ? ' (Tu)' : ''}</b><small>${esc(ch?.name ?? 'Giocatore')}</small></button>`;
          }).join('')}
        </div>
      </div>`;
    ctx.onClick((t) => {
      const targetId = t.closest<HTMLElement>('[data-vote]')?.dataset.vote;
      if (targetId) void ctx.sendShowAction({ type: 'vote', targetId });
    });
    return;
  }

  if (st.step === 'reveal') {
    const pts = st.points[p.id] ?? 0;
    const isWinner = st.winners.includes(p.id);
    ctx.app.innerHTML = `<div class="view center">${isWinner ? '<div class="big-icon">👑</div><div class="title">Il divano ha votato TE!</div>' : `<div class="title">${st.winners.length ? `Vince ${st.winners.map((id) => playerName(snap, id)).join(' & ')}` : 'Nessuna maggioranza!'}</div>`}<div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div></div>`;
    return;
  }

  
}

// ---------------------------------------------------------------------------
// 7. ⛏️ MINIERA DEI SONDAGGI
// ---------------------------------------------------------------------------

function renderSondaggiController(_snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: SondaggiPublic, priv: SondaggiPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'final') return renderShowFinalController(p, meta, st, ctx);
  if (st.step === 'poll' || st.step === 'guess') {
    const sent = st.step === 'poll' ? priv.myPoll : priv.myGuess;
    if (sent && sent.length === SONDAGGI.PICKS) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Scelte inviate!</div><div class="custom-opts">${sent.map((idx, i) => `<span class="trait on">${i + 1}ª · ${esc(st.options[idx] ?? '')}</span>`).join('')}</div></div>`;
      return;
    }
    const roundKey = `${st.step}|${st.number}`;
    if (draftSondaggiKey !== roundKey) {
      draftSondaggiKey = roundKey;
      draftSondaggiPicks = [];
    }
    const renderPicker = () => {
      const ready = draftSondaggiPicks.length === SONDAGGI.PICKS;
      ctx.app.innerHTML = `
        <div class="view">
          <div class="q-banner">${meta.icon} ${st.step === 'poll' ? `Scegli le tue ${SONDAGGI.PICKS} preferite in ordine!` : `Indovina le ${SONDAGGI.PICKS} più votate!`}</div>
          <div class="title">${esc(st.question)}</div>
          <div class="cat-grid">
            ${st.options.map((opt, idx) => {
              const pos = draftSondaggiPicks.indexOf(idx);
              return `<button type="button" class="btn ${pos >= 0 ? 'pink' : 'secondary'}" data-pick="${idx}">${pos >= 0 ? `<b>${pos + 1}ª</b> · ` : ''}${esc(opt)}</button>`;
            }).join('')}
          </div>
          <button type="button" class="btn big ${ready ? 'is-ready' : ''}" data-act="sondaggi-send" ${ready ? '' : 'disabled'}>${ready ? `✓ Conferma le ${SONDAGGI.PICKS} scelte` : `Scegli ancora ${SONDAGGI.PICKS - draftSondaggiPicks.length}`}</button>
        </div>`;
    };
    renderPicker();
    ctx.onClick((t) => {
      const pickStr = t.closest<HTMLElement>('[data-pick]')?.dataset.pick;
      if (pickStr !== undefined) {
        const idx = Number(pickStr);
        const existing = draftSondaggiPicks.indexOf(idx);
        if (existing >= 0) draftSondaggiPicks.splice(existing, 1);
        else if (draftSondaggiPicks.length < SONDAGGI.PICKS) draftSondaggiPicks.push(idx);
        renderPicker();
        return;
      }
      if (t.closest('[data-act="sondaggi-send"]') && draftSondaggiPicks.length === SONDAGGI.PICKS) {
        void ctx.sendShowAction({ type: st.step, options: draftSondaggiPicks.slice() });
      }
    });
    return;
  }

  if (st.step === 'reveal') {
    const mine = st.results.find((r) => r.playerId === p.id);
    const pts = mine?.points ?? 0;
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">🏆 Top 3: ${st.top.map((idx, i) => `${i + 1}° ${esc(st.options[idx] ?? '')}`).join(' · ')}</div><div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div></div>`;
    return;
  }

  
}

// ---------------------------------------------------------------------------
// 8. 🧩 FILA INDIANA
// ---------------------------------------------------------------------------

function renderFilaController(_snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: FilaPublic, priv: FilaPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'final') return renderShowFinalController(p, meta, st, ctx);
  if (st.step === 'sort') {
    const roundKey = `fila|${st.number}`;
    if (draftFilaKey !== roundKey) {
      draftFilaKey = roundKey;
      draftFilaOrder = priv.myOrder ? priv.myOrder.slice() : st.items.map((x) => x.id);
    } else if (priv.myOrder) {
      draftFilaOrder = priv.myOrder.slice();
    }

    const labelOf = (id: string) => st.items.find((x) => x.id === id)?.label ?? id;

    const renderList = () => {
      ctx.app.innerHTML = `
        <div class="view">
          <div class="q-banner">${meta.icon} Round ${st.number}/${st.total} · ${esc(st.title)}</div>
          <div class="fila-bound">⬆️ 1°: <b>${esc(st.from)}</b></div>
          <div class="fila-list">
            ${draftFilaOrder.map((id, i) => `
              <div class="fila-item">
                <span class="fila-pos">${i + 1}°</span>
                <b class="fila-label">${esc(labelOf(id))}</b>
                <button type="button" class="btn secondary fila-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn secondary fila-btn" data-down="${i}" ${i === draftFilaOrder.length - 1 ? 'disabled' : ''}>▼</button>
              </div>`).join('')}
          </div>
          <div class="fila-bound">⬇️ ${draftFilaOrder.length}°: <b>${esc(st.to)}</b></div>
          <button type="button" class="btn big ${priv.myOrder ? 'is-ready' : 'pink'}" data-act="fila-send">
            ${priv.myOrder ? '✓ Ordine inviato · Tocca per aggiornare' : '🧩 Conferma Ordine'}
          </button>
        </div>`;
    };

    renderList();

    ctx.onClick(async (t) => {
      const upStr = t.closest<HTMLElement>('[data-up]')?.dataset.up;
      if (upStr !== undefined) {
        const i = Number(upStr);
        if (i > 0) {
          [draftFilaOrder[i - 1], draftFilaOrder[i]] = [draftFilaOrder[i], draftFilaOrder[i - 1]];
          renderList();
        }
        return;
      }
      const downStr = t.closest<HTMLElement>('[data-down]')?.dataset.down;
      if (downStr !== undefined) {
        const i = Number(downStr);
        if (i < draftFilaOrder.length - 1) {
          [draftFilaOrder[i + 1], draftFilaOrder[i]] = [draftFilaOrder[i], draftFilaOrder[i + 1]];
          renderList();
        }
        return;
      }
      if (t.closest('[data-act="fila-send"]')) {
        navigator.vibrate?.(20);
        const ok = await ctx.sendShowAction({ type: 'order', ids: draftFilaOrder.slice() });
        if (ok) ctx.toast('Ordine confermato!', true);
      }
    });
    return;
  }

  if (st.step === 'reveal') {
    const mine = st.results.find((r) => r.playerId === p.id);
    const pts = mine?.points ?? 0;
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">${mine?.perfect ? '🎯 FILA PERFETTA!' : esc(st.title)}</div><div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div></div>`;
    return;
  }

  
}

// ---------------------------------------------------------------------------
// 9. 💥 GUASTAFESTE
// ---------------------------------------------------------------------------

function renderGuastaController(_snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: GuastaPublic, priv: GuastaPrivate, ctx: ControllerShowContext): void {
  if (st.step === 'final') return renderShowFinalController(p, meta, st, ctx);
  if (st.step === 'favorite') {
    if (priv.favorite) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Inviato: «${esc(priv.favorite)}»</div><p class="muted">In attesa degli altri…</p></div>`;
      return;
    }
    ctx.app.innerHTML = `
      <form class="view" id="guasta-fav-form">
        <div class="q-banner">${meta.icon} Round ${st.round}/${st.total} · ${esc(st.roundName)}</div>
        <div class="title">Scrivi una cosa che ami alla follia!</div>
        <input name="fav" type="text" maxlength="${GUASTA.MAX_CHARS}" autocomplete="off" placeholder="Es. Dormire fino a tardi la domenica…" required />
        <button class="btn big pink" type="submit">💖 Invia</button>
      </form>`;
    const form = document.getElementById('guasta-fav-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector<HTMLInputElement>('input[name="fav"]')!.value.trim();
      if (text) await ctx.sendShowAction({ type: 'favorite', text });
    });
    return;
  }

  if (st.step === 'write') {
    const nextPrompt = priv.prompts.find((pr) => pr.answer === null);
    if (!nextPrompt) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Hai completato le tue battute!</div><p class="muted">Preparati alle sfide 1 contro 1…</p></div>`;
      return;
    }
    const doneCount = priv.prompts.filter((pr) => pr.answer !== null).length;
    ctx.app.innerHTML = `
      <form class="view" id="guasta-ans-form">
        <div class="q-banner">${meta.icon} ${esc(st.roundName)} · Tema ${doneCount + 1}/${priv.prompts.length}</div>
        <div class="title">${esc(nextPrompt.text)}</div>
        <input name="ans" type="text" maxlength="${GUASTA.MAX_CHARS}" autocomplete="off" placeholder="Scrivi la tua battuta…" required />
        <button class="btn big pink" type="submit">💥 Invia battuta</button>
      </form>`;
    const form = document.getElementById('guasta-ans-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector<HTMLInputElement>('input[name="ans"]')!.value.trim();
      if (text) await ctx.sendShowAction({ type: 'answer', promptId: nextPrompt.id, text });
    });
    return;
  }

  if (st.step === 'vote') {
    if (priv.contender || st.contenders.includes(p.id)) {
      ctx.app.innerHTML = `<div class="view center"><div class="big-icon">⚔️</div><div class="title">Sei in gara in questa sfida!</div><p class="muted">Il pubblico sta votando la risposta migliore…</p></div>`;
      return;
    }
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">⚡ Sfida ${st.index}/${st.count} · Vota la migliore!</div>
        <div class="title">${esc(st.prompt)}</div>
        <div class="cat-grid">
          <button class="btn ${priv.myVote === 0 ? 'pink' : 'secondary'}" data-side="0">🅰️ «${esc(st.answers[0])}»</button>
          <button class="btn ${priv.myVote === 1 ? 'pink' : 'secondary'}" data-side="1">🅱️ «${esc(st.answers[1])}»</button>
        </div>
      </div>`;
    ctx.onClick((t) => {
      const side = t.closest<HTMLElement>('[data-side]')?.dataset.side;
      if (side !== undefined) void ctx.sendShowAction({ type: 'vote', side: Number(side) });
    });
    return;
  }

  if (st.step === 'result') {
    const mine = st.answers.find((a) => a.playerId === p.id);
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">${st.sweep ? '💥 CAPPOTTO!' : `Risultato ${st.index}/${st.count}`}</div>${mine ? `<div class="points ${mine.points > 0 ? '' : 'neg'}">+${mine.points}</div><div class="title">${mine.votes} voti ricevuti</div>` : '<div class="title">Guarda il risultato sulla TV!</div>'}</div>`;
    return;
  }

  
}

// ---------------------------------------------------------------------------
// 10. 🐉 LEGGENDE DEL QUIZ
// ---------------------------------------------------------------------------

function renderLeggendeController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: LeggendePublic, priv: LeggendePrivate, ctx: ControllerShowContext): void {
  if (st.step === 'final') return renderShowFinalController(p, meta, st, ctx);
  const statusBar = `<div class="q-banner">${priv.hearts > 0 ? '❤️'.repeat(priv.hearts) : '💀 KO'} ${priv.shielded ? '🛡️ Scudo attivo' : ''} · 💰 ${st.gold} oro</div>`;

  if (st.step === 'intro') {
    ctx.app.innerHTML = `<div class="view center">${statusBar}<div class="big-icon">${st.monster.icon}</div><div class="title">${esc(st.monster.name)}</div><p class="muted">❤️ ${st.monster.hp} PV · Preparati a combattere!</p></div>`;
    return;
  }

  if (st.step === 'question') {
    if (priv.hearts <= 0) {
      ctx.app.innerHTML = `<div class="view center">${statusBar}<div class="big-icon">💀</div><div class="title">Sei KO!</div><p class="muted">I tuoi compagni potranno rianimarti al prossimo negozio.</p></div>`;
      return;
    }
    const imgs = st.question.optionImages;
    ctx.app.innerHTML = `
      <div class="view">
        ${statusBar}
        <div class="title">${esc(st.question.text)}</div>
        ${st.question.image ? `<img class="q-image" src="${esc(st.question.image)}" alt="">` : ''}
        <div class="cat-grid ${imgs ? 'img-opts' : ''}">
          ${st.question.options.map((o, i) => {
            const removed = priv.removed.includes(i);
            const picked = priv.myAnswer === i;
            return `<button class="btn ${picked ? 'pink' : 'secondary'}" data-ans="${i}" ${removed || priv.myAnswer !== null ? 'disabled' : ''}>${removed ? '— eliminata —' : imgs ? `${String.fromCharCode(65 + i)}. <img class="ans-img" src="${esc(imgs[i])}" alt="${esc(o)}" aria-label="${esc(o)}">` : `${String.fromCharCode(65 + i)}. ${esc(o)}`}</button>`;
          }).join('')}
        </div>
        ${priv.items.length ? `<div class="custom-opts">${priv.items.map((it) => `<button type="button" class="btn secondary" data-use="${it}">${LEGGENDE.ITEMS[it].icon} Usa ${esc(LEGGENDE.ITEMS[it].name)}</button>`).join('')}</div>` : ''}
      </div>`;
    ctx.onClick((t) => {
      const ans = t.closest<HTMLElement>('[data-ans]')?.dataset.ans;
      if (ans !== undefined) return void ctx.sendShowAction({ type: 'answer', questionId: st.question.id, optionIndex: Number(ans) });
      const use = t.closest<HTMLElement>('[data-use]')?.dataset.use as LeggendeItem | undefined;
      if (use) void ctx.sendShowAction({ type: 'use', item: use });
    });
    return;
  }

  if (st.step === 'result') {
    const mine = st.results.find((r) => r.playerId === p.id);
    const hitMe = st.attack?.hit.includes(p.id);
    ctx.app.innerHTML = `<div class="view center">${statusBar}<div class="points ${mine?.correct ? '' : 'neg'}">${mine?.correct ? `⚔️ -${mine.damage} PV` : hitMe ? '💔 -1 Cuore' : 'Mancato'}</div><div class="title">${st.outcome === 'defeated' ? '🎉 Mostro sconfitto!' : esc(st.question.options[st.correctIndex] ?? '')}</div></div>`;
    return;
  }

  if (st.step === 'shop') {
    const fallen = st.heroes.filter((h) => h.hearts <= 0);
    const isReady = st.ready.includes(p.id);
    ctx.app.innerHTML = `
      <div class="view">
        ${statusBar}
        <div class="title">🛒 Mercante dell'Avventura</div>
        <div class="cat-grid">
          ${(Object.keys(LEGGENDE.ITEMS) as LeggendeItem[]).map((k) => {
            const it = LEGGENDE.ITEMS[k];
            const canBuy = priv.hearts > 0 && st.gold >= it.price && priv.items.length < LEGGENDE.ITEM_SLOTS;
            return `<button class="btn secondary" data-buy="${k}" ${canBuy ? '' : 'disabled'}>${it.icon} ${esc(it.name)} (💰 ${it.price}) — <small>${esc(it.description)}</small></button>`;
          }).join('')}
          ${priv.items.includes('potion') && priv.hearts < priv.maxHearts ? `<button class="btn secondary" data-use="potion">🧪 Bevi Pozione (+1 ❤️)</button>` : ''}
          ${fallen.map((f) => `<button class="btn secondary" data-revive="${f.playerId}" ${priv.hearts > 0 && st.gold >= LEGGENDE.REVIVE_PRICE ? '' : 'disabled'}>✨ Rianima ${playerName(snap, f.playerId)} (💰 ${LEGGENDE.REVIVE_PRICE})</button>`).join('')}
        </div>
        ${priv.hearts > 0 ? `<button class="btn big ${isReady ? 'is-ready' : 'pink'}" data-act="shop-ready" ${isReady ? 'disabled' : ''}>${isReady ? '✓ Pronto a ripartire' : '⚔️ Pronto per il prossimo mostro'}</button>` : ''}
      </div>`;
    ctx.onClick((t) => {
      const buy = t.closest<HTMLElement>('[data-buy]')?.dataset.buy as LeggendeItem | undefined;
      if (buy) return void ctx.sendShowAction({ type: 'buy', item: buy });
      const use = t.closest<HTMLElement>('[data-use]')?.dataset.use as LeggendeItem | undefined;
      if (use) return void ctx.sendShowAction({ type: 'use', item: use });
      const rev = t.closest<HTMLElement>('[data-revive]')?.dataset.revive;
      if (rev) return void ctx.sendShowAction({ type: 'revive', targetId: rev });
      if (t.closest('[data-act="shop-ready"]')) void ctx.sendShowAction({ type: 'ready' });
    });
    return;
  }

  if (st.step === 'victory' || st.step === 'defeat') {
    const meHero = st.heroes.find((h) => h.playerId === p.id);
    ctx.app.innerHTML = `<div class="view center"><div class="big-icon">${st.step === 'victory' ? '🏆' : '💀'}</div><div class="title">${st.step === 'victory' ? 'VITTORIA EROICA!' : 'SCONFITTA!'}</div><p class="muted">Danni inflitti da te: <b>⚔️ ${meHero?.damage ?? 0}</b></p></div>`;
    return;
  }

  
}