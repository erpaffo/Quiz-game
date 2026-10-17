// Prepara i file per il ritaglio automatico del selfie (MediaPipe, licenza Apache 2.0), serviti dal PC
// così funziona anche senza internet:
//   client/public/mediapipe/wasm/   runtime WebAssembly, copiato da node_modules (non versionato)
//   client/public/mediapipe/*.tflite modello «selfie multiclass» (capelli, viso, corpo, vestiti, sfondo)
// Il modello si scarica una sola volta (serve internet solo la prima volta), poi resta nel progetto.
//   node scripts/setup-mediapipe.mjs   (lo lanciano già «npm run dev» e «npm run build»)

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm');
const OUT = resolve(ROOT, 'client/public/mediapipe');
const MODEL = 'selfie_multiclass_256x256.tflite';
const MODEL_URL = `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/${MODEL}`;
const WASM = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];

mkdirSync(resolve(OUT, 'wasm'), { recursive: true });
if (!existsSync(SRC)) {
  console.error('[mediapipe] manca @mediapipe/tasks-vision: esegui "npm install".');
  process.exit(1);
}
for (const f of WASM) {
  const from = resolve(SRC, f);
  const to = resolve(OUT, 'wasm', f);
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}

const model = resolve(OUT, MODEL);
if (!existsSync(model)) {
  console.log(`[mediapipe] scarico il modello ${MODEL} (16 MB, solo la prima volta)…`);
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model, Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    // Senza modello il gioco funziona lo stesso: il telefono propone il ritaglio a mano.
    console.warn(`[mediapipe] modello non scaricato (${err.message}): il selfie userà il ritaglio manuale.`);
  }
}
