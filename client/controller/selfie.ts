import { CONFIG } from '../../shared/config';

const SIZE = 192;

/**
 * Selfie tramite <input capture="user">: apre direttamente la fotocamera frontale su mobile
 * e, a differenza di getUserMedia, funziona anche in HTTP sulla rete locale.
 * La foto viene ritagliata al centro, ridotta a 192×192 e compressa in JPEG.
 */
export function pickSelfie(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'user');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await compress(file));
      } catch {
        resolve(null);
      }
    });
    input.click();
  });
}

async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    // Ritaglio leggermente spostato verso l'alto: nei selfie il viso sta nella metà superiore.
    const sx = (img.naturalWidth - side) / 2;
    const sy = Math.max(0, (img.naturalHeight - side) / 2 - side * 0.08);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    for (let q = 0.8; q >= 0.3; q -= 0.1) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= CONFIG.SELFIE_MAX_CHARS) return data;
    }
    throw new Error('Foto troppo grande');
  } finally {
    URL.revokeObjectURL(url);
  }
}
