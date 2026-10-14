import { powerParams } from '../../../shared/powers';

/**
 * GHIACCIO: una lastra congelata copre le risposte. Ogni tocco aggiunge crepe;
 * al numero di tocchi richiesto (cresce con lo stack) la lastra va in frantumi.
 */
export function applyIce(area: HTMLElement, stack: number, onCleared: () => void): () => void {
  const { taps } = powerParams('ICE', stack);
  const el = document.createElement('div');
  el.className = 'fx fx-ice';
  el.innerHTML = `
    <svg class="cracks" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
    <div class="fx-label">🧊 Tocca per rompere il ghiaccio! <b>${taps}</b>${stack > 1 ? ` <small>×${stack}</small>` : ''}</div>`;
  area.appendChild(el);
  const svg = el.querySelector('svg')!;
  const counter = el.querySelector('b')!;
  const shards: HTMLElement[] = [];
  let hits = 0;

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    hits++;
    const r = el.getBoundingClientRect();
    addCrack(svg, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100, hits / taps);
    el.style.setProperty('--frost', String(1 - (hits / taps) * 0.55));
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    navigator.vibrate?.(12);
    counter.textContent = String(Math.max(0, taps - hits));
    if (hits >= taps) shatter();
  };
  el.addEventListener('pointerdown', onDown);

  function shatter() {
    el.removeEventListener('pointerdown', onDown);
    navigator.vibrate?.([30, 30, 60]);
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('div');
      s.className = 'ice-shard';
      const cx = (i % 4) * 25 + Math.random() * 25;
      const cy = Math.floor(i / 4) * 25 + Math.random() * 25;
      s.style.clipPath = `polygon(${cx}% ${cy}%, ${cx + 18 + Math.random() * 10}% ${cy + Math.random() * 10}%, ${cx + Math.random() * 20}% ${cy + 20 + Math.random() * 10}%)`;
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 300}px`);
      s.style.setProperty('--dy', `${120 + Math.random() * 260}px`);
      s.style.setProperty('--rot', `${(Math.random() - 0.5) * 540}deg`);
      area.appendChild(s);
      shards.push(s);
    }
    el.remove();
    setTimeout(() => shards.forEach((s) => s.remove()), 900);
    onCleared();
  }

  return () => {
    el.remove();
    shards.forEach((s) => s.remove());
  };
}

function addCrack(svg: SVGSVGElement, x: number, y: number, progress: number) {
  const branches = 3 + Math.floor(progress * 3);
  for (let b = 0; b < branches; b++) {
    let angle = Math.random() * Math.PI * 2;
    let px = x;
    let py = y;
    const pts = [`${px},${py}`];
    const segs = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < segs; i++) {
      angle += (Math.random() - 0.5) * 1.1;
      const len = 4 + Math.random() * (8 + progress * 10);
      px += Math.cos(angle) * len;
      py += Math.sin(angle) * len;
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', pts.join(' '));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
  }
}
