// Prova l'app già impacchettata (release/*-unpacked) SENZA aprire finestre:
// avvia il server dentro l'app vera, controlla pagine, pacchetti, bandiere e salvataggio, poi esce.
//   npm run desktop:smoke

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    const dir = dirs.find((d) => d.startsWith('mac'));
    if (dir) return join(RELEASE, dir, `${brand.name}.app`, 'Contents', 'MacOS', brand.name);
  }
  throw new Error(`Nessuna app impacchettata trovata in release/ per ${process.platform}.`);
}

const exe = findExecutable();
if (!existsSync(exe)) throw new Error(`Eseguibile non trovato: ${exe}`);
const out = join(mkdtempSync(join(tmpdir(), 'smoke-')), 'result.json');

// Su Linux senza schermo serve un display virtuale (xvfb-run, già presente su GitHub Actions dopo apt install xvfb).
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const cmd = useXvfb ? 'xvfb-run' : exe;
const args = useXvfb ? ['-a', exe, `--smoke-test=${out}`] : [`--smoke-test=${out}`];

console.log(`Avvio: ${exe}`);
// ELECTRON_RUN_AS_NODE (impostata da alcuni editor/terminali) trasformerebbe l'app in un semplice Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const res = spawnSync(cmd, args, { stdio: 'inherit', timeout: 120_000, env });
if (!existsSync(out)) {
  console.error(`L'app non ha scritto l'esito (uscita ${res.status ?? res.signal}).`);
  process.exit(1);
}
const result = JSON.parse(readFileSync(out, 'utf8'));
console.log(JSON.stringify(result, null, 2));
process.exit(result.esito === 'OK' ? 0 : 1);
