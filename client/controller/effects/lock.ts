import { powerParams } from '../../../shared/powers';

/**
 * LUCCHETTO: blocca alcune risposte a caso (di più con lo stack). Per sbloccarne una
 * bisogna tenerla premuta finché l'anello si riempie; se si stacca il dito, si ricomincia.
 */
export function applyLocks(buttons: HTMLElement[], stack: number, onCleared: () => void): () => void {
  const { lockedOptions, holdMs } = powerParams('LOCK', stack);
  const targets = buttons
    .map((b) => ({ b, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, lockedOptions)
    .map((x) => x.b);
  let remaining = targets.length;
  const overlays: HTMLElement[] = [];
  const frames = new Set<number>();
  const CIRC = 2 * Math.PI * 26;

  for (const btn of targets) {
    const ov = document.createElement('div');
    ov.className = 'fx-lock';
    ov.innerHTML = `
      <svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" class="ring-bg"/><circle cx="30" cy="30" r="26" class="ring" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>
      <span class="lock-icon">🔒</span><small>Tieni premuto</small>`;
    btn.appendChild(ov);
    overlays.push(ov);
    const ring = ov.querySelector<SVGCircleElement>('.ring')!;
    let start = 0;
    let frame = 0;

    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / holdMs);
      ring.setAttribute('stroke-dashoffset', String(CIRC * (1 - p)));
      if (p >= 1) return unlock();
      frame = requestAnimationFrame(tick);
      frames.add(frame);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      ring.setAttribute('stroke-dashoffset', String(CIRC));
    };
    const unlock = () => {
      ov.classList.add('open');
      ov.querySelector('.lock-icon')!.textContent = '🔓';
      navigator.vibrate?.(30);
      ov.replaceWith(ov.cloneNode(true)); // rimuove i listener
      const ghost = btn.querySelector('.fx-lock');
      setTimeout(() => ghost?.remove(), 350);
      if (--remaining === 0) onCleared();
    };

    ov.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ov.setPointerCapture(e.pointerId);
      start = performance.now();
      navigator.vibrate?.(8);
      tick();
    });
    ov.addEventListener('pointerup', stop);
    ov.addEventListener('pointercancel', stop);
    ov.addEventListener('click', (e) => e.stopPropagation());
  }

  return () => {
    frames.forEach(cancelAnimationFrame);
    overlays.forEach((o) => o.remove());
  };
}
