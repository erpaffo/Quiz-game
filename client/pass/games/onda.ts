// 📡 Lunghezza d'Onda — il sensitivo vede il bersaglio, dà un indizio; il tavolo sposta l'ago.

import { betWins, ondaPlan, ondaScore, ondaTarget } from '../logic/onda';
import { ONDA_SPECTRA, type Spectrum } from '../data/onda';
import type { PassGame, Player } from '../types';
import { esc, pointsList, screen, shield, tag, Timers } from '../ui';

/** Barra dei due opposti con (facoltativi) bande del bersaglio e ago. */
function dial(sp: Spectrum, o: { target?: number; needle?: number; bands?: boolean }) {
  const band = (w: number, cls: string) =>
    o.target === undefined ? '' : `<i class="pp-band ${cls}" style="left:${Math.max(0, o.target - w)}%;width:${Math.min(100, o.target + w) - Math.max(0, o.target - w)}%"></i>`;
  return `
    <div class="pp-dial">
      <div class="pp-dial-labels"><span>${esc(sp.left)}</span><span>${esc(sp.right)}</span></div>
      <div class="pp-dial-bar">
        ${o.bands ? band(16, 'b2') + band(10, 'b3') + band(4, 'b4') : ''}
        ${o.target !== undefined && !o.bands ? `<i class="pp-target" style="left:${o.target}%"></i>` : ''}
        ${o.needle !== undefined ? `<i class="pp-needle" style="left:${o.needle}%"></i>` : ''}
      </div>
      <div class="pp-dial-scale"><span>0</span><span>50</span><span>100</span></div>
    </div>`;
}

export const onda: PassGame = (ctx) => {
  const t = new Timers();
  const plan = ondaPlan(ctx.players, Number(ctx.options.rounds) || 1);
  const deck = ctx.deck('onda', ONDA_SPECTRA, (s) => s.left + '|' + s.right);
  const betOn = ctx.options.bet === 'on';
  const points: Record<string, number> = {};
  let teamScore = 0;
  let idx = 0;

  const add = (id: string, n: number) => {
    if (!n) return;
    points[id] = (points[id] ?? 0) + n;
    ctx.addPoints(id, n);
  };

  const round = () => {
    if (idx >= plan.length) {
      return ctx.exit({
        title: `📡 Il tavolo ha fatto ${teamScore} punti su ${plan.length * 4}`,
        html: pointsList(ctx.players, points)
      });
    }
    const psychic = plan[idx];
    const sp = deck.draw();
    const target = ondaTarget(Math.random);
    shield(ctx.root, {
      player: psychic,
      title: `Sei il sensitivo (giro ${idx + 1} di ${plan.length})`,
      secretHtml: `<div class="pp-secret-card wide">${dial(sp, { target })}<div class="pp-role">🎯 ${target}</div><small>Pensa a un indizio che stia proprio lì.</small></div>`,
      doneLabel: 'Nascondi il bersaglio',
      onDone: () => guess(psychic, sp, target)
    });
  };

  const guess = (psychic: Player, sp: Spectrum, target: number) => {
    let needle = 50;
    screen(
      ctx.root,
      `<div class="pp-stack">
        <h2>🗣️ ${tag(psychic)}, di’ il tuo indizio!</h2>
        <p class="pp-muted">Posate il telefono al centro: il tavolo discute e sposta l’ago.</p>
        <div data-dial>${dial(sp, { needle })}</div>
        <input class="pp-range" type="range" min="0" max="100" value="50" aria-label="Ago">
        <div class="pp-center"><b data-val>50</b></div>
        <button class="pp-btn big" data-act="lock">🔒 Conferma l’ago</button>
      </div>`,
      { lock: () => (betOn && ctx.players.length > 2 ? bet(psychic, sp, target, needle) : reveal(psychic, sp, target, needle, null)) }
    );
    const range = ctx.root.querySelector<HTMLInputElement>('.pp-range')!;
    range.addEventListener('input', () => {
      needle = Number(range.value);
      ctx.root.querySelector('[data-dial]')!.innerHTML = dial(sp, { needle });
      ctx.root.querySelector('[data-val]')!.textContent = String(needle);
    });
  };

  const bet = (psychic: Player, sp: Spectrum, target: number, needle: number) => {
    const bettor = ctx.players[(ctx.players.indexOf(psychic) + 1) % ctx.players.length];
    screen(
      ctx.root,
      `<div class="pp-stack">
        <h2>🎲 Scommessa di ${tag(bettor)}</h2>
        <p>Il bersaglio è più a sinistra o più a destra dell’ago?</p>
        ${dial(sp, { needle })}
        <div class="pp-row"><button class="pp-btn big" data-act="left">◀ Sinistra</button><button class="pp-btn big" data-act="right">Destra ▶</button></div>
      </div>`,
      {
        left: () => reveal(psychic, sp, target, needle, { bettor, side: 'left' }),
        right: () => reveal(psychic, sp, target, needle, { bettor, side: 'right' })
      }
    );
  };

  const reveal = (psychic: Player, sp: Spectrum, target: number, needle: number, b: { bettor: Player; side: 'left' | 'right' } | null) => {
    screen(
      ctx.root,
      `<div class="pp-stack">
        <h2>Pronti alla rivelazione?</h2>
        <div class="pp-curtain-wrap">${dial(sp, { needle })}<div class="pp-curtain"></div></div>
        <button class="pp-btn huge" data-act="go">🎯 RIVELA IL BERSAGLIO</button>
      </div>`,
      {
        go: () => {
          const score = ondaScore(needle, target);
          teamScore += score;
          add(psychic.id, score);
          const betOk = b ? betWins(needle, target, b.side) : false;
          if (b && betOk) add(b.bettor.id, 1);
          if (score >= 3) ctx.sfx.fanfare();
          else if (score) ctx.sfx.good();
          else ctx.sfx.bad();
          const label = score === 4 ? '🎯 Centro perfetto!' : score === 3 ? '🟩 Fascia interna!' : score === 2 ? '🟨 Fascia esterna!' : '😬 Fuori bersaglio';
          screen(
            ctx.root,
            `<div class="pp-stack">
              <div class="pp-outcome ${score ? 'citizens' : 'impostors'}">${label} +${score}</div>
              ${dial(sp, { target, needle, bands: true })}
              <p>Bersaglio <b>${target}</b> · ago <b>${needle}</b> · punti a ${tag(psychic)}</p>
              ${b ? `<p>${tag(b.bettor)} aveva scommesso ${b.side === 'left' ? '◀ sinistra' : 'destra ▶'}: ${betOk ? '✅ +1' : '❌'}</p>` : ''}
              <button class="pp-btn big" data-act="next">${idx + 1 < plan.length ? '▶ Prossimo sensitivo' : '🏁 Fine'}</button>
            </div>`,
            {
              next: () => {
                idx++;
                round();
              }
            }
          );
        }
      }
    );
  };

  ctx.keepAwake(true);
  round();
  return () => t.clear();
};
