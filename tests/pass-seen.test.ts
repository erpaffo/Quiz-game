import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seeded } from '../client/pass/rng';
import { MemoryStore, PassStore } from '../client/pass/store';

const words = Array.from({ length: 20 }, (_, i) => `Parola ${i}`);
const draws = (d: { draw(): string }, n: number) => Array.from({ length: n }, () => d.draw());

describe('Mazzo persistente (carte già uscite)', () => {
  it('nessuna ripetizione entro un ciclo, e al rimescolo le ultime 5 non tornano per prime', () => {
    const d = new PassStore(new MemoryStore()).deck('t', words, undefined, seeded(3));
    const first = draws(d, 20);
    assert.equal(new Set(first).size, 20);
    const second = draws(d, 5);
    for (const w of first.slice(-5)) assert.ok(!second.includes(w));
  });

  it('persiste tra due istanze sullo stesso store', () => {
    const kv = new MemoryStore();
    const a = draws(new PassStore(kv).deck('t', words, undefined, seeded(1)), 12);
    const b = draws(new PassStore(kv).deck('t', words, undefined, seeded(2)), 8);
    assert.equal(new Set([...a, ...b]).size, 20);
  });

  it('chiavi sparite dalla banca ignorate', () => {
    const kv = new MemoryStore();
    draws(new PassStore(kv).deck('t', ['a', 'b', 'c']), 3);
    const out = draws(new PassStore(kv).deck('t', ['b', 'c', 'd', 'e'], undefined, seeded(2)), 2);
    assert.deepEqual(out.sort(), ['d', 'e']); // 'a' sparita dalla banca, 'b' e 'c' già viste
  });

  it('resetSeen azzera tutte le banche', () => {
    const kv = new MemoryStore();
    const s = new PassStore(kv);
    s.deck('a', words, undefined, seeded(1)).draw();
    s.deck('b', words, undefined, seeded(1)).draw();
    s.resetSeen();
    assert.equal(kv.getItem('sep:pass:seen:a'), null);
    assert.equal(kv.getItem('sep:pass:seen:b'), null);
  });

  it('mazzo di 1 carta non va in loop', () => {
    const d = new PassStore(new MemoryStore()).deck('t', ['sola'], undefined, seeded(1));
    assert.deepEqual(draws(d, 3), ['sola', 'sola', 'sola']);
  });
});
