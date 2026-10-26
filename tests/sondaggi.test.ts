import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { SONDAGGI, type SondaggiPublic } from '../shared/sondaggi';
import { SONDAGGI_QUESTIONS } from '../server/shows/sondaggi/SondaggiShow';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Miniera dei Sondaggi', () => {
  it('le domande hanno esattamente 8 opzioni diverse', () => {
    for (const q of SONDAGGI_QUESTIONS) assert.equal(new Set(q.options).size, SONDAGGI.OPTIONS, q.text);
  });

  it('top 3 pesata (3/2/1) e punti 300/200/100 per le opzioni indovinate', () => {
    const t = makeRoom(3);
    startShow(t, 'sondaggi');
    assert.match(t.act(0, { type: 'poll', options: [0, 0, 1] }) ?? '', /diverse/);
    assert.match(t.act(0, { type: 'poll', options: [0, 1] }) ?? '', /diverse/);
    assert.match(t.act(0, { type: 'poll', options: [0, 1, 8] }) ?? '', /diverse/);
    t.act(0, { type: 'poll', options: [0, 1, 2] }); // 0:3 1:2 2:1
    t.act(1, { type: 'poll', options: [0, 2, 3] }); // 0:6 2:3 3:1
    t.act(2, { type: 'poll', options: [1, 2, 4] }); // 1:5 2:4 4:1 → top 0(6), 1(5), 2(4)
    mock.timers.tick(700);
    assert.equal(t.state<SondaggiPublic>().step, 'guess');
    t.act(0, { type: 'guess', options: [2, 1, 0] }); // tutta la top 3 → 600
    t.act(1, { type: 'guess', options: [0, 5, 6] }); // solo la prima → 300
    t.act(2, { type: 'guess', options: [5, 6, 7] }); // niente → 0
    mock.timers.tick(700);
    const r = t.state<SondaggiPublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.deepEqual(r.top, [0, 1, 2]);
    assert.deepEqual(r.results.map((x) => x.points), [600, 300, 0]);
    t.room.destroy();
  });

  it('partita con bot fino al menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'sondaggi');
    const steps = runToMenu(t);
    assert.equal(steps.filter((s) => s === 'reveal').length, SONDAGGI.ROUNDS);
  });
});
