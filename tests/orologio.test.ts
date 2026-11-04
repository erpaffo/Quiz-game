// Review 0.2.3: la logica di clock.sync (media mobile, soglia 1,5 s, riallineamento dopo 4 scarti) era senza test.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { clock } from '../client/common/net';

const T0 = 1_700_000_000_000;

/** Un pacchetto dal server: `skew` = di quanto l'orologio del server è avanti rispetto al nostro. */
const packet = (skew: number) => clock.sync(T0 + skew);

describe('Orologio di rete (clock.sync)', () => {
  it('il primo campione inizializza l’offset', () => {
    packet(0);
    assert.equal(clock.initialized, true);
    assert.equal(clock.offset, 0);
    assert.equal(clock.now(), T0);
  });

  it('un pacchetto in ritardo di 400 ms non fa saltare l’offset', () => {
    packet(0);
    packet(400);
    assert.ok(Math.abs(clock.offset - 80) < 1e-6, `offset da media mobile atteso ~80, trovato ${clock.offset}`);
    assert.equal(clock.divergenceCount, 0);
  });

  it('uno scarto costante di 3 s riallinea l’offset solo al quarto campione', () => {
    packet(0);
    for (let i = 1; i <= 3; i++) packet(3000);
    assert.equal(clock.offset, 0, 'prima del 4° scarto l’offset deve restare quello vecchio');
    assert.equal(clock.divergenceCount, 3);
    packet(3000);
    assert.equal(clock.offset, 3000);
    assert.equal(clock.divergenceCount, 0);
  });

  it('dopo il riallineamento now() e remaining() seguono il server', () => {
    packet(0);
    for (let i = 0; i < 4; i++) packet(3000);
    assert.equal(clock.now(), T0 + 3000);
    assert.equal(clock.remaining(T0 + 5000), 2000);
    assert.equal(clock.remaining(null), null);
    assert.equal(clock.remaining(T0), 0, 'un timer già scaduto non torna negativo');
  });

  it('uno scarto isolato azzera il contatore degli scostamenti', () => {
    packet(0);
    packet(3000);
    packet(3000);
    packet(3000);
    packet(0);
    assert.equal(clock.divergenceCount, 0);
    packet(3000);
    packet(3000);
    packet(3000);
    assert.equal(clock.offset, 0, 'tre scarti dopo un rientro non devono riallineare');
  });
});

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: T0 });
  clock.offset = 0;
  clock.initialized = false;
  clock.divergenceCount = 0;
});

afterEach(() => mock.timers.reset());
