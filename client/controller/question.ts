import { POWERS } from '../../shared/powers';
import type { IncomingEffect, PowerType, QuestionPublic } from '../../shared/types';
import { clock, esc, OPTION_COLORS, OPTION_LETTERS } from '../common/net';
import { applyBombs } from './effects/bomb';
import { applyGoo } from './effects/goo';
import { applyIce } from './effects/ice';
import { applyLocks } from './effects/lock';

export interface QuestionOpts {
  answered: number | null;
  /** Opzioni eliminate dal 50:50. */
  removed: number[];
  /** Il Più Veloce: hai sbagliato, sei fuori per questa domanda. */
  blocked: boolean;
  /** Riga sopra la domanda (es. "💣 Hai la bomba!"). */
  banner?: string;
  /** Testo mostrato dopo aver risposto. */
  waitText?: string;
  onAnswer(index: number): void;
  onCleared(type: PowerType): void;
}

/** Applica gli effetti subiti a strati, dal più basso al più alto (il ghiaccio va rotto per primo). */
export function applyEffects(
  effects: IncomingEffect[],
  targets: { area: HTMLElement; bombs: () => (() => void) | void; locks: HTMLElement[] },
  onCleared: (type: PowerType) => void
): () => void {
  const cleanups: (() => void)[] = [];
  const sorted = effects.slice().sort((a, b) => POWERS[a.type].layer - POWERS[b.type].layer);
  for (const e of sorted) {
    const done = () => onCleared(e.type);
    if (e.type === 'BOMB') {
      const c = targets.bombs();
      if (c) cleanups.push(c);
    }
    if (e.type === 'LOCK' && targets.locks.length) cleanups.push(applyLocks(targets.locks, e.stack, done));
    if (e.type === 'GOO') cleanups.push(applyGoo(targets.area, e.stack, done));
    if (e.type === 'ICE') cleanups.push(applyIce(targets.area, e.stack, done));
  }
  return () => cleanups.forEach((c) => c());
}

export function hitBanner(effects: IncomingEffect[]) {
  const sorted = effects.slice().sort((a, b) => POWERS[b.type].layer - POWERS[a.type].layer);
  return `<div class="hit-banner pop">${sorted.map((e) => `${POWERS[e.type].icon}${e.stack > 1 ? `×${e.stack}` : ''}`).join(' ')} <span>Ti hanno colpito!</span></div>`;
}

/** Testo della domanda svelato parola per parola (Indizio dopo Indizio). */
export function startClue(el: HTMLElement, q: QuestionPublic): () => void {
  if (!q.clue) return () => {};
  const words = q.text.split(/\s+/);
  const { startedAt, wordMs } = q.clue;
  const draw = () => {
    const shown = Math.min(words.length, Math.max(1, Math.floor((clock.now() - startedAt) / wordMs) + 1));
    el.innerHTML = words.map((w, i) => (i < shown ? esc(w) : `<span class="clue-hidden">${'▮'.repeat(Math.min(6, w.length))}</span>`)).join(' ');
    return shown >= words.length;
  };
  if (draw()) return () => {};
  const t = setInterval(() => {
    if (draw()) clearInterval(t);
  }, 120);
  return () => clearInterval(t);
}

export function questionView(root: HTMLElement, q: QuestionPublic, effects: IncomingEffect[], opts: QuestionOpts): () => void {
  const locked = opts.answered !== null || opts.blocked;
  root.innerHTML = `
    <div class="question">
      ${!locked && effects.length ? hitBanner(effects) : ''}
      ${opts.banner ? `<div class="q-banner pop">${opts.banner}</div>` : ''}
      <div class="q-meta"><span class="chip" style="background:${q.category.color}">${q.category.icon} ${esc(q.category.name)}</span>
        ${q.total ? `<span class="chip">${q.number}/${q.total}</span>` : ''}</div>
      <p class="q-text">${esc(q.text)}</p>
      ${q.image ? `<img class="q-image" src="${esc(q.image)}" alt="">` : ''}
      <div class="answers ${q.options.length === 2 ? 'two' : ''} ${q.optionImages ? 'img-opts' : ''}">
        ${q.options.map((o, i) => {
          const removed = opts.removed.includes(i);
          const content = q.optionImages
            ? `<img class="ans-img" src="${esc(q.optionImages[i])}" alt=""><span class="ans-text sr-only">${esc(o)}</span>`
            : `<span class="ans-text">${esc(o)}</span>`;
          return `
          <button class="ans opt-${i} ${opts.answered === i ? 'chosen' : ''} ${removed ? 'removed' : ''}" data-i="${i}" style="--oc:${OPTION_COLORS[i]}" ${locked || removed ? 'disabled' : ''}>
            <b>${removed ? '✂️' : OPTION_LETTERS[i]}</b>${content}
          </button>`;
        }).join('')}
      </div>
      ${opts.blocked ? '<div class="waiting bad pop">❌ Sbagliato! Sei fuori per questa domanda</div>' : opts.answered !== null ? `<div class="waiting pop">${opts.waitText ?? 'Risposta inviata! Guarda lo schermo 📺'}</div>` : ''}
    </div>`;

  const area = root.querySelector<HTMLElement>('.answers')!;
  const buttons = [...area.querySelectorAll<HTMLButtonElement>('.ans:not(.removed)')];
  const stopClue = startClue(root.querySelector<HTMLElement>('.q-text')!, q);
  let sent = locked;

  area.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.ans');
    if (!btn || sent || btn.disabled || btn.querySelector('.fx-lock')) return;
    sent = true;
    navigator.vibrate?.(20);
    btn.classList.add('chosen');
    buttons.forEach((b) => (b.disabled = true));
    opts.onAnswer(Number(btn.dataset.i));
  });

  if (locked || effects.length === 0) return stopClue;
  const stopEffects = applyEffects(effects, { area, bombs: () => applyBombs(buttons, effects.find((e) => e.type === 'BOMB')!.stack), locks: buttons }, opts.onCleared);
  return () => {
    stopClue();
    stopEffects();
  };
}
