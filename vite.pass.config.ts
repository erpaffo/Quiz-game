// Build dell'app «Party Tascabile» (client/pass) → dist/pass, con percorsi relativi:
// la stessa cartella funziona servita dal PC/Raspberry (/pass/) e pubblicata su un sito https (es. GitHub Pages).
// Il plugin `passServiceWorker` scrive dist/pass/sw.js con l'elenco esatto dei file da salvare per l'offline.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = resolve(import.meta.dirname, 'client/pass');
const outDir = resolve(import.meta.dirname, 'dist/pass');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Elenco dei file + versione (hash del contenuto) dentro il service worker. */
export function passServiceWorker(dir = outDir): Plugin {
  return {
    name: 'pass-service-worker',
    apply: 'build',
    closeBundle() {
      const files = walk(dir)
        .map((f) => relative(dir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = readFileSync(join(root, 'sw-template.js'), 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files));
      writeFileSync(join(dir, 'sw.js'), sw);
      this.info?.(`sw.js: ${files.length} file, versione ${version}`);
    }
  };
}

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, 'public'),
  plugins: [passServiceWorker()],
  build: {
    outDir,
    emptyOutDir: true,
    // niente file separati per i caratteri piccoli: meno richieste al primo avvio
    assetsInlineLimit: 4096,
    rollupOptions: { input: resolve(root, 'index.html') }
  }
});
