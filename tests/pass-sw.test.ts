// Service worker dell'app tascabile: deve salvare TUTTI i file dell'app e cambiare versione quando cambia un file
// (altrimenti i telefoni non ricevono gli aggiornamenti).

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { passServiceWorker } from '../vite.pass.config';

function run(dir: string): { version: string; files: string[]; text: string } {
  const plugin = passServiceWorker(dir);
  (plugin.closeBundle as unknown as (this: object) => void).call({});
  const text = readFileSync(join(dir, 'sw.js'), 'utf8');
  const version = /const VERSION = '([0-9a-f]+)'/.exec(text)![1];
  const files = JSON.parse(/const FILES = (\[.*\]);/.exec(text)![1]) as string[];
  return { version, files, text };
}

describe('Service worker generato (vite.pass.config.ts)', () => {
  it('elenca tutti i file (tranne sé stesso) con percorsi relativi e una versione', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pass-sw-'));
    mkdirSync(join(dir, 'assets'));
    mkdirSync(join(dir, 'icons'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(1)');
    writeFileSync(join(dir, 'icons', 'icon-192.png'), 'png');
    writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
    writeFileSync(join(dir, 'sw.js'), 'vecchio');
    const a = run(dir);
    assert.deepEqual(a.files, ['assets/index-abc.js', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest']);
    assert.match(a.version, /^[0-9a-f]{12}$/);
    assert.ok(!a.text.includes('__FILES__') && !a.text.includes('__VERSION__'));
    // stessa build = stessa versione (niente aggiornamenti finti); file cambiato = versione nuova
    assert.equal(run(dir).version, a.version);
    writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(2)');
    assert.notEqual(run(dir).version, a.version);
  });
});
