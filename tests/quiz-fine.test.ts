// Fine del quiz: come gli altri giochi del Pack, dopo il podio si torna da soli al menù dei giochi.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { CONFIG } from '../shared/config';
import type { GameContext } from '../server/games/types';
import { makeRoom, useFakeTime } from './helpers';

useFakeTime();

describe('Fine del quiz', () => {
  it('il podio resta per GAME_OVER ms, poi tutti tornano alla griglia con i personaggi', () => {
    const t = makeRoom(3);
    assert.equal(t.room.start(t.ids[0]), null);
    (t.room as unknown as { ctx: GameContext }).ctx.gameOver([...t.ids]);
    assert.equal(t.tv().phase, 'GAME_OVER');
    assert.ok(t.tv().endsAt, 'la TV mostra il conto alla rovescia del ritorno al menù');
    mock.timers.tick(CONFIG.DURATION.GAME_OVER - 100);
    assert.equal(t.tv().phase, 'GAME_OVER');
    mock.timers.tick(200);
    assert.equal(t.tv().phase, 'LOBBY');
    assert.equal(t.tv().menu?.view, 'grid');
    assert.equal(t.tv().players.length, 3);
    t.room.destroy();
  });
});
