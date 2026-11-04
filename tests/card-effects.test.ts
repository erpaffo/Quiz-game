// Il server valida gli effetti carta: sblocco solo se attivo e dopo il tempo minimo; niente risposte con ghiaccio/lucchetto attivi.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { minClearMs } from '../shared/powers';
import { makeRoom, useFakeTime } from './helpers';

useFakeTime();

/** Mette la stanza in PLAY con un gioco finto e l'effetto subito all'inizio della domanda. */
function setup(type: 'ICE' | 'LOCK' | 'GOO', gameErr: string | null = null) {
  const t = makeRoom(2);
  const r = t.room as unknown as Record<string, unknown>;
  r.phaseData = { phase: 'PLAY' };
  r.game = { action: () => gameErr, hasActed: () => false, privateFor: () => ({}) };
  const p = t.room.players.get(t.ids[0])!;
  p.cur = { questionId: 'q', incoming: [{ type, stack: 1, from: ['x'] }], removed: [], hint: null };
  p.activeEffects.add(type);
  (r.effectsShownAt as Map<string, number>).set(p.id, Date.now());
  return { t, p };
}

describe('Effetti carta lato server', () => {
  it('clearEffect: ignora effetti non attivi e sblocchi troppo rapidi, accetta dopo il tempo minimo', () => {
    const { t, p } = setup('ICE');
    t.room.clearEffect(p.id, 'LOCK');
    assert.equal(p.activeEffects.has('ICE'), true);
    t.room.clearEffect(p.id, 'ICE');
    assert.equal(p.activeEffects.has('ICE'), true, 'troppo presto');
    mock.timers.tick(minClearMs('ICE', 1));
    t.room.clearEffect(p.id, 'ICE');
    assert.equal(p.activeEffects.has('ICE'), false);
    t.room.destroy();
  });

  it('gameAction: con lucchetto attivo rifiuta e non cancella gli effetti; sbloccato, accetta', () => {
    const { t, p } = setup('LOCK');
    assert.match(t.room.gameAction(p.id, { type: 'answer', index: 0 } as never) ?? '', /Sblocca/);
    assert.equal(p.activeEffects.has('LOCK'), true);
    mock.timers.tick(minClearMs('LOCK', 1));
    t.room.clearEffect(p.id, 'LOCK');
    assert.equal(t.room.gameAction(p.id, { type: 'answer', index: 0 } as never), null);
    t.room.destroy();
  });

  it('gameAction: se il gioco rifiuta la risposta, gli effetti restano', () => {
    const { t, p } = setup('GOO', 'Già risposto');
    assert.equal(t.room.gameAction(p.id, { type: 'answer', index: 0 } as never), 'Già risposto');
    assert.equal(p.activeEffects.has('GOO'), true);
    t.room.destroy();
  });
});
