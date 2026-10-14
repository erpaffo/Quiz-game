import { powerParams } from '../../../shared/powers';

const SHADES = [
  { base: '#4caf2a', dark: '#2f7d16', light: '#8be05f' },
  { base: '#3f9e22', dark: '#256b10', light: '#74cf4b' },
  { base: '#5cc93b', dark: '#3a9420', light: '#a4f07a' }
];

/**
 * MELMA: uno o più strati di melma (canvas) coprono le risposte. Il dito "cancella" la melma
 * (globalCompositeOperation = destination-out). Quando lo strato in cima è pulito oltre la
 * soglia, si stacca e scopre quello sotto. Stack = numero di strati.
 */
export function applyGoo(area: HTMLElement, stack: number, onCleared: () => void): () => void {
  const { layers, clearThreshold } = powerParams('GOO', stack);
  const wrap = document.createElement('div');
  wrap.className = 'fx fx-goo';
  area.appendChild(wrap);
  const rect = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));

  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < layers; i++) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paintGoo(c.getContext('2d')!, w, h, SHADES[i % SHADES.length]);
    wrap.appendChild(c);
    canvases.push(c);
  }
  const label = document.createElement('div');
  label.className = 'fx-label';
  wrap.appendChild(label);
  const updateLabel = () => {
    label.innerHTML = `🟢 Pulisci la melma col dito!${canvases.length > 1 ? ` <b>${canvases.length} strati</b>` : ''}`;
  };
  updateLabel();

  const probe = document.createElement('canvas');
  probe.width = 40;
  probe.height = 30;
  const probeCtx = probe.getContext('2d', { willReadFrequently: true })!;

  let last: { x: number; y: number } | null = null;
  let checkTimer = 0;

  const top = () => canvases[canvases.length - 1];
  const point = (e: PointerEvent) => {
    const r = wrap.getBoundingClientRect();
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  };

  const scrub = (e: PointerEvent) => {
    const c = top();
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const p = point(e);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 46 * dpr;
    ctx.beginPath();
    ctx.moveTo(last?.x ?? p.x, last?.y ?? p.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    last = p;
    if (!checkTimer) checkTimer = window.setTimeout(check, 180);
  };

  function check() {
    checkTimer = 0;
    const c = top();
    if (!c) return;
    probeCtx.clearRect(0, 0, probe.width, probe.height);
    probeCtx.drawImage(c, 0, 0, probe.width, probe.height);
    const data = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 60) clear++;
    if (clear / (probe.width * probe.height) >= clearThreshold) {
      canvases.pop();
      c.classList.add('peel');
      navigator.vibrate?.(25);
      setTimeout(() => c.remove(), 450);
      updateLabel();
      if (canvases.length === 0) {
        label.remove();
        setTimeout(() => wrap.remove(), 450);
        onCleared();
      }
    }
  }

  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrap.setPointerCapture(e.pointerId);
    last = null;
    scrub(e);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (wrap.hasPointerCapture(e.pointerId)) scrub(e);
  });
  wrap.addEventListener('pointerup', () => (last = null));

  return () => {
    clearTimeout(checkTimer);
    wrap.remove();
  };
}

function paintGoo(ctx: CanvasRenderingContext2D, w: number, h: number, shade: (typeof SHADES)[number]) {
  ctx.fillStyle = shade.base;
  ctx.fillRect(0, 0, w, h);
  const r = Math.min(w, h);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rad = r * (0.06 + Math.random() * 0.14);
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    g.addColorStop(0, i % 2 ? shade.light : shade.base);
    g.addColorStop(1, shade.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // bollicine e riflessi lucidi
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(2, r * 0.01);
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, r * (0.01 + Math.random() * 0.03), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, r * 0.05, r * 0.018, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
