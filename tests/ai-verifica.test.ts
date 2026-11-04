import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { esitoComplessivo, leggiRisposta } from '../scripts/ai-verifica-core';

describe('verifica AI: lettura della risposta', () => {
  it('ogni id del lotto ha un verdetto: quelli mancanti o una risposta illeggibile sono «incerto»', () => {
    const ok = leggiRisposta('{"risultati":[{"id":"a","esito":"vero","motivo":"ok"}]}', ['a', 'b']);
    assert.deepEqual(ok.map((v) => v.esito), ['vero', 'incerto']);
    const rotta = leggiRisposta('non è json', ['a']);
    assert.equal(rotta[0].esito, 'incerto');
  });
});

describe('verifica AI: esito della release', () => {
  const verdetti = (esiti: string[]) => esiti.map((esito, k) => ({ id: `d${k}`, esito: esito as 'vero', motivo: '' }));

  it('blocca la release con un solo «falso» (soglia di default: zero)', () => {
    const r = esitoComplessivo(verdetti(['vero', 'falso', 'vero']), { maxFalsi: 0, maxIncertiPct: 10 });
    assert.equal(r.ok, false);
    assert.equal(r.falsi, 1);
  });

  it('lascia passare pochi «incerto» sotto la soglia percentuale', () => {
    const r = esitoComplessivo(verdetti([...Array(19).fill('vero'), 'incerto']), { maxFalsi: 0, maxIncertiPct: 10 });
    assert.equal(r.ok, true);
    assert.equal(r.incerti, 1);
  });
});
