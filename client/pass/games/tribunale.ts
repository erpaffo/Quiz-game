// 🎙️ Il Tribunale degli Amici — il giudice scommette in segreto, poi «3, 2, 1… INDICA!».

import { TRIBUNALE_QUESTIONS } from '../data/social';
import { tribunaleJudges, tribunalePoints } from '../logic/tribunale';
import type { PassGame, Player } from '../types';
import { countdown, cover, esc, pointsList, screen, tag, Timers } from '../ui';

export const tribunale: PassGame = (ctx) => {
  const t = new Timers();
  const judges = tribunaleJudges(ctx.players, Number(ctx.options.questions) || 10);
  const deck = ctx.deck('tribunale', TRIBUNALE_QUESTIONS);
  const points: Record<string, number> = {};
  let idx = 0;
  const byId = (id: string) => ctx.players.find((p) => p.id === id)!;

  const ask = () => {
    if (idx >= judges.length) return ctx.exit({ title: '🎙️ Il Tribunale degli Amici', html: pointsList(ctx.players, points) });
    const judge = judges[idx];
    const q = deck.draw();
    cover(ctx.root, judge, {
      title: `Domanda ${idx + 1} di ${judges.length}: sei il giudice! Gli altri non guardino.`,
      button: `Sono ${judge.name}: scommetto`,
      onGo: () => predict(judge, q)
    });
  };

  const predict = (judge: Player, q: string) => {
    screen(
      ctx.root,
      `<div class="pp-stack">
        <div class="pp-card"><div class="pp-big-text">${esc(q)}</div></div>
        <p>🤫 ${tag(judge)}, chi verrà indicato <b>di più</b> dal tavolo?</p>
        <div class="pp-grid-players">${ctx.players.map((p) => `<button class="pp-player-btn" data-act="pick" data-id="${p.id}" style="--pc:${p.color}">${esc(p.name)}</button>`).join('')}</div>
      </div>`,
      {
        pick: (el) => {
          const prediction = el.dataset.id!;
          screen(
            ctx.root,
            `<div class="pp-center pp-stack">
              <h2>🔒 Scommessa registrata</h2>
              <p>Posa il telefono al centro e leggi la domanda ad alta voce:</p>
              <div class="pp-card"><div class="pp-big-text">${esc(q)}</div></div>
              <button class="pp-btn huge" data-act="go">👉 3, 2, 1… INDICA!</button>
            </div>`,
            { go: () => countdown(ctx.root, t, ctx.sfx, { title: q, last: 'INDICA! 👉', onDone: () => verdict(judge, q, prediction) }) }
          );
        }
      }
    );
  };

  const verdict = (judge: Player, q: string, prediction: string) => {
    const chosen = new Set<string>();
    let unanimous = false;
    const draw = () =>
      screen(
        ctx.root,
        `<div class="pp-stack">
          <div class="pp-card"><div class="pp-big-text small">${esc(q)}</div></div>
          <p>Chi ha ricevuto più dita puntate? (Se è pari, toccane più d’uno.)</p>
          <div class="pp-grid-players">${ctx.players.map((p) => `<button class="pp-player-btn ${chosen.has(p.id) ? 'on' : ''}" data-act="toggle" data-id="${p.id}" style="--pc:${p.color}">${chosen.has(p.id) ? '👉 ' : ''}${esc(p.name)}</button>`).join('')}</div>
          <button class="pp-check ${unanimous ? 'on' : ''}" data-act="unan" ${chosen.size === 1 ? '' : 'disabled'}>${unanimous && chosen.size === 1 ? '☑' : '☐'} Plebiscito: tutti hanno indicato la stessa persona</button>
          <button class="pp-btn big" data-act="ok" ${chosen.size ? '' : 'disabled'}>⚖️ Emetti il verdetto</button>
        </div>`,
        {
          toggle: (el) => {
            const id = el.dataset.id!;
            if (chosen.has(id)) chosen.delete(id);
            else chosen.add(id);
            if (chosen.size !== 1) unanimous = false;
            draw();
          },
          unan: () => {
            unanimous = !unanimous;
            draw();
          },
          ok: () => result(judge, prediction, [...chosen], unanimous && chosen.size === 1)
        }
      );
    draw();
  };

  const result = (judge: Player, prediction: string, selected: string[], unanimous: boolean) => {
    const pts = tribunalePoints(ctx.players, judge.id, prediction, selected, unanimous);
    for (const [id, n] of Object.entries(pts)) {
      points[id] = (points[id] ?? 0) + n;
      ctx.addPoints(id, n);
    }
    const hit = selected.includes(prediction);
    if (hit) ctx.sfx.fanfare();
    else ctx.sfx.bad();
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <h2>⚖️ Verdetto: ${selected.map((id) => tag(byId(id))).join(' ')}</h2>
        <p>Il giudice ${tag(judge)} aveva scommesso su ${tag(byId(prediction))}: ${hit ? '<b>✅ +2!</b>' : '❌ niente punti'}</p>
        ${unanimous ? '<p class="pp-note">🤝 Plebiscito! +1 a tutti per l’intesa.</p>' : ''}
        <button class="pp-btn big" data-act="next">${idx + 1 < judges.length ? '▶ Prossima domanda' : '🏁 Fine'}</button>
      </div>`,
      {
        next: () => {
          idx++;
          ask();
        }
      }
    );
  };

  ctx.keepAwake(true);
  ask();
  return () => t.clear();
};
