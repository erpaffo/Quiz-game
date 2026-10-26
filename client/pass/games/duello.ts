// ⚡ Duello al Tavolo — telefono piatto tra due sfidanti: metà in basso dritta, metà in alto capovolta.

import { DUELLO_WIN_POINTS, DuelloLadder, DuelloMatch, makePrompt, promptInterval, type DuelPrompt } from '../logic/duello';
import { seeded, shuffle } from '../rng';
import type { PassGame } from '../types';
import { countdown, esc, pointsList, screen, tag, Timers } from '../ui';

function promptHtml(p: DuelPrompt): string {
  let body: string;
  if (p.kind === 'stroop') body = `<div class="pp-stroop" style="color:${p.ink}">${esc(p.word)}</div>`;
  else if (p.kind === 'count') {
    const shapes: string[] = [...Array(p.blue).fill('<i class="c"></i>'), ...Array(p.red).fill('<i class="s"></i>')];
    // mescolate, ma uguali nelle due metà dello schermo (stesso seme)
    body = `<div class="pp-shapes">${shuffle(seeded(p.blue * 31 + p.red), shapes).join('')}</div>`;
  } else body = `<div class="pp-duel-text">${esc(p.text)}</div>`;
  return `<div class="pp-duel-q">${esc(p.question)}</div>${body}`;
}

export const duello: PassGame = (ctx) => {
  const t = new Timers();
  const target = Number(ctx.options.target) || 5;
  const interval = promptInterval(ctx.options.speed);
  const ladder = new DuelloLadder(ctx.players, Math.random);
  const points: Record<string, number> = {};

  const intro = () => {
    const a = ladder.champion;
    const b = ladder.challenger!;
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <h2>⚡ ${tag(a)} contro ${tag(b)}</h2>
        <p>Posate il telefono <b>piatto</b> tra voi: ${tag(a)} dal lato in basso, ${tag(b)} dal lato in alto (le scritte sono capovolte per lui).</p>
        <p class="pp-note">Se la frase è <b>VERA</b> colpisci per primo il tuo bottone: +1. Se è <b>FALSA</b> e premi: −1. Si vince a ${target}.</p>
        <button class="pp-btn big" data-act="go">▶ Via!</button>
      </div>`,
      { go: () => countdown(ctx.root, t, ctx.sfx, { title: 'Dita pronte…', onDone: () => play(a, b) }) }
    );
  };

  const play = (a: (typeof ctx.players)[number], b: (typeof ctx.players)[number]) => {
    const match = new DuelloMatch([a, b], target);
    let timer = 0;
    ctx.root.onclick = null;
    ctx.root.innerHTML = `
      <div class="pp-duel">
        <div class="pp-duel-half top" data-side="1" style="--pc:${b.color}">
          <div class="pp-duel-score"><span>${esc(b.name)}</span><b data-score="1">0</b></div>
          <div class="pp-duel-card" data-card="1"></div>
          <div class="pp-duel-hit">👆 TOCCA QUI SE È VERO</div>
        </div>
        <div class="pp-duel-half bottom" data-side="0" style="--pc:${a.color}">
          <div class="pp-duel-score"><span>${esc(a.name)}</span><b data-score="0">0</b></div>
          <div class="pp-duel-card" data-card="0"></div>
          <div class="pp-duel-hit">👆 TOCCA QUI SE È VERO</div>
        </div>
      </div>`;
    const flash = (side: 0 | 1, cls: string) => {
      const el = ctx.root.querySelector<HTMLElement>(`[data-side="${side}"]`);
      if (!el) return;
      el.classList.remove('hit', 'miss');
      void el.offsetWidth;
      el.classList.add(cls);
    };
    const showPrompt = () => {
      match.next(makePrompt(Math.random));
      const html = promptHtml(match.prompt);
      ctx.root.querySelectorAll<HTMLElement>('[data-card]').forEach((c) => {
        c.innerHTML = html;
        c.dataset.truth = match.prompt.truth ? '1' : '0'; // invisibile: serve alle prove automatiche
      });
      t.stop(timer);
      timer = t.after(interval, showPrompt);
    };
    const updateScores = () => match.scores.forEach((s, i) => (ctx.root.querySelector(`[data-score="${i}"]`)!.textContent = String(s)));
    ctx.root.onpointerdown = (e) => {
      const half = (e.target as HTMLElement).closest<HTMLElement>('[data-side]');
      if (!half) return;
      e.preventDefault();
      const side = Number(half.dataset.side) as 0 | 1;
      const r = match.tap(side);
      if (r === 'ignored') return;
      if (r === 'point') {
        ctx.sfx.good();
        flash(side, 'hit');
      } else {
        ctx.sfx.bad();
        flash(side, 'miss');
      }
      updateScores();
      const w = match.winner;
      if (w !== null) {
        t.clear();
        ctx.root.onpointerdown = null;
        return t.after(500, () => won(w === 0 ? a : b));
      }
      if (r === 'point') {
        // punto preso: frase nuova dopo un attimo
        t.stop(timer);
        timer = t.after(600, showPrompt);
      }
    };
    showPrompt();
  };

  const won = (winner: (typeof ctx.players)[number]) => {
    ctx.sfx.fanfare();
    points[winner.id] = (points[winner.id] ?? 0) + DUELLO_WIN_POINTS;
    ctx.addPoints(winner.id, DUELLO_WIN_POINTS);
    const more = ladder.record(winner);
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-outcome citizens">🏆 ${esc(winner.name)} vince il duello! +${DUELLO_WIN_POINTS}</div>
        ${more ? `<p>Resta campione del tavolo contro ${tag(ladder.challenger!)}.</p>` : '<p>Tutti hanno sfidato il campione: torneo finito!</p>'}
        <button class="pp-btn big" data-act="next">${more ? '▶ Prossimo duello' : '🏁 Fine'}</button>
      </div>`,
      { next: () => (more ? intro() : ctx.exit({ title: `⚡ Campione del tavolo: ${winner.name}`, html: pointsList(ctx.players, points) })) }
    );
  };

  ctx.keepAwake(true);
  intro();
  return () => {
    t.clear();
    ctx.root.onpointerdown = null;
  };
};
