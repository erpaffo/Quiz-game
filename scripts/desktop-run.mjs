// Avvia l'app desktop da sorgente (dopo "npm run build" e desktop-stage): `npm run desktop`.
// ELECTRON_RUN_AS_NODE (impostata da alcuni editor/terminali basati su Electron) trasformerebbe l'app in un semplice Node: la togliamo.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const electron = createRequire(import.meta.url)('electron'); // il pacchetto "electron" esporta il percorso dell'eseguibile
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [resolve(ROOT, 'app-build'), ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
