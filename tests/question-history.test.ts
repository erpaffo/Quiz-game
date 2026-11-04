// Cronologia delle domande: niente ripetizioni tra partite e nella Raffica.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pack } from '../shared/packs';
import { QuestionPool } from '../server/QuestionPool';

const pack = (n: number): Pack =>
  ({
    id: 'p',
    name: 'p',
    categories: [{ id: 'c', name: 'C' }],
    questions: Array.from({ length: n }, (_, i) => ({ id: `q${i}`, categoryId: 'c', type: 'truefalse', text: `d${i}`, answer: true }))
  }) as unknown as Pack;

describe('QuestionPool: memoria condivisa', () => {
  it('con lo stesso Set non ripropone domande finché ce ne sono di nuove', () => {
    const used = new Set<string>();
    const a = new QuestionPool([pack(6)], () => [], {}, used);
    const first = new Set(Array.from({ length: 3 }, () => a.drawMc().id));
    const b = new QuestionPool([pack(6)], () => [], {}, used);
    const second = Array.from({ length: 3 }, () => b.drawMc().id);
    assert.equal(second.some((id) => first.has(id)), false);
  });

  it('la Raffica preferisce le fresche e non esaurisce la banca', () => {
    const used = new Set<string>();
    const p = new QuestionPool([pack(40)], () => [], {}, used);
    for (let i = 0; i < 10; i++) used.add(`p:q${i}`);
    const deck = p.blitzDeck();
    assert.equal(deck.length, 30);
    assert.equal(deck.some((q) => Number(q.id.slice(3)) < 10), false);
    assert.equal(used.size, 10);
  });
});
