// 💣 Bomba Verbale — miccia segreta, ticchettio che accelera, «Passa la bomba!» e «Contesta!».

import { BOMBA_CATEGORIES, BOMBA_CHAIN_LETTERS, BOMBA_SYLLABLES } from '../data/bomba';
import { BOMBA_PODIUM, BombaGame, tickInterval } from '../logic/bomba';
import type { PassGame } from '../types';
import { esc, pointsList, screen, tag, Timers } from '../ui';

export const bomba: PassGame = (ctx) => {
  const t = new Timers();
  const game = new BombaGame(ctx.players, { lives: Number(ctx.options.lives) || 3, trigger: ctx.options.trigger, fuse: ctx.options.fuse },
    Math.random,
    { sillabe: ctx.deck('bomba:sillabe', BOMBA_SYLLABLES), categorie: ctx.deck('bomba:categorie', BOMBA_CATEGORIES), lettere: ctx.deck('bomba:lettere', BOMBA_CHAIN_LETTERS) }
  );

  const hearts = () =>
    `<div class="pp-lives">${ctx.players
      .map((p) => {
        const n = game.lives.get(p.id) ?? 0;
        return `<span class="${n ? '' : 'out'}">${tag(p)} ${n ? '❤️'.repeat(n) : '💀'}</span>`;
      })
      .join('')}</div>`;

  // shortcut: un solo frame saltato, bastano i 100 ms di cap per il resto
  let skipFrame = false;
  const onVis = () => (skipFrame = true);
  document.addEventListener('visibilitychange', onVis);

  const roundIntro = () => {
    game.startRound();
    screen(
      ctx.root,
      `<div class="pp-center pp-stack">
        <div class="pp-muted">Round ${game.round}</div>
        <div class="pp-card"><div class="pp-card-title">${esc(game.trigger.title)}</div><div class="pp-big-text">${esc(game.trigger.text)}</div></div>
        <p>La bomba parte da ${tag(game.holderPlayer)}</p>
        ${hearts()}
        <button class="pp-btn big danger" data-act="go">🔥 Accendi la miccia</button>
      </div>`,
      { go: play }
    );
  };

  const play = () => {
    let tickAcc = 0;
    let passLock = 0;
    const draw = () => {
      const canContest = game.canContest;
      screen(
        ctx.root,
        `<div class="pp-bomb ${game.paused ? 'paused' : ''}">
          <div class="pp-card"><div class="pp-card-title">${esc(game.trigger.title)}</div><div class="pp-big-text">${esc(game.trigger.text)}</div></div>
          <div class="pp-bomb-icon">💣</div>
          <div class="pp-muted">Ce l’ha in mano</div>
          <div class="pp-holder" style="--pc:${game.holderPlayer.color}">${esc(game.holderPlayer.name)}</div>
          <button class="pp-btn huge" data-act="pass">👋 PASSA A ${esc(game.nextPlayer.name.toUpperCase())}</button>
          <button class="pp-btn ghost small" data-act="contest" ${canContest ? '' : 'disabled'}>🚨 Contesta la parola di ${canContest ? esc(game.players[game.prevHolder!].name) : '…'}</button>
        </div>`,
        {
          pass: () => {
            const now = performance.now();
            if (now < passLock) return;
            passLock = now + 400;
            game.pass();
            ctx.sfx.vibrate(30);
            draw();
          },
          contest
        }
      );
    };
    const contest = () => {
      const prev = game.players[game.prevHolder!];
      game.contest();
      screen(
        ctx.root,
        `<div class="pp-center pp-stack">
          <h2>🚨 Contestazione!</h2>
          <p>La miccia è in pausa. La parola di ${tag(prev)} era valida (esiste e non era già stata detta)?</p>
          <button class="pp-btn big" data-act="ok">✅ Valida, si continua</button>
          <button class="pp-btn big danger" data-act="no">❌ Non valida: la bomba torna a ${esc(prev.name)}</button>
        </div>`,
        {
          ok: () => {
            game.resolveContest(true);
            draw();
          },
          no: () => {
            game.resolveContest(false);
            ctx.sfx.bad();
            draw();
          }
        }
      );
    };
    draw();
    t.loop((dt) => {
      if (game.paused) return;
      if (skipFrame) { skipFrame = false; return; } // dopo background/blocco schermo la miccia non avanza
      if (game.advance(dt)) {
        boom();
        return false;
      }
      tickAcc += dt;
      if (tickAcc >= tickInterval(game.elapsed, game.fuse)) {
        tickAcc = 0;
        ctx.sfx.tick();
      }
    });
  };

  const boom = () => {
    ctx.sfx.boom();
    ctx.sfx.vibrate([300, 100, 300]);
    const loser = game.explode();
    const left = game.lives.get(loser.id) ?? 0;
    screen(
      ctx.root,
      `<div class="pp-center pp-stack pp-boom">
        <div class="pp-boom-text">💥 BOOM!</div>
        <h2>${tag(loser)} ${left > 0 ? `perde una vita (${'❤️'.repeat(left)})` : 'è fuori! 💀'}</h2>
        ${hearts()}
        <button class="pp-btn big" data-act="next">${game.over ? '🏆 Classifica' : '▶ Prossimo round'}</button>
      </div>`,
      { next: () => (game.over ? finish() : roundIntro()) }
    );
  };

  const finish = () => {
    const points: Record<string, number> = {};
    game.ranking().forEach((p, i) => {
      const n = BOMBA_PODIUM[i] ?? 0;
      if (n) {
        points[p.id] = n;
        ctx.addPoints(p.id, n);
      }
    });
    const winner = game.ranking()[0];
    ctx.exit({ title: `💣 ${winner.name} è sopravvissuto alla bomba!`, html: pointsList(ctx.players, points) });
  };

  ctx.keepAwake(true);
  screen(
    ctx.root,
    `<div class="pp-center pp-stack">
      <h2>💣 Bomba Verbale</h2>
      <p>Chi ha il telefono dice una parola valida ad alta voce e tocca <b>«Passa»</b>, poi lo dà al vicino.</p>
      <p>La miccia è <b>segreta</b>: quando esplode, chi ha il telefono perde una vita. Ultimo sopravvissuto vince!</p>
      <p class="pp-muted">🔊 Alzate il volume: il ticchettio accelera verso la fine.</p>
      <button class="pp-btn big" data-act="go">▶ Cominciamo</button>
    </div>`,
    { go: roundIntro }
  );
  return () => {
    t.clear();
    document.removeEventListener('visibilitychange', onVis);
  };
};
