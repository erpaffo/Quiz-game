// Test "a raffica": ogni gioco riceve payload assurdi a ogni passo. Il server non deve mai lanciare
// eccezioni, deve rispondere con un messaggio d'errore, e il gioco deve comunque arrivare al menù.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { SHOW_IDS, SHOWS } from '../shared/shows';
import { makeRoom, startShow, useFakeTime } from './helpers';

useFakeTime();

const TYPES = ['word', 'removeWord', 'done', 'answer', 'guess', 'lie', 'safety', 'choose', 'clue', 'ready', 'vote', 'poll', 'order', 'use', 'buy', 'revive', 'favorite', 'draw', 'title', 'survey', 'falsify', 'alibi', 'sort', 'year'];
const VALUES: unknown[] = [null, undefined, 0, -1, 1e12, NaN, '', ' ', 'x'.repeat(5000), [], [1, 2, 3], {}, { a: 1 }, true, 'left', 'potion', 'o1', 'w1', [[], []]];

function garbage(): unknown {
  const r = Math.random();
  if (r < 0.1) return VALUES[Math.floor(Math.random() * VALUES.length)];
  const payload: Record<string, unknown> = { type: TYPES[Math.floor(Math.random() * TYPES.length)] };
  for (const key of ['text', 'value', 'index', 'optionId', 'targetId', 'options', 'ids', 'item', 'side', 'wordId', 'frames', 'answers', 'questionIndex', 'promptId', 'questionId', 'optionIndex']) {
    if (Math.random() < 0.3) payload[key] = VALUES[Math.floor(Math.random() * VALUES.length)];
  }
  return payload;
}

describe('Robustezza: payload assurdi in tutti i giochi', () => {
  for (const id of SHOW_IDS.filter((s) => s !== 'quiz')) {
    it(`«${SHOWS[id].name}» resiste e arriva al menù`, () => {
      const humans = 3;
      const bots = Math.max(0, SHOWS[id].minPlayers - humans);
      const t = makeRoom(humans, bots);
      startShow(t, id);
      for (let elapsed = 0; elapsed < 60 * 60_000 && t.tv().phase !== 'LOBBY'; elapsed += 500) {
        for (let i = 0; i < humans; i++) {
          const res = t.act(i, garbage());
          assert.ok(res === null || typeof res === 'string');
        }
        mock.timers.tick(500);
      }
      assert.equal(t.tv().phase, 'LOBBY', 'il gioco deve terminare e tornare al menù');
      t.room.destroy();
    });
  }
});
