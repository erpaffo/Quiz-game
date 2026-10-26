// 🎭 Parola in Fronte — telefono sulla fronte, due metà giganti: destra = indovinata, sinistra = passo.

import { FronteTurn, fronteDeck, frontePlan } from '../logic/fronte';
import type { PassGame } from '../types';
import { countdown, esc, pointsList, screen, tag, Timers } from '../ui';

const MODE_TEXT: Record<string, string> = {
  indizi: '🗣️ Gli amici danno indizi a parole (vietato dire la parola o pezzi di essa).',
  mimo: '🤐 Gli amici possono solo mimare e fare versi: niente parole!',
  tabu: '🚫 Tabù: il telefono lo tiene il vicino, che controlla le 4 parole vietate. Chi è di turno descrive, gli altri indovinano.'
};

export const fronte: PassGame = (ctx) => {
  const t = new Timers();
  const mode = ctx.options.mode;
  const seconds = Number(ctx.options.time) || 60;
  const plan = frontePlan(ctx.players, Number(ctx.options.turns) || 1);
  const deck = fronteDeck(ctx.options.pack, Math.random);
  const points: Record<string, number> = {};
  let idx = 0;

  const intro = () => {
    const p = plan[idx];
    const holder = mode === 'tabu' ? ctx.players[(ctx.players.indexOf(p) + 1) % ctx.players.length] : p;
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-muted">Turno ${idx + 1} di ${plan.length}</div>
        <h2>Tocca a ${tag(p)}</h2>
        <p class="pp-note">${esc(MODE_TEXT[mode] ?? MODE_TEXT.indizi)}</p>
        <p>${mode === 'tabu' ? `📲 ${tag(holder)} tiene il telefono e controlla le parole vietate.` : '📲 Metti il telefono sulla fronte, schermo verso gli amici.'}</p>
        <p class="pp-muted">⏱️ ${seconds} secondi · tocca a <b>destra</b> se indovinata, a <b>sinistra</b> per passare</p>
        <button class="pp-btn big" data-act="go">▶ Pronti!</button>
      </div>`,
      { go: () => countdown(ctx.root, t, ctx.sfx, { title: `${p.name}: occhi sulla fronte!`, onDone: play }) }
    );
  };

  const play = () => {
    const turn = new FronteTurn(deck);
    const endAt = performance.now() + seconds * 1000;
    let lock = 0;
    const draw = () => {
      const card = turn.current;
      ctx.root.innerHTML = `
        <div class="pp-fronte ${mode === 'tabu' ? 'tabu' : ''}">
          <div class="pp-fronte-top"><span class="pp-timer" data-timer>${seconds}</span><span>✅ ${turn.correct}</span></div>
          <div class="pp-fronte-word">${esc(card.word)}</div>
          ${mode === 'tabu' ? `<div class="pp-taboo">${card.taboo.map((w) => `<span>${esc(w)}</span>`).join('')}</div><button class="pp-taboo-btn" data-zone="taboo">🚫 TABÙ! (−1)</button>` : ''}
          <button class="pp-half left" data-zone="skip"><span>⏭️<br>PASSO</span></button>
          <button class="pp-half right" data-zone="ok"><span>✅<br>INDOVINATA!</span></button>
        </div>`;
    };
    draw();
    ctx.root.onclick = null;
    ctx.root.onpointerdown = (e) => {
      const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]')?.dataset.zone;
      if (!zone) return;
      e.preventDefault();
      const now = performance.now();
      if (now < lock) return; // doppio tocco accidentale
      lock = now + 350;
      if (zone === 'ok') {
        turn.answer(true);
        ctx.sfx.good();
        ctx.sfx.vibrate(40);
      } else if (zone === 'skip') {
        turn.answer(false);
        ctx.sfx.bad();
      } else {
        turn.taboo();
        ctx.sfx.bad();
        ctx.sfx.vibrate([60, 40, 60]);
      }
      draw();
    };
    let lastSec = seconds;
    t.loop(() => {
      const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
      if (left !== lastSec) {
        lastSec = left;
        const el = ctx.root.querySelector('[data-timer]');
        if (el) el.textContent = String(left);
        if (left <= 5 && left > 0) ctx.sfx.tick();
      }
      if (left <= 0) {
        ctx.root.onpointerdown = null;
        ctx.sfx.boom();
        review(turn);
        return false;
      }
    });
  };

  const review = (turn: FronteTurn) => {
    const p = plan[idx];
    const draw = () =>
      screen(
        ctx.root,
        `<div class="pp-stack">
          <h2>⏰ Tempo! ${tag(p)} fa <b>${turn.score}</b> ${turn.score === 1 ? 'punto' : 'punti'}</h2>
          <p class="pp-muted">Tocca una parola per correggere un tocco sbagliato.</p>
          <ul class="pp-review">${turn.results
            .map((r, i) => `<li><button data-act="fix" data-i="${i}" class="${r.taboo ? 'taboo' : r.ok ? 'ok' : 'skip'}">${r.taboo ? '🚫' : r.ok ? '✅' : '⏭️'} ${esc(r.word)}</button></li>`)
            .join('') || '<li class="pp-muted">Nessuna parola</li>'}</ul>
          <button class="pp-btn big" data-act="next">${idx + 1 < plan.length ? '▶ Prossimo turno' : '🏁 Fine partita'}</button>
        </div>`,
        {
          fix: (el) => {
            turn.toggle(Number(el.dataset.i));
            draw();
          },
          next: () => {
            points[p.id] = (points[p.id] ?? 0) + turn.score;
            ctx.addPoints(p.id, turn.score);
            idx++;
            if (idx < plan.length) intro();
            else ctx.exit({ title: '🎭 Parola in Fronte', html: pointsList(ctx.players, points) });
          }
        }
      );
    draw();
  };

  ctx.keepAwake(true);
  intro();
  return () => {
    t.clear();
    ctx.root.onpointerdown = null;
  };
};
