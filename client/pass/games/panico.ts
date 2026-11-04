// ⏱️ 5 Secondi di Panico — il vicino legge, «VIA!», tre risposte prima dello scadere.

import { PANICO_PROMPTS } from '../data/panico';
import { PanicoGame, type PanicoEvent } from '../logic/panico';
import type { PassGame } from '../types';
import { esc, pointsList, screen, tag, Timers } from '../ui';

export const panico: PassGame = (ctx) => {
  const t = new Timers();
  const seconds = Number(ctx.options.seconds) || 5;
  const game = new PanicoGame(ctx.players, Number(ctx.options.turns) || 2, ctx.deck('panico', PANICO_PROMPTS));
  const points: Record<string, number> = {};

  const nextTurn = () => {
    if (!game.nextTurn()) return ctx.exit({ title: '⏱️ 5 Secondi di Panico', html: pointsList(ctx.players, points) });
    ready(false);
  };

  const ready = (bounced: boolean) => {
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-muted">Sfida ${game.turn} di ${game.totalTurns}</div>
        <h2>🔥 Tocca a ${tag(game.examineePlayer)}</h2>
        <p>📲 ${tag(game.readerPlayer)} tiene il telefono e legge la sfida ad alta voce.</p>
        ${bounced ? '<p class="pp-note">↪️ La sfida è passata a te: servono 3 risposte <b>diverse</b> da quelle già dette!</p>' : ''}
        <div class="pp-card"><div class="pp-big-text">${esc(game.prompt)}</div></div>
        <button class="pp-btn huge" data-act="go">⏱️ VIA AI ${seconds} SECONDI!</button>
      </div>`,
      { go: run }
    );
  };

  const run = () => {
    const total = seconds * 1000;
    const endAt = performance.now() + total;
    let lastSec = seconds;
    ctx.sfx.beep();
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-ring" style="--p:1"><span data-left>${seconds.toFixed(1)}</span></div>
        <div class="pp-big-text small">${esc(game.prompt)}</div>
        <button class="pp-btn ghost" data-act="stop">✋ Ha già detto 3 risposte</button>
      </div>`,
      { stop: () => judge() }
    );
    t.loop(() => {
      const left = Math.max(0, endAt - performance.now());
      const ring = ctx.root.querySelector<HTMLElement>('.pp-ring');
      const txt = ctx.root.querySelector('[data-left]');
      if (ring) ring.style.setProperty('--p', String(left / total));
      if (txt) txt.textContent = (left / 1000).toFixed(1);
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        if (sec > 0) ctx.sfx.beep();
      }
      if (left <= 0) {
        ctx.sfx.boom();
        judge();
        return false;
      }
    });
  };

  const judge = () => {
    t.clear();
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <h2>Allora, ${tag(game.examineePlayer)}?</h2>
        <button class="pp-btn huge" data-act="ok">✅ Ce l’ha fatta! (+1)</button>
        <button class="pp-btn big danger" data-act="ko">💥 Scaduto / ripetuto</button>
      </div>`,
      { ok: () => apply(game.success()), ko: () => apply(game.fail()) }
    );
  };

  const apply = (ev: PanicoEvent) => {
    if (ev.kind === 'bounce') {
      ctx.sfx.bad();
      return ready(true);
    }
    points[ev.playerId] = (points[ev.playerId] ?? 0) + 1;
    ctx.addPoints(ev.playerId, 1);
    const p = ctx.players.find((x) => x.id === ev.playerId)!;
    if (ev.kind === 'point') ctx.sfx.good();
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <h2>${ev.kind === 'point' ? `🎉 Punto a ${tag(p)}!` : `😅 Nessuno ce l’ha fatta: punto di consolazione a ${tag(p)}`}</h2>
        <button class="pp-btn big" data-act="next">${game.done ? '🏁 Fine' : '▶ Prossima sfida'}</button>
      </div>`,
      { next: nextTurn }
    );
  };

  ctx.keepAwake(true);
  nextTurn();
  return () => t.clear();
};
