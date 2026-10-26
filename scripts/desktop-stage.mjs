// Prepara la cartella app-build/ con tutto ciò che serve all'app desktop:
//   main.cjs   server + app Electron in un unico file (esbuild), senza node_modules
//   client/    il gioco compilato (dist/)
//   packs/     i pacchetti di domande di serie
//   bosco.ps1  script dell'hotspot (solo Windows)
// electron-builder impacchetta poi questa cartella: l'app finale non contiene dipendenze npm.

import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// fs.cpSync chiude Node in silenzio su alcuni PC Windows (verificato su Node 22.19): copia ricorsiva a mano.
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = resolve(from, name);
    const dst = resolve(to, name);
    if (statSync(src).isDirectory()) copyDir(src, dst);
    else copyFileSync(src, dst);
  }
}
const OUT = resolve(ROOT, 'app-build');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const brand = JSON.parse(readFileSync(resolve(ROOT, 'shared/brand.json'), 'utf8'));

if (!existsSync(resolve(ROOT, 'dist/host.html'))) {
  throw new Error('Manca dist/: esegui prima "npm run build".');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [resolve(ROOT, 'desktop/main.ts')],
  outfile: resolve(OUT, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // electron è fornito dall'app; vite serve solo in sviluppo (npm run dev) e non viene mai caricato qui.
  external: ['electron', 'vite'],
  // Nel bundle CommonJS import.meta non esiste: i percorsi vengono sempre passati da desktop/main.ts.
  define: { 'import.meta.dirname': 'undefined' },
  legalComments: 'none',
  logLevel: 'info'
});

// Preload della finestra del gioco (comandi del menù di pausa: finestra, monitor, esci).
await build({
  entryPoints: [resolve(ROOT, 'desktop/preload.ts')],
  outfile: resolve(OUT, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'info'
});

copyDir(resolve(ROOT, 'dist'), resolve(OUT, 'client'));
copyDir(resolve(ROOT, 'server/data/packs'), resolve(OUT, 'packs'));
copyFileSync(resolve(ROOT, 'scripts/bosco.ps1'), resolve(OUT, 'bosco.ps1'));

writeFileSync(
  resolve(OUT, 'package.json'),
  JSON.stringify(
    {
      name: brand.shortName.toLowerCase(),
      productName: brand.name,
      version: pkg.version,
      description: brand.description,
      author: 'erpaffo',
      main: 'main.cjs'
    },
    null,
    2
  )
);
console.log(`app-build/ pronta (${brand.name} ${pkg.version})`);
