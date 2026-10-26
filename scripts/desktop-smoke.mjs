// Prova l'app già impacchettata (release/*-unpacked) SENZA aprire finestre:
// avvia il server dentro l'app vera, controlla pagine, pacchetti, bandiere e salvataggio, poi esce.
//   npm run desktop:smoke

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RELEASE = resolve(ROOT, 'release');
const brand = JSON.parse(readFileSync(resolve(ROOT, 'shared/brand.json'), 'utf8'));

function findExecutable() {
  if (!existsSync(RELEASE)) throw new Error('Manca release/: esegui prima "npm run desktop:build".');
  const dirs = readdirSync(RELEASE);
  if (process.platform === 'win32') {
    const dir = dirs.find((d) => d === 'win-unpacked');
    if (dir) return join(RELEASE, dir, `${brand.shortName}.exe`);
  }
  if (process.platform === 'linux') {
    const dir = dirs.find((d) => d === 'linux-unpacked');
    if (dir) return join(RELEASE, dir, brand.shortName);
  }
  if (process.platform === 'darwin') {
    // L'app si chiama come il gioco («Quiz del Pozzo.app»), l'eseguibile interno come shortName
    // (executableName in electron-builder). Si cercano entrambi invece di ricostruire i nomi:
    // macOS può salvare la «è» in forma Unicode diversa da quella scritta qui.
    for (const dir of dirs.filter((d) => d.startsWith('mac'))) {
      const app = readdirSync(join(RELEASE, dir)).find((f) => f.endsWith('.app'));
      if (!app) continue;
      const macos = join(RELEASE, dir, app, 'Contents', 'MacOS');
      const bin = readdirSync(macos).find((f) => f === brand.shortName) ?? readdirSync(macos)[0];
      if (bin) return join(macos, bin);
    }
  }
  throw new Error(`Nessuna app impacchettata trovata in release/ per ${process.platform}.`);
}

const exe = findExecutable();
if (!existsSync(exe)) throw new Error(`Eseguibile non trovato: ${exe}`);
const out = join(mkdtempSync(join(tmpdir(), 'smoke-')), 'result.json');

// Su Linux senza schermo serve un display virtuale (xvfb-run, già presente su GitHub Actions dopo apt install xvfb).
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const cmd = useXvfb ? 'xvfb-run' : exe;
// Linux: chrome-sandbox dovrebbe appartenere a root con permessi 4755, cosa impossibile sui server di
// GitHub (e dentro un AppImage). Chromium lo controlla prima di eseguire il nostro codice, quindi
// --no-sandbox va passato all'avvio: lo switch impostato in desktop/main.ts arriva troppo tardi.
const appArgs = [`--smoke-test=${out}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])];
const args = useXvfb ? ['-a', exe, ...appArgs] : appArgs;

console.log(`Avvio: ${exe}`);
// ELECTRON_RUN_AS_NODE (impostata da alcuni editor/terminali) trasformerebbe l'app in un semplice Node.
const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ELECTRON_ENABLE_STACK_DUMPING: '1' };
delete env.ELECTRON_RUN_AS_NODE;
if (process.platform === 'darwin') {
  // Stato della firma (utile se macOS rifiuta l'app).
  const app = exe.slice(0, exe.indexOf('.app') + 4);
  spawnSync('codesign', ['-dv', '--verbose=2', app], { stdio: 'inherit' });
}
const started = Date.now();
const res = spawnSync(cmd, args, { stdio: 'inherit', timeout: 120_000, env });
if (!existsSync(out)) {
  console.error(`L'app non ha scritto l'esito (uscita ${res.status ?? res.signal}).`);
  if (process.platform === 'darwin') printMacCrashReport(started);
  process.exit(1);
}
const result = JSON.parse(readFileSync(out, 'utf8'));
console.log(JSON.stringify(result, null, 2));
process.exit(result.esito === 'OK' ? 0 : 1);

/** macOS: stampa l'inizio del rapporto di crash appena scritto dal sistema, per capire cosa è successo. */
function printMacCrashReport(since) {
  const dir = join(homedir(), 'Library', 'Logs', 'DiagnosticReports');
  if (!existsSync(dir)) return;
  const reports = readdirSync(dir)
    .filter((f) => f.includes(brand.shortName) || f.includes('Electron'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .filter((r) => r.t >= since - 5_000)
    .sort((a, b) => b.t - a.t);
  if (!reports.length) return console.error('Nessun rapporto di crash trovato.');
  console.error(`--- ${reports[0].f} ---`);
  console.error(readFileSync(join(dir, reports[0].f), 'utf8').split('\n').slice(0, 120).join('\n'));
}
