import { powerParams } from '../../../shared/powers';

/**
 * BOMBETTE: dopo una breve miccia esplodono e cancellano una parte delle lettere
 * di ogni risposta (la percentuale cresce con lo stack). Non si "puliscono":
 * bisogna indovinare la risposta dalle lettere rimaste.
 */
export function applyBombs(buttons: HTMLElement[], stack: number): () => void {
  const { hiddenRatio } = powerParams('BOMB', stack);
  const timers: number[] = [];
  const bombs: HTMLElement[] = [];

  buttons.forEach((btn, i) => {
    const textEl = btn.querySelector<HTMLElement>('.ans-text');
    if (!textEl) return;
    const bomb = document.createElement('span');
    bomb.className = 'fx-bomb';
    bomb.textContent = '💣';
    btn.appendChild(bomb);
    bombs.push(bomb);

    timers.push(
      window.setTimeout(() => {
        bomb.textContent = '💥';
        bomb.classList.add('boom');
        navigator.vibrate?.(40);
        // Risposte illustrate (es. bandiere): le bombette anneriscono pezzi dell'immagine.
        if (btn.querySelector('.ans-img')) scorch(btn, hiddenRatio);
        else blast(textEl, hiddenRatio);
        timers.push(window.setTimeout(() => bomb.remove(), 500));
      }, 650 + i * 160)
    );
  });

  return () => {
    timers.forEach(clearTimeout);
    bombs.forEach((b) => b.remove());
  };
}

function scorch(btn: HTMLElement, ratio: number) {
  const n = 2 + Math.round(ratio * 6);
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'scorch';
    s.style.left = `${15 + Math.random() * 70}%`;
    s.style.top = `${10 + Math.random() * 80}%`;
    s.style.setProperty('--size', `${30 + Math.random() * 30}%`);
    btn.appendChild(s);
  }
}

function blast(el: HTMLElement, ratio: number) {
  const chars = [...(el.textContent ?? '')];
  const letters = chars.map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0);
  const hide = new Set(
    letters
      .map((i) => ({ i, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, Math.ceil(letters.length * ratio))
      .map((x) => x.i)
  );
  el.textContent = '';
  chars.forEach((ch, i) => {
    if (hide.has(i)) {
      const s = document.createElement('span');
      s.className = 'blast';
      el.appendChild(s);
    } else {
      el.appendChild(document.createTextNode(ch));
    }
  });
}
