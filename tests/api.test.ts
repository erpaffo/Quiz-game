// API HTTP del Laboratorio: pacchetti di serie protetti, formati dei file controllati, chiave EDITOR_KEY rispettata.

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startServer, type RunningServer } from '../server/app';

const temp = (name: string) => mkdtempSync(join(tmpdir(), `sep-${name}-`));

describe('API del Laboratorio', () => {
  let server: RunningServer;
  let base: string;
  const KEY = 'chiave-di-prova';
  const call = (method: string, path: string, body?: unknown, key: string | null = KEY) =>
    fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Editor-Key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  before(async () => {
    server = await startServer({ port: 3190, portTries: 30, userPacksDir: temp('packs'), mediaDir: temp('media'), editorKey: KEY, log: () => {} });
    base = `http://127.0.0.1:${server.port}`;
  });
  after(() => server.close());

  const pack = { name: 'Prova', categories: [{ id: 'c1', name: 'Cat' }], questions: [{ id: 'q1', categoryId: 'c1', type: 'truefalse', text: 'Vero?', answer: true }] };

  it('senza chiave si legge ma non si scrive', async () => {
    assert.equal((await call('GET', '/api/packs', undefined, null)).status, 200);
    assert.equal((await call('POST', '/api/packs', pack, null)).status, 401);
    assert.equal((await call('POST', '/api/packs', pack, 'sbagliata')).status, 401);
    assert.equal((await fetch(`${base}/api/media?name=a.png`, { method: 'POST', body: 'x' })).status, 401);
  });

  it('con la chiave si crea e si cancella un pacchetto; quelli di serie restano intoccabili', async () => {
    const created = await call('POST', '/api/packs', pack);
    assert.equal(created.status, 200);
    const { id } = (await created.json()) as { id: string };
    const builtIn = server.packs.list().find((p) => p.builtIn)!;
    assert.equal((await call('PUT', `/api/packs/${builtIn.id}`, pack)).status, 400);
    assert.equal((await call('DELETE', `/api/packs/${builtIn.id}`)).status, 400);
    assert.equal((await call('DELETE', `/api/packs/${id}`)).status, 200);
    assert.equal(server.packs.get(id), undefined);
  });

  it('caricamento file: solo formati ammessi, nome ripulito', async () => {
    const upload = (name: string) => fetch(`${base}/api/media?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'X-Editor-Key': KEY }, body: 'dati' });
    assert.equal((await upload('virus.exe')).status, 400);
    const ok = await upload('../../Foto mia!.png');
    assert.equal(ok.status, 200);
    assert.match(((await ok.json()) as { path: string }).path, /^\/media\/[a-z0-9]+-Foto-mia\.png$/);
  });
});

describe('API senza EDITOR_KEY (uso in casa)', () => {
  it('si scrive senza chiave, come prima', async () => {
    const server = await startServer({ port: 3220, portTries: 30, userPacksDir: temp('packs'), log: () => {} });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Casa', categories: [], questions: [] })
      });
      assert.equal(res.status, 200);
    } finally {
      await server.close();
    }
  });
});
