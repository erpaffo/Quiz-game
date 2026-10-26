// Pausa dallo schermo principale (Esc): il tempo si ferma, i telefoni non possono agire, alla ripresa si riparte da lì.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { PausableTimers } from '../server/core/timers';
import { makeRoom, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Timer con pausa', () => {
  it('in pausa non scattano; alla ripresa hanno il tempo che mancava; si possono annullare', () => {
    const t = new PausableTimers();
    const fired: string[] = [];
    t.add(() => fired.push('a'), 1000);
    const cancelB = t.add(() => fired.push('b'), 1500);
    mock.timers.tick(400);
    t.pause();
    t.add(() => fired.push('c'), 100); // creato in pausa: parte solo alla ripresa
    mock.timers.tick(60_000);
    assert.deepEqual(fired, []);
    t.resume();
    mock.timers.tick(100);
    assert.deepEqual(fired, ['c']);
    cancelB();
    mock.timers.tick(500);
    assert.deepEqual(fired, ['c', 'a'], 'a aveva ancora 600 ms; b è stato annullato');
    t.clear();
  });
});

describe('Pausa della partita (stanza)', () => {
  it('nella lobby non si mette in pausa', () => {
    const t = makeRoom(3);
    assert.match(t.room.setPaused(true) ?? '', /partita/);
    assert.equal(t.room.isPaused, false);
    t.room.destroy();
  });

  it('il tempo si ferma, le azioni sono rifiutate, alla ripresa il conto riparte da dove era', () => {
    const t = makeRoom(3);
    startShow(t, 'tempo');
    mock.timers.tick(5_000);
    const before = t.tv();
    const left = before.endsAt! - Date.now(); // lo snapshot non si rimanda se nulla cambia: si usa l'orologio
    assert.equal(t.room.setPaused(true), null);
    assert.equal(t.tv().paused, true);
    mock.timers.tick(10 * 60_000);
    assert.equal(t.state<{ step: string }>().step, 'question', 'in pausa il passo non cambia');
    assert.match(t.act(0, { type: 'year', value: 1990 }) ?? '', /pausa/);
    assert.equal(t.room.setPaused(false), null);
    const after = t.tv();
    assert.equal(after.paused, false);
    assert.equal(after.endsAt! - Date.now(), left, 'stesso tempo rimasto di prima della pausa');
    assert.equal(t.act(0, { type: 'year', value: 1990 }), null, 'dopo la ripresa si gioca');
    mock.timers.tick(left + 50);
    assert.equal(t.state<{ step: string }>().step, 'reveal', 'il passo finisce allo scadere del tempo rimasto');
    t.room.destroy();
  });

  it('tornare al menù toglie la pausa; il capo stanza non può uscire mentre la TV è in pausa', () => {
    const t = makeRoom(3);
    startShow(t, 'social');
    t.room.setPaused(true);
    assert.match(t.room.restart(t.ids[0]) ?? '', /pausa/);
    assert.equal(t.room.restart(null), null);
    assert.equal(t.tv().phase, 'LOBBY');
    assert.equal(t.tv().paused, false);
    // dopo, la stanza funziona normalmente
    startShow(t, 'social');
    mock.timers.tick(100);
    assert.equal(t.tv().phase, 'SHOW');
    t.room.destroy();
  });
});
