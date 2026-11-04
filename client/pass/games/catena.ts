// 🎨 Catena Scarabocchiata — frase → disegno → titolo → disegno…, poi la moviola finale e i premi.

import { CATENA_PHRASES } from '../data/social';
import { CATENA_AWARD_POINTS, CatenaChain, type ChainStep } from '../logic/catena';
import type { PassGame, Player } from '../types';
import { cover, esc, pointsList, screen, tag, Timers } from '../ui';

const COLORS = ['#14101f', '#ff4d6d', '#2f80ed', '#27ae60'];

/** Lavagna touch: 4 colori, gomma e «cancella tutto». Restituisce la funzione che esporta il disegno. */
function sketchpad(host: HTMLElement): () => string {
  host.innerHTML = `
    <canvas class="pp-canvas"></canvas>
    <div class="pp-tools">
      ${COLORS.map((c, i) => `<button class="pp-swatch ${i === 0 ? 'on' : ''}" data-color="${c}" style="--sw:${c}" aria-label="Colore"></button>`).join('')}
      <button class="pp-swatch eraser" data-color="eraser" aria-label="Gomma">🧽</button>
      <button class="pp-swatch" data-clear aria-label="Cancella tutto">🗑️</button>
    </div>`;
  const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
  const size = Math.min(host.clientWidth || 320, 520);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * ratio);
  canvas.style.width = canvas.style.height = `${size}px`;
  const g = canvas.getContext('2d')!;
  g.scale(ratio, ratio);
  const clear = () => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
  };
  clear();
  g.lineCap = g.lineJoin = 'round';
  let color = COLORS[0];
  let last: { x: number; y: number } | null = null;
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    last = pos(e);
    g.beginPath();
    g.fillStyle = color === 'eraser' ? '#ffffff' : color;
    g.arc(last.x, last.y, color === 'eraser' ? 9 : 2.5, 0, Math.PI * 2);
    g.fill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pos(e);
    g.strokeStyle = color === 'eraser' ? '#ffffff' : color;
    g.lineWidth = color === 'eraser' ? 18 : 5;
    g.beginPath();
    g.moveTo(last.x, last.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last = p;
  });
  const up = () => (last = null);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  host.querySelector('.pp-tools')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.hasAttribute('data-clear')) return clear();
    color = b.dataset.color!;
    host.querySelectorAll('.pp-swatch').forEach((s) => s.classList.toggle('on', s === b));
  });
  return () => canvas.toDataURL('image/jpeg', 0.7);
}

export const catena: PassGame = (ctx) => {
  const t = new Timers();
  const drawSecs = Number(ctx.options.draw) || 25;
  const phrases = ctx.deck('catena', CATENA_PHRASES);
  const chain = new CatenaChain(ctx.players);
  const points: Record<string, number> = {};
  const byId = (id: string) => ctx.players.find((p) => p.id === id)!;

  const step = () => {
    if (chain.complete) return finale();
    const p = chain.currentPlayer;
    const kind = chain.currentKind;
    const label = kind === 'phrase' ? 'Scegli la frase di partenza' : kind === 'draw' ? `Disegna (${drawSecs} s)` : 'Indovina il disegno';
    cover(ctx.root, p, { title: `Passo ${chain.steps.length + 1} di ${chain.length}: ${label}`, onGo: () => (kind === 'phrase' ? phrase(p) : kind === 'draw' ? draw(p) : guess(p)) });
  };

  const phrase = (p: Player) => {
    if (ctx.options.start === 'write') {
      screen(
        ctx.root,
        `<div class="pp-stack">
          <h2>✍️ ${tag(p)}, scrivi una frase da disegnare</h2>
          <p class="pp-muted">Qualcosa di buffo ma disegnabile (es. «${esc(phrases.draw())}»).</p>
          <textarea class="pp-input" maxlength="80" rows="3" placeholder="La tua frase…"></textarea>
          <button class="pp-btn big" data-act="ok">✅ Fatto, passa</button>
        </div>`,
        {
          ok: () => {
            const v = ctx.root.querySelector<HTMLTextAreaElement>('textarea')!.value.trim();
            chain.add(v || phrases.draw());
            step();
          }
        }
      );
      return;
    }
    let current = phrases.draw();
    const render = () =>
      screen(
        ctx.root,
        `<div class="pp-stack">
          <h2>🎲 La frase segreta di ${tag(p)}</h2>
          <div class="pp-card"><div class="pp-big-text">${esc(current)}</div></div>
          <button class="pp-btn ghost" data-act="other">🎲 Un’altra</button>
          <button class="pp-btn big" data-act="ok">✅ Usa questa e passa</button>
        </div>`,
        {
          other: () => {
            current = phrases.draw();
            render();
          },
          ok: () => {
            chain.add(current);
            step();
          }
        }
      );
    render();
  };

  const draw = (p: Player) => {
    const text = chain.lastText();
    screen(
      ctx.root,
      `<div class="pp-stack tight">
        <div class="pp-row space"><span>✏️ ${tag(p)} disegna:</span><span class="pp-timer" data-left>${drawSecs}</span></div>
        <div class="pp-card small"><b>${esc(text)}</b></div>
        <div class="pp-pad" data-pad></div>
        <button class="pp-btn big" data-act="done">✅ Ho finito</button>
      </div>`,
      { done: () => finish() }
    );
    const exportPad = sketchpad(ctx.root.querySelector<HTMLElement>('[data-pad]')!);
    const endAt = performance.now() + drawSecs * 1000;
    let finished = false;
    let last = drawSecs;
    const finish = () => {
      if (finished) return;
      finished = true;
      t.clear();
      chain.add(exportPad());
      step();
    };
    t.loop(() => {
      const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
      if (left !== last) {
        last = left;
        const el = ctx.root.querySelector('[data-left]');
        if (el) el.textContent = String(left);
        if (left <= 5 && left > 0) ctx.sfx.tick();
      }
      if (left <= 0) {
        ctx.sfx.beep(true);
        finish();
        return false;
      }
    });
  };

  const guess = (p: Player) => {
    const img = chain.visible?.content ?? '';
    screen(
      ctx.root,
      `<div class="pp-stack tight">
        <h2>🤔 ${tag(p)}, cosa vedi?</h2>
        ${img ? `<img class="pp-drawing" src="${img}" alt="Disegno">` : '<p class="pp-muted">(Il disegno è vuoto: inventa tu!)</p>'}
        <input class="pp-input" maxlength="80" placeholder="Secondo me è…">
        <button class="pp-btn big" data-act="ok">✅ Invia e passa</button>
      </div>`,
      {
        ok: () => {
          const v = ctx.root.querySelector<HTMLInputElement>('input')!.value.trim();
          chain.add(v || '???');
          step();
        }
      }
    );
  };

  const show = (s: ChainStep, isNew: boolean) => {
    const who = tag(byId(s.playerId));
    const cls = `pp-reel-item${isNew ? ' new' : ''}`;
    if (s.kind === 'draw') return `<li class="${cls}"><div class="pp-muted">${who} ha disegnato</div><img class="pp-drawing" src="${s.content}" alt="Disegno"></li>`;
    return `<li class="${cls}"><div class="pp-muted">${who} ${s.kind === 'phrase' ? 'ha iniziato con' : 'ha capito'}</div><div class="pp-big-text small">«${esc(s.content)}»</div></li>`;
  };

  const finale = () => {
    let shown = 1;
    const render = () =>
      screen(
        ctx.root,
        `<div class="pp-stack">
          <h2>🎬 La moviola della catena</h2>
          <ol class="pp-reel">${chain.steps.slice(0, shown).map((s, i) => show(s, i === shown - 1)).join('')}</ol>
          ${shown < chain.steps.length ? '<button class="pp-btn big" data-act="more">▶ Avanti</button>' : '<button class="pp-btn big" data-act="awards">🏆 Premiazione</button>'}
        </div>`,
        {
          more: () => {
            shown++;
            ctx.sfx.tick();
            render();
            ctx.root.querySelector('.pp-reel-item:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
          awards
        }
      );
    render();
  };

  const award = (title: string, kind: 'draw' | 'guess', next: () => void) => {
    const ids = [...new Set(chain.candidates(kind))];
    screen(
      ctx.root,
      `<div class="pp-stack">
        <h2>${title}</h2>
        <p class="pp-muted">Il tavolo decide: +${CATENA_AWARD_POINTS} punti.</p>
        <div class="pp-grid-players">${ids.map((id) => `<button class="pp-player-btn" data-act="pick" data-id="${id}" style="--pc:${byId(id).color}">${esc(byId(id).name)}</button>`).join('')}</div>
        <button class="pp-btn ghost" data-act="skip">Nessuno</button>
      </div>`,
      {
        pick: (el) => {
          const id = el.dataset.id!;
          points[id] = (points[id] ?? 0) + CATENA_AWARD_POINTS;
          ctx.addPoints(id, CATENA_AWARD_POINTS);
          ctx.sfx.good();
          next();
        },
        skip: next
      }
    );
  };

  const awards = () =>
    award('🏆 Miglior capolavoro', 'draw', () =>
      chain.candidates('guess').length
        ? award('😂 Peggior fraintendimento', 'guess', end)
        : end()
    );

  const end = () => ctx.exit({ title: '🎨 Catena Scarabocchiata', html: pointsList(ctx.players, points) });

  ctx.keepAwake(true);
  step();
  return () => t.clear();
};
