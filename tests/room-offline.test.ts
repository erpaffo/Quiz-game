// Tolleranza offline all'avvio e TV scollegata = pausa.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { makeRoom, useFakeTime } from './helpers';

useFakeTime();

describe('Giocatori offline', () => {
  it('all\'avvio resta chi ha appena perso il segnale, esce chi è offline da oltre 20 s', () => {
    const t = makeRoom(4);
    t.room.disconnect('sock-3');
    mock.timers.tick(5_000);
    t.room.disconnect('sock-2');
    mock.timers.tick(16_000); // sock-3 offline da 21 s, sock-2 da 16 s
    assert.equal(t.room.start(t.ids[0]), null);
    assert.equal(t.room.players.has(t.ids[3]), false);
    assert.equal(t.room.players.has(t.ids[2]), true);
    t.room.destroy();
  });
});

describe('TV scollegata', () => {
  it('mette in pausa e riprende alla riconnessione; una pausa manuale resta tale', () => {
    const t = makeRoom(3);
    assert.equal(t.room.start(t.ids[0]), null);
    t.room.disconnect('sock-host');
    assert.equal(t.room.isPaused, true);
    t.room.attachHost('sock-host2');
    assert.equal(t.room.isPaused, false);

    t.room.setPaused(true);
    t.room.disconnect('sock-host2');
    t.room.attachHost('sock-host3');
    assert.equal(t.room.isPaused, true, 'la pausa di Esc non si toglie da sola');
    t.room.destroy();
  });

  it('dopo 5 minuti senza TV i telefoni ricevono ROOM_CLOSED', () => {
    const t = makeRoom(3);
    const sent: string[] = [];
    (t.room as unknown as { io: unknown }).io = { to: () => ({ emit: (ev: string) => sent.push(ev) }) };
    assert.equal(t.room.start(t.ids[0]), null);
    t.room.disconnect('sock-host');
    mock.timers.tick(4 * 60_000);
    assert.equal(sent.includes('ROOM_CLOSED'), false);
    mock.timers.tick(61_000);
    assert.equal(sent.includes('ROOM_CLOSED'), true);
    t.room.destroy();
  });
});
