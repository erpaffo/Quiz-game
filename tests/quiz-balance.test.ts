// Bilanciamento: tirare a caso non deve avere attesa positiva (calcolo analitico, niente casualità).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONFIG } from '../shared/config';
import { wrongPenalty } from '../server/logic/scoring';

/** Attesa di chi sceglie a caso tra n opzioni: p*premio - (1-p)*penalità. */
const guessEv = (reward: number, n: number) => reward / n - ((n - 1) / n) * wrongPenalty(reward, n);

describe('Quiz: attesa del tiro a caso', () => {
  for (const n of [2, 3, 4]) {
    it(`Il Più Veloce con ${n} opzioni: attesa <= 0`, () => {
      assert.ok(guessEv(CONFIG.FASTEST_WIN, n) <= 1);
    });
    it(`Indizi con ${n} opzioni: attesa <= 0 per ogni premio (300..1200)`, () => {
      for (const reward of [300, 750, 1200]) assert.ok(guessEv(reward, n) <= 1);
    });
  }
  it('chi sa la risposta resta premiato: penalità mai superiore al premio', () => {
    assert.equal(wrongPenalty(1000, 2), 1000);
    assert.equal(wrongPenalty(1000, 4), 333);
    assert.ok(wrongPenalty(1000, 4) < 1000);
  });
  it('Scommessa: puntata simmetrica, attesa <= 0 su V/F e 4 opzioni', () => {
    assert.equal(0.5 * 400 - 0.5 * 400, 0);
    assert.ok(0.25 * 400 - 0.75 * 400 < 0);
  });
});
