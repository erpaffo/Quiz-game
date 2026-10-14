import { powerParams } from '../../shared/powers';
import type { IncomingEffect, NumericPublic, PowerType } from '../../shared/types';
import { esc } from '../common/net';
import { applyEffects, hitBanner } from './question';

interface NumericOpts {
  submitted: number | null;
  hint: [number, number] | null;
  onSubmit(value: number): void;
  onCleared(type: PowerType): void;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '⌫'];

export function formatNumber(n: number) {
  return n.toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

/** La Stima: tastierino numerico grande, gli effetti si applicano al tastierino. */
export function numericView(root: HTMLElement, q: NumericPublic, effects: IncomingEffect[], opts: NumericOpts): () => void {
  const done = opts.submitted !== null;
  root.innerHTML = `
    <div class="question">
      ${!done && effects.length ? hitBanner(effects) : ''}
      <div class="q-meta"><span class="chip" style="background:${q.category.color}">${q.category.icon} ${esc(q.category.name)}</span>
        <span class="chip">${q.number}/${q.total}</span></div>
      <p class="q-text">${esc(q.text)}</p>
      ${q.image ? `<img class="q-image" src="${esc(q.image)}" alt="">` : ''}
      ${opts.hint ? `<div class="hint pop">✂️ Aiutino: tra <b>${formatNumber(opts.hint[0])}</b> e <b>${formatNumber(opts.hint[1])}</b></div>` : ''}
      <div class="num-display"><span>${done ? formatNumber(opts.submitted!) : ''}</span><small>${esc(q.unit)}</small></div>
      ${done
        ? '<div class="waiting pop">Stima inviata! Guarda lo schermo 📺</div>'
        : `<div class="answers keypad">
            ${KEYS.map((k) => `<button class="key" data-k="${k}"><span class="ans-text">${k}</span></button>`).join('')}
            <button class="btn big send" data-k="ok">Invia la stima ✓</button>
          </div>`}
    </div>`;
  if (done) return () => {};

  const area = root.querySelector<HTMLElement>('.answers')!;
  const display = root.querySelector<HTMLElement>('.num-display span')!;
  const send = root.querySelector<HTMLButtonElement>('.send')!;
  let value = '';
  let sent = false;

  area.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-k]');
    if (!btn || sent || btn.querySelector('.fx-lock')) return;
    const k = btn.dataset.k!;
    navigator.vibrate?.(8);
    if (k === 'ok') {
      const n = Number(value.replace(',', '.'));
      if (!value || !Number.isFinite(n)) return;
      sent = true;
      send.disabled = true;
      return opts.onSubmit(n);
    }
    if (k === '⌫') value = value.slice(0, -1);
    else if (k === ',') value = value.includes(',') || !value ? value : value + ',';
    else if (value.replace(',', '').length < 10) value = value === '0' ? k : value + k;
    display.textContent = value ? formatNumber(Number(value.replace(',', '.'))) + (value.endsWith(',') ? ',' : '') : '';
  });

  // Bombette sul tastierino: spariscono le cifre di alcuni tasti.
  const bombKeys = () => {
    const e = effects.find((x) => x.type === 'BOMB')!;
    const keys = [...area.querySelectorAll<HTMLElement>('.key .ans-text')].filter((el) => /\d/.test(el.textContent ?? ''));
    const n = Math.ceil(keys.length * powerParams('BOMB', e.stack).hiddenRatio);
    keys.sort(() => Math.random() - 0.5).slice(0, n).forEach((el) => (el.innerHTML = '<span class="blast"></span>'));
  };
  return applyEffects(effects, { area, bombs: bombKeys, locks: [send] }, opts.onCleared);
}
