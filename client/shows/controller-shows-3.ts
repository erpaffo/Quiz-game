import { COLPEVOLE, type ColpevolePrivate, type ColpevolePublic } from '../../shared/colpevole';
import { CREATIVE, type CreativePrivate, type CreativePublic, type Drawing, type Stroke } from '../../shared/creative';
import { getShowMeta, type ShowId, type ShowMeta } from '../../shared/shows';
import { type SmistPrivate, type SmistPublic, type SmistSide } from '../../shared/smistatori';
import type { PlayerPublic, RoomSnapshot } from '../../shared/types';
import { esc } from '../common/net';
import { playerColor, playerName, playerShapeCss, renderShowFinalController, type ControllerShowContext } from './controller-shows';

let draftDrawingPrompt = '';
let draftFrames: Drawing = [[], []];
let activeFrameIdx = 0;
let redrawCurrent: () => void = () => {}; // la delega click è registrata una sola volta: deve vedere la tela dell'ultimo render
let activeColorIdx = 0;
let activeWidthIdx = 1;
let draftSurveyAnswers: (number | null)[] = [];

export function renderControllerShowBatch3(
  snap: RoomSnapshot,
  p: PlayerPublic,
  showId: ShowId,
  meta: ShowMeta,
  pub: unknown,
  priv: unknown,
  ctx: ControllerShowContext
): void {
  switch (showId) {
    case 'creative':
      return renderCreativeController(
        snap,
        p,
        meta,
        pub as CreativePublic,
        (priv ?? { prompt: null, drawn: false, isArtist: false, myTitle: null, myOptionId: null, myChoice: null }) as CreativePrivate,
        ctx
      );
    case 'colpevole':
      return renderColpevoleController(
        snap,
        p,
        meta,
        pub as ColpevolePublic,
        (priv ?? { role: null, myAnswers: null, canFalsify: false, falsified: null, myAlibi: null, myVote: null }) as ColpevolePrivate,
        ctx
      );
    case 'smistatori':
      return renderSmistatoriController(
        snap,
        p,
        meta,
        pub as SmistPublic,
        (priv ?? { team: null, word: null, left: null, right: null }) as SmistPrivate,
        ctx
      );
    default:
      return renderGenericControllerShow(snap, p, showId, pub, priv, ctx);
  }
}

// ---------------------------------------------------------------------------
// 11. ✏️ SCARABOCCHI ANIMATI (Drawful Animate)
// ---------------------------------------------------------------------------

function renderCreativeController(_snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: CreativePublic, priv: CreativePrivate, ctx: ControllerShowContext, rerender = false): void {
  if (st.step === 'draw') {
    if (priv.drawn) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">🎨 Animazione inviata!</div><p class="muted">«${esc(priv.prompt ?? '')}»</p></div>`;
      return;
    }

    if (draftDrawingPrompt !== (priv.prompt ?? '')) {
      draftDrawingPrompt = priv.prompt ?? '';
      draftFrames = [[], []];
      activeFrameIdx = 0;
    }

    ctx.app.innerHTML = `
      <div class="view creative-ctrl">
        <div class="q-banner">🎨 Disegna: <b>«${esc(priv.prompt ?? 'Tema segreto')}»</b></div>
        <div class="creative-toolbar">
          <div class="seg">
            <button type="button" class="${activeFrameIdx === 0 ? 'on' : ''}" data-frame="0">Fotogramma 1</button>
            <button type="button" class="${activeFrameIdx === 1 ? 'on' : ''}" data-frame="1">Fotogramma 2</button>
          </div>
          <div class="creative-colors">
            ${CREATIVE.COLORS.map((c, i) => `<button type="button" class="color-dot ${activeColorIdx === i ? 'on' : ''}" data-color="${i}" style="background:${c}"></button>`).join('')}
          </div>
          <div class="creative-tools">
            ${CREATIVE.WIDTHS.map((_, i) => `<button type="button" class="btn secondary small-btn ${activeWidthIdx === i ? 'pink' : ''}" data-width="${i}">${['Sottile', 'Medio', 'Spesso'][i]}</button>`).join('')}
            <button type="button" class="btn secondary small-btn" data-act="copy-f1">📋 Copia F1➔F2</button>
            <button type="button" class="btn secondary small-btn" data-act="undo">↩️</button>
            <button type="button" class="btn secondary small-btn" data-act="clear">🗑️</button>
          </div>
        </div>
        <canvas id="creative-canvas" width="${CREATIVE.CANVAS}" height="${CREATIVE.CANVAS}" class="creative-canvas"></canvas>
        <button type="button" class="btn big pink" data-act="send-drawing">🎨 Invia Animazione (2 fotogrammi)</button>
      </div>`;

    const canvas = document.getElementById('creative-canvas') as HTMLCanvasElement | null;
    const c2d = canvas?.getContext('2d') ?? null;

    const redraw = () => {
      if (!canvas || !c2d) return;
      c2d.fillStyle = '#ffffff';
      c2d.fillRect(0, 0, CREATIVE.CANVAS, CREATIVE.CANVAS);

      // Carta cipolla (onion skin) del fotogramma 1 quando si disegna il fotogramma 2
      if (activeFrameIdx === 1 && draftFrames[0].length > 0) {
        c2d.save();
        c2d.globalAlpha = 0.2;
        drawStrokes(c2d, draftFrames[0]);
        c2d.restore();
      }
      drawStrokes(c2d, draftFrames[activeFrameIdx]);
    };

    const drawStrokes = (g: CanvasRenderingContext2D, strokes: Stroke[]) => {
      for (const s of strokes) {
        g.strokeStyle = CREATIVE.COLORS[s.c] ?? '#1d1d1f';
        g.fillStyle = g.strokeStyle;
        g.lineWidth = CREATIVE.WIDTHS[s.w] ?? 14;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        if (s.p.length === 2) {
          g.beginPath();
          g.arc(s.p[0], s.p[1], g.lineWidth / 2, 0, Math.PI * 2);
          g.fill();
          continue;
        }
        g.beginPath();
        g.moveTo(s.p[0], s.p[1]);
        for (let i = 2; i + 1 < s.p.length; i += 2) g.lineTo(s.p[i], s.p[i + 1]);
        g.stroke();
      }
    };

    let currentStroke: Stroke | null = null;
    const toCoord = (e: PointerEvent): [number, number] => {
      const rect = canvas!.getBoundingClientRect();
      const x = Math.max(0, Math.min(CREATIVE.CANVAS, Math.round(((e.clientX - rect.left) / rect.width) * CREATIVE.CANVAS)));
      const y = Math.max(0, Math.min(CREATIVE.CANVAS, Math.round(((e.clientY - rect.top) / rect.height) * CREATIVE.CANVAS)));
      return [x, y];
    };

    canvas?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = toCoord(e);
      currentStroke = { c: activeColorIdx, w: activeWidthIdx, p: [x, y] };
      draftFrames[activeFrameIdx].push(currentStroke);
      redraw();
    });
    canvas?.addEventListener('pointermove', (e) => {
      if (!currentStroke) return;
      const [x, y] = toCoord(e);
      const len = currentStroke.p.length;
      const dx = x - currentStroke.p[len - 2];
      const dy = y - currentStroke.p[len - 1];
      if (dx * dx + dy * dy >= 64) {
        currentStroke.p.push(x, y);
        redraw();
      }
    });
    const endStroke = () => { currentStroke = null; };
    canvas?.addEventListener('pointerup', endStroke);
    canvas?.addEventListener('pointercancel', endStroke);

    redraw();
    redrawCurrent = redraw;

    // una sola delega per vista: i re-render interni (true) non devono riregistrarla
    if (!rerender) ctx.onClick(async (t) => {
      const fStr = t.closest<HTMLElement>('[data-frame]')?.dataset.frame;
      if (fStr !== undefined) {
        activeFrameIdx = Number(fStr);
        renderCreativeController(_snap, p, meta, st, priv, ctx, true);
        return;
      }
      const cStr = t.closest<HTMLElement>('[data-color]')?.dataset.color;
      if (cStr !== undefined) {
        activeColorIdx = Number(cStr);
        renderCreativeController(_snap, p, meta, st, priv, ctx, true);
        return;
      }
      const wStr = t.closest<HTMLElement>('[data-width]')?.dataset.width;
      if (wStr !== undefined) {
        activeWidthIdx = Number(wStr);
        renderCreativeController(_snap, p, meta, st, priv, ctx, true);
        return;
      }
      if (t.closest('[data-act="copy-f1"]')) {
        draftFrames[1] = draftFrames[0].map((s) => ({ c: s.c, w: s.w, p: s.p.slice() }));
        activeFrameIdx = 1;
        renderCreativeController(_snap, p, meta, st, priv, ctx, true);
        return;
      }
      if (t.closest('[data-act="undo"]')) {
        draftFrames[activeFrameIdx].pop();
        redrawCurrent();
        return;
      }
      if (t.closest('[data-act="clear"]')) {
        draftFrames[activeFrameIdx] = [];
        redrawCurrent();
        return;
      }
      if (t.closest('[data-act="send-drawing"]')) {
        if (draftFrames[0].length === 0 && draftFrames[1].length === 0) {
          ctx.toast('Disegna almeno un tratto prima di inviare!');
          return;
        }
        if (draftFrames[1].length === 0) {
          draftFrames[1] = draftFrames[0].map((s) => ({ c: s.c, w: s.w, p: s.p.slice() }));
        } else if (draftFrames[0].length === 0) {
          draftFrames[0] = draftFrames[1].map((s) => ({ c: s.c, w: s.w, p: s.p.slice() }));
        }
        await ctx.sendShowAction({ type: 'draw', frames: draftFrames });
      }
    });
    return;
  }

  if (st.step === 'title') {
    if (priv.isArtist || st.artistId === p.id) {
      ctx.app.innerHTML = `<div class="view center"><div class="big-icon">🎨</div><div class="title">È la tua opera d'arte!</div><p class="muted">Gli altri stanno inventando titoli falsi per il tuo disegno…</p></div>`;
      return;
    }
    if (priv.myTitle) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Titolo inviato!</div><div class="q-banner">«${esc(priv.myTitle)}»</div></div>`;
      return;
    }
    ctx.app.innerHTML = `
      <form class="view" id="creative-title-form">
        <div class="q-banner">✏️ Opera ${st.index}/${st.count} · Guarda il disegno sulla TV!</div>
        <div class="title">Inventa un titolo falso ma credibile!</div>
        <input name="title" type="text" maxlength="${CREATIVE.TITLE_MAX}" autocomplete="off" placeholder="Che cosa rappresenta questo disegno?" required />
        <button class="btn big pink" type="submit">🎭 Invia Titolo Falso</button>
      </form>`;
    const form = document.getElementById('creative-title-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector<HTMLInputElement>('input[name="title"]')!.value.trim();
      if (text) await ctx.sendShowAction({ type: 'title', text });
    });
    return;
  }

  if (st.step === 'choose') {
    if (priv.isArtist || st.artistId === p.id) {
      ctx.app.innerHTML = `<div class="view center"><div class="big-icon">🤫</div><div class="title">Sei l'artista!</div><p class="muted">Guarda chi indovina il tuo vero titolo!</p></div>`;
      return;
    }
    if (priv.myChoice) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Voto registrato!</div></div>`;
      return;
    }
    const choices = st.options.filter((o) => o.id !== priv.myOptionId);
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">🎨 Qual è il TITOLO VERO dell'opera?</div>
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
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">🎨 Titolo vero: <b>${esc(truth?.text ?? '')}</b></div><div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div></div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}

// ---------------------------------------------------------------------------
// 12. 🔍 IL COLPEVOLE (Suspectives)
// ---------------------------------------------------------------------------

function renderColpevoleController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: ColpevolePublic, priv: ColpevolePrivate, ctx: ControllerShowContext): void {
  if (st.step === 'survey') {
    if (priv.myAnswers && priv.myAnswers.length === st.questions.length) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Sondaggio completato!</div><p class="muted">Le tue risposte sono pronte per l'indagine…</p></div>`;
      return;
    }
    if (draftSurveyAnswers.length !== st.questions.length) {
      draftSurveyAnswers = st.questions.map(() => null);
    }

    const renderSurvey = () => {
      const allAnswered = draftSurveyAnswers.every((a) => a !== null);
      ctx.app.innerHTML = `
        <div class="view">
          <div class="q-banner">🔍 Sondaggio Preliminare (${draftSurveyAnswers.filter((a) => a !== null).length}/${st.questions.length})</div>
          <div class="survey-list">
            ${st.questions.map((q, qi) => `
              <div class="survey-item">
                <div class="survey-q">${qi + 1}. ${esc(q.text)}</div>
                <div class="seg">
                  <button type="button" class="${draftSurveyAnswers[qi] === 0 ? 'on' : ''}" data-sq="${qi}" data-sa="0">${esc(q.options[0])}</button>
                  <button type="button" class="${draftSurveyAnswers[qi] === 1 ? 'on' : ''}" data-sq="${qi}" data-sa="1">${esc(q.options[1])}</button>
                </div>
              </div>`).join('')}
          </div>
          <button type="button" class="btn big ${allAnswered ? 'pink' : ''}" data-act="send-survey" ${allAnswered ? '' : 'disabled'}>
            ${allAnswered ? '🔍 Invia Sondaggio' : 'Rispondi a tutte le domande'}
          </button>
        </div>`;
    };
    renderSurvey();
    ctx.onClick((t) => {
      const btn = t.closest<HTMLElement>('[data-sq]');
      if (btn) {
        draftSurveyAnswers[Number(btn.dataset.sq)] = Number(btn.dataset.sa);
        renderSurvey();
        return;
      }
      if (t.closest('[data-act="send-survey"]') && draftSurveyAnswers.every((a) => a !== null)) {
        void ctx.sendShowAction({ type: 'survey', answers: draftSurveyAnswers as number[] });
      }
    });
    return;
  }

  if (st.step === 'role') {
    if (priv.role === 'culprit') {
      ctx.app.innerHTML = `
        <div class="view">
          <div class="q-banner is-impostor">🕵️ <b>SEI IL COLPEVOLE!</b> (Caso ${st.case}/${st.cases})</div>
          <div class="title">${priv.falsified !== null ? `✓ Hai falsificato la domanda #${priv.falsified + 1}!` : 'Puoi falsificare UNA tua risposta sul tabellone pubblico:'}</div>
          ${priv.canFalsify && priv.falsified === null && priv.myAnswers
            ? `<div class="cat-grid">${priv.myAnswers.map((_, qi) => `<button class="btn secondary" data-falsify="${qi}">🔄 Falsifica risposta #${qi + 1}</button>`).join('')}</div>`
            : '<p class="muted">Mantieni la calma e prepara il tuo alibi!</p>'}
        </div>`;
      ctx.onClick((t) => {
        const qi = t.closest<HTMLElement>('[data-falsify]')?.dataset.falsify;
        if (qi !== undefined) void ctx.sendShowAction({ type: 'falsify', questionIndex: Number(qi) });
      });
      return;
    }
    ctx.app.innerHTML = `<div class="view center"><div class="big-icon">🔍</div><div class="title">Sei un Investigatore!</div><p class="muted">Caso ${st.case}/${st.cases}: osserva gli indizi sulla TV e scopri chi sta mentendo.</p></div>`;
    return;
  }

  if (st.step === 'clue') {
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">${priv.role === 'culprit' ? '🕵️ Sei il Colpevole' : '🔍 Investigatore'}</div><div class="title">Nuovo indizio sulla TV!</div><p class="muted">Controlla chi combacia sul tabellone…</p></div>`;
    return;
  }

  if (st.step === 'alibi') {
    if (priv.myAlibi) {
      ctx.app.innerHTML = `<div class="view center"><div class="done pop">✓ Alibi registrato!</div><div class="q-banner">«${esc(priv.myAlibi)}»</div></div>`;
      return;
    }
    ctx.app.innerHTML = `
      <form class="view" id="colpevole-alibi-form">
        <div class="q-banner">${priv.role === 'culprit' ? '🕵️ Colpevole: convinci tutti della tua innocenza!' : '🔍 Scrivi la tua dichiarazione / alibi'}</div>
        <div class="title">Difenditi davanti al gruppo!</div>
        <input name="alibi" type="text" maxlength="${COLPEVOLE.ALIBI_MAX}" autocomplete="off" placeholder="Scrivi il tuo alibi…" required />
        <button class="btn big pink" type="submit">📝 Invia Alibi</button>
      </form>`;
    const form = document.getElementById('colpevole-alibi-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.querySelector<HTMLInputElement>('input[name="alibi"]')!.value.trim();
      if (text) await ctx.sendShowAction({ type: 'alibi', text });
    });
    return;
  }

  if (st.step === 'vote') {
    const others = snap.players.filter((o) => o.id !== p.id && o.connected);
    ctx.app.innerHTML = `
      <div class="view">
        <div class="q-banner">🗳️ Accusa Finale · Chi è il Colpevole?</div>
        <div class="target-list">
          ${others.map((o) => {
            const alibi = st.alibis.find((a) => a.playerId === o.id)?.text;
            const picked = priv.myVote === o.id;
            const matches = st.suspects.includes(o.id);
            return `<button class="target-btn ${picked ? 'on' : ''}" data-accuse="${o.id}" style="--pc:${playerColor(snap, o.id)};${playerShapeCss(snap, o.id)}"><b>${picked ? '✓ ' : ''}${esc(o.name)} ${matches ? '⚠️' : ''}</b><small>«${esc(alibi ?? 'Nessun alibi')}»</small></button>`;
          }).join('')}
        </div>
      </div>`;
    ctx.onClick((t) => {
      const targetId = t.closest<HTMLElement>('[data-accuse]')?.dataset.accuse;
      if (targetId) void ctx.sendShowAction({ type: 'vote', targetId });
    });
    return;
  }

  if (st.step === 'reveal') {
    const pts = st.points[p.id] ?? 0;
    ctx.app.innerHTML = `<div class="view center"><div class="q-banner">Colpevole: <b>${playerName(snap, st.culpritId)}</b></div><div class="points ${pts > 0 ? '' : 'neg'}">+${pts}</div><div class="title">${st.caught ? 'Colpevole smascherato!' : 'Il Colpevole è fuggito!'}</div></div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}

// ---------------------------------------------------------------------------
// 13. 🗂️ SMISTATORI (Idol Factions)
// ---------------------------------------------------------------------------

function renderSmistatoriController(snap: RoomSnapshot, p: PlayerPublic, meta: ShowMeta, st: SmistPublic, priv: SmistPrivate, ctx: ControllerShowContext): void {
  const teamBadge = priv.team ? (priv.team === 'A' ? '🟦 Squadra A' : '🟧 Squadra B') : '🗂️ Smistatori';

  if (st.step === 'teams') {
    ctx.app.innerHTML = `<div class="view center"><div class="big-icon">${priv.team === 'A' ? '🟦' : '🟧'}</div><div class="title">Sei nella ${teamBadge}!</div><p class="muted">Preparatevi a smistare le parole a raffica!</p></div>`;
    return;
  }

  if (st.step === 'round') {
    if (priv.word) {
      ctx.app.innerHTML = `
        <div class="view center">
          <div class="q-banner">${teamBadge} · ⚡ TOCCA A TE!</div>
          <div class="tempo-year-box"><div class="tempo-year-val">${esc(priv.word.text)}</div></div>
          <div class="smist-buttons">
            <button type="button" class="btn big pink" data-side="left">⬅️ ${esc(priv.left ?? st.left)}</button>
            <button type="button" class="btn big" data-side="right">${esc(priv.right ?? st.right)} ➡️</button>
          </div>
        </div>`;
      ctx.onClick((t) => {
        const side = t.closest<HTMLElement>('[data-side]')?.dataset.side as SmistSide | undefined;
        if (side && priv.word) {
          navigator.vibrate?.(20);
          void ctx.sendShowAction({ type: 'sort', wordId: priv.word.id, side });
        }
      });
      return;
    }

    const myTeamState = priv.team ? st.teams[priv.team] : null;
    ctx.app.innerHTML = `
      <div class="view center">
        <div class="q-banner">${teamBadge} · Punti: <b>${myTeamState?.score ?? 0}</b></div>
        <div class="big-icon">🗣️</div>
        <div class="title">Parola sul telefono di ${myTeamState?.assignee ? playerName(snap, myTeamState.assignee) : '…'}!</div>
        <p class="muted">Suggerite a voce: <b>⬅️ ${esc(st.left)}</b> oppure <b>${esc(st.right)} ➡️</b>!</p>
      </div>`;
    return;
  }

  if (st.step === 'result') {
    const won = priv.team && st.winner === priv.team;
    ctx.app.innerHTML = `<div class="view center"><div class="big-icon">${won ? '🏆' : '🗂️'}</div><div class="title">${st.winner ? `Vince la Squadra ${st.winner}!` : 'Pareggio!'}</div></div>`;
    return;
  }

  if (st.step === 'final') renderShowFinalController(p, meta, st, ctx);
}

// ---------------------------------------------------------------------------
// 14. FALLBACK UNIVERSALE CONTROLLER
// ---------------------------------------------------------------------------

function renderGenericControllerShow(_snap: RoomSnapshot, p: PlayerPublic, showId: string, rawPub: unknown, _rawPriv: unknown, ctx: ControllerShowContext): void {
  const show = getShowMeta(showId);
  const pub = (rawPub && typeof rawPub === 'object' ? rawPub : {}) as Record<string, unknown>;
  const prompt = String(pub.prompt ?? pub.question ?? pub.event ?? pub.title ?? '');
  ctx.app.innerHTML = `<div class="view center"><div class="big-icon">${show.icon}</div><div class="title">${esc(show.name)}</div><p class="muted">${prompt ? esc(prompt) : `Punti: ${p.score.toLocaleString('it-IT')}`}</p></div>`;
}