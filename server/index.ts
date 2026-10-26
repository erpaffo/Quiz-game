// Avvio da terminale: `npm start` (versione compilata), `npm run dev` (sviluppo), `npm run bosco`.
// L'app desktop (desktop/main.ts) usa invece startServer() direttamente.
import { resolve } from 'node:path';
import { startServer } from './app';

const ROOT = resolve(import.meta.dirname, '..');
const PROD = process.argv.includes('--prod');

await startServer({
  port: Number(process.env.PORT ?? 3000),
  dev: !PROD,
  root: ROOT,
  staticDir: PROD ? resolve(ROOT, 'dist') : undefined,
  mediaDir: resolve(ROOT, 'user-media'),
  editorKey: process.env.EDITOR_KEY || undefined,
  speed: Number(process.env.GAME_SPEED ?? 1) || 1,
  hotspot: process.env.HOTSPOT_SSID ? { ssid: process.env.HOTSPOT_SSID, password: process.env.HOTSPOT_PASS ?? '' } : null
});
