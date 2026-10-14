import { PACK_LIMITS } from '../../shared/packs';
import type { PhoneQuestion } from '../../shared/types';
import { esc, OPTION_COLORS, OPTION_LETTERS } from '../common/net';

type Kind = PhoneQuestion['type'];

/**
 * Foglio "Aggiungi una domanda" della lobby. Le domande finiscono nel pacchetto
 * «Domande degli amici», modificabile poi dal Laboratorio sul PC.
 */
export function addQuestionSheet(
  root: HTMLElement,
  lastCategory: string,
  onSubmit: (q: PhoneQuestion) => Promise<boolean>,
  onClose: () => void
): () => void {
  let kind: Kind = 'multiple';
  let correct = 0;
  let tf: boolean | null = null;

  const draw = (keep?: FormData) => {
    const v = (name: string, fallback = '') => esc(String(keep?.get(name) ?? fallback));
    root.innerHTML = `
      <form class="view sheet">
        <div class="title">➕ Nuova domanda</div>
        <div class="seg">
          ${(['multiple', 'truefalse', 'numeric'] as Kind[]).map((k) => `<button type="button" data-kind="${k}" class="${k === kind ? 'on' : ''}">${{ multiple: 'Multipla', truefalse: 'Vero/Falso', numeric: 'Numero' }[k]}</button>`).join('')}
        </div>
        <label>Categoria<input name="cat" maxlength="${PACK_LIMITS.CATEGORY_NAME}" value="${v('cat', lastCategory)}" required></label>
        <label>Domanda<textarea name="text" rows="3" maxlength="${PACK_LIMITS.TEXT}" required placeholder="Es: Qual è il piatto preferito di {giocatore}?">${v('text')}</textarea></label>
        ${kind === 'multiple' ? `
          <div class="muted small">Scrivi le risposte e tocca la lettera di quella giusta:</div>
          ${[0, 1, 2, 3].map((i) => `
            <div class="opt-row">
              <button type="button" class="opt-pick ${correct === i ? 'on' : ''}" data-correct="${i}" style="--oc:${OPTION_COLORS[i]}">${correct === i ? '✓' : OPTION_LETTERS[i]}</button>
              <input name="o${i}" maxlength="${PACK_LIMITS.OPTION}" value="${v(`o${i}`)}" placeholder="${i < 2 ? 'Risposta (obbligatoria)' : 'Risposta (facoltativa)'}" ${i < 2 ? 'required' : ''}>
            </div>`).join('')}` : ''}
        ${kind === 'truefalse' ? `
          <div class="tf-buttons">
            <button type="button" class="tf yes ${tf === true ? 'on' : ''}" data-tf="1">✅ VERO</button>
            <button type="button" class="tf no ${tf === false ? 'on' : ''}" data-tf="0">❌ FALSO</button>
          </div>` : ''}
        ${kind === 'numeric' ? `
          <div class="opt-row">
            <input name="num" inputmode="decimal" value="${v('num')}" placeholder="Risposta esatta" required>
            <input name="unit" maxlength="${PACK_LIMITS.UNIT}" value="${v('unit')}" placeholder="Unità (es. km)" class="unit">
          </div>` : ''}
        <p class="muted small">💡 Scrivi <b>{giocatore}</b> per inserire il nome di un amico a caso.</p>
        <button class="btn big" type="submit">Aggiungi la domanda</button>
        <button class="link-btn" type="button" data-act="close">Chiudi</button>
      </form>`;
  };
  draw();

  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    const form = root.querySelector('form')!;
    const keep = new FormData(form);
    const k = t.closest<HTMLElement>('[data-kind]')?.dataset.kind as Kind | undefined;
    const c = t.closest<HTMLElement>('[data-correct]')?.dataset.correct;
    const v = t.closest<HTMLElement>('[data-tf]')?.dataset.tf;
    if (k) kind = k;
    if (c !== undefined) correct = Number(c);
    if (v !== undefined) tf = v === '1';
    if (k || c !== undefined || v !== undefined) draw(keep);
    if (t.closest('[data-act="close"]')) onClose();
  };
  const onSubmitEv = async (e: Event) => {
    e.preventDefault();
    const data = new FormData(root.querySelector('form')!);
    const categoryName = String(data.get('cat') ?? '').trim();
    const text = String(data.get('text') ?? '').trim();
    let q: PhoneQuestion;
    if (kind === 'multiple') {
      const raw = [0, 1, 2, 3].map((i) => String(data.get(`o${i}`) ?? '').trim());
      if (!raw[correct]) return alert('La risposta giusta non può essere vuota');
      const options = raw.filter(Boolean);
      q = { type: 'multiple', categoryName, text, options, correctIndex: options.indexOf(raw[correct]) };
    } else if (kind === 'truefalse') {
      if (tf === null) return alert('Indica se l\'affermazione è vera o falsa');
      q = { type: 'truefalse', categoryName, text, answer: tf };
    } else {
      q = { type: 'numeric', categoryName, text, answer: Number(String(data.get('num')).replace(',', '.')), unit: String(data.get('unit') ?? '') };
    }
    if (await onSubmit(q)) {
      correct = 0;
      tf = null;
      draw(new FormData(Object.assign(document.createElement('form'), { innerHTML: `<input name="cat" value="${esc(categoryName)}">` })));
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmitEv);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmitEv);
  };
}
