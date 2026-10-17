import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { CONFIG } from '../../shared/config';

// Selfie «alla Buzz!»: dopo lo scatto il telefono ritaglia da solo testa e capelli (MediaPipe,
// modello «selfie multiclass» servito dal PC, quindi funziona anche offline) e toglie lo sfondo.
// Il risultato è un PNG/WebP trasparente che lo schermo principale trasforma nella testa 3D.
// Se il ritaglio automatico non riesce (telefono vecchio, viso non trovato) si ritaglia a mano
// con un ovale da spostare e ingrandire.

/** Larghezza della foto inviata; l'altezza segue la forma della testa (capelli compresi). */
const OUT_W = 224;
const MIN_ASPECT = 0.9;
const MAX_ASPECT = 1.6;
/** Lato massimo della foto su cui lavorare (più grande non serve e rallenta i telefoni). */
const WORK_MAX = 720;
const SEGMENT_TIMEOUT = 40_000;

/** Classi del modello «selfie multiclass». */
const HAIR = 1;
const FACE = 3;
const OTHER = 5; // accessori: occhiali, cappelli…

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Selfie tramite <input capture="user">: apre direttamente la fotocamera frontale su mobile
 * e, a differenza di getUserMedia, funziona anche in HTTP sulla rete locale.
 */
export function pickSelfie(): Promise<string | null> {
  return new Promise((resolve) => {
    const capture = () =>
      openCamera().then(async (file) => {
        if (!file) return resolve(null);
        try {
          const source = await loadImage(file);
          editor(source, resolve, capture);
        } catch {
          resolve(null);
        }
      });
    void capture();
  });
}

function openCamera(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'user');
    // Se si chiude la fotocamera senza scattare non arriva nessun evento: non succede nulla.
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}

async function loadImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------ ritaglio automatico

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function segmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(`${location.origin}/mediapipe/wasm`);
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/mediapipe/selfie_multiclass_256x256.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false
    });
  })();
  segmenterPromise.catch(() => (segmenterPromise = null));
  return segmenterPromise;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

interface AutoResult {
  /** Testa ritagliata su sfondo trasparente. */
  cut: HTMLCanvasElement;
  /** Riquadro del viso nella foto (serve a posizionare l'ovale del ritaglio a mano). */
  face: Box;
}

/** Trova viso e capelli e restituisce la testa ritagliata, oppure null se il viso non c'è. */
async function autoCut(src: HTMLCanvasElement): Promise<AutoResult | null> {
  const seg = await withTimeout(segmenter(), SEGMENT_TIMEOUT);
  const res = seg.segment(src);
  const mask = res.categoryMask;
  if (!mask) return null;
  const w = mask.width;
  const h = mask.height;
  const cls = mask.getAsUint8Array().slice();
  mask.close();

  // Riquadro della pelle del viso.
  let fx0 = w, fy0 = h, fx1 = -1, fy1 = -1, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cls[y * w + x] !== FACE) continue;
      n++;
      if (x < fx0) fx0 = x;
      if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y;
      if (y > fy1) fy1 = y;
    }
  }
  if (n < w * h * 0.01) return null;
  const fw = fx1 - fx0 + 1;
  const fh = fy1 - fy0 + 1;

  // Testa = viso + capelli + accessori, entro una zona attorno al viso. Collo, spalle e vestiti
  // restano fuori; i capelli lunghi si fermano poco sotto il mento.
  const rx0 = fx0 - fw * 0.75, rx1 = fx1 + fw * 0.75, ry0 = fy0 - fh * 1.2;
  const chin = fy1 + fh * 0.04;
  const hairEnd = fy1 + fh * 0.3;
  const alpha = new Uint8ClampedArray(w * h * 4);
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let y = 0; y < h; y++) {
    if (y < ry0 || y > hairEnd) continue;
    for (let x = 0; x < w; x++) {
      if (x < rx0 || x > rx1) continue;
      const c = cls[y * w + x];
      const keep = (c === FACE && y <= chin) || (c === OTHER && y <= chin) || (c === HAIR && y <= hairEnd);
      if (!keep) continue;
      alpha[(y * w + x) * 4 + 3] = 255;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  maskCanvas.getContext('2d')!.putImageData(new ImageData(alpha, w, h), 0, 0);

  // Bordo morbido: la maschera passa da una copia a metà risoluzione e torna su sfumata.
  const soft = document.createElement('canvas');
  soft.width = Math.max(1, Math.round(w / 3));
  soft.height = Math.max(1, Math.round(h / 3));
  soft.getContext('2d')!.drawImage(maskCanvas, 0, 0, soft.width, soft.height);

  const sx = src.width / w;
  const sy = src.height / h;
  const box = fitAspect({ x: bx0 * sx, y: by0 * sy, w: (bx1 - bx0 + 1) * sx, h: (by1 - by0 + 1) * sy }, 0.04);
  const cut = document.createElement('canvas');
  cut.width = OUT_W;
  cut.height = Math.round(OUT_W * (box.h / box.w));
  const g = cut.getContext('2d')!;
  g.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, cut.width, cut.height);
  g.globalCompositeOperation = 'destination-in';
  g.imageSmoothingQuality = 'high';
  g.drawImage(soft, box.x / sx / 3, box.y / sy / 3, box.w / sx / 3, box.h / sy / 3, 0, 0, cut.width, cut.height);
  return { cut, face: { x: fx0 * sx, y: fy0 * sy, w: fw * sx, h: fh * sy } };
}

/** Allarga il riquadro di un margine e lo porta a proporzioni da testa (né troppo largo né troppo alto). */
function fitAspect(b: Box, margin: number): Box {
  let { x, y, w, h } = b;
  x -= w * margin;
  y -= h * margin;
  w *= 1 + margin * 2;
  h *= 1 + margin * 2;
  const aspect = h / w;
  if (aspect < MIN_ASPECT) {
    const nh = w * MIN_ASPECT;
    y -= (nh - h) / 2;
    h = nh;
  } else if (aspect > MAX_ASPECT) {
    const nw = h / MAX_ASPECT;
    x -= (nw - w) / 2;
    w = nw;
  }
  return { x, y, w, h };
}

// ------------------------------------------------------------ ritaglio a mano (ovale)

const OVAL_ASPECT = 1.25;

/** Testa ritagliata dentro l'ovale, con la foto spostata/ingrandita come nell'editor. */
function ovalCut(src: HTMLCanvasElement, view: { cx: number; cy: number; scale: number }, stageW: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = OUT_W;
  out.height = Math.round(OUT_W * OVAL_ASPECT);
  const g = out.getContext('2d')!;
  const k = OUT_W / stageW;
  g.beginPath();
  g.ellipse(out.width / 2, out.height / 2, out.width * 0.46, out.height * 0.48, 0, 0, Math.PI * 2);
  g.clip();
  const s = view.scale * k;
  g.drawImage(src, out.width / 2 - view.cx * s, out.height / 2 - view.cy * s, src.width * s, src.height * s);
  return out;
}

// ------------------------------------------------------------ codifica

/** WebP trasparente se il browser lo sa produrre (Android), altrimenti PNG; si riduce finché entra nel limite. */
function encode(canvas: HTMLCanvasElement): string {
  let c = canvas;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const q of [0.85, 0.7, 0.55]) {
      const webp = c.toDataURL('image/webp', q);
      if (webp.startsWith('data:image/webp') && webp.length <= CONFIG.SELFIE_MAX_CHARS) return webp;
    }
    const png = c.toDataURL('image/png');
    if (png.length <= CONFIG.SELFIE_MAX_CHARS) return png;
    const smaller = document.createElement('canvas');
    smaller.width = Math.round(c.width * 0.8);
    smaller.height = Math.round(c.height * 0.8);
    smaller.getContext('2d')!.drawImage(c, 0, 0, smaller.width, smaller.height);
    c = smaller;
  }
  throw new Error('Foto troppo grande');
}

// ------------------------------------------------------------ editor

function editor(src: HTMLCanvasElement, done: (dataUrl: string | null) => void, retake: () => void) {
  const modal = document.createElement('div');
  modal.className = 'selfie-modal';
  modal.innerHTML = `
    <div class="selfie-card">
      <div class="title">📸 La tua testa</div>
      <div class="selfie-stage"><canvas></canvas><div class="selfie-oval" hidden></div></div>
      <div class="selfie-status muted">✂️ Sto ritagliando la testa…</div>
      <label class="selfie-zoom" hidden>🔍 <input type="range" min="0.5" max="4" step="0.01" value="1"></label>
      <div class="selfie-actions">
        <button class="btn" data-sa="use" disabled>✅ Usa questa</button>
        <button class="btn secondary" data-sa="mode" disabled>✋ Ritaglia a mano</button>
        <button class="btn secondary" data-sa="retake">🔄 Rifai la foto</button>
        <button class="link-btn" data-sa="cancel">Annulla</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const stage = modal.querySelector<HTMLElement>('.selfie-stage')!;
  const canvas = modal.querySelector('canvas')!;
  const oval = modal.querySelector<HTMLElement>('.selfie-oval')!;
  const status = modal.querySelector<HTMLElement>('.selfie-status')!;
  const zoomRow = modal.querySelector<HTMLElement>('.selfie-zoom')!;
  const zoom = zoomRow.querySelector('input')!;
  const btnUse = modal.querySelector<HTMLButtonElement>('[data-sa="use"]')!;
  const btnMode = modal.querySelector<HTMLButtonElement>('[data-sa="mode"]')!;

  const stageW = Math.min(300, window.innerWidth - 64);
  const stageH = Math.round(stageW * OVAL_ASPECT);
  stage.style.width = `${stageW}px`;
  stage.style.height = `${stageH}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = stageW * dpr;
  canvas.height = stageH * dpr;
  const g = canvas.getContext('2d')!;

  let mode: 'auto' | 'manual' = 'auto';
  let auto: AutoResult | null = null;
  // Vista del ritaglio a mano: punto della foto al centro dell'ovale e ingrandimento.
  const fit = Math.max(stageW / src.width, stageH / src.height);
  const view = { cx: src.width / 2, cy: src.height * 0.42, scale: fit };

  const drawAuto = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!auto) return;
    const s = Math.min(canvas.width / auto.cut.width, canvas.height / auto.cut.height) * 0.92;
    g.drawImage(auto.cut, (canvas.width - auto.cut.width * s) / 2, (canvas.height - auto.cut.height * s) / 2, auto.cut.width * s, auto.cut.height * s);
  };
  const drawManual = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, stageW, stageH);
    g.drawImage(src, stageW / 2 - view.cx * view.scale, stageH / 2 - view.cy * view.scale, src.width * view.scale, src.height * view.scale);
  };
  const setMode = (m: 'auto' | 'manual') => {
    mode = m;
    stage.classList.toggle('manual', m === 'manual');
    oval.hidden = m !== 'manual';
    zoomRow.hidden = m !== 'manual';
    btnMode.textContent = m === 'manual' ? '✂️ Ritaglio automatico' : '✋ Ritaglia a mano';
    btnMode.disabled = m === 'manual' && !auto;
    btnUse.disabled = m === 'auto' && !auto;
    status.textContent = m === 'manual' ? 'Sposta la foto col dito e ingrandisci: la testa deve riempire l\'ovale' : auto ? 'Ecco la tua testa! Ti piace?' : '';
    m === 'manual' ? drawManual() : drawAuto();
  };

  // Ritaglio a mano: trascinare per spostare, due dita o la barra per ingrandire.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; scale: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (mode !== 'manual') return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (mode !== 'manual' || !prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      view.scale = clampScale((pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist);
      zoom.value = String(view.scale / fit);
    } else if (pointers.size === 1) {
      view.cx -= (e.clientX - prev.x) / view.scale;
      view.cy -= (e.clientY - prev.y) / view.scale;
    }
    drawManual();
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  const clampScale = (s: number) => Math.min(fit * 4, Math.max(fit * 0.5, s));
  zoom.addEventListener('input', () => {
    view.scale = clampScale(fit * Number(zoom.value));
    drawManual();
  });

  const close = (result: string | null) => {
    modal.remove();
    done(result);
  };
  modal.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-sa]')?.dataset.sa;
    if (act === 'cancel') close(null);
    if (act === 'retake') {
      modal.remove();
      retake();
    }
    if (act === 'mode') setMode(mode === 'manual' ? 'auto' : 'manual');
    if (act === 'use') {
      try {
        close(encode(mode === 'manual' ? ovalCut(src, view, stageW) : auto!.cut));
      } catch {
        status.textContent = '⚠️ Foto troppo grande, riprova';
      }
    }
  });

  drawManual();
  autoCut(src)
    .then((r) => {
      auto = r;
      if (r) {
        // L'ovale del ritaglio a mano parte già centrato sul viso trovato.
        view.cx = r.face.x + r.face.w / 2;
        view.cy = r.face.y + r.face.h * 0.3;
        view.scale = clampScale((stageW * 0.5) / r.face.w);
        zoom.value = String(view.scale / fit);
        setMode('auto');
      } else {
        setMode('manual');
        status.textContent = '🙈 Non ho trovato il viso: ritaglialo a mano nell\'ovale';
      }
    })
    .catch((err) => {
      console.warn('[selfie] ritaglio automatico non disponibile', err);
      setMode('manual');
      status.textContent = 'Ritaglio automatico non disponibile su questo telefono: sistemalo a mano nell\'ovale';
    });
}
